// The spot market: one exchange node per grade, cleared once a day as a batch (spec §8).
//
// Clearing never looks at the order orders arrived in. It scores every workable bid-ask pair by
// surplus (how far the bid exceeds the landed cost), fills the best pairs first, and prints each
// trade at the midpoint. Ties break on order IDs, which come from the company and its sequence,
// never from arrival (spec §4.2) — so the same orders always give the same fills.

import type { Config } from './config';
import type { Grade } from './enums';
import { NODES } from '../data/nodes';
import { REGION_NAMES, REGIONS } from '../data/regions';
import {
  isAsk, isBid,
  type Ask, type Bid, type ChokepointName, type Fill, type NodeName, type Order, type RegionName, type Route, type Tick,
} from './model';
import type { RouteProvider } from './routes';

export interface ExchangeNode {
  readonly name: NodeName;
  readonly grade: Grade;
  readonly markerRegion: RegionName;
  /** Today's bids and asks. Emptied when the node clears: orders live one tick (spec §4.2). */
  orders: Order[];
  /** Today's trades. */
  fills: Fill[];
  /** The node's published price, expressed in its marker region (spec §3.3). */
  markerPrice: number;
  /**
   * The previous close: each origin's volume-weighted FOB price on the last day it traded.
   * Companies price tomorrow's orders from this, because today's market has not cleared yet (spec §6).
   */
  lastFobByOrigin: Partial<Record<RegionName, number>>;
  /** Each origin's close on each of the last 20 days, oldest first; deals are priced from it (spec G4.3). */
  fobHistory: Partial<Record<RegionName, number[]>>;
}

/** Days of closes kept for deal pricing (spec G4.3). */
export const FOB_HISTORY_DAYS = 20;

export interface ClearContext {
  readonly routes: RouteProvider;
  readonly tick: Tick;
  readonly config: Config;
}

/** One origin's price as it would arrive at a destination, using the previous close. */
export interface Quote {
  readonly origin: RegionName;
  readonly fob: number;
  readonly freight: number;
  readonly tariff: number;
  readonly landed: number;
  readonly route: Route;
}

export function createNode(name: NodeName): ExchangeNode {
  const { grade, markerRegion, startingMarker } = NODES[name];
  return { name, grade, markerRegion, orders: [], fills: [], markerPrice: startingMarker, lastFobByOrigin: {}, fobHistory: {} };
}

/** Adds an order for today's clearing. Escrow is taken by the caller (Phase 2). */
export function submit(node: ExchangeNode, order: Order, config: Config): void {
  if (order.node !== node.name) throw new Error(`Order ${order.orderId} is for ${order.node}, not ${node.name}`);
  if (!(order.qty > 0) || order.qtyRemaining !== order.qty) throw new Error(`Order ${order.orderId} has an invalid quantity`);
  if (order.qty % config.LOT_SIZE !== 0) throw new Error(`Order ${order.orderId} is not a whole number of ${config.LOT_SIZE}-barrel lots`);
  node.orders.push(order);
}

/** A bid and an ask that could trade, with everything needed to rank and settle them. */
interface Candidate {
  readonly bid: Bid;
  readonly ask: Ask;
  readonly route: Route;
  readonly tariff: number;
  /** ask + freight + destination tariff: what the buyer pays if the trade prints at the ask. */
  readonly landed: number;
  /** bid − landed: the value the trade creates, split evenly between buyer and seller. */
  readonly surplus: number;
}

/** Clears the node for today (spec §8) and returns the fills. */
export function clear(node: ExchangeNode, ctx: ClearContext): Fill[] {
  const bids = node.orders.filter(isBid);
  const asks = node.orders.filter(isAsk);

  // Rule 2: every pair from different companies, with a usable route and a non-negative
  // surplus, is a candidate. Skipping same-company pairs is self-trade prevention.
  const candidates: Candidate[] = [];
  for (const bid of bids) {
    for (const ask of asks) {
      if (bid.agentId === ask.agentId) continue;
      const c = candidateFor(bid, ask, ctx);
      if (c !== null) candidates.push(c);
    }
  }

  // Rule 3: best surplus first; ties by lower landed cost, then bid ID, then ask ID.
  candidates.sort(byRank);

  const lot = ctx.config.LOT_SIZE;
  const fills: Fill[] = [];
  // An index loop, because a pair whose route fills up is re-queued further down the list.
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i] as Candidate;
    // Rule 3 and 5: limited by both orders and by the route's spare capacity today. The buyer
    // ships the cargo (it pays freight), so the buyer's share of reserved capacity applies.
    const capacity = ctx.routes.capacityLeft(c.route, c.bid.agentId);
    const ordersAllow = Math.min(c.bid.qtyRemaining, c.ask.qtyRemaining);
    const qty = Math.floor(Math.min(ordersAllow, capacity) / lot) * lot;   // whole lots only

    // The route runs out before the orders do: after taking what fits, ask for the next usable
    // route and, if the pair still creates surplus on it, queue it again at its new rank (spec §3.5).
    const routeBinds = capacity < ordersAllow && ordersAllow - qty >= lot;
    if (qty <= 0) {
      if (routeBinds) requeue(candidates, i, c, ctx);
      continue;
    }

    ctx.routes.reserve(c.route, qty, c.bid.agentId);
    c.bid.qtyRemaining -= qty;
    c.ask.qtyRemaining -= qty;
    if (routeBinds) requeue(candidates, i, c, ctx);

    // Rule 4: the midpoint. The buyer pays at most its bid; the seller receives at least its ask.
    const fobPrice = c.ask.limitPrice + c.surplus / 2;
    fills.push({
      tick: ctx.tick,
      node: node.name,
      buyerId: c.bid.agentId,
      sellerId: c.ask.agentId,
      qty,
      fobPrice,
      freight: c.route.totalFreight,
      destinationTariff: c.tariff,
      landedPrice: fobPrice + c.route.totalFreight + c.tariff,
      originRegion: c.ask.originRegion,
      deliveryRegion: c.bid.deliveryRegion,
      route: c.route,
      dealId: null,
    });
  }

  // Rule 6: unfilled remainders expire; tomorrow starts with an empty book.
  node.orders = [];
  node.fills = fills;

  // Rule 7: publish the marker and record the close for tomorrow's decisions.
  updateMarker(node, fills, ctx);
  recordClose(node, fills);
  return fills;
}

/** Prices a bid-ask pair on the best route open to the buyer; null if no route or no surplus. */
function candidateFor(bid: Bid, ask: Ask, ctx: ClearContext): Candidate | null {
  const route = ctx.routes.route(ask.originRegion, bid.deliveryRegion, bid.avoidChokepoints, bid.agentId);
  if (route === null) return null;
  const tariff = REGIONS[bid.deliveryRegion].infrastructureTariff;
  const landed = ask.limitPrice + route.totalFreight + tariff;
  const surplus = bid.limitPrice - landed;
  return surplus >= 0 ? { bid, ask, route, tariff, landed, surplus } : null;
}

function byRank(a: Candidate, b: Candidate): number {
  return b.surplus - a.surplus
    || a.landed - b.landed
    || compareText(a.bid.orderId, b.bid.orderId)
    || compareText(a.ask.orderId, b.ask.orderId);
}

/**
 * Re-queues a pair whose route filled up, on the next route the buyer can use. It is inserted
 * after position i in rank order, so the list stays sorted and every pair is tried in turn.
 * Each re-queue needs a different route, and routing skips full pipelines, so it terminates.
 */
function requeue(candidates: Candidate[], i: number, c: Candidate, ctx: ClearContext): void {
  const next = candidateFor(c.bid, c.ask, ctx);
  if (next === null || sameRoute(next.route, c.route)) return;
  let j = i + 1;
  while (j < candidates.length && byRank(candidates[j] as Candidate, next) <= 0) j++;
  candidates.splice(j, 0, next);
}

function sameRoute(a: Route, b: Route): boolean {
  return a.edges.length === b.edges.length && a.edges.every((e, k) => e === b.edges[k]);
}

/**
 * The marker is the volume-weighted average of today's spot fills, each converted to the marker
 * region by adding the freight from its origin (spec §3.3). Deal deliveries never count, because
 * deals are priced from the marker. With no usable fills the marker keeps yesterday's value.
 */
export function updateMarker(node: ExchangeNode, fills: readonly Fill[], ctx: ClearContext): void {
  let volume = 0;
  let value = 0;
  for (const f of fills) {
    if (f.dealId !== null) continue;
    const toMarker = ctx.routes.route(f.originRegion, node.markerRegion);
    if (toMarker === null) continue;
    volume += f.qty;
    value += f.qty * (f.fobPrice + toMarker.totalFreight);
  }
  if (volume > 0) node.markerPrice = value / volume;
}

/** Updates the previous close for every origin that traded today; the rest keep their last price. */
function recordClose(node: ExchangeNode, fills: readonly Fill[]): void {
  const totals = new Map<RegionName, { volume: number; value: number }>();
  for (const f of fills) {
    if (f.dealId !== null) continue;
    const t = totals.get(f.originRegion) ?? { volume: 0, value: 0 };
    t.volume += f.qty;
    t.value += f.qty * f.fobPrice;
    totals.set(f.originRegion, t);
  }
  for (const [origin, t] of totals) node.lastFobByOrigin[origin] = t.value / t.volume;
  // Every origin with a close adds today's close to its history, traded today or not.
  for (const origin of REGION_NAMES) {
    const close = node.lastFobByOrigin[origin];
    if (close === undefined) continue;
    const history = node.fobHistory[origin] ?? [];
    history.push(close);
    if (history.length > FOB_HISTORY_DAYS) history.shift();
    node.fobHistory[origin] = history;
  }
}

/**
 * What each origin's crude would cost delivered to `destination`, from the previous close.
 * Cheapest first; ties keep the fixed region order, so the list never varies (spec §6.2).
 */
export function previousClose(
  node: ExchangeNode,
  destination: RegionName,
  ctx: ClearContext,
  avoid: readonly ChokepointName[] = [],
): Quote[] {
  const tariff = REGIONS[destination].infrastructureTariff;
  const quotes: Quote[] = [];
  for (const origin of REGION_NAMES) {
    const fob = node.lastFobByOrigin[origin];
    if (fob === undefined) continue;
    const route = ctx.routes.route(origin, destination, avoid);
    if (route === null) continue;
    quotes.push({ origin, fob, freight: route.totalFreight, tariff, landed: fob + route.totalFreight + tariff, route });
  }
  return quotes.sort((a, b) => a.landed - b.landed);
}

// Plain character-code comparison. localeCompare is avoided on purpose: it can order text
// differently depending on the player's language settings, which would break determinism.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
