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

/**
 * Card model: rich-item wrapping yt-lockup-view-model (the dominant live
 * shape on home/watch — the only shapes the preset matches for rich-items).
 * type:'shorts' renders the shorts-shelf inner component
 * ytm-shorts-lockup-view-model-v2 instead (home shorts shelf).
 * Optional badge renders the new-design badge-shape inside
 * yt-content-metadata-view-model; optional channelId attaches a fake
 * componentProps bridge so the script's early allowlist extraction works.
 * View counts come from the fetch mock (setResponder), never from fixtures.
 */
const buildCard = (card, id) => {
  const hidden = card.hidden ? ' hidden' : '';
  const anchor = `<a href="${card.href}">video</a>`;
  if (card.type === 'shorts') {
    return `
    <ytd-rich-item-renderer id="${id}"${hidden}>
      <ytm-shorts-lockup-view-model-v2>${anchor}</ytm-shorts-lockup-view-model-v2>
    </ytd-rich-item-renderer>`;
  }
  const badge = card.badge
    ? '<yt-content-metadata-view-model><span class="badge-shape-wiz__text">New</span></yt-content-metadata-view-model>'
    : '';
  return `
    <ytd-rich-item-renderer id="${id}"${hidden}>
      <yt-lockup-view-model>${anchor}${badge}</yt-lockup-view-model>
    </ytd-rich-item-renderer>`;
};

/**
 * Attach a fake componentProps payload to a card's lockup, mirroring the
 * live structure. Options (combinable except playlist vs viewsText rows):
 * - channelId: bridge at value.metadata.lockupMetadataViewModel.image… →
 *   browseEndpoint.browseId (script's allowlist early-exit);
 * - viewsText: PLAY_ARROW row with that text ("14" exact, "70K" compact);
 * - noViewsRow: contentType VIDEO but no PLAY_ARROW row (C9 false-positive
 *   guard — must fall to API, never be skipped as a playlist);
 * - playlist: contentType LOCKUP_CONTENT_TYPE_PLAYLIST, no PLAY_ARROW row.
 * - dataAsFunction: put the symbol envelope on a FUNCTION data property,
 *   mirroring live home desktop lockups (data = fn with a symbol key) —
 *   the 2026-11-16 regression shape.
 *
 * type:'shorts' always attaches (live shorts cards always carry
 * componentProps), as a plain string-keyed data object with
 * overlayMetadata.secondaryText = viewsText when given — never a symbol
 * envelope, never contentType/contentId. accessibilityText is deliberately
 * misleading ("2.7 million") so tests prove it is not parsed as the count.
 */
const attachLockupPayload = (element, card) => {
  if (card.type === 'shorts') {
    const lockup = element.matches('ytm-shorts-lockup-view-model-v2')
      ? element
      : element.querySelector('ytm-shorts-lockup-view-model-v2');
    if (!lockup) return;
    const overlayMetadata = {
      primaryText: { content: 'Short title' },
      ...(card.viewsText !== undefined
        ? { secondaryText: { content: card.viewsText } }
        : {})
    };
    lockup.componentProps = {
      data: {
        entityId: `shorts_${element.id}`,
        accessibilityText: 'Short title, 2.7 million views - play Short',
        overlayMetadata
      }
    };
    return;
  }
  if (!card.channelId && card.viewsText === undefined && !card.playlist && !card.noViewsRow) return;
  const lockup = element.tagName === 'YT-LOCKUP-VIEW-MODEL'
    ? element
    : element.querySelector('yt-lockup-view-model');
  if (!lockup) return;

  const value = {};
  if (card.playlist) {
    value.contentType = 'LOCKUP_CONTENT_TYPE_PLAYLIST';
    value.contentId = 'PLfixture000000000000000000';
  } else {
    value.contentType = 'LOCKUP_CONTENT_TYPE_VIDEO';
    value.contentId = 'abcdefghijk'; // 11-char video id, as probed live
  }

  const rows = [{ metadataParts: [{ text: { content: 'Channel' } }] }];
  if (card.viewsText !== undefined) {
    rows.push({
      metadataParts: [
        { text: { content: card.viewsText }, leadingIcon: { name: 'PLAY_ARROW_OUTLINED' } },
        { text: { content: '7d ago' } }
      ]
    });
  } else if (card.playlist) {
    rows.push({ metadataParts: [{ text: { content: 'Playlist' } }, { text: { content: 'View full playlist' } }] });
  } else {
    // noViewsRow / channelId-only: channel + age, no PLAY_ARROW row.
    rows.push({ metadataParts: [{ text: { content: '7d ago' } }] });
  }

  const metadata = {
    lockupMetadataViewModel: { metadata: { contentMetadataViewModel: { metadataRows: rows } } }
  };
  if (card.channelId) {
    metadata.lockupMetadataViewModel.image = {
      decoratedAvatarViewModel: {
        rendererContext: {
          commandContext: {
            onTap: { innertubeCommand: { browseEndpoint: { browseId: card.channelId } } }
          }
        }
      }
    };
  }
  value.metadata = metadata;

  const data = card.dataAsFunction ? () => {} : {};
  data[Symbol('bridge')] = { value };
  lockup.componentProps = { data };
};

/**
 * Replace the page with an allowed home container holding video cards.
 * card: {
 *   href        – anchor URL (required)
 *   badge       – render the new-design "New" badge
 *   channelId   – componentProps bridge for the allowlist fast path
 *   viewsText   – PLAY_ARROW row text ("14" exact / "70K" compact) → DOM path
 *   noViewsRow  – contentType VIDEO without a views row (false-positive guard)
 *   playlist    – contentType LOCKUP_CONTENT_TYPE_PLAYLIST, no views row
 *   dataAsFunction – symbol envelope on a function data property (live shape)
 *   type        – 'shorts' renders the shorts-shelf inner component
 *                 (componentProps always attached; viewsText feeds
 *                 overlayMetadata.secondaryText)
 *   hidden      – render the card with the [hidden] attribute
 * }
 * Plain lockups (none of the payload options) have no componentProps → the
 * script resolves them through the API path (fetch mock via setResponder).
 * Returns the card elements (ids: c0, c1, ...).
 */
export const installPage = ({ cards = [] } = {}) => {
  document.body.innerHTML = `
    <ytd-browse page-subtype="home" id="home">
      <div id="contents">${cards.map((card, i) => buildCard(card, `c${i}`)).join('')}</div>
    </ytd-browse>`;
  return cards.map((card, i) => {
    const element = document.getElementById(`c${i}`);
    attachLockupPayload(element, card);
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
  attachLockupPayload(element, card);
  return element;
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
  // Tests navigate with history.pushState; the URL persists across tests in
  // this jsdom environment — reset it so every test boots on the allowed '/'.
  try {
    history.pushState({}, '', '/');
  } catch { /* ignore */ }
  mathRandomSpy?.mockRestore();
  mathRandomSpy = null;
  intervalSpy?.mockRestore();
  intervalSpy = null;
  fetchResponder = null;
  fetchHoldEnabled = false;
  fetchHeld = [];
  vi.unstubAllGlobals();
};
