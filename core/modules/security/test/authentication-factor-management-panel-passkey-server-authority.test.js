'use strict';

/**
 * core/modules/security/test/authentication-factor-management-panel-passkey-server-authority.test.js
 *
 * Domain-1 discovery fix (Security & Sign-in, Phase 1A) — first-ever test
 * for authentication-factor-management-panel.js's passkeyEnroll() path
 * (confirmed by repo-wide search before writing this: no test file
 * existed for this panel at all). Covers exactly the duplicate-authority
 * gap the discovery found: this panel used to call ONLY the legacy
 * client-side WebAuthnProvider.registerCredential(), which never talks
 * to the real server RP (server/webauthn-rp/rp.js) — so AuthEnrollmentStore
 * could record a passkey as "enrolled" that the real server-authoritative
 * login path (AuthCoordinator.loginWithServerPasskey()) would never
 * recognize. These tests assert the fixed behavior: prefer
 * AuthCoordinator.registerServerPasskey() when it is loaded, and fall
 * back to the legacy provider only when the coordinator truly isn't
 * present — the same pattern already proven in
 * authentication-enrollment-panel.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PANEL_PATH = path.join(__dirname, '..', 'authentication-factor-management-panel.js');
const STORE_PATH = path.join(__dirname, '..', '..', '..', 'security', 'authentication-enrollment-store.js');

function freshPanel({ signedIn = 'user-1', coordinator = null, provider = null } = {}) {
    delete require.cache[require.resolve(PANEL_PATH)];
    delete require.cache[require.resolve(STORE_PATH)];

    global.window = {
        CozyOS: {
            Auth: { getCurrentIdentity: () => (signedIn ? { userId: signedIn } : null) },
            AuthCoordinator: coordinator,
            WebAuthnProvider: provider,
        },
    };
    require(STORE_PATH);
    require(PANEL_PATH);
    return global.window.CozyOS.Modules['authentication-factor-management-panel'];
}

// 1. Server-authoritative coordinator present -> must be preferred, and
//    the legacy provider must never be touched (proves no duplicate
//    verification authority is exercised when the real one is available).
test('passkey enroll: prefers AuthCoordinator.registerServerPasskey() and never calls legacy WebAuthnProvider', async () => {
    let serverCalled = false;
    let legacyCalled = false;
    const coordinator = {
        registerServerPasskey: async () => {
            serverCalled = true;
            return { available: true, credentialId: 'cred-123', nickname: 'My Device' };
        },
    };
    const provider = {
        registerCredential: async () => { legacyCalled = true; return { success: true }; },
    };
    const panel = freshPanel({ coordinator, provider });
    const result = await panel.doAction('security-key', 'enroll');

    assert.equal(serverCalled, true);
    assert.equal(legacyCalled, false);
    assert.equal(result.success, true);
});

// 2. Server path reports a real, honest failure (e.g. not signed in /
//    server unavailable) -> the panel must relay that failure, never
//    silently fall back to a locally-fabricated success.
test('passkey enroll: honest server failure is relayed, never masked by a legacy fallback success', async () => {
    let legacyCalled = false;
    const coordinator = {
        registerServerPasskey: async () => ({ available: false, code: 'not_authenticated', reason: 'You must be signed in.' }),
    };
    const provider = {
        registerCredential: async () => { legacyCalled = true; return { success: true }; },
    };
    const panel = freshPanel({ coordinator, provider });
    const result = await panel.doAction('security-key', 'enroll');

    assert.equal(legacyCalled, false);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'You must be signed in.');
});

// 3. No coordinator loaded at all -> honest degrade to the legacy
//    provider (older page that hasn't picked up the fix yet), not a
//    thrown error.
test('passkey enroll: falls back to legacy WebAuthnProvider only when AuthCoordinator is not loaded', async () => {
    const provider = {
        registerCredential: async () => ({ success: true }),
    };
    const panel = freshPanel({ coordinator: null, provider });
    const result = await panel.doAction('security-key', 'enroll');
    assert.equal(result.success, true);
});

// 4. Neither the server coordinator nor the legacy provider is loaded ->
//    honest failure, never a fabricated success.
test('passkey enroll: neither coordinator nor legacy provider loaded -> honest failure', async () => {
    const panel = freshPanel({ coordinator: null, provider: null });
    const result = await panel.doAction('security-key', 'enroll');
    assert.equal(result.success, false);
    assert.match(result.reason, /Neither AuthCoordinator\.registerServerPasskey\(\) nor the legacy WebAuthnProvider is loaded\./);
});

// 5. buildPasskeyCard(): canEnroll must be true when only the server
//    coordinator is present (no legacy provider at all) — proves the
//    card's availability check was updated alongside the enroll fix.
test('buildPasskeyCard(): canEnroll is true from the server coordinator alone, with no legacy provider loaded', () => {
    const coordinator = { registerServerPasskey: async () => ({ available: true }) };
    const panel = freshPanel({ coordinator, provider: null });
    const card = panel.buildPasskeyCard('user-1');
    assert.equal(card.canEnroll, true);
    assert.equal(card.enrollUnavailableReason, null);
});
