// The decision inbox (spec G4.1): each card's situation, its options with the four meters, the
// deadline, affordability and a Details expander; and the Opportunities list.

import type { Card, CardOption, PlayerView } from '../src/game';
import { dateOf, html, money, signed, type Html } from './dom';
import { priceStrip } from './panels';

const RISK_WORDS = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const;
const RISK_REASONS = { ROUTES: 'shipping routes through troubled straits', BREAKDOWN: 'a refinery breakdown', CASH: 'running short of cash', NONE: '' } as const;

function supply(o: CardOption): string {
  const s = o.impact?.supply;
  if (!s) return '';
  if (s.unit === 'days') return `Supply ${s.value.toFixed(1)} days`;
  if (s.unit === 'fill') return `Storage ${Math.round(s.value * 100)}% full`;
  return `Holdings ${money(s.value)}`;
}

/**
 * How long an answer ties you in: a deal's term, a run-rate cap's month, a charter's hire. The
 * meters project 30 days, so without this a 90-day deal and a 30-day one read exactly alike.
 */
export function commitmentDays(o: CardOption): number {
  let days = 0;
  for (const a of o.actions) {
    if (a.kind === 'SIGN_DEAL') days = Math.max(days, a.terms.termDays);
    else if ('days' in a) days = Math.max(days, a.days);
  }
  return days;
}

/** What the answer earns over its whole term, if today's conditions held — a rate is not a total. */
export function overTerm(o: CardOption): string {
  const profit = o.impact?.profit ?? 0;
  const days = commitmentDays(o);
  if (days <= 30 || Math.abs(profit) < 500) return '';
  return `${signed((profit * days) / 30)} over ${days} days`;
}

/**
 * What this answer costs. A project — new wells, more tanks, a refinery — takes nothing today and
 * then bills every day while it is built, so showing "no change" would hide the whole commitment.
 */
export function cash(o: CardOption): string {
  const now = o.impact?.cash ?? 0;
  if (o.totalCost > now + 1) return `Cash −${money(o.totalCost)} in all`;
  return now > 0 ? `Cash −${money(now)} now` : 'Cash no change';
}

function option(card: Card, o: CardOption, answered: string | undefined): Html {
  const i = o.impact;
  const disabled = answered !== undefined || !o.affordable;
  const state = answered === undefined ? '' : answered === o.choice ? 'chosen' : 'passed';
  return html`
    <button class="option ${state}" data-card="${card.id}" data-choice="${o.choice}" ${disabled ? 'disabled' : ''}>
      <span class="choice ${o.choice}">${o.choice === 'YES' ? 'Yes' : o.choice === 'MAYBE' ? 'Maybe' : 'No'}</span>${o.label}
      ${state === 'chosen' ? html`<span class="picked">✓ your answer</span>` : ''}
      ${i ? html`<div class="meters">
        <span>${cash(o)}</span>
        <span class="${i.profit > 0 ? 'good' : i.profit < 0 ? 'bad' : ''}">Profit ${Math.abs(i.profit) < 500 ? 'no change' : `${signed(i.profit)}/mo`}</span>
        ${overTerm(o) === '' ? '' : html`<span class="term ${i.profit > 0 ? 'good' : 'bad'}">≈ ${overTerm(o)}</span>`}
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
      ${c.options.map((o) => option(c, o, answered))}
      ${answered ? html`<div class="answered">You chose ${answered === 'YES' ? 'Yes' : answered === 'MAYBE' ? 'Maybe' : 'No'} — it takes effect tomorrow.</div>` : ''}
      <details data-details="${c.id}" ${open ? 'open' : ''}><summary>Details</summary>
        <p>${c.details || 'No further numbers.'}</p>
        ${c.options.map((o) => html`<p>${o.choice}: costs ${money(o.totalCost)} in all${o.impact && o.impact.riskReason !== 'NONE' ? `; risk comes from ${RISK_REASONS[o.impact.riskReason]}` : ''}.</p>`)}
        ${reasons.length === 0 ? html`<p>Meters show the next 30 days if today’s conditions hold.</p>` : ''}
      </details>
    </article>`;
}

/** The scenario's goal, shown on demand behind the Mission button rather than taking the column. */
export function missionPanel(view: PlayerView): Html {
  const c = view.campaign;
  if (!c) return html``;
  const ticks = { MET: '✓', FAILED: '✗', PENDING: '•' } as const;
  return html`
    <div class="sheet goal">
      <h2>${c.title} <span class="small muted">${c.daysLeft} days left</span><button class="btn small" data-sheet-close>Close</button></h2>
      ${c.result ? html`<div class="result ${c.result}">${c.result === 'WON' ? 'Scenario won!' : 'Scenario lost.'} ${c.reason}</div>` : ''}
      <p class="small">${c.goal}</p>
      ${c.conditions.map((x) => html`<div class="cond"><span class="tick ${x.status}">${ticks[x.status]}</span><span>${x.progress}</span></div>`)}
      <div class="small muted" style="margin-top:6px">Milestones</div>
      ${c.milestones.map((m) => html`<div class="cond small"><span class="tick ${m.done ? 'MET' : 'PENDING'}">${m.done ? '✓' : '•'}</span><span>${m.label} <span class="muted">(reward: ${m.reward})</span></span></div>`)}
    </div>`;
}

/**
 * The inbox. `answered` maps card ids answered today to the choice made; `attention` is set when
 * the clock stopped for a decision, and `resume` is the speed it was running at, offered back as a
 * Continue button once everything waiting has been answered.
 */
export function inboxPanel(view: PlayerView, answered: ReadonlyMap<string, string>, openDetails: ReadonlySet<string>, attention = false, resume: number | null = null): Html {
  const raised = view.cards.filter((c) => !c.opportunity);
  const opened = view.cards.filter((c) => c.opportunity);
  const waiting = raised.filter((c) => !answered.has(c.id)).length;
  return html`
    ${priceStrip(view)}
    ${raised.length > 0 ? html`<section class="panel ${attention && waiting > 0 ? 'attention' : ''}">
      ${attention && waiting > 0 ? html`<div class="stopped">The clock stopped: ${waiting === 1 ? 'a decision is' : `${waiting} decisions are`} waiting for you.</div>` : ''}
      <h2>Decisions ${waiting > 0 ? html`<span class="badge" aria-label="${waiting} waiting for an answer">${waiting}</span>` : html`<span class="small muted">none waiting</span>`}</h2>
      <details class="meters-help">
        <summary>What the numbers mean</summary>
        <p><strong>Cash</strong> — what the answer costs you: straight away, or day by day while
          something is built. Either way it is money you are committing.</p>
        <p><strong>Profit</strong> — how much more, or less, you would make each month if today's
          conditions held for the next 30 days. Where an answer ties you in for longer — a 90-day
          deal, say — the second figure is what that adds up to over the whole term, which is the
          difference between signing for three months and signing for one.</p>
        <p><strong>Supply</strong> — the tightest that gets over those 30 days: days of crude left
          for a refinery, how full your tanks get for a producer (full tanks stop your wells), or
          the value of the crude a trader is holding.</p>
        <p><strong>Risk</strong> — what the figures cannot see: shipping through troubled straits, a
          refinery breakdown, or running short of cash.</p>
        <p class="muted">Nothing here is a prediction. It is what today's market would do to you if
          it stood still, which it will not.</p>
      </details>
      ${raised.map((c) => card(c, answered.get(c.id), openDetails.has(c.id)))}
      ${waiting === 0 && resume !== null ? html`<button class="btn primary continue" data-continue>Continue ▸${resume > 1 ? ` (×${resume})` : ''}</button>` : ''}
    </section>` : ''}
    ${opened.length > 0 ? html`<section class="panel">
      <h2>Opportunities you opened</h2>
      ${opened.map((c) => card(c, answered.get(c.id), openDetails.has(c.id)))}
    </section>` : ''}`;
}

/** The Opportunities sheet: what the company could do today, whenever the player goes looking. */
export function opportunitiesPanel(view: PlayerView): Html {
  const opened = view.cards.filter((c) => c.opportunity);
  return html`
    <div class="sheet">
      <h2>Opportunities<button class="btn small" data-sheet-close>Close</button></h2>
      <p class="small muted">These are open to you any day. Picking one puts it in the decisions
        column as a card, with the same four numbers as any other decision.</p>
      <div class="opps">${view.opportunities.map((o) => {
        const card = opened.find((x) => x.type === o.type);
        return card
          ? html`<button class="btn active" data-close="${card.id}" title="Close this one">${o.title} ✓</button>`
          : html`<button class="btn" data-opp="${o.type}">${o.title}</button>`;
      })}</div>
    </div>`;
}
