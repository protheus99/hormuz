// Building companies and checking where they may operate (spec §3.4, §4.7–4.11).
//
// Built-in portfolio data is already checked by the compiler (region names are types). These
// runtime checks catch what types cannot: a producer placed in a refining-only region, a grade
// its region cannot produce, or stock above capacity. They matter most for data loaded at
// runtime, such as saves and future mods.

import { AgentKind, Controller, Grade, Personality, RegionRole } from './enums';
import type { Config } from './config';
import { REGIONS } from '../data/regions';
import {
  asAgentId, emptyStock,
  type Agent, type CompanySettings, type HubHolding, type IntegratedMajor, type PlantState, type Producer, type RegionName, type Refiner,
  type Stock, type TechTier, type Trader, type WellState,
} from './model';

/** Grades a refinery of this tier can process (spec §4.9). */
export function acceptedGrades(tier: TechTier): readonly Grade[] {
  switch (tier) {
    case 1: return [Grade.LIGHT_SWEET];
    case 2: return [Grade.LIGHT_SWEET, Grade.MEDIUM];
    case 3: return [Grade.LIGHT_SWEET, Grade.MEDIUM, Grade.HEAVY_SOUR];
  }
}

/** Cash not already promised to today's bids. */
export function availableCash(agent: Agent): number {
  return agent.cash - agent.cashReserved;
}

/** The company's wells, if it has any. */
export function wellOf(agent: Agent): WellState | undefined {
  if (agent.kind === 'PRODUCER') return agent;
  if (agent.kind === 'INTEGRATED') return agent.well;
  return undefined;
}

/** The company's refinery, if it has one. */
export function plantOf(agent: Agent): PlantState | undefined {
  if (agent.kind === 'REFINER') return agent;
  if (agent.kind === 'INTEGRATED') return agent.plant;
  return undefined;
}

/** Fields every company is created with; the player's company passes controller HUMAN. */
interface CompanySpec {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly cash: number;
  readonly controller?: Controller;
  readonly personality?: Personality;
  /** Overrides the personality preset (spec G8); the player's company starts at the middle options. */
  readonly settings?: Partial<CompanySettings>;
}

/** A producer's wells and storage. */
export interface WellSpec {
  readonly grade: Grade;
  readonly extractionCapacity: number;
  readonly baseExtractionCost: number;
  readonly storageCapacity: number;
  /** Starting barrels in storage. Defaults to 25% of capacity (spec §10.2). */
  readonly storage?: number;
}

/** A refinery and its crude tanks. */
export interface PlantSpec {
  readonly techTier: TechTier;
  readonly processingCapacity: number;
  readonly crudeStorageCapacity: number;
  readonly crudeStock?: Partial<Stock>;
}

export interface ProducerSpec extends CompanySpec, WellSpec {}
export interface RefinerSpec extends CompanySpec, PlantSpec {}
export interface IntegratedSpec extends CompanySpec {
  readonly well: WellSpec;
  readonly plant: PlantSpec;
}

export interface TraderSpec extends CompanySpec {
  /** Office regions and the storage owned in each. The home region must be one of them. */
  readonly offices: readonly { readonly region: RegionName; readonly capacity: number }[];
}

/**
 * Regions where no new refinery may be built, so integration is closed there (spec G2, §10.3).
 * A big Gulf refinery would let Gulf crude leave as product during a Hormuz closure and defuse
 * the flagship scenario. Refineries that start there in a portfolio are allowed.
 */
export const CLOSED_TO_NEW_REFINING: readonly RegionName[] = ['Middle_East'];

export function createProducer(s: ProducerSpec): Producer {
  requireNonNegative(s, { cash: s.cash });
  return { ...base(s), kind: AgentKind.PRODUCER, ...buildWell(s, s.region, s) };
}

export function createRefiner(s: RefinerSpec): Refiner {
  requireNonNegative(s, { cash: s.cash });
  return { ...base(s), kind: AgentKind.REFINER, ...buildPlant(s, s.region, s) };
}

/** An integrated major that exists from the start, as in an AI portfolio (spec §10). */
export function createIntegrated(s: IntegratedSpec): IntegratedMajor {
  requireNonNegative(s, { cash: s.cash });
  return { ...base(s), kind: AgentKind.INTEGRATED, well: buildWell(s, s.region, s.well), plant: buildPlant(s, s.region, s.plant) };
}

/**
 * A producer becomes integrated when its new refinery is finished (spec §4.10, G2): the wells,
 * cash and identity carry over, and the new plant joins them in the same region. The card that
 * starts the build (Phase 9) pays for it and chooses the plant; this only checks it is allowed.
 * Must run between ticks, when nothing is held in escrow.
 */
export function integrate(p: Producer, plant: PlantSpec): IntegratedMajor {
  const spec = { id: p.agentId, name: p.name, region: p.region, cash: p.cash };
  if (CLOSED_TO_NEW_REFINING.includes(p.region)) fail(spec, `no new refineries may be built in ${p.region} (spec §10.3)`);
  if (p.storageEscrow !== 0 || p.cashReserved !== 0) fail(spec, 'integration must happen between ticks, with no escrow held');
  const {
    kind, grade, extractionCapacity, fieldMaxCapacity, baseExtractionCost, storageCapacity, storage, storageEscrow,
    peakCapacity, extractionRate, shutIn, rampTicksRemaining, daysUnsold, breakevenStreak, ...company
  } = p;
  return {
    ...company,
    kind: AgentKind.INTEGRATED,
    well: {
      grade, extractionCapacity, fieldMaxCapacity, baseExtractionCost, storageCapacity, storage, storageEscrow,
      peakCapacity, extractionRate, shutIn, rampTicksRemaining, daysUnsold, breakevenStreak,
    },
    plant: buildPlant(spec, p.region, plant),
  };
}

/** The lowest tech tier that can refine a grade (spec §4.9). */
export function minimumTier(grade: Grade): TechTier {
  return grade === Grade.LIGHT_SWEET ? 1 : grade === Grade.MEDIUM ? 2 : 3;
}

/**
 * The refinery a producer builds to integrate (spec G2): UNIT_CAPACITY at the lowest tier that
 * can refine the producer's own crude, with 10 days of crude storage.
 */
export function integrationPlant(p: Producer, config: Config): PlantSpec {
  return { techTier: minimumTier(p.grade), processingCapacity: config.UNIT_CAPACITY, crudeStorageCapacity: 10 * config.UNIT_CAPACITY };
}

/**
 * What a new plant costs to build (spec G2, §7.4): FACTORY_COST per bbl/day, plus TIER_COST for
 * each tier above 1, all scaled by the region's labor index.
 */
export function plantCost(region: RegionName, plant: PlantSpec, config: Config): number {
  const perBarrel = config.FACTORY_COST
    + (plant.techTier >= 2 ? config.TIER_COST.TO_TIER_2 : 0)
    + (plant.techTier >= 3 ? config.TIER_COST.TO_TIER_3 : 0);
  return perBarrel * plant.processingCapacity * REGIONS[region].laborCostIndex;
}

function buildWell(owner: CompanySpec, region: RegionName, w: WellSpec): WellState {
  if (!hasRole(region, RegionRole.PRODUCTION)) fail(owner, `${region} has no production role`);
  if (!(REGIONS[region].exploitableGrades as readonly Grade[]).includes(w.grade)) fail(owner, `${region} cannot produce ${w.grade}`);
  const storage = w.storage ?? 0.25 * w.storageCapacity;
  requireNonNegative(owner, { extractionCapacity: w.extractionCapacity, baseExtractionCost: w.baseExtractionCost, storage });
  if (storage > w.storageCapacity) fail(owner, `storage ${storage} exceeds capacity ${w.storageCapacity}`);
  return {
    grade: w.grade,
    extractionCapacity: w.extractionCapacity,
    fieldMaxCapacity: 2 * w.extractionCapacity,
    baseExtractionCost: w.baseExtractionCost,
    storageCapacity: w.storageCapacity,
    storage,
    storageEscrow: 0,
    peakCapacity: w.extractionCapacity,
    extractionRate: 1,
    shutIn: false,
    rampTicksRemaining: 0,
    daysUnsold: 0,
    breakevenStreak: 0,
  };
}

function buildPlant(owner: CompanySpec, region: RegionName, pl: PlantSpec): PlantState {
  if (!hasRole(region, RegionRole.REFINING)) fail(owner, `${region} has no refining role`);
  const crudeStock: Stock = { ...emptyStock(), ...pl.crudeStock };
  const accepted = acceptedGrades(pl.techTier);
  for (const [grade, qty] of Object.entries(crudeStock) as [Grade, number][]) {
    if (qty > 0 && !accepted.includes(grade)) fail(owner, `a Tier ${pl.techTier} refinery cannot hold ${grade}`);
  }
  requireNonNegative(owner, { processingCapacity: pl.processingCapacity, ...crudeStock });
  if (total(crudeStock) > pl.crudeStorageCapacity) fail(owner, 'crude stock exceeds storage capacity');
  return {
    techTier: pl.techTier,
    processingCapacity: pl.processingCapacity,
    crudeStorageCapacity: pl.crudeStorageCapacity,
    crudeStock,
    inboundBarrels: 0,
    utilization: 1,
    utilizationCap: 1,
    online: true,
    outageTicksRemaining: 0,
    maintenanceTicksRemaining: 0,
    worksTicksRemaining: 0,
    worksFactor: 1,
    daysSinceMaintenance: 0,
    maintenanceHoldUntil: 0,
    maintenanceAt: null,
    limpShare: 0,
    crudePreference: null,
  };
}

export function createTrader(s: TraderSpec): Trader {
  const regions = s.offices.map((o) => o.region);
  if (regions.length === 0) fail(s, 'a trader needs at least one office');
  if (new Set(regions).size !== regions.length) fail(s, 'offices must be in different regions');
  if (!regions.includes(s.region)) fail(s, `home region ${s.region} must be one of its offices`);
  requireNonNegative(s, { cash: s.cash });

  const hubs: Partial<Record<RegionName, HubHolding>> = {};
  for (const o of s.offices) {
    requireNonNegative(s, { [`${o.region} capacity`]: o.capacity });
    hubs[o.region] = { capacity: o.capacity, stock: emptyStock(), escrow: emptyStock() };
  }
  return { ...base(s), kind: AgentKind.TRADER, offices: regions, hubs, priceMemory: {} };
}

/** Total barrels across every grade. */
export function total(stock: Stock): number {
  return stock.LIGHT_SWEET + stock.MEDIUM + stock.HEAVY_SOUR;
}

/**
 * A personality is a preset over the company settings (spec G8): Conservative is Safe, Hold for
 * price, Deep, Low; Aggressive is Bold, Sell fast, Lean, High; Balanced takes the middle options.
 */
export function presetSettings(personality: Personality | null): CompanySettings {
  switch (personality) {
    case Personality.CONSERVATIVE:
      return { risk: 'SAFE', selling: 'HOLD_FOR_PRICE', stockpile: 'DEEP', appetite: 'LOW' };
    case Personality.AGGRESSIVE:
      return { risk: 'BOLD', selling: 'SELL_FAST', stockpile: 'LEAN', appetite: 'HIGH' };
    default:
      return { risk: 'BALANCED', selling: 'BALANCED', stockpile: 'NORMAL', appetite: 'MEDIUM' };
  }
}

function base(s: CompanySpec) {
  const controller = s.controller ?? Controller.AI;
  const personality = controller === Controller.AI ? (s.personality ?? Personality.BALANCED) : null;
  return {
    agentId: asAgentId(s.id),
    name: s.name,
    region: s.region,
    controller,
    personality,
    settings: { ...presetSettings(personality), ...s.settings },
    cash: s.cash,
    cashReserved: 0,
    creditLimit: 0,
    creditDrawn: 0,
    insolvent: false,
  };
}

function hasRole(region: RegionName, role: RegionRole): boolean {
  return (REGIONS[region].roles as readonly RegionRole[]).includes(role);
}

function requireNonNegative(s: CompanySpec, values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!(Number.isFinite(value) && value >= 0)) fail(s, `${name} must be a non-negative number, got ${value}`);
  }
}

// `never` as the return type tells TypeScript this function always throws, so code after a
// call to fail() is known to be unreachable.
function fail(s: CompanySpec, reason: string): never {
  throw new Error(`Cannot create ${s.name}: ${reason}`);
}
