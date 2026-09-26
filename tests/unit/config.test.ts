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
    expect(c.LOT_SIZE).toBe(20_000);
    expect(c.FIXED_COST_RATE).toEqual({ PRODUCER: 7, REFINER: 4 });
    expect(c.DEAL_MAX_SHARE).toBe(0.8);
    expect(c.DEAL_TERMS).toEqual([30, 90]);
    expect(c.CARD_MAX_OPEN).toBe(3);
    expect(c.PROJECTION_TICKS).toBe(30);
    expect(c.UNIT_CAPACITY).toBe(50_000);
  });

  it('holds only finite, non-negative numbers', () => {
    // Every number here is a price, a rate or a count, and none of those can be negative. The one
    // exception is the economic climate's scale, which runs from a panic below zero to a boom above
    // it: it is a signed index, not a quantity of anything (§12A.8, B).
    const signed = (path: string) => path.startsWith('CLIMATE.BANDS.');
    for (const [path, n] of numbers(c)) {
      expect(Number.isFinite(n), path).toBe(true);
      if (!signed(path)) expect(n, path).toBeGreaterThanOrEqual(0);
    }
  });

  it('puts the climate’s five bands in order, from panic to boom', () => {
    const b = c.CLIMATE.BANDS;
    expect(b.PANIC).toBeLessThan(b.RECESSION);
    expect(b.RECESSION).toBeLessThan(b.PROSPEROUS);
    expect(b.PROSPEROUS).toBeLessThan(b.BOOM);
    // And the whole scale has to fit inside what the climate can actually reach.
    expect(Math.abs(b.PANIC)).toBeLessThan(c.CLIMATE.MAX);
    expect(b.BOOM).toBeLessThan(c.CLIMATE.MAX);
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

  it('gives up on a well at a twentieth of what it first made, and misses more the more holes are sunk', () => {
    // Decline is no longer a constant: a well fades because it is emptying (§12A.3), so what the
    // config still has to say about wells is when one is not worth pumping and how often one misses.
    expect(c.ABANDON_SHARE).toBeGreaterThan(0);
    expect(c.ABANDON_SHARE).toBeLessThan(0.2);
    expect(c.DRY_HOLE.FIRST).toBeGreaterThan(c.DRY_HOLE.FLOOR);
    expect(c.DRY_HOLE.PER_ATTEMPT).toBeGreaterThan(0);
    // The ramp has to do real work before the floor takes over — several holes on one lease, not
    // one or two — and the floor itself stays well the better side of a coin toss: infill on ground
    // you already produce from is not a gamble, whatever the last slot on it is (2026-09-25).
    expect((c.DRY_HOLE.FIRST - c.DRY_HOLE.FLOOR) / c.DRY_HOLE.PER_ATTEMPT).toBeGreaterThan(4);
    expect(c.DRY_HOLE.FLOOR).toBeGreaterThan(0.6);
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
    expect(cheap.FIXED_COST_RATE).toEqual({ PRODUCER: 7, REFINER: 3 });
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
