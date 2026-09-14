'use strict';

/**
 * core/modules/ChurchOS/test/video-assist-coexistence-browser.test.js
 *
 * Item 1 (Video Assist floating button) - REAL browser test.
 *
 * CONSOLIDATED onto the canonical, repository-wide browser-verification
 * harness (core/tests/browser/cozy-browser.js), which itself delegates
 * Chromium discovery to server/webauthn-rp/test/browser-launch.js. This
 * file previously duplicated its own startServer()/http.createServer()/
 * playwright.chromium.launch() boilerplate - that duplication has been
 * removed; test semantics (real launch, real desktop/390x844 mobile
 * viewports, real pointer drag, real bounding-box checks) are
 * unchanged.
 *
 * FINDING (unchanged from original): the real "Video Assist" floating
 * button already exists as LiveViewController's own #cozy-liveview-icon
 * (circular, draggable, position-persisted, coexists with the AI
 * Assistant button at an independent default corner). The gap this
 * item closed was its accessible label - generalized to "CozyOS Live -
 * Video Assist" so it reads as general-purpose, not worship-only.
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
        await page.goto(serverURL('/core/modules/ChurchOS/test/video-assist-coexistence-harness.html'));
        await page.waitForSelector('#cozy-liveview-icon');
        return page;
      }

      console.log('\nItem 1 - Video Assist floating button, real browser verification:\n');

      await test('the real Video Assist button (#cozy-liveview-icon) is genuinely visible on desktop', async () => {
        const page = await newPage();
        const visible = await page.isVisible('#cozy-liveview-icon');
        if (!visible) throw new Error('Video Assist button must be visible');
        await page.close();
      });

      await test('the button has the correct, generalized accessible label (not worship-specific)', async () => {
        const page = await newPage();
        const label = await page.getAttribute('#cozy-liveview-icon', 'aria-label');
        if (!/CozyOS Live/i.test(label)) throw new Error(`expected a generic "CozyOS Live" label, got: ${label}`);
        if (/worship/i.test(label)) throw new Error(`accessible label must not be worship-specific, got: ${label}`);
        await page.close();
      });

      await test('the real AI Assistant button and the real Video Assist button both exist and do not overlap', async () => {
        const page = await newPage();
        const aiBox = await page.locator('#cozy-living-assistant-btn').boundingBox();
        const videoBox = await page.locator('#cozy-liveview-icon').boundingBox();
        if (!aiBox || !videoBox) throw new Error('both real buttons must have real bounding boxes');
        const overlap = !(aiBox.x + aiBox.width < videoBox.x || videoBox.x + videoBox.width < aiBox.x
          || aiBox.y + aiBox.height < videoBox.y || videoBox.y + videoBox.height < aiBox.y);
        if (overlap) throw new Error('AI Assistant and Video Assist buttons must not overlap');
        await page.close();
      });

      await test('tapping the Video Assist button reveals its real menu, and "Open Live View" genuinely opens the real Live workspace', async () => {
        const page = await newPage();
        await page.click('#cozy-liveview-icon');
        await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
        await page.click('[data-lv-action="open"]');
        await page.waitForSelector('#cozy-worship-player-content');
        const visible = await page.isVisible('#cozy-worship-player-content');
        if (!visible) throw new Error('the real Live workspace must genuinely open');
        await page.close();
      });

      await test('the real AI Assistant remains fully functional (opens its own real panel) after Video Assist is used', async () => {
        const page = await newPage();
        await page.click('#cozy-liveview-icon');
        await page.waitForSelector('#cozy-liveview-panel:not([hidden])');
        await page.click('[data-lv-action="open"]');
        await page.waitForSelector('#cozy-worship-player-content');

        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });
        const formVisible = await page.isVisible('#cozy-living-assistant-form');
        if (!formVisible) throw new Error('AI Assistant must remain fully functional independently of Video Assist');
        await page.close();
      });

      await test('both buttons coexist correctly on a real small-phone viewport (390x844)', async () => {
        const page = await newPage({ width: 390, height: 844 });
        const aiVisible = await page.isVisible('#cozy-living-assistant-btn');
        const videoVisible = await page.isVisible('#cozy-liveview-icon');
        if (!aiVisible || !videoVisible) throw new Error('both buttons must be visible on a small phone viewport');
        const aiBox = await page.locator('#cozy-living-assistant-btn').boundingBox();
        const videoBox = await page.locator('#cozy-liveview-icon').boundingBox();
        if (aiBox.x + aiBox.width > 390 || videoBox.x + videoBox.width > 390) {
          throw new Error('buttons must remain within the small-phone viewport, not pushed off-screen');
        }
        await page.close();
      });

      await test('the real Video Assist button remains draggable (real Pointer Events reposition it) - reusing the existing, already-tested drag infrastructure, not a new engine', async () => {
        const page = await newPage();
        const before = await page.locator('#cozy-liveview-icon').boundingBox();
        await page.locator('#cozy-liveview-icon').hover();
        await page.mouse.down();
        await page.mouse.move(before.x - 120, before.y - 120, { steps: 10 });
        await page.mouse.up();
        const after = await page.locator('#cozy-liveview-icon').boundingBox();
        if (Math.abs(after.x - before.x) < 20 && Math.abs(after.y - before.y) < 20) {
          throw new Error('the button should have genuinely moved via real drag');
        }
        await page.close();
      });

      await test('no second floating-button/window-manager engine was introduced (source check)', async () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'core', 'modules', 'ChurchOS', 'living-worship-player.js'), 'utf8');
        if (/class\s+\w*FloatingButton\w*Engine/.test(src)) throw new Error('a second floating-button engine was found');
      });

      await test('no page errors were thrown during any of the above interactions', async () => {
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
