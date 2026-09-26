// Deals: signing, pricing, delivery, shortfall, cancel and split (spec §4.4, G4.3, §5 phase 5a).

import { beforeEach, describe, expect, it } from 'vitest';
import { fillTanks } from '../../src/engine/leases';
import { createNode } from '../../src/engine/clearing';
import { createProducer, createRefiner, total } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { cancelDeal, dealCommitments, deliverDeals, priceDeal, signDeal, splitDeal, type DealTerms } from '../../src/engine/deals';
import { createLedger, type FeeLedger } from '../../src/engine/economics';
import { asEdgeId, type Agent, type AgentId, type Cargo, type Deal, type Producer, type Refiner } from '../../src/engine/model';
import { buildLaneGraph, LaneRouteProvider, setChokepoint, setReservation, type LaneGraph } from '../../src/engine/transport';

let qasr: Producer;
let malabar: Refiner;
let agents: Map<AgentId, Agent>;
let graph: LaneGraph;
let routes: LaneRouteProvider;
let ledger: FeeLedger;
let cargo: Cargo[];

beforeEach(() => {
  qasr = createProducer({
    id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 40_000_000,
    extractionCapacity: 180_000, baseExtractionCost: 10, storageCapacity: 600_000, storage: 400_000,
  });
  malabar = createRefiner({
    id: 'malabar', name: 'Malabar Refining', region: 'South_Asia', cash: 60_000_000, techTier: 3,
    processingCapacity: 180_000, crudeStorageCapacity: 600_000,
  });
  agents = new Map<AgentId, Agent>([[qasr.agentId, qasr], [malabar.agentId, malabar]]);
  graph = buildLaneGraph(DEFAULT_CONFIG);
  routes = new LaneRouteProvider(graph);
  ledger = createLedger();
  cargo = [];
});

const terms = (over: Partial<DealTerms> = {}): DealTerms => ({
  sellerId: qasr.agentId, buyerId: malabar.agentId, grade: 'HEAVY_SOUR', originRegion: 'Middle_East', deliveryRegion: 'South_Asia',
  qtyPerDay: 100_000, termDays: 30, price: 60, avoidChokepoints: [], ...over,
});
const sign = (over: Partial<DealTerms> = {}, existing: Deal[] = [], seq = 1) => signDeal(terms(over), agents, existing, seq, 10, DEFAULT_CONFIG);
const deliver = (deals: Deal[], tick: number) => { routes.resetTick(); return deliverDeals(deals, cargo, agents, routes, ledger, tick, DEFAULT_CONFIG); };

describe('signing (spec G4.3)', () => {
  it('starts tomorrow and runs for the term', () => {
    expect(sign()).toMatchObject({ dealId: 'deal-000001', startTick: 11, endTick: 41, status: 'ACTIVE', qtyPerDay: 100_000, price: 60 });
  });

  it('refuses terms the companies could not carry out', () => {
    expect(() => sign({ qtyPerDay: 50_000 })).toThrow(/whole number of lots/);
    expect(() => sign({ qtyPerDay: 220_000 })).toThrow(/20000–200000/);
    expect(() => sign({ termDays: 60 })).toThrow(/30 or 90/);
    expect(() => sign({ sellerId: malabar.agentId, buyerId: qasr.agentId })).toThrow(/cannot supply/);
    expect(() => sign({ grade: 'MEDIUM' })).toThrow(/cannot supply MEDIUM/);
    expect(() => sign({ buyerId: qasr.agentId })).toThrow(/cannot deal with itself/);
  });

  it('refuses a grade the buyer’s tier cannot refine', () => {
    malabar.techTier = 1;
    expect(() => sign()).toThrow(/cannot take HEAVY_SOUR/);
  });

  it('keeps each side within DEAL_MAX_SHARE of its capacity', () => {
    const first = sign({ qtyPerDay: 100_000 });
    // Qasr pumps 9,000 a day: 80% is 7,200, so another 3,000 on top of 5,000 is too much.
    expect(() => sign({ qtyPerDay: 60_000 }, [first], 2)).toThrow(/more than 80%/);
    expect(sign({ qtyPerDay: 40_000 }, [first], 2).qtyPerDay).toBe(40_000);
  });
});

describe('pricing (spec G4.3)', () => {
  it('takes the origin’s 20-day average close, 2% either way for personality', () => {
    const node = createNode('DME');
    node.fobHistory.Middle_East = [58, 60, 62];
    expect(priceDeal(node, 'Middle_East', 'SELLER', 'BALANCED')).toBe(60);
    expect(priceDeal(node, 'Middle_East', 'SELLER', 'AGGRESSIVE')).toBe(61.2);
    expect(priceDeal(node, 'Middle_East', 'BUYER', 'AGGRESSIVE')).toBe(58.8);
    expect(priceDeal(node, 'Middle_East', 'BUYER', 'CONSERVATIVE')).toBe(61.2);
  });

  it('falls back to the latest close, then the marker', () => {
    const node = createNode('DME');
    expect(priceDeal(node, 'Middle_East', 'SELLER', null)).toBe(62);
    node.lastFobByOrigin.Middle_East = 57.5;
    expect(priceDeal(node, 'Middle_East', 'SELLER', null)).toBe(57.5);
  });
});

describe('daily delivery (spec §5 phase 5a)', () => {
  it('delivers nothing before its first day', () => {
    expect(deliver([sign()], 10)).toEqual([]);
    expect(qasr.storage).toBe(400_000);
  });

  it('loads the day’s volume: the buyer pays price and freight, the seller pays its tariff', () => {
    const deal = sign();
    expect(deliver([deal], 11)).toEqual([{ dealId: deal.dealId, delivered: 100_000, shortfall: 0, held: 0 }]);
    expect(qasr.storage).toBe(300_000);
    // Middle_East → South_Asia through Hormuz: $1.00 freight. Middle_East export tariff $0.20.
    expect(malabar.cash).toBeCloseTo(60_000_000 - 100_000 * 60 - 100_000 * 1.0, 6);
    expect(qasr.cash).toBeCloseTo(40_000_000 + 100_000 * 60 - 100_000 * 0.2, 6);
    expect(malabar.inboundBarrels).toBe(100_000);
    expect(cargo).toHaveLength(1);
    expect(cargo[0]).toMatchObject({ ownerId: malabar.agentId, qty: 100_000, dealId: deal.dealId, status: 'MOVING', awaitingRoute: false });
    expect(cargo[0]?.route.chokepoints).toEqual(['HORMUZ']);
  });

  it('compensates the buyer for barrels the seller could not load', () => {
    fillTanks(qasr, 40_000 - qasr.storage);
    const deal = sign();
    const [d] = deliver([deal], 11);
    expect(d).toMatchObject({ delivered: 40_000, shortfall: 60_000 });
    const penalty = 0.15 * 60 * 60_000;
    expect(qasr.cash).toBeCloseTo(40_000_000 + 40_000 * 60 - 40_000 * 0.2 - penalty, 6);
    expect(deal).toMatchObject({ deliveredBbl: 40_000, shortfallBbl: 60_000 });
  });

  it('delivers exactly qty_per_day a day, split between delivered and shortfall (invariant 10), and ends on time', () => {
    const deal = sign({ termDays: 30 });
    for (let t = 11; t <= 45; t++) {
      fillTanks(qasr, t % 3 === 0 ? 20_000 : 120_000);   // some days short
      const [d] = deliver([deal], t);
      if (t < 41) expect((d?.delivered ?? 0) + (d?.shortfall ?? 0)).toBe(100_000);
      else expect(d).toBeUndefined();
    }
    expect(deal.status).toBe('ENDED');
    expect(deal.deliveredBbl + deal.shortfallBbl).toBe(30 * 100_000);
  });

  it('with Hormuz closed, fills the Oman bypass then the Red Sea bypass, ahead of spot trade', () => {
    setChokepoint(graph, 'HORMUZ', 'CLOSED');
    const deal = sign({ qtyPerDay: 140_000 });
    deliver([deal], 11);
    expect(cargo.map((c) => [c.route.edges[0], c.qty])).toEqual([['bypass_red_sea', 80_000], ['bypass_oman', 60_000]]);
    expect(routes.capacityLeft(cargo[1]?.route as Cargo['route'], asAgentIdOf('spot-buyer'))).toBe(0);
  });

  it('holds loaded cargo at the origin when no route has space, and sends it when space frees', () => {
    setChokepoint(graph, 'HORMUZ', 'CLOSED');
    for (const [edge, qty] of [['bypass_oman', 30_000], ['bypass_red_sea', 60_000]] as const) setReservation(graph, asEdgeId(edge), asAgentIdOf('rival'), qty, DEFAULT_CONFIG);
    graph.edges.forEach((e) => { if (e.capacity !== null) e.usedBy[asAgentIdOf('rival')] = e.capacity; });
    const deal = sign();
    const cash = malabar.cash;
    // Pipelines full: this is the only day's use, so emulate it by not resetting.
    const [d] = deliverDeals([deal], cargo, agents, routes, ledger, 11, DEFAULT_CONFIG);
    expect(d).toMatchObject({ delivered: 100_000, held: 100_000 });
    expect(cargo[0]).toMatchObject({ status: 'HELD', awaitingRoute: true, qty: 100_000 });
    expect(malabar.cash).toBeCloseTo(cash - 100_000 * 60, 6);   // paid for, no freight yet

    // A new day: the pipelines empty, but the rival's reservations (1,500 + 3,000) stand, leaving
    // 1,500 + 3,000 of shared space. Yesterday's waiting cargo goes first and takes all 4,500;
    // its last 500 barrels and today's new 5,000 wait.
    deliver([deal], 12);
    const sum = (list: Cargo[]) => list.reduce((s, c) => s + c.qty, 0);
    expect(sum(cargo.filter((c) => !c.awaitingRoute))).toBe(90_000);
    expect(sum(cargo.filter((c) => c.awaitingRoute))).toBe(110_000);
    expect(cargo.find((c) => !c.awaitingRoute)?.cargoId).toMatch(/^deal-000001-00011-/);
  });
});

describe('commitments, cancelling and splitting', () => {
  it('counts tomorrow’s deliveries for the producer rule (spec §6.1)', () => {
    const deal = sign();
    expect(dealCommitments([deal], qasr.agentId, 10)).toBe(0);
    expect(dealCommitments([deal], qasr.agentId, 11)).toBe(100_000);
    expect(dealCommitments([deal], malabar.agentId, 11)).toBe(0);
  });

  it('charges the party that walks away CANCEL_RATE of the value still to come, paid to the other', () => {
    const deal = sign({ termDays: 30 });
    const fee = cancelDeal(deal, malabar.agentId, agents, 20, DEFAULT_CONFIG);
    // Days 21–40 remain: 20 × 5,000 × $60 × 10%.
    expect(fee).toBeCloseTo(0.1 * 60 * 100_000 * 20, 6);
    expect(malabar.cash).toBeCloseTo(60_000_000 - fee, 6);
    expect(qasr.cash).toBeCloseTo(40_000_000 + fee, 6);
    expect(deal.status).toBe('CANCELLED');
    expect(deliver([deal], 21)).toEqual([]);
  });

  it('splits a deal into two whole-lot halves with different routes (spec §4.4)', () => {
    const deal = sign({ qtyPerDay: 100_000 });
    const [keep, moved] = splitDeal(deal, ['HORMUZ'], [2, 3], 15, DEFAULT_CONFIG);
    expect(deal.status).toBe('ENDED');
    expect([keep.qtyPerDay, moved.qtyPerDay]).toEqual([40_000, 60_000]);
    expect([keep.avoidChokepoints, moved.avoidChokepoints]).toEqual([[], ['HORMUZ']]);
    expect([keep.startTick, keep.endTick, moved.price]).toEqual([16, 41, 60]);
    expect(() => splitDeal(sign({ qtyPerDay: 20_000 }), [], [4, 5], 15, DEFAULT_CONFIG)).toThrow(/single lot/);
  });
});

describe('conservation across deal deliveries', () => {
  it('moves barrels into cargo and cash only between the parties and the ledger', () => {
    const deal = sign();
    fillTanks(qasr, 240_000 - qasr.storage);
    const barrels = () => qasr.storage + total(malabar.crudeStock) + cargo.reduce((s, c) => s + c.qty, 0);
    const cash = () => qasr.cash + malabar.cash;
    const [b0, c0] = [barrels(), cash()];
    for (let t = 11; t <= 14; t++) deliver([deal], t);   // day 14 is short
    expect(barrels()).toBe(b0);
    expect(cash() - c0).toBeCloseTo(-ledger.total, 6);
  });
});

function asAgentIdOf(id: string): AgentId {
  return id as AgentId;
}
