import { describe, expect, it } from 'vitest';
import { clear, createNode, previousClose, submit, updateMarker, type ClearContext, type ExchangeNode } from '../../src/engine/clearing';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import {
  asAgentId, asDealId, makeOrderId, type Ask, type Bid, type ChokepointName, type Fill, type NodeName, type RegionName,
} from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';

// Stub network. Destination tariffs come from the real region data: Coastal_Asia 1.00, South_Asia 1.20.
// DME's marker region is Middle_East.
const ctx = (): ClearContext => ({
  tick: 5,
  config: DEFAULT_CONFIG,
  routes: new StubRouteProvider([
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ'] },
    { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 10.9, transit: 16, capacityPerTick: 120_000 },
    { origin: 'Middle_East', destination: 'South_Asia', freight: 3.0, transit: 6, chokepoints: ['HORMUZ'] },
    { origin: 'West_Africa', destination: 'Coastal_Asia', freight: 11.0, transit: 24 },
    { origin: 'Russia_Far_East', destination: 'Coastal_Asia', freight: 1.15, transit: 6 },
    { origin: 'Gulf_of_Oman', destination: 'Coastal_Asia', freight: 9.0, transit: 15 },
    { origin: 'Gulf_of_Oman', destination: 'Middle_East', freight: 0.8, transit: 2 },
  ]),
});

// Builders: agent index and sequence make the order ID, so ties are predictable.
const ask = (agent: number, price: number, qty: number, origin: RegionName, node: NodeName = 'DME'): Ask => ({
  orderId: makeOrderId(agent, 1), agentId: asAgentId(`co-${agent}`), node, side: 'ASK',
  limitPrice: price, qty, qtyRemaining: qty, originRegion: origin,
});
const bid = (agent: number, price: number, qty: number, dest: RegionName, avoid: ChokepointName[] = [], node: NodeName = 'DME'): Bid => ({
  orderId: makeOrderId(agent, 2), agentId: asAgentId(`co-${agent}`), node, side: 'BID',
  limitPrice: price, qty, qtyRemaining: qty, deliveryRegion: dest, avoidChokepoints: avoid,
});

function clearBook(orders: (Ask | Bid)[], node: ExchangeNode = createNode('DME'), context: ClearContext = ctx()) {
  for (const o of orders) submit(node, o, DEFAULT_CONFIG);
  return { node, fills: clear(node, context) };
}

describe('batch clearing (spec §8)', () => {
  it('reproduces the worked example in spec §3.3', () => {
    const cheap = ask(1, 58, 100_000, 'Middle_East');
    const dear = ask(2, 62, 100_000, 'Middle_East');
    const { fills } = clearBook([bid(9, 70, 100_000, 'Coastal_Asia'), dear, cheap]);

    expect(fills).toHaveLength(1);
    const [f] = fills;
    expect(f?.sellerId).toBe(cheap.agentId);
    expect(f?.qty).toBe(100_000);
    expect(f?.fobPrice).toBeCloseTo(58.6, 10);      // 58 + (70 − 68.80) / 2
    expect(f?.landedPrice).toBeCloseTo(69.4, 10);   // 58.60 + 9.80 + 1.00
    expect(dear.qtyRemaining).toBe(100_000);           // 62 + 9.80 + 1.00 = 72.80 > 70: never trades
  });

  it('compares origins on landed cost, not FOB price', () => {
    const farAndCheap = ask(1, 60, 100_000, 'West_Africa');     // 60 + 11.00 + 1.00 = 72.00
    const nearAndDear = ask(2, 69, 100_000, 'Russia_Far_East'); // 69 +  1.15 + 1.00 = 71.15
    const { fills } = clearBook([bid(9, 72, 100_000, 'Coastal_Asia'), farAndCheap, nearAndDear]);
    expect(fills.map((f) => f.sellerId)).toEqual([nearAndDear.agentId]);
  });

  it('gives a scarce cargo to the buyer it creates the most value for', () => {
    const cargo = ask(1, 58, 100_000, 'Middle_East');
    const eastAsia = bid(8, 70, 100_000, 'Coastal_Asia');   // surplus 70 − 68.8 = 1.2
    const india = bid(9, 69, 100_000, 'South_Asia');         // surplus 69 − 62.2 = 6.8
    const { fills } = clearBook([eastAsia, india, cargo]);
    expect(fills.map((f) => f.buyerId)).toEqual([india.agentId]);
    expect(eastAsia.qtyRemaining).toBe(100_000);
  });

  it('fills partially across several sellers without overfilling anyone', () => {
    const big = bid(9, 75, 200_000, 'Coastal_Asia');
    const gulf = ask(1, 58, 80_000, 'Middle_East');
    const russia = ask(2, 69, 60_000, 'Russia_Far_East');
    const { fills } = clearBook([big, gulf, russia]);

    expect(fills.map((f) => f.qty)).toEqual([80_000, 60_000]);
    expect(big.qtyRemaining).toBe(60_000);
    expect(gulf.qtyRemaining).toBe(0);
    expect(russia.qtyRemaining).toBe(0);
  });

  it('trades at exactly zero surplus, at the seller’s price', () => {
    const { fills } = clearBook([bid(9, 72, 100_000, 'Coastal_Asia'), ask(1, 60, 100_000, 'West_Africa')]);
    expect(fills).toHaveLength(1);
    expect(fills[0]?.fobPrice).toBeCloseTo(60, 10);
    expect(fills[0]?.landedPrice).toBeCloseTo(72, 10);
  });

  it('skips pairs with no usable route', () => {
    const { fills } = clearBook([bid(9, 90, 100_000, 'South_Asia', ['HORMUZ']), ask(1, 58, 100_000, 'Middle_East')]);
    expect(fills).toEqual([]);
  });

  it('breaks exact ties by order ID, never by arrival order', () => {
    const later = ask(5, 58, 60_000, 'Middle_East');
    const earlier = ask(2, 58, 60_000, 'Middle_East');
    const { fills } = clearBook([bid(9, 70, 60_000, 'Coastal_Asia'), later, earlier]);
    expect(fills.map((f) => f.sellerId)).toEqual([earlier.agentId]);
  });

  it('never makes a buyer pay above its bid or a seller accept below its ask', () => {
    const bids = [bid(7, 75, 120_000, 'Coastal_Asia'), bid(8, 71, 80_000, 'Coastal_Asia'), bid(9, 69, 100_000, 'South_Asia')];
    const asks = [ask(1, 58, 100_000, 'Middle_East'), ask(2, 69, 60_000, 'Russia_Far_East'), ask(3, 60, 80_000, 'West_Africa')];
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
    const { fills } = clearBook([bid(9, 70, 100_000, 'Coastal_Asia'), ask(1, 58, 100_000, 'Middle_East')]);
    expect(fills[0]).toMatchObject({
      tick: 5, node: 'DME', freight: 9.8, destinationTariff: 1.0,
      originRegion: 'Middle_East', deliveryRegion: 'Coastal_Asia', dealId: null,
      route: { chokepoints: ['HORMUZ'], totalTransit: 16 },
    });
  });

  it('expires every order once the node clears (spec §4.2)', () => {
    const { node } = clearBook([bid(9, 50, 100_000, 'Coastal_Asia'), ask(1, 58, 100_000, 'Middle_East')]);
    expect(node.orders).toEqual([]);
    expect(node.fills).toEqual([]);
  });
});

describe('pipeline capacity and lots (spec §8, rule 5)', () => {
  it('shares a pipeline among buyers and stops when it is full', () => {
    // Both buyers avoid Hormuz, so both need the 6,000-barrel pipeline route.
    const first = bid(8, 80, 100_000, 'Coastal_Asia', ['HORMUZ']);
    const second = bid(9, 79, 100_000, 'Coastal_Asia', ['HORMUZ']);
    const { fills } = clearBook([first, second, ask(1, 58, 200_000, 'Middle_East')]);
    expect(fills.map((f) => [f.buyerId, f.qty])).toEqual([[first.agentId, 100_000], [second.agentId, 20_000]]);
  });

  it('fills whole lots only, leaving a spare part-lot of capacity unused', () => {
    // A pipeline of 4,500 barrels a day can carry four whole lots; the last 500 barrels go unused.
    const narrow: ClearContext = {
      ...ctx(),
      routes: new StubRouteProvider([
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 10.9, transit: 16, capacityPerTick: 90_000 },
      ]),
    };
    const { fills } = clearBook([bid(9, 80, 200_000, 'Coastal_Asia'), ask(1, 58, 200_000, 'Middle_East')], createNode('DME'), narrow);
    expect(fills.map((f) => f.qty)).toEqual([80_000]);
  });

  it('refuses orders that are not whole lots, for another node, or empty', () => {
    const node = createNode('DME');
    expect(() => submit(node, ask(1, 58, 30_000, 'Middle_East'), DEFAULT_CONFIG)).toThrow(/whole number of 20000-barrel lots/);
    expect(() => submit(node, ask(1, 70, 100_000, 'North_Sea', 'NC'), DEFAULT_CONFIG)).toThrow(/NC, not DME/);
    expect(() => submit(node, ask(1, 58, 0, 'Middle_East'), DEFAULT_CONFIG)).toThrow(/invalid quantity/);
  });
});

describe('self-trade prevention (spec §8, rule 2)', () => {
  it('never matches a company with itself, even when the trade would be profitable', () => {
    const { fills } = clearBook([bid(4, 90, 100_000, 'Coastal_Asia'), ask(4, 58, 100_000, 'Middle_East')]);
    expect(fills).toEqual([]);
  });

  it('still matches that company with others', () => {
    const own = ask(4, 58, 100_000, 'Middle_East');
    const rival = ask(5, 60, 100_000, 'Middle_East');
    const { fills } = clearBook([bid(4, 90, 100_000, 'Coastal_Asia'), own, rival]);
    expect(fills.map((f) => f.sellerId)).toEqual([rival.agentId]);
  });
});

describe('marker price and previous close (spec §3.3, §8 rule 7)', () => {
  it('publishes the volume-weighted price of the day’s fills, converted to the marker region', () => {
    // Gulf fill: 5,000 at FOB 58.60 (surplus 1.20), already in the marker region.
    // Oman fill: pairs with the 69.80 bid at surplus 0.80, so FOB 59.40, plus 0.80 freight = 60.20.
    // Average = (58.60 + 60.20) / 2 = 59.40.
    const { node } = clearBook([
      bid(8, 70, 100_000, 'Coastal_Asia'),
      bid(9, 69.8, 100_000, 'Coastal_Asia'),
      ask(1, 58, 100_000, 'Middle_East'),
      ask(2, 59, 100_000, 'Gulf_of_Oman'),
    ]);
    expect(node.fills).toHaveLength(2);
    expect(node.markerPrice).toBeCloseTo(59.4, 10);
  });

  it('keeps yesterday’s marker on a day with no trades', () => {
    const node = createNode('DME');
    clearBook([bid(9, 40, 100_000, 'Coastal_Asia'), ask(1, 58, 100_000, 'Middle_East')], node);
    expect(node.markerPrice).toBe(62);
  });

  it('leaves deal deliveries out of the marker, because deals are priced from it', () => {
    const node = createNode('DME');
    const dealFill: Fill = {
      tick: 5, node: 'DME', buyerId: asAgentId('a'), sellerId: asAgentId('b'), qty: 180_000,
      fobPrice: 10, freight: 0, destinationTariff: 0, landedPrice: 10,
      originRegion: 'Middle_East', deliveryRegion: 'Middle_East',
      route: { edges: [], totalFreight: 0, totalSurcharge: 0, totalTransit: 1, chokepoints: [] }, dealId: asDealId('d-1'),
    };
    updateMarker(node, [dealFill], ctx());
    expect(node.markerPrice).toBe(62);
  });

  it('records each origin’s close and keeps the last close for origins that did not trade', () => {
    const node = createNode('DME');
    clearBook([bid(9, 70, 100_000, 'Coastal_Asia'), ask(1, 58, 100_000, 'Middle_East')], node);
    clearBook([bid(9, 71, 100_000, 'Coastal_Asia'), ask(2, 60, 100_000, 'Russia_Far_East')], node);
    expect(node.lastFobByOrigin.Middle_East).toBeCloseTo(58.6, 10);                     // from day one
    expect(node.lastFobByOrigin.Russia_Far_East).toBeCloseTo(60 + (71 - 62.15) / 2, 10); // from day two
  });

  it('quotes each origin delivered to a destination, cheapest first', () => {
    const node = createNode('DME');
    node.lastFobByOrigin = { Middle_East: 58, West_Africa: 60, Russia_Far_East: 69 };
    const quotes = previousClose(node, 'Coastal_Asia', ctx());
    expect(quotes.map((q) => [q.origin, Number(q.landed.toFixed(2))])).toEqual([
      ['Middle_East', 68.8], ['Russia_Far_East', 71.15], ['West_Africa', 72],
    ]);
    const avoiding = previousClose(node, 'Coastal_Asia', ctx(), ['HORMUZ']);
    expect(avoiding[0]).toMatchObject({ origin: 'Middle_East', freight: 10.9 });   // the pipeline route
  });
});
