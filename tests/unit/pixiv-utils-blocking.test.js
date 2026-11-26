import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const CARD_SELECTOR = '[data-ga4-label="thumbnail"]';
const OVERLAY_SELECTOR = '.pixiv_utils_blocked_image_container';
const HIGHLIGHT_ATTRIBUTE = 'data-pixiv_utils_highlight';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));

const cardWithArtwork = id => cards().find(card => card.querySelector(`a[href*="${id}"]`));

// Card 1 carries the bookmarked marker, card 2 does not.
const bookmarkedCard = () => cardWithArtwork('16112932');
const plainCard = () => cardWithArtwork('16112933');

const isBlocked = card => card.hasAttribute('data-pixiv_utils_blocked');

const overlayOf = card => card.querySelector(OVERLAY_SELECTOR);

const artworkLinkOf = card => card.querySelector('a[href*="artworks/"]');

/**
 * Attach React-style page metadata and run the image pipeline on one card.
 *
 * Desktop cards are React-backed, so the fixture carries a fiber instead of a
 * Vue instance: a `__vue__` card is treated as a mobile layout card, which
 * never uses the inline (remove) blocking path these tests assert.
 */
const processCard = async (pixiv, card, props) => {
  card.__reactFiber$fixture = {
    memoizedProps: { id: '9001', type: 'illust', tags: [], ...props },
    child: null,
    return: null
  };

  await pixiv.observeImageCard(card);
  await flush(4);

  return card;
};

describe('pixiv-utils artwork blocking', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('blocks an artwork by artist ID with the pure-CSS overlay marker', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9002', userId: '2222', tags: ['cat'] });

    expect(isBlocked(card)).toBe(true);
    // The visual is drawn by CSS off data-pixiv_utils_blocked; no extra node is
    // injected (so Pixiv's re-renders cannot drop it), and the original link is
    // kept so the tile stays clickable.
    expect(card.dataset.pixiv_utils_blocked).toBe('true');
    expect(overlayOf(card)).toBeNull();
    expect(artworkLinkOf(card)).not.toBeNull();
  });

  it('leaves other artworks of the same page untouched', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9002', userId: '3333', tags: [] });

    expect(isBlocked(card)).toBe(false);
    expect(overlayOf(card)).toBeNull();
  });

  it('matches literal and regexp tag rules', async () => {
    const pixiv = await loadPixivUtils({
      settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag', ['^ai[- ]', 'i']] }
    });

    // Card 1 is only blockable once its bookmarked marker is gone.
    bookmarkedCard().querySelector('.works-bookmark-button').remove();

    const literal = await processCard(pixiv, bookmarkedCard(), { id: '9003', tags: ['cat', 'blocked-tag'] });
    const regexp = await processCard(pixiv, plainCard(), { id: '9004', tags: ['AI-Generated'] });

    expect(isBlocked(literal)).toBe(true);
    expect(isBlocked(regexp)).toBe(true);
    expect(literal.dataset.pixiv_utils_blocked).toBe('true');
  });

  it('does not match tag rules that do not apply', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9005', tags: ['blocked-tag-extended', 'cat'] });

    expect(isBlocked(card)).toBe(false);
  });

  it('blocks AI-generated works only when AI blocking is enabled', async () => {
    const off = await loadPixivUtils();
    const allowed = await processCard(off, plainCard(), { id: '9006', aiType: 2, tags: [] });

    expect(isBlocked(allowed)).toBe(false);

    cleanupPixivUtils();
    loadFixture();

    const on = await loadPixivUtils({ settings: { PIXIV_BLOCK_AI: true } });
    const blocked = await processCard(on, plainCard(), { id: '9007', aiType: 2, tags: [] });
    const notAi = await processCard(on, bookmarkedCard(), { id: '9008', aiType: 1, tags: [] });

    expect(isBlocked(blocked)).toBe(true);
    expect(isBlocked(notAi)).toBe(false);
  });

  it('never blocks a bookmarked artwork', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'] } });
    const card = await processCard(pixiv, bookmarkedCard(), { id: '9009', tags: ['blocked-tag'] });

    expect(isBlocked(card)).toBe(false);
    expect(overlayOf(card)).toBeNull();
  });

  it('never blocks on the viewer\'s own profile', async () => {
    document.body.insertAdjacentHTML('afterbegin', '<a href="/settings/profile">Profile</a>');

    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9010', tags: ['blocked-tag'] });

    expect(isBlocked(card)).toBe(false);
  });

  it('highlights matching tags, and only bypasses blocking when configured', async () => {
    const settings = {
      PIXIV_BLOCKED_TAGS: ['blocked-tag'],
      PIXIV_HIGHLIGHTED_TAGS: ['blocked-tag']
    };

    const strict = await loadPixivUtils({ settings });
    const blocked = await processCard(strict, plainCard(), { id: '9011', tags: ['blocked-tag'] });

    // Highlighting alone does not exempt an artwork from blocking.
    expect(blocked.hasAttribute(HIGHLIGHT_ATTRIBUTE)).toBe(true);
    expect(isBlocked(blocked)).toBe(true);

    cleanupPixivUtils();
    loadFixture();

    const bypassing = await loadPixivUtils({
      settings: { ...settings, PIXIV_HIGHLIGHTED_BYPASS_BLOCK: true }
    });
    const bypassed = await processCard(bypassing, plainCard(), { id: '9012', tags: ['blocked-tag'] });

    expect(bypassed.hasAttribute(HIGHLIGHT_ATTRIBUTE)).toBe(true);
    expect(isBlocked(bypassed)).toBe(false);
    expect(overlayOf(bypassed)).toBeNull();
  });

  it('wires an edit-bookmark button into the artwork controls', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const card = await processCard(pixiv, bookmarkedCard(), { id: '9013', tags: [] });
    const button = card.querySelector('.pixiv_utils_edit_bookmark');

    expect(button).not.toBeNull();
    // The button is inserted into the artwork's controls container, which wraps
    // the built-in bookmark button.
    expect(card.querySelector('.controls').contains(button)).toBe(true);
  });

  it('removes blocked artwork from the DOM when PIXIV_REMOVE_BLOCKED is true', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        PIXIV_BLOCKED_TAGS: ['blocked-tag'],
        PIXIV_REMOVE_BLOCKED: true
      }
    });

    // Remove the bookmark marker so card 1 can be blocked.
    bookmarkedCard().querySelector('.works-bookmark-button').remove();

    const card = await processCard(pixiv, bookmarkedCard(), { id: '9014', tags: ['blocked-tag'] });

    expect(isBlocked(card)).toBe(true);
    // Removed artwork is hidden via display:none, not replaced by an overlay.
    expect(card.style.display).toBe('none');
    expect(overlayOf(card)).toBeNull();
  });

  it('draws overlay-mode blocks with CSS off the marker, with no injected node', async () => {
    // Overlay mode (what the expanded view's artist bottom thumbs use) instead of
    // the inline removal path.
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'], PIXIV_REMOVE_BLOCKED: false } });
    const card = await processCard(pixiv, plainCard(), { id: '9015', userId: '2222', tags: ['cat'] });

    expect(isBlocked(card)).toBe(true);
    expect(card.dataset.pixiv_utils_blocked).toBe('true');
    // No leftover injected overlay element from the old implementation.
    expect(overlayOf(card)).toBeNull();
  });
});
