// Every enumeration uses the same three-line pattern (spec §4.1):
//
//   export const Grade = { LIGHT_SWEET: 'LIGHT_SWEET', ... } as const;   <- the runtime values
//   export type Grade = (typeof Grade)[keyof typeof Grade];              <- the type: any one of those values
//   export const GRADES: readonly Grade[] = Object.values(Grade);        <- every value, for looping
//
// `as const` freezes the strings as literal types, so `Grade.MEDIUM` has the type 'MEDIUM' rather than string.
// The value and the type share a name because TypeScript keeps values and types in separate namespaces;
// the compiler always knows which one you mean from where you use it.
//
// This file imports nothing: data/ and model.ts are built on top of it (spec §14.4).

/** Crude grades, lightest to heaviest (spec §3.2). */
export const Grade = {
  LIGHT_SWEET: 'LIGHT_SWEET',
  MEDIUM: 'MEDIUM',
  HEAVY_SOUR: 'HEAVY_SOUR',
} as const;
export type Grade = (typeof Grade)[keyof typeof Grade];
export const GRADES: readonly Grade[] = Object.values(Grade);

/** Refined products bought by the retail sink (spec §4.13). */
export const Product = {
  GASOLINE: 'GASOLINE',
  DIESEL: 'DIESEL',
  FUEL_OIL: 'FUEL_OIL',
} as const;
export type Product = (typeof Product)[keyof typeof Product];
export const PRODUCTS: readonly Product[] = Object.values(Product);

/** Which side of the market an order is on (spec §4.2). */
export const Side = {
  BID: 'BID',
  ASK: 'ASK',
} as const;
export type Side = (typeof Side)[keyof typeof Side];
export const SIDES: readonly Side[] = Object.values(Side);

/** What a region allows (spec §3.4). */
export const RegionRole = {
  PRODUCTION: 'PRODUCTION',
  REFINING: 'REFINING',
  TERMINAL: 'TERMINAL',
} as const;
export type RegionRole = (typeof RegionRole)[keyof typeof RegionRole];
export const REGION_ROLES: readonly RegionRole[] = Object.values(RegionRole);

/** How fast a region's fields decline (spec §4.6, §7.4). */
export const DeclineClass = {
  SHALE: 'SHALE',
  CONVENTIONAL: 'CONVENTIONAL',
} as const;
export type DeclineClass = (typeof DeclineClass)[keyof typeof DeclineClass];
export const DECLINE_CLASSES: readonly DeclineClass[] = Object.values(DeclineClass);

/** Chokepoint status, listed from least to most severe (spec §3.5). The order is meaningful. */
export const ChokepointStatus = {
  OPEN: 'OPEN',
  TENSION: 'TENSION',
  DELAYED: 'DELAYED',
  CLOSED: 'CLOSED',
} as const;
export type ChokepointStatus = (typeof ChokepointStatus)[keyof typeof ChokepointStatus];
export const CHOKEPOINT_STATUSES: readonly ChokepointStatus[] = Object.values(ChokepointStatus);

/** How an edge of the lane graph carries crude (spec §4.12). */
export const EdgeMode = {
  SEA: 'SEA',
  PIPELINE: 'PIPELINE',
} as const;
export type EdgeMode = (typeof EdgeMode)[keyof typeof EdgeMode];
export const EDGE_MODES: readonly EdgeMode[] = Object.values(EdgeMode);

/** Where a cargo is (spec §4.12). HELD: waiting at a closed chokepoint. FLOATING: waiting offshore for tank space. */
export const CargoStatus = {
  MOVING: 'MOVING',
  HELD: 'HELD',
  FLOATING: 'FLOATING',
} as const;
export type CargoStatus = (typeof CargoStatus)[keyof typeof CargoStatus];
export const CARGO_STATUSES: readonly CargoStatus[] = Object.values(CargoStatus);

/** The four kinds of company (spec §4.7). INTEGRATED is reached, never chosen (spec G2). */
export const AgentKind = {
  PRODUCER: 'PRODUCER',
  REFINER: 'REFINER',
  INTEGRATED: 'INTEGRATED',
  TRADER: 'TRADER',
} as const;
export type AgentKind = (typeof AgentKind)[keyof typeof AgentKind];
export const AGENT_KINDS: readonly AgentKind[] = Object.values(AgentKind);

/** Who runs a company (spec §4.7). */
export const Controller = {
  AI: 'AI',
  HUMAN: 'HUMAN',
} as const;
export type Controller = (typeof Controller)[keyof typeof Controller];
export const CONTROLLERS: readonly Controller[] = Object.values(Controller);

/** AI company temperament (spec G8). */
export const Personality = {
  CONSERVATIVE: 'CONSERVATIVE',
  BALANCED: 'BALANCED',
  AGGRESSIVE: 'AGGRESSIVE',
} as const;
export type Personality = (typeof Personality)[keyof typeof Personality];
export const PERSONALITIES: readonly Personality[] = Object.values(Personality);

/** Lifecycle of a deal (spec §4.4). */
export const DealStatus = {
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];
export const DEAL_STATUSES: readonly DealStatus[] = Object.values(DealStatus);

/** Costs that leave the system, recorded in the fee ledger (spec §7.1). More kinds arrive with later phases. */
export const FeeKind = {
  FREIGHT: 'FREIGHT',
  ORIGIN_TARIFF: 'ORIGIN_TARIFF',
  DESTINATION_TARIFF: 'DESTINATION_TARIFF',
  REFINING_OPEX: 'REFINING_OPEX',
  DEMURRAGE: 'DEMURRAGE',
  EXTRACTION: 'EXTRACTION',
  RESTART: 'RESTART',
  MAINTENANCE: 'MAINTENANCE',
  FIXED_COST: 'FIXED_COST',
  OFFICE: 'OFFICE',
  CREDIT_INTEREST: 'CREDIT_INTEREST',
  CAPITAL: 'CAPITAL',
  LEASE: 'LEASE',
  CHARTER: 'CHARTER',
  RESERVATION: 'RESERVATION',
  REPORT: 'REPORT',
  REPAIR: 'REPAIR',
  LEASE_BONUS: 'LEASE_BONUS',
  WELL_SERVICE: 'WELL_SERVICE',
  WORKOVER: 'WORKOVER',
  EXPOSURE: 'EXPOSURE',
  SETTLEMENT: 'SETTLEMENT',
} as const;
export type FeeKind = (typeof FeeKind)[keyof typeof FeeKind];
export const FEE_KINDS: readonly FeeKind[] = Object.values(FeeKind);

/** Company setting: how much chokepoint risk routes may carry (spec G4.2). */
export const RiskSetting = {
  BOLD: 'BOLD',
  BALANCED: 'BALANCED',
  SAFE: 'SAFE',
} as const;
export type RiskSetting = (typeof RiskSetting)[keyof typeof RiskSetting];
export const RISK_SETTINGS: readonly RiskSetting[] = Object.values(RiskSetting);

/** Producer setting: how eagerly crude is sold (spec G4.2). */
export const SellingSetting = {
  SELL_FAST: 'SELL_FAST',
  BALANCED: 'BALANCED',
  HOLD_FOR_PRICE: 'HOLD_FOR_PRICE',
} as const;
export type SellingSetting = (typeof SellingSetting)[keyof typeof SellingSetting];
export const SELLING_SETTINGS: readonly SellingSetting[] = Object.values(SellingSetting);

/** Refiner setting: how much crude stock to keep (spec G4.2). */
export const StockpileSetting = {
  LEAN: 'LEAN',
  NORMAL: 'NORMAL',
  DEEP: 'DEEP',
} as const;
export type StockpileSetting = (typeof StockpileSetting)[keyof typeof StockpileSetting];
export const STOCKPILE_SETTINGS: readonly StockpileSetting[] = Object.values(StockpileSetting);

/** Trader setting: how much capital to put at risk (spec G4.2). */
export const AppetiteSetting = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type AppetiteSetting = (typeof AppetiteSetting)[keyof typeof AppetiteSetting];
export const APPETITE_SETTINGS: readonly AppetiteSetting[] = Object.values(AppetiteSetting);
