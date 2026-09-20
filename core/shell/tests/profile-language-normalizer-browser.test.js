'use strict';

/**
 * core/shell/tests/profile-language-normalizer-browser.test.js
 * Profile Phase 2A-2 — real-browser (Playwright + headless Chromium)
 * check that the real registry, the 2A-1 contract and the 2A-2 normalizer
 * cooperate through window.CozyOS as script tags would wire them.
 * Same launch pattern as the other profile browser tests (Termux-aware);
 * skips honestly if playwright is not installed.
 * Run: node core/shell/tests/profile-language-normalizer-browser.test.js
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
const HARNESS = '/core/shell/tests/profile-language-normalizer-harness.html';

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

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (_err) { console.log('SKIPPED: playwright not installed in this environment. This is honestly reported, not a pass.'); process.exit(0); }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));
  try {
    await test('NORMALIZES in a real browser: the plan example, mixed valid/invalid, old profile, languagePreference untouched, no page errors', async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + HARNESS);
      const r = await page.evaluate(() => {
        const N = window.CozyOS.DashboardProfileLanguageNormalizer;
        const input = { languagePreference: 'sw', firstName: 'Charles', motherLanguages: ['luo', 'sw', 'luo'], languagesKnown: ['en', 'sw'] };
        const before = JSON.stringify(input);
        return {
          example: N.normalizeLanguageProfile({ motherLanguages: ['luo', 'sw', 'luo'], languagesKnown: ['en', 'sw'] }),
          mixed: N.normalizeLanguageProfile({ motherLanguages: ['luo', 'xx'], languagesKnown: ['en'] }),
          old: N.withNormalizedLanguages({ firstName: 'Ada' }),
          whole: N.withNormalizedLanguages(input),
          inputUnchanged: JSON.stringify(input) === before,
          registered: !!window.CozyOS.Modules['dashboard-profile-language-normalizer'],
        };
      });
      assert.deepEqual(r.example, { ok: true, profile: { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'sw', 'luo'] }, rejected: [], partial: null });
      assert.equal(r.mixed.ok, false);
      assert.equal(r.mixed.profile, null);
      assert.deepEqual(r.mixed.rejected, [{ field: 'motherLanguages', index: 1, value: 'xx', reason: 'UNKNOWN_LANGUAGE_ID' }]);
      assert.deepEqual(r.mixed.partial, { motherLanguages: ['luo'], languagesKnown: ['en', 'luo'] });
      assert.deepEqual(r.old.profile, { firstName: 'Ada', motherLanguages: [], languagesKnown: [] });
      assert.deepEqual(r.whole.profile, { languagePreference: 'sw', firstName: 'Charles', motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'sw', 'luo'] });
      assert.equal(r.inputUnchanged, true);
      assert.equal(r.registered, true);
      assert.deepEqual(errors, []);
      await page.close();
    });

    await test('FAILS CLOSED in a real browser: registry script blocked -> REGISTRY_UNAVAILABLE for ids, empty profile still reads as empty', async () => {
      const page = await browser.newPage();
      await page.route('**/cozy-language-pack-registry.js', (route) => route.abort());
      await page.goto(base + HARNESS);
      const r = await page.evaluate(() => {
        const N = window.CozyOS.DashboardProfileLanguageNormalizer;
        return { withIds: N.normalizeLanguageProfile({ motherLanguages: ['luo'] }), empty: N.normalizeLanguageProfile({}) };
      });
      assert.deepEqual(r.withIds, { ok: false, profile: null, rejected: [], partial: null, reason: 'REGISTRY_UNAVAILABLE' });
      assert.deepEqual(r.empty.profile, { motherLanguages: [], languagesKnown: [] });
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
