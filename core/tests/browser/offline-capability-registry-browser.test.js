/**
 * core/tests/browser/offline-capability-registry-browser.test.js
 *
 * REAL browser (Playwright + actual headless Chromium) verification of
 * core/modules/intelligence/offline/cozy-offline-capability-registry.js —
 * per this milestone's own Section 30 discipline ("A feature is not
 * offline-first merely because it contains IndexedDB... test statically,
 * in unit execution, in a real browser with network disabled, after
 * restart..."), and specifically because this module's whole reason for
 * being a classic (non-module) script is to avoid the real, independently
 * reproduced file:// + ES-module CORS defect this session found blocking
 * core/storage.js. A test that only ever loads it over http:// would not
 * actually prove that.
 *
 * Two real scenarios, both against the SAME unmodified fixture:
 *   1. Opened via a real file:// URL (no server at all) — the exact
 *      origin ("null") under which core/storage.js's own ES-module
 *      <script type="module"> tag was reproduced this session to fail
 *      with a CORS error. This registry must load cleanly there.
 *   2. Opened via the existing cozy-browser.js static-http harness, for
 *      parity with every other *-browser.test.js in this repository.
 *
 * Run with: node core/tests/browser/offline-capability-registry-browser.test.js
 */

'use strict';

const path = require('path');
const { withBrowser, REPO_ROOT } = require('./cozy-browser');

const FIXTURE_RELATIVE = 'core/tests/browser/fixtures/offline-capability-registry-fixture.html';

async function assertRegistryLoadedCleanly(page, pageErrors, consoleErrors, label) {
  if (pageErrors.length > 0) {
    throw new Error(`[${label}] uncaught page errors: ${pageErrors.join(' | ')}`);
  }
  const corsErrors = consoleErrors.filter((m) => /cors/i.test(m) || /blocked by CORS policy/i.test(m));
  if (corsErrors.length > 0) {
    throw new Error(`[${label}] unexpected CORS error(s) loading a classic script: ${corsErrors.join(' | ')}`);
  }

  const state = await page.evaluate(() => {
    const reg = window.CozyOS && window.CozyOS.OfflineCapabilityRegistry;
    if (!reg) return { present: false };
    return {
      present: true,
      classifications: reg.CLASSIFICATIONS,
      storageEntry: reg.classify('storage-gateway-indexeddb'),
      unknownEntry: reg.classify('a-name-nobody-registered-in-this-real-page'),
      seedCount: reg.list().length
    };
  });

  if (!state.present) throw new Error(`[${label}] window.CozyOS.OfflineCapabilityRegistry was not set — module failed to load/run.`);
  const expectedClassifications = ['LOCAL-CAPABLE', 'OPTIONAL', 'REQUIRED', 'UNKNOWN'];
  if (JSON.stringify(state.classifications) !== JSON.stringify(expectedClassifications)) {
    throw new Error(`[${label}] unexpected CLASSIFICATIONS: ${JSON.stringify(state.classifications)}`);
  }
  if (state.storageEntry.classification !== 'LOCAL-CAPABLE' || !state.storageEntry.registered) {
    throw new Error(`[${label}] expected the real storage-gateway-indexeddb seed entry, got: ${JSON.stringify(state.storageEntry)}`);
  }
  if (state.unknownEntry.classification !== 'UNKNOWN' || state.unknownEntry.registered !== false) {
    throw new Error(`[${label}] expected an unregistered name to classify as real UNKNOWN, got: ${JSON.stringify(state.unknownEntry)}`);
  }
  if (state.seedCount < 4) {
    throw new Error(`[${label}] expected at least the 4 real seed entries, got ${state.seedCount}`);
  }
}

async function main() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`ok - ${name}`);
      passed++;
    } catch (err) {
      console.log(`not ok - ${name}`);
      console.log('  ' + String(err && err.stack || err).split('\n').join('\n  '));
      failed++;
    }
  }

  try {
    await withBrowser(async ({ browser, openPage, serverURL }) => {
      // ── Scenario 1: real file:// origin, no server at all ──
      await test('loads cleanly with no CORS error from a real file:// URL (the exact origin core/storage.js\'s ES-module tag fails on)', async () => {
        const { page, consoleErrors, pageErrors } = await openPage();
        const fileUrl = 'file://' + path.join(REPO_ROOT, FIXTURE_RELATIVE);
        await page.goto(fileUrl, { waitUntil: 'load' });
        const origin = await page.evaluate(() => window.location.origin);
        if (origin !== 'null' && origin !== 'file://') {
          throw new Error('expected a real file:// origin (reported as "null" or "file://" by Chromium), got: ' + origin);
        }
        await assertRegistryLoadedCleanly(page, pageErrors, consoleErrors, 'file://');
        await page.close();
      });

      // ── Scenario 2: parity check over the existing http harness ──
      await test('loads cleanly over the existing static-http harness (parity with every other *-browser.test.js)', async () => {
        const { page, consoleErrors, pageErrors } = await openPage();
        await page.goto(serverURL('/' + FIXTURE_RELATIVE), { waitUntil: 'load' });
        await assertRegistryLoadedCleanly(page, pageErrors, consoleErrors, 'http://');
        await page.close();
      });

      // ── Scenario 3: register()/checkReachability() actually run in a real browser (not doubled) ──
      await test('register() and checkReachability() with a real DOM-dependent detect() function work in a real browser', async () => {
        const { page, pageErrors } = await openPage();
        await page.goto(serverURL('/' + FIXTURE_RELATIVE), { waitUntil: 'load' });
        const result = await page.evaluate(async () => {
          const reg = window.CozyOS.OfflineCapabilityRegistry;
          reg.register('real-browser-indexeddb-probe', {
            classification: 'LOCAL-CAPABLE',
            description: 'Whether this real page has a real indexedDB global.',
            evidence: 'this browser test',
            detect: () => typeof indexedDB !== 'undefined'
          });
          return await reg.checkReachability('real-browser-indexeddb-probe');
        });
        if (pageErrors.length > 0) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
        if (result !== true) throw new Error('expected a real Chromium page to report indexedDB reachable, got: ' + JSON.stringify(result));
        await page.close();
      });
    });
  } catch (e) {
    if (e.code === 'NO_PLAYWRIGHT' || e.code === 'NO_BROWSER') {
      console.log(`BROWSER_TEST = NOT_RUN (${e.message})`);
      process.exit(0);
    }
    throw e;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`BROWSER_TEST = ${failed === 0 ? 'PASS' : 'RAN_WITH_FAILURES'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log('BROWSER_TEST = RAN_WITH_FAILURES');
  process.exit(1);
});
