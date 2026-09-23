// The dilemmas (spec §12A.6, DILEMMAS.md). What these hold to is the shape of the deck rather than
// any one card: the corner is always the Yes, refusing is always free and always safe, and what a
// corner puts on the record is four times what it told the player they were saving.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/actions';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { exposureTotal } from '../../src/engine/exposure';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { wellOf } from '../../src/engine/companies';
import type { Agent, Tick } from '../../src/engine/model';
import { createWorld, type World } from '../../src/engine/world';
import { CARD_DEFS } from '../../src/game/cards/catalog';
import { cardText } from '../../src/content/cards';
import type { CardType } from '../../src/game/cards/types';

const DILEMMAS: CardType[] = ['SERVICE_HOLD', 'MANAGER_HUNCH', 'ORPHAN_WELLS', 'RESERVES_REPORT', 'MINISTRY_FEE'];

const world = (): World => createWorld({ seed: 'dilemmas', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
const producer = (w: World): Agent => w.agents.find((a) => a.kind === 'PRODUCER') as Agent;

/**
 * Which side of each card is the corner. Most are temptations, where saying yes is the corner and
 * refusing costs nothing. One is not: what was on the ground when you bought it is yours whether
 * you touch it or not, so on that card refusing is the corner (DILEMMAS.md, 9).
 */
const CORNER_ON: Readonly<Record<string, 'YES' | 'NO'>> = {
  SERVICE_HOLD: 'YES', MANAGER_HUNCH: 'YES', RESERVES_REPORT: 'YES', MINISTRY_FEE: 'YES', ORPHAN_WELLS: 'NO',
};

describe('the shape of the deck', () => {
  it('puts the corner on exactly one side of every card, and says which', () => {
    for (const type of DILEMMAS) {
      const def = CARD_DEFS.get(type);
      expect(def, type).toBeDefined();
      const w = world();
      const ctx = { w, me: producer(w), memory: null as never, roll: () => 0 };
      const s = def?.detect(ctx) ?? { key: '', data: {} };
      const { yes, no } = def!.options(ctx, s);
      const cuts = (spec: { actions: readonly { kind: string }[] } | undefined) => (spec?.actions ?? []).some((a) => a.kind === 'CUT_CORNER');
      expect(cuts(yes), `${type} Yes`).toBe(CORNER_ON[type] === 'YES');
      expect(cuts(no), `${type} No`).toBe(CORNER_ON[type] === 'NO');
    }
  });

  it('never leaves a corner where nobody chose it: a card with a costly No says so on the card', () => {
    // The one card whose No does something is the one where the liability came with the ground,
    // and the text has to say that plainly rather than springing it later.
    expect(cardText('ORPHAN_WELLS', {}).no).toMatch(/before you/);
  });

  it('states what is certain and counts nothing else', () => {
    for (const type of DILEMMAS) {
      const text = cardText(type, {});
      expect(text.title.length, type).toBeGreaterThan(8);
      // No card tells a player the odds, because four numbers would decide the matter for them.
      expect(`${text.title} ${text.situation}`).not.toMatch(/chance|odds|risk of|per cent|%/i);
    }
  });
});

describe('what a corner costs', () => {
  it('records four times what it saved, and shows the player none of it', () => {
    const w = world();
    const me = producer(w);
    const lease = wellOf(me)!.leases[0]!;
    applyAction(w, me.agentId, { kind: 'CUT_CORNER', amount: 400_000, saved: 100_000, target: { kind: 'LEASE', leaseId: lease.leaseId } });
    expect(exposureTotal(me)).toBe(400_000);
    expect(DEFAULT_CONFIG.EXPOSURE.PER_SAVED).toBe(4);
  });

  it('does the job properly instead, when that is what was asked for', () => {
    const w = world();
    const me = producer(w);
    const cash = me.cash;
    applyAction(w, me.agentId, { kind: 'SERVICE_WELLS', count: 2 });
    const off = wellOf(me)!.leases.flatMap((l) => l.wells).filter((x) => x.status === 'MAINTENANCE');
    expect(off).toHaveLength(2);
    expect(me.cash).toBeLessThan(cash);            // properly, and paid for
    expect(exposureTotal(me)).toBe(0);             // and nothing on the record for it
  });

  it('holds every service off on every lease when a player says to', () => {
    const w = world();
    const me = producer(w);
    applyAction(w, me.agentId, { kind: 'HOLD_SERVICES', days: 60 });
    for (const l of wellOf(me)!.leases) expect(l.serviceHoldUntil).toBe((w.tick + 1 + 60) as Tick);
  });
});
