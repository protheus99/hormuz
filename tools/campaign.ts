// Plays every campaign scenario with scripted bots (spec G4.7 check 4, Phase 11–12):
//
//   npm run campaign               — always-No and always-Yes on every scenario
//   npm run campaign -- R2 T1      — only these scenarios
//   npm run campaign -- METER      — the meter-led bot, which stands for a competent player
//
// The always-No bot should lose every Medium and Hard scenario; the always-Yes bot should not win
// them reliably. Seeds vary so "reliably" can be judged over several runs.

import { playScenario, type BotPolicy } from './bots';
import { SCENARIOS } from '../src/game';

const args = process.argv.slice(2);
const policies = args.filter((a) => a === 'METER' || a === 'YES' || a === 'NO') as BotPolicy[];
const only = args.filter((a) => !policies.includes(a as BotPolicy));
const seeds = ['bot-1', 'bot-2', 'bot-3'];
for (const sc of SCENARIOS) {
  if (only.length > 0 && !only.includes(sc.id)) continue;
  for (const policy of policies.length > 0 ? policies : (['NO', 'YES'] as BotPolicy[])) {
    const results = [];
    for (const seed of seeds) results.push(await playScenario(sc.id, policy, seed));
    const wins = results.filter((r) => r.result === 'WON').length;
    console.log(`${sc.id.padEnd(6)} ${sc.level.padEnd(6)} ${policy.padEnd(5)} won ${wins}/${seeds.length}  ${results.map((r) => `day ${r.day}: ${r.reason}`).join(' | ')}`);
  }
}
