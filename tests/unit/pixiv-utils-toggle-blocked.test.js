import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const CARD_SELECTOR = '[data-ga4-label="thumbnail"]';
const OVERLAY_SELECTOR = '.pixiv_utils_blocked_image_container';
const BLOCKED_ATTRIBUTE = 'data-pixiv_utils_blocked';
const MODERATION_ATTRIBUTE = 'data-pixiv_utils_moderation_blocked';
const EXPANDED_VIEW_ATTRIBUTE = 'data-pixiv_utils_expanded_view_blocked';
const TOGGLE_PREFERENCE = 'PREF_TOGGLE_BLOCKED';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));
const plainCard = () => cards().find(card => card.querySelector('a[href*="16112933"]'));

const isBlocked = card => card.hasAttribute(BLOCKED_ATTRIBUTE);
const isModerationBlocked = card => card.hasAttribute(MODERATION_ATTRIBUTE);
const overlayOf = card => card.querySelector(OVERLAY_SELECTOR);

/** The image registration is the one whose selector mentions the thumbnail label. */
const imageListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('data-ga4-label="thumbnail"')
  );

  if (!entry) throw new Error('No image sentinel callback registered.');

  return entry;
};

/** The recommended-user registration is the one whose selector mentions the users-tab marker. */
const recommendedUserListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('li.list-none')
  );

  if (!entry) throw new Error('No recommended-user sentinel callback registered.');

  return entry;
};

/** The menu command that shows or hides blocked items. */
const toggleCommand = pixiv => {
  const command = pixiv.menuCommands.find(entry => /Show blocked items|Hide blocked items/.test(entry.label));

  if (!command) throw new Error('No blocked-items toggle menu command registered.');

  return command;
};

const toggleBlockedItems = async pixiv => {
  await toggleCommand(pixiv).onClick();
  await flush();
};

/** Attach Vue-style page metadata and run the image pipeline on one card. */
const processCard = async (pixiv, card, props) => {
  card.__vue__ = { _props: { item: { id: '9001', tags: [], ...props } } };

  await pixiv.fireListener(imageListener(pixiv), card);
  await flush(4);

  return card;
};

/** Build a recommended-user entry that the userscript's selector matches. */
const addRecommendedUser = userId => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div><div style="translateY(0px)"><ul><li class="inline-block" id="recommended-user"><a href="/users/${userId}">artist</a></li></ul></div></div>`
  );

  return document.getElementById('recommended-user');
};

describe('pixiv-utils blocked-items toggle', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('registers a menu command that shows blocked items by default', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });

    expect(toggleCommand(pixiv).label).toContain('Show blocked items');
  });

  it('reveals a blocked artwork while keeping its moderation tooltip', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', PIXIV_BLOCKED_TAGS: ['blocked-tag'] }
    });

    const card = await processCard(pixiv, plainCard(), { id: '9201', tags: ['blocked-tag'] });

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).not.toBeNull();
    expect(card.title).toContain('Blocked by:');

    await toggleBlockedItems(pixiv);

    // The placeholder is detached, so the original thumbnail shows again.
    expect(overlayOf(card)).toBeNull();
    expect(isBlocked(card)).toBe(false);
    // The moderation marker survives, so the item can be blocked again later.
    expect(isModerationBlocked(card)).toBe(true);
    // The moderation verdict stays on the tooltip.
    expect(card.title).toContain('Blocked by:');
    expect(pixiv.storage.get(TOGGLE_PREFERENCE)).toBe(true);
  });

  it('blocks a revealed artwork again when the toggle is switched back', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', PIXIV_BLOCKED_TAGS: ['blocked-tag'] }
    });

    const card = await processCard(pixiv, plainCard(), { id: '9202', tags: ['blocked-tag'] });
    const artworkLink = card.querySelector('a[href*="artworks/"]');

    await toggleBlockedItems(pixiv);
    expect(overlayOf(card)).toBeNull();

    await toggleBlockedItems(pixiv);

    expect(overlayOf(card)).not.toBeNull();
    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card).previousElementSibling).toBe(artworkLink);
    expect(pixiv.storage.get(TOGGLE_PREFERENCE)).toBe(false);
  });

  it('renames the menu command to reflect the current state', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });

    expect(toggleCommand(pixiv).label).toContain('Show blocked items');

    await toggleBlockedItems(pixiv);

    expect(toggleCommand(pixiv).label).toContain('Hide blocked items');
    // The previous command is unregistered instead of piling up.
    expect(pixiv.menuCommands.filter(entry => /blocked items/.test(entry.label))).toHaveLength(1);
  });

  it('restores the inline display of a removed artwork when revealing it', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        SETTINGS_LANGUAGE: 'en',
        PIXIV_BLOCKED_TAGS: ['blocked-tag'],
        PIXIV_REMOVE_BLOCKED: true
      }
    });

    const card = await processCard(pixiv, plainCard(), { id: '9203', tags: ['blocked-tag'] });

    expect(card.style.display).toBe('none');
    expect(isModerationBlocked(card)).toBe(true);

    await toggleBlockedItems(pixiv);

    expect(card.style.display).toBe('');
    expect(isModerationBlocked(card)).toBe(true);
  });

  it('reveals a blocked recommended user', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', PIXIV_BLOCKED_USERS: ['2222'] }
    });

    const container = addRecommendedUser('2222');

    await pixiv.fireListener(recommendedUserListener(pixiv), container);
    await flush(4);

    expect(container.style.display).toBe('none');
    expect(isModerationBlocked(container)).toBe(true);

    await toggleBlockedItems(pixiv);

    expect(container.style.display).toBe('');
    expect(isModerationBlocked(container)).toBe(true);
  });

  it('reveals newly blocked artworks when the preference is already enabled at boot', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        SETTINGS_LANGUAGE: 'en',
        PIXIV_BLOCKED_TAGS: ['blocked-tag'],
        [TOGGLE_PREFERENCE]: true
      }
    });

    expect(toggleCommand(pixiv).label).toContain('Hide blocked items');

    const card = await processCard(pixiv, plainCard(), { id: '9204', tags: ['blocked-tag'] });

    expect(overlayOf(card)).toBeNull();
    expect(isBlocked(card)).toBe(false);
    expect(isModerationBlocked(card)).toBe(true);
    expect(card.title).toContain('Blocked by:');
  });

  it('keeps a revealed artwork revealed when it is processed again', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', PIXIV_BLOCKED_TAGS: ['blocked-tag'] }
    });

    const card = await processCard(pixiv, plainCard(), { id: '9205', tags: ['blocked-tag'] });

    await toggleBlockedItems(pixiv);
    expect(overlayOf(card)).toBeNull();

    // A forced re-evaluation must not undo the revealed state.
    card.__vue__ = { _props: { item: { id: '9205', tags: ['blocked-tag'] } } };
    await pixiv.fireListener(imageListener(pixiv), card);
    await flush(4);

    expect(overlayOf(card)).toBeNull();
    expect(isModerationBlocked(card)).toBe(true);
  });

  it('excludes the toggle preference from exported settings', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });

    await toggleBlockedItems(pixiv);

    expect(pixiv.storage.list()).toContain(TOGGLE_PREFERENCE);
    // `PREF_` keys are excluded from backups, so the toggle state stays local.
    expect(pixiv.storage.list().filter(key => key.startsWith('PREF_'))).toEqual([TOGGLE_PREFERENCE]);
  });

  it('ignores a stored toggle preference of the wrong type', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', [TOGGLE_PREFERENCE]: 'yes' }
    });

    expect(pixiv.storage.get(TOGGLE_PREFERENCE)).toBe(false);
    expect(toggleCommand(pixiv).label).toContain('Show blocked items');
  });

  it('marks the expanded view as blurred while blocked and unblurs it when revealed', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', PIXIV_BLOCKED_TAGS: ['blocked-tag'] }
    });

    const image = document.createElement('div');
    image.className = 'illust-details-view';
    image.innerHTML = '<figure><img src="https://i.pximg.net/artwork.jpg" alt=""></figure>';
    document.body.append(image);

    const controls = document.createElement('div');
    controls.innerHTML = '<nav><div><div><a href="/artworks/9206">artwork</a></div></div></nav>';
    image.append(controls);

    image.__vue__ = { _props: { item: { id: '9206', tags: ['blocked-tag'] } } };

    const entry = pixiv.listeners.find(candidate =>
      String(candidate.selector).includes('work-interactions')
    );

    await pixiv.fireListener(entry, controls);
    await flush(4);

    expect(image.hasAttribute(EXPANDED_VIEW_ATTRIBUTE)).toBe(true);

    await toggleBlockedItems(pixiv);

    expect(image.hasAttribute(EXPANDED_VIEW_ATTRIBUTE)).toBe(false);
    expect(isModerationBlocked(image)).toBe(true);
  });
});
