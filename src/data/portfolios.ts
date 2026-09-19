// Starting companies (spec §10). Plain data: world.ts builds the companies from it.
//
// The core portfolio (§10.1) drives Phases 1–6 and the engine tests: eight companies with a
// deliberate 28% surplus of production over refining, because it exists to exercise the engine,
// not to model a realistic market. The global portfolio (§10.2) is the default world for games.

import type { Grade, Personality } from '../engine/enums';
import type { RegionName } from './regions';

interface CompanyData {
  readonly id: string;
  readonly name: string;
  readonly region: RegionName;
  readonly cash: number;
  readonly personality?: Personality;
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
    kind: 'PRODUCER', id: 'Boreal_Shale', name: 'Boreal Shale', region: 'US_Permian', cash: 1_000_000,
    well: { grade: 'LIGHT_SWEET', extractionCapacity: 6_000, baseExtractionCost: 24, storageCapacity: 12_000 },
  },
  {
    kind: 'PRODUCER', id: 'Fennrick_Offshore', name: 'Fennrick Offshore', region: 'North_Sea', cash: 1_000_000,
    well: { grade: 'MEDIUM', extractionCapacity: 3_500, baseExtractionCost: 32, storageCapacity: 15_000 },
  },
  {
    kind: 'REFINER', id: 'Metro_Refine', name: 'Metro Refine', region: 'Coastal_Asia', cash: 3_000_000,
    plant: { techTier: 1, processingCapacity: 6_000, crudeStorageCapacity: 20_000, startingStock: { LIGHT_SWEET: 10_000 } },
  },
  {
    kind: 'INTEGRATED', id: 'Skaldmark_Integrated', name: 'Skaldmark Integrated', region: 'North_Sea', cash: 5_000_000,
    well: { grade: 'MEDIUM', extractionCapacity: 8_000, baseExtractionCost: 22, storageCapacity: 20_000 },
    plant: { techTier: 2, processingCapacity: 5_000, crudeStorageCapacity: 15_000, startingStock: { MEDIUM: 7_500 } },
  },
  {
    kind: 'INTEGRATED', id: 'Sabkhar_Integrated', name: 'Sabkhar Integrated', region: 'Middle_East', cash: 5_000_000,
    well: { grade: 'HEAVY_SOUR', extractionCapacity: 4_000, baseExtractionCost: 12, storageCapacity: 10_000 },
    plant: { techTier: 3, processingCapacity: 9_000, crudeStorageCapacity: 25_000, startingStock: { HEAVY_SOUR: 12_500 } },
  },
  {
    kind: 'PRODUCER', id: 'Qasr_Petroleum', name: 'Qasr Petroleum', region: 'Middle_East', cash: 2_000_000,
    well: { grade: 'HEAVY_SOUR', extractionCapacity: 9_000, baseExtractionCost: 10, storageCapacity: 30_000 },
  },
  {
    kind: 'REFINER', id: 'Straits_Refining', name: 'Straits Refining', region: 'Coastal_Asia', cash: 3_000_000,
    plant: { techTier: 3, processingCapacity: 8_000, crudeStorageCapacity: 25_000, startingStock: { HEAVY_SOUR: 12_500 } },
  },
  {
    kind: 'TRADER', id: 'Tidemere_Trading', name: 'Tidemere Trading', region: 'Middle_East', cash: 2_000_000,
    offices: [
      { region: 'US_Permian', capacity: 16_000 },
      { region: 'North_Sea', capacity: 17_000 },
      { region: 'Middle_East', capacity: 17_000 },
    ],
  },
];

// ─── Global portfolio (spec §10.2; the default world for games) ──────────────────────────────

/**
 * Producers hold 10 days of output, starting 25% full, with $2.0M. §10.2's 3 days overflowed on
 * any slow trading day, halting producers within two weeks of a calm start (Phase 7 calibration).
 */
const producer = (id: string, region: RegionName, grade: Grade, capacity: number, cost: number): PortfolioEntry => ({
  kind: 'PRODUCER', id, name: id.replace(/_/g, ' '), region, cash: 2_000_000,
  well: { grade, extractionCapacity: capacity, baseExtractionCost: cost, storageCapacity: 10 * capacity },
});

/**
 * Refiners' starting cash per bbl/day of capacity: about three weeks of crude at typical prices.
 * Crude is paid for when it is loaded and a far refinery has 16–28 days of it at sea, so §10.2's
 * flat $3.0M left the Asian refineries unable to finance their own supply (found in Phase 7).
 */
export const REFINER_CASH_PER_BBL_DAY = 1_500;

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
 * The core eight plus the 23 companies of §10.2: 88,500 bbl/day of production against 99,000 of
 * refining, a 5.2% surplus at BASE_UTILIZATION (§10.3).
 */
export const GLOBAL_PORTFOLIO: readonly PortfolioEntry[] = [
  // The core refineries get the same working capital as the rest of the world.
  ...CORE_PORTFOLIO.map((p) => (p.kind === 'REFINER' ? { ...p, cash: REFINER_CASH_PER_BBL_DAY * p.plant.processingCapacity } : p)),
  refiner('Marshaven_Refining', 'US_Gulf_Coast', 3, 10_000),
  producer('Tarvale_Sands', 'Western_Canada', 'HEAVY_SOUR', 5_000, 30),
  producer('Campeche_Energia', 'Mexico_Gulf', 'HEAVY_SOUR', 4_000, 20),
  refiner('Veracruz_Refining', 'Mexico_Gulf', 1, 5_000),
  producer('Orinoco_Heavy', 'Venezuela_Orinoco', 'HEAVY_SOUR', 3_000, 18),
  producer('Andes_Crudo', 'Colombia_Andean', 'MEDIUM', 2_500, 25),
  producer('Demerara_Offshore', 'Guyana_Suriname', 'LIGHT_SWEET', 4_000, 28),
  producer('Atlantica_Presalt', 'Brazil_Presalt', 'MEDIUM', 7_000, 26),
  refiner('Ilhavera_Refining', 'Brazil_Presalt', 2, 6_000),
  producer('Patagonia_Shale', 'Argentina_Vaca_Muerta', 'LIGHT_SWEET', 2_500, 30),
  refiner('Levant_Refining', 'Southern_Europe', 2, 7_000),
  producer('Volga_Export', 'Russia_West', 'MEDIUM', 9_000, 15),
  refiner('Baltic_Refining', 'Russia_West', 2, 8_000),
  producer('Amur_Pacific', 'Russia_Far_East', 'MEDIUM', 3_000, 22),
  producer('Steppe_Caspian', 'Caspian', 'LIGHT_SWEET', 4_000, 18),
  producer('Sahara_Light', 'North_Africa', 'LIGHT_SWEET', 3_500, 16),
  producer('Guinea_Deepwater', 'West_Africa', 'LIGHT_SWEET', 6_000, 27),
  producer('Dhofar_Oil', 'Gulf_of_Oman', 'MEDIUM', 2_500, 14),
  producer('Borneo_Petro', 'Southeast_Asia', 'LIGHT_SWEET', 2_000, 24),
  refiner('Seralang_Refining', 'Southeast_Asia', 2, 7_000),
  refiner('Huanghai_Petrochem', 'Coastal_Asia', 2, 11_000),
  refiner('Malabar_Refining', 'South_Asia', 3, 9_000),
  refiner('Rannvar_Refining', 'South_Asia', 3, 8_000),
];
