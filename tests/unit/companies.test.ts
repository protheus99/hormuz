import { describe, expect, it } from 'vitest';
import { acceptedGrades, availableCash, createProducer, createRefiner, createTrader } from '../../src/engine/companies';

// Two companies from the core portfolio (spec §10.1).
const qasr = () => createProducer({
  id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2_000_000,
  extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000,
});
const straits = () => createRefiner({
  id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000,
  techTier: 3, processingCapacity: 8000, crudeStorageCapacity: 25_000, crudeStock: { HEAVY_SOUR: 12_000 },
});

describe('creating companies (spec §4.7–4.11)', () => {
  it('builds a producer with sensible defaults', () => {
    const p = qasr();
    expect(p).toMatchObject({ kind: 'PRODUCER', controller: 'AI', personality: 'BALANCED', storage: 7500, storageEscrow: 0, cashReserved: 0 });
    expect(p.fieldMaxCapacity).toBe(18_000);
  });

  it('builds a refiner, filling in empty stock for grades not given', () => {
    expect(straits().crudeStock).toEqual({ LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 12_000 });
  });

  it('builds a trader with a storage hub in each office', () => {
    const t = createTrader({
      id: 'tidemere', name: 'Tidemere Trading', region: 'North_Sea', cash: 2_000_000, maxRiskLimit: 5_000_000,
      offices: [{ region: 'North_Sea', capacity: 20_000 }, { region: 'Middle_East', capacity: 30_000 }],
    });
    expect(t.offices).toEqual(['North_Sea', 'Middle_East']);
    expect(t.hubs.Middle_East?.capacity).toBe(30_000);
    expect(t.hubs.US_Permian).toBeUndefined();
  });

  it('gives the player no personality', () => {
    expect(createProducer({ ...specOf(qasr()), id: 'you', controller: 'HUMAN' }).personality).toBeNull();
  });

  it('produces plain data that saves and forks', () => {
    const p = qasr();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(structuredClone(straits())).toEqual(straits());
  });
});

describe('placement rules (spec §3.4)', () => {
  it('rejects a producer in a refining-only region', () => {
    expect(() => createProducer({ ...specOf(qasr()), region: 'Coastal_Asia' })).toThrow(/Coastal_Asia has no production role/);
  });

  it('rejects a grade the region cannot produce', () => {
    expect(() => createProducer({ ...specOf(qasr()), region: 'US_Permian' })).toThrow(/US_Permian cannot produce HEAVY_SOUR/);
  });

  it('rejects a refiner where refining is not allowed', () => {
    expect(() => createRefiner({ id: 'r', name: 'R', region: 'US_Permian', cash: 1, techTier: 1, processingCapacity: 1, crudeStorageCapacity: 1 }))
      .toThrow(/no refining role/);
  });

  it('rejects stock a refinery cannot process or has no room for', () => {
    const r = { id: 'r', name: 'R', region: 'Coastal_Asia' as const, cash: 1, processingCapacity: 1000, crudeStorageCapacity: 10_000 };
    expect(() => createRefiner({ ...r, techTier: 1, crudeStock: { MEDIUM: 5000 } })).toThrow(/Tier 1 refinery cannot hold MEDIUM/);
    expect(() => createRefiner({ ...r, techTier: 3, crudeStock: { MEDIUM: 20_000 } })).toThrow(/exceeds storage capacity/);
  });

  it('rejects storage above capacity and negative amounts', () => {
    expect(() => createProducer({ ...specOf(qasr()), storage: 40_000 })).toThrow(/exceeds capacity/);
    expect(() => createProducer({ ...specOf(qasr()), cash: -5 })).toThrow(/cash must be a non-negative number/);
  });

  it('rejects a trader whose home region is not an office', () => {
    expect(() => createTrader({ id: 't', name: 'T', region: 'Caspian', cash: 1, maxRiskLimit: 1, offices: [{ region: 'North_Sea', capacity: 1 }] }))
      .toThrow(/must be one of its offices/);
  });

  it('rejects an impossible tech tier at compile time', () => {
    // @ts-expect-error There is no Tier 4.
    const bad = { techTier: 4 as const } satisfies { techTier: 1 | 2 | 3 };
    expect(bad.techTier).toBe(4);
  });
});

describe('helpers', () => {
  it('accepts heavier grades as the tier rises (spec §4.9)', () => {
    expect(acceptedGrades(1)).toEqual(['LIGHT_SWEET']);
    expect(acceptedGrades(2)).toEqual(['LIGHT_SWEET', 'MEDIUM']);
    expect(acceptedGrades(3)).toEqual(['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR']);
  });

  it('counts only cash not promised to bids as available', () => {
    const p = qasr();
    p.cashReserved = 500_000;
    expect(availableCash(p)).toBe(1_500_000);
  });
});

// Rebuilds a spec from a producer so tests can change one field at a time.
function specOf(p: ReturnType<typeof qasr>) {
  return {
    id: p.agentId as string, name: p.name, region: p.region, grade: p.grade, cash: p.cash,
    extractionCapacity: p.extractionCapacity, baseExtractionCost: p.baseExtractionCost, storageCapacity: p.storageCapacity,
  };
}
