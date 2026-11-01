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
 * The image registration is the fourth unconditional callback: home, own
 * profile, expanded-view controls, then images.
 */
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

describe('pixiv-utils artwork blocking', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('blocks an artwork by artist ID and links the placeholder to it', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9002', userId: '2222', tags: ['cat'] });

    expect(isBlocked(card)).toBe(true);

    const overlay = overlayOf(card);

    expect(overlay).not.toBeNull();
    expect(overlay.tagName).toBe('A');
    expect(overlay.href).toBe(artworkLinkOf(card).href);
    expect(artworkLinkOf(card).nextElementSibling).toBe(overlay);
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
    expect(overlayOf(literal)).not.toBeNull();
  });

  it('does not match tag rules that do not apply', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['blocked-tag'] } });
    const card = await processCard(pixiv, plainCard(), { id: '9005', tags: ['blocked-tag-extended', 'cat'] });

    expect(isBlocked(card)).toBe(false);
  });

  it('blocks AI-generated works only when AI blocking is enabled', async () => {
    const off = await loadPixivUtils();
    const allowed = await processCard(off, plainCard(), { id: '9006', ai_type: 2, tags: [] });

    expect(isBlocked(allowed)).toBe(false);

    cleanupPixivUtils();
    loadFixture();

    const on = await loadPixivUtils({ settings: { PIXIV_BLOCK_AI: true } });
    const blocked = await processCard(on, plainCard(), { id: '9007', ai_type: 2, tags: [] });
    const notAi = await processCard(on, bookmarkedCard(), { id: '9008', ai_type: 1, tags: [] });

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
});
