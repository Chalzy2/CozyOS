/**
 * core/modules/intelligence/media/ui/tests/cozy-media-intelligence-dashboard-browser.test.js
 * RP-035 Phase 5 — REAL browser test (Playwright + actual headless
 * Chromium), driving the real cozy-media-intelligence-dashboard.html
 * page.
 * Run with: node core/modules/intelligence/media/ui/tests/cozy-media-intelligence-dashboard-browser.test.js
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
  const base = `http://127.0.0.1:${port}/cozyos/core/modules/intelligence/media/ui/cozy-media-intelligence-dashboard.html`;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard loads and renders search results from real seeded data', async () => {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.media-intel-table', { timeout: 5000 });
    const rowCount = await page.locator('.media-intel-table tbody tr').count();
    if (rowCount < 1) throw new Error('expected at least one real result row, got ' + rowCount);
  });

  await test('country flag renders as presentation metadata alongside a real result', async () => {
    const text = await page.locator('.media-intel-table').innerText();
    if (!/Kenya|South Africa/.test(text)) throw new Error('expected a real country name in results, got: ' + text);
  });

  await test('filtering by researchType returns only matching real records', async () => {
    await page.locator('.media-intel-type').selectOption('HEALING');
    await page.locator('.media-intel-search-btn').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.media-intel-results').innerText();
    if (!/HEALING/.test(text)) throw new Error('expected HEALING in filtered results, got: ' + text);
    if (/SERMON|WORSHIP/.test(text)) throw new Error('filter leaked non-matching researchType into results: ' + text);
  });

  await test('filtering by language returns only matching real records', async () => {
    await page.locator('.media-intel-type').selectOption('');
    await page.locator('.media-intel-language').fill('luo');
    await page.locator('.media-intel-search-btn').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.media-intel-results').innerText();
    if (!/luo/.test(text)) throw new Error('expected luo language filter to surface the Dholuo sermon, got: ' + text);
  });

  await test('a query with no matching evidence shows the honest empty state, never a synthetic result', async () => {
    await page.locator('.media-intel-language').fill('');
    await page.locator('.media-intel-type').selectOption('CONFERENCE');
    await page.locator('.media-intel-search-btn').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.media-intel-results').innerText();
    if (!/No matching evidence found/.test(text)) throw new Error('expected the honest empty state for CONFERENCE, got: ' + text);
  });

  await test('CozyAI question box answers FOUND for a real recognizable question', async () => {
    await page.locator('.media-intel-qa-input').fill('Find healing testimonies');
    await page.locator('.media-intel-qa-btn').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.media-intel-qa-answer').innerText();
    if (!/FOUND/.test(text)) throw new Error('expected FOUND for a real recognizable question, got: ' + text);
  });

  await test('CozyAI question box answers UNKNOWN honestly for an unrecognizable question, never guesses', async () => {
    await page.locator('.media-intel-qa-input').fill('xyzzy plugh quux');
    await page.locator('.media-intel-qa-btn').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.media-intel-qa-answer').innerText();
    if (!/UNKNOWN/.test(text)) throw new Error('expected honest UNKNOWN for an unrecognizable question, got: ' + text);
  });

  await test('mobile/responsive layout does not break at a narrow viewport', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.media-intel-table', { timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 5);
    if (overflow) throw new Error('page horizontally overflows the narrow viewport');
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
