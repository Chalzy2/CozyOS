'use strict';
const http = require('node:http');
const { openDb } = require('./db');
const { RelyingParty, AuthError } = require('./rp');
const { OrganizationRegistry, OrgError } = require('./organizations');
const { verifyFirebaseIdToken } = require('./firebase-verify');
const { UnconfiguredEmailProvider, UnconfiguredSMSProvider } = require('./delivery-provider');

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
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
} = {}) {
  const db = openDb(dbPath);
  const rp = new RelyingParty(db, { rpId, rpName, origin, now });
  const nowFn = now || (() => Date.now());
  const orgs = new OrganizationRegistry(db, { now: nowFn });

  const forgotLimiter = new RateLimiter({ ...forgotPasswordRateLimit, now: nowFn });
  const loginLimiter = new RateLimiter({ ...loginRateLimit, now: nowFn });
  // Separate from loginLimiter: MFA verification is IP-rate-limited too
  // (defense in depth alongside the per-pendingId attempt cap already
  // enforced in rp.js), but a stricter login-attempt cap must not also
  // throttle someone entering their code correctly on a later try.
  const mfaLimiter = new RateLimiter({ ...mfaRateLimit, now: nowFn });

  function currentSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return rp.resolveSession(cookies[SESSION_COOKIE]);
  }

  const routes = {
    'POST /webauthn/register/begin': async (req, res) => {
      const body = await readJsonBody(req);
      if (!body.email) return sendJson(res, 400, { error: 'email_required' });
      const options = rp.beginRegistration({ email: body.email, nickname: body.nickname });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/register/complete': async (req, res) => {
      const body = await readJsonBody(req);
      const result = rp.completeRegistration({
        email: body.email,
        clientDataJSON: body.clientDataJSON,
        attestationObjectB64: body.attestationObject,
        nickname: body.nickname,
      });
      return sendJson(res, 200, { ok: true, credentialId: result.credentialId });
    },

    'POST /webauthn/authenticate/begin': async (req, res) => {
      const body = await readJsonBody(req);
      const options = rp.beginAuthentication({ email: body.email });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/authenticate/complete': async (req, res) => {
      const body = await readJsonBody(req);
      const result = rp.completeAuthentication({
        credentialId: body.credentialId,
        clientDataJSON: body.clientDataJSON,
        authenticatorDataB64: body.authenticatorData,
        signatureB64: body.signature,
      });
      const user = rp.getUserById(result.userId);
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
        const user = rp.registerWithPassword({ email: body.email, password: body.password });
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
      if (!body.email || !body.password) return sendJson(res, 400, { error: 'email_and_password_required' });
      try {
        const result = rp.authenticateWithPassword({ email: body.email, password: body.password });
        if (result.mfaRequired) {
          return sendJson(res, 200, { ok: true, mfaRequired: true, pendingId: result.pendingId, expiresAt: result.expiresAt });
        }
        const user = rp.getUserById(result.userId);
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
          ? rp.completePendingAuthWithRecoveryCode(body.pendingId, body.code)
          : rp.completePendingAuthWithTotp(body.pendingId, body.code);
        const user = rp.getUserById(result.userId);
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
      if (body.pendingId) rp.cancelPendingAuthSession(body.pendingId);
      return sendJson(res, 200, { ok: true });
    },

    // Enrollment requires an already-authenticated session — never a
    // bare email/userId supplied by the request body.
    'POST /auth/mfa/totp/enroll/begin': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const result = rp.beginTotpEnrollment(session.userId);
      return sendJson(res, 200, result);
    },

    'POST /auth/mfa/totp/enroll/complete': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.code) return sendJson(res, 400, { error: 'code_required' });
      try {
        const result = rp.completeTotpEnrollment(session.userId, body.code);
        return sendJson(res, 200, result);
      } catch (err) {
        if (err instanceof AuthError) return sendJson(res, 400, { error: err.code });
        throw err;
      }
    },

    'POST /auth/mfa/totp/disable': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      rp.disableTotp(session.userId);
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

      const issued = rp.createPasswordResetToken(body.email);
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
          rp._audit(issued.user.id, 'password_reset_delivery_failed', {});
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
        rp.completePasswordReset({ token: body.token, newPassword: body.newPassword });
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

      const result = rp.authenticateWithVerifiedFirebase({
        firebaseUid: verified.uid,
        email: verified.email,
      });
      const user = rp.getUserById(result.userId);
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
    'GET /webauthn/session': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { authenticated: false });
      const organizations = orgs.listUserOrganizations(session.userId, { status: 'active' }).map((m) => {
        const org = orgs.getOrganization(m.organizationId);
        return {
          organizationId: m.organizationId,
          name: org ? org.name : null,
          membershipId: m.id,
          status: m.status,
          isOrgAdmin: orgs.isAuthorized(session.userId, m.organizationId, 'org:workforce:manage'),
        };
      });
      return sendJson(res, 200, {
        authenticated: true,
        email: session.email,
        isPlatformAdmin: session.isPlatformAdmin,
        organizations,
      });
    },

    'POST /webauthn/logout': async (req, res) => {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[SESSION_COOKIE]) rp.revokeSession(cookies[SESSION_COOKIE]);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookieHeader(null, { clear: true }) });
    },

    'GET /webauthn/passkeys': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const creds = rp.listCredentials(session.userId).map((c) => ({
        credentialId: c.credential_id,
        nickname: c.nickname,
        algorithm: c.algorithm,
        createdAt: c.created_at,
        lastUsedAt: c.last_used_at,
      }));
      return sendJson(res, 200, { passkeys: creds });
    },

    'POST /webauthn/passkeys/revoke': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      rp.revokeCredential(session.userId, body.credentialId);
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
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const options = rp.beginRegistration({ email: session.email });
      return sendJson(res, 200, options);
    },

    'POST /webauthn/passkeys/enroll/complete': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const result = rp.completeRegistration({
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
      const session = currentSession(req);
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
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      return sendJson(res, 200, { memberships: orgs.listUserOrganizations(session.userId) });
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
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || typeof body.organizationId !== 'string') {
        return sendJson(res, 400, { error: 'organizationId_required' });
      }

      const membership = orgs.getMembership(session.userId, body.organizationId);
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

      const organization = orgs.getOrganization(body.organizationId);
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
        isOrgAdmin: orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:manage'),
        canManageWorkforce: orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:manage'),
        canReadWorkforce: orgs.isAuthorized(session.userId, body.organizationId, 'org:workforce:read'),
        canManageApplications: orgs.isAuthorized(session.userId, body.organizationId, 'org:applications:manage'),
        canManagePermissions: orgs.isAuthorized(session.userId, body.organizationId, 'org:permissions:manage'),
      });
    },

    'POST /organizations/create': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const org = orgs.createOrganization(session.userId, { name: body.name });
      return sendJson(res, 200, { ok: true, organization: org });
    },

    'POST /organizations/authorize': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { authorized: false, reason: 'not_authenticated' });
      const body = await readJsonBody(req);
      if (!body.organizationId || !body.capability) return sendJson(res, 400, { error: 'organizationId_and_capability_required' });
      const authorized = orgs.isAuthorized(session.userId, body.organizationId, body.capability);
      return sendJson(res, 200, { authorized });
    },

    'POST /organizations/members/list': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const members = orgs.listOrganizationMembers(body.organizationId, session.userId, { status: body.status });
      return sendJson(res, 200, { members });
    },

    'POST /organizations/invite': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.invite(session.userId, { organizationId: body.organizationId, userId: body.userId, roles: body.roles });
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/accept': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.acceptInvitation(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/decline': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.declineInvitation(session.userId, body.organizationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/invite/revoke': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.revokeInvitation(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/suspend': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.suspendMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/reactivate': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.reactivateMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/membership/remove': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.removeMembership(session.userId, body.organizationId, body.targetUserId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/role/assign': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.assignRole(session.userId, body.organizationId, body.targetUserId, body.role);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/role/remove': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.removeRole(session.userId, body.organizationId, body.targetUserId, body.role);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/application/assign': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.assignApplication(session.userId, body.organizationId, body.targetUserId, body.applicationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/application/remove': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.removeApplication(session.userId, body.organizationId, body.targetUserId, body.applicationId);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/permission/grant': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.grantPermission(session.userId, body.organizationId, body.targetUserId, body.permissionName, body.effect);
      return sendJson(res, 200, { ok: true, membership });
    },

    'POST /organizations/permission/revoke': async (req, res) => {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not_authenticated' });
      const body = await readJsonBody(req);
      const membership = orgs.revokePermission(session.userId, body.organizationId, body.targetUserId, body.permissionName);
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
      if (err instanceof TypeError) return sendJson(res, 400, { error: 'invalid_request' });
      // eslint-disable-next-line no-console
      console.error('webauthn-rp internal error:', err);
      return sendJson(res, 500, { error: 'internal_error' });
    }
  });

  server.rp = rp;
  server.db = db;
  server.orgs = orgs;
  return server;
}

module.exports = { createServer, SESSION_COOKIE, parseCookies, GENERIC_FORGOT_MESSAGE };
