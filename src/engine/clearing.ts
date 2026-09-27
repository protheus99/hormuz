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
  type AgentId, type Ask, type Bid, type ChokepointName, type Fill, type NodeName, type Order, type RegionName, type Route, type Tick,
} from './model';
import type { RouteProvider } from './routes';
import { freightPerBarrel } from '../data/vessels';
import { portHasRoom, usePort, type Ports } from './transport';

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
  /**
   * The closing offers: each origin's lowest ask left unsold at the end of the last clearing
   * (spec §8 rule 7). Buyers see crude that did not sell, so a stale close cannot hide it.
   */
  lastOfferByOrigin: Partial<Record<RegionName, number>>;
}

/** Days of closes kept for deal pricing (spec G4.3). */
export const FOB_HISTORY_DAYS = 20;

export interface ClearContext {
  readonly routes: RouteProvider;
  readonly tick: Tick;
  readonly config: Config;
  /**
   * Every region's port. A trade needs a place free at both ends today - one to load at and one to
   * discharge at - because a cargo has to be worked at each (§3.5, D66). Absent in the harnesses
   * that clear a book with no world behind it, and then nothing is limited.
   */
  readonly ports?: Ports;
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
  return { name, grade, markerRegion, orders: [], fills: [], markerPrice: startingMarker, lastFobByOrigin: {}, fobHistory: {}, lastOfferByOrigin: {} };
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
  /**
   * What a barrel of this parcel costs to move, at the rate its size earns (§7.4, D65). Carried on
   * the candidate rather than worked out again at the fill, so the price the match was made at and
   * the price the buyer is charged can never differ.
   */
  readonly freight: number;
  /** bid − landed: the value the trade creates, split evenly between buyer and seller. */
  readonly surplus: number;
  /** Whose pipeline space the cargo uses: the buyer's, or the seller's reservation (spec G4.4). */
  readonly shipper: AgentId;
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
    // Rule 3 and 5: limited by both orders and by the route's spare capacity today, counted
    // against whichever side's pipeline space the pair ships on.
    // A place at each end, today. A cargo is worked twice - loaded where it starts and discharged
    // where it lands - and a port out of places is out for everybody (§3.5, D66). Checked here and
    // not where the candidate was priced: every candidate is built before any of them fills, so at
    // that moment every port still looks empty.
    if (ctx.ports !== undefined
      && !(portHasRoom(ctx.ports, c.ask.originRegion) && portHasRoom(ctx.ports, c.bid.deliveryRegion))) {
      continue;
    }
    const capacity = ctx.routes.capacityLeft(c.route, c.shipper);
    const ordersAllow = Math.min(c.bid.qtyRemaining, c.ask.qtyRemaining);
    const qty = Math.floor(Math.min(ordersAllow, capacity) / lot) * lot;   // whole lots only

    // The route runs out before the orders do: after taking what fits, ask for the next usable
    // route and, if the pair still creates surplus on it, queue it again at its new rank (spec §3.5).
    const routeBinds = capacity < ordersAllow && ordersAllow - qty >= lot;
    if (qty <= 0) {
      if (routeBinds) requeue(candidates, i, c, ctx);
      continue;
    }

    ctx.routes.reserve(c.route, qty, c.shipper);
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
      // The rate the parcel's own size earns it, which is what settlement will charge. Recording
      // the lane's base rate here instead would put the day book at odds with the cash.
      // The rate the candidate was priced at, not one worked out again from the filled quantity: a
      // partial fill must not be charged a small-parcel rate the match never offered.
      freight: c.freight,
      destinationTariff: c.tariff,
      landedPrice: fobPrice + c.freight + c.tariff,
      originRegion: c.ask.originRegion,
      deliveryRegion: c.bid.deliveryRegion,
      route: c.route,
      dealId: null,
    });
    // The cargo this fill becomes is worked at each end, so it takes a place at both (§3.5, D66).
    if (ctx.ports !== undefined) {
      usePort(ctx.ports, c.ask.originRegion);
      usePort(ctx.ports, c.bid.deliveryRegion);
    }
  }

  // Rule 7 (offers): publish each origin's lowest unsold ask before the book is emptied.
  const offers: Partial<Record<RegionName, number>> = {};
  for (const ask of asks) {
    if (ask.qtyRemaining <= 0) continue;
    const best = offers[ask.originRegion];
    if (best === undefined || ask.limitPrice < best) offers[ask.originRegion] = ask.limitPrice;
  }
  node.lastOfferByOrigin = offers;

  // Rule 6: unfilled remainders expire; tomorrow starts with an empty book.
  node.orders = [];
  node.fills = fills;

  // Rule 7: publish the marker and record the close for tomorrow's decisions.
  updateMarker(node, fills, ctx);
  recordClose(node, fills);
  return fills;
}

/**
 * Prices a bid-ask pair on the best route open to the buyer; null if no route or no surplus. The
 * buyer ships the cargo (it pays freight), but a seller that has reserved pipeline space can carry
 * what it sells in it (the "Closure risk on exports" card): the pair uses whichever side has more
 * room. Without reservations both sides see the same shared pool, so the buyer's route stands.
 */
function candidateFor(bid: Bid, ask: Ask, ctx: ClearContext): Candidate | null {
  let route = ctx.routes.route(ask.originRegion, bid.deliveryRegion, bid.avoidChokepoints, bid.agentId);
  let shipper = bid.agentId;
  const sellers = ctx.routes.route(ask.originRegion, bid.deliveryRegion, bid.avoidChokepoints, ask.agentId);
  if (sellers !== null && (route === null || ctx.routes.capacityLeft(sellers, ask.agentId) > ctx.routes.capacityLeft(route, bid.agentId))) {
    route = sellers;
    shipper = ask.agentId;
  }
  if (route === null) return null;
  const tariff = REGIONS[bid.deliveryRegion].infrastructureTariff;
  // The parcel this pair would trade, so the voyage is priced at the rate settlement will really
  // charge for it (§7.4, D65). Pricing the match at a flat lane rate instead let a buyer pay above
  // its own bid the moment a hull cost more than that rate, which §8 rule 4 forbids outright - found
  // by test the day vessel classes went in. The merit order is therefore size-dependent, as it is in
  // life: a seller far away is worth more to a buyer taking a full cargo than to one taking a sliver.
  // What will really ship together, capacity included - a fill becomes one cargo, and that cargo is
  // the parcel a hull is booked for. Pricing on the pair's full intent instead discounted every
  // capacity-limited trade as though a bigger ship had carried it, and took a third off the world's
  // freight bill (measured 2026-09-26).
  const qty = Math.min(bid.qtyRemaining, ask.qtyRemaining, ctx.routes.capacityLeft(route, shipper));
  const landed = ask.limitPrice + freightPerBarrel(route.totalFreight, qty) + tariff;
  const surplus = bid.limitPrice - landed;
  const freight = freightPerBarrel(route.totalFreight, qty);
  return surplus >= 0 ? { bid, ask, route, tariff, landed, surplus, shipper, freight } : null;
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

/** An origin's reference FOB price: the lower of its last trade and yesterday's unsold offer. */
export function referencePrice(node: ExchangeNode, origin: RegionName): number | undefined {
  const close = node.lastFobByOrigin[origin];
  const offer = node.lastOfferByOrigin[origin];
  if (close === undefined) return offer;
  if (offer === undefined) return close;
  return Math.min(close, offer);
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
    const fob = referencePrice(node, origin);
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
