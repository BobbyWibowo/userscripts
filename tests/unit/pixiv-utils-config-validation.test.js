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

const SECTION_GATE_KEY = '_SECTIONS_TOGGLE_BOOKMARKED_GATE';

const IMAGE_GATE_KEY = '_SELECTORS_IMAGE_GATE';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));

const cardWithArtwork = id => cards().find(card => card.querySelector(`a[href*="${id}"]`));

// Card 1 carries the bookmarked marker, card 2 does not; only card 2 can be blocked.
const plainCard = () => cardWithArtwork('16112933');

const isBlocked = card => card.hasAttribute('data-pixiv_utils_blocked');

const logMessages = pixiv => pixiv.console.log.map(args => args.map(String).join(' '));
const errorMessages = pixiv => pixiv.console.error.map(args => args.map(String).join(' '));

/** Attach Vue-style page metadata and run the image pipeline on one card. */
const processCard = async (pixiv, card, props) => {
  card.__vue__ = { _props: { item: { id: '9001', tags: [], ...props } } };

  await pixiv.observeImageCard(card);
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
    const imageSelector = pixiv.observedSelectors().find(selector => String(selector).includes('data-ga4-label="thumbnail"'));
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
          { selectorParent: 'article', selectorHeader: 'h2', selectorImagesContainer: 'ul' },
          { selectorParent: 'div[', selectorHeader: 'h2', selectorImagesContainer: 'ul' }
        ]
      }
    });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);

    const errors = errorMessages(pixiv);
    expect(errors.some(message =>
      message.includes('SECTIONS_TOGGLE_BOOKMARKED') && message.includes('section 1')
    )).toBe(true);

    // The valid custom section is registered with the shared observer, not
    // Sentinel, so the Sentinel listener count is unchanged. The gate is built
    // dynamically from the configured sections and includes the custom parent.
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
    expect(pixiv.observedSelectors().some(selector => String(selector).includes('article'))).toBe(true);
  });

  it('reuses a valid pre-built selector cache without rebuilding', async () => {
    const storage = createStorage();
    const first = await loadPixivUtils({ storage });
    expect(logMessages(first)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');

    const cached = storage.values.get(PREBUILT_KEY);
    const cachedGate = cached.selectors[SECTION_GATE_KEY];
    expect(cachedGate.version).toBe(2);
    expect(Array.isArray(cachedGate.targets)).toBe(true);
    expect(cachedGate.targets.length).toBeGreaterThan(0);
    expect(cachedGate.targets.join(', ')).toContain('div[data-ga4-label="works_content"]');
    expect(cachedGate.targets.join(', ')).toContain('div[style*="--street-main-ranking-height"] nav');
    expect(cachedGate.targets.join(', ')).toContain('div[style*="--street-main-ranking-height"] h1');
    expect(cachedGate.targets.join(', ')).toContain('div[style*="--street-main-ranking-height"] ol');

    const cachedImageGate = cached.selectors[IMAGE_GATE_KEY];
    expect(cachedImageGate.version).toBe(2);
    expect(cachedImageGate.image.length).toBeGreaterThan(0);
    expect(cachedImageGate.artist.length).toBeGreaterThan(0);
    expect(cachedImageGate.image.join(', ')).toContain('div[data-ga4-label="thumbnail"]');
    expect(cachedImageGate.image.join(', ')).toContain('a[href*="artworks/"]');
    expect(cachedImageGate.artist.join(', ')).toContain('nav[style] a[href]');

    const second = await loadPixivUtils({ storage });
    expect(logMessages(second)).toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(second)).not.toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(second.console.error).toEqual([]);

    // The cached selectors are the ones registered with the shared observer.
    expect(second.observedSelectors()).toContain(cached.selectors.SELECTORS_IMAGE);
    expect(second.observedSelectors()).toHaveLength(
      1 + cachedGate.targets.length + cachedImageGate.image.length + cachedImageGate.artist.length
    );
    for (const gateSelector of [
      ...cachedGate.targets,
      ...cachedImageGate.image,
      ...cachedImageGate.artist
    ]) {
      expect(second.observedSelectors()).toContain(gateSelector);
    }
    expect(second.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('rejects a pre-built selector cache without the section gate and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    delete cached.selectors[SECTION_GATE_KEY];

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);
    expect(storage.values.get(PREBUILT_KEY).selectors[SECTION_GATE_KEY]).toEqual({
      version: 2,
      targets: expect.any(Array)
    });
  });

  it('rejects a pre-built selector cache without the image gate and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    delete cached.selectors[IMAGE_GATE_KEY];

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);
    expect(storage.values.get(PREBUILT_KEY).selectors[IMAGE_GATE_KEY]).toEqual({
      version: 2,
      image: expect.any(Array),
      artist: expect.any(Array)
    });
  });

  it('builds image gates for custom selectors without :has()', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage, settings: { SELECTORS_IMAGE: 'div.custom-image-card' } });

    const cached = storage.values.get(PREBUILT_KEY);
    expect(cached.selectors[IMAGE_GATE_KEY].image.join(', ')).toContain('div.custom-image-card');
  });

  it('rejects an empty section gate cache when sections exist', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors[SECTION_GATE_KEY] = { version: 2, targets: [] };

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);
    expect(storage.values.get(PREBUILT_KEY).selectors[SECTION_GATE_KEY].targets.length).toBeGreaterThan(0);
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
    expect(pixiv.observedSelectors().some(selector => String(selector).includes('data-ga4-label="thumbnail"'))).toBe(true);
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('rejects a tampered section gate cache and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors[SECTION_GATE_KEY] = { version: 2, targets: ['div>>'] };

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);
    for (const selector of pixiv.observedSelectors()) {
      expect(String(selector)).not.toContain('div>>');
    }
  });

  it('rejects an older section gate version and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors[SECTION_GATE_KEY] = { ...cached.selectors[SECTION_GATE_KEY], version: 1 };

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(storage.values.get(PREBUILT_KEY).selectors[SECTION_GATE_KEY].version).toBe(2);
  });

  it('rejects a tampered image gate cache and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors[IMAGE_GATE_KEY] = { version: 2, image: ['div>>'], artist: [] };

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(pixiv.console.error).toEqual([]);
    for (const selector of pixiv.observedSelectors()) {
      expect(String(selector)).not.toContain('div>>');
    }
  });

  it('rejects an older image gate version and rebuilds', async () => {
    const storage = createStorage();
    await loadPixivUtils({ storage });

    const cached = storage.values.get(PREBUILT_KEY);
    cached.selectors[IMAGE_GATE_KEY] = { ...cached.selectors[IMAGE_GATE_KEY], version: 1 };

    const pixiv = await loadPixivUtils({ storage });
    expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
    expect(logMessages(pixiv)).toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
    expect(storage.values.get(PREBUILT_KEY).selectors[IMAGE_GATE_KEY].version).toBe(2);
  });

  it('never writes the pre-built cache in debug mode', async () => {
    const storage = createStorage();
    const first = await loadPixivUtils({ storage, settings: { MODE: 'DEBUG' } });
    const second = await loadPixivUtils({ storage, settings: { MODE: 'DEBUG' } });

    for (const pixiv of [first, second]) {
      expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: CSS selectors have been pre-built and cached for future runs.');
      expect(logMessages(pixiv)).not.toContain('[Pixiv Utils]: Reusing cached pre-built CSS selectors.');
      expect(pixiv.observedSelectors()).toHaveLength(4);
    }
    expect(storage.values.get(PREBUILT_KEY)).toBeNull();
  });
});
