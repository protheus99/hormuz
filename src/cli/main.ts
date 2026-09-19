// Headless game runner (spec §14.2 cli/). Plays a game through GameSession exactly as the
// interface will, printing the player's view as it goes:
//
//   npm run sim -- --type REFINER --region South_Asia --name "Monsoon Refining" --days 180 --every 30
//
// Like the interface, it only ever talks to the game layer (lint enforces this).

import { parseArgs } from 'node:util';
import { GameSession, PLAYER_ID, type GameSettings, type PlayerView } from '../game';

const { values } = parseArgs({
  strict: false,
  options: {
    type: { type: 'string', default: 'PRODUCER' },
    region: { type: 'string', default: 'Russia_West' },
    name: { type: 'string', default: 'Player Oil' },
    difficulty: { type: 'string', default: 'NORMAL' },
    seed: { type: 'string', default: 'cli' },
    days: { type: 'string', default: '90' },
    every: { type: 'string', default: '30' },
  },
});

const settings = {
  seed: String(values.seed),
  playType: String(values.type),
  region: String(values.region),
  companyName: String(values.name),
  difficulty: String(values.difficulty),
  lengthDays: Number(values.days),
} as GameSettings;

const money = (x: number) => `${x < 0 ? '-' : ''}$${(Math.abs(x) / 1e6).toFixed(2)}M`;

function show(view: PlayerView): void {
  const c = view.company;
  const markets = view.markets.map((m) => `${m.node} ${m.marker.toFixed(2)}`).join('  ');
  const straits = view.chokepoints.filter((k) => k.status !== 'OPEN').map((k) => `${k.displayName} ${k.status.toLowerCase()}`).join(', ') || 'all open';
  console.log(`\nDay ${view.tick} — ${markets} — straits: ${straits}`);
  const parts = [`cash ${money(c.cash)}`, `credit used ${money(c.creditDrawn)} of ${money(c.creditLimit)}`];
  if (c.well) parts.push(`storage ${Math.round(c.well.storage).toLocaleString()}/${c.well.storageCapacity.toLocaleString()} bbl`);
  if (c.plant) parts.push(`tanks ${Math.round(Object.values(c.plant.stock).reduce((s, q) => s + q, 0)).toLocaleString()} bbl, run ${Math.round(c.plant.runRate * 100)}%`);
  for (const h of c.hubs) parts.push(`${h.region} hub ${Math.round(Object.values(h.stock).reduce((s, q) => s + q, 0)).toLocaleString()} bbl`);
  console.log(`  ${c.name} (${c.kind.toLowerCase()}, ${c.region}): ${parts.join(' · ')}${c.insolvent ? ' · INSOLVENT' : ''}`);
  const atSea = view.cargo.reduce((s, x) => s + x.qty, 0);
  if (atSea > 0) console.log(`  ${Math.round(atSea).toLocaleString()} bbl of your crude at sea`);
}

const game = await GameSession.newGame(settings);
const every = Number(values.every);
show(await game.getView(PLAYER_ID));
for (;;) {
  const result = await game.advance(every);
  const view = await game.getView(PLAYER_ID);
  show(view);
  if (result.pausedBy) console.log(`  ⏸ ${result.pausedBy.message}`);
  if (result.ended) break;
}
