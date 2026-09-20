// Integrated majors: one company, one wallet, a well and a plant in the same region (spec §4.10, G2).

import { beforeEach, describe, expect, it } from 'vitest';
import { internalTransfer, refine } from '../../src/engine/agents';
import { createIntegrated, createProducer, integrate, integrationPlant, minimumTier, plantCost, plantOf, wellOf } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger, createRetailSink } from '../../src/engine/economics';
import { makeOrderId, type Ask, type Bid, type IntegratedMajor, type Producer } from '../../src/engine/model';
import { placeOrder, releaseEscrow } from '../../src/engine/settlement';

// Skaldmark from the core portfolio (spec §10.1): a North Sea surplus major.
const skaldmark = (): IntegratedMajor => createIntegrated({
  id: 'skaldmark', name: 'Skaldmark Integrated', region: 'North_Sea', cash: 5_000_000,
  well: { grade: 'MEDIUM', extractionCapacity: 8000, baseExtractionCost: 22, storageCapacity: 20_000, storage: 12_000 },
  plant: { techTier: 2, processingCapacity: 5000, crudeStorageCapacity: 15_000, crudeStock: { MEDIUM: 10_000 } },
});

let major: IntegratedMajor;
beforeEach(() => { major = skaldmark(); });

describe('creating an integrated major (spec §10.1)', () => {
  it('holds a well and a plant under one company and one wallet', () => {
    expect(major.kind).toBe('INTEGRATED');
    expect(major.cash).toBe(5_000_000);
    expect(wellOf(major)).toBe(major.well);
    expect(plantOf(major)).toBe(major.plant);
    expect(major.well.fieldMaxCapacity).toBe(16_000);
    expect(major.plant.utilization).toBe(1);
  });

  it('checks both halves against the region', () => {
    expect(() => createIntegrated({
      id: 'x', name: 'Permian Major', region: 'US_Permian', cash: 1e6,
      well: { grade: 'LIGHT_SWEET', extractionCapacity: 1000, baseExtractionCost: 20, storageCapacity: 5000 },
      plant: { techTier: 1, processingCapacity: 1000, crudeStorageCapacity: 5000 },
    })).toThrow(/US_Permian has no refining role/);
  });

  it('allows a starting refinery in the Gulf, as the portfolio needs', () => {
    const sabkhar = createIntegrated({
      id: 'sabkhar', name: 'Sabkhar Integrated', region: 'Middle_East', cash: 5_000_000,
      well: { grade: 'HEAVY_SOUR', extractionCapacity: 4000, baseExtractionCost: 12, storageCapacity: 10_000 },
      plant: { techTier: 3, processingCapacity: 9000, crudeStorageCapacity: 25_000 },
    });
    expect(sabkhar.region).toBe('Middle_East');
  });
});

describe('internal clearing (spec §5 phase 2)', () => {
  it('moves crude from well to plant up to free tank space, with no cash or fees (Phase 3 acceptance)', () => {
    const moved = internalTransfer(major);
    expect(moved).toBe(5000);                        // 15,000 tanks − 10,000 held
    expect(major.well.storage).toBe(7000);
    expect(major.plant.crudeStock.MEDIUM).toBe(15_000);
    expect(major.cash).toBe(5_000_000);              // no tariff, no freight, no transfer price
  });

  it('moves nothing the plant cannot refine', () => {
    major.plant.techTier = 1;
    major.plant.crudeStock.MEDIUM = 0;
    expect(internalTransfer(major)).toBe(0);
    expect(major.well.storage).toBe(12_000);
  });

  it('refines into the shared wallet', () => {
    const ledger = createLedger();
    const result = refine(major, major.plant, createRetailSink('seed-1', DEFAULT_CONFIG), ledger, 1);
    expect(result.barrels).toBe(5000);
    expect(major.cash).toBeCloseTo(5_000_000 + result.revenue - result.opex, 6);
    expect(ledger.entries[0]?.agentId).toBe(major.agentId);
  });
});

describe('trading as an integrated major (spec §6.3)', () => {
  const ask = (qty: number): Ask => ({
    orderId: makeOrderId(1, 1), agentId: major.agentId, node: 'NC', side: 'ASK',
    limitPrice: 70, qty, qtyRemaining: qty, originRegion: 'North_Sea',
  });
  const bid = (qty: number, dest: 'North_Sea' | 'Coastal_Asia' = 'North_Sea'): Bid => ({
    orderId: makeOrderId(1, 2), agentId: major.agentId, node: 'NC', side: 'BID',
    limitPrice: 70, qty, qtyRemaining: qty, deliveryRegion: dest, avoidChokepoints: [],
  });

  it('sells surplus from its wells, with the usual escrow', () => {
    placeOrder(major, ask(5000));
    expect([major.well.storage, major.well.storageEscrow]).toEqual([7000, 5000]);
    releaseEscrow([major]);
    expect([major.well.storage, major.well.storageEscrow]).toEqual([12_000, 0]);
  });

  it('buys crude delivered to its own plant only', () => {
    placeOrder(major, bid(2000));
    expect(major.cashReserved).toBe(140_000);
    expect(() => placeOrder(major, bid(1000, 'Coastal_Asia'))).toThrow(/only take delivery at its refinery in North_Sea/);
  });
});

describe('a producer integrating (spec G2)', () => {
  const fennrick = (): Producer => createProducer({
    id: 'fennrick', name: 'Fennrick Offshore', region: 'North_Sea', grade: 'MEDIUM', cash: 1_000_000,
    extractionCapacity: 3500, baseExtractionCost: 32, storageCapacity: 15_000, storage: 9000,
  });
  const newPlant = { techTier: 2, processingCapacity: DEFAULT_CONFIG.UNIT_CAPACITY, crudeStorageCapacity: 7500 } as const;

  it('keeps its identity, cash and wells, and gains the new plant', () => {
    const p = fennrick();
    const m = integrate(p, newPlant);
    expect(m).toMatchObject({ agentId: p.agentId, name: p.name, region: 'North_Sea', cash: 1_000_000, kind: 'INTEGRATED' });
    expect(m.well).toMatchObject({ grade: 'MEDIUM', extractionCapacity: 3500, storage: 9000, storageEscrow: 0 });
    expect(m.plant).toMatchObject({ techTier: 2, processingCapacity: 2500, crudeStock: { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 } });
    expect('grade' in m).toBe(false);   // the well fields moved, not copied
  });

  it('is closed in the Gulf and anywhere without a refining role', () => {
    const gulf = createProducer({
      id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2e6,
      extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000,
    });
    expect(() => integrate(gulf, { ...newPlant, techTier: 3 })).toThrow(/no new refineries may be built in Middle_East/);
    const permian = createProducer({
      id: 'boreal', name: 'Boreal Shale', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 1e6,
      extractionCapacity: 6000, baseExtractionCost: 24, storageCapacity: 12_000,
    });
    expect(() => integrate(permian, newPlant)).toThrow(/US_Permian has no refining role/);
  });

  it('refuses to integrate mid-tick while barrels are in escrow', () => {
    const p = fennrick();
    p.storageEscrow = 1000;
    expect(() => integrate(p, newPlant)).toThrow(/between ticks/);
  });
});

describe('the plant a producer builds (spec G2)', () => {
  it('is at the lowest tier that refines the producer’s own crude', () => {
    expect([minimumTier('LIGHT_SWEET'), minimumTier('MEDIUM'), minimumTier('HEAVY_SOUR')]).toEqual([1, 2, 3]);
    const fennrick = createProducer({
      id: 'fennrick', name: 'Fennrick Offshore', region: 'North_Sea', grade: 'MEDIUM', cash: 1_000_000,
      extractionCapacity: 3500, baseExtractionCost: 32, storageCapacity: 15_000,
    });
    const plant = integrationPlant(fennrick, DEFAULT_CONFIG);
    expect(plant).toEqual({ techTier: 2, processingCapacity: 2500, crudeStorageCapacity: 25_000 });
    // Once built, it can take the company's own oil.
    const m = integrate(fennrick, plant);
    expect(internalTransfer(m)).toBeGreaterThan(0);
  });

  it('costs the factory plus each tier above 1, scaled by labor', () => {
    // North Sea labor 1.40: 2,500 × (4,000 + 3,000) × 1.40 = $24.5M.
    expect(plantCost('North_Sea', { techTier: 2, processingCapacity: 2500, crudeStorageCapacity: 25_000 }, DEFAULT_CONFIG)).toBeCloseTo(24_500_000, 6);
    // Tier 1 in Southeast Asia (labor 0.70): 2,500 × 4,000 × 0.70 = $7.0M.
    expect(plantCost('Southeast_Asia', { techTier: 1, processingCapacity: 2500, crudeStorageCapacity: 25_000 }, DEFAULT_CONFIG)).toBeCloseTo(7_000_000, 6);
  });
});
