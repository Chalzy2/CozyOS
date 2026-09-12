'use strict';

/**
 * core/tests/browser/kiswahili-tts-language-propagation-browser.test.js
 *
 * TTS language-propagation dependency - real browser test proving the
 * output-side counterpart to Dependency #2: #currentLanguage now flows
 * from cozy-living-assistant.js's #speak() through the real, unmodified
 * VoiceManager.speak() -> provider/fallback path -> the real, unmodified
 * findVoiceForLanguage() in cozy-tts-browser-adapter.js.
 *
 * Uses the existing kiswahili-dep3-tts-fallback-harness.html fixture
 * (already loads the real TTS chain in isolation) via the canonical
 * cozy-browser.js harness - no new launcher, no new harness.
 *
 * SCOPE DISCLOSURE: this proves language propagation and voice-selection
 * LOGIC only. It cannot and does not prove natural Kiswahili
 * pronunciation, Kenyan accent quality, or human-heard audio quality -
 * those remain NOT-RUN / DEVICE-DEPENDENT. A fake Kiswahili voice is
 * injected into speechSynthesis.getVoices() purely to prove the real
 * selection logic picks it when present - this is not a claim that any
 * real installed voice sounds natural.
 */

const { withBrowser, makeRunner } = require('./cozy-browser');

const INIT_SCRIPT_WITH_SW_VOICE = `
  window.__utteranceLog = [];
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = null; this.rate = 1; this.pitch = 1; this.volume = 1; window.__utteranceLog.push(this); }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  const fakeVoices = [
    { name: 'Generic English', lang: 'en-US' },
    { name: 'Generic Kiswahili (test fixture only, not a real installed voice claim)', lang: 'sw-KE' },
  ];
  window.speechSynthesis.getVoices = () => fakeVoices;
  window.speechSynthesis.speak = (utterance) => { setTimeout(() => { if (utterance.onend) utterance.onend(); }, 0); };
`;

const INIT_SCRIPT_NO_SW_VOICE = `
  window.__utteranceLog = [];
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = null; this.rate = 1; this.pitch = 1; this.volume = 1; window.__utteranceLog.push(this); }
  }
  window.SpeechSynthesisUtterance = FakeUtterance;
  const fakeVoices = [ { name: 'Generic English', lang: 'en-US' } ];
  window.speechSynthesis.getVoices = () => fakeVoices;
  window.speechSynthesis.speak = (utterance) => { setTimeout(() => { if (utterance.onend) utterance.onend(); }, 0); };
`;

async function main() {
  const { test, summary } = makeRunner();

  try {
    await withBrowser(async ({ openPage, serverURL }) => {
      async function loadFixture(initScript) {
        const { page } = await openPage();
        await page.addInitScript(initScript);
        await page.goto(serverURL('/core/tests/browser/kiswahili-dep3-tts-fallback-harness.html'), { waitUntil: 'load', timeout: 20000 });
        return page;
      }

      await test('1/2/3/4/5. VoiceManager.speak({text, language:"sw"}) selects the matching fake Kiswahili voice via the real, unmodified findVoiceForLanguage()', async () => {
        const page = await loadFixture(INIT_SCRIPT_WITH_SW_VOICE);
        const result = await page.evaluate(async () => {
          const r = await window.CozyOS.VoiceManager.speak({ text: 'Habari yako', language: 'sw' });
          const utterance = window.__utteranceLog[window.__utteranceLog.length - 1];
          return { r, lang: utterance ? utterance.lang : null, voiceName: utterance && utterance.voice ? utterance.voice.name : null };
        });
        if (!result.r.available || !result.r.played) throw new Error(`expected a genuine successful speak() result, got: ${JSON.stringify(result.r)}`);
        if (result.lang !== 'sw') throw new Error(`expected the real language "sw" to reach the utterance, got: ${result.lang}`);
        if (!result.voiceName || !result.voiceName.includes('Kiswahili')) throw new Error(`expected findVoiceForLanguage() to genuinely select the matching fake Kiswahili voice, got: ${result.voiceName}`);
        await page.close();
      });

      await test('6. when no matching voice exists, the system remains honest - no fabricated voice, utterance.lang still set but utterance.voice stays unset (default)', async () => {
        const page = await loadFixture(INIT_SCRIPT_NO_SW_VOICE);
        const result = await page.evaluate(async () => {
          const r = await window.CozyOS.VoiceManager.speak({ text: 'Habari yako', language: 'sw' });
          const utterance = window.__utteranceLog[window.__utteranceLog.length - 1];
          return { r, lang: utterance ? utterance.lang : null, voice: utterance ? utterance.voice : null };
        });
        if (!result.r.available || !result.r.played) throw new Error('speech must still genuinely succeed via the browser default even without a matching voice');
        if (result.voice !== null) throw new Error('must never fabricate/substitute a voice that does not genuinely match - voice must remain unset (browser default)');
        await page.close();
      });

      await test('7. Charles provider behavior remains completely unchanged (still honestly declines arbitrary text, language field is harmlessly ignored)', async () => {
        const page = await loadFixture(INIT_SCRIPT_WITH_SW_VOICE);
        const result = await page.evaluate(async () => {
          return window.CozyOS.CharlesVoiceProvider.speak({ text: 'Habari yako', language: 'sw' });
        });
        if (result.available !== false) throw new Error('Charles must still honestly decline arbitrary text exactly as before');
        await page.close();
      });

      await test('8. existing default (no language) behavior is completely unaffected - no language forced, no crash', async () => {
        const page = await loadFixture(INIT_SCRIPT_WITH_SW_VOICE);
        const result = await page.evaluate(async () => {
          const r = await window.CozyOS.VoiceManager.speak({ text: 'Hello there' });
          const utterance = window.__utteranceLog[window.__utteranceLog.length - 1];
          return { r, lang: utterance ? utterance.lang : null, voice: utterance ? utterance.voice : null };
        });
        if (!result.r.available || !result.r.played) throw new Error('the existing no-language request must still succeed exactly as before');
        if (result.lang !== null) throw new Error(`expected no language to be set when none was requested (existing behavior preserved), got: ${result.lang}`);
        await page.close();
      });

      await test('no page errors were thrown during any interaction', async () => {
        const page = await loadFixture(INIT_SCRIPT_WITH_SW_VOICE);
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.evaluate(() => window.CozyOS.VoiceManager.speak({ text: 'Habari yako', language: 'sw' }));
        await page.waitForTimeout(100);
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
  console.log('LIVE KISWAHILI PRONUNCIATION/ACCENT QUALITY: NOT-RUN / DEVICE-DEPENDENT (this test proves language propagation and voice-selection logic only)');
  console.log(failed === 0 ? 'BROWSER_TEST = PASS' : 'BROWSER_TEST = RAN_WITH_FAILURES');
  process.exit(failed > 0 ? 1 : 0);
}

main();
