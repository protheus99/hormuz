// Golden replay harness (spec §14.6, G10). Runs S0 — the core portfolio for a year with no shocks —
// through the real tick orchestrator, and fingerprints the whole world at the end of every day.
// Any change to engine behavior, or any nondeterminism, changes the fingerprints.
//
// It imports only the engine and plain data, never Node, so the same file runs in a browser.

import { CORE_PORTFOLIO } from '../../src/data/portfolios';
import { fingerprint } from '../../src/engine/metrics';
import { createWorld, step, type World } from '../../src/engine/world';

export const GOLDEN_SEED = 'hormuz-golden';
export const GOLDEN_DAYS = 365;

export interface ReplayResult {
  /** Fingerprint of each day's end state, day 1 first. */
  readonly daily: readonly string[];
  /** Fingerprint of the whole run. */
  readonly final: string;
  /** Totals that show the run exercised the engine, for sanity checks. */
  readonly summary: { readonly fills: number; readonly refined: number; readonly fees: number };
}

/** `inspect` receives each day's world, for finding where two runs diverge. */
export function runGoldenReplay(seed = GOLDEN_SEED, days = GOLDEN_DAYS, inspect?: (day: number, world: World) => void): ReplayResult {
  const world = createWorld({ seed, portfolio: CORE_PORTFOLIO });
  const daily: string[] = [];
  let fills = 0;
  for (let day = 1; day <= days; day++) {
    fills += step(world).fills.length;
    inspect?.(day, world);
    daily.push(fingerprint(world));
  }
  return { daily, final: fingerprint(daily), summary: { fills, refined: world.totals.refined, fees: world.ledger.total } };
}
