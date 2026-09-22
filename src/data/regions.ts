// The 22 regions of the world map (spec §3.4).
//
// REGIONS is the single source of truth: the RegionName type is derived from its keys, so
// a misspelled region anywhere in the code is a compile error (spec §4.1).
//
// `as const satisfies Record<string, RegionData>` does two jobs at once:
//   - `as const` keeps every key and value as its exact literal, so RegionName is the union
//     'US_Permian' | 'US_Gulf_Coast' | ... rather than just string;
//   - `satisfies` checks every entry has the RegionData shape, without widening those literals.
// Plain `: Record<string, RegionData>` would check the shape but lose the literal keys.

import { DeclineClass, Grade, RegionRole } from '../engine/enums';

/** The seven continental groups the regions are listed under (spec §3.4). */
export const CONTINENTS = [
  'North America',
  'Central & South America',
  'Europe',
  'Russia & Caspian',
  'Africa',
  'Middle East',
  'Asia-Pacific',
] as const;
export type Continent = (typeof CONTINENTS)[number];

export interface RegionData {
  /** Shown to the player; engine IDs stay internal (spec G10). */
  readonly displayName: string;
  readonly continent: Continent;
  readonly coverage: string;
  readonly roles: readonly RegionRole[];
  /** Grades a producer may extract here. Empty unless the region has the PRODUCTION role. */
  readonly exploitableGrades: readonly Grade[];
  readonly laborCostIndex: number;
  /** $/bbl, paid by sellers leaving and buyers arriving (spec §3.3). */
  readonly infrastructureTariff: number;
  readonly declineClass: DeclineClass;
  /** Who may take ground here (§12A.4). Regions with no production role are never leased. */
  readonly leasing: LeasingClass;
}

/**
 * Open ground anyone may bid for; licensed ground that wants a licence first; and national ground
 * the state company holds, where no lease ever comes up. This is why nobody can buy into the Gulf,
 * which is what keeps §10.3's constraint — Gulf production above local refining — true by rule.
 */
export const LeasingClass = { OPEN: 'OPEN', LICENSED: 'LICENSED', NATIONAL: 'NATIONAL' } as const;
export type LeasingClass = (typeof LeasingClass)[keyof typeof LeasingClass];

const { PRODUCTION, REFINING, TERMINAL } = RegionRole;
const { LIGHT_SWEET, MEDIUM, HEAVY_SOUR } = Grade;
const { SHALE, CONVENTIONAL } = DeclineClass;
const { OPEN, LICENSED, NATIONAL } = LeasingClass;

export const REGIONS = {
  // North America
  US_Permian: {
    displayName: 'Permian Basin', continent: 'North America', coverage: 'Permian Basin and US mid-continent',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET], laborCostIndex: 1.15, infrastructureTariff: 0.50, declineClass: SHALE, leasing: OPEN
  },
  US_Gulf_Coast: {
    displayName: 'US Gulf Coast', continent: 'North America', coverage: 'US Gulf offshore and Gulf Coast refining',
    roles: [PRODUCTION, REFINING], exploitableGrades: [MEDIUM, HEAVY_SOUR], laborCostIndex: 1.20, infrastructureTariff: 0.60, declineClass: CONVENTIONAL, leasing: OPEN
  },
  Western_Canada: {
    displayName: 'Alberta Oil Sands', continent: 'North America', coverage: 'Alberta oil sands',
    roles: [PRODUCTION], exploitableGrades: [HEAVY_SOUR], laborCostIndex: 1.10, infrastructureTariff: 1.80, declineClass: CONVENTIONAL, leasing: OPEN
  },
  Mexico_Gulf: {
    displayName: 'Bay of Campeche', continent: 'North America', coverage: 'Mexican Gulf of Mexico fields',
    roles: [PRODUCTION, REFINING], exploitableGrades: [HEAVY_SOUR, MEDIUM], laborCostIndex: 0.70, infrastructureTariff: 1.20, declineClass: CONVENTIONAL, leasing: LICENSED
  },

  // Central & South America
  Venezuela_Orinoco: {
    displayName: 'Orinoco Belt', continent: 'Central & South America', coverage: 'Orinoco Belt and Maracaibo',
    roles: [PRODUCTION], exploitableGrades: [HEAVY_SOUR], laborCostIndex: 0.60, infrastructureTariff: 2.00, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
  Colombia_Andean: {
    displayName: 'Andean Basins', continent: 'Central & South America', coverage: 'Colombia and Ecuador',
    roles: [PRODUCTION], exploitableGrades: [HEAVY_SOUR, MEDIUM], laborCostIndex: 0.70, infrastructureTariff: 1.30, declineClass: CONVENTIONAL, leasing: LICENSED
  },
  Guyana_Suriname: {
    displayName: 'Guiana Basin', continent: 'Central & South America', coverage: 'Guyana and Suriname offshore',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.90, infrastructureTariff: 0.80, declineClass: CONVENTIONAL, leasing: OPEN
  },
  Brazil_Presalt: {
    displayName: 'Santos & Campos Basins', continent: 'Central & South America', coverage: 'Santos and Campos basins',
    roles: [PRODUCTION, REFINING], exploitableGrades: [MEDIUM], laborCostIndex: 0.85, infrastructureTariff: 1.10, declineClass: CONVENTIONAL, leasing: LICENSED
  },
  Argentina_Vaca_Muerta: {
    displayName: 'Vaca Muerta', continent: 'Central & South America', coverage: 'Neuquén shale',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET], laborCostIndex: 0.80, infrastructureTariff: 1.50, declineClass: SHALE, leasing: OPEN
  },

  // Europe
  North_Sea: {
    displayName: 'North Sea', continent: 'Europe', coverage: 'UK and Norwegian shelf, NW European refining',
    roles: [PRODUCTION, REFINING], exploitableGrades: [MEDIUM, LIGHT_SWEET], laborCostIndex: 1.40, infrastructureTariff: 2.50, declineClass: CONVENTIONAL, leasing: OPEN
  },
  Southern_Europe: {
    displayName: 'Mediterranean Coast', continent: 'Europe', coverage: 'Mediterranean refining coast',
    roles: [REFINING], exploitableGrades: [], laborCostIndex: 1.10, infrastructureTariff: 1.50, declineClass: CONVENTIONAL, leasing: NATIONAL
  },

  // Russia & Caspian
  Russia_West: {
    displayName: 'Volga-Urals', continent: 'Russia & Caspian', coverage: 'Volga-Urals and West Siberia, Baltic and Black Sea export',
    roles: [PRODUCTION, REFINING], exploitableGrades: [MEDIUM], laborCostIndex: 0.65, infrastructureTariff: 1.00, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
  Russia_Far_East: {
    displayName: 'Sakhalin & East Siberia', continent: 'Russia & Caspian', coverage: 'East Siberia and Sakhalin, Pacific export',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.75, infrastructureTariff: 1.00, declineClass: CONVENTIONAL, leasing: LICENSED
  },
  Caspian: {
    displayName: 'Caspian Basin', continent: 'Russia & Caspian', coverage: 'Kazakhstan and Azerbaijan',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.70, infrastructureTariff: 1.20, declineClass: CONVENTIONAL, leasing: LICENSED
  },

  // Africa (outside the Middle East)
  North_Africa: {
    displayName: 'North Africa', continent: 'Africa', coverage: 'Libya, Algeria and Egypt',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.65, infrastructureTariff: 0.90, declineClass: CONVENTIONAL, leasing: LICENSED
  },
  West_Africa: {
    displayName: 'Gulf of Guinea', continent: 'Africa', coverage: 'Nigeria, Angola and the Gulf of Guinea',
    roles: [PRODUCTION], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.85, infrastructureTariff: 1.40, declineClass: CONVENTIONAL, leasing: LICENSED
  },

  // Middle East
  Middle_East: {
    displayName: 'Persian Gulf', continent: 'Middle East', coverage: 'Persian Gulf producers inside the Strait of Hormuz',
    roles: [PRODUCTION, REFINING], exploitableGrades: [LIGHT_SWEET, MEDIUM, HEAVY_SOUR], laborCostIndex: 0.75, infrastructureTariff: 0.20, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
  Red_Sea_Coast: {
    displayName: 'Red Sea Coast', continent: 'Middle East', coverage: 'West Arabian export terminals (end of the East-West bypass pipeline)',
    roles: [TERMINAL], exploitableGrades: [], laborCostIndex: 0.75, infrastructureTariff: 0.30, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
  Gulf_of_Oman: {
    displayName: 'Gulf of Oman', continent: 'Middle East', coverage: 'Oman and Fujairah, outside the Strait',
    roles: [PRODUCTION, TERMINAL], exploitableGrades: [MEDIUM, HEAVY_SOUR], laborCostIndex: 0.80, infrastructureTariff: 0.30, declineClass: CONVENTIONAL, leasing: LICENSED
  },

  // Asia-Pacific
  Southeast_Asia: {
    displayName: 'Southeast Asia', continent: 'Asia-Pacific', coverage: 'Malaysia, Indonesia and Brunei',
    roles: [PRODUCTION, REFINING], exploitableGrades: [LIGHT_SWEET, MEDIUM], laborCostIndex: 0.70, infrastructureTariff: 0.90, declineClass: CONVENTIONAL, leasing: OPEN
  },
  Coastal_Asia: {
    displayName: 'East Asian Coast', continent: 'Asia-Pacific', coverage: 'China, Japan and Korea coastal refining',
    roles: [REFINING], exploitableGrades: [], laborCostIndex: 0.80, infrastructureTariff: 1.00, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
  South_Asia: {
    displayName: 'Indian West Coast', continent: 'Asia-Pacific', coverage: 'Indian west coast refining',
    roles: [REFINING], exploitableGrades: [], laborCostIndex: 0.55, infrastructureTariff: 1.20, declineClass: CONVENTIONAL, leasing: NATIONAL
  },
} as const satisfies Record<string, RegionData>;

/** Any one of the 22 region IDs. 'US_Permain' does not compile. */
export type RegionName = keyof typeof REGIONS;

/** Every region ID, in the order listed above. */
export const REGION_NAMES = Object.keys(REGIONS) as RegionName[];
