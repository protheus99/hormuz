// The hint ladder (spec §12A.6). The owner's amendment: a reckoning out of a clear sky reads as
// arbitrary, so the pressure has to be felt as it builds. What these check is that the weather is
// honest — silent for a clean company, quiet at first, louder as the record grows, and never a
// number anywhere in it.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { addExposure, type ExposureItem } from '../../src/engine/exposure';
import type { Agent } from '../../src/engine/model';
import { createWorld, type World } from '../../src/engine/world';
import { createHints, hintDay, rungOf } from '../../src/game/hints';
import { HINTS, RUNG_WORDS } from '../../src/content/hints';

const world = (): World => createWorld({ seed: 'hints', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });

const producer = (w: World): Agent => w.agents.find((a) => a.kind === 'PRODUCER') as Agent;

const corner = (amount: number, tick = 0): ExposureItem => ({ amount, saved: amount / 4, tick: tick as never, target: { kind: 'CASH' } });

/** Runs `days` of weather over a company whose record is already set, counting what it hears. */
function listen(w: World, me: Agent, days: number): { rungs: number[]; said: string[] } {
  const state = createHints('hints');
  const rungs: number[] = [];
  const said: string[] = [];
  for (let d = 0; d < days; d++) {
    w.tick = (w.tick + 1) as typeof w.tick;
    const hint = hintDay(w, state, me);
    if (hint === null) continue;
    rungs.push(hint.rung);
    said.push(hint.line.headline);
  }
  return { rungs, said };
}

describe('a company with nothing to answer for', () => {
  it('hears nothing at all, however long it runs', () => {
    const w = world();
    const me = producer(w);
    expect(rungOf(w, me)).toBe(0);
    expect(listen(w, me, 1000).said).toEqual([]);
  });

  it('hears nothing the week after a corner is cut, either', () => {
    const w = world();
    const me = producer(w);
    addExposure(me, corner(4_000_000, w.tick));
    expect(listen(w, me, 10).said).toEqual([]);
    // And then it starts, once it has had time to be noticed.
    expect(listen(w, me, 60).said.length).toBeGreaterThan(0);
  });
});

describe('the ladder', () => {
  it('climbs with the record: a bigger one is heard about sooner and more often', () => {
    const small = world();
    const big = world();
    addExposure(producer(small), corner(1_000_000));
    addExposure(producer(big), corner(20_000_000));
    const quiet = listen(small, producer(small), 365);
    const loud = listen(big, producer(big), 365);
    expect(Math.max(...loud.rungs)).toBeGreaterThan(Math.max(...quiet.rungs));
    expect(loud.said.length).toBeGreaterThan(quiet.said.length);
  });

  it('tells you the moment it climbs, whatever the odds say that day', () => {
    const w = world();
    const me = producer(w);
    addExposure(me, corner(20_000_000));
    const state = createHints('climb');
    // Twenty quiet days to clear the grace period, then the first day it may speak.
    let first = null as { rung: number } | null;
    for (let d = 0; d < 40 && first === null; d++) {
      w.tick = (w.tick + 1) as typeof w.tick;
      first = hintDay(w, state, me);
    }
    expect(first).not.toBeNull();
    expect(w.tick).toBeLessThan(20);      // the first day it is allowed to, not a day it rolled for
  });

  it('never says the same thing twice running', () => {
    const w = world();
    const me = producer(w);
    addExposure(me, corner(50_000_000));
    const said = listen(w, me, 500).said;
    expect(said.length).toBeGreaterThan(5);
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
  });

  it('goes quiet again when the record is cleared, and speaks again if it comes back', () => {
    const w = world();
    const me = producer(w);
    addExposure(me, corner(20_000_000));
    expect(listen(w, me, 60).said.length).toBeGreaterThan(0);
    me.record = [];
    expect(rungOf(w, me)).toBe(0);
    expect(listen(w, me, 200).said).toEqual([]);
  });
});

describe('what a hint may say', () => {
  it('has no numbers in it anywhere: no totals, no dates, no odds', () => {
    const lines = [...HINTS[1], ...HINTS[2], ...HINTS[3], ...HINTS[4]];
    expect(lines.length).toBeGreaterThanOrEqual(12);
    for (const line of lines) {
      expect(`${line.headline} ${line.body}`).not.toMatch(/[0-9]/);
      expect(line.headline).not.toMatch(/[.]$/);       // a headline, not a sentence
    }
    // Every rung has a plain name for it, which is what the log calls the weather.
    expect(Object.values(RUNG_WORDS).every((w) => w.length > 0)).toBe(true);
  });
});
