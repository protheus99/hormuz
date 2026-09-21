// The game screen (spec G3, G10): the top bar with the clock, the map and the company's panels on
// the left, decisions on the right. The clock lives here in the client; the session only runs the
// days it is asked to and says when to stop (a new card or an alert).

import { GameSession, msPerDay, PLAYER_ID, type CardType, type PlayerView, type SaveData, type Speed } from '../src/game';
import { dateOf, html, money, mount } from './dom';
import { inboxPanel, missionPanel } from './inbox';
import { companyPanel, dayBookPanel, dealsPanel, mapPanel, newsPanel } from './panels';
import { saveGame } from './storage';

type Tab = 'company' | 'daybook' | 'deals' | 'news';
const TABS: readonly [Tab, string][] = [['company', 'Company'], ['daybook', 'Day book'], ['deals', 'Deals & cargo'], ['news', 'News']];
/** What is waiting behind a tab, so the player can see there is something there without opening it. */
function tabCount(view: PlayerView, id: Tab): number {
  if (id === 'deals') return view.deals.filter((d) => d.status === 'ACTIVE').length + view.cargo.length;
  if (id === 'news') return view.news.length;
  return 0;
}
/** "Next decision" runs at most this many days in one go. */
const NEXT_EVENT_DAYS = 90;
const AUTOSAVE_DAYS = 30;
/** A game's length in words: months for a short scenario, years for a long one. */
const daysLeft = (days: number) => (days === 1 ? '1 day left' : `${days} days left`);

/** At most this many days run in one step when the browser has delayed the clock. */
const MAX_CATCH_UP = 8;

export async function showGame(root: HTMLElement, session: GameSession, onQuit: () => void): Promise<void> {
  let view: PlayerView = await session.getView();
  let speed: Speed = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tab: Tab = 'company';
  let busy = false;
  /** The mission sheet is open, and the clock has stopped for a decision the player has not seen. */
  let mission = false;
  let attention = false;
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
      <div id="mission"></div>
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
    const waiting = view.cards.filter((card) => !card.opportunity && !answered.has(card.id)).length;
    mount($('top'), html`
      <span class="brand">HORMUZ</span>
      <div class="stat"><span class="label">${c.name}</span><span class="value">${dateOf(view.tick)}${view.lengthDays !== null ? html` <span class="small muted">· ${daysLeft(Math.max(0, view.lengthDays - view.tick))}</span>` : ''}</span></div>
      <div class="stat"><span class="label">Cash</span><span class="value ${c.cash < 0 ? 'bad' : ''}">${money(c.cash)}</span></div>
      <div class="stat"><span class="label">Net worth</span><span class="value">${money(c.netWorth)}</span></div>
      ${waiting > 0 ? html`<div class="stat"><span class="label">Waiting</span><span class="value"><span class="badge">${waiting}</span> ${waiting === 1 ? 'decision' : 'decisions'}</span></div>` : ''}
      ${c.insolvent ? html`<div class="stat"><span class="label">Status</span><span class="value bad">Out of cash and credit</span></div>` : ''}
      <div class="clock">
        ${([0, 1, 2, 4, 8] as const).map((s) => html`<button class="btn ${speed === s ? 'active' : ''}" data-speed="${s}" title="${s === 0 ? 'Pause' : `${s}× speed`}">${s === 0 ? '❚❚' : `×${s}`}</button>`)}
        <button class="btn" data-next title="Run until the next decision or alert">Next ▸▸</button>
      </div>
      <div class="menu">
        ${view.campaign ? html`<button class="btn ${view.campaign.result ? 'primary' : ''}" data-mission>Mission</button>` : ''}
        <button class="btn" data-save>Save</button>
        <button class="btn" data-quit>Menu</button>
      </div>`);
  };

  const renderTabs = () => {
    mount($('tabs'), html`${TABS.map(([id, label]) => {
      const n = tabCount(view, id);
      return html`<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}">${label}${n > 0 ? html` <span class="count">${n}</span>` : ''}</button>`;
    })}`);
    const body = $('tabbody');
    const scroll = body.scrollTop;
    mount(body, tab === 'company' ? companyPanel(view) : tab === 'daybook' ? dayBookPanel(view) : tab === 'deals' ? dealsPanel(view) : newsPanel(view));
    body.scrollTop = scroll;
  };

  const renderInbox = () => {
    const box = $('inbox');
    const scroll = box.scrollTop;
    mount(box, inboxPanel(view, answered, openDetails, attention));
    box.scrollTop = scroll;
  };

  const renderMission = () => mount($('mission'), mission ? html`<div class="overlay">${missionPanel(view)}</div>` : html``);

  const render = () => {
    renderTop();
    mount($('map'), mapPanel(view));
    renderTabs();
    renderInbox();
    renderMission();
  };

  const refresh = async () => {
    const before = view.campaign?.result ?? null;
    view = await session.getView();
    if (before === null && view.campaign?.result) mission = true;
    // Answers apply at the start of the next day; forget those whose card has gone.
    for (const id of [...answered.keys()]) if (!view.cards.some((c) => c.id === id)) answered.delete(id);
    if (view.tick - lastAutosave >= AUTOSAVE_DAYS) {
      lastAutosave = view.tick;
      saveGame(await session.save());
    }
    render();
  };

  const setSpeed = (s: Speed) => {
    if (s > 0) attention = false;
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
    const stopping = r.pausedBy !== null || r.newCards.length > 0 || r.ended;
    if (stopping && r.newCards.some((c) => !c.opportunity)) attention = true;
    await refresh();
    if (r.ended) toast('The game has ended.');
    if (stopping) setSpeed(0);
    else setSpeed(speed);
  };

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button, summary');
    if (!t) return;
    const d = t.dataset;
    if (d.speed !== undefined) setSpeed(Number(d.speed) as Speed);
    else if (d.mission !== undefined || d.missionClose !== undefined) { mission = d.mission !== undefined && !mission; renderMission(); }
    else if (d.next !== undefined && !busy) {
      setSpeed(0);
      busy = true;
      void session.advance(NEXT_EVENT_DAYS).then(async (r) => {
        busy = false;
        // "Next" runs until something needs the player: say so, or the stop looks like a glitch.
        if (r.newCards.some((c) => !c.opportunity)) attention = true;
        await refresh();
      });
    } else if (d.tab !== undefined) { tab = d.tab as Tab; renderTabs(); }
    else if (d.card !== undefined && d.choice !== undefined) {
      const cardId = d.card;
      const choice = d.choice as 'YES' | 'NO' | 'MAYBE';
      void session.submit(PLAYER_ID, { kind: 'ANSWER_CARD', cardId, choice }).then((r) => {
        if (r.ok) answered.set(cardId, choice);
        else toast(r.reason);
        attention = view.cards.some((c) => !c.opportunity && !answered.has(c.id));
        renderInbox();
        renderTop();
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
