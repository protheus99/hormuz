// The game screen's panels: the map, the company, markets, deals and cargo, and news.

import { mapLayout, regionName, type PlayerView, type Point } from '../src/game';
import { bbl, dateOf, html, money, pct, raw, words, type Html } from './dom';

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
  const p = c.plant;
  const stock = p ? p.stock.LIGHT_SWEET + p.stock.MEDIUM + p.stock.HEAVY_SOUR : 0;
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
        ${fact(`Storage ${pct(w.storage / Math.max(1, w.storageCapacity))} full`, bar(w.storage / Math.max(1, w.storageCapacity)))}` : ''}
      ${p ? html`
        ${fact('Refinery', `Tier ${p.techTier} · ${bbl(p.capacity)} bbl/day`)}
        ${fact('Running at', p.online ? pct(p.runRate) : `stopped, ${p.offlineDays} days to go`)}
        ${fact(`Crude in tanks: ${(stock / Math.max(1, p.capacity)).toFixed(1)} days`, bar(stock / Math.max(1, p.tankCapacity), 2, 2))}
        ${fact('On the way', `${bbl(p.inbound)} bbl`)}
        ${fact('Since maintenance', `${p.daysSinceMaintenance} days`)}` : ''}
      ${c.hubs.map((h) => {
        const held = h.stock.LIGHT_SWEET + h.stock.MEDIUM + h.stock.HEAVY_SOUR;
        return fact(`${regionName(h.region)} office: ${bbl(held)} bbl`, bar(held / Math.max(1, h.capacity)));
      })}
    </div>
    ${c.projects.length > 0 ? html`
      <h3 style="margin-top:14px">Building</h3>
      <table><tr><th>Project</th><th class="num">Days left</th><th class="num">Cost a day</th></tr>
      ${c.projects.map((pr) => html`<tr><td>${PROJECT_NAMES[pr.kind] ?? words(pr.kind)}${pr.paused ? ' (paused)' : ''}</td><td class="num">${pr.daysLeft}</td><td class="num">${money(pr.dailyCost)}</td></tr>`)}
      </table>` : ''}
    <div class="settings">${settings}</div>`;
}

const PROJECT_NAMES: Readonly<Record<string, string>> = {
  DRILL: 'New wells', STORAGE: 'More storage', TIER: 'Refinery upgrade', UNIT: 'New processing unit', REFINERY: 'Your own refinery',
};

function sparkline(values: readonly number[]): Html {
  if (values.length < 2) return raw('');
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * 140).toFixed(1)},${(30 - ((v - min) / span) * 28).toFixed(1)}`).join('');
  return html`<svg class="spark" viewBox="0 0 140 32"><path d="${d}"></path></svg>`;
}

const GRADE_NAMES: Readonly<Record<string, string>> = { LIGHT_SWEET: 'Light crude', MEDIUM: 'Medium crude', HEAVY_SOUR: 'Heavy crude' };

/** Public prices (spec G5): crude markers and fuels, with the last 90 days. */
export function marketsPanel(view: PlayerView): Html {
  const recent = view.history.slice(-90);
  return html`
    <table>
      <tr><th>Crude</th><th class="num">Price</th><th class="num">30 days ago</th><th>Last 90 days</th></tr>
      ${view.markets.map((m) => {
        const before = recent[Math.max(0, recent.length - 31)]?.markers[m.node] ?? m.marker;
        const change = m.marker - before;
        return html`<tr><td>${GRADE_NAMES[m.grade] ?? m.grade}</td><td class="num">${money(m.marker)}</td>
          <td class="num ${change >= 0 ? 'good' : 'bad'}">${change >= 0 ? '+' : '−'}${money(Math.abs(change))}</td>
          <td>${sparkline(recent.map((d) => d.markers[m.node]))}</td></tr>`;
      })}
      <tr><th>Fuel</th><th class="num">Price</th><th></th><th></th></tr>
      ${Object.entries(view.products).map(([name, price]) => html`<tr><td>${words(name)}</td><td class="num">${money(price)}</td><td></td>
        <td>${sparkline(recent.map((d) => (d.products as Record<string, number>)[name] ?? price))}</td></tr>`)}
    </table>`;
}

/** Deals and crude at sea. */
export function dealsPanel(view: PlayerView): Html {
  const deals = view.deals.filter((d) => d.status === 'ACTIVE');
  return html`
    <h3>Deals</h3>
    ${deals.length === 0 ? html`<p class="muted">No deals. Offers arrive as cards, or open “Find a deal”.</p>` : html`
      <table><tr><th>With</th><th></th><th>Crude</th><th class="num">bbl/day</th><th class="num">Price</th><th class="num">Ends</th></tr>
      ${deals.map((d) => html`<tr><td>${d.partner}</td><td>${d.role === 'BUYER' ? 'you buy' : 'you sell'}</td><td>${GRADE_NAMES[d.grade] ?? d.grade}</td>
        <td class="num">${bbl(d.qtyPerDay)}</td><td class="num">${money(d.price)}</td><td class="num">day ${d.endTick}</td></tr>`)}
      </table>`}
    <h3 style="margin-top:14px">Your crude at sea</h3>
    ${view.cargo.length === 0 ? html`<p class="muted">None.</p>` : html`
      <table><tr><th>Crude</th><th class="num">Barrels</th><th>To</th><th>Status</th><th class="num">Days out</th></tr>
      ${view.cargo.map((c) => html`<tr><td>${GRADE_NAMES[c.grade] ?? c.grade}</td><td class="num">${bbl(c.qty)}</td><td>${regionName(c.destination)}</td>
        <td>${c.status === 'HELD' ? html`<span class="bad">waiting at a strait</span>` : words(c.status)}</td><td class="num">${c.daysAtSea}</td></tr>`)}
      </table>`}`;
}

/** News and alerts, newest first. */
export function newsPanel(view: PlayerView): Html {
  const alerts = [...view.alerts].reverse().slice(0, 20);
  return html`
    <h3>News</h3>
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
