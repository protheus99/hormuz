// The game session (spec G2, G3, G5, G8, G9; Phase 8 acceptance: a save reloads to an identical
// state; a replay reproduces the same game at any speed; commands apply at the next tick; views
// never expose rival data).

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { fingerprint } from '../../src/engine/metrics';
import { wellOf } from '../../src/engine/companies';
import { msPerDay } from '../../src/game/session';
import { GameSession, type SaveData } from '../../src/game/session';
import { newGameWorld, PLAYER_ID, regionsFor, type GameSettings } from '../../src/game/newgame';

const producerGame: GameSettings = { seed: 'game-1', playType: 'PRODUCER', region: 'Russia_West', companyName: 'Northwind Oil' };
const worldOf = async (s: GameSession) => (await s.save()).world;
/** Runs to a day, past any pauses for new cards (left unanswered). */
const runTo = async (s: GameSession, tick: number) => {
  while ((await s.advance(tick - (await worldOf(s)).tick)).tick < tick);
};

describe('starting a game (spec G2, G8)', () => {
  it('adds the player’s company at about 17.5% of its region, taken from the largest rival', () => {
    const w = newGameWorld(producerGame);
    const player = w.agents.find((a) => a.agentId === PLAYER_ID);
    const volga = w.agents.find((a) => a.agentId === 'Volga_Export');
    expect(player).toMatchObject({ name: 'Northwind Oil', region: 'Russia_West', controller: 'HUMAN', personality: null, kind: 'PRODUCER' });
    // 17.5% of 9,000 is 1,500; the 2,000 floor applies, so the player can hold a deal (G4.7).
    expect(wellOf(player as never)?.extractionCapacity).toBe(2000);
    expect(wellOf(volga as never)?.extractionCapacity).toBe(7000);
  });

  it('leaves the world’s total production and refining unchanged (spec §10.3)', () => {
    const production = (settings: GameSettings) => newGameWorld(settings).agents.reduce((s, a) => s + (wellOf(a)?.extractionCapacity ?? 0), 0);
    const global = GLOBAL_PORTFOLIO.reduce((s, p) => s + ('well' in p ? p.well.extractionCapacity : 0), 0);
    expect(production(producerGame)).toBe(global);
  });

  it('starts a refiner in a region with no rival refiner at the standard size', () => {
    const w = newGameWorld({ seed: 'g', playType: 'REFINER', region: 'North_Sea', companyName: 'Fjord Refining', techTier: 1 });
    const player = w.agents.find((a) => a.agentId === PLAYER_ID);
    expect(player).toMatchObject({ kind: 'REFINER', processingCapacity: 5000, techTier: 1 });
  });

  it('refuses a region the play type cannot start in, and a blank name', () => {
    expect(regionsFor('PRODUCER')).not.toContain('Coastal_Asia');
    expect(() => newGameWorld({ ...producerGame, region: 'Coastal_Asia' })).toThrow(/cannot start in Coastal_Asia/);
    expect(() => newGameWorld({ ...producerGame, companyName: '  ' })).toThrow(/needs a name/);
  });

  it('gives an easy game more cash and credit, and a hard one less', () => {
    const cash = (difficulty: 'EASY' | 'HARD') => newGameWorld({ ...producerGame, difficulty }).agents.find((a) => a.agentId === PLAYER_ID);
    const normal = newGameWorld(producerGame).agents.find((a) => a.agentId === PLAYER_ID);
    expect(cash('EASY')?.cash).toBe((normal?.cash ?? 0) * 1.5);
    expect(cash('HARD')?.cash).toBe((normal?.cash ?? 0) * 0.75);
    expect(cash('HARD')?.creditLimit).toBeLessThan(normal?.creditLimit ?? 0);
  });
});

describe('commands (spec G3, G9)', () => {
  it('queues a setting change for the next tick, not before (Phase 8 acceptance)', async () => {
    const game = await GameSession.newGame(producerGame);
    await game.advance(5);
    expect(await game.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: 'selling', value: 'HOLD_FOR_PRICE' })).toEqual({ ok: true, appliesAt: 6 });
    expect((await game.getView()).company.settings.selling).toBe('BALANCED');
    await game.advance(1);
    expect((await game.getView()).company.settings.selling).toBe('HOLD_FOR_PRICE');
  });

  it('rejects a setting the company does not have, a value that does not exist, and rivals’ companies', async () => {
    const game = await GameSession.newGame(producerGame);
    expect(await game.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: 'appetite', value: 'HIGH' })).toEqual({ ok: false, reason: 'A producer has no appetite setting' });
    expect(await game.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: 'risk', value: 'RECKLESS' })).toMatchObject({ ok: false });
    expect(await game.submit('Qasr_Petroleum' as never, { kind: 'SET_SETTING', setting: 'risk', value: 'SAFE' })).toMatchObject({ ok: false, reason: /not a player's company/ });
  });
});

describe('the clock (spec G3)', () => {
  it('pauses on a critical alert, such as a chokepoint closing', async () => {
    const data = await (await GameSession.newGame(producerGame)).save();
    const withClosure: SaveData = { ...data, world: { ...data.world, events: [{ tick: 4, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' }] } };
    const game = await GameSession.load(withClosure);
    const result = await game.advance(30);
    expect(result).toMatchObject({ tick: 4, ticksRun: 4, ended: false });
    expect(result.pausedBy).toMatchObject({ severity: 'CRITICAL', message: 'The Strait of Hormuz is closed to shipping.' });
  });

  it('pauses on a medium alert only if the player asked to', async () => {
    const data = await (await GameSession.newGame(producerGame)).save();
    const tension: SaveData = { ...data, world: { ...data.world, events: [{ tick: 3, kind: 'CHOKEPOINT', chokepoint: 'SUEZ', status: 'TENSION' }] } };
    const relaxed = await GameSession.load(tension);
    expect((await relaxed.advance(10)).pausedBy).toBeNull();   // it may still stop for a new card
    const watchful = await GameSession.load(tension);
    await watchful.setPauseLevel('MEDIUM');
    expect((await watchful.advance(10)).ticksRun).toBe(3);
  });

  it('ends a game of fixed length, and accepts no more commands', async () => {
    const game = await GameSession.newGame({ ...producerGame, lengthDays: 5 });
    expect(await game.advance(10)).toMatchObject({ tick: 5, ticksRun: 5, ended: true });
    expect(await game.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: 'risk', value: 'SAFE' })).toEqual({ ok: false, reason: 'The game has ended' });
  });

  it('gives the client a pace for each speed', () => {
    expect([msPerDay(1), msPerDay(2), msPerDay(8)]).toEqual([2000, 1000, 250]);
    expect(msPerDay(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('the Activity record (spec G5)', () => {
  it('records every barrel the company pumped, and what its sales came to', async () => {
    const s = await GameSession.newGame(producerGame);
    await runTo(s, 60);
    const view = await s.getView();
    const w = await worldOf(s);

    expect(view.days).toHaveLength(60);
    expect(view.days.at(-1)?.tick).toBe(w.tick);
    // The book is the company's own history: pumping it records must be pumping the world recorded.
    const pumped = view.days.reduce((t, d) => t + d.pumped, 0);
    expect(pumped).toBeCloseTo(w.totals.extractedBy[PLAYER_ID] ?? 0, 6);
    expect(view.days.at(-1)?.cash).toBeCloseTo(view.company.cash, 6);

    // Something was sold, and every sale has both its barrels and its money.
    const sold = view.days.filter((d) => d.soldQty > 0);
    expect(sold.length).toBeGreaterThan(0);
    for (const d of sold) expect(d.soldRevenue).toBeGreaterThan(0);
  });

  it(`shows the day's clearing at each node, matching what the player was paid`, async () => {
    const s = await GameSession.newGame(producerGame);
    await runTo(s, 40);
    let sawTrade = false;
    for (let d = 0; d < 20 && !sawTrade; d++) {
      await s.advance(1);
      const view = await s.getView();
      const today = view.days.at(-1);
      for (const m of view.markets) {
        if (m.trades === 0) { expect(m.tradedToday).toBe(0); continue; }
        sawTrade = true;
        expect(m.tradedToday).toBeGreaterThan(0);
        expect(m.low).toBeGreaterThan(0);
        expect(m.high).toBeGreaterThanOrEqual(m.low);
        // The player sells into this market: what it was paid sits inside the day's range.
        if (today && today.soldQty > 0 && m.grade === view.company.well?.grade) {
          const paid = today.soldRevenue / today.soldQty;
          expect(paid).toBeGreaterThanOrEqual(m.low - 0.01);
          expect(paid).toBeLessThanOrEqual(m.high + 0.01);
        }
      }
    }
    expect(sawTrade).toBe(true);
  });

  it('names who bought the crude, and says whether a deal was behind it', async () => {
    const s = await GameSession.newGame(producerGame);
    await runTo(s, 60);
    const view = await s.getView();
    const rivals = new Set(view.rivals.map((r) => r.name));

    const days = view.days.filter((d) => d.soldQty > 0);
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      expect(d.soldTo.length).toBeGreaterThan(0);
      // Every barrel sold went to someone, and that someone is a company the player can see.
      expect(d.soldTo.reduce((t, p) => t + p.qty, 0)).toBeCloseTo(d.soldQty, 6);
      for (const p of d.soldTo) expect(rivals.has(p.name)).toBe(true);
      expect([...d.soldTo].sort((x, y) => y.qty - x.qty)).toEqual([...d.soldTo]);
    }
  });

  it('accounts for every dollar the day cost, and each day adds up to the cash in hand', async () => {
    const s = await GameSession.newGame(producerGame);
    const start = (await s.getView()).company.cash;
    await runTo(s, 60);
    const view = await s.getView();
    expect(view.company.creditDrawn).toBe(0);   // borrowing would be money in from outside the book

    for (const d of view.days) {
      const { pumping, refining, shipping, running, building, total } = d.costs;
      expect(pumping + refining + shipping + running + building).toBeCloseTo(total, 6);
      expect(running).toBeGreaterThan(0);       // a company costs something to keep open every day
      if (d.pumped > 0) expect(pumping).toBeGreaterThan(0);
    }

    // Money in, less crude bought and everything the day cost, is the change in the bank.
    const made = view.days.reduce((t, d) => t + d.soldRevenue + d.fuelRevenue - d.boughtCost - d.costs.total, 0);
    expect(start + made).toBeCloseTo(view.company.cash, 2);
  });

  it('carries on from a save written before a setting existed, rather than running on NaN', async () => {
    const s = await GameSession.newGame(producerGame);
    await runTo(s, 10);
    const saved = await s.save();

    // An older save: no daily swing setting, and no stream to draw it from.
    const older = structuredClone(saved) as SaveData;
    delete (older.world.config as { EXTRACTION_SPREAD?: number }).EXTRACTION_SPREAD;
    delete (older.world.rng as { wells?: unknown }).wells;

    const reloaded = await GameSession.load(older);
    await runTo(reloaded, 20);
    const view = await reloaded.getView();
    expect(view.company.cash).toBeGreaterThan(0);
    for (const d of view.days) expect(Number.isFinite(d.pumped)).toBe(true);
    expect(view.days.some((d) => d.pumped > 0)).toBe(true);
  });

  it('keeps the record across a save, and starts one for a save written without it', async () => {
    const s = await GameSession.newGame(producerGame);
    await runTo(s, 20);
    const saved = await s.save();
    expect((await (await GameSession.load(saved)).getView()).days).toHaveLength(20);

    const { days: _dropped, ...older } = saved;
    const reloaded = await GameSession.load(older as SaveData);
    expect((await reloaded.getView()).days).toHaveLength(0);
    await runTo(reloaded, 22);
    expect((await reloaded.getView()).days).toHaveLength(2);
  });
});

describe('saves and replays (spec G9; Phase 8 acceptance)', () => {
  it('reloads a save to an identical state, which then plays on identically', async () => {
    const game = await GameSession.newGame(producerGame);
    await game.advance(40);
    const saved = await game.save();
    const restored = await GameSession.load(JSON.parse(JSON.stringify(saved)) as SaveData);
    expect(fingerprint(await worldOf(restored))).toBe(fingerprint(saved.world));
    await game.advance(30);
    await restored.advance(30);
    expect(fingerprint(await worldOf(restored))).toBe(fingerprint(await worldOf(game)));
  });

  it('replays the same game at any speed', async () => {
    const sellFast = { kind: 'SET_SETTING', setting: 'selling', value: 'SELL_FAST' } as const;
    const safe = { kind: 'SET_SETTING', setting: 'risk', value: 'SAFE' } as const;

    // One day at a time, as at ×1…
    const slow = await GameSession.newGame(producerGame);
    for (let day = 0; day < 60; day++) {
      if (day === 10) await slow.submit(PLAYER_ID, sellFast);
      if (day === 25) await slow.submit(PLAYER_ID, safe);
      await slow.advance(1);
    }
    // …and in big jumps, as with "advance to next event".
    const fast = await GameSession.newGame(producerGame);
    await runTo(fast, 10);
    await fast.submit(PLAYER_ID, sellFast);
    await runTo(fast, 25);
    await fast.submit(PLAYER_ID, safe);
    await runTo(fast, 60);
    expect(fingerprint(await worldOf(fast))).toBe(fingerprint(await worldOf(slow)));

    const replayed = await GameSession.replay(producerGame, await slow.commandLog(), 60);
    expect(fingerprint(await worldOf(replayed))).toBe(fingerprint(await worldOf(slow)));
    expect((await slow.commandLog()).map((c) => c.tick)).toEqual([11, 26]);
  });
});

describe('the player’s view (spec G5; Phase 8 acceptance: never exposes rival data)', () => {
  it('shows public prices and the player’s own company, and rivals only by name, type and region', async () => {
    const data = await (await GameSession.newGame(producerGame)).save();
    const secret = 987_654_321.25;
    const world = structuredClone(data.world);
    for (const a of world.agents) {
      if (a.agentId === PLAYER_ID) continue;
      (world.totals as { startingCash: number }).startingCash += secret - a.cash;   // keep invariant 2 balanced
      a.cash = secret;
    }
    const game = await GameSession.load({ ...data, world });
    await game.advance(3);
    const view = await game.getView();

    expect(view.company.id).toBe(PLAYER_ID);
    expect(view.markets.map((m) => m.node)).toEqual(['NYMEX', 'NC', 'DME']);
    expect(view.history.length).toBe(4);
    for (const rival of view.rivals) expect(Object.keys(rival).sort()).toEqual(['kind', 'name', 'region']);
    const text = JSON.stringify(view);
    expect(text).not.toContain(String(Math.round(secret)));
    expect(text).not.toContain('987654');
  });

  it('refuses a view for a company that is not in the game', async () => {
    const game = await GameSession.newGame(producerGame);
    await expect(game.getView('nobody' as never)).rejects.toThrow(/No company nobody/);
  });
});
