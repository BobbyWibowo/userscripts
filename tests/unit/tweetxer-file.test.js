import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachExportFile,
  cleanupTweetXer,
  dmHeaderEntries,
  errorText,
  fixedText,
  infoText,
  installProfile,
  likeEntries,
  loadTweetXer,
  mockFetch,
  promptText,
  pump,
  setSessionCookie,
  setSkipCount,
  setSkipFromOldest,
  startReady,
  tweetHeadersEntries,
  tweetsEntries,
  ytdFile
} from '../helpers/tweetxer-harness.js';

const startWithFile = async (tx, content, setup) => {
  await startReady(tx);
  setup?.();
  attachExportFile(content);
};

const firstDeletedId = async fetchMock => {
  await pump(() => fetchMock.calls.length === 1);
  return JSON.parse(fetchMock.calls[0].options.body).variables.tweet_id;
};

describe('TweetXer data-export file processing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('processes tweet_headers.part0 and deletes oldest-first via DeleteTweet', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries(['id-1', 'id-2'])));

    await pump(() => infoText().startsWith('2 deleted'));

    expect(fetchMock.calls[0].url).toContain('/DeleteTweet');
    expect(fetchMock.calls.map(call => JSON.parse(call.options.body).variables.tweet_id))
      .toEqual(['id-2', 'id-1']);
    expect(document.getElementById('tweetsXer_title').textContent).toContain('Deleting 2 Tweets');
    expect(document.getElementById('exportUpload_file')).toBeNull();
    expect(document.getElementById('progressbar')).not.toBeNull();
  });

  it('processes tweets.part0 (id_str format)', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('tweets', tweetsEntries(['id-1'])));

    await pump(() => infoText().startsWith('1 deleted'));

    expect(JSON.parse(fetchMock.calls[0].options.body).variables.tweet_id).toBe('id-1');
  });

  it('processes like.part0 and unfavorites via UnfavoriteTweet', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('like', likeEntries(['id-1', 'id-2'])));

    await pump(() => infoText().startsWith('2 deleted'));

    expect(fetchMock.calls[0].url).toContain('/UnfavoriteTweet');
    expect(fetchMock.calls.map(call => JSON.parse(call.options.body).variables.tweet_id))
      .toEqual(['id-2', 'id-1']);
  });

  it('processes direct_message_headers and deletes conversations via the DM endpoint', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('direct_message_headers', dmHeaderEntries(['1-2', '3-4'])));

    await pump(() => infoText().startsWith('2 deleted'));

    expect(fetchMock.calls.map(call => call.url)).toEqual([
      expect.stringContaining('/dm/conversation/3-4/delete.json'),
      expect.stringContaining('/dm/conversation/1-2/delete.json')
    ]);
    expect(fetchMock.calls[0].options.headers['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('reports unrecognized file content inline and in the prompt', async () => {
    installProfile();
    setSessionCookie();
    mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, 'window.YTD.unknown.part0 = []');

    await pump(() => errorText().length > 0);

    expect(errorText()).toContain('File content not recognized');
    expect(promptText()).toContain('TweetXer: File content not recognized');
    expect(document.getElementById('progressbar')).toBeNull();
  });

  it('reports a file with no entries', async () => {
    installProfile();
    setSessionCookie();
    mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries([])));

    await pump(() => errorText().length > 0);

    expect(errorText()).toContain('No entries found');
  });

  it('reports a file that is not valid JSON', async () => {
    installProfile();
    setSessionCookie();
    mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, 'window.YTD.tweet_headers.part0 = [{');

    await pump(() => errorText().length > 0);

    expect(errorText()).toContain('Could not process file');
  });

  it('auto-skips already-deleted Tweets using the profile count (12.3K parses as 12300)', async () => {
    installProfile({ tweetCount: '12.3K' });
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    const ids = Array.from({ length: 13000 }, (_, index) => `id-${index}`);
    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries(ids)));

    // 13000 exported - 12300 on profile - 5% tolerance = 50 oldest skipped,
    // so the first deletion is id-12949 (export is newest-first, pop() takes the oldest)
    expect(await firstDeletedId(fetchMock)).toBe('id-12949');
    expect(document.getElementById('tweetsXer_title').textContent).toContain('Deleting 13000 Tweets');
    tx.stop();
  });

  it('falls back to the TopNavBar count when the primary column has none', async () => {
    installProfile({ tweetCount: null });
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    const ids = Array.from({ length: 1100 }, (_, index) => `id-${index}`);
    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries(ids)));

    // 1100 - 999 - 55 = 46 oldest skipped
    expect(await firstDeletedId(fetchMock)).toBe('id-1053');
    tx.stop();
  });

  it('falls back to 1,000,000 and disables auto-skip when the count is unreadable', async () => {
    installProfile({ tweetCount: null, navCount: null });
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startReady(tx);
    expect(infoText()).toContain('could not be read');

    const ids = Array.from({ length: 10 }, (_, index) => `id-${index}`);
    attachExportFile(ytdFile('tweet_headers', tweetHeadersEntries(ids)));

    expect(await firstDeletedId(fetchMock)).toBe('id-9');
    tx.stop();
  });

  it('skips from the oldest end by default', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(
      tx,
      ytdFile('tweet_headers', tweetHeadersEntries(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])),
      () => setSkipCount('2')
    );

    expect(await firstDeletedId(fetchMock)).toBe('id-2');
    tx.stop();
  });

  it('skips from the newest end when the checkbox is unchecked', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(
      tx,
      ytdFile('tweet_headers', tweetHeadersEntries(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])),
      () => {
        setSkipCount('2');
        setSkipFromOldest(false);
      }
    );

    expect(await firstDeletedId(fetchMock)).toBe('id-4');
    tx.stop();
  });

  it('clamps an oversized skip count so nothing is deleted', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(
      tx,
      ytdFile('tweet_headers', tweetHeadersEntries(['id-1', 'id-2', 'id-3'])),
      () => setSkipCount('99999')
    );

    await pump(() => infoText().startsWith('3 deleted'));

    expect(fetchMock.calls).toHaveLength(0);
    expect(infoText()).toContain('3 deleted');
  });

  it('treats a non-numeric skip count as zero', async () => {
    installProfile();
    setSessionCookie();
    const fetchMock = mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(
      tx,
      ytdFile('tweet_headers', tweetHeadersEntries(['id-1', 'id-2', 'id-3'])),
      () => setSkipCount('abc')
    );

    await pump(() => infoText().startsWith('3 deleted'));

    expect(fetchMock.calls).toHaveLength(3);
  });

  it('mirrors the banner info text into the fixed progress bar (R2)', async () => {
    installProfile();
    setSessionCookie();
    mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries(['id-1', 'id-2'])));

    await pump(() => infoText().startsWith('2 deleted'));

    expect(fixedText()).toBe(infoText());
    expect(fixedText()).toContain('2 deleted');
  });

  it('never stacks fixed progress containers across runs (R1)', async () => {
    installProfile();
    setSessionCookie();
    mockFetch();
    const tx = await loadTweetXer();

    await startWithFile(tx, ytdFile('tweet_headers', tweetHeadersEntries(['id-1'])));
    await pump(() => infoText().startsWith('1 deleted'));

    // The first run's bar is still in the DOM; a slow delete must replace it.
    document.getElementById('slowDelete').click();
    await pump(() => infoText().includes('skipped'), 30000);

    expect(document.querySelectorAll('#exportUpload_progress')).toHaveLength(1);
    expect(document.querySelectorAll('#exportUpload_progress_slot')).toHaveLength(1);
    expect(document.querySelectorAll('#progressbar')).toHaveLength(1);
  });
});
