'use strict';

/**
 * core/modules/ocr/tests/tesseract-vendor-dependency-browser.test.js
 *
 * RP-USER-ACCESS-2 follow-up (this session) — REAL browser test using the
 * existing canonical harness (core/tests/browser/cozy-browser.js), the
 * same Single-Source-of-Truth infrastructure the Live Item 1-6 and
 * WebAuthn browser tests already use. No second browser-launch mechanism
 * created here.
 *
 * PURPOSE (disclosed, narrow scope)
 *   The Node-side smoke test (tesseract-vendor-dependency-smoke.test.js)
 *   checks file presence on disk. This file checks the thing that
 *   actually matters to a user: loaded in a REAL Chromium DOM, does
 *   CozyOS.OCR.getProviderStatus() honestly report unavailable when the
 *   vendor files are missing, with no fabricated success and no silent
 *   swallowed script error? It answers that question for whatever the
 *   real, current on-disk state of core/vendor/tesseract/ is at run
 *   time — it does not assume BLOCKED and does not assume available.
 */

const { withBrowser, makeRunner } = require('../../../tests/browser/cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      const { page, pageErrors, failedRequests } = await openPage();
      await page.goto(serverURL('/core/modules/ocr/tests/tesseract-vendor-dependency-browser-harness.html'));
      await page.waitForFunction('window.__ready === true', { timeout: 5000 });

      await test('real Chromium loaded the real cozy-ocr.js + tesseract-plugin.js without a fatal page error', async () => {
        if (pageErrors.length) throw new Error('unexpected page errors: ' + pageErrors.join(' | '));
      });

      await test('vendor tesseract.min.js load result matches actual on-disk vendor state (no silent fallback)', async () => {
        const failed404 = failedRequests.some(r => /vendor\/tesseract\/tesseract\.min\.js$/.test(r.url));
        const vendorScriptError = await page.evaluate(() => !!window.__vendorScriptError);
        // Not asserting a fixed direction here — this test reports what a
        // real browser actually observed, whichever way that goes.
        if (failed404 && !vendorScriptError) {
          throw new Error('request to vendor tesseract.min.js failed but onerror handler did not fire — inconsistent browser signal');
        }
      });

      await test('CozyOS.OCR.getProviderStatus() runs in a real DOM and reports availability honestly', async () => {
        const status = await page.evaluate(() => window.__ocrProviderStatus);
        const windowTesseractPresent = await page.evaluate(() => window.__windowTesseractPresent);
        if (!status || status.error) throw new Error('getProviderStatus() did not return a usable status: ' + JSON.stringify(status));
        if (typeof status.available !== 'boolean') throw new Error('status.available was not a boolean: ' + JSON.stringify(status));
        // The one real invariant this test enforces: availability must
        // agree with whether window.Tesseract actually exists — i.e. no
        // fabricated "available: true" while the underlying library
        // global is genuinely absent.
        if (status.available === true && windowTesseractPresent === false) {
          throw new Error('getProviderStatus() reported available:true with no window.Tesseract present — this would be a fabricated-availability regression');
        }
        console.log(`      observed: available=${status.available}, engine=${status.engine}, windowTesseractPresent=${windowTesseractPresent}`);
      });

      /* =================================================================
         REAL in-browser recognition (Real Artifact Integration milestone,
         continuation). Only meaningful if window.Tesseract actually
         loaded — the harness page itself no-ops the recognition pass
         otherwise, which the earlier tests above already cover honestly.
      ================================================================= */
      const windowTesseractPresent = await page.evaluate(() => window.__windowTesseractPresent);
      if (windowTesseractPresent) {
        await page.waitForFunction('window.__recognitionReady === true', { timeout: 180000 });
        const results = await page.evaluate(() => window.__recognitionResults);

        for (const lang of ['eng', 'swa', 'fra', 'ara', 'rus', 'chi_sim', 'yor', 'amh', 'hin']) {
          await test(`REAL in-browser recognize(): ${lang} matches its known-text fixture (OCR-RECOGNITION-VERIFIED)`, async () => {
            const r = results.find((x) => x.lang === lang);
            if (!r) throw new Error(`no result recorded for ${lang}`);
            if (r.kind === 'ERROR') throw new Error(`real recognize() call threw: ${r.error}`);
            // Honest failure mode (this continuation's whole point): a model
            // that loads but whose real recognize() output does not match
            // its ground-truth fixture is reported OCR-RECOGNITION-FAILED,
            // not silently passed and not left at a stale MODEL-LOAD-VERIFIED
            // claim.
            if (!r.matches) throw new Error(`OCR-RECOGNITION-FAILED — expected "${r.groundTruth}", got "${r.recognizedText}"`);
            const ruleNote = r.comparisonRule && r.comparisonRule !== 'EXACT' ? ` (matched via disclosed rule: ${r.comparisonRule})` : '';
            console.log(`      ${lang}: recognized "${r.recognizedText}" (real worker.recognize(), real traineddata)${ruleNote}`);
          });
        }
      } else {
        console.log('      window.Tesseract not present — skipping real recognition tests (already covered by the availability test above)');
      }

      await page.close();
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
