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

  it('runs a year of the 31-company global world in under two seconds (Phase 7 target: one)', () => {
    const w = createWorld({ seed: 'perf', portfolio: GLOBAL_PORTFOLIO });
    expect(time(() => run(w, 365))).toBeLessThan(2000);
  });
});
