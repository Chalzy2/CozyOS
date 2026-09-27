'use strict';

/**
 * core/living/tests/cozy-living-assistant-kiswahili-first-asr-default.test.js
 *
 * Universal CozyOS Voice — Phase 3 (Kiswahili-first ASR default)
 * regression coverage. REAL LIVE WINDOW END-TO-END (same discipline as
 * this repository's other real-browser Live Window suites — see
 * cozy-living-assistant-live-window-e2e.test.js's own header for why a
 * unit test alone is not sufficient proof).
 *
 * Root cause this guards against: SpeechRecognitionAdapter.start()'s
 * own, generic, honestly-disclosed default is "en-US" when no
 * languageCode is supplied at all (correct and unchanged — this file
 * never edits that adapter). #wireVoiceInput()'s mic-click handler
 * previously supplied a languageCode ONLY once a real conversational
 * turn had already resolved #currentLanguage — so the very FIRST mic
 * utterance of a session, before any typed/spoken turn had happened
 * yet, always fell through to that generic "en-US" default even for a
 * user whose real, already-persisted language preference
 * (IdentityEngine.getLanguagePreference(), Milestone 212 — the SAME
 * store the login language selector itself writes) was Kiswahili.
 * Fixed by consulting that real, existing preference before falling
 * through to the generic default — never a new settings store, never a
 * Kiswahili-specific special case (any registered language preference
 * benefits identically).
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-kiswahili-first-asr-default.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

/**
 * openLiveWindowWithFakeReadyMic()
 *   LivingAssistant mounts ONCE, at page-load script-execution time
 *   (its own header: "Mounts once ... never recreated on navigation"),
 *   and #wireVoiceInput() (called from its constructor) permanently
 *   disables the mic button the very first time it observes
 *   SpeechRecognitionAdapter.isReal()===false — which is genuinely true
 *   in this sandbox (no real SpeechRecognition constructor; same
 *   disclosed environment limitation every other browser voice test in
 *   this repo already discloses). So that ONE fake must be applied
 *   before mount time, via Playwright's addInitScript() (runs before
 *   ANY of the page's own scripts). #resolveActorId()/
 *   getLanguagePreference() are read later, at real MIC-CLICK time
 *   (inside the click handler itself), so Session/IdentityEngine can be
 *   set normally, after page load, in each test below — exactly the
 *   same timing this repo's other browser tests already use for those
 *   two (e.g. cozy-living-assistant-teach-cozy.test.js).
 */
async function openLiveWindowWithFakeReadyMic() {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.addInitScript(`(() => {
        window.__asrStartCalls = [];
        window.CozyOS = window.CozyOS || {};
        Object.defineProperty(window.CozyOS, 'SpeechRecognitionAdapter', {
            configurable: true,
            enumerable: true,
            get() { return this.__realAsr || null; },
            set(real) {
                // Patch the REAL, unmodified adapter instance the instant
                // speech-recognition-adapter.js registers it — isReal()
                // faked true only so this sandbox's own real
                // #wireVoiceInput() gate reaches its real click-handler
                // logic; start() itself is intercepted only to observe
                // the exact arguments that real, unmodified logic passes,
                // never to fake recognition succeeding.
                try { real.isReal = () => true; } catch (_e) {}
                try {
                    const originalStart = real.start.bind(real);
                    real.start = (config) => { window.__asrStartCalls.push(config); return { success: false, reason: 'test double — not really starting recognition' }; };
                } catch (_e) {}
                this.__realAsr = real;
            },
        });
    })();`);
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-mic', { timeout: 15000 });
    return { browser, page };
}

test('LIVE WINDOW E2E: a signed-in user with a persisted Kiswahili preference gets languageCode "sw" on their very FIRST mic click, before any conversational turn has happened', async () => {
    const { browser, page } = await openLiveWindowWithFakeReadyMic();
    try {
        // Real, fresh session — no prior conversational turn, so the
        // pre-existing #currentLanguage state is still null. Fakes only
        // Session/IdentityEngine's OWN real, documented public shape
        // (same pattern this repo's other browser tests already use),
        // not SpeechRecognitionAdapter or the mic-wiring logic under
        // test — read at real click time, so applying it after page
        // load (unlike the mount-time ASR fake above) is honest and
        // sufficient.
        await page.evaluate(() => {
            window.CozyOS.Session = { current: () => ({ uid: 'kiswahili-first-asr-test-user' }) };
            window.CozyOS.IdentityEngine = {
                getLanguagePreference: (userId) => (userId === 'kiswahili-first-asr-test-user' ? 'sw' : null),
            };
        });
        // A programmatic dispatch on the real button element (not a
        // synthetic Playwright pointer click) — this test targets the
        // real, unmodified click-handler LOGIC #wireVoiceInput() wires,
        // not pixel-level pointer routing through an unrelated overlay
        // this repo's own launch-screen shows on some real page loads.
        await page.evaluate(() => document.querySelector('#cozy-living-assistant-mic').click());
        const calls = await page.evaluate(() => window.__asrStartCalls);
        assert.equal(calls.length, 1, 'exactly one real start() call for one real mic click');
        assert.equal(calls[0].languageCode, 'sw', 'the very first mic utterance must use the real, persisted Kiswahili preference instead of silently defaulting to English');
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: an anonymous/preference-less session degrades honestly to the exact prior behavior (no languageCode supplied, adapter\'s own default applies)', async () => {
    // No Session, no IdentityEngine preference — genuinely anonymous,
    // matching this repo's own existing "never defaults to a guessed
    // identity" discipline.
    const { browser, page } = await openLiveWindowWithFakeReadyMic();
    try {
        await page.evaluate(() => document.querySelector('#cozy-living-assistant-mic').click());
        const calls = await page.evaluate(() => window.__asrStartCalls);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].languageCode, undefined, 'with no real per-turn language and no real persisted preference, languageCode must remain omitted — SpeechRecognitionAdapter\'s own existing default applies exactly as before this pass, never a fabricated language');
    } finally {
        await browser.close();
    }
});
