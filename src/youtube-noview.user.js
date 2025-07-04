// ==UserScript==
// @name         YouTube - Hide force-pushed low-view videos
// @namespace    https://github.com/BobbyWibowo
// @version      1.2.1
// @description  Hide videos matching thresholds, in home page, and watch page's sidebar. CONFIGURABLE!
// @author       Bobby Wibowo
// @license      MIT
// @match        *://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js
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
    VIEWS_THRESHOLD_NEW: 499,
    VIEWS_THRESHOLD_LIVE: null, // based on the livestream's accumulative views count reported by YouTube API

    ALLOWED_CHANNEL_IDS: [],

    DISABLE_STYLES: false,

    SELECTORS_ALLOWED_PAGE: null,
    SELECTORS_VIDEO: null
  };

  /* Hard-coded preset values.
   * Specifying custom values will extend instead of replacing them.
   */
  const PRESETS = {
    // To ensure any custom values will be inserted into array, or combined together if also an array.
    ALLOWED_CHANNEL_IDS: [],

    // Keys that starts with "SELECTORS_", and in array, will automatically be converted to single-line strings.
    SELECTORS_ALLOWED_PAGE: [
      'ytd-browse[page-subtype="home"]:not([hidden])', // home
      'ytd-watch-flexy:not([hidden])' // watch page
    ],
    SELECTORS_VIDEO: [
      'ytd-compact-video-renderer:has(#dimissible)',
      'ytd-rich-item-renderer:has(#dismissible)',
      'yt-lockup-view-model',
      'ytm-shorts-lockup-view-model'
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
      if (Array.isArray(PRESETS[key])) {
        CONFIG[key] = PRESETS[key].join(', ');
      } else {
        CONFIG[key] = PRESETS[key] || '';
      }
      if (ENV[key]) {
        CONFIG[key] += `, ${Array.isArray(ENV[key]) ? ENV[key].join(', ') : ENV[key]}`;
      }
      if (!isSelectorValid(CONFIG[key])) {
        console.error(`${key} contains invalid selector =`, CONFIG[key]);
        return;
      }
    } else if (Array.isArray(PRESETS[key])) {
      CONFIG[key] = PRESETS[key];
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

  let logDebug = () => {};
  if (CONFIG.MODE !== 'PROD') {
    logDebug = log;
    for (const key of Object.keys(CONFIG)) {
      logDebug(`${key} =`, CONFIG[key]);
    }
  }

  /** STYLES **/

  // Styling that must always be enabled for the script's core functionalities.
  GM_addStyle(/*css*/`
    [data-noview_threshold_unmet] {
      display: none !important;
    }

    /* Visually hide, while still letting the element occupy the space.
     * To prevent YouTube from infinitely loading more videos. */
    [data-noview_processing] {
      visibility: none !important;
    }
  `);

  if (!CONFIG.DISABLE_STYLES) {
    GM_addStyle(/*css*/`
      [data-noview_allowed_channel] #metadata-line span:nth-last-child(2 of .inline-metadata-item) {
        font-style: italic !important;
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

  let isPageAllowed = false;

  window.addEventListener('yt-navigate-start', event => {
    isPageAllowed = false;
  });

  window.addEventListener('yt-page-data-updated', event => {
    isPageAllowed = Boolean(document.querySelector(CONFIG.SELECTORS_ALLOWED_PAGE));
    if (isPageAllowed) {
      logDebug('Page allowed, waiting for videos\u2026');
    } else {
      logDebug('Page not allowed.');
    }
  });

  /** MAIN **/

  const emptyMetadata = {
    channelID: null,
    author: null,
    isLive: null,
    isUpcoming: null,
    viewCount: null
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
        method: 'POST'
      });

      if (result.ok) {
        const response = await result.json();
        const newVideoID = response?.videoDetails?.videoId ?? null;
        if (newVideoID !== videoID) {
          return structuredClone(emptyMetadata);
        }

        const channelId = response?.videoDetails?.channelId ?? null;
        const author = response?.videoDetails?.author ?? null;
        const isLive = response?.videoDetails?.isLive ?? null;
        const isUpcoming = response?.videoDetails?.isUpcoming ?? null;
        const viewCount = response?.videoDetails?.viewCount ?? null;
        const playabilityStatus = response?.playabilityStatus?.status ?? null;

        return {
          channelID: channelId,
          author,
          isLive,
          isUpcoming,
          viewCount,
          playabilityStatus
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
        if (data.videoID && data.metadata && !videoMetadataCache.getFromCache(data.videoID)) {
          const metadata = data.metadata;
          const cachedData = videoMetadataCache.setupCache(data.videoID);

          cachedData.channelID = metadata.channelID;
          cachedData.author = metadata.author;
          cachedData.isLive = metadata.isLive;
          cachedData.isUpcoming = metadata.isUpcoming;
          cachedData.viewCount = metadata.viewCount;

          const index = waitingForMetadata.findIndex((item) => item.videoID === data.videoID);
          if (index !== -1) {
            waitingForMetadata[index].callbacks.forEach((callback) => {
              callback(data.metadata);
            });

            waitingForMetadata.splice(index, 1);
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
    if (cachedData && cachedData.channelID !== null) {
      return cachedData;
    }

    let waiting = waitingForMetadata.find(item => item.videoID === videoID);
    if (waiting) {
      return new Promise((resolve) => {
        if (!waiting) {
          waiting = {
            videoID,
            callbacks: []
          };

          waitingForMetadata.push(waiting);
        }

        waiting.callbacks.push(metadata => {
          videoMetadataCache.cacheUsed(videoID);
          resolve(metadata);
        });
      });
    }

    try {
      const result = activeRequests[videoID] ?? (async () => {
        window.postMessage({
          type: 'maze-utils:video-metadata-requested',
          videoID
        }, '*');

        let metadata = await fetchVideoDataDesktopClient(videoID).catch(() => null);

        // Don't retry for LOGIN_REQUIRED, they will never have urls
        if (!metadata || metadata.playabilityStatus !== 'LOGIN_REQUIRED') {
          metadata = await fetchVideoDataDesktopClient(videoID).catch(() => null);
        }

        if (metadata) {
          const videoCache = videoMetadataCache.setupCache(videoID);
          videoCache.channelID = metadata.channelID;
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

  const getVideoData = async element => {
    const videoLink = element.querySelector('a[href]');
    if (!videoLink || !videoLink.href) {
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

    if (urlObject.searchParams.has('v') && ['/watch', '/watch/'].includes(urlObject.pathname)) {
      const videoID = urlObject.searchParams.get('v');
      const metadata = await fetchVideoMetadata(videoID);
      return { videoID, metadata };
    } else if (urlObject.pathname.match(/^\/embed\/|^\/shorts\/|^\/live\//)) {
      try {
        const id = urlObject.pathname.split('/')[2];
        if (id?.length >= 11) {
          const videoID = id.slice(0, 11);
          const metadata = await fetchVideoMetadata(videoID);
          return { videoID, metadata };
        }
      } catch (e) {
        log('Video ID not valid for:', url);
        return null;
      }
    }
  };

  const isVideoNew = element => {
    if (element.tagName === 'YT-LOCKUP-VIEW-MODEL') {
      const badges = Array.from(element.querySelectorAll('yt-content-metadata-view-model .badge-shape-wiz__text'));
      return badges.some(badge => badge?.innerText === 'New');
    } else {
      return Boolean(element.querySelector('#dismissible .badge[aria-label="New"]'));
    }
  };

  const handleVideoUpdate = element => {
    if (element.dataset.noview_threshold_unmet) {
      logDebug(`Resetting old statuses (${element.dataset.noview_views} <= ${element.dataset.noview_threshold_unmet})`,
        element);
      delete element.dataset.noview_threshold_unmet;
      delete element.dataset.noview_views;
    }
  };

  const doVideo = async element => {
    if (!isPageAllowed) {
      return false;
    }

    // Mark video as processing (immediately hide).
    element.dataset.noview_processing = true;

    // Listen to this event to handle dynamic update (during page navigation).
    element.addEventListener('yt-enable-lockup-interaction', () => handleVideoUpdate(element));

    const data = await getVideoData(element);
    if (!data) {
      return false;
    }

    if (CONFIG.ALLOWED_CHANNEL_IDS.length) {
      delete element.dataset.noview_allowed_channel;
      if (data.metadata.channelID !== null) {
        if (CONFIG.ALLOWED_CHANNEL_IDS.includes(data.metadata.channelID)) {
          logDebug(`Ignoring video from an allowed channel (${data.metadata.channelID})`, element);
          element.dataset.noview_allowed_channel = data.metadata.channelID;
          return false;
        }
      }
    }

    if (data.metadata.viewCount === null) {
      logDebug('Unable to access views data', element, data);
      return false;
    }

    let thresholdUnmet = null;

    if (data.metadata.isLive && CONFIG.VIEWS_THRESHOLD_LIVE !== null) {
      if (data.metadata.viewCount <= CONFIG.VIEWS_THRESHOLD_LIVE) {
        thresholdUnmet = CONFIG.VIEWS_THRESHOLD_LIVE;
      }
    } else {
      // Do not look for New badge if thresholds are identical.
      const isNew = (CONFIG.VIEWS_THRESHOLD_NEW !== CONFIG.VIEWS_THRESHOLD) && isVideoNew(element);

      if (isNew) {
        if (data.metadata.viewCount <= CONFIG.VIEWS_THRESHOLD_NEW) {
          thresholdUnmet = CONFIG.VIEWS_THRESHOLD_NEW;
        }
      } else {
        if (data.metadata.viewCount <= CONFIG.VIEWS_THRESHOLD) {
          thresholdUnmet = CONFIG.VIEWS_THRESHOLD;
        }
      }
    }

    if (thresholdUnmet === null) {
      return false;
    }

    log(`Hid video (${data.metadata.viewCount} <= ${thresholdUnmet})`, element);
    element.dataset.noview_threshold_unmet = thresholdUnmet;
    element.dataset.noview_views = data.metadata.viewCount;

    return true;
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    setupMetadataOnRecieve();

    sentinel.on(CONFIG.SELECTORS_VIDEO, async element => {
      await doVideo(element).catch(() => {});
      // Mark video as done processing (unhide).
      delete element.dataset.noview_processing;
    });
  });
})();
