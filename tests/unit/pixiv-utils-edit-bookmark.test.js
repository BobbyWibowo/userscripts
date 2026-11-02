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

  const openPanelForCard = async pixiv => {
    const card = document.querySelector('#card-marker');
    const vueProps = { id: '16112932', userId: '1111', tags: [] };
    card.__vue__ = { _props: { item: vueProps } };

    const imageListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-ga4-label="thumbnail"')
    );
    await pixiv.fireListener(imageListener, card);
    await flush(4);

    card.querySelector('.pixiv_utils_edit_bookmark').click();
    await flush(6);

    return document.querySelector('.pixiv-utils-edit-bookmark-panel');
  };

  const checkboxOf = (panel, tag) => [...panel.querySelectorAll('.pixiv-utils-edit-bookmark-tag input[type="checkbox"]')]
    .find(cb => cb.value === tag);

  const callsMatching = (fetchMock, fragment) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment)).length;

  it('retries a transiently failing save operation until it succeeds', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    let removeTagsCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      if (urlStr.includes('remove_tags')) {
        removeTagsCalls += 1;
        if (removeTagsCalls < 3) return { ok: false };
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    // Uncheck the assigned tag so saving issues a remove_tags request.
    checkboxOf(panel, 'foo').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(8);

    // The removal failed twice, then succeeded on the third attempt.
    expect(removeTagsCalls).toBe(3);
    expect(document.querySelector('.pixiv-utils-alert:not(.pixiv-utils-edit-bookmark-panel)')).toBeNull();
    expect(panel.open).toBe(false);
    expect(document.querySelector('.pixiv-utils-toast')).not.toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('refreshes the panel and reports a partial save when a later operation fails', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Server-side state: removing "foo" commits, but adding "bar" never works.
    let serverTags = ['foo'];
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }, { tag: 'bar', cnt: 1 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => serverTags.map(tag => `<input name="tag" value="${tag}">`).join('') };
      }
      if (urlStr.includes('remove_tags')) {
        serverTags = serverTags.filter(tag => tag !== 'foo');
        return { ok: true, json: async () => ({}) };
      }
      if (urlStr.includes('add_tags')) return { ok: false };
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    // Remove "foo" and add "bar": the removal commits, the addition fails.
    checkboxOf(panel, 'foo').click();
    checkboxOf(panel, 'bar').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    // The failed addition was retried to exhaustion.
    expect(callsMatching(fetchMock, 'add_tags')).toBe(4);

    // Caches were invalidated, so the refreshed state was refetched.
    expect(callsMatching(fetchMock, 'bookmarkData')).toBe(2);

    // The dialog stays open and reports the partial failure distinctly.
    expect(panel.open).toBe(true);
    const alert = document.querySelector('.pixiv-utils-alert:not(.pixiv-utils-edit-bookmark-panel)');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('partially updated');
    expect(document.querySelector('.pixiv-utils-toast')).toBeNull();

    // The UI now reflects the server state: the committed removal is unchecked.
    expect(checkboxOf(panel, 'foo').checked).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('reports a complete failure without refreshing when nothing was committed', async () => {
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
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      if (urlStr.includes('remove_tags')) return { ok: false };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    checkboxOf(panel, 'foo').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    // The removal was retried to exhaustion and nothing was committed.
    expect(callsMatching(fetchMock, 'remove_tags')).toBe(4);
    expect(callsMatching(fetchMock, 'bookmarkData')).toBe(1);

    // The failure is reported as complete, not partial, and the panel stays open.
    const alert = document.querySelector('.pixiv-utils-alert:not(.pixiv-utils-edit-bookmark-panel)');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Failed to update bookmark');
    expect(alert.textContent).not.toContain('partially updated');
    expect(panel.open).toBe(true);
    expect(document.querySelector('.pixiv-utils-toast')).toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('retries transient failures when loading bookmark state', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    let dataCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        dataCalls += 1;
        if (dataCalls < 3) return { ok: false };
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    // The state read failed twice, then succeeded on the third attempt.
    expect(dataCalls).toBe(3);
    expect(panel.querySelector('.pixiv-utils-alert-ok').disabled).toBe(false);
    expect(document.querySelector('.pixiv-utils-alert:not(.pixiv-utils-edit-bookmark-panel)')).toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('shows a loading indicator on the save button while saving', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Hold the save request in flight so the loading state is observable.
    let resolveSave;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      if (urlStr.includes('remove_tags')) {
        return new Promise(resolve => { resolveSave = resolve; });
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);

    const applyButton = panel.querySelector('.pixiv-utils-alert-ok');
    const label = applyButton.querySelector('.pixiv-utils-edit-bookmark-apply-label');
    const spinner = applyButton.querySelector('.pixiv-utils-edit-bookmark-spinner');
    expect(label.textContent).toBe('Save');
    expect(spinner).not.toBeNull();
    expect(applyButton.classList.contains('is-loading')).toBe(false);

    // Uncheck the assigned tag so saving issues a remove_tags request.
    checkboxOf(panel, 'foo').click();
    await flush(2);

    applyButton.click();
    await flush(4);

    // While saving, the button carries the loading state (the label keeps its
    // space via CSS visibility, so the button never shrinks).
    expect(applyButton.classList.contains('is-loading')).toBe(true);
    expect(applyButton.disabled).toBe(true);

    resolveSave({ ok: true, json: async () => ({}) });
    await flush(6);

    // After saving, the loading state is cleared and the dialog closed.
    expect(applyButton.classList.contains('is-loading')).toBe(false);
    expect(label.textContent).toBe('Save');
    expect(panel.open).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('shows the loading spinner in the status area while fetching tags on first open', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Hold the tag list request in flight so the loading state is observable.
    let resolveTags;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return new Promise(resolve => { resolveTags = resolve; });
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
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
    await flush(4);

    card.querySelector('.pixiv_utils_edit_bookmark').click();
    await flush(2);

    const panel = document.querySelector('.pixiv-utils-edit-bookmark-panel');
    const status = panel.querySelector('.pixiv-utils-edit-bookmark-status');
    expect(status.classList.contains('is-loading')).toBe(true);
    expect(status.textContent).toBe('');
    expect(status.querySelector('.pixiv-utils-edit-bookmark-spinner')).not.toBeNull();

    resolveTags({ ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) });
    await flush(8);

    expect(status.classList.contains('is-loading')).toBe(false);
    expect(panel.querySelector('.pixiv-utils-edit-bookmark-tag')).not.toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });

  it('shows a loading spinner on the refresh button while refreshing', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    let resolveTags;
    let tagsCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        tagsCalls += 1;
        if (tagsCalls === 1) {
          return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
        }
        return new Promise(resolve => { resolveTags = resolve; });
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    const refreshButton = panel.querySelector('.pixiv-utils-reload-button');
    expect(refreshButton.querySelector('.pixiv-utils-reload-button-label').textContent).toBe('Refresh');
    expect(refreshButton.querySelector('.pixiv-utils-edit-bookmark-spinner')).not.toBeNull();
    expect(refreshButton.classList.contains('is-loading')).toBe(false);

    refreshButton.click();
    await flush(2);

    expect(refreshButton.classList.contains('is-loading')).toBe(true);
    expect(refreshButton.disabled).toBe(true);
    // The button spinner replaces the former loading toast.
    expect(document.querySelector('.pixiv-utils-toast')).toBeNull();

    resolveTags({ ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) });
    await flush(8);

    expect(refreshButton.classList.contains('is-loading')).toBe(false);
    expect(refreshButton.disabled).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('disables and styles the refresh and save buttons while fetching bookmark data', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Hold the tag list request in flight so the disabled state is observable.
    let resolveTags;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return new Promise(resolve => { resolveTags = resolve; });
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    const refreshButton = panel.querySelector('.pixiv-utils-reload-button');
    const applyButton = panel.querySelector('.pixiv-utils-edit-bookmark-apply');
    expect(refreshButton.disabled).toBe(true);
    expect(applyButton.disabled).toBe(true);

    // gmConfig-style disabled treatment, mirroring the settings panel buttons.
    const css = pixiv.styles.join('\n');
    expect(css).toContain('.pixiv-utils-edit-bookmark-panel .pixiv-utils-reload-button:disabled');
    expect(css).toContain('.pixiv-utils-edit-bookmark-panel .pixiv-utils-edit-bookmark-apply:disabled');
    expect(css).toContain('cursor: not-allowed');
    expect(css).toContain('.pixiv-utils-reload-button:hover:not(:disabled)');
    expect(css).toContain('.pixiv-utils-alert button:hover:not(:disabled)');
    expect(css).toContain('.pixiv-utils-alert-ok:hover:not(:disabled)');

    resolveTags({ ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) });
    await flush(8);

    expect(refreshButton.disabled).toBe(false);
    expect(applyButton.disabled).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('shows the reload button spinner while fetching bookmark state after the tags load', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Tags resolve immediately; the bookmark data request stays in flight.
    let resolveData;
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return new Promise(resolve => { resolveData = resolve; });
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();
    await flush(2);

    // Tags are rendered but inert while the bookmark state is still loading.
    const status = panel.querySelector('.pixiv-utils-edit-bookmark-status');
    const refreshButton = panel.querySelector('.pixiv-utils-reload-button');
    const checkbox = panel.querySelector('.pixiv-utils-edit-bookmark-tag input[type="checkbox"]');
    expect(status.classList.contains('is-loading')).toBe(false);
    expect(checkbox).not.toBeNull();
    expect(checkbox.disabled).toBe(true);
    expect(refreshButton.classList.contains('is-loading')).toBe(true);

    resolveData({ ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: null } }) });
    await flush(8);

    expect(refreshButton.classList.contains('is-loading')).toBe(false);
    expect(refreshButton.disabled).toBe(false);
    expect(panel.querySelector('.pixiv-utils-edit-bookmark-apply').disabled).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('bypasses the browser cache on every bookmark API request', async () => {
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
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => '<input name="tag" value="foo">' };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    // First open exercises the three cacheable GET routes: the tag list,
    // bookmarkData, and the bookmark_add.php page.
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);
    expect(callsMatching(fetchMock, 'bookmarkData')).toBe(1);
    expect(callsMatching(fetchMock, 'bookmark_add.php')).toBe(1);

    // Saving issues POST mutations through the same helper.
    checkboxOf(panel, 'foo').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(8);

    expect(callsMatching(fetchMock, 'bookmarks/remove_tags')).toBe(1);

    for (const [url, init] of fetchMock.mock.calls) {
      expect(init?.cache, String(url)).toBe('no-store');
    }
    expect(document.querySelector('.pixiv-utils-toast')).not.toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });
});
