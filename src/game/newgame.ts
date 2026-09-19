// Starting a game (spec G2, G8): the player's company joins the global world.
//
// The player picks a play type, a home region valid for it and a company name. The company starts
// at about 17.5% of its region's production (producer) or refining (refiner), taken from the
// largest AI company of the same type there, so the world's balance (§10.3) is unchanged. Where
// the region has no such rival, it starts at a standard size. Difficulty sets the rivals'
// personalities, and the player's starting cash and credit (G8).

import { GLOBAL_PORTFOLIO, PRODUCER_CASH, PRODUCER_STORAGE_DAYS, REFINER_CASH_PER_BBL_DAY, TRADER_CASH, type PortfolioEntry } from '../data/portfolios';
import { REGIONS, type RegionName } from '../data/regions';
import type { Grade } from '../engine/enums';
import type { AgentId } from '../engine/model';
import { createWorld, creditLimit, type PersonalityMix, type World } from '../engine/world';

export type PlayType = 'PRODUCER' | 'REFINER' | 'TRADER';
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface GameSettings {
  readonly seed: string;
  readonly playType: PlayType;
  readonly region: RegionName;
  readonly companyName: string;
  /** Default NORMAL. */
  readonly difficulty?: Difficulty;
  /** Game length in days; null or omitted plays without end (spec G3). */
  readonly lengthDays?: number | null;
  /** Producer only: the grade to pump; defaults to the region's main grade. */
  readonly grade?: Grade;
  /** Refiner only: Tier 1 or 2 (spec G2); default 2. */
  readonly techTier?: 1 | 2;
  /** Trader only: a second office region. */
  readonly secondOffice?: RegionName;
}

/** The player's company always has this id. */
export const PLAYER_ID = 'player' as AgentId;

/** Share of its region the player's company starts with (spec G2: 15–20%). */
export const PLAYER_SHARE = 0.175;

/** Standard starting sizes where the region has no rival of the same type, bbl/day. */
const DEFAULT_PRODUCER_CAPACITY = 3_000;
const DEFAULT_REFINER_CAPACITY = 5_000;

/** Spec G8. */
export const DIFFICULTY: Readonly<Record<Difficulty, { readonly cash: number; readonly credit: number; readonly mix: PersonalityMix }>> = {
  EASY: { cash: 1.5, credit: 1.5, mix: 'MOSTLY_CONSERVATIVE' },
  NORMAL: { cash: 1.0, credit: 1.0, mix: 'EVEN' },
  HARD: { cash: 0.75, credit: 0.5, mix: 'MOSTLY_AGGRESSIVE' },
};

/** Regions where each play type may start (spec §3.4). */
export function regionsFor(playType: PlayType): RegionName[] {
  const all = Object.keys(REGIONS) as RegionName[];
  if (playType === 'TRADER') return all;
  const role = playType === 'PRODUCER' ? 'PRODUCTION' : 'REFINING';
  return all.filter((r) => (REGIONS[r].roles as readonly string[]).includes(role));
}

/** Builds the world for a new game: the global portfolio with the player's company added. */
export function newGameWorld(s: GameSettings): World {
  if (s.companyName.trim().length === 0) throw new Error('The company needs a name');
  if (!regionsFor(s.playType).includes(s.region)) throw new Error(`A ${s.playType.toLowerCase()} cannot start in ${s.region}`);
  const difficulty = DIFFICULTY[s.difficulty ?? 'NORMAL'];
  const { portfolio, player } = withPlayer(GLOBAL_PORTFOLIO, s, difficulty.cash);
  const world = createWorld({ seed: s.seed, portfolio: [...portfolio, player], personalityMix: difficulty.mix });

  // Difficulty scales the player's credit base amount (G8); the rest of the line is unchanged.
  const company = world.agents.find((a) => a.agentId === PLAYER_ID);
  if (company) {
    const cfg = world.config;
    const base = company.kind === 'TRADER' ? cfg.CREDIT_BASE.TRADER : company.kind === 'PRODUCER' ? cfg.CREDIT_BASE.PRODUCER : cfg.CREDIT_BASE.REFINER;
    company.creditLimit = creditLimit(company, cfg) - base + base * difficulty.credit;
  }
  return world;
}

function withPlayer(global: readonly PortfolioEntry[], s: GameSettings, cashFactor: number): { portfolio: PortfolioEntry[]; player: PortfolioEntry } {
  const common = { id: PLAYER_ID, name: s.companyName.trim(), region: s.region, controller: 'HUMAN' as const };
  const portfolio = [...global];

  if (s.playType === 'TRADER') {
    const offices = [{ region: s.region, capacity: 25_000 }];
    if (s.secondOffice !== undefined && s.secondOffice !== s.region) offices.push({ region: s.secondOffice, capacity: 25_000 });
    return { portfolio, player: { ...common, kind: 'TRADER', cash: TRADER_CASH * cashFactor, offices } };
  }

  // The largest rival of the same type in the region gives up the player's share.
  const kind = s.playType;
  const size = (p: PortfolioEntry) => (p.kind === 'PRODUCER' ? p.well.extractionCapacity : p.kind === 'REFINER' ? p.plant.processingCapacity : 0);
  const rivals = portfolio.filter((p) => p.kind === kind && p.region === s.region);
  const regionTotal = rivals.reduce((sum, p) => sum + size(p), 0);
  const largest = rivals.reduce<PortfolioEntry | undefined>((best, p) => (best === undefined || size(p) > size(best) ? p : best), undefined);
  let capacity = regionTotal > 0
    ? Math.max(500, Math.round((PLAYER_SHARE * regionTotal) / 500) * 500)
    : kind === 'PRODUCER' ? DEFAULT_PRODUCER_CAPACITY : DEFAULT_REFINER_CAPACITY;
  if (largest !== undefined) {
    capacity = Math.min(capacity, Math.floor(size(largest) / 2 / 500) * 500);
    portfolio[portfolio.indexOf(largest)] = shrink(largest, capacity);
  }

  if (kind === 'PRODUCER') {
    const grade = s.grade ?? (largest?.kind === 'PRODUCER' ? largest.well.grade : REGIONS[s.region].exploitableGrades[0]);
    if (grade === undefined || !(REGIONS[s.region].exploitableGrades as readonly Grade[]).includes(grade)) {
      throw new Error(`${s.region} cannot produce ${grade ?? 'any grade'}`);
    }
    const baseExtractionCost = largest?.kind === 'PRODUCER' ? largest.well.baseExtractionCost : 20;
    return {
      portfolio,
      player: {
        ...common, kind: 'PRODUCER', cash: PRODUCER_CASH * cashFactor,
        well: { grade, extractionCapacity: capacity, baseExtractionCost, storageCapacity: PRODUCER_STORAGE_DAYS * capacity },
      },
    };
  }

  const techTier = s.techTier ?? 2;
  return {
    portfolio,
    player: {
      ...common, kind: 'REFINER', cash: REFINER_CASH_PER_BBL_DAY * capacity * cashFactor,
      plant: {
        techTier, processingCapacity: capacity, crudeStorageCapacity: 10 * capacity,
        startingStock: { [techTier === 1 ? 'LIGHT_SWEET' : 'MEDIUM']: 5 * capacity },
      },
    },
  };
}

/** A rival after giving up `by` bbl/day of capacity, with its tanks and starting stock scaled to match. */
function shrink(p: PortfolioEntry, by: number): PortfolioEntry {
  if (p.kind === 'PRODUCER') {
    const capacity = p.well.extractionCapacity - by;
    const ratio = capacity / p.well.extractionCapacity;
    return { ...p, well: { ...p.well, extractionCapacity: capacity, storageCapacity: Math.round(p.well.storageCapacity * ratio) } };
  }
  if (p.kind === 'REFINER') {
    const capacity = p.plant.processingCapacity - by;
    const ratio = capacity / p.plant.processingCapacity;
    const startingStock = Object.fromEntries(Object.entries(p.plant.startingStock).map(([g, q]) => [g, Math.floor((q ?? 0) * ratio)]));
    return {
      ...p, cash: Math.round(p.cash * ratio),
      plant: { ...p.plant, processingCapacity: capacity, crudeStorageCapacity: Math.round(p.plant.crudeStorageCapacity * ratio), startingStock },
    };
  }
  return p;
}
