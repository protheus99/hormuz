// Company settings and personalities (spec G4.2, G8; Phase 5 acceptance: settings are monotonic).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHOKEPOINT_NAMES } from '../../src/data/chokepoints';
import { createProducer, createRefiner, presetSettings } from '../../src/engine/companies';
import { configFor, DEFAULT_CONFIG } from '../../src/engine/config';
import { CHOKEPOINT_STATUSES, type RiskSetting } from '../../src/engine/enums';
import type { CompanySettings } from '../../src/engine/model';
import { avoidFor, buildLaneGraph, setChokepoint } from '../../src/engine/transport';

const middle: CompanySettings = { risk: 'BALANCED', selling: 'BALANCED', stockpile: 'NORMAL', appetite: 'MEDIUM' };

describe('personality presets (spec G8)', () => {
  it('maps each personality onto the settings', () => {
    expect(presetSettings('CONSERVATIVE')).toEqual({ risk: 'SAFE', selling: 'HOLD_FOR_PRICE', stockpile: 'DEEP', appetite: 'LOW' });
    expect(presetSettings('AGGRESSIVE')).toEqual({ risk: 'BOLD', selling: 'SELL_FAST', stockpile: 'LEAN', appetite: 'HIGH' });
    expect(presetSettings('BALANCED')).toEqual(middle);
    expect(presetSettings(null)).toEqual(middle);   // the player's company
  });

  it('gives new companies their preset, and lets a spec override one setting', () => {
    const r = createRefiner({
      id: 'r', name: 'R', region: 'Coastal_Asia', cash: 1, techTier: 1, processingCapacity: 1, crudeStorageCapacity: 1,
      personality: 'CONSERVATIVE', settings: { risk: 'BOLD' },
    });
    expect(r.settings).toEqual({ ...presetSettings('CONSERVATIVE'), risk: 'BOLD' });
    const player = createProducer({
      id: 'p', name: 'P', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 1, extractionCapacity: 1, baseExtractionCost: 1, storageCapacity: 1,
      controller: 'HUMAN',
    });
    expect(player.settings).toEqual(middle);
  });
});

describe('configFor (spec G4.2)', () => {
  it('applies the table exactly', () => {
    const sellFast = configFor({ ...middle, selling: 'SELL_FAST' }, DEFAULT_CONFIG);
    expect([sellFast.SKEW, sellFast.MIN_MARGIN, sellFast.DUMP_THRESHOLD]).toEqual([0.20, 0.50, 0.80]);
    const deep = configFor({ ...middle, stockpile: 'DEEP' }, DEFAULT_CONFIG);
    expect([deep.TARGET_DAYS, deep.URGENCY]).toEqual([20, 0.05]);
    const high = configFor({ ...middle, appetite: 'HIGH' }, DEFAULT_CONFIG);
    expect([high.MAX_RISK_LIMIT, high.HALF_SPREAD]).toEqual([10_000_000, 0.25]);
  });

  it('leaves the defaults unchanged for the middle options, and never alters the base', () => {
    const cfg = configFor(middle, DEFAULT_CONFIG);
    for (const k of ['SKEW', 'MIN_MARGIN', 'DUMP_THRESHOLD', 'TARGET_DAYS', 'URGENCY', 'HALF_SPREAD', 'MAX_RISK_LIMIT'] as const) {
      expect(cfg[k], k).toBe(DEFAULT_CONFIG[k]);
    }
    configFor({ ...middle, stockpile: 'DEEP' }, DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.TARGET_DAYS).toBe(10);
  });

  it('is monotonic: Deep never targets fewer days than Lean; Hold never asks a smaller margin than Sell fast', () => {
    const days = (['LEAN', 'NORMAL', 'DEEP'] as const).map((s) => configFor({ ...middle, stockpile: s }, DEFAULT_CONFIG).TARGET_DAYS);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    const margins = (['SELL_FAST', 'BALANCED', 'HOLD_FOR_PRICE'] as const).map((s) => configFor({ ...middle, selling: s }, DEFAULT_CONFIG).MIN_MARGIN);
    expect(margins).toEqual([...margins].sort((a, b) => a - b));
  });
});

describe('Risk and route avoidance (spec G4.2)', () => {
  it('avoids nothing when Bold, DELAYED or worse when Balanced, TENSION or worse when Safe', () => {
    const g = buildLaneGraph(DEFAULT_CONFIG);
    setChokepoint(g, 'HORMUZ', 'TENSION');
    setChokepoint(g, 'SUEZ', 'DELAYED', 3);
    setChokepoint(g, 'PANAMA', 'CLOSED');
    expect(avoidFor('BOLD', g)).toEqual([]);
    expect(avoidFor('BALANCED', g)).toEqual(['SUEZ', 'PANAMA']);
    expect(avoidFor('SAFE', g)).toEqual(['HORMUZ', 'SUEZ', 'PANAMA']);
  });

  it('is monotonic for any mix of statuses: Safe avoids everything Balanced does, and Balanced everything Bold does', () => {
    const statuses = fc.array(fc.constantFrom(...CHOKEPOINT_STATUSES), { minLength: CHOKEPOINT_NAMES.length, maxLength: CHOKEPOINT_NAMES.length });
    fc.assert(fc.property(statuses, (list) => {
      const g = buildLaneGraph(DEFAULT_CONFIG);
      CHOKEPOINT_NAMES.forEach((c, i) => setChokepoint(g, c, list[i] ?? 'OPEN'));
      const avoided = (r: RiskSetting) => new Set(avoidFor(r, g));
      const [bold, balanced, safe] = [avoided('BOLD'), avoided('BALANCED'), avoided('SAFE')];
      for (const c of bold) expect(balanced.has(c)).toBe(true);
      for (const c of balanced) expect(safe.has(c)).toBe(true);
    }));
  });
});
