// Calibration guard (spec §10.3, Phase 7): one year of the global world with an even personality
// mix, checked against the balance targets it already meets, so later changes cannot quietly undo
// them. tools/calibrate.ts prints the full report across seeds.

import { describe, expect, it } from 'vitest';
import { measure } from '../../tools/calibrate';

describe('global S0 calibration (spec §10.3)', () => {
  const s0 = measure('cal-1', []);

  it('builds storage pressure slowly: fill rises, and no producer halts before tick 60', () => {
    expect(s0.fillEnd).toBeGreaterThan(s0.fillStart);
    expect(s0.firstHalt ?? Infinity).toBeGreaterThanOrEqual(60);
  });

  it('has a merit order: the dearest quartile of producers pumps measurably less than the cheapest', () => {
    expect(s0.dearQuartile).toBeLessThan(0.9 * s0.cheapQuartile);
  });

  it('prices crude by quality: NYMEX > NC > DME on average, and on most days', () => {
    expect(s0.markers.NYMEX).toBeGreaterThan(s0.markers.NC ?? 0);
    expect(s0.markers.NC).toBeGreaterThan(s0.markers.DME ?? 0);
    expect(s0.gradeOrderShare).toBeGreaterThan(0.6);
  });

  it('keeps every producer and refinery solvent (the AI trader is a known open issue)', () => {
    expect(s0.insolvent.filter((id) => id !== 'Tidemere_Trading')).toEqual([]);
  });

  it('runs its refineries at a working rate', () => {
    expect(s0.utilization).toBeGreaterThan(0.65);
  });
});
