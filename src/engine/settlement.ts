// Escrow and settlement (spec §5 phases 5b–6, §7.1, §8 rule 6).
//
// A day in the market, from a company's side:
//   1. placeOrder   — an ask locks the barrels it offers; a bid holds back the cash it could spend.
//   2. clear        — the node matches orders (clearing.ts).
//   3. settleFills  — each trade moves cash, pays freight and origin tariff, and ships a cargo.
//   4. releaseEscrow — whatever was locked but not traded is freed; escrow is zero again.
//
// Barrels are whole numbers, so their escrow balances exactly. Reserved cash is simply reset to
// zero at the end of the day rather than subtracted order by order, because adding and removing
// the same decimals in a different sequence can leave a residue like 1e-10, and invariant 4
// requires exactly zero.

import { availableCash, acceptedGrades, plantOf, wellOf } from './companies';
import { CargoStatus, FeeKind } from './enums';
import { recordFee, type FeeLedger } from './economics';
import { NODES } from '../data/nodes';
import { REGIONS } from '../data/regions';
import {
  makeCargoId, type Agent, type AgentId, type Cargo, type Fill, type Order, type PlantState, type RegionName, type WellState,
} from './model';
import type { Grade } from './enums';

/** Checks an order against its company and locks what it promises (spec §8 rule 6's counterpart: escrow at submission). */
export function placeOrder(agent: Agent, order: Order): void {
  if (order.agentId !== agent.agentId) throw new Error(`Order ${order.orderId} belongs to ${order.agentId}, not ${agent.agentId}`);
  const grade = NODES[order.node].grade;

  if (order.side === 'ASK') {
    const slot = sellableStock(agent, order.originRegion, grade);
    if (slot.available < order.qty) {
      throw new Error(`${agent.name} offers ${order.qty} barrels of ${grade} from ${order.originRegion} but holds ${slot.available}`);
    }
    slot.lock(order.qty);
    return;
  }

  if (agent.insolvent) throw new Error(`${agent.name} is insolvent and cannot bid (spec D11)`);
  checkBuyer(agent, order.deliveryRegion, grade);
  const cost = order.limitPrice * order.qty;
  if (availableCash(agent) < cost) {
    throw new Error(`${agent.name} bids $${cost} but has $${availableCash(agent)} available`);
  }
  agent.cashReserved += cost;
}

/**
 * Settles one node's fills (spec §5 phase 6). The buyer pays the seller FOB plus freight; the
 * seller pays its origin tariff; the barrels leave the seller's escrow and ship as cargo owned by
 * the buyer. The destination tariff is paid on delivery, in Phase 4.
 */
export function settleFills(fills: readonly Fill[], agents: ReadonlyMap<AgentId, Agent>, ledger: FeeLedger): Cargo[] {
  const cargo: Cargo[] = [];
  fills.forEach((f, i) => {
    const buyer = find(agents, f.buyerId);
    const seller = find(agents, f.sellerId);
    const grade = NODES[f.node].grade;

    sellableStock(seller, f.originRegion, grade).ship(f.qty);

    const goods = f.fobPrice * f.qty;
    const freight = f.freight * f.qty;
    const originTariff = REGIONS[f.originRegion].infrastructureTariff * f.qty;
    buyer.cash -= goods + freight;
    seller.cash += goods - originTariff;
    recordFee(ledger, { tick: f.tick, agentId: buyer.agentId, kind: FeeKind.FREIGHT, amount: freight });
    recordFee(ledger, { tick: f.tick, agentId: seller.agentId, kind: FeeKind.ORIGIN_TARIFF, amount: originTariff });

    const plant = plantOf(buyer);
    if (plant) plant.inboundBarrels += f.qty;
    cargo.push({
      cargoId: makeCargoId(f.node, f.tick, i),
      ownerId: buyer.agentId,
      grade,
      qty: f.qty,
      origin: f.originRegion,
      destination: f.deliveryRegion,
      route: f.route,
      dispatchTick: f.tick,
      dealId: f.dealId,
      status: CargoStatus.MOVING,
    });
  });
  return cargo;
}

/** End of the trading day: untraded barrels go back into storage and no cash stays reserved (invariant 4). */
export function releaseEscrow(agents: Iterable<Agent>): void {
  for (const agent of agents) {
    agent.cashReserved = 0;
    const well = wellOf(agent);
    if (well) {
      well.storage += well.storageEscrow;
      well.storageEscrow = 0;
    } else if (agent.kind === 'TRADER') {
      for (const hub of Object.values(agent.hubs)) {
        for (const grade of Object.keys(hub.escrow) as Grade[]) {
          hub.stock[grade] += hub.escrow[grade];
          hub.escrow[grade] = 0;
        }
      }
    }
  }
}

/** Where a seller's barrels of one grade sit in one region, and how to lock or ship them. */
interface StockSlot {
  readonly available: number;
  lock(qty: number): void;
  ship(qty: number): void;
}

function sellableStock(agent: Agent, region: RegionName, grade: Grade): StockSlot {
  switch (agent.kind) {
    case 'PRODUCER':
    case 'INTEGRATED': {
      const well = wellOf(agent) as WellState;
      if (region !== agent.region || grade !== well.grade) {
        throw new Error(`${agent.name} produces ${well.grade} in ${agent.region}, not ${grade} in ${region}`);
      }
      return {
        available: well.storage,
        lock: (qty) => { well.storage -= qty; well.storageEscrow += qty; },
        ship: (qty) => { takeFromEscrow(agent.name, well.storageEscrow, qty); well.storageEscrow -= qty; },
      };
    }
    case 'TRADER': {
      const hub = agent.hubs[region];
      if (hub === undefined) throw new Error(`${agent.name} has no office in ${region}`);
      return {
        available: hub.stock[grade],
        lock: (qty) => { hub.stock[grade] -= qty; hub.escrow[grade] += qty; },
        ship: (qty) => { takeFromEscrow(agent.name, hub.escrow[grade], qty); hub.escrow[grade] -= qty; },
      };
    }
    case 'REFINER':
      throw new Error(`${agent.name} is a refiner; refiners buy crude but do not sell it`);
  }
}

function checkBuyer(agent: Agent, deliveryRegion: RegionName, grade: Grade): void {
  switch (agent.kind) {
    case 'REFINER':
    case 'INTEGRATED': {
      const plant = plantOf(agent) as PlantState;
      if (deliveryRegion !== agent.region) throw new Error(`${agent.name} can only take delivery at its refinery in ${agent.region}`);
      if (!acceptedGrades(plant.techTier).includes(grade)) throw new Error(`${agent.name} is Tier ${plant.techTier} and cannot refine ${grade}`);
      return;
    }
    case 'TRADER':
      if (agent.hubs[deliveryRegion] === undefined) throw new Error(`${agent.name} has no office in ${deliveryRegion}`);
      return;
    case 'PRODUCER':
      throw new Error(`${agent.name} is a producer; producers sell crude but do not buy it`);
    default:
      // A void function would silently accept a missing case; this line fails to compile instead.
      return agent satisfies never;
  }
}


function takeFromEscrow(name: string, escrowed: number, qty: number): void {
  if (escrowed < qty) throw new Error(`${name} ships ${qty} barrels but only ${escrowed} are in escrow`);
}

function find(agents: ReadonlyMap<AgentId, Agent>, id: AgentId): Agent {
  const agent = agents.get(id);
  if (agent === undefined) throw new Error(`Unknown company ${id}`);
  return agent;
}
