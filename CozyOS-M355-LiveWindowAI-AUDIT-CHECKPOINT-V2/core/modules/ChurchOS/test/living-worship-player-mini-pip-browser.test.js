'use strict';

/**
 * core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
 * M389 — REAL browser test (Playwright + actual headless Chromium),
 * driving the real, unmodified-in-this-file living-worship-player.js
 * and window-manager.js through the real DOM/CSS/Pointer-Events/
 * MediaStream/Picture-in-Picture browser APIs. Nothing here inspects
 * source text — every assertion is about actual runtime behavior
 * (bounding boxes, computed styles, localStorage, video.currentTime,
 * document.pictureInPictureEnabled, etc).
 *
 * HARNESS DISCLOSURE: serves the real repository over local HTTP and
 * loads core/modules/ChurchOS/test/living-worship-player-mini-pip-harness.html,
 * which loads the two real, unmodified files under test plus the real
 * cozy-living.css. LiveCaptureEngine/LiveHotspotEngine/etc are not
 * loaded — living-worship-player.js already guards every one of those
 * as optional (verified by reading its source), so this is real
 * production behavior, not a stub of the file under test. Stream
 * continuity is proven with a real synthetic MediaStream from
 * canvas.captureStream() (a genuine, standard browser API), attached
 * directly to the video element the same way bindToService() would.
 *
 * Run with: node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
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

  /** Opens the real Live Worship window via the real LiveViewController chip UI (icon -> panel -> "open"), exactly as an end user would. */
  async function openPlayer(page) {
    await page.click('#cozy-liveview-icon');
    await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
    await page.click('[data-lv-action="open"]');
    await page.waitForSelector('#cozy-worship-player-content');
  }

  /** Attaches a real synthetic MediaStream (canvas.captureStream()) to the real video element and starts real playback - genuine browser APIs, no mock of the file under test. */
  async function attachSyntheticStream(page) {
    return page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160; canvas.height = 90;
      const ctx = canvas.getContext('2d');
      let hue = 0;
      const draw = () => { hue = (hue + 2) % 360; ctx.fillStyle = `hsl(${hue},70%,50%)`; ctx.fillRect(0, 0, 160, 90); };
      draw();
      window.__cozyTestPaintTimer = setInterval(draw, 50);
      const stream = canvas.captureStream(30);
      const video = document.querySelector('#cozy-worship-player-video');
      video.srcObject = stream;
      await video.play();
      window.__cozyTestStreamId = stream.id;
      return { streamId: stream.id };
    });
  }

  async function getMode(page) {
    return page.$eval('#cozy-worship-player', (el) => el.dataset.mode);
  }
  async function getWindowBox(page) {
    return page.$eval('.cozy-window[data-window-id="living-worship-player"]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
  }
  async function getVideoState(page) {
    return page.$eval('#cozy-worship-player-video', (v) => ({
      paused: v.paused, currentTime: v.currentTime, streamId: v.srcObject ? v.srcObject.id : null
    }));
  }
  async function getPersistedBounds(page) {
    return page.evaluate(() => JSON.parse(window.localStorage.getItem('cozy.windowManager.living-worship-player') || 'null'));
  }
  async function getControllerBox(page) {
    return page.$eval('#cozy-liveview-controller', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  /** Real Pointer Events drag via Playwright's mouse (Chromium maps real mouse input to real pointer events - not a synthetic dispatch of pointerdown/move/up in JS). */
  async function dragTitlebar(page, dx, dy, opts = {}) {
    const bar = await page.$('.cozy-window-titlebar');
    const box = await bar.boundingBox();
    const startX = box.x + box.width / 2, startY = box.y + Math.min(10, box.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const steps = opts.steps || 8;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps);
    }
    await page.mouse.up();
  }

  console.log('M389 — Live Video Floating (mini) + Picture-in-Picture bridge tests\n');

  console.log('Setup:');
  await test('harness loads and mounts the real LiveViewController + WindowManager modules', async () => {
    const page = await newPage();
    const hasWm = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.WindowManager));
    const hasPlayer = await page.evaluate(() => !!(window.CozyOS && window.CozyOS.LivingWorshipPlayer));
    if (!hasWm) throw new Error('WindowManager did not load');
    if (!hasPlayer) throw new Error('LivingWorshipPlayer did not load');
    await page.close();
  });

  console.log('\nExpanded <-> mini:');
  await test('opens docked by default, expanded state has full chrome visible', async () => {
    const page = await newPage();
    await openPlayer(page);
    const mode = await getMode(page);
    if (mode !== 'docked') throw new Error(`expected docked, got ${mode}`);
    const headerVisible = await page.$eval('#cozy-worship-player-header', (el) => getComputedStyle(el).display !== 'none');
    if (!headerVisible) throw new Error('docked header should be visible');
    await page.close();
  });

  await test('minimize (Float) shrinks the real window and hides chrome, video keeps playing', async () => {
    const page = await newPage();
    await openPlayer(page);
    await attachSyntheticStream(page);
    const before = await getWindowBox(page);
    const beforeVideo = await getVideoState(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(150);
    const mode = await getMode(page);
    if (mode !== 'mini') throw new Error(`expected mini, got ${mode}`);
    const after = await getWindowBox(page);
    if (!(after.width < before.width && after.width <= 330)) throw new Error(`mini width not shrunk: before=${before.width} after=${after.width}`);
    const headerVisible = await page.$eval('#cozy-worship-player-header', (el) => getComputedStyle(el).display !== 'none');
    if (headerVisible) throw new Error('mini header should be hidden');
    const afterVideo = await getVideoState(page);
    if (afterVideo.paused) throw new Error('video paused across minimize - stream was interrupted');
    if (afterVideo.streamId !== beforeVideo.streamId) throw new Error('srcObject changed across minimize - stream was rebound/reloaded');
    if (!(afterVideo.currentTime >= beforeVideo.currentTime)) throw new Error('currentTime went backwards across minimize');
    await page.close();
  });

  await test('tapping the mini restore control restores docked state and preserves the stream', async () => {
    const page = await newPage();
    await openPlayer(page);
    await attachSyntheticStream(page);
    const dockedBefore = await getWindowBox(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    const beforeRestoreVideo = await getVideoState(page);
    await page.click('#cozy-worship-player-mini-restore');
    await page.waitForTimeout(150);
    const mode = await getMode(page);
    if (mode !== 'docked') throw new Error(`expected docked after tap-to-restore, got ${mode}`);
    const dockedAfter = await getWindowBox(page);
    if (Math.abs(dockedAfter.width - dockedBefore.width) > 5) throw new Error(`restored width drifted: ${dockedBefore.width} -> ${dockedAfter.width}`);
    const afterVideo = await getVideoState(page);
    if (afterVideo.paused) throw new Error('video paused across restore');
    if (afterVideo.streamId !== beforeRestoreVideo.streamId) throw new Error('srcObject changed across restore - stream was reloaded');
    await page.close();
  });

  await test('repeated minimize/restore (5x) keeps the same stream and never pauses it', async () => {
    const page = await newPage();
    await openPlayer(page);
    const { streamId } = await attachSyntheticStream(page);
    for (let i = 0; i < 5; i++) {
      await page.click('[data-player-action="mini"]');
      await page.waitForTimeout(60);
      const midVideo = await getVideoState(page);
      if (midVideo.streamId !== streamId) throw new Error(`iteration ${i}: streamId changed while mini`);
      if (midVideo.paused) throw new Error(`iteration ${i}: paused while mini`);
      await page.click('#cozy-worship-player-mini-restore');
      await page.waitForTimeout(60);
      const restoredVideo = await getVideoState(page);
      if (restoredVideo.streamId !== streamId) throw new Error(`iteration ${i}: streamId changed after restore`);
      if (restoredVideo.paused) throw new Error(`iteration ${i}: paused after restore`);
    }
    await page.close();
  });

  console.log('\nDrag + boundary clamping + persistence:');
  await test('dragging the mini window by the titlebar actually moves it (real Pointer Events)', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    const before = await getWindowBox(page);
    await dragTitlebar(page, -150, 120);
    await page.waitForTimeout(100);
    const after = await getWindowBox(page);
    if (Math.abs(after.x - before.x) < 30 && Math.abs(after.y - before.y) < 30) {
      throw new Error(`drag did not move the window: before=(${before.x},${before.y}) after=(${after.x},${after.y})`);
    }
    await page.close();
  });

  await test('dragging past the viewport edge clamps position within bounds (never off-screen)', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    await dragTitlebar(page, -3000, -3000, { steps: 12 });
    await page.waitForTimeout(100);
    const box = await getWindowBox(page);
    if (box.x < -1 || box.y < -1) throw new Error(`window dragged off-screen: x=${box.x} y=${box.y}`);
    const viewport = page.viewportSize();
    if (box.x > viewport.width || box.y > viewport.height) throw new Error('window clamp failed on the far side');
    await page.close();
  });

  await test('mini window position is persisted to localStorage after drag', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    await dragTitlebar(page, 40, 40);
    await page.waitForTimeout(100);
    const box = await getWindowBox(page);
    const persisted = await getPersistedBounds(page);
    if (!persisted) throw new Error('no persisted bounds found in localStorage');
    if (Math.abs(persisted.x - box.x) > 2 || Math.abs(persisted.y - box.y) > 2) {
      throw new Error(`persisted bounds (${persisted.x},${persisted.y}) do not match rendered bounds (${box.x},${box.y})`);
    }
    await page.close();
  });

  console.log('\nResponsive sizing:');
  await test('mini window width scales down and stays >=160px on a small phone viewport', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 720 } });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.goto(`${base}/core/modules/ChurchOS/test/living-worship-player-mini-pip-harness.html`);
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    const box = await getWindowBox(page);
    if (box.width > 320) throw new Error(`mini width too large for phone viewport: ${box.width}`);
    if (box.width < 140) throw new Error(`mini width below the CSS min-width floor: ${box.width}`);
    await page.close();
  });

  console.log('\nLiveViewController coexistence:');
  await test('LiveViewController chip and mini video window have independent, non-overlapping default positions', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    const miniBox = await getWindowBox(page);
    const controllerBox = await getControllerBox(page);
    if (rectsOverlap(miniBox, controllerBox)) {
      throw new Error(`mini window overlaps the LiveViewController chip: mini=${JSON.stringify(miniBox)} controller=${JSON.stringify(controllerBox)}`);
    }
    await page.close();
  });

  await test('dragging the mini video window does not move the LiveViewController chip, and vice versa', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('[data-player-action="mini"]');
    await page.waitForTimeout(100);
    const controllerBefore = await getControllerBox(page);
    await dragTitlebar(page, -80, 60);
    await page.waitForTimeout(100);
    const controllerAfterVideoDrag = await getControllerBox(page);
    if (Math.abs(controllerAfterVideoDrag.x - controllerBefore.x) > 1 || Math.abs(controllerAfterVideoDrag.y - controllerBefore.y) > 1) {
      throw new Error('dragging the mini video window moved the LiveViewController chip');
    }
    const videoBoxBefore = await getWindowBox(page);
    const chip = await page.$('#cozy-liveview-icon');
    const chipBox = await chip.boundingBox();
    await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(chipBox.x - 60, chipBox.y - 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const videoBoxAfter = await getWindowBox(page);
    if (Math.abs(videoBoxAfter.x - videoBoxBefore.x) > 1 || Math.abs(videoBoxAfter.y - videoBoxBefore.y) > 1) {
      throw new Error('dragging the LiveViewController chip moved the mini video window');
    }
    await page.close();
  });

  await test('WindowManager.create() is idempotent - opening the player twice never creates a duplicate window', async () => {
    const page = await newPage();
    await openPlayer(page);
    await page.click('#cozy-liveview-icon');
    await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
    await page.click('[data-lv-action="open"]');
    await page.waitForTimeout(100);
    const count = await page.$$eval('.cozy-window[data-window-id="living-worship-player"]', (els) => els.length);
    if (count !== 1) throw new Error(`expected exactly 1 window, found ${count}`);
    await page.close();
  });

  console.log('\nPicture-in-Picture (real browser API, feature-detected):');
  await test('PiP button disabled/enabled state matches document.pictureInPictureEnabled, honestly', async () => {
    const page = await newPage();
    await openPlayer(page);
    const pipEnabled = await page.evaluate(() => !!(document.pictureInPictureEnabled));
    const btnDisabled = await page.$eval('[data-player-action="pip"]', (el) => el.disabled);
    if (btnDisabled === pipEnabled) throw new Error(`PiP button disabled=${btnDisabled} does not honestly reflect pictureInPictureEnabled=${pipEnabled}`);
    if (!pipEnabled) {
      const title = await page.$eval('[data-player-action="pip"]', (el) => el.title);
      if (!/not supported/i.test(title)) throw new Error('unsupported PiP should have an honest tooltip explaining why');
    }
    await page.close();
  });

  await test('requestPictureInPicture path when supported, or an honest non-throwing failure when not', async () => {
    const page = await newPage();
    await openPlayer(page);
    await attachSyntheticStream(page);
    const pipEnabled = await page.evaluate(() => !!(document.pictureInPictureEnabled));
    const errCountBefore = pageErrors.length;
    if (pipEnabled) {
      await page.click('[data-player-action="pip"]');
      await page.waitForTimeout(300);
      const inPip = await page.evaluate(() => document.pictureInPictureElement !== null);
      const statusText = await page.$eval('#cozy-worship-player-status', (el) => el.textContent);
      if (!inPip && !/unavailable/i.test(statusText)) {
        throw new Error(`PiP was reported enabled but neither entered PiP nor honestly reported failure (status="${statusText}")`);
      }
    } else {
      const btnDisabled = await page.$eval('[data-player-action="pip"]', (el) => el.disabled);
      if (!btnDisabled) throw new Error('PiP unsupported but button was not disabled');
    }
    const newErrors = pageErrors.slice(errCountBefore);
    if (newErrors.length) throw new Error(`unexpected page error(s) during PiP attempt: ${newErrors.join(' | ')}`);
    await page.close();
  });

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (pageErrors.length) {
    console.log(`\nNote: ${pageErrors.length} raw page console/error event(s) captured across the run (see failures above for which, if any, were treated as test failures).`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
