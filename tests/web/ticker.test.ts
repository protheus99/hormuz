// The news strip (spec G3): three tiers in one piece of furniture. What these hold to is the rules
// rather than the pixels — which tier a day's news lands in, that the one thing that stopped the
// clock cannot be scrolled past, and that the crawl is not rebuilt for anything it can be patched
// with, because rebuilding sends it back to the left.

import { describe, expect, it } from 'vitest';
import type { Alert, PlayerView } from '../../src/game';
import { absorb, movement, newTicker, readPinned, resumed, shapeOf, slotsFor, tickerPanel } from '../../web/ticker';

const alert = (message: string, severity: Alert['severity'], tick = 1): Alert => ({ tick, severity, message });

/** Only the parts of a view the strip reads. Everything else it never touches. */
function view(over: Partial<PlayerView> = {}): PlayerView {
  return {
    alerts: [],
    news: [],
    chokepoints: [],
    markets: [{ node: 'NYMEX', grade: 'LIGHT_SWEET', marker: 80 }],
    products: { GASOLINE: 95, DIESEL: 100, FUEL_OIL: 55 },
    history: [{ markers: { NYMEX: 76 }, products: { GASOLINE: 95, DIESEL: 100, FUEL_OIL: 55 } }, { markers: { NYMEX: 80 }, products: {} }],
    ...over,
  } as unknown as PlayerView;
}

describe('which tier a day lands in', () => {
  it('pins what is about the company, and lets the rest go by in the crawl', () => {
    const memory = newTicker();
    absorb(view({ alerts: [alert('Two wells have stopped', 'MEDIUM'), alert('A price moved', 'INFO')] }), memory, null);
    expect(memory.pinned.map((a) => a.message)).toEqual(['Two wells have stopped']);
    expect(memory.halted).toBeNull();
  });

  it('holds what stopped the clock above everything else', () => {
    const memory = newTicker();
    const stopped = alert('The Suez Canal is closed to shipping', 'CRITICAL');
    absorb(view({ alerts: [stopped, alert('Two wells have stopped', 'MEDIUM')] }), memory, stopped);
    expect(memory.halted).toBe(stopped);
    // And it is not also pinned: one thing said once.
    expect(memory.pinned.map((a) => a.message)).toEqual(['Two wells have stopped']);
  });

  it('leaves a new decision to the inbox, which already announces it twice over', () => {
    const memory = newTicker();
    absorb(view({ alerts: [alert('New decision: The service you can postpone', 'INFO')] }), memory, null);
    expect(memory.pinned).toHaveLength(0);
  });

  it('takes each alert once, however many days pass between looks', () => {
    const memory = newTicker();
    const one = alert('Two wells have stopped', 'MEDIUM', 1);
    const two = alert('Your refinery has broken down', 'HIGH', 2);
    absorb(view({ alerts: [one] }), memory, null);
    absorb(view({ alerts: [one, two] }), memory, null);
    expect(memory.pinned.map((a) => a.message)).toEqual(['Your refinery has broken down', 'Two wells have stopped']);
  });

  it('clears what stopped the clock when the player carries on, and the pins when they are read', () => {
    const memory = newTicker();
    const stopped = alert('The Suez Canal is closed to shipping', 'CRITICAL');
    absorb(view({ alerts: [stopped, alert('Two wells have stopped', 'MEDIUM')] }), memory, stopped);
    resumed(memory);
    expect(memory.halted).toBeNull();
    expect(memory.pinned).toHaveLength(1);        // reading one is not reading the other
    readPinned(memory);
    expect(memory.pinned).toHaveLength(0);
  });
});

describe('what the strip is rebuilt for (and what it is not)', () => {
  it('is not rebuilt when only the news or the prices move', () => {
    const memory = newTicker();
    const before = shapeOf(view(), memory);
    const after = shapeOf(view({
      news: [{ tick: 4, headline: 'Shipping insurers watch the Strait of Hormuz', body: '' }],
      markets: [{ node: 'NYMEX', grade: 'LIGHT_SWEET', marker: 91.4 }],
    } as unknown as Partial<PlayerView>), memory);
    // Both are patched into the strip that is already there. Rebuilding for them would send the
    // crawl back to the left every few days, which is what the browser showed it doing.
    expect(after).toBe(before);
  });

  it('is rebuilt when the tier changes, when a pin changes, and when the crawl is held', () => {
    const memory = newTicker();
    const calm = shapeOf(view(), memory);
    absorb(view({ alerts: [alert('Two wells have stopped', 'MEDIUM')] }), memory, null);
    const pinned = shapeOf(view(), memory);
    expect(pinned).not.toBe(calm);
    memory.held = true;
    expect(shapeOf(view(), memory)).not.toBe(pinned);
    memory.held = false;
    absorb(view({ alerts: [] }), memory, alert('The Suez Canal is closed to shipping', 'CRITICAL'));
    expect(shapeOf(view(), memory)).not.toBe(pinned);
  });
});

describe('what the crawl says', () => {
  it('puts a strait that is not open before the headlines, because it is still true', () => {
    const { lines } = slotsFor(view({
      chokepoints: [{ name: 'SUEZ', displayName: 'Suez Canal', status: 'CLOSED', surcharge: 0, extraDays: 0 }],
      news: [{ tick: 4, headline: 'A refinery restarts', body: '' }],
    } as unknown as Partial<PlayerView>));
    expect(lines.slice(0, 2)).toEqual(['Suez Canal closed', 'A refinery restarts']);
  });

  it('reads a price move as up, down or flat, and never as a move of nothing', () => {
    expect(movement({ id: 'x', label: 'Light crude', price: 80, then: 76 })).toMatchObject({ way: 'up' });
    expect(movement({ id: 'x', label: 'Light crude', price: 76, then: 80 })).toMatchObject({ way: 'down' });
    expect(movement({ id: 'x', label: 'Light crude', price: 80, then: 80 })).toEqual({ way: 'flat', words: '—' });
    expect(movement({ id: 'x', label: 'Light crude', price: 80, then: 0 })).toEqual({ way: 'flat', words: '—' });
  });

  it('gives the two copies of the crawl one set of slots, so they cannot drift apart', () => {
    const v = view({ news: [{ tick: 4, headline: 'A refinery restarts', body: '' }] } as unknown as Partial<PlayerView>);
    const built = tickerPanel(v, newTicker()).__html;
    const ids = (copy: number) => [...built.matchAll(new RegExp(`data-(?:quote|line)="([^"]+)-${copy}"`, 'g'))].map((m) => m[1]);
    // Both halves carry the same slots in the same order, and `slotsFor` writes one value into
    // both, which is what keeps the seam where the loop meets itself from showing.
    expect(ids(1)).toEqual(ids(2));
    expect(ids(1).length).toBeGreaterThan(0);
  });

  it('keeps a slot for every line whether or not there is one to say', () => {
    const quiet = slotsFor(view());
    const busy = slotsFor(view({ news: [{ tick: 4, headline: 'A refinery restarts', body: '' }] } as unknown as Partial<PlayerView>));
    // The same number either way: a slot with nothing in it is hidden, not left out, so the crawl
    // never has to be rebuilt just because a headline arrived.
    expect(quiet.lines).toHaveLength(busy.lines.length);
    expect(quiet.lines.every((x) => x === null)).toBe(true);
    expect(busy.lines[0]).toBe('A refinery restarts');
    expect(busy.lines.slice(1).every((x) => x === null)).toBe(true);
  });

  it('writes today’s price and move into the slot the crawl already has', () => {
    const { quotes } = slotsFor(view());
    expect(quotes[0]).toMatchObject({ id: 'm-NYMEX', price: '$80.00', way: 'up' });
    expect(quotes[0]?.move).toContain('5.3%');
  });
});

describe('the breaking band', () => {
  const memory = newTicker();
  absorb(view(), memory, alert('Quail Draw has been taken back. The licence to work it is cancelled.', 'CRITICAL'));
  const out = tickerPanel(view(), memory).__html;

  it('says what happened, offers the way on, and tells a reader it is there', () => {
    expect(out).toContain('BREAKING NEWS');
    expect(out).toContain('Quail Draw has been taken back');
    expect(out).toContain('The licence to work it is cancelled.');
    expect(out).toContain('Read more about it in News');
    expect(out).toContain('Continue');
    expect(out).toContain('aria-live="assertive"');
  });

  it('carries no crawl at all: what stopped the game does not scroll past', () => {
    expect(out).not.toContain('class="crawl');
  });
});
