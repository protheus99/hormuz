// The three exchange nodes, one per grade (spec §3.3).

import { Grade } from '../engine/enums';
import type { RegionName } from './regions';

export interface NodeData {
  readonly grade: Grade;
  /** Fills are converted to a price in this region to publish the marker (spec §3.3). */
  readonly markerRegion: RegionName;
  readonly startingMarker: number;
}

export const NODES = {
  NYMEX: { grade: Grade.LIGHT_SWEET, markerRegion: 'US_Permian', startingMarker: 75.0 },
  NC: { grade: Grade.MEDIUM, markerRegion: 'North_Sea', startingMarker: 70.0 },
  DME: { grade: Grade.HEAVY_SOUR, markerRegion: 'Middle_East', startingMarker: 62.0 },
} as const satisfies Record<string, NodeData>;

export type NodeName = keyof typeof NODES;
export const NODE_NAMES = Object.keys(NODES) as NodeName[];

// Record<Grade, NodeName> requires an entry for every grade: leaving one out is a compile error.
export const NODE_FOR_GRADE: Readonly<Record<Grade, NodeName>> = {
  LIGHT_SWEET: 'NYMEX',
  MEDIUM: 'NC',
  HEAVY_SOUR: 'DME',
};
