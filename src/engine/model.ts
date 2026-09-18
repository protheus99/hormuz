// Core engine data shapes (spec §4). Everything here is plain data: it saves to JSON and
// copies with structuredClone. That is why lists are arrays, never Set: JSON turns a Set into {}.

import type { Side } from './enums';
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
