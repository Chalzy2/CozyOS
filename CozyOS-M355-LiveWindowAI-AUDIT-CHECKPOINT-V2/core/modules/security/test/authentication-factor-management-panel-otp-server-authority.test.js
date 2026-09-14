'use strict';

/**
 * core/modules/security/test/authentication-factor-management-panel-otp-server-authority.test.js
 *
 * Domain 2 (Security & Sign-in discovery) — regression coverage for the
 * real, two-step server-authoritative TOTP flow in
 * authentication-factor-management-panel.js: mirrors
 * authentication-enrollment-panel-otp-server-authority.test.js's coverage
 * for this panel's own independent otpEnroll()/otpConfirm()/
 * otpCancelPending()/otpRemove() implementation (a separate, also-live
 * production surface per this domain's discovery — both panels are
 * loaded on admin-workspace.html and both needed the same fix).
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
            OtpProvider: provider,
        },
    };
    require(STORE_PATH);
    require(PANEL_PATH);
    return global.window.CozyOS.Modules['authentication-factor-management-panel'];
}

// 1/2/3. begin -> pending, not enrolled yet.
test('otp enroll: begin returns pending, never enrolls the store', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }) };
    const panel = freshPanel({ coordinator });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(result.success, true);
    assert.equal(result.pending, true);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);

    const card = panel.buildOtpCard('user-1');
    assert.equal(card.enrolled, false);
    assert.equal(card.pendingVerification.secretBase32, 'SECRET');
    assert.equal(card.canEnroll, false);
});

// 4/5/6. confirm -> real server success is the only thing that enrolls.
test('otp confirm: only a real server success enrolls the factor', async () => {
    let completeCalledWith = null;
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async (code) => { completeCalledWith = code; return { available: true, recoveryCodes: ['A-B'] }; },
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');

    const result = await panel.doAction('otp', 'confirm', null, null, '654321');
    assert.equal(completeCalledWith, '654321');
    assert.equal(result.success, true);
    const record = global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp');
    assert.ok(record);
    assert.equal(record.meta.source, 'server');

    const card = panel.buildOtpCard('user-1');
    assert.equal(card.enrolled, true);
    assert.equal(card.pendingVerification, null);
});

// 7/8. invalid/real server failure never enrolls.
test('otp confirm: a real server rejection never enrolls the factor, pending kept for retry', async () => {
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: false, code: 'invalid_mfa_code', reason: "That code didn't match. Check your authenticator app and try again." }),
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');

    const result = await panel.doAction('otp', 'confirm', null, null, '000000');
    assert.equal(result.success, false);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);
    assert.ok(panel.buildOtpCard('user-1').pendingVerification, 'pending state retained for retry');
});

// 9. cancel clears pending state without touching the store.
test('otp cancel-pending: clears pending, never touches the store', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }) };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');

    const result = await panel.doAction('otp', 'cancel-pending');
    assert.equal(result.success, true);
    const card = panel.buildOtpCard('user-1');
    assert.equal(card.pendingVerification, null);
    assert.equal(card.canEnroll, true);
});

// 10/11. remove uses server authority; only real success clears local state.
test('otp remove: server-sourced enrollment calls disableServerTotp(), clears locally only on real success', async () => {
    let disableCalled = false;
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: true, recoveryCodes: [] }),
        disableServerTotp: async () => { disableCalled = true; return { available: true, code: 'disabled' }; },
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');
    await panel.doAction('otp', 'confirm', null, null, '123456');

    const result = await panel.doAction('otp', 'remove');
    assert.equal(disableCalled, true);
    assert.equal(result.success, true);
    assert.equal(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), null);
});

test('otp remove: a real disableServerTotp() failure leaves the local enrollment intact', async () => {
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: true, secretBase32: 'SECRET', otpauthUri: 'otpauth://totp/x' }),
        completeServerTotpEnrollment: async () => ({ available: true, recoveryCodes: [] }),
        disableServerTotp: async () => ({ available: false, reason: 'Could not reach the server.' }),
    };
    const panel = freshPanel({ coordinator });
    await panel.doAction('otp', 'enroll');
    await panel.doAction('otp', 'confirm', null, null, '123456');

    const result = await panel.doAction('otp', 'remove');
    assert.equal(result.success, false);
    assert.ok(global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp'), 'must remain enrolled after a real server failure');
});

// 12. requiresAuth fallback -> honest legacy path, immediate enroll
// (matches its own pre-existing, unchanged single-step behavior).
test('otp enroll: requiresAuth fallback enrolls via the legacy OtpProvider honestly', async () => {
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: false, code: 'not_authenticated', requiresAuth: true }) };
    const provider = { enrollAccount: () => ({ success: true, accountId: 'acct-1', otpauthUri: 'otpauth://totp/legacy', secretBase32: 'LEGACYSECRET' }) };
    const panel = freshPanel({ coordinator, provider });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(result.success, true);
    assert.equal(result.pending, undefined);
    const record = global.window.CozyOS.AuthEnrollmentStore.getEnrollment('user-1', 'otp');
    assert.ok(record);
    assert.equal(record.meta.source, 'legacy');
});

// A real (non-auth) server failure must never fall back to the legacy provider.
test('otp enroll: a real non-auth server failure is never masked by a legacy fallback', async () => {
    let legacyCalled = false;
    const coordinator = { beginServerTotpEnrollment: async () => ({ available: false, code: 'server_unavailable', reason: 'TOTP enrollment is temporarily unavailable.' }) };
    const provider = { enrollAccount: () => { legacyCalled = true; return { success: true, accountId: 'acct-1' }; } };
    const panel = freshPanel({ coordinator, provider });

    const result = await panel.doAction('otp', 'enroll');
    assert.equal(legacyCalled, false);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'TOTP enrollment is temporarily unavailable.');
});

// 13. A legacy-enrolled record (no server session ever existed) must
// remove via the legacy OtpProvider path, never call disableServerTotp().
test('otp remove: a legacy-sourced enrollment removes via OtpProvider.removeAccount(), never calls disableServerTotp()', async () => {
    let serverDisableCalled = false;
    const coordinator = {
        beginServerTotpEnrollment: async () => ({ available: false, code: 'not_authenticated', requiresAuth: true }),
        disableServerTotp: async () => { serverDisableCalled = true; return { available: true }; },
    };
    const provider = {
        enrollAccount: () => ({ success: true, accountId: 'acct-1', otpauthUri: 'x', secretBase32: 'y' }),
        removeAccount: () => ({ success: true }),
    };
    const panel = freshPanel({ coordinator, provider });
    await panel.doAction('otp', 'enroll'); // legacy path (requiresAuth fallback)

    const result = await panel.doAction('otp', 'remove');
    assert.equal(serverDisableCalled, false);
    assert.equal(result.success, true);
});
