// What a player may see (spec G5, G9 rule 4). The view is built inside the game layer from the
// world, copying out only public information and the player's own company, so a server could send
// each player their own view and nothing else. Rivals appear by name, type and region only.

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { NODE_NAMES, type NodeName } from '../data/nodes';
import type { RegionName } from '../data/regions';
import { plantOf, plantsOf, wellOf } from '../engine/companies';
import type { PlantState } from '../engine/model';
import { ChokepointStatus, type Grade, type Product } from '../engine/enums';
import type { AgentId, CompanySettings, DealId } from '../engine/model';
import { barrelsHeld, netWorth, type TickReport, type World } from '../engine/world';
import { leaseCapacity } from '../engine/leases';
import { bidAmount, leasableRegions, mayBid, mayWork } from '../engine/auction';
import { REGIONS } from '../data/regions';
import type { FeeKind } from '../engine/enums';
import type { Alert } from './alerts';
import type { Card, CardType } from './cards/types';
import type { CampaignView } from './campaign';

/** What the view needs from the advisor: this player's cards, Opportunities and reports. */
export interface CardsView {
  readonly cards: readonly Card[];
  readonly opportunities: readonly { readonly type: CardType; readonly title: string }[];
  readonly reports: readonly { readonly tick: number; readonly asOf: number; readonly byRegion: Readonly<Partial<Record<string, number>>> }[];
  /** News, newest first (spec G7.1). */
  readonly news: readonly { readonly tick: number; readonly headline: string; readonly body: string }[];
  /** The campaign scenario's goal and milestones, or null in Sandbox (spec G7.2). */
  readonly campaign: CampaignView | null;
}

/** One day of public prices, kept by the session for charts. */
export interface DailyPrices {
  readonly tick: number;
  readonly markers: Readonly<Record<NodeName, number>>;
  readonly products: Readonly<Record<Product, number>>;
}

export interface MarketView {
  readonly node: NodeName;
  readonly grade: Grade;
  readonly marker: number;
  /** Barrels that changed hands here today, and how many trades that took (spec §8). */
  readonly tradedToday: number;
  readonly trades: number;
  /** The lowest and highest price a barrel fetched today, at the seller's own port. */
  readonly low: number;
  readonly high: number;
  /** Previous close by origin, and each origin's unsold offer (spec §8 rule 7). */
  readonly closes: Readonly<Partial<Record<RegionName, number>>>;
  readonly offers: Readonly<Partial<Record<RegionName, number>>>;
}

export interface OwnCompanyView {
  readonly id: AgentId;
  readonly name: string;
  readonly kind: string;
  readonly region: RegionName;
  readonly settings: CompanySettings;
  readonly cash: number;
  readonly creditLimit: number;
  readonly creditDrawn: number;
  readonly insolvent: boolean;
  /** Cash + inventory at markers + depreciated capital assets − credit drawn (spec G6). */
  readonly netWorth: number;
  /** Capital projects under way. */
  readonly projects: readonly { readonly kind: string; readonly daysLeft: number; readonly dailyCost: number; readonly paused: boolean }[];
  readonly well: null | {
    readonly grade: Grade; readonly capacity: number; readonly storage: number; readonly storageCapacity: number;
    readonly outputRate: number; readonly shutIn: boolean;
    /** The best this field ever managed. Fields decline, and the "running dry" card compares to it. */
    readonly peakCapacity: number;
    /** The ground this company drills (spec §12A). Reserves are never among what is sent. */
    readonly leases: readonly LeaseView[];
  };
  readonly plant: null | PlantView;
  /** Every refinery the company runs: one, or two once it builds a second site (D34). */
  readonly sites: readonly PlantView[];
  readonly hubs: readonly { readonly region: RegionName; readonly capacity: number; readonly stock: Readonly<Record<Grade, number>> }[];
}

/**
 * A lease as a player may see it (spec §12A.2): its published band, its wells and their states. The
 * barrels left in the ground are engine-only and are deliberately absent from this shape, so no
 * screen can show them and no save of a view can leak them.
 */
export interface LeaseView {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly grade: Grade;
  readonly band: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly maxWells: number;
  /** Each well, in the order they were drilled, as what it makes and what it is doing. */
  readonly wells: readonly { readonly id: string; readonly rate: number; readonly status: string; readonly daysLeft: number }[];
  /** What those wells make a day between them, right now. */
  readonly capacity: number;
}

/**
 * The lease register (spec §12A.4): every region that can be leased, who may take ground there, and
 * which blocks are held by whom. Published surveys and ownership only — what anyone's drilling
 * found, and what is left under the ground, stays theirs.
 */
export interface RegionLeases {
  readonly region: RegionName;
  readonly displayName: string;
  readonly leasing: 'OPEN' | 'LICENSED' | 'NATIONAL';
  /** Whether this player may bid for ground here today. */
  readonly mayBid: boolean;
  readonly blocks: readonly {
    readonly name: string; readonly owner: string; readonly mine: boolean;
    readonly band: 'LOW' | 'MEDIUM' | 'HIGH'; readonly slots: number; readonly grade: Grade;
  }[];
}

/** A lot at auction, as a bidder may see it: the survey, the levels, and your own sealed bid. */
export interface LotView {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly displayName: string;
  readonly grade: Grade;
  readonly band: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly slots: number;
  /** Whether this company could work the ground at all, and why not when it could not. */
  readonly canWork: boolean;
  readonly why: string;
  readonly strong: number;
  readonly steady: number;
  readonly reserve: number;
  /** What this company has offered, or null. Nobody else's bid is ever shown.  */
  readonly myBid: number | null;
  readonly daysLeft: number;
}

/**
 * The leaderboard (spec G5), ranked by what each company is worth.
 *
 * This is the one thing about a rival that is published rather than guessed at. G5 keeps what a
 * competitor could act on — today's orders, stock, deals, cash in hand — to the company that holds
 * it; a set of accounts is a different matter, and every listed oil company files them. So the
 * board carries net worth, size and ground, and nothing that would let anyone trade against
 * anybody.
 */
export interface Standing {
  readonly name: string;
  readonly kind: 'PRODUCER' | 'REFINER' | 'INTEGRATED' | 'TRADER';
  readonly region: RegionName;
  readonly displayName: string;
  /** What the company is worth, as it would be published.  */
  readonly netWorth: number;
  /** Barrels a day: pumped for a field, put through for a refinery, held for a trading office. */
  readonly size: number;
  /** Blocks of ground held, for companies that drill. */
  readonly blocks: number;
  readonly mine: boolean;
  /** Which way its worth has moved over the past month. */
  readonly trend: 'UP' | 'DOWN' | 'LEVEL';
}

export interface PlantView {
  readonly region: RegionName;
  readonly techTier: number;
  readonly capacity: number;
  readonly runRate: number;
  readonly online: boolean;
  readonly stock: Readonly<Record<Grade, number>>;
  readonly tankCapacity: number;
  readonly inbound: number;
  readonly offlineDays: number;
  readonly daysSinceMaintenance: number;
}

export interface PlayerView {
  readonly tick: number;
  /** Game length in days, or null for an endless game. */
  readonly lengthDays: number | null;
  readonly company: OwnCompanyView;
  readonly markets: readonly MarketView[];
  readonly products: Readonly<Record<Product, number>>;
  readonly history: readonly DailyPrices[];
  /** The player's own recent days, newest last (spec G5). */
  readonly days: readonly DayLog[];
  /** Who holds which ground, region by region (spec §12A.4). Empty for companies that do not drill. */
  readonly register: readonly RegionLeases[];
  /** Ground up for auction right now, with what a bid would cost. Empty between auctions. */
  readonly lots: readonly LotView[];
  /** Every company, richest first (spec G5). What a set of accounts would say, and no more. */
  readonly standings: readonly Standing[];
  readonly chokepoints: readonly {
    readonly name: ChokepointName; readonly displayName: string; readonly status: ChokepointStatus;
    /** War-risk cover charged on every barrel crossing today, and days added to the crossing. */
    readonly surcharge: number; readonly extraDays: number;
  }[];
  readonly pipelines: readonly { readonly id: string; readonly capacity: number; readonly usedToday: number }[];
  readonly deals: readonly {
    readonly id: DealId; readonly role: 'BUYER' | 'SELLER'; readonly partner: string; readonly grade: Grade;
    readonly qtyPerDay: number; readonly price: number; readonly endTick: number; readonly status: string;
  }[];
  readonly cargo: readonly { readonly grade: Grade; readonly qty: number; readonly destination: RegionName; readonly status: string; readonly daysAtSea: number }[];
  /** Public identity only: rival cash, stock, deals and orders stay hidden (spec G5). */
  readonly rivals: readonly { readonly name: string; readonly kind: string; readonly region: RegionName }[];
  readonly alerts: readonly Alert[];
  /** Open decision cards, raised and opened (spec G4.1). */
  readonly cards: readonly Card[];
  /** Opportunities the player could open today. */
  readonly opportunities: CardsView['opportunities'];
  /** Market reports bought (spec G5). */
  readonly reports: CardsView['reports'];
  readonly news: CardsView['news'];
  readonly campaign: CardsView['campaign'];
}

const siteView = (p: PlantState): PlantView => ({
  region: p.region, techTier: p.techTier, capacity: p.processingCapacity, runRate: p.utilization, online: p.online,
  stock: { ...p.crudeStock }, tankCapacity: p.crudeStorageCapacity, inbound: p.inboundBarrels,
  offlineDays: Math.max(p.outageTicksRemaining, p.maintenanceTicksRemaining), daysSinceMaintenance: p.daysSinceMaintenance,
});

export function buildPlayerView(
  w: World, playerId: AgentId, history: readonly DailyPrices[], days: readonly DayLog[], alerts: readonly Alert[], lengthDays: number | null, cards: CardsView,
  sizesAMonthAgo: Record<string, number> = {},
): PlayerView {
  const me = w.agents.find((a) => a.agentId === playerId);
  if (me === undefined) throw new Error(`No company ${playerId} in this game`);
  const well = wellOf(me);
  const plant = plantOf(me);
  const names = new Map(w.agents.map((a) => [a.agentId, a.name]));

  const company: OwnCompanyView = {
    id: me.agentId, name: me.name, kind: me.kind, region: me.region, settings: { ...me.settings },
    cash: me.cash, creditLimit: me.creditLimit, creditDrawn: me.creditDrawn, insolvent: me.insolvent,
    netWorth: netWorth(w, me),
    projects: w.projects.filter((p) => p.agentId === playerId).map((p) => ({ kind: p.kind, daysLeft: p.ticksLeft, dailyCost: p.dailyCost, paused: p.heldUntil > w.tick })),
    well: well ? {
      grade: well.grade, capacity: well.extractionCapacity, storage: well.storage, storageCapacity: well.storageCapacity,
      outputRate: well.extractionRate, shutIn: well.shutIn, peakCapacity: well.peakCapacity,
      leases: well.leases.map((l) => ({
        id: String(l.leaseId), name: l.name, region: l.region, grade: l.grade, band: l.band, maxWells: l.maxWells,
        wells: l.wells.map((x) => ({ id: String(x.wellId), rate: x.rate, status: x.status, daysLeft: x.ticksRemaining })),
        capacity: leaseCapacity(l),
      })),
    } : null,
    plant: plant ? siteView(plant) : null,
    sites: plantsOf(me).map(siteView),
    hubs: me.kind === 'TRADER'
      ? Object.entries(me.hubs).flatMap(([region, h]) => (h ? [{ region: region as RegionName, capacity: h.capacity, stock: { ...h.stock } }] : []))
      : [],
  };

  return {
    tick: w.tick,
    lengthDays,
    company,
    markets: NODE_NAMES.map((n) => {
      const node = w.nodes[n];
      const prices = node.fills.map((f) => f.fobPrice);
      return {
        node: n, grade: node.grade, marker: node.markerPrice, closes: { ...node.lastFobByOrigin }, offers: { ...node.lastOfferByOrigin },
        tradedToday: node.fills.reduce((t, f) => t + f.qty, 0), trades: node.fills.length,
        low: prices.length > 0 ? Math.min(...prices) : 0, high: prices.length > 0 ? Math.max(...prices) : 0,
      };
    }),
    products: { ...w.sink.prices },
    history,
    days,
    register: leaseRegister(w, playerId),
    lots: lotsFor(w, playerId),
    standings: standingsFor(w, playerId, sizesAMonthAgo),
    chokepoints: (Object.keys(CHOKEPOINTS) as ChokepointName[]).map((c) => {
      const cp = w.graph.chokepoints[c];
      const tense = cp.status === ChokepointStatus.TENSION || cp.status === ChokepointStatus.DELAYED;
      return {
        name: c, displayName: CHOKEPOINTS[c].displayName, status: cp.status,
        surcharge: tense ? cp.freightSurcharge : 0,
        extraDays: cp.status === ChokepointStatus.DELAYED ? cp.delayTicks : 0,
      };
    }),
    pipelines: w.graph.edges.filter((e) => e.capacity !== null).map((e) => ({
      id: String(e.id), capacity: e.capacity ?? 0, usedToday: Object.values(e.usedBy).reduce<number>((s, q) => s + (q ?? 0), 0),
    })),
    deals: w.deals.filter((d) => d.buyerId === playerId || d.sellerId === playerId).map((d) => ({
      id: d.dealId, role: d.buyerId === playerId ? 'BUYER' as const : 'SELLER' as const,
      partner: names.get(d.buyerId === playerId ? d.sellerId : d.buyerId) ?? '?',
      grade: d.grade, qtyPerDay: d.qtyPerDay, price: d.price, endTick: d.endTick, status: d.status,
    })),
    cargo: w.cargo.filter((c) => c.ownerId === playerId).map((c) => ({
      grade: c.grade, qty: c.qty, destination: c.destination, status: c.status, daysAtSea: w.tick - c.dispatchTick,
    })),
    rivals: w.agents.filter((a) => a.agentId !== playerId).map((a) => ({ name: a.name, kind: a.kind, region: a.region })),
    alerts: [...alerts],
    cards: [...cards.cards],
    opportunities: [...cards.opportunities],
    reports: [...cards.reports],
    news: [...cards.news],
    campaign: cards.campaign,
  };
}

/**
 * One day of the player's own trading, kept by the session and shown on the Activity tab (spec G5).
 * The company runs itself, so this is the only place a player can see what it actually did:
 * barrels out of the ground, barrels bought and sold, and what each came to in money.
 */
export interface DayLog {
  readonly tick: number;
  /** Barrels out of the ground, and barrels put through the refinery. */
  readonly pumped: number;
  readonly refined: number;
  /** What the retail market paid for the fuel made today. */
  readonly fuelRevenue: number;
  readonly boughtQty: number;
  /** What the crude itself cost. Shipping it is a cost of its own, below. */
  readonly boughtCost: number;
  readonly soldQty: number;
  readonly soldRevenue: number;
  /** Who the crude went to, and who it came from: one entry a company, biggest first. */
  readonly soldTo: readonly Counterparty[];
  readonly boughtFrom: readonly Counterparty[];
  /** What the day cost, in groups a player can act on. Buying crude is counted separately. */
  readonly costs: DayCosts;
  /** Crude held everywhere at the end of the day, and cash. */
  readonly stock: number;
  readonly cash: number;
}

/** The other side of a day's trading: a named company, since who is buying is public (spec G5). */
export interface Counterparty {
  readonly name: string;
  readonly qty: number;
  /** Where the crude went, or came from. */
  readonly region: RegionName;
  /** Under a deal, or on the day's open market. */
  readonly deal: boolean;
}

export interface DayCosts {
  /** Getting crude out of the ground, and restarting wells that were shut in. */
  readonly pumping: number;
  /** Running the refinery: processing, maintenance and repairs. */
  readonly refining: number;
  /** Freight, tariffs and waiting at a strait. */
  readonly shipping: number;
  /** Keeping the company open: fixed costs, offices, leases, charters, reports and interest. */
  readonly running: number;
  /** Paid out on whatever is being built. */
  readonly building: number;
  readonly total: number;
}

/** Which plain-language group each fee belongs to. */
const COST_GROUP: Readonly<Record<FeeKind, keyof Omit<DayCosts, 'total'>>> = {
  EXTRACTION: 'pumping', RESTART: 'pumping', WELL_SERVICE: 'pumping', WORKOVER: 'pumping',
  // What corners cut cost, under the same heading as the rest of keeping a company open (§12A.6).
  EXPOSURE: 'running', SETTLEMENT: 'running',
  REFINING_OPEX: 'refining', MAINTENANCE: 'refining', REPAIR: 'refining',
  FREIGHT: 'shipping', DEMURRAGE: 'shipping', ORIGIN_TARIFF: 'shipping', DESTINATION_TARIFF: 'shipping',
  FIXED_COST: 'running', OFFICE: 'running', LEASE: 'running', CHARTER: 'running', RESERVATION: 'running',
  REPORT: 'running', CREDIT_INTEREST: 'running',
  CAPITAL: 'building', LEASE_BONUS: 'building',
};

/** The player's day, from the engine's report: spot fills, deal loadings and today's own work. */
export function dayLog(w: World, playerId: AgentId, report: TickReport): DayLog {
  const me = w.agents.find((a) => a.agentId === playerId);
  const work = report.byAgent[playerId];
  let boughtQty = 0, boughtCost = 0, soldQty = 0, soldRevenue = 0;
  const sold = new Map<AgentId, { qty: number; region: RegionName; deal: boolean }>();
  const bought = new Map<AgentId, { qty: number; region: RegionName; deal: boolean }>();
  const add = (into: typeof sold, id: AgentId, qty: number, region: RegionName, deal: boolean) => {
    const at = into.get(id);
    if (at === undefined) into.set(id, { qty, region, deal });
    else at.qty += qty;
  };
  for (const f of report.fills) {
    // Both sides at the price of the crude itself: freight and tariffs are costs, and counting them
    // here as well would charge the same dollar twice.
    if (f.sellerId === playerId) { soldQty += f.qty; soldRevenue += f.fobPrice * f.qty; add(sold, f.buyerId, f.qty, f.deliveryRegion, f.dealId !== null); }
    if (f.buyerId === playerId) { boughtQty += f.qty; boughtCost += f.fobPrice * f.qty; add(bought, f.sellerId, f.qty, f.originRegion, f.dealId !== null); }
  }
  // A deal pays when the crude is loaded, so the day it moves is the day it is worth counting.
  for (const d of report.deliveries) {
    const deal = w.deals.find((x) => x.dealId === d.dealId);
    if (deal === undefined || d.delivered <= 0) continue;
    if (deal.sellerId === playerId) { soldQty += d.delivered; soldRevenue += deal.price * d.delivered; add(sold, deal.buyerId, d.delivered, deal.deliveryRegion, true); }
    if (deal.buyerId === playerId) { boughtQty += d.delivered; boughtCost += deal.price * d.delivered; add(bought, deal.sellerId, d.delivered, deal.originRegion, true); }
  }
  const named = (from: typeof sold): Counterparty[] => [...from.entries()]
    .map(([id, x]) => ({ name: w.agents.find((a) => a.agentId === id)?.name ?? 'someone', qty: x.qty, region: x.region, deal: x.deal }))
    .sort((a, b) => b.qty - a.qty);
  // The ledger holds today's fees only: the engine empties it at the start of every tick.
  const costs = { pumping: 0, refining: 0, shipping: 0, running: 0, building: 0, total: 0 };
  for (const e of w.ledger.entries) {
    if (e.agentId !== playerId) continue;
    costs[COST_GROUP[e.kind]] += e.amount;
    costs.total += e.amount;
  }
  return {
    tick: w.tick,
    costs,
    soldTo: named(sold),
    boughtFrom: named(bought),
    pumped: work?.extracted ?? 0,
    refined: work?.refined ?? 0,
    fuelRevenue: work?.retail ?? 0,
    boughtQty, boughtCost, soldQty, soldRevenue,
    stock: me === undefined ? 0 : barrelsHeld([me], w.cargo.filter((c) => c.ownerId === playerId)),
    cash: me?.cash ?? 0,
  };
}

/** The lots on offer, with this company's own bid. Rival bids are sealed and never sent. */
function lotsFor(w: World, playerId: AgentId): LotView[] {
  const me = w.agents.find((a) => a.agentId === playerId);
  const field = me === undefined ? undefined : wellOf(me);
  const auction = w.auction;
  if (auction === null || me === undefined || field === undefined) return [];
  return auction.lots.map((lot) => {
    const canWork = mayWork(me, lot);
    const wrongGrade = lot.grade !== field.grade;
    return {
      id: lot.lotId,
      name: lot.name,
      region: lot.region,
      displayName: REGIONS[lot.region].displayName,
      grade: lot.grade,
      band: lot.band,
      slots: lot.maxWells,
      canWork,
      why: canWork ? ''
        : wrongGrade ? `Your wells produce ${String(field.grade).toLowerCase().replace('_', ' ')}, not ${String(lot.grade).toLowerCase().replace('_', ' ')}`
        : `You ship from ${REGIONS[me.region].displayName}, and crude cannot be sold from anywhere else`,
      strong: bidAmount(lot, me, w.config, 'STRONG'),
      steady: bidAmount(lot, me, w.config, 'STEADY'),
      reserve: lot.reserve,
      myBid: lot.bids.find((b) => b.agentId === playerId)?.amount ?? null,
      daysLeft: Math.max(0, auction.tick - w.tick),
    };
  });
}

/** How big a company is, in the terms its own trade is measured in. */
function sizeOf(a: World['agents'][number]): number {
  const field = wellOf(a);
  if (a.kind === 'TRADER') {
    let space = 0;
    for (const hub of Object.values(a.hubs)) if (hub) space += hub.capacity;
    return space;
  }
  if (field !== undefined) return field.extractionCapacity;
  return plantsOf(a).reduce((t, p) => t + p.processingCapacity, 0);
}

/** What every company is worth today, for the session to keep so a month's trend can be worked out. */
export function worthNow(w: World): Record<string, number> {
  const worth: Record<string, number> = {};
  for (const a of w.agents) worth[String(a.agentId)] = netWorth(w, a);
  return worth;
}

/** The board, richest first. Nothing here is what a rival could trade against (G5). */
function standingsFor(w: World, playerId: AgentId, before: Record<string, number>): Standing[] {
  return w.agents
    .map((a) => {
      const worth = netWorth(w, a);
      const was = before[String(a.agentId)];
      // A percent either way is the same company having an ordinary month.
      const moved = was === undefined || was === 0 ? 0 : (worth - was) / Math.abs(was);
      return {
        name: a.name,
        kind: a.kind,
        region: a.region,
        displayName: REGIONS[a.region].displayName,
        netWorth: worth,
        size: sizeOf(a),
        blocks: wellOf(a)?.leases.length ?? 0,
        mine: a.agentId === playerId,
        trend: Math.abs(moved) < 0.01 ? 'LEVEL' as const : moved > 0 ? 'UP' as const : 'DOWN' as const,
      };
    })
    .sort((x, y) => y.netWorth - x.netWorth);
}

/** The register, built from every company's ground. Reserves and well counts are left out. */
function leaseRegister(w: World, playerId: AgentId): RegionLeases[] {
  const me = w.agents.find((a) => a.agentId === playerId);
  if (me === undefined || wellOf(me) === undefined) return [];
  const rows: RegionLeases[] = [];
  for (const region of leasableRegions()) {
    const blocks: RegionLeases['blocks'] = w.agents.flatMap((a) =>
      (wellOf(a)?.leases ?? [])
        .filter((l) => l.region === region)
        .map((l) => ({ name: l.name, owner: a.name, mine: a.agentId === playerId, band: l.band, slots: l.maxWells, grade: l.grade })));
    rows.push({
      region,
      displayName: REGIONS[region].displayName,
      leasing: REGIONS[region].leasing,
      mayBid: mayBid(me, region),
      blocks,
    });
  }
  return rows;
}

/** Today's public prices, for the session's history. */
export function dailyPrices(w: World): DailyPrices {
  const markers = {} as Record<NodeName, number>;
  for (const n of NODE_NAMES) markers[n] = w.nodes[n].markerPrice;
  return { tick: w.tick, markers, products: { ...w.sink.prices } };
}
