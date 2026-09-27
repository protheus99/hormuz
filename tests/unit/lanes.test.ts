// Integrity of the transport network table (spec §3.5). Routing tests live with transport.ts.

import { describe, expect, it } from 'vitest';
import { CHOKEPOINT_NAMES } from '../../src/data/chokepoints';
import { LANES, WAYPOINTS } from '../../src/data/lanes';
import { REGION_NAMES } from '../../src/data/regions';
import { REGIONS } from '../../src/data/regions';
import { leaseRegions } from '../../src/engine/actions';
import { EdgeMode } from '../../src/engine/enums';
import { createWorld, run } from '../../src/engine/world';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { DEFAULT_CONFIG } from '../../src/engine/config';

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

  it('writes a throughput only for the straits; a port gets its own when the world is made', () => {
    // A strait's width is a fact about the world and belongs in the table. A port's berths are a
    // fact about the region behind them, so they are sized from the portfolio at world creation
    // (§3.5, D66) and are deliberately absent here.
    for (const l of LANES) {
      if (l.chokepoint !== undefined) expect(l.throughput, l.id).toBeGreaterThan(0);
      else expect(l.throughput, l.id).toBeUndefined();
    }
  });

  it('gives every sea region a port with a finite throughput once the world exists', () => {
    const w = createWorld({ seed: 'ports', portfolio: GLOBAL_PORTFOLIO, config: DEFAULT_CONFIG });
    const ports = w.graph.edges.filter((e) => e.mode === EdgeMode.SEA && e.chokepoint === null
      && (e.a as string) in REGIONS && String(e.b).startsWith('W_'));
    expect(ports.length).toBeGreaterThan(0);
    for (const e of ports) {
      expect(e.throughput, String(e.id)).not.toBeNull();
      expect(e.throughput ?? 0, String(e.id)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.PORT.MIN);
    }
    // Every region that can load a ship has one, and nowhere loads without limit.
    const withPort = new Set(ports.map((e) => e.a));
    for (const region of leaseRegions()) expect([...withPort], region).toContain(region);
  });

  it('sizes a port to the region behind it, and never grows it afterwards', () => {
    const w = createWorld({ seed: 'ports', portfolio: GLOBAL_PORTFOLIO, config: DEFAULT_CONFIG });
    const berth = (id: string) => w.graph.edges.find((e) => String(e.id) === id)?.throughput ?? 0;
    // The Gulf pumps and refines far more than the Gulf of Oman, and its berths say so.
    expect(berth('Middle_East-W_PERSIAN_GULF')).toBeGreaterThan(berth('Gulf_of_Oman-W_ARABIAN_SEA'));
    // A year of drilling and depletion leaves the berths exactly where they were: a port is built
    // once, and a region that outgrows it has to do something about it (D66).
    const before = berth('Middle_East-W_PERSIAN_GULF');
    run(w, 200);
    expect(berth('Middle_East-W_PERSIAN_GULF')).toBe(before);
  });

  it('keeps transit and freight positive, and capacity only on pipelines', () => {
    for (const l of LANES) {
      expect(l.transit, l.id).toBeGreaterThan(0);
      expect(l.freight, l.id).toBeGreaterThan(0);
      if (l.capacity !== undefined) {
        expect(l.mode, l.id).toBe('PIPELINE');
        expect(l.capacity % 20_000, l.id).toBe(0);   // whole lots
      }
    }
  });

  it('sets the Gulf bypasses below Gulf exports, so they bind in a Hormuz closure (spec §10.2)', () => {
    const cap = (id: string) => LANES.find((l) => l.id === id)?.capacity;
    expect([cap('bypass_red_sea'), cap('bypass_oman')]).toEqual([120_000, 60_000]);
  });
});
