// Every tunable constant from spec §7.4, in one typed object.
//
// Conventions: money in $, volumes in barrels (bbl), time in ticks (days).
// Rates and shares are fractions, so 25% is written 0.25.
// All values are placeholders to be tuned in Phases 7 and 12.

import type { DeclineClass } from './enums';

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface Config {
  // Market (spec §6, §8)
  readonly LOT_SIZE: number;               // bbl; every order and deal is a whole number of lots
  readonly CARRY_RATE: number;             // $/bbl per tick of transit
  readonly MIN_MARGIN: number;             // $/bbl above cost on producer asks (Selling: Balanced)
  readonly SKEW: number;                   // how hard storage pressure discounts asks
  readonly DUMP_THRESHOLD: number;         // storage fill that triggers selling the excess
  readonly TARGET_DAYS: number;            // refiner stock target, days of use (Stockpile: Normal)
  readonly URGENCY: number;                // how far a starved refiner raises its bid
  readonly AGGRESSION: number;             // integrated deficit bids above delivered_max
  readonly HALF_SPREAD: number;            // $/bbl either side of the marker for trader quotes
  readonly STORAGE_CARRY: number;          // $/bbl per tick of holding stock
  readonly HOLD_TICKS: number;             // ticks a storage trade expects to hold

  // Production (spec §4.8)
  readonly SHUT_IN_THRESHOLD: number;      // output below this share of capacity shuts wells in
  readonly RESTART_COST: number;           // $ per bbl/day of capacity
  readonly RAMP_TICKS: number;
  readonly FIXED_COST_RATE: { readonly PRODUCER: number; readonly REFINER: number };   // $ per bbl/day of capacity per tick
  readonly DECLINE_RATE: Readonly<Record<DeclineClass, number>>;                      // capacity lost per tick
  readonly DRILL_STEP: number;             // bbl/day added per drilling project
  readonly DRILL_COST: number;             // $ per bbl/day, times labor index
  readonly DRILL_TICKS: number;
  readonly STORAGE_STEP: number;           // bbl of tank space per step
  readonly STORAGE_COST: number;           // $ per bbl of tank space, times labor index
  readonly STORAGE_TICKS: number;

  // Refining (spec §4.9)
  readonly REFINERY_RESTART_COST: number;  // $ per bbl/day of capacity
  readonly REFINERY_RAMP_TICKS: number;
  readonly TIER_COST: { readonly TO_TIER_2: number; readonly TO_TIER_3: number };   // $ per bbl/day, times labor index
  readonly TIER_TICKS: number;
  readonly WORKS_CAPACITY_FACTOR: number;  // capacity available during tier works
  readonly FACTORY_COST: number;           // $ per bbl/day, times labor index
  readonly FACTORY_TICKS: number;
  readonly INTEGRATE_PLANT_CAPACITY: number;   // bbl/day of the refinery a producer builds to integrate (spec G2)
  readonly MAINT_TICKS: number;
  readonly MAINT_COST: number;             // $ per bbl/day of capacity
  readonly MAINT_INTERVAL: number;
  readonly BASE_HAZARD: number;            // breakdown chance per tick just after maintenance
  readonly BREAKDOWN_TICKS: Range;
  readonly EMERGENCY_REPAIR_COST: number;  // $ per bbl/day of capacity; halves the remaining outage

  // Network and storage (spec §3.5, §6.5)
  readonly MAX_RESERVATION_SHARE: number;  // of a pipeline's capacity, per company
  readonly RESERVATION_COST: number;       // $ per bbl/day, times labor index
  readonly RESERVATION_TICKS: number;
  readonly LEASE_STEP: number;             // bbl
  readonly LEASE_MIN_TICKS: number;
  readonly LEASE_RATE: number;             // $/bbl per tick, before scarcity
  readonly LEASE_SCARCITY: number;
  readonly LEASE_POOL_CAPACITY: number;    // bbl per eligible region
  readonly MAX_LEASE_SHARE: number;        // of a region's pool, per company
  readonly LEASE_WARN_TICKS: number;
  readonly LEASE_GRACE_TICKS: number;
  readonly LEASE_GRACE_MULTIPLIER: number;
  readonly DEMURRAGE_RATE: number;         // $/bbl per tick for cargo waiting offshore
  readonly DEMURRAGE_MAX_TICKS: number;
  readonly DISTRESS_DISCOUNT: number;      // below the marker, for forced sales
  readonly CHARTER: {
    readonly SMALL: { readonly RATE: number; readonly CAPACITY: number };   // $/tick, bbl
    readonly LARGE: { readonly RATE: number; readonly CAPACITY: number };
  };
  readonly CHARTER_MIN_TICKS: number;
  readonly OFFICE_COST: { readonly OPEN: number; readonly PER_TICK: number };

  // Deals (spec G4.3)
  readonly DEAL_VOLUME: Range;             // bbl/day
  readonly DEAL_TERMS: readonly number[];  // ticks
  readonly DEAL_MAX_SHARE: number;         // of a company's capacity
  readonly SHORTFALL_RATE: number;         // of the deal price, per missing barrel
  readonly CANCEL_RATE: number;            // of the remaining deal value
  readonly TENDER_DELAY: Range;            // ticks until offers arrive
  readonly DEAL_OFFER_INTERVAL: number;    // ticks between AI offers

  // Finance and intelligence (spec G6)
  readonly CREDIT_RATE: number;            // per tick on the drawn balance
  readonly REPORT_COST: number;
  readonly REPORT_LAG: number;             // ticks old
  readonly REPORT_NOISE: number;           // ± share of the true value
  readonly INTEGRATE_THRESHOLD: number;    // net worth as a multiple of starting net worth

  // Cards (spec G4.1, G4.5)
  readonly CARD_MAX_OPEN: number;
  readonly CARD_COOLDOWN: number;          // ticks, per card type
  readonly CARD_DEADLINE: number;          // ticks
  readonly PROJECTION_TICKS: number;
}

/**
 * Makes every property optional, all the way down, so an override can change one nested value
 * (say FIXED_COST_RATE.REFINER) without restating its siblings. Arrays are replaced whole.
 * This is a mapped type: `[K in keyof T]` walks every key of T, and the conditional picks how
 * to treat each value.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const DEFAULT_CONFIG: Config = deepFreeze({
  LOT_SIZE: 1_000,
  CARRY_RATE: 0.10,
  MIN_MARGIN: 1.00,
  SKEW: 0.10,
  DUMP_THRESHOLD: 0.90,
  TARGET_DAYS: 10,
  URGENCY: 0.08,
  AGGRESSION: 0.05,
  HALF_SPREAD: 0.40,
  STORAGE_CARRY: 0.06,
  HOLD_TICKS: 30,

  SHUT_IN_THRESHOLD: 0.25,
  RESTART_COST: 3.00,
  RAMP_TICKS: 10,
  FIXED_COST_RATE: { PRODUCER: 2.00, REFINER: 4.00 },
  DECLINE_RATE: { SHALE: 0.001, CONVENTIONAL: 0.00017 },
  DRILL_STEP: 500,
  DRILL_COST: 2_000,
  DRILL_TICKS: 45,
  STORAGE_STEP: 5_000,
  STORAGE_COST: 15,
  STORAGE_TICKS: 20,

  REFINERY_RESTART_COST: 2.00,
  REFINERY_RAMP_TICKS: 3,
  TIER_COST: { TO_TIER_2: 3_000, TO_TIER_3: 5_000 },
  TIER_TICKS: 60,
  WORKS_CAPACITY_FACTOR: 0.60,
  FACTORY_COST: 4_000,
  FACTORY_TICKS: 90,
  INTEGRATE_PLANT_CAPACITY: 2_500,
  MAINT_TICKS: 5,
  MAINT_COST: 0.50,
  MAINT_INTERVAL: 120,
  BASE_HAZARD: 0.0005,
  BREAKDOWN_TICKS: { min: 8, max: 20 },
  EMERGENCY_REPAIR_COST: 3.00,

  MAX_RESERVATION_SHARE: 0.50,
  RESERVATION_COST: 1_500,
  RESERVATION_TICKS: 30,
  LEASE_STEP: 10_000,
  LEASE_MIN_TICKS: 10,
  LEASE_RATE: 0.06,
  LEASE_SCARCITY: 2.0,
  LEASE_POOL_CAPACITY: 200_000,
  MAX_LEASE_SHARE: 0.40,
  LEASE_WARN_TICKS: 10,
  LEASE_GRACE_TICKS: 5,
  LEASE_GRACE_MULTIPLIER: 2.0,
  DEMURRAGE_RATE: 0.25,
  DEMURRAGE_MAX_TICKS: 15,
  DISTRESS_DISCOUNT: 0.20,
  CHARTER: {
    SMALL: { RATE: 6_000, CAPACITY: 50_000 },
    LARGE: { RATE: 15_000, CAPACITY: 200_000 },
  },
  CHARTER_MIN_TICKS: 30,
  OFFICE_COST: { OPEN: 250_000, PER_TICK: 5_000 },

  DEAL_VOLUME: { min: 1_000, max: 10_000 },
  DEAL_TERMS: [30, 90],
  DEAL_MAX_SHARE: 0.80,
  SHORTFALL_RATE: 0.15,
  CANCEL_RATE: 0.10,
  TENDER_DELAY: { min: 3, max: 5 },
  DEAL_OFFER_INTERVAL: 7,

  CREDIT_RATE: 0.0003,
  REPORT_COST: 25_000,
  REPORT_LAG: 5,
  REPORT_NOISE: 0.15,
  INTEGRATE_THRESHOLD: 3,

  CARD_MAX_OPEN: 3,
  CARD_COOLDOWN: 14,
  CARD_DEADLINE: 7,
  PROJECTION_TICKS: 30,
});

/**
 * A new config with some values changed; the base is never modified. Used by difficulty
 * presets and AI personalities (spec G8), and by tests. The result is frozen, like the default.
 */
export function withOverrides(base: Config, overrides: DeepPartial<Config>): Config {
  return deepFreeze(merge(base, overrides));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, overrides: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }
  return out as T;
}

// Freezes an object and everything inside it, so engine code that tried to change a
// constant would throw instead of silently altering every later tick.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}
