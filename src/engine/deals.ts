// Deals: fixed-price, fixed-volume, fixed-term supply agreements (spec §4.4, G4.3, §5 phase 5a).
//
// The player sees six facts; everything else happens here. Deliveries run every day before the
// spot market, in deal-ID order, so deal cargo claims pipeline space first. The buyer pays when
// the oil is loaded and carries the route risk; the seller pays its export tariff, and pays the
// buyer SHORTFALL_RATE for any barrels it could not load. Deal trades never touch marker prices.

import { acceptedGrades, plantOf, wellOf } from './companies';
import type { Config } from './config';
import { FeeKind, type Grade, type Personality } from './enums';
import type { ExchangeNode } from './clearing';
import { recordFee, type FeeLedger } from './economics';
import {
  makeDealId, newCargo, type Agent, type AgentId, type Cargo, type CargoId, type ChokepointName, type Deal, type DealId,
  type RegionName, type Route, type Tick,
} from './model';
import type { RouteProvider } from './routes';
import { REGIONS } from '../data/regions';

export interface DealTerms {
  readonly sellerId: AgentId;
  readonly buyerId: AgentId;
  readonly grade: Grade;
  readonly originRegion: RegionName;
  readonly deliveryRegion: RegionName;
  readonly qtyPerDay: number;
  /** 30 or 90 days (DEAL_TERMS). */
  readonly termDays: number;
  readonly price: number;
  readonly avoidChokepoints: readonly ChokepointName[];
  readonly linkedDealId?: DealId;
}

/**
 * The fixed price for a new deal (spec G4.3): the origin's 20-day average close, adjusted 2% by
 * the offering company's personality — an Aggressive offerer takes 2% its own way, a Conservative
 * one concedes 2%. Falls back to the latest close, then the node's marker.
 */
export function priceDeal(node: ExchangeNode, origin: RegionName, offeredBy: 'SELLER' | 'BUYER', personality: Personality | null): number {
  const history = node.fobHistory[origin] ?? [];
  const base = history.length > 0
    ? history.reduce((s, x) => s + x, 0) / history.length
    : node.lastFobByOrigin[origin] ?? node.markerPrice;
  const lean = personality === 'AGGRESSIVE' ? 0.02 : personality === 'CONSERVATIVE' ? -0.02 : 0;
  const factor = 1 + (offeredBy === 'SELLER' ? lean : -lean);
  return Math.round(base * factor * 100) / 100;
}

/**
 * Signs a deal starting tomorrow (spec G4.3). Refuses anything a company could not physically do,
 * and anything that would put more than DEAL_MAX_SHARE of either side's capacity under deals.
 */
export function signDeal(
  terms: DealTerms, agents: ReadonlyMap<AgentId, Agent>, existing: readonly Deal[], seq: number, tick: Tick, config: Config,
): Deal {
  const seller = find(agents, terms.sellerId);
  const buyer = find(agents, terms.buyerId);
  const fail = (why: string): never => { throw new Error(`Cannot sign a deal between ${seller.name} and ${buyer.name}: ${why}`); };
  if (seller.agentId === buyer.agentId) fail('a company cannot deal with itself');
  if (terms.qtyPerDay % config.LOT_SIZE !== 0) fail(`${terms.qtyPerDay} bbl/day is not a whole number of lots`);
  if (terms.qtyPerDay < config.DEAL_VOLUME.min || terms.qtyPerDay > config.DEAL_VOLUME.max) {
    fail(`volume must be ${config.DEAL_VOLUME.min}–${config.DEAL_VOLUME.max} bbl/day`);
  }
  if (!config.DEAL_TERMS.includes(terms.termDays)) fail(`the term must be one of ${config.DEAL_TERMS.join(' or ')} days`);
  if (!(terms.price > 0)) fail('the price must be positive');

  const sellCapacity = sellerCapacity(seller, terms.originRegion, terms.grade) ?? fail(`${seller.name} cannot supply ${terms.grade} from ${terms.originRegion}`);
  const buyCapacity = buyerCapacity(buyer, terms.deliveryRegion, terms.grade) ?? fail(`${buyer.name} cannot take ${terms.grade} in ${terms.deliveryRegion}`);
  const committed = (id: AgentId, side: 'sellerId' | 'buyerId') =>
    existing.filter((d) => d.status === 'ACTIVE' && d[side] === id).reduce((s, d) => s + d.qtyPerDay, 0);
  if (committed(seller.agentId, 'sellerId') + terms.qtyPerDay > config.DEAL_MAX_SHARE * sellCapacity) {
    fail(`${seller.name} would have more than ${config.DEAL_MAX_SHARE * 100}% of its capacity under deals`);
  }
  if (committed(buyer.agentId, 'buyerId') + terms.qtyPerDay > config.DEAL_MAX_SHARE * buyCapacity) {
    fail(`${buyer.name} would have more than ${config.DEAL_MAX_SHARE * 100}% of its capacity under deals`);
  }

  return {
    dealId: makeDealId(seq),
    sellerId: seller.agentId,
    buyerId: buyer.agentId,
    grade: terms.grade,
    originRegion: terms.originRegion,
    deliveryRegion: terms.deliveryRegion,
    qtyPerDay: terms.qtyPerDay,
    price: terms.price,
    startTick: tick + 1,
    endTick: tick + 1 + terms.termDays,
    avoidChokepoints: [...terms.avoidChokepoints],
    linkedDealId: terms.linkedDealId ?? null,
    status: 'ACTIVE',
    deliveredBbl: 0,
    shortfallBbl: 0,
  };
}

/** Barrels a company must deliver under its deals on a given day (spec §6.1 rule 4). */
export function dealCommitments(deals: readonly Deal[], sellerId: AgentId, day: Tick): number {
  return deals
    .filter((d) => d.status === 'ACTIVE' && d.sellerId === sellerId && d.startTick <= day && day < d.endTick)
    .reduce((s, d) => s + d.qtyPerDay, 0);
}

export interface DealDelivery {
  readonly dealId: DealId;
  /** Barrels loaded today. */
  readonly delivered: number;
  /** Barrels the seller could not supply. */
  readonly shortfall: number;
  /** Of those loaded, barrels waiting at the origin for pipeline space. */
  readonly held: number;
}

/**
 * Phase 5a (spec §5): first, deal cargo waiting at its origin tries again for a route; then every
 * active deal delivers, in deal-ID order. New cargo is appended to `cargo`.
 */
export function deliverDeals(
  deals: Deal[], cargo: Cargo[], agents: ReadonlyMap<AgentId, Agent>, routes: RouteProvider, ledger: FeeLedger, tick: Tick, config: Config,
): DealDelivery[] {
  const byId = new Map(deals.map((d) => [d.dealId, d]));
  const waiting = cargo.filter((c) => c.awaitingRoute);
  for (const c of waiting) {
    const deal = c.dealId === null ? undefined : byId.get(c.dealId);
    dispatch(c, deal?.avoidChokepoints ?? [], cargo, agents, routes, ledger, tick);
  }

  const report: DealDelivery[] = [];
  const ordered = [...deals].sort((a, b) => (a.dealId < b.dealId ? -1 : a.dealId > b.dealId ? 1 : 0));
  for (const deal of ordered) {
    if (deal.status !== 'ACTIVE') continue;
    if (tick >= deal.endTick) { deal.status = 'ENDED'; continue; }
    if (tick < deal.startTick) continue;

    const seller = find(agents, deal.sellerId);
    const buyer = find(agents, deal.buyerId);
    const stock = stockOf(seller, deal.originRegion, deal.grade);
    const qty = Math.max(0, Math.min(deal.qtyPerDay, stock.available));
    const shortfall = deal.qtyPerDay - qty;

    if (qty > 0) {
      stock.take(qty);
      const goods = deal.price * qty;
      const tariff = REGIONS[deal.originRegion].infrastructureTariff * qty;
      buyer.cash -= goods;
      seller.cash += goods - tariff;
      recordFee(ledger, { tick, agentId: seller.agentId, kind: FeeKind.ORIGIN_TARIFF, amount: tariff });
      const plant = plantOf(buyer);
      if (plant && buyer.region === deal.deliveryRegion) plant.inboundBarrels += qty;
    }
    if (shortfall > 0) {
      // Compensation is a transfer between the two companies, not a cost to the economy.
      const penalty = config.SHORTFALL_RATE * deal.price * shortfall;
      seller.cash -= penalty;
      buyer.cash += penalty;
    }
    deal.deliveredBbl += qty;
    deal.shortfallBbl += shortfall;

    let held = 0;
    if (qty > 0) {
      const loaded = newCargo({
        cargoId: `${deal.dealId}-${String(tick).padStart(5, '0')}` as CargoId, ownerId: buyer.agentId, grade: deal.grade, qty,
        origin: deal.originRegion, destination: deal.deliveryRegion, route: NO_ROUTE, dispatchTick: tick, dealId: deal.dealId,
      });
      loaded.awaitingRoute = true;
      loaded.status = 'HELD';
      cargo.push(loaded);
      dispatch(loaded, deal.avoidChokepoints, cargo, agents, routes, ledger, tick);
      held = loaded.awaitingRoute ? loaded.qty : 0;
    }
    report.push({ dealId: deal.dealId, delivered: qty, shortfall, held });
  }
  return report;
}

/**
 * Cancels a deal (spec G4.3): the company that walks away pays the other CANCEL_RATE of the value
 * still to be delivered. Returns the fee. Cargo already loaded continues to its buyer.
 */
export function cancelDeal(deal: Deal, by: AgentId, agents: ReadonlyMap<AgentId, Agent>, tick: Tick, config: Config): number {
  if (deal.status !== 'ACTIVE') throw new Error(`${deal.dealId} is not active`);
  if (by !== deal.sellerId && by !== deal.buyerId) throw new Error(`${by} is not a party to ${deal.dealId}`);
  const daysLeft = Math.max(0, deal.endTick - Math.max(tick + 1, deal.startTick));
  const fee = config.CANCEL_RATE * deal.price * deal.qtyPerDay * daysLeft;
  const payer = find(agents, by);
  const payee = find(agents, by === deal.sellerId ? deal.buyerId : deal.sellerId);
  payer.cash -= fee;
  payee.cash += fee;
  deal.status = 'CANCELLED';
  return fee;
}

/**
 * Reroutes half a deal (spec §4.4, a card's Maybe): the deal ends and two deals replace it for the
 * rest of its term, one on the old avoid list and one on the new, splitting the volume in whole lots.
 */
export function splitDeal(deal: Deal, avoid: readonly ChokepointName[], seqs: readonly [number, number], tick: Tick, config: Config): [Deal, Deal] {
  if (deal.status !== 'ACTIVE') throw new Error(`${deal.dealId} is not active`);
  const first = Math.floor(deal.qtyPerDay / 2 / config.LOT_SIZE) * config.LOT_SIZE;
  if (first === 0) throw new Error(`${deal.dealId} is a single lot a day and cannot be split`);
  const startTick = Math.max(deal.startTick, tick + 1);
  const half = (seq: number, qtyPerDay: number, avoidChokepoints: readonly ChokepointName[]): Deal => ({
    ...deal, dealId: makeDealId(seq), qtyPerDay, avoidChokepoints: [...avoidChokepoints], startTick, deliveredBbl: 0, shortfallBbl: 0,
  });
  deal.status = 'ENDED';
  return [half(seqs[0], first, deal.avoidChokepoints), half(seqs[1], deal.qtyPerDay - first, avoid)];
}

// ─── Internals ───────────────────────────────────────────────────────────────────────────────

/** Placeholder route for cargo still waiting at its origin. */
const NO_ROUTE: Route = { edges: [], totalFreight: 0, totalTransit: 0, chokepoints: [] };

/**
 * Sends waiting deal cargo on its way, as far as pipeline space allows. Each route used carries
 * as much as it can; what fits leaves as its own cargo, and whatever finds no space keeps waiting.
 * The buyer pays freight for what leaves.
 */
function dispatch(
  c: Cargo, avoid: readonly ChokepointName[], cargo: Cargo[], agents: ReadonlyMap<AgentId, Agent>, routes: RouteProvider, ledger: FeeLedger, tick: Tick,
): void {
  const owner = find(agents, c.ownerId);
  let part = 0;
  while (c.qty > 0) {
    const route = routes.route(c.origin, c.destination, avoid, owner.agentId);
    if (route === null) return;
    const qty = routes.reserve(route, c.qty, owner.agentId);
    if (qty <= 0) return;
    const freight = route.totalFreight * qty;
    owner.cash -= freight;
    recordFee(ledger, { tick, agentId: owner.agentId, kind: FeeKind.FREIGHT, amount: freight });

    if (qty === c.qty) {
      // Everything fits: this cargo itself leaves.
      c.route = route;
      c.awaitingRoute = false;
      c.status = 'MOVING';
      c.leg = 0;
      c.ticksLeft = route.edges.length === 0 ? 1 : 0;
      return;
    }
    // Only part fits: that part leaves as a new cargo, the rest waits.
    cargo.push(newCargo({
      cargoId: `${c.cargoId}-${String(tick).padStart(5, '0')}-${part++}` as CargoId, ownerId: c.ownerId, grade: c.grade, qty,
      origin: c.origin, destination: c.destination, route, dispatchTick: tick, dealId: c.dealId,
    }));
    c.qty -= qty;
  }
}

/** The seller's barrels of a grade at an origin, and how to take them. */
function stockOf(seller: Agent, origin: RegionName, grade: Grade): { available: number; take: (qty: number) => void } {
  const well = wellOf(seller);
  if (well && seller.region === origin && well.grade === grade) {
    return { available: well.storage, take: (qty) => { well.storage -= qty; } };
  }
  if (seller.kind === 'TRADER') {
    const hub = seller.hubs[origin];
    if (hub) return { available: hub.stock[grade], take: (qty) => { hub.stock[grade] -= qty; } };
  }
  return { available: 0, take: () => undefined };
}

/** What a seller can supply from an origin, per day; undefined if it cannot supply there at all. */
function sellerCapacity(seller: Agent, origin: RegionName, grade: Grade): number | undefined {
  const well = wellOf(seller);
  if (well) return seller.region === origin && well.grade === grade ? well.extractionCapacity : undefined;
  if (seller.kind === 'TRADER') return seller.hubs[origin]?.capacity;
  return undefined;
}

/** What a buyer can take in a region, per day; undefined if it cannot take that grade there. */
function buyerCapacity(buyer: Agent, region: RegionName, grade: Grade): number | undefined {
  const plant = plantOf(buyer);
  if (plant) return buyer.region === region && acceptedGrades(plant.techTier).includes(grade) ? plant.processingCapacity : undefined;
  if (buyer.kind === 'TRADER') return buyer.hubs[region]?.capacity;
  return undefined;
}

function find(agents: ReadonlyMap<AgentId, Agent>, id: AgentId): Agent {
  const agent = agents.get(id);
  if (agent === undefined) throw new Error(`Unknown company ${id}`);
  return agent;
}
