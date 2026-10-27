// ==UserScript==
// @name         Pixiv Inactive Cleaner
// @namespace    https://github.com/BobbyWibowo
// @version      0.4.1
// @description  Find and optionally unfollow Pixiv artists whose latest artwork is older than a chosen cutoff.
// @author       Bobby Wibowo
// @license      MIT
// @match        *://www.pixiv.net/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // ---------------- CONFIG ----------------

  // These defaults are written into userscript-manager storage on first run.
  // Change individual stored values in your userscript manager's storage editor;
  // saved settings persist across script updates. Reload the Pixiv page after
  // editing storage to apply changes.
  const CONFIG_DEFAULTS = Object.freeze({
    // Inactive = latest illustration/manga was posted more than this many days ago.
    INACTIVE_DAYS: 365, // 1 year

    // Optional fixed cutoff. Falsy values (including null) disable this override,
    // and the script uses INACTIVE_DAYS instead.
    // Example: '2025-01-01T00:00:00+09:00'
    CUTOFF_DATE: null,

    // TEST_RUN: scans until it finds the FIRST matching artist, prints it, then stops.
    // TEST_RUN is always non-destructive regardless of DRY_RUN.
    TEST_RUN: false,

    // DRY_RUN: scans all followed artists and prints matches, but does not unfollow.
    DRY_RUN: true,

    // Include both public and private follows.
    INCLUDE_PUBLIC_FOLLOWS: true,
    INCLUDE_PRIVATE_FOLLOWS: false,

    // Artists with no illustration/manga at all count as inactive.
    TREAT_NO_ARTWORK_AS_INACTIVE: true,

    // Normal pacing between successful Pixiv API requests.
    REQUEST_DELAY_MS: 500,

    // Delay between destructive unfollow requests in live mode.
    UNFOLLOW_DELAY_MS: 1200,

    // Transient failures are retried indefinitely. The delay grows exponentially
    // up to RETRY_MAX_DELAY_MS, with jitter, then stays near that cap.
    // If Pixiv sends Retry-After, that value takes precedence when it is longer.
    RETRY_INITIAL_DELAY_MS: 2000,
    RETRY_MAX_DELAY_MS: 5 * 60 * 1000, // 5 minutes
    RETRY_JITTER_FRACTION: 0.25,

    // Fetch artwork metadata in batches. There is no fixed cap on how far back
    // the scan can look when newer entries are deleted or lack usable metadata.
    ARTWORK_BATCH_SIZE: 10
  });

  // Seed every missing key with its default. For ordinary settings, null and
  // undefined are also restored to the default (and repaired in storage).
  // CUTOFF_DATE is special: stored null and other falsy values are intentional.
  const CONFIG = {};
  for (const [key, defaultValue] of Object.entries(CONFIG_DEFAULTS)) {
    const storedValue = GM_getValue(key);
    const useDefault = storedValue === undefined ||
      (key !== 'CUTOFF_DATE' && storedValue === null);

    if (useDefault) GM_setValue(key, defaultValue);
    CONFIG[key] = useDefault ? defaultValue : storedValue;
  }

  const {
    INACTIVE_DAYS,
    CUTOFF_DATE,
    TEST_RUN,
    DRY_RUN,
    INCLUDE_PUBLIC_FOLLOWS,
    INCLUDE_PRIVATE_FOLLOWS,
    TREAT_NO_ARTWORK_AS_INACTIVE,
    REQUEST_DELAY_MS,
    UNFOLLOW_DELAY_MS,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_DELAY_MS,
    RETRY_JITTER_FRACTION,
    ARTWORK_BATCH_SIZE
  } = CONFIG;

  // ---------------- END CONFIG ----------------

  // Centralized console logging. Tables are grouped under a labeled prefix.
  const SCRIPT_NAME = 'Pixiv Inactive Cleaner';
  const LOG_PREFIX = `[${SCRIPT_NAME}]`;
  const logger = {
    info: (...args) => console.log(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args),
    table: (label, rows) => {
      console.group(`${LOG_PREFIX} ${label}`);
      console.table(rows);
      console.groupEnd();
    }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function cutoffDate () {
    if (CUTOFF_DATE) {
      const d = new Date(CUTOFF_DATE);
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid CUTOFF_DATE: ${CUTOFF_DATE}`);
      return d;
    }
    return new Date(Date.now() - INACTIVE_DAYS * 86400000);
  }

  function getOwnUserId () {
    // Current Pixiv global-data format.
    const meta = document.querySelector('#meta-global-data, meta[name="global-data"]');
    if (meta?.content) {
      try {
        const data = JSON.parse(meta.content);
        const candidates = [
          data?.userData?.id,
          data?.userData?.userId,
          data?.userData?.self?.id,
          data?.userData?.self?.userId
        ];
        const id = candidates.find(v => /^\d+$/.test(String(v ?? '')));
        if (id) return String(id);
      } catch (_) {}
    }

    // Current Next.js format.
    const next = document.querySelector('#__NEXT_DATA__');
    if (next?.textContent) {
      try {
        const data = JSON.parse(next.textContent);
        const serialized = data?.props?.pageProps?.serverSerializedPreloadedState;
        if (serialized) {
          const state = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
          const candidates = [
            state?.userData?.self?.id,
            state?.userData?.self?.userId,
            state?.api?.userData?.self?.id,
            state?.api?.userData?.self?.userId
          ];
          const id = candidates.find(v => /^\d+$/.test(String(v ?? '')));
          if (id) return String(id);
        }
      } catch (_) {}
    }

    // Safe fallback when run from your own /users/<id>/following page.
    const m = location.pathname.match(/^\/users\/(\d+)\/following(?:\/|$)/);
    if (m) return m[1];

    throw new Error('Could not determine your Pixiv user ID. Open your own Following page and run the script again.');
  }

  function getCsrfToken () {
    const meta = document.querySelector('#meta-global-data, meta[name="global-data"]');
    if (meta?.content) {
      try {
        const token = JSON.parse(meta.content)?.token;
        if (token) return token;
      } catch (_) {}
    }

    const next = document.querySelector('#__NEXT_DATA__');
    if (next?.textContent) {
      try {
        const data = JSON.parse(next.textContent);
        const serialized = data?.props?.pageProps?.serverSerializedPreloadedState;
        if (serialized) {
          const state = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
          if (state?.api?.token) return state.api.token;
        }
      } catch (_) {}
    }

    throw new Error('Could not obtain Pixiv CSRF token. Reload Pixiv and try again.');
  }

  function parseRetryAfterMs (response) {
    const value = response.headers.get('Retry-After');
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

    return null;
  }

  function isTransientStatus (status) {
    return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
  }

  function retryDelayMs (attempt, retryAfterMs = null) {
    const exponential = Math.min(
      RETRY_MAX_DELAY_MS,
      RETRY_INITIAL_DELAY_MS * (2 ** Math.min(attempt - 1, 30))
    );
    const jitter = exponential * RETRY_JITTER_FRACTION * (Math.random() * 2 - 1);
    const backedOff = Math.max(RETRY_INITIAL_DELAY_MS, Math.round(exponential + jitter));
    return retryAfterMs == null ? backedOff : Math.max(backedOff, retryAfterMs);
  }

  function formatWait (ms) {
    if (ms < 1000) return `${ms} ms`;
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
  }

  async function fetchWithRetry (url, options = {}, label = url) {
    let attempt = 0;

    while (true) {
      attempt++;
      try {
        const response = await fetch(url, {
          credentials: 'same-origin',
          ...options
        });

        if (response.ok) return response;

        if (!isTransientStatus(response.status)) {
          throw new Error(`${response.status} ${response.statusText}: ${url}`);
        }

        const retryAfterMs = parseRetryAfterMs(response);
        const waitMs = retryDelayMs(attempt, retryAfterMs);
        logger.warn(
          `${label}: HTTP ${response.status}. ` +
          `Retrying indefinitely; attempt ${attempt}, waiting ${formatWait(waitMs)}.`
        );
        await sleep(waitMs);
      } catch (err) {
        // Explicit HTTP errors for permanent statuses should stop immediately.
        if (err instanceof Error && /^\d{3} /.test(err.message)) throw err;

        // Network failures (offline, connection reset, DNS hiccup, etc.) are transient.
        const waitMs = retryDelayMs(attempt);
        logger.warn(
          `${label}: network error (${err?.message || err}). ` +
          `Retrying indefinitely; attempt ${attempt}, waiting ${formatWait(waitMs)}.`
        );
        await sleep(waitMs);
      }
    }
  }

  async function fetchJson (url, options = {}) {
    let apiErrorAttempt = 0;

    while (true) {
      const response = await fetchWithRetry(url, options, url);
      let json;

      try {
        json = await response.json();
      } catch (err) {
        apiErrorAttempt++;
        const waitMs = retryDelayMs(apiErrorAttempt);
        logger.warn(
          `${url}: response could not be parsed as JSON (${err?.message || err}). ` +
          `Treating it as transient; retrying indefinitely, attempt ${apiErrorAttempt}, ` +
          `waiting ${formatWait(waitMs)}.`
        );
        await sleep(waitMs);
        continue;
      }

      if (!json?.error) return json;

      const message = String(json.message || 'unknown error');
      const looksTransient = /rate.?limit|too many|temporar|try again|busy|overload|アクセスが集中|しばらく/i.test(message);

      if (!looksTransient) {
        throw new Error(`Pixiv API error: ${message} (${url})`);
      }

      apiErrorAttempt++;
      const waitMs = retryDelayMs(apiErrorAttempt);
      logger.warn(
        `${url}: transient Pixiv API error: ${message}. ` +
        `Retrying indefinitely; attempt ${apiErrorAttempt}, waiting ${formatWait(waitMs)}.`
      );
      await sleep(waitMs);
    }
  }

  async function getFollowings (ownUserId) {
    const modes = [];
    if (INCLUDE_PUBLIC_FOLLOWS) modes.push('show');
    if (INCLUDE_PRIVATE_FOLLOWS) modes.push('hide');
    if (!modes.length) throw new Error('Both public and private follows are disabled in config.');

    const byId = new Map();
    const limit = 100;

    for (const rest of modes) {
      logger.info(`Fetching ${rest === 'show' ? 'public' : 'private'} following list...`);
      let offset = 0;
      while (true) {
        const url = `/ajax/user/${ownUserId}/following?offset=${offset}&limit=${limit}&rest=${rest}&lang=en`;
        const json = await fetchJson(url);
        const users = json?.body?.users ?? [];

        for (const user of users) {
          byId.set(String(user.userId), {
            userId: String(user.userId),
            userName: user.userName || '(unknown)',
            visibility: rest === 'show' ? 'public' : 'private'
          });
        }

        offset += users.length;
        if (!users.length || offset >= (json?.body?.total ?? 0)) break;
        await sleep(REQUEST_DELAY_MS);
      }
    }

    return [...byId.values()];
  }

  function parseArtwork (work, fallbackId) {
    if (!work?.createDate) return null;
    const createDate = new Date(work.createDate);
    if (Number.isNaN(createDate.getTime())) return null;

    const id = String(work.id ?? fallbackId);
    return {
      id,
      title: work.title || '',
      createDate,
      url: `https://www.pixiv.net/artworks/${id}`
    };
  }

  async function getLatestArtwork (userId) {
    const profile = await fetchJson(`/ajax/user/${userId}/profile/all?lang=en`);
    const body = profile?.body;

    // A malformed/changed API response must not be mistaken for zero artworks.
    if (!body || typeof body !== 'object' || (!('illusts' in body) && !('manga' in body))) {
      throw new Error(`Artwork listing missing for user ${userId}`);
    }

    // Intentionally count illustrations and manga, but not novels.
    const ids = [...new Set([
      ...Object.keys(body.illusts ?? {}),
      ...Object.keys(body.manga ?? {})
    ])].sort((a, b) => Number(b) - Number(a));

    if (!ids.length) return null;

    // Newer Pixiv IDs normally correspond to later publication dates. Fetch
    // metadata in batches, and continue to older IDs if a batch is unusable.
    // This avoids treating a fixed number of missing/deleted works as "no art".
    for (let offset = 0; offset < ids.length; offset += ARTWORK_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + ARTWORK_BATCH_SIZE);
      const params = new URLSearchParams();
      for (const id of batch) params.append('ids[]', id);
      params.set('work_category', 'illustManga');
      params.set('is_first_page', '1');
      params.set('lang', 'en');

      const details = await fetchJson(`/ajax/user/${userId}/profile/illusts?${params}`);
      const worksObj = details?.body?.works ?? {};
      const entries = Array.isArray(worksObj)
        ? worksObj.map(work => [String(work?.id ?? ''), work])
        : Object.entries(worksObj);
      const found = new Map();

      for (const [key, work] of entries) {
        const id = String(work?.id ?? key);
        if (!batch.includes(id)) continue;
        const artwork = parseArtwork(work, id);
        if (artwork) found.set(id, artwork);
      }

      // If the highest IDs have no usable batch metadata, try them individually
      // before selecting an older work. Skip entries no longer accessible.
      const firstValidIndex = batch.findIndex(id => found.has(id));
      const fallbackIds = firstValidIndex === -1 ? batch : batch.slice(0, firstValidIndex);
      for (const id of fallbackIds) {
        await sleep(REQUEST_DELAY_MS);
        try {
          const detail = await fetchJson(`/ajax/illust/${id}?lang=en`);
          const artwork = parseArtwork(detail?.body, id);
          if (artwork) {
            found.set(id, artwork);
          } else {
            logger.warn(`Artwork ${id} for user ${userId} has no usable date.`);
          }
        } catch (err) {
          logger.warn(`Could not inspect artwork ${id} for user ${userId}:`, err);
        }
      }

      if (found.size) {
        // Compare actual dates within the examined batch instead of relying
        // on artwork ID order alone.
        return [...found.values()].sort((a, b) => b.createDate - a.createDate)[0];
      }

      logger.warn(`No usable artwork metadata for user ${userId} in batch ${offset + 1}-${offset + batch.length}; checking older works.`);
    }

    // The artist HAS artwork IDs, but none could be dated. Skip this artist
    // rather than incorrectly treating them as a no-artwork inactive account.
    throw new Error(`Could not determine the latest artwork date for user ${userId} (${ids.length} artwork IDs).`);
  }

  async function unfollow (userId, csrfToken) {
    const body = new URLSearchParams({
      mode: 'del',
      type: 'bookuser',
      id: String(userId)
    });

    await fetchWithRetry('/rpc_group_setting.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body
    }, `unfollow user ${userId}`);
  }

  function downloadBackup (rows) {
    const payload = {
      generatedAt: new Date().toISOString(),
      cutoff: cutoffDate().toISOString(),
      artists: rows.map(r => ({
        userId: r.userId,
        userName: r.userName,
        visibility: r.visibility,
        latestArtworkId: r.latestArtwork?.id ?? null,
        latestArtworkDate: r.latestArtwork?.createDate?.toISOString() ?? null,
        profileUrl: `https://www.pixiv.net/users/${r.userId}`
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pixiv-inactive-cleaner-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function rowForConsole (match) {
    return {
      user: match.userName,
      userId: match.userId,
      visibility: match.visibility,
      latestArtwork: match.latestArtwork?.title ?? '(none)',
      latestDate: match.latestArtwork?.createDate?.toLocaleString() ?? '(none)',
      profile: `https://www.pixiv.net/users/${match.userId}`,
      artwork: match.latestArtwork?.url ?? ''
    };
  }

  async function run () {
    const cutoff = cutoffDate();

    logger.info('Starting.');
    logger.info(`Cutoff: ${cutoff.toISOString()}`);
    logger.info(`TEST_RUN=${TEST_RUN}, DRY_RUN=${DRY_RUN}`);

    const ownUserId = getOwnUserId();
    logger.info(`Logged-in user ID: ${ownUserId}`);

    const followings = await getFollowings(ownUserId);
    logger.info(`Loaded ${followings.length} followed artists.`);

    const matches = [];

    for (let i = 0; i < followings.length; i++) {
      const artist = followings[i];
      logger.info(`[${i + 1}/${followings.length}] Checking ${artist.userName} (${artist.userId})...`);

      try {
        const latestArtwork = await getLatestArtwork(artist.userId);
        const inactive = latestArtwork
          ? latestArtwork.createDate < cutoff
          : TREAT_NO_ARTWORK_AS_INACTIVE;

        if (inactive) {
          const match = { ...artist, latestArtwork };
          matches.push(match);
          logger.info('MATCH:', rowForConsole(match));

          if (TEST_RUN) {
            logger.table('First test match', [rowForConsole(match)]);
            alert(
              `${SCRIPT_NAME} test match found:\n\n` +
              `${match.userName} (${match.userId})\n` +
              `Latest artwork: ${latestArtwork ? latestArtwork.createDate.toLocaleString() : 'none'}\n\n` +
              'No changes were made.'
            );
            return;
          }
        }
      } catch (err) {
        logger.error(`Failed to inspect ${artist.userName} (${artist.userId}):`, err);
      }

      await sleep(REQUEST_DELAY_MS);
    }

    logger.info(`Scan complete. ${matches.length} inactive artists found.`);
    logger.table('Inactive artist matches', matches.map(rowForConsole));

    if (!matches.length) {
      alert(`${SCRIPT_NAME}: no matching inactive artists found.`);
      return;
    }

    if (DRY_RUN) {
      alert(`${SCRIPT_NAME} dry run complete.\n\nFound ${matches.length} matching artists.\nNo changes were made.\n\nSee the browser console for the full list.`);
      return;
    }

    // Live mode safety: export the exact target list before changing anything.
    downloadBackup(matches);

    const answer = prompt(
      'LIVE MODE\n\n' +
      `About to unfollow ${matches.length} artists whose latest artwork is older than:\n` +
      `${cutoff.toLocaleString()}\n\n` +
      'A JSON backup of the target list has been downloaded.\n\n' +
      'Type UNFOLLOW exactly to continue:'
    );

    if (answer !== 'UNFOLLOW') {
      logger.info('Cancelled by user.');
      alert(`${SCRIPT_NAME}: cancelled. No artists were unfollowed.`);
      return;
    }

    const csrfToken = getCsrfToken();
    let success = 0;
    const failures = [];

    for (let i = 0; i < matches.length; i++) {
      const artist = matches[i];
      try {
        logger.info(`Unfollowing [${i + 1}/${matches.length}] ${artist.userName} (${artist.userId})...`);
        await unfollow(artist.userId, csrfToken);
        success++;
      } catch (err) {
        failures.push({ ...artist, error: String(err) });
        logger.error(`Unfollow failed for ${artist.userName} (${artist.userId}):`, err);
      }
      await sleep(UNFOLLOW_DELAY_MS);
    }

    logger.info(`Finished. Success: ${success}; failures: ${failures.length}.`);
    if (failures.length) logger.table('Unfollow failures', failures.map(rowForConsole));
    alert(`${SCRIPT_NAME} finished.\n\nUnfollowed: ${success}\nFailed: ${failures.length}`);
  }

  GM_registerMenuCommand('Run Pixiv Inactive Cleaner', () => {
    run().catch(err => {
      logger.error('Fatal error:', err);
      alert(`${SCRIPT_NAME} error:\n\n${err.message || err}`);
    });
  });
})();
