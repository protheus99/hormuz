// What companies do each day (spec §4.8–4.11, §6).
// Phase 3 added refining; Phase 5 adds extraction, the decision rules and default operations.

import { acceptedGrades, total, wellOf } from './companies';
import type { Config } from './config';
import { REGIONS } from '../data/regions';
import { FeeKind, GRADES, type Grade } from './enums';
import { productValue, recordFee, sellToSink, YIELDS, type FeeLedger, type RetailSink } from './economics';
import type { IntegratedMajor, PlantState, Producer, Refiner, Tick, WellState } from './model';
import { nextFloat, type Rng } from './rng';
import { capacityOf, depleteWells, drawFrom, heldIn, leaseCapacity, liftFrom, refreshStorage, roomAt, tanksFor } from './leases';

/**
 * The share of capacity a refinery can run at today (spec §4.9): zero when offline or broken down,
 * otherwise the throttle's setting, never above the cap set by cards. All stock-buffer sizing uses
 * this, so an offline refinery stops buying.
 */
export function effectiveUtilization(r: PlantState): number {
  if (!r.online || r.maintenanceTicksRemaining > 0) return 0;
  // A partial restart keeps part of a broken-down plant running (spec G4.4 "Breakdown").
  if (r.outageTicksRemaining > 0) return Math.min(r.utilization, r.utilizationCap, r.limpShare);
  return Math.min(r.utilization, r.utilizationCap);
}

export interface RefineResult {
  /** Barrels refined of each grade. */
  readonly byGrade: Readonly<Record<Grade, number>>;
  readonly barrels: number;
  /** Paid by the retail sink. */
  readonly revenue: number;
  /** Paid out as refining cost. */
  readonly opex: number;
}

/**
 * Refines up to today's throughput (spec §5 phase 3): capacity × effective utilization × works
 * factor. Grades are taken in order of margin at today's prices, best first; ties fall back to
 * the fixed grade order so the result never depends on how stock happens to be stored. Output is
 * sold to the retail sink, and opex is recorded in the fee ledger as money leaving the economy.
 */
export function refine(company: Refiner | IntegratedMajor, plant: PlantState, sink: RetailSink, ledger: FeeLedger, tick: Tick): RefineResult {
  const r = company.kind === 'INTEGRATED' ? company.plant : company;
  let room = Math.floor(r.processingCapacity * effectiveUtilization(r) * r.worksFactor);
  const byGrade: Record<Grade, number> = { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 };
  let revenue = 0;
  let opex = 0;

  const margin = (g: Grade) => productValue(g, sink.prices) - YIELDS[g].opex;
  const preferred = r.crudePreference !== null && (r.crudePreference.weight === 'ALL' || tick % 2 === 0) ? r.crudePreference.grade : null;
  const order = acceptedGrades(r.techTier)
    .slice()
    .sort((a, b) => Number(b === preferred) - Number(a === preferred) || margin(b) - margin(a) || GRADES.indexOf(a) - GRADES.indexOf(b));

  for (const grade of order) {
    const qty = Math.min(room, r.crudeStock[grade]);
    if (qty <= 0) continue;
    r.crudeStock[grade] -= qty;
    room -= qty;
    byGrade[grade] = qty;
    revenue += sellToSink(sink, grade, qty);
    opex += qty * YIELDS[grade].opex;
  }

  company.cash += revenue - opex;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.REFINING_OPEX, amount: opex });
  return { byGrade, barrels: byGrade.LIGHT_SWEET + byGrade.MEDIUM + byGrade.HEAVY_SOUR, revenue, opex };
}

/**
 * Internal clearing (spec §5 phase 2, §4.10): an integrated major moves crude from its wells to its
 * own plant, up to the plant's free tank space and only if the plant can refine that grade. It is
 * one company moving its own barrels, so no cash changes hands and no tariff or freight is paid.
 * Returns the barrels moved; the rest stays in well storage to be sold under §6.3.
 */
export function internalTransfer(m: IntegratedMajor): number {
  const { well, plant } = m;
  if (!acceptedGrades(plant.techTier).includes(well.grade)) return 0;
  const room = plant.crudeStorageCapacity - total(plant.crudeStock);
  // Only oil standing where the refinery is: crude in another region has a voyage to make, and a
  // voyage is a sale, not a transfer (stage 3b).
  const local = tanksFor(well, plant.region, well.grade);
  const qty = Math.max(0, Math.min(heldIn(local), room));
  drawFrom(well, local, qty);
  plant.crudeStock[well.grade] += qty;
  return qty;
}

// ─── Extraction (spec §4.8, §5 phase 1) ──────────────────────────────────────────────────────

export interface ExtractResult {
  readonly barrels: number;
  /** Paid out as extraction cost. */
  readonly cost: number;
}

/** A producer's cash cost per barrel: base cost × the region's labor index (spec §4.8). */
export function actualCost(company: Producer | IntegratedMajor): number {
  return (wellOf(company) as WellState).baseExtractionCost * REGIONS[company.region].laborCostIndex;
}

/** Storage fill including barrels locked by today's asks (spec §4.8). */
export function fillRatio(well: WellState): number {
  return well.storageCapacity === 0 ? 1 : (well.storage + well.storageEscrow) / well.storageCapacity;
}

/**
 * Pumps today's crude (spec §5 phase 1): capacity × extraction rate × ramp factor, give or take
 * the day's swing, up to the free storage — production halts when tanks are full. A shut-in field
 * pumps nothing. After a restart the ramp factor climbs 1/RAMP_TICKS a day back to full output.
 *
 * `rng` draws the day's swing; a projection passes a config with no spread, so its days are level.
 */
export function extract(company: Producer | IntegratedMajor, ledger: FeeLedger, tick: Tick, config: Config, rng: Rng): ExtractResult {
  const well = wellOf(company) as WellState;
  if (well.shutIn) return { barrels: 0, cost: 0 };
  let ramp = 1;
  if (well.rampTicksRemaining > 0) {
    ramp = (config.RAMP_TICKS - well.rampTicksRemaining + 1) / config.RAMP_TICKS;
    well.rampTicksRemaining -= 1;
  }
  // One draw for the company, not one a well: averaging a dozen wells would quietly cancel the
  // day-to-day swing the field is supposed to have (D48).
  const swing = 1 + config.EXTRACTION_SPREAD * (2 * nextFloat(rng) - 1);
  const wanted = well.extractionCapacity * well.extractionRate * ramp * swing;
  // Oil comes out of the ground a lease at a time, a lease can run out (§12A.2), and it goes into
  // the tanks at that lease — a lease whose tanks are full halts its own wells and nobody else's,
  // because there is nowhere else within reach to put the barrels (stage 3b).
  const all = capacityOf(well.leases);
  let barrels = 0;
  for (const lease of well.leases) {
    const share = all > 0 ? (leaseCapacity(lease) / all) * wanted : 0;
    const lifted = liftFrom(lease, Math.min(share, roomAt(well, lease)));
    lease.storage += lifted;
    barrels += lifted;
  }
  refreshStorage(well);
  const cost = barrels * actualCost(company);
  company.cash -= cost;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.EXTRACTION, amount: cost });
  return { barrels, cost };
}

/** Field decline (spec §12A.3): a well makes less because it holds less, not because time passed. */
export function applyDecline(company: Producer | IntegratedMajor, config: Config): void {
  const well = wellOf(company) as WellState;
  for (const lease of well.leases) depleteWells(lease, config);
  refreshCapacity(well);
}

/**
 * `extractionCapacity` is what every rule above the engine reads as the size of a field, and it is
 * now the sum of what the pumping wells make. Recomputing it here keeps those rules untouched.
 */
export function refreshCapacity(well: WellState): void {
  well.extractionCapacity = capacityOf(well.leases);
  if (well.extractionCapacity > well.peakCapacity) well.peakCapacity = well.extractionCapacity;
}

/**
 * Changes a field's output, as the "Prices below your cost" and "Prices have recovered" cards do
 * (spec G4.4). Below SHUT_IN_THRESHOLD the wells shut in. Raising output on a shut-in field
 * restarts it: RESTART_COST per bbl/day of capacity, then a RAMP_TICKS ramp.
 */
export function setExtractionRate(company: Producer | IntegratedMajor, rate: number, ledger: FeeLedger, tick: Tick, config: Config): void {
  if (!(rate >= 0 && rate <= 1)) throw new Error(`Extraction rate must be between 0 and 1, got ${rate}`);
  const well = wellOf(company) as WellState;
  well.extractionRate = rate;
  if (rate < config.SHUT_IN_THRESHOLD) {
    well.shutIn = true;
    well.rampTicksRemaining = 0;
  } else if (well.shutIn) {
    const cost = config.RESTART_COST * well.extractionCapacity;
    company.cash -= cost;
    recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.RESTART, amount: cost });
    well.shutIn = false;
    well.rampTicksRemaining = config.RAMP_TICKS;
  }
}

// ─── Plant upkeep (spec §4.9, §6.5, §5 phase 0) ──────────────────────────────────────────────

/** Chance of a breakdown today: rises steeply with time since maintenance (spec §4.9). */
export function breakdownHazard(plant: PlantState, config: Config): number {
  return config.BASE_HAZARD * (1 + plant.daysSinceMaintenance / config.MAINT_INTERVAL) ** config.HAZARD_EXPONENT;
}

/** Days a breakdown keeps a plant offline: longer the further maintenance has been put off. */
export function outageLength(plant: PlantState, config: Config, share: number): number {
  const { min, max } = config.BREAKDOWN_TICKS;
  const overdue = Math.max(0, plant.daysSinceMaintenance - config.MAINT_INTERVAL) / config.MAINT_INTERVAL;
  return min + Math.min(max - min, Math.floor(share * (max - min + 1))) + Math.round(config.BREAKDOWN_OVERDUE_DAYS * overdue);
}

/**
 * A plant's day of upkeep (spec §5 phase 0): outages, maintenance and tier works count down;
 * maintenance starts when due, taking the plant offline for MAINT_TICKS at MAINT_COST; and a
 * running plant may break down. Exactly one draw is taken from the events stream per plant per
 * day, whatever the plant's state, so one plant's history never shifts another's.
 */
export function advancePlant(company: Refiner | IntegratedMajor, plant: PlantState, rng: Rng, ledger: FeeLedger, tick: Tick, config: Config, autoMaintenance = true): void {
  const roll = nextFloat(rng);

  if (plant.worksTicksRemaining > 0) {
    plant.worksTicksRemaining -= 1;
    if (plant.worksTicksRemaining === 0) plant.worksFactor = 1;
  }
  if (plant.outageTicksRemaining > 0) {
    plant.outageTicksRemaining -= 1;
    if (plant.outageTicksRemaining === 0) plant.limpShare = 0;
    return;
  }
  if (plant.maintenanceTicksRemaining > 0) {
    plant.maintenanceTicksRemaining -= 1;
    if (plant.maintenanceTicksRemaining === 0) plant.daysSinceMaintenance = 0;
    return;
  }
  if (!plant.online) return;

  plant.daysSinceMaintenance += 1;
  const scheduled = plant.maintenanceAt !== null && tick >= plant.maintenanceAt;
  const due = autoMaintenance && plant.daysSinceMaintenance >= config.MAINT_INTERVAL && tick >= plant.maintenanceHoldUntil;
  if (scheduled || due) {
    startMaintenance(company, plant, ledger, tick, config);
    return;
  }
  if (roll < breakdownHazard(plant, config)) {
    // Reuse the same draw, rescaled, for the outage length so the stream stays one draw per day.
    plant.outageTicksRemaining = outageLength(plant, config, roll / breakdownHazard(plant, config));
  }
}

/** Takes a plant offline for MAINT_TICKS at MAINT_COST (spec §6.5; the "Maintenance due" card). */
export function startMaintenance(company: Refiner | IntegratedMajor, plant: PlantState, ledger: FeeLedger, tick: Tick, config: Config): void {
  plant.maintenanceAt = null;
  plant.maintenanceTicksRemaining = config.MAINT_TICKS;
  const cost = config.MAINT_COST * plant.processingCapacity;
  company.cash -= cost;
  recordFee(ledger, { tick, agentId: company.agentId, kind: FeeKind.MAINTENANCE, amount: cost });
}
