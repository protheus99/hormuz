// Scripted bots for the campaign checks (spec G4.7): each answers every card the same way.

import { GameSession, PLAYER_ID, SCENARIOS, type ScenarioId } from '../src/game';

/**
 * How a bot answers: always Yes, always No, or by the meters — the option with the best projected
 * profit, preferring the safer one when two are close. The meter bot stands in for a competent
 * player, so "decisions matter" can be told apart from "saying yes to everything".
 */
export type BotPolicy = 'YES' | 'NO' | 'METER';

const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

interface BotOption {
  readonly choice: 'YES' | 'NO' | 'MAYBE';
  readonly affordable: boolean;
  readonly impact: { readonly profit: number; readonly risk: 'LOW' | 'MEDIUM' | 'HIGH'; readonly supply: { readonly value: number; readonly unit: 'days' | 'fill' | '$' } } | null;
}

/** Days of crude below which keeping the plant fed outranks the profit on offer. */
const THIN_SUPPLY_DAYS = 4;

export function answerFor(card: { readonly options: readonly BotOption[] }, policy: BotPolicy): 'YES' | 'NO' | 'MAYBE' {
  if (policy !== 'METER') return card.options.find((o) => o.choice === policy && o.affordable)?.choice ?? 'NO';
  const usable = card.options.filter((o) => o.affordable);
  const days = (o: BotOption) => (o.impact?.supply.unit === 'days' ? o.impact.supply.value : Infinity);
  const thin = usable.some((o) => days(o) < THIN_SUPPLY_DAYS);
  const best = usable.reduce((a, b) => {
    // Running dry costs more than any month's profit, so supply comes first while it is thin.
    if (thin && Math.abs(days(a) - days(b)) > 0.5) return days(b) > days(a) ? b : a;
    const pa = a.impact?.profit ?? 0;
    const pb = b.impact?.profit ?? 0;
    if (Math.abs(pa - pb) < 1000) return RISK_RANK[b.impact?.risk ?? 'LOW'] < RISK_RANK[a.impact?.risk ?? 'LOW'] ? b : a;
    return pb > pa ? b : a;
  }, usable[0] ?? { choice: 'NO' as const, affordable: true, impact: null });
  return best.choice;
}

export interface BotResult {
  readonly result: 'WON' | 'LOST' | null;
  readonly day: number;
  readonly reason: string;
  /** Where each goal stood at the end, won or lost: the numbers a target is tuned against. */
  readonly progress: readonly string[];
}

export async function playScenario(id: ScenarioId, policy: BotPolicy, seed: string): Promise<BotResult> {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) throw new Error(`No scenario ${id}`);
  const game = await GameSession.newGame({ seed, playType: sc.playType ?? 'PRODUCER', region: sc.region ?? 'Middle_East', companyName: 'Bot Oil', scenario: id });
  for (;;) {
    const r = await game.advance(10_000);
    for (const card of r.newCards) {
      await game.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: card.id, choice: answerFor(card, policy) });
    }
    if (r.ended) break;
  }
  const view = await game.getView();
  return {
    result: view.campaign?.result ?? null, day: view.tick, reason: view.campaign?.reason ?? '',
    progress: view.campaign?.conditions.map((c) => c.progress) ?? [],
  };
}
