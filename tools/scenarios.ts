// Verification scenarios on the core portfolio (spec §11.2). Global-portfolio scenarios (S6, S8,
// S13–S17) join with the global portfolio in Phase 7.

import type { ScheduledEvent } from '../src/engine/world';

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
