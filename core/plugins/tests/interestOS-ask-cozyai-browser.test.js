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
 *
 * PHASE 5 addition: every test above loads interestos.html as a
 * standalone TOP-LEVEL page. The real production path is different —
 * core/shell/application-launcher.js embeds interestos.html inside a
 * real <iframe> (it has its own <head>, so the launcher's own
 * isStandalone check routes it through the iframe path, not a plain
 * fragment). A Phase 5 architecture audit found the button's real
 * `window.location.href` navigation only ever navigated the IFRAME's
 * own window in that embedding — loading a second, nested dashboard.html
 * (and a second Live Window) inside the iframe instead of reusing the
 * parent dashboard's already-mounted singleton. The fix (this same
 * commit) makes the button navigate `window.top` when embedded. The
 * test below reproduces the REAL embedding (dashboard.html as the top
 * frame, interestos.html as a genuine child iframe inside it) and
 * proves the TOP frame — not a nested copy — ends up on dashboard.html
 * with exactly one Live Window.
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

      // PHASE 5 — the REAL embedded-iframe scenario (see file header).
      // Parent = dashboard.html (already mounts its own Live Window, the
      // exact real production entry point). Child = interestos.html,
      // injected as a genuine <iframe>, matching
      // core/shell/application-launcher.js's own real isStandalone/iframe
      // path for any app page carrying its own <head>.
      {
        const { page, pageErrors } = await openPage({ viewport: { width: 1280, height: 900 } });
        await page.addInitScript(() => {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.Session = { current: () => ({ uid: 'ask-cozyai-iframe-test-owner' }) };
        });
        await page.goto(serverURL('/dashboard.html'));
        // Confirms the parent's real, singleton Live Window is genuinely
        // mounted BEFORE the child iframe exists — the exact real
        // precondition this test exists to protect. It starts collapsed
        // (no sessionStorage hand-off context yet), so we only wait for
        // the floating launcher button here, not the (closed) input.
        await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
        // The real Stage 1-6 launch-sequence overlay (core/shell/
        // launch-sequence.css, z-index 999999) sits above every other
        // fixed-position surface, including this test's own dynamically
        // injected iframe, until it fades out — wait for its real
        // "finished" class (pointer-events:none) before interacting.
        await page.waitForSelector('#cozy-launch-screen.cozy-launch-hidden', { timeout: 20000 }).catch(() => { /* some pages skip the overlay entirely — real DOM interactions below will fail loudly if genuinely blocked */ });

        await test('[embedded-iframe] interestos.html embedded as a real iframe inside dashboard.html, Ask CozyAI navigates the TOP frame (not a nested copy)', async () => {
          await page.evaluate(() => {
            const iframe = document.createElement('iframe');
            iframe.id = 'phase5-interestos-iframe-probe';
            iframe.src = 'applications/InterestOS/interestos.html';
            iframe.style.cssText = 'width:100%;height:600px;border:0;';
            document.body.appendChild(iframe);
          });
          const childFrame = await new Promise((resolve, reject) => {
            const start = Date.now();
            (function poll() {
              const f = page.frames().find((fr) => /interestos\.html/.test(fr.url()));
              if (f) return resolve(f);
              if (Date.now() - start > 15000) return reject(new Error('interestos.html iframe never appeared'));
              setTimeout(poll, 100);
            })();
          });
          await childFrame.waitForSelector('#ios-engine-status');
          await childFrame.fill('#ios-biz-table-name-input', 'AI Shop Iframe');
          await childFrame.click('#ios-biz-new-table-btn');
          await childFrame.waitForSelector('#ios-biz-table-editor', { state: 'visible' });
          await childFrame.waitForSelector('#ios-biz-ask-btn', { state: 'visible' });

          await Promise.all([
            page.waitForURL(/dashboard\.html/, { timeout: 15000 }),
            childFrame.click('#ios-biz-ask-btn')
          ]);
          // The TOP page itself navigated (not just the child frame) —
          // confirmed by page.url() (the top frame's own URL) landing on
          // dashboard.html, and the child iframe being gone (a top-level
          // navigation unloads every child frame with it).
          if (!/dashboard\.html/.test(page.url())) throw new Error('expected the TOP frame to navigate to dashboard.html, got: ' + page.url());
          const remainingInterestOSFrames = page.frames().filter((fr) => /interestos\.html/.test(fr.url()));
          if (remainingInterestOSFrames.length !== 0) throw new Error('expected the interestos.html iframe to be gone after a real top-level navigation, found ' + remainingInterestOSFrames.length);

          await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
          const liveWindowCount = await page.locator('#cozy-living-assistant-input').count();
          if (liveWindowCount !== 1) throw new Error('expected exactly ONE Live Window input on the real top-level page, found ' + liveWindowCount);
          const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
          if (!/InterestOS/i.test(messages.join(' | '))) throw new Error('expected the real disclosure banner mentioning InterestOS on the top-level Live Window');
        });

        await test('[embedded-iframe] no unexpected page errors from the real embedded hand-off', async () => {
          // Same allowlist discipline as the per-viewport console-error
          // check above: a real dashboard.html page load attempts a
          // dynamic import from an external CDN (Firebase), which this
          // sandboxed test environment's network policy blocks —
          // pre-existing, unrelated to this hand-off, not something this
          // fix introduced or could resolve.
          const unexpected = pageErrors.filter((e) => !/gstatic\.com|firebase-app\.js|Failed to fetch dynamically imported module/i.test(e));
          if (unexpected.length) throw new Error('page errors: ' + unexpected.join(' | '));
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
