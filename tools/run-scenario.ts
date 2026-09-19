// Headless scenario runner with a text dashboard (spec §11.1, Phase 6).
//
//   npm run scenario -- --scenario S4 --seed demo --ticks 365 --every 30 --out out/s4.csv
//
// Prints markers, product prices and each company's position every N ticks, then writes
// metrics.csv. Stops with the invariant's message if one breaks.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { CORE_PORTFOLIO } from '../src/data/portfolios';
import { plantOf, total, wellOf } from '../src/engine/companies';
import { createRecorder, record, toCsv } from '../src/engine/metrics';
import { createWorld, step, type World } from '../src/engine/world';
import { SCENARIOS } from './scenarios';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'S0' },
    seed: { type: 'string', default: 'demo' },
    ticks: { type: 'string', default: '365' },
    every: { type: 'string', default: '30' },
    out: { type: 'string', default: 'out/metrics.csv' },
  },
});

const events = SCENARIOS[values.scenario];
if (events === undefined) throw new Error(`Unknown scenario ${values.scenario}; try ${Object.keys(SCENARIOS).join(', ')}`);
const world = createWorld({ seed: values.seed, portfolio: CORE_PORTFOLIO, events });
const recorder = createRecorder();
const ticks = Number(values.ticks);
const every = Number(values.every);

const money = (x: number) => `${x < 0 ? '-' : ''}$${(Math.abs(x) / 1e6).toFixed(2)}M`;
function dashboard(w: World): void {
  const markers = (['NYMEX', 'NC', 'DME'] as const).map((n) => `${n} ${w.nodes[n].markerPrice.toFixed(2)}`).join('  ');
  const products = Object.entries(w.sink.prices).map(([p, v]) => `${p.toLowerCase()} ${v.toFixed(2)}`).join('  ');
  const choke = Object.entries(w.graph.chokepoints).filter(([, c]) => c.status !== 'OPEN').map(([n, c]) => `${n} ${c.status}`).join(', ') || 'all open';
  console.log(`\nDay ${w.tick} — ${markers} — ${products} — chokepoints: ${choke}`);
  for (const a of w.agents) {
    const well = wellOf(a);
    const plant = plantOf(a);
    const parts = [money(a.cash)];
    if (well) parts.push(`storage ${Math.round(well.storage).toLocaleString()}/${well.storageCapacity.toLocaleString()}`);
    if (plant) parts.push(`tanks ${Math.round(total(plant.crudeStock)).toLocaleString()} run ${Math.round(plant.utilization * 100)}%`);
    if (a.insolvent) parts.push('INSOLVENT');
    console.log(`  ${a.name.padEnd(22)} ${parts.join('  ')}`);
  }
  const atSea = w.cargo.reduce((s, c) => s + c.qty, 0);
  const held = w.cargo.filter((c) => c.status === 'HELD').reduce((s, c) => s + c.qty, 0);
  console.log(`  at sea ${Math.round(atSea).toLocaleString()} bbl, held ${Math.round(held).toLocaleString()} bbl`);
}

const started = performance.now();
for (let t = 0; t < ticks; t++) {
  record(recorder, world, step(world));
  if (world.tick % every === 0) dashboard(world);
}
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, toCsv(recorder));
console.log(`\n${values.scenario} (seed ${values.seed}): ${ticks} ticks in ${Math.round(performance.now() - started)} ms, every invariant held. Metrics: ${values.out}`);
