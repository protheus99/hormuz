// The event deck (spec G7.1): one profile per chokepoint, at Normal difficulty, and the news that
// each stage prints. Wording follows D32: faceless, non-violent, places only. Numbers are Phase 12
// placeholders.

export type Stage = 'RUMOR' | 'TENSION' | 'DISRUPTION' | 'RECOVERY';
export type Range = readonly [number, number];

export interface Disruption {
  readonly status: 'CLOSED' | 'DELAYED';
  readonly days: Range;
  /** Extra days a DELAYED crossing takes. */
  readonly delay: Range;
}

export interface EventProfile {
  /** Events a year at Normal. */
  readonly rate: number;
  /** Day-of-year window the event can start in (inclusive, may wrap), or null for any time. */
  readonly season: Range | null;
  /** Sudden events skip the rumour and are always short (deck rule 1). */
  readonly sudden: boolean;
  /** Days at TENSION, or null when the event goes straight to disruption. */
  readonly tension: Range | null;
  /** $/bbl war-risk surcharge while tense or disrupted. */
  readonly surcharge: number;
  /** Chance a tension becomes a disruption; otherwise it fades. */
  readonly escalate: number;
  /** The disruption, or a choice of two with the first's share. */
  readonly disruption: Disruption;
  readonly alternative: { readonly share: number; readonly disruption: Disruption } | null;
  /** Days of lingering delays after a closure, or null. */
  readonly recovery: Range | null;
}

const closed = (days: Range): Disruption => ({ status: 'CLOSED', days, delay: [0, 0] });
const delayed = (days: Range, delay: Range): Disruption => ({ status: 'DELAYED', days, delay });

export const EVENT_PROFILES = {
  HORMUZ: { rate: 0.4, season: null, sudden: false, tension: [20, 60], surcharge: 2.0, escalate: 0.25, disruption: closed([15, 45]), alternative: null, recovery: [5, 10] },
  BAB_EL_MANDEB: { rate: 0.5, season: null, sudden: false, tension: [20, 40], surcharge: 1.5, escalate: 0.3, disruption: closed([30, 90]), alternative: null, recovery: [5, 10] },
  SUEZ: { rate: 0.3, season: null, sudden: true, tension: null, surcharge: 0, escalate: 1, disruption: closed([5, 10]), alternative: { share: 0.5, disruption: delayed([5, 15], [2, 5]) }, recovery: null },
  MALACCA: { rate: 0.5, season: null, sudden: true, tension: null, surcharge: 0, escalate: 1, disruption: delayed([5, 20], [3, 6]), alternative: null, recovery: null },
  BOSPHORUS: { rate: 0.8, season: null, sudden: true, tension: null, surcharge: 0, escalate: 1, disruption: closed([2, 10]), alternative: { share: 0.5, disruption: delayed([2, 10], [1, 3]) }, recovery: null },
  DANISH_STRAITS: { rate: 0.5, season: [335, 59], sudden: true, tension: null, surcharge: 0, escalate: 1, disruption: delayed([10, 40], [3, 8]), alternative: null, recovery: null },
  PANAMA: { rate: 0.5, season: [0, 119], sudden: false, tension: [5, 15], surcharge: 1.5, escalate: 1, disruption: delayed([30, 120], [2, 4]), alternative: null, recovery: null },
} as const satisfies Record<string, EventProfile>;

/** Pairs the deck never disrupts together on Easy or Normal: one is the other's way around (rule 2). */
export const BYPASS_CONFLICTS: readonly (readonly [string, string])[] = [
  ['HORMUZ', 'BAB_EL_MANDEB'],
  ['DANISH_STRAITS', 'BOSPHORUS'],
];

// ─── News ────────────────────────────────────────────────────────────────────────────────────

export interface NewsText {
  readonly headline: string;
  readonly body: string;
}

type StageNews = Readonly<Partial<Record<Stage | 'DELAYED' | 'CLOSED' | 'CLEARED', NewsText>>>;

/** Per-chokepoint wording; {name} is the strait's display name. */
const STRAIT_NEWS: Readonly<Record<string, StageNews>> = {
  HORMUZ: {
    RUMOR: { headline: 'Shipping insurers watch the Strait of Hormuz', body: 'Reports of security concerns near the strait. Nothing has changed yet, but traders are nervous.' },
    TENSION: { headline: 'Insurers raise costs in the Strait of Hormuz', body: 'War-risk cover now costs more for every tanker leaving the Gulf. Some buyers are looking elsewhere.' },
    CLOSED: { headline: 'Shipping through the Strait of Hormuz is suspended', body: 'Insurers have withdrawn cover. Tankers wait at the entry; the bypass pipelines are the only way out of the Gulf.' },
  },
  BAB_EL_MANDEB: {
    RUMOR: { headline: 'Security concerns in the southern Red Sea', body: 'Shipping companies are reviewing routes past Bab el-Mandeb.' },
    TENSION: { headline: 'Costs rise for ships passing Bab el-Mandeb', body: 'Insurers charge more for the southern Red Sea. Some owners are sending ships around Africa.' },
    CLOSED: { headline: 'Ships avoid Bab el-Mandeb entirely', body: 'Traffic between the Red Sea and the Indian Ocean has stopped. Cargo goes around the Cape, about two weeks longer.' },
  },
  SUEZ: {
    CLOSED: { headline: 'A grounded vessel blocks the Suez Canal', body: 'Ships queue at both ends while salvage crews work.' },
    DELAYED: { headline: 'Canal works slow traffic through Suez', body: 'Crossings take several days longer than usual.' },
  },
  MALACCA: {
    DELAYED: { headline: 'Congestion in the Strait of Malacca', body: 'Poor visibility and heavy traffic slow crossings into East Asia.' },
  },
  BOSPHORUS: {
    CLOSED: { headline: 'Fog closes the Bosphorus', body: 'No tankers can pass between the Black Sea and the Mediterranean.' },
    DELAYED: { headline: 'Storms slow the Bosphorus', body: 'Tankers wait for safe passage through the strait.' },
  },
  DANISH_STRAITS: {
    DELAYED: { headline: 'Ice and storms slow the Danish Straits', body: 'Winter weather delays tankers leaving the Baltic.' },
  },
  PANAMA: {
    RUMOR: { headline: 'Water levels fall in the Panama Canal', body: 'Forecasts point to a dry season. Heavy ships may soon face limits.' },
    TENSION: { headline: 'Panama Canal limits heavy ships', body: 'Draft limits and higher fees for tankers crossing to the Pacific.' },
    DELAYED: { headline: 'Long waits at the Panama Canal', body: 'Low water cuts daily crossings. Some cargo goes the long way round.' },
  },
};

const GENERIC: StageNews = {
  RUMOR: { headline: 'Concerns grow over the {name}', body: 'Traders are watching closely.' },
  TENSION: { headline: 'Costs rise in the {name}', body: 'Insurers charge more to cross.' },
  CLOSED: { headline: 'Shipping through the {name} is suspended', body: 'Cargo waits for the strait to reopen.' },
  DELAYED: { headline: 'Delays in the {name}', body: 'Crossings take longer than usual.' },
  RECOVERY: { headline: 'The {name} reopens slowly', body: 'Ships are moving again, with some delays while the queue clears.' },
  CLEARED: { headline: 'Traffic is back to normal in the {name}', body: 'Crossings are running on schedule again.' },
};

/** News when an event enters a stage (or clears). `status` picks the disruption wording. */
export function strait(chokepoint: string, name: string, stage: Stage | 'CLEARED', status: 'CLOSED' | 'DELAYED' | null): NewsText {
  const key = stage === 'DISRUPTION' ? (status ?? 'CLOSED') : stage;
  const t = STRAIT_NEWS[chokepoint]?.[key] ?? GENERIC[key] ?? { headline: '{name}', body: '' };
  return { headline: t.headline.replace('{name}', name), body: t.body.replace('{name}', name) };
}

/**
 * A recession (§12A.8, B). The other half of making a bust possible: mean reversion was slowed so a
 * bad price can stay bad, and this is what makes one bad in the first place. Demand for fuel falls,
 * refiners pay less for crude because their product is worth less, and everybody's margin goes with
 * it. It is a deep cut that fades over months rather than an event that is over in a fortnight.
 */
export const RECESSION = {
  /** Chance a day. About once in six years: a career sees one or two, a tutorial almost never. */
  rate: 1 / (6 * 365),
  /** How far fuel demand falls, as a share. It fades back at THETA, which is now a 69-day half-life. */
  depth: 0.25,
} as const;

export const RECESSION_NEWS: NewsText = {
  headline: 'Fuel demand falls as the economy turns',
  body: 'Refiners are cutting runs, and what they will pay for crude is going with it. Nobody expects '
    + 'this back within the quarter.',
};

/** News when a crude price moves sharply. */
export function priceMove(grade: string, change: number, days: number): NewsText {
  const up = change > 0;
  const size = `${Math.round(Math.abs(change) * 100)}%`;
  return {
    headline: `${grade} ${up ? 'jumps' : 'falls'} ${size} in ${days} days`,
    body: up ? 'Buyers are paying more to secure supply.' : 'Sellers are struggling to find buyers.',
  };
}
