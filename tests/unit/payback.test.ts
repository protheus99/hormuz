// What a capital decision costs and what it makes back (spec §12A.8). The four meters project
// thirty days, which is blank on everything a company buys — the lease auction showed $0 of profit
// for Yes, Maybe and No alike. These hold the replacement to being arithmetic anyone can check.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import type { Agent } from '../../src/engine/model';
import { createWorld, run, type World } from '../../src/engine/world';
import { expectedWells, paybackOf } from '../../src/game/cards/payback';

const world = (): World => {
  const w = createWorld({ seed: 'payback', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
  run(w, 3);                                   // a day or two of trading, so there are prices to read
  return w;
};
const producer = (w: World): Agent => w.agents.find((a) => a.kind === 'PRODUCER') as Agent;

describe('what it says', () => {
  it('says nothing at all about a card that buys nothing', () => {
    const w = world();
    expect(paybackOf(w, producer(w), [])).toBeNull();
    expect(paybackOf(w, producer(w), [{ kind: 'SET_OUTPUT', rate: 0.5 }])).toBeNull();
  });

  it('prices a drilling programme by what it costs and what those wells make', () => {
    const w = world();
    const me = producer(w);
    const p = paybackOf(w, me, [{ kind: 'START_PROJECT', project: 'DRILL', steps: 4 }]);
    expect(p).not.toBeNull();
    expect(p!.cost).toBeGreaterThan(0);
    // Not four wells: the best prospects go first, so a programme of four finds fewer than four.
    expect(p!.barrels).toBeLessThan(4 * DEFAULT_CONFIG.DRILL_STEP);
    expect(p!.barrels).toBeGreaterThan(0);
    expect(p!.months).toBeGreaterThan(0);
    expect(p!.words).toMatch(/pays for itself/);
  });

  it('counts the drilling in what ground costs, not just the bid', () => {
    const w = world();
    const me = producer(w);
    const bid = 5_000_000;
    // A lot has to exist for a bid to be priced; run until the first auction is published.
    while (w.auction === null) run(w, 1);
    const lot = w.auction.lots[0]!;
    const p = paybackOf(w, me, [{ kind: 'BID_LEASE', lotId: lot.lotId, amount: bid }]);
    expect(p).not.toBeNull();
    // Ground bought empty is ground still to drill, and the drilling is the larger half of it.
    expect(p!.cost).toBeGreaterThan(bid);
    expect(p!.barrels).toBeGreaterThan(0);
  });

  it('says plainly when a thing earns no barrels of its own, rather than quoting a number', () => {
    const w = world();
    const me = producer(w);
    const tanks = paybackOf(w, me, [{ kind: 'START_PROJECT', project: 'STORAGE', steps: 2 }]);
    expect(tanks?.months).toBeNull();
    expect(tanks?.barrels).toBe(0);
    expect(tanks?.words).toMatch(/choose when to sell/);
    expect(tanks?.cost).toBeGreaterThan(0);
  });
});

describe('the dry-hole count', () => {
  it('falls away as a lease is drilled, so the tenth well is not worth the first', () => {
    const first = expectedWells(1, 0, DEFAULT_CONFIG);
    const tenth = expectedWells(1, 9, DEFAULT_CONFIG);
    expect(first).toBeCloseTo(DEFAULT_CONFIG.DRY_HOLE.FIRST, 6);
    expect(tenth).toBeLessThan(first);
    expect(tenth).toBeGreaterThanOrEqual(DEFAULT_CONFIG.DRY_HOLE.FLOOR);
    // And it never falls below the floor, however many holes have been sunk.
    expect(expectedWells(1, 500, DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.DRY_HOLE.FLOOR);
  });
});

describe('what it is for', () => {
  it('is the only number that separates the lease auction’s options', () => {
    // The measurement that started this: over thirty days a sealed bid costs nothing and awards
    // nothing, so profit is $0 whichever way you answer. The payback is what tells them apart.
    const w = world();
    const me = producer(w);
    while (w.auction === null) run(w, 1);
    const lot = w.auction.lots[0]!;
    const strong = paybackOf(w, me, [{ kind: 'BID_LEASE', lotId: lot.lotId, amount: 9_000_000 }]);
    const steady = paybackOf(w, me, [{ kind: 'BID_LEASE', lotId: lot.lotId, amount: 5_000_000 }]);
    expect(strong!.cost).toBeGreaterThan(steady!.cost);
    if (strong!.months !== null && steady!.months !== null) expect(steady!.months).toBeLessThan(strong!.months);
  });
});
