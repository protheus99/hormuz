// Core engine data shapes (spec §4). Everything here is plain data: it saves to JSON and
// copies with structuredClone. That is why lists are arrays, never Set: JSON turns a Set into {}.

import type { AgentKind, CargoStatus, Controller, Grade, Personality, Side } from './enums';
import type { ChokepointName } from '../data/chokepoints';
import type { NodeName } from '../data/nodes';
import type { RegionName } from '../data/regions';

export type { ChokepointName, NodeName, RegionName };

// ---- Branded identifiers ---------------------------------------------------------------------
// At runtime every ID is a plain string. The `__brand` tag exists only for the compiler, so an
// OrderId cannot be passed where an AgentId is expected even though both are strings underneath.

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type AgentId = Brand<string, 'AgentId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type DealId = Brand<string, 'DealId'>;
export type CargoId = Brand<string, 'CargoId'>;
export type EdgeId = Brand<string, 'EdgeId'>;

export const asAgentId = (id: string): AgentId => id as AgentId;
export const asDealId = (id: string): DealId => id as DealId;
export const asCargoId = (id: string): CargoId => id as CargoId;
export const asEdgeId = (id: string): EdgeId => id as EdgeId;

/**
 * Order IDs are built from the company's index in the world and its sequence within the tick
 * (spec §4.2), never from submission order, so clearing ties break the same way however orders
 * arrive (spec §8). Zero-padding makes text order match number order: '0002-...' < '0010-...'.
 */
export function makeOrderId(agentIndex: number, seq: number): OrderId {
  return `${String(agentIndex).padStart(4, '0')}-${String(seq).padStart(4, '0')}` as OrderId;
}

/** Days since the game began. Plain number: ticks are added and compared constantly. */
export type Tick = number;

// ---- Orders (spec §4.2) ----------------------------------------------------------------------
// An order is either an Ask or a Bid. Each carries a `side` literal, which TypeScript uses to
// tell them apart: once code checks `order.side === 'BID'`, it knows the order is a Bid and that
// `deliveryRegion` exists. This is a discriminated union.

interface OrderBase {
  readonly orderId: OrderId;
  readonly agentId: AgentId;
  readonly node: NodeName;
  /** $/bbl. Asks: FOB at the origin. Bids: delivered to the buyer's region (spec §3.3). */
  readonly limitPrice: number;
  /** Barrels. */
  readonly qty: number;
  /** Barrels still unfilled; clearing decrements it (spec §8). */
  qtyRemaining: number;
}

export interface Ask extends OrderBase {
  readonly side: typeof Side.ASK;
  readonly originRegion: RegionName;
}

export interface Bid extends OrderBase {
  readonly side: typeof Side.BID;
  readonly deliveryRegion: RegionName;
  /** From the company's Risk setting (spec G4.2). */
  readonly avoidChokepoints: readonly ChokepointName[];
}

export type Order = Ask | Bid;

/** A type guard: when it returns true, TypeScript treats `order` as a Bid in that branch. */
export function isBid(order: Order): order is Bid {
  return order.side === 'BID';
}

export function isAsk(order: Order): order is Ask {
  return order.side === 'ASK';
}

// ---- Routes (spec §4.12) ---------------------------------------------------------------------

export interface Route {
  readonly edges: readonly EdgeId[];
  /** $/bbl across every edge, including any chokepoint surcharge. */
  readonly totalFreight: number;
  /** Ticks, including chokepoint delays. */
  readonly totalTransit: number;
  readonly chokepoints: readonly ChokepointName[];
}

// ---- Fills (spec §4.3) -----------------------------------------------------------------------

export interface Fill {
  readonly tick: Tick;
  readonly node: NodeName;
  readonly buyerId: AgentId;
  readonly sellerId: AgentId;
  readonly qty: number;
  /** What the seller receives, $/bbl. */
  readonly fobPrice: number;
  readonly freight: number;
  readonly destinationTariff: number;
  /** What the buyer pays: fobPrice + freight + destinationTariff. */
  readonly landedPrice: number;
  readonly originRegion: RegionName;
  readonly deliveryRegion: RegionName;
  readonly route: Route;
  /** null for spot trades. Written as `| null` rather than optional, so it is always present. */
  readonly dealId: DealId | null;
}

// ---- Companies (spec §4.7–4.11) --------------------------------------------------------------
// A company is a Producer, a Refiner or a Trader, told apart by `kind` — another discriminated
// union. IntegratedMajor joins the union in Phase 3.

/** Barrels held of each grade. Record<Grade, number> forces an entry for every grade. */
export type Stock = Record<Grade, number>;
export const emptyStock = (): Stock => ({ LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 });

/** Tier 1 refines Light Sweet; Tier 2 adds Medium; Tier 3 refines everything (spec §4.9). */
export type TechTier = 1 | 2 | 3;

interface CompanyBase {
  readonly agentId: AgentId;
  readonly name: string;
  /** Home region: where a producer's wells or a refiner's plant are. */
  readonly region: RegionName;
  readonly controller: Controller;
  /** AI companies only (spec G8); null for the player. */
  readonly personality: Personality | null;
  cash: number;
  /** Cash held back by today's bids (spec §5 Phase 5b); zero at the end of every tick (invariant 4). */
  cashReserved: number;
  creditLimit: number;
  creditDrawn: number;
  insolvent: boolean;
}

export interface Producer extends CompanyBase {
  readonly kind: typeof AgentKind.PRODUCER;
  readonly grade: Grade;
  /** bbl/day. */
  extractionCapacity: number;
  fieldMaxCapacity: number;
  /** $/bbl before the region's labor index. */
  readonly baseExtractionCost: number;
  storageCapacity: number;
  /** Barrels free to sell. */
  storage: number;
  /** Barrels locked by today's asks; zero at the end of every tick (invariant 4). */
  storageEscrow: number;
}

export interface Refiner extends CompanyBase {
  readonly kind: typeof AgentKind.REFINER;
  techTier: TechTier;
  /** bbl/day. */
  processingCapacity: number;
  crudeStorageCapacity: number;
  crudeStock: Stock;
  /** Barrels bought and still at sea, counted when sizing new bids (spec §6.2). */
  inboundBarrels: number;
  /** 0–1, set each day by the crack-spread throttle (spec §6.5). */
  utilization: number;
  /** 0–1, a ceiling set by cards; the throttle never runs above it. */
  utilizationCap: number;
  /** False while shut down by the owner. */
  online: boolean;
  /** Days left on a breakdown; the plant refines nothing until it reaches 0. */
  outageTicksRemaining: number;
  /** Days left on tier-upgrade works, and the share of capacity usable meanwhile (spec §4.9). */
  worksTicksRemaining: number;
  worksFactor: number;
  daysSinceMaintenance: number;
}

/** A trader's storage in one office region. */
export interface HubHolding {
  capacity: number;
  stock: Stock;
  /** Barrels locked by today's asks from this region. */
  escrow: Stock;
}

export interface Trader extends CompanyBase {
  readonly kind: typeof AgentKind.TRADER;
  /** Regions the trader can buy into and sell from (spec §4.11). */
  offices: RegionName[];
  hubs: Partial<Record<RegionName, HubHolding>>;
  maxRiskLimit: number;
}

export type Agent = Producer | Refiner | Trader;

// ---- Cargo (spec §4.12) ----------------------------------------------------------------------
// Created when a trade settles. Phase 4 moves it along its route and delivers it.

export interface Cargo {
  readonly cargoId: CargoId;
  readonly ownerId: AgentId;
  readonly grade: Grade;
  readonly qty: number;
  readonly origin: RegionName;
  readonly destination: RegionName;
  readonly route: Route;
  readonly dispatchTick: Tick;
  readonly dealId: DealId | null;
  status: CargoStatus;
}

/** Deterministic cargo IDs: the node and tick that created it, then its position in that settlement. */
export function makeCargoId(node: NodeName, tick: Tick, seq: number): CargoId {
  return `${node}-${String(tick).padStart(5, '0')}-${String(seq).padStart(4, '0')}` as CargoId;
}
