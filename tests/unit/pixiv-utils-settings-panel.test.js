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
      document.body.appendChild(this._dlg);
      this._options.onOpen?.();
    }

    close () {
      if (!this.isOpen) return;
      this.isOpen = false;
      this._dlg.remove();
      this._options.onClose?.();
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
    expect(pixiv.storage.values.get(PREBUILT_KEY)).toBeNull();
    expect(pixiv.console.error).toEqual([]);
  });
});
