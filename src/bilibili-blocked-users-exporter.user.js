// ==UserScript==
// @name         Bilibili Blocked Users Exporter
// @namespace    https://github.com/BobbyWibowo
// @version      0.1.1
// @description  Export your Bilibili blocked-user list with follower counts, profile URLs, a CSV file, and a console table.
// @author       Bobby Wibowo
// @license      MIT
// @match        https://bilibili.com/*
// @match        https://*.bilibili.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bilibili.com
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @noframes
// ==/UserScript==

/**
 * What it does
 * - Reads the logged-in account's Bilibili blocked-user list.
 * - Reads each blocked user's follower count.
 * - Prints a console.table with username, MID, follower count, and direct profile URL.
 * - Prints direct profile URLs as clickable console links where the browser console supports them.
 * - Downloads a UTF-8 CSV with a BOM for spreadsheet compatibility.
 *
 * How to use
 * 1. Install the .user.js file in Tampermonkey, Violentmonkey, or another manager that supports
 *    GM_registerMenuCommand and GM_xmlhttpRequest.
 * 2. Open any matched bilibili.com page and make sure you are logged in.
 * 3. Open the userscript manager's menu and choose:
 *    "Start blocked-list export (CSV + console)"
 * 4. Keep that page open until the CSV download starts. The time required depends on the size of
 *    the blocklist because requests are intentionally sent one at a time with a minimum interval.
 *    It's recommended to have your Browser Console opened, and Info messages enabled,
 *    to be able to properly monitor its progress.
 * 5. To cancel, reload/navigate away from the page or use the manager's
 *    "Stop blocked-list export" command.
 *
 * Rate-limit behavior
 * - Requests are serialized; no parallel API requests are made.
 * - A minimum 2-second interval (plus small jitter) is maintained between request starts.
 * - HTTP 412/429 and Bilibili rate-limit/risk-control codes (-352, -412, -509, -799) are retried
 *   indefinitely with exponential backoff, capped at 15 minutes per wait.
 * - Retry-After is honored when present. The retry wait also includes a small positive jitter.
 * - Network timeouts/errors and temporary server errors are also retried with backoff.
 * - Authentication errors and other non-rate-limit errors are not retried forever.
 *
 * Notes
 * - No request is sent until the Start menu command is selected.
 * - You must be logged in to Bilibili to read your own blocked list.
 * - If a particular user's follower count cannot be retrieved, that CSV field is left blank and the
 *   script continues with the remaining users.
 * - The CSV contains plain profile URLs in the profile_url column. Spreadsheet apps may recognize
 *   these URLs as links when opened.
 * - The script does not modify your blocklist or any account data.
 */

(() => {
  'use strict';

  const API_BASE = 'https://api.bilibili.com';
  const PAGE_SIZE = 50;
  const MIN_REQUEST_INTERVAL_MS = 2000;
  const REQUEST_JITTER_MS = 350;
  const INITIAL_RETRY_BACKOFF_MS = 30_000;
  const MAX_RETRY_BACKOFF_MS = 15 * 60_000;
  const REQUEST_TIMEOUT_MS = 45_000;
  const RATE_LIMIT_CODES = new Set([-352, -412, -509, -799, 412, 429]);

  const state = {
    running: false,
    runId: 0,
    currentRequest: null,
    lastRequestStartedAt: 0,
    pendingTimers: new Set(),
  };

  class CancelledError extends Error {
    constructor () {
      super('Export cancelled.');
      this.name = 'CancelledError';
    }
  }

  class FatalError extends Error {
    constructor (message) {
      super(message);
      this.name = 'FatalError';
    }
  }

  class TransientError extends Error {
    constructor (message, responseHeaders = '') {
      super(message);
      this.name = 'TransientError';
      this.responseHeaders = responseHeaders;
    }
  }

  function isActive (runId) {
    return state.running && state.runId === runId;
  }

  function assertActive (runId) {
    if (!isActive(runId)) throw new CancelledError();
  }

  function sleep (ms, runId) {
    return new Promise((resolve, reject) => {
      if (!isActive(runId)) {
        reject(new CancelledError());
        return;
      }

      const entry = { timer: null, reject };
      entry.timer = setTimeout(() => {
        state.pendingTimers.delete(entry);
        if (isActive(runId)) resolve();
        else reject(new CancelledError());
      }, ms);
      state.pendingTimers.add(entry);
    });
  }

  function stopExport ({ quiet = false } = {}) {
    if (!state.running) {
      if (!quiet) console.info('[Bilibili Export] No export is currently running.');
      return;
    }

    state.running = false;
    state.runId += 1;

    for (const entry of state.pendingTimers) {
      clearTimeout(entry.timer);
      entry.reject(new CancelledError());
    }
    state.pendingTimers.clear();

    const request = state.currentRequest;
    state.currentRequest = null;
    if (request && typeof request.abort === 'function') {
      try { request.abort(); } catch (_) { /* The request may already have completed. */ }
    }

    if (!quiet) console.warn('[Bilibili Export] Cancellation requested.');
  }

  function waitForRequestSlot (runId) {
    assertActive(runId);
    if (state.lastRequestStartedAt === 0) return Promise.resolve();

    const targetInterval = MIN_REQUEST_INTERVAL_MS + Math.floor(Math.random() * REQUEST_JITTER_MS);
    const elapsed = Date.now() - state.lastRequestStartedAt;
    const waitMs = Math.max(0, targetInterval - elapsed);
    return waitMs > 0 ? sleep(waitMs, runId) : Promise.resolve();
  }

  function gmGet (url, runId) {
    return new Promise((resolve, reject) => {
      assertActive(runId);
      let handle;
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (state.currentRequest === handle) state.currentRequest = null;
        callback(value);
      };

      try {
        handle = GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: REQUEST_TIMEOUT_MS,
          responseType: 'text',
          withCredentials: true,
          anonymous: false,
          headers: {
            Accept: 'application/json, text/plain, */*',
          },
          onload: response => finish(resolve, response),
          onerror: () => finish(reject, new TransientError('Network error while contacting Bilibili.')),
          ontimeout: () => finish(reject, new TransientError('Bilibili request timed out.')),
          onabort: () => finish(reject, new CancelledError()),
        });
        state.currentRequest = handle;
        if (!isActive(runId) && handle && typeof handle.abort === 'function') handle.abort();
      } catch (error) {
        finish(reject, new TransientError(`Could not start request: ${error.message || error}`));
      }
    });
  }

  function parseRetryAfter (headers) {
    if (!headers) return 0;
    const match = String(headers).match(/^retry-after\s*:\s*(.+?)\s*$/im);
    if (!match) return 0;

    const value = match[1].trim();
    if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Number(value) * 1000);

    const targetTime = Date.parse(value);
    return Number.isFinite(targetTime) ? Math.max(0, targetTime - Date.now()) : 0;
  }

  function isRateLimited (status, json) {
    return status === 412 || status === 429 || RATE_LIMIT_CODES.has(Number(json && json.code));
  }

  function formatDuration (ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  async function waitBeforeRetry (runId, retryNumber, reason, retryAfterMs = 0) {
    const exponent = Math.min(retryNumber, 10);
    const exponentialDelay = Math.min(
      INITIAL_RETRY_BACKOFF_MS * (2 ** exponent),
      MAX_RETRY_BACKOFF_MS
    );
    const delayMs = Math.max(exponentialDelay, retryAfterMs) + Math.floor(Math.random() * 5000);
    console.warn(
      `[Bilibili Export] ${reason}. Retrying the same request in ${formatDuration(delayMs)} ` +
      `(retry ${retryNumber + 1}; retrying indefinitely until it succeeds or you cancel).`
    );
    await sleep(delayMs, runId);
  }

  async function apiGet (url, runId) {
    let retryNumber = 0;

    while (true) {
      assertActive(runId);
      await waitForRequestSlot(runId);
      assertActive(runId);
      state.lastRequestStartedAt = Date.now();

      let response;
      try {
        response = await gmGet(url, runId);
      } catch (error) {
        if (error instanceof CancelledError) throw error;
        await waitBeforeRetry(runId, retryNumber++, error.message || 'Transient network error');
        continue;
      }

      assertActive(runId);
      const status = Number(response.status || 0);
      let json = null;
      try {
        json = JSON.parse(response.responseText || response.response || '');
      } catch (_) {
        // Non-JSON responses can be transient anti-bot or gateway pages. Retry cautiously.
      }

      if (isRateLimited(status, json)) {
        const code = json && json.code !== undefined ? `API code ${json.code}` : `HTTP ${status}`;
        const message = json && json.message ? `: ${json.message}` : '';
        await waitBeforeRetry(
          runId,
          retryNumber++,
          `Bilibili rate limit / risk control (${code}${message})`,
          parseRetryAfter(response.responseHeaders)
        );
        continue;
      }

      if (status >= 500 || status === 0) {
        await waitBeforeRetry(runId, retryNumber++, `Temporary server response (HTTP ${status})`, parseRetryAfter(response.responseHeaders));
        continue;
      }

      if (status < 200 || status >= 300) {
        throw new FatalError(`Bilibili returned HTTP ${status}. Check the page session and try again later.`);
      }

      if (!json || typeof json !== 'object') {
        await waitBeforeRetry(runId, retryNumber++, 'Bilibili returned a non-JSON response (possibly a temporary challenge)');
        continue;
      }

      return json;
    }
  }

  function assertApiSuccess (json, context) {
    const code = Number(json && json.code);
    if (code === 0) return;
    if (code === -101) {
      throw new FatalError('Bilibili reports that you are not logged in. Log in to Bilibili, reload the page, and start the export again.');
    }
    const message = json && json.message ? String(json.message) : 'no error message supplied';
    throw new FatalError(`${context} failed with API code ${code}: ${message}`);
  }

  async function fetchBlockedUsers (runId) {
    const collected = [];
    const seenMids = new Set();
    let expectedTotal = null;
    let page = 1;

    while (true) {
      assertActive(runId);
      const url = `${API_BASE}/x/relation/blacks?pn=${page}&ps=${PAGE_SIZE}`;
      const json = await apiGet(url, runId);
      assertApiSuccess(json, `Fetching blocked-list page ${page}`);

      const data = json.data || {};
      if (!Array.isArray(data.list)) {
        throw new FatalError(`Blocked-list page ${page} did not contain a valid list. The API response format may have changed.`);
      }

      const totalValue = Number(data.total);
      if (Number.isFinite(totalValue) && totalValue >= 0) expectedTotal = totalValue;

      let newOnPage = 0;
      for (const item of data.list) {
        const midValue = item && (item.mid ?? item.mid_str);
        if (midValue === undefined || midValue === null || String(midValue).trim() === '') continue;
        const mid = String(midValue);
        if (seenMids.has(mid)) continue;
        seenMids.add(mid);
        newOnPage += 1;
        collected.push({
          mid,
          username: String((item && (item.uname || item.name)) || ''),
          followerCount: null,
          profileUrl: `https://space.bilibili.com/${encodeURIComponent(mid)}`,
        });
      }

      console.info(
        `[Bilibili Export] Blocklist page ${page}: ${data.list.length} entries; ` +
        `${collected.length}${expectedTotal === null ? '' : ` / ${expectedTotal}`} unique users collected.`
      );

      if (data.list.length === 0) break;
      if (expectedTotal !== null && collected.length >= expectedTotal) break;
      if (data.list.length < PAGE_SIZE) break;
      if (newOnPage === 0) {
        console.warn('[Bilibili Export] Pagination returned no new user IDs; stopping to avoid looping on a repeated page.');
        break;
      }
      page += 1;
    }

    if (expectedTotal !== null && collected.length < expectedTotal) {
      console.warn(
        `[Bilibili Export] The API reported ${expectedTotal} blocked users, but ${collected.length} unique users were collected. ` +
        'The export will include the entries available in the response.'
      );
    }

    return collected;
  }

  async function fetchFollowerCount (mid, runId) {
    const url = `${API_BASE}/x/relation/stat?vmid=${encodeURIComponent(mid)}`;
    const json = await apiGet(url, runId);
    const code = Number(json && json.code);

    if (code === -101) {
      throw new FatalError('Bilibili reports that you are not logged in. Log in to Bilibili, reload the page, and start the export again.');
    }
    if (code !== 0) {
      const message = json && json.message ? String(json.message) : 'no error message supplied';
      console.warn(`[Bilibili Export] Could not read follower count for MID ${mid}: API code ${code} (${message}).`);
      return null;
    }

    const value = Number(json && json.data && json.data.follower);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function csvCell (value) {
    let text = value === null || value === undefined ? '' : String(value);
    // Prefix spreadsheet formula-like values to reduce CSV formula-injection risk.
    if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function makeCsv (rows) {
    const delimiter = ';';
    const header = ['mid', 'username', 'follower_count', 'profile_url'];
    const lines = [header.map(csvCell).join(delimiter)];
    for (const row of rows) {
      lines.push([
        row.mid,
        row.username,
        row.followerCount === null ? '' : row.followerCount,
        row.profileUrl,
      ].map(csvCell).join(delimiter));
    }
    // Use the regional Excel-friendly separator directly instead of the Excel-only
    // "sep=," directive, which can interfere with CSV encoding detection.
    return lines.join('\r\n');
  }

  // UTF-8 with BOM preserves Chinese and other Unicode text in Excel. Avoid the
  // "sep=," directive because some Excel versions mishandle encoding when it is present.
  function encodeCsvForExcel (text) {
    const encoded = new TextEncoder().encode(text);
    const bytes = new Uint8Array(3 + encoded.length);
    bytes.set([0xEF, 0xBB, 0xBF], 0);
    bytes.set(encoded, 3);
    return bytes;
  }

  function timestampForFilename (date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  function downloadCsv (rows) {
    const blob = new Blob([encodeCsvForExcel(makeCsv(rows))], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `bilibili-blocked-users-${timestampForFilename()}.csv`;
    anchor.style.display = 'none';
    (document.body || document.documentElement).appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function logResultsTable (rows) {
    const tableRows = rows.map(row => ({
      username: row.username,
      mid: row.mid,
      follower_count: row.followerCount === null ? '' : row.followerCount,
      profile_url: row.profileUrl,
    }));

    console.group('[Bilibili Export] Results');
    console.info(`Completed: ${rows.length} blocked users.`);
    console.table(tableRows);
    console.groupCollapsed('Direct profile links');
    for (const row of rows) {
      console.log(`${row.username || '(unnamed)'} (MID ${row.mid})`, row.profileUrl);
    }
    console.groupEnd();
    console.groupEnd();
  }

  async function runExport (runId) {
    console.group('[Bilibili Export] Blocked-list export');
    console.info('Started manually from the userscript manager. Requests will be sent sequentially and slowly.');
    console.info('Reload the page or use the userscript manager Stop command to cancel.');

    try {
      const rows = await fetchBlockedUsers(runId);
      assertActive(runId);
      console.info(`[Bilibili Export] Fetching follower counts for ${rows.length} blocked users.`);

      let processed = 0;
      let failures = 0;
      for (const row of rows) {
        assertActive(runId);
        try {
          console.info(`[Bilibili Export] Fetching follower counts for MID ${row.mid}.`);
          row.followerCount = await fetchFollowerCount(row.mid, runId);
          if (row.followerCount === null) failures += 1;
        } catch (error) {
          if (error instanceof CancelledError || error instanceof FatalError) throw error;
          failures += 1;
          console.warn(`[Bilibili Export] Follower count failed for MID ${row.mid}: ${error.message || error}`);
        }

        processed += 1;
        if (processed % 25 === 0 || processed === rows.length) {
          console.info(`[Bilibili Export] Follower counts processed: ${processed}/${rows.length}; unavailable: ${failures}.`);
        }
      }

      assertActive(runId);
      logResultsTable(rows);
      downloadCsv(rows);
      console.info(`[Bilibili Export] CSV download started. ${failures} follower count(s) were unavailable.`);
    } catch (error) {
      if (error instanceof CancelledError) {
        console.info('[Bilibili Export] Cancelled. No CSV was generated.');
      } else {
        console.error(`[Bilibili Export] Stopped: ${error.message || error}`);
      }
    } finally {
      console.groupEnd();
      if (state.runId === runId) state.running = false;
    }
  }

  function startExport () {
    if (state.running) {
      console.warn('[Bilibili Export] An export is already running.');
      return;
    }

    state.running = true;
    const runId = ++state.runId;
    runExport(runId);
  }

  GM_registerMenuCommand('Start blocked-list export (CSV + console)', startExport);
  GM_registerMenuCommand('Stop blocked-list export', () => stopExport());

  window.addEventListener('pagehide', () => stopExport({ quiet: true }), { once: true });
})();
