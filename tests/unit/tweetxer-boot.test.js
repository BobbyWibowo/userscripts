import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTweetXer,
  installProfile,
  loadTweetXer,
  pump,
  setSessionCookie,
  startReady
} from '../helpers/tweetxer-harness.js';

describe('TweetXer boot and init', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupTweetXer();
    vi.useRealTimers();
  });

  it('registers Start/Stop menu commands and shows an idle prompt at boot', async () => {
    installProfile();
    const tx = await loadTweetXer();

    expect(tx.commands()).toEqual(['Start TweetXer', 'Stop TweetXer']);
    const prompt = document.getElementById('tweetsXer_prompt');
    expect(prompt).not.toBeNull();
    expect(prompt.textContent).toContain('installed but idle');
  });

  it('explains that a userscript manager is required when menu commands are unavailable', async () => {
    installProfile();
    await loadTweetXer({ manager: false });

    const prompt = document.getElementById('tweetsXer_prompt');
    expect(prompt).not.toBeNull();
    expect(prompt.textContent).toContain('userscript manager');
  });

  it('builds the banner and enables its controls once the Tweet count is read', async () => {
    installProfile({ tweetCount: '1,234' });
    setSessionCookie();
    const tx = await loadTweetXer();

    await startReady(tx);

    expect(document.getElementById('exportUpload')).not.toBeNull();
    expect(document.getElementById('exportUpload_file').disabled).toBe(false);
    expect(document.getElementById('slowDelete').disabled).toBe(false);
    expect(document.getElementById('exportBookmarks').disabled).toBe(false);
    expect(document.getElementById('unfollowEveryone').disabled).toBe(false);
    expect(document.getElementById('info').textContent).toContain('Select your tweet-headers.js');
  });

  it('refuses to start when not on own profile', async () => {
    document.body.innerHTML = '<header></header>';
    setSessionCookie();
    const tx = await loadTweetXer();

    tx.start();
    await pump(() => document.getElementById('tweetsXer_prompt').textContent.includes('own profile'), 20000);

    expect(document.getElementById('exportUpload')).toBeNull();
  });

  it('refuses to start without a ct0 session cookie', async () => {
    installProfile();
    const tx = await loadTweetXer();

    tx.start();
    await pump(() => document.getElementById('tweetsXer_prompt').textContent.includes('ct0'));

    expect(document.getElementById('exportUpload')).toBeNull();
  });

  it('ignores a second Start while the banner is already open', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();

    await startReady(tx);
    tx.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(document.querySelectorAll('#exportUpload')).toHaveLength(1);
  });

  it('ignores a concurrent double Start', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();

    tx.start();
    tx.start();
    await pump(() => {
      const input = document.getElementById('exportUpload_file');
      return Boolean(input) && !input.disabled;
    });

    expect(document.querySelectorAll('#exportUpload')).toHaveLength(1);
  });

  it('Stop removes the banner and reports the stop', async () => {
    installProfile();
    setSessionCookie();
    const tx = await loadTweetXer();

    await startReady(tx);
    tx.stop();

    expect(document.getElementById('exportUpload')).toBeNull();
    expect(document.getElementById('tweetsXer_prompt').textContent).toContain('TweetXer stopped.');
  });
});
