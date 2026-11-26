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

    await pixiv.observeImageCard(card);
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

    await pixiv.observeImageCard(card);
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

    await pixiv.observeImageCard(card);
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

    await pixiv.observeImageCard(card);
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

    await pixiv.observeImageCard(card);
    await flush(4);

    card.querySelector('.pixiv_utils_edit_bookmark').click();
    await flush(6);

    return document.querySelector('.pixiv-utils-edit-bookmark-panel');
  };

  const checkboxOf = (panel, tag) => [...panel.querySelectorAll('.pixiv-utils-edit-bookmark-tag input[type="checkbox"]')]
    .find(cb => cb.value === tag);

  /** The tag list a panel renders, as `{ tag: count }`. */
  const tagCountsOf = panel => {
    const counts = {};
    for (const label of panel.querySelectorAll('.pixiv-utils-edit-bookmark-tag')) {
      const tag = label.querySelector('span')?.textContent?.replace(/^#/, '');
      const count = label.querySelector('.pixiv-utils-edit-bookmark-tag-count')?.textContent;
      counts[tag] = Number(count);
    }
    return counts;
  };

  /** Create a tag through the panel's own "create tag" flow. */
  const createTagInPanel = (panel, name) => {
    panel.querySelector('.pixiv-utils-edit-bookmark-create-link').click();
    panel.querySelector('.pixiv-utils-edit-bookmark-create textarea').value = name;
    const save = [...panel.querySelectorAll('.pixiv-utils-edit-bookmark-create button')]
      .find(button => button.textContent === 'Save');
    save.click();
  };

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

    await pixiv.observeImageCard(card);
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

  it('keeps the cached tag list after a save and moves the counts of the changed tags', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

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
      if (urlStr.includes('add_tags')) {
        serverTags = [...serverTags, 'bar'];
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();
    expect(tagCountsOf(panel)).toEqual({ foo: 2, bar: 1 });

    // Remove "foo" and add "bar".
    checkboxOf(panel, 'foo').click();
    checkboxOf(panel, 'bar').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    // The tag list was not refetched: the save only adjusts the cached counts.
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);

    // Reopening the panel reads the cached list with the adjusted counts.
    const reopened = await openPanelForCard(pixiv);
    expect(reopened).not.toBeNull();
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);
    expect(tagCountsOf(reopened)).toEqual({ bar: 2, foo: 1 });
    expect(pixiv.console.error).toEqual([]);
  });

  it('creates a cache entry for a tag created in the panel, with a count of one', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    let serverTags = ['foo'];
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 2 }] } } }) };
      }
      if (urlStr.includes('bookmarkData')) {
        return { ok: true, json: async () => ({ body: { isBookmarkable: true, bookmarkData: { id: 'bm-1' } } }) };
      }
      if (urlStr.includes('bookmark_add.php')) {
        return { ok: true, text: async () => serverTags.map(tag => `<input name="tag" value="${tag}">`).join('') };
      }
      if (urlStr.includes('add_tags')) {
        serverTags = [...serverTags, 'fresh'];
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    createTagInPanel(panel, 'fresh');
    await flush(2);
    expect(checkboxOf(panel, 'fresh').checked).toBe(true);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    // The new tag is not refetched from the server; it enters the cache with
    // the one item it was saved to.
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);

    const reopened = await openPanelForCard(pixiv);
    expect(reopened).not.toBeNull();
    expect(tagCountsOf(reopened)).toEqual({ foo: 2, fresh: 1 });
    expect(pixiv.console.error).toEqual([]);
  });

  it('drops a tag from the cache when its last item is removed', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    let serverTags = ['foo'];
    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('bookmark/tags')) {
        return { ok: true, json: async () => ({ body: { tags: { public: [{ tag: 'foo', cnt: 1 }] } } }) };
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
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();
    expect(tagCountsOf(panel)).toEqual({ foo: 1 });

    // Unassign the only item of the only tag.
    checkboxOf(panel, 'foo').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    const reopened = await openPanelForCard(pixiv);
    expect(reopened).not.toBeNull();
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);
    expect(tagCountsOf(reopened)).toEqual({});
    expect(pixiv.console.error).toEqual([]);
  });

  it('adjusts the counts of the operations that succeeded when a later one fails', async () => {
    if (!('showModal' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!('close' in HTMLDialogElement.prototype)) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // Removing "foo" commits; adding "bar" never succeeds.
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

    checkboxOf(panel, 'foo').click();
    checkboxOf(panel, 'bar').click();
    await flush(2);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    // The tag list is not refetched after the partial save either.
    expect(callsMatching(fetchMock, 'bookmark/tags')).toBe(1);

    // Only the committed removal moved the counts: "foo" lost one item, "bar"
    // did not gain one.
    expect(tagCountsOf(panel)).toEqual({ foo: 1, bar: 1 });
    expect(pixiv.console.error).toEqual([]);
  });

  it('renders the privacy options as a segmented radio control', async () => {
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
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    const container = panel.querySelector('.pixiv-utils-edit-bookmark-privacy');
    expect(container).not.toBeNull();
    const group = container.querySelector('.pixiv-utils-edit-bookmark-segment-group');
    expect(group).not.toBeNull();
    // The group is the container's only child, so it fills the container width.
    expect([...container.children]).toEqual([group]);

    const segments = [...group.querySelectorAll('.pixiv-utils-edit-bookmark-segment')];
    expect(segments).toHaveLength(2);

    const radios = [...group.querySelectorAll('input[type="radio"]')];
    expect(radios.map(radio => radio.value)).toEqual(['public', 'private']);
    // One radio group: the shared name keeps form value binding and native
    // arrow-key navigation between the segments.
    expect(new Set(radios.map(radio => radio.name)).size).toBe(1);
    // Each option is a label segment wrapping its own radio input.
    expect(radios[0].closest('label')).toBe(segments[0]);
    expect(radios[1].closest('label')).toBe(segments[1]);
    // Loaded state: enabled, public selected.
    expect(radios[0].disabled).toBe(false);
    expect(radios[1].disabled).toBe(false);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);

    // The group styles as two equal halves filling its parent.
    const css = pixiv.styles.join('\n');
    const groupRule = css.match(/\.pixiv-utils-edit-bookmark-segment-group \{[^}]*\}/)?.[0] ?? '';
    expect(groupRule).toContain('grid-template-columns: 1fr 1fr');
    expect(groupRule).toContain('width: 100%');

    // Selecting the other segment deselects the previous one.
    segments[1].click();
    expect(radios[1].checked).toBe(true);
    expect(radios[0].checked).toBe(false);

    segments[0].click();
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('submits the selected privacy segment as the bookmark restrict value', async () => {
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
        return { ok: true, text: async () => '<input name="tag" value="foo"><input name="restrict" value="0" checked>' };
      }
      if (urlStr.includes('edit_restrict')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    // The bookmark loaded as public; switch the segmented control to Private.
    const privateRadio = [...panel.querySelectorAll('.pixiv-utils-edit-bookmark-segment input[type="radio"]')]
      .find(radio => radio.value === 'private');
    privateRadio.click();
    await flush(2);
    expect(privateRadio.checked).toBe(true);

    panel.querySelector('.pixiv-utils-alert-ok').click();
    await flush(10);

    const restrictCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('edit_restrict'));
    expect(restrictCalls).toHaveLength(1);
    expect(JSON.parse(restrictCalls[0][1].body)).toEqual({
      bookmarkIds: ['bm-1'],
      bookmarkRestrict: 'private'
    });
    expect(panel.open).toBe(false);
    expect(pixiv.console.error).toEqual([]);
  });

  it('styles form controls and backup buttons without native browser styling', async () => {
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
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    const css = pixiv.styles.join('\n');

    // Backup buttons carry the shared button box instead of native styling.
    const backupRule = css.match(/\.gc-p \.pixiv-utils-backup-buttons button \{[^}]*\}/)?.[0] ?? '';
    expect(backupRule).toContain('min-height: 36px');
    expect(backupRule).toContain('appearance: none');
    expect(backupRule).toContain('border: 1px solid');
    expect(css).toContain('.gc-p .pixiv-utils-backup-buttons button:hover');

    // Text fields and selects share the button height, not native heights.
    expect(css).toContain('select) {\n    min-height: 36px;');
    expect(css).toContain('select) {\n      min-height: 44px;');
    expect(css).toContain('.gc-p :is(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="color"]), select) {\n    appearance: none;');

    // Custom checkbox and radio rendering replaces the native controls.
    const checkboxRule = css.match(/\.pixiv-utils-alert input\[type="checkbox"\],[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(checkboxRule).toContain('width: 18px');
    expect(checkboxRule).toContain('appearance: none');
    expect(css).toContain('.gc-p input[type="radio"]');

    // Selects get a custom chevron instead of the native arrow.
    expect(css).toContain('data:image/svg+xml');

    // The create-tag textarea matches the shared control heights.
    const createTextareaRule = css.match(/\.pixiv-utils-edit-bookmark-create textarea \{[^}]*\}/)?.[0] ?? '';
    expect(createTextareaRule).toContain('min-height: 36px');
    expect(createTextareaRule).toContain('box-sizing: border-box');
    expect(pixiv.console.error).toEqual([]);
  });

  it('pads the status row only while it shows a message or spinner', async () => {
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
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const panel = await openPanelForCard(pixiv);
    expect(panel).not.toBeNull();

    const css = pixiv.styles.join('\n');

    // Exactly one base status rule, so its padding cannot be split across
    // duplicates again.
    expect((css.match(/\.pixiv-utils-edit-bookmark-status \{/g) || [])).toHaveLength(1);

    // The base row keeps only horizontal padding: the shorthand's first value
    // (top) stays 0.
    const statusRule = css.match(/\.pixiv-utils-edit-bookmark-status \{[^}]*\}/)?.[0] ?? '';
    expect(statusRule).toContain('padding: 0 16px');
    expect(statusRule).not.toContain('8px');

    // The top gap appears only with a visible message or the loading spinner.
    expect(css).toContain('.pixiv-utils-edit-bookmark-status.is-loading,\n  .pixiv-utils-edit-bookmark-status:has(.pixiv-utils-edit-bookmark-status-message:not(:empty)) {\n    padding-top: 8px;');
    expect(pixiv.console.error).toEqual([]);
  });

  it('styles both modal dialogs with an entry fade that honors reduced motion', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const css = pixiv.styles.join('\n');

    // The edit-bookmark panel and the settings dialog fade in with the same
    // duration the toast stack uses (interpolated from the shared constant).
    expect(css).toContain('dialog.pixiv-utils-alert.pixiv-utils-edit-bookmark-panel,\n  dialog.gc-p {\n    transition: opacity 180ms ease;');
    expect(css).toContain('transition: opacity 180ms ease, translate 180ms ease;');

    // Entry fades start from transparent on first open.
    expect(css).toContain('@starting-style');
    expect(css).toContain('dialog.pixiv-utils-alert.pixiv-utils-edit-bookmark-panel[open],\n    dialog.gc-p[open] {\n      opacity: 0;');
    expect(css).toContain('dialog.pixiv-utils-alert.pixiv-utils-edit-bookmark-panel[open]::backdrop,\n    dialog.gc-p[open]::backdrop {\n      opacity: 0;');

    // No exit animation: no :not([open]) opacity rules and no allow-discrete
    // display/overlay hold that would delay teardown after close.
    expect(css).not.toContain(':not([open])');
    expect(css).not.toContain('allow-discrete');

    // Reduced motion disables every dialog transition.
    expect(css).toContain('dialog.pixiv-utils-alert.pixiv-utils-edit-bookmark-panel,\n    dialog.gc-p,\n    dialog.pixiv-utils-alert.pixiv-utils-edit-bookmark-panel::backdrop,\n    dialog.gc-p::backdrop {\n      transition: none;');
    expect(pixiv.console.error).toEqual([]);
  });
});
