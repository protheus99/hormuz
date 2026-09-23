// The lease auction (spec §12A.4): ground comes up once a year, bids are sealed, the highest takes
// it, and nobody — bidder or owner — is told what is really under it. Rights decide who may bid at
// all, which is what keeps state-held ground off the market.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { REGIONS } from '../../src/data/regions';
import { aiBid, award, baseWorth, leasableRegions, mayBid, mayWork, placeBid, surveyLots, type LeaseLot } from '../../src/engine/auction';
import { wellOf } from '../../src/engine/companies';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { rngFor } from '../../src/engine/rng';
import { createWorld, step } from '../../src/engine/world';

const world = () => createWorld({ seed: 'auction', portfolio: GLOBAL_PORTFOLIO, personalityMix: 'EVEN' });

describe('who may take ground where', () => {
  it('never offers ground a state company holds', () => {
    const regions = leasableRegions();
    expect(regions.length).toBeGreaterThan(10);
    for (const r of regions) expect(REGIONS[r].leasing).not.toBe('NATIONAL');
    // The Gulf is the one that matters: §10.3 needs its production above local refining, and this
    // is what now keeps anyone from buying in.
    expect(regions).not.toContain('Middle_East');
    expect(REGIONS.Middle_East.leasing).toBe('NATIONAL');
  });

  it('lets anyone bid on open ground, and only licence-holders on licensed ground', () => {
    const w = world();
    const boreal = w.agents.find((a) => a.name === 'Boreal Shale');
    expect(boreal).toBeDefined();
    expect(REGIONS.US_Permian.leasing).toBe('OPEN');
    expect(mayBid(boreal!, 'US_Permian')).toBe(true);
    expect(REGIONS.West_Africa.leasing).toBe('LICENSED');
    expect(mayBid(boreal!, 'West_Africa')).toBe(false);
    wellOf(boreal!)!.licences.push('West_Africa');
    expect(mayBid(boreal!, 'West_Africa')).toBe(true);
    expect(mayBid(boreal!, 'Middle_East')).toBe(false);
  });

  it('will not sell a company ground it could never ship from', () => {
    const w = world();
    const boreal = w.agents.find((a) => a.name === 'Boreal Shale');
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0];
    expect(lot).toBeDefined();
    // A producer sells one grade from one region, so anything else is unworkable however open it is.
    const elsewhere: LeaseLot = { ...lot!, region: 'Guyana_Suriname' };
    expect(mayBid(boreal!, 'Guyana_Suriname')).toBe(true);
    expect(mayWork(boreal!, elsewhere)).toBe(false);
    const wrongGrade: LeaseLot = { ...lot!, region: 'US_Permian', grade: 'HEAVY_SOUR' };
    expect(mayWork(boreal!, wrongGrade)).toBe(false);
  });
});

describe(`the year's lots`, () => {
  it('come up where the industry is, so every one has somebody who could work it', () => {
    const w = world();
    const lots = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents);
    expect(lots).toHaveLength(DEFAULT_CONFIG.AUCTION.LOTS);
    for (const lot of lots) {
      expect(REGIONS[lot.region].leasing).not.toBe('NATIONAL');
      expect(w.agents.some((a) => mayWork(a, lot))).toBe(true);
    }
  });

  it('are worth more when the survey is better', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const low = baseWorth({ ...lot, band: 'LOW' }, DEFAULT_CONFIG);
    const high = baseWorth({ ...lot, band: 'HIGH' }, DEFAULT_CONFIG);
    expect(high).toBeGreaterThan(1.5 * low);
  });
});

describe('bidding and award', () => {
  it('gives the lot to the highest bid, and takes the money', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const bidders = w.agents.filter((a) => mayWork(a, lot));
    expect(bidders.length).toBeGreaterThan(0);
    const winner = bidders[0]!;
    // A company on its first day cannot afford a block's reserve, let alone its worth; by the time
    // the first auction comes round a year in it can. Give it a year's worth of takings.
    winner.cash = 60_000_000;
    const worth = baseWorth(lot, DEFAULT_CONFIG);
    placeBid(lot, winner.agentId, worth);
    const cashBefore = winner.cash;
    const leasesBefore = wellOf(winner)!.leases.length;

    const results = award([lot], w.agents, w.tick, DEFAULT_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0]?.winner.agentId).toBe(winner.agentId);
    expect(winner.cash).toBeCloseTo(cashBefore - worth, 6);
    expect(wellOf(winner)!.leases).toHaveLength(leasesBefore + 1);

    // Ground and nothing else: no wells, no production, and the drilling still to pay for.
    const bought = wellOf(winner)!.leases.at(-1)!;
    expect(bought.wells).toHaveLength(0);
    expect(bought.acquiredFor).toBe(worth);
    expect(bought.reserves).toBeGreaterThan(0);
  });

  it('will not hand a block to a bidder who cannot pay for it', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    placeBid(lot, bidder.agentId, bidder.cash * 10);
    expect(award([lot], w.agents, w.tick, DEFAULT_CONFIG)).toHaveLength(0);
    expect(wellOf(bidder)!.leases.every((l) => l.name !== lot.name)).toBe(true);
  });

  it('sells nothing below the reserve', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    placeBid(lot, bidder.agentId, 0.5 * lot.reserve);
    expect(award([lot], w.agents, w.tick, DEFAULT_CONFIG)).toHaveLength(0);
  });

  it('never has a company bid away more than half its cash', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const rng = rngFor('bids', 'ai');
    for (const agent of w.agents) {
      const bid = aiBid(agent, lot, DEFAULT_CONFIG, rng);
      expect(bid).toBeLessThanOrEqual(agent.cash * DEFAULT_CONFIG.AUCTION.MAX_CASH_SHARE + 1e-6);
      if (bid > 0) expect(mayWork(agent, lot)).toBe(true);
    }
  });
});

describe('a year of the world', () => {
  it('publishes lots before the day they are awarded, and awards them on it', () => {
    const w = world();
    const every = DEFAULT_CONFIG.AUCTION.EVERY_TICKS;
    const notice = DEFAULT_CONFIG.AUCTION.NOTICE_TICKS;
    for (let d = 0; d < every - notice - 1; d++) step(w);
    expect(w.auction).toBeNull();
    step(w);
    expect(w.auction).not.toBeNull();
    expect(w.auction?.tick).toBe(every);
    const held = w.agents.reduce((t, a) => t + (wellOf(a)?.leases.length ?? 0), 0);

    for (let d = w.tick; d < every; d++) step(w);
    expect(w.auction).toBeNull();                       // awarded and closed
    expect(w.agents.reduce((t, a) => t + (wellOf(a)?.leases.length ?? 0), 0)).toBeGreaterThan(held);
  });
});
