// The advisor (spec G4.1, G4.6): once a day it looks at every company, raises the cards their
// situations call for, resolves cards past their deadline as No, and answers AI companies' operating
// cards. Only the player's cards get text and projected meters; AI companies choose from a table
// (ai/scoring.ts). Everything here is plain data saved with the session, and every draw comes from
// the world's AI stream, so a replay raises exactly the same cards.

import { actionCost, applyAction, type Action } from '../../engine/actions';
import { plantOf, total, wellOf } from '../../engine/companies';
import type { Agent, AgentId, Fill } from '../../engine/model';
import { nextFloat } from '../../engine/rng';
import { netWorth, type World } from '../../engine/world';
import { chooseForAi, AI_CARD_TYPES } from '../../ai/scoring';
import { cardText } from '../../content/cards';
import { CARD_DEFS, CATALOG, type CardContext, type CardDef, type OptionSpec, type Situation } from './catalog';
import { projectOptions } from './projection';
import { emptyMemory, type AdvisorMemory, type Card, type CardOption, type CardType, type Choice } from './types';

export interface ResolvedCard {
  readonly type: CardType;
  readonly agentId: string;
  readonly raisedTick: number;
  readonly tick: number;
  readonly choice: Choice;
  /** True when the deadline passed without an answer. */
  readonly expired: boolean;
}

export interface AdvisorState {
  memory: AdvisorMemory;
  /** Open cards raised for human players. */
  cards: Card[];
  /** Opportunities a player has opened and not yet answered or closed (spec G4.1). */
  opened: { readonly agentId: string; readonly type: CardType }[];
  /** `${agentId}:${type}` → the first tick that card type may be raised again. */
  cooldowns: Partial<Record<string, number>>;
  seq: number;
  /** Every answered or expired card, for pacing statistics (spec G4.7). */
  resolved: ResolvedCard[];
}

const SALES_KEPT = 30;
const WORTH_KEPT = 30;

export function createAdvisor(w: World): AdvisorState {
  const memory = emptyMemory();
  for (const a of w.agents) memory.startNetWorth[a.agentId] = netWorth(w, a);
  return { memory, cards: [], opened: [], cooldowns: {}, seq: 0, resolved: [] };
}

/** Whether a company is steered by a player (and so gets text and meters). */
const human = (a: Agent) => a.controller === 'HUMAN';

/**
 * One day of the advisor, run after the engine's step. Returns the cards raised today for players.
 */
export function advise(w: World, state: AdvisorState, fills: readonly Fill[]): Card[] {
  remember(w, state, fills);
  expire(w, state);
  const raised: Card[] = [];
  for (const me of w.agents) {
    if (me.insolvent) continue;
    if (human(me)) raised.push(...raiseFor(w, state, me));
    else answerAsAi(w, state, me);
  }
  for (const a of w.agents) {
    const plant = plantOf(a);
    state.memory.outageSeen[a.agentId] = plant !== undefined && plant.outageTicksRemaining > 0;
  }
  return raised;
}

// ─── Memory ──────────────────────────────────────────────────────────────────────────────────

function remember(w: World, state: AdvisorState, fills: readonly Fill[]): void {
  const m = state.memory;
  const humans = new Set(w.agents.filter(human).map((a) => a.agentId as string));
  for (const f of fills) {
    if (f.dealId === null && humans.has(f.sellerId)) {
      m.recentSales.push({ seller: f.sellerId, buyer: f.buyerId, qty: f.qty, chokepoints: [...f.route.chokepoints], tick: w.tick });
    }
  }
  m.recentSales = m.recentSales.filter((s) => w.tick - s.tick < SALES_KEPT);

  const held = new Set<string>();
  for (const c of w.cargo) {
    if (c.status !== 'HELD') continue;
    held.add(String(c.cargoId));
    m.heldSince[String(c.cargoId)] ??= w.tick;
  }
  for (const id of Object.keys(m.heldSince)) if (!held.has(id)) delete m.heldSince[id];

  const byRegion: Partial<Record<string, number>> = {};
  for (const a of w.agents) {
    const barrels = held_(a);
    byRegion[a.region] = (byRegion[a.region] ?? 0) + barrels;
  }
  m.storageByRegion.push({ tick: w.tick, byRegion });
  m.storageByRegion = m.storageByRegion.filter((s) => w.tick - s.tick <= w.config.REPORT_LAG);

  for (const a of w.agents) {
    if (!human(a)) continue;
    const history = (m.worth[a.agentId] ??= []);
    history.push(netWorth(w, a));
    if (history.length > WORTH_KEPT) history.splice(0, history.length - WORTH_KEPT);
  }
}

/** Crude a company holds in storage (not at sea). */
function held_(a: Agent): number {
  let sum = 0;
  sum += wellOf(a)?.storage ?? 0;
  const plant = plantOf(a);
  if (plant) sum += total(plant.crudeStock);
  if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) if (hub) sum += total(hub.stock);
  return sum;
}

// ─── Players ─────────────────────────────────────────────────────────────────────────────────

function context(w: World, state: AdvisorState, me: Agent): CardContext {
  return { w, me, memory: state.memory, roll: () => nextFloat(w.rng.ai) };
}

const cooldownKey = (agentId: string, type: CardType) => `${agentId}:${type}`;

function raiseFor(w: World, state: AdvisorState, me: Agent): Card[] {
  const ctx = context(w, state, me);
  const raised: Card[] = [];
  const mine = () => state.cards.filter((c) => c.agentId === me.agentId && !c.opportunity);
  for (const def of prioritized()) {
    if (!def.raised || !def.kinds.includes(me.kind)) continue;
    if (mine().length >= w.config.CARD_MAX_OPEN) break;
    if (mine().some((c) => c.type === def.type)) continue;
    const tender = def.type === 'BUYER_OFFERS_DEAL' || def.type === 'SUPPLIER_OFFERS_DEAL';
    const tenderDue = tender && state.memory.pendingTenders.some((t) => t.agentId === me.agentId && t.dueTick <= w.tick);
    if (!tenderDue && (state.cooldowns[cooldownKey(me.agentId, def.type)] ?? 0) > w.tick) continue;
    const s = def.detect(ctx);
    if (tender) state.memory.pendingTenders = state.memory.pendingTenders.filter((t) => t.agentId !== me.agentId || t.dueTick > w.tick);
    if (s === null) continue;
    if (tender) state.memory.lastOfferTick[me.agentId] = w.tick;
    // Merging (spec G4.1): a situation with an open card's cause updates that card instead.
    const same = state.cards.find((c) => c.agentId === me.agentId && c.key === s.key);
    const card = buildCard(w, state, me, def, s, ctx, same?.id ?? null);
    if (card === null) {
      // Not worth showing today; look again after the cooldown rather than re-projecting daily.
      state.cooldowns[cooldownKey(me.agentId, def.type)] = w.tick + w.config.CARD_COOLDOWN;
      continue;
    }
    if (same) {
      state.cards[state.cards.indexOf(same)] = card;
      continue;
    }
    state.cards.push(card);
    raised.push(card);
  }
  return raised;
}

/** Urgent operating cards first, so a full inbox never hides a breakdown. */
function prioritized(): CardDef[] {
  const urgent: CardType[] = ['BREAKDOWN', 'CASH_SHORT', 'STOCK_LOW', 'STORAGE_NEARLY_FULL', 'DEAL_CARGO_STUCK', 'CARGO_STUCK'];
  return [...urgent.map((t) => CARD_DEFS.get(t) as CardDef), ...CATALOG.filter((d) => !urgent.includes(d.type))];
}

function buildCard(w: World, state: AdvisorState, me: Agent, def: CardDef, s: Situation, ctx: CardContext, id: string | null): Card | null {
  const { yes, maybe } = def.options(ctx, s);
  if (yes.actions.length === 0 && yes.effect === undefined) return null;
  const specs: [Choice, OptionSpec][] = [['YES', yes]];
  if (maybe && (maybe.actions.length > 0 || maybe.effect !== undefined)) specs.push(['MAYBE', maybe]);
  specs.push(['NO', { actions: [] }]);
  const impacts = projectOptions(w, me.agentId, specs.map(([, o]) => o.actions));
  // A raised card offering only market orders that would not fill is not a decision (spec G4.7).
  // Other options can pay off beyond the projection (a well takes months), so they always show.
  const ordersOnly = specs.every(([, o]) => o.effect === undefined && o.actions.every((a) => a.kind === 'STANDING_ORDER'));
  const none = impacts[impacts.length - 1] ?? null;
  if (def.raised && ordersOnly && impacts.slice(0, -1).every((i) => sameImpact(i, none))) return null;
  const text = cardText(def.type, s.data);
  const options: CardOption[] = specs.map(([choice, o], i) => option(w, me, state, choice, choice === 'YES' ? text.yes : choice === 'MAYBE' ? text.maybe : text.no, o, impacts[i] ?? null));
  const opportunity = !def.raised;
  return {
    id: id ?? (opportunity ? `opp:${me.agentId}:${def.type}` : `c${String(state.seq++)}`),
    type: def.type, agentId: me.agentId, key: s.key, title: text.title, situation: text.situation,
    details: details(s), options, raisedTick: w.tick,
    deadline: opportunity ? null : w.tick + w.config.CARD_DEADLINE, opportunity,
  };
}

/** Whether two options would look the same on the card. */
function sameImpact(a: CardOption['impact'], b: CardOption['impact']): boolean {
  if (a === null || b === null) return false;
  return a.cash === b.cash && Math.abs(a.profit - b.profit) < 500 && a.risk === b.risk
    && Math.abs(a.supply.value - b.supply.value) <= 0.01 * Math.max(1, Math.abs(b.supply.value));
}

function option(w: World, me: Agent, state: AdvisorState, choice: Choice, label: string, o: OptionSpec, impact: CardOption['impact']): CardOption {
  const totalCost = o.actions.reduce((sum, a) => sum + actionCost(w, me.agentId, a).total, 0);
  const available = me.cash - me.cashReserved + me.creditLimit - me.creditDrawn;
  const affordable = totalCost <= available;
  let affordableInDays: number | null = null;
  if (!affordable) {
    const history = state.memory.worth[me.agentId] ?? [];
    const first = history[0];
    const last = history[history.length - 1];
    const perDay = first !== undefined && last !== undefined && history.length > 1 ? (last - first) / (history.length - 1) : 0;
    affordableInDays = perDay > 0 ? Math.ceil((totalCost - available) / perDay) : null;
  }
  return { choice, label, actions: o.actions, impact, totalCost, affordable, affordableInDays, effect: o.effect ?? null };
}

function details(s: Situation): string {
  return Object.entries(s.data)
    .filter(([k]) => !k.endsWith('Id') && !k.endsWith('Num') && k !== 'terms' && k !== 'tender' && k !== 'half')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

/** Cards past their deadline resolve as No (spec G4.1). */
function expire(w: World, state: AdvisorState): void {
  for (const card of [...state.cards]) {
    if (card.deadline !== null && w.tick >= card.deadline) resolve(w, state, card, 'NO', true);
  }
}

function resolve(w: World, state: AdvisorState, card: Card, choice: Choice, expired: boolean): void {
  state.cards = state.cards.filter((c) => c.id !== card.id);
  state.opened = state.opened.filter((o) => !(o.agentId === card.agentId && o.type === card.type));
  if (!card.opportunity) state.cooldowns[cooldownKey(card.agentId, card.type)] = w.tick + w.config.CARD_COOLDOWN;
  state.resolved.push({ type: card.type, agentId: card.agentId, raisedTick: card.raisedTick, tick: w.tick, choice, expired });
}

// ─── Answers ─────────────────────────────────────────────────────────────────────────────────

/** Why a player cannot give this answer now, or null if they can. */
export function answerProblem(state: AdvisorState, agentId: AgentId, cardId: string, choice: Choice): string | null {
  const card = state.cards.find((c) => c.id === cardId && c.agentId === agentId);
  if (!card) return 'That card is no longer open';
  const o = card.options.find((x) => x.choice === choice);
  if (!o) return `This card has no ${choice} option`;
  if (!o.affordable) return 'Not enough money yet';
  return null;
}

/**
 * Applies a player's answer at the start of a tick. Options were fixed when the card was shown; an
 * action the world no longer allows is skipped, and the rest still apply.
 */
export function answer(w: World, state: AdvisorState, agentId: AgentId, cardId: string, choice: Choice): string[] {
  const card = state.cards.find((c) => c.id === cardId && c.agentId === agentId);
  if (!card) return ['That card is no longer open'];
  const o = card.options.find((x) => x.choice === choice);
  const problems = o ? apply(w, agentId, o.actions) : [];
  if (o?.effect) effect(w, state, agentId, o.effect);
  resolve(w, state, card, choice, false);
  return problems;
}

function apply(w: World, agentId: AgentId, actions: readonly Action[]): string[] {
  const problems: string[] = [];
  for (const a of actions) {
    try {
      applyAction(w, agentId, a);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  return problems;
}

function effect(w: World, state: AdvisorState, agentId: AgentId, e: NonNullable<CardOption['effect']>): void {
  const m = state.memory;
  if ('tender' in e) {
    const { min, max } = w.config.TENDER_DELAY;
    const due = w.tick + min + Math.floor(nextFloat(w.rng.ai) * (max - min + 1));
    m.pendingTenders.push({ agentId, dueTick: due, termDays: e.tender });
    return;
  }
  const oldest = m.storageByRegion[0];
  if (!oldest) return;
  const byRegion: Partial<Record<string, number>> = {};
  for (const [region, qty] of Object.entries(oldest.byRegion)) {
    const noise = 1 + w.config.REPORT_NOISE * (2 * nextFloat(w.rng.ai) - 1);
    byRegion[region] = Math.round((qty ?? 0) * noise);
  }
  m.reports.push({ tick: w.tick, agentId, asOf: oldest.tick, byRegion });
}

/** A free market report (a campaign reward, spec G7.2). */
export function grantReport(w: World, state: AdvisorState, agentId: AgentId): void {
  effect(w, state, agentId, { report: true });
}

// ─── Opportunities ───────────────────────────────────────────────────────────────────────────

/** Opportunities a company could open today (spec G4.1). */
export function availableOpportunities(w: World, state: AdvisorState, me: Agent): CardType[] {
  const ctx = context(w, state, me);
  return CATALOG.filter((d) => d.opportunity && d.kinds.includes(me.kind) && d.detect(ctx) !== null).map((d) => d.type);
}

/** Opens an Opportunity as a card. It has no deadline and stays until answered or closed. */
export function openOpportunity(w: World, state: AdvisorState, me: Agent, type: CardType): Card | null {
  const def = CARD_DEFS.get(type);
  if (!def || !def.opportunity || !def.kinds.includes(me.kind)) return null;
  const ctx = context(w, state, me);
  const s = def.detect(ctx);
  if (s === null) return null;
  const card = buildCard(w, state, me, def, s, ctx, null);
  if (card === null) return null;
  state.cards = state.cards.filter((c) => c.id !== card.id);
  state.cards.push(card);
  if (!state.opened.some((o) => o.agentId === me.agentId && o.type === type)) state.opened.push({ agentId: me.agentId, type });
  return card;
}

/** Closes an open Opportunity without acting. */
export function closeOpportunity(state: AdvisorState, agentId: AgentId, cardId: string): void {
  state.cards = state.cards.filter((c) => !(c.id === cardId && c.agentId === agentId && c.opportunity));
  state.opened = state.opened.filter((o) => `opp:${o.agentId}:${o.type}` !== cardId);
}

/** Refreshes open Opportunities each day, so their meters follow the world. */
export function refreshOpportunities(w: World, state: AdvisorState): void {
  for (const o of [...state.opened]) {
    const me = w.agents.find((a) => a.agentId === o.agentId);
    if (!me || openOpportunity(w, state, me, o.type) === null) {
      state.opened = state.opened.filter((x) => x !== o);
      state.cards = state.cards.filter((c) => c.id !== `opp:${o.agentId}:${o.type}`);
    }
  }
}

// ─── AI companies ────────────────────────────────────────────────────────────────────────────

/** AI companies receive the same operating cards and answer at once (spec G4.6). */
function answerAsAi(w: World, state: AdvisorState, me: Agent): void {
  const ctx = context(w, state, me);
  for (const type of AI_CARD_TYPES) {
    const def = CARD_DEFS.get(type as CardType);
    if (!def || !def.kinds.includes(me.kind)) continue;
    const key = cooldownKey(me.agentId, def.type);
    if ((state.cooldowns[key] ?? 0) > w.tick) continue;
    const s = def.detect(ctx);
    if (s === null) continue;
    const { yes, maybe } = def.options(ctx, s);
    const hasMaybe = maybe !== null && maybe.actions.length > 0;
    const choice = chooseForAi(def.type, me.personality, hasMaybe, nextFloat(w.rng.ai));
    const actions = choice === 'YES' ? yes.actions : choice === 'MAYBE' && maybe ? maybe.actions : [];
    const affordable = actions.reduce((sum, a) => sum + actionCost(w, me.agentId, a).total, 0) <= me.cash - me.cashReserved + me.creditLimit - me.creditDrawn;
    if (affordable) apply(w, me.agentId, actions);
    state.cooldowns[key] = w.tick + w.config.CARD_COOLDOWN;
  }
}
