'use strict';

/**
 * server/live-relay/test/identity-route-integration.test.js
 * STEP 4D-B Phase 6 Patch #4 — Identity Route Integration
 *
 * HARNESS DISCLOSURE: a real LiveDistributionSignalingServer instance on
 * a real loopback TCP port, real fetch() HTTP calls, real RS256-signed
 * tokens built with a locally generated RSA keypair standing in for
 * Google's (fetchGoogleCerts injected — see firebase-identity-issuer.test.js
 * for why this is a real, not simulated, signature check).
 *
 * NOT VERIFIED (must stay honest, see STEP 5 of the build instructions):
 * live Google public-key retrieval and a real Firebase-signed-in user.
 * This sandbox has no network access, so that step cannot be performed
 * here. Everything downstream of the public-key fetch — signature
 * verification, claims checks, the HTTP route, and the existing
 * downstream endpoints — IS exercised for real.
 *
 * Run: node --test server/live-relay/test/identity-route-integration.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const { LdceRosterBridge } = require('../ldce-roster-bridge');
const { SessionAuthority } = require('../session-authority');
const { signAssertion } = require('../identity-assertion');

const SECRET = 'test-secret-do-not-use-in-production';
const IDENTITY_SECRET = 'test-identity-secret-do-not-use-in-production';
const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
    uid = 'user-abc',
    iss = `https://securetoken.google.com/${PROJECT_ID}`,
    aud = PROJECT_ID,
    now = Math.floor(Date.now() / 1000),
    exp = now + 3600,
    iat = now - 1,
    authTime = now - 1,
    kid = KID,
    signingKey = privateKey,
} = {}) {
    const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iss, aud, sub: uid, user_id: uid, exp, iat, auth_time: authTime }));
    const signedData = `${header}.${payload}`;
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), signingKey));
    return `${signedData}.${signature}`;
}

async function fetchGoogleCerts() {
    return { [KID]: PUBLIC_KEY_PEM };
}

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
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, body };
}

function firebaseIdentityOpts(extra = {}) {
    return {
        firebaseIdentity: Object.assign({ projectId: PROJECT_ID, identitySecret: IDENTITY_SECRET, fetchGoogleCerts }, extra),
    };
}

test('default-off: /identity/assertion is not registered when firebaseIdentity is absent (404, honest capability flag)', async () => {
    const { server, httpUrl } = await startServer();
    try {
        const res = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${makeIdToken()}` });
        assert.equal(res.status, 404);
        assert.equal(server.getHealthReport().capability.firebaseIdentityRouteEnabled, false);
    } finally {
        await server.close();
    }
});

test('capability report honestly discloses firebaseIdentityRouteEnabled:true when configured', async () => {
    const { server } = await startServer(firebaseIdentityOpts());
    try {
        assert.equal(server.getHealthReport().capability.firebaseIdentityRouteEnabled, true);
    } finally {
        await server.close();
    }
});

test('valid Firebase token: /identity/assertion returns a usable identity-assertion token that the existing seam accepts', async () => {
    const { server, httpUrl } = await startServer(Object.assign(
        firebaseIdentityOpts(),
        { verifyIdentity: require('../identity-assertion').createDefaultIdentityVerifier(IDENTITY_SECRET) },
    ));
    try {
        const idToken = makeIdToken({ uid: 'host-a' });
        const assertionRes = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${idToken}` });
        assert.equal(assertionRes.status, 200);
        assert.equal(assertionRes.body.success, true);
        assert.equal(assertionRes.body.userId, 'host-a');
        assert.ok(assertionRes.body.assertionToken);

        // The minted assertion now genuinely unlocks the pre-existing,
        // untouched register-host + token endpoints — the full chain.
        const reg = await post(httpUrl, '/session/svc-1/register-host/host-a', {
            authorization: `Bearer ${assertionRes.body.assertionToken}`,
        });
        assert.equal(reg.status, 200);
        assert.equal(reg.body.success, true);
    } finally {
        await server.close();
    }
});

test('missing Firebase token: /identity/assertion rejects with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const res = await post(httpUrl, '/identity/assertion');
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('invalid Firebase token: malformed token rejected with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const res = await post(httpUrl, '/identity/assertion', { authorization: 'Bearer not-a-real-token' });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('expired Firebase token rejected with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const now = Math.floor(Date.now() / 1000);
        const expired = makeIdToken({ now, exp: now - 10, iat: now - 3600, authTime: now - 3600 });
        const res = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${expired}` });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('wrong audience rejected with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const token = makeIdToken({ aud: 'some-other-project' });
        const res = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${token}` });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('wrong issuer rejected with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const token = makeIdToken({ iss: 'https://securetoken.google.com/some-other-project' });
        const res = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${token}` });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('tampered Firebase token (payload edited, stale signature) rejected with 401', async () => {
    const { server, httpUrl } = await startServer(firebaseIdentityOpts());
    try {
        const token = makeIdToken({ uid: 'host-a' });
        const [header, payload, sig] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        decoded.sub = 'someone-else';
        decoded.user_id = 'someone-else';
        const forged = `${header}.${b64url(JSON.stringify(decoded))}.${sig}`;
        const res = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${forged}` });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('spoofed URL requester: a valid Firebase token for USER_A cannot register-host as USER_B', async () => {
    const { server, httpUrl } = await startServer(Object.assign(
        firebaseIdentityOpts(),
        { verifyIdentity: require('../identity-assertion').createDefaultIdentityVerifier(IDENTITY_SECRET) },
    ));
    try {
        const idToken = makeIdToken({ uid: 'user-a' });
        const assertionRes = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${idToken}` });
        assert.equal(assertionRes.body.success, true);

        // Genuine assertion for user-a; URL claims user-b instead.
        const reg = await post(httpUrl, '/session/svc-1/register-host/user-b', {
            authorization: `Bearer ${assertionRes.body.assertionToken}`,
        });
        assert.equal(reg.status, 403);
        assert.equal(reg.body.success, false);
    } finally {
        await server.close();
    }
});

test('purpose isolation preserved: a real SessionAuthority participation token still cannot be used at /identity/assertion nor replayed as an identity assertion downstream', async () => {
    const { server, httpUrl, authority, rosterBridge } = await startServer(Object.assign(
        firebaseIdentityOpts(),
        { verifyIdentity: require('../identity-assertion').createDefaultIdentityVerifier(IDENTITY_SECRET) },
    ));
    try {
        rosterBridge.registerHost('svc-1', 'host-a');
        const minted = authority.issueToken('svc-1', 'host-a');
        assert.equal(minted.success, true);

        // A participation token is not a Firebase ID token — the issuer
        // route must reject it (it will fail JSON/JWT-shape parsing or
        // signature checks, never be silently accepted).
        const asFirebase = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${minted.token}` });
        assert.equal(asFirebase.status, 401);

        // And, per the pre-existing seam (already covered in
        // identity-verification-endpoints.test.js, re-asserted here at
        // the integration level): a participation token cannot be
        // replayed as an identity assertion either.
        const replay = await post(httpUrl, '/session/svc-1/token/host-a', { authorization: `Bearer ${minted.token}` });
        assert.equal(replay.status, 403);
    } finally {
        await server.close();
    }
});

test('endpoint enforcement: register-host and token endpoints both require the verified identity when enforcement is enabled', async () => {
    const { server, httpUrl } = await startServer(Object.assign(
        firebaseIdentityOpts(),
        { verifyIdentity: require('../identity-assertion').createDefaultIdentityVerifier(IDENTITY_SECRET) },
    ));
    try {
        const noAuthReg = await post(httpUrl, '/session/svc-1/register-host/host-a');
        assert.equal(noAuthReg.status, 403);

        const idToken = makeIdToken({ uid: 'host-a' });
        const assertionRes = await post(httpUrl, '/identity/assertion', { authorization: `Bearer ${idToken}` });
        await post(httpUrl, '/session/svc-1/register-host/host-a', { authorization: `Bearer ${assertionRes.body.assertionToken}` });

        const noAuthTok = await post(httpUrl, '/session/svc-1/token/host-a');
        assert.equal(noAuthTok.status, 403);

        const tok = await post(httpUrl, '/session/svc-1/token/host-a', { authorization: `Bearer ${assertionRes.body.assertionToken}` });
        assert.equal(tok.status, 200);
        assert.equal(tok.body.success, true);
    } finally {
        await server.close();
    }
});
