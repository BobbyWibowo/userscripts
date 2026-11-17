import { expect, test } from '@playwright/test';

const FIXTURE_PATH = '/tests/fixtures/pixiv-grid.html';
const SCRIPT_PATH = 'src/pixiv-utils.user.js';
// Loaded like the @require it replaces: the pinned devDependency copy is
// byte-identical to the SRI-checked CDN file the userscript fetches.
const GMCONFIG_PATH = 'node_modules/@kobzi/gmconfig/dist/gmConfig.iife.js';

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
  window.GM_registerMenuCommand = (label, callback) => {
    window.__gmMenuCommands.push({ label, callback });
    return window.__gmMenuCommands.length;
  };
  window.__gmMenuCommands = [];

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
  await page.addInitScript({ path: GMCONFIG_PATH });
  await page.addInitScript({ path: SCRIPT_PATH });
  await page.goto(FIXTURE_PATH);
};

/**
 * Open the settings dialog through the recorded GM menu command — the same
 * entry point a userscript manager invokes.
 */
const openSettings = async page => {
  await page.evaluate(() => {
    const command = window.__gmMenuCommands?.find(entry => entry.label.includes('⚙️'));
    if (!command) throw new Error('Settings menu command not registered');
    // The callback resolves only once the dialog closes (gmConfig's open()
    // returns a save/cancel promise), so it must not be awaited here; the
    // callback handles its own errors internally.
    command.callback();
  });
  await expect(page.locator('.gc-p')).toBeVisible();
};

/**
 * Answer the panel's bookmark API calls locally (per repo rules: intercept
 * instead of calling live services) so the panel reaches its loaded state.
 */
const routeBookmarkApi = async (page, tags) => {
  await page.route('**/illusts/bookmark/tags*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ body: { tags: { public: tags } } })
  }));
  await page.route('**/bookmarkData*', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ body: { isBookmarkable: true, bookmarkData: null } })
  }));
};

const clickEditBookmark = async page => {
  await page.locator('#card-marker .controls .pixiv_utils_edit_bookmark').click();
  await expect(page.locator('.pixiv-utils-edit-bookmark-panel')).toBeVisible();
};

/**
 * Boot the fixture with routed API responses and open the fancy Edit Bookmark
 * panel in its loaded state (tag data applied, save button enabled).
 */
const openEditBookmarkPanel = async (page, tags = [{ tag: 'foo', cnt: 2 }]) => {
  await openFixture(page, { SETTINGS_LANGUAGE: 'en' });
  await routeBookmarkApi(page, tags);
  await clickEditBookmark(page);
  await expect(page.locator('.pixiv-utils-edit-bookmark-apply')).toBeEnabled();
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

test('renders the edit bookmark panel controls at their designed box sizes', async ({ page }) => {
  await openEditBookmarkPanel(page);

  // The segmented group is border-box: the 1px frame sits inside the 40px.
  const group = page.locator('.pixiv-utils-edit-bookmark-segment-group');
  expect(await group.evaluate(el => getComputedStyle(el).minHeight)).toBe('40px');
  expect((await group.boundingBox()).height).toBeCloseTo(40, 0);

  // Both segments share the row equally and fill the bordered content box.
  const segments = page.locator('.pixiv-utils-edit-bookmark-segment');
  const first = await segments.nth(0).boundingBox();
  const second = await segments.nth(1).boundingBox();
  expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
  expect(first.height).toBeCloseTo(38, 0);

  // Rows and buttons share the same 40px box on desktop.
  expect((await page.locator('.pixiv-utils-edit-bookmark-tag').first().boundingBox()).height).toBeCloseTo(40, 0);
  expect((await page.locator('.pixiv-utils-edit-bookmark-apply').boundingBox()).height).toBeCloseTo(40, 0);

  // The selected segment follows the cascade (:has(input:checked)), not UA styles.
  const publicSegment = page.locator('.pixiv-utils-edit-bookmark-segment').nth(0);
  const privateSegment = page.locator('.pixiv-utils-edit-bookmark-segment').nth(1);
  const accent = 'rgb(0, 150, 250)';
  expect(await publicSegment.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(accent);

  await privateSegment.click();
  expect(await privateSegment.locator('input').isChecked()).toBe(true);
  // Backgrounds transition for 120ms: poll for the settled values instead of
  // sampling the interpolated midpoint.
  await expect.poll(() => privateSegment.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(accent);
  await expect.poll(() => publicSegment.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(accent);

  // Tag checkboxes are custom-styled instead of native.
  const checkbox = page.locator('.pixiv-utils-edit-bookmark-tag input[type="checkbox"]').first();
  expect(await checkbox.evaluate(el => getComputedStyle(el).appearance)).toBe('none');
  expect((await checkbox.boundingBox()).width).toBeCloseTo(18, 0);
});

test('raises control heights to 44px in a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditBookmarkPanel(page);

  expect((await page.locator('.pixiv-utils-edit-bookmark-tag').first().boundingBox()).height).toBeCloseTo(44, 0);
  expect((await page.locator('.pixiv-utils-edit-bookmark-segment-group').boundingBox()).height).toBeCloseTo(44, 0);
  expect((await page.locator('.pixiv-utils-edit-bookmark-apply').boundingBox()).height).toBeCloseTo(44, 0);
});

test('gives the status row top padding only while a message shows', async ({ page }) => {
  await openEditBookmarkPanel(page, [{ tag: 'foo', cnt: 2 }]);

  const paddingTop = () => page.locator('.pixiv-utils-edit-bookmark-status')
    .evaluate(el => getComputedStyle(el).paddingTop);

  // Loaded with tags: the message is cleared, so the row keeps no gap.
  expect(await paddingTop()).toBe('0px');

  // Reloading with an empty tag list surfaces the "no tags" message.
  await routeBookmarkApi(page, []);
  await page.reload();
  await clickEditBookmark(page);
  await expect(page.locator('.pixiv-utils-edit-bookmark-apply')).toBeEnabled();
  await expect(page.locator('.pixiv-utils-edit-bookmark-status-message')).not.toHaveText('');
  expect(await paddingTop()).toBe('8px');
});

test('mutes tag texts while their checkboxes are disabled', async ({ page }) => {
  await openFixture(page, { SETTINGS_LANGUAGE: 'en' });
  await routeBookmarkApi(page, [{ tag: 'foo', cnt: 2 }]);

  // Hold the bookmark-state request so the panel renders its rows (all
  // disabled) while the item's data is still pending.
  let releaseData;
  const dataPending = new Promise(resolve => { releaseData = resolve; });
  await page.route('**/bookmarkData*', async route => {
    await dataPending;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ body: { isBookmarkable: true, bookmarkData: null } })
    });
  });

  await clickEditBookmark(page);

  const checkbox = page.locator('.pixiv-utils-edit-bookmark-tag input[type="checkbox"]').first();
  const tagText = page.locator('.pixiv-utils-edit-bookmark-tag > span:not(.pixiv-utils-edit-bookmark-tag-count)').first();
  const count = page.locator('.pixiv-utils-edit-bookmark-tag-count').first();

  // While the state is pending every row is disabled and the text shares
  // the muted color of the always-muted count pill.
  await expect(checkbox).toBeDisabled();
  expect(await tagText.evaluate(el => getComputedStyle(el).color))
    .toBe(await count.evaluate(el => getComputedStyle(el).color));

  releaseData();

  // Once the state resolves the rows re-render enabled and the text returns.
  await expect(page.locator('.pixiv-utils-edit-bookmark-apply')).toBeEnabled();
  await expect(checkbox).toBeEnabled();
  expect(await tagText.evaluate(el => getComputedStyle(el).color))
    .not.toBe(await count.evaluate(el => getComputedStyle(el).color));
});

test('follows the light/dark color scheme for panel surfaces', async ({ page }) => {
  await openEditBookmarkPanel(page);

  const background = () => page.locator('.pixiv-utils-edit-bookmark-segment-group')
    .evaluate(el => getComputedStyle(el).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  const light = await background();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await background();

  expect(dark).not.toBe(light);
});

test('renders settings controls at the shared box heights', async ({ page }) => {
  await openFixture(page, { SETTINGS_LANGUAGE: 'en' });
  await openSettings(page);

  // Nav pills and footer buttons share the 36px desktop box.
  expect((await page.locator('.gc-tb > button').first().boundingBox()).height).toBeCloseTo(36, 0);
  expect((await page.locator('.gc-f button').first().boundingBox()).height).toBeCloseTo(36, 0);

  // The General tab carries the language select and the mode checkboxes.
  await page.locator('.gc-tb > button', { hasText: 'General' }).click();
  const select = page.locator('.gc-p select:visible').first();
  await expect(select).toBeVisible();
  expect((await select.boundingBox()).height).toBeCloseTo(36, 0);
  // A custom chevron replaces the native select arrow.
  expect(await select.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('data:image/svg+xml');

  const checkbox = page.locator('.gc-p input[type="checkbox"]:visible').first();
  await expect(checkbox).toBeVisible();
  expect(await checkbox.evaluate(el => getComputedStyle(el).appearance)).toBe('none');
  expect((await checkbox.boundingBox()).width).toBeCloseTo(18, 0);

  // Number fields (WAIT_FOR_POLL) live on the Advanced tab.
  await page.locator('.gc-tb > button', { hasText: 'Advanced' }).click();
  const number = page.locator('.gc-p input[type="number"]:visible').first();
  await expect(number).toBeVisible();
  expect((await number.boundingBox()).height).toBeCloseTo(36, 0);

  // The Backup tab's buttons share the same button box.
  await page.locator('.gc-tb > button', { hasText: 'Backup' }).click();
  const backupButton = page.locator('.pixiv-utils-backup-buttons button:visible').first();
  await expect(backupButton).toBeVisible();
  expect((await backupButton.boundingBox()).height).toBeCloseTo(36, 0);
});

test('raises settings controls to 44px in a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, { SETTINGS_LANGUAGE: 'en' });
  await openSettings(page);

  expect((await page.locator('.gc-tb > button').first().boundingBox()).height).toBeCloseTo(44, 0);
  expect((await page.locator('.gc-f button').first().boundingBox()).height).toBeCloseTo(44, 0);

  await page.locator('.gc-tb > button', { hasText: 'General' }).click();
  const select = page.locator('.gc-p select:visible').first();
  await expect(select).toBeVisible();
  expect((await select.boundingBox()).height).toBeCloseTo(44, 0);
});
