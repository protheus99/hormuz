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
import { asLeaseId, asWellId, LeaseBand, WellStatus, type Agent, type Lease, type RegionName, type Tick, type Well, type WellState } from './model';
import { nextFloat, type Rng } from './rng';
import { FeeKind } from './enums';
import { recordFee, type FeeLedger } from './economics';

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
 * holding oil of its own. Reserves follow the band: a HIGH lease holds ten years of the output of a
 * *fully drilled* block, which is what its free slots are — oil nothing is yet reaching.
 */
export function newLease(spec: LeaseSpec): Lease {
  const count = Math.max(0, Math.round(spec.wells));
  const maxWells = Math.max(count, spec.maxWells, 1);
  // What one slot on this block makes. An auction lot is described by what it would make fully
  // drilled (`notionalCapacity` is `maxWells × DRILL_STEP`); a field already pumping is described by
  // what the wells on it make today. Both come to the same thing per slot.
  const perSlot = count > 0 ? spec.capacity / count : spec.capacity / maxWells;
  const reserves = perSlot * maxWells * 365 * BAND_YEARS[spec.band];
  const lease: Lease = {
    leaseId: asLeaseId(spec.id),
    name: spec.name,
    region: spec.region,
    grade: spec.grade,
    reserves,
    originalReserves: reserves,
    produced: 0,
    lost: 0,
    serviceHoldUntil: 0 as Tick,
    shutUntil: 0 as Tick,
    storage: 0,
    storageEscrow: 0,
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
  // Each well holds years of its own output, which is what the band means: a LOW well is five
  // years of what it first made. Oil under a slot nothing has been sunk into yet is in `reserves`
  // and reached by nobody — that is what a free slot is worth, and what drilling one buys.
  for (let i = 0; i < count; i++) {
    lease.wells.push({
      wellId: asWellId(`${lease.leaseId}#${i + 1}`),
      initialRate: perSlot,
      rate: perSlot,
      cumulative: 0,
      recoverable: perSlot * 365 * BAND_YEARS[spec.band],
      status: WellStatus.PUMPING,
      ticksRemaining: 0,
      daysSinceMaintenance: 0,
    });
  }
  return lease;
}

/**
 * Oil under this block that no well reaches yet: what is left, less what the live wells still hold
 * between them. A new well draws on this and on nothing else, which is why sinking one finds oil
 * rather than sharing out what the others were already drawing (2026-09-24).
 *
 * It was the other way round until then — one pot divided equally among however many wells — and
 * the arithmetic of that is fatal: a programme cost $5.63M, added rate, added no barrels, and made
 * every well already there decline faster. Drilling could not pay, and the payback meter said it
 * could. Three scenario targets could not be set while that was true.
 */
export function unreached(lease: Lease): number {
  let held = 0;
  for (const w of lease.wells) if (w.status !== WellStatus.SPENT) held += Math.max(0, w.recoverable - w.cumulative);
  return Math.max(0, lease.reserves - held);
}

/**
 * How many wells a field of this size would have been drilled with, and what band its reserves sit
 * in. Both are derived from capacity so the nineteen producers already in the world get leases
 * without any of them being written by hand: a bigger field has more wells and, being worth more to
 * appraise, a better-surveyed one. Shale holds less oil for the rate it makes, which is why a shale
 * well empties fast — the band, not a separate constant, is where that now lives.
 */
export function leaseShapeFor(capacity: number, shale = false): { wells: number; maxWells: number; band: LeaseBand } {
  // 6 wells at 40_000 bbl/day, 12 at 200_000 and above.
  const span = Math.min(1, Math.max(0, (capacity - 40_000) / 160_000));
  const wells = Math.round(STARTING_WELLS.MIN + span * (STARTING_WELLS.MAX - STARTING_WELLS.MIN));
  const big = capacity >= 140_000;
  const band = shale
    ? (big ? LeaseBand.MEDIUM : LeaseBand.LOW)
    : (big ? LeaseBand.HIGH : capacity >= 70_000 ? LeaseBand.MEDIUM : LeaseBand.LOW);
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

/**
 * Where a drilling programme should go: ground with room for another well and the most oil still
 * under it. A block bought at auction has every slot free, so it is drilled before an old lease is
 * crowded further — which is what a company would actually do.
 */
export function bestLeaseToDrill(leases: readonly Lease[]): Lease | undefined {
  let best: Lease | undefined;
  let most = 0;
  for (const lease of leases) {
    if (lease.wells.length >= lease.maxWells) continue;
    const room = unreached(lease);
    if (room <= 0) continue;
    if (best === undefined || room > most) { best = lease; most = room; }
  }
  return best;
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
  const room = unreached(lease);
  if (lease.wells.length >= lease.maxWells || room <= 0) return null;
  const chance = Math.max(cfg.DRY_HOLE.FLOOR, cfg.DRY_HOLE.FIRST - cfg.DRY_HOLE.PER_ATTEMPT * lease.attempts);
  lease.attempts += 1;
  if (nextFloat(rng) >= chance) return null;
  const well: Well = {
    wellId: asWellId(`${lease.leaseId}#${lease.wells.length + 1}`),
    initialRate: rate,
    rate,
    cumulative: 0,
    // Years of its own output, as the band says — but never more oil than the block still has
    // nobody reaching, so the last slots on a picked-over lease are worth less than the first.
    recoverable: Math.min(rate * 365 * BAND_YEARS[lease.band], room),
    status: WellStatus.PUMPING,
    ticksRemaining: 0,
    daysSinceMaintenance: 0,
  };
  lease.wells.push(well);
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

/**
 * The chance a well fails today, rising with the time since it was last serviced — the same shape
 * as a refinery's (§12A.3). A well left alone long enough will find a way to stop.
 */
export function wellHazard(well: Well, cfg: Config): number {
  return cfg.WELL.BASE_HAZARD * (1 + well.daysSinceMaintenance / cfg.WELL.MAINT_INTERVAL) ** cfg.HAZARD_EXPONENT;
}

/**
 * Pays a crew to come sooner for every well of this lease that is waiting on one, and returns what
 * it cost. Overtime is priced by the days it buys, so bringing four wells back a week early costs
 * four weeks of it (§12A.3).
 */
export function rushCrews(lease: Lease, owner: Agent, days: number, ledger: FeeLedger, tick: Tick, cfg: Config): number {
  let bought = 0;
  for (const well of lease.wells) {
    if (well.status !== WellStatus.DOWN) continue;
    const saved = Math.min(days, well.ticksRemaining);
    well.ticksRemaining -= saved;
    bought += saved;
    if (well.ticksRemaining === 0) well.status = WellStatus.PUMPING;
  }
  const cost = bought * cfg.WELL.RUSH_COST;
  charge(owner, ledger, tick, FeeKind.WORKOVER, cost);
  return cost;
}

/**
 * Loses a well for good (§12A.3): it stops, and the ground it would have drained stays where it is.
 * Those barrels are neither lifted nor left to another well — they are written off, which is why a
 * lease keeps a `lost` figure and the conservation invariant counts it alongside the rest.
 */
export function destroyWell(lease: Lease, well: Well): number {
  if (well.status === WellStatus.SPENT) return 0;
  const stranded = Math.max(0, Math.min(well.recoverable - well.cumulative, lease.reserves));
  well.status = WellStatus.SPENT;
  well.rate = 0;
  well.ticksRemaining = 0;
  lease.reserves -= stranded;
  lease.lost += stranded;
  return stranded;
}

/**
 * A day of upkeep for every well on a lease. Work in progress counts down; a well due a service
 * goes down for one; and a running well may fail and wait for a workover crew. Exactly one draw is
 * taken per well per day, whatever it is doing, so one well's luck never shifts another's.
 *
 * The player does not switch any of this: they see the board and answer cards about policy (§12A.3).
 */
export function advanceWells(lease: Lease, owner: Agent, rng: Rng, ledger: FeeLedger, tick: Tick, cfg: Config): void {
  // Ground shut by order pumps nothing, whatever state its wells are in (§12A.6). The wells keep
  // their places; they are simply not allowed to work, and they do not deplete while they wait.
  const shut = tick < lease.shutUntil;
  for (const well of lease.wells) {
    const roll = nextFloat(rng);
    if (well.status === WellStatus.SPENT) continue;
    if (shut) { well.status = WellStatus.SHUT; continue; }
    if (well.status === WellStatus.SHUT) { well.status = WellStatus.PUMPING; continue; }
    if (well.ticksRemaining > 0) {
      well.ticksRemaining -= 1;
      if (well.ticksRemaining === 0) {
        if (well.status === WellStatus.MAINTENANCE) well.daysSinceMaintenance = 0;
        well.status = WellStatus.PUMPING;
      }
      continue;
    }
    if (well.status !== WellStatus.PUMPING) { well.status = WellStatus.PUMPING; continue; }

    well.daysSinceMaintenance += 1;
    // A service can be held off at the player's word (§12A.3). The hazard keeps climbing while it is.
    if (well.daysSinceMaintenance >= cfg.WELL.MAINT_INTERVAL && tick >= lease.serviceHoldUntil) {
      well.status = WellStatus.MAINTENANCE;
      well.ticksRemaining = cfg.WELL.MAINT_TICKS;
      charge(owner, ledger, tick, FeeKind.WELL_SERVICE, cfg.WELL.MAINT_COST * well.rate);
      continue;
    }
    const hazard = wellHazard(well, cfg);
    if (roll < hazard) {
      // The same draw, rescaled, sets how long it waits, so the stream stays one draw a day.
      const { min, max } = cfg.WELL.WORKOVER_TICKS;
      well.status = WellStatus.DOWN;
      well.ticksRemaining = min + Math.min(max - min, Math.floor((roll / hazard) * (max - min + 1)));
      charge(owner, ledger, tick, FeeKind.WORKOVER, cfg.WELL.WORKOVER_COST * well.rate);
    }
  }
}


// ── Tanks (stage 3b) ─────────────────────────────────────────────────────────────────────
//
// Oil stands where it was lifted, because a barrel in one region cannot be loaded in another. The
// field's own `storage` and `storageEscrow` are the sums of what stands at each lease, refreshed
// whenever either moves — the same derived-aggregate pattern that let leases land without touching
// a rule above the engine (§12A.2).

/**
 * A lease's share of the company's tankage, by what its wells were drilled to make. Not by what
 * they made today — a lease whose wells are all down for a service does not lose its tank farm that
 * morning — and not by its slots either, or ground bought empty at auction would take half the
 * tanks off the field that is actually pumping into them.
 */
export function tankOf(well: WellState, lease: Lease): number {
  const size = (l: Lease) => l.wells.reduce((sum, w) => sum + w.initialRate, 0);
  const all = well.leases.reduce((sum, l) => sum + size(l), 0);
  if (all <= 0) return well.leases.length > 0 ? well.storageCapacity / well.leases.length : 0;
  return well.storageCapacity * (size(lease) / all);
}

/** Room left at one lease, counting what today's asks have locked. */
export function roomAt(well: WellState, lease: Lease): number {
  return Math.max(0, tankOf(well, lease) - lease.storage - lease.storageEscrow);
}

/** Puts the field's tank back in step with its leases. Called after anything moves barrels. */
export function refreshStorage(well: WellState): void {
  let storage = 0;
  let escrow = 0;
  for (const lease of well.leases) {
    storage += lease.storage;
    escrow += lease.storageEscrow;
  }
  well.storage = storage;
  well.storageEscrow = escrow;
}

/** The leases whose oil could be loaded here: this region, this grade. */
export function tanksFor(well: WellState, region: RegionName | null, grade: Grade | null): Lease[] {
  return well.leases.filter((l) => (region === null || l.region === region) && (grade === null || l.grade === grade));
}

/** What it costs to lift a barrel here: this ground's own cost, at this region's wages (stage 3b). */
export function costAt(lease: Lease, laborIndex: (region: RegionName) => number): number {
  return lease.baseExtractionCost * laborIndex(lease.region);
}

/** What stands in those tanks, free to sell. */
export function heldIn(leases: readonly Lease[]): number {
  return leases.reduce((sum, l) => sum + l.storage, 0);
}

/**
 * Takes barrels out of a set of tanks, fullest first so no lease is left with a dribble nobody can
 * sell in a lot. Returns what it actually got, which is all there was if that is less than asked.
 */
export function drawFrom(well: WellState, leases: readonly Lease[], qty: number): number {
  let left = qty;
  for (const lease of [...leases].sort((a, b) => b.storage - a.storage)) {
    if (left <= 0) break;
    const taken = Math.min(lease.storage, left);
    lease.storage -= taken;
    left -= taken;
  }
  refreshStorage(well);
  return qty - left;
}

/** Locks barrels against today's asks, and lets them go when the fill ships. */
export function lockIn(well: WellState, leases: readonly Lease[], qty: number): number {
  let left = Math.min(qty, heldIn(leases));
  for (const lease of [...leases].sort((a, b) => b.storage - a.storage)) {
    if (left <= 0) break;
    const taken = Math.min(lease.storage, left);
    lease.storage -= taken;
    lease.storageEscrow += taken;
    left -= taken;
  }
  refreshStorage(well);
  return qty - left;
}

export function shipFrom(well: WellState, leases: readonly Lease[], qty: number): number {
  let left = Math.min(qty, leases.reduce((sum, l) => sum + l.storageEscrow, 0));
  for (const lease of [...leases].sort((a, b) => b.storageEscrow - a.storageEscrow)) {
    if (left <= 0) break;
    const taken = Math.min(lease.storageEscrow, left);
    lease.storageEscrow -= taken;
    left -= taken;
  }
  refreshStorage(well);
  return qty - left;
}

/**
 * Puts barrels into the tanks at a set of leases, sharing them out by the ground each one works.
 * Used when a company is built with oil already in hand, and by tests that want a tank filled.
 */
export function fillTanks(well: WellState, qty: number, leases: readonly Lease[] = well.leases): number {
  const all = leases.reduce((sum, l) => sum + Math.max(leaseCapacity(l), 1), 0);
  let left = qty;
  for (const lease of leases) {
    const share = all > 0 ? (Math.max(leaseCapacity(lease), 1) / all) * qty : 0;
    const put = Math.min(share, left);
    lease.storage += put;
    left -= put;
  }
  const first = leases[0];
  if (left > 0 && first !== undefined) first.storage += left;
  refreshStorage(well);
  return qty;
}

/** Puts an ask's unsold barrels back where they came from at the end of the day. */
export function releaseTanks(well: WellState): void {
  for (const lease of well.leases) {
    lease.storage += lease.storageEscrow;
    lease.storageEscrow = 0;
  }
  refreshStorage(well);
}

/** Work down a hole is paid for the day it is ordered, and shows in the day's costs under pumping. */
function charge(owner: Agent, ledger: FeeLedger, tick: Tick, kind: FeeKind, amount: number): void {
  if (amount <= 0) return;
  owner.cash -= amount;
  recordFee(ledger, { tick, agentId: owner.agentId, kind, amount });
}

/** Empties every tank on a field. Used when a test wants to start from nothing in hand. */
export function emptyTanks(well: WellState): void {
  for (const lease of well.leases) { lease.storage = 0; lease.storageEscrow = 0; }
  refreshStorage(well);
}
