// The game screen (spec G3, G10): the top bar with the clock, the map and the company's panels on
// the left, decisions on the right. The clock lives here in the client; the session only runs the
// days it is asked to and says when to stop (a new card or an alert).

import { GameSession, msPerDay, PLAYER_ID, type CardType, type PlayerView, type SaveData, type Speed } from '../src/game';
import { dateOf, html, money, mount } from './dom';
import { inboxPanel } from './inbox';
import { companyPanel, dealsPanel, mapPanel, marketsPanel, newsPanel } from './panels';
import { saveGame } from './storage';

type Tab = 'company' | 'markets' | 'deals' | 'news';
const TABS: readonly [Tab, string][] = [['company', 'Company'], ['markets', 'Markets'], ['deals', 'Deals & cargo'], ['news', 'News']];
/** "Next decision" runs at most this many days in one go. */
const NEXT_EVENT_DAYS = 90;
const AUTOSAVE_DAYS = 30;
/** A game's length in words: months for a short scenario, years for a long one. */
const length = (days: number) => (days < 365 ? `${Math.round(days / 30)} months` : `${Math.round(days / 365)} yr`);

/** At most this many days run in one step when the browser has delayed the clock. */
const MAX_CATCH_UP = 8;

export async function showGame(root: HTMLElement, session: GameSession, onQuit: () => void): Promise<void> {
  let view: PlayerView = await session.getView();
  let speed: Speed = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tab: Tab = 'company';
  let busy = false;
  const answered = new Map<string, string>();
  const openDetails = new Set<string>();
  let lastAutosave = view.tick;
  /** When the clock last ran a day; days due since then are caught up, so throttled timers keep pace. */
  let lastDayAt = 0;

  mount(root, html`
    <div class="game">
      <header class="topbar" id="top"></header>
      <div class="body">
        <div class="left">
          <section class="panel" id="map"></section>
          <section class="panel lower">
            <nav class="tabs" id="tabs"></nav>
            <div class="tabbody" id="tabbody"></div>
          </section>
        </div>
        <aside class="right" id="inbox"></aside>
      </div>
    </div>`);
  const $ = (id: string) => root.querySelector(`#${id}`) as HTMLElement;

  const toast = (message: string) => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    document.body.append(t);
    setTimeout(() => t.remove(), 2500);
  };

  const renderTop = () => {
    const c = view.company;
    mount($('top'), html`
      <span class="brand">HORMUZ</span>
      <div class="stat"><span class="label">${c.name}</span><span class="value">${dateOf(view.tick)}${view.lengthDays !== null ? html` <span class="small muted">of ${length(view.lengthDays)}</span>` : ''}</span></div>
      <div class="stat"><span class="label">Cash</span><span class="value ${c.cash < 0 ? 'bad' : ''}">${money(c.cash)}</span></div>
      <div class="stat"><span class="label">Net worth</span><span class="value">${money(c.netWorth)}</span></div>
      ${c.insolvent ? html`<div class="stat"><span class="label">Status</span><span class="value bad">Out of cash and credit</span></div>` : ''}
      <div class="clock">
        ${([0, 1, 2, 4, 8] as const).map((s) => html`<button class="btn ${speed === s ? 'active' : ''}" data-speed="${s}" title="${s === 0 ? 'Pause' : `${s}× speed`}">${s === 0 ? '❚❚' : `×${s}`}</button>`)}
        <button class="btn" data-next title="Run until the next decision or alert">Next ▸▸</button>
      </div>
      <div class="menu">
        <button class="btn" data-save>Save</button>
        <button class="btn" data-quit>Menu</button>
      </div>`);
  };

  const renderTabs = () => {
    mount($('tabs'), html`${TABS.map(([id, label]) => html`<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`)}`);
    const body = $('tabbody');
    const scroll = body.scrollTop;
    mount(body, tab === 'company' ? companyPanel(view) : tab === 'markets' ? marketsPanel(view) : tab === 'deals' ? dealsPanel(view) : newsPanel(view));
    body.scrollTop = scroll;
  };

  const renderInbox = () => {
    const box = $('inbox');
    const scroll = box.scrollTop;
    mount(box, inboxPanel(view, answered, openDetails));
    box.scrollTop = scroll;
  };

  const render = () => {
    renderTop();
    mount($('map'), mapPanel(view));
    renderTabs();
    renderInbox();
  };

  const refresh = async () => {
    view = await session.getView();
    // Answers apply at the start of the next day; forget those whose card has gone.
    for (const id of [...answered.keys()]) if (!view.cards.some((c) => c.id === id)) answered.delete(id);
    if (view.tick - lastAutosave >= AUTOSAVE_DAYS) {
      lastAutosave = view.tick;
      saveGame(await session.save());
    }
    render();
  };

  const setSpeed = (s: Speed) => {
    if (s !== speed) lastDayAt = performance.now();
    speed = s;
    clearTimeout(timer);
    if (speed > 0) timer = setTimeout(() => void day(), msPerDay(speed));
    renderTop();
  };

  const day = async () => {
    if (busy || speed === 0) return;
    busy = true;
    const now = performance.now();
    const due = Math.min(MAX_CATCH_UP, Math.max(1, Math.floor((now - lastDayAt) / msPerDay(speed))));
    lastDayAt = now;
    const r = await session.advance(due);
    busy = false;
    await refresh();
    if (r.ended) toast('The game has ended.');
    if (r.pausedBy !== null || r.newCards.length > 0 || r.ended) setSpeed(0);
    else setSpeed(speed);
  };

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button, summary');
    if (!t) return;
    const d = t.dataset;
    if (d.speed !== undefined) setSpeed(Number(d.speed) as Speed);
    else if (d.next !== undefined && !busy) {
      setSpeed(0);
      busy = true;
      void session.advance(NEXT_EVENT_DAYS).then(async () => { busy = false; await refresh(); });
    } else if (d.tab !== undefined) { tab = d.tab as Tab; renderTabs(); }
    else if (d.card !== undefined && d.choice !== undefined) {
      const cardId = d.card;
      const choice = d.choice as 'YES' | 'NO' | 'MAYBE';
      void session.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId, choice }).then((r) => {
        if (r.ok) answered.set(cardId, choice);
        else toast(r.reason);
        renderInbox();
      });
    } else if (d.opp !== undefined) {
      void session.openOpportunity(PLAYER_ID, d.opp as CardType).then(refresh);
    } else if (d.close !== undefined) {
      void session.closeOpportunity(PLAYER_ID, d.close).then(refresh);
    } else if (d.setting !== undefined && d.value !== undefined) {
      void session.submit(PLAYER_ID, { kind: 'SET_SETTING', setting: d.setting as never, value: d.value }).then((r) => toast(r.ok ? 'Setting changes tomorrow.' : r.reason));
    } else if (d.save !== undefined) {
      void session.save().then((s: SaveData) => toast(saveGame(s) ? 'Game saved.' : 'Could not save: browser storage is full.'));
    } else if (d.quit !== undefined) {
      setSpeed(0);
      void session.save().then((s) => { saveGame(s); onQuit(); });
    }
  });
  root.addEventListener('toggle', (e) => {
    const el = e.target as HTMLDetailsElement;
    const id = el.dataset.details;
    if (id === undefined) return;
    if (el.open) openDetails.add(id);
    else openDetails.delete(id);
  }, true);

  render();
}
