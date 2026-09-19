// Decision rules, table-driven (spec §6.1–6.3; Phase 5 acceptance: exact expected orders).
//
// The world: the real lane graph with every chokepoint open, base product prices, and exchange
// nodes whose previous close is set by hand. Qasr (Middle_East, heavy) costs 10 × 0.75 = $7.50 and
// pays a $0.20 export tariff; Straits (Coastal_Asia, Tier 3, 8,000 bbl/day) pays a $1.00 import
// tariff. Middle_East → Coastal_Asia is $2.50 freight over 16 days.

import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, type ExchangeNode } from '../../src/engine/clearing';
import { createIntegrated, createProducer, createRefiner } from '../../src/engine/companies';
import { configFor, DEFAULT_CONFIG, type Config } from '../../src/engine/config';
import { isBid, type Order, type Producer, type Refiner } from '../../src/engine/model';
import { decideOrders, type MarketView } from '../../src/engine/rules';
import { buildLaneGraph, LaneRouteProvider } from '../../src/engine/transport';

let nodes: { DME: ExchangeNode; NC: ExchangeNode; NYMEX: ExchangeNode };
let view: MarketView;
beforeEach(() => {
  nodes = { DME: createNode('DME'), NC: createNode('NC'), NYMEX: createNode('NYMEX') };
  nodes.DME.lastFobByOrigin.Middle_East = 58.6;
  view = {
    tick: 10, nodes, routes: new LaneRouteProvider(buildLaneGraph(DEFAULT_CONFIG)),
    expectedPrices: DEFAULT_CONFIG.PRODUCT_PRICES.BASE, avoid: [], dealCommitments: 0,
  };
});

const qasr = (storage: number): Producer => createProducer({
  id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2_000_000,
  extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000, storage,
});
const straits = (heavy = 0, cash = 3_000_000): Refiner => createRefiner({
  id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash, techTier: 3,
  processingCapacity: 8000, crudeStorageCapacity: 25_000, crudeStock: { HEAVY_SOUR: heavy },
});
/** The parts of an order a test cares about. */
const brief = (orders: Order[]) => orders.map((o) => [o.side, o.node, o.limitPrice, o.qty]);

describe('producer asks (spec §6.1)', () => {
  it('normal: asks yesterday’s close for everything in storage', () => {
    expect(brief(decideOrders(qasr(15_000), 0, view, DEFAULT_CONFIG))).toEqual([['ASK', 'DME', 58.6, 15_000]]);
  });

  it('storage filling: shades the ask by SKEW × (fill − 0.5)', () => {
    // 80% full: 58.6 × (1 − 0.10 × 0.30) = 56.842, rounded up to the cent.
    expect(brief(decideOrders(qasr(24_000), 0, view, DEFAULT_CONFIG))).toEqual([['ASK', 'DME', 56.85, 24_000]]);
  });

  it('dump threshold: offers the excess above 70% fill at cash cost', () => {
    // 95% full: 28,500 − 21,000 = 7,500 → 7,000 in whole lots at $7.50; the rest at 58.6 × 0.955.
    expect(brief(decideOrders(qasr(28_500), 0, view, DEFAULT_CONFIG))).toEqual([
      ['ASK', 'DME', 55.97, 21_000],
      ['ASK', 'DME', 7.5, 7_000],
    ]);
  });

  it('no reference price: uses the marker less freight to the marker region', () => {
    nodes.DME.lastFobByOrigin = {};
    // DME's marker region is Middle_East itself, so no freight: the starting marker, 62.
    expect(brief(decideOrders(qasr(15_000), 0, view, DEFAULT_CONFIG))).toEqual([['ASK', 'DME', 62, 15_000]]);
  });

  it('never asks below cash cost + tariff + margin', () => {
    nodes.DME.lastFobByOrigin.Middle_East = 5;
    expect(brief(decideOrders(qasr(15_000), 0, view, DEFAULT_CONFIG))).toEqual([['ASK', 'DME', 8.7, 15_000]]);
  });

  it('holds back what tomorrow’s deals need', () => {
    expect(brief(decideOrders(qasr(15_000), 0, { ...view, dealCommitments: 5_500 }, DEFAULT_CONFIG))).toEqual([['ASK', 'DME', 58.6, 9_000]]);
  });

  it('Hold for price asks more than Sell fast when storage is full (settings are monotonic)', () => {
    const price = (cfg: Config) => decideOrders(qasr(27_000), 0, view, cfg)[0]?.limitPrice ?? 0;
    const settings = { risk: 'BALANCED', selling: 'SELL_FAST', stockpile: 'NORMAL', appetite: 'MEDIUM' } as const;
    expect(price(configFor({ ...settings, selling: 'HOLD_FOR_PRICE' }, DEFAULT_CONFIG)))
      .toBeGreaterThan(price(configFor(settings, DEFAULT_CONFIG)));
  });
});

describe('refiner bids (spec §6.2)', () => {
  // DME: heavy worth 90 − 11 opex = 79 a barrel, less $0.10 × 16 days carry = 77.40 delivered.
  // Reference landed: 58.60 + 2.50 freight + 1.00 tariff = 62.10.

  it('empty tanks: bids the reference plus full urgency, for all the space it has', () => {
    // Target 10 days × 8,000 = 80,000; starvation 1 → 62.10 × 1.08 = 67.068; tanks hold 25,000.
    expect(brief(decideOrders(straits(), 1, view, DEFAULT_CONFIG))).toEqual([['BID', 'DME', 67.06, 25_000]]);
  });

  it('part stocked: less urgency, and only the tank space left', () => {
    // 20,000 held: starvation 0.75 → 62.10 × 1.06 = 65.826; 5,000 of space.
    expect(brief(decideOrders(straits(20_000), 1, view, DEFAULT_CONFIG))).toEqual([['BID', 'DME', 65.82, 5_000]]);
  });

  it('offline: needs nothing, bids nothing', () => {
    const r = straits();
    r.online = false;
    expect(decideOrders(r, 1, view, DEFAULT_CONFIG)).toEqual([]);
  });

  it('insolvent: bids nothing (spec D11)', () => {
    const r = straits();
    r.insolvent = true;
    expect(decideOrders(r, 1, view, DEFAULT_CONFIG)).toEqual([]);
  });

  it('short of cash: bids only what it can pay for', () => {
    expect(brief(decideOrders(straits(0, 100_000), 1, view, DEFAULT_CONFIG))).toEqual([['BID', 'DME', 67.06, 1_000]]);
  });

  it('no reference anywhere: bids its delivered maximum on the most valuable node', () => {
    nodes.DME.lastFobByOrigin = {};
    const [b] = decideOrders(straits(), 1, view, DEFAULT_CONFIG);
    // Light sweet is worth most: 97 − 6 = 91, less carry from the Permian marker region.
    expect(b?.node).toBe('NYMEX');
    expect(b?.limitPrice).toBeLessThan(91);
    expect(b?.limitPrice).toBeGreaterThan(85);
  });

  it('only considers grades its tier can refine', () => {
    const metro = createRefiner({
      id: 'metro', name: 'Metro', region: 'Coastal_Asia', cash: 3e6, techTier: 1, processingCapacity: 6000, crudeStorageCapacity: 20_000,
    });
    expect(decideOrders(metro, 2, view, DEFAULT_CONFIG).map((o) => o.node)).toEqual(['NYMEX']);
  });

  it('carries the company’s avoid list onto its bids', () => {
    const [b] = decideOrders(straits(), 1, { ...view, avoid: ['HORMUZ'] }, DEFAULT_CONFIG);
    expect(b !== undefined && isBid(b) ? b.avoidChokepoints : null).toEqual(['HORMUZ']);
  });

  it('Deep stockpile buys at least as much as Lean (settings are monotonic)', () => {
    const qty = (stockpile: 'LEAN' | 'DEEP') =>
      decideOrders(straits(20_000), 1, view, configFor({ risk: 'BALANCED', selling: 'BALANCED', stockpile, appetite: 'MEDIUM' }, DEFAULT_CONFIG))[0]?.qty ?? 0;
    expect(qty('DEEP')).toBeGreaterThanOrEqual(qty('LEAN'));
  });
});

describe('integrated majors (spec §6.3)', () => {
  it('sells surplus at cost plus tariff with no margin, and bids more aggressively for a deficit', () => {
    const major = createIntegrated({
      id: 'sabkhar', name: 'Sabkhar', region: 'Middle_East', cash: 5_000_000,
      well: { grade: 'HEAVY_SOUR', extractionCapacity: 4000, baseExtractionCost: 12, storageCapacity: 10_000, storage: 5_000 },
      plant: { techTier: 3, processingCapacity: 9000, crudeStorageCapacity: 25_000 },
    });
    nodes.DME.lastFobByOrigin.Middle_East = 1;   // a collapsed price, to expose the floor
    const orders = decideOrders(major, 3, view, DEFAULT_CONFIG);
    // Floor: 12 × 0.75 + 0.20 tariff + no margin = 9.20.
    expect(brief(orders.filter((o) => o.side === 'ASK'))).toEqual([['ASK', 'DME', 9.2, 5_000]]);
    expect(orders.filter((o) => o.side === 'BID')).toHaveLength(1);
  });
});
