// The hint ladder (spec §12A.6). A reckoning that arrives out of a clear sky reads as arbitrary, so
// as a company's record grows — and as trouble raises the odds of it coming due — the world starts
// to say so. Letters, visits, questions: alerts and news, never numbers.
//
// The ladder is also what makes the escapes a closing window rather than a shop. Rungs 1 to 3 are
// the window; at rung 4 a file has been opened and only counsel is left (§12A.6, the escapes).
//
// It reads the record but never shows it, it draws from its own stream so it cannot shift anyone's
// luck, and it changes nothing in the world: a hint is economic climate, not an event.

import { rungOf as pressureRung, type Rung } from '../engine/exposure';
import type { Agent } from '../engine/model';
import { nextFloat, rngFor, type Rng } from '../engine/rng';
import type { World } from '../engine/world';
import { HINTS, type HintLine } from '../content/hints';
import type { Severity } from './alerts';

/** Roughly how many days pass between hints at each rung: the higher you are, the less quiet it is. */
const EVERY: Readonly<Record<Exclude<Rung, 0>, number>> = { 1: 30, 2: 20, 3: 12, 4: 7 };

/** How loud each rung is. A file being opened is worth stopping the clock for. */
const LOUDNESS: Readonly<Record<Exclude<Rung, 0>, Severity>> = { 1: 'INFO', 2: 'INFO', 3: 'MEDIUM', 4: 'HIGH' };

/** The shortest gap between two hints, unless the ladder has just been climbed. */
const MIN_GAP = 6;

/** Plain data, saved with the session. */
export interface HintState {
  rng: Rng;
  /** The highest rung told about so far, so climbing is always announced and never twice. */
  high: Rung;
  lastTick: number;
  lastLine: string;
}

export function createHints(seed: string): HintState {
  return { rng: rngFor(`${seed}:hints`, 'events'), high: 0, lastTick: -999, lastLine: '' };
}

/**
 * Where a company stands today. Nothing here reaches a player as a number: the escapes use it to
 * decide what is still on offer, and the ladder uses it to decide what the post brings.
 */
export function rungOf(w: World, me: Agent): Rung {
  return pressureRung(me, w.config, w.tick, daysLeft(w));
}

/** How long this world has left to run, which is part of how hard a reckoning presses (§12A.6). */
export function daysLeft(w: World): number | null {
  return w.horizon === null ? null : w.horizon - w.tick;
}

export interface Hint {
  readonly rung: Exclude<Rung, 0>;
  readonly severity: Severity;
  readonly line: HintLine;
}

/**
 * One day of the economic climate. A hint is given when the ladder is climbed — which is the signal worth
 * having — and otherwise now and then, more often the higher up it is.
 */
export function hintDay(w: World, state: HintState, me: Agent): Hint | null {
  const rung = rungOf(w, me);
  const climbed = rung > state.high;
  state.high = rung;
  if (rung === 0) return null;
  if (!climbed) {
    if (w.tick - state.lastTick < MIN_GAP) return null;
    if (nextFloat(state.rng) >= 1 / EVERY[rung]) return null;
  }
  const line = choose(HINTS[rung], state);
  if (line === undefined) return null;
  state.lastTick = w.tick;
  state.lastLine = line.id;
  return { rung, severity: LOUDNESS[rung], line };
}

/** A line from this rung, never the one said last. */
function choose(lines: readonly HintLine[], state: HintState): HintLine | undefined {
  const fresh = lines.filter((l) => l.id !== state.lastLine);
  const from = fresh.length > 0 ? fresh : lines;
  return from[Math.floor(nextFloat(state.rng) * from.length)];
}
