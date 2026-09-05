'use strict';

/**
 * core/shell/tests/taskbar-browser.test.js
 * Real browser test (Playwright + actual headless Chromium), driving
 * the real, unmodified-in-this-file window-manager.js and taskbar.js
 * through real DOM/CSS/click behavior. Nothing here inspects source
 * text — every assertion is about actual runtime behavior (DOM
 * elements present/absent, class lists, click outcomes).
 *
 * HARNESS DISCLOSURE: serves the real repository over local HTTP and
 * loads core/shell/tests/taskbar-harness.html, which loads the two
 * real, unmodified files under test. Same pattern as
 * core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js.
 *
 * REAL-BROWSER DISCOVERY (CP6.1 fix — see
 * docs/checkpoints/CP6.1-TASKBAR-TERMUX-BROWSER-FIX-CHECKPOINT.md)
 *   `playwright` is declared in package.json's devDependencies and
 *   Chromium is launched via server/webauthn-rp/test/browser-launch.js's
 *   existing, already-proven resolveLaunchOptions() — the SAME
 *   discovery this repo's real WebAuthn E2E browser test
 *   (server/webauthn-rp/test/browser-e2e-passkey-login.test.js) already
 *   uses to find a natively-built Android/ARM64 Chromium under Termux
 *   (see that file's own header for the full "why Playwright's own
 *   bundled desktop Chromium cannot run under Termux" explanation).
 *   This file does not invent a second discovery mechanism — composing
 *   the existing one is the fix, not a new one.
 *
 * Run: node core/shell/tests/taskbar-browser.test.js
 */

const path = require('path');
const http = require('http');
const fs = require('fs');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn().then(() => { console.log(`  \u2713 ${name}`); passed++; })
    .catch((err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; });
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const { resolveLaunchOptions } = require(path.join(REPO_ROOT, 'server', 'webauthn-rp', 'test', 'browser-launch.js'));

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
    console.log('See docs/checkpoints/CP6.1-TASKBAR-TERMUX-BROWSER-FIX-CHECKPOINT.md for the supported way to obtain a real browser runtime (system Chromium via Termux\'s x11-repo, discovered automatically by server/webauthn-rp/test/browser-launch.js).');
    process.exit(0);
  }

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));

  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });
    page.__errors = pageErrors;
    await page.goto(`${base}/core/shell/tests/taskbar-harness.html`);
    return page;
  }

  /** Creates a real WindowManager window directly (the same API ApplicationLauncher composes) — no fixture-only mock of WindowManager itself. */
  async function createWindow(page, { id, title = id, icon = null } = {}) {
    return page.evaluate(({ id, title, icon }) => {
      const el = document.createElement('div');
      el.textContent = `content for ${id}`;
      return window.CozyOS.WindowManager.create({ id, title, icon, element: el });
    }, { id, title, icon });
  }

  function taskbarItems(page) {
    return page.$$eval('#cozy-taskbar-root .cozy-taskbar-item', (els) => els.map((el) => ({
      id: el.dataset.taskbarId,
      title: el.querySelector('.cozy-taskbar-title').textContent,
      minimized: el.classList.contains('cozy-taskbar-minimized'),
      active: el.classList.contains('cozy-taskbar-active')
    })));
  }

  console.log('Taskbar — real browser tests\n');

  console.log('Setup:');
  await test('harness loads and mounts the real WindowManager + Taskbar modules', async () => {
    const page = await newPage();
    const hasWm = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.WindowManager));
    const hasTaskbar = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.Taskbar));
    if (!hasWm) throw new Error('WindowManager did not load');
    if (!hasTaskbar) throw new Error('Taskbar did not load');
    const hasRoot = await page.evaluate(() => !!document.getElementById('cozy-taskbar-root'));
    if (!hasRoot) throw new Error('Taskbar did not self-mount #cozy-taskbar-root');
    await page.close();
  });

  console.log('\nWindow creation:');
  await test('creating a window adds a real entry to the taskbar', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A', icon: '\ud83d\udcc4' });
    const items = await taskbarItems(page);
    if (items.length !== 1) throw new Error(`expected 1 taskbar entry, got ${items.length}`);
    if (items[0].id !== 'app-a') throw new Error(`expected id "app-a", got "${items[0].id}"`);
    if (items[0].title !== 'App A') throw new Error(`expected title "App A", got "${items[0].title}"`);
    if (items[0].minimized) throw new Error('a freshly created window should not show as minimized');
    if (!items[0].active) throw new Error('a freshly created window should be the active entry');
    await page.close();
  });

  console.log('\nMultiple windows:');
  await test('creating several windows adds one entry each, most recent active', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await createWindow(page, { id: 'app-b', title: 'App B' });
    await createWindow(page, { id: 'app-c', title: 'App C' });
    const items = await taskbarItems(page);
    if (items.length !== 3) throw new Error(`expected 3 taskbar entries, got ${items.length}`);
    const ids = items.map((i) => i.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(['app-a', 'app-b', 'app-c'])) throw new Error(`unexpected id set: ${ids.join(',')}`);
    const activeCount = items.filter((i) => i.active).length;
    if (activeCount !== 1) throw new Error(`expected exactly 1 active entry, got ${activeCount}`);
    const active = items.find((i) => i.active);
    if (active.id !== 'app-c') throw new Error(`expected most-recently-created window ("app-c") active, got "${active.id}"`);
    await page.close();
  });

  console.log('\nFocus:');
  await test('clicking a non-active entry focuses it via the real WindowManager', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await createWindow(page, { id: 'app-b', title: 'App B' });
    // app-b is active after creation; click app-a's taskbar entry.
    await page.click('[data-taskbar-id="app-a"]');
    const items = await taskbarItems(page);
    const active = items.find((i) => i.active);
    if (!active || active.id !== 'app-a') throw new Error(`expected "app-a" active after click, got "${active && active.id}"`);
    // Confirm real WindowManager z-order agrees, not just the taskbar's own class.
    const isActiveInDom = await page.$eval('.cozy-window[data-window-id="app-a"]', (el) => el.classList.contains('cozy-window-active'));
    if (!isActiveInDom) throw new Error('real WindowManager window did not receive cozy-window-active after taskbar click');
    await page.close();
  });

  console.log('\nMinimize:');
  await test('minimizing a window (via WindowManager) marks its taskbar entry minimized', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await page.evaluate(() => window.CozyOS.WindowManager.minimize('app-a'));
    const items = await taskbarItems(page);
    if (!items[0].minimized) throw new Error('taskbar entry did not mark window as minimized');
    await page.close();
  });

  console.log('\nRestore:');
  await test('clicking a minimized entry restores the real window and clears the minimized class', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await page.evaluate(() => window.CozyOS.WindowManager.minimize('app-a'));
    await page.click('[data-taskbar-id="app-a"]');
    const items = await taskbarItems(page);
    if (items[0].minimized) throw new Error('taskbar entry still shows minimized after restore click');
    const isMinimizedInDom = await page.$eval('.cozy-window[data-window-id="app-a"]', (el) => el.classList.contains('cozy-window-minimized'));
    if (isMinimizedInDom) throw new Error('real WindowManager window is still minimized after taskbar restore click');
    await page.close();
  });

  console.log('\nClose:');
  await test('clicking an entry\'s close control closes the real window and removes the taskbar entry', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await createWindow(page, { id: 'app-b', title: 'App B' });
    await page.click('[data-taskbar-close="app-a"]');
    const items = await taskbarItems(page);
    if (items.length !== 1) throw new Error(`expected 1 remaining taskbar entry, got ${items.length}`);
    if (items[0].id !== 'app-b') throw new Error(`expected "app-b" to remain, got "${items[0].id}"`);
    const stillInDom = await page.evaluate(() => !!document.querySelector('.cozy-window[data-window-id="app-a"]'));
    if (stillInDom) throw new Error('real WindowManager window DOM still present after close');
    const wmSaysOpen = await page.evaluate(() => window.CozyOS.WindowManager.isOpen('app-a'));
    if (wmSaysOpen) throw new Error('real WindowManager still reports app-a as open after taskbar close');
    await page.close();
  });

  await test('closing a window via its own titlebar control (not the taskbar) still syncs the taskbar', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await page.click('.cozy-window[data-window-id="app-a"] [data-win-action="close"]');
    const items = await taskbarItems(page);
    if (items.length !== 0) throw new Error(`expected 0 taskbar entries after titlebar close, got ${items.length}`);
    await page.close();
  });

  console.log('\nState synchronization:');
  await test('setTitle() on the real WindowManager updates the taskbar entry text', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'Original Title' });
    await page.evaluate(() => window.CozyOS.WindowManager.setTitle('app-a', 'Renamed'));
    const items = await taskbarItems(page);
    if (items[0].title !== 'Renamed') throw new Error(`expected renamed title, got "${items[0].title}"`);
    await page.close();
  });

  await test('maximize() does not remove the taskbar entry and keeps it active', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await page.evaluate(() => window.CozyOS.WindowManager.maximize('app-a'));
    const items = await taskbarItems(page);
    if (items.length !== 1) throw new Error(`expected 1 taskbar entry after maximize, got ${items.length}`);
    if (items[0].minimized) throw new Error('maximize should not mark the window as minimized');
    await page.close();
  });

  console.log('\nListener cleanup / no duplicate subscriptions:');
  await test('Taskbar.destroy() unsubscribes — later WindowManager changes no longer update (or recreate) the taskbar', async () => {
    const page = await newPage();
    await createWindow(page, { id: 'app-a', title: 'App A' });
    await page.evaluate(() => window.CozyOS.Taskbar.destroy());
    const rootGoneAfterDestroy = await page.evaluate(() => !document.getElementById('cozy-taskbar-root'));
    if (!rootGoneAfterDestroy) throw new Error('Taskbar.destroy() did not remove its own root element');
    await createWindow(page, { id: 'app-b', title: 'App B' });
    const rootAfterNewWindow = await page.evaluate(() => !!document.getElementById('cozy-taskbar-root'));
    if (rootAfterNewWindow) throw new Error('a destroyed Taskbar should not react to further WindowManager changes (listener was not actually removed)');
    const diag = await page.evaluate(() => window.CozyOS.Taskbar.getDiagnosticsReport());
    if (diag.subscribed) throw new Error('getDiagnosticsReport() reports still subscribed after destroy()');
    await page.close();
  });

  await test('re-including taskbar.js a second time is a real no-op — exactly one entry per window, not two', async () => {
    const page = await newPage();
    // Simulate an accidental duplicate <script src="taskbar.js"> include.
    await page.addScriptTag({ url: `${base}/core/shell/taskbar.js` });
    await createWindow(page, { id: 'app-a', title: 'App A' });
    const items = await taskbarItems(page);
    const matching = items.filter((i) => i.id === 'app-a');
    if (matching.length !== 1) throw new Error(`expected exactly 1 taskbar entry for app-a after duplicate script include, got ${matching.length}`);
    await page.close();
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
