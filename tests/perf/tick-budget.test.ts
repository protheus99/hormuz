// Performance is a test (spec §14.6): a regression fails CI instead of surfacing as a slow game.

import { describe, expect, it } from 'vitest';
import { CORE_PORTFOLIO, GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { createWorld, run } from '../../src/engine/world';

const time = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };

describe('tick budget', () => {
  it('runs a 365-tick S0 in under one second (spec §14.6)', () => {
    const w = createWorld({ seed: 'perf', portfolio: CORE_PORTFOLIO });
    expect(time(() => run(w, 365))).toBeLessThan(1000);
  });

  // The bound is generous because the suite runs this beside forty other workers; on its own the
  // year takes about a second, which is the target that matters for the game's clock.
  it('runs a year of the 31-company global world well inside a playable budget', () => {
    const w = createWorld({ seed: 'perf', portfolio: GLOBAL_PORTFOLIO });
    expect(time(() => run(w, 365))).toBeLessThan(4000);
  });
});
