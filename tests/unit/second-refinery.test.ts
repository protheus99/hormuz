// A refiner's second refinery (D34, spec §4.10): a plant in another refining region, sharing the
// company's wallet, with its own tanks, crude, breakdowns and maintenance.

import { describe, expect, it } from 'vitest';
import { applyAction, advanceProjects } from '../../src/engine/actions';
import { plantAt, plantsOf, total } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createWorld, capitalAssets, step, type World } from '../../src/engine/world';
import { CORE_PORTFOLIO } from '../../src/data/portfolios';
import type { Refiner } from '../../src/engine/model';

const straitsId = 'Straits_Refining';

function refinerWorld(): { w: World; me: Refiner } {
  const w = createWorld({ seed: 'second', portfolio: CORE_PORTFOLIO });
  const me = w.agents.find((a) => a.agentId === straitsId) as Refiner;
  return { w, me };
}

describe('building a second refinery', () => {
  it('rises in another refining region and shares the wallet', () => {
    const { w, me } = refinerWorld();
    expect(plantsOf(me)).toHaveLength(1);
    applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: 'South_Asia' });
    const project = w.projects.find((p) => p.agentId === me.agentId);
    expect(project).toMatchObject({ kind: 'REFINERY', region: 'South_Asia' });

    for (let d = 0; d < DEFAULT_CONFIG.FACTORY_TICKS + 1; d++) {
      w.tick += 1;
      advanceProjects(w);
    }
    expect(me.second).not.toBeNull();
    expect(plantsOf(me)).toHaveLength(2);
    expect(plantAt(me, 'South_Asia')?.processingCapacity).toBe(DEFAULT_CONFIG.UNIT_CAPACITY);
    expect(plantAt(me, 'South_Asia')?.techTier).toBe(me.techTier);
    // One company, one wallet: the second site is counted in what the company owns.
    expect(capitalAssets(me, w.config)).toBeGreaterThan(capitalAssets({ ...me, second: null }, w.config));
  });

  it('refuses a second refinery at home, in the Gulf, or twice', () => {
    const { w, me } = refinerWorld();
    expect(() => applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: me.region }))
      .toThrow(/already refines/);
    expect(() => applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: 'Middle_East' }))
      .toThrow(/No new refineries/);
    applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: 'South_Asia' });
    expect(() => applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: 'North_Sea' }))
      .toThrow(/already building/);
  });
});

describe('running two sites', () => {
  // Built while the company keeps trading, as it would be in a game: the instalments come out of
  // earnings, not out of a standing start.
  const built = (): { w: World; me: Refiner } => {
    const { w, me } = refinerWorld();
    applyAction(w, me.agentId, { kind: 'START_PROJECT', project: 'REFINERY', steps: 1, region: 'South_Asia' });
    for (let d = 0; d < DEFAULT_CONFIG.FACTORY_TICKS + 1; d++) step(w);
    return { w, me };
  };

  it('buys crude delivered to each site, and keeps their tanks apart', () => {
    const { w, me } = built();
    const second = plantAt(me, 'South_Asia');
    if (second === undefined) throw new Error('no second site');
    for (let d = 0; d < 60; d++) step(w);
    // Both sites order for themselves, so crude is on its way to both sets of tanks.
    expect(total(me.crudeStock) + me.inboundBarrels).toBeGreaterThan(0);
    expect(total(second.crudeStock) + second.inboundBarrels).toBeGreaterThan(0);
  });

  it('services each site on its own schedule', () => {
    const { w, me } = built();
    const second = plantAt(me, 'South_Asia');
    if (second === undefined) throw new Error('no second site');
    second.daysSinceMaintenance = DEFAULT_CONFIG.MAINT_INTERVAL + 10;
    applyAction(w, me.agentId, { kind: 'MAINTAIN_NOW', site: 1 });
    expect(second.maintenanceTicksRemaining).toBeGreaterThan(0);
    expect(me.maintenanceTicksRemaining).toBe(0);           // the home plant carries on
  });

  it('caps the run rate of the site the card named', () => {
    const { w, me } = built();
    applyAction(w, me.agentId, { kind: 'SET_RUN_CAP', cap: 0.5, days: 30, site: 1 });
    expect(plantAt(me, 'South_Asia')?.utilizationCap).toBe(0.5);
    expect(me.utilizationCap).toBe(1);
  });
});
