// The seven chokepoints (spec §3.5). Their lanes arrive with data/lanes.ts in Phase 4;
// their event profiles with the event deck in Phase 11 (spec G7.1).

export interface ChokepointData {
  readonly displayName: string;
}

export const CHOKEPOINTS = {
  HORMUZ: { displayName: 'Strait of Hormuz' },
  BAB_EL_MANDEB: { displayName: 'Bab el-Mandeb' },
  SUEZ: { displayName: 'Suez Canal' },
  MALACCA: { displayName: 'Strait of Malacca' },
  BOSPHORUS: { displayName: 'Bosphorus' },
  DANISH_STRAITS: { displayName: 'Danish Straits' },
  PANAMA: { displayName: 'Panama Canal' },
} as const satisfies Record<string, ChokepointData>;

export type ChokepointName = keyof typeof CHOKEPOINTS;
export const CHOKEPOINT_NAMES = Object.keys(CHOKEPOINTS) as ChokepointName[];
