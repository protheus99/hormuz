// Alerts: plain-language notices that can pause the clock (spec G3). Critical alerts always
// pause; others pause when at or above the severity the player chose.

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { plantOf, wellOf } from '../engine/companies';
import type { ChokepointStatus } from '../engine/enums';
import type { AgentId } from '../engine/model';
import type { World } from '../engine/world';

export type Severity = 'INFO' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const SEVERITIES: readonly Severity[] = ['INFO', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface Alert {
  readonly tick: number;
  readonly severity: Severity;
  readonly message: string;
}

/** What the alert detector remembers from yesterday. Plain data, saved with the session. */
export interface AlertMemory {
  chokepoints: Record<ChokepointName, ChokepointStatus>;
  playerInsolvent: boolean;
  playerPlantDown: boolean;
  /** Wells of the player's that are not pumping, so a new failure can be told from an old one. */
  wellsDown: number;
}

export function rememberForAlerts(w: World, playerId: AgentId): AlertMemory {
  const me = w.agents.find((a) => a.agentId === playerId);
  const plant = me ? plantOf(me) : undefined;
  const chokepoints = {} as Record<ChokepointName, ChokepointStatus>;
  for (const c of Object.keys(CHOKEPOINTS) as ChokepointName[]) chokepoints[c] = w.graph.chokepoints[c].status;
  const wellsDown = me === undefined ? 0
    : (wellOf(me)?.leases ?? []).reduce((t, l) => t + l.wells.filter((x) => x.status === 'DOWN').length, 0);
  return { chokepoints, playerInsolvent: me?.insolvent ?? false, playerPlantDown: (plant?.outageTicksRemaining ?? 0) > 0, wellsDown };
}

const STATUS_SEVERITY: Readonly<Record<ChokepointStatus, Severity>> = { OPEN: 'MEDIUM', TENSION: 'MEDIUM', DELAYED: 'HIGH', CLOSED: 'CRITICAL' };
const STATUS_WORDS: Readonly<Record<ChokepointStatus, string>> = {
  OPEN: 'has reopened to shipping',
  TENSION: 'is tense: insurers have raised costs',
  DELAYED: 'is congested: ships face delays',
  CLOSED: 'is closed to shipping',
};

/** Compares today with yesterday and returns anything the player should hear about. */
export function detectAlerts(w: World, playerId: AgentId, before: AlertMemory): Alert[] {
  const now = rememberForAlerts(w, playerId);
  const alerts: Alert[] = [];
  for (const c of Object.keys(CHOKEPOINTS) as ChokepointName[]) {
    const status = now.chokepoints[c];
    if (status === before.chokepoints[c]) continue;
    alerts.push({ tick: w.tick, severity: STATUS_SEVERITY[status], message: `The ${CHOKEPOINTS[c].displayName} ${STATUS_WORDS[status]}.` });
  }
  if (now.playerInsolvent && !before.playerInsolvent) {
    alerts.push({ tick: w.tick, severity: 'CRITICAL', message: 'Your company has run out of cash and credit. It cannot buy until cash recovers.' });
  }
  if (now.playerPlantDown && !before.playerPlantDown) {
    alerts.push({ tick: w.tick, severity: 'HIGH', message: 'Your refinery has broken down and stopped running.' });
  }
  // A well stopping is worth hearing about: the board shows it, but only if you are looking.
  if (now.wellsDown > before.wellsDown) {
    const started = now.wellsDown - before.wellsDown;
    alerts.push({
      tick: w.tick,
      severity: now.wellsDown >= 3 ? 'HIGH' : 'MEDIUM',
      message: `${started === 1 ? 'A well has' : `${started} wells have`} stopped and ${started === 1 ? 'is' : 'are'} waiting on a workover crew`
        + `${now.wellsDown > started ? `; ${now.wellsDown} are down in all` : ''}.`,
    });
  }
  return alerts;
}

/** True if this alert should stop the clock for a player who pauses at `threshold`. */
export function pausesAt(alert: Alert, threshold: Severity): boolean {
  return alert.severity === 'CRITICAL' || SEVERITIES.indexOf(alert.severity) >= SEVERITIES.indexOf(threshold);
}
