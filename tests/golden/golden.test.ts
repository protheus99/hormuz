// Golden replay (spec §14.6): is the engine still bit-reproducible?
//
// If this fails after a deliberate change to engine behavior, check the change is intended, then
// update the hashes below in the same commit and say so in the commit message. If it fails with no
// intended change, something has become nondeterministic — find it before going further.
// To find the first day two runs disagree, compare `daily`, then diff that day's state using the
// `inspect` callback of runGoldenReplay.

import { describe, expect, it } from 'vitest';
import { runGoldenReplay } from './replay';

// S0 through the real tick orchestrator, re-recorded in Node 24 on 2026-09-27: a port now remembers
// a trailing year of the days it turned a ship away, by month, instead of one lifetime tally, so the
// shape of the state changes and every fingerprint with it. Nothing the engine does changed: the
// run still clears 1,123 parcels, refines 149,085,774 bbl and charges the same fees to the barrel,
// which is what makes this bookkeeping rather than behaviour.
//
// Recorded the same day for the ports themselves: a port's limit is a count of ships a day rather
// than a volume (§3.5, D66), so which trades clear on a busy day changed. Working a cargo takes a
// place whether it is twenty thousand barrels or two million, which is why a port jams on many small
// parcels and why putting the same oil in one hull relieves it.
//
// Recorded earlier for vessel classes (§7.4, D65), the ×20 rescale, and weather at sea.
// Last verified identical in Chrome 152 (`npm run golden:browser`) on 2026-09-19; re-check in a
// browser at the end of each phase.
const GOLDEN = {
  day1: '76238ffd514e3ea22a9327f64adabe10',
  day30: '90af8b89ae4ec65e3616638522c8a40b',
  final: '85d54019baf1376d9b62a0f486fe6f58',
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
