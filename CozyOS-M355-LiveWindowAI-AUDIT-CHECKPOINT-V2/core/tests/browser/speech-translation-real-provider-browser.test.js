'use strict';

/**
 * core/tests/browser/speech-translation-real-provider-browser.test.js
 *
 * NEXT SMALL DEPENDENCY — VERIFY REAL TRANSLATOR (continuing from M399).
 * Investigation only: does the real, existing SpeechTranslationAdapter
 * genuinely have a working translation provider in a real Chromium, and
 * can it actually translate one existing Public Story sentence from
 * English to French? No new translator, no architecture change — this
 * loads the real, unmodified admin-workspace.html (the one real page
 * that already loads the full, correctly-ordered chain: cozy-translate.js
 * -> speech-translation-adapter.js -> speech-translation-provider.js ->
 * -nllb.js -> -gemini.js) through the existing cozy-browser.js harness
 * and calls the adapter's own real, existing previewTranslation() API.
 *
 * Never fabricates a result: if self.Translator is absent (the common
 * case for a standard, non-flagged Chromium) and no other provider
 * self-registers, this reports NOT-RUN with the honest reason returned
 * by the real code — it does not simulate a translation.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      await test('real admin-workspace.html: self.Translator presence, honestly detected', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 30000 });
        // The adapter self-invokes init() (which calls autoDetectBrowserProvider())
        // on load — give that real async work a tick to settle before reading capabilities.
        await page.waitForTimeout(500);

        const report = await page.evaluate(async () => {
          const hasTranslatorGlobal = typeof self !== 'undefined' && typeof self.Translator !== 'undefined';
          const adapter = window.CozyOS && window.CozyOS.SpeechTranslationAdapter;
          const providers = window.CozyOS && window.CozyOS.SpeechTranslationProviders;
          const caps = adapter ? adapter.getCapabilities() : null;
          const registeredProviders = providers ? providers.list().map(p => ({ name: p.name, type: p.type })) : [];
          return { hasTranslatorGlobal, adapterLoaded: !!adapter, caps, registeredProviders };
        });

        console.log(`      self.Translator present: ${report.hasTranslatorGlobal}`);
        console.log(`      SpeechTranslationAdapter loaded: ${report.adapterLoaded}`);
        console.log(`      Registered providers: ${JSON.stringify(report.registeredProviders)}`);
        console.log(`      getCapabilities(): ${JSON.stringify(report.caps)}`);

        if (!report.adapterLoaded) throw new Error('window.CozyOS.SpeechTranslationAdapter did not load on the real page');
        global.__translatorReport = report;
        await page.close();
      });

      await test('real admin-workspace.html: attempt one genuine EN->FR translation of an existing Public Story sentence (no fabrication)', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(500);

        // The exact, existing, already-public sentence from
        // core/identity/project-history.js's "background" text (via
        // DeveloperIdentity.answerWhyCreated()) — read verbatim here for
        // verification only, not modified, not re-authored.
        const sourceSentence = 'Before creating CozyOS, Charles Owuor gained practical experience selling products door-to-door.';

        const result = await page.evaluate(async (text) => {
          const adapter = window.CozyOS && window.CozyOS.SpeechTranslationAdapter;
          if (!adapter) return { reachable: false };
          const caps = adapter.getCapabilities();
          if (!caps.supportsTranslation) {
            return { reachable: true, attempted: false, supportsTranslation: false };
          }
          try {
            const out = await adapter.previewTranslation(text, { sourceLanguage: 'en', targetLanguage: 'fr' });
            return { reachable: true, attempted: true, supportsTranslation: true, isReal: out.isReal, translatedText: out.translatedText || null, reason: out.reason || null };
          } catch (err) {
            return { reachable: true, attempted: true, supportsTranslation: true, isReal: false, translatedText: null, reason: err.message };
          }
        }, sourceSentence);

        if (!result.reachable) throw new Error('SpeechTranslationAdapter is not reachable on the real page');

        if (!result.supportsTranslation) {
          console.log('      TRANSLATION ATTEMPT: NOT-RUN (getCapabilities().supportsTranslation === false — no real provider registered, e.g. self.Translator absent in this Chromium build)');
        } else if (result.isReal && result.translatedText) {
          console.log(`      TRANSLATION ATTEMPT: REAL RESULT — "${sourceSentence}" -> "${result.translatedText}"`);
        } else {
          console.log(`      TRANSLATION ATTEMPT: FAILED CLOSED (isReal:false) — reason: ${result.reason}`);
        }
        global.__translationResult = result;
        await page.close();
      });
      await test('real admin-workspace.html: sw->sw session reaches full onStart/onTranslation/onCompleted lifecycle, preserves text byte-for-byte, honest passthrough', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(500);

        // Genuine Kiswahili sentence, source-language content in its own
        // right (per KISWAHILI SOURCE LANGUAGE correction) — not a
        // translation of anything, just real text to round-trip.
        const kiswahiliText = 'Karibu kanisani asubuhi ya leo, Mungu awabariki nyote.';

        const outcome = await page.evaluate(async (text) => {
          const adapter = window.CozyOS && window.CozyOS.SpeechTranslationAdapter;
          const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
          if (!adapter || !bus) return { reachable: false };

          const events = [];
          const unsubs = ['onStart', 'onTranslation', 'onCompleted', 'onError'].map((name) =>
            bus.on(`speech-translation:${name}`, (detail) => events.push({ name, detail }))
          );

          const sessionId = adapter.startTranslationSession({ sourceLanguage: 'sw', targetLanguage: 'sw' });
          const result = await adapter.translateText(sessionId, text);
          const recent = adapter.listRecentTranslations(sessionId);

          unsubs.forEach((off) => { if (typeof off === 'function') off(); });

          return {
            reachable: true, sessionId, result,
            eventNames: events.map(e => e.name),
            eventsForSession: events.filter(e => e.detail && e.detail.sessionId === sessionId),
            recentEntry: recent[0] || null,
          };
        }, kiswahiliText);

        if (!outcome.reachable) throw new Error('SpeechTranslationAdapter/PlatformEventBus not reachable on the real page');

        console.log(`      events fired: ${JSON.stringify(outcome.eventNames)}`);
        console.log(`      result: ${JSON.stringify(outcome.result)}`);

        if (!outcome.eventNames.includes('onStart')) throw new Error('onStart never fired for sw->sw session');
        if (!outcome.eventNames.includes('onTranslation')) throw new Error('onTranslation never fired for sw->sw session');
        if (!outcome.eventNames.includes('onCompleted')) throw new Error('onCompleted never fired for sw->sw session');
        if (outcome.eventNames.includes('onError')) throw new Error('onError unexpectedly fired for a same-language passthrough');
        if (outcome.eventsForSession.length !== 3) throw new Error(`expected exactly 3 events tagged with this sessionId (onStart/onTranslation/onCompleted), got ${outcome.eventsForSession.length}`);

        if (outcome.result.translatedText !== kiswahiliText) throw new Error(`text not preserved byte-for-byte: got ${JSON.stringify(outcome.result.translatedText)}`);
        if (outcome.result.preserved !== true) throw new Error('result does not honestly disclose preserved:true');
        if (outcome.result.providerName !== 'passthrough-same-language') throw new Error(`expected honest passthrough providerName, got ${outcome.result.providerName}`);
        if (outcome.recentEntry.providerName !== 'passthrough-same-language') throw new Error('listRecentTranslations() does not honestly record the passthrough');

        await page.close();
      });

      await test('real admin-workspace.html: sw->sw succeeds with ZERO providers registered (proves no provider is invoked); sw->fr still fails closed via the real provider path', async () => {
        const { page } = await openPage();
        await page.goto(serverURL('/admin-workspace.html'), { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(500);

        const kiswahiliText = 'Habari za mchana.';

        const outcome = await page.evaluate(async (text) => {
          const adapter = window.CozyOS && window.CozyOS.SpeechTranslationAdapter;
          const providers = window.CozyOS && window.CozyOS.SpeechTranslationProviders;
          if (!adapter || !providers) return { reachable: false };

          // Remove every real registered provider so any sw->sw success
          // can ONLY be the passthrough — a provider call would be
          // structurally impossible here.
          const removed = providers.list().map(p => p.name);
          removed.forEach((name) => providers.unregister(name));
          const providersAfterRemoval = providers.list().length;

          const swToSw = await adapter.previewTranslation(text, { sourceLanguage: 'sw', targetLanguage: 'sw' });
          const swToFr = await adapter.previewTranslation(text, { sourceLanguage: 'sw', targetLanguage: 'fr' });

          return { reachable: true, removed, providersAfterRemoval, swToSw, swToFr };
        }, kiswahiliText);

        if (!outcome.reachable) throw new Error('SpeechTranslationAdapter/SpeechTranslationProviders not reachable on the real page');

        console.log(`      providers removed before test: ${JSON.stringify(outcome.removed)}`);
        console.log(`      sw->sw with zero providers: ${JSON.stringify(outcome.swToSw)}`);
        console.log(`      sw->fr with zero providers: ${JSON.stringify(outcome.swToFr)}`);

        if (outcome.providersAfterRemoval !== 0) throw new Error('failed to remove all providers before the test');
        if (outcome.swToSw.isReal !== true || outcome.swToSw.translatedText !== kiswahiliText || outcome.swToSw.providerName !== 'passthrough-same-language') {
          throw new Error(`sw->sw must succeed with no provider dependency at all, got ${JSON.stringify(outcome.swToSw)}`);
        }
        if (outcome.swToFr.isReal !== false || !/No translation provider registered/.test(outcome.swToFr.reason || '')) {
          throw new Error(`sw->fr with zero providers must fail closed via the real provider path (unchanged behavior), got ${JSON.stringify(outcome.swToFr)}`);
        }

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
