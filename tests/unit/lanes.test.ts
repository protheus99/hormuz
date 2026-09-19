// Integrity of the transport network table (spec §3.5). Routing tests live with transport.ts.

import { describe, expect, it } from 'vitest';
import { CHOKEPOINT_NAMES } from '../../src/data/chokepoints';
import { LANES, WAYPOINTS } from '../../src/data/lanes';
import { REGION_NAMES } from '../../src/data/regions';

const touching = (place: string) => LANES.filter((l) => l.a === place || l.b === place);

describe('lane table (spec §3.5)', () => {
  it('gives every lane a unique id and no lane joins a place to itself', () => {
    expect(new Set(LANES.map((l) => l.id)).size).toBe(LANES.length);
    for (const l of LANES) expect(l.a, l.id).not.toBe(l.b);
  });

  it('connects every region and uses every waypoint', () => {
    for (const r of REGION_NAMES) expect(touching(r).length, r).toBeGreaterThan(0);
    for (const w of WAYPOINTS) expect(touching(w).length, w).toBeGreaterThan(1);
  });

  it('puts each of the seven chokepoints on exactly one lane', () => {
    for (const c of CHOKEPOINT_NAMES) expect(LANES.filter((l) => l.chokepoint === c).map((l) => l.id), c).toHaveLength(1);
  });

  it('gives every chokepoint lane an open throughput, and no other lane one', () => {
    for (const l of LANES) {
      if (l.chokepoint !== undefined) expect(l.throughput, l.id).toBeGreaterThan(0);
      else expect(l.throughput, l.id).toBeUndefined();
    }
  });

  it('keeps transit and freight positive, and capacity only on pipelines', () => {
    for (const l of LANES) {
      expect(l.transit, l.id).toBeGreaterThan(0);
      expect(l.freight, l.id).toBeGreaterThan(0);
      if (l.capacity !== undefined) {
        expect(l.mode, l.id).toBe('PIPELINE');
        expect(l.capacity % 1000, l.id).toBe(0);   // whole lots
      }
    }
  });

  it('sets the Gulf bypasses below Gulf exports, so they bind in a Hormuz closure (spec §10.2)', () => {
    const cap = (id: string) => LANES.find((l) => l.id === id)?.capacity;
    expect([cap('bypass_red_sea'), cap('bypass_oman')]).toEqual([6000, 3000]);
  });
});
