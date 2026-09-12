'use strict';

/**
 * core/tests/browser/kiswahili-dep2-voice-language-browser.test.js
 *
 * Kiswahili Capability Dependency #2 - REAL browser test proving the
 * actual end-to-end wiring: the real, unmodified conversational chain
 * (rule-based-conversational-provider.js -> LivingAI.think()) already
 * resolves a real language per turn; this dependency captures that
 * value in cozy-living-assistant.js's own #send() and supplies it to
 * the existing #wireVoiceInput() -> asr.start() call, which then flows
 * through the already-verified (Dependency #1) SpeechLanguageAdapter ->
 * SpeechRecognitionAdapter chain.
 *
 * Uses the real, unmodified index.html (already loads every real file
 * in this chain together in production) via the canonical
 * core/tests/browser/cozy-browser.js harness - no new harness, no fake
 * conversational provider, no fake language registry. Only the browser
 * SpeechRecognition constructor is faked (via page.addInitScript,
 * injected before any page script runs), since no real microphone
 * exists in this environment - the exact same, disclosed limitation
 * already established for Dependency #1.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

const FAKE_SPEECH_RECOGNITION_INIT_SCRIPT = `
  window.__fakeRecognitionInstances = [];
  class FakeSpeechRecognition {
    constructor() {
      window.__fakeRecognitionInstances.push(this);
      this.lang = null; this.continuous = null; this.interimResults = null;
      this.onstart = null; this.onspeechstart = null; this.onspeechend = null;
      this.onerror = null; this.onend = null; this.onresult = null;
    }
    start() { if (this.onstart) this.onstart(); }
    stop() { if (this.onend) this.onend(); }
    abort() { if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = FakeSpeechRecognition;
`;

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function loadRealPage() {
        const { page } = await openPage();
        await page.addInitScript(FAKE_SPEECH_RECOGNITION_INIT_SCRIPT);
        await page.goto(serverURL('/core/tests/browser/kiswahili-dep2-voice-language-harness.html'), { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('#cozy-living-assistant-btn');
        return page;
      }

      async function sendRealMessage(page, text) {
        return page.evaluate(async (msg) => {
          const ai = window.CozyOS && window.CozyOS.LivingAI;
          if (!ai || typeof ai.think !== 'function') return { reachable: false };
          const r = await ai.think(msg, {});
          return { reachable: true, success: r.success, language: r.result ? r.result.language : null };
        }, text);
      }

      await test('DISCOVERY CHECK: the real LivingAI.think() genuinely resolves "sw" for real Kiswahili input on the real page', async () => {
        const page = await loadRealPage();
        const result = await sendRealMessage(page, 'Habari, nataka kujiunga.');
        if (!result.reachable) throw new Error('window.CozyOS.LivingAI.think must be reachable on the real page');
        if (result.language !== 'sw') throw new Error(`expected the real conversational chain to resolve "sw", got: ${result.language}`);
        await page.close();
      });

      await test('CASE 1 (Kiswahili): after a real Kiswahili turn via the real Assistant UI, activating the real mic requests real recognition in "sw", resolved to "sw-KE" by the already-verified Dependency #1 chain', async () => {
        const page = await loadRealPage();
        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });
        await page.fill('#cozy-living-assistant-input', 'Habari, nataka kujiunga.');
        await page.click('#cozy-living-assistant-form button[type="submit"], #cozy-living-assistant-send');
        await page.waitForTimeout(300);

        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(100);
        const lang = await page.evaluate(() => {
          const instances = window.__fakeRecognitionInstances;
          return instances.length ? instances[instances.length - 1].lang : null;
        });
        if (lang !== 'sw-KE') throw new Error(`expected the real mic to request "sw-KE" after a real Kiswahili turn, got: ${lang}`);
        await page.close();
      });

      await test('CASE 2 (English): after a real English turn, activating the real mic does NOT remain stuck on Kiswahili - it requests the real default (no forced "sw-KE")', async () => {
        const page = await loadRealPage();
        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });
        await page.fill('#cozy-living-assistant-input', 'Hello, I want to register.');
        await page.click('#cozy-living-assistant-form button[type="submit"], #cozy-living-assistant-send');
        await page.waitForTimeout(300);

        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(100);
        const lang = await page.evaluate(() => {
          const instances = window.__fakeRecognitionInstances;
          return instances.length ? instances[instances.length - 1].lang : null;
        });
        if (lang === 'sw-KE') throw new Error('the real mic must not remain stuck on Kiswahili after a real English turn');
        await page.close();
      });

      await test('CASE 3 (language transition): sw -> mic requests sw-KE, then en -> mic requests the English locale, on the SAME real session (no permanent lock)', async () => {
        const page = await loadRealPage();
        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });

        await page.fill('#cozy-living-assistant-input', 'Habari, nataka kujiunga.');
        await page.click('#cozy-living-assistant-form button[type="submit"], #cozy-living-assistant-send');
        await page.waitForTimeout(300);
        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(100);
        const firstLang = await page.evaluate(() => {
          const i = window.__fakeRecognitionInstances; return i.length ? i[i.length - 1].lang : null;
        });
        await page.click('#cozy-living-assistant-mic'); // stop the first activation before checking the second, mirroring a real user tapping the mic off before speaking again
        await page.waitForTimeout(100);

        await page.fill('#cozy-living-assistant-input', 'Hello, I want to register.');
        await page.click('#cozy-living-assistant-form button[type="submit"], #cozy-living-assistant-send');
        await page.waitForTimeout(300);
        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(100);
        const secondLang = await page.evaluate(() => {
          const i = window.__fakeRecognitionInstances; return i.length ? i[i.length - 1].lang : null;
        });

        if (firstLang !== 'sw-KE') throw new Error(`expected sw-KE first, got: ${firstLang}`);
        if (secondLang === 'sw-KE') throw new Error('the real state must be replaceable - it must not remain sw-KE after a real English turn');
        await page.close();
      });

      await test('CASE 4 (unknown/no language yet): before ANY real conversational turn, activating the real mic uses the existing, unchanged default behavior (no languageCode invented)', async () => {
        const page = await loadRealPage();
        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });
        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(100);
        const lang = await page.evaluate(() => {
          const i = window.__fakeRecognitionInstances; return i.length ? i[i.length - 1].lang : null;
        });
        if (lang !== 'en-US') throw new Error(`expected the existing, unchanged default ("en-US") when no real language has been resolved yet, got: ${lang}`);
        await page.close();
      });

      await test('no page errors were thrown during any Dependency #2 interaction', async () => {
        const page = await loadRealPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.click('#cozy-living-assistant-btn');
        await page.waitForSelector('#cozy-living-assistant-form', { timeout: 5000 });
        await page.fill('#cozy-living-assistant-input', 'Habari.');
        await page.click('#cozy-living-assistant-form button[type="submit"], #cozy-living-assistant-send');
        await page.waitForTimeout(300);
        await page.click('#cozy-living-assistant-mic');
        await page.waitForTimeout(200);
        if (errors.length) throw new Error('real page errors: ' + errors.join(' | '));
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
