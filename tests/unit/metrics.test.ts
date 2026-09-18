import { describe, expect, it } from 'vitest';
import { canonical, fingerprint } from '../../src/engine/metrics';

describe('canonical serializer (spec §14.6)', () => {
  it('sorts object keys, so key order never changes the text', () => {
    expect(canonical({ b: 1, a: { d: true, c: 'x' } })).toBe(canonical({ a: { c: 'x', d: true }, b: 1 }));
    expect(canonical({ b: 1, a: 2 })).toBe('{"a":2.000000000,"b":1.000000000}');
  });

  it('keeps array order, which is meaningful', () => {
    expect(canonical([2, 1])).not.toBe(canonical([1, 2]));
  });

  it('writes Map entries in insertion order instead of losing them as JSON does', () => {
    const m = new Map([['z', 1], ['a', 2]]);
    expect(JSON.stringify(m)).toBe('{}');
    expect(canonical(m)).toBe('{"$map":[["z",1.000000000],["a",2.000000000]]}');
  });

  it('fixes numbers to 1e-9, so last-bit float noise disappears', () => {
    expect(canonical(0.1 + 0.2)).toBe(canonical(0.3));
    expect(canonical(1 / 3)).toBe('0.333333333');
    expect(canonical(-0)).toBe('0.000000000');
    expect(canonical(-1e-12)).toBe('0.000000000');
    expect(canonical(-2.5)).toBe('-2.500000000');
  });

  it('refuses values that do not belong in engine state', () => {
    expect(() => canonical(NaN)).toThrow(/finite/);
    expect(() => canonical({ x: Infinity })).toThrow(/finite/);
    expect(() => canonical(new Set([1]))).toThrow(/Set/);
    expect(() => canonical(() => 1)).toThrow(/function/);
  });

  it('treats a missing optional field the same as an absent one', () => {
    expect(canonical({ a: 1, b: undefined })).toBe(canonical({ a: 1 }));
  });
});

describe('fingerprint', () => {
  it('is 32 hex characters, equal for equal states and different otherwise', () => {
    const f = fingerprint({ cash: 100, stock: [1, 2] });
    expect(f).toMatch(/^[0-9a-f]{32}$/);
    expect(fingerprint({ stock: [1, 2], cash: 100 })).toBe(f);
    expect(fingerprint({ cash: 100.000001, stock: [1, 2] })).not.toBe(f);
  });
});
