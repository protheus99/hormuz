// The campaign (spec G7.2): three scenarios per play type and a finale. Each is data: a starting
// company, a script of events, one main goal made of conditions, two or three milestones with small
// rewards, and a time limit. Dollar targets are Phase 12 placeholders.

import type { ChokepointName } from '../data/chokepoints';
import type { RegionName } from '../data/regions';
import type { Action } from '../engine/actions';
import type { ScheduledEvent } from '../engine/world';
import type { Stage } from './events';

export type ScenarioId = 'P1' | 'P2' | 'P3' | 'R1' | 'R2' | 'R3' | 'T1' | 'T2' | 'T3' | 'FINALE';

/** The seven goal types (spec G7.2), plus the milestone checks. */
export type Condition =
  /** Net worth at the end, as a multiple of the starting net worth (1 = no worse than the start). */
  | { readonly kind: 'NET_WORTH'; readonly times: number }
  | { readonly kind: 'PROFIT'; readonly atLeast: number; readonly from?: number; readonly to?: number }
  | { readonly kind: 'PROFITABLE_MONTHS'; readonly months: number }
  | { readonly kind: 'STOCKOUT_DAYS'; readonly atMost: number }
  | { readonly kind: 'SOLVENT' }
  | { readonly kind: 'OWN'; readonly what: 'DEAL' | 'OFFICES' | 'TIER' | 'INTEGRATED' | 'DRILLING' | 'RESERVATION' | 'REPORT' | 'LEASE'; readonly atLeast: number; readonly by?: number }
  | { readonly kind: 'AHEAD_OF'; readonly rival: string }
  /** Finish within the first `places` companies of your own type, by profit per barrel of capacity. */
  | { readonly kind: 'RANK_TOP'; readonly places: number }
  | { readonly kind: 'EXPORT_SHARE'; readonly chokepoint: ChokepointName; readonly atLeast: number }
  | { readonly kind: 'MAX_HELD_DAYS'; readonly atMost: number };

export type Reward = { readonly cash: number } | { readonly report: true };

export interface Milestone {
  readonly label: string;
  readonly condition: Condition;
  readonly reward: Reward;
}

export interface ScriptedStage {
  readonly stage: Stage;
  readonly days: number;
  readonly status: 'TENSION' | 'DELAYED' | 'CLOSED' | null;
  readonly delay?: number;
  readonly surcharge?: number;
}

export type ScriptEntry =
  | { readonly tick: number; readonly chokepoint: ChokepointName; readonly stages: readonly ScriptedStage[] }
  | { readonly tick: number; readonly engine: ScheduledEvent; readonly news?: { readonly headline: string; readonly body: string } }
  | { readonly tick: number; readonly company: string; readonly action: Action; readonly news?: { readonly headline: string; readonly body: string } };

export interface ScenarioData {
  readonly id: ScenarioId;
  readonly title: string;
  readonly blurb: string;
  readonly tutorial: boolean;
  /** Campaign difficulty for the always-No / always-Yes checks (G4.7). */
  readonly level: 'EASY' | 'MEDIUM' | 'HARD';
  /** Null for the finale, which is played as any type. */
  readonly playType: 'PRODUCER' | 'REFINER' | 'TRADER' | null;
  readonly region: RegionName | null;
  readonly lengthDays: number;
  readonly difficulty: 'EASY' | 'NORMAL' | 'HARD';
  readonly randomEvents: boolean;
  /** Starting changes. `stockDays` fills the refinery's tanks (enlarged if need be) with that many days of crude. */
  readonly setup?: { readonly cash?: number; readonly techTier?: 1 | 2 | 3; readonly secondOffice?: RegionName; readonly stockDays?: number };
  readonly script: readonly ScriptEntry[];
  readonly goalText: string;
  readonly goal: readonly Condition[];
  readonly milestones: readonly Milestone[];
}

/** A full Hormuz cycle: warning, tension, closure, recovery. */
const hormuzCycle = (tick: number, closure: number): ScriptEntry => ({
  tick, chokepoint: 'HORMUZ', stages: [
    { stage: 'RUMOR', days: 10, status: null },
    { stage: 'TENSION', days: 30, status: 'TENSION', surcharge: 2 },
    { stage: 'DISRUPTION', days: closure, status: 'CLOSED', surcharge: 2 },
    { stage: 'RECOVERY', days: 10, status: 'DELAYED', delay: 2 },
  ],
});

export const SCENARIOS: readonly ScenarioData[] = [
  {
    id: 'P1', title: 'First Oil', tutorial: true, level: 'EASY', playType: 'PRODUCER', region: 'US_Permian', lengthDays: 180, difficulty: 'EASY', randomEvents: false,
    blurb: 'You own a small field in the Permian Basin. Learn to sell your crude and keep your wells pumping.',
    script: [],
    goalText: 'Make a profit three months in a row, and sign one deal.',
    goal: [{ kind: 'PROFITABLE_MONTHS', months: 3 }, { kind: 'OWN', what: 'DEAL', atLeast: 1 }],
    milestones: [
      { label: 'Sign a deal in your first two months', condition: { kind: 'OWN', what: 'DEAL', atLeast: 1, by: 60 }, reward: { cash: 250_000 } },
      { label: 'Drill new wells', condition: { kind: 'OWN', what: 'DRILLING', atLeast: 1 }, reward: { report: true } },
    ],
  },
  {
    id: 'P2', title: 'Shale Glut', tutorial: false, level: 'MEDIUM', playType: 'PRODUCER', region: 'US_Permian', lengthDays: 365, difficulty: 'NORMAL', randomEvents: false,
    blurb: 'Your rivals are drilling hard and light crude is sliding. Low water at Panama slows exports to Asia.',
    script: [
      { tick: 20, company: 'Boreal_Shale', action: { kind: 'START_PROJECT', project: 'DRILL', steps: 4 }, news: { headline: 'Permian drillers race to add wells', body: 'New wells will add light crude to an already busy market.' } },
      { tick: 25, company: 'Demerara_Offshore', action: { kind: 'START_PROJECT', project: 'DRILL', steps: 3 } },
      { tick: 60, chokepoint: 'PANAMA', stages: [
        { stage: 'RUMOR', days: 10, status: null }, { stage: 'TENSION', days: 10, status: 'TENSION', surcharge: 1.5 },
        { stage: 'DISRUPTION', days: 100, status: 'DELAYED', delay: 3, surcharge: 1.5 },
      ] },
      { tick: 90, engine: { tick: 90, kind: 'PRODUCT_SHOCK', product: 'GASOLINE', pct: -0.12, persistent: true }, news: { headline: 'Gasoline prices slide on weak demand', body: 'Refiners pay less for light crude.' } },
    ],
    goalText: 'End the year with 3.15 times the net worth you started with.',
    goal: [{ kind: 'NET_WORTH', times: 3.15 }],
    milestones: [
      { label: 'Lock in a deal before day 90', condition: { kind: 'OWN', what: 'DEAL', atLeast: 1, by: 90 }, reward: { cash: 500_000 } },
      { label: 'Stay solvent all year', condition: { kind: 'SOLVENT' }, reward: { report: true } },
    ],
  },
  {
    id: 'P3', title: 'Gulf Giant', tutorial: false, level: 'HARD', playType: 'PRODUCER', region: 'Middle_East', lengthDays: 365, difficulty: 'NORMAL', randomEvents: false,
    blurb: 'You pump crude in the Persian Gulf. Trouble is brewing in the Strait of Hormuz.',
    script: [
      { tick: 5, engine: { tick: 5, kind: 'PIPELINE_CAPACITY', edgeId: 'bypass_red_sea', capacity: 1_500 }, news: { headline: 'Repairs cut flows on the pipelines around Hormuz', body: 'Both bypass pipelines run at a fraction of their capacity this year.' } },
      { tick: 5, engine: { tick: 5, kind: 'PIPELINE_CAPACITY', edgeId: 'bypass_oman', capacity: 500 } },
      hormuzCycle(40, 35),
    ],
    goalText: 'Keep at least half your output flowing while Hormuz is closed, and earn more per barrel of capacity than Qasr Petroleum.',
    goal: [{ kind: 'EXPORT_SHARE', chokepoint: 'HORMUZ', atLeast: 0.5 }, { kind: 'AHEAD_OF', rival: 'Qasr_Petroleum' }],
    milestones: [
      { label: 'Reserve bypass pipeline space', condition: { kind: 'OWN', what: 'RESERVATION', atLeast: 1 }, reward: { cash: 500_000 } },
      { label: 'Sign a deal', condition: { kind: 'OWN', what: 'DEAL', atLeast: 1 }, reward: { report: true } },
    ],
  },
  {
    // Southeast Asia has light crude of its own and sits on the Strait of Malacca: a first game
    // should have supply within reach, and the disruption still lands on the player's doorstep.
    id: 'R1', title: 'Keep the Lights On', tutorial: true, level: 'EASY', playType: 'REFINER', region: 'Southeast_Asia', lengthDays: 90, difficulty: 'EASY', randomEvents: false,
    setup: { techTier: 1, stockDays: 30 },
    blurb: 'You run a small light-crude refinery in Southeast Asia. Keep it supplied and running.',
    script: [{ tick: 30, chokepoint: 'MALACCA', stages: [{ stage: 'DISRUPTION', days: 10, status: 'DELAYED', delay: 4 }] }],
    // A tutorial teaches one thing: line up your own supply. A day's grace on the tanks, because a
    // single dry day should not end a first game, but a deal is what actually keeps them full.
    // A small plant twenty days from its crude runs dry for a day here and there whatever the
    // player does, so a first game is not judged on that: line up supply, and stay solvent.
    goalText: 'Sign a supply deal, and stay solvent.',
    goal: [{ kind: 'OWN', what: 'DEAL', atLeast: 1 }, { kind: 'SOLVENT' }],
    milestones: [
      { label: 'Sign a supply deal', condition: { kind: 'OWN', what: 'DEAL', atLeast: 1 }, reward: { cash: 250_000 } },
      { label: 'Buy a market report', condition: { kind: 'OWN', what: 'REPORT', atLeast: 1 }, reward: { cash: 25_000 } },
    ],
  },
  {
    id: 'R2', title: 'Winter Diesel', tutorial: false, level: 'MEDIUM', playType: 'REFINER', region: 'Southern_Europe', lengthDays: 365, difficulty: 'NORMAL', randomEvents: false,
    setup: { stockDays: 30 },
    blurb: 'Diesel will be scarce this winter, just as fog and storms slow the Bosphorus.',
    script: [
      { tick: 275, engine: { tick: 275, kind: 'PRODUCT_SHOCK', product: 'DIESEL', pct: 0.25, persistent: false }, news: { headline: 'Diesel prices climb as winter nears', body: 'Distributors are paying more to fill their tanks.' } },
      { tick: 285, chokepoint: 'BOSPHORUS', stages: [{ stage: 'DISRUPTION', days: 8, status: 'CLOSED' }] },
      { tick: 320, chokepoint: 'BOSPHORUS', stages: [{ stage: 'DISRUPTION', days: 15, status: 'DELAYED', delay: 3 }] },
    ],
    goalText: 'Make a profit of at least $3M in the last quarter, with no more than 2 days out of crude.',
    // Three seeds each: a refiner who answers by the meters makes $3.63M, $5.66M and $7.50M in the
    // last quarter, one who answers nothing $2.06M at best. $1M was inside the idle bot's range.
    goal: [{ kind: 'PROFIT', atLeast: 3_000_000, from: 274, to: 365 }, { kind: 'STOCKOUT_DAYS', atMost: 2 }],
    milestones: [
      { label: 'Sign a supply deal', condition: { kind: 'OWN', what: 'DEAL', atLeast: 1 }, reward: { cash: 500_000 } },
      { label: 'Upgrade to Tier 3', condition: { kind: 'OWN', what: 'TIER', atLeast: 3 }, reward: { report: true } },
    ],
  },
  {
    id: 'R3', title: 'Locked In', tutorial: false, level: 'HARD', playType: 'REFINER', region: 'South_Asia', lengthDays: 365, difficulty: 'NORMAL', randomEvents: false,
    setup: { techTier: 3, stockDays: 30 },
    blurb: 'Your refinery runs on Gulf crude under a fixed deal. Then the Strait of Hormuz closes.',
    script: [
      { tick: 1, company: 'player', action: { kind: 'SIGN_DEAL', terms: { sellerId: 'Qasr_Petroleum' as never, buyerId: 'player' as never, grade: 'MEDIUM', originRegion: 'Middle_East', deliveryRegion: 'South_Asia', qtyPerDay: 2000, termDays: 90, price: 70, avoidChokepoints: [] } } },
      hormuzCycle(25, 40),
    ],
    goalText: 'No more than 5 days out of crude, and end the year 15% above the net worth you started with.',
    // Merely ending where you began was free: the idle bot managed ×1.00, ×1.02 and ×1.03 without
    // answering a card, so only the stockout condition was ever doing any work. The meter-led bot
    // makes ×1.05, ×1.40 and ×1.28.
    goal: [{ kind: 'STOCKOUT_DAYS', atMost: 5 }, { kind: 'NET_WORTH', times: 1.15 }],
    milestones: [
      { label: 'Stay solvent', condition: { kind: 'SOLVENT' }, reward: { report: true } },
      { label: 'Sign a second supply deal', condition: { kind: 'OWN', what: 'DEAL', atLeast: 2 }, reward: { cash: 500_000 } },
    ],
  },
  {
    id: 'T1', title: 'Buy Low', tutorial: true, level: 'EASY', playType: 'TRADER', region: 'North_Sea', lengthDays: 90, difficulty: 'EASY', randomEvents: false,
    setup: { cash: 2_000_000 },
    blurb: 'You have one office in the North Sea and $2M. A grounded ship is about to block Suez.',
    script: [{ tick: 30, chokepoint: 'SUEZ', stages: [{ stage: 'DISRUPTION', days: 7, status: 'CLOSED' }] }],
    // Likewise: the trader tutorial teaches buying low and spreading out, not hitting a number that
    // today's trading economics cannot reliably reach (QUESTIONS.md, question 3).
    goalText: 'Open a second office, and stay solvent.',
    goal: [{ kind: 'OWN', what: 'OFFICES', atLeast: 2 }, { kind: 'SOLVENT' }],
    milestones: [
      { label: 'Buy a market report', condition: { kind: 'OWN', what: 'REPORT', atLeast: 1 }, reward: { cash: 25_000 } },
      { label: 'Open your second office by day 45', condition: { kind: 'OWN', what: 'OFFICES', atLeast: 2, by: 45 }, reward: { cash: 100_000 } },
    ],
  },
  {
    id: 'T2', title: 'Contango', tutorial: false, level: 'MEDIUM', playType: 'TRADER', region: 'Coastal_Asia', lengthDays: 120, difficulty: 'NORMAL', randomEvents: false,
    // A second office in South Asia: the glut is in East Asia, so the crude has to go somewhere else
    // to be worth anything, and buying into the glut alone cannot pay (Phase 12).
    setup: { secondOffice: 'South_Asia' },
    blurb: 'East Asia’s largest refinery is about to go down for weeks. Its crude will need a home.',
    script: [
      // The outage lands early and clears with two months left: the glut is what the player buys
      // into, and the restart is what they sell into (Phase 12).
      { tick: 5, engine: { tick: 5, kind: 'PLANT_ONLINE', agentId: 'Huanghai_Petrochem', online: false }, news: { headline: 'A major East Asian refinery shuts for repairs', body: 'Cargoes bound for it are looking for other buyers.' } },
      { tick: 55, engine: { tick: 55, kind: 'PLANT_ONLINE', agentId: 'Huanghai_Petrochem', online: true }, news: { headline: 'The East Asian refinery restarts', body: 'Demand for crude in the region recovers.' } },
    ],
    goalText: 'Make $900K profit from the outage.',
    // Measured over six seeds rather than one: a trader who answers nothing makes $-0.07M to $0.79M
    // here, and one who answers by the meters $0.01M to $1.68M. A bar of $0.75M sat inside the idle
    // bot's range, so on the kindest seed doing nothing won (2026-09-24).
    goal: [{ kind: 'PROFIT', atLeast: 900_000 }],
    milestones: [
      { label: 'Lease extra storage', condition: { kind: 'OWN', what: 'LEASE', atLeast: 1 }, reward: { cash: 100_000 } },
      { label: 'Stay solvent', condition: { kind: 'SOLVENT' }, reward: { report: true } },
    ],
  },
  {
    id: 'T3', title: 'The Long Way Round', tutorial: false, level: 'HARD', playType: 'TRADER', region: 'Southern_Europe', lengthDays: 180, difficulty: 'NORMAL', randomEvents: false,
    setup: { secondOffice: 'South_Asia' },
    blurb: 'The southern Red Sea is closed to shipping. Every cargo between Europe and Asia goes around Africa.',
    script: [{ tick: 3, chokepoint: 'BAB_EL_MANDEB', stages: [{ stage: 'DISRUPTION', days: 170, status: 'CLOSED', surcharge: 1.5 }] }],
    goalText: 'Make $1M profit, with no cargo held at sea for more than 10 days.',
    goal: [{ kind: 'PROFIT', atLeast: 1_000_000 }, { kind: 'MAX_HELD_DAYS', atMost: 10 }],
    milestones: [
      { label: 'Open a third office', condition: { kind: 'OWN', what: 'OFFICES', atLeast: 3 }, reward: { cash: 250_000 } },
      { label: 'Stay solvent', condition: { kind: 'SOLVENT' }, reward: { report: true } },
    ],
  },
  {
    id: 'FINALE', title: 'The Strait', tutorial: false, level: 'HARD', playType: null, region: null, lengthDays: 1095, difficulty: 'NORMAL', randomEvents: true,
    blurb: 'Three years. A full Hormuz crisis, another strait in trouble without warning, and everything else the market throws at you.',
    script: [hormuzCycle(400, 40)],
    goalText: 'Finish in the top three of your type, by profit per barrel of capacity (traders: by growth).',
    goal: [{ kind: 'RANK_TOP', places: 3 }],
    milestones: [
      { label: 'Stay solvent for three years', condition: { kind: 'SOLVENT' }, reward: { report: true } },
      { label: 'Double your net worth', condition: { kind: 'NET_WORTH', times: 2 }, reward: { cash: 1_000_000 } },
    ],
  },
];

export const SCENARIO_BY_ID: ReadonlyMap<ScenarioId, ScenarioData> = new Map(SCENARIOS.map((s) => [s.id, s]));
