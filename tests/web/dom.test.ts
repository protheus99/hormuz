// The interface's HTML helper and formatting (spec G10): text is always escaped, dates and money
// read plainly.

import { describe, expect, it } from 'vitest';
import { dateOf, html, money, raw } from '../../web/dom';

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

  it('turns days into dates', () => {
    expect([dateOf(0), dateOf(31), dateOf(364), dateOf(365)]).toEqual(['1 Jan, year 1', '1 Feb, year 1', '31 Dec, year 1', '1 Jan, year 2']);
  });
});
