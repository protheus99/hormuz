// GameSession: the only way the interface talks to the engine (spec G9).
//
// Every method is asynchronous although the engine runs synchronously in-process, so moving it
// into a Web Worker or behind a server later is a transport change, not a rewrite. The session owns
// the world, the replay log of commands, the public price history and the alerts. The clock lives
// in the client: it calls advance() at the chosen speed, and advance() stops early on an auto-pause.

import type { AgentId } from '../engine/model';
import { step, type World } from '../engine/world';
import { rngFor, type Rng } from '../engine/rng';
import { leaseShapeFor, newLease } from '../engine/leases';
import { wellOf } from '../engine/companies';
import { nameGround } from '../data/leasenames';
import type { Lease } from '../engine/model';
import type { Grade } from '../engine/enums';
import { DEFAULT_CONFIG, type Config } from '../engine/config';
import {
  advise, availableOpportunities, closeOpportunity, createAdvisor, openOpportunity, refreshOpportunities, type AdvisorState,
} from './cards/advisor';
import type { Card, CardType } from './cards/types';
import { createDeck, deckDay, priceNews, type DeckState, type ScriptedEvent } from './events';
import { applySetup, campaignDay, campaignView, createCampaign, scenario, scriptedActions, scriptFor, type CampaignState } from './campaign';
import { cardText } from '../content/cards';
import { detectAlerts, pausesAt, rememberForAlerts, type Alert, type AlertMemory, type Severity } from './alerts';
import { applyCommand, rejectReason, type Command, type CommandResult, type LoggedCommand } from './commands';
import { newGameWorld, PLAYER_ID, type GameSettings } from './newgame';
import { buildPlayerView, dailyPrices, dayLog, sizesNow, type DailyPrices, type DayLog, type PlayerView } from './view';

/** Clock speeds (spec G3): days per second of real time is speed ÷ 2 at the default pace. */
export const SPEEDS = [0, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];
/** Real milliseconds a day takes at ×1 (spec G3: about two seconds; tunable). */
export const MS_PER_DAY_AT_X1 = 2000;

/** How long the client should wait between days at a speed; Infinity when paused. */
export function msPerDay(speed: Speed): number {
  return speed === 0 ? Number.POSITIVE_INFINITY : MS_PER_DAY_AT_X1 / speed;
}

/** Alerts kept for the view; older ones drop off. */
const ALERTS_KEPT = 100;
/** Days of the player's own trading kept for the Activity tab. */
const DAYS_KEPT = 120;

export interface AdvanceResult {
  /** The tick the world is now at. */
  readonly tick: number;
  readonly ticksRun: number;
  /** The alert that stopped the clock early, or null if every requested day ran. */
  readonly pausedBy: Alert | null;
  /** Cards raised on the last day run; any new card stops the clock (spec G3). */
  readonly newCards: readonly Card[];
  readonly ended: boolean;
}

/** Everything needed to restore a game exactly (spec G9): a versioned plain-JSON snapshot. */
export interface SaveData {
  readonly version: 2;
  readonly settings: GameSettings;
  readonly world: World;
  readonly log: readonly LoggedCommand[];
  readonly history: readonly DailyPrices[];
  /** The player's own recent days. Absent in saves written before it existed, which start it afresh. */
  readonly days?: readonly DayLog[];
  /** A month of company sizes, for the leaderboard's trend. Absent in older saves. */
  readonly sizes?: readonly Record<string, number>[];
  readonly alerts: readonly Alert[];
  readonly memory: AlertMemory;
  readonly seq: number;
  readonly pauseAt: Severity;
  readonly advisor: AdvisorState;
  readonly deck: DeckState;
  /** Scripted events (campaign scenarios); empty in Sandbox. */
  readonly script: readonly ScriptedEvent[];
  readonly campaign: CampaignState | null;
}

export class GameSession {
  private state: {
    settings: GameSettings;
    world: World;
    log: LoggedCommand[];
    history: DailyPrices[];
    days: DayLog[];
    /** Every company's size a month ago, so the leaderboard can show which way each is going. */
    sizes: Record<string, number>[];
    alerts: Alert[];
    memory: AlertMemory;
    seq: number;
    pauseAt: Severity;
    advisor: AdvisorState;
    deck: DeckState;
    script: readonly ScriptedEvent[];
    campaign: CampaignState | null;
  };

  private constructor(data: SaveData) {
    const copy = structuredClone(data);
    this.state = {
      settings: copy.settings, world: copy.world, log: [...copy.log], history: [...copy.history], days: [...(copy.days ?? [])],
      sizes: [...(copy.sizes ?? [])],
      alerts: [...copy.alerts], memory: copy.memory, seq: copy.seq, pauseAt: copy.pauseAt, advisor: copy.advisor,
      deck: copy.deck, script: copy.script, campaign: copy.campaign,
    };
  }

  /** Starts a new game (spec G2, G9). */
  static async newGame(requested: GameSettings): Promise<GameSession> {
    const sc = requested.scenario !== undefined ? scenario(requested.scenario) : null;
    const settings: GameSettings = sc === null ? requested : {
      ...requested,
      playType: sc.playType ?? requested.playType,
      region: sc.region ?? requested.region,
      lengthDays: sc.lengthDays,
      difficulty: sc.difficulty,
      ...(sc.setup?.techTier === 1 || sc.setup?.techTier === 2 ? { techTier: sc.setup.techTier } : {}),
      ...(sc.setup?.secondOffice !== undefined ? { secondOffice: sc.setup.secondOffice } : {}),
    };
    const world = newGameWorld(settings);
    // In a game, operating decisions (maintenance, output cuts) are cards for every company (G4.6).
    world.cardsActive = true;
    // A scenario's end is the engine's horizon: a reckoning falls harder on a company running out
    // of time (§12A.6), and that is all the engine needs to know about campaigns.
    world.horizon = (settings.lengthDays ?? null) as typeof world.horizon;
    const me = world.agents.find((a) => a.agentId === PLAYER_ID);
    if (sc && me) applySetup(world, sc, me);
    const regions = me?.kind === 'TRADER' ? me.offices : me ? [me.region] : [];
    return new GameSession({
      version: 2, settings, world, log: [], history: [dailyPrices(world)], days: [], sizes: [], alerts: [],
      memory: rememberForAlerts(world, PLAYER_ID), seq: 0, pauseAt: 'HIGH', advisor: createAdvisor(world),
      deck: createDeck(world, settings.seed, settings.difficulty ?? 'NORMAL', sc?.randomEvents ?? true, regions, me?.kind ?? 'PRODUCER'),
      script: sc ? scriptFor(sc, settings.seed) : [],
      campaign: sc ? createCampaign(world, sc, sc.lengthDays) : null,
    });
  }

  /** Restores a saved game exactly. */
  static async load(data: SaveData): Promise<GameSession> {
    if (data.version !== 2) throw new Error(`This save is version ${String(data.version)}; this game reads version 2`);
    // A save carries the world's settings as they were. A later version may have added one the save
    // has no value for — and a missing number quietly turns every sum that touches it into NaN — so
    // anything absent takes today's default, which is what the game would have used in any case.
    const world = data.world as { config: Config; rng: { wells?: Rng } };
    world.config = { ...DEFAULT_CONFIG, ...world.config };
    // The daily swing in what fields pump draws from its own stream, seeded from the game's seed,
    // so a save written before it existed carries on the same way every time it is loaded.
    if (world.rng.wells === undefined) world.rng.wells = rngFor(data.settings.seed, 'wells');
    // A save written before producers held leases has a field but no ground under it (§12A): give
    // it the lease that field would have been drilled on, at the size it is pumping today.
    const named = new Set<string>();
    data.world.agents.forEach((agent, index) => {
      const field = wellOf(agent) as { leases?: Lease[]; extractionCapacity: number; grade: Grade; baseExtractionCost: number } | undefined;
      if (field === undefined) return;
      for (const l of field.leases ?? []) named.add(l.name);
      if (field.leases !== undefined) return;
      const shape = leaseShapeFor(field.extractionCapacity);
      const name = nameGround(named, index * 7, agent.region);
      named.add(name);
      field.leases = [newLease({
        id: `${agent.agentId}-L1`, name, region: agent.region,
        grade: field.grade, capacity: field.extractionCapacity, band: shape.band,
        baseExtractionCost: field.baseExtractionCost, acquiredFor: 0, wells: shape.wells, maxWells: shape.maxWells,
      })];
    });
    return new GameSession(data);
  }

  /**
   * Rebuilds a game from its settings and command log (spec G9), up to `toTick`. Commands apply at
   * the ticks they were stamped with, so the result is identical however fast the game was played.
   */
  static async replay(settings: GameSettings, log: readonly LoggedCommand[], toTick: number): Promise<GameSession> {
    const session = await GameSession.newGame(settings);
    session.state.log = [...log];
    session.state.seq = log.reduce((max, c) => Math.max(max, c.seq + 1), 0);
    while (session.state.world.tick < toTick) session.runDay();
    return session;
  }

  /** What the player may see (spec G5). */
  async getView(playerId: AgentId = PLAYER_ID): Promise<PlayerView> {
    const s = this.state;
    const me = s.world.agents.find((a) => a.agentId === playerId);
    const cards = {
      cards: s.advisor.cards.filter((c) => c.agentId === playerId),
      opportunities: (me ? availableOpportunities(s.world, s.advisor, me) : []).map((type) => ({ type, title: cardText(type, {}).title })),
      reports: s.advisor.memory.reports.filter((r) => r.agentId === playerId),
      news: [...s.deck.news].reverse(),
      campaign: s.campaign ? campaignView(s.world, s.campaign) : null,
    };
    return structuredClone(buildPlayerView(s.world, playerId, s.history, s.days, s.alerts, s.settings.lengthDays ?? null, cards, s.sizes[0] ?? {}));
  }

  /**
   * Opens an Opportunity as a card at once (spec G4.1). Opening changes nothing in the world, so it
   * is not a command; answering it is.
   */
  async openOpportunity(playerId: AgentId, type: CardType): Promise<Card | null> {
    const me = this.state.world.agents.find((a) => a.agentId === playerId);
    if (!me || me.controller !== 'HUMAN') return null;
    return structuredClone(openOpportunity(this.state.world, this.state.advisor, me, type));
  }

  /** Closes an open Opportunity without acting. */
  async closeOpportunity(playerId: AgentId, cardId: string): Promise<void> {
    closeOpportunity(this.state.advisor, playerId, cardId);
  }

  /** Validates a command and queues it for the start of the next tick (spec G3, G9 rule 2). */
  async submit(playerId: AgentId, command: Command): Promise<CommandResult> {
    const s = this.state;
    if (this.ended()) return { ok: false, reason: 'The game has ended' };
    const reason = rejectReason(s.world, playerId, command, s.advisor);
    if (reason !== null) return { ok: false, reason };
    const appliesAt = s.world.tick + 1;
    s.log.push({ tick: appliesAt, seq: s.seq++, playerId, command: structuredClone(command) });
    return { ok: true, appliesAt };
  }

  /** Runs up to `ticks` days, stopping early on an auto-pause (spec G3). */
  async advance(ticks: number): Promise<AdvanceResult> {
    let ran = 0;
    let pausedBy: Alert | null = null;
    let newCards: Card[] = [];
    while (ran < ticks && !this.ended()) {
      const day = this.runDay();
      ran++;
      newCards = day.cards;
      pausedBy = day.alerts.find((a) => pausesAt(a, this.state.pauseAt)) ?? null;
      if (pausedBy !== null || newCards.length > 0) break;
    }
    return { tick: this.state.world.tick, ticksRun: ran, pausedBy, newCards: structuredClone(newCards), ended: this.ended() };
  }

  /** The alert severity at which the clock pauses (critical alerts always pause). Not game state. */
  async setPauseLevel(level: Severity): Promise<void> {
    this.state.pauseAt = level;
  }

  async save(): Promise<SaveData> {
    const s = this.state;
    return structuredClone({
      version: 2 as const, settings: s.settings, world: s.world, log: s.log, history: s.history, days: s.days, sizes: s.sizes,
      alerts: s.alerts, memory: s.memory, seq: s.seq, pauseAt: s.pauseAt, advisor: s.advisor,
      deck: s.deck, script: s.script, campaign: s.campaign,
    });
  }

  /** The replay log so far: every accepted command with the tick it applies at. */
  async commandLog(): Promise<readonly LoggedCommand[]> {
    return structuredClone(this.state.log);
  }

  /** One day: this tick's commands, the engine's step, the cards, the price history and the alerts. */
  private runDay(): { alerts: Alert[]; cards: Card[] } {
    const s = this.state;
    const tick = s.world.tick + 1;
    const problems: string[] = [];
    for (const entry of s.log.filter((c) => c.tick === tick).sort((a, b) => a.seq - b.seq)) problems.push(...applyCommand(s.world, entry, s.advisor));
    deckDay(s.world, s.deck, s.script);
    if (s.campaign) scriptedActions(s.world, scenario(s.campaign.id));
    const report = step(s.world);
    s.days.push(dayLog(s.world, PLAYER_ID, report));
    if (s.days.length > DAYS_KEPT) s.days.splice(0, s.days.length - DAYS_KEPT);
    // A month of sizes is all the leaderboard's trend needs.
    s.sizes.push(sizesNow(s.world));
    if (s.sizes.length > 31) s.sizes.splice(0, s.sizes.length - 31);
    const cards = advise(s.world, s.advisor, report.fills);
    refreshOpportunities(s.world, s.advisor);
    s.history.push(dailyPrices(s.world));
    priceNews(s.deck, s.history);
    const decided = s.campaign?.result ?? null;
    if (s.campaign) campaignDay(s.world, s.campaign, s.advisor, report.fills, report.deliveries);
    const alerts = detectAlerts(s.world, PLAYER_ID, s.memory);
    for (const p of problems) alerts.push({ tick: s.world.tick, severity: 'MEDIUM', message: `Part of your decision could not be carried out: ${p}` });
    for (const c of cards) if (c.agentId === PLAYER_ID) alerts.push({ tick: s.world.tick, severity: 'INFO', message: `New decision: ${c.title}` });
    s.memory = rememberForAlerts(s.world, PLAYER_ID);
    if (s.campaign && decided === null && s.campaign.result !== null) {
      alerts.push({ tick: s.world.tick, severity: 'CRITICAL', message: `${s.campaign.result === 'WON' ? 'Scenario won' : 'Scenario lost'}: ${s.campaign.reason}` });
    } else if (this.ended()) alerts.push({ tick: s.world.tick, severity: 'CRITICAL', message: 'The game has ended.' });
    s.alerts.push(...alerts);
    if (s.alerts.length > ALERTS_KEPT) s.alerts.splice(0, s.alerts.length - ALERTS_KEPT);
    return { alerts, cards };
  }

  private ended(): boolean {
    if (this.state.campaign?.result) return true;
    const length = this.state.settings.lengthDays;
    return length !== undefined && length !== null && this.state.world.tick >= length;
  }
}
