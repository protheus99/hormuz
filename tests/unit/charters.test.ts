// Chartered tankers (spec §4.11, §6.5, §7.4): a hired ship carries the next cargo its owner sends,
// which then pays no per-barrel freight — only the war-risk surcharge — and can wait at sea as
// floating storage. The hire is charged every day, carrying cargo or not.

import { describe, expect, it } from 'vitest';
import { CORE_PORTFOLIO } from '../../src/data/portfolios';
import { applyAction } from '../../src/engine/actions';
import { charterCost, freightRate, idleCharter, newCharter } from '../../src/engine/charters';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { asAgentId, asCargoId, asCharterId, newCargo, type Cargo, type Route, type Tick } from '../../src/engine/model';
import { createWorld, step, type World } from '../../src/engine/world';

const owner = asAgentId('Qasr_Petroleum');
const route: Route = { edges: [], totalFreight: 9.8, totalSurcharge: 2, totalTransit: 4, chokepoints: ['HORMUZ'] };

const cargoOn = (charterId: string | null, qty = 10_000): Cargo => newCargo({
  cargoId: asCargoId(`c-${charterId ?? 'spot'}`), ownerId: owner, grade: 'HEAVY_SOUR', qty,
  origin: 'Middle_East', destination: 'Coastal_Asia', route, dispatchTick: 1 as Tick, dealId: null,
  charterId: charterId === null ? null : asCharterId(charterId),
});

describe('hiring a tanker (spec §7.4)', () => {
  it('costs its daily rate for at least the minimum hire', () => {
    expect(charterCost(DEFAULT_CONFIG, 'SMALL', 30)).toBe(30 * DEFAULT_CONFIG.CHARTER.SMALL.RATE);
    expect(charterCost(DEFAULT_CONFIG, 'LARGE', 90)).toBe(90 * DEFAULT_CONFIG.CHARTER.LARGE.RATE);
    // A shorter hire than the minimum still pays the minimum.
    expect(charterCost(DEFAULT_CONFIG, 'SMALL', 5)).toBe(DEFAULT_CONFIG.CHARTER_MIN_TICKS * DEFAULT_CONFIG.CHARTER.SMALL.RATE);
  });

  it('carries the next cargo, but only one at a time, and only what fits', () => {
    const small = newCharter(DEFAULT_CONFIG, owner, 'SMALL', 30, 1 as Tick, 1);
    expect(idleCharter([small], [], owner, 10_000, 1 as Tick)).toBe(small);
    expect(idleCharter([small], [cargoOn(small.charterId)], owner, 10_000, 1 as Tick)).toBeUndefined();
    expect(idleCharter([small], [], owner, small.capacity + 1, 1 as Tick)).toBeUndefined();
    expect(idleCharter([small], [], asAgentId('Boreal_Shale'), 10_000, 1 as Tick)).toBeUndefined();
    expect(idleCharter([small], [], owner, 10_000, (small.untilTick + 1) as Tick)).toBeUndefined();
  });

  it('pays the war-risk surcharge but no freight per barrel', () => {
    expect(freightRate(route, null)).toBe(9.8);
    expect(freightRate(route, asCharterId('ch-1'))).toBe(2);
  });
});

describe('a charter in a running world', () => {
  const hire = (days: number): World => {
    const w = createWorld({ seed: 'charter', portfolio: CORE_PORTFOLIO });
    applyAction(w, owner, { kind: 'CHARTER', size: 'SMALL', days });
    return w;
  };

  it('is charged every day it is hired, carrying cargo or not', () => {
    const w = hire(30);
    const company = w.agents.find((a) => a.agentId === owner) as { cash: number };
    const before = company.cash;
    step(w);
    const charged = w.ledger.entries.filter((e) => e.kind === 'CHARTER' && e.agentId === owner);
    expect(charged).toHaveLength(1);
    expect(charged[0]?.amount).toBe(DEFAULT_CONFIG.CHARTER.SMALL.RATE);
    expect(company.cash).toBeLessThan(before);
  });

  it('is handed back when the hire runs out', () => {
    const w = hire(30);
    expect(w.charters).toHaveLength(1);
    for (let d = 0; d < 31; d++) step(w);
    expect(w.charters).toHaveLength(0);
  });

  it('carries the crude its owner buys, and that cargo pays no freight', () => {
    const w = createWorld({ seed: 'charter-buy', portfolio: CORE_PORTFOLIO });
    const buyer = w.agents.find((a) => a.kind === 'REFINER');
    if (buyer === undefined) throw new Error('no refiner in the core portfolio');
    applyAction(w, buyer.agentId, { kind: 'CHARTER', size: 'LARGE', days: 90 });
    for (let d = 0; d < 20; d++) {
      step(w);
      const chartered = w.cargo.find((c) => c.charterId !== null && c.ownerId === buyer.agentId);
      if (chartered === undefined) continue;
      const freight = w.ledger.entries.filter((e) => e.kind === 'FREIGHT' && e.agentId === buyer.agentId);
      // Whatever it paid this tick was the surcharge on a troubled strait, never the full freight.
      for (const f of freight) expect(f.amount).toBeLessThan(chartered.route.totalFreight * chartered.qty);
      return;
    }
    throw new Error('the refiner never shipped on its charter');
  });
});

describe('floating storage (the "Keep cargo afloat" card)', () => {
  it('holds chartered cargo at sea without demurrage, then lands it', () => {
    const w = createWorld({ seed: 'afloat', portfolio: CORE_PORTFOLIO });
    const buyer = w.agents.find((a) => a.kind === 'REFINER');
    if (buyer === undefined) throw new Error('no refiner in the core portfolio');
    applyAction(w, buyer.agentId, { kind: 'CHARTER', size: 'LARGE', days: 90 });
    let held: Cargo | undefined;
    for (let d = 0; d < 40 && held === undefined; d++) {
      step(w);
      applyAction(w, buyer.agentId, { kind: 'KEEP_AFLOAT', days: 10 });
      held = w.cargo.find((c) => c.ownerId === buyer.agentId && c.charterId !== null && c.floatUntil > w.tick);
    }
    if (held === undefined) throw new Error('nothing was held at sea');
    const cargoId = held.cargoId;
    let demurrage = 0;
    for (let d = 0; d < 5; d++) {
      step(w);
      demurrage += w.ledger.entries.filter((e) => e.kind === 'DEMURRAGE' && e.agentId === buyer.agentId).length;
    }
    const still = w.cargo.find((c) => c.cargoId === cargoId);
    expect(still?.qty ?? 0).toBeGreaterThan(0);              // still aboard
    expect(still?.demurrageTicks ?? 0).toBe(0);              // and paying no demurrage
    expect(demurrage).toBe(0);
  });
});
