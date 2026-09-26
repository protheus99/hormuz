// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-26 for weather at sea
// (§3.5): storms shut or slow the Gulf of Mexico and the two capes for a few days at a time, which
// reroutes cargo and holds some of it back, so the run really does differ. It differs by a little,
// which is the right amount: fills 1,163 → 1,146, barrels refined 7,524,399 → 7,538,164, fees
// $587.18M → $586.64M. A larger move would have meant the weather was doing too much.
//
// Re-recorded earlier the same day for the rename of the economic climate, which changed every hash
// and nothing else: the fingerprint hashes object keys as well as values.
// Last verified identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a
// browser at the end of each phase.
const GOLDEN = {
  day1: 'bea460e4fe4c11d96aa9049a370b6d55',
  day30: 'd387bc4b484685dc2943c3f711f55113',
  final: '147e70c1c261637daf097227dd719e48',
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
