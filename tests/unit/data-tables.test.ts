import { describe, expect, it } from 'vitest';
import { GRADES } from '../../src/engine/enums';
import { CHOKEPOINT_NAMES, CHOKEPOINTS, stormSeasonOf } from '../../src/data/chokepoints';
import { NODE_FOR_GRADE, NODE_NAMES, NODES } from '../../src/data/nodes';
import { REGIONS } from '../../src/data/regions';

describe('exchange nodes (spec §3.3)', () => {
  it('has one node per grade, and NODE_FOR_GRADE agrees with each node', () => {
    expect(NODE_NAMES).toEqual(['NYMEX', 'NC', 'DME']);
    for (const grade of GRADES) {
      expect(NODES[NODE_FOR_GRADE[grade]].grade).toBe(grade);
    }
  });

  it("puts each marker in a region that produces that node's grade", () => {
    for (const name of NODE_NAMES) {
      const node = NODES[name];
      expect(REGIONS[node.markerRegion].exploitableGrades, name).toContain(node.grade);
    }
  });

  it('starts markers at the spec prices, Light Sweet dearest', () => {
    expect([NODES.NYMEX.startingMarker, NODES.NC.startingMarker, NODES.DME.startingMarker]).toEqual([75, 70, 62]);
  });
});

describe('chokepoints (spec §3.5)', () => {
  it('lists all ten, each with a unique display name', () => {
    expect(CHOKEPOINT_NAMES).toEqual([
      // Seven closed by governments...
      'HORMUZ', 'BAB_EL_MANDEB', 'SUEZ', 'MALACCA', 'BOSPHORUS', 'DANISH_STRAITS', 'PANAMA',
      // ...and three closed by the sea (§3.5).
      'GULF_OF_MEXICO', 'CAPE_OF_GOOD_HOPE', 'CAPE_HORN',
    ]);
    const names = CHOKEPOINT_NAMES.map((c) => CHOKEPOINTS[c].displayName);
    expect(new Set(names).size).toBe(10);
  });

  it('gives a storm season only to the passages the weather closes', () => {
    const stormy = CHOKEPOINT_NAMES.filter((c) => stormSeasonOf(c) !== undefined);
    expect(stormy).toEqual(['GULF_OF_MEXICO', 'CAPE_OF_GOOD_HOPE', 'CAPE_HORN']);
    for (const c of stormy) {
      const s = stormSeasonOf(c);
      expect(s?.odds).toBeGreaterThan(0);
      expect(s?.season[0]).toBeGreaterThanOrEqual(0);
      expect(s?.season[1]).toBeLessThan(365);
    }
    // The Gulf may only be congested: it has one modelled exit, and §14.6 forbids stranding it.
    expect(stormSeasonOf('GULF_OF_MEXICO')?.worst).toBe('DELAYED');
  });
});
