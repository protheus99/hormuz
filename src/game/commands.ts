// Player commands (spec G3, G9). A command is validated when submitted, queued, and applied at the
// start of the next tick — the tick it is stamped with in the replay log — so a replay is identical
// at any speed. A player changes a setting or answers a card; nothing else reaches the world.

import {
  APPETITE_SETTINGS, RISK_SETTINGS, SELLING_SETTINGS, STOCKPILE_SETTINGS,
} from '../engine/enums';
import type { AgentId, CompanySettings } from '../engine/model';
import type { World } from '../engine/world';
import { answer, answerProblem, openOpportunity, type AdvisorState } from './cards/advisor';
import type { Choice } from './cards/types';

export type Command =
  | { readonly kind: 'SET_SETTING'; readonly setting: keyof CompanySettings; readonly value: string }
  | { readonly kind: 'ANSWER_CARD'; readonly cardId: string; readonly choice: Choice };

/** A command as the replay log stores it: who, what, and the tick it applies at. */
export interface LoggedCommand {
  readonly tick: number;
  /** Submission order; commands for the same tick apply in this order (G9 rule 2). */
  readonly seq: number;
  readonly playerId: AgentId;
  readonly command: Command;
}

export type CommandResult =
  | { readonly ok: true; readonly appliesAt: number }
  | { readonly ok: false; readonly reason: string };

const OPTIONS: Readonly<Record<keyof CompanySettings, readonly string[]>> = {
  risk: RISK_SETTINGS,
  selling: SELLING_SETTINGS,
  stockpile: STOCKPILE_SETTINGS,
  appetite: APPETITE_SETTINGS,
};

/** Which settings each kind of company has (spec G4.2): Risk, plus its play type's own. */
const RELEVANT: Readonly<Record<string, readonly (keyof CompanySettings)[]>> = {
  PRODUCER: ['risk', 'selling'],
  REFINER: ['risk', 'stockpile'],
  INTEGRATED: ['risk', 'selling', 'stockpile'],
  TRADER: ['risk', 'appetite'],
};

/** Why a command cannot be accepted, or null if it can. Checked at submission (spec G9). */
export function rejectReason(w: World, playerId: AgentId, command: Command, advisor: AdvisorState): string | null {
  const company = w.agents.find((a) => a.agentId === playerId);
  if (company === undefined) return `No company ${playerId} in this game`;
  if (company.controller !== 'HUMAN') return `${company.name} is not a player's company`;
  switch (command.kind) {
    case 'SET_SETTING': {
      const allowed = OPTIONS[command.setting] as readonly string[] | undefined;
      if (allowed === undefined) return `Unknown setting ${String(command.setting)}`;
      if (!(RELEVANT[company.kind] ?? []).includes(command.setting)) return `A ${company.kind.toLowerCase()} has no ${command.setting} setting`;
      if (!allowed.includes(command.value)) return `${command.setting} must be one of ${allowed.join(', ')}`;
      return null;
    }
    case 'ANSWER_CARD':
      return answerProblem(advisor, playerId, command.cardId, command.choice);
  }
}

/** Applies an accepted command to the world (spec §5 phase 0). */
export function applyCommand(w: World, entry: LoggedCommand, advisor: AdvisorState): string[] {
  const company = w.agents.find((a) => a.agentId === entry.playerId);
  if (company === undefined) return [];
  switch (entry.command.kind) {
    case 'SET_SETTING':
      company.settings = { ...company.settings, [entry.command.setting]: entry.command.value };
      return [];
    case 'ANSWER_CARD': {
      // An Opportunity is rebuilt from the world as it stands, so a replay (which never opened it)
      // answers exactly the card the player saw.
      const opp = /^opp:[^:]+:(\w+)$/.exec(entry.command.cardId);
      if (opp) openOpportunity(w, advisor, company, opp[1] as Parameters<typeof openOpportunity>[3]);
      return answer(w, advisor, entry.playerId, entry.command.cardId, entry.command.choice);
    }
  }
}
