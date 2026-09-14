'use strict';

/**
 * core/modules/identity/test/auth-coordinator-restore-session-server-probe.test.js
 *
 * Focused tests for the CHALZYDASHBOARD-ADMIN-HANDOFF fix in
 * AuthCoordinator.restoreSession(): a real, valid server session
 * (httpOnly cozy_admin_session cookie, confirmed authenticated:true +
 * isPlatformAdmin:true by the real GET /webauthn/session endpoint) must
 * still be restorable even when NO local pointer exists at all (new
 * tab, cleared/private-adjacent storage, direct navigation) — because
 * the pointer was never the actual authority, the server was.
 *
 * A real browser/cookie/production server is not available in this
 * environment. These tests prove the coordinator's own logic using a
 * controlled `fetch` double standing in for GET /webauthn/session —
 * exactly the same posture auth-coordinator-server-passkey.test.js
 * already uses for the sibling loginWithServerPasskey() endpoint. They
 * do NOT verify the actual production symptom against cozyos.org; that
 * requires real browser/session evidence this environment cannot
 * produce (see this milestone's report — INFERRED, not VERIFIED,
 * against production).
 *
 * Run: node --test core/modules/identity/test/auth-coordinator-restore-session-server-probe.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const AUTH_COORDINATOR_PATH = path.join(__dirname, '..', 'auth-coordinator.js');

function freshCoordinator() {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    global.window = { CozyOS: {} };
    require(AUTH_COORDINATOR_PATH);
    return global.window.CozyOS.AuthCoordinator;
}

/** No localStorage/sessionStorage attached at all — the exact real
 *  condition of a brand-new tab/private-adjacent context with zero
 *  local state, even though a real cookie may still be valid. */
function ensureNoStorage() {
    delete global.window.localStorage;
    delete global.window.sessionStorage;
}

function installSessionFake() {
    const calls = [];
    global.window.CozyOS.Session = {
        establishFromExternalAuth(profile) { calls.push(profile); this.current_ = { source: 'external', uid: profile.uid, roles: profile.roles }; },
        current() { return this.current_ || null; },
        isSignedIn() { return !!this.current_; },
    };
    return calls;
}

function installFetch(responder) {
    global.fetch = async (url, opts) => {
        assert.equal(url, '/webauthn/session');
        assert.equal(opts.credentials, 'include');
        const { status, json } = responder();
        return { status, json: async () => json };
    };
}

test('restoreSession(): no local pointer at all + a real, valid server session -> restores via the server probe, fails no earlier than before', async () => {
    const AC = freshCoordinator();
    ensureNoStorage();
    const established = installSessionFake();
    installFetch(() => ({ status: 200, json: { authenticated: true, isPlatformAdmin: true, email: 'chalzowuor516@gmail.com' } }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, true, 'a real, valid cookie-based session with no local pointer must still restore');
    assert.equal(result.source, 'server');
    assert.equal(result.email, 'chalzowuor516@gmail.com');
    assert.equal(established.length, 1);
    assert.equal(established[0].uid, 'chalzowuor516@gmail.com');
    assert.deepEqual(established[0].roles, ['platform-admin']);
    assert.equal(global.window.CozyOS.Session.current().source, 'external', 'downstream M-IDGATE check in cozy-login-gate.js relies on exactly this');
});

test('restoreSession(): no local pointer + server genuinely reports not authenticated -> still fails closed (no weakening)', async () => {
    const AC = freshCoordinator();
    ensureNoStorage();
    const established = installSessionFake();
    installFetch(() => ({ status: 200, json: { authenticated: false } }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, false);
    assert.equal(result.reason, 'No persisted session pointer.');
    assert.equal(established.length, 0, 'no session may be established when the server does not confirm authentication');
});

test('restoreSession(): no local pointer + server unreachable -> fails closed, does not throw', async () => {
    const AC = freshCoordinator();
    ensureNoStorage();
    installSessionFake();
    global.fetch = async () => { throw new Error('network down'); };

    const result = await AC.restoreSession();

    assert.equal(result.restored, false);
    assert.equal(result.reason, 'No persisted session pointer.');
});

test('restoreSession(): no local pointer + authenticated:true but isPlatformAdmin:false -> restores as a real non-admin session, never fabricates admin', async () => {
    const AC = freshCoordinator();
    ensureNoStorage();
    const established = installSessionFake();
    installFetch(() => ({ status: 200, json: { authenticated: true, isPlatformAdmin: false, email: 'ordinary@example.com' } }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, true);
    assert.deepEqual(established[0].roles, [], 'must never grant platform-admin when the server did not report it');
});

test('restoreSession(): pointer-based "server" branch (existing behavior) is unchanged by the shared-helper refactor', async () => {
    const AC = freshCoordinator();
    const store = new Map();
    global.window.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
    // Simulate a pointer already persisted by a real prior server login
    // (#finishServerLogin()) in this same browser/tab.
    store.set('cozyos.authCoordinator.session', JSON.stringify({ source: 'server', email: 'admin@example.com', since: new Date().toISOString() }));
    const established = installSessionFake();
    installFetch(() => ({ status: 200, json: { authenticated: true, isPlatformAdmin: true, email: 'admin@example.com' } }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, true);
    assert.equal(result.source, 'server');
    assert.equal(established[0].uid, 'admin@example.com');
});
