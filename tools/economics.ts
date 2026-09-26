// The §12A.8 measurements: is it possible to lose money here, and does capital cost anything?
//
//   npm run economics                 — the global world, three seeds, one year
//   npm run economics -- --ticks 730  — longer, for the payback figures
//
// The complaint this answers is not that money is easy. It is that good and bad decisions both make
// money, because the model has operating costs and almost no capital costs: a well pays for itself
// in six weeks, prices mean-revert in a fortnight, and nothing can stay bad long enough to hurt.
// Each row is one of those, measured rather than asserted, so the economics package can be tuned
// against numbers instead of intentions.

import { parseArgs } from 'node:util';
import { GLOBAL_PORTFOLIO } from '../src/data/portfolios';
import { actualCost } from '../src/engine/agents';
import { plantOf, wellOf } from '../src/engine/companies';
import { productValue, YIELDS } from '../src/engine/economics';
import { GRADES } from '../src/engine/enums';
import { BAND_YEARS } from '../src/engine/leases';
import { expectedWells } from '../src/game/cards/payback';
import { NODE_FOR_GRADE } from '../src/data/nodes';
import { REGIONS } from '../src/data/regions';
import { createWorld, netWorth, step } from '../src/engine/world';

const { values } = parseArgs({ strict: false, options: {
  seeds: { type: 'string', default: '3' },
  ticks: { type: 'string', default: '365' },
} });
const seeds = Array.from({ length: Number(values.seeds ?? 3) }, (_, i) => `cal-${i + 1}`);
const ticks = Number(values.ticks ?? 365);

interface Row {
  /** Days for a 500 bbl/day well to earn back what it cost to drill, at the mean margin. */
  wellPayback: number;
  /** The same for a processing unit, against the mean refining margin. */
  plantPayback: number;
  /** What a barrel leaves behind after everything, $/bbl. */
  meanMargin: number;
  /** And the same through the still. */
  meanRefining: number;
  /** What it costs in capital to put one barrel of a well's life on the books, $/bbl. */
  capitalPerBarrel: number;
  /** Producer fixed costs as a share of producer revenue. */
  fixedShare: number;
  /** Days for a product price to close half the gap back to its base after a shock. */
  shockHalfLife: number;
  /** Producer-days where the netback at the home marker was below cash cost. */
  underwaterShare: number;
  /** The same, on the days the market was called a recession or a panic. */
  underwaterInBust: number;
  /** Days the economic climate spent at each of its five names, as a share of the run. */
  economicClimate: Record<string, number>;
  /** Days at least one refinery's gross margin was negative. */
  refiningUnderwater: number;
  /** The biggest and smallest change in net worth across the cast, as a multiple of where it began. */
  bestGrowth: number;
  worstGrowth: number;
  /** Companies that ended with less than they started. */
  losers: number;
}

function measure(seed: string): Row {
  const w = createWorld({ seed, portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });
  const cfg = w.config;
  const start = new Map(w.agents.map((a) => [a.agentId, netWorth(w, a)]));
  let producerRevenue = 0;
  let producerFixed = 0;
  let underwaterDays = 0;
  let bustDays = 0;
  let underwaterInBust = 0;
  const economicClimate: Record<string, number> = { PANIC: 0, RECESSION: 0, NORMAL: 0, PROSPEROUS: 0, BOOM: 0 };
  let producerDays = 0;
  let refiningUnderwater = 0;
  let marginSum = 0;
  let marginDays = 0;
  let refiningSum = 0;
  let refiningDays = 0;

  for (let d = 0; d < ticks; d++) {
    step(w);
    economicClimate[w.sink.economicClimate] = (economicClimate[w.sink.economicClimate] ?? 0) + 1 / ticks;
    const bust = w.sink.economicClimate === 'PANIC' || w.sink.economicClimate === 'RECESSION';
    for (const a of w.agents) {
      const well = wellOf(a);
      if (well !== undefined) {
        producerDays += 1;
        producerFixed += cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity;
        const node = w.nodes[NODE_FOR_GRADE[well.grade]];
        const netback = node.markerPrice - REGIONS[a.region].infrastructureTariff;
        const cost = actualCost(a as never);
        producerRevenue += well.extractionCapacity * well.extractionRate * netback;
        if (netback < cost) underwaterDays += 1;
        if (bust) { bustDays += 1; if (netback < cost) underwaterInBust += 1; }
        // Net of the fixed costs that stand whether it pumps or not: a barrel's contribution to
        // paying for the hole it came out of is what is left after everything, not before.
        marginSum += netback - cost - cfg.FIXED_COST_RATE.PRODUCER;
        marginDays += 1;
      }
      // A refinery is underwater when the crude it can run is worth less as fuel than it costs.
      const plant = plantOf(a);
      if (plant !== undefined) {
        const best = GRADES.map((g) => {
          const node = w.nodes[NODE_FOR_GRADE[g]];
          return productValue(g, w.sink.expectedPrices) - YIELDS[g].opex - node.markerPrice;
        }).reduce((top, x) => Math.max(top, x), -Infinity);
        if (best < 0) refiningUnderwater += 1;
        refiningSum += best - cfg.FIXED_COST_RATE.REFINER;
        refiningDays += 1;
      }
    }
  }

  // What a 500 bbl/day well costs, against what a barrel leaves behind on an average day — and
  // counting the holes that find nothing, because the industry's $8–15 a barrel is a full-cycle
  // figure with dry holes already in it. Measuring per drilled barrel rather than per delivered one
  // put DRILL_COST at twice what it should be (found 2026-09-24, from a card quoting 46 months
  // where this said 23).
  const meanMargin = marginDays > 0 ? marginSum / marginDays : 0;
  const success = expectedWells(1, 0, cfg);
  const wellCost = (cfg.DRILL_COST * cfg.DRILL_STEP) / success;
  const wellPayback = meanMargin > 0 ? wellCost / (cfg.DRILL_STEP * meanMargin) : Infinity;

  const meanRefining = refiningDays > 0 ? refiningSum / refiningDays : 0;
  const plantCost = cfg.FACTORY_COST * cfg.UNIT_CAPACITY;
  const plantPayback = meanRefining > 0 ? plantCost / (cfg.UNIT_CAPACITY * meanRefining) : Infinity;
  // A well's whole life, roughly: what it makes a day over the middle of the band's years. Capital
  // per barrel is the figure the industry lives or dies by, and the one this model has never had.
  const lifetime = cfg.DRILL_STEP * 365 * ((BAND_YEARS.LOW + BAND_YEARS.HIGH) / 2);

  const growth = w.agents.map((a) => netWorth(w, a) / Math.max(1, start.get(a.agentId) ?? 1));
  return {
    plantPayback,
    meanMargin,
    meanRefining,
    capitalPerBarrel: wellCost / lifetime,
    wellPayback,
    fixedShare: producerRevenue > 0 ? producerFixed / producerRevenue : 0,
    shockHalfLife: Math.log(2) / cfg.PRODUCT_PRICES.THETA,
    underwaterShare: producerDays > 0 ? underwaterDays / producerDays : 0,
    underwaterInBust: bustDays > 0 ? underwaterInBust / bustDays : 0,
    economicClimate,
    refiningUnderwater,
    bestGrowth: Math.max(...growth),
    worstGrowth: Math.min(...growth),
    losers: growth.filter((g) => g < 1).length,
  };
}

const rows = seeds.map(measure);
const mean = (pick: (r: Row) => number) => rows.reduce((s, r) => s + pick(r), 0) / rows.length;
const days = (x: number) => (x === Infinity ? 'never' : `${Math.round(x)} days`);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

console.log(`Economics (§12A.8), ${seeds.length} seeds × ${ticks} days`);
console.log(`  Well pays back in       ${days(mean((r) => r.wellPayback)).padEnd(12)} (industry: 1.5–3 years)`);
console.log(`  Unit pays back in       ${days(mean((r) => r.plantPayback)).padEnd(12)} (industry: 3–7 years)`);
console.log(`  Capital per barrel      $${mean((r) => r.capitalPerBarrel).toFixed(2).padEnd(11)} (shale: $8–15)`);
console.log(`  Margin, lifting         $${mean((r) => r.meanMargin).toFixed(2).padEnd(11)} a barrel, after everything`);
console.log(`  Margin, refining        $${mean((r) => r.meanRefining).toFixed(2).padEnd(11)} a barrel, after everything`);
console.log(`  Producer fixed costs    ${pct(mean((r) => r.fixedShare)).padEnd(12)} of revenue (industry: 15–30%)`);
console.log(`  Price shock half-life   ${days(mean((r) => r.shockHalfLife)).padEnd(12)} (busts run 2–3 years)`);
console.log(`  Producer-days underwater ${pct(mean((r) => r.underwaterShare)).padEnd(11)} (2015–16: years)`);
console.log(`   … of those, in a bust ${pct(mean((r) => r.underwaterInBust)).padEnd(11)} (what a downturn is for)`);
const climate = ['PANIC', 'RECESSION', 'NORMAL', 'PROSPEROUS', 'BOOM']
  .map((k) => `${k.toLowerCase()} ${pct(mean((r) => r.economicClimate[k] ?? 0))}`).join(', ');
console.log(`  EconomicClimate in the sample   ${climate}`);
console.log(`  Refining underwater     ${Math.round(mean((r) => r.refiningUnderwater))} days of ${ticks} (routine in life)`);
console.log(`  Net worth, best         ×${mean((r) => r.bestGrowth).toFixed(2)}`);
console.log(`  Net worth, worst        ×${mean((r) => r.worstGrowth).toFixed(2)}`);
console.log(`  Companies that shrank   ${mean((r) => r.losers).toFixed(1)} of ${GLOBAL_PORTFOLIO.length}`);
