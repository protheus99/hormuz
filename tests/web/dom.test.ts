// The interface's HTML helper and formatting (spec G10): text is always escaped, dates and money
// read plainly.

import { describe, expect, it } from 'vitest';
import type { CardOption } from '../../src/game';
import { bblShort, dateOf, html, money, raw } from '../../web/dom';
import { cash, commitmentDays, overTerm } from '../../web/inbox';

describe('the HTML helper', () => {
  it('escapes interpolated text, so a company name cannot inject markup', () => {
    expect(html`<b>${'<img src=x onerror=alert(1)>'}</b>`.__html).toBe('<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  });

  it('keeps nested Html, joins lists and drops empty values', () => {
    expect(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>${false}${null}${raw('<hr>')}`.__html).toBe('<ul><li>a</li><li>b</li></ul><hr>');
  });
});

describe('formatting', () => {
  it('writes money compactly', () => {
    expect([money(1_234_567), money(85_400), money(4.5), money(-2_000_000)]).toEqual(['$1.2M', '$85K', '$4.50', '−$2.0M']);
  });

  it('writes barrels short enough for a table, without hiding a change between days', () => {
    expect([bblShort(950), bblShort(7000), bblShort(12_000), bblShort(1_250_000)]).toEqual(['950', '7k', '12k', '1.25M']);
    // Two days of a field that pumped almost, but not quite, the same: they must not read alike.
    expect(bblShort(1980)).not.toBe(bblShort(1919));
    expect([bblShort(1980), bblShort(1919), bblShort(11_685)]).toEqual(['1.98k', '1.92k', '11.7k']);
  });

  it('turns days into dates', () => {
    expect([dateOf(0), dateOf(31), dateOf(364), dateOf(365)]).toEqual(['1 Jan, year 1', '1 Feb, year 1', '31 Dec, year 1', '1 Jan, year 2']);
  });
});

describe('what an answer says it costs', () => {
  const option = (cash: number, totalCost: number): CardOption => ({
    choice: 'YES', label: '', actions: [], totalCost, affordable: true, affordableInDays: null, effect: null,
    impact: { cash, profit: 0, supply: { value: 0, unit: 'days' }, risk: 'LOW', riskReason: 'NONE' },
  });

  it('shows money leaving today, and money committed to a project still being built', () => {
    // A report is paid for on the spot; new wells cost nothing today and bill daily for 45 days.
    expect(cash(option(13_000, 13_000))).toBe('Cash −$13K now');
    expect(cash(option(0, 1_150_000))).toBe('Cash −$1.1M in all');
    expect(cash(option(0, 0))).toBe('Cash no change');
  });
});

describe('how long an answer ties you in', () => {
  const deal = (termDays: number, profit: number): CardOption => ({
    choice: 'YES', label: `Sign for ${termDays} days.`, totalCost: 0, affordable: true, affordableInDays: null, effect: null,
    actions: [{ kind: 'SIGN_DEAL', terms: { termDays } }] as never,
    impact: { cash: 0, profit, supply: null, risk: 'LOW', riskReason: 'NONE' } as never,
  });

  it(`reads a deal's term, and a hire's days`, () => {
    expect(commitmentDays(deal(90, 0))).toBe(90);
    expect(commitmentDays({ ...deal(0, 0), actions: [{ kind: 'CHARTER', size: 'LARGE', days: 45 }] as never })).toBe(45);
  });

  it('turns a monthly figure into what the whole term is worth, since the meters only see 30 days', () => {
    expect(overTerm(deal(90, 35_000))).toBe('+$105K over 90 days');
    expect(overTerm(deal(90, -40_000))).toBe('−$120K over 90 days');
  });

  it('says nothing for a term the meters already cover, or for a figure too small to matter', () => {
    expect(overTerm(deal(30, 35_000))).toBe('');
    expect(overTerm(deal(90, 100))).toBe('');
  });
});
