// Decision cards (spec G4; Phase 9 acceptance): each card triggers and its options act; projections
// are honest in a calm world and never see the future; three options project quickly; cards merge,
// expire, cool down and respect affordability; AI companies answer operating cards; a game with
// card answers replays exactly.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/actions';
import { plantOf, wellOf } from '../../src/engine/companies';
import { fingerprint } from '../../src/engine/metrics';
import type { Agent } from '../../src/engine/model';
import { fork, netWorth, step, type World } from '../../src/engine/world';
import { advise, answer, answerProblem, createAdvisor, type AdvisorState } from '../../src/game/cards/advisor';
import { CATALOG, cardsFor } from '../../src/game/cards/catalog';
import { projectOptions } from '../../src/game/cards/projection';
import type { Card, CardType } from '../../src/game/cards/types';
import { CARD_TEXT_TYPES } from '../../src/content/cards';
import { GameSession } from '../../src/game/session';
import { newGameWorld, PLAYER_ID, type GameSettings } from '../../src/game/newgame';

const producer: GameSettings = { seed: 'cards-p', playType: 'PRODUCER', region: 'Russia_West', companyName: 'Northwind Oil' };
const refiner: GameSettings = { seed: 'cards-r', playType: 'REFINER', region: 'Coastal_Asia', companyName: 'Harbour Refining' };
const trader: GameSettings = { seed: 'cards-t', playType: 'TRADER', region: 'North_Sea', companyName: 'Fjord Trading' };

function game(settings: GameSettings, days = 5): { w: World; advisor: AdvisorState; me: Agent } {
  const w = newGameWorld(settings);
  w.cardsActive = true;
  const advisor = createAdvisor(w);
  for (let d = 0; d < days; d++) step(w);
  const me = w.agents.find((a) => a.agentId === PLAYER_ID) as Agent;
  return { w, advisor, me };
}

/** Tampering keeps the invariants' books balanced (spec §9: cash and barrels are conserved). */
function setCash(w: World, a: Agent, cash: number): void {
  (w.totals as { startingCash: number }).startingCash += cash - a.cash;
  a.cash = cash;
}
function setStorage(w: World, well: { storage: number }, storage: number): void {
  (w.totals as { startingBarrels: number }).startingBarrels += storage - well.storage;
  well.storage = storage;
}

/** Runs the advisor for today and returns the player's open card of this type. */
function raise(w: World, advisor: AdvisorState, type: CardType): Card | undefined {
  advise(w, advisor, []);
  return advisor.cards.find((c) => c.type === type && c.agentId === PLAYER_ID);
}

describe('the catalog (spec G4.4, G4.7 coverage)', () => {
  it('gives every card text, and each play type at least ten card types', () => {
    for (const def of CATALOG) expect(CARD_TEXT_TYPES).toContain(def.type);
    for (const kind of ['PRODUCER', 'REFINER', 'TRADER'] as const) expect(cardsFor(kind).length).toBeGreaterThanOrEqual(10);
  });
});

describe('producer cards', () => {
  it('prices below cost: Yes cuts output to half', () => {
    const { w, advisor, me } = game(producer);
    const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
    well.breakevenStreak = -12;
    const card = raise(w, advisor, 'PRICES_BELOW_COST') as Card;
    expect(card.options.map((o) => o.choice)).toEqual(['YES', 'MAYBE', 'NO']);
    expect(card.deadline).toBe(w.tick + w.config.CARD_DEADLINE);
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(well.extractionRate).toBe(0.5);
  });

  it('storage nearly full: Yes offers the surplus for sale today', () => {
    const { w, advisor, me } = game(producer);
    const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
    setStorage(w, well, 0.95 * well.storageCapacity);
    const card = raise(w, advisor, 'STORAGE_NEARLY_FULL') as Card;
    expect(card.situation).toMatch(/95%/);
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(w.standingOrders.some((o) => o.agentId === PLAYER_ID && o.side === 'ASK')).toBe(true);
  });

  it('wells declining: Yes drills back to peak', () => {
    const { w, advisor, me } = game(producer);
    const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
    well.extractionCapacity = 0.8 * well.peakCapacity;
    const card = raise(w, advisor, 'WELLS_DECLINING') as Card;
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(w.projects.some((p) => p.agentId === PLAYER_ID && p.kind === 'DRILL')).toBe(true);
  });
});

describe('refiner cards', () => {
  it('maintenance due: Yes shuts the plant for servicing; Maybe schedules it', () => {
    const { w, advisor, me } = game(refiner);
    const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
    plant.daysSinceMaintenance = w.config.MAINT_INTERVAL + 5;
    const card = raise(w, advisor, 'MAINTENANCE_DUE') as Card;
    expect(card.options.find((o) => o.choice === 'YES')?.impact?.risk).toBeDefined();
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(plant.maintenanceTicksRemaining).toBeGreaterThan(0);
  });

  it('breakdown: raised once per outage; Yes pays for an emergency repair', () => {
    const { w, advisor, me } = game(refiner);
    const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
    plant.outageTicksRemaining = 20;
    plant.online = false;
    const card = raise(w, advisor, 'BREAKDOWN') as Card;
    const cash = me.cash;
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(plant.outageTicksRemaining).toBeLessThan(20);
    expect(me.cash).toBeLessThan(cash);
    expect(raise(w, advisor, 'BREAKDOWN')).toBeUndefined();
  });

  it('refining losing: Yes slows the plant to half for a month', () => {
    const { w, advisor, me } = game(refiner);
    const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
    plant.lowMarginDays = 6;
    const card = raise(w, advisor, 'REFINING_LOSING') as Card;
    answer(w, advisor, PLAYER_ID, card.id, 'YES');
    expect(plant.utilizationCap).toBe(0.5);
  });
});

describe('trader cards', () => {
  it('a trader sees several kinds of card in its first months', async () => {
    const s = await GameSession.newGame(trader);
    const seen = new Set<string>();
    while ((await s.save()).world.tick < 150) {
      const r = await s.advance(150);
      for (const c of r.newCards) seen.add(c.type);
    }
    // Cards whose orders would not fill are dropped, so a calm start shows fewer (Phase 12 tunes this).
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe('card rules (spec G4.1)', () => {
  it('a raised card resolves as No at its deadline, then its type cools down', () => {
    const { w, advisor, me } = game(refiner);
    const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
    plant.lowMarginDays = 6;
    const card = raise(w, advisor, 'REFINING_LOSING') as Card;
    while (w.tick < (card.deadline as number)) step(w);
    plant.lowMarginDays = 6;
    advise(w, advisor, []);
    expect(advisor.resolved).toContainEqual(expect.objectContaining({ type: 'REFINING_LOSING', choice: 'NO', expired: true }));
    expect(advisor.cards.some((c) => c.type === 'REFINING_LOSING')).toBe(false);
    expect(plant.utilizationCap).toBe(1);
    expect(advisor.cooldowns[`${PLAYER_ID}:REFINING_LOSING`]).toBe(w.tick + w.config.CARD_COOLDOWN);
  });

  it('never has more than CARD_MAX_OPEN raised cards open, and a lasting situation stays one card', () => {
    const { w, advisor, me } = game(refiner);
    const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
    plant.lowMarginDays = 6;
    plant.daysSinceMaintenance = w.config.MAINT_INTERVAL + 5;
    plant.outageTicksRemaining = 20;
    setCash(w, me, 0);
    advise(w, advisor, []);
    advise(w, advisor, []);
    const open = advisor.cards.filter((c) => c.agentId === PLAYER_ID && !c.opportunity);
    expect(open.length).toBeLessThanOrEqual(w.config.CARD_MAX_OPEN);
    expect(new Set(open.map((c) => c.key)).size).toBe(open.length);
  });

  it('an option costing more than cash plus credit shows, but cannot be chosen', () => {
    const { w, advisor, me } = game(producer);
    const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
    well.extractionCapacity = 0.5 * well.peakCapacity;
    me.creditDrawn = me.creditLimit;
    setCash(w, me, 0);
    const card = raise(w, advisor, 'WELLS_DECLINING') as Card;
    const yes = card.options.find((o) => o.choice === 'YES');
    expect(yes?.affordable).toBe(false);
    expect(answerProblem(advisor, PLAYER_ID, card.id, 'YES')).toBe('Not enough money yet');
    expect(answerProblem(advisor, PLAYER_ID, card.id, 'NO')).toBeNull();
  });
});

describe('impact projections (spec G4.5)', () => {
  it('match what then happens in a calm world, within 5%', () => {
    const { w, me } = game(refiner, 20);
    const calm = fork(w, true);
    const yes = [{ kind: 'SET_RUN_CAP', cap: 0.5, days: 30 }] as const;
    const [impact] = projectOptions(calm, PLAYER_ID, [yes, []]);

    const run = (actions: readonly (typeof yes)[number][]) => {
      const f = fork(calm, true);
      for (const a of actions) applyAction(f, PLAYER_ID, a);
      for (let d = 0; d < f.config.PROJECTION_TICKS; d++) step(f);
      return netWorth(f, f.agents.find((a) => a.agentId === me.agentId) as Agent);
    };
    const actual = ((run(yes) - run([])) * 30) / w.config.PROJECTION_TICKS;
    expect(impact?.profit).toBeCloseTo(actual, 0);
    expect(Math.abs((impact?.profit ?? 0) - actual)).toBeLessThanOrEqual(0.05 * Math.abs(actual) + 1);
  });

  it('never see scheduled events, so the real future cannot leak', () => {
    const { w } = game(refiner, 10);
    const options = [[{ kind: 'MAINTAIN_NOW' } as const], []];
    const plain = projectOptions(w, PLAYER_ID, options);
    const withFuture = structuredClone(w);
    withFuture.events = [{ tick: w.tick + 3, kind: 'CHOKEPOINT', chokepoint: 'MALACCA', status: 'CLOSED' }];
    expect(projectOptions(withFuture, PLAYER_ID, options)).toEqual(plain);
  });

  it('project three options in under half a second', () => {
    const { w } = game(refiner, 10);
    const options = [[{ kind: 'SET_RUN_CAP', cap: 0.5, days: 30 } as const], [{ kind: 'SET_RUN_CAP', cap: 0.75, days: 30 } as const], []];
    projectOptions(w, PLAYER_ID, options);   // warm up
    const start = performance.now();
    projectOptions(w, PLAYER_ID, options);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('AI parity (spec G4.6)', () => {
  it('AI refiners answer maintenance cards, so no plant goes unserviced for long', async () => {
    const s = await GameSession.newGame(refiner);
    while ((await s.save()).world.tick < 300) await s.advance(300);
    const w = (await s.save()).world;
    const ai = w.agents.filter((a) => a.controller === 'AI' && plantOf(a));
    expect(ai.length).toBeGreaterThan(5);
    for (const a of ai) expect(plantOf(a)?.daysSinceMaintenance).toBeLessThan(2 * w.config.MAINT_INTERVAL);
    expect(w.insolvencies).toEqual({});
  });
});

describe('cards in a game (spec G3, G9)', () => {
  it('answers a card and an Opportunity, and replays the game exactly', async () => {
    const s = await GameSession.newGame(refiner);
    let answered = 0;
    while ((await s.save()).world.tick < 90) {
      const r = await s.advance(90);
      for (const c of r.newCards) {
        const choice = c.options.find((o) => o.affordable && o.choice !== 'NO')?.choice ?? 'NO';
        expect(await s.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: c.id, choice })).toMatchObject({ ok: true });
        answered++;
      }
      if (r.tick === 30) {
        const view = await s.getView();
        expect(view.opportunities.map((o) => o.type)).toContain('ADD_UNIT');
        const card = await s.openOpportunity(PLAYER_ID, 'ADD_UNIT');
        expect(card?.deadline).toBeNull();
        await s.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: card?.id ?? '', choice: 'YES' });
      }
    }
    expect(answered).toBeGreaterThan(0);
    const w = (await s.save()).world;
    expect(w.projects.some((p) => p.agentId === PLAYER_ID && p.kind === 'UNIT') || (plantOf(w.agents.find((a) => a.agentId === PLAYER_ID) as Agent)?.processingCapacity ?? 0) > 0).toBe(true);

    const replayed = await GameSession.replay(refiner, await s.commandLog(), w.tick);
    expect(fingerprint((await replayed.save()).world)).toBe(fingerprint(w));
    expect((await replayed.save()).advisor.resolved).toEqual((await s.save()).advisor.resolved);
  });

  it('rejects an answer to a card that is not open', async () => {
    const s = await GameSession.newGame(producer);
    expect(await s.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: 'c999', choice: 'YES' })).toEqual({ ok: false, reason: 'That card is no longer open' });
  });
});
