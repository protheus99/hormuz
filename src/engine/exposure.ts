// What a company has coming to it (spec §12A.6). Every corner cut goes on a hidden record that never
// decays on its own, and the record does three things.
//
// It costs something every day it stands: insurers charge more, inspectors come more often, a
// partner is slower to deal. Small enough not to notice, which is why it works.
//
// It follows trouble. The odds of it coming due rise when cash is short and when a scenario's end is
// near — the same expected cost, felt far more sharply, and true to how investigations actually
// arrive: when a company is already struggling, people talk.
//
// And it takes what the corner was protecting, not money. A fine is a line item at any size: $1M of
// exposure carried three years costs about 1.3% of what a producer earns, and a third of the time
// nothing at all. So every entry carries what it was for, and the reckoning reads it — the lease you
// kept pumping is shut, the block you cheated for is forfeited with the oil still under it.

import type { Config } from './config';
import { FeeKind } from './enums';
import { recordFee, type FeeLedger } from './economics';
import { wellOf } from './companies';
import type { Agent, LeaseId, RegionName, Tick } from './model';
import { nextFloat, type Rng } from './rng';

/** What a corner was protecting, and therefore what a reckoning takes. */
export type ExposureTarget =
  | { readonly kind: 'LEASE'; readonly leaseId: LeaseId }
  | { readonly kind: 'LICENCE'; readonly region: RegionName }
  | { readonly kind: 'CREDIT' }
  | { readonly kind: 'CASH' };

/** One entry on the record. Engine-only: no part of this ever reaches a player. */
export interface ExposureItem {
  readonly amount: number;
  readonly target: ExposureTarget;
  /** The day it went on the record, so an escape can be priced by how long it has been left. */
  readonly tick: Tick;
  /** What the corner saved, which is what an escape is priced against (§12A.6). */
  readonly saved: number;
}

/** Everything a company has coming to it. */
export function exposureTotal(company: Agent): number {
  let total = 0;
  for (const item of company.record) total += item.amount;
  return total;
}

/** Puts a corner on the record, with what it was protecting. */
export function addExposure(company: Agent, item: ExposureItem): void {
  if (item.amount > 0) company.record.push(item);
}

/** The daily cost of standing where you stand: quiet, constant, not worth reading a meter for. */
export function exposureDrag(company: Agent, cfg: Config): number {
  return exposureTotal(company) * cfg.EXPOSURE.DRAG;
}

/**
 * How much trouble a company is in, from nothing to everything. A reckoning follows trouble, so
 * this multiplies the odds: short of cash, or near the end of a scenario with the record still
 * open, is when a file gets opened.
 */
export function troubleFactor(company: Agent, cfg: Config, daysLeft: number | null): number {
  let factor = 1;
  const room = company.creditLimit > 0 ? (company.cash + company.creditLimit - company.creditDrawn) / company.creditLimit : 1;
  if (room < 1) factor *= 1 + cfg.EXPOSURE.TROUBLE.CASH * (1 - Math.max(0, room));
  if (daysLeft !== null && daysLeft < cfg.EXPOSURE.TROUBLE.CLOSING_DAYS) {
    factor *= 1 + cfg.EXPOSURE.TROUBLE.CLOSING * (1 - daysLeft / cfg.EXPOSURE.TROUBLE.CLOSING_DAYS);
  }
  return factor;
}

/** The chance today is the day it catches up. Rises with the record, and with trouble. */
export function reckoningChance(company: Agent, cfg: Config, daysLeft: number | null = null): number {
  const total = exposureTotal(company);
  if (total <= 0) return 0;
  const base = total * cfg.EXPOSURE.CHANCE_PER_DOLLAR * troubleFactor(company, cfg, daysLeft);
  return Math.min(cfg.EXPOSURE.MAX_CHANCE, base);
}

export type Severity = 'FINE' | 'SHUT' | 'FORFEIT' | 'REVOKE' | 'WITHDRAW';

export interface Reckoning {
  /** The entry that came due; it leaves the record. */
  readonly item: ExposureItem;
  /** What was done about it, and what it cost in cash on top. */
  readonly severity: Severity;
  readonly cost: number;
  /** For the telling: which block, which region. */
  readonly what: string;
}

/**
 * One day of living with it: the drag is charged, and a reckoning may arrive. When one does, the
 * oldest entry on the record answers for itself — the thing it was protecting is taken, and a cash
 * penalty follows it. What is settled leaves the record; what was added since does not.
 */
export function exposureDay(
  company: Agent, ledger: FeeLedger, tick: Tick, cfg: Config, rng: Rng, daysLeft: number | null = null,
): Reckoning | null {
  // A company with a clean record draws nothing at all, so its neighbours' luck is untouched by a
  // system it has no part in. Determinism is a property of the whole world, not of one company.
  if (company.record.length === 0) return null;
  const roll = nextFloat(rng);
  const drag = exposureDrag(company, cfg);
  if (drag > 0) {
    company.cash -= drag;
    recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.EXPOSURE, amount: drag });
  }
  const chance = reckoningChance(company, cfg, daysLeft);
  if (chance <= 0 || roll >= chance) return null;

  // The oldest first: what you did years ago is what finally catches up.
  const item = company.record.reduce((worst, x) => (x.tick < worst.tick ? x : worst), company.record[0] as ExposureItem);
  company.record = company.record.filter((x) => x !== item);

  const outcome = take(company, item, cfg);
  const cost = item.amount * cfg.EXPOSURE.PENALTY;
  company.cash -= cost;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.SETTLEMENT, amount: cost });
  return { item, severity: outcome.severity, cost, what: outcome.what };
}

/**
 * Takes the thing the corner was protecting. A lease goes for good when the entry is a large one and
 * is shut when it is not — the difference between losing the ground and losing a season of it.
 */
function take(company: Agent, item: ExposureItem, cfg: Config): { severity: Severity; what: string } {
  const field = wellOf(company);
  switch (item.target.kind) {
    case 'LEASE': {
      const id = item.target.leaseId;
      const lease = field?.leases.find((l) => l.leaseId === id);
      if (lease === undefined) return { severity: 'FINE', what: 'ground you no longer hold' };
      if (item.amount >= cfg.EXPOSURE.FORFEIT_ABOVE) {
        field!.leases = field!.leases.filter((l) => l !== lease);
        return { severity: 'FORFEIT', what: lease.name };
      }
      lease.shutUntil = (lease.shutUntil > 0 ? lease.shutUntil : 0) + cfg.EXPOSURE.SHUT_TICKS;
      return { severity: 'SHUT', what: lease.name };
    }
    case 'LICENCE': {
      const region = item.target.region;
      if (field === undefined || !field.licences.includes(region)) return { severity: 'FINE', what: 'a licence you do not hold' };
      field.licences = field.licences.filter((r) => r !== region);
      return { severity: 'REVOKE', what: String(region) };
    }
    case 'CREDIT':
      company.creditLimit = 0;
      return { severity: 'WITHDRAW', what: 'your credit line' };
    case 'CASH':
      return { severity: 'FINE', what: 'a penalty' };
  }
}
