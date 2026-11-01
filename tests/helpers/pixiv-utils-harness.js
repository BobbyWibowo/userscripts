/**
 * Shared harness for `src/pixiv-utils.user.js`.
 *
 * The userscript is a single IIFE with no exports, so every entry point runs at
 * import time behind userscript-manager APIs and the `@require` globals. Tests
 * stub those globals, import the script as a module, and then drive it through a
 * fake `sentinel` plus DOM fixtures.
 *
 * Usage:
 *
 *   import { cleanupPixivUtils, loadPixivUtils } from '../helpers/pixiv-utils-harness.js';
 *
 *   afterEach(() => cleanupPixivUtils());
 *
 * Always clean up. The script patches `history.pushState`/`replaceState` and
 * registers global event listeners that outlive a single jsdom test.
 *
 * Do not combine the harness with `vi.useFakeTimers()`: it installs its own
 * timer tracking so long-lived intervals are cleared between tests.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const SCRIPT_SPECIFIER = '../../src/pixiv-utils.user.js';
const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'pixiv-utils.user.js');
const SCRIPT_SOURCE = readFileSync(SCRIPT_PATH, 'utf8');

/** `@version` from the userscript header, reused as the pre-built cache key. */
export const SCRIPT_VERSION = SCRIPT_SOURCE.match(/^\/\/ @version\s+(\S+)/m)?.[1] ?? '0.0.0';

/** Storage key backing the pre-built CSS selector cache. */
export const PREBUILT_KEY = '_PREBUILT';

/** `ENV_DEFAULTS.WAIT_FOR_POLL`: how often `waitFor()` re-checks for an element. */
export const DEFAULT_WAIT_FOR_POLL = 1000;

/** Default `SELECTORS_UTAGS`, built from `UTAGS_BLOCKED_TAGS: ['block', 'hide']`. */
export const DEFAULT_UTAGS_SELECTOR = '[data-utags_tag="block"], [data-utags_tag="hide"]';

/** `SELECTORS_IMAGE_MOBILE`, the mobile counterpart of `CONFIG.SELECTORS_IMAGE`. */
export const SELECTORS_IMAGE_MOBILE = '.works-item';

/** `log('Started.')` is emitted once the whole boot sequence has finished. */
export const STARTED_LOG = 'Started.';

/** `logDebug('Using window.onurlchange polyfill.')`, only emitted with `MODE !== 'PROD'`. */
export const ONURLCHANGE_POLYFILL_LOG = 'Using window.onurlchange polyfill.';

/** `logDebug('Using window.onurlchange.')`, only emitted with `MODE !== 'PROD'`. */
export const ONURLCHANGE_NATIVE_LOG = 'Using window.onurlchange.';

/**
 * Number of `SECTIONS_TOGGLE_BOOKMARKED` entries.
 *
 * Every entry in that array declares its parent selector as a `css`-tagged
 * template literal, while the settings-panel field definitions declare an
 * object (`selectorParent: {`), so this pattern counts sections only. Each
 * entry registers two sentinel callbacks.
 */
export const TOGGLE_SECTION_COUNT = SCRIPT_SOURCE.match(/selectorParent:\s*\/\*css\*\//g)?.length ?? 0;

/** Sentinel callback count registered by default (`6` base + `2` per toggle section + dates + UTags). */
export const BASE_LISTENER_COUNT = 6;

export const DEFAULT_LISTENER_COUNT = BASE_LISTENER_COUNT + (TOGGLE_SECTION_COUNT * 2) + 2;

/** Flush pending microtasks and macrotasks, including deferred artwork work. */
export const flush = async (turns = 3) => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

/**
 * Load an HTML fixture into the live document.
 *
 * Bodies are copied with `innerHTML`, which jsdom refuses to execute, so
 * fixture `<script>` elements stay inert data (the credentials metadata the
 * script reads is one of them).
 *
 * @param {string} [name] Fixture file name inside `tests/fixtures`.
 */
export const loadFixture = (name = 'pixiv-grid.html') => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', name), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  return document;
};

/** Map-backed stand-in for GM storage, preserving value types as GM does. */
export const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));

  return {
    values,
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set: (key, value) => values.set(key, value),
    list: () => Array.from(values.keys()),
    snapshot: () => Object.fromEntries(values)
  };
};

/**
 * Fake `sentinel-js` instance.
 *
 * The script only ever calls `sentinel.on()`, and later rebinds it to wrap
 * callbacks, so a plain recording implementation is enough.
 */
export const createSentinel = () => {
  const listeners = [];

  const sentinel = {
    on: (selector, callback) => {
      listeners.push({ selector, callback });
      return sentinel;
    }
  };

  return { sentinel, listeners };
};

/**
 * Stand-in for `IntersectionObserver`.
 *
 * jsdom reports every element as zero-sized, so `isElementPassedOrVisible()` is
 * false for all artwork cards and their work is deferred here. `autoIntersect`
 * reports every observed target as intersecting, which is what makes deferred
 * artwork processing observable in unit tests.
 */
export const createIntersectionObserver = ({ autoIntersect = true } = {}) => {
  const instances = [];

  class IntersectionObserverStub {
    constructor (callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      this.connected = true;
      instances.push(this);
    }

    observe (target) {
      this.targets.add(target);

      if (!autoIntersect) return;

      queueMicrotask(() => this.deliver([{ target, isIntersecting: true }]));
    }

    unobserve (target) {
      this.targets.delete(target);
    }

    disconnect () {
      this.connected = false;
      this.targets.clear();
    }

    deliver (entries) {
      if (!this.connected) return;

      for (const entry of entries) this.targets.delete(entry.target);

      this.callback(entries, this);
    }

    takeRecords () {
      return [];
    }
  }

  return { IntersectionObserverStub, instances };
};

const activeCleanups = [];

/**
 * Objects that act as `window` in this environment.
 *
 * Vitest's jsdom environment may expose `globalThis` and `window` as the same
 * object or as separate references depending on the version, so globals the
 * script reads through either path are installed on all of them.
 */
const windowTargets = () => {
  const targets = [globalThis];

  if (globalThis.window && globalThis.window !== globalThis) targets.push(globalThis.window);

  return targets;
};

/** Tear down every harness built by `loadPixivUtils()` since the last call. */
export const cleanupPixivUtils = () => {
  while (activeCleanups.length) {
    const cleanup = activeCleanups.pop();

    try {
      cleanup();
    } catch (error) {
      console.error('[pixiv-utils harness]: cleanup failed:', error);
    }
  }
};

/**
 * Record every timer the script starts so long-lived intervals can be cleared
 * between tests (`processNewElement` starts a 10s cleanup interval, and debug
 * mode starts a `WAIT_FOR_POLL` interval).
 */
const patchTimers = () => {
  const patched = [];

  for (const target of windowTargets()) {
    const originals = {
      setTimeout: target.setTimeout,
      setInterval: target.setInterval,
      clearTimeout: target.clearTimeout,
      clearInterval: target.clearInterval
    };
    const handles = [];

    target.setTimeout = (...args) => {
      const handle = originals.setTimeout(...args);
      handles.push(() => originals.clearTimeout(handle));
      return handle;
    };

    target.setInterval = (...args) => {
      const handle = originals.setInterval(...args);
      handles.push(() => originals.clearInterval(handle));
      return handle;
    };

    patched.push({ target, originals, handles });
  }

  return () => {
    for (const { target, originals, handles } of patched) {
      target.setTimeout = originals.setTimeout;
      target.setInterval = originals.setInterval;

      for (const clear of handles) clear();
    }
  };
};

/**
 * Record every listener registered on `window`/`document` so a boot sequence
 * from one test cannot react to events dispatched by the next.
 */
const patchListeners = () => {
  const registered = [];
  const originals = new Map();

  for (const target of [...windowTargets(), globalThis.document]) {
    originals.set(target, {
      own: Object.prototype.hasOwnProperty.call(target, 'addEventListener'),
      value: target.addEventListener
    });

    target.addEventListener = function (type, listener, options) {
      registered.push({ target, type, listener, options });
      return originals.get(target).value.call(this, type, listener, options);
    };
  }

  return () => {
    for (const { target, type, listener, options } of registered) {
      target.removeEventListener(type, listener, options);
    }

    for (const [target, original] of originals) {
      if (original.own) target.addEventListener = original.value;
      else delete target.addEventListener;
    }
  };
};

/** Snapshot `history.pushState`/`replaceState`, which the polyfill overwrites. */
const snapshotHistory = () => {
  const history = globalThis.history;
  const snapshot = new Map();

  for (const method of ['pushState', 'replaceState']) {
    snapshot.set(method, {
      own: Object.prototype.hasOwnProperty.call(history, method),
      value: history[method]
    });
  }

  return () => {
    for (const [method, original] of snapshot) {
      if (original.own) history[method] = original.value;
      else delete history[method];
    }
  };
};

/** Install the browser globals jsdom lacks (and the `IntersectionObserver` stub). */
const installBrowserGlobals = ({ autoIntersect, nativeUrlChange }) => {
  const { IntersectionObserverStub, instances } = createIntersectionObserver({ autoIntersect });
  const previous = windowTargets().map(target => ({
    target,
    intersectionObserver: target.IntersectionObserver,
    onurlchange: target.onurlchange
  }));
  const previousScrollIntoView = globalThis.Element.prototype.scrollIntoView;

  for (const { target } of previous) {
    target.IntersectionObserver = IntersectionObserverStub;

    // Without `@grant window.onurlchange` the manager leaves it `undefined`, so
    // the script falls back to patching the history API. `null` means "native".
    if (nativeUrlChange) target.onurlchange = null;
  }

  if (typeof previousScrollIntoView !== 'function') {
    globalThis.Element.prototype.scrollIntoView = () => {};
  }

  return {
    instances,
    restore: () => {
      for (const { target, intersectionObserver, onurlchange } of previous) {
        if (intersectionObserver === undefined) delete target.IntersectionObserver;
        else target.IntersectionObserver = intersectionObserver;

        if (onurlchange === undefined) delete target.onurlchange;
        else target.onurlchange = onurlchange;
      }

      if (previousScrollIntoView === undefined) delete globalThis.Element.prototype.scrollIntoView;
      else globalThis.Element.prototype.scrollIntoView = previousScrollIntoView;
    }
  };
};

/**
 * Install the userscript-manager APIs the script reads at import time.
 *
 * `GM_info` is not granted by the script's metadata, but real managers expose it
 * regardless, and the script relies on `GM_info.script.version`.
 */
const installGmApis = ({ storage, sentinel, styles, menuCommands }) => {
  const names = ['GM_info', 'GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_listValues', 'GM_registerMenuCommand', 'sentinel'];
  const targets = windowTargets();
  const gmAddStyle = css => {
    // Recorded, not injected: jsdom would try to parse selectors it cannot
    // fully support (`:has()`, `:nth-child(.. of ..)`), and real style
    // application is verified by the Playwright spec instead.
    const style = document.createElement('style');
    style.textContent = typeof css === 'string' ? css : String(css);
    styles.push(style.textContent);
    return style;
  };

  for (const target of targets) {
    target.GM_info = { script: { version: SCRIPT_VERSION } };
    target.GM_addStyle = gmAddStyle;
    target.GM_getValue = (key, fallback) => storage.get(key, fallback);
    target.GM_setValue = (key, value) => storage.set(key, value);
    target.GM_listValues = () => storage.list();
    target.GM_registerMenuCommand = (label, onClick) => {
      menuCommands.push({ label, onClick });
      return menuCommands.length;
    };
    target.sentinel = sentinel;
  }

  return () => {
    for (const target of targets) for (const name of names) delete target[name];
  };
};

/**
 * Seed GM storage, stub the globals, and evaluate the userscript.
 *
 * @param {object} [options]
 * @param {object} [options.settings] GM storage values to seed before the script reads them.
 * @param {ReturnType<typeof createStorage>} [options.storage] Storage to reuse across loads.
 * @param {boolean} [options.autoIntersect] Report observed elements as intersecting (default `true`).
 * @param {boolean} [options.nativeUrlChange] Emulate `@grant window.onurlchange` being honored.
 * @param {boolean} [options.verbose] Also forward the script's console output to the real console.
 * @param {string} [options.url] Route to boot at, resolved against the current origin.
 * @returns {Promise<object>} The loaded harness.
 */
export const loadPixivUtils = async (options = {}) => {
  const {
    settings = {},
    storage = createStorage(),
    autoIntersect = true,
    nativeUrlChange = false,
    verbose = false,
    url = '/'
  } = options;

  cleanupPixivUtils();

  // jsdom keeps `location` between tests, and the script derives its navigation
  // baseline from it, so every load starts from a known route.
  history.replaceState(null, '', new URL(url, location.origin).href);

  // Keep the boot sequence fast and deterministic: tooltips need the
  // `@require`d Floating UI build, and element polling should not idle for 1s.
  const seededSettings = {
    WAIT_FOR_POLL: 5,
    ENABLE_FLOATING_TOOLTIPS: false,
    ...settings
  };

  for (const [key, value] of Object.entries(seededSettings)) storage.set(key, value);

  const styles = [];
  const menuCommands = [];
  const consoleCalls = { log: [], warn: [], error: [] };
  const restoreConsole = [];

  for (const level of Object.keys(consoleCalls)) {
    const original = console[level].bind(console);
    const spy = vi.spyOn(console, level).mockImplementation((...args) => {
      consoleCalls[level].push(args);

      if (verbose) original(...args);
    });

    restoreConsole.push(() => spy.mockRestore());
  }

  const { sentinel, listeners } = createSentinel();
  const removeGmApis = installGmApis({ storage, sentinel, styles, menuCommands });
  const browser = installBrowserGlobals({ autoIntersect, nativeUrlChange });
  const restoreTimers = patchTimers();
  const restoreListeners = patchListeners();
  const restoreHistory = snapshotHistory();

  const cleanup = () => {
    restoreListeners();
    restoreTimers();
    restoreHistory();
    browser.restore();
    removeGmApis();

    for (const restore of restoreConsole) restore();
  };

  activeCleanups.push(cleanup);

  vi.resetModules();
  await import(SCRIPT_SPECIFIER);
  await flush();

  const selectors = () => listeners.flatMap(entry => (Array.isArray(entry.selector) ? entry.selector : [entry.selector]));

  const findListeners = selector =>
    listeners.filter(entry => (Array.isArray(entry.selector) ? entry.selector.includes(selector) : entry.selector === selector));

  /**
   * Invoke every callback registered for a selector and settle the work it
   * starts. Rejects on an unregistered selector so typos cannot pass silently.
   */
  const fire = async (selector, element) => {
    const matches = findListeners(selector);

    if (!matches.length) throw new Error(`No sentinel callback registered for selector: ${selector}`);

    const results = [];

    for (const entry of matches) results.push(await entry.callback(element));

    await flush();

    return results;
  };

  /**
   * Invoke a single registered callback by entry reference. Useful for
   * selectors that are assembled at runtime and cannot be written verbatim.
   */
  const fireListener = async (entry, element) => {
    const result = await entry.callback(element);

    await flush();

    return result;
  };

  return {
    sentinel,
    listeners,
    selectors,
    findListeners,
    fire,
    fireListener,
    storage,
    settings: seededSettings,
    styles,
    menuCommands,
    observers: browser.instances,
    console: consoleCalls,
    scriptVersion: SCRIPT_VERSION,
    cleanup
  };
};
