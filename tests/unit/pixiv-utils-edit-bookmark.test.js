import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

describe('pixiv-utils edit bookmark', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
    vi.unstubAllGlobals();
  });

  it('loads bookmark tags through fetch when the edit-bookmark button is clicked', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });

    const card = document.querySelector('#card-marker');
    const vueProps = { id: '16112932', userId: '1111', tags: [] };
    card.__vue__ = { _props: { item: vueProps } };

    const imageListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-ga4-label="thumbnail"')
    );
    await pixiv.fireListener(imageListener, card);
    await flush(4);

    const button = card.querySelector('.pixiv_utils_edit_bookmark');
    expect(button).not.toBeNull();

    button.click();
    await flush(6);

    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('bookmark/tags');

    expect(document.querySelector('.pixiv-utils-edit-bookmark-panel')).not.toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('shows saveFailed when saving bookmark tags fails', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: null } }) };
      }
      // Save API: fail
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });

    const card = document.querySelector('#card-marker');
    const vueProps = { id: '16112932', userId: '1111', tags: [] };
    card.__vue__ = { _props: { item: vueProps } };

    const imageListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-ga4-label="thumbnail"')
    );
    await pixiv.fireListener(imageListener, card);
    await flush(6);

    const button = card.querySelector('.pixiv_utils_edit_bookmark');
    expect(button).not.toBeNull();

    button.click();
    await flush(6);

    // Panel should be open with tags loaded and apply button enabled.
    const panel = document.querySelector('.pixiv-utils-edit-bookmark-panel');
    expect(panel).not.toBeNull();

    const applyButton = panel.querySelector('.pixiv-utils-alert-ok');
    expect(applyButton).not.toBeNull();
    expect(applyButton.disabled).toBe(false);

    applyButton.click();
    await flush(6);

    // Save failed: an alert dialog should appear.
    expect(document.querySelector('.pixiv-utils-alert')).not.toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('does not add an edit-bookmark button when ENABLE_EDIT_BOOKMARK is false', async () => {
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', ENABLE_EDIT_BOOKMARK: false }
    });

    const card = document.querySelector('#card-marker');
    const vueProps = { id: '16112932', userId: '1111', tags: [] };
    card.__vue__ = { _props: { item: vueProps } };

    const imageListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-ga4-label="thumbnail"')
    );
    await pixiv.fireListener(imageListener, card);
    await flush(6);

    expect(card.querySelector('.pixiv_utils_edit_bookmark')).toBeNull();
    expect(card.querySelector('.pixiv_utils_edit_bookmark_container')).toBeNull();
  });

  it('opens the bookmark href instead of a panel when ENABLE_FANCY_EDIT_BOOKMARK is false', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', ENABLE_FANCY_EDIT_BOOKMARK: false }
    });

    const card = document.querySelector('#card-marker');
    const vueProps = { id: '16112932', userId: '1111', tags: [] };
    card.__vue__ = { _props: { item: vueProps } };

    const imageListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-ga4-label="thumbnail"')
    );
    await pixiv.fireListener(imageListener, card);
    await flush(6);

    const button = card.querySelector('.pixiv_utils_edit_bookmark');
    expect(button).not.toBeNull();
    // Button should still have a bookmark_add href.
    expect(button.href).toContain('bookmark_add.php');

    // Prevent jsdom from navigating when clicking the link.
    button.addEventListener('click', event => event.preventDefault(), { once: true });

    button.click();
    await flush(6);

    // No fancy panel should open.
    expect(document.querySelector('.pixiv-utils-edit-bookmark-panel')).toBeNull();
    expect(document.querySelector('.pixiv-utils-alert')).toBeNull();
  });
});
