import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const DUPLICATE_SELECTOR = '[data-pixiv_utils_duplicate_date]';

// Mirrors `ENV_DEFAULTS.DATE_CONVERSION_LOCALES` / `DATE_CONVERSION_OPTIONS`,
// so assertions cover the presented string, not only the parsed instant.
const DATE_LOCALE = 'en-GB';
const DATE_OPTIONS = {
  hour12: true,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
};
const DATE_ONLY_OPTIONS = { year: 'numeric', month: 'long', day: 'numeric' };

const dateListener = pixiv => pixiv.listeners.find(entry => Array.isArray(entry.selector));

const duplicateOf = element => element.nextElementSibling;

const timestampOf = element => duplicateOf(element).dataset.pixiv_utils_date_timestamp;

const formattedFrom = (element, options = DATE_OPTIONS) =>
  new Intl.DateTimeFormat(DATE_LOCALE, options).format(Number(timestampOf(element)));

const logMessages = pixiv => pixiv.console.log.map(args => args.map(String).join(' '));

// The listener matches the parent of a date element, so every case renders a
// wrapper that holds the byline as a direct child.
const renderCard = inner => {
  document.body.innerHTML = `<div class="card">${inner}</div>`;

  return document.querySelector('.card');
};

const convertFixtureCard = async pixiv => {
  const byline = document.querySelector('.times');
  const card = byline.closest('[data-ga4-label="thumbnail"]');

  await pixiv.fireListener(dateListener(pixiv), card);

  return { byline, card };
};

describe('pixiv-utils date conversion', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('converts the fixture byline and keeps the original element untouched', async () => {
    const pixiv = await loadPixivUtils();

    const { byline } = await convertFixtureCard(pixiv);
    const duplicate = duplicateOf(byline);

    expect(byline.hasAttribute('data-pixiv_utils_duplicate_date')).toBe(false);
    expect(duplicate.dataset.pixiv_utils_duplicate_date).toBe('true');
    expect(byline.textContent).toBe('2024年01月02日 15:04');
    expect(duplicate.textContent).not.toContain('年');
    expect(duplicate.textContent).toBe(formattedFrom(byline));

    // The text path rewrites the Japanese date and reads it as local time.
    expect(timestampOf(byline)).toBe(String(new Date('01-02-2024 15:04').getTime()));
  });

  it('prefers a machine-readable datetime attribute', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderCard('<time class="times" datetime="2024-01-02T15:04:05+09:00">ignored text</time>');
    const byline = card.querySelector('.times');

    await pixiv.fireListener(dateListener(pixiv), card);

    expect(timestampOf(byline)).toBe(String(Date.parse('2024-01-02T15:04:05+09:00')));
    expect(duplicateOf(byline).textContent).toBe(formattedFrom(byline));
  });

  it('drops the time from the converted string when the original had none', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderCard('<div class="times">Jan 02 2024</div>');
    const byline = card.querySelector('.times');

    await pixiv.fireListener(dateListener(pixiv), card);

    expect(timestampOf(byline)).toBe(String(new Date('Jan 02 2024').getTime()));
    expect(duplicateOf(byline).textContent).toBe(formattedFrom(byline, DATE_ONLY_OPTIONS));
    expect(duplicateOf(byline).textContent).not.toContain(':');
  });

  it('reuses a single duplicate and skips rewriting an unchanged timestamp', async () => {
    const pixiv = await loadPixivUtils();
    const listener = dateListener(pixiv);
    const byline = document.querySelector('.times');
    const card = byline.closest('[data-ga4-label="thumbnail"]');

    await pixiv.fireListener(listener, card);

    const duplicate = duplicateOf(byline);
    const converted = duplicate.textContent;

    await pixiv.fireListener(listener, card);
    await pixiv.fireListener(listener, card);

    expect(document.querySelectorAll(DUPLICATE_SELECTOR)).toHaveLength(1);
    expect(duplicateOf(byline)).toBe(duplicate);
    expect(duplicate.textContent).toBe(converted);
  });

  it('leaves an unparseable date without a timestamp marker', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderCard('<div class="times">not a date</div>');
    const byline = card.querySelector('.times');

    await pixiv.fireListener(dateListener(pixiv), card);

    const duplicate = duplicateOf(byline);

    // The duplicate is inserted before parsing, so it exists but stays empty of
    // conversion metadata and keeps the original text.
    expect(duplicate.dataset.pixiv_utils_duplicate_date).toBe('true');
    expect(duplicate.dataset.pixiv_utils_date_timestamp).toBeUndefined();
    expect(duplicate.textContent).toBe('not a date');
  });

  it('keeps the "Image updated on" prefix on the converted string', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderCard('<div class="times">Image updated on 2024-01-02T15:04:05Z</div>');
    const byline = card.querySelector('.times');

    await pixiv.fireListener(dateListener(pixiv), card);

    const duplicate = duplicateOf(byline);

    expect(duplicate.dataset.pixiv_utils_date_prefix).toBe('Image updated on ');
    expect(duplicate.textContent).toBe(`Image updated on ${formattedFrom(byline)}`);
    expect(timestampOf(byline)).toBe(String(Date.parse('2024-01-02T15:04:05Z')));
  });

  it('falls back to the default format when the configured locale is invalid', async () => {
    const pixiv = await loadPixivUtils({ settings: { DATE_CONVERSION_LOCALES: 'not a locale' } });

    const { byline } = await convertFixtureCard(pixiv);

    expect(pixiv.console.warn.some(args => String(args[0]).includes('Invalid date formatting configuration'))).toBe(true);
    expect(timestampOf(byline)).toBe(String(new Date('01-02-2024 15:04').getTime()));
  });

  it('converts the bookmark_add.php byline as Japan time and stops there', async () => {
    document.body.innerHTML = '<div class="bookmark-detail-unit"><div class="meta">2024年01月02日 15:04</div></div>';

    const pixiv = await loadPixivUtils({ url: '/bookmark_add.php' });
    const meta = document.querySelector('.bookmark-detail-unit .meta');

    // This route terminates the script before sentinel registration.
    expect(pixiv.listeners).toEqual([]);
    expect(pixiv.menuCommands).toEqual([]);
    expect(pixiv.styles.join('\n')).toContain('.bookmark-detail-unit .meta[data-pixiv_utils_duplicate_date]');
    expect(logMessages(pixiv).some(message => message.includes('bookmark_add.php detected'))).toBe(true);

    // Its date has no timestamp, so it is read as Japan local time.
    expect(timestampOf(meta)).toBe(String(Date.parse('2024-01-02T15:04+09:00')));
    expect(duplicateOf(meta).textContent).toBe(formattedFrom(meta));
  });

  it('converts dates inside a mobile works-item card without a datetime attribute', async () => {
    // Mobile cards use .works-item instead of [data-ga4-label="thumbnail"].
    const card = renderCard(
      '<div class="works-item">' +
      '  <a href="/artworks/16112935"><img src="https://i.pximg.net/c/360x360/img/16112935_p0_master1200.jpg" alt=""></a>' +
      '  <a href="/users/4444">artist four</a>' +
      '  <div class="times">2024年02月03日 10:30</div>' +
      '</div>'
    );
    const worksItem = card.querySelector('.works-item');

    const pixiv = await loadPixivUtils();
    const listener = dateListener(pixiv);

    await pixiv.fireListener(listener, worksItem);
    await flush(4);

    const times = worksItem.querySelector('.times');
    const duplicate = duplicateOf(times);

    // Date should be converted even without a datetime attribute.
    expect(duplicate.dataset.pixiv_utils_duplicate_date).toBe('true');
    expect(duplicate.textContent).not.toContain('年');
    expect(timestampOf(times)).toBe(String(new Date('02-03-2024 10:30').getTime()));
  });
});
