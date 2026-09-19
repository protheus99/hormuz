// Impact projections (spec G4.5): each option's meters come from forking the world, applying the
// option, running PROJECTION_TICKS days, and comparing with the No fork. Forks are calm — no product
// noise, no future events — so a projection shows "what happens if today's conditions hold" and can
// never leak the real future.

import { breakdownHazard } from '../../engine/agents';
import { actionCost, applyAction, type Action } from '../../engine/actions';
import { plantOf, total, wellOf } from '../../engine/companies';
import type { Grade } from '../../engine/enums';
import type { Agent, AgentId } from '../../engine/model';
import { fork, netWorth, step, type World } from '../../engine/world';
import { NODE_FOR_GRADE } from '../../data/nodes';
import type { Impact, RiskLevel } from './types';

interface Run {
  readonly netWorth: number;
  readonly supply: number;
  readonly routeShare: number;
  readonly breakdownChance: number;
  readonly cashDays: number;
}

/**
 * The meters for each option (null actions = No). An option whose actions no longer fit the
 * company returns null. The No option is the baseline, so its profit is always 0.
 */
export function projectOptions(w: World, agentId: AgentId, options: readonly (readonly Action[])[]): (Impact | null)[] {
  const baseline = simulate(w, agentId, []);
  if (baseline === null) return options.map(() => null);
  return options.map((actions) => {
    const result = actions.length === 0 ? baseline : simulate(w, agentId, actions);
    if (result === null) return null;
    const cash = actions.reduce((s, a) => s + actionCost(w, agentId, a).now, 0);
    const days = w.config.PROJECTION_TICKS;
    const [risk, riskReason] = riskOf(result);
    return {
      cash,
      profit: ((result.netWorth - baseline.netWorth + cash) * 30) / days,
      supply: { value: result.supply, unit: supplyUnit(find(w, agentId)) },
      risk,
      riskReason,
    };
  });
}

function simulate(w: World, agentId: AgentId, actions: readonly Action[]): Run | null {
  const f = fork(w, true);
  try {
    for (const action of actions) applyAction(f, agentId, action);
  } catch {
    return null;
  }
  const start = f.tick;
  let supply = supplyUnit(find(f, agentId)) === 'days' ? Infinity : 0;
  let cashDays = Infinity;
  for (let d = 0; d < f.config.PROJECTION_TICKS; d++) {
    step(f);
    const me = find(f, agentId);
    const now = supplyNow(f, me);
    supply = supplyUnit(me) === 'days' ? Math.min(supply, now) : Math.max(supply, now);
    const fixed = dailyFixed(f, me);
    if (fixed > 0) cashDays = Math.min(cashDays, (me.cash - me.cashReserved + me.creditLimit - me.creditDrawn) / fixed);
  }
  const me = find(f, agentId);

  // Routes: the share of barrels the company shipped that crossed a strait at TENSION or worse.
  let shipped = 0;
  let exposed = 0;
  for (const c of f.cargo) {
    if (c.ownerId !== agentId || c.dispatchTick <= start) continue;
    shipped += c.qty;
    if (c.route.chokepoints.some((k) => f.graph.chokepoints[k].status !== 'OPEN')) exposed += c.qty;
  }
  const plant = plantOf(me);
  const hazard = plant ? breakdownHazard(plant, f.config) : 0;
  return {
    netWorth: netWorth(f, me),
    supply: Number.isFinite(supply) ? supply : 0,
    routeShare: shipped > 0 ? exposed / shipped : 0,
    breakdownChance: 1 - (1 - hazard) ** f.config.PROJECTION_TICKS,
    cashDays,
  };
}

/** Spec G4.5: the highest of the route, breakdown and cash parts. */
function riskOf(r: Run): [RiskLevel, Impact['riskReason']] {
  const parts: [RiskLevel, Impact['riskReason']][] = [
    [r.routeShare > 0.5 ? 'HIGH' : r.routeShare >= 0.2 ? 'MEDIUM' : 'LOW', 'ROUTES'],
    [r.breakdownChance > 0.15 ? 'HIGH' : r.breakdownChance >= 0.05 ? 'MEDIUM' : 'LOW', 'BREAKDOWN'],
    [r.cashDays < 10 ? 'HIGH' : r.cashDays <= 30 ? 'MEDIUM' : 'LOW', 'CASH'],
  ];
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
  const worst = parts.reduce((a, b) => (rank[b[0]] > rank[a[0]] ? b : a));
  return worst[0] === 'LOW' ? ['LOW', 'NONE'] : worst;
}

function supplyUnit(a: Agent): 'days' | 'fill' | '$' {
  if (a.kind === 'TRADER') return '$';
  if (a.kind === 'PRODUCER') return 'fill';
  return 'days';
}

/**
 * Days of crude for a plant, storage fill for a producer, stock value for a trader. A plant's crude
 * counts what is on the way as well as what is in the tanks: buying urgently changes nothing in the
 * tanks for weeks, and a meter that cannot see the difference cannot show the decision.
 */
function supplyNow(w: World, a: Agent): number {
  const plant = plantOf(a);
  if (plant) return (total(plant.crudeStock) + plant.inboundBarrels) / Math.max(1, plant.processingCapacity);
  const well = wellOf(a);
  if (well) return well.storageCapacity > 0 ? well.storage / well.storageCapacity : 0;
  if (a.kind === 'TRADER') {
    let value = 0;
    for (const hub of Object.values(a.hubs)) {
      if (!hub) continue;
      for (const g of Object.keys(hub.stock) as Grade[]) value += hub.stock[g] * w.nodes[NODE_FOR_GRADE[g]].markerPrice;
    }
    return value;
  }
  return 0;
}

function dailyFixed(w: World, a: Agent): number {
  const cfg = w.config;
  const well = wellOf(a);
  const plant = plantOf(a);
  return (well ? cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity : 0)
    + (plant ? cfg.FIXED_COST_RATE.REFINER * plant.processingCapacity : 0)
    + (a.kind === 'TRADER' ? cfg.OFFICE_COST.PER_TICK * a.offices.length : 0);
}

function find(w: World, id: AgentId): Agent {
  const a = w.agents.find((x) => x.agentId === id);
  if (!a) throw new Error(`No company ${id}`);
  return a;
}
