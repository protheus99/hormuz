// The decision inbox (spec G4.1): each card's situation, its options with the four meters, the
// deadline, affordability and a Details expander; and the Opportunities list.

import type { Card, CardOption, PlayerView } from '../src/game';
import { dateOf, html, money, signed, type Html } from './dom';

const RISK_WORDS = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const;
const RISK_REASONS = { ROUTES: 'shipping routes through troubled straits', BREAKDOWN: 'a refinery breakdown', CASH: 'running short of cash', NONE: '' } as const;

function supply(o: CardOption): string {
  const s = o.impact?.supply;
  if (!s) return '';
  if (s.unit === 'days') return `Supply ${s.value.toFixed(1)} days`;
  if (s.unit === 'fill') return `Storage ${Math.round(s.value * 100)}% full`;
  return `Holdings ${money(s.value)}`;
}

function option(card: Card, o: CardOption, answered: string | undefined): Html {
  const i = o.impact;
  const disabled = answered !== undefined || !o.affordable;
  return html`
    <button class="option" data-card="${card.id}" data-choice="${o.choice}" ${disabled ? 'disabled' : ''}>
      <span class="choice ${o.choice}">${o.choice === 'YES' ? 'Yes' : o.choice === 'MAYBE' ? 'Maybe' : 'No'}</span>${o.label}
      ${i ? html`<div class="meters">
        <span>Cash ${i.cash > 0 ? `−${money(i.cash)}` : 'no change'}</span>
        <span class="${i.profit > 0 ? 'good' : i.profit < 0 ? 'bad' : ''}">Profit ${Math.abs(i.profit) < 500 ? 'no change' : `${signed(i.profit)}/mo`}</span>
        <span>${supply(o)}</span>
        <span>Risk <span class="risk ${i.risk}">${RISK_WORDS[i.risk]}</span></span>
      </div>` : ''}
      ${o.affordable ? '' : html`<div class="unaffordable">Not enough money yet${o.affordableInDays !== null ? ` — about ${o.affordableInDays} days at current profit` : ' — not at current profit'}</div>`}
    </button>`;
}

function card(c: Card, answered: string | undefined, open: boolean): Html {
  const reasons = c.options.map((o) => o.impact?.riskReason).filter((r) => r && r !== 'NONE');
  return html`
    <article class="card ${c.opportunity ? 'opportunity' : ''}">
      <div class="head"><h3>${c.title}</h3>
        ${c.deadline !== null ? html`<span class="deadline">Decide by ${dateOf(c.deadline)}</span>` : html`<button class="btn small" data-close="${c.id}">Close</button>`}</div>
      <p class="situation">${c.situation}</p>
      ${answered ? html`<div class="answered">You chose ${answered === 'YES' ? 'Yes' : answered === 'MAYBE' ? 'Maybe' : 'No'} — it takes effect tomorrow.</div>` : ''}
      ${c.options.map((o) => option(c, o, answered))}
      <details data-details="${c.id}" ${open ? 'open' : ''}><summary>Details</summary>
        <p>${c.details || 'No further numbers.'}</p>
        ${c.options.map((o) => html`<p>${o.choice}: costs ${money(o.totalCost)} in all${o.impact && o.impact.riskReason !== 'NONE' ? `; risk comes from ${RISK_REASONS[o.impact.riskReason]}` : ''}.</p>`)}
        ${reasons.length === 0 ? html`<p>Meters show the next 30 days if today’s conditions hold.</p>` : ''}
      </details>
    </article>`;
}

/** The inbox. `answered` maps card ids answered today to the choice made. */
export function inboxPanel(view: PlayerView, answered: ReadonlyMap<string, string>, openDetails: ReadonlySet<string>): Html {
  const raised = view.cards.filter((c) => !c.opportunity);
  const opened = view.cards.filter((c) => c.opportunity);
  const openTypes = new Set(opened.map((c) => c.type as string));
  return html`
    <section class="panel">
      <h2>Decisions <span class="small muted">${raised.length} open</span></h2>
      ${raised.length === 0 ? html`<p class="inbox-empty">No decisions waiting. The company is running itself.</p>` : raised.map((c) => card(c, answered.get(c.id), openDetails.has(c.id)))}
    </section>
    <section class="panel">
      <h2>Opportunities</h2>
      ${opened.map((c) => card(c, answered.get(c.id), openDetails.has(c.id)))}
      <div class="opps">${view.opportunities.filter((o) => !openTypes.has(o.type)).map((o) => html`<button class="btn" data-opp="${o.type}">${o.title}</button>`)}</div>
    </section>`;
}
