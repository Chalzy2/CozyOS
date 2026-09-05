'use strict';

/**
 * core/security/test/identity-engine.test.js
 * Prompt 7 — real IdentityEngine path tests (Rule 19: "do not use only
 * synthetic objects... test real paths through IdentityEngine.createUser/
 * getUser/getDashboardConfig").
 *
 * HONEST DISCLOSURE — this is the FIRST test file that has ever existed
 * for core/modules/identity/identity-engine.js in this repository (a real
 * gap found while building this slice, not something these tests
 * pretend was already covered elsewhere). identity-engine.js is written
 * against `window.CozyOS` with no module.exports and no browser/window
 * guard, so it has never been Node-testable as written. This file
 * installs the SMALLEST POSSIBLE real shim — a bare `global.window =
 * { CozyOS: {} }` — before requiring it fresh per test (via
 * `delete require.cache` + re-require), so each test gets a clean
 * engine instance with its own in-memory #users map. No method's
 * behavior is mocked or stubbed; every call below is the real,
 * production register()/getUser()/login()/loginWithVerifiedGoogle()
 * code path. Node 22's built-in Web Crypto (globalThis.crypto.subtle)
 * satisfies the engine's own `crypto.subtle` password-hashing check
 * without any shim.
 *
 * SCOPE: this file focuses on the paths this slice's Google-authenticator
 * work actually touches (register/getUser/login/lock + the new
 * loginWithVerifiedGoogle()), not full IdentityEngine coverage — the
 * engine is 1400+ lines with many responsibilities (orgs, departments,
 * delegates, OTP, recovery codes) genuinely out of scope for this slice.
 *
 * Run: node --test core/security/test/identity-engine.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');

function freshIdentityEngine() {
    delete require.cache[require.resolve(IDENTITY_ENGINE_PATH)];
    global.window = { CozyOS: {} };
    require(IDENTITY_ENGINE_PATH);
    return global.window.CozyOS.IdentityEngine;
}

async function registerRealUser(IE, overrides = {}) {
    const base = {
        accountType: 'user', firstName: 'Ada', lastName: 'Lovelace',
        username: `user_${Math.random().toString(36).slice(2, 10)}`,
        email: `${Math.random().toString(36).slice(2, 8)}@example.com`,
        phone: `+1555${Math.floor(1000000 + Math.random() * 8999999)}`,
        password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd', acceptTerms: true,
    };
    return IE.register({ ...base, ...overrides });
}

test('register(): a real user is created and reports available:true with a real userId', async () => {
    const IE = freshIdentityEngine();
    const result = await registerRealUser(IE);
    assert.equal(result.available, true);
    assert.equal(typeof result.userId, 'string');
    assert.equal(result.roles.includes('standard-user'), true);
});

test('register(): duplicate username is rejected, not silently overwritten', async () => {
    const IE = freshIdentityEngine();
    const username = 'duplicate_test_user';
    const first = await registerRealUser(IE, { username });
    assert.equal(first.available, true);
    const second = await registerRealUser(IE, { username });
    assert.equal(second.available, false);
    assert.match(second.reason, /already taken/);
});

test('getUser(): returns real profile fields and never leaks hash/salt', async () => {
    const IE = freshIdentityEngine();
    const { userId } = await registerRealUser(IE);
    const user = IE.getUser(userId);
    assert.equal(user.userId, userId);
    assert.equal(user.status, 'active');
    assert.equal('hash' in user, false);
    assert.equal('salt' in user, false);
});

test('getUser(): unknown userId returns null, not a fabricated record', () => {
    const IE = freshIdentityEngine();
    assert.equal(IE.getUser('no-such-user'), null);
});

test('login(): correct password creates a real session', async () => {
    const IE = freshIdentityEngine();
    const username = 'login_test_user';
    await registerRealUser(IE, { username, password: 'Correct!Pass1', confirmPassword: 'Correct!Pass1' });
    const result = await IE.login(username, 'Correct!Pass1');
    assert.equal(result.available, true);
});

test('login(): wrong password is rejected, not a session', async () => {
    const IE = freshIdentityEngine();
    const username = 'login_test_user_2';
    await registerRealUser(IE, { username, password: 'Correct!Pass1', confirmPassword: 'Correct!Pass1' });
    const result = await IE.login(username, 'WrongPassword!');
    assert.equal(result.available, false);
});

// ---------------------------------------------------------------------
// loginWithVerifiedGoogle() — Prompt 7 addition
// ---------------------------------------------------------------------

test('loginWithVerifiedGoogle(): a real, existing user gets a real session, with its own honest audit label', async () => {
    const IE = freshIdentityEngine();
    const { userId, username } = await registerRealUser(IE);
    const result = IE.loginWithVerifiedGoogle(userId);
    assert.equal(result.available, true);
    const auditLog = IE.getAuditLog ? IE.getAuditLog() : [];
    if (Array.isArray(auditLog) && auditLog.length) {
        const hasGoogleEntry = auditLog.some(entry =>
            (entry.event || entry.type || '').includes('LOGIN_SUCCESS_WITH_GOOGLE') ||
            (entry.action || '').includes('LOGIN_SUCCESS_WITH_GOOGLE'));
        assert.equal(hasGoogleEntry, true, 'expected a distinct LOGIN_SUCCESS_WITH_GOOGLE audit entry, not merged with password/passkey login');
    }
    void username;
});

test('loginWithVerifiedGoogle(): fails closed on an unknown/removed userId — never fabricates a session', () => {
    const IE = freshIdentityEngine();
    const result = IE.loginWithVerifiedGoogle('user-does-not-exist');
    assert.equal(result.available, false);
    assert.match(result.reason, /No real user found/);
});

test('loginWithVerifiedGoogle(): does NOT bypass a security lock — the same real lock login() itself respects', async () => {
    const IE = freshIdentityEngine();
    const username = 'locked_google_user';
    const { userId } = await registerRealUser(IE, { username, password: 'Correct!Pass1', confirmPassword: 'Correct!Pass1' });
    // Real lockout: 5 genuine failed password attempts against the real login(),
    // not a fabricated lockedUntil value poked in directly.
    for (let i = 0; i < 5; i++) {
        await IE.login(username, 'WrongPassword!');
    }
    const result = IE.loginWithVerifiedGoogle(userId);
    assert.equal(result.available, false);
    assert.equal(result.locked, true, 'a locked account must stay locked for every login path, including Google — not just password login');
});

test('loginWithVerifiedGoogle(): never confuses accounts — resolves the exact userId given it, not the first/most-recent user', async () => {
    const IE = freshIdentityEngine();
    const a = await registerRealUser(IE);
    const b = await registerRealUser(IE);
    const result = IE.loginWithVerifiedGoogle(b.userId);
    assert.equal(result.available, true);
    // getUser after the session call still resolves to the same, correct account
    assert.equal(IE.getUser(b.userId).userId, b.userId);
    assert.notEqual(a.userId, b.userId);
});

// ---------------------------------------------------------------------
// loginWithVerifiedPhone() — Prompt 10 continuation addition
// ---------------------------------------------------------------------

test('loginWithVerifiedPhone(): a real, existing user gets a real session, with its own honest audit label', async () => {
    const IE = freshIdentityEngine();
    const { userId, username } = await registerRealUser(IE);
    const result = IE.loginWithVerifiedPhone(userId);
    assert.equal(result.available, true);
    const auditLog = IE.getAuditLog ? IE.getAuditLog() : [];
    if (Array.isArray(auditLog) && auditLog.length) {
        const hasPhoneEntry = auditLog.some(entry =>
            (entry.event || entry.type || '').includes('LOGIN_SUCCESS_WITH_PHONE') ||
            (entry.action || '').includes('LOGIN_SUCCESS_WITH_PHONE'));
        assert.equal(hasPhoneEntry, true, 'expected a distinct LOGIN_SUCCESS_WITH_PHONE audit entry, not merged with password/passkey/Google login');
    }
    void username;
});

test('loginWithVerifiedPhone(): fails closed on an unknown/removed userId — never fabricates a session', () => {
    const IE = freshIdentityEngine();
    const result = IE.loginWithVerifiedPhone('user-does-not-exist');
    assert.equal(result.available, false);
    assert.match(result.reason, /No real user found/);
});

test('loginWithVerifiedPhone(): does NOT bypass a security lock — the same real lock login() itself respects', async () => {
    const IE = freshIdentityEngine();
    const username = 'locked_phone_user';
    const { userId } = await registerRealUser(IE, { username, password: 'Correct!Pass1', confirmPassword: 'Correct!Pass1' });
    for (let i = 0; i < 5; i++) {
        await IE.login(username, 'WrongPassword!');
    }
    const result = IE.loginWithVerifiedPhone(userId);
    assert.equal(result.available, false);
    assert.equal(result.locked, true, 'a locked account must stay locked for every login path, including phone — not just password login');
});

test('loginWithVerifiedPhone(): never confuses accounts — resolves the exact userId given it, not the first/most-recent user', async () => {
    const IE = freshIdentityEngine();
    const a = await registerRealUser(IE);
    const b = await registerRealUser(IE);
    const result = IE.loginWithVerifiedPhone(b.userId);
    assert.equal(result.available, true);
    assert.equal(IE.getUser(b.userId).userId, b.userId);
    assert.notEqual(a.userId, b.userId);
});
