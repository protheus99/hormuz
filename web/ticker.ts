// The news strip under the top bar: one piece of furniture carrying three tiers of news, so that
// what matters is not filed behind a tab with what does not (owner's decision, 2026-09-24).
//
//   Calm     — it crawls: prices, rivals, the world. Nothing here is worth stopping for.
//   Yours    — something about this company is pinned still at the front, and stays pinned until it
//              has been read. The rest carries on behind it.
//   Breaking — the crawl halts, the band grows and turns, and the game is waiting. The motion
//              stopping is the signal: a thing that was moving and is now still is far harder to
//              miss than one more thing that starts.
//
// Nothing here is new to the engine. `advance()` already returns the alert that stopped the clock,
// already written in a sentence, and `Alert.severity` already sorts which tier a thing belongs in.
// The bug this answers was that `web/game.ts` read that return value as a true/false and threw the
// message away, so the game halted and nothing said why.

import type { Alert, PlayerView, Severity } from '../src/game';
import { html, money, words, type Html } from './dom';

/** What the strip remembers between days. Plain data, held by the game screen. */
export interface TickerMemory {
  /** The alert that stopped the clock, held until the player says to carry on. */
  halted: Alert | null;
  /** Alerts about this company that have not been read yet, newest first. */
  pinned: Alert[];
  /** How many of the view's alerts have already been sorted into the tiers above. */
  read: number;
  /** Whether the player has asked the crawl to hold still. */
  held: boolean;
}

export const newTicker = (): TickerMemory => ({ halted: null, pinned: [], read: 0, held: false });

/** Alerts at or above this stay pinned until read; below it they go by in the crawl. */
const PINS_AT: Severity = 'MEDIUM';
const RANK: Readonly<Record<Severity, number>> = { INFO: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
/**
 * Lines of news the crawl carries beside the prices. A fixed number of slots, padded when there are
 * fewer, so the crawl is built once and its words are patched into it: rebuilding sends it back to
 * the left, and news arrives often enough that a shape built from the headlines restarted it every
 * few days (measured in the browser, 2026-09-24).
 */
const LINES = 5;
/** Seconds one item takes to cross, which sets how fast the whole crawl runs. */
const SECONDS_PER_ITEM = 4;
/** Pinned items shown at once; the rest are counted. */
const PINNED_SHOWN = 1;

/**
 * Takes in a day's alerts. `stopped` is what `advance()` said stopped the clock, which outranks
 * everything: it is the one thing the player is not allowed to scroll past.
 */
export function absorb(view: PlayerView, memory: TickerMemory, stopped: Alert | null): void {
  const fresh = view.alerts.slice(memory.read);
  memory.read = view.alerts.length;
  for (const a of fresh) {
    // A new card announces itself in the inbox, with a count in the top bar. Saying it a third time
    // here would spend the strip's attention on the one thing already impossible to miss.
    if (a.message.startsWith('New decision:')) continue;
    if (a === stopped || (stopped !== null && a.tick === stopped.tick && a.message === stopped.message)) continue;
    if (RANK[a.severity] >= RANK[PINS_AT]) memory.pinned.unshift(a);
  }
  if (stopped !== null) memory.halted = stopped;
}

/** The player has read what stopped the clock and wants the day to carry on. */
export function resumed(memory: TickerMemory): void {
  memory.halted = null;
}

/** The player has opened what was pinned, so it stops waiting to be read. */
export function readPinned(memory: TickerMemory): void {
  memory.pinned = [];
}

/**
 * What the strip is made of today, as a string. The game screen rebuilds the strip only when this
 * changes, because rebuilding restarts the crawl from the left — so prices, which move every single
 * day, are patched in place rather than being part of this.
 */
export function shapeOf(view: PlayerView, memory: TickerMemory): string {
  if (memory.halted !== null) return `halt:${memory.halted.tick}:${memory.halted.message}`;
  const pin = memory.pinned[0];
  // Deliberately not the news or the prices: those are patched into the strip that is already
  // there. Only something the crawl cannot be patched into rebuilds it.
  return `run:${memory.held ? 'held' : 'on'}:${view.markets.length}:${pin ? `${pin.tick}:${pin.message}` : ''}`;
}

/** One line of the crawl: a label, a price that is patched in place, and its move. */
export interface Quote {
  readonly id: string;
  readonly label: string;
  readonly price: number;
  readonly then: number;
}

function quotes(view: PlayerView): Quote[] {
  // Yesterday, so the move is the one the day book shows; the panel's own table does a week.
  const before = view.history[view.history.length - 2];
  const out: Quote[] = [];
  for (const m of view.markets) {
    out.push({ id: `m-${m.node}`, label: GRADE_NAMES[m.grade] ?? m.grade, price: m.marker, then: before?.markers[m.node] ?? m.marker });
  }
  for (const [name, price] of Object.entries(view.products)) {
    const then = (before?.products as Record<string, number> | undefined)?.[name] ?? price;
    out.push({ id: `p-${name}`, label: words(name), price, then });
  }
  return out;
}

const GRADE_NAMES: Readonly<Record<string, string>> = { LIGHT_SWEET: 'Light crude', MEDIUM: 'Medium crude', HEAVY_SOUR: 'Heavy crude' };

/** How a price's move reads: which way it went, and by how much. */
export function movement(q: Quote): { readonly way: string; readonly words: string } {
  const move = q.then === 0 ? 0 : (q.price - q.then) / q.then;
  const way = move > 0.0005 ? 'up' : move < -0.0005 ? 'down' : 'flat';
  return { way, words: way === 'flat' ? '—' : `${way === 'up' ? '▲' : '▼'} ${Math.abs(move * 100).toFixed(1)}%` };
}

/**
 * What every slot in the crawl says today: a price, its move, and the words beside them. One place
 * decides it, and `patchTicker` only writes it out, so the two halves of the crawl cannot drift
 * apart and there is no second copy of the rule to keep in step.
 *
 * A strait that is not open is a standing condition rather than a headline, so it comes before the
 * news. There are always `LINES` slots; the ones with nothing to say are hidden.
 */
export function slotsFor(view: PlayerView): {
  readonly quotes: readonly { readonly id: string; readonly price: string; readonly way: string; readonly move: string }[];
  readonly lines: readonly (string | null)[];
} {
  const said = view.chokepoints.filter((c) => c.status !== 'OPEN')
    .map((c) => `${c.displayName} ${words(c.status).toLowerCase()}`);
  for (const n of view.news) said.push(n.headline);
  return {
    quotes: quotes(view).map((q) => {
      const m = movement(q);
      return { id: q.id, price: money(q.price), way: m.way, move: m.words };
    }),
    lines: Array.from({ length: LINES }, (_, i) => said[i] ?? null),
  };
}

/**
 * One pass of the crawl: a slot per price and a fixed run of slots for the words. Every slot is
 * empty here and filled by `patchTicker`, which runs the moment it is mounted, so there is one
 * place that decides what a slot says rather than two that have to agree.
 */
function pass(view: PlayerView, copy: number): Html {
  return html`
    ${quotes(view).map((q) => html`<span class="item" data-quote="${q.id}-${copy}"><b>${q.label}</b>
      <span class="px"></span> <span class="mv"></span></span>`)}
    ${Array.from({ length: LINES }, (_, i) => html`<span class="item" data-line="${i}-${copy}"></span>`)}`;
}

/** How many copies of the crawl there are, so both are written the same. */
const COPIES = [1, 2] as const;

/** Every item twice over, so the crawl meets its own beginning and the loop does not show. */
function crawl(view: PlayerView): { readonly content: Html; readonly seconds: number } {
  const slots = view.markets.length + Object.keys(view.products).length + LINES;
  return { content: html`${pass(view, 1)}${pass(view, 2)}`, seconds: Math.max(20, slots * SECONDS_PER_ITEM) };
}

/** The strip. What it looks like is entirely what tier the day has put it in. */
export function tickerPanel(view: PlayerView, memory: TickerMemory): Html {
  const stopped = memory.halted;
  if (stopped !== null) {
    // Said in one line, with the way out beside it. `aria-live` because the clock stopping is the
    // only thing on this screen a player has no way of anticipating.
    const [headline, ...rest] = stopped.message.split('. ');
    return html`
      <div class="strip band" role="status" aria-live="assertive">
        <span class="tag">BREAKING NEWS</span>
        <div class="said">
          <strong>${(headline ?? stopped.message).replace(/\.$/, '')}</strong>
          ${rest.length > 0 ? html`<span>${rest.join('. ')}</span>` : ''}
        </div>
        <div class="act">
          <a href="#" data-ticker-news>Read more about it in News</a>
          <button class="go" data-ticker-continue>Continue</button>
        </div>
      </div>`;
  }
  const pin = memory.pinned[0];
  const more = memory.pinned.length - PINNED_SHOWN;
  const { content, seconds } = crawl(view);
  return html`
    <div class="strip ${pin ? 'mine' : 'calm'}">
      <span class="tag">${pin ? 'YOUR COMPANY' : 'MARKET'}</span>
      ${pin ? html`<button class="pin" data-ticker-pinned>
        <span class="bead"></span>${pin.message}${more > 0 ? html` <span class="more">+${more}</span>` : ''}</button>` : ''}
      <div class="hold">
        <div class="crawl ${memory.held ? 'held' : ''}" style="animation-duration:${seconds}s">${content}</div>
      </div>
      <button class="stop" data-ticker-hold aria-label="${memory.held ? 'Let the news move again' : 'Stop the news moving'}">
        ${memory.held ? '▶' : '❚❚'}${pin ? '' : ' Hold'}</button>
    </div>`;
}

/**
 * Today's words and prices into a strip that is already on screen, without touching the element the
 * crawl's animation runs on — rebuilding that sends the crawl back to the left, and the news alone
 * was doing it every few days. Both copies are patched the same way, so the two halves stay
 * identical and the seam where the loop meets itself does not show.
 */
export function patchTicker(strip: Element, view: PlayerView): void {
  const { quotes: said, lines } = slotsFor(view);
  for (const q of said) {
    for (const copy of COPIES) {
      const at = strip.querySelector(`[data-quote="${q.id}-${copy}"]`);
      if (at === null) continue;
      const px = at.querySelector('.px');
      if (px !== null) px.textContent = q.price;
      const mv = at.querySelector('.mv');
      if (mv !== null) { mv.className = `mv ${q.way}`; mv.textContent = q.move; }
    }
  }
  lines.forEach((line, i) => {
    for (const copy of COPIES) {
      const at = strip.querySelector(`[data-line="${i}-${copy}"]`);
      if (at === null) continue;
      at.textContent = line ?? '';
      at.toggleAttribute('hidden', line === null);
    }
  });
}
