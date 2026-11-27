import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PREBUILT_KEY,
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

// jsdom's requestAnimationFrame may be absent or never fire under vitest; the
// settings panel enhancements rely on it for scroll restoration, so install a
// deterministic timer-based implementation.
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 16);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

// jsdom lacks native <dialog> methods the userscript's prompt machinery uses.
if (!('showModal' in HTMLDialogElement.prototype)) {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
}
if (!('close' in HTMLDialogElement.prototype)) {
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}

// Tab order matches settingsTab()/makeSettingsDefinitions().
const TAB_NAMES = ['General', 'Bookmarks', 'Filtering', 'Users', 'Highlights', 'Tooltips', 'UTags', 'Advanced'];
const LIST_LABELS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

/**
 * Minimal gmConfig stand-in.
 *
 * Renders the structure the userscript's enhancements target (form > .gc-b
 * containing .gc-tb plus content, and a footer with a Save button) and switches
 * the active tab on click the way the real library does.
 */
const createFakeGmConfig = () => {
  const instances = [];

  class FakeGmConfig {
    constructor () {
      this.isOpen = false;
      this._options = {};
      this._fields = {};
      this._dlg = document.createElement('dialog');
      this._dlg.className = 'gc-p';
      this._form = document.createElement('form');
      this._footer = document.createElement('div');
      this._footer.className = 'gc-f';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'gc-bp';
      save.textContent = 'Save';
      this._footer.appendChild(save);
      this._dlg.appendChild(this._form);
      this._form.appendChild(this._footer);
      this._renderBody(0);
      instances.push(this);
    }

    _renderBody (activeIndex) {
      const body = document.createElement('div');
      body.className = 'gc-b';
      const tabs = document.createElement('div');
      tabs.className = 'gc-tb';
      TAB_NAMES.forEach((name, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = name;
        if (index === activeIndex) button.setAttribute('aria-selected', 'true');
        button.addEventListener('click', () => this._activateTab(index));
        tabs.appendChild(button);
      });
      const content = document.createElement('div');
      content.className = 'gc-bd';
      content.innerHTML = `<div style="height: 2000px">${TAB_NAMES[activeIndex]} content</div>`;
      const list = document.createElement('div');
      list.className = 'gc-list';
      const items = document.createElement('div');
      items.className = 'gc-list-items';
      for (const label of LIST_LABELS) {
        const item = document.createElement('div');
        item.className = 'gc-li';
        item.dataset.label = label;
        const head = document.createElement('div');
        head.className = 'gc-li-h';
        const title = document.createElement('span');
        title.className = 'gc-li-t';
        title.textContent = label;
        head.append(title);
        for (const [glyph, move] of [
          ['↑', () => {
            const previous = item.previousElementSibling;
            if (previous) items.insertBefore(item, previous);
          }],
          ['↓', () => {
            const next = item.nextElementSibling;
            if (next) items.insertBefore(next, item);
          }]
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'gc-ib';
          button.textContent = glyph;
          button.addEventListener('click', move);
          head.append(button);
        }
        item.append(head);
        items.append(item);
      }
      list.append(items);
      content.append(list);
      body.append(tabs, content);
      this._body = body;
      this._tabs = tabs;
      this._content = content;
      this._form.insertBefore(body, this._footer);
    }

    async init (definitions, options) {
      this._options = options;
      this._fields = {};
      for (const [key, definition] of Object.entries(definitions)) {
        this._fields[key] = { value: definition.default, definition };
      }
      await this._load();
      const reload = options.footerContent?.();
      if (reload) this._footer.appendChild(reload);
    }

    _vals () {
      return Object.fromEntries(Object.entries(this._fields).map(([key, field]) => [key, field.value]));
    }

    _mark () {}

    _json () {
      return '';
    }

    async open () {
      this.isOpen = true;
      this._base = JSON.stringify(this._vals());
      document.body.appendChild(this._dlg);
      this._options.onOpen?.();
    }

    _dirty () {
      return JSON.stringify(this._vals()) !== this._base;
    }

    close (save = false) {
      if (!this.isOpen) return;
      if (!save && this._dirty()) this._options.onBeforeClose?.(this._vals());
      this.isOpen = false;
      this._dlg.remove();
      this._options.onClose?.(save);
    }

    async reinit (definitions, title) {
      const activeIndex = [...this._tabs.children]
        .findIndex(button => button.getAttribute('aria-selected') === 'true');
      this._body.remove();
      this._renderBody(activeIndex < 0 ? 0 : activeIndex);
    }

    _activateTab (index) {
      [...this._tabs.children].forEach((button, i) => {
        if (i === index) button.setAttribute('aria-selected', 'true');
        else button.removeAttribute('aria-selected');
      });
      this._content.innerHTML = `<div style="height: 2000px">${TAB_NAMES[index]} content</div>`;
      this._body.scrollTop = 0;
    }
  }

  return { FakeGmConfig, instances };
};

const openSettings = async pixiv => {
  const commands = pixiv.menuCommands.filter(entry => /Settings|設定|设置/.test(entry.label));
  expect(commands).toHaveLength(1);
  await commands[0].onClick();
};

const panelParts = () => {
  const dlg = document.querySelector('dialog.gc-p');
  const tabs = dlg.querySelector(':scope > form > .gc-tb');
  const body = dlg.querySelector(':scope > form > .gc-b');
  return { dlg, tabs, body, buttons: () => [...tabs.children] };
};

const activeTabIndex = parts => parts.buttons()
  .findIndex(button => button.getAttribute('aria-selected') === 'true');

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const settleFrames = async (frames = 3) => {
  for (let index = 0; index < frames; index += 1) await nextFrame();
  await flush(1);
};

describe('settings panel session view memory', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    cleanupPixivUtils();
  });

  it('opens on the first tab without scroll by default', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    const parts = panelParts();

    expect(activeTabIndex(parts)).toBe(0);
    expect(parts.body.scrollTop).toBe(0);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('restores the active tab and its scroll position when reopened', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    let parts = panelParts();

    // Visit Highlights (index 4) and scroll its body.
    parts.buttons()[4].click();
    await settleFrames();
    parts.body.scrollTop = 320;
    parts.body.dispatchEvent(new Event('scroll'));
    expect(activeTabIndex(parts)).toBe(4);

    instances.at(-1).close();
    expect(document.querySelector('dialog.gc-p')).toBeNull();

    await openSettings(pixiv);
    parts = panelParts();
    await settleFrames();
    expect(activeTabIndex(parts)).toBe(4);
    expect(parts.body.scrollTop).toBe(320);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('restores the scroll position of an unswitched tab when reopened', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    let parts = panelParts();

    parts.body.scrollTop = 150;
    parts.body.dispatchEvent(new Event('scroll'));

    instances.at(-1).close();
    await openSettings(pixiv);
    parts = panelParts();
    await settleFrames();
    expect(activeTabIndex(parts)).toBe(0);
    expect(parts.body.scrollTop).toBe(150);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('keeps every tab scroll offset across reopen and tab switches', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    let parts = panelParts();

    // Scroll General (index 0), switch to Filtering (index 2), scroll it too.
    parts.body.scrollTop = 50;
    parts.body.dispatchEvent(new Event('scroll'));
    parts.buttons()[2].click();
    await settleFrames();
    parts.body.scrollTop = 100;
    parts.body.dispatchEvent(new Event('scroll'));
    expect(activeTabIndex(parts)).toBe(2);

    instances.at(-1).close();
    await openSettings(pixiv);
    parts = panelParts();
    await settleFrames();
    expect(activeTabIndex(parts)).toBe(2);
    expect(parts.body.scrollTop).toBe(100);

    // Switching back to General restores its pre-close offset, not zero.
    parts.buttons()[0].click();
    await settleFrames();
    expect(activeTabIndex(parts)).toBe(0);
    expect(parts.body.scrollTop).toBe(50);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('keeps the remembered view across a language-triggered reinit', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    let parts = panelParts();

    parts.buttons()[3].click();
    await settleFrames();
    parts.body.scrollTop = 80;
    parts.body.dispatchEvent(new Event('scroll'));
    expect(activeTabIndex(parts)).toBe(3);

    // onChange('SETTINGS_LANGUAGE', ...) reinitializes the panel content.
    instances.at(-1)._options.onChange('SETTINGS_LANGUAGE', 'ja');
    await flush(2);
    await settleFrames();
    parts = panelParts();
    expect(activeTabIndex(parts)).toBe(3);
    expect(parts.body.scrollTop).toBe(80);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('saves one-selector-per-line input as an array of strings', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    const instance = instances.at(-1);

    // Fresh installs store nothing; the selector textarea starts empty.
    expect(instance._fields.SELECTORS_TAG_BUTTON.value).toBe('');

    instance._fields.SELECTORS_TAG_BUTTON.value = 'div.custom-a\ndiv.custom-b';
    await instance.save();

    expect(pixiv.storage.values.get('SELECTORS_TAG_BUTTON')).toEqual(['div.custom-a', 'div.custom-b']);
    const cached = pixiv.storage.values.get(PREBUILT_KEY);
    expect(cached).toBeTruthy();
    expect(cached.selectors).not.toHaveProperty('SELECTORS_TAG_BUTTON');
    expect(cached.selectors.SELECTORS_IMAGE).toBeTruthy();
    expect(cached.selectors._SELECTORS_IMAGE_GATE).toEqual(expect.any(Object));
    expect(cached.selectors._SECTIONS_TOGGLE_BOOKMARKED_GATE).toEqual(expect.any(Object));
    expect(pixiv.console.error).toEqual([]);
  });

  it('leaves the selector cache intact when only a non-selector setting changes', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const before = JSON.parse(JSON.stringify(pixiv.storage.values.get(PREBUILT_KEY)));
    await openSettings(pixiv);
    const instance = instances.at(-1);
    instance._fields.SETTINGS_LANGUAGE.value = 'ja';
    await instance.save();

    expect(pixiv.storage.values.get(PREBUILT_KEY)).toEqual(before);
  });

  it('invalidates only the image selector and its gate group when it changes', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    const before = pixiv.storage.values.get(PREBUILT_KEY);
    const artistGate = before.selectors._SELECTORS_IMAGE_GATE.artist;
    const sectionGate = before.selectors._SECTIONS_TOGGLE_BOOKMARKED_GATE;
    await openSettings(pixiv);
    const instance = instances.at(-1);
    instance._fields.SELECTORS_IMAGE.value = 'div.custom-image';
    await instance.save();

    const cached = pixiv.storage.values.get(PREBUILT_KEY);
    expect(cached).not.toBeNull();
    expect(cached.selectors).not.toHaveProperty('SELECTORS_IMAGE');
    expect(cached.selectors._SELECTORS_IMAGE_GATE.image).toBeUndefined();
    expect(cached.selectors._SELECTORS_IMAGE_GATE.artist).toEqual(artistGate);
    expect(cached.selectors._SECTIONS_TOGGLE_BOOKMARKED_GATE).toEqual(sectionGate);
    expect(cached.selectors.SELECTORS_TAG_BUTTON).toBeTruthy();
  });

  it('places the image-artist and clickable-username switches above the blocked-users list', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    const { _fields } = instances.at(-1);

    expect(_fields.ADD_IMAGE_ARTIST.definition).toMatchObject({
      tab: 'Users', type: 'checkbox', default: true
    });
    expect(_fields.LINK_COMMENT_USERNAMES.definition).toMatchObject({
      tab: 'Users', type: 'checkbox', default: true
    });

    // Definition order is the rendered order within the Users tab.
    const order = Object.keys(_fields);
    expect(order.indexOf('ADD_IMAGE_ARTIST')).toBeLessThan(order.indexOf('LINK_COMMENT_USERNAMES'));
    expect(order.indexOf('LINK_COMMENT_USERNAMES')).toBeLessThan(order.indexOf('PIXIV_BLOCKED_USERS'));

    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  const stubListLayout = (body, itemsContainer) => {
    const bodyTop = 100;
    const bodyBottom = 200;
    const listTop = 150;
    const itemHeight = 40;
    body.getBoundingClientRect = () => ({
      top: bodyTop,
      bottom: bodyBottom,
      height: bodyBottom - bodyTop,
      left: 0,
      right: 300,
      width: 300
    });
    for (const item of itemsContainer.children) {
      item.getBoundingClientRect = () => {
        const index = [...itemsContainer.children].indexOf(item);
        const top = listTop + index * itemHeight - body.scrollTop;
        return {
          top,
          bottom: top + itemHeight,
          height: itemHeight,
          left: 0,
          right: 300,
          width: 300
        };
      };
    }
  };

  const setupOrderedList = async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;

    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    await openSettings(pixiv);
    const parts = panelParts();
    const itemsContainer = parts.body.querySelector('.gc-list-items');
    const items = [...itemsContainer.children];
    expect(items).toHaveLength(LIST_LABELS.length);
    stubListLayout(parts.body, itemsContainer);
    const controlFor = item => item.querySelector('.pixiv-utils-list-position');
    return { pixiv, instances, parts, itemsContainer, items, controlFor };
  };

  it('follows a list item moved out of view and remembers the new scroll offset', async () => {
    const { pixiv, instances, parts, itemsContainer, items, controlFor } = await setupOrderedList();
    const moved = items[0];

    parts.body.scrollTop = 0;
    parts.body.dispatchEvent(new Event('scroll'));

    // A one-step move (number spinner or arrow key equivalent) nudges the
    // scrollport to uncover the item but gets no highlight, just like the
    // list's own ↑/↓ buttons.
    controlFor(moved).value = '2';
    controlFor(moved).dispatchEvent(new Event('change'));
    expect(parts.body.scrollTop).toBe(38);
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(false);

    // Moving it out of view below scrolls further and gets the outline.
    controlFor(moved).value = '6';
    controlFor(moved).dispatchEvent(new Event('change'));
    expect([...itemsContainer.children][5]).toBe(moved);
    const revealed = 150 + 5 * 40 + 40 - 200 + 8;
    expect(parts.body.scrollTop).toBe(revealed);

    // The moved item gets the focus-like outline until the next click.
    expect(pixiv.styles.join('\n')).toContain('.gc-p .gc-li.pixiv-utils-moved-highlight {');
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(false);

    // No manual scroll event after the move: reopening still restores the
    // auto-scrolled offset for this tab.
    instances.at(-1).close();
    await openSettings(pixiv);
    await settleFrames();
    expect(document.querySelector('.gc-b').scrollTop).toBe(revealed);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('reveals an item moved by the list arrow buttons without a highlight', async () => {
    const { pixiv, instances, parts, itemsContainer, items } = await setupOrderedList();
    const moved = items[1];

    // Item 1 starts fully visible; one ↑ step leaves only its top edge hidden.
    parts.body.scrollTop = 60;
    parts.body.dispatchEvent(new Event('scroll'));
    const arrowUp = moved.querySelector('.gc-li-h > .gc-ib');
    expect(arrowUp.textContent).toBe('↑');

    arrowUp.click();
    await flush(1); // MutationObserver callback
    expect([...itemsContainer.children][0]).toBe(moved);
    const revealed = 150 - 100 - 8;
    expect(parts.body.scrollTop).toBe(revealed);
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(false);

    instances.at(-1).close();
    await openSettings(pixiv);
    await settleFrames();
    expect(document.querySelector('.gc-b').scrollTop).toBe(revealed);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('scrolls back up when a list item moves above the visible area', async () => {
    const { pixiv, instances, parts, itemsContainer, items, controlFor } = await setupOrderedList();
    const moved = items[5];

    parts.body.scrollTop = 100;
    parts.body.dispatchEvent(new Event('scroll'));

    controlFor(moved).value = '1';
    controlFor(moved).dispatchEvent(new Event('change'));
    expect([...itemsContainer.children][0]).toBe(moved);
    const revealed = 150 - 100 - 8;
    expect(parts.body.scrollTop).toBe(revealed);
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(true);

    // Closing without any click also clears the highlight and its listener.
    instances.at(-1).close();
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(false);
    await openSettings(pixiv);
    await settleFrames();
    expect(document.querySelector('.gc-b').scrollTop).toBe(revealed);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('highlights a multi-step index move even when both positions are visible', async () => {
    const { pixiv, instances, parts, itemsContainer, items, controlFor } = await setupOrderedList();
    const moved = items[0];

    // Widen the simulated scrollport so both the old and new slots are fully
    // visible: this move must highlight without changing the scroll offset.
    parts.body.getBoundingClientRect = () => ({
      top: 100,
      bottom: 300,
      height: 200,
      left: 0,
      right: 300,
      width: 300
    });
    parts.body.scrollTop = 0;
    parts.body.dispatchEvent(new Event('scroll'));

    controlFor(moved).value = '3';
    controlFor(moved).dispatchEvent(new Event('change'));
    expect([...itemsContainer.children][2]).toBe(moved);
    expect(parts.body.scrollTop).toBe(0);
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(moved.classList.contains('pixiv-utils-moved-highlight')).toBe(false);
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('clamps zero and negative index values to the first slot', async () => {
    const { pixiv, instances, itemsContainer, items, controlFor } = await setupOrderedList();
    const moved = items[4];

    for (const shorthand of ['0', '-3', '-999999999999999999999']) {
      controlFor(moved).value = shorthand;
      controlFor(moved).dispatchEvent(new Event('change'));
      expect([...itemsContainer.children][0]).toBe(moved);
      expect(controlFor(moved).value).toBe('1');
    }
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('clamps oversized index values to the last slot', async () => {
    const { pixiv, instances, itemsContainer, items, controlFor } = await setupOrderedList();
    const moved = items[1];

    for (const shorthand of [String(LIST_LABELS.length + 1), '999999999999999999999']) {
      controlFor(moved).value = shorthand;
      controlFor(moved).dispatchEvent(new Event('change'));
      expect([...itemsContainer.children][LIST_LABELS.length - 1]).toBe(moved);
      expect(controlFor(moved).value).toBe(String(LIST_LABELS.length));
    }
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('keeps unsaved edits across dismissal and only persists them on save', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', SELECTORS_TAG_BUTTON: ['div.foo'] }
    });

    await openSettings(pixiv);
    const first = instances.at(-1);
    first._fields.SELECTORS_TAG_BUTTON.value = 'div.foo\ndiv.bar';

    // Dismiss without saving: no confirm dialog, a warning toast, and the
    // original stored value still untouched.
    first.close();
    expect(document.querySelector('dialog.gc-p')).toBeNull();
    expect(document.querySelector('.pixiv-utils-alert')).toBeNull();
    expect(pixiv.storage.values.get('SELECTORS_TAG_BUTTON')).toEqual(['div.foo']);
    expect(pixiv.styles.join('\n')).toContain('.pixiv-utils-toast-warning {');
    const warning = document.querySelector('.pixiv-utils-toast-warning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('unsaved');

    // Reopening restores the pending edits, and another dismissal retains them.
    await openSettings(pixiv);
    const second = instances.at(-1);
    expect(second._fields.SELECTORS_TAG_BUTTON.value).toBe('div.foo\ndiv.bar');
    second.close();
    expect(document.querySelectorAll('.pixiv-utils-toast-warning')).toHaveLength(2);
    await openSettings(pixiv);
    const third = instances.at(-1);
    expect(third._fields.SELECTORS_TAG_BUTTON.value).toBe('div.foo\ndiv.bar');

    // Only an explicit save writes to storage and clears the pending state.
    await third.save();
    expect(pixiv.storage.values.get('SELECTORS_TAG_BUTTON')).toEqual(['div.foo', 'div.bar']);
    // gmConfig fires onSave from _persist() even when closeOnSave is false.
    third._options.onSave();
    const warningsBeforeDismiss = document.querySelectorAll('.pixiv-utils-toast-warning').length;
    third.close();
    expect(document.querySelectorAll('.pixiv-utils-toast-warning')).toHaveLength(warningsBeforeDismiss);
    await openSettings(pixiv);
    expect(instances.at(-1)._fields.SELECTORS_TAG_BUTTON.value).toBe('div.foo\ndiv.bar');
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });

  it('drops the pending snapshot when edits are reverted after reopening', async () => {
    const { FakeGmConfig, instances } = createFakeGmConfig();
    globalThis.gmConfig = FakeGmConfig;
    const pixiv = await loadPixivUtils({
      settings: { SETTINGS_LANGUAGE: 'en', SELECTORS_TAG_BUTTON: ['div.foo'] }
    });

    await openSettings(pixiv);
    instances.at(-1)._fields.SELECTORS_TAG_BUTTON.value = 'div.foo\ndiv.bar';
    instances.at(-1).close();
    expect(document.querySelectorAll('.pixiv-utils-toast-warning')).toHaveLength(1);

    // Reopen with the pending edit, then revert it to the persisted value.
    await openSettings(pixiv);
    const reopened = instances.at(-1);
    expect(reopened._fields.SELECTORS_TAG_BUTTON.value).toBe('div.foo\ndiv.bar');
    reopened._fields.SELECTORS_TAG_BUTTON.value = 'div.foo';
    reopened.close();

    // No second warning: nothing is pending anymore.
    expect(document.querySelectorAll('.pixiv-utils-toast-warning')).toHaveLength(1);
    await openSettings(pixiv);
    expect(instances.at(-1)._fields.SELECTORS_TAG_BUTTON.value).toBe('div.foo');
    instances.at(-1).close();
    expect(pixiv.console.error).toEqual([]);
  });
});
