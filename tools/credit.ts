// What a company can actually raise, and what ground costs (the question left open by §12A.8).
//
//   npm run credit
//
// Buying ground is the one purchase in the game that costs more than a company holds. The spec
// gives every company a credit line — five times its capital assets plus a base amount — so the
// first question is whether that line is big enough to matter, and the second is whether anything
// in the game ever reaches it. Both are measured here rather than argued about.

import { parseArgs } from 'node:util';
import { GLOBAL_PORTFOLIO } from '../src/data/portfolios';
import { FeeKind } from '../src/engine/enums';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { wellOf } from '../src/engine/companies';
import { baseWorth, type LeaseLot } from '../src/engine/auction';
import { createWorld, creditLimit, netWorth, step, type World } from '../src/engine/world';

const { values } = parseArgs({ strict: false, options: {
  seeds: { type: 'string', default: '3' },
  ticks: { type: 'string', default: '365' },
  // What the line would be worth at another size, so the question can be swept rather than argued.
  share: { type: 'string' },
  base: { type: 'string' },
} });
const seeds = Array.from({ length: Number(values.seeds ?? 3) }, (_, i) => `cal-${i + 1}`);
const ticks = Number(values.ticks ?? 365);

const money = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1e3)}k`);
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : (s[Math.floor((s.length - 1) / 2)]! + s[Math.ceil((s.length - 1) / 2)]!) / 2;
};

interface Track {
  readonly name: string;
  readonly kind: string;
  /** The line the company was given on day 1, and the line its assets would earn it today. */
  readonly limit: number;
  earned: number;
  cash: number;
  drawn: number;
  peakDrawn: number;
  daysDrawn: number;
  interest: number;
  /** Net worth on day 1 and today, so the line can be read against what the company is worth. */
  readonly worth0: number;
  worth: number;
}

interface Round {
  readonly tick: number;
  readonly lots: { band: string; wells: number; reserve: number; worth: number; top: number }[];
  /** What the producers who could bid there were holding when the lots went up. */
  readonly cash: number[];
  readonly power: number[];
}

function run(seed: string) {
  const credit = values.share === undefined && values.base === undefined ? {} : {
    CREDIT_ASSET_SHARE: Number(values.share ?? DEFAULT_CONFIG.CREDIT_ASSET_SHARE),
    CREDIT_BASE: values.base === undefined ? DEFAULT_CONFIG.CREDIT_BASE : (() => {
      const [p, r, t] = String(values.base).split(',').map(Number);
      return { PRODUCER: p! * 1e6, REFINER: r! * 1e6, TRADER: t! * 1e6 };
    })(),
  };
  const w = createWorld({ seed, portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN', config: credit });
  const track = new Map<string, Track>();
  for (const a of w.agents) {
    track.set(a.agentId, {
      name: a.name, kind: a.kind, limit: a.creditLimit, earned: creditLimit(a, w.config),
      cash: a.cash, drawn: 0, peakDrawn: 0, daysDrawn: 0, interest: 0,
      worth0: netWorth(w, a), worth: netWorth(w, a),
    });
  }
  const start = new Map(w.agents.map((a) => [a.agentId, netWorth(w, a)]));
  const rounds: Round[] = [];
  const awards: { day: number; who: string; price: number; cashAfter: number; drawn: number }[] = [];
  let seen = -1;
  for (let t = 0; t < ticks; t++) {
    step(w);
    for (const a of w.agents) {
      const row = track.get(a.agentId)!;
      row.cash = a.cash;
      row.drawn = a.creditDrawn;
      row.earned = creditLimit(a, w.config);
      row.peakDrawn = Math.max(row.peakDrawn, a.creditDrawn);
      row.worth = netWorth(w, a);
      if (a.creditDrawn > 1) row.daysDrawn += 1;
    }
    for (const e of w.ledger.entries) {
      if (e.kind === FeeKind.CREDIT_INTEREST) track.get(e.agentId)!.interest += e.amount;
      if (e.kind === FeeKind.LEASE_BONUS) {
        const a = w.agents.find((x) => x.agentId === e.agentId)!;
        awards.push({ day: w.tick, who: a.name, price: e.amount, cashAfter: a.cash, drawn: a.creditDrawn });
      }
    }
    // The day before the award, every bid is in: that is the moment to compare price with purse.
    if (w.auction !== null && w.auction.tick === w.tick + 1 && w.auction.tick !== seen) {
      seen = w.auction.tick;
      rounds.push(snapshot(w, w.auction.lots));
    }
  }
  return { w, track, start, rounds, awards };
}

function snapshot(w: World, lots: readonly LeaseLot[]): Round {
  const producers = w.agents.filter((a) => wellOf(a) !== undefined);
  return {
    tick: w.tick,
    lots: lots.map((lot) => ({
      band: lot.band, wells: lot.maxWells, reserve: lot.reserve, worth: baseWorth(lot, w.config),
      top: lot.bids.reduce((m, b) => Math.max(m, b.amount), 0),
    })),
    cash: producers.map((a) => a.cash - a.cashReserved),
    power: producers.map((a) => a.cash - a.cashReserved + a.creditLimit - a.creditDrawn),
  };
}

const runs = seeds.map(run);

console.log(`\nThe credit line, ${seeds.length} seeds × ${ticks} days of the global world\n`);
console.log('company                kind      cash      line   line earned     worth  line/worth  line/year  days drawn');
const first = runs[0]!;
const ratios: number[] = [];
for (const [id, row] of first.track) {
  const others = runs.map((r) => r.track.get(id)!);
  const avg = (pick: (t: Track) => number) => others.reduce((s, t) => s + pick(t), 0) / others.length;
  const worth = avg((t) => t.worth);
  const gain = avg((t) => t.worth - t.worth0);
  ratios.push(row.limit / worth);
  console.log(
    `${row.name.padEnd(22)} ${row.kind.slice(0, 8).padEnd(9)} ${money(avg((t) => t.cash)).padStart(8)}`
    + ` ${money(row.limit).padStart(9)} ${money(avg((t) => t.earned)).padStart(12)} ${money(worth).padStart(9)}`
    + ` ${(row.limit / worth).toFixed(1).padStart(10)}x`
    + ` ${(gain > 0 ? (row.limit / gain).toFixed(1) : '--').padStart(10)} ${avg((t) => t.daysDrawn).toFixed(0).padStart(10)}`,
  );
}

console.log(
  `
The median line is ${median(ratios).toFixed(1)} times what the company is worth,`
  + ` and the biggest ${Math.max(...ratios).toFixed(1)} times. The busiest borrower was on the line`
  + ` ${Math.max(...runs.flatMap((r) => [...r.track.values()].map((t) => t.daysDrawn)))} days of the year.`,
);
const yearly = (1 + first.w.config.CREDIT_RATE) ** 365 - 1;
console.log(`\nInterest: ${(first.w.config.CREDIT_RATE * 100).toFixed(3)}% a day, ${(yearly * 100).toFixed(1)}% a year on what is drawn.`);

console.log('\nWhat ground costs, against what the producers who could bid were holding\n');
console.log('day   band     wells   reserve      worth    top bid   median cash   median cash+line');
for (const r of runs) {
  for (const round of r.rounds) {
    for (const lot of round.lots) {
      console.log(
        `${String(round.tick).padStart(4)}  ${lot.band.padEnd(8)} ${String(lot.wells).padStart(4)}`
        + ` ${money(lot.reserve).padStart(10)} ${money(lot.worth).padStart(10)} ${money(lot.top).padStart(10)}`
        + ` ${money(median(round.cash)).padStart(13)} ${money(median(round.power)).padStart(18)}`,
      );
    }
  }
}

console.log('\nGround that changed hands\n');
console.log('day   winner                    price   cash after   on the line');
for (const r of runs) {
  for (const a of r.awards) {
    console.log(
      `${String(a.day).padStart(4)}  ${a.who.padEnd(22)} ${money(a.price).padStart(9)}`
      + ` ${money(a.cashAfter).padStart(12)} ${money(a.drawn).padStart(13)}`,
    );
  }
}

const allCash = runs.flatMap((r) => r.rounds.flatMap((x) => x.cash));
const allPower = runs.flatMap((r) => r.rounds.flatMap((x) => x.power));
const allWorth = runs.flatMap((r) => r.rounds.flatMap((x) => x.lots.map((l) => l.worth)));
console.log(
  `\nA producer holds ${money(median(allCash))} in cash and ${money(median(allPower))} with the line behind it.`
  + ` The median lot is worth ${money(median(allWorth))}; the dearest ${money(Math.max(...allWorth))}.`,
);
const half = first.w.config.AUCTION.MAX_CASH_SHARE;
console.log(
  `Bids are capped at ${(half * 100).toFixed(0)}% of cash in hand: ${money(half * median(allCash))} today,`
  + ` ${money(half * median(allPower))} if the line counted.`,
);
