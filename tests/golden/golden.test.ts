// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-21 after fields were
// given a daily swing in what they pump (D48), which moves every barrel in the run. Last verified
// identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a browser at the
// end of each phase.
const GOLDEN = {
  day1: 'f9ffe964c0bd2b89299658a94d294e62',
  day30: '711697ce8995c1008a6c5aae9bb777be',
  final: 'f5fd7aafd38620c5e6667cb516eacd93',
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
