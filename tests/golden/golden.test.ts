// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// Verified identical in Node 24 and Chrome 152 (`npm run golden:browser`) on 2026-09-18,
// after the replay moved onto the real lane graph and cargo logistics (Phase 4).
const GOLDEN = {
  day1: '0be1edc1da27f1a0216549538b7ecc55',
  day30: '74ae5c3542d16175eb831ceefb32d4c6',
  final: '037803e7e81dcff17befddb2107f3760',
};

describe('golden replay', () => {
  const run = runGoldenReplay();

  it('matches the recorded fingerprints', () => {
    // Checked from the start so a failure shows the first day that diverged.
    expect(run.daily[0]).toBe(GOLDEN.day1);
    expect(run.daily[29]).toBe(GOLDEN.day30);
    expect(run.final).toBe(GOLDEN.final);
  });

  it('actually exercises the engine, so the hash means something', () => {
    expect(run.daily).toHaveLength(365);
    expect(run.summary.fills).toBeGreaterThan(100);
    expect(run.summary.refined).toBeGreaterThan(1_000_000);
    expect(run.summary.heldCargoDays).toBeGreaterThan(0);   // the Hormuz closure held cargo
    expect(new Set(run.daily).size).toBe(365);
  });

  it('gives the same run twice in one process, and a different one for another seed', () => {
    expect(runGoldenReplay().final).toBe(run.final);
    expect(runGoldenReplay('another-seed', 30).daily[29]).not.toBe(run.daily[29]);
  });
});
