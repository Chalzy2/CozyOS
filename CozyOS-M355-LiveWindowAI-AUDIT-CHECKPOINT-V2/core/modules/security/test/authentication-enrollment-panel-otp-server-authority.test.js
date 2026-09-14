'use strict';

/**
 * core/modules/security/test/authentication-enrollment-panel-otp-server-authority.test.js
 *
 * Domain 2 (Security & Sign-in discovery) — regression coverage for the
 * real, two-step server-authoritative TOTP enrollment flow in
 * authentication-enrollment-panel.js: begin (server issues a secret) ->
 * pending confirmation (never marked enrolled yet) -> confirm (server
 * verifies the code) -> ONLY THEN AuthEnrollmentStore.enroll(). Also
 * covers cancel, disable-via-server, the requiresAuth honest fallback to
 * the legacy OtpProvider, and that a real server rejection is never
 * masked into a fabricated success.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PANEL_PATH = path.join(__dirname, '..', 'authentication-enrollment-panel.js');
const STORE_PATH = path.join(__dirname, '..', '..', '..', 'security', 'authentication-enrollment-store.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'security', 'auth-factor-registry.js');

function freshPanel({ signedIn = 'user-1', coordinator = null, provider = null } = {}) {
    delete require.cache[require.resolve(PANEL_PATH)];
    delete require.cache[require.resolve(STORE_PATH)];
    delete require.cache[require.resolve(REGISTRY_PATH)];

    global.window = {
        CozyOS: {
            Auth: { getCurrentIdentity: () => (signedIn ? { userId: signedIn } : null) },
            AuthCoordinator: coordinator,
            OtpProvider: provider,
        },
    };
    require(REGISTRY_PATH);
    require(STORE_PATH);
    require(PANEL_PATH);
    return global.window.CozyOS.Modules['authentication-enrollment-panel'];
}

function otpCard(panel) {
    return panel.buildAllCards().find(c => c.id === 'otp');
}

// 1/2/3. begin enrollment -> pending state appears -> NOT marked enrolled.
test('otp enroll: begin returns pending, never calls AuthEnrollmentStore.enroll(), card shows Pending', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' }) };
    const panel = freshPanel({ coordinator });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(result.success, true);
    assert.equal(result.pending, true);
    assert.equal(result.secretBase32, 'JBSWY3DPEHPK3PXP');

    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);

    const card = otpCard(panel);
    assert.equal(card.enrolled, false);
    assert.equal(card.enrollmentStatus, 'Enrollment Pending — Confirm Code');
    assert.equal(card.pendingVerification.secretBase32, 'JBSWY3DPEHPK3PXP');
    assert.equal(card.canConfirmPending, true);
    assert.equal(card.canEnroll, false); // can't re-begin while a pending confirmation exists
});

// 4/5/6. confirmation code accepted -> server completion called -> ONLY
// THEN factor is marked enrolled.
test('otp confirm: real server success is the only thing that marks the factor enrolled', async () => {
    let completeCalledWith = null;
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async (code) => { completeCalledWith = code; return { available: true, recoveryCodes: ['AAAAA-BBBBB'] }; },
    };
    const panel = freshPanel({ coordinator });

    await panel.doAction('otp', 'enroll');
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);

    const result = await panel.doAction('otp', 'confirm', '123456');
    assert.equal(completeCalledWith, '123456');
    assert.equal(result.success, true);

    const record = global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp');
    assert.ok(record, 'a real enrollment record must exist only after real server confirmation');

    const card = otpCard(panel);
    assert.equal(card.enrolled, true);
    assert.equal(card.pendingVerification, null); // pending state cleared after success
});

// 7/8. invalid code / real server failure -> never marks enrolled, never masked.
test('otp confirm: invalid code from the server never marks the factor enrolled, pending state kept for retry', async () => {
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: false, code: 'invalid_mfa_code', reason: "That code didn't match. Check your authenticator app and try again." }),
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');

    const result = await panel.doAction('otp', 'confirm', '000000');
    assert.equal(result.success, false);
    assert.match(result.reason, /didn't match/);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);

    // Pending state is deliberately retained so the person can retry
    // without re-requesting a brand-new secret.
    const card = otpCard(panel);
    assert.equal(card.canConfirmPending, true);
});

// 9. cancel clears pending state.
test('otp cancel-pending: clears the pending secret without ever touching the store', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }) };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');
    assert.equal(otpCard(panel).pendingVerification.secretBase32, 'SECRET');

    const result = await panel.doAction('otp', 'cancel-pending');
    assert.equal(result.success, true);
    const card = otpCard(panel);
    assert.equal(card.pendingVerification, null);
    assert.equal(card.canEnroll, true); // free to begin again
});

// 10/11. disable uses server authority; only a real server success clears enrolled state.
test('otp remove: a server-sourced enrollment calls disableServerTotp(), removes locally only on real success', async () => {
    let disableCalled = false;
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: true, recoveryCodes: [] }),
        disableServerTotp: async () => { disableCalled = true; return { available: true, code: 'disabled' }; },
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');
    await panel.doAction('otp', 'confirm', '123456');
    assert.ok(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'));

    const result = await panel.doAction('otp', 'remove');
    assert.equal(disableCalled, true);
    assert.equal(result.success, true);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);
});

test('otp remove: a real disableServerTotp() failure does NOT clear local enrollment (no false "disabled" state)', async () => {
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: true, recoveryCodes: [] }),
        disableServerTotp: async () => ({ available: false, reason: 'Could not reach the server to disable the authenticator app. Please try again.' }),
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');
    await panel.doAction('otp', 'confirm', '123456');

    const result = await panel.doAction('otp', 'remove');
    assert.equal(result.success, false);
    assert.ok(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), 'enrollment must remain intact after a real server failure');
});

// 12. requiresAuth fallback -> honest degrade to the legacy OtpProvider,
// legacy path enrolls immediately (matches its own pre-existing,
// unchanged single-step behavior) and never claims server success.
test('otp enroll: requiresAuth fallback uses the legacy OtpProvider honestly, never claims a server enrollment', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: false, code: 'not_authenticated', requiresAuth: true, reason: 'You must be signed in.' }) };
    const provider = { enrollAccount: () => ({ success: true, accountId: 'acct-1', otpauthUri: 'otpauth://totp/legacy', secretBase32: 'LEGACYSECRET' }) };
    const panel = freshPanel({ coordinator, provider });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(result.success, true);
    assert.equal(result.pending, undefined); // legacy path enrolls immediately, no pending step
    const record = global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp');
    assert.ok(record);
    assert.equal(record.meta.source, 'legacy');
});

// A real (non-auth) server failure at begin must never fall back to the
// legacy provider — that would fabricate a client-only credential for an
// account the server never asked about.
test('otp enroll: a real (non-auth) server failure at begin is never masked by a legacy fallback', async () => {
    let legacyCalled = false;
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: false, code: 'server_unavailable', reason: 'TOTP enrollment is temporarily unavailable.' }) };
    const provider = { enrollAccount: () => { legacyCalled = true; return { success: true, accountId: 'acct-1' }; } };
    const panel = freshPanel({ coordinator, provider });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(legacyCalled, false);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'TOTP enrollment is temporarily unavailable.');
});
