# CUMULATIVE PATCH #4 — Identity Route Integration

Chain: PHASE6-PATCH-2 → PATCH-3 (Firebase identity issuer) → **PATCH-4 (this patch, identity route integration)**
Grandparent SHA-256 (PHASE6-PATCH-2.zip): fd4ef3dc9e53fcf3c65c68ecb8cf94f4cc6ce009af637db4d4c5e7c7aa458a54
Parent (PATCH-3) is fully included in this cumulative tree — no manual reconstruction needed.

## IMPLEMENTED
The real HTTP entry point for a Firebase ID token: `POST /identity/assertion`
on `LiveDistributionSignalingServer`.

Trust chain, exactly as specified:
```
Browser --Firebase ID token--> POST /identity/assertion
   --> firebase-identity-issuer.js (verifies against Google's public keys)
   --> identity-assertion.js (mints the existing purpose-isolated assertion)
   --> returned to the browser as { assertionToken, userId }
   --> browser presents assertionToken as Bearer on the EXISTING,
       UNMODIFIED /session/:id/token/:requesterId and
       /session/:id/register-host/:hostUserId endpoints
   --> _authorizeIdentity() (unmodified) verifies it, exactly as before
```

Changes to `server/live-relay/live-distribution-signaling-server.js`:
- New constructor option `opts.firebaseIdentity` (`{projectId, identitySecret, fetchGoogleCerts?, assertionTtlSeconds?}`).
  Registered ONLY when both `projectId` and `identitySecret` are present —
  default-off, same pattern as the existing `verifyIdentity` option.
- New route `POST /identity/assertion`, gated by that option. Extracts the
  bearer Firebase ID token with the existing `identity-assertion.js`
  `extractBearer()` helper (no new parsing logic invented), calls
  `firebase-identity-issuer.js`'s `issueIdentityAssertionFromFirebase()`,
  and returns `200 {success:true, assertionToken, userId}` on real
  verified success or `401 {success:false, reason}` otherwise. Never
  falls back to trusting anything from the URL or an unverified claim.
- `getHealthReport()` gained `capability.firebaseIdentityRouteEnabled`
  (honest disclosure, mirrors the existing `identityVerificationEnforced` flag).
- Standalone bootstrap (`require.main === module`) now reads
  `COZY_LIVE_RELAY_FIREBASE_PROJECT_ID` and reuses the existing
  `COZY_LIVE_RELAY_IDENTITY_SECRET` (this reuse is intentional: the
  Firebase route is the only real minter of identity-assertion tokens
  and `verifyIdentity` is the only real verifier of them — they must
  share that one secret. It remains a separate secret from the
  participation-token `secret`.)

No line in `identity-assertion.js`, `firebase-identity-issuer.js`,
`session-authority.js`, `session-token.js`, `ldce-roster-bridge.js`, or
the existing `/session/.../token/...` and `/session/.../register-host/...`
route bodies was changed. The existing `_authorizeIdentity()` check that
those two endpoints already run is untouched — this patch only adds the
one missing way a real assertion token can come to exist in the first
place.

New file: `server/live-relay/test/identity-route-integration.test.js` (11 tests, see TESTS).

## VERIFIED
- Full regression, including all pre-existing suites, green (see TESTS).
- Whole-tree diff against PATCH-3: exactly 1 file modified
  (`live-distribution-signaling-server.js`) and 1 file added (the new
  test file) — nothing else touched.
- Cumulative diff against the original PHASE6-PATCH-2 parent: exactly the
  3 files PATCH-3 added/modified plus this patch's 1 modification + 1
  addition — no drift, no stray changes.
- `core/shell/cozy-login-gate.js` and all of `core/modules/founder-story/*`:
  byte-identical to the original PHASE6-PATCH-2 parent.
- SHA-256 of the delivered zip computed twice; identical (see
  EXTRACTION-VERIFICATION.txt inside the package).
- `unzip -t`: clean.
- Fresh extraction into an independent directory; full regression re-run
  from that fresh extraction, not the working tree (see
  EXTRACTION-VERIFICATION.txt).

## NOT VERIFIED
- **Live Google public-key retrieval and real Firebase-user
  authentication.** This build environment has no network access. The
  default production key fetcher (`defaultFetchGoogleCerts` in
  firebase-identity-issuer.js, a real HTTPS GET to Google's cert
  endpoint) has not been exercised end-to-end here, and this patch does
  not claim otherwise. Every test in this patch and PATCH-3 injects a
  locally-generated real RSA keypair in place of Google's via the same
  `fetchGoogleCerts` seam production uses — the signature math, claims
  checks, and HTTP route logic are all real; only the source of the
  public key differs. Before production cutover: run one real request
  from a genuine signed-in Firebase user against a deployment with
  network access to Google's cert endpoint, and confirm it succeeds.
- No browser-side code was written to call `/identity/assertion` and
  carry the returned `assertionToken` forward. This patch is server-side
  only, per the instructions ("do not build the composition root yet").

## KNOWN LIMITATIONS
- `/identity/assertion` has no rate limiting of its own beyond the
  server's existing per-connection WebSocket rate limiter (which does
  not apply to this HTTP route). A production deployment fronting this
  with a reverse proxy should rate-limit this endpoint like any other
  auth endpoint — not done here, flagged for the next builder.
- `fetchGoogleCerts` still has no caching layer (same limitation
  disclosed in PATCH-3) — each `/identity/assertion` call in production
  will re-fetch Google's public keys.

## MISSING DEPENDENCIES (for the next builder)
- Browser-side integration: sign in with the Firebase client SDK, get
  an ID token, POST it to `/identity/assertion`, hold the returned
  `assertionToken`, present it as `Authorization: Bearer` on the
  existing token/register-host calls.
- Live end-to-end verification against a real Firebase project once
  network access is available.
- Everything the PATCH-2/PATCH-3 chain already deferred and this patch
  did not touch: composition root, ParticipationController wiring, SFU,
  worldwide discovery, Cozy AI.

## TESTS

BASELINE:
120/120

NEW:
12/12

TOTAL:
132/132

FAILURES:
0

New test list (`server/live-relay/test/identity-route-integration.test.js`):
1. default-off: route not registered when `firebaseIdentity` absent (404), capability flag honest
2. capability report discloses `firebaseIdentityRouteEnabled:true` when configured
3. valid Firebase token → assertion issued → unlocks existing register-host endpoint (full chain)
4. missing Firebase token → 401
5. invalid/malformed Firebase token → 401
6. expired Firebase token → 401
7. wrong audience → 401
8. wrong issuer → 401
9. tampered Firebase token (payload edited, stale signature) → 401
10. spoofed URL requester: valid token for USER_A cannot register-host as USER_B → 403
11. purpose isolation: a real SessionAuthority participation token is rejected at `/identity/assertion` AND still cannot be replayed as an identity assertion downstream
12. endpoint enforcement: both register-host and token endpoints require the verified identity when enforcement is enabled

## FILE MANIFEST (vs PATCH-3 parent)
ADDED:
- server/live-relay/test/identity-route-integration.test.js

MODIFIED:
- server/live-relay/live-distribution-signaling-server.js

REMOVED:
- (none)

## FILE MANIFEST (cumulative, vs original PHASE6-PATCH-2 parent)
ADDED:
- server/live-relay/firebase-identity-issuer.js (PATCH-3)
- server/live-relay/test/firebase-identity-issuer.test.js (PATCH-3)
- server/live-relay/test/identity-route-integration.test.js (PATCH-4)

MODIFIED:
- server/live-relay/live-distribution-signaling-server.js (PATCH-4)

REMOVED:
- (none)

## BYTE-LEVEL DIFF
See BYTE-DIFF-VS-PARENT.txt (diff against a fresh, independent
extraction of COS-STEP4D-B-PHASE6-PATCH-2.zip).

## PROTECTED-FILE AUDIT
`core/shell/cozy-login-gate.js` and all of `core/modules/founder-story/*`:
byte-identical to the original PHASE6-PATCH-2 parent, confirmed by direct
diff against a fresh independent extraction.

## SHA-256
See FILE-HASHES.txt for the modified/added files. The zip's own SHA-256
(computed twice, matched), `unzip -t`, and fresh-extraction regression
results are recorded in EXTRACTION-VERIFICATION.txt inside this package.

## NEXT BUILD MUST START WITH
Browser-side wiring: call `/identity/assertion` with a real Firebase ID
token from the client, and carry the returned `assertionToken` into the
existing client code paths that call the token/register-host endpoints.
Do not re-audit the server-side identity chain (issuer + route) — it is
implemented and tested end-to-end except for the disclosed live-network
gap above.
