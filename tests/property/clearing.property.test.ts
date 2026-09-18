// Property tests for clearing (spec §8, §14.6). Instead of hand-picked examples, fast-check
// generates hundreds of random order books and checks rules that must hold for every one.
// When a property fails, fast-check shrinks the input to the smallest book that still fails.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clear, createNode, submit, type ExchangeNode } from '../../src/engine/clearing';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { REGIONS } from '../../src/data/regions';
import { asAgentId, asEdgeId, makeOrderId, type ChokepointName, type Order, type RegionName } from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';

const PIPELINE_CAPACITY = 6000;

// A small network with a Hormuz route, a capacity-limited pipeline around it, and some pairs with no route at all.
const network = () =>
  new StubRouteProvider([
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ'] },
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 10.9, transit: 16, capacityPerTick: PIPELINE_CAPACITY },
    { origin: 'Middle_East', destination: 'South_Asia', freight: 3.0, transit: 6, chokepoints: ['HORMUZ'] },
    { origin: 'Gulf_of_Oman', destination: 'Coastal_Asia', freight: 9.0, transit: 15 },
    { origin: 'Gulf_of_Oman', destination: 'South_Asia', freight: 2.2, transit: 5 },
    { origin: 'Gulf_of_Oman', destination: 'Middle_East', freight: 0.8, transit: 2 },
    { origin: 'West_Africa', destination: 'Coastal_Asia', freight: 11.0, transit: 24 },
    { origin: 'West_Africa', destination: 'Middle_East', freight: 6.0, transit: 20 },
    { origin: 'Russia_Far_East', destination: 'Coastal_Asia', freight: 1.15, transit: 6 },
  ]);

const ORIGINS: RegionName[] = ['Middle_East', 'Gulf_of_Oman', 'West_Africa', 'Russia_Far_East'];
const DESTINATIONS: RegionName[] = ['Coastal_Asia', 'South_Asia'];

// One random order. `agent` ranges over six companies, so the same company sometimes bids and
// asks in one book, which exercises self-trade prevention.
const orderSpec = fc.record({
  isBid: fc.boolean(),
  agent: fc.integer({ min: 0, max: 5 }),
  cents: fc.integer({ min: 5_000, max: 8_000 }),
  lots: fc.integer({ min: 1, max: 10 }),
  origin: fc.constantFrom(...ORIGINS),
  destination: fc.constantFrom(...DESTINATIONS),
  avoid: fc.subarray<ChokepointName>(['HORMUZ']),
});
type OrderSpec = typeof orderSpec extends fc.Arbitrary<infer T> ? T : never;

function buildOrders(specs: readonly OrderSpec[]): Order[] {
  return specs.map((s, i) => {
    const base = {
      orderId: makeOrderId(s.agent, i),
      agentId: asAgentId(`co-${s.agent}`),
      node: 'DME' as const,
      limitPrice: s.cents / 100,
      qty: s.lots * DEFAULT_CONFIG.LOT_SIZE,
      qtyRemaining: s.lots * DEFAULT_CONFIG.LOT_SIZE,
    };
    return s.isBid
      ? { ...base, side: 'BID', deliveryRegion: s.destination, avoidChokepoints: s.avoid }
      : { ...base, side: 'ASK', originRegion: s.origin };
  });
}

/** Clears a fresh copy of the orders, submitted in the given sequence. */
function runMarket(orders: readonly Order[], sequence: readonly number[]) {
  const copies = structuredClone(orders);
  const routes = network();
  const node: ExchangeNode = createNode('DME');
  for (const i of sequence) {
    const order = copies[i];
    if (order) submit(node, order, DEFAULT_CONFIG);
  }
  const fills = clear(node, { routes, tick: 1, config: DEFAULT_CONFIG });
  return { fills, node, routes, orders: copies };
}

const book = fc.array(orderSpec, { minLength: 2, maxLength: 16 });
const inOrder = (n: number) => [...Array(n).keys()];

// A book plus a random submission sequence that uses every order exactly once.
const bookWithShuffle = book.chain((specs) =>
  fc.tuple(fc.constant(specs), fc.shuffledSubarray(inOrder(specs.length), { minLength: specs.length })),
);

describe('clearing properties (spec §8, §14.6)', () => {
  it('gives identical fills, marker and close however the orders arrive', () => {
    fc.assert(
      fc.property(bookWithShuffle, ([specs, shuffled]) => {
        const orders = buildOrders(specs);
        const a = runMarket(orders, inOrder(orders.length));
        const b = runMarket(orders, shuffled);
        expect(b.fills).toEqual(a.fills);
        expect(b.node.markerPrice).toBe(a.node.markerPrice);
        expect(b.node.lastFobByOrigin).toEqual(a.node.lastFobByOrigin);
      }),
    );
  });

  it('never overfills an order, trades part-lots, or lets a company trade with itself', () => {
    fc.assert(
      fc.property(book, (specs) => {
        const { fills, orders } = runMarket(buildOrders(specs), inOrder(specs.length));
        for (const f of fills) {
          expect(f.qty).toBeGreaterThan(0);
          expect(f.qty % DEFAULT_CONFIG.LOT_SIZE).toBe(0);
          expect(f.buyerId).not.toBe(f.sellerId);
        }
        for (const o of orders) {
          expect(o.qtyRemaining).toBeGreaterThanOrEqual(0);
          expect(o.qtyRemaining).toBeLessThanOrEqual(o.qty);
        }
        const bought = fills.reduce((sum, f) => sum + f.qty, 0);
        const totalBid = orders.filter((o) => o.side === 'BID').reduce((sum, o) => sum + (o.qty - o.qtyRemaining), 0);
        const totalAsk = orders.filter((o) => o.side === 'ASK').reduce((sum, o) => sum + (o.qty - o.qtyRemaining), 0);
        expect(totalBid).toBe(bought);
        expect(totalAsk).toBe(bought);
      }),
    );
  });

  it('keeps every trade within both limit prices, at a consistent landed price', () => {
    fc.assert(
      fc.property(book, (specs) => {
        const orders = buildOrders(specs);
        const { fills } = runMarket(orders, inOrder(orders.length));
        for (const f of fills) {
          const bidLimits = orders.filter((o) => o.side === 'BID' && o.agentId === f.buyerId).map((o) => o.limitPrice);
          const askLimits = orders.filter((o) => o.side === 'ASK' && o.agentId === f.sellerId).map((o) => o.limitPrice);
          expect(f.landedPrice).toBeLessThanOrEqual(Math.max(...bidLimits) + 1e-9);
          expect(f.fobPrice).toBeGreaterThanOrEqual(Math.min(...askLimits) - 1e-9);
          expect(f.landedPrice).toBeCloseTo(f.fobPrice + f.freight + f.destinationTariff, 9);
        }
      }),
    );
  });

  it('never puts more through the pipeline than it can carry in a day', () => {
    fc.assert(
      fc.property(book, (specs) => {
        const { fills } = runMarket(buildOrders(specs), inOrder(specs.length));
        // The pipeline is the second row of the stub table, so its route ID is stub-1.
        const throughPipeline = fills
          .filter((f) => f.route.edges[0] === asEdgeId('stub-1'))
          .reduce((sum, f) => sum + f.qty, 0);
        expect(throughPipeline).toBeLessThanOrEqual(PIPELINE_CAPACITY);
      }),
    );
  });

  it('leaves no profitable pair unmatched while both sides and the route have room (invariant 3, spec §9)', () => {
    fc.assert(
      fc.property(book, (specs) => {
        const { orders, routes } = runMarket(buildOrders(specs), inOrder(specs.length));
        const lot = DEFAULT_CONFIG.LOT_SIZE;
        for (const b of orders) {
          if (b.side !== 'BID' || b.qtyRemaining < lot) continue;
          for (const a of orders) {
            if (a.side !== 'ASK' || a.qtyRemaining < lot || a.agentId === b.agentId) continue;
            const route = routes.route(a.originRegion, b.deliveryRegion, b.avoidChokepoints);
            if (route === null || routes.capacityLeft(route, b.agentId) < lot) continue;
            const landed = a.limitPrice + route.totalFreight + REGIONS[b.deliveryRegion].infrastructureTariff;
            expect(b.limitPrice - landed, `${b.orderId} vs ${a.orderId}`).toBeLessThan(0);
          }
        }
      }),
    );
  });
});
