import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withOverrides, type Config } from '../../src/engine/config';

const c = DEFAULT_CONFIG;

// Collects every number in the config with a dotted path, e.g. 'FIXED_COST_RATE.REFINER'.
function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => numbers(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('DEFAULT_CONFIG (spec §7.4)', () => {
  it('carries the spec values that the design rests on', () => {
    expect(c.LOT_SIZE).toBe(1000);
    expect(c.FIXED_COST_RATE).toEqual({ PRODUCER: 2, REFINER: 4 });
    expect(c.DEAL_MAX_SHARE).toBe(0.8);
    expect(c.DEAL_TERMS).toEqual([30, 90]);
    expect(c.CARD_MAX_OPEN).toBe(3);
    expect(c.PROJECTION_TICKS).toBe(30);
    expect(c.INTEGRATE_PLANT_CAPACITY).toBe(2500);
  });

  it('holds only finite, non-negative numbers', () => {
    for (const [path, n] of numbers(c)) {
      expect(Number.isFinite(n), path).toBe(true);
      expect(n, path).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every share and rate written as a fraction between 0 and 1', () => {
    const fractions = [
      'SKEW', 'DUMP_THRESHOLD', 'URGENCY', 'AGGRESSION', 'SHUT_IN_THRESHOLD', 'WORKS_CAPACITY_FACTOR',
      'BASE_HAZARD', 'MAX_RESERVATION_SHARE', 'MAX_LEASE_SHARE', 'DISTRESS_DISCOUNT', 'DEAL_MAX_SHARE',
      'SHORTFALL_RATE', 'CANCEL_RATE', 'CREDIT_RATE', 'REPORT_NOISE',
    ] as const satisfies readonly (keyof Config)[];
    for (const key of fractions) {
      expect(c[key], key).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every range in order', () => {
    for (const range of [c.BREAKDOWN_TICKS, c.DEAL_VOLUME, c.TENDER_DELAY]) {
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
  });

  it('declines shale about 3% a month and conventional fields about 0.5% (spec G4.7)', () => {
    const monthly = (perTick: number) => 1 - (1 - perTick) ** 30;
    expect(monthly(c.DECLINE_RATE.SHALE)).toBeCloseTo(0.03, 2);
    expect(monthly(c.DECLINE_RATE.CONVENTIONAL)).toBeCloseTo(0.005, 3);
  });

  it('refuses to be changed at runtime', () => {
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.CHARTER.LARGE)).toBe(true);
    expect(() => {
      (c as { LOT_SIZE: number }).LOT_SIZE = 1;
    }).toThrow(TypeError);
  });

  it('survives a JSON round trip', () => {
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe('withOverrides', () => {
  it('changes a top-level value and leaves the base alone', () => {
    const hard = withOverrides(c, { CARD_DEADLINE: 5 });
    expect(hard.CARD_DEADLINE).toBe(5);
    expect(c.CARD_DEADLINE).toBe(7);
  });

  it('changes one nested value without restating its siblings', () => {
    const cheap = withOverrides(c, { FIXED_COST_RATE: { REFINER: 3 } });
    expect(cheap.FIXED_COST_RATE).toEqual({ PRODUCER: 2, REFINER: 3 });
  });

  it('replaces arrays whole', () => {
    expect(withOverrides(c, { DEAL_TERMS: [60] }).DEAL_TERMS).toEqual([60]);
  });

  it('returns a frozen config', () => {
    expect(Object.isFrozen(withOverrides(c, { LOT_SIZE: 500 }).FIXED_COST_RATE)).toBe(true);
  });

  it('rejects unknown keys and wrong types at compile time', () => {
    // @ts-expect-error LOT_SIZ is not a config key.
    const typo = withOverrides(c, { LOT_SIZ: 500 });
    // @ts-expect-error LOT_SIZE is a number.
    const wrongType = withOverrides(c, { LOT_SIZE: '500' });
    expect([typo, wrongType]).toHaveLength(2);
  });
});
