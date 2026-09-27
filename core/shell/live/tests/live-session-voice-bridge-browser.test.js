'use strict';

/**
 * core/shell/live/tests/live-session-voice-bridge-browser.test.js
 *
 * REAL LIVE WINDOW END-TO-END for the Live Session voice bridge
 * (Universal CozyOS Voice — Application Integration Matrix, Live
 * Session row). Same real-browser discipline as this repository's
 * other Live Window suites: a real page load, a real
 * LDCESessionEngine.createSession()/startSession()/pauseSession()/
 * resumeSession() call chain, and a real VoiceManager.speakProgressive()
 * dispatch observed via instrumentation of the actual method (never a
 * mock of VoiceManager itself).
 *
 * Run with: node --test core/shell/live/tests/live-session-voice-bridge-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', '..', 'dashboard.html');

async function openDashboard() {
    const browser = await chromium.launch(resolveLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!(window.CozyOS && window.CozyOS.LDCESessionEngine && window.CozyOS.LivingAssistant && window.CozyOS.LiveSessionVoiceBridge), { timeout: 15000 });
    return { browser, page };
}

async function instrumentVoice(page) {
    await page.evaluate(() => {
        window.__voiceSpeakCalls = [];
        const vm = window.CozyOS.VoiceManager;
        if (!vm.__patchedForLiveSessionBridgeTest) {
            vm.__patchedForLiveSessionBridgeTest = true;
            const originalSpeakProgressive = vm.speakProgressive.bind(vm);
            vm.speakProgressive = (req) => { window.__voiceSpeakCalls.push(req); return originalSpeakProgressive(req); };
        }
    });
}

test('LIVE WINDOW E2E: a real LDCESessionEngine.createSession()+startSession() reaches VoiceManager with "Session started." via the shared voice chain', async () => {
    const { browser, page } = await openDashboard();
    try {
        await instrumentVoice(page);

        const outcome = await page.evaluate(() => {
            const ldce = window.CozyOS.LDCESessionEngine;
            const created = ldce.createSession('bridge-test-host-1', { type: 'meeting', title: 'Bridge Test' });
            if (!created.success) return { step: 'create', created };
            const started = ldce.startSession(created.sessionId, 'bridge-test-host-1');
            return { step: 'started', created, started };
        });

        assert.equal(outcome.created.success, true, 'createSession() must really succeed for this test to prove anything: ' + JSON.stringify(outcome));
        assert.equal(outcome.started.success, true, 'startSession() must really succeed: ' + JSON.stringify(outcome));

        await page.waitForTimeout(300);
        const calls = await page.evaluate(() => window.__voiceSpeakCalls);
        assert.ok(calls.length >= 1, 'the real session-started event must reach VoiceManager.speakProgressive()');
        assert.ok(calls.some((c) => c.text === 'Session started.'), 'the exact real #logToTranscript() wording must be spoken, not an invented paraphrase: ' + JSON.stringify(calls));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: pause/resume on the same real session speak "Session paused."/"Session resumed." in order', async () => {
    const { browser, page } = await openDashboard();
    try {
        await instrumentVoice(page);

        await page.evaluate(() => {
            const ldce = window.CozyOS.LDCESessionEngine;
            const created = ldce.createSession('bridge-test-host-2', { type: 'meeting' });
            ldce.startSession(created.sessionId, 'bridge-test-host-2');
            window.__bridgeTestSessionId = created.sessionId;
        });
        await page.waitForTimeout(200);
        await page.evaluate(() => { window.__voiceSpeakCalls = []; }); // discard the "Session started." from setup, isolate this test's own assertion

        await page.evaluate(() => {
            const ldce = window.CozyOS.LDCESessionEngine;
            ldce.pauseSession(window.__bridgeTestSessionId, 'bridge-test-host-2');
            ldce.resumeSession(window.__bridgeTestSessionId, 'bridge-test-host-2');
        });
        await page.waitForTimeout(300);

        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.deepEqual(calls, ['Session paused.', 'Session resumed.']);
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: the visible chat thread is untouched by announceStatus() — this is an accessibility announcement, not a conversation turn', async () => {
    const { browser, page } = await openDashboard();
    try {
        // The panel only attaches to the document the first time open() runs
        // (M366.7 lazy-create — see mount()'s own comment), so the window
        // must genuinely be open for this assertion to mean anything.
        await page.evaluate(() => window.CozyOS.LivingAssistant.open());
        await page.waitForSelector('#cozy-living-assistant-messages', { timeout: 15000 });
        const messageCountBefore = await page.evaluate(() => {
            const el = document.getElementById('cozy-living-assistant-messages');
            return el ? el.children.length : -1;
        });

        await page.evaluate(() => {
            const ldce = window.CozyOS.LDCESessionEngine;
            const created = ldce.createSession('bridge-test-host-3', { type: 'meeting' });
            ldce.startSession(created.sessionId, 'bridge-test-host-3');
        });
        await page.waitForTimeout(300);

        const messageCountAfter = await page.evaluate(() => {
            const el = document.getElementById('cozy-living-assistant-messages');
            return el ? el.children.length : -1;
        });

        assert.equal(messageCountAfter, messageCountBefore, 'a real session-started event must never add a visible chat bubble');
    } finally {
        await browser.close();
    }
});
