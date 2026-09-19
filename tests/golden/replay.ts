// Golden replay harness (spec §14.6). Runs a small, fully scripted economy built from every engine
// part that exists so far — product prices, extraction and decline, integrated transfers, refining,
// maintenance and breakdowns, seeded order pricing, batch clearing, settlement, the lane graph and
// cargo logistics, with a Hormuz closure from day 150 to 180 — and fingerprints its state every day.
//
// Until the tick orchestrator exists (Phase 6), this stands in for S0, with scripted orders in place
// of the §6 decision rules. From Phase 6 the harness runs `step()` on S0 instead, and the recorded
// hash is updated once, in the same commit.
//
// It imports only the engine and plain data, never Node, so the same file runs in a browser.

import { advancePlant, applyDecline, extract, internalTransfer, refine } from '../../src/engine/agents';
import { clear, createNode, submit, type ExchangeNode } from '../../src/engine/clearing';
import { createIntegrated, createProducer, createRefiner, plantOf, total, wellOf } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger, createRetailSink, productValue, updatePrices, YIELDS } from '../../src/engine/economics';
import { fingerprint } from '../../src/engine/metrics';
import { makeOrderId, type Agent, type AgentId, type Cargo, type NodeName, type Order } from '../../src/engine/model';
import { nextFloat, rngFor } from '../../src/engine/rng';
import { runLogistics } from '../../src/engine/logistics';
import { buildLaneGraph, LaneRouteProvider, setChokepoint } from '../../src/engine/transport';
import { placeOrder, releaseEscrow, settleFills } from '../../src/engine/settlement';
import { NODES } from '../../src/data/nodes';

export const GOLDEN_SEED = 'hormuz-golden';
export const GOLDEN_DAYS = 365;

export interface ReplayResult {
  /** Fingerprint of each day's end state, day 1 first. */
  readonly daily: readonly string[];
  /** Fingerprint of the whole run. */
  readonly final: string;
  /** Totals that show the run exercised the engine, for sanity checks. */
  readonly summary: { readonly fills: number; readonly refined: number; readonly fees: number; readonly heldCargoDays: number };
}

/** Days Hormuz is closed, to exercise held cargo, bypass routing and delivery overflow. */
const HORMUZ_CLOSED = { from: 150, to: 180 };

function portfolio(): Agent[] {
  return [
    createProducer({ id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2_000_000, extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000 }),
    createProducer({ id: 'fennrick', name: 'Fennrick Offshore', region: 'North_Sea', grade: 'MEDIUM', cash: 1_000_000, extractionCapacity: 3500, baseExtractionCost: 32, storageCapacity: 15_000 }),
    createRefiner({ id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000, techTier: 3, processingCapacity: 8000, crudeStorageCapacity: 25_000 }),
    createRefiner({ id: 'indus', name: 'Indus Refining', region: 'South_Asia', cash: 3_000_000, techTier: 2, processingCapacity: 6000, crudeStorageCapacity: 20_000 }),
    createIntegrated({
      id: 'skaldmark', name: 'Skaldmark Integrated', region: 'North_Sea', cash: 5_000_000,
      well: { grade: 'MEDIUM', extractionCapacity: 8000, baseExtractionCost: 22, storageCapacity: 20_000 },
      plant: { techTier: 2, processingCapacity: 5000, crudeStorageCapacity: 15_000 },
    }),
    createIntegrated({
      id: 'sabkhar', name: 'Sabkhar Integrated', region: 'Middle_East', cash: 5_000_000,
      well: { grade: 'HEAVY_SOUR', extractionCapacity: 4000, baseExtractionCost: 12, storageCapacity: 10_000 },
      plant: { techTier: 3, processingCapacity: 9000, crudeStorageCapacity: 25_000 },
    }),
  ];
}

/** `inspect` receives each day's fingerprinted state, for finding where two runs diverge. */
export function runGoldenReplay(seed = GOLDEN_SEED, days = GOLDEN_DAYS, inspect?: (day: number, state: unknown) => void): ReplayResult {
  const config = DEFAULT_CONFIG;
  const agents = portfolio();
  const byId = new Map<AgentId, Agent>(agents.map((a) => [a.agentId, a]));
  const nodes: ExchangeNode[] = [createNode('DME'), createNode('NC')];
  const sink = createRetailSink(seed, config);
  const ai = rngFor(seed, 'ai');
  const events = rngFor(seed, 'events');
  const ledger = createLedger();
  const cargo: Cargo[] = [];
  const baseline = agents.reduce((s, a) => s + (plantOf(a)?.processingCapacity ?? 0), 0) * config.PRODUCT_PRICES.BASE_UTILIZATION;
  const daily: string[] = [];
  const graph = buildLaneGraph(config);
  const routes = new LaneRouteProvider(graph);
  let fills = 0;
  let refined = 0;
  let held = 0;

  for (let day = 1; day <= days; day++) {
    updatePrices(sink, baseline, config);

    setChokepoint(graph, 'HORMUZ', day >= HORMUZ_CLOSED.from && day < HORMUZ_CLOSED.to ? 'CLOSED' : 'OPEN');
    routes.resetTick();

    for (const a of agents) {
      if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') advancePlant(a, events, ledger, day, config);
      if (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED') {
        applyDecline(a, config);
        extract(a, ledger, day, config);
      }
    }
    const logistics = runLogistics(cargo, byId, graph, ledger, day, config, (grade) => nodes.find((n) => n.grade === grade)?.markerPrice ?? 0);
    held += logistics.held;

    for (const a of agents) {
      if (a.kind === 'INTEGRATED') internalTransfer(a);
      if (a.kind === 'REFINER' || a.kind === 'INTEGRATED') refined += refine(a, sink, ledger, day).barrels;
    }

    // Seeded orders: sellers ask above cost, buyers bid below what a barrel is worth to them.
    const orders: Order[] = [];
    agents.forEach((a, i) => {
      let seq = 0;
      const well = wellOf(a);
      if (well && a.kind === 'PRODUCER') {
        const qty = Math.floor(well.storage / 2 / 1000) * 1000;
        if (qty > 0) {
          orders.push({
            orderId: makeOrderId(i, seq++), agentId: a.agentId, node: nodeFor(well.grade), side: 'ASK',
            limitPrice: round2(well.baseExtractionCost + 30 + 20 * nextFloat(ai)), qty, qtyRemaining: qty, originRegion: a.region,
          });
        }
      }
      const plant = plantOf(a);
      if (plant && a.kind === 'REFINER') {
        const room = plant.crudeStorageCapacity - total(plant.crudeStock) - plant.inboundBarrels;
        const qty = Math.min(Math.floor(room / 1000) * 1000, 10_000);
        const node: NodeName = plant.techTier === 3 ? 'DME' : 'NC';
        const grade = NODES[node].grade;
        const worth = productValue(grade, sink.expectedPrices) - YIELDS[grade].opex;
        if (qty > 0) {
          orders.push({
            orderId: makeOrderId(i, seq), agentId: a.agentId, node, side: 'BID',
            limitPrice: round2(worth - 5 - 10 * nextFloat(ai)), qty, qtyRemaining: qty,
            deliveryRegion: a.region, avoidChokepoints: [],
          });
        }
      }
    });

    const ctx = { routes, tick: day, config };
    for (const order of orders) {
      try {
        placeOrder(byId.get(order.agentId) as Agent, order);
      } catch {
        continue;   // unaffordable today
      }
      const node = nodes.find((n) => n.name === order.node) as ExchangeNode;
      submit(node, order, config);
    }
    for (const node of nodes) {
      const dayFills = clear(node, ctx);
      fills += dayFills.length;
      cargo.push(...settleFills(dayFills, byId, ledger));
    }
    releaseEscrow(agents);

    const state = { day, agents, sink, markers: nodes.map((n) => [n.name, n.markerPrice, n.lastFobByOrigin]), ledgerTotal: ledger.total, cargo };
    inspect?.(day, state);
    daily.push(fingerprint(state));
  }
  return { daily, final: fingerprint(daily), summary: { fills, refined, fees: ledger.total, heldCargoDays: held } };
}

function nodeFor(grade: 'LIGHT_SWEET' | 'MEDIUM' | 'HEAVY_SOUR'): NodeName {
  return grade === 'HEAVY_SOUR' ? 'DME' : grade === 'MEDIUM' ? 'NC' : 'NYMEX';
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
