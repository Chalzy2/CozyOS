'use strict';

/**
 * core/modules/identity/test/auth-coordinator-trusted-device-session-integration.test.js
 *
 * Domain 3 authority fix — integration coverage using the REAL
 * core/modules/session/cozy-session-service.js (not a mock), proving the
 * fix holds against the actual establishFromExternalAuth() contract, not
 * just a test double's assumptions about its shape.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const AUTH_COORDINATOR_PATH = path.join(__dirname, '..', 'auth-coordinator.js');
const SESSION_PATH = path.join(__dirname, '..', '..', 'session', 'cozy-session-service.js');

function freshEnv({ recoveryPolicy } = {}) {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    delete require.cache[require.resolve(SESSION_PATH)];
    global.window = { CozyOS: { AdminRecoveryPolicy: recoveryPolicy }, addEventListener: () => {} };
    global.document = undefined; // real Session module tolerates a documentless environment
    require(SESSION_PATH); // registers window.CozyOS.Session (the real engine)
    require(AUTH_COORDINATOR_PATH);
    return { AC: global.window.CozyOS.AuthCoordinator, Session: global.window.CozyOS.Session };
}

test('integration: a real local trusted-device grant establishes a real Session with an empty roles array', async () => {
    const recoveryPolicy = {
        attemptNormalLogin: async () => ({ granted: true, mode: 'trusted-device', session: { id: 's1' } }),
    };
    const { AC, Session } = freshEnv({ recoveryPolicy });

    const result = await AC.loginWithTrustedDevice({ userId: 'local-admin-1', deviceId: 'device-1' });
    assert.equal(result.granted, true);

    const snapshot = Session.current();
    assert.equal(snapshot.source, 'external');
    assert.equal(snapshot.uid, 'local-admin-1');
    assert.deepEqual(snapshot.roles, []);
    assert.equal(snapshot.roles.includes('platform-admin'), false);
});

test('integration: a real local biometric grant establishes a real Session with an empty roles array', async () => {
    const recoveryPolicy = {
        attemptBiometricLogin: async () => ({ granted: true, mode: 'biometric', session: { id: 's2' } }),
    };
    const { AC, Session } = freshEnv({ recoveryPolicy });

    const result = await AC.loginWithBiometrics({ userId: 'local-admin-2', deviceId: 'device-2' });
    assert.equal(result.granted, true);

    const snapshot = Session.current();
    assert.deepEqual(snapshot.roles, []);
});

// Mirrors cozy-workspace.js's own #resolveCurrentUserRole() logic exactly
// (roles.includes("platform-admin") || roles.includes("administrator") ->
// "admin"; else null for an unresolvable external session) to prove the
// real, observable end effect without needing to load or modify the
// protected 400KB+ cozy-workspace.js file itself.
function resolveRoleLikeWorkspaceShell(snapshot) {
    if (snapshot && snapshot.source === 'external') {
        const roles = Array.isArray(snapshot.roles) ? snapshot.roles : [];
        if (roles.includes('platform-admin') || roles.includes('administrator')) return 'admin';
        if (roles.includes('developer')) return 'developer';
        return null;
    }
    return null;
}

test('integration: WorkspaceShell\'s own role-resolution logic resolves NO role for a local-only trusted-device session', async () => {
    const recoveryPolicy = { attemptNormalLogin: async () => ({ granted: true, mode: 'trusted-device', session: { id: 's3' } }) };
    const { AC, Session } = freshEnv({ recoveryPolicy });
    await AC.loginWithTrustedDevice({ userId: 'local-admin-3', deviceId: 'device-3' });
    assert.equal(resolveRoleLikeWorkspaceShell(Session.current()), null);
});
