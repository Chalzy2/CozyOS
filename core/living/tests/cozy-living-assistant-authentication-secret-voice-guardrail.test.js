'use strict';

/**
 * core/living/tests/cozy-living-assistant-authentication-secret-voice-guardrail.test.js
 *
 * Universal CozyOS Voice — Application Integration Matrix, Authenticator
 * row. REAL LIVE WINDOW END-TO-END (same discipline as this repository's
 * other real-browser Live Window suites).
 *
 * This is a structural SAFETY NET, not a regression test for an active
 * bug: the companion audit (VOICE-APPLICATION-INTEGRATION-AUDIT.md §3)
 * traced every real path to voice today and found none of them ever
 * produces a live OTP code or recovery code as reply text — Authenticator
 * renders its live TOTP code to DOM text only, never through
 * cozy-living-assistant.js. Because the shared voice chain has zero
 * content-based filtering otherwise, this test PROVES the new guardrail
 * (#looksLikeAuthenticationSecret(), checked in #speak() before any real
 * VoiceManager dispatch) actually stops such text from reaching voice,
 * by fabricating exactly the two disclosed secret shapes as if a future
 * intent handler had wired one to reply text — CozyAnswerEngine.answer()
 * is patched to simulate that VERIFIED reply; nothing about the real
 * CozyAI reasoning/answer construction path is touched.
 *
 * The visible TEXT reply is asserted UNCHANGED — this guardrail blocks
 * only speech, never information the user can see (Accessibility
 * requirement: voice is a presentation layer, disabling it never hides
 * anything from the user themselves).
 *
 * Run with: node --test core/living/tests/cozy-living-assistant-authentication-secret-voice-guardrail.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', 'dashboard.html');

async function openLiveWindow() {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#cozy-living-assistant-btn', { timeout: 15000 });
    await page.evaluate(() => window.CozyOS.LivingAssistant.open());
    await page.waitForSelector('#cozy-living-assistant-input', { timeout: 15000 });
    return { browser, page };
}

async function askWithFabricatedVerifiedReply(page, question, fabricatedAnswerText) {
    await page.evaluate((answerText) => {
        window.__voiceSpeakCalls = window.__voiceSpeakCalls || [];
        const vm = window.CozyOS.VoiceManager;
        if (!vm.__patchedForGuardrailTest) {
            vm.__patchedForGuardrailTest = true;
            // Only speakProgressive() is wrapped — it is the actual real
            // entry point #speak() calls (see cozy-living-assistant.js's
            // own #speak()). speakProgressive() itself calls this.speak()
            // internally once per segment, so also wrapping speak() here
            // would double-count the same real dispatch at two levels of
            // one call chain, not two independent dispatches.
            const originalSpeakProgressive = vm.speakProgressive.bind(vm);
            vm.speakProgressive = (req) => { window.__voiceSpeakCalls.push(req); return originalSpeakProgressive(req); };
        }
        // CozyAnswerEngine is Object.freeze()'d (as is
        // CozyIdentityFAQRouter), so a property assignment on the real
        // object (engine.answer = ...) silently no-ops. #send() re-reads
        // `window.CozyOS.CozyAnswerEngine` fresh on every call
        // (cozy-living-assistant.js:800), so replacing the BINDING on
        // window.CozyOS — a plain, unfrozen object — is the honest way
        // to substitute a fabricated VERIFIED result for this test,
        // without needing to mutate the frozen singleton itself.
        window.CozyOS.CozyAnswerEngine = {
            answer: async () => ({ evidenceState: 'VERIFIED', answer: answerText, intent: 'TEST_FABRICATED', sources: [] }),
            getVersion: () => 'test-fabricated',
        };
    }, fabricatedAnswerText);

    const input = page.locator('#cozy-living-assistant-input');
    await input.fill(question);
    await input.press('Enter');
    await page.waitForTimeout(900);
    const messages = await page.$$eval('#cozy-living-assistant-messages > *', (els) => els.map((e) => e.textContent.trim()));
    const displayedReply = messages[messages.length - 1];
    const speakCalls = await page.evaluate(() => window.__voiceSpeakCalls);
    return { displayedReply, speakCalls };
}

test('LIVE WINDOW E2E: a TOTP-code-shaped reply ("verification code 123 456") is displayed as text but never reaches VoiceManager', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const { displayedReply, speakCalls } = await askWithFabricatedVerifiedReply(
            page,
            'What is CozyOS for',
            'Your verification code is 123 456. It expires in 30 seconds.'
        );
        assert.equal(displayedReply, 'Your verification code is 123 456. It expires in 30 seconds.', 'the visible text reply must be completely unaffected — this guardrail blocks only speech, never information the user can see');
        assert.equal(speakCalls.length, 0, 'a TOTP-code-shaped reply alongside an authentication keyword must never reach VoiceManager.speak()/speakProgressive()');
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: a recovery-code-shaped reply ("ABCD2-EFGH3-JKLMNP") is displayed as text but never reaches VoiceManager', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const { displayedReply, speakCalls } = await askWithFabricatedVerifiedReply(
            page,
            'What is CozyOS for',
            'One of your recovery codes is ABCD2-EFGH3-JKLMNP.'
        );
        assert.equal(displayedReply, 'One of your recovery codes is ABCD2-EFGH3-JKLMNP.');
        assert.equal(speakCalls.length, 0, 'the exact recovery-code shape must never reach voice, with or without a nearby keyword');
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: an ordinary reply that happens to contain a 6-digit number with no authentication keyword still reaches voice (no over-blocking)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const { displayedReply, speakCalls } = await askWithFabricatedVerifiedReply(
            page,
            'What is CozyOS for',
            'The town has about 123 456 residents according to the last count.'
        );
        assert.equal(displayedReply, 'The town has about 123 456 residents according to the last count.');
        assert.equal(speakCalls.length, 1, 'a bare 6-digit number with no authentication context must NOT be blocked — the guardrail is deliberately narrow, never a general "looks like a number" filter');
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: an ordinary reply with an authentication keyword but no real code-shaped digits still reaches voice (keyword alone is not enough)', async () => {
    const { browser, page } = await openLiveWindow();
    try {
        const { displayedReply, speakCalls } = await askWithFabricatedVerifiedReply(
            page,
            'What is CozyOS for',
            'Verification code entry is one of the steps CozyOS can require during sign-in.'
        );
        assert.equal(displayedReply, 'Verification code entry is one of the steps CozyOS can require during sign-in.');
        assert.equal(speakCalls.length, 1, 'mentioning "verification code" in general, explanatory text (no actual digits) must reach voice normally');
    } finally {
        await browser.close();
    }
});
