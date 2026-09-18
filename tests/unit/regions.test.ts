import { describe, expect, it } from 'vitest';
import { RegionRole } from '../../src/engine/enums';
import { CONTINENTS, REGION_NAMES, REGIONS, type RegionName } from '../../src/data/regions';

const regions = REGION_NAMES.map((name) => [name, REGIONS[name]] as const);
const has = (name: RegionName, role: RegionRole) => (REGIONS[name].roles as readonly RegionRole[]).includes(role);

describe('regions (spec §3.4)', () => {
  it('defines 22 regions in seven continental groups, in the order the spec lists them', () => {
    expect(REGION_NAMES).toHaveLength(22);
    const counts = CONTINENTS.map((c) => regions.filter(([, r]) => r.continent === c).length);
    expect(counts).toEqual([4, 5, 2, 3, 2, 3, 3]);
  });

  it('gives every region at least one role and no duplicates', () => {
    for (const [name, r] of regions) {
      expect(r.roles.length, name).toBeGreaterThan(0);
      expect(new Set(r.roles).size, name).toBe(r.roles.length);
      expect(new Set(r.exploitableGrades).size, name).toBe(r.exploitableGrades.length);
    }
  });

  it('lists exploitable grades only where producers may operate', () => {
    for (const [name, r] of regions) {
      expect(r.exploitableGrades.length > 0, name).toBe(has(name, RegionRole.PRODUCTION));
    }
  });

  it('keeps labor indices positive and tariffs non-negative', () => {
    for (const [name, r] of regions) {
      expect(r.laborCostIndex, name).toBeGreaterThan(0);
      expect(r.infrastructureTariff, name).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks exactly the two shale regions for fast decline', () => {
    const shale = regions.filter(([, r]) => r.declineClass === 'SHALE').map(([name]) => name);
    expect(shale).toEqual(['US_Permian', 'Argentina_Vaca_Muerta']);
  });

  it('matches G2: integration is possible only where production and refining share a region', () => {
    const both = REGION_NAMES.filter((n) => has(n, RegionRole.PRODUCTION) && has(n, RegionRole.REFINING));
    expect(both).toEqual([
      'US_Gulf_Coast', 'Mexico_Gulf', 'Brazil_Presalt', 'North_Sea', 'Russia_West', 'Middle_East', 'Southeast_Asia',
    ]);
  });

  it('gives every region a unique display name (spec G10)', () => {
    const names = regions.map(([, r]) => r.displayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('carries the spec values for the flagship regions', () => {
    expect(REGIONS.Middle_East.exploitableGrades).toEqual(['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR']);
    expect(REGIONS.Middle_East.infrastructureTariff).toBe(0.20);
    expect(REGIONS.North_Sea.laborCostIndex).toBe(1.40);
    expect(REGIONS.North_Sea.infrastructureTariff).toBe(2.50);
    expect(REGIONS.Red_Sea_Coast.roles).toEqual(['TERMINAL']);
  });

  it('rejects a misspelled region at compile time', () => {
    // @ts-expect-error 'US_Permain' is not a RegionName.
    const typo: RegionName = 'US_Permain';
    expect(REGION_NAMES).not.toContain(typo);
  });
});
