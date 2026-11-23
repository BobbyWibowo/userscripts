/**
 * Reusable harness for `src/share-tweet-copy.user.js`.
 *
 * The userscript is an IIFE with no exports: GM APIs and the @require `sentinel`
 * global are stubbed before importing it with `vi.resetModules()`. Tests drive
 * it through the captured sentinel callbacks and the fixture DOM, and assert
 * copied text from the stubbed clipboard — never private script state.
 */
import { vi } from 'vitest';

const SCRIPT_SPECIFIER = '../../src/share-tweet-copy.user.js';

let sentinelCallbacks = [];
let clipboardWrite = null;
let consoleSpies = [];
let capturedListeners = [];

const captureListeners = () => {
  const originalWindowAdd = window.addEventListener;
  const originalDocumentAdd = document.addEventListener;
  const wrap = (target, original) => (type, listener, options) => {
    capturedListeners.push([target, type, listener, options]);
    return original.call(target, type, listener, options);
  };
  window.addEventListener = wrap(window, originalWindowAdd);
  document.addEventListener = wrap(document, originalDocumentAdd);
  return () => {
    window.addEventListener = originalWindowAdd;
    document.addEventListener = originalDocumentAdd;
  };
};

export const loadShareTweetCopy = async ({ settings = {}, failClipboard = false } = {}) => {
  const base = document.createElement('base');
  base.href = 'https://x.com/';
  document.head.appendChild(base);
  document.body.innerHTML = '<div data-navigation-stop></div>';
  sentinelCallbacks = [];
  capturedListeners = [];
  const styles = [];
  clipboardWrite = vi.fn(text => failClipboard
    ? Promise.reject(new Error('copy failed'))
    : Promise.resolve(text));

  globalThis.GM_addStyle = css => styles.push(css);
  globalThis.GM_getValue = (key, fallback) => Object.hasOwn(settings, key) ? settings[key] : fallback;
  globalThis.sentinel = {
    on: (selector, callback) => {
      sentinelCallbacks.push({ selector, callback });
    }
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true
  });
  consoleSpies = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {})
  ];

  const restoreListeners = captureListeners();
  vi.resetModules();
  try {
    await import(SCRIPT_SPECIFIER);
  } finally {
    restoreListeners();
  }

  return {
    styles,
    copiedText: () => clipboardWrite.mock.calls.at(-1)?.[0] ?? '',
    logs: () => consoleSpies[0].mock.calls,
    errors: () => consoleSpies[1].mock.calls,
    setFailClipboard: value => { failClipboard = value; },
    selectors: () => sentinelCallbacks.map(entry => entry.selector),
    fire: article => sentinelCallbacks.forEach(entry => entry.callback(article))
  };
};

export const cleanupShareTweetCopy = () => {
  for (const [target, type, listener, options] of capturedListeners) {
    target.removeEventListener(type, listener, options);
  }
  capturedListeners = [];
  for (const spy of consoleSpies) spy.mockRestore();
  consoleSpies = [];
  document.body.innerHTML = '';
  document.querySelectorAll('base').forEach(element => element.remove());
  Object.defineProperty(window, 'scrollX', { value: 0, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  delete globalThis.GM_addStyle;
  delete globalThis.GM_getValue;
  delete globalThis.sentinel;
};

/**
 * Compact fixture mirroring the two X layouts observed in the sample captures:
 * timeline (`@container/post-actions` row) and status page (`flex-col` variant).
 * The tweet text is a direct child of the `base-ui-*` name column so the
 * script's `:nth-child(1 of div.text-primary)` selector matches, and the copy
 * button lands in the trailing actions container next to the timestamp link.
 */
export const buildTweet = ({
  textHtml = 'Hello',
  statusHref = '/testuser/status/1234567890',
  media = false,
  embeddedMedia = false,
  layout = 'timeline'
} = {}) => {
  const article = document.createElement('article');
  article.className = 'flex flex-col gap-1';
  const containerClass = layout === 'status'
    ? '@container/post-actions flex flex-col gap-2'
    : '@container/post-actions flex items-start justify-between gap-2';
  const actionsClass = layout === 'status'
    ? '-me-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap'
    : '-me-[5px] flex shrink-0 items-center gap-1 whitespace-nowrap';
  const statusPath = statusHref || '/testuser/status/1234567890';
  const mediaMarkup = media === 'video' && !embeddedMedia
    ? '<div class="flex flex-col gap-3 empty:hidden"><div class="relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-normal rounded-md"><div class="w-full" data-press-control="" style="aspect-ratio: 0.75 / 1;"><div class="relative isolate z-0 flex aspect-video h-full w-full overflow-hidden bg-black tabular-nums"><video height="100%" width="100%" poster="https://pbs.twimg.com/media/EXAMPLE?format=webp&amp;name=medium" playsinline="" class="h-full w-full object-cover"></video></div></div></div></div>'
    : media || embeddedMedia
      ? `<div class="flex flex-col gap-3 empty:hidden"><div class="relative overflow-hidden rounded-md"><a class="x-link block h-full w-full cursor-zoom-in" aria-label="Image" data-engagement-action="media" href="${statusPath}/photo/1"><img alt="" class="w-full"></a></div></div>`
      : '';
  article.innerHTML = `
    ${statusHref ? `<a aria-hidden="true" class="absolute inset-0 pointer-events-none" href="${statusHref}" tabindex="-1"></a>` : ''}
    <div class="flex gap-2">
      <div class="relative flex w-10 shrink-0 flex-col items-center self-stretch">
        <div data-post-avatar="true" class="relative z-10">
          <a class="x-link max-w-full rounded-none" id="base-ui-avatar" href="/testuser">
            <div class="x-avatar rounded-full size-10"><img alt="@testuser" class="size-full object-cover"></div>
          </a>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="${containerClass}">
          <div class="flex flex-col items-start min-w-0" id="base-ui-name">
            <span class="max-w-full min-w-0 flex shrink-0 items-center gap-1">
              <a class="x-link max-w-full" href="/testuser"><div class="max-w-full text-body font-bold text-primary block truncate min-w-0" dir="auto">Test User</div></a>
            </span>
            <span class="flex max-w-full min-w-0 items-center gap-1 text-body text-secondary">
              <a class="x-link max-w-full" href="/testuser">@testuser</a>
            </span>
            <div class="max-w-full text-body font-normal text-primary whitespace-pre-wrap wrap-anywhere" dir="auto"><span class="max-w-full text-[length:inherit] font-[weight:inherit] text-[color:inherit]">${textHtml}</span></div>
          </div>
          <div class="${actionsClass}">
            ${statusHref ? `<span class="inline-flex w-fit shrink-0 whitespace-nowrap"><a class="x-link text-body text-secondary" href="${statusHref}">Nov 22</a></span>` : ''}
          </div>
        </div>
      </div>
    </div>
    ${mediaMarkup}
    ${embeddedMedia ? `<div data-slot="embedded-tweet-frame"><article>${mediaMarkup}</article></div>` : ''}
  `;
  document.querySelector('[data-navigation-stop]').appendChild(article);
  return article;
};

export const clickCopy = async button => {
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
};

export const stubTooltipRects = (tooltips, widthOf = () => 180) => {
  for (const tooltip of tooltips) {
    tooltip.getBoundingClientRect = () => {
      const width = widthOf(tooltip);
      return { top: 0, bottom: 20, left: 0, right: width, width, height: 20 };
    };
  }
};

export const stubButtonRect = (button, { top = 200, left = 400 } = {}) => {
  button.getBoundingClientRect = () => ({ top, bottom: top + 24, left, right: left + 24, width: 24, height: 24 });
};
