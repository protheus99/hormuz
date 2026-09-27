// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-27 for ports (§3.5, D66):
// a region's berths can now load and discharge only so much in a day, where before a port was
// infinite. Cargo queues on the busiest days and reroutes, so the run differs throughout.
//
// Recorded earlier for vessel classes (§7.4, D65), for the ×20 rescale, and for weather at sea.
// Last verified identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a
// browser at the end of each phase.
const GOLDEN = {
  day1: 'bccde47dd3bde6e72885094b209a95a3',
  day30: '7685a6daaea690d7bd855646d6399028',
  final: '01cd848a6a6f268cec2d75256d8ea87e',
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
