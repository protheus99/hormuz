// Chartered tankers (spec §4.11, §6.5, §7.4). A company can hire a ship by the day instead of
// paying the open freight market by the barrel. While a charter is idle, the next cargo its owner
// ships travels on it: the hire is already paid, so the voyage costs nothing further except the
// war-risk surcharge at a troubled strait, which insurers charge whoever owns the hull.

import type { Config } from './config';
import type { AgentId, Cargo, Charter, CharterId, CharterSize, Route, Tick } from './model';
import { asCharterId } from './model';

/** What hiring a ship of this class costs in all, over the days it is hired. */
export function charterCost(config: Config, size: CharterSize, days: number): number {
  return config.CHARTER[size].RATE * Math.max(days, config.CHARTER_MIN_TICKS);
}

/** A new charter, hired from `tick` for at least CHARTER_MIN_TICKS. */
export function newCharter(config: Config, ownerId: AgentId, size: CharterSize, days: number, tick: Tick, seq: number): Charter {
  const { RATE, CAPACITY } = config.CHARTER[size];
  return {
    charterId: asCharterId(`ch-${String(seq)}`),
    ownerId, size, capacity: CAPACITY, rate: RATE,
    untilTick: (tick + Math.max(days, config.CHARTER_MIN_TICKS) - 1) as Tick,
  };
}

/**
 * The charter a company's next cargo should travel on, or undefined for the open market: one it
 * owns, still hired, big enough, and not already carrying something (spec §6.5).
 */
export function idleCharter(charters: readonly Charter[], cargo: readonly Cargo[], ownerId: AgentId, qty: number, tick: Tick): Charter | undefined {
  const busy = new Set(cargo.filter((c) => c.qty > 0 && c.charterId !== null).map((c) => c.charterId));
  return charters.find((ch) => ch.ownerId === ownerId && ch.untilTick >= tick && ch.capacity >= qty && !busy.has(ch.charterId));
}

/**
 * What a company pays to move a cargo, $/bbl: the whole freight on the open market, or only the
 * war-risk surcharge when it travels on a ship the company has already hired (spec §7.4).
 */
export function freightRate(route: Route, charterId: CharterId | null): number {
  return charterId === null ? route.totalFreight : route.totalSurcharge;
}

/** Charters whose hire has run out and which are carrying nothing are handed back (spec §5 phase 0). */
export function expireCharters(charters: readonly Charter[], cargo: readonly Cargo[], tick: Tick): Charter[] {
  const carrying = new Set(cargo.filter((c) => c.qty > 0 && c.charterId !== null).map((c) => c.charterId));
  return charters.filter((ch) => ch.untilTick >= tick || carrying.has(ch.charterId));
}
