// The campaign (spec G7.2; Phase 11 acceptance): ten scenarios built from the goal types; the
// always-No bot loses every Medium and Hard scenario; the tutorials can be won; milestones pay
// their rewards; a scenario replays exactly.

import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../src/content/scenarios';
import { fingerprint } from '../../src/engine/metrics';
import { PLAYER_ID } from '../../src/game/newgame';
import { GameSession } from '../../src/game/session';
import { playScenario } from '../../tools/bots';

describe('the scenarios (spec G7.2)', () => {
  it('has three per play type and a finale, each with two or three milestones', () => {
    for (const type of ['PRODUCER', 'REFINER', 'TRADER'] as const) expect(SCENARIOS.filter((s) => s.playType === type)).toHaveLength(3);
    expect(SCENARIOS.filter((s) => s.playType === null).map((s) => s.id)).toEqual(['FINALE']);
    for (const s of SCENARIOS) {
      expect(s.milestones.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.milestones.length, s.id).toBeLessThanOrEqual(3);
    }
  });

  it('features six of the seven chokepoints', () => {
    const featured = new Set(SCENARIOS.flatMap((s) => s.script.flatMap((e) => ('stages' in e ? [e.chokepoint] : []))));
    expect([...featured].sort()).toEqual(['BAB_EL_MANDEB', 'BOSPHORUS', 'HORMUZ', 'MALACCA', 'PANAMA', 'SUEZ']);
  });
});

describe('scripted bots (spec G4.7 check 4)', () => {
  const hard = SCENARIOS.filter((s) => s.level !== 'EASY');
  it.each(hard.map((s) => [s.id]))('the always-No bot loses %s', async (id) => {
    expect((await playScenario(id, 'NO', 'acceptance')).result).toBe('LOST');
  }, 120_000);

  it.each([['P1'], ['R1']] as const)('the tutorial %s can be won by answering Yes', async (id) => {
    expect((await playScenario(id, 'YES', 'acceptance')).result).toBe('WON');
  }, 120_000);
});

describe('playing a scenario', () => {
  it('pays a milestone reward, and replays exactly', async () => {
    const game = await GameSession.newGame({ seed: 'milestone', playType: 'PRODUCER', region: 'US_Permian', companyName: 'Bot', scenario: 'P1' });
    const cashAtStart = (await game.getView()).company.cash;
    for (;;) {
      const r = await game.advance(60);
      for (const c of r.newCards) {
        await game.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: c.id, choice: c.options.some((o) => o.choice === 'YES' && o.affordable) ? 'YES' : 'NO' });
      }
      if ((await game.getView()).campaign?.milestones[0]?.done || r.ended) break;
    }
    const view = await game.getView();
    expect(view.campaign?.milestones[0]).toMatchObject({ done: true, reward: '$250K' });
    expect(view.company.cash).toBeGreaterThan(cashAtStart - 1);

    const saved = await game.save();
    const replayed = await GameSession.replay(saved.settings, await game.commandLog(), saved.world.tick);
    const again = await replayed.save();
    expect(fingerprint(again.world)).toBe(fingerprint(saved.world));
    expect(again.campaign).toEqual(saved.campaign);
  }, 120_000);

  it('ends the game when the scenario is decided', async () => {
    const game = await GameSession.newGame({ seed: 'decided', playType: 'REFINER', region: 'Coastal_Asia', companyName: 'Bot', scenario: 'R1' });
    let r;
    do r = await game.advance(1000); while (!r.ended);
    const view = await game.getView();
    expect(view.campaign?.result).not.toBeNull();
    expect(await game.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: 'risk', value: 'SAFE' })).toEqual({ ok: false, reason: 'The game has ended' });
    expect(view.alerts.some((a) => /^Scenario (won|lost)/.test(a.message))).toBe(true);
  }, 120_000);
});
