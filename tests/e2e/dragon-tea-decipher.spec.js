import { expect, test } from '@playwright/test';

const FIXTURE_PATH = '/tests/fixtures/dragon-tea-decipher.html';
const SCRIPT_PATH = 'src/dragon-tea-decipher.user.js';
const SCRIPT_CIPHERTEXT = 'Gsv jfrxp yildm ulc';

// Gutenberg block delimiter emitted by WordPress between the fixture's paragraphs.
// The node's data is the verbatim payload, spaces included.
const FIXTURE_COMMENT = ' wp:paragraph ';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Minimal stand-ins for the @require'd sentinel-js and the granted GM API.
    window.GM_getValue = (key, defaultValue) => defaultValue;
    window.sentinel = {
      on: (selector, callback) => {
        const run = () => {
          for (const element of document.querySelectorAll(selector)) {
            callback(element);
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
          run();
        }
      }
    };
  });

  await page.goto(FIXTURE_PATH);
});

test('deciphers article text while preserving scripts and styles', async ({ page }) => {
  await page.addScriptTag({ path: SCRIPT_PATH });

  const paragraphs = page.locator('.chapter-type-text .reading-content .text-left p');

  await expect(paragraphs.nth(0)).toHaveText('The quick brown fox jumps over the lazy dog.');
  await expect(paragraphs.nth(1)).toHaveText('Chapter 12: Notes! TEST');
  await expect(page.locator('.text-left span')).toHaveText('TEST');
  await expect(page.locator('.wp-manga-genre-novels .summary__content p')).toHaveText('An empty house on the hill.');

  expect(await page.locator('.text-left script').textContent()).toContain(SCRIPT_CIPHERTEXT);
  expect(await page.evaluate(() => window.__fixtureScriptRan)).toBe(SCRIPT_CIPHERTEXT);
});

test('leaves comment nodes untouched', async ({ page }) => {
  await page.addScriptTag({ path: SCRIPT_PATH });

  const comments = await page.locator('.chapter-type-text .reading-content .text-left')
    .evaluate(element => Array.from(element.childNodes)
      .filter(node => node.nodeType === 8)
      .map(node => node.data));

  expect(comments).toEqual([FIXTURE_COMMENT]);
});

test('keeps the nested style rules effective after deciphering', async ({ page }) => {
  await page.addScriptTag({ path: SCRIPT_PATH });

  const paragraph = page.locator('.text-left p').first();

  expect(await paragraph.evaluate(element => getComputedStyle(element).fontStyle)).toBe('italic');
  expect(await page.locator('.text-left').evaluate(element => getComputedStyle(element).fontFamily))
    .toContain('Atbash Fixture Font');
});

test('does not decipher the same element twice when the script runs again', async ({ page }) => {
  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.addScriptTag({ path: SCRIPT_PATH });

  await expect(page.locator('.chapter-type-text .reading-content .text-left p').first())
    .toHaveText('The quick brown fox jumps over the lazy dog.');
  expect(await page.locator('.text-left').evaluate(element => element.dataset.cipherUndone)).toBe('true');
});
