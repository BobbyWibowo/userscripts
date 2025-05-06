// ==UserScript==
// @name         YouTube - Hide force-pushed low-view videos
// @namespace    https://github.com/BobbyWibowo
// @match        *://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @version      1.0.1
// @author       Bobby Wibowo
// @license      MIT
// @description  06/05/2025 04:44:00 PM
// @require      https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js
// @noframes
// ==/UserScript==

/* global sentinel */

(function () {
  'use strict';

  const _logTime = () => {
    return new Date().toLocaleTimeString([], {
      hourCycle: 'h12',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
      .replaceAll('.', ':')
      .replace(',', '.')
      .toLocaleUpperCase();
  };

  const log = (message, ...args) => {
    const prefix = `[${_logTime()}]: `;
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
    VIEWS_THRESHOLD_NEW: 99,

    SELECTORS_HOME: null,
    SELECTORS_WATCH_PAGE: null,

    SELECTORS_VIDEO: null
  };

  /* Hard-coded preset values.
   * Specifying custom values will extend instead of replacing them.
   */
  const PRESETS = {
    // Keys that starts with "SELECTORS_", and in array, will automatically be converted to single-line strings.
    SELECTORS_HOME: 'ytd-browse[page-subtype="home"]',
    SELECTORS_WATCH_PAGE: 'ytd-watch-flexy',

    SELECTORS_VIDEO: [
      'ytd-compact-video-renderer:has(#dismissible ytd-video-meta-block)',
      'ytd-rich-item-renderer:has(#dismissible ytd-video-meta-block)'
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

  let pageType = null;

  window.addEventListener('yt-navigate-start', event => {
    pageType = null;
    logDebug('Page type cleared.');
  });

  /** MAIN **/

  const doVideo = (element, options = {}) => {
    if (pageType !== 'home' && pageType !== 'watch') {
      return false;
    }

    const dismissible = element.querySelector('#dismissible');
    if (!dismissible) {
      return false;
    }

    let views = dismissible.__dataHost?.__data?.data?.viewCountText?.simpleText;
    if (!views) {
      return false;
    }

    views = views.replace(/[.,]/, ''); // remove separator

    const match = views.match(/^(\d*)/);
    if (!match || !match[1]) {
      return false;
    }

    views = Number(match[1]);

    const isNew = Boolean(dismissible.querySelector('.badge[aria-label="New"]'));
    if (isNew) {
      if (views <= CONFIG.VIEWS_THRESHOLD_NEW) {
        log(`Hid video (${views} <= ${CONFIG.VIEWS_THRESHOLD_NEW})`, element);
        element.style.display = 'none';
      }
    } else {
      if (views <= CONFIG.VIEWS_THRESHOLD) {
        log(`Hid video (${views} <= ${CONFIG.VIEWS_THRESHOLD})`, element);
        element.style.display = 'none';
      }
    }
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    sentinel.on(CONFIG.SELECTORS_HOME, element => {
      pageType = 'home';
      logDebug(`Page type updated to "${pageType}".`);
    });

    sentinel.on(CONFIG.SELECTORS_WATCH_PAGE, element => {
      pageType = 'watch';
      logDebug(`Page type updated to "${pageType}".`);
    });

    sentinel.on(CONFIG.SELECTORS_VIDEO, element => {
      doVideo(element);
    });
  });
})();
