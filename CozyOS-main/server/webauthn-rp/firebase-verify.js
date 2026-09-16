'use strict';
/**
 * server/webauthn-rp/firebase-verify.js
 * CozyOS — WebAuthn RP — Firebase ID Token Verification
 *
 * WHY THIS FILE EXISTS
 *   Session-unification milestone: the boundary/RP server must be able to
 *   accept a Firebase ID token (issued by the EXISTING CozyOS login, see
 *   Firebase/firebase-config.js, project "cozycabin-affiliate") and turn a
 *   real, cryptographically-verified Firebase sign-in into the SAME
 *   authoritative cozy_admin_session cookie a WebAuthn passkey login
 *   produces. This module is only the verification step of that chain —
 *   it proves the token is real and extracts the identity from it. It
 *   creates no session and touches no database; server.js's
 *   /webauthn/firebase/session route and rp.js's
 *   authenticateWithVerifiedFirebase() own everything downstream of a
 *   verified result.
 *
 * WHY NOT server/live-relay/firebase-identity-issuer.js
 *   That module already implements the identical real technique (fetch
 *   Google's public certs, check the RS256 signature, check iss/aud/exp)
 *   for the live-relay server. It is deliberately NOT imported here: this
 *   codebase treats server/live-relay and server/webauthn-rp as separate
 *   trust domains that must not develop a runtime dependency on each
 *   other (see google-login-endpoint.js's own note on the same point).
 *   Rather than reach across that boundary, this file re-implements the
 *   same real, dependency-free check using Node's built-in `crypto`, so
 *   the WebAuthn RP module stays self-contained. Both modules exist
 *   because both need the same real capability, not because one is a
 *   placeholder for the other.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not use the firebase-admin npm package (not available in this
 *     environment; unnecessary — verification only needs Google's public
 *     certs plus RS256 signature math, both handled directly below).
 *   - Does not trust any claim in the token payload before the RS256
 *     signature over header+payload has actually been verified.
 *   - Does not decide who is or isn't a CozyOS administrator. That is
 *     exclusively rp.js's job, reading only the server's own users table.
 *
 * TRUST BOUNDARY
 *   The Google public-key fetch is injectable (`fetchGoogleCerts`) so
 *   this module is fully testable offline: tests inject a locally
 *   generated RSA keypair standing in for Google's, and sign a real
 *   RS256 JWT-shaped token with the private half. The verification code
 *   itself never changes between test and production — only the source
 *   of the public key material is swapped, exactly as any real identity-
 *   provider integration must be tested. Production uses the real
 *   default fetcher below, which calls Google's published certificate
 *   endpoint over HTTPS and fetches PUBLIC key material only.
 */

const crypto = require('node:crypto');
const https = require('node:https');

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function b64urlDecode(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/**
 * defaultFetchGoogleCerts() -> Promise<{ [kid]: pemCertOrKey }>
 * Real HTTPS fetch of Google's published public signing certs for
 * Firebase ID tokens. The only network-dependent piece of this module,
 * and it fetches public key material only.
 */
function defaultFetchGoogleCerts() {
  return new Promise((resolve, reject) => {
    https
      .get(GOOGLE_CERTS_URL, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`[firebase-verify] Google certs fetch failed: HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (_e) {
            reject(new Error('[firebase-verify] Google certs response was not valid JSON.'));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * verifyFirebaseIdToken(idToken, opts) -> Promise<{verified, uid?, email?, reason?}>
 *
 * opts.projectId        REQUIRED. Must equal the token's aud AND the
 *                        project id embedded in its iss. CozyOS's one
 *                        real Firebase project id is
 *                        "cozycabin-affiliate" (Firebase/firebase-config.js).
 * opts.fetchGoogleCerts  OPTIONAL. Injectable for tests; defaults to the
 *                        real HTTPS fetch above.
 * opts.now               OPTIONAL. Injectable clock (seconds) for tests.
 *
 * Fails closed at every step: malformed token, wrong algorithm, unknown
 * key id, bad signature, wrong issuer/audience, expired/not-yet-valid,
 * or missing subject/email all produce { verified:false, reason }.
 * Nothing in `payload` is trusted until the signature check has passed.
 */
async function verifyFirebaseIdToken(idToken, opts = {}) {
  const projectId = opts.projectId;
  if (!projectId) throw new TypeError('[firebase-verify] opts.projectId is required.');
  const fetchGoogleCerts = opts.fetchGoogleCerts || defaultFetchGoogleCerts;
  const now = typeof opts.now === 'number' ? opts.now : Math.floor(Date.now() / 1000);

  if (typeof idToken !== 'string' || !idToken) {
    return { verified: false, reason: 'missing_id_token' };
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) return { verified: false, reason: 'malformed_id_token' };
  const [headerPart, payloadPart, sigPart] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(headerPart).toString('utf8'));
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'));
  } catch (_e) {
    return { verified: false, reason: 'malformed_id_token' };
  }

  if (header.alg !== 'RS256') {
    return { verified: false, reason: 'unsupported_algorithm' };
  }
  if (!header.kid) return { verified: false, reason: 'missing_key_id' };

  let certs;
  try {
    certs = await fetchGoogleCerts();
  } catch (_e) {
    return { verified: false, reason: 'signing_keys_unavailable' };
  }
  const publicKeyMaterial = certs && certs[header.kid];
  if (!publicKeyMaterial) {
    return { verified: false, reason: 'unrecognized_key_id' };
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(publicKeyMaterial);
  } catch (_e) {
    return { verified: false, reason: 'unparseable_key_material' };
  }

  const signedData = `${headerPart}.${payloadPart}`;
  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signedData),
      publicKey,
      b64urlDecode(sigPart),
    );
  } catch (_e) {
    signatureValid = false;
  }
  if (!signatureValid) return { verified: false, reason: 'invalid_signature' };

  // Only past this point is anything in `payload` trusted.
  const expectedIss = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIss) return { verified: false, reason: 'unexpected_issuer' };
  if (payload.aud !== projectId) return { verified: false, reason: 'unexpected_audience' };
  if (typeof payload.exp !== 'number' || now >= payload.exp) {
    return { verified: false, reason: 'id_token_expired' };
  }
  if (typeof payload.iat !== 'number' || payload.iat > now) {
    return { verified: false, reason: 'id_token_issued_in_future' };
  }
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now) {
    return { verified: false, reason: 'auth_time_in_future' };
  }
  const uid = payload.sub || payload.user_id;
  if (!uid || typeof uid !== 'string') {
    return { verified: false, reason: 'missing_subject' };
  }
  // CozyOS's user table keys accounts by email (see rp.js getOrCreateUser),
  // so an ID token that never proves an email address cannot be linked to
  // a CozyOS identity — fail closed rather than guessing one.
  if (!payload.email || typeof payload.email !== 'string') {
    return { verified: false, reason: 'missing_email' };
  }
  // An unverified email address (e.g. a password-based signup the user
  // never confirmed) must not be trusted to link/create a CozyOS account,
  // since anyone can claim an arbitrary email at signup time.
  if (payload.email_verified !== true) {
    return { verified: false, reason: 'email_not_verified' };
  }

  return { verified: true, uid, email: payload.email };
}

module.exports = {
  verifyFirebaseIdToken,
  defaultFetchGoogleCerts,
  GOOGLE_CERTS_URL,
};
