'use strict';

/**
 * core/shell/live/tests/live-session-voice-bridge.test.js
 *
 * Pure-logic unit tests for live-session-voice-bridge.js's install(),
 * via dependency injection — no browser required, same convention as
 * live-host-console-controller.test.js.
 *
 * Run with: node --test core/shell/live/tests/live-session-voice-bridge.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadBridge() {
    const filePath = path.resolve(__dirname, '..', 'live-session-voice-bridge.js');
    const src = fs.readFileSync(filePath, 'utf8');
    const fakeWindow = { CozyOS: {} };
    // eslint-disable-next-line no-new-func
    const runner = new Function('window', 'globalThis', src + '\nreturn window.CozyOS.LiveSessionVoiceBridge;');
    return runner(fakeWindow, fakeWindow);
}

function makeFakeLdce() {
    const listeners = new Map();
    return {
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return () => { const s = listeners.get(eventName); if (s) s.delete(handler); };
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

test('install() subscribes to all five session lifecycle events and speaks the exact real #logToTranscript() wording', () => {
    const Bridge = loadBridge();
    const ldce = makeFakeLdce();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ ldceSessionEngine: ldce, livingAssistant: assistant });

    ldce.fire('session-started', { sessionId: 's1' });
    ldce.fire('session-paused', { sessionId: 's1' });
    ldce.fire('session-resumed', { sessionId: 's1' });
    ldce.fire('session-ended', { sessionId: 's1' });
    ldce.fire('session-cancelled', { sessionId: 's1' });

    assert.deepEqual(spoken, [
        'Session started.',
        'Session paused.',
        'Session resumed.',
        'Session ended.',
        'Session cancelled.',
    ]);
});

test('install() never voices participant-level events (deliberately narrow scope)', () => {
    const Bridge = loadBridge();
    const ldce = makeFakeLdce();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    Bridge.install({ ldceSessionEngine: ldce, livingAssistant: assistant });

    ldce.fire('participant-joined', { sessionId: 's1', userId: 'u1' });
    ldce.fire('metadata-changed', { sessionId: 's1' });

    assert.equal(ldce.listenerCount('participant-joined'), 0, 'no handler was ever registered for this event');
    assert.equal(spoken.length, 0);
});

test('install() is an honest no-op when LDCESessionEngine is missing (fails closed, never fabricates)', () => {
    const Bridge = loadBridge();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    const result = Bridge.install({ ldceSessionEngine: null, livingAssistant: assistant });
    assert.equal(typeof result.unsubscribeAll, 'function');
    result.unsubscribeAll(); // must not throw
    assert.equal(spoken.length, 0);
});

test('install() is an honest no-op when LivingAssistant.announceStatus is missing (older/patched build)', () => {
    const Bridge = loadBridge();
    const ldce = makeFakeLdce();

    Bridge.install({ ldceSessionEngine: ldce, livingAssistant: {} });
    ldce.fire('session-started', { sessionId: 's1' });
    // No throw, and no listener was ever attached.
    assert.equal(ldce.listenerCount('session-started'), 0);
});

test('unsubscribeAll() actually detaches every listener', () => {
    const Bridge = loadBridge();
    const ldce = makeFakeLdce();
    const spoken = [];
    const assistant = { announceStatus: (text) => spoken.push(text) };

    const handle = Bridge.install({ ldceSessionEngine: ldce, livingAssistant: assistant });
    handle.unsubscribeAll();
    ldce.fire('session-started', { sessionId: 's1' });

    assert.equal(spoken.length, 0, 'after unsubscribeAll(), a real event must not still reach voice');
});

test('a throwing announceStatus() never breaks the real session lifecycle event delivery for other listeners', () => {
    const Bridge = loadBridge();
    const ldce = makeFakeLdce();
    const assistant = { announceStatus: () => { throw new Error('voice backend exploded'); } };
    let otherListenerRan = false;

    Bridge.install({ ldceSessionEngine: ldce, livingAssistant: assistant });
    ldce.on('session-started', () => { otherListenerRan = true; });

    assert.doesNotThrow(() => ldce.fire('session-started', { sessionId: 's1' }));
    assert.equal(otherListenerRan, true);
});

test('getEventTextMap() exposes exactly the five documented events, matching LDCESessionEngine\'s own #logToTranscript() wording for the three that have a 1:1 match', () => {
    const Bridge = loadBridge();
    const map = Bridge.getEventTextMap();
    assert.deepEqual(Object.keys(map).sort(), [
        'session-cancelled', 'session-ended', 'session-paused', 'session-resumed', 'session-started',
    ].sort());
    assert.equal(map['session-started'], 'Session started.');
    assert.equal(map['session-paused'], 'Session paused.');
    assert.equal(map['session-resumed'], 'Session resumed.');
});
