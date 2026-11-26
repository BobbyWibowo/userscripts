import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const CARD_SELECTOR = '[data-ga4-label="thumbnail"]';

const cards = () => Array.from(document.querySelectorAll(CARD_SELECTOR));
const cardWithArtwork = id => cards().find(card => card.querySelector(`a[href*="${id}"]`));
const plainCard = () => cardWithArtwork('16112933');

/** Attach Vue-style page metadata and run the image pipeline on one card. */
const processCard = async (pixiv, card, props) => {
  card.__vue__ = { _props: { item: { id: '9001', tags: [], ...props } } };

  await pixiv.observeImageCard(card);
  await flush(4);

  return card;
};

/**
 * Remove Pixiv's own artist link so the userscript injects its artist pill, then
 * return that pill. It is the only script-generated anchor left now that the
 * blocked-image placeholder is pure CSS, so these tests exercise SPA routing
 * through it.
 */
const artistPill = async pixiv => {
  const card = plainCard();
  card.querySelector('a[href*="users/"]').remove();
  await processCard(pixiv, card, { id: '9001', userId: '4242', userName: 'Pill Artist', tags: [] });
  return card.querySelector('.pixiv_utils_image_artist');
};

const clickThrough = element => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
};

const fiberNode = (memoizedProps, children = []) => ({
  memoizedProps,
  child: children[0] ?? null,
  sibling: children[1] ?? null
});

const mountReactContainer = hostRoot => {
  const container = document.createElement('div');
  container.id = '__next';
  container.__reactContainer$fixture = hostRoot;
  document.body.append(container);
  return container;
};

describe('pixiv-utils SPA navigation', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
    delete window.next;
    delete globalThis.unsafeWindow;
    document.getElementById('spa-contents')?.remove();
    document.getElementById('__next')?.remove();
  });

  it('navigates the injected artist pill through the React router', async () => {
    window.next = { router: { push: vi.fn(), pathname: '/' } };
    const pixiv = await loadPixivUtils();

    const pill = await artistPill(pixiv);
    expect(pill).not.toBeNull();

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(window.next.router.push).toHaveBeenCalledWith('/users/4242');
  });

  it('reads the React router from the page world through unsafeWindow', async () => {
    const pageRouter = { push: vi.fn(), pathname: '/' };
    globalThis.unsafeWindow = { next: { router: pageRouter } };

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(pageRouter.push).toHaveBeenCalledWith('/users/4242');
  });

  it('navigates the artist pill through the Vue router', async () => {
    const vueRoot = document.createElement('div');
    vueRoot.id = 'spa-contents';
    vueRoot.__vue__ = { $router: { push: vi.fn() } };
    document.body.append(vueRoot);

    const pixiv = await loadPixivUtils();
    const card = plainCard();
    // Remove the built-in artist tag so the userscript's pill is needed.
    card.querySelector('a[href*="users/"]').remove();

    await processCard(pixiv, card, { id: '9003', userId: '4242', userName: 'Pill Artist', tags: [] });

    const pill = card.querySelector('.pixiv_utils_image_artist');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('Pill Artist');

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(vueRoot.__vue__.$router.push).toHaveBeenCalledWith('/users/4242');
  });

  it('emulates the Vue route through history when the instance is unreachable', async () => {
    const vueRoot = document.createElement('div');
    vueRoot.id = 'spa-contents';
    vueRoot.__vue__ = {};
    document.body.append(vueRoot);

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);
    const event = clickThrough(pill);

    expect(event.defaultPrevented).toBe(true);
    expect(location.pathname).toBe('/users/4242');
  });

  it('keeps default navigation when no layout is detectable', async () => {
    const pixiv = await loadPixivUtils();

    const pill = await artistPill(pixiv);
    expect(pill.getAttribute('href')).toContain('/users/4242');

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(false);
  });

  it('discovers the React router through the fiber tree when the page global is unreachable', async () => {
    const router = { push: vi.fn(), pathname: '/' };
    mountReactContainer(fiberNode({}, [
      fiberNode({ value: {} }, [
        fiberNode({ router }, [])
      ])
    ]));

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/users/4242');
  });

  it('finds the React router through a context provider value', async () => {
    const router = { push: vi.fn(), pathname: '/' };
    mountReactContainer(fiberNode({}, [
      fiberNode({ value: { router } }, [
        fiberNode({}, [])
      ])
    ]));

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/users/4242');
  });

  it('supports the React 17 container reference', async () => {
    const router = { push: vi.fn(), pathname: '/' };
    const container = document.createElement('div');
    container.id = '__next';
    container._reactRootContainer = { _internalRoot: { current: fiberNode({ router }, []) } };
    document.body.append(container);

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/users/4242');
  });

  it('prefers the page-world global router over the fiber tree', async () => {
    const globalRouter = { push: vi.fn(), pathname: '/' };
    const fiberRouter = { push: vi.fn(), pathname: '/' };
    window.next = { router: globalRouter };
    mountReactContainer(fiberNode({ router: fiberRouter }, []));

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(true);
    expect(globalRouter.push).toHaveBeenCalledWith('/users/4242');
    expect(fiberRouter.push).not.toHaveBeenCalled();
  });

  it('keeps default navigation when the React layout has no resolvable router', async () => {
    mountReactContainer(fiberNode({}, [fiberNode({}, [])]));

    const pixiv = await loadPixivUtils();
    const pill = await artistPill(pixiv);
    expect(pill).not.toBeNull();

    const event = clickThrough(pill);
    expect(event.defaultPrevented).toBe(false);
  });
});
