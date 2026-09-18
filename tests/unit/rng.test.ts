import { describe, expect, it } from 'vitest';
import { nextFloat, nextUint32, rngFor, type Rng } from '../../src/engine/rng';

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => nextUint32(rng));

// bryc's original closure-based sfc32, used only to prove the plain-data version computes the same thing.
function referenceSfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

describe('rng (spec G10)', () => {
  it('matches the reference sfc32 algorithm for 1,000 outputs', () => {
    const seed = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x12345678] as const;
    const reference = referenceSfc32(...seed);
    const rng: Rng = { a: seed[0], b: seed[1], c: seed[2], d: seed[3] };
    for (let i = 0; i < 1000; i++) expect(nextUint32(rng)).toBe(reference());
  });

  it('reproduces a fixed golden sequence, on every machine and Node version', () => {
    // If this fails, the algorithm or the seeding changed, and every saved game and replay would break.
    expect(draw(rngFor('hormuz-golden', 'products'), 5)).toEqual([3390303996, 2166956113, 1997229213, 1910776391, 2131690063]);
    expect(draw(rngFor('hormuz-golden', 'events'), 5)).toEqual([2266923833, 3296968578, 674072378, 3397219812, 4130366305]);
    expect(draw(rngFor('hormuz-golden', 'ai'), 5)).toEqual([3824261343, 1711334359, 279579372, 3318061524, 1000137721]);
  });

  it('gives the same sequence for the same seed and stream', () => {
    expect(draw(rngFor('seed-1', 'events'), 100)).toEqual(draw(rngFor('seed-1', 'events'), 100));
  });

  it('gives different sequences for different seeds or different streams', () => {
    const base = draw(rngFor('seed-1', 'products'), 10);
    expect(draw(rngFor('seed-2', 'products'), 10)).not.toEqual(base);
    expect(draw(rngFor('seed-1', 'ai'), 10)).not.toEqual(base);
  });

  it('keeps streams independent: drawing heavily from one never shifts another (spec §7.3)', () => {
    const quiet = draw(rngFor('seed-1', 'products'), 50);
    const ai = rngFor('seed-1', 'ai');
    draw(ai, 10_000);
    expect(draw(rngFor('seed-1', 'products'), 50)).toEqual(quiet);
  });

  it('round-trips through JSON mid-sequence, as a save and load would', () => {
    const original = rngFor('seed-1', 'events');
    draw(original, 37);
    const restored = JSON.parse(JSON.stringify(original)) as Rng;
    expect(draw(restored, 100)).toEqual(draw(original, 100));
  });

  it('forks with structuredClone, as impact projections do (spec G4.5)', () => {
    const original = rngFor('seed-1', 'ai');
    draw(original, 5);
    const fork = structuredClone(original);
    const fromFork = draw(fork, 20);
    expect(draw(original, 20)).toEqual(fromFork);
  });

  it('keeps its state as unsigned 32-bit integers', () => {
    const rng = rngFor('seed-1', 'products');
    draw(rng, 1000);
    for (const v of Object.values(rng)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it('returns floats in [0, 1) that average about one half', () => {
    const rng = rngFor('seed-1', 'products');
    let sum = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 100_000).toBeCloseTo(0.5, 2);
  });
});
