'use strict';

/**
 * core/living/tests/phase5-cml6-real-browser-reachability.test.js
 * PHASE 5 (Universal Rewiring) — PRIORITY 1/8 proof.
 *
 * REAL browser test (Playwright + real Chromium) proving the CML-6
 * script block just added to dashboard.html/index.html actually loads,
 * in the real browser, without breaking page load or introducing new
 * console/page errors — "do not merely test modules in isolation."
 */

const { withBrowser, makeRunner } = require('../../tests/browser/cozy-browser');

const CML6_GLOBALS = [
  'ContinuousLearningFabric', 'LanguageFluencyDiagnostic', 'ActiveLearning', 'LanguageGapRegistry',
  'EvidenceProfile', 'ConflictDetection', 'LearningGapDiscovery', 'LearningPriority',
  'ObservationLifecycle', 'ObservationEvidenceBridge', 'CanonicalConceptRegistry', 'ObservationStore',
  'MultimodalObservationAdapter', 'CozyTeachFlow',
];

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      for (const pageName of ['dashboard.html', 'index.html']) {
        const { page, pageErrors, consoleErrors } = await openPage({ viewport: { width: 1280, height: 900 } });
        await page.addInitScript(() => {
          window.CozyOS = window.CozyOS || {};
          window.CozyOS.Session = { current: () => ({ uid: 'phase5-cml6-reachability-test' }) };
        });
        await page.goto(serverURL('/' + pageName));
        await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });

        await test(`[${pageName}] every real CML-6 global is reachable on window.CozyOS after a real page load`, async () => {
          const status = await page.evaluate((names) => {
            const c = window.CozyOS || {};
            return names.reduce((acc, name) => { acc[name] = typeof c[name] !== 'undefined'; return acc; }, {});
          }, CML6_GLOBALS);
          const missing = Object.entries(status).filter(([, present]) => !present).map(([name]) => name);
          if (missing.length) throw new Error(`expected all CML-6 globals reachable, missing: ${missing.join(', ')}`);
        });

        await test(`[${pageName}] ContinuousLearningFabric.observeEvent is a real, callable function on the live page`, async () => {
          const isFn = await page.evaluate(() => typeof (window.CozyOS.ContinuousLearningFabric && window.CozyOS.ContinuousLearningFabric.observeEvent) === 'function');
          if (!isFn) throw new Error('expected ContinuousLearningFabric.observeEvent to be a real function');
        });

        await test(`[${pageName}] no unexpected console/page errors from loading the CML-6 script block`, async () => {
          if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
          const unexpected = consoleErrors.filter((e) => !/status of 404.*Not Found|documents\/personal\/search|gstatic\.com|firebase-app\.js|Failed to fetch dynamically imported module/i.test(e));
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
