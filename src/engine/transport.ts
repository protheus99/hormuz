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
import { CHOKEPOINT_STATUSES, ChokepointStatus, EdgeMode, type RiskSetting } from './enums';
import { MinHeap } from './heap';
import { asEdgeId, type AgentId, type Cargo, type ChokepointName, type EdgeId, type RegionName, type Route } from './model';
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

/**
 * The chokepoints a company's routes avoid today (spec G4.2): Bold avoids none, Balanced those at
 * DELAYED or worse, Safe those at TENSION or worse. Closed chokepoints are never usable anyway.
 */
export function avoidFor(risk: RiskSetting, g: LaneGraph): ChokepointName[] {
  if (risk === 'BOLD') return [];
  const from = CHOKEPOINT_STATUSES.indexOf(risk === 'SAFE' ? ChokepointStatus.TENSION : ChokepointStatus.DELAYED);
  return CHOKEPOINT_NAMES.filter((c) => CHOKEPOINT_STATUSES.indexOf(g.chokepoints[c].status) >= from);
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
  const topo = topologyOf(g);
  const pipelineTo = (from: PlaceName, to: PlaceName): boolean => topo.pipelineNeighbors.get(from)?.has(to) === true;

  // Dijkstra over (place, leg) states. Regions are endpoints, not junctions (spec §3.5): a route may
  // pass through a region only straight off a pipeline from its origin ("out", then on by sea or
  // straight into the destination) or on its way into a pipeline to its destination ("in"). That
  // keeps the Gulf bypasses, Russia's eastern line and Canada-to-Gulf-Coast crude, and rules out
  // land bridges such as piping North Sea crude across Russia or Permian crude up into Canada.
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

    for (const e of topo.adjacency.get(place) ?? []) {
      if (!usable(e)) continue;
      const next = other(e, place);
      // Leaving a region we entered on the way to a destination pipeline: only that pipeline.
      if (isTransitRegion && leg === 'in' && !(e.mode === EdgeMode.PIPELINE && next === destination)) continue;
      // Leaving a region reached off the origin's pipeline: by sea, or by a pipeline straight into
      // the destination — never onward along another pipeline (no Permian crude up the Canadian line).
      if (isTransitRegion && leg === 'out' && e.mode === EdgeMode.PIPELINE && next !== destination) continue;
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

/** What happened to a cargo this tick. */
export type CargoAdvance = 'MOVING' | 'HELD' | 'ARRIVED';

/**
 * Moves one cargo forward by one tick (spec §5 phase 4). A cargo crosses its route edge by edge.
 * Entering an edge whose chokepoint is CLOSED is impossible, so the cargo waits at the entry as
 * HELD until it reopens; a DELAYED chokepoint adds its delay on entry. Status changes on the
 * route never reroute a cargo already at sea: its owner decides that through cards.
 */
export function advanceCargo(c: Cargo, g: LaneGraph): CargoAdvance {
  if (c.status === 'FLOATING') return 'ARRIVED';   // already at its destination, waiting for tank space
  if (c.ticksLeft === 0) {
    const edge = findEdge(g, c.route.edges[c.leg] as EdgeId);
    if (edge.chokepoint !== null && g.chokepoints[edge.chokepoint].status === ChokepointStatus.CLOSED) {
      c.status = 'HELD';
      return 'HELD';
    }
    c.ticksLeft = crossing(g, edge).transit;
    c.status = 'MOVING';
  }
  c.ticksLeft -= 1;
  if (c.ticksLeft > 0) return 'MOVING';
  c.leg += 1;
  if (c.leg >= c.route.edges.length) return 'ARRIVED';
  const next = findEdge(g, c.route.edges[c.leg] as EdgeId);
  if (next.chokepoint !== null && g.chokepoints[next.chokepoint].status === ChokepointStatus.CLOSED) {
    c.status = 'HELD';
    return 'HELD';
  }
  return 'MOVING';
}

/**
 * The lane graph behind the RouteProvider interface that clearing and deals use (spec §14.4).
 * Plain routes depend only on chokepoint states, so they are cached per graph for as long as
 * those states stay the same — across ticks — and recomputed as soon as any chokepoint changes.
 * Routes found for a company are checked against today's pipeline use every time.
 */
export class LaneRouteProvider implements RouteProvider {
  readonly graph: LaneGraph;

  constructor(graph: LaneGraph) {
    this.graph = graph;
  }

  route(origin: RegionName, destination: RegionName, avoid: readonly ChokepointName[] = [], agentId?: AgentId): Route | null {
    if (agentId !== undefined) {
      const plain = this.route(origin, destination, avoid);
      if (plain === null || this.capacityLeft(plain, agentId) > 0) return plain;
      return findRoute(this.graph, origin, destination, avoid, agentId);
    }
    const cache = routeCacheOf(this.graph);
    const key = `${origin}>${destination}|${avoid.length === 0 ? '' : [...avoid].sort().join(',')}`;
    let route = cache.get(key);
    if (route === undefined) {
      route = findRoute(this.graph, origin, destination, avoid);
      cache.set(key, route);
    }
    return route;
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

  /** New tick: empty the pipelines (spec §5 phase 0). */
  resetTick(): void {
    resetPipelineUse(this.graph);
  }
}

// Plain-route caches, one per graph, valid for one set of chokepoint states. Derived data only:
// never saved, and rebuilt after a load.
const routeCaches = new WeakMap<LaneGraph, { signature: string; routes: Map<string, Route | null> }>();

function routeCacheOf(g: LaneGraph): Map<string, Route | null> {
  let signature = '';
  for (const c of CHOKEPOINT_NAMES) {
    const s = g.chokepoints[c];
    signature += `${s.status}:${s.delayTicks}:${s.freightSurcharge};`;
  }
  const cached = routeCaches.get(g);
  if (cached !== undefined && cached.signature === signature) return cached.routes;
  const routes = new Map<string, Route | null>();
  routeCaches.set(g, { signature, routes });
  return routes;
}

const REGION_SET: ReadonlySet<PlaceName> = new Set(Object.keys(REGIONS) as PlaceName[]);

function isRegion(place: PlaceName): place is RegionName {
  return REGION_SET.has(place);
}

function other(e: Edge, place: PlaceName): PlaceName {
  return e.a === place ? e.b : e.a;
}

/** Which edges touch each place, and which places each place reaches by pipeline. */
interface Topology {
  readonly adjacency: ReadonlyMap<PlaceName, readonly Edge[]>;
  readonly pipelineNeighbors: ReadonlyMap<PlaceName, ReadonlySet<PlaceName>>;
}

// Derived once per edge list and never saved: the graph's shape never changes during a game,
// only its statuses and pipeline use, which live on the same Edge objects the lists hold.
const topologies = new WeakMap<readonly Edge[], Topology>();

function topologyOf(g: LaneGraph): Topology {
  const cached = topologies.get(g.edges);
  if (cached !== undefined) return cached;
  const adjacency = new Map<PlaceName, Edge[]>();
  const pipelineNeighbors = new Map<PlaceName, Set<PlaceName>>();
  for (const e of g.edges) {
    for (const end of [e.a, e.b]) {
      const list = adjacency.get(end) ?? [];
      list.push(e);
      adjacency.set(end, list);
      if (e.mode === EdgeMode.PIPELINE) {
        const set = pipelineNeighbors.get(end) ?? new Set<PlaceName>();
        set.add(other(e, end));
        pipelineNeighbors.set(end, set);
      }
    }
  }
  const topo = { adjacency, pipelineNeighbors };
  topologies.set(g.edges, topo);
  return topo;
}

const edgeIndexes = new WeakMap<readonly Edge[], ReadonlyMap<EdgeId, Edge>>();

function findEdge(g: LaneGraph, id: EdgeId): Edge {
  let index = edgeIndexes.get(g.edges);
  if (index === undefined) {
    index = new Map(g.edges.map((e) => [e.id, e]));
    edgeIndexes.set(g.edges, index);
  }
  const edge = index.get(id);
  if (edge === undefined) throw new Error(`Unknown edge ${id}`);
  return edge;
}

function sum(values: Partial<Record<string, number>>): number {
  let total = 0;
  for (const v of Object.values(values)) total += v ?? 0;
  return total;
}
