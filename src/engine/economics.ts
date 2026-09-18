// Money leaving the system (spec §7.1). Trades between companies are transfers and are not
// recorded here; freight, tariffs and running costs leave the economy and are. Summing this
// ledger is how cash conservation is checked (invariant 2, spec §9).
// The retail sink and product prices join this module in Phase 3.

import type { FeeKind } from './enums';
import type { AgentId, Tick } from './model';

export interface FeeEntry {
  readonly tick: Tick;
  readonly agentId: AgentId;
  readonly kind: FeeKind;
  /** Dollars paid out. Never negative. */
  readonly amount: number;
}

export interface FeeLedger {
  entries: FeeEntry[];
  /** Running sum of every entry, kept so the invariant check never has to re-add the whole list. */
  total: number;
}

export function createLedger(): FeeLedger {
  return { entries: [], total: 0 };
}

export function recordFee(ledger: FeeLedger, entry: FeeEntry): void {
  if (!(Number.isFinite(entry.amount) && entry.amount >= 0)) {
    throw new Error(`Fee amounts must be non-negative; got ${entry.amount} for ${entry.kind}`);
  }
  if (entry.amount === 0) return;
  ledger.entries.push(entry);
  ledger.total += entry.amount;
}
