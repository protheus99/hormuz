// The tick orchestrator and S0 (spec §5, §9, §11.2; Phase 6 acceptance: S0 runs 365 ticks with
// every invariant holding).

import { describe, expect, it } from 'vitest';
import { CORE_PORTFOLIO } from '../../src/data/portfolios';
import { createRecorder, fingerprint, record, toCsv } from '../../src/engine/metrics';
import { checkInvariants, createWorld, fork, run, step, type World } from '../../src/engine/world';

const s0 = (seed = 'S0'): World => createWorld({ seed, portfolio: CORE_PORTFOLIO });

describe('S0 baseline (spec §11.2)', () => {
  it('runs 365 ticks with every invariant holding, and records one metrics row per tick', () => {
    const w = s0();
    const recorder = createRecorder();
    for (let t = 0; t < 365; t++) record(recorder, w, step(w));   // step() throws if an invariant breaks
    expect(w.tick).toBe(365);
    expect(recorder.rows).toHaveLength(365);
    const csv = toCsv(recorder);
    expect(csv.split('\n')[0]).toMatch(/^tick,marker_NYMEX,marker_NC,marker_DME,price_GASOLINE/);
    expect(csv.trimEnd().split('\n')).toHaveLength(366);
    expect(w.totals.extracted).toBeGreaterThan(1_000_000);
    expect(w.totals.refined).toBeGreaterThan(1_000_000);
  });

  it('is deterministic: the same seed gives the same world, another seed a different one', () => {
    const [a, b, c] = [s0(), s0(), s0('another')];
    run(a, 60); run(b, 60); run(c, 60);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(a)).not.toBe(fingerprint(c));
  });

  it('saves and reloads mid-run without changing the future (spec G9)', () => {
    const original = s0();
    run(original, 100);
    const restored = JSON.parse(JSON.stringify(original)) as World;
    run(original, 50);
    run(restored, 50);
    expect(fingerprint(restored)).toBe(fingerprint(original));
  });
});

describe('scheduled events and forks', () => {
  it('applies a scheduled chokepoint change at the start of its tick', () => {
    const w = createWorld({ seed: 'S4', portfolio: CORE_PORTFOLIO, events: [
      { tick: 5, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' },
      { tick: 8, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'OPEN' },
    ] });
    run(w, 4);
    expect(w.graph.chokepoints.HORMUZ.status).toBe('OPEN');
    step(w);
    expect(w.graph.chokepoints.HORMUZ.status).toBe('CLOSED');
    run(w, 3);
    expect(w.graph.chokepoints.HORMUZ.status).toBe('OPEN');
  });

  it('takes a plant offline and back on schedule', () => {
    const w = createWorld({ seed: 'S2', portfolio: CORE_PORTFOLIO, events: [
      { tick: 3, kind: 'PLANT_ONLINE', agentId: 'Straits_Refining', online: false },
    ] });
    run(w, 3);
    const straits = w.agents.find((a) => a.agentId === 'Straits_Refining');
    expect(straits?.kind === 'REFINER' && straits.online).toBe(false);
  });

  it('forks without touching the original; a calm fork drops future events and product noise (spec G4.5)', () => {
    const w = createWorld({ seed: 'F', portfolio: CORE_PORTFOLIO, events: [{ tick: 50, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' }] });
    run(w, 20);
    const before = fingerprint(w);
    const calm = fork(w, true);
    run(calm, 40);
    expect(fingerprint(w)).toBe(before);
    expect(calm.graph.chokepoints.HORMUZ.status).toBe('OPEN');
    expect(calm.config.PRODUCT_PRICES.SIGMA.DIESEL).toBe(0);
    expect(fork(w, false).events).toHaveLength(1);
  });
});

describe('invariants and insolvency (spec §9, G6)', () => {
  it('stops the run, naming the problem, if barrels appear from nowhere', () => {
    const w = s0();
    run(w, 5);
    const qasr = w.agents.find((a) => a.agentId === 'Qasr_Petroleum');
    if (qasr?.kind === 'PRODUCER') qasr.storage += 1000;
    expect(() => checkInvariants(w)).toThrow(/Invariant broken at tick 5: barrels held/);
  });

  it('stops the run if cash appears from nowhere', () => {
    const w = s0();
    run(w, 5);
    const first = w.agents[0];
    if (first) first.cash += 1;
    expect(() => checkInvariants(w)).toThrow(/company cash/);
  });

  it('records a company insolvent after three days below zero with no credit, and keeps it in the world (D11)', () => {
    const w = s0();
    const metro = w.agents.find((a) => a.agentId === 'Metro_Refine');
    if (!metro) throw new Error('Metro expected');
    metro.cash = -1_000_000;
    (w.totals as { startingCash: number }).startingCash -= 4_000_000;   // keep invariant 2 balanced for this test
    run(w, 2);
    expect(metro.insolvent).toBe(false);
    step(w);
    expect(metro.insolvent).toBe(true);
    expect(w.agents).toContain(metro);
  });
});
