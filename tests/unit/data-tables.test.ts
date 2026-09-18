import { describe, expect, it } from 'vitest';
import { GRADES } from '../../src/engine/enums';
import { CHOKEPOINT_NAMES, CHOKEPOINTS } from '../../src/data/chokepoints';
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
  it('lists all seven, each with a unique display name', () => {
    expect(CHOKEPOINT_NAMES).toEqual(['HORMUZ', 'BAB_EL_MANDEB', 'SUEZ', 'MALACCA', 'BOSPHORUS', 'DANISH_STRAITS', 'PANAMA']);
    const names = CHOKEPOINT_NAMES.map((c) => CHOKEPOINTS[c].displayName);
    expect(new Set(names).size).toBe(7);
  });
});
