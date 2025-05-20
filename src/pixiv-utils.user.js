// ==UserScript==
// @name         Bobby's Pixiv Utils
// @namespace    https://github.com/BobbyWibowo
// @match        *://www.pixiv.net/*
// @exclude      *://www.pixiv.net/setting*
// @exclude      *://www.pixiv.net/manage*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        window.onurlchange
// @run-at       document-start
// @version      1.5.13
// @author       Bobby Wibowo
// @license      MIT
// @description  7/2/2024, 8:37:14 PM
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
   * Visit Pixiv once after installing the script to allow it to populate its storage with default values.
   * Especially necessary for Tampermonkey to show the script's Storage tab when Advanced mode is turned on.
   */
  const ENV_DEFAULTS = {
    MODE: 'PROD',

    TEXT_EDIT_BOOKMARK: '✏️',
    TEXT_EDIT_BOOKMARK_TOOLTIP: 'Edit bookmark',

    TEXT_TOGGLE_BOOKMARKED: '❤️',
    TEXT_TOGGLE_BOOKMARKED_TOOLTIP: 'Cycle bookmarked display (Right-Click to cycle back)',
    TEXT_TOGGLE_BOOKMARKED_SHOW_ALL: 'Show all',
    TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED: 'Show bookmarked',
    TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED: 'Show not bookmarked',

    SELECTORS_HOME: null,
    SELECTORS_IMAGE: null,
    SELECTORS_IMAGE_TITLE: null,
    SELECTORS_IMAGE_ARTIST_AVATAR: null,
    SELECTORS_IMAGE_ARTIST_NAME: null,
    SELECTORS_IMAGE_CONTROLS: null,
    SELECTORS_IMAGE_BOOKMARKED: null,
    SELECTORS_EXPANDED_VIEW_CONTROLS: null,
    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: null,
    SELECTORS_MULTI_VIEW: null,
    SELECTORS_MULTI_VIEW_CONTROLS: null,
    SELECTORS_FOLLOW_BUTTON_CONTAINER: null,
    SELECTORS_FOLLOW_BUTTON: null,

    DATE_CONVERSION: true,
    DATE_CONVERSION_LOCALES: 'en-GB',
    DATE_CONVERSION_OPTIONS: {
      hour12: true,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    },
    SELECTORS_DATE: null,

    REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME: false,

    SECTIONS_TOGGLE_BOOKMARKED: null,

    ENABLE_KEYBINDS: true,

    UTAGS_INTEGRATION: true,
    UTAGS_BLOCKED_TAGS: null,
    // Instead of merely masking them à la Pixiv's built-in tags mute.
    UTAGS_REMOVE_BLOCKED: false
  };

  /* Hard-coded preset values.
   * Specifying custom values will extend instead of replacing them.
   */
  const PRESETS = {
    // Keys that starts with "SELECTORS_", and in array, will automatically be converted to single-line strings.
    SELECTORS_HOME: '[data-ga4-label="page_root"]',

    SELECTORS_IMAGE: [
      'li[data-ga4-label="thumbnail"]', // home's latest works grid
      '.sc-96f10c4f-0 > li', // home's recommended works grid
      '.jELUak > li', // artist page's grid
      '.iHrRmI > li', // artist page's featured works
      '.ibaIoN > div:has(a[href])', // expanded view's recommended works after pop-in
      '.iwHaa-d > li', // tags page's grid
      '.jClpXN > li', // tags page's grid (novel)
      '.fhUcsb > li', // "newest by all" page
      '.dHJLGd > div', // novels page's ongoing contests
      '.ranking-item', // rankings page
      '._ranking-item', // rankings page (novel)
      '.works-item-illust:has(.thumb:not([src^="data"]))', // mobile
      '.works-item:not(.works-item-illust):has(.thumb:not([src^="data"]))', // mobile (novel)
      '.works-item-novel-editor-recommend:has(.cover:not([style^="data"]))', // mobile's novels page's editor's picks
      '.stacclist > li.illust', // mobile's feed page
      '.buGhFj > li' // mobile's requests page
    ],

    SELECTORS_IMAGE_TITLE: [
      '[data-ga4-label="title_link"]', // home's recommended works grid
      '.gtm-illust-recommend-title', // discovery page's grid
      '.kmUlkw', // tags/bookmarks page's grid
      '.title', // rankings page
      '.illust-info > a[class*="c-text"]' // mobile list view
    ],

    SELECTORS_IMAGE_ARTIST_AVATAR: [
      '[data-ga4-label="user_icon_link"]', // home's recommended works grid
      '.sc-1rx6dmq-1', // expanded view's related works grid
      '.lbFgXO', // tags/bookmarks page's grid
      '._user-icon' // rankings page
    ],

    SELECTORS_IMAGE_ARTIST_NAME: [
      '[data-ga4-label="user_name_link"]', // home's recommended works grid
      '.gtm-illust-recommend-user-name', // expanded view's related works grid
      '.QzTPT', // tags/bookmarks page's grid
      '.user-name', // rankings page
      '.illust-author' // mobile list view
    ],

    SELECTORS_IMAGE_CONTROLS: [
      '.ldNztP', // home's latest/recommended works grid
      '.ppQNN', // discovery page's grid
      '.btqmcy', // artist page's grid
      '.fRrNLv', // artist page's featured works
      '.cgYJXZ', // tags page's grid (novel)
      '.ZBDKi', // "newest by all" page
      '.byWzRq', // expanded view's artist bottom bar (novel)
      '.Yzjmx', // artist page's grid (novel)
      '.jVTssb', // artist page's featured works (novel)
      '.hFAmSK', // novels page
      '.djUdtd > div:last-child', // novels page's editor's picks
      '.gAyuNi', // novels page's ongoing contests
      '._layout-thumbnail', // rankings page
      '.novel-right-contents', // rankings page (novel)
      '.imgoverlay', // mobile's feed page
      '.bookmark', // mobile
      '.hSoPoc' // mobile
    ],

    SELECTORS_IMAGE_BOOKMARKED: [
      '.epoVSE', // desktop
      '.wQCIS', // "newest by all" page
      '._one-click-bookmark.on', // rankings page
      '.works-bookmark-button svg path[fill="#FF4060"]' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_CONTROLS: [
      '.inxZPA', // desktop
      '.work-interactions' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: '.eoaxji > div:has(a[href])',

    SELECTORS_MULTI_VIEW: '[data-ga4-label="work_content"]:has(a[href])',

    SELECTORS_MULTI_VIEW_CONTROLS: '& > .w-full:last-child > .flex:first-child > .flex-row:first-child',

    SELECTORS_FOLLOW_BUTTON_CONTAINER: [
      '.XFDNu', // artist page's header
      '.kIkMnj', // artist hover popup
      '.gSkxA', // expanded view's artist bottom bar
      '.cmowxU', // expanded view's artist sidebar
      '.user-details' // mobile's artist page
    ],

    SELECTORS_FOLLOW_BUTTON: [
      '[data-click-label="follow"]:not([disabled])', // desktop
      '.ui-button' // mobile
    ],

    SELECTORS_DATE: [
      '.dgDuKx', // desktop
      '.kzGSfF', // desktop "updated on" popup
      '.times' // mobile
    ],

    // Selectors must be single-line strings.
    SECTIONS_TOGGLE_BOOKMARKED: [
      // Following page
      {
        selectorParent: '.icUpwV',
        selectorHeader: '.fHQERN',
        selectorImagesContainer: '.fJdNho'
      },
      // Artist page
      {
        selectorParent: '.gqvfWY:not(.bYCbxa)',
        selectorHeader: '.rXWMQ',
        selectorImagesContainer: '.rXWMQ ~ div:not([class])'
      },
      // Artist page's bookmarks tab
      {
        selectorParent: '.gqvfWY.bYCbxa',
        selectorHeader: '.cfUrtF',
        selectorImagesContainer: '.cfUrtF ~ div:not([class])',
        sanityCheck: () => {
          // Skip if in own profile.
          return document.querySelector('a[href*="settings/profile"]');
        }
      },
      // Tags page
      {
        selectorParent: '.icUpwV',
        selectorHeader: '.dlidhK',
        selectorImagesContainer: '.fxjfKC'
      },
      // "Newest by all" page
      {
        selectorParent: '.YXoqY',
        selectorHeader: '.cwGkEl',
        selectorImagesContainer: '.hairtM '
      },
      // Rankings page
      {
        selectorParent: '#wrapper ._unit',
        selectorHeader: '.ranking-menu',
        selectorImagesContainer: '.ranking-items-container'
      },
      // Mobile artist page's illustrations/bookmarks tab, following page, tags page
      {
        selectorParent: '.v-nav-tabs + div:not(.header-buttons), ' +
          '.nav-tab + div, ' +
          '.search-nav-config + div',
        selectorHeader: '.pager-view-nav',
        selectorImagesContainer: '.works-grid-list',
        sanityCheck: () => {
          // Skip if in own profile (intended for bookmarks page).
          return document.querySelector('.ui-button[href*="setting_profile.php"]');
        }
      },
      // Mobile artist page's home tab
      {
        selectorParent: '.work-set > div',
        selectorHeader: '.title-line > div:last-child',
        selectorImagesContainer: '.works-grid-list'
      },
      // Mobile rankings page
      {
        selectorParent: '.ranking-page',
        selectorHeader: '.header-buttons',
        selectorImagesContainer: '.works-grid-list'
      }
    ],

    UTAGS_BLOCKED_TAGS: ['block', 'hide']
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
  let logKeys = Object.keys(CONFIG);
  if (CONFIG.MODE === 'PROD') {
    // In PROD mode, only print some.
    logKeys = ['DATE_CONVERSION', 'REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME', 'ENABLE_KEYBINDS', 'UTAGS_INTEGRATION'];
  } else {
    logDebug = log;
  }

  for (const key of logKeys) {
    log(`${key} =`, CONFIG[key]);
  }

  /** GLOBAL UTILS **/

  const addPageDateStyle = /*css*/`
  .bookmark-detail-unit .meta {
    display: block;
    font-size: 16px;
    font-weight: bold;
    color: inherit;
    margin-left: 0;
    margin-top: 10px;
  }
  `;

  const convertDate = (element, fixJapanTime = false) => {
    // Support "updated on" popups
    const updatedOnRegexes = [
      /(^Image updated on )(.*)$/i // EN
    ];

    let prefix = '';
    let date;

    const attr = element.getAttribute('datetime');
    if (attr) {
      date = new Date(attr);
    } else {
      // For pages which have the date display hardcoded to Japan time.
      let dateText = element.innerText;

      for (const regex of updatedOnRegexes) {
        const _match = dateText.match(regex);
        if (_match) {
          dateText = _match[2];
          prefix = _match[1];
          break;
        }
      }

      // For dates hard-coded to Japan locale.
      const match = dateText.match(/^(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})$/);
      if (match) {
        dateText = `${match[2]}-${match[3]}-${match[1]} ${match[4]}`;
      }

      if (fixJapanTime) {
        dateText += ' UTC+9';
      }

      date = new Date(dateText);
    }

    if (!date) {
      return false;
    }

    const timestamp = String(date.getTime());
    if (element.dataset.oldTimestamp === timestamp) {
      return false;
    }

    element.dataset.oldTimestamp = timestamp;
    element.innerText = prefix + date.toLocaleString(CONFIG.DATE_CONVERSION_LOCALES, CONFIG.DATE_CONVERSION_OPTIONS);
    return true;
  };

  /** INTERCEPT EARLY FOR CERTAIN ROUTES **/

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

  const path = location.pathname;

  // Codes beyond this block will not execute for these routes (mainly for efficiency).
  if (path.startsWith('/bookmark_add.php') || path.startsWith('/novel/bookmark_add.php')) {
    if (CONFIG.DATE_CONVERSION) {
      waitPageLoaded().then(() => {
        GM_addStyle(addPageDateStyle);
        const date = document.querySelector('.bookmark-detail-unit .meta');
        if (date) {
          // This page has the date display hardcoded to Japan time without an accompanying timestamp.
          convertDate(date, true);
        }
      });
    }

    log('bookmark_add.php detected. Excluding date conversion, script has terminated early.');
    return;
  }

  /** MAIN UTILS */

  let currentUrl = new URL(window.location.href, window.location.origin).href;
  const notify = (method, url) => {
    const newUrl = new URL(url || window.location.href, window.location.origin).href;
    if (currentUrl !== newUrl) {
      const event = new CustomEvent('detectnavigate');
      window.dispatchEvent(event);
      currentUrl = newUrl;
    }
  };

  if (window.onurlchange === null) {
    window.addEventListener('urlchange', event => {
      notify('urlchange', event.url);
    });
    logDebug('Using window.onurlchange.');
  } else {
    const oldMethods = {};
    ['pushState', 'replaceState'].forEach(method => {
      oldMethods[method] = history[method];
      history[method] = function (...args) {
        oldMethods[method].apply(this, args);
        notify(method, args[2]);
      };
    });

    window.addEventListener('popstate', event => {
      notify(event.type);
    });
    logDebug('Using window.onurlchange polyfill.');
  }

  /** MAIN STYLES **/

  const formatChildSelector = (parentSelector, childSelector) => {
    let child = childSelector;
    if (childSelector.startsWith('&')) {
      child = childSelector.substring(1).trimStart();
    }

    const formatted = [];
    const parents = parentSelector.split(', ');
    for (const parent of parents) {
      formatted.push(`${parent} ${child}`);
    }

    return formatted.join(', ');
  };

  const _formatSelectorsMultiViewControls = () => {
    const multiViews = CONFIG.SELECTORS_MULTI_VIEW.split(', ');
    const multiViewsControls = CONFIG.SELECTORS_MULTI_VIEW_CONTROLS.split(', ');

    const formatted = [];
    for (const parent of multiViews) {
      for (const child of multiViewsControls) {
        formatted.push(formatChildSelector(parent, child));
      }
    }

    return formatted;
  };

  const _SELECTORS_IMAGE_CONTROLS = CONFIG.SELECTORS_IMAGE_CONTROLS.split(', ');

  const _FILTERED_SELECTORS_IMAGE_CONTROLS = _SELECTORS_IMAGE_CONTROLS
    .filter(s => !['._layout-thumbnail', '.novel-right-contents'].includes(s))
    .join(', ');

  const mainStyle = /*css*/`
  .flex:has(+ .pixiv_utils_edit_bookmark_container) {
    flex-grow: 1;
  }

  .ranking-item.muted .pixiv_utils_edit_bookmark_container {
    display: none;
  }

  .byWzRq .pixiv_utils_edit_bookmark,
  .hFAmSK .pixiv_utils_edit_bookmark,
  .gAyuNi .pixiv_utils_edit_bookmark,
  .cgYJXZ .pixiv_utils_edit_bookmark,
  .Yzjmx .pixiv_utils_edit_bookmark {
    margin-top: -26px;
  }

  .pixiv_utils_edit_bookmark {
    color: rgb(245, 245, 245);
    background: rgba(0, 0, 0, 0.5);
    display: block;
    box-sizing: border-box;
    padding: 0px 8px;
    margin-top: 7px;
    margin-right: 2px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 10px;
    line-height: 20px;
    height: 20px;
    cursor: pointer;
    user-select: none;
    position: relative;
    z-index: 1;
  }

  ${CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS.split(', ').map(s => `${s} .pixiv_utils_edit_bookmark`).join(', ')},
  ${_formatSelectorsMultiViewControls().map(s => `${s} .pixiv_utils_edit_bookmark`).join(', ')} {
    font-size: 12px;
    height: 24px;
    line-height: 24px;
    margin-top: 5px;
    margin-right: 7px;
  }

  ._layout-thumbnail .pixiv_utils_edit_bookmark,
  .novel-right-contents .pixiv_utils_edit_bookmark,
  .imgoverlay .pixiv_utils_edit_bookmark {
    position: absolute !important;
    right: calc(50% - 71px);
    bottom: 4px;
    z-index: 2;
  }

  .novel-right-contents .pixiv_utils_edit_bookmark {
    right: 50px;
  }

  .imgoverlay .pixiv_utils_edit_bookmark {
    right: 40px;
    bottom: 15px;
  }

  *:has(> .pixiv_utils_image_artist_container) {
    position: relative !important;
  }

  .pixiv_utils_image_artist_container {
    position: absolute;
    padding: 5px;
    bottom: 0;
    left: 0;
    max-width: calc(100% - 76px);
  }

  .pixiv_utils_image_artist {
    color: rgb(245, 245, 245);
    background: rgba(0, 0, 0, 0.5);
    box-sizing: border-box;
    padding: 0px 8px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 14px;
    line-height: 20px;
    height: 20px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    float: left;
    width: 100%;
  }

  .bXtqby:has(+ .pixiv_utils_toggle_bookmarked_container),
  .eEVUIK:has(+ .pixiv_utils_toggle_bookmarked_container) {
    flex-grow: 1;
    justify-content: flex-end;
  }

  .pixiv_utils_toggle_bookmarked_container {
    text-align: center;
  }

  .pixiv_utils_toggle_bookmarked {
    color: rgb(245, 245, 245);
    background: rgb(58, 58, 58);
    display: inline-block;
    box-sizing: border-box;
    padding: 6px;
    border-radius: 10px;
    font-weight: bold;
    margin-left: 12px;
    cursor: pointer;
    user-select: none;
  }

  .pixiv_utils_toggle_bookmarked:hover {
    text-decoration: none;
  }

  .pixiv_utils_toggle_bookmarked span {
    padding-left: 6px;
  }

  ${_FILTERED_SELECTORS_IMAGE_CONTROLS} {
    display: flex;
    justify-content: flex-end;
  }
  `;

  const mainDateStyle = /*css*/`
  .dqHJfP {
    font-size: 14px !important;
    font-weight: bold;
    color: rgb(214, 214, 214) !important;
  }
  `;

  /** UTAGS INTEGRATION INIT **/

  const mainUtagsStyle = /*css*/`
  :not(#higher_specificity) *:has(+ .pixiv_utils_blocked_image_container) {
    display: none !important;
  }

  .pixiv_utils_blocked_image {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    color: rgb(92, 92, 92);
    min-width: 93px;
    aspect-ratio: 1 / 1;
  }

  .pixiv_utils_blocked_image svg {
    fill: currentcolor;
  }

  .ranking-item .pixiv_utils_blocked_image {
    max-width: 150px;
    margin: 0 auto;
    border: 1px solid rgb(242, 242, 242);
  }

  /* Pixiv's built-in tags mute. */
  .ranking-item.muted .work img {
    filter: brightness(50%);
  }

  .ranking-item.muted .muted-thumbnail .negative {
    position: relative;
    z-index: 1;
    color: rgb(92, 92, 92);
  }

  /* Only use black background on desktop layout. */
  body > div:not(#wrapper) .pixiv_utils_blocked_image,
  body > div:not(#wrapper) .ranking-item.muted .work img {
    background: rgb(0, 0, 0);
  }

  [data-pixiv_utils_blocked] .series-title,
  [data-pixiv_utils_blocked] .tag-container,
  [data-pixiv_utils_blocked] .show-more-creator-works-button,
  [data-pixiv_utils_blocked] .pqkmS, /* desktop: show more creator works button */
  [data-pixiv_utils_blocked] ._illust-series-title-text {
    display: none !important;
  }

  ${CONFIG.SELECTORS_IMAGE_TITLE.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none !important;
  }

  ${CONFIG.SELECTORS_IMAGE_ARTIST_AVATAR.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none !important;
  }

  ${CONFIG.SELECTORS_IMAGE_ARTIST_NAME.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none !important;
  }

  ${_SELECTORS_IMAGE_CONTROLS.map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none !important;
  }

  [data-pixiv_utils_blocked] .pixiv_utils_image_artist_container {
    max-width: calc(100% - 10px);
  }

  [data-pixiv_utils_blocked] .pixiv_utils_image_artist {
    background: none;
    padding: 0;
    width: 0;
  }
  `;

  const SELECTORS_UTAGS = CONFIG.UTAGS_BLOCKED_TAGS.map(s => `[data-utags_tag="${s}"]`).join(', ');
  log('SELECTORS_UTAGS =', SELECTORS_UTAGS);

  const BLOCKED_IMAGE_HTML = /*html*/`
  <div radius="4" class="pixiv_utils_blocked_image">
    <svg viewBox="0 0 24 24" style="width: 48px; height: 48px;">
      <path d="M5.26763775,4 L9.38623853,11.4134814 L5,14.3684211 L5,18 L13.0454155,18 L14.1565266,20 L5,20
  C3.8954305,20 3,19.1045695 3,18 L3,6 C3,4.8954305 3.8954305,4 5,4 L5.26763775,4 Z M9.84347336,4 L19,4
  C20.1045695,4 21,4.8954305 21,6 L21,18 C21,19.1045695 20.1045695,20 19,20 L18.7323623,20 L17.6212511,18
  L19,18 L19,13 L16,15 L15.9278695,14.951913 L9.84347336,4 Z M16,7 C14.8954305,7 14,7.8954305 14,9
  C14,10.1045695 14.8954305,11 16,11 C17.1045695,11 18,10.1045695 18,9 C18,7.8954305 17.1045695,7 16,7 Z
  M7.38851434,1.64019979 L18.3598002,21.3885143 L16.6114857,22.3598002 L5.64019979,2.61148566
  L7.38851434,1.64019979 Z"></path>
    </svg>
  </div>
  `;

  /** MAIN **/

  GM_addStyle(mainStyle);

  if (CONFIG.DATE_CONVERSION) {
    GM_addStyle(mainDateStyle);
  }

  if (CONFIG.UTAGS_INTEGRATION) {
    GM_addStyle(mainUtagsStyle);
  }

  const uuidv4 = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  };

  const waitForIntervals = {};

  const waitFor = (func, element = document) => {
    if (typeof func !== 'function') {
      return false;
    }

    return new Promise((resolve) => {
      let interval = null;
      const find = () => {
        const result = func(element);
        if (result) {
          if (interval) {
            delete waitForIntervals[interval];
            clearInterval(interval);
          }
          return resolve(result);
        }
      };
      find();
      interval = setInterval(find, 100);
      waitForIntervals[interval] = { func, element, resolve };
    });
  };

  const initElementObserver = (element, callback, options = {}) => {
    if (!element || typeof callback !== 'function' || typeof options !== 'object' || !Object.keys(options).length) {
      return false;
    }

    // Skip if already observing.
    if (element.dataset.pixiv_utils_observing) {
      return false;
    }

    if (options.attributes &&
      (!options.attributeFilter || options.attributeFilter.includes('pixiv_utils_observing'))) {
      console.error('initElementObserver cannot be initiated without proper attributes filtering', element);
      return false;
    }

    // Mark as observing.
    element.dataset.pixiv_utils_observing = true;

    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    const observer = new MutationObserver((mutations, observer) => {
      callback.call(this, mutations, observer);
    });

    observer.observe(element, options);
    return observer;
  };

  const editBookmarkButton = (id, isNovel = false) => {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pixiv_utils_edit_bookmark_container';

    const button = document.createElement('a');
    button.className = 'pixiv_utils_edit_bookmark';
    button.innerText = CONFIG.TEXT_EDIT_BOOKMARK;

    if (CONFIG.TEXT_EDIT_BOOKMARK_TOOLTIP) {
      button.title = CONFIG.TEXT_EDIT_BOOKMARK_TOOLTIP;
    }

    if (isNovel) {
      button.href = `https://www.pixiv.net/novel/bookmark_add.php?id=${id}`;
    } else {
      button.href = `https://www.pixiv.net/bookmark_add.php?type=illust&illust_id=${id}`;
    }

    buttonContainer.append(button);
    return buttonContainer;
  };

  const findArtworkUrl = element => {
    return element.querySelector('a[href*="artworks/"]');
  };

  const findIllustUrl = element => {
    return element.querySelector('a[href*="illust_id="]');
  };

  const findNovelUrl = element => {
    return element.querySelector('a[href*="novel/show.php?id="]');
  };

  const findItemData = element => {
    const methods = [
      { func: findArtworkUrl, regex: /artworks\/(\d+)/ },
      { func: findIllustUrl, regex: /illust_id=(\d+)/ },
      { func: findNovelUrl, regex: /novel\/show\.php\?id=(\d+)/, novel: true }
    ];

    const result = {
      id: null,
      novel: false
    };

    for (const method of methods) {
      result.link = method.func(element);
      if (result.link) {
        const match = result.link.href.match(method.regex);
        if (match) {
          result.id = match[1];
          result.novel = Boolean(method.novel);
        }
        break;
      }
    }

    return result;
  };

  // Toggle Bookmarked Modes.
  // 0 = Show all
  // 1 = Show not bookmarked
  // 2 = Show bookmarked
  const _TB_MIN = 0;
  const _TB_MAX = 2;

  const isImageBookmarked = element => {
    return element.querySelector(CONFIG.SELECTORS_IMAGE_BOOKMARKED) !== null;
  };

  const addImageArtist = async element => {
    let userId = null;
    let userName = null;

    if (element.__vue__) {
      const awaited = await waitFor(() => !element.__vue__._props?.item?.notLoaded, element);
      if (!awaited) {
        return false;
      }

      userId = element.__vue__._props.item.user_id;
      userName = element.__vue__._props.item.author_details.user_name;
    } else {
      const reactPropsKey = Object.keys(element).find(k => k.startsWith('__reactProps'));
      if (!reactPropsKey) {
        return false;
      }

      let _key = null;
      ['thumbnail', 'rawThumbnail'].forEach(key => {
        if (element[reactPropsKey].children?.props?.[key]) {
          _key = key;
        }
      });

      if (!_key) {
        return false;
      }

      userId = element[reactPropsKey].children.props[_key].userId;
      userName = element[reactPropsKey].children.props[_key].userName;
    }

    const div = document.createElement('div');
    div.className = 'pixiv_utils_image_artist_container';
    div.innerHTML = /*html*/`
      <a class="pixiv_utils_image_artist" href="https://www.pixiv.net/users/${userId}">${userName}</a>
    `;

    element.append(div);
    return true;
  };

  const doImage = async (element, options = {}) => {
    // Skip if invalid.
    if (!element.querySelector('a[href]')) {
      return false;
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome) {
      if (findNovelUrl(element)) {
        element.style.display = 'none';
        logDebug('Removed novel recommendation from home', element);
        return true;
      }
    }

    // Process new entries in toggled bookmarked sections.
    if (element.closest('[data-pixiv_utils_toggle_bookmarked_section]')) {
      const mode = GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN);
      if (mode === 1) {
        element.style.display = isImageBookmarked(element) ? 'none' : '';
      } else if (mode === 2) {
        element.style.display = isImageBookmarked(element) ? '' : 'none';
      }
    }

    // Skip if edit bookmark button already inserted, unless forced.
    if (element.querySelector('.pixiv_utils_edit_bookmark') && !options.forced) {
      return false;
    }

    // Init MutationObserver for mobile images.
    if (element.dataset.tx) {
      if (!element.dataset.pixiv_utils_last_tx) {
        initElementObserver(element, () => {
          const lastGrid = element.dataset.pixiv_utils_last_grid === 'true';
          if (element.dataset.tx !== element.dataset.pixiv_utils_last_tx ||
            element.classList.contains('grid') !== lastGrid) {
            options.forced = true;
            doImage(element, options);
          }
        }, {
          attributes: true,
          // Monitor class tag to also detect list/grid view change.
          attributeFilter: ['class', 'data-tx']
        });
      }
      element.dataset.pixiv_utils_last_tx = element.dataset.tx;
      element.dataset.pixiv_utils_last_grid = element.classList.contains('grid');
    }

    // Reset blocked status if necessary.
    if (options.forced && element.dataset.pixiv_utils_blocked) {
      delete element.dataset.pixiv_utils_blocked;
      const blockedThumb = element.querySelector('.pixiv_utils_blocked_image_container');
      if (blockedThumb) {
        blockedThumb.remove();
      }
    }

    const oldImageArtist = element.querySelector('.pixiv_utils_image_artist_container');
    if (oldImageArtist) {
      oldImageArtist.remove();
    }

    const data = findItemData(element);
    if (data.id === null) {
      return false;
    }

    let imageControls = null;
    if (data.novel) {
      imageControls = element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS);
    } else {
      // If it's not a novel, assume image controls may be delayed due to still being generated.
      imageControls = await waitFor(() => {
        return element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS);
      }, element);
    }

    if (!imageControls) {
      return false;
    }

    const artistTag = element.querySelector('a[href*="users/"]');
    let hasVisibleArtistTag = Boolean(artistTag);
    if (hasVisibleArtistTag && element.parentOffset !== null) {
      // If the image itself is visible, but its built-in artist tag is not.
      hasVisibleArtistTag = artistTag.offsetParent !== null;
    }

    // Add artist tag if necessary.
    if (!hasVisibleArtistTag &&
      !element.closest('.user-badge .works-horizontal-list') && // never in mobile expanded view's artist bottom bar
      (currentUrl.indexOf('users/') === -1 || // never in artist page (except bookmarks tab)
      (currentUrl.indexOf('users/') !== -1 && currentUrl.indexOf('/bookmarks') !== -1))) {
      await addImageArtist(element);
    }

    const oldEditBookmarkButton = imageControls.querySelector('.pixiv_utils_edit_bookmark_container');
    if (oldEditBookmarkButton) {
      oldEditBookmarkButton.remove();
    }

    imageControls.prepend(editBookmarkButton(data.id, data.novel));
    return true;
  };

  const doMultiView = async (element, options = {}) => {
    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome) {
      if (findNovelUrl(element)) {
        element.parentNode.style.display = 'none';
        logDebug('Removed novel recommendation from home', element);
        return true;
      }
    }

    // Skip if edit bookmark button already inserted.
    if (element.querySelector('.pixiv_utils_edit_bookmark')) {
      return false;
    }

    const multiViewControls = element.querySelector(CONFIG.SELECTORS_MULTI_VIEW_CONTROLS);
    if (!multiViewControls) {
      return false;
    }

    const data = findItemData(element);
    if (data.id !== null) {
      multiViewControls.lastChild.before(editBookmarkButton(data.id, data.novel));
      return true;
    }

    return false;
  };

  const doExpandedViewControls = async element => {
    // Skip if edit bookmark button already inserted.
    if (element.querySelector('.pixiv_utils_edit_bookmark')) {
      return false;
    }

    let id = null;
    let isNovel = false;

    let match = window.location.href.match(/artworks\/(\d+)/);
    if (match && match[1]) {
      id = match[1];
    } else {
      match = window.location.href.match(/novel\/show\.php\?id=(\d+)/);
      if (match && match[1]) {
        id = match[1];
        isNovel = true;
      }
    }

    if (id !== null) {
      element.append(editBookmarkButton(id, isNovel));

      // Re-process expanded view's artist bottom bar.
      const images = document.querySelectorAll(CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE);
      for (const image of images) {
        await doImage(image);
      }

      return true;
    }

    return false;
  };

  const formatToggleBookmarkedButtonHtml = mode => {
    if (mode === 0) {
      return /*html*/`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL}<span>`;
    } else if (mode === 1) {
      return /*html*/`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED}<span>`;
    } else if (mode === 2) {
      return /*html*/`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED}<span>`;
    }
  };

  let toggling = false;
  const toggleBookmarked = (button, parent, header, imagesContainer, rightClick = false) => {
    if (toggling) {
      return false;
    }

    toggling = true;

    let mode = GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN);
    if (rightClick) { mode--; } else { mode++; }
    if (mode > _TB_MAX) { mode = _TB_MIN; } else if (mode < _TB_MIN) { mode = _TB_MAX; }

    button.innerHTML = formatToggleBookmarkedButtonHtml(mode);

    let images = Array.from(imagesContainer.querySelectorAll(CONFIG.SELECTORS_IMAGE));

    // Do not process blocked images if they are already forcefully hidden.
    if (CONFIG.UTAGS_REMOVE_BLOCKED) {
      images = images.filter(image => !image.dataset.pixiv_utils_blocked);
    }

    if (mode === 0) {
      for (const image of images) {
        image.style.display = '';
      }
    } else if (mode === 1) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || isImageBookmarked(image)) {
          image.style.display = 'none';
        } else {
          image.style.display = '';
        }
      }
    } else if (mode === 2) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || !isImageBookmarked(image)) {
          image.style.display = 'none';
        } else {
          image.style.display = '';
        }
      }
    }

    GM_setValue('PREF_TOGGLE_BOOKMARKED_MODE', mode);

    toggling = false;

    return true;
  };

  const doToggleBookmarkedSection = async (element, sectionConfig) => {
    // Skip if this config has a sanity check function, and it passes.
    if (typeof sectionConfig.sanityCheck === 'function' && sectionConfig.sanityCheck()) {
      return false;
    }

    const imagesContainer = element.querySelector(sectionConfig.selectorImagesContainer);
    if (!imagesContainer) {
      return false;
    }

    // Skip if already processed.
    if (element.dataset.pixiv_utils_toggle_bookmarked_section) {
      if (element.dataset.pixiv_utils_toggle_bookmarked_section ===
        imagesContainer.dataset.pixiv_utils_toggle_bookmarked_section) {
        return false;
      }
      logDebug('Refreshing toggle bookmarked section due to images container update', element);
    }

    const header = element.querySelector(sectionConfig.selectorHeader);
    if (!header) {
      return false;
    }

    // Mark as processed.
    const uuid = element.dataset.pixiv_utils_toggle_bookmarked_section || uuidv4();
    element.dataset.pixiv_utils_toggle_bookmarked_section =
      imagesContainer.dataset.pixiv_utils_toggle_bookmarked_section = uuid;

    // Clear old button if it's being refreshed.
    const oldButtonContainer = element.querySelector('.pixiv_utils_toggle_bookmarked_container');
    if (oldButtonContainer) {
      oldButtonContainer.remove();
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pixiv_utils_toggle_bookmarked_container';

    const button = document.createElement('a');
    button.className = 'pixiv_utils_toggle_bookmarked';
    button.innerHTML = formatToggleBookmarkedButtonHtml(GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN));

    if (CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP) {
      button.title = CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP;
    }

    // Left click.
    button.addEventListener('click', event => toggleBookmarked(button, element, header, imagesContainer));

    // Right click.
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      toggleBookmarked(button, element, header, imagesContainer, true);
    });

    buttonContainer.append(button);
    header.append(buttonContainer);
    return true;
  };

  const doUtags = async element => {
    let image = element.closest(CONFIG.SELECTORS_IMAGE);

    let mobile = false;
    if (image) {
      mobile = image.matches('.works-item-illust');
    } else {
      // For mobile images, re-attempt query with some patience.
      image = element.closest('.works-item-illust');
      if (image) {
        mobile = true;
        const awaited = await waitFor(() => image.querySelector('.thumb:not([src^=data])'), image);
        if (!awaited) {
          return false;
        }
      }
    }

    if (image) {
      const data = findItemData(image);
      if (!data.link) {
        return false;
      }

      // Skip if already blocked.
      if (image.dataset.pixiv_utils_blocked) {
        return false;
      }

      image.dataset.pixiv_utils_blocked = true;

      // For mobile, never remove blocked, as it does not behave well with Pixiv's in-place navigation.
      if (CONFIG.UTAGS_REMOVE_BLOCKED && !mobile) {
        image.style.display = 'none';
        return true;
      }

      const blockedThumb = document.createElement('a');
      blockedThumb.className = 'pixiv_utils_blocked_image_container';
      blockedThumb.href = data.link.href;
      blockedThumb.innerHTML = BLOCKED_IMAGE_HTML;

      data.link.after(blockedThumb);

      // Tooltip.
      if (element.dataset.utags_tag === 'hide') {
        image.title = 'Hidden';
      } else {
        // "block" tag and custom tags.
        image.title = 'Blocked';
      }

      return true;
    }

    const multiView = element.closest(CONFIG.SELECTORS_MULTI_VIEW);
    if (multiView) {
      // For multi view artwork, always hide the whole entry instead.
      multiView.parentNode.style.display = 'none';
      logDebug('Removed multi view entry due to UTag', element);
      return true;
    }

    const followButtonContainer = element.closest(CONFIG.SELECTORS_FOLLOW_BUTTON_CONTAINER);
    if (followButtonContainer) {
      const followButton = followButtonContainer.querySelector(CONFIG.SELECTORS_FOLLOW_BUTTON);
      if (followButton) {
        // Cosmetic only. This will not disable Pixiv's built-in "F" keybind.
        followButton.classList.add('disabled');
        followButton.disabled = true;
        // Return early since there will only be one follow button per container.
        return true;
      }
    }

    return false;
  };

  let isHome = false;

  window.addEventListener('detectnavigate', event => {
    const intervals = Object.keys(waitForIntervals);
    for (const interval of intervals) {
      clearInterval(interval);
      waitForIntervals[interval].resolve();
      delete waitForIntervals[interval];
    }
    if (intervals.length > 0) {
      logDebug(`Cleared ${intervals.length} pending waitFor interval(s).`);
    }

    isHome = Boolean(document.querySelector(CONFIG.SELECTORS_HOME));
  });

  /** SENTINEL */

  waitPageLoaded().then(() => {
    isHome = Boolean(document.querySelector(CONFIG.SELECTORS_HOME));

    // Expanded View Controls
    sentinel.on(CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS, element => {
      doExpandedViewControls(element);
    });

    // Images
    sentinel.on([
      CONFIG.SELECTORS_IMAGE,
      CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE
    ], element => {
      doImage(element, { isHome });
    });

    // Multi View Entries
    sentinel.on(CONFIG.SELECTORS_MULTI_VIEW, element => {
      doMultiView(element, { isHome });
    });

    // Toggle Bookmarked Sections
    for (const sectionConfig of CONFIG.SECTIONS_TOGGLE_BOOKMARKED) {
      let configValid = true;
      for (const key of ['selectorParent', 'selectorHeader', 'selectorImagesContainer']) {
        if (!sectionConfig[key] || !isSelectorValid(sectionConfig[key])) {
          console.error(`SECTIONS_TOGGLE_BOOKMARKED contains invalid ${key} =`, sectionConfig[key]);
          configValid = false;
          break;
        }
      }

      if (!configValid) {
        continue;
      }

      sentinel.on(sectionConfig.selectorParent, element => {
        doToggleBookmarkedSection(element, sectionConfig);
      });

      const formattedSelector = formatChildSelector(
        sectionConfig.selectorParent,
        sectionConfig.selectorImagesContainer
      );

      sentinel.on(formattedSelector, element => {
        const parent = element.closest(sectionConfig.selectorParent);
        if (parent && !element.dataset.pixiv_utils_toggle_bookmarked_section) {
          doToggleBookmarkedSection(parent, sectionConfig);
        }
      });
    }

    // Dates
    sentinel.on(CONFIG.SELECTORS_DATE, element => {
      convertDate(element);
    });

    // UTags Integration
    if (CONFIG.UTAGS_INTEGRATION) {
      sentinel.on(SELECTORS_UTAGS, element => {
        doUtags(element);
      });
    }

    if (CONFIG.MODE !== 'PROD') {
      setInterval(() => {
        const intervals = Object.keys(waitForIntervals);
        if (intervals.length > 0) {
          // Debug first pending interval.
          logDebug('waitFor', waitForIntervals[intervals[0]].element);
        }
      }, 1000);
    }
  });

  /** KEYBINDS **/

  if (CONFIG.ENABLE_KEYBINDS) {
    const selectors = {
      editBookmark: CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS
        .split(', ').map(s => `${s} .pixiv_utils_edit_bookmark`).join(', ')
    };

    const onCooldown = {};

    const processKeyEvent = (id, element) => {
      if (!element) {
        return false;
      }

      if (onCooldown[id]) {
        log(`"${id}" keybind still on cooldown.`);
        return false;
      }

      onCooldown[id] = true;
      element.click();
      setTimeout(() => { onCooldown[id] = false; }, 1000);
    };

    document.addEventListener('keydown', event => {
      event = event || window.event;

      // Ignore keybinds when currently focused to an input/textarea/editable element.
      if (document.activeElement &&
        (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) {
        return;
      }

      // "Shift+B" for Edit Bookmark.
      // Pixiv has built-in keybind "B" for just bookmarking.
      if (event.keyCode === 66) {
        if (event.ctrlKey || event.altKey) {
          // Ignore "Ctrl+B" or "Alt+B".
          return;
        }
        if (event.shiftKey) {
          event.stopPropagation();
          const element = document.querySelector(selectors.editBookmark);
          return processKeyEvent('bookmarkEdit', element);
        }
      }
    });

    logDebug('Listening for keybinds.');
  } else {
    logDebug('Keybinds disabled.');
  }
})();
