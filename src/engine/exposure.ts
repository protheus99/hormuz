// What a company has coming to it (spec §12A.6). Every corner cut adds to a hidden figure that
// never decays on its own. It does two things, and the pair of them is the whole point.
//
// It costs something every day it stands: insurers charge more, inspectors come more often, a
// partner is slower to deal. Small enough not to notice, which is why it works.
//
// And it buys a reckoning, whose odds and size both scale with everything accumulated. Cut one
// corner and pay a little, late. Build a career on it and be far ahead for years, then face
// something that ends the company. Paying settles what it punished and nothing more — the record
// does not wash off, it is only worked through.

import type { Config } from './config';
import { FeeKind } from './enums';
import { recordFee, type FeeLedger } from './economics';
import type { Agent, Tick } from './model';
import { nextFloat, type Rng } from './rng';

/** Adds to what a company has coming. Nothing here is ever shown to a player (§12A.6). */
export function addExposure(company: Agent, amount: number): void {
  if (amount > 0) company.exposure += amount;
}

/** The daily cost of standing where you stand: quiet, constant, and not worth reading a meter for. */
export function exposureDrag(company: Agent, cfg: Config): number {
  return company.exposure * cfg.EXPOSURE.DRAG;
}

/** The chance today is the day it catches up. Rises with everything accumulated. */
export function reckoningChance(company: Agent, cfg: Config): number {
  if (company.exposure <= 0) return 0;
  return Math.min(cfg.EXPOSURE.MAX_CHANCE, company.exposure * cfg.EXPOSURE.CHANCE_PER_DOLLAR);
}

export interface Reckoning {
  /** What it cost, paid today. */
  readonly cost: number;
  /** What it settled, which is what leaves the exposure. */
  readonly settled: number;
}

/**
 * One day of living with it: the drag is charged, and a reckoning may arrive. A reckoning takes a
 * multiple of the exposure it punishes, so the longer a company has been at it the more there is to
 * come — and it settles that much, leaving whatever was accumulated since.
 */
export function exposureDay(company: Agent, ledger: FeeLedger, tick: Tick, cfg: Config, rng: Rng): Reckoning | null {
  // A company with a clean record draws nothing at all, so its neighbours' luck is untouched by a
  // system it has no part in. Determinism is a property of the whole world, not of one company.
  if (company.exposure <= 0) return null;
  const roll = nextFloat(rng);
  const drag = exposureDrag(company, cfg);
  if (drag > 0) {
    company.cash -= drag;
    recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.EXPOSURE, amount: drag });
  }
  const chance = reckoningChance(company, cfg);
  if (chance <= 0 || roll >= chance) return null;

  // The same draw, rescaled, sets how much of the record this one answers for.
  const share = cfg.EXPOSURE.SETTLE.min + (roll / chance) * (cfg.EXPOSURE.SETTLE.max - cfg.EXPOSURE.SETTLE.min);
  const settled = company.exposure * share;
  const cost = settled * cfg.EXPOSURE.PENALTY;
  company.exposure -= settled;
  company.cash -= cost;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.SETTLEMENT, amount: cost });
  return { cost, settled };
}
