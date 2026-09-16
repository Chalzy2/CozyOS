'use strict';

/**
 * core/modules/identity/test/stale-session-blank-admin-investigation.test.js
 *
 * PHASE 3 — stale-session / blank-administrator investigation.
 *
 * Proves the specific properties the investigation brief requires,
 * beyond what auth-coordinator-restore-session-server-probe.test.js
 * already covers (the "no pointer -> server probe" CHALZYDASHBOARD-
 * ADMIN-HANDOFF fix). This file focuses on the THREE-WAY separation
 * between:
 *   - "identity"      pointer source: IdentityEngine's local, in-memory,
 *                      per-browser-session user store (never platform-
 *                      admin - ordinary users only)
 *   - "admin-recovery" pointer source: local-only device/biometric trust,
 *                      explicitly never re-grants platform-admin on
 *                      restore (see auth-coordinator.js's own comment,
 *                      "Domain 3 authority fix")
 *   - "server"        pointer source: the ONLY path that can ever
 *                      establish isPlatformAdmin:true, and only by
 *                      re-asking the real server (GET /webauthn/session)
 *                      every time - never trusting a locally cached flag
 *
 * A "blank/stale administrator" symptom is exactly what you would see
 * if a stale "identity" or "admin-recovery" pointer were ever mistaken
 * for a real admin session — these tests prove that cannot happen.
 *
 * Run: node --test core/modules/identity/test/stale-session-blank-admin-investigation.test.js
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

function installMemoryStorage() {
    const store = new Map();
    const api = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
    global.window.localStorage = api;
    global.window.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    return { store, api };
}

function installSessionFake() {
    const calls = [];
    global.window.CozyOS.Session = {
        establishFromExternalAuth(profile) { calls.push({ method: 'externalAuth', profile }); this.current_ = { source: 'external', uid: profile.uid, roles: profile.roles }; },
        establishFromIdentity(sessionId) { calls.push({ method: 'fromIdentity', sessionId }); this.current_ = { source: 'identity', sessionId }; },
        current() { return this.current_ || null; },
        isSignedIn() { return !!this.current_; },
    };
    return calls;
}

function installIdentityFake({ validateResult, restoreForPointerResult } = {}) {
    global.window.CozyOS.IdentityEngine = {
        validateSession: () => validateResult || { valid: false, reason: 'Session not found.' },
        restoreSessionForTrustedPointer: () => restoreForPointerResult || { available: false, reason: 'no user' },
    };
}

function installRecoveryPolicyFake({ stillActive = null } = {}) {
    global.window.CozyOS.AdminRecoveryPolicy = {
        listAdminSessions: () => (stillActive ? [stillActive] : []),
    };
}

// ---- E: a stale session cannot manufacture administrator privileges ----

test('E: a STALE "identity" pointer, even if IdentityEngine can restore a fresh local session for it, NEVER establishes platform-admin - restoreSessionForTrustedPointer only ever composes establishFromIdentity(), never establishFromExternalAuth() with an admin role', async () => {
    const AC = freshCoordinator();
    const { api } = installMemoryStorage();
    const established = installSessionFake();
    installIdentityFake({
        validateResult: { valid: false, reason: 'Session not found.' },
        restoreForPointerResult: { available: true, sessionId: 'new-local-session-1', userId: 'local-user-1' },
    });
    api.setItem('cozyos.authCoordinator.session', JSON.stringify({ source: 'identity', sessionId: 'stale-session-id', userId: 'local-user-1', since: new Date().toISOString() }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, true);
    assert.equal(result.source, 'identity');
    assert.equal(established.length, 1);
    assert.equal(established[0].method, 'fromIdentity', 'a restored local/"identity" session must never be established via establishFromExternalAuth() with an admin role - it has no way to carry one');
});

test('E: a STALE "admin-recovery" pointer whose session is no longer active is rejected outright, and the stale pointer is cleared', async (t) => {
    const AC = freshCoordinator();
    const { api, store } = installMemoryStorage();
    installSessionFake();
    installRecoveryPolicyFake({ stillActive: null }); // the underlying admin session was revoked/does not exist

    api.setItem('cozyos.authCoordinator.session', JSON.stringify({ source: 'admin-recovery', userId: 'admin-1', adminSessionId: 'revoked-session', since: new Date().toISOString() }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, false);
    assert.match(result.reason, /no longer active/i);
    assert.equal(store.has('cozyos.authCoordinator.session'), false, 'a stale, no-longer-active recovery pointer must be cleared, not left to be retried indefinitely');
});

test('E: even a STILL-ACTIVE "admin-recovery" pointer restore never grants platform-admin (Domain 3 authority fix) - roles is always empty for this source', async () => {
    const AC = freshCoordinator();
    const { api } = installMemoryStorage();
    const established = installSessionFake();
    installRecoveryPolicyFake({ stillActive: { id: 'active-recovery-1', revoked: false, authMode: 'biometric' } });

    api.setItem('cozyos.authCoordinator.session', JSON.stringify({ source: 'admin-recovery', userId: 'admin-1', adminSessionId: 'active-recovery-1', since: new Date().toISOString() }));

    const result = await AC.restoreSession();

    assert.equal(result.restored, true);
    assert.equal(result.platformAdmin, false, 'admin-recovery restore must never itself claim platform-admin - only a real "server" source may');
    assert.equal(established.length, 1);
    assert.deepEqual(established[0].profile.roles, [], 'roles must be empty - device/biometric trust is not the same as server-verified platform-admin authorization');
});

// ---- G: logging into another account does not retain the previous identity ----

test('G: switching from a stale "identity" pointer to a fresh, real server login clears the old pointer entirely - no residual local-user data survives', async () => {
    const AC = freshCoordinator();
    const { api } = installMemoryStorage();
    installSessionFake();

    // Simulate an old, pre-existing local pointer left over from a
    // PRIOR ordinary-user session on this browser/device.
    api.setItem('cozyos.authCoordinator.session', JSON.stringify({ source: 'identity', sessionId: 'old-local-session', userId: 'old-ordinary-user', since: new Date(Date.now() - 999999).toISOString() }));

    global.fetch = async (url) => {
        assert.equal(url, '/auth/login');
        return { status: 200, ok: true, json: async () => ({ ok: true, isPlatformAdmin: true }) };
    };

    // A fresh, real admin login (loginWithServerPassword's own real
    // persistPointer call) must overwrite - not merge with - any prior
    // pointer for a completely different account.
    const loginResult = await AC.loginWithServerPassword('chalzowuor516@gmail.com', 'irrelevant-in-this-mock', { rememberMe: true });
    assert.equal(loginResult.available, true);
    assert.equal(loginResult.isPlatformAdmin, true);

    const storedPointer = JSON.parse(api.getItem('cozyos.authCoordinator.session'));
    assert.equal(storedPointer.source, 'server');
    assert.notEqual(storedPointer.userId, 'old-ordinary-user', 'the previous, unrelated local user must not survive as part of the new pointer');
});

// ---- J: a missing session produces the intended state, not a misleading blank admin ----

test('J: a genuinely missing/absent session (no pointer, server says not authenticated) never fabricates ANY identity, blank or otherwise', async () => {
    const AC = freshCoordinator();
    installMemoryStorage();
    const established = installSessionFake();
    global.fetch = async () => ({ status: 200, json: async () => ({ authenticated: false }) });

    const result = await AC.restoreSession();

    assert.equal(result.restored, false);
    assert.equal(established.length, 0, 'no session object may be established at all - not even a blank/empty one - when nothing is genuinely authenticated');
    assert.equal(global.window.CozyOS.Session.current(), null);
});

test('J: an unreachable server during restore fails closed honestly (generic, non-fabricating reason), never a silent blank admin fallback', async () => {
    const AC = freshCoordinator();
    installMemoryStorage();
    const established = installSessionFake();
    global.fetch = async () => { throw new Error('network unreachable'); };

    const result = await AC.restoreSession();

    assert.equal(result.restored, false);
    // Real, existing behavior: restoreSession() folds tryServerRestore()'s
    // own more specific failure reason into this one generic message for
    // the no-pointer path - honest either way (never fabricates a
    // session), just less granular than the pointer-based "server"
    // branch's own reason. Confirmed via direct code reading, not assumed.
    assert.equal(result.reason, 'No persisted session pointer.');
    assert.equal(established.length, 0);
});

// ---- K: current-user display data comes from the authenticated identity ----

test('K: the established session profile carries the REAL server email, never a placeholder/"Unknown" value, when the server responds with a real email', async () => {
    const AC = freshCoordinator();
    installMemoryStorage();
    const established = installSessionFake();
    global.fetch = async () => ({ status: 200, json: async () => ({ authenticated: true, isPlatformAdmin: true, email: 'chalzowuor516@gmail.com' }) });

    await AC.restoreSession();

    assert.equal(established.length, 1);
    assert.equal(established[0].profile.uid, 'chalzowuor516@gmail.com');
    assert.equal(established[0].profile.profile.email, 'chalzowuor516@gmail.com');
    assert.notEqual(established[0].profile.uid, 'Unknown', 'the real CHALZYDASHBOARD-ADMIN-HANDOFF regression this class of bug describes must not recur');
});

console.log('Stale-Session / Blank-Administrator investigation suite: run complete.');
