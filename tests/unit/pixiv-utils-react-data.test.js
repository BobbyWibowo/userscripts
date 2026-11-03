import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const CARD_SELECTOR = '[data-ga4-label="thumbnail"]';
const OVERLAY_SELECTOR = '.pixiv_utils_blocked_image_container';
const ARTIST_SELECTOR = '.pixiv_utils_image_artist';
const REACT_FIBER_KEY = '__reactFiber$fixture';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));

const cardWithArtwork = id => cards().find(card => card.querySelector(`a[href*="${id}"]`));

const plainCard = () => cardWithArtwork('16112933');

/**
 * The image registration is the fourth unconditional callback: home, own
 * profile, expanded-view controls, then images.
 */
const imageListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('data-ga4-label="thumbnail"')
  );

  if (!entry) throw new Error('No image sentinel callback registered.');

  return entry;
};

/**
 * Attach a synthetic React fiber chain to a card element. The first entry is
 * the card's own host fiber; each following entry is a component fiber
 * reachable through `child`, carrying the given `memoizedProps`.
 */
const mountReactCard = (card, propsChain) => {
  let root = null;
  let parent = null;

  for (const memoizedProps of propsChain) {
    const fiber = { memoizedProps, child: null, return: parent, type: { name: 'Fixture' } };
    if (parent) parent.child = fiber;
    else root = fiber;
    parent = fiber;
  }

  card[REACT_FIBER_KEY] = root;
  return card;
};

/** Render cards without a built-in artist link, so the artist pill is wanted. */
const renderWorkCards = artworkIds => {
  document.body.innerHTML = artworkIds.map((artworkId, index) => `
    <div data-ga4-label="thumbnail" id="react-card-${index}">
      <a href="/artworks/${artworkId}"><img src="https://i.pximg.net/c/360x360_70/img-master/x.jpg" alt=""></a>
      <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
    </div>`).join('');

  return cards();
};

/** Render novel cards whose only artwork link is the novel detail page. */
const renderNovelCards = novelIds => {
  document.body.innerHTML = novelIds.map((novelId, index) => `
    <div data-ga4-label="thumbnail" id="react-novel-${index}">
      <a href="/novel/show.php?id=${novelId}"><img src="https://i.pximg.net/c/360x360_70/img-master/x.jpg" alt=""></a>
      <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
    </div>`).join('');

  return cards();
};

const processCard = async (pixiv, card) => {
  await pixiv.fireListener(imageListener(pixiv), card);
  await flush(4);

  return card;
};

const isBlocked = card => card.hasAttribute('data-pixiv_utils_blocked');

const overlayOf = card => card.querySelector(OVERLAY_SELECTOR);

describe('pixiv-utils React artwork data extraction', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('blocks an artwork by artist ID read from a thumbnail fiber', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['22444847'] } });
    const card = plainCard();
    mountReactCard(card, [
      {},
      {
        thumbnail: {
          id: '151634636',
          type: 'illust',
          userId: '22444847',
          userName: '言言papa',
          title: '菲欧妮',
          tags: ['AI'],
          createDate: '2026-11-03T15:52:02+09:00',
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card).tagName).toBe('A');
  });

  it('reads rawThumbnail sources used by the home layout', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['109890748'] } });
    const card = plainCard();
    mountReactCard(card, [
      {},
      {
        workType: 'illust',
        rawThumbnail: {
          id: '16112933',
          type: 'illust',
          userId: '109890748',
          userName: '机TT',
          title: '原神絵まとめ',
          tags: ['original'],
          createDate: '2026-01-06 23:36:35',
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).not.toBeNull();
  });

  it('reads ranking legacy content fields and numeric illust_type', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['555'] } });
    const card = plainCard();
    mountReactCard(card, [
      {},
      {
        content: {
          illust_id: 987654,
          illust_type: 0,
          user_id: 555,
          user_name: 'lack',
          title: '👻🎃Happy Halloween🎃👻',
          tags: ['Halloween'],
          illust_upload_timestamp: 1760000000
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).not.toBeNull();
  });

  it('maps numeric illust_type 2 to novels and removes them from home', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div data-ga4-label="page_root"></div>');
    const pixiv = await loadPixivUtils({
      settings: { REMOVE_NOVEL_RECOMMENDATIONS_FROM_HOME: true }
    });
    const card = renderNovelCards(['29527945'])[0];
    mountReactCard(card, [
      {},
      {
        content: {
          illust_id: 29527945,
          illust_type: '2',
          user_id: 60612096,
          user_name: 'doki -doki',
          title: '流萤&风堇的运动会游戏',
          tags: ['novel'],
          illust_upload_timestamp: 1760000000
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(card.style.display).toBe('none');
  });

  it('skips lookalike content without artwork identity and keeps walking', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['real-tag'] } });
    const card = plainCard();
    mountReactCard(card, [
      {},
      { content: { tags: ['decoy-tag'], title: 'not an artwork' } },
      {
        thumbnail: {
          id: '16112933',
          type: 'illust',
          userId: '9999',
          userName: 'Real',
          tags: ['real-tag'],
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
  });

  it('finds sources several fiber levels deep', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'] } });
    const [card] = renderWorkCards(['16112933']);
    mountReactCard(card, [
      {},
      {},
      {},
      {
        thumbnail: {
          id: '16112933',
          type: 'illust',
          userId: '2222',
          userName: 'Deep',
          tags: [],
          createDate: '2026-11-03T15:52:02+09:00',
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
  });

  it('reads sources carried by ancestor fibers (home collection cards)', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['98897592'] } });
    document.body.innerHTML = `
      <div data-ga4-label="thumbnail" id="react-collection">
        <a href="/collections/83254363572408565575"><img src="https://i.pximg.net/c/360x360_70/img-master/x.jpg" alt=""></a>
        <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
      </div>`;
    const card = document.querySelector('#react-collection');
    const leaf = { memoizedProps: {}, child: null, return: null };
    const host = { memoizedProps: {}, child: leaf, return: null };
    leaf.return = host;
    const p1 = { memoizedProps: {}, return: host };
    const p2 = { memoizedProps: {}, return: p1 };
    const p3 = {
      memoizedProps: {
        thumbnail: {
          id: '83254363572408565575',
          type: 'collection',
          userId: '98897592',
          userName: '霓庭快雨',
          title: '刻晴',
          tags: ['original'],
          createDate: '2026-01-06 23:36:35',
          aiType: 1
        }
      },
      return: p2
    };
    p1.return = p2;
    p2.return = p3;
    host.return = p1;
    card[REACT_FIBER_KEY] = host;

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).not.toBeNull();
  });

  it('falls back to the artwork URL when no fiber source is within budget', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_USERS: ['2222'] } });
    const [card] = renderWorkCards(['16112933']);
    mountReactCard(card, [
      {},
      {},
      {},
      {},
      {},
      {
        thumbnail: {
          id: '16112933',
          type: 'illust',
          userId: '2222',
          userName: 'Too Deep',
          tags: [],
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(false);
    expect(overlayOf(card)).toBeNull();
    expect(card.querySelector(ARTIST_SELECTOR)).toBeNull();
  });

  it('adds the artist pill from a React fiber on cards without a built-in artist link', async () => {
    const pixiv = await loadPixivUtils();
    const [card] = renderWorkCards(['16112933']);
    mountReactCard(card, [
      {},
      {
        thumbnail: {
          id: '16112933',
          type: 'illust',
          userId: '22444847',
          userName: '言言papa',
          title: '菲欧妮',
          tags: [],
          createDate: '2026-11-03T15:52:02+09:00',
          aiType: 1
        }
      }
    ]);

    await processCard(pixiv, card);

    const pill = card.querySelector(ARTIST_SELECTOR);

    expect(pill).not.toBeNull();
    expect(pill.href).toBe('https://www.pixiv.net/users/22444847');
    expect(pill.textContent).toBe('言言papa');
    expect(card.dataset.pixiv_utils_artist_added).toBe('true');
  });

  it('reads collection cards that thread the collection through array children', async () => {
    const pixiv = await loadPixivUtils({ settings: { PIXIV_BLOCKED_TAGS: ['firefly'] } });
    document.body.innerHTML = `
      <div data-ga4-label="thumbnail" id="react-collection-card">
        <a href="/collections/82668641668325441719"><img src="https://i.pximg.net/c/360x360_70/img-master/x.jpg" alt=""></a>
        <div class="controls"><div data-ga4-label="bookmark_button"><button type="button">Bookmark</button></div></div>
      </div>`;
    const card = document.querySelector('#react-collection-card');
    mountReactCard(card, [
      {
        children: [
          {
            props: {
              collection: {
                id: '82668641668325441719',
                type: 'collection',
                userId: '42505656',
                userName: 'Restra25',
                title: 'Firefly',
                tags: ['firefly']
              }
            }
          },
          false,
          false
        ]
      }
    ]);

    await processCard(pixiv, card);

    expect(isBlocked(card)).toBe(true);
    expect(overlayOf(card)).not.toBeNull();
  });

  it('covers the novels top page recommended users with a structural selector', async () => {
    const pixiv = await loadPixivUtils();

    // Registration: the normalized desktop SELECTORS_IMAGE preset includes the
    // novels top page recommended-users entry (structural, no sc- hashes).
    const registered = pixiv.selectors().flatMap(selector => String(selector).split(','));
    const novelSelector = registered
      .map(selector => selector.trim())
      .find(selector => selector.includes('gtm-novel-toppage-recommend-user-work'));
    expect(novelSelector).toBeDefined();

    // Matching: the live-observed 4-div wrapper chain around the cover link.
    document.body.innerHTML = `
      <section>
        <div class="artist-block"><div class="per-work"><div><div><div><div>
          <a class="gtm-novel-toppage-recommend-user-work" data-gtm-user-id="71611452" href="/novel/show.php?id=28710210"><img src="cover.jpg" alt=""></a>
        </div></div></div></div></div>
      </section>`;
    const wrapper = document.querySelector('.per-work');

    expect(wrapper.matches(novelSelector)).toBe(true);
    expect(document.querySelector(novelSelector)).toBe(wrapper);
  });
});
