# IMPLEMENTATION REPORT — PROMPT10-MID-2

Continued from verified COS-DASHBOARD-PROMPT10-MID-1. Confirmed on
inspection: MID-1's report matched the actual source (persistent
Google linkage store real and restart-safe; browser-side wiring
genuinely absent; the two architecture questions it raised — account
authority + local state caching — genuinely unresolved). No prior
work was redone; no defect found in it.

## CHECKPOINT
Verified from the actual MID-1 source, not just its report:
`server/auth/google-linkage-store-adapter.js`,
`core/security/google-account-linkage.js`, and
`core/modules/identity/auth-coordinator.js` inspected directly.
Repo-wide search (§1/§4/§28) for `createSession`, `sessionId`,
`accessToken`, `authToken`, `bearer`, `currentUserId`,
`authenticatedUser` found real hits only in browser-local code —
`identity-engine.js` emits `identity:session-created`/
`identity:session-ended` events with `{ sessionId, userId }`, tracked
by `core/security/session-manager.js`'s `CozySessionManager` — this
IS a real session concept, but confirmed (again, by direct inspection
of every listed file, not by trusting the prior report) to be
entirely browser-local: it has never been sent to, or recognized by,
any server. `server/auth/*` and `server/live-relay/*` have no
concept of it. This confirms MID-1's finding rather than merely
repeating it.

Also checked for any existing per-account server-verifiable secret
that could stand in for a session (e.g. a device keypair): the
`deviceKeys` IndexedDB store exists in `identity-storage.js`'s schema
but is only ever consumed by `otp-provider.js` for local TOTP
secrets, not for any account-to-server credential. No such mechanism
exists. Confirmed via direct grep, not assumed.

## GOOGLE VERIFICATION
Unchanged, real, reused verbatim (Prompt 7). Re-verified working
through the new endpoint this milestone (see TESTS).

## GOOGLE LINKING
Now genuinely reachable from an authenticated boundary — see
"BROWSER → SERVER AUTHORITY" below for exactly what that boundary is
and is not. `linkAccount()` itself (in
`core/security/google-account-linkage.js`) was NOT modified — only
called from a new endpoint that resolves `userId` server-side instead
of trusting a client-supplied field.

## PERSISTENCE
Unchanged and reused (`GoogleLinkageStoreAdapter` from MID-1). A new,
separate persistent store was added for session tokens
(`server/auth/account-link-session-store.js`) — same
synchronous-fs-backed design, same atomic-write-via-rename, same
fail-closed-on-corruption behavior — but it is a genuinely different
concern (ephemeral bootstrap tokens, not account identity), so it was
not merged into the Google linkage store.

## BROWSER → SERVER AUTHORITY — the real boundary built this slice,
## with its actual security model disclosed plainly
No pre-existing mechanism exists anywhere in this repository for a
server to verify "this browser genuinely is CozyOS account X" — this
was confirmed exhaustively, not assumed. Given that, the smallest
honest boundary was built:

1. `AccountLinkSessionIssuer.issue(userId)` — browser presents its own
   already-known local account id (from `identity-engine.js`'s
   `#generateId()`, confirmed by direct inspection to be built from
   `crypto.randomUUID()`, never from the user-chosen login username).
   Server mints a random, unguessable 32-byte bearer token, persists
   only its SHA-256 hash bound to that userId (raw token never
   written to disk — verified by a real test reading the file back),
   short TTL (10 minutes default).
2. Every subsequent mutating request (`/auth/google/link`) presents
   that token, never a userId field — `userId` is read from the
   request body NOWHERE in `account-link-server.js`'s link handler.
   The server resolves the authoritative userId exclusively via
   `issuer.resolve(token)`. Verified with a real test that deliberately
   includes a spoofed `userId` in the link request body and confirms
   it is completely ignored.
3. The token is single-use (consumed on resolution) — a captured/
   replayed token fails on its second use, verified by a real test.

**HONEST LIMITATION, stated precisely, not glossed over:** step 1 is
trust-on-first-use. Its actual security rests on the account id being
unguessable (true, per direct inspection above) and on the standard
implicit trust boundary this entire local-first app already has
(anyone with read access to a user's browser storage already fully
controls that account). This is NOT equivalent to password/passkey-
backed server authentication, because no such thing exists anywhere
in this codebase to build on. A stronger design — binding session
issuance to a real local cryptographic proof, e.g. a WebAuthn
assertion verified against a public key the server has previously
been given — would require a public-key registration mechanism that
does not exist in this repo today, and building one is a genuine,
separate architecture/product decision, not invented here.

## LOGIN DECISION TREE
Unchanged. `buildFactorSnapshot()`/`login-decision-engine.js`/
`AuthPolicyEngine` were not modified. `/auth/google` (anonymous login)
is `createGoogleLoginRequestHandler` reused byte-for-byte from
Prompt 7 — not copied, imported directly — so its 25/25 existing
tests remain the true regression signal for that path, and they still
pass unmodified.

## PHONE
Unchanged and not touched this milestone.
`auth-coordinator.test.js` (14/14) still passes, including its real
phone decision-tree cases from Prompt 9B.

## PASSWORD FALLBACK
Unchanged. Not touched.

## ACCOUNT COLLISION PROTECTION
Reused verbatim from `CozyGoogleAccountLinkage.linkAccount()`
(`GOOGLE_ALREADY_LINKED`) — not reimplemented. Proven end-to-end this
milestone through the real HTTP server, surviving a real process
restart: account A links a Google identity, server restarts, account
B's session attempts to claim the same Google identity and is
rejected (409), account A's link remains intact.

## ORGANIZATION SECURITY / ROLES (§13)
NOT addressed this milestone. Nothing in `account-link-server.js` or
`account-link-session-issuer.js` touches roles, organization
membership, or authorization scope — the boundary built here only
ever resolves a userId string; it has no opinion on what that account
is permitted to do. This was left alone deliberately rather than
guessed at, since no organization-role code was in scope to inspect
against this milestone's actual objective.

## CSRF / REQUEST AUTHORITY (§21)
NOT built. Disclosed rather than silently skipped: these are JSON
APIs requiring `Content-Type: application/json`, which already
defeats a simple HTML-form CSRF submission (browsers cannot set that
header on a cross-origin form POST without a preflight), but no
origin-check or CSRF-token defense was added on top of that. Not
claimed as CSRF-protected.

## UI
UNCHANGED. No files under login.html, dashboard.html, or
Settings→Security were touched this milestone — this slice is
entirely server-side. Browser-side wiring (the actual fetch() calls
from a real "Link Google" button) was NOT built this pass either; see
KNOWN LIMITATIONS.

## FILES CREATED
- server/auth/account-link-session-store.js
- server/auth/account-link-session-issuer.js
- server/auth/account-link-server.js
- server/auth/test/account-link-session.test.js
- server/auth/test/account-link-server.test.js

## FILES MODIFIED
None. Confirmed via direct `diff -rq` against the MID-1 extraction:
only the five files above were added; nothing else changed.

## FILES DELETED
None.

## TESTS
new (account-link-session.test.js) = 8/8
new (account-link-server.test.js, real HTTP server, real RS256
  tokens, real restart, includes the full §29 acceptance scenario) = 4/4
direct regression (google-login-endpoint.test.js, untouched) = 25/25
direct regression (google-linkage-store-adapter.test.js) = 8/8
direct regression (google-persistent-linkage-integration.test.js) = 2/2
direct regression (google-account-linkage.test.js) = 15/15
direct regression (firebase-identity-issuer.test.js) = 12/12
direct regression (auth-coordinator.test.js) = 14/14
FULL REPO REGRESSION: NOT COMPLETED — not attempted this pass,
following the prior two checkpoints' documented timeout at that
scale. See TEST-RESULTS-PROMPT10-MID-2.txt for the exact disclosure
of what was and wasn't run.

## PROTECTED FILES
core/modules/founder-story/* and core/shell/cozy-login-gate.js —
verified byte-identical via direct `diff` against the original
PROMPT9A-MID-1 extraction. Unchanged.

## BROWSER
NOT VERIFIED. No browser code was written or exists to verify this
milestone.

## DEVICE
NOT VERIFIED.

## INTERNET
NOT VERIFIED.

## PRODUCTION
NOT VERIFIED. No deployment of any server file exists anywhere
reachable; `PROJECT_ID` remains test-only in every suite run so far
across Prompts 7, 9B, and 10.

## KNOWN LIMITATIONS
1. **No browser-side caller exists yet.** login.html/dashboard.html
   make zero fetch() calls to any of this — the "Link Google" button
   (if one exists in the current Settings→Security UI) is not wired.
2. Session issuance is TOFU, not full authentication — see
   "BROWSER → SERVER AUTHORITY" above for the precise, honest
   security model and its real gap (no local cryptographic proof of
   account possession).
3. No CSRF token/origin defense — disclosed, not built.
4. `AccountLinkSessionStore`/`GoogleLinkageStoreAdapter` both have no
   file locking — safe for a single server process only.
5. buildFactorSnapshot()'s synchronous local decision-tree check still
   has no cache of server-verified Google state — a successful link
   today would not yet be reflected in a real login's factor snapshot
   without additional browser-side work.
6. Organization roles/authorization scope not addressed — this
   boundary only resolves identity (a userId), never permissions.
7. Full repo regression still not completed at any point across
   Prompts 9B, 10-MID-1, or 10-MID-2.

## NEXT BUILD MUST START WITH
1. Decide whether the TOFU session-issuance model here is acceptable
   as a real product security posture, or whether it should be
   upgraded to a real local cryptographic proof (e.g. WebAuthn-based)
   before shipping — this is a product decision, not something to
   infer from code.
2. Build the actual browser-side fetch() wiring: session issuance on
   "Link Google" click, presenting the resulting token through Google
   Sign-In, then calling `/auth/google/link` — using the EXISTING
   Settings→Security control per the UI rule.
3. Design and build the local cache so a successful link is reflected
   in `buildFactorSnapshot()` without requiring a network round trip
   on every login decision.
4. A real, deployed, reachable instance of this server before any of
   this can be called PRODUCTION VERIFIED.
