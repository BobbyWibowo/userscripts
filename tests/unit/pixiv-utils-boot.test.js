import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASE_LISTENER_COUNT,
  DEFAULT_LISTENER_COUNT,
  DEFAULT_UTAGS_SELECTOR,
  ONURLCHANGE_NATIVE_LOG,
  STARTED_LOG,
  TOGGLE_SECTION_COUNT,
  cleanupPixivUtils,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const STARTED_MESSAGE = `[Pixiv Utils]: ${STARTED_LOG}`;

// The six unconditional registrations, each identified by a fragment unique to
// its normalized `PRESETS` selector.
const BASE_SELECTORS = [
  '[data-ga4-label="page_root"]:not([data-ga4-entity-id])',
  'a[href*="settings/profile"], .ui-button[href*="setting_profile.php"]',
  'main div[style*="translateY"] section, .work-interactions',
  'div[data-ga4-label="thumbnail"]',
  'main > section:has(figure) > :nth-child(2 of div) nav[style] > div > div:has(a[href])',
  '[data-ga4-label="scroll_loader"] [data-ga4-label="work_content"]:has(a[href])'
];

// Fragments unique to the conditionally registered tag/user selectors.
const TAG_BUTTON_MARKER = 'tags_carousel';
const RECOMMENDED_USER_MARKER = 'li.list-none';

// Fragment unique to the expanded-view controls selector.
const CONFIG_EXPANDED_VIEW_CONTROLS_FRAGMENT = 'work-interactions';

// `log()` passes its message first; `logDebug()` (via `tlog()`) passes a
// timestamp prefix first, so join every argument before matching.
const logMessages = pixiv => pixiv.console.log.map(args => args.map(String).join(' '));

describe('pixiv-utils boot', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('boots without throwing and reports that it started', async () => {
    const pixiv = await loadPixivUtils();

    // The fixture supplies page metadata, so credential resolution succeeds
    // and the boot sequence stays error-free.
    expect(pixiv.console.error).toEqual([]);
    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);
    // The unconditional `GM_addStyle(mainStyle)` at document-start. jsdom would
    // refuse to parse the sheet, so the harness records the CSS text instead;
    // the Playwright spec verifies the same stylesheet in a real browser.
    expect(pixiv.styles.some(css => css.includes('.pixiv_utils_edit_bookmark'))).toBe(true);
  });

  it('degrades gracefully when the page carries no credentials', async () => {
    document.body.innerHTML = '';

    const pixiv = await loadPixivUtils();

    expect(pixiv.console.error).toEqual([
      [expect.objectContaining({ message: 'Could not determine your Pixiv user ID.' })]
    ]);
    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('registers every unconditional base callback', async () => {
    const pixiv = await loadPixivUtils();
    const selectors = pixiv.selectors();

    for (const needle of BASE_SELECTORS) {
      expect(selectors.some(selector => selector.includes(needle))).toBe(true);
    }

    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('fires the home and own-profile listeners without throwing', async () => {
    loadFixture();

    const pixiv = await loadPixivUtils();
    const home = pixiv.listeners.find(entry =>
      String(entry.selector).includes('page_root')
    );
    const ownProfile = pixiv.listeners.find(entry =>
      String(entry.selector).includes('settings/profile')
    );

    expect(home).toBeDefined();
    expect(ownProfile).toBeDefined();

    await expect(pixiv.fireListener(home, document.documentElement)).resolves.not.toThrow();
    await expect(pixiv.fireListener(ownProfile, document.documentElement)).resolves.not.toThrow();

    expect(pixiv.console.error).toEqual([]);
  });
  it('registers a parent and a derived container callback per toggle-bookmarked section', async () => {
    const pixiv = await loadPixivUtils();
    const toggleEntries = pixiv.listeners.slice(
      BASE_LISTENER_COUNT,
      BASE_LISTENER_COUNT + (TOGGLE_SECTION_COUNT * 2)
    );

    expect(TOGGLE_SECTION_COUNT).toBeGreaterThan(0);
    expect(toggleEntries).toHaveLength(TOGGLE_SECTION_COUNT * 2);

    for (let index = 0; index < toggleEntries.length; index += 2) {
      const parent = toggleEntries[index].selector;
      const container = toggleEntries[index + 1].selector;

      // `formatChildSelector()` wraps the parent selector in `:is(...)`, so the
      // derived container selector must embed the exact parent selector.
      expect(container).toContain(`:is(${parent})`);
    }
  });

  it('subscribes to both date selector alternates', async () => {
    const pixiv = await loadPixivUtils();
    const dateEntries = pixiv.listeners.filter(entry => Array.isArray(entry.selector));

    expect(dateEntries).toHaveLength(1);
    expect(dateEntries[0].selector).toHaveLength(2);
    expect(dateEntries[0].selector[0]).toContain(':has(> :is(');
    expect(dateEntries[0].selector[0]).toContain(':not(:has(> [data-pixiv_utils_duplicate_date]))');
    expect(dateEntries[0].selector[1]).toContain('.reupload-info:has(:is(');
    expect(dateEntries[0].selector[1]).toContain('.times');
    expect(dateEntries[0].selector[1]).toContain(':not([data-pixiv_utils_duplicate_date]))');
  });

  it('registers the default UTags selector and no tag/user callbacks', async () => {
    const pixiv = await loadPixivUtils();

    expect(pixiv.selectors()).toContain(DEFAULT_UTAGS_SELECTOR);

    // The tag-button and recommended-user callbacks are the only conditional
    // extras, so the base count doubles as proof that neither registered.
    expect(pixiv.listeners).toHaveLength(DEFAULT_LISTENER_COUNT);
  });

  it('adds the tag and recommended-user callbacks only when their blocklists are configured', async () => {
    const defaults = await loadPixivUtils();
    const defaultSelectors = defaults.selectors();

    cleanupPixivUtils();

    const configured = await loadPixivUtils({
      settings: {
        PIXIV_BLOCKED_TAGS: ['ai-generated'],
        PIXIV_BLOCKED_USERS: ['123456']
      }
    });

    // Both loads normalize their selectors deterministically, so the only
    // selectors that differ are the two conditional registrations.
    const added = configured.selectors().filter(selector => !defaultSelectors.includes(selector));

    expect(defaults.listeners).toHaveLength(BASE_LISTENER_COUNT + (TOGGLE_SECTION_COUNT * 2) + 2);
    expect(configured.listeners).toHaveLength(DEFAULT_LISTENER_COUNT + 2);
    expect(added).toHaveLength(2);
    expect(added.some(selector => selector.includes(TAG_BUTTON_MARKER))).toBe(true);
    expect(added.some(selector => selector.includes(RECOMMENDED_USER_MARKER))).toBe(true);
  });

  it('skips only the toggle sections when the bookmark filter is disabled', async () => {
    const pixiv = await loadPixivUtils({ settings: { ENABLE_TOGGLE_BOOKMARKED: false } });

    expect(pixiv.listeners).toHaveLength(BASE_LISTENER_COUNT + 2);
    expect(pixiv.selectors()).toContain(DEFAULT_UTAGS_SELECTOR);
  });

  it('keeps only the base callbacks when every optional integration is disabled', async () => {
    const pixiv = await loadPixivUtils({
      settings: {
        ENABLE_TOGGLE_BOOKMARKED: false,
        DATE_CONVERSION: false,
        UTAGS_INTEGRATION: false
      }
    });

    expect(pixiv.listeners).toHaveLength(BASE_LISTENER_COUNT);
  });

  it('normalizes every registered selector onto a single line', async () => {
    const pixiv = await loadPixivUtils();

    for (const selector of pixiv.selectors()) {
      expect(selector).toBe(selector.trim());
      expect(selector).not.toContain('\n');
      expect(selector).not.toContain('/*');
      expect(selector).not.toMatch(/ {2,}/);
    }
  });

  it('tracks SPA navigation through the window.onurlchange polyfill', async () => {
    const pixiv = await loadPixivUtils();
    const observersBefore = pixiv.observers.length;

    history.pushState(null, '', '/users/12345');

    // `detectnavigate` re-creates the images IntersectionObserver.
    expect(pixiv.observers.length).toBe(observersBefore + 1);
  });

  it('prefers a granted window.onurlchange over patching the history API', async () => {
    const pixiv = await loadPixivUtils({ nativeUrlChange: true, settings: { MODE: 'DEBUG' } });
    const observersBefore = pixiv.observers.length;
    const target = new URL('/users/12345', location.origin).href;

    expect(logMessages(pixiv).some(message => message.includes(ONURLCHANGE_NATIVE_LOG))).toBe(true);

    history.pushState(null, '', target);

    expect(pixiv.observers.length).toBe(observersBefore);

    const urlchange = new Event('urlchange');
    urlchange.url = target;
    window.dispatchEvent(urlchange);

    expect(pixiv.observers.length).toBe(observersBefore + 1);
  });

  it('warns and still boots when blocked tags contain an unparseable regex', async () => {
    // `[invalid` is not a valid regular expression. Runtime compilation
    // isolates it: the setting is reported, the bad rule is skipped, and the
    // rest of the script keeps booting.
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: [['[invalid', 'i']] } });

    expect(logMessages(pixiv)).toContain(STARTED_MESSAGE);
    expect(pixiv.console.error).toEqual([[
      expect.stringContaining('PIXIV_BLOCKED_TAGS'),
      [expect.stringContaining('[invalid')]
    ]]);
  });

  it('registers and fires the UTags listener without throwing', async () => {
    const pixiv = await loadPixivUtils();

    const utagsListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes('data-utags_tag=')
    );

    expect(utagsListener).toBeDefined();

    // A UTags element with no image/container ancestors returns without
    // throwing (the sentinel wrapper does not return doUtags's result).
    const utagElement = document.createElement('div');
    utagElement.dataset.utags_tag = 'block';
    document.body.append(utagElement);

    await expect(pixiv.fireListener(utagsListener, utagElement)).resolves.toBeUndefined();
  });

  it('registers and fires the expanded-view controls listener without throwing', async () => {
    const pixiv = await loadPixivUtils();

    const expandedViewListener = pixiv.listeners.find(entry =>
      String(entry.selector).includes(CONFIG_EXPANDED_VIEW_CONTROLS_FRAGMENT)
    );

    expect(expandedViewListener).toBeDefined();

    // An element with no expanded-view image ancestor returns without
    // throwing (the sentinel wrapper does not return doExpandedViewControls's result).
    const element = document.createElement('div');
    document.body.append(element);

    await expect(pixiv.fireListener(expandedViewListener, element)).resolves.toBeUndefined();
  });
});
