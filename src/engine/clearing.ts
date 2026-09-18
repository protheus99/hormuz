// The spot market: one exchange node per grade, cleared once a day as a batch (spec §8).
//
// Clearing never looks at the order orders arrived in. It scores every workable bid-ask pair by
// surplus (how far the bid exceeds the landed cost), fills the best pairs first, and prints each
// trade at the midpoint. Ties break on order IDs, which come from the company and its sequence,
// never from arrival (spec §4.2) — so the same orders always give the same fills.

import type { Grade } from './enums';
import { NODES } from '../data/nodes';
import { REGIONS } from '../data/regions';
import { isAsk, isBid, type Ask, type Bid, type Fill, type NodeName, type Order, type RegionName, type Route, type Tick } from './model';
import type { RouteProvider } from './routes';

export interface ExchangeNode {
  readonly name: NodeName;
  readonly grade: Grade;
  readonly markerRegion: RegionName;
  /** Today's bids and asks. Emptied when the node clears: orders live one tick (spec §4.2). */
  orders: Order[];
  /** Today's trades. */
  fills: Fill[];
}

export interface ClearContext {
  readonly routes: RouteProvider;
  readonly tick: Tick;
}

export function createNode(name: NodeName): ExchangeNode {
  const { grade, markerRegion } = NODES[name];
  return { name, grade, markerRegion, orders: [], fills: [] };
}

/** Adds an order for today's clearing. Escrow is taken by the caller (Phase 2). */
export function submit(node: ExchangeNode, order: Order): void {
  if (order.node !== node.name) throw new Error(`Order ${order.orderId} is for ${order.node}, not ${node.name}`);
  if (!(order.qty > 0) || order.qtyRemaining !== order.qty) throw new Error(`Order ${order.orderId} has an invalid quantity`);
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

/** Clears the node for today (spec §8, rules 1–4 and 6) and returns the fills. */
export function clear(node: ExchangeNode, ctx: ClearContext): Fill[] {
  const bids = node.orders.filter(isBid);
  const asks = node.orders.filter(isAsk);

  // Rule 2: every pair with a usable route and a non-negative surplus is a candidate.
  const candidates: Candidate[] = [];
  for (const bid of bids) {
    for (const ask of asks) {
      const route = ctx.routes.route(ask.originRegion, bid.deliveryRegion, bid.avoidChokepoints);
      if (route === null) continue;
      const tariff = REGIONS[bid.deliveryRegion].infrastructureTariff;
      const landed = ask.limitPrice + route.totalFreight + tariff;
      const surplus = bid.limitPrice - landed;
      if (surplus >= 0) candidates.push({ bid, ask, route, tariff, landed, surplus });
    }
  }

  // Rule 3: best surplus first; ties by lower landed cost, then bid ID, then ask ID.
  candidates.sort(
    (a, b) =>
      b.surplus - a.surplus ||
      a.landed - b.landed ||
      compareText(a.bid.orderId, b.bid.orderId) ||
      compareText(a.ask.orderId, b.ask.orderId),
  );

  const fills: Fill[] = [];
  for (const c of candidates) {
    const qty = Math.min(c.bid.qtyRemaining, c.ask.qtyRemaining);
    if (qty <= 0) continue;
    c.bid.qtyRemaining -= qty;
    c.ask.qtyRemaining -= qty;

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
  return fills;
}

// Plain character-code comparison. localeCompare is avoided on purpose: it can order text
// differently depending on the player's language settings, which would break determinism.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
