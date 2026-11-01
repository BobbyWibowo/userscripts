import { expect, test } from '@playwright/test';

const FIXTURE_PATH = '/tests/fixtures/pixiv-grid.html';
const SCRIPT_PATH = 'src/pixiv-utils.user.js';

/**
 * Stand-ins for the granted GM APIs and the `@require`d sentinel-js, installed
 * before any page script runs so the userscript boots like it does under a real
 * userscript manager.
 */
const installStubs = settings => {
  window.__pixivSettings = { ...settings };

  window.GM_info = { script: { version: '1.8.3' } };
  window.GM_getValue = (key, fallback) =>
    (Object.prototype.hasOwnProperty.call(window.__pixivSettings, key) ? window.__pixivSettings[key] : fallback);
  window.GM_setValue = (key, value) => {
    window.__pixivSettings[key] = value;
  };
  window.GM_listValues = () => Object.keys(window.__pixivSettings);
  window.GM_addStyle = css => {
    const style = document.createElement('style');
    style.textContent = css;

    // At document-start the parser has not created <head> (or even <html>) yet,
    // so the stylesheet is attached as soon as a root element exists.
    const attach = () => (document.head || document.documentElement).append(style);

    if (document.head || document.documentElement) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });

    return style;
  };
  window.GM_registerMenuCommand = () => {};

  window.sentinel = {
    on: (selector, callback) => {
      const query = Array.isArray(selector) ? selector.join(', ') : selector;
      const scan = node => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches(query)) callback(node);
        for (const match of node.querySelectorAll(query)) callback(match);
      };
      const start = () => {
        scan(document.documentElement);
        new MutationObserver(records => {
          for (const record of records) {
            for (const added of record.addedNodes) scan(added);
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      };

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
      else start();
    }
  };
};

const openFixture = async (page, settings = {}) => {
  await page.addInitScript(installStubs, settings);
  await page.addInitScript({ path: SCRIPT_PATH });
  await page.goto(FIXTURE_PATH);
};

test('boots with GM stubs, injects its styles, and converts artwork dates', async ({ page }) => {
  await openFixture(page);

  // The fixture ships its own <style> block, so merely counting stylesheets
  // proves nothing: assert on a rule the userscript injects via GM_addStyle.
  const injectedStyle = () => page.evaluate(() => Array.from(document.querySelectorAll('style'))
    .some(style => style.textContent.includes('.pixiv_utils_edit_bookmark')));

  await expect.poll(injectedStyle).toBe(true);

  const converted = page.locator('#card-marker [data-pixiv_utils_duplicate_date]');

  await expect(converted).toHaveCount(1);
  await expect(converted).toContainText('2024');
  await expect(converted).not.toContainText('年');
  // The conversion adds an annotated copy and keeps the original byline.
  await expect(page.locator('#card-marker .times:not([data-pixiv_utils_duplicate_date])')).toHaveCount(1);
  await expect(page.locator('#card-marker .times[data-pixiv_utils_duplicate_date]')).toHaveCount(1);
});

test('hides tag buttons whose tag is blocked', async ({ page }) => {
  await openFixture(page, { PIXIV_BLOCKED_TAGS: ['幻想'] });

  await expect(page.locator('#tag-blocked')).toBeHidden();
  await expect(page.locator('#tag-allowed')).toBeVisible();
});

test('adds an edit-bookmark button to every artwork', async ({ page }) => {
  await openFixture(page, { SETTINGS_LANGUAGE: 'en' });

  await expect(page.locator('#card-marker .controls .pixiv_utils_edit_bookmark')).toHaveCount(1);
  await expect(page.locator('#card-plain .controls .pixiv_utils_edit_bookmark')).toHaveCount(1);
});

test('filters the grid by bookmark state, including browser-detected bookmarks', async ({ page }) => {
  await openFixture(page);

  const toggle = page.locator('.pixiv_utils_toggle_bookmarked');

  await expect(toggle).toBeVisible();

  // Mode 1 hides bookmarked works. #card-color carries no bookmark marker: only
  // a real browser can resolve its bookmark button's computed color.
  await toggle.click();

  await expect(page.locator('#card-marker')).toBeHidden();
  await expect(page.locator('#card-color')).toBeHidden();
  await expect(page.locator('#card-plain')).toBeVisible();

  // Mode 2 hides the remaining, not-bookmarked works.
  await toggle.click();

  await expect(page.locator('#card-plain')).toBeHidden();
  await expect(page.locator('#card-marker')).toBeVisible();
  await expect(page.locator('#card-color')).toBeVisible();
});
