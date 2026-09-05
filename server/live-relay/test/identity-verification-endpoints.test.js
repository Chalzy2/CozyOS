'use strict';

/**
 * server/live-relay/test/identity-verification-endpoints.test.js
 * STEP 4D-B Phase 6 — Authenticated Identity Bridge
 *
 * HARNESS DISCLOSURE: a real LiveDistributionSignalingServer instance on
 * a real loopback TCP port, real LdceRosterBridge + SessionAuthority
 * (same wiring as the module's own bootstrap and the pre-existing test
 * suite), real fetch() HTTP calls. Confirms two things:
 *   1. REGRESSION: with no verifyIdentity configured, both endpoints
 *      behave exactly as before this patch (URL userId trusted).
 *   2. NEW: with verifyIdentity configured, both endpoints now reject a
 *      request whose verified identity doesn't match the URL userId,
 *      and reject a request with no verifiable identity at all.
 *
 * Run: node --test server/live-relay/test/identity-verification-endpoints.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const { LdceRosterBridge } = require('../ldce-roster-bridge');
const { SessionAuthority } = require('../session-authority');
const { signAssertion, createDefaultIdentityVerifier } = require('../identity-assertion');

const SECRET = 'test-secret-do-not-use-in-production';
const IDENTITY_SECRET = 'test-identity-secret-do-not-use-in-production';

async function startServer(opts = {}) {
    const rosterBridge = new LdceRosterBridge();
    const authority = new SessionAuthority({ secret: SECRET, roleResolver: rosterBridge.roleResolver });
    const server = new LiveDistributionSignalingServer(Object.assign(
        { secret: SECRET, authority, rosterBridge },
        opts,
    ));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, rosterBridge, authority, httpUrl: `http://127.0.0.1:${addr.port}` };
}

async function post(httpUrl, path, headers = {}) {
    const res = await fetch(`${httpUrl}${path}`, { method: 'POST', headers });
    return { status: res.status, body: await res.json() };
}

test('regression: register-host + token endpoints work exactly as before when verifyIdentity is absent', async () => {
    const { server, httpUrl } = await startServer();
    try {
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a');
        assert.equal(reg.status, 200);
        assert.equal(reg.body.success, true);

        const tok = await post(httpUrl, '/session/svc-1/token/host-a');
        assert.equal(tok.status, 200);
        assert.equal(tok.body.success, true);
        assert.equal(tok.body.role, 'host');
    } finally {
        await server.close();
    }
});

test('getHealthReport discloses identityVerificationEnforced honestly', async () => {
    const unenforced = await startServer();
    const enforced = await startServer({ verifyIdentity: createDefaultIdentityVerifier(IDENTITY_SECRET) });
    try {
        assert.equal(unenforced.server.getHealthReport().capability.identityVerificationEnforced, false);
        assert.equal(enforced.server.getHealthReport().capability.identityVerificationEnforced, true);
    } finally {
        await unenforced.server.close();
        await enforced.server.close();
    }
});

test('with verifyIdentity configured: register-host rejects a mismatched identity', async () => {
    const { server, httpUrl } = await startServer({ verifyIdentity: createDefaultIdentityVerifier(IDENTITY_SECRET) });
    try {
        const token = signAssertion('someone-else', IDENTITY_SECRET);
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a', { authorization: `Bearer ${token}` });
        assert.equal(reg.status, 403);
        assert.equal(reg.body.success, false);
    } finally {
        await server.close();
    }
});

test('with verifyIdentity configured: register-host rejects a missing identity', async () => {
    const { server, httpUrl } = await startServer({ verifyIdentity: createDefaultIdentityVerifier(IDENTITY_SECRET) });
    try {
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a');
        assert.equal(reg.status, 403);
        assert.equal(reg.body.success, false);
    } finally {
        await server.close();
    }
});

test('with verifyIdentity configured: register-host succeeds when identity matches, then token mint succeeds the same way', async () => {
    const { server, httpUrl } = await startServer({ verifyIdentity: createDefaultIdentityVerifier(IDENTITY_SECRET) });
    try {
        const hostToken = signAssertion('host-a', IDENTITY_SECRET);
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a', { authorization: `Bearer ${hostToken}` });
        assert.equal(reg.status, 200);
        assert.equal(reg.body.success, true);

        const tok = await post(httpUrl, '/session/svc-1/token/host-a', { authorization: `Bearer ${hostToken}` });
        assert.equal(tok.status, 200);
        assert.equal(tok.body.success, true);
        assert.equal(tok.body.role, 'host');
    } finally {
        await server.close();
    }
});

test('with verifyIdentity configured: a real participation token cannot be replayed as an identity assertion', async () => {
    const { server, httpUrl, authority } = await startServer({ verifyIdentity: createDefaultIdentityVerifier(IDENTITY_SECRET) });
    try {
        // Register the host (with a valid identity assertion) so a real
        // participation token can then be minted against a real roster.
        const identityToken = signAssertion('host-a', IDENTITY_SECRET);
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a', { authorization: `Bearer ${identityToken}` });
        assert.equal(reg.body.success, true);
        const minted = authority.issueToken('svc-1', 'host-a');
        assert.equal(minted.success, true);

        const replay = await post(httpUrl, '/session/svc-1/token/host-a', { authorization: `Bearer ${minted.token}` });
        assert.equal(replay.status, 403);
        assert.equal(replay.body.success, false);
    } finally {
        await server.close();
    }
});
