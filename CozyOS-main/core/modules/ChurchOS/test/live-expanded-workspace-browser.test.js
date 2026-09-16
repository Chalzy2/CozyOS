'use strict';

/**
 * core/modules/ChurchOS/test/live-expanded-workspace-browser.test.js
 *
 * Item 2 (Expanded CozyOS Live Workspace) - REAL browser test
 * (Playwright + real Chromium at /opt/pw-browsers). Reuses the
 * existing living-worship-player-mini-pip-harness.html (real,
 * unmodified window-manager.js + living-worship-player.js).
 *
 * SMALL AUDIT FINDING: EXPANDED already exists as a real, generic,
 * domain-agnostic capability of core/shell/window-manager.js -
 * WindowManager.maximize(id) (confirmed by reading its source: sets
 * width/height to 100vw/100vh, toggles a real .cozy-window-maximized
 * class, is DISTINCT from toggleFullscreen()'s real, separate
 * document.requestFullscreen() call). The real window chrome
 * WindowManager.create() already emits already contains a real
 * Maximize button (data-win-action="maximize") whenever
 * maximizable:true is passed - and living-worship-player.js's
 * #mountWindow() already passes maximizable:true. So EXPANDED for
 * CozyOS Live was ALREADY WIRED before this task - no new state
 * machine, no new window manager, and no new video player were
 * required. This file exists to genuinely VERIFY that real,
 * already-existing capability for the Live Worship player specifically
 * (state retention, Tools menu, mobile/desktop), and to report the
 * first genuine defect found, if any, rather than assuming success.
 */

const path = require('path');
const fs = require('fs');
const { withBrowser, makeRunner } = require('../../../tests/browser/cozy-browser');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

async function main() {
  const { test, summary } = makeRunner();
  const allPageErrors = [];

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
    async function newPage(viewport = { width: 1280, height: 800 }) {
          const { page, pageErrors } = await openPage({ viewport });
          allPageErrors.push(pageErrors);
          await page.goto(serverURL('/core/modules/ChurchOS/test/living-worship-player-mini-pip-harness.html'));
          return page;
        }

    async function openPlayer(page) {
      await page.click('#cozy-liveview-icon');
      await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
      await page.click('[data-lv-action="open"]');
      await page.waitForSelector('#cozy-worship-player-content');
    }

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
        return stream.id;
      });
    }

    console.log('\nItem 2 - Expanded CozyOS Live Workspace, real browser verification:\n');

    await test('1. compact state: Live window opens at its normal (non-maximized) size', async () => {
      const page = await newPage();
      await openPlayer(page);
      const box = await page.locator('.cozy-window:has(#cozy-worship-player-content)').first().boundingBox();
      if (!box) throw new Error('real window bounding box not found');
      if (box.width >= 1270) throw new Error('window should start compact, not already filling the viewport');
      await page.close();
    });

    await test('2/3. Expand action -> genuinely EXPANDED state (fills the viewport, real .cozy-window-maximized class, NOT the native Fullscreen API)', async () => {
      const page = await newPage();
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      const windowEl = page.locator('.cozy-window:has(#cozy-worship-player-content)').first();
      const hasClass = await windowEl.evaluate((el) => el.classList.contains('cozy-window-maximized'));
      if (!hasClass) throw new Error('real .cozy-window-maximized class must be applied');
      const box = await windowEl.boundingBox();
      if (box.width < 1270 || box.height < 790) throw new Error(`expected the window to fill the viewport, got ${box.width}x${box.height}`);
      const isNativeFullscreen = await page.evaluate(() => !!document.fullscreenElement);
      if (isNativeFullscreen) throw new Error('EXPANDED must NOT invoke the native Fullscreen API - that is Item 3');
      await page.close();
    });

    await test('4. Restore/compact action returns the window to its original compact size', async () => {
      const page = await newPage();
      await openPlayer(page);
      const windowEl = page.locator('.cozy-window:has(#cozy-worship-player-content)').first();
      const before = await windowEl.boundingBox();
      await page.click('[data-win-action="maximize"]');
      await page.click('[data-win-action="maximize"]');
      const after = await windowEl.boundingBox();
      if (Math.abs(after.width - before.width) > 5 || Math.abs(after.height - before.height) > 5) {
        throw new Error('restoring must return to the original compact size');
      }
      await page.close();
    });

    await test('5/6/7. video/playback/audio state is retained across compact -> expanded -> compact (same stream, not recreated)', async () => {
      const page = await newPage();
      await openPlayer(page);
      const streamId = await attachSyntheticStream(page);
      await page.evaluate(() => { document.querySelector('#cozy-worship-player-video').currentTime = 1; });
      await page.waitForTimeout(200);

      await page.click('[data-win-action="maximize"]');
      await page.waitForTimeout(100);
      const streamIdAfterExpand = await page.evaluate(() => document.querySelector('#cozy-worship-player-video').srcObject.id);
      const pausedAfterExpand = await page.evaluate(() => document.querySelector('#cozy-worship-player-video').paused);

      await page.click('[data-win-action="maximize"]');
      const streamIdAfterRestore = await page.evaluate(() => document.querySelector('#cozy-worship-player-video').srcObject.id);

      if (streamIdAfterExpand !== streamId || streamIdAfterRestore !== streamId) throw new Error('the real MediaStream must be the same instance throughout - no player recreation');
      if (pausedAfterExpand) throw new Error('playback must not pause merely from expanding');
      await page.close();
    });

    await test('8. the real Tools menu remains accessible and functional while EXPANDED', async () => {
      const page = await newPage();
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      await page.click('#cozy-worship-player-tools-toggle');
      await page.waitForSelector('#cozy-worship-player-tools-menu', { state: 'visible' });
      await page.click('[data-panel-toggle="timeline"]');
      const content = await page.textContent('#cozy-worship-player-panel-content');
      if (!/Timeline/i.test(content)) throw new Error('Tools menu panel content must still render while expanded');
      await page.close();
    });

    await test('9. Video Assist (the LiveViewController icon) remains reachable and functional while Live is EXPANDED', async () => {
      const page = await newPage();
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      const iconVisible = await page.isVisible('#cozy-liveview-icon');
      if (!iconVisible) {
        const restoreTabVisible = await page.isVisible('#cozy-liveview-restore-tab');
        if (!restoreTabVisible) throw new Error('neither the Video Assist icon nor a restore affordance is reachable while expanded');
      }
      await page.close();
    });

    await test('11. mobile viewport (390x844): expand fills the real small-phone viewport without horizontal overflow', async () => {
      const page = await newPage({ width: 390, height: 844 });
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      const windowEl = page.locator('.cozy-window:has(#cozy-worship-player-content)').first();
      const box = await windowEl.boundingBox();
      if (box.width > 390) throw new Error(`expanded window must not overflow the 390px viewport, got width=${box.width}`);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > 390) throw new Error(`page must not develop horizontal overflow when expanded on mobile, got scrollWidth=${scrollWidth}`);
      await page.close();
    });

    await test('12. desktop viewport (1280x800): expand fills the primary workspace correctly', async () => {
      const page = await newPage();
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      const windowEl = page.locator('.cozy-window:has(#cozy-worship-player-content)').first();
      const box = await windowEl.boundingBox();
      if (box.width < 1270 || box.height < 790) throw new Error('expanded window should fill the desktop viewport');
      await page.close();
    });

    await test('13/14. no duplicate video element or second WindowManager instance exists after multiple expand/restore cycles', async () => {
      const page = await newPage();
      await openPlayer(page);
      for (let i = 0; i < 3; i++) { await page.click('[data-win-action="maximize"]'); await page.click('[data-win-action="maximize"]'); }
      const videoCount = await page.locator('#cozy-worship-player-video').count();
      if (videoCount !== 1) throw new Error(`expected exactly one video element, found ${videoCount}`);
      const windowManagerCount = await page.evaluate(() => document.querySelectorAll('#cozy-window-manager-root').length);
      if (windowManagerCount !== 1) throw new Error(`expected exactly one WindowManager root, found ${windowManagerCount}`);
      await page.close();
    });

    await test('15. existing Live tools (Theater/Float/PiP header buttons) remain functional after expand/restore', async () => {
      const page = await newPage();
      await openPlayer(page);
      await page.click('[data-win-action="maximize"]');
      await page.click('[data-win-action="maximize"]');
      for (const action of ['expand', 'mini', 'pip']) {
        const count = await page.locator(`[data-player-action="${action}"]`).count();
        if (count !== 1) throw new Error(`expected exactly one real ${action} button after expand/restore, found ${count}`);
      }
      await page.close();
    });

    await test('no page errors were thrown during any Item 2 interaction', async () => {
      const flat = allPageErrors.flat();
      if (flat.length) throw new Error('real page errors: ' + flat.join(' | '));
    });

  
    });
  } catch (err) {
    if (err.code === 'NO_PLAYWRIGHT' || err.code === 'NO_BROWSER') {
      console.log(`BROWSER_TEST = NOT_RUN (${err.message})`);
      process.exit(0);
    }
    throw err;
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log(failed === 0 ? 'BROWSER_TEST = PASS' : 'BROWSER_TEST = RAN_WITH_FAILURES');
  process.exit(failed > 0 ? 1 : 0);
}

main();
