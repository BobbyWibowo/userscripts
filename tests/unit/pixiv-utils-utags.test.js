import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const OVERLAY_SELECTOR = '.pixiv_utils_blocked_image_container';
const MODERATION_MARKER = 'data-pixiv_utils_moderation_blocked';

/**
 * The UTags integration registers one callback for every configured UTag
 * name, e.g. `[data-utags_tag="block"]`.
 */
const utagsListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('data-utags_tag=')
  );

  if (!entry) throw new Error('No UTags sentinel callback registered.');

  return entry;
};

/**
 * Render one artwork card that carries a UTag marker, and attach the Vue
 * props the data extractor reads.
 */
const renderTaggedCard = (props = {}) => {
  document.body.insertAdjacentHTML('beforeend', `
    <div data-ga4-label="thumbnail" id="utags-card">
      <a href="/artworks/16112933"><img src="https://i.pximg.net/x.jpg" alt=""></a>
      <span data-utags_tag="block"></span>
      <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
    </div>`);

  const card = document.getElementById('utags-card');
  card.__vue__ = { _props: { item: { id: '9001', tags: [], ...props } } };

  return card;
};

/**
 * Render a Rankings-style card whose artist link already carries a UTag
 * marker, but without the artwork link yet: image data cannot be extracted
 * until the card finishes initializing (i.e. scrolls into view).
 */
const renderDeferredCard = () => {
  document.body.insertAdjacentHTML('beforeend', `
    <div data-ga4-label="thumbnail" id="utags-deferred-card">
      <span data-utags_tag="block"></span>
      <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
    </div>`);

  return document.getElementById('utags-deferred-card');
};

/** Fire the UTags callback for the card's marker element. */
const fireUtags = async (pixiv, card) => {
  const marker = card.querySelector('[data-utags_tag="block"]');

  await pixiv.fireListener(utagsListener(pixiv), marker);
  await flush(4);
};

const isBlocked = card => card.hasAttribute('data-pixiv_utils_blocked');

const overlayOf = card => card.querySelector(OVERLAY_SELECTOR);

describe('pixiv-utils UTags integration', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('blocks an artwork carrying a blocked UTag', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderTaggedCard();

    await fireUtags(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    // The pure-CSS block adds no injected node.
    expect(overlayOf(card)).toBeNull();
    // The moderation marker is what the toggle uses to find the element again.
    expect(card.getAttribute(MODERATION_MARKER)).toBe('true');
  });

  it('does not block a bookmarked artwork that carries a blocked UTag', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderTaggedCard();
    // The built-in bookmark marker makes the artwork exempt from blocking.
    card.insertAdjacentHTML('beforeend', `
      <div class="works-bookmark-button"><svg viewBox="0 0 24 24"><path fill="#FF4060" d="M12 21l-8-6 8-6 8 6-8 6z"></path></svg></div>`);

    await fireUtags(pixiv, card);

    expect(isBlocked(card)).toBe(false);
    expect(overlayOf(card)).toBeNull();
  });

  it('reports the UTag that caused the block in the tooltip', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderTaggedCard({ title: 'Utagged artwork' });

    await fireUtags(pixiv, card);

    // Floating tooltips are off in the harness, so the tooltip is a title.
    expect(card.title).toContain('UTag: block');
  });

  it('re-applies a UTag block when only the image pipeline processes the card', async () => {
    const pixiv = await loadPixivUtils();
    const card = renderTaggedCard();

    // The UTags sentinel never fires for this marker: the block can only
    // come from the re-apply loop inside doImage.
    await pixiv.observeImageCard(card);
    await flush(4);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).toBeNull();
    expect(card.getAttribute(MODERATION_MARKER)).toBe('true');
  });

  it('re-applies a UTag block when a deferred Rankings card scrolls into view', async () => {
    // Deferred cards only process once their intersection is delivered, which
    // models the below-the-fold Rankings cards the fix targets.
    const pixiv = await loadPixivUtils({ autoIntersect: false });
    const card = renderDeferredCard();

    // The marker fires while the card has no artwork data yet, so the
    // detection cannot extract image data and skips without blocking.
    await fireUtags(pixiv, card);
    expect(isBlocked(card)).toBe(false);
    expect(overlayOf(card)).toBeNull();

    // The artwork link renders afterwards; the image sentinel now registers
    // the card, but it stays deferred with autoIntersect off.
    card.insertAdjacentHTML('afterbegin', `
      <a href="/artworks/16112933"><img src="https://i.pximg.net/x.jpg" alt=""></a>`);

    await pixiv.observeImageCard(card);
    await flush(4);
    expect(isBlocked(card)).toBe(false);

    const observer = pixiv.observers.find(instance => instance.targets.has(card));
    expect(observer).toBeDefined();

    // Scrolling into view delivers the intersection: doImage runs and its
    // re-apply loop picks up the marker detected earlier.
    observer.deliver([{ target: card, isIntersecting: true }]);
    await flush(4);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).toBeNull();
    expect(card.getAttribute(MODERATION_MARKER)).toBe('true');
  });
});
