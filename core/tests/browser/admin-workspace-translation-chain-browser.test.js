'use strict';

/**
 * core/tests/browser/admin-workspace-translation-chain-browser.test.js
 *
 * Domain 4C Dependency #5 - REAL browser test proving the capability-
 * parity gap identified in the Domain 4C Completion Audit is genuinely
 * closed: admin-workspace.html now loads the same real translation
 * execution chain already proven on index.html/dashboard.html
 * (translation-segment-core.js + translation-service.js, alongside the
 * already-present provider registry/NLLB/Gemini adapter files), using
 * real Chromium via the canonical cozy-browser.js harness.
 *
 * Distinguishes explicitly:
 *   - page/provider loading success (structural)
 *   - translation execution-path reachability (the intent genuinely
 *     calling TranslationService)
 *   - live Gemini execution (credential/network-dependent, NOT-RUN here)
 *   - live NLLB execution (model-artifact-dependent, BLOCKED here)
 * Never treats a fail-closed result as success.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function loadAdminWorkspace() {
        const { page, pageErrors, consoleErrors } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 20000 });
        return { page, pageErrors, consoleErrors };
      }

      await test('PAGE LOAD: real admin-workspace.html loads and window.CozyOS.TranslationService now genuinely exists (previously undefined)', async () => {
        const { page } = await loadAdminWorkspace();
        const exists = await page.evaluate(() => typeof window.CozyOS !== 'undefined' && typeof window.CozyOS.TranslationService !== 'undefined' && typeof window.CozyOS.TranslationService.translateSegment === 'function');
        if (!exists) throw new Error('window.CozyOS.TranslationService.translateSegment must exist on the real admin-workspace.html after this fix');
        await page.close();
      });

      await test('PAGE LOAD: window.CozyOS.TranslationSegmentCore also genuinely exists on the real page', async () => {
        const { page } = await loadAdminWorkspace();
        const exists = await page.evaluate(() => typeof window.CozyOS !== 'undefined' && typeof window.CozyOS.TranslationSegmentCore !== 'undefined');
        if (!exists) throw new Error('window.CozyOS.TranslationSegmentCore must exist on the real admin-workspace.html after this fix');
        await page.close();
      });

      await test('PAGE LOAD: the real NLLB and Gemini provider objects (already present before this dependency) remain available, unaffected', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(() => ({
          nllb: typeof window.CozyOS.SpeechTranslationNLLBProvider !== 'undefined',
          gemini: typeof window.CozyOS.SpeechTranslationGeminiProvider !== 'undefined',
          registry: typeof window.CozyOS.SpeechTranslationProviders !== 'undefined',
        }));
        if (!result.nllb || !result.gemini || !result.registry) throw new Error(`expected all three to remain available, got: ${JSON.stringify(result)}`);
        await page.close();
      });

      await test('PAGE LOAD: registering gemini-translate via ensureGeminiProviderRegistered() genuinely succeeds on this real page too', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(() => {
          const svc = window.CozyOS.TranslationService;
          const r = svc.ensureGeminiProviderRegistered();
          const registered = !!window.CozyOS.SpeechTranslationProviders.get('gemini-translate');
          return { success: r.success, registered };
        });
        if (!result.success || !result.registered) throw new Error(`expected genuine successful registration, got: ${JSON.stringify(result)}`);
        await page.close();
      });

      await test('EXECUTION-PATH REACHABILITY: the real translate-request intent, invoked exactly as a real user would on this page, genuinely reaches TranslationService.translateSegment() (not merely "please send the exact text")', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(async () => {
          const ai = window.CozyOS.LivingAI;
          if (!ai || typeof ai.think !== 'function') return { reachable: false, reason: 'window.CozyOS.LivingAI.think is not available' };
          const r = await ai.think('Translate hello world to French.');
          if (!r.success) return { reachable: false, reason: r.reason };
          return { reachable: true, intent: r.result.intent, text: r.result.text };
        });
        if (!result.reachable) throw new Error(`the real conversational provider must be reachable on this page: ${result.reason}`);
        if (result.intent !== 'translate-request') throw new Error(`expected the real translate-request intent, got: ${result.intent}`);
        if (/please send me the exact text/i.test(result.text)) {
          throw new Error('the intent must genuinely reach TranslationService now, not fall back to the pre-Dependency-#1 "send exact text" reply, since real embedded text was provided');
        }
      });

      await test('FAIL-CLOSED: the real end-to-end call on this page fails closed honestly (no live backend in this test server) and never fabricates a translation', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(async () => {
          const svc = window.CozyOS.TranslationService;
          const r = await svc.translateSegment({
            segmentId: 'admin-dep5-check', sourceLanguage: 'sw', targetLanguage: 'en',
            sourceText: 'Habari yako', preferredProviderName: 'gemini-translate',
          });
          return { success: r.success, reason: r.reason || null };
        });
        if (result.reason && /not loaded/i.test(result.reason)) {
          throw new Error(`the capability-parity gap this dependency fixes must be closed - got "not loaded": ${result.reason}`);
        }
        if (result.success) {
          throw new Error('this test server has no real Gemini backend route - a reported success here would indicate a fabricated result, not genuine execution');
        }
        console.log(`      LIVE GEMINI EXECUTION: NOT-RUN (${result.reason})`);
        await page.close();
      });

      await test('FAIL-CLOSED (NLLB, default provider): a call with no preferredProviderName still routes through nllb-bridge and fails closed honestly - LIVE NLLB EXECUTION: BLOCKED (no real model artifacts in this environment)', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(async () => {
          const svc = window.CozyOS.TranslationService;
          const r = await svc.translateSegment({ segmentId: 'admin-dep5-nllb', sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'habari' });
          return { success: r.success, reason: r.reason || null };
        });
        if (result.success) throw new Error('no real NLLB bridge process exists in this environment - a reported success would be fabricated');
        console.log(`      LIVE NLLB EXECUTION: BLOCKED (${result.reason})`);
        await page.close();
      });

      await test('REGRESSION: the existing "please send the exact text" fallback still works correctly for a genuinely ambiguous request (no embedded text) on this page', async () => {
        const { page } = await loadAdminWorkspace();
        const result = await page.evaluate(async () => {
          const ai = window.CozyOS.LivingAI;
          const r = await ai.think('Translate this into French.');
          return { intent: r.result.intent, text: r.result.text };
        });
        if (result.intent !== 'translate-request') throw new Error('unrelated regression: intent classification changed');
        if (!/exact text/i.test(result.text)) throw new Error('the existing honest fallback for placeholder text must remain unchanged on this page');
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
