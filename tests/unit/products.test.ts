// Refinery yields, product value and the retail sink's prices (spec §7.2–7.3, Phase 3 acceptance).

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withOverrides, type Config } from '../../src/engine/config';
import { GRADES, PRODUCTS, type Product } from '../../src/engine/enums';
import {
  applyShock, createRetailSink, productValue, sellToSink, updatePrices, YIELDS, type RetailSink,
} from '../../src/engine/economics';

const BASELINE = 20_000;   // barrels a day treated as normal output in these tests
const cfg = DEFAULT_CONFIG.PRODUCT_PRICES;

/** Runs the sink for n ticks with output exactly at the baseline, returning each tick's state. */
function run(sink: RetailSink, n: number, config: Config = DEFAULT_CONFIG, output = BASELINE): RetailSink[] {
  const path: RetailSink[] = [];
  for (let t = 0; t < n; t++) {
    sink.outputToday = output;
    updatePrices(sink, BASELINE, config);
    path.push(structuredClone(sink));
  }
  return path;
}

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: readonly number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const corr = (xs: readonly number[], ys: readonly number[]) => {
  const mx = mean(xs), my = mean(ys);
  return mean(xs.map((x, i) => (x - mx) * ((ys[i] ?? 0) - my))) / (sd(xs) * sd(ys));
};
const diffs = (xs: readonly number[]) => xs.slice(1).map((x, i) => x - (xs[i] ?? 0));

describe('yields and product value (spec §7.2)', () => {
  it('splits every barrel completely into products', () => {
    for (const g of GRADES) expect(PRODUCTS.reduce((s, p) => s + YIELDS[g].products[p], 0)).toBeCloseTo(1, 12);
  });

  it('values a barrel as the yield-weighted sum of product prices', () => {
    // Light sweet at base prices: 0.60 × 95 + 0.40 × 100 = 97.
    expect(productValue('LIGHT_SWEET', cfg.BASE)).toBeCloseTo(97, 10);
    // Heavy sour: 0.38 × 95 + 0.44 × 100 + 0.18 × 55 = 90.00.
    expect(productValue('HEAVY_SOUR', cfg.BASE)).toBeCloseTo(90, 10);
  });

  it('makes lighter crude worth more and cheaper to refine', () => {
    const margin = (g: 'LIGHT_SWEET' | 'MEDIUM' | 'HEAVY_SOUR') => productValue(g, cfg.BASE) - YIELDS[g].opex;
    expect(margin('LIGHT_SWEET')).toBeGreaterThan(margin('MEDIUM'));
    expect(margin('MEDIUM')).toBeGreaterThan(margin('HEAVY_SOUR'));
  });
});

describe('retail sink (spec §4.13)', () => {
  it('starts every price at its fair value on January 1', () => {
    const sink = createRetailSink('seed-1', DEFAULT_CONFIG);
    expect(sink.tick).toBe(0);
    expect(sink.deviations).toEqual({ GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 });
    expect(sink.prices).toEqual(sink.fairValues);
    expect(sink.prices.FUEL_OIL).toBe(55);   // no seasonality
  });

  it('pays for refined barrels at today’s prices and counts them as output', () => {
    const sink = createRetailSink('seed-1', DEFAULT_CONFIG);
    const revenue = sellToSink(sink, 'MEDIUM', 1000);
    expect(revenue).toBeCloseTo(1000 * productValue('MEDIUM', sink.prices), 6);
    expect(sink.outputToday).toBe(1000);
    updatePrices(sink, BASELINE, DEFAULT_CONFIG);
    expect(sink.outputToday).toBe(0);
    expect(sink.outputHistory).toEqual([1000]);
  });

  it('keeps prices exactly at base when σ, seasonality and supply response are off (Phase 3 acceptance)', () => {
    const flat = withOverrides(DEFAULT_CONFIG, {
      PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 }, AMPLITUDE: { GASOLINE: 0, DIESEL: 0 }, BETA: 0 },
    });
    const path = run(createRetailSink('seed-1', flat), 400, flat, 3_000);   // output far below baseline too
    for (const s of path) expect(s.prices).toEqual(cfg.BASE);
  });

  it('is reproducible from its seed, and different seeds give different paths', () => {
    const a = run(createRetailSink('seed-1', DEFAULT_CONFIG), 50).map((s) => s.prices);
    const b = run(createRetailSink('seed-1', DEFAULT_CONFIG), 50).map((s) => s.prices);
    const c = run(createRetailSink('seed-2', DEFAULT_CONFIG), 50).map((s) => s.prices);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('rounds each deviation to 1e-9, and each price and fair value to 1e-6 (spec G10 rule 3)', () => {
    const onGrid = (x: number, step: number) => expect(Math.round(x / step)).toBeCloseTo(x / step, 3);
    for (const s of run(createRetailSink('seed-1', DEFAULT_CONFIG), 30)) {
      for (const p of PRODUCTS) {
        onGrid(s.deviations[p], 1e-9);
        onGrid(s.prices[p], 1e-6);
        onGrid(s.fairValues[p], 1e-6);
      }
    }
  });

  it('peaks gasoline in July and diesel in January', () => {
    const calm = withOverrides(DEFAULT_CONFIG, { PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 } } });
    const year = run(createRetailSink('seed-1', calm), 365, calm);
    const peakDay = (p: Product) => year.reduce((best, s) => (s.fairValues[p] > (year[best]?.fairValues[p] ?? 0) ? s.tick : best), 0);
    expect(peakDay('GASOLINE')).toBeGreaterThanOrEqual(190);   // mid-July
    expect(peakDay('GASOLINE')).toBeLessThanOrEqual(200);
    expect(peakDay('DIESEL')).toBeGreaterThanOrEqual(10);      // mid-January
    expect(peakDay('DIESEL')).toBeLessThanOrEqual(20);
  });
});

describe('supply feedback (spec §7.3)', () => {
  const noNoise = withOverrides(DEFAULT_CONFIG, {
    PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 }, AMPLITUDE: { GASOLINE: 0, DIESEL: 0 } },
  });

  it('ignores output until a full window of history exists', () => {
    const path = run(createRetailSink('seed-1', noNoise), 6, noNoise, BASELINE * 0.5);
    for (const s of path) expect(s.fairValues).toEqual(cfg.BASE);
  });

  it('raises fair values about 1% when output runs 10% below normal', () => {
    const path = run(createRetailSink('seed-1', noNoise), 10, noNoise, BASELINE * 0.9);
    expect(path.at(-1)?.fairValues.DIESEL).toBeCloseTo(100 * 0.9 ** -0.1, 5);   // ≈ 101.06
  });

  it('stays within its bounds when refining collapses', () => {
    const path = run(createRetailSink('seed-1', noNoise), 10, noNoise, 0);
    expect(path.at(-1)?.fairValues.DIESEL).toBeCloseTo(100 * cfg.SUPPLY_MAX, 9);
  });
});

describe('shocks (spec §7.3)', () => {
  const noNoise = withOverrides(DEFAULT_CONFIG, {
    PRODUCT_PRICES: { SIGMA: { GASOLINE: 0, DIESEL: 0, FUEL_OIL: 0 }, AMPLITUDE: { GASOLINE: 0, DIESEL: 0 } },
  });

  it('lets a temporary shock fade back to fair value, at the half-life THETA sets', () => {
    const sink = createRetailSink('seed-1', noNoise);
    applyShock(sink, 'DIESEL', 0.20, false);
    const halfLife = Math.round(Math.log(2) / noNoise.PRODUCT_PRICES.THETA);
    const path = run(sink, 4 * halfLife, noNoise);
    expect(path[0]?.prices.DIESEL).toBeCloseTo(100 * 1.2 ** (1 - noNoise.PRODUCT_PRICES.THETA), 4);
    // Half the shock gone by the half-life, and all but a trace of it by four of them. Slow enough
    // that a bad price is a bad year rather than a bad fortnight (§12A.8, B).
    expect(path[halfLife - 1]?.prices.DIESEL).toBeCloseTo(100 * 1.2 ** 0.5, 0);
    expect(path.at(-1)?.prices.DIESEL).toBeCloseTo(100 * 1.2 ** 2 ** -4, 1);
  });

  it('lets a persistent shock move the anchor for good', () => {
    const sink = createRetailSink('seed-1', noNoise);
    applyShock(sink, 'GASOLINE', 0.10, true);
    expect(run(sink, 60, noNoise).at(-1)?.prices.GASOLINE).toBeCloseTo(104.5, 9);
  });

  it('refuses a shock that would take a price to zero', () => {
    expect(() => applyShock(createRetailSink('seed-1', noNoise), 'DIESEL', -1, false)).toThrow(/worthless/);
  });
});

describe('ten-year price statistics (Phase 3 acceptance)', () => {
  const years = run(createRetailSink('hormuz-golden', DEFAULT_CONFIG), 3650);

  it.each(PRODUCTS)('keeps %s’s mean on base, within what the sample can say', (p) => {
    // The band has to come from the process, not from a number typed once: a price that reverts
    // slowly wanders further and takes longer to average out, so ten years holds far fewer
    // independent samples than it holds days. Roughly `days × THETA` of them (§12A.8, B).
    const stationary = cfg.SIGMA[p] / Math.sqrt(2 * cfg.THETA - cfg.THETA ** 2);
    const standardError = stationary / Math.sqrt(years.length * cfg.THETA);
    expect(Math.abs(mean(years.map((s) => s.prices[p])) / cfg.BASE[p] - 1)).toBeLessThan(3 * standardError);
  });

  it.each(PRODUCTS)('keeps %s’s volatility within 20% of theory', (p) => {
    const theory = cfg.SIGMA[p] / Math.sqrt(2 * cfg.THETA - cfg.THETA ** 2);
    expect(Math.abs(sd(years.map((s) => s.deviations[p])) / theory - 1)).toBeLessThan(0.2);
  });

  it('keeps daily moves correlated as configured, within 0.1', () => {
    const moves = (p: Product) => diffs(years.map((s) => s.deviations[p]));
    expect(Math.abs(corr(moves('GASOLINE'), moves('DIESEL')) - 0.70)).toBeLessThan(0.1);
    expect(Math.abs(corr(moves('GASOLINE'), moves('FUEL_OIL')) - 0.40)).toBeLessThan(0.1);
    expect(Math.abs(corr(moves('DIESEL'), moves('FUEL_OIL')) - 0.50)).toBeLessThan(0.1);
  });

  it('never breaks the price floor or ceiling', () => {
    for (const s of years) {
      for (const p of PRODUCTS) {
        expect(s.prices[p]).toBeGreaterThanOrEqual(cfg.PRICE_FLOOR * cfg.BASE[p]);
        expect(s.prices[p]).toBeLessThanOrEqual(cfg.PRICE_CEILING * cfg.BASE[p]);
      }
    }
  });

  it('smooths expectations so they move less than prices', () => {
    const daily = (pick: (s: RetailSink) => number) => sd(diffs(years.map(pick)));
    expect(daily((s) => s.expectedPrices.DIESEL)).toBeLessThan(daily((s) => s.prices.DIESEL) / 3);
  });
});
