// Hormuz in the browser (spec G10): the new-game screen, then the game. The interface talks only to
// the GameSession API (lint enforces this, §14.2).

import { GameSession } from '../src/game';
import { showGame } from './game';
import { showNewGame } from './newgame';
import { loadGame } from './storage';

const app = document.querySelector<HTMLElement>('#app');

function menu(root: HTMLElement): void {
  const saved = loadGame();
  showNewGame(root, saved !== null, (settings) => {
    void GameSession.newGame(settings).then((s) => showGame(root, s, () => menu(root)));
  }, () => {
    if (saved === null) return;
    GameSession.load(saved)
      .then((s) => showGame(root, s, () => menu(root)))
      .catch(() => alert('That save is from an older version of the game and cannot be loaded.'));
  });
}

if (app) menu(app);
