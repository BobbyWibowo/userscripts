import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIXTURE_HTML = readFileSync(join(repoRoot, 'tests', 'fixtures', 'dragon-tea-decipher.html'), 'utf8');

const SELECTOR_ARTICLE = '.chapter-type-text .reading-content .text-left, ' +
  '.wp-manga-genre-novels .description-summary .summary__content';

const SCRIPT_CIPHERTEXT = 'Gsv jfrxp yildm ulc';

const DECIPHERED = {
  paragraph: 'The quick brown fox jumps over the lazy dog.',
  secondParagraph: 'Chapter 12: Notes! TEST',
  nested: 'TEST',
  list: ['Line 1', 'Line 2'],
  summary: 'An empty house on the hill.'
};

const createSentinel = () => {
  const listeners = [];

  return {
    listeners,
    on: (selector, callback) => {
      listeners.push({
        selector,
        callback
      });
    }
  };
};

const loadFixture = () => {
  const parsed = new DOMParser().parseFromString(FIXTURE_HTML, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
};

const runUserscript = async (sentinel, getValue = (key, defaultValue) => defaultValue) => {
  // The userscript is an IIFE that expects GM_getValue and the @require'd
  // sentinel to already exist as page globals when it is evaluated.
  globalThis.GM_getValue = getValue;
  globalThis.sentinel = sentinel;

  try {
    vi.resetModules();
    await import('../../src/dragon-tea-decipher.user.js');
  } finally {
    delete globalThis.GM_getValue;
    delete globalThis.sentinel;
  }

  return sentinel.listeners;
};

const firstArticle = () => document.querySelector('.chapter-type-text .reading-content .text-left');
const secondArticle = () => document.querySelector('.wp-manga-genre-novels .description-summary .summary__content');

const decipherAll = listeners => {
  for (const element of document.querySelectorAll(SELECTOR_ARTICLE)) {
    listeners[0].callback(element);
  }
};

describe('dragon-tea-decipher user script', () => {
  let sentinel;

  beforeEach(() => {
    document.body.innerHTML = '';
    sentinel = createSentinel();
    loadFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to the combined article selector exactly once', async () => {
    const listeners = await runUserscript(sentinel);

    expect(listeners).toHaveLength(1);
    expect(listeners[0].selector).toBe(SELECTOR_ARTICLE);
    expect(document.querySelectorAll(SELECTOR_ARTICLE)).toHaveLength(2);
  });

  it('deciphers Atbash text in both article containers', async () => {
    const listeners = await runUserscript(sentinel);

    decipherAll(listeners);

    const paragraphs = firstArticle().querySelectorAll('p');

    expect(paragraphs[0].textContent).toBe(DECIPHERED.paragraph);
    expect(paragraphs[1].textContent).toBe(DECIPHERED.secondParagraph);
    expect(firstArticle().querySelector('span').textContent).toBe(DECIPHERED.nested);
    expect(Array.from(firstArticle().querySelectorAll('li'), element => element.textContent)).toEqual(DECIPHERED.list);
    expect(secondArticle().textContent).toBe(DECIPHERED.summary);
  });

  it('leaves script and style content untouched', async () => {
    const listeners = await runUserscript(sentinel);

    decipherAll(listeners);

    expect(firstArticle().querySelector('script').textContent).toContain(SCRIPT_CIPHERTEXT);
    expect(firstArticle().querySelector('style').textContent).toContain('font-style: italic');
  });

  it('changes only text nodes, keeping the element structure intact', async () => {
    const listeners = await runUserscript(sentinel);
    const tagsBefore = Array.from(firstArticle().querySelectorAll('*'), element => element.tagName);

    decipherAll(listeners);

    const tagsAfter = Array.from(firstArticle().querySelectorAll('*'), element => element.tagName);

    expect(tagsAfter).toEqual(tagsBefore);
    expect(firstArticle().querySelectorAll('script')).toHaveLength(1);
    expect(firstArticle().querySelectorAll('style')).toHaveLength(1);
  });

  it('marks the element and never deciphers it twice', async () => {
    const listeners = await runUserscript(sentinel);
    const article = firstArticle();

    listeners[0].callback(article);

    expect(article.dataset.cipherUndone).toBe('true');
    expect(article.querySelector('p').textContent).toBe(DECIPHERED.paragraph);

    listeners[0].callback(article);
    listeners[0].callback(article);

    expect(article.querySelector('p').textContent).toBe(DECIPHERED.paragraph);
  });

  it('marks each article container independently', async () => {
    const listeners = await runUserscript(sentinel);

    decipherAll(listeners);

    expect(firstArticle().dataset.cipherUndone).toBe('true');
    expect(secondArticle().dataset.cipherUndone).toBe('true');
  });

  it('reads MODE from userscript storage and stays silent in PROD', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const getValue = vi.fn((key, defaultValue) => defaultValue);

    await runUserscript(sentinel, getValue);

    expect(getValue).toHaveBeenCalledWith('MODE', 'PROD');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs diagnostics when MODE is not PROD', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const listeners = await runUserscript(sentinel, (key, defaultValue) => (key === 'MODE' ? 'DEBUG' : defaultValue));

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MODE ='), 'DEBUG');

    logSpy.mockClear();
    listeners[0].callback(firstArticle());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Called enAtbash() on'));
  });
});
