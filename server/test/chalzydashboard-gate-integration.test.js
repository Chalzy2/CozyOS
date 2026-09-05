/**
 * server/test/chalzydashboard-gate-integration.test.js
 *
 * Phase A (server-authoritative administrator boundary) integration test.
 * Drives the REAL static-boundary-server.js over real HTTP, using real
 * WebAuthn registration/authentication (via virtual-authenticator.js —
 * the same helper server/webauthn-rp/test/http-integration.test.js
 * uses), and asserts that GET /webauthn/session — the ONLY endpoint
 * Chalzydashboard.html's admin-gate-core.js consults — returns exactly
 * the shape the gate decision logic expects for:
 *   - no session at all
 *   - an authenticated, non-admin session
 *   - an authenticated, platform-admin session
 *
 * This does not execute Chalzydashboard.html's own <script> (that would
 * need a real browser DOM — see the repository's existing
 * "-browser.test.js" convention, which degrades to NOT_RUN when
 * Playwright isn't installed; this environment has no network access to
 * install it). What this test DOES prove, end to end and for real: the
 * server never lets a client obtain isPlatformAdmin:true except through
 * an actual admin-flagged database row, over a real HTTP round trip
 * with real session cookies.
 *
 * Run with: node --test server/test/chalzydashboard-gate-integration.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBoundaryServer } = require('../static-boundary-server');
const { createVirtualAuthenticator } = require('../webauthn-rp/test/virtual-authenticator');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const SITE_ROOT = path.join(__dirname, '..', '..');

function freshDbPath() {
  return freshTmpDbPath('chalzy-gate');
}

async function withServer(fn) {
  const dbPath = freshDbPath();
  const server = createBoundaryServer({ siteRoot: SITE_ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, rp: server.rp });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : null;
}

async function post(base, path_, body, cookie) {
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
}

async function getSession(base, cookie) {
  const res = await fetch(base + '/webauthn/session', { headers: cookie ? { Cookie: cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { httpStatus: res.status, ...json };
}

async function registerAndLogin(base, rp, { email, admin }) {
  const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
  const begin = await post(base, '/webauthn/register/begin', { email });
  const regResp = auth.register(begin.json.challenge);
  const complete = await post(base, '/webauthn/register/complete', {
    email,
    clientDataJSON: regResp.clientDataJSON,
    attestationObject: regResp.attestationObjectB64,
  });
  assert.equal(complete.status, 200, 'registration should succeed');

  const user = rp.getOrCreateUser(email);
  if (admin) rp.setPlatformAdmin(user.id, true);

  const authBegin = await post(base, '/webauthn/authenticate/begin', { email });
  const assertion = auth.authenticate(authBegin.json.challenge);
  const authComplete = await post(base, '/webauthn/authenticate/complete', {
    credentialId: assertion.credentialId,
    clientDataJSON: assertion.clientDataJSON,
    authenticatorData: assertion.authenticatorDataB64,
    signature: assertion.signatureB64,
  });
  assert.equal(authComplete.status, 200, 'authentication should succeed');
  return { cookie: extractCookie(authComplete.res), userId: user.id };
}

test('no cookie at all -> httpStatus 401, authenticated:false (AdminGateCore maps this to REDIRECT_TO_LOGIN)', async () => {
  await withServer(async ({ base }) => {
    const verdict = await getSession(base, null);
    assert.equal(verdict.httpStatus, 401);
    assert.equal(verdict.authenticated, undefined === verdict.authenticated ? verdict.authenticated : false);
    // The 401 body from server.js is exactly { authenticated: false }.
    assert.equal(verdict.authenticated, false);
  });
});

test('real, non-admin authenticated session -> httpStatus 200, isPlatformAdmin:false', async () => {
  await withServer(async ({ base, rp }) => {
    const { cookie } = await registerAndLogin(base, rp, { email: 'ordinary-user@example.com', admin: false });
    const verdict = await getSession(base, cookie);
    assert.equal(verdict.httpStatus, 200);
    assert.equal(verdict.authenticated, true);
    assert.equal(verdict.isPlatformAdmin, false);
  });
});

test('real, admin-flagged authenticated session -> httpStatus 200, isPlatformAdmin:true', async () => {
  await withServer(async ({ base, rp }) => {
    const { cookie } = await registerAndLogin(base, rp, { email: 'real-admin@example.com', admin: true });
    const verdict = await getSession(base, cookie);
    assert.equal(verdict.httpStatus, 200);
    assert.equal(verdict.authenticated, true);
    assert.equal(verdict.isPlatformAdmin, true);
  });
});

test('a non-admin session cookie cannot be used to reach an admin verdict no matter how many times it is re-checked', async () => {
  await withServer(async ({ base, rp }) => {
    const { cookie } = await registerAndLogin(base, rp, { email: 'repeat-check@example.com', admin: false });
    for (let i = 0; i < 5; i++) {
      const verdict = await getSession(base, cookie);
      assert.equal(verdict.isPlatformAdmin, false);
    }
  });
});

test('/chalzydashboard serves the gate page itself to anyone (it contains no privileged data, only the client-side call to /webauthn/session)', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(base + '/chalzydashboard');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /admin-gate-core\.js/, 'must load the server-authoritative gate module');
    assert.doesNotMatch(html, /isPlatformAdmin\s*\(\s*userId\s*\)/, 'must not call the old client-side IdentityEngine.isPlatformAdmin(userId) check');
  });
});

test('/dashboard.html always serves the public User Dashboard, never the admin workspace, regardless of session (RP-ADMIN-ROUTING-SPLIT)', async () => {
  await withServer(async ({ base, rp }) => {
    const noCookie = await fetch(base + '/dashboard.html');
    assert.equal(noCookie.status, 200);
    const noCookieHtml = await noCookie.text();
    assert.doesNotMatch(noCookieHtml, /cozy-admin-workspace\.js/, 'unauthenticated /dashboard.html must not load the admin workspace module');

    const { cookie: userCookie } = await registerAndLogin(base, rp, { email: 'dashboard-route-user@example.com', admin: false });
    const withUserCookie = await fetch(base + '/dashboard.html', { headers: { Cookie: userCookie } });
    assert.equal(withUserCookie.status, 200);

    const { cookie: adminCookie } = await registerAndLogin(base, rp, { email: 'dashboard-route-admin@example.com', admin: true });
    const withAdminCookie = await fetch(base + '/dashboard.html', { headers: { Cookie: adminCookie } });
    assert.equal(withAdminCookie.status, 200, 'an administrator session must still get the public User Dashboard at /dashboard.html, never the admin workspace here');
    const adminHtml = await withAdminCookie.text();
    assert.doesNotMatch(adminHtml, /cozy-admin-workspace\.js/, 'admin sessions must not receive admin workspace content at /dashboard.html either — the only admin entry is /chalzydashboard');
  });
});
