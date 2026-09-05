'use strict';

/**
 * server/test/static-boundary-firebase.test.js
 * Session-unification milestone — static-boundary-server.js Firebase pass-through
 *
 * Confirms two things together, since they're only meaningful in
 * combination:
 *   1. The boundary server actually forwards firebaseProjectId/
 *      fetchGoogleCerts down to the mounted WebAuthn API, so
 *      POST /webauthn/firebase/session works THROUGH the boundary, not
 *      just against server/webauthn-rp/server.js directly.
 *   2. The hard route boundary (/admin never exposes the administrator
 *      workspace to a non-admin session; /dashboard and /dashboard.html
 *      never expose it to ANY session, admin or not) still holds for a
 *      session obtained via that Firebase path — not just for
 *      WebAuthn-issued sessions, which the pre-existing reference test
 *      suite already covers.
 *
 * Offline RSA harness — identical technique to
 * server/webauthn-rp/test/firebase-verify.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createBoundaryServer } = require('../static-boundary-server');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';
const SITE_ROOT = path.resolve(__dirname, '..', '..');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

async function fetchGoogleCerts() {
  return { [KID]: PUBLIC_KEY_PEM };
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({ uid, email, now = Math.floor(Date.now() / 1000) }) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: true,
    exp: now + 3600,
    iat: now - 1,
    auth_time: now - 1,
  }));
  const signedData = `${header}.${payload}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), privateKey));
  return `${signedData}.${signature}`;
}

function freshDbPath(name) {
  return freshTmpDbPath(`boundary-firebase-${name}`);
}

async function withBoundaryServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createBoundaryServer({
    siteRoot: SITE_ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
    firebaseProjectId: PROJECT_ID, fetchGoogleCerts,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, rp: server.rp });
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
  return setCookie ? setCookie.split(';')[0] : null;
}

test('POST /webauthn/firebase/session works through the boundary server, not just the bare RP server', async () => {
  await withBoundaryServer('works-through', async ({ base }) => {
    const token = makeIdToken({ uid: 'fb-uid-1', email: 'person@example.com' });
    const res = await fetch(`${base}/webauthn/firebase/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(extractCookie(res));
  });
});

test('a Firebase-issued session still cannot reach /admin, and /dashboard/ /dashboard.html serve the same neutral gate as /chalzydashboard', async () => {
  await withBoundaryServer('boundary-holds', async ({ base, rp }) => {
    const token = makeIdToken({ uid: 'fb-uid-nonadmin', email: 'nonadmin@example.com' });
    const login = await fetch(`${base}/webauthn/firebase/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    const cookie = extractCookie(login);

    // dashboard-as-admin-entry: /dashboard and /dashboard.html are
    // administrator-entry aliases for the SAME neutral gate page as
    // /chalzydashboard (see static-boundary-server.js's
    // ADMIN_CANONICAL_ROUTES) — always reachable (the file itself never
    // contains privileged data and performs its own real,
    // server-verified check), but only /admin is the actual hard
    // boundary that must 404 for a non-admin session.
    for (const adminRoute of ['/dashboard', '/dashboard.html', '/chalzydashboard']) {
      const res = await fetch(base + adminRoute, { headers: { Cookie: cookie } });
      assert.equal(res.status, 200, `${adminRoute} is a real administrator-entry alias and must be reachable`);
    }
    const adminRes = await fetch(`${base}/admin`, { headers: { Cookie: cookie } });
    assert.equal(adminRes.status, 404, '/admin must not be reachable by a non-admin Firebase session');

    // Now grant admin (as the operator bootstrap CLI would) and confirm
    // the SAME Firebase-derived session/cookie now resolves as an admin
    // session at the ONE authoritative check (GET /webauthn/session,
    // the same endpoint chalzydashboard-gate-integration.test.js verifies
    // the client-side gate relies on) — proving the boundary reads
    // authorization from the DB, not from anything baked into the
    // cookie/session at issuance time.
    const user = await rp.db.get('SELECT * FROM users WHERE email = ?', ['nonadmin@example.com']);
    await rp.setPlatformAdmin(user.id, true);

    const sessionRes = await fetch(`${base}/webauthn/session`, { headers: { Cookie: cookie } });
    const sessionJson = await sessionRes.json();
    assert.equal(sessionJson.isPlatformAdmin, true);
  });
});

test('/chalzydashboard is served publicly (the client-side gate does the real check) via the boundary', async () => {
  await withBoundaryServer('canonical-entry', async ({ base }) => {
    const res = await fetch(`${base}/chalzydashboard`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<html/i);
  });
});
