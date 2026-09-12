'use strict';

/**
 * core/modules/identity/test/auth-coordinator-trusted-device-authority-fix.test.js
 *
 * Domain 3 (Security & Sign-in discovery) — the authority fix. Discovery
 * found that AuthCoordinator.loginWithTrustedDevice()/loginWithBiometrics()
 * reported roles:["platform-admin"] into CozyOS.Session.
 * establishFromExternalAuth() based ENTIRELY on local evidence
 * (IdentityEngine's own client-side isPlatformAdmin(), TrustedDeviceManager's
 * admittedly-spoofable browser fingerprint, and — for biometrics — the
 * legacy client-only WebAuthnProvider). CozyOS has exactly one declared
 * deployment (server-backed) and no evidence of an intentional
 * standalone/local admin mode, so this local evidence must never produce
 * a platform-admin-shaped externally established session.
 *
 * These tests prove: the real local checks still run and still gate the
 * result (attemptNormalLogin/attemptBiometricLogin failures still fail
 * closed exactly as before); a real local grant still establishes a
 * signed-in external session (identity continuity preserved); but that
 * session's roles array is always empty — never platform-admin — and the
 * returned result explicitly reports platformAdmin:false.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const AUTH_COORDINATOR_PATH = path.join(__dirname, '..', 'auth-coordinator.js');

function freshCoordinator({ recoveryPolicy = null, session = null } = {}) {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    global.window = {
        CozyOS: {
            AdminRecoveryPolicy: recoveryPolicy,
            Session: session,
            // Poisoned legacy paths this fix must never need to touch.
            IdentityEngine: {
                isPlatformAdmin() { throw new Error('FORBIDDEN: this fix does not call IdentityEngine directly — AdminRecoveryPolicy already did its own real check.'); },
            },
        },
    };
    require(AUTH_COORDINATOR_PATH);
    return global.window.CozyOS.AuthCoordinator;
}

function fakeSession() {
    const calls = [];
    return {
        calls,
        establishFromExternalAuth(profile) { calls.push(profile); return { source: 'external', uid: profile.uid, roles: profile.roles || [] }; },
    };
}

// ---- loginWithTrustedDevice ----

test('loginWithTrustedDevice: a real local grant NEVER reports platform-admin (or any) role to Session', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        attemptNormalLogin: async ({ userId, deviceId }) => {
            assert.equal(userId, 'local-admin-1');
            assert.equal(deviceId, 'device-1');
            return { granted: true, mode: 'trusted-device', session: { id: 'adminrec_123' } };
        },
    };
    const AC = freshCoordinator({ recoveryPolicy, session });

    const result = await AC.loginWithTrustedDevice({ userId: 'local-admin-1', deviceId: 'device-1' });

    assert.equal(result.granted, true);
    assert.equal(result.platformAdmin, false);
    assert.equal(session.calls.length, 1);
    assert.deepEqual(session.calls[0].roles, []);
    assert.equal(session.calls[0].uid, 'local-admin-1');
    assert.equal(session.calls[0].profile.serverVerified, false);
});

test('loginWithTrustedDevice: the real local device-trust check still runs and can still fail closed', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        attemptNormalLogin: async () => ({ granted: false, reason: 'trusted-device verification failed.' }),
    };
    const AC = freshCoordinator({ recoveryPolicy, session });

    const result = await AC.loginWithTrustedDevice({ userId: 'x', deviceId: 'y' });
    assert.equal(result.granted, false);
    assert.equal(result.reason, 'trusted-device verification failed.');
    assert.equal(session.calls.length, 0, 'a real failure must never establish any session');
});

test('loginWithTrustedDevice: AdminRecoveryPolicy not loaded -> honest failure, no session established', async () => {
    const session = fakeSession();
    const AC = freshCoordinator({ recoveryPolicy: null, session });
    const result = await AC.loginWithTrustedDevice({ userId: 'x', deviceId: 'y' });
    assert.equal(result.granted, false);
    assert.equal(session.calls.length, 0);
});

// ---- loginWithBiometrics ----

test('loginWithBiometrics: a real local grant NEVER reports platform-admin (or any) role to Session', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        attemptBiometricLogin: async ({ userId, deviceId }) => {
            assert.equal(userId, 'local-admin-1');
            assert.equal(deviceId, 'device-1');
            return { granted: true, mode: 'biometric', session: { id: 'adminrec_456' } };
        },
    };
    const AC = freshCoordinator({ recoveryPolicy, session });

    const result = await AC.loginWithBiometrics({ userId: 'local-admin-1', deviceId: 'device-1' });

    assert.equal(result.granted, true);
    assert.equal(result.platformAdmin, false);
    assert.equal(session.calls.length, 1);
    assert.deepEqual(session.calls[0].roles, []);
    assert.equal(session.calls[0].profile.serverVerified, false);
});

test('loginWithBiometrics: the real local biometric/device check still runs and can still fail closed', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        attemptBiometricLogin: async () => ({ granted: false, reason: 'Biometric verification failed.' }),
    };
    const AC = freshCoordinator({ recoveryPolicy, session });

    const result = await AC.loginWithBiometrics({ userId: 'x', deviceId: 'y' });
    assert.equal(result.granted, false);
    assert.equal(result.reason, 'Biometric verification failed.');
    assert.equal(session.calls.length, 0);
});

test('loginWithBiometrics: AdminRecoveryPolicy missing attemptBiometricLogin -> honest failure', async () => {
    const session = fakeSession();
    const AC = freshCoordinator({ recoveryPolicy: {}, session });
    const result = await AC.loginWithBiometrics({ userId: 'x', deviceId: 'y' });
    assert.equal(result.granted, false);
    assert.equal(session.calls.length, 0);
});

// ---- restoreSession() for a persisted admin-recovery pointer ----
// The same local-only evidence problem exists on reload: a previously
// established admin-recovery session is restored from a persisted
// pointer, not re-verified — so it must not re-grant platform-admin
// either.

function fakeLocalStorage(initial) {
    const store = new Map(Object.entries(initial || {}));
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
    };
}

test('restoreSession(): a persisted admin-recovery pointer is restored WITHOUT re-granting platform-admin', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        listAdminSessions: (userId) => {
            assert.equal(userId, 'local-admin-1');
            return [{ id: 'adminrec_123', revoked: false, authMode: 'trusted-device' }];
        },
    };
    const AC = freshCoordinator({ recoveryPolicy, session });
    global.window.localStorage = fakeLocalStorage({
        'cozyos.authCoordinator.session': JSON.stringify({ source: 'admin-recovery', userId: 'local-admin-1', deviceId: 'device-1', adminSessionId: 'adminrec_123', since: new Date().toISOString() }),
    });

    const result = await AC.restoreSession();
    assert.equal(result.restored, true);
    assert.equal(result.platformAdmin, false);
    assert.equal(session.calls.length, 1);
    assert.deepEqual(session.calls[0].roles, []);
    assert.equal(session.calls[0].profile.serverVerified, false);
});

test('restoreSession(): a revoked admin-recovery pointer restores nothing and establishes no session', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        listAdminSessions: () => [{ id: 'adminrec_123', revoked: true, authMode: 'trusted-device' }],
    };
    const AC = freshCoordinator({ recoveryPolicy, session });
    global.window.localStorage = fakeLocalStorage({
        'cozyos.authCoordinator.session': JSON.stringify({ source: 'admin-recovery', userId: 'local-admin-1', deviceId: 'device-1', adminSessionId: 'adminrec_123', since: new Date().toISOString() }),
    });

    const result = await AC.restoreSession();
    assert.equal(result.restored, false);
    assert.equal(session.calls.length, 0);
});



test('invariant: no client-only path can manufacture platform-admin authority via establishFromExternalAuth()', async () => {
    const session = fakeSession();
    const recoveryPolicy = {
        attemptNormalLogin: async () => ({ granted: true, mode: 'trusted-device', session: { id: 's1' } }),
        attemptBiometricLogin: async () => ({ granted: true, mode: 'biometric', session: { id: 's2' } }),
    };
    const AC = freshCoordinator({ recoveryPolicy, session });

    await AC.loginWithTrustedDevice({ userId: 'u1', deviceId: 'd1' });
    await AC.loginWithBiometrics({ userId: 'u2', deviceId: 'd2' });

    for (const call of session.calls) {
        assert.ok(Array.isArray(call.roles), 'roles must always be a real array, never omitted in a way that could default elsewhere');
        assert.equal(call.roles.includes('platform-admin'), false);
        assert.equal(call.roles.length, 0);
    }
});
