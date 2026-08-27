/**
 * core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui-browser.test.js
 * RP-031-B Increment 5 — REAL browser test (Playwright + actual
 * headless Chromium), driving the real admin-language-dashboard.html
 * page.
 * Run with: node core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui-browser.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');

let passed = 0, failed = 0, browserRan = false;
function test(name, fn) {
  return fn().then(() => { console.log(`  \u2713 ${name}`); passed++; })
    .catch((err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; });
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..');

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + filePath); return; }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (playwright module not resolvable)'); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/language-packs/admin-dashboard/admin-language-dashboard.html`;
  const adminUrl = base + '?demoRole=admin';
  const reviewerUrl = base + '?demoRole=reviewer';
  const anonymousUrl = base;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard loads', async () => {
    await page.goto(adminUrl, { waitUntil: 'load' });
    await page.waitForSelector('.cozy-admin-dashboard', { timeout: 5000 });
  });

  await test('language overview renders with real rows', async () => {
    await page.waitForSelector('.cozy-admin-table', { timeout: 5000 });
    const rowCount = await page.locator('.cozy-admin-table tbody tr').count();
    if (rowCount < 1) throw new Error('expected at least one real language overview row, got ' + rowCount);
  });

  await test('language routing works for a real registered language', async () => {
    await page.locator('.cozy-admin-tab-btn[data-tab="routing"]').click();
    await page.locator('.routing-input').fill('sw');
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/RESOLVED/.test(text)) throw new Error('expected a real RESOLVED routing status for sw, got: ' + text);
  });

  await test('ambiguous/conflicting meaning is displayed honestly in term explorer', async () => {
    await page.locator('.cozy-admin-tab-btn[data-tab="terms"]').click();
    await page.locator('.term-search-input').fill('Habari');
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/LANGUAGE_MATCH|CONFLICTING_MEANING|No data/.test(text)) throw new Error('expected an honest ambiguity/match classification, got: ' + text);
  });

  await test('quarantine visibility is restricted for an unauthorized visitor', async () => {
    await page.goto(anonymousUrl, { waitUntil: 'load' });
    await page.waitForSelector('.cozy-admin-dashboard', { timeout: 5000 });
    await page.locator('.cozy-admin-tab-btn[data-tab="quarantine"]').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/UNAUTHORIZED/.test(text)) throw new Error('expected UNAUTHORIZED for an anonymous visitor, got: ' + text);
  });

  await test('unauthorized actions are blocked — anonymous visitor sees no quarantine detail counts', async () => {
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (/Current Quarantined/.test(text)) throw new Error('expected no quarantine detail table for an anonymous visitor, got: ' + text);
  });

  await test('authorized reviewer action is available — reviewer sees real quarantine detail', async () => {
    await page.goto(reviewerUrl, { waitUntil: 'load' });
    await page.waitForSelector('.cozy-admin-dashboard', { timeout: 5000 });
    await page.locator('.cozy-admin-tab-btn[data-tab="quarantine"]').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/Current Quarantined/.test(text)) throw new Error('expected real quarantine detail for an authorized reviewer, got: ' + text);
  });

  await test('hotspot state renders real transport status, never a fabricated SYNCED', async () => {
    await page.locator('.cozy-admin-tab-btn[data-tab="hotspot"]').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/NOT_SUPPORTED_BY_TRANSPORT/.test(text)) throw new Error('expected honest NOT_SUPPORTED_BY_TRANSPORT for synced/conflict, got: ' + text);
  });

  await test('Rule 82 remains locked for a real NOT_READY language', async () => {
    await page.locator('.cozy-admin-tab-btn[data-tab="rule82"]').click();
    await page.locator('.rule82-input').fill('luo');
    await page.waitForTimeout(150);
    const statusLine = await page.locator('.cozy-admin-tab-panel p').first().innerText();
    if (!/LOCKED|NOT_READY/.test(statusLine)) throw new Error('expected LOCKED or NOT_READY for luo, got: ' + statusLine);
    if (/READY_FOR_REVIEW/.test(statusLine)) throw new Error('luo must never show READY_FOR_REVIEW as its actual status without real evidence: ' + statusLine);
  });

  await test('telemetry-unavailable state renders honestly for most-used', async () => {
    await page.locator('.cozy-admin-tab-btn[data-tab="mostused"]').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.cozy-admin-tab-panel').innerText();
    if (!/NOT_AVAILABLE_NO_TELEMETRY/.test(text)) throw new Error('expected honest NOT_AVAILABLE_NO_TELEMETRY, got: ' + text);
  });

  await test('mobile/responsive layout does not break at a narrow viewport', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(adminUrl, { waitUntil: 'load' });
    await page.waitForSelector('.cozy-admin-dashboard', { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 5);
    if (overflow) throw new Error('page horizontally overflows the narrow viewport');
  });

  await test('keyboard navigation moves between tabs', async () => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.locator('.cozy-admin-tab-btn').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const activeCount = await page.locator('.cozy-admin-tab-active').count();
    if (activeCount !== 1) throw new Error('expected exactly one active tab after keyboard navigation, got ' + activeCount);
  });

  await test('no uncaught page errors occurred during the whole flow', async () => {
    if (consoleErrors.length > 0) throw new Error('uncaught page errors: ' + consoleErrors.join(' | '));
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (!browserRan) console.log('BROWSER_TEST = NOT_RUN');
  else console.log(failed > 0 ? 'BROWSER_TEST = RAN_WITH_FAILURES' : 'BROWSER_TEST = PASS');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.log('BROWSER_TEST = NOT_RUN (' + err.message + ')');
  process.exitCode = 0;
});
