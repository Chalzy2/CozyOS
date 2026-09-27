'use strict';

/**
 * core/engines/video/tests/live-camera-capture-voice-bridge-browser.test.js
 *
 * REAL LIVE WINDOW END-TO-END for the Live Camera Capture voice bridge
 * (Universal CozyOS Voice — Application Integration Matrix, Live Camera
 * Capture row). Proves, on the real dashboard.html: (1) LiveVideoCapture
 * is now actually loaded there (it was not, before this phase — see
 * VOICE-APPLICATION-INTEGRATION-AUDIT.md §5.1), and (2) a real capture
 * action (startPreview() against a real, fake-but-genuine
 * getUserMedia() video track — Chromium's own
 * --use-fake-device-for-media-stream, not a CozyOS mock) fires the
 * engine's real event, and VoiceManager really receives it via the
 * shared voice authority the Live Session bridge also uses.
 *
 * Run with: node --test core/engines/video/tests/live-camera-capture-voice-bridge-browser.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { resolveLaunchOptions } = require('../../../../server/webauthn-rp/test/browser-launch');

const DASHBOARD_HTML = 'file://' + path.resolve(__dirname, '..', '..', '..', '..', 'dashboard.html');

async function openDashboardWithFakeCamera() {
    const baseOpts = resolveLaunchOptions({ headless: true });
    baseOpts.args = [...(baseOpts.args || []), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
    const browser = await chromium.launch(baseOpts);
    const context = await browser.newContext();
    await context.grantPermissions(['camera', 'microphone']);
    const page = await context.newPage();
    await page.goto(DASHBOARD_HTML, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!(window.CozyOS && window.CozyOS.LiveVideoCapture && window.CozyOS.LivingAssistant && window.CozyOS.LiveCameraCaptureVoiceBridge), { timeout: 15000 });
    return { browser, page };
}

async function instrumentVoice(page) {
    await page.evaluate(() => {
        window.__voiceSpeakCalls = [];
        const vm = window.CozyOS.VoiceManager;
        if (!vm.__patchedForCameraBridgeTest) {
            vm.__patchedForCameraBridgeTest = true;
            const originalSpeakProgressive = vm.speakProgressive.bind(vm);
            vm.speakProgressive = (req) => { window.__voiceSpeakCalls.push(req); return originalSpeakProgressive(req); };
        }
    });
}

test('LIVE WINDOW E2E: LiveVideoCapture is really script-loaded on dashboard.html (the real gap this phase closed)', async () => {
    const { browser, page } = await openDashboardWithFakeCamera();
    try {
        const hasRealEngine = await page.evaluate(() => {
            const engine = window.CozyOS.LiveVideoCapture;
            return !!engine && typeof engine.on === 'function' && typeof engine.startPreview === 'function';
        });
        assert.equal(hasRealEngine, true, 'window.CozyOS.LiveVideoCapture must be the real engine instance, not merely the App facade');
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: a real startPreview() against a real (fake-device) camera stream speaks "Camera preview started." via the shared voice chain', async () => {
    const { browser, page } = await openDashboardWithFakeCamera();
    try {
        await instrumentVoice(page);

        const result = await page.evaluate(async () => {
            const engine = window.CozyOS.LiveVideoCapture;
            const video = document.createElement('video');
            video.muted = true;
            document.body.appendChild(video);
            return engine.startPreview(video, {});
        });

        assert.equal(result.success, true, 'startPreview() must really succeed against the fake-device camera stream: ' + JSON.stringify(result));

        await page.waitForTimeout(300);
        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.ok(calls.includes('Camera preview started.'), 'the real previewStarted event must reach VoiceManager: ' + JSON.stringify(calls));
    } finally {
        await browser.close();
    }
});

test('LIVE WINDOW E2E: stopPreview() after a real start speaks "Camera preview stopped."', async () => {
    const { browser, page } = await openDashboardWithFakeCamera();
    try {
        await instrumentVoice(page);

        await page.evaluate(async () => {
            const engine = window.CozyOS.LiveVideoCapture;
            const video = document.createElement('video');
            video.muted = true;
            document.body.appendChild(video);
            await engine.startPreview(video, {});
        });
        await page.waitForTimeout(200);
        await page.evaluate(() => { window.__voiceSpeakCalls = []; }); // isolate this assertion from the setup's own "started" announcement

        const stopResult = await page.evaluate(() => window.CozyOS.LiveVideoCapture.stopPreview());
        assert.equal(stopResult.success, true, 'stopPreview() must really succeed: ' + JSON.stringify(stopResult));

        await page.waitForTimeout(300);
        const calls = await page.evaluate(() => window.__voiceSpeakCalls.map((c) => c.text));
        assert.deepEqual(calls, ['Camera preview stopped.']);
    } finally {
        await browser.close();
    }
});
