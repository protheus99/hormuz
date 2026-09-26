// Weather conditions at sea (spec §3.5), which are not the economic climate (§12A.8 B). What these
// check is that storms come and go on their own, that they never undo somebody else's closure, and
// that the Atlantic and the Pacific are no longer joined by one canal alone.

import { describe, expect, it } from 'vitest';
import { CHOKEPOINT_NAMES, CHOKEPOINTS, stormSeasonOf } from '../../src/data/chokepoints';
import { profileOf } from '../../src/game/events';
import { REGIONS, type RegionName } from '../../src/data/regions';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { ChokepointStatus } from '../../src/engine/enums';
import { rngFor } from '../../src/engine/rng';
import { advanceStorms, buildLaneGraph, findRoute, setChokepoint, type Storm } from '../../src/engine/transport';
import type { Tick } from '../../src/engine/model';

const cfg = DEFAULT_CONFIG;
const prone = (Object.keys(CHOKEPOINTS) as (keyof typeof CHOKEPOINTS)[])
  .filter((c) => stormSeasonOf(c) !== undefined);

/** Runs `days` of weather and returns the graph, the storms still blowing, and what happened. */
function blow(days: number, seed = 'storms') {
  const g = buildLaneGraph(cfg);
  const rng = rngFor(seed, 'storms');
  let storms: Storm[] = [];
  const seen: { tick: number; chokepoint: string; status: string }[] = [];
  for (let t = 0; t < days; t++) {
    const before = new Set(storms.map((s) => s.chokepoint));
    storms = advanceStorms(g, storms, rng, cfg, t as Tick);
    for (const s of storms) if (!before.has(s.chokepoint)) seen.push({ tick: t, chokepoint: s.chokepoint, status: g.chokepoints[s.chokepoint].status });
  }
  return { g, storms, seen };
}

describe('weather conditions at sea (spec §3.5)', () => {
  it('names the three passages the sea closes, and leaves the political ones alone', () => {
    expect(prone.sort()).toEqual(['CAPE_HORN', 'CAPE_OF_GOOD_HOPE', 'GULF_OF_MEXICO']);
    // Hormuz and the rest are shut by governments, not by the weather.
    expect(stormSeasonOf('HORMUZ')).toBeUndefined();
    expect(stormSeasonOf('SUEZ')).toBeUndefined();
  });

  it('blows up and blows out on its own, without anybody deciding anything', () => {
    const { seen, g } = blow(365 * 3);
    expect(seen.length).toBeGreaterThan(10);
    // Every prone passage sees weather over three years; none of the others ever does.
    expect(new Set(seen.map((s) => s.chokepoint)).size).toBe(prone.length);
    // And a storm always ends: after three years nothing is left stuck shut by the weather alone.
    for (const c of prone) expect([ChokepointStatus.OPEN, ChokepointStatus.DELAYED, ChokepointStatus.CLOSED]).toContain(g.chokepoints[c].status);
  });

  it('comes mostly in season', () => {
    const { seen } = blow(365 * 8);
    const gulf = seen.filter((s) => s.chokepoint === 'GULF_OF_MEXICO');
    const [from, to] = stormSeasonOf('GULF_OF_MEXICO')?.season ?? [0, 0];
    const inSeason = gulf.filter((s) => { const d = s.tick % 365; return d >= from && d <= to; });
    // Hurricane season is half the year and carries far more than half the storms.
    expect(gulf.length).toBeGreaterThan(8);
    expect(inSeason.length / gulf.length).toBeGreaterThan(0.75);
  });

  it('never lifts a closure somebody else put there', () => {
    const g = buildLaneGraph(cfg);
    const rng = rngFor('held-shut', 'storms');
    // A storm blows up, and then a government closes the same water while it is blowing.
    let storms: Storm[] = [];
    let t = 0;
    while (storms.length === 0 && t < 4000) storms = advanceStorms(g, storms, rng, cfg, t++ as Tick);
    const stuck = storms[0];
    if (!stuck) throw new Error('expected a storm');
    setChokepoint(g, stuck.chokepoint, ChokepointStatus.CLOSED, 0, 1.5);
    for (let k = 0; k < 20; k++) storms = advanceStorms(g, storms, rng, cfg, t++ as Tick);
    // The weather has long since blown out; the closure stays, because it was not the weather's.
    expect(g.chokepoints[stuck.chokepoint].status).toBe(ChokepointStatus.CLOSED);
    expect(storms.some((s) => s.chokepoint === stuck.chokepoint)).toBe(false);
  });

  it('leaves the weather-closed passages out of the political event deck', () => {
    // Adding a chokepoint used to be enough to crash the game: both the event deck and the finale
    // enumerated every chokepoint and assumed an event profile came back, and the three the weather
    // closes have none. Whatever is added next, these two lists must agree (found 2026-09-26).
    for (const c of CHOKEPOINT_NAMES) {
      const political = profileOf(c) !== undefined;
      const stormy = stormSeasonOf(c) !== undefined;
      expect(political || stormy, `${c} is closed by nobody: it needs an event profile or a storm season`).toBe(true);
      expect(political && stormy, `${c} is closed by both a government and the sea; pick one`).toBe(false);
    }
  });

  it('is priced so that Cape Horn never bends ordinary trade', () => {
    // A bypass that beats the canal in fair weather is not a bypass. At $2.50 it took half the
    // traffic between the oceans; at $3.80 no pair prefers it, and what crosses it is what the canal
    // could not take that day (measured 2026-09-26).
    const g = buildLaneGraph(cfg);
    const names = Object.keys(REGIONS) as RegionName[];
    const preferred = names.flatMap((a) => names
      .filter((b) => b !== a)
      .filter((b) => findRoute(g, a, b)?.chokepoints.includes('CAPE_HORN') === true)
      .map((b) => `${a} -> ${b}`));
    expect(preferred).toEqual([]);
  });

  it('leaves a way between the oceans when the canal shuts, as there always was', () => {
    const g = buildLaneGraph(cfg);
    const viaCanal = findRoute(g, 'Guyana_Suriname', 'Coastal_Asia');
    expect(viaCanal?.chokepoints).toContain('PANAMA');
    // Shutting the canal does not cut the oceans apart: east round the Cape of Good Hope is longer
    // and has always been there. Cape Horn did not create this, and the comment that said so was
    // wrong (corrected 2026-09-26).
    setChokepoint(g, 'PANAMA', ChokepointStatus.CLOSED);
    const theLongWay = findRoute(g, 'Guyana_Suriname', 'Coastal_Asia');
    expect(theLongWay).not.toBeNull();
    expect(theLongWay?.totalTransit ?? 0).toBeGreaterThan(viaCanal?.totalTransit ?? 0);
  });
});
