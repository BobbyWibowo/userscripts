import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTweet,
  clickCopy,
  cleanupShareTweetCopy,
  loadShareTweetCopy,
  stubButtonRect,
  stubTooltipRects
} from '../helpers/share-tweet-copy-harness.js';

const cssRule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};

describe('Share Tweet Copy', () => {
  afterEach(() => cleanupShareTweetCopy());

  const openTweet = async (api, options) => {
    const article = buildTweet(options);
    api.fire(article);
    return article.querySelector('.copy-tweet-button');
  };

  it('watches timeline articles with Sentinel and inserts one button per tweet', async () => {
    const api = await loadShareTweetCopy();
    expect(api.selectors()).toEqual(['div[data-navigation-stop] article']);

    const article = buildTweet();
    api.fire(article);
    api.fire(article);
    expect(article.querySelectorAll('.copy-tweet-button')).toHaveLength(1);
    expect(article.querySelector('.copy-tweet-button').parentElement.firstElementChild)
      .toBe(article.querySelector('.copy-tweet-button'));
  });

  it('also inserts a button in the status-page flex-col layout', async () => {
    const api = await loadShareTweetCopy();
    const article = buildTweet({ layout: 'status' });
    api.fire(article);
    const button = article.querySelector('.copy-tweet-button');
    expect(button).not.toBeNull();
    expect(button.parentElement.className).toContain('-me-0.5');
    await clickCopy(button);
    expect(api.copiedText()).toContain('Test User (@testuser)');
  });

  it('copies the default template with username, media count and canonical link', async () => {
    const api = await loadShareTweetCopy();
    const button = await openTweet(api, {
      statusHref: '/testuser/status/1234567890?s=20',
      media: true
    });

    await clickCopy(button);
    expect(api.copiedText()).toBe(
      'Test User (@testuser)\n\nHello\n\n📷 1 media\n\nhttps://x.com/testuser/status/1234567890'
    );
  });

  it('counts video media through data-press-control', async () => {
    const api = await loadShareTweetCopy();
    await clickCopy(await openTweet(api, { media: 'video' }));
    expect(api.copiedText()).toContain('📷 1 media');
  });

  it('falls back to the default template when USER_TEMPLATE is not a string', async () => {
    const api = await loadShareTweetCopy({ settings: { ENV_USER_TEMPLATE: 42 } });
    await clickCopy(await openTweet(api));
    expect(api.copiedText()).toContain('Test User (@testuser)');
    expect(api.errors()).toEqual([]);
  });

  it('logs copied text only outside PROD mode', async () => {
    const prod = await loadShareTweetCopy();
    await clickCopy(await openTweet(prod));
    expect(prod.logs()).toEqual([]);
    cleanupShareTweetCopy();

    const dev = await loadShareTweetCopy({ settings: { ENV_MODE: 'DEV' } });
    await clickCopy(await openTweet(dev));
    expect(dev.logs().some(call => call.includes('Tweet copied to clipboard:'))).toBe(true);
    expect(dev.logs().some(call => call.some(arg => String(arg).includes('Test User (@testuser)')))).toBe(true);
  });

  it('does not create a button when no name container is present', async () => {
    const api = await loadShareTweetCopy();
    const article = buildTweet();
    article.querySelector('.\\@container\\/post-actions').remove();
    api.fire(article);
    expect(article.querySelector('.copy-tweet-button')).toBeNull();
    expect(api.errors()).toEqual([]);
  });

  it('honors a custom USER_TEMPLATE from GM_getValue', async () => {
    const api = await loadShareTweetCopy({ settings: { ENV_USER_TEMPLATE: '{{userId}} :: {{link}}' } });
    await clickCopy(await openTweet(api));
    expect(api.copiedText()).toBe('@testuser :: https://x.com/testuser/status/1234567890');
  });

  it('never emits undefined placeholders when the status link is missing', async () => {
    const api = await loadShareTweetCopy();
    await clickCopy(await openTweet(api, { statusHref: null }));
    expect(api.copiedText()).not.toContain('undefined');
    expect(api.copiedText()).toContain('Test User (@testuser)');
  });

  it('keeps copying when the name container disappears after button insertion', async () => {
    const api = await loadShareTweetCopy();
    const button = await openTweet(api);
    button.parentElement.remove();
    await clickCopy(button);
    expect(api.copiedText()).toContain('Hello');
  });

  it('normalizes status links with query strings, photo paths and history', async () => {
    const api = await loadShareTweetCopy();
    for (const href of [
      '/u/status/999',
      '/u/status/999?s=20',
      '/u/status/999/photo/1',
      '/u/status/999/history'
    ]) {
      await clickCopy(await openTweet(api, { statusHref: href }));
      expect(api.copiedText().trimEnd().split('\n').at(-1)).toBe('https://x.com/u/status/999');
    }
  });

  it('uses a link title when present and keeps its text when absent', async () => {
    const api = await loadShareTweetCopy();

    await clickCopy(await openTweet(api, {
      textHtml: 'See <a target="_blank" href="https://example.com/a">https://example.com/a</a>'
    }));
    expect(api.copiedText()).toContain('See https://example.com/a');

    await clickCopy(await openTweet(api, {
      textHtml: '<a target="_blank" title="https://expanded.example/full" href="https://t.co/a">t.co/a…</a>'
    }));
    expect(api.copiedText()).toContain('https://expanded.example/full');
  });

  it('converts every br into a newline and keeps the font separation', async () => {
    const api = await loadShareTweetCopy();
    const cases = [
      ['Alpha<br>Beta', 'Alpha\nBeta'],
      ['Alpha<br><br>Beta', 'Alpha\n\nBeta'],
      ['Alpha<br><font>Beta</font>', 'Alpha\n\nBeta'],
      ['Alpha<br class="x">Beta', 'Alpha\nBeta'],
      ['Alpha<BR>Beta', 'Alpha\nBeta']
    ];
    for (const [textHtml, expected] of cases) {
      await clickCopy(await openTweet(api, { textHtml }));
      expect(api.copiedText()).toContain(expected);
    }
  });

  it('counts keycap emoji as two characters', async () => {
    const api = await loadShareTweetCopy();
    for (const keycap of ['1️⃣', '#️⃣', '*️⃣']) {
      await clickCopy(await openTweet(api, { textHtml: keycap.repeat(220) }));
      expect(api.copiedText()).not.toContain('...');
      await clickCopy(await openTweet(api, { textHtml: keycap.repeat(221) }));
      expect(api.copiedText()).toContain('...');
    }
    await clickCopy(await openTweet(api, { textHtml: '1'.repeat(440) }));
    expect(api.copiedText()).not.toContain('...');
  });

  it('applies twitter-text weights at the 440-character boundary', async () => {
    const api = await loadShareTweetCopy();
    await clickCopy(await openTweet(api, { textHtml: 'a'.repeat(440) }));
    expect(api.copiedText()).not.toContain('...');

    await clickCopy(await openTweet(api, { textHtml: 'a'.repeat(441) }));
    expect(api.copiedText()).toContain('...');

    await clickCopy(await openTweet(api, { textHtml: '😀'.repeat(220) }));
    expect(api.copiedText()).not.toContain('...');

    await clickCopy(await openTweet(api, { textHtml: '😀'.repeat(221) }));
    expect(api.copiedText()).toContain('...');
  });

  it('counts a URL as 23 characters regardless of its literal length', async () => {
    const api = await loadShareTweetCopy();
    const url = 'https://example.com/abcdefgh';
    await clickCopy(await openTweet(api, { textHtml: `${'a'.repeat(416)} ${url}` }));
    expect(api.copiedText()).not.toContain('...');

    await clickCopy(await openTweet(api, { textHtml: `${'a'.repeat(417)} ${url}` }));
    expect(api.copiedText()).toContain('...');
  });

  it('counts punctuation after a URL at its own weight', async () => {
    const api = await loadShareTweetCopy();
    const url = 'https://example.com/abcdefgh';
    await clickCopy(await openTweet(api, { textHtml: `${'a'.repeat(416)} ${url}` }));
    expect(api.copiedText()).not.toContain('...');

    await clickCopy(await openTweet(api, { textHtml: `${'a'.repeat(416)} ${url}.` }));
    expect(api.copiedText()).toContain('...');

    await clickCopy(await openTweet(api, { textHtml: `${'a'.repeat(415)} ${url}。` }));
    expect(api.copiedText()).toContain('...');
  });

  it('keeps only 15 non-empty lines', async () => {
    const api = await loadShareTweetCopy();
    const textHtml = Array.from({ length: 16 }, (_, index) => `line${index + 1}`).join('\n');
    await clickCopy(await openTweet(api, { textHtml }));
    expect(api.copiedText()).toContain('line15 ...');
    expect(api.copiedText()).not.toContain('line16');
  });

  it('adds an ellipsis when X folds the text behind Show more', async () => {
    const api = await loadShareTweetCopy();
    await clickCopy(await openTweet(api, {
      textHtml: 'Short <button type="button">Show more</button>'
    }));
    expect(api.copiedText()).toContain('Short ...');
  });

  it('creates one tooltip per button with no arrow and above placement', async () => {
    const api = await loadShareTweetCopy();
    const article = buildTweet();
    api.fire(article);
    const button = article.querySelector('.copy-tweet-button');
    const tooltip = button.querySelector('.tooltip');
    expect(tooltip).not.toBeNull();
    expect(button.querySelectorAll('.tooltip')).toHaveLength(1);
    expect(document.querySelectorAll('.copy-tweet-tooltip')).toHaveLength(0);
    expect(tooltip.dataset.textInitial).toBe('Copy to clipboard');
    expect(tooltip.dataset.textEnd).toBe('Copied');
    expect(tooltip.dataset.textFailed).toBe('Copy failed, open the console for details!');

    const css = api.styles.join('\n');
    const tooltipRule = cssRule(css, '.copy-tweet-button .tooltip');
    for (const declaration of [
      'box-sizing: border-box;',
      'position: absolute;',
      'bottom: calc(100% + var(--tooltip-offset));',
      'transform: translateX(calc(-50% + var(--tooltip-shift)));',
      'width: max-content;',
      'white-space: normal;',
      'overflow-wrap: anywhere;',
      'max-width: calc(100vw - var(--tooltip-offset) - var(--tooltip-offset));',
      'transition: opacity var(--tooltip-transition-duration) ease;'
    ]) {
      expect(tooltipRule, `tooltip rule should contain ${declaration}`).toContain(declaration);
    }
    expect(tooltipRule).not.toContain('white-space: nowrap;');

    const belowRule = cssRule(css, '.copy-tweet-button .tooltip.is-below');
    expect(belowRule).toContain('bottom: auto;');
    expect(belowRule).toContain('top: calc(100% + var(--tooltip-offset));');

    expect(css).toMatch(/\.copy-tweet-button:focus:not\(:focus-visible\) \.tooltip\s*,\s*\.copy-tweet-button\.copy-failed \.tooltip\s*\{[^}]*transition:\s*none;/);
    expect(css).toMatch(/\.copy-tweet-button\.copy-failed:focus:not\(:focus-visible\) \.tooltip::before\s*\{[^}]*content:\s*attr\(data-text-failed\);/);
    expect(css).not.toContain('::after');
    expect(css).toMatch(/\.copy-tweet-button \.checkmark\s*,\s*\.copy-tweet-button \.failedmark\s*\{[^}]*display:\s*none;/);
    expect(css).not.toMatch(/(^|\n)\s*\.checkmark\s*,\s*\.failedmark\s*\{/);
  });

  it('flips the tooltip below near the viewport top and clamps it horizontally', async () => {
    const api = await loadShareTweetCopy();
    const button = await openTweet(api);
    const tooltip = button.querySelector('.tooltip');
    stubTooltipRects([tooltip]);
    const hover = () => button.dispatchEvent(new MouseEvent('mouseenter'));

    stubButtonRect(button, { top: 200, left: 400 });
    hover();
    expect(tooltip.classList.contains('is-below')).toBe(false);
    expect(tooltip.style.getPropertyValue('--tooltip-shift')).toBe('0px');

    stubButtonRect(button, { top: 4, left: 400 });
    hover();
    expect(tooltip.classList.contains('is-below')).toBe(true);

    stubButtonRect(button, { top: 200, left: 0 });
    hover();
    expect(tooltip.style.getPropertyValue('--tooltip-shift')).toBe('86px');

    stubButtonRect(button, { top: 200, left: window.innerWidth });
    hover();
    expect(Number.parseFloat(tooltip.style.getPropertyValue('--tooltip-shift'))).toBeLessThanOrEqual(0);
  });

  it('gives every tweet its own tooltip so copied and hovered tooltips coexist', async () => {
    const api = await loadShareTweetCopy();
    const first = await openTweet(api);
    const second = await openTweet(api);
    expect(first.querySelector('.tooltip')).not.toBe(second.querySelector('.tooltip'));
    second.dispatchEvent(new MouseEvent('mouseenter'));
    await clickCopy(first);
    expect(first.querySelector('.tooltip').dataset.textEnd).toBe('Copied');
    expect(second.querySelector('.tooltip').dataset.textInitial).toBe('Copy to clipboard');
  });

  it('marks the clicked button failed on clipboard rejection and clears it on retry', async () => {
    const api = await loadShareTweetCopy({ failClipboard: true });
    const button = await openTweet(api);

    await clickCopy(button);
    expect(button.classList.contains('copy-failed')).toBe(true);

    api.setFailClipboard(false);
    await clickCopy(button);
    expect(button.classList.contains('copy-failed')).toBe(false);
  });
});
