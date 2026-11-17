// ==UserScript==
// @name         YouTube - Hide force-pushed low-view videos
// @namespace    https://github.com/BobbyWibowo
// @version      1.4.1
// @description  Hide videos matching views thresholds.
// @author       Bobby Wibowo
// @license      MIT
// @match        *://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js#sha256-S8rx06n8uSoJCmTdVlxdMN8x+vDYoC+++ssWvEj4M6s=
// @noframes
// ==/UserScript==

/* global sentinel */

(function () {
  'use strict';

  const _LOG_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });

  const log = (message, ...args) => {
    const prefix = `[${_LOG_TIME_FORMAT.format(Date.now())}]: `;
    if (typeof message === 'string') {
      return console.log(prefix + message, ...args);
    } else {
      return console.log(prefix, message, ...args);
    }
  };

  /** CONFIG **/

  /* It's recommended to edit these values through your userscript manager's storage/values editor.
   * Visit YouTube once after installing the script to allow it to populate its storage with default values.
   * Especially necessary for Tampermonkey to show the script's Storage tab when Advanced mode is turned on.
   */
  const ENV_DEFAULTS = {
    MODE: 'PROD',

    VIEWS_THRESHOLD: 999,
    VIEWS_THRESHOLD_NEW: null, // requires "TEXT_BADGE_NEW" to be set properly depending on your locale
    VIEWS_THRESHOLD_LIVE: null, // based on the livestream's accumulative views count reported by YouTube API

    TEXT_BADGE_NEW: 'New',

    ALLOWED_CHANNEL_IDS: [],

    DISABLE_STYLES: false,
    DISABLE_HIDE_PROCESSING: false,

    // URL pathname patterns.
    ALLOWED_PAGE_PATHS: [],
    SELECTORS_VIDEO: null,
    SELECTORS_BADGE_NEW: null
  };

  /* Hard-coded preset values.
   * Specifying custom values will extend instead of replacing them.
   */
  const PRESETS = {
    // To ensure any custom values will be inserted into array, or combined together if also an array.
    ALLOWED_CHANNEL_IDS: [],

    // URL pathname patterns the script operates on.
    // Matched against location.pathname with queries/fragments ignored.
    ALLOWED_PAGE_PATHS: [
      '/', // home
      '/gaming',
      '/watch'
    ],

    // Keys that starts with "SELECTORS_", and in array, will automatically be converted to single-line strings.
    SELECTORS_VIDEO: [
      'ytd-rich-item-renderer:has(yt-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
      'ytd-item-section-renderer yt-lockup-view-model',
      '#items > ytm-shorts-lockup-view-model-v2',
      'ytd-grid-video-renderer:has(#dismissible)',
      'ytd-player .ytp-suggestion-set',
      'ytd-player .ytp-ce-video.ytp-ce-element-show'
    ],

    SELECTORS_BADGE_NEW: [
      'yt-content-metadata-view-model .badge-shape-wiz__text',
      'yt-thumbnail-overlay-badge-view-model .ytBadgeShapeText',
      'ytm-shorts-lockup-view-model .ytBadgeShapeText'
    ]
  };

  const ENV = {};

  // Store default values.
  for (const key of Object.keys(ENV_DEFAULTS)) {
    const stored = GM_getValue(key);
    if (stored === null || stored === undefined) {
      ENV[key] = ENV_DEFAULTS[key];
      GM_setValue(key, ENV_DEFAULTS[key]);
    } else {
      ENV[key] = stored;
    }
  }

  const _DOCUMENT_FRAGMENT = document.createDocumentFragment();
  const queryCheck = selector => _DOCUMENT_FRAGMENT.querySelector(selector);

  const isSelectorValid = selector => {
    try {
      queryCheck(selector);
    } catch {
      return false;
    }
    return true;
  };

  const CONFIG = {};

  // Extend hard-coded preset values with user-defined custom values, if applicable.
  for (const key of Object.keys(ENV)) {
    if (key.startsWith('SELECTORS_')) {
      const preset = Array.isArray(PRESETS[key]) ? PRESETS[key].join(', ') : (PRESETS[key] || '');
      if (!isSelectorValid(preset)) {
        // Presets are shipped with the script — if they don't validate
        // (e.g. a browser without :has()), there is nothing usable to run.
        console.error(`${key} preset contains invalid selector =`, preset);
        return;
      }
      CONFIG[key] = preset;
      if (ENV[key]) {
        const custom = Array.isArray(ENV[key]) ? ENV[key].join(', ') : ENV[key];
        const combined = `${preset}, ${custom}`;
        if (isSelectorValid(combined)) {
          CONFIG[key] = combined;
        } else {
          // A typo in storage must not kill the whole script — fall back to
          // the preset so hiding keeps working without the custom selectors.
          console.error(
            `${key} custom value contains invalid selector; falling back to preset only. Custom value =`,
            custom
          );
        }
      }
    } else if (Array.isArray(PRESETS[key])) {
      // Copy: pushing custom values must not mutate the preset itself.
      CONFIG[key] = [...PRESETS[key]];
      if (ENV[key]) {
        const customValues = Array.isArray(ENV[key]) ? ENV[key] : ENV[key].split(',').map(s => s.trim());
        CONFIG[key].push(...customValues);
      }
    } else {
      CONFIG[key] = PRESETS[key] || null;
      if (ENV[key] !== null) {
        CONFIG[key] = ENV[key];
      }
    }
  }

  /* Reduce a URL-ish string to a comparable pathname. Used for both stored
   * patterns and location.pathname, so they can only ever match each other:
   * - a full URL pattern (https://host/watch?v=x) loses its origin,
   *   query and fragment — page type is path-only (/watch?v=… is /watch),
   * - percent-decoding applied (malformed sequences kept raw),
   * - one trailing slash dropped (except root), leading slash ensured
   *   ('gaming' → '/gaming'), empty input stays empty (never matches). */
  const normalizePath = raw => {
    let path = String(raw ?? '').trim();
    if (path === '') return '';
    const originMatch = path.match(/^https?:\/\/[^/?#]+(\/.*)?$/);
    if (originMatch) path = originMatch[1] || '/';
    const cut = path.search(/[?#]/);
    if (cut !== -1) path = path.slice(0, cut);
    try {
      path = decodeURIComponent(path);
    } catch {
      // Malformed percent-encoding — keep the raw path.
    }
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '') return '';
    if (!path.startsWith('/')) path = `/${path}`;
    return path;
  };

  const isPathAllowed = pathname => {
    const current = normalizePath(pathname);
    return CONFIG.ALLOWED_PAGE_PATHS.some(raw => {
      const pattern = normalizePath(raw);
      if (!pattern) return false;
      // Root only matches root: a prefix rule for '/' would match everything.
      if (pattern === '/') return current === '/';
      // Segment-boundary prefix: /watch matches /watch and /watch/… but not
      // /watchfoo.
      return current === pattern || current.startsWith(`${pattern}/`);
    });
  };

  let logDebug = () => {};
  if (CONFIG.MODE !== 'PROD') {
    logDebug = log;
    logDebug('CONFIG:', CONFIG);
  }

  /** STYLES **/

  // Styling that must always be enabled for the script's core functionality.
  GM_addStyle(/*css*/`
    [data-noview_threshold_unmet] {
      display: none !important;
    }
  `);

  if (!CONFIG.DISABLE_HIDE_PROCESSING) {
    // Page gating is URL-based, which CSS cannot express — the script marks
    // the current state on <html> (applied in updateAllowedPage below) and
    // the hide rules hang off that attribute.
    GM_addStyle(/*css*/`
      html[data-noview_allowed_page] :is(${CONFIG.SELECTORS_VIDEO}) {
        transition: 0.2s opacity;
      }

      /* Visually hide, while still letting the element occupy the space.
       * To prevent YouTube from infinitely loading more videos. */
      html[data-noview_allowed_page] :is(${CONFIG.SELECTORS_VIDEO}):not([data-noview_views], [data-noview_allowed_channel]) {
        visibility: hidden;
        opacity: 0;
      }
    `);
  }

  if (!CONFIG.DISABLE_STYLES) {
    GM_addStyle(/*css*/`
      [data-noview_allowed_channel] #metadata-line > :nth-child(1 of span),
      [data-noview_allowed_channel] yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow > :nth-last-child(2 of .ytContentMetadataViewModelMetadataText),
      [data-noview_allowed_channel] ytm-shorts-lockup-view-model .shortsLockupViewModelHostOutsideMetadataSubhead > :nth-child(1 of span) {
        font-style: italic !important;
      }

      /* Fix YouTube's home styling when some videos are hidden. */
      ytd-browse[page-subtype="home"] ytd-rich-item-renderer[rendered-from-rich-grid][is-in-first-column],
      ytd-browse[page-subtype="home"] #content.ytd-rich-section-renderer {
        margin-left: calc(var(--ytd-rich-grid-item-margin) / 2) !important;
      }

      ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer {
        padding-left: calc(var(--ytd-rich-grid-item-margin) / 2 + var(--ytd-rich-grid-gutter-margin)) !important;
      }
    `);
  }

  /** UTILS **/

  const waitPageLoaded = () => {
    return new Promise(resolve => {
      if (document.readyState === 'complete' ||
        document.readyState === 'loaded' ||
        document.readyState === 'interactive') {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', resolve);
      }
    });
  };

  class DataCache {
    cache;
    init;
    cacheLimit;

    constructor (init, cacheLimit = 2000) {
      this.cache = {};
      this.init = init;
      this.cacheLimit = cacheLimit;
    }

    getFromCache (key) {
      return this.cache[key];
    }

    setupCache (key) {
      if (!this.cache[key]) {
        this.cache[key] = {
          ...this.init(),
          lastUsed: Date.now()
        };

        if (Object.keys(this.cache).length > this.cacheLimit) {
          const oldest = Object.entries(this.cache).reduce((a, b) => a[1].lastUsed < b[1].lastUsed ? a : b);
          delete this.cache[oldest[0]];
        }
      }

      return this.cache[key];
    }

    cacheUsed (key) {
      if (this.cache[key]) this.cache[key].lastUsed = Date.now();

      return !!this.cache[key];
    }
  }

  const isPartialElementInViewport = element => {
    // display:none (inline, [hidden], or stylesheet — e.g. our own
    // threshold-unmet rule) yields a 0×0 rect at the origin, which would
    // otherwise pass the intersection math below. Visibility-hidden cards
    // still have client rects, so they keep counting as in-viewport.
    if (!element.getClientRects().length) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
    const horzInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);

    return (vertInView && horzInView);
  };

  let intersectionObserver = null;

  // True while location.pathname matches ALLOWED_PAGE_PATHS. Gates the
  // sentinel, the ID watcher and reconciliation, and drives the
  // [data-noview_allowed_page] attribute that scopes the hide CSS.
  let allowedPage = false;

  const applyAllowedPageAttribute = () => {
    if (!document.documentElement) return;
    if (allowedPage) {
      document.documentElement.setAttribute('data-noview_allowed_page', '');
    } else {
      document.documentElement.removeAttribute('data-noview_allowed_page');
    }
  };

  const updateAllowedPage = () => {
    allowedPage = isPathAllowed(location.pathname);
    if (document.documentElement) {
      applyAllowedPageAttribute();
    } else {
      // @run-at document-start: <html> is not parsed yet — apply once it is.
      document.addEventListener('DOMContentLoaded', applyAllowedPageAttribute, { once: true });
    }
  };

  // Invariant: allowedPage ⇒ observer non-null. The observer must therefore
  // exist as soon as allowedPage can be true — including at boot, before the
  // first yt-navigate-finish (the sentinel may fire in that window).
  const createIntersectionObserver = () => {
    if (intersectionObserver !== null) intersectionObserver.disconnect();
    // (No `delay` option: it is ignored unless trackVisibility is enabled,
    // which needs IO v2 support and isn't required for a one-shot signal.)
    intersectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          doVideoWrapped(entry.target);
          intersectionObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0 });
  };

  updateAllowedPage();
  if (allowedPage) createIntersectionObserver();

  // Bumped on every SPA navigation. Player requests capture the value when
  // they are enqueued and re-check it after acquiring a throttle slot, so
  // queued work for a page that has already been left is dropped instead of
  // burning Innertube calls. In-flight fetches are not aborted — completing
  // them still fills the shared metadata cache.
  let playerNavGeneration = 0;

  window.addEventListener('yt-navigate-start', event => {
    allowedPage = false;
    applyAllowedPageAttribute();
    playerNavGeneration += 1;

    // Clear previous intersection observer.
    if (intersectionObserver !== null) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
  });

  window.addEventListener('yt-navigate-finish', event => {
    // Determine if the navigated URL is allowed.
    updateAllowedPage();

    if (!allowedPage) {
      logDebug('Page not allowed.');
      return;
    }
    logDebug('Page allowed, waiting for videos\u2026');

    createIntersectionObserver();

    // Reconcile videos already in the DOM. Sentinel only fires on animationstart
    // (once per match), so elements matched while allowedPage was false — e.g.
    // rendered between yt-navigate-start and yt-navigate-finish — would otherwise
    // be skipped forever. Skip nodes already processed to avoid duplicate
    // waitForVideoIDChange intervals.
    for (const element of document.querySelectorAll(CONFIG.SELECTORS_VIDEO)) {
      if (typeof element.dataset.noview_id === 'undefined') {
        processNewElement(element);
      }
    }
  });

  /** MAIN **/

  const emptyMetadata = {
    channelIDs: null,
    author: null,
    isLive: null,
    isUpcoming: null,
    viewCount: null
  };

  // Pace youtubei/v1/player requests. A cold home/watch load can otherwise
  // fan out into dozens of parallel POSTs, which YouTube risk-controls.
  // Same idea as waitForRequestSlot in the sibling account-tool userscripts
  // (bilibili exporter, TweetXer, pixiv-inactive-cleaner): cap in-flight
  // requests and space out request starts. Kept faster than those scripts
  // (500–2000 ms, fully serialized) because unprocessed cards stay
  // visibility:hidden until metadata arrives — multi-second serialization
  // would leave the grid blank for too long.
  const PLAYER_REQUEST_MAX_CONCURRENT = 3;
  const PLAYER_REQUEST_MIN_INTERVAL_MS = 250;
  const PLAYER_REQUEST_JITTER_MS = 150;
  // Without a timeout a hung fetch can occupy a concurrency slot forever;
  // three of those would deadlock all further metadata requests until reload.
  const PLAYER_REQUEST_TIMEOUT_MS = 15_000;

  let playerRequestsInFlight = 0;
  let lastPlayerRequestStartedAt = 0;
  let playerStartGateBusy = false;
  const playerSlotWaiters = [];
  const playerStartWaiters = [];

  // Spaces out request *starts* across concurrent slot holders so they
  // cannot wake from the interval sleep and fire at the same moment.
  const waitPlayerStartSlot = () => new Promise(resolve => {
    const beginInterval = () => {
      if (playerStartGateBusy) {
        playerStartWaiters.push(beginInterval);
        return;
      }
      playerStartGateBusy = true;
      const targetInterval = PLAYER_REQUEST_MIN_INTERVAL_MS +
        Math.floor(Math.random() * PLAYER_REQUEST_JITTER_MS);
      const waitMs = Math.max(0, targetInterval - (Date.now() - lastPlayerRequestStartedAt));
      const finish = () => {
        lastPlayerRequestStartedAt = Date.now();
        playerStartGateBusy = false;
        const next = playerStartWaiters.shift();
        if (next) next();
        resolve();
      };
      if (waitMs > 0) setTimeout(finish, waitMs);
      else finish();
    };
    beginInterval();
  });

  const withPlayerRequestSlot = async (runRequest, requestGeneration = playerNavGeneration) => {
    // Reserve a concurrency slot (callback-style so waiters re-check after
    // each release rather than spinning on an unmodified loop condition).
    await new Promise(resolve => {
      const tryAcquire = () => {
        if (playerRequestsInFlight < PLAYER_REQUEST_MAX_CONCURRENT) {
          // Reserve before sleeping on the start interval so concurrent
          // waiters cannot overshoot the cap after waking.
          playerRequestsInFlight++;
          resolve();
        } else {
          playerSlotWaiters.push(tryAcquire);
        }
      };
      tryAcquire();
    });
    try {
      await waitPlayerStartSlot();
      // Dropped if the user SPA-navigated while this request waited for a
      // slot / start interval — don't fire a call for a page already left.
      if (requestGeneration !== playerNavGeneration) return null;
      return await runRequest();
    } finally {
      playerRequestsInFlight--;
      const next = playerSlotWaiters.shift();
      if (next) next();
    }
  };

  const fetchVideoDataDesktopClient = async videoID => {
    const url = 'https://www.youtube.com/youtubei/v1/player';
    const data = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20230327.07.00'
        }
      },
      videoId: videoID
    };

    try {
      const result = await fetch(url, {
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST',
        signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS)
      });

      if (result.ok) {
        const response = await result.json();
        const newVideoID = response?.videoDetails?.videoId ?? null;
        if (newVideoID !== videoID) {
          return structuredClone(emptyMetadata);
        }

        const channelIds = new Set();
        if (response?.videoDetails?.channelId) {
          channelIds.add(response?.videoDetails?.channelId);
        }

        // To get IDs of parent channel for auto-generated topic channels.
        const subscribeChannelIds = response?.playerConfig?.webPlayerConfig?.webPlayerActionsPorting?.subscribeCommand?.subscribeEndpoint?.channelIds;
        if (subscribeChannelIds?.length) {
          for (const id of subscribeChannelIds) {
            channelIds.add(id);
          }
        }

        const author = response?.videoDetails?.author ?? null;
        const isLive = response?.videoDetails?.isLive ?? null;
        const isUpcoming = response?.videoDetails?.isUpcoming ?? null;
        const viewCount = response?.videoDetails?.viewCount ?? null;

        return {
          channelIDs: channelIds,
          author,
          isLive,
          isUpcoming,
          viewCount
        };
      }
    } catch (e) {}

    return structuredClone(emptyMetadata);
  };

  const videoMetadataCache = new DataCache(() => (structuredClone(emptyMetadata)));

  const waitingForMetadata = [];

  function setupMetadataOnRecieve () {
    const onMessage = event => {
      if (event.data?.type === 'youtube-noview:video-metadata-received') {
        const data = event.data;
        if (data.videoID && data.metadata) {
          const existing = videoMetadataCache.getFromCache(data.videoID);
          const hasUsefulLocal = existing && existing.viewCount !== null;
          // Accept the peer's payload when we have nothing usable locally.
          // A local failure (viewCount null) must not block a peer's success.
          if (!hasUsefulLocal) {
            const metadata = data.metadata;
            const cachedData = videoMetadataCache.setupCache(data.videoID);

            cachedData.channelIDs = metadata.channelIDs;
            cachedData.author = metadata.author;
            cachedData.isLive = metadata.isLive;
            cachedData.isUpcoming = metadata.isUpcoming;
            cachedData.viewCount = metadata.viewCount;
          }

          // Always resolve waiters: the peer's fetch is done either way, and
          // leaving callbacks pending would hang fetchVideoMetadata callers
          // for this videoID until reload.
          const index = waitingForMetadata.findIndex((item) => item.videoID === data.videoID);
          if (index !== -1) {
            const callbacks = waitingForMetadata[index].callbacks;
            waitingForMetadata.splice(index, 1);
            const payload = hasUsefulLocal ? existing : data.metadata;
            callbacks.forEach((callback) => {
              callback(payload);
            });
          }
        }
      } else if (event.data?.type === 'youtube-noview:video-metadata-requested' &&
        !(event.data.videoID in activeRequests)) {
        waitingForMetadata.push({
          videoID: event.data.videoID,
          callbacks: []
        });
      }
    };

    window.addEventListener('message', onMessage);
  }

  const activeRequests = {};

  const fetchVideoMetadata = async videoID => {
    const cachedData = videoMetadataCache.getFromCache(videoID);
    if (cachedData && cachedData.viewCount !== null) {
      return cachedData;
    }

    const waiting = waitingForMetadata.find(item => item.videoID === videoID);
    if (waiting) {
      return new Promise((resolve) => {
        waiting.callbacks.push(metadata => {
          videoMetadataCache.cacheUsed(videoID);
          resolve(metadata);
        });
      });
    }

    try {
      // Capture the navigation generation at enqueue time. If the user
      // SPA-navigates while this request waits for a throttle slot, the
      // generation check inside withPlayerRequestSlot drops it (returns
      // null) instead of firing a call for a page that is already gone.
      const requestGeneration = playerNavGeneration;
      const result = activeRequests[videoID] ?? (async () => {
        window.postMessage({
          type: 'youtube-noview:video-metadata-requested',
          videoID
        }, '*');

        const metadata = await withPlayerRequestSlot(() =>
          fetchVideoDataDesktopClient(videoID), requestGeneration
        ).catch(() => null);

        if (metadata) {
          const videoCache = videoMetadataCache.setupCache(videoID);
          videoCache.channelIDs = metadata.channelIDs;
          videoCache.author = metadata.author;
          videoCache.isLive = metadata.isLive;
          videoCache.isUpcoming = metadata.isUpcoming;
          videoCache.viewCount = metadata.viewCount;

          // Remove this from active requests after it's been dealt with in other places
          setTimeout(() => delete activeRequests[videoID], 500);

          window.postMessage({
            type: 'youtube-noview:video-metadata-received',
            videoID,
            metadata: videoCache
          }, '*');

          return videoCache;
        }

        // Dropped (navigation changed) or failed hard: clear the active
        // marker so a later visit to this video can retry cleanly.
        setTimeout(() => delete activeRequests[videoID], 500);
        const _emptyMetadata = structuredClone(emptyMetadata);
        window.postMessage({
          type: 'youtube-noview:video-metadata-received',
          videoID,
          metadata: _emptyMetadata
        }, '*');
        return _emptyMetadata;
      })();

      activeRequests[videoID] = result;
      return await result;
    } catch (e) { }

    return structuredClone(emptyMetadata);
  };

  const getVideoID = element => {
    const videoLink = (element.matches('a[href]') && element) || element.querySelector('a[href]');
    if (!videoLink) {
      return null;
    }

    const url = videoLink.href;

    let urlObject;
    try {
      urlObject = new URL(url);
    } catch (error) {
      log('Unable to parse URL:', url);
      return null;
    }

    let videoID;
    if (urlObject.searchParams.has('v') && ['/watch', '/watch/'].includes(urlObject.pathname)) {
      videoID = urlObject.searchParams.get('v');
    } else if (urlObject.pathname.match(/^\/embed\/|^\/shorts\/|^\/live\//)) {
      try {
        const id = urlObject.pathname.split('/')[2];
        if (id?.length >= 11) {
          videoID = id.slice(0, 11);
        }
      } catch (e) {
        log('Video ID not valid for:', url);
      }
    }

    return videoID;
  };

  // The matched element may be the lockup itself (watch sidebar) or a
  // wrapper rich-item containing one (home grid).
  // The matched element may be the lockup itself (watch sidebar / gaming
  // shorts shelf) or a wrapper rich-item containing one (home grid,
  // home shorts shelf).
  const findLockupViewModel = element =>
    (element.tagName === 'YT-LOCKUP-VIEW-MODEL' && element) ||
    (element.tagName === 'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2' && element) ||
    element.querySelector('yt-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model');

  // componentProps payload of a card. Desktop lockups wrap it in a
  // symbol-keyed envelope ({[Symbol]: {value}}); on home the envelope sits
  // on a FUNCTION data property (live: data = fn "C" with Symbol(Db)), so
  // functions must be accepted too. The shorts-shelf variant stores a
  // plain string-keyed object directly (no symbols). Null when absent.
  const getLockupPayload = lockupViewModel => {
    const data = lockupViewModel?.componentProps?.data;
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object' && typeof data !== 'function') return null;
    const symbols = Object.getOwnPropertySymbols(data);
    if (symbols.length) return data[symbols[0]]?.value ?? data[symbols[0]];
    // Bare string-keyed object = shorts payload; a symbol-less function is
    // not a payload (fail open to the API).
    return typeof data === 'object' ? data : null;
  };

  // Positive playlist detection — never inferred from a missing views row:
  // a video whose row failed to render must fall through to the API, not be
  // skipped. contentType is a stable English enum in every UI locale; the
  // contentId fallback only fires when contentType is missing/unknown
  // (every probed video contentId was exactly 11 chars, PL/RD never are).
  const isPlaylistPayload = payload => {
    if (!payload) return false;
    if (payload.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') return true;
    if (payload.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') return false;
    return typeof payload.contentId === 'string' &&
      payload.contentId.length > 0 &&
      !/^[A-Za-z0-9_-]{11}$/.test(payload.contentId);
  };

  // Classify a view-count display string into exact / compact / none.
  // Works for both desktop PLAY_ARROW tokens ("70K", "428", "1,234") and
  // shorts secondaryText ("428 views", "2.7M views"). Never feed raw text
  // into viewCount — doVideo parseInt's it, so compact must become a safe
  // synthetic number upstream. Errors toward fail-open (miss a hide) and
  // never toward a false hide:
  // - no ASCII digit → none → API (also routes non-Latin-digit exacts to
  //   the API instead of misreading them as compact);
  // - first token not pure digits after stripping separators → attached
  //   unit ("2.7M", "12万") → compact (decimals only occur with scales);
  // - leading run of pure numeric tokens → space-grouped exact ("1 234");
  // - a following token decides: punctuation ("Mio.", "тыс.") or ≤3 chars
  //   ("M", "K") → unit → compact; pure letters ≥4 ("views", "vues",
  //   "Aufrufe") → label → exact; anything else → compact (safe default).
  // Known limit: labels of ≤3 letters (ja 回視聴, ko 조회수, hi बार) read as
  // units → those shorts' <1000 counts fail open (miss, never false-hide).
  const classifyViewCountText = raw => {
    const text = String(raw ?? '').trim();
    if (!/\d/.test(text)) return { kind: 'none' };
    const tokens = text.split(/\s+/);
    const strip = token => token.replace(/[\s.,'’]/g, '');
    if (!/^\d+$/.test(strip(tokens[0]))) return { kind: 'compact' };
    const run = [];
    let i = 0;
    while (i < tokens.length && /^\d+$/.test(strip(tokens[i]))) {
      run.push(strip(tokens[i]));
      i++;
    }
    if (run.length === 0) return { kind: 'none' };
    const value = Number(run.join(''));
    const next = tokens[i];
    if (next === undefined) return { kind: 'exact', value };
    if (/[^\p{L}]/u.test(next)) return { kind: 'compact' };
    if (next.length <= 3) return { kind: 'compact' };
    if (/^\p{L}+$/u.test(next)) return { kind: 'exact', value };
    return { kind: 'compact' };
  };

  // View count from card props: desktop lockups carry a PLAY_ARROW metadata
  // row (pure token text; row layout differs between home and watch — flatten
  // all parts, never fixed indices); shorts shelves carry
  // overlayMetadata.secondaryText ("428 views" / "2.7M views").
  // The a11y accessibilityText is deliberately NOT used — it expands scales
  // to words ("813 thousand") which naive digit extraction would read as 813.
  const parseCardViews = payload => {
    const rows = payload?.metadata?.lockupMetadataViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows ?? [];
    const playArrow = rows.flatMap(row => row.metadataParts || [])
      .find(candidate => candidate.leadingIcon?.name === 'PLAY_ARROW_OUTLINED');
    if (playArrow) {
      const text = String(playArrow.text?.content ?? '').trim();
      if (text) return classifyViewCountText(text);
    }
    const secondary = payload?.overlayMetadata?.secondaryText?.content;
    if (typeof secondary === 'string' && secondary.trim()) {
      return classifyViewCountText(secondary);
    }
    return { kind: 'none' };
  };

  const getVideoData = async element => {
    const videoID = getVideoID(element);
    if (!videoID) {
      return null;
    }

    const payload = getLockupPayload(findLockupViewModel(element));

    // Playlists are skipped outright: visible (noview_views marker set in
    // finally), no threshold, no fetch — instead of an API fallback.
    if (isPlaylistPayload(payload)) {
      logDebug('Skipped playlist lockup', { videoID, element });
      return { videoID, skipped: true, metadata: {} };
    }

    // Early channel-ID extraction from the lockup bridge — the allowlist
    // fast path, which skips the fetch entirely when the channel is allowed.
    if (payload && CONFIG.ALLOWED_CHANNEL_IDS.length) {
      const channelId = payload?.metadata?.lockupMetadataViewModel?.image
        ?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap
        ?.innertubeCommand?.browseEndpoint?.browseId;
      if (channelId && CONFIG.ALLOWED_CHANNEL_IDS.includes(channelId)) {
        logDebug('Skipped allowed channel', { videoID, channelId, element });
        return {
          videoID,
          allowedChannel: channelId,
          metadata: { channelIDs: new Set([channelId]) }
        };
      }
    }

    // DOM view fast path — skip the API whenever the parsed count already
    // settles every configured threshold (best-effort API reduction).
    if (payload) {
      const parsed = parseCardViews(payload);
      const maxThreshold = Math.max(
        CONFIG.VIEWS_THRESHOLD ?? 0,
        CONFIG.VIEWS_THRESHOLD_NEW ?? 0,
        CONFIG.VIEWS_THRESHOLD_LIVE ?? 0
      );
      if (parsed.kind === 'exact') {
        // An exact count settles the decision when it exceeds every
        // configured threshold (never hidden — isLive/isUpcoming/channel
        // cannot flip that) or when no live/allowlist context is configured
        // (isLive has no DOM source; parent-channel allowlist matching
        // needs API channelIDs).
        if (parsed.value > maxThreshold ||
          (CONFIG.VIEWS_THRESHOLD_LIVE === null && CONFIG.ALLOWED_CHANNEL_IDS.length === 0)) {
          return { videoID, metadata: { viewCount: parsed.value } };
        }
      } else if (parsed.kind === 'compact' && maxThreshold < 1000) {
        // Compact unit string ("70K") ⇒ the count is ≥1000 ⇒ above every
        // configured threshold (all <1000) ⇒ not hidden regardless of
        // isLive/isUpcoming/channel — a synthetic floor keeps doVideo's
        // compare exact. No locale parsing, no API call.
        return { videoID, metadata: { viewCount: 1000 } };
      }
    }

    // API path: count not settled above (exact ≤ maxThreshold under
    // live/allowlist context, compact with a ≥1000 threshold, missing
    // payload/row) — cache → peer message → throttled Innertube.
    logDebug('Fetching metadata from API', { videoID, element });
    const metadata = await fetchVideoMetadata(videoID);
    return { videoID, metadata };
  };

  const isVideoNew = element => {
    // Same lockup detection as getVideoData so wrapper elements (home
    // rich-items) are handled too; no lockup → not "new" (fail-open to the
    // default threshold).
    const lockupViewModel = findLockupViewModel(element);
    if (!lockupViewModel) {
      return false;
    }
    const badges = lockupViewModel.querySelectorAll(CONFIG.SELECTORS_BADGE_NEW);
    // textContent instead of innerText: identical for these simple spans and
    // it also works under jsdom, where innerText is not implemented.
    return Array.from(badges).some(badge => badge?.textContent === CONFIG.TEXT_BADGE_NEW);
  };

  const doVideo = async element => {
    const data = await getVideoData(element);
    if (!data) {
      return false;
    }

    element.dataset.noview_id = data.videoID;

    if (data.skipped) {
      // Playlist: stays visible (noview_views marker is set in finally),
      // never thresholded, never fetched.
      return false;
    }

    if (CONFIG.ALLOWED_CHANNEL_IDS.length) {
      delete element.dataset.noview_allowed_channel;
      if (data.allowedChannel) {
        // Through early check via DOM properties.
        element.dataset.noview_channel_ids = JSON.stringify([data.allowedChannel]);
        element.dataset.noview_allowed_channel = true;
        return false;
      } else if (data.metadata?.channelIDs?.size) {
        // Through metadata fetch from API.
        element.dataset.noview_channel_ids = JSON.stringify([...data.metadata.channelIDs]);
        if (CONFIG.ALLOWED_CHANNEL_IDS.some(id => data.metadata.channelIDs.has(id))) {
          element.dataset.noview_allowed_channel = true;
          return false;
        }
      }
    }

    if (data.metadata?.isUpcoming) {
      return false;
    }

    if (!data.metadata || data.metadata.viewCount === null) {
      logDebug('Unable to access views data', { videoID: data.videoID, element });
      return false;
    }

    const viewCount = parseInt(data.metadata.viewCount);
    let thresholdUnmet = null;

    if (CONFIG.VIEWS_THRESHOLD_LIVE !== null && data.metadata.isLive) {
      if (viewCount <= CONFIG.VIEWS_THRESHOLD_LIVE) {
        thresholdUnmet = CONFIG.VIEWS_THRESHOLD_LIVE;
      }
    } else {
      // Do not look for New badge if thresholds are identical.
      const isNew = CONFIG.VIEWS_THRESHOLD_NEW !== null &&
        (CONFIG.VIEWS_THRESHOLD_NEW !== CONFIG.VIEWS_THRESHOLD) &&
        isVideoNew(element);

      if (isNew) {
        if (viewCount <= CONFIG.VIEWS_THRESHOLD_NEW) {
          thresholdUnmet = CONFIG.VIEWS_THRESHOLD_NEW;
        }
      } else {
        if (viewCount <= CONFIG.VIEWS_THRESHOLD) {
          thresholdUnmet = CONFIG.VIEWS_THRESHOLD;
        }
      }
    }

    if (thresholdUnmet !== null) {
      logDebug(`Hid video (${viewCount} <= ${thresholdUnmet})`, { videoID: data.videoID, element });
      element.dataset.noview_threshold_unmet = thresholdUnmet;
    }

    element.dataset.noview_views = viewCount;
    return true;
  };

  // Shared registry so all watched cards share a single interval instead of
  // leaking one setInterval per element for the lifetime of the page.
  const elementsAwaitingIDChange = new Map(); // element -> last known video ID
  let videoIDWatchInterval = null;

  const reprocessAfterIDChange = element => {
    delete element.dataset.noview_id;
    delete element.dataset.noview_views;
    delete element.dataset.noview_threshold_unmet;
    delete element.dataset.noview_channel_ids;
    delete element.dataset.noview_allowed_channel;
    doVideoWrapped(element);
  };

  const tickVideoIDWatch = () => {
    for (const [element, oldID] of [...elementsAwaitingIDChange]) {
      // Drop elements that are no longer in the document.
      if (!document.body.contains(element)) {
        elementsAwaitingIDChange.delete(element);
        continue;
      }
      // Only do thorough checks while an allowed page is showing; off-URL
      // leftovers keep their entry until the URL is allowed again or the
      // element leaves the document (handled above).
      if (!allowedPage) {
        continue;
      }
      const newID = getVideoID(element);
      if (newID && oldID !== newID) {
        elementsAwaitingIDChange.delete(element);
        reprocessAfterIDChange(element);
      }
    }

    // Stop the shared timer when nothing is watched.
    if (!elementsAwaitingIDChange.size && videoIDWatchInterval !== null) {
      clearInterval(videoIDWatchInterval);
      videoIDWatchInterval = null;
    }
  };

  const waitForVideoIDChange = element => {
    const oldID = element.dataset.noview_id || getVideoID(element);
    if (!oldID) {
      return false;
    }

    elementsAwaitingIDChange.set(element, oldID);
    if (videoIDWatchInterval === null) {
      videoIDWatchInterval = setInterval(tickVideoIDWatch, 1000);
    }
    return true;
  };

  const doVideoWrapped = async element => {
    return doVideo(element)
      .finally(() => {
        if (typeof element.dataset.noview_views === 'undefined') {
          element.dataset.noview_views = '';
        }
        waitForVideoIDChange(element);
      });
  };

  const processNewElement = element => {
    if (isPartialElementInViewport(element)) {
      doVideoWrapped(element);
    } else {
      // If not in viewport, observe intersection.
      intersectionObserver.observe(element);
    }
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    setupMetadataOnRecieve();

    sentinel.on(CONFIG.SELECTORS_VIDEO, element => {
      if (allowedPage) {
        processNewElement(element);
      }
    });
  });
})();
