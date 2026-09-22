// Every tunable constant from spec §7.4, in one typed object.
//
// Conventions: money in $, volumes in barrels (bbl), time in ticks (days).
// Rates and shares are fractions, so 25% is written 0.25.
// All values are placeholders to be tuned in Phases 7 and 12.

import type { AppetiteSetting, ChokepointStatus, Grade, Product, SellingSetting, StockpileSetting } from './enums';
import type { CompanySettings } from './model';

export interface Range {
  readonly min: number;
  readonly max: number;
}

/** Settings for the retail product-price process (spec §7.3). */
export interface ProductPriceConfig {
  readonly BASE: Readonly<Record<Product, number>>;        // $/bbl, the long-run anchor
  readonly SIGMA: Readonly<Record<Product, number>>;       // daily volatility of the log price
  readonly AMPLITUDE: Readonly<Record<Product, number>>;   // seasonal swing, as a share of base
  readonly PHASE: Readonly<Record<Product, number>>;       // days; shifts the seasonal peak
  readonly THETA: number;                                  // share of a deviation that fades each day
  readonly CORRELATION: {                                  // between the three products' daily shocks
    readonly GASOLINE_DIESEL: number;
    readonly GASOLINE_FUEL_OIL: number;
    readonly DIESEL_FUEL_OIL: number;
  };
  readonly BETA: number;                                   // how strongly refinery output moves fair value
  readonly SUPPLY_WINDOW: number;                          // ticks of output averaged
  readonly BASE_UTILIZATION: number;                       // output treated as normal
  readonly SUPPLY_MIN: number;                             // bounds on the supply factor
  readonly SUPPLY_MAX: number;
  readonly PRICE_FLOOR: number;                            // hard bounds, as multiples of base
  readonly PRICE_CEILING: number;
  readonly LAMBDA: number;                                 // expectation smoothing
  readonly START_DAY_OF_YEAR: number;                      // 0 = tick 0 falls on January 1
}

export interface Config {
  // Market (spec §6, §8)
  readonly LOT_SIZE: number;               // bbl; every order and deal is a whole number of lots
  readonly CARRY_RATE: number;             // $/bbl per tick of transit
  readonly MIN_MARGIN: number;             // $/bbl above cost on producer asks (Selling: Balanced)
  readonly SKEW: number;                   // how hard storage pressure discounts asks
  readonly DUMP_THRESHOLD: number;         // storage fill that triggers selling the excess
  readonly DUMP_DISCOUNT: number;          // below the reference, for that excess; never below cash cost
  readonly ASK_DECAY: number;              // share a producer's ask falls for each day in a row unsold
  readonly TARGET_DAYS: number;            // refiner stock target, days of use (Stockpile: Normal)
  readonly URGENCY: number;                // how far a starved refiner raises its bid
  readonly AGGRESSION: number;             // integrated deficit bids above delivered_max
  readonly HALF_SPREAD: number;            // $/bbl either side of the marker for trader quotes
  readonly STORAGE_CARRY: number;          // $/bbl per tick of holding stock
  readonly TRADER_CLEAR_FILL: number;      // hub fill above which a trader sells even at a loss
  readonly HOLD_TICKS: number;             // ticks a storage trade expects to hold
  readonly MAX_RISK_LIMIT: number;         // $ a trader may hold in open positions (Appetite: Medium)

  // Production (spec §4.8)
  readonly SHUT_IN_THRESHOLD: number;      // output below this share of capacity shuts wells in
  readonly RESTART_COST: number;           // $ per bbl/day of capacity
  readonly RAMP_TICKS: number;
  readonly EXTRACTION_SPREAD: number;       // day-to-day swing in what a field actually pumps, either way
  readonly FIXED_COST_RATE: { readonly PRODUCER: number; readonly REFINER: number };   // $ per bbl/day of capacity per tick
  readonly ABANDON_SHARE: number;          // a well is spent below this share of what it first made
  readonly EXPOSURE: {                     // what a company has coming to it (§12A.6)
    readonly DRAG: number;                 // share of exposure charged every day, quietly
    readonly CHANCE_PER_DOLLAR: number;    // odds a day that it catches up, per dollar of exposure
    readonly MAX_CHANCE: number;           // however much has piled up
    readonly PENALTY: number;              // what settling costs, as a multiple of the entry
    readonly FORFEIT_ABOVE: number;        // an entry this large costs the ground, not a shutdown
    readonly SHUT_TICKS: number;           // and a smaller one costs this many days of it
    readonly TROUBLE: {                    // a reckoning follows trouble (§12A.6)
      readonly CASH: number;               // how much worse the odds get with no cash to spare
      readonly CLOSING: number;            // and as a scenario runs out
      readonly CLOSING_DAYS: number;
    };
  };
  readonly WELL: {                         // what goes wrong down a hole (§12A.3)
    readonly MAINT_INTERVAL: number;       // ticks between services
    readonly MAINT_TICKS: number;          // and how long one takes
    readonly MAINT_COST: number;           // $ per bbl/day the well makes
    readonly BASE_HAZARD: number;          // failure chance a day, freshly serviced
    readonly WORKOVER_TICKS: Range;        // how long a failed well waits for a crew
    readonly WORKOVER_COST: number;        // $ per bbl/day the well makes
    readonly RUSH_COST: number;            // $ a day bought back by paying a crew overtime
  };
  readonly AUCTION: {                      // the yearly lease auction (§12A.4)
    readonly EVERY_TICKS: number;          // twice a year
    readonly NOTICE_TICKS: number;         // lots are published this long before they are awarded
    readonly LOTS: number;                 // blocks on offer each time
    readonly WELLS: { readonly MIN: number; readonly MAX: number };   // slots on a lot
    readonly RESERVE_SHARE: number;        // no lot sells below this share of what it is worth
    readonly MAX_CASH_SHARE: number;       // and nobody bids away more than this much of their cash
    readonly AI_BID: { readonly MIN: number; readonly MAX: number };  // appetite, as a share of worth
    readonly STRONG_SHARE: number;         // the player's bold bid, above what any rival will offer
    readonly STEADY_SHARE: number;         // and its careful one, which wins only when rivals are shy
    readonly BASE_COST: Readonly<Record<Grade, number>>;              // $/bbl to lift new ground
  };
  readonly DRY_HOLE: {                     // a well may find nothing (§12A.3)
    readonly FIRST: number;                // chance the first well on fresh ground hits
    readonly PER_ATTEMPT: number;          // chance lost with every well already sunk there
    readonly FLOOR: number;                // and never worse than this
  };
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
  readonly UNIT_CAPACITY: number;          // bbl/day of a processing unit or a new refinery (spec G2, G4.4)
  readonly MAINT_TICKS: number;
  readonly MAINT_COST: number;             // $ per bbl/day of capacity
  readonly MAINT_INTERVAL: number;
  readonly BASE_HAZARD: number;            // breakdown chance per tick just after maintenance
  readonly HAZARD_EXPONENT: number;        // how steeply that chance rises with time since maintenance
  readonly BREAKDOWN_TICKS: Range;
  readonly BREAKDOWN_OVERDUE_DAYS: number; // extra days offline per interval of deferred maintenance
  readonly EMERGENCY_REPAIR_COST: number;  // $ per bbl/day of capacity; halves the remaining outage

  // Network and storage (spec §3.5, §6.5)
  readonly MAX_RESERVATION_SHARE: number;  // of a pipeline's capacity, per company
  readonly CHOKEPOINT_THROUGHPUT: Readonly<Record<ChokepointStatus, number>>;   // share of a strait's throughput usable at each status
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
  readonly CREDIT_ASSET_SHARE: number;     // credit limit as a multiple of capital assets
  readonly CREDIT_BASE: { readonly PRODUCER: number; readonly REFINER: number; readonly TRADER: number };   // $ added to the asset share
  readonly CREDIT_CUSHION_DAYS: number;
  readonly CREDIT_WORKING_DAYS: number;    // days of fixed costs kept as working cash (D42)    // days of fixed costs kept as cash before repaying credit
  readonly REPORT_COST: number;
  readonly REPORT_LAG: number;             // ticks old
  readonly REPORT_NOISE: number;           // ± share of the true value
  readonly INTEGRATE_THRESHOLD: number;    // net worth as a multiple of starting net worth

  // Product prices (spec §7.3)
  readonly PRODUCT_PRICES: ProductPriceConfig;

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
  DUMP_DISCOUNT: 0.20,
  ASK_DECAY: 0.02,
  TARGET_DAYS: 10,
  URGENCY: 0.08,
  AGGRESSION: 0.05,
  HALF_SPREAD: 0.40,
  STORAGE_CARRY: 0.06,
  TRADER_CLEAR_FILL: 0.90,
  HOLD_TICKS: 30,
  MAX_RISK_LIMIT: 5_000_000,

  SHUT_IN_THRESHOLD: 0.25,
  RESTART_COST: 3.00,
  RAMP_TICKS: 10,
  // No field pumps the same number twice: weather, pumps, water cut, a crew short. Symmetric, so a
  // year's output is unchanged — but a day's is never quite the plan, and the Activity tab shows it.
  EXTRACTION_SPREAD: 0.06,
  FIXED_COST_RATE: { PRODUCER: 2.00, REFINER: 4.00 },
  ABANDON_SHARE: 0.05,
  // A well is a simpler thing than a refinery and there are a dozen of them, so each one fails
  // rarely; together they cost a producer a couple of per cent of its output a year.
  // A year of carrying $1M of exposure costs about $37K in drag and runs a 30% chance of a
  // reckoning, which would take between a fifth and two thirds of the record at twice its face.
  EXPOSURE: {
    DRAG: 0.0001, CHANCE_PER_DOLLAR: 1e-9, MAX_CHANCE: 0.01, PENALTY: 2.0,
    FORFEIT_ABOVE: 3_000_000, SHUT_TICKS: 40,
    TROUBLE: { CASH: 3, CLOSING: 2, CLOSING_DAYS: 120 },
  },
  WELL: {
    MAINT_INTERVAL: 240, MAINT_TICKS: 3, MAINT_COST: 30,
    BASE_HAZARD: 0.00015, WORKOVER_TICKS: { min: 5, max: 15 }, WORKOVER_COST: 150, RUSH_COST: 45_000,
  },
  AUCTION: {
    // Twice a year. Yearly put the only award on the last day of every 365-day scenario, too late
    // to drill what you had just bought, so the auction existed and no campaign could use it.
    EVERY_TICKS: 180, NOTICE_TICKS: 30, LOTS: 3, WELLS: { MIN: 6, MAX: 12 },
    RESERVE_SHARE: 0.35, MAX_CASH_SHARE: 0.5, AI_BID: { MIN: 0.5, MAX: 1.2 },
    // Bidding strong clears the keenest rival, so it wins — and pays a third over the odds for the
    // privilege. Bidding steady wins only against a shy field. That is the decision (§12A.4).
    STRONG_SHARE: 1.3, STEADY_SHARE: 0.75,
    // New ground costs more to lift than the fields already running: the easy barrels went first.
    BASE_COST: { LIGHT_SWEET: 38, MEDIUM: 36, HEAVY_SOUR: 34 },
  },
  // The best prospects are drilled first, so the last slots on a lease are a gamble (§12A.3).
  DRY_HOLE: { FIRST: 0.85, PER_ATTEMPT: 0.04, FLOOR: 0.45 },
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
  UNIT_CAPACITY: 2_500,
  MAINT_TICKS: 5,
  MAINT_COST: 0.50,
  MAINT_INTERVAL: 120,
  BASE_HAZARD: 0.0005,
  HAZARD_EXPONENT: 4,
  BREAKDOWN_TICKS: { min: 8, max: 20 },
  BREAKDOWN_OVERDUE_DAYS: 20,
  EMERGENCY_REPAIR_COST: 3.00,

  MAX_RESERVATION_SHARE: 0.50,
  CHOKEPOINT_THROUGHPUT: { OPEN: 1, TENSION: 0.75, DELAYED: 0.5, CLOSED: 0 },
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
  OFFICE_COST: { OPEN: 250_000, PER_TICK: 1_000 },

  DEAL_VOLUME: { min: 1_000, max: 10_000 },
  DEAL_TERMS: [30, 90],
  DEAL_MAX_SHARE: 0.80,
  SHORTFALL_RATE: 0.15,
  CANCEL_RATE: 0.10,
  TENDER_DELAY: { min: 3, max: 5 },
  DEAL_OFFER_INTERVAL: 7,

  CREDIT_RATE: 0.0003,
  CREDIT_ASSET_SHARE: 5,
  CREDIT_BASE: { PRODUCER: 10_000_000, REFINER: 20_000_000, TRADER: 20_000_000 },
  CREDIT_CUSHION_DAYS: 30,
  CREDIT_WORKING_DAYS: 5,
  REPORT_COST: 25_000,
  REPORT_LAG: 5,
  REPORT_NOISE: 0.15,
  INTEGRATE_THRESHOLD: 3,

  PRODUCT_PRICES: {
    BASE: { GASOLINE: 95, DIESEL: 100, FUEL_OIL: 55 },
    SIGMA: { GASOLINE: 0.012, DIESEL: 0.010, FUEL_OIL: 0.015 },
    AMPLITUDE: { GASOLINE: 0.04, DIESEL: 0.03, FUEL_OIL: 0 },
    PHASE: { GASOLINE: 105, DIESEL: 289, FUEL_OIL: 0 },
    THETA: 0.05,
    CORRELATION: { GASOLINE_DIESEL: 0.70, GASOLINE_FUEL_OIL: 0.40, DIESEL_FUEL_OIL: 0.50 },
    BETA: 0.10,
    SUPPLY_WINDOW: 7,
    BASE_UTILIZATION: 0.85,
    SUPPLY_MIN: 0.90,
    SUPPLY_MAX: 1.15,
    PRICE_FLOOR: 0.70,
    PRICE_CEILING: 1.40,
    LAMBDA: 0.10,
    START_DAY_OF_YEAR: 0,
  },

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

// ─── Company settings (spec G4.2) ────────────────────────────────────────────────────────────

const SELLING: Readonly<Record<SellingSetting, DeepPartial<Config>>> = {
  SELL_FAST: { SKEW: 0.20, MIN_MARGIN: 0.50, DUMP_THRESHOLD: 0.80 },
  BALANCED: { SKEW: 0.10, MIN_MARGIN: 1.00, DUMP_THRESHOLD: 0.90 },
  HOLD_FOR_PRICE: { SKEW: 0.05, MIN_MARGIN: 3.00, DUMP_THRESHOLD: 0.97 },
};
const STOCKPILE: Readonly<Record<StockpileSetting, DeepPartial<Config>>> = {
  LEAN: { TARGET_DAYS: 5, URGENCY: 0.12 },
  NORMAL: { TARGET_DAYS: 10, URGENCY: 0.08 },
  DEEP: { TARGET_DAYS: 20, URGENCY: 0.05 },
};
const APPETITE: Readonly<Record<AppetiteSetting, DeepPartial<Config>>> = {
  LOW: { MAX_RISK_LIMIT: 2_000_000, HALF_SPREAD: 0.60 },
  MEDIUM: { MAX_RISK_LIMIT: 5_000_000, HALF_SPREAD: 0.40 },
  HIGH: { MAX_RISK_LIMIT: 10_000_000, HALF_SPREAD: 0.25 },
};

/**
 * The config one company's rules run with (spec §6, G4.2): the base config with its Selling,
 * Stockpile and Appetite choices applied. Risk is not a number but a list of chokepoints to avoid,
 * which depends on today's chokepoint statuses — see avoidFor() in transport.ts.
 */
export function configFor(settings: CompanySettings, base: Config): Config {
  // Configs are frozen, so each (base, settings) pair can be built once and shared.
  let byKey = companyConfigs.get(base);
  if (byKey === undefined) {
    byKey = new Map();
    companyConfigs.set(base, byKey);
  }
  const key = `${settings.selling}|${settings.stockpile}|${settings.appetite}`;
  let cfg = byKey.get(key);
  if (cfg === undefined) {
    cfg = withOverrides(base, { ...SELLING[settings.selling], ...STOCKPILE[settings.stockpile], ...APPETITE[settings.appetite] });
    byKey.set(key, cfg);
  }
  return cfg;
}

const companyConfigs = new WeakMap<Config, Map<string, Config>>();
