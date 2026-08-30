# CozyOS — Prompt 7 MID-2 — Implementation Report
Google authenticator dependency (the missing factor-provider backend for
core/security/google-account-provider.js)

## PROMPT 7 STATUS
**INCOMPLETE — Google authenticator backend + IdentityEngine session seam
built and tested. Browser wiring, HTTP endpoint, and login.html/Settings-
Security UI are the deliberately deferred next slice — see KNOWN
LIMITATIONS. This mirrors the exact "stop at a verified backend
checkpoint rather than half-wire an insecure login page" discipline this
project has used at every prior checkpoint.**

## MID-1 CHECKPOINT VERIFICATION (performed before any edit)
- Extracted the actual uploaded `COS-DASHBOARD-PROMPT7-MID-1.zip` fresh.
- Read `IMPLEMENTATION-REPORT-PROMPT7-MID-1.md` in full.
- Re-hashed every file in `CHANGED-FILE-HASHES-PROMPT7-MID-1.txt`
  (new files, protected files, reference files) against the actual
  extracted bytes — **all match**.
- Ran every file under `core/security/test/*.test.js` individually
  (running the whole directory via `node --test core/security/test/`
  errors on an unrelated `MODULE_NOT_FOUND` path-resolution quirk of the
  test runner, not a code regression — each file passes standalone) —
  **64/64**, matching MID-1's own claim exactly, not merely repeated.
- Confirmed `login.html` and both `core/modules/founder-story/*` +
  `core/shell/cozy-login-gate.js` protected-file hashes unchanged.
Conclusion: MID-1's report was accurate. Proceeded.

## A REAL FINDING THAT SHAPED THIS SLICE
`IdentityEngine.register()` has no `registrationMethod` field at all —
every account registers through one unified `email + phone + password`
form; there is no distinct "registered with Google" path in this
codebase. `login-decision-engine.js` (MID-1) already correctly only
*accepts* `account.registrationMethod` for reporting and invents no
source for it. I surfaced this to the requester before continuing;
their instruction was to build the missing Google **authenticator**
dependency itself (this file), leaving the registrationMethod question
for the login-decision/AuthCoordinator wiring slice that follows.

## SEARCH PERFORMED BEFORE WRITING ANY CODE
Read in full: `core/security/google-account-provider.js`,
`core/security/factor-provider-base.js`, `server/live-relay/firebase-
identity-issuer.js`, `server/live-relay/identity-assertion.js`,
`Firebase/firebase-config.js`, `core/modules/identity/identity-engine.js`
(register/getUser/login/loginWithVerifiedPasskey/#createRealSession).
Grepped the whole tree for google/firebase/OAuth/authenticator/
registrationMethod/registerBackend. Confirmed no identity-engine test
file exists anywhere in the repository (a real, pre-existing gap, not
introduced by this slice).

Findings that shaped this slice:
- `google-account-provider.js` already has a real `registerBackend(fn)`
  hook (via `factor-provider-base.js`) — it has simply never had a real
  `verifyFn` plugged in. This is browser-only (`window.CozyOS`), so it
  cannot be exercised in this Node sandbox.
- `server/live-relay/firebase-identity-issuer.js#verifyFirebaseIdToken()`
  is a REAL, already-tested, cryptographic RS256 Firebase ID-token
  verifier (Google's own public certs, no fabricated crypto) — built for
  the live-relay identity-assertion seam, never for CozyOS account
  login, but the verification logic itself is exactly the missing piece.
  It is plain Node (no `window`), so it composes cleanly.
- `Firebase/firebase-config.js` carries this repo's one real Firebase
  project id, `"cozycabin-affiliate"`.
- No account-linkage boundary existed anywhere — the same shape of gap
  `phone-account-linkage.js` (MID-1) already closed for phone.

**No duplicate engine was created.** The new file composes
`verifyFirebaseIdToken()` (100% of the cryptography), never
re-implementing JWT/RS256 verification, certificate fetching, or
signature checking.

## FILES CREATED
1. `core/security/google-account-linkage.js` — the missing Google
   authenticator. Composes `verifyFirebaseIdToken()` for all
   cryptography. `linkAccount(userId, idToken)` requires an
   already-authenticated `userId` (never anonymous, never email-matching
   — Prompt 7 §5) and only sets `googleLinked:true` after a real
   signature-verified token; rejects cross-account reuse of an
   already-linked Google identity (fail-closed, no enumeration).
   `resolveLoginCandidate(idToken)` is the real login-time path: verifies
   the token, then looks up the linked CozyOS account by Google uid —
   never falls back to email matching for an unlinked identity.
   `extractEmailFromVerifiedToken()` is decode-only, invoked only after
   verification already succeeded — it establishes no trust of its own.
2. `core/security/test/google-account-linkage.test.js` — 15 tests, using
   the exact same real-RSA-keypair technique
   `server/live-relay/test/firebase-identity-issuer.test.js` already
   uses (genuine RS256-signed tokens, injected `fetchGoogleCerts`
   standing in for Google's endpoint — the verification code under test
   never knows the difference).
3. `core/security/test/identity-engine.test.js` — 10 tests. **The first
   test file this engine has ever had in this repository.** Installs the
   smallest possible real shim (`global.window = {CozyOS:{}}`) so the
   actual production `register()`/`getUser()`/`login()`/
   `loginWithVerifiedGoogle()` code runs for real, per Rule 19 ("test the
   real identity path... not only synthetic objects"). Node 22's built-in
   Web Crypto satisfies the engine's own password-hashing check with no
   further shimming.

## FILES MODIFIED
1. `core/modules/identity/identity-engine.js` — one additive method,
   `loginWithVerifiedGoogle(userId)`, inserted directly after and
   mirroring `loginWithVerifiedPasskey()` exactly: same
   `#createRealSession()` call, same locked-account check, its own
   `"LOGIN_SUCCESS_WITH_GOOGLE"` audit label so it is never confused with
   password/passkey login in the audit trail. IE_VERSION bumped
   1.3.0 → 1.4.0 with a real changelog comment, matching this file's own
   established convention. See `BYTE-DIFF-SINCE-PROMPT7-MID-1.diff` for
   the complete, real 2-hunk diff (nothing else in this 1,423-line file
   was touched).

## FILES DELETED
None.

## GOOGLE IDENTITY ENGINE
Existing / reused. `verifyFirebaseIdToken()` — real RS256 signature
verification against Google's published certs, real issuer/audience/
expiry/auth_time checks, all pre-existing and untouched.

## GOOGLE AUTHENTICATOR
Built / tested. `google-account-linkage.js`'s `linkAccount()` and
`resolveLoginCandidate()` — 15/15 tests, all against the real
cryptographic verifier (not a stubbed `{verified:true}`).

## GOOGLE SERVER ADAPTER
NOT built this slice, honestly. No HTTP server/framework exists for
CozyOS's main application in this repository (only the standalone
live-relay signaling server has one) — an actual route that receives the
browser's Firebase ID token and calls `linkAccount()`/
`resolveLoginCandidate()` is real, disclosed, next-slice work, not
fabricated here.

## ACCOUNT LINKING
Verified (Node tests): same-account re-link allowed; cross-account reuse
of an already-linked Google identity rejected with `GOOGLE_ALREADY_LINKED`
and no state change to the second account; unlink genuinely disables
login while leaving the underlying Google identity itself valid
(re-tested against a fresh, still-valid token).

## PREFERRED LOGIN
NOT wired this slice. `login-decision-engine.js` (MID-1) is already
provider-agnostic and requires no change to accept a real
`google-account` factor once `AuthCoordinator` builds a snapshot calling
`GoogleAccountLinkage.isGoogleLoginUsable()` — that composition is
real, disclosed, next-slice work (see NEXT BUILD MUST START WITH).

## PASSWORD FALLBACK
Verified unaffected. `identity-engine.js#login()` (password path) was
not modified — see the byte-diff. `loginWithVerifiedGoogle()` is a
wholly separate method; it cannot be reached without a real, externally
verified Google identity resolving to a real `userId` first.

## UI
Existing UI preserved — untouched. No file under `login.html`,
`Settings → Security`, or any `.html` file was opened or edited.

## TESTS
- new = 25/25 (`google-account-linkage.test.js` 15/15,
  `identity-engine.test.js` 10/10)
- `core/security/test/*` direct regression (all 7 files, run individually) = 89/89
- `server/live-relay/test/*` (composed, unmodified) regression = 35/35
  (`firebase-identity-issuer.test.js` 12/12,
  `live-distribution-signaling-server.test.js` 23/23)
- fresh extraction = see CHECKPOINT VERIFICATION below

## SECURITY
- `linkAccount()`/`resolveLoginCandidate()` never trust a client-declared
  `verified`/`uid`/`email` — only `verifyFirebaseIdToken()`'s real
  signature-checked return value is ever used (tested directly: passing
  a hand-built `{verified:true, uid:'attacker-uid', ...}` object instead
  of a real JWT string fails closed with `GOOGLE_VERIFICATION_FAILED`).
- Forged tokens (edited payload, stale signature), expired tokens, and
  malformed tokens all fail closed — proven against the real RS256
  verifier, not a mock.
- Cross-account Google-identity reuse fails closed, no enumeration
  (identical `GOOGLE_ALREADY_LINKED` reason regardless of which account
  actually owns the identity).
- `loginWithVerifiedGoogle()` respects the exact same real account-lock
  state `login()` itself sets — tested by genuinely triggering 5 real
  failed password attempts first, then confirming Google login is also
  blocked (not a separate, weaker lock check).
- This file performs zero cryptography of its own — 100% delegated to
  `verifyFirebaseIdToken()`.

## PROTECTED FILES
Re-verified unchanged (re-hashed against the actual uploaded MID-1 ZIP,
see `CHANGED-FILE-HASHES-PROMPT7-MID-2.txt`):
`core/modules/founder-story/*`, `core/shell/cozy-login-gate.js`. Neither
was opened.

## BROWSER
NOT VERIFIED — no browser is available in this sandbox.
`google-account-provider.js` (the browser-side factor coordinator) was
not modified this slice; wiring `registerBackend()` to call a real
server endpoint is next-slice work.

## DEVICE
NOT APPLICABLE this slice — no device/hardware interaction involved.

## INTERNET
NOT VERIFIED — `verifyFirebaseIdToken()`'s real HTTPS fetch to Google's
certificate endpoint (`defaultFetchGoogleCerts()`) was not exercised;
this sandbox has no network access. Every test injects `fetchGoogleCerts`
with a locally-generated real RSA keypair, exactly matching the existing,
already-accepted precedent in `firebase-identity-issuer.test.js`.

## PRODUCTION
NOT VERIFIED.

## KNOWN LIMITATIONS
1. No HTTP endpoint exists yet to receive a browser's Firebase ID token
   and call `linkAccount()`/`resolveLoginCandidate()` — CozyOS's main
   application has no server framework in this repository today.
2. `google-account-provider.js#registerBackend()` has not been wired to
   this new authenticator — browser/DOM is unavailable in this sandbox
   for that wiring to be exercised honestly.
3. `AuthCoordinator` (`core/security/auth-coordinator.js` and
   `core/modules/identity/auth-coordinator.js`) does not yet build a real
   factor snapshot calling `GoogleAccountLinkage.isGoogleLoginUsable()` —
   `login-decision-engine.js` remains correct but unfed real Google
   state, same honest gap MID-1 already disclosed for phone/passkey
   composition.
4. `login.html`/`Settings → Security` UI wiring not started (§11/§15) —
   by design, per this project's established discipline.
5. `identity-engine.js` overall remains only partially tested — this
   slice added the first real test file for it, scoped to
   register/getUser/login/lock + the new `loginWithVerifiedGoogle()`
   method, not full coverage of its 1,400+ lines (orgs, departments,
   delegates, OTP, recovery codes are untouched and untested by this
   slice — a pre-existing gap, not introduced here).
6. `registrationMethod` still does not exist as a real field anywhere in
   `IdentityEngine` (see "A REAL FINDING" above) — unresolved, carried
   forward per the requester's explicit instruction this session.

## NEXT BUILD MUST START WITH
1. Re-verify this checkpoint's hashes and re-run `core/security/test/*`
   + `server/live-relay/test/*` before touching anything.
2. Build the real HTTP endpoint (wherever the repository's real server
   boundary should live) that accepts a Firebase ID token from the
   browser and calls `GoogleAccountLinkage.linkAccount()`/
   `resolveLoginCandidate()` — server-authoritative, never trusting a
   client-asserted result.
3. Wire `core/modules/identity/auth-coordinator.js` to build a real
   factor snapshot calling `GoogleAccountLinkage.isGoogleLoginUsable()`
   (alongside the already-planned `WebAuthnProvider`/
   `PhoneAccountLinkage` calls from MID-1's own next-steps) and pass it
   into `LoginDecisionEngine.getLoginDecision()`.
4. Only then touch `login.html`'s existing Google button — wiring it to
   a real `signInWithGoogle()` → POST-to-endpoint → session flow, no
   redesign, no new elements.
5. Resolve the `registrationMethod` question (see "A REAL FINDING")
   before it becomes load-bearing for any login-priority decision.
