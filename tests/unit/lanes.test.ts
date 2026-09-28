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
import {
  askPort, daysToReview, hasAskedPort, jammedDays, resetPorts, reviewDay, reviewPorts, widenPort, type Ports,
} from '../../src/engine/transport';
import { withOverrides } from '../../src/engine/config';
import { rngFor } from '../../src/engine/rng';
import { asAgentId } from '../../src/engine/model';

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

  it('sits once a year, one region at a time, and never twice on the same day', () => {
    // Nineteen authorities, nineteen days apart: the whole map deciding on one morning would make a
    // year's most consequential news arrive in a single unreadable heap.
    const days = REGION_NAMES.map((r) => reviewDay(r, DEFAULT_CONFIG));
    expect(new Set(days).size).toBe(days.length);
    for (const d of days) expect(d).toBeLessThan(DEFAULT_CONFIG.AUTHORITY.REVIEW_DAYS);
    // And the countdown is a countdown: it falls by a day at a time and comes round again.
    const region = REGION_NAMES[0]!;
    const seen = new Set<number>();
    for (let tick = 0; tick < DEFAULT_CONFIG.AUTHORITY.REVIEW_DAYS; tick++) seen.add(daysToReview(region, tick, DEFAULT_CONFIG));
    expect(seen.size).toBe(DEFAULT_CONFIG.AUTHORITY.REVIEW_DAYS);
  });

  it('will not look at a port nobody is queueing at, however many ask', () => {
    const ports: Ports = { Middle_East: { ships: 4, used: 0, jammed: [1, 1] } };
    askPort(ports, 'Middle_East', asAgentId('one'));
    askPort(ports, 'Middle_East', asAgentId('two'));
    const rng = rngFor('review', 'ports');
    // Certain odds, so only the congestion bar can be what stops it.
    const sure = withOverrides(DEFAULT_CONFIG, { AUTHORITY: { BASE_ODDS: 1 } });
    expect(reviewPorts(ports, reviewDay('Middle_East', sure), rng, sure)).toEqual([]);
    expect(ports.Middle_East?.ships).toBe(4);
  });

  it('is much likelier to widen a port that somebody asked for, and never certain', () => {
    const jammed = () => [30, 30] as number[];
    const cfg = withOverrides(DEFAULT_CONFIG, { AUTHORITY: { BASE_ODDS: 0.05, PER_ASK: 0.25, MAX_ODDS: 0.75 } });
    const day = reviewDay('Middle_East', cfg);
    const run = (asks: number) => {
      const rng = rngFor('review', 'ports');
      let widened = 0;
      for (let year = 0; year < 400; year++) {
        const ports: Ports = { Middle_East: { ships: 4, used: 0, jammed: jammed() } };
        for (let i = 0; i < asks; i++) askPort(ports, 'Middle_East', asAgentId(`firm${String(i)}`));
        if (reviewPorts(ports, day, rng, cfg)[0]?.widened === true) widened++;
      }
      return widened / 400;
    };
    // Nobody asking is everybody else's case in one number, and it is thin.
    expect(run(0)).toBeGreaterThan(0.01);
    expect(run(0)).toBeLessThan(0.12);
    // One submission is worth several years of hoping.
    expect(run(1)).toBeGreaterThan(0.2);
    // And a crowd cannot buy it outright: only the road with a record on it is certain (§12A.6).
    expect(run(5)).toBeLessThan(0.85);
    expect(run(5)).toBeGreaterThan(run(1));
  });

  it('counts a company once however often it asks, and forgets after it has sat', () => {
    const ports: Ports = { Middle_East: { ships: 4, used: 0, jammed: [40] } };
    const me = asAgentId('mine');
    askPort(ports, 'Middle_East', me);
    askPort(ports, 'Middle_East', me);
    expect(hasAskedPort(ports, 'Middle_East', me)).toBe(true);
    expect(ports.Middle_East?.asked).toHaveLength(1);

    const rng = rngFor('review', 'ports');
    const cfg = withOverrides(DEFAULT_CONFIG, { AUTHORITY: { BASE_ODDS: 1 } });
    const [review] = reviewPorts(ports, reviewDay('Middle_East', cfg), rng, cfg);
    expect(review?.widened).toBe(true);
    expect(review?.asked).toEqual([me]);
    expect(ports.Middle_East?.ships).toBe(4 + cfg.AUTHORITY.SHIPS);
    // The case has to be made again next year.
    expect(hasAskedPort(ports, 'Middle_East', me)).toBe(false);
  });

  it('reports a refusal as well as a widening, because a company that asked is owed an answer', () => {
    const ports: Ports = { Middle_East: { ships: 4, used: 0, jammed: [40] } };
    const never = withOverrides(DEFAULT_CONFIG, { AUTHORITY: { BASE_ODDS: 0, PER_ASK: 0 } });
    askPort(ports, 'Middle_East', asAgentId('mine'));
    const [review] = reviewPorts(ports, reviewDay('Middle_East', never), rngFor('review', 'ports'), never);
    expect(review?.widened).toBe(false);
    expect(review?.jammed).toBe(40);
    expect(ports.Middle_East?.ships).toBe(4);
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
