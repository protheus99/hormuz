// What a company has coming to it (spec §12A.6). The shape the owner asked for: cutting corners
// works, sometimes for years, while a hidden record builds that never washes off, costs a little
// every day, follows trouble, and takes the thing the corner was protecting rather than money.

import { describe, expect, it } from 'vitest';
import { createProducer } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import { addExposure, exposureDay, exposureDrag, exposureTotal, reckoningChance, troubleFactor, type ExposureItem } from '../../src/engine/exposure';
import { asLeaseId, type Producer } from '../../src/engine/model';
import { rngFor } from '../../src/engine/rng';

const company = (): Producer => createProducer({
  id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 100_000_000,
  extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000,
});

const corner = (amount: number, over: Partial<ExposureItem> = {}): ExposureItem => ({
  amount, saved: amount / 4, tick: 1 as never, target: { kind: 'CASH' }, ...over,
});

/** A world where it always catches up, to see what one costs. */
const certain = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 1, MAX_CHANCE: 1 } });

describe('a clean record', () => {
  it(`costs nothing, risks nothing, and does not touch the world's luck`, () => {
    const c = company();
    const rng = rngFor('clean', 'events');
    const before = { ...rng };
    expect(exposureTotal(c)).toBe(0);
    expect(exposureDrag(c, DEFAULT_CONFIG)).toBe(0);
    expect(reckoningChance(c, DEFAULT_CONFIG)).toBe(0);
    for (let d = 0; d < 500; d++) expect(exposureDay(c, createLedger(), d as never, DEFAULT_CONFIG, rng)).toBeNull();
    expect(c.cash).toBe(100_000_000);
    // Not one draw taken, so a company with nothing to answer for cannot shift anyone else's day.
    expect({ ...rng }).toEqual(before);
  });
});

describe('a record that is not clean', () => {
  it('costs a little every day it stands, without the record itself moving', () => {
    const c = company();
    addExposure(c, corner(1_000_000));
    const cash = c.cash;
    const ledger = createLedger();
    const quiet = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 0 } });
    for (let d = 0; d < 365; d++) exposureDay(c, ledger, d as never, quiet, rngFor('quiet', 'events'));
    expect(cash - c.cash).toBeCloseTo(365 * 1_000_000 * DEFAULT_CONFIG.EXPOSURE.DRAG, 4);
    expect(exposureTotal(c)).toBe(1_000_000);       // a drag is rent, not a payment
  });

  it('comes due sooner on a company already in trouble', () => {
    const easy = company();
    const hard = company();
    addExposure(easy, corner(1_000_000));
    addExposure(hard, corner(1_000_000));
    // A credit line is set when a world is built, not when a company is made, so say what it is.
    easy.creditLimit = 10_000_000;
    hard.creditLimit = 10_000_000;
    hard.cash = 0;
    hard.creditDrawn = hard.creditLimit;            // nothing left to draw on
    expect(troubleFactor(hard, DEFAULT_CONFIG, null)).toBeGreaterThan(troubleFactor(easy, DEFAULT_CONFIG, null));
    expect(reckoningChance(hard, DEFAULT_CONFIG, null)).toBeGreaterThan(reckoningChance(easy, DEFAULT_CONFIG, null));
    // And as a scenario runs out, whoever is carrying a record is likelier to hear about it.
    expect(reckoningChance(easy, DEFAULT_CONFIG, 10)).toBeGreaterThan(reckoningChance(easy, DEFAULT_CONFIG, null));
  });

  it('answers for the oldest thing first', () => {
    const c = company();
    addExposure(c, corner(500_000, { tick: 900 as never }));
    addExposure(c, corner(500_000, { tick: 100 as never }));
    const r = exposureDay(c, createLedger(), 1000 as never, certain, rngFor('old', 'events'));
    expect(r?.item.tick).toBe(100);
    expect(c.record).toHaveLength(1);
    expect(c.record[0]?.tick).toBe(900);            // what you did lately is still to come
  });
});

describe('what a reckoning takes', () => {
  it('shuts the lease a small corner was protecting, rather than fining for it', () => {
    const c = company();
    const lease = c.leases[0]!;
    addExposure(c, corner(500_000, { target: { kind: 'LEASE', leaseId: lease.leaseId } }));
    const r = exposureDay(c, createLedger(), 1 as never, certain, rngFor('shut', 'events'));
    expect(r?.severity).toBe('SHUT');
    expect(r?.what).toBe(lease.name);
    expect(lease.shutUntil).toBe(DEFAULT_CONFIG.EXPOSURE.SHUT_TICKS);
    expect(c.leases).toHaveLength(1);               // shut, not taken
  });

  it('takes the block outright when the corner was a big one, oil and all', () => {
    const c = company();
    const lease = c.leases[0]!;
    const held = lease.reserves;
    addExposure(c, corner(5_000_000, { target: { kind: 'LEASE', leaseId: lease.leaseId } }));
    const r = exposureDay(c, createLedger(), 1 as never, certain, rngFor('forfeit', 'events'));
    expect(r?.severity).toBe('FORFEIT');
    expect(c.leases).toHaveLength(0);
    expect(held).toBeGreaterThan(0);                // and the oil under it goes with the ground
  });

  it('revokes the licence a corner bought, and withdraws a credit line lied to', () => {
    const c = company();
    c.licences.push('West_Africa');
    addExposure(c, corner(400_000, { target: { kind: 'LICENCE', region: 'West_Africa' } }));
    expect(exposureDay(c, createLedger(), 1 as never, certain, rngFor('licence', 'events'))?.severity).toBe('REVOKE');
    expect(c.licences).not.toContain('West_Africa');

    const d = company();
    addExposure(d, corner(400_000, { target: { kind: 'CREDIT' } }));
    expect(exposureDay(d, createLedger(), 1 as never, certain, rngFor('credit', 'events'))?.severity).toBe('WITHDRAW');
    expect(d.creditLimit).toBe(0);
  });

  it('cannot take back credit already advanced when it pulls the line', () => {
    const c = company();
    c.creditLimit = 40_000_000;
    c.creditDrawn = 25_000_000;
    addExposure(c, corner(400_000, { target: { kind: 'CREDIT' } }));
    expect(exposureDay(c, createLedger(), 1 as never, certain, rngFor('credit', 'events'))?.severity).toBe('WITHDRAW');
    // A bank stops you drawing; it does not un-lend. Anything else leaves the company owing more
    // than it was ever allowed, which is invariant 8 (found 2026-09-24 in a player's own game).
    expect(c.creditLimit).toBe(25_000_000);
    expect(c.creditDrawn).toBeLessThanOrEqual(c.creditLimit);
  });

  it('takes every penny a company can raise and not one more', () => {
    const c = company();
    c.cash = 12_600_000;
    c.creditLimit = 0;
    // A corner worth $15M on a block came back as a $121.8M bill and left the company at minus
    // $109M for good, with nothing in the game able to bring it back (found 2026-09-24).
    addExposure(c, corner(60_900_000, { target: { kind: 'CASH' } }));
    const r = exposureDay(c, createLedger(), 1 as never, certain, rngFor('ruin', 'events'));
    expect(r?.cost).toBeLessThanOrEqual(12_600_000);
    expect(c.cash).toBeGreaterThanOrEqual(0);
    // Cleaned out, which is the point — but not in debt to a number nobody could have paid.
    expect(c.cash).toBeLessThan(1);
  });

  it('charges on top of whatever it took, and leaves the rest of the record standing', () => {
    const c = company();
    addExposure(c, corner(1_000_000, { tick: 1 as never }));
    addExposure(c, corner(600_000, { tick: 2 as never }));
    const cash = c.cash;
    const r = exposureDay(c, createLedger(), 3 as never, certain, rngFor('cost', 'events'));
    expect(r?.cost).toBeCloseTo(1_000_000 * DEFAULT_CONFIG.EXPOSURE.PENALTY, 4);
    expect(cash - c.cash).toBeGreaterThan(r!.cost);   // the penalty, plus that day's drag
    expect(exposureTotal(c)).toBe(600_000);           // and the newer corner is still coming
  });

  it('does not lose ground a company no longer holds', () => {
    const c = company();
    addExposure(c, corner(5_000_000, { target: { kind: 'LEASE', leaseId: asLeaseId('sold-long-ago') } }));
    expect(exposureDay(c, createLedger(), 1 as never, certain, rngFor('gone', 'events'))?.severity).toBe('FINE');
  });
});
