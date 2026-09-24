// A tiny HTML helper: `html` escapes every interpolated value unless it is already Html, so
// company names and card text can never inject markup. No framework (spec G10).

export interface Html {
  readonly __html: string;
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

export const raw = (s: string): Html => ({ __html: s });

function part(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && '__html' in v) return (v as Html).__html;
  return escape(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += part(v) + (strings[i + 1] ?? '');
  });
  return raw(out);
}

export function mount(target: Element, content: Html): void {
  target.innerHTML = content.__html;
}

// ─── Formatting ──────────────────────────────────────────────────────────────────────────────

/** $1.2M, $85K, $4.50 — the same style as card text. */
export function money(x: number): string {
  const a = Math.abs(x);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(a / 1e3)}K` : a >= 100 ? `$${Math.round(a).toLocaleString('en-US')}` : `$${a.toFixed(2)}`;
  return x < 0 ? `−${s}` : s;
}

export const signed = (x: number) => (x > 0 ? `+${money(x)}` : money(x));
export const bbl = (x: number) => Math.round(x).toLocaleString('en-US');

/**
 * Barrels, short, for a table with a column to spare: 950, 1.98k, 7k, 12k, 1.2M. Three figures,
 * so a field pumping 1,980 one day and 1,919 the next still reads as two different days.
 */
export function bblShort(x: number): string {
  const a = Math.abs(x);
  if (a < 1000) return String(Math.round(x));
  const value = a < 1e6 ? x / 1e3 : x / 1e6;
  const unit = a < 1e6 ? 'k' : 'M';
  const places = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${Number(value.toFixed(places))}${unit}`;
}
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * What each economic climate means for a company, in one line. Demand and wages move together, so
 * a boom is not simply good news: it is the dearest time there is to build anything.
 */
export const WEATHER_MEANS: Readonly<Record<string, string>> = {
  PANIC: 'Fuel is fetching far less than usual. Wages and contractors are cheaper, but nothing like as much cheaper.',
  RECESSION: 'Buyers are taking less and paying less. Work costs a little less than it did.',
  NORMAL: 'An ordinary market: demand and wages both where they usually sit.',
  PROSPEROUS: 'Buyers are paying more — and so are you, for anything you build.',
  BOOM: 'Fuel is fetching what it has not in years. So is everyone you would need to hire.',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Day 0 is 1 January of year 1. */
export function dateOf(tick: number): string {
  let day = tick % 365;
  const year = Math.floor(tick / 365) + 1;
  let m = 0;
  while (day >= (MONTH_DAYS[m] ?? 31)) day -= MONTH_DAYS[m++] ?? 31;
  return `${day + 1} ${MONTHS[m] ?? ''}, year ${year}`;
}

/** Plain words for engine enum values. */
export const words = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
