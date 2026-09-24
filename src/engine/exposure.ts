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
import { buyingPower, wellOf } from './companies';
import { refreshStorage } from './leases';
import { refreshCapacity } from './agents';
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

/**
 * How loudly the world is asking about you, from nothing to a file with your name on it. The hint
 * ladder says it in letters and visits (game/hints.ts); the escapes read it to decide what is still
 * on offer and what it costs. It is never shown as a number and never given a name on screen.
 */
export type Rung = 0 | 1 | 2 | 3 | 4;

export function rungOf(company: Agent, cfg: Config, tick: Tick, daysLeft: number | null = null): Rung {
  if (company.record.length === 0) return 0;
  let oldest = Infinity;
  for (const x of company.record) oldest = Math.min(oldest, x.tick);
  // Nothing follows the same afternoon: a corner has to stand a while before anybody notices it.
  if (tick - oldest < cfg.EXPOSURE.GRACE) return 0;
  const pressure = reckoningChance(company, cfg, daysLeft) / cfg.EXPOSURE.MAX_CHANCE;
  const rungs = cfg.EXPOSURE.RUNGS;
  for (let i = rungs.length - 1; i >= 0; i--) if (pressure >= (rungs[i] as number)) return (i + 1) as Rung;
  return 0;
}

/** The entry that would answer for itself next, which is the one an escape addresses. */
export function nextEntry(company: Agent): ExposureItem | null {
  if (company.record.length === 0) return null;
  return company.record.reduce((first, x) => (x.tick < first.tick ? x : first), company.record[0] as ExposureItem);
}

/**
 * The three ways out (§12A.6). Put it right while it is small, tell them before they find out, or
 * — once a file is open and nothing else is on offer — retain counsel to soften what is taken.
 */
export type EscapeKind = 'PUT_RIGHT' | 'DISCLOSE' | 'COUNSEL';

/** Whether this way out is still open. The window closes as the ladder is climbed. */
export function escapeOffered(company: Agent, kind: EscapeKind, cfg: Config, tick: Tick, daysLeft: number | null = null): boolean {
  if (nextEntry(company) === null) return false;
  const rung = rungOf(company, cfg, tick, daysLeft);
  if (kind === 'COUNSEL') return rung === 4 && !company.counsel;
  return rung < 4;
}

/**
 * What it costs, as a multiple of what the corner saved rather than a margin over it — otherwise
 * cutting corners *planning* to clean up would pay, which is exactly the plan this pricing is meant
 * to lose (§12A.6, rule 1). It gets dearer the longer it is left, which is the whole decision.
 */
export function escapeCost(company: Agent, kind: EscapeKind, cfg: Config, tick: Tick, daysLeft: number | null = null): number {
  const item = nextEntry(company);
  if (item === null) return 0;
  const rung = rungOf(company, cfg, tick, daysLeft);
  const e = cfg.ESCAPE;
  if (kind === 'COUNSEL') return item.saved * e.LATE;
  const base = item.saved * (rung === 0 ? e.EARLY : e.OPEN);
  return kind === 'DISCLOSE' ? base * e.DISCLOSE_EXTRA : base;
}

/** What an escape did, for the telling. */
export interface Escape {
  readonly kind: EscapeKind;
  readonly cost: number;
  /** The thing it dealt with, in the same words a reckoning would have used. */
  readonly what: string;
  /** Days the ground stops while the work is done; zero for the rest. */
  readonly shutTicks: number;
}

/**
 * Takes the way out. Something always remains: an escape turns a reckoning in kind into a cost in
 * money and leaves a residue on the record, so it never returns a company to clean.
 */
export function takeEscape(company: Agent, kind: EscapeKind, cfg: Config, tick: Tick, daysLeft: number | null = null): Escape | null {
  if (!escapeOffered(company, kind, cfg, tick, daysLeft)) return null;
  const item = nextEntry(company);
  if (item === null) return null;
  const cost = escapeCost(company, kind, cfg, tick, daysLeft);
  if (kind === 'COUNSEL') {
    company.counsel = true;
    return { kind, cost, what: describe(company, item), shutTicks: 0 };
  }
  company.record = company.record.filter((x) => x !== item);
  const share = kind === 'DISCLOSE' ? cfg.ESCAPE.DISCLOSE_RESIDUE : cfg.ESCAPE.RESIDUE;
  addExposure(company, { amount: item.amount * share, saved: item.saved * share, tick, target: item.target });
  // Putting a thing right means stopping to do it; telling them first does not.
  let shutTicks = 0;
  if (kind === 'PUT_RIGHT' && item.target.kind === 'LEASE') {
    const lease = wellOf(company)?.leases.find((l) => l.leaseId === (item.target as { leaseId: LeaseId }).leaseId);
    if (lease !== undefined) {
      shutTicks = cfg.ESCAPE.PUT_RIGHT_SHUT;
      lease.shutUntil = Math.max(lease.shutUntil, tick) + shutTicks;
    }
  }
  return { kind, cost, what: describe(company, item), shutTicks };
}

/** What an entry was protecting, in plain words, for a card or a headline. */
export function describe(company: Agent, item: ExposureItem): string {
  switch (item.target.kind) {
    case 'LEASE': {
      const id = item.target.leaseId;
      return wellOf(company)?.leases.find((l) => l.leaseId === id)?.name ?? 'ground you no longer hold';
    }
    case 'LICENCE':
      return `your licence for ${String(item.target.region)}`;
    case 'CREDIT':
      return 'your credit line';
    case 'CASH':
      return 'the matter';
  }
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
  /**
   * Crude standing in the tanks at ground that was taken. It goes with the ground — you do not get
   * to drive it away — so it leaves the world, and the books have to say so (stage 3b, spec §9).
   */
  readonly barrels: number;
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
  // What is taken is taken in kind — the ground, the licence, the line — and the cash penalty
  // follows it. It can take every penny the company can raise and no more: a settlement is not a
  // debt conjured out of nothing. Uncapped, a corner worth $15M on a block came back as a $121.8M
  // bill against $12.6M of cash, and left the company at minus $109M for good, with a day book
  // that read as nonsense (found 2026-09-24, from a player's own game).
  const cost = Math.min(item.amount * cfg.EXPOSURE.PENALTY, Math.max(0, buyingPower(company)));
  company.cash -= cost;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.SETTLEMENT, amount: cost });
  return { item, severity: outcome.severity, cost, what: outcome.what, barrels: outcome.barrels };
}

/**
 * Takes the thing the corner was protecting. A lease goes for good when the entry is a large one and
 * is shut when it is not — the difference between losing the ground and losing a season of it.
 */
function take(company: Agent, item: ExposureItem, cfg: Config): { severity: Severity; what: string; barrels: number } {
  const field = wellOf(company);
  // Counsel retained (escape E6) is spent on whatever arrives next: it does not make the file go
  // away, it argues down what is taken. Once.
  const counsel = company.counsel;
  company.counsel = false;
  switch (item.target.kind) {
    case 'LEASE': {
      const id = item.target.leaseId;
      const lease = field?.leases.find((l) => l.leaseId === id);
      if (lease === undefined) return { severity: 'FINE', what: 'ground you no longer hold', barrels: 0 };
      if (item.amount >= cfg.EXPOSURE.FORFEIT_ABOVE && !counsel) {
        // The crude standing in the tanks there goes with the ground, so it leaves the world and
        // the field's own tank has to be told (stage 3b).
        const barrels = lease.storage + lease.storageEscrow;
        field!.leases = field!.leases.filter((l) => l !== lease);
        // The wells on it stop being this company's, so both derived totals have to be told.
        refreshStorage(field!);
        refreshCapacity(field!);
        return { severity: 'FORFEIT', what: lease.name, barrels };
      }
      // A forfeiture argued down is still a long shutdown: counsel buys the ground back, not the year.
      const days = item.amount >= cfg.EXPOSURE.FORFEIT_ABOVE ? 2 * cfg.EXPOSURE.SHUT_TICKS : cfg.EXPOSURE.SHUT_TICKS;
      lease.shutUntil = (lease.shutUntil > 0 ? lease.shutUntil : 0) + days;
      return { severity: 'SHUT', what: lease.name, barrels: 0 };
    }
    case 'LICENCE': {
      const region = item.target.region;
      if (field === undefined || !field.licences.includes(region)) return { severity: 'FINE', what: 'a licence you do not hold', barrels: 0 };
      if (counsel) return { severity: 'FINE', what: `your licence for ${String(region)}, which you keep`, barrels: 0 };
      field.licences = field.licences.filter((r) => r !== region);
      return { severity: 'REVOKE', what: String(region), barrels: 0 };
    }
    case 'CREDIT':
      // A bank that pulls a line stops you drawing on it; it cannot take back money already
      // advanced. So the limit comes down to what is outstanding and no further — without that
      // floor a company left the day with more drawn than it was allowed, which is invariant 8
      // (found 2026-09-24 by a $0 line carrying $621,896).
      company.creditLimit = Math.max(company.creditDrawn, counsel ? Math.round(company.creditLimit / 2) : 0);
      return { severity: counsel ? 'FINE' : 'WITHDRAW', what: 'your credit line', barrels: 0 };
    case 'CASH':
      return { severity: 'FINE', what: 'a penalty', barrels: 0 };
  }
}
