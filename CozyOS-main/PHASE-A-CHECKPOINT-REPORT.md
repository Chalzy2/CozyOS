# CHECKPOINT — Phase A: Server-Authoritative Administrator Boundary

Delta relative to baseline `CozyOS-main-combined.zip` +
`cozyos-session-unification-backend-patch.zip` (patch applied onto main).

## IMPLEMENTATION STATUS

| Requirement (Phase A) | Status |
|---|---|
| Chalzydashboard admit/deny decided server-side | IMPLEMENTED |
| server session (`GET /webauthn/session`) is the only input to that decision | IMPLEMENTED |
| Client-side `IdentityEngine.isPlatformAdmin()`/`checkResourcePermission()` removed from the security decision in Chalzydashboard.html | IMPLEMENTED |
| Same fix applied to `dashboard.html`'s own internal gate (`mountWorkspaceIfAdmin`) | IMPLEMENTED |
| `/dashboard`, `/dashboard.html`, `/admin`, `/admin.html` fail closed at the HTTP layer | ALREADY PRESENT (pre-existing `static-boundary-server.js`, re-verified this session) |
| Firebase → authoritative session, real password reset, Security Center | NOT STARTED (Phases B–D) |

## FILES CHANGED

**Patch applied (from `cozyos-session-unification-backend-patch.zip`, previously un-applied to the main tree):**
- `server/static-boundary-server.js`
- `server/webauthn-rp/db.js`, `rp.js`, `server.js`
- `server/webauthn-rp/firebase-verify.js` (new)
- `server/webauthn-rp/bootstrap-admin.js` (new)
- `server/webauthn-rp/test/firebase-verify.test.js` (new)
- `server/webauthn-rp/test/firebase-session-integration.test.js` (new)
- `server/test/static-boundary-firebase.test.js` (new)

**New this session:**
- `core/shell/admin-gate-core.js` — pure decision logic, no DOM/network. Maps a `GET /webauthn/session` response to `LOAD_ADMIN_WORKSPACE` / `REDIRECT_TO_LOGIN` / `ACCESS_DENIED` / `GATE_ERROR`. Fails closed on anything malformed, missing, or ambiguous.
- `core/shell/tests/admin-gate-core.test.js` — 9 unit tests, including forged-response and loose-equality-bypass cases.
- `server/test/chalzydashboard-gate-integration.test.js` — 6 integration tests against the **real HTTP server**, using real WebAuthn registration (virtual authenticator), asserting the actual DB-backed admin/non-admin verdicts and the legacy-alias block.

**Modified:**
- `Chalzydashboard.html` — gate now calls `fetch("/webauthn/session", {credentials:"include"})` and `AdminGateCore.decideGateAction()` instead of `IdentityEngine.isPlatformAdmin(userId)`.
- `dashboard.html` — `mountWorkspaceIfAdmin()` gets the identical fix (it's independently reachable as a static file and previously ran its own, separate client-trusting check).

## DATABASE MIGRATIONS
None new this session. `firebase_uid` column + partial unique index from the applied patch (idempotent, already covered by its own tests).

## API ROUTES
None new this session. This phase consumes the existing `GET /webauthn/session` and `GET /webauthn/authorize/admin` routes — both pre-existing, both already reading `is_platform_admin` only from the server-side `users` table, never from client input.

## SECURITY BOUNDARY
`is_platform_admin` is still writable only via `RelyingParty.setPlatformAdmin()`, called only from `bootstrap-admin.js` (operator CLI, never HTTP-reachable) or test code. No route added or touched this session writes to it. Confirmed via a real HTTP round-trip (not just code inspection) that a non-admin session's cookie returns `isPlatformAdmin:false` on 5 repeated checks, and that an admin-flagged row returns `true` only after `setPlatformAdmin` was called directly against the DB layer — never via a request.

## TEST RESULTS
- `core/shell/tests/admin-gate-core.test.js`: **9/9 pass**
- `server/test/chalzydashboard-gate-integration.test.js`: **6/6 pass** (real server, real WebAuthn ceremony, real SQLite)
- Full existing suite re-run together (`server/webauthn-rp/test`, `server/test`, `server/auth/test`, `core/shell/tests`): **124/125 pass**. The 1 failure (`launch-sequence-above-only.test.js`, a CSS-width assertion for an unrelated launch animation) pre-dates this session and is unrelated to auth/admin — not investigated further as out of scope for Phase A.

## LIVE VERIFICATION
NOT PERFORMED. This sandbox has no network access. Everything above is **INTEGRATION TESTED** against a real, locally-running instance of `static-boundary-server.js` on `127.0.0.1` with a real ephemeral SQLite file — not against `cozyos.org`, not against any live Firebase project, not through a real browser executing `Chalzydashboard.html`'s actual `<script>` (would require Playwright, which the repo's own `-browser.test.js` files already degrade to `NOT_RUN` for when unavailable — same constraint applies here).

## LIMITATIONS
- No browser-level test exists yet for `Chalzydashboard.html`/`dashboard.html`'s actual DOM/script execution — only for the server behavior they depend on, and a static assertion that the HTML no longer contains the old client-side check string.
- Nothing yet issues the `cozy_admin_session` cookie from a real login UI — `login.html` still has no call to `/webauthn/authenticate/begin|complete` or `/webauthn/firebase/session`. Today, every real visitor gets `REDIRECT_TO_LOGIN` (fail-closed), which is safe but not yet usable end-to-end. This is Phase B/§21 (frontend wiring), not Phase A.
- Termux/production deployment verification not performed.

## MISSING DEPENDENCY
Real login flow (frontend → `/webauthn/authenticate/*` or `/webauthn/firebase/session`) does not exist yet — required before an actual administrator can obtain the cookie this phase's gate now checks for.

## KNOWN RISKS
None new introduced. The fix is strictly more restrictive than before (fails closed by default where the old code could theoretically be tricked into failing open via client state).

## NEXT BUILD MUST START WITH
Phase B — wire `login.html` to call `/webauthn/authenticate/begin|complete` (passkey) and `/webauthn/firebase/session` (Firebase), so a real administrator session cookie can actually be obtained, then re-verify Chalzydashboard.html's `LOAD_ADMIN_WORKSPACE` path end-to-end with a real browser (Playwright, if/when network access is available) rather than only via direct HTTP calls.

## SHA-256 MANIFEST
See `PHASE-A-SHA256-MANIFEST.txt` (attached).
