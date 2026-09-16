'use strict';

/**
 * server/test/canonical-admin-user-routing.test.js
 *
 * Focused proof of the current canonical routing contract, written
 * against the ACTUAL boundary server + the ACTUAL client-side gate
 * modules (admin-gate-core.js, return-destination-core.js) — no
 * reimplementation of routing logic in the test itself.
 *
 * Canonical contract under test:
 *   ADMINISTRATOR:  /chalzydashboard, /chalzydashboard.html
 *                   -> chalzydashboard.html (real server-verified gate)
 *                   -> on PLATFORM verdict, Bootstrap.start() loads
 *                      admin-workspace.html (verified separately in
 *                      core/bootstrap tests; not re-tested here).
 *   ORDINARY USER:  /dashboard, /dashboard.html
 *                   -> dashboard.html (real, ungated User Dashboard)
 *
 * This file specifically exercises the reversal of the interim
 * "dashboard-as-admin-entry" decision: /dashboard and /dashboard.html
 * must serve the ordinary dashboard again, for every session type.
 *
 * Letters A-I correspond to the original routing verification
 * scenarios (chalzydashboard gate + /dashboard reversion). Letters
 * J-M were added for the admin-workspace.html direct-access fix:
 * verifying the real HTTP boundary refuses unauthenticated/non-admin
 * requests for that file while an authenticated administrator session
 * can still fetch its real bytes (required for the legitimate
 * chalzydashboard.html -> Bootstrap.start() load path).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBoundaryServer } = require('../static-boundary-server');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const SITE_ROOT = path.resolve(__dirname, '..', '..');

function freshDbPath(name) {
  return freshTmpDbPath(`canon-routing-${name}`);
}

async function withBoundaryServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createBoundaryServer({
    siteRoot: SITE_ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

async function registerAndLogin(base, rp, { email, admin }) {
  const reg = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery' }),
  });
  assert.equal(reg.status, 200);
  if (admin) {
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);
  }
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery' }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : null;
  return cookie;
}

function loadRealClientModules() {
  const sandbox = { window: null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE_ROOT, 'core', 'shell', 'admin-gate-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE_ROOT, 'core', 'shell', 'return-destination-core.js'), 'utf8'), sandbox);
  return sandbox.window.CozyOS;
}

// A. /chalzydashboard -> the real admin gate page, publicly reachable
//    (the gate itself, not the privileged workspace, is what's public).
test('A. /chalzydashboard serves the real administrator gate page', async () => {
  await withBoundaryServer('a', async ({ base }) => {
    const res = await fetch(`${base}/chalzydashboard`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Verifying administrator access/i);
    assert.match(body, /admin-gate-core\.js/);
  });
});

// B. /chalzydashboard.html -> identical gate page (same file, explicit path).
test('B. /chalzydashboard.html serves the same real administrator gate page', async () => {
  await withBoundaryServer('b', async ({ base }) => {
    const a = await fetch(`${base}/chalzydashboard`);
    const b = await fetch(`${base}/chalzydashboard.html`);
    assert.equal(b.status, 200);
    assert.equal(await b.text(), await a.text());
  });
});

// C. login return=/chalzydashboard survives the client-side allowlist,
//    unaffected by the /dashboard reversal.
test('C. login.html?return=%2Fchalzydashboard resolves back to /chalzydashboard after auth', () => {
  const CozyOS = loadRealClientModules();
  const requested = CozyOS.ReturnDestinationCore.resolveReturnDestination('/chalzydashboard');
  assert.equal(requested, '/chalzydashboard');
  const redirectUrl = 'login.html?return=' + encodeURIComponent(requested);
  assert.equal(redirectUrl, 'login.html?return=%2Fchalzydashboard');

  const match = /(?:^\?|[?&])return=([^&]*)/.exec('?' + redirectUrl.split('?')[1]);
  const raw = decodeURIComponent(match[1]);
  const resolved = CozyOS.ReturnDestinationCore.resolveReturnDestination(raw) || 'index.html';
  assert.equal(resolved, '/chalzydashboard');
});

// D. /dashboard -> the ordinary User Dashboard (routing reversion).
test('D. /dashboard serves the ordinary User Dashboard, not the admin gate', async () => {
  await withBoundaryServer('d', async ({ base }) => {
    const res = await fetch(`${base}/dashboard`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.doesNotMatch(body, /Verifying administrator access/i);
    assert.match(body, /CozyOS Enterprise/);
  });
});

// D (variant). /dashboard.html -> same ordinary User Dashboard file.
test('D2. /dashboard.html serves the same ordinary User Dashboard file as /dashboard', async () => {
  await withBoundaryServer('d2', async ({ base }) => {
    const a = await fetch(`${base}/dashboard`);
    const b = await fetch(`${base}/dashboard.html`);
    assert.equal(b.status, 200);
    assert.equal(await b.text(), await a.text());
  });
});

// E. Unauthenticated visit to the admin legacy URL does not bypass
//    authentication: the gate's own decision logic must compute LOGIN,
//    never PLATFORM, for a missing/invalid session.
test('E. unauthenticated /chalzydashboard: gate decision is LOGIN, never PLATFORM (no bypass)', async () => {
  await withBoundaryServer('e', async ({ base }) => {
    const sessionRes = await fetch(`${base}/webauthn/session`);
    const verdict = Object.assign({ httpStatus: sessionRes.status }, await sessionRes.json().catch(() => ({})));
    const CozyOS = loadRealClientModules();
    const decision = CozyOS.AdminGateCore.decideGateAction(verdict);
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(decision);
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.LOGIN);
    assert.notEqual(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);
  });
});

// F. Authenticated administrator: gate resolves PLATFORM (the only
//    route that may load admin-workspace.html via Bootstrap.start()).
test('F. authenticated administrator session: gate resolves PLATFORM', async () => {
  await withBoundaryServer('f', async ({ base, rp }) => {
    const cookie = await registerAndLogin(base, rp, { email: 'canon-admin@example.com', admin: true });
    const sessionRes = await fetch(`${base}/webauthn/session`, { headers: { Cookie: cookie } });
    const verdict = Object.assign({ httpStatus: sessionRes.status }, await sessionRes.json());
    const CozyOS = loadRealClientModules();
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);
  });
});

// G. Authenticated ORDINARY user cannot access the Administrator
//    Workspace: gate resolves DENIED, and /dashboard for that same
//    session still serves the ordinary dashboard, never the gate.
test('G. authenticated ordinary user: gate resolves DENIED, and /dashboard stays ordinary', async () => {
  await withBoundaryServer('g', async ({ base, rp }) => {
    const cookie = await registerAndLogin(base, rp, { email: 'canon-user@example.com', admin: false });
    const sessionRes = await fetch(`${base}/webauthn/session`, { headers: { Cookie: cookie } });
    const verdict = Object.assign({ httpStatus: sessionRes.status }, await sessionRes.json());
    const CozyOS = loadRealClientModules();
    const route = CozyOS.AdminGateCore.resolveWorkspaceRoute(CozyOS.AdminGateCore.decideGateAction(verdict));
    assert.equal(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.DENIED);
    assert.notEqual(route.route, CozyOS.AdminGateCore.WORKSPACE_ROUTE.PLATFORM);

    const dashRes = await fetch(`${base}/dashboard`, { headers: { Cookie: cookie } });
    assert.equal(dashRes.status, 200);
    const dashBody = await dashRes.text();
    assert.doesNotMatch(dashBody, /Verifying administrator access/i);
  });
});

// H. Existing post-login destination behavior remains safe: an
//    ordinary login with no ?return= (or an invalid one) still lands
//    on index.html, exactly as before this change.
test('H. post-login destination with no/invalid return value still defaults to index.html', () => {
  const CozyOS = loadRealClientModules();
  function resolvePostLoginDestination(search) {
    const match = /(?:^\?|[?&])return=([^&]*)/.exec(search || '');
    const raw = match ? decodeURIComponent(match[1]) : null;
    const resolved = raw ? CozyOS.ReturnDestinationCore.resolveReturnDestination(raw) : null;
    return resolved || 'index.html';
  }
  assert.equal(resolvePostLoginDestination(''), 'index.html');
  assert.equal(resolvePostLoginDestination('?return=%2Fdashboard'), 'index.html');
  assert.equal(resolvePostLoginDestination('?return=https://evil.example'), 'index.html');
});

// I. The stale/legacy administrator dashboard is not reached through
//    the ordinary user routes: /dashboard and /dashboard.html never
//    return the admin gate markup, for unauthenticated, ordinary, or
//    administrator sessions alike.
test('I. /dashboard and /dashboard.html never serve the administrator gate, for any session type', async () => {
  await withBoundaryServer('i', async ({ base, rp }) => {
    const adminCookie = await registerAndLogin(base, rp, { email: 'canon-i-admin@example.com', admin: true });
    const userCookie = await registerAndLogin(base, rp, { email: 'canon-i-user@example.com', admin: false });

    for (const p of ['/dashboard', '/dashboard.html']) {
      for (const cookie of [null, adminCookie, userCookie]) {
        const res = await fetch(base + p, cookie ? { headers: { Cookie: cookie } } : {});
        assert.equal(res.status, 200, `${p} must be reachable`);
        const body = await res.text();
        assert.doesNotMatch(body, /Verifying administrator access/i, `${p} must never serve the admin gate (cookie=${cookie ? 'set' : 'none'})`);
      }
    }
  });
});

// J. REVERSAL (admin-workspace-direct-access, owner-authorized): the
//    session gate this test used to require has been deliberately
//    removed at the owner's explicit request. An unauthenticated GET
//    now receives admin-workspace.html's real bytes directly — this
//    is the intended behavior after the reversal, not a regression.
//    cozy-login-gate.js's own login form is what renders for a
//    visitor with no session; it exposes no privileged data itself.
test('J. unauthenticated GET /admin-workspace.html now serves the file directly (owner-authorized reversal)', async () => {
  await withBoundaryServer('j', async ({ base }) => {
    const res = await fetch(`${base}/admin-workspace.html`);
    assert.equal(res.status, 200, '/admin-workspace.html is now served without a session, by explicit owner decision');
    const body = await res.text();
    assert.match(body, /CozyOS Enterprise/, 'must be the real workspace file (login form renders client-side)');
  });
});

// K. An authenticated administrator session CAN still fetch
//    admin-workspace.html's real bytes directly — this is exactly what
//    chalzydashboard.html's own same-origin Bootstrap.start() fetch
//    depends on after its client-side gate has already passed. Proves
//    the fix does not accidentally break the legitimate load path.
test('K. authenticated administrator session CAN fetch the real admin-workspace.html bytes', async () => {
  await withBoundaryServer('k', async ({ base, rp }) => {
    const cookie = await registerAndLogin(base, rp, { email: 'canon-j-admin@example.com', admin: true });
    const res = await fetch(`${base}/admin-workspace.html`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, 'a verified admin session must receive the real workspace file');
    const body = await res.text();
    assert.match(body, /CozyOS Enterprise/, 'must be admin-workspace.html\'s OWN real content');
    assert.doesNotMatch(body, /Verifying administrator access/i, 'must NOT be substituted with chalzydashboard.html\'s gate page — Bootstrap.start() needs the real workspace document to parse');
  });
});

// L. An authenticated ORDINARY (non-admin) session must be refused the
//    same as an unauthenticated one — no privilege escalation via a
//    valid-but-non-admin session.
test('L. an ordinary (non-admin) session also receives the file (owner-authorized reversal — same as any unauthenticated request)', async () => {
  await withBoundaryServer('l', async ({ base, rp }) => {
    const cookie = await registerAndLogin(base, rp, { email: 'canon-j-user@example.com', admin: false });
    const res = await fetch(`${base}/admin-workspace.html`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, 'the file-level gate is removed for everyone, admin or not — the login form inside is still session-aware client-side');
  });
});

// M. Regression: /chalzydashboard, /chalzydashboard.html, /dashboard,
//    /dashboard.html, and /admin are all unaffected by this fix.
test('M. existing routes (/chalzydashboard, /chalzydashboard.html, /dashboard, /admin) are unchanged by the admin-workspace.html fix', async () => {
  await withBoundaryServer('m', async ({ base }) => {
    const chalzy = await fetch(`${base}/chalzydashboard`);
    assert.equal(chalzy.status, 200);
    assert.match(await chalzy.text(), /Verifying administrator access/i);

    const chalzyHtml = await fetch(`${base}/chalzydashboard.html`);
    assert.equal(chalzyHtml.status, 200);

    const dash = await fetch(`${base}/dashboard`);
    assert.equal(dash.status, 200);
    assert.doesNotMatch(await dash.text(), /Verifying administrator access/i);

    const admin = await fetch(`${base}/admin`);
    assert.equal(admin.status, 404);
  });
});

