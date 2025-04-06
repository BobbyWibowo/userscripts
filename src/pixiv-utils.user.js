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
// @version      1.5.1
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

  // It's recommended to edit these values through your userscript manager's storage/values editor.
  // For Tampermonkey users, load Pixiv once after installing the userscript,
  // to allow it to populate its storage with default values.
  const ENV_DEFAULTS = {
    MODE: 'PROD',

    TEXT_EDIT_BOOKMARK: '✏️',
    TEXT_EDIT_BOOKMARK_TOOLTIP: 'Edit bookmark',

    TEXT_TOGGLE_BOOKMARKED: '❤️',
    TEXT_TOGGLE_BOOKMARKED_TOOLTIP: 'Cycle bookmarked display (Right-Click to cycle back)',
    TEXT_TOGGLE_BOOKMARKED_SHOW_ALL: 'Show all',
    TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED: 'Show bookmarked',
    TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED: 'Show not bookmarked',

    // The following options have hard-coded preset values. Scroll further to find them.
    // Specifiying custom values will extend instead of replacing them.
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
    // This has a hard-coded preset value. Specifiying a custom value will extend instead of replacing it.
    SELECTORS_DATE: null,

    REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME: false,

    // This has a hard-coded preset value. Specifiying a custom value will extend instead of replacing it.
    SECTIONS_TOGGLE_BOOKMARKED: null,

    ENABLE_KEYBINDS: true,

    UTAGS_INTEGRATION: true,
    // Hard-coded presets of "block" and "hide" tags. Specifying custom values will extend instead of replacing them.
    UTAGS_BLOCKED_TAGS: null,
    // Instead of merely hiding them à la Pixiv's built-in tags mute.
    UTAGS_REMOVE_BLOCKED: false
  };

  const ENV = {};

  // Store preset values.
  for (const key of Object.keys(ENV_DEFAULTS)) {
    const stored = GM_getValue(key);
    if (stored === null || stored === undefined) {
      ENV[key] = ENV_DEFAULTS[key];
      GM_setValue(key, ENV_DEFAULTS[key]);
    } else {
      ENV[key] = stored;
    }
  }

  /* DOCUMENTATION
   * -------------
   * For any section that does not have complete selectors, it's implied that they are already matched using selectors contained in sections that preceded it.
   * NOTE: Figure out selectors that are more update-proof.
   *
   * Home's recommended works grid:
   * Image: .sc-96f10c4f-0 > li
   * Title: [data-ga4-label="title_link"]
   * Artist avatar: [data-ga4-label="user_icon_link"]
   * Artist name: [data-ga4-label="user_name_link"]
   * Controls: .sc-eacaaccb-9
   * Bookmarked: .bXjFLc
   *
   * Home's latest works grid:
   * Image: li[data-ga4-label="thumbnail"]
   *
   * Discovery page's grid:
   * Title: .gtm-illust-recommend-title
   * Controls: .ppQNN
   *
   * Artist page's grid:
   * Image: .sc-9y4be5-1 > li
   * Controls: .sc-iasfms-4
   *
   * Expanded view's artist works bottom row:
   * Image: .sc-1nhgff6-4 > div:has(a[href])
   *
   * Expanded view's related works grid:
   * Artist avatar: .sc-1rx6dmq-1
   * Artist name: .gtm-illust-recommend-user-name
   *
   * Artist page's featured works:
   * Image: .sc-1sxj2bl-5 > li
   * Controls: .sc-xsxgxe-3
   *
   * Bookmarks page's grid:
   * Title: .sc-iasfms-6
   * Artist name: .sc-1rx6dmq-2
   *
   * Tag page's grid:
   * Image: .sc-l7cibp-1 > li
   *
   * Rankings page:
   * Image: .ranking-item
   * Title: .title
   * Artist avatar: ._user-icon
   * Artist name: .user-name
   * Controls: ._layout-thumbnail
   * Bookmarked: ._one-click-bookmark.on
   *
   * Newest by all page:
   * Image: .sc-e6de33c8-0 > li
   * Bookmarked: .epoVSE
   *
   * General mobile page:
   * Image: .works-item-illust:has(.thumb:not([src^=data]))
   * Controls: .bookmark, .hSoPoc
   */
  const PRESETS = {
    SELECTORS_HOME: '[data-ga4-label="page_root"]',
    SELECTORS_IMAGE: '.sc-96f10c4f-0 > li, li[data-ga4-label="thumbnail"], .sc-9y4be5-1 > li, .sc-1sxj2bl-5 > li, .sc-l7cibp-1 > li, .ranking-item, .sc-e6de33c8-0 > li, .works-item-illust:has(.thumb:not([src^=data]))',
    SELECTORS_IMAGE_TITLE: '[data-ga4-label="title_link"], .gtm-illust-recommend-title, .sc-iasfms-6, .title',
    SELECTORS_IMAGE_ARTIST_AVATAR: '[data-ga4-label="user_icon_link"], .sc-1rx6dmq-1, ._user-icon',
    SELECTORS_IMAGE_ARTIST_NAME: '[data-ga4-label="user_name_link"], .gtm-illust-recommend-user-name, .sc-1rx6dmq-2, .user-name',
    SELECTORS_IMAGE_CONTROLS: '.sc-eacaaccb-9, .ppQNN, .sc-iasfms-4, .sc-xsxgxe-3, ._layout-thumbnail, .bookmark, .hSoPoc',
    SELECTORS_IMAGE_BOOKMARKED: '.bXjFLc, ._one-click-bookmark.on, .epoVSE',
    SELECTORS_EXPANDED_VIEW_CONTROLS: '.sc-181ts2x-0, .work-interactions',
    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: '.sc-1nhgff6-4 > div:has(a[href])',
    SELECTORS_MULTI_VIEW: '[data-ga4-label="work_content"]:has(a[href])',
    SELECTORS_MULTI_VIEW_CONTROLS: '& > .w-full:last-child > .flex:first-child > .flex-row:first-child',
    SELECTORS_FOLLOW_BUTTON_CONTAINER: '.sc-gulj4d-2, .sc-k3uf3r-3, .sc-10gpz4q-3, .sc-f30yhg-3',
    SELECTORS_FOLLOW_BUTTON: '[data-click-label="follow"]:not([disabled])',
    SELECTORS_DATE: '.sc-5981ly-1',

    SECTIONS_TOGGLE_BOOKMARKED: [
      // Bookmarks page
      {
        selectorParent: '.sc-jgyytr-0',
        selectorHeader: '.sc-s8zj3z-2',
        selectorImagesContainer: '.sc-s8zj3z-4'
      },
      // Artist page
      {
        selectorParent: '.sc-1xj6el2-3',
        selectorHeader: '.sc-1xj6el2-2',
        selectorImagesContainer: '& > div:last-child'
      },
      // Tag page
      {
        selectorParent: '.sc-jgyytr-0',
        selectorHeader: '.sc-7zddlj-0',
        selectorImagesContainer: '.sc-l7cibp-0'
      },
      // Rankings page
      {
        selectorParent: '#wrapper ._unit',
        selectorHeader: '.ranking-menu',
        selectorImagesContainer: '.ranking-items-container'
      },
      // Newest by all page
      {
        selectorParent: '.sc-7b5ed552-0',
        selectorHeader: '.sc-f08ce4e3-2',
        selectorImagesContainer: '.sc-a7a11491-1'
      }
    ],

    UTAGS_BLOCKED_TAGS: ['block', 'hide']
  };

  const CONFIG = {};

  // Extend hard-coded preset values with user-defined custom values, if applicable.
  for (const key of Object.keys(ENV)) {
    if (key.startsWith('SELECTORS_')) {
      CONFIG[key] = PRESETS[key] || '';
      if (ENV[key]) {
        CONFIG[key] += `, ${Array.isArray(ENV[key]) ? ENV[key].join(', ') : ENV[key]}`;
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

  const addPageDateStyle = /* css */`
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
    let date;

    const attr = element.getAttribute('datetime');
    if (attr) {
      date = new Date(attr);
    } else {
      // For pages which have the date display hardcoded to Japan time.
      let dateText = element.innerText;

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
    if (element.dataset.oldTimestamp && element.dataset.oldTimestamp === timestamp) {
      return false;
    }

    element.dataset.oldTimestamp = timestamp;
    element.innerText = date.toLocaleString(CONFIG.DATE_CONVERSION_LOCALES, CONFIG.DATE_CONVERSION_OPTIONS);
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

  // To properly handle "&" CSS keyword, in context of also having to support user-defined custom values.
  // Somewhat overkill, but I'm out of ideas.
  const _formatSelectorsMultiViewControls = () => {
    const multiViews = CONFIG.SELECTORS_MULTI_VIEW.split(', ');
    const multiViewsControls = CONFIG.SELECTORS_MULTI_VIEW_CONTROLS.split(', ');

    const formatted = [];
    for (const x of multiViews) {
      for (const y of multiViewsControls) {
        let z = y;
        if (y.startsWith('&')) {
          z = y.substring(1);
        }
        formatted.push(`${x} ${z.trim()}`);
      }
    }
    return formatted;
  };

  const mainStyle = /* css */`
  .flex:has(+ .pixiv_utils_edit_bookmark_container) {
    flex-grow: 1;
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
  }

  ${CONFIG.SELECTORS_EXPANDED_VIEW_CONTROLS.split(', ').map(s => `${s} .pixiv_utils_edit_bookmark`).join(', ')},
  ${_formatSelectorsMultiViewControls().map(s => `${s} .pixiv_utils_edit_bookmark`).join(', ')} {
    font-size: 12px;
    height: 24px;
    line-height: 24px;
    margin-top: 5px;
    margin-right: 7px;
  }

  ._layout-thumbnail .pixiv_utils_edit_bookmark {
    position: absolute;
    right: calc(50% - 71px);
    bottom: 4px;
    z-index: 2;
  }

  .ranking-item.muted .pixiv_utils_edit_bookmark {
    display: none;
  }

  *:has(> .pixiv_utils_image_artist_container) {
    position: relative;
  }

  .pixiv_utils_image_artist_container {
    color: rgb(245, 245, 245);
    background: rgba(0, 0, 0, 0.5);
    display: inline-block;
    box-sizing: border-box;
    padding: 0px 8px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 14px;
    line-height: 20px;
    height: 20px;
    position: absolute;
    bottom: 6px;
    left: 6px;
  }

  .pixiv_utils_image_artist_container a {
    color: inherit;
  }

  .sc-s8zj3z-3:has(+ .pixiv_utils_toggle_bookmarked_container),
  .sc-7c5ab71e-2:has(+ .pixiv_utils_toggle_bookmarked_container) {
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

  ${CONFIG.SELECTORS_IMAGE_CONTROLS} {
    display: flex;
    justify-content: flex-end;
  }
  `;

  const mainDateStyle = /* css */`
  .dqHJfP {
    font-size: 14px !important;
    font-weight: bold;
    color: rgb(214, 214, 214) !important;
  }
  `;

  /** UTAGS INTEGRATION INIT **/

  const mainUtagsStyle = /* css */`
  .pixiv_utils_blocked_image {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    border-radius: 4px;
    color: rgb(92, 92, 92);
    min-width: 96px;
    min-height: 96px;
  }

  .pixiv_utils_blocked_image svg {
    fill: currentcolor;
  }

  ${CONFIG.SELECTORS_IMAGE_TITLE.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    color: rgb(133, 133, 133) !important;
  }

  .ranking-item[data-pixiv_utils_blocked] ._illust-series-title-text {
    display: none;
  }

  ${CONFIG.SELECTORS_IMAGE_ARTIST_AVATAR.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none;
  }

  ${CONFIG.SELECTORS_IMAGE_CONTROLS.split(', ').map(s => `[data-pixiv_utils_blocked] ${s}`).join(', ')} {
    display: none;
  }
  `;

  const SELECTORS_UTAGS = CONFIG.UTAGS_BLOCKED_TAGS.map(s => `[data-utags_tag="${s}"]`).join(', ');

  log('SELECTORS_UTAGS =', SELECTORS_UTAGS);

  const BLOCKED_IMAGE_HTML = `
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

  const waitForIntervals = {};

  const waitFor = (element = document, func) => {
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
      waitForIntervals[interval] = { element, func, resolve };
    });
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

  const findUrl = element => {
    return element.querySelector('a[href*="artworks/"]');
  };

  const findNovelUrl = element => {
    return element.querySelector('a[href*="novel/show.php?id="]');
  };

  const findItemId = element => {
    let id = null;
    let isNovel = false;

    let link = findUrl(element);
    if (link) {
      const match = link.href.match(/artworks\/(\d+)/);
      id = match ? match[1] : null;
    } else {
      link = findNovelUrl(element);
      if (link) {
        const match = link.href.match(/novel\/show\.php\?id=(\d+)/);
        id = match ? match[1] : null;
        isNovel = true;
      }
    }

    return { id, isNovel };
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
      await waitFor(element, () => !element.__vue__._props.item.notLoaded);

      userId = element.__vue__._props.item.user_id;
      userName = element.__vue__._props.item.author_details.user_name;
    } else {
      const reactPropsKey = Object.keys(element).find(k => k.startsWith('__reactProps'));
      if (!reactPropsKey || !element[reactPropsKey].children.props.thumbnail) {
        return false;
      }

      userId = element[reactPropsKey].children.props.thumbnail.userId;
      userName = element[reactPropsKey].children.props.thumbnail.userName;
    }

    const div = document.createElement('div');
    div.className = 'pixiv_utils_image_artist_container';
    div.innerHTML = /* html */`
      <a href="https://www.pixiv.net/users/${userId}">${userName}</a>
    `;

    element.append(div);
    return true;
  };

  const doImage = async (element, isHome = false) => {
    // Skip if invalid.
    if (!element.querySelector('a[href]')) {
      return false;
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && isHome) {
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

    // Skip if edit bookmark button already inserted.
    if (element.querySelector('.pixiv_utils_edit_bookmark')) {
      return false;
    }

    // Add artist tag if necessary, but never in artist page, or mobile expanded view's artist works bottom row.
    if (!element.querySelector('a[href*="users/"]') &&
      currentUrl.indexOf('users/') === -1 &&
      !element.closest('.user-badge')) {
      await addImageArtist(element);
    }

    // Wait if image controls is still being generated.
    const imageControls = await waitFor(element, () => {
      return element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS);
    });
    if (!imageControls) {
      return false;
    }

    const { id, isNovel } = findItemId(element);
    if (id !== null) {
      imageControls.prepend(editBookmarkButton(id, isNovel));
      return true;
    }

    return false;
  };

  const doMultiView = async (element, isHome = false) => {
    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && isHome) {
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

    const { id, isNovel } = findItemId(element);
    if (id !== null) {
      multiViewControls.lastChild.before(editBookmarkButton(id, isNovel));
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

      // Re-process expanded view's artist works bottom row.
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
      return /* html */`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL}<span>`;
    } else if (mode === 1) {
      return /* html */`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED}<span>`;
    } else if (mode === 2) {
      return /* html */`${CONFIG.TEXT_TOGGLE_BOOKMARKED}<span>${CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED}<span>`;
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

  const doToggleBookmarkedSection = (element, sectionConfig) => {
    // Skip if already processed.
    if (element.dataset.pixiv_utils_toggle_bookmarked_section) {
      return false;
    }

    const header = element.querySelector(sectionConfig.selectorHeader);
    const imagesContainer = element.querySelector(sectionConfig.selectorImagesContainer);

    if (!header || !imagesContainer) {
      return false;
    }

    // Mark as processed.
    element.dataset.pixiv_utils_toggle_bookmarked_section = true;

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

  const doUtags = element => {
    const image = element.closest(CONFIG.SELECTORS_IMAGE);
    if (image) {
      const imageLink = image.querySelector('a[href*="artworks/"], a[href*="novel/"]');
      if (!imageLink) {
        return false;
      }

      // Skip if already blocked.
      if (image.dataset.pixiv_utils_blocked) {
        return false;
      }

      image.dataset.pixiv_utils_blocked = true;

      if (CONFIG.UTAGS_REMOVE_BLOCKED) {
        image.style.display = 'none';
        return true;
      }

      imageLink.innerHTML = BLOCKED_IMAGE_HTML;

      const imageTitle = image.querySelector(CONFIG.SELECTORS_IMAGE_TITLE);
      if (imageTitle) {
        if (element.dataset.utags_tag === 'hide') {
          imageTitle.innerText = 'Hidden';
        } else {
          // "block" tag and custom tags
          imageTitle.innerText = 'Blocked';
        }
      }

      // Empty the text instead of hiding it, so that the utags will still display properly to provide context.
      const artistLink = image.querySelector(CONFIG.SELECTORS_IMAGE_ARTIST_NAME +
        ', .pixiv_utils_image_artist_container a');
      if (artistLink) {
        artistLink.innerText = '';
      }

      return true;
    }

    const multiView = element.closest(CONFIG.SELECTORS_MULTI_VIEW);
    if (multiView) {
      // For multi view artwork, just hide the whole entry instead.
      multiView.parentNode.style.display = 'none';
      logDebug('Removed multi view entry due to UTag', element);
      return true;
    }

    const followButtonContainer = element.closest(CONFIG.SELECTORS_FOLLOW_BUTTON_CONTAINER);
    if (followButtonContainer) {
      const followButton = followButtonContainer.querySelector(CONFIG.SELECTORS_FOLLOW_BUTTON);
      if (followButton) {
        // Cosmetic only. This will not disable Pixiv's built-in "F" keybind.
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
    if (intervals.length) {
      logDebug(`Clearing ${intervals.length} pending waitFor interval(s).`);
    }
    for (const interval of intervals) {
      clearInterval(interval);
      waitForIntervals[interval].resolve();
      delete waitForIntervals[interval];
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
      doImage(element, isHome);
    });

    // Multi View Entries
    sentinel.on(CONFIG.SELECTORS_MULTI_VIEW, element => {
      doMultiView(element, isHome);
    });

    // Toggle Bookmarked Sections
    for (const sectionConfig of CONFIG.SECTIONS_TOGGLE_BOOKMARKED) {
      if (!sectionConfig.selectorParent || !sectionConfig.selectorHeader || !sectionConfig.selectorImagesContainer) {
        log('Invalid "SECTIONS_TOGGLE_BOOKMARKED" config', sectionConfig);
        continue;
      }

      sentinel.on(sectionConfig.selectorParent, element => {
        doToggleBookmarkedSection(element, sectionConfig);
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
      if (document.activeElement && (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) {
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
