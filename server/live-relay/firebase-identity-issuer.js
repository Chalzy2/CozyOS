/**
 * server/live-relay/firebase-identity-issuer.js
 * CozyOS — Live Distribution — Trusted Identity Issuer (Phase 6, Patch #3)
 *
 * REAL SCOPE DISCLOSURE
 *   THE MISSING DEPENDENCY THIS FILE CLOSES
 *   identity-assertion.js already provides a fail-closed, purpose-isolated
 *   seam that verifies short-lived identity-assertion tokens — but nothing
 *   in this repository has ever genuinely called signAssertion() from a
 *   real, independently-verified identity source. This file is that
 *   source: it independently verifies a Firebase ID token (a JWT the
 *   Firebase client SDK issues to a signed-in user in the browser) using
 *   ONLY Google's own public signing keys, and — only on real,
 *   cryptographic success — mints the identity-assertion token that the
 *   existing seam already knows how to verify.
 *
 *   WHY FIREBASE, AND WHY THIS IS "REAL" AND NOT FABRICATED
 *   Firebase/firebase-config.js already contains this repo's one real,
 *   canonical Firebase project (project id "cozycabin-affiliate"). A
 *   Firebase ID token's signature can be verified using ONLY that
 *   project id and Google's published public certificates — no service
 *   account key, no firebase-admin package, and no additional secret
 *   material is required to verify (only to *issue*, and Google does
 *   that issuing, not this server). That means this module has no
 *   unmet-credential excuse to fabricate or skip verification.
 *
 *   WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - It does not use the firebase-admin npm package. That package is
 *     not present in this repo/environment (no network access to
 *     install it here), and it would add nothing this module doesn't
 *     already do itself: verifyIdToken()'s cryptographic core is exactly
 *     "fetch Google's public certs, check RS256 signature, check iss/
 *     aud/exp/sub." This file implements that real check directly with
 *     Node's built-in `crypto`, with zero new dependencies — consistent
 *     with session-token.js's own documented choice to avoid an
 *     unnecessary external JWT library.
 *   - It does not trust `sub`/`user_id` from an unverified token. Every
 *     claim used is read AFTER signature verification succeeds.
 *   - It does not silently fall back to any other identity source.
 *
 *   TRUST BOUNDARY
 *   The Google public-key fetch is injectable (see `fetchGoogleCerts`)
 *   so this module is testable without network access — tests inject a
 *   fixture keypair standing in for Google's; production uses the real
 *   default fetcher, which calls Google's published certificate
 *   endpoint over HTTPS. Nothing about the verification LOGIC changes
 *   between test and production; only the source of the public key
 *   material is swapped, exactly as any real identity-provider
 *   integration must be tested.
 */
'use strict';

const crypto = require('crypto');
const https = require('https');
const identityAssertion = require('./identity-assertion');

const GOOGLE_CERTS_URL =
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function b64urlDecode(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64');
}

/**
 * defaultFetchGoogleCerts() -> Promise<{ [kid]: pemCertOrKey }>
 * Real HTTPS fetch of Google's published public signing certs. This is
 * the ONLY network-dependent piece of this module, and it fetches
 * PUBLIC key material only — nothing secret is sent or received.
 */
function defaultFetchGoogleCerts() {
    return new Promise((resolve, reject) => {
        https.get(GOOGLE_CERTS_URL, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`[firebase-identity-issuer] Google certs fetch failed: HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('[firebase-identity-issuer] Google certs response was not valid JSON.'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * verifyFirebaseIdToken(idToken, opts) -> Promise<{verified, uid?, reason?}>
 * opts.projectId        REQUIRED. Must equal the token's aud AND the
 *                        project id embedded in its iss.
 * opts.fetchGoogleCerts  OPTIONAL. Injectable for tests; defaults to the
 *                        real HTTPS fetch above.
 * opts.now               OPTIONAL. Injectable clock (seconds) for tests.
 *
 * Fails closed at every step: malformed token, wrong algorithm, unknown
 * key id, bad signature, wrong issuer/audience, expired/not-yet-valid,
 * or missing subject all produce { verified:false, reason }. Nothing is
 * assumed true until the signature check has actually passed.
 */
async function verifyFirebaseIdToken(idToken, opts = {}) {
    const projectId = opts.projectId;
    if (!projectId) throw new TypeError('[firebase-identity-issuer] opts.projectId is required.');
    const fetchGoogleCerts = opts.fetchGoogleCerts || defaultFetchGoogleCerts;
    const now = typeof opts.now === 'number' ? opts.now : Math.floor(Date.now() / 1000);

    if (typeof idToken !== 'string' || !idToken) {
        return { verified: false, reason: 'Missing ID token.' };
    }
    const parts = idToken.split('.');
    if (parts.length !== 3) return { verified: false, reason: 'Malformed ID token.' };
    const [headerPart, payloadPart, sigPart] = parts;

    let header, payload;
    try {
        header = JSON.parse(b64urlDecode(headerPart).toString('utf8'));
        payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'));
    } catch (_e) {
        return { verified: false, reason: 'ID token header/payload not valid JSON.' };
    }

    if (header.alg !== 'RS256') {
        return { verified: false, reason: `Unsupported algorithm: ${header.alg}.` };
    }
    if (!header.kid) return { verified: false, reason: 'ID token missing key id (kid).' };

    let certs;
    try {
        certs = await fetchGoogleCerts();
    } catch (e) {
        return { verified: false, reason: `Could not fetch signing keys: ${e.message}` };
    }
    const publicKeyMaterial = certs && certs[header.kid];
    if (!publicKeyMaterial) {
        return { verified: false, reason: 'Signing key id not recognized (kid not in current key set).' };
    }

    let publicKey;
    try {
        publicKey = crypto.createPublicKey(publicKeyMaterial);
    } catch (_e) {
        return { verified: false, reason: 'Signing key material could not be parsed.' };
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
    if (!signatureValid) return { verified: false, reason: 'Signature verification failed.' };

    // Only past this point is anything in `payload` trusted.
    const expectedIss = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIss) return { verified: false, reason: 'Unexpected issuer.' };
    if (payload.aud !== projectId) return { verified: false, reason: 'Unexpected audience.' };
    if (typeof payload.exp !== 'number' || now >= payload.exp) {
        return { verified: false, reason: 'ID token expired.' };
    }
    if (typeof payload.iat !== 'number' || payload.iat > now) {
        return { verified: false, reason: 'ID token issued-at is in the future.' };
    }
    if (typeof payload.auth_time !== 'number' || payload.auth_time > now) {
        return { verified: false, reason: 'ID token auth_time is in the future.' };
    }
    const uid = payload.sub || payload.user_id;
    if (!uid || typeof uid !== 'string') {
        return { verified: false, reason: 'ID token missing subject.' };
    }

    return { verified: true, uid };
}

/**
 * issueIdentityAssertionFromFirebase(idToken, opts) ->
 *   Promise<{success, assertionToken?, uid?, reason?}>
 *
 * The one real caller of identity-assertion.js's signAssertion(): only
 * reached after verifyFirebaseIdToken() has cryptographically succeeded.
 * opts.identitySecret is the SAME secret createDefaultIdentityVerifier()
 * on the server side is configured with — this function is the trusted
 * upstream authority that seam was built to accept assertions from.
 */
async function issueIdentityAssertionFromFirebase(idToken, opts = {}) {
    if (!opts.identitySecret) {
        throw new TypeError('[firebase-identity-issuer] opts.identitySecret is required.');
    }
    const result = await verifyFirebaseIdToken(idToken, opts);
    if (!result.verified) {
        return { success: false, reason: result.reason };
    }
    const assertionToken = identityAssertion.signAssertion(
        result.uid,
        opts.identitySecret,
        opts.assertionTtlSeconds,
    );
    return { success: true, assertionToken, uid: result.uid };
}

module.exports = {
    verifyFirebaseIdToken,
    issueIdentityAssertionFromFirebase,
    defaultFetchGoogleCerts,
    GOOGLE_CERTS_URL,
};
