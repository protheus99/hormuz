import { describe, expect, it } from 'vitest';
import * as E from '../../src/engine/enums';

// Each entry pairs an enum object with its "all values" list.
const ENUMS = {
  Grade: [E.Grade, E.GRADES],
  Product: [E.Product, E.PRODUCTS],
  Side: [E.Side, E.SIDES],
  RegionRole: [E.RegionRole, E.REGION_ROLES],
  DeclineClass: [E.DeclineClass, E.DECLINE_CLASSES],
  ChokepointStatus: [E.ChokepointStatus, E.CHOKEPOINT_STATUSES],
  EdgeMode: [E.EdgeMode, E.EDGE_MODES],
  CargoStatus: [E.CargoStatus, E.CARGO_STATUSES],
  AgentKind: [E.AgentKind, E.AGENT_KINDS],
  Controller: [E.Controller, E.CONTROLLERS],
  Personality: [E.Personality, E.PERSONALITIES],
  DealStatus: [E.DealStatus, E.DEAL_STATUSES],
  FeeKind: [E.FeeKind, E.FEE_KINDS],
} as const;

describe('enums (spec §4.1)', () => {
  for (const [name, [obj, all]] of Object.entries(ENUMS)) {
    it(`${name}: every value equals its key, so a typo like MEDIUM: 'MEDUIM' fails here`, () => {
      for (const [key, value] of Object.entries(obj)) {
        expect(value).toBe(key);
      }
    });

    it(`${name}: the list holds every value exactly once, in declaration order`, () => {
      expect(all).toEqual(Object.keys(obj));
      expect(new Set(all).size).toBe(all.length);
    });

    it(`${name}: values survive a JSON round trip as plain strings (needed for saves)`, () => {
      expect(JSON.parse(JSON.stringify(all))).toEqual(all);
    });
  }

  it('lists grades lightest to heaviest and chokepoint statuses least to most severe', () => {
    expect(E.GRADES).toEqual(['LIGHT_SWEET', 'MEDIUM', 'HEAVY_SOUR']);
    expect(E.CHOKEPOINT_STATUSES).toEqual(['OPEN', 'TENSION', 'DELAYED', 'CLOSED']);
  });

  it('rejects a misspelled value at compile time', () => {
    // @ts-expect-error 'LIGHT' is not a Grade. If this line ever compiled, `npm run typecheck` would fail,
    // because @ts-expect-error itself errors when there is nothing to expect.
    const typo: E.Grade = 'LIGHT';
    expect(E.GRADES).not.toContain(typo);
  });
});
