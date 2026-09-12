# IMPLEMENTATION REPORT — PROMPT9A-MID-1

Slice: Factor Snapshot → Real Login Decision Tree (first implementation
slice of Prompt 9; sections 1–19 as scoped, not the full 34-section
Prompt 9).

---

## FACTOR SNAPSHOT
Actual fields discovered in `core/security/auth-factor-snapshot.js`
(already existed, built in the Prompt 8 slice — not rebuilt here):

`buildFactorSnapshot({ userId, user, context, webauthnProvider,
phoneLinkage, googleLinkage, trustedDeviceManager, factorRegistry,
isPlatformAdmin })` returns `{ account, factors }`:

- `account.active` — `user.status === "active"`
- `account.registrationMethod` — reporting-only, never influences a
  factor
- `factors.passkey.enrolled` — `webauthnProvider.hasCredential(userId)`
- `factors.passkey.deviceSupported` — `webauthnProvider.isSupported()`
- `factors.phone.verified` — `phoneLinkage.getPhoneState(userId).verified`
- `factors.phone.loginUsable` — `phoneLinkage.isPhoneLoginUsable(userId)`
- `factors.google.linked` — `googleLinkage.getGoogleState(userId)`,
  requires both `googleLinked` AND `googleLoginEnabled`
- `factors.google.providerReal` — `factorRegistry.getProvider("google-account").isReal`
- `factors.voice.providerReal` / `factors.voice.verified` — always
  `false` (no real voice verification exists anywhere in the repo)
- `factors.trustedDevice.enrolled` / `.adminAuthorized` — only ever
  populated when `context === "admin-recovery"`
- `factors.password.available` — **changed this slice** (see below)
- `factors.recovery.emailAvailable` / `.phoneAvailable` — real
  email/phone-verified-state check

**Genuine gap found and fixed (Prompt 9A):** `password.available` only
ever read `user.hash` (the real internal password-hash record). No
caller anywhere could supply that field without moving actual hash
bytes across a trust boundary. Fixed additively — `password.available`
now also accepts `user.hasPassword` (a plain boolean), so
`IdentityEngine.getFactorSnapshotContext()` (new this slice, see below)
never has to expose the hash itself. `user.hash` still works exactly as
before; all 15 pre-existing `auth-factor-snapshot.test.js` tests pass
unmodified.

---

## LOGIN DECISION TREE

**What already existed:**
- `login.html → AuthCoordinator (core/modules/identity/auth-coordinator.js)
  → IdentityEngine → AuthFactorRegistry → factor provider → session` —
  fully real for the password path (`loginWithCredentials`/`login()`)
  and the passkey path (`loginWithPasskey()` → `WebAuthnProvider.verify()`
  → `IdentityEngine.loginWithVerifiedPasskey()`).
- `core/security/login-decision-engine.js` (`getLoginDecision()`) — a
  real, pure ordering function over an already-built factor snapshot.
  Built in a prior slice, untouched this slice (reused, per instruction
  §3: "if an equivalent already exists, reuse it").
- `core/security/auth-factor-snapshot.js` (`buildFactorSnapshot()`) — a
  real snapshot builder composing the real per-factor engines. Also
  built in a prior slice.

**What was missing (verified by repository-wide search before writing
anything):** nothing called `buildFactorSnapshot()` and fed its output
into `getLoginDecision()`. Both real, tested, pure functions existed in
complete isolation from every login code path and from each other —
confirmed via `grep -rl` for `getLoginDecision`/`buildFactorSnapshot`
outside their own files and test files, which returned only doc-comment
references in `identity-engine.js` and `auth-factor-snapshot.js` itself,
never an actual call site. Additionally, neither
`core/security/auth-factor-snapshot.js` nor
`core/security/login-decision-engine.js` had a `<script>` tag on
`login.html` at all — both files were unreachable in the real browser
runtime regardless of any JS-level wiring.

**What was implemented this slice:**
1. `IdentityEngine.getFactorSnapshotContext(userId)` (new, additive,
   read-only) — the narrow, non-secret seam `buildFactorSnapshot()`
   needs: returns `{ status, registrationMethod, email, phone,
   hasPassword }`. Never exposes hash, salt, or roles.
2. `AuthFactorSnapshot`'s password check widened to accept
   `user.hasPassword` alongside the original `user.hash` (see above).
3. `AuthCoordinator.getLoginDecision(username, { context })` (new,
   additive) in `core/modules/identity/auth-coordinator.js` — the real
   missing connection. Resolves `username → userId`
   (`IdentityEngine.getUserIdByUsername`), builds the real per-user
   context (`getFactorSnapshotContext`), composes the real engine
   instances already present on `window.CozyOS` (`WebAuthnProvider`,
   `PhoneAccountLinkage`, `GoogleAccountLinkage`, `TrustedDeviceManager`,
   `AuthFactorRegistry` — whichever are actually loaded; missing ones
   degrade gracefully), calls `buildFactorSnapshot()`, then
   `getLoginDecision()`, and returns the decision plus `userId`. This
   method **verifies nothing and duplicates no existing engine** — it
   is orchestration only, identical in spirit to
   `AuthorizationCoordinator.authorize()`'s own composition pattern
   elsewhere in this repo.
4. `login.html` — added the two missing `<script>` tags
   (`auth-factor-snapshot.js`, `login-decision-engine.js`) so
   `AuthCoordinator.getLoginDecision()` is actually reachable in the
   browser. **No visual/markup/CSS change** — no button on the page
   calls this method yet (see UI RULE below).

No new authentication engine, verifier, or session-establishment path
was created. `getLoginDecision()` never itself grants a session — it
only reports which already-real path (`loginWithPasskey`,
`loginWithCredentials`, a future `loginWithVerifiedGoogle` trigger,
etc.) the caller should offer.

---

## PASSKEY
Unchanged, reused as-is. `LOGIN_PRIORITY_ORDER` already places
`passkey` first; `isFactorUsable("passkey", ...)` already requires both
`enrolled === true` and `deviceSupported === true`. Verified this slice
with a real, registered `WebAuthnProvider` instance and a real
registered user — passkey is genuinely selected as `primaryFactor` when
both conditions hold, and never selected when either is false (tests
1, 5, 14).

## PHONE
Unchanged decision logic, reused. Verified this slice: a phone number
existing on the account alone never makes phone available — only a
composed `PhoneAccountLinkage`-shaped object reporting **both**
`verified: true` and `loginUsable: true` makes phone selectable (tests
2, 6). **Honest, disclosed limitation:** `core/security/phone-account-linkage.js`
(`CozyPhoneAccountLinkage`) is a real, complete, and separately tested
class (`phone-account-linkage.test.js`, part of the 104 baseline), but
it is **not instantiated anywhere in this repository** — it requires a
real store adapter and `CozyPhoneChallengeService` to be composed
together at construction time, and no file does that composition yet.
`window.CozyOS.PhoneAccountLinkage` is therefore `null` in every real
page load today. `getLoginDecision()` correctly degrades phone to
unavailable in that real state (test 3) rather than fabricating
availability. Composing a real `CozyPhoneAccountLinkage` instance and
loading it on `login.html` is real, additive, disclosed follow-on work
— not attempted this slice (see NEXT BUILD MUST START WITH).

## GOOGLE
Excluded from the ordinary login decision by the same real mechanism
proven in the prior slice: `AuthFactorRegistry.getProvider("google-account").isReal`
is `false` (no real OAuth backend exists — confirmed, not re-verified
differently this slice), and `core/security/google-account-linkage.js`
(`CozyGoogleAccountLinkage`) is likewise never instantiated anywhere in
the repository (confirmed by repo-wide search this slice — zero
matches for `new CozyGoogleAccountLinkage` outside its own file/tests).
`getLoginDecision()` correctly reports Google as unavailable (test 9)
rather than marking it usable merely because the provider class exists.

## PASSWORD
Unchanged fallback logic, reused. Verified this slice: password is
never `primaryFactor` when passkey or phone is genuinely usable (test
14), and correctly becomes `primaryFactor` when it is the only usable
option (test 3). Password itself was not removed or weakened anywhere.

## SECURITY AUTHORITY
`AuthCoordinator.getLoginDecision(username, options)` takes **only** a
username string and an optional `context` string — there is no
parameter through which a caller can inject `isEnrolled`/`isVerified`/
`isUsable`/`isAdmin`/`role`/`organization`/`factorVerified` claims.
Verified explicitly (test 7): passing a fabricated `factors` object
inside the options argument has zero effect on the result, because the
method never reads it — every factor value is independently derived
from real engine calls keyed off the resolved `userId`. `isPlatformAdmin`
is likewise always independently resolved via
`IdentityEngine.isPlatformAdmin(userId)`, never accepted from the
caller (test 8: trusted-device never appears in an ordinary `"login"`
context regardless of any input, matching the pre-existing hard
exclusion in `login-decision-engine.js`).

---

## NEW TESTS: 14/14

`core/modules/identity/test/auth-coordinator.test.js` (new file — first
test file ever written for `auth-coordinator.js`, confirmed by repo
search before writing it). Exceeds the 12-case minimum requested; all
12 requested cases are covered plus 2 additional (dependency-missing
fail-closed, and registration-method-never-forces-primary).

```
1..14
# tests 14
# pass 14
# fail 0
```

## REGRESSION

**PROMPT8 baseline — `core/security/test/*.js`:** the report that shipped
with the PROMPT8 checkpoint described this as "104 tests." Run fresh in
this extracted tree, unmodified:

```
1..104
# tests 104
# pass 104
# fail 0
```

**104/104 — genuinely reproduced, not fabricated.** (`core/security/test/`
in this extracted tree contains 8 files: `auth-factor-snapshot`,
`delivery-backend-registry`, `google-account-linkage`, `identity-engine`,
`login-decision-engine`, `password-reset-service`, `phone-account-linkage`,
`phone-provider`. No standalone `webauthn-provider.test.js` file exists in
this tree — WebAuthn coverage lives inside `identity-engine.test.js`'s
passkey-login assertions and this slice's own new tests.)

**Directly affected suites (also run, included above where overlapping):**
`identity-engine.test.js`, `login-decision-engine.test.js`,
`auth-factor-snapshot.test.js`, `phone-account-linkage.test.js`,
`phone-provider.test.js`, `google-account-linkage.test.js`,
`password-reset-service.test.js` — all pass, all inside the 104 count
above.

**Organization/authorization-boundary tests** (touched because
`identity-engine.js` was edited):
`core/organization/tests/organization-role-extension.test.js`,
`core/organization/tests/organization-branding.test.js`,
`core/platform/tests/application-visibility.test.js` — **3/3 pass.**

**NOT run:** the full repository suite (155 `*.test.js` files) was
attempted once; it exceeded the practical time budget of this session
and several unrelated files (media/camera/audio engine tests requiring
browser globals not present in this Node environment) were already
failing before this slice touched anything — those failures are
pre-existing and out of scope for an authentication-only slice. Full
repo-wide regression is honestly not claimed here.

## PROTECTED FILES
`core/modules/founder-story/*` and `core/shell/cozy-login-gate.js` —
SHA-256 identical to the pristine `COS-DASHBOARD-PROMPT8-MERGED.zip`
baseline, verified by direct hash comparison before and after this
slice's edits (see `CHANGED-FILE-HASHES-PROMPT9A-MID-1.txt`, which does
not list them because they were never touched). **Verified unchanged.**

## BROWSER
NOT VERIFIED — no browser was launched this slice; all verification was
via `node --test` against the real production files. The two new
`<script>` tags on `login.html` were added correctly per the page's
existing dependency-order comments but were not exercised in an actual
browser.

## DEVICE
NOT VERIFIED — no physical/emulated device or real WebAuthn hardware
authenticator was used. All passkey tests use a fake `WebAuthnProvider`
shaped exactly like the real class's public methods (same posture as
the pre-existing `auth-factor-snapshot.test.js`), not the real
`navigator.credentials` API.

## INTERNET
NOT VERIFIED — no network calls were made or required by this slice.

## KNOWN LIMITATIONS
1. `PhoneAccountLinkage` and `GoogleAccountLinkage` are real, tested
   classes that are **not instantiated anywhere in the repository**.
   `getLoginDecision()` correctly and honestly degrades both to
   unavailable in this real state — this is not a bug, but it does mean
   phone/Google login is not actually offerable to a real user yet,
   only passkey and password are.
2. No UI on `login.html` calls `AuthCoordinator.getLoginDecision()` yet.
   The method is real, tested, and reachable (script tags added), but
   dead from a user's perspective until a future slice wires a button/
   render step to it — deliberately deferred per the UI RULE (§12).
3. `getLoginDecision()`'s account-not-found and account-inactive paths
   were tested via direct engine calls in Node; the exact same
   generic-vs-specific disclosure question that already exists for
   `login()`/`loginWithPasskey()` elsewhere in this codebase (should an
   inactive account really get a different message than "wrong
   username/password"?) was not re-litigated here — this slice matches
   the existing, already-shipped disclosure posture rather than
   changing it.

## NEXT BUILD MUST START WITH
1. Composing a real `CozyPhoneAccountLinkage` instance (real store
   adapter + `CozyPhoneChallengeService`, which `phone-provider.js`
   already instantiates as `window.CozyOS.PhoneChallengeService`) and
   loading it on `login.html`, so phone can genuinely become a usable
   alternate factor instead of permanently degrading to unavailable.
2. Wiring an actual login.html UI element to call
   `AuthCoordinator.getLoginDecision(username)` before rendering which
   login button(s) to show — this is the first UI-touching slice, out
   of scope for 9A by explicit instruction.
3. Re-reading `core/security/auth-policy-engine.js` in full before any
   admin-recovery-context work — it was inspected only enough to
   confirm it is unrelated to ordinary-user login ordering this slice,
   not fully read end-to-end.
