// Campaign scenarios (spec G7.2): the scenario's setup and script, the daily tracking its goal
// types need, milestones and their rewards, and the result. A scenario ends as soon as its goal can
// no longer be met, when the company goes bankrupt, or at its time limit.

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { applyAction } from '../engine/actions';
import { plantOf, total, wellOf } from '../engine/companies';
import type { Agent, AgentId, Fill } from '../engine/model';
import { nextFloat, rngFor } from '../engine/rng';
import type { DealDelivery } from '../engine/deals';
import { netWorth, type World } from '../engine/world';
import { EVENT_PROFILES, type EventProfile } from '../content/events';
import { SCENARIO_BY_ID, type Condition, type ScenarioData, type ScenarioId, type ScriptEntry } from '../content/scenarios';
import { grantReport, type AdvisorState } from './cards/advisor';
import { planFor, type PlannedStage, type ScriptedEvent } from './events';

export type ConditionStatus = 'MET' | 'PENDING' | 'FAILED';

export interface CampaignState {
  readonly id: ScenarioId;
  readonly lengthDays: number;
  /** Every company's net worth when the scenario began, for growth comparisons. */
  readonly start: Partial<Record<string, number>>;
  /** Every company's extraction plus refining capacity at the start, bbl/day (0 for traders). */
  readonly capacity: Partial<Record<string, number>>;
  /** The player's net worth every 30 days, starting with day 0. */
  monthly: number[];
  /** Net worth at the start of each PROFIT window. */
  windowStart: Partial<Record<number, number>>;
  stockoutDays: number;
  maxHeld: number;
  deals: string[];
  ever: { drilling: boolean; reservation: boolean; lease: boolean };
  /** Market reports the player has bought or been given. */
  reports: number;
  /** Barrels sold each day while the export-share strait is closed. */
  exportsDuring: number[];
  /** Conditions already met for good (streaks, "by day N" targets). */
  sticky: string[];
  milestones: boolean[];
  result: 'WON' | 'LOST' | null;
  reason: string;
}

export interface CampaignView {
  readonly id: ScenarioId;
  readonly title: string;
  readonly goal: string;
  readonly daysLeft: number;
  readonly conditions: readonly { readonly label: string; readonly status: ConditionStatus; readonly progress: string }[];
  readonly milestones: readonly { readonly label: string; readonly done: boolean; readonly reward: string }[];
  readonly result: 'WON' | 'LOST' | null;
  readonly reason: string;
}

export function scenario(id: ScenarioId): ScenarioData {
  const s = SCENARIO_BY_ID.get(id);
  if (!s) throw new Error(`No scenario ${id}`);
  return s;
}

/** Applies a scenario's starting changes to the player's company (before the game begins). */
export function applySetup(w: World, s: ScenarioData, me: Agent): void {
  if (s.setup?.cash !== undefined) {
    (w.totals as { startingCash: number }).startingCash += s.setup.cash - me.cash;
    me.cash = s.setup.cash;
  }
  const plant = plantOf(me);
  if (plant && s.setup?.techTier !== undefined) plant.techTier = s.setup.techTier;
  if (plant && s.setup?.stockDays !== undefined) {
    const want = s.setup.stockDays * plant.processingCapacity;
    const grade = plant.techTier === 1 ? 'LIGHT_SWEET' : 'MEDIUM';
    const added = want - total(plant.crudeStock);
    if (added > 0) {
      plant.crudeStorageCapacity = Math.max(plant.crudeStorageCapacity, want);
      plant.crudeStock[grade] += added;
      (w.totals as { startingBarrels: number }).startingBarrels += added;
    }
  }
}

export function createCampaign(w: World, s: ScenarioData, lengthDays: number): CampaignState {
  const start: Partial<Record<string, number>> = {};
  const capacity: Partial<Record<string, number>> = {};
  for (const a of w.agents) {
    start[a.agentId] = netWorth(w, a);
    capacity[a.agentId] = (wellOf(a)?.extractionCapacity ?? 0) + (plantOf(a)?.processingCapacity ?? 0);
  }
  const me = w.agents.find((a) => a.controller === 'HUMAN') as Agent;
  return {
    id: s.id, lengthDays, start, capacity, monthly: [start[me.agentId] ?? 0], windowStart: { 0: start[me.agentId] ?? 0 },
    stockoutDays: 0, maxHeld: 0, deals: [], ever: { drilling: false, reservation: false, lease: false }, reports: 0,
    exportsDuring: [], sticky: [], milestones: s.milestones.map(() => false), result: null, reason: '',
  };
}

/**
 * The scenario's script as deck events, plus, in the finale, a second chokepoint event drawn from
 * the other six that arrives without warning (spec G7.2 ★).
 */
export function scriptFor(s: ScenarioData, seed: string): ScriptedEvent[] {
  const out: ScriptedEvent[] = [];
  for (const e of s.script) {
    if ('stages' in e) out.push({ tick: e.tick, chokepoint: e.chokepoint, plan: e.stages.map((st) => ({ stage: st.stage, days: st.days, status: st.status, delay: st.delay ?? 0, surcharge: st.surcharge ?? 0 })) });
    else if ('engine' in e) out.push({ tick: e.tick, engine: e.engine, ...(e.news ? { news: e.news } : {}) });
  }
  if (s.id === 'FINALE') {
    const rng = rngFor(`${seed}:finale`, 'events');
    const others = (Object.keys(CHOKEPOINTS) as ChokepointName[]).filter((c) => c !== 'HORMUZ');
    const c = others[Math.floor(nextFloat(rng) * others.length)] as ChokepointName;
    const profile: EventProfile = EVENT_PROFILES[c as keyof typeof EVENT_PROFILES];
    let plan: PlannedStage[] = planFor(profile, rng, null).filter((p) => p.stage === 'DISRUPTION' || p.stage === 'RECOVERY');
    if (plan.length === 0) plan = [{ stage: 'DISRUPTION', days: profile.disruption.days[1], status: profile.disruption.status, delay: profile.disruption.delay[1], surcharge: profile.surcharge }];
    out.push({ tick: 700 + Math.floor(nextFloat(rng) * 60), chokepoint: c, plan });
  }
  return out;
}

/** Scripted company actions due at the tick about to run (e.g. rivals drilling, a starting deal). */
export function scriptedActions(w: World, s: ScenarioData): void {
  const tick = w.tick + 1;
  for (const e of s.script as readonly ScriptEntry[]) {
    if (!('action' in e) || e.tick !== tick) continue;
    const company = w.agents.find((a) => a.agentId === e.company || (e.company === 'player' && a.controller === 'HUMAN'));
    if (!company) continue;
    try {
      applyAction(w, company.agentId, e.action);
    } catch {
      // A scripted action the world cannot take (a rival already drilling) is skipped.
    }
  }
}

/**
 * How well a company has done, comparable across sizes: profit per barrel a day of starting capacity
 * for producers and refiners (a small field and a giant one earn the same per barrel), and growth in
 * net worth for traders, whose size is their capital.
 */
function performance(c: CampaignState, w: World, a: Agent): number {
  const gain = netWorth(w, a) - (c.start[a.agentId] ?? 0);
  const size = c.capacity[a.agentId] ?? 0;
  return size > 0 ? gain / size : gain / Math.max(1, c.start[a.agentId] ?? 1);
}
const perBarrel = (x: number) => `$${Math.round(x).toLocaleString('en-US')} per bbl/day`;

/** One day of tracking, after the engine's step. */
export function campaignDay(w: World, c: CampaignState, advisor: AdvisorState, fills: readonly Fill[], deliveries: readonly DealDelivery[]): void {
  if (c.result !== null) return;
  const s = scenario(c.id);
  const me = w.agents.find((a) => a.controller === 'HUMAN') as Agent;
  const worth = netWorth(w, me);
  const tick = w.tick;
  if (tick % 30 === 0) c.monthly.push(worth);
  for (const cond of [...s.goal, ...s.milestones.map((m) => m.condition)]) {
    if (cond.kind === 'PROFIT' && cond.from !== undefined && tick === cond.from) c.windowStart[cond.from] = worth;
  }

  const plant = plantOf(me);
  if (plant && plant.online && plant.maintenanceTicksRemaining === 0 && total(plant.crudeStock) < 1) c.stockoutDays++;
  for (const cargo of w.cargo) {
    if (cargo.ownerId !== me.agentId || cargo.status !== 'HELD') continue;
    c.maxHeld = Math.max(c.maxHeld, tick - (advisor.memory.heldSince[String(cargo.cargoId)] ?? tick));
  }
  for (const d of w.deals) if ((d.buyerId === me.agentId || d.sellerId === me.agentId) && !c.deals.includes(d.dealId)) c.deals.push(d.dealId);
  c.ever.drilling ||= w.projects.some((p) => p.agentId === me.agentId && p.kind === 'DRILL');
  c.ever.reservation ||= w.reservations.some((r) => r.agentId === me.agentId);
  c.ever.lease ||= w.leases.some((l) => l.agentId === me.agentId);
  c.reports = advisor.memory.reports.filter((r) => r.agentId === me.agentId).length;

  const share = s.goal.find((g) => g.kind === 'EXPORT_SHARE');
  if (share) {
    // Exports only: crude sold to buyers in the company's own region never crosses the strait.
    const mine = new Set(w.deals.filter((d) => d.sellerId === me.agentId && d.deliveryRegion !== me.region).map((d) => d.dealId));
    const sold = fills.filter((f) => f.sellerId === me.agentId && f.deliveryRegion !== me.region).reduce((sum, f) => sum + f.qty, 0)
      + deliveries.filter((d) => mine.has(d.dealId)).reduce((sum, d) => sum + d.delivered - d.held, 0);
    const status = w.graph.chokepoints[share.chokepoint].status;
    if (status === 'CLOSED') c.exportsDuring.push(sold);
  }

  // Milestones and their rewards.
  s.milestones.forEach((m, i) => {
    if (c.milestones[i] || evaluate(m.condition, c, w, me, false, `m${i}`).status !== 'MET') return;
    c.milestones[i] = true;
    if ('cash' in m.reward) {
      (w.totals as { startingCash: number }).startingCash += m.reward.cash;
      me.cash += m.reward.cash;
    } else {
      grantReport(w, advisor, me.agentId);
    }
  });

  // The result.
  if (me.insolvent) {
    c.result = 'LOST';
    c.reason = 'Your company ran out of cash and credit.';
    return;
  }
  const final = tick >= c.lengthDays;
  const statuses = s.goal.map((g, i) => evaluate(g, c, w, me, final, `g${i}`));
  const failed = statuses.findIndex((x) => x.status === 'FAILED');
  if (failed >= 0) {
    c.result = 'LOST';
    c.reason = `Goal missed: ${statuses[failed]?.progress ?? ''}`;
  } else if (final) {
    c.result = statuses.every((x) => x.status === 'MET') ? 'WON' : 'LOST';
    c.reason = c.result === 'WON' ? 'Every goal met.' : 'Time ran out before every goal was met.';
  }
}

const usd = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

/** Where a condition stands. Goals decide some conditions only at the end; milestones any day. */
export function evaluate(cond: Condition, c: CampaignState, w: World, me: Agent, final: boolean, key: string): { status: ConditionStatus; progress: string } {
  const tick = w.tick;
  const start = c.start[me.agentId] ?? 0;
  const worth = netWorth(w, me);
  const sticky = (met: boolean) => {
    if (met && !c.sticky.includes(key)) c.sticky.push(key);
    return c.sticky.includes(key);
  };
  switch (cond.kind) {
    case 'NET_WORTH': {
      const target = cond.times * start;
      const progress = `Net worth ${usd(worth)} of ${usd(target)}`;
      if (key.startsWith('m')) return { status: sticky(worth >= target) ? 'MET' : 'PENDING', progress };
      return { status: final ? (worth >= target ? 'MET' : 'FAILED') : 'PENDING', progress };
    }
    case 'PROFIT': {
      const from = cond.from ?? 0;
      const to = cond.to ?? c.lengthDays;
      const base = c.windowStart[from];
      const profit = base === undefined ? 0 : worth - base;
      const progress = base === undefined ? `Profit counted from day ${from}` : `Profit ${usd(profit)} of ${usd(cond.atLeast)}`;
      if (tick < to && !final) return { status: 'PENDING', progress };
      return { status: profit >= cond.atLeast ? 'MET' : 'FAILED', progress };
    }
    case 'PROFITABLE_MONTHS': {
      let streak = 0;
      let best = 0;
      for (let i = 1; i < c.monthly.length; i++) {
        streak = (c.monthly[i] ?? 0) > (c.monthly[i - 1] ?? 0) ? streak + 1 : 0;
        best = Math.max(best, streak);
      }
      const met = sticky(best >= cond.months);
      return { status: met ? 'MET' : final ? 'FAILED' : 'PENDING', progress: `Profitable months in a row: ${Math.min(streak, cond.months)} of ${cond.months}` };
    }
    case 'STOCKOUT_DAYS': {
      const progress = `Days out of crude: ${c.stockoutDays} (at most ${cond.atMost})`;
      if (c.stockoutDays > cond.atMost) return { status: 'FAILED', progress };
      return { status: final ? 'MET' : 'PENDING', progress };
    }
    case 'SOLVENT': {
      const ever = w.insolvencies[me.agentId as AgentId] !== undefined;
      return { status: ever ? 'FAILED' : final ? 'MET' : 'PENDING', progress: ever ? 'Ran out of cash and credit' : 'Solvent so far' };
    }
    case 'OWN': {
      const have = cond.what === 'DEAL' ? c.deals.length
        : cond.what === 'OFFICES' ? (me.kind === 'TRADER' ? me.offices.length : 0)
        : cond.what === 'TIER' ? (plantOf(me)?.techTier ?? 0)
        : cond.what === 'INTEGRATED' ? (me.kind === 'INTEGRATED' ? 1 : 0)
        : cond.what === 'DRILLING' ? Number(c.ever.drilling)
        : cond.what === 'RESERVATION' ? Number(c.ever.reservation)
        : cond.what === 'LEASE' ? Number(c.ever.lease)
        : c.reports;
      const reports = have;
      const met = sticky(reports >= cond.atLeast && (cond.by === undefined || tick <= cond.by));
      const late = cond.by !== undefined && tick > cond.by;
      const label = { DEAL: 'Deals signed', OFFICES: 'Offices', TIER: 'Refinery tier', INTEGRATED: 'Own refinery', DRILLING: 'Wells drilled', RESERVATION: 'Pipeline reserved', LEASE: 'Storage leased', REPORT: 'Reports bought' }[cond.what];
      return { status: met ? 'MET' : late || final ? 'FAILED' : 'PENDING', progress: `${label}: ${reports} of ${cond.atLeast}${cond.by !== undefined ? ` by day ${cond.by}` : ''}` };
    }
    case 'AHEAD_OF': {
      const rival = w.agents.find((a) => a.agentId === cond.rival);
      if (!rival) return { status: 'MET', progress: 'Rival gone' };
      const mine = performance(c, w, me);
      const theirs = performance(c, w, rival);
      const progress = `Your profit ${perBarrel(mine)} vs ${rival.name} ${perBarrel(theirs)}`;
      return { status: final ? (mine > theirs ? 'MET' : 'FAILED') : 'PENDING', progress };
    }
    case 'RANK_FIRST': {
      const kind = me.kind === 'INTEGRATED' ? 'PRODUCER' : me.kind;
      const rivals = w.agents.filter((a) => a !== me && (a.kind === kind || (kind === 'PRODUCER' && a.kind === 'INTEGRATED')));
      const mine = performance(c, w, me);
      const rank = 1 + rivals.filter((a) => performance(c, w, a) > mine).length;
      return { status: final ? (rank === 1 ? 'MET' : 'FAILED') : 'PENDING', progress: `Rank ${rank} of ${rivals.length + 1}` };
    }
    case 'EXPORT_SHARE': {
      // Barrels sold while the strait is closed, against what the company's wells could pump:
      // steadier than its recent sales, which arrive in whole cargoes.
      const avg = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
      const capacity = c.capacity[me.agentId] ?? 0;
      const during = avg(c.exportsDuring);
      const share = capacity > 0 ? during / capacity : 0;
      const progress = c.exportsDuring.length === 0 ? 'Exports while closed: not yet' : `Exports while closed: ${pct(share)} of your output (need ${pct(cond.atLeast)})`;
      if (!final) return { status: 'PENDING', progress };
      return { status: c.exportsDuring.length === 0 || share >= cond.atLeast ? 'MET' : 'FAILED', progress };
    }
    case 'MAX_HELD_DAYS': {
      const progress = `Longest wait at sea: ${c.maxHeld} days (at most ${cond.atMost})`;
      if (c.maxHeld > cond.atMost) return { status: 'FAILED', progress };
      return { status: final ? 'MET' : 'PENDING', progress };
    }
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function campaignView(w: World, c: CampaignState): CampaignView {
  const s = scenario(c.id);
  const me = w.agents.find((a) => a.controller === 'HUMAN') as Agent;
  const final = c.result !== null || w.tick >= c.lengthDays;
  return {
    id: c.id, title: s.title, goal: s.goalText, daysLeft: Math.max(0, c.lengthDays - w.tick),
    conditions: s.goal.map((g, i) => ({ label: `Goal ${i + 1}`, ...evaluate(g, { ...c, sticky: [...c.sticky] }, w, me, final && w.tick >= c.lengthDays, `g${i}`) })),
    milestones: s.milestones.map((m, i) => ({ label: m.label, done: c.milestones[i] ?? false, reward: 'cash' in m.reward ? `$${Math.round(m.reward.cash / 1000)}K` : 'a free market report' })),
    result: c.result, reason: c.reason,
  };
}
