import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTweet,
  clickCopy,
  cleanupShareTweetCopy,
  loadShareTweetCopy,
  stubButtonRect,
  stubTooltipRects
} from '../helpers/share-tweet-copy-harness.js';

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

  it('portals two tooltips to body with root-level z-index and instant result states', async () => {
    const api = await loadShareTweetCopy();
    const tooltips = api.tooltips();
    expect(tooltips).toHaveLength(2);
    expect(tooltips.every(tooltip => tooltip.parentElement === document.body)).toBe(true);

    const css = api.styles.join('\n');
    expect(css).toContain('position: fixed;\n    z-index: 50;');
    expect(css).toContain('transition: opacity var(--tooltip-transition-duration) ease;');
    expect(css).toContain('.copy-tweet-tooltip.is-end,\n  .copy-tweet-tooltip.is-failed {\n    transition: none;\n  }');
  });

  it('positions the hover tooltip above, below, and inside horizontal edges', async () => {
    const api = await loadShareTweetCopy();
    const [hoverTooltip] = api.tooltips();
    stubTooltipRects(api.tooltips(), tooltip => tooltip.classList.contains('is-end') ? 60 : 180);
    const button = await openTweet(api);
    const hover = () => button.dispatchEvent(new MouseEvent('mouseenter'));

    stubButtonRect(button, { top: 200, left: 400 });
    hover();
    expect(hoverTooltip.style.top).toBe('172px');
    expect(hoverTooltip.style.left).toBe('322px');

    stubButtonRect(button, { top: 4, left: 400 });
    hover();
    expect(hoverTooltip.style.top).toBe('36px');

    stubButtonRect(button, { top: 200, left: 0 });
    hover();
    expect(hoverTooltip.style.left).toBe('8px');

    const rightEdge = window.innerWidth - 180 - 8;
    stubButtonRect(button, { top: 200, left: window.innerWidth });
    hover();
    expect(hoverTooltip.style.left).toBe(`${rightEdge}px`);
  });

  it('keeps the pinned Copied tooltip while hovering others, then clears on outside click', async () => {
    const api = await loadShareTweetCopy();
    const [hoverTooltip, pinnedTooltip] = api.tooltips();
    stubTooltipRects(api.tooltips(), tooltip => tooltip.classList.contains('is-end') ? 60 : 180);
    const first = await openTweet(api);
    const second = await openTweet(api);
    stubButtonRect(first);
    stubButtonRect(second, { top: 200, left: 700 });

    first.focus();
    await clickCopy(first);
    expect(pinnedTooltip.classList.contains('is-end')).toBe(true);
    expect(pinnedTooltip.classList.contains('is-visible')).toBe(true);
    expect(hoverTooltip.classList.contains('is-visible')).toBe(false);

    second.dispatchEvent(new MouseEvent('mouseenter'));
    expect(pinnedTooltip.classList.contains('is-visible')).toBe(true);
    expect(hoverTooltip.classList.contains('is-visible')).toBe(true);

    second.dispatchEvent(new MouseEvent('mouseleave'));
    expect(hoverTooltip.classList.contains('is-visible')).toBe(false);
    expect(pinnedTooltip.classList.contains('is-visible')).toBe(true);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(pinnedTooltip.classList.contains('is-visible')).toBe(false);
  });

  it('marks the pinned tooltip failed on clipboard rejection and clears it on retry', async () => {
    const api = await loadShareTweetCopy({ failClipboard: true });
    const [, pinnedTooltip] = api.tooltips();
    const button = await openTweet(api);

    await clickCopy(button);
    expect(button.classList.contains('copy-failed')).toBe(true);
    expect(pinnedTooltip.classList.contains('is-failed')).toBe(true);

    api.setFailClipboard(false);
    await clickCopy(button);
    expect(button.classList.contains('copy-failed')).toBe(false);
    expect(pinnedTooltip.classList.contains('is-failed')).toBe(false);
  });
});
