// Seeded random numbers for the engine (spec G10, rule 1).
//
// The generator is sfc32: its whole state is four 32-bit integers. That state is plain data,
// so it saves to JSON and copies with structuredClone like the rest of the world (spec §4.1) —
// a closure-based generator could do neither.
//
// Every operation here is integer arithmetic (|, ^, <<, >>>, Math.imul) or division by 2^32.
// Those are exact in every JavaScript engine, so the same seed gives bit-identical output in
// Node, Chrome, Firefox and Safari. Math.random is banned in the engine (spec G10) because it
// cannot be seeded.

/** The generator's entire state. Always four unsigned 32-bit integers. */
export interface Rng {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** The independent streams the engine draws from (spec G10). */
export type RngStream = 'products' | 'events' | 'ai' | 'wells' | 'climate' | 'storms';

/**
 * A new generator for one stream of one game.
 * Streams never affect each other: drawing from 'ai' leaves the 'products' sequence unchanged,
 * which is why adding or removing companies never changes product prices (spec §7.3).
 */
export function rngFor(masterSeed: string, stream: RngStream): Rng {
  const [a, b, c, d] = cyrb128(`${masterSeed}::${stream}`);
  const rng: Rng = { a, b, c, d };
  // sfc32's first few outputs still reflect the seed closely; discarding them mixes the state.
  for (let i = 0; i < 15; i++) nextUint32(rng);
  return rng;
}

/** Advances the generator and returns an integer in [0, 2^32). */
export function nextUint32(rng: Rng): number {
  // `x | 0` forces a 32-bit signed integer; `x >>> 0` reinterprets it as unsigned.
  const t = (((rng.a + rng.b) | 0) + rng.d) | 0;
  rng.d = (rng.d + 1) >>> 0;
  rng.a = (rng.b ^ (rng.b >>> 9)) >>> 0;
  rng.b = (rng.c + (rng.c << 3)) >>> 0;
  const rotated = (rng.c << 21) | (rng.c >>> 11);
  rng.c = (rotated + t) >>> 0;
  return t >>> 0;
}

/** Advances the generator and returns a float in [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextUint32(rng) / 4294967296;
}

/**
 * Advances the generator by exactly two draws and returns one standard normal value (mean 0,
 * standard deviation 1), using the Box-Muller transform. Box-Muller makes normals in pairs; the
 * second is thrown away rather than cached, so the generator's state stays four integers (G10 rule 2).
 * Math.log and Math.cos are not bit-identical across JavaScript engines, which is why the price
 * process rounds its state every tick (G10 rule 3).
 */
export function normal(rng: Rng): number {
  const u1 = 1 - nextFloat(rng);          // in (0, 1], so the logarithm is never of zero
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Normal values that move together (spec §7.3). `cholesky` is the lower-triangular factor L of a
 * correlation matrix (see `cholesky()`); multiplying independent normals by L gives draws with
 * exactly those correlations. Always consumes two draws per row.
 */
export function correlatedNormals(rng: Rng, cholesky: readonly (readonly number[])[]): number[] {
  const independent = cholesky.map(() => normal(rng));
  return cholesky.map((row) => row.reduce((sum, weight, j) => sum + weight * (independent[j] ?? 0), 0));
}

/**
 * The Cholesky factor L of a symmetric positive-definite matrix M, such that L × Lᵀ = M.
 * Used once per game to turn the product correlation table into weights for correlatedNormals.
 * Throws if the matrix is not a valid correlation matrix, rather than returning NaN weights.
 */
export function cholesky(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const L: number[][] = matrix.map(() => new Array<number>(n).fill(0));
  const at = (m: readonly (readonly number[])[], i: number, j: number): number => m[i]?.[j] ?? 0;
  for (let i = 0; i < n; i++) {
    if (matrix[i]?.length !== n) throw new Error('cholesky needs a square matrix');
    for (let j = 0; j <= i; j++) {
      if (at(matrix, i, j) !== at(matrix, j, i)) throw new Error('cholesky needs a symmetric matrix');
      let sum = at(matrix, i, j);
      for (let k = 0; k < j; k++) sum -= at(L, i, k) * at(L, j, k);
      const row = L[i] as number[];
      if (i === j) {
        if (sum <= 0) throw new Error('cholesky needs a positive-definite matrix');
        row[j] = Math.sqrt(sum);
      } else {
        row[j] = sum / at(L, j, j);
      }
    }
  }
  return L;
}

/**
 * cyrb128: turns a string into four well-mixed 32-bit integers. Seeds sfc32, and fingerprints
 * canonical state for the golden hash (metrics.ts). Not cryptographic. Public domain, by bryc.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
