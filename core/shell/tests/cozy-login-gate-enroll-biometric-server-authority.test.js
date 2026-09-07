'use strict';

/**
 * core/shell/tests/cozy-login-gate-enroll-biometric-server-authority.test.js
 *
 * Domain-1 discovery completion (Security & Sign-in, Phase 1A). Regression
 * coverage for enrollBiometricCredential() — the real, shared function
 * that replaced the direct legacy WebAuthnProvider.registerCredential()
 * call inside offerBiometricEnrollmentIfEligible()'s "Enable" handler,
 * and that cozy-admin-recovery-wizard.js's new-device biometric step now
 * also calls via window.CozyOS.LoginGate.enrollBiometricCredential.
 *
 * Covers exactly the two real call contexts found during discovery:
 *   1. Post-loginWithServerPassword() — a real cozy_admin_session exists
 *      -> AuthCoordinator.registerServerPasskey() must be used, and a
 *      real ceremony failure must never be masked by a legacy fallback.
 *   2. Post-loginWithCredentials()/local registration — no server
 *      session exists for this identity at all -> honest fallback to the
 *      legacy WebAuthnProvider, which is that account's only real track.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const GATE_PATH = path.join(__dirname, '..', 'cozy-login-gate.js');

function freshGate({ coordinator = null, provider = null } = {}) {
    delete require.cache[require.resolve(GATE_PATH)];
    global.window = {
        CozyOS: {
            AuthCoordinator: coordinator,
            WebAuthnProvider: provider,
        },
    };
    require(GATE_PATH);
    return global.window.CozyOS.LoginGate;
}

// 1. Real server session (registerServerPasskey succeeds) -> used, legacy never touched.
test('enrollBiometricCredential: prefers server-authoritative registration and never calls legacy provider when it succeeds', async () => {
    let serverCalled = false;
    let legacyCalled = false;
    const coordinator = { registerServerPasskey: async () => { serverCalled = true; return { available: true }; } };
    const provider = { registerCredential: async () => { legacyCalled = true; return { success: true }; } };
    const gate = freshGate({ coordinator, provider });

    const result = await gate.enrollBiometricCredential('user-1');
    assert.equal(serverCalled, true);
    assert.equal(legacyCalled, false);
    assert.equal(result.success, true);
    assert.equal(result.source, 'server');
});

// 2. Real server session exists but the real ceremony fails for a real
//    reason (not "no session") -> must NOT fall back to the legacy
//    provider (that would fabricate a client-only credential for an
//    account the server never asked about).
test('enrollBiometricCredential: real non-auth server failure is never masked by a legacy fallback', async () => {
    let legacyCalled = false;
    const coordinator = { registerServerPasskey: async () => ({ available: false, code: 'webauthn_ceremony_failed', reason: 'Real WebAuthn registration failed.' }) };
    const provider = { registerCredential: async () => { legacyCalled = true; return { success: true }; } };
    const gate = freshGate({ coordinator, provider });

    const result = await gate.enrollBiometricCredential('user-1');
    assert.equal(legacyCalled, false);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'Real WebAuthn registration failed.');
});

// 3. No server session exists for this identity (requiresAuth:true) ->
//    honest fallback to the legacy, local-only track.
test('enrollBiometricCredential: falls back to legacy provider only when the server honestly reports no session (requiresAuth)', async () => {
    const coordinator = { registerServerPasskey: async () => ({ available: false, code: 'not_authenticated', requiresAuth: true, reason: 'You must be signed in.' }) };
    const provider = { registerCredential: async () => ({ success: true }) };
    const gate = freshGate({ coordinator, provider });

    const result = await gate.enrollBiometricCredential('local-user-1');
    assert.equal(result.success, true);
    assert.equal(result.source, 'legacy');
});

// 4. Coordinator not loaded at all -> honest degrade straight to legacy.
test('enrollBiometricCredential: degrades to legacy provider when AuthCoordinator is not loaded', async () => {
    const provider = { registerCredential: async () => ({ success: true }) };
    const gate = freshGate({ coordinator: null, provider });

    const result = await gate.enrollBiometricCredential('local-user-2');
    assert.equal(result.success, true);
    assert.equal(result.source, 'legacy');
});

// 5. Neither path available -> honest failure, never a fabricated success.
test('enrollBiometricCredential: neither coordinator nor legacy provider loaded -> honest failure', async () => {
    const gate = freshGate({ coordinator: null, provider: null });
    const result = await gate.enrollBiometricCredential('user-3');
    assert.equal(result.success, false);
    assert.match(result.reason, /Neither AuthCoordinator\.registerServerPasskey\(\) nor the legacy WebAuthnProvider is loaded\./);
});

// 6. Legacy path itself reports a real failure -> relayed honestly, not swallowed.
test('enrollBiometricCredential: a real legacy-provider failure (no server session case) is relayed honestly', async () => {
    const coordinator = { registerServerPasskey: async () => ({ available: false, requiresAuth: true }) };
    const provider = { registerCredential: async () => ({ success: false, reason: 'WebAuthn is not supported by this browser.' }) };
    const gate = freshGate({ coordinator, provider });

    const result = await gate.enrollBiometricCredential('local-user-3');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'WebAuthn is not supported by this browser.');
});

// 7. The function is exposed on the public, frozen LoginGate object so
//    other real callers (e.g. cozy-admin-recovery-wizard.js) can reuse it.
test('enrollBiometricCredential is exposed on window.CozyOS.LoginGate for reuse by other real callers', () => {
    const gate = freshGate({ coordinator: null, provider: null });
    assert.equal(typeof gate.enrollBiometricCredential, 'function');
});
