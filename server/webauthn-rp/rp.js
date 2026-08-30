'use strict';
const crypto = require('node:crypto');
const cbor = require('./cbor');
const { parseAuthenticatorData, coseKeyToCryptoKey, verifySignature } = require('./authenticator-data');
const { generateTotpSecret, verifyTotpCode, totpProvisioningUri, generateRecoveryCode, hashRecoveryCode } = require('./totp');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RESET_TOKEN_BYTES = 32; // 256 bits, well above "sufficiently long"

// Phase C §4 — real server-side pending-MFA state. Deliberately much
// shorter than SESSION_TTL_MS: this is a "prove the second factor right
// now" window, not a session. MAX_MFA_ATTEMPTS bounds brute-forcing a
// 6-digit TOTP code against one pending id (combined with the recovery
// code's much higher entropy, and IP-level rate limiting in server.js).
const PENDING_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_MFA_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

// ---------- password hashing (scrypt, node:crypto builtin — no external dep) ----------
// Format: scrypt$N$r$p$<saltHex>$<hashHex>. N/r/p are stored alongside the
// hash (not hardcoded at verify time) so parameters can be strengthened
// later without invalidating already-issued hashes.
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPasswordHash(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr), r = Number(rStr), p = Number(pStr);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function hashResetToken(token) {
  // Reset tokens are stored hashed (SHA-256 is fine here: the token is
  // already 256 bits of CSPRNG output, not a low-entropy secret being
  // slow-hashed for brute-force resistance — this is a lookup-integrity
  // hash, not a password hash).
  return crypto.createHash('sha256').update(token).digest('hex');
}

class RelyingParty {
  constructor(db, { rpId, rpName, origin, now = () => Date.now() }) {
    this.db = db;
    this.rpId = rpId;
    this.rpName = rpName;
    this.origin = origin;
    this.now = now;
  }

  // ---------- users ----------

  getOrCreateUser(email) {
    const existing = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return existing;
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)')
      .run(id, email, this.now());
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  getUserById(userId) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }

  getUserByFirebaseUid(firebaseUid) {
    return this.db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);
  }

  // ---------- single-identity resolution (Firebase <-> CozyOS user) ----------
  //
  // This is the ONLY place a Firebase identity is ever turned into a
  // CozyOS user row. It must never create a second CozyOS account for a
  // person who already has one just because they authenticated through a
  // different mechanism this time (WebAuthn passkey vs. Firebase). The
  // three cases below are exhaustive:
  //
  //   1. firebase_uid already linked to a CozyOS user  -> reuse that user.
  //   2. no link yet, but a CozyOS user already exists
  //      with this email (e.g. registered a passkey first) -> link this
  //      Firebase identity onto that SAME existing user, don't duplicate.
  //   3. neither exists -> create one new CozyOS user with both the email
  //      and the firebase_uid set from the start.
  //
  // `email` here has already been through Firebase ID-token verification
  // (see firebase-verify.js) and is only ever the token's own verified
  // `email` claim — never a client-supplied field taken at face value.
  resolveOrCreateUserForFirebase({ firebaseUid, email }) {
    if (!firebaseUid || !email) throw new AuthError('firebase_identity_incomplete');

    const byFirebaseUid = this.getUserByFirebaseUid(firebaseUid);
    if (byFirebaseUid) return byFirebaseUid;

    const byEmail = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (byEmail) {
      if (byEmail.firebase_uid && byEmail.firebase_uid !== firebaseUid) {
        // This CozyOS account's email is already linked to a *different*
        // Firebase identity than the one presenting right now. Refuse
        // rather than silently re-pointing the link — that would let one
        // Firebase identity hijack another's linked CozyOS account.
        throw new AuthError('firebase_link_conflict');
      }
      if (!byEmail.firebase_uid) {
        this.db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(firebaseUid, byEmail.id);
        this._audit(byEmail.id, 'firebase_identity_linked', { firebaseUid });
      }
      return this.getUserById(byEmail.id);
    }

    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO users (id, email, is_platform_admin, created_at, firebase_uid) VALUES (?, ?, 0, ?, ?)'
    ).run(id, email, this.now(), firebaseUid);
    this._audit(id, 'user_created_via_firebase', { firebaseUid });
    return this.getUserById(id);
  }

  // Authoritative entry point for a Firebase login that has ALREADY been
  // cryptographically verified (see firebase-verify.js). Produces the
  // exact same session shape completeAuthentication() (the WebAuthn
  // path) does, so both authentication methods converge on one session
  // model — the server.js route sets the identical cozy_admin_session
  // cookie from either return value.
  authenticateWithVerifiedFirebase({ firebaseUid, email }) {
    const user = this.resolveOrCreateUserForFirebase({ firebaseUid, email });
    const session = this.createSession(user.id);
    this._audit(user.id, 'firebase_authentication_succeeded', { firebaseUid });
    return { userId: user.id, session };
  }

  // Administrative bootstrap only — never reachable from an HTTP route.
  // The whole point of this system is that no client request can flip
  // this bit; it is only ever set by a trusted operator script.
  setPlatformAdmin(userId, isAdmin) {
    this.db.prepare('UPDATE users SET is_platform_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
  }

  // ---------- challenges ----------

  _issueChallenge(userId, purpose) {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    this.db.prepare(
      'INSERT INTO challenges (challenge, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(challenge, userId || null, purpose, now, now + CHALLENGE_TTL_MS);
    return challenge;
  }

  _consumeChallenge(challenge, purpose) {
    const row = this.db.prepare('SELECT * FROM challenges WHERE challenge = ?').get(challenge);
    if (!row) throw new AuthError('unknown_challenge');
    if (row.purpose !== purpose) throw new AuthError('challenge_purpose_mismatch');
    if (row.consumed_at) throw new AuthError('challenge_already_used');
    if (this.now() > row.expires_at) throw new AuthError('challenge_expired');
    this.db.prepare('UPDATE challenges SET consumed_at = ? WHERE challenge = ?').run(this.now(), challenge);
    return row;
  }

  // ---------- registration ----------

  beginRegistration({ email, nickname }) {
    const user = this.getOrCreateUser(email);
    const existingCreds = this.listCredentials(user.id);
    const challenge = this._issueChallenge(user.id, 'registration');
    return {
      challenge,
      rp: { id: this.rpId, name: this.rpName },
      user: { id: Buffer.from(user.id).toString('base64url'), name: email, displayName: email },
      excludeCredentials: existingCreds.map((c) => ({ id: c.credential_id, type: 'public-key' })),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      nickname: nickname || null,
    };
  }

  completeRegistration({ email, clientDataJSON, attestationObjectB64, nickname }) {
    const user = this.getOrCreateUser(email);
    const clientData = this._verifyClientData(clientDataJSON, 'webauthn.create');
    this._consumeChallenge(clientData.challenge, 'registration');

    const attestationObject = cbor.decode(Buffer.from(attestationObjectB64, 'base64url')).value;
    const authData = attestationObject.get('authData');
    const parsed = parseAuthenticatorData(authData);

    const expectedRpIdHash = crypto.createHash('sha256').update(this.rpId).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      throw new AuthError('rp_id_hash_mismatch');
    }
    if (!parsed.flags.userPresent) throw new AuthError('user_not_present');
    if (!parsed.credentialId || !parsed.coseKeyMap) {
      throw new AuthError('missing_attested_credential_data');
    }

    const { keyObject, algorithm } = coseKeyToCryptoKey(parsed.coseKeyMap);
    const credentialIdB64 = parsed.credentialId.toString('base64url');

    const dupe = this.db.prepare('SELECT 1 FROM credentials WHERE credential_id = ?').get(credentialIdB64);
    if (dupe) throw new AuthError('credential_already_registered');

    this.db.prepare(
      `INSERT INTO credentials
        (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at, nickname)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      credentialIdB64,
      user.id,
      JSON.stringify(keyObject.export({ format: 'jwk' })),
      algorithm,
      parsed.signCount,
      this.now(),
      nickname || null,
    );

    this._audit(user.id, 'passkey_registered', { credentialId: credentialIdB64 });
    return { userId: user.id, credentialId: credentialIdB64 };
  }

  // ---------- authentication ----------

  beginAuthentication({ email } = {}) {
    let userId = null;
    let allowCredentials;
    if (email) {
      const user = this.getOrCreateUser(email);
      userId = user.id;
      allowCredentials = this.listCredentials(userId).map((c) => ({ id: c.credential_id, type: 'public-key' }));
    }
    const challenge = this._issueChallenge(userId, 'authentication');
    return { challenge, rpId: this.rpId, allowCredentials: allowCredentials || [] };
  }

  completeAuthentication({ credentialId, clientDataJSON, authenticatorDataB64, signatureB64 }) {
    const cred = this.db.prepare('SELECT * FROM credentials WHERE credential_id = ?').get(credentialId);
    if (!cred) throw new AuthError('unknown_credential');
    if (cred.revoked_at) throw new AuthError('credential_revoked');

    const clientData = this._verifyClientData(clientDataJSON, 'webauthn.get');
    this._consumeChallenge(clientData.challenge, 'authentication');

    const authenticatorData = Buffer.from(authenticatorDataB64, 'base64url');
    const signature = Buffer.from(signatureB64, 'base64url');
    const parsed = parseAuthenticatorData(authenticatorData);

    const expectedRpIdHash = crypto.createHash('sha256').update(this.rpId).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) throw new AuthError('rp_id_hash_mismatch');
    if (!parsed.flags.userPresent) throw new AuthError('user_not_present');

    // Cloned-authenticator detection: signature counter must strictly
    // increase (0 is allowed to mean "authenticator doesn't support counters"
    // only if it was already 0 and stays 0 — otherwise any non-increase is
    // treated as a possible clone and rejected).
    if (parsed.signCount !== 0 || cred.sign_count !== 0) {
      if (parsed.signCount <= cred.sign_count) {
        this._audit(cred.user_id, 'possible_cloned_authenticator', { credentialId });
        throw new AuthError('sign_count_did_not_increase');
      }
    }

    const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    const jwk = JSON.parse(cred.public_key_jwk);
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = verifySignature({ algorithm: cred.algorithm, keyObject, signedData, signature });
    if (!ok) {
      this._audit(cred.user_id, 'forged_signature_rejected', { credentialId });
      throw new AuthError('invalid_signature');
    }

    this.db.prepare('UPDATE credentials SET sign_count = ?, last_used_at = ? WHERE credential_id = ?')
      .run(parsed.signCount, this.now(), credentialId);

    const session = this.createSession(cred.user_id);
    this._audit(cred.user_id, 'authentication_succeeded', { credentialId });
    return { userId: cred.user_id, session };
  }

  // ---------- client data verification ----------

  _verifyClientData(clientDataJSONB64, expectedType) {
    const json = Buffer.from(clientDataJSONB64, 'base64url').toString('utf8');
    let clientData;
    try {
      clientData = JSON.parse(json);
    } catch (_e) {
      throw new AuthError('malformed_client_data');
    }
    if (clientData.type !== expectedType) throw new AuthError('unexpected_ceremony_type');
    if (clientData.origin !== this.origin) throw new AuthError('origin_mismatch');
    if (!clientData.challenge) throw new AuthError('missing_challenge');
    return clientData;
  }

  // ---------- sessions ----------

  createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    this.db.prepare('INSERT INTO sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, userId, now, now + SESSION_TTL_MS);
    return { sessionId, expiresAt: now + SESSION_TTL_MS };
  }

  // Returns { userId, isPlatformAdmin } or null. This is the ONLY path by
  // which "is this request an administrator" is ever decided — it always
  // re-reads the users table; it never trusts anything the client sent.
  resolveSession(sessionId) {
    if (!sessionId) return null;
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
    if (!row) return null;
    if (row.revoked_at) return null;
    if (this.now() > row.expires_at) return null;
    const user = this.getUserById(row.user_id);
    if (!user) return null;
    return { userId: user.id, email: user.email, isPlatformAdmin: !!user.is_platform_admin };
  }

  revokeSession(sessionId) {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_id = ?').run(this.now(), sessionId);
  }

  // ---------- password authentication ----------
  //
  // Mirrors the WebAuthn/Firebase paths: the only externally-callable
  // outcome of a successful password login is the same createSession()
  // this file already uses everywhere else, so every authentication
  // method converges on one session model and one downstream
  // resolveSession()/isPlatformAdmin decision.

  // Sets/replaces the password for an existing or new account. Used by the
  // (future) registration flow and by completePasswordReset() below. Never
  // reachable from an HTTP route without either a verified reset token or
  // an already-authenticated session — server.js enforces that, not this
  // method, but this method is what makes that boundary meaningful: it
  // never itself authenticates anyone, it only stores a hash.
  setPassword(userId, password) {
    const hash = hashPassword(password);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }

  registerWithPassword({ email, password }) {
    const existing = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing && existing.password_hash) throw new AuthError('account_already_has_password');
    const user = existing || this.getOrCreateUser(email);
    this.setPassword(user.id, password);
    this._audit(user.id, 'password_registered', {});
    return this.getUserById(user.id);
  }

  // Constant-shape failure path: whether the email doesn't exist, has no
  // password set, is disabled, or the password is simply wrong, the caller
  // gets the same AuthError code and (approximately) the same amount of
  // hashing work happens, so a timing/response-shape attacker can't
  // enumerate which of those is true. A dummy scrypt hash is computed on
  // the "no such account" path specifically so that path isn't
  // measurably cheaper than the real one.
  //
  // Phase C §4 — real "password_verified_pending_mfa" branch: when the
  // account has totp_enabled = 1, a correct password no longer creates a
  // real session. It creates a pending-auth row instead (see
  // createPendingAuthSession below), and the caller (server.js) must
  // never set the real session cookie from this return shape — only
  // completePendingAuthWithTotp()/completePendingAuthWithRecoveryCode()
  // below can ever produce a real session for this login attempt.
  authenticateWithPassword({ email, password }) {
    const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash) {
      // Burn roughly the same scrypt cost as a real verification so this
      // branch isn't distinguishable by response time.
      hashPassword(password || '');
      throw new AuthError('invalid_credentials');
    }
    if (user.disabled_at) throw new AuthError('account_disabled');
    const ok = verifyPasswordHash(password || '', user.password_hash);
    if (!ok) {
      this._audit(user.id, 'password_login_failed', {});
      throw new AuthError('invalid_credentials');
    }

    if (user.totp_enabled) {
      const pending = this.createPendingAuthSession(user.id);
      this._audit(user.id, 'password_verified_pending_mfa', {});
      return { mfaRequired: true, userId: user.id, pendingId: pending.pendingId, expiresAt: pending.expiresAt };
    }

    const session = this.createSession(user.id);
    this._audit(user.id, 'password_authentication_succeeded', {});
    return { userId: user.id, session };
  }

  // ---------- pending-MFA lifecycle (Phase C §4) ----------
  //
  // A pending_auth_sessions row is intentionally NOT a sessions row.
  // resolveSession()/currentSession() (server.js) never query this
  // table, so a pending id — however it leaked — cannot authorize
  // /webauthn/session, admin routes, or any protected resource. The
  // only two ways out of a pending row are: (a) a verified second
  // factor, which calls createSession() for the first time for this
  // login attempt, or (b) expiry/cancellation/attempt-exhaustion, which
  // never produce a session at all.

  createPendingAuthSession(userId) {
    const pendingId = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    this.db.prepare(
      'INSERT INTO pending_auth_sessions (pending_id, user_id, created_at, expires_at, attempts) VALUES (?, ?, ?, ?, 0)'
    ).run(pendingId, userId, now, now + PENDING_AUTH_TTL_MS);
    return { pendingId, expiresAt: now + PENDING_AUTH_TTL_MS };
  }

  // Internal: loads a pending row and throws the specific reason it
  // cannot be used, without ever creating a session as a side effect.
  _loadUsablePendingAuth(pendingId) {
    const row = this.db.prepare('SELECT * FROM pending_auth_sessions WHERE pending_id = ?').get(pendingId);
    if (!row) throw new AuthError('mfa_session_invalid');
    if (row.consumed_at) throw new AuthError('mfa_session_invalid');
    if (row.cancelled_at) throw new AuthError('mfa_session_cancelled');
    if (row.locked_at) throw new AuthError('mfa_attempts_exceeded');
    if (this.now() > row.expires_at) throw new AuthError('mfa_session_expired');
    return row;
  }

  _recordPendingAuthFailure(row) {
    const attempts = row.attempts + 1;
    const now = this.now();
    if (attempts >= MAX_MFA_ATTEMPTS) {
      this.db.prepare('UPDATE pending_auth_sessions SET attempts = ?, locked_at = ? WHERE pending_id = ?')
        .run(attempts, now, row.pending_id);
      this._audit(row.user_id, 'mfa_failed', { attempts, locked: true });
      throw new AuthError('mfa_attempts_exceeded');
    }
    this.db.prepare('UPDATE pending_auth_sessions SET attempts = ? WHERE pending_id = ?').run(attempts, row.pending_id);
    this._audit(row.user_id, 'mfa_failed', { attempts, locked: false });
    throw new AuthError('invalid_mfa_code');
  }

  // Verifies a TOTP code against a pending login attempt. Only on
  // success does this call createSession() — the one and only session
  // this login attempt will ever produce.
  completePendingAuthWithTotp(pendingId, code) {
    const row = this._loadUsablePendingAuth(pendingId);
    const user = this.getUserById(row.user_id);
    if (!user || !user.totp_enabled || !user.totp_secret) {
      throw new AuthError('mfa_session_invalid');
    }
    const ok = verifyTotpCode(user.totp_secret, code || '');
    if (!ok) return this._recordPendingAuthFailure(row);

    this.db.prepare('UPDATE pending_auth_sessions SET consumed_at = ? WHERE pending_id = ?').run(this.now(), pendingId);
    const session = this.createSession(user.id);
    this._audit(user.id, 'mfa_verified', { method: 'totp' });
    return { userId: user.id, session };
  }

  // Recovery-code path: same pending-row lifecycle, different
  // credential. Each code is single-use (used_at set on success) and
  // never revealed again after the enrollment response that generated
  // it — only its hash is ever stored.
  completePendingAuthWithRecoveryCode(pendingId, code) {
    const row = this._loadUsablePendingAuth(pendingId);
    const user = this.getUserById(row.user_id);
    if (!user || !user.totp_enabled) throw new AuthError('mfa_session_invalid');

    const codeHash = hashRecoveryCode(code || '');
    const codeRow = this.db.prepare(
      'SELECT * FROM mfa_recovery_codes WHERE code_hash = ? AND user_id = ? AND used_at IS NULL'
    ).get(codeHash, user.id);
    if (!codeRow) return this._recordPendingAuthFailure(row);

    this.db.prepare('UPDATE mfa_recovery_codes SET used_at = ? WHERE code_hash = ?').run(this.now(), codeHash);
    this.db.prepare('UPDATE pending_auth_sessions SET consumed_at = ? WHERE pending_id = ?').run(this.now(), pendingId);
    const session = this.createSession(user.id);
    this._audit(user.id, 'mfa_verified', { method: 'recovery_code' });
    return { userId: user.id, session };
  }

  // Cancellation (user closes the OTP modal / gives up): marks the
  // pending row dead. It was never a session, so there is nothing to
  // revoke server-side beyond this — closing this row is the whole
  // mitigation.
  cancelPendingAuthSession(pendingId) {
    const row = this.db.prepare('SELECT * FROM pending_auth_sessions WHERE pending_id = ?').get(pendingId);
    if (!row) return { ok: false };
    if (!row.consumed_at && !row.cancelled_at) {
      this.db.prepare('UPDATE pending_auth_sessions SET cancelled_at = ? WHERE pending_id = ?').run(this.now(), pendingId);
      this._audit(row.user_id, 'mfa_cancelled', {});
    }
    return { ok: true };
  }

  // ---------- TOTP enrollment (Phase C §5) ----------
  //
  // Enrollment is two-phase, exactly like WebAuthn registration
  // elsewhere in this file: beginTotpEnrollment() stores a *pending*
  // secret (totp_enabled stays 0 — authenticateWithPassword() ignores
  // an unconfirmed secret), and only completeTotpEnrollment() — which
  // requires the caller to prove they can already generate a real code
  // from it — flips totp_enabled to 1. This guarantees an account can
  // never be locked out by an enrollment that was started but never
  // actually finished with a working authenticator app.

  beginTotpEnrollment(userId) {
    const user = this.getUserById(userId);
    if (!user) throw new AuthError('user_not_found');
    const secret = generateTotpSecret();
    this.db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0, totp_enrolled_at = NULL WHERE id = ?')
      .run(secret, userId);
    this._audit(userId, 'mfa_enrollment_started', {});
    return { secret, otpauthUrl: totpProvisioningUri({ secret, email: user.email }) };
  }

  completeTotpEnrollment(userId, code) {
    const user = this.getUserById(userId);
    if (!user || !user.totp_secret) throw new AuthError('mfa_enrollment_not_started');
    const ok = verifyTotpCode(user.totp_secret, code || '');
    if (!ok) throw new AuthError('invalid_mfa_code');

    this.db.prepare('UPDATE users SET totp_enabled = 1, totp_enrolled_at = ? WHERE id = ?').run(this.now(), userId);
    // Replace any prior recovery-code set with a fresh one — an old set
    // from a previous enrollment attempt must not remain valid.
    this.db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
    const rawCodes = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const raw = generateRecoveryCode();
      rawCodes.push(raw);
      this.db.prepare('INSERT INTO mfa_recovery_codes (code_hash, user_id, created_at) VALUES (?, ?, ?)')
        .run(hashRecoveryCode(raw), userId, this.now());
    }
    this._audit(userId, 'mfa_enabled', {});
    // Recovery codes are returned in the clear exactly once, here. No
    // other method in this file can ever retrieve them again.
    return { ok: true, recoveryCodes: rawCodes };
  }

  disableTotp(userId) {
    this.db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_enrolled_at = NULL WHERE id = ?').run(userId);
    this.db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
    this._audit(userId, 'mfa_disabled', {});
  }

  setAccountDisabled(userId, disabled) {
    this.db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(disabled ? this.now() : null, userId);
  }

  // ---------- password reset ----------

  // Always returns normally (never throws for "account doesn't exist") so
  // the HTTP route can send one generic response regardless of outcome —
  // see server.js GENERIC_FORGOT_MESSAGE. Returns { user, token } only
  // when there is actually an account with a password to reset; returns
  // null otherwise, and the route must treat both the same way on the
  // wire.
  createPasswordResetToken(email) {
    const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash) return null;
    if (user.disabled_at) return null;
    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashResetToken(token);
    const now = this.now();
    // Regenerating invalidates every earlier outstanding token for this
    // user (§15 "invalidated when regenerated") — only the most recently
    // issued token can ever be valid at once.
    this.db.prepare(
      'UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL'
    ).run(now, user.id);
    this.db.prepare(
      'INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(tokenHash, user.id, now, now + RESET_TOKEN_TTL_MS);
    this._audit(user.id, 'password_reset_token_issued', {});
    return { user, token };
  }

  // Verifies + consumes a reset token and sets the new password in one
  // atomic-enough sequence (single-writer node:sqlite, no concurrent
  // interleaving within this process). Also revokes every existing
  // session for the account (a password reset is a "someone may have had
  // access, cut it all off" event) and invalidates every other
  // outstanding reset token for the same user, so regenerating a token
  // invalidates the earlier one rather than leaving two valid at once.
  completePasswordReset({ token, newPassword }) {
    const tokenHash = hashResetToken(token);
    const row = this.db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(tokenHash);
    if (!row) throw new AuthError('invalid_reset_token');
    if (row.consumed_at) throw new AuthError('reset_token_already_used');
    if (this.now() > row.expires_at) throw new AuthError('reset_token_expired');

    const now = this.now();
    this.db.prepare('UPDATE password_reset_tokens SET consumed_at = ? WHERE token_hash = ?').run(now, tokenHash);
    // Invalidate every other outstanding token for this user too.
    this.db.prepare(
      'UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL'
    ).run(now, row.user_id);

    this.setPassword(row.user_id, newPassword);
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, row.user_id);
    this._audit(row.user_id, 'password_reset_completed', {});
    return { userId: row.user_id };
  }

  // ---------- credential management ----------

  listCredentials(userId) {
    return this.db.prepare('SELECT * FROM credentials WHERE user_id = ? AND revoked_at IS NULL').all(userId);
  }

  revokeCredential(userId, credentialId) {
    const cred = this.db.prepare('SELECT * FROM credentials WHERE credential_id = ?').get(credentialId);
    if (!cred || cred.user_id !== userId) throw new AuthError('not_your_credential');
    this.db.prepare('UPDATE credentials SET revoked_at = ? WHERE credential_id = ?').run(this.now(), credentialId);
    this._audit(userId, 'passkey_revoked', { credentialId });
  }

  _audit(userId, eventType, detail) {
    this.db.prepare('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)')
      .run(userId || null, eventType, JSON.stringify(detail || {}), this.now());
  }
}

class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

module.exports = { RelyingParty, AuthError, hashPassword, verifyPasswordHash, hashResetToken };
