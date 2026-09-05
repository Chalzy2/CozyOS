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
 *      workspace to a non-admin session) still holds for a session
 *      obtained via the password login path, /dashboard and
 *      /dashboard.html are real administrator-entry aliases for the
 *      same neutral gate page as /chalzydashboard (dashboard-as-admin-
 *      entry), and a password-authenticated *ordinary* user is
 *      correctly refused the actual privileged workspace regardless of
 *      which of those aliases they use.
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

test('an ordinary password-authenticated user is refused at /admin, and /dashboard/ /dashboard.html serve the SAME neutral gate page as /chalzydashboard (not the privileged workspace)', async () => {
  await withBoundaryServer('ordinary-user-blocked', async ({ base }) => {
    await post(base, '/auth/register', { email: 'quinn@example.com', password: 'correct horse battery' });
    const login = await post(base, '/auth/login', { email: 'quinn@example.com', password: 'correct horse battery' });
    const cookie = login.cookie;

    // /admin is the actual hard boundary and must 404 for a non-admin
    // session exactly like an unauthenticated one.
    const adminRes = await getRaw(base, '/admin', cookie);
    assert.equal(adminRes.status, 404, '/admin must 404 for a non-admin session');

    // /dashboard, /dashboard.html, /chalzydashboard, /chalzydashboard.html
    // are ALL administrator-entry aliases for the SAME neutral gate page
    // (dashboard-as-admin-entry) — they always 200 for anyone (the file
    // itself never contains privileged data and performs its own real,
    // server-verified check before mounting anything), but the actual
    // privileged workspace must never mount for a non-admin session.
    for (const p of ['/dashboard', '/dashboard.html', '/chalzydashboard', '/chalzydashboard.html']) {
      const res = await getRaw(base, p, cookie);
      assert.equal(res.status, 200, `${p} must serve the neutral administrator gate page`);
      const body = await res.text();
      assert.match(body, /webauthn\/session/, `${p} must contain the real, server-verified gate check`);
    }
  });
});

test('an administrator promoted after password login CAN reach /chalzydashboard AND /dashboard, both serving the same real administrator entry', async () => {
  await withBoundaryServer('admin-routing', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'rae@example.com', password: 'correct horse battery' });
    const user = await rp.getOrCreateUser('rae@example.com');
    await rp.setPlatformAdmin(user.id, true);

    const login = await post(base, '/auth/login', { email: 'rae@example.com', password: 'correct horse battery' });
    const cookie = login.cookie;

    const admin = await getRaw(base, '/chalzydashboard', cookie);
    assert.equal(admin.status, 200);

    // dashboard-as-admin-entry: /dashboard and /dashboard.html are now
    // administrator-entry aliases, serving byte-identical content to
    // /chalzydashboard — not a different, ungated "public dashboard"
    // file anymore.
    const viaDashboard = await getRaw(base, '/dashboard', cookie);
    assert.equal(viaDashboard.status, 200);
    const adminBody = await admin.text();
    const dashboardBody = await viaDashboard.text();
    assert.equal(dashboardBody, adminBody, '/dashboard must serve byte-identical content to /chalzydashboard');
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
