// Refining and utilization (spec §4.9, §5 phase 3, Phase 3 acceptance).

import { beforeEach, describe, expect, it } from 'vitest';
import { effectiveUtilization, refine } from '../../src/engine/agents';
import { createRefiner } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger, createRetailSink, productValue, YIELDS, type FeeLedger, type RetailSink } from '../../src/engine/economics';
import type { Refiner } from '../../src/engine/model';

const flat = withOverrides(DEFAULT_CONFIG, {
  PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 }, AMPLITUDE: { GASOLINE: 0, DIESEL: 0 } },
});

let straits: Refiner;
let sink: RetailSink;
let ledger: FeeLedger;

beforeEach(() => {
  straits = createRefiner({
    id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000, techTier: 3,
    processingCapacity: 8000, crudeStorageCapacity: 25_000,
    crudeStock: { LIGHT_SWEET: 3000, MEDIUM: 2000, HEAVY_SOUR: 10_000 },
  });
  sink = createRetailSink('seed-1', flat);
  ledger = createLedger();
});

describe('effective utilization (spec §4.9)', () => {
  it('runs at the throttle setting, never above the card cap', () => {
    expect(effectiveUtilization(straits)).toBe(1);
    straits.utilization = 0.8;
    straits.utilizationCap = 0.6;
    expect(effectiveUtilization(straits)).toBe(0.6);
  });

  it('is zero for an offline plant or one broken down (Phase 3 acceptance)', () => {
    straits.online = false;
    expect(effectiveUtilization(straits)).toBe(0);
    straits.online = true;
    straits.outageTicksRemaining = 4;
    expect(effectiveUtilization(straits)).toBe(0);
  });
});

describe('refine (spec §5 phase 3)', () => {
  it('refines up to capacity, best-margin grade first', () => {
    // Margins at base prices: light 97 − 6 = 91, medium 93.9 − 8 = 85.9, heavy 90 − 11 = 79.
    const result = refine(straits, straits, sink, ledger, 1);
    expect(result.byGrade).toEqual({ LIGHT_SWEET: 3000, MEDIUM: 2000, HEAVY_SOUR: 3000 });
    expect(result.barrels).toBe(8000);
    expect(straits.crudeStock).toEqual({ LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 7000 });
  });

  it('sells the output to the retail sink and pays opex out of the economy', () => {
    const cashBefore = straits.cash;
    const result = refine(straits, straits, sink, ledger, 1);
    const expectedRevenue = 3000 * productValue('LIGHT_SWEET', sink.prices)
      + 2000 * productValue('MEDIUM', sink.prices) + 3000 * productValue('HEAVY_SOUR', sink.prices);
    const expectedOpex = 3000 * 6 + 2000 * 8 + 3000 * 11;
    expect(result.revenue).toBeCloseTo(expectedRevenue, 6);
    expect(result.opex).toBe(expectedOpex);
    expect(straits.cash - cashBefore).toBeCloseTo(expectedRevenue - expectedOpex, 6);
    expect(ledger.entries).toEqual([{ tick: 1, agentId: straits.agentId, kind: 'REFINING_OPEX', amount: expectedOpex }]);
    expect(sink.outputToday).toBe(8000);
  });

  it('switches to the grade that pays best when product prices move', () => {
    // Fuel oil worth $300 makes heavy sour (18% fuel oil) the best barrel to refine.
    sink.prices.FUEL_OIL = 300;
    const result = refine(straits, straits, sink, ledger, 1);
    expect(result.byGrade.HEAVY_SOUR).toBe(8000);
  });

  it('runs slower when throttled and during tier-upgrade works', () => {
    straits.utilization = 0.5;
    straits.worksFactor = DEFAULT_CONFIG.WORKS_CAPACITY_FACTOR;
    expect(refine(straits, straits, sink, ledger, 1).barrels).toBe(8000 * 0.5 * 0.6);
  });

  it('refines nothing when offline, and records no fee', () => {
    straits.online = false;
    const result = refine(straits, straits, sink, ledger, 1);
    expect(result.barrels).toBe(0);
    expect(ledger.entries).toEqual([]);
    expect(straits.cash).toBe(3_000_000);
  });

  it('never refines a grade outside its tier, even if some were in its tanks (Phase 3 acceptance)', () => {
    const metro = createRefiner({
      id: 'metro', name: 'Metro Refine', region: 'Coastal_Asia', cash: 3_000_000, techTier: 1,
      processingCapacity: 6000, crudeStorageCapacity: 20_000, crudeStock: { LIGHT_SWEET: 1000 },
    });
    metro.crudeStock.MEDIUM = 5000;   // placed by hand; placeOrder would never allow it
    const result = refine(metro, metro, sink, ledger, 1);
    expect(result.byGrade).toEqual({ LIGHT_SWEET: 1000, MEDIUM: 0, HEAVY_SOUR: 0 });
    expect(metro.crudeStock.MEDIUM).toBe(5000);
  });

  it('keeps each grade’s opex from the yield table', () => {
    expect([YIELDS.LIGHT_SWEET.opex, YIELDS.MEDIUM.opex, YIELDS.HEAVY_SOUR.opex]).toEqual([6, 8, 11]);
  });
});
