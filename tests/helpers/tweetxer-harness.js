/**
 * Reusable harness for `src/TweetXer.user.js`.
 *
 * The userscript is a single IIFE with no exports, so every entry point runs at
 * import time behind userscript-manager APIs. Tests stub those globals, import
 * the script as a module (re-evaluated per load via vi.resetModules()), and then
 * drive it through the captured menu-command callbacks, the banner DOM, and a
 * stubbed fetch. Everything is asserted black-box: DOM state and recorded
 * requests, never the script's private state.
 *
 * Usage:
 *
 *   installProfile();               // fixture first: boot() appends its prompt
 *   const tx = await loadTweetXer(); // then import so the prompt lands in it
 *   setSessionCookie();
 *   await startReady(tx);            // fires "Start TweetXer", pumps fake timers
 *
 * Timers: tests run on fake timers. The script's sleep() falls back to
 * setTimeout because jsdom has no Worker, so pump()/startReady() advance the
 * fake clock until a condition holds. FileReader completes on jsdom's own real
 * timers, which keep ticking while the fake clock is pumped.
 */
import { vi } from 'vitest';

const SCRIPT_SPECIFIER = '../../src/TweetXer.user.js';

export const BANNER_ID = 'exportUpload';
export const PROMPT_ID = 'tweetsXer_prompt';

let menuCommands = new Map();
let lastBlob = null;
let objectURLWrapped = false;
let mathRandomSpy = null;

const installManagerGlobals = (manager) => {
  globalThis.GM_info = { script: { version: '0.11.0' } };
  if (!manager) return;

  globalThis.GM_registerMenuCommand = (label, onClick) => {
    menuCommands.set(label, onClick);
    return menuCommands.size;
  };
};

// jsdom lacks Worker, URL.createObjectURL, rAF and scrollIntoView; the script
// already tolerates a missing Worker (sleep() falls back to setTimeout), the
// rest only needs to not throw while a run is being driven.
const installBrowserGlobals = () => {
  if (typeof globalThis.AbortSignal?.timeout !== 'function') {
    globalThis.AbortSignal = { timeout: () => ({ aborted: false }) };
  }
  if (!objectURLWrapped) {
    objectURLWrapped = true;
    // Node exposes a native createObjectURL; wrap (rather than replace) it so
    // the Blob the script hands over can still be inspected by tests.
    const nativeCreateObjectURL = globalThis.URL.createObjectURL?.bind(globalThis.URL);
    globalThis.URL.createObjectURL = blob => {
      lastBlob = blob;
      return nativeCreateObjectURL ? nativeCreateObjectURL(blob) : 'blob:tweetxer-mock';
    };
    globalThis.URL.revokeObjectURL = () => {};
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
  }
  if (typeof globalThis.Element.prototype.scrollIntoView !== 'function') {
    globalThis.Element.prototype.scrollIntoView = () => {};
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    globalThis.crypto = {
      getRandomValues: array => {
        for (let index = 0; index < array.length; index++) array[index] = Math.floor(Math.random() * 256);
        return array;
      }
    };
  }
  if (!mathRandomSpy) {
    // Deterministic pacing/backoff delays (mid-jitter) so fake-timer pumps
    // never race the script's randomized waits.
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  }
  // jsdom only logs "Not implemented" for scrollTo; silence it so test output
  // stays readable while smoothScrollTo/empty-check scrolling runs.
  window.scrollTo = () => {};
};

/** Import (or re-import) the userscript and return its menu-command entry points. */
export const loadTweetXer = async ({ manager = true } = {}) => {
  menuCommands = new Map();
  lastBlob = null;
  installManagerGlobals(manager);
  installBrowserGlobals();
  vi.resetModules();
  await import(SCRIPT_SPECIFIER);

  return {
    commands: () => [...menuCommands.keys()],
    start: () => menuCommands.get('Start TweetXer')(),
    stop: () => menuCommands.get('Stop TweetXer')()
  };
};

/** Own-profile fixture: header, Tweet count, edit button, and profile tabs. */
export const installProfile = ({ username = 'testuser', tweetCount = '1,234', navCount = '999', tabs = true } = {}) => {
  window.history.replaceState({}, '', `/${username}`);
  document.body.innerHTML = `
    <header data-testid="pageHeader">header</header>
    <div data-testid="primaryColumn"><div><div><div>${tweetCount ?? ''} Posts</div></div></div></div>
    <div data-testid="TopNavBar"><div><div>${navCount ?? ''} Posts</div></div></div>
    <div data-testid="editProfileButton">Edit profile</div>
    <h2>before</h2><h2 class="profileTitle">Profile</h2>
    ${tabs
? `
    <div data-testid="ScrollSnap-List">
      <a href="/${username}">Posts</a>
      <a href="/${username}/with_replies">Replies</a>
    </div>`
: ''}
  `;

  // X is an SPA: tab clicks pushState instead of navigating.
  for (const anchor of document.querySelectorAll('[data-testid="ScrollSnap-List"] a')) {
    anchor.addEventListener('click', event => {
      event.preventDefault();
      window.history.pushState({}, '', anchor.getAttribute('href'));
    });
  }
};

/**
 * Timeline fixture for slowDelete(). Tweets are processed in fixture order.
 * A shared menu/confirmation pair stands in for X's overlays; clicking a caret
 * labels the menu (own Tweets get "Delete", others' get an @-reply menu), and
 * confirming removes the article from the DOM like a successful deletion does.
 * Retweets carry both a caret (every Tweet row has one) and an unretweet button.
 */
export const installTimeline = ({ tweets = [] } = {}) => {
  let currentArticle = null;
  const section = document.createElement('section');
  section.innerHTML = tweets.map(tweet => `
    <article data-testid="tweet" data-tid="${tweet.id}">
      <div><div><div>
        ${tweet.retweet ? '<button data-testid="unretweet">Unretweet</button>' : ''}
        <button data-testid="caret">caret</button>
      </div></div></div>
    </article>`).join('');
  document.body.append(section);

  const menu = document.createElement('div');
  menu.setAttribute('role', 'menuitem');
  const confirm = document.createElement('button');
  confirm.setAttribute('data-testid', 'confirmationSheetConfirm');
  const unretweetConfirm = document.createElement('button');
  unretweetConfirm.setAttribute('data-testid', 'unretweetConfirm');
  document.body.append(menu, confirm, unretweetConfirm);

  document.body.addEventListener('click', event => {
    const article = event.target.closest('[data-testid="tweet"]');
    if (article) currentArticle = article;
    if (event.target.matches('[data-testid="caret"]') && article) {
      const tweet = tweets.find(item => String(item.id) === article.dataset.tid);
      menu.textContent = tweet?.own ? 'Delete' : 'Reply to @someone';
    }
    if (event.target.matches('[data-testid="confirmationSheetConfirm"], [data-testid="unretweetConfirm"]') && currentArticle) {
      currentArticle.remove();
    }
  });
};

/** Following-list fixture for unfollow(). Cells without an unfollow button are skipped. */
export const installFollowing = ({ accounts = [] } = {}) => {
  window.history.replaceState({}, '', '/testuser/following');

  const link = document.createElement('a');
  link.href = '/testuser/following';
  const list = document.createElement('div');
  list.innerHTML = accounts.map((account, index) => `
    <div data-testid="UserCell" data-cid="${index}">
      ${account.own ? '' : '<button data-testid="userCell-unfollow">Unfollow</button>'}
    </div>`).join('');
  const confirm = document.createElement('button');
  confirm.setAttribute('data-testid', 'confirmationSheetConfirm');
  document.body.append(link, list, confirm);

  let currentCell = null;
  document.body.addEventListener('click', event => {
    const cell = event.target.closest('[data-testid="UserCell"]');
    if (cell) currentCell = cell;
    if (event.target.matches('[data-testid="confirmationSheetConfirm"]') && currentCell) {
      currentCell.remove();
    }
  });
};

/** Data-export file content builders. */
export const ytdFile = (kind, entries) => `window.YTD.${kind}.part0 = ${JSON.stringify(entries)}`;
export const tweetHeadersEntries = ids => ids.map(id => ({ tweet: { tweet_id: id } }));
export const tweetsEntries = ids => ids.map(id => ({ tweet: { id_str: id } }));
export const likeEntries = ids => ids.map(id => ({ like: { tweetId: id } }));
export const dmHeaderEntries = convos => convos.map(id => ({ dmConversation: { conversationId: id } }));

/** Feed a data-export file through the banner's file input. */
export const attachExportFile = (content, filename = 'tweet-headers.part0.js') => {
  const input = document.getElementById('exportUpload_file');
  const file = new File([content], filename, { type: 'text/javascript' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Stubbed fetch: records every call, replays queued Responses/Errors, then 200s. */
export const mockFetch = (queue = []) => {
  const calls = [];
  const fetchMock = vi.fn(async (url, options) => {
    calls.push({ url: String(url), options });
    const next = queue.shift();
    if (next === undefined) return jsonResponse({ data: {} });
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
};

export const jsonResponse = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** Bookmarks GraphQL timeline payload: one instruction wrapping tweet entries and an optional cursor. */
export const bookmarksInstructions = (ids = [], cursor = null) => {
  const entries = ids.map(id => ({
    entryId: `tweet-${id}`,
    content: { itemContent: { tweet_results: { result: { id } } } }
  }));
  if (cursor) entries.push({ entryId: 'cursor-bottom-1', content: { value: cursor } });
  return { data: { bookmark_timeline_v2: { timeline: { instructions: [{ entries }] } } } };
};

export const setSessionCookie = (value = 'ct0-mock') => {
  document.cookie = `ct0=${value}`;
};

export const setSkipCount = value => {
  document.getElementById('skipCount').value = value;
};

export const setSkipFromOldest = checked => {
  document.getElementById('skipFromOldest').checked = checked;
};

export const infoText = () => document.getElementById('info')?.textContent ?? '';
export const promptText = () => document.getElementById(PROMPT_ID)?.textContent ?? '';
export const errorText = () => document.getElementById('tweetsXer_error')?.textContent ?? '';
export const fixedText = () => document.getElementById('exportUpload_progress_text')?.textContent ?? '';
export const downloadedBlob = () => lastBlob;

/** Advance fake timers until condition() holds (FileReader completes in real time meanwhile). */
export const pump = async (condition, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('pump timed out waiting for condition');
    await vi.advanceTimersByTimeAsync(25);
  }
};

/** Fire "Start TweetXer" and wait until the banner controls are enabled. */
export const startReady = async tx => {
  tx.start();
  await pump(() => {
    const input = document.getElementById('exportUpload_file');
    return Boolean(input) && !input.disabled;
  });
};

export const cleanupTweetXer = () => {
  document.body.innerHTML = '';
  // jsdom keeps the cookie jar across tests; expire the session cookie so
  // ct0-related tests start from a clean state.
  document.cookie = 'ct0=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  mathRandomSpy?.mockRestore();
  mathRandomSpy = null;
  vi.unstubAllGlobals();
};
