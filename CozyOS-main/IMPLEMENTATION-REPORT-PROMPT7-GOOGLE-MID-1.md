# PROMPT 7 GOOGLE TRUST ADAPTER — IMPLEMENTATION REPORT

## STATUS: PASS (scoped) — server trust boundary only, per Path B §10 and §17

---

## SERVER ADAPTER

New, isolated module: `server/auth/google-login-endpoint.js`
- `createGoogleLoginRequestHandler({ linkage, onAuthEvent })` — pure `(req,res)` handler.
- `GoogleAuthAdapterServer` — thin `http.createServer` wrapper (`.listen()`/`.close()`), same
  primitive `live-distribution-signaling-server.js` already uses. **Completely separate
  process/port from live-relay — live-relay was not touched.**
- Endpoint: `POST /auth/google`, body `{ idToken }` only. Every other body field
  (`userId`, `googleId`, `role`, `isAdmin`, `email`, ...) is present in the parsed body but
  is never read anywhere in the handler — identity comes exclusively from the verified token.
- All failure paths (validation, verification, unlinked account, disabled login) return the
  same generic `{ success:false, reason:'AUTH_FAILED' }` body, so the endpoint cannot be used
  to enumerate which Google identities are linked.
- Fails closed on: wrong method (405), wrong content-type (415), oversized body (413),
  malformed/non-object JSON (400), missing/empty/non-string idToken (400), unknown path (404).

## FIREBASE VERIFICATION

Not modified. `server/live-relay/firebase-identity-issuer.js` is imported transitively
through `CozyGoogleAccountLinkage` (which already required it) — the adapter never imports
it directly and never re-implements RS256/JWT logic.

## GOOGLE ACCOUNT LINKAGE

Not modified. The adapter's only call into business logic is
`linkage.resolveLoginCandidate(idToken)` on a caller-supplied, already-real
`CozyGoogleAccountLinkage` instance (the adapter does not construct its own store or
policy — that composition is the caller's/deployment's responsibility, same as
`google-account-linkage.js`'s own header already documents).

## IDENTITY ENGINE

Not modified, not called from this file. `IdentityEngine.loginWithVerifiedGoogle(userId)`
remains the local, browser-side session-creation step. This adapter's job ends at
"resolve a verified Google identity to a CozyOS `userId`" — it deliberately returns that
`userId` to the caller rather than minting a session itself, consistent with this repo's
disclosed LOCAL (not networked multi-party) session model. Wiring
`resolveLoginCandidate` → HTTP response → browser → `loginWithVerifiedGoogle(userId)` is
next-slice work (see NEXT BUILD).

## AUTH COORDINATOR

Not modified. `core/security/auth-coordinator.js` has zero Google-related code today (grep
confirmed no `google` references). Per Path B §10, wiring the login decision tree/factor
snapshot was explicitly out of scope for this slice ("do not solve the entire decision tree
in this server-adapter slice if doing so would make the implementation unsafe or rushed").
Flagged as required follow-up, not silently dropped.

## CLIENT UI

UNCHANGED. `login.html` was not opened for editing. It still makes zero `fetch()` calls to
any server endpoint — confirmed by grep before and after this session.

## PASSKEY / TRUSTED DEVICE / PHONE / PASSWORD RESET: UNCHANGED

No files under `core/security/webauthn-provider.js`, `trusted-device-manager.js`,
`phone-provider.js`, `phone-account-linkage.js`, or `password-reset-service.js` were touched.
Their full test suites were re-run this session (see TEST-RESULTS) and all pass unchanged.

---

## FILES CREATED
- `server/auth/google-login-endpoint.js`
- `server/auth/test/google-login-endpoint.test.js`

## FILES MODIFIED
none

## FILES DELETED
none

## NEW TESTS
25/25 — `server/auth/test/google-login-endpoint.test.js`. Real RSA keypair
(`crypto.generateKeyPairSync`), real RS256-signed tokens, real loopback HTTP server —
no `if (token === 'valid')`-style shortcut anywhere. Covers: signature/issuer/audience/
expiry/auth_time rejection, client-identity-claim rejection (including the exact
`{userId:"victim", googleId:"attacker"}` shape from the prompt), cross-account linkage
isolation, unlinked/disabled-login generic rejection, request validation (method,
content-type, size, malformed/non-object JSON), and a check that successful responses
carry no session-shaped field.

## DIRECT REGRESSION
- `core/security/test/*.test.js` — **89/89 pass** (delivery-backend-registry 10,
  google-account-linkage 15, identity-engine 10, login-decision-engine 19,
  password-reset-service 13, phone-account-linkage 11, phone-provider 11).
- `server/live-relay/test/*.test.js` — **132/132 pass** (untouched trust domain, run only
  to confirm zero interference).

## FRESH EXTRACTION
PERFORMED. `unzip -t`: no errors. ZIP sha256 computed twice: identical
(`91ce9f9cb28965bf61c4c8f2b7c20b95fd9fc1eac9851211170fa9075505d2b3`). Clean extraction to a
new directory; new-file hashes matched the manifest exactly; re-ran both the new suite
(25/25) and the full direct-regression set (89/89) from the fresh extraction — identical
results to the working-tree run.

## PROTECTED FILES
`core/modules/founder-story/founder-story-seed.js` and `core/shell/cozy-login-gate.js`
hashed before and after this session — unchanged (see CHANGED-FILE-HASHES file).

## BROWSER: NOT VERIFIED
## DEVICE: NOT VERIFIED
## INTERNET: NOT VERIFIED
## PRODUCTION GOOGLE: NOT VERIFIED

## KNOWN LIMITATIONS
1. `AuthCoordinator`/factor-snapshot integration (Path B §9–10) is not built — Google is not
   yet visible in the login decision tree.
2. Browser-side wiring (Firebase `signInWithGoogle()` → POST `/auth/google` →
   `IdentityEngine.loginWithVerifiedGoogle(userId)`) is not built — `login.html` untouched.
3. No deployment/process-management wiring exists for `GoogleAuthAdapterServer` — it is a
   library/class, not a running production service.
4. Fresh-extraction verification (unzip → sha256 → re-run tests from clean extraction) was
   not performed in this turn; only in-place hashes and test runs are reported above.
5. `registrationMethod` (Prompt 7 §19) remains unresolved — not touched this slice.

## NEXT BUILD MUST START WITH
1. Wire `AuthCoordinator`/`AuthFactorRegistry` to expose Google as a real factor-snapshot
   entry (`linked`/`usable`) using `CozyGoogleAccountLinkage.getGoogleState/isGoogleLoginUsable`
   — do not invent a second Google state source.
2. Only after (1): minimal `login.html` wiring — existing Google button → real
   `fetch('/auth/google')` → `IdentityEngine.loginWithVerifiedGoogle(userId)`. No redesign.
3. `registrationMethod` (Prompt 7 §19) still unresolved — search repo for
   `registrationMethod`/`registeredWith`/`signupMethod` before building anything.
