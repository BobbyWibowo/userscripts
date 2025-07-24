// ==UserScript==
// @name         Bobby's Pixiv Utils
// @namespace    https://github.com/BobbyWibowo
// @version      1.6.26
// @description  Compatible with mobile. "Edit bookmark" and "Toggle bookmarked" buttons, publish dates conversion, block AI-generated works, block by Pixiv tags, UTags integration, and more!
// @author       Bobby Wibowo
// @license      MIT
// @match        *://www.pixiv.net/*
// @exclude      *://www.pixiv.net/setting*
// @exclude      *://www.pixiv.net/manage*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        window.onurlchange
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
    SELECTORS_OWN_PROFILE: null,
    SELECTORS_IMAGE: null,
    SELECTORS_IMAGE_TITLE: null,
    SELECTORS_IMAGE_ARTIST_AVATAR: null,
    SELECTORS_IMAGE_ARTIST_NAME: null,
    SELECTORS_IMAGE_CONTROLS: null,
    SELECTORS_IMAGE_BOOKMARKED: null,
    SELECTORS_EXPANDED_VIEW_IMAGE: null,
    SELECTORS_EXPANDED_VIEW_CONTROLS: null,
    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: null,
    SELECTORS_MULTI_VIEW: null,
    SELECTORS_MULTI_VIEW_CONTROLS: null,
    SELECTORS_FOLLOW_BUTTON_CONTAINER: null,
    SELECTORS_FOLLOW_BUTTON: null,
    SELECTORS_RECOMMENDED_USER_CONTAINER: null,
    SELECTORS_TAG_BUTTON: null,

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

    PIXIV_HIGHLIGHTED_TAGS: null,
    PIXIV_HIGHLIGHTED_COLOR: '#32cd32',

    PIXIV_BLOCK_AI: false,
    PIXIV_BLOCKED_TAGS: null,
    // Instead of merely masking them à la Pixiv's built-in tags mute.
    PIXIV_REMOVE_BLOCKED: false,

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

    SELECTORS_OWN_PROFILE: [
      'a[href*="settings/profile"]', // desktop
      '.ui-button[href*="setting_profile.php"]' // mobile
    ],

    SELECTORS_IMAGE: [
      'li[data-ga4-label="thumbnail"]', // home's latest works grid
      '.sc-96f10c4f-0 > li', // home's recommended works grid
      '.bCxfvI > li', // following page's grid
      '.iyMBlR > li', // following page's grid (novel)
      '.eyusRs > div', // user profile popup
      '.jELUak > li', // artist page's grid
      '.blqLzT > li', // artist page's featured works
      '.ibaIoN > div:has(a[href])', // expanded view's recommended works after pop-in
      '.gMVVng > div', // expanded view's other works sidebar
      '.xPzcf > .fVofhy', // illustrations/manga page's daily ranking
      '.hHLaTl > li', // tags page's grid
      '.eTKQDQ .jOuhfn > div', // tags page's users tab
      '.fhUcsb > li', // "newest by all" page
      '.buGhFj > li', // requests page
      '.bkRoSP > li', // manga page's followed works
      '.dHJLGd > div', // novels page's ongoing contests
      '.ranking-item', // rankings page
      '._ranking-item', // rankings page (novel)
      '.works-item-illust:has(.thumb:not([src^="data"]))', // mobile
      '.works-item:not(.works-item-illust):has(.thumb:not([src^="data"]))', // mobile (novel)
      '.works-item-novel-editor-recommend:has(.cover:not([style^="data"]))', // mobile's novels page's editor's picks
      '.stacclist > li.illust' // mobile's feed page
    ],

    SELECTORS_IMAGE_TITLE: [
      '[data-ga4-label="title_link"]', // home's recommended works grid
      '.gtm-illust-recommend-title', // discovery page's grid
      '.gtm-followlatestpage-thumbnail-link', // following page
      '.fNOdSq', // artist/tags page
      '.title', // rankings page
      '.illust-info > a[class*="c-text"]' // mobile list view
    ],

    SELECTORS_IMAGE_ARTIST_AVATAR: [
      '[data-ga4-label="user_icon_link"]', // home's recommended works grid
      '.sc-1rx6dmq-1', // expanded view's related works grid
      '.lbFgXO', // artist/tags page
      '._user-icon' // rankings page
    ],

    SELECTORS_IMAGE_ARTIST_NAME: [
      '[data-ga4-label="user_name_link"]', // home's recommended works grid
      '.gtm-illust-recommend-user-name', // expanded view's related works grid
      '.QzTPT', // artist/tags page
      '.user-name', // rankings page
      '.illust-author' // mobile list view
    ],

    SELECTORS_IMAGE_CONTROLS: [
      '.jPGduJ', // home's latest/recommended works grid
      '.jTSPzA', // following page's grid
      '.XziBq', // following page's grid (novel)
      '.hGKVAM', // discovery page's grid
      '.hLHrVH', // artist page's grid
      '.chJny', // artist page's grid (novel)
      '.fRrNLv', // artist page's featured works
      '.cOEQuT', // artist page's featured works (novel)
      '.ZBDKi', // "newest by all" page
      '.fvFuEP', // requests page
      '.khAYZn', // requests page (novel)
      '.byWzRq', // expanded view's artist bottom bar (novel)
      '.hFAmSK', // novels page
      '.cUooIb', // novels page's followed works
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
      '.bvHYhE', // expanded view
      '.lbkCkj', // artist/tags page
      '.wQCIS', // "newest by all" page
      '._one-click-bookmark.on', // rankings page
      '.works-bookmark-button svg path[fill="#FF4060"]' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_IMAGE: [
      '.cxsjmo', // desktop
      '.illust-details-view' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_CONTROLS: [
      '.gPBXUH', // desktop
      '.work-interactions' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: '.eoaxji > div:has(a[href])',

    SELECTORS_MULTI_VIEW: '[data-ga4-label="work_content"]:has(a[href])',

    SELECTORS_MULTI_VIEW_CONTROLS: '& > .w-full:last-child > .flex:first-child > .flex-row:first-child',

    SELECTORS_FOLLOW_BUTTON_CONTAINER: [
      '.jmgNKO', // artist page's header
      '.kIkMnj', // artist hover popup
      '.gSkxA', // expanded view's artist bottom bar
      '.cmowxU', // expanded view's artist sidebar
      '.user-details' // mobile's artist page
    ],

    SELECTORS_FOLLOW_BUTTON: [
      '[data-click-label="follow"]:not([disabled])', // desktop
      '.ui-button' // mobile
    ],

    SELECTORS_RECOMMENDED_USER_CONTAINER: [
      // home's recommended users sidebar
      '.hSNbaL > .grid > :nth-child(2) .flex-col.gap-8:first-child .flex-row.items-center:not(.mr-auto)',
      '.YXoqY .grid li.list-none', // tags page's users tab
    ],

    SELECTORS_TAG_BUTTON: [
      '.hsAWPs', // artist page
      '.lgNtXn' // illustrations page
    ],

    SELECTORS_DATE: [
      '.dgDuKx', // desktop
      '.kzGSfF', // desktop "updated on" popup
      '.times', // mobile
      '.reupload-info .tooltip-text' // mobile "updated on" popup
    ],

    // Selectors must be single-line strings.
    SECTIONS_TOGGLE_BOOKMARKED: [
      // Following page
      {
        selectorParent: '.buChOd',
        selectorHeader: '.hYPUjr',
        selectorImagesContainer: '.bghEFg'
      },
      // Artist page
      {
        selectorParent: '.eiHtAJ',
        selectorHeader: '.jdzbvg',
        selectorImagesContainer: '.jdzbvg ~ div:not([class])'
      },
      // Artist page's requests tab
      {
        selectorParent: '.fKsmTC > section',
        selectorHeader: '.eGMhPO',
        selectorImagesContainer: '.eGMhPO ~ ul'
      },
      // Artist page's bookmarks tab
      {
        selectorParent: '.buChOd',
        selectorHeader: '.giPitS',
        selectorImagesContainer: '.giPitS ~ div:not([class])',
        sanityCheck: () => {
          // Skip if in own profile.
          return document.querySelector('a[href*="settings/profile"]');
        }
      },
      // Tags page
      {
        selectorParent: '.buChOd',
        selectorHeader: '.dlidhK',
        selectorImagesContainer: '.cmMzCq'
      },
      // Tags page (novel)
      {
        selectorParent: '.buChOd',
        selectorHeader: '.dlidhK',
        selectorImagesContainer: '.dsoOUK'
      },
      // "Newest by all" page
      {
        selectorParent: '.ldgmym > section',
        selectorHeader: '.hYDgvb',
        selectorImagesContainer: '.kDcbyT'
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

    // To ensure any custom values will be inserted into array, or combined together if also an array.
    PIXIV_HIGHLIGHTED_TAGS: [],

    PIXIV_BLOCKED_TAGS: [],

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
    logKeys = [
      'DATE_CONVERSION',
      'REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME',
      'ENABLE_KEYBINDS',
      'PIXIV_HIGHLIGHTED_TAGS',
      'PIXIV_BLOCK_AI',
      'PIXIV_BLOCKED_TAGS',
      'PIXIV_REMOVE_BLOCKED',
      'UTAGS_INTEGRATION',
      'UTAGS_BLOCKED_TAGS',
      'UTAGS_REMOVE_BLOCKED'
    ];
  } else {
    logDebug = log;
  }

  for (const key of logKeys) {
    log(`${key} =`, CONFIG[key]);
  }

  /** GLOBAL UTILS **/

  const addPageDateStyle = /*css*/`
  .bookmark-detail-unit .meta:not([data-pixiv_utils_duplicate_date]) {
    display: none !important;
  }

  .bookmark-detail-unit .meta[data-pixiv_utils_duplicate_date] {
    display: block;
    font-size: 16px;
    font-weight: bold;
    color: inherit;
    margin-left: 0;
    margin-top: 10px;
  }
  `;

  const DATE_FORMAT = new Intl.DateTimeFormat(CONFIG.DATE_CONVERSION_LOCALES, CONFIG.DATE_CONVERSION_OPTIONS);

  const DATE_FORMAT_NO_HMS_OPTIONS = Object.assign({}, CONFIG.DATE_CONVERSION_OPTIONS);
  delete DATE_FORMAT_NO_HMS_OPTIONS.hour12;
  delete DATE_FORMAT_NO_HMS_OPTIONS.hourCycle;
  delete DATE_FORMAT_NO_HMS_OPTIONS.hour;
  delete DATE_FORMAT_NO_HMS_OPTIONS.minute;
  delete DATE_FORMAT_NO_HMS_OPTIONS.second;

  const DATE_FORMAT_NO_HMS = new Intl.DateTimeFormat(CONFIG.DATE_CONVERSION_LOCALES, DATE_FORMAT_NO_HMS_OPTIONS);

  const convertDate = (element, fixJapanTime = false) => {
    // Support "updated on" popups
    const updatedOnRegexes = [
      /(^Image updated on )(.*)$/i // EN
    ];

    let prefix = '';
    let date;
    let dateHasHMS = true;

    let duplicateDate = element.nextElementSibling;
    if (!duplicateDate || !duplicateDate.dataset.pixiv_utils_duplicate_date) {
      duplicateDate = element.cloneNode(true);
      duplicateDate.dataset.pixiv_utils_duplicate_date = true;
      element.after(duplicateDate);
    }

    const attr = element.getAttribute('datetime');
    if (attr) {
      date = new Date(attr);
    } else {
      let dateText = element.innerText.trim();
      if (!dateText.includes(':')) {
        dateHasHMS = false;
      }

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

      // For pages which have the date display hardcoded to Japan time.
      if (fixJapanTime) {
        dateText += ' UTC+9';
      }

      date = new Date(dateText);
    }

    if (!date) {
      return false;
    }

    const timestamp = date.getTime();
    if (Number.isNaN(timestamp) || duplicateDate.dataset.pixiv_utils_date_timestamp === String(timestamp)) {
      return false;
    }

    if (prefix) {
      duplicateDate.dataset.pixiv_utils_date_prefix = prefix;
    }

    let dateString = '';
    if (dateHasHMS) {
      dateString = DATE_FORMAT.format(date);
    } else {
      dateString = DATE_FORMAT_NO_HMS.format(date);
    }

    duplicateDate.dataset.pixiv_utils_date_timestamp = timestamp;
    duplicateDate.innerHTML = prefix + dateString;
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

  // NOTE Keep in sync with SELECTORS_IMAGE (parent selector).
  const SELECTORS_IMAGE_CONTAINER_SIMPLIFIED = [
    '.eyusRs', // user profile popup
    '.gMVVng' // expanded view's other works sidebar
  ].join(', ');

  // NOTE Keep in sync with SELECTORS_IMAGE.
  const SELECTORS_IMAGE_SMALL = [
    '.iyMBlR > li' // following page's grid (novel)
  ].join(', ');

  const SELECTORS_IMAGE_MOBILE = '.works-item';

  const PIXIV_HIGHLIGHTED_TAGS_FORMATTED = [];

  for (const config of CONFIG.PIXIV_HIGHLIGHTED_TAGS) {
    const buildTags = tags => {
      const result = {
        string: [],
        regexp: []
      };
      for (const tag of tags) {
        if (typeof tag === 'string') {
          result.string.push(tag);
        } else if (Array.isArray(tag)) {
          result.regexp.push(new RegExp(tag[0], tag[1] || ''));
        }
      }
      return result;
    };

    const _config = {};

    if (typeof config === 'object' && !Array.isArray(config)) {
      Object.assign(_config, buildTags(config.tags));
      if (typeof config.color === 'string') {
        _config.color = config.color;
      }
    } else {
      Object.assign(_config, buildTags([config]));
    }

    if (_config.string.length || _config.regexp.length) {
      PIXIV_HIGHLIGHTED_TAGS_FORMATTED.push(_config);
    }
  }

  logDebug('PIXIV_HIGHLIGHTED_TAGS_FORMATTED = ', PIXIV_HIGHLIGHTED_TAGS_FORMATTED);
  const PIXIV_HIGHLIGHTED_TAGS_VALIDATED = PIXIV_HIGHLIGHTED_TAGS_FORMATTED.length;

  const PIXIV_BLOCKED_TAGS_STRING = [];
  const PIXIV_BLOCKED_TAGS_REGEXP = [];

  for (const tag of CONFIG.PIXIV_BLOCKED_TAGS) {
    if (typeof tag === 'string') {
      PIXIV_BLOCKED_TAGS_STRING.push(String(tag));
    } else if (Array.isArray(tag)) {
      PIXIV_BLOCKED_TAGS_REGEXP.push(new RegExp(tag[0], tag[1] || ''));
    }
  }

  logDebug('PIXIV_BLOCKED_TAGS_STRING = ', PIXIV_BLOCKED_TAGS_STRING);
  logDebug('PIXIV_BLOCKED_TAGS_REGEXP = ', PIXIV_BLOCKED_TAGS_REGEXP);
  const PIXIV_BLOCKED_TAGS_VALIDATED = PIXIV_BLOCKED_TAGS_STRING.length || PIXIV_BLOCKED_TAGS_REGEXP.length;

  const SELECTORS_UTAGS = CONFIG.UTAGS_BLOCKED_TAGS.map(s => `[data-utags_tag="${s}"]`).join(', ');
  logDebug('SELECTORS_UTAGS =', SELECTORS_UTAGS);

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

  const SELECTORS_IMAGE_HIGHLIGHTED =
    ':not(.page-count, [size="16"], [size="24"]):has(> img:not([src^="data"]))::after';

  // NOTE Keep in sync with SELECTORS_IMAGE_CONTROLS.
  // Strictly for tweaking button positioning, which only some will need.
  const SELECTORS_IMAGE_CONTROLS_NOVEL = [
    '.XziBq', // following page's grid (novel)
    '.chJny', // artist page's grid (novel)
    '.khAYZn', // requests page (novel)
    '.byWzRq', // expanded view's artist bottom bar (novel)
    '.hFAmSK', // novels page
    '.cUooIb', // novels page's followed works
    '.gAyuNi' // novels page's ongoing contests
  ];

  const SELECTORS_TOGGLE_BOOKMARKED_HEADER = [
    '.hyniYI', // general page
    '.eYXksB', // artist page's requests tab
    '.gnbCrF', // tags page (novel)
    '.eEVUIK' // "newest by all" page
  ];

  const mainStyle = /*css*/`
  .flex:has(+ .pixiv_utils_edit_bookmark_container) {
    flex-grow: 1;
  }

  .ranking-item.muted .pixiv_utils_edit_bookmark_container {
    display: none;
  }

  :is(${SELECTORS_IMAGE_CONTROLS_NOVEL.join(', ')}) .pixiv_utils_edit_bookmark {
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

  :is(${CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS}) .pixiv_utils_edit_bookmark,
  :is(${_formatSelectorsMultiViewControls().join(', ')}) .pixiv_utils_edit_bookmark {
    font-size: 12px;
    height: 24px;
    line-height: 24px;
    margin-top: 5px;
    margin-right: 7px;
  }

  :is(._layout-thumbnail, .novel-right-contents, .imgoverlay) .pixiv_utils_edit_bookmark {
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

  :not(#higher_specificity) :has(> .pixiv_utils_image_artist_container) {
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

  :is(${SELECTORS_TOGGLE_BOOKMARKED_HEADER.join(', ')}):has(+ .pixiv_utils_toggle_bookmarked_container) {
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

  [data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    box-shadow: inset 0 0 0 3px var(--pixiv_utils_highlight_color, ${CONFIG.PIXIV_HIGHLIGHTED_COLOR});
    border-radius: 8px;
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
  }

  :is(${SELECTORS_IMAGE_CONTAINER_SIMPLIFIED}) [data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED},
  :is(${SELECTORS_IMAGE_SMALL})[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED},
  :is(${SELECTORS_IMAGE_MOBILE})[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    box-shadow: inset 0 0 0 2px var(--pixiv_utils_highlight_color, ${CONFIG.PIXIV_HIGHLIGHTED_COLOR});
  }

  /* expanded view's artist bottom bar */
  .eoaxji > div:has(a[href])[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-radius: 4px;
  }

  .eyusRs > div[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED}, /* user profile popup */
  :is(${SELECTORS_IMAGE_MOBILE})[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-radius: 0;
  }

  .eyusRs > div[data-pixiv_utils_highlight]:nth-child(1) ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-bottom-left-radius: 8px;
  }

  .eyusRs > div[data-pixiv_utils_highlight]:nth-child(3) ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-bottom-right-radius: 8px;
  }

  :not(#higher_specificity) :has(+ .pixiv_utils_blocked_image_container) {
    display: none !important;
  }

  .pixiv_utils_blocked_image {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    color: rgb(92, 92, 92);
    min-width: 90px;
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

  .works-item:not(.works-item-illust) .pixiv_utils_blocked_image {
    min-width: 64px;
    max-width: 64px;
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

  [data-pixiv_utils_blocked] :is(.series-title, .tag-container, .show-more-creator-works-button),
  [data-pixiv_utils_blocked] .pqkmS, /* desktop: show more creator works button */
  [data-pixiv_utils_blocked] ._illust-series-title-text {
    display: none !important;
  }

  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_TITLE}) {
    display: none !important;
  }

  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_ARTIST_AVATAR}) {
    display: none !important;
  }

  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_ARTIST_NAME}) {
    display: none !important;
  }

  [data-pixiv_utils_blocked] :is(${_SELECTORS_IMAGE_CONTROLS.join(', ')}) {
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

  [data-pixiv_utils_expanded_view_blocked] :is([role="presentation"], .work-main-image) :is(img, canvas) {
    filter: blur(32px);
  }

  [data-pixiv_utils_expanded_view_blocked] :is([role="presentation"], .work-main-image):hover :is(img, canvas) {
    filter: unset;
  }
  `;

  const SELECTORS_DATE_ORIGINAL = `:is(${CONFIG.SELECTORS_DATE}):not([data-pixiv_utils_duplicate_date])`;

  const mainDateStyle = /*css*/`
  ${SELECTORS_DATE_ORIGINAL} {
    display: none !important;
  }

  :is(${CONFIG.SELECTORS_DATE})[data-pixiv_utils_duplicate_date]:not([data-pixiv_utils_date_prefix]) {
    font-size: 14px !important;
    font-weight: bold !important;
    color: rgb(214, 214, 214) !important;
  }
  `;

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

  const uuidv4 = () => {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  };

  const WAIT_FOR_POLL = 1000; // ms

  const waitForIntervals = {};

  const waitFor = (func, element = document) => {
    if (typeof func !== 'function') {
      return false;
    }

    return new Promise(resolve => {
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
      interval = setInterval(find, WAIT_FOR_POLL);
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

  const findIllustImg = element => {
    return element.querySelector('img[src*="_p0"]');
  };

  const findItemData = (element, tryImg = false) => {
    const methods = [
      { func: findIllustImg, regex: /\/(\d+)_p0/, img: true },
      { func: findArtworkUrl, regex: /artworks\/(\d+)/ },
      { func: findIllustUrl, regex: /illust_id=(\d+)/ },
      { func: findNovelUrl, regex: /novel\/show\.php\?id=(\d+)/, novel: true }
    ];

    const result = {
      id: null,
      novel: false
    };

    for (const method of methods) {
      if (method.img && !tryImg) {
        continue;
      }

      const found = method.func(element);
      if (found) {
        let value = '';
        if (method.img) {
          value = found.src;
          result.img = found;
        } else {
          value = found.href;
          result.link = found;
        }

        const match = value.match(method.regex);
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

  let toggleBookmarkedMode = null;

  const isImageBookmarked = element => {
    return element.querySelector(CONFIG.SELECTORS_IMAGE_BOOKMARKED) !== null;
  };

  const getImagePixivData = async element => {
    const data = {
      title: null,
      ai: null,
      tags: null
    };

    if (element.__vue__) {
      for (const key of ['item', 'illustDetails']) {
        const _data = element.__vue__._props?.[key];
        if (!_data) {
          continue;
        }

        if (key === 'item') {
          const awaited = await waitFor(() => !_data.notLoaded, element);
          if (!awaited) {
            return false;
          }
        }

        data.title = _data.title;
        data.ai = _data.ai_type === 2;
        data.tags = _data.tags;
      }
    } else {
      const reactFiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber'));
      if (reactFiberKey) {
        const MAX_STEPS = 5;

        let step = 0;
        const traverseChild = obj => {
          if (!obj || !obj.memoizedProps) {
            return;
          }

          step++;
          let source = null;

          const props = obj.memoizedProps;
          if (props.tags) {
            source = props;
          } else if (props.content?.thumbnails?.length) {
            source = props.content.thumbnails[0];
          } else if (props.children) {
            let children = props.children;
            if (!Array.isArray(children) || typeof children !== 'object') {
              children = props.children.props?.children;
            }
            if (children) {
              if (!Array.isArray(children)) {
                children = [children];
              }
              for (const child of children) {
                if (child.props?.thumbnail) {
                  source = child.props.thumbnail;
                  break;
                }
              }
            }
          } else {
            for (const key of ['rawThumbnail', 'thumbnail', 'work']) {
              if (props[key]) {
                source = props[key];
                break;
              }
            }
          }

          if (source !== null) {
            data.title = source.title;
            data.ai = source.aiType === 2;
            data.tags = source.tags;
          }

          if (data.tags === null && step < MAX_STEPS) {
            traverseChild(obj.child);
          }
        };

        traverseChild(element[reactFiberKey]);
      }
    }

    if (!data.tags) {
      data.tags = [];
    }

    // Re-map extended tags data.
    data.tags = data.tags.map(tag => typeof tag !== 'string' ? tag.name : tag);

    return data;
  };

  const setImageTitle = (element, options = {}) => {
    let title = '';

    if (options.pixivData.title) {
      title += options.pixivData.title;
    }

    if (options.pixivData.ai) {
      title += '\nAI-generated';
    }

    if (options.pixivData.tags.length) {
      title += `\n${options.pixivData.tags.join(', ')}`;
    }

    if (options.footer) {
      title += `\n${options.footer}`;
    }

    title = title.trim();

    if (title.length) {
      element.title = title.trim();
    }
  };

  const isImageHighlightedByData = data => {
    const result = {
      highlightedTags: [],
      hint: '',
      color: null
    };

    for (const config of PIXIV_HIGHLIGHTED_TAGS_FORMATTED) {
      for (const tag of data.tags) {
        if (config.string?.includes(tag) || config.regexp?.some(t => t.test(tag))) {
          result.highlightedTags.push(tag);
          if (!result.color && config.color) {
            result.color = config.color;
          }
        }
      }
    }

    if (!result.highlightedTags.length) {
      return false;
    }

    if (!result.color) {
      result.color = CONFIG.PIXIV_HIGHLIGHTED_COLOR;
    }

    result.hint = `Tags: ${result.highlightedTags.join(', ')}`;
    return result;
  };

  const doHighlightImage = (element, options = {}) => {
    // Skip if already highlighted.
    if (element.dataset.pixiv_utils_highlight) {
      return false;
    }

    const highlighted = isImageHighlightedByData(options.pixivData);
    if (!highlighted) {
      return false;
    }

    element.dataset.pixiv_utils_highlight = true;

    if (highlighted.color) {
      element.style.setProperty('--pixiv_utils_highlight_color', highlighted.color);
    }

    return highlighted;
  };

  const isImageBlockedByData = data => {
    const result = {
      blockedAI: CONFIG.PIXIV_BLOCK_AI && data.ai,
      blockedTags: [],
      hint: ''
    };

    for (const tag of data.tags) {
      if (PIXIV_BLOCKED_TAGS_STRING.includes(tag) || PIXIV_BLOCKED_TAGS_REGEXP.some(t => t.test(tag))) {
        result.blockedTags.push(tag);
      }
    }

    if (!result.blockedAI && !result.blockedTags.length) {
      return false;
    }

    if (CONFIG.PIXIV_BLOCK_AI && result.blockedAI) {
      result.hint += 'AI-generated';
    }

    if (result.blockedTags.length) {
      result.hint += `\nTags: ${result.blockedTags.join(', ')}`;
    }

    result.hint = result.hint.trim();
    return result;
  };

  const getImageBlockSkipReason = (element, options = {}) => {
    const skipReason = [];

    if (options.isOwnProfile) {
      skipReason.push('In own profile');
    }

    if (options.bookmarked) {
      skipReason.push('Image is bookmarked');
    }

    return skipReason;
  };

  const setImageBlocked = (element, options = {}) => {
    // Skip if already blocked (check for element due to possibility of dynamic update).
    if (element.querySelector('.pixiv_utils_blocked_image_container')) {
      return false;
    }

    element.dataset.pixiv_utils_blocked = true;

    // For mobile, never remove blocked, as it does not behave well with Pixiv's in-place navigation.
    if (options.remove && !options.mobile) {
      element.style.display = 'none';
      return true;
    }

    const blockedThumb = document.createElement('a');
    blockedThumb.className = 'pixiv_utils_blocked_image_container';
    blockedThumb.href = options.link.href;
    blockedThumb.innerHTML = BLOCKED_IMAGE_HTML;

    options.link.after(blockedThumb);

    return true;
  };

  const doBlockImage = async (element, options = {}) => {
    const blockable = isImageBlockedByData(options.pixivData);
    if (!blockable) {
      return false;
    }

    // Do not ever remove in sections known to have display issues.
    let remove = CONFIG.PIXIV_REMOVE_BLOCKED;
    if (element.closest(SELECTORS_IMAGE_CONTAINER_SIMPLIFIED) ||
      element.matches(CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE)) {
      remove = false;
    }

    if (options.skipReason) {
      logDebug(`Image is blockable, but skipped (reason: ${options.skipReason})`, element);
    } else {
      const status = setImageBlocked(element, {
        mobile: element.matches(SELECTORS_IMAGE_MOBILE),
        remove,
        link: options.data.link
      });

      if (status) {
        setImageTitle(element, {
          data: options.data,
          pixivData: options.pixivData,
          footer: `Blocked by:\n${blockable.hint}`
        });
        logDebug(`Image blocked (${blockable.hint.replace('\n', ', ')})`, element);
      }
    }

    return blockable;
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

      for (const key of ['rawThumbnail', 'thumbnail', 'work']) {
        if (element[reactPropsKey].children?.props?.[key]) {
          userId = element[reactPropsKey].children.props[key].userId;
          userName = element[reactPropsKey].children.props[key].userName;
          break;
        }
      }
    }

    if (!userId || !userName) {
      return false;
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

    const data = findItemData(element);
    if (data.id === null) {
      return false;
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome && data.novel) {
      element.style.display = 'none';
      logDebug('Novel recommendation removed from home', element);
      return true;
    }

    // Process new entries in toggled bookmarked sections.
    const bookmarked = isImageBookmarked(element);
    if (element.closest('[data-pixiv_utils_toggle_bookmarked_section]')) {
      if (toggleBookmarkedMode === 1) {
        element.style.display = bookmarked ? 'none' : '';
      } else if (toggleBookmarkedMode === 2) {
        element.style.display = bookmarked ? '' : 'none';
      }
    }

    // Skip if edit bookmark button already inserted, unless forced.
    if (element.querySelector('.pixiv_utils_edit_bookmark') && !options.forced) {
      return false;
    }

    // Init MutationObserver for dynamic images.
    if (element.__vue__) {
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

    // Skip if already blocked, unless forced.
    if (element.dataset.pixiv_utils_blocked) {
      if (options.forced) {
        delete element.dataset.pixiv_utils_blocked;
        const blockedThumb = element.querySelector('.pixiv_utils_blocked_image_container');
        if (blockedThumb) {
          blockedThumb.remove();
        }
      } else {
        return false;
      }
    }

    // Reset other statuses if forced.
    if (options.forced) {
      delete element.title;
      delete element.dataset.pixiv_utils_highlight;
      element.style.removeProperty('--pixiv_utils_highlight_color');
    }

    const pixivData = await getImagePixivData(element);

    // Only block images if not in own profile, and not bookmarked.
    const skipReason = getImageBlockSkipReason(element, { isOwnProfile, bookmarked });

    let blockable = false;
    if (PIXIV_BLOCKED_TAGS_VALIDATED) {
      blockable = await doBlockImage(element, { data, pixivData, skipReason: skipReason.join(', ') });
      if (blockable && !skipReason.length) {
        return true;
      }
    }

    let footer = '';

    if (PIXIV_HIGHLIGHTED_TAGS_VALIDATED) {
      const highlighted = await doHighlightImage(element, { data, pixivData });
      if (highlighted) {
        footer += `Highlighted by:\n${highlighted.hint}`;
      }
    }

    if (blockable) {
      footer += `\nBlockable by:\n${blockable.hint}` +
        `\nSkipped due to:\n${skipReason.join('\n')}`;
    }

    setImageTitle(element, { data, pixivData, footer: footer.trim() });

    // Exit early if in own profile, and not in bookmarks tab.
    if (options.isOwnProfile && currentUrl.indexOf('/bookmarks') === -1) {
      return false;
    }

    // Exit early if in sections where images won't have control buttons.
    if (element.closest(SELECTORS_IMAGE_CONTAINER_SIMPLIFIED)) {
      return false;
    }

    const oldImageArtist = element.querySelector('.pixiv_utils_image_artist_container');
    if (oldImageArtist) {
      oldImageArtist.remove();
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
    if (hasVisibleArtistTag && element.offsetParent !== null) {
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

  const doBlockMultiView = async (element, options = {}) => {
    const blocked = isImageBlockedByData(options.pixivData);
    if (!blocked) {
      return false;
    }

    // For multi view artwork, always hide the whole entry instead.
    element.parentNode.style.display = 'none';
    logDebug(`Multi view entry removed (${blocked.hint})`, element);
    return true;
  };

  const doMultiView = async (element, options = {}) => {
    const data = findItemData(element);
    if (data.id === null) {
      return false;
    }

    const pixivDataSource = element.querySelector('div[data-ga4-label="thumbnail_link"]');
    if (pixivDataSource) {
      const pixivData = await getImagePixivData(pixivDataSource);
      if (pixivData) {
        // Only block images if not bookmarked.
        const skipReason = getImageBlockSkipReason(element, {
          bookmarked: isImageBookmarked(element)
        });

        let blockable = false;
        if (PIXIV_BLOCKED_TAGS_VALIDATED) {
          blockable = await doBlockMultiView(element, { pixivData, skipReason: skipReason.join(', ') });
          if (blockable && !skipReason.length) {
            return true;
          }
        }

        let footer = '';
        if (blockable) {
          footer += `Blockable by:\n${blockable.hint}` +
          `\nSkipped due to:\n${skipReason.join('\n')}`;
        }

        setImageTitle(element, { data, pixivData, footer });
      }
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome && data.novel) {
      element.parentNode.style.display = 'none';
      logDebug('Novel recommendation removed from home', element);
      return true;
    }

    // Skip if edit bookmark button already inserted.
    if (element.querySelector('.pixiv_utils_edit_bookmark')) {
      return false;
    }

    const multiViewControls = element.querySelector(CONFIG.SELECTORS_MULTI_VIEW_CONTROLS);
    if (!multiViewControls) {
      return false;
    }

    multiViewControls.lastChild.before(editBookmarkButton(data.id, data.novel));
    return true;
  };

  const doBlockExpandedView = async (element, options = {}) => {
    // Reset blocked status if necessary.
    delete element.dataset.pixiv_utils_expanded_view_blocked;

    const blocked = isImageBlockedByData(options.pixivData);
    if (!blocked) {
      return false;
    }

    if (options.skipReason) {
      logDebug(`Expanded view is blockable, but skipped (reason: ${options.skipReason})`, element);
      return false;
    } else {
      element.dataset.pixiv_utils_expanded_view_blocked = true;
      logDebug(`Expanded view blocked (${blocked.hint})`, element);
      return true;
    }
  };

  const doExpandedViewControls = async (element, options = {}) => {
    const image = element.closest(CONFIG.SELECTORS_EXPANDED_VIEW_IMAGE);
    if (!image) {
      return false;
    }

    const pixivData = await getImagePixivData(image);
    if (pixivData && PIXIV_BLOCKED_TAGS_VALIDATED) {
      // Only block image if not bookmarked.
      const skipReason = getImageBlockSkipReason(image, {
        bookmarked: isImageBookmarked(image)
      });

      await doBlockExpandedView(image, {
        pixivData,
        skipReason: skipReason.join(', ')
      });
    }

    // Init MutationObserver for dynamic expanded view.
    if (image.__vue__) {
      const target = image.querySelector('.work-main-image');
      if (!image.dataset.pixiv_utils_last_id) {
        initElementObserver(target, mutations => {
          const data = findItemData(image, true);
          if (data.id !== image.dataset.pixiv_utils_last_id) {
            options.forced = true;
            doExpandedViewControls(image, options);
          }
        }, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['href', 'src']
        });
      }
      const data = findItemData(image, true);
      image.dataset.pixiv_utils_last_id = data.id;
    }

    // Skip if edit bookmark button already inserted, unless forced.
    if (element.querySelector('.pixiv_utils_edit_bookmark') && !options.forced) {
      return false;
    }

    // Re-attempt to convert date.
    if (CONFIG.DATE_CONVERSION) {
      const dates = image.querySelectorAll(SELECTORS_DATE_ORIGINAL);
      for (const date of dates) {
        convertDate(date);
      }
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
        await doImage(image, { forced: true });
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
  const toggleBookmarked = (button, parent, header, imagesContainer, options = {}) => {
    if (toggling) {
      return false;
    }

    toggling = true;

    if (options.sync) {
      toggleBookmarkedMode = GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN);
    } else if (options.rightClick) {
      toggleBookmarkedMode--;
    } else {
      toggleBookmarkedMode++;
    }
    if (toggleBookmarkedMode > _TB_MAX) {
      toggleBookmarkedMode = _TB_MIN;
    } else if (toggleBookmarkedMode < _TB_MIN) {
      toggleBookmarkedMode = _TB_MAX;
    }

    button.innerHTML = formatToggleBookmarkedButtonHtml(toggleBookmarkedMode);

    let images = Array.from(imagesContainer.querySelectorAll(CONFIG.SELECTORS_IMAGE));

    // Do not process blocked images if they are already forcefully hidden.
    if (CONFIG.PIXIV_REMOVE_BLOCKED || CONFIG.UTAGS_REMOVE_BLOCKED) {
      images = images.filter(image => !image.dataset.pixiv_utils_blocked);
    }

    if (toggleBookmarkedMode === 0) {
      for (const image of images) {
        image.style.display = '';
      }
    } else if (toggleBookmarkedMode === 1) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || isImageBookmarked(image)) {
          image.style.display = 'none';
        } else {
          image.style.display = '';
        }
      }
    } else if (toggleBookmarkedMode === 2) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || !isImageBookmarked(image)) {
          image.style.display = 'none';
        } else {
          image.style.display = '';
        }
      }
    }

    GM_setValue('PREF_TOGGLE_BOOKMARKED_MODE', toggleBookmarkedMode);

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

    // Load latest state from storage for the first time.
    if (toggleBookmarkedMode === null) {
      toggleBookmarkedMode = GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN);
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
    button.innerHTML = formatToggleBookmarkedButtonHtml(toggleBookmarkedMode);

    if (CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP) {
      button.title = CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP;
    }

    // Left click.
    button.addEventListener('click', event => {
      event.preventDefault();
      toggleBookmarked(button, element, header, imagesContainer, {
        sync: event.shiftKey
      });
    });

    // Right click.
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      toggleBookmarked(button, element, header, imagesContainer, {
        rightClick: true
      });
    });

    buttonContainer.append(button);
    header.append(buttonContainer);
    return true;
  };

  const doTagButton = element => {
    let tag = null;

    const tags = element.querySelectorAll('div[title]');
    if (tags.length) {
      const tagRaw = tags[tags.length - 1].textContent;
      if (tagRaw.startsWith('#')) {
        tag = tagRaw.substring(1);
      }
    }

    if (!tag) {
      return false;
    }

    const blocked = PIXIV_BLOCKED_TAGS_STRING.includes(tag) || PIXIV_BLOCKED_TAGS_REGEXP.some(t => t.test(tag));

    if (blocked) {
      element.style.display = 'none';
      logDebug(`Tag button blocked (${tag})`);
    }

    return blocked;
  };

  const doUtags = async (element, options) => {
    let image = element.closest(CONFIG.SELECTORS_IMAGE);

    let mobile = false;
    if (image) {
      mobile = image.matches(SELECTORS_IMAGE_MOBILE);
    } else {
      // For mobile images, re-attempt query with some patience.
      image = element.closest(SELECTORS_IMAGE_MOBILE);
      if (image) {
        mobile = true;
        const awaited = await waitFor(() => image.querySelector('.thumb:not([src^="data"])'), image);
        if (!awaited) {
          return false;
        }
      }
    }

    const utag = element.dataset.utags_tag;

    if (image) {
      const data = findItemData(image);
      if (data.id === null) {
        return false;
      }

      // Only block images if not in own profile, and not bookmarked.
      const skipReason = getImageBlockSkipReason(image, {
        isOwnProfile,
        bookmarked: isImageBookmarked(image)
      });

      const pixivData = await getImagePixivData(image);

      if (skipReason.length) {
        setImageTitle(image, {
          data,
          pixivData,
          footer: `Blockable by:\nUTag: ${utag}` +
            `\nSkipped due to:\n${skipReason.join('\n')}`
        });
        logDebug(`Image is blockable, but skipped (reason: ${skipReason.join(', ')})`, image);
        return false;
      } else {
        const status = setImageBlocked(image, {
          mobile,
          remove: CONFIG.UTAGS_REMOVE_BLOCKED,
          link: data.link
        });
        if (status) {
          setImageTitle(image, {
            data,
            pixivData,
            footer: `Blocked by:\nUTag: ${utag}`
          });
          logDebug(`Image blocked (UTag: ${utag})`, image);
        }
        return status;
      }
    }

    const multiView = element.closest(CONFIG.SELECTORS_MULTI_VIEW);
    if (multiView) {
      // For multi view artwork, always hide the whole entry instead.
      multiView.parentNode.style.display = 'none';
      logDebug(`Multi view entry removed (UTag: ${utag})`, multiView);
      return true;
    }

    const recommendedUserContainer = element.closest(CONFIG.SELECTORS_RECOMMENDED_USER_CONTAINER);
    if (recommendedUserContainer) {
      recommendedUserContainer.style.display = 'none';
      logDebug(`Recommended user removed (UTag: ${utag})`, recommendedUserContainer);
      return true;
    }

    const followButtonContainer = element.closest(CONFIG.SELECTORS_FOLLOW_BUTTON_CONTAINER);
    if (followButtonContainer) {
      const followButton = followButtonContainer.querySelector(CONFIG.SELECTORS_FOLLOW_BUTTON);
      if (followButton) {
        // Cosmetic only. This will not disable Pixiv's built-in "F" keybind.
        followButton.classList.add('disabled');
        followButton.disabled = true;
        logDebug(`Follow button disabled (UTag: ${utag})`, followButtonContainer);
        // Return early since there will only be one follow button per container.
        return true;
      }
    }

    return false;
  };

  let isHome = false;
  let isOwnProfile = false;

  const determinePageType = () => {
    isHome = Boolean(document.querySelector(CONFIG.SELECTORS_HOME));
    isOwnProfile = Boolean(document.querySelector(CONFIG.SELECTORS_OWN_PROFILE));
    logDebug(`isHome: ${isHome}, isOwnProfile: ${isOwnProfile}`);
  };

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

    // Reset page type.
    isHome = isOwnProfile = false;
  });

  /** SENTINEL */

  waitPageLoaded().then(() => {
    // Immediately attempt to determine page type.
    determinePageType();

    sentinel.on(CONFIG.SELECTORS_HOME, () => {
      isHome = true;
      logDebug(`isHome: ${isHome}`);
    });

    sentinel.on(CONFIG.SELECTORS_OWN_PROFILE, () => {
      isOwnProfile = true;
      logDebug(`isOwnProfile: ${isOwnProfile}`);
    });

    // Expanded View Controls
    sentinel.on(CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS, element => {
      doExpandedViewControls(element);
    });

    // Images
    sentinel.on([
      CONFIG.SELECTORS_IMAGE,
      CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE
    ], element => {
      doImage(element, { isHome, isOwnProfile });
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

    // Tag Buttons
    if (PIXIV_BLOCKED_TAGS_VALIDATED && CONFIG.PIXIV_REMOVE_BLOCKED) {
      // Only process if blocked images are also removed instead of just muted.
      sentinel.on(CONFIG.SELECTORS_TAG_BUTTON, element => {
        doTagButton(element);
      });
    }

    // Dates
    if (CONFIG.DATE_CONVERSION) {
      sentinel.on([
        `:has(> :is(${CONFIG.SELECTORS_DATE})):not(:has(> [data-pixiv_utils_duplicate_date]))`,
        `.reupload-info:has(${SELECTORS_DATE_ORIGINAL})`
      ], element => {
        const date = element.querySelector(SELECTORS_DATE_ORIGINAL);
        if (date) {
          convertDate(date);
        }
      });
    }

    // UTags Integration
    if (CONFIG.UTAGS_INTEGRATION) {
      sentinel.on(SELECTORS_UTAGS, element => {
        doUtags(element, { isOwnProfile });
      });
    }

    if (CONFIG.MODE !== 'PROD') {
      setInterval(() => {
        const intervals = Object.keys(waitForIntervals);
        if (intervals.length > 0) {
          // Debug first pending interval.
          logDebug('waitFor', waitForIntervals[intervals[0]].element);
        }
      }, 2500);
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
