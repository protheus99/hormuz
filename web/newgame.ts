// The new-game screen (spec G2, G3, G8): play type, home region, company name, difficulty, length.

import { regionName, regionsFor, SCENARIOS, type Difficulty, type GameSettings, type PlayType, type ScenarioId } from '../src/game';
import { html, mount } from './dom';

const TYPES: readonly { type: PlayType; title: string; blurb: string; difficulty: string }[] = [
  { type: 'PRODUCER', title: 'Producer', blurb: 'Pump crude from your own fields, store it and sell it at the best price.', difficulty: 'Easiest' },
  { type: 'REFINER', title: 'Refiner', blurb: 'Buy crude cheaply and keep your refinery running when fuel pays well.', difficulty: 'Medium' },
  { type: 'TRADER', title: 'Trader', blurb: 'Buy where crude is cheap, store it, and sell where or when it is dear.', difficulty: 'Hardest' },
];

const LENGTHS: readonly { days: number | null; label: string }[] = [
  { days: 365, label: '1 year' }, { days: 1095, label: '3 years' }, { days: 1825, label: '5 years' }, { days: null, label: 'No end' },
];

interface Choice { mode: 'CAMPAIGN' | 'SANDBOX'; scenario: ScenarioId; type: PlayType; region: string; name: string; difficulty: Difficulty; length: number | null; second: string; volatile: boolean; how: boolean }

const LEVEL_WORDS = { EASY: 'Tutorial', MEDIUM: 'Medium', HARD: 'Hard' } as const;
/** A scenario puts you in charge of one kind of company; the finale lets you pick. */
const PLAY_WORDS = { PRODUCER: 'Producer', REFINER: 'Refiner', TRADER: 'Trader' } as const;

export function showNewGame(root: Element, hasSave: boolean, start: (s: GameSettings) => void, resume: () => void): void {
  const state: Choice = { mode: 'CAMPAIGN', scenario: 'P1', type: 'PRODUCER', region: 'US_Permian', name: 'Lone Star Crude', difficulty: 'NORMAL', length: 365, second: '', volatile: false, how: false };
  const campaignMode = () => state.mode === 'CAMPAIGN';

  const render = () => {
    const regions = regionsFor(state.type);
    if (!regions.includes(state.region as never)) state.region = regions[0] ?? '';
    const sc = SCENARIOS.find((x) => x.id === state.scenario);
    const campaign = campaignMode();
    const pickType = !campaign || sc?.playType === null;
    mount(root, html`
      <section class="newgame">
        <h1>HORMUZ</h1>
        <p class="lead">You run an oil company. The market runs itself; you make the big calls.</p>
        <button class="btn how-open" id="how">How it is played</button>
        <div class="seg" style="margin-bottom:20px">
          <button data-mode="CAMPAIGN" class="${campaign ? 'active' : ''}">Campaign</button>
          <button data-mode="SANDBOX" class="${campaign ? '' : 'active'}">Sandbox</button>
        </div>
        ${campaign ? html`
        <fieldset>
          <legend>Choose a scenario</legend>
          <div class="scenarios">
            ${SCENARIOS.map((x) => html`
              <button class="type ${x.id === state.scenario ? 'active' : ''}" data-scenario="${x.id}">
                <strong>${x.id === 'FINALE' ? '★' : x.id} · ${x.title}</strong>
                <span class="play ${x.playType ?? 'ANY'}">${x.playType === null ? 'Your choice of company' : PLAY_WORDS[x.playType]}</span>
                <span class="muted">${x.blurb}</span>
                <div class="small muted">${x.tutorial ? 'Tutorial' : LEVEL_WORDS[x.level]} · ${Math.round(x.lengthDays / 30)} months</div>
              </button>`)}
          </div>
          ${sc ? html`<p style="margin-top:12px"><strong>Goal:</strong> ${sc.goalText}</p>` : ''}
        </fieldset>` : ''}
        ${pickType ? html`<fieldset>
          <legend>What kind of company?</legend>
          <div class="types">
            ${TYPES.map((t) => html`
              <button class="type ${t.type === state.type ? 'active' : ''}" data-type="${t.type}">
                <strong>${t.title}</strong><span class="muted">${t.blurb}</span><div class="small muted">${t.difficulty}</div>
              </button>`)}
          </div>
        </fieldset>` : ''}
        <div class="row">
          ${pickType ? html`<label>Home region
            <select id="region">${regions.map((r) => html`<option value="${r}" ${r === state.region ? 'selected' : ''}>${regionName(r)}</option>`)}</select>
          </label>` : ''}
          ${pickType && state.type === 'TRADER' ? html`
          <label>Second office (optional)
            <select id="second"><option value="">None</option>${regionsFor('TRADER').filter((r) => r !== state.region).map((r) => html`<option value="${r}" ${r === state.second ? 'selected' : ''}>${regionName(r)}</option>`)}</select>
          </label>` : ''}
          <label>Company name <input id="name" maxlength="40" value="${state.name}"></label>
        </div>
        ${campaign ? '' : html`<div class="row" style="margin-top:16px">
          <label>Difficulty
            <select id="difficulty">${(['EASY', 'NORMAL', 'HARD'] as const).map((d) => html`<option value="${d}" ${d === state.difficulty ? 'selected' : ''}>${d.charAt(0) + d.slice(1).toLowerCase()}</option>`)}</select>
          </label>
          <label>Length
            <select id="length">${LENGTHS.map((l) => html`<option value="${l.days ?? ''}" ${l.days === state.length ? 'selected' : ''}>${l.label}</option>`)}</select>
          </label>
          <label style="flex-direction:row;align-items:center;gap:8px;margin-top:22px"><input type="checkbox" id="volatile" ${state.volatile ? 'checked' : ''}> Volatile markets</label>
        </div>`}
        ${state.how ? html`<div class="overlay" id="howsheet">
          <div class="sheet">
            <h2>How it is played<button class="btn small" id="how-close">Close</button></h2>
            <p>Your company buys, sells, ships and refines on its own, every day. You never place an
              order or type a price.</p>
            <p>What reaches you is <strong>decisions</strong>: a card with two sentences and up to
              three answers — <strong>Yes</strong>, <strong>Maybe</strong> (a smaller or shorter
              version) and <strong>No</strong>. Each answer shows what it would do to your cash,
              your profit, your supply and your risk. Unanswered cards count as No.</p>
            <p>The clock runs at the speed you choose and stops whenever a decision arrives; once
              you have answered, a Continue button starts it again at the same speed.</p>
            <p>Two settings — how much risk you take, and how eagerly you buy or sell — are yours to
              change at any time, in the Company tab. Everything else your company decides for
              itself, the way a real one would.</p>
          </div>
        </div>` : ''}
        <div class="actions">
          ${hasSave ? html`<button class="btn" id="resume">Continue saved game</button>` : ''}
          <button class="btn primary" id="start">Start</button>
        </div>
      </section>`);

    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode as Choice['mode'];
      render();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((b) => b.addEventListener('click', () => {
      state.scenario = b.dataset.scenario as ScenarioId;
      render();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) => b.addEventListener('click', () => {
      state.type = b.dataset.type as PlayType;
      render();
    }));
    const value = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    root.querySelector('#region')?.addEventListener('change', () => { state.region = value('region'); render(); });
    root.querySelector('#name')?.addEventListener('input', () => { state.name = value('name'); });
    root.querySelector('#second')?.addEventListener('change', () => { state.second = value('second'); });
    root.querySelector('#difficulty')?.addEventListener('change', () => { state.difficulty = value('difficulty') as Difficulty; });
    root.querySelector('#length')?.addEventListener('change', () => { state.length = value('length') === '' ? null : Number(value('length')); });
    root.querySelector('#volatile')?.addEventListener('change', (e) => { state.volatile = (e.target as HTMLInputElement).checked; });
    root.querySelector('#how')?.addEventListener('click', () => { state.how = true; render(); });
    root.querySelector('#how-close')?.addEventListener('click', () => { state.how = false; render(); });
    root.querySelector('#howsheet')?.addEventListener('click', (e) => {
      // Clicking the dark outside the sheet closes it, the way a modal is expected to behave.
      if (e.target === root.querySelector('#howsheet')) { state.how = false; render(); }
    });
    root.querySelector('#resume')?.addEventListener('click', resume);
    root.querySelector('#start')?.addEventListener('click', () => {
      if (state.name.trim() === '') return;
      start({
        seed: Math.random().toString(36).slice(2, 10),
        playType: state.type, region: state.region as GameSettings['region'], companyName: state.name.trim(),
        difficulty: state.difficulty, lengthDays: state.length,
        ...(campaignMode() ? { scenario: state.scenario } : {}),
        ...(!campaignMode() && state.volatile ? { volatile: true } : {}),
        ...(state.type === 'TRADER' && state.second !== '' ? { secondOffice: state.second as GameSettings['region'] } : {}),
      });
    });
  };
  render();
}
