'use strict';

/**
 * core/shell/live/tests/live-relay-composition-bridge.test.js
 * Phase 6 Patch #6 — Firebase/LDCE <-> Relay Composition Bridge
 *
 * Real, focused fixtures — not a live network, not a live Firebase
 * project (this sandbox has no outbound internet; see
 * PATCH5-AUDIT-REPORT.md and Browser-Verification-Report.md for the
 * same disclosed limitation elsewhere in this repository). What IS
 * real here: the actual bridge module's control flow, its fail-closed
 * behavior on every documented failure mode, and its exact request
 * shapes (method/URL/headers) against controlled fakes standing in for
 * fetch, the Firebase Auth service, and the two downstream
 * constructors (RemoteRelayTransportProvider, CozyLiveParticipationController).
 *
 * Run: node --test core/shell/live/tests/live-relay-composition-bridge.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveRelayCompositionBridge } = require('../live-relay-composition-bridge');

const RELAY_HTTP = 'http://relay.test';
const RELAY_WS = 'ws://relay.test';

function fakeAuthService({ user = null, readyRejects = false } = {}) {
    return {
        ready: readyRejects ? Promise.reject(new Error('init failed')) : Promise.resolve(),
        getAuthInstance() { return { currentUser: user }; },
    };
}

function fakeUser({ uid = 'uid-1', idToken = 'real-id-token', getIdTokenFails = false } = {}) {
    return {
        uid,
        async getIdToken() {
            if (getIdTokenFails) throw new Error('token retrieval failed');
            return idToken;
        },
    };
}

function fakeRoot(authService) {
    return { CozyOS: { Firebase: { Auth: authService } } };
}

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Records every call so tests can assert on method/URL/headers. */
function makeRecordingFetch(responder) {
    const calls = [];
    const fetchFn = async (url, init) => {
        calls.push({ url, init });
        return responder(url, init, calls.length - 1);
    };
    fetchFn.calls = calls;
    return fetchFn;
}

class FakeProvider {
    constructor(opts) {
        FakeProvider.instances.push(this);
        this.opts = opts;
    }
}
FakeProvider.instances = [];

class FakeController {
    constructor(opts) {
        FakeController.instances.push(this);
        this.opts = opts;
    }
    handleTransportEvent(type, msg) { this._lastEvent = { type, msg }; }
}
FakeController.instances = [];

function resetFakes() { FakeProvider.instances = []; FakeController.instances = []; }

// ---------------------------------------------------------------------
// A/E/F — Firebase ID-token acquisition
// ---------------------------------------------------------------------

test('A: getFirebaseIdToken() returns a real id token + uid for a signed-in user', async () => {
    const user = fakeUser({ uid: 'uid-abc', idToken: 'tok-abc' });
    const root = fakeRoot(fakeAuthService({ user }));
    const result = await LiveRelayCompositionBridge.getFirebaseIdToken(root);
    assert.equal(result.success, true);
    assert.equal(result.idToken, 'tok-abc');
    assert.equal(result.firebaseUid, 'uid-abc');
});

test('E: getFirebaseIdToken() fails closed with no signed-in Firebase user', async () => {
    const root = fakeRoot(fakeAuthService({ user: null }));
    const result = await LiveRelayCompositionBridge.getFirebaseIdToken(root);
    assert.equal(result.success, false);
    assert.match(result.reason, /No signed-in Firebase user/);
});

test('F: getFirebaseIdToken() fails closed when getIdToken() itself throws', async () => {
    const user = fakeUser({ getIdTokenFails: true });
    const root = fakeRoot(fakeAuthService({ user }));
    const result = await LiveRelayCompositionBridge.getFirebaseIdToken(root);
    assert.equal(result.success, false);
    assert.match(result.reason, /token retrieval failed/);
});

test('fails closed when core/firebase/firebase-auth.js was never loaded', async () => {
    const result = await LiveRelayCompositionBridge.getFirebaseIdToken({ CozyOS: {} });
    assert.equal(result.success, false);
    assert.match(result.reason, /firebase-auth\.js is not loaded/);
});

test('fails closed when Firebase Auth ready promise rejects', async () => {
    const root = fakeRoot(fakeAuthService({ readyRejects: true }));
    const result = await LiveRelayCompositionBridge.getFirebaseIdToken(root);
    assert.equal(result.success, false);
    assert.match(result.reason, /failed to initialize/);
});

// ---------------------------------------------------------------------
// B/G/H — /identity/assertion exchange
// ---------------------------------------------------------------------

test('B: obtainIdentityAssertion() sends the real id token as Bearer and returns the assertion', async () => {
    const user = fakeUser({ uid: 'uid-xyz', idToken: 'firebase-id-token-xyz' });
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = makeRecordingFetch((url) => {
        assert.equal(url, RELAY_HTTP + '/identity/assertion');
        return jsonResponse(200, { success: true, assertionToken: 'assertion-xyz', userId: 'uid-xyz' });
    });
    const result = await LiveRelayCompositionBridge.obtainIdentityAssertion(RELAY_HTTP, { _root: root, _fetch: fetchFn });
    assert.equal(result.success, true);
    assert.equal(result.assertionToken, 'assertion-xyz');
    assert.equal(fetchFn.calls[0].init.headers.Authorization, 'Bearer firebase-id-token-xyz');
    assert.equal(fetchFn.calls[0].init.method, 'POST');
});

test('G: obtainIdentityAssertion() fails closed when the server rejects the assertion endpoint', async () => {
    const user = fakeUser();
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = makeRecordingFetch(() => jsonResponse(401, { success: false, reason: 'Invalid Firebase ID token.' }));
    const result = await LiveRelayCompositionBridge.obtainIdentityAssertion(RELAY_HTTP, { _root: root, _fetch: fetchFn });
    assert.equal(result.success, false);
    assert.match(result.reason, /Invalid Firebase ID token/);
});

test('H: obtainIdentityAssertion() fails closed if the server-returned userId does not match the signed-in Firebase uid (no participation-token confusion)', async () => {
    const user = fakeUser({ uid: 'uid-real' });
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = makeRecordingFetch(() => jsonResponse(200, { success: true, assertionToken: 'assertion-1', userId: 'uid-DIFFERENT' }));
    const result = await LiveRelayCompositionBridge.obtainIdentityAssertion(RELAY_HTTP, { _root: root, _fetch: fetchFn });
    assert.equal(result.success, false);
    assert.match(result.reason, /did not match the signed-in Firebase user/);
});

test('obtainIdentityAssertion() fails closed on a network error, never fabricating success', async () => {
    const user = fakeUser();
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = async () => { throw new Error('ECONNREFUSED'); };
    const result = await LiveRelayCompositionBridge.obtainIdentityAssertion(RELAY_HTTP, { _root: root, _fetch: fetchFn });
    assert.equal(result.success, false);
    assert.match(result.reason, /Network request .* failed/);
});

// ---------------------------------------------------------------------
// C — participation-token exchange (/token and /register-host)
// ---------------------------------------------------------------------

test('C: fetchParticipationToken() calls /session/:id/token/:sub with the assertion as Bearer', async () => {
    const fetchFn = makeRecordingFetch((url) => {
        assert.equal(url, RELAY_HTTP + '/session/sess-1/token/uid-1');
        return jsonResponse(200, { success: true, token: 'participation-token-1', role: 'viewer' });
    });
    const result = await LiveRelayCompositionBridge.fetchParticipationToken(RELAY_HTTP, 'sess-1', 'uid-1', 'assertion-1', { _fetch: fetchFn });
    assert.equal(result.success, true);
    assert.equal(result.token, 'participation-token-1');
    assert.equal(fetchFn.calls[0].init.headers.Authorization, 'Bearer assertion-1');
});

test('D: fetchParticipationToken() routes to register-host when registerAsHost is set', async () => {
    const fetchFn = makeRecordingFetch((url) => {
        assert.equal(url, RELAY_HTTP + '/session/sess-1/register-host/uid-1');
        return jsonResponse(200, { success: true });
    });
    const result = await LiveRelayCompositionBridge.fetchParticipationToken(RELAY_HTTP, 'sess-1', 'uid-1', 'assertion-1', { _fetch: fetchFn, registerAsHost: true });
    assert.equal(result.success, true);
});

// ---------------------------------------------------------------------
// Full establishRelaySession() composition
// ---------------------------------------------------------------------

function fullHappyPathFetch() {
    return makeRecordingFetch((url) => {
        if (url.endsWith('/identity/assertion')) {
            return jsonResponse(200, { success: true, assertionToken: 'assertion-99', userId: 'uid-99' });
        }
        if (url.endsWith('/token/uid-99')) {
            return jsonResponse(200, { success: true, token: 'participation-99', role: 'speaker' });
        }
        throw new Error('unexpected URL in test fixture: ' + url);
    });
}

test('establishRelaySession() composes assertion -> token -> provider -> controller, wired end to end', async () => {
    resetFakes();
    const user = fakeUser({ uid: 'uid-99' });
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = fullHappyPathFetch();
    const deviceManager = { id: 'dm-1' };

    const result = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP,
        relayWsUrl: RELAY_WS,
        sessionId: 'sess-42',
        deviceManager,
        _root: root,
        _fetch: fetchFn,
        _ProviderCtor: FakeProvider,
        _ControllerCtor: FakeController,
    });

    assert.equal(result.success, true);
    assert.equal(result.userId, 'uid-99');
    assert.equal(result.role, 'speaker');
    assert.equal(FakeProvider.instances.length, 1);
    assert.equal(FakeController.instances.length, 1);
    assert.equal(FakeProvider.instances[0].opts.url, RELAY_WS);
    assert.equal(FakeProvider.instances[0].opts.getToken(), 'participation-99');
    assert.equal(FakeController.instances[0].opts.transportProvider, result.transportProvider);
    assert.equal(FakeController.instances[0].opts.sessionId, 'sess-42');
    assert.equal(FakeController.instances[0].opts.userId, 'uid-99');

    // Confirms the provider->controller wiring the file header describes:
    // a raw transport event reaches the controller's handleTransportEvent.
    result.transportProvider.opts.onEvent('roster', { some: 'payload' });
    assert.deepEqual(result.participationController._lastEvent, { type: 'roster', msg: { some: 'payload' } });
});

test('I: a stale assertion never silently becomes a different Firebase user\'s identity — a fresh call re-derives userId from the current signed-in user, not a cached value', async () => {
    resetFakes();
    const userA = fakeUser({ uid: 'uid-A' });
    const rootA = fakeRoot(fakeAuthService({ user: userA }));
    const fetchA = makeRecordingFetch((url) => {
        if (url.endsWith('/identity/assertion')) return jsonResponse(200, { success: true, assertionToken: 'assertion-A', userId: 'uid-A' });
        if (url.endsWith('/token/uid-A')) return jsonResponse(200, { success: true, token: 'tok-A', role: 'viewer' });
        throw new Error('unexpected url ' + url);
    });
    const resultA = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-1', deviceManager: {},
        _root: rootA, _fetch: fetchA, _ProviderCtor: FakeProvider, _ControllerCtor: FakeController,
    });
    assert.equal(resultA.userId, 'uid-A');

    // A logout/user-change between calls: a fresh call for a different
    // signed-in user must produce that user's identity, never uid-A's.
    const userB = fakeUser({ uid: 'uid-B' });
    const rootB = fakeRoot(fakeAuthService({ user: userB }));
    const fetchB = makeRecordingFetch((url) => {
        if (url.endsWith('/identity/assertion')) return jsonResponse(200, { success: true, assertionToken: 'assertion-B', userId: 'uid-B' });
        if (url.endsWith('/token/uid-B')) return jsonResponse(200, { success: true, token: 'tok-B', role: 'viewer' });
        throw new Error('unexpected url ' + url);
    });
    const resultB = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-1', deviceManager: {},
        _root: rootB, _fetch: fetchB, _ProviderCtor: FakeProvider, _ControllerCtor: FakeController,
    });
    assert.equal(resultB.userId, 'uid-B');
    assert.notEqual(resultA.userId, resultB.userId);
});

test('E (composed): establishRelaySession() fails closed end to end with no signed-in Firebase user, never constructing a provider or controller', async () => {
    resetFakes();
    const root = fakeRoot(fakeAuthService({ user: null }));
    const result = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-1', deviceManager: {},
        _root: root, _fetch: makeRecordingFetch(() => jsonResponse(200, {})),
        _ProviderCtor: FakeProvider, _ControllerCtor: FakeController,
    });
    assert.equal(result.success, false);
    assert.equal(FakeProvider.instances.length, 0);
    assert.equal(FakeController.instances.length, 0);
});

test('G (composed): establishRelaySession() fails closed when the assertion endpoint rejects, never falling back to an untrusted requester identity', async () => {
    resetFakes();
    const user = fakeUser();
    const root = fakeRoot(fakeAuthService({ user }));
    const fetchFn = makeRecordingFetch(() => jsonResponse(401, { success: false, reason: 'rejected' }));
    const result = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-1', deviceManager: {},
        _root: root, _fetch: fetchFn, _ProviderCtor: FakeProvider, _ControllerCtor: FakeController,
    });
    assert.equal(result.success, false);
    assert.equal(FakeProvider.instances.length, 0);
});

test('J: backward compatibility — bridge requires explicit opts and does not alter default (no-op) behavior when unused; missing required opts fail closed with clear reasons', async () => {
    const r1 = await LiveRelayCompositionBridge.establishRelaySession({});
    assert.equal(r1.success, false);
    assert.match(r1.reason, /relayHttpUrl is required/);

    const r2 = await LiveRelayCompositionBridge.establishRelaySession({ relayHttpUrl: RELAY_HTTP });
    assert.equal(r2.success, false);
    assert.match(r2.reason, /relayWsUrl is required/);

    const r3 = await LiveRelayCompositionBridge.establishRelaySession({ relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS });
    assert.equal(r3.success, false);
    assert.match(r3.reason, /sessionId is required/);

    const r4 = await LiveRelayCompositionBridge.establishRelaySession({ relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 's1' });
    assert.equal(r4.success, false);
    assert.match(r4.reason, /deviceManager is required/);
});

test('registerAsHost path performs register-host then a separate token fetch, never fabricating a token from registration alone', async () => {
    resetFakes();
    const user = fakeUser({ uid: 'uid-host' });
    const root = fakeRoot(fakeAuthService({ user }));
    const seen = [];
    const fetchFn = makeRecordingFetch((url) => {
        seen.push(url);
        if (url.endsWith('/identity/assertion')) return jsonResponse(200, { success: true, assertionToken: 'assertion-h', userId: 'uid-host' });
        if (url.endsWith('/register-host/uid-host')) return jsonResponse(200, { success: true });
        if (url.endsWith('/token/uid-host')) return jsonResponse(200, { success: true, token: 'tok-host', role: 'host' });
        throw new Error('unexpected url ' + url);
    });
    const result = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-host', deviceManager: {}, registerAsHost: true,
        _root: root, _fetch: fetchFn, _ProviderCtor: FakeProvider, _ControllerCtor: FakeController,
    });
    assert.equal(result.success, true);
    assert.equal(result.role, 'host');
    assert.deepEqual(seen, [
        RELAY_HTTP + '/identity/assertion',
        RELAY_HTTP + '/session/sess-host/register-host/uid-host',
        RELAY_HTTP + '/session/sess-host/token/uid-host',
    ]);
});

test('establishRelaySession() fails closed when RemoteRelayTransportProvider is not loaded', async () => {
    resetFakes();
    const user = fakeUser({ uid: 'uid-99' });
    const root = fakeRoot(fakeAuthService({ user }));
    const result = await LiveRelayCompositionBridge.establishRelaySession({
        relayHttpUrl: RELAY_HTTP, relayWsUrl: RELAY_WS, sessionId: 'sess-1', deviceManager: {},
        _root: root, _fetch: fullHappyPathFetch(), _ControllerCtor: FakeController,
        // _ProviderCtor deliberately omitted, root.CozyOS has no real one either
    });
    assert.equal(result.success, false);
    assert.match(result.reason, /transport-provider\.js is not loaded/);
});
