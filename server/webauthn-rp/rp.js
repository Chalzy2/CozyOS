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
  return crypto.createHash('sha256').update(token).digest('hex');
}

// PHASE B2 — ASYNC CONVERSION. Every method is now async and every
// database call is awaited, against the shared DatabaseAdapter interface
// (database-adapter.js) instead of a raw node:sqlite handle. Every
// branch/error-code/audit-event/early-return is preserved exactly from
// the pre-B2 synchronous version — this changes HOW the database is
// called, not what any method decides. Multi-step sequences needing
// atomicity now run inside this.db.transaction(); independent single
// statements are deliberately left un-transacted.
class RelyingParty {
  constructor(db, { rpId, rpName, origin, now = () => Date.now() }) {
    this.db = db;
    this.rpId = rpId;
    this.rpName = rpName;
    this.origin = origin;
    this.now = now;
  }

  // ---------- users ----------

  async getOrCreateUser(email) {
    const existing = await this.db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return existing;
    const id = crypto.randomUUID();
    await this.db.run(
      'INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)',
      [id, email, this.now()]
    );
    return this.db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async getUserById(userId) {
    return this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  async getUserByFirebaseUid(firebaseUid) {
    return this.db.get('SELECT * FROM users WHERE firebase_uid = ?', [firebaseUid]);
  }

  // CHALZYDASHBOARD-USERNAME-LOGIN: resolves the SAME canonical server
  // user row by its optional operator-assigned username. This is a
  // lookup only — it never creates a user and never touches
  // is_platform_admin/password_hash. See setUsername() for the only
  // (trusted-operator-only) way this column is ever written.
  async getUserByUsername(username) {
    if (!username) return null;
    return this.db.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  // Trusted-operator-only, exactly like setPlatformAdmin() — never wired
  // to any HTTP route (see bootstrap-admin.js's own header for why).
  // Throws on a duplicate username rather than silently overwriting a
  // different user's mapping.
  async setUsername(userId, username) {
    if (username) {
      const existing = await this.getUserByUsername(username);
      if (existing && existing.id !== userId) {
        throw new AuthError('username_already_taken');
      }
    }
    await this.db.run('UPDATE users SET username = ? WHERE id = ?', [username || null, userId]);
    return this.getUserById(userId);
  }

  // ---------- single-identity resolution (Firebase <-> CozyOS user) ----------
  // STEP 4 (transactions): the check-then-act sequence below was safe by
  // construction under SQLite's single-writer serialization but is a
  // genuine race under PostgreSQL's real concurrency. Wrapped so the
  // whole read-then-write sequence is atomic against a concurrent
  // identical request.
  async resolveOrCreateUserForFirebase({ firebaseUid, email }) {
    if (!firebaseUid || !email) throw new AuthError('firebase_identity_incomplete');

    try {
      return await this.db.transaction(async (tx) => {
        const byFirebaseUid = await tx.get('SELECT * FROM users WHERE firebase_uid = ?', [firebaseUid]);
        if (byFirebaseUid) return byFirebaseUid;

        const byEmail = await tx.get('SELECT * FROM users WHERE email = ?', [email]);
        if (byEmail) {
          if (byEmail.firebase_uid && byEmail.firebase_uid !== firebaseUid) {
            throw new AuthError('firebase_link_conflict');
          }
          if (!byEmail.firebase_uid) {
            await tx.run('UPDATE users SET firebase_uid = ? WHERE id = ?', [firebaseUid, byEmail.id]);
            await this._auditWith(tx, byEmail.id, 'firebase_identity_linked', { firebaseUid });
          }
          return tx.get('SELECT * FROM users WHERE id = ?', [byEmail.id]);
        }

        const id = crypto.randomUUID();
        await tx.run(
          'INSERT INTO users (id, email, is_platform_admin, created_at, firebase_uid) VALUES (?, ?, 0, ?, ?)',
          [id, email, this.now(), firebaseUid]
        );
        await this._auditWith(tx, id, 'user_created_via_firebase', { firebaseUid });
        return tx.get('SELECT * FROM users WHERE id = ?', [id]);
      });
    } catch (err) {
      // PostgreSQL can expose a genuine concurrent INSERT race here:
      // two transactions may both observe "no user" and one may then
      // lose the users.email unique constraint. SQLite's single-writer
      // model never exposed this race. Only retry the specific unique
      // conflict; all other errors preserve their original behavior.
      if (err && err.code === '23505' && err.constraint === 'users_email_key') {
        const existing = await this.db.get(
          'SELECT * FROM users WHERE email = ?',
          [email]
        );
        if (!existing) throw err;

        if (existing.firebase_uid && existing.firebase_uid !== firebaseUid) {
          throw new AuthError('firebase_link_conflict');
        }

        if (!existing.firebase_uid) {
          await this.db.run(
            'UPDATE users SET firebase_uid = ? WHERE id = ?',
            [firebaseUid, existing.id]
          );
          await this._audit(existing.id, 'firebase_identity_linked', { firebaseUid });
        }

        return this.db.get('SELECT * FROM users WHERE id = ?', [existing.id]);
      }

      throw err;
    }
  }

  async authenticateWithVerifiedFirebase({ firebaseUid, email }) {
    const user = await this.resolveOrCreateUserForFirebase({ firebaseUid, email });
    const session = await this.createSession(user.id);
    await this._audit(user.id, 'firebase_authentication_succeeded', { firebaseUid });
    return { userId: user.id, session };
  }

  async setPlatformAdmin(userId, isAdmin) {
    await this.db.run('UPDATE users SET is_platform_admin = ? WHERE id = ?', [isAdmin ? 1 : 0, userId]);
  }

  // ---------- challenges ----------

  async _issueChallenge(userId, purpose) {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    await this.db.run(
      'INSERT INTO challenges (challenge, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [challenge, userId || null, purpose, now, now + CHALLENGE_TTL_MS]
    );
    return challenge;
  }

  async _consumeChallenge(challenge, purpose) {
    const row = await this.db.get('SELECT * FROM challenges WHERE challenge = ?', [challenge]);
    if (!row) throw new AuthError('unknown_challenge');
    if (row.purpose !== purpose) throw new AuthError('challenge_purpose_mismatch');
    if (row.consumed_at) throw new AuthError('challenge_already_used');
    if (this.now() > row.expires_at) throw new AuthError('challenge_expired');
    await this.db.run('UPDATE challenges SET consumed_at = ? WHERE challenge = ?', [this.now(), challenge]);
    return row;
  }

  // ---------- registration ----------

  async beginRegistration({ email, nickname }) {
    const user = await this.getOrCreateUser(email);
    const existingCreds = await this.listCredentials(user.id);
    const challenge = await this._issueChallenge(user.id, 'registration');
    return {
      challenge,
      rp: { id: this.rpId, name: this.rpName },
      user: { id: Buffer.from(user.id).toString('base64url'), name: email, displayName: email },
      excludeCredentials: existingCreds.map((c) => ({ id: c.credential_id, type: 'public-key' })),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      nickname: nickname || null,
    };
  }

  // STEP 4 (transactions): duplicate-credential check + INSERT wrapped
  // so it's atomic against a concurrent replay of the same attestation.
  async completeRegistration({ email, clientDataJSON, attestationObjectB64, nickname }) {
    const user = await this.getOrCreateUser(email);
    const clientData = this._verifyClientData(clientDataJSON, 'webauthn.create');
    await this._consumeChallenge(clientData.challenge, 'registration');

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

    await this.db.transaction(async (tx) => {
      const dupe = await tx.get('SELECT 1 FROM credentials WHERE credential_id = ?', [credentialIdB64]);
      if (dupe) throw new AuthError('credential_already_registered');

      await tx.run(
        `INSERT INTO credentials
          (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at, nickname)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          credentialIdB64,
          user.id,
          JSON.stringify(keyObject.export({ format: 'jwk' })),
          algorithm,
          parsed.signCount,
          this.now(),
          nickname || null,
        ]
      );
      await this._auditWith(tx, user.id, 'passkey_registered', { credentialId: credentialIdB64 });
    });

    return { userId: user.id, credentialId: credentialIdB64 };
  }

  // ---------- authentication ----------

  async beginAuthentication({ email } = {}) {
    let userId = null;
    let allowCredentials;
    if (email) {
      const user = await this.getOrCreateUser(email);
      userId = user.id;
      allowCredentials = (await this.listCredentials(userId)).map((c) => ({ id: c.credential_id, type: 'public-key' }));
    }
    const challenge = await this._issueChallenge(userId, 'authentication');
    return { challenge, rpId: this.rpId, allowCredentials: allowCredentials || [] };
  }

  /**
   * _verifyAndConsumeAssertion({credentialId, clientDataJSON, authenticatorDataB64, signatureB64, challengePurpose, expectedUserId})
   *   The one real place WebAuthn assertion cryptography is verified in
   *   this file — extracted from completeAuthentication() so the new
   *   second-factor MFA completion (completePendingAuthWithWebAuthn(),
   *   below) reuses the exact same signature/anti-clone/origin/rpId
   *   checks rather than duplicating them. Returns the verified
   *   credential row; throws AuthError on any failure. Does not create
   *   a session or write an audit "succeeded" entry — callers own that,
   *   since first-factor and second-factor completion have different
   *   post-verification steps (the former creates a session
   *   immediately; the latter must first consume a pending-auth row).
   *
   *   expectedUserId, when provided (the second-factor case), scopes
   *   the credential lookup so a credential belonging to a DIFFERENT
   *   user can never complete THIS pending-auth session — reported as
   *   the same generic unknown_credential the first-factor path already
   *   uses for a nonexistent credential, so a caller cannot distinguish
   *   "no such credential" from "that credential belongs to someone
   *   else" (avoiding credential enumeration).
   */
  async _verifyAndConsumeAssertion({ credentialId, clientDataJSON, authenticatorDataB64, signatureB64, challengePurpose, expectedUserId }) {
    const cred = await this.db.get('SELECT * FROM credentials WHERE credential_id = ?', [credentialId]);
    if (!cred) throw new AuthError('unknown_credential');
    if (expectedUserId && cred.user_id !== expectedUserId) throw new AuthError('unknown_credential');
    if (cred.revoked_at) throw new AuthError('credential_revoked');

    const clientData = this._verifyClientData(clientDataJSON, 'webauthn.get');
    await this._consumeChallenge(clientData.challenge, challengePurpose);

    const authenticatorData = Buffer.from(authenticatorDataB64, 'base64url');
    const signature = Buffer.from(signatureB64, 'base64url');
    const parsed = parseAuthenticatorData(authenticatorData);

    const expectedRpIdHash = crypto.createHash('sha256').update(this.rpId).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) throw new AuthError('rp_id_hash_mismatch');
    if (!parsed.flags.userPresent) throw new AuthError('user_not_present');

    if (parsed.signCount !== 0 || cred.sign_count !== 0) {
      if (parsed.signCount <= cred.sign_count) {
        await this._audit(cred.user_id, 'possible_cloned_authenticator', { credentialId });
        throw new AuthError('sign_count_did_not_increase');
      }
    }

    const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    const jwk = JSON.parse(cred.public_key_jwk);
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = verifySignature({ algorithm: cred.algorithm, keyObject, signedData, signature });
    if (!ok) {
      await this._audit(cred.user_id, 'forged_signature_rejected', { credentialId });
      throw new AuthError('invalid_signature');
    }

    await this.db.run(
      'UPDATE credentials SET sign_count = ?, last_used_at = ? WHERE credential_id = ?',
      [parsed.signCount, this.now(), credentialId]
    );

    return cred;
  }

  async completeAuthentication({ credentialId, clientDataJSON, authenticatorDataB64, signatureB64 }) {
    const cred = await this._verifyAndConsumeAssertion({ credentialId, clientDataJSON, authenticatorDataB64, signatureB64, challengePurpose: 'authentication' });
    const session = await this.createSession(cred.user_id);
    await this._audit(cred.user_id, 'authentication_succeeded', { credentialId });
    return { userId: cred.user_id, session };
  }

  // ---------- client data verification (no database access — stays sync) ----------

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

  async createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    await this.db.run(
      'INSERT INTO sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, userId, now, now + SESSION_TTL_MS]
    );
    return { sessionId, expiresAt: now + SESSION_TTL_MS };
  }

  async resolveSession(sessionId) {
    if (!sessionId) return null;
    const row = await this.db.get('SELECT * FROM sessions WHERE session_id = ?', [sessionId]);
    if (!row) return null;
    if (row.revoked_at) return null;
    if (this.now() > row.expires_at) return null;
    const user = await this.getUserById(row.user_id);
    if (!user) return null;
    return { userId: user.id, email: user.email, isPlatformAdmin: !!user.is_platform_admin };
  }

  async revokeSession(sessionId) {
    await this.db.run('UPDATE sessions SET revoked_at = ? WHERE session_id = ?', [this.now(), sessionId]);
  }

  // ---------- password authentication ----------

  async setPassword(userId, password) {
    const hash = hashPassword(password);
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  }

  async registerWithPassword({ email, password }) {
    const existing = await this.db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing && existing.password_hash) throw new AuthError('account_already_has_password');
    const user = existing || await this.getOrCreateUser(email);
    await this.setPassword(user.id, password);
    await this._audit(user.id, 'password_registered', {});
    return this.getUserById(user.id);
  }

  // CHALZYDASHBOARD-USERNAME-LOGIN: accepts EITHER `email` OR `username`
  // as the identifier — exactly one real, existing authentication
  // engine, not a second one. Username is resolved to the canonical
  // server user FIRST (a plain lookup, no credential involved), and
  // every line after that point is completely unchanged from the
  // original email-only implementation: same password_hash column, same
  // verifyPasswordHash() call, same MFA gate, same session creation,
  // same audit calls. A caller must supply exactly one identifier — this
  // never means "try both" or "prefer one silently", which would make
  // the effective identity ambiguous.
  async authenticateWithPassword({ email, username, password }) {
    if (email && username) throw new AuthError('identifier_ambiguous');
    if (!email && !username) throw new AuthError('identifier_required');

    const user = email
      ? await this.db.get('SELECT * FROM users WHERE email = ?', [email])
      : await this.getUserByUsername(username);

    if (!user || !user.password_hash) {
      hashPassword(password || '');
      throw new AuthError('invalid_credentials');
    }
    if (user.disabled_at) throw new AuthError('account_disabled');
    const ok = verifyPasswordHash(password || '', user.password_hash);
    if (!ok) {
      await this._audit(user.id, 'password_login_failed', {});
      throw new AuthError('invalid_credentials');
    }

    // Second-factor gate: TOTP OR at least one registered, non-revoked
    // WebAuthn/passkey credential — either is a real, available second
    // factor. Previously this only checked totp_enabled, meaning an
    // account with a registered passkey but no TOTP bypassed MFA
    // entirely; a real gap, fixed here rather than only adding a new
    // completion method on top of an incomplete gate.
    const hasWebAuthnCredential = (await this.listCredentials(user.id)).length > 0;
    if (user.totp_enabled || hasWebAuthnCredential) {
      const pending = await this.createPendingAuthSession(user.id);
      await this._audit(user.id, 'password_verified_pending_mfa', {});
      return { mfaRequired: true, userId: user.id, pendingId: pending.pendingId, expiresAt: pending.expiresAt };
    }

    const session = await this.createSession(user.id);
    await this._audit(user.id, 'password_authentication_succeeded', {});
    return { userId: user.id, session };
  }

  // ---------- pending-MFA lifecycle (Phase C §4) ----------

  async createPendingAuthSession(userId) {
    const pendingId = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    await this.db.run(
      'INSERT INTO pending_auth_sessions (pending_id, user_id, created_at, expires_at, attempts) VALUES (?, ?, ?, ?, 0)',
      [pendingId, userId, now, now + PENDING_AUTH_TTL_MS]
    );
    return { pendingId, expiresAt: now + PENDING_AUTH_TTL_MS };
  }

  async _loadUsablePendingAuth(pendingId) {
    const row = await this.db.get('SELECT * FROM pending_auth_sessions WHERE pending_id = ?', [pendingId]);
    if (!row) throw new AuthError('mfa_session_invalid');
    if (row.consumed_at) throw new AuthError('mfa_session_invalid');
    if (row.cancelled_at) throw new AuthError('mfa_session_cancelled');
    if (row.locked_at) throw new AuthError('mfa_attempts_exceeded');
    if (this.now() > row.expires_at) throw new AuthError('mfa_session_expired');
    return row;
  }

  async _recordPendingAuthFailure(row) {
    const attempts = row.attempts + 1;
    const now = this.now();
    if (attempts >= MAX_MFA_ATTEMPTS) {
      await this.db.run(
        'UPDATE pending_auth_sessions SET attempts = ?, locked_at = ? WHERE pending_id = ?',
        [attempts, now, row.pending_id]
      );
      await this._audit(row.user_id, 'mfa_failed', { attempts, locked: true });
      throw new AuthError('mfa_attempts_exceeded');
    }
    await this.db.run('UPDATE pending_auth_sessions SET attempts = ? WHERE pending_id = ?', [attempts, row.pending_id]);
    await this._audit(row.user_id, 'mfa_failed', { attempts, locked: false });
    throw new AuthError('invalid_mfa_code');
  }

  async completePendingAuthWithTotp(pendingId, code) {
    const row = await this._loadUsablePendingAuth(pendingId);
    const user = await this.getUserById(row.user_id);
    if (!user || !user.totp_enabled || !user.totp_secret) {
      throw new AuthError('mfa_session_invalid');
    }
    const ok = verifyTotpCode(user.totp_secret, code || '', { now: this.now() });
    if (!ok) return this._recordPendingAuthFailure(row);

    await this.db.run('UPDATE pending_auth_sessions SET consumed_at = ? WHERE pending_id = ?', [this.now(), pendingId]);
    const session = await this.createSession(user.id);
    await this._audit(user.id, 'mfa_verified', { method: 'totp' });
    return { userId: user.id, session };
  }

  // STEP 4 (transactions): marking the recovery code used and consuming
  // the pending row must both happen, or neither.
  async completePendingAuthWithRecoveryCode(pendingId, code) {
    const row = await this._loadUsablePendingAuth(pendingId);
    const user = await this.getUserById(row.user_id);
    if (!user || !user.totp_enabled) throw new AuthError('mfa_session_invalid');

    const codeHash = hashRecoveryCode(code || '');
    const codeRow = await this.db.get(
      'SELECT * FROM mfa_recovery_codes WHERE code_hash = ? AND user_id = ? AND used_at IS NULL',
      [codeHash, user.id]
    );
    if (!codeRow) return this._recordPendingAuthFailure(row);

    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE mfa_recovery_codes SET used_at = ? WHERE code_hash = ?', [this.now(), codeHash]);
      await tx.run('UPDATE pending_auth_sessions SET consumed_at = ? WHERE pending_id = ?', [this.now(), pendingId]);
    });
    const session = await this.createSession(user.id);
    await this._audit(user.id, 'mfa_verified', { method: 'recovery_code' });
    return { userId: user.id, session };
  }

  /**
   * beginPendingAuthWebAuthn(pendingId)
   *   Real second-factor WebAuthn/passkey step-up — the fingerprint-
   *   capable-authenticator path this method exists for. Reuses
   *   _loadUsablePendingAuth() for every existing lifecycle check
   *   (expired/cancelled/locked/consumed) rather than re-implementing
   *   any of them, and derives userId from the pending row itself —
   *   never from client input — so allowCredentials can only ever list
   *   the credentials of the account that already passed the password
   *   step, exactly mirroring how completePendingAuthWithTotp() already
   *   scopes itself to row.user_id.
   */
  async beginPendingAuthWebAuthn(pendingId) {
    const row = await this._loadUsablePendingAuth(pendingId);
    const credentials = await this.listCredentials(row.user_id);
    if (credentials.length === 0) throw new AuthError('no_passkeys_registered');
    const challenge = await this._issueChallenge(row.user_id, 'pending_mfa_webauthn');
    return { challenge, rpId: this.rpId, allowCredentials: credentials.map((c) => ({ id: c.credential_id, type: 'public-key' })) };
  }

  /**
   * completePendingAuthWithWebAuthn(pendingId, assertion)
   *   Completes the pending (password-verified) login with a real
   *   WebAuthn assertion instead of a TOTP/recovery code, reusing the
   *   exact same cryptographic verification completeAuthentication()
   *   uses (_verifyAndConsumeAssertion) — no second signature-
   *   verification implementation exists. Any verification failure
   *   (unknown/foreign credential, revoked, forged signature, cloned-
   *   authenticator sign-count regression, wrong origin/rpId, expired
   *   challenge) is funneled through the SAME _recordPendingAuthFailure()
   *   attempt-cap/lockout the TOTP and recovery-code paths already use —
   *   a deliberate consistency decision so WebAuthn cannot be used to
   *   bypass the existing brute-force protection with unlimited guesses,
   *   at the cost of returning a generic invalid_mfa_code rather than a
   *   detailed WebAuthn error code for this specific (second-factor)
   *   context, unlike the more detailed first-factor loginWithServerPasskey.
   */
  async completePendingAuthWithWebAuthn(pendingId, { credentialId, clientDataJSON, authenticatorDataB64, signatureB64 } = {}) {
    const row = await this._loadUsablePendingAuth(pendingId);

    let cred;
    try {
      cred = await this._verifyAndConsumeAssertion({
        credentialId,
        clientDataJSON,
        authenticatorDataB64,
        signatureB64,
        challengePurpose: 'pending_mfa_webauthn',
        expectedUserId: row.user_id,
      });
    } catch (err) {
      if (err instanceof AuthError) return this._recordPendingAuthFailure(row);
      throw err;
    }

    await this.db.run('UPDATE pending_auth_sessions SET consumed_at = ? WHERE pending_id = ?', [this.now(), pendingId]);
    const session = await this.createSession(cred.user_id);
    await this._audit(cred.user_id, 'mfa_verified', { method: 'webauthn' });
    return { userId: cred.user_id, session };
  }

  async cancelPendingAuthSession(pendingId) {
    const row = await this.db.get('SELECT * FROM pending_auth_sessions WHERE pending_id = ?', [pendingId]);
    if (!row) return { ok: false };
    if (!row.consumed_at && !row.cancelled_at) {
      await this.db.run('UPDATE pending_auth_sessions SET cancelled_at = ? WHERE pending_id = ?', [this.now(), pendingId]);
      await this._audit(row.user_id, 'mfa_cancelled', {});
    }
    return { ok: true };
  }

  // ---------- TOTP enrollment (Phase C §5) ----------

  async beginTotpEnrollment(userId) {
    const user = await this.getUserById(userId);
    if (!user) throw new AuthError('user_not_found');
    const secret = generateTotpSecret();
    await this.db.run(
      'UPDATE users SET totp_secret = ?, totp_enabled = 0, totp_enrolled_at = NULL WHERE id = ?',
      [secret, userId]
    );
    await this._audit(userId, 'mfa_enrollment_started', {});
    return { secret, otpauthUrl: totpProvisioningUri({ secret, email: user.email }) };
  }

  // STEP 4 (transactions): flipping totp_enabled on, deleting the old
  // recovery-code set, and inserting the fresh set must all succeed
  // together.
  async completeTotpEnrollment(userId, code) {
    const user = await this.getUserById(userId);
    if (!user || !user.totp_secret) throw new AuthError('mfa_enrollment_not_started');
    const ok = verifyTotpCode(user.totp_secret, code || '', { now: this.now() });
    if (!ok) throw new AuthError('invalid_mfa_code');

    const rawCodes = [];
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE users SET totp_enabled = 1, totp_enrolled_at = ? WHERE id = ?', [this.now(), userId]);
      await tx.run('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
      for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const raw = generateRecoveryCode();
        rawCodes.push(raw);
        await tx.run(
          'INSERT INTO mfa_recovery_codes (code_hash, user_id, created_at) VALUES (?, ?, ?)',
          [hashRecoveryCode(raw), userId, this.now()]
        );
      }
      await this._auditWith(tx, userId, 'mfa_enabled', {});
    });
    return { ok: true, recoveryCodes: rawCodes };
  }

  async disableTotp(userId) {
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_enrolled_at = NULL WHERE id = ?', [userId]);
      await tx.run('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
      await this._auditWith(tx, userId, 'mfa_disabled', {});
    });
  }

  async setAccountDisabled(userId, disabled) {
    await this.db.run('UPDATE users SET disabled_at = ? WHERE id = ?', [disabled ? this.now() : null, userId]);
  }

  // ---------- password reset ----------

  async createPasswordResetToken(email) {
    const user = await this.db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !user.password_hash) return null;
    if (user.disabled_at) return null;
    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashResetToken(token);
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await tx.run(
        'UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL',
        [now, user.id]
      );
      await tx.run(
        'INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [tokenHash, user.id, now, now + RESET_TOKEN_TTL_MS]
      );
      await this._auditWith(tx, user.id, 'password_reset_token_issued', {});
    });
    return { user, token };
  }

  // STEP 4 (transactions): consuming the token, invalidating siblings,
  // setting the password, and revoking sessions all happen inside one
  // transaction.
  async completePasswordReset({ token, newPassword }) {
    const tokenHash = hashResetToken(token);
    const row = await this.db.get('SELECT * FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
    if (!row) throw new AuthError('invalid_reset_token');
    if (row.consumed_at) throw new AuthError('reset_token_already_used');
    if (this.now() > row.expires_at) throw new AuthError('reset_token_expired');

    const now = this.now();
    const passwordHash = hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.run('UPDATE password_reset_tokens SET consumed_at = ? WHERE token_hash = ?', [now, tokenHash]);
      await tx.run(
        'UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL',
        [now, row.user_id]
      );
      await tx.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, row.user_id]);
      await tx.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [now, row.user_id]);
      await this._auditWith(tx, row.user_id, 'password_reset_completed', {});
    });
    return { userId: row.user_id };
  }

  // ---------- credential management ----------

  async listCredentials(userId) {
    return this.db.all('SELECT * FROM credentials WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  }

  async revokeCredential(userId, credentialId) {
    const cred = await this.db.get('SELECT * FROM credentials WHERE credential_id = ?', [credentialId]);
    if (!cred || cred.user_id !== userId) throw new AuthError('not_your_credential');
    await this.db.run('UPDATE credentials SET revoked_at = ? WHERE credential_id = ?', [this.now(), credentialId]);
    await this._audit(userId, 'passkey_revoked', { credentialId });
  }

  async _audit(userId, eventType, detail) {
    await this.db.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [userId || null, eventType, JSON.stringify(detail || {}), this.now()]
    );
  }

  // Same as _audit() but runs on an already-open transaction handle so
  // the audit write commits/rolls back atomically with the rest of it.
  async _auditWith(tx, userId, eventType, detail) {
    await tx.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [userId || null, eventType, JSON.stringify(detail || {}), this.now()]
    );
  }
}

class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

module.exports = { RelyingParty, AuthError, hashPassword, verifyPasswordHash, hashResetToken };
