import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abortTimeouts,
  addCard,
  cleanup,
  dispatchReceived,
  dispatchRequested,
  fetchCalls,
  holdFetches,
  installPage,
  intersect,
  lastObserver,
  loadNoview,
  navigate,
  navigateStart,
  playerPayload,
  pump,
  pumpProcessed,
  receivedMetadata,
  releaseFetches,
  setResponder,
  vid
} from '../helpers/youtube-noview-harness.js';

const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;

const failResponder = () => ({ ok: false, status: 500, json: async () => ({}) });

const playerResponder = overrides => call => {
  const videoId = JSON.parse(call.options.body).videoId;
  return { ok: true, status: 200, json: async () => playerPayload(videoId, overrides) };
};

/**
 * Per-video view counts through the API — the only view-count source since
 * the old-design DOM parser was removed (2026-11-16). Unmapped ids fall back
 * to the harness default of '5000'.
 */
const viewsResponder = mapping => call => {
  const videoId = JSON.parse(call.options.body).videoId;
  return {
    ok: true,
    status: 200,
    json: async () => playerPayload(videoId, { viewCount: mapping[videoId] ?? '5000' })
  };
};

/** Flush trailing promise continuations without moving the fake clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('youtube-noview boot and config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers sentinel with the combined preset selectors and injects the core styles', async () => {
    const fx = await loadNoview();

    const handlers = fx.sentinelCalls();
    expect(handlers).toHaveLength(1);
    expect(handlers[0].selector).toContain('ytd-rich-item-renderer');
    expect(handlers[0].selector).toContain('ytd-player .ytp-suggestion-set');

    const styles = fx.styles();
    expect(styles[0]).toContain('data-noview_threshold_unmet');
    expect(styles[0]).toContain('display: none !important');
    // hide-processing style hangs off the URL-gate attribute on <html> and
    // embeds the video selectors (page gating is no longer a DOM selector).
    expect(styles[1]).toContain('html[data-noview_allowed_page]');
    expect(styles[1]).toContain(':is(');
  });

  it('extends the preset video selectors with a valid custom selector from storage (#5)', async () => {
    const fx = await loadNoview({ env: { SELECTORS_VIDEO: 'ytd-custom-card' } });

    expect(fx.styles()[1]).toContain('ytd-custom-card');
    expect(fx.styles()[1]).toContain('ytd-rich-item-renderer');
    expect(fx.sentinelCalls()[0].selector).toContain('ytd-custom-card');
  });

  it('falls back to presets when a custom selector from storage is invalid (#5)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fx = await loadNoview({ env: { SELECTORS_VIDEO: 'div[' } });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back to preset'),
      'div['
    );
    // Script must keep running: styles exist and cards still process.
    expect(fx.styles()[1]).toContain('ytd-rich-item-renderer');
    expect(fx.styles()[1]).not.toContain('div[');
    expect(fx.sentinelCalls()).toHaveLength(1);

    setResponder(viewsResponder({ [vid(1)]: '500' }));
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');
  });

  it('gates the "Hid video" log behind MODE: silent in PROD, logged in DEV (#9b)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loadNoview();
    setResponder(viewsResponder({ [vid(1)]: '500' }));
    const [prodCard] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => prodCard.dataset.noview_threshold_unmet === '999');
    expect(logSpy.mock.calls.some(c => String(c[0]).includes('Hid video'))).toBe(false);

    logSpy.mockClear();
    await loadNoview({ env: { MODE: 'DEV' } });
    setResponder(viewsResponder({ [vid(2)]: '500' }));
    const [devCard] = installPage({ cards: [{ href: watchUrl(vid(2)) }] });
    navigate();
    await pump(() => devCard.dataset.noview_threshold_unmet === '999');
    expect(logSpy.mock.calls.some(c => String(c[0]).includes('Hid video'))).toBe(true);
  });
});

describe('youtube-noview navigation and reconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('processes cards already in the DOM at yt-navigate-finish without sentinel (#1)', async () => {
    await loadNoview();
    setResponder(viewsResponder({ [vid(1)]: '500' }));
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    expect(card.dataset.noview_id).toBeUndefined();

    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');
    expect(card.dataset.noview_id).toBe(vid(1));
    expect(card.dataset.noview_views).toBe('500');
  });

  it('skips reconcile for cards that already carry data-noview_id (#1)', async () => {
    await loadNoview();
    setResponder(viewsResponder({ [vid(2)]: '500' }));
    const [done, fresh] = installPage({
      cards: [
        { href: watchUrl(vid(1)) },
        { href: watchUrl(vid(2)) }
      ]
    });
    done.dataset.noview_id = 'PRESET';

    navigate();
    await pump(() => fresh.dataset.noview_threshold_unmet === '999');
    await flush();

    expect(done.dataset.noview_id).toBe('PRESET');
    expect(done.dataset.noview_views).toBeUndefined();
  });

  it('creates the IntersectionObserver without the no-op delay option (#8)', async () => {
    await loadNoview();
    installPage({ cards: [] });
    navigate();

    const io = lastObserver();
    expect(io).toBeDefined();
    expect(io.options).toEqual({ threshold: 0 });
    expect(io.options.delay).toBeUndefined();
  });

  it('defers [hidden] cards to the IntersectionObserver and processes them on intersect (#9d)', async () => {
    await loadNoview();
    setResponder(viewsResponder({ [vid(1)]: '500', [vid(2)]: '500' }));
    const [visible, hidden] = installPage({
      cards: [
        { href: watchUrl(vid(1)) },
        { href: watchUrl(vid(2)), hidden: true }
      ]
    });

    navigate();
    await pump(() => visible.dataset.noview_views !== undefined);
    await flush();

    // Hidden card has no box → observed instead of eagerly processed.
    expect(hidden.dataset.noview_views).toBeUndefined();
    expect(lastObserver().targets.has(hidden)).toBe(true);
    expect(lastObserver().targets.has(visible)).toBe(false);

    intersect(hidden);
    await pump(() => hidden.dataset.noview_threshold_unmet === '999');
  });
});

describe('youtube-noview URL path gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('gates processing on the URL: disallowed paths skipped, /watch and /gaming allowed', async () => {
    await loadNoview();
    setResponder(viewsResponder({ [vid(4)]: '500', [vid(5)]: '500' }));

    // Disallowed: search results — cards must stay untouched, attribute off.
    history.pushState({}, '', '/results?search_query=test');
    const [disallowed] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await vi.advanceTimersByTimeAsync(300);
    expect(disallowed.dataset.noview_views).toBeUndefined();
    expect(document.documentElement.hasAttribute('data-noview_allowed_page')).toBe(false);

    // Segment boundary: /watchfoo must not match the /watch pattern.
    history.pushState({}, '', '/watchfoo');
    const [nearMiss] = installPage({ cards: [{ href: watchUrl(vid(2)) }] });
    navigate();
    await vi.advanceTimersByTimeAsync(300);
    expect(nearMiss.dataset.noview_views).toBeUndefined();

    // Query + fragment are ignored: /watch?v=…#t=10 is still /watch.
    history.pushState({}, '', `/watch?v=${vid(3)}#t=10`);
    const [watchCard] = installPage({ cards: [{ href: watchUrl(vid(4)) }] });
    navigate();
    await pump(() => watchCard.dataset.noview_threshold_unmet === '999');
    expect(document.documentElement.hasAttribute('data-noview_allowed_page')).toBe(true);

    // /gaming is part of the shipped preset.
    history.pushState({}, '', '/gaming');
    const [gamingCard] = installPage({ cards: [{ href: watchUrl(vid(5)) }] });
    navigate();
    await pump(() => gamingCard.dataset.noview_threshold_unmet === '999');
    expect(document.documentElement.hasAttribute('data-noview_allowed_page')).toBe(true);
  });

  it('extends the preset with custom ALLOWED_PAGE_PATHS from storage', async () => {
    await loadNoview({ env: { ALLOWED_PAGE_PATHS: ['/my-path'] } });
    setResponder(viewsResponder({ [vid(1)]: '500' }));

    history.pushState({}, '', '/my-path');
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');
    expect(document.documentElement.hasAttribute('data-noview_allowed_page')).toBe(true);
  });

  it('ignores a stale SELECTORS_ALLOWED_PAGE value from old settings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fx = await loadNoview({ env: { SELECTORS_ALLOWED_PAGE: '::bogus((' } });

    // The retired key is never read: no selector validation error and none of
    // its value leaks into the generated CSS.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fx.styles().join('')).not.toContain('::bogus');

    // The new system still works on an allowed path.
    setResponder(viewsResponder({ [vid(1)]: '500' }));
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');
  });
});

describe('youtube-noview video ID extraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('extracts IDs from watch, shorts, live and embed URLs; fails open on unknown paths', async () => {
    await loadNoview();
    const ids = [vid(1), vid(2), vid(3), vid(4)];
    const cards = [
      { href: watchUrl(ids[0]) },
      { href: `https://www.youtube.com/shorts/${ids[1]}` },
      { href: `https://www.youtube.com/live/${ids[2]}` },
      { href: `https://www.youtube.com/embed/${ids[3]}` },
      { href: 'https://www.youtube.com/browse/guide' }
    ];
    const els = installPage({ cards });

    navigate();
    await pumpProcessed(5);

    expect(els[0].dataset.noview_id).toBe(ids[0]);
    expect(els[1].dataset.noview_id).toBe(ids[1]);
    expect(els[2].dataset.noview_id).toBe(ids[2]);
    expect(els[3].dataset.noview_id).toBe(ids[3]);
    // Unknown path: fail open — marker set, no ID, no hiding.
    expect(els[4].dataset.noview_id).toBeUndefined();
    expect(els[4].dataset.noview_views).toBe('');
    expect(els[4].dataset.noview_threshold_unmet).toBeUndefined();
    // The four resolvable IDs each went through the API path.
    expect(fetchCalls()).toHaveLength(4);
  });
});

describe('youtube-noview threshold decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('applies thresholds from API view counts (hide at/below, keep above)', async () => {
    await loadNoview();
    // API is the only view-count source since the old-design DOM parser was
    // removed (2026-11-16) — per-video counts prove the threshold math.
    setResponder(viewsResponder({
      [vid(1)]: '500',
      [vid(2)]: '999',
      [vid(3)]: '1000'
    }));
    const els = installPage({
      cards: [
        { href: watchUrl(vid(1)) },
        { href: watchUrl(vid(2)) },
        { href: watchUrl(vid(3)) }
      ]
    });

    navigate();
    await pumpProcessed(3);

    expect(els[0].dataset.noview_threshold_unmet).toBe('999');
    expect(els[1].dataset.noview_threshold_unmet).toBe('999');
    expect(els[2].dataset.noview_threshold_unmet).toBeUndefined();
    expect(els[2].dataset.noview_views).toBe('1000');
    expect(fetchCalls()).toHaveLength(3);
  });

  it('applies the distinct NEW-badge threshold when configured', async () => {
    await loadNoview({ env: { VIEWS_THRESHOLD_NEW: 50 } });
    setResponder(viewsResponder({
      [vid(1)]: '100',
      [vid(2)]: '100',
      [vid(3)]: '10'
    }));

    const els = installPage({
      cards: [
        { href: watchUrl(vid(1)), badge: true },
        { href: watchUrl(vid(2)) },
        { href: watchUrl(vid(3)), badge: true }
      ]
    });
    navigate();
    await pumpProcessed(3);

    // Badge present: judged against NEW threshold (50), not the default 999.
    expect(els[0].dataset.noview_threshold_unmet).toBeUndefined();
    expect(els[0].dataset.noview_views).toBe('100');
    // No badge: default threshold applies.
    expect(els[1].dataset.noview_threshold_unmet).toBe('999');
    // Badge + below NEW threshold: NEW value reported.
    expect(els[2].dataset.noview_threshold_unmet).toBe('50');
    expect(fetchCalls()).toHaveLength(3);
  });

  it('skips upcoming videos reported by the API without hiding them', async () => {
    await loadNoview();
    setResponder(playerResponder({ isUpcoming: true, viewCount: '10' }));

    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
    expect(card.dataset.noview_views).toBe('');
    expect(fetchCalls()).toHaveLength(1);
  });

  it('fetches and applies VIEWS_THRESHOLD_LIVE from the API', async () => {
    await loadNoview({ env: { VIEWS_THRESHOLD_LIVE: 100 } });
    setResponder(playerResponder({ isLive: true, viewCount: '50' }));

    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)) }] });
    navigate();
    await pump(() => card.dataset.noview_threshold_unmet !== undefined);

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_threshold_unmet).toBe('100');
    expect(card.dataset.noview_views).toBe('50');
  });

  it('skips fetch for allowlisted channels found early through the lockup bridge', async () => {
    await loadNoview({ env: { ALLOWED_CHANNEL_IDS: ['UC_allowed'] } });

    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), channelId: 'UC_allowed' }]
    });
    navigate();
    await pump(() => card.dataset.noview_allowed_channel !== undefined);

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_allowed_channel).toBe('true');
    expect(card.dataset.noview_channel_ids).toBe('["UC_allowed"]');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
    expect(card.dataset.noview_views).toBe('');
  });

  it('still fetches for a non-allowlisted early channel (API supplies channelIDs)', async () => {
    await loadNoview({ env: { ALLOWED_CHANNEL_IDS: ['UC_allowed'] } });
    setResponder(playerResponder({ viewCount: '500' }));

    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), channelId: 'UC_other' }]
    });
    navigate();
    await pump(() => card.dataset.noview_views === '500');

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_threshold_unmet).toBe('999');
    expect(card.dataset.noview_allowed_channel).toBeUndefined();
  });
});

describe('youtube-noview DOM view parser and playlist skip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses an exact PLAY_ARROW view count from the DOM without fetching', async () => {
    await loadNoview();
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '14' }] });

    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('14');
  });

  it('treats compact view text as ≥1000 for sub-1000 thresholds without fetching', async () => {
    await loadNoview();
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '70K' }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    // Compact ⇒ ≥1000 ⇒ above the default 999 threshold, exact decision
    // without the API; synthetic floor lands in noview_views.
    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('1000');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('fetches compact view text when a ≥1000 threshold is configured', async () => {
    await loadNoview({ env: { VIEWS_THRESHOLD: 5000 } });
    setResponder(playerResponder({ viewCount: '70000' }));
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '70K' }] });

    navigate();
    await pump(() => card.dataset.noview_views === '70000');

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('skips playlists outright: visible, no threshold, no fetch', async () => {
    await loadNoview();
    // watch-style URL: getVideoID resolves the embedded video, but the
    // lockup's contentType says playlist → skipped, not API-fallbacked.
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), playlist: true }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
    expect(card.dataset.noview_id).toBe(vid(1));
  });

  it('never skips a video whose views row is missing (playlist false-positive guard)', async () => {
    await loadNoview();
    // contentType VIDEO + no PLAY_ARROW row → must fall through to the API,
    // never be treated as a playlist.
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), noViewsRow: true }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_views).toBe('5000');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('reads the symbol envelope when data is a function (live home shape)', async () => {
    await loadNoview();
    // Live home desktop lockups store componentProps.data as a FUNCTION
    // carrying the symbol envelope — a typeof-object-only guard rejects it
    // and forces every +1K card back to the API (2026-11-16 regression).
    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), viewsText: '70K', dataAsFunction: true }]
    });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('1000');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('shorts shelf: exact secondaryText views settle the decision without fetching', async () => {
    await loadNoview();
    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), type: 'shorts', viewsText: '428 views' }]
    });

    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');

    // Exact 428 ≤ 999 → hidden via the DOM only. The fixture's a11y text
    // says "2.7 million" — if it were parsed instead of secondaryText the
    // card would have been judged ≥1000 and left visible.
    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('428');
    expect(card.dataset.noview_threshold_unmet).toBe('999');
  });

  it('shorts shelf: compact secondaryText acts as ≥1000 without fetching', async () => {
    await loadNoview();
    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), type: 'shorts', viewsText: '2.7M views' }]
    });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('1000');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('shorts shelf payload is never mistaken for a playlist', async () => {
    await loadNoview();
    // The shorts payload has no contentType/contentId, yet it is a truthy
    // payload: a playlist false-positive would show noview_views '' with
    // no fetch. Instead the missing views text must fall to the API and
    // the card must be thresholded normally.
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), type: 'shorts' }] });

    navigate();
    await pump(() => card.dataset.noview_views === '5000');

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('still fetches when VIEWS_THRESHOLD_LIVE is configured despite an exact DOM row', async () => {
    await loadNoview({ env: { VIEWS_THRESHOLD_LIVE: 100 } });
    setResponder(playerResponder({ isLive: true, viewCount: '50' }));
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '14' }] });

    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '100');

    // isLive has no DOM source — the API wins even though the row was exact.
    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_views).toBe('50');
  });

  it('fetches despite an exact DOM row when a channel allowlist is configured', async () => {
    await loadNoview({ env: { ALLOWED_CHANNEL_IDS: ['UC_allowed'] } });
    setResponder(playerResponder({ viewCount: '500' }));
    // Non-allowlisted bridge channel: parent-channel matching needs API
    // channelIDs, so the DOM fast path stays off.
    const [card] = installPage({
      cards: [{ href: watchUrl(vid(1)), viewsText: '14', channelId: 'UC_other' }]
    });

    navigate();
    await pump(() => card.dataset.noview_views === '500');

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_threshold_unmet).toBe('999');
    expect(card.dataset.noview_allowed_channel).toBeUndefined();
  });

  it('skips the API for compact text when only sub-1000 thresholds are configured (even with LIVE)', async () => {
    await loadNoview({ env: { VIEWS_THRESHOLD_LIVE: 100 } });
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '70K' }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    // Compact ⇒ ≥1000 ⇒ above 999 and 100 alike — isLive cannot flip that.
    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('1000');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('skips the API for an exact count that exceeds every configured threshold', async () => {
    await loadNoview({ env: { ALLOWED_CHANNEL_IDS: ['UC_allowed'] } });
    // Exact 1,234,567 > max(999, 0, 0): never hidden, whatever the
    // API's isLive / parent channels could say.
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: '1,234,567' }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('1234567');
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();
  });

  it('sends digit-less view strings to the API instead of assuming ≥1000', async () => {
    await loadNoview();
    const [card] = installPage({ cards: [{ href: watchUrl(vid(1)), viewsText: 'views' }] });

    navigate();
    await pump(() => card.dataset.noview_views !== undefined);

    expect(fetchCalls()).toHaveLength(1);
    expect(card.dataset.noview_views).toBe('5000'); // harness default responder
  });
});

describe('youtube-noview request throttling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('caps concurrent player requests at 3 and passes a 15s abort timeout (#4)', async () => {
    await loadNoview();
    holdFetches();
    const els = installPage({
      cards: [1, 2, 3, 4, 5].map(n => ({ href: watchUrl(vid(n)) }))
    });

    navigate();
    await pump(() => fetchCalls().length === 3);
    // Slots are full: no further request starts while the first three hang.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchCalls()).toHaveLength(3);
    expect(abortTimeouts()).toContain(15000);

    releaseFetches();
    await pump(() => els.every(el => el.dataset.noview_views !== undefined));
    expect(fetchCalls()).toHaveLength(5);
  });

  it('spaces player request starts by at least the minimum interval (#4)', async () => {
    await loadNoview();
    holdFetches();
    installPage({
      cards: [1, 2, 3].map(n => ({ href: watchUrl(vid(n)) }))
    });

    navigate();
    await pump(() => fetchCalls().length === 1);

    // Second start is gated: 100ms is well under the 250ms floor (+ jitter).
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchCalls()).toHaveLength(1);
    // Past the floor (250 + floor(0.5*150) = 325ms with pinned Math.random).
    await vi.advanceTimersByTimeAsync(300);
    await pump(() => fetchCalls().length === 2);

    await vi.advanceTimersByTimeAsync(100);
    expect(fetchCalls()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(300);
    await pump(() => fetchCalls().length === 3);
  });

  it('drops queued requests when the user SPA-navigates mid-throttle (#4 hardening)', async () => {
    await loadNoview();
    holdFetches();
    const els = installPage({
      cards: [1, 2, 3, 4, 5].map(n => ({ href: watchUrl(vid(n)) }))
    });

    navigate();
    await pump(() => fetchCalls().length === 3);

    // Navigate away while requests 4 and 5 are still queued behind slots.
    navigateStart();
    releaseFetches();
    await pump(() => els.every(el => el.dataset.noview_views !== undefined));

    // Only the three in-flight requests ever hit the network.
    expect(fetchCalls()).toHaveLength(3);
    expect(els[0].dataset.noview_views).toBe('5000');
    expect(els[3].dataset.noview_views).toBe('');
    expect(els[3].dataset.noview_threshold_unmet).toBeUndefined();
  });
});

describe('youtube-noview shared ID watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs a single shared 1s interval for all processed cards (#2)', async () => {
    const fx = await loadNoview();
    installPage({
      cards: [1, 2, 3].map(n => ({ href: watchUrl(vid(n)) }))
    });

    navigate();
    await pumpProcessed(3);
    await flush();

    const oneSecondIntervals = fx.intervalCalls().filter(([, delay]) => delay === 1000);
    expect(oneSecondIntervals).toHaveLength(1);
  });

  it('reprocesses a card whose anchor href changed to a new video ID (#2)', async () => {
    await loadNoview();
    const idA = vid(1);
    const idB = vid(2);
    setResponder(viewsResponder({ [idA]: '5000', [idB]: '500' }));
    const [card] = installPage({ cards: [{ href: watchUrl(idA) }] });

    navigate();
    await pump(() => card.dataset.noview_id === idA);
    expect(card.dataset.noview_threshold_unmet).toBeUndefined();

    // YouTube recycles the node for a different video.
    card.querySelector('a').href = watchUrl(idB);

    await vi.advanceTimersByTimeAsync(1100);
    await pump(() => card.dataset.noview_id === idB);

    expect(card.dataset.noview_id).toBe(idB);
    expect(card.dataset.noview_threshold_unmet).toBe('999');
    expect(card.dataset.noview_views).toBe('500');
  });
});

describe('youtube-noview peer metadata protocol', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses a peer-provided view count from cache without fetching (#6)', async () => {
    await loadNoview();
    const id = vid(1);
    dispatchReceived(id, receivedMetadata({ viewCount: '500' }));

    const [card] = installPage({ cards: [{ href: watchUrl(id) }] });
    navigate();
    await pump(() => card.dataset.noview_threshold_unmet === '999');

    expect(fetchCalls()).toHaveLength(0);
    expect(card.dataset.noview_views).toBe('500');
  });

  it('lets a peer payload replace a failed local entry and resolves the waiter (#6 regression)', async () => {
    await loadNoview();
    const id = vid(1);
    setResponder(failResponder);

    const card1 = installPage({ cards: [{ href: watchUrl(id) }] })[0];
    navigate();
    await pump(() => card1.dataset.noview_views !== undefined);
    expect(fetchCalls()).toHaveLength(1);
    // Local cache now holds viewCount: null; activeRequests entry expires at +500ms.
    await vi.advanceTimersByTimeAsync(600);

    // A peer instance announces it is fetching this video; we wait on it.
    dispatchRequested(id);
    const card2 = addCard({ href: watchUrl(id) });
    navigate();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    // Waiter path: no second local fetch is started.
    expect(fetchCalls()).toHaveLength(1);
    expect(card2.dataset.noview_views).toBeUndefined();

    // Peer delivers: local null entry must be replaced and the waiter released.
    dispatchReceived(id, receivedMetadata({ viewCount: '500' }));
    await pump(() => card2.dataset.noview_threshold_unmet === '999');
    expect(card2.dataset.noview_views).toBe('500');
    expect(fetchCalls()).toHaveLength(1);
  });

  it('keeps a valid local view count when a peer payload arrives (#6)', async () => {
    await loadNoview();
    const id = vid(1);

    const card1 = installPage({ cards: [{ href: watchUrl(id) }] })[0];
    navigate();
    await pump(() => card1.dataset.noview_views === '5000');
    expect(fetchCalls()).toHaveLength(1);

    // Peer claims much lower views; local valid entry must win.
    dispatchReceived(id, receivedMetadata({ viewCount: '500' }));

    const card2 = addCard({ href: watchUrl(id) });
    navigate();
    await pump(() => card2.dataset.noview_views !== undefined);

    expect(card2.dataset.noview_views).toBe('5000');
    expect(card2.dataset.noview_threshold_unmet).toBeUndefined();
    expect(fetchCalls()).toHaveLength(1);
  });
});
