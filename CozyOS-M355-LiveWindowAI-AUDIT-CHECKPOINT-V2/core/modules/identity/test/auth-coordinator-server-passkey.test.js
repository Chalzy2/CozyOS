'use strict';

/**
 * core/modules/identity/test/auth-coordinator-server-passkey.test.js
 * Portion 2b — focused tests for AuthCoordinator.loginWithServerPasskey(),
 * the real server-authoritative Passkey ceremony
 * (POST /webauthn/authenticate/begin -> navigator.credentials.get() ->
 * POST /webauthn/authenticate/complete).
 *
 * HONEST DISCLOSURE — a real browser/authenticator is not available in
 * this environment, so this suite does NOT claim browser authentication
 * has been verified. It proves the coordinator's request/response
 * contract using controlled test doubles for `fetch` and
 * `navigator.credentials.get`: that the right endpoints are called with
 * the right bodies, that the server-derived challenge/options reach
 * navigator.credentials.get() unmodified, that a real assertion is
 * serialized correctly into the server's expected fields, that the
 * server's response (not any local check) decides success/failure, and
 * that the old client-side WebAuthnProvider.verify()/
 * IdentityEngine.loginWithVerifiedPasskey() path is never touched.
 * Real server-side WebAuthn verification itself is already covered by
 * server/webauthn-rp/test/http-integration.test.js via the real virtual
 * authenticator (see Portion 2 audit) — this suite does not duplicate
 * that, only the coordinator's own boundary.
 *
 * Run: node --test core/modules/identity/test/auth-coordinator-server-passkey.test.js
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

// A poisoned WebAuthnProvider/IdentityEngine — any call throws, so a test
// that reaches the end without throwing proves loginWithServerPasskey()
// never invoked the old client-authoritative path.
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

// Node 20+ defines a real, read-only `navigator` global (getter, no
// setter) — plain `global.navigator = ...` throws. Redefine the property
// itself so tests can install/remove a fake per test.
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

// ---- fetch test double ----
// handlers: { '/webauthn/authenticate/begin': (body) => ({status, json}), ... }
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
    const signature = crypto.randomBytes(70); // DER-shaped length, content irrelevant to these tests
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

// 1. Validation — no email.
test('loginWithServerPasskey: no email -> validation_error, no network calls', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    fakeCredentialsGet(async () => { throw new Error('should not be called'); });
    const result = await AC.loginWithServerPasskey('');
    assert.equal(result.available, false);
    assert.equal(result.code, 'validation_error');
    assert.equal(calls.length, 0);
});

// 2. WebAuthn unavailable in this browser.
test('loginWithServerPasskey: no navigator.credentials.get -> webauthn_unavailable, no network calls', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    // navigator intentionally left unset (clearNavigator() ran in afterEach)
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'webauthn_unavailable');
    assert.equal(result.deviceUnavailable, true);
    assert.equal(calls.length, 0);
});

// 3. /webauthn/authenticate/begin is called with the right method/body.
test('loginWithServerPasskey: calls POST /webauthn/authenticate/begin with email', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, calls);
    fakeCredentialsGet(async () => fakeAssertion());
    await AC.loginWithServerPasskey('ada@example.com');
    const beginCall = calls.find((c) => c.url === '/webauthn/authenticate/begin');
    assert.ok(beginCall, 'begin endpoint was called');
    assert.equal(beginCall.method, 'POST');
    assert.deepEqual(beginCall.body, { email: 'ada@example.com' });
});

// 4. No passkeys registered -> fails closed without attempting a ceremony.
test('loginWithServerPasskey: empty allowCredentials -> no_passkeys_registered, ceremony never attempted', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions({ allowCredentials: [] }) }),
    }, calls);
    let ceremonyCalled = false;
    fakeCredentialsGet(async () => { ceremonyCalled = true; return fakeAssertion(); });
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'no_passkeys_registered');
    assert.equal(result.requiresSetup, true);
    assert.equal(ceremonyCalled, false);
});

// 5. navigator.credentials.get() is invoked with the server-derived
//    challenge/options, byte-for-byte, not re-derived locally.
test('loginWithServerPasskey: navigator.credentials.get receives server-derived challenge/options', async () => {
    const AC = freshCoordinator();
    const calls = [];
    const options = realChallengeOptions();
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: options }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, calls);
    let receivedPublicKey = null;
    fakeCredentialsGet(async ({ publicKey }) => { receivedPublicKey = publicKey; return fakeAssertion(); });
    await AC.loginWithServerPasskey('ada@example.com');
    assert.ok(receivedPublicKey, 'navigator.credentials.get was invoked');
    assert.equal(toB64url(new Uint8Array(receivedPublicKey.challenge)), options.challenge);
    assert.equal(receivedPublicKey.rpId, options.rpId);
    assert.equal(receivedPublicKey.allowCredentials.length, options.allowCredentials.length);
    assert.equal(
        toB64url(new Uint8Array(receivedPublicKey.allowCredentials[0].id)),
        options.allowCredentials[0].id
    );
    assert.equal(receivedPublicKey.userVerification, 'required');
});

// 6. The returned assertion is serialized correctly, and
//    /webauthn/authenticate/complete receives it.
test('loginWithServerPasskey: assertion serialized correctly into the complete request', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, calls);
    const assertion = fakeAssertion();
    fakeCredentialsGet(async () => assertion);
    await AC.loginWithServerPasskey('ada@example.com');
    const completeCall = calls.find((c) => c.url === '/webauthn/authenticate/complete');
    assert.ok(completeCall, 'complete endpoint was called');
    assert.equal(completeCall.method, 'POST');
    assert.equal(completeCall.body.credentialId, toB64url(new Uint8Array(assertion._raw.rawId)));
    assert.equal(completeCall.body.clientDataJSON, toB64url(new Uint8Array(assertion._raw.clientDataJSON)));
    assert.equal(completeCall.body.authenticatorData, toB64url(new Uint8Array(assertion._raw.authenticatorData)));
    // Signature relayed exactly as produced — no local re-encoding
    // (e.g. no DER->raw conversion, unlike the old client-side verifier).
    assert.equal(completeCall.body.signature, toB64url(new Uint8Array(assertion._raw.signature)));
});

// 7. Successful server response produces authenticated state.
test('loginWithServerPasskey: server success -> available:true with server-reported isPlatformAdmin', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: true } }),
    }, calls);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('admin@example.com');
    assert.equal(result.available, true);
    assert.equal(result.source, 'server');
    assert.equal(result.email, 'admin@example.com');
    assert.equal(result.isPlatformAdmin, true);
    assert.equal(AC.getDiagnosticsReport().serverPasskeyLoginSuccesses, 1);
});

// 8. Server rejection fails closed and relays the server's error code.
test('loginWithServerPasskey: server rejection (invalid_signature) fails closed', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 400, json: { error: 'invalid_signature' } }),
    }, calls);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'invalid_signature');
});

test('loginWithServerPasskey: server rejection (sign_count_did_not_increase) fails closed', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 400, json: { error: 'sign_count_did_not_increase' } }),
    }, calls);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'sign_count_did_not_increase');
});

// 9. navigator.credentials.get() cancellation fails closed, and the
//    complete endpoint is never called.
test('loginWithServerPasskey: cancellation (NotAllowedError) fails closed, complete never called', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, calls);
    fakeCredentialsGet(async () => { const e = new Error('cancelled'); e.name = 'NotAllowedError'; throw e; });
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'user_cancelled');
    assert.equal(calls.some((c) => c.url === '/webauthn/authenticate/complete'), false);
});

// 10. Network failure at begin fails closed.
test('loginWithServerPasskey: network failure at begin -> server_unavailable', async () => {
    const AC = freshCoordinator();
    global.fetch = async () => { throw new Error('network down'); };
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});

// 11. Network failure at complete fails closed.
test('loginWithServerPasskey: network failure at complete -> server_unavailable', async () => {
    const AC = freshCoordinator();
    const calls = [];
    global.fetch = async (url) => {
        calls.push(url);
        if (url === '/webauthn/authenticate/begin') {
            return { ok: true, status: 200, json: async () => realChallengeOptions() };
        }
        throw new Error('network down');
    };
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});

// 12/13. No call to the old WebAuthnProvider.verify() or
// IdentityEngine.loginWithVerifiedPasskey() — proven by every test above
// completing without throwing (poisonedLegacyPath() makes any such call
// throw), plus an explicit success-path run here for clarity.
test('loginWithServerPasskey: never touches legacy WebAuthnProvider.verify() or IdentityEngine.loginWithVerifiedPasskey()', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/webauthn/authenticate/begin': () => ({ status: 200, json: realChallengeOptions() }),
        '/webauthn/authenticate/complete': () => ({ status: 200, json: { ok: true, isPlatformAdmin: false } }),
    }, []);
    fakeCredentialsGet(async () => fakeAssertion());
    const result = await AC.loginWithServerPasskey('ada@example.com');
    assert.equal(result.available, true);
    // Reaching here without throwing proves neither poisoned legacy
    // method fired.
});
