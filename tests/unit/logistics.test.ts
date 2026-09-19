// Cargo movement, holds and delivery overflow (spec §5 phase 4, Phase 4 acceptance).

import { beforeEach, describe, expect, it } from 'vitest';
import { createRefiner, createTrader, total } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger, type FeeLedger } from '../../src/engine/economics';
import { runLogistics } from '../../src/engine/logistics';
import { asCargoId, newCargo, type Agent, type AgentId, type Cargo, type RegionName, type Refiner } from '../../src/engine/model';
import { advanceCargo, buildLaneGraph, findRoute, setChokepoint, type LaneGraph } from '../../src/engine/transport';

let g: LaneGraph;
let straits: Refiner;
let ledger: FeeLedger;
beforeEach(() => {
  g = buildLaneGraph(DEFAULT_CONFIG);
  straits = createRefiner({
    id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000, techTier: 3,
    processingCapacity: 8000, crudeStorageCapacity: 25_000,
  });
  ledger = createLedger();
});

function cargoTo(owner: Agent, from: RegionName, to: RegionName, qty: number, id = 'c1'): Cargo {
  const route = findRoute(g, from, to);
  if (route === null) throw new Error('route expected');
  return newCargo({ cargoId: asCargoId(id), ownerId: owner.agentId, grade: 'HEAVY_SOUR', qty, origin: from, destination: to, route, dispatchTick: 0, dealId: null });
}

/** Advances until the cargo arrives; returns how many ticks that took. */
function ticksToArrive(c: Cargo, limit = 200): number {
  for (let t = 1; t <= limit; t++) if (advanceCargo(c, g) === 'ARRIVED') return t;
  throw new Error('never arrived');
}

describe('moving cargo (spec §5 phase 4)', () => {
  it('arrives after exactly the route’s transit time', () => {
    const c = cargoTo(straits, 'Middle_East', 'Coastal_Asia', 5000);
    expect(ticksToArrive(c)).toBe(16);
    expect(c.leg).toBe(c.route.edges.length);
  });

  it('delivers inside a region on the next tick', () => {
    const c = cargoTo(straits, 'Coastal_Asia', 'Coastal_Asia', 5000);
    expect(ticksToArrive(c)).toBe(1);
  });

  it('holds at the entry of a closed chokepoint, and does not advance until it reopens (Phase 4 acceptance)', () => {
    const c = cargoTo(straits, 'Middle_East', 'Coastal_Asia', 5000);
    expect(advanceCargo(c, g)).toBe('MOVING');       // day 1: loading terminal, now at the Hormuz entry
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    for (let i = 0; i < 10; i++) expect(advanceCargo(c, g)).toBe('HELD');
    expect(c.leg).toBe(1);
    expect(c.status).toBe('HELD');
    setChokepoint(g, 'HORMUZ', 'OPEN');
    expect(ticksToArrive(c)).toBe(15);              // the remaining 15 ticks, unchanged
    expect(c.status).toBe('MOVING');
  });

  it('is not affected by a closure behind it', () => {
    const c = cargoTo(straits, 'Middle_East', 'Coastal_Asia', 5000);
    for (let i = 0; i < 3; i++) advanceCargo(c, g);  // through Hormuz
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    expect(ticksToArrive(c)).toBe(13);
  });

  it('adds a delay when entering a DELAYED chokepoint, but not one already entered', () => {
    const c = cargoTo(straits, 'Middle_East', 'Coastal_Asia', 5000);
    advanceCargo(c, g);
    setChokepoint(g, 'HORMUZ', 'DELAYED', 4);
    expect(ticksToArrive(c)).toBe(15 + 4);
  });
});

describe('delivery and overflow (spec §5 "Delivery overflow")', () => {
  const agentsOf = (...list: Agent[]) => new Map<AgentId, Agent>(list.map((a) => [a.agentId, a]));
  const price = () => 60;

  it('unloads into the refinery’s tanks and pays the destination tariff', () => {
    straits.inboundBarrels = 5000;
    const cargo = [cargoTo(straits, 'Coastal_Asia', 'Coastal_Asia', 5000)];
    const report = runLogistics(cargo, agentsOf(straits), g, ledger, 1, DEFAULT_CONFIG, price);
    expect(report.delivered).toBe(5000);
    expect(cargo).toEqual([]);
    expect(straits.crudeStock.HEAVY_SOUR).toBe(5000);
    expect(straits.inboundBarrels).toBe(0);
    expect(straits.cash).toBeCloseTo(3_000_000 - 5000 * 1.00, 6);   // Coastal_Asia tariff $1.00
    expect(ledger.entries.map((e) => e.kind)).toEqual(['DESTINATION_TARIFF']);
  });

  it('floats what does not fit, pays demurrage while waiting, and unloads as space frees', () => {
    straits.crudeStock.HEAVY_SOUR = 22_000;          // 3,000 free
    const cargo = [cargoTo(straits, 'Coastal_Asia', 'Coastal_Asia', 5000)];
    const agents = agentsOf(straits);
    runLogistics(cargo, agents, g, ledger, 1, DEFAULT_CONFIG, price);
    expect(cargo[0]).toMatchObject({ status: 'FLOATING', qty: 2000, demurrageTicks: 0 });

    const r2 = runLogistics(cargo, agents, g, ledger, 2, DEFAULT_CONFIG, price);
    expect(r2.floating).toBe(1);
    expect(cargo[0]?.demurrageTicks).toBe(1);
    expect(ledger.entries.at(-1)).toMatchObject({ kind: 'DEMURRAGE', amount: 2000 * 0.25 });

    straits.crudeStock.HEAVY_SOUR -= 8000;           // a day of refining frees space
    runLogistics(cargo, agents, g, ledger, 3, DEFAULT_CONFIG, price);
    expect(cargo).toEqual([]);
    expect(total(straits.crudeStock)).toBe(25_000 - 8000 + 2000);
  });

  it('sells a cargo off at a distress price after DEMURRAGE_MAX_TICKS', () => {
    straits.crudeStock.HEAVY_SOUR = 25_000;          // full
    const cargo = [cargoTo(straits, 'Coastal_Asia', 'Coastal_Asia', 4000)];
    const agents = agentsOf(straits);
    let sales: ReturnType<typeof runLogistics>['forcedSales'] = [];
    for (let t = 1; t <= 1 + DEFAULT_CONFIG.DEMURRAGE_MAX_TICKS; t++) {
      sales = runLogistics(cargo, agents, g, ledger, t, DEFAULT_CONFIG, price).forcedSales;
    }
    expect(sales).toEqual([{ cargoId: 'c1', ownerId: straits.agentId, barrels: 4000, revenue: 4000 * 60 * 0.8 }]);
    expect(cargo).toEqual([]);
    const demurrage = ledger.entries.filter((e) => e.kind === 'DEMURRAGE').length;
    expect(demurrage).toBe(DEFAULT_CONFIG.DEMURRAGE_MAX_TICKS);
  });

  it('delivers a trader’s cargo into its hub', () => {
    const trader = createTrader({
      id: 'tidemere', name: 'Tidemere', region: 'Middle_East', cash: 2_000_000, maxRiskLimit: 5e6,
      offices: [{ region: 'Middle_East', capacity: 50_000 }, { region: 'Coastal_Asia', capacity: 10_000 }],
    });
    const cargo = [cargoTo(trader, 'Coastal_Asia', 'Coastal_Asia', 12_000)];
    runLogistics(cargo, agentsOf(trader), g, ledger, 1, DEFAULT_CONFIG, price);
    expect(trader.hubs.Coastal_Asia?.stock.HEAVY_SOUR).toBe(10_000);
    expect(cargo[0]).toMatchObject({ status: 'FLOATING', qty: 2000 });
  });

  it('reports cargo held at a closed chokepoint', () => {
    const cargo = [cargoTo(straits, 'Middle_East', 'Coastal_Asia', 5000)];
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    runLogistics(cargo, agentsOf(straits), g, ledger, 1, DEFAULT_CONFIG, price);
    expect(runLogistics(cargo, agentsOf(straits), g, ledger, 2, DEFAULT_CONFIG, price).held).toBe(1);
  });
});
