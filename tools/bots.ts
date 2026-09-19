// Scripted bots for the campaign checks (spec G4.7): each answers every card the same way.

import { GameSession, PLAYER_ID, SCENARIOS, type ScenarioId } from '../src/game';

export type BotPolicy = 'YES' | 'NO';

export interface BotResult {
  readonly result: 'WON' | 'LOST' | null;
  readonly day: number;
  readonly reason: string;
}

export async function playScenario(id: ScenarioId, policy: BotPolicy, seed: string): Promise<BotResult> {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) throw new Error(`No scenario ${id}`);
  const game = await GameSession.newGame({ seed, playType: sc.playType ?? 'PRODUCER', region: sc.region ?? 'Middle_East', companyName: 'Bot Oil', scenario: id });
  for (;;) {
    const r = await game.advance(10_000);
    for (const card of r.newCards) {
      const choice = card.options.find((o) => o.choice === policy && o.affordable)?.choice ?? 'NO';
      await game.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: card.id, choice });
    }
    if (r.ended) break;
  }
  const view = await game.getView();
  return { result: view.campaign?.result ?? null, day: view.tick, reason: view.campaign?.reason ?? '' };
}
