import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTENER_COUNT,
  PREBUILT_KEY,
  STARTED_LOG,
  cleanupPixivUtils,
  createStorage,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const STARTED_MESSAGE = `[Pixiv Utils]: ${STARTED_LOG}`;

const CARD_SELECTOR = '[data-ga4-label="thumbnail"]';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));

const cardWithArtwork = id => cards().find(card => card.querySelector(`a[href*="${id}"]`));

// Card 1 carries the bookmarked marker, card 2 does not; only card 2 can be blocked.
const plainCard = () => cardWithArtwork('16112933');

const isBlocked = card => card.hasAttribute('data-pixiv_utils_blocked');

const logMessages = pixiv => pixiv.console.log.map(args => args.map(String).join(' '));
const errorMessages = pixiv => pixiv.console.error.map(args => args.map(String).join(' '));

const imageListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('data-ga4-label="thumbnail"')
  );

  if (!entry) throw new Error('No image sentinel callback registered.');

  return entry;
};

/** Attach Vue-style page metadata and run the image pipeline on one card. */
const processCard = async (pixiv, card, props) => {
  card.__vue__ = { _props: { item: { id: '9001', tags: [], ...props } } };

  await pixiv.fireListener(imageListener(pixiv), card);
  await flush(4);

  return card;
};

describe('pixiv-utils configuration error isolation', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('keeps built-in selectors when a stored SELECTORS_ value is invalid', async () => {
    // `div>>` is rejected by both jsdom's selector engine and real browsers
    // (nwsapi is more lenient than browsers for unclosed selectors, so this
    // probe value must stay invalid in both).
    const pixiv = await loadPixivUtils({ settings: { SELECTORS_IMAGE: 'div>>' } });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    expect(errors.some(message => message.includes('SELECTORS_IMAGE') && message.includes('invalid selector'))).toBe(true);

    // The corrupt value never reaches a registered selector...
    for (const selector of pixiv.selectors()) {
      expect(String(selector)).not.toContain('div>>');
    }

    // ...and the built-in image selectors remain active.
    const imageSelector = pixiv.selectors().find(selector => String(selector).includes('data-ga4-label="thumbnail"'));
    expect(imageSelector).toBeDefined();

    // Unrelated features are untouched: the default listener set registered.
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('still combines a valid custom selector with the built-in ones', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'], SELECTORS_TAG_BUTTON: 'div.custom-tag-button' }
    });

    expect(pixiv.console.error).toEqual([]);

    const tagSelector = pixiv.selectors().find(selector => String(selector).includes('tags_carousel'));
    expect(tagSelector).toContain('div.custom-tag-button');
  });

  it('still combines a stored array of custom selectors with the built-ins', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'], SELECTORS_TAG_BUTTON: ['div.custom-tag-a', 'div.custom-tag-b'] }
    });

    expect(pixiv.console.error).toEqual([]);

    const tagSelector = pixiv.selectors().find(selector => String(selector).includes('tags_carousel'));
    expect(tagSelector).toContain('div.custom-tag-a');
    expect(tagSelector).toContain('div.custom-tag-b');
  });

  it('still combines a comma-separated multi-line custom selector string with the built-ins', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'], SELECTORS_TAG_BUTTON: 'div.custom-tag-a,\ndiv.custom-tag-b' }
    });

    expect(pixiv.console.error).toEqual([]);

    const tagSelector = pixiv.selectors().find(selector => String(selector).includes('tags_carousel'));
    expect(tagSelector).toContain('div.custom-tag-a');
    expect(tagSelector).toContain('div.custom-tag-b');
  });

  it('skips an unparseable blocked-tag regex while valid rules still block', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag', ['(bad', 'i']] }
    });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    expect(errors.some(message => message.includes('PIXIV_BLOCKED_TAGS') && message.includes('(bad'))).toBe(true);

    const card = await processCard(pixiv, plainCard(), { id: '9001', tags: ['blocked-tag'] });
    expect(isBlocked(card)).toBe(true);
  });

  it('keeps valid regexes in a combined group when one pattern is malformed', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: [['^ai[- ]', 'i'], ['(bad', 'i']] }
    });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    expect(errors.some(message => message.includes('PIXIV_BLOCKED_TAGS') && message.includes('(bad'))).toBe(true);

    const card = await processCard(pixiv, plainCard(), { id: '9002', tags: ['AI-Generated'] });
    expect(isBlocked(card)).toBe(true);
  });

  it('reports every corrupted setting and still registers the default features', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        SELECTORS_DATE: 42,
        PIXIV_BLOCKED_USERS: { not: 'an array' },
        UTAGS_BLOCKED_TAGS: 7,
        SECTIONS_TOGGLE_BOOKMARKED: 'garbage',
        WAIT_FOR_POLL: 'fast',
        MODE: 'yes'
      }
    });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    for (const key of ['SELECTORS_DATE', 'PIXIV_BLOCKED_USERS', 'UTAGS_BLOCKED_TAGS', 'SECTIONS_TOGGLE_BOOKMARKED', 'WAIT_FOR_POLL', 'MODE']) {
      expect(errors.some(message => message.includes(key))).toBe(true);
    }

    // Unrelated functionality survives: the default listener set registered.
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('drops only the corrupt toggle-bookmarked section', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        SECTIONS_TOGGLE_BOOKMARKED: [
          { selectorParent: 'section', selectorHeader: 'h2', selectorImagesContainer: 'ul' },
          { selectorParent: 'div[', selectorHeader: 'h2', selectorImagesContainer: 'ul' }
        ]
      }
    });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    expect(errors.some(message =>
      message.includes('SECTIONS_TOGGLE_BOOKMARKED') && message.includes('section 1')
    )).toBe(true);

    // The eleven built-in sections plus the one valid custom section register
    // two callbacks each (parent and derived container).
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT + 2);
  });

  it('reuses a valid pre-built selector cache without rebuilding', async () => {
    const storage = createStorage();
    const first = await loadPixivUtils({ storage });
    expect(logMessages(first)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');

    const second = await loadPixivUtils({ storage });
    expect(logMessages(second)).toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(second)).not.toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(second.console.error).toEqual([]);

    // The cached selectors are the ones registered with sentinel.
    expect(second.selectors().some(selector => String(selector).includes('data-ga4-label="thumbnail"'))).toBe(true);
    expect(second.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('rejects a tampered pre-built selector cache and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors.SELECTORS_IMAGE = 'div>>';

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);

    // The corrupt cached value never reaches a registered selector...
    for (const selector of pixiv.selectors()) {
      expect(String(selector)).not.toContain('div>>');
    }

    // ...and the built-in image selectors remain active.
    expect(pixiv.selectors().some(selector => String(selector).includes('data-ga4-label="thumbnail"'))).toBe(true);
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });
});
