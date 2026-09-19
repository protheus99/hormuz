// The daily decision rules every company runs in phase 5b (spec §6), the player's company
// included. Cards and settings shape them; they never branch on cards.
//
// Rules see a MarketView: yesterday's close, public information and the company's own state —
// never a rival's (spec G5). Prices reference the previous close, because today's market has not
// cleared yet. Every order is a whole number of lots; asks round up to the cent and bids round
// down, so rounding never breaks a floor or a ceiling.

import { actualCost, effectiveUtilization, fillRatio } from './agents';
import { previousClose, type ClearContext, type ExchangeNode, type Quote } from './clearing';
import { acceptedGrades, availableCash, total } from './companies';
import type { Config } from './config';
import { productValue, YIELDS, type ProductPrices } from './economics';
import {
  makeOrderId, type Agent, type Ask, type Bid, type ChokepointName, type IntegratedMajor, type NodeName, type Order,
  type PlantState, type Producer, type Refiner, type Tick, type WellState,
} from './model';
import type { RouteProvider } from './routes';
import { NODE_FOR_GRADE, NODE_NAMES } from '../data/nodes';
import { REGIONS } from '../data/regions';

/** What a company's rules may look at (spec §14.5 "Two views"). */
export interface MarketView {
  readonly tick: Tick;
  /** The exchange nodes, for their markers and previous close. Only public fields are read. */
  readonly nodes: Readonly<Partial<Record<NodeName, ExchangeNode>>>;
  readonly routes: RouteProvider;
  /** Smoothed product prices (spec §7.3), which refiners value crude against. */
  readonly expectedPrices: ProductPrices;
  /** Chokepoints this company's Risk setting avoids today (avoidFor). */
  readonly avoid: readonly ChokepointName[];
  /** Barrels this company must deliver tomorrow under its deals (spec §6.1 rule 4). */
  readonly dealCommitments: number;
}

/**
 * Today's orders for one company (spec §6.1–6.4). `index` is the company's position in the world,
 * used for order IDs so ties in clearing break the same way every run.
 */
export function decideOrders(agent: Agent, index: number, view: MarketView, cfg: Config): Order[] {
  const ids = orderIds(index);
  switch (agent.kind) {
    case 'PRODUCER':
      return producerAsks(agent, agent, view, cfg, cfg.MIN_MARGIN, ids);
    case 'REFINER':
      return refinerBids(agent, agent, view, cfg, 0, ids);
    case 'INTEGRATED':
      // §6.3: surplus sold at cost plus tariff with no margin; a deficit bought more aggressively.
      return [
        ...producerAsks(agent, agent.well, view, cfg, 0, ids),
        ...refinerBids(agent, agent.plant, view, cfg, cfg.AGGRESSION, ids),
      ];
    case 'TRADER':
      return [];
  }
}

// ─── Producers (spec §6.1) ───────────────────────────────────────────────────────────────────

function producerAsks(
  company: Producer | IntegratedMajor, well: WellState, view: MarketView, cfg: Config, margin: number, ids: () => ReturnType<typeof makeOrderId>,
): Ask[] {
  const nodeName = NODE_FOR_GRADE[well.grade];
  const node = view.nodes[nodeName];
  if (node === undefined) return [];
  const origin = company.region;
  const cost = actualCost(company);
  const lot = cfg.LOT_SIZE;

  // Rule 1: yesterday's FOB here, or else the marker brought back to this origin.
  const ref = referenceFob(node, origin, view);
  // Rule 2: never below cash cost, the export tariff and the margin.
  const floor = cost + REGIONS[origin].infrastructureTariff + margin;
  // Rule 3: fuller storage, lower ask.
  const fill = fillRatio(well);
  const price = roundUp(Math.max(floor, ref * (1 - cfg.SKEW * (fill - 0.5))));

  // Rule 5: when nearly full, the excess above 70% fill goes at cash cost.
  const dumpQty = fill >= cfg.DUMP_THRESHOLD
    ? lots(Math.min(well.storage, well.storage + well.storageEscrow - 0.7 * well.storageCapacity), lot)
    : 0;
  // Rule 4: everything else not already promised to tomorrow's deals.
  const mainQty = lots(well.storage - view.dealCommitments - dumpQty, lot);

  const asks: Ask[] = [];
  const ask = (limitPrice: number, qty: number): Ask => ({
    orderId: ids(), agentId: company.agentId, node: nodeName, side: 'ASK', limitPrice, qty, qtyRemaining: qty, originRegion: origin,
  });
  if (mainQty > 0) asks.push(ask(price, mainQty));
  if (dumpQty > 0) asks.push(ask(roundUp(cost), dumpQty));
  return asks;
}

/** Yesterday's FOB at an origin, or the marker less freight to the marker region, floored at zero. */
function referenceFob(node: ExchangeNode, origin: Agent['region'], view: MarketView): number {
  const close = node.lastFobByOrigin[origin];
  if (close !== undefined) return close;
  const toMarker = view.routes.route(origin, node.markerRegion);
  return Math.max(0, node.markerPrice - (toMarker?.totalFreight ?? 0));
}

// ─── Refiners (spec §6.2) ────────────────────────────────────────────────────────────────────

interface NodeChoice {
  readonly node: NodeName;
  /** The most a delivered barrel is worth to this plant from the cheapest origin. */
  readonly deliveredMax: number;
  /** Cheapest previous-close landed price, or null when this node has no reference. */
  readonly referenceLanded: number | null;
}

function refinerBids(
  company: Refiner | IntegratedMajor, plant: PlantState, view: MarketView, cfg: Config, aggression: number, ids: () => ReturnType<typeof makeOrderId>,
): Bid[] {
  const utilization = effectiveUtilization(plant);
  if (utilization === 0 || company.insolvent) return [];   // an offline plant needs nothing; an insolvent company may not bid (D11)
  const lot = cfg.LOT_SIZE;
  const ctx: ClearContext = { routes: view.routes, tick: view.tick, config: cfg };

  // Value each node whose grade the plant can refine.
  const choices: NodeChoice[] = [];
  for (const nodeName of NODE_NAMES) {
    const node = view.nodes[nodeName];
    if (node === undefined || !acceptedGrades(plant.techTier).includes(node.grade)) continue;
    const quotes: Quote[] = previousClose(node, company.region, ctx, view.avoid);
    const cheapest = quotes[0];
    const transit = cheapest?.route.totalTransit ?? view.routes.route(node.markerRegion, company.region, view.avoid)?.totalTransit ?? 0;
    const value = productValue(node.grade, view.expectedPrices) - YIELDS[node.grade].opex;
    choices.push({ node: nodeName, deliveredMax: value - cfg.CARRY_RATE * transit, referenceLanded: cheapest?.landed ?? null });
  }
  if (choices.length === 0) return [];

  // Best margin over the reference; with no reference anywhere, the highest delivered value.
  const withRef = choices.filter((c) => c.referenceLanded !== null);
  const best = withRef.length > 0
    ? withRef.reduce((a, b) => (b.deliveredMax - (b.referenceLanded ?? 0) > a.deliveredMax - (a.referenceLanded ?? 0) ? b : a))
    : choices.reduce((a, b) => (b.deliveredMax > a.deliveredMax ? b : a));

  // Quantity: top the stock up to TARGET_DAYS of use, within tank space and cash.
  const held = total(plant.crudeStock) + plant.inboundBarrels;
  const target = cfg.TARGET_DAYS * plant.processingCapacity * utilization;
  const ceiling = best.deliveredMax * (1 + aggression);
  const starvation = target > 0 ? clamp01(1 - held / target) : 0;
  const price = roundDown(best.referenceLanded === null
    ? ceiling
    : Math.min(ceiling, best.referenceLanded * (1 + cfg.URGENCY * starvation)));
  if (!(price > 0)) return [];
  const space = plant.crudeStorageCapacity - held;
  const affordable = availableCash(company) / price;
  const qty = lots(Math.min(target - held, space, affordable), lot);
  if (qty <= 0) return [];

  return [{
    orderId: ids(), agentId: company.agentId, node: best.node, side: 'BID', limitPrice: price, qty, qtyRemaining: qty,
    deliveryRegion: company.region, avoidChokepoints: [...view.avoid],
  }];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────

function orderIds(index: number): () => ReturnType<typeof makeOrderId> {
  let seq = 0;
  return () => makeOrderId(index, seq++);
}

/** Whole lots only, never negative. */
function lots(barrels: number, lot: number): number {
  return Math.max(0, Math.floor(barrels / lot) * lot);
}

// Prices are kept to the cent. The small epsilon stops 58.6 × 100 = 5859.999… rounding the wrong way.
function roundUp(price: number): number {
  return Math.ceil(price * 100 - 1e-9) / 100;
}
function roundDown(price: number): number {
  return Math.floor(price * 100 + 1e-9) / 100;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
