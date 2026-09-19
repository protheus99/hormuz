// The game layer's public API: everything the interface and the CLI may use (spec G9, §14.2).

export { GameSession, MS_PER_DAY_AT_X1, msPerDay, SPEEDS, type AdvanceResult, type SaveData, type Speed } from './session';
export { DIFFICULTY, PLAYER_ID, regionsFor, type Difficulty, type GameSettings, type PlayType } from './newgame';
export type { Command, CommandResult, LoggedCommand } from './commands';
export type { Alert, Severity } from './alerts';
export type { DailyPrices, MarketView, OwnCompanyView, PlayerView } from './view';
export type { Card, CardOption, CardType, Choice, Impact, RiskLevel } from './cards/types';
export type { CardsView } from './view';
