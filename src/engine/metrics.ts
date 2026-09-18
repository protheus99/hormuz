// Recording and fingerprinting the simulation (spec §11, §14.6).
// Phase 3 adds the canonical serializer and the fingerprint the golden-replay test is built on;
// per-tick metrics and CSV join in Phase 6.

import { cyrb128 } from './rng';

/** Decimal places kept for every number: the quantization precision of spec G10. */
const DIGITS = 9;

/**
 * One exact text form for any engine state (spec §14.6). Plain-object keys are sorted, Map entries
 * are written as [key, value] pairs in insertion order, and numbers are fixed to 9 decimal places,
 * so two states that differ only in key order or last-bit float noise serialize identically.
 * The golden hash and save/load both use this, so they cannot drift apart.
 * NaN and Infinity throw: they never belong in a valid state, and JSON would silently turn them into null.
 */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number': return formatNumber(value);
    case 'string': return JSON.stringify(value);
    case 'boolean': return String(value);
    case 'undefined': return 'null';
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value instanceof Map) return `{"$map":[${[...value].map(([k, v]) => `[${canonical(k)},${canonical(v)}]`).join(',')}]}`;
      if (value instanceof Set) throw new Error('canonical: engine state must not contain a Set (spec §4.1)');
      const keys = Object.keys(value).sort();
      const record = value as Record<string, unknown>;
      return `{${keys.filter((k) => record[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`canonical: cannot serialize a ${typeof value}`);
  }
}

/** A short hex fingerprint of any state, stable across machines and JavaScript engines. */
export function fingerprint(value: unknown): string {
  return cyrb128(canonical(value)).map((n) => n.toString(16).padStart(8, '0')).join('');
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`canonical: ${n} is not a finite number`);
  const text = n.toFixed(DIGITS);
  // -0, and negatives that round to zero, would otherwise print as "-0.000000000".
  return /^-0\.0+$/.test(text) ? text.slice(1) : text;
}
