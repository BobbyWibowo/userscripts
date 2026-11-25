// ==UserScript==
// @name               Share Tweet Copy
// @name:zh-CN         推文复制分享
// @namespace          https://github.com/BobbyWibowo
// @version            1.0.3
// @description        Copy tweets on Twitter/X in a clean, quote-ready format for easy sharing.
// @description:zh-CN  一键复制 Twitter/X 推文为整洁、可直接引用的格式，方便分享。
// @author             GinWU, Bobby Wibowo
// @license            MIT
// @homepageURL        https://github.com/BobbyWibowo/userscripts
// @homepage           https://github.com/BobbyWibowo/userscripts
// @supportURL         https://github.com/BobbyWibowo/userscripts/issues
// @icon               https://www.google.com/s2/favicons?sz=64&domain=x.com
// @run-at             document-end
// @match              https://twitter.com/*
// @match              https://x.com/*
// @grant              GM_addStyle
// @grant              GM_getValue
// @require            https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js#sha256-S8rx06n8uSoJCmTdVlxdMN8x+vDYoC+++ssWvEj4M6s=
// ==/UserScript==

/* global sentinel */

(function () {
  'use strict';

  /**
   * Change Log
   *
   * Version 1.0.3 (2026-11-25)
   *  - Keep X's layout selectors in one place, making future UI changes easier to maintain.
   *
   * Version 1.0.2 (2026-11-24)
   *  - Harden length handling: fractional limit values are rounded down, CJK text written directly after a link is counted correctly, and copying still works in browsers without Intl.Segmenter.
   *  - Use a single ellipsis character when text is cut off or folded by X.
   *
   * Version 1.0.1 (2026-11-23)
   *  - Make the tweet length and line limits configurable via ENV_MAX_TWEET_WEIGHT and ENV_MAX_TWEET_LINES; negative values disable a limit, and invalid values fall back to the defaults.
   *
   * Version 1.0.0 (2026-11-23) - changes in this fork:
   *  - Migrate tweet DOM handling to X's new @container/post-actions layout (timeline and status-page variants); replace the MutationObserver with a pinned remote Sentinel.js dependency.
   *  - Harden extraction: canonical status links (?s=20, /photo/1, /history), null-safe username and link handling, anchor-text fallback when a shortened link has no title, DOM-based <br> to newline conversion, and trailing punctuation after links counted at its own weight.
   *  - Rework the copy tooltip: remove the arrow, show it above the button (below when near the viewport top), keep it inside the viewport, and wrap long messages on narrow screens.
   *  - Count keycap emoji sequences (1️⃣, #️⃣, *️⃣) with X's weight-2 rule when measuring the 440-character budget.
   *  - Detect dark mode via the data-theme attribute.
   *
   * Version 0.1 (2023-12-13) until 0.4.8 (2026-10-03).
   *  - https://github.com/GinWU05/tampermonkey-user.js/blob/8c688fe724b159042051356b80182f8b1813ceae/share-tweet-copy/script.user.js#L24-L128
   *
   */

  /**
   * Structural selectors for X's current markup, grouped by purpose so layout
   * changes only need fixing here. They are tagged for CSS syntax highlighting
   * and written as multi-line templates, with one alternative per line; the
   * helper below flattens them into valid selector lists at startup.
   */
  const normalizeSelector = selector => selector.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();

  const SELECTORS = {
    // Tweet articles watched by Sentinel; only these receive a copy button.
    TWEET: normalizeSelector(/*css*/`
      div[data-navigation-stop] article
    `),

    // Insertion points in X's two post-actions layouts (timeline and detail).
    NAME_CONTAINER: normalizeSelector(/*css*/`
      .\\@container\\/post-actions:not(.flex-col) > div:nth-child(2),
      .\\@container\\/post-actions div[id^="base-ui-"] + div
    `),

    // First match is the display name, second match is the @handle.
    USER_LINKS: normalizeSelector(/*css*/`
      .\\@container\\/post-actions a[href^="/"]
    `),

    // Tweet body text in both post-actions layouts.
    TWEET_TEXT: normalizeSelector(/*css*/`
      .\\@container\\/post-actions:not(.flex-col) ~ div.text-primary,
      .\\@container\\/post-actions > div:first-child > :nth-child(1 of div.text-primary)
    `),

    // Photo, video and link-preview card media attached to the tweet.
    MEDIA: normalizeSelector(/*css*/`
      [data-engagement-action="media"],
      [data-press-control],
      a.group\\/article-card
    `)
  };

  /**
   * Defines the styles for the copy button and its tooltip.
   * This includes support for dark mode and styling for various states like hover and focus.
   */
  const copyBtnStyle = /*css*/`
  .copy-tweet-button {
    --button-bg: #e5e6eb;
    --button-hover-bg: #d7dbe2;
    --button-text-color: #4e5969;
    --button-hover-text-color: #164de5;
    --button-border-radius: 6px;
    --button-diameter: 24px;
    --button-outline-width: 2px;
    --button-outline-color: #9f9f9f;
    --tooltip-bg: #333333;
    --tooltip-border-radius: 4px;
    --tooltip-font-family: sans-serif;
    --tooltip-font-size: 11px;
    --tooltip-text-color: #fff;
    --tooltip-padding-inline: 8px;
    --tooltip-padding-block: 4px;
    --tooltip-line-height: 12px;
    --tooltip-offset: 12px;
    --tooltip-shift: 0px;
    --tooltip-transition-duration: 0.15s;
  }

  html[data-theme="dark"] .copy-tweet-button {
    --button-bg: #353434;
    --button-hover-bg: #464646;
    --button-text-color: #ccc;
    --button-outline-color: #999;
    --button-hover-text-color: #8bb9fe;
    --tooltip-bg: #b2b2b2;
    --tooltip-text-color: #000;
  }

  .copy-tweet-button {
    box-sizing: border-box;
    width: var(--button-diameter);
    height: var(--button-diameter);
    border-radius: var(--button-border-radius);
    background-color: var(--button-bg);
    color: var(--button-text-color);
    border: none;
    cursor: pointer;
    position: relative;
    outline: var(--button-outline-width) solid transparent;
    transition: all 0.2s ease;
    margin-right: 8px;
  }

  .copy-tweet-button .tooltip {
    box-sizing: border-box;
    position: absolute;
    bottom: calc(100% + var(--tooltip-offset));
    left: 50%;
    transform: translateX(calc(-50% + var(--tooltip-shift)));
    opacity: 0;
    visibility: hidden;
    width: max-content;
    white-space: normal;
    overflow-wrap: anywhere;
    max-width: calc(100vw - var(--tooltip-offset) - var(--tooltip-offset));
    font-family: var(--tooltip-font-family);
    font-size: var(--tooltip-font-size);
    color: var(--tooltip-text-color);
    background: var(--tooltip-bg);
    padding-inline: var(--tooltip-padding-inline);
    padding-block: var(--tooltip-padding-block);
    line-height: var(--tooltip-line-height);
    border-radius: var(--tooltip-border-radius);
    pointer-events: none;
    transition: opacity var(--tooltip-transition-duration) ease;
  }

  .copy-tweet-button .tooltip.is-below {
    bottom: auto;
    top: calc(100% + var(--tooltip-offset));
  }

  .copy-tweet-button:hover .tooltip,
  .copy-tweet-button:focus .tooltip {
    opacity: 1;
    visibility: visible;
  }

  .copy-tweet-button:focus:not(:focus-visible) .tooltip,
  .copy-tweet-button.copy-failed .tooltip {
    transition: none;
  }

  .copy-tweet-button .tooltip::before {
    content: attr(data-text-initial);
  }

  .copy-tweet-button:focus:not(:focus-visible) .tooltip::before {
    content: attr(data-text-end);
  }

  .copy-tweet-button.copy-failed:focus:not(:focus-visible) .tooltip::before {
    content: attr(data-text-failed);
  }

  .copy-tweet-button svg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .copy-tweet-button .checkmark,
  .copy-tweet-button .failedmark {
    display: none;
  }

  .copy-tweet-button:focus:not(:focus-visible) .clipboard {
    display: none;
  }

  .copy-tweet-button:focus:not(:focus-visible) .checkmark {
    display: block;
  }

  .copy-tweet-button.copy-failed:focus:not(:focus-visible) .checkmark {
    display: none;
  }

  .copy-tweet-button.copy-failed:focus:not(:focus-visible) .failedmark {
    display: block;
  }

  .copy-tweet-button:hover,
  .copy-tweet-button:focus {
    background-color: var(--button-hover-bg);
  }

  .copy-tweet-button:active {
    outline: var(--button-outline-width) solid var(--button-outline-color);
  }

  .copy-tweet-button:hover svg {
    color: var(--button-hover-text-color);
  }
  `;

  /**
   * Adds styles using the DOM method.
   * @param {string} cssText - The CSS style text to be added.
   */
  function addStyleWithDOM (cssText) {
    const styleNode = document.createElement('style');
    styleNode.appendChild(document.createTextNode(cssText));
    (document.querySelector('head') || document.documentElement).appendChild(styleNode);
  }

  /**
   * Adds styles using GM_addStyle and returns whether it was successful.
   * @param {string} cssText - The CSS style text to be added.
   * @returns {boolean} Whether the style was successfully added.
   */
  function addStyleWithGM (cssText) {
    const isGMAddStyleAvailable = typeof GM_addStyle !== 'undefined';
    if (isGMAddStyleAvailable) {
      GM_addStyle(cssText);
    }
    return isGMAddStyleAvailable;
  }

  // Execute style addition and check if it was successful
  const resultsOfEnforcement = addStyleWithGM(copyBtnStyle);

  // If unsuccessful, fallback to adding styles using the DOM method
  if (!resultsOfEnforcement) {
    addStyleWithDOM(copyBtnStyle);
  }

  /**
   * environment variable
   * @type {Object}
   * @property {string} MODE 'DEV' || 'PROD'
   * @property {string} USER_TEMPLATE
   * @property {number|string} MAX_TWEET_WEIGHT
   * @property {number|string} MAX_TWEET_LINES
   */
  const ENV = {
    MODE: GM_getValue('ENV_MODE', 'PROD'),
    USER_TEMPLATE: GM_getValue('ENV_USER_TEMPLATE'),
    MAX_TWEET_WEIGHT: GM_getValue('ENV_MAX_TWEET_WEIGHT'),
    MAX_TWEET_LINES: GM_getValue('ENV_MAX_TWEET_LINES')
  };

  function parseLimit (value, fallback) {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() ? Number(value.trim()) : NaN;
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < 0) return Infinity;
    const limit = Math.floor(parsed);
    return limit > 0 ? limit : fallback;
  }

  const MAX_TWEET_WEIGHT = parseLimit(ENV.MAX_TWEET_WEIGHT, 440);
  const MAX_TWEET_LINES = parseLimit(ENV.MAX_TWEET_LINES, 15);
  const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter()
    : null;

  if (ENV.MODE !== 'PROD') {
    console.log(`share-tweet-copy: ${ENV.MODE}`);
  }

  /**
   * Contains functions to extract various pieces of data from a tweet element.
   */
  const tweetDataExtractors = {
    username: ({ tweetElement }) => findUserName({ tweetElement }),
    userId: ({ tweetElement }) => findUserID({ tweetElement }),
    tweetText: ({ tweetElement }) => findTweetText({ tweetElement }),
    mediaCount: ({ tweetElement }) => findMediaCount({ tweetElement }),
    link: ({ tweetElement }) => findLink({ tweetElement })
  };

  /**
   * User-defined template for formatting tweet data.
   */
  const defaultTemplate = [
    '{{username}} ({{userId}})',
    '',
    '{{tweetText}}',
    '',
    '{{mediaCount}}',
    '',
    '{{link}}'
  ].join('\n');
  const UserTemplate = typeof ENV.USER_TEMPLATE === 'string' && ENV.USER_TEMPLATE
    ? ENV.USER_TEMPLATE
    : defaultTemplate;

  function positionTooltip (button) {
    const tooltip = button.querySelector('.tooltip');
    if (!tooltip) return;
    const edgeGap = parseFloat(getComputedStyle(button).getPropertyValue('--tooltip-offset')) || 8;
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const placeBelow = buttonRect.top - tooltipRect.height - edgeGap < edgeGap;
    tooltip.classList.toggle('is-below', placeBelow);
    const desiredLeft = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
    const shift = Math.max(edgeGap, Math.min(desiredLeft, window.innerWidth - tooltipRect.width - edgeGap)) - desiredLeft;
    tooltip.style.setProperty('--tooltip-shift', `${shift}px`);
  }

  /**
   * Adds a copy button to a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   */
  function addCopyButtonToTweet ({ tweetElement }) {
    if (tweetElement.querySelector('.copy-tweet-button')) {
      return;
    }

    const nameElement = tweetElement.querySelector(SELECTORS.NAME_CONTAINER);
    if (!nameElement) {
      return;
    }

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-tweet-button';

    copyButton.innerHTML = /*html*/`
      <span class="tooltip"
        data-text-initial="Copy to clipboard"
        data-text-end="Copied"
        data-text-failed="Copy failed, open the console for details!"></span>
      <span>
        <svg xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 6.35 6.35" y="0" x="0"
          height="14" width="14" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"
          xmlns="http://www.w3.org/2000/svg" class="clipboard">
          <g>
            <path fill="currentColor"
              d="M2.43.265c-.3 0-.548.236-.573.53h-.328a.74.74 0 0 0-.735.734v3.822a.74.74 0 0 0 .735.734H4.82a.74.74 0 0 0 .735-.734V1.529a.74.74 0 0 0-.735-.735h-.328a.58.58 0 0 0-.573-.53zm0 .529h1.49c.032 0 .049.017.049.049v.431c0 .032-.017.049-.049.049H2.43c-.032 0-.05-.017-.05-.049V.843c0-.032.018-.05.05-.05zm-.901.53h.328c.026.292.274.528.573.528h1.49a.58.58 0 0 0 .573-.529h.328a.2.2 0 0 1 .206.206v3.822a.2.2 0 0 1-.206.205H1.53a.2.2 0 0 1-.206-.205V1.529a.2.2 0 0 1 .206-.206z">
            </path>
          </g>
        </svg>
        <svg xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 24 24" y="0" x="0" height="14"
          width="14" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg"
          class="checkmark">
          <g>
            <path data-original="#000000" fill="currentColor"
              d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z">
            </path>
          </g>
        </svg>
        <svg class="failedmark" xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 512 512">
          <path fill="#FF473E"
            d="m330.443 256l136.765-136.765c14.058-14.058 14.058-36.85 0-50.908l-23.535-23.535c-14.058-14.058-36.85-14.058-50.908 0L256 181.557L119.235 44.792c-14.058-14.058-36.85-14.058-50.908 0L44.792 68.327c-14.058 14.058-14.058 36.85 0 50.908L181.557 256L44.792 392.765c-14.058 14.058-14.058 36.85 0 50.908l23.535 23.535c14.058 14.058 36.85 14.058 50.908 0L256 330.443l136.765 136.765c14.058 14.058 36.85 14.058 50.908 0l23.535-23.535c14.058-14.058 14.058-36.85 0-50.908z" />
        </svg>
      </span>
    `;

    nameElement.prepend(copyButton);

    copyButton.addEventListener('click', e => handleTweetCopyClick({ e, tweetElement }));
    copyButton.addEventListener('mouseenter', () => positionTooltip(copyButton));
    copyButton.addEventListener('focus', () => positionTooltip(copyButton));
  }

  /**
   * Handles the copy button click event.
   * @param {Object} param - Object containing the event and tweet element.
   * @param {Event} param.e - The click event.
   * @param {Element} param.tweetElement - The tweet element.
   */
  function handleTweetCopyClick ({ e, tweetElement }) {
    e.stopPropagation();
    e.currentTarget.classList.remove('copy-failed');
    positionTooltip(e.currentTarget);

    try {
      const text = formatTweet({ tweetElement });
      copyTextToClipboard({ tweetElement, text });
    } catch (error) {
      handleCopyError({ tweetElement, error });
    }
  }

  /**
   * handles copy error
   * @param {Element} param.tweetElement - The tweet element.
   * @param {Error} param.error - The error object.
   */
  function handleCopyError ({ tweetElement, error = new Error() }) {
    const copyTweetButton = tweetElement.querySelector('.copy-tweet-button');
    if (copyTweetButton) {
      copyTweetButton.classList.add('copy-failed');
      positionTooltip(copyTweetButton);
    }
    console.error('Could not copy tweet: ', error);
  }

  const userDetails = new WeakMap();

  function findUserDetails (tweetElement) {
    const cached = userDetails.get(tweetElement);
    if (cached) return cached;
    const links = tweetElement.querySelectorAll(SELECTORS.USER_LINKS);
    const nameElement = links[0]?.firstChild?.cloneNode(true);
    if (nameElement?.nodeType === 1) {
      nameElement.querySelectorAll('img').forEach(img => {
        img.parentNode.replaceChild(document.createTextNode(img.alt || ''), img);
      });
    }
    const details = {
      username: nameElement?.textContent ?? '',
      userId: links[1]?.textContent ?? ''
    };
    userDetails.set(tweetElement, details);
    return details;
  }

  /**
   * Finds the user name from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} User Name.
   */
  function findUserName ({ tweetElement }) {
    return findUserDetails(tweetElement).username;
  }

  /**
   * Finds the user ID from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} User ID.
   */
  function findUserID ({ tweetElement }) {
    return findUserDetails(tweetElement).userId;
  }

  /**
   * Shortens the tweet text for sharing. The ellipsis is added only when content is missing:
   * cut off here, or folded by X behind "Show more".
   *
   * Weights follow X's counting rule (twitter-text config v3): code points in the light ranges count 1,
   * everything else (CJK, emoji, ...) counts 2, and a URL counts 23.
   * https://docs.x.com/fundamentals/counting-characters
   * https://github.com/twitter/twitter-text/blob/master/config/v3.json
   * @param {string} tweetText
   * @param {boolean} folded X shows only part of the text, with a "Show more" link.
   * @returns {string} tweetText
   */
  function handleTweetText (tweetText, folded) {
    const isLight = cp => cp <= 0x10FF || (cp >= 0x2000 && cp <= 0x200D) || (cp >= 0x2010 && cp <= 0x201F) || (cp >= 0x2032 && cp <= 0x2037);
    const isHeavyGrapheme = segment => [...segment].some(char => !isLight(char.codePointAt(0)));
    const isWordChar = token => token?.weight === 1 && /^[\p{L}\p{N}]/u.test(token.text);

    let text = tweetText.normalize('NFC');
    let truncated = false;

    // Only non-empty lines count, so blank lines between paragraphs are kept.
    const lines = [...text.matchAll(/^.*\S/gm)];
    if (lines.length > MAX_TWEET_LINES) {
      text = text.slice(0, lines[MAX_TWEET_LINES].index);
      truncated = true;
    }

    // A URL is one token, so a cut never lands inside it; trailing punctuation is counted separately.
    const trailingPunctuation = /[.,;:!?\])}>"'。！？，、；：）】》…]+$/u;
    const textTokens = value => (segmenter
      ? [...segmenter.segment(value)].map(({ segment }) => segment)
      : Array.from(value)
    ).map(segment => ({ text: segment, weight: isHeavyGrapheme(segment) ? 2 : 1 }));
    const urlPattern = /(https?:\/\/[^\s\u{1100}-\u{1FFF}\u{200E}-\u{200F}\u{2020}-\u{2031}\u{2038}-\u{10FFFF}]+)/u;
    const tokens = text.split(urlPattern).flatMap((part, i) => {
      if (i % 2 === 0) return textTokens(part);
      const punctuation = part.match(trailingPunctuation)?.[0] ?? '';
      const url = punctuation ? part.slice(0, -punctuation.length) : part;
      return [{ text: url, weight: 23 }, ...textTokens(punctuation)];
    });

    let weight = 0;
    let index = 0;
    let tailStart = 0;
    for (const [i, token] of tokens.entries()) {
      weight += token.weight;
      if (weight > MAX_TWEET_WEIGHT) {
        // Within the last third of the budget, end at a line or sentence end, or at least not inside a word.
        let end = -1;
        for (const match of text.slice(0, index + 1).matchAll(/\n|[。！？]|[.!?](?=\s)/g)) {
          if (match.index >= tailStart && match.index < index) {
            end = match.index + 1;
          }
        }
        if (end < 0 && isWordChar(tokens[i - 1]) && isWordChar(token)) {
          const space = text.lastIndexOf(' ', index - 1);
          if (space >= tailStart) {
            end = space;
          }
        }
        text = text.slice(0, end < 0 ? index : end);
        truncated = true;
        break;
      }
      index += token.text.length;
      if (weight <= MAX_TWEET_WEIGHT * 2 / 3) {
        tailStart = index;
      }
    }

    if (ENV.MODE !== 'PROD') {
      console.log({ weight, truncated, folded });
    }

    text = text.trimEnd();
    return truncated || folded ? text + '\u2026' : text;
  }

  /**
   * Finds the tweetText from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} TweetText
   */
  function findTweetText ({ tweetElement }) {
    const tweetTextDOM = tweetElement.querySelector(SELECTORS.TWEET_TEXT);
    if (!tweetTextDOM) {
      return '';
    }
    const clone = tweetTextDOM.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => {
      const beforeTranslation = br.nextElementSibling?.tagName === 'FONT';
      br.replaceWith(document.createTextNode(beforeTranslation ? '\n\n' : '\n'));
    });
    // Support copy the emoji, There are system compatibility issues that cannot be fully resolved.
    // Consider using a third-party emoji library to solve this problem.
    clone.querySelectorAll('img').forEach(img => {
      const altText = img.alt || '';
      const textNode = document.createTextNode(altText);
      img.parentNode.replaceChild(textNode, img);
    });
    // X shortens long link text
    clone.querySelectorAll('a[target="_blank"]').forEach(a => {
      const linkText = a.title || a.textContent;
      const textNode = document.createTextNode(linkText);
      a.parentNode.replaceChild(textNode, a);
    });
    const foldedElement = clone.querySelector('button[type="button"]');
    const folded = Boolean(foldedElement);
    // Remove "Show more" text in long tweet
    if (foldedElement) {
      foldedElement.remove();
    }

    return handleTweetText(clone.textContent, folded);
  }

  /**
   * Finds the media count from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} media count.
   */
  function findMediaCount ({ tweetElement }) {
    const cameraEmoji = '\u{1F4F7}';
    const mediaCount = [...tweetElement.querySelectorAll(SELECTORS.MEDIA)].filter(element => {
      const frame = element.closest('div[data-slot="embedded-tweet-frame"]');
      return !frame || !tweetElement.contains(frame);
    }).length;
    let mediaWord = 'media';
    if (!mediaCount) {
      return '';
    }
    if (mediaCount > 1) {
      mediaWord += 's';
    }
    return `${cameraEmoji} ${mediaCount} ${mediaWord}`;
  }

  /**
   * Finds the link from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} tweet link.
   */
  const findLink = ({ tweetElement }) => {
    for (const link of tweetElement.querySelectorAll('a[href*="/status/"]')) {
      const match = link.href.match(/^(.*\/status\/\d+)/);
      if (match) return match[1];
    }
    return '';
  };

  /**
   * Formats the tweet data according to the user-defined template.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} Formatted tweet data.
   */
  function formatTweet ({ tweetElement }) {
    let formatted = UserTemplate.replace(/\\{{/g, '{').replace(/\\}}/g, '}');
    formatted = formatted.replace(/{{(\w+)}}/g, (match, key) => {
      if (tweetDataExtractors[key]) {
        return tweetDataExtractors[key]({ tweetElement });
      }
      return match;
    });
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    return formatted;
  }

  /**
   * Copies text to the clipboard.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @param {string} param.text - Text to be copied.
   */
  function copyTextToClipboard ({ tweetElement, text }) {
    navigator.clipboard.writeText(text).then(function () {
      if (ENV.MODE !== 'PROD') {
        console.log('Tweet copied to clipboard:');
        console.log(text);
      }
    }).catch(function (error) {
      handleCopyError({ tweetElement, error });
    });
  }

  sentinel.on(SELECTORS.TWEET, element => {
    addCopyButtonToTweet({ tweetElement: element });
  });
})();
