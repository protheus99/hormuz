// Conservation under random trading (spec §9 invariants 1, 2, 4 and 5; Phase 2 acceptance).
// fast-check builds random multi-day markets and checks after every day that no barrel or
// dollar has been created or destroyed by accident.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clear, createNode, submit, type ExchangeNode } from '../../src/engine/clearing';
import { createProducer, createRefiner, createTrader, total } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import { NODE_FOR_GRADE } from '../../src/data/nodes';
import { makeOrderId, type Agent, type AgentId, type Cargo, type NodeName, type Order, type RegionName, type TechTier } from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';
import { placeOrder, releaseEscrow, settleFills } from '../../src/engine/settlement';

const network = () =>
  new StubRouteProvider([
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ'] },
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 10.9, transit: 16, capacityPerTick: 6000 },
    { origin: 'Gulf_of_Oman', destination: 'Coastal_Asia', freight: 9.0, transit: 15 },
    { origin: 'Gulf_of_Oman', destination: 'Middle_East', freight: 0.8, transit: 2 },
    { origin: 'Middle_East', destination: 'South_Asia', freight: 3.0, transit: 6 },
    { origin: 'Gulf_of_Oman', destination: 'South_Asia', freight: 2.2, transit: 5 },
  ]);

function buildCompanies(tiers: readonly TechTier[]): Agent[] {
  const trader = createTrader({
    id: 'trader', name: 'Trader', region: 'Middle_East', cash: 2_000_000, maxRiskLimit: 5_000_000,
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
  ];
}

const orderSpec = fc.record({
  company: fc.integer({ min: 0, max: 4 }),
  cents: fc.integer({ min: 5_000, max: 8_500 }),
  lots: fc.integer({ min: 1, max: 8 }),
  pick: fc.integer({ min: 0, max: 3 }),
});
type OrderSpec = typeof orderSpec extends fc.Arbitrary<infer T> ? T : never;

const scenario = fc.record({
  tiers: fc.tuple(fc.constantFrom<TechTier>(1, 2, 3), fc.constantFrom<TechTier>(1, 2, 3)),
  days: fc.array(fc.array(orderSpec, { maxLength: 12 }), { minLength: 1, maxLength: 4 }),
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
  const destination: RegionName = s.pick < 2 ? 'Middle_East' : 'Coastal_Asia';
  return s.lots % 2 === 0
    ? { ...base, side: 'ASK', originRegion: 'Middle_East' }
    : { ...base, side: 'BID', deliveryRegion: destination, avoidChokepoints: [] };
}

function barrelsHeld(agents: readonly Agent[], cargo: readonly Cargo[]): number {
  let sum = cargo.reduce((s, c) => s + c.qty, 0);
  for (const a of agents) {
    if (a.kind === 'PRODUCER') sum += a.storage + a.storageEscrow;
    if (a.kind === 'REFINER') sum += total(a.crudeStock);
    if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) sum += total(hub.stock) + total(hub.escrow);
  }
  return sum;
}

describe('conservation (spec §9)', () => {
  it('never creates or destroys barrels or cash, and clears all escrow every day', () => {
    fc.assert(
      fc.property(scenario, ({ tiers, days }) => {
        const agents = buildCompanies(tiers);
        const byId = new Map<AgentId, Agent>(agents.map((a) => [a.agentId, a]));
        const nodes: Record<'DME' | 'NC', ExchangeNode> = { DME: createNode('DME'), NC: createNode('NC') };
        const ledger = createLedger();
        const cargo: Cargo[] = [];
        const barrelsAtStart = barrelsHeld(agents, cargo);
        const cashAtStart = agents.reduce((s, a) => s + a.cash, 0);

        days.forEach((specs, day) => {
          const routes = network();
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

          // Invariant 1: every barrel is somewhere — storage, stock, a hub, or a cargo at sea.
          expect(barrelsHeld(agents, cargo)).toBe(barrelsAtStart);
          // Invariant 2: the only cash that left is what the ledger recorded.
          const cashNow = agents.reduce((s, a) => s + a.cash, 0);
          expect(cashNow - cashAtStart).toBeCloseTo(-ledger.total, 4);
          // Invariant 4: no escrow survives the day.
          for (const a of agents) {
            expect(a.cashReserved).toBe(0);
            if (a.kind === 'PRODUCER') expect(a.storageEscrow).toBe(0);
            if (a.kind === 'TRADER') for (const hub of Object.values(a.hubs)) expect(total(hub.escrow)).toBe(0);
          }
          // Invariant 5 and solvency: nothing goes negative.
          for (const a of agents) {
            expect(a.cash).toBeGreaterThanOrEqual(0);
            if (a.kind === 'PRODUCER') expect(a.storage).toBeGreaterThanOrEqual(0);
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});
