'use strict';

/**
 * core/shell/live/tests/ldce-live-media-coordinator.test.js
 * STEP 4D / LIVE UI, PART F
 *
 * Covers requirements A-T from the Part F next-builder prompt.
 * Run: node --test core/shell/live/tests/ldce-live-media-coordinator.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveMediaCoordinator } = require('../ldce-live-media-coordinator');

function fakeSession(uid) {
    return { current() { return uid ? { uid } : null; } };
}

function fakeLdce({ sessions = {}, participants = {} } = {}) {
    const listeners = new Map();
    return {
        calls: { leaveSession: [] },
        getSession(sessionId) { return sessions[sessionId] || null; },
        getParticipant(sessionId, requesterId, userId) { return (participants[sessionId] && participants[sessionId][userId]) || null; },
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return () => listeners.get(eventName).delete(handler);
        },
        emit(eventName, detail) {
            const set = listeners.get(eventName);
            if (!set) return;
            for (const fn of Array.from(set)) fn(detail);
        },
        listenForOffer(sessionId, fromUserId, toUserId, onOffer) {
            this._lastListenForOffer = { sessionId, fromUserId, toUserId, onOffer };
            return { available: true, unsubscribe: () => {} };
        },
        leaveSession(sessionId, userId) {
            this.calls.leaveSession.push({ sessionId, userId });
            this.emit('participant-left', { sessionId, userId, removedBy: null });
            return { success: true };
        },
    };
}

function fakeMedia({ attachResult, connectResult } = {}) {
    const listeners = new Map();
    const calls = { attachLocalMedia: [], connectToPeer: [], acceptPeerConnection: [], cleanupSession: [], disconnectFromPeer: [] };
    return {
        calls,
        async attachLocalMedia(sessionId, userId, videoElement, opts) {
            calls.attachLocalMedia.push({ sessionId, userId, videoElement, opts });
            return attachResult !== undefined ? attachResult : { success: true };
        },
        async connectToPeer(sessionId, fromUserId, toUserId) {
            calls.connectToPeer.push({ sessionId, fromUserId, toUserId });
            return connectResult !== undefined ? connectResult : { success: true, connectionId: 'conn-1' };
        },
        async acceptPeerConnection(sessionId, toUserId, fromUserId, offerCode) {
            calls.acceptPeerConnection.push({ sessionId, toUserId, fromUserId, offerCode });
            return { success: true, connectionId: 'conn-1' };
        },
        cleanupSession(sessionId, userId) { calls.cleanupSession.push({ sessionId, userId }); return { success: true }; },
        disconnectFromPeer(sessionId, peerUserId) { calls.disconnectFromPeer.push({ sessionId, peerUserId }); return { success: true }; },
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return () => listeners.get(eventName).delete(handler);
        },
        emit(eventName, detail) {
            const set = listeners.get(eventName);
            if (!set) return;
            for (const fn of Array.from(set)) fn(detail);
        },
    };
}

// ── HOST ──────────────────────────────────────────────────────────

// A: unauthenticated host fails closed
test('A: startHostMedia() with no authenticated user fails closed without touching media', async () => {
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's1', root: undefined,
        _root: { CozyOS: { Session: fakeSession(null) } },
        _LDCESessionEngine: fakeLdce(), _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'unauthenticated');
    assert.equal(media.calls.attachLocalMedia.length, 0);
});

// B: authenticated host obtains identity from CozyOS.Session
test('B: startHostMedia() reads uid from CozyOS.Session.current(), not from a caller field', async () => {
    const ldce = fakeLdce({ sessions: { s2: { hostId: 'uid-host' } } });
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's2',
        _root: { CozyOS: { Session: fakeSession('uid-host') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
    assert.equal(result.uid, 'uid-host');
    assert.equal(media.calls.attachLocalMedia[0].userId, 'uid-host');
});

// C: caller cannot substitute another uid
test('C: startHostMedia() rejects a signed-in user who is not the real session host', async () => {
    const ldce = fakeLdce({ sessions: { s3: { hostId: 'uid-real-host' } } });
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's3',
        _root: { CozyOS: { Session: fakeSession('uid-imposter') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'not-host');
    assert.equal(media.calls.attachLocalMedia.length, 0);
});

// D: camera permission denial fails safely
test('D: startHostMedia() propagates a real getUserMedia denial and never claims live', async () => {
    const ldce = fakeLdce({ sessions: { s4: { hostId: 'uid-host' } } });
    const media = fakeMedia({ attachResult: { success: false, reason: 'Permission denied by user.' } });
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's4',
        _root: { CozyOS: { Session: fakeSession('uid-host') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'media-denied');
    assert.match(result.reason, /denied/);
});

// E: media capture failure fails safely
test('E: startHostMedia() propagates a non-denial capture failure honestly, distinct reason preserved', async () => {
    const ldce = fakeLdce({ sessions: { s5: { hostId: 'uid-host' } } });
    const media = fakeMedia({ attachResult: { success: false, reason: 'LiveVideoCaptureEngine is not available.' } });
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's5',
        _root: { CozyOS: { Session: fakeSession('uid-host') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'media-denied');
    assert.match(result.reason, /not available/);
});

// F: successful capture produces MediaStream
test('F: startHostMedia() reports live-media-active after a real successful attachLocalMedia()', async () => {
    const ldce = fakeLdce({ sessions: { s6: { hostId: 'uid-host' } } });
    const media = fakeMedia({ attachResult: { success: true } });
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's6',
        _root: { CozyOS: { Session: fakeSession('uid-host') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
    assert.equal(result.state, 'live-media-active');
});

// G: correct LDCE sessionId reaches media coordinator
test('G: startHostMedia() forwards the exact sessionId/videoElement to attachLocalMedia()', async () => {
    const ldce = fakeLdce({ sessions: { s7: { hostId: 'uid-host' } } });
    const media = fakeMedia();
    const fakeEl = { tag: 'video-el' };
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's7', videoElement: fakeEl,
        _root: { CozyOS: { Session: fakeSession('uid-host') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(media.calls.attachLocalMedia[0].sessionId, 's7');
    assert.equal(media.calls.attachLocalMedia[0].videoElement, fakeEl);
});

// H: host is the actual LDCE session host
test('H: startHostMedia() resolves host identity via LDCESessionEngine.getSession().hostId', async () => {
    const ldce = fakeLdce({ sessions: { s8: { hostId: 'uid-host-8' } } });
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's8',
        _root: { CozyOS: { Session: fakeSession('uid-host-8') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
});

// ── VIEWER ────────────────────────────────────────────────────────

// I: unauthenticated viewer fails closed
test('I: joinAsViewerMedia() with no authenticated user fails closed without touching media', async () => {
    const ldce = fakeLdce();
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's9',
        _root: { CozyOS: { Session: fakeSession(null) } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'unauthenticated');
    assert.equal(media.calls.connectToPeer.length, 0);
});

// J: missing sessionId fails closed
test('J: joinAsViewerMedia() with no sessionId fails closed', async () => {
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.joinAsViewerMedia({
        _root: { CozyOS: { Session: fakeSession('uid-viewer') } },
        _LDCESessionEngine: fakeLdce(), _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'missing-session-id');
    assert.equal(media.calls.connectToPeer.length, 0);
});

// K: known sessionId joins
test('K: joinAsViewerMedia() connects to the resolved host for a known, already-joined session', async () => {
    const ldce = fakeLdce({
        sessions: { s10: { hostId: 'uid-host-10' } },
        participants: { s10: { 'uid-viewer-10': { userId: 'uid-viewer-10', role: 'participant' } } },
    });
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's10',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-10') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
    assert.equal(result.state, 'connecting');
    assert.equal(result.hostId, 'uid-host-10');
    assert.equal(media.calls.connectToPeer[0].fromUserId, 'uid-viewer-10');
    assert.equal(media.calls.connectToPeer[0].toUserId, 'uid-host-10');
});

// L: viewer does not publish camera automatically
test('L: joinAsViewerMedia() never calls attachLocalMedia() for the viewer', async () => {
    const ldce = fakeLdce({
        sessions: { s11: { hostId: 'uid-host-11' } },
        participants: { s11: { 'uid-viewer-11': { userId: 'uid-viewer-11', role: 'participant' } } },
    });
    const media = fakeMedia();
    await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's11',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-11') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(media.calls.attachLocalMedia.length, 0);
});

// M: viewer receives host stream
test('M: joinAsViewerMedia() attaches the host\'s real remote MediaStream to the supplied video element', async () => {
    const ldce = fakeLdce({
        sessions: { s12: { hostId: 'uid-host-12' } },
        participants: { s12: { 'uid-viewer-12': { userId: 'uid-viewer-12', role: 'participant' } } },
    });
    const media = fakeMedia();
    const remoteEl = { srcObject: null };
    await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's12', remoteVideoElement: remoteEl,
        _root: { CozyOS: { Session: fakeSession('uid-viewer-12') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    const fakeStream = { id: 'stream-1' };
    media.emit('remote-track', { sessionId: 's12', userId: 'uid-host-12', streams: [fakeStream] });
    assert.equal(remoteEl.srcObject, fakeStream);
});

// N: invalid/unknown session fails safely
test('N: joinAsViewerMedia() fails closed for an unknown session without connecting', async () => {
    const ldce = fakeLdce({ participants: { s13: { 'uid-viewer-13': { userId: 'uid-viewer-13' } } } });
    const media = fakeMedia();
    const result = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's13',
        _root: { CozyOS: { Session: fakeSession('uid-viewer-13') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'unknown-session');
    assert.equal(media.calls.connectToPeer.length, 0);
});

// ── BOUNDARY ──────────────────────────────────────────────────────
// O-S exercise real executable behavior: each forbidden global is a Proxy
// that throws the moment any property on it is even read. If the
// coordinator's real runtime execution ever touched that system, the
// call below would throw and the test would fail — this is not a
// comment/string inspection, it is a live behavioral guard.

function throwingTrap(label) {
    return new Proxy({}, {
        get(_target, prop) { throw new Error(`Coordinator must never touch ${label}.${String(prop)}`); },
    });
}

function trappedRoot(uid, extraGlobals) {
    return {
        CozyOS: {
            Session: fakeSession(uid),
            SessionAuthority: throwingTrap('SessionAuthority'),
            LiveRelayCompositionBridge: throwingTrap('LiveRelayCompositionBridge'),
            CozyLiveParticipationController: throwingTrap('CozyLiveParticipationController'),
            RemoteRelayTransportProvider: throwingTrap('RemoteRelayTransportProvider'),
            CozyLiveSession: throwingTrap('CozyLiveSession'),
            LivingWorshipPlayer: throwingTrap('LivingWorshipPlayer'),
            ...extraGlobals,
        },
    };
}

// O: SessionAuthority is not replaced
test('O: startHostMedia()/joinAsViewerMedia() never touch SessionAuthority even when present on root', async () => {
    const hostLdce = fakeLdce({ sessions: { s15: { hostId: 'uid-host-15' } } });
    const hostResult = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's15', _root: trappedRoot('uid-host-15'),
        _LDCESessionEngine: hostLdce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(hostResult.success, true); // did not throw -> SessionAuthority was never dereferenced

    const viewerLdce = fakeLdce({ sessions: { s15v: { hostId: 'uid-host-15v' } }, participants: { s15v: { 'uid-viewer-15': { userId: 'uid-viewer-15' } } } });
    const viewerResult = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's15v', _root: trappedRoot('uid-viewer-15'),
        _LDCESessionEngine: viewerLdce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(viewerResult.success, true);
});

// P: LDCE mesh remains the selected media path
test('P: startHostMedia()/joinAsViewerMedia() never touch LiveRelayCompositionBridge (mesh-only stays selected)', async () => {
    const ldce = fakeLdce({ sessions: { s16: { hostId: 'uid-host-16' } }, participants: { s16: { 'uid-viewer-16': { userId: 'uid-viewer-16' } } } });
    const hostResult = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's16', _root: trappedRoot('uid-host-16'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(hostResult.success, true);
    const viewerResult = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's16', _root: trappedRoot('uid-viewer-16'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(viewerResult.success, true);
});

// Q: Patch #6 relay remains untouched
test('Q: startHostMedia()/joinAsViewerMedia() never touch the Patch #6 relay globals', async () => {
    const ldce = fakeLdce({ sessions: { s17: { hostId: 'uid-host-17' } }, participants: { s17: { 'uid-viewer-17': { userId: 'uid-viewer-17' } } } });
    const hostResult = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's17', _root: trappedRoot('uid-host-17'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(hostResult.success, true);
    const viewerResult = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's17', _root: trappedRoot('uid-viewer-17'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(viewerResult.success, true);
});

// R: CozyLiveSession remains untouched
test('R: startHostMedia()/joinAsViewerMedia() never touch CozyLiveSession', async () => {
    const ldce = fakeLdce({ sessions: { s18: { hostId: 'uid-host-18' } }, participants: { s18: { 'uid-viewer-18': { userId: 'uid-viewer-18' } } } });
    const hostResult = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's18', _root: trappedRoot('uid-host-18'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(hostResult.success, true);
    const viewerResult = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's18', _root: trappedRoot('uid-viewer-18'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(viewerResult.success, true);
});

// S: living-worship-player.js remains untouched
test('S: startHostMedia()/joinAsViewerMedia() never touch LivingWorshipPlayer', async () => {
    const ldce = fakeLdce({ sessions: { s19: { hostId: 'uid-host-19' } }, participants: { s19: { 'uid-viewer-19': { userId: 'uid-viewer-19' } } } });
    const hostResult = await LiveMediaCoordinator.startHostMedia({
        sessionId: 's19', _root: trappedRoot('uid-host-19'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(hostResult.success, true);
    const viewerResult = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's19', _root: trappedRoot('uid-viewer-19'),
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: fakeMedia(),
    });
    assert.equal(viewerResult.success, true);
});

// T: second viewer is rejected or explicitly unsupported
test('T: startHostMedia() rejects a second viewer and never services a second offer', async () => {
    const ldce = fakeLdce({ sessions: { s14: { hostId: 'uid-host-14' } } });
    const media = fakeMedia();
    let rejected = null;
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's14',
        onSecondViewerRejected: (evt) => { rejected = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-host-14') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    ldce.emit('participant-joined', { sessionId: 's14', userId: 'uid-viewer-first', role: 'participant' });
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-first');

    const firstListenForOffer = ldce._lastListenForOffer;
    ldce.emit('participant-joined', { sessionId: 's14', userId: 'uid-viewer-second', role: 'participant' });

    assert.deepEqual(rejected, { sessionId: 's14', userId: 'uid-viewer-second' });
    assert.equal(ldce._lastListenForOffer, firstListenForOffer); // no new listenForOffer() call for the second viewer
});

// ── PART G — LIFECYCLE / CLEANUP HARDENING ──────────────────────────

// U: host leaving (stopHostMedia) really tears down media and stops listening
test('U: stopHostMedia() unsubscribes participant-joined/left and composes real cleanupSession()', async () => {
    const ldce = fakeLdce({ sessions: { s20: { hostId: 'uid-host-20' } } });
    const media = fakeMedia();
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's20',
        _root: { CozyOS: { Session: fakeSession('uid-host-20') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    const result = LiveMediaCoordinator.stopHostMedia({
        sessionId: 's20', _root: { CozyOS: { Session: fakeSession('uid-host-20') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
    assert.deepEqual(media.calls.cleanupSession, [{ sessionId: 's20', userId: 'uid-host-20' }]);

    // A viewer joining after stop must never be serviced — the listener is really gone, not just idle.
    ldce.emit('participant-joined', { sessionId: 's20', userId: 'uid-viewer-late' });
    assert.equal(ldce._lastListenForOffer, undefined);
});

// V: stopHostMedia() is safe to call before any startHostMedia (host closing before a viewer connects)
test('V: stopHostMedia() is a safe no-throw no-op when host media was never started', () => {
    const media = fakeMedia();
    const result = LiveMediaCoordinator.stopHostMedia({
        sessionId: 's21', _root: { CozyOS: { Session: fakeSession('uid-host-21') } },
        _LDCEMediaSessionEngine: media,
    });
    // Calling cleanupSession() defensively (even with nothing to clean up) is harmless and real —
    // the important guarantee is that this never throws and always reports success.
    assert.equal(result.success, true);
});

// W: viewer leaving really tears down the peer connection and propagates the departure
test('W: leaveViewerMedia() disconnects from the host and composes the real LDCESessionEngine.leaveSession()', async () => {
    const ldce = fakeLdce({ sessions: { s22: { hostId: 'uid-host-22' } }, participants: { s22: { 'uid-viewer-22': { userId: 'uid-viewer-22' } } } });
    const media = fakeMedia();
    let unsubscribed = false;

    const result = LiveMediaCoordinator.leaveViewerMedia({
        sessionId: 's22', unsubscribe: () => { unsubscribed = true; },
        _root: { CozyOS: { Session: fakeSession('uid-viewer-22') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    assert.equal(result.success, true);
    assert.deepEqual(media.calls.disconnectFromPeer, [{ sessionId: 's22', peerUserId: 'uid-host-22' }]);
    assert.equal(unsubscribed, true);
    assert.deepEqual(ldce.calls.leaveSession, [{ sessionId: 's22', userId: 'uid-viewer-22' }]);
});

// X: leaveViewerMedia() is a safe no-throw no-op before the host was ever resolvable (viewer leaving before host answers / unknown session)
test('X: leaveViewerMedia() is safe when no session/host can be resolved', () => {
    const ldce = fakeLdce({});
    const media = fakeMedia();
    const result = LiveMediaCoordinator.leaveViewerMedia({
        sessionId: 's23', _root: { CozyOS: { Session: fakeSession('uid-viewer-23') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, true);
    assert.equal(media.calls.disconnectFromPeer.length, 0);
});

// Y: repeated Join/Leave/Join by the SAME viewer is serviced as a reconnect, never rejected as a second viewer
test('Y: the already-accepted viewer rejoining after leaving is reconnected, not rejected as a second viewer', async () => {
    const ldce = fakeLdce({ sessions: { s24: { hostId: 'uid-host-24' } } });
    const media = fakeMedia();
    let rejected = null;
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's24', onSecondViewerRejected: (evt) => { rejected = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-host-24') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    ldce.emit('participant-joined', { sessionId: 's24', userId: 'uid-viewer-24' });
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-24');

    // Viewer leaves (real LDCESessionEngine "participant-left" fires) — slot must free and the
    // stale host-side peer connection must be torn down.
    ldce.emit('participant-left', { sessionId: 's24', userId: 'uid-viewer-24' });
    assert.deepEqual(media.calls.disconnectFromPeer, [{ sessionId: 's24', peerUserId: 'uid-viewer-24' }]);

    // Same viewer rejoins — serviced again, never treated as a second viewer.
    ldce.emit('participant-joined', { sessionId: 's24', userId: 'uid-viewer-24' });
    assert.equal(rejected, null);
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-24');
});

// Z: after the accepted viewer truly leaves, a genuinely DIFFERENT viewer is then serviced cleanly (slot freed, not permanently stuck)
test('Z: a different viewer is serviced after the first accepted viewer leaves', async () => {
    const ldce = fakeLdce({ sessions: { s25: { hostId: 'uid-host-25' } } });
    const media = fakeMedia();
    let rejected = null;
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's25', onSecondViewerRejected: (evt) => { rejected = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-host-25') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    ldce.emit('participant-joined', { sessionId: 's25', userId: 'uid-viewer-first' });
    ldce.emit('participant-left', { sessionId: 's25', userId: 'uid-viewer-first' });
    ldce.emit('participant-joined', { sessionId: 's25', userId: 'uid-viewer-new' });

    assert.equal(rejected, null);
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-new');
});

// AA: a genuinely concurrent second viewer (no "left" event for the first) is still rejected cleanly — reconfirms T under the new reconnect branch
test('AA: a second concurrent viewer is still rejected cleanly while the first remains connected', async () => {
    const ldce = fakeLdce({ sessions: { s26: { hostId: 'uid-host-26' } } });
    const media = fakeMedia();
    let rejected = null;
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's26', onSecondViewerRejected: (evt) => { rejected = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-host-26') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    ldce.emit('participant-joined', { sessionId: 's26', userId: 'uid-viewer-a' });
    ldce.emit('participant-joined', { sessionId: 's26', userId: 'uid-viewer-b' });
    assert.deepEqual(rejected, { sessionId: 's26', userId: 'uid-viewer-b' });
    assert.equal(media.calls.disconnectFromPeer.length, 0); // first viewer's connection was never touched
});

// AB: repeated Go Live/Stop on the same sessionId starts with fresh bookkeeping each time (no residual accepted-viewer state)
test('AB: a fresh startHostMedia() after stopHostMedia() has no residual accepted-viewer state', async () => {
    const ldce = fakeLdce({ sessions: { s27: { hostId: 'uid-host-27' } } });
    const media = fakeMedia();
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's27', _root: { CozyOS: { Session: fakeSession('uid-host-27') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    ldce.emit('participant-joined', { sessionId: 's27', userId: 'uid-viewer-27' });
    LiveMediaCoordinator.stopHostMedia({ sessionId: 's27', _root: { CozyOS: { Session: fakeSession('uid-host-27') } }, _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media });

    let rejected = null;
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's27', onSecondViewerRejected: (evt) => { rejected = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-host-27') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    ldce.emit('participant-joined', { sessionId: 's27', userId: 'uid-viewer-27' });
    assert.equal(rejected, null);
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-27');
});

// AC: connectToPeer/ICE failure on the viewer side fails closed and never leaves an unsubscribed remote-track listener dangling
test('AC: joinAsViewerMedia() connection failure cleans up its own remote-track subscription', async () => {
    const ldce = fakeLdce({ sessions: { s28: { hostId: 'uid-host-28' } }, participants: { s28: { 'uid-viewer-28': { userId: 'uid-viewer-28' } } } });
    const media = fakeMedia({ connectResult: { success: false, reason: 'ICE connection failed.' } });
    const videoEl = {};
    const result = await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's28', remoteVideoElement: videoEl,
        _root: { CozyOS: { Session: fakeSession('uid-viewer-28') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'connect-failed');
    // No dangling remote-track subscription — emitting after failure must not touch the video element.
    media.emit('remote-track', { sessionId: 's28', userId: 'uid-host-28', streams: [{}] });
    assert.equal(videoEl.srcObject, undefined);
});

// ── PART H — LIFECYCLE / FAILURE-PATH HARDENING ─────────────────────

// AD: a failed acceptPeerConnection() (negotiation never actually succeeded) must free the
// one-viewer slot, not leave it permanently occupied by a peer that was never really connected.
test('AD: startHostMedia() frees the accepted-viewer slot when acceptPeerConnection() fails', async () => {
    const ldce = fakeLdce({ sessions: { s29: { hostId: 'uid-host-29' } } });
    const media = fakeMedia();
    media.acceptPeerConnection = async (sessionId, toUserId, fromUserId, offerCode) => {
        media.calls.acceptPeerConnection.push({ sessionId, toUserId, fromUserId, offerCode });
        return { success: false, reason: 'Real answerOffer() rejection.' };
    };
    const results = [];
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's29', onViewerConnectionResult: (r) => results.push(r),
        _root: { CozyOS: { Session: fakeSession('uid-host-29') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    ldce.emit('participant-joined', { sessionId: 's29', userId: 'uid-viewer-first' });
    await ldce._lastListenForOffer.onOffer('offer-code-1');
    assert.equal(results[0].success, false);

    // A genuinely different viewer, with no "participant-left" for the first, must now be
    // serviced — the failed negotiation already freed the slot, unlike a real live connection.
    ldce.emit('participant-joined', { sessionId: 's29', userId: 'uid-viewer-second' });
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-second');
});

// AE: a real "connection-state-changed" -> "failed" event for the accepted viewer's connection
// (e.g. ICE failure after a successful accept) tears down the stale peer connection and frees
// the slot, using the already-real, already-existing event — no new transport is invented.
test('AE: startHostMedia() frees the accepted-viewer slot on a real terminal connection-state-changed event', async () => {
    const ldce = fakeLdce({ sessions: { s30: { hostId: 'uid-host-30' } } });
    const media = fakeMedia();
    const results = [];
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's30', onViewerConnectionResult: (r) => results.push(r),
        _root: { CozyOS: { Session: fakeSession('uid-host-30') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    ldce.emit('participant-joined', { sessionId: 's30', userId: 'uid-viewer-30' });
    await ldce._lastListenForOffer.onOffer('offer-code-2');
    assert.equal(media.calls.acceptPeerConnection[0].fromUserId, 'uid-viewer-30');

    media.emit('connection-state-changed', { sessionId: 's30', userId: 'uid-viewer-30', connectionState: 'failed' });
    assert.equal(media.calls.disconnectFromPeer[0].peerUserId, 'uid-viewer-30');
    assert.equal(results[results.length - 1].success, false);

    // Slot is free — a different viewer can now be serviced with no "participant-left" ever having fired.
    ldce.emit('participant-joined', { sessionId: 's30', userId: 'uid-viewer-31' });
    assert.equal(ldce._lastListenForOffer.fromUserId, 'uid-viewer-31');
});

// AF: stopHostMedia() closes the real LDCE session (when endSession() exists) — best-effort,
// and never turns stopHostMedia() itself into an async/awaited call for existing callers.
test('AF: stopHostMedia() composes the real LDCESessionEngine.endSession() best-effort', async () => {
    const ldce = fakeLdce({ sessions: { s31: { hostId: 'uid-host-31' } } });
    const endSessionCalls = [];
    ldce.endSession = async (sessionId, actorId, opts) => {
        endSessionCalls.push({ sessionId, actorId, opts });
        return { success: true };
    };
    const media = fakeMedia();
    await LiveMediaCoordinator.startHostMedia({
        sessionId: 's31', _root: { CozyOS: { Session: fakeSession('uid-host-31') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    const result = LiveMediaCoordinator.stopHostMedia({
        sessionId: 's31', _root: { CozyOS: { Session: fakeSession('uid-host-31') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });
    // Still synchronous and still succeeds immediately — endSession() is fire-and-forget.
    assert.equal(result.success, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(endSessionCalls, [{ sessionId: 's31', actorId: 'uid-host-31', opts: { confirm: true } }]);
});

// AG: a real terminal connection-state-changed event on the viewer side surfaces honestly
// instead of leaving the UI stuck on "Connecting…" with a frozen/black frame.
test('AG: joinAsViewerMedia() reports a terminal connection failure and clears the video element', async () => {
    const ldce = fakeLdce({
        sessions: { s32: { hostId: 'uid-host-32' } },
        participants: { s32: { 'uid-viewer-32': { userId: 'uid-viewer-32' } } },
    });
    const media = fakeMedia();
    const remoteEl = { srcObject: { id: 'stale-frame' } };
    let failedEvt = null;
    await LiveMediaCoordinator.joinAsViewerMedia({
        sessionId: 's32', remoteVideoElement: remoteEl, onConnectionFailed: (evt) => { failedEvt = evt; },
        _root: { CozyOS: { Session: fakeSession('uid-viewer-32') } },
        _LDCESessionEngine: ldce, _LDCEMediaSessionEngine: media,
    });

    media.emit('connection-state-changed', { sessionId: 's32', userId: 'uid-host-32', connectionState: 'failed' });
    assert.equal(remoteEl.srcObject, null);
    assert.deepEqual(failedEvt, { sessionId: 's32', hostId: 'uid-host-32', connectionState: 'failed' });
});
