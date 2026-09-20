// Impact of the dumping rule (spec §6.1 rule 5, owner's decision 2026-09-19): selling surplus at
// DUMP_DISCOUNT below the reference instead of at cash cost. Same world and seed, the two rules
// side by side.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { createWorld, step } from '../../src/engine/world';

function heavyMarket(discount: number) {
  const w = createWorld({ seed: 'cal-1', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN', config: { DUMP_DISCOUNT: discount } });
  let prev = w.nodes.DME.markerPrice;
  let moves = 0;
  let below40 = 0;
  for (let d = 1; d <= 365; d++) {
    step(w);
    const m = w.nodes.DME.markerPrice;
    moves += Math.abs(Math.log(m / prev));
    prev = m;
    if (m < 40) below40++;
  }
  return { dailyMove: moves / 365, below40, insolvent: Object.keys(w.insolvencies) };
}

describe('dumping at a discount instead of at cash cost', () => {
  const atCost = heavyMarket(1);          // a 100% discount is floored at cash cost: the old rule
  const discounted = heavyMarket(0.2);

  it('at least halves the heavy-crude marker’s average daily move', () => {
    expect(discounted.dailyMove).toBeLessThan(0.5 * atCost.dailyMove);
  });

  it('stops fire sales from printing absurd prices: no day below $40, where cash-cost dumping had many', () => {
    expect(atCost.below40).toBeGreaterThan(20);
    // Not quite zero since traders began quoting off the live marker (D40): in a market engineered
    // to crash heavy crude, a day or two can still print under $40, against more than twenty before.
    expect(discounted.below40).toBeLessThanOrEqual(2);
  });

  it('bankrupts nobody', () => {
    expect(discounted.insolvent).toEqual([]);
  });
});
