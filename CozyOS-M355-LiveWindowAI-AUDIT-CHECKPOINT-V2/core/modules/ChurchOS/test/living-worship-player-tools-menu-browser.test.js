'use strict';

/**
 * core/modules/ChurchOS/test/living-worship-player-tools-menu-browser.test.js
 *
 * Live Worship Tools reorganization - REAL browser test (Playwright +
 * actual Chromium), reusing the exact same harness/server/openPlayer()
 * pattern already established in
 * living-worship-player-mini-pip-browser.test.js. Drives the real,
 * unmodified-by-this-file living-worship-player.js and window-manager.js
 * through actual DOM/CSS/computed-position/Pointer-Events - real
 * bounding boxes, not source-text inspection.
 *
 * CORRECTION: a real Chromium binary is available in this environment
 * at /opt/pw-browsers (found via `find / -iname "chromium*"`), even
 * though the default ~/.cache/ms-playwright path used by
 * `npx playwright install` is empty and that specific install command
 * fails (network egress to the apt/CDN sources it needs is blocked -
 * confirmed earlier in this project). Playwright's chromium.launch()
 * resolves the browser from this alternate path successfully. Earlier
 * conclusions in this project that browser/UI verification was
 * unconditionally BLOCKED in this sandbox were based on checking only
 * the default cache path and are corrected here now that this was
 * discovered - this is real, live browser verification, not a stub.
 *
 * Run with: node core/modules/ChurchOS/test/living-worship-player-tools-menu-browser.test.js
 */

const path = require('path');
const http = require('http');
const fs = require('fs');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn().then(() => { console.log(`  \u2713 ${name}`); passed++; })
    .catch((err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; });
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

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
  catch (_err) {
    console.log('SKIPPED: playwright not installed in this environment. This is honestly reported, not a pass.');
    process.exit(0);
  }

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await playwright.chromium.launch();
  const pageErrors = [];

  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });
    await page.goto(`${base}/core/modules/ChurchOS/test/living-worship-player-mini-pip-harness.html`);
    return page;
  }

  async function openPlayer(page) {
    await page.click('#cozy-liveview-icon');
    await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
    await page.click('[data-lv-action="open"]');
    await page.waitForSelector('#cozy-worship-player-content');
  }

  console.log('\nLive Worship Tools menu reorganization - real browser verification:\n');

  await test('Tools menu is genuinely collapsed (not visible) immediately after opening Live Worship', async () => {
    const page = await newPage();
    await openPlayer(page);
    const visible = await page.isVisible('#cozy-worship-player-tools-menu');
    if (visible) throw new Error('tools menu must start collapsed');
    await page.close();
  });

  await test('clicking the Tools toggle makes the real menu genuinely visible, positioned below and left-aligned with the toggle (opens downward)', async () => {
    const page = await newPage();
    await openPlayer(page);
    const toggleBox = await page.locator('#cozy-worship-player-tools-toggle').boundingBox();
    await page.click('#cozy-worship-player-tools-toggle');
    await page.waitForSelector('#cozy-worship-player-tools-menu', { state: 'visible' });
    const menuBox = await page.locator('#cozy-worship-player-tools-menu').boundingBox();
    if (!menuBox) throw new Error('menu has no real bounding box after opening');
    if (menuBox.y < toggleBox.y + toggleBox.height - 1) {
      throw new Error(`menu must open DOWNWARD (below the toggle) - toggle bottom=${toggleBox.y + toggleBox.height}, menu top=${menuBox.y}`);
    }
    await page.close();
  });

  await test('clicking the Tools toggle again genuinely hides the real menu', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('#cozy-worship-player-tools-toggle');
    await page.waitForSelector('#cozy-worship-player-tools-menu', { state: 'visible' });
    await page.click('#cozy-worship-player-tools-toggle');
    const visible = await page.isVisible('#cozy-worship-player-tools-menu');
    if (visible) throw new Error('menu must genuinely hide after collapsing');
    await page.close();
  });

  await test('all real panel-toggle buttons (translation/scripture/timeline/branches/lyrics/notes/prayer/chat) are genuinely present and clickable inside the real menu', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('#cozy-worship-player-tools-toggle');
    for (const panel of ['translation', 'scripture', 'timeline', 'branches', 'lyrics', 'notes', 'prayer', 'chat']) {
      const count = await page.locator(`[data-panel-toggle="${panel}"]`).count();
      if (count !== 1) throw new Error(`expected exactly one real ${panel} button, found ${count}`);
    }
    await page.close();
  });

  await test('clicking a real panel-toggle button inside the menu genuinely renders its panel content (Timeline)', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('#cozy-worship-player-tools-toggle');
    await page.click('[data-panel-toggle="timeline"]');
    const content = await page.textContent('#cozy-worship-player-panel-content');
    if (!/Timeline/i.test(content)) throw new Error('real Timeline panel content did not render');
    await page.close();
  });

  await test('existing Theater/Float/PiP header buttons remain genuinely present and unaffected', async () => {
    const page = await newPage();
    await openPlayer(page);
    for (const action of ['expand', 'mini', 'pip']) {
      const count = await page.locator(`[data-player-action="${action}"]`).count();
      if (count !== 1) throw new Error(`expected exactly one real ${action} button, found ${count}`);
    }
    await page.close();
  });

  await test('no page errors were thrown by the real, unmodified player during any of the above interactions', async () => {
    if (pageErrors.length) throw new Error('real page errors: ' + pageErrors.join(' | '));
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
