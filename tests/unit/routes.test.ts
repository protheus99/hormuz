import { beforeEach, describe, expect, it } from 'vitest';
import { asAgentId } from '../../src/engine/model';
import { StubRouteProvider, type RouteProvider, type StubRoute } from '../../src/engine/routes';

const qasr = asAgentId('qasr');
const other = asAgentId('other');

// Gulf crude to East Asia: the cheap route crosses Hormuz; the pipeline route avoids it but is
// capacity-limited. Numbers follow the worked example in spec §3.3.
const TABLE: StubRoute[] = [
  { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 9.8, transit: 16, chokepoints: ['HORMUZ', 'MALACCA'] },
  { origin: 'Middle_East', destination: 'Coastal_Asia', freight: 10.9, transit: 16, chokepoints: ['MALACCA'], capacityPerTick: 6000 },
  { origin: 'West_Africa', destination: 'Coastal_Asia', freight: 11.0, transit: 24 },
  { origin: 'Russia_Far_East', destination: 'Coastal_Asia', freight: 1.15, transit: 6 },
  { origin: 'Russia_Far_East', destination: 'Coastal_Asia', freight: 1.15, transit: 9 },
];

describe('StubRouteProvider (spec §14.4)', () => {
  let routes: StubRouteProvider;
  beforeEach(() => {
    routes = new StubRouteProvider(TABLE);
  });

  it('is a RouteProvider, so clearing can use it unchanged', () => {
    const provider: RouteProvider = routes;
    expect(provider.route('West_Africa', 'Coastal_Asia')?.totalFreight).toBe(11.0);
  });

  it('picks the cheapest usable route', () => {
    const r = routes.route('Middle_East', 'Coastal_Asia');
    expect(r?.totalFreight).toBe(9.8);
    expect(r?.chokepoints).toEqual(['HORMUZ', 'MALACCA']);
  });

  it('routes around an avoided chokepoint, as the Risk setting asks (spec G4.2)', () => {
    expect(routes.route('Middle_East', 'Coastal_Asia', ['HORMUZ'])?.totalFreight).toBe(10.9);
  });

  it('returns null when every route is avoided or none exists', () => {
    expect(routes.route('Middle_East', 'Coastal_Asia', ['MALACCA'])).toBeNull();
    expect(routes.route('Coastal_Asia', 'Middle_East')).toBeNull();
  });

  it('breaks freight ties by the shorter trip', () => {
    expect(routes.route('Russia_Far_East', 'Coastal_Asia')?.totalTransit).toBe(6);
  });

  it('delivers within a region at no freight, one tick later (spec §5)', () => {
    expect(routes.route('Coastal_Asia', 'Coastal_Asia')).toEqual({ edges: [], totalFreight: 0, totalSurcharge: 0, totalTransit: 1, chokepoints: [] });
  });

  it('treats a route without a capacity as unlimited', () => {
    const r = routes.route('West_Africa', 'Coastal_Asia');
    if (r === null) throw new Error('route expected');
    expect(routes.capacityLeft(r, qasr)).toBe(Number.POSITIVE_INFINITY);
    expect(routes.reserve(r, 1_000_000, qasr)).toBe(1_000_000);
  });

  it('shares limited capacity between companies and never over-grants', () => {
    const pipeline = routes.route('Middle_East', 'Coastal_Asia', ['HORMUZ']);
    if (pipeline === null) throw new Error('route expected');
    expect(routes.reserve(pipeline, 4000, qasr)).toBe(4000);
    expect(routes.reserve(pipeline, 4000, other)).toBe(2000);
    expect(routes.reserve(pipeline, 4000, qasr)).toBe(0);
    expect(routes.capacityLeft(pipeline, other)).toBe(0);
  });

  it('frees capacity at the start of a new tick', () => {
    const pipeline = routes.route('Middle_East', 'Coastal_Asia', ['HORMUZ']);
    if (pipeline === null) throw new Error('route expected');
    routes.reserve(pipeline, 6000, qasr);
    routes.resetTick();
    expect(routes.capacityLeft(pipeline, qasr)).toBe(6000);
  });

  it('returns routes as plain data', () => {
    const r = routes.route('Middle_East', 'Coastal_Asia');
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('rejects unknown regions in a stub table at compile time', () => {
    // @ts-expect-error 'Houston' is not a region.
    const bad: StubRoute = { origin: 'Houston', destination: 'Coastal_Asia', freight: 1, transit: 1 };
    expect(bad.freight).toBe(1);
  });
});
