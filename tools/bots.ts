// Scripted bots for the campaign checks (spec G4.7): each answers every card the same way.

import { GameSession, PLAYER_ID, SCENARIOS, type ScenarioId } from '../src/game';
import { CARD_DEFS } from '../src/game/cards/catalog';
import type { CardType } from '../src/game/cards/types';

/**
 * How a bot answers: always Yes, always No, by the meters, or by the meters while declining every
 * dilemma. `METER` takes the option with the best projected profit, preferring the safer one when
 * two are close, so "decisions matter" can be told apart from "saying yes to everything".
 *
 * It also reads a payback (§12A.8). It has to: thirty days of profit is blank on everything a
 * company buys, so a bot with only those meters never drilled and never bid, and finished the
 * finale mid-pack behind every rival that did. A thing that pays for itself inside
 * `WORTH_BUYING_MONTHS` is worth buying; past that it is not, which is the judgement the economics
 * package is meant to make hard.
 *
 * **`HONEST` exists because `METER` stopped standing for a competent player** (measured 2026-09-27).
 * A dilemma hides its cost from the meters on purpose — the card shows what the corner buys and never
 * what it puts on the record (§12A.6) — so a bot that reads only meters cuts *every* corner in a deck
 * that has grown to seven of them, climbs all four rungs and pays for it. On P2 that was worth about
 * $850M: `METER` won 0 of 3 seeds on $316M, $364M and $1,163M, and `HONEST` won 2 of 3 on $1,167M,
 * $1,236M and $1,211M against the same $1,197M bar. So the D44 band is judged on `HONEST`, which is a
 * competent player who does not cut corners, and `METER` now measures what cutting them costs — a
 * useful number in its own right, and the only one that shows the reckonings working.
 */
export type BotPolicy = 'YES' | 'NO' | 'METER' | 'HONEST';

const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

interface BotCard {
  readonly type: CardType;
  readonly options: readonly BotOption[];
}

interface BotOption {
  readonly choice: 'YES' | 'NO' | 'MAYBE';
  readonly affordable: boolean;
  readonly totalCost: number;
  readonly impact: { readonly profit: number; readonly risk: 'LOW' | 'MEDIUM' | 'HIGH'; readonly supply: { readonly value: number; readonly unit: 'days' | 'fill' | '$' } } | null;
  readonly payback?: { readonly months: number | null; readonly barrels: number } | null;
}

/** Days of crude below which keeping the plant fed outranks the profit on offer. */
const THIN_SUPPLY_DAYS = 4;
/** How long a company will wait for something it buys to pay for itself. Two years. */
const WORTH_BUYING_MONTHS = 24;

export function answerFor(card: BotCard, policy: BotPolicy): 'YES' | 'NO' | 'MAYBE' {
  // A corner is never cut by an honest player, whatever the meters make of it.
  if (policy === 'HONEST' && CARD_DEFS.get(card.type)?.dilemma === true) return 'NO';
  if (policy !== 'METER' && policy !== 'HONEST') return card.options.find((o) => o.choice === policy && o.affordable)?.choice ?? 'NO';
  const usable = card.options.filter((o) => o.affordable);
  const days = (o: BotOption) => (o.impact?.supply.unit === 'days' ? o.impact.supply.value : Infinity);
  const thin = usable.some((o) => days(o) < THIN_SUPPLY_DAYS);
  const best = usable.reduce((a, b) => {
    // Running dry costs more than any month's profit, so supply comes first while it is thin.
    if (thin && Math.abs(days(a) - days(b)) > 0.5) return days(b) > days(a) ? b : a;
    const pa = a.impact?.profit ?? 0;
    const pb = b.impact?.profit ?? 0;
    if (Math.abs(pa - pb) < 1000) {
      // The month says nothing, which on anything you buy is the usual answer. Then it is the
      // payback that decides: the sooner it comes back the better, and never buy what will not.
      const wa = worth(a);
      const wb = worth(b);
      // Never buy what the meter says will not pay for itself. This used to be the comment and not
      // the code: both options came back Infinity, the tie went to whichever looked less risky, and
      // the bot bid $35M on ground its own card said would take 56 months (found 2026-09-24).
      if ((wa === Infinity) !== (wb === Infinity)) return wa === Infinity ? b : a;
      if (wa !== null && wb !== null && wa !== wb) return wb < wa ? b : a;
      // Both are hopeless: take the cheaper, and doing nothing is the cheapest of all.
      if (wa === Infinity && a.totalCost !== b.totalCost) return b.totalCost < a.totalCost ? b : a;
      return RISK_RANK[b.impact?.risk ?? 'LOW'] < RISK_RANK[a.impact?.risk ?? 'LOW'] ? b : a;
    }
    return pb > pa ? b : a;
  }, usable[0] ?? { choice: 'NO' as const, affordable: true, totalCost: 0, impact: null });
  return best.choice;
}

/**
 * Months to pay for itself: a number where the meter can say, Infinity where it says the thing will
 * never pay for itself, and null where it does not apply — buying nothing at all, or buying tanks
 * and tier upgrades, which earn no barrels of their own and so cannot be judged this way.
 */
function worth(o: BotOption): number | null {
  const p = o.payback;
  if (p === undefined || p === null || p.barrels <= 0) return null;
  return p.months === null || p.months > WORTH_BUYING_MONTHS ? Infinity : p.months;
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
