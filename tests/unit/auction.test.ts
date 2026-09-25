// The lease auction (spec §12A.4): ground comes up once a year, bids are sealed, the highest takes
// it, and nobody — bidder or owner — is told what is really under it. Rights decide who may bid at
// all, which is what keeps state-held ground off the market.

import { describe, expect, it } from 'vitest';
import { GLOBAL_PORTFOLIO } from '../../src/data/portfolios';
import { REGIONS } from '../../src/data/regions';
import { aiBid, award, bandFor, baseWorth, buySurvey, leasableRegions, mayBid, mayWork, placeBid, surveyLots, worthTo, type LeaseLot } from '../../src/engine/auction';
import { buyingPower, wellOf } from '../../src/engine/companies';
import { recordFee } from '../../src/engine/economics';
import { FeeKind } from '../../src/engine/enums';
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

  it('sells a company ground in any region it may take ground in, of any crude', () => {
    const w = world();
    const boreal = w.agents.find((a) => a.name === 'Boreal Shale');
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0];
    expect(lot).toBeDefined();
    // Since stage 3b a lease holds its own oil and sells from its own quay, so a second region is
    // ground a producer can actually use — which is what a licence was always for.
    const elsewhere: LeaseLot = { ...lot!, region: 'Guyana_Suriname', grade: 'LIGHT_SWEET' };
    expect(mayBid(boreal!, 'Guyana_Suriname')).toBe(true);
    expect(mayWork(boreal!, elsewhere)).toBe(true);
    // And a crude it was not set up for is ground it can carry too (owner, 2026-09-25). Requiring a
    // match left a wound-up producer's blocks with one eligible buyer — the company that had just
    // lost them — so they could never sell.
    const otherCrude: LeaseLot = { ...lot!, region: 'US_Permian', grade: 'HEAVY_SOUR' };
    expect(mayWork(boreal!, otherCrude)).toBe(true);
  });

  it('still sells nobody ground where they have no right to take any', () => {
    const w = world();
    const boreal = w.agents.find((a) => a.name === 'Boreal Shale');
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0];
    const national = leasableRegions().find((r) => !mayBid(boreal!, r));
    if (national !== undefined) expect(mayWork(boreal!, { ...lot!, region: national })).toBe(false);
    // And a company with no wells at all can never work ground, whatever rights it holds.
    const refiner = w.agents.find((a) => a.kind === 'REFINER');
    expect(mayWork(refiner!, lot!)).toBe(false);
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
    placeBid(lot, bidder.agentId, buyingPower(bidder) * 10);
    expect(award([lot], w.agents, w.tick, DEFAULT_CONFIG)).toHaveLength(0);
    expect(wellOf(bidder)!.leases.every((l) => l.name !== lot.name)).toBe(true);
  });

  it('will hand one to a bidder whose cash is short but whose credit line is not', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    // Ground costs more than a producer keeps in the bank, so a block is bought on the line and
    // repaid out of what it lifts. Paying leaves the cash negative until phase 7 draws on it (G6).
    const price = Math.max(lot.reserve, bidder.cash * 1.5);
    expect(price).toBeLessThanOrEqual(buyingPower(bidder));
    placeBid(lot, bidder.agentId, price);
    const won = award([lot], w.agents, w.tick, DEFAULT_CONFIG);
    expect(won).toHaveLength(1);
    // The bonus leaves the economy the way a tariff does, and the world's own auction records it as
    // a fee for that reason; calling `award` straight has to do the same or the cash invariant bites.
    recordFee(w.ledger, { tick: w.tick, agentId: bidder.agentId, kind: FeeKind.LEASE_BONUS, amount: won[0]!.price });
    expect(bidder.cash).toBeLessThan(0);
    step(w);
    expect(bidder.cash).toBeGreaterThanOrEqual(0);
    expect(bidder.creditDrawn).toBeGreaterThan(0);
  });

  it('sells nothing below the reserve', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    placeBid(lot, bidder.agentId, 0.5 * lot.reserve);
    expect(award([lot], w.agents, w.tick, DEFAULT_CONFIG)).toHaveLength(0);
  });

  it('never has a company stake more than half of what it could raise', () => {
    const w = world();
    const lot = surveyLots(1, DEFAULT_CONFIG, rngFor('lots', 'wells'), w.agents)[0]!;
    const rng = rngFor('bids', 'ai');
    for (const agent of w.agents) {
      const bid = aiBid(agent, lot, DEFAULT_CONFIG, rng);
      expect(bid).toBeLessThanOrEqual(buyingPower(agent) * DEFAULT_CONFIG.AUCTION.MAX_CASH_SHARE + 1e-6);
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

describe('the survey somebody else paid for', () => {
  it('publishes a reading, not the ground: some lots are a band out either way', () => {
    // Over many rounds the published band and the real one part company about as often as the
    // config says they should, and in both directions (§12A.6, dilemma 22).
    const w = world();
    const order = ['LOW', 'MEDIUM', 'HIGH'];
    let wrong = 0, better = 0, worse = 0, total = 0;
    for (let seq = 0; seq < 200; seq++) {
      for (const lot of surveyLots(seq, DEFAULT_CONFIG, rngFor(`s${seq}`, 'wells'), w.agents)) {
        total++;
        const gap = order.indexOf(lot.trueBand) - order.indexOf(lot.band);
        if (gap === 0) continue;
        wrong++;
        if (gap > 0) better++; else worse++;
      }
    }
    expect(total).toBeGreaterThan(300);
    expect(wrong / total).toBeGreaterThan(0.1);
    expect(wrong / total).toBeLessThan(0.4);
    expect(better).toBeGreaterThan(0);
    expect(worse).toBeGreaterThan(0);
  });

  it('is the only way to know before bidding, and changes what a bidder offers', () => {
    const w = world();
    // A lot whose published survey is wrong is the only one where knowing is worth anything.
    let lot = surveyLots(0, DEFAULT_CONFIG, rngFor('x', 'wells'), w.agents)[0]!;
    for (let i = 1; i < 60 && lot.trueBand === lot.band; i++) lot = surveyLots(i, DEFAULT_CONFIG, rngFor(`x${i}`, 'wells'), w.agents)[0]!;
    expect(lot.trueBand).not.toBe(lot.band);
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    expect(bandFor(lot, bidder)).toBe(lot.band);
    const blind = worthTo(lot, bidder, DEFAULT_CONFIG);

    buySurvey(lot, bidder.agentId, 1_000);
    expect(bandFor(lot, bidder)).toBe(lot.trueBand);
    expect(worthTo(lot, bidder, DEFAULT_CONFIG)).not.toBeCloseTo(blind, 0);
    // And nobody else sees a thing.
    const other = w.agents.find((a) => a !== bidder && mayWork(a, lot));
    if (other) expect(bandFor(lot, other)).toBe(lot.band);
  });

  it('makes the block itself answer for it, once it has won you one', () => {
    const w = world();
    const lot = surveyLots(0, DEFAULT_CONFIG, rngFor('taint', 'wells'), w.agents)[0]!;
    const bidder = w.agents.find((a) => mayWork(a, lot))!;
    bidder.cash = 10 * lot.reserve;          // a company that can actually pay for the ground
    buySurvey(lot, bidder.agentId, 250_000);
    placeBid(lot, bidder.agentId, lot.reserve);
    const won = award([lot], w.agents, w.tick, DEFAULT_CONFIG);
    expect(won).toHaveLength(1);
    const entry = bidder.record[0];
    expect(entry?.saved).toBe(250_000);
    expect(entry?.amount).toBe(250_000 * DEFAULT_CONFIG.EXPOSURE.PER_SAVED);
    expect(entry?.target).toEqual({ kind: 'LEASE', leaseId: won[0]!.lease.leaseId });
  });
});
