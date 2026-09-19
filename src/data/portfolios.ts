// Starting companies (spec §10). Plain data: world.ts builds the companies from it.
//
// The core portfolio (§10.1) drives Phases 1–6 and the engine tests: eight companies with a
// deliberate 28% surplus of production over refining, because it exists to exercise the engine,
// not to model a realistic market. The global portfolio (§10.2) arrives in Phase 7.

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
  /** Starting stock: half the tanks, of a grade the plant refines (see the note below). */
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
