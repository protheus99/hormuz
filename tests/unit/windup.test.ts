// Winding up a company that has run out of road (spec §12A.8, D57). The cast never thins: the shell
// is started again under new backers, its debts written off and its ground sent to the hammer — with
// its wells and the oil in its tanks, because a bust hands working assets to whoever kept their
// powder dry.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { baseWorth, receivershipLots } from '../../src/engine/auction';
import { refreshCapacity } from '../../src/engine/agents';
import { wellOf } from '../../src/engine/companies';
import { newLease } from '../../src/engine/leases';
import { LeaseBand } from '../../src/engine/model';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import type { Agent } from '../../src/engine/model';
import { barrelsHeld, checkInvariants, createWorld, netWorth, step, windUp, type World } from '../../src/engine/world';

const cfg = DEFAULT_CONFIG;
const world = (): World => createWorld({ seed: 'windup', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });

/**
 * A producer holding more than one block. Everybody starts with exactly one — a second only ever
 * arrives by winning it at auction — so a company with ground to lose has to be built here.
 */
function producer(w: World, extra = 2): Agent {
  const a = w.agents.find((x) => wellOf(x) !== undefined) as Agent;
  const field = wellOf(a)!;
  for (let i = 0; i < extra; i++) {
    field.leases.push(newLease({
      id: `${a.agentId}-extra-${i}`, name: `Bought Block ${i + 1}`, region: a.region, grade: field.grade,
      capacity: 1_200, band: LeaseBand.LOW, baseExtractionCost: field.baseExtractionCost,
      acquiredFor: 20_000_000, wells: 4, maxWells: 8,
    }));
  }
  refreshCapacity(field);
  return a;
}

describe('what winding up does', () => {
  it('sends every block but the one the business is built around to the hammer, oil and all', () => {
    const w = world();
    const a = producer(w);
    const field = wellOf(a)!;
    const had = field.leases.length;
    const oil = barrelsHeld(w.agents, w.cargo, w.forSale);
    const out = windUp(w, a, w.tick);

    expect(out.blocks).toBe(had - 1);
    expect(field.leases).toHaveLength(1);
    expect(w.forSale).toHaveLength(had - 1);
    // It keeps the block with the most oil still under it, because that is the business.
    for (const gone of w.forSale) expect(gone.reserves).toBeLessThanOrEqual(field.leases[0]!.reserves);
    // Not one barrel is created or destroyed on the way: the pool still holds what the field did.
    expect(barrelsHeld(w.agents, w.cargo, w.forSale)).toBeCloseTo(oil, 6);
  });

  it('sends the tanks with the ground, and takes them off the field that lost it', () => {
    const w = world();
    const a = producer(w);
    const field = wellOf(a)!;
    const room = field.storageCapacity;
    windUp(w, a, w.tick);

    // Tanks are built where the oil comes out, so they stand on the block and go with it. Without
    // this a buyer took on the barrels and none of the room to put them in, and a field ended the
    // day holding 145,357 barrels in 145,000 of tank (found 2026-09-25).
    const gone = w.forSale.reduce((s, l) => s + (l.tankage ?? 0), 0);
    expect(gone).toBeGreaterThan(0);
    expect(field.storageCapacity).toBeCloseTo(room - gone, 6);
    // And what the seller keeps is still enough for what it is still holding.
    expect(field.storage + field.storageEscrow).toBeLessThanOrEqual(field.storageCapacity + 1e-6);
  });

  it('writes off the debt, puts fresh money in, and counts it', () => {
    const w = world();
    const a = producer(w);
    a.creditDrawn = 20_000_000;
    a.cash = -4_000_000;
    const before = w.totals.recapitalised;
    windUp(w, a, w.tick);

    expect(a.creditDrawn).toBe(0);
    expect(a.cash).toBeGreaterThan(0);
    expect(a.insolvent).toBe(false);
    // New money from the new backers, counted, or the cash invariant would catch it.
    expect(w.totals.recapitalised - before).toBeCloseTo(a.cash - -4_000_000, 6);
    expect(netWorth(w, a)).toBeGreaterThan(0);
  });

  it('leaves nothing on the record: the new backers did not cut anyone’s corners', () => {
    const w = world();
    const a = producer(w);
    a.record.push({ amount: 5_000_000, saved: 1_250_000, tick: w.tick, target: { kind: 'CASH' } });
    a.counsel = true;
    windUp(w, a, w.tick);
    expect(a.record).toHaveLength(0);
    expect(a.counsel).toBe(false);
  });

  it('keeps the world whole, so the invariants still close the day it happens', () => {
    const w = world();
    windUp(w, producer(w), w.tick);
    expect(() => checkInvariants(w)).not.toThrow();
    expect(() => step(w)).not.toThrow();
  });
});

describe('what happens to the ground afterwards', () => {
  it('comes up as it stands — its real band, its wells, no survey to buy', () => {
    const w = world();
    const a = producer(w);
    windUp(w, a, w.tick);
    const lots = receivershipLots(1, w.forSale, cfg);

    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots) {
      expect(lot.receivership).toBeDefined();
      // Ground that has been worked has nothing left to guess at, so the published band is the truth.
      expect(lot.band).toBe(lot.trueBand);
      expect(lot.reserve).toBeGreaterThan(0);
    }
  });

  it('is priced as bare acreage, so the wells on it come with the ground', () => {
    const w = world();
    windUp(w, producer(w), w.tick);
    const [lot] = receivershipLots(1, w.forSale, cfg);
    // The reserve is a share of what the same *undrilled* acreage is worth — and the lot arrives
    // with wells already sunk and oil in its tanks, which nobody bidding pays a penny for. That is
    // where the bargain in a bust actually lives, not in a discount written into the reserve.
    expect(lot!.reserve).toBeCloseTo(cfg.AUCTION.DISTRESS_SHARE * baseWorth(lot!, cfg), 6);
    expect(lot!.receivership!.wells.length).toBeGreaterThan(0);
    expect(cfg.AUCTION.DISTRESS_SHARE).toBeLessThan(1);
    // The reserve used to be floored at what the bidders happened to be holding, which put $51.9M
    // on a block worth $12.9M, and of course nothing ever bid (found 2026-09-24).
    expect(lot!.reserve).toBeLessThan(baseWorth(lot!, cfg));
  });

  it('offers only a few at a time, however many a company went under holding', () => {
    const w = world();
    // Two companies' worth, so the pool is deeper than a round can take.
    windUp(w, producer(w, 5), w.tick);
    expect(w.forSale.length).toBeGreaterThan(cfg.AUCTION.WOUND_LOTS);
    expect(receivershipLots(1, w.forSale, cfg)).toHaveLength(cfg.AUCTION.WOUND_LOTS);
  });
});
