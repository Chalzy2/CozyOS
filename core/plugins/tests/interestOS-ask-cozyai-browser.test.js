'use strict';

/**
 * core/plugins/tests/interestOS-ask-cozyai-browser.test.js
 *
 * REAL browser test (Playwright + real Chromium at /opt/pw-browsers,
 * core/tests/browser/cozy-browser.js) for InterestOS's "Ask CozyAI"
 * button.
 *
 * PHASE 4 (Universal Language Capability / "ONE Live Window" rule)
 * REWRITE: this button used to be a whole embedded input+button+answer
 * widget composing window.CozyOS.CozyAnswerEngine directly — a real,
 * disclosed second conversational UI surface (never a second AI, since
 * it reused the same CozyAnswerEngine, but a second entry point). Per
 * the explicit Phase 4 requirement, it has been replaced with a single
 * button that opens/focuses the ONE existing, canonical Live Window on
 * dashboard.html via a real cross-page hand-off (sessionStorage) — this
 * suite now proves THAT real navigation + real Live Window auto-open +
 * real disclosure banner, not a business-data answer (that capability
 * still works, unchanged, through the general Live Window itself —
 * proven separately by core/living/tests/cozy-living-assistant-
 * business-data-repair.test.js).
 */

const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function newPage(viewport) {
        const { page, pageErrors, consoleErrors, failedRequests } = await openPage({ viewport });
        await page.addInitScript(() => {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.Session = { current: () => ({ uid: 'ask-cozyai-browser-test-owner' }) };
        });
        await page.goto(serverURL('/applications/InterestOS/interestos.html'));
        await page.waitForSelector('#ios-engine-status');
        return { page, pageErrors, consoleErrors, failedRequests };
      }

      for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
        const label = `${viewport.width}x${viewport.height}`;
        const { page, pageErrors, consoleErrors } = await newPage(viewport);

        await test(`[${label}] the old embedded Ask CozyAI input/answer widget no longer exists — only the single button remains`, async () => {
          const inputCount = await page.locator('#ios-biz-ask-input').count();
          if (inputCount !== 0) throw new Error('expected the old embedded #ios-biz-ask-input to be removed');
          const btnCount = await page.locator('#ios-biz-ask-btn').count();
          if (btnCount !== 1) throw new Error('expected exactly one #ios-biz-ask-btn');
        });

        await test(`[${label}] the Ask CozyAI button becomes visible once a real table exists (same real #ios-biz-table-editor gate every other business control uses)`, async () => {
          await page.fill('#ios-biz-table-name-input', 'AI Shop');
          await page.click('#ios-biz-new-table-btn');
          await page.waitForSelector('#ios-biz-table-editor', { state: 'visible' });
          await page.waitForSelector('#ios-biz-ask-btn', { state: 'visible' });
        });

        await test(`[${label}] clicking Ask CozyAI navigates to the real dashboard.html (the ONE canonical Live Window page)`, async () => {
          await Promise.all([
            page.waitForURL(/dashboard\.html/, { timeout: 15000 }),
            page.click('#ios-biz-ask-btn')
          ]);
          if (!/dashboard\.html/.test(page.url())) throw new Error('expected navigation to dashboard.html, got: ' + page.url());
        });

        await test(`[${label}] the real Live Window auto-opens on arrival, with a real disclosure banner mentioning InterestOS`, async () => {
          await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
          const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
          const joined = messages.join(' | ');
          if (!/InterestOS/i.test(joined)) throw new Error('expected a real disclosure banner mentioning InterestOS in: ' + joined);
        });

        await test(`[${label}] no unexpected console/page errors from the Ask CozyAI hand-off`, async () => {
          if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
          const unexpected = consoleErrors.filter((e) => !/status of 404.*Not Found|documents\/personal\/search/i.test(e));
          if (unexpected.length) throw new Error('console errors: ' + unexpected.join(' | '));
        });
      }
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log(`BROWSER_TEST = NOT_RUN (${e.message})`);
      process.exit(0);
    }
    console.log('BROWSER_TEST = RAN_WITH_FAILURES (harness error: ' + e.message + ')');
    process.exit(1);
  }

  const { passed, failed } = summary();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`BROWSER_TEST = ${failed === 0 ? 'PASS' : 'RAN_WITH_FAILURES'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
