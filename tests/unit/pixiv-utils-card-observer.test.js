import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const BLOCKED_ATTRIBUTE = 'data-pixiv_utils_blocked';

const cardFor = id => document.querySelector(`[data-ga4-label="thumbnail"] a[href*="${id}"]`)?.closest('[data-ga4-label="thumbnail"]');

const isBlocked = card => card.hasAttribute(BLOCKED_ATTRIBUTE);

const setVueItem = (card, item) => {
  card.__vue__ = { _props: { item } };
};

describe('pixiv-utils shared card observer', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('replaces the image Sentinel registrations with observer registrations', async () => {
    const pixiv = await loadPixivUtils();

    // The image selectors are no longer Sentinel registrations...
    expect(pixiv.selectors().some(selector => String(selector).includes('works-item-illust:has(.thumb)'))).toBe(false);

    // ...but are observed by the shared MutationObserver.
    const observed = pixiv.observedSelectors().join('\n');
    expect(observed).toContain('data-ga4-label="thumbnail"');
    expect(observed).toContain('works-item-illust:has(.thumb)');

    // Desktop image entries match a bare `img` (no src gate) so a hover-popup
    // card is recognized at insertion, before its lazy thumbnail fills in.
    expect(observed).toContain('a[href*="artworks/"] img');
    expect(observed).not.toContain('img[src]');
  });

  it('processes a card delivered as a fresh insertion (frame-1 path)', async () => {
    const pixiv = await loadPixivUtils({ settings: { ENABLE_EDIT_BOOKMARK: true } });
    const card = cardFor('16112933');
    setVueItem(card, { id: '16112933', userId: '7777', tags: [], notLoaded: false });

    await pixiv.observeImageCard(card);

    // The card gained the Edit Bookmark button through the observer path.
    expect(card.querySelector('.pixiv_utils_edit_bookmark')).not.toBeNull();
  });

  it('re-processes a recycled card when its artwork identity changes', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['8888'] } });
    const card = cardFor('16112933');

    // First artwork is not blocked.
    card.dataset.tx = '111';
    setVueItem(card, { id: '16112933', userId: '2222', tags: [] });
    await pixiv.observeImageCard(card);
    expect(isBlocked(card)).toBe(false);

    // The same node is reused for a blocked artist's artwork.
    card.dataset.tx = '999';
    setVueItem(card, { id: '16112933', userId: '8888', tags: [] });

    const observed = (globalThis.unsafeWindow ?? globalThis).__pixivUtilsObserved;
    observed.deliver({ type: 'attributes', target: card, attributeName: 'data-tx' });
    await flush(6);

    expect(isBlocked(card)).toBe(true);
  });

  it('ignores an attribute change that leaves the artwork identity unchanged', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['8888'] } });
    const card = cardFor('16112933');

    card.dataset.tx = '111';
    setVueItem(card, { id: '16112933', userId: '2222', tags: [] });
    await pixiv.observeImageCard(card);

    // A class tweak without an identity change must not re-run the card.
    card.dataset.pixiv_utils_marker = 'already-processed';
    const observed = (globalThis.unsafeWindow ?? globalThis).__pixivUtilsObserved;
    observed.deliver({ type: 'attributes', target: card, attributeName: 'class' });
    await flush(6);

    // Still not blocked, and no moderation tooltip was re-applied.
    expect(isBlocked(card)).toBe(false);
    expect(card.dataset.pixiv_utils_last_tx).toBe('111');
  });

  it('processes an artist-popup card whose wrapper only matches once its artwork link is inserted', async () => {
    await loadPixivUtils({ settings: { ENABLE_EDIT_BOOKMARK: true } });

    // Mirror the live popup shape: an empty wrapper below the user link, whose
    // artwork anchor and image are added several levels deeper afterwards.
    const root = document.createElement('div');
    root.innerHTML = '<div open><a href="/users/11"></a><div><div></div></div></div>';
    document.body.append(root);
    const wrapper = root.querySelector('div[open] a[href*="users/"] ~ div > div');
    setVueItem(wrapper, { id: '16112933', userId: '7777', tags: [], notLoaded: false });

    // Deep chain below the wrapper so the artwork image sits several ancestors
    // away from the wrapper that actually matches SELECTORS_IMAGE.
    const deepHost = document.createElement('div');
    let cursor = deepHost;
    for (let i = 0; i < 6; i += 1) {
      const next = document.createElement('div');
      cursor.append(next);
      cursor = next;
    }
    wrapper.append(deepHost);

    const observed = (globalThis.unsafeWindow ?? globalThis).__pixivUtilsObserved;
    const anchor = document.createElement('a');
    anchor.href = '/artworks/16112933';
    const img = document.createElement('img');
    anchor.append(img);
    cursor.append(anchor);

    observed.deliver({ type: 'childList', target: cursor, addedNodes: [anchor] });
    await flush(6);

    // The ancestor walk reaches the wrapper seven levels up and runs doImage on it.
    expect(wrapper.dataset.pixiv_utils_processed).toContain('16112933');
  });
});
