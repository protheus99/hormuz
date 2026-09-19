// Card pacing (spec G4.7 check 3): the median days between decisions for each play type, over a
// year of Sandbox with random events, answering every card sensibly.
//
//   npm run pacing

import { GameSession, PLAYER_ID, type GameSettings } from '../src/game';

const GAMES: readonly GameSettings[] = [
  { seed: 's1', playType: 'PRODUCER', region: 'US_Permian', companyName: 'P', lengthDays: 365 },
  { seed: 's1', playType: 'PRODUCER', region: 'Middle_East', companyName: 'P', lengthDays: 365 },
  { seed: 's1', playType: 'REFINER', region: 'Coastal_Asia', companyName: 'R', lengthDays: 365 },
  { seed: 's1', playType: 'REFINER', region: 'North_Sea', companyName: 'R', lengthDays: 365 },
  { seed: 's1', playType: 'TRADER', region: 'North_Sea', companyName: 'T', lengthDays: 365 },
  { seed: 's1', playType: 'TRADER', region: 'Coastal_Asia', companyName: 'T', lengthDays: 365 },
];

for (const base of GAMES) {
  const gaps: number[] = [];
  const types: Record<string, number> = {};
  let worth = 0;
  for (const seed of ['p-1', 'p-2', 'p-3']) {
    const game = await GameSession.newGame({ ...base, seed });
    let last = 0;
    for (;;) {
      const r = await game.advance(10_000);
      for (const c of r.newCards) {
        types[c.type] = (types[c.type] ?? 0) + 1;
        gaps.push(r.tick - last);
        last = r.tick;
        const choice = c.options.find((o) => o.choice === 'YES' && o.affordable)?.choice ?? 'NO';
        await game.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId: c.id, choice });
      }
      if (r.ended) break;
    }
    worth += (await game.getView()).company.netWorth;
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length === 0 ? Infinity : gaps[Math.floor(gaps.length / 2)];
  console.log(`${base.playType.padEnd(8)} ${base.region.padEnd(14)} cards/yr ${Math.round(gaps.length / 3)}  median gap ${median} days  net worth $${(worth / 3e6).toFixed(1)}M  ${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' ')}`);
}
