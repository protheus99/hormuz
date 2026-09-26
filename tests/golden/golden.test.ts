// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-26 for vessel classes
// (§7.4, D65): what a barrel costs to move now depends on the size of the parcel it moves in, so
// every landed price in the run shifts and with it every decision downstream. Freight across the
// world falls about 21%, which is the honest consequence of a world that ships in bigger parcels
// after the ×20 rescale rather than a discount handed out.
//
// Recorded earlier the same day for the rescale itself, which left the run identical but for units,
// and before that for weather at sea (§3.5).
// Last verified identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a
// browser at the end of each phase.
const GOLDEN = {
  day1: 'fb47ad8ee98f8908f3f051946f7998f2',
  day30: '5cea9995cb0310abf6c7b6a7a2910dea',
  final: 'c4f48f442b12650aff8990f10d4a5697',
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
