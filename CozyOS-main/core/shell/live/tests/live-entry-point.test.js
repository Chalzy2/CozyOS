'use strict';

/**
 * core/shell/live/tests/live-entry-point.test.js
 * STEP 4D / LIVE PRODUCT ENTRY POINT, Patch #1
 *
 * Real, focused fixtures against the actual module's control flow —
 * fake CozyOS.Session, fake LDCESessionEngine, fake
 * LiveRelayCompositionBridge (same "no live network in this sandbox"
 * disclosure as the rest of this repository's test suite; see
 * live-relay-composition-bridge.test.js for the same pattern this file
 * follows).
 *
 * Run: node --test core/shell/live/tests/live-entry-point.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveEntryPoint } = require('../live-entry-point');

function fakeSession(uid) {
    return { current() { return uid ? { uid } : null; } };
}

function fakeLdce({ createResult, joinResult, createSpy, joinSpy } = {}) {
    return {
        createSession(hostId, opts) {
            if (createSpy) createSpy(hostId, opts);
            return createResult !== undefined ? createResult : { success: true, sessionId: 'ldce-session-1' };
        },
        joinSession(sessionId, userId, opts) {
            if (joinSpy) joinSpy(sessionId, userId, opts);
            return joinResult !== undefined ? joinResult : { success: true, role: 'participant' };
        },
    };
}

function fakeBridge({ result, spy } = {}) {
    return {
        async establishRelaySession(opts) {
            if (spy) spy(opts);
            return result !== undefined ? result : { success: true, role: 'host', userId: opts.sessionId ? 'uid-from-bridge' : null };
        },
    };
}

const RELAY_OPTS = { relayHttpUrl: 'http://relay.test', relayWsUrl: 'ws://relay.test', deviceManager: {} };

// ---------------------------------------------------------------------
// HOST PATH
// ---------------------------------------------------------------------

test('A: goLive() with no authenticated user fails closed', async () => {
    const result = await LiveEntryPoint.goLive({
        transportMode: 'mesh-only',
        _root: { CozyOS: { Session: fakeSession(null) } },
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /No authenticated/);
});

test('B: goLive() with authenticated user creates an LDCE session (mesh-only)', async () => {
    let capturedHostId = null;
    const ldce = fakeLdce({ createSpy: (hostId) => { capturedHostId = hostId; } });
    const result = await LiveEntryPoint.goLive({
        transportMode: 'mesh-only',
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, true);
    assert.equal(result.sessionId, 'ldce-session-1');
    assert.equal(capturedHostId, 'uid-host-1');
    assert.equal(result.relay, null);
});

test('C: goLive() session-creation failure fails closed', async () => {
    const ldce = fakeLdce({ createResult: { success: false, reason: 'CozyConversation is not available.' } });
    const result = await LiveEntryPoint.goLive({
        transportMode: 'mesh-only',
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /CozyConversation/);
});

test('D: goLive() with transportMode "relay" forwards the created sessionId to the composition bridge', async () => {
    let capturedOpts = null;
    const ldce = fakeLdce({ createResult: { success: true, sessionId: 'ldce-session-77' } });
    const bridge = fakeBridge({ spy: (opts) => { capturedOpts = opts; } });
    const result = await LiveEntryPoint.goLive({
        transportMode: 'relay',
        ...RELAY_OPTS,
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
        _CompositionBridge: bridge,
    });
    assert.equal(result.success, true);
    assert.equal(capturedOpts.sessionId, 'ldce-session-77');
    assert.equal(capturedOpts.registerAsHost, true);
    assert.equal(result.sessionId, 'ldce-session-77');
});

test('E: goLive() composition-bridge failure propagates safely (session already created is reported, not hidden)', async () => {
    const ldce = fakeLdce({ createResult: { success: true, sessionId: 'ldce-session-9' } });
    const bridge = fakeBridge({ result: { success: false, reason: 'assertion endpoint rejected the token' } });
    const result = await LiveEntryPoint.goLive({
        transportMode: 'relay',
        ...RELAY_OPTS,
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
        _CompositionBridge: bridge,
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /assertion endpoint rejected/);
    assert.equal(result.sessionId, 'ldce-session-9');
});

test('F: goLive() ignores any caller-supplied uid and always uses the authenticated session uid', async () => {
    let capturedHostId = null;
    const ldce = fakeLdce({ createSpy: (hostId) => { capturedHostId = hostId; } });
    const result = await LiveEntryPoint.goLive({
        transportMode: 'mesh-only',
        uid: 'attacker-supplied-uid', // not a recognized option key — must be ignored
        _root: { CozyOS: { Session: fakeSession('uid-real-owner') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, true);
    assert.equal(capturedHostId, 'uid-real-owner');
    assert.notEqual(capturedHostId, 'attacker-supplied-uid');
});

// ---------------------------------------------------------------------
// VIEWER PATH
// ---------------------------------------------------------------------

test('G: joinLive() with no authenticated user fails closed', async () => {
    const result = await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        sessionId: 'ldce-session-1',
        _root: { CozyOS: { Session: fakeSession(null) } },
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /No authenticated/);
});

test('H: joinLive() with missing sessionId fails closed', async () => {
    const result = await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /sessionId is required/);
});

test('I: joinLive() with a valid known sessionId joins the session', async () => {
    let capturedArgs = null;
    const ldce = fakeLdce({ joinSpy: (sessionId, userId, opts) => { capturedArgs = { sessionId, userId, opts }; } });
    const result = await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        sessionId: 'ldce-session-42',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, true);
    assert.equal(capturedArgs.sessionId, 'ldce-session-42');
    assert.equal(capturedArgs.userId, 'uid-viewer-1');
});

test('J: joinLive() join failure fails closed', async () => {
    const ldce = fakeLdce({ joinResult: { success: false, reason: 'Not authorized to join this session.' } });
    const result = await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        sessionId: 'ldce-session-42',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /Not authorized/);
});

test('K: joinLive() viewer identity comes from the authenticated session, not caller input', async () => {
    let capturedUserId = null;
    const ldce = fakeLdce({ joinSpy: (_sessionId, userId) => { capturedUserId = userId; } });
    const result = await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        sessionId: 'ldce-session-42',
        userId: 'attacker-supplied-uid', // not a recognized option key — must be ignored
        _root: { CozyOS: { Session: fakeSession('uid-real-viewer') } },
        _LDCESessionEngine: ldce,
    });
    assert.equal(result.success, true);
    assert.equal(capturedUserId, 'uid-real-viewer');
});

// ---------------------------------------------------------------------
// BOUNDARY
// ---------------------------------------------------------------------

test('L: this module never reads or writes an LDCE "speaking" flag in executable code, and never calls SessionAuthority directly', () => {
    const raw = require('fs').readFileSync(__dirname + '/../live-entry-point.js', 'utf8');
    // Strip /* ... */ and // ... comments so doc-comment prose (which
    // legitimately explains what this file does NOT do) can't produce
    // a false positive — only executable code is checked below.
    const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    assert.equal(/\bspeaking\b/i.test(code), false, 'live-entry-point.js executable code must not reference LDCE\'s speaking flag at all');
    assert.equal(/\bSessionAuthority\b/.test(code), false, 'live-entry-point.js executable code must not construct or call SessionAuthority directly — only via the composition bridge');
});

test('M: transportMode "mesh-only" never invokes the composition bridge (existing LDCE mesh path untouched)', async () => {
    let bridgeCalled = false;
    const ldce = fakeLdce();
    const bridge = fakeBridge({ spy: () => { bridgeCalled = true; } });
    await LiveEntryPoint.goLive({
        transportMode: 'mesh-only',
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
        _CompositionBridge: bridge,
    });
    await LiveEntryPoint.joinLive({
        transportMode: 'mesh-only',
        sessionId: 'ldce-session-1',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
        _LDCESessionEngine: ldce,
        _CompositionBridge: bridge,
    });
    assert.equal(bridgeCalled, false);
});

test('N: an unrecognized transportMode fails closed instead of silently defaulting to relay or mesh', async () => {
    const goLiveResult = await LiveEntryPoint.goLive({
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
    });
    assert.equal(goLiveResult.success, false);
    assert.match(goLiveResult.reason, /transportMode/);

    const joinLiveResult = await LiveEntryPoint.joinLive({
        sessionId: 'ldce-session-1',
        transportMode: 'broadcast', // not a real mode
        _root: { CozyOS: { Session: fakeSession('uid-viewer-1') } },
    });
    assert.equal(joinLiveResult.success, false);
    assert.match(joinLiveResult.reason, /transportMode/);
});

test('bonus: the composition bridge itself remains untouched (unchanged public API surface used exactly as documented)', async () => {
    let capturedOpts = null;
    const ldce = fakeLdce({ createResult: { success: true, sessionId: 'ldce-session-5' } });
    const bridge = fakeBridge({ spy: (opts) => { capturedOpts = opts; } });
    await LiveEntryPoint.goLive({
        transportMode: 'relay',
        ...RELAY_OPTS,
        onEvent: () => {},
        transportSelector: { some: 'selector' },
        _root: { CozyOS: { Session: fakeSession('uid-host-1') } },
        _LDCESessionEngine: ldce,
        _CompositionBridge: bridge,
    });
    // Exactly the documented establishRelaySession(opts) shape — no new
    // fields invented, no renamed fields.
    assert.deepEqual(Object.keys(capturedOpts).sort(), [
        '_ControllerCtor', '_ProviderCtor', '_fetch', '_root',
        'deviceManager', 'onEvent', 'registerAsHost', 'relayHttpUrl',
        'relayWsUrl', 'sessionId', 'transportSelector',
    ].sort());
});
