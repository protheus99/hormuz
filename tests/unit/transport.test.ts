// Routing on the lane graph (spec §3.5, Phase 4 acceptance).

import { beforeEach, describe, expect, it } from 'vitest';
import { CHOKEPOINT_NAMES } from '../../src/data/chokepoints';
import { REGION_NAMES, REGIONS } from '../../src/data/regions';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { asAgentId, asEdgeId, type Route } from '../../src/engine/model';
import {
  buildLaneGraph, edgeCapacity, edgeCapacityLeft, findRoute, LaneRouteProvider, setChokepoint, setReservation, type LaneGraph,
} from '../../src/engine/transport';

let g: LaneGraph;
beforeEach(() => { g = buildLaneGraph(DEFAULT_CONFIG); });

const ids = (r: Route | null) => r?.edges.map(String) ?? null;
const qasr = asAgentId('qasr');
const straits = asAgentId('straits');

describe('default routes match the §3.5 sanity table', () => {
  it('Middle East → Coastal Asia: Hormuz, Indian Ocean, Malacca, ~16 ticks', () => {
    const r = findRoute(g, 'Middle_East', 'Coastal_Asia');
    expect(r?.chokepoints).toEqual(['HORMUZ', 'MALACCA']);
    expect(r?.totalTransit).toBe(16);
    expect(r?.totalFreight).toBeCloseTo(0.30 + 0.40 + 0.60 + 0.90 + 0.30, 10);
  });

  it('North Sea → Coastal Asia: Mediterranean, Suez, Bab el-Mandeb, Malacca, ~26 ticks', () => {
    const r = findRoute(g, 'North_Sea', 'Coastal_Asia');
    expect(r?.chokepoints).toEqual(['SUEZ', 'BAB_EL_MANDEB', 'MALACCA']);
    expect(r?.totalTransit).toBe(26);
  });

  it('US Gulf Coast → Coastal Asia: Panama ~26 ticks, and ~38 via the Cape when Panama closes', () => {
    const r = findRoute(g, 'US_Gulf_Coast', 'Coastal_Asia');
    expect(r?.chokepoints).toEqual(['GULF_OF_MEXICO', 'PANAMA']);
    expect(r?.totalTransit).toBe(26);
    setChokepoint(g, 'PANAMA', 'CLOSED');
    const cape = findRoute(g, 'US_Gulf_Coast', 'Coastal_Asia');
    expect(cape?.chokepoints).not.toContain('PANAMA');
    expect(ids(cape)).toContain('indian_cape');
    expect(cape?.totalTransit).toBeGreaterThanOrEqual(36);
    expect(cape?.totalTransit).toBeLessThanOrEqual(40);
  });

  it('West Africa → South Asia: the Cape and the Indian Ocean, ~24 ticks', () => {
    const r = findRoute(g, 'West_Africa', 'South_Asia');
    expect(ids(r)).toEqual(['West_Africa-W_S_ATLANTIC', 'cape_s_atlantic', 'indian_cape', 'arabian_indian', 'South_Asia-W_ARABIAN_SEA']);
    expect(r?.totalTransit).toBe(24);
    // Rounding Africa is a named passage now, and the weather can shut it (§3.5).
    expect(r?.chokepoints).toEqual(['CAPE_OF_GOOD_HOPE']);
  });

  it('Middle East → Southern Europe with Hormuz closed: East-West pipeline, Red Sea, Suez, ~8 ticks', () => {
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    const r = findRoute(g, 'Middle_East', 'Southern_Europe');
    expect(ids(r)).toEqual(['bypass_red_sea', 'Red_Sea_Coast-W_RED_SEA', 'suez', 'Southern_Europe-W_MEDITERRANEAN']);
    expect(r?.totalTransit).toBe(8);
  });

  it('delivers inside a region for free, in one tick', () => {
    expect(findRoute(g, 'North_Sea', 'North_Sea')).toEqual({ edges: [], totalFreight: 0, totalSurcharge: 0, totalTransit: 1, chokepoints: [] });
  });
});

describe('chokepoints (spec §3.5)', () => {
  it('reroutes Gulf cargo through a bypass when Hormuz closes', () => {
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    const r = findRoute(g, 'Middle_East', 'Coastal_Asia');
    expect(r?.chokepoints).not.toContain('HORMUZ');
    expect(ids(r)?.[0]).toMatch(/^bypass_/);
  });

  it('reroutes via the Cape when Bab el-Mandeb closes (Phase 4 acceptance)', () => {
    setChokepoint(g, 'BAB_EL_MANDEB', 'CLOSED');
    // South Asia has no bypass pipeline, so its Europe-bound crude must go round Africa - which is
    // a named passage since the weather was given somewhere to blow (§3.5).
    const r = findRoute(g, 'South_Asia', 'Southern_Europe');
    expect(r?.chokepoints).toEqual(['CAPE_OF_GOOD_HOPE']);
    expect(ids(r)).toContain('indian_cape');
    // Gulf crude still reaches Suez through the Red Sea bypass — until that pipeline is full.
    expect(ids(findRoute(g, 'Middle_East', 'Southern_Europe'))?.[0]).toBe('bypass_red_sea');
  });

  it('charges the surcharge at TENSION, and adds the delay only when DELAYED', () => {
    const calm = findRoute(g, 'Middle_East', 'Coastal_Asia');
    setChokepoint(g, 'HORMUZ', 'TENSION', 2, 0.10);
    const tense = findRoute(g, 'Middle_East', 'Coastal_Asia');
    expect(tense?.chokepoints).toContain('HORMUZ');
    expect(tense?.totalFreight).toBeCloseTo((calm?.totalFreight ?? 0) + 0.10, 10);
    expect(tense?.totalTransit).toBe(calm?.totalTransit);
    setChokepoint(g, 'HORMUZ', 'DELAYED', 2, 0.10);
    expect(findRoute(g, 'Middle_East', 'Coastal_Asia')?.totalTransit).toBe((calm?.totalTransit ?? 0) + 2);
  });

  it('switches to a bypass when a delay makes the strait dearer than the pipeline', () => {
    setChokepoint(g, 'HORMUZ', 'DELAYED', 5, 0);
    expect(ids(findRoute(g, 'Middle_East', 'South_Asia'))?.[0]).toBe('bypass_oman');
  });

  it('never uses a region as a junction: no piping North Sea crude across Russia (spec §3.5)', () => {
    for (const [from, to] of [['North_Sea', 'Coastal_Asia'], ['US_Gulf_Coast', 'Coastal_Asia'], ['US_Permian', 'Coastal_Asia']] as const) {
      const r = findRoute(g, from, to);
      expect(ids(r), `${from} → ${to}`).not.toContain('russia_east');
      expect(ids(r), `${from} → ${to}`).not.toContain('canada_west');
    }
  });

  it('still lets a region’s own pipelines carry its crude onward', () => {
    expect(ids(findRoute(g, 'Western_Canada', 'US_Gulf_Coast'))).toEqual(['canada_south', 'permian_pipeline']);
    expect(ids(findRoute(g, 'Russia_West', 'Russia_Far_East'))).toEqual(['russia_east']);
    expect(ids(findRoute(g, 'Russia_West', 'Coastal_Asia'))?.slice(0, 2)).toEqual(['russia_east', 'Russia_Far_East-W_N_PACIFIC']);
    expect(ids(findRoute(g, 'US_Permian', 'Coastal_Asia'))?.[0]).toBe('permian_pipeline');   // out through the Gulf Coast
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    expect(ids(findRoute(g, 'Coastal_Asia', 'Middle_East'))?.at(-1)).toMatch(/^bypass_/);   // imports come in the same way
  });

  it('honours a company’s avoid list', () => {
    const r = findRoute(g, 'Middle_East', 'Coastal_Asia', ['HORMUZ', 'MALACCA']);
    expect(r?.chokepoints).toEqual([]);
    expect(ids(r)).toContain('lombok');
  });

  it('never strands a region: closing any one chokepoint leaves every pair of regions connected (spec §14.6)', () => {
    for (const c of CHOKEPOINT_NAMES) {
      const closed = buildLaneGraph(DEFAULT_CONFIG);
      setChokepoint(closed, c, 'CLOSED');
      for (const from of REGION_NAMES) {
        for (const to of REGION_NAMES) expect(findRoute(closed, from, to), `${c}: ${from} → ${to}`).not.toBeNull();
      }
    }
  });

  it('only offers routes into regions with a sea or pipeline link to every refining region', () => {
    const refining = REGION_NAMES.filter((r) => (REGIONS[r].roles as readonly string[]).includes('REFINING'));
    for (const from of REGION_NAMES) for (const to of refining) expect(findRoute(g, from, to), `${from} → ${to}`).not.toBeNull();
  });
});

describe('pipeline capacity (spec §8 rule 5, Phase 4 acceptance)', () => {
  it('offers the Red Sea bypass once the Oman bypass is full, and nothing once both are', () => {
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    const routes = new LaneRouteProvider(g);
    const first = routes.route('Middle_East', 'South_Asia', [], straits);
    expect(ids(first)?.[0]).toBe('bypass_oman');
    expect(routes.reserve(first as Route, 5000, straits)).toBe(3000);   // the pipe holds 3,000

    const second = routes.route('Middle_East', 'South_Asia', [], straits);
    expect(ids(second)?.[0]).toBe('bypass_red_sea');
    expect(routes.reserve(second as Route, 8000, straits)).toBe(6000);

    expect(routes.route('Middle_East', 'South_Asia', [], straits)).toBeNull();
    routes.resetTick();
    expect(ids(routes.route('Middle_East', 'South_Asia', [], straits))?.[0]).toBe('bypass_oman');
  });

  it('shares capacity across both directions of a pipeline', () => {
    const routes = new LaneRouteProvider(g);
    const out = routes.route('Middle_East', 'Gulf_of_Oman') as Route;
    const back = routes.route('Gulf_of_Oman', 'Middle_East') as Route;
    routes.reserve(out, 2000, qasr);
    expect(routes.capacityLeft(back, straits)).toBe(1000);
  });

  it('keeps reserved space for its holder and shares the rest', () => {
    const oman = asEdgeId('bypass_oman');
    setReservation(g, oman, qasr, 1500, DEFAULT_CONFIG);
    const edge = g.edges.find((e) => e.id === oman);
    if (!edge) throw new Error('edge expected');
    expect(edgeCapacityLeft(edge, qasr)).toBe(3000);
    expect(edgeCapacityLeft(edge, straits)).toBe(1500);
    edge.usedBy[straits] = 1500;   // the shared pool is now full
    expect(edgeCapacityLeft(edge, straits)).toBe(0);
    expect(edgeCapacityLeft(edge, qasr)).toBe(1500);
  });

  it('limits a reservation to MAX_RESERVATION_SHARE of the pipeline (invariant 7)', () => {
    expect(() => setReservation(g, asEdgeId('bypass_oman'), qasr, 2000, DEFAULT_CONFIG)).toThrow(/between 0 and 1500/);
    expect(() => setReservation(g, asEdgeId('hormuz'), qasr, 1000, DEFAULT_CONFIG)).toThrow(/not a pipeline/);
  });

  it('caches plain routes while chokepoints are unchanged, and refreshes as soon as one changes', () => {
    const routes = new LaneRouteProvider(g);
    const a = routes.route('North_Sea', 'Coastal_Asia');
    routes.resetTick();
    expect(routes.route('North_Sea', 'Coastal_Asia')).toBe(a);   // same object: cached across ticks
    setChokepoint(g, 'SUEZ', 'CLOSED');
    expect(routes.route('North_Sea', 'Coastal_Asia')?.chokepoints).not.toContain('SUEZ');
    setChokepoint(g, 'SUEZ', 'OPEN');
    expect(routes.route('North_Sea', 'Coastal_Asia')?.chokepoints).toContain('SUEZ');
  });

  it('survives a save and load mid-tick', () => {
    const routes = new LaneRouteProvider(g);
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    routes.reserve(routes.route('Middle_East', 'Gulf_of_Oman') as Route, 2000, qasr);
    const restored = new LaneRouteProvider(JSON.parse(JSON.stringify(g)) as LaneGraph);
    expect(restored.capacityLeft(restored.route('Middle_East', 'Gulf_of_Oman') as Route, straits)).toBe(1000);
  });
});

describe('chokepoint throughput by status (spec §3.5)', () => {
  it('lets an open strait carry its full throughput, and scales it down step by step as the status worsens', () => {
    const hormuz = () => g.edges.find((e) => e.id === asEdgeId('hormuz'));
    const cap = () => { const e = hormuz(); return e ? edgeCapacity(e) : NaN; };
    expect(cap()).toBe(30_000);
    setChokepoint(g, 'HORMUZ', 'TENSION');
    expect(cap()).toBe(22_500);
    setChokepoint(g, 'HORMUZ', 'DELAYED', 3);
    expect(cap()).toBe(15_000);
    setChokepoint(g, 'HORMUZ', 'CLOSED');
    expect(cap()).toBe(0);
    setChokepoint(g, 'HORMUZ', 'OPEN');
    expect(cap()).toBe(30_000);
  });

  it('redirects cargo once a narrowed strait is full: Gulf crude moves to the bypass pipelines', () => {
    setChokepoint(g, 'HORMUZ', 'DELAYED');   // no delay days, so only the narrowing matters
    const routes = new LaneRouteProvider(g);
    const first = routes.route('Middle_East', 'South_Asia', [], straits) as Route;
    expect(first.chokepoints).toEqual(['HORMUZ']);
    expect(routes.reserve(first, 20_000, straits)).toBe(15_000);   // half of 30,000
    const next = routes.route('Middle_East', 'South_Asia', [], straits);
    expect(ids(next)?.[0]).toMatch(/^bypass_/);
  });

  it('keeps sea lanes without a chokepoint unlimited', () => {
    const lombok = g.edges.find((e) => e.id === asEdgeId('lombok'));
    expect(lombok ? edgeCapacity(lombok) : 0).toBe(Number.POSITIVE_INFINITY);
  });
});
