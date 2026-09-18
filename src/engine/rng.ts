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
export type RngStream = 'products' | 'events' | 'ai';

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

// cyrb128: turns a string into four well-mixed 32-bit integers to seed sfc32. Public domain, by bryc.
function cyrb128(str: string): [number, number, number, number] {
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
