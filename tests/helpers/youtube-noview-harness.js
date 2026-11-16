/**
 * Reusable harness for `src/youtube-noview.user.js`.
 *
 * The userscript is a single IIFE with no exports: ENV/CONFIG merging, style
 * injection, and navigation listeners all run at import behind userscript
 * globals. Tests stub GM_* / sentinel / IntersectionObserver / fetch, import
 * the script per test (vi.resetModules()), and drive it black-box through DOM
 * fixtures, yt-navigate-* events, the captured sentinel callback, manual
 * MessageEvents, and a mocked fetch.
 *
 * jsdom bridges (this script is unusually layout-sensitive):
 * - getClientRects() always returns [] (no layout engine), which would make
 *   every card look "not in viewport" and defer to the (stubbed, never-fired)
 *   IntersectionObserver. Element.prototype.getClientRects is patched to
 *   return a fake box unless the element is [hidden] or display:none — the
 *   same contract real browsers provide, and exactly what the script's
 *   viewport check (#9d) consumes.
 * - yt-navigate-* handlers registered on window at import persist across
 *   vi.resetModules(); the harness records addEventListener calls made during
 *   import and removes them in cleanup() so stale instances never double-fire.
 * - window.postMessage (the script's own request/receive protocol) may be
 *   delivered by jsdom asynchronously; video IDs are unique per load so a
 *   late cross-test delivery can never resolve the wrong test's cache.
 *
 * Timers: tests run on fake timers with Date faked (the request throttle
 * measures start spacing via Date.now()). Math.random is pinned to 0.5, so
 * pacing is deterministic: 250ms + floor(0.5 * 150) = 325ms between player
 * request starts.
 *
 * Usage:
 *
 *   const fx = await loadNoview();          // import with default config
 *   const [card] = installPage({ cards });  // fixture before navigating
 *   navigate();                             // yt-navigate-start + finish
 *   await pump(() => card.dataset.noview_views !== undefined);
 */
import { vi } from 'vitest';

const SCRIPT_SPECIFIER = '../../src/youtube-noview.user.js';

let gmStore;
let addedStyles;
let sentinelCalls;
let ioInstances;
let fetchCallLog;
let fetchHeld;
let fetchHoldEnabled;
let fetchResponder;
let abortTimeoutLog;
let loadSeq = 0;
let mathRandomSpy;
let intervalSpy;
let rectPatchInstalled;
let abortWrapped;

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

/** Innertube player payload; videoId must echo the request (the script checks it). */
export const playerPayload = (videoId, { viewCount = '5000', isLive = false, isUpcoming = false, channelId = 'UC0000000000000000000' } = {}) => ({
  videoDetails: { videoId, channelId, author: 'Channel', viewCount, isLive, isUpcoming },
  playabilityStatus: { status: 'OK' }
});

export { jsonResponse };

const defaultResponder = call => {
  const videoId = JSON.parse(call.options.body).videoId;
  return jsonResponse(playerPayload(videoId));
};

const installManagerGlobals = () => {
  gmStore = new Map();
  addedStyles = [];
  globalThis.GM_getValue = key => (gmStore.has(key) ? gmStore.get(key) : undefined);
  globalThis.GM_setValue = (key, value) => {
    gmStore.set(key, value);
    return value;
  };
  globalThis.GM_addStyle = css => {
    addedStyles.push(css);
    return undefined;
  };
};

const installSentinelStub = () => {
  sentinelCalls = [];
  globalThis.sentinel = {
    on: (selector, callback) => {
      sentinelCalls.push({ selector, callback });
    },
    off: () => {},
    reset: () => {}
  };
};

const installIntersectionObserverStub = () => {
  ioInstances = [];
  globalThis.IntersectionObserver = class MockIntersectionObserver {
    constructor (callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      ioInstances.push(this);
    }

    observe (element) {
      this.targets.add(element);
    }

    unobserve (element) {
      this.targets.delete(element);
    }

    disconnect () {
      this.targets.clear();
    }
  };
};

const patchClientRects = () => {
  if (rectPatchInstalled) return;
  rectPatchInstalled = true;
  Element.prototype.getClientRects = function () {
    if (this.hidden || this.style.display === 'none') return [];
    return [{ width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 }];
  };
};

const installAbortTimeoutRecorder = () => {
  abortTimeoutLog = [];
  if (abortWrapped) return;
  abortWrapped = true;
  // The mock fetch ignores the signal entirely, so a lightweight stand-in is
  // enough — and avoids real 15s timers leaked by native AbortSignal.timeout.
  globalThis.AbortSignal.timeout = ms => {
    abortTimeoutLog.push(ms);
    return { aborted: false };
  };
};

const installFetchMock = () => {
  fetchCallLog = [];
  fetchHeld = [];
  fetchHoldEnabled = false;
  fetchResponder = null;
  const fetchMock = vi.fn((url, options) => {
    const call = { url: String(url), options, at: Date.now() };
    fetchCallLog.push(call);
    if (fetchHoldEnabled) {
      return new Promise((resolve, reject) => {
        fetchHeld.push({ resolve, reject, call });
      });
    }
    const responder = fetchResponder || defaultResponder;
    return Promise.resolve(responder(call));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/**
 * Record listeners the script attaches during import + the waitPageLoaded
 * microtask window (yt-navigate-start/finish, message, maybe DOMContentLoaded)
 * so cleanup can detach every instance before the next import. Only the
 * script's own event types are recorded — never vitest/jsdom internals.
 *
 * Loads ACCUMULATE: a test may call loadNoview() more than once (e.g. to
 * compare MODE configs), and each instance's listeners must survive until
 * cleanup() drains the shared list — resetting here would orphan the earlier
 * instance, which would then keep processing fixtures in later tests.
 */
const SCRIPT_EVENT_TYPES = new Set(['yt-navigate-start', 'yt-navigate-finish', 'message', 'DOMContentLoaded']);
let capturedListeners = [];

const captureScriptListeners = () => {
  const wrap = target => {
    const original = target.addEventListener.bind(target);
    target.addEventListener = (type, listener, options) => {
      if (SCRIPT_EVENT_TYPES.has(type)) {
        capturedListeners.push({ target, type, listener, options });
      }
      return original(type, listener, options);
    };
    return () => {
      target.addEventListener = original;
    };
  };
  const unwrapWindow = wrap(window);
  const unwrapDocument = wrap(document);
  return () => {
    unwrapWindow();
    unwrapDocument();
  };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/**
 * Import (or re-import) the userscript with optional seeded storage values.
 * Returns handles for styles and the captured sentinel registration.
 */
export const loadNoview = async ({ env = {} } = {}) => {
  installManagerGlobals();
  installSentinelStub();
  installIntersectionObserverStub();
  patchClientRects();
  installAbortTimeoutRecorder();
  installFetchMock();
  for (const [key, value] of Object.entries(env)) gmStore.set(key, value);
  if (mathRandomSpy) mathRandomSpy.mockRestore();
  mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  if (intervalSpy) intervalSpy.mockRestore();
  intervalSpy = vi.spyOn(globalThis, 'setInterval');
  loadSeq += 1;

  const unwrap = captureScriptListeners();
  vi.resetModules();
  try {
    await import(SCRIPT_SPECIFIER);
    await flushMicrotasks();
    // waitPageLoaded() resolves via DOMContentLoaded only when readyState is
    // still 'loading'; cover that case explicitly.
    if (sentinelCalls.length === 0) {
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushMicrotasks();
    }
  } finally {
    unwrap();
  }

  return {
    styles: () => [...addedStyles],
    sentinelCalls: () => [...sentinelCalls],
    intervalCalls: () => (intervalSpy?.mock.calls ?? []).map(args => [...args])
  };
};

/** Unique per load (and per n) so stale cross-test postMessages can't collide. */
export const vid = n => String(loadSeq * 1000 + n).padStart(11, '0');

const oldCardData = ({ views, channelId }) => ({
  ...(views ? { viewCountText: { simpleText: views } } : {}),
  ...(channelId
    ? { owner: { navigationEndpoint: { browseEndpoint: { browseId: channelId } } } }
    : {})
});

const buildCard = (card, id) => {
  const hidden = card.hidden ? ' hidden' : '';
  const anchor = `<a href="${card.href}">video</a>`;
  if (card.type === 'new') {
    return `
      <ytd-rich-item-renderer id="${id}"${hidden}>
        <yt-lockup-view-model>${anchor}</yt-lockup-view-model>
      </ytd-rich-item-renderer>`;
  }
  const badge = card.badge ? '<span class="badge" aria-label="New"></span>' : '';
  return `
    <ytd-rich-item-renderer id="${id}"${hidden}>
      <div id="dismissible">${badge}</div>
      ${anchor}
    </ytd-rich-item-renderer>`;
};

const attachOldData = (element, card) => {
  if (card.type === 'new') return;
  const dismissible = element.querySelector('#dismissible');
  dismissible.__dataHost = { __data: { data: oldCardData(card) } };
};

/**
 * Replace the page with an allowed home container holding video cards.
 * card: {
 *   href      – anchor URL (required)
 *   type      – 'old' (dismissible + DOM view count) or 'new' (yt-lockup-view-model, API path)
 *   views     – old cards: viewCountText.simpleText; omit for the API-fallback path
 *   badge     – old cards: render .badge[aria-label="New"]
 *   channelId – old cards: owner browseId (allowlist tests)
 *   hidden    – render the card with the [hidden] attribute
 * }
 * Returns the card elements (ids: c0, c1, ...).
 */
export const installPage = ({ cards = [] } = {}) => {
  document.body.innerHTML = `
    <ytd-browse page-subtype="home" id="home">
      <div id="contents">${cards.map((card, i) => buildCard(card, `c${i}`)).join('')}</div>
    </ytd-browse>`;
  return cards.map((card, i) => {
    const element = document.getElementById(`c${i}`);
    attachOldData(element, card);
    return element;
  });
};

/** Append one more card to the current page (keeps already-processed cards intact). */
export const addCard = card => {
  const index = document.querySelectorAll('#contents > ytd-rich-item-renderer').length;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildCard(card, `c${index}`).trim();
  const element = wrapper.firstElementChild;
  document.getElementById('contents').appendChild(element);
  attachOldData(element, card);
  return element;
};

/** Re-attach dismissible data after mutating an old card's options in place. */
export const updateOldCardData = (element, options) => {
  const dismissible = element.querySelector('#dismissible');
  dismissible.__dataHost = { __data: { data: oldCardData(options) } };
};

export const navigateStart = () => window.dispatchEvent(new window.Event('yt-navigate-start'));
export const navigateFinish = () => window.dispatchEvent(new window.Event('yt-navigate-finish'));
export const navigate = () => {
  navigateStart();
  navigateFinish();
};

export const receivedMetadata = ({ viewCount = '5000', channelIDs = null, author = 'Peer', isLive = false, isUpcoming = false } = {}) => ({
  channelIDs,
  author,
  isLive,
  isUpcoming,
  viewCount
});

/** Deliver a peer-instance payload synchronously (bypasses jsdom postMessage queuing). */
export const dispatchReceived = (videoID, metadata) => {
  window.dispatchEvent(new window.MessageEvent('message', {
    data: { type: 'youtube-noview:video-metadata-received', videoID, metadata }
  }));
};

export const dispatchRequested = videoID => {
  window.dispatchEvent(new window.MessageEvent('message', {
    data: { type: 'youtube-noview:video-metadata-requested', videoID }
  }));
};

export const fetchCalls = () => [...fetchCallLog];
export const abortTimeouts = () => [...abortTimeoutLog];

/** Make subsequent fetches hang until releaseFetches() (concurrency tests). */
export const holdFetches = () => {
  fetchHoldEnabled = true;
};

/** Resolve every held fetch with the default success payload (or a custom builder). */
export const releaseFetches = (builder = defaultResponder) => {
  const pending = fetchHeld.splice(0);
  fetchHoldEnabled = false;
  for (const entry of pending) entry.resolve(builder(entry.call));
  return pending.length;
};

/** Override the auto-responder: fn(call) => response-like | 'hang'. Pass null to reset. */
export const setResponder = fn => {
  fetchResponder = fn;
};

export const lastObserver = () => ioInstances[ioInstances.length - 1];

/** Fire the intersection callback for an element the script is observing. */
export const intersect = element => {
  const io = ioInstances.find(instance => instance.targets.has(element));
  if (!io) throw new Error('element is not being observed');
  io.callback([{ target: element, isIntersecting: true, intersectionRatio: 1, time: Date.now() }], io);
};

/** Advance fake timers (and flush microtasks) until condition() holds. */
export const pump = async (condition, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('pump timed out waiting for condition');
    await vi.advanceTimersByTimeAsync(25);
  }
};

/** Await until n elements carry the data-noview_views processed-marker. */
export const pumpProcessed = async (n, timeout = 5000) => {
  await pump(() => document.querySelectorAll('[data-noview_views]').length >= n, timeout);
};

export const cleanup = () => {
  for (const { target, type, listener, options } of capturedListeners || []) {
    target.removeEventListener(type, listener, options);
  }
  capturedListeners = [];
  document.body.innerHTML = '';
  mathRandomSpy?.mockRestore();
  mathRandomSpy = null;
  intervalSpy?.mockRestore();
  intervalSpy = null;
  fetchResponder = null;
  fetchHoldEnabled = false;
  fetchHeld = [];
  vi.unstubAllGlobals();
};
