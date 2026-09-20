// Conservation under random trading, refining and shipping (spec §9 invariants 1, 2, 4, 5 and 7; Phases 2–4).
// fast-check builds random multi-day markets and checks after every day that no barrel or
// dollar has been created or destroyed by accident.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clear, createNode, submit, type ExchangeNode } from '../../src/engine/clearing';
import { internalTransfer, refine } from '../../src/engine/agents';
import { createIntegrated, createProducer, createRefiner, createTrader, plantOf, total, wellOf } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger, createRetailSink, updatePrices } from '../../src/engine/economics';
import { NODE_FOR_GRADE } from '../../src/data/nodes';
import { makeOrderId, type Agent, type AgentId, type Cargo, type NodeName, type Order, type RegionName, type TechTier } from '../../src/engine/model';
import { runLogistics } from '../../src/engine/logistics';
import { buildLaneGraph, LaneRouteProvider, setChokepoint } from '../../src/engine/transport';
import { placeOrder, releaseEscrow, settleFills } from '../../src/engine/settlement';

function buildCompanies(tiers: readonly TechTier[]): Agent[] {
  const trader = createTrader({
    id: 'trader', name: 'Trader', region: 'Middle_East', cash: 2_000_000,
    offices: [{ region: 'Middle_East', capacity: 50_000 }, { region: 'Coastal_Asia', capacity: 50_000 }],
  });
  const hub = trader.hubs.Middle_East;
  if (hub) { hub.stock.HEAVY_SOUR = 12_000; hub.stock.MEDIUM = 8_000; }
  return [
    createProducer({ id: 'gulf', name: 'Gulf', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 1_000_000, extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000, storage: 25_000 }),
    createProducer({ id: 'oman', name: 'Oman', region: 'Gulf_of_Oman', grade: 'MEDIUM', cash: 1_000_000, extractionCapacity: 5000, baseExtractionCost: 14, storageCapacity: 20_000, storage: 15_000 }),
    createRefiner({ id: 'east', name: 'East', region: 'Coastal_Asia', cash: 3_000_000, techTier: tiers[0] ?? 3, processingCapacity: 8000, crudeStorageCapacity: 25_000 }),
    createRefiner({ id: 'india', name: 'India', region: 'South_Asia', cash: 3_000_000, techTier: tiers[1] ?? 3, processingCapacity: 9000, crudeStorageCapacity: 30_000 }),
    trader,
    createIntegrated({
      id: 'sabkhar', name: 'Sabkhar', region: 'Middle_East', cash: 5_000_000,
      well: { grade: 'HEAVY_SOUR', extractionCapacity: 4000, baseExtractionCost: 12, storageCapacity: 10_000, storage: 8000 },
      plant: { techTier: tiers[2] ?? 3, processingCapacity: 9000, crudeStorageCapacity: 25_000 },
    }),
  ];
}

const orderSpec = fc.record({
  company: fc.integer({ min: 0, max: 5 }),
  cents: fc.integer({ min: 5_000, max: 8_500 }),
  lots: fc.integer({ min: 1, max: 8 }),
  pick: fc.integer({ min: 0, max: 3 }),
});
type OrderSpec = typeof orderSpec extends fc.Arbitrary<infer T> ? T : never;

const scenario = fc.record({
  tiers: fc.tuple(fc.constantFrom<TechTier>(1, 2, 3), fc.constantFrom<TechTier>(1, 2, 3), fc.constantFrom<TechTier>(1, 2, 3)),
  days: fc.array(fc.array(orderSpec, { maxLength: 8 }), { minLength: 1, maxLength: 24 }),
  /** Hormuz closed (true) or open on each day; missing days are open. */
  hormuz: fc.array(fc.boolean(), { maxLength: 24 }),
});

/** Turns a random spec into an order the company could plausibly place. */
function orderFor(agent: Agent, index: number, seq: number, s: OrderSpec): Order {
  const node: NodeName = s.pick % 2 === 0 ? 'DME' : 'NC';
  const base = {
    orderId: makeOrderId(index, seq), agentId: agent.agentId, node,
    limitPrice: s.cents / 100, qty: s.lots * 1000, qtyRemaining: s.lots * 1000,
  };
  if (agent.kind === 'PRODUCER') return { ...base, node: NODE_FOR_GRADE[agent.grade], side: 'ASK', originRegion: agent.region };
  if (agent.kind === 'REFINER') return { ...base, side: 'BID', deliveryRegion: agent.region, avoidChokepoints: [] };
  if (agent.kind === 'INTEGRATED') {
    return s.lots % 2 === 0
      ? { ...base, node: 'DME', side: 'ASK', originRegion: agent.region }
      : { ...base, side: 'BID', deliveryRegion: agent.region, avoidChokepoints: [] };
  }
  const destination: RegionName = s.pick < 2 ? 'Middle_East' : 'Coastal_Asia';
  return s.lots % 2 === 0
    ? { ...base, side: 'ASK', originRegion: 'Middle_East' }
    : { ...base, side: 'BID', deliveryRegion: destination, avoidChokepoints: [] };
}

function barrelsHeld(agents: readonly Agent[], cargo: readonly Cargo[]): number {
  let sum = cargo.reduce((s, c) => s + c.qty, 0);
  for (const a of agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
    if (well) sum += well.storage + well.storageEscrow;
    if (plant) sum += total(plant.crudeStock);
    if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) sum += total(hub.stock) + total(hub.escrow);
  }
  return sum;
}

describe('conservation (spec §9)', () => {
  it('never creates or destroys barrels or cash, and clears all escrow every day', () => {
    let runsUsingBypass = 0;
    // Each day on the real lane graph: Hormuz opens or closes, cargo moves and unloads, integrated
    // majors move crude to their own plants, every plant refines, then the market trades. Barrels
    // leave only by being refined or sold off from a stranded cargo; cash changes only by retail
    // and forced-sale revenue coming in and recorded fees going out.
    fc.assert(
      fc.property(scenario, ({ tiers, days, hormuz }) => {
        const agents = buildCompanies(tiers);
        const byId = new Map<AgentId, Agent>(agents.map((a) => [a.agentId, a]));
        const nodes: Record<'DME' | 'NC', ExchangeNode> = { DME: createNode('DME'), NC: createNode('NC') };
        const ledger = createLedger();
        const sink = createRetailSink('conservation', DEFAULT_CONFIG);
        const graph = buildLaneGraph(DEFAULT_CONFIG);
        const routes = new LaneRouteProvider(graph);
        let refined = 0;
        let revenue = 0;
        let soldOff = 0;
        let bypassUsed = false;
        const cargo: Cargo[] = [];
        const barrelsAtStart = barrelsHeld(agents, cargo);
        const cashAtStart = agents.reduce((s, a) => s + a.cash, 0);

        days.forEach((specs, day) => {
          setChokepoint(graph, 'HORMUZ', hormuz[day] === true ? 'CLOSED' : 'OPEN');
          routes.resetTick();
          if (day > 0) updatePrices(sink, 30_000, DEFAULT_CONFIG);
          const report = runLogistics(cargo, byId, graph, ledger, day, DEFAULT_CONFIG, () => 60);
          for (const sale of report.forcedSales) { soldOff += sale.barrels; revenue += sale.revenue; }
          for (const a of agents) {
            if (a.kind === 'INTEGRATED') internalTransfer(a);
            if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') {
              const r = refine(a, a.kind === 'INTEGRATED' ? a.plant : a, sink, ledger, day);
              refined += r.barrels;
              revenue += r.revenue;
            }
          }
          specs.forEach((s, seq) => {
            const agent = agents[s.company];
            if (agent === undefined) return;
            const order = orderFor(agent, s.company, seq, s);
            try {
              placeOrder(agent, order);
            } catch {
              return; // not a legal order for this company today; it never reaches the book
            }
            submit(nodes[order.node === 'DME' ? 'DME' : 'NC'], order, DEFAULT_CONFIG);
          });
          for (const node of Object.values(nodes)) {
            const fills = clear(node, { routes, tick: day, config: DEFAULT_CONFIG });
            cargo.push(...settleFills(fills, byId, ledger));
          }
          releaseEscrow(agents);

          // Invariant 7: no pipeline carried more than its capacity today, in both directions together.
          for (const e of graph.edges) {
            if (e.capacity === null) continue;
            const used = Object.values(e.usedBy).reduce<number>((sum, q) => sum + (q ?? 0), 0);
            expect(used, e.id).toBeLessThanOrEqual(e.capacity);
            if (hormuz[day] === true && used > 0) bypassUsed = true;
          }

          // Invariant 1: every barrel not yet refined is somewhere — storage, tanks, a hub, or at sea.
          expect(barrelsHeld(agents, cargo)).toBe(barrelsAtStart - refined - soldOff);
          // Invariant 2: cash changed only by retail and forced-sale revenue in and recorded fees out.
          const cashNow = agents.reduce((s, a) => s + a.cash, 0);
          expect(cashNow - cashAtStart).toBeCloseTo(revenue - ledger.total, 4);
          // Invariant 4: no escrow survives the day.
          for (const a of agents) {
            expect(a.cashReserved).toBe(0);
            expect(wellOf(a)?.storageEscrow ?? 0).toBe(0);
            if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) expect(total(hub.escrow)).toBe(0);
          }
          // Invariant 5 and solvency: nothing goes negative.
          for (const a of agents) {
            expect(a.cash).toBeGreaterThanOrEqual(0);
            expect(wellOf(a)?.storage ?? 0).toBeGreaterThanOrEqual(0);
            const plant = plantOf(a);
            if (plant) expect(total(plant.crudeStock)).toBeLessThanOrEqual(plant.crudeStorageCapacity);
          }
        });
        if (bypassUsed) runsUsingBypass += 1;
      }),
      { numRuns: 200 },
    );
    // The scenarios must really exercise capacity: some runs ship through a bypass during a closure.
    expect(runsUsingBypass).toBeGreaterThan(0);
  });
});
