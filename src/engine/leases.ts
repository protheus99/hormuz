// Leases and the wells on them (spec §12A). A producer's field is no longer one number: it is ground
// with a finite, hidden quantity of oil in it and a handful of wells drawing on that oil. What every
// other rule reads — `extractionCapacity` — is now the sum of what the pumping wells make today, so
// the market rules, the cards and the panels above this file did not have to change.
//
// Stage 1 keeps behaviour identical to the single-field model: wells decline at the same rate the
// field used to, and reserves are drawn down without yet limiting anything. Depletion drives decline
// in stage 2 (§12A.7).

import type { Grade } from './enums';
import { asLeaseId, asWellId, LeaseBand, WellStatus, type Lease, type RegionName, type Well } from './model';

/** Years of a lease's own output that each published band stands for (§12A.2). */
export const BAND_YEARS: Readonly<Record<LeaseBand, number>> = { LOW: 4, MEDIUM: 7, HIGH: 12 };

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
 * A lease with its wells already drilled, each making an equal share of the day's capacity. Reserves
 * follow the band: a HIGH lease holds about twelve years of its own output.
 */
export function newLease(spec: LeaseSpec): Lease {
  const count = Math.max(1, Math.round(spec.wells));
  const reserves = spec.capacity * 365 * BAND_YEARS[spec.band];
  const wells: Well[] = [];
  for (let i = 0; i < count; i++) {
    const rate = spec.capacity / count;
    wells.push({
      wellId: asWellId(`${spec.id}#${i + 1}`),
      initialRate: rate,
      rate,
      cumulative: 0,
      status: WellStatus.PUMPING,
      ticksRemaining: 0,
      daysSinceMaintenance: 0,
    });
  }
  return {
    leaseId: asLeaseId(spec.id),
    name: spec.name,
    region: spec.region,
    grade: spec.grade,
    reserves,
    originalReserves: reserves,
    produced: 0,
    band: spec.band,
    maxWells: Math.max(count, spec.maxWells),
    frackingFactor: 1,
    horizontalFactor: 1,
    waterFactor: 1,
    baseExtractionCost: spec.baseExtractionCost,
    acquiredFor: spec.acquiredFor,
    wells,
  };
}

/**
 * How many wells a field of this size would have been drilled with, and what band its reserves sit
 * in. Both are derived from capacity so the nineteen producers already in the world get leases
 * without any of them being written by hand (§12A.7 stage 1): a bigger field has more wells and,
 * being worth more to appraise, a better-surveyed one.
 */
export function leaseShapeFor(capacity: number): { wells: number; maxWells: number; band: LeaseBand } {
  // 6 wells at 2,000 bbl/day, 12 at 10,000 and above.
  const span = Math.min(1, Math.max(0, (capacity - 2_000) / 8_000));
  const wells = Math.round(STARTING_WELLS.MIN + span * (STARTING_WELLS.MAX - STARTING_WELLS.MIN));
  const band = capacity >= 7_000 ? LeaseBand.HIGH : capacity >= 3_500 ? LeaseBand.MEDIUM : LeaseBand.LOW;
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
 * Sinks `count` new wells on a lease, sharing `totalRate` between them. Stage 2 makes this one well
 * at a time, with dry holes and the lease's own ceiling (§12A.3); for now it matches what the old
 * drilling project did to a field, well for barrel.
 */
export function addWells(lease: Lease, count: number, totalRate: number): void {
  if (count <= 0 || totalRate <= 0) return;
  const rate = totalRate / count;
  for (let i = 0; i < count; i++) {
    lease.wells.push({
      wellId: asWellId(`${lease.leaseId}#${lease.wells.length + 1}`),
      initialRate: rate,
      rate,
      cumulative: 0,
      status: WellStatus.PUMPING,
      ticksRemaining: 0,
      daysSinceMaintenance: 0,
    });
  }
  if (lease.wells.length > lease.maxWells) lease.maxWells = lease.wells.length;
}

/** A day's decline, applied well by well. Stage 2 replaces this with depletion (§12A.7). */
export function declineWells(lease: Lease, rate: number): void {
  for (const w of lease.wells) w.rate *= 1 - rate;
}

/** A day older, for every well that is running. Maintenance and outages are stage 3. */
export function ageWells(lease: Lease): void {
  for (const w of lease.wells) {
    if (w.status === WellStatus.PUMPING) w.daysSinceMaintenance += 1;
    else if (w.ticksRemaining > 0) w.ticksRemaining -= 1;
  }
}
