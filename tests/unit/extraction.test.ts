// Extraction, field decline and output control (spec §4.8, §5 phase 1).

import { beforeEach, describe, expect, it } from 'vitest';
import { emptyTanks, fillTanks, refreshStorage } from '../../src/engine/leases';
import { actualCost, applyDecline, extract, fillRatio, setExtractionRate } from '../../src/engine/agents';
import { createIntegrated, createProducer } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { rngFor } from '../../src/engine/rng';

/** A field with no day-to-day swing: these tests are about the planned rate, not the economic climate. */
const STEADY = withOverrides(DEFAULT_CONFIG, { EXTRACTION_SPREAD: 0 });
const wells = () => rngFor('extraction-test', 'wells');
import { createLedger, type FeeLedger } from '../../src/engine/economics';
import type { Producer } from '../../src/engine/model';
import { REGIONS } from '../../src/data/regions';

let qasr: Producer;
let boreal: Producer;
let ledger: FeeLedger;
beforeEach(() => {
  qasr = createProducer({
    id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 40_000_000,
    extractionCapacity: 180_000, baseExtractionCost: 10, storageCapacity: 600_000, storage: 0,
  });
  boreal = createProducer({
    id: 'boreal', name: 'Boreal Shale', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 20_000_000,
    extractionCapacity: 120_000, baseExtractionCost: 24, storageCapacity: 240_000, storage: 0,
  });
  ledger = createLedger();
});

describe('extract (spec §5 phase 1)', () => {
  it('pumps full capacity and pays base cost × labor for each barrel', () => {
    const labor = REGIONS.Middle_East.laborCostIndex;
    expect(actualCost(qasr)).toBeCloseTo(10 * labor, 12);
    const r = extract(qasr, ledger, 1, STEADY, wells());
    expect(r.barrels).toBe(180_000);
    expect(r.cost).toBeCloseTo(180_000 * 10 * labor, 6);
    expect(qasr.storage).toBe(180_000);
    expect(qasr.cash).toBeCloseTo(40_000_000 - r.cost, 6);
    expect(ledger.entries).toEqual([{ tick: 1, agentId: qasr.agentId, kind: 'EXTRACTION', amount: r.cost }]);
  });

  it('halts when storage is full, counting barrels locked by asks', () => {
    fillTanks(qasr, 560_000);
    qasr.leases[0]!.storage -= 60_000;
    qasr.leases[0]!.storageEscrow = 60_000;
    refreshStorage(qasr);
    expect(extract(qasr, ledger, 1, STEADY, wells()).barrels).toBe(40_000);
    expect(fillRatio(qasr)).toBe(1);
    expect(extract(qasr, ledger, 2, STEADY, wells()).barrels).toBe(0);
  });

  it('works on an integrated major’s wells, paid from the shared wallet', () => {
    const major = createIntegrated({
      id: 'skaldmark', name: 'Skaldmark', region: 'North_Sea', cash: 100_000_000,
      well: { grade: 'MEDIUM', extractionCapacity: 160_000, baseExtractionCost: 22, storageCapacity: 400_000, storage: 0 },
      plant: { techTier: 2, processingCapacity: 100_000, crudeStorageCapacity: 300_000 },
    });
    const r = extract(major, ledger, 1, STEADY, wells());
    expect(major.well.storage).toBe(160_000);
    expect(major.cash).toBeCloseTo(100_000_000 - r.cost, 6);
  });
});

describe('field decline (spec §12A.3)', () => {
  it('falls with what has been lifted, not with what has passed', () => {
    // A month of pumping: shale, which holds less oil for the rate it makes, fades faster.
    for (let t = 0; t < 30; t++) {
      extract(boreal, ledger, (t + 1) as never, STEADY, wells());
      extract(qasr, ledger, (t + 1) as never, STEADY, wells());
      emptyTanks(boreal);
      emptyTanks(qasr);
      applyDecline(boreal, DEFAULT_CONFIG);
      applyDecline(qasr, DEFAULT_CONFIG);
    }
    expect(boreal.extractionCapacity).toBeLessThan(120_000);
    expect(qasr.extractionCapacity).toBeLessThan(180_000);
    expect(boreal.extractionCapacity / 120_000).toBeLessThan(qasr.extractionCapacity / 180_000);
    expect(boreal.peakCapacity).toBe(120_000);                                  // peak remembers the high
  });

  it('does not decline at all while the wells are shut in, since the oil stays where it is', () => {
    const before = qasr.extractionCapacity;
    for (let t = 0; t < 120; t++) applyDecline(qasr, DEFAULT_CONFIG);
    expect(qasr.extractionCapacity).toBe(before);
  });
});

describe('cutting and restarting output (spec §4.8, G4.4)', () => {
  it('pumps the chosen share of capacity', () => {
    setExtractionRate(qasr, 0.5, ledger, 1, DEFAULT_CONFIG);
    expect(extract(qasr, ledger, 1, STEADY, wells()).barrels).toBe(90_000);
    expect(qasr.shutIn).toBe(false);
  });

  it('shuts wells in below the threshold, and charges to restart them, ramping back over RAMP_TICKS', () => {
    setExtractionRate(qasr, 0.2, ledger, 1, DEFAULT_CONFIG);
    expect(qasr.shutIn).toBe(true);
    expect(extract(qasr, ledger, 1, STEADY, wells()).barrels).toBe(0);

    const cashBefore = qasr.cash;
    setExtractionRate(qasr, 1, ledger, 2, DEFAULT_CONFIG);
    expect(cashBefore - qasr.cash).toBeCloseTo(DEFAULT_CONFIG.RESTART_COST * 180_000, 6);
    expect(ledger.entries.at(-1)?.kind).toBe('RESTART');

    qasr.storageCapacity = 1e9;   // room for the whole ramp
    const daily = Array.from({ length: 12 }, (_, i) => extract(qasr, ledger, 3 + i, STEADY, wells()).barrels);
    expect(daily.slice(0, 3)).toEqual([18_000, 36_000, 54_000]);   // 10%, 20%, 30%…
    expect(daily[9]).toBe(180_000);                            // …full output on day 10
    expect(daily[11]).toBe(180_000);
  });

  it('does not charge a restart when output changes on a running field', () => {
    setExtractionRate(qasr, 0.75, ledger, 1, DEFAULT_CONFIG);
    expect(ledger.entries).toEqual([]);
  });

  it('rejects rates outside 0–1', () => {
    expect(() => setExtractionRate(qasr, 1.5, ledger, 1, DEFAULT_CONFIG)).toThrow(/between 0 and 1/);
  });
});

describe('the day-to-day swing (spec §5 phase 1)', () => {
  it('never pumps the same number twice, and still averages the planned rate over a year', () => {
    const rng = rngFor('swing', 'wells');
    // Tanks big enough that nothing is ever clipped by full storage.
    qasr.storageCapacity = 2_000_000_000;
    const days = Array.from({ length: 365 }, () => extract(qasr, ledger, 1, DEFAULT_CONFIG, rng).barrels);
    const plan = qasr.extractionCapacity * qasr.extractionRate;

    expect(new Set(days).size).toBe(days.length);
    for (const d of days) {
      expect(d).toBeGreaterThan(plan * (1 - DEFAULT_CONFIG.EXTRACTION_SPREAD) - 1);
      expect(d).toBeLessThan(plan * (1 + DEFAULT_CONFIG.EXTRACTION_SPREAD) + 1);
    }
    // The swing is even-handed: a year of it is worth about a year of the plan.
    const average = days.reduce((t, d) => t + d, 0) / days.length;
    expect(Math.abs(average / plan - 1)).toBeLessThan(0.01);
  });

  it('still stops at a full tank, however good the day', () => {
    fillTanks(qasr, qasr.storageCapacity - 100);
    expect(extract(qasr, ledger, 1, DEFAULT_CONFIG, rngFor('swing', 'wells')).barrels).toBe(100);
  });
});
