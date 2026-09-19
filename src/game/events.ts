// Staged events and news (spec G7.1). The deck lives in the game layer: each day, before the engine
// steps, it starts events, moves them through RUMOR → TENSION → DISRUPTION → RECOVERY, and
// schedules the chokepoint changes for the engine to apply. Projections fork the world without the
// deck, so they never see an event coming (G4.5).

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { REGIONS, type RegionName } from '../data/regions';
import type { ChokepointStatus } from '../engine/enums';
import { nextFloat, rngFor, type Rng } from '../engine/rng';
import { findRoute } from '../engine/transport';
import type { ScheduledEvent, World } from '../engine/world';
import { BYPASS_CONFLICTS, EVENT_PROFILES, priceMove, strait, type EventProfile, type Range, type Stage } from '../content/events';
import type { Difficulty } from './newgame';
import type { DailyPrices } from './view';

export interface PlannedStage {
  readonly stage: Stage;
  readonly days: number;
  /** The chokepoint's status during the stage; null leaves it unchanged (a rumour). */
  readonly status: ChokepointStatus | null;
  readonly delay: number;
  readonly surcharge: number;
}

export interface ActiveEvent {
  readonly id: string;
  readonly chokepoint: ChokepointName;
  readonly plan: readonly PlannedStage[];
  index: number;
  stageEnds: number;
  readonly startedTick: number;
  readonly scripted: boolean;
}

export interface NewsItem {
  readonly tick: number;
  readonly headline: string;
  readonly body: string;
}

/** A scenario's scripted event: a staged chokepoint event, or any engine event with its news. */
export type ScriptedEvent =
  | { readonly tick: number; readonly chokepoint: ChokepointName; readonly plan: readonly PlannedStage[] }
  | { readonly tick: number; readonly engine: ScheduledEvent; readonly news?: { readonly headline: string; readonly body: string } };

export interface DeckState {
  rng: Rng;
  /** Whether random events are drawn (Sandbox and the finale); scenarios may script only. */
  random: boolean;
  difficulty: Difficulty;
  active: ActiveEvent[];
  past: { readonly chokepoint: ChokepointName; readonly start: number; readonly end: number; readonly worst: ChokepointStatus }[];
  seq: number;
  news: NewsItem[];
  /** Chokepoints the player's company depends on (deck rule 3). */
  relevant: ChokepointName[];
  lastPriceNews: Partial<Record<string, number>>;
}

/** Event frequency and warning by difficulty (spec G8). */
export const DECK_DIFFICULTY: Readonly<Record<Difficulty, { readonly rate: number; readonly rumor: Range; readonly conflicts: boolean }>> = {
  EASY: { rate: 0.5, rumor: [10, 15], conflicts: false },
  NORMAL: { rate: 1, rumor: [5, 10], conflicts: false },
  HARD: { rate: 1.5, rumor: [2, 4], conflicts: true },
};

const NEWS_KEPT = 60;
const PRICE_NEWS_MOVE = 0.1;
const PRICE_NEWS_DAYS = 7;
const PRICE_NEWS_GAP = 14;
/** Day of the year by which the relevance rule forces an event if none has touched the player. */
const RELEVANCE_DAY = 240;

export function createDeck(w: World, seed: string, difficulty: Difficulty, random: boolean, playerRegions: readonly RegionName[], playerKind: string): DeckState {
  return {
    rng: rngFor(`${seed}:deck`, 'events'), random, difficulty, active: [], past: [], seq: 0, news: [],
    relevant: relevantChokepoints(w, playerRegions, playerKind), lastPriceNews: {},
  };
}

/** Straits on the default routes between the player's regions and its trading partners' regions. */
export function relevantChokepoints(w: World, from: readonly RegionName[], kind: string): ChokepointName[] {
  const role = kind === 'PRODUCER' ? 'REFINING' : kind === 'REFINER' ? 'PRODUCTION' : null;
  const partners = (Object.keys(REGIONS) as RegionName[]).filter((r) => role === null || (REGIONS[r].roles as readonly string[]).includes(role));
  const found = new Set<ChokepointName>();
  for (const a of from) {
    for (const b of partners) {
      if (a === b) continue;
      const route = kind === 'REFINER' ? findRoute(w.graph, b, a) : findRoute(w.graph, a, b);
      for (const c of route?.chokepoints ?? []) found.add(c);
    }
  }
  return (Object.keys(CHOKEPOINTS) as ChokepointName[]).filter((c) => found.has(c));
}

const between = (rng: Rng, [lo, hi]: Range) => lo + Math.floor(nextFloat(rng) * (hi - lo + 1));
const dayOfYear = (tick: number) => ((tick % 365) + 365) % 365;

function inSeason(season: Range | null, tick: number): boolean {
  if (season === null) return true;
  const d = dayOfYear(tick);
  const [a, b] = season;
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

function seasonLength(season: Range | null): number {
  if (season === null) return 365;
  const [a, b] = season;
  return a <= b ? b - a + 1 : 365 - a + b + 1;
}

/** A random event's stages, all drawn when it starts (spec G7.1 profiles). */
export function planFor(profile: EventProfile, rng: Rng, rumor: Range | null): PlannedStage[] {
  const plan: PlannedStage[] = [];
  if (!profile.sudden && rumor !== null) plan.push({ stage: 'RUMOR', days: between(rng, rumor), status: null, delay: 0, surcharge: 0 });
  if (profile.tension) plan.push({ stage: 'TENSION', days: between(rng, profile.tension), status: 'TENSION', delay: 0, surcharge: profile.surcharge });
  const escalates = profile.tension === null || nextFloat(rng) < profile.escalate;
  if (!escalates) return plan;
  const alt = profile.alternative;
  const d = alt !== null && nextFloat(rng) < alt.share ? alt.disruption : profile.disruption;
  plan.push({ stage: 'DISRUPTION', days: between(rng, d.days), status: d.status, delay: between(rng, d.delay), surcharge: profile.surcharge });
  if (d.status === 'CLOSED' && profile.recovery) plan.push({ stage: 'RECOVERY', days: between(rng, profile.recovery), status: 'DELAYED', delay: 2, surcharge: 0 });
  return plan;
}

function schedule(w: World, e: ScheduledEvent): void {
  const at = w.events.findIndex((x) => x.tick > e.tick);
  if (at === -1) w.events.push(e);
  else w.events.splice(at, 0, e);
}

function addNews(deck: DeckState, item: NewsItem): void {
  deck.news.push(item);
  if (deck.news.length > NEWS_KEPT) deck.news.splice(0, deck.news.length - NEWS_KEPT);
}

function enterStage(w: World, deck: DeckState, ev: ActiveEvent, tick: number): void {
  const s = ev.plan[ev.index] as PlannedStage;
  ev.stageEnds = tick + s.days;
  if (s.status !== null) schedule(w, { tick, kind: 'CHOKEPOINT', chokepoint: ev.chokepoint, status: s.status, delayTicks: s.delay, surcharge: s.surcharge });
  const status = s.status === 'CLOSED' || s.status === 'DELAYED' ? s.status : null;
  addNews(deck, { tick, ...strait(ev.chokepoint, CHOKEPOINTS[ev.chokepoint].displayName, s.stage, status) });
}

function start(w: World, deck: DeckState, chokepoint: ChokepointName, plan: readonly PlannedStage[], tick: number, scripted: boolean): void {
  if (plan.length === 0) return;
  const ev: ActiveEvent = { id: `e${String(deck.seq++)}`, chokepoint, plan, index: 0, stageEnds: tick, startedTick: tick, scripted };
  deck.active.push(ev);
  enterStage(w, deck, ev, tick);
}

function finish(w: World, deck: DeckState, ev: ActiveEvent, tick: number): void {
  deck.active = deck.active.filter((e) => e !== ev);
  const statuses = ev.plan.map((s) => s.status).filter((s): s is ChokepointStatus => s !== null);
  const rank = (s: ChokepointStatus) => ['OPEN', 'TENSION', 'DELAYED', 'CLOSED'].indexOf(s);
  const worst = statuses.reduce<ChokepointStatus>((a, b) => (rank(b) > rank(a) ? b : a), 'OPEN');
  deck.past.push({ chokepoint: ev.chokepoint, start: ev.startedTick, end: tick, worst });
  if (worst !== 'OPEN') {
    schedule(w, { tick, kind: 'CHOKEPOINT', chokepoint: ev.chokepoint, status: 'OPEN' });
    addNews(deck, { tick, ...strait(ev.chokepoint, CHOKEPOINTS[ev.chokepoint].displayName, 'CLEARED', null) });
  }
}

function conflicts(deck: DeckState, c: ChokepointName): boolean {
  if (DECK_DIFFICULTY[deck.difficulty].conflicts) return false;
  const busy = new Set(deck.active.filter((e) => e.plan.some((s) => s.stage === 'DISRUPTION')).map((e) => e.chokepoint as string));
  return BYPASS_CONFLICTS.some(([a, b]) => (a === c && busy.has(b)) || (b === c && busy.has(a)));
}

/**
 * One day of the deck, before the engine steps into `tick`: scripted events, stage changes, random
 * draws and the relevance rule. Engine changes are scheduled for `tick`.
 */
export function deckDay(w: World, deck: DeckState, script: readonly ScriptedEvent[]): void {
  const tick = w.tick + 1;
  for (const s of script) {
    if (s.tick !== tick) continue;
    if ('engine' in s) {
      schedule(w, { ...s.engine, tick });
      if (s.news) addNews(deck, { tick, ...s.news });
    } else if (!deck.active.some((e) => e.chokepoint === s.chokepoint)) {
      start(w, deck, s.chokepoint, s.plan, tick, true);
    }
  }

  for (const ev of [...deck.active]) {
    if (tick < ev.stageEnds) continue;
    ev.index++;
    if (ev.index >= ev.plan.length) finish(w, deck, ev, tick);
    else enterStage(w, deck, ev, tick);
  }

  if (!deck.random) return;
  const d = DECK_DIFFICULTY[deck.difficulty];
  for (const c of Object.keys(EVENT_PROFILES) as ChokepointName[]) {
    const profile: EventProfile = EVENT_PROFILES[c as keyof typeof EVENT_PROFILES];
    const roll = nextFloat(deck.rng);
    if (!inSeason(profile.season, tick) || deck.active.some((e) => e.chokepoint === c) || conflicts(deck, c)) continue;
    if (roll < (profile.rate * d.rate) / seasonLength(profile.season)) start(w, deck, c, planFor(profile, deck.rng, d.rumor), tick, false);
  }

  // Rule 3: each year touches a strait the player depends on.
  if (dayOfYear(tick) === RELEVANCE_DAY && deck.relevant.length > 0) {
    const yearStart = tick - RELEVANCE_DAY;
    const touched = [...deck.past, ...deck.active.map((e) => ({ chokepoint: e.chokepoint, start: e.startedTick }))]
      .some((e) => e.start >= yearStart && deck.relevant.includes(e.chokepoint));
    const candidates = deck.relevant.filter((c) => EVENT_PROFILES[c as keyof typeof EVENT_PROFILES].season === null && !deck.active.some((e) => e.chokepoint === c) && !conflicts(deck, c));
    if (!touched && candidates.length > 0) {
      const c = candidates[Math.floor(nextFloat(deck.rng) * candidates.length)] as ChokepointName;
      start(w, deck, c, planFor(EVENT_PROFILES[c as keyof typeof EVENT_PROFILES], deck.rng, d.rumor), tick, false);
    }
  }
}

const GRADE_WORDS: Readonly<Record<string, string>> = { NYMEX: 'Light crude', NC: 'Medium crude', DME: 'Heavy crude' };

/** News when a crude price moves sharply over a week (spec G7.1), at most once a fortnight per grade. */
export function priceNews(deck: DeckState, history: readonly DailyPrices[]): void {
  const today = history[history.length - 1];
  const before = history[history.length - 1 - PRICE_NEWS_DAYS];
  if (!today || !before) return;
  for (const [node, price] of Object.entries(today.markers)) {
    const then = (before.markers as Readonly<Record<string, number>>)[node];
    if (then === undefined || then <= 0) continue;
    const change = price / then - 1;
    if (Math.abs(change) < PRICE_NEWS_MOVE || today.tick - (deck.lastPriceNews[node] ?? -Infinity) < PRICE_NEWS_GAP) continue;
    deck.lastPriceNews[node] = today.tick;
    addNews(deck, { tick: today.tick, ...priceMove(GRADE_WORDS[node] ?? node, change, PRICE_NEWS_DAYS) });
  }
}
