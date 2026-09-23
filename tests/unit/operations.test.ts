// Default operations: the crack-spread throttle, maintenance, breakdowns and works (spec §6.5, §4.9).

import { beforeEach, describe, expect, it } from 'vitest';
import { advancePlant, breakdownHazard, effectiveUtilization, outageLength } from '../../src/engine/agents';
import { createNode, type ExchangeNode } from '../../src/engine/clearing';
import { createRefiner } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger, type FeeLedger } from '../../src/engine/economics';
import type { Refiner } from '../../src/engine/model';
import { rngFor } from '../../src/engine/rng';
import { updateThrottle, type MarketView } from '../../src/engine/rules';
import { buildLaneGraph, LaneRouteProvider } from '../../src/engine/transport';

let straits: Refiner;
let dme: ExchangeNode;
let view: MarketView;
let ledger: FeeLedger;
beforeEach(() => {
  straits = createRefiner({
    id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000, techTier: 3,
    processingCapacity: 8000, crudeStorageCapacity: 25_000,
  });
  dme = createNode('DME');
  view = {
    tick: 1, nodes: { DME: dme }, routes: new LaneRouteProvider(buildLaneGraph(DEFAULT_CONFIG)),
    expectedPrices: DEFAULT_CONFIG.PRODUCT_PRICES.BASE, avoid: [], dealCommitments: { total: 0 },
  };
  ledger = createLedger();
});

describe('crack-spread throttle (spec §6.5)', () => {
  // Heavy crude is worth 77.40 delivered to Coastal_Asia; landed cost is the close + 3.50.
  const days = (n: number) => { for (let i = 0; i < n; i++) updateThrottle(straits, straits, view, DEFAULT_CONFIG); };

  it('cuts 10% a day to a 30% floor while crude costs more than it is worth', () => {
    dme.lastFobByOrigin.Middle_East = 80;   // landed 83.50 > 77.40
    days(1);
    expect(straits.utilization).toBe(0.9);
    days(20);
    expect(straits.utilization).toBe(0.3);
  });

  it('recovers 10% a day when margins return, never above the card cap', () => {
    straits.utilization = 0.3;
    straits.utilizationCap = 0.8;
    dme.lastFobByOrigin.Middle_East = 58.6;   // landed 62.10 < 77.40
    days(2);
    expect(straits.utilization).toBe(0.5);
    days(10);
    expect(straits.utilization).toBe(0.8);
  });

  it('holds when there is no price to judge by', () => {
    straits.utilization = 0.7;
    days(3);
    expect(straits.utilization).toBe(0.7);
  });
});

describe('maintenance (spec §6.5)', () => {
  it('takes the plant offline for MAINT_TICKS every MAINT_INTERVAL days, at MAINT_COST', () => {
    const rng = rngFor('ops', 'events');
    straits.daysSinceMaintenance = DEFAULT_CONFIG.MAINT_INTERVAL - 1;
    advancePlant(straits, straits, rng, ledger, 1, DEFAULT_CONFIG);
    expect(straits.maintenanceTicksRemaining).toBe(5);
    expect(effectiveUtilization(straits)).toBe(0);
    expect(ledger.entries).toEqual([{ tick: 1, agentId: straits.agentId, kind: 'MAINTENANCE', amount: 0.5 * 8000 }]);
    for (let t = 2; t <= 6; t++) advancePlant(straits, straits, rng, ledger, t, DEFAULT_CONFIG);
    expect(straits.maintenanceTicksRemaining).toBe(0);
    expect(straits.daysSinceMaintenance).toBe(0);
    expect(effectiveUtilization(straits)).toBe(1);
  });
});

describe('breakdowns (spec §4.9)', () => {
  it('grows more likely the longer since maintenance', () => {
    expect(breakdownHazard(straits, DEFAULT_CONFIG)).toBeCloseTo(0.0005, 12);
    straits.daysSinceMaintenance = 120;   // due: the hazard is 2^HAZARD_EXPONENT times the base (D39)
    expect(breakdownHazard(straits, DEFAULT_CONFIG)).toBeCloseTo(0.0005 * 16, 12);
    straits.daysSinceMaintenance = 240;
    expect(breakdownHazard(straits, DEFAULT_CONFIG)).toBeCloseTo(0.0005 * 81, 12);
  });

  it('stops the plant for BREAKDOWN_TICKS, then it runs again', () => {
    const certain = withOverrides(DEFAULT_CONFIG, { BASE_HAZARD: 1 });
    const rng = rngFor('ops', 'events');
    advancePlant(straits, straits, rng, ledger, 1, certain);
    const outage = straits.outageTicksRemaining;
    expect(outage).toBeGreaterThanOrEqual(8);
    expect(outage).toBeLessThanOrEqual(20);
    expect(effectiveUtilization(straits)).toBe(0);
    for (let t = 2; t <= 1 + outage; t++) advancePlant(straits, straits, rng, ledger, t, DEFAULT_CONFIG);
    expect(straits.outageTicksRemaining).toBe(0);
    expect(effectiveUtilization(straits)).toBe(1);
  });

  it('spreads outage lengths across the whole 8–20 range', () => {
    const certain = withOverrides(DEFAULT_CONFIG, { BASE_HAZARD: 1 });
    const rng = rngFor('lengths', 'events');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      straits.outageTicksRemaining = 0;
      straits.daysSinceMaintenance = 0;   // never due for maintenance, which would pre-empt a breakdown
      advancePlant(straits, straits, rng, ledger, i, certain);
      seen.add(straits.outageTicksRemaining);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 13 }, (_, i) => 8 + i));
  });

  it('happens at about the configured rate', () => {
    const rng = rngFor('rate', 'events');
    let breakdowns = 0;
    const trials = 200_000;
    for (let i = 0; i < trials; i++) {
      straits.outageTicksRemaining = 0;
      straits.daysSinceMaintenance = 59;   // hazard 0.0005 × 1.5⁴ ≈ 0.0025 on the day it turns 60
      advancePlant(straits, straits, rng, ledger, i, DEFAULT_CONFIG);
      if (straits.outageTicksRemaining > 0) breakdowns++;
    }
    expect(breakdowns / trials).toBeCloseTo(0.0005 * 1.5 ** 4, 3);
  });

  it('keeps a plant down longer the further maintenance has been put off (D39)', () => {
    const cfg = DEFAULT_CONFIG;
    straits.daysSinceMaintenance = cfg.MAINT_INTERVAL;            // due, but not yet late
    const onTime = outageLength(straits, cfg, 0.5);
    straits.daysSinceMaintenance = 3 * cfg.MAINT_INTERVAL;        // two intervals late
    expect(outageLength(straits, cfg, 0.5)).toBe(onTime + 2 * cfg.BREAKDOWN_OVERDUE_DAYS);
    expect(onTime).toBeGreaterThanOrEqual(cfg.BREAKDOWN_TICKS.min);
    expect(onTime).toBeLessThanOrEqual(cfg.BREAKDOWN_TICKS.max);
  });

  it('takes exactly one draw per plant per day, whatever state the plant is in', () => {
    const a = rngFor('draws', 'events');
    const b = rngFor('draws', 'events');
    straits.online = false;
    advancePlant(straits, straits, a, ledger, 1, DEFAULT_CONFIG);
    const running = createRefiner({ id: 'r', name: 'R', region: 'Coastal_Asia', cash: 1e6, techTier: 1, processingCapacity: 1000, crudeStorageCapacity: 5000 });
    advancePlant(running, running, b, ledger, 1, DEFAULT_CONFIG);
    expect(a).toEqual(b);
  });
});

describe('tier-upgrade works (spec §4.9)', () => {
  it('runs at the works factor until the works finish', () => {
    straits.worksTicksRemaining = 2;
    straits.worksFactor = DEFAULT_CONFIG.WORKS_CAPACITY_FACTOR;
    const rng = rngFor('works', 'events');
    advancePlant(straits, straits, rng, ledger, 1, DEFAULT_CONFIG);
    expect(straits.worksFactor).toBe(0.6);
    advancePlant(straits, straits, rng, ledger, 2, DEFAULT_CONFIG);
    expect(straits.worksFactor).toBe(1);
  });
});
