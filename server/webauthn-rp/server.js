'use strict';
const http = require('node:http');
const { openDb } = require('./db');
const { RelyingParty, AuthError } = require('./rp');
const { OrganizationRegistry, OrgError } = require('./organizations');
const { BillingRegistry, BillingError } = require('./billing');
const { DocumentStorageRegistry, DocumentStorageError } = require('./document-storage');
const { FilesystemObjectStorageProvider, ObjectStorageError } = require('./object-storage');
const { FolderRegistry, FolderError } = require('./folder-registry');
const { TransferSessionRegistry, TransferSessionError } = require('./transfer-session-registry');
const { decodeQrPayload } = require('./qr-pairing');
const { PaymentRegistry, PaymentError } = require('./payments');
const { createCashProviderAdapter } = require('./providers/cash-provider');
const { verifyFirebaseIdToken } = require('./firebase-verify');
const { UnconfiguredEmailProvider, UnconfiguredSMSProvider } = require('./delivery-provider');
const { SQLiteDatabaseAdapter, createDatabaseAdapter } = require('./database-adapter');

const SESSION_COOKIE = 'cozy_admin_session';

// Anti-enumeration: forgot-password always returns this exact message on
// the wire, whether or not the account exists, has a password set, or
// delivery actually succeeds. See §14 — never respond "email does not
// exist".
const GENERIC_FORGOT_MESSAGE = 'If that account is eligible, recovery instructions have been sent.';

// ---------- minimal in-memory rate limiter ----------
// Fixed-window counter per key (IP for now — see currentSession()-style
// callers). Intentionally simple and dependency-free; swap for a shared
// store (Redis etc.) before running multiple server processes behind a
// load balancer, since this state is per-process.
class RateLimiter {
  constructor({ windowMs, max, now = () => Date.now() }) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
    this.hits = new Map(); // key -> { count, windowStart }
  }

  // Returns true if the request should be ALLOWED, false if rate-limited.
  check(key) {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}

function clientIp(req) {
  // No trusted reverse-proxy header parsing here on purpose — this server
  // sits directly on the connection in tests/local Termux use. A real
  // deployment behind a reverse proxy should set this from a
  // proxy-verified header instead of req.socket.remoteAddress.
  return req.socket && req.socket.remoteAddress || 'unknown';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionCookieHeader(sessionId, { maxAgeSeconds, clear = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (clear) {
    parts.push('Max-Age=0');
  } else if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  // Secure is required in real deployments (HTTPS). Left off only so the
  // test suite and local Termux HTTP verification can exercise cookies
  // without TLS; the deployment doc calls out flipping this on before any
  // real deployment.
  if (process.env.COZY_WEBAUTHN_COOKIE_SECURE === '1') parts.push('Secure');
  return parts.join('; ');
}

function readJsonBody(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  // Headers must be set before writeHead — this codebase previously had a
  // live bug (res.setHeader() called after res.writeHead()) which silently
  // broke every cookie-setting response. All handlers below set headers
  // first, then call writeHead once.
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(payload);
}

function createServer({
  dbPath, rpId, rpName, origin, now, firebaseProjectId, fetchGoogleCerts,
  // Injectable delivery providers — see delivery-provider.js. Default to
  // the explicit "not configured" providers rather than silently faking
  // delivery; production wiring passes real providers in, tests pass
  // Mock* providers in.
  emailProvider = new UnconfiguredEmailProvider(),
  smsProvider = new UnconfiguredSMSProvider(),
  // Rate limit knobs, overridable so tests don't need to wait out real
  // windows.
  forgotPasswordRateLimit = { windowMs: 15 * 60 * 1000, max: 5 },
  loginRateLimit = { windowMs: 15 * 60 * 1000, max: 10 },
  mfaRateLimit = { windowMs: 15 * 60 * 1000, max: 15 },
  // OPT-IN, test-only: an absolute path to serve real static files
  // (chalzydashboard.html, its <script src> files, admin-workspace.html,
  // etc.) from, so a real-browser test suite can exercise the real HTML
  // + real scripts + this same real API server from one origin instead
  // of two separate servers with two separate cookie jars/origins. Never
  // set in any production entrypoint - undefined by default, and when
  // undefined this code path never runs (see the http.createServer
  // handler below: the static fallback only exists at all inside the
  // `if (serveStaticRoot)` branch, so leaving this unset is not merely
  // "off", the code is not reachable at all).
  serveStaticRoot,
  // PHASE B2 — explicit database selection (Step 7). Present ->
  // PostgreSQL via the shared DatabaseAdapter; absent -> the existing
  // SQLite path via openDb(dbPath), wrapped in the same adapter
  // interface so rp.js/organizations.js never need to know which
  // backend they're talking to. No silent fallback either direction:
  // if databaseUrl is provided but `pg` can't connect, this throws.
  databaseUrl,
  // CozyOS File Phase 2 — real, filesystem-backed binary storage root.
  // Defaults to a directory alongside the SQLite path (or a
  // process-local fallback if dbPath itself is unset), matching the
  // existing COZY_WEBAUTHN_DB pattern's own default philosophy — real,
  // working, and honestly local unless explicitly configured otherwise
  // (e.g. Render's persistent disk at /var/data — set
  // objectStorageRoot to /var/data/documents there).
  objectStorageRoot,
} = {}) {
  const db = databaseUrl
    ? createDatabaseAdapter({ databaseUrl })
    : new SQLiteDatabaseAdapter(openDb(dbPath));
  const rp = new RelyingParty(db, { rpId, rpName, origin, now });
  const nowFn = now || (() => Date.now());
  const orgs = new OrganizationRegistry(db, { now: nowFn });
  const resolvedObjectStorageRoot = objectStorageRoot || (dbPath ? require('node:path').join(require('node:path').dirname(dbPath), 'document-objects') : require('node:path').join(require('node:os').tmpdir(), 'cozyos-document-objects'));
  const objectStorage = new FilesystemObjectStorageProvider({ rootDir: resolvedObjectStorageRoot });
  const billing = new BillingRegistry(db, orgs, { now: nowFn });
  const documentStorage = new DocumentStorageRegistry(db, orgs, { now: nowFn, objectStorage });
  const folders = new FolderRegistry(db, orgs, { now: nowFn });
  const transferSessions = new TransferSessionRegistry(db, orgs, documentStorage, folders, { now: nowFn });
  const payments = new PaymentRegistry(db, orgs, billing, { now: nowFn });
  // The one real, fully-functional provider this round — see
  // server/webauthn-rp/providers/cash-provider.js for why cash, not a
  // card/mobile-money/bank/crypto provider, is registered here. Future
  // real providers register the same way once real credentials exist.
  payments.registerProvider('cash', createCashProviderAdapter());

  const forgotLimiter = new RateLimiter({ ...forgotPasswordRateLimit, now: nowFn });
  const loginLimiter = new RateLimiter({ ...loginRateLimit, now: nowFn });
  // Separate from loginLimiter: MFA verification is IP-rate-limited too
  // (defense in depth alongside the per-pendingId attempt cap already
  // enforced in rp.js), but a stricter login-attempt cap must not also
  // throttle someone entering their code correctly on a later try.
  const mfaLimiter = new RateLimiter({ ...mfaRateLimit, now: nowFn });

  async function currentSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return rp.resolveSession(cookies[SESSION_COOKIE]);
  }

  const routes = {
    'POST /webauthn/register/begin': async (req, res) => {
      const body = await readJsonBody(req);
      if (!body.email) return sendJson(res, 400, { error: 'email_required' });
      const options = await rp.beginRegistration({ email: body.email, nickname: body.nickname });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/register/complete': async (req, res) => {
      const body = await readJsonBody(req);
      const result = await rp.completeRegistration({
        email: body.email,
        clientDataJSON: body.clientDataJSON,
        attestationObjectB64: body.attestationObject,
        nickname: body.nickname,
      });
      return sendJson(res, 200, { ok: true, credentialId: result.credentialId });
    },

    'POST /webauthn/authenticate/begin': async (req, res) => {
      const body = await readJsonBody(req);
      const options = await rp.beginAuthentication({ email: body.email });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/authenticate/complete': async (req, res) => {
      const body = await readJsonBody(req);
      const result = await rp.completeAuthentication({
        credentialId: body.credentialId,
        clientDataJSON: body.clientDataJSON,
        authenticatorDataB64: body.authenticatorData,
        signatureB64: body.signature,
      });
      const user = await rp.getUserById(result.userId);
      return sendJson(
        res,
        200,
        { ok: true, isPlatformAdmin: !!user.is_platform_admin },
        { 'Set-Cookie': sessionCookieHeader(result.session.sessionId, { maxAgeSeconds: 30 * 24 * 60 * 60 }) }
      );
    },

    // ---------- password authentication ----------
    // Registration endpoint: creates (or attaches a password to) an
    // account. Kept deliberately minimal — no email verification step is
    // implemented here (that's a Security Center-phase factor per §19),
    // but the shape leaves room for it: `email` is stored, and nothing
    // downstream treats an unverified email as equivalent to a Firebase-
    // verified one.
    'POST /auth/register': async (req, res) => {
      const body = await readJsonBody(req);
      if (!body.email || !body.password) return sendJson(res, 400, { error: 'email_and_password_required' });
      if (body.password.length < 8) return sendJson(res, 400, { error: 'password_too_short' });
      try {
        const user = await rp.registerWithPassword({ email: body.email, password: body.password });
        return sendJson(res, 200, { ok: true, userId: user.id });
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 409, { error: err.code });
        throw err;
      }
    },

    // Converges on the exact same session model as WebAuthn and Firebase
    // login — same cookie name, same TTL, same downstream
    // resolveSession()/isPlatformAdmin path. See rp.authenticateWithPassword
    // for the constant-shape failure handling.
    //
    // Phase C §4: when the account has server-side TOTP enabled,
    // authenticateWithPassword() returns { mfaRequired: true, pendingId }
    // instead of a session — this route must NEVER set the session
    // cookie in that case. pendingId is returned in the JSON body only
    // (never as a cookie), so a client cannot accidentally send it back
    // as if it were an authenticated session on some other request.
    'POST /auth/login': async (req, res) => {
      const ip = clientIp(req);
      if (!loginLimiter.check(`login:${ip}`)) {
        return sendJson(res, 429, { error: 'rate_limited' });
      }
      const body = await readJsonBody(req);
      // CHALZYDASHBOARD-USERNAME-LOGIN: accepts EITHER body.email OR
      // body.username (never both — see rp.authenticateWithPassword()'s
      // own 'identifier_ambiguous' guard). This is still the one real
      // password-auth route; no new endpoint, no second engine.
      if ((!body.email && !body.username) || !body.password) return sendJson(res, 400, { error: 'identifier_and_password_required' });
      if (body.email && body.username) return sendJson(res, 400, { error: 'identifier_ambiguous' });
      try {
        const result = await rp.authenticateWithPassword({ email: body.email, username: body.username, password: body.password });
        if (result.mfaRequired) {
          return sendJson(res, 200, { ok: true, mfaRequired: true, pendingId: result.pendingId, expiresAt: result.expiresAt });
        }
        const user = await rp.getUserById(result.userId);
        return sendJson(
          res,
          200,
          { ok: true, isPlatformAdmin: !!user.is_platform_admin },
          { 'Set-Cookie': sessionCookieHeader(result.session.sessionId, { maxAgeSeconds: 30 * 24 * 60 * 60 }) }
        );
      } catch (err) {
        if (err instanceof AuthError) {
          // Deliberately the same generic message regardless of which
          // AuthError fired (invalid_credentials vs account_disabled),
          // mirroring the Firebase route's anti-enumeration behavior —
          // the client-facing reason never reveals which account state
          // caused the failure.
          return sendJson(res, 401, { ok: false, error: 'authentication_failed' });
        }
        throw err;
      }
    },

    // Phase C §4 — completes a pending (password-verified,
    // MFA-not-yet-verified) login. This is the ONLY route that can turn
    // a pendingId into a real cozy_admin_session cookie. body.method
    // selects 'totp' (default) or 'recovery'.
    'POST /auth/mfa/verify': async (req, res) => {
      const ip = clientIp(req);
      if (!mfaLimiter.check(`mfa:${ip}`)) {
        return sendJson(res, 429, { error: 'rate_limited' });
      }
      const body = await readJsonBody(req);
      if (!body.pendingId || !body.code) return sendJson(res, 400, { error: 'pending_id_and_code_required' });
      try {
        const result = body.method === 'recovery'
          ? await rp.completePendingAuthWithRecoveryCode(body.pendingId, body.code)
          : await rp.completePendingAuthWithTotp(body.pendingId, body.code);
        const user = await rp.getUserById(result.userId);
        return sendJson(
          res,
          200,
          { ok: true, isPlatformAdmin: !!user.is_platform_admin },
          { 'Set-Cookie': sessionCookieHeader(result.session.sessionId, { maxAgeSeconds: 30 * 24 * 60 * 60 }) }
        );
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 401, { ok: false, error: err.code });
        throw err;
      }
    },

    // Real second-factor WebAuthn/passkey step-up — the fingerprint-
    // capable-authenticator alternative to typing a TOTP code, for the
    // SAME pending-auth session /auth/login already created. Shares the
    // exact same rate limiter as /auth/mfa/verify (brute-force
    // protection must not differ by which second-factor method is
    // attempted).
    'POST /auth/mfa/webauthn/begin': async (req, res) => {
      const ip = clientIp(req);
      if (!mfaLimiter.check(`mfa:${ip}`)) return sendJson(res, 429, { error: 'rate_limited' });
      const body = await readJsonBody(req);
      if (!body.pendingId) return sendJson(res, 400, { error: 'pending_id_required' });
      try {
        const options = await rp.beginPendingAuthWebAuthn(body.pendingId);
        return sendJson(res, 200, options);
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 401, { error: err.code });
        throw err;
      }
    },

    'POST /auth/mfa/webauthn/complete': async (req, res) => {
      const ip = clientIp(req);
      if (!mfaLimiter.check(`mfa:${ip}`)) return sendJson(res, 429, { error: 'rate_limited' });
      const body = await readJsonBody(req);
      if (!body.pendingId || !body.credentialId) return sendJson(res, 400, { error: 'pending_id_and_credential_required' });
      try {
        const result = await rp.completePendingAuthWithWebAuthn(body.pendingId, {
          credentialId: body.credentialId,
          clientDataJSON: body.clientDataJSON,
          authenticatorDataB64: body.authenticatorData,
          signatureB64: body.signature,
        });
        const user = await rp.getUserById(result.userId);
        return sendJson(
          res,
          200,
          { ok: true, isPlatformAdmin: !!user.is_platform_admin },
          { 'Set-Cookie': sessionCookieHeader(result.session.sessionId, { maxAgeSeconds: 30 * 24 * 60 * 60 }) }
        );
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 401, { ok: false, error: err.code });
        throw err;
      }
    },

    // Cancels a pending login (OTP modal closed / given up). Idempotent;
    // never errors on an unknown/expired pendingId since there is
    // nothing sensitive to protect by distinguishing those cases.
    'POST /auth/mfa/cancel': async (req, res) => {
      const body = await readJsonBody(req);
      if (body.pendingId) await rp.cancelPendingAuthSession(body.pendingId);
      return sendJson(res, 200, { ok: true });
    },

    // Enrollment requires an already-authenticated session — never a
    // bare email/userId supplied by the request body.
    'POST /auth/mfa/totp/enroll/begin': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const result = await rp.beginTotpEnrollment(session.userId);
      return sendJson(res, 200, result);
    },

    'POST /auth/mfa/totp/enroll/complete': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.code) return sendJson(res, 400, { error: 'code_required' });
      try {
        const result = await rp.completeTotpEnrollment(session.userId, body.code);
        return sendJson(res, 200, result);
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 400, { error: err.code });
        throw err;
      }
    },

    'POST /auth/mfa/totp/disable': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      await rp.disableTotp(session.userId);
      return sendJson(res, 200, { ok: true });
    },

    // §12-15: real password-recovery backend. Always returns the same
    // generic 200 response (see GENERIC_FORGOT_MESSAGE / §14) regardless
    // of whether the account exists, has a password, or delivery
    // succeeds — the only externally-observable difference an attacker
    // could use to enumerate accounts is rate-limiting, which applies
    // uniformly by IP.
    'POST /auth/password/forgot': async (req, res) => {
      const ip = clientIp(req);
      if (!forgotLimiter.check(`forgot:${ip}`)) {
        return sendJson(res, 429, { error: 'rate_limited' });
      }
      const body = await readJsonBody(req);
      if (!body.email) return sendJson(res, 400, { error: 'email_required' });

      const issued = await rp.createPasswordResetToken(body.email);
      if (issued) {
        const resetUrl = `${origin}/reset-password.html?token=${encodeURIComponent(issued.token)}`;
        try {
          await emailProvider.send({
            to: issued.user.email,
            subject: 'Reset your CozyOS password',
            text: `Use this link to reset your password: ${resetUrl}\nThis link expires in 30 minutes and can only be used once.`,
          });
        } catch (_err) {
          // Delivery failure must not change the wire response (still
          // anti-enumeration) and must never be silently reported as
          // success internally either — audit event records the true
          // outcome for operators.
          await rp._audit(issued.user.id, 'password_reset_delivery_failed', {});
        }
      }
      // Never log the token itself (§14) — nothing above this line writes
      // `issued.token` anywhere but the one delivery-provider call.
      return sendJson(res, 200, { ok: true, message: GENERIC_FORGOT_MESSAGE });
    },

    'POST /auth/password/reset': async (req, res) => {
      const body = await readJsonBody(req);
      if (!body.token || !body.newPassword) return sendJson(res, 400, { error: 'token_and_new_password_required' });
      if (body.newPassword.length < 8) return sendJson(res, 400, { error: 'password_too_short' });
      try {
        await rp.completePasswordReset({ token: body.token, newPassword: body.newPassword });
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 400, { error: err.code });
        throw err;
      }
    },

    // §16: Security Center provider-status surface. Never claims a
    // provider is healthy/configured beyond what the provider itself
    // reports.
    'GET /auth/providers/status': async (req, res) => {
      return sendJson(res, 200, {
        email: emailProvider.status(),
        sms: smsProvider.status(),
      });
    },

    // Session-unification entry point: turns an ALREADY-issued Firebase
    // ID token (from the existing CozyOS login) into the SAME
    // authoritative session model /webauthn/authenticate/complete
    // issues — same cookie name, same TTL helper, same
    // resolveSession()/isPlatformAdmin path downstream. This is the one
    // HTTP-reachable place a Firebase login can affect a CozyOS session;
    // it never trusts anything from the request except the opaque
    // idToken string, and every identity fact (uid, email) comes only
    // from that token's cryptographically verified payload.
    'POST /webauthn/firebase/session': async (req, res) => {
      if (!firebaseProjectId) {
        // Fail closed rather than silently accepting tokens with no
        // configured project to check them against.
        return sendJson(res, 501, { authenticated: false, reason: 'firebase_not_configured' });
      }
      const body = await readJsonBody(req);
      if (!body.idToken) return sendJson(res, 400, { authenticated: false, reason: 'missing_id_token' });

      const verified = await verifyFirebaseIdToken(body.idToken, {
        projectId: firebaseProjectId,
        fetchGoogleCerts,
      });
      if (!verified.verified) {
        // Deliberately generic on the wire (mirrors the existing
        // google-login-endpoint.js pattern) so this endpoint cannot be
        // used to enumerate *why* a token failed; the specific reason is
        // still available server-side via the audit log / return value
        // for anyone reading server logs, just not sent to the client.
        return sendJson(res, 401, { authenticated: false, reason: 'auth_failed' });
      }

      const result = await rp.authenticateWithVerifiedFirebase({
        firebaseUid: verified.uid,
        email: verified.email,
      });
      const user = await rp.getUserById(result.userId);
      return sendJson(
        res,
        200,
        { ok: true, isPlatformAdmin: !!user.is_platform_admin },
        { 'Set-Cookie': sessionCookieHeader(result.session.sessionId, { maxAgeSeconds: 30 * 24 * 60 * 60 }) }
      );
    },

    // Milestone: Server Session + 3-Way Gate Foundation. Extends the
    // existing, already-relied-upon shape ({authenticated, email,
    // isPlatformAdmin}) additively — every pre-existing field and its
    // pre-existing behavior is untouched, so admin-gate-core.js's
    // existing platform-admin decision path keeps working unmodified.
    // `organizations` is new: it composes the real, existing
    // OrganizationRegistry only (listUserOrganizations/getOrganization/
    // isAuthorized) — never a second membership source. Only ACTIVE
    // memberships are returned (invited/suspended/removed rows carry no
    // dashboard authority and would only leak state to a browser that
    // has no legitimate use for it). `isOrgAdmin` is derived from a real
    // capability check (orgs.isAuthorized(..., 'org:workforce:manage')),
    // never from a bare `roles.includes('admin')` string comparison, so
    // it reflects the same deny-over-allow/explicit-permission semantics
    // every other organization route already enforces.
    //
    // PHASE B2: the per-membership map now does real async work
    // (getOrganization + isAuthorized) inside its callback, so this uses
    // Promise.all(rows.map(async (m) => {...})) instead of a plain
    // .map() — a plain .map() here would return an array of Promises,
    // not an array of resolved objects, silently corrupting the response
    // shape. Order is preserved (Promise.all resolves in input order),
    // and every membership's two lookups run concurrently with every
    // other membership's, not sequentially — a real latency win under
    // PostgreSQL, harmless under SQLite.
    'GET /webauthn/session': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { authenticated: false });
      const memberships = await orgs.listUserOrganizations(session.userId, { status: 'active' });
      const organizations = await Promise.all(memberships.map(async (m) => {
        const org = await orgs.getOrganization(m.organizationId);
        return {
          organizationId: m.organizationId,
          name: org ? org.name : null,
          membershipId: m.id,
          status: m.status,
          isOrgAdmin: await orgs.isAuthorized(session.userId, m.organizationId, 'org:workforce:manage'),
        };
      }));
      return sendJson(res, 200, {
        authenticated: true,
        email: session.email,
        isPlatformAdmin: session.isPlatformAdmin,
        organizations,
      });
    },

    'POST /webauthn/logout': async (req, res) => {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[SESSION_COOKIE]) await rp.revokeSession(cookies[SESSION_COOKIE]);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookieHeader(null, { clear: true }) });
    },

    'GET /webauthn/passkeys': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const rows = await rp.listCredentials(session.userId);
      const creds = rows.map((c) => ({
        credentialId: c.credential_id,
        nickname: c.nickname,
        algorithm: c.algorithm,
        createdAt: c.created_at,
        lastUsedAt: c.last_used_at,
      }));
      return sendJson(res, 200, { passkeys: creds });
    },

    'POST /webauthn/passkeys/revoke': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      await rp.revokeCredential(session.userId, body.credentialId);
      return sendJson(res, 200, { ok: true });
    },

    // Enrollment of an additional passkey requires an already-authenticated
    // session — this is the "already-authorized" path the spec requires,
    // not a bare email lookup. Any authenticated user (admin or ordinary)
    // may enroll a passkey for THEIR OWN account: the same ownership
    // pattern already used by GET /webauthn/passkeys and
    // POST /webauthn/passkeys/revoke below. The identity being enrolled
    // is always session.email, resolved server-side from the session
    // cookie via resolveSession() — never a client-supplied field — so a
    // user can never enroll a credential into another account. Platform
    // admin status is unaffected: is_platform_admin still gates
    // GET /webauthn/authorize/admin exactly as before.
    'POST /webauthn/passkeys/enroll/begin': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const options = await rp.beginRegistration({ email: session.email });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/passkeys/enroll/complete': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const result = await rp.completeRegistration({
        email: session.email,
        clientDataJSON: body.clientDataJSON,
        attestationObjectB64: body.attestationObject,
        nickname: body.nickname,
      });
      return sendJson(res, 200, { ok: true, credentialId: result.credentialId });
    },

    // The ONLY endpoint that gates the administrator workspace. It never
    // reads any client-supplied header or body field to decide admin
    // status — only the session row's is_platform_admin column, which no
    // HTTP route in this file ever writes to.
    'GET /webauthn/authorize/admin': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { authorized: false, reason: 'not_authenticated' });
      if (!session.isPlatformAdmin) return sendJson(res, 403, { authorized: false, reason: 'not_admin' });
      return sendJson(res, 200, { authorized: true, email: session.email });
    },

    // ---------- organizations (Milestone A: server-backed org authority) ----------
    // Every route below derives the acting identity from currentSession(req)
    // only — never from a client-supplied userId/organizationId claim of
    // *who is acting*. organizationId/targetUserId in the body identify
    // the RESOURCE being acted on; orgs.isAuthorized()/the OrganizationRegistry
    // methods themselves re-verify the actor's real membership/role against
    // that resource server-side before anything is read or written. This
    // mirrors GET /webauthn/authorize/admin's own comment: identity is never
    // taken from what the browser claims about itself.

    'GET /organizations/mine': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      return sendJson(res, 200, { memberships: await orgs.listUserOrganizations(session.userId) });
    },

    // Dashboard entry-point context for ONE organization the caller has
    // just selected (organization switcher / initial workspace load).
    // Deliberately POST + JSON body, not GET + query string: this
    // dispatcher's route table is a flat `${method} ${pathname}` lookup
    // (see the `key` computed in the http.createServer handler below)
    // and every other route here that takes a caller-supplied parameter
    // — /organizations/authorize, /organizations/members/list, etc. —
    // already uses POST + JSON body for that, never a query string. This
    // route matches that existing convention rather than introducing a
    // new one.
    //
    // Identity is derived ONLY from currentSession(req) (the real
    // WebAuthn/password session cookie), exactly like every route above
    // it. organizationId in the body identifies the RESOURCE being
    // requested, never the actor — orgs.getMembership() re-verifies the
    // caller's real, current membership row for that exact organization
    // before anything is returned. A membership that exists but is not
    // ACTIVE (invited/suspended/removed/declined/expired) is treated
    // identically to no membership at all: 403, no organization data in
    // the response body. This mirrors GET /webauthn/session's own
    // "only ACTIVE memberships carry dashboard authority" rule directly
    // above, and composes the same real OrganizationRegistry methods
    // that route already uses (getMembership/getOrganization/
    // isAuthorized) — no second membership or entitlement authority.
    'POST /organizations/context': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || typeof body.organizationId !== 'string') {
        return sendJson(res, 400, { error: 'organizationId_required' });
      }

      const membership = await orgs.getMembership(session.userId, body.organizationId);
      if (!membership || membership.status !== 'active') {
        // Fail closed for: no membership row at all, a still-pending
        // invitation, a suspended membership, a removed membership, a
        // declined/expired invite record, and (since getMembership()
        // above is scoped by organizationId AND userId together) any
        // cross-tenant organizationId that simply isn't this caller's —
        // all collapse to the same 403 with no organization data
        // attached, so none of those states can be distinguished from
        // one another by the response, and no org name/role/application
        // data ever leaks for an organization the caller isn't an active
        // member of.
        return sendJson(res, 403, { error: 'not_an_active_member' });
      }

      const organization = await orgs.getOrganization(body.organizationId);
      if (!organization) return sendJson(res, 404, { error: 'organization_not_found' });

      return sendJson(res, 200, {
        ok: true,
        organizationId: organization.id,
        organizationName: organization.name,
        membershipId: membership.id,
        status: membership.status,
        roles: membership.roles,
        applications: membership.applications,
        permissions: membership.permissions,
        // Same real capability checks GET /webauthn/session already
        // performs for isOrgAdmin — never re-derived from the roles
        // array by string comparison here.
        isOrgAdmin: await orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:manage'),
        canManageWorkforce: await orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:manage'),
        canReadWorkforce: await orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:read'),
        canManageApplications: await orgs.isAuthorized(session.userId, body.organizationId, 'org:applications:manage'),
        canManagePermissions: await orgs.isAuthorized(session.userId, body.organizationId, 'org:permissions:manage'),
      });
    },

    'POST /organizations/create': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const org = await orgs.createOrganization(session.userId, { name: body.name });
      return sendJson(res, 200, { ok: true, organization: org });
    },

    'POST /organizations/authorize': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { authorized: false, reason: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.capability) return sendJson(res, 400, { error: 'organizationId_and_capability_required' });
      const authorized = await orgs.isAuthorized(session.userId, body.organizationId, body.capability);
      return sendJson(res, 200, { authorized });
    },

    // CozyOS File Phase 1 — the server boundary the new browser-side
    // durable document storage provider calls. See server/webauthn-rp/
    // document-storage.js for the real registry this thinly wraps.
    // Every route requires an authenticated session and an explicit
    // organizationId — never a client-supplied role/permission; the
    // registry itself re-derives authority from OrganizationRegistry.
    // Real, proven root cause (this round): the default readJsonBody()
    // limit (1e6 bytes / ~1MB) exists to protect every route on this
    // server from oversized-payload abuse, and remains completely
    // unchanged for every other route. Document content (multi-page
    // OCR text in particular) can legitimately exceed 1MB, so this ONE
    // route explicitly opts into a higher, still-bounded limit
    // (10MB) — not unlimited, and not a change to any other route's
    // protection.
    'POST /documents': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req, 10 * 1024 * 1024);
      if (!body.organizationId) return sendJson(res, 400, { error: 'organizationId_required' });
      const result = await documentStorage.save(session.userId, body.organizationId, body.record || {});
      return sendJson(res, 200, result);
    },

    'POST /documents/load': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await documentStorage.load(session.userId, body.organizationId, body.documentId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/archive': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await documentStorage.archive(session.userId, body.organizationId, body.documentId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/restore': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await documentStorage.restore(session.userId, body.organizationId, body.documentId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/delete': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await documentStorage.delete(session.userId, body.organizationId, body.documentId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/versions': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await documentStorage.getVersions(session.userId, body.organizationId, body.documentId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/search': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId) return sendJson(res, 400, { error: 'organizationId_required' });
      const result = await documentStorage.search(session.userId, body.organizationId, body.filters || {});
      return sendJson(res, 200, result);
    },

    // CozyOS File Phase 2 — real binary content upload/download.
    // Uses headers rather than a JSON body (the body itself is the raw
    // binary content, streamed directly to disk — never buffered whole
    // or base64-encoded, matching the "prefer streaming" requirement).
    // A real, documented, still-bounded size limit (25MB) protects
    // against unbounded uploads, separate from and in addition to the
    // existing JSON-body limit (which does not apply to this route at
    // all, since this body is never parsed as JSON).
    'POST /documents/binary': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const organizationId = req.headers['x-cozy-organization-id'];
      const documentId = req.headers['x-cozy-document-id'];
      const originalFilename = req.headers['x-cozy-filename'] ? decodeURIComponent(req.headers['x-cozy-filename']) : null;
      const mimeType = req.headers['content-type'] || 'application/octet-stream';
      if (!organizationId || !documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_headers_required' });

      const MAX_BINARY_BYTES = 25 * 1024 * 1024;
      try {
        const result = await documentStorage.saveBinary(session.userId, organizationId, documentId, req, { mimeType, originalFilename, maxBytes: MAX_BINARY_BYTES });
        return sendJson(res, result.available ? 200 : 404, result);
      } catch (err) {
        if (err instanceof ObjectStorageError && err.code === 'too_large') return sendJson(res, 413, { error: 'binary_too_large', maxBytes: MAX_BINARY_BYTES });
        throw err;
      }
    },

    'GET /documents/binary': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const url = new URL(req.url, 'http://internal');
      const organizationId = url.searchParams.get('organizationId');
      const documentId = url.searchParams.get('documentId');
      if (!organizationId || !documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });

      const result = await documentStorage.loadBinary(session.userId, organizationId, documentId);
      if (!result.available) return sendJson(res, 404, { error: result.reason });

      res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
      if (result.size) res.setHeader('Content-Length', String(result.size));
      if (result.checksum) res.setHeader('X-Cozy-Checksum-Sha256', result.checksum);
      res.writeHead(200);
      result.stream.pipe(res);
    },

    // CozyOS File Phase 3 — real, server-authoritative folder routes.
    // Small metadata operations only — never routed through the
    // binary-body handling established in Phase 2.
    'POST /folders': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId) return sendJson(res, 400, { error: 'organizationId_required' });
      const result = await folders.createFolder(session.userId, body.organizationId, { name: body.name, parentFolderId: body.parentFolderId || null });
      return sendJson(res, 200, result);
    },

    'POST /folders/root': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId) return sendJson(res, 400, { error: 'organizationId_required' });
      const result = await folders.ensureRoot(session.userId, body.organizationId);
      return sendJson(res, 200, result);
    },

    'POST /folders/get': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId) return sendJson(res, 400, { error: 'organizationId_and_folderId_required' });
      const result = await folders.getFolder(session.userId, body.organizationId, body.folderId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /folders/children': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId) return sendJson(res, 400, { error: 'organizationId_and_folderId_required' });
      const result = await folders.listContents(session.userId, body.organizationId, body.folderId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /folders/rename': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId || !body.name) return sendJson(res, 400, { error: 'organizationId_folderId_and_name_required' });
      const result = await folders.renameFolder(session.userId, body.organizationId, body.folderId, body.name);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /folders/move': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId || !body.newParentFolderId) return sendJson(res, 400, { error: 'organizationId_folderId_and_newParentFolderId_required' });
      const result = await folders.moveFolder(session.userId, body.organizationId, body.folderId, body.newParentFolderId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /folders/archive': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId) return sendJson(res, 400, { error: 'organizationId_and_folderId_required' });
      const result = await folders.archiveFolder(session.userId, body.organizationId, body.folderId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /folders/restore': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.folderId) return sendJson(res, 400, { error: 'organizationId_and_folderId_required' });
      const result = await folders.restoreFolder(session.userId, body.organizationId, body.folderId);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    'POST /documents/move': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.documentId) return sendJson(res, 400, { error: 'organizationId_and_documentId_required' });
      const result = await folders.moveDocument(session.userId, body.organizationId, body.documentId, body.folderId || null);
      return sendJson(res, result.available ? 200 : 404, result);
    },

    // CozyOS File Phase 4 — real Cozy Share transfer session routes.
    // See server/webauthn-rp/transfer-session-registry.js for the full
    // architecture. Small metadata operations, except
    // /transfer/items/receive, which streams real content through the
    // existing Phase 1/2 storage APIs — never a second storage system.
    'POST /transfer/sessions': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.items) return sendJson(res, 400, { error: 'organizationId_and_items_required' });
      const result = await transferSessions.createSession(session.userId, body.organizationId, body.items);
      return sendJson(res, 200, result);
    },

    'POST /transfer/pair': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.sessionId || !body.token) return sendJson(res, 400, { error: 'organizationId_sessionId_and_token_required' });
      const result = await transferSessions.pair(session.userId, body.organizationId, body.sessionId, body.token);
      return sendJson(res, 200, result);
    },

    // CozyOS File Phase 5 — QR pairing. A thin decode-then-hand-off
    // layer: the real security decision (does this token match this
    // session, has it genuinely expired, is this session still
    // pairable) remains entirely inside the existing, unmodified
    // TransferSessionRegistry.pair() call below — this route only
    // parses the scanned string's shape before handing off.
    'POST /transfer/pair/qr': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.qrPayloadString) return sendJson(res, 400, { error: 'organizationId_and_qrPayloadString_required' });

      const decoded = decodeQrPayload(body.qrPayloadString);
      if (!decoded.valid) {
        const status = decoded.reason === 'expired_payload' ? 410 : 400;
        return sendJson(res, status, { error: decoded.reason });
      }

      const result = await transferSessions.pair(session.userId, body.organizationId, decoded.sessionId, decoded.token);
      return sendJson(res, 200, result);
    },

    'POST /transfer/manifest': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.sessionId) return sendJson(res, 400, { error: 'sessionId_required' });
      const result = await transferSessions.getManifest(session.userId, body.sessionId);
      return sendJson(res, 200, result);
    },

    'POST /transfer/items/receive': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.sessionId || !body.itemId) return sendJson(res, 400, { error: 'sessionId_and_itemId_required' });
      const result = await transferSessions.transferItem(session.userId, body.sessionId, body.itemId, body.destinationFolderId || null);
      return sendJson(res, 200, result);
    },

    'POST /transfer/complete': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.sessionId) return sendJson(res, 400, { error: 'sessionId_required' });
      const result = await transferSessions.completeSession(session.userId, body.sessionId);
      return sendJson(res, 200, result);
    },

    'POST /transfer/cancel': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.sessionId) return sendJson(res, 400, { error: 'sessionId_required' });
      const result = await transferSessions.cancelSession(session.userId, body.sessionId);
      return sendJson(res, 200, result);
    },

    'POST /transfer/get': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.sessionId) return sendJson(res, 400, { error: 'sessionId_required' });
      const result = await transferSessions.getSession(session.userId, body.sessionId);
      return sendJson(res, 200, result);
    },

    'POST /organizations/members/list': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const members = await orgs.listOrganizationMembers(body.organizationId, session.userId, { status: body.status });
      return sendJson(res, 200, { members });
    },

    'POST /organizations/invite': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.invite(session.userId, { organizationId: body.organizationId, userId: body.userId, roles: body.roles });
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/accept': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.acceptInvitation(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/decline': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.declineInvitation(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/revoke': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.revokeInvitation(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/suspend': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.suspendMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/reactivate': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.reactivateMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/remove': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.removeMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/role/assign': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.assignRole(session.userId, body.organizationId, body.targetUserId, body.role);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/role/remove': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.removeRole(session.userId, body.organizationId, body.targetUserId, body.role);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/application/assign': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.assignApplication(session.userId, body.organizationId, body.targetUserId, body.applicationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/application/remove': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.removeApplication(session.userId, body.organizationId, body.targetUserId, body.applicationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    // ---------- billing (server-authoritative — see server/webauthn-rp/billing.js) ----------
    //
    // Plan-catalog routes require session.isPlatformAdmin, resolved from
    // the real session exactly like every other platform-admin check in
    // this file — never a client-supplied flag. Subscription/wallet
    // routes require organization membership, checked by BillingRegistry
    // itself via orgs.isAuthorized() — this dispatcher never re-derives
    // that answer.

    'POST /billing/plans': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const plan = await billing.createPlan(session.userId, session.isPlatformAdmin, {
        planKey: body.planKey,
        applicationId: body.applicationId || null,
        name: body.name,
        currency: body.currency,
        billingInterval: body.billingInterval,
        initialAmountMinorUnits: body.initialAmountMinorUnits,
        reason: body.reason || null,
      });
      return sendJson(res, 200, { ok: true, plan });
    },

    'POST /billing/plans/price': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const price = await billing.setPlanPrice(session.userId, session.isPlatformAdmin, {
        planId: body.planId,
        amountMinorUnits: body.amountMinorUnits,
        currency: body.currency || null,
        reason: body.reason || null,
      });
      return sendJson(res, 200, { ok: true, price });
    },

    'POST /billing/plans/features': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const featureKeys = await billing.setPlanFeatures(session.userId, session.isPlatformAdmin, {
        planId: body.planId,
        featureKeys: body.featureKeys,
        reason: body.reason || null,
      });
      return sendJson(res, 200, { ok: true, featureKeys });
    },

    'POST /billing/organizations/subscriptions/create': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const subscription = await billing.createSubscription(session.userId, body.organizationId, { planId: body.planId });
      return sendJson(res, 200, { ok: true, subscription });
    },

    'POST /billing/organizations/subscriptions/cancel': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const subscription = await billing.cancelSubscription(session.userId, body.organizationId, {
        subscriptionId: body.subscriptionId,
        reason: body.reason || null,
      });
      return sendJson(res, 200, { ok: true, subscription });
    },

    'POST /billing/organizations/subscriptions/get': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const subscription = await billing.getActiveSubscription(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, subscription });
    },

    'POST /billing/organizations/subscriptions/charge': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const ledgerEntry = await billing.chargeSubscription(session.userId, body.organizationId, { subscriptionId: body.subscriptionId });
      return sendJson(res, 200, { ok: true, ledgerEntry });
    },

    'POST /billing/organizations/wallet/get': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const account = await billing.getWalletAccount(session.userId, body.organizationId);
      const ledger = await billing.getWalletLedger(session.userId, body.organizationId, { limit: body.limit || 100 });
      return sendJson(res, 200, { ok: true, account, ledger });
    },

    // ---------- Phase 3: real entitlement resolution ----------
    //
    // This is the server half of "REQUEST -> SERVER -> AUTHENTICATE ->
    // AUTHORIZE -> RESOLVE ORGANIZATION -> BILLINGREGISTRY -> DATABASE ->
    // RETURN AUTHORITATIVE RESULT." organizationId, and every value in
    // the response, are resolved here — never accepted from the request
    // body as authority. A client posting {"isPlatformAdmin": true} or
    // {"organizationId": "someone-elses-org"} has zero effect: session
    // identity and organization membership are both re-derived
    // server-side on every call, exactly as every other billing route
    // in this file already does.
    'POST /billing/organizations/entitlement': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const snapshot = await billing.getEntitlementSnapshot(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, snapshot });
    },

    // ---------- payments (server-authoritative — see server/webauthn-rp/payments.js) ----------
    //
    // NOTE on amount authority: this generic route accepts amountMinorUnits
    // from the request body, which is appropriate ONLY for operations
    // where the amount genuinely originates from the caller's own real
    // intent (e.g. "how much cash am I recording as received for a wallet
    // top-up") — PaymentRegistry validates its shape but has no way to
    // know "the right price" for a business operation it doesn't know
    // about. For a priced business operation (a subscription charge), the
    // correct pattern is what /billing/organizations/subscriptions/charge
    // already does: resolve the price server-side, never accept it from
    // the client at all. Do not extend this route to accept a client
    // amount for anything the server should be pricing itself.
    'POST /payments/intents/create': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const intent = await payments.createPaymentIntent(session.userId, body.organizationId, {
        amountMinorUnits: body.amountMinorUnits,
        currency: body.currency,
        providerId: body.providerId,
        referenceType: body.referenceType || null,
        referenceId: body.referenceId || null,
        idempotencyKey: body.idempotencyKey || null,
        metadata: body.metadata || {},
      });
      return sendJson(res, 200, { ok: true, intent });
    },

    'POST /payments/intents/get': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const intent = await payments.getPaymentIntent(session.userId, body.organizationId, body.paymentIntentId);
      return sendJson(res, 200, { ok: true, intent });
    },

    'POST /payments/intents/cancel': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const intent = await payments.cancelPaymentIntent(session.userId, body.organizationId, body.paymentIntentId);
      return sendJson(res, 200, { ok: true, intent });
    },

    'POST /payments/intents/refund': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const intent = await payments.refundPayment(session.userId, body.organizationId, body.paymentIntentId, {
        refundMinorUnits: body.refundMinorUnits ?? null,
        reason: body.reason || null,
      });
      return sendJson(res, 200, { ok: true, intent });
    },

    'POST /organizations/permission/grant': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.grantPermission(session.userId, body.organizationId, body.targetUserId, body.permissionName, body.effect);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/permission/revoke': async (req, res) => {
      const session = await currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = await orgs.revokePermission(session.userId, body.organizationId, body.targetUserId, body.permissionName);
      return sendJson(res, 200, { ok: true, membership });
    },
  };

  // OrgError -> HTTP status. Kept local to this dispatcher (mirrors how
  // AuthError is mapped below) rather than embedding HTTP concerns into
  // organizations.js itself.
  const ORG_ERROR_STATUS = {
    not_authorized: 403,
    membership_not_found: 404,
    membership_already_exists: 409,
    membership_not_invited: 409,
    membership_not_active: 409,
    membership_not_suspended: 409,
    invitation_expired: 410,
  };

  // DocumentStorageError -> HTTP status. Same kept-local-to-dispatcher
  // pattern as OrgError/BillingError above.
  const DOCUMENT_STORAGE_ERROR_STATUS = {
    not_authorized: 403,
  };

  // FolderError -> HTTP status.
  const FOLDER_ERROR_STATUS = {
    not_authorized: 403,
    invalid_parent: 400,
    duplicate_folder_name: 409,
    root_folder_immutable: 403,
    self_parent_rejected: 400,
    cycle_rejected: 400,
    folder_not_empty: 409,
  };

  // TransferSessionError -> HTTP status.
  const TRANSFER_SESSION_ERROR_STATUS = {
    not_authorized: 403,
    invalid_manifest: 400,
    concurrent_session_rejected: 409,
    session_not_found: 404,
    session_expired: 410,
    replay_rejected: 409,
    invalid_pairing_credential: 401,
    invalid_state_transition: 409,
    source_unavailable: 404,
    checksum_mismatch: 409,
    items_not_verified: 409,
  };

  // BillingError -> HTTP status. Same kept-local-to-dispatcher pattern as
  // OrgError above — billing.js stays free of HTTP concerns.
  const BILLING_ERROR_STATUS = {
    platform_admin_required: 403,
    not_authorized: 403,
    plan_not_found: 404,
    plan_not_found_or_inactive: 404,
    plan_has_no_current_price: 409,
    subscription_not_found: 404,
    subscription_already_terminal: 409,
    subscription_not_chargeable: 409,
    subscription_price_not_found: 409,
    organization_already_has_active_subscription: 409,
    currency_mismatch_with_wallet_account: 409,
    insufficient_wallet_balance: 409,
  };

  // PaymentError -> HTTP status. Same local-to-dispatcher pattern as
  // OrgError/BillingError — payments.js stays free of HTTP concerns.
  const PAYMENT_ERROR_STATUS = {
    not_authorized: 403,
    unknown_provider: 400,
    provider_create_failed: 502,
    duplicate_idempotency_key: 409,
    payment_intent_not_found: 404,
    payment_intent_not_cancellable: 409,
    payment_intent_not_refundable: 409,
    invalid_refund_amount: 400,
  };
  // Test-only static file fallback - see serveStaticRoot doc above.
  // Only ever reached for a GET whose exact pathname matched no real API
  // route, and only ever reads a file strictly inside serveStaticRoot
  // (path-traversal-checked below) - it grants no access whatsoever to
  // any authenticated route or session data; those all still go through
  // the real `routes` table and currentSession()/orgs checks above,
  // completely unaffected by this branch existing.
  function serveStaticFile(req, res, pathname) {
    const nodePath = require('path');
    const fs = require('fs');
    const requested = pathname === '/' ? '/index.html' : pathname;
    const filePath = nodePath.join(serveStaticRoot, requested);
    if (!filePath.startsWith(nodePath.resolve(serveStaticRoot))) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      const ext = nodePath.extname(filePath);
      const CONTENT_TYPES = {
        '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
        '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://internal').pathname;
    const key = `${req.method} ${pathname}`;
    const handler = routes[key];
    if (!handler) {
      if (serveStaticRoot && req.method === 'GET') return serveStaticFile(req, res, pathname);
      return sendJson(res, 404, { error: 'not_found' });
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof AuthError) return sendJson(res, 400, { error: err.code });
      if (err instanceof OrgError) return sendJson(res, ORG_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof BillingError) return sendJson(res, BILLING_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof DocumentStorageError) return sendJson(res, DOCUMENT_STORAGE_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof ObjectStorageError) return sendJson(res, err.code === 'not_found' ? 404 : 400, { error: err.code });
      if (err instanceof FolderError) return sendJson(res, FOLDER_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof TransferSessionError) return sendJson(res, TRANSFER_SESSION_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof PaymentError) return sendJson(res, PAYMENT_ERROR_STATUS[err.code] || 400, { error: err.code });
      if (err instanceof TypeError) return sendJson(res, 400, { error: 'invalid_request' });
      // eslint-disable-next-line no-console
      console.error('webauthn-rp internal error:', err);
      return sendJson(res, 500, { error: 'internal_error' });
    }
  });

  server.rp = rp;
  server.db = db;
  server.orgs = orgs;
  server.billing = billing;
  server.documentStorage = documentStorage;
  server.objectStorage = objectStorage;
  server.folders = folders;
  server.transferSessions = transferSessions;
  server.payments = payments;
  return server;
}

module.exports = { createServer, SESSION_COOKIE, parseCookies, GENERIC_FORGOT_MESSAGE };
