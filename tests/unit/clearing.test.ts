import { describe, expect, it } from 'vitest';
import { clear, createNode, submit, type ClearContext } from '../../src/engine/clearing';
import { asAgentId, makeOrderId, type Ask, type Bid, type ChokepointName, type NodeName, type RegionName } from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';

// Stub network. Destination tariffs come from the real region data: Coastal_Asia 1.00, South_Asia 1.20.
const ctx = (): ClearContext => ({
  tick: 5,
  routes: new StubRouteProvider([
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ'] },
    { origin: 'Middle_East', destination: 'South_Asia', freight: 3.0, transit: 6, chokepoints: ['HORMUZ'] },
    { origin: 'West_Africa', destination: 'Coastal_Asia', freight: 11.0, transit: 24 },
    { origin: 'Russia_Far_East', destination: 'Coastal_Asia', freight: 1.15, transit: 6 },
  ]),
});

// Builders: agent index and sequence make the order ID, so ties are predictable.
const ask = (agent: number, price: number, qty: number, origin: RegionName, node: NodeName = 'DME'): Ask => ({
  orderId: makeOrderId(agent, 1), agentId: asAgentId(`seller-${agent}`), node, side: 'ASK',
  limitPrice: price, qty, qtyRemaining: qty, originRegion: origin,
});
const bid = (agent: number, price: number, qty: number, dest: RegionName, avoid: ChokepointName[] = [], node: NodeName = 'DME'): Bid => ({
  orderId: makeOrderId(agent, 1), agentId: asAgentId(`buyer-${agent}`), node, side: 'BID',
  limitPrice: price, qty, qtyRemaining: qty, deliveryRegion: dest, avoidChokepoints: avoid,
});

function clearBook(orders: (Ask | Bid)[]) {
  const node = createNode('DME');
  for (const o of orders) submit(node, o);
  return { node, fills: clear(node, ctx()) };
}

describe('batch clearing (spec §8)', () => {
  it('reproduces the worked example in spec §3.3', () => {
    const cheap = ask(1, 58, 5000, 'Middle_East');
    const dear = ask(2, 62, 5000, 'Middle_East');
    const { fills } = clearBook([bid(9, 70, 5000, 'Coastal_Asia'), dear, cheap]);

    expect(fills).toHaveLength(1);
    const [f] = fills;
    expect(f?.sellerId).toBe(cheap.agentId);
    expect(f?.qty).toBe(5000);
    expect(f?.fobPrice).toBeCloseTo(58.6, 10);      // 58 + (70 − 68.80) / 2
    expect(f?.landedPrice).toBeCloseTo(69.4, 10);   // 58.60 + 9.80 + 1.00
    expect(dear.qtyRemaining).toBe(5000);           // 62 + 9.80 + 1.00 = 72.80 > 70: never trades
  });

  it('compares origins on landed cost, not FOB price', () => {
    const farAndCheap = ask(1, 60, 5000, 'West_Africa');     // 60 + 11.00 + 1.00 = 72.00
    const nearAndDear = ask(2, 69, 5000, 'Russia_Far_East'); // 69 +  1.15 + 1.00 = 71.15
    const { fills } = clearBook([bid(9, 72, 5000, 'Coastal_Asia'), farAndCheap, nearAndDear]);
    expect(fills.map((f) => f.sellerId)).toEqual([nearAndDear.agentId]);
  });

  it('gives a scarce cargo to the buyer it creates the most value for', () => {
    const cargo = ask(1, 58, 5000, 'Middle_East');
    const eastAsia = bid(8, 70, 5000, 'Coastal_Asia');   // surplus 70 − 68.8 = 1.2
    const india = bid(9, 69, 5000, 'South_Asia');         // surplus 69 − 62.2 = 6.8
    const { fills } = clearBook([eastAsia, india, cargo]);
    expect(fills.map((f) => f.buyerId)).toEqual([india.agentId]);
    expect(eastAsia.qtyRemaining).toBe(5000);
  });

  it('fills partially across several sellers without overfilling anyone', () => {
    const big = bid(9, 75, 10_000, 'Coastal_Asia');
    const gulf = ask(1, 58, 4000, 'Middle_East');
    const russia = ask(2, 69, 3000, 'Russia_Far_East');
    const { fills } = clearBook([big, gulf, russia]);

    expect(fills.map((f) => f.qty)).toEqual([4000, 3000]);
    expect(big.qtyRemaining).toBe(3000);
    expect(gulf.qtyRemaining).toBe(0);
    expect(russia.qtyRemaining).toBe(0);
  });

  it('trades at exactly zero surplus, at the seller’s price', () => {
    const { fills } = clearBook([bid(9, 72, 5000, 'Coastal_Asia'), ask(1, 60, 5000, 'West_Africa')]);
    expect(fills).toHaveLength(1);
    expect(fills[0]?.fobPrice).toBeCloseTo(60, 10);
    expect(fills[0]?.landedPrice).toBeCloseTo(72, 10);
  });

  it('skips pairs with no usable route, such as a bid that avoids the only route', () => {
    const { fills } = clearBook([bid(9, 90, 5000, 'Coastal_Asia', ['HORMUZ']), ask(1, 58, 5000, 'Middle_East')]);
    expect(fills).toEqual([]);
  });

  it('breaks exact ties by order ID, never by arrival order', () => {
    const later = ask(5, 58, 3000, 'Middle_East');
    const earlier = ask(2, 58, 3000, 'Middle_East');
    const { fills } = clearBook([bid(9, 70, 3000, 'Coastal_Asia'), later, earlier]);
    expect(fills.map((f) => f.sellerId)).toEqual([earlier.agentId]);
  });

  it('never makes a buyer pay above its bid or a seller accept below its ask', () => {
    const bids = [bid(7, 75, 6000, 'Coastal_Asia'), bid(8, 71, 4000, 'Coastal_Asia'), bid(9, 69, 5000, 'South_Asia')];
    const asks = [ask(1, 58, 5000, 'Middle_East'), ask(2, 69, 3000, 'Russia_Far_East'), ask(3, 60, 4000, 'West_Africa')];
    const { fills } = clearBook([...bids, ...asks]);
    expect(fills.length).toBeGreaterThan(1);

    for (const f of fills) {
      const b = bids.find((x) => x.agentId === f.buyerId);
      const a = asks.find((x) => x.agentId === f.sellerId);
      expect(f.landedPrice).toBeLessThanOrEqual((b?.limitPrice ?? 0) + 1e-9);
      expect(f.fobPrice).toBeGreaterThanOrEqual((a?.limitPrice ?? Infinity) - 1e-9);
      expect(f.landedPrice).toBeCloseTo(f.fobPrice + f.freight + f.destinationTariff, 10);
    }
  });

  it('records the full trade: route, freight, tariff, tick, and no deal', () => {
    const { fills } = clearBook([bid(9, 70, 5000, 'Coastal_Asia'), ask(1, 58, 5000, 'Middle_East')]);
    expect(fills[0]).toMatchObject({
      tick: 5, node: 'DME', freight: 9.8, destinationTariff: 1.0,
      originRegion: 'Middle_East', deliveryRegion: 'Coastal_Asia', dealId: null,
      route: { chokepoints: ['HORMUZ'], totalTransit: 16 },
    });
  });

  it('expires every order once the node clears (spec §4.2)', () => {
    const { node } = clearBook([bid(9, 50, 5000, 'Coastal_Asia'), ask(1, 58, 5000, 'Middle_East')]);
    expect(node.orders).toEqual([]);
    expect(node.fills).toEqual([]);
  });

  it('refuses orders for another node or with no quantity', () => {
    const node = createNode('DME');
    expect(() => submit(node, ask(1, 70, 5000, 'North_Sea', 'NC'))).toThrow(/NC, not DME/);
    expect(() => submit(node, ask(1, 58, 0, 'Middle_East'))).toThrow(/invalid quantity/);
  });
});
