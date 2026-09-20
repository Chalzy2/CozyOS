'use strict';

/**
 * core/shell/tests/profile-language-persistence-browser.test.js
 * Profile Phase 2A-3 — real-browser (Playwright + headless Chromium) proof that the language
 * lists persist through the REAL IdentityEngine into the REAL IdentityStorage (IndexedDB) and
 * survive a full page reload, and that rejection / storage failure leave the stored profile
 * untouched. Same launch pattern as the other profile browser tests (Termux-aware); skips
 * honestly if playwright is not installed.
 * Run: node core/shell/tests/profile-language-persistence-browser.test.js
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
const HARNESS = '/core/shell/tests/profile-language-persistence-harness.html';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!filePath.startsWith(REPO_ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function open(context, base) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + HARNESS);
  await page.waitForFunction(() => window.__langHarness && (window.__langHarness.ready || window.__langHarness.error), null, { timeout: 15000 });
  const state = await page.evaluate(() => window.__langHarness);
  if (!state.ready) throw new Error('harness failed: ' + state.error);
  return { page, errors, userId: state.userId };
}
const profileOf = (page, userId) => page.evaluate((id) => window.CozyOS.IdentityEngine.getProfile(id), userId);
const storedOf = (page, userId) => page.evaluate(async (id) => { const r = await window.CozyOS.IdentityStorage.loadAll('users'); const u = r.records.find((x) => x.id === id); return u ? { motherLanguages: u.motherLanguages, languagesKnown: u.languagesKnown, hasM: 'motherLanguages' in u, hasK: 'languagesKnown' in u, languagePreference: u.languagePreference ?? null, city: u.city ?? null, firstName: u.firstName } : null; }, userId);

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (_err) { console.log('SKIPPED: playwright not installed in this environment. This is honestly reported, not a pass.'); process.exit(0); }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));
  try {
    await test('OLD PROFILE (real IndexedDB): a user saved before 2A-3 reads as [] / [] after a reload, existing fields intact', async () => {
      const context = await browser.newContext();
      const first = await open(context, base);
      await first.page.close();
      const { page, userId, errors } = await open(context, base);
      const p = await profileOf(page, userId);
      assert.deepEqual(p, { available: true, firstName: 'Charles', lastName: 'Owuor', country: 'Kenya', city: null, motherLanguages: [], languagesKnown: [] });
      assert.equal((await storedOf(page, userId)).hasM, false);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await test('SAVE -> RELOAD (real IndexedDB): mother [luo,sw] / known [en,sw,luo] survive a full page reload exactly; normalized before save', async () => {
      const context = await browser.newContext();
      const a = await open(context, base);
      const r = await a.page.evaluate((id) => window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['luo', 'sw', 'luo'], languagesKnown: ['en', 'sw'] }), a.userId);
      assert.deepEqual(r, { available: true, updated: ['motherLanguages', 'languagesKnown'], persisted: true });
      await a.page.close();
      const b = await open(context, base);
      const p = await profileOf(b.page, b.userId);
      assert.deepEqual([p.motherLanguages, p.languagesKnown], [['luo', 'sw'], ['en', 'sw', 'luo']]);
      const stored = await storedOf(b.page, b.userId);
      assert.deepEqual([stored.motherLanguages, stored.languagesKnown], [['luo', 'sw'], ['en', 'sw', 'luo']]);
      assert.deepEqual(b.errors, []);
      await context.close();
    });

    await test('INVALID + NO PARTIAL SAVE (real IndexedDB): a rejected request changes nothing in memory or in the database, even for the valid fields sent with it', async () => {
      const context = await browser.newContext();
      const a = await open(context, base);
      await a.page.evaluate((id) => window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['sw'], languagesKnown: ['sw', 'fr'] }), a.userId);
      const bad = await a.page.evaluate((id) => window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['luo'], languagesKnown: ['en', 'fake'], city: 'Mombasa' }), a.userId);
      assert.equal(bad.available, false);
      assert.equal(bad.languages.ok, false);
      assert.deepEqual(bad.languages.rejected, [{ field: 'languagesKnown', index: 1, value: 'fake', reason: 'UNKNOWN_LANGUAGE_ID' }]);
      assert.equal('persisted' in bad, false);
      await a.page.close();
      const b = await open(context, base);
      const p = await profileOf(b.page, b.userId);
      assert.deepEqual([p.motherLanguages, p.languagesKnown, p.city], [['sw'], ['sw', 'fr'], null]);
      await context.close();
    });

    await test('FAILED PERSISTENCE (real IndexedDB): when the storage write fails the call fails, nothing is claimed, and the earlier stored profile is intact after a reload', async () => {
      const context = await browser.newContext();
      const a = await open(context, base);
      await a.page.evaluate((id) => window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['sw'], languagesKnown: ['sw'] }), a.userId);
      const r = await a.page.evaluate(async (id) => {
        const S = window.CozyOS.IdentityStorage; const real = S.save;
        S.save = async () => ({ success: false, reason: 'simulated storage failure' });
        try { return { result: await window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['luo'], languagesKnown: ['luo'], city: 'Kisumu' }), during: window.CozyOS.IdentityEngine.getProfile(id) }; }
        finally { S.save = real; }
      }, a.userId);
      assert.deepEqual([r.result.available, r.result.persisted, r.result.persistReason], [false, false, 'simulated storage failure']);
      assert.deepEqual([r.during.motherLanguages, r.during.languagesKnown, r.during.city], [['sw'], ['sw'], null]);
      await a.page.close();
      const b = await open(context, base);
      const p = await profileOf(b.page, b.userId);
      assert.deepEqual([p.motherLanguages, p.languagesKnown, p.city], [['sw'], ['sw'], null]);
      await context.close();
    });

    await test('languagePreference INDEPENDENT (real IndexedDB): "en" + mother [luo] + known [luo,sw,en] all survive a reload untouched by each other', async () => {
      const context = await browser.newContext();
      const a = await open(context, base);
      await a.page.evaluate(async (id) => {
        window.CozyOS.IdentityEngine.setLanguagePreference(id, 'en');
        await new Promise((r) => setTimeout(r, 100));
        await window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['luo'], languagesKnown: ['luo', 'sw', 'en'] });
      }, a.userId);
      await a.page.close();
      const b = await open(context, base);
      const p = await profileOf(b.page, b.userId);
      const pref = await b.page.evaluate((id) => window.CozyOS.IdentityEngine.getLanguagePreference(id), b.userId);
      assert.equal(pref, 'en');
      assert.deepEqual([p.motherLanguages, p.languagesKnown], [['luo'], ['luo', 'sw', 'en']]);
      assert.deepEqual([p.firstName, p.lastName, p.country], ['Charles', 'Owuor', 'Kenya']);
      await context.close();
    });

    await test('FAIL CLOSED (real browser): with the registry script blocked, language ids are rejected (REGISTRY_UNAVAILABLE) and nothing is stored', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/cozy-language-pack-registry.js', (route) => route.abort());
      await page.goto(base + HARNESS);
      await page.waitForFunction(() => window.__langHarness && (window.__langHarness.ready || window.__langHarness.error));
      const userId = (await page.evaluate(() => window.__langHarness)).userId;
      const r = await page.evaluate((id) => window.CozyOS.IdentityEngine.updateProfile(id, { motherLanguages: ['luo'] }), userId);
      assert.deepEqual([r.available, r.languages.reason], [false, 'REGISTRY_UNAVAILABLE']);
      const stored = await storedOf(page, userId);
      assert.equal(stored.hasM, false);
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
