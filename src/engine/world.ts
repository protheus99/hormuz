// The world and its day (spec §4.14, §5). step() runs the eight tick phases in order, then
// checks every invariant (§9) and stops the run with a clear error if one fails.
//
// The world is plain data — companies, nodes, the lane graph, cargo, deals, the retail sink, RNG
// states — so it saves as JSON and forks with structuredClone (spec G4.5, G9). The only object
// with behavior, the route provider, is rebuilt at the start of every tick from the lane graph.

import { advancePlant, applyDecline, extract, internalTransfer, refine } from './agents';
import { clear, createNode, submit, type ExchangeNode } from './clearing';
import {
  acceptedGrades, createIntegrated, createProducer, createRefiner, createTrader, plantOf, total, wellOf,
} from './companies';
import { configFor, DEFAULT_CONFIG, withOverrides, type Config, type DeepPartial } from './config';
import { dealCommitments, deliverDeals, type DealDelivery } from './deals';
import {
  applyShock, createLedger, createRetailSink, recordFee, updatePrices, type FeeLedger, type RetailSink,
} from './economics';
import { FeeKind, type ChokepointStatus, type Grade, type Product } from './enums';
import { runLogistics, type LogisticsReport } from './logistics';
import type { Agent, AgentId, Cargo, ChokepointName, Deal, Fill, NodeName, Tick } from './model';
import { rngFor, type Rng } from './rng';
import { decideOrders, rememberMarkers, updateThrottle, type MarketView } from './rules';
import { placeOrder, releaseEscrow, settleFills } from './settlement';
import { avoidFor, buildLaneGraph, LaneRouteProvider, setChokepoint, type LaneGraph } from './transport';
import { NODE_NAMES } from '../data/nodes';
import type { PlantData, PortfolioEntry } from '../data/portfolios';

/** Something scheduled to happen at the start of a tick (spec §5 phase 0). Event stages come in Phase 11. */
export type ScheduledEvent =
  | { readonly tick: Tick; readonly kind: 'CHOKEPOINT'; readonly chokepoint: ChokepointName; readonly status: ChokepointStatus; readonly delayTicks?: number; readonly surcharge?: number }
  | { readonly tick: Tick; readonly kind: 'PIPELINE_CAPACITY'; readonly edgeId: string; readonly capacity: number }
  | { readonly tick: Tick; readonly kind: 'PRODUCT_SHOCK'; readonly product: Product; readonly pct: number; readonly persistent: boolean }
  | { readonly tick: Tick; readonly kind: 'PLANT_ONLINE'; readonly agentId: string; readonly online: boolean };

export interface WorldSettings {
  readonly seed: string;
  readonly portfolio: readonly PortfolioEntry[];
  readonly events?: readonly ScheduledEvent[];
  readonly config?: DeepPartial<Config>;
}

/** Running totals the conservation invariants are checked against (spec §9). */
export interface WorldTotals {
  extracted: number;
  refined: number;
  forceSold: number;
  retailRevenue: number;
  forcedSaleRevenue: number;
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
  rng: { events: Rng; ai: Rng };
  /** Cumulative total; entries hold only the current tick's fees. */
  ledger: FeeLedger;
  cargo: Cargo[];
  deals: Deal[];
  dealSeq: number;
  events: ScheduledEvent[];
  totals: WorldTotals;
  /** Consecutive days each company has had negative available cash (G6 bankruptcy). */
  distressDays: Partial<Record<AgentId, number>>;
}

/** What happened in one tick, for metrics and tests. */
export interface TickReport {
  readonly tick: Tick;
  readonly extracted: number;
  readonly refined: number;
  readonly fills: readonly Fill[];
  readonly deliveries: readonly DealDelivery[];
  readonly logistics: LogisticsReport;
  readonly fees: number;
}

/** Days of negative available cash, with no credit left, that make a company insolvent (spec G6). */
export const BANKRUPTCY_DAYS = 3;

export function createWorld(s: WorldSettings): World {
  const config = withOverrides(DEFAULT_CONFIG, s.config ?? {});
  const agents = s.portfolio.map(build);
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
    rng: { events: rngFor(s.seed, 'events'), ai: rngFor(s.seed, 'ai') },
    ledger: createLedger(),
    cargo: [],
    deals: [],
    dealSeq: 0,
    events: [...(s.events ?? [])].sort((a, b) => a.tick - b.tick),
    totals: {
      extracted: 0, refined: 0, forceSold: 0, retailRevenue: 0, forcedSaleRevenue: 0,
      startingBarrels: barrelsHeld(agents, []),
      startingCash: agents.reduce((sum, a) => sum + a.cash, 0),
    },
    distressDays: {},
  };
  return world;
}

/** Runs one tick through phases 0–7 (spec §5) and checks every invariant. */
export function step(w: World): TickReport {
  w.tick += 1;
  const tick = w.tick;
  const cfg = w.config;
  w.ledger.entries = [];
  const feesBefore = w.ledger.total;
  const byId = new Map<AgentId, Agent>(w.agents.map((a) => [a.agentId, a]));

  // Phase 0: scheduled events, product prices, plant upkeep, field decline, empty pipelines.
  applyEvents(w, byId);
  updatePrices(w.sink, baselineOutput(w), cfg);
  for (const a of w.agents) {
    if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') advancePlant(a, w.rng.events, w.ledger, tick, cfg);
    if (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED') applyDecline(a, cfg);
  }
  const routes = new LaneRouteProvider(w.graph);
  routes.resetTick();

  // Phase 1: extraction.
  let extracted = 0;
  for (const a of w.agents) if (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED') extracted += extract(a, w.ledger, tick, cfg).barrels;
  w.totals.extracted += extracted;

  // Phase 2: internal clearing.
  for (const a of w.agents) if (a.kind === 'INTEGRATED') internalTransfer(a);

  // Phase 3: refining.
  let refined = 0;
  for (const a of w.agents) {
    if (a.kind !== 'REFINER' && a.kind !== 'INTEGRATED') continue;
    const r = refine(a, w.sink, w.ledger, tick);
    refined += r.barrels;
    w.totals.retailRevenue += r.revenue;
  }
  w.totals.refined += refined;

  // Phase 4: logistics.
  const logistics = runLogistics(w.cargo, byId, w.graph, w.ledger, tick, cfg, (grade) => markerFor(w, grade));
  for (const sale of logistics.forcedSales) {
    w.totals.forceSold += sale.barrels;
    w.totals.forcedSaleRevenue += sale.revenue;
  }

  // Phase 5a: deal deliveries, ahead of the spot market.
  const deliveries = deliverDeals(w.deals, w.cargo, byId, routes, w.ledger, tick, cfg);

  // Phase 5b: every company runs its rules against the previous close; orders are escrowed.
  w.agents.forEach((a, index) => {
    const own = configFor(a.settings, cfg);
    const view: MarketView = {
      tick, nodes: w.nodes, routes, expectedPrices: w.sink.expectedPrices,
      avoid: avoidFor(a.settings.risk, w.graph), dealCommitments: dealCommitments(w.deals, a.agentId, tick + 1),
    };
    if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') updateThrottle(a, view, own);
    for (const order of decideOrders(a, index, view, own)) {
      placeOrder(a, order);
      submit(w.nodes[order.node], order, cfg);
    }
  });

  // Phase 5c and 6: each node clears once; fills settle and ship.
  const fills: Fill[] = [];
  for (const name of NODE_NAMES) {
    const nodeFills = clear(w.nodes[name], { routes, tick, config: cfg });
    fills.push(...nodeFills);
    w.cargo.push(...settleFills(nodeFills, byId, w.ledger));
  }
  releaseEscrow(w.agents);

  // Phase 7: running costs, trader memory, insolvency, invariants.
  chargeRunningCosts(w, tick);
  for (const a of w.agents) if (a.kind === 'TRADER') rememberMarkers(a, w.nodes);
  updateInsolvency(w);
  checkInvariants(w, deliveries);

  return { tick, extracted, refined, fills, deliveries, logistics, fees: w.ledger.total - feesBefore };
}

/** Runs n ticks, returning each tick's report. */
export function run(w: World, n: number): TickReport[] {
  const reports: TickReport[] = [];
  for (let i = 0; i < n; i++) reports.push(step(w));
  return reports;
}

/**
 * A copy of the world for impact projections (spec G4.5). A calm fork turns product-price noise
 * off and drops every scheduled event that has not happened yet, so a projection can never see
 * the real future.
 */
export function fork(w: World, calm: boolean): World {
  const copy = structuredClone(w);
  if (!calm) return copy;
  const quiet = withOverrides(copy.config, { PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 } } });
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
  const expectedCash = t.startingCash + t.retailRevenue + t.forcedSaleRevenue - w.ledger.total;
  if (Math.abs(cash - expectedCash) > 1e-3 + 1e-12 * Math.abs(expectedCash)) {
    fail(`company cash ${cash} ≠ start + revenue − fees = ${expectedCash}`);
  }

  for (const a of w.agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
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
    if (well && well.extractionCapacity > well.fieldMaxCapacity + 1e-6) fail(`${a.name} pumps above its field maximum`);
  }

  // 7. Network: pipelines within capacity.
  for (const e of w.graph.edges) {
    if (e.capacity === null) continue;
    const used = Object.values(e.usedBy).reduce<number>((s, q) => s + (q ?? 0), 0);
    if (used > e.capacity + 1e-6) fail(`pipeline ${e.id} carried ${used} of ${e.capacity} bbl`);
  }

  // 10. Deals: each day's delivered plus shortfall is exactly the daily volume.
  for (const d of deliveries) {
    const deal = w.deals.find((x) => x.dealId === d.dealId);
    if (deal && Math.abs(d.delivered + d.shortfall - deal.qtyPerDay) > 1e-9) fail(`${deal.dealId} delivered ${d.delivered} + short ${d.shortfall} ≠ ${deal.qtyPerDay}`);
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────────────────────

function build(p: PortfolioEntry): Agent {
  const base = { id: p.id, name: p.name, region: p.region, cash: p.cash, ...(p.personality ? { personality: p.personality } : {}) };
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
  const capacity = w.agents.reduce((s, a) => s + (plantOf(a)?.processingCapacity ?? 0), 0);
  return capacity * w.config.PRODUCT_PRICES.BASE_UTILIZATION;
}

function markerFor(w: World, grade: Grade): number {
  return NODE_NAMES.map((n) => w.nodes[n]).find((n) => n.grade === grade)?.markerPrice ?? 0;
}

/** Phase 7 running costs (spec §7.1, D10): fixed operating costs on capacity, and trading offices. */
function chargeRunningCosts(w: World, tick: Tick): void {
  const cfg = w.config;
  for (const a of w.agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
    const fixed = (well ? cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity : 0)
      + (plant ? cfg.FIXED_COST_RATE.REFINER * plant.processingCapacity : 0);
    if (fixed > 0) {
      a.cash -= fixed;
      recordFee(w.ledger, { tick, agentId: a.agentId, kind: FeeKind.FIXED_COST, amount: fixed });
    }
    if (a.kind === 'TRADER') {
      const offices = cfg.OFFICE_COST.PER_TICK * a.offices.length;
      a.cash -= offices;
      recordFee(w.ledger, { tick, agentId: a.agentId, kind: FeeKind.OFFICE, amount: offices });
    }
  }
}

/**
 * Spec G6: a company whose available cash stays below zero, with no credit left, for
 * BANKRUPTCY_DAYS days in a row is insolvent. It is recorded, not removed, and may not bid (D11).
 */
function updateInsolvency(w: World): void {
  for (const a of w.agents) {
    const creditLeft = a.creditLimit - a.creditDrawn;
    const distressed = a.cash - a.cashReserved < 0 && creditLeft <= 0;
    const days = distressed ? (w.distressDays[a.agentId] ?? 0) + 1 : 0;
    w.distressDays[a.agentId] = days;
    if (days >= BANKRUPTCY_DAYS) a.insolvent = true;
  }
}

/** Every barrel the companies hold, plus every barrel at sea (invariant 1). */
export function barrelsHeld(agents: readonly Agent[], cargo: readonly Cargo[]): number {
  let sum = cargo.reduce((s, c) => s + c.qty, 0);
  for (const a of agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
    if (well) sum += well.storage + well.storageEscrow;
    if (plant) sum += total(plant.crudeStock);
    if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) if (hub) sum += total(hub.stock) + total(hub.escrow);
  }
  return sum;
}
