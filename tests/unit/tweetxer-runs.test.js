import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachExportFile,
  bookmarksInstructions,
  cleanupTweetXer,
  downloadedBlob,
  errorText,
  fixedText,
  infoText,
  installFollowing,
  installProfile,
  installTimeline,
  jsonResponse,
  loadTweetXer,
  mockFetch,
  promptText,
  pump,
  setSessionCookie,
  setSkipCount,
  startReady,
  tweetHeadersEntries,
  ytdFile
} from '../helpers/tweetxer-harness.js';

const runFile = async (tx, ids) => {
  await startReady(tx);
  setSkipCount('0');
  attachExportFile(ytdFile('tweet_headers', tweetHeadersEntries(ids)));
};

describe('TweetXer deletion runs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('counts successful deletions', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1', 'id-2']);
    await pump(() => infoText().startsWith('2 deleted'));

    expect(fetchMock.calls).toHaveLength(2);
    expect(document.getElementById('progressbar')).not.toBeNull();
  });

  it('retries a Tweet when the API answers 200 with GraphQL errors', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([
      jsonResponse({ errors: [{ message: 'oops' }] }),
      jsonResponse({}),
      jsonResponse({})
    ]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1', 'id-2']);
    await pump(() => infoText().startsWith('2 deleted'), 30000);

    expect(fetchMock.calls.map(call => JSON.parse(call.options.body).variables.tweet_id))
      .toEqual(['id-2', 'id-1', 'id-2']);
  });

  it('waits out a 429 and retries the same Tweet', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([
      jsonResponse({}, { status: 429, headers: { 'retry-after': '2' } }),
      jsonResponse({})
    ]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1']);
    await pump(() => fetchMock.calls.length === 1);
    await pump(() => fixedText().includes('Ratelimited. Waiting'), 30000);
    await pump(() => infoText().startsWith('1 deleted'), 30000);

    expect(fetchMock.calls).toHaveLength(2);
    expect(fixedText()).toContain('1 deleted');
  });

  it('stops the run after consecutive failures', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch(Array.from({ length: 6 }, () => jsonResponse({}, { status: 500 })));
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1', 'id-2']);
    await pump(() => errorText().includes('Stopping after 5 consecutive failures'), 120000);

    expect(fetchMock.calls).toHaveLength(5);
    expect(errorText()).toContain('Stopping after 5 consecutive failures');
    expect(promptText()).toContain('Stopping after 5 consecutive failures');
  });

  it('stops immediately on 401', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([jsonResponse({}, { status: 401 })]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1', 'id-2']);
    await pump(() => fetchMock.calls.length === 1);
    // the loop must have exited: more fake time must not produce another request
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock.calls).toHaveLength(1);
    // the file input is removed once a file is processed; the slow-delete
    // button proves the run guard was released
    expect(document.getElementById('slowDelete').disabled).toBe(false);
  });

  it('retries transport errors instead of dropping the Tweet', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([new TypeError('failed to fetch'), jsonResponse({})]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1']);
    await pump(() => infoText().startsWith('1 deleted'), 30000);

    expect(fetchMock.calls).toHaveLength(2);
  });

  it('retries request timeouts', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([
      new DOMException('The operation was aborted', 'TimeoutError'),
      jsonResponse({})
    ]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1']);
    await pump(() => infoText().startsWith('1 deleted'), 30000);

    expect(fetchMock.calls).toHaveLength(2);
  });

  it('gives up on an item after its retry budget and says so', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch(Array.from({ length: 4 }, () => jsonResponse({ errors: [{ message: 'x' }] })));
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1']);
    await pump(() => infoText().includes('Gave up on 1 item'), 30000);

    expect(fetchMock.calls).toHaveLength(4);
    expect(infoText()).toContain('Gave up on 1 item');
  });

  it('honors x-rate-limit headers on successful responses', async () => {
    installProfile();
    setSessionCookie();
    const reset = String(Math.floor(Date.now() / 1000) + 3);
    const fetchMock = mockFetch([
      jsonResponse({}, { headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': reset } }),
      jsonResponse({})
    ]);
    const tx = await loadTweetXer();

    await runFile(tx, ['id-1', 'id-2']);
    await pump(() => infoText().startsWith('2 deleted'), 30000);

    expect(fetchMock.calls).toHaveLength(2);
  });
});

describe('TweetXer slow delete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('deletes own Tweets and Retweets, skips others, and verifies removal', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();
    await startReady(tx);

    installTimeline({
      tweets: [
        { id: 'own-1', own: true },
        { id: 'rt-1', own: true, retweet: true },
        { id: 'other-1', own: false },
        { id: 'own-2', own: true }
      ]
    });

    document.getElementById('slowDelete').click();
    await pump(() => infoText().includes('skipped'), 60000);

    expect(document.querySelectorAll('[data-testid="tweet"]')).toHaveLength(0);
    expect(infoText()).toContain('3 deleted, 1 skipped');
    expect(window.location.pathname).toBe('/testuser/with_replies');
    expect(document.getElementById('start')).toBeNull();
    expect(fetchMock.calls).toHaveLength(0);
  });

  it('can target the Posts tab only', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();
    await startReady(tx);

    window.history.replaceState({}, '', '/testuser/with_replies');
    document.getElementById('slowDeleteReplies').checked = false;
    document.getElementById('slowDelete').click();
    await pump(() => infoText().includes('skipped'), 60000);

    expect(window.location.pathname).toBe('/testuser');
  });

  it('reports missing profile tabs without crashing', async () => {
    installProfile({ tabs: false });
    setSessionCookie();
    const tx = await loadTweetXer();
    await startReady(tx);

    document.getElementById('slowDelete').click();
    await pump(() => infoText().includes('Could not find the profile tabs'), 10000);

    expect(document.getElementById('exportUpload_file').disabled).toBe(false);
  });
});

describe('TweetXer unfollow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('unfollows every account that offers an unfollow button', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();
    await startReady(tx);

    installFollowing({ accounts: [{ own: true }, {}, {}] });
    document.getElementById('unfollowEveryone').click();
    await pump(() => document.querySelectorAll('[data-testid="UserCell"]').length === 1, 10000);

    const remaining = [...document.querySelectorAll('[data-testid="UserCell"]')].map(cell => cell.dataset.cid);
    expect(remaining).toEqual(['0']);
  });

  it('reports a missing Following link instead of crashing', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();
    await startReady(tx);

    document.getElementById('unfollowEveryone').click();
    await pump(() => infoText().includes('Could not find the Following link'), 10000);

    expect(document.getElementById('exportUpload_file').disabled).toBe(false);
  });
});

describe('TweetXer bookmark export', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('paginates with cursors and stops on a repeated cursor', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch([
      jsonResponse(bookmarksInstructions(['b-1', 'b-2'], 'C1')),
      jsonResponse(bookmarksInstructions(['b-3'], 'C1'))
    ]);
    const tx = await loadTweetXer();

    await startReady(tx);
    document.getElementById('exportBookmarks').click();
    await pump(() => infoText().includes('3 bookmarks exported'), 10000);

    expect(fetchMock.calls).toHaveLength(2);
    expect(fetchMock.calls[0].url).toContain('/Bookmarks?');
    expect(fetchMock.calls[1].url).toContain('%22cursor%22%3A%22C1%22');
    const downloaded = await downloadedBlob().text();
    expect(downloaded).toContain('b-1');
    expect(downloaded).toContain('b-3');
    expect(document.getElementById('bookmarksDownload')).not.toBeNull();
  });

  it('reports auth errors during export', async () => {
    installProfile();
    setSessionCookie();
    mockFetch([jsonResponse({}, { status: 401 })]);
    const tx = await loadTweetXer();

    await startReady(tx);
    document.getElementById('exportBookmarks').click();
    await pump(() => infoText().includes('Auth error (401)'), 10000);

    expect(document.getElementById('bookmarksDownload')).toBeNull();
  });

  it('reports when no bookmarks could be exported instead of looping forever', async () => {
    installProfile();
    setSessionCookie();
    mockFetch([jsonResponse(bookmarksInstructions([]))]);
    const tx = await loadTweetXer();

    await startReady(tx);
    document.getElementById('exportBookmarks').click();
    await pump(() => infoText().includes('No bookmarks could be exported'), 10000);

    expect(document.getElementById('bookmarksDownload')).toBeNull();
  });

  it('waits out rate limits while exporting', async () => {
    installProfile();
    setSessionCookie();
    const reset = String(Math.floor(Date.now() / 1000) + 2);
    mockFetch([
      jsonResponse(bookmarksInstructions(['b-1'], 'C1'), { headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': reset } }),
      jsonResponse(bookmarksInstructions(['b-2']))
    ]);
    const tx = await loadTweetXer();

    await startReady(tx);
    document.getElementById('exportBookmarks').click();
    await pump(() => infoText().includes('2 bookmarks exported'), 10000);

    expect(document.getElementById('bookmarksDownload')).not.toBeNull();
  });
});
