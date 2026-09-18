import { describe, expect, it } from 'vitest';
import {
  asAgentId, asDealId, asEdgeId, isAsk, isBid, makeOrderId,
  type AgentId, type Ask, type Bid, type Fill, type Order, type OrderId,
} from '../../src/engine/model';

const ask: Ask = {
  orderId: makeOrderId(3, 1), agentId: asAgentId('qasr'), node: 'DME', side: 'ASK',
  limitPrice: 58.0, qty: 5000, qtyRemaining: 5000, originRegion: 'Middle_East',
};

const bid: Bid = {
  orderId: makeOrderId(7, 2), agentId: asAgentId('straits'), node: 'DME', side: 'BID',
  limitPrice: 70.0, qty: 5000, qtyRemaining: 5000, deliveryRegion: 'Coastal_Asia', avoidChokepoints: ['HORMUZ'],
};

describe('order IDs (spec §4.2, §8)', () => {
  it('sort as text in the same order as their numbers, for deterministic tie-breaks', () => {
    const ids = [makeOrderId(10, 1), makeOrderId(2, 5), makeOrderId(2, 12), makeOrderId(2, 3)];
    expect([...ids].sort()).toEqual([makeOrderId(2, 3), makeOrderId(2, 5), makeOrderId(2, 12), makeOrderId(10, 1)]);
  });
});

describe('branded IDs (spec §4.1)', () => {
  it('are plain strings at runtime', () => {
    expect(typeof asAgentId('qasr')).toBe('string');
    expect(JSON.stringify(asDealId('d-1'))).toBe('"d-1"');
  });

  it('cannot be mixed up at compile time', () => {
    const orderId: OrderId = makeOrderId(1, 1);
    // @ts-expect-error An OrderId is not an AgentId, even though both are strings.
    const wrong: AgentId = orderId;
    // @ts-expect-error A bare string must go through asAgentId first.
    const bare: AgentId = 'qasr';
    // @ts-expect-error An EdgeId is not an OrderId.
    const edge: OrderId = asEdgeId('e-1');
    expect([wrong, bare, edge]).toHaveLength(3);
  });
});

describe('orders as a discriminated union (spec §4.2)', () => {
  it('narrows to the right shape after a side check', () => {
    const orders: Order[] = [ask, bid];
    const summary = orders.map((o) => (isBid(o) ? `bid to ${o.deliveryRegion}` : `ask from ${o.originRegion}`));
    expect(summary).toEqual(['ask from Middle_East', 'bid to Coastal_Asia']);
    expect(orders.filter(isAsk)).toEqual([ask]);
  });

  it('rejects fields that belong to the other side, at compile time', () => {
    // @ts-expect-error An Ask has no deliveryRegion.
    const noSuchField = ask.deliveryRegion;
    // @ts-expect-error A Bid must say where it delivers.
    const missingField: Bid = { ...ask, side: 'BID', avoidChokepoints: [] };
    expect([noSuchField, missingField]).toHaveLength(2);
  });

  it('rejects unknown nodes, regions and chokepoints, at compile time', () => {
    // @ts-expect-error 'BRENT' is not a node.
    const node: Ask['node'] = 'BRENT';
    // @ts-expect-error 'HORMUS' is not a chokepoint.
    const avoid: Bid['avoidChokepoints'] = ['HORMUS'];
    expect([node, avoid]).toHaveLength(2);
  });
});

describe('plain data (spec §4.1)', () => {
  const fill: Fill = {
    tick: 12, node: 'DME', buyerId: bid.agentId, sellerId: ask.agentId, qty: 5000,
    fobPrice: 58.6, freight: 9.8, destinationTariff: 1.0, landedPrice: 69.4,
    originRegion: 'Middle_East', deliveryRegion: 'Coastal_Asia',
    route: { edges: [asEdgeId('ME-PG'), asEdgeId('PG-AS')], totalFreight: 9.8, totalTransit: 16, chokepoints: ['HORMUZ'] },
    dealId: null,
  };

  it('orders and fills survive a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify([ask, bid, fill]))).toEqual([ask, bid, fill]);
  });

  it('orders and fills copy with structuredClone, as forks do (spec G4.5)', () => {
    const copy = structuredClone(bid);
    copy.qtyRemaining = 0;
    expect(bid.qtyRemaining).toBe(5000);
    expect(structuredClone(fill)).toEqual(fill);
  });
});
