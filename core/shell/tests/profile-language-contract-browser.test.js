'use strict';

/**
 * core/shell/tests/profile-language-contract-browser.test.js
 * Profile Phase 2A-1 — real-browser (Playwright + headless Chromium)
 * check that the real Tier-1 registry and the language contract load and
 * cooperate through window.CozyOS exactly as script tags would wire them
 * on a dashboard page. Same launch pattern as profile-phase1-browser.test.js
 * (Termux-aware). Skips honestly if playwright is not installed.
 * Run: node core/shell/tests/profile-language-contract-browser.test.js
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
const HARNESS = '/core/shell/tests/profile-language-contract-harness.html';

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
    await test('REGISTRY + CONTRACT LOAD: 17 languages resolve in a real browser, metadata straight from the registry, no page errors', async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base + HARNESS);
      const r = await page.evaluate(() => {
        const C = window.CozyOS.DashboardProfileLanguageContract, R = window.CozyOS.CozyLanguagePacks;
        const luo = C.getLanguage('LUO ');
        return {
          count: C.listLanguages().languages.length,
          luo: [luo.id, luo.name, luo.nativeName, luo.bcp47],
          sameAsRegistry: C.listLanguages().languages.every((l) => { const i = R.getPack(l.id).identity; return l.name === i.name && l.nativeName === i.nativeName && l.bcp47 === (i.iso || null); }),
          lg: C.resolveLanguageId('lg'),
          bad: C.resolveLanguageId(42),
          gikuyu: C.searchLanguages('gikuyu').languages.map((l) => l.id),
          empty: C.emptyLanguageProfile(),
          moduleRegistered: !!window.CozyOS.Modules['dashboard-profile-language-contract'],
        };
      });
      assert.equal(r.count, 17);
      assert.deepEqual(r.luo, ['luo', 'Luo / Dholuo', 'Dholuo', null]);
      assert.equal(r.sameAsRegistry, true);
      assert.deepEqual(r.lg, { ok: false, reason: 'UNKNOWN_LANGUAGE_ID' });
      assert.deepEqual(r.bad, { ok: false, reason: 'INVALID_ID' });
      assert.deepEqual(r.gikuyu, ['ki']);
      assert.deepEqual(r.empty, { motherLanguages: [], languagesKnown: [] });
      assert.equal(r.moduleRegistered, true);
      assert.deepEqual(errors, []);
      await page.close();
    });

    await test('FAILS CLOSED in a real browser: when the registry script cannot load, the contract reports REGISTRY_UNAVAILABLE and lists nothing', async () => {
      const page = await browser.newPage();
      await page.route('**/cozy-language-pack-registry.js', (route) => route.abort());
      await page.goto(base + HARNESS);
      const r = await page.evaluate(() => {
        const C = window.CozyOS.DashboardProfileLanguageContract;
        return { resolve: C.resolveLanguageId('en'), list: C.listLanguages() };
      });
      assert.deepEqual(r.resolve, { ok: false, reason: 'REGISTRY_UNAVAILABLE' });
      assert.deepEqual(r.list, { ok: false, reason: 'REGISTRY_UNAVAILABLE', languages: [] });
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
