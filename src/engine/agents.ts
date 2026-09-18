// What companies do each day (spec §4.8–4.11, §6).
// Phase 3 adds refining; extraction, the decision rules and default operations join in Phase 5.

import { acceptedGrades, total } from './companies';
import { FeeKind, GRADES, type Grade } from './enums';
import { productValue, recordFee, sellToSink, YIELDS, type FeeLedger, type RetailSink } from './economics';
import type { IntegratedMajor, PlantState, Refiner, Tick } from './model';

/**
 * The share of capacity a refinery can run at today (spec §4.9): zero when offline or broken down,
 * otherwise the throttle's setting, never above the cap set by cards. All stock-buffer sizing uses
 * this, so an offline refinery stops buying.
 */
export function effectiveUtilization(r: PlantState): number {
  if (!r.online || r.outageTicksRemaining > 0) return 0;
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
export function refine(company: Refiner | IntegratedMajor, sink: RetailSink, ledger: FeeLedger, tick: Tick): RefineResult {
  const r = company.kind === 'INTEGRATED' ? company.plant : company;
  let room = Math.floor(r.processingCapacity * effectiveUtilization(r) * r.worksFactor);
  const byGrade: Record<Grade, number> = { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 };
  let revenue = 0;
  let opex = 0;

  const margin = (g: Grade) => productValue(g, sink.prices) - YIELDS[g].opex;
  const order = acceptedGrades(r.techTier)
    .slice()
    .sort((a, b) => margin(b) - margin(a) || GRADES.indexOf(a) - GRADES.indexOf(b));

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
  const qty = Math.max(0, Math.min(well.storage, room));
  well.storage -= qty;
  plant.crudeStock[well.grade] += qty;
  return qty;
}
