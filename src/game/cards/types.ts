// Decision cards (spec G4.1): the shapes shared by the advisor, the catalog and the view.

import type { Action } from '../../engine/actions';
import type { AgentId } from '../../engine/model';
import type { Payback } from './payback';

export type Choice = 'YES' | 'NO' | 'MAYBE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type CardType =
  // Shared
  | 'CASH_SHORT' | 'MARKET_REPORT' | 'FIND_DEAL'
  // Producer
  | 'BUYER_OFFERS_DEAL' | 'PRICES_BELOW_COST' | 'STORAGE_NEARLY_FULL' | 'PRICES_RECOVERED' | 'WELLS_DECLINING'
  | 'EXPORT_ROUTE_TROUBLE' | 'EXPORT_CLOSURE_RISK' | 'EXPAND_STORAGE' | 'BUILD_REFINERY' | 'LEASE_AUCTION'
  // Refiner
  | 'SUPPLIER_OFFERS_DEAL' | 'STOCK_LOW' | 'REFINING_LOSING' | 'MARGINS_STRONG' | 'MAINTENANCE_DUE' | 'BREAKDOWN'
  | 'CHEAP_HEAVY' | 'SUPPLY_ROUTE_TROUBLE' | 'DEAL_CARGO_STUCK' | 'UPGRADE_TIER' | 'ADD_UNIT' | 'EXPAND_TANKS'
  // Trader
  | 'BACK_TO_BACK' | 'DISTRESSED_CARGO' | 'PRICES_LOW' | 'PRICE_GAP' | 'POSITION_FALLING' | 'CRISIS_BREWING'
  | 'CARGO_STUCK' | 'LEASE_STORAGE' | 'OPEN_OFFICE'
  // Anyone who has rented tank space: a term running out with oil standing in it (spec §7.4)
  | 'LEASE_EXPIRING'
  // Shipping (spec §7.4)
  | 'CHARTER_TANKER' | 'KEEP_AFLOAT'
  // A refiner's late game (D34)
  | 'SECOND_REFINERY'
  // The escapes (§12A.6): what is still on offer depends on how loudly the world is asking
  | 'PUT_IT_RIGHT' | 'TELL_THEM_FIRST' | 'RETAIN_COUNSEL'
  // The dilemmas (§12A.6, DILEMMAS.md). Refusing is always safe; the corner is always the Yes.
  | 'SERVICE_HOLD' | 'MANAGER_HUNCH' | 'ORPHAN_WELLS' | 'RESERVES_REPORT' | 'MINISTRY_FEE' | 'BOUGHT_SURVEY'
  | 'OVERHEARD_BID';

/** The four meters every option shows (spec G4.1, G4.5). */
export interface Impact {
  /** Cash that leaves at once, $. */
  readonly cash: number;
  /** Change in net worth over a month against answering No, excluding the one-off cash above, $. */
  readonly profit: number;
  /** The worst point over the projection: days of crude, storage fill or open position. */
  readonly supply: { readonly value: number; readonly unit: 'days' | 'fill' | '$' };
  readonly risk: RiskLevel;
  /** Which part set the risk level (spec G4.5), for the Details expander. */
  readonly riskReason: 'ROUTES' | 'BREAKDOWN' | 'CASH' | 'NONE';
}

export interface CardOption {
  readonly choice: Choice;
  readonly label: string;
  readonly actions: readonly Action[];
  readonly impact: Impact | null;
  /** Total cost over the option's life, for the affordability rule. */
  readonly totalCost: number;
  /** False if it costs more than cash plus unused credit (spec G4.1 "Affordability"). */
  readonly affordable: boolean;
  /** Days until current profit covers it, when unaffordable; null if not at current profit. */
  readonly affordableInDays: number | null;
  /** Things the advisor itself does: ask the market for deals, or deliver a report. */
  readonly effect: OptionEffect | null;
  /**
   * For an option that buys something: what it costs to get earning and how long that takes to come
   * back (§12A.8). The four meters project thirty days, which cannot see a well, a block or a
   * refinery — and showed a player nothing at all on the lease auction. Null on every other card.
   */
  readonly payback: Payback | null;
}

export type OptionEffect = { readonly tender: number } | { readonly report: true };

export interface Card {
  readonly id: string;
  readonly type: CardType;
  readonly agentId: AgentId;
  /** Cards with the same key share a cause, and merge (spec G4.1). */
  readonly key: string;
  readonly title: string;
  readonly situation: string;
  readonly details: string;
  readonly options: readonly CardOption[];
  readonly raisedTick: number;
  /** The tick it resolves as No if unanswered (spec G4.1). Every card the game raises has one. */
  readonly deadline: number | null;
}

/**
 * What the advisor remembers between days (plain data, saved with the session). The world does not
 * keep these histories; some detectors need them.
 */
export interface AdvisorMemory {
  /** Each company's net worth when the game began (the "Build a refinery" threshold, spec G2). */
  startNetWorth: Partial<Record<string, number>>;
  /** Spot sales over the last 30 days: who bought from whom, and through which straits. */
  recentSales: { readonly seller: string; readonly buyer: string; readonly qty: number; readonly chokepoints: readonly string[]; readonly tick: number }[];
  /** The tick each held cargo was first seen held. */
  heldSince: Partial<Record<string, number>>;
  /** Whether each plant was broken down yesterday, so a new breakdown can be spotted. */
  outageSeen: Partial<Record<string, boolean>>;
  /** Deal requests from "Find a deal", and when their offers arrive. */
  pendingTenders: { readonly agentId: string; readonly dueTick: number; readonly termDays: number }[];
  /** The last tick a company was offered a deal unasked. */
  lastOfferTick: Partial<Record<string, number>>;
  /** Crude held in each region each day, for lagged market reports (spec G5). */
  storageByRegion: { readonly tick: number; readonly byRegion: Partial<Record<string, number>> }[];
  /** Market reports bought: roughly how much rivals held in each region. */
  reports: { readonly tick: number; readonly agentId: string; readonly asOf: number; readonly byRegion: Partial<Record<string, number>> }[];
  /** Each player's net worth over the last 30 days, for "affordable in about N days". */
  worth: Partial<Record<string, number[]>>;
}

export function emptyMemory(): AdvisorMemory {
  return {
    startNetWorth: {}, recentSales: [], heldSince: {}, outageSeen: {}, pendingTenders: [], lastOfferTick: {},
    storageByRegion: [], reports: [], worth: {},
  };
}
