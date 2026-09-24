// The lease auction (spec §12A.4). Ground changes hands once a year: a few lots are surveyed and
// published, every producer allowed to bid there bids once and in secret, and the highest bid takes
// it. Nobody sees anyone else's bid, and nobody sees what is really under the ground — the survey's
// band is all a bidder gets, which is what makes overpaying possible.
//
// The player never types a price (G4.3). The card built on this offers bid levels worked out from
// the same survey, and the answer arrives here as an ordinary command.

import { REGIONS, type RegionName } from '../data/regions';
import type { Config } from './config';
import { wellOf } from './companies';
import { Grade } from './enums';
import { BAND_YEARS, newLease } from './leases';
import { LeaseBand, type Agent, type AgentId, type Lease, type Tick } from './model';
import { nextFloat, type Rng } from './rng';
import { addExposure } from './exposure';
import { nameGround } from '../data/leasenames';

/** One lot in an auction: ground as the survey describes it, and the bids it has drawn. */
export interface LeaseLot {
  readonly lotId: string;
  readonly name: string;
  readonly region: RegionName;
  readonly grade: Grade;
  /** The published survey (§12A.2), which is all a bidder is told. */
  readonly band: LeaseBand;
  /**
   * What the ground actually is. Engine-only: a published survey is somebody's reading of somebody's
   * data, and now and then it is a band out either way. This is what the lease turns out to be, and
   * the only way to know it before bidding is to come by a survey shot for somebody else (§12A.6).
   */
  readonly trueBand: LeaseBand;
  /** Bidders who have seen the real thing. */
  surveyed: AgentId[];
  readonly maxWells: number;
  /** What a fully drilled lease here would make a day — the size every bidder can work out. */
  readonly notionalCapacity: number;
  readonly baseExtractionCost: number;
  /** No lot sells below this. */
  readonly reserve: number;
  bids: { readonly agentId: AgentId; readonly amount: number }[];
  /**
   * Bidders who came by something they should not have (§12A.6, dilemmas 22 and 23). It costs
   * nothing until the ground is won: what a corner buys only becomes something you hold when it
   * wins you the lot, and that is what a reckoning takes back.
   */
  tainted: { readonly agentId: AgentId; readonly saved: number }[];
}

export interface Auction {
  /** The day the lots are awarded. Bids are taken from the day they are published until then. */
  readonly tick: Tick;
  lots: LeaseLot[];
}

/** Regions where ground can come up at all: producing, and not held by a state company. */
export function leasableRegions(): RegionName[] {
  return (Object.keys(REGIONS) as RegionName[]).filter(
    (r) => (REGIONS[r].roles as readonly string[]).includes('PRODUCTION') && REGIONS[r].leasing !== 'NATIONAL',
  );
}

/**
 * Whether a company could actually work this lot. Now that a lease holds its own oil and posts its
 * own asks (stage 3b), that is the same question as whether it has the right to take ground there:
 * a producer can work a second region, and sell what it lifts there from that region's quay.
 */
export function mayWork(agent: Agent, lot: LeaseLot): boolean {
  const field = wellOf(agent);
  // A producer is set up for one crude — its wells, its buyers and its price are all that grade —
  // but since stage 3b it can work that crude in any region it has the right to take ground in.
  return field !== undefined && lot.grade === field.grade && mayBid(agent, lot.region);
}

/** Whether a company may bid for ground here: open to all, or licensed and it holds one. */
export function mayBid(agent: Agent, region: RegionName): boolean {
  const field = wellOf(agent);
  if (field === undefined) return false;                          // only companies that drill
  const leasing = REGIONS[region].leasing;
  if (leasing === 'NATIONAL') return false;
  return leasing === 'OPEN' || field.licences.includes(region);
}

/**
 * What a lot is worth before anyone's appetite: what the ground will leave behind over its life,
 * less what it costs to get it out, and a share of that to the bidder — the landowner keeps the
 * rest, which is what a bonus is.
 *
 * It used to be what the ground cost to drill, which meant a block's price carried `DRILL_COST`'s
 * distortion exactly and could never be fixed on its own (§12A.8). Valuing it on what it makes fixes
 * both with one number, and it is how acreage is actually valued: against a long-run price rather
 * than today's spot, because a bust does not reprice the ground under your feet overnight.
 */
export function baseWorth(lot: LeaseLot, cfg: Config): number {
  const labor = REGIONS[lot.region].laborCostIndex;
  const barrels = lot.notionalCapacity * 365 * BAND_YEARS[lot.band];
  const margin = cfg.AUCTION.NETBACK - lot.baseExtractionCost * labor - REGIONS[lot.region].infrastructureTariff;
  const drilling = lot.maxWells * cfg.DRILL_COST * cfg.DRILL_STEP * labor;
  return Math.max(0, cfg.AUCTION.WORTH_SHARE * (barrels * margin - drilling));
}

/** The lots for one year's auction, surveyed from the ground that is open to be taken. */
export function surveyLots(seq: number, cfg: Config, rng: Rng, agents: readonly Agent[]): LeaseLot[] {
  // Ground already named — held or merely on offer — keeps its name to itself (§12A.2).
  const used = new Set(agents.flatMap((a) => (wellOf(a)?.leases ?? []).map((l) => l.name)));
  // Ground comes up where the industry already is, so every lot has somebody who could work it.
  // The player's own region is always among them: a lease round it could never enter is no round.
  const drillers = agents.filter((a) => {
    const f = wellOf(a);
    return f !== undefined && REGIONS[a.region].leasing !== 'NATIONAL';
  });
  const human = drillers.find((a) => a.controller === 'HUMAN');
  const lots: LeaseLot[] = [];
  for (let i = 0; i < cfg.AUCTION.LOTS; i++) {
    const from = i === 0 && human !== undefined ? human : drillers[Math.floor(nextFloat(rng) * drillers.length)];
    if (from === undefined) continue;
    const region = from.region;
    const grade = wellOf(from)?.grade ?? Grade.MEDIUM;
    const roll = nextFloat(rng);
    // Most ground on offer is ordinary; a genuinely big block is rare, which is what makes one
    // worth a fight (§12A.4).
    const band = roll < 0.15 ? LeaseBand.HIGH : roll < 0.55 ? LeaseBand.MEDIUM : LeaseBand.LOW;
    // A published survey is a reading, not the ground. Now and then it is a band out, either way,
    // which is what makes a copy of somebody else's worth buying (§12A.6, dilemma 22).
    const miss = nextFloat(rng);
    const trueBand = miss < cfg.AUCTION.MISREAD / 2 ? shift(band, 1) : miss < cfg.AUCTION.MISREAD ? shift(band, -1) : band;
    const maxWells = cfg.AUCTION.WELLS.MIN + Math.floor(nextFloat(rng) * (cfg.AUCTION.WELLS.MAX - cfg.AUCTION.WELLS.MIN + 1));
    const lotName = nameGround(used, Math.floor(nextFloat(rng) * 19) + seq * 3 + i, region);
    used.add(lotName);
    const lot: LeaseLot = {
      lotId: `lot-${seq}-${i + 1}`,
      name: lotName,
      region,
      grade,
      band,
      trueBand,
      surveyed: [],
      maxWells,
      notionalCapacity: maxWells * cfg.DRILL_STEP,
      baseExtractionCost: cfg.AUCTION.BASE_COST[grade] ?? cfg.AUCTION.BASE_COST.MEDIUM,
      reserve: 0,
      bids: [], tainted: [],
    };
    lots.push({ ...lot, reserve: cfg.AUCTION.RESERVE_SHARE * baseWorth(lot, cfg) });
  }
  return lots;
}

/** One band up or down, as far as the scale goes. */
function shift(band: LeaseBand, by: number): LeaseBand {
  const order = [LeaseBand.LOW, LeaseBand.MEDIUM, LeaseBand.HIGH];
  const at = order.indexOf(band) + by;
  return order[Math.max(0, Math.min(order.length - 1, at))] as LeaseBand;
}

/**
 * What a bidder believes about a lot: the real thing if they have seen it, the published survey
 * otherwise. Everything a bidder works out — what it is worth, what to offer — comes through here.
 */
export function bandFor(lot: LeaseLot, agent: Agent): LeaseBand {
  return lot.surveyed.includes(agent.agentId) ? lot.trueBand : lot.band;
}

/** Puts a copy of somebody else's survey in a bidder's hands, and marks what it cost them. */
export function buySurvey(lot: LeaseLot, agentId: AgentId, saved: number): void {
  if (!lot.surveyed.includes(agentId)) lot.surveyed.push(agentId);
  taintLot(lot, agentId, saved);
}

/** Marks a bidder as having come by something they should not have, and what it was worth. */
export function taintLot(lot: LeaseLot, agentId: AgentId, saved: number): void {
  if (!lot.tainted.some((t) => t.agentId === agentId)) lot.tainted.push({ agentId, saved });
}

/** The best anybody else has lodged for this lot, and who lodged it. Engine-only. */
export function topRivalBid(lot: LeaseLot, agentId: AgentId): { readonly agentId: AgentId; readonly amount: number } | null {
  let best: { agentId: AgentId; amount: number } | null = null;
  for (const bid of lot.bids) {
    if (bid.agentId === agentId) continue;
    if (best === null || bid.amount > best.amount) best = { agentId: bid.agentId, amount: bid.amount };
  }
  return best;
}

/** What a company would offer at each level. The player picks a level, never a number (G4.3). */
export type BidLevel = 'STRONG' | 'STEADY' | 'NONE';

export function bidAmount(lot: LeaseLot, agent: Agent, cfg: Config, level: BidLevel): number {
  if (level === 'NONE') return 0;
  const share = level === 'STRONG' ? cfg.AUCTION.STRONG_SHARE : cfg.AUCTION.STEADY_SHARE;
  // A bidder offers on what it believes is down there, which is the survey unless it has seen more,
  // and never stakes more than `MAX_CASH_SHARE` of what it holds on one block — the same limit the
  // AI has always had. Without it a player's strong and steady bids were both simply "all of it",
  // which made two options out of one number (found 2026-09-24).
  const most = cfg.AUCTION.MAX_CASH_SHARE * Math.max(0, agent.cash - agent.cashReserved);
  return Math.min(share * worthTo(lot, agent, cfg), most);
}

/** What this lot is worth to this bidder, on whichever survey they are working from. */
export function worthTo(lot: LeaseLot, agent: Agent, cfg: Config): number {
  return baseWorth({ ...lot, band: bandFor(lot, agent) }, cfg);
}

/** Records a bid, replacing anything that company had already offered for the lot. */
export function placeBid(lot: LeaseLot, agentId: AgentId, amount: number): void {
  lot.bids = lot.bids.filter((b) => b.agentId !== agentId);
  if (amount > 0) lot.bids.push({ agentId, amount });
}

/**
 * What an AI company offers: what it thinks the ground is worth, tempered by its appetite and by
 * what it can afford to spend without leaving itself short. It cannot see the other bids, and it
 * cannot see the oil — the survey is all anyone has.
 */
export function aiBid(agent: Agent, lot: LeaseLot, cfg: Config, rng: Rng): number {
  if (!mayWork(agent, lot)) return 0;
  const appetite = cfg.AUCTION.AI_BID.MIN + nextFloat(rng) * (cfg.AUCTION.AI_BID.MAX - cfg.AUCTION.AI_BID.MIN);
  const affordable = Math.max(0, agent.cash - agent.cashReserved) * cfg.AUCTION.MAX_CASH_SHARE;
  // An AI company works from the published survey like everyone else who paid for nothing.
  const offer = Math.min(worthTo(lot, agent, cfg) * appetite, affordable);
  return offer >= lot.reserve ? offer : 0;
}

/**
 * Awards every lot to its highest bidder, who pays what they offered. Ties go to whoever comes
 * first in the world, so the same auction always ends the same way. The winner gets ground and
 * nothing else: no wells, no production, and the drilling still to pay for (§12A.4).
 */
export function award(
  lots: readonly LeaseLot[], agents: readonly Agent[], tick: Tick, cfg: Config,
): { readonly lot: LeaseLot; readonly winner: Agent; readonly price: number; readonly lease: Lease }[] {
  const won: { lot: LeaseLot; winner: Agent; price: number; lease: Lease }[] = [];
  for (const lot of lots) {
    let best: { agent: Agent; amount: number } | null = null;
    for (const agent of agents) {
      const bid = lot.bids.find((b) => b.agentId === agent.agentId);
      if (bid === undefined || bid.amount < lot.reserve) continue;
      if (best === null || bid.amount > best.amount) best = { agent, amount: bid.amount };
    }
    if (best === null) continue;
    const field = wellOf(best.agent);
    if (field === undefined || best.agent.cash < best.amount) continue;
    best.agent.cash -= best.amount;
    const lease = newLease({
      id: `${best.agent.agentId}-${lot.lotId}`,
      name: lot.name,
      region: lot.region,
      grade: lot.grade,
      capacity: lot.notionalCapacity,
      band: lot.trueBand,
      baseExtractionCost: lot.baseExtractionCost,
      acquiredFor: best.amount,
      wells: 0,
      maxWells: lot.maxWells,
    });
    field.leases.push(lease);
    // Ground won on something you were not meant to have is ground you can be made to give back.
    const taint = lot.tainted.find((t) => t.agentId === (best as { agent: Agent }).agent.agentId);
    if (taint !== undefined) {
      addExposure(best.agent, {
        amount: taint.saved * cfg.EXPOSURE.PER_SAVED, saved: taint.saved, tick,
        target: { kind: 'LEASE', leaseId: lease.leaseId },
      });
    }
    won.push({ lot, winner: best.agent, price: best.amount, lease });
  }
  return won;
}
