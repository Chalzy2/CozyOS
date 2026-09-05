'use strict';

/**
 * core/modules/identity/test/auth-coordinator-server-passkey-registration.test.js
 * Portion 2e — focused tests for AuthCoordinator.registerServerPasskey(),
 * the real server-authoritative Passkey ENROLLMENT ceremony
 * (POST /webauthn/passkeys/enroll/begin -> navigator.credentials.create() ->
 * POST /webauthn/passkeys/enroll/complete).
 *
 * HONEST DISCLOSURE — a real browser/authenticator is not available in
 * this environment, so this suite does NOT claim browser registration has
 * been verified. It proves the coordinator's request/response contract
 * using controlled test doubles for `fetch` and
 * `navigator.credentials.create`: that the right endpoints are called with
 * the right bodies, that the server-derived challenge/rp/user/
 * excludeCredentials reach navigator.credentials.create() unmodified, that
 * a real credential is serialized correctly into the server's expected
 * fields, that the server's response (not any local check) decides
 * success/failure, and that the old client-side
 * WebAuthnProvider.registerCredential() / AuthEnrollmentStore.enroll()
 * path is never touched. Real server-side WebAuthn registration
 * verification itself is already covered by
 * server/webauthn-rp/test/http-integration.test.js via the real virtual
 * authenticator — this suite does not duplicate that, only the
 * coordinator's own boundary. Real browser registration end-to-end is
 * covered separately by
 * server/webauthn-rp/test/browser-e2e-passkey-registration.test.js.
 *
 * Run: node --test core/modules/identity/test/auth-coordinator-server-passkey-registration.test.js
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

// A poisoned WebAuthnProvider/AuthEnrollmentStore — any call throws, so a
// test that reaches the end without throwing proves registerServerPasskey()
// never invoked the old client-authoritative enrollment path.
function poisonedLegacyPath() {
    return {
        WebAuthnProvider: {
            registerCredential() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.registerCredential() was called'); },
            verify() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.verify() was called'); },
            isSupported() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.isSupported() was called'); },
            hasCredential() { throw new Error('FORBIDDEN: legacy WebAuthnProvider.hasCredential() was called'); },
        },
        AuthEnrollmentStore: {
            enroll() { throw new Error('FORBIDDEN: legacy AuthEnrollmentStore.enroll() was called'); },
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

function fakeCredentialsCreate(createFn) {
    setNavigator({ credentials: { create: createFn } });
}

function freshCoordinator() {
    delete require.cache[require.resolve(AUTH_COORDINATOR_PATH)];
    global.window = { CozyOS: { ...poisonedLegacyPath() } };
    require(AUTH_COORDINATOR_PATH);
    return global.window.CozyOS.AuthCoordinator;
}

// ---- fetch test double ----
// handlers: { '/webauthn/passkeys/enroll/begin': (body) => ({status, json}), ... }
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

function realRegistrationOptions(overrides = {}) {
    const excludeCredentials = 'excludeCredentials' in overrides
        ? overrides.excludeCredentials
        : [];
    return {
        challenge: toB64url(crypto.randomBytes(32)),
        rp: { id: 'cozyos.example', name: 'CozyOS' },
        user: { id: toB64url(crypto.randomBytes(16)), name: 'ada@example.com', displayName: 'ada@example.com' },
        excludeCredentials,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        ...overrides,
    };
}

function fakeCredential() {
    const rawId = crypto.randomBytes(16);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: 'x', origin: 'https://cozyos.example' }), 'utf8');
    const attestationObject = crypto.randomBytes(80); // opaque CBOR blob; content irrelevant to these tests
    const toBuf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return {
        rawId: toBuf(rawId),
        response: {
            clientDataJSON: toBuf(clientDataJSON),
            attestationObject: toBuf(attestationObject),
        },
        _raw: { rawId, clientDataJSON, attestationObject },
    };
}

test.afterEach(() => {
    delete global.fetch;
    clearNavigator();
});

// 1. WebAuthn unavailable in this browser.
test('registerServerPasskey: no navigator.credentials.create -> webauthn_unavailable, no network calls', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({}, calls);
    // navigator intentionally left unset (clearNavigator() ran in afterEach)
    const result = await AC.registerServerPasskey('My Laptop');
    assert.equal(result.available, false);
    assert.equal(result.code, 'webauthn_unavailable');
    assert.equal(result.deviceUnavailable, true);
    assert.equal(calls.length, 0);
});

// 2. /webauthn/passkeys/enroll/begin is called with no client-supplied
//    email/userId — the server resolves the account from the session
//    cookie alone.
test('registerServerPasskey: calls POST /webauthn/passkeys/enroll/begin with no identity in the body', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'abc123' } }),
    }, calls);
    fakeCredentialsCreate(async () => fakeCredential());
    await AC.registerServerPasskey();
    const beginCall = calls.find((c) => c.url === '/webauthn/passkeys/enroll/begin');
    assert.ok(beginCall, 'begin endpoint was called');
    assert.equal(beginCall.method, 'POST');
    assert.equal('email' in beginCall.body, false);
    assert.equal('userId' in beginCall.body, false);
});

// 3. Not authenticated as an authorized (platform-admin) session ->
//    fails closed on the server's real 401, ceremony never attempted.
test('registerServerPasskey: server 401 not_authenticated_admin -> fails closed, ceremony never attempted', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 401, json: { error: 'not_authenticated_admin' } }),
    }, calls);
    let ceremonyCalled = false;
    fakeCredentialsCreate(async () => { ceremonyCalled = true; return fakeCredential(); });
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'not_authenticated_admin');
    assert.equal(result.requiresAuth, true);
    assert.equal(ceremonyCalled, false);
});

// 4. navigator.credentials.create() is invoked with the server-derived
//    challenge/rp/user/excludeCredentials, byte-for-byte, not re-derived
//    or fabricated locally.
test('registerServerPasskey: navigator.credentials.create receives server-derived challenge/rp/user', async () => {
    const AC = freshCoordinator();
    const calls = [];
    const excludeCredentials = [{ id: toB64url(crypto.randomBytes(16)), type: 'public-key' }];
    const options = realRegistrationOptions({ excludeCredentials });
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: options }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'abc123' } }),
    }, calls);
    let receivedPublicKey = null;
    fakeCredentialsCreate(async ({ publicKey }) => { receivedPublicKey = publicKey; return fakeCredential(); });
    await AC.registerServerPasskey();
    assert.ok(receivedPublicKey, 'navigator.credentials.create was invoked');
    assert.equal(toB64url(new Uint8Array(receivedPublicKey.challenge)), options.challenge);
    assert.deepEqual(receivedPublicKey.rp, options.rp);
    assert.equal(toB64url(new Uint8Array(receivedPublicKey.user.id)), options.user.id);
    assert.equal(receivedPublicKey.user.name, options.user.name);
    assert.equal(receivedPublicKey.user.displayName, options.user.displayName);
    assert.deepEqual(receivedPublicKey.pubKeyCredParams, options.pubKeyCredParams);
    assert.equal(receivedPublicKey.excludeCredentials.length, 1);
    assert.equal(toB64url(new Uint8Array(receivedPublicKey.excludeCredentials[0].id)), excludeCredentials[0].id);
    assert.equal(receivedPublicKey.authenticatorSelection.userVerification, 'required');
});

// 5. The returned credential is serialized correctly, and
//    /webauthn/passkeys/enroll/complete receives it (plus nickname).
test('registerServerPasskey: credential serialized correctly into the complete request, with nickname', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'abc123' } }),
    }, calls);
    const credential = fakeCredential();
    fakeCredentialsCreate(async () => credential);
    await AC.registerServerPasskey('My Laptop');
    const completeCall = calls.find((c) => c.url === '/webauthn/passkeys/enroll/complete');
    assert.ok(completeCall, 'complete endpoint was called');
    assert.equal(completeCall.method, 'POST');
    assert.equal(completeCall.body.clientDataJSON, toB64url(new Uint8Array(credential._raw.clientDataJSON)));
    assert.equal(completeCall.body.attestationObject, toB64url(new Uint8Array(credential._raw.attestationObject)));
    assert.equal(completeCall.body.nickname, 'My Laptop');
    // credentialId is never sent by the client at complete time — the
    // server derives it itself from the real attestationObject.
    assert.equal('credentialId' in completeCall.body, false);
});

// 6. Successful server response -> available:true, only after server
//    confirmation.
test('registerServerPasskey: server success -> available:true with server-reported credentialId', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'real-cred-id' } }),
    }, calls);
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey('Work Phone');
    assert.equal(result.available, true);
    assert.equal(result.code, 'registered');
    assert.equal(result.credentialId, 'real-cred-id');
    assert.equal(result.nickname, 'Work Phone');
    assert.equal(AC.getDiagnosticsReport().serverPasskeyRegistrationSuccesses, 1);
});

// 7. Server rejection (duplicate credential) fails closed and relays the
//    server's error code.
test('registerServerPasskey: server rejection (credential_already_registered) fails closed', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 400, json: { error: 'credential_already_registered' } }),
    }, calls);
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'credential_already_registered');
});

test('registerServerPasskey: server rejection (rp_id_hash_mismatch) fails closed', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 400, json: { error: 'rp_id_hash_mismatch' } }),
    }, calls);
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'rp_id_hash_mismatch');
});

// 8. navigator.credentials.create() cancellation fails closed, and the
//    complete endpoint is never called.
test('registerServerPasskey: cancellation (NotAllowedError) fails closed, complete never called', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'x' } }),
    }, calls);
    fakeCredentialsCreate(async () => { const e = new Error('cancelled'); e.name = 'NotAllowedError'; throw e; });
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'user_cancelled');
    assert.equal(calls.some((c) => c.url === '/webauthn/passkeys/enroll/complete'), false);
});

// 9. Network failure at begin fails closed.
test('registerServerPasskey: network failure at begin -> server_unavailable', async () => {
    const AC = freshCoordinator();
    global.fetch = async () => { throw new Error('network down'); };
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});

// 10. Network failure at complete fails closed.
test('registerServerPasskey: network failure at complete -> server_unavailable', async () => {
    const AC = freshCoordinator();
    const calls = [];
    global.fetch = async (url) => {
        calls.push(url);
        if (url === '/webauthn/passkeys/enroll/begin') {
            return { ok: true, status: 200, json: async () => realRegistrationOptions() };
        }
        throw new Error('network down');
    };
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'server_unavailable');
});

// 11. Malformed/incomplete begin response fails closed rather than
//     guessing at missing fields.
test('registerServerPasskey: malformed begin response -> malformed_server_response, ceremony never attempted', async () => {
    const AC = freshCoordinator();
    const calls = [];
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: { challenge: 'x' } }), // no user field
    }, calls);
    let ceremonyCalled = false;
    fakeCredentialsCreate(async () => { ceremonyCalled = true; return fakeCredential(); });
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'malformed_server_response');
    assert.equal(ceremonyCalled, false);
});

// 12/13. No call to the old WebAuthnProvider.registerCredential() or
// AuthEnrollmentStore.enroll() — proven by every test above completing
// without throwing (poisonedLegacyPath() makes any such call throw), plus
// an explicit success-path run here for clarity.
test('registerServerPasskey: never touches legacy WebAuthnProvider.registerCredential() or AuthEnrollmentStore.enroll()', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
        '/webauthn/passkeys/enroll/complete': () => ({ status: 200, json: { ok: true, credentialId: 'abc123' } }),
    }, []);
    fakeCredentialsCreate(async () => fakeCredential());
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, true);
    // Reaching here without throwing proves neither poisoned legacy
    // method fired.
});

// 14. No credential object returned by the browser fails closed.
test('registerServerPasskey: no credential returned by browser -> no_credential', async () => {
    const AC = freshCoordinator();
    installFetch({
        '/webauthn/passkeys/enroll/begin': () => ({ status: 200, json: realRegistrationOptions() }),
    }, []);
    fakeCredentialsCreate(async () => null);
    const result = await AC.registerServerPasskey();
    assert.equal(result.available, false);
    assert.equal(result.code, 'no_credential');
});
