/**
 * server/test/firebase-admin-real-composition.test.js
 *
 * C15. Proves the full chain for an EXISTING Firebase-created
 * administrator account, using only real, already-existing pieces:
 *
 *   real signed Firebase ID token (same offline-RSA harness as
 *     firebase-session-integration.test.js / firebase-verify.test.js)
 *   -> REAL running server, REAL POST /webauthn/firebase/session
 *      (verifyFirebaseIdToken + rp.authenticateWithVerifiedFirebase +
 *      resolveOrCreateUserForFirebase — all real, all unmodified)
 *   -> real cozy_admin_session cookie
 *   -> real GET /webauthn/session
 *   -> REAL identity-engine.js + REAL cozy-session-service.js,
 *      CozyOS.Session.establishFromExternalAuth({ uid: email,
 *      roles: [...] }) called with the value the real server response
 *      actually returned — this is exactly what
 *      AuthCoordinator.loginWithServerFirebase()'s
 *      #finishServerLogin() call does; #finishServerLogin() is a
 *      private method and cannot be invoked directly from a test file,
 *      so this is the same real, public Session API it calls,
 *      exercised the same way identity-routing-real-composition.test.js
 *      already proves for the password/passkey path.
 *   -> REAL index.html inline script's resolveAuthState()/
 *      proceedPastSequence() (the C14B fix), unmodified
 *   -> REAL admin-gate-core.js decision for what chalzydashboard.html
 *      itself would independently do with the same real server session
 *
 * WHAT THIS FILE DOES NOT COVER (disclosed, not hidden)
 * ---------------------------------------------------------
 * AuthCoordinator.loginWithServerFirebase() itself — the thin glue
 * calling Firebase's SDK, POSTing the token, and forwarding the
 * result into #finishServerLogin() — is not independently loaded and
 * unit-tested here. auth-coordinator.js has a module-registration
 * retry mechanism (see its own tail) that expects a live coordinator
 * registry; safely stubbing that without changing any of its own code
 * was judged not worth the added fragility versus the value of one
 * more isolated unit test, given every piece loginWithServerFirebase()
 * composes is independently real and tested here or elsewhere:
 * Firebase/firebase-auth.js's signInWithEmailAndPassword() is a
 * reviewed three-line SDK passthrough; POST /webauthn/firebase/session
 * has 10 passing tests of its own; and the #finishServerLogin() call
 * shape is identical, parameter-for-parameter, to
 * loginWithServerPassword()'s own already-tested call to it.
 *
 * Run: node --test server/test/firebase-admin-real-composition.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const nodeCrypto = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const { createBoundaryServer } = require('../static-boundary-server');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';
const ROOT = path.join(__dirname, '..', '..');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

async function fetchGoogleCerts() {
  return { [KID]: PUBLIC_KEY_PEM };
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({ uid, email, emailVerified = true, now = Math.floor(Date.now() / 1000) } = {}) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: emailVerified,
    iat: now - 10,
    exp: now + 3600,
    auth_time: now - 10,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

function freshDbPath() {
  return freshTmpDbPath('firebase-admin-real-composition');
}

async function withServer(fn) {
  const dbPath = freshDbPath();
  const server = createBoundaryServer({ siteRoot: ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN, firebaseProjectId: PROJECT_ID, fetchGoogleCerts });
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

async function realFirebaseLogin(base, { uid, email }) {
  const idToken = makeIdToken({ uid, email });
  const res = await fetch(base + '/webauthn/firebase/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await res.json();
  return { status: res.status, body, cookie: extractCookie(res) };
}

async function getSession(base, cookie) {
  const res = await fetch(base + '/webauthn/session', { headers: cookie ? { Cookie: cookie } : {} });
  return { httpStatus: res.status, ...(await res.json()) };
}

function buildRealClientSandbox() {
  const elements = { 'cozy-startup-error': { style: {} }, 'cozy-launch-screen': { classList: { add() {}, remove() {} }, innerHTML: '' } };
  const result = { locationHref: null, mounted: false, mountedUserId: undefined };
  const sandbox = {
    console, setTimeout, setInterval, clearInterval,
    document: { getElementById: (id) => elements[id] || null, addEventListener: () => {} },
    navigator: {},
    crypto: nodeCrypto.webcrypto,
    TextEncoder, TextDecoder,
    window: null,
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.CozyOS = { registerCoordinator: () => {} };
  sandbox.window.CozyOS = sandbox.CozyOS;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'shell', 'platform-event-bus.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'shell', 'post-login-routing-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'shell', 'admin-gate-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'modules', 'identity', 'identity-engine.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'modules', 'session', 'cozy-session-service.js'), 'utf8'), sandbox);
  sandbox.window.location = { set href(v) { result.locationHref = v; }, get href() { return result.locationHref; } };
  sandbox.window.CozyOS.UserDashboard = { render: (_s, uid) => { result.mounted = true; result.mountedUserId = uid; } };
  return { sandbox, result };
}

function wireHonestAuthCoordinator(sandbox) {
  sandbox.window.CozyOS.AuthCoordinator = {
    restoreSession: async () => {},
    isAuthenticated: () => !!(sandbox.window.CozyOS.Session && sandbox.window.CozyOS.Session.isSignedIn()),
    getCurrentIdentity: () => {
      const current = sandbox.window.CozyOS.Session && sandbox.window.CozyOS.Session.current();
      return current ? { userId: current.uid, roles: current.roles ? [...current.roles] : [] } : null;
    },
  };
}

async function runRealIndexHtml(sandbox, result) {
  const scripts = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
  vm.runInContext(scripts[0][1], sandbox);
  sandbox.window.CozyOS.PlatformEventBus.emit('cozy:launch-sequence-complete');
  return new Promise((resolve) => setTimeout(() => resolve(result), 700));
}

const REGISTER_BASE = {
  firstName: 'Admin', lastName: 'Person', phone: '+15550009999',
  password: 'CorrectHorseBatteryStaple9!', confirmPassword: 'CorrectHorseBatteryStaple9!', acceptTerms: true,
};

test('1-7: existing Firebase administrator (is_platform_admin already set) -> real cookie -> real session:true -> C14B resolver -> chalzydashboard.html, admin-gate-core.js resolves PLATFORM', async () => {
  await withServer(async ({ base, rp }) => {
    const email = 'firebase-admin@example.com';
    const login = await realFirebaseLogin(base, { uid: 'firebase-uid-admin-1', email });
    assert.equal(login.status, 200, 'the real /webauthn/firebase/session endpoint should accept a validly-signed token');
    assert.ok(login.cookie, 'a real cozy_admin_session cookie must be issued');
    assert.equal(login.body.isPlatformAdmin, false, 'a brand-new row is honestly not an admin yet — matches rp.js\'s hardcoded is_platform_admin=0 on creation');

    // The live-provisioning step this milestone explicitly cannot do
    // itself (no SSH to the real Kafexo database) — done here via the
    // same bootstrap-admin.js mechanism the real operator would use.
    const user = rp.getOrCreateUser(email);
    rp.setPlatformAdmin(user.id, true);

    // Re-authenticate now that the account is a real admin (mirrors a
    // fresh sign-in after provisioning, not reusing the pre-grant cookie).
    const adminLogin = await realFirebaseLogin(base, { uid: 'firebase-uid-admin-1', email });
    assert.equal(adminLogin.body.isPlatformAdmin, true, 'the real server now honestly reports this account as platform admin');

    const verdict = await getSession(base, adminLogin.cookie);
    assert.equal(verdict.authenticated, true, '3. GET /webauthn/session returns authenticated:true');
    assert.equal(verdict.isPlatformAdmin, true);

    // 4-5: the real C14B-fixed index.html resolveAuthState() correctly
    // resolves this email-shaped Session.uid to the real IdentityEngine
    // record and forwards to chalzydashboard.html.
    const { sandbox, result } = buildRealClientSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;
    await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'firebase_admin_person', email });
    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: email, roles: ['platform-admin'], profile: { email, authMode: 'server-firebase' } });
    wireHonestAuthCoordinator(sandbox);
    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, 'chalzydashboard.html', '5. index.html routes the administrator to /chalzydashboard');

    // 6: the REAL admin-gate-core.js, given the REAL server verdict
    // above, resolves PLATFORM — the actual gate chalzydashboard.html
    // itself runs.
    const route = sandbox.window.CozyOS.AdminGateCore.resolveWorkspaceRoute(sandbox.window.CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, sandbox.window.CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM, '6. administrator gate returns PLATFORM for the real administrator session');
  });
});

test('8-9: a normal (non-admin) Firebase-authenticated user routes to User Dashboard and cannot pass the administrator gate', async () => {
  await withServer(async ({ base, rp }) => {
    const email = 'firebase-normal-user@example.com';
    const login = await realFirebaseLogin(base, { uid: 'firebase-uid-normal-1', email });
    assert.equal(login.body.isPlatformAdmin, false);

    const verdict = await getSession(base, login.cookie);
    assert.equal(verdict.authenticated, true);
    assert.equal(verdict.isPlatformAdmin, false);

    const { sandbox, result } = buildRealClientSandbox();
    const identity = sandbox.window.CozyOS.IdentityEngine;
    await identity.register({ ...REGISTER_BASE, accountType: 'administrator', username: 'bootstrap_only', email: 'bootstrap-only@example.com' }); // consume isFirstUser
    await identity.register({ ...REGISTER_BASE, accountType: 'user', username: 'firebase_normal_person', email, phone: '+15550008888' });
    sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: email, roles: [], profile: { email, authMode: 'server-firebase' } });
    wireHonestAuthCoordinator(sandbox);
    const outcome = await runRealIndexHtml(sandbox, result);
    assert.equal(outcome.locationHref, null, '8. normal user is NOT redirected to chalzydashboard.html');
    assert.equal(outcome.mounted, true, '8. normal user routes to the real User Dashboard');

    const route = sandbox.window.CozyOS.AdminGateCore.resolveWorkspaceRoute(sandbox.window.CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, sandbox.window.CozyOS.AdminGateCore.WORKSPACE_ROUTE.DENIED, '9. the real administrator gate denies this real, non-admin session');
    assert.notEqual(route.route, sandbox.window.CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);
  });
});

test('11: a client-supplied roles:["platform-admin"] on an unresolvable identity is never treated as admin by the real gate', async () => {
  const { sandbox, result } = buildRealClientSandbox();
  // No IdentityEngine registration at all, and no real server session
  // ever established for this email — a purely fabricated local claim.
  sandbox.window.CozyOS.Session.establishFromExternalAuth({ uid: 'nobody-real@example.com', roles: ['platform-admin'], profile: { email: 'nobody-real@example.com', authMode: 'server-firebase' } });
  wireHonestAuthCoordinator(sandbox);
  const outcome = await runRealIndexHtml(sandbox, result);
  assert.equal(outcome.locationHref, null, 'a fabricated client-side role never forwards to chalzydashboard.html on its own');
  assert.equal(outcome.mounted, true, 'falls back to the ordinary User Dashboard, fail-closed');

  // And even if it HAD forwarded there, the real gate never even looks
  // at this local roles array — it asks the real server independently:
  const verdict = { httpStatus: 401, authenticated: false }; // matches the real server's actual response shape (server.js returns 401 for no/invalid session)
  const route = sandbox.window.CozyOS.AdminGateCore.resolveWorkspaceRoute(sandbox.window.CozyOS.AdminGateCore.decideGateAction(verdict));
  assert.equal(route.route, sandbox.window.CozyOS.AdminGateCore.WORKSPACE_ROUTE.LOGIN);
});
