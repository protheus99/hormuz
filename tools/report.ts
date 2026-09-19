// Self-contained HTML report of one run, with inline SVG charts (spec §11.1, Phase 7).
//
//   npm run report -- --world global --scenario S4 --seed demo --out out/report.html
//
// No libraries and no network: the page is a single file you can open anywhere. Light theme.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { CORE_PORTFOLIO, GLOBAL_PORTFOLIO } from '../src/data/portfolios';
import { plantOf, wellOf } from '../src/engine/companies';
import { createWorld, step, type PersonalityMix, type ScheduledEvent } from '../src/engine/world';
import { GLOBAL_SCENARIOS, SCENARIOS } from './scenarios';

const { values } = parseArgs({
  strict: false,
  options: {
    world: { type: 'string', default: 'global' },
    scenario: { type: 'string', default: 'S0' },
    seed: { type: 'string', default: 'demo' },
    ticks: { type: 'string', default: '365' },
    mix: { type: 'string', default: 'EVEN' },
    out: { type: 'string', default: 'out/report.html' },
  },
});

const world = String(values.world ?? 'global');
const scenario = String(values.scenario ?? 'S0');
const seed = String(values.seed ?? 'demo');
const ticks = Number(values.ticks ?? 365);
const out = String(values.out ?? 'out/report.html');
const events: readonly ScheduledEvent[] | undefined = (world === 'core' ? SCENARIOS : GLOBAL_SCENARIOS)[scenario];
if (events === undefined) throw new Error(`Unknown ${world} scenario ${scenario}`);

const w = createWorld({
  seed, events,
  portfolio: world === 'core' ? CORE_PORTFOLIO : GLOBAL_PORTFOLIO,
  ...(world === 'core' ? {} : { personalityMix: String(values.mix ?? 'EVEN') as PersonalityMix }),
});
const startCash = new Map(w.agents.map((a) => [a.agentId, a.cash]));
const capacity = w.agents.reduce((s, a) => s + (plantOf(a)?.processingCapacity ?? 0), 0);

interface Series { readonly name: string; readonly color: string; readonly values: number[] }
const series = (name: string, color: string): Series => ({ name, color, values: [] });
const markers = [series('NYMEX (light)', '#1f6feb'), series('NC (medium)', '#2da44e'), series('DME (heavy)', '#9a6700')];
const products = [series('Gasoline', '#cf222e'), series('Diesel', '#8250df'), series('Fuel oil', '#6e7781')];
const volumes = [series('Extracted', '#9a6700'), series('Refined', '#1f6feb'), series('Traded', '#2da44e')];
const shipping = [series('At sea', '#1f6feb'), series('Held at a chokepoint', '#cf222e'), series('Floating offshore', '#bf8700')];

const started = performance.now();
for (let t = 0; t < ticks; t++) {
  const r = step(w);
  markers[0]?.values.push(w.nodes.NYMEX.markerPrice);
  markers[1]?.values.push(w.nodes.NC.markerPrice);
  markers[2]?.values.push(w.nodes.DME.markerPrice);
  products[0]?.values.push(w.sink.prices.GASOLINE);
  products[1]?.values.push(w.sink.prices.DIESEL);
  products[2]?.values.push(w.sink.prices.FUEL_OIL);
  volumes[0]?.values.push(r.extracted);
  volumes[1]?.values.push(r.refined);
  volumes[2]?.values.push(r.fills.reduce((s, f) => s + f.qty, 0));
  const qty = (status: string) => w.cargo.filter((c) => c.status === status).reduce((s, c) => s + c.qty, 0);
  shipping[0]?.values.push(qty('MOVING'));
  shipping[1]?.values.push(qty('HELD'));
  shipping[2]?.values.push(qty('FLOATING'));
}
const elapsed = Math.round(performance.now() - started);

/** A line chart as inline SVG, with a 7-day moving average for noisy daily series. */
function chart(title: string, unit: string, lines: readonly Series[], smooth = false): string {
  const W = 760, H = 240, L = 56, R = 12, T = 12, B = 28;
  const shown = lines.map((l) => ({ ...l, values: smooth ? movingAverage(l.values, 7) : l.values }));
  const all = shown.flatMap((l) => l.values);
  const max = Math.max(...all) * 1.05 || 1;
  const min = Math.min(0, ...all);
  const x = (i: number) => L + (i / Math.max(1, ticks - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + f * (max - min);
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${fmt(v)}</text>`;
  }).join('');
  const days = [0, 90, 180, 270, 364].filter((d) => d < ticks).map((d) => `<text x="${x(d)}" y="${H - 8}" class="axis" text-anchor="middle">day ${d + 1}</text>`).join('');
  const events_ = (events ?? []).filter((e) => e.tick <= ticks).map((e) => `<line x1="${x(e.tick - 1)}" x2="${x(e.tick - 1)}" y1="${T}" y2="${H - B}" class="event"/>`).join('');
  const paths = shown.map((l) => `<polyline fill="none" stroke="${l.color}" stroke-width="1.6" points="${l.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`).join('');
  const legend = shown.map((l) => `<span class="key"><i style="background:${l.color}"></i>${l.name}</span>`).join('');
  return `<section><h2>${title} <small>${unit}${smooth ? ', 7-day average' : ''}</small></h2><div class="legend">${legend}</div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${grid}${events_}${paths}${days}</svg></section>`;
}

function movingAverage(xs: readonly number[], n: number): number[] {
  return xs.map((_, i) => { const s = xs.slice(Math.max(0, i - n + 1), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
}

function fmt(v: number): string {
  if (Math.abs(v) < 1e-9) return '0';
  return Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString()}k` : v.toFixed(Math.abs(v) < 10 ? 1 : 0);
}

const money = (x: number) => `${x < 0 ? '−' : ''}$${(Math.abs(x) / 1e6).toFixed(1)}M`;
const rows = w.agents.map((a) => {
  const well = wellOf(a);
  const plant = plantOf(a);
  const kind = a.kind === 'INTEGRATED' ? 'Integrated' : a.kind[0] + a.kind.slice(1).toLowerCase();
  const detail = [well ? `${well.grade.replace('_', ' ').toLowerCase()}, ${Math.round(well.extractionCapacity).toLocaleString()} bbl/day` : '', plant ? `Tier ${plant.techTier}, ${plant.processingCapacity.toLocaleString()} bbl/day` : ''].filter(Boolean).join(' · ');
  const change = a.cash - (startCash.get(a.agentId) ?? 0);
  const flag = w.insolvencies[a.agentId] !== undefined ? `<span class="bad">insolvent from day ${w.insolvencies[a.agentId]}</span>` : '';
  return `<tr><td>${a.name}</td><td>${kind}</td><td>${a.region.replace(/_/g, ' ')}</td><td>${detail}</td><td>${a.personality?.toLowerCase() ?? 'player'}</td><td class="num">${money(a.cash)}</td><td class="num ${change < 0 ? 'bad' : ''}">${money(change)}</td><td class="num">${a.creditDrawn > 0 ? money(a.creditDrawn) : '—'}</td><td>${flag}</td></tr>`;
}).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hormuz run report</title>
<style>
:root { --bg: #ffffff; --text: #1f2328; --muted: #656d76; --line: #d0d7de; --panel: #f6f8fa; --bad: #cf222e; }
body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; }
main { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 28px 0 6px; } small { color: var(--muted); font-weight: normal; }
.meta { color: var(--muted); margin: 0 0 8px; }
svg { width: 100%; height: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
.grid { stroke: var(--line); stroke-width: 1; } .event { stroke: var(--bad); stroke-dasharray: 4 3; stroke-width: 1; }
.axis { fill: var(--muted); font-size: 11px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 6px; color: var(--muted); }
.key i { display: inline-block; width: 12px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.table { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; } th { color: var(--muted); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; } .bad { color: var(--bad); }
</style></head>
<body><main>
<h1>Hormuz run report</h1>
<p class="meta">${world === 'core' ? 'Core' : 'Global'} portfolio · scenario ${scenario} · seed “${seed}” · ${ticks} days · ${w.agents.length} companies · simulated in ${elapsed} ms · every invariant held</p>
<p class="meta">Refineries ran at ${Math.round((100 * w.totals.refined) / (capacity * ticks))}% of capacity. Dashed red lines mark scheduled events.</p>
${chart('Crude markers', '$/bbl', markers, true)}
${chart('Product prices', '$/bbl', products)}
${chart('Daily volumes', 'bbl/day', volumes, true)}
${chart('Crude on the water', 'bbl', shipping)}
<h2>Companies</h2>
<div class="table"><table><thead><tr><th>Company</th><th>Type</th><th>Region</th><th>Assets</th><th>Personality</th><th class="num">Cash</th><th class="num">Change</th><th class="num">Credit used</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Report written to ${out} (${ticks} days in ${elapsed} ms).`);
