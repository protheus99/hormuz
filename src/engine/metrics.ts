// Recording and fingerprinting the simulation (spec §11, §14.6): the canonical serializer and
// fingerprint behind the golden replay and saves, and the per-tick recorder behind metrics.csv.

import { plantOf, total, wellOf } from './companies';
import { PRODUCTS } from './enums';
import { cyrb128 } from './rng';
import type { TickReport, World } from './world';
import { NODE_NAMES } from '../data/nodes';

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

// ─── Per-tick metrics (spec §11.1) ───────────────────────────────────────────────────────────

/** One row per tick; columns are fixed by the first row recorded. */
export interface Recorder {
  columns: string[];
  rows: number[][];
}

export function createRecorder(): Recorder {
  return { columns: [], rows: [] };
}

/**
 * Records the §11.1 headline series for one tick: markers, product prices, volumes, cargo at sea,
 * held and floating, and each company's cash, stock and run rate. More series join as the
 * dashboard and balancing reports need them.
 */
export function record(r: Recorder, w: World, report: TickReport): void {
  const row: [string, number][] = [
    ['tick', report.tick],
    ...NODE_NAMES.map((n): [string, number] => [`marker_${n}`, w.nodes[n].markerPrice]),
    ...PRODUCTS.map((p): [string, number] => [`price_${p}`, w.sink.prices[p]]),
    ['extracted', report.extracted],
    ['refined', report.refined],
    ['traded', report.fills.reduce((s, f) => s + f.qty, 0)],
    ['in_transit', w.cargo.filter((c) => c.status === 'MOVING').reduce((s, c) => s + c.qty, 0)],
    ['held', w.cargo.filter((c) => c.status === 'HELD').reduce((s, c) => s + c.qty, 0)],
    ['floating', w.cargo.filter((c) => c.status === 'FLOATING').reduce((s, c) => s + c.qty, 0)],
    ['fees', report.fees],
  ];
  for (const a of w.agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
    row.push([`cash_${a.agentId}`, a.cash]);
    if (well) row.push([`storage_${a.agentId}`, well.storage]);
    if (plant) {
      row.push([`stock_${a.agentId}`, total(plant.crudeStock)]);
      row.push([`utilization_${a.agentId}`, plant.utilization]);
    }
    if (a.kind === 'TRADER') {
      row.push([`hubs_${a.agentId}`, Object.values(a.hubs).reduce((s, h) => s + (h ? total(h.stock) : 0), 0)]);
    }
  }
  if (r.columns.length === 0) r.columns = row.map(([name]) => name);
  r.rows.push(row.map(([, value]) => value));
}

/** metrics.csv (spec §11.1): a header and one line per tick, numbers to 6 decimal places. */
export function toCsv(r: Recorder): string {
  const lines = [r.columns.join(',')];
  for (const row of r.rows) lines.push(row.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(6))).join(','));
  return `${lines.join('\n')}\n`;
}
