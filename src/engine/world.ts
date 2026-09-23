// The world and its day (spec §4.14, §5). step() runs the eight tick phases in order, then
// checks every invariant (§9) and stops the run with a clear error if one fails.
//
// The world is plain data — companies, nodes, the lane graph, cargo, deals, the retail sink, RNG
// states — so it saves as JSON and forks with structuredClone (spec G4.5, G9). The only object
// with behavior, the route provider, is rebuilt at the start of every tick from the lane graph.

import { advanceProjects, chargeLeases, type CapitalProject, type Lease, type ReservationRecord, type StandingOrder } from './actions';
import { expireCharters } from './charters';
import { advancePlant, applyDecline, extract, internalTransfer, refine } from './agents';
import { clear, createNode, submit, type ExchangeNode } from './clearing';
import {
  acceptedGrades, createIntegrated, createProducer, createRefiner, createTrader, plantOf, total, wellOf,
  plantsOf,
} from './companies';
import { configFor, DEFAULT_CONFIG, withOverrides, type Config, type DeepPartial } from './config';
import { dealCommitments, deliverDeals, type DealDelivery } from './deals';
import {
  applyShock, createLedger, createRetailSink, recordFee, updatePrices, type FeeLedger, type RetailSink,
} from './economics';
import { FeeKind, type ChokepointStatus, type Grade, type Personality, type Product } from './enums';
import { runLogistics, type LogisticsReport } from './logistics';
import { makeOrderId, type Agent, type AgentId, type Cargo, type Charter, type ChokepointName, type Deal, type Fill, type NodeName, type Order, type Tick } from './model';
import { nextFloat, rngFor, type Rng } from './rng';
import { advanceWells, capacityOf } from './leases';
import { nameGround } from '../data/leasenames';
import { aiBid, award, placeBid, surveyLots, type Auction } from './auction';
import { exposureDay, type Reckoning } from './exposure';
import { decideOrders, recordSales, rememberMarkers, updateOutput, updateThrottle, type MarketView } from './rules';
import { placeOrder, releaseEscrow, settleFills } from './settlement';
import { avoidFor, buildLaneGraph, edgeCapacity, LaneRouteProvider, setChokepoint, type LaneGraph } from './transport';
import { NODE_NAMES } from '../data/nodes';
import { REGIONS } from '../data/regions';
import type { PlantData, PortfolioEntry } from '../data/portfolios';

/** Something scheduled to happen at the start of a tick (spec §5 phase 0). Event stages come in Phase 11. */
export type ScheduledEvent =
  | { readonly tick: Tick; readonly kind: 'CHOKEPOINT'; readonly chokepoint: ChokepointName; readonly status: ChokepointStatus; readonly delayTicks?: number; readonly surcharge?: number }
  | { readonly tick: Tick; readonly kind: 'PIPELINE_CAPACITY'; readonly edgeId: string; readonly capacity: number }
  | { readonly tick: Tick; readonly kind: 'PRODUCT_SHOCK'; readonly product: Product; readonly pct: number; readonly persistent: boolean }
  | { readonly tick: Tick; readonly kind: 'PLANT_ONLINE'; readonly agentId: string; readonly online: boolean };

/**
 * How AI personalities are dealt out (spec G8): Easy is mostly Conservative, Normal even, Hard
 * mostly Aggressive. Companies whose data names a personality keep it.
 */
export type PersonalityMix = 'MOSTLY_CONSERVATIVE' | 'EVEN' | 'MOSTLY_AGGRESSIVE';

const MIX_WEIGHTS: Readonly<Record<PersonalityMix, readonly [number, number, number]>> = {
  MOSTLY_CONSERVATIVE: [0.6, 0.3, 0.1],
  EVEN: [1 / 3, 1 / 3, 1 / 3],
  MOSTLY_AGGRESSIVE: [0.1, 0.3, 0.6],
};

export interface WorldSettings {
  readonly seed: string;
  readonly portfolio: readonly PortfolioEntry[];
  /** Omitted: every AI company without a named personality is Balanced (engine tests). */
  readonly personalityMix?: PersonalityMix;
  readonly events?: readonly ScheduledEvent[];
  readonly config?: DeepPartial<Config>;
}

/** Running totals the conservation invariants are checked against (spec §9). */
export interface WorldTotals {
  extracted: number;
  /** Barrels each producer has extracted, for merit-order and metrics reports (spec §10.3). */
  extractedBy: Partial<Record<AgentId, number>>;
  refined: number;
  forceSold: number;
  retailRevenue: number;
  forcedSaleRevenue: number;
  /** Credit drawn less credit repaid, across all companies: money lent into the economy. */
  netBorrowing: number;
  readonly startingBarrels: number;
  readonly startingCash: number;
}

export interface World {
  tick: Tick;
  readonly seed: string;
  readonly config: Config;
  agents: Agent[];
  nodes: Record<NodeName, ExchangeNode>;
  graph: LaneGraph;
  sink: RetailSink;
  rng: { events: Rng; ai: Rng; wells: Rng };
  /** Cumulative total; entries hold only the current tick's fees. */
  ledger: FeeLedger;
  cargo: Cargo[];
  deals: Deal[];
  dealSeq: number;
  events: ScheduledEvent[];
  totals: WorldTotals;
  /** Consecutive days each company has had negative available cash (G6 bankruptcy). */
  distressDays: Partial<Record<AgentId, number>>;
  /** Every company that has ever been insolvent, with the first tick it happened (D11: recorded). */
  insolvencies: Partial<Record<AgentId, Tick>>;
  /** Capital projects under way, leases, standing orders and pipeline reservations (actions.ts). */
  projects: CapitalProject[];
  leases: Lease[];
  /** Tankers on hire (spec §7.4). */
  charters: Charter[];
  /** Numbers charters as they are hired, so their ids are stable in a replay. */
  charterSeq: number;
  /** The lots on offer, from the day they are published to the day they are awarded (§12A.4). */
  auction: Auction | null;
  auctionSeq: number;
  /**
   * The day this world stops, if it stops. The engine knows nothing of scenarios or campaigns; it
   * knows only that a reckoning falls harder on a company running out of time (§12A.6).
   */
  horizon: Tick | null;
  standingOrders: StandingOrder[];
  reservations: ReservationRecord[];
  /**
   * True when decision cards drive maintenance and output cuts (a game session, Phase 9). Engine-only
   * runs leave it false, and the §6.5 defaults do those jobs instead.
   */
  cardsActive: boolean;
}

/** What happened in one tick, for metrics and tests. */
/** What one company did today, so a player can be shown their own day's work (spec G5). */
export interface AgentDay {
  readonly extracted: number;
  readonly refined: number;
  /** What the retail market paid for the fuel that refining made. */
  readonly retail: number;
}

/** A reckoning that landed today, and who it landed on (§12A.6). */
export interface ReckoningReport extends Reckoning {
  readonly agentId: AgentId;
}

export interface TickReport {
  readonly tick: Tick;
  readonly extracted: number;
  readonly refined: number;
  /** Today's work, company by company. */
  readonly byAgent: Readonly<Partial<Record<AgentId, AgentDay>>>;
  readonly fills: readonly Fill[];
  readonly deliveries: readonly DealDelivery[];
  readonly logistics: LogisticsReport;
  /** What caught up with anybody today. Empty on almost every day of almost every game. */
  readonly reckonings: readonly ReckoningReport[];
  readonly fees: number;
}

/** Days of negative available cash, with no credit left, that make a company insolvent (spec G6). */
export const BANKRUPTCY_DAYS = 3;

export function createWorld(s: WorldSettings): World {
  const config = withOverrides(DEFAULT_CONFIG, s.config ?? {});
  const ai = rngFor(s.seed, 'ai');
  const agents = s.portfolio.map((p) => build(withPersonality(p, s.personalityMix, ai)));
  for (const a of agents) a.creditLimit = creditLimit(a, config);
  const nodes = {} as Record<NodeName, ExchangeNode>;
  for (const name of NODE_NAMES) nodes[name] = createNode(name);
  const world: World = {
    tick: 0,
    seed: s.seed,
    config,
    agents,
    nodes,
    graph: buildLaneGraph(config),
    sink: createRetailSink(s.seed, config),
    rng: { events: rngFor(s.seed, 'events'), ai, wells: rngFor(s.seed, 'wells') },
    ledger: createLedger(),
    cargo: [],
    deals: [],
    dealSeq: 0,
    events: [...(s.events ?? [])].sort((a, b) => a.tick - b.tick),
    totals: {
      extracted: 0, extractedBy: {}, refined: 0, forceSold: 0, retailRevenue: 0, forcedSaleRevenue: 0, netBorrowing: 0,
      startingBarrels: barrelsHeld(agents, []),
      startingCash: agents.reduce((sum, a) => sum + a.cash, 0),
    },
    distressDays: {},
    insolvencies: {},
    projects: [],
    leases: [],
    charters: [],
    charterSeq: 0,
    auction: null,
    auctionSeq: 0,
    horizon: null,
    standingOrders: [],
    reservations: [],
    cardsActive: false,
  };
  nameAllGround(world);
  return world;
}

/** Runs one tick through phases 0–7 (spec §5) and checks every invariant. */
export function step(w: World): TickReport {
  w.tick += 1;
  const tick = w.tick;
  const cfg = w.config;
  w.ledger.entries = [];
  const feesBefore = w.ledger.total;
  let byId = new Map<AgentId, Agent>(w.agents.map((a) => [a.agentId, a]));

  // Phase 0: scheduled events, capital projects, product prices, plant upkeep, field decline, empty pipelines.
  applyEvents(w, byId);
  advanceProjects(w);
  w.charters = expireCharters(w.charters, w.cargo, tick);
  byId = new Map<AgentId, Agent>(w.agents.map((a) => [a.agentId, a]));   // a finished refinery may have replaced a producer
  updatePrices(w.sink, baselineOutput(w), cfg);
  for (const a of w.agents) {
    if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') for (const p of plantsOf(a)) advancePlant(a, p, w.rng.events, w.ledger, tick, cfg, !w.cardsActive);
    if (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED') {
      // Wells take their upkeep before the field's decline is worked out, so a well that went down
      // today is already out of the count when capacity is recomputed.
      for (const lease of wellOf(a)?.leases ?? []) advanceWells(lease, a, w.rng.wells, w.ledger, tick, cfg);
      applyDecline(a, cfg);
    }
  }
  runAuction(w, tick);
  const routes = new LaneRouteProvider(w.graph);
  routes.resetTick();

  // Phase 1: extraction.
  const byAgent: Partial<Record<AgentId, { extracted: number; refined: number; retail: number }>> = {};
  const dayOf = (id: AgentId) => (byAgent[id] ??= { extracted: 0, refined: 0, retail: 0 });
  let extracted = 0;
  for (const a of w.agents) {
    if (a.kind !== 'PRODUCER' && a.kind !== 'INTEGRATED') continue;
    const barrels = extract(a, w.ledger, tick, cfg, w.rng.wells).barrels;
    dayOf(a.agentId).extracted += barrels;
    extracted += barrels;
    w.totals.extractedBy[a.agentId] = (w.totals.extractedBy[a.agentId] ?? 0) + barrels;
  }
  w.totals.extracted += extracted;

  // Phase 2: internal clearing.
  for (const a of w.agents) if (a.kind === 'INTEGRATED') internalTransfer(a);

  // Phase 3: refining.
  let refined = 0;
  for (const a of w.agents) {
    if (a.kind !== 'REFINER' && a.kind !== 'INTEGRATED') continue;
    for (const p of plantsOf(a)) {
      const r = refine(a, p, w.sink, w.ledger, tick);
      const d = dayOf(a.agentId);
      d.refined += r.barrels;
      d.retail += r.revenue;
      refined += r.barrels;
      w.totals.retailRevenue += r.revenue;
    }
  }
  w.totals.refined += refined;

  // Phase 4: logistics.
  const logistics = runLogistics(w.cargo, byId, w.graph, w.ledger, tick, cfg, (grade) => markerFor(w, grade));
  for (const sale of logistics.forcedSales) {
    w.totals.forceSold += sale.barrels;
    w.totals.forcedSaleRevenue += sale.revenue;
  }

  // Phase 5a: deal deliveries, ahead of the spot market.
  const deliveries = deliverDeals(w.deals, w.cargo, byId, routes, w.ledger, tick, cfg, w.charters);

  // Phase 5b: every company runs its rules against the previous close; orders are escrowed.
  const asked = new Set<AgentId>();
  w.agents.forEach((a, index) => {
    const own = configFor(a.settings, cfg);
    const view: MarketView = {
      tick, nodes: w.nodes, routes, expectedPrices: w.sink.expectedPrices,
      avoid: avoidFor(a.settings.risk, w.graph), dealCommitments: dealCommitments(w.deals, a.agentId, tick + 1),
    };
    if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') for (const p of plantsOf(a)) updateThrottle(a, p, view, own);
    for (const order of decideOrders(a, index, view, own)) {
      placeOrder(a, order);
      submit(w.nodes[order.node], order, cfg);
      if (order.side === 'ASK') asked.add(a.agentId);
    }
    // Orders cards added: emergency purchases, fire sales, committed capital (actions.ts).
    w.standingOrders.filter((o) => o.agentId === a.agentId).forEach((o, k) => {
      const order: Order = o.side === 'BID'
        ? { orderId: makeOrderId(index, 500 + k), agentId: a.agentId, node: o.node, side: 'BID', limitPrice: o.price, qty: o.qty, qtyRemaining: o.qty, deliveryRegion: o.region, avoidChokepoints: avoidFor(a.settings.risk, w.graph) }
        : { orderId: makeOrderId(index, 500 + k), agentId: a.agentId, node: o.node, side: 'ASK', limitPrice: o.price, qty: o.qty, qtyRemaining: o.qty, originRegion: o.region };
      try {
        placeOrder(a, order);
      } catch {
        return;   // no longer affordable or no longer held: skipped today
      }
      submit(w.nodes[order.node], order, cfg);
    });
  });

  // Phase 5c and 6: each node clears once; fills settle and ship.
  const fills: Fill[] = [];
  for (const name of NODE_NAMES) {
    const nodeFills = clear(w.nodes[name], { routes, tick, config: cfg });
    fills.push(...nodeFills);
    w.cargo.push(...settleFills(nodeFills, byId, w.ledger, w.charters, w.cargo));
  }
  releaseEscrow(w.agents);
  recordSales(w.agents, asked, fills);

  // Phase 7: running costs, credit, trader memory, AI output cuts, insolvency, invariants.
  const reckonings = chargeRunningCosts(w, tick);
  chargeLeases(w);
  chargeCharters(w, tick);
  settleCredit(w, tick);
  for (const a of w.agents) if (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED') updateOutput(a, w.nodes, w.ledger, tick, cfg, !w.cardsActive);
  for (const a of w.agents) if (a.kind === 'TRADER') rememberMarkers(a, w.nodes);
  updateInsolvency(w);
  checkInvariants(w, deliveries);

  return { tick, extracted, refined, byAgent, fills, deliveries, logistics, reckonings, fees: w.ledger.total - feesBefore };
}

/** Runs n ticks, returning each tick's report. */
export function run(w: World, n: number): TickReport[] {
  const reports: TickReport[] = [];
  for (let i = 0; i < n; i++) reports.push(step(w));
  return reports;
}

/**
 * A copy of the world for impact projections (spec G4.5). A calm fork turns product-price noise
 * and the daily swing in what fields pump off, and drops every scheduled event that has not
 * happened yet, so a projection can never see the real future.
 */
export function fork(w: World, calm: boolean): World {
  const copy = structuredClone(w);
  if (!calm) return copy;
  // A projection shows what today would do if it stood still, so the fields pump to plan in it.
  const quiet = withOverrides(copy.config, { PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 } }, EXTRACTION_SPREAD: 0 });
  return { ...copy, config: quiet, events: [] };
}

/**
 * Spec §9. Throws on the first broken invariant, naming the tick, the company and the numbers.
 * Invariant 3 (clearing completeness) is a property test of clearing itself (§14.6).
 */
export function checkInvariants(w: World, deliveries: readonly DealDelivery[] = []): void {
  const fail = (what: string): never => { throw new Error(`Invariant broken at tick ${w.tick}: ${what}`); };
  const t = w.totals;

  // Tolerances: a millionth of a barrel and a tenth of a cent, plus float rounding on large sums.
  // 1. Barrel conservation.
  const expectedBarrels = t.startingBarrels + t.extracted - t.refined - t.forceSold;
  const held = barrelsHeld(w.agents, w.cargo);
  if (Math.abs(held - expectedBarrels) > 1e-6 + 1e-12 * Math.abs(expectedBarrels)) {
    fail(`barrels held ${held} ≠ start + extracted − refined − force-sold = ${expectedBarrels}`);
  }

  // 2. Cash conservation.
  const cash = w.agents.reduce((s, a) => s + a.cash, 0);
  const expectedCash = t.startingCash + t.retailRevenue + t.forcedSaleRevenue + t.netBorrowing - w.ledger.total;
  if (Math.abs(cash - expectedCash) > 1e-3 + 1e-12 * Math.abs(expectedCash)) {
    fail(`company cash ${cash} ≠ start + revenue − fees = ${expectedCash}`);
  }

  for (const a of w.agents) {
    const well = wellOf(a);
    const plants = plantsOf(a);
    const plant = plants[0];
    // 4. Escrow is zero at the end of every tick.
    if (a.cashReserved !== 0) fail(`${a.name} still has $${a.cashReserved} reserved`);
    if (well && well.storageEscrow !== 0) fail(`${a.name} still has ${well.storageEscrow} bbl in escrow`);
    // 5. Physical bounds.
    if (well && (well.storage < -1e-9 || well.storage > well.storageCapacity + 1e-6)) fail(`${a.name} storage ${well.storage} outside 0–${well.storageCapacity}`);
    if (plant) {
      const stock = total(plant.crudeStock);
      if (stock > plant.crudeStorageCapacity + 1e-6) fail(`${a.name} holds ${stock} bbl in ${plant.crudeStorageCapacity} bbl of tanks`);
      for (const [grade, qty] of Object.entries(plant.crudeStock) as [Grade, number][]) {
        if (qty < -1e-9) fail(`${a.name} holds negative ${grade}`);
        // 6. Tech tier.
        if (qty > 1e-9 && !acceptedGrades(plant.techTier).includes(grade)) fail(`${a.name} (Tier ${plant.techTier}) holds ${grade}`);
      }
    }
    if (a.kind === 'TRADER') {
      for (const [region, hub] of Object.entries(a.hubs)) {
        if (hub === undefined) continue;
        if (total(hub.escrow) !== 0) fail(`${a.name} still has barrels in escrow in ${region}`);
        if (total(hub.stock) > hub.capacity + 1e-6) fail(`${a.name} holds more than its ${region} hub's capacity`);
      }
    }
    // 8. Limits.
    if (a.creditDrawn > a.creditLimit + 1e-6) fail(`${a.name} has drawn $${a.creditDrawn} on a $${a.creditLimit} line`);
    // 9. Solvency: cash is never negative while credit remains.
    if (a.cash < -1e-6 && a.creditDrawn < a.creditLimit - 1e-6) fail(`${a.name} has $${a.cash} with credit left`);
  }

  // 8. Limits: no cargo is bigger than the ship carrying it (spec §9).
  const byCharter = new Map(w.charters.map((ch) => [ch.charterId, ch]));
  for (const c of w.cargo) {
    if (c.charterId === null) continue;
    const ship = byCharter.get(c.charterId);
    if (ship === undefined) fail(`cargo ${c.cargoId} names a charter that no longer exists`);
    else if (c.qty > ship.capacity + 1e-6) fail(`cargo ${c.cargoId} is ${c.qty} bbl on a ${ship.capacity} bbl ship`);
  }

  // 7. Network: pipelines and straits within today's capacity.
  for (const e of w.graph.edges) {
    const capacity = edgeCapacity(e);
    if (capacity === Number.POSITIVE_INFINITY) continue;
    const used = Object.values(e.usedBy).reduce<number>((s, q) => s + (q ?? 0), 0);
    if (used > capacity + 1e-6) fail(`${e.id} carried ${used} of ${capacity} bbl`);
  }

  // 10. Deals: each day's delivered plus shortfall is exactly the daily volume.
  for (const d of deliveries) {
    const deal = w.deals.find((x) => x.dealId === d.dealId);
    if (deal && Math.abs(d.delivered + d.shortfall - deal.qtyPerDay) > 1e-9) fail(`${deal.dealId} delivered ${d.delivered} + short ${d.shortfall} ≠ ${deal.qtyPerDay}`);
  }

  // 11. Leases (§12A.2): oil left in the ground plus everything lifted from it is what it held, and
  // a company's field is exactly what its pumping wells make. A leak here would mint barrels.
  for (const a of w.agents) {
    const field = wellOf(a);
    if (field === undefined) continue;
    for (const lease of field.leases) {
      if (lease.reserves < -1e-6) fail(`${lease.leaseId} has been overdrawn to ${lease.reserves} bbl`);
      if (Math.abs(lease.reserves + lease.produced + lease.lost - lease.originalReserves) > 1e-6) {
        fail(`${lease.leaseId} holds ${lease.reserves} + lifted ${lease.produced} + lost ${lease.lost} ≠ ${lease.originalReserves} bbl`);
      }
      if (lease.wells.length > lease.maxWells) fail(`${lease.leaseId} has ${lease.wells.length} wells, over its ${lease.maxWells}`);
      if (lease.lost < 0) fail(`${lease.leaseId} has lost ${lease.lost} bbl`);
    }
    if (Math.abs(field.extractionCapacity - capacityOf(field.leases)) > 1e-6) {
      fail(`${a.agentId} pumps ${field.extractionCapacity} but its wells make ${capacityOf(field.leases)} bbl/day`);
    }
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────────────────────

/** Deals a personality from the mix, using the ai stream, unless the data names one. */
function withPersonality(p: PortfolioEntry, mix: PersonalityMix | undefined, ai: Rng): PortfolioEntry {
  if (mix === undefined || p.personality !== undefined || p.controller === 'HUMAN') return p;
  const [conservative, balanced] = MIX_WEIGHTS[mix];
  const roll = nextFloat(ai);
  const personality: Personality = roll < conservative ? 'CONSERVATIVE' : roll < conservative + balanced ? 'BALANCED' : 'AGGRESSIVE';
  return { ...p, personality };
}

function build(p: PortfolioEntry): Agent {
  const base = {
    id: p.id, name: p.name, region: p.region, cash: p.cash,
    ...(p.personality ? { personality: p.personality } : {}),
    ...(p.controller ? { controller: p.controller } : {}),
  };
  switch (p.kind) {
    case 'PRODUCER':
      return createProducer({ ...base, ...p.well });
    case 'REFINER':
      return createRefiner({ ...base, ...plantSpec(p.plant) });
    case 'INTEGRATED':
      return createIntegrated({ ...base, well: p.well, plant: plantSpec(p.plant) });
    case 'TRADER':
      return createTrader({ ...base, offices: p.offices });
  }
}

function plantSpec(p: PlantData) {
  return { techTier: p.techTier, processingCapacity: p.processingCapacity, crudeStorageCapacity: p.crudeStorageCapacity, crudeStock: { ...p.startingStock } };
}

function applyEvents(w: World, byId: ReadonlyMap<AgentId, Agent>): void {
  while (w.events.length > 0 && (w.events[0]?.tick ?? Infinity) <= w.tick) {
    const e = w.events.shift();
    if (e === undefined) break;
    switch (e.kind) {
      case 'CHOKEPOINT':
        setChokepoint(w.graph, e.chokepoint, e.status, e.delayTicks ?? 0, e.surcharge ?? 0);
        break;
      case 'PIPELINE_CAPACITY': {
        const edge = w.graph.edges.find((x) => x.id === e.edgeId);
        if (edge === undefined) throw new Error(`Event at tick ${e.tick}: unknown pipeline ${e.edgeId}`);
        (edge as { capacity: number | null }).capacity = e.capacity;
        break;
      }
      case 'PRODUCT_SHOCK':
        applyShock(w.sink, e.product, e.pct, e.persistent);
        break;
      case 'PLANT_ONLINE': {
        const plant = plantOf(byId.get(e.agentId as AgentId) ?? fail(`unknown company ${e.agentId}`));
        if (plant === undefined) throw new Error(`Event at tick ${e.tick}: ${e.agentId} has no refinery`);
        plant.online = e.online;
        break;
      }
    }
  }
}

function fail(why: string): never {
  throw new Error(why);
}

/** Σ processing capacity × BASE_UTILIZATION across all refineries (spec §7.3). */
function baselineOutput(w: World): number {
  const capacity = w.agents.reduce((s, a) => s + plantsOf(a).reduce((t, p) => t + p.processingCapacity, 0), 0);
  return capacity * w.config.PRODUCT_PRICES.BASE_UTILIZATION;
}

function markerFor(w: World, grade: Grade): number {
  return NODE_NAMES.map((n) => w.nodes[n]).find((n) => n.grade === grade)?.markerPrice ?? 0;
}

/** Phase 7 running costs (spec §7.1, D10): fixed operating costs on capacity, and trading offices. */
function chargeRunningCosts(w: World, tick: Tick): ReckoningReport[] {
  const cfg = w.config;
  const reckonings: ReckoningReport[] = [];
  for (const a of w.agents) {
    const well = wellOf(a);
    const fixed = (well ? cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity : 0)
      + plantsOf(a).reduce((s, p) => s + cfg.FIXED_COST_RATE.REFINER * p.processingCapacity, 0);
    if (fixed > 0) {
      a.cash -= fixed;
      recordFee(w.ledger, { tick, agentId: a.agentId, kind: FeeKind.FIXED_COST, amount: fixed });
    }
    // What a company has coming to it costs a little every day, and may come due on any of them.
    const reckoning = exposureDay(a, w.ledger, tick, cfg, w.rng.events, w.horizon === null ? null : w.horizon - tick);
    if (reckoning !== null) reckonings.push({ ...reckoning, agentId: a.agentId });
    if (a.kind === 'TRADER') {
      const offices = cfg.OFFICE_COST.PER_TICK * a.offices.length;
      a.cash -= offices;
      recordFee(w.ledger, { tick, agentId: a.agentId, kind: FeeKind.OFFICE, amount: offices });
    }
  }
  return reckonings;
}

/**
 * Spec G6: a credit line of CREDIT_ASSET_SHARE × capital assets plus a base amount for the play type. Capital
 * assets are valued at replacement cost: the plant at FACTORY_COST plus its tier upgrades, wells at
 * DRILL_COST and tanks at STORAGE_COST, all times the region's labor index.
 */
/**
 * The yearly lease auction (spec §12A.4). Lots are published `NOTICE_TICKS` before the day they are
 * awarded, which is the window a player has to decide; the AI companies bid on the day, since they
 * have nothing to think about. On the day itself the highest bid takes each lot.
 */
function runAuction(w: World, tick: Tick): void {
  const cfg = w.config;
  if (w.auction !== null && w.auction.tick === tick) {
    for (const lot of w.auction.lots) {
      for (const agent of w.agents) {
        if (agent.controller === 'HUMAN') continue;             // the player's bid came from a card
        placeBid(lot, agent.agentId, aiBid(agent, lot, cfg, w.rng.ai));
      }
    }
    // Ground bought is ground with nothing on it, so nothing about the winner's output changes
    // today: it has wells to drill before a barrel moves (§12A.4). The bonus leaves the economy
    // the way a tariff does, so it is recorded as a fee or the cash invariant would catch it.
    for (const { winner, price } of award(w.auction.lots, w.agents)) {
      recordFee(w.ledger, { tick, agentId: winner.agentId, kind: FeeKind.LEASE_BONUS, amount: price });
    }
    w.auction = null;
  }
  if (w.auction === null && tick % cfg.AUCTION.EVERY_TICKS === cfg.AUCTION.EVERY_TICKS - cfg.AUCTION.NOTICE_TICKS) {
    w.auctionSeq += 1;
    w.auction = { tick: (tick + cfg.AUCTION.NOTICE_TICKS) as Tick, lots: surveyLots(w.auctionSeq, cfg, w.rng.wells, w.agents) };
  }
}

/**
 * Names every company's ground once the whole cast exists (§12A.2). It has to happen here rather
 * than when a company is built, because uniqueness is a property of the world, not of one company:
 * two producers in the same region were both handed "Permian Basin field".
 */
function nameAllGround(w: World): void {
  const used = new Set<string>();
  w.agents.forEach((agent, index) => {
    for (const lease of wellOf(agent)?.leases ?? []) {
      const name = nameGround(used, index * 7, lease.region);
      used.add(name);
      lease.name = name;
    }
  });
}

/** Every hired tanker costs its daily rate, carrying cargo or not (spec §7.4). */
function chargeCharters(w: World, tick: Tick): void {
  for (const ch of w.charters) {
    const owner = w.agents.find((a) => a.agentId === ch.ownerId);
    if (owner === undefined) continue;
    owner.cash -= ch.rate;
    recordFee(w.ledger, { tick, agentId: owner.agentId, kind: FeeKind.CHARTER, amount: ch.rate });
  }
}

export function creditLimit(a: Agent, cfg: Config): number {
  const base = a.kind === 'TRADER' ? cfg.CREDIT_BASE.TRADER : plantOf(a) ? cfg.CREDIT_BASE.REFINER : cfg.CREDIT_BASE.PRODUCER;
  return cfg.CREDIT_ASSET_SHARE * capitalAssets(a, cfg) + base;
}

/**
 * A company's capital assets at replacement cost (spec G6): the plant at FACTORY_COST plus its tier
 * upgrades, wells at DRILL_COST and tanks at STORAGE_COST, all times the region's labor index.
 */
export function capitalAssets(a: Agent, cfg: Config): number {
  const labor = REGIONS[a.region].laborCostIndex;
  const well = wellOf(a);
  let assets = 0;
  if (well) assets += (cfg.DRILL_COST * well.extractionCapacity + cfg.STORAGE_COST * well.storageCapacity) * labor;
  for (const plant of plantsOf(a)) {
    const tier = (plant.techTier >= 2 ? cfg.TIER_COST.TO_TIER_2 : 0) + (plant.techTier >= 3 ? cfg.TIER_COST.TO_TIER_3 : 0);
    assets += ((cfg.FACTORY_COST + tier) * plant.processingCapacity + cfg.STORAGE_COST * plant.crudeStorageCapacity) * labor;
  }
  if (a.kind === 'TRADER') {
    for (const [region, hub] of Object.entries(a.hubs)) {
      if (hub) assets += cfg.STORAGE_COST * hub.capacity * REGIONS[region as keyof typeof REGIONS].laborCostIndex;
    }
  }
  return assets;
}

/**
 * Phase 7 credit (spec G6, invariant 9): interest on what is drawn; any negative cash is covered
 * from the line, as far as it goes; and cash above a cushion of CREDIT_CUSHION_DAYS of fixed costs
 * repays it. Borrowing and repayment are money moving in and out of the economy.
 */
function settleCredit(w: World, tick: Tick): void {
  const cfg = w.config;
  for (const a of w.agents) {
    if (a.creditDrawn > 0) {
      const interest = cfg.CREDIT_RATE * a.creditDrawn;
      a.cash -= interest;
      recordFee(w.ledger, { tick, agentId: a.agentId, kind: FeeKind.CREDIT_INTEREST, amount: interest });
    }
    // A company is drawn back up to a few days of working cash, not merely to zero: bids are
    // limited by cash in hand, so a company left on nothing could never buy again (D42).
    const working = cfg.CREDIT_WORKING_DAYS * dailyFixedCost(a, cfg);
    if (a.cash < working) {
      const draw = Math.min(working - a.cash, a.creditLimit - a.creditDrawn);
      if (draw > 0) {
        a.cash += draw;
        a.creditDrawn += draw;
        w.totals.netBorrowing += draw;
      }
    } else if (a.creditDrawn > 0) {
      const repay = Math.min(a.creditDrawn, Math.max(0, a.cash - cfg.CREDIT_CUSHION_DAYS * dailyFixedCost(a, cfg)));
      if (repay > 0) {
        a.cash -= repay;
        a.creditDrawn -= repay;
        w.totals.netBorrowing -= repay;
      }
    }
  }
}

function dailyFixedCost(a: Agent, cfg: Config): number {
  const well = wellOf(a);
  return (well ? cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity : 0)
    + plantsOf(a).reduce((s, p) => s + cfg.FIXED_COST_RATE.REFINER * p.processingCapacity, 0)
    + (a.kind === 'TRADER' ? cfg.OFFICE_COST.PER_TICK * a.offices.length : 0);
}

/**
 * Spec G6: a company whose available cash stays below zero, with no credit left, for
 * BANKRUPTCY_DAYS days in a row is insolvent. It is recorded, not removed, and may not bid (D11).
 * Once its available cash is back above zero — cargo it had already paid for gets sold — it may
 * trade again; the record of the insolvency stays in `insolvencies`.
 */
function updateInsolvency(w: World): void {
  for (const a of w.agents) {
    const creditLeft = a.creditLimit - a.creditDrawn;
    const available = a.cash - a.cashReserved;
    const distressed = available < 0 && creditLeft <= 0;
    const days = distressed ? (w.distressDays[a.agentId] ?? 0) + 1 : 0;
    w.distressDays[a.agentId] = days;
    if (days >= BANKRUPTCY_DAYS && !a.insolvent) {
      a.insolvent = true;
      w.insolvencies[a.agentId] ??= w.tick;
    } else if (a.insolvent && available >= 0) {
      a.insolvent = false;
    }
  }
}

/** Every barrel the companies hold, plus every barrel at sea (invariant 1). */
export function barrelsHeld(agents: readonly Agent[], cargo: readonly Cargo[]): number {
  let sum = cargo.reduce((s, c) => s + c.qty, 0);
  for (const a of agents) {
    const well = wellOf(a);
    if (well) sum += well.storage + well.storageEscrow;
    for (const plant of plantsOf(a)) sum += total(plant.crudeStock);
    if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) if (hub) sum += total(hub.stock) + total(hub.escrow);
  }
  return sum;
}

/**
 * Net worth (spec G6): cash, plus crude held and at sea at its grade's marker, plus capital assets
 * at replacement cost and projects at what has been paid, less credit drawn.
 */
export function netWorth(w: World, a: Agent): number {
  const marker = (g: Grade) => markerFor(w, g);
  let value = a.cash - a.creditDrawn;
  const well = wellOf(a);
  if (well) value += (well.storage + well.storageEscrow) * marker(well.grade);
  for (const plant of plantsOf(a)) {
    for (const g of ['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR'] as const) value += plant.crudeStock[g] * marker(g);
  }
  if (a.kind === 'TRADER') {
    for (const hub of Object.values(a.hubs)) if (hub) for (const g of ['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR'] as const) value += (hub.stock[g] + hub.escrow[g]) * marker(g);
  }
  for (const c of w.cargo) if (c.ownerId === a.agentId) value += c.qty * marker(c.grade);
  value += capitalAssets(a, w.config);
  // Ground bought at auction stands at what was paid for it (§12A.2). Oil in the ground is worth
  // nothing here on purpose: counting it would put a secret number on the screen, and every target
  // measured on net worth would have to be retuned around a figure the player cannot see.
  if (well) for (const lease of well.leases) value += lease.acquiredFor;
  for (const p of w.projects) if (p.agentId === a.agentId) value += p.totalCost - p.dailyCost * p.ticksLeft;
  return value;
}
