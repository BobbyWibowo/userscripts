import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const EDIT_BOOKMARK_MARKUP = `
  <main>
    <div style="translateY(0px)">
      <section><a class="pixiv_utils_edit_bookmark" href="#">Edit bookmark</a></section>
    </div>
  </main>
`;

const keydown = (key, init = {}) => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

/** Count real clicks on an element without letting jsdom attempt navigation. */
const countClicks = element => {
  const state = { count: 0 };

  element.addEventListener('click', event => {
    event.preventDefault();
    state.count += 1;
  }, true);

  return state;
};

describe('pixiv-utils keybinds', () => {
  afterEach(() => {
    cleanupPixivUtils();
  });

  it('clicks the edit-bookmark button on Shift+B', async () => {
    document.body.innerHTML = EDIT_BOOKMARK_MARKUP;

    await loadPixivUtils();

    const button = document.querySelector('.pixiv_utils_edit_bookmark');
    const clicks = countClicks(button);

    keydown('B', { shiftKey: true });

    expect(clicks.count).toBe(1);
  });

  it('honors the cooldown between repeated keybind presses', async () => {
    document.body.innerHTML = EDIT_BOOKMARK_MARKUP;

    await loadPixivUtils();

    const button = document.querySelector('.pixiv_utils_edit_bookmark');
    const clicks = countClicks(button);

    keydown('b', { shiftKey: true });
    keydown('b', { shiftKey: true });

    // The second press lands inside the 1s cooldown window.
    expect(clicks.count).toBe(1);
  });

  it('ignores keybinds while typing in an input', async () => {
    document.body.innerHTML = `${EDIT_BOOKMARK_MARKUP}<input id="field">`;

    await loadPixivUtils();

    const button = document.querySelector('.pixiv_utils_edit_bookmark');
    const clicks = countClicks(button);
    const field = document.querySelector('#field');

    field.focus();
    keydown('B', { shiftKey: true });

    expect(clicks.count).toBe(0);

    field.blur();
    keydown('B', { shiftKey: true });

    expect(clicks.count).toBe(1);
  });

  it('ignores keybinds while a select control is focused', async () => {
    document.body.innerHTML = `
      <a aria-label="Next" href="/users/12345?p=2">Next</a>
      <select id="field"><option>a</option></select>
    `;

    await loadPixivUtils({ url: '/users/12345' });

    const next = document.querySelector('a[aria-label="Next"]');
    const clicks = countClicks(next);
    const field = document.querySelector('#field');

    field.focus();
    keydown('ArrowRight');

    expect(clicks.count).toBe(0);

    field.blur();
    keydown('ArrowRight');

    expect(clicks.count).toBe(1);
  });

  it('ignores keybinds during IME composition', async () => {
    document.body.innerHTML = EDIT_BOOKMARK_MARKUP;

    await loadPixivUtils();

    const button = document.querySelector('.pixiv_utils_edit_bookmark');
    const clicks = countClicks(button);

    // Modern composition marker, and the legacy processed-IME key code.
    keydown('B', { shiftKey: true, isComposing: true });
    const legacyEvent = new KeyboardEvent('keydown', { key: 'B', shiftKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(legacyEvent, 'keyCode', { value: 229 });
    document.dispatchEvent(legacyEvent);

    expect(clicks.count).toBe(0);

    keydown('B', { shiftKey: true });

    expect(clicks.count).toBe(1);
  });

  it('uses the artist page pagination links for arrow keys', async () => {
    document.body.innerHTML = `
      <a aria-label="Previous" href="/users/12345?p=1">Previous</a>
      <a aria-label="Next" href="/users/12345?p=3">Next</a>
    `;

    await loadPixivUtils({ url: '/users/12345' });

    const previous = document.querySelector('a[aria-label="Previous"]');
    const next = document.querySelector('a[aria-label="Next"]');
    const previousClicks = countClicks(previous);
    const nextClicks = countClicks(next);

    keydown('ArrowRight');

    expect(nextClicks.count).toBe(1);
    expect(previousClicks.count).toBe(0);
  });

  it('scrolls the large image into view only when it sits below the viewport', async () => {
    document.body.innerHTML = '<img src="https://i.pximg.net/c/540x540/p0_master.jpg">';

    const image = document.querySelector('img');
    const scrolls = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    let top = 10;

    Object.defineProperty(image, 'getBoundingClientRect', {
      value: () => ({ top, bottom: top + 100, left: 0, right: 100 })
    });
    Element.prototype.scrollIntoView = function (...args) {
      scrolls.push(args);
    };

    try {
      await loadPixivUtils();

      keydown('B');

      expect(scrolls).toHaveLength(1);

      // Already above the viewport top: scrolling would be a jarring jump.
      top = -50;
      keydown('B');

      expect(scrolls).toHaveLength(1);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
