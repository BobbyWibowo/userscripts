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
// ==/UserScript==

(function () {
  const TweetsXer = {
    version: typeof GM_info !== 'undefined' ? GM_info.script.version : 'unknown',
    TweetCount: 0,
    dId: 'exportUpload',
    tIds: [],
    tId: '',
    ratelimitreset: 0,
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
      let box = document.getElementById(this.promptId);
      if (!box) {
        box = document.createElement('div');
        box.id = this.promptId;
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

    // Opens the banner. Triggered by the userscript manager's "Start TweetXer" menu command.
    async init () {
      if (this.starting || document.getElementById(this.dId)) return; // already starting or open
      this.starting = true;
      try {
        this.baseUrl = `https://${window.location.hostname}`;
        this.showPrompt('Starting TweetXer...');

        // Only continue on your own profile
        await waitForElemToExist('header').catch(() => null);
        const ownProfile = await waitForElemToExist('[data-testid="editProfileButton"]', 1500).catch(() => null);
        if (!ownProfile) {
          this.showPrompt('TweetXer can only start on your own profile page. Open your profile, then choose "Start TweetXer" in your userscript manager again.');
          return;
        }
        this.hidePrompt();

        // Needed by every action, so set them before the banner becomes usable
        this.ct0 = this.getCookie('ct0');
        this.username = window.location.pathname.split('/')[1];
        this.updateTransactionId();
        this.stopRequested = false;
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
      this.ratelimitreset = reset ? Number(reset) : this.ratelimitreset;
      let sleeptime = this.ratelimitreset - Math.floor(Date.now() / 1000);
      while (sleeptime > 0 && !this.stopRequested) {
        sleeptime = this.ratelimitreset - Math.floor(Date.now() / 1000);
        this.updateInfo(`Ratelimited. Waiting ${sleeptime} seconds. ${this.dCount} deleted.`);
        await this.sleep(1000);
      }
    },

    // Shared deletion loop used by deleteTweets/deleteFavs/deleteDMs.
    async deleteLoop (url, makeBody) {
      while (this.tIds.length > 0 && !this.stopRequested) {
        this.tId = this.tIds.pop();
        await this.sendRequest(url, makeBody ? makeBody(this.tId) : undefined);
      }
      this.tId = '';
      this.updateProgressBar();
    },

    updateTitle (text) {
      const el = document.getElementById('tweetsXer_title');
      if (el) el.textContent = text;
    },

    updateInfo (text) {
      const el = document.getElementById('info');
      if (el) el.textContent = text;
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
      progressbar.style.cssText = 'display:block;width:100%;';

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

    processFile () {
      const tn = document.getElementById(`${TweetsXer.dId}_file`);
      if (tn.files && tn.files[0]) {
        const fr = new FileReader();
        fr.onloadend = function (evt) {
          // window.YTD.tweet_headers.part0
          // window.YTD.tweets.part0
          // window.YTD.like.part0
          // window.YTD.direct_message_headers.part0
          const cutpoint = evt.target.result.indexOf('= ');
          const filestart = evt.target.result.slice(0, cutpoint);
          const json = JSON.parse(evt.target.result.slice(cutpoint + 1));

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
              TweetsXer.tIds = json.map((c) => c.dmConversation.conversationId);
            }
          } else {
            TweetsXer.updateInfo('File content not recognized. Please use a file from the Twitter data export.');
            console.log('File content not recognized. Please use a file from the Twitter data export.');
          }

          if (TweetsXer.action.length > 0) {
            TweetsXer.total = TweetsXer.tIds.length;
            document.getElementById(`${TweetsXer.dId}_file`).remove();
            TweetsXer.createProgressBar();
          }

          if (TweetsXer.action === 'untweet') {
            if (document.getElementById('skipCount').value.length < 1) {
              // If there is no amount set to skip, automatically try to skip the amount
              // that has been deleted already. Difference of Tweeets in file to count on profile
              // 5% tolerance to prevent skipping too much
              TweetsXer.skip = TweetsXer.total - TweetsXer.TweetCount - parseInt(TweetsXer.total / 20);
              TweetsXer.skip = Math.max(0, TweetsXer.skip);
            } else {
              TweetsXer.skip = document.getElementById('skipCount').value;
            }
            console.log(`Skipping oldest ${TweetsXer.skip} Tweets. Use advanced options to manually set how many to skip. Enter 0 to prevent the automatic calculation.`);
            TweetsXer.tIds.reverse();
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} Tweets`);

            TweetsXer.deleteTweets();
          } else if (TweetsXer.action === 'unfav') {
            TweetsXer.skip = document.getElementById('skipCount').value.length > 0 ? document.getElementById('skipCount').value : 0;
            console.log(`Skipping oldest ${TweetsXer.skip} Tweets`);
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} Favs`);
            TweetsXer.deleteFavs();
          } else if (TweetsXer.action === 'undm') {
            TweetsXer.skip = document.getElementById('skipCount').value.length > 0 ? document.getElementById('skipCount').value : 0;
            console.log(`Skipping ${TweetsXer.skip} messages/convos`);
            TweetsXer.tIds = TweetsXer.tIds.slice(TweetsXer.skip);
            TweetsXer.dCount = TweetsXer.skip;
            TweetsXer.tIds.reverse();
            if (TweetsXer.deleteDMsOneByOne) {
              TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} DMs`);
              TweetsXer.deleteDMs();
            } else {
              TweetsXer.updateTitle(`TweetXer: Deleting ${TweetsXer.total} DM Conversations`);
              TweetsXer.deleteConvos();
            }
          } else {
            TweetsXer.updateTitle('TweetXer: Please try a different file');
          }
        };
        fr.readAsText(tn.files[0]);
      }
    },

    createUploadForm () {
      const h2Class = document.querySelectorAll('h2')[1]?.getAttribute('class') || '';
      const div = document.createElement('div');
      div.id = this.dId;
      if (document.getElementById(this.dId)) { document.getElementById(this.dId).remove(); }
      // The file input and slow delete button start disabled; getTweetCount() enables them
      // once the Tweet count is known, so they can't be used with a count of 0.
      div.innerHTML = `
            <style>#${this.dId}{ z-index:99999; position: relative; width:auto; margin:0 auto; padding: 20px 10%; background:#87CEFA; opacity:0.95; } #${this.dId} > *{padding:5px;} button{background-color:#eff3f4;border-radius:666px;padding:2px 10px;} a {color:blue;}</style>
            <div style="color:black">
                <h2 class="${h2Class}" id="tweetsXer_title">TweetXer</h2>
                <p id="info">Please wait for your profile to load. If this message doesn't go away after some seconds, something isn't working.</p>
                <p id="start">
                    <input type="file" value="" id="${this.dId}_file" disabled />
                    <a href="#" id="toggleAdvanced">Advanced Options</a>
                <div id="advanced" style="display:none">
                    <label for="skipCount">Enter how many Tweets to skip before selecting a file.</label>
                    <input id="skipCount" type="number" value="" />
                    <p>Supported files:
                    <ul>
                        <li>tweet-headers.js to delete Tweets (10.000 - 20.000 per hour)</li>
                        <li>direct-message-header.js and direct-message-group-headers.js to delete DMs (around 800 per 15 minutes)</li>
                        <li>like.js to delete Favs (500 per 15 minutes; only works for the most recent few thousands)</li>
                    </ul>
                    <p><strong>Export bookmarks</strong><br>
                        Bookmarks are not included in the official data export. You can export them here.
                        <button id="exportBookmarks" type="button">Export Bookmarks</button>
                    </p>
                    <p><strong>No tweet-headers.js?</strong><br>
                        If you are unable to get your data export, you can use the following option.<br>
                        This option is much slower and less reliable. It can remove at most 4000 Tweets per hour.<br>
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
      document.getElementById(`${this.dId}_file`).addEventListener('change', this.processFile, false);
      document.getElementById('exportBookmarks').addEventListener('click', this.exportBookmarks, false);
      document.getElementById('slowDelete').addEventListener('click', this.slowDelete, false);
      document.getElementById('unfollowEveryone').addEventListener('click', this.unfollow, false);
    },

    async exportBookmarks () {
      TweetsXer.updateTitle('TweetXer: Exporting bookmarks');
      let variables = '';
      while ((TweetsXer.bookmarksNext.length > 0 || TweetsXer.bookmarks.length === 0) && !TweetsXer.stopRequested) {
        if (TweetsXer.bookmarksNext.length > 0) {
          variables = `{"count":20,"cursor":"${TweetsXer.bookmarksNext}","includePromotedContent":false}`;
        } else variables = '{"count":20,"includePromotedContent":false}';
        const response = await fetch(TweetsXer.baseUrl + TweetsXer.bookmarksURL + new URLSearchParams({
          variables,
          features: '{"graphql_timeline_v2_bookmark_timeline":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}'
        }), {
          headers: TweetsXer.baseHeaders(),
          referrer: `${TweetsXer.baseUrl}/i/bookmarks`,
          referrerPolicy: 'strict-origin-when-cross-origin',
          method: 'GET',
          mode: 'cors',
          credentials: 'include'
        });

        if (response.status === 200) {
          const data = await response.json();
          data.data.bookmark_timeline_v2.timeline.instructions[0].entries.forEach((item) => {
            if (item.entryId.includes('tweet')) {
              TweetsXer.dCount++;
              TweetsXer.bookmarks.push(item.content.itemContent.tweet_results.result);
            } else if (item.entryId.includes('cursor-bottom')) {
              if (TweetsXer.bookmarksNext !== item.content.value) {
                TweetsXer.bookmarksNext = item.content.value;
              } else {
                TweetsXer.bookmarksNext = '';
              }
            }
          });
          //document.getElementById('progressbar').setAttribute('value', TweetsXer.dCount)
          TweetsXer.updateInfo(`${TweetsXer.dCount} Bookmarks collected`);
        } else {
          console.log(response);
        }

        if (TweetsXer.isRateLimited(response)) {
          console.log('rate limit hit');
          await TweetsXer.waitRateLimit(response.headers.get('x-rate-limit-reset'));
        }
      }
      const download = new Blob([JSON.stringify(TweetsXer.bookmarks)], {
        type: 'text/plain'
      });
      const bookmarksDownload = document.createElement('a');
      bookmarksDownload.id = 'bookmarksDownload';
      bookmarksDownload.innerText = 'Download bookmarks';
      bookmarksDownload.href = window.URL.createObjectURL(download);
      bookmarksDownload.download = 'twitter-bookmarks.json';
      document.getElementById('advanced').appendChild(bookmarksDownload);
      TweetsXer.updateTitle('TweetXer');
    },

    async sendRequest (
      url,
      body = JSON.stringify({
        variables: { tweet_id: TweetsXer.tId, dark_request: false },
        queryId: url.split('/')[6]
      })
    ) {
      try {
        const response = await fetch(url, {
          headers: this.baseHeaders(),
          referrer: `${TweetsXer.baseUrl}/${TweetsXer.username}/with_replies`,
          referrerPolicy: 'strict-origin-when-cross-origin',
          body,
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          signal: AbortSignal.timeout(5000)
        });

        if (response.status === 200) {
          TweetsXer.dCount++;
          TweetsXer.updateProgressBar();

          const remaining = response.headers.get('x-rate-limit-remaining');
          if (this.isRateLimited(response)) {
            console.log('rate limit hit');
            console.log(remaining);
            await this.waitRateLimit(response.headers.get('x-rate-limit-reset'));
            return 'deleted and waiting';
          }
          return 'deleted';
        } else if (response.status === 429) {
          TweetsXer.tIds.push(TweetsXer.tId);
          console.log('Received status code 429. Waiting for 1 second before trying again.');
          await TweetsXer.sleep(1000);
          return 'ratelimited';
        } else {
          console.log(response);
          return 'error';
        }
      } catch (error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          TweetsXer.tIds.push(TweetsXer.tId);
          console.log('Request timeout.');
          let sleeptime = 15;
          while (sleeptime > 0 && !TweetsXer.stopRequested) {
            sleeptime--;
            TweetsXer.updateInfo(`Ratelimited. Waiting ${sleeptime} seconds. ${TweetsXer.dCount} deleted.`);
            await TweetsXer.sleep(1000);
          }
          return 'timeout';
        }
        console.error(error);
        return 'error';
      }
    },

    async deleteTweets () {
      await this.deleteLoop(this.baseUrl + this.deleteURL);
    },

    async deleteFavs () {
      this.updateTitle('TweetXer: Deleting Favs');
      // 500 unfavs per 15 Minutes
      // x-rate-limit-remaining
      // x-rate-limit-reset

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
      while (this.tIds.length > 0 && !this.stopRequested) {
        this.tId = this.tIds.pop();
        const url = this.baseUrl + this.deleteConvoURL.replace('USER_ID-CONVERSATION_ID', this.tId);
        const response = await fetch(url, {
          headers: this.baseHeaders('application/x-www-form-urlencoded'),
          referrer: `${TweetsXer.baseUrl}/messages`,
          body: 'dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=false&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true',
          method: 'POST',
          mode: 'cors',
          credentials: 'include',
          signal: AbortSignal.timeout(5000)
        });

        if (response.status === 204) {
          TweetsXer.dCount++;
          TweetsXer.updateProgressBar();

          if (this.isRateLimited(response)) {
            console.log('rate limit hit');
            await this.waitRateLimit(response.headers.get('x-rate-limit-reset'));
          }
          await TweetsXer.sleep(Math.floor(Math.random() * 200)); // send requests slightly slower and with random intervals
        } else if (response.status === 429 || response.status === 420) {
          TweetsXer.tIds.push(TweetsXer.tId);
          console.log(`Received status code ${response.status}. Waiting before trying again.`);
          let sleeptime = 60 * 5; // is that enough?
          while (sleeptime > 0 && !TweetsXer.stopRequested) {
            sleeptime--;
            TweetsXer.updateInfo(`Ratelimited. Waiting ${sleeptime} seconds. ${TweetsXer.dCount} deleted.`);
            await TweetsXer.sleep(1000);
          }
        } else {
          console.log(response);
        }
      }
      this.tId = '';
      this.updateProgressBar();
    },

    async getTweetCount () {
      await TweetsXer.sleep(1000);

      function extractTweetCount (selector) {
        const element = document.querySelector(selector);
        if (!element) return null;

        const match = element.textContent.match(/((\d|,|\.|K)+) (\w+)$/);
        if (!match) return null;

        return match[1]
          .replace(/\.(\d+)K/, '$1'.padEnd(3, '0'))
          .replace('K', '000')
          .replace(',', '')
          .replace('.', '');
      }

      try {
        TweetsXer.TweetCount = extractTweetCount('[data-testid="primaryColumn"]>div>div>div');

        if (!TweetsXer.TweetCount) {
          TweetsXer.TweetCount = extractTweetCount('[data-testid="TopNavBar"]>div>div');
        }

        if (!TweetsXer.TweetCount) {
          console.log("Wasn't able to find Tweet count on profile. Setting it to 1 million.");
          TweetsXer.TweetCount = 1000000;
        }
      } catch (error) {
        console.log("Wasn't able to find Tweet count on profile. Setting it to 1 million.");
        TweetsXer.TweetCount = 1000000; // prevents Tweets from being skipped because if tweet count of 0
      }

      // The count is known now, so the controls that depend on it can be used
      const fileInput = document.getElementById(`${this.dId}_file`);
      if (fileInput) fileInput.disabled = false;
      const slowDeleteButton = document.getElementById('slowDelete');
      if (slowDeleteButton) slowDeleteButton.disabled = false;

      this.updateInfo('Select your tweet-headers.js from your Twitter Data Export to start the deletion of all your Tweets.');
      console.log(TweetsXer.TweetCount + ' Tweets on profile.');
      console.log('You can close the console now to reduce the memory usage.');
      console.log('Reopen the console if there are issues to see if an error shows up.');
    },

    async slowDelete () {
      const slowDeleteButton = document.getElementById('slowDelete');
      const repliesCheckbox = document.getElementById('slowDeleteReplies');
      // disable right away so a double click can't start two loops
      slowDeleteButton.disabled = true;
      repliesCheckbox.disabled = true;
      const deleteReplies = repliesCheckbox.checked;

      // Make sure the right profile tab is open: Replies if replies should be deleted too,
      // otherwise Posts. This also covers starting from another tab (Likes, Media, etc.).
      if (!(await TweetsXer.selectProfileTab(deleteReplies))) {
        TweetsXer.updateInfo('Could not find the profile tabs. Open your profile and try again.');
        slowDeleteButton.disabled = false;
        repliesCheckbox.disabled = false;
        return;
      }

      //document.getElementById("toggleAdvanced").click()
      document.getElementById('start').remove();
      TweetsXer.total = TweetsXer.TweetCount;
      TweetsXer.createProgressBar();

      // Immediately jump to the bottom of the profile to trigger loading of older Tweets
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      await TweetsXer.sleep(2000); // give X time to load the next batch

      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;
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
        // afaik the limit is 50 requests per minute
        await TweetsXer.sleep(1200);

        // hide recommended profiles and stuff
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

            // print to the console how many Tweets already got deleted
            // Change the 100 to how often you want an update.
            // 10 for every 10th Tweet, 1 for every Tweet, 100 for every 100th Tweet
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
            console.log(`${consecutiveErrors} consecutive errors. Stopping.`);
            break;
          }
        }
      }

      console.log(`Finished. Total deleted: ${TweetsXer.dCount} Tweets. Skipped (not yours): ${skippedCount}. Please reload to confirm.`);
    },

    async unfollow () {
      //document.getElementById("toggleAdvanced").click()
      let unfollowCount = 0;
      let nextUnfollow, menu;

      document.querySelector('[href$="/following"]').click();
      await TweetsXer.sleep(1200);

      const accounts = '[data-testid="UserCell"]';
      while (document.querySelectorAll('[data-testid="UserCell"] [data-testid$="-unfollow"]').length > 0 && !TweetsXer.stopRequested) {
        try {
          nextUnfollow = document.querySelectorAll(accounts)[0];
          nextUnfollow.scrollIntoView({
            behavior: 'smooth'
          });

          nextUnfollow.querySelector('[data-testid$="-unfollow"]').click();
          menu = await waitForElemToExist('[data-testid="confirmationSheetConfirm"]');
          menu.click();
          nextUnfollow.remove();
          unfollowCount++;
          if (unfollowCount % 10 === 0) {
            console.log(`${new Date().toUTCString()} Unfollowed ${unfollowCount} accounts`);
          }
          await TweetsXer.sleep(Math.floor(Math.random() * 200));
        } catch (error) {
          console.error(`Error unfollowing: ${error.message}`);
          TweetsXer.dismissOverlays();
          break;
        }
      }

      console.log('No accounts left. Please reload to confirm.');
    },
    stop () {
      this.stopRequested = true;
      this.removeProgressBar();
      const banner = document.getElementById(this.dId);
      if (banner) banner.remove();
      this.showPrompt('TweetXer stopped.');
    },
    removeTweetXer () {
      this.stop();
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
