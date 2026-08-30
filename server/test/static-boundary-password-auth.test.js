'use strict';

/**
 * server/test/static-boundary-password-auth.test.js
 * Phase B — static-boundary-server.js password-auth pass-through
 *
 * Confirms two things together, mirroring static-boundary-firebase.test.js:
 *   1. /auth/register, /auth/login, /auth/password/forgot and
 *      /auth/password/reset actually work THROUGH the boundary server
 *      (not just against server/webauthn-rp/server.js directly) — i.e.
 *      the boundary server's `/auth/` prefix delegation and its
 *      emailProvider/smsProvider/rate-limit forwarding are wired
 *      correctly.
 *   2. The hard route boundary (/admin never exposes the administrator
 *      workspace to a non-admin session, and /dashboard, /dashboard.html
 *      never expose it to ANY session, admin or not) still holds for a
 *      session obtained via the password login path, and a
 *      password-authenticated *ordinary* user is correctly refused at
 *      /chalzydashboard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBoundaryServer } = require('../static-boundary-server');
const { MockEmailProvider } = require('../webauthn-rp/delivery-provider');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const SITE_ROOT = path.resolve(__dirname, '..', '..');

function freshDbPath(name) {
  return freshTmpDbPath(`boundary-pw-${name}`);
}

async function withBoundaryServer(name, fn) {
  const dbPath = freshDbPath(name);
  const emailProvider = new MockEmailProvider();
  const server = createBoundaryServer({
    siteRoot: SITE_ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
    emailProvider,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, emailProvider });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

async function post(base, p, body, cookie) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function getRaw(base, p, cookie) {
  return fetch(base + p, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
}

test('password register/login/forgot/reset all work through the boundary server', async () => {
  await withBoundaryServer('lifecycle', async ({ base, emailProvider }) => {
    const reg = await post(base, '/auth/register', { email: 'pat@example.com', password: 'correct horse battery' });
    assert.equal(reg.status, 200);

    const login = await post(base, '/auth/login', { email: 'pat@example.com', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);

    const forgot = await post(base, '/auth/password/forgot', { email: 'pat@example.com' });
    assert.equal(forgot.status, 200);
    assert.equal(emailProvider.sent.length, 1);

    const url = new URL(emailProvider.sent[0].text.match(/https?:\/\/\S+/)[0]);
    const token = url.searchParams.get('token');
    const reset = await post(base, '/auth/password/reset', { token, newPassword: 'brand new password' });
    assert.equal(reset.status, 200);
  });
});

test('an ordinary password-authenticated user is refused at /admin but reaches the public User Dashboard at /dashboard and /dashboard.html', async () => {
  await withBoundaryServer('ordinary-user-blocked', async ({ base }) => {
    await post(base, '/auth/register', { email: 'quinn@example.com', password: 'correct horse battery' });
    const login = await post(base, '/auth/login', { email: 'quinn@example.com', password: 'correct horse battery' });
    const cookie = login.cookie;

    // /chalzydashboard itself always 200s (it's the neutral gate page that
    // performs its own client check and shows Access Denied — see
    // static-boundary-server.js's own comment on ADMIN_CANONICAL_ROUTE);
    // /admin is the actual hard boundary and must 404 for a non-admin
    // session exactly like an unauthenticated one.
    const adminRes = await getRaw(base, '/admin', cookie);
    assert.equal(adminRes.status, 404, '/admin must 404 for a non-admin session');

    // /dashboard and /dashboard.html are the public User Dashboard route
    // (RP-ADMIN-ROUTING-SPLIT) — always 200, never gated.
    for (const p of ['/dashboard', '/dashboard.html']) {
      const res = await getRaw(base, p, cookie);
      assert.equal(res.status, 200, `${p} must serve the public User Dashboard for a non-admin session`);
    }
  });
});

test('an administrator promoted after password login CAN reach /chalzydashboard, and /dashboard.html still only ever serves the public User Dashboard', async () => {
  await withBoundaryServer('admin-routing', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'rae@example.com', password: 'correct horse battery' });
    const user = rp.getOrCreateUser('rae@example.com');
    rp.setPlatformAdmin(user.id, true);

    const login = await post(base, '/auth/login', { email: 'rae@example.com', password: 'correct horse battery' });
    const cookie = login.cookie;

    const admin = await getRaw(base, '/chalzydashboard', cookie);
    assert.equal(admin.status, 200);

    // The canonical administrator route is /chalzydashboard only.
    // /dashboard.html must serve the public User Dashboard even for a
    // verified administrator session — it is never an alias for the
    // admin workspace anymore.
    const legacy = await getRaw(base, '/dashboard.html', cookie);
    assert.equal(legacy.status, 200);
    const legacyBody = await legacy.text();
    assert.doesNotMatch(legacyBody, /cozy-admin-workspace\.js/, '/dashboard.html must never return admin workspace content, even to an admin session');
  });
});

test('an unauthenticated request to /auth/providers/status still works (read-only, no session required)', async () => {
  await withBoundaryServer('provider-status', async ({ base }) => {
    const res = await fetch(base + '/auth/providers/status');
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.email.configured, true);
  });
});
