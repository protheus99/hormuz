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
export const pct = (x: number) => `${Math.round(x * 100)}%`;

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
