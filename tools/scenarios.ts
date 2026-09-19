// Verification scenarios (spec §11.2): the core-portfolio runs, then the global-portfolio runs.

import { CHOKEPOINT_NAMES, type ChokepointName } from '../src/data/chokepoints';
import type { ScheduledEvent } from '../src/engine/world';

const window = (chokepoint: ChokepointName, from: number, to: number, status: 'CLOSED' | 'DELAYED' | 'TENSION', delayTicks = 0, surcharge = 0): ScheduledEvent[] => [
  { tick: from, kind: 'CHOKEPOINT', chokepoint, status, delayTicks, surcharge },
  { tick: to + 1, kind: 'CHOKEPOINT', chokepoint, status: 'OPEN' },
];

export const SCENARIOS: Readonly<Record<string, readonly ScheduledEvent[]>> = {
  /** Baseline: 365 ticks, no shocks. */
  S0: [],
  /** Straits_Refining offline, ticks 100–130. */
  S2: [
    { tick: 100, kind: 'PLANT_ONLINE', agentId: 'Straits_Refining', online: false },
    { tick: 131, kind: 'PLANT_ONLINE', agentId: 'Straits_Refining', online: true },
  ],
  /** Hormuz DELAYED +15 ticks, ticks 150–200. */
  S3: [
    { tick: 150, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'DELAYED', delayTicks: 15 },
    { tick: 201, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'OPEN' },
  ],
  /** Hormuz CLOSED, ticks 150–180. */
  S4: [
    { tick: 150, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' },
    { tick: 181, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'OPEN' },
  ],
  /** The Permian pipeline blockaded from the start. */
  S5: [{ tick: 1, kind: 'PIPELINE_CAPACITY', edgeId: 'permian_pipeline', capacity: 0 }],
  /** S4 with both Gulf bypasses shut. */
  S7: [
    { tick: 1, kind: 'PIPELINE_CAPACITY', edgeId: 'bypass_red_sea', capacity: 0 },
    { tick: 1, kind: 'PIPELINE_CAPACITY', edgeId: 'bypass_oman', capacity: 0 },
    { tick: 150, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' },
    { tick: 181, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'OPEN' },
  ],
  /** A non-persistent +15% diesel shock at tick 90. */
  S10: [{ tick: 90, kind: 'PRODUCT_SHOCK', product: 'DIESEL', pct: 0.15, persistent: false }],
};

/** Global-portfolio scenarios (spec §11.2). */
export const GLOBAL_SCENARIOS: Readonly<Record<string, readonly ScheduledEvent[]>> = {
  S0: [],
  /** Red Sea disruption: Bab el-Mandeb closed, ticks 200–260. */
  S6: window('BAB_EL_MANDEB', 200, 260, 'CLOSED'),
  /** Turkish Straits delay: Bosphorus +10, ticks 120–180. */
  S8: window('BOSPHORUS', 120, 180, 'DELAYED', 10),
  /** Malacca congestion: +4 ticks, ticks 100–115. */
  S13: window('MALACCA', 100, 115, 'DELAYED', 4),
  /** Suez blockage: closed, ticks 200–207. */
  S14: window('SUEZ', 200, 207, 'CLOSED'),
  /** Panama low water: TENSION with a 40% surcharge, then DELAYED +8, ticks 30–150. */
  S15: [
    { tick: 30, kind: 'CHOKEPOINT', chokepoint: 'PANAMA', status: 'TENSION', surcharge: 4.5 * 0.4 },
    { tick: 60, kind: 'CHOKEPOINT', chokepoint: 'PANAMA', status: 'DELAYED', delayTicks: 8, surcharge: 4.5 * 0.4 },
    { tick: 151, kind: 'CHOKEPOINT', chokepoint: 'PANAMA', status: 'OPEN' },
  ],
  /** Danish Straits winter: +6, ticks 1–60 and 330–365. */
  S16: [...window('DANISH_STRAITS', 1, 60, 'DELAYED', 6), ...window('DANISH_STRAITS', 330, 365, 'DELAYED', 6)],
};

/** S17: one run per chokepoint, each closed for ticks 100–130 (spec §11.2). */
export function s17(chokepoint: ChokepointName): readonly ScheduledEvent[] {
  return window(chokepoint, 100, 130, 'CLOSED');
}

export { CHOKEPOINT_NAMES };
