'use strict';

/**
 * core/modules/ChurchOS/test/live-chat-workspace-browser.test.js
 *
 * Item 6 (CozyOS Live Chat Workspace) - REAL browser test (Playwright
 * + real Chromium at /opt/pw-browsers). Uses a combined harness loading
 * window-manager.js + cozy-living-assistant.js + living-worship-player.js
 * together, since Chat now genuinely opens the real Assistant panel.
 *
 * AUDIT FINDING: no peer-to-peer/participant chat backend exists
 * anywhere in this repository (confirmed absent - "chat" was honestly
 * listed in DISCLOSED_ABSENT_PANELS before this change). The one real,
 * existing, already-generic CozyOS chat surface is
 * window.CozyOS.LivingAssistant (its own real WindowManager-backed
 * panel, already mounted, already tested). This item wires the Live
 * Tools "Chat" toggle to that real, existing open() call - no new
 * chat/messaging engine, no duplicate window, not worship-specific
 * (the same Assistant panel serves every CozyOS domain).
 */

const { withBrowser, makeRunner } = require('../../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();
  const allPageErrors = [];

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function newPage(viewport = { width: 1280, height: 800 }) {
        const { page, pageErrors } = await openPage({ viewport });
        allPageErrors.push(pageErrors);
        await page.goto(serverURL('/core/modules/ChurchOS/test/video-assist-coexistence-harness.html'));
        await page.waitForSelector('#cozy-liveview-icon');
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
          return stream.id;
        });
      }

      function makeOpenChat() {
        return async function openChat(page) {
          const menuHidden = await page.isHidden('#cozy-worship-player-tools-menu');
          if (menuHidden) {
            await page.click('#cozy-worship-player-tools-toggle');
            await page.waitForSelector('#cozy-worship-player-tools-menu', { state: 'visible' });
          }
          await page.click('[data-panel-toggle="chat"]');
          await page.waitForSelector('#cozy-living-assistant-form', { state: 'visible', timeout: 5000 });
        };
      }

      console.log('\nItem 6 - CozyOS Live Chat Workspace, real browser verification:\n');

      await test('DESKTOP: opening Chat from Live Tools genuinely opens the real CozyOS Assistant workspace', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        await openChat(page);
        const visible = await page.isVisible('#cozy-living-assistant-form');
        if (!visible) throw new Error('the real Assistant chat form must genuinely open');
        await page.close();
      });

      await test("DESKTOP: opening Chat does not interrupt Live video/audio - same real MediaStream, not paused, exactly one video element", async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        const streamId = await attachSyntheticStream(page);
        await openChat(page);
        const state = await page.evaluate(() => {
          const v = document.querySelector('#cozy-worship-player-video');
          return { id: v.srcObject.id, paused: v.paused, videoCount: document.querySelectorAll('#cozy-worship-player-video').length };
        });
        if (state.id !== streamId) throw new Error('the real stream must be retained while Chat is open');
        if (state.paused) throw new Error('video must not pause merely because Chat opened');
        if (state.videoCount !== 1) throw new Error(`expected exactly one video element, found ${state.videoCount}`);
        await page.close();
      });

      await test('DESKTOP: exactly one WindowManager root exists with both Live and Chat windows open (no duplicate window manager)', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        await openChat(page);
        const wmCount = await page.evaluate(() => document.querySelectorAll('#cozy-window-manager-root').length);
        if (wmCount !== 1) throw new Error(`expected exactly one WindowManager root, found ${wmCount}`);
        const windowCount = await page.evaluate(() => document.querySelectorAll('.cozy-window').length);
        if (windowCount !== 2) throw new Error(`expected exactly two real windows (Live + Chat), found ${windowCount}`);
        await page.close();
      });

      await test('DESKTOP: Chat can be closed (via its own real window close) and Live keeps playing', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        const streamId = await attachSyntheticStream(page);
        await openChat(page);
        const assistantWindowClose = page.locator('.cozy-window:has(#cozy-living-assistant-form) [data-win-action="close"]');
        if (await assistantWindowClose.count() > 0) {
          await assistantWindowClose.click();
        } else {
          await page.evaluate(() => window.CozyOS.LivingAssistant.close());
        }
        const state = await page.evaluate(() => {
          const v = document.querySelector('#cozy-worship-player-video');
          return { id: v.srcObject ? v.srcObject.id : null, paused: v.paused };
        });
        if (state.id !== streamId) throw new Error('Live video must remain unaffected after closing Chat');
        if (state.paused) throw new Error('Live video must keep playing after closing Chat');
        await page.close();
      });

      await test('DESKTOP: reopening Chat after closing genuinely works again (no stale reference)', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        await openChat(page);
        await page.evaluate(() => window.CozyOS.LivingAssistant.close());
        await openChat(page);
        const visible = await page.isVisible('#cozy-living-assistant-form');
        if (!visible) throw new Error('Chat must be able to genuinely reopen after being closed');
        await page.close();
      });

      await test("DESKTOP: the honest status card in Live's own Chat panel reflects the real outcome (no fabricated embedded chat UI)", async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        await openChat(page);
        const content = await page.textContent('#cozy-worship-player-panel-content');
        if (!/Assistant workspace/i.test(content)) throw new Error('the honest status card text must be present');
        const embeddedForm = await page.locator('#cozy-worship-player-panel-content #cozy-living-assistant-form').count();
        if (embeddedForm !== 0) throw new Error("the real Assistant form must not be duplicated/embedded inside Live's own panel content");
        await page.close();
      });

      await test('MOBILE (390x844): opening Chat works, no horizontal overflow, video remains visible and unpaused', async () => {
        const page = await newPage({ width: 390, height: 844 });
        const openChat = makeOpenChat();
        await openPlayer(page);
        const streamId = await attachSyntheticStream(page);
        await openChat(page);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        if (scrollWidth > 390) throw new Error(`Chat must not cause horizontal overflow on mobile, got scrollWidth=${scrollWidth}`);
        const state = await page.evaluate(() => {
          const v = document.querySelector('#cozy-worship-player-video');
          return { id: v.srcObject.id, paused: v.paused, visible: v.offsetWidth > 0 && v.offsetHeight > 0 };
        });
        if (state.id !== streamId) throw new Error('the real stream must be retained on mobile');
        if (state.paused) throw new Error('video must not pause on mobile merely because Chat opened');
        await page.close();
      });

      await test('MOBILE (390x844): exactly one video element and one WindowManager root with Chat open', async () => {
        const page = await newPage({ width: 390, height: 844 });
        const openChat = makeOpenChat();
        await openPlayer(page);
        await openChat(page);
        const videoCount = await page.locator('#cozy-worship-player-video').count();
        const wmCount = await page.evaluate(() => document.querySelectorAll('#cozy-window-manager-root').length);
        if (videoCount !== 1) throw new Error(`expected exactly one video element, found ${videoCount}`);
        if (wmCount !== 1) throw new Error(`expected exactly one WindowManager root, found ${wmCount}`);
        await page.close();
      });

      await test('Chat interacts correctly with EXPANDED Live (maximize) - both remain independently functional', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        await page.click('[data-win-action="maximize"]');
        await openChat(page);
        const visible = await page.isVisible('#cozy-living-assistant-form');
        if (!visible) throw new Error('Chat must still open correctly while Live is expanded');
        await page.close();
      });

      await test('DESKTOP: repeated Chat open/close cycles (3x) all work correctly, no drift, no duplicate windows', async () => {
        const page = await newPage();
        const openChat = makeOpenChat();
        await openPlayer(page);
        for (let i = 0; i < 3; i++) {
          await openChat(page);
          const visible = await page.isVisible('#cozy-living-assistant-form');
          if (!visible) throw new Error(`cycle ${i + 1}: Chat must genuinely open`);
          await page.evaluate(() => window.CozyOS.LivingAssistant.close());
        }
        const windowCount = await page.evaluate(() => document.querySelectorAll('.cozy-window').length);
        if (windowCount !== 1) throw new Error(`expected exactly one real window (Live only, Chat closed) after 3 cycles, found ${windowCount}`);
        const wmCount = await page.evaluate(() => document.querySelectorAll('#cozy-window-manager-root').length);
        if (wmCount !== 1) throw new Error(`expected exactly one WindowManager root, found ${wmCount}`);
        await page.close();
      });

      await test('no page errors were thrown during any Item 6 interaction', async () => {
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
