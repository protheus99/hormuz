// Leases and wells (spec §12A): a producer's field is ground with a finite, hidden quantity of oil
// in it. Stage 1 must leave every number the rest of the engine reads exactly where it was, keep
// the oil conserved, and never let the reserves reach a player.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { wellOf } from '../../src/engine/companies';
import { capacityOf, depleteWells, drillWell, liftFrom, newLease, reservesOf, BAND_YEARS } from '../../src/engine/leases';
import type { Lease } from '../../src/engine/model';

const leaseCapacityOf = (l: Lease) => capacityOf([l]);
import { createWorld, step } from '../../src/engine/world';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { rngFor } from '../../src/engine/rng';
import { GameSession } from '../../src/game/session';
import { PLAYER_ID, type GameSettings } from '../../src/game/newgame';

const lease = (capacity: number, wells: number) => newLease({
  id: 'L', name: 'Test lease', region: 'US_Permian', grade: 'LIGHT_SWEET', capacity,
  band: 'MEDIUM', baseExtractionCost: 30, acquiredFor: 0, wells, maxWells: wells + 4,
});

describe('a lease and its wells', () => {
  it('shares the field between its wells, and they add back up to it', () => {
    const l = lease(6_000, 8);
    expect(l.wells).toHaveLength(8);
    expect(capacityOf([l])).toBeCloseTo(6_000, 6);
    expect(l.reserves).toBeCloseTo(6_000 * 365 * BAND_YEARS.MEDIUM, 6);
    expect(l.originalReserves).toBe(l.reserves);
  });

  it('lifts oil out of the ground and never mints a barrel', () => {
    const l = lease(6_000, 8);
    const lifted = liftFrom(l, 5_000);
    expect(lifted).toBe(5_000);
    expect(l.produced).toBe(5_000);
    expect(l.reserves + l.produced).toBeCloseTo(l.originalReserves, 6);
    // Every pumping well took its share, so no single well carries the whole lease.
    expect(l.wells.every((w) => w.cumulative > 0)).toBe(true);
    expect(l.wells.reduce((t, w) => t + w.cumulative, 0)).toBeCloseTo(5_000, 6);
  });

  it('stops at what is left, however hard it is pumped', () => {
    const l = lease(6_000, 8);
    l.reserves = 400;
    expect(liftFrom(l, 5_000)).toBe(400);
    expect(l.reserves).toBe(0);
    expect(liftFrom(l, 5_000)).toBe(0);
  });

  it('shares the same oil out again when another well is sunk, rather than finding more', () => {
    const l = lease(6_000, 8);
    const rng = rngFor('hit', 'wells');
    let drilled = null;
    while (drilled === null && l.wells.length < l.maxWells) drilled = drillWell(l, 500, DEFAULT_CONFIG, rng);
    expect(drilled).not.toBeNull();
    expect(capacityOf([l])).toBeCloseTo(6_500, 6);
    // Nine wells now draw on the oil eight used to, so each holds a ninth of what is left.
    expect(l.reserves).toBe(l.originalReserves);
    for (const w of l.wells) expect(w.recoverable).toBeCloseTo(l.reserves / l.wells.length, 6);
    expect(l.wells.reduce((t, w) => t + w.recoverable - w.cumulative, 0)).toBeCloseTo(l.reserves, 6);
  });

  it('misses sometimes, and misses more often the more holes have been sunk', () => {
    const rng = rngFor('dry', 'wells');
    let hits = 0;
    let attempts = 0;
    for (let run = 0; run < 200; run++) {
      const l = lease(6_000, 8);
      // Four slots left on every lease: drill them all and count what was found.
      for (let i = 0; i < 4; i++) { attempts += 1; if (drillWell(l, 500, DEFAULT_CONFIG, rng) !== null) hits += 1; }
    }
    const rate = hits / attempts;
    // Eight wells already sunk, so the chance starts near 0.53 and falls 4 points a hole.
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.60);
  });

  it('finds nothing at all once every slot is drilled', () => {
    const l = lease(6_000, 8);
    const rng = rngFor('full', 'wells');
    for (let i = 0; i < 40; i++) drillWell(l, 500, DEFAULT_CONFIG, rng);
    expect(l.wells.length).toBeLessThanOrEqual(l.maxWells);
    expect(drillWell(l, 500, DEFAULT_CONFIG, rng)).toBeNull();
  });

  it('empties a well as it lifts its share, and gives up on it when it is spent', () => {
    const l = lease(3_650, 10);
    const well = l.wells[0];
    expect(well).toBeDefined();
    // Lift everything its share holds, a day at a time, and watch the rate follow it down.
    let guard = 0;
    while (well!.status === 'PUMPING' && guard < 100_000) { liftFrom(l, leaseCapacityOf(l)); depleteWells(l, DEFAULT_CONFIG); guard += 1; }
    expect(well!.status).toBe('SPENT');
    expect(well!.rate).toBe(0);
    expect(well!.cumulative).toBeGreaterThan(0.9 * well!.recoverable);
    expect(l.reserves + l.produced).toBeCloseTo(l.originalReserves, 4);
  });
});

describe('the world every producer already lives in', () => {
  it('gives all of them leases whose wells pump exactly what their fields did', () => {
    const w = createWorld({ seed: 'leases', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    const fields = w.agents.map((a) => wellOf(a)).filter((f) => f !== undefined);
    expect(fields.length).toBeGreaterThan(15);
    for (const f of fields) {
      expect(f.leases).toHaveLength(1);
      expect(capacityOf(f.leases)).toBeCloseTo(f.extractionCapacity, 6);
      expect(f.leases[0]?.wells.length).toBeGreaterThanOrEqual(6);
      expect(f.leases[0]?.wells.length).toBeLessThanOrEqual(12);
    }
  });

  it('keeps every barrel accounted for across a year of pumping', () => {
    const w = createWorld({ seed: 'leases', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    expect(reservesOf(w.agents.flatMap((a) => wellOf(a)?.leases ?? []))).toBeGreaterThan(0);
    for (let d = 0; d < 365; d++) step(w);
    const now = w.agents.flatMap((a) => wellOf(a)?.leases ?? []);
    for (const l of now) expect(l.reserves + l.produced).toBeCloseTo(l.originalReserves, 6);
    // A year of the world's pumping came out of the ground, not out of nowhere. Measured against
    // what the leases say they lifted, since ground bought at auction brings its own reserves in.
    expect(now.reduce((t, l) => t + l.produced, 0)).toBeCloseTo(w.totals.extracted, 4);
  });
});

describe('what a player may know about their own ground (spec §12A.2)', () => {
  const producer: GameSettings = { seed: 'lease-view', playType: 'PRODUCER', region: 'US_Permian', companyName: 'Lone Star Crude' };

  it('shows the survey band and the wells, and never the barrels left', async () => {
    const s = await GameSession.newGame(producer);
    await s.advance(30);
    const view = await s.getView();
    const [l] = view.company.well?.leases ?? [];
    expect(l).toBeDefined();
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(l?.band);
    expect(l?.wells.length).toBeGreaterThan(0);

    // The engine's own figure, which no part of the view may carry.
    const truth = (await s.save()).world.agents.flatMap((a) => wellOf(a)?.leases ?? []).map((x) => x.reserves);
    const sent = JSON.stringify(view);
    expect(sent).not.toContain('reserves');
    expect(sent).not.toContain('originalReserves');
    for (const r of truth) expect(sent).not.toContain(String(Math.round(r)));
  });

  it('lets a save written before leases existed carry on', async () => {
    const s = await GameSession.newGame(producer);
    await s.advance(10);
    const saved = structuredClone(await s.save());
    for (const a of saved.world.agents) {
      const field = wellOf(a) as { leases?: unknown } | undefined;
      if (field) delete field.leases;
    }
    const reloaded = await GameSession.load(saved);
    await reloaded.advance(10);
    const view = await reloaded.getView();
    expect(view.company.well?.leases.length).toBe(1);
    expect(view.days.every((d) => Number.isFinite(d.pumped))).toBe(true);
    expect(view.company.cash).toBeGreaterThan(0);
    expect(PLAYER_ID).toBeDefined();
  });
});
