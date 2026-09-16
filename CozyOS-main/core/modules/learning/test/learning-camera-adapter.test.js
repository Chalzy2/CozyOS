/**
 * core/modules/learning/test/learning-camera-adapter.test.js
 * Run with: node --test core/modules/learning/test/learning-camera-adapter.test.js
 *
 * IMPORTANT: every getUserMedia/canvas/video primitive below is a
 * Node-side mock of a browser hardware API. These tests prove the
 * adapter's own logic (permission handling, state machine, honest
 * failure reporting, registration) is correct against controlled
 * inputs — they are NOT a substitute for real browser-runtime
 * verification, which requires an actual browser and actual camera
 * hardware neither this sandbox nor CI has. This distinction is
 * intentional and is not to be described as "browser-verified."
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ADAPTER_PATH = path.join(__dirname, '..', 'learning-camera-adapter.js');

function makeFakeCanvas() {
    return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: () => 'data:image/png;base64,FAKE',
    };
}

function freshWindow({ withCameraRegistry = true, withGetUserMedia = 'success' } = {}) {
    delete require.cache[require.resolve(ADAPTER_PATH)];

    global.window = { CozyOS: {} };
    global.document = { createElement: (tag) => (tag === 'canvas' ? makeFakeCanvas() : {}) };

    const fakeTracks = [{ stopped: false, stop() { this.stopped = true; } }];
    const fakeStream = { getVideoTracks: () => fakeTracks, getTracks: () => fakeTracks };

    function setNavigator(value) {
        Object.defineProperty(global, 'navigator', { value, configurable: true, writable: true });
    }

    if (withGetUserMedia === 'success') {
        setNavigator({ mediaDevices: { getUserMedia: async () => fakeStream } });
    } else if (withGetUserMedia === 'denied') {
        setNavigator({ mediaDevices: { getUserMedia: async () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; } } });
    } else if (withGetUserMedia === 'unavailable-hardware') {
        setNavigator({ mediaDevices: { getUserMedia: async () => { const e = new Error('Requested device not found'); e.name = 'NotFoundError'; throw e; } } });
    } else if (withGetUserMedia === 'no-mediaDevices') {
        setNavigator({});
    } else if (withGetUserMedia === 'no-navigator') {
        setNavigator(undefined);
    }

    const registerCalls = [];
    if (withCameraRegistry) {
        const registeredIds = new Set();
        global.window.CozyOS.Camera = {
            Adapters: {
                register: (descriptor) => {
                    registerCalls.push(descriptor);
                    if (registeredIds.has(descriptor.id)) return { success: false, reason: `id "${descriptor.id}" is already registered.` };
                    registeredIds.add(descriptor.id);
                    return { success: true, id: descriptor.id };
                },
            },
        };
    }

    require(ADAPTER_PATH);
    return { adapter: global.window.CozyOS.LearningCameraAdapter, registerCalls, fakeStream, fakeTracks };
}

function fakeVideoEl(width = 640, height = 480) {
    return { videoWidth: width, videoHeight: height };
}

// --- Adapter registration ---

test('registers with CozyCamera.Adapters using the correct real-adapter descriptor shape', () => {
    const { registerCalls } = freshWindow();
    assert.equal(registerCalls.length, 1);
    assert.equal(registerCalls[0].id, 'learning-camera-adapter');
    assert.equal(registerCalls[0].capability, 'learning-frame-capture');
    assert.equal(registerCalls[0].performsOCR, false);
    assert.equal(typeof registerCalls[0].driver, 'string');
});

test('registration is best-effort and non-fatal if CozyCamera.Adapters is not loaded', () => {
    assert.doesNotThrow(() => freshWindow({ withCameraRegistry: false }));
});

test('no duplicate adapter registration: loading the module twice does not re-register or throw (module-level load guard)', () => {
    const { registerCalls } = freshWindow();
    assert.doesNotThrow(() => require(ADAPTER_PATH)); // second require is a no-op due to require cache + internal version guard
    assert.equal(registerCalls.length, 1, 'a second load of the same module must not produce a second registration call');
});

// --- isSupported / no navigator.mediaDevices ---

test('isSupported() is honestly false with no navigator at all', () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'no-navigator' });
    assert.equal(adapter.isSupported(), false);
});

test('isSupported() is honestly false with navigator but no mediaDevices', () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'no-mediaDevices' });
    assert.equal(adapter.isSupported(), false);
});

test('isSupported() is true when a real getUserMedia function is present', () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    assert.equal(adapter.isSupported(), true);
});

// --- startCapture: success / permission denied / unavailable hardware / unsupported ---

test('startCapture() succeeds and stores the real stream when getUserMedia resolves', async () => {
    const { adapter, fakeStream } = freshWindow({ withGetUserMedia: 'success' });
    const result = await adapter.startCapture();
    assert.equal(result.success, true);
    assert.equal(result.stream, fakeStream);
});

test('startCapture() reports permission denial honestly, never fabricating success', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'denied' });
    const result = await adapter.startCapture();
    assert.equal(result.success, false);
    assert.match(result.reason, /Permission denied/);
});

test('startCapture() reports unavailable camera hardware honestly', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'unavailable-hardware' });
    const result = await adapter.startCapture();
    assert.equal(result.success, false);
    assert.match(result.reason, /device not found/i);
});

test('startCapture() is safe and honest when navigator.mediaDevices does not exist', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'no-mediaDevices' });
    const result = await adapter.startCapture();
    assert.equal(result.success, false);
    assert.match(result.reason, /not available in this environment/);
});

test('startCapture() refuses a second concurrent capture rather than silently replacing the stream', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    await adapter.startCapture();
    const second = await adapter.startCapture();
    assert.equal(second.success, false);
    assert.match(second.reason, /already active/);
});

// --- captureFrame ---

test('captureFrame() fails honestly when no capture is active', () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    const result = adapter.captureFrame(fakeVideoEl());
    assert.equal(result.success, false);
    assert.match(result.reason, /No active capture/);
});

test('captureFrame() returns real frame data/metadata once a capture is active', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    await adapter.startCapture();
    const result = adapter.captureFrame(fakeVideoEl(320, 240));
    assert.equal(result.success, true);
    assert.equal(result.width, 320);
    assert.equal(result.height, 240);
    assert.equal(result.imageDataUrl, 'data:image/png;base64,FAKE');
    assert.ok(result.capturedAt);
    assert.match(result.note, /No OCR/);
});

test('captureFrame() rejects a videoEl that is not actually playing (videoWidth 0)', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    await adapter.startCapture();
    const result = adapter.captureFrame(fakeVideoEl(0, 0));
    assert.equal(result.success, false);
});

// --- stopCapture ---

test('stopCapture() stops all real tracks and clears state', async () => {
    const { adapter, fakeTracks } = freshWindow({ withGetUserMedia: 'success' });
    await adapter.startCapture();
    const result = adapter.stopCapture();
    assert.equal(result.success, true);
    assert.ok(fakeTracks.every((t) => t.stopped === true));
    const frameAfterStop = adapter.captureFrame(fakeVideoEl());
    assert.equal(frameAfterStop.success, false, 'capture must not be possible after stopCapture()');
});

test('stopCapture() is safe to call even when nothing is active', () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    const result = adapter.stopCapture();
    assert.equal(result.success, true);
});

// --- No biometric dependency ---

test('has no code dependency on FaceCaptureModule or the biometric capture file — mentioning it in documentation (explaining why it is not reused) is expected and fine; actually calling it would not be', () => {
    const src = require('node:fs').readFileSync(ADAPTER_PATH, 'utf8');
    assert.doesNotMatch(src, /window\.CozyOS\.FaceCaptureModule/, 'must never actually call FaceCaptureModule');
    assert.doesNotMatch(src, /require\(['"].*face-capture/i, 'must never import the biometric capture file');
});

// --- Integration: camera frame -> learning boundary ---

test('captureForLearning(): real frame + OCR unavailable (pipeline not loaded) -> honest capture-only result, never fabricated text', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    await adapter.startCapture();
    const result = await adapter.captureForLearning(fakeVideoEl());
    assert.equal(result.success, true);
    assert.equal(result.stage, 'capture-only');
    assert.equal(result.ocr.attempted, false);
    assert.equal(result.frame.success, true, 'the real captured frame must still be present, ready for the next legitimate OCR stage');
});

test('captureForLearning(): real frame + OCR genuinely unavailable (UniversalLearningPipeline loaded but OCREngine is not) -> honest capture-only result', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    global.window.CozyOS.UniversalLearningPipeline = {
        learnFromOCR: async () => ({ success: false, reason: 'Missing real capabilities: ocr-learning.' }),
    };
    await adapter.startCapture();
    const result = await adapter.captureForLearning(fakeVideoEl());
    assert.equal(result.stage, 'capture-only');
    assert.equal(result.ocr.attempted, true);
    assert.equal(result.ocr.available, false);
    assert.match(result.ocr.reason, /ocr-learning/);
});

test('captureForLearning(): real frame + real OCR success -> capture-and-ocr, using the real learnFromOCR() output verbatim', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    let receivedPayload = null;
    global.window.CozyOS.UniversalLearningPipeline = {
        learnFromOCR: async (payload) => { receivedPayload = payload; return { success: true, extracted: { text: 'Buenos días', status: 'OK' } }; },
    };
    await adapter.startCapture();
    const result = await adapter.captureForLearning(fakeVideoEl());
    assert.equal(result.stage, 'capture-and-ocr');
    assert.equal(result.ocr.extracted.text, 'Buenos días');
    assert.equal(receivedPayload, 'data:image/png;base64,FAKE', 'the real captured image data must be what is actually sent to OCR, not a placeholder');
});

test('captureForLearning(): capture failure short-circuits before ever touching the pipeline', async () => {
    const { adapter } = freshWindow({ withGetUserMedia: 'success' });
    let called = false;
    global.window.CozyOS.UniversalLearningPipeline = { learnFromOCR: async () => { called = true; return { success: true, extracted: {} }; } };
    // No startCapture() -> captureFrame() will fail
    const result = await adapter.captureForLearning(fakeVideoEl());
    assert.equal(result.success, false);
    assert.equal(result.stage, 'capture-failed');
    assert.equal(called, false, 'OCR must never be attempted on a failed/nonexistent frame');
});
