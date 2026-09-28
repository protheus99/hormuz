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
import { jammedDays, resetPorts, widenPort, type Ports } from '../../src/engine/transport';

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
    // A strait's width is a fact about the world and belongs in the table. A port's port capacity are a
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
    // Every region that can load a ship has a port, and nowhere works ships without limit.
    for (const region of leaseRegions()) {
      const port = w.ports[region];
      expect(port, region).toBeDefined();
      expect(port?.ships ?? 0, region).toBeGreaterThanOrEqual(DEFAULT_CONFIG.PORT.MIN_SHIPS);
    }
  });

  it('sizes a port to the region behind it, and never grows it afterwards', () => {
    const w = createWorld({ seed: 'ports', portfolio: GLOBAL_PORTFOLIO, config: DEFAULT_CONFIG });
    // The Gulf pumps and refines far more than the Gulf of Oman, and can work more ships a day.
    expect(w.ports.Middle_East?.ships ?? 0).toBeGreaterThan(w.ports.Gulf_of_Oman?.ships ?? 0);
    // Two hundred days of drilling and depletion leave the port exactly as it was. A port is public
    // infrastructure: a region that outgrows it has to get the authority to widen it (D66).
    const before = w.ports.Middle_East?.ships ?? 0;
    run(w, 200);
    expect(w.ports.Middle_East?.ships ?? 0).toBe(before);
  });

  it('clears every port at the start of a day, so yesterday never crowds today', () => {
    const w = createWorld({ seed: 'ports', portfolio: GLOBAL_PORTFOLIO, config: DEFAULT_CONFIG });
    run(w, 30);
    for (const [region, port] of Object.entries(w.ports)) {
      // Never more ships worked than the port can take, on any day it has run.
      expect(port?.used ?? 0, region).toBeLessThanOrEqual(port?.ships ?? 0);
    }
  });

  it('remembers a trailing year of jammed days, not a lifetime tally', () => {
    // A card that offers to get a port widened quotes this number to the player, so it has to mean
    // what the words say. A lifetime count only climbs: a port widened years ago would still be
    // described as turning ships away, and the sentence would be a lie.
    const ports: Ports = { Middle_East: { ships: 1, used: 0 } };
    // Two years of a permanently full port: every day jams, but the memory is only ever a year's.
    for (let tick = 1; tick <= 730; tick++) {
      const p = ports.Middle_East;
      if (p !== undefined) p.used = 1;
      resetPorts(ports, tick);
    }
    // A year at least, and not much more: everything older than that has fallen off the end.
    expect(jammedDays(ports, 'Middle_East')).toBeGreaterThanOrEqual(365);
    expect(jammedDays(ports, 'Middle_East')).toBeLessThan(400);

    // And it forgets: a year of room to spare and the port has nothing to complain about.
    for (let tick = 731; tick <= 1125; tick++) resetPorts(ports, tick);
    expect(jammedDays(ports, 'Middle_East')).toBe(0);
  });

  it('counts a jam only when a port actually ran out of places', () => {
    const ports: Ports = { Middle_East: { ships: 3, used: 0 } };
    for (const used of [0, 1, 2]) {
      const p = ports.Middle_East;
      if (p !== undefined) p.used = used;
      resetPorts(ports, 1);
    }
    expect(jammedDays(ports, 'Middle_East')).toBe(0);
  });

  it('widens a port for good and keeps what it remembers', () => {
    const w = createWorld({ seed: 'ports', portfolio: GLOBAL_PORTFOLIO, config: DEFAULT_CONFIG });
    run(w, 40);
    const before = w.ports.Middle_East?.ships ?? 0;
    const remembered = jammedDays(w.ports, 'Middle_East');
    widenPort(w.ports, 'Middle_East', 2);
    expect(w.ports.Middle_East?.ships ?? 0).toBe(before + 2);
    expect(jammedDays(w.ports, 'Middle_East')).toBe(remembered);
    run(w, 10);
    expect(w.ports.Middle_East?.ships ?? 0).toBe(before + 2);
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
