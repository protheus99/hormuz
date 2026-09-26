// The chokepoints (spec §3.5). Their lanes arrive with data/lanes.ts in Phase 4; their event
// profiles with the event deck in Phase 11 (spec G7.1).
//
// Seven of them are political: somebody closes them, and the event deck decides when. Three are not
// - the Gulf of Mexico and the two great capes are shut by **weather conditions**, which is a
// different thing from the **economic climate** and is deliberately named apart from it. The climate
// is what the market is doing (§12A.8, B); weather conditions are what the sea is doing.

/** When bad weather is likeliest, as days of the year, and how often it comes. */
export interface StormSeason {
  /** First and last day of the worst months, inclusive. A first day after the last wraps the year. */
  readonly season: readonly [number, number];
  /** Chance on any day in season that a storm sets in. Out of season it is WEATHER.OFF_SEASON of this. */
  readonly odds: number;
  /**
   * The worst the weather may do here. 'CLOSED' where the sea can stop everything; 'DELAYED' where
   * §14.6 forbids it, because closing this passage would strand a region - no single closure may cut
   * a region out of the game, and the Gulf of Mexico has only one modelled way out.
   */
  readonly worst: 'CLOSED' | 'DELAYED';
}

export interface ChokepointData {
  readonly displayName: string;
  /** Set where the sea, rather than a government, is what closes the passage. */
  readonly weather?: StormSeason;
}

export const CHOKEPOINTS = {
  HORMUZ: { displayName: 'Strait of Hormuz' },
  BAB_EL_MANDEB: { displayName: 'Bab el-Mandeb' },
  SUEZ: { displayName: 'Suez Canal' },
  MALACCA: { displayName: 'Strait of Malacca' },
  BOSPHORUS: { displayName: 'Bosphorus' },
  DANISH_STRAITS: { displayName: 'Danish Straits' },
  PANAMA: { displayName: 'Panama Canal' },
  // Hurricane season runs June to November, and a storm in the Gulf shuts the loading berths at
  // Houston and Campeche as surely as a blockade would. This is the only sea exit from the Gulf,
  // so it is a hard cut while it lasts - which is what a hurricane is.
  // A hurricane congests the Gulf; it never seals it. In life there are two ways out - the Yucatán
  // Channel and the Straits of Florida - and only one is modelled, so sealing this one would
  // strand Houston and Campeche, which §14.6 forbids. Congestion still halves what gets out.
  GULF_OF_MEXICO: { displayName: 'Gulf of Mexico', weather: { season: [152, 334], odds: 1 / 40, worst: 'DELAYED' } },
  // Rounding Africa. Worst in the southern winter, and the Agulhas current meeting a southwesterly
  // gale is the classic way to lose a tanker's deck cargo.
  CAPE_OF_GOOD_HOPE: { displayName: 'Cape of Good Hope', weather: { season: [121, 273], odds: 1 / 55, worst: 'CLOSED' } },
  // Rounding South America, and the worst water a loaded ship crosses anywhere. Also the only way
  // between the Atlantic and the Pacific that is not the Panama Canal.
  CAPE_HORN: { displayName: 'Cape Horn', weather: { season: [121, 243], odds: 1 / 30, worst: 'CLOSED' } },
} as const satisfies Record<string, ChokepointData>;

export type ChokepointName = keyof typeof CHOKEPOINTS;

/**
 * When bad weather is likeliest at a passage, or undefined where the sea is not what closes it.
 * `as const` narrows each entry to its own literal type, which is worth keeping for the names - so
 * the wider question is asked here, once, rather than cast at every call site.
 */
export const stormSeasonOf = (name: ChokepointName): StormSeason | undefined =>
  (CHOKEPOINTS[name] as ChokepointData).weather;
export const CHOKEPOINT_NAMES = Object.keys(CHOKEPOINTS) as ChokepointName[];
