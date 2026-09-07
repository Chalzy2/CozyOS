'use strict';

/**
 * core/modules/identity/test/auth-coordinator-server-totp-enrollment.test.js
 *
 * Domain 2 (Security & Sign-in discovery) — focused tests for the new
 * AuthCoordinator.beginServerTotpEnrollment() / completeServerTotpEnrollment()
 * / disableServerTotp() methods, the real server-authoritative TOTP
 * enrollment ceremony (POST /auth/mfa/totp/enroll/begin|complete,
 * POST /auth/mfa/totp/disable) — closing the gap this domain's discovery
 * found: those server routes and server/webauthn-rp/totp.js existed and
 * were tested, but no client code had ever called them before this.
 *
 * Proves the coordinator's request/response contract using a controlled
 * `fetch` test double: right endpoints, right bodies, server response
 * (not any local check) decides success/failure, and the legacy
 * client-only OtpProvider is never touched by these methods.
 *
 * Run: node --test core/modules/identity/test/auth-coordinator-server-totp-enrollment.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const AUTH_COORDINATOR_PATH = path.join(__dirname, '..', 'auth-coordinator.js');

function poisonedLegacyOtp() {
    return {
        OtpProvider: {
            enrollAccount() { throw new Error('FORBIDDEN: legacy OtpProvider.enrollAccount() was called'); },
            verify() { throw new Error('FORBIDDEN: legacy OtpProvider.verify() was called'); },
            removeAccount() { throw new Error('FORBIDDEN: legacy OtpProvider.removeAccount() was called'); },
        },
    };
}

function freshCoordinator() {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    global.window = { CozyOS: { ...poisonedLegacyOtp() } };
    require(AUTH_COORDINATOR_PATH);
    return global.window.CozyOS.AuthCoordinator;
}

function installFetch(handlers, calls) {
    global.fetch = async (url, opts) => {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        calls.push({ url, method: opts && opts.method, body });
        const handler = handlers[url];
        if (!handler) throw new Error(`unexpected fetch to ${url}`);
        const { status, json } = handler(body);
        return { ok: status >= 200 && status < 300, status, json: async () => json };
    };
}

test.afterEach(() => { delete global.fetch; });

// ---- beginServerTotpEnrollment ----

test('beginServerTotpEnrollment: real session -> real secret/otpauthUri returned, legacy OtpProvider never touched', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/auth/mfa/totp/enroll/begin': () => ({ status: 200, json: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/CozyOS:ada@example.com?secret=JBSWY3DPEHPK3PXP' } }),
    }, calls);

    const result = await AC.beginServerTotpEnrollment();
    assert.equal(result.available, true);
    assert.equal(result.secretBase32, 'JBSWY3DPEHPK3PXP');
    assert.equal(result.otpauthUri, 'otpauth://totp/CozyOS:ada@example.com?secret=JBSWY3DPEHPK3PXP');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/auth/mfa/totp/enroll/begin');
    assert.equal(calls[0].method, 'POST');
});

test('beginServerTotpEnrollment: no session -> requiresAuth:true, honest failure', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/totp/enroll/begin': () => ({ status: 401, json: { error: 'not_authenticated' } }),
    }, []);

    const result = await AC.beginServerTotpEnrollment();
    assert.equal(result.available, false);
    assert.equal(result.code, 'not_authenticated');
    assert.equal(result.requiresAuth, true);
});

test('beginServerTotpEnrollment: network failure -> server_unavailable', async () => {
    const AC = freshCoordinator();
    global.fetch = async () => { throw new Error('network down'); };
    const result = await AC.beginServerTotpEnrollment();
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});

// ---- completeServerTotpEnrollment ----

test('completeServerTotpEnrollment: correct code -> real success + recovery codes relayed verbatim', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/auth/mfa/totp/enroll/complete': (body) => {
            assert.equal(body.code, '123456');
            return { status: 200, json: { ok: true, recoveryCodes: ['ABCDE-FGHIJ', 'KLMNO-PQRST'] } };
        },
    }, calls);

    const result = await AC.completeServerTotpEnrollment('123456');
    assert.equal(result.available, true);
    assert.equal(result.code, 'enrolled');
    assert.deepEqual(result.recoveryCodes, ['ABCDE-FGHIJ', 'KLMNO-PQRST']);
});

test('completeServerTotpEnrollment: wrong code -> real server rejection relayed, never treated as success', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/totp/enroll/complete': () => ({ status: 400, json: { error: 'invalid_mfa_code' } }),
    }, []);

    const result = await AC.completeServerTotpEnrollment('000000');
    assert.equal(result.available, false);
    assert.equal(result.code, 'invalid_mfa_code');
    assert.match(result.reason, /didn't match/);
});

test('completeServerTotpEnrollment: no code supplied -> honest validation failure, no network call', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    const result = await AC.completeServerTotpEnrollment('');
    assert.equal(result.available, false);
    assert.equal(result.code, 'code_required');
    assert.equal(calls.length, 0);
});

test('completeServerTotpEnrollment: enrollment not started server-side -> honest failure', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/totp/enroll/complete': () => ({ status: 400, json: { error: 'mfa_enrollment_not_started' } }),
    }, []);
    const result = await AC.completeServerTotpEnrollment('123456');
    assert.equal(result.available, false);
    assert.equal(result.code, 'mfa_enrollment_not_started');
});

// ---- disableServerTotp ----

test('disableServerTotp: real session -> real success', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({ '/auth/mfa/totp/disable': () => ({ status: 200, json: { ok: true } }) }, calls);
    const result = await AC.disableServerTotp();
    assert.equal(result.available, true);
    assert.equal(result.code, 'disabled');
    assert.equal(calls[0].url, '/auth/mfa/totp/disable');
});

test('disableServerTotp: no session -> requiresAuth:true, honest failure', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/totp/disable': () => ({ status: 401, json: { error: 'not_authenticated' } }) }, []);
    const result = await AC.disableServerTotp();
    assert.equal(result.available, false);
    assert.equal(result.requiresAuth, true);
});

test('disableServerTotp: network failure -> server_unavailable', async () => {
    const AC = freshCoordinator();
    global.fetch = async () => { throw new Error('network down'); };
    const result = await AC.disableServerTotp();
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});
