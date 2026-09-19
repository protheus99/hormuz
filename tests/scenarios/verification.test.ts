// Verification scenarios (spec §11.2): each run shows the behavior the spec predicts, with every
// invariant holding (step() throws otherwise). Balance targets live in tools/calibrate.ts.

import { describe, expect, it } from 'vitest';
import { CORE_PORTFOLIO, GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { wellOf } from '../../src/engine/companies';
import { createWorld, step, type World } from '../../src/engine/world';
import { CHOKEPOINT_NAMES, GLOBAL_SCENARIOS, s17, SCENARIOS } from '../../tools/scenarios';

const on = (w: World, days: number, each: (day: number, fills: ReturnType<typeof step>['fills']) => void) => {
  for (let d = 1; d <= days; d++) each(d, step(w).fills);
};
const via = (edges: readonly unknown[], id: string) => edges.map(String).includes(id);

describe('core-portfolio scenarios', () => {
  it('S2 refinery outage: Straits buys nothing while offline', () => {
    const w = createWorld({ seed: 'v', portfolio: CORE_PORTFOLIO, events: SCENARIOS.S2 ?? [] });
    let bought = 0;
    on(w, 150, (d, fills) => { if (d >= 100 && d <= 130) bought += fills.filter((f) => f.buyerId === 'Straits_Refining').length; });
    expect(bought).toBe(0);
  });

  it('S5 pipeline blockade: Boreal cannot export, its storage fills, production halts and cash falls', () => {
    const w = createWorld({ seed: 'v', portfolio: CORE_PORTFOLIO, events: SCENARIOS.S5 ?? [] });
    const boreal = () => w.agents.find((a) => a.agentId === 'Boreal_Shale');
    const startCash = boreal()?.cash ?? 0;
    let halted = 0;
    on(w, 120, () => { const well = wellOf(boreal() as never); if (well && well.storage >= well.storageCapacity - 1e-6) halted++; });
    expect(halted).toBeGreaterThan(100);
    expect(boreal()?.cash).toBeLessThan(startCash);
  });
});

describe('global-portfolio scenarios', () => {
  it('S13 Malacca congestion: East Asian cargo takes the Lombok passage only while Malacca is delayed', () => {
    const w = createWorld({ seed: 'v', portfolio: GLOBAL_PORTFOLIO, events: GLOBAL_SCENARIOS.S13 ?? [] });
    let during = 0;
    let outside = 0;
    on(w, 140, (d, fills) => {
      for (const f of fills) {
        if (!via(f.route.edges, 'lombok')) continue;
        if (d >= 100 && d <= 115) during += f.qty;
        else outside += f.qty;
      }
    });
    expect(during).toBeGreaterThan(0);
    expect(outside).toBe(0);
  });

  it('S14 Suez blockage: no new cargo through Suez, the Cape instead, and held cargo clears after reopening', () => {
    const w = createWorld({ seed: 'v', portfolio: GLOBAL_PORTFOLIO, events: GLOBAL_SCENARIOS.S14 ?? [] });
    let throughSuez = 0;
    let roundCape = 0;
    let heldPeak = 0;
    on(w, 240, (d, fills) => {
      if (d >= 200 && d <= 207) {
        for (const f of fills) {
          if (via(f.route.edges, 'suez')) throughSuez += f.qty;
          if (via(f.route.edges, 'indian_cape')) roundCape += f.qty;
        }
        heldPeak = Math.max(heldPeak, w.cargo.filter((c) => c.status === 'HELD').length);
      }
    });
    expect(throughSuez).toBe(0);
    expect(roundCape).toBeGreaterThan(0);
    expect(heldPeak).toBeGreaterThan(0);
    expect(w.cargo.filter((c) => c.status === 'HELD')).toHaveLength(0);   // everything moved on by day 240
  });

  it('S16 Danish Straits winter: Russian crude leaves by the Black Sea instead of the Baltic', () => {
    const w = createWorld({ seed: 'v', portfolio: GLOBAL_PORTFOLIO, events: GLOBAL_SCENARIOS.S16 ?? [] });
    let baltic = 0;
    let blackSea = 0;
    on(w, 60, (_d, fills) => {
      for (const f of fills) {
        if (f.originRegion !== 'Russia_West') continue;
        if (via(f.route.edges, 'danish_straits')) baltic += f.qty;
        if (via(f.route.edges, 'Russia_West-W_BLACK_SEA')) blackSea += f.qty;
      }
    });
    expect(baltic).toBe(0);
    expect(blackSea).toBeGreaterThan(0);
  });

  it.each(CHOKEPOINT_NAMES)('S17 sweep: closing %s for ticks 100–130 keeps every invariant', (c) => {
    const w = createWorld({ seed: 'v', portfolio: GLOBAL_PORTFOLIO, events: s17(c) });
    on(w, 150, () => undefined);
    expect(w.tick).toBe(150);
  });
});
