// How clearing and deals reach the transport network (spec §14.4).
//
// Clearing never imports the lane graph directly; it depends only on the RouteProvider interface.
// Phase 1 uses StubRouteProvider, a hand-written table. Phase 4's lane graph implements the same
// interface, so no clearing code changes when the real network arrives. Unit tests keep using
// the stub, so clearing tests never depend on routing behavior.

import { asEdgeId, type AgentId, type ChokepointName, type EdgeId, type RegionName, type Route } from './model';

export interface RouteProvider {
  /**
   * The best usable route, or null when every route is closed, avoided or missing. With `agentId`,
   * routes whose pipelines are already full for that company today are skipped (spec §3.5).
   */
  route(origin: RegionName, destination: RegionName, avoid?: readonly ChokepointName[], agentId?: AgentId): Route | null;
  /** Barrels this company can still move along the route this tick. Infinity when uncapped. */
  capacityLeft(route: Route, agentId: AgentId): number;
  /** Claims up to qty barrels of capacity and returns how many it actually got. */
  reserve(route: Route, qty: number, agentId: AgentId): number;
}

/** One hand-written route for the stub. Directional: origin to destination only. */
export interface StubRoute {
  readonly origin: RegionName;
  readonly destination: RegionName;
  readonly freight: number;
  readonly transit: number;
  readonly chokepoints?: readonly ChokepointName[];
  /** Barrels per tick shared by every company. Leave it out for unlimited capacity. */
  readonly capacityPerTick?: number;
}

/**
 * `implements RouteProvider` asks the compiler to check this class has every method the
 * interface requires, with matching types. Forgetting one, or getting a parameter wrong,
 * is a compile error here rather than a surprise inside clearing.
 */
export class StubRouteProvider implements RouteProvider {
  private readonly entries: readonly StubEntry[];
  private readonly used = new Map<EdgeId, number>();

  constructor(stubRoutes: readonly StubRoute[]) {
    this.entries = stubRoutes.map((s, i) => ({
      origin: s.origin,
      destination: s.destination,
      capacity: s.capacityPerTick ?? Number.POSITIVE_INFINITY,
      route: {
        edges: [asEdgeId(`stub-${i}`)],
        totalFreight: s.freight,
        totalSurcharge: 0,
        totalTransit: s.transit,
        chokepoints: s.chokepoints ?? [],
      },
    }));
  }

  route(origin: RegionName, destination: RegionName, avoid: readonly ChokepointName[] = [], agentId?: AgentId): Route | null {
    // Delivery inside one region: no freight, but still at least one tick (spec §5: T+1).
    if (origin === destination) return { edges: [], totalFreight: 0, totalSurcharge: 0, totalTransit: 1, chokepoints: [] };

    const usable = this.entries
      .filter((e) => e.origin === origin && e.destination === destination)
      .filter((e) => !e.route.chokepoints.some((c) => avoid.includes(c)))
      // Asked for a company, skip routes already full today, as the lane graph does.
      .filter((e) => agentId === undefined || this.capacityLeft(e.route, agentId) > 0)
      .map((e) => e.route);

    // Cheapest freight first, then the shorter trip. sort() is stable, so remaining ties keep
    // table order and the answer never varies.
    usable.sort((a, b) => a.totalFreight - b.totalFreight || a.totalTransit - b.totalTransit);
    return usable[0] ?? null;
  }

  capacityLeft(route: Route, _agentId: AgentId): number {
    const edge = route.edges[0];
    if (edge === undefined) return Number.POSITIVE_INFINITY;
    return this.entryFor(edge).capacity - (this.used.get(edge) ?? 0);
  }

  reserve(route: Route, qty: number, agentId: AgentId): number {
    const granted = Math.max(0, Math.min(qty, this.capacityLeft(route, agentId)));
    const edge = route.edges[0];
    if (edge !== undefined) this.used.set(edge, (this.used.get(edge) ?? 0) + granted);
    return granted;
  }

  /** Frees all capacity for a new tick. The lane graph's equivalent runs in Phase 0 (spec §5). */
  resetTick(): void {
    this.used.clear();
  }

  private entryFor(edge: EdgeId): StubEntry {
    const found = this.entries.find((e) => e.route.edges[0] === edge);
    if (found === undefined) throw new Error(`Unknown stub route ${edge}`);
    return found;
  }
}

interface StubEntry {
  readonly origin: RegionName;
  readonly destination: RegionName;
  readonly capacity: number;
  readonly route: Route;
}
