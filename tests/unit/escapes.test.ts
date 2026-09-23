// The escapes (spec §12A.6). The owner's addition: a player should be able to get out from under it
// before it lands — at a price. These check the three rules that keep an escape from being a free
// pass: it costs a multiple of what the corner saved, it gets dearer the longer it is left, and
// something always remains.

import { describe, expect, it } from 'vitest';
import { createProducer } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import {
  addExposure, escapeCost, escapeOffered, exposureDay, exposureTotal, nextEntry, rungOf, takeEscape, type ExposureItem,
} from '../../src/engine/exposure';
import type { Producer, Tick } from '../../src/engine/model';
import { rngFor } from '../../src/engine/rng';

const company = (): Producer => createProducer({
  id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 100_000_000,
  extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000,
});

const corner = (amount: number, over: Partial<ExposureItem> = {}): ExposureItem => ({
  amount, saved: amount / 4, tick: 1 as Tick, target: { kind: 'CASH' }, ...over,
});

const cfg = DEFAULT_CONFIG;
/** Well past the grace period, so the world has had time to start asking. */
const LATER = 200 as Tick;
/** The day after the corner was cut: nobody has asked anything yet. */
const AT_ONCE = 2 as Tick;

describe('what is on offer', () => {
  it('offers nothing at all to a company with a clean record', () => {
    const c = company();
    for (const kind of ['PUT_RIGHT', 'DISCLOSE', 'COUNSEL'] as const) {
      expect(escapeOffered(c, kind, cfg, LATER)).toBe(false);
      expect(escapeCost(c, kind, cfg, LATER)).toBe(0);
      expect(takeEscape(c, kind, cfg, LATER)).toBeNull();
    }
  });

  it('closes the window once a file is opened, and opens counsel instead', () => {
    const c = company();
    addExposure(c, corner(20_000_000));
    expect(rungOf(c, cfg, LATER)).toBe(4);
    expect(escapeOffered(c, 'PUT_RIGHT', cfg, LATER)).toBe(false);
    expect(escapeOffered(c, 'DISCLOSE', cfg, LATER)).toBe(false);
    expect(escapeOffered(c, 'COUNSEL', cfg, LATER)).toBe(true);
    // And counsel is not on offer while there is still a quieter way out.
    const early = company();
    addExposure(early, corner(400_000));
    expect(escapeOffered(early, 'COUNSEL', cfg, LATER)).toBe(false);
    expect(escapeOffered(early, 'PUT_RIGHT', cfg, LATER)).toBe(true);
  });

  it('deals with the oldest thing first, which is what would answer for itself next', () => {
    const c = company();
    addExposure(c, corner(500_000, { tick: 900 as Tick }));
    addExposure(c, corner(600_000, { tick: 100 as Tick }));
    expect(nextEntry(c)?.tick).toBe(100);
    takeEscape(c, 'PUT_RIGHT', cfg, 1000 as Tick);
    expect(c.record.some((x) => x.tick === 900)).toBe(true);
  });
});

describe('what it costs', () => {
  it('is a multiple of what the corner saved, and dearer the longer it is left', () => {
    const early = company();
    const asked = company();
    addExposure(early, corner(4_000_000));
    addExposure(asked, corner(4_000_000));
    const saved = 1_000_000;
    expect(escapeCost(early, 'PUT_RIGHT', cfg, AT_ONCE)).toBeCloseTo(saved * cfg.ESCAPE.EARLY, 4);
    expect(escapeCost(asked, 'PUT_RIGHT', cfg, LATER)).toBeCloseTo(saved * cfg.ESCAPE.OPEN, 4);
    expect(escapeCost(asked, 'COUNSEL', cfg, LATER)).toBeCloseTo(saved * cfg.ESCAPE.LATE, 4);
    expect(cfg.ESCAPE.EARLY).toBeLessThan(cfg.ESCAPE.OPEN);
    expect(cfg.ESCAPE.OPEN).toBeLessThan(cfg.ESCAPE.LATE);
  });

  it('never pays to cut the corner meaning to clean it up: every way out costs more than the job', () => {
    // Rule 1. Doing the work costs what it costs: one times the saving, and nothing on the record.
    // The cheapest escape there is, taken the very next day, already costs more than that.
    expect(cfg.ESCAPE.EARLY).toBeGreaterThan(1);
    const c = company();
    addExposure(c, corner(4_000_000));
    for (const kind of ['PUT_RIGHT', 'DISCLOSE'] as const) {
      expect(escapeCost(c, kind, cfg, AT_ONCE)).toBeGreaterThan(1_000_000);
    }
    // And telling them costs more than quietly putting it right, at any hour of the day.
    expect(escapeCost(c, 'DISCLOSE', cfg, LATER)).toBeGreaterThan(escapeCost(c, 'PUT_RIGHT', cfg, LATER));
  });
});

describe('what it leaves behind', () => {
  it('never returns a company to clean: a fifth of it stays on the record', () => {
    const c = company();
    addExposure(c, corner(4_000_000));
    const escape = takeEscape(c, 'PUT_RIGHT', cfg, LATER);
    expect(escape).not.toBeNull();
    expect(exposureTotal(c)).toBeCloseTo(4_000_000 * cfg.ESCAPE.RESIDUE, 4);
    expect(c.record).toHaveLength(1);
  });

  it('leaves less behind when you told them yourself', () => {
    const quiet = company();
    const told = company();
    addExposure(quiet, corner(4_000_000));
    addExposure(told, corner(4_000_000));
    takeEscape(quiet, 'PUT_RIGHT', cfg, LATER);
    takeEscape(told, 'DISCLOSE', cfg, LATER);
    expect(exposureTotal(told)).toBeLessThan(exposureTotal(quiet));
  });

  it('stops the ground while the work is done, and does not when you only disclose', () => {
    const fixing = company();
    const telling = company();
    const a = fixing.leases[0]!;
    const b = telling.leases[0]!;
    addExposure(fixing, corner(400_000, { target: { kind: 'LEASE', leaseId: a.leaseId } }));
    addExposure(telling, corner(400_000, { target: { kind: 'LEASE', leaseId: b.leaseId } }));
    expect(takeEscape(fixing, 'PUT_RIGHT', cfg, LATER)?.shutTicks).toBe(cfg.ESCAPE.PUT_RIGHT_SHUT);
    expect(a.shutUntil).toBe(LATER + cfg.ESCAPE.PUT_RIGHT_SHUT);
    expect(takeEscape(telling, 'DISCLOSE', cfg, LATER)?.shutTicks).toBe(0);
    expect(b.shutUntil).toBe(0);
  });
});

describe('counsel, once a file is open', () => {
  /** A world where it always catches up, to see what one costs. */
  const certain = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 1, MAX_CHANCE: 1 } });

  it('argues a forfeiture down to a shutdown, and is spent doing it', () => {
    const c = company();
    const lease = c.leases[0]!;
    addExposure(c, corner(8_000_000, { target: { kind: 'LEASE', leaseId: lease.leaseId } }));
    expect(takeEscape(c, 'COUNSEL', cfg, LATER)).not.toBeNull();
    expect(c.counsel).toBe(true);
    const r = exposureDay(c, createLedger(), LATER, certain, rngFor('counsel', 'events'));
    expect(r?.severity).toBe('SHUT');
    expect(c.leases).toHaveLength(1);                      // the ground is still yours
    expect(lease.shutUntil).toBe(2 * cfg.EXPOSURE.SHUT_TICKS);   // for twice as long as a small one
    expect(c.counsel).toBe(false);                         // and they are not there for the next one
  });

  it('saves the licence, and half the credit line', () => {
    const c = company();
    c.licences.push('West_Africa');
    c.counsel = true;
    addExposure(c, corner(400_000, { target: { kind: 'LICENCE', region: 'West_Africa' } }));
    expect(exposureDay(c, createLedger(), 1 as Tick, certain, rngFor('licence', 'events'))?.severity).toBe('FINE');
    expect(c.licences).toContain('West_Africa');

    const d = company();
    d.counsel = true;
    d.creditLimit = 10_000_000;
    addExposure(d, corner(400_000, { target: { kind: 'CREDIT' } }));
    exposureDay(d, createLedger(), 1 as Tick, certain, rngFor('credit', 'events'));
    expect(d.creditLimit).toBe(5_000_000);
  });
});
