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
    expect(overlayOf(card)).not.toBeNull();
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
});
