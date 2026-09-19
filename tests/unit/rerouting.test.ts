// Clearing falls over to the next route when a pipeline fills (spec §3.5, §8 rule 3; Phase 4 acceptance).

import { describe, expect, it } from 'vitest';
import { clear, createNode, submit, type ClearContext } from '../../src/engine/clearing';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { asAgentId, makeOrderId, type Ask, type Bid, type RegionName } from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';
import { buildLaneGraph, LaneRouteProvider, setChokepoint } from '../../src/engine/transport';

const ask = (agent: number, price: number, qty: number, origin: RegionName): Ask => ({
  orderId: makeOrderId(agent, 1), agentId: asAgentId(`co-${agent}`), node: 'DME', side: 'ASK',
  limitPrice: price, qty, qtyRemaining: qty, originRegion: origin,
});
const bid = (agent: number, price: number, qty: number, dest: RegionName): Bid => ({
  orderId: makeOrderId(agent, 2), agentId: asAgentId(`co-${agent}`), node: 'DME', side: 'BID',
  limitPrice: price, qty, qtyRemaining: qty, deliveryRegion: dest, avoidChokepoints: [],
});

function run(orders: (Ask | Bid)[], ctx: ClearContext) {
  const node = createNode('DME');
  for (const o of orders) submit(node, o, DEFAULT_CONFIG);
  return clear(node, ctx);
}

describe('rerouting when a route fills', () => {
  it('fills the cheap pipeline first, then the dearer route, each at its own price', () => {
    const ctx: ClearContext = {
      tick: 1, config: DEFAULT_CONFIG,
      routes: new StubRouteProvider([
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 2.0, transit: 5, capacityPerTick: 3000 },
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 4.0, transit: 20 },
      ]),
    };
    // Ask 60, bid 70, Coastal_Asia tariff 1.00. Pipeline: surplus 7, FOB 63.5. Sea: surplus 5, FOB 62.5.
    const fills = run([ask(1, 60, 8000, 'Middle_East'), bid(2, 70, 8000, 'Coastal_Asia')], ctx);
    expect(fills.map((f) => [f.qty, f.freight, f.fobPrice])).toEqual([[3000, 2, 63.5], [5000, 4, 62.5]]);
  });

  it('lets a better pair take the cheap route first, and sends the other one round', () => {
    const ctx: ClearContext = {
      tick: 1, config: DEFAULT_CONFIG,
      routes: new StubRouteProvider([
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 2.0, transit: 5, capacityPerTick: 3000 },
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 4.0, transit: 20 },
      ]),
    };
    const fills = run([ask(1, 60, 6000, 'Middle_East'), bid(2, 72, 3000, 'Coastal_Asia'), bid(3, 70, 3000, 'Coastal_Asia')], ctx);
    expect(fills.map((f) => [String(f.buyerId), f.qty, f.freight])).toEqual([['co-2', 3000, 2], ['co-3', 3000, 4]]);
  });

  it('drops a pair whose next route leaves no surplus', () => {
    const ctx: ClearContext = {
      tick: 1, config: DEFAULT_CONFIG,
      routes: new StubRouteProvider([
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 2.0, transit: 5, capacityPerTick: 3000 },
        { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 12.0, transit: 20 },
      ]),
    };
    const fills = run([ask(1, 60, 8000, 'Middle_East'), bid(2, 70, 8000, 'Coastal_Asia')], ctx);
    expect(fills.map((f) => f.qty)).toEqual([3000]);   // 60 + 12 + 1 > 70
  });
});

describe('a Hormuz closure on the real lane graph (Phase 4 acceptance)', () => {
  it('ships Gulf crude through the Oman bypass, then the Red Sea bypass, until both are full', () => {
    const graph = buildLaneGraph(DEFAULT_CONFIG);
    setChokepoint(graph, 'HORMUZ', 'CLOSED');
    const ctx: ClearContext = { tick: 1, config: DEFAULT_CONFIG, routes: new LaneRouteProvider(graph) };
    const fills = run([ask(1, 55, 15_000, 'Middle_East'), bid(2, 75, 15_000, 'South_Asia')], ctx);
    expect(fills.map((f) => [f.route.edges[0], f.qty])).toEqual([['bypass_oman', 3000], ['bypass_red_sea', 6000]]);
    expect(fills.every((f) => !f.route.chokepoints.includes('HORMUZ'))).toBe(true);
  });

  it('with Hormuz open, sends everything through the strait', () => {
    const ctx: ClearContext = { tick: 1, config: DEFAULT_CONFIG, routes: new LaneRouteProvider(buildLaneGraph(DEFAULT_CONFIG)) };
    const fills = run([ask(1, 55, 15_000, 'Middle_East'), bid(2, 75, 15_000, 'South_Asia')], ctx);
    expect(fills.map((f) => [f.route.chokepoints, f.qty])).toEqual([[['HORMUZ'], 15_000]]);
  });
});
