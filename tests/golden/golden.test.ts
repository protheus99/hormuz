// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-26 for the ×20 rescale
// (D64). This is the one re-recording that proves itself: a change of units must leave every
// decision alone and only restate the numbers, so the run comes back with **the same 1,146 fills**,
// **exactly ×20 the barrels refined** (7,538,164 → 150,763,284) and ×20 the fees ($586.64M →
// $11,732.83M) to float precision. Any constant left behind would have shown up here as a different
// number of trades.
//
// Recorded earlier the same day for weather at sea (§3.5), which moved fills 1,163 → 1,146.
//
// Re-recorded earlier the same day for the rename of the economic climate, which changed every hash
// and nothing else: the fingerprint hashes object keys as well as values.
// Last verified identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a
// browser at the end of each phase.
const GOLDEN = {
  day1: 'd02c02efd746760055d2da69503528d8',
  day30: '780d1a17e6c48cc834fba5418fc106c7',
  final: 'dd7d4670cfc5f7ea776e810bfcff91fb',
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
    expect(run.summary.fills).toBeGreaterThan(300);
    expect(run.summary.refined).toBeGreaterThan(1_000_000);
    expect(new Set(run.daily).size).toBe(365);
  });

  it('gives the same run twice in one process, and a different one for another seed', () => {
    expect(runGoldenReplay().final).toBe(run.final);
    expect(runGoldenReplay('another-seed', 30).daily[29]).not.toBe(run.daily[29]);
  });
});
