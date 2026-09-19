// GameSession: the only way the interface talks to the engine (spec G9).
//
// Every method is asynchronous although the engine runs synchronously in-process, so moving it
// into a Web Worker or behind a server later is a transport change, not a rewrite. The session owns
// the world, the replay log of commands, the public price history and the alerts. The clock lives
// in the client: it calls advance() at the chosen speed, and advance() stops early on an auto-pause.

import type { AgentId } from '../engine/model';
import { step, type World } from '../engine/world';
import {
  advise, availableOpportunities, closeOpportunity, createAdvisor, openOpportunity, refreshOpportunities, type AdvisorState,
} from './cards/advisor';
import type { Card, CardType } from './cards/types';
import { cardText } from '../content/cards';
import { detectAlerts, pausesAt, rememberForAlerts, type Alert, type AlertMemory, type Severity } from './alerts';
import { applyCommand, rejectReason, type Command, type CommandResult, type LoggedCommand } from './commands';
import { newGameWorld, PLAYER_ID, type GameSettings } from './newgame';
import { buildPlayerView, dailyPrices, type DailyPrices, type PlayerView } from './view';

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
  readonly alerts: readonly Alert[];
  readonly memory: AlertMemory;
  readonly seq: number;
  readonly pauseAt: Severity;
  readonly advisor: AdvisorState;
}

export class GameSession {
  private state: {
    settings: GameSettings;
    world: World;
    log: LoggedCommand[];
    history: DailyPrices[];
    alerts: Alert[];
    memory: AlertMemory;
    seq: number;
    pauseAt: Severity;
    advisor: AdvisorState;
  };

  private constructor(data: SaveData) {
    const copy = structuredClone(data);
    this.state = {
      settings: copy.settings, world: copy.world, log: [...copy.log], history: [...copy.history],
      alerts: [...copy.alerts], memory: copy.memory, seq: copy.seq, pauseAt: copy.pauseAt, advisor: copy.advisor,
    };
  }

  /** Starts a new game (spec G2, G9). */
  static async newGame(settings: GameSettings): Promise<GameSession> {
    const world = newGameWorld(settings);
    // In a game, operating decisions (maintenance, output cuts) are cards for every company (G4.6).
    world.cardsActive = true;
    return new GameSession({
      version: 2, settings, world, log: [], history: [dailyPrices(world)], alerts: [],
      memory: rememberForAlerts(world, PLAYER_ID), seq: 0, pauseAt: 'HIGH', advisor: createAdvisor(world),
    });
  }

  /** Restores a saved game exactly. */
  static async load(data: SaveData): Promise<GameSession> {
    if (data.version !== 2) throw new Error(`This save is version ${String(data.version)}; this game reads version 2`);
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
    };
    return structuredClone(buildPlayerView(s.world, playerId, s.history, s.alerts, s.settings.lengthDays ?? null, cards));
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
      version: 2 as const, settings: s.settings, world: s.world, log: s.log, history: s.history,
      alerts: s.alerts, memory: s.memory, seq: s.seq, pauseAt: s.pauseAt, advisor: s.advisor,
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
    const report = step(s.world);
    const cards = advise(s.world, s.advisor, report.fills);
    refreshOpportunities(s.world, s.advisor);
    s.history.push(dailyPrices(s.world));
    const alerts = detectAlerts(s.world, PLAYER_ID, s.memory);
    for (const p of problems) alerts.push({ tick: s.world.tick, severity: 'MEDIUM', message: `Part of your decision could not be carried out: ${p}` });
    for (const c of cards) if (c.agentId === PLAYER_ID) alerts.push({ tick: s.world.tick, severity: 'INFO', message: `New decision: ${c.title}` });
    s.memory = rememberForAlerts(s.world, PLAYER_ID);
    if (this.ended()) alerts.push({ tick: s.world.tick, severity: 'CRITICAL', message: 'The game has ended.' });
    s.alerts.push(...alerts);
    if (s.alerts.length > ALERTS_KEPT) s.alerts.splice(0, s.alerts.length - ALERTS_KEPT);
    return { alerts, cards };
  }

  private ended(): boolean {
    const length = this.state.settings.lengthDays;
    return length !== undefined && length !== null && this.state.world.tick >= length;
  }
}
