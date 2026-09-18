// Building companies and checking where they may operate (spec §3.4, §4.7–4.11).
//
// Built-in portfolio data is already checked by the compiler (region names are types). These
// runtime checks catch what types cannot: a producer placed in a refining-only region, a grade
// its region cannot produce, or stock above capacity. They matter most for data loaded at
// runtime, such as saves and future mods.

import { AgentKind, Controller, Grade, Personality, RegionRole } from './enums';
import { REGIONS } from '../data/regions';
import {
  asAgentId, emptyStock,
  type Agent, type HubHolding, type Producer, type RegionName, type Refiner, type Stock, type TechTier, type Trader,
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

/** Fields every company is created with; the player's company passes controller HUMAN. */
interface CompanySpec {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly cash: number;
  readonly controller?: Controller;
  readonly personality?: Personality;
}

export interface ProducerSpec extends CompanySpec {
  readonly grade: Grade;
  readonly extractionCapacity: number;
  readonly baseExtractionCost: number;
  readonly storageCapacity: number;
  /** Starting barrels in storage. Defaults to 25% of capacity (spec §10.2). */
  readonly storage?: number;
}

export interface RefinerSpec extends CompanySpec {
  readonly techTier: TechTier;
  readonly processingCapacity: number;
  readonly crudeStorageCapacity: number;
  readonly crudeStock?: Partial<Stock>;
}

export interface TraderSpec extends CompanySpec {
  /** Office regions and the storage owned in each. The home region must be one of them. */
  readonly offices: readonly { readonly region: RegionName; readonly capacity: number }[];
  readonly maxRiskLimit: number;
}

export function createProducer(s: ProducerSpec): Producer {
  const region = REGIONS[s.region];
  if (!hasRole(s.region, RegionRole.PRODUCTION)) fail(s, `${s.region} has no production role`);
  if (!(region.exploitableGrades as readonly Grade[]).includes(s.grade)) fail(s, `${s.region} cannot produce ${s.grade}`);
  const storage = s.storage ?? 0.25 * s.storageCapacity;
  requireNonNegative(s, { cash: s.cash, extractionCapacity: s.extractionCapacity, baseExtractionCost: s.baseExtractionCost, storage });
  if (storage > s.storageCapacity) fail(s, `storage ${storage} exceeds capacity ${s.storageCapacity}`);

  return {
    ...base(s),
    kind: AgentKind.PRODUCER,
    grade: s.grade,
    extractionCapacity: s.extractionCapacity,
    fieldMaxCapacity: 2 * s.extractionCapacity,
    baseExtractionCost: s.baseExtractionCost,
    storageCapacity: s.storageCapacity,
    storage,
    storageEscrow: 0,
  };
}

export function createRefiner(s: RefinerSpec): Refiner {
  if (!hasRole(s.region, RegionRole.REFINING)) fail(s, `${s.region} has no refining role`);
  const crudeStock: Stock = { ...emptyStock(), ...s.crudeStock };
  const accepted = acceptedGrades(s.techTier);
  for (const [grade, qty] of Object.entries(crudeStock) as [Grade, number][]) {
    if (qty > 0 && !accepted.includes(grade)) fail(s, `a Tier ${s.techTier} refinery cannot hold ${grade}`);
  }
  requireNonNegative(s, { cash: s.cash, processingCapacity: s.processingCapacity, ...crudeStock });
  if (total(crudeStock) > s.crudeStorageCapacity) fail(s, 'crude stock exceeds storage capacity');

  return {
    ...base(s),
    kind: AgentKind.REFINER,
    techTier: s.techTier,
    processingCapacity: s.processingCapacity,
    crudeStorageCapacity: s.crudeStorageCapacity,
    crudeStock,
    inboundBarrels: 0,
  };
}

export function createTrader(s: TraderSpec): Trader {
  const regions = s.offices.map((o) => o.region);
  if (regions.length === 0) fail(s, 'a trader needs at least one office');
  if (new Set(regions).size !== regions.length) fail(s, 'offices must be in different regions');
  if (!regions.includes(s.region)) fail(s, `home region ${s.region} must be one of its offices`);
  requireNonNegative(s, { cash: s.cash, maxRiskLimit: s.maxRiskLimit });

  const hubs: Partial<Record<RegionName, HubHolding>> = {};
  for (const o of s.offices) {
    requireNonNegative(s, { [`${o.region} capacity`]: o.capacity });
    hubs[o.region] = { capacity: o.capacity, stock: emptyStock(), escrow: emptyStock() };
  }
  return { ...base(s), kind: AgentKind.TRADER, offices: regions, hubs, maxRiskLimit: s.maxRiskLimit };
}

/** Total barrels across every grade. */
export function total(stock: Stock): number {
  return stock.LIGHT_SWEET + stock.MEDIUM + stock.HEAVY_SOUR;
}

function base(s: CompanySpec) {
  const controller = s.controller ?? Controller.AI;
  return {
    agentId: asAgentId(s.id),
    name: s.name,
    region: s.region,
    controller,
    personality: controller === Controller.AI ? (s.personality ?? Personality.BALANCED) : null,
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
