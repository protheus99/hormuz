// Player commands (spec G3, G9). A command is validated when submitted, queued, and applied at the
// start of the next tick — the tick it is stamped with in the replay log — so a replay is identical
// at any speed. A player changes a setting or answers a card; nothing else reaches the world.

import {
  APPETITE_SETTINGS, RISK_SETTINGS, SELLING_SETTINGS, STOCKPILE_SETTINGS,
} from '../engine/enums';
import type { AgentId, CompanySettings } from '../engine/model';
import type { World } from '../engine/world';
import { bidAmount, mayWork, placeBid, type BidLevel } from '../engine/auction';
import { answer, answerProblem, takeOffer, type AdvisorState } from './cards/advisor';
import { offerOf } from './offers';
import type { CardType, Choice } from './cards/types';

export type Command =
  | { readonly kind: 'SET_SETTING'; readonly setting: keyof CompanySettings; readonly value: string }
  | { readonly kind: 'ANSWER_CARD'; readonly cardId: string; readonly choice: Choice }
  /** A sealed bid on a lot at auction, placed from the lease register (§12A.4). */
  | { readonly kind: 'BID_LEASE'; readonly lotId: string; readonly level: BidLevel }
  /** A standing action taken from the panel the thing lives in (§12A.5): buy tanks, hire a ship. */
  | { readonly kind: 'TAKE_OFFER'; readonly offer: CardType; readonly choice: Choice };

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
    case 'TAKE_OFFER': {
      const offer = offerOf(w, advisor.memory, company, command.offer);
      const choice = offer?.choices.find((c) => c.choice === command.choice);
      if (offer === null || choice === undefined) return 'That is no longer on offer';
      if (!choice.affordable) return 'Not enough money yet';
      return null;
    }
    case 'BID_LEASE': {
      const lot = w.auction?.lots.find((l) => l.lotId === command.lotId);
      if (lot === undefined) return 'That ground is no longer up for auction';
      if (!mayWork(company, lot)) return `${company.name} could not work ${lot.name}`;
      if (command.level !== 'NONE' && bidAmount(lot, company, w.config, command.level) < lot.reserve) {
        return `A ${command.level.toLowerCase()} bid would not meet the reserve on ${lot.name}`;
      }
      return null;
    }
  }
}

/** Applies an accepted command to the world (spec §5 phase 0). */
export function applyCommand(w: World, entry: LoggedCommand, advisor: AdvisorState): string[] {
  const company = w.agents.find((a) => a.agentId === entry.playerId);
  if (company === undefined) return [];
  // A local binding, so the compiler narrows the union inside each case.
  const command = entry.command;
  switch (command.kind) {
    case 'SET_SETTING':
      company.settings = { ...company.settings, [command.setting]: command.value };
      return [];
    case 'BID_LEASE': {
      // Sealed: it is recorded and nothing else happens until the lot is awarded (§12A.4). Bidding
      // again replaces the earlier offer, and NONE withdraws it.
      const lot = w.auction?.lots.find((l) => l.lotId === command.lotId);
      if (lot !== undefined && mayWork(company, lot)) {
        placeBid(lot, company.agentId, bidAmount(lot, company, w.config, command.level));
      }
      return [];
    }
    case 'TAKE_OFFER':
      return takeOffer(w, advisor, company, command.offer, command.choice);
    case 'ANSWER_CARD':
      return answer(w, advisor, entry.playerId, command.cardId, command.choice);
  }
}
