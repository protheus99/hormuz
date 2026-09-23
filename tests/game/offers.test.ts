// Standing actions (spec §12A.5, D54). Eleven of the cards were purchases wearing a decision card's
// clothes; here they are offers, always available, with no deadline and no meters. What these hold
// to is that the offer a panel shows and the command that takes it are the same thing, and that
// moving the player's route out of Opportunities did not quietly stop the rivals growing.

import { describe, expect, it } from 'vitest';
import { PLAYER_ID } from '../../src/game/newgame';
import { GameSession } from '../../src/game/session';
import { OFFER_PLACES, OFFER_TYPES } from '../../src/game/offers';
import { CARD_DEFS } from '../../src/game/cards/catalog';

const game = (over: Record<string, unknown> = {}) => GameSession.newGame({
  seed: 'offers', companyName: 'Offer Oil', playType: 'REFINER', region: 'US_Gulf_Coast', ...over,
} as never);

describe('what is on offer', () => {
  it('is the eleven purchases, each with a panel to live in', () => {
    expect(OFFER_TYPES).toHaveLength(11);
    for (const type of OFFER_TYPES) {
      expect(CARD_DEFS.get(type), type).toBeDefined();
      expect(OFFER_PLACES[type], type).toBeDefined();
    }
  });

  it('has no deadline, no meters, and no No', async () => {
    const view = await (await game()).getView();
    expect(view.offers.length).toBeGreaterThan(0);
    for (const offer of view.offers) {
      expect(offer.choices.length).toBeGreaterThan(0);
      expect(offer.choices.some((c) => c.choice === 'NO')).toBe(false);
      for (const c of offer.choices) expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('prices each choice, and says what a company cannot afford yet', async () => {
    const s = await game();
    const view = await s.getView();
    const buy = view.offers.find((o) => o.choices.some((c) => c.cost > 0));
    expect(buy).toBeDefined();
    for (const c of buy!.choices) expect(c.affordable).toBe(c.cost <= view.company.cash + view.company.creditLimit);
  });
});

describe('taking one', () => {
  it('buys the thing, and the panel stops offering what is already bought', async () => {
    const s = await game();
    const before = await s.getView();
    const tier = before.offers.find((o) => o.type === 'UPGRADE_TIER');
    expect(tier).toBeDefined();
    const r = await s.submit(PLAYER_ID, { kind: 'TAKE_OFFER', offer: 'UPGRADE_TIER', choice: 'YES' });
    expect(r.ok).toBe(true);
    await s.advance(1);
    const after = await s.getView();
    expect(after.company.projects.some((p) => p.kind === 'TIER')).toBe(true);
    // A project already under way is not offered again while it is being built.
    expect(after.offers.some((o) => o.type === 'UPGRADE_TIER')).toBe(false);
  });

  it('turns down a command for something no longer on offer', async () => {
    const s = await game({ playType: 'PRODUCER', region: 'US_Permian' });
    // A producer has no refinery to upgrade, so this was never on its panels.
    const r = await s.submit(PLAYER_ID, { kind: 'TAKE_OFFER', offer: 'UPGRADE_TIER', choice: 'YES' });
    expect(r.ok).toBe(false);
  });

  it('replays to exactly the same world, though a replay never saw a panel', async () => {
    const s = await game();
    await s.submit(PLAYER_ID, { kind: 'TAKE_OFFER', offer: 'UPGRADE_TIER', choice: 'YES' });
    await s.advance(40);
    const played = await s.save();
    const again = await GameSession.replay(played.settings, await s.commandLog(), played.world.tick);
    expect((await again.save()).world).toEqual(played.world);
  }, 30_000);
});

describe('the rivals still grow (G4.6)', () => {
  it('reads the same definitions the panels do, so nothing stopped when the sheet did', async () => {
    const s = await game();
    await s.advance(365);
    const w = (await s.save()).world;
    const rivals = w.projects.filter((p) => p.agentId !== PLAYER_ID);
    const ever = new Set(rivals.map((p) => `${p.agentId}:${p.kind}`));
    expect(ever.size + w.agents.filter((a) => a.agentId !== PLAYER_ID && a.kind === 'TRADER' && a.offices.length > 1).length).toBeGreaterThan(0);
  }, 120_000);
});
