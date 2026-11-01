import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  createStorage,
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
  await pixiv.fire(SECTION_SELECTOR, section());

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

    // The saved mode is adopted, but visibility only changes on interaction.
    expect(element.dataset[MODE_KEY]).toBe('1');
    expect(hiddenStates()).toEqual([false, false]);

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
    const listener = pixiv.listeners.find(entry => String(entry.selector).includes('.nav-tab + div'));
    const element = document.querySelector('.nav-tab + div');

    expect(listener).toBeDefined();

    await pixiv.fireListener(listener, element);

    expect(element.querySelector('.pixiv_utils_toggle_bookmarked')).toBeNull();
    expect(element.dataset[MARKER_KEY]).toBeUndefined();

    document.querySelector('.ui-button').remove();

    await pixiv.fireListener(listener, element);

    expect(element.querySelector('.pixiv_utils_toggle_bookmarked')).not.toBeNull();
    expect(element.dataset[MARKER_KEY]).toBeTruthy();
    expect(element.dataset[MODE_KEY]).toBe('0');
  });
});
