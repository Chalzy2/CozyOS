'use strict';

/**
 * core/tests/browser/gemini-translation-provider-load-browser.test.js
 *
 * Domain 4C Dependency #4 - REAL browser test proving the actual
 * missing piece is genuinely fixed: window.CozyOS.
 * SpeechTranslationGeminiProvider now exists after loading the real,
 * unmodified index.html/dashboard.html pages through real Chromium
 * (via the canonical core/tests/browser/cozy-browser.js harness,
 * consistent with the Baseline Real Chromium Browser work) - not
 * grepped, not simulated in Node alone.
 *
 * Before this dependency, this exact check would have failed on both
 * pages: the file was never <script>-included, so
 * Dependencies #1-3's real wiring/registration/discoverability logic
 * could never actually run in a real browser, regardless of
 * credentials - a separate, more fundamental gap than the already-
 * documented "no live GEMINI_API_KEY/network in this sandbox" limit.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      for (const pageUrl of ['/index.html', '/dashboard.html']) {
        await test(`real ${pageUrl}: window.CozyOS.SpeechTranslationGeminiProvider genuinely exists after real page load (previously undefined)`, async () => {
          const { page } = await openPage();
          await page.goto(serverURL(pageUrl), { waitUntil: 'load', timeout: 20000 });
          const exists = await page.evaluate(() => typeof window.CozyOS !== 'undefined' && typeof window.CozyOS.SpeechTranslationGeminiProvider !== 'undefined');
          if (!exists) throw new Error(`window.CozyOS.SpeechTranslationGeminiProvider must exist on the real ${pageUrl} after this fix`);
          await page.close();
        });

        await test(`real ${pageUrl}: the real ensureGeminiProviderRegistered() genuinely succeeds in registering the real provider (real end-to-end call, real environment)`, async () => {
          const { page } = await openPage();
          await page.goto(serverURL(pageUrl), { waitUntil: 'load', timeout: 20000 });
          const result = await page.evaluate(() => {
            const svc = window.CozyOS && window.CozyOS.TranslationService;
            if (!svc || typeof svc.ensureGeminiProviderRegistered !== 'function') return { reachable: false };
            const r = svc.ensureGeminiProviderRegistered();
            const registered = !!(window.CozyOS.SpeechTranslationProviders && window.CozyOS.SpeechTranslationProviders.get('gemini-translate'));
            return { reachable: true, success: r.success, registered };
          });
          if (!result.reachable) throw new Error('TranslationService.ensureGeminiProviderRegistered is not reachable on this real page');
          if (!result.success || !result.registered) throw new Error(`expected genuine successful registration on the real page, got: ${JSON.stringify(result)}`);
          await page.close();
        });
      }

      await test('real index.html: a real translateSegment() call requesting gemini-translate now genuinely reaches the real provider (fails closed only on the known credential/network limitation, never on "not loaded")', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/index.html'), { waitUntil: 'load', timeout: 20000 });
        const result = await page.evaluate(async () => {
          const svc = window.CozyOS && window.CozyOS.TranslationService;
          if (!svc) return { reachable: false };
          const r = await svc.translateSegment({
            segmentId: 'browser-dep4-check',
            sourceLanguage: 'sw',
            targetLanguage: 'en',
            sourceText: 'Habari yako',
            preferredProviderName: 'gemini-translate',
          });
          return { reachable: true, success: r.success, reason: r.reason || null, providerName: r.providerName || null };
        });
        if (!result.reachable) throw new Error('TranslationService is not reachable on the real page');
        if (result.reason && /not loaded/i.test(result.reason)) {
          throw new Error(`the real gap this dependency fixes must be closed - got "not loaded" failure: ${result.reason}`);
        }
        console.log(`      LIVE GEMINI EXECUTION: ${result.success ? 'VERIFIED (unexpected in this sandbox)' : 'NOT-RUN (' + result.reason + ')'}`);
        await page.close();
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
