// Starting companies (spec §10). Plain data: world.ts builds the companies from it.
//
// The core portfolio (§10.1) drives Phases 1–6 and the engine tests: eight companies with a
// deliberate 28% surplus of production over refining, because it exists to exercise the engine,
// not to model a realistic market. The global portfolio (§10.2) is the default world for games.

import type { Controller, Grade, Personality } from '../engine/enums';
import type { RegionName } from './regions';

interface CompanyData {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly cash: number;
  readonly personality?: Personality;
  /** HUMAN for the player's company; AI when omitted. */
  readonly controller?: Controller;
}

export interface WellData {
  readonly grade: Grade;
  readonly extractionCapacity: number;
  readonly baseExtractionCost: number;
  readonly storageCapacity: number;
}

export interface PlantData {
  readonly techTier: 1 | 2 | 3;
  readonly processingCapacity: number;
  readonly crudeStorageCapacity: number;
  /** Starting stock, of a grade the plant refines. */
  readonly startingStock: Readonly<Partial<Record<Grade, number>>>;
}

export type PortfolioEntry =
  | (CompanyData & { readonly kind: 'PRODUCER'; readonly well: WellData })
  | (CompanyData & { readonly kind: 'REFINER'; readonly plant: PlantData })
  | (CompanyData & { readonly kind: 'INTEGRATED'; readonly well: WellData; readonly plant: PlantData })
  | (CompanyData & { readonly kind: 'TRADER'; readonly offices: readonly { readonly region: RegionName; readonly capacity: number }[] });

/**
 * Spec §10.1. Producers start 25% full (the §10.2 default). §10.2's "refineries start with 5 days
 * of stock" does not fit the core table's tanks (Metro's 20,000 bbl hold under 4 days), so core
 * refineries start half full. Tidemere's 50,000 bbl of hub storage is split across its three
 * offices in the marker regions.
 */
export const CORE_PORTFOLIO: readonly PortfolioEntry[] = [
  {
    kind: 'PRODUCER', id: 'Boreal_Shale', name: 'Boreal Shale', region: 'US_Permian', cash: 20_000_000,
    well: { grade: 'LIGHT_SWEET', extractionCapacity: 120_000, baseExtractionCost: 34, storageCapacity: 240_000 },
  },
  {
    kind: 'PRODUCER', id: 'Fennrick_Offshore', name: 'Fennrick Offshore', region: 'North_Sea', cash: 20_000_000,
    well: { grade: 'MEDIUM', extractionCapacity: 70_000, baseExtractionCost: 41, storageCapacity: 300_000 },
  },
  {
    kind: 'REFINER', id: 'Metro_Refine', name: 'Metro Refine', region: 'Coastal_Asia', cash: 60_000_000,
    plant: { techTier: 1, processingCapacity: 120_000, crudeStorageCapacity: 400_000, startingStock: { LIGHT_SWEET: 200_000 } },
  },
  {
    kind: 'INTEGRATED', id: 'Skaldmark_Integrated', name: 'Skaldmark Integrated', region: 'North_Sea', cash: 100_000_000,
    well: { grade: 'MEDIUM', extractionCapacity: 160_000, baseExtractionCost: 31, storageCapacity: 400_000 },
    plant: { techTier: 2, processingCapacity: 100_000, crudeStorageCapacity: 300_000, startingStock: { MEDIUM: 150_000 } },
  },
  {
    kind: 'INTEGRATED', id: 'Sabkhar_Integrated', name: 'Sabkhar Integrated', region: 'Middle_East', cash: 100_000_000,
    well: { grade: 'HEAVY_SOUR', extractionCapacity: 80_000, baseExtractionCost: 26, storageCapacity: 200_000 },
    plant: { techTier: 3, processingCapacity: 180_000, crudeStorageCapacity: 500_000, startingStock: { HEAVY_SOUR: 250_000 } },
  },
  {
    kind: 'PRODUCER', id: 'Qasr_Petroleum', name: 'Qasr Petroleum', region: 'Middle_East', cash: 40_000_000,
    well: { grade: 'HEAVY_SOUR', extractionCapacity: 180_000, baseExtractionCost: 24, storageCapacity: 600_000 },
  },
  {
    kind: 'REFINER', id: 'Straits_Refining', name: 'Straits Refining', region: 'Coastal_Asia', cash: 60_000_000,
    plant: { techTier: 3, processingCapacity: 160_000, crudeStorageCapacity: 500_000, startingStock: { HEAVY_SOUR: 250_000 } },
  },
  {
    kind: 'TRADER', id: 'Tidemere_Trading', name: 'Tidemere Trading', region: 'Middle_East', cash: 40_000_000,
    offices: [
      { region: 'US_Permian', capacity: 320_000 },
      { region: 'North_Sea', capacity: 340_000 },
      { region: 'Middle_East', capacity: 340_000 },
    ],
  },
];

// ─── Global portfolio (spec §10.2; the default world for games) ──────────────────────────────

/**
 * Producers hold 10 days of output, starting 25% full, with $2.0M. §10.2's 3 days overflowed on
 * any slow trading day, halting producers within two weeks of a calm start (Phase 7 calibration).
 */
export const PRODUCER_STORAGE_DAYS = 10;

/**
 * Regions whose producers hold more than the usual ten days. Western Canada is landlocked and its
 * pipeline takeaway is rationed — the same fact its $1.80 tariff already encodes from the other
 * side — so operators there sit on deeper tankage and sell in lumps. With ten days its heavy barrel
 * tops out inside seven weeks; with fifteen it runs tight but keeps clear of the §10.3 floor.
 */
const STORAGE_DAYS: Partial<Record<RegionName, number>> = { Western_Canada: 15 };
const storageDaysFor = (region: RegionName): number => STORAGE_DAYS[region] ?? PRODUCER_STORAGE_DAYS;

/** Starting cash for producers and traders in the game world, generous so rivals survive a bad start. */
export const PRODUCER_CASH = 100_000_000;
export const TRADER_CASH = 100_000_000;

const producer = (id: string, region: RegionName, grade: Grade, capacity: number, cost: number): PortfolioEntry => ({
  kind: 'PRODUCER', id, name: id.replace(/_/g, ' '), region, cash: PRODUCER_CASH,
  well: { grade, extractionCapacity: capacity, baseExtractionCost: cost, storageCapacity: storageDaysFor(region) * capacity },
});

/**
 * Refiners' starting cash per bbl/day of capacity: about three weeks of crude at typical prices.
 * Crude is paid for when it is loaded and a far refinery has 16–28 days of it at sea, so §10.2's
 * flat $3.0M left the Asian refineries unable to finance their own supply (found in Phase 7).
 */
export const REFINER_CASH_PER_BBL_DAY = 3_000;

/**
 * §10.2 defaults: 10 days of tanks, starting with 5 days of stock of the grade the tier is built
 * for (Tier 1 light, Tier 2 medium, Tier 3 heavy).
 */
const refiner = (id: string, region: RegionName, techTier: 1 | 2 | 3, capacity: number): PortfolioEntry => ({
  kind: 'REFINER', id, name: id.replace(/_/g, ' '), region, cash: REFINER_CASH_PER_BBL_DAY * capacity,
  plant: {
    techTier, processingCapacity: capacity, crudeStorageCapacity: 10 * capacity,
    startingStock: { [techTier === 1 ? 'LIGHT_SWEET' : techTier === 2 ? 'MEDIUM' : 'HEAVY_SOUR']: 5 * capacity },
  },
});

/**
 * The core eight plus the 23 companies of §10.2: 1,770,000 bbl/day of production against 1,980,000 of
 * refining, a 5.2% surplus at BASE_UTILIZATION (§10.3).
 */
export const GLOBAL_PORTFOLIO: readonly PortfolioEntry[] = [
  // In the game world the core companies follow the global defaults: refineries get the same
  // working capital, and producers outside the Gulf the same 10 days of storage. The Gulf keeps
  // its tight tanks so a Hormuz closure fills them within days (§10.3).
  ...CORE_PORTFOLIO.map((p): PortfolioEntry => {
    if (p.kind === 'REFINER') return { ...p, cash: REFINER_CASH_PER_BBL_DAY * p.plant.processingCapacity };
    if (p.kind === 'TRADER') {
      // Two offices, cash and hub space to match: enough to move crude between the Gulf and Europe.
      return { ...p, cash: TRADER_CASH, offices: [{ region: 'North_Sea', capacity: 500_000 }, { region: 'Middle_East', capacity: 500_000 }] };
    }
    const cash = p.kind === 'PRODUCER' ? Math.max(p.cash, PRODUCER_CASH) : p.cash;
    if ((p.kind === 'PRODUCER' || p.kind === 'INTEGRATED') && p.region !== 'Middle_East') {
      return { ...p, cash, well: { ...p.well, storageCapacity: storageDaysFor(p.region) * p.well.extractionCapacity } };
    }
    return { ...p, cash };
  }),
  refiner('Marshaven_Refining', 'US_Gulf_Coast', 3, 200_000),
  producer('Tarvale_Sands', 'Western_Canada', 'HEAVY_SOUR', 100_000, 41),
  producer('Campeche_Energia', 'Mexico_Gulf', 'HEAVY_SOUR', 80_000, 36),
  refiner('Veracruz_Refining', 'Mexico_Gulf', 1, 100_000),
  producer('Orinoco_Heavy', 'Venezuela_Orinoco', 'HEAVY_SOUR', 60_000, 36),
  producer('Andes_Crudo', 'Colombia_Andean', 'MEDIUM', 50_000, 41),
  producer('Demerara_Offshore', 'Guyana_Suriname', 'LIGHT_SWEET', 80_000, 41),
  producer('Atlantica_Presalt', 'Brazil_Presalt', 'MEDIUM', 140_000, 40),
  refiner('Ilhavera_Refining', 'Brazil_Presalt', 2, 120_000),
  producer('Patagonia_Shale', 'Argentina_Vaca_Muerta', 'LIGHT_SWEET', 50_000, 45),
  refiner('Levant_Refining', 'Southern_Europe', 2, 140_000),
  producer('Volga_Export', 'Russia_West', 'MEDIUM', 180_000, 31),
  refiner('Baltic_Refining', 'Russia_West', 2, 160_000),
  producer('Amur_Pacific', 'Russia_Far_East', 'MEDIUM', 60_000, 37),
  producer('Steppe_Caspian', 'Caspian', 'LIGHT_SWEET', 80_000, 34),
  producer('Sahara_Light', 'North_Africa', 'LIGHT_SWEET', 70_000, 32),
  producer('Guinea_Deepwater', 'West_Africa', 'LIGHT_SWEET', 120_000, 41),
  producer('Dhofar_Oil', 'Gulf_of_Oman', 'MEDIUM', 50_000, 27),
  producer('Borneo_Petro', 'Southeast_Asia', 'LIGHT_SWEET', 40_000, 40),
  refiner('Seralang_Refining', 'Southeast_Asia', 2, 140_000),
  refiner('Huanghai_Petrochem', 'Coastal_Asia', 2, 220_000),
  refiner('Malabar_Refining', 'South_Asia', 3, 180_000),
  refiner('Rannvar_Refining', 'South_Asia', 3, 160_000),
];
