// Leases and the wells on them (spec §12A). A producer's field is no longer one number: it is ground
// with a finite, hidden quantity of oil in it and a handful of wells drawing on that oil. What every
// other rule reads — `extractionCapacity` — is now the sum of what the pumping wells make today, so
// the market rules, the cards and the panels above this file did not have to change.
//
// A well declines because it is emptying, not because a constant says so. Exponential decline in
// time is the same thing as a straight line in what a well has already lifted, which is why the
// curve here is as simple as it looks: rate = what it first made × the share of its own oil left.

import type { Config } from './config';
import type { Grade } from './enums';
import { asLeaseId, asWellId, LeaseBand, WellStatus, type Lease, type RegionName, type Well } from './model';
import { nextFloat, type Rng } from './rng';

/**
 * Years of a lease's own output that each published band stands for (§12A.2). Five to ten years:
 * long enough that no tutorial ever runs dry, short enough that the three-year finale feels it.
 */
export const BAND_YEARS: Readonly<Record<LeaseBand, number>> = { LOW: 5, MEDIUM: 7, HIGH: 10 };

/** Wells on a lease at the start. Few enough that one well is legible and losing two matters. */
const STARTING_WELLS = { MIN: 6, MAX: 12 } as const;

export interface LeaseSpec {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly grade: Grade;
  /** What the lease's wells make a day between them, at the start. */
  readonly capacity: number;
  readonly band: LeaseBand;
  readonly baseExtractionCost: number;
  readonly acquiredFor: number;
  /** Wells to drill at the start; the rest of `maxWells` is room to grow into. */
  readonly wells: number;
  readonly maxWells: number;
}

/**
 * A lease with its wells already drilled, each making an equal share of the day's capacity and
 * holding an equal share of the ground. Reserves follow the band: a HIGH lease holds ten years of
 * its own output.
 */
export function newLease(spec: LeaseSpec): Lease {
  const count = Math.max(1, Math.round(spec.wells));
  const reserves = spec.capacity * 365 * BAND_YEARS[spec.band];
  const maxWells = Math.max(count, spec.maxWells);
  const lease: Lease = {
    leaseId: asLeaseId(spec.id),
    name: spec.name,
    region: spec.region,
    grade: spec.grade,
    reserves,
    originalReserves: reserves,
    produced: 0,
    attempts: count,
    band: spec.band,
    maxWells,
    frackingFactor: 1,
    horizontalFactor: 1,
    waterFactor: 1,
    baseExtractionCost: spec.baseExtractionCost,
    acquiredFor: spec.acquiredFor,
    wells: [],
  };
  // The wells share the whole lease between them, so the band means what it says: a LOW lease is
  // five years of its own output, however many wells are drawing on it.
  for (let i = 0; i < count; i++) {
    lease.wells.push({
      wellId: asWellId(`${lease.leaseId}#${i + 1}`),
      initialRate: spec.capacity / count,
      rate: spec.capacity / count,
      cumulative: 0,
      recoverable: reserves / count,
      status: WellStatus.PUMPING,
      ticksRemaining: 0,
      daysSinceMaintenance: 0,
    });
  }
  return lease;
}

/**
 * Shares what is left of a lease equally between the wells on it. Wells draw on one reservoir, so
 * sinking another does not find more oil — it takes the same oil out faster, and every well's own
 * share, and with it its rate, gets smaller. That is the bargain infill drilling really offers.
 */
function reshare(lease: Lease): void {
  const live = lease.wells.filter((w) => w.status !== WellStatus.SPENT);
  if (live.length === 0) return;
  const each = lease.reserves / live.length;
  for (const w of live) w.recoverable = w.cumulative + each;
}

/**
 * How many wells a field of this size would have been drilled with, and what band its reserves sit
 * in. Both are derived from capacity so the nineteen producers already in the world get leases
 * without any of them being written by hand: a bigger field has more wells and, being worth more to
 * appraise, a better-surveyed one. Shale holds less oil for the rate it makes, which is why a shale
 * well empties fast — the band, not a separate constant, is where that now lives.
 */
export function leaseShapeFor(capacity: number, shale = false): { wells: number; maxWells: number; band: LeaseBand } {
  // 6 wells at 2,000 bbl/day, 12 at 10,000 and above.
  const span = Math.min(1, Math.max(0, (capacity - 2_000) / 8_000));
  const wells = Math.round(STARTING_WELLS.MIN + span * (STARTING_WELLS.MAX - STARTING_WELLS.MIN));
  const big = capacity >= 7_000;
  const band = shale
    ? (big ? LeaseBand.MEDIUM : LeaseBand.LOW)
    : (big ? LeaseBand.HIGH : capacity >= 3_500 ? LeaseBand.MEDIUM : LeaseBand.LOW);
  return { wells, maxWells: Math.min(STARTING_WELLS.MAX + 4, wells + 4), band };
}

/** What the wells that are actually pumping make today, before the day's swing or any tank limit. */
export function leaseCapacity(lease: Lease): number {
  let total = 0;
  for (const w of lease.wells) if (w.status === WellStatus.PUMPING) total += w.rate;
  return total * lease.frackingFactor * lease.horizontalFactor * lease.waterFactor;
}

/** Every lease's pumping wells: the number every rule above this file reads as the field's size. */
export function capacityOf(leases: readonly Lease[]): number {
  let total = 0;
  for (const lease of leases) total += leaseCapacity(lease);
  return total;
}

/** Oil still in the ground across a company's leases. Engine-only: never shown to a player. */
export function reservesOf(leases: readonly Lease[]): number {
  let total = 0;
  for (const lease of leases) total += lease.reserves;
  return total;
}

/**
 * Takes `barrels` out of the ground, sharing the draw between the pumping wells in proportion to
 * what each makes, and never lifting more than the lease has left. Returns what was actually lifted,
 * which is what the company gets to sell.
 */
export function liftFrom(lease: Lease, barrels: number): number {
  const capacity = leaseCapacity(lease);
  const lifted = Math.min(barrels, lease.reserves, capacity > 0 ? barrels : 0);
  if (lifted <= 0) return 0;
  const share = lifted / capacity;
  for (const w of lease.wells) if (w.status === WellStatus.PUMPING) w.cumulative += w.rate * share;
  lease.reserves -= lifted;
  lease.produced += lifted;
  return lifted;
}

/**
 * Sinks one well, or finds nothing. The best prospects go first, so each well already attempted
 * makes the next likelier to miss (§12A.3). Returns the well, or null for a dry hole — which costs
 * what it cost and leaves the ground as it was.
 */
export function drillWell(lease: Lease, rate: number, cfg: Config, rng: Rng): Well | null {
  if (lease.wells.length >= lease.maxWells || lease.reserves <= 0) return null;
  const chance = Math.max(cfg.DRY_HOLE.FLOOR, cfg.DRY_HOLE.FIRST - cfg.DRY_HOLE.PER_ATTEMPT * lease.attempts);
  lease.attempts += 1;
  if (nextFloat(rng) >= chance) return null;
  const well: Well = {
    wellId: asWellId(`${lease.leaseId}#${lease.wells.length + 1}`),
    initialRate: rate,
    rate,
    cumulative: 0,
    recoverable: 0,
    status: WellStatus.PUMPING,
    ticksRemaining: 0,
    daysSinceMaintenance: 0,
  };
  lease.wells.push(well);
  reshare(lease);
  return well;
}

/**
 * A day's decline, from depletion rather than a constant (§12A.3): a well makes what it first made
 * times the share of its own oil still in the ground. Below `ABANDON_SHARE` it is not worth the
 * pumping and is spent, which is how a lease eventually stops producing at all.
 */
export function depleteWells(lease: Lease, cfg: Config): void {
  for (const w of lease.wells) {
    if (w.status === WellStatus.SPENT || w.recoverable <= 0) continue;
    const left = Math.max(0, 1 - w.cumulative / w.recoverable);
    w.rate = w.initialRate * left;
    if (w.status === WellStatus.PUMPING && left < cfg.ABANDON_SHARE) {
      w.status = WellStatus.SPENT;
      w.rate = 0;
    }
  }
}

/** A day older, for every well that is running. Maintenance and outages are stage 3. */
export function ageWells(lease: Lease): void {
  for (const w of lease.wells) {
    if (w.status === WellStatus.PUMPING) w.daysSinceMaintenance += 1;
    else if (w.ticksRemaining > 0) w.ticksRemaining -= 1;
  }
}
