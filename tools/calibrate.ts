// Calibration report for the global portfolio (spec §10.3, Phase 7).
//
//   npm run calibrate -- --seeds 3
//
// Runs S0 and S4 on the global portfolio for each seed and prints every §10.3 target with its
// acceptance band, plus the Phase 7 acceptance checks (no AI bankruptcies on Normal, markers in
// grade order).

import { parseArgs } from 'node:util';
import { GLOBAL_PORTFOLIO } from '../src/data/portfolios';
import { actualCost } from '../src/engine/agents';
import { plantOf, wellOf } from '../src/engine/companies';
import { createWorld, step, type PersonalityMix, type ScheduledEvent, type World } from '../src/engine/world';

// strict: false, so importing this file from a test runner with its own flags never throws.
const { values } = parseArgs({ strict: false, options: {
  seeds: { type: 'string', default: '3' },
  ticks: { type: 'string', default: '365' },
  mix: { type: 'string', default: 'EVEN' },
} });
const mix = values.mix === 'NONE' ? undefined : ((values.mix ?? 'EVEN') as PersonalityMix);
const seeds = Array.from({ length: Number(values.seeds ?? 3) }, (_, i) => `cal-${i + 1}`);
const ticks = Number(values.ticks ?? 365);

const S4: ScheduledEvent[] = [
  { tick: 150, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'CLOSED' },
  { tick: 181, kind: 'CHOKEPOINT', chokepoint: 'HORMUZ', status: 'OPEN' },
];

export interface RunStats {
  /** Producer-days at 100% storage, where production halts. */
  haltDays: number;
  /** Tick of the first halt in the run, or null. */
  firstHalt: number | null;
  /** Mean producer fill over the first and the last 30 days. */
  fillStart: number;
  fillEnd: number;
  /** Share of ticks with at least one refinery throttled below full run. */
  throttledShare: number;
  /** Barrels produced by the cheapest and the dearest quartile of producers. */
  cheapQuartile: number;
  dearQuartile: number;
  /** Producers whose output rate was ever cut. */
  outputCutters: number;
  /** Every company that was insolvent at any point in the run. */
  insolvent: string[];
  /** Mean marker by node, and the share of days NYMEX > NC > DME. */
  markers: Record<string, number>;
  gradeOrderShare: number;
  /** Mean refinery output against capacity. */
  utilization: number;
}

export function measure(seed: string, events: readonly ScheduledEvent[]): RunStats {
  const w: World = createWorld({ seed, portfolio: GLOBAL_PORTFOLIO, events, ...(mix ? { personalityMix: mix } : {}) });
  const producers = w.agents.filter((a) => a.kind === 'PRODUCER' || a.kind === 'INTEGRATED');
  const cut = new Set<string>();
  const capacity = w.agents.reduce((s, a) => s + (plantOf(a)?.processingCapacity ?? 0), 0);
  const fills: number[] = [];
  const markerSums: Record<string, number> = { NYMEX: 0, NC: 0, DME: 0 };
  let haltDays = 0;
  let firstHalt: number | null = null;
  let throttledTicks = 0;
  let ordered = 0;
  let refined = 0;

  for (let t = 1; t <= ticks; t++) {
    const report = step(w);
    refined += report.refined;
    let fillSum = 0;
    for (const p of producers) {
      const well = wellOf(p);
      if (!well) continue;
      fillSum += well.storage / well.storageCapacity;
      if (well.storage >= well.storageCapacity - 1e-6) {
        haltDays++;
        firstHalt ??= t;
      }
      if (well.extractionRate < 1) cut.add(p.agentId);
    }
    fills.push(fillSum / producers.length);
    if (w.agents.some((a) => (plantOf(a)?.utilization ?? 1) < 1)) throttledTicks++;
    for (const n of ['NYMEX', 'NC', 'DME'] as const) markerSums[n] = (markerSums[n] ?? 0) + w.nodes[n].markerPrice;
    if (w.nodes.NYMEX.markerPrice > w.nodes.NC.markerPrice && w.nodes.NC.markerPrice > w.nodes.DME.markerPrice) ordered++;
  }
  // Merit order: barrels extracted by cost quartile.
  const cost = (a: (typeof producers)[number]) => (a.kind === 'PRODUCER' || a.kind === 'INTEGRATED' ? actualCost(a) : 0);
  const byCost = [...producers].sort((a, b) => cost(a) - cost(b));
  const q = Math.max(1, Math.floor(byCost.length / 4));
  const extracted = (list: typeof producers) => list.reduce((s, p) => s + (w.totals.extractedBy[p.agentId] ?? 0), 0);

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  return {
    haltDays,
    firstHalt,
    fillStart: mean(fills.slice(0, 30)),
    fillEnd: mean(fills.slice(-30)),
    throttledShare: throttledTicks / ticks,
    cheapQuartile: extracted(byCost.slice(0, q)),
    dearQuartile: extracted(byCost.slice(-q)),
    outputCutters: cut.size,
    insolvent: Object.keys(w.insolvencies),
    markers: Object.fromEntries(Object.entries(markerSums).map(([k, v]) => [k, v / ticks])),
    gradeOrderShare: ordered / ticks,
    utilization: refined / (capacity * ticks),
  };
}

if (process.argv[1]?.endsWith('calibrate.ts')) {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  for (const seed of seeds) {
    const s0 = measure(seed, []);
    const s4 = measure(seed, S4);
    console.log(`\nSeed ${seed}`);
    console.log(`  Storage pressure (S0)     fill ${pct(s0.fillStart)} → ${pct(s0.fillEnd)}; first halt ${s0.firstHalt ?? 'never'} (target: rises, none before 60)`);
    console.log(`  Disruption bites (S4/S0)  halt-days ${s4.haltDays} vs ${s0.haltDays} (target ≥ 10×)`);
    console.log(`  Margin contested (S0)     ${pct(s0.throttledShare)} of ticks with a refinery throttled (target 5–40%)`);
    console.log(`  Merit order (S0)          cheapest quartile ${Math.round(s0.cheapQuartile).toLocaleString()} bbl, dearest ${Math.round(s0.dearQuartile).toLocaleString()} bbl (target: dearest measurably less)`);
    console.log(`  Output cuts               ${s0.outputCutters} producers in S0, ${s4.outputCutters} in S4 (target ≥ 3 across S0–S17)`);
    console.log(`  Refinery utilization      ${pct(s0.utilization)} (S0)`);
    console.log(`  Markers (S0 mean)         ${Object.entries(s0.markers).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}; grade order held ${pct(s0.gradeOrderShare)} of days`);
    console.log(`  Ever insolvent (S0)       ${s0.insolvent.join(', ') || 'none'} (target: none)`);
  }
}
