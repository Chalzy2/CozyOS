# IMPLEMENTATION REPORT — PROMPT9B-MID-1

Continued from verified COS-DASHBOARD-PROMPT9A-MID-1. This checkpoint
covers PHONE account linkage persistence + bootstrap wiring only.
GOOGLE linkage is explicitly NOT connected this slice — see
"GOOGLE ACCOUNT LINKAGE" below for the real architectural reason.

## PERSISTENCE
- `core/modules/identity/identity-storage.js`: added a real
  `phoneLinkages` IndexedDB object store to `STORE_NAMES`, bumped
  `DB_VERSION` 9 → 10 (additive — `onupgradeneeded` only creates
  stores that don't already exist; every existing store upgrades in
  place, untouched).
- No `googleLinkages` store was added here — `CozyGoogleAccountLinkage`
  is a Node-only, server-side module (see below) and cannot use
  browser IndexedDB at all.

## PHONE ACCOUNT LINKAGE
- persistent = YES. `core/security/phone-linkage-store-adapter.js`
  (new) is a synchronous in-memory cache hydrated once from
  `IdentityStorage`'s real `phoneLinkages` store, satisfying
  `CozyPhoneAccountLinkage`'s real synchronous store contract
  (`getRecord`/`setRecord`/`findUserIdByVerifiedPhone`, called
  without `await` even though the wrapping methods are `async`).
  Every write is also written through to `IdentityStorage.save()` in
  the background (best-effort, non-fatal, matching the repo's
  existing convention).
- hydration = real, explicit `initialize()` lifecycle. Every method
  throws until hydration resolves — fails closed, never exposes an
  apparently-empty Map during startup.
- collision protection = real. Collision detection lives in
  `CozyPhoneAccountLinkage.confirmLink()` itself
  (`findUserIdByVerifiedPhone` before every `setRecord`) — this
  adapter never duplicates that logic, it only provides a correct
  synchronous view for it to query. Verified end-to-end in
  `phone-linkage-store-adapter.test.js`: a second account solving a
  real challenge for an already-linked phone number is rejected with
  `PHONE_ALREADY_LINKED`, and the rejection is confirmed by reading
  real adapter state afterward, not just the linkage class's return
  value.

## REAL BUG FOUND AND FIXED
`core/security/phone-account-linkage.js`'s UMD wrapper discarded its
factory's return value when loaded as a plain `<script>` tag (the
`else { factory(root); }` branch) — `CozyPhoneAccountLinkage` was
literally unreachable from `window.CozyOS`, only a `|| null`
placeholder existed. Fixed with the smallest additive registration
hook: `window.CozyOS.PhoneAccountLinkageModule = { CozyPhoneAccountLinkage, ... }`.
This does not change CommonJS/test behavior (those callers already
received the real exports via `return`). Verified the original
11/11 `phone-account-linkage.test.js` suite is unaffected.

## BOOTSTRAP
- `core/security/phone-linkage-bootstrap.js` (new) composes
  `window.CozyOS.PhoneChallengeService` (phone-provider.js, already
  self-registers) + `window.CozyOS.DeliveryBackendRegistry`
  (already self-registers) + `window.CozyOS.IdentityStorage` +
  `PhoneLinkageStoreAdapter` into the one authoritative production
  `CozyPhoneAccountLinkage` instance, assigned to
  `window.CozyOS.PhoneAccountLinkage` only after real hydration
  completes. Guarded against double-construction.
- Wired via `dashboard.html` `<script>` tags, NOT
  `core/bootstrap/bootstrap.js` — dashboard.html's own recorded
  Milestone 131d/132a decision establishes it as the one canonical
  production entry point; bootstrap.js only replays dashboard.html's
  real sequence for index.html at runtime, so index.html inherits
  this automatically.
- PhoneAccountLinkage = CONNECTED (verified via real `vm`-context
  browser simulation executing the actual, unmodified-for-test file
  contents — see phone-linkage-bootstrap.test.js).
- GoogleAccountLinkage = NOT CONNECTED (architectural blocker, not a
  missed step — see below).

## GOOGLE ACCOUNT LINKAGE — genuinely blocked, not skipped
`core/security/google-account-linkage.js` is plain-Node
(`module.exports` only, no UMD/browser branch) and `require()`s
`server/live-relay/firebase-identity-issuer.js` directly — its own
header states this is intentional: Google ID-token verification
needs Node's `crypto` + a real HTTPS cert fetch, and the file
explicitly documents "BROWSER WIRING: NOT built this slice" and "no
server framework exists in this repo's main application." A real,
tested HTTP endpoint for it already exists
(`server/auth/google-login-endpoint.js`) but is not deployed or
called from anywhere. This also means Google linkage cannot share
`IdentityStorage` (browser-only IndexedDB) — it needs its own
server-side persistence, and this repo's `server/` directory has no
database at all (`server/live-relay/*` is stateless signaling only).
Building that server-side persistence layer unilaterally would be a
real architecture/deployment decision (where the process runs, what
storage backend, how it's reached from the browser) beyond this
slice's scope — reported here rather than invented.

## FACTOR SNAPSHOT / LOGIN DECISION TREE
- `core/security/auth-factor-snapshot.js` had no `<script>` tag on
  `dashboard.html` either — added. `buildFactorSnapshot()` itself
  was NOT modified (already accepted `phoneLinkage`/`googleLinkage`
  as DI params, already failed closed on missing dependencies).
- SEPARATE real pre-existing bug found while verifying
  `AuthCoordinator.getLoginDecision()` actually reaches a decision:
  `core/security/login-decision-engine.js` also had no `<script>`
  tag anywhere on the page. Without it, `getLoginDecision()` was
  unconditionally returning its own "AuthFactorSnapshot/
  LoginDecisionEngine are not loaded — failing closed" rejection for
  every login, independent of any linkage work. Added its script tag
  too, since without it nothing downstream of this milestone could
  ever be reachable in production.

## PASSWORD FALLBACK / TRUSTED DEVICE / FACE / VOICE / PASSKEY
Unchanged this slice. `buildFactorSnapshot()` and
`AuthPolicyEngine`/`login-decision-engine.js` were not modified —
only made reachable by loading them. No new UI, no new visual
component.

## UI
UNCHANGED. Only `<script>` tag additions to `dashboard.html`; no
layout, CSS, or markup changes.

## FILES CREATED
- core/security/phone-linkage-store-adapter.js
- core/security/phone-linkage-bootstrap.js
- core/security/test/phone-linkage-store-adapter.test.js
- core/security/test/phone-linkage-bootstrap.test.js

## FILES MODIFIED
- core/modules/identity/identity-storage.js (added phoneLinkages store, DB_VERSION 9→10)
- core/security/phone-account-linkage.js (added PhoneAccountLinkageModule registration hook — additive only)
- dashboard.html (added 7 new <script> tags, no other changes)

## FILES DELETED
None.

## TESTS
new (phone-linkage-store-adapter.test.js) = 8/8
new (phone-linkage-bootstrap.test.js, real vm browser simulation) = 3/3
Prompt 9A regression (phone-account-linkage.test.js) = 11/11
identity/auth-coordinator.test.js = 14/14
FULL REPO REGRESSION (155 total *.test.js files): NOT COMPLETED —
timed out in this sandbox (several existing suites take 20-50s each
for real PBKDF2 work). Only the four files above, directly touched
or exercising the changed path, were run to completion. See
TEST-RESULTS-PROMPT9B-MID-1.txt for full raw output.

## PROTECTED FILES
core/modules/founder-story/* and core/shell/cozy-login-gate.js —
verified byte-identical to the original PROMPT9A-MID-1 extraction via
direct `diff` (not merely re-stated). Unchanged.

## BROWSER
NOT VERIFIED — no real browser/DOM/IndexedDB exists in this sandbox.
The real file contents were exercised via a real Node `vm` context
simulating `window` (phone-linkage-bootstrap.test.js), and via a real
async fixture matching IdentityStorage's exact contract
(phone-linkage-store-adapter.test.js) — genuine logic verification,
not a substitute for real browser/IndexedDB confirmation.

## DEVICE
NOT VERIFIED.

## INTERNET
NOT VERIFIED.

## PRODUCTION
NOT VERIFIED.

## KNOWN LIMITATIONS
1. Google linkage remains entirely unconnected — needs a real
   architecture decision on server-side persistence + a deployment
   target for server/auth/google-login-endpoint.js before any
   further work there.
2. Real IndexedDB round-tripping is unverified by execution (inherits
   identity-storage.js's own already-disclosed limitation).
3. Full 155-file repo regression not completed this pass.

## NEXT BUILD MUST START WITH
1. Decide Google linkage's server-side persistence + deployment
   approach (this is an architecture decision, not implementation
   work) — do not build it silently.
2. Complete a full repo regression run (likely needs a longer time
   budget or parallelized execution, not a smarter test).
3. Real browser/device verification of the phone linkage path before
   this is relied on in production.
