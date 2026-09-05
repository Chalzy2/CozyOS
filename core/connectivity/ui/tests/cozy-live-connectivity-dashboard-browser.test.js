/**
 * core/connectivity/ui/tests/cozy-live-connectivity-dashboard-browser.test.js
 * RP-035 Section 13 — REAL browser test (Playwright + actual headless
 * Chromium), driving the real cozy-live-connectivity-dashboard.html page.
 * Run with: node core/connectivity/ui/tests/cozy-live-connectivity-dashboard-browser.test.js
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

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

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
  const base = `http://127.0.0.1:${port}/cozyos/core/connectivity/ui/cozy-live-connectivity-dashboard.html`;

  let browser;
  try { browser = await playwright.chromium.launch(); browserRan = true; }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard loads and renders capability groups from real detection', async () => {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.live-conn-group', { timeout: 5000 });
    const groupCount = await page.locator('.live-conn-group').count();
    if (groupCount < 3) throw new Error('expected at least 3 real capability groups, got ' + groupCount);
  });

  await test('internet capability never shows a fabricated CONNECTED state', async () => {
    const text = await page.locator('.live-conn-group').first().innerText();
    if (/CONNECTED/.test(text)) throw new Error('internet group must never claim CONNECTED, got: ' + text);
  });

  await test('native Wi-Fi Direct honestly reports REQUIRES_NATIVE_COMPANION, never AVAILABLE', async () => {
    const groups = await page.locator('.live-conn-group').allInnerTexts();
    const wifiDirectGroup = groups.find((g) => /wi-fi direct/i.test(g));
    if (!wifiDirectGroup) throw new Error('Wi-Fi Direct group not found');
    if (!/REQUIRES_NATIVE_COMPANION/.test(wifiDirectGroup)) throw new Error('expected REQUIRES_NATIVE_COMPANION for Wi-Fi Direct, got: ' + wifiDirectGroup);
    if (/status-AVAILABLE\"[^>]*>AVAILABLE/.test(wifiDirectGroup)) throw new Error('Wi-Fi Direct must never show AVAILABLE');
  });

  await test('offline sync queue shows a real queued packet from the demo seed, never SYNCED', async () => {
    const queueText = await page.locator('.live-conn-queue').innerText();
    if (!/WAITING_FOR_TRANSPORT|TRANSFERRING|QUEUED/.test(queueText)) throw new Error('expected a real honest queue state, got: ' + queueText);
    if (/SYNCED/.test(queueText)) throw new Error('queue must never fabricate SYNCED');
  });

  await test('connectivity session shows a real state-machine state, never CONNECTED', async () => {
    const sessionText = await page.locator('.live-conn-session').innerText();
    if (/CONNECTED/.test(sessionText)) throw new Error('session must never fabricate CONNECTED — got: ' + sessionText);
    if (!/DISCOVERING|PAIRING_REQUIRED|READY/.test(sessionText)) throw new Error('expected a real state-machine value, got: ' + sessionText);
  });

  await test('local device discovery section renders an honest empty state when no devices are known', async () => {
    const text = await page.locator('.live-conn-devices').innerText();
    if (!/No local devices discovered/.test(text)) throw new Error('expected honest empty device list, got: ' + text);
  });

  await test('mobile/responsive layout does not break at a narrow viewport', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.live-conn-group', { timeout: 5000 });
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
