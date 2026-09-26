// Starting portfolios (spec §10). The world builds and validates every company from this data.

import { describe, expect, it } from 'vitest';
import { CORE_PORTFOLIO, GLOBAL_PORTFOLIO, type PortfolioEntry } from '../../src/data/portfolios';
import { createWorld } from '../../src/engine/world';

const production = (list: readonly PortfolioEntry[]) =>
  list.reduce((s, p) => s + ('well' in p ? p.well.extractionCapacity : 0), 0);
const refining = (list: readonly PortfolioEntry[]) =>
  list.reduce((s, p) => s + ('plant' in p ? p.plant.processingCapacity : 0), 0);

describe('portfolios (spec §10)', () => {
  it('core: 30,500 produced against 23,800 consumed at BASE_UTILIZATION, the deliberate 28% surplus', () => {
    expect(production(CORE_PORTFOLIO)).toBe(610_000);
    expect(refining(CORE_PORTFOLIO) * 0.85).toBe(476_000);
  });

  it('global: 88,500 produced against 99,000 of refining, a 5.2% surplus (spec §10.3)', () => {
    expect(GLOBAL_PORTFOLIO).toHaveLength(31);
    expect(production(GLOBAL_PORTFOLIO)).toBe(1_770_000);
    expect(refining(GLOBAL_PORTFOLIO)).toBe(1_980_000);
    expect(production(GLOBAL_PORTFOLIO) / (refining(GLOBAL_PORTFOLIO) * 0.85)).toBeCloseTo(1.052, 3);
  });

  it('gives grade access that clears: Tier 3 can take all the heavy crude, Tier 1 less than the light (spec §10.3)', () => {
    const produced = (grade: string) => GLOBAL_PORTFOLIO.reduce((s, p) => s + ('well' in p && p.well.grade === grade ? p.well.extractionCapacity : 0), 0);
    const tier = (t: number) => GLOBAL_PORTFOLIO.reduce((s, p) => s + ('plant' in p && p.plant.techTier === t ? p.plant.processingCapacity : 0), 0);
    expect(produced('HEAVY_SOUR')).toBe(500_000);
    expect(tier(3)).toBe(880_000);
    expect(tier(1)).toBe(220_000);
    expect(produced('LIGHT_SWEET')).toBe(560_000);
  });

  it('uses unique ids, and every company passes the placement rules', () => {
    expect(new Set(GLOBAL_PORTFOLIO.map((p) => p.id)).size).toBe(GLOBAL_PORTFOLIO.length);
    expect(createWorld({ seed: 'build', portfolio: GLOBAL_PORTFOLIO }).agents).toHaveLength(31);
  });

  it('keeps the Gulf producing well above local Tier 3 capacity, so a closure bites (spec §10.3)', () => {
    const gulf = GLOBAL_PORTFOLIO.filter((p) => p.region === 'Middle_East');
    expect(production(gulf)).toBe(260_000);
    expect(refining(gulf)).toBe(180_000);
  });
});
