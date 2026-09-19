// Moving and delivering cargo (spec §5 phase 4, "Delivery overflow").
//
// Each tick every cargo at sea moves one tick along its route. On arrival it unloads into the
// owner's tanks at the destination — a refinery's crude tanks or a trader's hub — up to the free
// space, and the owner pays the destination tariff on what was unloaded. Whatever does not fit
// stays aboard as FLOATING, paying demurrage every tick it waits. Floating cargo unloads first
// whenever space frees up; after DEMURRAGE_MAX_TICKS the rest is sold off at a distress price.

import { acceptedGrades, plantOf, total } from './companies';
import type { Config } from './config';
import { FeeKind, type Grade } from './enums';
import { recordFee, type FeeLedger } from './economics';
import type { Agent, AgentId, Cargo, CargoId, RegionName, Tick } from './model';
import { advanceCargo, type LaneGraph } from './transport';
import { REGIONS } from '../data/regions';

export interface ForcedSale {
  readonly cargoId: CargoId;
  readonly ownerId: AgentId;
  readonly barrels: number;
  /** Paid by an outside buyer, so it enters the economy like retail revenue. */
  readonly revenue: number;
}

export interface LogisticsReport {
  /** Barrels unloaded into tanks today. */
  readonly delivered: number;
  /** Cargo waiting at a closed chokepoint at the end of the tick. */
  readonly held: number;
  /** Cargo floating offshore at the end of the tick. */
  readonly floating: number;
  /** Barrels that left the economy by forced sale, and what they fetched. */
  readonly forcedSales: readonly ForcedSale[];
}

/**
 * Runs phase 4 for every cargo, in a fixed order: cargo already floating unloads first (it has
 * waited longest), then everything at sea moves. Delivered cargo is removed from the list.
 * `distressPrice(grade)` is the marker price for that grade; forced sales get it less DISTRESS_DISCOUNT.
 */
export function runLogistics(
  cargo: Cargo[],
  agents: ReadonlyMap<AgentId, Agent>,
  g: LaneGraph,
  ledger: FeeLedger,
  tick: Tick,
  config: Config,
  distressPrice: (grade: Grade) => number,
): LogisticsReport {
  let delivered = 0;
  const forcedSales: ForcedSale[] = [];

  for (const c of cargo) {
    if (c.status !== 'FLOATING') continue;
    const owner = ownerOf(agents, c);
    delivered += unload(c, owner, ledger, tick);
    if (c.qty === 0) continue;
    c.demurrageTicks += 1;
    const owed = config.DEMURRAGE_RATE * c.qty;
    owner.cash -= owed;
    recordFee(ledger, { tick, agentId: owner.agentId, kind: FeeKind.DEMURRAGE, amount: owed });
    if (c.demurrageTicks >= config.DEMURRAGE_MAX_TICKS) {
      const revenue = c.qty * distressPrice(c.grade) * (1 - config.DISTRESS_DISCOUNT);
      owner.cash += revenue;
      releaseInbound(owner, c.qty, c.destination, c.grade);
      forcedSales.push({ cargoId: c.cargoId, ownerId: owner.agentId, barrels: c.qty, revenue });
      c.qty = 0;
    }
  }

  for (const c of cargo) {
    if (c.status === 'FLOATING' || c.qty === 0 || c.awaitingRoute) continue;
    if (advanceCargo(c, g) !== 'ARRIVED') continue;
    delivered += unload(c, ownerOf(agents, c), ledger, tick);
    if (c.qty > 0) c.status = 'FLOATING';
  }

  // Remove finished cargo in place, keeping the order of the rest.
  let kept = 0;
  for (const c of cargo) if (c.qty > 0) cargo[kept++] = c;
  cargo.length = kept;

  return {
    delivered,
    held: cargo.filter((c) => c.status === 'HELD').length,
    floating: cargo.filter((c) => c.status === 'FLOATING').length,
    forcedSales,
  };
}

/** Unloads as much of a cargo as fits in the owner's tanks at its destination; returns barrels unloaded. */
function unload(c: Cargo, owner: Agent, ledger: FeeLedger, tick: Tick): number {
  const tanks = tanksAt(owner, c);
  const qty = Math.max(0, Math.min(c.qty, tanks.free));
  if (qty === 0) return 0;
  tanks.add(qty);
  c.qty -= qty;
  releaseInbound(owner, qty, c.destination, c.grade);
  const tariff = REGIONS[c.destination].infrastructureTariff * qty;
  owner.cash -= tariff;
  recordFee(ledger, { tick, agentId: owner.agentId, kind: FeeKind.DESTINATION_TARIFF, amount: tariff });
  return qty;
}

/** The tanks a cargo unloads into: the owner's refinery or trading hub in the destination region. */
function tanksAt(owner: Agent, c: Cargo): { free: number; add: (qty: number) => void } {
  const plant = plantOf(owner);
  if (plant && owner.region === c.destination) {
    // Invariant 6: a refinery never takes a grade its tier cannot process. Orders already enforce
    // this; the check here keeps a stray cargo floating rather than breaking the invariant.
    if (!acceptedGrades(plant.techTier).includes(c.grade)) return { free: 0, add: () => undefined };
    return {
      free: plant.crudeStorageCapacity - total(plant.crudeStock),
      add: (qty) => { plant.crudeStock[c.grade] += qty; },
    };
  }
  if (owner.kind === 'TRADER') {
    const hub = owner.hubs[c.destination];
    if (hub) {
      return {
        free: hub.capacity - total(hub.stock) - total(hub.escrow),
        add: (qty) => { hub.stock[c.grade] += qty; },
      };
    }
  }
  throw new Error(`${owner.name} has no tanks in ${c.destination} for cargo ${c.cargoId}`);
}

/** Barrels no longer on their way stop counting towards a refinery's or hub's inbound total (spec §6.2, §6.4). */
function releaseInbound(owner: Agent, qty: number, destination: RegionName, grade: Grade): void {
  const plant = plantOf(owner);
  if (plant) plant.inboundBarrels = Math.max(0, plant.inboundBarrels - qty);
  const hub = owner.kind === 'TRADER' ? owner.hubs[destination] : undefined;
  if (hub) hub.inbound[grade] = Math.max(0, hub.inbound[grade] - qty);
}

function ownerOf(agents: ReadonlyMap<AgentId, Agent>, c: Cargo): Agent {
  const owner = agents.get(c.ownerId);
  if (owner === undefined) throw new Error(`Cargo ${c.cargoId} belongs to unknown company ${c.ownerId}`);
  return owner;
}
