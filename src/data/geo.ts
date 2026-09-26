// Where things are on the map (spec G10), as longitude and latitude in degrees. Positions are
// approximate centres chosen for legibility, not survey data. The land outlines are a low-detail
// placeholder until the build-time Natural Earth coastline SVG replaces them (Phase 10, §14.2);
// they keep the continents recognisable and the straits in the right places.

import type { ChokepointName } from './chokepoints';
import type { WaypointName } from './lanes';
import type { RegionName } from './regions';

export type LonLat = readonly [number, number];

export const REGION_POSITIONS: Readonly<Record<RegionName, LonLat>> = {
  US_Permian: [-103, 33], US_Gulf_Coast: [-93, 30], Western_Canada: [-114, 55], Mexico_Gulf: [-93, 19],
  Venezuela_Orinoco: [-64, 8], Colombia_Andean: [-75, 4], Guyana_Suriname: [-57, 5], Brazil_Presalt: [-43, -23],
  Argentina_Vaca_Muerta: [-69, -38], North_Sea: [2, 57.5], Southern_Europe: [11, 43], Russia_West: [50, 55],
  Russia_Far_East: [140, 52], Caspian: [55, 43], North_Africa: [10, 29], West_Africa: [6, 4],
  Middle_East: [47, 26], Red_Sea_Coast: [40, 21.5], Gulf_of_Oman: [58, 23], Southeast_Asia: [110, 2],
  Coastal_Asia: [120, 31], South_Asia: [78, 19],
};

export const WAYPOINT_POSITIONS: Readonly<Record<WaypointName, LonLat>> = {
  W_GULF_MEXICO: [-89, 25], W_CARIBBEAN: [-72, 15], W_N_ATLANTIC: [-35, 45], W_S_ATLANTIC: [-20, -15],
  W_CAPE: [18, -38], W_MEDITERRANEAN: [18, 35], W_BLACK_SEA: [34, 43.5], W_BALTIC: [19, 56.5],
  W_PERSIAN_GULF: [51.5, 27], W_ARABIAN_SEA: [62, 16], W_RED_SEA: [37.5, 20], W_INDIAN_OCEAN: [80, -5],
  W_S_CHINA_SEA: [113, 12], W_N_PACIFIC: [165, 32],
};

export const CHOKEPOINT_POSITIONS: Readonly<Record<ChokepointName, LonLat>> = {
  HORMUZ: [56.5, 26.5], BAB_EL_MANDEB: [43.4, 12.6], SUEZ: [32.5, 30], MALACCA: [100.5, 3],
  BOSPHORUS: [29, 41.1], DANISH_STRAITS: [11, 56], PANAMA: [-79.7, 9],
  // The three the sea closes rather than a government: the way out of the Gulf, and the two capes.
  GULF_OF_MEXICO: [-84, 23.5], CAPE_OF_GOOD_HOPE: [19, -35.5], CAPE_HORN: [-67, -56],
};

/** Low-detail land outlines, each a closed ring. */
export const LAND: readonly (readonly LonLat[])[] = [
  // North and Central America
  [[-168, 66], [-162, 70], [-140, 70], [-120, 72], [-95, 72], [-80, 73], [-62, 66], [-64, 60], [-56, 52], [-66, 45],
    [-70, 42], [-76, 38], [-81, 31], [-80, 25], [-83, 29], [-90, 30], [-97, 27], [-97, 22], [-95, 18], [-90, 21],
    [-87, 21], [-88, 16], [-83, 10], [-79, 9], [-80, 7], [-85, 11], [-92, 15], [-105, 20], [-110, 24], [-114, 30],
    [-117, 33], [-124, 40], [-124, 48], [-133, 56], [-146, 60], [-155, 58], [-165, 60]],
  // Greenland
  [[-55, 60], [-43, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 78], [-55, 70]],
  // South America
  [[-79, 9], [-77, 8], [-72, 12], [-62, 11], [-52, 5], [-50, 0], [-35, -5], [-39, -13], [-41, -22], [-48, -26],
    [-53, -34], [-58, -38], [-65, -42], [-68, -50], [-70, -55], [-75, -50], [-73, -40], [-71, -30], [-70, -18],
    [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
  // Eurasia, from Iberia east along the south coast and back along the Arctic
  [[-9, 43], [-9, 37], [-5, 36], [3, 42], [8, 44], [12, 42], [16, 38], [18, 40], [14, 45], [19, 42], [23, 37],
    [26, 40], [29, 41], [36, 36], [35, 32], [34, 31], [35, 28], [39, 22], [43, 13], [45, 13], [52, 16], [57, 19],
    [59, 22], [56.5, 26], [54, 24], [51, 24.5], [50, 26], [48, 29], [50, 30], [54, 27], [57, 27], [62, 25],
    [67, 24], [70, 21], [73, 16], [77, 8], [80, 10], [80, 15], [87, 21], [92, 22], [94, 17], [98, 16], [98, 8],
    [100, 4], [103, 1.5], [104, 1.5], [101, 7], [100, 13], [105, 9], [109, 12], [108, 16], [106, 20], [110, 21],
    [117, 23], [120, 26], [122, 30], [121, 37], [118, 38], [122, 40], [125, 39], [129, 35], [129, 42], [135, 43],
    [141, 48], [140, 54], [137, 54], [143, 59], [155, 59], [160, 61], [163, 60], [157, 51], [162, 56], [170, 60],
    [180, 65], [180, 70], [160, 70], [140, 72], [113, 74], [100, 77], [80, 73], [70, 70], [60, 70], [45, 68],
    [40, 66], [33, 70], [28, 71], [18, 70], [12, 66], [5, 62], [6, 58], [8, 58], [11, 59], [12, 56.5], [13, 55.5],
    [16, 56], [17, 58], [19, 60], [17, 61], [18, 63], [22, 66], [25, 65.5], [22, 63], [21, 61], [22, 60.2],
    [25, 60.3], [30, 60], [28, 59.5], [24, 59.4], [23.5, 58], [24, 57.5], [21, 57], [21, 55.5], [19, 54.5],
    [14, 54], [12, 54], [10.5, 55], [10, 57.5], [8.5, 56.5], [8, 54], [4, 52], [2, 51], [-2, 48], [-5, 48],
    [-1, 46], [-2, 44]],
  // Africa
  [[-17, 21], [-16, 28], [-10, 30], [-6, 36], [0, 36], [10, 37], [11, 33], [20, 31], [25, 32], [32, 31], [34, 28],
    [37, 22], [39, 16], [43, 12], [51, 12], [48, 5], [41, -2], [40, -10], [35, -20], [33, -26], [27, -34],
    [19, -35], [16, -28], [12, -17], [13, -6], [9, -1], [9, 4], [4, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
  // Great Britain
  [[-5, 50], [1, 51], [2, 53], [-1, 55], [-2, 58], [-5, 58], [-6, 55], [-3, 54], [-5, 52]],
  // Madagascar
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // Japan
  [[130, 31], [135, 34], [140, 36], [142, 40], [141, 45], [139, 40], [136, 37], [132, 34]],
  // Sumatra, Java, Borneo, the Philippines
  [[95, 5.5], [98, 4], [104, -1], [106, -6], [102, -4], [95, 3]],
  [[105, -6], [114, -8], [106, -7.5]],
  [[109, 1], [111, -3], [116, -4], [119, 1], [117, 7], [113, 3]],
  [[120, 18], [122, 18], [126, 7], [122, 7]],
  // Australia and New Zealand
  [[114, -22], [114, -34], [118, -35], [124, -33], [131, -31], [138, -35], [141, -38], [147, -38], [150, -37],
    [153, -28], [153, -25], [146, -19], [142, -11], [136, -12], [131, -11], [126, -14], [122, -18]],
  [[172, -35], [178, -38], [174, -41], [167, -46], [170, -46]],
];

/** Inland seas drawn over the land. */
export const INLAND_WATER: readonly (readonly LonLat[])[] = [
  // Black Sea
  [[28, 41.5], [28, 44], [30, 46], [33, 46], [36, 45], [38, 47], [40, 44], [41.5, 41.5], [36, 41.5], [31, 41]],
  // Caspian Sea
  [[47, 45], [50, 47], [53, 47], [54, 44], [53, 40], [54, 37], [51, 37], [49, 38], [50, 41], [48, 43]],
];
