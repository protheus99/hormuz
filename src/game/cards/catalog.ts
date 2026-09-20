// The card catalog (spec G4.4): for each card, when it is raised (or when an Opportunity is
// available), and what its Yes and Maybe options do. Text lives in content/cards.ts; meters come
// from projection.ts. Deferred, because the systems they need do not exist yet: "Charter a
// tanker" and "Keep cargo afloat" (charters), and "Build a second refinery" (multi-plant refiners).

import { CHOKEPOINTS, type ChokepointName } from '../../data/chokepoints';
import { NODE_FOR_GRADE, NODES, type NodeName } from '../../data/nodes';
import { REGIONS, type RegionName } from '../../data/regions';
import { leaseRate, leaseRegions, OFFICE_HUB_CAPACITY, projectCost, type Action } from '../../engine/actions';
import { actualCost, effectiveUtilization, fillRatio } from '../../engine/agents';
import { previousClose, referencePrice } from '../../engine/clearing';
import { acceptedGrades, averageCost, CLOSED_TO_NEW_REFINING, integrationPlant, plantOf, total, wellOf } from '../../engine/companies';
import { configFor } from '../../engine/config';
import { priceDeal, signDeal, type DealTerms } from '../../engine/deals';
import type { Grade } from '../../engine/enums';
import type { Agent, AgentId, Deal, Producer } from '../../engine/model';
import { refinerQuote, type MarketView } from '../../engine/rules';
import { avoidFor, findRoute, LaneRouteProvider } from '../../engine/transport';
import { netWorth, type World } from '../../engine/world';
import { money } from '../../content/cards';
import type { AdvisorMemory, CardType, OptionEffect } from './types';

export interface CardContext {
  readonly w: World;
  readonly me: Agent;
  readonly memory: AdvisorMemory;
  /** Deterministic draws from the world's ai stream. */
  readonly roll: () => number;
}

/** Why a card is raised, and the numbers its text and options need. */
export interface Situation {
  /** Merge key: situations with the same key are one card (spec G4.1). */
  readonly key: string;
  readonly data: Readonly<Record<string, string | number>>;
}

export interface OptionSpec {
  readonly actions: readonly Action[];
  readonly effect?: OptionEffect;
}

export interface CardDef {
  readonly type: CardType;
  readonly kinds: readonly Agent['kind'][];
  /** Raised by the game when its situation arises. */
  readonly raised: boolean;
  /** Can be opened from Opportunities (spec G4.4 "Opp"). */
  readonly opportunity: boolean;
  /** AI companies answer it from Phase 9 (spec G4.6: operating cards). */
  readonly operating: boolean;
  detect(ctx: CardContext): Situation | null;
  options(ctx: CardContext, s: Situation): { readonly yes: OptionSpec; readonly maybe: OptionSpec | null };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────

/**
 * What a trader may bid delivered into one of its offices and still make money: the local price
 * less the region's tariff and the spread, exactly as its daily rules quote (spec §6.4). Cards that
 * bid above this buy at the market and lose on any adverse move.
 */
function traderBid(w: World, node: NodeName, office: RegionName): number {
  const cfg = w.config;
  // The same reference the trader's daily rules use: the last close for this port, but never above
  // what the crude is worth at today's marker, since a close can be months old (D40).
  const marker = w.nodes[node];
  const toMarker = findRoute(w.graph, office, marker.markerRegion);
  const netback = Math.max(0, marker.markerPrice - (toMarker?.totalFreight ?? 0));
  const ref = Math.min(referencePrice(marker, office) ?? marker.markerPrice, netback);
  return Math.round((ref - REGIONS[office].infrastructureTariff - cfg.HALF_SPREAD) * 100) / 100;
}

/** Hub fill above which renting more tanks is worth offering. */
const LEASE_HUB_FILL = 0.7;

/** How long "commit capital to the gap" runs, and the turnover it assumes (spec G4.4). */
const GAP_DAYS = 28;
const GAP_TURNOVER_DAYS = 7;
/**
 * The share of the hub's free room a card may commit. The daily rules are bidding for that room
 * too, so a card that claims all of it just fills the tanks twice over and forces a clearance sale.
 */
const CARD_SHARE_OF_ROOM = 0.5;

const lot = (w: World, bbl: number) => Math.max(0, Math.floor(bbl / w.config.LOT_SIZE) * w.config.LOT_SIZE);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const bbl = (x: number) => Math.round(x).toLocaleString('en-US');

function dailyFixed(w: World, a: Agent): number {
  const cfg = w.config;
  const well = wellOf(a);
  const plant = plantOf(a);
  return (well ? cfg.FIXED_COST_RATE.PRODUCER * well.extractionCapacity : 0)
    + (plant ? cfg.FIXED_COST_RATE.REFINER * plant.processingCapacity : 0)
    + (a.kind === 'TRADER' ? cfg.OFFICE_COST.PER_TICK * a.offices.length : 0);
}

function viewFor(w: World, a: Agent): MarketView {
  return {
    tick: w.tick, nodes: w.nodes, routes: new LaneRouteProvider(w.graph), expectedPrices: w.sink.expectedPrices,
    avoid: avoidFor(a.settings.risk, w.graph), dealCommitments: 0,
  };
}

function statusWords(w: World, c: ChokepointName): string {
  const s = w.graph.chokepoints[c].status;
  return s === 'TENSION' ? 'tense' : s === 'DELAYED' ? 'congested' : s === 'CLOSED' ? 'closed' : 'open';
}

/** Whether a deal could be signed as it stands (signDeal is pure: it validates and returns). */
function signable(w: World, terms: DealTerms): boolean {
  try {
    signDeal(terms, new Map(w.agents.map((a) => [a.agentId, a])), w.deals, w.dealSeq + 1, w.tick, w.config);
    return true;
  } catch {
    return false;
  }
}

/** Half the smaller side's capacity, within the deal limits; signDeal still checks DEAL_MAX_SHARE. */
function offerSize(w: World, mine: number, theirs: number): number {
  const { min, max } = w.config.DEAL_VOLUME;
  return Math.min(max, Math.max(min, lot(w, 0.5 * Math.min(mine, theirs))));
}

/** The largest of full, half and minimum volume that can be signed, so existing deals leave room. */
function fit(w: World, terms: DealTerms): DealTerms | null {
  const sizes = [terms.qtyPerDay, lot(w, terms.qtyPerDay / 2), w.config.DEAL_VOLUME.min];
  for (const qtyPerDay of sizes) {
    if (qtyPerDay < w.config.DEAL_VOLUME.min) continue;
    const t = { ...terms, qtyPerDay };
    if (signable(w, t)) return t;
  }
  return null;
}

/** A fixed-price deal an AI counterparty would offer this company, or null (spec G4.3). */
function dealOffer(ctx: CardContext, termDays: number): { terms: DealTerms; partner: Agent; market: number } | null {
  const { w, me } = ctx;
  const well = wellOf(me);
  const plant = plantOf(me);
  if (well && me.kind === 'PRODUCER') {
    const node = w.nodes[NODE_FOR_GRADE[well.grade]];
    const buyers = w.agents.filter((a) => a.controller === 'AI' && plantOf(a) && acceptedGrades((plantOf(a) as NonNullable<ReturnType<typeof plantOf>>).techTier).includes(well.grade)
      && findRoute(w.graph, me.region, a.region) !== null);
    if (buyers.length === 0) return null;
    const partner = buyers[Math.floor(ctx.roll() * buyers.length)] as Agent;
    const qty = offerSize(w, well.extractionCapacity, plantOf(partner)?.processingCapacity ?? 0);
    const terms: DealTerms = {
      sellerId: me.agentId, buyerId: partner.agentId, grade: well.grade, originRegion: me.region, deliveryRegion: partner.region,
      qtyPerDay: qty, termDays, price: priceDeal(node, me.region, 'BUYER', partner.personality), avoidChokepoints: [],
    };
    const fitted = fit(w, terms);
    return fitted ? { terms: fitted, partner, market: referencePrice(node, me.region) ?? node.markerPrice } : null;
  }
  if (plant && me.kind === 'REFINER') {
    const sellers = w.agents.filter((a) => {
      const wl = wellOf(a);
      return a.controller === 'AI' && wl !== undefined && acceptedGrades(plant.techTier).includes(wl.grade) && findRoute(w.graph, a.region, me.region) !== null;
    });
    if (sellers.length === 0) return null;
    const partner = sellers[Math.floor(ctx.roll() * sellers.length)] as Agent;
    const pw = wellOf(partner);
    if (!pw) return null;
    const node = w.nodes[NODE_FOR_GRADE[pw.grade]];
    const qty = offerSize(w, plant.processingCapacity, pw.extractionCapacity);
    const terms: DealTerms = {
      sellerId: partner.agentId, buyerId: me.agentId, grade: pw.grade, originRegion: partner.region, deliveryRegion: me.region,
      qtyPerDay: qty, termDays, price: priceDeal(node, partner.region, 'SELLER', partner.personality), avoidChokepoints: avoidFor(me.settings.risk, w.graph),
    };
    const fitted = fit(w, terms);
    return fitted ? { terms: fitted, partner, market: referencePrice(node, partner.region) ?? node.markerPrice } : null;
  }
  return null;
}

function offerDetect(ctx: CardContext): Situation | null {
  const { w, me, memory } = ctx;
  const tender = memory.pendingTenders.find((t) => t.agentId === me.agentId && t.dueTick <= w.tick);
  const last = memory.lastOfferTick[me.agentId] ?? 0;
  const unasked = w.tick - last >= w.config.DEAL_OFFER_INTERVAL && ctx.roll() < 0.5;
  if (!tender && !unasked) return null;
  const offer = dealOffer(ctx, tender?.termDays ?? 90);
  if (!offer) return null;
  return {
    key: `offer:${w.tick}`,
    data: {
      partner: offer.partner.name, partnerId: offer.partner.agentId, qty: bbl(offer.terms.qtyPerDay), price: money(offer.terms.price),
      market: money(offer.market), terms: JSON.stringify(offer.terms), tender: tender ? 1 : 0,
    },
  };
}

function offerOptions(_ctx: CardContext, s: Situation) {
  const terms = JSON.parse(String(s.data.terms)) as DealTerms;
  return {
    yes: { actions: [{ kind: 'SIGN_DEAL', terms: { ...terms, termDays: 90 } }] as Action[] },
    maybe: { actions: [{ kind: 'SIGN_DEAL', terms: { ...terms, termDays: 30 } }] as Action[] },
  };
}

// ─── The catalog ─────────────────────────────────────────────────────────────────────────────

const PRODUCERS: Agent['kind'][] = ['PRODUCER', 'INTEGRATED'];
const PLANTS: Agent['kind'][] = ['REFINER', 'INTEGRATED'];
const ALL: Agent['kind'][] = ['PRODUCER', 'REFINER', 'INTEGRATED', 'TRADER'];

export const CATALOG: readonly CardDef[] = [
  // ── Shared ──
  {
    type: 'CASH_SHORT', kinds: ALL, raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      const fixed = dailyFixed(w, me);
      const credit = me.creditLimit - me.creditDrawn;
      if (fixed <= 0 || credit <= 0) return null;
      const days = (me.cash - me.cashReserved) / fixed;
      return days < 10 ? { key: 'cash', data: { days: Math.max(0, Math.round(days)), credit: money(credit), amount: money(Math.min(credit, 30 * fixed)) } } : null;
    },
    options: ({ w, me }) => ({
      yes: { actions: [{ kind: 'DRAW_CREDIT', amount: Math.min(me.creditLimit - me.creditDrawn, 30 * dailyFixed(w, me)) }] },
      maybe: w.projects.some((p) => p.agentId === me.agentId) ? { actions: [{ kind: 'HOLD_PROJECTS', days: 30 }] } : null,
    }),
  },
  {
    type: 'MARKET_REPORT', kinds: ALL, raised: false, opportunity: true, operating: false,
    detect: ({ w }) => ({ key: 'report', data: { cost: money(w.config.REPORT_COST), lag: w.config.REPORT_LAG } }),
    options: ({ w }) => ({ yes: { actions: [{ kind: 'PAY', amount: w.config.REPORT_COST, what: 'REPORT' }], effect: { report: true } }, maybe: null }),
  },
  {
    type: 'FIND_DEAL', kinds: ['PRODUCER', 'REFINER'], raised: false, opportunity: true, operating: false,
    detect: ({ memory, me }) => (memory.pendingTenders.some((t) => t.agentId === me.agentId) ? null : { key: 'tender', data: {} }),
    options: () => ({ yes: { actions: [], effect: { tender: 90 } }, maybe: { actions: [], effect: { tender: 30 } } }),
  },

  // ── Producer ──
  { type: 'BUYER_OFFERS_DEAL', kinds: ['PRODUCER'], raised: true, opportunity: false, operating: false, detect: offerDetect, options: offerOptions },
  {
    type: 'PRICES_BELOW_COST', kinds: PRODUCERS, raised: true, opportunity: false, operating: true,
    detect: ({ me }) => {
      const well = wellOf(me);
      if (!well || well.breakevenStreak > -10 || well.extractionRate <= 0.5) return null;
      return { key: 'below-cost', data: { days: -well.breakevenStreak, fill: pct(fillRatio(well)) } };
    },
    options: ({ me }) => ({
      yes: { actions: [{ kind: 'SET_OUTPUT', rate: 0.5 }] },
      maybe: (wellOf(me)?.extractionRate ?? 1) > 0.75 ? { actions: [{ kind: 'SET_OUTPUT', rate: 0.75 }] } : null,
    }),
  },
  {
    type: 'STORAGE_NEARLY_FULL', kinds: PRODUCERS, raised: true, opportunity: false, operating: false,
    detect: ({ me }) => {
      const well = wellOf(me);
      return well && fillRatio(well) >= 0.9 ? { key: 'storage', data: { fill: pct(fillRatio(well)) } } : null;
    },
    options: ({ w, me }) => {
      const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
      const node = NODE_FOR_GRADE[well.grade];
      const ref = referencePrice(w.nodes[node], me.region) ?? w.nodes[node].markerPrice;
      const price = Math.max(actualCost(me as Producer), ref * (1 - w.config.DUMP_DISCOUNT));
      const qty = lot(w, well.storage - 0.7 * well.storageCapacity);
      return {
        yes: { actions: qty > 0 ? [{ kind: 'STANDING_ORDER', side: 'ASK', node, region: me.region, price: Math.round(price * 100) / 100, qty, days: 1 }] : [] },
        maybe: leaseRegions().includes(me.region) ? { actions: [{ kind: 'LEASE', region: me.region, capacity: w.config.LEASE_STEP, days: 30 }] } : null,
      };
    },
  },
  {
    type: 'PRICES_RECOVERED', kinds: PRODUCERS, raised: true, opportunity: false, operating: true,
    detect: ({ me }) => {
      const well = wellOf(me);
      if (!well || well.extractionRate >= 1 || well.breakevenStreak < 10) return null;
      return { key: 'recovered', data: { days: well.breakevenStreak, rate: pct(well.extractionRate) } };
    },
    options: ({ me }) => {
      const rate = wellOf(me)?.extractionRate ?? 1;
      return { yes: { actions: [{ kind: 'SET_OUTPUT', rate: 1 }] }, maybe: { actions: [{ kind: 'SET_OUTPUT', rate: Math.max(0.25, (rate + 1) / 2) }] } };
    },
  },
  {
    type: 'WELLS_DECLINING', kinds: PRODUCERS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      const well = wellOf(me);
      if (!well || well.extractionCapacity >= 0.9 * well.peakCapacity || w.projects.some((p) => p.agentId === me.agentId && p.kind === 'DRILL')) return null;
      return { key: 'decline', data: { now: bbl(well.extractionCapacity), peak: bbl(well.peakCapacity), ticks: w.config.DRILL_TICKS } };
    },
    options: ({ w, me }) => {
      const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
      const steps = Math.max(1, Math.ceil((well.peakCapacity - well.extractionCapacity) / w.config.DRILL_STEP));
      return {
        yes: { actions: [{ kind: 'START_PROJECT', project: 'DRILL', steps }] },
        maybe: steps > 1 ? { actions: [{ kind: 'START_PROJECT', project: 'DRILL', steps: Math.floor(steps / 2) }] } : null,
      };
    },
  },
  {
    type: 'EXPORT_ROUTE_TROUBLE', kinds: PRODUCERS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me, memory }) => {
      const sales = memory.recentSales.filter((s) => s.seller === me.agentId);
      for (const c of Object.keys(CHOKEPOINTS) as ChokepointName[]) {
        const status = w.graph.chokepoints[c].status;
        if (status !== 'TENSION' && status !== 'DELAYED') continue;
        const through = sales.filter((s) => s.chokepoints.includes(c));
        if (through.length === 0) continue;
        const byBuyer = new Map<string, number>();
        for (const s of through) byBuyer.set(s.buyer, (byBuyer.get(s.buyer) ?? 0) + s.qty);
        const [buyer, qty] = [...byBuyer.entries()].sort((a, b) => b[1] - a[1])[0] as [string, number];
        const partner = w.agents.find((a) => a.agentId === buyer);
        if (!partner) continue;
        return { key: `export:${c}`, data: { strait: CHOKEPOINTS[c].displayName, status: statusWords(w, c), partner: partner.name, partnerId: buyer, perDay: qty / 30 } };
      }
      return null;
    },
    options: ({ w, me }, s) => {
      const well = wellOf(me) as NonNullable<ReturnType<typeof wellOf>>;
      const partner = w.agents.find((a) => a.agentId === s.data.partnerId) as Agent;
      const node = w.nodes[NODE_FOR_GRADE[well.grade]];
      const price = Math.round(priceDeal(node, me.region, 'SELLER', null) * 0.95 * 100) / 100;
      const qty = lot(w, Math.min(Number(s.data.perDay), 0.5 * well.extractionCapacity, w.config.DEAL_VOLUME.max));
      const terms = (q: number): DealTerms => ({
        sellerId: me.agentId, buyerId: partner.agentId, grade: well.grade, originRegion: me.region, deliveryRegion: partner.region,
        qtyPerDay: Math.max(w.config.DEAL_VOLUME.min, q), termDays: 90, price, avoidChokepoints: [],
      });
      const half = lot(w, qty / 2);
      return {
        yes: { actions: signable(w, terms(qty)) ? [{ kind: 'SIGN_DEAL', terms: terms(qty) }] : [] },
        maybe: half >= w.config.DEAL_VOLUME.min && signable(w, terms(half)) ? { actions: [{ kind: 'SIGN_DEAL', terms: terms(half) }] } : null,
      };
    },
  },
  {
    type: 'EXPORT_CLOSURE_RISK', kinds: PRODUCERS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      const bypasses = w.graph.edges.filter((e) => e.capacity !== null && String(e.id).startsWith('bypass_') && (e.a === me.region || e.b === me.region));
      if (bypasses.length === 0) return null;
      // The bypass pipelines go around Hormuz. Once it is tense the cheapest route may already use
      // them, so the strait is checked directly rather than through today's route.
      const strait: ChokepointName = 'HORMUZ';
      if (w.graph.chokepoints[strait].status !== 'TENSION') return null;
      const edge = bypasses.reduce((a, b) => ((a.capacity ?? 0) >= (b.capacity ?? 0) ? a : b));
      if ((edge.reserved[me.agentId] ?? 0) > 0) return null;
      const well = wellOf(me);
      const qty = lot(w, Math.min(w.config.MAX_RESERVATION_SHARE * (edge.capacity ?? 0), well?.extractionCapacity ?? 0));
      return qty > 0 ? { key: `closure:${strait}`, data: { strait: CHOKEPOINTS[strait].displayName, edge: String(edge.id), qty: bbl(qty), qtyNum: qty } } : null;
    },
    options: ({ w }, s) => {
      const qty = Number(s.data.qtyNum);
      const half = lot(w, qty / 2);
      return {
        yes: { actions: [{ kind: 'RESERVE_PIPELINE', edgeId: String(s.data.edge), qty }] },
        maybe: half > 0 ? { actions: [{ kind: 'RESERVE_PIPELINE', edgeId: String(s.data.edge), qty: half }] } : null,
      };
    },
  },
  {
    type: 'EXPAND_STORAGE', kinds: PRODUCERS, raised: true, opportunity: true, operating: false,
    // Raised once the tanks are more than half full with none being built, so a producer with crude
    // to store is asked rather than having to go looking (spec G4.7: the thinnest play type).
    detect: ({ w, me }) => {
      const well = wellOf(me);
      if (!well) return null;
      const building = w.projects.some((p) => p.agentId === me.agentId && p.kind === 'STORAGE');
      if (building || fillRatio(well) < 0.5) return null;
      return { key: 'expand-storage', data: { step: bbl(w.config.STORAGE_STEP), fill: pct(fillRatio(well)) } };
    },
    options: () => ({ yes: { actions: [{ kind: 'START_PROJECT', project: 'STORAGE', steps: 2 }] }, maybe: { actions: [{ kind: 'START_PROJECT', project: 'STORAGE', steps: 1 }] } }),
  },
  {
    type: 'BUILD_REFINERY', kinds: ['PRODUCER'], raised: true, opportunity: true, operating: false,
    detect: ({ w, me, memory }) => {
      if (me.kind !== 'PRODUCER' || CLOSED_TO_NEW_REFINING.includes(me.region)) return null;
      if (!(REGIONS[me.region].roles as readonly string[]).includes('REFINING')) return null;
      if (w.projects.some((p) => p.agentId === me.agentId && p.kind === 'REFINERY')) return null;
      const start = memory.startNetWorth[me.agentId] ?? Infinity;
      if (netWorth(w, me) < w.config.INTEGRATE_THRESHOLD * start) return null;
      return { key: 'refinery', data: { capacity: bbl(integrationPlant(me, w.config).processingCapacity), ticks: w.config.FACTORY_TICKS } };
    },
    options: () => ({ yes: { actions: [{ kind: 'START_PROJECT', project: 'REFINERY', steps: 1 }] }, maybe: null }),
  },

  // ── Refiner ──
  { type: 'SUPPLIER_OFFERS_DEAL', kinds: ['REFINER'], raised: true, opportunity: false, operating: false, detect: offerDetect, options: offerOptions },
  {
    type: 'STOCK_LOW', kinds: PLANTS, raised: true, opportunity: false, operating: true,
    detect: ({ me }) => {
      const plant = plantOf(me);
      if (!plant) return null;
      const use = plant.processingCapacity * effectiveUtilization(plant);
      if (use <= 0) return null;
      const days = (total(plant.crudeStock) + plant.inboundBarrels) / use;
      return days < 5 ? { key: 'stock', data: { days: Math.round(days * 10) / 10 } } : null;
    },
    options: ({ w, me }) => {
      const plant = plantOf(me) as NonNullable<ReturnType<typeof plantOf>>;
      const quote = me.kind === 'REFINER' || me.kind === 'INTEGRATED' ? refinerQuote(me, viewFor(w, me), configFor(me.settings, w.config)) : null;
      if (!quote) return { yes: { actions: [] }, maybe: null };
      const price = Math.floor(quote.deliveredMax * 100) / 100;
      const qty = lot(w, 10 * plant.processingCapacity);
      const bid = (q: number): Action => ({ kind: 'STANDING_ORDER', side: 'BID', node: quote.node, region: me.region, price, qty: q, days: 1 });
      return {
        yes: { actions: [bid(qty)] },
        maybe: { actions: [bid(lot(w, qty / 2)), { kind: 'SET_RUN_CAP', cap: 0.75, days: 30 }] },
      };
    },
  },
  {
    type: 'REFINING_LOSING', kinds: PLANTS, raised: true, opportunity: false, operating: true,
    detect: ({ me }) => {
      const plant = plantOf(me);
      return plant && plant.lowMarginDays >= 5 && plant.utilizationCap > 0.5 ? { key: 'losing', data: { days: plant.lowMarginDays } } : null;
    },
    options: () => ({ yes: { actions: [{ kind: 'SET_RUN_CAP', cap: 0.5, days: 30 }] }, maybe: { actions: [{ kind: 'SET_RUN_CAP', cap: 0.75, days: 30 }] } }),
  },
  {
    type: 'MARGINS_STRONG', kinds: PLANTS, raised: true, opportunity: false, operating: true,
    detect: ({ w, me }) => {
      const plant = plantOf(me);
      if (!plant || plant.lastMargin <= 2 * w.config.FIXED_COST_RATE.REFINER) return null;
      // Only while maintenance is coming due: an overdue plant is not offered another deferral.
      const since = plant.daysSinceMaintenance;
      if (since < w.config.MAINT_INTERVAL - 30 || since >= w.config.MAINT_INTERVAL || plant.maintenanceHoldUntil > w.tick || plant.fullRunUntil >= w.tick) return null;
      return { key: 'strong', data: { margin: money(plant.lastMargin) } };
    },
    options: () => ({
      yes: { actions: [{ kind: 'RUN_FLAT_OUT', days: 30 }, { kind: 'DEFER_MAINTENANCE', days: 60 }] },
      maybe: { actions: [{ kind: 'RUN_FLAT_OUT', days: 30 }] },
    }),
  },
  {
    type: 'MAINTENANCE_DUE', kinds: PLANTS, raised: true, opportunity: false, operating: true,
    detect: ({ w, me }) => {
      const plant = plantOf(me);
      if (!plant || plant.daysSinceMaintenance < w.config.MAINT_INTERVAL) return null;
      if (plant.maintenanceTicksRemaining > 0 || plant.maintenanceAt !== null || plant.maintenanceHoldUntil > w.tick) return null;
      return { key: 'maintenance', data: { days: plant.daysSinceMaintenance } };
    },
    options: () => ({ yes: { actions: [{ kind: 'MAINTAIN_NOW' }] }, maybe: { actions: [{ kind: 'SCHEDULE_MAINTENANCE', inDays: 14 }] } }),
  },
  {
    type: 'BREAKDOWN', kinds: PLANTS, raised: true, opportunity: false, operating: true,
    detect: ({ me, memory }) => {
      const plant = plantOf(me);
      if (!plant || plant.outageTicksRemaining <= 0 || memory.outageSeen[me.agentId] === true) return null;
      return { key: 'breakdown', data: { days: plant.outageTicksRemaining } };
    },
    options: () => ({ yes: { actions: [{ kind: 'EMERGENCY_REPAIR' }] }, maybe: { actions: [{ kind: 'PARTIAL_RESTART', share: 0.5 }] } }),
  },
  {
    type: 'CHEAP_HEAVY', kinds: PLANTS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      const plant = plantOf(me);
      if (!plant || plant.techTier < 3 || plant.crudePreference?.grade === 'HEAVY_SOUR') return null;
      const ctx = { routes: new LaneRouteProvider(w.graph), tick: w.tick, config: w.config };
      const heavy = previousClose(w.nodes.DME, me.region, ctx)[0]?.landed;
      const medium = previousClose(w.nodes.NC, me.region, ctx)[0]?.landed;
      if (heavy === undefined || medium === undefined || medium - heavy < 8) return null;
      return { key: 'heavy', data: { gap: money(medium - heavy) } };
    },
    options: () => ({
      yes: { actions: [{ kind: 'CRUDE_MIX', grade: 'HEAVY_SOUR', weight: 'ALL' }] },
      maybe: { actions: [{ kind: 'CRUDE_MIX', grade: 'HEAVY_SOUR', weight: 'HALF' }] },
    }),
  },
  {
    type: 'SUPPLY_ROUTE_TROUBLE', kinds: PLANTS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      for (const d of w.deals) {
        if (d.status !== 'ACTIVE' || d.buyerId !== me.agentId) continue;
        const route = findRoute(w.graph, d.originRegion, d.deliveryRegion, d.avoidChokepoints);
        const c = route?.chokepoints.find((k) => ['TENSION', 'DELAYED'].includes(w.graph.chokepoints[k].status));
        if (c === undefined) continue;
        const partner = w.agents.find((a) => a.agentId === d.sellerId);
        return { key: `deal:${d.dealId}`, data: { dealId: d.dealId, strait: CHOKEPOINTS[c].displayName, straitId: c, status: statusWords(w, c), partner: partner?.name ?? '?', half: d.qtyPerDay >= 2 * w.config.LOT_SIZE ? 1 : 0 } };
      }
      return null;
    },
    options: ({ w }, s) => {
      const deal = w.deals.find((d) => d.dealId === s.data.dealId) as Deal;
      const avoid = [...deal.avoidChokepoints, s.data.straitId as ChokepointName];
      return {
        yes: { actions: [{ kind: 'REROUTE_DEAL', dealId: deal.dealId, avoid, half: false }] },
        maybe: s.data.half === 1 ? { actions: [{ kind: 'REROUTE_DEAL', dealId: deal.dealId, avoid, half: true }] } : null,
      };
    },
  },
  {
    type: 'DEAL_CARGO_STUCK', kinds: PLANTS, raised: true, opportunity: false, operating: false,
    detect: ({ w, me, memory }) => {
      for (const c of w.cargo) {
        if (c.ownerId !== me.agentId || c.dealId === null || c.status !== 'HELD') continue;
        const since = memory.heldSince[String(c.cargoId)] ?? w.tick;
        if (w.tick - since < 3) continue;
        const deal = w.deals.find((d) => d.dealId === c.dealId && d.status === 'ACTIVE');
        if (!deal) continue;
        const partner = w.agents.find((a) => a.agentId === deal.sellerId);
        return { key: `deal:${deal.dealId}`, data: { dealId: deal.dealId, partner: partner?.name ?? '?', days: w.tick - since } };
      }
      return null;
    },
    options: (ctx, s) => {
      const emergency = CATALOG.find((d) => d.type === 'STOCK_LOW')?.options(ctx, s).maybe?.actions ?? [];
      return {
        yes: { actions: [{ kind: 'CANCEL_DEAL', dealId: s.data.dealId as Deal['dealId'] }] },
        maybe: { actions: emergency.filter((a) => a.kind === 'STANDING_ORDER') },
      };
    },
  },
  {
    type: 'UPGRADE_TIER', kinds: PLANTS, raised: false, opportunity: true, operating: false,
    detect: ({ w, me }) => {
      const plant = plantOf(me);
      if (!plant || plant.techTier >= 3 || w.projects.some((p) => p.agentId === me.agentId && p.kind === 'TIER')) return null;
      return { key: 'tier', data: { next: plant.techTier + 1, grades: plant.techTier === 1 ? 'medium as well as light crude' : 'heavy crude too', ticks: w.config.TIER_TICKS } };
    },
    options: () => ({ yes: { actions: [{ kind: 'START_PROJECT', project: 'TIER', steps: 1 }] }, maybe: null }),
  },
  {
    type: 'ADD_UNIT', kinds: PLANTS, raised: false, opportunity: true, operating: false,
    detect: ({ w }) => ({ key: 'unit', data: { capacity: bbl(w.config.UNIT_CAPACITY), ticks: w.config.FACTORY_TICKS } }),
    options: () => ({ yes: { actions: [{ kind: 'START_PROJECT', project: 'UNIT', steps: 1 }] }, maybe: null }),
  },
  {
    type: 'EXPAND_TANKS', kinds: PLANTS, raised: false, opportunity: true, operating: false,
    detect: ({ w, me }) => (wellOf(me) ? null : { key: 'tanks', data: { step: bbl(w.config.STORAGE_STEP) } }),
    options: () => ({ yes: { actions: [{ kind: 'START_PROJECT', project: 'STORAGE', steps: 2 }] }, maybe: { actions: [{ kind: 'START_PROJECT', project: 'STORAGE', steps: 1 }] } }),
  },

  // ── Trader ──
  {
    type: 'BACK_TO_BACK', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      for (const office of me.offices) {
        for (const p of w.agents) {
          const pw = wellOf(p);
          if (p.kind !== 'PRODUCER' || !pw || p.region !== office || p.controller !== 'AI') continue;
          const node = w.nodes[NODE_FOR_GRADE[pw.grade]];
          const buy = priceDeal(node, office, 'SELLER', p.personality);
          for (const r of w.agents) {
            const rp = plantOf(r);
            if (r.kind !== 'REFINER' || !rp || r.controller !== 'AI' || !acceptedGrades(rp.techTier).includes(pw.grade)) continue;
            const route = findRoute(w.graph, office, r.region);
            const landed = previousClose(node, r.region, { routes: new LaneRouteProvider(w.graph), tick: w.tick, config: w.config })[0]?.landed;
            if (!route || landed === undefined) continue;
            const sell = Math.round((landed - route.totalFreight - REGIONS[r.region].infrastructureTariff) * 100) / 100;
            if (sell - buy - REGIONS[office].infrastructureTariff < 3) continue;
            return {
              key: `b2b:${p.agentId}:${r.agentId}`,
              data: { producer: p.name, producerId: p.agentId, refiner: r.name, refinerId: r.agentId, buy: money(buy), sell: money(sell), buyNum: buy, sellNum: sell, grade: pw.grade, office },
            };
          }
        }
      }
      return null;
    },
    options: ({ w, me }, s) => {
      const deals = (qty: number): Action[] => {
        const common = { grade: s.data.grade as Grade, termDays: 30, avoidChokepoints: [] };
        const first: DealTerms = { ...common, sellerId: s.data.producerId as AgentId, buyerId: me.agentId, originRegion: s.data.office as RegionName, deliveryRegion: s.data.office as RegionName, qtyPerDay: qty, price: Number(s.data.buyNum) };
        const second: DealTerms = { ...common, sellerId: me.agentId, buyerId: s.data.refinerId as AgentId, originRegion: s.data.office as RegionName, deliveryRegion: (w.agents.find((a) => a.agentId === s.data.refinerId) as Agent).region, qtyPerDay: qty, price: Number(s.data.sellNum) };
        return signable(w, first) ? [{ kind: 'SIGN_DEAL', terms: first }, { kind: 'SIGN_DEAL', terms: second }] : [];
      };
      return { yes: { actions: deals(4000) }, maybe: { actions: deals(2000) } };
    },
  },
  {
    type: 'DISTRESSED_CARGO', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      for (const p of w.agents) {
        const pw = wellOf(p);
        if (!pw || p.controller !== 'AI' || fillRatio(pw) < 0.95) continue;
        const office = me.offices.find((o) => findRoute(w.graph, p.region, o) !== null && (me.hubs[o]?.capacity ?? 0) > total(me.hubs[o]?.stock ?? { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 }));
        if (office === undefined) continue;
        return { key: `distress:${p.agentId}`, data: { partner: p.name, partnerId: p.agentId, office } };
      }
      return null;
    },
    options: ({ w, me }, s) => {
      const p = w.agents.find((a) => a.agentId === s.data.partnerId) as Agent;
      const pw = wellOf(p) as NonNullable<ReturnType<typeof wellOf>>;
      const office = s.data.office as RegionName;
      const node = NODE_FOR_GRADE[pw.grade];
      const route = findRoute(w.graph, p.region, office);
      const ref = referencePrice(w.nodes[node], p.region) ?? w.nodes[node].markerPrice;
      const price = Math.round((ref * 0.85 + (route?.totalFreight ?? 0) + REGIONS[office].infrastructureTariff) * 100) / 100;
      const hub = me.kind === 'TRADER' ? me.hubs[office] : undefined;
      const room = hub ? hub.capacity - total(hub.stock) : 0;
      const qty = lot(w, Math.min(pw.storage - 0.7 * pw.storageCapacity, room));
      const bid = (q: number): Action[] => (q > 0 ? [{ kind: 'STANDING_ORDER', side: 'BID', node, region: office, price, qty: q, days: 1 }] : []);
      return { yes: { actions: bid(qty) }, maybe: { actions: bid(lot(w, qty / 2)) } };
    },
  },
  {
    type: 'PRICES_LOW', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      for (const node of ['NYMEX', 'NC', 'DME'] as NodeName[]) {
        const memory = me.priceMemory[node];
        if (!memory || memory.length < 10) continue;
        const avg = memory.reduce((s, x) => s + x, 0) / memory.length;
        if (w.nodes[node].markerPrice >= avg - w.config.STORAGE_CARRY * w.config.HOLD_TICKS) continue;
        const office = me.offices.find((o) => (me.hubs[o]?.capacity ?? 0) - total(me.hubs[o]?.stock ?? { LIGHT_SWEET: 0, MEDIUM: 0, HEAVY_SOUR: 0 }) >= 5000);
        if (office === undefined) continue;
        const grade = NODES[node].grade;
        return { key: `low:${node}`, data: { grade: grade === 'LIGHT_SWEET' ? 'Light crude' : grade === 'MEDIUM' ? 'Medium crude' : 'Heavy crude', node, office } };
      }
      return null;
    },
    options: ({ w, me }, s) => {
      const node = s.data.node as NodeName;
      const office = s.data.office as RegionName;
      const hub = me.kind === 'TRADER' ? me.hubs[office] : undefined;
      const room = hub ? hub.capacity - total(hub.stock) : 0;
      const price = traderBid(w, node, office);
      const bid = (q: number): Action[] => (q > 0 ? [{ kind: 'STANDING_ORDER', side: 'BID', node, region: office, price, qty: q, days: 5 }] : []);
      return { yes: { actions: bid(lot(w, room / 5)) }, maybe: { actions: bid(lot(w, room / 10)) } };
    },
  },
  {
    type: 'PRICE_GAP', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      const ctx = { routes: new LaneRouteProvider(w.graph), tick: w.tick, config: w.config };
      for (const office of me.offices) {
        for (const node of ['NYMEX', 'NC', 'DME'] as NodeName[]) {
          const local = referencePrice(w.nodes[node], office);
          const landed = previousClose(w.nodes[node], office, ctx).find((q) => q.origin !== office)?.landed;
          if (local === undefined || landed === undefined || local - landed < 3) continue;
          return { key: `gap:${office}:${node}`, data: { region: REGIONS[office].displayName, office, node, gap: money(local - landed), price: traderBid(w, node, office) } };
        }
      }
      return null;
    },
    options: ({ w, me }, s) => {
      // A standing order buys its quantity every day. The hub turns over about once a week, so a
      // week's worth of room sets the daily size: bigger and the crude floats offshore on demurrage.
      const office = s.data.office as RegionName;
      const hub = me.kind === 'TRADER' ? me.hubs[office] : undefined;
      const room = hub ? hub.capacity - total(hub.stock) - total(hub.inbound) : 0;
      const bid = (share: number): Action[] => {
        const qty = lot(w, (room * share * CARD_SHARE_OF_ROOM) / GAP_TURNOVER_DAYS);
        return qty > 0 ? [{ kind: 'STANDING_ORDER', side: 'BID', node: s.data.node as NodeName, region: office, price: Number(s.data.price), qty, days: GAP_DAYS }] : [];
      };
      return { yes: { actions: bid(1) }, maybe: { actions: bid(0.5) } };
    },
  },
  {
    type: 'POSITION_FALLING', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      for (const node of ['NYMEX', 'NC', 'DME'] as NodeName[]) {
        const grade = NODES[node].grade;
        const held = me.offices.reduce((s, o) => s + (me.hubs[o]?.stock[grade] ?? 0), 0);
        const peak = Math.max(...(me.priceMemory[node] ?? [0]));
        const now = w.nodes[node].markerPrice;
        // A real slump, and only while the crude is worth less than it cost: a dip in a position
        // still in profit is not a decision, and asking anyway only invites selling at a loss.
        if (held < 1000 || peak <= 0 || now > 0.8 * peak) continue;
        const cost = me.offices.reduce((s, o) => {
          const hub = me.hubs[o];
          return s + (hub ? averageCost(hub, grade) * hub.stock[grade] : 0);
        }, 0) / held;
        if (cost <= 0 || now >= cost) continue;
        return { key: `falling:${node}`, data: { fall: pct(1 - now / peak), node, grade } };
      }
      return null;
    },
    options: ({ w, me }, s) => {
      const grade = s.data.grade as Grade;
      const node = s.data.node as NodeName;
      const asks = (share: number): Action[] => me.kind !== 'TRADER' ? [] : me.offices.flatMap((o): Action[] => {
        const qty = lot(w, (me.hubs[o]?.stock[grade] ?? 0) * share);
        // Selling out of a falling market asks the local price, not below it: the meters show what
        // the sale is worth, and cutting further only gives the position away.
        const price = Math.round((referencePrice(w.nodes[node], o) ?? w.nodes[node].markerPrice) * 100) / 100;
        return qty > 0 ? [{ kind: 'STANDING_ORDER', side: 'ASK', node, region: o, price, qty, days: 1 }] : [];
      });
      return { yes: { actions: asks(1) }, maybe: { actions: asks(0.5) } };
    },
  },
  {
    type: 'CRISIS_BREWING', kinds: ['TRADER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      const c = (Object.keys(CHOKEPOINTS) as ChokepointName[]).find((k) => w.graph.chokepoints[k].status === 'TENSION');
      if (c === undefined) return null;
      const safe = me.offices.filter((o) => !(findRoute(w.graph, o, 'Coastal_Asia')?.chokepoints ?? []).includes(c));
      return safe.length > 0 ? { key: `crisis:${c}`, data: { strait: CHOKEPOINTS[c].displayName, office: safe[0] as string } } : null;
    },
    options: ({ w, me }, s) => {
      const office = s.data.office as RegionName;
      const hub = me.kind === 'TRADER' ? me.hubs[office] : undefined;
      const room = hub ? hub.capacity - total(hub.stock) : 0;
      const bids = (share: number): Action[] => (['NC', 'DME'] as NodeName[]).flatMap((node): Action[] => {
        const qty = lot(w, (room * share) / 2 / 14);
          const price = traderBid(w, node, office);
        return qty > 0 ? [{ kind: 'STANDING_ORDER', side: 'BID', node, region: office, price, qty, days: 14 }] : [];
      });
      return { yes: { actions: bids(1) }, maybe: { actions: bids(0.5) } };
    },
  },
  {
    type: 'CARGO_STUCK', kinds: ['TRADER', 'PRODUCER'], raised: true, opportunity: false, operating: false,
    detect: ({ w, me, memory }) => {
      const held = w.cargo.filter((c) => c.ownerId === me.agentId && c.status === 'HELD' && !c.awaitingRoute && c.dealId === null);
      const days = Math.max(0, ...held.map((c) => w.tick - (memory.heldSince[String(c.cargoId)] ?? w.tick)));
      return held.length > 0 && days >= 3 ? { key: 'stuck', data: { days } } : null;
    },
    options: () => ({ yes: { actions: [{ kind: 'SELL_AT_SEA', share: 1 }] }, maybe: { actions: [{ kind: 'SELL_AT_SEA', share: 0.5 }] } }),
  },
  {
    type: 'LEASE_STORAGE', kinds: ['TRADER'], raised: true, opportunity: true, operating: false,
    // Raised when crude is cheap and the tanks are filling: the moment extra space is worth renting,
    // and the one lever the daily rules never pull for themselves (spec §6.4, G7.2 T2).
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER') return null;
      const region = me.offices.find((o) => {
        const hub = me.hubs[o];
        if (!leaseRegions().includes(o) || !hub || hub.capacity <= 0) return false;
        return (total(hub.stock) + total(hub.inbound)) / hub.capacity >= LEASE_HUB_FILL;
      });
      if (region === undefined) return null;
      const cheap = (['NYMEX', 'NC', 'DME'] as NodeName[]).some((node) => {
        const memory = me.priceMemory[node];
        if (memory === undefined || memory.length < 10) return false;
        const average = memory.reduce((sum, x) => sum + x, 0) / memory.length;
        return w.nodes[node].markerPrice < average;
      });
      if (!cheap) return null;
      return { key: 'lease', data: { region: REGIONS[region].displayName, regionId: region, rate: money(leaseRate(w, region)) } };
    },
    options: ({ w }, s) => ({
      yes: { actions: [{ kind: 'LEASE', region: s.data.regionId as RegionName, capacity: w.config.LEASE_STEP, days: 90 }] },
      maybe: { actions: [{ kind: 'LEASE', region: s.data.regionId as RegionName, capacity: w.config.LEASE_STEP, days: 30 }] },
    }),
  },
  {
    type: 'OPEN_OFFICE', kinds: ['TRADER'], raised: true, opportunity: true, operating: false,
    // Raised when the office would leave a comfortable margin of cash, so spreading out is offered
    // rather than having to be found; still openable from Opportunities at any time.
    detect: ({ w, me }) => {
      if (me.kind !== 'TRADER' || me.offices.length >= 3) return null;
      if (me.cash - me.cashReserved < 2 * w.config.OFFICE_COST.OPEN) return null;
      const candidates: RegionName[] = ['Coastal_Asia', 'South_Asia', 'US_Gulf_Coast', 'Southern_Europe', 'North_Sea', 'Middle_East', 'West_Africa'];
      const region = candidates.find((r) => !me.offices.includes(r));
      return region ? { key: 'office', data: { region: REGIONS[region].displayName, regionId: region, cost: money(w.config.OFFICE_COST.OPEN), daily: money(w.config.OFFICE_COST.PER_TICK), hub: OFFICE_HUB_CAPACITY } } : null;
    },
    options: (_ctx, s) => ({ yes: { actions: [{ kind: 'OPEN_OFFICE', region: s.data.regionId as RegionName }] }, maybe: null }),
  },
];

export const CARD_DEFS: ReadonlyMap<CardType, CardDef> = new Map(CATALOG.map((d) => [d.type, d]));

/** The card types a kind of company can receive (spec G4.7 coverage). */
export function cardsFor(kind: Agent['kind']): CardType[] {
  return CATALOG.filter((d) => d.kinds.includes(kind)).map((d) => d.type);
}

/** Total cost of a project, for text. */
export const costOfProject = projectCost;
