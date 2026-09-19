// The lane graph: routing crude across the world's sea lanes and pipelines (spec §3.5, §4.12).
//
// The graph is plain data — edges, chokepoint statuses and today's pipeline use — so it saves and
// forks with the world. Routing is Dijkstra's shortest-path algorithm over generalized cost:
//
//   cost of an edge = freight + chokepoint surcharge + CARRY_RATE × (transit + chokepoint delay)
//
// Routing is capacity-aware (Phase 4 acceptance): a pipeline with no room left today for the
// shipping company is skipped, so once the Oman bypass fills, the next route offered is the Red
// Sea bypass. Clearing asks again whenever a route runs out (clearing.ts).

import { CHOKEPOINT_NAMES } from '../data/chokepoints';
import { LANES, type PlaceName } from '../data/lanes';
import { REGIONS } from '../data/regions';
import type { Config } from './config';
import { ChokepointStatus, EdgeMode } from './enums';
import { MinHeap } from './heap';
import { asEdgeId, type AgentId, type ChokepointName, type EdgeId, type RegionName, type Route } from './model';
import type { RouteProvider } from './routes';

export interface ChokepointState {
  status: ChokepointStatus;
  /** Extra ticks to cross while DELAYED. */
  delayTicks: number;
  /** Extra $/bbl (war-risk insurance) while TENSION or DELAYED. */
  freightSurcharge: number;
}

export interface Edge {
  readonly id: EdgeId;
  readonly a: PlaceName;
  readonly b: PlaceName;
  readonly mode: EdgeMode;
  readonly transit: number;
  readonly freight: number;
  readonly chokepoint: ChokepointName | null;
  /** bbl per tick, shared by both directions; null means unlimited. */
  readonly capacity: number | null;
  /** Barrels each company has shipped along this edge today. Reset every tick. */
  usedBy: Partial<Record<AgentId, number>>;
  /** bbl per tick held for one company, usable only by it (spec §8 rule 5). */
  reserved: Partial<Record<AgentId, number>>;
}

export interface LaneGraph {
  edges: Edge[];
  chokepoints: Record<ChokepointName, ChokepointState>;
  /** CARRY_RATE, fixed when the graph is built: the cost of a tick at sea in route choice. */
  readonly carryRate: number;
}

/** The §3.5 network with every chokepoint open and every pipeline empty. */
export function buildLaneGraph(config: Config): LaneGraph {
  const chokepoints = {} as Record<ChokepointName, ChokepointState>;
  for (const c of CHOKEPOINT_NAMES) chokepoints[c] = { status: ChokepointStatus.OPEN, delayTicks: 0, freightSurcharge: 0 };
  return {
    edges: LANES.map((l) => ({
      id: asEdgeId(l.id), a: l.a, b: l.b, mode: l.mode, transit: l.transit, freight: l.freight,
      chokepoint: l.chokepoint ?? null, capacity: l.capacity ?? null, usedBy: {}, reserved: {},
    })),
    chokepoints,
    carryRate: config.CARRY_RATE,
  };
}

/** Changes a chokepoint's status, as events do (spec G7.1). Takes effect for routes found afterwards. */
export function setChokepoint(g: LaneGraph, name: ChokepointName, status: ChokepointStatus, delayTicks = 0, freightSurcharge = 0): void {
  if (delayTicks < 0 || freightSurcharge < 0) throw new Error(`${name}: delay and surcharge cannot be negative`);
  g.chokepoints[name] = { status, delayTicks, freightSurcharge };
}

/** Clears today's pipeline use (spec §5 phase 0). Reservations persist. */
export function resetPipelineUse(g: LaneGraph): void {
  for (const e of g.edges) e.usedBy = {};
}

/**
 * Holds pipeline space for one company, as reservation cards do (spec G4.4). Refuses more than
 * MAX_RESERVATION_SHARE of the edge (invariant 7).
 */
export function setReservation(g: LaneGraph, edgeId: EdgeId, agentId: AgentId, qty: number, config: Config): void {
  const edge = findEdge(g, edgeId);
  if (edge.capacity === null) throw new Error(`${edgeId} is not a pipeline and cannot be reserved`);
  const limit = config.MAX_RESERVATION_SHARE * edge.capacity;
  if (qty < 0 || qty > limit) throw new Error(`A reservation on ${edgeId} must be between 0 and ${limit} bbl/tick`);
  const others = sum(edge.reserved) - (edge.reserved[agentId] ?? 0);
  if (others + qty > edge.capacity) throw new Error(`${edgeId} has only ${edge.capacity - others} bbl/tick left to reserve`);
  if (qty === 0) delete edge.reserved[agentId];
  else edge.reserved[agentId] = qty;
}

/**
 * Barrels one company can still ship along an edge today. Its own reservation comes first; beyond
 * that it shares the unreserved pool with everyone else's overflow.
 */
export function edgeCapacityLeft(edge: Edge, agentId: AgentId): number {
  if (edge.capacity === null) return Number.POSITIVE_INFINITY;
  const pool = edge.capacity - sum(edge.reserved);
  let poolUsed = 0;
  for (const [id, used] of Object.entries(edge.usedBy) as [AgentId, number][]) {
    poolUsed += Math.max(0, used - (edge.reserved[id] ?? 0));
  }
  const own = edge.reserved[agentId] ?? 0;
  const ownLeft = Math.max(0, own - (edge.usedBy[agentId] ?? 0));
  return ownLeft + Math.max(0, pool - poolUsed);
}

/**
 * The cheapest usable route (spec §3.5), or null if every path is closed, avoided or full.
 * With `agentId`, pipelines that company can no longer use today are skipped. Delivery inside one
 * region has no freight and still takes one tick.
 */
export function findRoute(
  g: LaneGraph,
  origin: RegionName,
  destination: RegionName,
  avoid: readonly ChokepointName[] = [],
  agentId?: AgentId,
): Route | null {
  if (origin === destination) return { edges: [], totalFreight: 0, totalTransit: 1, chokepoints: [] };

  const usable = (e: Edge): boolean => {
    if (e.chokepoint !== null) {
      if (g.chokepoints[e.chokepoint].status === ChokepointStatus.CLOSED || avoid.includes(e.chokepoint)) return false;
    }
    return agentId === undefined || edgeCapacityLeft(e, agentId) > 0;
  };
  const other = (e: Edge, place: PlaceName): PlaceName => (e.a === place ? e.b : e.a);
  const pipelineTo = (from: PlaceName, to: PlaceName): boolean =>
    g.edges.some((e) => e.mode === EdgeMode.PIPELINE && (e.a === from || e.b === from) && other(e, from) === to);

  // Dijkstra over (place, leg) states. Regions are endpoints, not junctions (spec §3.5): a route may
  // pass through a region only straight off a pipeline from its origin ("out") or on its way into
  // a pipeline to its destination ("in"). That keeps the Gulf bypasses and Canada-to-Gulf-Coast
  // crude, and rules out land bridges such as piping North Sea crude across Russia.
  // Strict < when relaxing, and the heap's first-in-first-out ties, make equal-cost choices stable.
  type Leg = 'sea' | 'out' | 'in';
  interface Label { readonly cost: number; readonly place: PlaceName; readonly via: Edge | null; readonly prev: string | null }
  const key = (place: PlaceName, leg: Leg) => `${place}|${leg}`;
  const best = new Map<string, Label>([[key(origin, 'sea'), { cost: 0, place: origin, via: null, prev: null }]]);
  const done = new Set<string>();
  const queue = new MinHeap<string>();
  queue.push(key(origin, 'sea'), 0);
  let found: string | null = null;

  for (let k = queue.pop(); k !== undefined; k = queue.pop()) {
    if (done.has(k)) continue;
    done.add(k);
    const label = best.get(k) as Label;
    const place = label.place;
    if (place === destination) { found = k; break; }
    const leg = k.slice(k.lastIndexOf('|') + 1) as Leg;
    const isTransitRegion = place !== origin && isRegion(place);

    for (const e of g.edges) {
      if (e.a !== place && e.b !== place) continue;
      if (!usable(e)) continue;
      const next = other(e, place);
      // Leaving a region we entered on the way to a destination pipeline: only that pipeline.
      if (isTransitRegion && leg === 'in' && !(e.mode === EdgeMode.PIPELINE && next === destination)) continue;
      let nextLeg: Leg = 'sea';
      if (next !== destination && isRegion(next)) {
        if (place === origin && e.mode === EdgeMode.PIPELINE) nextLeg = 'out';
        else if (pipelineTo(next, destination)) nextLeg = 'in';
        else continue;   // no other way through a region
      }
      const nk = key(next, nextLeg);
      const cost = label.cost + edgeCost(g, e);
      if (cost < (best.get(nk)?.cost ?? Number.POSITIVE_INFINITY)) {
        best.set(nk, { cost, place: next, via: e, prev: k });
        queue.push(nk, cost);
      }
    }
  }

  if (found === null) return null;
  const path: Edge[] = [];
  for (let k: string | null = found; k !== null;) {
    const label: Label = best.get(k) as Label;
    if (label.via) path.unshift(label.via);
    k = label.prev;
  }
  return toRoute(g, path);
}

/** What one edge costs to cross today, in the units routes are compared by. */
function edgeCost(g: LaneGraph, e: Edge): number {
  const { freight, transit } = crossing(g, e);
  return freight + g.carryRate * transit;
}

/** Freight and transit for crossing an edge today, including any chokepoint surcharge and delay. */
function crossing(g: LaneGraph, e: Edge): { freight: number; transit: number } {
  if (e.chokepoint === null) return { freight: e.freight, transit: e.transit };
  const c = g.chokepoints[e.chokepoint];
  const surcharge = c.status === ChokepointStatus.TENSION || c.status === ChokepointStatus.DELAYED ? c.freightSurcharge : 0;
  const delay = c.status === ChokepointStatus.DELAYED ? c.delayTicks : 0;
  return { freight: e.freight + surcharge, transit: e.transit + delay };
}

function toRoute(g: LaneGraph, path: readonly Edge[]): Route {
  let totalFreight = 0;
  let totalTransit = 0;
  const chokepoints: ChokepointName[] = [];
  for (const e of path) {
    const c = crossing(g, e);
    totalFreight += c.freight;
    totalTransit += c.transit;
    if (e.chokepoint !== null) chokepoints.push(e.chokepoint);
  }
  return { edges: path.map((e) => e.id), totalFreight, totalTransit, chokepoints };
}

/**
 * The lane graph behind the RouteProvider interface that clearing and deals use (spec §14.4).
 * Routes are cached per tick; call `resetTick()` in phase 0, after chokepoint changes.
 */
export class LaneRouteProvider implements RouteProvider {
  readonly graph: LaneGraph;
  private readonly cache = new Map<string, Route | null>();

  constructor(graph: LaneGraph) {
    this.graph = graph;
  }

  route(origin: RegionName, destination: RegionName, avoid: readonly ChokepointName[] = [], agentId?: AgentId): Route | null {
    // Capacity-limited answers depend on today's use, so only the plain answer is cached.
    if (agentId !== undefined) {
      const plain = this.route(origin, destination, avoid);
      if (plain === null || this.capacityLeft(plain, agentId) > 0) return plain;
      return findRoute(this.graph, origin, destination, avoid, agentId);
    }
    const key = `${origin}>${destination}|${[...avoid].sort().join(',')}`;
    if (!this.cache.has(key)) this.cache.set(key, findRoute(this.graph, origin, destination, avoid));
    return this.cache.get(key) ?? null;
  }

  capacityLeft(route: Route, agentId: AgentId): number {
    let left = Number.POSITIVE_INFINITY;
    for (const id of route.edges) left = Math.min(left, edgeCapacityLeft(findEdge(this.graph, id), agentId));
    return left;
  }

  reserve(route: Route, qty: number, agentId: AgentId): number {
    const granted = Math.max(0, Math.min(qty, this.capacityLeft(route, agentId)));
    for (const id of route.edges) {
      const edge = findEdge(this.graph, id);
      if (edge.capacity !== null) edge.usedBy[agentId] = (edge.usedBy[agentId] ?? 0) + granted;
    }
    return granted;
  }

  /** New tick: empty the pipelines and forget cached routes (spec §5 phase 0). */
  resetTick(): void {
    resetPipelineUse(this.graph);
    this.cache.clear();
  }
}

function isRegion(place: PlaceName): place is RegionName {
  return place in REGIONS;
}

function findEdge(g: LaneGraph, id: EdgeId): Edge {
  const edge = g.edges.find((e) => e.id === id);
  if (edge === undefined) throw new Error(`Unknown edge ${id}`);
  return edge;
}

function sum(values: Partial<Record<string, number>>): number {
  let total = 0;
  for (const v of Object.values(values)) total += v ?? 0;
  return total;
}
