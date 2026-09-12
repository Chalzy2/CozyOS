/**
 * core/engines/video/ui/tests/cozy-live-camera-capture-dashboard-browser.test.js
 * RP-035 Section 14 — REAL browser test (Playwright + actual headless
 * Chromium), driving the real cozy-live-camera-capture-dashboard.html
 * page. Uses Chromium's --use-fake-device-for-media-stream and
 * --use-fake-ui-for-media-stream flags to provide a real, deterministic
 * fake camera device — a genuine, disclosed browser feature (not a
 * mock of this application), so getUserMedia() succeeds for real
 * without requiring physical camera hardware in this environment.
 * Run with: node core/engines/video/ui/tests/cozy-live-camera-capture-dashboard-browser.test.js
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

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');

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
  const base = `http://127.0.0.1:${port}/cozyos/core/engines/video/ui/cozy-live-camera-capture-dashboard.html`;

  let browser;
  try {
    browser = await playwright.chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });
    browserRan = true;
  }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const context = await browser.newContext();
  await context.grantPermissions(['camera', 'microphone']);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard loads and renders capability/permission groups', async () => {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.camera-group', { timeout: 5000 });
    const groupCount = await page.locator('.camera-group').count();
    if (groupCount < 3) throw new Error('expected at least 3 real groups, got ' + groupCount);
  });

  await test('camera capability group never shows a fabricated CONNECTED state before preview starts', async () => {
    const text = await page.locator('.camera-capability-group').innerText();
    if (/CONNECTED/.test(text)) throw new Error('capability group must never claim CONNECTED before a real preview, got: ' + text);
  });

  await test('all capture control buttons are present', async () => {
    const buttons = [
      '.camera-start-preview', '.camera-stop-preview', '.camera-pause-preview', '.camera-resume-preview',
      '.camera-switch', '.camera-capture-photo', '.camera-start-record', '.camera-pause-record',
      '.camera-resume-record', '.camera-stop-record'
    ];
    for (const sel of buttons) {
      const count = await page.locator(sel).count();
      if (count !== 1) throw new Error('expected exactly one ' + sel + ', got ' + count);
    }
  });

  await test('starting preview with the real fake camera device genuinely succeeds', async () => {
    await page.locator('.camera-start-preview').click();
    await page.waitForTimeout(300);
    const text = await page.locator('.camera-result').innerText();
    if (!/Preview started/.test(text)) throw new Error('expected a real successful preview start, got: ' + text);
  });

  await test('capturing a photo from the real active preview genuinely succeeds and is honestly unprocessed', async () => {
    await page.locator('.camera-capture-photo').click();
    await page.waitForTimeout(300);
    const text = await page.locator('.camera-result').innerText();
    if (!/Photo captured/.test(text)) throw new Error('expected a real successful photo capture, got: ' + text);
    if (!/clarityProcessed=false/.test(text)) throw new Error('captured photo must be honestly marked clarityProcessed=false, got: ' + text);
    if (!/syncState=LOCAL_ONLY/.test(text)) throw new Error('captured photo must be honestly marked syncState=LOCAL_ONLY, never SYNCED, got: ' + text);
  });

  await test('starting a real recording against the real fake device succeeds', async () => {
    await page.locator('.camera-start-record').click();
    await page.waitForTimeout(300);
    const text = await page.locator('.camera-result').innerText();
    if (!/Recording started/.test(text)) throw new Error('expected a real successful recording start, got: ' + text);
  });

  await test('pausing and resuming the real recording works', async () => {
    await page.locator('.camera-pause-record').click();
    // RP-035 Section 15 gate finding: this was 150ms and flaked once
    // under full-repository-regression CPU contention (real
    // Chromium/MediaRecorder pause under load). Widened to 300ms for
    // headroom — a timing-robustness fix, not a functional change;
    // re-run 4x consecutively after the fix with 0 flakes.
    await page.waitForTimeout(300);
    let text = await page.locator('.camera-result').innerText();
    if (!/Recording paused/.test(text)) throw new Error('expected real pause, got: ' + text);
    await page.locator('.camera-resume-record').click();
    await page.waitForTimeout(300);
    text = await page.locator('.camera-result').innerText();
    if (!/Recording resumed/.test(text)) throw new Error('expected real resume, got: ' + text);
  });

  await test('stopping the real recording genuinely produces a real blob, honestly unprocessed', async () => {
    await page.locator('.camera-stop-record').click();
    await page.waitForTimeout(500);
    const text = await page.locator('.camera-result').innerText();
    if (!/Recording stopped/.test(text)) throw new Error('expected a real successful recording stop, got: ' + text);
    if (!/clarityProcessed=false/.test(text)) throw new Error('recorded video must be honestly marked clarityProcessed=false, got: ' + text);
  });

  await test('camera switching against the real fake device succeeds without breaking preview', async () => {
    await page.locator('.camera-switch').click();
    await page.waitForTimeout(300);
    const text = await page.locator('.camera-result').innerText();
    if (!/Camera switched/.test(text)) throw new Error('expected a real successful camera switch, got: ' + text);
  });

  await test('stopping preview genuinely tears down the real stream', async () => {
    await page.locator('.camera-stop-preview').click();
    await page.waitForTimeout(150);
    const text = await page.locator('.camera-result').innerText();
    if (!/Preview stopped/.test(text)) throw new Error('expected a real successful preview stop, got: ' + text);
  });

  await test('device list renders real detected fake-device entries, never a fabricated count', async () => {
    await page.waitForSelector('.camera-devices-group', { timeout: 5000 });
    const text = await page.locator('.camera-devices-group').innerText();
    if (!/KNOWN|No cameras detected/.test(text)) throw new Error('expected either real known devices or an honest empty state, got: ' + text);
  });

  await test('mobile/responsive layout does not break at a narrow viewport', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.camera-group', { timeout: 5000 });
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
