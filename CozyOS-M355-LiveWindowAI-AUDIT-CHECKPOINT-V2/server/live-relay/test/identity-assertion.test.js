'use strict';

/**
 * server/live-relay/test/identity-assertion.test.js
 * STEP 4D-B Phase 6 — Upstream Identity Assertion
 *
 * Run: node --test server/live-relay/test/identity-assertion.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    signAssertion,
    verifyAssertion,
    extractBearer,
    createDefaultIdentityVerifier,
} = require('../identity-assertion');
const sessionToken = require('../session-token');

const SECRET = 'identity-test-secret-do-not-use-in-production';

test('signAssertion + verifyAssertion round-trip succeeds for the real signer', () => {
    const token = signAssertion('user-42', SECRET);
    const result = verifyAssertion(token, SECRET);
    assert.equal(result.verified, true);
    assert.equal(result.userId, 'user-42');
});

test('verifyAssertion rejects a tampered token', () => {
    const token = signAssertion('user-42', SECRET);
    const [h, b, s] = token.split('.');
    const tampered = `${h}.${b}X.${s}`;
    const result = verifyAssertion(tampered, SECRET);
    assert.equal(result.verified, false);
});

test('verifyAssertion rejects a token signed with the wrong secret', () => {
    const token = signAssertion('user-42', SECRET);
    const result = verifyAssertion(token, 'a-different-secret');
    assert.equal(result.verified, false);
});

test('verifyAssertion rejects an expired token', async () => {
    const token = signAssertion('user-42', SECRET, -1);
    const result = verifyAssertion(token, SECRET);
    assert.equal(result.verified, false);
    assert.match(result.reason, /expired/i);
});

test('verifyAssertion rejects a real SessionAuthority participation token (purpose isolation)', () => {
    // A real participation token has a genuine sessionId/role, not the
    // ASSERTION_SESSION/ASSERTION_ROLE sentinels — must never be usable
    // as an identity assertion, and vice versa.
    const participationToken = sessionToken.sign({ sessionId: 'live-service-1', role: 'viewer', sub: 'user-42' }, SECRET);
    const result = verifyAssertion(participationToken, SECRET);
    assert.equal(result.verified, false);
    assert.match(result.reason, /Not an identity-assertion token/);
});

test('signAssertion requires a userId', () => {
    assert.throws(() => signAssertion(null, SECRET), TypeError);
});

test('extractBearer parses a real Authorization header', () => {
    assert.equal(extractBearer({ headers: { authorization: 'Bearer abc.def.ghi' } }), 'abc.def.ghi');
});

test('extractBearer returns null when no Authorization header is present', () => {
    assert.equal(extractBearer({ headers: {} }), null);
    assert.equal(extractBearer({}), null);
});

test('extractBearer returns null for a non-Bearer scheme', () => {
    assert.equal(extractBearer({ headers: { authorization: 'Basic xyz' } }), null);
});

test('createDefaultIdentityVerifier: verified request resolves with the real userId', async () => {
    const verify = createDefaultIdentityVerifier(SECRET);
    const token = signAssertion('user-99', SECRET);
    const result = await verify({ headers: { authorization: `Bearer ${token}` } });
    assert.equal(result.verified, true);
    assert.equal(result.userId, 'user-99');
});

test('createDefaultIdentityVerifier: fails closed with no Authorization header', async () => {
    const verify = createDefaultIdentityVerifier(SECRET);
    const result = await verify({ headers: {} });
    assert.equal(result.verified, false);
});

test('createDefaultIdentityVerifier requires a secret', () => {
    assert.throws(() => createDefaultIdentityVerifier(), TypeError);
});
