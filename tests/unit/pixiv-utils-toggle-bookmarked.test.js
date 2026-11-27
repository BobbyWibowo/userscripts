import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  createStorage,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

// The fixture mirrors the "Tags page (new)" SECTIONS_TOGGLE_BOOKMARKED entry.
const SECTION_SELECTOR = 'div[data-ga4-label="works_content"]';
const HIDE_ATTRIBUTE = 'data-pixiv_utils_toggle_bookmarked_hide';
const MODE_KEY = 'pixiv_utils_toggle_bookmarked_mode';
const MARKER_KEY = 'pixiv_utils_toggle_bookmarked_section';

// The first card carries the bookmarked marker (a filled bookmark path), the
// second does not, so every filter mode hides exactly one of them. The third
// fixture card is bookmarked only through a computed color, which needs a real
// browser, so it is asserted by the Playwright spec instead.
const TRACKED_CARDS = ['#card-marker', '#card-plain'];

const section = () => document.querySelector(SECTION_SELECTOR);

const imagesContainer = () => section().children[1];

const button = () => section().querySelector('.pixiv_utils_toggle_bookmarked');

const hiddenStates = () => TRACKED_CARDS.map(id => document.querySelector(id).hasAttribute(HIDE_ATTRIBUTE));

const openSection = async pixiv => {
  await pixiv.observeElement(section());

  return section();
};

const press = (element, type = 'click', init = {}) => {
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
};

const load = (options = {}) => loadPixivUtils({
  settings: { SETTINGS_LANGUAGE: 'en' },
  ...options
});

describe('pixiv-utils toggle bookmarked', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('adds a toggle button to the section header without hiding anything', async () => {
    const pixiv = await load();
    const element = await openSection(pixiv);
    const header = element.children[0].children[0];
    const container = element.querySelector('.pixiv_utils_toggle_bookmarked_container');
    const toggle = button();

    expect(toggle).not.toBeNull();
    expect(container.parentElement).toBe(header);
    expect(toggle.title).toBe('Cycle bookmarked display (Right-Click to cycle back)');
    expect(toggle.textContent).toContain('Show all');

    // The header element and the images container share one section identity.
    expect(element.dataset[MARKER_KEY]).toBeTruthy();
    expect(imagesContainer().dataset[MARKER_KEY]).toBe(element.dataset[MARKER_KEY]);
    expect(element.dataset[MODE_KEY]).toBe('0');
    expect(imagesContainer().dataset[MODE_KEY]).toBe('0');
    expect(hiddenStates()).toEqual([false, false]);

    // Registering a section is not a preference change; only cycling is.
    expect(pixiv.storage.get('PREF_TOGGLE_BOOKMARKED_MODE', null)).toBeNull();
  });

  it('cycles forward through all three display modes', async () => {
    const pixiv = await load();
    const element = await openSection(pixiv);
    const toggle = button();

    press(toggle);

    expect(element.dataset[MODE_KEY]).toBe('1');
    expect(toggle.textContent).toContain('Show not bookmarked');
    expect(hiddenStates()).toEqual([true, false]);
    expect(pixiv.storage.get('PREF_TOGGLE_BOOKMARKED_MODE', null)).toBe(1);

    press(toggle);

    expect(element.dataset[MODE_KEY]).toBe('2');
    expect(toggle.textContent).toContain('Show bookmarked');
    expect(hiddenStates()).toEqual([false, true]);

    press(toggle);

    expect(element.dataset[MODE_KEY]).toBe('0');
    expect(toggle.textContent).toContain('Show all');
    expect(hiddenStates()).toEqual([false, false]);
    expect(pixiv.storage.get('PREF_TOGGLE_BOOKMARKED_MODE', null)).toBe(0);
  });

  it('steps backwards on right click and wraps around the first mode', async () => {
    const pixiv = await load();
    const element = await openSection(pixiv);

    press(button(), 'contextmenu');

    expect(element.dataset[MODE_KEY]).toBe('2');
    expect(hiddenStates()).toEqual([false, true]);

    press(button(), 'contextmenu');

    expect(element.dataset[MODE_KEY]).toBe('1');
    expect(hiddenStates()).toEqual([true, false]);
  });

  it('adopts the saved preference on shift-click', async () => {
    const pixiv = await load();
    const element = await openSection(pixiv);

    // Another section persisted a preference after this one was created.
    pixiv.storage.set('PREF_TOGGLE_BOOKMARKED_MODE', 2);

    press(button(), 'click', { shiftKey: true });

    expect(element.dataset[MODE_KEY]).toBe('2');
    expect(hiddenStates()).toEqual([false, true]);
  });

  it('starts a later section from the persisted preference', async () => {
    const storage = createStorage();

    const first = await load({ storage });

    await openSection(first);
    press(button());

    expect(storage.get('PREF_TOGGLE_BOOKMARKED_MODE', null)).toBe(1);

    cleanupPixivUtils();
    loadFixture();

    const second = await load({ storage });
    const element = await openSection(second);

    // The saved mode is adopted and applied immediately on load.
    expect(element.dataset[MODE_KEY]).toBe('1');
    expect(hiddenStates()).toEqual([true, false]);

    press(button());

    expect(element.dataset[MODE_KEY]).toBe('2');
    expect(hiddenStates()).toEqual([false, true]);
  });

  it('skips a section whose sanity check matches the current page', async () => {
    // Mobile artist bookmarks section: `.nav-tab + div`, skipped on own profile.
    document.body.innerHTML = `
      <a class="ui-button" href="/settings/profile">Profile</a>
      <div class="nav-tab"></div>
      <div>
        <div class="pager-view-nav"></div>
        <div class="works-grid-list"><div data-ga4-label="thumbnail"></div></div>
      </div>
    `;

    const pixiv = await load();
    const element = document.querySelector('.nav-tab + div');

    await pixiv.observeElement(element);

    expect(element.querySelector('.pixiv_utils_toggle_bookmarked')).toBeNull();
    expect(element.dataset[MARKER_KEY]).toBeUndefined();

    document.querySelector('.ui-button').remove();

    await pixiv.observeElement(element);

    expect(element.querySelector('.pixiv_utils_toggle_bookmarked')).not.toBeNull();
    expect(element.dataset[MARKER_KEY]).toBeTruthy();
    expect(element.dataset[MODE_KEY]).toBe('0');
  });

  it('applies an active filter to cards added to the section', async () => {
    const pixiv = await load();
    await openSection(pixiv);

    // Mode 1 hides bookmarked cards.
    press(button());
    expect(hiddenStates()).toEqual([true, false]);

    const bookmarked = document.querySelector('#card-marker').cloneNode(true);
    bookmarked.removeAttribute('id');
    const plain = document.querySelector('#card-plain').cloneNode(true);
    plain.removeAttribute('id');
    imagesContainer().querySelector('ul').append(bookmarked, plain);

    await pixiv.observeImageCard(bookmarked);
    await pixiv.observeImageCard(plain);

    // The section mode is applied as each card is processed, in the same batch.
    expect(bookmarked.hasAttribute(HIDE_ATTRIBUTE)).toBe(true);
    expect(plain.hasAttribute(HIDE_ATTRIBUTE)).toBe(false);
  });

  it('filters a section re-created after SPA navigation', async () => {
    // jsdom only provides requestAnimationFrame with pretendToBeVisual; the
    // navigation rescan schedules through it.
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
    }

    const pixiv = await load();
    await openSection(pixiv);
    press(button()); // mode 1: hide bookmarked; persisted as the preference
    expect(hiddenStates()).toEqual([true, false]);

    // Simulate Pixiv re-creating the section element on return: a fresh subtree
    // with no markers and no hide attributes, so only storage knows the mode.
    const fresh = section().cloneNode(true);
    fresh.querySelectorAll('.pixiv_utils_toggle_bookmarked_container').forEach(el => el.remove());
    for (const el of [fresh, ...fresh.querySelectorAll('*')]) {
      delete el.dataset[MARKER_KEY];
      delete el.dataset[MODE_KEY];
      el.removeAttribute(HIDE_ATTRIBUTE);
    }
    section().replaceWith(fresh);

    const currentUrl = new URL(window.location.href);
    window.dispatchEvent(new CustomEvent('detectnavigate', { detail: { currentUrl, newUrl: currentUrl } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await flush();

    // The re-created section adopts the saved mode and filters immediately.
    expect(section().dataset[MODE_KEY]).toBe('1');
    expect(hiddenStates()).toEqual([true, false]);
  });

  it('re-applies the active filter to in-viewport cards after SPA navigation', async () => {
    // jsdom only provides requestAnimationFrame with pretendToBeVisual; the
    // navigation re-apply schedules through it.
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
    }

    const pixiv = await load();
    await openSection(pixiv);

    // Cycle to "show not bookmarked": the bookmarked card is hidden.
    press(button());
    expect(section().dataset[MODE_KEY]).toBe('1');
    expect(hiddenStates()).toEqual([true, false]);

    // Simulate React re-rendering the in-viewport cards on return from the
    // expanded view: the hide attribute is gone but the section stays initialized,
    // and the cards keep their processed identity so doImage will not re-run.
    for (const id of TRACKED_CARDS) document.querySelector(id).removeAttribute(HIDE_ATTRIBUTE);
    expect(hiddenStates()).toEqual([false, false]);

    const currentUrl = new URL(window.location.href);
    window.dispatchEvent(new CustomEvent('detectnavigate', { detail: { currentUrl, newUrl: currentUrl } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await flush();

    // The navigation handler restores the filter for the already-visible cards.
    expect(hiddenStates()).toEqual([true, false]);
  });
});
