// Card pacing (spec G4.7 check 3): the median days between decisions for each play type, over a
// year of Sandbox with random events, answering every card sensibly.
//
//   npm run pacing           — answering Yes where affordable
//   npm run pacing -- NO     — answering No to everything, for comparison
//   npm run pacing -- METER  — answering by the meters, as a competent player would
//
// The six games run at the same time, one child process each: a year costs about eight seconds and
// seven of those are card projections, which is the right price for a player and the wrong one for
// a harness playing eighteen years in a row (tools/parallel.ts).

import { GameSession, PLAYER_ID, type GameSettings } from '../src/game';
import { answerFor, type BotPolicy } from './bots';
import { onlyJob, passThrough, runJobs } from './parallel';

const args = process.argv.slice(2);
const policy = (args.find((a) => a === 'METER' || a === 'YES' || a === 'NO') ?? 'YES') as BotPolicy;

const GAMES: readonly GameSettings[] = [
  { seed: 's1', playType: 'PRODUCER', region: 'US_Permian', companyName: 'P', lengthDays: 365 },
  { seed: 's1', playType: 'PRODUCER', region: 'Middle_East', companyName: 'P', lengthDays: 365 },
  { seed: 's1', playType: 'REFINER', region: 'Coastal_Asia', companyName: 'R', lengthDays: 365 },
  { seed: 's1', playType: 'REFINER', region: 'North_Sea', companyName: 'R', lengthDays: 365 },
  { seed: 's1', playType: 'TRADER', region: 'North_Sea', companyName: 'T', lengthDays: 365 },
  { seed: 's1', playType: 'TRADER', region: 'Coastal_Asia', companyName: 'T', lengthDays: 365 },
];

const SEEDS = ['p-1', 'p-2', 'p-3'] as const;
/** One job is one game on one seed — the smallest independent piece, so the cores stay busy. */
const JOBS = GAMES.flatMap((game, g) => SEEDS.map((seed, s) => ({ game, seed, g, s })));

interface Found { readonly gaps: number[]; readonly types: Record<string, number>; readonly worth: number }

const only = onlyJob(process.argv);
if (only === null) {
  // The parent: hand every game-and-seed to a child, then put the three seeds of each game back
  // together and print one line per game, in the order they were asked for.
  const done = await runJobs('tools/pacing.ts', JOBS.length, passThrough(args));
  if (done.some((r) => r.failed)) {
    for (const r of done.filter((x) => x.failed)) console.error(r.out);
    process.exit(1);
  }
  for (let g = 0; g < GAMES.length; g++) {
    const base = GAMES[g] as GameSettings;
    const parts = done.filter((_, i) => (JOBS[i] as { g: number }).g === g).map((r) => JSON.parse(r.out) as Found);
    const gaps = parts.flatMap((p) => p.gaps).sort((a, b) => a - b);
    const types: Record<string, number> = {};
    for (const p of parts) for (const [t, n] of Object.entries(p.types)) types[t] = (types[t] ?? 0) + n;
    const worth = parts.reduce((t, p) => t + p.worth, 0);
    const median = gaps.length === 0 ? Infinity : gaps[Math.floor(gaps.length / 2)];
    console.log(`${policy.padEnd(3)} ${base.playType.padEnd(8)} ${base.region.padEnd(14)} cards/yr ${Math.round(gaps.length / SEEDS.length)}  median gap ${median} days  net worth $${(worth / (SEEDS.length * 1e6)).toFixed(1)}M  ${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' ')}`);
  }
  process.exit(0);
}

{
  const { game: base, seed } = JOBS[only] as { game: GameSettings; seed: string };
  const gaps: number[] = [];
  const types: Record<string, number> = {};
  let worth = 0;
  {
    const game = await GameSession.newGame({ ...base, seed });
    let last = 0;
    for (;;) {
      const r = await game.advance(10_000);
      for (const c of r.newCards) {
        types[c.type] = (types[c.type] ?? 0) + 1;
        gaps.push(r.tick - last);
        last = r.tick;
        await game.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: c.id, choice: answerFor(c, policy) });
      }
      if (r.ended) break;
    }
    worth += (await game.getView()).company.netWorth;
  }
  // A child says only what it found; the parent does the adding up and the words.
  console.log(JSON.stringify({ gaps, types, worth }));
}
