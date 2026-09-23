// Standing actions (spec §12A.5, D54). Eleven of the cards built by Phase 12 were never events at
// all: they are purchases a player makes when they decide to, wearing a decision card's clothes.
// They had deadlines they should not have and four meters that only restated a price.
//
// Here they become offers: always available, no deadline, no meters, and shown in the panel where
// the thing lives — tanks beside the tanks, a refinery beside the refinery, a charter beside the
// cargo. A card, from here on, means something happened.
//
// The catalog keeps the definitions, because they are still the one place that says what a thing
// costs and what buying it does — and because rivals grow by answering these very definitions
// (G4.6). Taking an offer rebuilds it from the world on the day it applies, exactly as answering an
// Opportunity always did, so a replay takes the offer the player was looking at.

import { actionCost } from '../engine/actions';
import type { Agent } from '../engine/model';
import type { World } from '../engine/world';
import { cardText } from '../content/cards';
import { CARD_DEFS, type CardContext } from './cards/catalog';
import { paybackOf, type Payback } from './cards/payback';
import type { AdvisorMemory, CardType, Choice } from './cards/types';

/** Which panel an offer belongs in: where the thing it buys already lives. */
export type OfferPlace = 'TANKS' | 'PLANT' | 'GROUND' | 'CARGO' | 'DEALS' | 'RIVALS' | 'OFFICES' | 'RECORD';

/**
 * The eleven purchases (§12A.5), and the three escapes (§12A.6), which are standing actions of the
 * same shape: things a player does when they decide to, not things that happen to them.
 *
 * The escapes go under the news, which is where the hints arrive. That is the whole point of them —
 * the hint is the window, so the way out belongs beside the letter that told you the window was
 * closing. There is no panel for the record itself, and there must not be: it is hidden.
 */
export const OFFER_PLACES: Readonly<Partial<Record<CardType, OfferPlace>>> = {
  PUT_IT_RIGHT: 'RECORD',
  TELL_THEM_FIRST: 'RECORD',
  RETAIN_COUNSEL: 'RECORD',
  MARKET_REPORT: 'RIVALS',
  FIND_DEAL: 'DEALS',
  EXPAND_STORAGE: 'TANKS',
  EXPAND_TANKS: 'TANKS',
  LEASE_STORAGE: 'TANKS',
  BUILD_REFINERY: 'PLANT',
  UPGRADE_TIER: 'PLANT',
  ADD_UNIT: 'PLANT',
  SECOND_REFINERY: 'PLANT',
  CHARTER_TANKER: 'CARGO',
  OPEN_OFFICE: 'OFFICES',
};

export const OFFER_TYPES: readonly CardType[] = Object.keys(OFFER_PLACES) as CardType[];

/** The eleven purchases alone, for the tests that care about D54's list rather than the shape. */
export const PURCHASE_TYPES: readonly CardType[] = OFFER_TYPES.filter((t) => OFFER_PLACES[t] !== 'RECORD');

export interface OfferChoice {
  /** YES or MAYBE: an offer has no No, because not buying a thing is not an answer. */
  readonly choice: Choice;
  readonly label: string;
  readonly cost: number;
  readonly affordable: boolean;
  /**
   * How long it takes to pay for itself (§12A.8). An offer shows no projected meters — it is a
   * purchase, not a forecast — but what a purchase costs and what it earns back is the arithmetic
   * the decision is actually made on, so it belongs on the button.
   */
  readonly payback: Payback | null;
}

export interface Offer {
  readonly type: CardType;
  readonly where: OfferPlace;
  readonly title: string;
  /** One line on what this is, in the same words the card used. */
  readonly what: string;
  readonly choices: readonly OfferChoice[];
}

/** What a company can do today, wherever it would go looking for it. */
export function offersFor(w: World, memory: AdvisorMemory, me: Agent): Offer[] {
  const offers: Offer[] = [];
  for (const type of OFFER_TYPES) {
    const offer = offerOf(w, memory, me, type);
    if (offer !== null) offers.push(offer);
  }
  return offers;
}

/** One offer as it stands today, or null when there is nothing to offer. */
export function offerOf(w: World, memory: AdvisorMemory, me: Agent, type: CardType): Offer | null {
  const def = CARD_DEFS.get(type);
  const where = OFFER_PLACES[type];
  if (def === undefined || where === undefined || !def.kinds.includes(me.kind)) return null;
  // A standing action takes no draws: it is looked at whenever a player opens a panel, and a world
  // whose luck depended on how often somebody looked at a panel would not replay (G10).
  const ctx: CardContext = { w, me, memory, roll: () => 0 };
  const s = (def.whenAsked ?? def.detect)(ctx);
  if (s === null) return null;
  const text = cardText(type, s.data);
  const { yes, maybe } = def.options(ctx, s);
  const choices: OfferChoice[] = [];
  const add = (choice: Choice, label: string, spec: { readonly actions: readonly { readonly kind: string }[] } | null) => {
    if (spec === null || label === '') return;
    const cost = spec.actions.reduce((sum, a) => sum + actionCost(w, me.agentId, a as never).total, 0);
    choices.push({ choice, label, cost, affordable: cost <= spend(me), payback: paybackOf(w, me, spec.actions as never) });
  };
  add('YES', text.yes, yes);
  add('MAYBE', text.maybe, maybe);
  return choices.length === 0 ? null : { type, where, title: text.title, what: text.situation, choices };
}

/** Cash in hand plus the credit line still unused (spec G4.1 "Affordability"). */
function spend(me: Agent): number {
  return me.cash - me.cashReserved + me.creditLimit - me.creditDrawn;
}
