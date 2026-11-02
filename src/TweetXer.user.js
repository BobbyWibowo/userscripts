// ==UserScript==
// @name         TweetXer
// @namespace    https://github.com/BobbyWibowo
// @version      0.11.0
// @description  Delete all your Tweets for free.
// @author       Luca, dbort, pReya, Micolithe, STrRedWolf, Bobby Wibowo
// @license      NoHarm-draft
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @supportURL   https://github.com/BobbyWibowo/userscripts/issues
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const TweetsXer = {
    version: typeof GM_info !== 'undefined' ? GM_info.script.version : 'unknown',
    TweetCount: 0,
    dId: 'exportUpload',
    tIds: [],
    tId: '',
    more: '[data-testid="tweet"] [data-testid="caret"]',
    skip: 0,
    total: 0,
    dCount: 0,
    deleteURL: '/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet',
    unfavURL: '/i/api/graphql/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet',
    deleteMessageURL: '/i/api/graphql/BJ6DtxA2llfjnRoRjaiIiw/DMMessageDeleteMutation',
    deleteConvoURL: '/i/api/1.1/dm/conversation/USER_ID-CONVERSATION_ID/delete.json',
    deleteDMsOneByOne: false,
    username: '',
    action: '',
    bookmarksURL: '/i/api/graphql/L7vvM2UluPgWOW4GDvWyvw/Bookmarks?',
    bookmarks: [],
    bookmarksNext: '',
    baseUrl: 'https://x.com',
    authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    ct0: false,
    transaction_id: '',

    promptId: 'tweetsXer_prompt',
    errorId: 'tweetsXer_error',
    starting: false,
    progressListener: null,
    stopRequested: false,

    // Timer worker state (see sleep())
    timerWorker: null,
    timerWorkerFailed: false,
    timerCallbacks: new Map(),
    timerSeq: 0,

    // Incremented on every smoothScrollTo() call so a newer scroll cancels an older one
    scrollToken: 0,
    lastRequestStartedAt: 0,

    // Request pacing (avoid tripping rate limits)
    requestDelayMs: 1000,
    requestJitterMs: 300,
    retryInitialDelayMs: 2000,
    retryMaxDelayMs: 5 * 60 * 1000,
    retryJitterMs: 5000,
    requestTimeoutMs: 10000,
    rateLimitMaxWaitMs: 30 * 60 * 1000,
    maxRetriesPerItem: 3,
    maxConsecutiveFailures: 5,
    maxConsecutiveRateLimits: 10,

    // Per-item retry bookkeeping, so a failing request is never silently dropped
    requestAttempts: new Map(),
    failedIds: new Set(),

    running: false,
    runToken: 0,
    controlsReady: false,
    promptShowsError: false,

    // Runs on every page load. Nothing is started and no banner is shown; the user only gets
    // a small dismissible prompt, and the banner opens via the userscript manager's menu.
    boot () {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Start TweetXer', () => this.init());
        GM_registerMenuCommand('Stop TweetXer', () => this.stop());
        this.showPrompt('TweetXer is installed but idle. To use it, open your userscript manager\'s menu and choose "Start TweetXer". Not using it? You can disable the script.');
      } else {
        this.showPrompt('TweetXer needs a userscript manager that supports menu commands (for example Tampermonkey or Violentmonkey), so it can\'t be started here.');
      }
    },

    // Shows (or updates) the small info box. It doesn't remember being dismissed.
    showPrompt (text) {
      this.promptShowsError = false;
      let box = document.getElementById(this.promptId);
      if (!box) {
        box = document.createElement('div');
        box.id = this.promptId;
        box.setAttribute('role', 'status');
        box.setAttribute('aria-live', 'polite');
        box.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;max-width:320px;padding:12px 34px 12px 14px;background:#87CEFA;color:black;border-radius:12px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);';

        const message = document.createElement('div');
        message.id = `${this.promptId}_text`;

        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '\u00d7';
        close.title = 'Dismiss';
        close.setAttribute('aria-label', 'Dismiss');
        close.style.cssText = 'position:absolute;top:4px;right:8px;border:0;background:transparent;color:black;font-size:20px;line-height:1;cursor:pointer;';
        close.addEventListener('click', () => this.hidePrompt());

        box.append(message, close);
        document.body.appendChild(box);
      }
      document.getElementById(`${this.promptId}_text`).textContent = text;
    },

    hidePrompt () {
      const box = document.getElementById(this.promptId);
      if (box) box.remove();
    },

    // Clears everything that is specific to one run, so "Stop" followed by
    // "Start" can never inherit counters, queues, or retry state.
    resetState () {
      this.tIds = [];
      this.tId = '';
      this.dCount = 0;
      this.total = 0;
      this.skip = 0;
      this.action = '';
      this.lastRequestStartedAt = 0;
      this.scrollToken = 0;
      this.bookmarks = [];
      this.bookmarksNext = '';
      this.requestAttempts = new Map();
      this.failedIds = new Set();
      this.running = false;
      this.controlsReady = false;
      this.stopRequested = false;
    },

    // Opens the banner. Triggered by the userscript manager's "Start TweetXer" menu command.
    async init () {
      if (this.starting || document.getElementById(this.dId)) return; // already starting or open
      this.starting = true;
      try {
        this.baseUrl = `https://${window.location.hostname}`;
        this.showPrompt('Starting TweetXer...');

        // Only continue on your own profile. A cold profile load can take a few
        // seconds, so give the header a couple of chances before giving up.
        await waitForElemToExist('header').catch(() => null);
        let ownProfile = null;
        for (let attempt = 0; attempt < 2 && !ownProfile; attempt++) {
          if (attempt > 0) this.showPrompt('Still waiting for your profile to load...');
          ownProfile = await waitForElemToExist('[data-testid="editProfileButton"]', attempt === 0 ? 3000 : 5000).catch(() => null);
        }
        if (!ownProfile) {
          this.showPrompt('TweetXer can only start on your own profile page. Open your profile, then choose "Start TweetXer" in your userscript manager again.');
          return;
        }
        this.hidePrompt();

        // Needed by every action, so set them before the banner becomes usable
        this.ct0 = this.getCookie('ct0');
        if (!this.ct0) {
          this.showPrompt('TweetXer could not read your session cookie (ct0), so every request would fail. Reload x.com, make sure cookies are allowed, and try again.');
          return;
        }
        this.username = window.location.pathname.split('/')[1];
        this.resetState();
        this.createUploadForm();
        await this.getTweetCount();
      } finally {
        this.starting = false;
      }
    },

    // Browsers throttle main-thread timers in background tabs (to ~1/sec, and to ~1/min
    // after a few minutes hidden). Timers inside a dedicated Worker are generally exempt,
    // so sleep() is routed through a tiny Blob worker. If the worker can't be created
    // (e.g. blocked by the page's CSP), it falls back to plain setTimeout.
    initTimerWorker () {
      if (this.timerWorker || this.timerWorkerFailed) return;
      try {
        const src = 'self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)}';
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const worker = new Worker(url);
        worker.onmessage = (e) => {
          const entry = this.timerCallbacks.get(e.data);
          if (entry) entry.finish();
        };
        worker.onerror = () => this.failTimerWorker();
        this.timerWorker = worker;

        // Re-arm timers that became overdue while the tab was hidden (main-thread
        // timers are throttled in background tabs).
        if (!this._visibilityHandlerAdded) {
          this._visibilityHandlerAdded = true;
          document.addEventListener('visibilitychange', () => this.resolveOverdueTimers());
        }
      } catch (_) {
        this.timerWorkerFailed = true;
      }
    },

    resolveOverdueTimers () {
      const now = Date.now();
      for (const [, entry] of this.timerCallbacks) {
        if (now - entry.start >= entry.ms) {
          entry.finish();
        }
      }
    },

    failTimerWorker () {
      this.timerWorkerFailed = true;
      if (this.timerWorker) this.timerWorker.terminate();
      this.timerWorker = null;
      // re-arm anything that was waiting on the worker with regular timers
      const pending = Array.from(this.timerCallbacks.values());
      this.timerCallbacks.clear();
      pending.forEach((entry) => {
        setTimeout(entry.finish, Math.max(0, entry.ms - (Date.now() - entry.start)));
      });
    },

    sleep (ms) {
      this.initTimerWorker();
      if (!this.timerWorker) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      return new Promise((resolve) => {
        const id = ++this.timerSeq;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          this.timerCallbacks.delete(id);
          resolve();
        };
        this.timerCallbacks.set(id, { finish, ms, start: Date.now() });
        this.timerWorker.postMessage({ id, ms });
        // safety net in case the worker never answers; it can only fire late, never early
        setTimeout(finish, ms + 5000);
      });
    },

    waitUntilVisible () {
      if (!document.hidden || this.stopRequested) return Promise.resolve();
      return new Promise((resolve) => {
        const onChange = () => {
          if (!document.hidden || this.stopRequested) {
            document.removeEventListener('visibilitychange', onChange);
            resolve();
          }
        };
        document.addEventListener('visibilitychange', onChange);
      });
    },

    smoothScrollTo (targetY, duration = 600) {
      const token = ++this.scrollToken;
      return new Promise((resolve) => {
        // requestAnimationFrame doesn't run in hidden tabs, so just jump there
        if (document.hidden) {
          window.scrollTo(0, targetY);
          return resolve();
        }

        const startY = window.scrollY;
        const delta = targetY - startY;
        if (Math.abs(delta) < 2) return resolve();
        const start = performance.now();
        // ease-in-out cubic
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

        const step = (now) => {
          // a newer scroll (or a hidden tab) has taken over, so stop this animation
          if (token !== this.scrollToken || document.hidden) return resolve();
          const t = Math.min((now - start) / duration, 1);
          window.scrollTo(0, startY + delta * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },

    // Best-effort: close any menu or dialog left open after a failed step
    dismissOverlays () {
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true
      }));
    },

    // Opens the Posts tab (wantReplies = false) or the Replies tab (wantReplies = true)
    // of the profile if it isn't already open. Returns false if the tab can't be found.
    async selectProfileTab (wantReplies) {
      const currentTab = () => window.location.pathname.split('/').filter(Boolean)[1];
      const wanted = wantReplies ? 'with_replies' : undefined;
      if (currentTab() === wanted) return true;

      const tabs = Array.from(document.querySelectorAll('[data-testid="ScrollSnap-List"] a'));
      const hrefOf = (a) => (a.getAttribute('href') || '').toLowerCase();
      const tab = wantReplies
        ? (tabs.find((a) => hrefOf(a).endsWith('/with_replies')) || tabs[1])
        : (tabs.find((a) => hrefOf(a) === `/${this.username}`.toLowerCase()) || tabs[0]);
      if (!tab) return false;

      tab.click();
      // wait for the URL to change, then give the timeline time to load
      for (let i = 0; i < 20 && currentTab() !== wanted; i++) await this.sleep(250);
      await this.sleep(2000);
      return currentTab() === wanted;
    },

    getCookie (name) {
      const match = `; ${document.cookie}`.match(`;\\s*${name}=([^;]+)`);
      return match ? match[1] : null;
    },

    updateTransactionId () {
      // random string
      this.transaction_id = Array.from(crypto.getRandomValues(new Uint8Array(95)), (x) => {
        const i = (x / 255 * 61) | 0;
        return String.fromCharCode(i + (i > 9 ? (i > 35 ? 61 : 55) : 48));
      }).join('');
    },

    // Common headers shared by every X API request.
    baseHeaders (contentType = 'application/json') {
      // X's own client sends a fresh transaction id per request
      this.updateTransactionId();
      return {
        authorization: this.authorization,
        'content-type': contentType,
        'x-client-transaction-id': this.transaction_id,
        'x-csrf-token': this.ct0,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session'
      };
    },

    // Whether the response indicates the rate limit has been exhausted.
    isRateLimited (response) {
      const remaining = response.headers.get('x-rate-limit-remaining');
      return remaining !== null && Number(remaining) < 1;
    },

    // Block until the rate-limit reset time has passed (or the user stops the script).
    async waitRateLimit (reset) {
      let resetTime = reset ? Number(reset) : 0;
      // Support both absolute Unix timestamps and relative "Retry-After" seconds.
      if (resetTime > 0 && resetTime < 1e9) {
        resetTime = Math.floor(Date.now() / 1000) + resetTime;
      }
      if (!resetTime) {
        resetTime = Math.floor(Date.now() / 1000) + 60; // sensible default
      }
      // Never park the script longer than a plausible rate-limit window, even if
      // the header carries garbage.
      const maxResetTime = Math.floor((Date.now() + this.rateLimitMaxWaitMs) / 1000);
      const resetWithBuffer = Math.min(resetTime, maxResetTime) + 2; // small buffer
      const waitMs = (resetWithBuffer - Math.floor(Date.now() / 1000)) * 1000;
      await this.waitCountdown(waitMs, 'Ratelimited. Waiting');
    },

    // Sleep in short steps so both the countdown text and the "Stop TweetXer"
    // menu command stay responsive, even for multi-minute waits.
    async waitCountdown (ms, label) {
      const until = Date.now() + Math.max(0, ms);
      while (!this.stopRequested) {
        const remaining = until - Date.now();
        if (remaining <= 0) return;
        this.updateInfo(`${label} ${Math.ceil(remaining / 1000)}s. ${this.dCount} deleted.`);
        await this.sleep(Math.min(1000, remaining));
      }
    },

    // Space out requests to avoid tripping rate limits.
    async waitForRequestSlot () {
      if (this.lastRequestStartedAt === 0) return;
      const targetInterval = this.requestDelayMs + Math.floor(Math.random() * this.requestJitterMs);
      const elapsed = Date.now() - this.lastRequestStartedAt;
      const waitMs = Math.max(0, targetInterval - elapsed);
      if (waitMs > 0) await this.sleep(waitMs);
    },

    // Parse a Retry-After header value (seconds or HTTP date) into milliseconds.
    parseRetryAfter (value) {
      if (!value) return 0;
      const trimmed = String(value).trim();
      if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
        return Math.max(0, Number(trimmed) * 1000);
      }
      const targetTime = Date.parse(trimmed);
      return Number.isFinite(targetTime) ? Math.max(0, targetTime - Date.now()) : 0;
    },

    // Small randomized delay (used between requests in the DM and unfollow loops).
    async jitterSleep (maxMs = 200) {
      await this.sleep(Math.floor(Math.random() * maxMs));
    },

    // Exponential backoff with jitter for transient failures.
    async waitBeforeRetry (reason, retryAfterMs = 0, retryNumber = 0) {
      const exponent = Math.max(0, Math.min(retryNumber, 10));
      const exponentialDelay = Math.min(this.retryInitialDelayMs * (2 ** exponent), this.retryMaxDelayMs);
      const delayMs = Math.max(exponentialDelay, retryAfterMs) + Math.floor(Math.random() * this.retryJitterMs);
      console.warn(reason + ` Retrying in ${Math.ceil(delayMs / 1000)}s.`);
      await this.waitCountdown(delayMs, 'Waiting before retrying.');
    },

    // Re-queue an item for another attempt, or record it as given up on once its
    // per-item retry budget is exhausted. Items go to the front of the array,
    // which is popped from the end, so other items are tried first.
    retryLater (id) {
      const attempts = (this.requestAttempts.get(id) || 0) + 1;
      if (attempts <= this.maxRetriesPerItem) {
        this.requestAttempts.set(id, attempts);
        this.tIds.unshift(id);
        return attempts;
      }
      this.requestAttempts.delete(id);
      this.failedIds.add(id);
      return 0;
    },

    // Re-queue the current item and wait before the next attempt. Returns the
    // outcome string for the deletion loops ('dropped' when the budget ran out).
    async handleSendFailure (reason, retryAfterMs = 0) {
      const attempts = this.retryLater(this.tId);
      if (!attempts) {
        console.error(`${reason}: giving up on ${this.tId} for now.`);
        return 'dropped';
      }
      await this.waitBeforeRetry(`${reason}.`, retryAfterMs, attempts - 1);
      return 'retrying';
    },

    // X occasionally answers with HTTP 200 while the GraphQL payload carries errors.
    async responseHasErrors (response) {
      let text;
      try {
        text = await response.text();
      } catch (_) {
        return false;
      }
      if (!text) return false;
      try {
        const body = JSON.parse(text);
        return Array.isArray(body && body.errors) && body.errors.length > 0;
      } catch (_) {
        return false;
      }
    },

    // Shared deletion loop used by deleteTweets/deleteFavs/deleteDMs.
    async deleteLoop (url, makeBody) {
      const runToken = this.beginRun();
      if (!runToken) return;
      let consecutiveFailures = 0;
      let consecutiveRateLimits = 0;
      try {
        while (this.tIds.length > 0 && !this.stopRequested) {
          this.tId = this.tIds.pop();
          const outcome = await this.sendRequest(url, makeBody ? makeBody(this.tId) : undefined);
          if (outcome === 'deleted' || outcome === 'deleted and waiting') {
            consecutiveFailures = 0;
            consecutiveRateLimits = 0;
          } else if (outcome === 'ratelimited') {
            // Being rate limited is the expected steady state for large runs, so it
            // must not trip the failure breaker - but it must not spin forever either.
            consecutiveRateLimits++;
            if (consecutiveRateLimits >= this.maxConsecutiveRateLimits) {
              this.stopRequested = true;
              this.reportProblem(`Still rate limited after ${consecutiveRateLimits} waits. ${this.dCount} deleted, ${this.tIds.length} still queued. Reload and try again later.`);
              break;
            }
          } else {
            consecutiveFailures++;
            if (consecutiveFailures >= this.maxConsecutiveFailures) {
              this.stopRequested = true;
              this.reportProblem(`Stopping after ${consecutiveFailures} consecutive failures (last result: ${outcome}). ${this.dCount} deleted, ${this.tIds.length} still queued. Reload and try again later.`);
              break;
            }
          }
        }
      } finally {
        this.tId = '';
        this.updateProgressBar();
        this.endRun(runToken);
      }
      if (this.failedIds.size > 0) {
        console.warn(`Gave up on ${this.failedIds.size} item(s) after ${this.maxRetriesPerItem} attempts each.`);
        this.updateInfo(`${this.dCount} deleted. Gave up on ${this.failedIds.size} item(s); run it again later to retry them.`);
      }
    },

    updateTitle (text) {
      const el = document.getElementById('tweetsXer_title');
      if (el) el.textContent = text;
    },

    updateInfo (text) {
      const el = document.getElementById('info');
      if (el) el.textContent = text;
    },

    // Fire-and-forget a long-running task, but surface unexpected failures
    // instead of leaving an unhandled rejection in the console.
    watchTask (promise, label) {
      promise.catch((error) => {
        console.error(error);
        this.reportProblem(`${label} stopped unexpectedly: ${error.message}`);
      });
    },

    // Log and display a problem so the user is never left guessing. This avoids
    // alert(): a blocking modal stalls the worker-backed timers that sleep() uses,
    // and it would interrupt the deletion loops for no benefit.
    reportProblem (message) {
      console.error(message);
      this.updateInfo(message);
      this.showError(message);
    },

    // Renders the message inline in the banner (role="alert") and mirrors it to the
    // always-visible prompt box, since the banner may have scrolled out of view.
    showError (message) {
      const banner = document.getElementById(this.dId);
      if (banner) {
        let box = document.getElementById(this.errorId);
        if (!box) {
          box = document.createElement('p');
          box.id = this.errorId;
          box.setAttribute('role', 'alert');
          box.style.cssText = 'background:#ffd6d6;color:#7a0000;border-radius:8px;padding:6px 10px;margin:6px 0;font-weight:600;';
          const info = document.getElementById('info');
          if (info && info.parentNode) {
            info.parentNode.insertBefore(box, info.nextSibling);
          } else {
            banner.appendChild(box);
          }
        }
        box.textContent = message;
      }
      this.showPrompt('TweetXer: ' + message);
      this.promptShowsError = true; // showPrompt() cleared it just above
    },

    // Clears the inline error so a new run doesn't show a stale message.
    clearError () {
      const box = document.getElementById(this.errorId);
      if (box) box.remove();
      if (this.promptShowsError) {
        this.hidePrompt();
        this.promptShowsError = false;
      }
    },

    // Enables/disables a banner control if it is currently in the DOM.
    setControlEnabled (id, enabled) {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    },

    // Single source of truth for "is a run already in progress?". Disables every
    // entry point while one is active. The controls that need the Tweet count stay
    // disabled until getTweetCount() has read it.
    setRunning (running) {
      this.running = running;
      const idle = !running;
      this.setControlEnabled(`${this.dId}_file`, idle && this.controlsReady);
      this.setControlEnabled('slowDelete', idle && this.controlsReady);
      this.setControlEnabled('slowDeleteReplies', idle && this.controlsReady);
      this.setControlEnabled('exportBookmarks', idle);
      this.setControlEnabled('unfollowEveryone', idle);
    },

    // Returns a run token when the caller owns the run, or 0 when another run is
    // already active. The token makes sure a stale run that is still unwinding
    // can't clear the flag of a newer one (Stop followed by a quick Start).
    beginRun () {
      if (this.running) return 0;
      this.runToken++;
      this.setRunning(true);
      this.clearError();
      return this.runToken;
    },

    // Only the run that owns the current token may release it.
    endRun (token) {
      if (token !== undefined && token !== this.runToken) return;
      this.setRunning(false);
    },

    // The progress bar lives in its own fixed container (appended to <body>), while an empty
    // "slot" inside the banner reserves its space. At the top of the page the bar sits exactly
    // over the slot, i.e. right below the rest of the header; once the slot scrolls off the
    // top, the bar stays pinned to the top edge of the viewport.
    createProgressBar () {
      const existing = document.getElementById('progressbar');
      if (existing) {
        existing.max = this.total;
        return;
      }

      const progressbar = document.createElement('progress');
      progressbar.id = 'progressbar';
      progressbar.value = this.dCount;
      progressbar.max = this.total;
      progressbar.style.cssText = 'display:block;width:100%;height:8px;';

      const bar = document.createElement('div');
      bar.id = `${this.dId}_progress`;
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;box-sizing:border-box;padding:4px 10%;background:#87CEFA;opacity:0.95;';
      bar.appendChild(progressbar);
      document.body.appendChild(bar);

      const slot = document.createElement('div');
      slot.id = `${this.dId}_progress_slot`;
      slot.style.cssText = `padding:0;height:${bar.offsetHeight}px;`;
      document.getElementById(this.dId).appendChild(slot);

      this.progressListener = () => this.positionProgressBar();
      window.addEventListener('scroll', this.progressListener, { passive: true });
      window.addEventListener('resize', this.progressListener);
      this.positionProgressBar();
    },

    positionProgressBar () {
      const slot = document.getElementById(`${this.dId}_progress_slot`);
      const bar = document.getElementById(`${this.dId}_progress`);
      if (!slot || !bar) return;
      bar.style.top = `${Math.max(0, slot.getBoundingClientRect().top)}px`;
    },

    removeProgressBar () {
      if (this.progressListener) {
        window.removeEventListener('scroll', this.progressListener);
        window.removeEventListener('resize', this.progressListener);
        this.progressListener = null;
      }
      const bar = document.getElementById(`${this.dId}_progress`);
      if (bar) bar.remove();
      const slot = document.getElementById(`${this.dId}_progress_slot`);
      if (slot) slot.remove();
    },

    updateProgressBar () {
      const pb = document.getElementById('progressbar');
      if (pb) pb.value = this.dCount;
      this.updateInfo(`${this.dCount} deleted. ${this.tId}`);
      this.positionProgressBar(); // the banner may have changed height since the last scroll
    },

    // How many old entries the user asked to skip (0 when unset or invalid),
    // clamped to the number of entries actually being processed.
    readSkipCount () {
      const input = document.getElementById('skipCount');
      const value = input ? Math.trunc(Number(input.value)) : 0;
      if (!Number.isFinite(value) || value <= 0) return 0;
      return Math.min(value, this.total);
    },

    // Drops `skip` ids from the chosen end of tIds and syncs the progress counter.
    // Export files are newest-first and the delete loops pop() from the end, so
    // deletion always proceeds oldest-first; the checkbox only picks which end
    // (the one a previous run already worked through) is skipped. Returns true
    // when the oldest entries were skipped.
    applySkip () {
      const fromOldest = document.getElementById('skipFromOldest')?.checked !== false;
      if (fromOldest) {
        // flip to oldest-first, drop the oldest `skip` entries, flip back
        this.tIds.reverse();
        this.tIds = this.tIds.slice(this.skip);
        this.tIds.reverse();
      } else {
        // drop the newest `skip` entries (front of the file order)
        this.tIds = this.tIds.slice(this.skip);
      }
      this.dCount = this.skip;
      return fromOldest;
    },

    processFile () {
      const tn = document.getElementById(`${TweetsXer.dId}_file`);
      if (tn.files && tn.files[0]) {
        const fr = new FileReader();
        fr.onloadend = function (evt) {
          // drop the selection so the same file can be picked again if
          // processing fails (a file input doesn't fire "change" for a file
          // that is still selected)
          tn.value = '';
          try {
          // window.YTD.tweet_headers.part0
          // window.YTD.tweets.part0
          // window.YTD.like.part0
          // window.YTD.direct_message_headers.part0
            const cutpoint = evt.target.result.indexOf('= ');
            if (cutpoint === -1) {
              TweetsXer.reportProblem('File content not recognized. Please use a file from the Twitter data export.');
              return;
            }
            const filestart = evt.target.result.slice(0, cutpoint);
            const json = JSON.parse(evt.target.result.slice(cutpoint + 2));

            if (filestart.includes('.tweet_headers.')) {
              console.log('File contains Tweets.');
              TweetsXer.action = 'untweet';
              TweetsXer.tIds = json.map((x) => x.tweet.tweet_id);
            } else if (filestart.includes('.tweets.') || filestart.includes('.tweet.')) {
              console.log('File contains Tweets.');
              TweetsXer.action = 'untweet';
              TweetsXer.tIds = json.map((x) => x.tweet.id_str);
            } else if (filestart.includes('.like.')) {
              console.log('File contains Favs.');
              TweetsXer.action = 'unfav';
              TweetsXer.tIds = json.map((x) => x.like.tweetId);
            } else if (
              filestart.includes('.direct_message_headers.') ||
            filestart.includes('.direct_message_group_headers.') ||
            filestart.includes('.direct_messages.') ||
            filestart.includes('.direct_message_groups.')) {
              console.log('File contains Direct Messages.');
              TweetsXer.action = 'undm';
              if (TweetsXer.deleteDMsOneByOne) {
                TweetsXer.tIds = json.map((c) => (c.dmConversation && Array.isArray(c.dmConversation.messages) ? c.dmConversation.messages.map((m) => (m && m.messageCreate ? m.messageCreate.id : 0)) : []));
                TweetsXer.tIds = TweetsXer.tIds.flat();
                TweetsXer.tIds = TweetsXer.tIds.filter((i) => i !== 0);
              } else {
                TweetsXer.tIds = json.map((c) => c.dmConversation?.conversationId).filter(Boolean);
              }
            } else {
              TweetsXer.reportProblem('File content not recognized. Please use a file from the Twitter data export.');
              return;
            }

            if (!Array.isArray(TweetsXer.tIds) || TweetsXer.tIds.length === 0) {
              TweetsXer.reportProblem('No entries found in the selected file.');
              return;
            }

            TweetsXer.total = TweetsXer.tIds.length;
            document.getElementById(`${TweetsXer.dId}_file`)?.remove();
            TweetsXer.createProgressBar();

            if (TweetsXer.action === 'untweet') {
              const skipInput = document.getElementById('skipCount');
              // an empty field means "work it out automatically", while an explicit 0
              // disables the automatic calculation (as the hint below explains)
              if (!skipInput || skipInput.value.length < 1) {
                // skip = (tweets in export) - (tweets still on profile); 5% tolerance (total/20)
                // is subtracted so we never skip past tweets still present (which would
                // leave them undeleted). Re-deleting already-gone tweets is harmless.
                TweetsXer.skip = TweetsXer.total - Number(TweetsXer.TweetCount) - Math.floor(TweetsXer.total / 20);
                TweetsXer.skip = Math.min(TweetsXer.total, Math.max(0, TweetsXer.skip));
              } else {
                TweetsXer.skip = TweetsXer.readSkipCount();
              }
              const fromOldest = TweetsXer.applySkip();
              console.log(`Skipping ${TweetsXer.skip} ${fromOldest ? 'oldest' : 'newest'} Tweets. Use advanced options to manually set how many to skip. Enter 0 to prevent the automatic calculation.`);
              TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} Tweets`);

              TweetsXer.watchTask(TweetsXer.deleteTweets(), 'Deleting Tweets');
            } else if (TweetsXer.action === 'unfav') {
              TweetsXer.skip = TweetsXer.readSkipCount();
              const fromOldest = TweetsXer.applySkip();
              console.log(`Skipping ${TweetsXer.skip} ${fromOldest ? 'oldest' : 'newest'} Favs`);
              TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} Favs`);
              TweetsXer.watchTask(TweetsXer.deleteFavs(), 'Deleting Favs');
            } else if (TweetsXer.action === 'undm') {
              TweetsXer.skip = TweetsXer.readSkipCount();
              const fromOldest = TweetsXer.applySkip();
              console.log(`Skipping ${TweetsXer.skip} ${fromOldest ? 'oldest' : 'newest'} DMs`);
              if (TweetsXer.deleteDMsOneByOne) {
                TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} DMs`);
                TweetsXer.watchTask(TweetsXer.deleteDMs(), 'Deleting DMs');
              } else {
                TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} DM Conversations`);
                TweetsXer.watchTask(TweetsXer.deleteConvos(), 'Deleting DM Conversations');
              }
            } else {
              TweetsXer.updateTitle('TweetXer: Please try a different file');
            }
          } catch (error) {
            console.error(error);
            TweetsXer.updateTitle('TweetXer');
            TweetsXer.reportProblem('Could not process file: ' + error.message);
          }
        };
        fr.readAsText(tn.files[0]);
      }
    },

    createUploadForm () {
      const h2Class = document.querySelectorAll('h2')[1]?.getAttribute('class') || '';
      const existing = document.getElementById(this.dId);
      if (existing) existing.remove();
      const div = document.createElement('div');
      div.id = this.dId;
      // The file input and slow delete button start disabled; getTweetCount() enables them
      // once the Tweet count is known, so they can't be used with a count of 0.
      div.innerHTML = `
            <style>#${this.dId}{ z-index:99999; position: relative; width:auto; margin:0 auto; padding: 20px 10%; background:#87CEFA; opacity:0.95; } #${this.dId} > *{padding:5px;} #${this.dId} button{background-color:#eff3f4;border-radius:666px;padding:2px 10px;} #${this.dId} a {color:blue;}</style>
            <div style="color:black">
                <h2 class="${h2Class}" id="tweetsXer_title">TweetXer</h2>
                <p id="info">Please wait for your profile to load. If this message doesn't go away after some seconds, something isn't working.</p>
                <div id="start">
                    <input type="file" value="" id="${this.dId}_file" disabled />
                    <a href="#" id="toggleAdvanced">Advanced Options</a>
                    <div id="advanced" style="display:none">
                    <label><input type="checkbox" id="skipFromOldest" checked /> Skip from the oldest (uncheck to skip from the newest)</label>
                    <label for="skipCount">Enter how many entries to skip (Tweets, Favs or DMs) before selecting a file.</label>
                    <input id="skipCount" type="number" value="" />
                    <p>Supported files:
                    <ul>
                        <li>tweet-headers.js to delete Tweets (around 3.000 per hour; requests are paced to avoid tripping rate limits)</li>
                        <li>direct-message-header.js and direct-message-group-headers.js to delete DMs (around 800 per 15 minutes)</li>
                        <li>like.js to delete Favs (500 per 15 minutes; only works for the most recent few thousands)</li>
                    </ul>
                    <p><strong>Export bookmarks</strong><br>
                        Bookmarks are not included in the official data export. You can export them here.
                        <button id="exportBookmarks" type="button">Export Bookmarks</button>
                    </p>
                    <p><strong>No tweet-headers.js?</strong><br>
                        If you are unable to get your data export, you can use the following option.<br>
                        This option is much slower and less reliable. It can remove around 3.000 Tweets per hour (replies too, when enabled above).<br>
                        <label><input type="checkbox" id="slowDeleteReplies" checked /> Also delete replies</label><br>
                        <button id="slowDelete" type="button" disabled>Slow delete without file</button>
                    </p>
                    <p><strong>Unfollow everyone</strong><br>
                        It's time to let go. This will unfollow everyone you follow.<br>
                        <button id="unfollowEveryone" type="button">Unfollow everyone</button>
                    </p>
                    <p><small>${TweetsXer.version}</small></p>
                    </div>
                </div>
            </div>
                `;
      document.body.insertBefore(div, document.body.firstChild);
      document.getElementById('toggleAdvanced').addEventListener('click', () => {
        const adv = document.getElementById('advanced');
        if (adv.style.display === 'none') {
          adv.style.display = 'block';
        } else {
          adv.style.display = 'none';
        }
        TweetsXer.positionProgressBar(); // the banner height changed
      });
      // arrow wrappers keep `this` bound to TweetsXer inside the handlers
      document.getElementById(`${this.dId}_file`).addEventListener('change', () => TweetsXer.processFile(), false);
      document.getElementById('exportBookmarks').addEventListener('click', () => TweetsXer.exportBookmarks(), false);
      document.getElementById('slowDelete').addEventListener('click', () => TweetsXer.slowDelete(), false);
      document.getElementById('unfollowEveryone').addEventListener('click', () => TweetsXer.unfollow(), false);
    },

    // Owns the run guard and the button state, so a failed export can never
    // leave "Export Bookmarks" disabled forever.
    async exportBookmarks () {
      const runToken = TweetsXer.beginRun();
      if (!runToken) return;
      try {
        await this.collectBookmarks();
      } catch (error) {
        console.error(error);
        TweetsXer.reportProblem('Could not export bookmarks: ' + error.message);
      } finally {
        TweetsXer.updateTitle('TweetXer');
        TweetsXer.endRun(runToken);
      }
    },

    async collectBookmarks () {
      TweetsXer.updateTitle('TweetXer: Exporting bookmarks');
      // a re-run starts from a clean slate instead of appending to the old array
      TweetsXer.bookmarks = [];
      TweetsXer.bookmarksNext = '';
      let collected = 0;
      let consecutiveFailures = 0;
      while (!TweetsXer.stopRequested && consecutiveFailures < TweetsXer.maxConsecutiveFailures) {
        const paginating = TweetsXer.bookmarksNext.length > 0;
        // the first page is always fetched, then only while a cursor is available
        if (!paginating && collected > 0) break;
        let variables = '{"count":20,"includePromotedContent":false}';
        if (paginating) {
          variables = `{"count":20,"cursor":"${TweetsXer.bookmarksNext}","includePromotedContent":false}`;
        }
        await TweetsXer.waitForRequestSlot();
        TweetsXer.lastRequestStartedAt = Date.now();
        const response = await fetch(TweetsXer.baseUrl + TweetsXer.bookmarksURL + new URLSearchParams({
          variables,
          features: '{"graphql_timeline_v2_bookmark_timeline":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}'
        }), {
          headers: TweetsXer.baseHeaders(),
          referrer: `${TweetsXer.baseUrl}/i/bookmarks`,
          referrerPolicy: 'strict-origin-when-cross-origin',
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          signal: AbortSignal.timeout(TweetsXer.requestTimeoutMs)
        });

        if (response.status === 200) {
          consecutiveFailures = 0;
          const data = await response.json().catch(() => null);
          const instructions = data?.data?.bookmark_timeline_v2?.timeline?.instructions;
          const entries = Array.isArray(instructions)
            ? (instructions.find((instruction) => Array.isArray(instruction.entries))?.entries || [])
            : [];
          let sawCursor = false;
          entries.forEach((item) => {
            if (item.entryId?.includes('tweet')) {
              const result = item.content?.itemContent?.tweet_results?.result;
              if (result) {
                collected++;
                TweetsXer.bookmarks.push(result);
              }
            } else if (item.entryId?.includes('cursor-bottom')) {
              const cursor = item.content?.value;
              sawCursor = true;
              if (typeof cursor !== 'string' || !cursor) {
                // cursor entry without a usable value: stop paginating here
                TweetsXer.bookmarksNext = '';
              } else if (TweetsXer.bookmarksNext !== cursor) {
                TweetsXer.bookmarksNext = cursor;
              } else {
                TweetsXer.bookmarksNext = '';
              }
            }
          });
          if (entries.length === 0) {
            // an empty page would otherwise loop forever
            break;
          }
          if (!sawCursor) {
            TweetsXer.bookmarksNext = '';
          }
          TweetsXer.updateInfo(`${collected} Bookmarks collected`);
        } else if (response.status === 401 || response.status === 403) {
          TweetsXer.reportProblem(`Auth error (${response.status}) while exporting bookmarks. Check that you are still signed in.`);
          return;
        } else if (response.status === 429 || response.status === 420) {
          const retryAfter = response.headers.get('retry-after') || response.headers.get('x-rate-limit-reset');
          await TweetsXer.waitRateLimit(retryAfter);
          continue;
        } else {
          consecutiveFailures++;
          console.warn(`Bookmark export request failed with status ${response.status}.`);
          await TweetsXer.waitBeforeRetry(`Bookmark export failed (${response.status}).`, TweetsXer.parseRetryAfter(response.headers.get('retry-after')), consecutiveFailures - 1);
          continue;
        }

        if (TweetsXer.isRateLimited(response)) {
          console.log('rate limit hit');
          await TweetsXer.waitRateLimit(response.headers.get('x-rate-limit-reset'));
        }
      }
      if (TweetsXer.bookmarks.length === 0) {
        TweetsXer.reportProblem('No bookmarks could be exported.');
        return;
      }

      const download = new Blob([JSON.stringify(TweetsXer.bookmarks)], {
        type: 'text/plain'
      });
      const previousDownload = document.getElementById('bookmarksDownload');
      if (previousDownload) {
        URL.revokeObjectURL(previousDownload.href);
        previousDownload.remove();
      }
      const bookmarksDownload = document.createElement('a');
      bookmarksDownload.id = 'bookmarksDownload';
      bookmarksDownload.innerText = 'Download bookmarks';
      bookmarksDownload.href = window.URL.createObjectURL(download);
      bookmarksDownload.download = 'twitter-bookmarks.json';
      const advanced = document.getElementById('advanced');
      if (advanced) {
        advanced.appendChild(bookmarksDownload);
      } else {
        document.body.appendChild(bookmarksDownload);
      }
      TweetsXer.updateInfo(`${TweetsXer.bookmarks.length} bookmarks exported.`);
    },

    async sendRequest (
      url,
      body = JSON.stringify({
        variables: { tweet_id: TweetsXer.tId, dark_request: false },
        queryId: url.split('/')[6]
      })
    ) {
      try {
        await this.waitForRequestSlot();
        this.lastRequestStartedAt = Date.now();
        const response = await fetch(url, {
          headers: this.baseHeaders(),
          referrer: `${TweetsXer.baseUrl}/${TweetsXer.username}/with_replies`,
          referrerPolicy: 'strict-origin-when-cross-origin',
          body,
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          signal: AbortSignal.timeout(this.requestTimeoutMs)
        });

        if (response.status === 200) {
          if (await this.responseHasErrors(response)) {
            // HTTP 200 with a GraphQL error payload means nothing was deleted
            return await this.handleSendFailure('GraphQL error in response');
          }
          TweetsXer.dCount++;
          TweetsXer.requestAttempts.delete(TweetsXer.tId);
          TweetsXer.updateProgressBar();

          if (this.isRateLimited(response)) {
            console.log('rate limit hit');
            await this.waitRateLimit(response.headers.get('x-rate-limit-reset'));
            return 'deleted and waiting';
          }
          return 'deleted';
        } else if (response.status === 429) {
          TweetsXer.tIds.unshift(TweetsXer.tId);
          console.log('Received status code 429. Waiting before trying again.');
          const retryAfter = response.headers.get('retry-after') || response.headers.get('x-rate-limit-reset');
          await this.waitRateLimit(retryAfter);
          return 'ratelimited';
        } else if (response.status === 401 || response.status === 403) {
          console.error('Auth/permission error (' + response.status + '). Stopping.');
          TweetsXer.updateInfo('Auth error (' + response.status + '). Check your session.');
          TweetsXer.stopRequested = true;
          return 'auth-error';
        } else if (response.status >= 500) {
          console.error('Server error (' + response.status + ').');
          return await this.handleSendFailure(`Server error (${response.status})`, this.parseRetryAfter(response.headers.get('retry-after')));
        } else {
          console.error(`Request failed with status ${response.status}.`);
          return await this.handleSendFailure(`Request failed with status ${response.status}`);
        }
      } catch (error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          console.error('Request timeout.');
          return await this.handleSendFailure('Request timeout');
        }
        console.error(error);
        return await this.handleSendFailure(error.message || 'Request failed');
      }
    },

    async deleteTweets () {
      await this.deleteLoop(this.baseUrl + this.deleteURL);
    },

    async deleteFavs () {
      this.updateTitle('TweetXer: Deleting Favs');
      // 500 unfavs per 15 Minutes
      await this.deleteLoop(this.baseUrl + this.unfavURL);
      this.updateTitle('TweetXer');
    },

    async deleteDMs () {
      await this.deleteLoop(
        this.baseUrl + this.deleteMessageURL,
        (id) => JSON.stringify({ variables: { messageId: id }, requestId: '' })
      );
    },

    async deleteConvos () {
      let consecutiveFailures = 0;
      while (this.tIds.length > 0 && !this.stopRequested) {
        this.tId = this.tIds.pop();

        // The conversation id goes into the URL verbatim, exactly like in the
        // original script and in other DM-deletion tools. Its format differs
        // between export vintages ("<user id>-<user id>" for 1:1 conversations,
        // a single snowflake for groups/newer exports), so no format guessing
        // here: anything unusable simply fails the request and lands in failedIds.
        const url = this.baseUrl + this.deleteConvoURL.replace('USER_ID-CONVERSATION_ID', this.tId);
        await this.waitForRequestSlot();
        this.lastRequestStartedAt = Date.now();
        let response = null;
        try {
          response = await fetch(url, {
            headers: this.baseHeaders('application/x-www-form-urlencoded'),
            referrer: `${TweetsXer.baseUrl}/messages`,
            body: 'dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=false&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true',
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            signal: AbortSignal.timeout(this.requestTimeoutMs)
          });
        } catch (error) {
          console.error(error);
        }

        if (!response) {
          // A timeout or transport error must not abort the whole run
          consecutiveFailures++;
          console.error(`Deleting conversation ${TweetsXer.tId} failed before a response was received.`);
          if (consecutiveFailures >= this.maxConsecutiveFailures) {
            TweetsXer.tIds.unshift(TweetsXer.tId);
            TweetsXer.stopRequested = true;
            this.reportProblem(`Stopping after ${consecutiveFailures} consecutive failures. ${TweetsXer.dCount} conversations deleted.`);
            break;
          }
          await this.handleSendFailure('Deleting conversation request failed');
          continue;
        }

        if (response.status === 204 || response.status === 200) {
          consecutiveFailures = 0;
          TweetsXer.dCount++;
          TweetsXer.requestAttempts.delete(TweetsXer.tId);
          TweetsXer.updateProgressBar();

          if (this.isRateLimited(response)) {
            console.log('rate limit hit');
            await this.waitRateLimit(response.headers.get('x-rate-limit-reset'));
          }
          await TweetsXer.jitterSleep(200); // send requests slightly slower and with random intervals
        } else if (response.status === 429 || response.status === 420) {
          TweetsXer.tIds.unshift(TweetsXer.tId);
          console.log(`Received status code ${response.status}. Waiting before trying again.`);
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') || response.headers.get('x-rate-limit-reset');
            await this.waitRateLimit(retryAfter);
          } else {
            await this.waitRateLimit(60 * 5);
          }
        } else if (response.status === 401 || response.status === 403) {
          TweetsXer.tIds.unshift(TweetsXer.tId);
          TweetsXer.stopRequested = true;
          this.reportProblem(`Auth error (${response.status}) while deleting DM conversations. Check that you are still signed in.`);
        } else {
          consecutiveFailures++;
          console.error(`Deleting conversation ${TweetsXer.tId} failed with status ${response.status}.`);
          if (consecutiveFailures >= this.maxConsecutiveFailures) {
            TweetsXer.tIds.unshift(TweetsXer.tId);
            TweetsXer.stopRequested = true;
            this.reportProblem(`Stopping after ${consecutiveFailures} consecutive failures. ${TweetsXer.dCount} conversations deleted.`);
            break;
          }
          await this.handleSendFailure(`Deleting conversation failed with status ${response.status}`, this.parseRetryAfter(response.headers.get('retry-after')));
        }
      }
      this.tId = '';
      this.updateProgressBar();
      if (this.failedIds.size > 0) {
        this.updateInfo(`${this.dCount} conversations deleted. Gave up on ${this.failedIds.size} item(s); run it again later to retry them.`);
      }
    },

    async getTweetCount () {
      await TweetsXer.sleep(1000);

      function extractTweetCount (selector) {
        const element = document.querySelector(selector);
        if (!element) return null;

        // End-anchored so digits in the name or handle can't be mistaken for the
        // count. Only English-style compact suffixes (K/M/B) are understood;
        // other locales may render counts differently (e.g. "万" in Japanese),
        // in which case this returns null and the script falls back to 1,000,000.
        const text = element.textContent.trim();
        const match = text.match(/([\d.,]+)\s*([KMB]?)\s+\w+$/i) || text.match(/([\d.,]+)\s*([KMB]?)$/i);
        if (!match) return null;

        const num = parseFloat(match[1].replace(/,/g, ''));
        if (Number.isNaN(num)) return null;
        const suffix = (match[2] || '').toUpperCase();
        const multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
        return Math.round(num * multiplier);
      }

      let countSource = 'primaryColumn';
      try {
        TweetsXer.TweetCount = extractTweetCount('[data-testid="primaryColumn"]>div>div>div');

        if (!TweetsXer.TweetCount) {
          countSource = 'TopNavBar';
          TweetsXer.TweetCount = extractTweetCount('[data-testid="TopNavBar"]>div>div');
        }

        if (!TweetsXer.TweetCount) {
          countSource = 'fallback';
          console.log("Wasn't able to find Tweet count on profile. Setting it to 1 million.");
          TweetsXer.TweetCount = 1000000;
        }
      } catch (error) {
        countSource = 'fallback';
        console.log("Wasn't able to find Tweet count on profile. Setting it to 1 million.");
        TweetsXer.TweetCount = 1000000; // prevents skipping everything when the count couldn't be read
      }

      // The count is known now, so the controls that depend on it can be used
      TweetsXer.controlsReady = true;
      TweetsXer.setRunning(TweetsXer.running);

      console.log(`${TweetsXer.TweetCount} Tweets on profile (read from: ${countSource}).`);
      this.updateInfo(countSource === 'fallback'
        ? 'Your Tweet count could not be read, so automatic skipping is disabled. Select your tweet-headers.js from your Twitter Data Export to start, and use Advanced Options to set how many Tweets to skip yourself if you need it.'
        : 'Select your tweet-headers.js from your Twitter Data Export to start the deletion of all your Tweets.');
      console.log('You can close the console now to reduce the memory usage.');
      console.log('Reopen the console if there are issues to see if an error shows up.');
    },

    async slowDelete () {
      // beginRun() also disables the other entry points
      const runToken = TweetsXer.beginRun();
      if (!runToken) return;
      const deleteReplies = document.getElementById('slowDeleteReplies')?.checked ?? false;

      // Make sure the right profile tab is open: Replies if replies should be deleted too,
      // otherwise Posts. This also covers starting from another tab (Likes, Media, etc.).
      if (!(await TweetsXer.selectProfileTab(deleteReplies))) {
        TweetsXer.updateInfo('Could not find the profile tabs. Open your profile and try again.');
        TweetsXer.endRun(runToken);
        return;
      }

      document.getElementById('start')?.remove();
      TweetsXer.total = TweetsXer.TweetCount;
      TweetsXer.createProgressBar();

      // Immediately jump to the bottom of the profile to trigger loading of older Tweets
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      await TweetsXer.sleep(2000); // give X time to load the next batch

      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;
      let hitErrorLimit = false;
      let skippedCount = 0;

      const more = TweetsXer.more;

      let emptyChecks = 0;
      while (emptyChecks < 5 && !TweetsXer.stopRequested) {
        if (document.querySelectorAll(more).length === 0) {
          if (document.hidden) {
            // Browsers pause scroll/visibility-driven loading in hidden tabs, so X can't load
            // older Tweets right now. Wait for the tab to come back instead of giving up.
            TweetsXer.updateInfo(`${TweetsXer.dCount} deleted. Paused: this tab is in the background, so X can't load more Tweets. Bring it to the front to continue.`);
            await TweetsXer.waitUntilVisible();
            await TweetsXer.sleep(1000);
            continue;
          }

          // Nothing rendered right now; X may still be loading the next batch
          emptyChecks++;
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
          await TweetsXer.sleep(2000);
          continue;
        }
        emptyChecks = 0;

        // give the Tweets a chance to load; increase/decrease if necessary
        await TweetsXer.sleep(1200);

        // hide recommended profiles and other non-Tweet rows
        document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>div').forEach(x => x.remove());
        document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>[role="link"]').forEach(x => x.remove());

        try {
          const moreElement = document.querySelector(more);
          if (!moreElement) continue; // the loop top re-sleeps, so this isn't a tight loop
          const article = moreElement.closest('[data-testid="tweet"]');

          // aim to center the Tweet in the viewport
          const rect = moreElement.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
          TweetsXer.smoothScrollTo(targetY, 700); // not awaited, so deletion isn't delayed

          let counted = true;

          // everything below is scoped to this one Tweet (article), so a re-render
          // can't make us act on, or verify, a different Tweet
          const unretweet = article.querySelector('[data-testid="unretweet"]');
          if (unretweet) {
            // if it is a Retweet, unretweet it
            unretweet.click();
            const confirmURT = await waitForElemToExist('[data-testid="unretweetConfirm"]');
            confirmURT.click();
            await TweetsXer.sleep(500);
            article.remove(); // Retweets can stay in the timeline after undoing, so remove manually
          } else {
            // delete Tweet
            moreElement.click();

            const menu = await waitForElemToExist('[role="menuitem"]');
            if (menu.textContent.includes('@')) {
              // not our Tweet (the menu offers follow/unfollow), so skip it and don't count it
              // (this is what happens to other people's Tweets shown in the Replies tab)
              moreElement.click();
              article.remove();
              counted = false;
            } else {
              menu.click();
              const confirmation = await waitForElemToExist('[data-testid="confirmationSheetConfirm"]');
              confirmation.click();

              // verify the Tweet is actually gone before counting it
              for (let i = 0; i < 20 && article.isConnected; i++) await TweetsXer.sleep(250);
              if (article.isConnected) throw new Error('Tweet still present after delete');
            }
          }

          if (counted) {
            TweetsXer.dCount++;
            TweetsXer.updateProgressBar();

            // console progress update every 100 deletions
            if (TweetsXer.dCount % 100 === 0) {
              console.log(`${new Date().toUTCString()} Deleted ${TweetsXer.dCount} Tweets`);
            }
          } else {
            skippedCount++;
          }
          consecutiveErrors = 0;
        } catch (error) {
          console.error(`Error deleting tweet: ${error.message}`);
          TweetsXer.dismissOverlays(); // don't leave a stale menu/dialog for the next iteration
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            hitErrorLimit = true;
            console.log(`${consecutiveErrors} consecutive errors. Stopping.`);
            break;
          }
        }
      }

      const summary = `${TweetsXer.dCount} deleted, ${skippedCount} skipped (not yours).`;
      if (hitErrorLimit) {
        TweetsXer.reportProblem(`Stopped after ${consecutiveErrors} consecutive errors. ${summary} Please reload to confirm.`);
      } else {
        const outcome = TweetsXer.stopRequested ? 'Stopped' : 'Finished';
        console.log(`${outcome}. Total deleted: ${TweetsXer.dCount} Tweets. Skipped (not yours): ${skippedCount}. Please reload to confirm.`);
        TweetsXer.updateInfo(`${outcome}. ${summary} Please reload to confirm.`);
      }
      TweetsXer.endRun(runToken);
    },

    async unfollow () {
      // beginRun() also disables the other entry points
      const runToken = TweetsXer.beginRun();
      if (!runToken) return;

      let unfollowCount = 0;
      let consecutiveErrors = 0;
      let stoppedByError = false;

      try {
        const followingLink = document.querySelector('[href$="/following"]');
        if (!followingLink) {
          TweetsXer.updateInfo('Could not find the Following link. Open your profile and try again.');
          return;
        }
        followingLink.click();
        await TweetsXer.sleep(1200);

        // Only cells that actually offer an unfollow button are usable; the first
        // row is sometimes our own account or a promoted/blocked entry.
        const nextCell = () => Array.from(document.querySelectorAll('[data-testid="UserCell"]'))
          .find((cell) => cell.querySelector('[data-testid$="-unfollow"]'));

        while (!TweetsXer.stopRequested) {
          const cell = nextCell();
          if (!cell) break;

          try {
            cell.scrollIntoView({ behavior: 'smooth' });
            cell.querySelector('[data-testid$="-unfollow"]').click();
            const confirm = await waitForElemToExist('[data-testid="confirmationSheetConfirm"]');
            confirm.click();
            await TweetsXer.sleep(250); // let the list settle before removing the row
            cell.remove();
            unfollowCount++;
            consecutiveErrors = 0;
            if (unfollowCount % 10 === 0) {
              console.log(`${new Date().toUTCString()} Unfollowed ${unfollowCount} accounts`);
            }
            await TweetsXer.jitterSleep(200);
          } catch (error) {
            console.error(`Error unfollowing: ${error.message}`);
            TweetsXer.dismissOverlays();
            consecutiveErrors++;
            if (consecutiveErrors >= TweetsXer.maxConsecutiveFailures) {
              stoppedByError = true;
              TweetsXer.updateInfo(`Stopped after ${consecutiveErrors} consecutive errors. Unfollowed ${unfollowCount} accounts so far.`);
              break;
            }
            await TweetsXer.waitBeforeRetry('Unfollow failed.', 0, consecutiveErrors - 1);
          }
        }

        if (stoppedByError || TweetsXer.stopRequested) {
          console.log(`Stopped. Unfollowed ${unfollowCount} accounts. Please reload to confirm.`);
        } else {
          console.log(`No accounts left. Unfollowed ${unfollowCount} accounts. Please reload to confirm.`);
        }
      } finally {
        TweetsXer.endRun(runToken);
      }
    },
    stop () {
      this.stopRequested = true;
      this.running = false;
      this.removeProgressBar();
      const banner = document.getElementById(this.dId);
      if (banner) banner.remove();
      this.showPrompt('TweetXer stopped.');
    }
  };

  // The timeout goes through TweetsXer.sleep() so it isn't delayed by background-tab throttling
  const waitForElemToExist = (selector, timeout = 10000) => {
    const elem = document.querySelector(selector);
    if (elem) return Promise.resolve(elem);

    return new Promise((resolve, reject) => {
      let settled = false;
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found && !settled) {
          settled = true;
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });

      TweetsXer.sleep(timeout).then(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        reject(new Error(`Timed out waiting for ${selector}`));
      });
    });
  };

  TweetsXer.boot();
})();
