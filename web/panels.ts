// The game screen's panels: the map, the company, markets, deals and cargo, and news.

import { mapLayout, regionName, type Counterparty, type DailyPrices, type DayLog, type LeaseView, type PlayerView, type Point } from '../src/game';
import { bbl, bblShort, dateOf, html, money, pct, raw, signed, words, type Html } from './dom';

const pts = (s: readonly Point[]) => s.map((p) => p.join(',')).join(' ');

const STRAIT_WORDS: Readonly<Record<string, string>> = { TENSION: 'tense', DELAYED: 'congested', CLOSED: 'closed' };

/** The world map: land, routes, regions and straits coloured by status (spec G10). */
export function mapPanel(view: PlayerView): Html {
  const m = mapLayout();
  const home = view.company.region;
  const offices = new Set(view.company.hubs.map((h) => h.region as string));
  const status = new Map(view.chokepoints.map((c) => [c.name as string, c.status as string]));
  const pipeUse = new Map(view.pipelines.map((p) => [p.id, p]));
  const lanes = m.lanes.map((l) => l.segments.map((s) => html`<polyline class="lane ${l.pipeline ? 'pipeline' : ''}" points="${pts(s)}"><title>${l.pipeline ? `Pipeline${l.capacity ? ` · ${bbl(l.capacity)} bbl/day, ${bbl(pipeUse.get(l.id)?.usedToday ?? 0)} used today` : ''}` : 'Sea route'}</title></polyline>`));
  const regions = m.regions.map((r) => {
    const mine = r.id === home || offices.has(r.id);
    const [x, y] = r.at;
    // Only your own regions are named on the map, so labels stay legible; the rest show on hover.
    return html`
      <circle class="region ${mine ? 'home' : ''}" cx="${x}" cy="${y}" r="${mine ? 6 : 4}"><title>${r.name}</title></circle>
      ${mine ? html`<text class="label home" x="${x + 8}" y="${y + 5}">${r.name}</text>` : ''}`;
  });
  const straits = m.chokepoints.map((c) => {
    const s = status.get(c.id) ?? 'OPEN';
    const [x, y] = c.at;
    return html`<rect class="cp ${s}" x="${x - 6}" y="${y - 6}" width="12" height="12" transform="rotate(45 ${x} ${y})"><title>${c.name}: ${words(s)}</title></rect>
      ${s !== 'OPEN' ? html`<text class="label cp-label ${s}" x="${x + 9}" y="${y - 8}">${c.name}: ${STRAIT_WORDS[s] ?? s}</text>` : ''}`;
  });
  return html`
    <div class="map">
      <svg viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="World map of oil routes">
        <path class="land" d="${m.land}"></path>
        <path class="water" d="${m.water}"></path>
        ${lanes}${regions}${straits}
      </svg>
      <div class="legend">
        <span><span class="dot" style="background:var(--accent)"></span>Your company</span>
        <span><span class="dot" style="background:#6b9c7a"></span>Strait open</span>
        <span><span class="dot" style="background:#d9a300"></span>Tense</span>
        <span><span class="dot" style="background:#e07b00"></span>Congested</span>
        <span><span class="dot" style="background:var(--bad)"></span>Closed</span>
        <span>┄ pipeline</span>
      </div>
    </div>`;
}

function bar(share: number, warnAt = 0.8, badAt = 0.95): Html {
  const cls = share >= badAt ? 'bad' : share >= warnAt ? 'warn' : '';
  return html`<div class="bar ${cls}"><div style="width:${Math.min(100, Math.max(0, share * 100)).toFixed(1)}%"></div></div>`;
}

const fact = (label: string, value: Html | string) => html`<div class="fact"><div class="label">${label}</div><div class="value">${value}</div></div>`;

const SETTINGS: Readonly<Record<string, { label: string; options: readonly [string, string][] }>> = {
  risk: { label: 'Risk', options: [['BOLD', 'Bold'], ['BALANCED', 'Balanced'], ['SAFE', 'Safe']] },
  selling: { label: 'Selling', options: [['SELL_FAST', 'Sell fast'], ['BALANCED', 'Balanced'], ['HOLD_FOR_PRICE', 'Hold for price']] },
  stockpile: { label: 'Stockpile', options: [['LEAN', 'Lean'], ['NORMAL', 'Normal'], ['DEEP', 'Deep']] },
  appetite: { label: 'Appetite', options: [['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High']] },
};
const SETTINGS_FOR: Readonly<Record<string, readonly string[]>> = {
  PRODUCER: ['risk', 'selling'], REFINER: ['risk', 'stockpile'], INTEGRATED: ['risk', 'selling', 'stockpile'], TRADER: ['risk', 'appetite'],
};

/** The player's company (spec G2, G4.2): assets, stock, projects and its two settings. */
export function companyPanel(view: PlayerView): Html {
  const c = view.company;
  const w = c.well;
  const settings = (SETTINGS_FOR[c.kind] ?? []).map((key) => {
    const s = SETTINGS[key];
    if (!s) return '';
    const current = (c.settings as unknown as Record<string, string>)[key];
    return html`<div><div class="small muted">${s.label}</div><div class="seg">${s.options.map(([v, label]) => html`<button data-setting="${key}" data-value="${v}" class="${v === current ? 'active' : ''}">${label}</button>`)}</div></div>`;
  });
  return html`
    <div class="facts">
      ${fact('Cash', money(c.cash))}
      ${fact('Net worth', money(c.netWorth))}
      ${fact('Credit used', `${money(c.creditDrawn)} of ${money(c.creditLimit)}`)}
      ${w ? html`
        ${fact('Crude', words(w.grade))}
        ${fact('Wells pump', `${bbl(w.capacity * w.outputRate)} of ${bbl(w.capacity)} bbl/day${w.shutIn ? ' (stopped: tanks full)' : ''}`)}
        ${fact('Field', w.capacity >= w.peakCapacity - 1
          ? html`${bbl(w.capacity)} bbl/day, the best it has managed`
          : html`${bbl(w.capacity)} bbl/day, <span class="bad">down ${pct(1 - w.capacity / Math.max(1, w.peakCapacity))}</span> from its best of ${bbl(w.peakCapacity)}. Fields decline: drilling is what brings them back.`)}
        ${fact('In store', html`${bbl(w.storage)} of ${bbl(w.storageCapacity)} bbl <span class="muted">(${pct(w.storage / Math.max(1, w.storageCapacity))} full)</span>${bar(w.storage / Math.max(1, w.storageCapacity))}`)}` : ''}
      ${view.company.sites.map((site) => {
        const held = site.stock.LIGHT_SWEET + site.stock.MEDIUM + site.stock.HEAVY_SOUR;
        const where = view.company.sites.length > 1 ? `${regionName(site.region)}: ` : '';
        return html`
          ${fact(`${where}refinery`, `Tier ${site.techTier} · ${bbl(site.capacity)} bbl/day`)}
          ${fact(`${where}running at`, site.online ? pct(site.runRate) : `stopped, ${site.offlineDays} days to go`)}
          ${fact(`${where}crude in tanks`, html`${bbl(held)} of ${bbl(site.tankCapacity)} bbl <span class="muted">(${(held / Math.max(1, site.capacity)).toFixed(1)} days of refining)</span>${bar(held / Math.max(1, site.tankCapacity), 2, 2)}`)}
          ${fact(`${where}on the way`, `${bbl(site.inbound)} bbl`)}
          ${fact(`${where}since maintenance`, `${site.daysSinceMaintenance} days`)}`;
      })}
      ${c.hubs.map((h) => {
        const held = h.stock.LIGHT_SWEET + h.stock.MEDIUM + h.stock.HEAVY_SOUR;
        return fact(`${regionName(h.region)} office`, html`${bbl(held)} of ${bbl(h.capacity)} bbl <span class="muted">(${pct(held / Math.max(1, h.capacity))} full)</span>${bar(held / Math.max(1, h.capacity))}`);
      })}
    </div>
    ${w ? w.leases.map((l) => leaseBlock(l)) : ''}
    ${c.projects.length > 0 ? html`
      <h3 style="margin-top:14px">Building</h3>
      <table><tr><th>Project</th><th class="num">Days left</th><th class="num">Cost a day</th></tr>
      ${c.projects.map((pr) => html`<tr><td>${PROJECT_NAMES[pr.kind] ?? words(pr.kind)}${pr.paused ? ' (paused)' : ''}</td><td class="num">${pr.daysLeft}</td><td class="num">${money(pr.dailyCost)}</td></tr>`)}
      </table>` : ''}
    <div class="settings">${settings}</div>`;
}

const BAND_WORDS: Readonly<Record<string, string>> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const WELL_WORDS: Readonly<Record<string, string>> = {
  PUMPING: 'pumping', DOWN: 'down', MAINTENANCE: 'in maintenance', DRILLING: 'being drilled',
  SPENT: 'spent — its share of the ground is lifted',
};

/**
 * One lease and its wells (spec §12A.3). How much oil is left is the engine's business: the player
 * is told the survey's band and nothing more, so the board shows what each well is doing and what
 * the lease makes between them.
 */
function leaseBlock(l: LeaseView): Html {
  const pumping = l.wells.filter((x) => x.status === 'PUMPING').length;
  const spent = l.wells.filter((x) => x.status === 'SPENT').length;
  return html`
    <h3 style="margin-top:14px">${l.name} <span class="small muted">estimated size ${BAND_WORDS[l.band] ?? l.band}</span></h3>
    <div class="wells">
      ${l.wells.map((x) => html`<span class="well ${x.status}" title="${bbl(x.rate)} bbl/day, ${WELL_WORDS[x.status] ?? x.status}${x.daysLeft > 0 ? `, ${x.daysLeft} days to go` : ''}"></span>`)}
      ${Array.from({ length: Math.max(0, l.maxWells - l.wells.length) }, () => html`<span class="well SLOT" title="room for another well"></span>`)}
    </div>
    <div class="small muted">${pumping} of ${l.wells.length} wells pumping, ${bbl(l.capacity)} bbl/day${spent > 0 ? ` · ${spent} spent` : ''}${l.maxWells > l.wells.length ? ` · room for ${l.maxWells - l.wells.length} more` : ' · no room for more'}</div>`;
}

const PROJECT_NAMES: Readonly<Record<string, string>> = {
  DRILL: 'New wells', STORAGE: 'More storage', TIER: 'Refinery upgrade', UNIT: 'New processing unit', REFINERY: 'Your own refinery',
};

export function sparkline(values: readonly number[]): Html {
  if (values.length < 2) return raw('');
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * 140).toFixed(1)},${(30 - ((v - min) / span) * 28).toFixed(1)}`).join('');
  return html`<svg class="spark" viewBox="0 0 140 32"><path d="${d}"></path></svg>`;
}

const GRADE_NAMES: Readonly<Record<string, string>> = { LIGHT_SWEET: 'Light crude', MEDIUM: 'Medium crude', HEAVY_SOUR: 'Heavy crude' };

/** Where a price was `days` ago, or the oldest day recorded if the game is younger than that. */
function before(view: PlayerView, days: number): DailyPrices | undefined {
  return view.history[Math.max(0, view.history.length - 1 - days)];
}

const arrow = (change: number, price: number) =>
  Math.abs(change) < price * 0.005 ? html`<span class="flat">steady</span>`
    : html`<span class="${change > 0 ? 'good' : 'bad'}">${change > 0 ? '▲' : '▼'} ${money(Math.abs(change))}</span>`;

/**
 * Today's prices next to the decisions (G5). A deal is only good or bad against the market it is
 * priced off, and against which way that market has been moving, so both belong on the same screen
 * as the answer — not a tab away.
 */
export function priceStrip(view: PlayerView): Html {
  const week = before(view, 7);
  const spark = view.history.slice(-30);
  const home = view.company.region;
  // Cards quote the price crude fetched where it comes out of the ground, which is the world price
  // less the freight to reach a buyer. Showing only the world price would leave the two disagreeing.
  const anyLocal = view.markets.some((m) => m.closes[home] !== undefined);
  return html`
    <section class="panel prices">
      <h2>Today's prices <span class="small muted">and the last week</span></h2>
      <table>
        <tr><th></th><th class="num">World</th>${anyLocal ? html`<th class="num">Here</th>` : ''}<th class="num">7 days</th><th></th></tr>
        ${view.markets.map((m) => {
          const then = week?.markers[m.node] ?? m.marker;
          const local = m.closes[home];
          return html`<tr><td>${GRADE_NAMES[m.grade] ?? m.grade}</td>
            <td class="num strong">${money(m.marker)}</td>
            ${anyLocal ? html`<td class="num strong">${local === undefined ? '—' : money(local)}</td>` : ''}
            <td class="num">${arrow(m.marker - then, m.marker)}</td>
            <td class="sparkcell">${sparkline(spark.map((d) => d.markers[m.node]))}</td></tr>`;
        })}
        ${Object.entries(view.products).map(([name, price]) => {
          const then = (week?.products as Record<string, number> | undefined)?.[name] ?? price;
          return html`<tr class="fuel"><td>${words(name)}</td>
            <td class="num strong">${money(price)}</td>
            ${anyLocal ? html`<td></td>` : ''}
            <td class="num">${arrow(price - then, price)}</td>
            <td class="sparkcell">${sparkline(spark.map((d) => (d.products as Record<string, number>)[name] ?? price))}</td></tr>`;
        })}
      </table>
      <p class="small muted">${anyLocal ? html`<strong>World</strong> is what that crude fetched
        wherever it traded today; <strong>Here</strong> is what it fetched coming out of
        ${regionName(home)} — the world price, less the cost of shipping it to a buyer. An offer is
        worth judging against <strong>Here</strong>.` : html`A price is what crude actually changed
        hands for today. Judge an offer against the price of that crude, and against which way the
        arrow points.`}</p>
    </section>`;
}

/** The open market, deals and crude at sea. */
export function dealsPanel(view: PlayerView): Html {
  const deals = view.deals.filter((d) => d.status === 'ACTIVE');
  const traded = view.markets.reduce((t, m) => t + m.tradedToday, 0);
  const afloat = view.cargo.reduce((t, c) => t + c.qty * (view.markets.find((m) => m.grade === c.grade)?.marker ?? 0), 0);
  return html`
    <h3>The open market today</h3>
    <p class="small muted">Every company puts its crude up here each day, and the highest bids take
      it. This is where your crude goes when no deal is against it — ${traded > 0
        ? html`today ${bbl(traded)} barrels changed hands.`
        : html`nothing has traded yet today; the day's clearing happens as the clock runs.`}
      The world price is what that crude is worth in its home market; what a seller was actually
      paid at its own port is lower, by the cost of shipping it to a buyer.</p>
    <table><tr><th>Crude</th><th class="num">World price</th><th class="num">Traded today</th><th class="num">Trades</th><th class="num">Paid at the port</th></tr>
      ${view.markets.map((m) => html`<tr><td>${GRADE_NAMES[m.grade] ?? m.grade}</td>
        <td class="num">${money(m.marker)}</td>
        <td class="num">${m.tradedToday > 0 ? `${bbl(m.tradedToday)} bbl` : '—'}</td>
        <td class="num">${m.trades > 0 ? m.trades : '—'}</td>
        <td class="num">${m.trades > 0 ? `${money(m.low)}–${money(m.high)}` : '—'}</td></tr>`)}
    </table>
    <h3 style="margin-top:14px">Deals</h3>
    ${deals.length === 0 ? html`<p class="muted">No deals. Offers arrive as cards, or open “Find a deal”.</p>` : html`
      <table><tr><th>With</th><th></th><th>Crude</th><th class="num">bbl/day</th><th class="num">Price</th><th class="num">vs market</th><th>Runs until</th></tr>
      ${deals.map((d) => {
        // A deal is worth judging against the price of the same crude today: that gap, times the
        // daily volume, is what the deal makes or costs you every day it still has to run.
        const market = view.markets.find((m) => m.grade === d.grade)?.marker ?? d.price;
        const edge = (d.role === 'BUYER' ? market - d.price : d.price - market) * d.qtyPerDay;
        const left = Math.max(0, d.endTick - view.tick);
        return html`<tr><td>${d.partner}</td><td>${d.role === 'BUYER' ? 'you buy' : 'you sell'}</td><td>${GRADE_NAMES[d.grade] ?? d.grade}</td>
          <td class="num">${bbl(d.qtyPerDay)}</td><td class="num">${money(d.price)}</td>
          <td class="num ${edge > 0 ? 'good' : edge < 0 ? 'bad' : ''}">${signed(edge)}/day</td>
          <td>${dateOf(d.endTick)} <span class="muted">(${left} days)</span></td></tr>`;
      })}
      </table>`}
    <h3 style="margin-top:14px">Your crude at sea</h3>
    ${view.cargo.length === 0 ? html`<p class="muted">None.</p>` : html`
      <p class="small muted">Crude is paid for when it is loaded, not when it lands: this is money
        already spent, on its way to you. ${afloat > 0 ? html`About <strong>${money(afloat)}</strong> of
        it at today's prices.` : ''}</p>
      <table><tr><th>Crude</th><th class="num">Barrels</th><th class="num">Worth</th><th>To</th><th>Status</th><th class="num">Days out</th></tr>
      ${view.cargo.map((c) => html`<tr><td>${GRADE_NAMES[c.grade] ?? c.grade}</td><td class="num">${bbl(c.qty)}</td>
        <td class="num">${money(c.qty * (view.markets.find((m) => m.grade === c.grade)?.marker ?? 0))}</td>
        <td>${regionName(c.destination)}</td>
        <td>${c.status === 'HELD' ? html`<span class="bad">waiting at a strait</span>` : words(c.status)}</td><td class="num">${c.daysAtSea}</td></tr>`)}
      </table>`}`;
}

/** The cost groups, in the order they are worth reading. */
const COST_LABELS: readonly (readonly ['pumping' | 'refining' | 'shipping' | 'running' | 'building', string])[] = [
  ['pumping', 'pumping'], ['refining', 'refining'], ['shipping', 'shipping'],
  ['running', 'running the company'], ['building', 'building'],
];

/** A column of the Activity table: what to call it, and how to read it off a day. */
interface Column { readonly label: string; readonly of: (d: DayLog) => string; readonly money?: boolean }

// What a day came to in money is the barrels times the price a barrel, both of which are here, and
// "made today" already gives the bottom line: the totals were a column doing no work.
const COLUMNS: Readonly<Record<string, readonly string[]>> = {
  PRODUCER: ['pumped', 'sold', 'soldAt', 'buyer', 'costs', 'made', 'store', 'cash'],
  REFINER: ['bought', 'paidAt', 'seller', 'refined', 'fuel', 'costs', 'made', 'store', 'cash'],
  INTEGRATED: ['pumped', 'refined', 'fuel', 'bought', 'paidAt', 'sold', 'soldAt', 'buyer', 'costs', 'made', 'store', 'cash'],
  TRADER: ['bought', 'paidAt', 'seller', 'sold', 'soldAt', 'buyer', 'costs', 'made', 'store', 'cash'],
};

const ALL_COLUMNS: Readonly<Record<string, Column>> = {
  pumped: { label: 'Pumped', of: (d) => (d.pumped > 0 ? `${bblShort(d.pumped)} bbl` : '—') },
  refined: { label: 'Refined', of: (d) => (d.refined > 0 ? `${bblShort(d.refined)} bbl` : '—') },
  fuel: { label: 'Fuel sold', of: (d) => (d.fuelRevenue > 0 ? money(d.fuelRevenue) : '—'), money: true },
  bought: { label: 'Bought', of: (d) => (d.boughtQty > 0 ? `${bblShort(d.boughtQty)} bbl` : '—') },
  sold: { label: 'Sold', of: (d) => (d.soldQty > 0 ? `${bblShort(d.soldQty)} bbl` : '—') },
  soldAt: { label: 'Sold at', of: (d) => (d.soldQty > 0 ? money(d.soldRevenue / d.soldQty) : '—') },
  paidAt: { label: 'Paid a barrel', of: (d) => (d.boughtQty > 0 ? money(d.boughtCost / d.boughtQty) : '—') },
  buyer: { label: 'Who bought it', of: (d) => who(d.soldTo) },
  seller: { label: 'Who from', of: (d) => who(d.boughtFrom) },
  costs: { label: 'Costs', of: (d) => (d.costs.total > 0 ? money(d.costs.total) : '—'), money: true },
  made: { label: 'Made today', of: (d) => signed(madeOn(d)), money: true },
  store: { label: 'Crude held', of: (d) => `${bblShort(d.stock)} bbl` },
  cash: { label: 'Cash in hand', of: (d) => money(d.cash) },
};

/**
 * The other side of the day's trading. Most days it is one company; when it is more, the biggest
 * is named and the rest counted, so the column stays one line wide.
 */
function who(parties: readonly Counterparty[]): string {
  const first = parties[0];
  if (first === undefined) return '—';
  const rest = parties.length - 1;
  const where = `${first.name} (${regionName(first.region)})${first.deal ? ', on your deal' : ''}`;
  return rest === 0 ? where : `${where} +${rest} more`;
}

/** Money in less money out: sales and fuel, less the crude bought and everything the day cost. */
const madeOn = (d: DayLog) => d.soldRevenue + d.fuelRevenue - d.boughtCost - d.costs.total;

/**
 * What the company actually did, day by day (spec G5). The company trades on its own, so without
 * this the player sees only a stock level going up and a cash balance moving, and never the
 * barrels or the prices behind either.
 */
export function activityPanel(view: PlayerView): Html {
  const days = [...view.days].reverse();
  const keys = COLUMNS[view.company.kind] ?? COLUMNS.PRODUCER ?? [];
  const columns = keys.map((k) => ALL_COLUMNS[k]).filter((c): c is Column => c !== undefined);
  // A refinery only buys, a producer only sells: say the one the player will actually see.
  const buys = view.company.kind !== 'PRODUCER';
  const sells = view.company.kind !== 'REFINER';
  const month = view.days.slice(-30);
  const sum = (pick: (d: DayLog) => number) => month.reduce((t, d) => t + pick(d), 0);
  const soldQty = sum((d) => d.soldQty), soldFor = sum((d) => d.soldRevenue);
  const boughtQty = sum((d) => d.boughtQty), paid = sum((d) => d.boughtCost);
  const fuel = sum((d) => d.fuelRevenue);
  return html`
    ${days.length === 0 ? html`<p class="muted">Nothing yet — let the clock run.</p>` : html`
      <p class="small">Over the last ${month.length === 1 ? 'day' : `${month.length} days`}:
        ${soldQty > 0 ? html`sold <strong>${bbl(soldQty)} bbl</strong> for <strong>${money(soldFor)}</strong>, an average of ${money(soldFor / soldQty)} a barrel` : 'sold nothing'}${boughtQty > 0 ? html`; bought <strong>${bbl(boughtQty)} bbl</strong> for <strong>${money(paid)}</strong>, an average of ${money(paid / boughtQty)} a barrel` : ''}.</p>
      <p class="small">Costs over the same ${month.length === 1 ? 'day' : 'days'}:
        ${COST_LABELS.map(([key, label]) => {
          const amount = sum((d) => d.costs[key]);
          return amount <= 0 ? '' : html`${label} <strong>${money(amount)}</strong> · `;
        })}in all <strong>${money(sum((d) => d.costs.total))}</strong>${fuel > 0 ? html`. Fuel sold brought in <strong>${money(fuel)}</strong>` : ''}.
        <span class="muted">Buying crude is shown separately, in the table.</span></p>
      <p class="small muted">Anything with no deal against it went through the open market, where
        your company trades every day without being asked: ${sells ? html`it puts its crude up for
        sale and the highest bid takes it${buys ? ', and ' : '. '}` : ''}${buys ? html`it bids for
        crude, and wins the cargo that lands cheapest. ` : ''}The Deals tab lists only fixed-price
        contracts, which deliver a set amount every day until they run out.</p>
      <table class="activity">
        <tr><th>Day</th>${columns.map((c) => html`<th class="num">${c.label}</th>`)}</tr>
        ${days.map((d) => html`<tr><td>${dateOf(d.tick)}</td>${columns.map((c) => html`<td class="num ${c.label === 'Made today' ? (madeOn(d) > 0 ? 'good' : madeOn(d) < 0 ? 'bad' : '') : ''}">${c.of(d)}</td>`)}</tr>`)}
      </table>`}`;
}

const LEASING_WORDS: Readonly<Record<string, string>> = {
  OPEN: 'open to anyone', LICENSED: 'licence needed', NATIONAL: 'held by the state',
};

/**
 * The lease register (spec §12A.4): who holds ground where, and where you could take some. The
 * survey's band and the owner are public; what anyone's wells found is not.
 */
export function leasesPanel(view: PlayerView): Html {
  const held = view.register.flatMap((r) => r.blocks.filter((b) => b.mine)).length;
  return html`
    <p class="small">You hold ${held === 1 ? 'one block' : `${held} blocks`}. Ground changes hands
      once a year: bids are sealed, everyone gets one, and the highest takes it. What a survey calls
      it is all anyone is told — the barrels underneath are nobody's business but the owner's.</p>
    <table class="register">
      <tr><th>Region</th><th>Ground</th><th>Blocks held</th></tr>
      ${view.register.map((r) => html`<tr class="${r.mayBid ? 'open' : ''}">
        <td>${r.displayName}${r.mayBid ? html` <span class="small good">you may bid</span>` : ''}</td>
        <td class="small muted">${LEASING_WORDS[r.leasing] ?? r.leasing}</td>
        <td>${r.blocks.length === 0 ? html`<span class="muted">none</span>` : r.blocks.map((b) => html`<div class="${b.mine ? 'mine' : ''}">${b.name} <span class="small muted">· ${b.owner} · ${BAND_WORDS[b.band] ?? b.band} · ${b.slots} slots</span></div>`)}</td>
      </tr>`)}
    </table>`;
}

/** News and alerts, newest first. */
export function newsPanel(view: PlayerView): Html {
  const alerts = [...view.alerts].reverse().slice(0, 20);
  const troubled = view.chokepoints.filter((c) => c.status !== 'OPEN');
  return html`
    <details class="how">
      <summary>How the news moves prices</summary>
      <p>No headline sets a price. Prices are whatever crude actually sold for today, and the news
        changes what selling costs.</p>
      <p>A <strong>tense</strong> or <strong>congested</strong> strait adds war-risk cover to every
        barrel crossing it, and a congested one adds days to the voyage. A <strong>closed</strong>
        strait stops crossings altogether: ships go the long way round, or crude leaves by pipeline
        if there is one.</p>
      <p>So crude stuck on the wrong side of a closed strait gets <em>cheaper</em> — nobody can
        fetch it — while crude that buyers can still reach gets <em>dearer</em>. That is why a
        closure is bad news for a producer behind it, and can be good news for one outside it.</p>
    </details>
    ${troubled.length === 0 ? html`<p class="small muted">Every strait is open today.</p>` : html`
      <table class="straits">
        ${troubled.map((c) => html`<tr><td><span class="risk ${c.status === 'CLOSED' ? 'HIGH' : 'MEDIUM'}">${STRAIT_WORDS[c.status] ?? words(c.status)}</span></td>
          <td>${c.displayName}</td>
          <td class="num">${c.status === 'CLOSED' ? 'no crossings' : `${c.surcharge > 0 ? `+${money(c.surcharge)}/bbl` : ''}${c.extraDays > 0 ? `${c.surcharge > 0 ? ', ' : ''}+${c.extraDays} days` : ''}` || '—'}</td></tr>`)}
      </table>`}
    <h3 style="margin-top:14px">News</h3>
    ${view.news.length === 0 ? html`<p class="muted">A quiet market so far.</p>` : html`
      <ul class="alerts">${view.news.map((n) => html`<li><span class="sev INFO">${dateOf(n.tick)}</span><strong>${n.headline}.</strong> <span class="muted">${n.body}</span></li>`)}</ul>`}
    <h3 style="margin-top:14px">Your alerts</h3>
    ${alerts.length === 0 ? html`<p class="muted">Nothing yet.</p>` : html`
    <ul class="alerts">${alerts.map((a) => html`<li><span class="sev ${a.severity}">${dateOf(a.tick)}</span>${a.message}</li>`)}</ul>`}
    ${view.reports.length > 0 ? html`<h3 style="margin-top:14px">Market reports</h3>
      ${view.reports.slice(-3).reverse().map((r) => html`<p class="small muted">As of ${dateOf(r.asOf)} — rough crude held by region:</p>
        <table>${Object.entries(r.byRegion).filter(([, q]) => (q ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 8)
          .map(([region, q]) => html`<tr><td>${regionName(region)}</td><td class="num">${bbl(q ?? 0)} bbl</td></tr>`)}</table>`)}` : ''}`;
}
