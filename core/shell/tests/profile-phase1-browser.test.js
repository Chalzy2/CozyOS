'use strict';

/**
 * core/shell/tests/profile-phase1-browser.test.js
 * User Profile Phase 1 — real browser test (Playwright + real headless
 * Chromium) of the real, unmodified Profile surface, IdentityEngine and
 * IdentityStorage (real IndexedDB) through core/shell/tests/
 * profile-phase1-harness.html. Nothing here inspects source text;
 * every assertion is about rendered geometry or runtime behavior.
 *
 * COVERS: profile loads; name/country/city edit + save; persistence
 * across a real page reload (IndexedDB); picture preview / replace /
 * remove / rejection; NO horizontal overflow at Android-class widths
 * (360px and 320px, mobile emulation with touch); the existing
 * login page still loads.
 *
 * Same launch/discovery pattern as taskbar-browser.test.js (composes
 * server/webauthn-rp/test/browser-launch.js, Termux-aware). Skips
 * honestly (exit 0, says SKIPPED) if playwright is not installed.
 *
 * Run: node core/shell/tests/profile-phase1-browser.test.js
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const assert = require('node:assert/strict');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; }
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const { resolveLaunchOptions } = require(path.join(REPO_ROOT, 'server', 'webauthn-rp', 'test', 'browser-launch.js'));
const HARNESS = '/core/shell/tests/profile-phase1-harness.html';
// 1x1 PNG (valid image) for the picture preview test
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(REPO_ROOT, rel);
      if (!filePath.startsWith(REPO_ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Every element inside `sel` whose box leaves the viewport horizontally, plus page-level scroll widths. */
async function overflowReport(page, sel) {
  return page.evaluate((selector) => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector(selector);
    const offenders = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el.hidden || getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < -0.5 || r.right > vw + 0.5) offenders.push(`${el.tagName.toLowerCase()}#${el.id || ''}.${el.className || ''} [${Math.round(r.left)},${Math.round(r.right)}]`);
    });
    return {
      viewport: vw,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      cardScrollWidth: root.scrollWidth,
      cardClientWidth: root.clientWidth,
      offenders,
    };
  }, sel);
}

async function openProfile(browser, base, viewport) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + HARNESS);
  await page.waitForFunction(() => window.__profileHarness && (window.__profileHarness.ready || window.__profileHarness.error), null, { timeout: 15000 });
  const state = await page.evaluate(() => window.__profileHarness);
  if (!state.ready) throw new Error('harness failed: ' + state.error);
  await page.waitForSelector('#cozy-ud-profile-card', { state: 'visible' });
  return { context, page, errors };
}

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (_err) {
    console.log('SKIPPED: playwright not installed in this environment. This is honestly reported, not a pass.');
    process.exit(0);
  }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));

  try {
    // ---------------------------------------------------------------- loads + layout
    await test('LOADS (360x640 Android-class): profile surface renders with picture block, Full Name, Country, City, Save and no page errors', async () => {
      const { context, page, errors } = await openProfile(browser, base, { width: 360, height: 640 });
      for (const sel of ['#cozy-ud-profile-picture', '#cozy-ud-avatar', '#cozy-ud-profile-fullname', '#cozy-ud-profile-country', '#cozy-ud-profile-city', '#cozy-ud-profile-save']) {
        assert.equal(await page.locator(sel).isVisible(), true, sel + ' should be visible');
      }
      assert.equal(await page.inputValue('#cozy-ud-profile-fullname'), 'Charles Owuor');
      assert.equal(await page.inputValue('#cozy-ud-profile-country'), '');
      assert.equal(await page.inputValue('#cozy-ud-profile-city'), '');
      assert.equal(await page.locator('#cozy-ud-profile-country option').count(), 250);
      assert.deepEqual(errors, []);
      await context.close();
    });

    for (const width of [360, 320]) {
      await test(`LAYOUT (${width}px): the Profile card has no horizontal overflow — nothing leaves the viewport, card does not scroll sideways`, async () => {
        const { context, page } = await openProfile(browser, base, { width, height: 640 });
        const r = await overflowReport(page, '#cozy-ud-profile-card');
        assert.deepEqual(r.offenders, [], JSON.stringify(r));
        assert.ok(r.cardScrollWidth <= r.cardClientWidth, JSON.stringify(r));
        assert.ok(r.docScrollWidth <= r.viewport, `page-level horizontal overflow: ${JSON.stringify(r)}`);
        assert.ok(r.bodyScrollWidth <= r.viewport, JSON.stringify(r));
        await context.close();
      });
    }

    await test('LAYOUT (320px): worst-case content (100-char unbroken name, 80-char unbroken city, error messages, picture preview) still causes no horizontal overflow', async () => {
      const { context, page } = await openProfile(browser, base, { width: 320, height: 640 });
      await page.fill('#cozy-ud-profile-fullname', 'W'.repeat(100));
      await page.fill('#cozy-ud-profile-city', 'M'.repeat(80));
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }); // -> long-ish error text
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });
      await page.click('#cozy-ud-profile-save');
      await page.waitForFunction(() => document.querySelector('#cozy-ud-profile-status').textContent.length > 0);
      const r = await overflowReport(page, '#cozy-ud-profile-card');
      assert.deepEqual(r.offenders, [], JSON.stringify(r));
      assert.ok(r.docScrollWidth <= r.viewport, JSON.stringify(r));
      await context.close();
    });

    await test('LAYOUT: touch targets on the Profile card are at least 44px tall (inputs, select, Save, picture buttons)', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      for (const sel of ['#cozy-ud-profile-fullname', '#cozy-ud-profile-country', '#cozy-ud-profile-city', '#cozy-ud-profile-save', '#cozy-ud-avatar-choose']) {
        const box = await page.locator(sel).boundingBox();
        assert.ok(box.height >= 43.5, `${sel} is ${box.height}px tall`);
      }
      await context.close();
    });

    // ---------------------------------------------------------------- edit + persistence
    await test('EDIT + PERSIST: name, country and city save to the real IdentityEngine/IndexedDB and survive a full page reload', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      await page.fill('#cozy-ud-profile-fullname', "Amina O'Brien Wanjiru");
      await page.selectOption('#cozy-ud-profile-country', 'TZ');
      await page.fill('#cozy-ud-profile-city', 'Dar es Salaam');
      await page.click('#cozy-ud-profile-save');
      await page.waitForFunction(() => /Profile saved/.test(document.querySelector('#cozy-ud-profile-status').textContent));
      const stored = await page.evaluate((id) => window.CozyOS.IdentityEngine.getProfile(id), (await page.evaluate(() => window.__profileHarness.userId)));
      assert.deepEqual(stored, { available: true, firstName: 'Amina', lastName: 'O&#39;Brien Wanjiru', country: 'Tanzania', city: 'Dar es Salaam', motherLanguages: [], languagesKnown: [] }); // 2A-3: getProfile() also returns the two language lists ([] for a record that never had them)
      await page.reload();
      await page.waitForFunction(() => window.__profileHarness && (window.__profileHarness.ready || window.__profileHarness.error));
      assert.equal((await page.evaluate(() => window.__profileHarness)).ready, true);
      await page.waitForSelector('#cozy-ud-profile-card', { state: 'visible' });
      assert.equal(await page.inputValue('#cozy-ud-profile-fullname'), "Amina O'Brien Wanjiru");
      assert.equal(await page.inputValue('#cozy-ud-profile-country'), 'TZ');
      assert.equal(await page.inputValue('#cozy-ud-profile-city'), 'Dar es Salaam');
      // Kenya is selectable like any other country
      await page.selectOption('#cozy-ud-profile-country', 'KE');
      await page.click('#cozy-ud-profile-save');
      await page.waitForFunction(() => /Profile saved/.test(document.querySelector('#cozy-ud-profile-status').textContent));
      assert.equal((await page.evaluate((id) => window.CozyOS.IdentityEngine.getProfile(id).country, await page.evaluate(() => window.__profileHarness.userId))), 'Kenya');
      await context.close();
    });

    await test('VALIDATION: an emptied name is refused in the browser with a visible error, nothing is written', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      await page.fill('#cozy-ud-profile-fullname', '   ');
      await page.click('#cozy-ud-profile-save');
      assert.match(await page.textContent('#cozy-ud-profile-fullname-error'), /cannot be empty/i);
      assert.equal(await page.locator('#cozy-ud-profile-fullname-error').isVisible(), true);
      const p = await page.evaluate((id) => window.CozyOS.IdentityEngine.getProfile(id), await page.evaluate(() => window.__profileHarness.userId));
      assert.equal(p.firstName, 'Charles');
      await context.close();
    });

    await test('SAFETY: a markup-laden name is stored and shown as inert text (no injected element, no script run)', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      await page.fill('#cozy-ud-profile-fullname', '<img src=x onerror="window.__xss=1"> Owuor');
      await page.click('#cozy-ud-profile-save');
      await page.waitForFunction(() => /Profile saved/.test(document.querySelector('#cozy-ud-profile-status').textContent));
      await page.addInitScript(() => { window.__xss = 0; }); // survives the reload; any injected onerror would flip it to 1
      await page.reload();
      await page.waitForSelector('#cozy-ud-profile-card', { state: 'visible' });
      assert.equal(await page.inputValue('#cozy-ud-profile-fullname'), '<img src=x onerror="window.__xss=1"> Owuor');
      assert.equal(await page.locator('#cozy-ud-profile-card img[src="x"]').count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), 0);
      await context.close();
    });

    // ---------------------------------------------------------------- picture
    await test('PICTURE: choose -> real preview (image decodes), Replace/Remove appear; Remove restores initials; nothing is persisted', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      assert.equal((await page.textContent('#cozy-ud-avatar')).trim(), 'CO');
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });
      await page.waitForSelector('#cozy-ud-avatar img');
      assert.equal(await page.evaluate(() => document.querySelector('#cozy-ud-avatar img').naturalWidth), 1);
      assert.match(await page.getAttribute('#cozy-ud-avatar img', 'src'), /^blob:/);
      assert.equal(await page.locator('#cozy-ud-avatar-choose').isVisible(), false);
      assert.equal(await page.locator('#cozy-ud-avatar-replace').isVisible(), true);
      assert.equal(await page.locator('#cozy-ud-avatar-remove').isVisible(), true);
      // replace with a second image
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'two.png', mimeType: 'image/png', buffer: PNG_1X1 });
      await page.waitForFunction(() => document.querySelectorAll('#cozy-ud-avatar img').length === 1);
      await page.click('#cozy-ud-avatar-remove');
      assert.equal(await page.locator('#cozy-ud-avatar img').count(), 0);
      assert.equal((await page.textContent('#cozy-ud-avatar')).trim(), 'CO');
      assert.match(await page.textContent('#cozy-ud-profile-picture'), /Not implemented.*Profile Phase 2/s);
      // the preview never reached storage: the stored user record has no picture-ish field
      const keys = await page.evaluate(async () => {
        const IE = window.CozyOS.IdentityEngine; const id = window.__profileHarness.userId;
        const recs = (await window.CozyOS.IdentityStorage.loadAll('users')).records.filter(r => r.id === id);
        return Object.keys(recs[0] || {});
      });
      assert.equal(keys.some(k => /pic|photo|avatar|image/i.test(k)), false, keys.join(','));
      await context.close();
    });

    await test('PICTURE VALIDATION: SVG and oversized files are refused with a visible message and no preview appears', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
      assert.match(await page.textContent('#cozy-ud-avatar-error'), /JPEG, PNG or WebP/);
      assert.equal(await page.locator('#cozy-ud-avatar img').count(), 0);
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
      assert.match(await page.textContent('#cozy-ud-avatar-error'), /too large/i);
      assert.equal(await page.locator('#cozy-ud-avatar img').count(), 0);
      await context.close();
    });

    await test('PICTURE: a file that claims image/png but is not an image is dropped with a message (img decode error handled)', async () => {
      const { context, page } = await openProfile(browser, base, { width: 360, height: 640 });
      await page.setInputFiles('#cozy-ud-avatar-file', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
      await page.waitForFunction(() => document.querySelectorAll('#cozy-ud-avatar img').length === 0 && /could not be displayed/i.test(document.querySelector('#cozy-ud-avatar-error').textContent), null, { timeout: 5000 });
      assert.equal((await page.textContent('#cozy-ud-avatar')).trim(), 'CO');
      await context.close();
    });

    // ---------------------------------------------------------------- existing authentication still loads
    await test('AUTH STILL LOADS: the real login.html loads in the browser with no uncaught page errors and shows its sign-in form', async () => {
      const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#cozy-login-card', { state: 'attached', timeout: 15000 });
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('#cozy-login-submit').count(), 1);
      // login.html dynamically imports Firebase from gstatic.com; when the machine is offline (e.g. a
      // sandbox) that import fails. That is a network condition, not a page/code error, so it is the ONLY
      // error tolerated here — anything else fails the test.
      const unexpected = errors.filter((e) => !/Failed to fetch dynamically imported module: https:\/\/www\.gstatic\.com\//.test(e));
      assert.deepEqual(unexpected, []);
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
