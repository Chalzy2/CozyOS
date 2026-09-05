'use strict';

/**
 * core/modules/identity/test/auth-coordinator-server-password-identifier.test.js
 *
 * Regression test for a real, live bug: AuthCoordinator.loginWithServerPassword()
 * unconditionally sent its first argument as {email: identifier} to the
 * real POST /auth/login endpoint, even though every real caller
 * (login.html's "Username or Email" field, cozy-login-gate.js's
 * Administrator form) explicitly allows a plain username. A real
 * username (e.g. "Chalzcozy", mapped server-side via bootstrap-admin.js
 * set-username — see server/webauthn-rp/bootstrap-admin.js) has no "@"
 * in it, so the server's real `WHERE email = ?` lookup always missed
 * and the sign-in silently failed with a generic invalid-credentials
 * message — indistinguishable, from the UI, from a genuinely wrong
 * password.
 *
 * The server's real POST /auth/login has accepted EITHER {email} OR
 * {username} since the username-login milestone (server/webauthn-rp/
 * server.js + rp.authenticateWithPassword()) — this coordinator method
 * was the one real caller never updated to pick the right one.
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

function installFetch(capture, responder) {
    global.fetch = async (url, opts) => {
        capture.url = url;
        capture.body = JSON.parse(opts.body);
        const { status, json } = responder();
        return { status, ok: status >= 200 && status < 300, json: async () => json };
    };
}

test.afterEach(() => {
    delete global.window;
    delete global.fetch;
});

test('loginWithServerPassword("Chalzcozy", password): sends {username}, never {email} — the real, live bug this fixes', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }));

    const result = await AC.loginWithServerPassword('Chalzcozy', 'the real password', { rememberMe: false });

    assert.equal(capture.url, '/auth/login');
    assert.deepEqual(capture.body, { username: 'Chalzcozy', password: 'the real password' });
    assert.equal(result.available, true);
    assert.equal(result.isPlatformAdmin, true);
    assert.equal(result.source, 'server');
});

test('loginWithServerPassword("admin@example.com", password): still sends {email}, unchanged existing behavior', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }));

    await AC.loginWithServerPassword('admin@example.com', 'pw', { rememberMe: false });

    assert.deepEqual(capture.body, { email: 'admin@example.com', password: 'pw' });
});

test('a username containing no "@" is never sent as {email} even if it looks email-ish otherwise', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }));

    await AC.loginWithServerPassword('chalzcozy.admin', 'pw', { rememberMe: false });

    assert.deepEqual(capture.body, { username: 'chalzcozy.admin', password: 'pw' });
});

test('the request body is NEVER ambiguous: exactly one of email/username is present, never both', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }));

    await AC.loginWithServerPassword('Chalzcozy', 'pw', { rememberMe: false });
    assert.ok(!('email' in capture.body));
    assert.ok('username' in capture.body);

    await AC.loginWithServerPassword('someone@example.com', 'pw', { rememberMe: false });
    assert.ok(!('username' in capture.body));
    assert.ok('email' in capture.body);
});

test('is_platform_admin is read only from the real server response body, regardless of which identifier was used', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }));

    const result = await AC.loginWithServerPassword('Chalzcozy', 'pw');

    assert.equal(result.available, true);
    assert.equal(result.isPlatformAdmin, true, 'must reflect the real server body, not infer admin from the identifier string');

    const capture2 = {};
    installFetch(capture2, () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }));
    const result2 = await AC.loginWithServerPassword('Chalzcozy', 'pw');
    assert.equal(result2.isPlatformAdmin, false, 'the SAME username must not be treated as admin when the server says otherwise');
});

test('a genuinely wrong username/password is rejected the same honest way regardless of identifier type', async () => {
    const AC = freshCoordinator();
    const capture = {};
    installFetch(capture, () => ({ status: 401, json: { ok: false, error: 'authentication_failed' } }));

    const result = await AC.loginWithServerPassword('Chalzcozy', 'wrong password', { rememberMe: false });

    assert.equal(result.available, false);
    assert.deepEqual(capture.body, { username: 'Chalzcozy', password: 'wrong password' });
});
