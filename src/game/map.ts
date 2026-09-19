// The map the interface draws (spec G10): regions, sea routes, pipelines and straits, projected
// once into SVG coordinates. The interface may not import data/, so everything it needs to draw the
// world comes from here; live status (strait levels, the player's cargo) comes with the PlayerView.

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { CHOKEPOINT_POSITIONS, INLAND_WATER, LAND, REGION_POSITIONS, WAYPOINT_POSITIONS, type LonLat } from '../data/geo';
import { LANES, type PlaceName, type WaypointName } from '../data/lanes';
import { REGIONS, type RegionName } from '../data/regions';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 460;
const LON_WEST = -170;
const LON_SPAN = 355;
const LAT_NORTH = 78;
const LAT_SPAN = 130;

export type Point = readonly [number, number];

export interface MapRegion {
  readonly id: RegionName;
  readonly name: string;
  readonly at: Point;
  readonly produces: boolean;
  readonly refines: boolean;
}

export interface MapLane {
  readonly id: string;
  readonly pipeline: boolean;
  readonly capacity: number | null;
  readonly chokepoint: ChokepointName | null;
  /** One polyline, or two when the lane crosses the map's edge in the Pacific. */
  readonly segments: readonly (readonly Point[])[];
}

export interface MapLayout {
  readonly width: number;
  readonly height: number;
  /** SVG path data for land, and for inland seas drawn over it. */
  readonly land: string;
  readonly water: string;
  readonly regions: readonly MapRegion[];
  readonly lanes: readonly MapLane[];
  readonly chokepoints: readonly { readonly id: ChokepointName; readonly name: string; readonly at: Point }[];
}

function project([lon, lat]: LonLat): Point {
  const x = ((lon - LON_WEST) / LON_SPAN) * MAP_WIDTH;
  const y = ((LAT_NORTH - lat) / LAT_SPAN) * MAP_HEIGHT;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

const ring = (points: readonly LonLat[]) => `M${points.map((p) => project(p).join(',')).join('L')}Z`;

function position(place: PlaceName): LonLat {
  return place in REGION_POSITIONS ? REGION_POSITIONS[place as RegionName] : WAYPOINT_POSITIONS[place as WaypointName];
}

/** A route through lon/lat points, split where it crosses the Pacific edge the short way. */
function segments(points: readonly LonLat[]): Point[][] {
  const out: LonLat[][] = [[points[0] as LonLat]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1] as LonLat;
    const next = points[i] as LonLat;
    const current = out[out.length - 1] as LonLat[];
    const d = next[0] - prev[0];
    if (Math.abs(d) <= 180) {
      current.push(next);
      continue;
    }
    const shift = d > 0 ? -360 : 360;
    current.push([next[0] + shift, next[1]]);
    out.push([[prev[0] - shift, prev[1]], next]);
  }
  return out.map((s) => s.map(project));
}

let layout: MapLayout | null = null;

/** The map, built once. */
export function mapLayout(): MapLayout {
  if (layout) return layout;
  const regions = (Object.keys(REGIONS) as RegionName[]).map((id) => {
    const roles = REGIONS[id].roles as readonly string[];
    return { id, name: REGIONS[id].displayName, at: project(REGION_POSITIONS[id]), produces: roles.includes('PRODUCTION'), refines: roles.includes('REFINING') };
  });
  const lanes = LANES.map((l) => {
    const via = l.chokepoint ? [CHOKEPOINT_POSITIONS[l.chokepoint]] : [];
    return {
      id: l.id, pipeline: l.mode === 'PIPELINE', capacity: l.capacity ?? null, chokepoint: l.chokepoint ?? null,
      segments: segments([position(l.a), ...via, position(l.b)]),
    };
  });
  const chokepoints = (Object.keys(CHOKEPOINTS) as ChokepointName[]).map((id) => ({ id, name: CHOKEPOINTS[id].displayName, at: project(CHOKEPOINT_POSITIONS[id]) }));
  layout = { width: MAP_WIDTH, height: MAP_HEIGHT, land: LAND.map(ring).join(''), water: INLAND_WATER.map(ring).join(''), regions, lanes, chokepoints };
  return layout;
}

/** Display names for regions, for the new-game screen and any text. */
export function regionName(id: string): string {
  return (REGIONS as Readonly<Record<string, { displayName: string }>>)[id]?.displayName ?? id;
}
