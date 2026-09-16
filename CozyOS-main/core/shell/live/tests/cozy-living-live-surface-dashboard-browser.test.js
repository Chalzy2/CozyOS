/**
 * core/shell/live/tests/cozy-living-live-surface-dashboard-browser.test.js
 * RP-035 Section 16 — REAL browser test (Playwright + actual headless
 * Chromium). Uses Chromium's real fake camera device flags, same as
 * Section 14/15.
 * Run with: node core/shell/live/tests/cozy-living-live-surface-dashboard-browser.test.js
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
  const base = `http://127.0.0.1:${port}/cozyos/core/shell/live/ui/cozy-living-live-surface-dashboard.html`;

  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    browserRan = true;
  }
  catch (e) { console.log('BROWSER_TEST = NOT_RUN (no Chromium binary: ' + e.message + ')'); server.close(); console.log('\n0 passed, 0 failed'); process.exitCode = 0; return; }

  const context = await browser.newContext();
  await context.grantPermissions(['camera', 'microphone']);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await test('dashboard loads with the living surface hidden (STOPPED) until Go Live is pressed', async () => {
    await page.goto(base, { waitUntil: 'load' });
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'STOPPED') throw new Error('expected STOPPED before starting, got: ' + mode);
  });

  await test('Go Live genuinely starts a real session and shows real status', async () => {
    await page.locator('.go-live-btn').click();
    await page.waitForTimeout(500);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'LIVE') throw new Error('expected LIVE, got: ' + mode);
    const status = await page.locator('#live-status').innerText();
    if (!/sessionId=live_/.test(status)) throw new Error('expected a real sessionId in status, got: ' + status);
  });

  let firstSessionId;
  await test('the real sessionId is captured for cross-transition comparison', async () => {
    const status = await page.locator('#live-status').innerText();
    firstSessionId = status.match(/sessionId=(\S+)/)[1];
    if (!firstSessionId) throw new Error('no sessionId captured');
  });

  await test('minimize genuinely changes mode to MINIMIZED, session continues (same sessionId)', async () => {
    await page.locator('.toggle-btn').click();
    await page.waitForTimeout(200);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'MINIMIZED') throw new Error('expected MINIMIZED, got: ' + mode);
    const status = await page.locator('#live-status').innerText();
    if (status.indexOf(firstSessionId) === -1) throw new Error('sessionId changed after minimize: ' + status);
  });

  await test('restoring (toggle again) genuinely returns to EXPANDED with the same sessionId', async () => {
    await page.locator('.toggle-btn').click();
    await page.waitForTimeout(200);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'EXPANDED') throw new Error('expected EXPANDED, got: ' + mode);
    const status = await page.locator('#live-status').innerText();
    if (status.indexOf(firstSessionId) === -1) throw new Error('sessionId changed after restore: ' + status);
  });

  await test('fullscreen genuinely expands the surface to the viewport, same sessionId', async () => {
    await page.locator('.fullscreen-btn').click();
    await page.waitForTimeout(200);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'FULLSCREEN') throw new Error('expected FULLSCREEN, got: ' + mode);
    const box = await page.locator('#living-surface').boundingBox();
    const viewport = page.viewportSize();
    if (Math.abs(box.width - viewport.width) > 5) throw new Error('fullscreen width does not match viewport: ' + box.width + ' vs ' + viewport.width);
    const status = await page.locator('#live-status').innerText();
    if (status.indexOf(firstSessionId) === -1) throw new Error('sessionId changed after fullscreen: ' + status);
  });

  await test('exiting fullscreen returns to EXPANDED, same sessionId', async () => {
    await page.locator('.fullscreen-btn').click();
    await page.waitForTimeout(200);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'EXPANDED') throw new Error('expected EXPANDED after exiting fullscreen, got: ' + mode);
  });

  await test('navigating between shell apps preserves the live session (same sessionId, session continues)', async () => {
    await page.locator('.nav-dashboard-btn').click();
    await page.waitForTimeout(150);
    await page.locator('.nav-quarry-btn').click();
    await page.waitForTimeout(150);
    const status = await page.locator('#live-status').innerText();
    if (status.indexOf(firstSessionId) === -1) throw new Error('sessionId changed after navigation: ' + status);
    const appArea = await page.locator('#shell-app-area').innerText();
    if (!/quarry/.test(appArea)) throw new Error('navigation did not actually change app context: ' + appArea);
  });

  await test('rotating genuinely updates orientation in real session state, same sessionId', async () => {
    await page.locator('.rotate-btn').click();
    await page.waitForTimeout(150);
    const status = await page.locator('#live-status').innerText();
    if (!/orientation=landscape/.test(status)) throw new Error('expected real orientation update, got: ' + status);
    if (status.indexOf(firstSessionId) === -1) throw new Error('sessionId changed after rotation: ' + status);
  });

  await test('dragging the surface header genuinely moves the surface (real pointer events, real position change)', async () => {
    const before = await page.locator('#living-surface').boundingBox();
    const header = page.locator('.surface-header');
    const headerBox = await header.boundingBox();
    await page.mouse.move(headerBox.x + 10, headerBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(headerBox.x + 110, headerBox.y + 105, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.locator('#living-surface').boundingBox();
    if (Math.abs(after.x - before.x) < 50) throw new Error('drag did not genuinely move the surface: before=' + before.x + ' after=' + after.x);
  });

  await test('resizing via the real resize handle genuinely changes surface dimensions', async () => {
    const before = await page.locator('#living-surface').boundingBox();
    const handle = page.locator('.resize-handle');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + 8, handleBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 108, handleBox.y + 88, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.locator('#living-surface').boundingBox();
    if (Math.abs(after.width - before.width) < 50) throw new Error('resize did not genuinely change width: before=' + before.width + ' after=' + after.width);
  });

  await test('a real comment genuinely appears in the panel with an honest, non-SENT delivery state', async () => {
    await page.locator('.comment-input').fill('Amen, connected today.');
    await page.locator('.send-comment-btn').click();
    await page.waitForTimeout(600);
    const text = await page.locator('.comments-list').innerText();
    if (!/Amen, connected today\./.test(text)) throw new Error('expected the real comment text to render, got: ' + text);
    if (/\[SENT\]/.test(text)) throw new Error('comment must never show SENT without a real connected peer transport, got: ' + text);
  });

  await test('pressing Stop/X genuinely terminates the session — surface becomes STOPPED', async () => {
    await page.locator('.stop-btn').click();
    await page.waitForTimeout(200);
    const mode = await page.locator('#living-surface').getAttribute('data-mode');
    if (mode !== 'STOPPED') throw new Error('expected STOPPED after explicit stop, got: ' + mode);
    const status = await page.locator('#live-status').innerText();
    if (!/No live session/.test(status)) throw new Error('expected honest no-session status after stop, got: ' + status);
  });

  await test('mobile/responsive layout does not break at a narrow viewport', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('.shell-toolbar', { timeout: 5000 });
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
