// ==UserScript==
// @name         Bobby's Pixiv Utils
// @namespace    https://github.com/BobbyWibowo
// @version      1.6.69
// @description  Compatible with mobile. "Edit bookmark" and "Toggle bookmarked" buttons, publish dates conversion, block AI-generated works, block by Pixiv tags, UTags integration, and more!
// @author       Bobby Wibowo
// @license      MIT
// @match        *://www.pixiv.net/*
// @exclude      *://www.pixiv.net/setting*
// @exclude      *://www.pixiv.net/manage*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_getValues
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_setValues
// @grant        GM_registerMenuCommand
// @grant        window.onurlchange
// @require      https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js
// @require      https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js
// @require      https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/dist/tippy.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/@kobzi/gmconfig@1.0.0/dist/gmConfig.iife.js
// @resource     tippyCss https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/dist/tippy.min.css
// @noframes
// ==/UserScript==

/* global sentinel, tippy, gmConfig */

(function () {
  'use strict';

  const _LOG_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });

  const _log = (prefix, message, ...args) => {
    if (typeof message === 'string') {
      return console.log(prefix + message, ...args);
    } else {
      return console.log(prefix, message, ...args);
    }
  };

  const tlog = (...args) => _log(`[${_LOG_TIME_FORMAT.format(Date.now())}]: `, ...args);

  const log = (...args) => _log('[Pixiv Utils]: ', ...args);

  /** CONFIG **/

  /* It's recommended to edit these values through your userscript manager's storage/values editor.
   * Visit Pixiv once after installing the script to allow it to populate its storage with default values.
   * Especially necessary for Tampermonkey to show the script's Storage tab when Advanced mode is turned on.
   */
  const ENV_DEFAULTS = {
    MODE: 'PROD',
    SETTINGS_LANGUAGE: 'auto',

    ENABLE_EDIT_BOOKMARK: true,
    ENABLE_TOGGLE_BOOKMARKED: true,

    TEXT_EDIT_BOOKMARK: null,
    TEXT_EDIT_BOOKMARK_TOOLTIP: null,

    TEXT_TOGGLE_BOOKMARKED: null,
    TEXT_TOGGLE_BOOKMARKED_TOOLTIP: null,
    TEXT_TOGGLE_BOOKMARKED_SHOW_ALL: null,
    TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED: null,
    TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED: null,

    SELECTORS_HOME: null,
    SELECTORS_OWN_PROFILE: null,
    SELECTORS_IMAGE: null,
    SELECTORS_IMAGE_TITLE: null,
    SELECTORS_IMAGE_ARTIST_AVATAR: null,
    SELECTORS_IMAGE_AUXILIARY_ELEMENTS: null,
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
    // Disable if using patterns with anchors/lookbehinds that can interact badly when combined.
    PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES: true,
    // Disable if you want to see full list of tags that trigger the highlight on their hover tooltip.
    PIXIV_HIGHLIGHTED_TAGS_FAST: true,
    // Enable if you want artworks with highlighted tags to not be blocked if they contain blocked tags.
    // This does not work on artworks by artists who are blocked with UTags.
    PIXIV_HIGHLIGHTED_BYPASS_BLOCK: false,
    PIXIV_HIGHLIGHTED_COLOR: '#32cd32',

    PIXIV_BLOCK_AI: false,
    PIXIV_BLOCKED_TAGS: null,
    // Disable if using patterns with anchors/lookbehinds that can interact badly when combined.
    PIXIV_BLOCKED_TAGS_COMBINE_REGEXES: true,
    PIXIV_BLOCKED_USERS: [],
    // Disable if you want to see full list of tags that trigger the block on their hover tooltip.
    PIXIV_BLOCKED_TAGS_FAST: true,
    // Instead of merely masking them à la Pixiv's built-in tags mute.
    PIXIV_REMOVE_BLOCKED: false,

    UTAGS_INTEGRATION: true,
    UTAGS_BLOCKED_TAGS: [],

    // Disable if you prefer native tooltips.
    ENABLE_TIPPY_TOOLTIPS: true,
    // Mouse tooltips appear only after the cursor has stopped moving.
    TIPPY_TOOLTIPS_STATIONARY_DELAY: 500, // ms
    TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE: 3, // px
    TIPPY_TOOLTIPS_OPTIONS: {
      delay: [500, 0], // ms
      followCursor: 'initial',
      offset: [0, 25], // px
      placement: 'bottom',
      theme: 'pixiv-utils'
    }
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
      'ul > li:has(a[href*="artworks/"] img[src], a[href*="artworks/"] figure)', // desktop
      'ul > div:has(a[href*="artworks/"] img[src]):not(:has(ul))',
      'ul > li:has(a[href*="novel/"])', // desktop (novel)
      'nav:not([style]) > div:has(a[href*="artworks/"] img[src])',
      'nav:not([style]) > div:has(a[href*="novel/"])',
      'div[open] a[href*="users/"] ~ div > div:has(a[href*="artworks/"] img[src])', // user profile popup
      'div[open] div:has(a[href*="users/"]) + div > div:has(a[href*="artworks/"] img[src])', // user profile popup (alt)
      '.ranking-items > .ranking-item', // rankings page
      'div[style*="main-ranking"] ol > li', // rankings page (new)
      'div[data-ga4-label="works_content"] div[data-ga4-label="thumbnail"]', // tags page (new)
      '.works-item-illust:has(.thumb:not([src^="data"]))', // mobile
      '.works-item:not(.works-item-illust):has(.thumb:not([src^="data"]))', // mobile (novel)
      '.works-item-novel-editor-recommend:has(.cover:not([style^="data"]))', // mobile's novels page's editor's picks
      '.stacclist > li.illust' // mobile's feed page
    ],

    SELECTORS_IMAGE_TITLE: [
      'div > div:not([width]):not([height]) > a[href*="artworks/"]', // desktop
      '[data-ga4-label="title_link"]', // home's recommended works grid
      '.gtm-illust-recommend-title', // discovery page's grid
      '.gtm-followlatestpage-thumbnail-link', // following page
      'h2:has(> .title)', // rankings page
      'a[href*="artworks/"]:has(> div[title])', // rankings page (new)
      '.illust-info > a[class*="c-text"]' // mobile list view
    ],

    SELECTORS_IMAGE_ARTIST_AVATAR: [
      'div > a[href*="users/"]:has(> div > img)', // desktop
      '._user-icon', // rankings page
      '[data-ga4-label="user_icon_link"]', // home's recommended works grid
      '._user-icon' // rankings page
    ],

    SELECTORS_IMAGE_AUXILIARY_ELEMENTS: [
      'div:has(> a[href*="/bookmark_detail"])', // illustrations page's popular projects section
      '.gtm-novel-toppage-recommended-work-series', // novels page's recommended works section
      '.pixiv_utils_blocked_image_container + div:has(.text-text2)', // novel grid's right-side texts
      'div:has(> div > .pixiv_utils_blocked_image_container) ~ div:has(> div > div > div[title] > a[href*="novel/"]) > div > div:not(:has(a[href*="users/"]))', // novel grid's right-side texts (alt)
      'div:has(> div > .pixiv_utils_blocked_image_container) ~ div:not(:has(a[href*="users/"]))' // novel grid's right-side texts (alt)
    ],

    SELECTORS_IMAGE_CONTROLS: [
      'div:has(> [data-ga4-label="bookmark_button"], > .gtm-illust-recommend-bookmark)',
      '[data-ga4-label="thumbnail_link"] ~ div:has(> button[type="button"] > svg)',
      '._layout-thumbnail', // rankings page
      '.imgoverlay', // mobile's feed page
      '.bookmark', // mobile
      '.hSoPoc' // mobile
    ],

    SELECTORS_IMAGE_BOOKMARKED: [
      '._one-click-bookmark.on', // rankings page
      '.works-bookmark-button svg path[fill="#FF4060"]' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_IMAGE: [
      'main > section:has(figure) > div:first-of-type', // desktop
      '.illust-details-view' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_CONTROLS: [
      'div[style*="translateY"] section', // desktop
      '.work-interactions' // mobile
    ],

    SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE: 'main > section:has(figure) > :nth-child(2 of div) nav[style] > div > div:has(a[href])',

    SELECTORS_MULTI_VIEW: '[data-ga4-label="work_content"]:has(a[href])',

    SELECTORS_MULTI_VIEW_CONTROLS: 'div:has(> [data-ga4-label="bookmark_button"])',

    SELECTORS_FOLLOW_BUTTON_CONTAINER: [
      'div:has(> div:first-child > h1):has(> div:nth-child(2) > [data-click-label="follow"])', // artist page's header
      'div[open] a[href*="users/"] + div', // artist hover popup
      'main > section:has(figure) > :nth-child(2 of div)', // expanded view's artist bottom bar
      'main:has(section figure) + aside > section:first-of-type', // expanded view's artist sidebar
      '.user-details', // mobile's artist page
      '.user-details-card' // mobile's expanded view
    ],

    SELECTORS_FOLLOW_BUTTON: [
      '[data-click-label="follow"]:not([disabled])', // desktop
      '.ui-button' // mobile
    ],

    SELECTORS_RECOMMENDED_USER_CONTAINER: [
      'section > .grid > :nth-child(2) .flex-col.gap-8:first-child .flex-row.items-center:not(.mr-auto)', // home's recommended users sidebar
      'nav:has(a[href*="tags/"]) ~ h2:has(span) + div.grid > li.list-none', // tags page's users tab
    ],

    SELECTORS_TAG_BUTTON: [
      ':is(ul, div) > div:has(> a[href*="tags/"] div[title])',
      'div > div:has(> a[href*="users/"] div[title^="#"])', // artist page
      '[data-ga4-label="tags_carousel"] div[style*="gap:"] > div.snap-center' // home page's trending tags
    ],

    SELECTORS_DATE: [
      'main > section:has(figure) figcaption div > time:first-of-type',
      'body > div[id^="react-aria"][role="tooltip"] > div:first-of-type', // "updated on" tooltip
      '.times', // mobile
      '.reupload-info .tooltip-text' // mobile "updated on" popup
    ],

    // Keys that starts with "selector", and in array, will automatically be converted to single-line strings.
    SECTIONS_TOGGLE_BOOKMARKED: [
      // "Newest by followed" page
      {
        selectorParent: 'section:has(> div:nth-child(2) > div:first-child > div:first-child > span)',
        selectorHeader: '& > div:nth-child(2) > div:first-child:has(> div:first-child > span):has(> div:nth-child(2) span)',
        selectorImagesContainer: '& > div:nth-child(2) > div:first-child:has(> div:first-child > span):has(> div:nth-child(2) span) + div'
      },
      // "Newest by all" page
      {
        selectorParent: 'section:has(> div:nth-child(2) > nav:first-child > a[href*="/new"])',
        selectorHeader: '& > div:nth-child(2):has(> nav:first-child > a[href*="/new"])',
        selectorImagesContainer: '& > div:nth-child(2):has(> nav:first-child > a[href*="/new"]) + div'
      },
      // Artist page
      {
        selectorParent: ':is(div, section):has(> div:first-child > div:first-child > div:first-child > h2[font-size][color="text2"])',
        selectorHeader: '& > div:has(> div:first-child > div:first-child > h2[font-size][color="text2"]):has(> div:first-child > div:first-child span)',
        selectorImagesContainer: '& > div:has(> div:first-child > div:first-child > h2[font-size][color="text2"]):has(> div:first-child > div:first-child span) ~ :has(a[href*="artworks/"]:not([href*="users/"]), a[href*="novel/"]:not([href*="users/"]))',
        sanityCheck: () => {
          // Skip if in own profile.
          return document.querySelector('a[href*="settings/profile"]');
        }
      },
      // Artist page's requests tab
      {
        selectorParent: 'section:has(> div:first-child > div:first-child > div:first-child > div:first-child > h2:not([font-size], [color]))',
        selectorHeader: '& > div:has(> div:first-child > div:first-child > div:first-child > h2:not([font-size], [color]))',
        selectorImagesContainer: '& > div:has(> div:first-child > div:first-child > div:first-child > h2:not([font-size], [color])) + ul',
        sanityCheck: () => {
          // Skip if in own profile.
          return document.querySelector('a[href*="settings/profile"]');
        }
      },
      // Tags page
      {
        selectorParent: 'section:has(> div:first-child > div:first-child > div:first-child > h3[font-size][color="text2"])',
        selectorHeader: '& > div:first-child > div:has(> div:first-child > h3[font-size][color="text2"]):has(> div:first-child span)',
        selectorImagesContainer: '& > div:nth-child(2):has(a[href*="artworks/"]:not([href*="users/"]), a[href*="novel/"]:not([href*="users/"]))'
      },
      // Tags page (new)
      {
        selectorParent: 'div[data-ga4-label="works_content"]',
        selectorHeader: '& > div:first-child > div:first-child',
        selectorImagesContainer: '& > div:first-child ~ div'
      },
      // Discovery page
      {
        selectorParent: 'div:has(> .gtm-illust-recommend-zone)',
        selectorHeader: '& > div:first-child > div.grid > div.flex',
        selectorImagesContainer: '& > .gtm-illust-recommend-zone'
      },
      // Rankings page
      {
        selectorParent: '#wrapper ._unit',
        selectorHeader: '.ranking-menu',
        selectorImagesContainer: '.ranking-items-container'
      },
      // Mobile artist page's illustrations/bookmarks tab, following page, tags page
      {
        selectorParent: [
          '.v-nav-tabs + div:not(.header-buttons)',
          '.nav-tab + div',
          '.search-nav-config + div'
        ],
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

  // GM_getValues returns undefined for missing keys, but null is a valid override.
  // Use GM_listValues to distinguish a missing key from one deliberately set to null.
  const defaultKeys = Object.keys(ENV_DEFAULTS);
  const existingKeys = new Set(GM_listValues());
  const storedValues = GM_getValues(defaultKeys);
  const missingValues = {};
  for (const key of defaultKeys) {
    if (!existingKeys.has(key)) {
      ENV[key] = ENV_DEFAULTS[key];
      missingValues[key] = ENV_DEFAULTS[key];
    } else {
      // Retain the old nullish fallback for non-null defaults without rewriting storage.
      ENV[key] = storedValues[key] ?? ENV_DEFAULTS[key];
    }
  }
  if (Object.keys(missingValues).length) GM_setValues(missingValues);

  // Settings UI and button text translations. Fill ja/zh/zh-Hant as available;
  // missing/empty translations automatically fall back to en per individual string.
  const I18N = {
    en: {
      'tab.General': 'General',
      'tab.Bookmarks': 'Bookmarks',
      'tab.Filtering': 'Filtering',
      'tab.Highlights': 'Highlights',
      'tab.Tooltips': 'Tooltips',
      'tab.UTags': 'UTags',
      'tab.Advanced': 'Advanced',
      'tab.Backup': 'Backup',
      settingsTitle: 'Pixiv Utils - Settings',
      'language.auto': 'Automatic (browser language)',
      'language.en': 'English',
      'language.ja': 'Japanese',
      'language.zh': 'Chinese (Simplified)',
      'language.zh-Hant': 'Chinese (Traditional)',
      'label.MODE': 'Debug mode',
      'label.SETTINGS_LANGUAGE': 'Settings language',
      'label.PIXIV_BLOCKED_TAGS': 'Blocked Pixiv tags',
      'label.PIXIV_HIGHLIGHTED_TAGS': 'Highlighted Pixiv tags',
      'label.PIXIV_HIGHLIGHTED_COLOR': 'Highlighted color',
      'label.SECTIONS_TOGGLE_BOOKMARKED': 'Sections toggle bookmarked',
      'label.BACKUP_TOOLS': 'Import / Export existing settings',
      'rule.new': 'New rule',
      'rule.tagPattern': 'Tag or pattern',
      'rule.regex': 'RegExp',
      'rule.flags': 'Flags',
      'rule.patternPlaceholder': 'Literal tag or regular expression',
      'rule.regexInfo': 'RegExp flags: i (case-insensitive), m, s, u or v (u/v cannot be combined). Avoid g/y because repeated matches can be inconsistent.',
      'rule.add': 'Add tag',
      'rule.addGroup': 'Add tag / colored group',
      'rule.addInGroup': 'Add tag in group',
      'rule.type': 'Rule type',
      'rule.single': 'Single tag / regex',
      'rule.colored': 'Colored group',
      'rule.groupColor': 'Group highlight color (optional)',
      'rule.groupTags': 'Tags in this group',
      'rule.collapse': 'Collapse group tags',
      'rule.expand': 'Expand group tags',
      'rule.listRequired': 'Expected a list of rules.',
      'rule.needsText': '{location}: a rule needs text.',
      'rule.groupLocation': 'Group {number}',
      'rule.location': 'Rule {number}',
      'rule.blockedLocation': 'Blocked rules',
      'rule.groupNeedsTags': 'Group {number} needs a tags list.',
      'rule.combinedRegex': 'Combined regex ({flags}): {error}',
      'rule.noFlags': 'no flags',
      'date.unspecified': 'Default / unspecified',
      'date.systemTimezone': 'System timezone',
      'date.example': 'Example: {value}',
      'date.invalid': 'Invalid combination: {error}',
      'date.expectedObject': 'Expected a date formatting options object.',
      'text.explicitEmpty': 'Use an explicit empty string',
      'text.fallback': 'Leave blank to use the preset localized text. Select the checkbox to force an empty string.',
      'sections.add': 'Add section',
      'sections.parent': 'Parent selector',
      'sections.header': 'Header selector',
      'sections.images': 'Images container selector',
      'sections.info': 'Additional sections only. Built-in sections and their custom sanity checks are unchanged. One selector per line; multiple selectors are supported.',
      'utags.add': 'Add blocked UTag',
      'utags.tag': 'UTag',
      'utags.info': "Custom additions to the built-in 'block' and 'hide' tags.",
      'backup.intro': 'Export fills the editor with all existing GM storage values, including preferences. Import accepts a partial settings object; omitted keys are preserved.',
      'backup.placeholder': 'Export settings, choose a JSON file, or paste a JSON object here...',
      'backup.aria': 'Settings JSON',
      'backup.export': 'Export',
      'backup.copy': 'Copy all',
      'backup.download': 'Download',
      'backup.choose': 'Choose JSON file',
      'backup.import': 'Import from editor',
      'backup.emptyCopy': 'Nothing to copy. Export settings first.',
      'backup.copied': 'Text copied to clipboard.',
      'backup.clipboardFailed': 'Clipboard access failed. The text is selected for manual copying.',
      'backup.emptyDownload': 'Nothing to download. Export settings first.',
      'backup.fileError': 'Unable to read file: {error}',
      'backup.emptyImport': 'Paste settings JSON or select a JSON file first.',
      'backup.importConfirm': 'Import {count} setting(s)?\n\nMatching stored keys will be overwritten. Unspecified keys remain unchanged. Any unsaved edits in the settings panel will be discarded.',
      'backup.imported': 'Settings imported. Reload the page for all changes to take effect.',
      'backup.importError': 'Unable to import settings: {error}',
      'backup.objectError': 'Expected a JSON object.',
      'backup.emptyObject': 'The imported object is empty.',
      'field.debugInfo': 'Enable debug logging (stores MODE as DEBUG; unchecked stores PROD).',
      'field.languageInfo': 'Automatically detects the preferred supported browser language, or use this override. Incomplete translations fall back to English.',
      'field.highlightInfo': 'This also serves as fallback in colored groups that do not have color set. Tip: "transparent" disables colored borders while keeping highlighted-tag blocking bypass functionality.',
      'field.tippyJson': 'JSON object passed directly to Tippy.js.',
      'field.dateInfo': 'All controls serialize to the existing DATE_CONVERSION_OPTIONS object.',
      'field.selectorInfo': 'These selectors are custom additions to the built-in presets. Enter one selector per line.',
      'field.keybindInfo': 'Shift+B: Open Edit Bookmark.\nB: Scroll to the artwork (Pixiv handles bookmarking).\nLeft/Right Arrow: Navigate supported listing pages.\nIgnored in text fields and with Ctrl/Alt/Meta.',
      'field.blockAiInfo': 'Only artworks self-declared as AI-generated by their artists can be identified and blocked by this option.',
      'field.delayInfo': 'Wait time after the mouse stops (milliseconds).',
      'field.toleranceInfo': 'Mouse movement threshold in pixels.',
      'validation.object': 'Expected a JSON object.',
      'validation.arrayNull': 'Expected an array or null.',
      'validation.arrayObjects': 'Expected an array of objects.',
      'validation.string': 'Expected a string.',
      'action.reload': 'Reload page',
      'action.save': 'Save',
      'action.saved': 'Saved ✓',
      'action.cancel': 'Cancel',
      'action.reset': 'Reset',
      'action.importExport': 'Import / Export',
      'action.close': 'Close',
      'message.save': 'Settings saved. Reload the page for all changes to take effect.',
      'message.reset': 'Settings reset. Reload the page for all changes to take effect.',
      'message.resetConfirm': 'Reset every configurable setting to its default?',
      'message.openError': 'Failed to open settings: {error}',
      'message.validation': '{key}: {error}',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': 'Edit bookmark',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': 'Cycle bookmarked display (Right-Click to cycle back)',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'Show all',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'Show bookmarked',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': 'Show not bookmarked',
      'label.ENABLE_EDIT_BOOKMARK': 'Edit bookmark',
      'label.ENABLE_TOGGLE_BOOKMARKED': 'Toggle bookmarked',
      'label.TEXT_EDIT_BOOKMARK': 'Edit bookmark',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': 'Edit bookmark tooltip',
      'label.TEXT_TOGGLE_BOOKMARKED': 'Toggle bookmarked',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': 'Toggle bookmarked tooltip',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'Toggle bookmarked show all',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'Toggle bookmarked show bookmarked',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': 'Toggle bookmarked show not bookmarked',
      'label.SELECTORS_HOME': 'Selectors home',
      'label.SELECTORS_OWN_PROFILE': 'Selectors own profile',
      'label.SELECTORS_IMAGE': 'Selectors image',
      'label.SELECTORS_IMAGE_TITLE': 'Selectors image title',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': 'Selectors image artist avatar',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': 'Selectors image auxiliary elements',
      'label.SELECTORS_IMAGE_CONTROLS': 'Selectors image controls',
      'label.SELECTORS_IMAGE_BOOKMARKED': 'Selectors image bookmarked',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': 'Selectors expanded view image',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': 'Selectors expanded view controls',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': 'Selectors expanded view artist bottom image',
      'label.SELECTORS_MULTI_VIEW': 'Selectors multi view',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': 'Selectors multi view controls',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': 'Selectors follow button container',
      'label.SELECTORS_FOLLOW_BUTTON': 'Selectors follow button',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': 'Selectors recommended user container',
      'label.SELECTORS_TAG_BUTTON': 'Selectors tag button',
      'label.DATE_CONVERSION': 'Date conversion',
      'label.DATE_CONVERSION_LOCALES': 'Date conversion locales',
      'label.DATE_CONVERSION_OPTIONS': 'Date conversion options',
      'label.SELECTORS_DATE': 'Selectors date',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': 'Remove novel recommendations from home',
      'label.ENABLE_KEYBINDS': 'Keybinds',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': 'Combine RegExp patterns (improves performance, but may conflict with anchors/lookbehinds)',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': 'Highlight as soon as the first Pixiv tag matches',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': 'Highlighted artworks bypass blocking (does not bypass UTag blocking)',
      'label.PIXIV_BLOCK_AI': 'Block AI artworks',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': 'Combine RegExp patterns (improves performance, but may conflict with anchors/lookbehinds)',
      'label.PIXIV_BLOCKED_USERS': 'Blocked user IDs',
      'users.add': 'Add user ID',
      'users.id': 'User ID',
      'users.invalid': 'Enter a user ID containing digits only.',
      'users.info': 'Block artworks by the Pixiv user IDs of their artists. IDs are stored as strings.',
      'label.PIXIV_BLOCKED_TAGS_FAST': 'Block as soon as user ID matches, detects AI flag, or the first Pixiv tag matches',
      'label.PIXIV_REMOVE_BLOCKED': "Remove blocked instead of masking à la Pixiv's built-in tags mute",
      'label.UTAGS_INTEGRATION': 'Utags integration',
      'label.UTAGS_BLOCKED_TAGS': 'Utags blocked tags',
      'label.ENABLE_TIPPY_TOOLTIPS': 'Tippy tooltips',
      'label.TIPPY_TOOLTIPS_STATIONARY_DELAY': 'Stationary delay',
      'label.TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE': 'Movement tolerance',
      'label.TIPPY_TOOLTIPS_OPTIONS': 'Options',
      'date.weekday': 'Weekday',
      'date.era': 'Era',
      'date.year': 'Year',
      'date.month': 'Month',
      'date.day': 'Day',
      'date.dayPeriod': 'Day period',
      'date.hour': 'Hour',
      'date.minute': 'Minute',
      'date.second': 'Second',
      'date.fractionalSecondDigits': 'Fractional second digits',
      'date.hour12': 'Hour12',
      'date.hourCycle': 'Hour cycle',
      'date.timeZoneName': 'Time zone name',
      'date.dateStyle': 'Date style',
      'date.timeStyle': 'Time style',
      'date.localeMatcher': 'Locale matcher',
      'date.formatMatcher': 'Format matcher',
      'date.timeZone': 'Time zone',
      'date.calendar': 'Calendar',
      'date.numberingSystem': 'Numbering system',
    },
    ja: {
      'tab.General': '',
      'tab.Bookmarks': '',
      'tab.Filtering': '',
      'tab.Highlights': '',
      'tab.Tooltips': '',
      'tab.UTags': '',
      'tab.Advanced': '',
      'tab.Backup': '',
      settingsTitle: '',
      'language.auto': '',
      'language.en': '',
      'language.ja': '',
      'language.zh': '',
      'language.zh-Hant': '',
      'label.MODE': '',
      'label.SETTINGS_LANGUAGE': '',
      'label.PIXIV_BLOCKED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_COLOR': '',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '',
      'label.BACKUP_TOOLS': '',
      'rule.new': '',
      'rule.tagPattern': '',
      'rule.regex': '',
      'rule.flags': '',
      'rule.patternPlaceholder': '',
      'rule.regexInfo': '',
      'rule.add': '',
      'rule.addGroup': '',
      'rule.addInGroup': '',
      'rule.type': '',
      'rule.single': '',
      'rule.colored': '',
      'rule.groupColor': '',
      'rule.groupTags': '',
      'rule.collapse': '',
      'rule.expand': '',
      'rule.listRequired': '',
      'rule.needsText': '',
      'rule.groupLocation': '',
      'rule.location': '',
      'rule.blockedLocation': '',
      'rule.groupNeedsTags': '',
      'rule.combinedRegex': '',
      'rule.noFlags': '',
      'date.unspecified': '',
      'date.systemTimezone': '',
      'date.example': '',
      'date.invalid': '',
      'date.expectedObject': '',
      'text.explicitEmpty': '',
      'text.fallback': '',
      'sections.add': '',
      'sections.parent': '',
      'sections.header': '',
      'sections.images': '',
      'sections.info': '',
      'utags.add': '',
      'utags.tag': '',
      'utags.info': '',
      'backup.intro': '',
      'backup.placeholder': '',
      'backup.aria': '',
      'backup.export': '',
      'backup.copy': '',
      'backup.download': '',
      'backup.choose': '',
      'backup.import': '',
      'backup.emptyCopy': '',
      'backup.copied': '',
      'backup.clipboardFailed': '',
      'backup.emptyDownload': '',
      'backup.fileError': '',
      'backup.emptyImport': '',
      'backup.importConfirm': '',
      'backup.imported': '',
      'backup.importError': '',
      'backup.objectError': '',
      'backup.emptyObject': '',
      'field.debugInfo': '',
      'field.languageInfo': '',
      'field.highlightInfo': '',
      'field.tippyJson': '',
      'field.dateInfo': '',
      'field.selectorInfo': '',
      'field.keybindInfo': '',
      'field.blockAiInfo': '',
      'field.delayInfo': '',
      'field.toleranceInfo': '',
      'validation.object': '',
      'validation.arrayNull': '',
      'validation.arrayObjects': '',
      'validation.string': '',
      'action.reload': '',
      'action.save': '',
      'action.saved': '',
      'action.cancel': '',
      'action.reset': '',
      'action.importExport': '',
      'action.close': '',
      'message.save': '',
      'message.reset': '',
      'message.resetConfirm': '',
      'message.openError': '',
      'message.validation': '',
      'text.TEXT_EDIT_BOOKMARK': '',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.ENABLE_EDIT_BOOKMARK': '',
      'label.ENABLE_TOGGLE_BOOKMARKED': '',
      'label.TEXT_EDIT_BOOKMARK': '',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.SELECTORS_HOME': '',
      'label.SELECTORS_OWN_PROFILE': '',
      'label.SELECTORS_IMAGE': '',
      'label.SELECTORS_IMAGE_TITLE': '',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '',
      'label.SELECTORS_IMAGE_CONTROLS': '',
      'label.SELECTORS_IMAGE_BOOKMARKED': '',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '',
      'label.SELECTORS_MULTI_VIEW': '',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '',
      'label.SELECTORS_FOLLOW_BUTTON': '',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '',
      'label.SELECTORS_TAG_BUTTON': '',
      'label.DATE_CONVERSION': '',
      'label.DATE_CONVERSION_LOCALES': '',
      'label.DATE_CONVERSION_OPTIONS': '',
      'label.SELECTORS_DATE': '',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '',
      'label.ENABLE_KEYBINDS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '',
      'label.PIXIV_BLOCK_AI': '',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_BLOCKED_USERS': '',
      'users.add': '',
      'users.id': '',
      'users.invalid': '',
      'users.info': '',
      'label.PIXIV_BLOCKED_TAGS_FAST': '',
      'label.PIXIV_REMOVE_BLOCKED': '',
      'label.UTAGS_INTEGRATION': '',
      'label.UTAGS_BLOCKED_TAGS': '',
      'label.ENABLE_TIPPY_TOOLTIPS': '',
      'label.TIPPY_TOOLTIPS_STATIONARY_DELAY': '',
      'label.TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE': '',
      'label.TIPPY_TOOLTIPS_OPTIONS': '',
      'date.weekday': '',
      'date.era': '',
      'date.year': '',
      'date.month': '',
      'date.day': '',
      'date.dayPeriod': '',
      'date.hour': '',
      'date.minute': '',
      'date.second': '',
      'date.fractionalSecondDigits': '',
      'date.hour12': '',
      'date.hourCycle': '',
      'date.timeZoneName': '',
      'date.dateStyle': '',
      'date.timeStyle': '',
      'date.localeMatcher': '',
      'date.formatMatcher': '',
      'date.timeZone': '',
      'date.calendar': '',
      'date.numberingSystem': '',
    },
    zh: {
      'tab.General': '',
      'tab.Bookmarks': '',
      'tab.Filtering': '',
      'tab.Highlights': '',
      'tab.Tooltips': '',
      'tab.UTags': '',
      'tab.Advanced': '',
      'tab.Backup': '',
      settingsTitle: '',
      'language.auto': '',
      'language.en': '',
      'language.ja': '',
      'language.zh': '',
      'language.zh-Hant': '',
      'label.MODE': '',
      'label.SETTINGS_LANGUAGE': '',
      'label.PIXIV_BLOCKED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_COLOR': '',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '',
      'label.BACKUP_TOOLS': '',
      'rule.new': '',
      'rule.tagPattern': '',
      'rule.regex': '',
      'rule.flags': '',
      'rule.patternPlaceholder': '',
      'rule.regexInfo': '',
      'rule.add': '',
      'rule.addGroup': '',
      'rule.addInGroup': '',
      'rule.type': '',
      'rule.single': '',
      'rule.colored': '',
      'rule.groupColor': '',
      'rule.groupTags': '',
      'rule.collapse': '',
      'rule.expand': '',
      'rule.listRequired': '',
      'rule.needsText': '',
      'rule.groupLocation': '',
      'rule.location': '',
      'rule.blockedLocation': '',
      'rule.groupNeedsTags': '',
      'rule.combinedRegex': '',
      'rule.noFlags': '',
      'date.unspecified': '',
      'date.systemTimezone': '',
      'date.example': '',
      'date.invalid': '',
      'date.expectedObject': '',
      'text.explicitEmpty': '',
      'text.fallback': '',
      'sections.add': '',
      'sections.parent': '',
      'sections.header': '',
      'sections.images': '',
      'sections.info': '',
      'utags.add': '',
      'utags.tag': '',
      'utags.info': '',
      'backup.intro': '',
      'backup.placeholder': '',
      'backup.aria': '',
      'backup.export': '',
      'backup.copy': '',
      'backup.download': '',
      'backup.choose': '',
      'backup.import': '',
      'backup.emptyCopy': '',
      'backup.copied': '',
      'backup.clipboardFailed': '',
      'backup.emptyDownload': '',
      'backup.fileError': '',
      'backup.emptyImport': '',
      'backup.importConfirm': '',
      'backup.imported': '',
      'backup.importError': '',
      'backup.objectError': '',
      'backup.emptyObject': '',
      'field.debugInfo': '',
      'field.languageInfo': '',
      'field.highlightInfo': '',
      'field.tippyJson': '',
      'field.dateInfo': '',
      'field.selectorInfo': '',
      'field.keybindInfo': '',
      'field.blockAiInfo': '',
      'field.delayInfo': '',
      'field.toleranceInfo': '',
      'validation.object': '',
      'validation.arrayNull': '',
      'validation.arrayObjects': '',
      'validation.string': '',
      'action.reload': '',
      'action.save': '',
      'action.saved': '',
      'action.cancel': '',
      'action.reset': '',
      'action.importExport': '',
      'action.close': '',
      'message.save': '',
      'message.reset': '',
      'message.resetConfirm': '',
      'message.openError': '',
      'message.validation': '',
      'text.TEXT_EDIT_BOOKMARK': '',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.ENABLE_EDIT_BOOKMARK': '',
      'label.ENABLE_TOGGLE_BOOKMARKED': '',
      'label.TEXT_EDIT_BOOKMARK': '',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.SELECTORS_HOME': '',
      'label.SELECTORS_OWN_PROFILE': '',
      'label.SELECTORS_IMAGE': '',
      'label.SELECTORS_IMAGE_TITLE': '',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '',
      'label.SELECTORS_IMAGE_CONTROLS': '',
      'label.SELECTORS_IMAGE_BOOKMARKED': '',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '',
      'label.SELECTORS_MULTI_VIEW': '',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '',
      'label.SELECTORS_FOLLOW_BUTTON': '',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '',
      'label.SELECTORS_TAG_BUTTON': '',
      'label.DATE_CONVERSION': '',
      'label.DATE_CONVERSION_LOCALES': '',
      'label.DATE_CONVERSION_OPTIONS': '',
      'label.SELECTORS_DATE': '',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '',
      'label.ENABLE_KEYBINDS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '',
      'label.PIXIV_BLOCK_AI': '',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_BLOCKED_USERS': '',
      'users.add': '',
      'users.id': '',
      'users.invalid': '',
      'users.info': '',
      'label.PIXIV_BLOCKED_TAGS_FAST': '',
      'label.PIXIV_REMOVE_BLOCKED': '',
      'label.UTAGS_INTEGRATION': '',
      'label.UTAGS_BLOCKED_TAGS': '',
      'label.ENABLE_TIPPY_TOOLTIPS': '',
      'label.TIPPY_TOOLTIPS_STATIONARY_DELAY': '',
      'label.TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE': '',
      'label.TIPPY_TOOLTIPS_OPTIONS': '',
      'date.weekday': '',
      'date.era': '',
      'date.year': '',
      'date.month': '',
      'date.day': '',
      'date.dayPeriod': '',
      'date.hour': '',
      'date.minute': '',
      'date.second': '',
      'date.fractionalSecondDigits': '',
      'date.hour12': '',
      'date.hourCycle': '',
      'date.timeZoneName': '',
      'date.dateStyle': '',
      'date.timeStyle': '',
      'date.localeMatcher': '',
      'date.formatMatcher': '',
      'date.timeZone': '',
      'date.calendar': '',
      'date.numberingSystem': '',
    },
    'zh-Hant': {
      'tab.General': '',
      'tab.Bookmarks': '',
      'tab.Filtering': '',
      'tab.Highlights': '',
      'tab.Tooltips': '',
      'tab.UTags': '',
      'tab.Advanced': '',
      'tab.Backup': '',
      settingsTitle: '',
      'language.auto': '',
      'language.en': '',
      'language.ja': '',
      'language.zh': '',
      'language.zh-Hant': '',
      'label.MODE': '',
      'label.SETTINGS_LANGUAGE': '',
      'label.PIXIV_BLOCKED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS': '',
      'label.PIXIV_HIGHLIGHTED_COLOR': '',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '',
      'label.BACKUP_TOOLS': '',
      'rule.new': '',
      'rule.tagPattern': '',
      'rule.regex': '',
      'rule.flags': '',
      'rule.patternPlaceholder': '',
      'rule.regexInfo': '',
      'rule.add': '',
      'rule.addGroup': '',
      'rule.addInGroup': '',
      'rule.type': '',
      'rule.single': '',
      'rule.colored': '',
      'rule.groupColor': '',
      'rule.groupTags': '',
      'rule.collapse': '',
      'rule.expand': '',
      'rule.listRequired': '',
      'rule.needsText': '',
      'rule.groupLocation': '',
      'rule.location': '',
      'rule.blockedLocation': '',
      'rule.groupNeedsTags': '',
      'rule.combinedRegex': '',
      'rule.noFlags': '',
      'date.unspecified': '',
      'date.systemTimezone': '',
      'date.example': '',
      'date.invalid': '',
      'date.expectedObject': '',
      'text.explicitEmpty': '',
      'text.fallback': '',
      'sections.add': '',
      'sections.parent': '',
      'sections.header': '',
      'sections.images': '',
      'sections.info': '',
      'utags.add': '',
      'utags.tag': '',
      'utags.info': '',
      'backup.intro': '',
      'backup.placeholder': '',
      'backup.aria': '',
      'backup.export': '',
      'backup.copy': '',
      'backup.download': '',
      'backup.choose': '',
      'backup.import': '',
      'backup.emptyCopy': '',
      'backup.copied': '',
      'backup.clipboardFailed': '',
      'backup.emptyDownload': '',
      'backup.fileError': '',
      'backup.emptyImport': '',
      'backup.importConfirm': '',
      'backup.imported': '',
      'backup.importError': '',
      'backup.objectError': '',
      'backup.emptyObject': '',
      'field.debugInfo': '',
      'field.languageInfo': '',
      'field.highlightInfo': '',
      'field.tippyJson': '',
      'field.dateInfo': '',
      'field.selectorInfo': '',
      'field.keybindInfo': '',
      'field.blockAiInfo': '',
      'field.delayInfo': '',
      'field.toleranceInfo': '',
      'validation.object': '',
      'validation.arrayNull': '',
      'validation.arrayObjects': '',
      'validation.string': '',
      'action.reload': '',
      'action.save': '',
      'action.saved': '',
      'action.cancel': '',
      'action.reset': '',
      'action.importExport': '',
      'action.close': '',
      'message.save': '',
      'message.reset': '',
      'message.resetConfirm': '',
      'message.openError': '',
      'message.validation': '',
      'text.TEXT_EDIT_BOOKMARK': '',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.ENABLE_EDIT_BOOKMARK': '',
      'label.ENABLE_TOGGLE_BOOKMARKED': '',
      'label.TEXT_EDIT_BOOKMARK': '',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '',
      'label.SELECTORS_HOME': '',
      'label.SELECTORS_OWN_PROFILE': '',
      'label.SELECTORS_IMAGE': '',
      'label.SELECTORS_IMAGE_TITLE': '',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '',
      'label.SELECTORS_IMAGE_CONTROLS': '',
      'label.SELECTORS_IMAGE_BOOKMARKED': '',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '',
      'label.SELECTORS_MULTI_VIEW': '',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '',
      'label.SELECTORS_FOLLOW_BUTTON': '',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '',
      'label.SELECTORS_TAG_BUTTON': '',
      'label.DATE_CONVERSION': '',
      'label.DATE_CONVERSION_LOCALES': '',
      'label.DATE_CONVERSION_OPTIONS': '',
      'label.SELECTORS_DATE': '',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '',
      'label.ENABLE_KEYBINDS': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '',
      'label.PIXIV_BLOCK_AI': '',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '',
      'label.PIXIV_BLOCKED_USERS': '',
      'users.add': '',
      'users.id': '',
      'users.invalid': '',
      'users.info': '',
      'label.PIXIV_BLOCKED_TAGS_FAST': '',
      'label.PIXIV_REMOVE_BLOCKED': '',
      'label.UTAGS_INTEGRATION': '',
      'label.UTAGS_BLOCKED_TAGS': '',
      'label.ENABLE_TIPPY_TOOLTIPS': '',
      'label.TIPPY_TOOLTIPS_STATIONARY_DELAY': '',
      'label.TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE': '',
      'label.TIPPY_TOOLTIPS_OPTIONS': '',
      'date.weekday': '',
      'date.era': '',
      'date.year': '',
      'date.month': '',
      'date.day': '',
      'date.dayPeriod': '',
      'date.hour': '',
      'date.minute': '',
      'date.second': '',
      'date.fractionalSecondDigits': '',
      'date.hour12': '',
      'date.hourCycle': '',
      'date.timeZoneName': '',
      'date.dateStyle': '',
      'date.timeStyle': '',
      'date.localeMatcher': '',
      'date.formatMatcher': '',
      'date.timeZone': '',
      'date.calendar': '',
      'date.numberingSystem': '',
    },
  };

  const browserSettingsLocale = () => {
    for (const code of navigator.languages?.length ? navigator.languages : [navigator.language || 'en']) {
      const language = String(code).toLowerCase();
      const primary = language.split('-')[0];
      if (primary === 'ja' || primary === 'en') return primary;
      if (primary === 'zh') {
        return /^zh-(?:tw|hk|mo|hant)(?:-|$)/.test(language) ? 'zh-Hant' : 'zh';
      }
    }
    return 'en';
  };
  const resolveSettingsLocale = choice => ['en', 'ja', 'zh', 'zh-Hant'].includes(choice)
    ? choice
    : browserSettingsLocale();
  let settingsUiLocale = resolveSettingsLocale(ENV.SETTINGS_LANGUAGE);
  const tr = (key, replacements = {}, locale = settingsUiLocale) => {
    const template = I18N[locale]?.[key] || I18N.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(replacements, name) ? String(replacements[name]) : match);
  };

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

  // Empty highlight-color overrides use the built-in default at runtime.
  // Keep storage unchanged (including explicit empty strings).
  if (CONFIG.PIXIV_HIGHLIGHTED_COLOR === '') {
    CONFIG.PIXIV_HIGHLIGHTED_COLOR = ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR;
  }

  // Runtime UI text comes from i18n only when a TEXT_* override is nullish.
  // An explicitly stored empty string is a deliberate override, not a fallback.
  for (const key of Object.keys(ENV_DEFAULTS)) {
    if (key.startsWith('TEXT_') && CONFIG[key] == null) CONFIG[key] = tr(`text.${key}`);
  }

  let logDebug = () => {};
  if (CONFIG.MODE !== 'PROD') {
    logDebug = tlog;
    for (const key of Object.keys(CONFIG)) {
      log(`${key} =`, CONFIG[key]);
    }
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
      let dateText = element.textContent.trim();
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
    duplicateDate.textContent = prefix + dateString;
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

  /** SETTINGS PANEL (gmConfig 1.0.0, existing per-key GM storage) **/

  // The library has no public storage adapter. Its TypeScript-private _load method and
  // public save method can be overridden without changing the distributed library.
  // Keep @kobzi/gmconfig pinned to 1.0.0: these method names are not public API.
  const settingsJson = value => JSON.stringify(value, null, 2);
  const regexRuleTitle = rule => rule.regex
    ? `/${String(rule.value || '').replace(/(^|[^\\])\//g, '$1\\/')}/${rule.flags || ''}`
    : rule.value || tr('rule.new');
  const isPlainObject = value => value !== null && typeof value === 'object' &&
    !Array.isArray(value);

  const editorTag = value => Array.isArray(value)
    ? { value: value[0], regex: true, flags: value[1] || '' }
    : { value, regex: false, flags: '' };
  const storedTag = value => value.regex ? [value.value, value.flags || ''] : value.value;

  const tagsToEditor = (value, highlighted = false) => {
    if (typeof value === 'string') value = value.split(',').map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(value)) return [];
    if (!highlighted) return value.map(editorTag);
    return value.map(entry => isPlainObject(entry)
      ? {
          type: 'group',
          value: '',
          regex: false,
          flags: '',
          color: entry.color || '',
          tags: Array.isArray(entry.tags) ? entry.tags.map(editorTag) : []
        }
      : { type: 'tag', color: '', tags: [], ...editorTag(entry) });
  };

  const tagsFromEditor = (value, highlighted = false) => {
    if (!Array.isArray(value)) return [];
    if (!highlighted) return value.map(storedTag);
    return value.map(entry => entry.type === 'group'
      ? {
          tags: (entry.tags || []).map(storedTag),
          ...(entry.color ? { color: entry.color } : {})
        }
      : storedTag(entry));
  };

  const sectionSelectorKeys = ['selectorParent', 'selectorHeader', 'selectorImagesContainer'];
  const sectionsToEditor = value => Array.isArray(value)
    ? value.map(entry =>
      Object.fromEntries(sectionSelectorKeys.map(key => [key,
        Array.isArray(entry[key]) ? entry[key].join('\n') : entry[key] || ''])))
    : [];
  const sectionsFromEditor = (value, previous) => {
    if (!value.length && previous == null) return null;
    return value.map(entry => Object.fromEntries(sectionSelectorKeys.map(key => {
      const lines = entry[key].split('\n').map(v => v.trim()).filter(Boolean);
      // Preserve selector arrays across edits and reordering; never reformat CSS commas.
      const matching = Array.isArray(previous) && previous.find(item =>
        Array.isArray(item[key]) && item[key].join('\n') === entry[key]);
      return [key, matching || lines.length > 1 ? lines : lines.join(', ')];
    })));
  };
  const utagsToEditor = value => (Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',').map(v => v.trim()).filter(Boolean) : [])
    .map(value => ({ value }));
  const utagsFromEditor = value => value.map(rule => rule.value);

  // Keep Pixiv user IDs as strings, including any leading zeroes. Never use
  // a numeric input, since converting large IDs to Number can lose precision.
  const isPixivUserId = value => typeof value === 'string' && /^[0-9]+$/.test(value);
  const blockedUsersToEditor = value => Array.isArray(value)
    ? value.map(userId => ({ userId }))
    : [];
  const validateBlockedUsersEditor = value => Array.isArray(value) &&
    value.every(entry => isPlainObject(entry) && isPixivUserId(entry.userId));
  const blockedUsersFromEditor = value => {
    if (!validateBlockedUsersEditor(value)) throw new TypeError(tr('users.invalid'));
    return value.map(entry => entry.userId);
  };

  const localizedTextField = key => ({
    render: () => {
      const root = document.createElement('div');
      root.className = 'pixiv-utils-text-editor';
      const input = document.createElement('input');
      input.id = key;
      input.type = 'text';
      input.className = 'gc-c';
      input.placeholder = tr(`text.${key}`);
      const label = document.createElement('label');
      label.className = 'pixiv-utils-empty-override';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const span = document.createElement('span');
      span.textContent = tr('text.explicitEmpty');
      label.append(checkbox, span);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) input.value = '';
        input.disabled = checkbox.checked;
        // A change on the checkbox still needs to update gmConfig's dirty state.
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      root.append(input, label);
      root._textInput = input;
      root._emptyOverride = checkbox;
      return root;
    },
    get: element => element._emptyOverride.checked ? '' : element._textInput.value || null,
    set: (element, value) => {
      element._emptyOverride.checked = value === '';
      element._textInput.value = value || '';
      element._textInput.disabled = value === '';
    }
  });

  const validateTagRules = (value, highlighted = false, combine = true) => {
    if (!Array.isArray(value)) return tr('rule.listRequired');
    const compiledGroups = new Map();
    const check = (rules, location) => {
      for (const rule of rules) {
        if (!rule || typeof rule.value !== 'string') return tr('rule.needsText', { location });
        if (!rule.regex) continue;
        const flags = rule.flags || '';
        try { RegExp(rule.value, flags); } catch (error) { return `${location}: ${error.message}`; }
        // Mirrors the runtime's grouping by the exact flags string.
        if (combine) {
          if (!compiledGroups.has(flags)) compiledGroups.set(flags, []);
          compiledGroups.get(flags).push(rule.value);
        }
      }
      return '';
    };
    let error = '';
    if (highlighted) {
      for (const [index, entry] of value.entries()) {
        if (entry.type === 'group') {
          if (!Array.isArray(entry.tags)) return tr('rule.groupNeedsTags', { number: index + 1 });
          error = check(entry.tags, tr('rule.groupLocation', { number: index + 1 }));
        } else {
          error = check([entry], tr('rule.location', { number: index + 1 }));
        }
        if (error) return error;
      }
    } else if ((error = check(value, tr('rule.blockedLocation')))) return error;
    if (combine) {
      for (const [flags, sources] of compiledGroups) {
        try { RegExp(sources.join('|'), flags); } catch (err) { return tr('rule.combinedRegex', { flags: flags || tr('rule.noFlags'), error: err.message }); }
      }
    }
    return '';
  };

  const tagRuleSchema = () => ({
    value: {
      type: 'text',
      label: tr('rule.tagPattern'),
      default: '',
      row: 'rule',
      placeholder: tr('rule.patternPlaceholder')
    },
    regex: { type: 'checkbox', label: tr('rule.regex'), default: false, row: 'rule' },
    flags: {
      type: 'text',
      label: tr('rule.flags'),
      default: '',
      row: 'rule',
      placeholder: 'i',
      depends: v => Boolean(v.regex)
    }
  });

  const dateOptionChoices = {
    weekday: ['', 'long', 'short', 'narrow'],
    era: ['', 'long', 'short', 'narrow'],
    year: ['', 'numeric', '2-digit'],
    month: ['', 'numeric', '2-digit', 'long', 'short', 'narrow'],
    day: ['', 'numeric', '2-digit'],
    dayPeriod: ['', 'narrow', 'short', 'long'],
    hour: ['', 'numeric', '2-digit'],
    minute: ['', 'numeric', '2-digit'],
    second: ['', 'numeric', '2-digit'],
    fractionalSecondDigits: ['', '1', '2', '3'],
    hour12: ['', 'true', 'false'],
    hourCycle: ['', 'h11', 'h12', 'h23', 'h24'],
    timeZoneName: ['', 'short', 'long', 'shortOffset', 'longOffset', 'shortGeneric', 'longGeneric'],
    dateStyle: ['', 'full', 'long', 'medium', 'short'],
    timeStyle: ['', 'full', 'long', 'medium', 'short'],
    localeMatcher: ['', 'lookup', 'best fit'],
    formatMatcher: ['', 'basic', 'best fit']
  };
  const dateTextOptions = ['timeZone', 'calendar', 'numberingSystem'];
  const dateKnownOptions = [...Object.keys(dateOptionChoices), ...dateTextOptions];

  const dateOptionsField = {
    render: field => {
      const root = document.createElement('div');
      root.id = 'DATE_CONVERSION_OPTIONS';
      root.className = 'pixiv-utils-date-editor';
      root._extraDateOptions = {};
      for (const key of dateKnownOptions) {
        const label = document.createElement('label');
        label.textContent = tr(`date.${key}`);
        let input;
        if (key in dateOptionChoices) {
          input = document.createElement('select');
          for (const option of dateOptionChoices[key]) {
            const el = document.createElement('option');
            el.value = option;
            el.textContent = option === '' ? tr('date.unspecified') : option;
            input.append(el);
          }
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.placeholder = key === 'timeZone' ? tr('date.systemTimezone') : tr('date.unspecified');
        }
        input.dataset.dateOption = key;
        label.append(input);
        root.append(label);
      }
      const preview = document.createElement('output');
      preview.className = 'pixiv-utils-date-preview';
      root.append(preview);
      const read = () => {
        const result = { ...root._extraDateOptions };
        for (const input of root.querySelectorAll('[data-date-option]')) {
          const key = input.dataset.dateOption;
          if (input.value !== '') {
            result[key] = key === 'hour12'
              ? input.value === 'true'
              : key === 'fractionalSecondDigits' ? Number(input.value) : input.value;
          }
        }
        return result;
      };
      const updatePreview = () => {
        try {
          const options = read();
          preview.textContent = tr('date.example', {
            value: new Intl.DateTimeFormat(
              CONFIG.DATE_CONVERSION_LOCALES, options).format(new Date('2026-10-22T12:34:56Z'))
          });
          preview.title = '';
        } catch (error) {
          preview.textContent = tr('date.invalid', { error: error.message });
        }
      };
      root._readDate = read;
      root._updatePreview = updatePreview;
      root.addEventListener('input', updatePreview);
      root.addEventListener('change', updatePreview);
      return root;
    },
    get: element => element._readDate(),
    set: (element, value) => {
      const options = isPlainObject(value) ? value : {};
      element._extraDateOptions = Object.fromEntries(
        Object.entries(options).filter(([key]) => !dateKnownOptions.includes(key)));
      for (const input of element.querySelectorAll('[data-date-option]')) {
        const v = options[input.dataset.dateOption];
        input.value = v == null ? '' : String(v);
      }
      element._updatePreview();
    },
    validate: value => {
      if (!isPlainObject(value)) return tr('date.expectedObject');
      try { Intl.DateTimeFormat(CONFIG.DATE_CONVERSION_LOCALES, value); } catch (error) { return error.message; }
      return '';
    }
  };

  const jsonObjectField = (nullable = false) => ({
    type: 'textarea',
    rows: 9,
    attrs: { spellcheck: 'false' },
    validate: value => {
      try {
        const parsed = JSON.parse(value);
        if (nullable ? (parsed !== null && !Array.isArray(parsed)) : !isPlainObject(parsed)) {
          return tr(nullable ? 'validation.arrayNull' : 'validation.object');
        }
        if (nullable && Array.isArray(parsed) &&
          !parsed.every(entry => isPlainObject(entry))) return tr('validation.arrayObjects');
      } catch (error) { return error.message; }
      return '';
    }
  });

  // UI serialization only. No storage changes occur until Save, Reset or Import.
  const settingToEditor = (key, value) => {
    if (key === 'MODE') return value === 'DEBUG';
    if (key === 'SECTIONS_TOGGLE_BOOKMARKED') return sectionsToEditor(value);
    if (key === 'UTAGS_BLOCKED_TAGS') return utagsToEditor(value);
    if (key === 'PIXIV_BLOCKED_USERS') return blockedUsersToEditor(value);
    if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
      return tagsToEditor(value, key === 'PIXIV_HIGHLIGHTED_TAGS');
    }
    if (key === 'TIPPY_TOOLTIPS_OPTIONS') return settingsJson(value);
    if (key.startsWith('SELECTORS_')) return Array.isArray(value) ? value.join('\n') : value || '';
    return value;
  };

  const editorToSetting = (key, value, previous) => {
    if (key === 'MODE') return value ? 'DEBUG' : 'PROD';
    if (key === 'SECTIONS_TOGGLE_BOOKMARKED') return sectionsFromEditor(value, previous);
    if (key === 'UTAGS_BLOCKED_TAGS') return utagsFromEditor(value);
    if (key === 'PIXIV_BLOCKED_USERS') return blockedUsersFromEditor(value);
    if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
      return tagsFromEditor(value, key === 'PIXIV_HIGHLIGHTED_TAGS');
    }
    if (key === 'TIPPY_TOOLTIPS_OPTIONS') return JSON.parse(value);
    if (key.startsWith('SELECTORS_')) {
      return Array.isArray(previous)
        ? value.split('\n').map(s => s.trim()).filter(Boolean)
        : value || null;
    }
    return value;
  };

  const settingsTab = key => {
    if (key === 'SETTINGS_LANGUAGE' || key === 'DATE_CONVERSION' || key.startsWith('DATE_CONVERSION_') ||
      key === 'ENABLE_KEYBINDS' || key === 'REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME') return 'General';
    if (key.includes('BOOKMARK') && !key.startsWith('SELECTORS_') &&
      key !== 'SECTIONS_TOGGLE_BOOKMARKED') return 'Bookmarks';
    if (key.startsWith('PIXIV_HIGHLIGHTED')) return 'Highlights';
    if (key.startsWith('PIXIV_')) return 'Filtering';
    if (key.startsWith('TIPPY_') || key === 'ENABLE_TIPPY_TOOLTIPS') return 'Tooltips';
    if (key.startsWith('UTAGS_')) return 'UTags';
    return 'Advanced';
  };
  const makeSettingsDefinitions = () => {
    const definitions = {};
    const tabOrder = ['General', 'Bookmarks', 'Filtering', 'Highlights', 'Tooltips', 'UTags', 'Advanced'];
    const options = Object.entries(ENV_DEFAULTS).sort(([a], [b]) =>
      Number(b === 'SETTINGS_LANGUAGE') - Number(a === 'SETTINGS_LANGUAGE') ||
      tabOrder.indexOf(settingsTab(a)) - tabOrder.indexOf(settingsTab(b)) ||
      Number(b === 'PIXIV_HIGHLIGHTED_COLOR') - Number(a === 'PIXIV_HIGHLIGHTED_COLOR'));
    for (const [key, fallback] of options) {
      const field = { label: tr(`label.${key}`), tab: tr(`tab.${settingsTab(key)}`), default: settingToEditor(key, fallback) };
      if (key === 'MODE') {
        field.type = 'checkbox';
        field.label = tr('label.MODE');
        field.description = tr('field.debugInfo');
      } else if (key === 'SETTINGS_LANGUAGE') {
        field.type = 'select';
        field.options = {
          auto: tr('language.auto'),
          en: tr('language.en'),
          ja: tr('language.ja'),
          zh: tr('language.zh'),
          'zh-Hant': tr('language.zh-Hant')
        };
        field.description = tr('field.languageInfo');
      } else if (key.startsWith('TEXT_')) {
        Object.assign(field, localizedTextField(key));
      } else if (typeof fallback === 'boolean') field.type = 'checkbox';
      else if (typeof fallback === 'number') { field.type = 'number'; field.min = 0; } else if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
        const highlighted = key === 'PIXIV_HIGHLIGHTED_TAGS';
        field.type = 'list';
        field.addLabel = tr(highlighted ? 'rule.addGroup' : 'rule.add');
        field.reorder = true;
        field.itemTitle = (r, i) => `${i + 1}. ${r.type === 'group' ? tr('rule.colored') : regexRuleTitle(r)}`;
        field.item = highlighted
          ? {
              type: {
                type: 'select',
                label: tr('rule.type'),
                default: 'tag',
                options: { tag: tr('rule.single'), group: tr('rule.colored') }
              },
              value: { ...tagRuleSchema().value, depends: r => r.type !== 'group' },
              regex: { ...tagRuleSchema().regex, depends: r => r.type !== 'group' },
              flags: { ...tagRuleSchema().flags, depends: r => r.type !== 'group' && r.regex },
              color: {
                type: 'text',
                label: tr('rule.groupColor'),
                default: '',
                placeholder: ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR,
                depends: r => r.type === 'group'
              },
              tags: {
                type: 'list',
                label: tr('rule.groupTags'),
                default: [],
                item: tagRuleSchema(),
                itemTitle: (r, i) => `${i + 1}. ${regexRuleTitle(r)}`,
                addLabel: tr('rule.addInGroup'),
                reorder: true,
                depends: r => r.type === 'group'
              }
            }
          : tagRuleSchema();
        field.validate = value => validateTagRules(value, highlighted,
          Boolean(document.querySelector('.gc-p')
            ? (key === 'PIXIV_BLOCKED_TAGS'
                ? document.querySelector('.gc-p input[id="PIXIV_BLOCKED_TAGS_COMBINE_REGEXES"]')?.checked
                : document.querySelector('.gc-p input[id="PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES"]')?.checked)
            : ENV[key === 'PIXIV_BLOCKED_TAGS'
              ? 'PIXIV_BLOCKED_TAGS_COMBINE_REGEXES'
              : 'PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES']));
        field.description = tr('rule.regexInfo');
      } else if (key === 'DATE_CONVERSION_OPTIONS') {
        Object.assign(field, dateOptionsField);
        field.description = tr('field.dateInfo');
      } else if (key === 'TIPPY_TOOLTIPS_OPTIONS') {
        Object.assign(field, jsonObjectField());
        field.description = tr('field.tippyJson');
      } else if (key === 'SECTIONS_TOGGLE_BOOKMARKED') {
        field.type = 'list';
        field.addLabel = tr('sections.add');
        field.reorder = true;
        field.itemTitle = (entry, index) => `${index + 1}. ${entry.selectorParent || tr('sections.parent')}`;
        field.item = {
          selectorParent: {
            type: 'textarea',
            rows: 2,
            required: true,
            default: '',
            label: tr('sections.parent')
          },
          selectorHeader: {
            type: 'textarea',
            rows: 2,
            required: true,
            default: '',
            label: tr('sections.header')
          },
          selectorImagesContainer: {
            type: 'textarea',
            rows: 2,
            required: true,
            default: '',
            label: tr('sections.images')
          }
        };
        field.description = tr('sections.info');
        field.validate = value => {
          for (const entry of value) {
            const values = [entry.selectorParent, entry.selectorHeader, entry.selectorImagesContainer];
            if (values.some(v => !v?.trim())) return tr('sections.info');
          }
          return '';
        };
      } else if (key === 'PIXIV_BLOCKED_USERS') {
        field.type = 'list';
        field.addLabel = tr('users.add');
        field.reorder = true;
        field.itemTitle = (entry, index) => `${index + 1}. ${entry.userId || tr('users.id')}`;
        field.item = {
          userId: {
            type: 'text',
            label: tr('users.id'),
            default: '',
            required: true,
            attrs: { inputmode: 'numeric', pattern: '[0-9]+' }
          }
        };
        field.description = tr('users.info');
        field.validate = value => validateBlockedUsersEditor(value) ? '' : tr('users.invalid');
      } else if (key === 'UTAGS_BLOCKED_TAGS') {
        field.type = 'list';
        field.addLabel = tr('utags.add');
        field.reorder = true;
        field.itemTitle = (entry, index) => `${index + 1}. ${entry.value || tr('utags.tag')}`;
        field.item = {
          value: { type: 'text', label: tr('utags.tag'), default: '', required: true }
        };
        field.description = tr('utags.info');
        field.validate = value => value.some(entry => !entry.value?.trim()) ? tr('validation.string') : '';
      } else if (key.startsWith('SELECTORS_')) {
        field.type = 'textarea'; field.rows = 3;
      } else if (typeof fallback === 'string') {
        field.type = 'text';
        if (key === 'PIXIV_HIGHLIGHTED_COLOR') {
          field.description = tr('field.highlightInfo');
          field.placeholder = ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR;
        }
      } else {
        field.type = 'textarea'; field.rows = 5;
        field.validate = value => { try { JSON.parse(value); } catch (e) { return e.message; } return ''; };
      }
      if (key === 'ENABLE_KEYBINDS') field.description = tr('field.keybindInfo');
      if (key === 'PIXIV_BLOCK_AI') field.description = tr('field.blockAiInfo');
      if (key === 'TIPPY_TOOLTIPS_STATIONARY_DELAY') field.description = tr('field.delayInfo');
      if (key === 'TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE') field.description = tr('field.toleranceInfo');
      definitions[key] = field;
    }
    // Backup controls are managed locally and never persisted as configuration values.
    definitions.BACKUP_TOOLS = {
      tab: 'Backup',
      label: tr('label.BACKUP_TOOLS'),
      save: false,
      default: '',
      ...backupField
    };
    return definitions;
  };

  // Validate a backup as one unit before writing any GM storage keys. Existing
  // per-key storage and partial-import semantics are preserved.
  const validateBackupSettings = imported => {
    if (!isPlainObject(imported)) throw new TypeError(tr('backup.objectError'));
    const get = key => Object.hasOwn(imported, key) ? imported[key] : GM_getValue(key, ENV_DEFAULTS[key]);
    const textRuleValid = value => typeof value === 'string' ||
      (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' &&
        typeof value[1] === 'string' && (() => {
        try { RegExp(value[0], value[1]); return true; } catch { return false; }
      })());
    const validateTagArray = (key, value, highlighted) => {
      if (value === null) return;
      // Keep compatibility with legacy comma-separated custom-tag settings.
      if (typeof value === 'string') value = value.split(',').map(tag => tag.trim()).filter(Boolean);
      if (!Array.isArray(value)) throw new TypeError(`${key}: expected a list, string, or null.`);
      for (const entry of value) {
        if (highlighted && isPlainObject(entry)) {
          if (!Array.isArray(entry.tags) || !entry.tags.every(textRuleValid) ||
            (entry.color !== undefined && typeof entry.color !== 'string')) {
            throw new TypeError(`${key}: invalid colored group.`);
          }
        } else if (!textRuleValid(entry)) {
          throw new TypeError(`${key}: invalid literal tag or regex [pattern, flags].`);
        }
      }
      const error = validateTagRules(tagsToEditor(value, highlighted), highlighted,
        Boolean(get(`${key}_COMBINE_REGEXES`)));
      if (error) throw new TypeError(`${key}: ${error}`);
    };
    for (const [key, value] of Object.entries(imported)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw new TypeError(`Unsafe setting name: ${key}`);
      }
      if (!Object.hasOwn(ENV_DEFAULTS, key)) {
        // Preserve old/extra preference keys in backups; only known config keys
        // have schemas. This retains the original partial-import semantics.
        if (key === 'PREF_TOGGLE_BOOKMARKED_MODE' &&
          (!Number.isInteger(value) || value < 0 || value > 2)) {
          throw new TypeError(`${key}: expected an integer between 0 and 2.`);
        }
        continue;
      }
      const def = ENV_DEFAULTS[key];
      if (key === 'MODE') {
        if (!['DEBUG', 'PROD'].includes(value)) throw new TypeError('MODE: expected DEBUG or PROD.');
      } else if (key === 'SETTINGS_LANGUAGE') {
        if (!['auto', 'en', 'ja', 'zh', 'zh-Hant'].includes(value)) {
          throw new TypeError(`${key}: unsupported language.`);
        }
      } else if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
        validateTagArray(key, value, key === 'PIXIV_HIGHLIGHTED_TAGS');
      } else if (key === 'PIXIV_BLOCKED_USERS') {
        if (!Array.isArray(value) || !value.every(isPixivUserId)) {
          throw new TypeError(`${key}: ${tr('users.invalid')}`);
        }
      } else if (key === 'UTAGS_BLOCKED_TAGS') {
        if (typeof value !== 'string' &&
          !(Array.isArray(value) && value.every(item => typeof item === 'string'))) {
          throw new TypeError(`${key}: expected a string or array of strings.`);
        }
      } else if (key === 'SECTIONS_TOGGLE_BOOKMARKED') {
        if (value !== null && (!Array.isArray(value) || !value.every(section =>
          isPlainObject(section) && sectionSelectorKeys.every(name =>
            (typeof section[name] === 'string' && section[name].trim()) ||
            (Array.isArray(section[name]) && section[name].length > 0 &&
              section[name].every(selector => typeof selector === 'string' && selector.trim())))))) {
          throw new TypeError(`${key}: expected sections containing all three selectors.`);
        }
      } else if (key.startsWith('SELECTORS_')) {
        if (value !== null && typeof value !== 'string' &&
          !(Array.isArray(value) && value.every(item => typeof item === 'string'))) {
          throw new TypeError(`${key}: expected a selector string, array, or null.`);
        }
      } else if (key === 'DATE_CONVERSION_OPTIONS') {
        if (!isPlainObject(value)) throw new TypeError(`${key}: expected an object.`);
        try {
          Intl.DateTimeFormat(get('DATE_CONVERSION_LOCALES'), value);
        } catch (error) { throw new TypeError(`${key}: ${error.message}`); }
      } else if (key === 'DATE_CONVERSION_LOCALES') {
        if (typeof value !== 'string') throw new TypeError(`${key}: expected a locale string.`);
        try { Intl.DateTimeFormat(value, get('DATE_CONVERSION_OPTIONS')); } catch (error) { throw new TypeError(`${key}: ${error.message}`); }
      } else if (key === 'TIPPY_TOOLTIPS_OPTIONS') {
        if (!isPlainObject(value)) throw new TypeError(`${key}: expected a JSON object.`);
      } else if (key.startsWith('TEXT_') || def === null) {
        if (value !== null && typeof value !== 'string') {
          throw new TypeError(`${key}: expected a string or null.`);
        }
      } else if (typeof def === 'boolean') {
        if (typeof value !== 'boolean') throw new TypeError(`${key}: expected a boolean.`);
      } else if (typeof def === 'number') {
        if (!Number.isFinite(value) || value < 0) {
          throw new TypeError(`${key}: expected a non-negative number.`);
        }
      } else if (typeof def === 'string' && typeof value !== 'string') {
        throw new TypeError(`${key}: expected a string.`);
      }
    }
  };

  const importExistingSettings = async (json, panel = settingsPanel) => {
    try {
      const imported = JSON.parse(json);
      if (!isPlainObject(imported)) throw new TypeError(tr('backup.objectError'));
      if (!Object.keys(imported).length) throw new Error(tr('backup.emptyObject'));
      validateBackupSettings(imported);
      if (!window.confirm(tr('backup.importConfirm', { count: Object.keys(imported).length }))) return false;
      GM_setValues(imported); // Same per-key storage and partial-import behavior as before.
      if (panel?.isOpen) {
        const latest = GM_getValues(Object.keys(ENV_DEFAULTS));
        for (const key of Object.keys(ENV_DEFAULTS)) {
          panel.set(key, settingToEditor(key, latest[key] == null ? ENV_DEFAULTS[key] : latest[key]));
        }
        // Update the stored-value baseline, so Save doesn't undo imported values.
        await panel._load();
        panel._mark();
        syncColoredGroupToggles();
        syncSettingsDecorations();
        initListOrderControls(panel);
      }
      alert(tr('backup.imported'));
      return true;
    } catch (error) {
      alert(tr('backup.importError', { error: error.message }));
      return false;
    }
  };

  const backupField = {
    render: () => {
      const root = document.createElement('div');
      root.className = 'pixiv-utils-backup';
      const instructions = document.createElement('p');
      instructions.textContent = tr('backup.intro');
      const textarea = document.createElement('textarea');
      textarea.rows = 16;
      textarea.placeholder = tr('backup.placeholder');
      textarea.spellcheck = false;
      textarea.setAttribute('aria-label', tr('backup.aria'));
      const buttons = document.createElement('div');
      buttons.className = 'pixiv-utils-backup-buttons';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.hidden = true;
      const addButton = (label, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        buttons.append(button);
        return button;
      };
      addButton(tr('backup.export'), () => {
        textarea.value = settingsJson(GM_getValues(GM_listValues()));
      });
      addButton(tr('backup.copy'), async () => {
        if (!textarea.value.trim()) return alert(tr('backup.emptyCopy'));
        try {
          await navigator.clipboard.writeText(textarea.value);
          alert(tr('backup.copied'));
        } catch (error) {
          textarea.focus();
          textarea.select();
          alert(tr('backup.clipboardFailed'));
        }
      });
      addButton(tr('backup.download'), () => {
        if (!textarea.value.trim()) return alert(tr('backup.emptyDownload'));
        const blob = new Blob([textarea.value], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Bobbys_Pixiv_Utils_Settings.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      addButton(tr('backup.choose'), () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try { textarea.value = await file.text(); } catch (error) { alert(tr('backup.fileError', { error: error.message })); }
        fileInput.value = '';
      });
      addButton(tr('backup.import'), () => {
        if (!textarea.value.trim()) return alert(tr('backup.emptyImport'));
        importExistingSettings(textarea.value);
      });
      root.append(instructions, textarea, buttons, fileInput);
      return root;
    },
    get: () => '',
    set: () => {}
  };

  // Keep all visual-only list helpers independent of the underlying stored rule values.
  const getSettingsHighlightColor = () =>
    document.querySelector('.gc-p input[id="PIXIV_HIGHLIGHTED_COLOR"]')?.value.trim() ||
    ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR;

  const updateColorInputBorder = (input, fallback = '') => {
    const color = input.value.trim() || fallback;
    // Native color parsing accepts named colors, rgb(), transparent, etc.
    if (color && CSS.supports('color', color)) {
      input.style.borderColor = color;
      // An outer ring thickens the visual border without changing element dimensions.
      input.style.boxShadow = `0 0 0 1px ${color}`;
    } else {
      input.style.removeProperty('border-color');
      input.style.removeProperty('box-shadow');
    }
  };

  const syncColoredGroupToggles = (scope = document) => {
    const groups = scope.matches?.('.gc-g:has(> .gc-list[id$="_tags"])')
      ? [scope]
      : scope.querySelectorAll('.gc-p .gc-g:has(> .gc-list[id$="_tags"]), .gc-g:has(> .gc-list[id$="_tags"])');
    for (const container of groups) {
      const list = container.querySelector(':scope > .gc-list');
      const hasTags = Boolean(list?.querySelector(':scope > .gc-list-items > .gc-li'));
      let button = container.querySelector(':scope > .pixiv-utils-collapse-group');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'pixiv-utils-collapse-group';
        // Existing groups default to collapsed; new empty groups stay expanded.
        container.classList.toggle('pixiv-utils-nested-collapsed', hasTags);
        button.addEventListener('click', () => {
          container.classList.toggle('pixiv-utils-nested-collapsed');
          syncColoredGroupToggles();
        });
        container.querySelector(':scope > label')?.after(button);
      }
      if (!hasTags) container.classList.remove('pixiv-utils-nested-collapsed');
      const collapsed = container.classList.contains('pixiv-utils-nested-collapsed');
      button.textContent = tr(collapsed ? 'rule.expand' : 'rule.collapse');
      button.setAttribute('aria-expanded', String(!collapsed));
      button.hidden = !hasTags;

      const input = container.closest('.gc-li-b')?.querySelector('input[id$="_color"]');
      if (input) {
        input.placeholder = getSettingsHighlightColor();
        if (!input.dataset.pixivUtilsColorListener) {
          input.addEventListener('input', () => updateColorInputBorder(input, getSettingsHighlightColor()));
          input.dataset.pixivUtilsColorListener = 'true';
        }
        updateColorInputBorder(input, getSettingsHighlightColor());
      }
    }
  };

  // Shared notices and section dividers are rendered once per panel/reinit. The
  // underlying setting fields retain their original IDs and value adapters.
  const syncSettingsDecorations = () => {
    const fieldGroup = key => document.getElementById(key)?.closest('.gc-g');
    const insertBefore = (key, className, content = '') => {
      const group = fieldGroup(key);
      if (!group || group.parentElement.querySelector(`:scope > .${className}[data-before="${key}"]`)) return;
      const node = document.createElement('div');
      node.className = className;
      node.dataset.before = key;
      if (content) node.textContent = content;
      group.before(node);
    };
    for (const key of ['DATE_CONVERSION', 'REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME',
      'TEXT_EDIT_BOOKMARK', 'PIXIV_BLOCKED_TAGS', 'PIXIV_BLOCKED_USERS',
      'PIXIV_BLOCKED_TAGS_FAST', 'PIXIV_HIGHLIGHTED_TAGS',
      'TIPPY_TOOLTIPS_STATIONARY_DELAY', 'UTAGS_BLOCKED_TAGS',
      'SELECTORS_HOME', 'SECTIONS_TOGGLE_BOOKMARKED', 'TIPPY_TOOLTIPS_OPTIONS']) {
      insertBefore(key, 'pixiv-utils-settings-divider');
    }
    insertBefore('TEXT_EDIT_BOOKMARK', 'pixiv-utils-global-note', tr('text.fallback'));
    insertBefore('SELECTORS_HOME', 'pixiv-utils-global-note', tr('field.selectorInfo'));
    const mainColor = document.querySelector('.gc-p input[id="PIXIV_HIGHLIGHTED_COLOR"]');
    if (mainColor) {
      if (!mainColor.dataset.pixivUtilsColorListener) {
        mainColor.addEventListener('input', () => {
          updateColorInputBorder(mainColor, ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR);
          // Empty group colors inherit the actively edited main highlight color.
          for (const groupColor of document.querySelectorAll('.gc-p input[id$="_color"]')) {
            groupColor.placeholder = getSettingsHighlightColor();
            if (!groupColor.value.trim()) updateColorInputBorder(groupColor, getSettingsHighlightColor());
          }
        });
        mainColor.dataset.pixivUtilsColorListener = 'true';
      }
      updateColorInputBorder(mainColor, ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR);
    }
  };

  // List ordering is a UI-only enhancement. gmConfig reads records from the
  // actual .gc-list-items DOM order; moving existing nodes preserves all live
  // input values, nested editors and their original storage serialization.
  const initListOrderControls = panel => {
    const dialog = panel._dlg;
    if (!dialog) return;

    let state = panel._pixivListOrderState;
    if (!state) {
      state = { observers: new Map(), dragging: null, touchDrag: null, dropTarget: null };
      panel._pixivListOrderState = state;
      const clearDropTarget = () => {
        state.dropTarget?.classList.remove('pixiv-utils-drop-before', 'pixiv-utils-drop-after');
        state.dropTarget = null;
      };
      const draggedListItem = event => event.target.closest?.('.gc-li');
      const moveItem = (item, index) => {
        const items = item.parentElement;
        if (!items?.classList.contains('gc-list-items')) return;
        const siblings = [...items.children].filter(node => node !== item);
        const destination = Math.min(Math.max(index, 0), siblings.length);
        if ([...items.children].indexOf(item) === destination) return;
        items.insertBefore(item, siblings[destination] ?? null);
        refreshList(items);
        // gmConfig's own list-item input listener calls _onListChange() for
        // the correct field, including parent records for nested lists.
        item.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const onDragStart = event => {
        if (!event.target.matches?.('.pixiv-utils-drag-handle')) return;
        const item = draggedListItem(event);
        if (!item?.parentElement?.classList.contains('gc-list-items')) return;
        state.dragging = item;
        if (event.dataTransfer) {
          // Firefox requires setData for native HTML5 drag-and-drop to start.
          event.dataTransfer.setData('text/plain', 'pixiv-utils-list-item');
          event.dataTransfer.effectAllowed = 'move';
        }
        item.classList.add('pixiv-utils-dragging');
      };
      const onDragOver = event => {
        const item = draggedListItem(event);
        if (!state.dragging || !item || item === state.dragging ||
          item.parentElement !== state.dragging.parentElement) {
          clearDropTarget();
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const after = event.clientY >= item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
        clearDropTarget();
        state.dropTarget = item;
        item.classList.add(after ? 'pixiv-utils-drop-after' : 'pixiv-utils-drop-before');
      };
      const dropItem = (dragged, item) => {
        if (!dragged || !item || item === dragged || item.parentElement !== dragged.parentElement) return false;
        const siblings = [...dragged.parentElement.children].filter(node => node !== dragged);
        const after = item.classList.contains('pixiv-utils-drop-after');
        moveItem(dragged, siblings.indexOf(item) + (after ? 1 : 0));
        clearDropTarget();
        return true;
      };
      const onDrop = event => {
        if (dropItem(state.dragging, draggedListItem(event))) event.preventDefault();
      };
      // Native HTML drag-and-drop has limited touch support. Reuse the same
      // destination logic for touch-pointer dragging, keeping index input as a
      // keyboard-accessible fallback on all devices.
      const onPointerDown = event => {
        if (event.pointerType !== 'touch' || !event.target.matches?.('.pixiv-utils-drag-handle')) return;
        const item = draggedListItem(event);
        if (!item?.parentElement?.classList.contains('gc-list-items')) return;
        event.preventDefault();
        state.touchDrag = { item, pointerId: event.pointerId };
        item.classList.add('pixiv-utils-dragging');
        try { event.target.setPointerCapture?.(event.pointerId); } catch {}
      };
      const onPointerMove = event => {
        const drag = state.touchDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        const item = document.elementFromPoint(event.clientX, event.clientY)?.closest('.gc-li');
        clearDropTarget();
        if (!item || item === drag.item || item.parentElement !== drag.item.parentElement) return;
        const box = item.getBoundingClientRect();
        const after = event.clientY >= box.top + box.height / 2;
        state.dropTarget = item;
        item.classList.add(after ? 'pixiv-utils-drop-after' : 'pixiv-utils-drop-before');
      };
      const onPointerUp = event => {
        const drag = state.touchDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (event.type === 'pointerup') dropItem(drag.item, state.dropTarget);
        drag.item.classList.remove('pixiv-utils-dragging');
        state.touchDrag = null;
        clearDropTarget();
      };
      const onDragEnd = () => {
        state.dragging?.classList.remove('pixiv-utils-dragging');
        state.dragging = null;
        clearDropTarget();
      };
      dialog.addEventListener('dragstart', onDragStart);
      dialog.addEventListener('dragover', onDragOver);
      dialog.addEventListener('drop', onDrop);
      dialog.addEventListener('dragend', onDragEnd);
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointermove', onPointerMove);
      dialog.addEventListener('pointerup', onPointerUp);
      dialog.addEventListener('pointercancel', onPointerUp);
      state.cleanup = () => {
        onDragEnd();
        state.touchDrag?.item.classList.remove('pixiv-utils-dragging');
        state.touchDrag = null;
        for (const observer of state.observers.values()) observer.disconnect();
        state.observers.clear();
        dialog.removeEventListener('dragstart', onDragStart);
        dialog.removeEventListener('dragover', onDragOver);
        dialog.removeEventListener('drop', onDrop);
        dialog.removeEventListener('dragend', onDragEnd);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointermove', onPointerMove);
        dialog.removeEventListener('pointerup', onPointerUp);
        dialog.removeEventListener('pointercancel', onPointerUp);
      };
      state.moveItem = moveItem;
    }

    const refreshList = items => {
      const entries = [...items.children].filter(item => item.classList.contains('gc-li'));
      for (const [index, item] of entries.entries()) {
        item._refresh?.();
        const control = item.querySelector(':scope > .gc-li-h > .pixiv-utils-list-position');
        if (control) {
          control.value = String(index + 1);
          control.max = String(entries.length);
          control.title = tr('list.position', { max: entries.length });
          control.setAttribute('aria-label', control.title);
        }
      }
    };
    const setupList = list => {
      const items = list.querySelector(':scope > .gc-list-items');
      if (!items) return;
      for (const item of items.children) {
        if (!item.classList.contains('gc-li')) continue;
        const head = item.querySelector(':scope > .gc-li-h');
        if (!head || head.querySelector('.pixiv-utils-list-position')) continue;
        const position = document.createElement('input');
        position.type = 'number';
        position.min = '1';
        position.step = '1';
        position.inputMode = 'numeric';
        position.className = 'pixiv-utils-list-position';
        // Index typing is purely navigation; don't send intermediate digits
        // through gmConfig's own form/list input listeners.
        position.addEventListener('input', event => event.stopPropagation());
        position.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); position.blur(); }
        });
        position.addEventListener('change', () => {
          const count = items.children.length;
          const raw = position.value.trim();
          if (!/^\d+$/.test(raw)) { refreshList(items); return; }
          const index = Number(raw);
          if (!Number.isSafeInteger(index) || index < 1 || index > count) {
            refreshList(items);
            return;
          }
          state.moveItem(item, index - 1);
          refreshList(items);
        });
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'pixiv-utils-drag-handle';
        handle.textContent = '≡';
        handle.title = tr('list.drag');
        handle.setAttribute('aria-label', tr('list.drag'));
        handle.draggable = true;
        const title = head.querySelector('.gc-li-t');
        head.insertBefore(handle, title ?? head.firstChild);
        handle.after(position);
      }
      refreshList(items);
      if (!state.observers.has(items)) {
        // Observe only direct item add/remove/reorder mutations, not title
        // changes within items; avoids repeat work on every keystroke.
        const observer = new MutationObserver(() => {
          initListOrderControls(panel); // install for newly added nested lists
          refreshList(items);
        });
        observer.observe(items, { childList: true });
        state.observers.set(items, observer);
      }
    };
    for (const [items, observer] of state.observers) {
      if (!items.isConnected) { observer.disconnect(); state.observers.delete(items); }
    }
    for (const list of dialog.querySelectorAll('.gc-list')) setupList(list);
  };

  const disposeListOrderControls = panel => {
    panel?._pixivListOrderState?.cleanup?.();
    if (panel) panel._pixivListOrderState = null;
  };

  const createPixivUtilsConfig = BaseConfig => class PixivUtilsConfig extends BaseConfig {
    async _load () {
      // gmConfig 1.0.0 originally loads a single JSON string. Directly read the
      // exact same per-key values as the rest of this userscript instead.
      this._storedOriginals = GM_getValues(Object.keys(ENV_DEFAULTS));
      this._initialEditorValues = {};
      for (const [key, field] of Object.entries(this._fields)) {
        if (!(key in ENV_DEFAULTS)) continue; // backup buttons have no storage key
        const stored = this._storedOriginals[key];
        const uiValue = settingToEditor(key, stored == null ? ENV_DEFAULTS[key] : stored);
        field.value = uiValue;
        this._initialEditorValues[key] = JSON.stringify(uiValue);
      }
      this._clean = this._json();
    }

    async save () {
      const current = this._vals();
      const changed = {};
      for (const [key, fallback] of Object.entries(ENV_DEFAULTS)) {
        if (!(key in current)) continue;
        if (!this._resetting && JSON.stringify(current[key]) === this._initialEditorValues[key]) continue;
        const stored = this._storedOriginals[key];
        changed[key] = this._resetting ? fallback : editorToSetting(key, current[key], stored);
      }
      if (Object.keys(changed).length) GM_setValues(changed);
      Object.assign(this._storedOriginals, changed);
      for (const key of Object.keys(ENV_DEFAULTS)) {
        if (key in current) this._initialEditorValues[key] = JSON.stringify(current[key]);
      }
      this._mark();
      this._clean = this._json();
    }

    async reset () {
      if (!window.confirm(tr('message.resetConfirm'))) return;
      this._resetting = true;
      try { await super.reset(); } finally { this._resetting = false; }
    }

    // The library's footer import/export icon opens our Backup tab instead.
    async importExport () {
      this._activate?.(tr('tab.Backup'));
      return false;
    }
  };

  GM_addStyle(/*css*/`
    /* gmConfig's .gc-c uses width:100%; account for padding and borders. */
    .gc-p, .gc-p * { box-sizing: border-box; }
    .gc-p .gc-c, .gc-p input[type="text"], .gc-p textarea,
    .gc-p select, .gc-p .pixiv-utils-backup textarea { max-width: 100%; }
    /* Keep the outer dialog height constant across tabs; scroll only its content. */
    .gc-p { height: min(740px, calc(100dvh - 40px)); max-height: calc(100dvh - 40px); }
    .gc-p.gc-p > form { height: 100%; min-height: 0; max-height: none; }
    .gc-p .gc-hd, .gc-p .gc-f { flex: 0 0 auto; }
    .gc-p .gc-b { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
    .gc-p .gc-tb {
      flex: 0 0 auto;
      border-bottom: 0 !important;
      box-shadow: none !important;
      background-image: none !important;
    }
    .gc-p .gc-tb::before, .gc-p .gc-tb::after { content: none !important; }
    /* Rounded controls and list cards, without affecting input dimensions. */
    .gc-p :is(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea, button) { border-radius: 5px; }
    .gc-p :is(.gc-li, .gc-list, .gc-li-b) { border-radius: 7px; }
    .gc-p :is(.gc-li-h, .gc-hd, .gc-f) { border-radius: 5px; }
    .gc-p :is(input, select, textarea, button):focus-visible { outline-offset: 2px; }
    /* Keep tab geometry stable; use a filled selected state instead of the
       active bottom underline, which clashed with gmConfig's tab strip. */
    .gc-p .gc-tb > button {
      font-weight: 400 !important;
      border-bottom: 0 !important;
      box-shadow: none !important;
      background-image: none !important;
    }
    .gc-p .gc-tb > button:is([aria-selected="true"], [data-active="true"], .active, .gc-a, .gc-ta) {
      background-color: rgba(128, 128, 128, 0.22) !important;
      box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.26) !important;
    }
    .gc-p .gc-tb + .gc-b { border-top: 0 !important; }
    .gc-p .pixiv-utils-section-heading {
      margin: 10px 0 3px;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }
    .gc-p .pixiv-utils-bookmark-state-field {
      margin-inline-start: 12px;
      padding-inline-start: 12px;
      padding-block: 4px;
      border-left: 2px solid rgba(128, 128, 128, 0.38);
      background: rgba(128, 128, 128, 0.055);
    }
    .gc-p .gc-g:has(#ENABLE_KEYBINDS) .gc-h { white-space: pre-line; }
    .gc-p .pixiv-utils-settings-divider {
      border-top: 1px solid currentColor;
      opacity: 0.2;
      margin: 7px 0 4px;
    }
    .gc-p .pixiv-utils-global-note {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.8;
      margin: 0 0 5px;
    }
    .gc-p .gc-g, .gc-p .gc-li-b, .gc-p .gc-list,
    .gc-p .gc-list-items { min-width: 0; max-width: 100%; }
    .gc-p .gc-li-b > .gc-r .gc-g:has(input[id$="_regex"]) .gc-ck {
      /* Match the label height of neighboring textboxes before the checkbox. */
      padding-top: 23px;
      align-items: center;
    }
    .gc-p .pixiv-utils-text-editor { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .gc-p .pixiv-utils-empty-override { display: flex; align-items: center; gap: 7px; font-size: 12px; }
    .gc-p .pixiv-utils-empty-override input { width: auto; }

    .gc-p .pixiv-utils-date-editor {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 10px;
    }
    .gc-p .pixiv-utils-date-editor label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
    }
    .gc-p .pixiv-utils-date-editor select,
    .gc-p .pixiv-utils-date-editor input {
      padding: 6px;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .gc-p .pixiv-utils-date-preview {
      grid-column: 1 / -1;
      font-size: 12px;
      opacity: 0.85;
      padding: 8px;
    }
    /* Keep rule editors proportional when the flags field is hidden. */
    .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 78px 74px;
      align-items: start;
      gap: 8px;
    }
    .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) > .gc-g {
      min-width: 0;
    }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_value"]) { grid-column: 1; }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_regex"]) { grid-column: 2; }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_flags"]) { grid-column: 3; }
    .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) .gc-c {
      min-width: 0;
      box-sizing: border-box;
    }
    .gc-p .pixiv-utils-collapse-group {
      align-self: flex-start;
      font: inherit;
      font-size: 11px;
      padding: 3px 8px;
      cursor: pointer;
      border: 1px solid;
      border-radius: 4px;
      background: transparent;
    }
    /* Native modal backdrop dims Pixiv without covering the settings UI. */
    dialog.gc-p::backdrop { background: rgba(0, 0, 0, 0.56); }
    .gc-p .gc-li-h > .gc-li-t { min-width: 0; }
    .gc-p .pixiv-utils-list-position {
      width: 48px; min-width: 0; padding: 3px 2px;
      margin-right: 6px;
      font: inherit; font-size: 12px; text-align: center;
    }
    .gc-p .pixiv-utils-drag-handle {
      flex: 0 0 auto; font: inherit; font-size: 20px; line-height: 1;
      border: 0; padding: 2px 5px; background: transparent;
      cursor: grab; touch-action: none; user-select: none;
    }
    .gc-p .pixiv-utils-drag-handle:active { cursor: grabbing; }
    .gc-p .pixiv-utils-dragging { opacity: 0.55; }
    .gc-p .pixiv-utils-drop-before { box-shadow: inset 0 3px 0 var(--gc-a, #888); }
    .gc-p .pixiv-utils-drop-after { box-shadow: inset 0 -3px 0 var(--gc-a, #888); }
    .gc-p .pixiv-utils-nested-collapsed > .gc-list { display: none; }
    .gc-p .pixiv-utils-backup { display: flex; flex-direction: column; gap: 10px; }
    .gc-p .pixiv-utils-backup p { margin: 0; }
    .gc-p .pixiv-utils-backup textarea {
      width: 100%; min-height: 260px; box-sizing: border-box;
      font: 12px/1.5 monospace; resize: vertical;
    }
    .gc-p .pixiv-utils-backup-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .gc-p .pixiv-utils-backup-buttons button { padding: 5px 9px; cursor: pointer; }
    .gc-p .gc-f > .gc-h button { cursor: pointer; }
    @media (max-width: 640px) {
      .gc-p {
        position: fixed; inset: 0; margin: 0;
        width: 100vw !important; max-width: none !important;
        height: 100dvh; max-height: 100dvh;
        border-radius: 0;
      }
      .gc-p > form { width: 100%; }
      .gc-p .gc-hd { padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top)); }
      .gc-p .gc-b { padding: 10px 12px; }
      .gc-p .gc-tb { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; }
      .gc-p .gc-tb > button { flex: 0 0 auto; white-space: nowrap; }
      .gc-p .gc-f {
        flex-wrap: wrap; gap: 6px; padding: 8px 12px;
        padding-bottom: max(8px, env(safe-area-inset-bottom));
      }
      .gc-p .gc-f button { min-height: 34px; }
      .gc-p .gc-f > .gc-h { margin-right: auto; }
      .gc-p .pixiv-utils-date-editor { grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); }
      .gc-p .gc-li { padding: 6px; }
      .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) {
        grid-template-columns: minmax(0, 1fr) 65px 51px;
        gap: 5px;
      }
      .gc-p .gc-r > .gc-g { min-width: 0; }
      .gc-p .gc-c, .gc-p .pixiv-utils-date-editor :is(input, select),
      .gc-p .pixiv-utils-backup textarea { font-size: 16px; }
      .gc-p .gc-li-h { flex-wrap: wrap; }
      .gc-p .pixiv-utils-backup-buttons { align-items: stretch; }
      .gc-p .pixiv-utils-backup-buttons button { min-height: 36px; }
    }
    @media (max-width: 400px) {
      /* Nested colored groups cannot fit three same-row controls on small phones. */
      .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) {
        grid-template-columns: minmax(0, 1fr) 62px;
      }
      .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_value"]) { grid-column: 1 / -1; }
      .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_regex"]) { grid-column: 1; }
      .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_flags"]) { grid-column: 2; }
      .gc-p .gc-li-b > .gc-r .gc-g:has(input[id$="_regex"]) .gc-ck { padding-top: 0; }
    }
  `);

  const localizePanelChrome = panel => {
    const dialog = panel._dlg;
    if (!dialog) return;
    const footer = dialog.querySelector('.gc-f');
    const buttons = footer?.querySelectorAll(':scope > button');
    if (buttons?.length >= 4) {
      const actions = ['action.importExport', 'action.reset', 'action.cancel', 'action.save'];
      for (let i = 0; i < 4; i++) {
        if (i === 0) buttons[i].title = tr(actions[i]);
        else if (i < 3) buttons[i].textContent = tr(actions[i]);
        else {
          const saved = buttons[i].textContent.startsWith('Saved') ||
            buttons[i].textContent === tr('action.saved');
          const translated = tr(saved ? 'action.saved' : actions[i]);
          if (buttons[i].textContent !== translated) buttons[i].textContent = translated;
        }
      }
    }
    dialog.querySelector('.gc-hd > button')?.setAttribute('title', tr('action.close'));
    const reload = footer?.querySelector('.gc-h button');
    if (reload && reload.textContent !== tr('action.reload')) reload.textContent = tr('action.reload');
  };

  // Compatibility fallback: only the UI panel is initialized on demand;
  // the pinned unminified IIFE is eagerly loaded via @require.
  const loadSettingsConstructor = async () => {
    if (typeof gmConfig !== 'function') throw new Error('gmConfig IIFE not loaded.');
    return createPixivUtilsConfig(gmConfig);
  };

  let settingsPanel = null;
  let settingsOpening = false;
  const openSettingsPanel = async () => {
    if (settingsOpening || settingsPanel?.isOpen) return;
    settingsOpening = true;
    try {
      settingsUiLocale = resolveSettingsLocale(GM_getValue('SETTINGS_LANGUAGE', 'auto'));
      await waitPageLoaded();
      const SettingsConstructor = await loadSettingsConstructor();
      const panel = new SettingsConstructor();
      await panel.init(makeSettingsDefinitions(), {
        title: tr('settingsTitle'),
        width: 'min(900px, 96vw)',
        closeOnSave: false, // Keep the Reload page button available after Save.
        onBeforeClose: () => window.confirm(tr('message.discardChanges')),
        onBeforeSave: values => {
          // Defensive validation for additional conversions done during persistence.
          for (const key of ['TIPPY_TOOLTIPS_OPTIONS', 'UTAGS_BLOCKED_TAGS', 'SECTIONS_TOGGLE_BOOKMARKED', 'PIXIV_BLOCKED_USERS']) {
            try { editorToSetting(key, values[key], ENV[key]); } catch (error) { alert(tr('message.validation', { key, error: error.message })); return false; }
          }
        },
        onOpen: () => {
          syncColoredGroupToggles();
          syncSettingsDecorations();
          initListOrderControls(panel);
          // Nested list changes do not fire top-level onChange. Refresh only the
          // affected highlighted group (or the highlighted list for top-level changes).
          panel._dlg?.addEventListener('click', event => {
            if (!event.target.closest('.gc-list-add, .gc-bd')) return;
            const group = event.target.closest('.gc-g:has(> .gc-list[id$="_tags"])');
            const highlighted = group || document.querySelector('.gc-p .gc-list[id="PIXIV_HIGHLIGHTED_TAGS"]');
            if (highlighted) queueMicrotask(() => syncColoredGroupToggles(highlighted));
          });
          panel._dlg?.addEventListener('change', event => {
            if (!event.target.matches('select[id$="_type"]')) return;
            const item = event.target.closest('.gc-li');
            if (item) queueMicrotask(() => syncColoredGroupToggles(item));
          });
          localizePanelChrome(panel);
          // The library temporarily displays "Saved ✓" after Save.
          // Keep that internal label translated without changing save behavior.
          const saveButton = panel._dlg?.querySelector('.gc-f > button.gc-bp');
          if (saveButton) {
            const observer = new MutationObserver(() => localizePanelChrome(panel));
            observer.observe(saveButton, { childList: true, characterData: true, subtree: true });
            panel._chromeObserver = observer;
          }
        },
        onClose: () => {
          panel._chromeObserver?.disconnect();
          panel._chromeObserver = null;
          disposeListOrderControls(panel);
        },
        onChange: (key, value) => {
          if (key === 'SETTINGS_LANGUAGE') {
            const locale = resolveSettingsLocale(value);
            if (locale !== settingsUiLocale) {
              settingsUiLocale = locale;
              queueMicrotask(() => {
                if (!panel.isOpen) return;
                panel.reinit(makeSettingsDefinitions(), tr('settingsTitle'));
                syncColoredGroupToggles();
                syncSettingsDecorations();
                initListOrderControls(panel);
                localizePanelChrome(panel);
              });
            }
          }
        },
        footerContent: () => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = tr('action.reload');
          // gmConfig already supplies a beforeunload warning for unsaved edits.
          button.addEventListener('click', () => location.reload());
          return button;
        },
        onSave: () => { alert(tr('message.save')); },
        onReset: () => {
          const locale = resolveSettingsLocale(ENV_DEFAULTS.SETTINGS_LANGUAGE);
          if (locale !== settingsUiLocale) {
            settingsUiLocale = locale;
            panel.reinit(makeSettingsDefinitions(), tr('settingsTitle'));
            syncColoredGroupToggles();
            syncSettingsDecorations();
            initListOrderControls(panel);
            localizePanelChrome(panel);
          }
          alert(tr('message.reset'));
        }
      });
      settingsPanel = panel;
      await panel.open();
    } catch (error) {
      console.error('[Pixiv Utils]: Failed to open settings:', error);
      alert(tr('message.openError', { error: error.message }));
    } finally { settingsOpening = false; }
  };

  GM_registerMenuCommand('⚙️ Settings', openSettingsPanel);

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

  const SELECTORS_IMAGE_CONTAINER_SIMPLIFIED = [
    'div[open]:has(a[href*="users/"])', // user profile popup
    'aside > section > nav' // expanded view's other works sidebar
  ].join(', ');

  const SELECTORS_IMAGE_SMALL = [
    'li:has(a[href*="novel/"])', // novel
    'aside:has(iframe[src*="premium_lp"]) > ul > li' // tags page's popular works
  ].join(', ');

  const SELECTORS_IMAGE_NO_CONTROLS = [
    'aside:has(iframe[src*="premium_lp"]) > ul > li' // tags page's popular works
  ].join(', ');

  const SELECTORS_IMAGE_MOBILE = '.works-item';

  const PIXIV_HIGHLIGHTED_TAGS_FORMATTED = [];

  for (const config of CONFIG.PIXIV_HIGHLIGHTED_TAGS) {
    const buildTags = tags => {
      const result = {
        string: new Set(),
        regexp: []
      };

      const regexpMap = {};

      for (const tag of tags) {
        if (typeof tag === 'string') {
          result.string.add(tag);
        } else if (Array.isArray(tag)) {
          if (CONFIG.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES) {
            const flags = tag[1] || '';
            if (regexpMap[flags] === undefined) {
              regexpMap[flags] = [];
            }
            regexpMap[flags].push(tag[0]);
          } else {
            result.regexp.push(new RegExp(tag[0], tag[1] || ''));
          }
        }
      }

      const regexpMapKeys = Object.keys(regexpMap);
      if (CONFIG.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES && regexpMapKeys.length) {
        for (const flags of regexpMapKeys) {
          result.regexp.push(new RegExp(regexpMap[flags].join('|'), flags));
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

    if (_config.string.size || _config.regexp.length) {
      PIXIV_HIGHLIGHTED_TAGS_FORMATTED.push(_config);
    }
  }

  logDebug('PIXIV_HIGHLIGHTED_TAGS_FORMATTED = ', PIXIV_HIGHLIGHTED_TAGS_FORMATTED);
  const PIXIV_HIGHLIGHTED_TAGS_VALIDATED = PIXIV_HIGHLIGHTED_TAGS_FORMATTED.length;

  const PIXIV_BLOCKED_TAGS_STRING = new Set();
  const PIXIV_BLOCKED_TAGS_REGEXP = [];
  const PIXIV_BLOCKED_TAGS_REGEXP_MAP = {};

  for (const tag of CONFIG.PIXIV_BLOCKED_TAGS) {
    if (typeof tag === 'string') {
      PIXIV_BLOCKED_TAGS_STRING.add(tag);
    } else if (Array.isArray(tag)) {
      if (CONFIG.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES) {
        const flags = tag[1] || '';
        if (PIXIV_BLOCKED_TAGS_REGEXP_MAP[flags] === undefined) {
          PIXIV_BLOCKED_TAGS_REGEXP_MAP[flags] = [];
        }
        PIXIV_BLOCKED_TAGS_REGEXP_MAP[flags].push(tag[0]);
      } else {
        PIXIV_BLOCKED_TAGS_REGEXP.push(new RegExp(tag[0], tag[1] || ''));
      }
    }
  }

  const PIXIV_BLOCKED_TAGS_REGEXP_MAP_KEYS = Object.keys(PIXIV_BLOCKED_TAGS_REGEXP_MAP);
  if (CONFIG.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES && PIXIV_BLOCKED_TAGS_REGEXP_MAP_KEYS.length) {
    for (const flags of PIXIV_BLOCKED_TAGS_REGEXP_MAP_KEYS) {
      PIXIV_BLOCKED_TAGS_REGEXP.push(new RegExp(PIXIV_BLOCKED_TAGS_REGEXP_MAP[flags].join('|'), flags));
    }
  }

  logDebug('PIXIV_BLOCKED_TAGS_STRING = ', PIXIV_BLOCKED_TAGS_STRING);
  logDebug('PIXIV_BLOCKED_TAGS_REGEXP = ', PIXIV_BLOCKED_TAGS_REGEXP);
  // Keep artist IDs as strings for exact matching, with no Number conversion.
  const PIXIV_BLOCKED_USERS_SET = new Set(CONFIG.PIXIV_BLOCKED_USERS);
  logDebug('PIXIV_BLOCKED_USERS_SET =', PIXIV_BLOCKED_USERS_SET);
  const PIXIV_BLOCKED_TAGS_VALIDATED = PIXIV_BLOCKED_TAGS_STRING.size ||
    PIXIV_BLOCKED_TAGS_REGEXP.length ||
    PIXIV_BLOCKED_USERS_SET.size ||
    CONFIG.PIXIV_BLOCK_AI;

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

  class SimpleCache {
    constructor (maxSize) {
      this.maxSize = maxSize;
      this.map = new Map();
    }

    get (key) {
      if (!this.map.has(key)) {
        return undefined;
      }

      const value = this.map.get(key);
      this.map.delete(key);
      this.map.set(key, value); // refresh for LRU
      return value;
    }

    set (key, value) {
      if (this.map.has(key)) {
        this.map.delete(key);
      } else if (this.map.size >= this.maxSize) {
        const firstKey = this.map.keys().next().value;
        this.map.delete(firstKey); // evict LRU
      }

      this.map.set(key, value);
    }
  }

  /** MAIN STYLES **/

  const formatChildSelector = (parentSelector, childSelector) => {
    let child = childSelector;
    if (childSelector.startsWith('&')) {
      child = childSelector.substring(1).trimStart();
    }

    return `:is(${parentSelector}) ${child}`;
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

  const mainStyle = /*css*/`
  .flex:has(+ .pixiv_utils_edit_bookmark_container) {
    flex-grow: 1;
  }

  ${CONFIG.SELECTORS_MULTI_VIEW_CONTROLS} > .flex:has(+ .pixiv_utils_edit_bookmark_container) {
    flex-grow: 0;
    padding-right: 4px;
  }

  .ranking-item.muted .pixiv_utils_edit_bookmark_container {
    display: none;
  }

  :is(${CONFIG.SELECTORS_IMAGE}):has(a[href*="novel/"]) .pixiv_utils_edit_bookmark {
    margin-top: -26px;
  }

  :not(#higher_specificity) .absolute.right-0 .pixiv_utils_edit_bookmark {
    margin-top: 6px;
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

  ${CONFIG.SELECTORS_MULTI_VIEW_CONTROLS} .pixiv_utils_edit_bookmark {
    margin-right: 0 !important;
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

  div:not([class*="style_tagFilter"]):has(+ .pixiv_utils_toggle_bookmarked_container) {
    flex-grow: 1;
  }

  div:not([class*="style_tagFilter"]):has(+ .pixiv_utils_toggle_bookmarked_container):not(:first-child) {
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
    padding: 0 4px;
  }

  :not(#higher_specificity) [data-pixiv_utils_toggle_bookmarked_hide] {
    display: none !important;
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
  ${CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE}[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-radius: 4px;
  }

  /* mobile images */
  :is(${SELECTORS_IMAGE_MOBILE})[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
    border-radius: 0;
  }

  /* user profile popup */
  div[open]:has(a[href*="users/"]) div > div:has(a[href*="artworks/"] img[src]) {
    &[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-radius: 0;
    }

    &[data-pixiv_utils_highlight]:nth-child(1) ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-bottom-left-radius: 8px;
    }

    &[data-pixiv_utils_highlight]:nth-child(3) ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-bottom-right-radius: 8px;
    }
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

  :is(${SELECTORS_IMAGE_SMALL}) .pixiv_utils_blocked_image {
    min-width: 80px;
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

  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_TITLE}):not(.pixiv_utils_blocked_image_container) {
    display: none !important;
  }

  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_ARTIST_AVATAR}),
  [data-pixiv_utils_blocked] :is(${CONFIG.SELECTORS_IMAGE_AUXILIARY_ELEMENTS}) {
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

  [data-pixiv_utils_duplicate_date]:not([data-pixiv_utils_date_prefix]) {
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
  const WAIT_FOR_TIMEOUT = 30000; // ms; callers can safely retry on later observations.

  const waitForIntervals = {};

  const waitFor = (func, element = document, timeout = WAIT_FOR_TIMEOUT) => {
    if (typeof func !== 'function') return Promise.resolve(null);

    return new Promise(resolve => {
      let interval = null;
      const deadline = performance.now() + timeout;
      const finish = result => {
        if (interval !== null) {
          clearInterval(interval);
          delete waitForIntervals[interval];
          interval = null;
        }
        resolve(result);
      };
      const find = () => {
        // Pixiv can unmount an artwork without changing the URL.
        if (element !== document && !element.isConnected) {
          finish(null);
          return true;
        }
        if (performance.now() >= deadline) {
          finish(null);
          return true;
        }
        let result;
        try { result = func(element); } catch (error) {
          console.warn('[Pixiv Utils]: waitFor check failed:', error);
          finish(null);
          return true;
        }
        if (result) {
          finish(result);
          return true;
        }
        return false;
      };
      if (!find()) {
        interval = setInterval(find, WAIT_FOR_POLL);
        waitForIntervals[interval] = { func, element, resolve: finish };
      }
    });
  };

  // Keep one low-frequency sweep for all long-lived element observers rather
  // than one timer per artwork. It stops whenever there are no tracked observers.
  const activeElementObservers = new Map();
  let observerCleanupTimer = null;
  const cleanupDetachedElementObservers = () => {
    for (const [element, observer] of activeElementObservers) {
      if (!element.isConnected) {
        observer.disconnect();
        activeElementObservers.delete(element);
        delete element.dataset.pixiv_utils_observing;
      }
    }
    if (!activeElementObservers.size && observerCleanupTimer !== null) {
      clearInterval(observerCleanupTimer);
      observerCleanupTimer = null;
    }
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
    activeElementObservers.set(element, observer);
    if (observerCleanupTimer === null) {
      observerCleanupTimer = setInterval(cleanupDetachedElementObservers, 5000);
    }
    return observer;
  };

  const editBookmarkButton = (id, isNovel = false) => {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pixiv_utils_edit_bookmark_container';

    const button = document.createElement('a');
    button.className = 'pixiv_utils_edit_bookmark';
    button.textContent = CONFIG.TEXT_EDIT_BOOKMARK;

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

  const findNovelSeriesUrl = element => {
    return element.querySelector('a[href*="novel/series/"]');
  };

  const findIllustImg = element => {
    return element.querySelector('img[src*="_p0"]');
  };

  const findItemData = (element, tryImg = false) => {
    const methods = [
      { func: findIllustImg, regex: /\/(\d+)(-[a-z0-9]+)?_p0/, img: true },
      { func: findArtworkUrl, regex: /artworks\/(\d+)/ },
      { func: findIllustUrl, regex: /illust_id=(\d+)/ },
      { func: findNovelUrl, regex: /novel\/show\.php\?id=(\d+)/, novel: true },
      { func: findNovelSeriesUrl, regex: /novel\/series\/(\d+)/, novel: true }
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
    const hasBookmarkedClass = Boolean(element.querySelector(CONFIG.SELECTORS_IMAGE_BOOKMARKED));
    if (!hasBookmarkedClass) {
      const bookmarkButton = element.querySelector('button:not([aria-haspopup="true"]) > svg:has(path), ' +
        'a[href*="bookmark_add.php"] > svg:has(path)');
      if (bookmarkButton) {
        return window.getComputedStyle(bookmarkButton).getPropertyValue('color') === 'rgb(255, 64, 96)';
      }
    }
    return hasBookmarkedClass;
  };

  // Pixiv exposes the artist on different props in Vue and React views. Reuse
  // these fields for the artist label and for user-ID blocking. Never convert
  // string IDs to Number (large IDs and leading zeroes must be preserved).
  const pixivUserIdString = value => {
    if (typeof value === 'string') return /^[0-9]+$/.test(value) ? value : null;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : null;
  };

  const readArtistMetadata = (source, target) => {
    if (!source || typeof source !== 'object') return;
    const user = source.author_details || source.user || source.author;
    const id = pixivUserIdString(source.userId ?? source.user_id ??
      user?.userId ?? user?.user_id ?? user?.id);
    const name = source.userName ?? source.user_name ??
      user?.userName ?? user?.user_name ?? user?.name;
    if (target.userId === null && id !== null) target.userId = id;
    if (target.userName === null && typeof name === 'string' && name) target.userName = name;
  };

  const extractArtistMetadata = element => {
    const artist = { userId: null, userName: null };
    if (element.__vue__) {
      readArtistMetadata(element.__vue__._props?.item, artist);
      readArtistMetadata(element.__vue__._props?.illustDetails, artist);
    } else {
      // Preserves addImageArtist's original React __reactProps extraction path.
      const propsKey = Object.keys(element).find(k => k.startsWith('__reactProps'));
      const props = propsKey && element[propsKey]?.children?.props;
      if (props) {
        for (const key of ['rawThumbnail', 'thumbnail', 'work']) {
          readArtistMetadata(props[key], artist);
          if (artist.userId !== null && artist.userName !== null) break;
        }
      }
    }
    return artist;
  };

  const extractImagePixivData = async element => {
    const data = {
      title: null,
      ai: null,
      tags: null,
      createDate: null,
      ...extractArtistMetadata(element)
    };

    if (element.__vue__) {
      for (const key of ['item', 'illustDetails']) {
        const _data = element.__vue__._props?.[key];
        if (!_data) continue;

        if (key === 'item' && _data.notLoaded) {
          // If the artist is already blocked and fast mode is enabled, no
          // additional AI or tag data is needed to decide the block.
          if (CONFIG.PIXIV_BLOCKED_TAGS_FAST && data.userId !== null &&
            PIXIV_BLOCKED_USERS_SET.has(data.userId) &&
            !(CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && PIXIV_HIGHLIGHTED_TAGS_VALIDATED)) break;
          const awaited = await waitFor(() => !_data.notLoaded, element);
          if (!awaited) break;
        }

        readArtistMetadata(_data, data);
        data.title = _data.title;
        data.ai = _data.ai_type == null ? null : _data.ai_type === 2;
        data.tags = _data.tags;

        if (Number.isFinite(_data.upload_timestamp)) {
          try {
            const dateString = DATE_FORMAT.format(new Date(_data.upload_timestamp * 1000));
            data.createDate = dateString;
          } catch {}
        }
      }
    } else {
      const reactFiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber'));
      if (reactFiberKey) {
        const MAX_STEPS = 5;

        let step = 0;
        const traverseChild = obj => {
          if (!obj || !obj.memoizedProps) return;

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
              if (!Array.isArray(children)) children = [children];
              for (const child of children) {
                if (child.props?.thumbnail) {
                  source = child.props.thumbnail;
                  break;
                } else if (child.props?.content) {
                  // Rankings page may not supply an AI flag.
                  source = child.props.content;
                  if (source.thumbnails?.length) source = source.thumbnails[0];
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
            readArtistMetadata(source, data);
            data.title = source.title;
            data.ai = source.aiType == null ? null : source.aiType === 2;
            data.tags = source.tags;

            const date = Number.isFinite(source.illust_upload_timestamp)
              ? (source.illust_upload_timestamp * 1000)
              : source.createDate;
            if (date !== undefined) {
              try {
                const dateString = DATE_FORMAT.format(new Date(date));
                data.createDate = dateString;
              } catch {}
            }
          }

          // Source metadata identifies the artwork's artist more reliably than
          // ancestor props, which can refer to a different user.
          if (data.userId === null || data.userName === null) readArtistMetadata(props, data);
          if (data.tags === null && step < MAX_STEPS) traverseChild(obj.child);
        };

        traverseChild(element[reactFiberKey]);
      }
    }

    // Incomplete metadata stays retryable. If user-ID blocking is configured,
    // do not cache a record that lacks its author ID, even if tags/AI are known.
    data.complete = Array.isArray(data.tags) && data.ai !== null &&
      (!PIXIV_BLOCKED_USERS_SET.size || data.userId !== null);
    if (!Array.isArray(data.tags)) data.tags = [];

    data.tags = data.tags
      .map(tag => typeof tag === 'string' ? tag : tag?.name)
      .filter(tag => typeof tag === 'string');

    return data;
  };

  const PIXIV_DATA_CACHE = new SimpleCache(96);

  const getImagePixivData = async (id, element, isNovel = false) => {
    const cacheKey = `${isNovel ? 'novel' : 'illust'}:${id}`;
    const cache = PIXIV_DATA_CACHE.get(cacheKey);
    if (cache !== undefined) {
      return cache;
    }

    const pixivData = await extractImagePixivData(element);
    if (pixivData?.complete) {
      PIXIV_DATA_CACHE.set(cacheKey, pixivData);
    }
    return pixivData || {};
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

    if (options.pixivData.createDate) {
      title += `\n${options.pixivData.createDate}`;
    }

    if (options.footer) {
      title += `\n${options.footer}`;
    }

    title = title.trim();

    if (!title.length) {
      delete element.dataset.pixiv_utils_tooltip;
      element.removeAttribute('title');
      element._tippy?.destroy();
      return;
    }

    if (CONFIG.ENABLE_TIPPY_TOOLTIPS) {
      element.removeAttribute('title');
      // Store the content for lazy delegated initialization and future updates.
      element.dataset.pixiv_utils_tooltip = title;
      element._tippy?.setContent(title);
    } else {
      delete element.dataset.pixiv_utils_tooltip;
      element._tippy?.destroy();
      element.title = title;
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
        if (config.string.has(tag) || config.regexp.some(t => t.test(tag))) {
          result.highlightedTags.push(tag);
          if (!result.color && config.color) {
            result.color = config.color;
          }
          // If fast, immediately break away from this set of tags.
          if (CONFIG.PIXIV_HIGHLIGHTED_TAGS_FAST) {
            break;
          }
        }
      }
      // If fast, and color is already set due to a match from the current config,
      // do not bother checking the other sets of tags.
      if (CONFIG.PIXIV_HIGHLIGHTED_TAGS_FAST && result.color) {
        break;
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

  const doHighlightImage = (element, obj = {}) => {
    // Skip if already highlighted.
    if (element.dataset.pixiv_utils_highlight) {
      return false;
    }

    element.dataset.pixiv_utils_highlight = true;

    if (obj.options.color) {
      element.style.setProperty('--pixiv_utils_highlight_color', obj.options.color);
    }

    return true;
  };

  const isImageBlockedByData = data => {
    const blockedUserId = data.userId !== null && PIXIV_BLOCKED_USERS_SET.has(data.userId)
      ? data.userId
      : null;
    const result = {
      blockedUserId,
      blockedAI: false,
      blockedTags: [],
      hint: ''
    };

    // The artist match takes precedence in fast mode. No AI or tag checks are
    // necessary; incomplete metadata can still be blocked by a known user ID.
    if (CONFIG.PIXIV_BLOCKED_TAGS_FAST && blockedUserId !== null) {
      result.hint = `User ID: ${blockedUserId}`;
      return result;
    }

    result.blockedAI = CONFIG.PIXIV_BLOCK_AI && data.ai;
    if (CONFIG.PIXIV_BLOCKED_TAGS_FAST && result.blockedAI) {
      result.hint = 'AI-generated';
      return result;
    }

    for (const tag of data.tags || []) {
      if (PIXIV_BLOCKED_TAGS_STRING.has(tag) || PIXIV_BLOCKED_TAGS_REGEXP.some(t => t.test(tag))) {
        result.blockedTags.push(tag);
        if (CONFIG.PIXIV_BLOCKED_TAGS_FAST) break;
      }
    }

    if (blockedUserId === null && !result.blockedAI && !result.blockedTags.length) return false;

    if (blockedUserId !== null) result.hint += `User ID: ${blockedUserId}`;
    if (result.blockedAI) result.hint += `${result.hint ? '\n' : ''}AI-generated`;
    if (result.blockedTags.length) result.hint += `${result.hint ? '\n' : ''}Tags: ${result.blockedTags.join(', ')}`;
    return result;
  };

  const getImageBlockSkipReason = (options = {}) => {
    const skipReason = [];

    if (options.isOwnProfile) {
      skipReason.push('In own profile');
    }

    if (options.bookmarked) {
      skipReason.push('Image is bookmarked');
    }

    if (options.highlighted) {
      skipReason.push('Image is highlighted');
    }

    return skipReason;
  };

  const setImageBlocked = (element, options = {}) => {
    // Skip if already blocked (check for element due to possibility of dynamic update).
    const alreadyBlocked = element.querySelector('.pixiv_utils_blocked_image_container');
    if (!options.priority && alreadyBlocked) {
      return false;
    }

    element.dataset.pixiv_utils_blocked = true;

    // Process in toggle bookmarked sections.
    if (element.closest('[data-pixiv_utils_toggle_bookmarked_section]')) {
      if (toggleBookmarkedMode !== 0) {
        element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
      }
    }

    // For mobile, never remove blocked, as it does not behave well with Pixiv's in-place navigation.
    if (options.remove && !options.mobile) {
      element.style.setProperty('display', 'none', 'important');
      return true;
    }

    if (!alreadyBlocked) {
      const blockedThumb = document.createElement('a');
      blockedThumb.className = 'pixiv_utils_blocked_image_container';
      blockedThumb.href = options.link.href;
      blockedThumb.innerHTML = BLOCKED_IMAGE_HTML;

      options.link.after(blockedThumb);
    }

    return true;
  };

  const doBlockImage = (element, obj = {}) => {
    // Do not ever remove in sections known to have display issues.
    let remove = CONFIG.PIXIV_REMOVE_BLOCKED;
    if (element.closest(SELECTORS_IMAGE_CONTAINER_SIMPLIFIED) ||
      element.matches(CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE)) {
      remove = false;
    }

    if (obj.skipReason) {
      logDebug(`Image is blockable, but skipped (reason: ${obj.skipReason})`, element);
      return false;
    }

    const status = setImageBlocked(element, {
      mobile: element.matches(SELECTORS_IMAGE_MOBILE),
      remove,
      link: obj.data.link
    });

    if (status) {
      setImageTitle(element, {
        data: obj.data,
        pixivData: obj.pixivData,
        footer: `Blocked by:\n${obj.options.hint}`
      });
      logDebug(`Image blocked (${obj.options.hint.replace('\n', ', ')})`, element);
    }

    return true;
  };

  const addImageArtist = (element, pixivData) => {
    // Reuse metadata already extracted for blocking. If another artwork source
    // supplied cached data without the author's name, check the card props.
    const artist = {
      userId: pixivData.userId ?? null,
      userName: pixivData.userName ?? null
    };
    if (artist.userId === null || artist.userName === null) {
      const fallback = extractArtistMetadata(element);
      if (artist.userId === null) artist.userId = fallback.userId;
      if (artist.userName === null) artist.userName = fallback.userName;
    }
    if (artist.userId === null || !artist.userName) return false;

    const div = document.createElement('div');
    div.className = 'pixiv_utils_image_artist_container';

    const link = document.createElement('a');
    link.className = 'pixiv_utils_image_artist';
    link.href = `https://www.pixiv.net/users/${encodeURIComponent(artist.userId)}`;
    link.textContent = artist.userName;

    div.append(link);
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
      element.style.setProperty('display', 'none', 'important');
      logDebug('Novel recommendation removed from home', element);
      return true;
    }

    // Process new entries in toggled bookmarked sections.
    const bookmarked = isImageBookmarked(element);
    if (element.closest('[data-pixiv_utils_toggle_bookmarked_section]')) {
      if (toggleBookmarkedMode === 1 && bookmarked) {
        element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
      } else if (toggleBookmarkedMode === 2 && !bookmarked) {
        element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
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
            processNewElement(doImage, element, options);
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
      element.removeAttribute('title');
      delete element.dataset.pixiv_utils_highlight;
      element.style.removeProperty('--pixiv_utils_highlight_color');
    }

    const pixivData = await getImagePixivData(data.id, element, data.novel);

    let footer = '';

    let highlightOpts = false;
    if (PIXIV_HIGHLIGHTED_TAGS_VALIDATED) {
      highlightOpts = isImageHighlightedByData(pixivData);
      if (highlightOpts) {
        doHighlightImage(element, { options: highlightOpts });
        footer += `Highlighted by:\n${highlightOpts.hint}`;
      }
    }

    if (PIXIV_BLOCKED_TAGS_VALIDATED) {
      const blockOpts = isImageBlockedByData(pixivData);
      if (blockOpts) {
        // Only block image if not in own profile, not bookmarked,
        // or optionally, not highlighted.
        const skipReason = getImageBlockSkipReason({
          isOwnProfile,
          bookmarked,
          highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
        });

        const blocked = doBlockImage(element, {
          options: blockOpts,
          data,
          pixivData,
          skipReason: skipReason.join(', ')
        });
        if (blocked) {
          return true;
        }

        footer += `\nBlockable by:\n${blockOpts.hint}` +
          `\nSkipped due to:\n${skipReason.join('\n')}`;
      }
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

    const doNotWaitControls = element.matches(SELECTORS_IMAGE_NO_CONTROLS);

    let imageControls = null;
    if (data.novel || doNotWaitControls) {
      imageControls = element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS);
    } else {
      // If it's not a novel, assume image controls may be delayed due to still being generated.
      imageControls = await waitFor(() => {
        return element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS);
      }, element);
    }

    if (!imageControls && !doNotWaitControls) {
      return false;
    }

    if (!options.skipArtistTag) {
      const artistTag = element.querySelector('a[href*="users/"]');

      let hasVisibleArtistTag = Boolean(artistTag);
      // If the image itself is visible, but its built-in artist tag is not.
      if (hasVisibleArtistTag && element.offsetParent !== null) {
        hasVisibleArtistTag = artistTag.offsetParent !== null;
      }

      // Add artist tag if necessary.
      if (!hasVisibleArtistTag &&
        // never in mobile expanded view's artist bottom bar
        !element.closest('.user-details-card ~ div .works-horizontal-list') &&
        (currentUrl.indexOf('users/') === -1 || // never in artist page (except bookmarks tab)
        (currentUrl.indexOf('users/') !== -1 && currentUrl.indexOf('/bookmarks') !== -1))) {
        addImageArtist(element, pixivData);
      }
    }

    if (imageControls) {
      const oldEditBookmarkButton = imageControls.querySelector('.pixiv_utils_edit_bookmark_container');
      if (oldEditBookmarkButton) {
        oldEditBookmarkButton.remove();
      }

      if (CONFIG.ENABLE_EDIT_BOOKMARK) {
        imageControls.prepend(editBookmarkButton(data.id, data.novel));
      }
    }

    return true;
  };

  const doBlockMultiView = async (element, obj = {}) => {
    if (obj.skipReason) {
      logDebug(`Multi view is blockable, but skipped (reason: ${obj.skipReason})`, element);
      return false;
    }

    // For multi view artwork, always hide the whole entry instead.
    element.parentNode.style.setProperty('display', 'none', 'important');
    logDebug(`Multi view entry removed (${obj.options.hint})`, element);

    return true;
  };

  const doMultiView = async (element, options = {}) => {
    const data = findItemData(element);
    if (data.id === null) {
      return false;
    }

    const pixivDataSource = element.querySelector('div[data-ga4-label="thumbnail_link"]');
    if (pixivDataSource) {
      const pixivData = await getImagePixivData(data.id, pixivDataSource, data.novel);
      if (pixivData) {
        let footer = '';

        let highlightOpts = false;
        if (PIXIV_HIGHLIGHTED_TAGS_VALIDATED) {
          highlightOpts = isImageHighlightedByData(pixivData);
          if (highlightOpts) {
            // doHighlightImage(element, { options: highlightOpts });
            footer += `Highlighted by:\n${highlightOpts.hint}`;
          }
        }

        if (PIXIV_BLOCKED_TAGS_VALIDATED) {
          const blockOpts = isImageBlockedByData(pixivData);
          if (blockOpts) {
            // Only block image if not bookmarked, or optionally, not highlighted.
            const skipReason = getImageBlockSkipReason({
              bookmarked: isImageBookmarked(element),
              highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
            });

            const blocked = await doBlockMultiView(element, {
              options: blockOpts,
              skipReason: skipReason.join(', ')
            });
            if (blocked) {
              return true;
            }

            footer += `\nBlockable by:\n${blockOpts.hint}` +
              `\nSkipped due to:\n${skipReason.join('\n')}`;
          }
        }

        setImageTitle(element, { data, pixivData, footer });
      }
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome && data.novel) {
      element.parentNode.style.setProperty('display', 'none', 'important');
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

    if (CONFIG.ENABLE_EDIT_BOOKMARK) {
      multiViewControls.lastChild.before(editBookmarkButton(data.id, data.novel));
    }
    return true;
  };

  const doBlockExpandedView = (element, obj = {}) => {
    if (obj.skipReason) {
      logDebug(`Expanded view is blockable, but skipped (reason: ${obj.skipReason})`, element);
      return false;
    }

    element.dataset.pixiv_utils_expanded_view_blocked = true;

    setImageTitle(element, {
      data: obj.data,
      pixivData: obj.pixivData,
      footer: `Blocked by:\n${obj.options.hint}`
    });
    logDebug(`Expanded view blocked (${obj.options.hint})`, element);

    return true;
  };

  const doExpandedViewControls = async (element, options = {}) => {
    const image = element.closest(CONFIG.SELECTORS_EXPANDED_VIEW_IMAGE);
    if (!image) {
      return false;
    }

    const data = findItemData(image, true);
    if (data.id === null) {
      return false;
    }

    let blocked = false;

    const pixivData = await getImagePixivData(data.id, image, data.novel);
    if (pixivData) {
      let footer = '';

      let highlightOpts = false;
      if (PIXIV_HIGHLIGHTED_TAGS_VALIDATED) {
        highlightOpts = isImageHighlightedByData(pixivData);
        if (highlightOpts) {
          // doHighlightImage(image, { options: highlightOpts });
          footer += `Highlighted by:\n${highlightOpts.hint}`;
        }
      }

      if (PIXIV_BLOCKED_TAGS_VALIDATED) {
        // Always reset expanded view's blocked status first.
        delete image.dataset.pixiv_utils_expanded_view_blocked;

        const blockOpts = isImageBlockedByData(pixivData);
        if (blockOpts) {
          // Only block image if not bookmarked, or optionally, not highlighted.
          const skipReason = getImageBlockSkipReason({
            bookmarked: isImageBookmarked(image),
            highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
          });

          blocked = doBlockExpandedView(image, {
            options: blockOpts,
            data,
            pixivData,
            skipReason: skipReason.join(', ')
          });

          if (!blocked) {
            footer += `\nBlockable by:\n${blockOpts.hint}` +
              `\nSkipped due to:\n${skipReason.join('\n')}`;
          }
        }
      }

      if (!blocked) {
        setImageTitle(image, { data, pixivData, footer: footer.trim() });
      }
    }

    // Init MutationObserver for dynamic expanded view.
    if (image.__vue__) {
      const target = image.querySelector('.work-main-image');
      if (!image.dataset.pixiv_utils_last_id) {
        initElementObserver(target, mutations => {
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

    let match = currentUrl.match(/artworks\/(\d+)/);
    if (match && match[1]) {
      id = match[1];
    } else {
      match = currentUrl.match(/novel\/show\.php\?id=(\d+)/);
      if (match && match[1]) {
        id = match[1];
        isNovel = true;
      }
    }

    if (id !== null) {
      if (CONFIG.ENABLE_EDIT_BOOKMARK) {
        element.append(editBookmarkButton(id, isNovel));
      }

      // Re-process expanded view's artist bottom bar.
      const images = document.querySelectorAll(CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE);
      for (const image of images) {
        processNewElement(doImage, image, { forced: true, skipArtistTag: true });
      }

      return true;
    }

    return false;
  };

  const updateToggleBookmarkedButton = (button, mode) => {
    const label = mode === 0
      ? CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL
      : mode === 1
        ? CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED
        : CONFIG.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED;
    const span = document.createElement('span');
    span.textContent = label;
    button.replaceChildren(document.createTextNode(CONFIG.TEXT_TOGGLE_BOOKMARKED), span);
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

    updateToggleBookmarkedButton(button, toggleBookmarkedMode);

    const images = Array.from(imagesContainer.querySelectorAll(CONFIG.SELECTORS_IMAGE));

    if (toggleBookmarkedMode === 0) {
      for (const image of images) {
        delete image.dataset.pixiv_utils_toggle_bookmarked_hide;
      }
    } else if (toggleBookmarkedMode === 1) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || isImageBookmarked(image)) {
          image.dataset.pixiv_utils_toggle_bookmarked_hide = true;
        } else {
          delete image.dataset.pixiv_utils_toggle_bookmarked_hide;
        }
      }
    } else if (toggleBookmarkedMode === 2) {
      for (const image of images) {
        if (image.dataset.pixiv_utils_blocked || !isImageBookmarked(image)) {
          image.dataset.pixiv_utils_toggle_bookmarked_hide = true;
        } else {
          delete image.dataset.pixiv_utils_toggle_bookmarked_hide;
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

    const header = element.querySelector(sectionConfig.selectorHeader);
    if (!header) {
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
    updateToggleBookmarkedButton(button, toggleBookmarkedMode);

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
      for (let i = 0; i < tags.length; i++) {
        const raw = tags[i].textContent;
        // Break early if a title with hashtag (#) on its title is found
        if (raw.startsWith('#')) {
          tag = raw.substring(1);
          break;
        }
        tag = raw;
      }
    }

    if (!tag) {
      return false;
    }

    const blocked = PIXIV_BLOCKED_TAGS_STRING.has(tag) || PIXIV_BLOCKED_TAGS_REGEXP.some(t => t.test(tag));

    if (blocked) {
      element.style.setProperty('display', 'none', 'important');
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
      const skipReason = getImageBlockSkipReason({
        isOwnProfile,
        bookmarked: isImageBookmarked(image)
      });

      const pixivData = await getImagePixivData(data.id, image, data.novel);

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
          remove: false,
          link: data.link,
          priority: true
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
      multiView.parentNode.style.setProperty('display', 'none', 'important');
      logDebug(`Multi view entry removed (UTag: ${utag})`, multiView);
      return true;
    }

    const recommendedUserContainer = element.closest(CONFIG.SELECTORS_RECOMMENDED_USER_CONTAINER);
    if (recommendedUserContainer) {
      recommendedUserContainer.style.setProperty('display', 'none', 'important');
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

  const isElementPassedOrVisible = element => {
    if (element.style.display === 'none') {
      return false;
    }

    // If element is already above the viewport, treat as visible.
    // We do not want the UI to jump around if user scrolls up after navigating back/forth between pages.
    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0) {
      return true;
    }

    // Standard partial-visibility check.
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  };

  let imagesIntersectionObserver = null;

  const initImagesIntersectionObserver = () => {
    if (imagesIntersectionObserver !== null) {
      imagesIntersectionObserver.disconnect();
    }

    imagesIntersectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const opts = entry.target.pixiv_utils_intersection_observer;
        if (entry.isIntersecting && typeof opts.func === 'function') {
          opts.func(entry.target, opts.options);
          imagesIntersectionObserver.unobserve(entry.target);
          delete entry.target.pixiv_utils_intersection_observer;
        }
      }
    }, { delay: 0, threshold: 0 });
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

    cleanupDetachedElementObservers();

    // Reset page type.
    isHome = isOwnProfile = false;

    // Re-init IntersectionObserver for images.
    initImagesIntersectionObserver();
  });

  const processNewElement = (func, element, options = {}) => {
    if (isElementPassedOrVisible(element)) {
      return func(element, options);
    } else {
      // If not in viewport, observe intersection.
      element.pixiv_utils_intersection_observer = { func, options };
      imagesIntersectionObserver.observe(element);
    }
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    // Init Tippy.js for tooltips.
    if (CONFIG.ENABLE_TIPPY_TOOLTIPS) {
      GM_addStyle(GM_getResourceText('tippyCss'));

      GM_addStyle(/*css*/`
        .tippy-box[data-theme~='pixiv-utils'] {
          background-color: rgba(58, 58, 58, 0.88);
          color: #d6d6d6;

          .tippy-content {
            white-space: pre-line;
          }
        }
      `);

      tippy.setDefaultProps(CONFIG.TIPPY_TOOLTIPS_OPTIONS);

      // Keep delegated Tippy initialization, but delay mouse tooltips until the cursor is still.
      const tooltipSelector = '[data-pixiv_utils_tooltip]';
      const stationaryDelay = Math.max(0, Number(CONFIG.TIPPY_TOOLTIPS_STATIONARY_DELAY) || 0);
      const movementTolerance = Math.max(0, Number(CONFIG.TIPPY_TOOLTIPS_MOVEMENT_TOLERANCE) || 0);
      const movementToleranceSquared = movementTolerance * movementTolerance;

      let hoveredTooltip = null;
      let stationaryTimer = null;
      let cursorStationary = false;
      let lastMouseX = 0;
      let lastMouseY = 0;

      const stopStationaryTimer = () => {
        clearTimeout(stationaryTimer);
        stationaryTimer = null;
        document.body.removeEventListener('pointermove', trackMouseMovement);
      };

      let lastPointerType = 'mouse';
      const cancelPendingTooltip = () => {
        stopStationaryTimer();
        hoveredTooltip?._tippy?.hide();
        hoveredTooltip = null;
        cursorStationary = false;
      };
      // Leave mouse and touch clicks alone. Cancel only after actual SPA navigation
      // or a full page unload; harmless clicks should not dismiss a tooltip.
      window.addEventListener('detectnavigate', cancelPendingTooltip);
      window.addEventListener('pagehide', cancelPendingTooltip);

      const trackMouseMovement = event => {
        if (event.pointerType !== 'mouse') {
          return;
        }

        const dx = event.clientX - lastMouseX;
        const dy = event.clientY - lastMouseY;
        if (dx * dx + dy * dy < movementToleranceSquared) {
          return;
        }

        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        startStationaryTimer();
      };

      const startStationaryTimer = () => {
        clearTimeout(stationaryTimer);
        cursorStationary = false;
        stationaryTimer = setTimeout(() => {
          stationaryTimer = null;
          document.body.removeEventListener('pointermove', trackMouseMovement);

          if (!hoveredTooltip?.isConnected ||
            !hoveredTooltip.contains(document.elementFromPoint(lastMouseX, lastMouseY)) ||
            !hoveredTooltip.dataset.pixiv_utils_tooltip) {
            hoveredTooltip = null;
            return;
          }

          cursorStationary = true;
          hoveredTooltip._tippy?.show();
        }, stationaryDelay);
      };

      document.body.addEventListener('pointerover', event => {
        // Keep Tippy's normal touch and pen behavior.
        lastPointerType = event.pointerType;
        if (event.pointerType !== 'mouse') {
          stopStationaryTimer();
          hoveredTooltip = null;
          cursorStationary = false;
          return;
        }

        const target = event.target.closest(tooltipSelector);
        if (!target || target === hoveredTooltip) {
          return;
        }

        stopStationaryTimer();
        hoveredTooltip = target;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        document.body.addEventListener('pointermove', trackMouseMovement, { passive: true });
        startStationaryTimer();
      });

      document.body.addEventListener('pointerout', event => {
        if (event.pointerType === 'mouse' && hoveredTooltip?.contains(event.target) &&
          !hoveredTooltip.contains(event.relatedTarget)) {
          stopStationaryTimer();
          hoveredTooltip = null;
          cursorStationary = false;
        }
      });

      // Create individual tooltips on first interaction, including on touch and keyboard focus.
      tippy.delegate(document.body, {
        target: tooltipSelector,
        content: element => element.dataset.pixiv_utils_tooltip,
        onShow: instance => {
          // Cancel Tippy's normal mouse-hover show until our stationary timer fires.
          // Do not interfere with keyboard focus or touch-triggered tooltips.
          if (!instance.reference.isConnected) return false;
          if (lastPointerType === 'mouse' && !cursorStationary &&
            !instance.reference.contains(document.activeElement)) return false;
        }
      });
    }

    // Immediately attempt to determine page type.
    determinePageType();

    // Init IntersectionObserver for images.
    initImagesIntersectionObserver();

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
    sentinel.on(CONFIG.SELECTORS_IMAGE, element => {
      processNewElement(doImage, element, { isHome, isOwnProfile });
    });

    // Expanded view's artist bottom images (always process immediately)
    sentinel.on(CONFIG.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE, element => {
      doImage(element, { isHome, isOwnProfile, skipArtistTag: true });
    });

    // Multi View Entries
    sentinel.on(CONFIG.SELECTORS_MULTI_VIEW, element => {
      processNewElement(doMultiView, element, { isHome });
    });

    // Toggle Bookmarked Sections
    if (CONFIG.ENABLE_TOGGLE_BOOKMARKED) {
      for (const sectionConfig of CONFIG.SECTIONS_TOGGLE_BOOKMARKED) {
        let configValid = true;
        for (const key of ['selectorParent', 'selectorHeader', 'selectorImagesContainer']) {
          if (Array.isArray(sectionConfig[key])) {
            sectionConfig[key] = sectionConfig[key].join(', ');
          } else {
            sectionConfig[key] = sectionConfig[key] || '';
          }
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
    }

    // Tag Buttons
    if (PIXIV_BLOCKED_TAGS_STRING.size || PIXIV_BLOCKED_TAGS_REGEXP.length) {
      sentinel.on(CONFIG.SELECTORS_TAG_BUTTON, element => {
        processNewElement(doTagButton, element);
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

    log('Started.');

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

    // Default to 1 second cooldown in between keybind event.
    const processKeyEvent = (id, element, cooldown = 1000) => {
      if (!element) {
        return false;
      }

      if (onCooldown[id]) {
        tlog(`"${id}" keybind still on cooldown.`);
        return false;
      }

      if (cooldown > 0) {
        onCooldown[id] = true;
        setTimeout(() => { onCooldown[id] = false; }, cooldown);
      }

      element.click();
      logDebug(`${id} keybind processed`, element);
    };

    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.repeat || event.metaKey) {
        return;
      }

      // Ignore keybinds when currently focused to an input/textarea/editable element.
      if (document.activeElement &&
        (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) {
        return;
      }

      if (event.key === 'b' || event.key === 'B') {
        // "Shift+B" for Edit Bookmark.
        // Pixiv has built-in keybind "B" for just bookmarking.

        // Ignore "Ctrl" and "Alt".
        if (event.ctrlKey || event.altKey) {
          return;
        }

        // "Shift+B": Edit bookmark.
        if (event.shiftKey) {
          event.stopPropagation();
          const element = document.querySelector(selectors.editBookmark);
          return processKeyEvent('bookmarkEdit', element);
        }

        // "B": Scroll to image, only if it has not been scrolled away.
        // In conjunction with Pixiv's built-in keybind.
        const largeImage = document.querySelector('img[src*="p0_master"], img[src*="p0_original"]');
        if (largeImage) {
          const rect = largeImage.getBoundingClientRect();
          if (rect?.top > 0) {
            largeImage.scrollIntoView({ behavior: 'smooth' });
          }
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // "Arrow Left" and "Arrow Right" for navigating pages.

        // Ignore "Ctrl", "Alt", and "Shift".
        if (event.ctrlKey || event.altKey || event.shiftKey) {
          return;
        }

        let element;
        if (currentUrl.indexOf('/users/') >= 0) {
          // On artist profile pages.
          if (event.key === 'ArrowLeft') {
            element = document.querySelector('a[aria-label="Previous"][href]:not([hidden]), a[href]:not([hidden]):has(> pixiv-icon[name$="Prev"]');
          } else if (event.key === 'ArrowRight') {
            element = document.querySelector('a[aria-label="Next"][href]:not([hidden]), a[href]:not([hidden]):has(> pixiv-icon[name$="Next"]');
          }
        } else if (currentUrl.indexOf('/tags/') >= 0 ||
          currentUrl.indexOf('bookmark_new_illust.php') >= 0) {
          // On tags and "Newest by followed" pages.
          if (event.key === 'ArrowLeft') {
            element = document.querySelector('nav > a[aria-disabled="false"][href*="?p="]:first-child');
          } else if (event.key === 'ArrowRight') {
            element = document.querySelector('nav > a[aria-disabled="false"][href*="?p="]:last-child');
          }
        } else if (currentUrl.indexOf('/ranking.php') >= 0) {
          // On rankings pages.
          if (event.key === 'ArrowLeft') {
            element = document.querySelector('div > a:has(> div.icon-v1-prev)');
          } else if (event.key === 'ArrowRight') {
            element = document.querySelector('div > a:has(> div.icon-v1-next)');
          }
        }

        if (element) {
          return processKeyEvent('pageNavigate', element, 100);
        }
      }
    });

    logDebug('Listening for keybinds.');
  } else {
    logDebug('Keybinds disabled.');
  }
})();
