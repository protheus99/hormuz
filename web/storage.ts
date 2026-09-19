// Saves in the browser (spec G9): one slot in localStorage. Storage can be missing or full (private
// windows, cleared site data), so every access is guarded and the game still runs without it.

import type { SaveData } from '../src/game';

const KEY = 'hormuz.save';

export function saveGame(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): SaveData | null {
  try {
    const text = localStorage.getItem(KEY);
    return text === null ? null : (JSON.parse(text) as SaveData);
  } catch {
    return null;
  }
}
