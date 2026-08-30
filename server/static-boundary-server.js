'use strict';
/**
 * CozyOS — Static Hosting Security Boundary (reference implementation)
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * cozyos.org is currently served from GitHub Pages, which is pure static
 * file hosting: it has no server-side code execution, so it cannot ever
 * decide "this request is/isn't an administrator" before returning a file.
 * A GitHub Pages deployment will *always* return the raw bytes of
 * dashboard.html to anyone who requests it, regardless of any JavaScript
 * gate inside that file. That is a hard platform limitation, not something
 * any amount of repository code can fix. See SECURITY-BOUNDARY-DEPLOYMENT.md
 * for the full explanation and the deployment change required to remove
 * this limitation.
 *
 * This file is the real, working shape of that fix: a small HTTP server
 * that (a) serves the CozyOS static site, (b) mounts the existing,
 * already-tested WebAuthn RP API (server/webauthn-rp), and (c) enforces
 * the canonical-route boundary at the HTTP layer, before any file bytes
 * are ever written to the response — so /admin and its aliases can never
 * return the administrator HTML to a request that doesn't carry a valid,
 * server-verified administrator session.
 *
 * ROUTING FIX (RP-ADMIN-ROUTING-SPLIT): /dashboard and /dashboard.html
 * are NOT administrator aliases anymore. They are the real, public User
 * Dashboard entry point (dashboard.html) and are served unconditionally,
 * the same as / and index.html — for every visitor, admin or not. The
 * ONLY route that may ever return the administrator HTML is
 * /chalzydashboard (and its exact-file alias /chalzydashboard.html).
 *
 * CURRENT STATUS — READ BEFORE DEPLOYING
 * ---------------------------------------
 * This server authorizes requests using ONLY the WebAuthn RP's own session
 * cookie (cozy_admin_session, issued by server/webauthn-rp). Session
 * unification work has added a SECOND way to obtain that same cookie:
 * POST /webauthn/firebase/session verifies a real Firebase ID token from
 * the existing CozyOS login (see server/webauthn-rp/firebase-verify.js)
 * and, only on cryptographic success, issues the identical
 * cozy_admin_session cookie the WebAuthn passkey flow issues. Both paths
 * converge on rp.resolveSession()/is_platform_admin — there is still only
 * ONE authoritative session model, now reachable from either login
 * method.
 *
 * What is NOT yet true: the actual browser-side login pages
 * (Chalzydashboard.html / login.html) do not yet CALL
 * /webauthn/firebase/session after a Firebase sign-in. This file and the
 * WebAuthn RP API are locally verified (see
 * server/webauthn-rp/test/http-integration.test.js and
 * server/webauthn-rp/test/firebase-session-integration.test.js); the
 * frontend wiring and the live cozyos.org domain are NOT verified. Do not
 * point cozyos.org's DNS/CDN at this server in blocking mode until the
 * frontend has actually been wired to call this endpoint and that has
 * been verified end-to-end (see the honest status table produced at the
 * end of this milestone's report).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer: createWebAuthnServer, SESSION_COOKIE, parseCookies } = require('./webauthn-rp/server');
const { openDb } = require('./webauthn-rp/db');
const { RelyingParty } = require('./webauthn-rp/rp');

// Canonical administrator entry. The ONLY route that may ever return the
// administrator application's HTML to a browser navigation request.
const ADMIN_CANONICAL_ROUTE = '/chalzydashboard';
const ADMIN_CANONICAL_FILE = 'chalzydashboard.html';

// The real, public User Dashboard entry point. Served unconditionally to
// everyone at both routes below — never gated, never redirected toward the
// administrator workspace, regardless of session/admin status.
const USER_DASHBOARD_FILE = 'dashboard.html';
const USER_DASHBOARD_ROUTES = new Set(['/dashboard', '/dashboard.html']);

// Every one of these must NEVER return the administrator HTML to a request
// that lacks a verified administrator session. Extend this list rather than
// special-casing new aliases elsewhere. /dashboard and /dashboard.html were
// removed from here (RP-ADMIN-ROUTING-SPLIT) — they are the public User
// Dashboard now, not administrator aliases.
const FORBIDDEN_ADMIN_ALIASES = new Set([
  '/admin',
  '/admin.html',
  '/administrator',
  '/administrator.html',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function safeJoin(root, requestPath) {
  const resolved = path.normalize(path.join(root, requestPath));
  if (!resolved.startsWith(path.normalize(root))) return null; // path traversal guard
  return resolved;
}

function createBoundaryServer({
  siteRoot,
  dbPath,
  rpId,
  rpName,
  origin,
  now = () => Date.now(),
  // Firebase project id CozyOS's existing login issues ID tokens for
  // (see Firebase/firebase-config.js — "cozycabin-affiliate"). Threaded
  // through to the mounted WebAuthn RP API so /webauthn/firebase/session
  // can verify those tokens; the boundary server itself never inspects
  // tokens directly, it only forwards this one piece of configuration.
  firebaseProjectId,
  // Test-only override for the Google public-cert fetch; see
  // firebase-verify.js. Left undefined in production so the real HTTPS
  // fetch is used.
  fetchGoogleCerts,
  // Password-recovery delivery providers (see webauthn-rp/delivery-provider.js)
  // and rate-limit knobs, forwarded straight through to the mounted
  // WebAuthn RP API — this file makes no delivery or rate-limit decisions
  // itself.
  emailProvider,
  smsProvider,
  forgotPasswordRateLimit,
  loginRateLimit,
} = {}) {
  const db = openDb(dbPath);
  const rp = new RelyingParty(db, { rpId, rpName, origin, now });

  function isVerifiedAdmin(req) {
    const cookies = parseCookies(req.headers.cookie);
    const session = rp.resolveSession(cookies[SESSION_COOKIE]);
    return !!(session && session.isPlatformAdmin);
  }

  function serveFile(res, absPath, status = 200) {
    fs.readFile(absPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(absPath).toLowerCase();
      res.writeHead(status, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  function denyPublicRoute(res) {
    // Deliberately indistinguishable from a normal 404 - never reveal that
    // an administrator route exists at this path.
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  const webauthnApi = createWebAuthnServer({
    dbPath, rpId, rpName, origin, now, firebaseProjectId, fetchGoogleCerts,
    emailProvider, smsProvider, forgotPasswordRateLimit, loginRateLimit,
  });

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://internal').pathname;

    // 1. WebAuthn RP API — delegate untouched to the existing, tested
    //    server. This now also includes the password-auth/reset routes
    //    under /auth/ (added in Phase B) — same delegation, same
    //    session-issuing authority, no boundary-server-side auth logic.
    if (pathname.startsWith('/webauthn/') || pathname.startsWith('/auth/')) {
      webauthnApi.emit('request', req, res);
      return;
    }

    // 2. Canonical administrator entry. This is a real, server-verified
    //    gate: unauthenticated/non-admin visitors get the SAME gate page
    //    (chalzydashboard.html performs its own real check and shows
    //    Access Denied) - the file itself never contains privileged data,
    //    so serving it to everyone is safe. The privileged workspace only
    //    mounts after the client's own check *and* every state-changing
    //    admin API call is independently re-authorized server-side by
    //    server/webauthn-rp's session checks.
    if (pathname === ADMIN_CANONICAL_ROUTE || pathname === `/${ADMIN_CANONICAL_FILE}`) {
      const abs = safeJoin(siteRoot, ADMIN_CANONICAL_FILE);
      return serveFile(res, abs);
    }

    // 2b. Public User Dashboard. Unconditional — served to every visitor
    //    exactly like index.html, admin session or not, no gate of any
    //    kind. This is the real fix for the requirement that "/dashboard"
    //    must never be treated as an administrator surface.
    if (USER_DASHBOARD_ROUTES.has(pathname)) {
      const abs = safeJoin(siteRoot, USER_DASHBOARD_FILE);
      return serveFile(res, abs);
    }

    // 3. Forbidden administrator aliases — the actual hard boundary.
    //    A request here NEVER receives the administrator HTML unless it
    //    carries a verified administrator session (defense in depth for
    //    legacy links/bookmarks/PWA shortcuts pointing at the old URL);
    //    everyone else gets an ordinary 404.
    if (FORBIDDEN_ADMIN_ALIASES.has(pathname)) {
      if (isVerifiedAdmin(req)) {
        const abs = safeJoin(siteRoot, ADMIN_CANONICAL_FILE);
        return serveFile(res, abs);
      }
      return denyPublicRoute(res);
    }

    // 4. Everything else: ordinary static file serving, public entry
    //    (index.html) as the default document.
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const abs = safeJoin(siteRoot, reqPath);
    if (!abs) return denyPublicRoute(res);
    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) return denyPublicRoute(res);
      serveFile(res, abs);
    });
  });

  server.rp = rp;
  server.db = db;
  return server;
}

module.exports = { createBoundaryServer, FORBIDDEN_ADMIN_ALIASES, ADMIN_CANONICAL_ROUTE };

// Allow `node server/static-boundary-server.js` for local/manual verification.
if (require.main === module) {
  const siteRoot = path.resolve(__dirname, '..');

  // Real email-delivery wiring (see webauthn-rp/providers/select-email-
  // provider.js). Previously this entrypoint passed no emailProvider at
  // all, so createServer()'s own default (UnconfiguredEmailProvider)
  // silently applied in every real deployment — /auth/password/forgot
  // always returned its generic success response either way, so the
  // gap was invisible on the wire. This throws synchronously at boot if
  // COZY_EMAIL_PROVIDER=smtp is requested but incomplete, rather than
  // starting in a half-configured state.
  const { selectEmailProvider } = require('./webauthn-rp/providers/select-email-provider');
  const emailProvider = selectEmailProvider(process.env);

  const server = createBoundaryServer({
    siteRoot,
    dbPath: process.env.COZY_WEBAUTHN_DB || path.join(siteRoot, 'cozy-webauthn.local.sqlite'),
    rpId: process.env.COZY_RP_ID || 'localhost',
    rpName: 'CozyOS',
    origin: process.env.COZY_RP_ORIGIN || 'http://localhost:8787',
    // Defaults to CozyOS's one real Firebase project (see
    // Firebase/firebase-config.js). Override for local testing against a
    // different project.
    firebaseProjectId: process.env.COZY_FIREBASE_PROJECT_ID || 'cozycabin-affiliate',
    emailProvider,
  });
  const port = process.env.PORT || 8787;
  server.listen(port, () => {
    console.log(`CozyOS boundary server listening on http://localhost:${port}`);
    console.log('Frontend not yet wired to /webauthn/firebase/session - see file header before deploying.');
    // Status only — never logs credentials (see SmtpEmailProvider.status()/
    // UnconfiguredEmailProvider.status()/MockEmailProvider.status()).
    console.log(`Email delivery provider: ${JSON.stringify(emailProvider.status())}`);
  });
}
