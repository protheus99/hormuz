// Money leaving the system (spec §7.1). Trades between companies are transfers and are not
// recorded here; freight, tariffs and running costs leave the economy and are. Summing this
// ledger is how cash conservation is checked (invariant 2, spec §9).
//
// It also holds the other side of the economy: the retail sink that buys every refined barrel,
// and the product prices it pays (spec §7.2–7.3).

import type { Config, ProductPriceConfig } from './config';
import { PRODUCTS, type FeeKind, type Grade, type Product } from './enums';
import type { AgentId, Tick } from './model';
import { cholesky, correlatedNormals, nextFloat, normal, rngFor, type Rng } from './rng';

export interface FeeEntry {
  readonly tick: Tick;
  readonly agentId: AgentId;
  readonly kind: FeeKind;
  /** Dollars paid out. Never negative. */
  readonly amount: number;
}

export interface FeeLedger {
  entries: FeeEntry[];
  /** Running sum of every entry, kept so the invariant check never has to re-add the whole list. */
  total: number;
}

export function createLedger(): FeeLedger {
  return { entries: [], total: 0 };
}

export function recordFee(ledger: FeeLedger, entry: FeeEntry): void {
  if (!(Number.isFinite(entry.amount) && entry.amount >= 0)) {
    throw new Error(`Fee amounts must be non-negative; got ${entry.amount} for ${entry.kind}`);
  }
  if (entry.amount === 0) return;
  ledger.entries.push(entry);
  ledger.total += entry.amount;
}

// ─── Refinery yields (spec §7.2) ─────────────────────────────────────────────────────────────

export interface GradeYield {
  /** Share of each barrel that becomes each product. Each row sums to 1. */
  readonly products: Readonly<Record<Product, number>>;
  /** Refining cost, $/bbl. */
  readonly opex: number;
}

export const YIELDS: Readonly<Record<Grade, GradeYield>> = {
  LIGHT_SWEET: { products: { GASOLINE: 0.60, DIESEL: 0.40, FUEL_OIL: 0.00 }, opex: 6 },
  MEDIUM: { products: { GASOLINE: 0.50, DIESEL: 0.42, FUEL_OIL: 0.08 }, opex: 8 },
  HEAVY_SOUR: { products: { GASOLINE: 0.38, DIESEL: 0.44, FUEL_OIL: 0.18 }, opex: 11 },
};

export type ProductPrices = Readonly<Record<Product, number>>;

/** What one barrel of a grade is worth once refined, at the given product prices (before opex). */
export function productValue(grade: Grade, prices: ProductPrices): number {
  const shares = YIELDS[grade].products;
  return PRODUCTS.reduce((sum, p) => sum + shares[p] * prices[p], 0);
}

// ─── Retail sink (spec §4.13, §7.3) ──────────────────────────────────────────────────────────

/**
 * The retail market: buys all refined output at today's prices. Plain data, so it saves and
 * forks with the world. `deviation` is x(p, t), the log-distance of each price from its fair value.
 */
export interface RetailSink {
  tick: Tick;
  prices: Record<Product, number>;
  fairValues: Record<Product, number>;
  deviations: Record<Product, number>;
  expectedPrices: Record<Product, number>;
  /** The anchor prices. Start at the config's BASE; persistent shocks move them. */
  bases: Record<Product, number>;
  /**
   * The economic climate: about −1 in the worst of a panic, 0 in an ordinary market, about +1 at the
   * top of a boom. It multiplies the anchor, so the whole band a price may wander in moves with it
   * rather than the price pushing against a fixed floor (§12A.8, B).
   */
  climate: number;
  /** What it is being called. Kept, because what it is called depends on what it was called. */
  economicClimate: EconomicClimate;
  /** Barrels refined in each of the last SUPPLY_WINDOW finished ticks, oldest first. */
  outputHistory: number[];
  /** Barrels refined so far in the current tick. */
  outputToday: number;
  rng: Rng;
}

/** A sink at tick 0: every price at its fair value, with no deviation yet. */
export function createRetailSink(seed: string, config: Config): RetailSink {
  const cfg = config.PRODUCT_PRICES;
  const bases = perProduct((p) => cfg.BASE[p]);
  const fairValues = perProduct((p) => fairValue(p, 0, bases, 1, cfg));
  return {
    tick: 0,
    prices: { ...fairValues },
    fairValues,
    deviations: perProduct(() => 0),
    expectedPrices: { ...fairValues },
    bases,
    climate: 0,
    economicClimate: 'NORMAL',
    outputHistory: [],
    outputToday: 0,
    rng: rngFor(seed, 'products'),
  };
}

/**
 * Advances prices to the next tick (spec §5 phase 0). Today's refinery output is closed into the
 * history first, so prices respond only to finished ticks and never to refining in the same tick.
 * `baselineOutput` is Σ processing capacity × BASE_UTILIZATION across all refineries.
 */
/**
 * The economic climate, in a word: the five Capitalism 2 names, which is all a player is ever told about the
 * number behind them (owner, 2026-09-24).
 */
export const ECONOMIC_CLIMATES = ['PANIC', 'RECESSION', 'NORMAL', 'PROSPEROUS', 'BOOM'] as const;
export type EconomicClimate = (typeof ECONOMIC_CLIMATES)[number];

/** The edges between the five, in order: edge i divides ECONOMIC_CLIMATES[i] from ECONOMIC_CLIMATES[i + 1]. */
const edgesOf = (config: Config) => {
  const b = config.CLIMATE.BANDS;
  return [b.PANIC, b.RECESSION, b.PROSPEROUS, b.BOOM];
};

/**
 * What to call this climate. Given what it was called yesterday the answer is sticky: every edge
 * moves away from the economic climate you are already in, so the drift has to mean it before the market
 * gets a new name.
 */
export function weatherOf(climate: number, config: Config, was?: EconomicClimate): EconomicClimate {
  const edges = edgesOf(config);
  const shifted = was === undefined ? edges
    : edges.map((e, k) => (k >= ECONOMIC_CLIMATES.indexOf(was) ? e + config.CLIMATE.STICK : e - config.CLIMATE.STICK));
  let i = 0;
  while (i < shifted.length && climate >= (shifted[i] as number)) i += 1;
  return ECONOMIC_CLIMATES[i] as EconomicClimate;
}

/**
 * What the climate does to wages today. Everything a company pays for work — lifting a barrel,
 * keeping a field running, building anything — is dearer in a boom and cheaper in a panic. It never
 * goes below `1 - LABOUR`, so a cost can never turn into a payment.
 */
export function labourFactor(climate: number, config: Config): number {
  return Math.max(0.1, 1 + config.CLIMATE.LABOUR * climate);
}

/**
 * One day of the climate (§12A.8, B). Ornstein–Uhlenbeck with a compound-Poisson jump term: it
 * drifts gently and works its way back towards an ordinary market, and now and then it turns
 * outright. That is what makes a bust something a company has to survive for a year or two rather
 * than a bad fortnight — the decay is what ends it, and the decay is slow.
 *
 * Returns what the economic climate was called before and after, so the day can say when it turned.
 */
export function advanceClimate(
  sink: RetailSink, rng: Rng, config: Config, day: number,
): { readonly was: EconomicClimate; readonly now: EconomicClimate } {
  const cfg = config.CLIMATE;
  const was = sink.economicClimate;
  const decay = Math.log(2) / cfg.HALF_LIFE;
  let c = (1 - decay) * sink.climate + cfg.SIGMA * normal(rng);
  // A jump is drawn every day so the stream advances at the same rate whether or not one lands;
  // a climate whose randomness depended on its own history would be far harder to reason about.
  const roll = nextFloat(rng);
  const size = cfg.JUMP.MIN + nextFloat(rng) * (cfg.JUMP.MAX - cfg.JUMP.MIN);
  const up = nextFloat(rng) < 0.5;
  if (roll < cfg.JUMP_RATE && day >= cfg.CALM_DAYS) c += up ? size : -size;
  sink.climate = quantize(clamp(c, -cfg.MAX, cfg.MAX));
  sink.economicClimate = weatherOf(sink.climate, config, was);
  return { was, now: sink.economicClimate };
}

/**
 * What the climate does to each anchor today. A panic takes them down and a boom lifts them, but
 * not equally: what people cannot do without moves least (the necessity index, above).
 */
function anchors(sink: RetailSink, config: Config): ProductPrices {
  const cfg = config.CLIMATE;
  return perProduct((p) => roundPrice(sink.bases[p] * Math.max(0.1, 1 + cfg.DEPTH * cfg.NECESSITY[p] * sink.climate)));
}

export function updatePrices(sink: RetailSink, baselineOutput: number, config: Config): void {
  const cfg = config.PRODUCT_PRICES;
  sink.outputHistory.push(sink.outputToday);
  if (sink.outputHistory.length > cfg.SUPPLY_WINDOW) sink.outputHistory.shift();
  sink.outputToday = 0;
  sink.tick += 1;

  const supply = supplyFactor(sink.outputHistory, baselineOutput, cfg);
  const shocks = correlatedNormals(sink.rng, cholesky(correlationMatrix(cfg)));
  // The climate moves the anchor, and the floor and ceiling move with it: within a given climate a
  // price wanders the same band it always did, and the climate carries the band.
  const anchor = anchors(sink, config);
  PRODUCTS.forEach((p, i) => {
    const x = quantize((1 - cfg.THETA) * sink.deviations[p] + cfg.SIGMA[p] * (shocks[i] ?? 0));
    const fair = fairValue(p, sink.tick, anchor, supply, cfg);
    const base = anchor[p];
    sink.deviations[p] = x;
    sink.fairValues[p] = fair;
    sink.prices[p] = roundPrice(clamp(fair * Math.exp(x), cfg.PRICE_FLOOR * base, cfg.PRICE_CEILING * base));
    sink.expectedPrices[p] = cfg.LAMBDA * sink.prices[p] + (1 - cfg.LAMBDA) * sink.expectedPrices[p];
  });
}

/**
 * A price shock from an event (spec §7.3). A temporary shock pushes the price away from fair value
 * and fades through mean reversion; a persistent one moves the anchor itself. Either takes effect
 * at the next price update.
 */
export function applyShock(sink: RetailSink, product: Product, pct: number, persistent: boolean): void {
  if (!(pct > -1)) throw new Error(`A shock of ${pct} would make ${product} worthless`);
  if (persistent) sink.bases[product] *= 1 + pct;
  else sink.deviations[product] = quantize(sink.deviations[product] + Math.log(1 + pct));
}

/** The sink buys refined barrels of one grade at today's prices; returns the revenue in $. */
export function sellToSink(sink: RetailSink, grade: Grade, barrels: number): number {
  if (!(barrels >= 0)) throw new Error(`Cannot sell ${barrels} barrels`);
  sink.outputToday += barrels;
  return barrels * productValue(grade, sink.prices);
}

function fairValue(p: Product, tick: Tick, bases: ProductPrices, supply: number, cfg: ProductPriceConfig): number {
  const dayOfYear = (cfg.START_DAY_OF_YEAR + tick) % 365;
  const season = 1 + cfg.AMPLITUDE[p] * Math.sin((2 * Math.PI * (dayOfYear - cfg.PHASE[p])) / 365);
  return roundPrice(bases[p] * season * supply);
}

/** 1 until the window fills; then output below the baseline lifts prices, weakly and within bounds. */
function supplyFactor(history: readonly number[], baseline: number, cfg: ProductPriceConfig): number {
  if (history.length < cfg.SUPPLY_WINDOW || baseline <= 0) return 1;
  const ratio = history.reduce((s, x) => s + x, 0) / history.length / baseline;
  if (ratio <= 0) return cfg.SUPPLY_MAX;
  return clamp(ratio ** -cfg.BETA, cfg.SUPPLY_MIN, cfg.SUPPLY_MAX);
}

function correlationMatrix(cfg: ProductPriceConfig): number[][] {
  const { GASOLINE_DIESEL: gd, GASOLINE_FUEL_OIL: gf, DIESEL_FUEL_OIL: df } = cfg.CORRELATION;
  return [[1, gd, gf], [gd, 1, df], [gf, df, 1]];   // rows in PRODUCTS order
}

/** Rounds to 1e-9 so last-bit differences between JavaScript engines cannot compound (spec G10 rule 3). */
function quantize(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

/**
 * Rounds a published price to 1e-6 $/bbl (spec G10 rule 3). Math.exp and Math.sin may differ in
 * the last bit between JavaScript engines — the golden replay caught Chrome and Node disagreeing
 * on one gasoline price — and revenue multiplies that bit by thousands of barrels. Everything
 * computed from a rounded price is plain arithmetic, which is exact everywhere.
 */
function roundPrice(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function perProduct(f: (p: Product) => number): Record<Product, number> {
  return { GASOLINE: f('GASOLINE'), DIESEL: f('DIESEL'), FUEL_OIL: f('FUEL_OIL') };
}
