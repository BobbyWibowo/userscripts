import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupPixivUtils, loadFixture, loadPixivUtils } from '../helpers/pixiv-utils-harness.js';

describe('pixiv-utils toast manager', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupPixivUtils();
  });

  /** Visible toast texts, in stack order (oldest/top first). */
  const toastMessages = () =>
    [...document.querySelectorAll('.pixiv-utils-toast')].map(element => element.textContent);

  // Toasts are only reachable through real entry points (menu commands); the
  // script's fixed durations are driven with fake timers instead of waiting.
  const fireMenuCommand = (pixiv, markers) => {
    const list = Array.isArray(markers) ? markers : [markers];
    const command = pixiv.menuCommands.find(entry => list.some(marker => entry.label.includes(marker)));
    if (!command) throw new Error(`Menu command not registered: ${list.join(' or ')}`);
    command.onClick();
  };

  it('shows a toast from a menu command and expires it naturally', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    vi.useFakeTimers();

    // The blocked-items toggle registers under 👁️ and re-registers under 🙈.
    fireMenuCommand(pixiv, ['\u{1F441}', '\u{1F648}']);

    const toast = document.querySelector('.pixiv-utils-toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).not.toBe('');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.classList.contains('pixiv-utils-toast-primary')).toBe(true);
    expect(toast.parentElement.classList.contains('pixiv-utils-toast-stack')).toBe(true);

    // The toast keeps its slot while the exit runs...
    await vi.advanceTimersByTimeAsync(2500);
    expect(document.querySelectorAll('.pixiv-utils-toast.is-exiting')).toHaveLength(1);

    // ...and is removed once the exit completes (fallback path under jsdom).
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelectorAll('.pixiv-utils-toast')).toHaveLength(0);
  });

  it('caps the visible stack at three and promotes queued toasts in FIFO order', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    vi.useFakeTimers();

    fireMenuCommand(pixiv, '🧹'); // caches #1
    fireMenuCommand(pixiv, ['\u{1F441}', '\u{1F648}']); // toggle #1
    fireMenuCommand(pixiv, '🧹'); // caches #2
    fireMenuCommand(pixiv, ['\u{1F441}', '\u{1F648}']); // toggle #2 (queued)
    fireMenuCommand(pixiv, '🧹'); // caches #3 (queued)

    const initial = toastMessages();
    expect(initial).toHaveLength(3);
    expect(initial[0]).toBe(initial[2]); // the caches text repeats
    expect(initial[1]).not.toBe(initial[0]);

    // All three visible toasts share an expiry; their exits keep occupying
    // the slots until the fallback completes.
    await vi.advanceTimersByTimeAsync(2500);
    expect(document.querySelectorAll('.pixiv-utils-toast.is-exiting')).toHaveLength(3);

    // The queue then promotes in request order: the queued caches toast
    // (requested last) ends up last, not first.
    await vi.advanceTimersByTimeAsync(250);
    const promoted = toastMessages();
    expect(promoted).toHaveLength(2);
    expect(promoted[1]).toBe(initial[0]);
    expect(promoted[0]).not.toBe(initial[0]);
  });

  it('gives a queued toast its full duration after promotion', async () => {
    const pixiv = await loadPixivUtils({ settings: { SETTINGS_LANGUAGE: 'en' } });
    vi.useFakeTimers();

    fireMenuCommand(pixiv, ['\u{1F441}', '\u{1F648}']); // toggle #1
    fireMenuCommand(pixiv, '🧹'); // caches #1
    fireMenuCommand(pixiv, ['\u{1F441}', '\u{1F648}']); // toggle #2
    fireMenuCommand(pixiv, '🧹'); // caches #2 (queued)
    expect(toastMessages()).toHaveLength(3);

    // The three visible toasts expire together and hold their slots...
    await vi.advanceTimersByTimeAsync(2500);
    expect(document.querySelectorAll('.pixiv-utils-toast.is-exiting')).toHaveLength(3);

    // ...then the queued toast is promoted and its timer starts now.
    await vi.advanceTimersByTimeAsync(250);
    expect(toastMessages()).toHaveLength(1);

    // Full duration from promotion: still on screen at +2400ms (a timer
    // started at request time would have expired it long before).
    await vi.advanceTimersByTimeAsync(2400);
    expect(toastMessages()).toHaveLength(1);

    // ...and gone once its own duration has elapsed.
    await vi.advanceTimersByTimeAsync(450);
    expect(toastMessages()).toHaveLength(0);
  });
});
