// What a company has coming to it (spec §12A.6). The shape the owner asked for: cutting corners
// works, sometimes for years, while a hidden record builds that never washes off, costs a little
// every day, and buys a reckoning that scales with everything taken.

import { describe, expect, it } from 'vitest';
import { createProducer } from '../../src/engine/companies';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import { addExposure, exposureDay, exposureDrag, reckoningChance } from '../../src/engine/exposure';
import { rngFor } from '../../src/engine/rng';

const company = () => createProducer({
  id: 'p', name: 'Test Oil', region: 'US_Permian', grade: 'LIGHT_SWEET', cash: 100_000_000,
  extractionCapacity: 6_000, baseExtractionCost: 30, storageCapacity: 60_000,
});

describe('a clean record', () => {
  it(`costs nothing, risks nothing, and does not touch the world's luck`, () => {
    const c = company();
    const rng = rngFor('clean', 'events');
    const before = { ...rng };
    expect(exposureDrag(c, DEFAULT_CONFIG)).toBe(0);
    expect(reckoningChance(c, DEFAULT_CONFIG)).toBe(0);
    for (let d = 0; d < 500; d++) expect(exposureDay(c, createLedger(), d as never, DEFAULT_CONFIG, rng)).toBeNull();
    expect(c.cash).toBe(100_000_000);
    // Not one draw taken, so a company with nothing to answer for cannot shift anyone else's day.
    expect({ ...rng }).toEqual(before);
  });
});

describe('a record that is not clean', () => {
  it('costs a little every day it stands', () => {
    const c = company();
    addExposure(c, 1_000_000);
    const cash = c.cash;
    const ledger = createLedger();
    // No reckoning, so what is left is the drag alone.
    const quiet = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 0 } });
    for (let d = 0; d < 365; d++) exposureDay(c, ledger, d as never, quiet, rngFor('quiet', 'events'));
    const paid = cash - c.cash;
    expect(paid).toBeCloseTo(365 * 1_000_000 * DEFAULT_CONFIG.EXPOSURE.DRAG, 4);
    expect(ledger.total).toBeCloseTo(paid, 4);
    // And the record itself is untouched: a drag is rent, not a payment.
    expect(c.exposure).toBe(1_000_000);
  });

  it('risks more the more there is, and the reckoning costs more than it settles', () => {
    const small = company();
    const large = company();
    addExposure(small, 500_000);
    addExposure(large, 5_000_000);
    expect(reckoningChance(large, DEFAULT_CONFIG)).toBeGreaterThan(reckoningChance(small, DEFAULT_CONFIG));

    // A world where it always catches up, to see what one costs.
    const certain = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 1, MAX_CHANCE: 1 } });
    const c = company();
    addExposure(c, 4_000_000);
    const cash = c.cash;
    const result = exposureDay(c, createLedger(), 1 as never, certain, rngFor('due', 'events'));
    expect(result).not.toBeNull();
    expect(result!.settled).toBeGreaterThan(0);
    expect(result!.settled).toBeLessThan(4_000_000);            // one reckoning is not the whole record
    expect(result!.cost).toBeCloseTo(result!.settled * DEFAULT_CONFIG.EXPOSURE.PENALTY, 4);
    expect(cash - c.cash).toBeCloseTo(result!.cost + exposureDrag({ ...c, exposure: 4_000_000 } as never, certain), 4);
    expect(c.exposure).toBeCloseTo(4_000_000 - result!.settled, 4);
  });

  it('works through the record rather than wiping it, so the rest is still coming', () => {
    const c = company();
    addExposure(c, 2_000_000);
    const certain = withOverrides(DEFAULT_CONFIG, { EXPOSURE: { CHANCE_PER_DOLLAR: 1, MAX_CHANCE: 1 } });
    const rng = rngFor('again', 'events');
    const ledger = createLedger();
    let reckonings = 0;
    for (let d = 0; d < 40 && c.exposure > 1; d++) if (exposureDay(c, ledger, d as never, certain, rng)) reckonings += 1;
    expect(reckonings).toBeGreaterThan(1);                       // more than one bill for one career
    expect(c.exposure).toBeLessThan(2_000_000 * 0.05);           // and it is worked through in the end
    expect(ledger.total).toBeGreaterThan(2_000_000);             // having cost more than it ever was
  });
});
