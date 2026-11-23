// ==UserScript==
// @name               Share Tweet Copy
// @name:zh-CN         推文复制分享
// @namespace          https://github.com/BobbyWibowo
// @version            0.4.8
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
   * Version x.x.x (2026-11-23) - changes in this fork:
   *  - Migrate tweet DOM handling to X's new @container/post-actions layout (timeline and status-page variants); replace the MutationObserver with a pinned remote Sentinel.js dependency.
   *  - Harden extraction: canonical status links (?s=20, /photo/1, /history), null-safe username and link handling, anchor-text fallback when a shortened link has no title, and DOM-based <br> to newline conversion.
   *  - Rebuild tooltips as body-level portaled components: fixed positioning with viewport clamping, arrow removed, persistent copied/failure tooltip alongside transient hover tooltips, instant result states, opacity-only hover fade, and scroll/resize repositioning.
   *  - Detect dark mode via the data-theme attribute.
   *
   * Version 0.1 (2023-12-13) until 0.4.8 (2026-10-03).
   *  - https://github.com/GinWU05/tampermonkey-user.js/blob/8c688fe724b159042051356b80182f8b1813ceae/share-tweet-copy/script.user.js#L24-L128
   *
   */

  /**
   * Defines the styles for the copy button and its portaled tooltips.
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
  }

  html[data-theme="dark"] .copy-tweet-button {
    --button-bg: #353434;
    --button-hover-bg: #464646;
    --button-text-color: #ccc;
    --button-outline-color: #999;
    --button-hover-text-color: #8bb9fe;
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

  .copy-tweet-tooltip {
    --tooltip-bg: #1d2129;
    --tooltip-border-radius: 4px;
    --tooltip-font-family: JetBrains Mono, Consolas, Menlo, Roboto Mono, monospace;
    --tooltip-font-size: 12px;
    --tooltip-text-color: #fff;
    --tooltip-padding-x: 7px;
    --tooltip-padding-y: 7px;
    --tooltip-offset: 8px;
    --tooltip-transition-duration: 0.3s;
    position: fixed;
    z-index: 50;
    opacity: 0;
    visibility: hidden;
    white-space: nowrap;
    font: var(--tooltip-font-size) var(--tooltip-font-family);
    color: var(--tooltip-text-color);
    background: var(--tooltip-bg);
    padding: var(--tooltip-padding-y) var(--tooltip-padding-x);
    border-radius: var(--tooltip-border-radius);
    pointer-events: none;
    transition: opacity var(--tooltip-transition-duration) ease;
  }

  html[data-theme="dark"] .copy-tweet-tooltip {
    --tooltip-bg: #f4f3f3;
    --tooltip-text-color: #111;
  }

  .copy-tweet-tooltip.is-visible {
    opacity: 1;
    visibility: visible;
  }

  .copy-tweet-tooltip.is-end,
  .copy-tweet-tooltip.is-failed {
    transition: none;
  }

  .copy-tweet-tooltip::before {
    content: attr(data-text-initial);
  }

  .copy-tweet-tooltip.is-end::before {
    content: attr(data-text-end);
  }

  .copy-tweet-tooltip.is-failed::before {
    content: attr(data-text-failed);
  }

  .copy-tweet-button svg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .checkmark,
  .failedmark {
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
   */
  const ENV = {
    MODE: GM_getValue('ENV_MODE', 'PROD'),
    USER_TEMPLATE: GM_getValue('ENV_USER_TEMPLATE')
  };

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
  const UserTemplate = ENV.USER_TEMPLATE || [
    '{{username}} ({{userId}})',
    '',
    '{{tweetText}}',
    '',
    '{{mediaCount}}',
    '',
    '{{link}}'
  ].join('\n');

  const createTooltip = () => {
    const element = document.createElement('div');
    element.className = 'copy-tweet-tooltip';
    element.dataset.textInitial = 'Copy to clipboard';
    element.dataset.textEnd = 'Copied';
    element.dataset.textFailed = 'Copy failed, open the console for details!';
    (document.body || document.documentElement).appendChild(element);
    return element;
  };

  const hoverTooltip = createTooltip();
  const pinnedTooltip = createTooltip();
  let hoverButton = null;
  let pinnedButton = null;

  function placeTooltip (tooltip, button) {
    const failed = button.classList.contains('copy-failed');
    tooltip.classList.toggle('is-failed', failed);
    tooltip.classList.toggle('is-end', !failed && tooltip === pinnedTooltip);
    const offset = parseFloat(getComputedStyle(tooltip).getPropertyValue('--tooltip-offset')) || 8;
    const rect = button.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const below = rect.top - size.height - offset < offset;
    const centered = rect.left + rect.width / 2 - size.width / 2;
    tooltip.style.left = `${Math.max(offset, Math.min(centered, window.innerWidth - size.width - offset))}px`;
    tooltip.style.top = `${below ? rect.bottom + offset : rect.top - size.height - offset}px`;
    tooltip.classList.add('is-visible');
  }

  function showHoverTooltip (button) {
    hideHoverTooltip();
    if (button === pinnedButton) return;
    hoverButton = button;
    placeTooltip(hoverTooltip, button);
  }

  function hideHoverTooltip (button) {
    if (button && hoverButton !== button) return;
    hoverButton = null;
    hoverTooltip.classList.remove('is-visible');
  }

  function pinTooltip (button) {
    pinnedButton = button;
    placeTooltip(pinnedTooltip, button);
  }

  function unpinTooltip () {
    pinnedButton = null;
    pinnedTooltip.classList.remove('is-visible');
  }

  const repositionTooltip = () => {
    if (hoverButton) {
      if (hoverButton.isConnected) placeTooltip(hoverTooltip, hoverButton);
      else hideHoverTooltip();
    }
    if (pinnedButton) {
      if (pinnedButton.isConnected) placeTooltip(pinnedTooltip, pinnedButton);
      else unpinTooltip();
    }
  };
  window.addEventListener('scroll', repositionTooltip, true);
  window.addEventListener('resize', repositionTooltip);
  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.copy-tweet-button')) return;
    hideHoverTooltip();
    unpinTooltip();
  });

  /**
   * Adds a copy button to a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   */
  function addCopyButtonToTweet ({ tweetElement }) {
    if (tweetElement.querySelector('.copy-tweet-button')) {
      return;
    }

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-tweet-button';

    copyButton.innerHTML = /*html*/`
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

    const nameElement = tweetElement.querySelector(
      '.\\@container\\/post-actions:not(.flex-col) > div:nth-child(2), ' +
      '.\\@container\\/post-actions div[id^="base-ui-"] + div'
    );
    if (nameElement) {
      nameElement.prepend(copyButton);
    }

    copyButton.addEventListener('click', e => handleTweetCopyClick({ e, tweetElement }));
    copyButton.addEventListener('mouseenter', () => showHoverTooltip(copyButton));
    copyButton.addEventListener('mouseleave', () => hideHoverTooltip(copyButton));
    copyButton.addEventListener('focus', () => showHoverTooltip(copyButton));
    copyButton.addEventListener('blur', () => hideHoverTooltip(copyButton));
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
    pinTooltip(e.currentTarget);
    hideHoverTooltip();

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
    copyTweetButton?.classList.add('copy-failed');
    if (copyTweetButton && pinnedButton === copyTweetButton) placeTooltip(pinnedTooltip, copyTweetButton);
    console.error('Could not copy tweet: ', error);
  }

  /**
   * Finds the user name from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} User Name.
   */
  function findUserName ({ tweetElement }) {
    const username = tweetElement.querySelector('.\\@container\\/post-actions a[href^="/"]')?.firstChild;
    if (!username) {
      return '';
    }
    const clone = username.cloneNode(true);
    clone.querySelectorAll('img').forEach(img => {
      const altText = img.alt || '';
      const textNode = document.createTextNode(altText);
      img.parentNode.replaceChild(textNode, img);
    });
    return clone.textContent;
  }

  /**
   * Finds the user ID from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} User ID.
   */
  function findUserID ({ tweetElement }) {
    const links = tweetElement.querySelectorAll('.\\@container\\/post-actions a[href^="/"]');
    const userIDElement = links[1];

    return userIDElement ? userIDElement.textContent : '';
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
    const MAX_TWEET_WEIGHT = 440;
    const MAX_TWEET_LINES = 15;
    const isLight = cp => cp <= 0x10FF || (cp >= 0x2000 && cp <= 0x200D) || (cp >= 0x2010 && cp <= 0x201F) || (cp >= 0x2032 && cp <= 0x2037);
    const isWordChar = token => token?.weight === 1 && /^[\p{L}\p{N}]/u.test(token.text);

    let text = tweetText.normalize('NFC');
    let truncated = false;

    // Only non-empty lines count, so blank lines between paragraphs are kept.
    const lines = [...text.matchAll(/^.*\S/gm)];
    if (lines.length > MAX_TWEET_LINES) {
      text = text.slice(0, lines[MAX_TWEET_LINES].index);
      truncated = true;
    }

    // A URL is a single token, so a cut never lands inside it.
    const segmenter = new Intl.Segmenter();
    const tokens = text.split(/(https?:\/\/\S+)/).flatMap((part, i) => i % 2
      ? [{ text: part, weight: 23 }]
      : [...segmenter.segment(part)].map(({ segment }) => ({ text: segment, weight: isLight(segment.codePointAt(0)) ? 1 : 2 })));

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
    return truncated || folded ? text + ' ...' : text;
  }

  /**
   * Finds the tweetText from a tweet element.
   * @param {Object} param - Object containing the tweet element.
   * @param {Element} param.tweetElement - The tweet element.
   * @returns {string} TweetText
   */
  function findTweetText ({ tweetElement }) {
    const tweetTextDOM = tweetElement.querySelector(
      '.\\@container\\/post-actions:not(.flex-col) ~ div.text-primary, ' +
      '.\\@container\\/post-actions > div:first-child > :nth-child(1 of div.text-primary)'
    );
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

    // FIXME: bad design, this a build-in template, but need to number of judgments.
    // ===
    const tweetMedia = tweetElement.querySelectorAll('[data-engagement-action="media"], [data-press-control]')?.length || 0;
    const cardLink = tweetElement.querySelectorAll('div[data-testid^="card"] a[href*="https://t.co"]')?.length || 0; // FIXME findMediaCount:cardLink
    const mediaCount = tweetMedia + cardLink;
    let mediaWord = 'media';
    if (!mediaCount) {
      return '';
    }
    if (mediaCount > 1) {
      mediaWord += 's';
    }
    return `${cameraEmoji} ${mediaCount} ${mediaWord}`;
    // ===
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
      console.log('Tweet copied to clipboard:');
      console.log(text);
    }).catch(function (error) {
      handleCopyError({ tweetElement, error });
    });
  }

  sentinel.on('div[data-navigation-stop] article', element => {
    addCopyButtonToTweet({ tweetElement: element });
  });
})();
