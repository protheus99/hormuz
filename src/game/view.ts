// What a player may see (spec G5, G9 rule 4). The view is built inside the game layer from the
// world, copying out only public information and the player's own company, so a server could send
// each player their own view and nothing else. Rivals appear by name, type and region only.

import { CHOKEPOINTS, type ChokepointName } from '../data/chokepoints';
import { NODE_NAMES, type NodeName } from '../data/nodes';
import type { RegionName } from '../data/regions';
import { plantOf, plantsOf, wellOf } from '../engine/companies';
import type { PlantState } from '../engine/model';
import type { ChokepointStatus, Grade, Product } from '../engine/enums';
import type { AgentId, CompanySettings, DealId } from '../engine/model';
import { netWorth, type World } from '../engine/world';
import type { Alert } from './alerts';
import type { Card, CardType } from './cards/types';
import type { CampaignView } from './campaign';

/** What the view needs from the advisor: this player's cards, Opportunities and reports. */
export interface CardsView {
  readonly cards: readonly Card[];
  readonly opportunities: readonly { readonly type: CardType; readonly title: string }[];
  readonly reports: readonly { readonly tick: number; readonly asOf: number; readonly byRegion: Readonly<Partial<Record<string, number>>> }[];
  /** News, newest first (spec G7.1). */
  readonly news: readonly { readonly tick: number; readonly headline: string; readonly body: string }[];
  /** The campaign scenario's goal and milestones, or null in Sandbox (spec G7.2). */
  readonly campaign: CampaignView | null;
}

/** One day of public prices, kept by the session for charts. */
export interface DailyPrices {
  readonly tick: number;
  readonly markers: Readonly<Record<NodeName, number>>;
  readonly products: Readonly<Record<Product, number>>;
}

export interface MarketView {
  readonly node: NodeName;
  readonly grade: Grade;
  readonly marker: number;
  /** Previous close by origin, and each origin's unsold offer (spec §8 rule 7). */
  readonly closes: Readonly<Partial<Record<RegionName, number>>>;
  readonly offers: Readonly<Partial<Record<RegionName, number>>>;
}

export interface OwnCompanyView {
  readonly id: AgentId;
  readonly name: string;
  readonly kind: string;
  readonly region: RegionName;
  readonly settings: CompanySettings;
  readonly cash: number;
  readonly creditLimit: number;
  readonly creditDrawn: number;
  readonly insolvent: boolean;
  /** Cash + inventory at markers + depreciated capital assets − credit drawn (spec G6). */
  readonly netWorth: number;
  /** Capital projects under way. */
  readonly projects: readonly { readonly kind: string; readonly daysLeft: number; readonly dailyCost: number; readonly paused: boolean }[];
  readonly well: null | { readonly grade: Grade; readonly capacity: number; readonly storage: number; readonly storageCapacity: number; readonly outputRate: number; readonly shutIn: boolean };
  readonly plant: null | PlantView;
  /** Every refinery the company runs: one, or two once it builds a second site (D34). */
  readonly sites: readonly PlantView[];
  readonly hubs: readonly { readonly region: RegionName; readonly capacity: number; readonly stock: Readonly<Record<Grade, number>> }[];
}

export interface PlantView {
  readonly region: RegionName;
  readonly techTier: number;
  readonly capacity: number;
  readonly runRate: number;
  readonly online: boolean;
  readonly stock: Readonly<Record<Grade, number>>;
  readonly tankCapacity: number;
  readonly inbound: number;
  readonly offlineDays: number;
  readonly daysSinceMaintenance: number;
}

export interface PlayerView {
  readonly tick: number;
  /** Game length in days, or null for an endless game. */
  readonly lengthDays: number | null;
  readonly company: OwnCompanyView;
  readonly markets: readonly MarketView[];
  readonly products: Readonly<Record<Product, number>>;
  readonly history: readonly DailyPrices[];
  readonly chokepoints: readonly { readonly name: ChokepointName; readonly displayName: string; readonly status: ChokepointStatus }[];
  readonly pipelines: readonly { readonly id: string; readonly capacity: number; readonly usedToday: number }[];
  readonly deals: readonly {
    readonly id: DealId; readonly role: 'BUYER' | 'SELLER'; readonly partner: string; readonly grade: Grade;
    readonly qtyPerDay: number; readonly price: number; readonly endTick: number; readonly status: string;
  }[];
  readonly cargo: readonly { readonly grade: Grade; readonly qty: number; readonly destination: RegionName; readonly status: string; readonly daysAtSea: number }[];
  /** Public identity only: rival cash, stock, deals and orders stay hidden (spec G5). */
  readonly rivals: readonly { readonly name: string; readonly kind: string; readonly region: RegionName }[];
  readonly alerts: readonly Alert[];
  /** Open decision cards, raised and opened (spec G4.1). */
  readonly cards: readonly Card[];
  /** Opportunities the player could open today. */
  readonly opportunities: CardsView['opportunities'];
  /** Market reports bought (spec G5). */
  readonly reports: CardsView['reports'];
  readonly news: CardsView['news'];
  readonly campaign: CardsView['campaign'];
}

const siteView = (p: PlantState): PlantView => ({
  region: p.region, techTier: p.techTier, capacity: p.processingCapacity, runRate: p.utilization, online: p.online,
  stock: { ...p.crudeStock }, tankCapacity: p.crudeStorageCapacity, inbound: p.inboundBarrels,
  offlineDays: Math.max(p.outageTicksRemaining, p.maintenanceTicksRemaining), daysSinceMaintenance: p.daysSinceMaintenance,
});

export function buildPlayerView(
  w: World, playerId: AgentId, history: readonly DailyPrices[], alerts: readonly Alert[], lengthDays: number | null, cards: CardsView,
): PlayerView {
  const me = w.agents.find((a) => a.agentId === playerId);
  if (me === undefined) throw new Error(`No company ${playerId} in this game`);
  const well = wellOf(me);
  const plant = plantOf(me);
  const names = new Map(w.agents.map((a) => [a.agentId, a.name]));

  const company: OwnCompanyView = {
    id: me.agentId, name: me.name, kind: me.kind, region: me.region, settings: { ...me.settings },
    cash: me.cash, creditLimit: me.creditLimit, creditDrawn: me.creditDrawn, insolvent: me.insolvent,
    netWorth: netWorth(w, me),
    projects: w.projects.filter((p) => p.agentId === playerId).map((p) => ({ kind: p.kind, daysLeft: p.ticksLeft, dailyCost: p.dailyCost, paused: p.heldUntil > w.tick })),
    well: well ? {
      grade: well.grade, capacity: well.extractionCapacity, storage: well.storage, storageCapacity: well.storageCapacity,
      outputRate: well.extractionRate, shutIn: well.shutIn,
    } : null,
    plant: plant ? siteView(plant) : null,
    sites: plantsOf(me).map(siteView),
    hubs: me.kind === 'TRADER'
      ? Object.entries(me.hubs).flatMap(([region, h]) => (h ? [{ region: region as RegionName, capacity: h.capacity, stock: { ...h.stock } }] : []))
      : [],
  };

  return {
    tick: w.tick,
    lengthDays,
    company,
    markets: NODE_NAMES.map((n) => {
      const node = w.nodes[n];
      return { node: n, grade: node.grade, marker: node.markerPrice, closes: { ...node.lastFobByOrigin }, offers: { ...node.lastOfferByOrigin } };
    }),
    products: { ...w.sink.prices },
    history,
    chokepoints: (Object.keys(CHOKEPOINTS) as ChokepointName[]).map((c) => ({ name: c, displayName: CHOKEPOINTS[c].displayName, status: w.graph.chokepoints[c].status })),
    pipelines: w.graph.edges.filter((e) => e.capacity !== null).map((e) => ({
      id: String(e.id), capacity: e.capacity ?? 0, usedToday: Object.values(e.usedBy).reduce<number>((s, q) => s + (q ?? 0), 0),
    })),
    deals: w.deals.filter((d) => d.buyerId === playerId || d.sellerId === playerId).map((d) => ({
      id: d.dealId, role: d.buyerId === playerId ? 'BUYER' as const : 'SELLER' as const,
      partner: names.get(d.buyerId === playerId ? d.sellerId : d.buyerId) ?? '?',
      grade: d.grade, qtyPerDay: d.qtyPerDay, price: d.price, endTick: d.endTick, status: d.status,
    })),
    cargo: w.cargo.filter((c) => c.ownerId === playerId).map((c) => ({
      grade: c.grade, qty: c.qty, destination: c.destination, status: c.status, daysAtSea: w.tick - c.dispatchTick,
    })),
    rivals: w.agents.filter((a) => a.agentId !== playerId).map((a) => ({ name: a.name, kind: a.kind, region: a.region })),
    alerts: [...alerts],
    cards: [...cards.cards],
    opportunities: [...cards.opportunities],
    reports: [...cards.reports],
    news: [...cards.news],
    campaign: cards.campaign,
  };
}

/** Today's public prices, for the session's history. */
export function dailyPrices(w: World): DailyPrices {
  const markers = {} as Record<NodeName, number>;
  for (const n of NODE_NAMES) markers[n] = w.nodes[n].markerPrice;
  return { tick: w.tick, markers, products: { ...w.sink.prices } };
}
