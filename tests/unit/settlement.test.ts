import { beforeEach, describe, expect, it } from 'vitest';
import { clear, createNode, submit } from '../../src/engine/clearing';
import { createProducer, createRefiner, createTrader, total } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createLedger, recordFee, type FeeLedger } from '../../src/engine/economics';
import { makeOrderId, type Agent, type AgentId, type Ask, type Bid, type Producer, type Refiner, type Trader } from '../../src/engine/model';
import { StubRouteProvider } from '../../src/engine/routes';
import { placeOrder, releaseEscrow, settleFills } from '../../src/engine/settlement';

let qasr: Producer;
let straits: Refiner;
let tidemere: Trader;
let ledger: FeeLedger;

beforeEach(() => {
  qasr = createProducer({
    id: 'qasr', name: 'Qasr Petroleum', region: 'Middle_East', grade: 'HEAVY_SOUR', cash: 2_000_000,
    extractionCapacity: 9000, baseExtractionCost: 10, storageCapacity: 30_000, storage: 20_000,
  });
  straits = createRefiner({
    id: 'straits', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000,
    techTier: 3, processingCapacity: 8000, crudeStorageCapacity: 25_000,
  });
  tidemere = createTrader({
    id: 'tidemere', name: 'Tidemere Trading', region: 'Middle_East', cash: 2_000_000,
    offices: [{ region: 'Middle_East', capacity: 50_000 }],
  });
  ledger = createLedger();
});

const ask = (agent: Agent, price: number, qty: number, origin = agent.region): Ask => ({
  orderId: makeOrderId(1, 1), agentId: agent.agentId, node: 'DME', side: 'ASK',
  limitPrice: price, qty, qtyRemaining: qty, originRegion: origin,
});
const bid = (agent: Agent, price: number, qty: number, dest = agent.region): Bid => ({
  orderId: makeOrderId(2, 1), agentId: agent.agentId, node: 'DME', side: 'BID',
  limitPrice: price, qty, qtyRemaining: qty, deliveryRegion: dest, avoidChokepoints: [],
});

describe('escrow when orders are placed (spec §8)', () => {
  it('locks an ask’s barrels and a bid’s cash', () => {
    placeOrder(qasr, ask(qasr, 58, 5000));
    placeOrder(straits, bid(straits, 70, 5000));
    expect([qasr.storage, qasr.storageEscrow]).toEqual([15_000, 5000]);
    expect(straits.cashReserved).toBe(350_000);
  });

  it('rejects asking for more barrels than are held, or bidding more cash than is free', () => {
    expect(() => placeOrder(qasr, ask(qasr, 58, 25_000))).toThrow(/holds 20000/);
    expect(() => placeOrder(straits, bid(straits, 70, 50_000))).toThrow(/has \$3000000 available/);
  });

  it('counts earlier bids against the cash still available', () => {
    placeOrder(straits, bid(straits, 70, 40_000));
    expect(() => placeOrder(straits, bid(straits, 70, 5000))).toThrow(/available/);
  });

  it('only lets companies trade what their role and location allow', () => {
    expect(() => placeOrder(qasr, ask(qasr, 58, 1000, 'Gulf_of_Oman'))).toThrow(/not HEAVY_SOUR in Gulf_of_Oman/);
    expect(() => placeOrder(straits, ask(straits, 58, 1000))).toThrow(/refiners buy crude but do not sell it/);
    expect(() => placeOrder(qasr, bid(qasr, 70, 1000))).toThrow(/producers sell crude but do not buy it/);
    expect(() => placeOrder(straits, bid(straits, 70, 1000, 'South_Asia'))).toThrow(/only take delivery at its refinery/);
    expect(() => placeOrder(tidemere, bid(tidemere, 70, 1000, 'North_Sea'))).toThrow(/no office in North_Sea/);
  });

  it('refuses a grade the refinery’s tier cannot process', () => {
    const small = createRefiner({ id: 'metro', name: 'Metro Refine', region: 'Coastal_Asia', cash: 1e6, techTier: 1, processingCapacity: 6000, crudeStorageCapacity: 20_000 });
    expect(() => placeOrder(small, bid(small, 70, 1000))).toThrow(/Tier 1 and cannot refine HEAVY_SOUR/);
  });

  it('refuses bids from an insolvent company', () => {
    straits.insolvent = true;
    expect(() => placeOrder(straits, bid(straits, 70, 1000))).toThrow(/insolvent/);
  });

  it('refuses an order placed on another company’s behalf', () => {
    expect(() => placeOrder(straits, ask(qasr, 58, 1000))).toThrow(/belongs to qasr/);
  });
});

describe('a full trading day (spec §5 phases 5b–6)', () => {
  function tradeOneDay() {
    const agents = new Map<AgentId, Agent>([[qasr.agentId, qasr], [straits.agentId, straits]]);
    const routes = new StubRouteProvider([{ origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ'] }]);
    const node = createNode('DME');
    const orders = [ask(qasr, 58, 8000), bid(straits, 70, 5000)];
    for (const o of orders) {
      const owner = agents.get(o.agentId);
      if (owner) placeOrder(owner, o);
      submit(node, o, DEFAULT_CONFIG);
    }
    const fills = clear(node, { routes, tick: 3, config: DEFAULT_CONFIG });
    const cargo = settleFills(fills, agents, ledger);
    releaseEscrow(agents.values());
    return { fills, cargo, agents };
  }

  it('moves cash as the spec’s worked example says', () => {
    // 5,000 barrels at FOB 58.60, freight 9.80, Gulf origin tariff 0.20.
    tradeOneDay();
    expect(straits.cash).toBeCloseTo(3_000_000 - 5000 * (58.6 + 9.8), 6);
    expect(qasr.cash).toBeCloseTo(2_000_000 + 5000 * (58.6 - 0.2), 6);
    expect(ledger.total).toBeCloseTo(5000 * (9.8 + 0.2), 6);
  });

  it('ships the barrels as cargo owned by the buyer, and counts them as inbound', () => {
    const { cargo } = tradeOneDay();
    expect(cargo).toEqual([expect.objectContaining({
      ownerId: straits.agentId, grade: 'HEAVY_SOUR', qty: 5000, origin: 'Middle_East',
      destination: 'Coastal_Asia', dispatchTick: 3, status: 'MOVING', dealId: null,
    })]);
    expect(straits.inboundBarrels).toBe(5000);
  });

  it('returns unsold barrels to storage and leaves no escrow at the end of the day (invariant 4)', () => {
    const { agents } = tradeOneDay();
    expect(qasr.storage).toBe(15_000);                       // 20,000 − 5,000 sold
    for (const a of agents.values()) expect(a.cashReserved).toBe(0);
    expect(qasr.storageEscrow).toBe(0);
  });

  it('conserves every barrel and every dollar across a cross-region trade (spec §14.1 Phase 2)', () => {
    const barrelsBefore = qasr.storage + total(straits.crudeStock);
    const cashBefore = qasr.cash + straits.cash;
    const { cargo } = tradeOneDay();

    const barrelsAfter = qasr.storage + qasr.storageEscrow + total(straits.crudeStock) + cargo.reduce((s, c) => s + c.qty, 0);
    expect(barrelsAfter).toBe(barrelsBefore);
    expect(qasr.cash + straits.cash - cashBefore).toBeCloseTo(-ledger.total, 6);
  });

  it('lets a trader sell from its hub, with the same escrow rules', () => {
    const hub = tidemere.hubs.Middle_East;
    if (!hub) throw new Error('hub expected');
    hub.stock.HEAVY_SOUR = 10_000;
    placeOrder(tidemere, ask(tidemere, 58, 6000));
    expect(hub.escrow.HEAVY_SOUR).toBe(6000);
    releaseEscrow([tidemere]);
    expect(hub.stock.HEAVY_SOUR).toBe(10_000);
    expect(hub.escrow.HEAVY_SOUR).toBe(0);
  });
});

describe('fee ledger (spec §7.1)', () => {
  it('keeps a running total and skips zero fees', () => {
    const l = createLedger();
    recordFee(l, { tick: 1, agentId: qasr.agentId, kind: 'FREIGHT', amount: 100 });
    recordFee(l, { tick: 1, agentId: qasr.agentId, kind: 'ORIGIN_TARIFF', amount: 0 });
    expect(l.entries).toHaveLength(1);
    expect(l.total).toBe(100);
  });

  it('rejects negative fees, which would create money', () => {
    expect(() => recordFee(createLedger(), { tick: 1, agentId: qasr.agentId, kind: 'FREIGHT', amount: -1 })).toThrow(/non-negative/);
  });
});
