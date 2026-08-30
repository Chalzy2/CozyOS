/**
 * server/test/chalzydashboard-return-to-integration.test.js
 *
 * C14B return-to fix. Composes the REAL running server (real WebAuthn
 * registration/login, real SQLite, real /webauthn/session), the REAL
 * admin-gate-core.js decision logic, and the REAL
 * return-destination-core.js allowlist together — the same real pieces
 * chalzydashboard.html's and login.html's own <script> tags load,
 * minus an actual browser DOM (see chalzydashboard-gate-integration.
 * test.js's own header for why: no network access to install
 * Playwright in this sandbox). This is the closest feasible proof,
 * short of a real browser, that:
 *   1. an unauthenticated visit to /chalzydashboard computes the exact
 *      redirect chalzydashboard.html's script would issue, and
 *   2. that exact query string, fed into login.html's real
 *      resolvePostLoginDestination() logic, resolves back to
 *      /chalzydashboard (never anywhere else), while
 *   3. the actual admin/non-admin verdict for that returning visitor
 *      still comes ONLY from the real, unmodified server-side gate —
 *      this fix changes zero authorization logic.
 *
 * Run with: node --test server/test/chalzydashboard-return-to-integration.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBoundaryServer } = require('../static-boundary-server');
const { createVirtualAuthenticator } = require('../webauthn-rp/test/virtual-authenticator');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const SITE_ROOT = path.join(__dirname, '..', '..');

function freshDbPath() {
  return freshTmpDbPath('chalzy-return-to');
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
    email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
  });
  assert.equal(complete.status, 200, 'registration should succeed');

  const user = rp.getOrCreateUser(email);
  if (admin) rp.setPlatformAdmin(user.id, true);

  const authBegin = await post(base, '/webauthn/authenticate/begin', { email });
  const assertion = auth.authenticate(authBegin.json.challenge);
  const authComplete = await post(base, '/webauthn/authenticate/complete', {
    credentialId: assertion.credentialId, clientDataJSON: assertion.clientDataJSON,
    authenticatorData: assertion.authenticatorDataB64, signature: assertion.signatureB64,
  });
  assert.equal(authComplete.status, 200, 'authentication should succeed');
  return { cookie: extractCookie(authComplete.res) };
}

// Loads the REAL admin-gate-core.js + return-destination-core.js
// together, unmodified, into one sandbox — no stubbing of the
// decision logic itself.
function loadRealClientModules() {
  const sandbox = { window: null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE_ROOT, 'core', 'shell', 'admin-gate-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE_ROOT, 'core', 'shell', 'return-destination-core.js'), 'utf8'), sandbox);
  return sandbox.window.CozyOS;
}

// Mirrors chalzydashboard.html's real LOGIN-route branch exactly
// (same two calls, same order, same fallback) without needing a DOM.
function computeChalzyRedirect(CozyOS, requestedPath) {
  const requested = CozyOS.ReturnDestinationCore.resolveReturnDestination(requestedPath);
  return requested ? 'login.html?return=' + encodeURIComponent(requested) : 'login.html';
}

// Mirrors login.html's real resolvePostLoginDestination() exactly.
function resolvePostLoginDestination(CozyOS, search) {
  const match = /(?:^\?|[?&])return=([^&]*)/.exec(search || '');
  const raw = match ? decodeURIComponent(match[1]) : null;
  const resolved = raw ? CozyOS.ReturnDestinationCore.resolveReturnDestination(raw) : null;
  return resolved || 'index.html';
}

test('unauthenticated /chalzydashboard: real gate computes LOGIN, real redirect preserves the exact requested path', async () => {
  await withServer(async ({ base }) => {
    const verdict = await getSession(base, null);
    const CozyOS = loadRealClientModules();
    const decision = CozyOS.AdminGateCore.decideGateAction(verdict);
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(decision);
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.LOGIN);

    const redirect = computeChalzyRedirect(CozyOS, '/chalzydashboard');
    assert.equal(redirect, 'login.html?return=%2Fchalzydashboard');

    const search = '?' + redirect.split('?')[1];
    assert.equal(resolvePostLoginDestination(CozyOS, search), '/chalzydashboard');
  });
});

test('unauthenticated /chalzydashboard.html: same real flow, .html variant preserved exactly', async () => {
  await withServer(async ({ base }) => {
    const verdict = await getSession(base, null);
    const CozyOS = loadRealClientModules();
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.LOGIN);

    const redirect = computeChalzyRedirect(CozyOS, '/chalzydashboard.html');
    assert.equal(redirect, 'login.html?return=%2Fchalzydashboard.html');
    const search = '?' + redirect.split('?')[1];
    assert.equal(resolvePostLoginDestination(CozyOS, search), '/chalzydashboard.html');
  });
});

test('ordinary login (no return param) is completely unchanged: resolves to index.html', () => {
  const CozyOS = loadRealClientModules();
  assert.equal(resolvePostLoginDestination(CozyOS, ''), 'index.html');
  assert.equal(resolvePostLoginDestination(CozyOS, undefined), 'index.html');
});

test('real admin session returning via return=/chalzydashboard: gate resolves PLATFORM, never substituted for User Dashboard', async () => {
  await withServer(async ({ base, rp }) => {
    const { cookie } = await registerAndLogin(base, rp, { email: 'return-admin@example.com', admin: true });
    const verdict = await getSession(base, cookie);
    const CozyOS = loadRealClientModules();
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);
  });
});

test('real non-admin session returning via return=/chalzydashboard: gate resolves DENIED, never PLATFORM and never a User Dashboard substitution', async () => {
  await withServer(async ({ base, rp }) => {
    const { cookie } = await registerAndLogin(base, rp, { email: 'return-user@example.com', admin: false });
    const verdict = await getSession(base, cookie);
    const CozyOS = loadRealClientModules();
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.DENIED);
    assert.notEqual(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);
  });
});

test('attempted open redirect (return=https://evil.example) falls back to index.html, never navigates off-site', () => {
  const CozyOS = loadRealClientModules();
  assert.equal(resolvePostLoginDestination(CozyOS, '?return=https%3A%2F%2Fevil.example'), 'index.html');
  assert.equal(resolvePostLoginDestination(CozyOS, '?return=%2F%2Fevil.example'), 'index.html');
  assert.equal(resolvePostLoginDestination(CozyOS, '?return=javascript%3Aalert(1)'), 'index.html');
  assert.equal(resolvePostLoginDestination(CozyOS, '?return=%2Fadmin'), 'index.html');
});
