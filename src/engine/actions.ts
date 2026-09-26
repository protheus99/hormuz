// Actions: the one-off changes a decision card can make to a company (spec G4.4). A card option
// carries a list of actions; answering the card applies them at the start of the next tick. The
// engine keeps no card logic — detectors, text and projections live in the game layer — only what
// each action does to the world and what it costs.

import { internalTransfer, refreshCapacity, startMaintenance, wages } from './agents';
import { bestLeaseToDrill, drawFrom, drillWell, tankOf } from './leases';
import { buySurvey, mayWork, placeBid, taintLot } from './auction';
import { addExposure, escapeCost, takeEscape, type CornerKind, type EscapeKind, type ExposureTarget } from './exposure';
import { charterCost, newCharter } from './charters';
import {
  acceptedGrades, averageCost, CLOSED_TO_NEW_REFINING, integrate, integrationPlant, plantAt, plantCost, plantOf, plantsOf, secondPlant, secondPlantSpec, total, wellOf,
} from './companies';
import type { Config } from './config';
import { cancelDeal, signDeal, type DealTerms } from './deals';
import { FeeKind, type Grade, type Side } from './enums';
import { recordFee } from './economics';
import {
  asEdgeId, makeDealId, WellStatus, type Agent, type AgentId, type CharterSize, type ChokepointName, type DealId, type NodeName, type PlantState, type RegionName, type Tick, type Well,
} from './model';
import { setReservation } from './transport';
import type { World } from './world';
import { LANES } from '../data/lanes';
import { NODE_FOR_GRADE } from '../data/nodes';
import { REGIONS } from '../data/regions';

export type ProjectKind = 'DRILL' | 'STORAGE' | 'TIER' | 'UNIT' | 'REFINERY';

/** A capital project under way, paid for in daily instalments while it is built. */
export interface CapitalProject {
  readonly id: string;
  readonly agentId: AgentId;
  readonly kind: ProjectKind;
  readonly steps: number;
  readonly totalCost: number;
  readonly dailyCost: number;
  /** Where it is built. Only a refiner's second refinery is ever away from home (D34). */
  readonly region: RegionName;
  ticksLeft: number;
  /** Paused (no work, no payment) until this tick. */
  heldUntil: number;
}

/** An order a company places every day until `untilTick`, beside its rules' orders. */
export interface StandingOrder {
  readonly agentId: AgentId;
  readonly side: Side;
  readonly node: NodeName;
  readonly region: RegionName;
  readonly price: number;
  readonly qty: number;
  readonly untilTick: Tick;
}

/** Leased storage (spec §7.4): capacity added in a region for a daily fee, until `untilTick`. */
export interface Lease {
  readonly agentId: AgentId;
  readonly region: RegionName;
  readonly capacity: number;
  readonly rate: number;
  readonly untilTick: Tick;
  /**
   * Set once the term has run out with crude still standing in the space: the company keeps it for
   * `LEASE_GRACE_TICKS` more days at `LEASE_GRACE_MULTIPLIER` times the rate, and then it goes for
   * good (spec §7.4). Absent in saves written before the grace existed, which reads as not in it.
   */
  readonly grace?: boolean;
}

/** A pipeline reservation (spec G4.4 "Closure risk on exports"), until `untilTick`. */
export interface ReservationRecord {
  readonly agentId: AgentId;
  readonly edgeId: string;
  readonly qty: number;
  readonly untilTick: Tick;
}

export type Action =
  | { readonly kind: 'SET_OUTPUT'; readonly rate: number }
  | { readonly kind: 'START_PROJECT'; readonly project: ProjectKind; readonly steps: number; readonly region?: RegionName; readonly site?: number }
  | { readonly kind: 'HOLD_PROJECTS'; readonly days: number }
  | { readonly kind: 'SET_RUN_CAP'; readonly cap: number; readonly days: number; readonly site?: number }
  | { readonly kind: 'RUN_FLAT_OUT'; readonly days: number; readonly site?: number }
  | { readonly kind: 'MAINTAIN_NOW'; readonly site?: number }
  | { readonly kind: 'SCHEDULE_MAINTENANCE'; readonly inDays: number; readonly site?: number }
  | { readonly kind: 'DEFER_MAINTENANCE'; readonly days: number; readonly site?: number }
  | { readonly kind: 'EMERGENCY_REPAIR'; readonly site?: number }
  | { readonly kind: 'PARTIAL_RESTART'; readonly share: number; readonly site?: number }
  | { readonly kind: 'CRUDE_MIX'; readonly grade: Grade | null; readonly weight: 'ALL' | 'HALF'; readonly site?: number }
  | { readonly kind: 'DRAW_CREDIT'; readonly amount: number }
  | { readonly kind: 'STANDING_ORDER'; readonly side: Side; readonly node: NodeName; readonly region: RegionName; readonly price: number; readonly qty: number; readonly days: number }
  | { readonly kind: 'SIGN_DEAL'; readonly terms: DealTerms }
  | { readonly kind: 'CANCEL_DEAL'; readonly dealId: DealId }
  | { readonly kind: 'REROUTE_DEAL'; readonly dealId: DealId; readonly avoid: readonly ChokepointName[]; readonly half: boolean }
  | { readonly kind: 'RESERVE_PIPELINE'; readonly edgeId: string; readonly qty: number }
  | { readonly kind: 'LEASE'; readonly region: RegionName; readonly capacity: number; readonly days: number }
  /** Keeps space already leased in a region for longer, rather than renting a second lot of it. */
  | { readonly kind: 'RENEW_LEASE'; readonly region: RegionName; readonly days: number }
  | { readonly kind: 'OPEN_OFFICE'; readonly region: RegionName }
  | { readonly kind: 'SELL_AT_SEA'; readonly share: number }
  | { readonly kind: 'CHARTER'; readonly size: CharterSize; readonly days: number }
  | { readonly kind: 'KEEP_AFLOAT'; readonly days: number }
  | { readonly kind: 'BID_LEASE'; readonly lotId: string; readonly amount: number }
  | { readonly kind: 'ESCAPE'; readonly escape: EscapeKind }
  | { readonly kind: 'SERVICE_WELLS'; readonly count: number }
  | { readonly kind: 'HOLD_SERVICES'; readonly days: number }
  | { readonly kind: 'RESTATE_RESERVES'; readonly uplift: number }
  | { readonly kind: 'GRANT_LICENCE'; readonly region: RegionName }
  | { readonly kind: 'BUY_SURVEY'; readonly lotId: string; readonly price: number; readonly saved: number }
  | { readonly kind: 'TAINTED_BID'; readonly lotId: string; readonly amount: number; readonly saved: number }
  | { readonly kind: 'CUT_CORNER'; readonly amount: number; readonly saved: number; readonly target: ExposureTarget; readonly because: CornerKind }
  | { readonly kind: 'PAY'; readonly amount: number; readonly what: 'REPORT' | 'CLEANUP' | 'FAVOUR' };

export type ActionKind = Action['kind'];

/** New office hubs start with this much storage, bbl. */
export const OFFICE_HUB_CAPACITY = 200_000;

/**
 * The wells a company would pull off next, longest since their last service first, and what pulling
 * them costs. Used by the card that offers to do it and by the action that does.
 */
function dueForService(a: Agent, count: number): { wells: Well[]; cost: number } {
  const wells = (wellOf(a)?.leases ?? [])
    .flatMap((l) => l.wells)
    .filter((x) => x.status === WellStatus.PUMPING)
    .sort((x, y) => y.daysSinceMaintenance - x.daysSinceMaintenance)
    .slice(0, Math.max(0, count));
  return { wells, cost: wells.reduce((sum, x) => sum + x.rate, 0) * 30 };
}

/** What an action costs: `now` leaves cash at once; `total` includes instalments to come. */
export function actionCost(w: World, agentId: AgentId, action: Action): { readonly now: number; readonly total: number } {
  const a = find(w, agentId);
  const cfg = w.config;
  const labor = wages(a.region, w.sink.climate, cfg);
  switch (action.kind) {
    case 'START_PROJECT': {
      const total = projectCost(w, a, action.project, action.steps);
      return { now: 0, total };
    }
    case 'MAINTAIN_NOW': {
      const plant = plantOf(a);
      const now = plant ? cfg.MAINT_COST * plant.processingCapacity : 0;
      return { now, total: now };
    }
    case 'EMERGENCY_REPAIR': {
      const plant = plantOf(a);
      const now = plant ? cfg.EMERGENCY_REPAIR_COST * plant.processingCapacity : 0;
      return { now, total: now };
    }
    case 'SET_OUTPUT': {
      const well = wellOf(a);
      const now = well && well.shutIn && action.rate >= cfg.SHUT_IN_THRESHOLD ? cfg.RESTART_COST * well.extractionCapacity : 0;
      return { now, total: now };
    }
    case 'RESERVE_PIPELINE': {
      const now = cfg.RESERVATION_COST * action.qty * labor;
      return { now, total: now };
    }
    case 'LEASE': {
      const rate = leaseRate(w, action.region);
      return { now: 0, total: rate * action.capacity * action.days };
    }
    case 'RENEW_LEASE': {
      const soonest = endingSoonest(w, agentId, action.region);
      return { now: 0, total: soonest === undefined ? 0 : leaseRate(w, action.region) * soonest.capacity * action.days };
    }
    case 'OPEN_OFFICE':
      return { now: cfg.OFFICE_COST.OPEN, total: cfg.OFFICE_COST.OPEN };
    case 'CHARTER':
      // The hire is paid by the day, so nothing leaves today.
      return { now: 0, total: charterCost(cfg, action.size, action.days) };
    case 'KEEP_AFLOAT':
      return { now: 0, total: 0 };
    case 'BID_LEASE':
      // Nothing leaves until the lot is awarded, and only if this bid is the one that takes it.
      return { now: 0, total: action.amount };
    case 'ESCAPE': {
      const cost = escapeCost(a, action.escape, cfg, (w.tick + 1) as Tick, w.horizon === null ? null : w.horizon - w.tick);
      return { now: cost, total: cost };
    }
    case 'PAY':
      return { now: action.amount, total: action.amount };
    case 'SERVICE_WELLS': {
      const due = dueForService(a, action.count);
      return { now: due.cost, total: due.cost };
    }
    case 'BUY_SURVEY':
      return { now: action.price, total: action.price };
    case 'TAINTED_BID':
      // Nothing leaves until the lot is awarded, and only if this bid is the one that takes it.
      return { now: 0, total: action.amount };
    case 'STANDING_ORDER':
      return action.side === 'BID' ? { now: 0, total: action.price * action.qty * action.days } : { now: 0, total: 0 };
    case 'SIGN_DEAL':
      return action.terms.buyerId === agentId ? { now: 0, total: action.terms.price * action.terms.qtyPerDay * action.terms.termDays } : { now: 0, total: 0 };
    case 'CANCEL_DEAL': {
      const deal = w.deals.find((d) => d.dealId === action.dealId);
      if (!deal) return { now: 0, total: 0 };
      const daysLeft = Math.max(0, deal.endTick - Math.max(w.tick + 1, deal.startTick));
      const fee = cfg.CANCEL_RATE * deal.price * deal.qtyPerDay * daysLeft;
      return { now: fee, total: fee };
    }
    default:
      return { now: 0, total: 0 };
  }
}

/**
 * Applies an action for a company, at the start of a tick (spec §5 phase 0). Throws with a plain
 * reason if the action no longer fits the company — a card's options are built to be valid, so
 * this only happens if the world changed in between, and the session reports it.
 */
export function applyAction(w: World, agentId: AgentId, action: Action): void {
  const a = find(w, agentId);
  const cfg = w.config;
  const tick = w.tick + 1;   // the tick about to run
  const well = wellOf(a);
  const plant = plantOf(a);
  /** The refinery an action names: site 0 is home, site 1 a refiner's second refinery (D34). */
  const siteOf = (site: number | undefined): PlantState | undefined => plantsOf(a)[site ?? 0];
  const need = <T>(x: T | undefined | null, what: string): T => {
    if (x === undefined || x === null) throw new Error(`${a.name} has no ${what}`);
    return x;
  };

  switch (action.kind) {
    case 'SET_OUTPUT': {
      const w_ = need(well, 'wells');
      if (!(action.rate >= 0 && action.rate <= 1)) throw new Error('Output rate must be 0–1');
      w_.extractionRate = action.rate;
      if (action.rate < cfg.SHUT_IN_THRESHOLD) {
        w_.shutIn = true;
        w_.rampTicksRemaining = 0;
      } else if (w_.shutIn) {
        charge(w, a, cfg.RESTART_COST * w_.extractionCapacity, FeeKind.RESTART, tick);
        w_.shutIn = false;
        w_.rampTicksRemaining = cfg.RAMP_TICKS;
      }
      return;
    }
    case 'START_PROJECT': {
      const where = action.region ?? a.region;
      const totalCost = projectCost(w, a, action.project, action.steps);
      const ticks = projectTicks(cfg, action.project);
      if (action.project === 'TIER') {
        const p = need(plant, 'refinery');
        if (p.techTier >= 3) throw new Error(`${a.name} is already Tier 3`);
        if (w.projects.some((x) => x.agentId === agentId && x.kind === 'TIER')) throw new Error(`${a.name} is already upgrading`);
        p.worksTicksRemaining = ticks;
        p.worksFactor = cfg.WORKS_CAPACITY_FACTOR;
      }
      if (action.project === 'REFINERY') {
        if (a.kind !== 'PRODUCER' && a.kind !== 'REFINER') throw new Error(`${a.name} cannot build a refinery`);
        if (a.kind === 'REFINER' && a.second !== null) throw new Error(`${a.name} already has a second refinery`);
        if (CLOSED_TO_NEW_REFINING.includes(where)) throw new Error(`No new refineries may be built in ${where} (spec §10.3)`);
        if (!(REGIONS[where].roles as readonly string[]).includes('REFINING')) throw new Error(`${where} has no refining role`);
        if (a.kind === 'REFINER' && where === a.region) throw new Error(`${a.name} already refines in ${where}`);
        if (w.projects.some((x) => x.agentId === agentId && x.kind === 'REFINERY')) throw new Error(`${a.name} is already building a refinery`);
      }
      if (action.project === 'UNIT') need(plant, 'refinery');
      if (action.project === 'DRILL') need(well, 'wells');
      w.projects.push({
        id: `${agentId}-${action.project}-${tick}`, agentId, kind: action.project, steps: action.steps,
        totalCost, dailyCost: totalCost / ticks, region: where, ticksLeft: ticks, heldUntil: 0,
      });
      return;
    }
    case 'HOLD_PROJECTS':
      for (const p of w.projects) if (p.agentId === agentId) p.heldUntil = tick + action.days;
      return;
    case 'SET_RUN_CAP': {
      const p = need(siteOf(action.site), 'refinery');
      p.utilizationCap = Math.max(0, Math.min(1, action.cap));
      p.utilization = Math.min(p.utilization, p.utilizationCap);
      p.utilizationCapUntil = w.tick + action.days;
      return;
    }
    case 'RUN_FLAT_OUT': {
      const p = need(siteOf(action.site), 'refinery');
      p.utilizationCap = 1;
      p.utilizationCapUntil = 0;
      p.utilization = 1;
      p.fullRunUntil = w.tick + action.days;
      return;
    }
    case 'MAINTAIN_NOW': {
      const p = siteOf(action.site);
      if (a.kind !== 'REFINER' && a.kind !== 'INTEGRATED' || p === undefined) throw new Error(`${a.name} has no refinery`);
      startMaintenance(a, p, w.ledger, tick, cfg);
      return;
    }
    case 'SCHEDULE_MAINTENANCE':
      need(siteOf(action.site), 'refinery').maintenanceAt = w.tick + action.inDays;   // counted from the day of the decision
      return;
    case 'DEFER_MAINTENANCE': {
      const p = need(siteOf(action.site), 'refinery');
      p.maintenanceHoldUntil = tick + action.days;
      p.maintenanceAt = null;
      return;
    }
    case 'EMERGENCY_REPAIR': {
      const p = need(siteOf(action.site), 'refinery');
      if (p.outageTicksRemaining <= 0) throw new Error(`${a.name}'s refinery is not broken down`);
      charge(w, a, cfg.EMERGENCY_REPAIR_COST * p.processingCapacity, FeeKind.REPAIR, tick);
      p.outageTicksRemaining = Math.ceil(p.outageTicksRemaining / 2);
      return;
    }
    case 'PARTIAL_RESTART':
      need(siteOf(action.site), 'refinery').limpShare = Math.max(0, Math.min(1, action.share));
      return;
    case 'CRUDE_MIX': {
      const p = need(siteOf(action.site), 'refinery');
      if (action.grade !== null && !acceptedGrades(p.techTier).includes(action.grade)) throw new Error(`Tier ${p.techTier} cannot refine ${action.grade}`);
      p.crudePreference = action.grade === null ? null : { grade: action.grade, weight: action.weight };
      return;
    }
    case 'DRAW_CREDIT': {
      const amount = Math.max(0, Math.min(action.amount, a.creditLimit - a.creditDrawn));
      a.cash += amount;
      a.creditDrawn += amount;
      w.totals.netBorrowing += amount;
      return;
    }
    case 'STANDING_ORDER':
      w.standingOrders.push({
        agentId, side: action.side, node: action.node, region: action.region, price: action.price, qty: action.qty, untilTick: tick + action.days - 1,
      });
      return;
    case 'SIGN_DEAL': {
      const byId = new Map(w.agents.map((x) => [x.agentId, x]));
      w.dealSeq += 1;
      w.deals.push(signDeal(action.terms, byId, w.deals, w.dealSeq, w.tick, cfg));
      return;
    }
    case 'CANCEL_DEAL': {
      const deal = w.deals.find((d) => d.dealId === action.dealId);
      if (!deal) throw new Error(`No deal ${action.dealId}`);
      cancelDeal(deal, agentId, new Map(w.agents.map((x) => [x.agentId, x])), w.tick, cfg);
      return;
    }
    case 'REROUTE_DEAL': {
      const deal = w.deals.find((d) => d.dealId === action.dealId);
      if (!deal || deal.status !== 'ACTIVE') throw new Error(`No active deal ${action.dealId}`);
      const startTick = Math.max(deal.startTick, tick);
      const lot = cfg.LOT_SIZE;
      const moved = action.half ? Math.floor(deal.qtyPerDay / 2 / lot) * lot : deal.qtyPerDay;
      if (moved <= 0) throw new Error(`${deal.dealId} is too small to split`);
      deal.status = 'ENDED';
      const make = (qtyPerDay: number, avoid: readonly ChokepointName[]) => {
        w.dealSeq += 1;
        w.deals.push({ ...deal, dealId: makeDealId(w.dealSeq), qtyPerDay, avoidChokepoints: [...avoid], startTick, status: 'ACTIVE', deliveredBbl: 0, shortfallBbl: 0 });
      };
      if (moved < deal.qtyPerDay) make(deal.qtyPerDay - moved, deal.avoidChokepoints);
      make(moved, action.avoid);
      return;
    }
    case 'RESERVE_PIPELINE': {
      const labor = wages(a.region, w.sink.climate, cfg);
      charge(w, a, cfg.RESERVATION_COST * action.qty * labor, FeeKind.RESERVATION, tick);
      setReservation(w.graph, asEdgeId(action.edgeId), agentId, action.qty, cfg);
      w.reservations = w.reservations.filter((r) => !(r.agentId === agentId && r.edgeId === action.edgeId));
      w.reservations.push({ agentId, edgeId: action.edgeId, qty: action.qty, untilTick: tick + cfg.RESERVATION_TICKS - 1 });
      return;
    }
    case 'LEASE': {
      if (!leaseRegions().includes(action.region)) throw new Error(`${action.region} has no lease pool`);
      const used = w.leases.filter((l) => l.region === action.region).reduce((s, l) => s + l.capacity, 0);
      const mine = w.leases.filter((l) => l.region === action.region && l.agentId === agentId).reduce((s, l) => s + l.capacity, 0);
      if (used + action.capacity > cfg.LEASE_POOL_CAPACITY) throw new Error(`${action.region}'s lease pool is full`);
      if (mine + action.capacity > cfg.MAX_LEASE_SHARE * cfg.LEASE_POOL_CAPACITY) throw new Error(`${a.name} may lease at most ${cfg.MAX_LEASE_SHARE * 100}% of the pool`);
      const rate = leaseRate(w, action.region);
      addStorage(a, action.region, action.capacity);
      w.leases.push({ agentId, region: action.region, capacity: action.capacity, rate, untilTick: tick + Math.max(action.days, cfg.LEASE_MIN_TICKS) - 1 });
      return;
    }
    case 'RENEW_LEASE': {
      // Extends the term of space the company already has. Renting a second lot instead would pay
      // for the same barrels twice over the days that overlap, and then give half of it back.
      // The rate is struck again at today's scarcity, as a new term would be.
      const rate = leaseRate(w, action.region);
      const days = Math.max(action.days, cfg.LEASE_MIN_TICKS);
      const soonest = endingSoonest(w, agentId, action.region);
      if (soonest === undefined) throw new Error(`${a.name} has no leased space in ${action.region}`);
      // A term still running is extended from the day it would have ended; one already in grace
      // starts again from today, today counting as the first of the new days.
      w.leases = w.leases.map((l) => (l === soonest
        ? { ...l, rate, grace: false, untilTick: (l.grace === true ? tick + days - 1 : l.untilTick + days) as Tick }
        : l));
      return;
    }
    case 'OPEN_OFFICE': {
      if (a.kind !== 'TRADER') throw new Error('Only traders open offices');
      if (a.offices.includes(action.region)) throw new Error(`${a.name} already has an office in ${action.region}`);
      charge(w, a, cfg.OFFICE_COST.OPEN, FeeKind.OFFICE, tick);
      a.offices.push(action.region);
      a.hubs[action.region] = {
        capacity: OFFICE_HUB_CAPACITY, stock: { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 },
        escrow: { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 },
        inbound: { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 }, cost: { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 },
      };
      return;
    }
    case 'CHARTER': {
      w.charterSeq += 1;
      w.charters.push(newCharter(cfg, agentId, action.size, action.days, tick, w.charterSeq));
      return;
    }
    case 'SERVICE_WELLS': {
      // Doing the job properly: the wells come off, they are paid for, and they go back on in a
      // few days with their hazard back where it started (§12A.3).
      const due = dueForService(a, action.count);
      for (const well of due.wells) {
        well.status = WellStatus.MAINTENANCE;
        well.ticksRemaining = cfg.WELL.MAINT_TICKS;
      }
      charge(w, a, due.cost, FeeKind.WELL_SERVICE, tick);
      if (well !== undefined) refreshCapacity(well);
      return;
    }
    case 'HOLD_SERVICES': {
      // Nothing is pulled off until this day, on every lease. The hazard keeps climbing while it is.
      const field = need(well, 'wells');
      for (const lease of field.leases) lease.serviceHoldUntil = (tick + action.days) as Tick;
      return;
    }
    case 'RESTATE_RESERVES':
      // The bank lends against the published figure, so the line follows it the same week (§12A.6).
      a.creditLimit += action.uplift;
      return;
    case 'GRANT_LICENCE': {
      const field = need(well, 'wells');
      if (!field.licences.includes(action.region)) field.licences.push(action.region);
      return;
    }
    case 'TAINTED_BID': {
      // A bid placed on a number you were not meant to hear (§12A.6, dilemma 23). It costs nothing
      // now, which is the whole temptation; it costs the block if it wins you one.
      const lot = w.auction?.lots.find((l) => l.lotId === action.lotId);
      const agent = w.agents.find((x) => x.agentId === agentId);
      if (lot === undefined || agent === undefined || !mayWork(agent, lot)) return;
      placeBid(lot, agentId, action.amount);
      taintLot(lot, agentId, action.saved, 'BID_OVERHEARD');
      return;
    }
    case 'BUY_SURVEY': {
      // A copy of a survey shot for somebody else (§12A.6, dilemma 22). It tells you what is really
      // down there before you bid — and it marks the lot, so ground it wins you is ground you can be
      // made to give back, with the oil still under it.
      const lot = w.auction?.lots.find((l) => l.lotId === action.lotId);
      if (lot === undefined) return;
      charge(w, a, action.price, FeeKind.REPORT, tick);
      buySurvey(lot, agentId, action.saved);
      return;
    }
    case 'ESCAPE': {
      // Getting out from under it (§12A.6). The price was fixed when the card was shown; taking it
      // a day later at a higher rung costs what it costs today, which is the point of the window.
      const escape = takeEscape(a, action.escape, cfg, tick, w.horizon === null ? null : w.horizon - tick);
      if (escape === null) throw new Error(`${a.name} has nothing to answer for`);
      charge(w, a, escape.cost, FeeKind.ESCAPE, tick);
      return;
    }
    case 'CUT_CORNER':
      // What a dilemma's Yes does: the saving is already banked elsewhere, and this is the part
      // nobody sees (§12A.6). Nothing here is ever shown to a player.
      addExposure(a, { amount: action.amount, saved: action.saved, tick, target: action.target, because: action.because });
      return;
    case 'BID_LEASE': {
      // A sealed bid: it is recorded and nothing more happens until the lot is awarded (§12A.4).
      const lot = w.auction?.lots.find((l) => l.lotId === action.lotId);
      const agent = w.agents.find((a) => a.agentId === agentId);
      if (lot === undefined || agent === undefined || !mayWork(agent, lot)) return;
      placeBid(lot, agentId, action.amount);
      return;
    }
    case 'KEEP_AFLOAT': {
      // Every cargo of this company that is riding one of its own ships waits at sea instead of
      // unloading: the hire is already paid, so floating storage costs nothing further (spec §7.4).
      const until = (tick + action.days) as Tick;
      for (const c of w.cargo) {
        if (c.ownerId === agentId && c.charterId !== null && c.qty > 0) c.floatUntil = until;
      }
      return;
    }
    case 'SELL_AT_SEA': {
      for (const c of w.cargo) {
        if (c.ownerId !== agentId || c.status !== 'HELD' || c.awaitingRoute) continue;
        const qty = Math.round(c.qty * action.share);
        if (qty <= 0) continue;
        const price = w.nodes[NODE_FOR_GRADE[c.grade]].markerPrice * (1 - cfg.DISTRESS_DISCOUNT);
        a.cash += qty * price;
        c.qty -= qty;
        w.totals.forceSold += qty;
        w.totals.forcedSaleRevenue += qty * price;
        if (plant) plant.inboundBarrels = Math.max(0, plant.inboundBarrels - qty);
        const hub = a.kind === 'TRADER' ? a.hubs[c.destination] : undefined;
        if (hub) {
          hub.cost[c.grade] -= qty * averageCost(hub, c.grade);
          hub.inbound[c.grade] = Math.max(0, hub.inbound[c.grade] - qty);
        }
      }
      w.cargo = w.cargo.filter((c) => c.qty > 0);
      return;
    }
    case 'PAY':
      charge(w, a, action.amount, FeeKind.REPORT, tick);
      return;
  }
}

/**
 * Phase 0 of each tick: capital projects take their daily instalment and finish; reservations
 * and leases expire. A finished refinery turns its producer into an integrated major (spec G2).
 */
export function advanceProjects(w: World): void {
  const cfg = w.config;
  const tick = w.tick;
  for (const p of w.projects) {
    if (tick < p.heldUntil) continue;
    const a = w.agents.find((x) => x.agentId === p.agentId);
    if (!a) continue;
    charge(w, a, p.dailyCost, FeeKind.CAPITAL, tick);
    p.ticksLeft -= 1;
    if (p.ticksLeft > 0) continue;
    complete(w, a, p, cfg);
  }
  w.projects = w.projects.filter((p) => p.ticksLeft > 0);

  for (const r of w.reservations.filter((x) => x.untilTick < tick)) setReservation(w.graph, asEdgeId(r.edgeId), r.agentId, 0, cfg);
  w.reservations = w.reservations.filter((r) => r.untilTick >= tick);

  // A term running out used to take the space away the same day and sell whatever no longer fit at
  // a fifth off, with nothing anywhere having said it was coming. A company holding crude in space
  // it is about to lose now gets LEASE_GRACE_TICKS more days of it at LEASE_GRACE_MULTIPLIER times
  // the rate — dear enough that nobody would choose it, long enough to move the oil (spec §7.4).
  const running: Lease[] = w.leases.filter((l) => l.untilTick >= tick);
  for (const l of w.leases.filter((x) => x.untilTick < tick)) {
    if (l.grace !== true && atRiskFromLease(w, l) > 0) {
      running.push({ ...l, untilTick: (tick + cfg.LEASE_GRACE_TICKS - 1) as Tick, grace: true });
      continue;
    }
    endLease(w, l);
  }
  w.leases = running;
  w.standingOrders = w.standingOrders.filter((o) => o.untilTick >= tick);
}

/** Phase 7: daily lease fees. */
export function chargeLeases(w: World): void {
  for (const l of w.leases) {
    const a = w.agents.find((x) => x.agentId === l.agentId);
    const rate = l.grace === true ? l.rate * w.config.LEASE_GRACE_MULTIPLIER : l.rate;
    if (a) charge(w, a, rate * l.capacity, FeeKind.LEASE, w.tick);
  }
}

/**
 * Barrels that would have nowhere to stand if this leased space went today — what `endLease` would
 * be forced to sell. Asked before the term runs out rather than after, so a company can be told and
 * given a few days to shift them.
 *
 * This is the field's own figure. A producer's tankage is shared out among the ground each lease
 * works (stage 3b), so one block can overflow while the field still has room, and the true figure
 * can be a little worse. Near enough for a warning, which is what it is for.
 */
export function atRiskFromLease(w: World, l: Lease): number {
  const a = w.agents.find((x) => x.agentId === l.agentId);
  if (!a) return 0;
  if (a.kind === 'TRADER') {
    const hub = a.hubs[l.region];
    return hub === undefined ? 0 : Math.max(0, total(hub.stock) - (hub.capacity - l.capacity));
  }
  const well = wellOf(a);
  if (well) return Math.max(0, well.storage + well.storageEscrow - (well.storageCapacity - l.capacity));
  const plant = plantOf(a);
  if (plant) return Math.max(0, total(plant.crudeStock) - (plant.crudeStorageCapacity - l.capacity));
  return 0;
}

/** Regions with a lease pool: any with a sea terminal (spec §7.4). */
export function leaseRegions(): RegionName[] {
  const regions = new Set<RegionName>();
  for (const l of LANES) {
    if (l.mode !== 'SEA') continue;
    for (const end of [l.a, l.b]) if (end in REGIONS) regions.add(end as RegionName);
  }
  return [...regions];
}

/** Today's lease fee in a region: dearer as its pool fills (spec §7.4), fixed at signing. */
/**
  * The parcel of rented space in a region whose term runs out first. A company can hold several at
  * once - a trader was measured holding six in one region - so anything about "the lease ending" has
  * to mean one of them, and the one ending first is the only one there is anything to decide today.
  */
export function endingSoonest(w: World, agentId: AgentId, region: RegionName): Lease | undefined {
  return w.leases
    .filter((l) => l.agentId === agentId && l.region === region)
    .reduce<Lease | undefined>((best, l) => (best === undefined || l.untilTick < best.untilTick ? l : best), undefined);
}

export function leaseRate(w: World, region: RegionName): number {
  const used = w.leases.filter((l) => l.region === region).reduce((s, l) => s + l.capacity, 0);
  return w.config.LEASE_RATE * (1 + w.config.LEASE_SCARCITY * used / w.config.LEASE_POOL_CAPACITY);
}

export function projectCost(w: World, a: Agent, kind: ProjectKind, steps: number): number {
  const cfg = w.config;
  // Building in a boom costs boom wages, which is the whole point of a boom not being a free ride.
  const labor = wages(a.region, w.sink.climate, cfg);
  const plant = plantOf(a);
  switch (kind) {
    case 'DRILL': return cfg.DRILL_COST * cfg.DRILL_STEP * steps * labor;
    case 'STORAGE': return cfg.STORAGE_COST * cfg.STORAGE_STEP * steps * labor;
    case 'UNIT': return cfg.FACTORY_COST * cfg.UNIT_CAPACITY * steps * labor;
    case 'TIER': {
      if (!plant) return 0;
      const rate = plant.techTier === 1 ? cfg.TIER_COST.TO_TIER_2 : cfg.TIER_COST.TO_TIER_3;
      return rate * plant.processingCapacity * labor;
    }
    case 'REFINERY':
      if (a.kind === 'PRODUCER') return plantCost(a.region, integrationPlant(a, cfg), cfg);
      return a.kind === 'REFINER' ? plantCost(a.region, secondPlantSpec(a, cfg), cfg) : 0;
  }
}

function projectTicks(cfg: Config, kind: ProjectKind): number {
  switch (kind) {
    case 'DRILL': return cfg.DRILL_TICKS;
    case 'STORAGE': return cfg.STORAGE_TICKS;
    case 'TIER': return cfg.TIER_TICKS;
    case 'UNIT':
    case 'REFINERY': return cfg.FACTORY_TICKS;
  }
}

function complete(w: World, a: Agent, p: CapitalProject, cfg: Config): void {
  const well = wellOf(a);
  // Works finish at the site they were started for: a refiner's second refinery grows too (D34).
  const plant = plantAt(a, p.region) ?? plantOf(a);
  switch (p.kind) {
    case 'DRILL': {
      // A programme sinks its wells one at a time, and some find nothing (§12A.3). What a well makes
      // follows the oil it can reach: on fresh ground that is a full DRILL_STEP, on ground the other
      // wells have already claimed it is less, which is the lease telling you it is finished.
      const lease = bestLeaseToDrill(well?.leases ?? []);
      if (well && lease) {
        // A well still starts at the rate a programme buys. What changes on tired ground is how
        // long it lasts: it can only reach what no other well has claimed, so on a lease that is
        // nearly drilled out a new well is spent in months rather than years.
        for (let i = 0; i < p.steps; i++) drillWell(lease, cfg.DRILL_STEP, cfg, w.rng.wells);
        refreshCapacity(well);
      }
      return;
    }
    case 'STORAGE':
      if (well) well.storageCapacity += cfg.STORAGE_STEP * p.steps;
      else if (plant) plant.crudeStorageCapacity += cfg.STORAGE_STEP * p.steps;
      return;
    case 'TIER':
      if (plant && plant.techTier < 3) plant.techTier = (plant.techTier + 1) as 2 | 3;
      if (plant) { plant.worksTicksRemaining = 0; plant.worksFactor = 1; }
      return;
    case 'UNIT':
      if (plant) plant.processingCapacity += cfg.UNIT_CAPACITY * p.steps;
      return;
    case 'REFINERY':
      if (a.kind === 'PRODUCER') {
        const index = w.agents.indexOf(a);
        const major = integrate(a, integrationPlant(a, cfg));
        w.agents[index] = major;
        internalTransfer(major);
      } else if (a.kind === 'REFINER' && a.second === null) {
        a.second = secondPlant(a, p.region, cfg);
      }
      return;
  }
}

function addStorage(a: Agent, region: RegionName, capacity: number): void {
  const well = wellOf(a);
  const plant = plantAt(a, region);
  if (a.kind === 'TRADER') {
    const hub = a.hubs[region];
    if (!hub) throw new Error(`${a.name} has no office in ${region}`);
    hub.capacity += capacity;
  } else if (region !== a.region && plant === undefined) {
    throw new Error(`${a.name} has nothing in ${region} to store crude in`);
  } else if (well) {
    well.storageCapacity += capacity;
  } else if (plant) {
    plant.crudeStorageCapacity += capacity;
  }
}

/** A lease ends: the capacity goes, and any crude it held is sold off at a distress price. */
function endLease(w: World, l: Lease): void {
  const a = w.agents.find((x) => x.agentId === l.agentId);
  if (!a) return;
  const sell = (grade: Grade, qty: number) => {
    if (qty <= 0) return;
    const price = w.nodes[NODE_FOR_GRADE[grade]].markerPrice * (1 - w.config.DISTRESS_DISCOUNT);
    a.cash += qty * price;
    w.totals.forceSold += qty;
    w.totals.forcedSaleRevenue += qty * price;
  };
  const well = wellOf(a);
  const plant = plantOf(a);
  if (a.kind === 'TRADER') {
    const hub = a.hubs[l.region];
    if (!hub) return;
    hub.capacity -= l.capacity;
    let excess = total(hub.stock) - hub.capacity;
    for (const g of ['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR'] as const) {
      const qty = Math.min(excess, hub.stock[g]);
      if (qty > 0) { hub.stock[g] -= qty; sell(g, qty); excess -= qty; }
    }
  } else if (well) {
    well.storageCapacity -= l.capacity;
    // Tankage is shared out by the ground each lease works, so losing some of it can overfill any
    // of them. What will not fit goes at the day's price, wherever it was standing (stage 3b).
    for (const lease of well.leases) {
      const excess = lease.storage + lease.storageEscrow - tankOf(well, lease);
      if (excess > 0) { drawFrom(well, [lease], excess); sell(lease.grade, excess); }
    }
  } else if (plant) {
    plant.crudeStorageCapacity -= l.capacity;
    let excess = total(plant.crudeStock) - plant.crudeStorageCapacity;
    for (const g of ['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR'] as const) {
      const qty = Math.min(excess, plant.crudeStock[g]);
      if (qty > 0) { plant.crudeStock[g] -= qty; sell(g, qty); excess -= qty; }
    }
  }
}

function charge(w: World, a: Agent, amount: number, kind: FeeKind, tick: Tick): void {
  if (amount <= 0) return;
  a.cash -= amount;
  recordFee(w.ledger, { tick, agentId: a.agentId, kind, amount });
}

function find(w: World, agentId: AgentId): Agent {
  const a = w.agents.find((x) => x.agentId === agentId);
  if (!a) throw new Error(`No company ${agentId}`);
  return a;
}
