// ==UserScript==
// @name               Bobby's Pixiv Utils
// @name:ja            Bobby's Pixiv Utils（pixiv便利ツール）
// @name:zh-CN         Bobby's Pixiv Utils（pixiv 实用工具）
// @name:zh-HK         Bobby's Pixiv Utils（pixiv 實用工具）
// @name:zh-TW         Bobby's Pixiv Utils（pixiv 實用工具）
// @namespace          https://github.com/BobbyWibowo
// @version            1.7.8
// @description        Mobile-friendly. "Edit bookmark" button, bookmark state filter, dates conversion, block AI-generated works, block by Pixiv tags, block by user IDs, UTags integration, and more!
// @description:ja     PC・スマホ対応。ブックマーク編集ボタン、ブックマーク表示フィルター、日付表示の変換、AI生成作品・タグ・ユーザーIDによるブロック、UTags連携など。
// @description:zh-CN  兼容电脑和手机。支持编辑收藏、按收藏状态筛选作品、转换日期格式，以及屏蔽 AI 生成作品、指定标签和用户 ID；还支持 UTags 集成等功能。
// @description:zh-HK  支援電腦及手機使用。提供「編輯收藏」按鈕、按收藏狀態過濾作品、轉換日期格式、屏蔽 AI 生成作品及指定標籤／用戶 ID，並支援 UTags 整合等功能。
// @description:zh-TW  支援電腦與手機。提供「編輯收藏」按鈕、依收藏狀態篩選作品、轉換日期格式、封鎖 AI 生成作品及指定標籤／使用者 ID，並支援 UTags 整合等功能。
// @author             Bobby Wibowo
// @license            MIT
// @match              *://www.pixiv.net/*
// @exclude            *://www.pixiv.net/setting*
// @exclude            *://www.pixiv.net/manage*
// @icon               https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @run-at             document-start
// @grant              GM_addStyle
// @grant              GM_getValue
// @grant              GM_listValues
// @grant              GM_setValue
// @grant              GM_registerMenuCommand
// @grant              window.onurlchange
// @require            https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js
// @require            https://cdn.jsdelivr.net/npm/@floating-ui/core@1.8.0/dist/floating-ui.core.umd.min.js
// @require            https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.8.0/dist/floating-ui.dom.umd.min.js
// @require            https://cdn.jsdelivr.net/npm/@kobzi/gmconfig@1.0.0/dist/gmConfig.iife.js
// @noframes
// ==/UserScript==

/* global sentinel, FloatingUIDOM, gmConfig */

(function () {
  'use strict';

  const _LOG_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });

  const _log = (prefix, message, ...args) => {
    if (typeof message === 'string') return console.log(prefix + message, ...args);
    return console.log(prefix, message, ...args);
  };

  const tlog = (...args) => _log(`[${_LOG_TIME_FORMAT.format(Date.now())}]: `, ...args);

  const log = (...args) => _log('[Pixiv Utils]: ', ...args);

  /** CONFIG **/

  /* Hard-coded default values.
   * Please use the script's Settings panel to configure these.
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
    PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES: true,
    PIXIV_HIGHLIGHTED_TAGS_FAST: true,
    PIXIV_HIGHLIGHTED_BYPASS_BLOCK: false,
    PIXIV_HIGHLIGHTED_COLOR: '#32cd32',

    PIXIV_BLOCK_AI: false,
    PIXIV_BLOCKED_TAGS: null,
    PIXIV_BLOCKED_TAGS_COMBINE_REGEXES: true,
    PIXIV_BLOCKED_USERS: [],
    PIXIV_BLOCKED_TAGS_FAST: true,
    PIXIV_REMOVE_BLOCKED: false,

    UTAGS_INTEGRATION: true,
    UTAGS_BLOCKED_TAGS: [],

    ENABLE_FLOATING_TOOLTIPS: true,
    FLOATING_TOOLTIPS_STATIONARY_DELAY: 500, // ms
    FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE: 3, // px
    FLOATING_TOOLTIPS_SHOW_DELAY: 500, // ms (keyboard focus)
    FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY: 350, // ms
    FLOATING_TOOLTIPS_OPTIONS: {
      placement: 'bottom',
      strategy: 'fixed',
      mainAxisOffset: 25, // px
      crossAxisOffset: 0, // px
      shiftPadding: 8, // px
      maxWidth: 350 // px
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
      'figcaption ul > div > div:has(a[href*="artworks/"] img[src])', // recommended works after bookmarking
      'ul > div:not(.list-none):has(a[href*="artworks/"] img[src]):not(:has(ul, .gtm-illust-recommend-thumbnail-link))',
      'ul > li:has(a[href*="novel/"])', // desktop (novel)
      'nav:not([style]) > div:has(a[href*="artworks/"] img[src])',
      'nav:not([style]) > div:has(a[href*="novel/"])',
      'div[open] a[href*="users/"] ~ div > div:has(a[href*="artworks/"] img[src])', // user profile popup
      'div[open] div:has(a[href*="users/"]) + div > div:has(a[href*="artworks/"] img[src])', // user profile popup (alt)
      '.ranking-items > .ranking-item', // rankings page
      'div[style*="main-ranking"] ol > li', // rankings page (new)
      'div[data-ga4-label="works_content"] div[data-ga4-label="thumbnail"]', // tags page (new)
      'body > div > div[style*="translateY"] ul li.inline-block > div > div > div:has(a[href*="artworks/"] img[src])', // recommended users after following
      '.works-item-illust:has(.thumb:not([src^="data"]))', // mobile
      '.works-item:not(.works-item-illust):has(.thumb:not([src^="data"]))', // mobile (novel)
      '.works-item-novel-editor-recommend:has(.cover:not([style^="data"]))', // mobile's novels page's editor's picks
      '.stacclist > li.illust', // mobile's feed page
      '[class*="works-item-illust__"]:has([class*="style_thumb"]:not([src^="data"]))' // mobile (discovery feed)
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
      '[data-ga4-label="user_icon_link"]' // home's recommended works grid
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
      '.hSoPoc', // mobile
      '[class*="style_bookmark__"]' // mobile (rankings page)
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
      'main div[style*="translateY"] section', // desktop
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
      'body > div > div[style*="translateY"] ul li.inline-block' // recommended users after following
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
        selectorImagesContainer: '& > div:has(> div:first-child > div:first-child > h2[font-size][color="text2"]):has(> div:first-child > div:first-child span) ~ div:has(a[href*="artworks/"]:not([href*="users/"]), a[href*="novel/"]:not([href*="users/"]))',
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
          return document.querySelector('.ui-button[href*="/settings/profile"]');
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

  const ENV_KEYS = Object.keys(ENV_DEFAULTS);
  const settingOrDefault = (key, value) => value ?? ENV_DEFAULTS[key];
  const getSetting = key => settingOrDefault(key, GM_getValue(key, ENV_DEFAULTS[key]));

  const ENV = {};
  const existingKeys = new Set(GM_listValues());
  for (const key of ENV_KEYS) {
    if (!existingKeys.has(key)) GM_setValue(key, ENV_DEFAULTS[key]);
    // Retain the old nullish fallback for non-null defaults without rewriting storage.
    ENV[key] = getSetting(key);
  }

  // Settings UI and button text translations.
  // zh-CN aliases zh; missing/empty strings fall back to en individually.
  const I18N = {
    en: {
      'tab.General': 'General',
      'tab.Bookmarks': 'Bookmarks',
      'tab.Filtering': 'Filtering',
      'tab.Users': 'Users',
      'tab.Highlights': 'Highlights',
      'tab.Tooltips': 'Tooltips',
      'tab.UTags': 'UTags',
      'tab.Advanced': 'Advanced',
      'tab.Backup': 'Backup',
      settingsTitle: 'Pixiv Utils',
      'language.auto': 'Auto (browser language)',
      'language.en': 'English',
      'language.ja': 'Japanese',
      'language.zh-CN': 'Chinese (Simplified)',
      'language.zh-HK': 'Chinese (Traditional, Hong Kong)',
      'language.zh-TW': 'Chinese (Traditional, Taiwan)',
      'label.MODE': 'Debug mode',
      'label.SETTINGS_LANGUAGE': 'Settings language',
      'label.PIXIV_BLOCKED_TAGS': 'Blocked tags',
      'label.PIXIV_HIGHLIGHTED_TAGS': 'Highlighted tags',
      'label.PIXIV_HIGHLIGHTED_COLOR': 'Default highlight color',
      'label.SECTIONS_TOGGLE_BOOKMARKED': 'Bookmark filter sections',
      'label.BACKUP_TOOLS': 'Import / Export settings',
      'rule.new': 'New rule',
      'rule.tagPattern': 'Tag or regex',
      'rule.regex': 'Use regex',
      'rule.flags': 'Flags',
      'rule.patternPlaceholder': 'Enter tag or regex',
      'rule.regexInfo': 'Regex flags: i (ignore case), m, s, u or v (not together). Avoid g/y; they can cause inconsistent matches.',
      'rule.add': 'Add tag',
      'rule.addGroup': 'Add tag or colored group',
      'rule.addInGroup': 'Add tag',
      'rule.type': 'Type',
      'rule.single': 'Tag or regex',
      'rule.colored': 'Colored group',
      'rule.groupColor': 'Group color',
      'rule.groupTags': 'Group tags',
      'rule.collapse': 'Collapse tags',
      'rule.expand': 'Expand tags',
      'rule.listRequired': 'Expected a list of rules.',
      'rule.needsText': '{location}: enter a tag or regex.',
      'rule.groupLocation': 'Group {number}',
      'rule.location': 'Rule {number}',
      'rule.blockedLocation': 'Blocked rules',
      'rule.groupNeedsTags': 'Group {number}: add a tag list.',
      'rule.combinedRegex': 'Combined regex ({flags}): {error}',
      'rule.noFlags': 'no flags',
      'date.unspecified': 'Default',
      'date.systemTimezone': 'System time zone',
      'date.example': 'Example: {value}',
      'date.invalid': 'Invalid combination: {error}',
      'date.expectedObject': 'Expected a date formatting options object.',
      'text.explicitEmpty': 'Use empty text',
      'text.fallback': 'Leave blank to use the localized default. Select "Use empty text" to save an empty value.',
      'sections.add': 'Add section',
      'sections.parent': 'Parent selectors',
      'sections.header': 'Header selectors',
      'sections.images': 'Images container selectors',
      'sections.info': 'Adds to the built-in sections. Enter one selector per line; built-in checks stay in place.',
      'utags.add': 'Add blocked UTag',
      'utags.tag': 'UTag',
      'utags.info': "Adds to the built-in 'block' and 'hide' tags.",
      'backup.intro': 'Export all saved settings, including preferences. Import only updates the keys provided.',
      'backup.placeholder': 'Paste settings JSON or choose a file...',
      'backup.aria': 'Settings JSON',
      'backup.export': 'Export',
      'backup.copy': 'Copy',
      'backup.download': 'Download',
      'backup.choose': 'Choose file',
      'backup.import': 'Import',
      'backup.emptyCopy': 'Export settings first.',
      'backup.copied': 'Text copied to clipboard.',
      'backup.clipboardFailed': "Couldn't copy automatically. The text is selected for manual copying.",
      'backup.emptyDownload': 'Export settings first.',
      'backup.fileError': 'Could not read file: {error}',
      'backup.emptyImport': 'Paste settings JSON or choose a file first.',
      'backup.importConfirm': 'Import {count} setting(s)?\n\nProvided keys will overwrite saved values. Other keys will stay unchanged. Unsaved edits in Settings will be lost.',
      'backup.imported': 'Settings imported. Reload the page to apply changes.',
      'backup.importError': 'Could not import settings: {error}',
      'backup.objectError': 'Expected a JSON object.',
      'backup.emptyObject': 'The imported object is empty.',
      'field.debugInfo': 'Show debug messages in the browser console.',
      'field.languageInfo': 'Use your browser language or choose one. Missing translations fall back to English.',
      'field.highlightInfo': 'Leave blank for the default (#32cd32). Use "transparent" to hide borders without disabling highlight bypass.',
      'field.highlightFastInfo': 'An uncolored match still checks later groups for an explicit color. If none match, the default color is used.',
      'field.floatingJson': 'Floating UI positioning options (JSON).',
      'field.floatingShowDelay': 'Delay for keyboard focus (ms).',
      'field.floatingTouchHoldDelay': 'Hold duration before showing a tooltip on touchscreens (ms).',
      'field.combineRegexInfo': 'Faster matching, but anchors and lookbehinds may behave differently when combined.',
      'field.highlightBypassInfo': 'Does not override UTags blocking.',
      'field.dateInfo': 'Customize date display with Intl.DateTimeFormat options.',
      'field.selectorInfo': 'Extra CSS selectors are added to the built-in ones, not used in place of them. Enter one CSS selector per line.',
      'selector.heading': 'Custom CSS selectors',
      'field.bookmarkFilterTextInfo': 'This stays visible before the changing state label (for example, “❤️ Show all”).',
      'bookmark.stateHeading': 'Bookmark filter state labels',
      'bookmark.stateInfo': 'One of these appears after the button text, depending on which artworks are shown.',
      'field.keybindInfo': 'Shift+B: Edit bookmark.\nB: Jump to artwork (Pixiv handles bookmarking).\nLeft/Right Arrow: Navigate supported lists.\nInactive while typing or holding Ctrl/Alt/Meta.',
      'field.blockAiInfo': 'Only blocks artwork marked as AI-generated by its artist.',
      'field.delayInfo': 'Delay after the mouse stops (ms).',
      'field.toleranceInfo': 'Allowed mouse movement (px).',
      'validation.object': 'Expected a JSON object.',
      'validation.arrayNull': 'Expected an array or null.',
      'validation.arrayObjects': 'Expected an array of objects.',
      'validation.string': 'Expected a string.',
      'action.settings': 'Settings',
      'action.reload': 'Reload page',
      'action.save': 'Save',
      'action.saved': 'Saved ✓',
      'action.cancel': 'Cancel',
      'action.reset': 'Reset',
      'action.importExport': 'Import / Export',
      'action.close': 'Close',
      'message.save': 'Settings saved. Reload the page to apply changes.',
      'message.reset': 'Settings reset. Reload the page to apply changes.',
      'message.resetConfirm': 'Reset all settings to their defaults?',
      'message.openError': 'Failed to open settings: {error}',
      'message.validation': '{key}: {error}',
      'message.discardChanges': 'Discard unsaved changes?',
      'list.position': 'Move to position (1-{max})',
      'list.drag': 'Drag to reorder',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': 'Edit bookmark',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': 'Cycle bookmarked display (Right-Click to cycle back)',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'Show all',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'Show bookmarked',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': 'Show not bookmarked',
      'label.ENABLE_EDIT_BOOKMARK': 'Show Edit Bookmark button',
      'label.ENABLE_TOGGLE_BOOKMARKED': 'Show bookmark filter button',
      'label.TEXT_EDIT_BOOKMARK': 'Edit Bookmark button text',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': 'Edit Bookmark tooltip',
      'label.TEXT_TOGGLE_BOOKMARKED': 'Bookmark filter button text (always shown)',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': 'Bookmark filter tooltip',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'When showing all',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'When showing bookmarked',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': 'When showing unbookmarked',
      'label.SELECTORS_HOME': 'Home page selectors',
      'label.SELECTORS_OWN_PROFILE': 'Own profile selectors',
      'label.SELECTORS_IMAGE': 'Image card selectors',
      'label.SELECTORS_IMAGE_TITLE': 'Image title selectors',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': 'Artist avatar selectors',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': "Image's auxiliary element selectors",
      'label.SELECTORS_IMAGE_CONTROLS': 'Image control selectors',
      'label.SELECTORS_IMAGE_BOOKMARKED': 'Bookmark indicator selectors',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': 'Expanded view selectors',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': 'Expanded view control selectors',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': "Expanded view's artist bottom bar selectors",
      'label.SELECTORS_MULTI_VIEW': 'Multi-view selectors',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': 'Multi-view control selectors',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': 'Follow button container selectors',
      'label.SELECTORS_FOLLOW_BUTTON': 'Follow button selectors',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': 'Recommended user container selectors',
      'label.SELECTORS_TAG_BUTTON': 'Tag button selectors',
      'label.DATE_CONVERSION': 'Convert dates',
      'label.DATE_CONVERSION_LOCALES': 'Date locale',
      'label.DATE_CONVERSION_OPTIONS': 'Date format',
      'label.SELECTORS_DATE': 'Date element selectors',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': 'Hide novel recommendations on Home',
      'label.ENABLE_KEYBINDS': 'Keyboard shortcuts',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': 'Combine regex patterns',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': 'Stop after first matching colored group',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': 'Do not block highlighted artwork',
      'label.PIXIV_BLOCK_AI': 'Block AI-generated artwork',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': 'Combine regex patterns',
      'label.PIXIV_BLOCKED_USERS': 'Blocked user IDs',
      'users.add': 'Add user ID',
      'users.id': 'User ID',
      'users.invalid': 'Enter digits only for each user ID.',
      'users.info': 'Block artwork from these Pixiv users.',
      'label.PIXIV_BLOCKED_TAGS_FAST': 'Stop at first block match',
      'label.PIXIV_REMOVE_BLOCKED': 'Remove blocked artwork (desktop)',
      'label.UTAGS_INTEGRATION': 'Enable UTags integration',
      'label.UTAGS_BLOCKED_TAGS': 'Blocked UTags',
      'label.ENABLE_FLOATING_TOOLTIPS': 'Use Floating UI tooltips',
      'label.FLOATING_TOOLTIPS_STATIONARY_DELAY': 'Stationary mouse delay',
      'label.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE': 'Mouse movement tolerance',
      'label.FLOATING_TOOLTIPS_SHOW_DELAY': 'Keyboard focus delay',
      'label.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY': 'Touch-and-hold delay',
      'label.FLOATING_TOOLTIPS_OPTIONS': 'Floating UI options',
      'tooltip.highlightedBy': 'Highlighted by:',
      'tooltip.blockedBy': 'Blocked by:',
      'tooltip.blockableBy': 'Blockable by:',
      'tooltip.skippedDueTo': 'Skipped due to:',
      'tooltip.tags': 'Tags: {tags}',
      'tooltip.userId': 'User ID: {id}',
      'tooltip.aiGenerated': 'AI-generated',
      'tooltip.inOwnProfile': 'In own profile',
      'tooltip.imageBookmarked': 'Image is bookmarked',
      'tooltip.imageHighlighted': 'Image is highlighted',
      'tooltip.utag': 'UTag: {tag}',
      'date.weekday': 'Weekday',
      'date.era': 'Era',
      'date.year': 'Year',
      'date.month': 'Month',
      'date.day': 'Day',
      'date.dayPeriod': 'Day period',
      'date.hour': 'Hour',
      'date.minute': 'Minute',
      'date.second': 'Second',
      'date.fractionalSecondDigits': 'Fractional seconds',
      'date.hour12': '12-hour clock',
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
      'tab.General': '一般',
      'tab.Bookmarks': 'ブックマーク',
      'tab.Filtering': 'フィルタリング',
      'tab.Users': 'ユーザー',
      'tab.Highlights': 'ハイライト',
      'tab.Tooltips': 'ツールチップ',
      'tab.UTags': 'UTags',
      'tab.Advanced': '詳細設定',
      'tab.Backup': 'バックアップ',
      settingsTitle: 'Pixiv Utils',
      'language.auto': '自動（ブラウザーの言語）',
      'language.en': '英語',
      'language.ja': '日本語',
      'language.zh-CN': '中国語（簡体字）',
      'language.zh-HK': '中国語（繁体字・香港）',
      'language.zh-TW': '中国語（繁体字・台湾）',
      'label.MODE': 'デバッグモード',
      'label.SETTINGS_LANGUAGE': '設定画面の言語',
      'label.PIXIV_BLOCKED_TAGS': 'ブロックするタグ',
      'label.PIXIV_HIGHLIGHTED_TAGS': 'ハイライトするタグ',
      'label.PIXIV_HIGHLIGHTED_COLOR': '既定のハイライト色',
      'label.SECTIONS_TOGGLE_BOOKMARKED': 'ブックマーク表示フィルターの対象セクション',
      'label.BACKUP_TOOLS': '設定のインポート／エクスポート',
      'rule.new': '新しいルール',
      'rule.tagPattern': 'タグまたは正規表現',
      'rule.regex': '正規表現を使用',
      'rule.flags': 'フラグ',
      'rule.patternPlaceholder': 'タグまたは正規表現を入力',
      'rule.regexInfo': '正規表現のフラグ：i（大文字・小文字を区別しない）、m、s、u または v（u と v は併用不可）。g／y は判定が不安定になるため避けてください。',
      'rule.add': 'タグを追加',
      'rule.addGroup': 'タグまたは色付きグループを追加',
      'rule.addInGroup': 'タグを追加',
      'rule.type': '種類',
      'rule.single': 'タグまたは正規表現',
      'rule.colored': '色付きグループ',
      'rule.groupColor': 'グループの色',
      'rule.groupTags': 'グループ内のタグ',
      'rule.collapse': 'タグを折りたたむ',
      'rule.expand': 'タグを展開',
      'rule.listRequired': 'ルールのリストを指定してください。',
      'rule.needsText': '{location}：タグまたは正規表現を入力してください。',
      'rule.groupLocation': 'グループ {number}',
      'rule.location': 'ルール {number}',
      'rule.blockedLocation': 'ブロックルール',
      'rule.groupNeedsTags': 'グループ {number}：タグのリストを追加してください。',
      'rule.combinedRegex': '結合した正規表現（{flags}）：{error}',
      'rule.noFlags': 'フラグなし',
      'date.unspecified': '既定値',
      'date.systemTimezone': 'システムのタイムゾーン',
      'date.example': '表示例：{value}',
      'date.invalid': '無効な組み合わせ：{error}',
      'date.expectedObject': '日付の書式オプションを含むオブジェクトを指定してください。',
      'text.explicitEmpty': '空の文字列を使用',
      'text.fallback': '空欄の場合は言語に応じた既定のテキストを使用します。空の文字列を保存するには「空の文字列を使用」を選択してください。',
      'sections.add': 'セクションを追加',
      'sections.parent': '親要素のセレクター',
      'sections.header': 'ヘッダーのセレクター',
      'sections.images': '作品一覧コンテナーのセレクター',
      'sections.info': '組み込みのセクションに追加されます。CSS セレクターを1行に1つ入力してください。組み込みの判定条件はそのまま適用されます。',
      'utags.add': 'ブロックする UTag を追加',
      'utags.tag': 'UTag',
      'utags.info': '組み込みの「block」と「hide」タグに追加されます。',
      'backup.intro': '保存済みの設定（表示状態などの環境設定を含む）をすべてエクスポートします。インポート時は指定されたキーのみ更新されます。',
      'backup.placeholder': '設定の JSON を貼り付けるか、ファイルを選択してください...',
      'backup.aria': '設定の JSON',
      'backup.export': 'エクスポート',
      'backup.copy': 'コピー',
      'backup.download': 'ダウンロード',
      'backup.choose': 'ファイルを選択',
      'backup.import': 'インポート',
      'backup.emptyCopy': '先に設定をエクスポートしてください。',
      'backup.copied': 'テキストをクリップボードにコピーしました。',
      'backup.clipboardFailed': '自動的にコピーできませんでした。手動でコピーできるようテキストを選択しました。',
      'backup.emptyDownload': '先に設定をエクスポートしてください。',
      'backup.fileError': 'ファイルを読み込めませんでした：{error}',
      'backup.emptyImport': '設定の JSON を貼り付けるか、ファイルを選択してください。',
      'backup.importConfirm': '{count} 件の設定をインポートしますか？\n\n指定されたキーは保存済みの値を上書きします。その他のキーは変更されません。設定画面の未保存の変更は失われます。',
      'backup.imported': '設定をインポートしました。反映するにはページを再読み込みしてください。',
      'backup.importError': '設定をインポートできませんでした：{error}',
      'backup.objectError': 'JSON オブジェクトを指定してください。',
      'backup.emptyObject': 'インポートするオブジェクトが空です。',
      'field.debugInfo': 'ブラウザーのコンソールにデバッグメッセージを表示します。',
      'field.languageInfo': 'ブラウザーの言語を使用するか、言語を選択してください。翻訳がない項目は英語で表示されます。',
      'field.highlightInfo': '空欄の場合は既定色（#32cd32）を使用します。「transparent」を指定すると、ブロック回避機能を維持したまま枠線を非表示にできます。',
      'field.highlightFastInfo': '色なしのグループが一致しても、後続の色付きグループを探します。見つからなければ既定色を使用します。',
      'field.floatingJson': 'Floating UI の配置オプション（JSON）。',
      'field.floatingShowDelay': 'キーボードフォーカス時の表示待ち時間（ミリ秒）。',
      'field.floatingTouchHoldDelay': 'タッチ操作でツールチップを表示するまでの長押し時間（ミリ秒）。',
      'field.combineRegexInfo': 'マッチングが高速になりますが、正規表現を結合するとアンカーや後読みの動作が変わる場合があります。',
      'field.highlightBypassInfo': 'UTags によるブロックは回避できません。',
      'field.dateInfo': 'Intl.DateTimeFormat のオプションで日付の表示形式をカスタマイズします。',
      'field.selectorInfo': '追加した CSS セレクターは組み込みのセレクターに加えられ、置き換えは行われません。1行に1つ入力してください。',
      'selector.heading': 'カスタム CSS セレクター',
      'field.bookmarkFilterTextInfo': '切り替わる状態ラベルの前に常に表示されます（例：「❤️ すべて表示」）。',
      'bookmark.stateHeading': 'ブックマーク表示フィルターの状態ラベル',
      'bookmark.stateInfo': '表示対象の作品に応じて、これらのいずれかがボタンのテキストの後ろに表示されます。',
      'field.keybindInfo': 'Shift+B：ブックマークを編集。\nB：作品ページに移動（ブックマーク操作は pixiv 側で処理）。\n左右矢印キー：対応する一覧内を移動。\n文字入力中、または Ctrl／Alt／Meta キーを押している間は無効です。',
      'field.blockAiInfo': '作者が AI 生成と設定した作品のみブロックします。',
      'field.delayInfo': 'マウスカーソルが停止してから表示するまでの時間（ミリ秒）。',
      'field.toleranceInfo': '許容するマウスカーソルの移動距離（ピクセル）。',
      'validation.object': 'JSON オブジェクトを指定してください。',
      'validation.arrayNull': '配列または null を指定してください。',
      'validation.arrayObjects': 'オブジェクトの配列を指定してください。',
      'validation.string': '文字列を指定してください。',
      'action.settings': '設定',
      'action.reload': 'ページを再読み込み',
      'action.save': '保存',
      'action.saved': '保存しました ✓',
      'action.cancel': 'キャンセル',
      'action.reset': 'リセット',
      'action.importExport': 'インポート／エクスポート',
      'action.close': '閉じる',
      'message.save': '設定を保存しました。反映するにはページを再読み込みしてください。',
      'message.reset': '設定をリセットしました。反映するにはページを再読み込みしてください。',
      'message.resetConfirm': 'すべての設定を既定値に戻しますか？',
      'message.openError': '設定画面を開けませんでした：{error}',
      'message.validation': '{key}：{error}',
      'message.discardChanges': '未保存の変更を破棄しますか？',
      'list.position': '移動先の位置（1～{max}）',
      'list.drag': 'ドラッグして並べ替え',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': 'ブックマークを編集',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': 'ブックマークの表示を切り替え（右クリックで逆順に切り替え）',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'すべて表示',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'ブックマーク済みのみ表示',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '未ブックマークのみ表示',
      'label.ENABLE_EDIT_BOOKMARK': '「ブックマークを編集」ボタンを表示',
      'label.ENABLE_TOGGLE_BOOKMARKED': 'ブックマーク表示フィルターボタンを表示',
      'label.TEXT_EDIT_BOOKMARK': '「ブックマークを編集」ボタンのテキスト',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '「ブックマークを編集」のツールチップ',
      'label.TEXT_TOGGLE_BOOKMARKED': '表示フィルターボタンのテキスト（常に表示）',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '表示フィルターボタンのツールチップ',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': 'すべて表示する場合',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': 'ブックマーク済みのみ表示する場合',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '未ブックマークのみ表示する場合',
      'label.SELECTORS_HOME': 'ホームページのセレクター',
      'label.SELECTORS_OWN_PROFILE': '自分のプロフィールのセレクター',
      'label.SELECTORS_IMAGE': '作品カードのセレクター',
      'label.SELECTORS_IMAGE_TITLE': '作品タイトルのセレクター',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '作者アイコンのセレクター',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '作品の補助要素のセレクター',
      'label.SELECTORS_IMAGE_CONTROLS': '作品操作ボタンのセレクター',
      'label.SELECTORS_IMAGE_BOOKMARKED': 'ブックマーク済み表示のセレクター',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '作品詳細表示のセレクター',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '作品詳細表示の操作ボタンのセレクター',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '作品詳細表示の作者情報（下部）のセレクター',
      'label.SELECTORS_MULTI_VIEW': '複数作品表示のセレクター',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '複数作品表示の操作ボタンのセレクター',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': 'フォローボタンのコンテナーのセレクター',
      'label.SELECTORS_FOLLOW_BUTTON': 'フォローボタンのセレクター',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': 'おすすめユーザーのコンテナーのセレクター',
      'label.SELECTORS_TAG_BUTTON': 'タグボタンのセレクター',
      'label.DATE_CONVERSION': '日付を変換',
      'label.DATE_CONVERSION_LOCALES': '日付のロケール',
      'label.DATE_CONVERSION_OPTIONS': '日付の表示形式',
      'label.SELECTORS_DATE': '日付要素のセレクター',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': 'ホームのおすすめ小説を非表示',
      'label.ENABLE_KEYBINDS': 'キーボードショートカット',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '正規表現のパターンを結合',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '最初に一致した色付きグループで検索を終了',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': 'ハイライトした作品はブロックしない',
      'label.PIXIV_BLOCK_AI': 'AI 生成作品をブロック',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '正規表現のパターンを結合',
      'label.PIXIV_BLOCKED_USERS': 'ブロックするユーザー ID',
      'users.add': 'ユーザー ID を追加',
      'users.id': 'ユーザー ID',
      'users.invalid': 'ユーザー ID には数字のみを入力してください。',
      'users.info': '指定した pixiv ユーザーの作品をブロックします。',
      'label.PIXIV_BLOCKED_TAGS_FAST': '最初に一致したブロックタグで判定を終了',
      'label.PIXIV_REMOVE_BLOCKED': 'ブロックした作品を削除（PC 版）',
      'label.UTAGS_INTEGRATION': 'UTags 連携を有効にする',
      'label.UTAGS_BLOCKED_TAGS': 'ブロック対象の UTag',
      'label.ENABLE_FLOATING_TOOLTIPS': 'Floating UI ツールチップを使用',
      'label.FLOATING_TOOLTIPS_STATIONARY_DELAY': 'マウス停止後の待ち時間',
      'label.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE': 'マウス移動の許容範囲',
      'label.FLOATING_TOOLTIPS_SHOW_DELAY': 'キーボードフォーカス時の待ち時間',
      'label.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY': 'タッチの長押し時間',
      'label.FLOATING_TOOLTIPS_OPTIONS': 'Floating UI のオプション',
      'tooltip.highlightedBy': 'ハイライト条件:',
      'tooltip.blockedBy': 'ブロック理由:',
      'tooltip.blockableBy': 'ブロック対象の理由:',
      'tooltip.skippedDueTo': 'ブロックをスキップした理由:',
      'tooltip.tags': 'タグ: {tags}',
      'tooltip.userId': 'ユーザー ID: {id}',
      'tooltip.aiGenerated': 'AI生成作品',
      'tooltip.inOwnProfile': '自分のプロフィール内',
      'tooltip.imageBookmarked': '作品はブックマーク済み',
      'tooltip.imageHighlighted': '作品はハイライト済み',
      'tooltip.utag': 'UTag: {tag}',
      'date.weekday': '曜日',
      'date.era': '紀元',
      'date.year': '年',
      'date.month': '月',
      'date.day': '日',
      'date.dayPeriod': '午前／午後などの時間帯',
      'date.hour': '時',
      'date.minute': '分',
      'date.second': '秒',
      'date.fractionalSecondDigits': '秒の小数部の桁数',
      'date.hour12': '12 時間表示',
      'date.hourCycle': '時刻の表記方式',
      'date.timeZoneName': 'タイムゾーン名',
      'date.dateStyle': '日付の形式',
      'date.timeStyle': '時刻の形式',
      'date.localeMatcher': 'ロケールの照合方式',
      'date.formatMatcher': '書式の照合方式',
      'date.timeZone': 'タイムゾーン',
      'date.calendar': '暦',
      'date.numberingSystem': '数字の表記方式',
    },
    zh: {
      'tab.General': '常规',
      'tab.Bookmarks': '收藏',
      'tab.Filtering': '内容过滤',
      'tab.Users': '用户',
      'tab.Highlights': '高亮',
      'tab.Tooltips': '工具提示',
      'tab.UTags': 'UTags',
      'tab.Advanced': '高级设置',
      'tab.Backup': '备份',
      settingsTitle: 'Pixiv Utils',
      'language.auto': '自动（浏览器语言）',
      'language.en': '英语',
      'language.ja': '日语',
      'language.zh-CN': '简体中文（中国大陆）',
      'language.zh-HK': '繁体中文（香港）',
      'language.zh-TW': '繁体中文（台湾）',
      'label.MODE': '调试模式',
      'label.SETTINGS_LANGUAGE': '设置界面语言',
      'label.PIXIV_BLOCKED_TAGS': '屏蔽的标签',
      'label.PIXIV_HIGHLIGHTED_TAGS': '高亮的标签',
      'label.PIXIV_HIGHLIGHTED_COLOR': '默认高亮颜色',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '收藏筛选适用的区域',
      'label.BACKUP_TOOLS': '导入／导出设置',
      'rule.new': '新规则',
      'rule.tagPattern': '标签或正则表达式',
      'rule.regex': '使用正则表达式',
      'rule.flags': '标志',
      'rule.patternPlaceholder': '输入标签或正则表达式',
      'rule.regexInfo': '正则表达式标志：i（忽略大小写）、m、s、u 或 v（u 和 v 不能同时使用）。请避免使用 g／y，以免匹配结果不一致。',
      'rule.add': '添加标签',
      'rule.addGroup': '添加标签或颜色分组',
      'rule.addInGroup': '添加标签',
      'rule.type': '类型',
      'rule.single': '标签或正则表达式',
      'rule.colored': '颜色分组',
      'rule.groupColor': '分组颜色',
      'rule.groupTags': '分组内的标签',
      'rule.collapse': '收起标签',
      'rule.expand': '展开标签',
      'rule.listRequired': '请提供规则列表。',
      'rule.needsText': '{location}：请输入标签或正则表达式。',
      'rule.groupLocation': '分组 {number}',
      'rule.location': '规则 {number}',
      'rule.blockedLocation': '屏蔽规则',
      'rule.groupNeedsTags': '分组 {number}：请添加标签列表。',
      'rule.combinedRegex': '合并后的正则表达式（{flags}）：{error}',
      'rule.noFlags': '无标志',
      'date.unspecified': '默认值',
      'date.systemTimezone': '系统时区',
      'date.example': '示例：{value}',
      'date.invalid': '无效的选项组合：{error}',
      'date.expectedObject': '请输入包含日期格式选项的对象。',
      'text.explicitEmpty': '使用空文本',
      'text.fallback': '留空则使用当前语言的默认文本。勾选“使用空文本”可保存为空字符串。',
      'sections.add': '添加区域',
      'sections.parent': '父元素选择器',
      'sections.header': '标题区域选择器',
      'sections.images': '作品列表容器选择器',
      'sections.info': '新增的区域会与内置区域一起使用。每行输入一个 CSS 选择器；内置的检查条件仍会生效。',
      'utags.add': '添加要屏蔽的 UTag',
      'utags.tag': 'UTag',
      'utags.info': '将在内置的“block”和“hide”标签之外额外添加。',
      'backup.intro': '导出所有已保存的设置，包括显示状态等偏好设置。导入时只更新提供的键。',
      'backup.placeholder': '粘贴设置 JSON，或选择文件...',
      'backup.aria': '设置 JSON',
      'backup.export': '导出',
      'backup.copy': '复制',
      'backup.download': '下载',
      'backup.choose': '选择文件',
      'backup.import': '导入',
      'backup.emptyCopy': '请先导出设置。',
      'backup.copied': '文本已复制到剪贴板。',
      'backup.clipboardFailed': '无法自动复制。已选中文本，可手动复制。',
      'backup.emptyDownload': '请先导出设置。',
      'backup.fileError': '无法读取文件：{error}',
      'backup.emptyImport': '请先粘贴设置 JSON 或选择文件。',
      'backup.importConfirm': '要导入 {count} 项设置吗？\n\n提供的键将覆盖已保存的值，其他键保持不变。设置界面中尚未保存的更改将丢失。',
      'backup.imported': '设置已导入。请重新加载页面以应用更改。',
      'backup.importError': '无法导入设置：{error}',
      'backup.objectError': '应提供 JSON 对象。',
      'backup.emptyObject': '导入的对象为空。',
      'field.debugInfo': '在浏览器控制台中显示调试信息。',
      'field.languageInfo': '使用浏览器语言或手动选择语言。缺少翻译的内容将回退为英语。',
      'field.highlightInfo': '留空时使用默认颜色（#32cd32）。设为“transparent”可隐藏边框，同时保留高亮作品绕过屏蔽的功能。',
      'field.highlightFastInfo': '匹配到未设置颜色的分组后，仍会查找后续有颜色的分组；若无匹配，则使用默认颜色。',
      'field.floatingJson': 'Floating UI 定位选项（JSON）。',
      'field.floatingShowDelay': '键盘聚焦时的显示延迟（毫秒）。',
      'field.floatingTouchHoldDelay': '触摸时长按多久才显示工具提示（毫秒）。',
      'field.combineRegexInfo': '可提高匹配速度，但合并正则表达式后，锚点和后行断言的行为可能有所不同。',
      'field.highlightBypassInfo': '无法绕过 UTags 的屏蔽。',
      'field.dateInfo': '使用 Intl.DateTimeFormat 选项自定义日期显示格式。',
      'field.selectorInfo': '额外的 CSS 选择器会附加到内置选择器，不会替换它们。每行输入一个 CSS 选择器。',
      'selector.heading': '自定义 CSS 选择器',
      'field.bookmarkFilterTextInfo': '此文本始终显示在状态标签之前（例如“❤️ 显示全部”）。',
      'bookmark.stateHeading': '收藏筛选状态标签',
      'bookmark.stateInfo': '根据当前显示的作品范围，下列其中一个状态标签将显示在按钮文本之后。',
      'field.keybindInfo': 'Shift+B：编辑收藏。\nB：跳转至作品页面（由 pixiv 处理收藏操作）。\n左右方向键：在支持的列表中导航。\n输入文字或按住 Ctrl／Alt／Meta 时停用。',
      'field.blockAiInfo': '仅屏蔽作者标记为 AI 生成的作品。',
      'field.delayInfo': '鼠标停止移动后等待的时间（毫秒）。',
      'field.toleranceInfo': '允许的鼠标移动距离（像素）。',
      'validation.object': '应提供 JSON 对象。',
      'validation.arrayNull': '应提供数组或 null。',
      'validation.arrayObjects': '应提供对象数组。',
      'validation.string': '应提供字符串。',
      'action.settings': '设置',
      'action.reload': '重新加载页面',
      'action.save': '保存',
      'action.saved': '已保存 ✓',
      'action.cancel': '取消',
      'action.reset': '重置',
      'action.importExport': '导入／导出',
      'action.close': '关闭',
      'message.save': '设置已保存。请重新加载页面以应用更改。',
      'message.reset': '设置已重置。请重新加载页面以应用更改。',
      'message.resetConfirm': '确定要将所有设置恢复为默认值吗？',
      'message.openError': '无法打开设置界面：{error}',
      'message.validation': '{key}：{error}',
      'message.discardChanges': '要放弃未保存的更改吗？',
      'list.position': '移动到指定位置（1–{max}）',
      'list.drag': '拖动以重新排序',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '编辑收藏',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '切换收藏筛选模式（右键单击可反向切换）',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '显示全部',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '仅显示已收藏',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '仅显示未收藏',
      'label.ENABLE_EDIT_BOOKMARK': '显示“编辑收藏”按钮',
      'label.ENABLE_TOGGLE_BOOKMARKED': '显示收藏筛选按钮',
      'label.TEXT_EDIT_BOOKMARK': '“编辑收藏”按钮文本',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '“编辑收藏”按钮提示',
      'label.TEXT_TOGGLE_BOOKMARKED': '收藏筛选按钮文本（始终显示）',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '收藏筛选按钮提示',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '显示全部时',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '仅显示已收藏时',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '仅显示未收藏时',
      'label.SELECTORS_HOME': '首页选择器',
      'label.SELECTORS_OWN_PROFILE': '个人主页选择器',
      'label.SELECTORS_IMAGE': '作品卡片选择器',
      'label.SELECTORS_IMAGE_TITLE': '作品标题选择器',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '作者头像选择器',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '作品辅助元素选择器',
      'label.SELECTORS_IMAGE_CONTROLS': '作品操作按钮选择器',
      'label.SELECTORS_IMAGE_BOOKMARKED': '已收藏状态指示器选择器',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '作品详情视图选择器',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '作品详情视图操作按钮选择器',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '作品详情视图底部作者区域选择器',
      'label.SELECTORS_MULTI_VIEW': '多作品视图选择器',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '多作品视图操作按钮选择器',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '关注按钮容器选择器',
      'label.SELECTORS_FOLLOW_BUTTON': '关注按钮选择器',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '推荐用户容器选择器',
      'label.SELECTORS_TAG_BUTTON': '标签按钮选择器',
      'label.DATE_CONVERSION': '转换日期格式',
      'label.DATE_CONVERSION_LOCALES': '日期语言区域',
      'label.DATE_CONVERSION_OPTIONS': '日期格式',
      'label.SELECTORS_DATE': '日期元素选择器',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '隐藏首页的小说推荐',
      'label.ENABLE_KEYBINDS': '键盘快捷键',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '合并正则表达式模式',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '匹配到首个有颜色的分组后停止',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '不屏蔽已高亮的作品',
      'label.PIXIV_BLOCK_AI': '屏蔽 AI 生成作品',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '合并正则表达式模式',
      'label.PIXIV_BLOCKED_USERS': '要屏蔽的用户 ID',
      'users.add': '添加用户 ID',
      'users.id': '用户 ID',
      'users.invalid': '每个用户 ID 只能包含数字。',
      'users.info': '屏蔽这些 pixiv 用户发布的作品。',
      'label.PIXIV_BLOCKED_TAGS_FAST': '匹配到首个屏蔽标签后停止',
      'label.PIXIV_REMOVE_BLOCKED': '直接移除被屏蔽的作品（桌面版）',
      'label.UTAGS_INTEGRATION': '启用 UTags 集成',
      'label.UTAGS_BLOCKED_TAGS': '要屏蔽的 UTag',
      'label.ENABLE_FLOATING_TOOLTIPS': '使用 Floating UI 工具提示',
      'label.FLOATING_TOOLTIPS_STATIONARY_DELAY': '鼠标停止后的延迟',
      'label.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE': '鼠标移动容差',
      'label.FLOATING_TOOLTIPS_SHOW_DELAY': '键盘聚焦延迟',
      'label.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY': '触摸长按延迟',
      'label.FLOATING_TOOLTIPS_OPTIONS': 'Floating UI 选项',
      'tooltip.highlightedBy': '高亮依据：',
      'tooltip.blockedBy': '屏蔽原因：',
      'tooltip.blockableBy': '符合屏蔽条件：',
      'tooltip.skippedDueTo': '跳过屏蔽的原因：',
      'tooltip.tags': '标签：{tags}',
      'tooltip.userId': '用户 ID：{id}',
      'tooltip.aiGenerated': 'AI 生成作品',
      'tooltip.inOwnProfile': '位于自己的个人主页',
      'tooltip.imageBookmarked': '作品已收藏',
      'tooltip.imageHighlighted': '作品已高亮',
      'tooltip.utag': 'UTag：{tag}',
      'date.weekday': '星期',
      'date.era': '纪元',
      'date.year': '年',
      'date.month': '月',
      'date.day': '日',
      'date.dayPeriod': '时段（上午／下午等）',
      'date.hour': '小时',
      'date.minute': '分钟',
      'date.second': '秒',
      'date.fractionalSecondDigits': '秒的小数位数',
      'date.hour12': '12 小时制',
      'date.hourCycle': '小时周期',
      'date.timeZoneName': '时区名称',
      'date.dateStyle': '日期样式',
      'date.timeStyle': '时间样式',
      'date.localeMatcher': '语言区域匹配方式',
      'date.formatMatcher': '格式匹配方式',
      'date.timeZone': '时区',
      'date.calendar': '历法',
      'date.numberingSystem': '数字系统',
    },
    'zh-HK': {
      'tab.General': '一般',
      'tab.Bookmarks': '收藏',
      'tab.Filtering': '內容過濾',
      'tab.Users': '用戶',
      'tab.Highlights': '高亮顯示',
      'tab.Tooltips': '提示框',
      'tab.UTags': 'UTags',
      'tab.Advanced': '進階設定',
      'tab.Backup': '備份',
      settingsTitle: 'Pixiv Utils',
      'language.auto': '自動（跟隨瀏覽器語言）',
      'language.en': '英文',
      'language.ja': '日文',
      'language.zh-CN': '簡體中文（中國內地）',
      'language.zh-HK': '繁體中文（香港）',
      'language.zh-TW': '繁體中文（台灣）',
      'label.MODE': '除錯模式',
      'label.SETTINGS_LANGUAGE': '設定介面語言',
      'label.PIXIV_BLOCKED_TAGS': '要屏蔽的標籤',
      'label.PIXIV_HIGHLIGHTED_TAGS': '要高亮顯示的標籤',
      'label.PIXIV_HIGHLIGHTED_COLOR': '預設高亮顏色',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '收藏過濾適用區域',
      'label.BACKUP_TOOLS': '匯入／匯出設定',
      'rule.new': '添加規則',
      'rule.tagPattern': '標籤或正則表達式',
      'rule.regex': '使用正則表達式',
      'rule.flags': '標誌',
      'rule.patternPlaceholder': '輸入標籤或正則表達式',
      'rule.regexInfo': '正則表達式標誌：i（不區分大小寫）、m、s、u 或 v（u 與 v 不能同時使用）。避免使用 g／y，否則比對結果可能不一致。',
      'rule.add': '添加標籤',
      'rule.addGroup': '添加標籤或顏色群組',
      'rule.addInGroup': '添加標籤',
      'rule.type': '類型',
      'rule.single': '標籤或正則表達式',
      'rule.colored': '顏色群組',
      'rule.groupColor': '群組顏色',
      'rule.groupTags': '群組標籤',
      'rule.collapse': '摺疊標籤',
      'rule.expand': '展開標籤',
      'rule.listRequired': '請提供規則列表。',
      'rule.needsText': '{location}：請輸入標籤或正則表達式。',
      'rule.groupLocation': '群組 {number}',
      'rule.location': '規則 {number}',
      'rule.blockedLocation': '屏蔽規則',
      'rule.groupNeedsTags': '群組 {number}：請添加標籤列表。',
      'rule.combinedRegex': '合併正則表達式（{flags}）：{error}',
      'rule.noFlags': '沒有標誌',
      'date.unspecified': '預設',
      'date.systemTimezone': '系統時區',
      'date.example': '例子：{value}',
      'date.invalid': '選項組合無效：{error}',
      'date.expectedObject': '請提供日期格式選項物件。',
      'text.explicitEmpty': '使用空字串',
      'text.fallback': '留空會使用所選語言的預設文字。勾選「使用空字串」則會儲存空白文字。',
      'sections.add': '添加區域',
      'sections.parent': '上層元素選擇器',
      'sections.header': '標題區域選擇器',
      'sections.images': '作品列表容器選擇器',
      'sections.info': '添加的區域會連同內置區域一起使用。每行輸入一個 CSS 選擇器；原有的檢查條件仍然適用。',
      'utags.add': '添加要屏蔽的 UTag',
      'utags.tag': 'UTag',
      'utags.info': '除了內置的「block」和「hide」標籤之外，亦會加入這些標籤。',
      'backup.intro': '匯出所有已儲存的設定，包括個人偏好。匯入時只會更新 JSON 中提供的項目。',
      'backup.placeholder': '貼上設定 JSON，或選擇檔案...',
      'backup.aria': '設定 JSON',
      'backup.export': '匯出',
      'backup.copy': '複製',
      'backup.download': '下載',
      'backup.choose': '選擇檔案',
      'backup.import': '匯入',
      'backup.emptyCopy': '請先匯出設定。',
      'backup.copied': '文字已複製到剪貼簿。',
      'backup.clipboardFailed': '無法自動複製。已選取文字，可以手動複製。',
      'backup.emptyDownload': '請先匯出設定。',
      'backup.fileError': '無法讀取檔案：{error}',
      'backup.emptyImport': '請先貼上設定 JSON 或選擇檔案。',
      'backup.importConfirm': '確定匯入 {count} 項設定？\n\n匯入的項目會覆蓋已儲存的設定，其他項目保持不變。設定視窗內尚未儲存的更改會遺失。',
      'backup.imported': '設定已匯入。請重新載入頁面以套用更改。',
      'backup.importError': '無法匯入設定：{error}',
      'backup.objectError': '必須提供 JSON 物件。',
      'backup.emptyObject': '匯入的物件沒有內容。',
      'field.debugInfo': '在瀏覽器控制台顯示除錯訊息。',
      'field.languageInfo': '使用瀏覽器語言，或自行選擇語言。未有翻譯的文字會以英文顯示。',
      'field.highlightInfo': '留空即使用預設顏色（#32cd32）。填入「transparent」可隱藏邊框，並保留高亮作品略過屏蔽的功能。',
      'field.highlightFastInfo': '匹配到未設定顏色的群組後，仍會尋找後續設有顏色的群組；若無匹配，則使用預設顏色。',
      'field.floatingJson': 'Floating UI 定位選項（JSON）。',
      'field.floatingShowDelay': '鍵盤焦點的顯示延遲（毫秒）。',
      'field.floatingTouchHoldDelay': '觸控時長按多久才顯示提示框（毫秒）。',
      'field.combineRegexInfo': '可以加快比對，但合併正則表達式後，錨點和後顧斷言的結果可能有差異。',
      'field.highlightBypassInfo': '不能略過 UTags 的屏蔽。',
      'field.dateInfo': '透過 Intl.DateTimeFormat 選項自訂日期顯示格式。',
      'field.selectorInfo': '額外的 CSS 選擇器會加入內置選擇器，而不是取代它們。每行輸入一個 CSS 選擇器。',
      'selector.heading': '自訂 CSS 選擇器',
      'field.bookmarkFilterTextInfo': '這段文字會一直顯示於切換中的狀態文字之前（例如「❤️ 顯示全部」）。',
      'bookmark.stateHeading': '收藏過濾狀態文字',
      'bookmark.stateInfo': '按鈕文字後方會按目前的顯示模式出現以下其中一項。',
      'field.keybindInfo': 'Shift+B：編輯收藏。\nB：前往作品頁面（收藏操作由 pixiv 處理）。\n左右方向鍵：瀏覽支援的列表。\n正在輸入文字或按住 Ctrl／Alt／Meta 時不會觸發。',
      'field.blockAiInfo': '只會屏蔽作者標記為 AI 生成的作品。',
      'field.delayInfo': '鼠標停止移動後的等待時間（毫秒）。',
      'field.toleranceInfo': '可容許的鼠標移動距離（像素）。',
      'validation.object': '必須提供 JSON 物件。',
      'validation.arrayNull': '必須提供數組或 null。',
      'validation.arrayObjects': '必須提供物件數組。',
      'validation.string': '必須提供字串。',
      'action.settings': '設定',
      'action.reload': '重新載入頁面',
      'action.save': '儲存',
      'action.saved': '已儲存 ✓',
      'action.cancel': '取消',
      'action.reset': '重設',
      'action.importExport': '匯入／匯出',
      'action.close': '關閉',
      'message.save': '設定已儲存。請重新載入頁面以套用更改。',
      'message.reset': '設定已重設。請重新載入頁面以套用更改。',
      'message.resetConfirm': '確定將所有設定恢復至預設值？',
      'message.openError': '無法開啟設定：{error}',
      'message.validation': '{key}：{error}',
      'message.discardChanges': '捨棄未儲存的更改？',
      'list.position': '移動至指定位置（1–{max}）',
      'list.drag': '拖曳以重新排序',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '編輯收藏',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '切換收藏顯示模式（按鼠標右鍵可反方向切換）',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '顯示全部',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '只顯示已收藏',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '只顯示未收藏',
      'label.ENABLE_EDIT_BOOKMARK': '顯示「編輯收藏」按鈕',
      'label.ENABLE_TOGGLE_BOOKMARKED': '顯示收藏過濾按鈕',
      'label.TEXT_EDIT_BOOKMARK': '「編輯收藏」按鈕文字',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '「編輯收藏」按鈕提示',
      'label.TEXT_TOGGLE_BOOKMARKED': '收藏過濾按鈕文字（一直顯示）',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '收藏過濾按鈕提示',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '顯示全部時',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '只顯示已收藏時',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '只顯示未收藏時',
      'label.SELECTORS_HOME': '首頁選擇器',
      'label.SELECTORS_OWN_PROFILE': '自己的個人頁面選擇器',
      'label.SELECTORS_IMAGE': '作品卡片選擇器',
      'label.SELECTORS_IMAGE_TITLE': '作品標題選擇器',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '作者頭像選擇器',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '作品其他元素選擇器',
      'label.SELECTORS_IMAGE_CONTROLS': '作品操作按鈕選擇器',
      'label.SELECTORS_IMAGE_BOOKMARKED': '已收藏標記選擇器',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '作品詳細檢視選擇器',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '作品詳細檢視操作按鈕選擇器',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '作品詳細檢視底部作者區域選擇器',
      'label.SELECTORS_MULTI_VIEW': '多作品檢視選擇器',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '多作品檢視操作按鈕選擇器',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '關注按鈕容器選擇器',
      'label.SELECTORS_FOLLOW_BUTTON': '關注按鈕選擇器',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '推薦用戶容器選擇器',
      'label.SELECTORS_TAG_BUTTON': '標籤按鈕選擇器',
      'label.DATE_CONVERSION': '轉換日期格式',
      'label.DATE_CONVERSION_LOCALES': '日期語言設定',
      'label.DATE_CONVERSION_OPTIONS': '日期格式',
      'label.SELECTORS_DATE': '日期元素選擇器',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '隱藏首頁的小說推薦',
      'label.ENABLE_KEYBINDS': '鍵盤快捷鍵',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '合併正則表達式',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '找到首個有設定顏色的群組後停止比對',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '不要屏蔽已高亮顯示的作品',
      'label.PIXIV_BLOCK_AI': '屏蔽 AI 生成作品',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '合併正則表達式',
      'label.PIXIV_BLOCKED_USERS': '要屏蔽的用戶 ID',
      'users.add': '添加用戶 ID',
      'users.id': '用戶 ID',
      'users.invalid': '每個用戶 ID 只可包含數字。',
      'users.info': '屏蔽這些 pixiv 用戶發佈的作品。',
      'label.PIXIV_BLOCKED_TAGS_FAST': '找到第一個屏蔽標籤後停止比對',
      'label.PIXIV_REMOVE_BLOCKED': '直接移除被屏蔽的作品（電腦版）',
      'label.UTAGS_INTEGRATION': '啟用 UTags 整合',
      'label.UTAGS_BLOCKED_TAGS': '要屏蔽的 UTag',
      'label.ENABLE_FLOATING_TOOLTIPS': '使用 Floating UI 提示框',
      'label.FLOATING_TOOLTIPS_STATIONARY_DELAY': '鼠標停下後的延遲時間',
      'label.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE': '鼠標移動容許範圍',
      'label.FLOATING_TOOLTIPS_SHOW_DELAY': '鍵盤焦點延遲',
      'label.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY': '觸控長按延遲',
      'label.FLOATING_TOOLTIPS_OPTIONS': 'Floating UI 選項',
      'tooltip.highlightedBy': '高亮原因：',
      'tooltip.blockedBy': '屏蔽原因：',
      'tooltip.blockableBy': '符合屏蔽條件：',
      'tooltip.skippedDueTo': '略過屏蔽的原因：',
      'tooltip.tags': '標籤：{tags}',
      'tooltip.userId': '用戶 ID：{id}',
      'tooltip.aiGenerated': 'AI 生成作品',
      'tooltip.inOwnProfile': '位於自己的個人頁面',
      'tooltip.imageBookmarked': '作品已收藏',
      'tooltip.imageHighlighted': '作品已高亮顯示',
      'tooltip.utag': 'UTag：{tag}',
      'date.weekday': '星期',
      'date.era': '紀元',
      'date.year': '年',
      'date.month': '月',
      'date.day': '日',
      'date.dayPeriod': '時段（上午／下午等）',
      'date.hour': '小時',
      'date.minute': '分鐘',
      'date.second': '秒',
      'date.fractionalSecondDigits': '秒數的小數位',
      'date.hour12': '12 小時制',
      'date.hourCycle': '小時制類型',
      'date.timeZoneName': '時區名稱',
      'date.dateStyle': '日期格式',
      'date.timeStyle': '時間格式',
      'date.localeMatcher': '語言配對方式',
      'date.formatMatcher': '格式配對方式',
      'date.timeZone': '時區',
      'date.calendar': '曆法',
      'date.numberingSystem': '數字系統',
    },
    'zh-TW': {
      'tab.General': '一般',
      'tab.Bookmarks': '收藏',
      'tab.Filtering': '內容篩選',
      'tab.Users': '使用者',
      'tab.Highlights': '醒目標示',
      'tab.Tooltips': '工具提示',
      'tab.UTags': 'UTags',
      'tab.Advanced': '進階設定',
      'tab.Backup': '備份',
      settingsTitle: 'Pixiv Utils',
      'language.auto': '自動（瀏覽器語言）',
      'language.en': '英文',
      'language.ja': '日文',
      'language.zh-CN': '簡體中文（中國大陸）',
      'language.zh-HK': '繁體中文（香港）',
      'language.zh-TW': '繁體中文（台灣）',
      'label.MODE': '偵錯模式',
      'label.SETTINGS_LANGUAGE': '設定介面語言',
      'label.PIXIV_BLOCKED_TAGS': '要屏蔽的標籤',
      'label.PIXIV_HIGHLIGHTED_TAGS': '要醒目標示的標籤',
      'label.PIXIV_HIGHLIGHTED_COLOR': '預設醒目標示顏色',
      'label.SECTIONS_TOGGLE_BOOKMARKED': '收藏篩選適用區塊',
      'label.BACKUP_TOOLS': '匯入／匯出設定',
      'rule.new': '新增規則',
      'rule.tagPattern': '標籤或正規表示式',
      'rule.regex': '使用正規表示式',
      'rule.flags': '旗標',
      'rule.patternPlaceholder': '輸入標籤或正規表示式',
      'rule.regexInfo': '正規表示式旗標：i（不區分大小寫）、m、s、u 或 v（u 與 v 不可同時使用）。請避免使用 g／y，以免比對結果不一致。',
      'rule.add': '新增標籤',
      'rule.addGroup': '新增標籤或色彩群組',
      'rule.addInGroup': '新增標籤',
      'rule.type': '類型',
      'rule.single': '標籤或正規表示式',
      'rule.colored': '色彩群組',
      'rule.groupColor': '群組顏色',
      'rule.groupTags': '群組內標籤',
      'rule.collapse': '收合標籤',
      'rule.expand': '展開標籤',
      'rule.listRequired': '請提供規則清單。',
      'rule.needsText': '{location}：請輸入標籤或正規表示式。',
      'rule.groupLocation': '群組 {number}',
      'rule.location': '規則 {number}',
      'rule.blockedLocation': '屏蔽規則',
      'rule.groupNeedsTags': '群組 {number}：請新增標籤清單。',
      'rule.combinedRegex': '合併後的正規表示式（{flags}）：{error}',
      'rule.noFlags': '無旗標',
      'date.unspecified': '預設值',
      'date.systemTimezone': '系統時區',
      'date.example': '範例：{value}',
      'date.invalid': '無效的選項組合：{error}',
      'date.expectedObject': '請提供包含日期格式選項的物件。',
      'text.explicitEmpty': '使用空字串',
      'text.fallback': '留空將使用目前語言的預設文字。勾選「使用空字串」可儲存空白文字。',
      'sections.add': '新增區塊',
      'sections.parent': '父元素選擇器',
      'sections.header': '標題區域選擇器',
      'sections.images': '作品清單容器選擇器',
      'sections.info': '新增區塊會與內建區塊一併套用。每行輸入一個 CSS 選擇器；內建的檢查條件仍然有效。',
      'utags.add': '新增要屏蔽的 UTag',
      'utags.tag': 'UTag',
      'utags.info': '將在內建的「block」與「hide」標籤之外額外新增。',
      'backup.intro': '匯出所有已儲存的設定（包含使用偏好）。匯入時只更新 JSON 中提供的項目。',
      'backup.placeholder': '貼上設定 JSON，或選擇檔案...',
      'backup.aria': '設定 JSON',
      'backup.export': '匯出',
      'backup.copy': '複製',
      'backup.download': '下載',
      'backup.choose': '選擇檔案',
      'backup.import': '匯入',
      'backup.emptyCopy': '請先匯出設定。',
      'backup.copied': '文字已複製到剪貼簿。',
      'backup.clipboardFailed': '無法自動複製。已選取文字，可手動複製。',
      'backup.emptyDownload': '請先匯出設定。',
      'backup.fileError': '無法讀取檔案：{error}',
      'backup.emptyImport': '請先貼上設定 JSON 或選擇檔案。',
      'backup.importConfirm': '確定要匯入 {count} 項設定嗎？\n\n匯入的項目將覆寫已儲存的設定，其他設定維持不變。設定視窗中尚未儲存的變更將會遺失。',
      'backup.imported': '設定已匯入。請重新載入頁面以套用變更。',
      'backup.importError': '無法匯入設定：{error}',
      'backup.objectError': '應提供 JSON 物件。',
      'backup.emptyObject': '匯入的物件是空的。',
      'field.debugInfo': '在瀏覽器主控台顯示偵錯訊息。',
      'field.languageInfo': '使用瀏覽器語言或手動選擇語言。缺少翻譯的項目將顯示英文。',
      'field.highlightInfo': '留空將使用預設顏色（#32cd32）。設為「transparent」可隱藏邊框，同時保留醒目標示作品的屏蔽略過功能。',
      'field.highlightFastInfo': '符合未設定顏色的群組後，仍會尋找後續設有顏色的群組；若無符合者，則使用預設顏色。',
      'field.floatingJson': 'Floating UI 定位選項（JSON）。',
      'field.floatingShowDelay': '鍵盤焦點的顯示延遲（毫秒）。',
      'field.floatingTouchHoldDelay': '觸控時長按多久才顯示工具提示（毫秒）。',
      'field.combineRegexInfo': '可加快比對速度，但合併正規表示式後，錨點與後顧斷言的行為可能有所不同。',
      'field.highlightBypassInfo': '無法略過 UTags 的屏蔽。',
      'field.dateInfo': '使用 Intl.DateTimeFormat 選項自訂日期顯示格式。',
      'field.selectorInfo': '額外的 CSS 選擇器會附加到內建選擇器，不會取代它們。每行輸入一個 CSS 選擇器。',
      'selector.heading': '自訂 CSS 選擇器',
      'field.bookmarkFilterTextInfo': '這段文字會固定顯示在變動的狀態文字前方（例如「❤️ 顯示全部」）。',
      'bookmark.stateHeading': '收藏篩選狀態標籤',
      'bookmark.stateInfo': '按鈕文字後方會依目前的篩選狀態顯示下列其中一項。',
      'field.keybindInfo': 'Shift+B：編輯收藏。\nB：前往作品頁面（由 pixiv 處理收藏操作）。\n左右方向鍵：瀏覽支援的清單。\n輸入文字或按住 Ctrl／Alt／Meta 時不會觸發。',
      'field.blockAiInfo': '只屏蔽作者自行標記為 AI 生成的作品。',
      'field.delayInfo': '滑鼠停止移動後的等待時間（毫秒）。',
      'field.toleranceInfo': '允許的滑鼠移動距離（像素）。',
      'validation.object': '應提供 JSON 物件。',
      'validation.arrayNull': '應提供陣列或 null。',
      'validation.arrayObjects': '應提供物件陣列。',
      'validation.string': '應提供字串。',
      'action.settings': '設定',
      'action.reload': '重新載入頁面',
      'action.save': '儲存',
      'action.saved': '已儲存 ✓',
      'action.cancel': '取消',
      'action.reset': '重設',
      'action.importExport': '匯入／匯出',
      'action.close': '關閉',
      'message.save': '設定已儲存。請重新載入頁面以套用變更。',
      'message.reset': '設定已重設。請重新載入頁面以套用變更。',
      'message.resetConfirm': '確定要將所有設定還原為預設值嗎？',
      'message.openError': '無法開啟設定介面：{error}',
      'message.validation': '{key}：{error}',
      'message.discardChanges': '要捨棄尚未儲存的變更嗎？',
      'list.position': '移動至指定位置（1–{max}）',
      'list.drag': '拖曳以重新排序',
      'text.TEXT_EDIT_BOOKMARK': '✏️',
      'text.TEXT_EDIT_BOOKMARK_TOOLTIP': '編輯收藏',
      'text.TEXT_TOGGLE_BOOKMARKED': '❤️',
      'text.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '切換收藏篩選模式（按滑鼠右鍵可反向切換）',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '顯示全部',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '僅顯示已收藏',
      'text.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '僅顯示未收藏',
      'label.ENABLE_EDIT_BOOKMARK': '顯示「編輯收藏」按鈕',
      'label.ENABLE_TOGGLE_BOOKMARKED': '顯示收藏篩選按鈕',
      'label.TEXT_EDIT_BOOKMARK': '「編輯收藏」按鈕文字',
      'label.TEXT_EDIT_BOOKMARK_TOOLTIP': '「編輯收藏」按鈕的工具提示',
      'label.TEXT_TOGGLE_BOOKMARKED': '收藏篩選按鈕文字（持續顯示）',
      'label.TEXT_TOGGLE_BOOKMARKED_TOOLTIP': '收藏篩選按鈕的工具提示',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_ALL': '顯示全部時',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED': '僅顯示已收藏時',
      'label.TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED': '僅顯示未收藏時',
      'label.SELECTORS_HOME': '首頁選擇器',
      'label.SELECTORS_OWN_PROFILE': '自己的個人頁面選擇器',
      'label.SELECTORS_IMAGE': '作品卡片選擇器',
      'label.SELECTORS_IMAGE_TITLE': '作品標題選擇器',
      'label.SELECTORS_IMAGE_ARTIST_AVATAR': '作者頭像選擇器',
      'label.SELECTORS_IMAGE_AUXILIARY_ELEMENTS': '作品輔助元素選擇器',
      'label.SELECTORS_IMAGE_CONTROLS': '作品操作按鈕選擇器',
      'label.SELECTORS_IMAGE_BOOKMARKED': '已收藏標示選擇器',
      'label.SELECTORS_EXPANDED_VIEW_IMAGE': '作品詳細檢視選擇器',
      'label.SELECTORS_EXPANDED_VIEW_CONTROLS': '作品詳細檢視操作按鈕選擇器',
      'label.SELECTORS_EXPANDED_VIEW_ARTIST_BOTTOM_IMAGE': '作品詳細檢視底部作者區塊選擇器',
      'label.SELECTORS_MULTI_VIEW': '多作品檢視選擇器',
      'label.SELECTORS_MULTI_VIEW_CONTROLS': '多作品檢視操作按鈕選擇器',
      'label.SELECTORS_FOLLOW_BUTTON_CONTAINER': '關注按鈕容器選擇器',
      'label.SELECTORS_FOLLOW_BUTTON': '關注按鈕選擇器',
      'label.SELECTORS_RECOMMENDED_USER_CONTAINER': '推薦使用者容器選擇器',
      'label.SELECTORS_TAG_BUTTON': '標籤按鈕選擇器',
      'label.DATE_CONVERSION': '轉換日期格式',
      'label.DATE_CONVERSION_LOCALES': '日期語系',
      'label.DATE_CONVERSION_OPTIONS': '日期格式',
      'label.SELECTORS_DATE': '日期元素選擇器',
      'label.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME': '隱藏首頁的小說推薦',
      'label.ENABLE_KEYBINDS': '鍵盤快捷鍵',
      'label.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES': '合併正規表示式模式',
      'label.PIXIV_HIGHLIGHTED_TAGS_FAST': '符合第一個設有顏色的群組後停止比對',
      'label.PIXIV_HIGHLIGHTED_BYPASS_BLOCK': '不要屏蔽已醒目標示的作品',
      'label.PIXIV_BLOCK_AI': '屏蔽 AI 生成作品',
      'label.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES': '合併正規表示式模式',
      'label.PIXIV_BLOCKED_USERS': '要屏蔽的使用者 ID',
      'users.add': '新增使用者 ID',
      'users.id': '使用者 ID',
      'users.invalid': '每個使用者 ID 只能包含數字。',
      'users.info': '屏蔽這些 pixiv 使用者發布的作品。',
      'label.PIXIV_BLOCKED_TAGS_FAST': '符合第一個屏蔽標籤後停止比對',
      'label.PIXIV_REMOVE_BLOCKED': '直接移除被屏蔽的作品（電腦版）',
      'label.UTAGS_INTEGRATION': '啟用 UTags 整合',
      'label.UTAGS_BLOCKED_TAGS': '要屏蔽的 UTag',
      'label.ENABLE_FLOATING_TOOLTIPS': '使用 Floating UI 工具提示',
      'label.FLOATING_TOOLTIPS_STATIONARY_DELAY': '滑鼠停止移動後的延遲',
      'label.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE': '允許的滑鼠移動幅度',
      'label.FLOATING_TOOLTIPS_SHOW_DELAY': '鍵盤焦點延遲',
      'label.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY': '觸控長按延遲',
      'label.FLOATING_TOOLTIPS_OPTIONS': 'Floating UI 選項',
      'tooltip.highlightedBy': '醒目標示依據：',
      'tooltip.blockedBy': '屏蔽原因：',
      'tooltip.blockableBy': '符合屏蔽條件：',
      'tooltip.skippedDueTo': '略過屏蔽的原因：',
      'tooltip.tags': '標籤：{tags}',
      'tooltip.userId': '使用者 ID：{id}',
      'tooltip.aiGenerated': 'AI 生成作品',
      'tooltip.inOwnProfile': '位於自己的個人頁面',
      'tooltip.imageBookmarked': '作品已收藏',
      'tooltip.imageHighlighted': '作品已醒目標示',
      'tooltip.utag': 'UTag：{tag}',
      'date.weekday': '星期',
      'date.era': '紀元',
      'date.year': '年',
      'date.month': '月',
      'date.day': '日',
      'date.dayPeriod': '時段（上午／下午等）',
      'date.hour': '小時',
      'date.minute': '分鐘',
      'date.second': '秒',
      'date.fractionalSecondDigits': '秒的小數位數',
      'date.hour12': '12 小時制',
      'date.hourCycle': '小時制類型',
      'date.timeZoneName': '時區名稱',
      'date.dateStyle': '日期樣式',
      'date.timeStyle': '時間樣式',
      'date.localeMatcher': '語系比對方式',
      'date.formatMatcher': '格式比對方式',
      'date.timeZone': '時區',
      'date.calendar': '曆法',
      'date.numberingSystem': '數字系統',
    },
  };
  // Region-specific Traditional Chinese. zh-CN is an alias for the `zh`
  // dictionary; older zh-Hant preferences continue to use Taiwan wording.
  const browserSettingsLocale = () => {
    for (const code of navigator.languages?.length ? navigator.languages : [navigator.language || 'en']) {
      const language = String(code).toLowerCase();
      const primary = language.split('-')[0];
      if (primary === 'ja' || primary === 'en') return primary;
      if (primary === 'zh') {
        const subtags = language.split('-');
        if (subtags.includes('hk') || subtags.includes('mo')) return 'zh-HK';
        if (subtags.includes('tw') || subtags.includes('hant')) return 'zh-TW';
        return 'zh';
      }
    }
    return 'en';
  };
  const resolveSettingsLocale = choice => {
    if (choice === 'zh-CN') return 'zh';
    if (choice === 'zh-Hant') return 'zh-TW'; // backwards compatibility
    return ['en', 'ja', 'zh', 'zh-HK', 'zh-TW'].includes(choice)
      ? choice
      : browserSettingsLocale();
  };
  let settingsUiLocale = resolveSettingsLocale(ENV.SETTINGS_LANGUAGE);
  const tr = (key, replacements = {}, locale = settingsUiLocale) => {
    const template = I18N[locale]?.[key] || I18N.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(replacements, name) ? String(replacements[name]) : match);
  };

  // Read the installed userscript version directly from its @version metadata.
  const settingsPanelTitle = () => `${tr('settingsTitle')} v${GM_info.script.version}`;

  const _DOCUMENT_FRAGMENT = document.createDocumentFragment();
  const isSelectorValid = selector => {
    try {
      _DOCUMENT_FRAGMENT.querySelector(selector);
      return true;
    } catch {
      return false;
    }
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
  for (const key of ENV_KEYS) {
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

  // Initialize formatters only when dates are actually needed (page conversion
  // or artwork metadata). A malformed stored format must not abort the script.
  let dateFormatters = null;
  const getDateFormatter = (includeTime = true) => {
    if (!dateFormatters) {
      const create = (locale, options) => {
        const dateOnly = { ...options };
        for (const key of ['hour12', 'hourCycle', 'hour', 'minute', 'second']) delete dateOnly[key];
        return {
          full: new Intl.DateTimeFormat(locale, options),
          dateOnly: new Intl.DateTimeFormat(locale, dateOnly)
        };
      };
      try {
        dateFormatters = create(CONFIG.DATE_CONVERSION_LOCALES, CONFIG.DATE_CONVERSION_OPTIONS);
      } catch (error) {
        console.warn('[Pixiv Utils]: Invalid date formatting configuration; using defaults:', error);
        dateFormatters = create(ENV_DEFAULTS.DATE_CONVERSION_LOCALES, ENV_DEFAULTS.DATE_CONVERSION_OPTIONS);
      }
    }
    return includeTime ? dateFormatters.full : dateFormatters.dateOnly;
  };

  const formatArtworkDate = date => {
    try { return getDateFormatter().format(new Date(date)); } catch { return null; }
  };

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

    const dateString = getDateFormatter(dateHasHMS).format(date);

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
  const storedTag = value => value.regex
    ? [value.value, value.flags || '']
    : value.value;

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
      return [key, (matching || lines.length > 1) ? lines : lines.join(', ')];
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

  // Only expose supported positioning options.
  const validateFloatingOptions = value => {
    if (!isPlainObject(value)) throw new TypeError('Expected a Floating UI options object.');
    const allowed = Object.keys(ENV_DEFAULTS.FLOATING_TOOLTIPS_OPTIONS);
    for (const [key, option] of Object.entries(value)) {
      if (!allowed.includes(key)) throw new TypeError(`Unknown Floating UI option: ${key}`);
      if (key === 'placement') {
        if (!/^(top|right|bottom|left)(-(start|end))?$/.test(option)) {
          throw new TypeError('placement must be top, right, bottom, left, or a -start/-end variant.');
        }
      } else if (key === 'strategy') {
        if (!['fixed', 'absolute'].includes(option)) throw new TypeError('strategy must be fixed or absolute.');
      } else if (!Number.isFinite(option) ||
        (key !== 'crossAxisOffset' && option < 0) ||
        (key === 'maxWidth' && option <= 0)) {
        throw new TypeError(`${key} must be a finite ${key === 'maxWidth' ? 'positive' : key === 'crossAxisOffset' ? '' : 'non-negative '}number.`);
      }
    }
  };

  // UI serialization only. No storage changes occur until Save, Reset or Import.
  const settingToEditor = (key, value) => {
    if (key === 'SETTINGS_LANGUAGE') return value === 'zh' ? 'zh-CN' : value === 'zh-Hant' ? 'zh-TW' : value;
    if (key === 'MODE') return value === 'DEBUG';
    if (key === 'SECTIONS_TOGGLE_BOOKMARKED') return sectionsToEditor(value);
    if (key === 'UTAGS_BLOCKED_TAGS') return utagsToEditor(value);
    if (key === 'PIXIV_BLOCKED_USERS') return blockedUsersToEditor(value);
    if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
      return tagsToEditor(value, key === 'PIXIV_HIGHLIGHTED_TAGS');
    }
    if (key === 'FLOATING_TOOLTIPS_OPTIONS') return settingsJson(value);
    if (key.startsWith('SELECTORS_')) return Array.isArray(value) ? value.join('\n') : value || '';
    return value;
  };

  const editorToSetting = (key, value, previous) => {
    if (key === 'SETTINGS_LANGUAGE') return value === 'zh-CN' ? 'zh' : value;
    if (key === 'MODE') return value ? 'DEBUG' : 'PROD';
    if (key === 'SECTIONS_TOGGLE_BOOKMARKED') return sectionsFromEditor(value, previous);
    if (key === 'UTAGS_BLOCKED_TAGS') return utagsFromEditor(value);
    if (key === 'PIXIV_BLOCKED_USERS') return blockedUsersFromEditor(value);
    if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
      return tagsFromEditor(value, key === 'PIXIV_HIGHLIGHTED_TAGS');
    }
    if (key === 'FLOATING_TOOLTIPS_OPTIONS') return JSON.parse(value);
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
    if (key === 'PIXIV_BLOCKED_USERS') return 'Users';
    if (key.startsWith('PIXIV_HIGHLIGHTED')) return 'Highlights';
    if (key.startsWith('PIXIV_')) return 'Filtering';
    if (key.startsWith('FLOATING_TOOLTIPS_') || key === 'ENABLE_FLOATING_TOOLTIPS') return 'Tooltips';
    if (key.startsWith('UTAGS_')) return 'UTags';
    return 'Advanced';
  };
  const makeSettingsDefinitions = () => {
    const definitions = {};
    const tabOrder = ['General', 'Bookmarks', 'Filtering', 'Users', 'Highlights', 'Tooltips', 'UTags', 'Advanced'];
    const priority = {
      // Group the behavior switches above the tag/color editors.
      PIXIV_BLOCKED_TAGS_FAST: -20,
      PIXIV_REMOVE_BLOCKED: -10,
      PIXIV_HIGHLIGHTED_TAGS_FAST: -20,
      PIXIV_HIGHLIGHTED_BYPASS_BLOCK: -10,
      PIXIV_HIGHLIGHTED_COLOR: -5
    };
    const options = Object.entries(ENV_DEFAULTS).sort(([a], [b]) =>
      Number(b === 'SETTINGS_LANGUAGE') - Number(a === 'SETTINGS_LANGUAGE') ||
      tabOrder.indexOf(settingsTab(a)) - tabOrder.indexOf(settingsTab(b)) ||
      (priority[a] ?? 0) - (priority[b] ?? 0));
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
          'zh-CN': tr('language.zh-CN'),
          'zh-HK': tr('language.zh-HK'),
          'zh-TW': tr('language.zh-TW')
        };
        field.description = tr('field.languageInfo');
      } else if (key.startsWith('TEXT_')) {
        Object.assign(field, localizedTextField(key));
      } else if (typeof fallback === 'boolean') {
        field.type = 'checkbox';
      } else if (typeof fallback === 'number') {
        field.type = 'number';
        field.min = 0;
      } else if (key === 'PIXIV_BLOCKED_TAGS' || key === 'PIXIV_HIGHLIGHTED_TAGS') {
        const highlighted = key === 'PIXIV_HIGHLIGHTED_TAGS';
        field.type = 'list';
        field.addLabel = tr(highlighted ? 'rule.addGroup' : 'rule.add');
        field.reorder = true;
        field.itemTitle = r => r.type === 'group' ? tr('rule.colored') : regexRuleTitle(r);
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
                itemTitle: r => regexRuleTitle(r),
                addLabel: tr('rule.addInGroup'),
                reorder: true,
                depends: r => r.type === 'group'
              }
            }
          : tagRuleSchema();
        const combineKey = `${key}_COMBINE_REGEXES`;
        field.validate = value => {
          const combine = document.querySelector('.gc-p')
            ? document.querySelector(`.gc-p input[id="${combineKey}"]`)?.checked
            : ENV[combineKey];
          return validateTagRules(value, highlighted, Boolean(combine));
        };
        field.description = tr('rule.regexInfo');
      } else if (key === 'DATE_CONVERSION_OPTIONS') {
        Object.assign(field, dateOptionsField);
        field.description = tr('field.dateInfo');
      } else if (key === 'FLOATING_TOOLTIPS_OPTIONS') {
        Object.assign(field, jsonObjectField());
        field.validate = value => {
          try { validateFloatingOptions(JSON.parse(value)); } catch (error) { return error.message; }
          return '';
        };
        field.description = tr('field.floatingJson');
      } else if (key === 'SECTIONS_TOGGLE_BOOKMARKED') {
        field.type = 'list';
        field.addLabel = tr('sections.add');
        field.reorder = true;
        field.itemTitle = entry => entry.selectorParent || tr('sections.parent');
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
        field.itemTitle = entry => entry.userId || tr('users.id');
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
        field.itemTitle = entry => entry.value || tr('utags.tag');
        field.item = {
          value: { type: 'text', label: tr('utags.tag'), default: '', required: true }
        };
        field.description = tr('utags.info');
        field.validate = value => value.some(entry => !entry.value?.trim()) ? tr('validation.string') : '';
      } else if (key.startsWith('SELECTORS_')) {
        field.type = 'textarea';
        field.rows = 3;
      } else if (typeof fallback === 'string') {
        field.type = 'text';
        if (key === 'PIXIV_HIGHLIGHTED_COLOR') {
          field.description = tr('field.highlightInfo');
          field.placeholder = ENV_DEFAULTS.PIXIV_HIGHLIGHTED_COLOR;
        }
      } else {
        field.type = 'textarea';
        field.rows = 5;
        field.validate = value => {
          try {
            JSON.parse(value);
            return '';
          } catch (error) {
            return error.message;
          }
        };
      }
      if (key === 'TEXT_TOGGLE_BOOKMARKED') field.description = tr('field.bookmarkFilterTextInfo');
      if (key === 'ENABLE_KEYBINDS') field.description = tr('field.keybindInfo');
      if (key === 'PIXIV_BLOCK_AI') field.description = tr('field.blockAiInfo');
      if (key.endsWith('_COMBINE_REGEXES')) field.description = tr('field.combineRegexInfo');
      if (key === 'PIXIV_HIGHLIGHTED_BYPASS_BLOCK') field.description = tr('field.highlightBypassInfo');
      if (key === 'PIXIV_HIGHLIGHTED_TAGS_FAST') field.description = tr('field.highlightFastInfo');
      if (key === 'FLOATING_TOOLTIPS_STATIONARY_DELAY') field.description = tr('field.delayInfo');
      if (key === 'FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE') field.description = tr('field.toleranceInfo');
      if (key === 'FLOATING_TOOLTIPS_SHOW_DELAY') field.description = tr('field.floatingShowDelay');
      if (key === 'FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY') field.description = tr('field.floatingTouchHoldDelay');
      definitions[key] = field;
    }
    // Backup controls are managed locally and never persisted as configuration values.
    definitions.BACKUP_TOOLS = {
      tab: tr('tab.Backup'),
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
    const get = key => Object.hasOwn(imported, key)
      ? imported[key]
      : getSetting(key);
    const textRuleValid = value => {
      if (typeof value === 'string') return true;
      if (!Array.isArray(value) || value.length !== 2 ||
        typeof value[0] !== 'string' || typeof value[1] !== 'string') return false;
      try {
        RegExp(value[0], value[1]);
        return true;
      } catch {
        return false;
      }
    };
    const validSectionSelector = value => typeof value === 'string'
      ? Boolean(value.trim())
      : Array.isArray(value) && value.length > 0 &&
      value.every(selector => typeof selector === 'string' && Boolean(selector.trim()));
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
        if (!['auto', 'en', 'ja', 'zh', 'zh-CN', 'zh-HK', 'zh-TW', 'zh-Hant'].includes(value)) {
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
            validSectionSelector(section[name]))))) {
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
      } else if (key === 'FLOATING_TOOLTIPS_OPTIONS') {
        validateFloatingOptions(value);
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
      for (const [key, value] of Object.entries(imported)) {
        GM_setValue(key, value);
        if (panel?.isOpen && Object.hasOwn(ENV_DEFAULTS, key)) {
          panel.set(key, settingToEditor(key, settingOrDefault(key, value)));
        }
      }
      if (panel?.isOpen) {
        // Update the stored-value baseline, so Save doesn't undo imported values.
        await panel._load();
        panel._mark();
        refreshSettingsEnhancements(panel, false);
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
        textarea.value = settingsJson(Object.fromEntries(
          GM_listValues().map(key => [key, GM_getValue(key)])));
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
      'TEXT_EDIT_BOOKMARK', 'PIXIV_BLOCK_AI', 'PIXIV_BLOCKED_TAGS',
      'PIXIV_HIGHLIGHTED_COLOR', 'PIXIV_HIGHLIGHTED_TAGS',
      'FLOATING_TOOLTIPS_STATIONARY_DELAY', 'UTAGS_BLOCKED_TAGS',
      'SELECTORS_HOME', 'SECTIONS_TOGGLE_BOOKMARKED', 'FLOATING_TOOLTIPS_OPTIONS']) {
      insertBefore(key, 'pixiv-utils-settings-divider');
    }
    insertBefore('TEXT_EDIT_BOOKMARK', 'pixiv-utils-global-note', tr('text.fallback'));
    insertBefore('SELECTORS_HOME', 'pixiv-utils-section-heading', tr('selector.heading'));
    insertBefore('SELECTORS_HOME', 'pixiv-utils-global-note', tr('field.selectorInfo'));
    insertBefore('TEXT_TOGGLE_BOOKMARKED_SHOW_ALL', 'pixiv-utils-section-heading', tr('bookmark.stateHeading'));
    insertBefore('TEXT_TOGGLE_BOOKMARKED_SHOW_ALL', 'pixiv-utils-global-note', tr('bookmark.stateInfo'));
    // Visually group the three mutually exclusive state labels without
    // wrapping gmConfig's field nodes or changing how its serializer works.
    for (const key of ['TEXT_TOGGLE_BOOKMARKED_SHOW_ALL',
      'TEXT_TOGGLE_BOOKMARKED_SHOW_BOOKMARKED', 'TEXT_TOGGLE_BOOKMARKED_SHOW_NOT_BOOKMARKED']) {
      fieldGroup(key)?.classList.add('pixiv-utils-bookmark-state-field');
    }
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
      this._storedOriginals = {};
      this._initialEditorValues = {};
      for (const [key, field] of Object.entries(this._fields)) {
        if (!(key in ENV_DEFAULTS)) continue; // backup buttons have no storage key
        const stored = GM_getValue(key, ENV_DEFAULTS[key]);
        this._storedOriginals[key] = stored;
        const uiValue = settingToEditor(key, settingOrDefault(key, stored));
        field.value = uiValue;
        this._initialEditorValues[key] = JSON.stringify(uiValue);
      }
      this._clean = this._json();
    }

    async save () {
      const current = this._vals();
      for (const [key, fallback] of Object.entries(ENV_DEFAULTS)) {
        if (!(key in current)) continue;
        const currentJson = JSON.stringify(current[key]);
        if (!this._resetting && currentJson === this._initialEditorValues[key]) continue;
        const stored = this._resetting
          ? fallback
          : editorToSetting(key, current[key], this._storedOriginals[key]);
        GM_setValue(key, stored);
        this._storedOriginals[key] = stored;
        this._initialEditorValues[key] = currentJson;
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

  const settingsStyle = /*css*/`
  /* gmConfig's .gc-c uses width:100%; account for padding and borders. */
  .gc-p, .gc-p * {
    box-sizing: border-box;
  }
  .gc-p .gc-c, .gc-p input[type="text"], .gc-p textarea,
  .gc-p select, .gc-p .pixiv-utils-backup textarea {
    max-width: 100%;
  }
  /* Keep the outer dialog height constant across tabs; scroll only its content. */
  .gc-p {
    height: min(740px, calc(100dvh - 40px));
    max-height: calc(100dvh - 40px);
  }
  .gc-p.gc-p > form {
    height: 100%;
    min-height: 0;
    max-height: none;
  }
  .gc-p .gc-hd, .gc-p .gc-f {
    flex: 0 0 auto;
  }
  .gc-p .gc-b {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .gc-p .gc-tb {
    flex: 0 0 auto;
    border-bottom: 0 !important;
    box-shadow: none !important;
    background-image: none !important;
  }
  .gc-p .gc-tb::before, .gc-p .gc-tb::after { content: none !important; }
  /* Rounded controls and list cards, without affecting input dimensions. */
  .gc-p :is(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea, button) {
    border-radius: 5px;
  }
  .gc-p :is(.gc-li, .gc-list, .gc-li-b) {
    border-radius: 7px;
  }
  .gc-p :is(.gc-li-h, .gc-hd, .gc-f) {
    border-radius: 5px;
  }
  .gc-p :is(input, select, textarea, button):focus-visible {
    outline-offset: 2px;
  }
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
  .gc-p .gc-tb + .gc-b {
    border-top: 0 !important;
  }
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
  .gc-p .gc-g:has(#ENABLE_KEYBINDS) .gc-h {
    white-space: pre-line;
  }
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
  .gc-p .gc-list-items {
    min-width: 0;
    max-width: 100%;
  }
  .gc-p .gc-li-b > .gc-r .gc-g:has(input[id$="_regex"]) .gc-ck {
    /* Match the label height of neighboring textboxes before the checkbox. */
    padding-top: 23px;
    align-items: center;
  }
  .gc-p .pixiv-utils-text-editor {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .gc-p .pixiv-utils-empty-override {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
  }
  .gc-p .pixiv-utils-empty-override input {
    width: auto;
  }

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
  .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_value"]) {
    grid-column: 1;
  }
  .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_regex"]) {
    grid-column: 2;
  }
  .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_flags"]) {
    grid-column: 3;
  }
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
  dialog.gc-p::backdrop {
    background: rgba(0, 0, 0, 0.56);
  }
  .gc-p .gc-li-h > .gc-li-t {
    min-width: 0;
  }
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
  .gc-p .pixiv-utils-drag-handle:active {
    cursor: grabbing;
  }
  .gc-p .pixiv-utils-dragging {
    opacity: 0.55;
  }
  .gc-p .pixiv-utils-drop-before {
    box-shadow: inset 0 3px 0 var(--gc-a, #888);
  }
  .gc-p .pixiv-utils-drop-after {
    box-shadow: inset 0 -3px 0 var(--gc-a, #888);
  }
  .gc-p .pixiv-utils-nested-collapsed > .gc-list {
    display: none;
  }
  .gc-p .pixiv-utils-backup {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gc-p .pixiv-utils-backup p {
    margin: 0;
  }
  .gc-p .pixiv-utils-backup textarea {
    width: 100%; min-height: 260px; box-sizing: border-box;
    font: 12px/1.5 monospace; resize: vertical;
  }
  .gc-p .pixiv-utils-backup-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .gc-p .pixiv-utils-backup-buttons button {
    padding: 5px 9px;
    cursor: pointer;
  }
  .gc-p .gc-f > .gc-h button {
    cursor: pointer;
  }
  @media (max-width: 640px) {
    .gc-p {
      position: fixed; inset: 0; margin: 0;
      width: 100vw !important; max-width: none !important;
      height: 100dvh; max-height: 100dvh;
      border-radius: 0;
    }
    .gc-p > form {
      width: 100%;
    }
    .gc-p .gc-hd {
      padding: 10px 12px;
      padding-top: max(10px, env(safe-area-inset-top));
    }
    .gc-p .gc-b {
      padding: 10px 12px;
    }
    .gc-p .gc-tb {
      flex-wrap: nowrap;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: thin;
    }
    .gc-p .gc-tb > button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .gc-p .gc-f {
      flex-wrap: wrap; gap: 6px; padding: 8px 12px;
      padding-bottom: max(8px, env(safe-area-inset-bottom));
    }
    .gc-p .gc-f button {
      min-height: 34px;
    }
    .gc-p .gc-f > .gc-h {
      margin-right: auto;
    }
    .gc-p .pixiv-utils-date-editor {
      grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
    }
    .gc-p .gc-li {
      padding: 6px;
    }
    .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) {
      grid-template-columns: minmax(0, 1fr) 65px 51px;
      gap: 5px;
    }
    .gc-p .gc-r > .gc-g {
      min-width: 0;
    }
    .gc-p .gc-c, .gc-p .pixiv-utils-date-editor :is(input, select),
    .gc-p .pixiv-utils-backup textarea {
      font-size: 16px;
    }
    .gc-p .gc-li-h {
      flex-wrap: wrap;
    }
    .gc-p .pixiv-utils-backup-buttons {
      align-items: stretch;
    }
    .gc-p .pixiv-utils-backup-buttons button {
      min-height: 36px;
    }
  }
  @media (max-width: 400px) {
    /* Nested colored groups cannot fit three same-row controls on small phones. */
    .gc-p .gc-li-b > .gc-r:has(> .gc-g input[id$="_value"]) {
      grid-template-columns: minmax(0, 1fr) 62px;
    }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_value"]) {
      grid-column: 1 / -1;
    }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_regex"]) {
      grid-column: 1;
    }
    .gc-p .gc-li-b > .gc-r > .gc-g:has(input[id$="_flags"]) {
      grid-column: 2;
    }
    .gc-p .gc-li-b > .gc-r .gc-g:has(input[id$="_regex"]) .gc-ck {
      padding-top: 0;
    }
  }
  `;

  // Settings-only CSS is unnecessary until the user opens the panel.
  // Keep it for the rest of this page session so reopening cannot add duplicates.
  let settingsStyleAdded = false;
  const addSettingsStyleOnce = () => {
    if (settingsStyleAdded) return;

    GM_addStyle(settingsStyle);
    settingsStyleAdded = true;
  };

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
  const refreshSettingsEnhancements = (panel, localize = true) => {
    syncColoredGroupToggles();
    syncSettingsDecorations();
    initListOrderControls(panel);
    if (localize) localizePanelChrome(panel);
  };

  const openSettingsPanel = async () => {
    if (settingsOpening || settingsPanel?.isOpen) return;
    settingsOpening = true;
    try {
      settingsUiLocale = resolveSettingsLocale(getSetting('SETTINGS_LANGUAGE'));
      await waitPageLoaded();
      const SettingsConstructor = await loadSettingsConstructor();
      addSettingsStyleOnce();
      const panel = new SettingsConstructor();
      await panel.init(makeSettingsDefinitions(), {
        title: settingsPanelTitle(),
        width: 'min(900px, 96vw)',
        closeOnSave: false, // Keep the Reload page button available after Save.
        onBeforeClose: () => window.confirm(tr('message.discardChanges')),
        onBeforeSave: values => {
          // Defensive validation for additional conversions done during persistence.
          for (const key of ['FLOATING_TOOLTIPS_OPTIONS', 'UTAGS_BLOCKED_TAGS', 'SECTIONS_TOGGLE_BOOKMARKED', 'PIXIV_BLOCKED_USERS']) {
            try { editorToSetting(key, values[key], ENV[key]); } catch (error) { alert(tr('message.validation', { key, error: error.message })); return false; }
          }
        },
        onOpen: () => {
          refreshSettingsEnhancements(panel, false);
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
                panel.reinit(makeSettingsDefinitions(), settingsPanelTitle());
                refreshSettingsEnhancements(panel);
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
            panel.reinit(makeSettingsDefinitions(), settingsPanelTitle());
            refreshSettingsEnhancements(panel);
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

  GM_registerMenuCommand(`⚙️ ${tr('action.settings')}`, openSettingsPanel);

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
    'aside:has(iframe[src*="premium_lp"]) > ul > li', // tags page's popular works
    'body > div > div[style*="translateY"] ul li.inline-block > div > div > div' // recommended users after following
  ].join(', ');

  const SELECTORS_IMAGE_MOBILE = '.works-item';

  // Both rule types compile literal tags and regexes identically. Keep one
  // compiler while retaining highlighted group order and explicit color priority.
  const compileTagRules = (tags, combineRegexes) => {
    const result = { string: new Set(), regexp: [] };
    const byFlags = new Map();
    for (const tag of tags || []) {
      if (typeof tag === 'string') {
        result.string.add(tag);
      } else if (Array.isArray(tag)) {
        const flags = tag[1] || '';
        if (combineRegexes) {
          if (!byFlags.has(flags)) byFlags.set(flags, []);
          byFlags.get(flags).push(tag[0]);
        } else {
          result.regexp.push(new RegExp(tag[0], flags));
        }
      }
    }
    if (combineRegexes) {
      for (const [flags, patterns] of byFlags) {
        result.regexp.push(new RegExp(patterns.join('|'), flags));
      }
    }
    return result;
  };

  const PIXIV_HIGHLIGHTED_TAGS_FORMATTED = [];
  for (const config of CONFIG.PIXIV_HIGHLIGHTED_TAGS) {
    const grouped = config && typeof config === 'object' && !Array.isArray(config);
    const compiled = compileTagRules(grouped ? config.tags : [config],
      CONFIG.PIXIV_HIGHLIGHTED_TAGS_COMBINE_REGEXES);
    if (!compiled.string.size && !compiled.regexp.length) continue;
    if (grouped && typeof config.color === 'string') compiled.color = config.color;
    PIXIV_HIGHLIGHTED_TAGS_FORMATTED.push(compiled);
  }

  logDebug('PIXIV_HIGHLIGHTED_TAGS_FORMATTED = ', PIXIV_HIGHLIGHTED_TAGS_FORMATTED);
  const PIXIV_HIGHLIGHTED_TAGS_VALIDATED = PIXIV_HIGHLIGHTED_TAGS_FORMATTED.length;

  const blockedTagRules = compileTagRules(CONFIG.PIXIV_BLOCKED_TAGS,
    CONFIG.PIXIV_BLOCKED_TAGS_COMBINE_REGEXES);
  const PIXIV_BLOCKED_TAGS_STRING = blockedTagRules.string;
  const PIXIV_BLOCKED_TAGS_REGEXP = blockedTagRules.regexp;

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
  const notify = url => {
    const newUrl = new URL(url || window.location.href, window.location.origin).href;
    if (currentUrl !== newUrl) {
      const event = new CustomEvent('detectnavigate');
      window.dispatchEvent(event);
      currentUrl = newUrl;
    }
  };

  if (window.onurlchange === null) {
    window.addEventListener('urlchange', event => {
      notify(event.url);
    });
    logDebug('Using window.onurlchange.');
  } else {
    const oldMethods = {};
    ['pushState', 'replaceState'].forEach(method => {
      oldMethods[method] = history[method];
      history[method] = function (...args) {
        oldMethods[method].apply(this, args);
        notify(args[2]);
      };
    });

    window.addEventListener('popstate', event => {
      notify();
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

  // Split only top-level commas; selectors may contain commas inside :is(),
  // :has(), attribute values or quoted strings.
  const splitSelectorList = selector => {
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let i = 0; i < selector.length; i++) {
      const char = selector[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (quote) { if (char === quote) quote = null; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(' || char === '[') { depth++; continue; }
      if (char === ')' || char === ']') { depth--; continue; }
      if (char === ',' && depth === 0) {
        parts.push(selector.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(selector.slice(start).trim());
    return parts.filter(Boolean);
  };

  const formatChildSelector = (parentSelector, childSelector) =>
    splitSelectorList(childSelector).map(selector => {
      const child = selector.startsWith('&') ? selector.slice(1).trimStart() : selector;
      return `:is(${parentSelector})${child ? ` ${child}` : ''}`;
    }).join(', ');

  const _formatSelectorsMultiViewControls = () =>
    splitSelectorList(formatChildSelector(CONFIG.SELECTORS_MULTI_VIEW, CONFIG.SELECTORS_MULTI_VIEW_CONTROLS));

  const _SELECTORS_IMAGE_CONTROLS = splitSelectorList(CONFIG.SELECTORS_IMAGE_CONTROLS);

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

  /* some novel items */
  :not(#higher_specificity) {
    .absolute.right-0,
    .novel-series-thumbnail,
    .works-item-novel,
    .works-item-novel-editor-recommend {
      .pixiv_utils_edit_bookmark {
        margin-top: 6px;
      }
    }
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

  :not(#higher_specificity) :is(li, div):has(> .pixiv_utils_image_artist_container) {
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

  :not(#higher_specificity) :not(:is(${SELECTORS_IMAGE_MOBILE}))[data-pixiv_utils_toggle_bookmarked_hide] {
    display: none !important;
  }

  :not(#higher_specificity) :is(${SELECTORS_IMAGE_MOBILE})[data-pixiv_utils_toggle_bookmarked_hide] > * {
    visibility: hidden !important;
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

  /* recommended users after following */
  body > div > div[style*="translateY"] ul li.inline-block > div > div > div:has(a[href*="artworks/"] img[src]) {
    &[data-pixiv_utils_highlight] ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-radius: 0;
    }

    &[data-pixiv_utils_highlight]:nth-child(1) ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-top-left-radius: 8px;
    }

    &[data-pixiv_utils_highlight]:nth-child(3) ${SELECTORS_IMAGE_HIGHLIGHTED} {
      border-top-right-radius: 8px;
    }
  }

  :not(#higher_specificity) :is(div, a):has(+ .pixiv_utils_blocked_image_container) {
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

  [data-pixiv_utils_expanded_view_blocked] :is([role="presentation"], .swipe-detector) :is(img, canvas) {
    filter: blur(32px);
  }

  [data-pixiv_utils_expanded_view_blocked] :is([role="presentation"], .swipe-detector):hover :is(img, canvas) {
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

  const editBookmarkHref = (id, isNovel) => isNovel
    ? `https://www.pixiv.net/novel/bookmark_add.php?id=${id}`
    : `https://www.pixiv.net/bookmark_add.php?type=illust&illust_id=${id}`;

  const editBookmarkButton = (id, isNovel = false) => {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pixiv_utils_edit_bookmark_container';

    const button = document.createElement('a');
    button.className = 'pixiv_utils_edit_bookmark';
    button.textContent = CONFIG.TEXT_EDIT_BOOKMARK;

    if (CONFIG.TEXT_EDIT_BOOKMARK_TOOLTIP) {
      button.title = CONFIG.TEXT_EDIT_BOOKMARK_TOOLTIP;
    }

    button.href = editBookmarkHref(id, isNovel);

    buttonContainer.append(button);
    return buttonContainer;
  };

  const hasEditBookmarkButton = (controls, id, isNovel) => {
    const button = controls?.querySelector('.pixiv_utils_edit_bookmark_container .pixiv_utils_edit_bookmark');
    return Boolean(button?.isConnected && controls.contains(button) &&
      button.href === editBookmarkHref(id, isNovel));
  };

  const ensureEditBookmarkButton = (controls, id, isNovel, placement = 'prepend') => {
    const existing = controls.querySelector('.pixiv_utils_edit_bookmark_container');
    if (!CONFIG.ENABLE_EDIT_BOOKMARK) {
      existing?.remove();
      return false;
    }
    if (hasEditBookmarkButton(controls, id, isNovel)) return false;
    existing?.remove();
    const created = editBookmarkButton(id, isNovel);
    if (placement === 'beforeLast' && controls.lastChild) controls.lastChild.before(created);
    else if (placement === 'append') controls.append(created);
    else controls.prepend(created);
    return true;
  };

  // Ordered by priority; IMG SRCs are only considered where explicitly requested.
  const ITEM_SOURCES = [
    { selector: 'img[src*="_p0"]', regex: /\/(\d+)(-[a-z0-9]+)?_p0/, img: true },
    { selector: 'a[href*="artworks/"]', regex: /artworks\/(\d+)/ },
    { selector: 'a[href*="illust_id="]', regex: /illust_id=(\d+)/ },
    { selector: 'a[href*="novel/show.php?id="]', regex: /novel\/show\.php\?id=(\d+)/, novel: true },
    { selector: 'a[href*="novel/series/"]', regex: /novel\/series\/(\d+)/, novel: true }
  ];

  const findItemData = (element, tryImg = false) => {
    const result = {
      id: null,
      novel: false
    };

    for (const method of ITEM_SOURCES) {
      if (method.img && !tryImg) continue;

      const found = element.querySelector(method.selector);
      if (found) {
        const value = method.img ? found.src : found.href;
        if (method.img) result.img = found;
        else result.link = found;

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

  const getToggleBookmarkedMode = element => {
    const section = element.closest('[data-pixiv_utils_toggle_bookmarked_section]');
    return section ? Number(section.dataset.pixiv_utils_toggle_bookmarked_mode) : null;
  };

  const setToggleBookmarkedMode = (section, imagesContainer, mode) => {
    section.dataset.pixiv_utils_toggle_bookmarked_mode = mode;
    imagesContainer.dataset.pixiv_utils_toggle_bookmarked_mode = mode;
  };

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

  const readReactArtistSources = (props, target) => {
    for (const key of ['rawThumbnail', 'thumbnail', 'work']) {
      readArtistMetadata(props?.[key], target);
      if (target.userId !== null && target.userName !== null) break;
    }
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
      if (props) readReactArtistSources(props, artist);
    }
    return artist;
  };

  const extractImagePixivData = async element => {
    const data = {
      id: null,
      title: null,
      ai: null,
      tags: null,
      createDate: null,
      userId: null,
      userName: null
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
        data.id = _data.id;
        data.title = _data.title;
        data.ai = _data.ai_type == null ? null : _data.ai_type === 2;
        data.tags = _data.tags;

        if (Number.isFinite(_data.upload_timestamp)) {
          data.createDate = formatArtworkDate(_data.upload_timestamp * 1000);
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

          const props = obj.memoizedProps;
          let source = null;

          // Try known direct props.
          if (props.tags) {
            source = props;
          } else if (props.content?.tags) {
            source = props.content;
          } else if (props.content?.thumbnails?.length) {
            source = props.content.thumbnails[0];
          } else {
            for (const key of ['rawThumbnail', 'thumbnail', 'work']) {
              if (props[key]) {
                source = props[key];
                break;
              }
            }
          }

          // Try children that may not be reflected in its deeper .child props.
          if (source === null && props.children?.props?.children && Array.isArray(props.children?.props?.children)) {
            for (const child of props.children.props.children) {
              if (child?.props?.thumbnail) {
                source = child.props?.thumbnail;
                break;
              }
            }
          }

          // Try alternative children that may not be reflected in its deeper .child props.
          if (source === null && props.children && !Array.isArray(props.children)) {
            if (props.children.props?.thumbnail) {
              source = props.children.props.thumbnail;
            } else if (props.children.props?.content) {
              // Rankings page may not supply an AI flag.
              source = props.children.props.content;
              if (source.thumbnails?.length) source = source.thumbnails[0];
            }
          }

          if (source !== null) {
            readArtistMetadata(source, data);
            const id = source.id ?? source.illust_id;
            data.id = id == null ? null : String(id);
            data.title = source.title;
            data.ai = source.aiType == null ? null : source.aiType === 2;
            data.tags = source.tags;

            const date = Number.isFinite(source.illust_upload_timestamp)
              ? (source.illust_upload_timestamp * 1000)
              : source.createDate;
            if (date !== undefined) data.createDate = formatArtworkDate(date);
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

  // Structured tooltip details belong to an artwork element, not a global string.
  // WeakMap entries naturally expire when Pixiv drops a recycled grid element.
  const floatingTooltipDetails = new WeakMap();
  // Bound when the shared Floating UI tooltip is initialized.
  let syncActiveFloatingTooltip = () => {};

  const createTooltipFooter = (heading, body) => ({ heading, body });

  const normalizeTooltipFooter = footer => {
    if (!footer) return [];
    if (Array.isArray(footer)) return footer.filter(section => section?.body);
    // Keep the existing plain-text footer contract for other callers/extensions.
    return [{ heading: '', body: String(footer).trim() }];
  };

  const createModerationFooter = ({ highlightOpts, blockOpts }, { blocked = false, skipReason = [] } = {}) => {
    const footer = [];
    if (highlightOpts) footer.push(createTooltipFooter(tr('tooltip.highlightedBy'), highlightOpts.hint));
    if (blockOpts) footer.push(createTooltipFooter(tr(blocked ? 'tooltip.blockedBy' : 'tooltip.blockableBy'), blockOpts.hint));
    if (skipReason.length) footer.push(createTooltipFooter(tr('tooltip.skippedDueTo'), skipReason.join('\n')));
    return footer;
  };

  const getImageModeration = pixivData => ({
    highlightOpts: PIXIV_HIGHLIGHTED_TAGS_VALIDATED ? isImageHighlightedByData(pixivData) : false,
    blockOpts: PIXIV_BLOCKED_TAGS_VALIDATED ? isImageBlockedByData(pixivData) : false
  });

  const createImageTooltipDetails = ({ pixivData = {}, footer, moderation = {} }) => {
    const sections = normalizeTooltipFooter(footer);
    const tags = Array.isArray(pixivData.tags) ? pixivData.tags : [];
    const details = {
      title: pixivData.title || '',
      ai: Boolean(pixivData.ai),
      tags,
      date: pixivData.createDate || '',
      footer: sections,
      highlightedTagColors: moderation.highlightOpts?.tagColors || new Map(),
      blockedTags: new Set(moderation.blockOpts?.blockedTags || []),
      aiBlockable: Boolean(moderation.blockOpts?.blockedAI),
      actuallyBlocked: Boolean(moderation.actuallyBlocked)
    };
    const lines = [];
    if (details.title) lines.push(details.title);
    if (details.ai) lines.push(tr('tooltip.aiGenerated'));
    if (tags.length) lines.push(tags.join(', '));
    if (details.date) lines.push(details.date);
    for (const section of sections) {
      if (section.heading) lines.push(section.heading);
      if (section.body) lines.push(section.body);
    }
    return { ...details, plainText: lines.join('\n').trim() };
  };

  // Use textContent and DOM nodes instead of innerHTML: titles and tags come
  // from untrusted Pixiv artwork metadata and must never be interpreted as HTML.
  const renderImageTooltip = (container, target) => {
    const details = floatingTooltipDetails.get(target);
    if (!details) {
      container.textContent = target.dataset.pixiv_utils_tooltip || '';
      return;
    }
    const nodes = [];
    const textRow = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      node.textContent = text;
      return node;
    };
    if (details.title) {
      nodes.push(textRow('strong', 'pixiv-utils-tooltip-title', details.title));
    }
    if (details.ai) {
      const state = details.actuallyBlocked && details.aiBlockable
        ? 'blocked'
        : details.aiBlockable ? 'blockable' : 'neutral';
      const ai = textRow('span', 'pixiv-utils-tooltip-ai', tr('tooltip.aiGenerated'));
      ai.dataset.state = state;
      const row = document.createElement('div');
      row.className = 'pixiv-utils-tooltip-ai-row';
      row.append(ai);
      nodes.push(row);
    }
    if (details.tags.length) {
      const list = document.createElement('div');
      list.className = 'pixiv-utils-tooltip-tags';
      for (const [index, tag] of details.tags.entries()) {
        if (index) list.append(textRow('span', 'pixiv-utils-tooltip-tag-separator', ', '));
        const highlighted = details.highlightedTagColors.has(tag);
        const blocked = details.blockedTags.has(tag);
        if (!highlighted && !blocked) {
          list.append(document.createTextNode(tag));
          continue;
        }
        const node = textRow('span', 'pixiv-utils-tooltip-tag', tag);
        node.dataset.match = highlighted && blocked ? 'both' : blocked ? 'blocked' : 'highlighted';
        if (highlighted) {
          const color = details.highlightedTagColors.get(tag);
          if (typeof color === 'string' && CSS.supports('color', color)) {
            node.style.setProperty('--pixiv-utils-tooltip-tag-color', color);
          }
        }
        list.append(node);
      }
      nodes.push(list);
    }
    if (details.date) nodes.push(textRow('div', 'pixiv-utils-tooltip-date', details.date));
    if (details.footer.length) {
      const footer = document.createElement('div');
      footer.className = 'pixiv-utils-tooltip-footer';
      for (const section of details.footer) {
        const row = document.createElement('div');
        row.className = 'pixiv-utils-tooltip-footer-section';
        if (section.heading) row.append(textRow('span', 'pixiv-utils-tooltip-footer-heading', section.heading));
        if (section.body) row.append(textRow('span', 'pixiv-utils-tooltip-footer-body', section.body));
        footer.append(row);
      }
      nodes.push(footer);
    }
    container.replaceChildren(...nodes);
  };

  const setImageTitle = (element, options = {}) => {
    if (!element) return;
    const details = createImageTooltipDetails(options);
    if (!details.plainText) {
      floatingTooltipDetails.delete(element);
      delete element.dataset.pixiv_utils_tooltip;
      element.removeAttribute('title');
      syncActiveFloatingTooltip(element);
      return;
    }
    if (CONFIG.ENABLE_FLOATING_TOOLTIPS) {
      floatingTooltipDetails.set(element, details);
      element.removeAttribute('title');
      // Retain plain text for selector, accessibility and native fallback paths.
      element.dataset.pixiv_utils_tooltip = details.plainText;
      syncActiveFloatingTooltip(element);
    } else {
      floatingTooltipDetails.delete(element);
      delete element.dataset.pixiv_utils_tooltip;
      element.title = details.plainText;
    }
  };

  // Central matching predicate shared by blocking and highlighting. Rule compilation
  // (including combined regexes and flag handling) remains unchanged.
  const matchesConfiguredTag = (tag, strings, regexps) =>
    strings.has(tag) || regexps.some(pattern => pattern.test(tag));

  const isImageHighlightedByData = data => {
    const result = {
      highlightedTags: [],
      tagColors: new Map(),
      hint: '',
      color: null
    };

    for (const config of PIXIV_HIGHLIGHTED_TAGS_FORMATTED) {
      for (const tag of data.tags) {
        if (matchesConfiguredTag(tag, config.string, config.regexp)) {
          result.highlightedTags.push(tag);
          // Retain each matched tag's group color for tooltip presentation.
          // First match wins, consistent with the first-match color behavior.
          if (!result.tagColors.has(tag)) {
            result.tagColors.set(tag, config.color || CONFIG.PIXIV_HIGHLIGHTED_COLOR);
          }
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

    result.hint = tr('tooltip.tags', { tags: result.highlightedTags.join(', ') });
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
      result.hint = tr('tooltip.userId', { id: blockedUserId });
      return result;
    }

    result.blockedAI = CONFIG.PIXIV_BLOCK_AI && data.ai;
    if (CONFIG.PIXIV_BLOCKED_TAGS_FAST && result.blockedAI) {
      result.hint = tr('tooltip.aiGenerated');
      return result;
    }

    for (const tag of data.tags || []) {
      if (matchesConfiguredTag(tag, PIXIV_BLOCKED_TAGS_STRING, PIXIV_BLOCKED_TAGS_REGEXP)) {
        result.blockedTags.push(tag);
        if (CONFIG.PIXIV_BLOCKED_TAGS_FAST) break;
      }
    }

    if (blockedUserId === null && !result.blockedAI && !result.blockedTags.length) return false;

    if (blockedUserId !== null) result.hint += tr('tooltip.userId', { id: blockedUserId });
    if (result.blockedAI) result.hint += `${result.hint ? '\n' : ''}${tr('tooltip.aiGenerated')}`;
    if (result.blockedTags.length) result.hint += `${result.hint ? '\n' : ''}${tr('tooltip.tags', { tags: result.blockedTags.join(', ') })}`;
    return result;
  };

  const getImageBlockSkipReason = (options = {}) => {
    const skipReason = [];

    if (options.isOwnProfile) {
      skipReason.push(tr('tooltip.inOwnProfile'));
    }

    if (options.bookmarked) {
      skipReason.push(tr('tooltip.imageBookmarked'));
    }

    if (options.highlighted) {
      skipReason.push(tr('tooltip.imageHighlighted'));
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

    // Process using this section's current filter, not another section's mode.
    const sectionMode = getToggleBookmarkedMode(element);
    if (sectionMode !== null && sectionMode !== 0) {
      element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
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
        pixivData: obj.pixivData,
        moderation: { ...obj.moderation, actuallyBlocked: true },
        footer: createModerationFooter(obj.moderation, { blocked: true })
      });
      logDebug(`Image blocked (${obj.options.hint.replace('\n', ', ')})`, element);
    }

    return true;
  };

  const addImageArtist = (element, pixivData) => {
    // Keep an attached matching label, but rebuild one removed by Pixiv.
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

    const href = `https://www.pixiv.net/users/${encodeURIComponent(artist.userId)}`;
    const old = element.querySelector('.pixiv_utils_image_artist_container');
    const link = old?.querySelector('.pixiv_utils_image_artist');
    if (link?.isConnected && element.contains(link) &&
      link.href === href && link.textContent === artist.userName) return false;
    old?.remove();

    const div = document.createElement('div');
    div.className = 'pixiv_utils_image_artist_container';
    const replacement = document.createElement('a');
    replacement.className = 'pixiv_utils_image_artist';
    replacement.href = href;
    replacement.textContent = artist.userName;
    div.append(replacement);
    element.append(div);
    element.dataset.pixiv_utils_artist_added = true;
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

    // Process new entries using their own section's current filter mode.
    const bookmarked = isImageBookmarked(element);
    const sectionMode = getToggleBookmarkedMode(element);
    if (sectionMode !== null) {
      if (sectionMode === 1 && bookmarked) {
        element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
      } else if (sectionMode === 2 && !bookmarked) {
        element.dataset.pixiv_utils_toggle_bookmarked_hide = true;
      } else {
        delete element.dataset.pixiv_utils_toggle_bookmarked_hide;
      }
    }

    // Skip if edit bookmark button already inserted, unless forced.
    if (!options.forced &&
      hasEditBookmarkButton(element.querySelector(CONFIG.SELECTORS_IMAGE_CONTROLS), data.id, data.novel) &&
      (!element.dataset.pixiv_utils_artist_added ||
        element.querySelector('.pixiv_utils_image_artist_container'))) {
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

    const moderation = getImageModeration(pixivData);
    const { highlightOpts, blockOpts } = moderation;
    if (highlightOpts) doHighlightImage(element, { options: highlightOpts });

    let skipReason = [];
    if (blockOpts) {
      // Only block image if not in own profile, not bookmarked,
      // or optionally, not highlighted.
      skipReason = getImageBlockSkipReason({
        isOwnProfile,
        bookmarked,
        highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
      });
      const blocked = doBlockImage(element, {
        options: blockOpts,
        data,
        pixivData,
        moderation,
        skipReason: skipReason.join(', ')
      });
      if (blocked) return true;
    }

    setImageTitle(element, {
      pixivData,
      moderation,
      footer: createModerationFooter(moderation, { skipReason })
    });

    // Exit early if in own profile, and not in bookmarks tab.
    if (options.isOwnProfile && currentUrl.indexOf('/bookmarks') === -1) {
      return false;
    }

    // Exit early if in sections where images won't have control buttons.
    if (element.closest(SELECTORS_IMAGE_CONTAINER_SIMPLIFIED)) {
      return false;
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
      const artistTag = element.querySelector('a[href*="users/"]:not(.pixiv_utils_image_artist)');

      let hasVisibleArtistTag = Boolean(artistTag);
      // If the image itself is visible, but its built-in artist tag is not.
      if (hasVisibleArtistTag && element.offsetParent !== null) {
        hasVisibleArtistTag = artistTag.offsetParent !== null;
      }

      // Add artist tag if necessary.
      const needsArtist = !hasVisibleArtistTag &&
        !element.closest('.user-details-card ~ div .works-horizontal-list') &&
        (currentUrl.indexOf('users/') === -1 || currentUrl.indexOf('/bookmarks') !== -1);
      if (needsArtist) addImageArtist(element, pixivData);
      else {
        element.querySelector('.pixiv_utils_image_artist_container')?.remove();
        delete element.dataset.pixiv_utils_artist_added;
      }
    }

    if (imageControls) ensureEditBookmarkButton(imageControls, data.id, data.novel);

    return true;
  };

  const doBlockMultiView = (element, obj = {}) => {
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
        const moderation = getImageModeration(pixivData);
        const { blockOpts, highlightOpts } = moderation;
        let skipReason = [];
        if (blockOpts) {
          skipReason = getImageBlockSkipReason({
            bookmarked: isImageBookmarked(element),
            highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
          });
          const blocked = await doBlockMultiView(element, {
            options: blockOpts,
            skipReason: skipReason.join(', ')
          });
          if (blocked) return true;
        }
        setImageTitle(element, {
          pixivData,
          moderation,
          footer: createModerationFooter(moderation, { skipReason })
        });
      }
    }

    if (CONFIG.REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME && options.isHome && data.novel) {
      element.parentNode.style.setProperty('display', 'none', 'important');
      logDebug('Novel recommendation removed from home', element);
      return true;
    }

    const multiViewControls = element.querySelector(CONFIG.SELECTORS_MULTI_VIEW_CONTROLS);
    if (!multiViewControls) return false;
    if (hasEditBookmarkButton(multiViewControls, data.id, data.novel)) return false;
    ensureEditBookmarkButton(multiViewControls, data.id, data.novel, 'beforeLast');
    return true;
  };

  const doBlockExpandedView = (element, obj = {}) => {
    if (obj.skipReason) {
      logDebug(`Expanded view is blockable, but skipped (reason: ${obj.skipReason})`, element);
      return false;
    }

    element.dataset.pixiv_utils_expanded_view_blocked = true;

    setImageTitle(obj.titleTarget, {
      pixivData: obj.pixivData,
      moderation: { ...obj.moderation, actuallyBlocked: true },
      footer: createModerationFooter(obj.moderation, { blocked: true })
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

    const titleTarget = image.querySelector('figure, .swipe-detector');

    const pixivData = await getImagePixivData(data.id, image, data.novel);
    if (pixivData) {
      const moderation = getImageModeration(pixivData);
      const { highlightOpts, blockOpts } = moderation;
      let skipReason = [];
      if (PIXIV_BLOCKED_TAGS_VALIDATED) {
        // Always reset expanded view's blocked status first.
        delete image.dataset.pixiv_utils_expanded_view_blocked;
      }
      if (blockOpts) {
        skipReason = getImageBlockSkipReason({
          bookmarked: isImageBookmarked(element),
          highlighted: CONFIG.PIXIV_HIGHLIGHTED_BYPASS_BLOCK && highlightOpts
        });
        blocked = doBlockExpandedView(image, {
          titleTarget,
          options: blockOpts,
          pixivData,
          moderation,
          skipReason: skipReason.join(', ')
        });
      }
      if (!blocked) {
        setImageTitle(titleTarget, {
          pixivData,
          moderation,
          footer: createModerationFooter(moderation, { skipReason })
        });
      }
    }

    // Init MutationObserver for dynamic expanded view.
    if (image.__vue__) {
      const target = image.querySelector('.swipe-detector');
      if (!image.dataset.pixiv_utils_last_id) {
        initElementObserver(target, mutations => {
          const _data = findItemData(target, true);
          if (_data.id !== image.dataset.pixiv_utils_last_id) {
            options.forced = true;
            doExpandedViewControls(element, options);
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

    // A replaced or detached button is not proof this control was processed.
    if (!options.forced && hasEditBookmarkButton(element, data.id, data.novel)) return false;

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
      ensureEditBookmarkButton(element, id, isNovel, 'append');

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
  const toggleBookmarked = (section, button, imagesContainer, options = {}) => {
    if (toggling) return false;
    toggling = true;

    let mode = options.sync
      ? GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN)
      : Number(section.dataset.pixiv_utils_toggle_bookmarked_mode) + (options.rightClick ? -1 : 1);

    if (mode > _TB_MAX) mode = _TB_MIN;
    else if (mode < _TB_MIN) mode = _TB_MAX;

    setToggleBookmarkedMode(section, imagesContainer, mode);
    updateToggleBookmarkedButton(button, mode);

    // Invalid stored modes should not modify the current filter state.
    if (Number.isInteger(mode)) {
      for (const image of imagesContainer.querySelectorAll(CONFIG.SELECTORS_IMAGE)) {
        const hide = mode !== 0 &&
          (Boolean(image.dataset.pixiv_utils_blocked) ||
            (mode === 1 ? isImageBookmarked(image) : !isImageBookmarked(image)));
        if (hide) image.dataset.pixiv_utils_toggle_bookmarked_hide = true;
        else delete image.dataset.pixiv_utils_toggle_bookmarked_hide;
      }
    }

    // The most recently selected mode is still the default for new sections.
    GM_setValue('PREF_TOGGLE_BOOKMARKED_MODE', mode);
    toggling = false;
    return true;
  };

  const doToggleBookmarkedSection = (element, sectionConfig) => {
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

    // Keep the section's temporary mode when its image container is replaced.
    // New sections initialize from the last saved preference.
    const mode = element.dataset.pixiv_utils_toggle_bookmarked_mode === undefined
      ? GM_getValue('PREF_TOGGLE_BOOKMARKED_MODE', _TB_MIN)
      : Number(element.dataset.pixiv_utils_toggle_bookmarked_mode);

    // Mark as processed.
    const uuid = element.dataset.pixiv_utils_toggle_bookmarked_section || uuidv4();
    element.dataset.pixiv_utils_toggle_bookmarked_section =
      imagesContainer.dataset.pixiv_utils_toggle_bookmarked_section = uuid;
    setToggleBookmarkedMode(element, imagesContainer, mode);

    // Clear old button if it's being refreshed.
    const oldButtonContainer = element.querySelector('.pixiv_utils_toggle_bookmarked_container');
    if (oldButtonContainer) {
      oldButtonContainer.remove();
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pixiv_utils_toggle_bookmarked_container';

    const button = document.createElement('a');
    button.className = 'pixiv_utils_toggle_bookmarked';
    updateToggleBookmarkedButton(button, mode);

    if (CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP) {
      button.title = CONFIG.TEXT_TOGGLE_BOOKMARKED_TOOLTIP;
    }

    // Left click.
    button.addEventListener('click', event => {
      event.preventDefault();
      toggleBookmarked(element, button, imagesContainer, {
        sync: event.shiftKey
      });
    });

    // Right click.
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      toggleBookmarked(element, button, imagesContainer, {
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
    for (const tagElement of tags) {
      const raw = tagElement.textContent;
      // Prefer the first hashtag. Otherwise keep the last candidate.
      if (raw.startsWith('#')) {
        tag = raw.slice(1);
        break;
      }
      tag = raw;
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

  const doRecommendedUser = element => {
    const artistLink = element.querySelector('a[href*="users/"]');
    const match = artistLink?.href.match(/users\/(\d+)/);
    if (!match) return false;

    const blocked = PIXIV_BLOCKED_USERS_SET.has(match[1]);
    if (blocked) {
      element.style.setProperty('display', 'none', 'important');
      logDebug(`Recommended user removed (${match[1]})`);
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
        isOwnProfile: options.isOwnProfile,
        bookmarked: isImageBookmarked(image)
      });

      const pixivData = await getImagePixivData(data.id, image, data.novel);

      if (skipReason.length) {
        setImageTitle(image, {
          pixivData,
          moderation: getImageModeration(pixivData),
          footer: [
            createTooltipFooter(tr('tooltip.blockableBy'), tr('tooltip.utag', { tag: utag })),
            createTooltipFooter(tr('tooltip.skippedDueTo'), skipReason.join('\n'))
          ]
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
            pixivData,
            moderation: { ...getImageModeration(pixivData), actuallyBlocked: true },
            footer: [createTooltipFooter(tr('tooltip.blockedBy'), tr('tooltip.utag', { tag: utag }))]
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
    if (isElementPassedOrVisible(element)) return func(element, options);
    // If not in viewport, observe intersection.
    element.pixiv_utils_intersection_observer = { func, options };
    imagesIntersectionObserver.observe(element);
  };

  /** FLOATING UI TOOLTIPS (one delegated, reusable instance) **/

  const initFloatingTooltips = () => {
    const tooltipSelector = '[data-pixiv_utils_tooltip]';
    if (typeof FloatingUIDOM === 'undefined' || typeof FloatingUIDOM.computePosition !== 'function') {
      console.error('[Pixiv Utils]: Floating UI unavailable; falling back to native titles.');
      // No further tooltip events are registered if the @require dependency failed.
      for (const element of document.querySelectorAll(tooltipSelector)) {
        element.title = element.dataset.pixiv_utils_tooltip;
      }
      syncActiveFloatingTooltip = element => {
        if (element.dataset.pixiv_utils_tooltip) element.title = element.dataset.pixiv_utils_tooltip;
        else element.removeAttribute('title');
      };
      return;
    }

    const { computePosition, autoUpdate, offset, flip, shift, arrow } = FloatingUIDOM;
    const defaults = ENV_DEFAULTS.FLOATING_TOOLTIPS_OPTIONS;
    let options = defaults;
    try {
      validateFloatingOptions(CONFIG.FLOATING_TOOLTIPS_OPTIONS);
      options = { ...defaults, ...CONFIG.FLOATING_TOOLTIPS_OPTIONS };
    } catch (error) {
      console.warn('[Pixiv Utils]: Invalid Floating UI options; using defaults.', error);
    }

    const mouseDelay = Math.max(0, Number(CONFIG.FLOATING_TOOLTIPS_STATIONARY_DELAY) || 0);
    const showDelay = Math.max(0, Number(CONFIG.FLOATING_TOOLTIPS_SHOW_DELAY) || 0);
    const touchHoldDelay = Math.max(0, Number(CONFIG.FLOATING_TOOLTIPS_TOUCH_HOLD_DELAY) || 0);
    const mouseTolerance = Math.max(0, Number(CONFIG.FLOATING_TOOLTIPS_MOVEMENT_TOLERANCE) || 0);
    const mouseToleranceSq = mouseTolerance * mouseTolerance;
    const touchToleranceSq = Math.max(12, mouseTolerance) ** 2;

    GM_addStyle(/*css*/`
      .pixiv-utils-floating-tooltip {
        position: fixed;
        z-index: 9999;
        width: max-content;
        max-width: min(var(--pixiv-utils-floating-max-width, 350px), calc(100vw - 16px));
        padding: 5px 9px;
        border-radius: 4px;
        --pixiv-utils-tooltip-bg: rgba(58, 58, 58, 0.94);
        background: var(--pixiv-utils-tooltip-bg);
        color: #d6d6d6;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-line;
        overflow-wrap: anywhere;
        pointer-events: none;
        box-sizing: border-box;
      }
      .pixiv-utils-tooltip-title {
        display: block;
        font-weight: 700;
        color: #f4f4f4;
      }
      .pixiv-utils-tooltip-ai-row { margin-top: 3px; }
      .pixiv-utils-tooltip-ai {
        display: inline-block;
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.86em;
        background: rgba(255,255,255,0.08);
        color: #bcbcbc;
      }
      .pixiv-utils-tooltip-ai[data-state="blockable"] {
        background: rgba(255, 132, 82, 0.15);
        color: #f2b8a1;
      }
      .pixiv-utils-tooltip-ai[data-state="blocked"] {
        background: rgba(255, 97, 97, 0.27);
        color: #ffcece;
        font-weight: 600;
      }
      .pixiv-utils-tooltip-tags { margin-top: 3px; }
      .pixiv-utils-tooltip-tag-separator { color: #9ea1a7; }
      .pixiv-utils-tooltip-tag {
        border-radius: 2px;
        padding: 0 2px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      .pixiv-utils-tooltip-tag[data-match="highlighted"],
      .pixiv-utils-tooltip-tag[data-match="both"] {
        background: rgba(63, 190, 98, 0.18);
        border-bottom: 2px solid var(--pixiv-utils-tooltip-tag-color, #32cd32);
      }
      .pixiv-utils-tooltip-tag[data-match="blocked"],
      .pixiv-utils-tooltip-tag[data-match="both"] {
        color: #ffd5d5;
        background: rgba(234, 84, 84, 0.24);
      }
      .pixiv-utils-tooltip-tag[data-match="blocked"] {
        border-bottom: 2px solid #fa8080;
      }
      .pixiv-utils-tooltip-tag[data-match="both"] {
        background: linear-gradient(90deg, rgba(63,190,98,0.2), rgba(234,84,84,0.25));
      }
      .pixiv-utils-tooltip-date {
        margin-top: 3px;
        color: #aeb1b7;
        font-size: 0.91em;
      }
      .pixiv-utils-tooltip-footer {
        margin-top: 7px;
        padding-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.22);
        font-size: 0.92em;
      }
      .pixiv-utils-tooltip-footer-section + .pixiv-utils-tooltip-footer-section {
        margin-top: 5px;
      }
      .pixiv-utils-tooltip-footer-heading {
        display: block;
        font-weight: 600;
        color: #e2e2e2;
      }
      .pixiv-utils-tooltip-footer-body { display: block; }
      .pixiv-utils-floating-tooltip[data-mode="touch"] {
        pointer-events: auto;
        cursor: pointer;
        touch-action: manipulation;
      }
      .pixiv-utils-floating-tooltip[data-open] {
        animation: pixiv-utils-floating-enter 120ms ease-out both;
      }
      .pixiv-utils-floating-arrow {
        position: absolute;
        width: 12px;
        height: 12px;
        background: var(--pixiv-utils-tooltip-bg);
        pointer-events: none;
      }
      /* Render only the half facing outside the tooltip. Unlike a rotated
         square, these triangles never paint over the translucent body. */
      .pixiv-utils-floating-arrow[data-side="bottom"] {
        clip-path: polygon(50% 0, 0 50%, 100% 50%);
      }
      .pixiv-utils-floating-arrow[data-side="top"] {
        clip-path: polygon(0 50%, 100% 50%, 50% 100%);
      }
      .pixiv-utils-floating-arrow[data-side="right"] {
        clip-path: polygon(0 50%, 50% 0, 50% 100%);
      }
      .pixiv-utils-floating-arrow[data-side="left"] {
        clip-path: polygon(50% 0, 100% 50%, 50% 100%);
      }
      @keyframes pixiv-utils-floating-enter {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `);

    const tooltip = document.createElement('div');
    tooltip.id = 'pixiv-utils-floating-tooltip';
    tooltip.className = 'pixiv-utils-floating-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.display = 'none';
    tooltip.style.position = options.strategy;
    tooltip.style.setProperty('--pixiv-utils-floating-max-width', `${options.maxWidth}px`);
    const content = document.createElement('div');
    const arrowElement = document.createElement('div');
    arrowElement.className = 'pixiv-utils-floating-arrow';
    arrowElement.dataset.side = options.placement.split('-')[0];
    arrowElement.setAttribute('aria-hidden', 'true');
    tooltip.append(content, arrowElement);
    document.body.append(tooltip);

    let activeTarget = null;
    let activeMode = null;
    let pendingTarget = null;
    let pendingTimer = null;
    let hoveredMouseTarget = null;
    let mouseX = 0;
    let mouseY = 0;
    let mouseTracking = false;
    let touchGesture = null;
    let suppressedTouchClick = null;
    let lastTouchAt = -Infinity;
    let stopPositioning = null;
    let activeObserver = null;
    let previousAriaDescription = null;
    let positionSerial = 0;

    const stopMouseTracking = () => {
      if (!mouseTracking) return;
      document.body.removeEventListener('pointermove', trackMouseMovement);
      mouseTracking = false;
    };

    const clearPending = () => {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingTarget = null;
    };

    const hideTooltip = () => {
      ++positionSerial; // Discard already-running computePosition promises.
      stopPositioning?.();
      stopPositioning = null;
      activeObserver?.disconnect();
      activeObserver = null;
      if (activeTarget) {
        if (previousAriaDescription === null) activeTarget.removeAttribute('aria-describedby');
        else activeTarget.setAttribute('aria-describedby', previousAriaDescription);
      }
      previousAriaDescription = null;
      activeTarget = null;
      activeMode = null;
      tooltip.style.display = 'none';
      tooltip.removeAttribute('data-open');
      tooltip.removeAttribute('data-mode');
    };

    const cancelTooltip = () => {
      clearPending();
      stopMouseTracking();
      hoveredMouseTarget = null;
      touchGesture = null;
      suppressedTouchClick = null;
      hideTooltip();
    };

    const isEligible = target => target?.isConnected &&
      Boolean(target.dataset.pixiv_utils_tooltip) &&
      !target.hasAttribute('data-pixiv_utils_toggle_bookmarked_hide');

    // Initial touch coordinates are sometimes unavailable or reported as (0, 0).
    // In that case use the artwork element with 25px less than the user's offset.
    const validTouchPoint = (x, y) => Number.isFinite(x) && Number.isFinite(y) &&
      x >= 0 && y >= 0 && (x !== 0 || y !== 0) &&
      (window.innerWidth <= 0 || x <= window.innerWidth) &&
      (window.innerHeight <= 0 || y <= window.innerHeight);

    const pointReference = (target, x, y) => ({
      contextElement: target,
      getBoundingClientRect: () => ({
        x, y, top: y, bottom: y, left: x, right: x, width: 0, height: 0
      })
    });

    const updatePosition = (reference, target, mainAxisOffset = options.mainAxisOffset) => {
      const request = ++positionSerial;
      computePosition(reference, tooltip, {
        placement: options.placement,
        strategy: options.strategy,
        middleware: [
          offset({ mainAxis: mainAxisOffset, crossAxis: options.crossAxisOffset }),
          flip(),
          shift({ padding: options.shiftPadding }),
          arrow({ element: arrowElement })
        ]
      }).then(({ x, y, placement, middlewareData }) => {
        if (request !== positionSerial || target !== activeTarget || !isEligible(target)) return;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        // Reset previous placement's properties when Floating UI flips sides.
        arrowElement.style.top = arrowElement.style.right = '';
        arrowElement.style.bottom = arrowElement.style.left = '';
        const { x: ax, y: ay } = middlewareData.arrow || {};
        if (ax != null) arrowElement.style.left = `${ax}px`;
        if (ay != null) arrowElement.style.top = `${ay}px`;
        const side = placement.split('-')[0];
        const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side];
        // Half of the 12px arrow box sits beyond the edge, with only its
        // exterior triangle painted. Keep the box square for flip() geometry.
        arrowElement.dataset.side = side;
        arrowElement.style[opposite] = '-6px';
      }).catch(error => logDebug('Floating UI positioning error:', error));
    };

    const showTooltip = (target, mode) => {
      if (!isEligible(target)) return;
      if (activeTarget === target && activeMode === mode) return;
      hideTooltip();
      activeTarget = target;
      activeMode = mode;
      previousAriaDescription = target.getAttribute('aria-describedby');
      const describedBy = previousAriaDescription?.trim();
      if (!describedBy?.split(/\s+/).includes(tooltip.id)) {
        target.setAttribute('aria-describedby', [describedBy, tooltip.id].filter(Boolean).join(' '));
      }
      renderImageTooltip(content, target);
      tooltip.style.display = 'block';
      tooltip.setAttribute('data-open', '');
      tooltip.dataset.mode = mode;

      // Keep the mouse's initial cursor anchor and keyboard's element anchor.
      // Touch uses its original touchstart position, not the artwork bounds.
      const touch = mode === 'touch' && touchGesture?.target === target ? touchGesture : null;
      const touchPointValid = touch && validTouchPoint(touch.x, touch.y);
      const reference = mode === 'mouse'
        ? pointReference(target, mouseX, mouseY)
        : touchPointValid ? pointReference(target, touch.x, touch.y) : target;
      const mainAxisOffset = mode === 'touch' && !touchPointValid
        ? options.mainAxisOffset - 25
        : options.mainAxisOffset;
      const update = () => {
        if (!isEligible(target)) { hideTooltip(); return; }
        updatePosition(reference, target, mainAxisOffset);
      };
      stopPositioning = autoUpdate(reference, tooltip, update);
      activeObserver = new MutationObserver(() => {
        if (!isEligible(target)) { hideTooltip(); return; }
        renderImageTooltip(content, target);
        update();
      });
      activeObserver.observe(target, {
        attributes: true,
        attributeFilter: ['data-pixiv_utils_tooltip', 'data-pixiv_utils_toggle_bookmarked_hide']
      });
    };

    syncActiveFloatingTooltip = element => {
      if (element !== activeTarget) return;
      if (!isEligible(element)) { hideTooltip(); return; }
      renderImageTooltip(content, element);
      // A content change can affect size before ResizeObserver runs.
      // autoUpdate's ResizeObserver will correct positioning after layout.
    };

    const queueShow = (target, mode, delay) => {
      clearPending();
      if (!isEligible(target)) return;
      pendingTarget = target;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (pendingTarget !== target) return;
        pendingTarget = null;
        if (mode === 'mouse') {
          stopMouseTracking();
          if (hoveredMouseTarget !== target ||
            !target.contains(document.elementFromPoint(mouseX, mouseY))) return;
        } else if (mode === 'focus' && !target.contains(document.activeElement)) return;
        else if (mode === 'touch' && touchGesture?.target !== target) return;
        showTooltip(target, mode);
        if (mode === 'touch' && touchGesture?.target === target) touchGesture.opened = true;
      }, delay);
    };

    const startMouseTracking = () => {
      if (mouseTracking) return;
      document.body.addEventListener('pointermove', trackMouseMovement, { passive: true });
      mouseTracking = true;
    };

    const trackMouseMovement = event => {
      if (event.pointerType !== 'mouse' || !hoveredMouseTarget) return;
      const dx = event.clientX - mouseX;
      const dy = event.clientY - mouseY;
      if (dx * dx + dy * dy < mouseToleranceSq) return;
      mouseX = event.clientX;
      mouseY = event.clientY;
      if (activeMode === 'mouse' && activeTarget === hoveredMouseTarget) return;
      queueShow(hoveredMouseTarget, 'mouse', mouseDelay);
    };

    document.body.addEventListener('pointerover', event => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target.closest?.(tooltipSelector);
      if (!target || target === hoveredMouseTarget) return;
      // Mouse entry should not interrupt an existing keyboard-focus tooltip.
      if (target === activeTarget && activeMode === 'focus') {
        hoveredMouseTarget = target;
        return;
      }
      cancelTooltip();
      hoveredMouseTarget = target;
      mouseX = event.clientX;
      mouseY = event.clientY;
      startMouseTracking();
      queueShow(target, 'mouse', mouseDelay);
    });

    document.body.addEventListener('pointerout', event => {
      if (event.pointerType !== 'mouse' || !hoveredMouseTarget ||
        !hoveredMouseTarget.contains(event.target) ||
        hoveredMouseTarget.contains(event.relatedTarget)) return;
      clearPending();
      stopMouseTracking();
      if (activeMode === 'mouse') hideTooltip();
      hoveredMouseTarget = null;
    });

    // Touch is a deliberate long-press gesture, not a delayed tap. Keep its
    // state separate from pointer hover/focus so normal taps still navigate.
    const rememberTouchClick = (target, x, y) => {
      suppressedTouchClick = {
        target, x, y, hasPosition: validTouchPoint(x, y), until: Date.now() + 1000
      };
    };

    // Capture before Pixiv's delegated link handlers; suppress only the click
    // produced by a consumed touch gesture, never arbitrary later clicks.
    window.addEventListener('click', event => {
      const suppressed = suppressedTouchClick;
      if (!suppressed) return;
      if (Date.now() > suppressed.until) { suppressedTouchClick = null; return; }
      if (event.pointerType && event.pointerType !== 'touch') return;
      const dx = event.clientX - suppressed.x;
      const dy = event.clientY - suppressed.y;
      if ((suppressed.hasPosition && validTouchPoint(event.clientX, event.clientY) &&
        dx * dx + dy * dy > 25 ** 2) ||
        !(suppressed.target === event.target || suppressed.target.contains?.(event.target) ||
          event.target.contains?.(suppressed.target))) return;
      suppressedTouchClick = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    // The tooltip itself consumes its dismissal tap; the underlying artwork
    // never receives the event, even if the tooltip overlaps its link.
    tooltip.addEventListener('click', event => {
      if (activeMode !== 'touch') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hideTooltip();
    });
    tooltip.addEventListener('pointerdown', event => {
      if (activeMode === 'touch') event.stopPropagation();
    });
    tooltip.addEventListener('touchstart', event => {
      if (activeMode === 'touch') event.stopPropagation();
    }, { passive: true });

    document.body.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') return;
      const target = event.target.closest?.(tooltipSelector);
      if (!target || (activeTarget && activeTarget !== target)) cancelTooltip();
    });

    document.body.addEventListener('touchstart', event => {
      lastTouchAt = Date.now();
      // A new physical gesture must not inherit a previous hold's click guard.
      suppressedTouchClick = null;
      clearPending();
      touchGesture = null;
      if (event.touches.length !== 1 || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const target = event.target.closest?.(tooltipSelector);
      // A touch outside an already-open popover closes it and consumes the
      // tap. A long hold can still open a different artwork immediately.
      if (activeMode === 'touch') {
        rememberTouchClick(event.target, touch.clientX, touch.clientY);
        hideTooltip();
      } else if (activeMode) hideTooltip();
      stopMouseTracking();
      hoveredMouseTarget = null;
      if (!isEligible(target)) return;
      const hasPosition = validTouchPoint(touch.clientX, touch.clientY);
      touchGesture = {
        id: touch.identifier,
        target,
        x: touch.clientX,
        y: touch.clientY,
        moveX: hasPosition ? touch.clientX : null,
        moveY: hasPosition ? touch.clientY : null,
        opened: false
      };
      queueShow(target, 'touch', touchHoldDelay);
    }, { passive: true });

    document.body.addEventListener('touchmove', event => {
      const gesture = touchGesture;
      if (!gesture) return;
      if (event.touches.length !== 1) {
        clearPending();
        touchGesture = null;
        return;
      }
      const touch = [...event.changedTouches].find(item => item.identifier === gesture.id);
      if (!touch) return;
      // If touchstart reported invalid coordinates, establish a movement
      // baseline from the first valid touchmove without changing the anchor.
      if (!validTouchPoint(touch.clientX, touch.clientY)) return;
      if (gesture.moveX === null) {
        gesture.moveX = touch.clientX;
        gesture.moveY = touch.clientY;
        return;
      }
      const dx = touch.clientX - gesture.moveX;
      const dy = touch.clientY - gesture.moveY;
      if (dx * dx + dy * dy >= touchToleranceSq) {
        clearPending();
        touchGesture = null;
        if (gesture.opened && activeMode === 'touch') hideTooltip();
      }
    }, { passive: true });

    const finishTouch = event => {
      const gesture = touchGesture;
      if (!gesture || ![...event.changedTouches].some(item => item.identifier === gesture.id)) return;
      if (gesture.opened || (activeTarget === gesture.target && activeMode === 'touch')) {
        rememberTouchClick(gesture.target, gesture.x, gesture.y);
      }
      clearPending();
      touchGesture = null;
      // A completed long press stays open until deliberately dismissed.
    };
    document.body.addEventListener('touchend', finishTouch);
    document.body.addEventListener('touchcancel', finishTouch);

    // Native long-press context menus do not dismiss touch tooltips.
    // touchend/touchcancel will finish the gesture but leave an opened tooltip
    // visible until the user dismisses it normally.

    // Never leave a touch popover floating over content after scrolling.
    document.addEventListener('scroll', () => {
      if (touchGesture) { clearPending(); touchGesture = null; }
      if (activeMode === 'touch') hideTooltip();
    }, true);

    document.body.addEventListener('focusin', event => {
      // Mobile browsers may focus a link after pointerdown; don't double-schedule.
      if (Date.now() - lastTouchAt < 700) return;
      const target = event.target.closest?.(tooltipSelector);
      if (!target) return;
      if (activeTarget === target) return;
      if (activeTarget) hideTooltip();
      queueShow(target, 'focus', showDelay);
    });

    document.body.addEventListener('focusout', event => {
      const target = event.target.closest?.(tooltipSelector);
      if (!target || target.contains(event.relatedTarget)) return;
      if (pendingTarget === target) clearPending();
      if (activeTarget === target && activeMode === 'focus') hideTooltip();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') cancelTooltip();
    });
    window.addEventListener('detectnavigate', cancelTooltip);
    window.addEventListener('pagehide', cancelTooltip);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelTooltip();
    });
  };

  /** SENTINEL */

  waitPageLoaded().then(() => {
    // A single reusable tooltip replaces Tippy's delegated per-element instances.
    if (CONFIG.ENABLE_FLOATING_TOOLTIPS) initFloatingTooltips();

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

    // Users
    if (PIXIV_BLOCKED_USERS_SET.size) {
      sentinel.on(CONFIG.SELECTORS_RECOMMENDED_USER_CONTAINER, element => {
        processNewElement(doRecommendedUser, element);
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
