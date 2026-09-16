'use strict';

/**
 * core/modules/identity/test/auth-coordinator-mfa-passkey.test.js
 * Admin 2FA — focused tests for
 * AuthCoordinator.completeServerLoginWithPasskeyMfa(), the real
 * second-factor WebAuthn/passkey completion of an existing
 * password-verified pending-auth session
 * (POST /auth/mfa/webauthn/begin -> navigator.credentials.get() ->
 * POST /auth/mfa/webauthn/complete).
 *
 * HONEST DISCLOSURE — a real browser/authenticator/fingerprint sensor
 * is not available in this environment, so this suite does NOT claim
 * device biometric verification has been exercised. It proves the
 * coordinator's request/response contract using controlled test
 * doubles for `fetch` and `navigator.credentials.get`, following the
 * exact same pattern already established in
 * auth-coordinator-server-passkey.test.js for the first-factor
 * ceremony. Real server-side second-factor verification itself is
 * already covered by
 * server/webauthn-rp/test/mfa-webauthn-passkey.test.js via the real
 * virtual authenticator — this suite does not duplicate that, only the
 * coordinator's own request/response boundary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const AUTH_COORDINATOR_PATH = path.join(__dirname, '..', 'auth-coordinator.js');

function toB64url(bytes) {
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return Buffer.from(bin, 'binary').toString('base64url');
}

function poisonedLegacyPath() {
    return {
        WebAuthnProvider: {
            verify() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.verify() was called'); },
            isSupported() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.isSupported() was called'); },
            hasCredential() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.hasCredential() was called'); },
        },
        IdentityEngine: {
            loginWithVerifiedPasskey() { throw new Error('FORBIDDEN: legacy IdentityEngine.loginWithVerifiedPasskey() was called'); },
            getUserIdByUsername() { throw new Error('FORBIDDEN: legacy IdentityEngine.getUserIdByUsername() was called'); },
        },
    };
}

function setNavigator(value) {
    Object.defineProperty(global, 'navigator', { value, configurable: true, writable: true });
}
function clearNavigator() {
    Object.defineProperty(global, 'navigator', { value: undefined, configurable: true, writable: true });
}
function fakeCredentialsGet(getFn) {
    setNavigator({ credentials: { get: getFn } });
}

function freshCoordinator() {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    global.window = { CozyOS: { ...poisonedLegacyPath() } };
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
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => json,
        };
    };
}

function realChallengeOptions(overrides = {}) {
    const allowCredentials = 'allowCredentials' in overrides
        ? overrides.allowCredentials
        : [{ id: toB64url(crypto.randomBytes(16)), type: 'public-key' }];
    return {
        challenge: toB64url(crypto.randomBytes(32)),
        rpId: 'cozyos.example',
        allowCredentials,
    };
}

function fakeAssertion() {
    const rawId = crypto.randomBytes(16);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'x', origin: 'https://cozyos.example' }), 'utf8');
    const authenticatorData = crypto.randomBytes(37);
    const signature = crypto.randomBytes(70);
    const toBuf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return {
        rawId: toBuf(rawId),
        response: {
            clientDataJSON: toBuf(clientDataJSON),
            authenticatorData: toBuf(authenticatorData),
            signature: toBuf(signature),
        },
        _raw: { rawId, clientDataJSON, authenticatorData, signature },
    };
}

test.afterEach(() => {
    delete global.fetch;
    clearNavigator();
});

// ---------------------------------------------------------------------
// 1. Validation / device support
// ---------------------------------------------------------------------

test('completeServerLoginWithPasskeyMfa: no pendingId -> invalid_challenge, no network', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    const result = await AC.completeServerLoginWithPasskeyMfa('');
    assert.equal(result.available, false);
    assert.equal(result.code, 'invalid_challenge');
    assert.equal(calls.length, 0);
});

test('completeServerLoginWithPasskeyMfa: no navigator.credentials.get -> webauthn_unavailable, deviceUnavailable:true, no network', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    clearNavigator();
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'webauthn_unavailable');
    assert.equal(result.deviceUnavailable, true);
    assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------
// 2. Begin-step server responses
// ---------------------------------------------------------------------

test('completeServerLoginWithPasskeyMfa: begin rate-limited (429) -> rate_limited, ceremony never attempted', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 429, json: { error: 'rate_limited' } }) }, calls);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'rate_limited');
});

test('completeServerLoginWithPasskeyMfa: begin returns no_passkeys_registered -> surfaced with requiresSetup:true', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 401, json: { error: 'no_passkeys_registered' } }) }, []);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'no_passkeys_registered');
    assert.equal(result.requiresSetup, true);
});

test('completeServerLoginWithPasskeyMfa: begin returns mfa_session_expired -> relayed with the correct, distinct reason', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 401, json: { error: 'mfa_session_expired' } }) }, []);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'mfa_session_expired');
    assert.match(result.reason, /expired/i);
});

test('completeServerLoginWithPasskeyMfa: begin returns mfa_session_cancelled -> relayed correctly', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 401, json: { error: 'mfa_session_cancelled' } }) }, []);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'mfa_session_cancelled');
});

test('completeServerLoginWithPasskeyMfa: begin returns empty allowCredentials -> no_passkeys_registered', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions({ allowCredentials: [] }) }) }, []);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'no_passkeys_registered');
    assert.equal(result.requiresSetup, true);
});

test('completeServerLoginWithPasskeyMfa: begin request carries the real pendingId, not any other field', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 401, json: { error: 'invalid_mfa_code' } }),
    }, calls);
    fakeCredentialsGet(async () => fakeAssertion());
    await AC.completeServerLoginWithPasskeyMfa('the-real-pending-id');
    const beginCall = calls.find((c) => c.url === '/auth/mfa/webauthn/begin');
    assert.deepEqual(beginCall.body, { pendingId: 'the-real-pending-id' });
});

// ---------------------------------------------------------------------
// 3. The real browser ceremony
// ---------------------------------------------------------------------

test('completeServerLoginWithPasskeyMfa: the server-issued challenge/rpId/allowCredentials reach navigator.credentials.get() unmodified', async () => {
    const AC = freshCoordinator();
    const options = realChallengeOptions();
    let capturedPublicKey = null;
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: options }),
        '/auth/mfa/webauthn/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }),
    }, []);
    fakeCredentialsGet(async (opts) => { capturedPublicKey = opts.publicKey; return fakeAssertion(); });
    await AC.completeServerLoginWithPasskeyMfa('pending-123', { email: 'admin@example.com' });
    assert.equal(toB64url(new Uint8Array(capturedPublicKey.challenge)), options.challenge);
    assert.equal(capturedPublicKey.rpId, options.rpId);
    assert.equal(capturedPublicKey.userVerification, 'required');
    assert.equal(toB64url(new Uint8Array(capturedPublicKey.allowCredentials[0].id)), options.allowCredentials[0].id);
});

test('completeServerLoginWithPasskeyMfa: user cancels the ceremony (NotAllowedError) -> user_cancelled', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }) }, []);
    fakeCredentialsGet(async () => { const e = new Error('cancelled'); e.name = 'NotAllowedError'; throw e; });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'user_cancelled');
});

test('completeServerLoginWithPasskeyMfa: ceremony throws a generic error -> webauthn_ceremony_failed', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }) }, []);
    fakeCredentialsGet(async () => { throw new Error('sensor malfunction'); });
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'webauthn_ceremony_failed');
    assert.match(result.reason, /sensor malfunction/);
});

test('completeServerLoginWithPasskeyMfa: no assertion returned -> no_assertion', async () => {
    const AC = freshCoordinator();
    installFetch({ '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }) }, []);
    fakeCredentialsGet(async () => null);
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'no_assertion');
});

// ---------------------------------------------------------------------
// 4. Complete-step server responses
// ---------------------------------------------------------------------

test('completeServerLoginWithPasskeyMfa: real assertion is serialized correctly into the complete request, including the pendingId', async () => {
    const AC = freshCoordinator();
    const calls = [];
    const assertion = fakeAssertion();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }),
    }, calls);
    fakeCredentialsGet(async () => assertion);
    await AC.completeServerLoginWithPasskeyMfa('the-real-pending-id', { email: 'admin@example.com' });
    const completeCall = calls.find((c) => c.url === '/auth/mfa/webauthn/complete');
    assert.equal(completeCall.body.pendingId, 'the-real-pending-id');
    assert.equal(completeCall.body.credentialId, toB64url(assertion._raw.rawId));
    assert.equal(completeCall.body.clientDataJSON, toB64url(assertion._raw.clientDataJSON));
    assert.equal(completeCall.body.authenticatorData, toB64url(assertion._raw.authenticatorData));
    assert.equal(completeCall.body.signature, toB64url(assertion._raw.signature));
});

test('completeServerLoginWithPasskeyMfa: complete rate-limited (429) -> rate_limited', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 429, json: { error: 'rate_limited' } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'rate_limited');
});

test('completeServerLoginWithPasskeyMfa: complete returns invalid_mfa_code -> relayed, generic (matches the server\'s own deliberate MFA-context design)', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 401, json: { ok: false, error: 'invalid_mfa_code' } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.available, false);
    assert.equal(result.code, 'invalid_mfa_code');
});

test('completeServerLoginWithPasskeyMfa: complete returns mfa_attempts_exceeded -> relayed correctly', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 401, json: { ok: false, error: 'mfa_attempts_exceeded' } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123');
    assert.equal(result.code, 'mfa_attempts_exceeded');
    assert.match(result.reason, /too many/i);
});

// ---------------------------------------------------------------------
// 5. Success path
// ---------------------------------------------------------------------

test('completeServerLoginWithPasskeyMfa: a real server-confirmed 200 returns available:true with method:"webauthn" and the correct isPlatformAdmin, never touching the legacy client-side passkey path', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123', { email: 'admin@example.com', rememberMe: true });
    assert.equal(result.available, true);
    assert.equal(result.source, 'server');
    assert.equal(result.email, 'admin@example.com');
    assert.equal(result.isPlatformAdmin, true);
    assert.equal(result.method, 'webauthn');
});

test('completeServerLoginWithPasskeyMfa: isPlatformAdmin:false is correctly relayed for a non-admin second-factor-enrolled account', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123', { email: 'member@example.com' });
    assert.equal(result.available, true);
    assert.equal(result.isPlatformAdmin, false);
});

test('completeServerLoginWithPasskeyMfa: malformed complete response (ok:true but no isPlatformAdmin field) does not crash and defaults isPlatformAdmin to false', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/auth/mfa/webauthn/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/auth/mfa/webauthn/complete': () => ({ status: 200, json: { ok: true } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.completeServerLoginWithPasskeyMfa('pending-123', { email: 'admin@example.com' });
    assert.equal(result.available, true);
    assert.equal(result.isPlatformAdmin, false);
});
