// Staged events (spec G7.1; Phase 11 acceptance): stages behave as specified; every chokepoint's
// profile fires at its rate across 100 simulated Sandbox years; the deck rules hold.

import { describe, expect, it } from 'vitest';
import type { ChokepointName } from '../../src/data/chokepoints';
import { rngFor } from '../../src/engine/rng';
import type { World } from '../../src/engine/world';
import { EVENT_PROFILES } from '../../src/content/events';
import { createDeck, deckDay, planFor, relevantChokepoints, type DeckState } from '../../src/game/events';
import { newGameWorld, PLAYER_ID, type Difficulty } from '../../src/game/newgame';
import { GameSession } from '../../src/game/session';

/** The deck alone, over a stand-in world that only keeps the tick and the event queue. */
function simulate(years: number, difficulty: Difficulty, relevant: ChokepointName[], seed = 'deck') {
  const w = { tick: 0, events: [] } as unknown as World;
  const deck: DeckState = { rng: rngFor(`${seed}:deck`, 'events'), random: true, difficulty, active: [], past: [], seq: 0, news: [], relevant, lastPriceNews: {}, lastRecession: -Infinity };
  const overlaps: number[] = [];
  for (let d = 0; d < years * 365; d++) {
    deckDay(w, deck, []);
    w.tick++;
    w.events.length = 0;
    const disrupted = new Set(deck.active.filter((e) => e.plan[e.index]?.stage === 'DISRUPTION').map((e) => e.chokepoint as string));
    if (disrupted.has('HORMUZ') && disrupted.has('BAB_EL_MANDEB')) overlaps.push(w.tick);
  }
  return { deck, overlaps };
}

describe('event stages (spec G7.1)', () => {
  it('a severe event starts with a rumour and tension; a sudden one goes straight to disruption', () => {
    const rng = rngFor('plans', 'events');
    const hormuz = planFor(EVENT_PROFILES.HORMUZ, rng, [5, 10]);
    expect(hormuz.map((s) => s.stage).slice(0, 2)).toEqual(['RUMOR', 'TENSION']);
    expect(hormuz[0]?.status).toBeNull();
    expect(hormuz[1]).toMatchObject({ status: 'TENSION', surcharge: 2 });
    const malacca = planFor(EVENT_PROFILES.MALACCA, rng, [5, 10]);
    expect(malacca).toHaveLength(1);
    expect(malacca[0]).toMatchObject({ stage: 'DISRUPTION', status: 'DELAYED' });
    expect(malacca[0]?.days).toBeGreaterThanOrEqual(5);
    expect(malacca[0]?.days).toBeLessThanOrEqual(20);
  });

  it('a closure recovers through delays; many tensions fade without closing', () => {
    const rng = rngFor('many', 'events');
    const plans = Array.from({ length: 400 }, () => planFor(EVENT_PROFILES.HORMUZ, rng, [5, 10]));
    const closing = plans.filter((p) => p.some((s) => s.status === 'CLOSED'));
    expect(closing.length / plans.length).toBeGreaterThan(0.18);
    expect(closing.length / plans.length).toBeLessThan(0.32);
    for (const p of closing) expect(p[p.length - 1]).toMatchObject({ stage: 'RECOVERY', status: 'DELAYED' });
  });

  it('moves the real strait through its stages on schedule, with news, in a game', async () => {
    const s = await GameSession.newGame({ seed: 'staged', playType: 'PRODUCER', region: 'Middle_East', companyName: 'Gulf Co' });
    const data = await s.save();
    const plan = [
      { stage: 'RUMOR', days: 3, status: null, delay: 0, surcharge: 0 },
      { stage: 'TENSION', days: 4, status: 'TENSION', delay: 0, surcharge: 2 },
      { stage: 'DISRUPTION', days: 5, status: 'CLOSED', delay: 0, surcharge: 2 },
    ] as const;
    const game = await GameSession.load({ ...data, deck: { ...data.deck, random: false }, script: [{ tick: 2, chokepoint: 'HORMUZ', plan }] });
    const status: string[] = [];
    while ((await game.save()).world.tick < 16) {
      await game.advance(1);
      status.push((await game.getView()).chokepoints.find((c) => c.name === 'HORMUZ')?.status ?? '?');
    }
    expect(status).toEqual([
      'OPEN', 'OPEN', 'OPEN', 'OPEN',                                // day 1, then the rumour on days 2–4
      'TENSION', 'TENSION', 'TENSION', 'TENSION',                    // days 5–8
      'CLOSED', 'CLOSED', 'CLOSED', 'CLOSED', 'CLOSED',             // days 9–13
      'OPEN', 'OPEN', 'OPEN',
    ]);
    const headlines = (await game.getView()).news.map((n) => n.headline);
    expect(headlines).toContain('Shipping through the Strait of Hormuz is suspended');
    expect(headlines).toContain('Shipping insurers watch the Strait of Hormuz');
    for (const h of headlines) expect(h).not.toMatch(/attack|missile|war\b/i);
  });
});

describe('the deck over 100 Sandbox years (spec G7.1, G8)', () => {
  const { deck, overlaps } = simulate(100, 'NORMAL', []);

  it('fires each chokepoint at about its yearly rate', () => {
    for (const [c, profile] of Object.entries(EVENT_PROFILES)) {
      const count = deck.past.filter((e) => e.chokepoint === c).length + deck.active.filter((e) => e.chokepoint === c).length;
      // Events already under way block new ones, so long events land a little under their rate.
      expect(count / 100, c).toBeGreaterThan(profile.rate * 0.6);
      expect(count / 100, c).toBeLessThan(profile.rate * 1.3);
    }
  });

  it('closes Hormuz in about 0.1 events a year', () => {
    const closures = deck.past.filter((e) => e.chokepoint === 'HORMUZ' && e.worst === 'CLOSED').length / 100;
    expect(closures).toBeGreaterThan(0.04);
    expect(closures).toBeLessThan(0.2);
  });

  it('starts winter and dry-season events only in their seasons', () => {
    for (const e of deck.past.filter((x) => x.chokepoint === 'DANISH_STRAITS')) expect(e.start % 365 >= 335 || e.start % 365 <= 59).toBe(true);
    for (const e of deck.past.filter((x) => x.chokepoint === 'PANAMA')) expect(e.start % 365).toBeLessThanOrEqual(119);
  });

  it('never disrupts a chokepoint and its bypass together on Normal', () => {
    expect(overlaps).toEqual([]);
  });

  it('Easy has about half the events of Normal, and Hard about half as many again', () => {
    const count = (d: Difficulty) => simulate(30, d, [], 'difficulty').deck.past.length;
    const [easy, normal, hard] = [count('EASY'), count('NORMAL'), count('HARD')];
    expect(easy / normal).toBeGreaterThan(0.35);
    expect(easy / normal).toBeLessThan(0.7);
    expect(hard / normal).toBeGreaterThan(1.2);
  });

  it('touches a strait the player depends on every year', () => {
    const { deck: d } = simulate(20, 'NORMAL', ['SUEZ']);
    for (let year = 0; year < 20; year++) {
      const hit = [...d.past, ...d.active.map((e) => ({ chokepoint: e.chokepoint, start: e.startedTick }))]
        .some((e) => e.chokepoint === 'SUEZ' && Math.floor(e.start / 365) === year);
      expect(hit, `year ${year + 1}`).toBe(true);
    }
  });
});

describe('what the player depends on', () => {
  it('a Gulf producer depends on Hormuz; a Coastal Asia refiner on Malacca', () => {
    const gulf = newGameWorld({ seed: 'r', playType: 'PRODUCER', region: 'Middle_East', companyName: 'G' });
    expect(relevantChokepoints(gulf, ['Middle_East'], 'PRODUCER')).toContain('HORMUZ');
    const asia = newGameWorld({ seed: 'r', playType: 'REFINER', region: 'Coastal_Asia', companyName: 'A' });
    expect(relevantChokepoints(asia, ['Coastal_Asia'], 'REFINER')).toContain('MALACCA');
    expect(createDeck(asia, 's', 'NORMAL', true, ['Coastal_Asia'], 'REFINER').relevant).toContain('MALACCA');
    expect(asia.agents.some((a) => a.agentId === PLAYER_ID)).toBe(true);
  });
});
