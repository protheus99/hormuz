// The daily decision rules every company runs in phase 5b (spec §6), the player's company
// included. Cards and settings shape them; they never branch on cards.
//
// Rules see a MarketView: yesterday's close, public information and the company's own state —
// never a rival's (spec G5). Prices reference the previous close, because today's market has not
// cleared yet. Every order is a whole number of lots; asks round up to the cent and bids round
// down, so rounding never breaks a floor or a ceiling.

import { actualCost, effectiveUtilization, fillRatio, setExtractionRate } from './agents';
import { previousClose, referencePrice, type ClearContext, type ExchangeNode, type Quote } from './clearing';
import { acceptedGrades, availableCash, averageCost, total } from './companies';
import type { Config } from './config';
import { productValue, YIELDS, type FeeLedger, type ProductPrices } from './economics';
import {
  makeOrderId, type Agent, type Ask, type Bid, type ChokepointName, type Fill, type IntegratedMajor, type NodeName, type Order,
  type PlantState, type Producer, type Refiner, type Tick, type Trader, type WellState,
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
      return traderOrders(agent, view, cfg, ids);
  }
}

/** Days of marker history a trader keeps (spec §6.4). */
export const PRICE_MEMORY_DAYS = 20;

/** Adds today's markers to a trader's memory, keeping the last PRICE_MEMORY_DAYS (spec §5 phase 7). */
export function rememberMarkers(trader: Trader, nodes: Readonly<Partial<Record<NodeName, ExchangeNode>>>): void {
  for (const name of NODE_NAMES) {
    const node = nodes[name];
    if (node === undefined) continue;
    const memory = trader.priceMemory[name] ?? [];
    memory.push(node.markerPrice);
    if (memory.length > PRICE_MEMORY_DAYS) memory.shift();
    trader.priceMemory[name] = memory;
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
  // Rule 3: fuller storage, lower ask; and lower again for every day in a row nothing sold.
  const fill = fillRatio(well);
  const unsold = (1 - cfg.ASK_DECAY) ** well.daysUnsold;
  const price = roundUp(Math.max(floor, ref * (1 - cfg.SKEW * (fill - 0.5)) * unsold));

  // Rule 5: when nearly full, the excess above 70% fill goes at a discount — DUMP_DISCOUNT below the
  // reference, never below cash cost. Dumping at cash cost printed trades so low they swung the marker.
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
  if (dumpQty > 0) asks.push(ask(roundUp(Math.max(cost, ref * (1 - cfg.DUMP_DISCOUNT))), dumpQty));
  return asks;
}

/** Yesterday's FOB at an origin, or the marker less freight to the marker region, floored at zero. */
function referenceFob(node: ExchangeNode, origin: Agent['region'], view: MarketView): number {
  const close = node.lastFobByOrigin[origin];
  if (close !== undefined) return close;
  const toMarker = view.routes.route(origin, node.markerRegion);
  return Math.max(0, node.markerPrice - (toMarker?.totalFreight ?? 0));
}

/**
 * After clearing (spec §6.1 rule 3): a producer that offered crude today and sold none counts one
 * more day unsold, so tomorrow's ask comes down; any sale resets the count.
 */
export function recordSales(agents: readonly Agent[], asked: ReadonlySet<Agent['agentId']>, fills: readonly Fill[]): void {
  const sold = new Set(fills.map((f) => f.sellerId));
  for (const a of agents) {
    const well = a.kind === 'PRODUCER' ? a : a.kind === 'INTEGRATED' ? a.well : undefined;
    if (well === undefined) continue;
    well.daysUnsold = asked.has(a.agentId) && !sold.has(a.agentId) ? well.daysUnsold + 1 : 0;
  }
}

/** Days of netback below (or back above) breakeven before an AI producer cuts (or restores) output. */
export const OUTPUT_CUT_DAYS = 10;
/** Output an AI producer cuts to when prices stay below its cost (spec §6.5). */
export const OUTPUT_CUT_RATE = 0.5;
/** Storage fill above which a losing AI producer cuts rather than keeps storing. */
export const OUTPUT_CUT_FILL = 0.8;

/**
 * AI output cuts (spec §6.5, Phases 7–8): an AI producer whose netback — yesterday's price at its
 * origin less the export tariff — has been below breakeven (cash cost plus fixed cost per barrel)
 * for OUTPUT_CUT_DAYS, with storage above 80%, cuts to half output; after as many days back above
 * breakeven it restores full output. From Phase 9 the "Prices below your cost" card replaces this.
 */
export function updateOutput(company: Producer | IntegratedMajor, nodes: MarketView['nodes'], ledger: FeeLedger, tick: Tick, cfg: Config, cutsActive = true): void {
  const well = company.kind === 'INTEGRATED' ? company.well : company;
  const node = nodes[NODE_FOR_GRADE[well.grade]];
  const price = node === undefined ? undefined : referencePrice(node, company.region);
  if (price === undefined) return;
  const netback = price - REGIONS[company.region].infrastructureTariff;
  const breakeven = actualCost(company) + cfg.FIXED_COST_RATE.PRODUCER;
  well.breakevenStreak = netback < breakeven
    ? Math.min(0, well.breakevenStreak) - 1
    : Math.max(0, well.breakevenStreak) + 1;
  // The streak is always tracked (the cards read it); the automatic cut is for AI companies when
  // no cards are in play.
  if (!cutsActive || company.controller !== 'AI') return;
  if (well.breakevenStreak <= -OUTPUT_CUT_DAYS && fillRatio(well) > OUTPUT_CUT_FILL && well.extractionRate > OUTPUT_CUT_RATE) {
    setExtractionRate(company, OUTPUT_CUT_RATE, ledger, tick, cfg);
  } else if (well.breakevenStreak >= OUTPUT_CUT_DAYS && well.extractionRate < 1 && !well.shutIn) {
    setExtractionRate(company, 1, ledger, tick, cfg);
  }
}

// ─── Refiners (spec §6.2) ────────────────────────────────────────────────────────────────────

/**
 * What a refinery bids for a delivered barrel (spec §6.2). A little short, it offers a small
 * premium over the reference (URGENCY); seriously short, it climbs towards the most the barrel is
 * worth, reaching it with empty tanks. Never above that ceiling. With no reference, the ceiling.
 */
export function bidPrice(reference: number | null, ceiling: number, starvation: number, cfg: Config): number {
  if (reference === null) return ceiling;
  const premium = reference * (1 + cfg.URGENCY * starvation);
  const climb = reference + Math.max(0, ceiling - reference) * starvation;
  return Math.min(ceiling, Math.max(premium, climb));
}

export interface NodeChoice {
  readonly node: NodeName;
  /** The most a delivered barrel is worth to this plant from the cheapest origin. */
  readonly deliveredMax: number;
  /** Cheapest previous-close landed price, or null when this node has no reference. */
  readonly referenceLanded: number | null;
  /** Days at sea from the cheapest origin (or the marker region, with no reference). */
  readonly transit: number;
}

function refinerBids(
  company: Refiner | IntegratedMajor, plant: PlantState, view: MarketView, cfg: Config, aggression: number, ids: () => ReturnType<typeof makeOrderId>,
): Bid[] {
  const utilization = effectiveUtilization(plant);
  if (utilization === 0 || company.insolvent) return [];   // an offline plant needs nothing; an insolvent company may not bid (D11)
  const lot = cfg.LOT_SIZE;
  const best = bestNode(company, plant, view, cfg);
  if (best === null) return [];

  // Quantity: keep TARGET_DAYS of use in the tanks when today's purchase lands. Barrels at sea
  // count as held, so the target also covers what the plant will use while this cargo sails.
  const held = total(plant.crudeStock) + plant.inboundBarrels;
  const dailyUse = plant.processingCapacity * utilization;
  const target = (cfg.TARGET_DAYS + best.transit) * dailyUse;
  const ceiling = best.deliveredMax * (1 + aggression);
  const starvation = target > 0 ? clamp01(1 - held / target) : 0;
  const price = roundDown(bidPrice(best.referenceLanded, ceiling, starvation, cfg));
  if (!(price > 0)) return [];
  // Tank space when this purchase lands: what is held now, less what the plant uses on the way.
  const space = plant.crudeStorageCapacity - Math.max(0, held - dailyUse * best.transit);
  const affordable = availableCash(company) / price;
  const qty = lots(Math.min(target - held, space, affordable), lot);
  if (qty <= 0) return [];

  return [{
    orderId: ids(), agentId: company.agentId, node: best.node, side: 'BID', limitPrice: price, qty, qtyRemaining: qty,
    deliveryRegion: company.region, avoidChokepoints: [...view.avoid],
  }];
}

/** Each node the plant can refine, valued as §6.2 rules 1–2 describe. */
function valueNodes(company: Refiner | IntegratedMajor, plant: PlantState, view: MarketView, cfg: Config): NodeChoice[] {
  const ctx: ClearContext = { routes: view.routes, tick: view.tick, config: cfg };
  const choices: NodeChoice[] = [];
  for (const nodeName of NODE_NAMES) {
    const node = view.nodes[nodeName];
    if (node === undefined || !acceptedGrades(plant.techTier).includes(node.grade)) continue;
    const quotes: Quote[] = previousClose(node, company.region, ctx, view.avoid);
    const cheapest = quotes[0];
    const transit = cheapest?.route.totalTransit ?? view.routes.route(node.markerRegion, company.region, view.avoid)?.totalTransit ?? 0;
    const value = productValue(node.grade, view.expectedPrices) - YIELDS[node.grade].opex;
    choices.push({ node: nodeName, deliveredMax: value - cfg.CARRY_RATE * transit, referenceLanded: cheapest?.landed ?? null, transit });
  }
  return choices;
}

/** §6.2 rule 3: the best margin over the reference; with no reference anywhere, the highest value. */
function bestNode(company: Refiner | IntegratedMajor, plant: PlantState, view: MarketView, cfg: Config): NodeChoice | null {
  const choices = valueNodes(company, plant, view, cfg);
  if (choices.length === 0) return null;
  const withRef = choices.filter((c) => c.referenceLanded !== null);
  return withRef.length > 0
    ? withRef.reduce((a, b) => (b.deliveredMax - (b.referenceLanded ?? 0) > a.deliveredMax - (a.referenceLanded ?? 0) ? b : a))
    : choices.reduce((a, b) => (b.deliveredMax > a.deliveredMax ? b : a));
}

/**
 * The node a refinery would buy on today, with the most a delivered barrel is worth to it and the
 * cheapest reference landed price (spec §6.2). Cards use it to price emergency purchases.
 */
export function refinerQuote(company: Refiner | IntegratedMajor, view: MarketView, cfg: Config): NodeChoice | null {
  return bestNode(company, company.kind === 'INTEGRATED' ? company.plant : company, view, cfg);
}

/** Lowest run rate the throttle will cut to (spec §6.5). */
export const THROTTLE_FLOOR = 0.30;
/** How far the throttle moves the run rate in a day (spec §6.5). */
export const THROTTLE_STEP = 0.10;

/**
 * The crack-spread throttle (spec §6.5), run every day before orders: if a barrel delivered from
 * the cheapest origin of the best node is worth less than it costs, cut the run rate 10% towards a
 * 30% floor; otherwise raise it 10%, never above the cap cards set. With no price reference it holds.
 */
export function updateThrottle(company: Refiner | IntegratedMajor, view: MarketView, cfg: Config): void {
  const plant = company.kind === 'INTEGRATED' ? company.plant : company;
  if (plant.utilizationCapUntil > 0 && view.tick > plant.utilizationCapUntil) {
    plant.utilizationCap = 1;   // a card's temporary cap has run its course
    plant.utilizationCapUntil = 0;
  }
  const best = bestNode(company, plant, view, cfg);
  if (best === null || best.referenceLanded === null) return;
  // The margin the "Refining is losing money" and "Margins are strong" cards watch (spec G4.4).
  plant.lastMargin = best.deliveredMax - best.referenceLanded;
  plant.lowMarginDays = plant.lastMargin < cfg.FIXED_COST_RATE.REFINER ? plant.lowMarginDays + 1 : 0;
  const flatOut = view.tick <= plant.fullRunUntil;
  const next = best.deliveredMax < best.referenceLanded && !flatOut
    ? Math.max(THROTTLE_FLOOR, plant.utilization - THROTTLE_STEP)
    : Math.min(plant.utilizationCap, flatOut ? 1 : plant.utilization + THROTTLE_STEP);
  plant.utilization = Math.round(next * 100) / 100;   // keep to whole percent, free of float drift
}

// ─── Traders (spec §6.4) ─────────────────────────────────────────────────────────────────────

/**
 * Arbitrage between regions (spec §6.4): at every office, for every grade, an ask from the hub
 * and a bid delivered into it, HALF_SPREAD either side of the local reference — the bid also net of
 * the export tariff due on resale — and shifted away from inventory — an empty hub
 * quotes higher (keen to buy), a full one lower (keen to sell). Asks offer half the stock, or all of
 * it when the marker is above its 20-day average. Bids use half the room left — the least of free
 * tank space, the rest of MAX_RISK_LIMIT and cash, shared across every office and grade — or all
 * of it when the marker sits below its average by more than the cost of holding stock for HOLD_TICKS.
 */
function traderOrders(trader: Trader, view: MarketView, cfg: Config, ids: () => ReturnType<typeof makeOrderId>): Order[] {
  const lot = cfg.LOT_SIZE;
  const nodeNames = NODE_NAMES.filter((n) => view.nodes[n] !== undefined);
  if (nodeNames.length === 0) return [];

  // Everything held, valued at today's markers, counts against the risk limit.
  let position = 0;
  for (const hub of Object.values(trader.hubs)) {
    if (hub === undefined) continue;
    for (const name of nodeNames) {
      const node = view.nodes[name] as ExchangeNode;
      position += (hub.stock[node.grade] + hub.escrow[node.grade]) * node.markerPrice;
    }
  }
  const slots = trader.offices.length * nodeNames.length;
  const budget = Math.max(0, cfg.MAX_RISK_LIMIT - position) / slots;
  const cashPerSlot = trader.insolvent ? 0 : Math.max(0, availableCash(trader)) / slots;

  const orders: Order[] = [];
  for (const office of trader.offices) {
    const hub = trader.hubs[office];
    if (hub === undefined) continue;
    // Crude already on its way counts as held: it will need the space, and it is already bought.
    const fill = hub.capacity > 0 ? (total(hub.stock) + total(hub.escrow) + total(hub.inbound)) / hub.capacity : 1;
    const shift = -2 * cfg.HALF_SPREAD * (fill - 0.5);
    const freePerGrade = Math.max(0, hub.capacity - total(hub.stock) - total(hub.escrow) - total(hub.inbound)) / nodeNames.length;

    for (const name of nodeNames) {
      const node = view.nodes[name] as ExchangeNode;
      const trend = markerTrend(trader, name, node.markerPrice, cfg);

      const held = hub.stock[node.grade];
      const askQty = lots(trend === 'rich' ? held : held / 2, lot);
      if (askQty > 0) {
        // Never sell below what the barrels cost delivered, plus the export tariff and the spread —
        // unless the hub is nearly full, when space matters more than the margin (spec §6.4).
        const floor = fill >= cfg.TRADER_CLEAR_FILL ? 0 : averageCost(hub, node.grade) + cfg.HALF_SPREAD;
        const price = roundUp(Math.max(0.01, floor, referenceFob(node, office, view) + cfg.HALF_SPREAD + shift));
        orders.push({ orderId: ids(), agentId: trader.agentId, node: name, side: 'ASK', limitPrice: price, qty: askQty, qtyRemaining: askQty, originRegion: office });
      }

      // Buy delivered into this office well below what the crude resells for here: a margin the
      // size of the region's tariff, plus the spread. It fills only when crude from elsewhere lands
      // cheaper than the local price — a gap between regions — which is the trader's whole edge.
      const price = roundDown(referenceFob(node, office, view) - REGIONS[office].infrastructureTariff - cfg.HALF_SPREAD + shift);
      if (!(price > 0)) continue;
      const room = Math.min(freePerGrade, budget / price, cashPerSlot / price);
      const bidQty = lots(trend === 'cheap' ? room : room / 2, lot);
      if (bidQty > 0) {
        orders.push({
          orderId: ids(), agentId: trader.agentId, node: name, side: 'BID', limitPrice: price, qty: bidQty, qtyRemaining: bidQty,
          deliveryRegion: office, avoidChokepoints: [...view.avoid],
        });
      }
    }
  }
  return orders;
}

/** Where today's marker sits against the trader's 20-day memory (spec §6.4 storage arbitrage). */
function markerTrend(trader: Trader, node: NodeName, marker: number, cfg: Config): 'cheap' | 'rich' | 'normal' {
  const memory = trader.priceMemory[node];
  if (memory === undefined || memory.length === 0) return 'normal';
  const average = memory.reduce((s, x) => s + x, 0) / memory.length;
  if (marker < average - cfg.STORAGE_CARRY * cfg.HOLD_TICKS) return 'cheap';
  if (marker > average) return 'rich';
  return 'normal';
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
