# IMPLEMENTATION REPORT — PROMPT10B-MID-1

Continued from verified COS-DASHBOARD-PROMPT10-MID-2
(SHA-256 `4ea0c8498b12c1be3606462d7b5c2af918b6f5581774187848accc621d12479e`,
independently re-verified this slice, not taken on the prior report's
word — see CHECKPOINT below). This is STEP A of the 12-step order in
the Prompt 10 continuation spec: **Browser → Server Account-Linking
Integration**. Steps 2–12 (CSRF hardening, WebAuthn-grade session
proof, phone-login wiring, Security Settings enrollment wiring,
password-reset delivery, organization/role authorization, broader
regression) are explicitly NOT attempted this slice — see NEXT BUILD
MUST START WITH.

## CHECKPOINT
Verified independently before any edits, not assumed from the prior
report:
- `unzip -t`: PASS
- SHA-256, computed twice: `4ea0c8498b12c1be3606462d7b5c2af918b6f5581774187848accc621d12479e`
  both times — matches the archive's own claimed hash.
- Fresh extraction, all 5 claimed new files confirmed present on disk.
- Re-ran from that fresh extraction: `account-link-session.test.js`
  8/8, `account-link-server.test.js` 4/4 — exact match to the report.
- Re-ran 76 direct-regression tests across 6 files (25+8+2+12+14+15) —
  all passing, exact match.
- Protected files (`core/modules/founder-story/*`,
  `core/shell/cozy-login-gate.js`) — byte-identical to the original
  pristine repository, verified by direct hash comparison.

## PHONE ACCOUNT LINKAGE
NOT touched this slice. This slice's STEP A scope is Google only, per
the prior checkpoint's own "NEXT BUILD MUST START WITH" ordering
(browser wiring was called out generically, and Google was the
furthest-along linkage — phone's own MID-2 report already noted it
was "unchanged and not touched"). Phone browser-side wiring is a
real, separate, disclosed next step.

## GOOGLE ACCOUNT LINKAGE
Unchanged. `CozyGoogleAccountLinkage.linkAccount()` was not modified —
only called (indirectly, through the existing, also-unmodified
`account-link-server.js`) from the new browser-side client.

## REGISTRATION VS LOGIN
Unchanged. This slice adds no login-decision logic — it only builds
the transport a future "Link Google" action would use, which is
account-linkage, not login-factor selection (Prompt 9B's own §9
distinction, preserved).

## FACTOR SNAPSHOT
Unchanged. `buildFactorSnapshot()`/`login-decision-engine.js` were not
touched. A successful link performed through this new client still
does not yet flow into a login decision without a network round trip —
this was disclosed as a gap in MID-2 and remains a gap (see KNOWN
LIMITATIONS #5 below, carried forward unresolved).

## DECISION TREE
Unchanged, not touched.

## WHAT WAS GENUINELY MISSING (verified, not assumed)
Repository-wide search before writing anything confirmed: no file
anywhere calls `fetch()` against `/auth/session/issue` or
`/auth/google/link` except the server's own tests. `login.html` and
`dashboard.html` make zero network calls to any `server/auth/*`
endpoint. This was the real, disclosed MID-2 gap ("No browser-side
fetch() wiring yet") — confirmed still true before building anything.

## WHAT WAS BUILT THIS SLICE
**`core/security/google-account-link-client.js`** (new) — a pure
`fetch()`-based browser client composing the two real, unmodified
server routes:
- `issueLinkSession(userId, {baseUrl})` → real
  `POST /auth/session/issue`
- `linkGoogleAccount(linkSessionToken, idToken, {baseUrl})` → real
  `POST /auth/google/link` — never sends `userId` in the body,
  matching the server's own documented contract exactly (Prompt 10
  §6/§29's "spoofed userId must be ignored" requirement, now provable
  from the client side too: the function signature itself has no
  parameter that could reach that field).
- `linkGoogleAccountForCurrentUser(userId, idToken, opts)` —
  convenience orchestration (issue → link) a future real click handler
  would call.

This file verifies nothing itself, mints no token itself, and stores
no secret itself — it is a thin transport layer over the server, whose
security model is exactly what MID-2 already disclosed (TOFU session
issuance; see that report for the unchanged, un-upgraded security
posture — this slice did not touch STEP 10's "stronger session
authority" question at all).

**Honest, deliberate exclusion:** this module does NOT obtain a real
Google ID token. Doing so requires the Google Identity Services JS SDK
and a real, configured OAuth client ID — repository-wide search this
slice confirms neither exists anywhere in CozyOS (same finding Prompt
7/9B/10 already made). Every function here takes an already-obtained
`idToken` as a parameter. Building a real "Sign in with Google" button
would mean adding new login UI (explicitly against this slice's UI
rule) or fabricating a fake sign-in flow (explicitly forbidden) — so
it was not attempted.

**`core/modules/security/authentication-settings-module.js`**
(modified, additive only) — the existing, honest "Google Login" stub
tile's `whatsNeededNext` text now also names the new real client and
states plainly what is still missing (a click surface, and a real
OAuth SDK/client ID). No status field was flipped, no enrollment was
fabricated, no existing behavior changed — confirmed by byte-diff
(see `BYTE-DIFF-SINCE-PROMPT10-MID-2.diff`): the change is additive
text inside `buildGoogleLoginFactor()` only.

**`dashboard.html`** (modified, one line) — added the missing
`<script>` tag for `google-account-link-client.js` so it is actually
reachable in the browser (same "don't ship dead code" principle
applied in Prompts 9A/9B). No visual, layout, or CSS change; no other
line touched (confirmed by diff).

## PASSWORD FALLBACK
Unchanged, not touched.

## TRUSTED DEVICE
Unchanged, not touched. Still platform-admin-recovery-only.

## FACE/FINGERPRINT
Unchanged, not touched. Both remain honest stubs via the same
`buildStubFactor()` path as before.

## VOICE
Unchanged, not touched. Remains unavailable (no real backend).

## FILES CREATED
- core/security/google-account-link-client.js
- core/security/test/google-account-link-client.test.js

## FILES MODIFIED
- core/modules/security/authentication-settings-module.js (additive
  text only inside `buildGoogleLoginFactor()`; `MODULE_VERSION`
  bumped 1.0.0 → 1.1.0)
- dashboard.html (one new `<script>` tag)

## FILES DELETED
None.

## TESTS
new (`google-account-link-client.test.js`, real HTTP server, real
  RS256 tokens — no mocked fetch, no fabricated responses) = **10/10**
Prompt 9A regression (`auth-coordinator.test.js`) = 14/14
Prompt 10-MID-2 direct regression
  (`account-link-session.test.js` + `account-link-server.test.js`) = 12/12
Google direct regression (`firebase-identity-issuer.test.js` +
  `google-login-endpoint.test.js` + `google-linkage-store-adapter.test.js`
  + `google-persistent-linkage-integration.test.js`) = 47/47
`core/security/test/*.js` full suite = **125/125**
  (115 pre-existing in this checkpoint's tree — NOTE: the "104"
  figure quoted in Prompt 8/9A's reports is now stale; 11 real tests
  were legitimately added across Prompts 9B/10-MID-1/10-MID-2 since
  then, e.g. `phone-linkage-bootstrap.test.js`,
  `phone-linkage-store-adapter.test.js` — verified present and
  passing before this slice touched anything — plus the 10 new this
  slice = 125)
identity/organization/platform
  (`core/modules/identity/test/*` + `core/organization/tests/*` +
  `core/platform/tests/*`) = 17/17
FULL REPO REGRESSION: **NOT COMPLETED** — same documented reason as
  Prompts 9B/10-MID-1/10-MID-2 (exceeds practical time budget at
  ~155 files; unrelated media/camera/audio suites fail even at
  baseline in this environment due to missing browser globals,
  confirmed pre-existing before this slice, out of scope for an auth
  slice).

## PROTECTED FILES
`core/modules/founder-story/*` and `core/shell/cozy-login-gate.js` —
verified byte-identical to the original pristine repository both
before and after this slice's edits (direct SHA-256 comparison, not a
diff-count assumption). Unchanged.

## BROWSER
NOT VERIFIED. No browser was launched. The new `<script>` tag was
added correctly per the page's existing dependency-order convention
but not exercised in an actual browser page load.

## DEVICE
NOT VERIFIED.

## INTERNET
NOT VERIFIED. All HTTP calls this slice were real but loopback-only
(`127.0.0.1`, ephemeral test ports) — no external network reachability
was exercised or required.

## PRODUCTION
NOT VERIFIED. No deployment of `account-link-server.js` exists
anywhere reachable; `PROJECT_ID` remains test-only in every suite run
across Prompts 7, 9B, 10-MID-1, 10-MID-2, and this slice.

## KNOWN LIMITATIONS
1. **No click surface calls this client yet.** The "Google Login" tile
   in Settings→Security is a read-only status card (diagnostics/state
   reporting), not an interactive control — building an actual "Link
   Google" button was out of scope (UI rule).
2. **No real Google ID token acquisition exists.** Requires the Google
   Identity Services SDK + a configured OAuth client ID — neither
   exists in this repository. This client accepts a pre-obtained token
   only.
3. Session issuance is still TOFU (Prompt 10 §10's "stronger session
   authority" question) — not addressed this slice; MID-2's disclosed
   security model is unchanged.
4. No CSRF/origin defense beyond the JSON content-type boundary —
   unchanged from MID-2, not addressed this slice.
5. A successful link performed through this client does not yet
   reflect in `buildFactorSnapshot()`/a real login decision without an
   additional network round trip — MID-2's disclosed gap, still open.
6. Organization roles/authorization scope — untouched, as in every
   prior Prompt 10 slice.
7. Full repo regression still not completed at any point across
   Prompts 9B, 10-MID-1, 10-MID-2, or this slice.

## NEXT BUILD MUST START WITH
1. STEP 2 (CSRF/origin defense) or STEP 6 (an actual "Link Google"
   click surface in the existing Settings→Security UI, using the
   existing control area, calling `linkGoogleAccountForCurrentUser()`)
   — both are real, legitimate next slices; pick based on product
   priority, not inferred here.
2. Deciding (a genuine product decision, not a code inference) whether
   TOFU session issuance is acceptable to ship, or needs a real
   WebAuthn-backed upgrade before any of this reaches real users.
3. Designing the local cache so a real link is reflected in
   `buildFactorSnapshot()` without a network round trip on every login
   decision.
4. Phone's equivalent browser-side client (`phone-account-linkage.js`
   is already loaded on `dashboard.html` per Prompt 9B, but nothing
   calls it through an HTTP boundary the way Google now can be).
