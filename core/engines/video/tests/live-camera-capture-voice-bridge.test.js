'use strict';

/**
 * core/engines/video/tests/live-camera-capture-voice-bridge.test.js
 *
 * Pure-logic unit tests for live-camera-capture-voice-bridge.js's
 * install(), via dependency injection — no browser required, same
 * convention as live-session-voice-bridge.test.js.
 *
 * Run with: node --test core/engines/video/tests/live-camera-capture-voice-bridge.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadBridge() {
    const filePath = path.resolve(__dirname, '..', 'live-camera-capture-voice-bridge.js');
    const src = fs.readFileSync(filePath, 'utf8');
    const fakeWindow = { CozyOS: {} };
    // eslint-disable-next-line no-new-func
    const runner = new Function('window', 'globalThis', src + '\nreturn window.CozyOS.LiveCameraCaptureVoiceBridge;');
    return runner(fakeWindow, fakeWindow);
}

function makeFakeEngine() {
    const listeners = new Map();
    return {
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            // Real live-video-capture-engine.js's own on() returns
            // nothing — this fake matches that exactly, deliberately.
        },
        fire(eventName, detail) {
            const s = listeners.get(eventName);
            if (!s) return;
            for (const fn of Array.from(s)) fn(detail);
        },
        listenerCount(eventName) {
            const s = listeners.get(eventName);
            return s ? s.size : 0;
        },
    };
}

test('install() subscribes to all seven documented events and speaks honest, non-fabricated confirmations', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });

    engine.fire('previewStarted', {});
    engine.fire('photoCaptured', { dataUrl: 'data:image/png;base64,AAAA' });
    engine.fire('recordStarted', { mimeType: 'video/webm' });
    engine.fire('recordPaused', {});
    engine.fire('recordResumed', {});
    engine.fire('recordStopped', { sizeBytes: 1024, durationMs: 5000 });
    engine.fire('previewStopped', {});

    assert.deepEqual(spoken, [
        'Camera preview started.',
        'Photo captured.',
        'Recording started.',
        'Recording paused.',
        'Recording resumed.',
        'Recording stopped.',
        'Camera preview stopped.',
    ]);
});

test('error event includes the real, disclosed engine error message honestly, never inventing detail', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    engine.fire('error', { message: 'Permission denied' });

    assert.deepEqual(spoken, ['Camera error: Permission denied']);
});

test('error event without a message still speaks a plain, honest fallback rather than fabricating one', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    engine.fire('error', {});

    assert.deepEqual(spoken, ['Camera error.']);
});

test('photoCaptured never speaks any description of the captured image itself (explicit Matrix constraint)', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    engine.fire('photoCaptured', { dataUrl: 'data:image/png;base64,SENSITIVE_PIXELS_HERE' });

    assert.equal(spoken.length, 1);
    assert.ok(!spoken[0].includes('SENSITIVE_PIXELS_HERE'), 'must never voice raw captured image data');
    assert.equal(spoken[0], 'Photo captured.');
});

test('cameraConnected/cameraDisconnected are never voiced separately (redundant with previewStarted/previewStopped)', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    engine.fire('cameraConnected', { deviceId: 'cam-1' });
    engine.fire('cameraDisconnected', {});

    assert.equal(engine.listenerCount('cameraConnected'), 0, 'no handler was ever registered for this event');
    assert.equal(engine.listenerCount('cameraDisconnected'), 0);
    assert.equal(spoken.length, 0);
});

test('install() is an honest no-op when LiveVideoCapture is missing (fails closed, never fabricates)', () => {
    const Bridge = loadBridge();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    const result = Bridge.install({ liveVideoCapture: null, livingAssistant: assistant });
    assert.equal(typeof result.unsubscribeAll, 'function');
    result.unsubscribeAll(); // must not throw
    assert.equal(spoken.length, 0);
});

test('install() is an honest no-op when LivingAssistant.announceStatus is missing', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();

    Bridge.install({ liveVideoCapture: engine, livingAssistant: {} });
    engine.fire('previewStarted', {});
    assert.equal(engine.listenerCount('previewStarted'), 0);
});

test('unsubscribeAll() stops this bridge from speaking further, even though the underlying engine has no off()', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    const handle = Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    handle.unsubscribeAll();
    engine.fire('previewStarted', {});

    assert.equal(spoken.length, 0);
});

test('a throwing announceStatus() never breaks delivery to other real listeners on the same event', () => {
    const Bridge = loadBridge();
    const engine = makeFakeEngine();
    const assistant = { announceStatus: () => { throw new Error('voice backend exploded'); } };
    let otherListenerRan = false;

    Bridge.install({ liveVideoCapture: engine, livingAssistant: assistant });
    engine.on('previewStarted', () => { otherListenerRan = true; });

    assert.doesNotThrow(() => engine.fire('previewStarted', {}));
    assert.equal(otherListenerRan, true);
});
