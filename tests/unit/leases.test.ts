// Leases and wells (spec §12A): a producer's field is ground with a finite, hidden quantity of oil
// in it. Stage 1 must leave every number the rest of the engine reads exactly where it was, keep
// the oil conserved, and never let the reserves reach a player.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { wellOf } from '../../src/engine/companies';
import { advanceWells, capacityOf, depleteWells, drillWell, liftFrom, newLease, refreshStorage, reservesOf, roomAt, tankOf, BAND_YEARS } from '../../src/engine/leases';
import type { Lease } from '../../src/engine/model';

const leaseCapacityOf = (l: Lease) => capacityOf([l]);
import { createWorld, run, step } from '../../src/engine/world';
import { FIELD_NAMES } from '../../src/data/leasenames';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import { createProducer } from '../../src/engine/companies';
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

describe('what goes wrong down a hole (spec §12A.3)', () => {
  it('services a well on its interval, takes it offline, and charges for the work', () => {
    const l = lease(6_000, 6);
    const owner = createProducer({ id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 10_000_000, extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000 });
    const ledger = createLedger();
    const rng = rngFor('quiet', 'wells');
    const cfg = withOverrides(DEFAULT_CONFIG, { WELL: { BASE_HAZARD: 0 } });   // no failures, just upkeep
    const cashBefore = owner.cash;
    for (let d = 0; d < cfg.WELL.MAINT_INTERVAL; d++) advanceWells(l, owner, rng, ledger, 1 as never, cfg);
    expect(l.wells.every((w) => w.status === 'MAINTENANCE')).toBe(true);
    expect(owner.cash).toBeLessThan(cashBefore);
    expect(ledger.total).toBeCloseTo(cashBefore - owner.cash, 6);

    for (let d = 0; d < cfg.WELL.MAINT_TICKS; d++) advanceWells(l, owner, rng, ledger, 1 as never, cfg);
    expect(l.wells.every((w) => w.status === 'PUMPING')).toBe(true);
    expect(l.wells.every((w) => w.daysSinceMaintenance === 0)).toBe(true);
  });

  it('fails a neglected well eventually, and puts it back when the crew has been', () => {
    const l = lease(6_000, 6);
    const owner = createProducer({ id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 10_000_000, extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000 });
    const ledger = createLedger();
    const rng = rngFor('rough', 'wells');
    // A hazard nothing could survive, so the test is about what a failure does, not how likely it is.
    const cfg = withOverrides(DEFAULT_CONFIG, { WELL: { BASE_HAZARD: 0.5, MAINT_INTERVAL: 10_000 } });
    advanceWells(l, owner, rng, ledger, 1 as never, cfg);
    const down = l.wells.filter((w) => w.status === 'DOWN');
    expect(down.length).toBeGreaterThan(0);
    for (const w of down) {
      expect(w.ticksRemaining).toBeGreaterThanOrEqual(cfg.WELL.WORKOVER_TICKS.min);
      expect(w.ticksRemaining).toBeLessThanOrEqual(cfg.WELL.WORKOVER_TICKS.max);
    }
    // A well that is down makes nothing, so the field is smaller while the crew is on its way.
    expect(capacityOf([l])).toBeLessThan(6_000);
    for (let d = 0; d < cfg.WELL.WORKOVER_TICKS.max + 1; d++) advanceWells(l, owner, rngFor('calm', 'wells'), ledger, 1 as never, withOverrides(cfg, { WELL: { BASE_HAZARD: 0 } }));
    expect(l.wells.every((w) => w.status === 'PUMPING')).toBe(true);
  });

  it('leaves a spent well alone: there is nothing left to service or break', () => {
    const l = lease(6_000, 6);
    const owner = createProducer({ id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 10_000_000, extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000 });
    for (const w of l.wells) w.status = 'SPENT';
    const cash = owner.cash;
    for (let d = 0; d < 500; d++) advanceWells(l, owner, rngFor('spent', 'wells'), createLedger(), 1 as never, DEFAULT_CONFIG);
    expect(l.wells.every((w) => w.status === 'SPENT')).toBe(true);
    expect(owner.cash).toBe(cash);
  });
});

describe('naming ground (spec §12A.2)', () => {
  it('gives every block in the world its own name, held or bought', () => {
    const w = createWorld({ seed: 'names', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    // Past two auctions, so bought ground is in the count as well as the ground they started with.
    for (let d = 0; d < 400; d++) step(w);
    const blocks = w.agents.flatMap((a) => (wellOf(a)?.leases ?? []).map((l) => ({ name: l.name, region: l.region })));
    expect(blocks.length).toBeGreaterThan(20);
    expect(new Set(blocks.map((b) => b.name)).size).toBe(blocks.length);
    // And none of them is a number, which is what started this.
    for (const b of blocks) expect(b.name).not.toMatch(/Block \d/);
    // Ground is named for where it is: a North Sea block does not sound like one off Campeche.
    for (const b of blocks) expect(FIELD_NAMES[b.region] ?? []).toContain(b.name);
  });

  it('never hands two regions the same name, however many blocks a game sells', () => {
    const seen = new Set<string>();
    for (const [region, pool] of Object.entries(FIELD_NAMES)) {
      expect(pool).toHaveLength(20);
      for (const name of pool ?? []) {
        expect(seen.has(name)).toBe(false);          // one name, one place
        seen.add(name);
        expect(name.trim()).toBe(name);
      }
      expect(region.length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(20 * Object.keys(FIELD_NAMES).length);
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

describe('oil stands where it came out of the ground (stage 3b)', () => {
  it('fills the tank at the lease that lifted it, and the field is their sum', () => {
    const w = createWorld({ seed: 'tanks', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    run(w, 5);
    for (const a of w.agents) {
      const field = wellOf(a);
      if (field === undefined) continue;
      const held = field.leases.reduce((sum, l) => sum + l.storage + l.storageEscrow, 0);
      expect(held).toBeCloseTo(field.storage + field.storageEscrow, 6);
      for (const l of field.leases) expect(l.storage).toBeGreaterThanOrEqual(0);
    }
  });

  it('shares the tank farm by what the wells were drilled to make, not by slots', () => {
    // Ground bought empty at auction has slots and no wells, and must not take the tanks off the
    // lease that is actually pumping into them.
    const w = createWorld({ seed: 'tanks2', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    const me = w.agents.find((a) => wellOf(a) !== undefined)!;
    const field = wellOf(me)!;
    const working = field.leases[0]!;
    const before = tankOf(field, working);
    field.leases.push(newLease({
      id: 'empty', name: 'Empty Ground', region: me.region, grade: field.grade, capacity: 5_000,
      band: 'HIGH', baseExtractionCost: 30, acquiredFor: 1, wells: 0, maxWells: 12,
    }));
    expect(tankOf(field, working)).toBe(before);
    expect(tankOf(field, field.leases[1]!)).toBe(0);
  });

  it('halts one lease without halting the other', () => {
    const w = createWorld({ seed: 'tanks3', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
    const me = w.agents.find((a) => wellOf(a) !== undefined)!;
    const field = wellOf(me)!;
    const lease = field.leases[0]!;
    lease.storage = tankOf(field, lease);
    refreshStorage(field);
    expect(roomAt(field, lease)).toBe(0);
  });
});
