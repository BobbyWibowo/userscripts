// ==UserScript==
// @name         YouTube - Hide force-pushed low-view videos
// @namespace    https://github.com/BobbyWibowo
// @version      1.1.8
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
      'ytd-compact-video-renderer:has(#dismissible ytd-thumbnail img[src])',
      'ytd-rich-item-renderer:has(#dismissible ytd-thumbnail img[src])'
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
      display: none;
    }
  `);

  if (!CONFIG.DISABLE_STYLES) {
    GM_addStyle(/*css*/`
      [data-noview_allowed_channel] #metadata-line span:nth-last-child(2 of .inline-metadata-item) {
        font-style: italic;
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

  const handleVideoUpdate = event => {
    const video = event.target.closest(CONFIG.SELECTORS_VIDEO);
    if (video?.dataset.noview_threshold_unmet) {
      logDebug(`Resetting old statuses (${video.dataset.noview_views} <= ${video.dataset.noview_threshold_unmet})`,
        video);
      delete video.dataset.noview_threshold_unmet;
      delete video.dataset.noview_views;
    }
  };

  const doVideo = element => {
    if (!isPageAllowed) {
      return false;
    }

    const dismissible = element.querySelector('#dismissible');
    if (!dismissible) {
      return false;
    }

    // Listen to this event to handle dynamic update (during page navigation).
    element.addEventListener('yt-enable-lockup-interaction', handleVideoUpdate);

    if (CONFIG.ALLOWED_CHANNEL_IDS.length) {
      delete element.dataset.noview_allowed_channel;

      const channelId = dismissible.__dataHost?.__data?.data?.owner?.navigationEndpoint?.browseEndpoint?.browseId ||
        dismissible.__dataHost?.__data?.data?.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
      if (channelId) {
        if (CONFIG.ALLOWED_CHANNEL_IDS.includes(channelId)) {
          logDebug(`Ignoring video from an allowed channel (${channelId})`, element);
          element.dataset.noview_allowed_channel = channelId;
          return false;
        }
      } else {
        logDebug('Unable to access owner data', element);
      }
    }

    let views = dismissible.__dataHost?.__data?.data?.viewCountText?.simpleText;
    if (!views) {
      logDebug('Unable to access views data', element);
      return false;
    }

    const digits = views.match(/\d/g);
    if (digits === null) {
      // To support any locales, assume all views string without numbers are only used for 0 views.
      views = 0;
    } else {
      views = Number(digits.join(''));
    }

    let thresholdUnmet = null;

    const isNew = Boolean(dismissible.querySelector('.badge[aria-label="New"]'));
    if (isNew) {
      if (views <= CONFIG.VIEWS_THRESHOLD_NEW) {
        thresholdUnmet = CONFIG.VIEWS_THRESHOLD_NEW;
      }
    } else {
      if (views <= CONFIG.VIEWS_THRESHOLD) {
        thresholdUnmet = CONFIG.VIEWS_THRESHOLD;
      }
    }

    if (thresholdUnmet === null) {
      return false;
    }

    log(`Hid video (${views} <= ${thresholdUnmet})`, element);
    element.dataset.noview_threshold_unmet = thresholdUnmet;
    element.dataset.noview_views = views; // for context with inspect element
    return true;
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    sentinel.on(CONFIG.SELECTORS_VIDEO, element => {
      doVideo(element);
    });
  });
})();
