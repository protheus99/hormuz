// What a capital decision is worth, in the only unit that can answer it: how long it takes to pay
// for itself (spec G4.1, §12A.8).
//
// The four meters project thirty days, which is the right window for a deal, a cargo or a price
// move and the wrong one for anything you buy. Measured 2026-09-23: the lease auction showed a
// player $0 of profit for every option, Yes, Maybe and No alike — a sealed bid costs nothing today
// and the lots are awarded thirty days out, so the projection saw nothing at all. Drilling showed
// zero or less, because a well takes months. A player deciding by the numbers therefore never grew,
// and finished the finale mid-pack while the rivals that did bought the ground.
//
// So a card that buys something says what it costs, what it will make, and how long that takes to
// come back — which is the sum an operator actually does. It is today's arithmetic, not a forecast:
// at today's prices, at today's lifting cost, this is the number. Prices move and so does it.

import { projectCost, type Action } from '../../engine/actions';
import { referencePrice } from '../../engine/clearing';
import { wellOf } from '../../engine/companies';
import type { Config } from '../../engine/config';
import { productValue, YIELDS } from '../../engine/economics';
import type { Grade } from '../../engine/enums';
import type { Agent, RegionName } from '../../engine/model';
import { findRoute } from '../../engine/transport';
import type { World } from '../../engine/world';
import { NODE_FOR_GRADE } from '../../data/nodes';
import { REGIONS } from '../../data/regions';

/** What an option buys, and how long it takes to pay for itself. */
export interface Payback {
  /** Everything it takes to get it earning, $ — including work that follows, like drilling ground. */
  readonly cost: number;
  /** Extra barrels a day once it is working; zero for something that earns no barrels of its own. */
  readonly barrels: number;
  /** Months to pay for itself at today's margin, or null when there is no honest number. */
  readonly months: number | null;
  /** Said plainly, for a card and for anyone reading the number cold. */
  readonly words: string;
}

/** Months beyond which a payback is quoted as a range rather than a figure: nobody can see that far. */
const FAR = 120;

/**
 * What this option buys. Null when it buys nothing — most cards — and the four meters stand alone.
 */
export function paybackOf(w: World, me: Agent, actions: readonly Action[]): Payback | null {
  let cost = 0;
  let daily = 0;
  let barrels = 0;
  let nothing = '';
  for (const action of actions) {
    const one = valueOf(w, me, action);
    if (one === null) continue;
    cost += one.cost;
    daily += one.daily;
    barrels += one.barrels;
    if (one.daily === 0 && one.cost > 0 && nothing === '') nothing = one.nothing;
  }
  if (cost <= 0) return null;
  if (daily <= 0) return { cost, barrels, months: null, words: nothing || 'It does not pay for itself in barrels.' };
  const months = cost / daily / 30;
  return { cost, barrels, months, words: words(months) };
}

function words(months: number): string {
  if (months >= FAR) return 'It would take more than ten years to pay for itself at today’s prices.';
  if (months < 1) return 'It pays for itself within a month at today’s prices.';
  const n = Math.round(months);
  return `It pays for itself in about ${n} ${n === 1 ? 'month' : 'months'} at today’s prices.`;
}

interface Bought {
  readonly cost: number;
  /** What it adds to the day's profit once it is working, $/day. */
  readonly daily: number;
  readonly barrels: number;
  /** Why there is no payback, when it earns nothing of its own. */
  readonly nothing: string;
}

function valueOf(w: World, me: Agent, action: Action): Bought | null {
  const cfg = w.config;
  switch (action.kind) {
    case 'START_PROJECT':
      return fromProject(w, me, action);
    case 'BID_LEASE':
    case 'TAINTED_BID': {
      // Ground is not worth what it is bid: it is worth what it makes once it is drilled, and the
      // drilling is the larger half of the bill. Quote both, or the number flatters the decision.
      const lot = w.auction?.lots.find((l) => l.lotId === action.lotId);
      if (lot === undefined) return null;
      const wells = expectedWells(lot.maxWells, 0, cfg);
      const barrels = wells * cfg.DRILL_STEP;
      const drilling = lot.maxWells * cfg.DRILL_COST * cfg.DRILL_STEP * REGIONS[lot.region].laborCostIndex;
      const margin = liftingMargin(w, lot.region, lot.grade, lot.baseExtractionCost);
      return { cost: action.amount + drilling, daily: barrels * margin, barrels, nothing: '' };
    }
    case 'BUY_SURVEY':
      // It buys knowledge, not barrels; what it is worth is what it stops you overpaying for.
      return { cost: action.price, daily: 0, barrels: 0, nothing: 'A survey makes nothing on its own: it tells you what the ground is before you bid for it.' };
    default:
      return null;
  }
}

function fromProject(w: World, me: Agent, action: Extract<Action, { kind: 'START_PROJECT' }>): Bought | null {
  const cfg = w.config;
  const cost = projectCost(w, me, action.project, action.steps);
  const field = wellOf(me);
  switch (action.project) {
    case 'DRILL': {
      if (field === undefined) return null;
      const lease = field.leases.find((l) => l.wells.length < l.maxWells) ?? field.leases[0];
      const wells = expectedWells(action.steps, lease?.attempts ?? 0, cfg);
      const barrels = wells * cfg.DRILL_STEP;
      const margin = liftingMargin(w, lease?.region ?? me.region, lease?.grade ?? field.grade, lease?.baseExtractionCost ?? field.baseExtractionCost);
      return { cost, daily: barrels * margin, barrels, nothing: '' };
    }
    case 'UNIT': {
      const barrels = action.steps * cfg.UNIT_CAPACITY;
      return { cost, daily: barrels * refiningMargin(w, me), barrels, nothing: '' };
    }
    case 'REFINERY': {
      const barrels = cfg.UNIT_CAPACITY;
      return { cost, daily: barrels * refiningMargin(w, me), barrels, nothing: '' };
    }
    case 'TIER':
      return { cost, daily: 0, barrels: 0, nothing: 'An upgrade adds no barrels: it lets you run heavier crude, which is usually the cheaper crude.' };
    case 'STORAGE':
      return { cost, daily: 0, barrels: 0, nothing: 'Tanks make nothing on their own: they let you choose when to sell rather than sell as you pump.' };
  }
}

/**
 * How many of `n` wells find oil. The best prospects go first, so each attempt on a lease makes the
 * next likelier to miss (§12A.3) — a programme of six is not six wells.
 */
export function expectedWells(n: number, attempts: number, cfg: Config): number {
  let found = 0;
  for (let i = 0; i < n; i++) found += Math.max(cfg.DRY_HOLE.FLOOR, cfg.DRY_HOLE.FIRST - cfg.DRY_HOLE.PER_ATTEMPT * (attempts + i));
  return found;
}

/**
 * What a barrel lifted here leaves behind: what it fetches at this quay, less what it costs to lift
 * and the tariff to get it off the ground. The same netback a producer's own asks are floored at.
 */
function liftingMargin(w: World, region: RegionName, grade: Grade, baseCost: number): number {
  const node = w.nodes[NODE_FOR_GRADE[grade]];
  if (node === undefined) return 0;
  const toMarker = findRoute(w.graph, region, node.markerRegion);
  const netback = Math.max(0, node.markerPrice - (toMarker?.totalFreight ?? 0));
  const fob = Math.min(referencePrice(node, region) ?? netback, netback);
  return Math.max(0, fob - baseCost * REGIONS[region].laborCostIndex - REGIONS[region].infrastructureTariff);
}

/** What a barrel through the still leaves behind: product value, less refining and the crude itself. */
function refiningMargin(w: World, me: Agent): number {
  const grade = wellOf(me)?.grade ?? 'MEDIUM';
  const node = w.nodes[NODE_FOR_GRADE[grade as Grade]];
  const crude = node === undefined ? 0 : node.markerPrice + REGIONS[me.region].infrastructureTariff;
  return Math.max(0, productValue(grade as Grade, w.sink.expectedPrices) - YIELDS[grade as Grade].opex - crude);
}
