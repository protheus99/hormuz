// The transport network (spec §3.5): maritime waypoints, and the lanes and pipelines joining them
// to each other and to the regions. Every lane is bidirectional, and a pipeline's capacity is one
// budget shared by both directions. Numbers are placeholders for Phase 7.

import { EdgeMode } from '../engine/enums';
import type { ChokepointName } from './chokepoints';
import type { RegionName } from './regions';

export const WAYPOINTS = [
  'W_GULF_MEXICO', 'W_CARIBBEAN', 'W_N_ATLANTIC', 'W_S_ATLANTIC', 'W_CAPE', 'W_MEDITERRANEAN', 'W_BLACK_SEA',
  'W_BALTIC', 'W_PERSIAN_GULF', 'W_ARABIAN_SEA', 'W_RED_SEA', 'W_INDIAN_OCEAN', 'W_S_CHINA_SEA', 'W_N_PACIFIC',
] as const;
export type WaypointName = (typeof WAYPOINTS)[number];

/** Anything a lane can join: a region (where cargo starts and ends) or a waypoint at sea. */
export type PlaceName = RegionName | WaypointName;

export interface LaneData {
  /** Stable identifier, used in routes, saves and metrics. */
  readonly id: string;
  readonly a: PlaceName;
  readonly b: PlaceName;
  readonly mode: EdgeMode;
  /** Ticks to cross. */
  readonly transit: number;
  /** $/bbl. */
  readonly freight: number;
  readonly chokepoint?: ChokepointName;
  /** bbl per tick, pipelines only; shared by both directions. Absent means unlimited. */
  readonly capacity?: number;
}

const { SEA, PIPELINE } = EdgeMode;

/** The default terminal edge joining a region to its waypoint: 1 tick, $0.30/bbl. */
const terminal = (a: RegionName, b: WaypointName, transit = 1, freight = 0.30): LaneData =>
  ({ id: `${a}-${b}`, a, b, mode: SEA, transit, freight });

export const LANES: readonly LaneData[] = [
  // Region connections
  { id: 'permian_pipeline', a: 'US_Permian', b: 'US_Gulf_Coast', mode: PIPELINE, transit: 2, freight: 1.00 },
  terminal('US_Gulf_Coast', 'W_GULF_MEXICO'),
  terminal('Mexico_Gulf', 'W_GULF_MEXICO'),
  { id: 'canada_south', a: 'Western_Canada', b: 'US_Permian', mode: PIPELINE, transit: 4, freight: 2.50, capacity: 4_000 },
  { id: 'canada_west', a: 'Western_Canada', b: 'W_N_PACIFIC', mode: PIPELINE, transit: 3, freight: 2.00, capacity: 3_000 },
  terminal('Venezuela_Orinoco', 'W_CARIBBEAN'),
  terminal('Colombia_Andean', 'W_CARIBBEAN'),
  terminal('Guyana_Suriname', 'W_CARIBBEAN'),
  terminal('Brazil_Presalt', 'W_S_ATLANTIC'),
  terminal('West_Africa', 'W_S_ATLANTIC'),
  terminal('Argentina_Vaca_Muerta', 'W_S_ATLANTIC', 2, 0.80),
  terminal('North_Sea', 'W_N_ATLANTIC'),
  terminal('Southern_Europe', 'W_MEDITERRANEAN'),
  terminal('North_Africa', 'W_MEDITERRANEAN'),
  terminal('Russia_West', 'W_BALTIC'),
  terminal('Russia_West', 'W_BLACK_SEA'),
  { id: 'russia_east', a: 'Russia_West', b: 'Russia_Far_East', mode: PIPELINE, transit: 8, freight: 3.00, capacity: 3_000 },
  terminal('Russia_Far_East', 'W_N_PACIFIC'),
  { id: 'caspian_black_sea', a: 'Caspian', b: 'W_BLACK_SEA', mode: PIPELINE, transit: 3, freight: 1.50, capacity: 3_000 },
  { id: 'caspian_mediterranean', a: 'Caspian', b: 'W_MEDITERRANEAN', mode: PIPELINE, transit: 4, freight: 2.00, capacity: 2_000 },
  terminal('Middle_East', 'W_PERSIAN_GULF'),
  { id: 'bypass_red_sea', a: 'Middle_East', b: 'Red_Sea_Coast', mode: PIPELINE, transit: 3, freight: 1.00, capacity: 6_000 },
  { id: 'bypass_oman', a: 'Middle_East', b: 'Gulf_of_Oman', mode: PIPELINE, transit: 2, freight: 0.80, capacity: 3_000 },
  terminal('Red_Sea_Coast', 'W_RED_SEA'),
  terminal('Gulf_of_Oman', 'W_ARABIAN_SEA'),
  terminal('South_Asia', 'W_ARABIAN_SEA'),
  terminal('Southeast_Asia', 'W_S_CHINA_SEA'),
  terminal('Coastal_Asia', 'W_S_CHINA_SEA', 3),
  terminal('Coastal_Asia', 'W_N_PACIFIC', 2),

  // Sea lanes
  { id: 'hormuz', a: 'W_PERSIAN_GULF', b: 'W_ARABIAN_SEA', mode: SEA, transit: 2, freight: 0.40, chokepoint: 'HORMUZ' },
  { id: 'bab_el_mandeb', a: 'W_ARABIAN_SEA', b: 'W_RED_SEA', mode: SEA, transit: 4, freight: 0.80, chokepoint: 'BAB_EL_MANDEB' },
  { id: 'suez', a: 'W_RED_SEA', b: 'W_MEDITERRANEAN', mode: SEA, transit: 3, freight: 1.20, chokepoint: 'SUEZ' },
  { id: 'arabian_indian', a: 'W_ARABIAN_SEA', b: 'W_INDIAN_OCEAN', mode: SEA, transit: 4, freight: 0.60 },
  { id: 'malacca', a: 'W_INDIAN_OCEAN', b: 'W_S_CHINA_SEA', mode: SEA, transit: 6, freight: 0.90, chokepoint: 'MALACCA' },
  { id: 'lombok', a: 'W_INDIAN_OCEAN', b: 'W_S_CHINA_SEA', mode: SEA, transit: 9, freight: 1.20 },
  { id: 'indian_cape', a: 'W_INDIAN_OCEAN', b: 'W_CAPE', mode: SEA, transit: 10, freight: 1.20 },
  { id: 'cape_s_atlantic', a: 'W_CAPE', b: 'W_S_ATLANTIC', mode: SEA, transit: 8, freight: 1.00 },
  { id: 's_n_atlantic', a: 'W_S_ATLANTIC', b: 'W_N_ATLANTIC', mode: SEA, transit: 9, freight: 1.00 },
  { id: 's_atlantic_caribbean', a: 'W_S_ATLANTIC', b: 'W_CARIBBEAN', mode: SEA, transit: 7, freight: 0.90 },
  { id: 'n_atlantic_caribbean', a: 'W_N_ATLANTIC', b: 'W_CARIBBEAN', mode: SEA, transit: 7, freight: 0.90 },
  { id: 'caribbean_gulf', a: 'W_CARIBBEAN', b: 'W_GULF_MEXICO', mode: SEA, transit: 3, freight: 0.40 },
  { id: 'panama', a: 'W_CARIBBEAN', b: 'W_N_PACIFIC', mode: SEA, transit: 20, freight: 4.50, chokepoint: 'PANAMA' },
  { id: 'gibraltar', a: 'W_N_ATLANTIC', b: 'W_MEDITERRANEAN', mode: SEA, transit: 5, freight: 0.60 },
  { id: 'danish_straits', a: 'W_N_ATLANTIC', b: 'W_BALTIC', mode: SEA, transit: 4, freight: 0.50, chokepoint: 'DANISH_STRAITS' },
  { id: 'bosphorus', a: 'W_MEDITERRANEAN', b: 'W_BLACK_SEA', mode: SEA, transit: 3, freight: 0.60, chokepoint: 'BOSPHORUS' },
  { id: 's_china_n_pacific', a: 'W_S_CHINA_SEA', b: 'W_N_PACIFIC', mode: SEA, transit: 4, freight: 0.50 },
];
