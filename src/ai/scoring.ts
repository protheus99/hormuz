// How AI companies answer cards (spec G4.6). They receive the same card types from the same
// detectors but never fork the world: each operating card has a table of how likely each
// temperament is to say Yes, Maybe or No, and one draw from the AI stream picks the answer.
// Conservative leans to the safe choice (service the plant, cut output early), Aggressive to the
// profitable one (keep running, run flat out), Balanced sits between.

import type { Personality } from '../engine/enums';

export type AiChoice = 'YES' | 'MAYBE' | 'NO';

/** [Yes, Maybe, No] weights, summing to 1. */
type Weights = readonly [number, number, number];

const OPERATING: Readonly<Record<string, Readonly<Record<Personality, Weights>>>> = {
  MAINTENANCE_DUE: { CONSERVATIVE: [0.8, 0.2, 0], BALANCED: [0.5, 0.45, 0.05], AGGRESSIVE: [0.25, 0.6, 0.15] },
  BREAKDOWN: { CONSERVATIVE: [0.5, 0.4, 0.1], BALANCED: [0.35, 0.45, 0.2], AGGRESSIVE: [0.6, 0.3, 0.1] },
  PRICES_BELOW_COST: { CONSERVATIVE: [0.6, 0.4, 0], BALANCED: [0.35, 0.5, 0.15], AGGRESSIVE: [0.15, 0.45, 0.4] },
  PRICES_RECOVERED: { CONSERVATIVE: [0.5, 0.5, 0], BALANCED: [0.8, 0.2, 0], AGGRESSIVE: [1, 0, 0] },
  STOCK_LOW: { CONSERVATIVE: [0.7, 0.3, 0], BALANCED: [0.5, 0.35, 0.15], AGGRESSIVE: [0.35, 0.25, 0.4] },
  REFINING_LOSING: { CONSERVATIVE: [0.6, 0.4, 0], BALANCED: [0.3, 0.55, 0.15], AGGRESSIVE: [0.1, 0.4, 0.5] },
  MARGINS_STRONG: { CONSERVATIVE: [0, 0.3, 0.7], BALANCED: [0.15, 0.55, 0.3], AGGRESSIVE: [0.55, 0.45, 0] },
};

/** Card types AI companies answer (spec G4.6: operating cards from Phase 9). */
export const AI_CARD_TYPES: readonly string[] = Object.keys(OPERATING);

/**
 * Growth cards (spec G4.6, Phase 11). Raised ones are answered when they arise; Opportunities are
 * considered once a month, so the odds are monthly. Aggressive companies grow, Conservative ones
 * store and insure.
 */
const GROWTH: Readonly<Record<string, Readonly<Record<Personality, Weights>>>> = {
  WELLS_DECLINING: { CONSERVATIVE: [0.3, 0.5, 0.2], BALANCED: [0.5, 0.4, 0.1], AGGRESSIVE: [0.7, 0.3, 0] },
  EXPORT_CLOSURE_RISK: { CONSERVATIVE: [0.7, 0.3, 0], BALANCED: [0.4, 0.4, 0.2], AGGRESSIVE: [0.1, 0.3, 0.6] },
  UPGRADE_TIER: { CONSERVATIVE: [0.03, 0, 0.97], BALANCED: [0.06, 0, 0.94], AGGRESSIVE: [0.12, 0, 0.88] },
  ADD_UNIT: { CONSERVATIVE: [0.02, 0, 0.98], BALANCED: [0.05, 0, 0.95], AGGRESSIVE: [0.1, 0, 0.9] },
  EXPAND_STORAGE: { CONSERVATIVE: [0.08, 0.1, 0.82], BALANCED: [0.04, 0.08, 0.88], AGGRESSIVE: [0.02, 0.04, 0.94] },
  EXPAND_TANKS: { CONSERVATIVE: [0.08, 0.1, 0.82], BALANCED: [0.04, 0.08, 0.88], AGGRESSIVE: [0.02, 0.04, 0.94] },
  LEASE_STORAGE: { CONSERVATIVE: [0.02, 0.05, 0.93], BALANCED: [0.04, 0.08, 0.88], AGGRESSIVE: [0.08, 0.1, 0.82] },
  OPEN_OFFICE: { CONSERVATIVE: [0.01, 0, 0.99], BALANCED: [0.03, 0, 0.97], AGGRESSIVE: [0.06, 0, 0.94] },
};

export const AI_GROWTH_TYPES: readonly string[] = Object.keys(GROWTH);

/**
 * The AI's answer to a card. `draw` is one uniform number in [0, 1) from the AI stream; a card with
 * no Maybe gives Maybe's weight to Yes. A company without a temperament answers as Balanced.
 */
export function chooseForAi(cardType: string, personality: Personality | null, hasMaybe: boolean, draw: number): AiChoice {
  const table = OPERATING[cardType] ?? GROWTH[cardType];
  if (table === undefined) return 'NO';
  const [yes, maybe] = table[personality ?? 'BALANCED'];
  const yesShare = hasMaybe ? yes : yes + maybe;
  if (draw < yesShare) return 'YES';
  if (hasMaybe && draw < yes + maybe) return 'MAYBE';
  return 'NO';
}
