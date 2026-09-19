// Price discovery (spec §6.1, §6.2, §6.5, §8 rule 7): unsold asks come down, closing offers are
// published, and AI producers cut output when prices stay below their cost.

import { describe, expect, it } from 'vitest';
import { clear, createNode, previousClose, referencePrice, submit } from '../../src/engine/clearing';
import { createProducer, createRefiner } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger } from '../../src/engine/economics';
import { makeOrderId, type Ask, type Producer } from '../../src/engine/model';
import { decideOrders, OUTPUT_CUT_DAYS, recordSales, updateOutput } from '../../src/engine/rules';
import { buildLaneGraph, LaneRouteProvider } from '../../src/engine/transport';

const routes = () => new LaneRouteProvider(buildLaneGraph(DEFAULT_CONFIG));
const qasr = (storage = 15_000): Producer => createProducer({
  id: 'qasr', name: 'Qasr', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2e6,
  extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000, storage,
});
const ask = (price: number, qty: number): Ask => ({
  orderId: makeOrderId(1, 1), agentId: qasr().agentId, node: 'DME', side: 'ASK', limitPrice: price, qty, qtyRemaining: qty, originRegion: 'Middle_East',
});

describe('unsold asks come down (spec §6.1 rule 3)', () => {
  it('lowers the ask ASK_DECAY for each day in a row nothing sold, never below the floor', () => {
    const nodes = { DME: createNode('DME') };
    nodes.DME.lastFobByOrigin.Middle_East = 60;
    const view = { tick: 1, nodes, routes: routes(), expectedPrices: DEFAULT_CONFIG.PRODUCT_PRICES.BASE, avoid: [], dealCommitments: 0 };
    const q = qasr();
    const price = () => decideOrders(q, 0, view, DEFAULT_CONFIG)[0]?.limitPrice;
    expect(price()).toBe(60);
    q.daysUnsold = 5;
    expect(price()).toBe(Math.ceil(60 * 0.98 ** 5 * 100) / 100);   // 54.23
    q.daysUnsold = 500;
    expect(price()).toBe(8.7);   // the floor: 7.50 cost + 0.20 tariff + 1.00 margin
  });

  it('counts a day unsold only for a company that asked and sold nothing; any sale resets it', () => {
    const q = qasr();
    recordSales([q], new Set([q.agentId]), []);
    recordSales([q], new Set([q.agentId]), []);
    expect(q.daysUnsold).toBe(2);
    recordSales([q], new Set(), []);   // did not ask
    expect(q.daysUnsold).toBe(0);
  });
});

describe('closing offers (spec §8 rule 7)', () => {
  it('publishes each origin’s lowest unsold ask, and buyers see the lower of close and offer', () => {
    const node = createNode('DME');
    node.lastFobByOrigin.Middle_East = 70;
    submit(node, ask(45, 5000), DEFAULT_CONFIG);
    clear(node, { routes: routes(), tick: 1, config: DEFAULT_CONFIG });
    expect(node.lastOfferByOrigin).toEqual({ Middle_East: 45 });
    expect(referencePrice(node, 'Middle_East')).toBe(45);
    const quote = previousClose(node, 'South_Asia', { routes: routes(), tick: 2, config: DEFAULT_CONFIG })[0];
    expect(quote?.fob).toBe(45);
  });

  it('replaces the offers every day, so a sold-out origin stops showing one', () => {
    const node = createNode('DME');
    submit(node, ask(45, 5000), DEFAULT_CONFIG);
    clear(node, { routes: routes(), tick: 1, config: DEFAULT_CONFIG });
    clear(node, { routes: routes(), tick: 2, config: DEFAULT_CONFIG });
    expect(node.lastOfferByOrigin).toEqual({});
  });

  it('does not publish an ask that sold in full', () => {
    const node = createNode('DME');
    const buyer = createRefiner({ id: 'r', name: 'R', region: 'South_Asia', cash: 1e7, techTier: 3, processingCapacity: 9000, crudeStorageCapacity: 30_000 });
    submit(node, ask(45, 5000), DEFAULT_CONFIG);
    submit(node, {
      orderId: makeOrderId(2, 1), agentId: buyer.agentId, node: 'DME', side: 'BID', limitPrice: 60, qty: 5000, qtyRemaining: 5000,
      deliveryRegion: 'South_Asia', avoidChokepoints: [],
    }, DEFAULT_CONFIG);
    clear(node, { routes: routes(), tick: 1, config: DEFAULT_CONFIG });
    expect(node.lastOfferByOrigin).toEqual({});
  });
});

describe('AI output cuts (spec §6.5)', () => {
  const nodesAt = (price: number) => { const n = { DME: createNode('DME') }; n.DME.lastFobByOrigin.Middle_East = price; return n; };

  it('cuts to half after 10 days below breakeven with storage above 80%, and restores after 10 above', () => {
    const q = qasr(27_000);
    const ledger = createLedger();
    // Breakeven: 7.50 cost + 2.00 fixed; netback 8.00 − 0.20 tariff = 7.80.
    for (let d = 1; d < OUTPUT_CUT_DAYS; d++) updateOutput(q, nodesAt(8), ledger, d, DEFAULT_CONFIG);
    expect(q.extractionRate).toBe(1);
    updateOutput(q, nodesAt(8), ledger, OUTPUT_CUT_DAYS, DEFAULT_CONFIG);
    expect(q.extractionRate).toBe(0.5);
    for (let d = 1; d <= OUTPUT_CUT_DAYS; d++) updateOutput(q, nodesAt(20), ledger, 20 + d, DEFAULT_CONFIG);
    expect(q.extractionRate).toBe(1);
  });

  it('keeps pumping while it still has room to store, and never cuts the player’s company', () => {
    const roomy = qasr(10_000);
    const player = createProducer({
      id: 'p', name: 'P', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 1e6, extractionCapacity: 9000, baseExtractionCost: 10,
      storageCapacity: 30_000, storage: 29_000, controller: 'HUMAN',
    });
    for (let d = 1; d <= 20; d++) {
      updateOutput(roomy, nodesAt(8), createLedger(), d, DEFAULT_CONFIG);
      updateOutput(player, nodesAt(8), createLedger(), d, DEFAULT_CONFIG);
    }
    expect([roomy.extractionRate, player.extractionRate]).toEqual([1, 1]);
  });
});
