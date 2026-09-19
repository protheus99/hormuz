// Card actions (spec G4.4): each does what its card says, costs what it should, and every
// invariant holds while it plays out (step() checks them daily).

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { REGIONS } from '../../src/data/regions';
import { actionCost, applyAction, projectCost, type Action } from '../../src/engine/actions';
import { plantOf, wellOf } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import type { Agent, AgentId } from '../../src/engine/model';
import { createWorld, netWorth, run, step, type World } from '../../src/engine/world';

const cfg = DEFAULT_CONFIG;
const fresh = () => createWorld({ seed: 'actions', portfolio: GLOBAL_PORTFOLIO });
const get = (w: World, id: string): Agent => {
  const a = w.agents.find((x) => x.agentId === id);
  if (!a) throw new Error(`no ${id}`);
  return a;
};
const act = (w: World, id: string, action: Action) => applyAction(w, id as AgentId, action);
const fees = (w: World, kind: string) => w.ledger.entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);

describe('capital projects (spec G4.4)', () => {
  it('drills in daily instalments and adds DRILL_STEP of capacity when done', () => {
    const w = fresh();
    const control = fresh();   // the same world without the drilling, for comparison
    run(w, 5);
    run(control, 5);
    const qasr = get(w, 'Qasr_Petroleum');
    const cost = projectCost(w, qasr, 'DRILL', 1);
    expect(cost).toBeCloseTo(cfg.DRILL_COST * cfg.DRILL_STEP * REGIONS.Middle_East.laborCostIndex, 6);
    expect(actionCost(w, qasr.agentId, { kind: 'START_PROJECT', project: 'DRILL', steps: 1 })).toEqual({ now: 0, total: cost });
    act(w, 'Qasr_Petroleum', { kind: 'START_PROJECT', project: 'DRILL', steps: 1 });
    let paid = 0;
    for (let d = 0; d < cfg.DRILL_TICKS; d++) { step(w); step(control); paid += fees(w, 'CAPITAL'); }
    expect(paid).toBeCloseTo(cost, 4);
    const gained = (wellOf(get(w, 'Qasr_Petroleum'))?.extractionCapacity ?? 0) - (wellOf(get(control, 'Qasr_Petroleum'))?.extractionCapacity ?? 0);
    expect(gained).toBeCloseTo(cfg.DRILL_STEP, 0);   // less one day of decline on the new wells
    expect(w.projects).toHaveLength(0);
  });

  it('pauses projects — no work and no payment — while held', () => {
    const w = fresh();
    act(w, 'Qasr_Petroleum', { kind: 'START_PROJECT', project: 'DRILL', steps: 1 });
    act(w, 'Qasr_Petroleum', { kind: 'HOLD_PROJECTS', days: 10 });
    run(w, 9);
    expect(w.projects[0]?.ticksLeft).toBe(cfg.DRILL_TICKS);
    run(w, 2);
    expect(w.projects[0]?.ticksLeft).toBe(cfg.DRILL_TICKS - 1);
  });

  it('upgrades a tier: reduced capacity during the works, the next tier after TIER_TICKS', () => {
    const w = fresh();
    act(w, 'Metro_Refine', { kind: 'START_PROJECT', project: 'TIER', steps: 1 });
    expect(plantOf(get(w, 'Metro_Refine'))?.worksFactor).toBe(cfg.WORKS_CAPACITY_FACTOR);
    run(w, cfg.TIER_TICKS);
    expect(plantOf(get(w, 'Metro_Refine'))).toMatchObject({ techTier: 2, worksFactor: 1 });
  });

  it('adds a processing unit of UNIT_CAPACITY', () => {
    const w = fresh();
    const before = plantOf(get(w, 'Straits_Refining'))?.processingCapacity ?? 0;
    act(w, 'Straits_Refining', { kind: 'START_PROJECT', project: 'UNIT', steps: 1 });
    run(w, cfg.FACTORY_TICKS);
    expect(plantOf(get(w, 'Straits_Refining'))?.processingCapacity).toBe(before + 2500);
  });

  it('turns a producer into an integrated major when its refinery is finished (spec G2)', () => {
    const w = fresh();
    act(w, 'Fennrick_Offshore', { kind: 'START_PROJECT', project: 'REFINERY', steps: 1 });
    run(w, cfg.FACTORY_TICKS);
    const f = get(w, 'Fennrick_Offshore');
    expect(f.kind).toBe('INTEGRATED');
    expect(plantOf(f)).toMatchObject({ techTier: 2, processingCapacity: 2500 });
    run(w, 5);   // and the world carries on with it
  });

  it('refuses a refinery in the Gulf, where no new refining may be built', () => {
    expect(() => act(fresh(), 'Qasr_Petroleum', { kind: 'START_PROJECT', project: 'REFINERY', steps: 1 })).toThrow(/No new refineries/);
  });
});

describe('operating actions (spec G4.4)', () => {
  it('cuts output, shuts wells in, and restarts them for a fee', () => {
    const w = fresh();
    act(w, 'Volga_Export', { kind: 'SET_OUTPUT', rate: 0.5 });
    expect(wellOf(get(w, 'Volga_Export'))?.extractionRate).toBe(0.5);
    act(w, 'Volga_Export', { kind: 'SET_OUTPUT', rate: 0 });
    expect(wellOf(get(w, 'Volga_Export'))?.shutIn).toBe(true);
    const cost = actionCost(w, 'Volga_Export' as AgentId, { kind: 'SET_OUTPUT', rate: 1 }).now;
    const cash = get(w, 'Volga_Export').cash;
    act(w, 'Volga_Export', { kind: 'SET_OUTPUT', rate: 1 });
    expect(cash - get(w, 'Volga_Export').cash).toBeCloseTo(cost, 6);
    run(w, 3);
  });

  it('caps the run rate, and the throttle respects the cap', () => {
    const w = fresh();
    act(w, 'Huanghai_Petrochem', { kind: 'SET_RUN_CAP', cap: 0.5, days: 30 });
    run(w, 10);
    expect(plantOf(get(w, 'Huanghai_Petrochem'))?.utilization).toBeLessThanOrEqual(0.5);
    run(w, 25);   // the cap lifts after 30 days and the plant climbs back
    expect(plantOf(get(w, 'Huanghai_Petrochem'))?.utilizationCap).toBe(1);
  });

  it('shuts a plant for maintenance now, or on a scheduled day', () => {
    const w = fresh();
    act(w, 'Levant_Refining', { kind: 'MAINTAIN_NOW' });
    expect(plantOf(get(w, 'Levant_Refining'))?.maintenanceTicksRemaining).toBe(cfg.MAINT_TICKS);
    act(w, 'Baltic_Refining', { kind: 'SCHEDULE_MAINTENANCE', inDays: 14 });
    run(w, 13);
    expect(plantOf(get(w, 'Baltic_Refining'))?.maintenanceTicksRemaining).toBe(0);
    run(w, 1);
    expect(plantOf(get(w, 'Baltic_Refining'))?.maintenanceTicksRemaining).toBeGreaterThan(0);
  });

  it('holds back maintenance when a card defers it', () => {
    const w = fresh();
    const p = plantOf(get(w, 'Levant_Refining'));
    if (p) p.daysSinceMaintenance = cfg.MAINT_INTERVAL;
    act(w, 'Levant_Refining', { kind: 'DEFER_MAINTENANCE', days: 60 });
    run(w, 30);
    expect(plantOf(get(w, 'Levant_Refining'))?.maintenanceTicksRemaining).toBe(0);
  });

  it('halves a breakdown with an emergency repair, or keeps half the plant running', () => {
    const w = fresh();
    const p = plantOf(get(w, 'Seralang_Refining'));
    if (!p) throw new Error('plant');
    p.outageTicksRemaining = 16;
    act(w, 'Seralang_Refining', { kind: 'EMERGENCY_REPAIR' });
    expect(p.outageTicksRemaining).toBe(8);
    act(w, 'Seralang_Refining', { kind: 'PARTIAL_RESTART', share: 0.5 });
    const before = w.totals.refined;
    step(w);
    expect(w.totals.refined).toBeGreaterThan(before);
  });

  it('favours the chosen crude, and refuses one the tier cannot refine', () => {
    const w = fresh();
    act(w, 'Malabar_Refining', { kind: 'CRUDE_MIX', grade: 'HEAVY_SOUR', weight: 'ALL' });
    expect(plantOf(get(w, 'Malabar_Refining'))?.crudePreference).toEqual({ grade: 'HEAVY_SOUR', weight: 'ALL' });
    expect(() => act(w, 'Metro_Refine', { kind: 'CRUDE_MIX', grade: 'HEAVY_SOUR', weight: 'ALL' })).toThrow(/cannot refine/);
  });

  it('draws on the credit line, up to its limit', () => {
    const w = fresh();
    const a = get(w, 'Metro_Refine');
    act(w, 'Metro_Refine', { kind: 'DRAW_CREDIT', amount: 1_000_000 });
    expect(a.creditDrawn).toBe(1_000_000);
    act(w, 'Metro_Refine', { kind: 'DRAW_CREDIT', amount: 1e12 });
    expect(a.creditDrawn).toBe(a.creditLimit);
    step(w);
  });
});

describe('trading actions (spec G4.4)', () => {
  it('places an emergency bid every day of its term, beside the rules’ own orders', () => {
    const w = fresh();
    run(w, 10);
    const before = w.agents.find((a) => a.agentId === 'Straits_Refining');
    const inbound = plantOf(before as Agent)?.inboundBarrels ?? 0;
    act(w, 'Straits_Refining', { kind: 'STANDING_ORDER', side: 'BID', node: 'DME', region: 'Coastal_Asia', price: 150, qty: 10_000, days: 1 });
    step(w);
    expect(plantOf(get(w, 'Straits_Refining'))?.inboundBarrels).toBeGreaterThan(inbound);
    step(w);
    expect(w.standingOrders).toHaveLength(0);
  });

  it('signs, reroutes and cancels deals', () => {
    const w = fresh();
    run(w, 3);
    act(w, 'Qasr_Petroleum', { kind: 'SIGN_DEAL', terms: {
      sellerId: 'Qasr_Petroleum' as AgentId, buyerId: 'Malabar_Refining' as AgentId, grade: 'HEAVY_SOUR', originRegion: 'Middle_East',
      deliveryRegion: 'South_Asia', qtyPerDay: 4000, termDays: 30, price: 60, avoidChokepoints: [],
    } });
    expect(w.deals).toHaveLength(1);
    act(w, 'Malabar_Refining', { kind: 'REROUTE_DEAL', dealId: w.deals[0]?.dealId as never, avoid: ['HORMUZ'], half: true });
    expect(w.deals.filter((d) => d.status === 'ACTIVE').map((d) => [d.qtyPerDay, d.avoidChokepoints])).toEqual([[2000, []], [2000, ['HORMUZ']]]);
    run(w, 5);
    const active = w.deals.find((d) => d.status === 'ACTIVE');
    act(w, 'Malabar_Refining', { kind: 'CANCEL_DEAL', dealId: active?.dealId as never });
    expect(active?.status).toBe('CANCELLED');
    run(w, 3);
  });

  it('reserves bypass space for a fee, which lapses after RESERVATION_TICKS', () => {
    const w = fresh();
    act(w, 'Qasr_Petroleum', { kind: 'RESERVE_PIPELINE', edgeId: 'bypass_oman', qty: 1500 });
    const edge = w.graph.edges.find((e) => String(e.id) === 'bypass_oman');
    expect(edge?.reserved['Qasr_Petroleum' as AgentId]).toBe(1500);
    run(w, cfg.RESERVATION_TICKS + 1);
    expect(edge?.reserved['Qasr_Petroleum' as AgentId]).toBeUndefined();
  });

  it('leases storage for a daily fee; when the lease ends any excess is sold off', () => {
    const w = fresh();
    const qasr = get(w, 'Qasr_Petroleum');
    const before = wellOf(qasr)?.storageCapacity ?? 0;
    act(w, 'Qasr_Petroleum', { kind: 'LEASE', region: 'Middle_East', capacity: 20_000, days: 30 });
    expect(wellOf(qasr)?.storageCapacity).toBe(before + 20_000);
    step(w);
    expect(fees(w, 'LEASE')).toBeCloseTo(20_000 * cfg.LEASE_RATE, 6);
    run(w, 30);
    expect(wellOf(get(w, 'Qasr_Petroleum'))?.storageCapacity).toBe(before);
    expect(() => act(w, 'Tarvale_Sands', { kind: 'LEASE', region: 'Western_Canada', capacity: 10_000, days: 30 })).toThrow(/no lease pool/);
  });

  it('opens a trading office with a hub', () => {
    const w = fresh();
    act(w, 'Tidemere_Trading', { kind: 'OPEN_OFFICE', region: 'Coastal_Asia' });
    const t = get(w, 'Tidemere_Trading');
    expect(t.kind === 'TRADER' && t.offices).toContain('Coastal_Asia');
    run(w, 5);
  });

  it('sells cargo held at a closed strait at a distress price', () => {
    const w = createWorld({ seed: 'actions', portfolio: GLOBAL_PORTFOLIO, events: [{ tick: 20, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' }] });
    run(w, 26);
    const owner = w.cargo.find((c) => c.status === 'HELD')?.ownerId;
    if (!owner) throw new Error('expected held cargo');
    const held = () => w.cargo.filter((c) => c.ownerId === owner && c.status === 'HELD').reduce((s, c) => s + c.qty, 0);
    const before = held();
    act(w, owner, { kind: 'SELL_AT_SEA', share: 1 });
    expect(held()).toBe(0);
    expect(w.totals.forceSold).toBeGreaterThanOrEqual(before);
    step(w);
  });
});

describe('net worth (spec G6)', () => {
  it('counts cash, crude, assets and projects, less credit', () => {
    const w = fresh();
    const a = get(w, 'Straits_Refining');
    const before = netWorth(w, a);
    act(w, 'Straits_Refining', { kind: 'DRAW_CREDIT', amount: 1_000_000 });
    expect(netWorth(w, a)).toBeCloseTo(before, 4);   // borrowed cash is owed
  });
});
