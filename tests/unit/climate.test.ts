// The economic climate (spec §12A.8, B): one number behind five words, moving the anchor every
// price is judged against and the wages every job is paid at. What these hold to is the shape the
// owner asked for — steady, with a few jumps — and the rule that a boom is not a free ride.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withOverrides } from '../../src/engine/config';
import {
  advanceClimate, createRetailSink, labourFactor, updatePrices, weatherOf, ECONOMIC_CLIMATES, type RetailSink,
} from '../../src/engine/economics';
import { rngFor } from '../../src/engine/rng';

const cfg = DEFAULT_CONFIG;
const sink = () => createRetailSink('climate', cfg);
/** No drift and no jumps: what is left is the decay alone, which is the part that ends a bust. */
const still = withOverrides(cfg, { CLIMATE: { SIGMA: 0, JUMP_RATE: 0 } });

describe('what the climate is called', () => {
  it('names the five, in order, from panic to boom', () => {
    const seen = [-1, -0.5, 0, 0.5, 1].map((c) => weatherOf(c, cfg));
    expect(seen).toEqual(['PANIC', 'RECESSION', 'NORMAL', 'PROSPEROUS', 'BOOM']);
    expect(ECONOMIC_CLIMATES).toEqual(seen);
  });

  it('is sticky: it takes more than a step over the line to be called something else', () => {
    const b = cfg.CLIMATE.BANDS;
    const stick = cfg.CLIMATE.STICK;
    // Just over the edge out of a recession, and it is still a recession.
    expect(weatherOf(b.RECESSION + stick / 2, cfg, 'RECESSION')).toBe('RECESSION');
    expect(weatherOf(b.RECESSION + stick * 1.5, cfg, 'RECESSION')).toBe('NORMAL');
    // And the same going the other way, so it cannot flicker across a line from one day to the next.
    expect(weatherOf(b.RECESSION - stick / 2, cfg, 'NORMAL')).toBe('NORMAL');
    expect(weatherOf(b.RECESSION - stick * 1.5, cfg, 'NORMAL')).toBe('RECESSION');
  });
});

describe('how it moves', () => {
  it('works its way back to an ordinary market, at the half-life it is given', () => {
    const s = sink();
    s.climate = 1;
    const rng = rngFor('decay', 'climate');
    for (let d = 0; d < still.CLIMATE.HALF_LIFE; d++) advanceClimate(s, rng, still, d);
    expect(s.climate).toBeCloseTo(0.5, 2);
  });

  it('jumps about as often as it is told to, and both ways', () => {
    const s = sink();
    const rng = rngFor('jumps', 'climate');
    let jumps = 0;
    let up = 0;
    for (let d = 0; d < 200_000; d++) {
      const before = s.climate;
      advanceClimate(s, rng, withOverrides(cfg, { CLIMATE: { SIGMA: 0 } }), cfg.CLIMATE.CALM_DAYS + d);
      // Only a jump moves it by more than the decay could.
      if (Math.abs(s.climate - before) > cfg.CLIMATE.JUMP.MIN / 2) {
        jumps += 1;
        if (s.climate > before) up += 1;
      }
    }
    const rate = jumps / 200_000;
    expect(rate).toBeGreaterThan(cfg.CLIMATE.JUMP_RATE * 0.75);
    expect(rate).toBeLessThan(cfg.CLIMATE.JUMP_RATE * 1.25);
    expect(up / jumps).toBeGreaterThan(0.4);
    expect(up / jumps).toBeLessThan(0.6);
  });

  it('leaves a first year alone, so nobody is lost to economicClimate before they have played a year', () => {
    const s = sink();
    const rng = rngFor('calm', 'climate');
    const wild = withOverrides(cfg, { CLIMATE: { JUMP_RATE: 0.9, SIGMA: 0 } });
    for (let d = 0; d < cfg.CLIMATE.CALM_DAYS; d++) advanceClimate(s, rng, wild, d);
    expect(s.climate).toBe(0);
    expect(s.economicClimate).toBe('NORMAL');
    advanceClimate(s, rng, wild, cfg.CLIMATE.CALM_DAYS);
    expect(Math.abs(s.climate)).toBeGreaterThan(0);
  });

  it('cannot run off the end of the world, however the jumps fall', () => {
    const s = sink();
    const rng = rngFor('runaway', 'climate');
    const wild = withOverrides(cfg, { CLIMATE: { JUMP_RATE: 0.5 } });
    for (let d = 0; d < 5_000; d++) {
      advanceClimate(s, rng, wild, cfg.CLIMATE.CALM_DAYS + d);
      expect(Math.abs(s.climate)).toBeLessThanOrEqual(cfg.CLIMATE.MAX);
    }
  });

  it('runs the same way every time from the same seed', () => {
    const one = sink();
    const two = sink();
    const a = rngFor('same', 'climate');
    const b = rngFor('same', 'climate');
    for (let d = 0; d < 500; d++) { advanceClimate(one, a, cfg, d); advanceClimate(two, b, cfg, d); }
    expect(one.climate).toBe(two.climate);
  });

  it('draws from its own stream, so a day of economicClimate does not move a day of prices', () => {
    const s = sink();
    const before = { ...s.rng };
    advanceClimate(s, rngFor('apart', 'climate'), cfg, 0);
    expect({ ...s.rng }).toEqual(before);
  });
});

describe('what it does to a company', () => {
  const at = (climate: number): RetailSink => {
    const s = sink();
    s.climate = climate;
    updatePrices(s, 0, cfg);
    return s;
  };

  it('takes prices down in a panic and lifts them in a boom', () => {
    expect(at(-1).prices.DIESEL).toBeLessThan(at(0).prices.DIESEL);
    expect(at(1).prices.DIESEL).toBeGreaterThan(at(0).prices.DIESEL);
  });

  it('moves what people cannot do without least of all', () => {
    const normal = at(0);
    const panic = at(-1);
    const fell = (p: 'GASOLINE' | 'DIESEL' | 'FUEL_OIL') => 1 - panic.prices[p] / normal.prices[p];
    // Petrol is the stickiest, fuel oil the most cyclical: people drive to work in a recession,
    // and industry stops (the necessity index, §12A.8 B).
    expect(fell('GASOLINE')).toBeLessThan(fell('DIESEL'));
    expect(fell('DIESEL')).toBeLessThan(fell('FUEL_OIL'));
  });

  it('carries the floor and the ceiling with it, rather than pressing a price against a fixed one', () => {
    // A panic four tenths down would sit under a floor fixed at seven tenths of the base price; the
    // whole band moves instead, which is what lets a bust be a bust.
    expect(at(-1).prices.DIESEL).toBeLessThan(cfg.PRODUCT_PRICES.PRICE_FLOOR * cfg.PRODUCT_PRICES.BASE.DIESEL);
  });

  it('makes a boom dearer to build in, and a panic cheaper — but never free', () => {
    expect(labourFactor(1, cfg)).toBeGreaterThan(1);
    expect(labourFactor(-1, cfg)).toBeLessThan(1);
    expect(labourFactor(-1, cfg)).toBeGreaterThan(0);
    // Wages move less than prices, so the gap between them is the margin, and a panic closes it.
    expect(cfg.CLIMATE.LABOUR).toBeLessThan(cfg.CLIMATE.DEPTH);
  });
});
