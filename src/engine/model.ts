// Core engine data shapes (spec §4). Everything here is plain data: it saves to JSON and
// copies with structuredClone. That is why lists are arrays, never Set: JSON turns a Set into {}.

import type {
  AgentKind, AppetiteSetting, CargoStatus, Controller, DealStatus, Grade, Personality, RiskSetting, SellingSetting, Side, StockpileSetting,
} from './enums';
import type { ChokepointName } from '../data/chokepoints';
import type { NodeName } from '../data/nodes';
import type { RegionName } from '../data/regions';
import type { ExposureItem } from './exposure';

export type { ChokepointName, NodeName, RegionName };

// ---- Branded identifiers ---------------------------------------------------------------------
// At runtime every ID is a plain string. The `__brand` tag exists only for the compiler, so an
// OrderId cannot be passed where an AgentId is expected even though both are strings underneath.

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type AgentId = Brand<string, 'AgentId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type DealId = Brand<string, 'DealId'>;
export type CargoId = Brand<string, 'CargoId'>;
export type CharterId = Brand<string, 'CharterId'>;
export type LeaseId = Brand<string, 'LeaseId'>;
export type WellId = Brand<string, 'WellId'>;
export type EdgeId = Brand<string, 'EdgeId'>;

export const asAgentId = (id: string): AgentId => id as AgentId;
export const asDealId = (id: string): DealId => id as DealId;
export const asCargoId = (id: string): CargoId => id as CargoId;
export const asCharterId = (id: string): CharterId => id as CharterId;
export const asLeaseId = (id: string): LeaseId => id as LeaseId;
export const asWellId = (id: string): WellId => id as WellId;
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
  /** The war-risk part of that freight, $/bbl. Chartered cargo pays this and nothing else (§7.4). */
  readonly totalSurcharge: number;
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
// A company is a Producer, a Refiner, an IntegratedMajor or a Trader, told apart by `kind` —
// another discriminated union. The physical assets are separate interfaces: a Producer *is* a
// company with a well, a Refiner a company with a plant, and an IntegratedMajor a company that
// owns one of each (spec §4.10). Code that only cares about the asset takes WellState or PlantState.

/** Barrels held of each grade. Record<Grade, number> forces an entry for every grade. */
export type Stock = Record<Grade, number>;
export const emptyStock = (): Stock => ({ LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 });

/**
 * The CEO's standing choices (spec G4.2). Every company carries all four so the record has one
 * shape; only Risk and the play type's own setting apply — Selling for producers, Stockpile for
 * refiners, both for integrated majors, Appetite for traders.
 */
export interface CompanySettings {
  risk: RiskSetting;
  selling: SellingSetting;
  stockpile: StockpileSetting;
  appetite: AppetiteSetting;
}

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
  settings: CompanySettings;
  cash: number;
  /** Cash held back by today's bids (spec §5 Phase 5b); zero at the end of every tick (invariant 4). */
  cashReserved: number;
  creditLimit: number;
  creditDrawn: number;
  insolvent: boolean;
  /**
   * Engine-only (§12A.6). What a company has coming to it for corners cut: never shown, never
   * decaying on its own. Each entry carries what it was protecting, so a reckoning can take that
   * rather than merely charge for it — a fine is a line item at any size.
   */
  record: ExposureItem[];
  /**
   * Counsel retained against the next reckoning (§12A.6, escape E6). It does not make a file go
   * away; it turns a forfeiture into a shutdown and a revocation into a warning, once.
   */
  counsel: boolean;
}

/** Wells and their storage (spec §4.8). */
export interface WellState {
  readonly grade: Grade;
  /**
   * bbl/day. Derived: the sum of what this company's pumping wells make today (§12A.2). Every rule
   * that reads a field's size still reads this, so leases changed nothing above the engine.
   */
  extractionCapacity: number;
  /** The ground this company may drill. One lease until it buys another (§12A.4). */
  leases: Lease[];
  /** Regions this company may take ground in: home at the start, more by licence (§12A.4). */
  licences: RegionName[];
  /** Kept for saves written before leases; the ceiling on drilling is a lease's slots (§12A.3). */
  fieldMaxCapacity: number;
  /** $/bbl before the region's labor index. */
  readonly baseExtractionCost: number;
  storageCapacity: number;
  /** Barrels free to sell. Derived: the sum of what stands at each lease (stage 3b). */
  storage: number;
  /** Barrels locked by today's asks; zero at the end of every tick (invariant 4). Derived likewise. */
  storageEscrow: number;
  /** Highest capacity reached; the "Wells declining" card compares against it (spec G4.4). */
  peakCapacity: number;
  /** Share of capacity pumped, 0–1, set by cards (spec §4.8). */
  extractionRate: number;
  /** True when output was cut below SHUT_IN_THRESHOLD; nothing is pumped until a restart. */
  shutIn: boolean;
  /** Days left ramping back up after a restart. */
  rampTicksRemaining: number;
  /** Days in a row this company offered crude and sold none; each one lowers the ask (spec §6.1). */
  daysUnsold: number;
  /** Days in a row the netback was below (negative) or above (positive) breakeven (spec §6.5). */
  breakevenStreak: number;
}

/** A refinery and its crude tanks (spec §4.9). */
export interface PlantState {
  /** Where the plant stands. A refiner's second site is in another refining region (D34). */
  readonly region: RegionName;
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
  /** Days left of scheduled maintenance; the plant refines nothing meanwhile (spec §6.5). */
  maintenanceTicksRemaining: number;
  /** Days left on tier-upgrade works, and the share of capacity usable meanwhile (spec §4.9). */
  worksTicksRemaining: number;
  worksFactor: number;
  daysSinceMaintenance: number;
  /** Maintenance may not start before this tick (a card delayed it). */
  maintenanceHoldUntil: number;
  /** Maintenance forced to start at this tick (a card scheduled it), or null. */
  maintenanceAt: number | null;
  /** During a breakdown, the share of capacity a partial restart keeps running (0: none). */
  limpShare: number;
  /** A card's crude-mix choice: favour one grade always, or on alternate days (spec G4.4). */
  crudePreference: { readonly grade: Grade; readonly weight: 'ALL' | 'HALF' } | null;
  /** A card's run-rate cap lifts after this tick (0: no end). */
  utilizationCapUntil: number;
  /** "Run flat out": the throttle does not cut before this tick. */
  fullRunUntil: number;
  /** Yesterday's refining margin at the best node, $/bbl, and days in a row it was below fixed cost. */
  lastMargin: number;
  lowMarginDays: number;
}

export interface Producer extends CompanyBase, WellState {
  readonly kind: typeof AgentKind.PRODUCER;
}

export interface Refiner extends CompanyBase, PlantState {
  readonly kind: typeof AgentKind.REFINER;
  /** A second refinery in another refining region, sharing this company's wallet (D34). */
  second: PlantState | null;
}


// ─── Leases and wells (spec §12A) ────────────────────────────────────────────────────────────────

/**
 * What the player is told about a lease's size. The barrels themselves are engine-only: the band is
 * set when the lease is surveyed and never revised, so nothing on screen can leak the true figure.
 */
export const LeaseBand = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const;
export type LeaseBand = (typeof LeaseBand)[keyof typeof LeaseBand];

/** A well's state. The engine runs these; the player sees them and answers cards (§12A.3). */
export const WellStatus = {
  PUMPING: 'PUMPING', DOWN: 'DOWN', MAINTENANCE: 'MAINTENANCE', DRILLING: 'DRILLING', SPENT: 'SPENT',
  /** Shut by order, not by anything wrong with the well (§12A.6). */
  SHUT: 'SHUT',
} as const;
export type WellStatus = (typeof WellStatus)[keyof typeof WellStatus];

export interface Well {
  readonly wellId: WellId;
  /** What it made a day when it was new, before decline. */
  readonly initialRate: number;
  /** What it makes a day now. */
  rate: number;
  /** Barrels this well has lifted in its life. */
  cumulative: number;
  /**
   * Engine-only. The oil this well can reach, fixed when it is sunk: years of what it first made,
   * as the lease's band says. Its rate falls in step with what it has taken, so a well that has
   * lifted its share is spent (§12A.3). Another well on the same lease draws on oil nothing was
   * reaching before, so this never changes once set.
   */
  recoverable: number;
  status: WellStatus;
  /** Days left of whatever it is doing, for every status but PUMPING. */
  ticksRemaining: number;
  daysSinceMaintenance: number;
}

/**
 * Ground a producer has the right to drill (spec §12A.2). Reserves are finite and drawn down by
 * pumping; `band` is all the player is ever shown. The attributes are capacity multipliers only.
 */
export interface Lease {
  readonly leaseId: LeaseId;
  /** Shown to the player. Named once, uniquely, when the world is built (§12A.2). */
  name: string;
  readonly region: RegionName;
  readonly grade: Grade;
  /** Engine-only. Barrels still to be lifted. */
  reserves: number;
  /** Engine-only. What it held when it was first drilled, for the conservation invariant. */
  readonly originalReserves: number;
  /** Engine-only. Everything its wells have ever lifted. */
  produced: number;
  /**
   * Engine-only. Oil that will never be lifted, because a well was lost with ground still under it
   * (§12A.3). Reserves plus produced plus lost is what the lease held, which keeps the barrels
   * honest: a fire destroys oil, it does not make it vanish from the books.
   */
  lost: number;
  /** Services on this lease are held off until this day, at the player's word (§12A.3). */
  serviceHoldUntil: Tick;
  /** Nothing is pumped here until this day: a regulator's doing, not the company's (§12A.6). */
  shutUntil: Tick;
  /**
   * Barrels standing in the tanks at this lease, and barrels locked by today's asks (stage 3b).
   * Oil is held where it was lifted, because a barrel in one region cannot be loaded in another.
   * `WellState.storage` is the sum of these, so every rule that reads a field's tank reads one
   * number and knows nothing about where it is.
   */
  storage: number;
  storageEscrow: number;
  /** Wells sunk here, dry ones included: the next one is likelier to miss (§12A.3). */
  attempts: number;
  /** The published survey: LOW, MEDIUM or HIGH (§12A.2). */
  readonly band: LeaseBand;
  maxWells: number;
  /** Capacity multipliers (§12A.2): each is 1 when the lease does not allow the technique. */
  readonly frackingFactor: number;
  readonly horizontalFactor: number;
  readonly waterFactor: number;
  /** $/bbl before the region's labour index, as `baseExtractionCost` was. */
  readonly baseExtractionCost: number;
  /** What the company paid for it; this is all a lease is worth on the books (§12A.2). */
  readonly acquiredFor: number;
  wells: Well[];
}

/** A producer that also owns a refinery in the same region, with one shared wallet (spec §4.10). */
export interface IntegratedMajor extends CompanyBase {
  readonly kind: typeof AgentKind.INTEGRATED;
  well: WellState;
  plant: PlantState;
}

/** A trader's storage in one office region. */
export interface HubHolding {
  capacity: number;
  stock: Stock;
  /** Barrels locked by today's asks from this region. */
  escrow: Stock;
  /** Barrels bought for this hub and still on their way, so bids leave room for them (spec §6.4). */
  inbound: Stock;
  /**
   * What the barrels held and on their way cost, delivered, by grade ($ in total). A trader prices
   * its asks off this, so it never sells at a loss while it has room to wait (spec §6.4).
   */
  cost: Stock;
}

export interface Trader extends CompanyBase {
  readonly kind: typeof AgentKind.TRADER;
  /** Regions the trader can buy into and sell from (spec §4.11). */
  offices: RegionName[];
  hubs: Partial<Record<RegionName, HubHolding>>;
  /** Each node's marker over the last 20 days, oldest first, for storage plays (spec §6.4). */
  priceMemory: Partial<Record<NodeName, number[]>>;
}

export type Agent = Producer | Refiner | IntegratedMajor | Trader;

// ---- Cargo (spec §4.12) ----------------------------------------------------------------------
// Created when a trade settles. Phase 4 moves it along its route and delivers it.

export interface Cargo {
  readonly cargoId: CargoId;
  readonly ownerId: AgentId;
  readonly grade: Grade;
  /** Barrels still aboard. Falls as a floating cargo is unloaded bit by bit. */
  qty: number;
  readonly origin: RegionName;
  readonly destination: RegionName;
  /** Fixed at dispatch; set later only for deal cargo that waited at its origin for a route. */
  route: Route;
  readonly dispatchTick: Tick;
  readonly dealId: DealId | null;
  status: CargoStatus;
  /** Index into route.edges of the edge being crossed, or waited at; equals its length on arrival. */
  leg: number;
  /** Ticks left on the current edge; 0 means waiting to enter edge `leg`. */
  ticksLeft: number;
  /** Ticks spent floating offshore waiting for tank space (spec §5). */
  demurrageTicks: number;
  /** The tanker carrying it, or null when it travels on the open freight market (spec §7.4). */
  readonly charterId: CharterId | null;
  /** Kept at sea deliberately until this tick: floating storage, no demurrage (the "Keep cargo afloat" card). */
  floatUntil: Tick;
  /**
   * Deal cargo loaded and paid for, waiting at its origin because no route had pipeline space
   * (spec §5 phase 5a). It is HELD, never moves, and is routed again each day until space frees.
   */
  awaitingRoute: boolean;
}

/** A new cargo at the start of its route. Delivery inside one region still takes one tick (spec §5). */
export function newCargo(fields: Omit<Cargo, 'status' | 'leg' | 'ticksLeft' | 'demurrageTicks' | 'awaitingRoute' | 'charterId' | 'floatUntil'> & { charterId?: CharterId | null }): Cargo {
  const local = fields.route.edges.length === 0;
  return {
    ...fields, charterId: fields.charterId ?? null, floatUntil: 0 as Tick,
    status: 'MOVING', leg: 0, ticksLeft: local ? 1 : 0, demurrageTicks: 0, awaitingRoute: false,
  };
}

/** A hired tanker (spec §4.11, §7.4): a fleet of one or two, paid for by the day. */
export type CharterSize = 'SMALL' | 'LARGE';

export interface Charter {
  readonly charterId: CharterId;
  readonly ownerId: AgentId;
  readonly size: CharterSize;
  /** Barrels it can carry in one cargo. */
  readonly capacity: number;
  /** $ per tick while hired, whether or not it is carrying anything. */
  readonly rate: number;
  readonly untilTick: Tick;
}

// ---- Deals (spec §4.4, G4.3) -----------------------------------------------------------------

/** A fixed-price, fixed-volume, fixed-term supply agreement. */
export interface Deal {
  readonly dealId: DealId;
  readonly sellerId: AgentId;
  readonly buyerId: AgentId;
  readonly grade: Grade;
  readonly originRegion: RegionName;
  readonly deliveryRegion: RegionName;
  /** Whole lots per day. */
  readonly qtyPerDay: number;
  /** Fixed FOB $/bbl. */
  readonly price: number;
  /** First delivery day, and the day after the last. */
  readonly startTick: Tick;
  readonly endTick: Tick;
  /** The buyer's route choice; rerouting cards change it by splitting the deal. */
  readonly avoidChokepoints: readonly ChokepointName[];
  /** The other half of a trader's back-to-back pair. */
  readonly linkedDealId: DealId | null;
  status: DealStatus;
  deliveredBbl: number;
  shortfallBbl: number;
}

/** Deterministic deal IDs, in signing order. */
export function makeDealId(seq: number): DealId {
  return `deal-${String(seq).padStart(6, '0')}` as DealId;
}

/** Deterministic cargo IDs: the node and tick that created it, then its position in that settlement. */
export function makeCargoId(node: NodeName, tick: Tick, seq: number): CargoId {
  return `${node}-${String(tick).padStart(5, '0')}-${String(seq).padStart(4, '0')}` as CargoId;
}
