// ==UserScript==
// @name         Article Copy Button
// @namespace    https://github.com/BobbyWibowo
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @version      1.2.0
// @author       Bobby Wibowo
// @license      MIT
// @run-at       document-end
// @description  09/02/2025, 16.57.34
// @require      https://cdn.jsdelivr.net/npm/sentinel-js@0.0.7/dist/sentinel.min.js
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

  const ARTICLES_CONFIG = [
    {
      whitelistedHosts: [
        'quanben-xiaoshuo.com'
      ],
      parentSelector: '.wrapper .box',
      titleSelector: '.title',
      articleSelector: '#articlebody',
      AIPromptPrefix: 'Display the translation of this web novel chapter, retaining all original text without any loss in translation, and incorporating the remembered glossary:\n\n'
    },
    {
      parentSelector: '.wp-manga-page',
      titleSelector: '.breadcrumb .active',
      articleSelector: '.reading-content div[class*="text-"]',
      AIPromptPrefix: 'Improve readability of this web novel chapter, without any loss:\n\n'
    },
    {
      parentSelector: '#chapter',
      titleSelector: '.chapter-title',
      articleSelector: '.chapter-c'
    },
    {
      whitelistedHosts: [
        'www.hoyolab.com'
      ],
      sentinel: true, // this option is ignored without whitelistedHosts for performance
      parentSelector: '.mhy-article-page',
      titleSelector: '.mhy-article-page__title h1',
      articleSelector: '.mhy-article-page__content'
    },
    {
      whitelistedHosts: [
        'www.reddit.com'
      ],
      sentinel: true,
      parentSelector: 'shreddit-post',
      titleSelector: '[id^="post-title-"]',
      articleSelector: 'div[slot="text-body"], div[slot="expando-content"]'
    },
    {
      whitelistedHosts: [
        'old.reddit.com'
      ],
      sentinel: true,
      parentSelector: 'div[id^="thing_"]',
      titleSelector: 'a.title',
      articleSelector: '.expando:not(.expando-uninitialized)'
    }
  ];

  const ENV = {
    MODE: GM_getValue('MODE', 'PROD')
  };

  let logDebug = () => {};
  if (ENV.MODE !== 'PROD') {
    log('MODE =', ENV.MODE);
    logDebug = log;
  }

  const GLOBAL_STYLE = /*css*/`
  .copy-article-button-container {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin-bottom: 16px;
  }

  .copy-article-button {
    --button-bg: #e5e6eb;
    --button-hover-bg: #d7dbe2;
    --button-text-color: #4e5969;
    --button-hover-text-color: #164de5;
    --button-border-radius: 6px;
    --button-diameter: 24px;
    --button-outline-width: 2px;
    --button-outline-color: #9f9f9f;
    --tooltip-bg: #1d2129;
    --toolptip-border-radius: 4px;
    --tooltip-font-family: JetBrains Mono, Consolas, Menlo, Roboto Mono, monospace;
    --tooltip-font-size: 12px;
    --tootip-text-color: #fff;
    --tooltip-padding-x: 7px;
    --tooltip-padding-y: 7px;
    --tooltip-offset: 8px;
    /*--tooltip-transition-duration: 0.3s;*/
  }

  html[data-darkreader-scheme="dark"] .copy-article-button,
  body[class*="text-ui-light"] .copy-article-button,
  main[class*="dark-background"] .copy-article-button {
    --button-bg: #353434;
    --button-hover-bg: #464646;
    --button-text-color: #ccc;
    --button-outline-color: #999;
    --button-hover-text-color: #8bb9fe;
    --tooltip-bg: #f4f3f3;
    --tootip-text-color: #111;
  }

  .copy-article-button {
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
  }

  .tooltip {
    position: absolute;
    opacity: 0;
    left: calc(100% + var(--tooltip-offset));
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    font: var(--tooltip-font-size) var(--tooltip-font-family);
    color: var(--tootip-text-color);
    background: var(--tooltip-bg);
    padding: var(--tooltip-padding-y) var(--tooltip-padding-x);
    border-radius: var(--toolptip-border-radius);
    pointer-events: none;
    transition: all var(--tooltip-transition-duration) cubic-bezier(0.68, -0.55, 0.265, 1.55);
    z-index: 1;
  }

  .tooltip::before {
    content: attr(data-text-initial);
  }

  .tooltip::after {
    content: "";
    width: var(--tooltip-padding-y);
    height: var(--tooltip-padding-y);
    background: inherit;
    position: absolute;
    top: 50%;
    left: calc(var(--tooltip-padding-y) / 2 * -1);
    transform: translateY(-50%) rotate(45deg);
    z-index: -999;
    pointer-events: none;
  }

  .copy-article-button svg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .checkmark,
  .failedmark {
    display: none;
  }

  .copy-article-button:hover .tooltip,
  .copy-article-button:focus:not(:focus-visible) .tooltip {
    opacity: 1;
    visibility: visible;
  }

  .copy-article-button:focus:not(:focus-visible) .tooltip::before {
    content: attr(data-text-end);
  }
  .copy-article-button.copy-failed:focus:not(:focus-visible) .tooltip::before {
    content: attr(data-text-failed);
  }

  .copy-article-button:focus:not(:focus-visible) .clipboard {
    display: none;
  }

  .copy-article-button:focus:not(:focus-visible) .checkmark {
    display: block;
  }

  .copy-article-button.copy-failed:focus:not(:focus-visible) .checkmark {
    display: none;
  }

  .copy-article-button.copy-failed:focus:not(:focus-visible) .failedmark {
    display: block;
  }

  .copy-article-button:hover,
  .copy-article-button:focus {
    background-color: var(--button-hover-bg);
  }

  .copy-article-button:active {
    outline: var(--button-outline-width) solid var(--button-outline-color);
  }

  .copy-article-button:hover svg {
    color: var(--button-hover-text-color);
  }
  `;

  let globalStyleAdded = false;

  function formatArticle ({ title, article, AIPromptPrefix = '' }) {
    const header = title ? title.innerText.trim() : null;
    const body = article.innerText.trim();

    const formatted = (header ? `${header}\n\n` : '') + body;

    return AIPromptPrefix + formatted;
  }

  function handleCopyError ({ event, title, article, error = new Error() }) {
    log('Could not copy: ', error);
    event.element.classList.add('copy-failed');
  }

  function copyTextToClipboard ({ event, title, article, text }) {
    navigator.clipboard.writeText(text).then(function () {
      log('Article copied to clipboard.\n\n' + text);
    }).catch(function (error) {
      handleCopyError({ event, title, article, error });
    });
  }

  function handleArticleCopyClick ({ event, title, article, AIPromptPrefix }) {
    event.stopPropagation();
    try {
      const text = formatArticle({ title, article, AIPromptPrefix });
      copyTextToClipboard({ event, title, article, text });
    } catch (error) {
      handleCopyError({ event, title, article, error });
    }
  }

  const BUTTON_INNER_TEMPLATE = /*html*/`
    <span data-text-initial="Copy to clipboard" data-text-end="Copied" data-text-failed="Copy failed, open the console for details!" class="tooltip"></span>
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

  const findArticles = (config, source = document.body) => {
    let parents = [];

    if (source.matches(config.parentSelector)) {
      parents = [source];
    } else {
      // Loop through query results of parents, to support multiple articles at once.
      parents = source.querySelectorAll(config.parentSelector);

      // Also try to look up.
      if (!parents.length) {
        const up = source.closest(config.parentSelector);
        if (up) {
          parents = [up];
        }
      }
    }

    if (!parents.length) {
      return null;
    }

    logDebug(`Found ${parents.length} element(s) matching parent selector: ${config.parentSelector}`);

    let _done = 0;

    for (const parent of parents) {
      const article = parent.querySelector(config.articleSelector);
      if (!article) {
        continue;
      }

      // Skip if already processed.
      if (article.querySelector('.copy-article-button-container')) {
        continue;
      }

      logDebug(`Found element matching article selector: ${config.articleSelector}`);

      const title = parent.querySelector(config.titleSelector);

      const copyButtonContainer = document.createElement('div');
      copyButtonContainer.className = 'copy-article-button-container';

      const copyButton = document.createElement('button');
      copyButton.className = 'copy-article-button';
      copyButton.innerHTML = BUTTON_INNER_TEMPLATE;
      copyButton.addEventListener('click', event => handleArticleCopyClick({ event, title, article }));
      copyButtonContainer.appendChild(copyButton);

      if (config.AIPromptPrefix) {
        const copyButtonAI = document.createElement('button');
        copyButtonAI.className = 'copy-article-button';
        copyButtonAI.innerHTML = BUTTON_INNER_TEMPLATE;
        copyButtonAI.querySelector(':first-child').dataset.textInitial += ' (with AI prompt prefix)';
        copyButtonAI.addEventListener('click', event => handleArticleCopyClick({ event, title, article, AIPromptPrefix: config.AIPromptPrefix }));
        copyButtonContainer.appendChild(copyButtonAI);
      }

      if (!globalStyleAdded) {
        GM_addStyle(GLOBAL_STYLE);
        globalStyleAdded = true;
      }

      article.insertAdjacentElement('afterbegin', copyButtonContainer);
      _done++;
    }

    return _done;
  };

  let _rootDone = 0;

  for (const config of ARTICLES_CONFIG) {
    let initSentinel = false;

    // Skip config if it's whitelisted for specific hosts yet it doesn't match current host.
    if (Array.isArray(config.whitelistedHosts)) {
      let hostPassed = false;
      for (const host of config.whitelistedHosts) {
        if (host instanceof RegExp) {
          if (host.test(window.location.hostname)) {
            hostPassed = true;
          }
        } else if (host === window.location.hostname) {
          hostPassed = true;
        }
      }

      if (!hostPassed) {
        continue;
      }

      log(`Host whitelisted for parent selector: ${config.parentSelector}`);

      if (config.sentinel) {
        initSentinel = true;
      }
    }

    if (!initSentinel && config.sentinel) {
      log('Sentinel can only be used for config with whitelisted hosts.');
    }

    if (initSentinel) {
      sentinel.on([
        config.parentSelector,
        config.articleSelector
      ], element => {
        findArticles(config, element);
      });
    } else {
      const done = findArticles(config);
      if (done !== null) {
        _rootDone += done;
      }
    }
  }

  if (_rootDone > 0) {
    log(`Added ${_rootDone} copy button(s).`);
  }
})();
