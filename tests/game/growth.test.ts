// AI growth and difficulty (spec G4.6, G8; Phase 11): rivals take growth decisions too, paid from
// cash; difficulty sets the market report's price and accuracy; "Volatile markets" doubles σ.

import { describe, expect, it } from 'vitest';
import { chooseForAi } from '../../src/ai/scoring';
import { newGameWorld } from '../../src/game/newgame';
import { GameSession } from '../../src/game/session';

describe('AI growth cards (spec G4.6)', () => {
  it('temperament decides how eagerly a rival grows', () => {
    const yesShare = (p: 'CONSERVATIVE' | 'AGGRESSIVE') => Array.from({ length: 1000 }, (_, i) => chooseForAi('ADD_UNIT', p, false, i / 1000)).filter((c) => c === 'YES').length;
    expect(yesShare('AGGRESSIVE')).toBeGreaterThan(yesShare('CONSERVATIVE'));
  });

  it('rivals start growth projects over a year and stay solvent', async () => {
    const s = await GameSession.newGame({ seed: 'growth', playType: 'REFINER', region: 'US_Gulf_Coast', companyName: 'Player' });
    const started = new Set<string>();
    while ((await s.save()).world.tick < 365) {
      await s.advance(365);
      for (const p of (await s.save()).world.projects) if (p.agentId !== 'player') started.add(`${p.agentId}:${p.kind}`);
    }
    const w = (await s.save()).world;
    expect(started.size).toBeGreaterThanOrEqual(3);
    expect(w.insolvencies).toEqual({});
  }, 120_000);
});

describe('difficulty (spec G8)', () => {
  const base = { seed: 'd', playType: 'PRODUCER', region: 'North_Sea', companyName: 'D' } as const;

  it('makes market reports cheaper and more accurate on Easy, dearer and rougher on Hard', () => {
    const easy = newGameWorld({ ...base, difficulty: 'EASY' }).config;
    const normal = newGameWorld(base).config;
    const hard = newGameWorld({ ...base, difficulty: 'HARD' }).config;
    expect([easy.REPORT_COST, normal.REPORT_COST, hard.REPORT_COST]).toEqual([normal.REPORT_COST / 2, 25_000, normal.REPORT_COST * 2]);
    expect(easy.REPORT_NOISE).toBeLessThan(normal.REPORT_NOISE);
    expect(hard.REPORT_NOISE).toBeGreaterThan(normal.REPORT_NOISE);
  });

  it('doubles product price volatility with the Volatile markets modifier', () => {
    const calm = newGameWorld(base).config.PRODUCT_PRICES.SIGMA;
    const wild = newGameWorld({ ...base, volatile: true }).config.PRODUCT_PRICES.SIGMA;
    expect(wild.DIESEL).toBeCloseTo(2 * calm.DIESEL, 12);
    expect(wild.GASOLINE).toBeCloseTo(2 * calm.GASOLINE, 12);
  });
});
