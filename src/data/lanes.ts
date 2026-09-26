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
  /**
   * bbl per tick a chokepoint lane carries when OPEN, shared by both directions; its status scales
   * it down (CHOKEPOINT_THROUGHPUT). Sized at 3–4 times a typical day's traffic, so an open strait
   * binds only on the busiest days, spreading them out, while TENSION and DELAYED really bite.
   */
  readonly throughput?: number;
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
  { id: 'canada_south', a: 'Western_Canada', b: 'US_Permian', mode: PIPELINE, transit: 4, freight: 2.50, capacity: 80_000 },
  { id: 'canada_west', a: 'Western_Canada', b: 'W_N_PACIFIC', mode: PIPELINE, transit: 3, freight: 2.00, capacity: 60_000 },
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
  { id: 'russia_east', a: 'Russia_West', b: 'Russia_Far_East', mode: PIPELINE, transit: 8, freight: 3.00, capacity: 60_000 },
  terminal('Russia_Far_East', 'W_N_PACIFIC'),
  { id: 'caspian_black_sea', a: 'Caspian', b: 'W_BLACK_SEA', mode: PIPELINE, transit: 3, freight: 1.50, capacity: 60_000 },
  { id: 'caspian_mediterranean', a: 'Caspian', b: 'W_MEDITERRANEAN', mode: PIPELINE, transit: 4, freight: 2.00, capacity: 40_000 },
  terminal('Middle_East', 'W_PERSIAN_GULF'),
  { id: 'bypass_red_sea', a: 'Middle_East', b: 'Red_Sea_Coast', mode: PIPELINE, transit: 3, freight: 1.00, capacity: 120_000 },
  { id: 'bypass_oman', a: 'Middle_East', b: 'Gulf_of_Oman', mode: PIPELINE, transit: 2, freight: 0.80, capacity: 60_000 },
  terminal('Red_Sea_Coast', 'W_RED_SEA'),
  terminal('Gulf_of_Oman', 'W_ARABIAN_SEA'),
  terminal('South_Asia', 'W_ARABIAN_SEA'),
  terminal('Southeast_Asia', 'W_S_CHINA_SEA'),
  terminal('Coastal_Asia', 'W_S_CHINA_SEA', 3),
  terminal('Coastal_Asia', 'W_N_PACIFIC', 2),

  // Sea lanes
  { id: 'hormuz', a: 'W_PERSIAN_GULF', b: 'W_ARABIAN_SEA', mode: SEA, transit: 2, freight: 0.40, chokepoint: 'HORMUZ', throughput: 600_000 },
  { id: 'bab_el_mandeb', a: 'W_ARABIAN_SEA', b: 'W_RED_SEA', mode: SEA, transit: 4, freight: 0.80, chokepoint: 'BAB_EL_MANDEB', throughput: 400_000 },
  { id: 'suez', a: 'W_RED_SEA', b: 'W_MEDITERRANEAN', mode: SEA, transit: 3, freight: 1.20, chokepoint: 'SUEZ', throughput: 400_000 },
  { id: 'arabian_indian', a: 'W_ARABIAN_SEA', b: 'W_INDIAN_OCEAN', mode: SEA, transit: 4, freight: 0.60 },
  { id: 'malacca', a: 'W_INDIAN_OCEAN', b: 'W_S_CHINA_SEA', mode: SEA, transit: 6, freight: 0.90, chokepoint: 'MALACCA', throughput: 800_000 },
  { id: 'lombok', a: 'W_INDIAN_OCEAN', b: 'W_S_CHINA_SEA', mode: SEA, transit: 9, freight: 1.20 },
  { id: 'indian_cape', a: 'W_INDIAN_OCEAN', b: 'W_CAPE', mode: SEA, transit: 10, freight: 1.20 },
  // Every rounding of Africa crosses this: W_CAPE joins nothing but the Indian Ocean and the
  // South Atlantic, so one chokepoint on this side catches them all.
  { id: 'cape_s_atlantic', a: 'W_CAPE', b: 'W_S_ATLANTIC', mode: SEA, transit: 8, freight: 1.00, chokepoint: 'CAPE_OF_GOOD_HOPE', throughput: 600_000 },
  { id: 's_n_atlantic', a: 'W_S_ATLANTIC', b: 'W_N_ATLANTIC', mode: SEA, transit: 9, freight: 1.00 },
  { id: 's_atlantic_caribbean', a: 'W_S_ATLANTIC', b: 'W_CARIBBEAN', mode: SEA, transit: 7, freight: 0.90 },
  { id: 'n_atlantic_caribbean', a: 'W_N_ATLANTIC', b: 'W_CARIBBEAN', mode: SEA, transit: 7, freight: 0.90 },
  // The Gulf's main way out, by the Yucatán Channel. Sized well above the traffic so an open Gulf
  // never binds, and congested rather than sealed by weather (see chokepoints.ts).
  { id: 'caribbean_gulf', a: 'W_CARIBBEAN', b: 'W_GULF_MEXICO', mode: SEA, transit: 3, freight: 0.40, chokepoint: 'GULF_OF_MEXICO', throughput: 800_000 },
  // The Gulf's other way out, by the Straits of Florida, which the model had left out. Without it
  // the Gulf had a single sea exit, so closing one chokepoint stranded Houston and Campeche - which
  // §14.6 forbids, and the invariant test caught the moment a chokepoint went on the Yucatán lane.
  // Priced a little above the Caribbean route so nothing reroutes in fair weather: it exists to be
  // there when the other way is shut, which is what the second exit is for in life too.
  { id: 'florida_straits', a: 'W_GULF_MEXICO', b: 'W_N_ATLANTIC', mode: SEA, transit: 11, freight: 1.50 },
  { id: 'panama', a: 'W_CARIBBEAN', b: 'W_N_PACIFIC', mode: SEA, transit: 20, freight: 4.50, chokepoint: 'PANAMA', throughput: 200_000 },
  // The western way between the Atlantic and the Pacific. Not the only other way - a cargo shut out
  // of the canal can always go east instead, round the Cape of Good Hope and through Malacca, and
  // that route has been there all along. This one is the short way west for anything already in the
  // southern cone, and the overflow when the canal is full.
  //
  // Priced so the canal normally wins and this is the fallback, which is what a bypass is. Routing
  // costs freight + CARRY_RATE x transit, so at $2.50 the Horn came to $5.70 against the canal's
  // $6.50 and took half the traffic between the oceans - measured 2026-09-26, and not what a bypass
  // is for. At $3.80 it is $7.00: dearer overall than the canal, but cheaper in freight alone, so a
  // cargo that values time pays the canal's toll and one that does not goes the long way. That is
  // the trade the canal has sold since 1914.
  //
  // Measured at this price: **no** region pair, of 462, takes Cape Horn as its cheapest route, so the
  // lane never bends ordinary trade. What crosses it is what the canal could not take that day.
  { id: 'cape_horn', a: 'W_S_ATLANTIC', b: 'W_N_PACIFIC', mode: SEA, transit: 32, freight: 3.80, chokepoint: 'CAPE_HORN', throughput: 500_000 },
  { id: 'gibraltar', a: 'W_N_ATLANTIC', b: 'W_MEDITERRANEAN', mode: SEA, transit: 5, freight: 0.60 },
  { id: 'danish_straits', a: 'W_N_ATLANTIC', b: 'W_BALTIC', mode: SEA, transit: 4, freight: 0.50, chokepoint: 'DANISH_STRAITS', throughput: 300_000 },
  { id: 'bosphorus', a: 'W_MEDITERRANEAN', b: 'W_BLACK_SEA', mode: SEA, transit: 3, freight: 0.60, chokepoint: 'BOSPHORUS', throughput: 300_000 },
  { id: 's_china_n_pacific', a: 'W_S_CHINA_SEA', b: 'W_N_PACIFIC', mode: SEA, transit: 4, freight: 0.50 },
];
