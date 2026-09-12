# CozyOS — Prompt 6 MID Checkpoint 2: Forgot Password wired into real login UI

PROMPT 6 STATUS: **INCOMPLETE** (Step A search + Step B UI wiring done this checkpoint;
Steps C–J — real delivery provider, phone/OTP reset, post-registration login decision tree,
Google composition, account linking, Settings/Security wiring — are NOT yet done; see
Known Limitations and Next Build Must Start With)

## STEP A — Repository search performed first (§3, §22)
Searched the entire tree (not just core/security) for a real email/SMS delivery provider
before touching anything:
- `grep -rlEi "nodemailer|sendgrid|resend|mailgun|twilio|ses\.|smtp"` across all `.js` files —
  the only hit was the code comment in `password-reset-service.js` itself, documenting that
  none of these exist. **Confirmed: no real email or SMS delivery provider exists anywhere
  in this repository.**
- Re-inspected `core/security/otp-provider.js` directly (not just by filename). It is a real
  RFC 6238 **TOTP** implementation (authenticator-app codes + recovery codes) — genuine, and
  already wired into `login.html` as the "CozyOS Authenticator" second-factor modal. It is
  **not** a phone-number/SMS verification system. Important distinction for §4/§6 of this
  prompt: there is currently no real "verified phone" or "SMS OTP" factor in this repo at
  all — only app-based TOTP. Searched separately for `phoneNumber|phone.?verif|recoveryPhone`
  across `core/` and found no CozyOS-account phone-verification infrastructure either.
- This means §4 (phone password reset) genuinely has no real provider or existing phone-
  identity factor to compose yet — building it now would mean inventing a fake phone/SMS
  engine, which the prompt explicitly forbids. Deferred, reported honestly below rather than
  faked.

## STEP B — Forgot Password wired into the real login UI (§2)
`login.html`'s existing "Forgot Password?" modal previously called
`IdentityEngine.resetPassword(username, newPassword)` directly — an **admin-initiated**
method that trusts the caller with no proof of account ownership. That was the disclosed
insecurity the MID-1 checkpoint's `password-reset-service.js` was built to close, but nothing
in the UI used it yet. This checkpoint closes that gap:

- Added `<script src="core/security/password-reset-service.js">` to `login.html`'s existing
  script list, positioned after `identity-storage.js`/`identity-engine.js` (its real
  dependencies) and before `otp-provider.js`, matching the file's own dependency order.
- Replaced the single-step "type a username, get a new password instantly" modal with a real
  two-step flow inside the **same modal, same CSS classes, same layout conventions**
  (`cozy-login-field`, `cozy-modal-actions`, `cozy-modal-cancel`/`-submit`, `cozy-modal-note`,
  `cozy-modal-error`/`-success`) — no new visual system, no redesign:
  - **Step 1 (request):** identifier field → `PasswordResetService.requestPasswordReset()`.
    Shows the service's real generic, enumeration-safe response. Never claims delivery
    occurred.
  - **Step 2 (confirm):** reachable either automatically or via an "I already have a reset
    token" link → token + new password fields → `PasswordResetService.confirmPasswordReset()`.
    Only a real, unexpired, unused, correctly-verified token can succeed.
- **Correction to `password-reset-service.js` itself:** its generic response text read *"a
  password reset link has been sent to its recovery email"* — a fabricated-delivery claim,
  since no email provider exists. Corrected to *"a password reset request has been created
  for it,"* preserving exact enumeration-safety (the existing test asserts
  `realMatch.message === noMatch.message`, still true) while no longer claiming something
  that doesn't happen. Re-ran the full 13/13 suite after this change — still 13/13.
- **Honest, clearly-labeled dev-only aid, not fake delivery:** since there is genuinely no
  way for a real user to receive the token in this build, added a `console.warn` listener on
  the service's existing `cozyos:password-reset-token-issued` DOM event, labeled
  `[CozyOS DEV ONLY — no delivery provider configured]`. This is the only way to exercise the
  flow end-to-end in this environment today. It is **not** presented to the user as a
  delivery success in the UI — the UI only ever shows the honest generic message. This
  listener must be removed the moment a real delivery provider is composed (see Known
  Limitations).

## FILES MODIFIED
- `login.html` — forgot-password modal markup (two-step), script include, JS wiring
  (`cozy-forgot-*` handlers replaced/extended). Nothing else on the page touched.
- `core/security/password-reset-service.js` — one string constant corrected (no logic
  change); see above.

## FILES CREATED
- `CHANGED-FILE-HASHES-PROMPT6-MID-2.txt`
- `IMPLEMENTATION-REPORT-PROMPT6-MID-2.md` (this file)

## FILES DELETED
- none

## TESTS
- `core/security/test/password-reset-service.test.js`: **13/13 passing** (re-run after the
  message-text correction — real Web Crypto, no mocks).
- Regression: ran `core/shell/tests/dashboard-settings-admin-boundary-core.test.js` (the one
  existing test most related to the auth/admin boundary this prompt cares about) — **1/1
  passing**, untouched by this checkpoint's changes, as expected.
- **Not run:** the broader repository test suite (hundreds of unrelated module tests —
  WholesaleOS, ChurchOS, intelligence/, etc.) was not executed this checkpoint; none of those
  modules were touched. **No dedicated unit test file for `identity-engine.js` or
  `auth-coordinator.js` exists anywhere in this repository** — a real, pre-existing gap,
  noted here rather than fabricated as covered.
- Fresh extraction: performed — see below.

## UI
- Existing Settings/Security UI: not touched this checkpoint.
- Existing login.html layout/CSS/cards/buttons: preserved. Only the forgot-password modal's
  internal markup changed (two steps instead of one), using the page's own existing modal/
  field/button classes throughout. No redesign.

## SECURITY
- Enumeration protection: preserved and re-verified by the existing test (`realMatch.message
  === noMatch.message`), independent of the corrected wording.
- Reset token remains SHA-256 lookup checksum + salted PBKDF2-SHA256 (100,000 iterations)
  verifier; raw token still never persisted, never logged by production code paths (the
  dev-only console listener is explicit, labeled, and reads from the same DOM event the
  MID-1 checkpoint already designed for exactly this purpose).
- Confirming a reset still terminates all other active sessions for that account (unchanged
  service behavior, exercised by the existing test suite).

## VERIFICATION HONESTY (§27 of this prompt / §28 of Prompt 6 MID-1)
- RESET PROTOCOL: LOCALLY VERIFIED (Node, real Web Crypto).
- UI WIRING: LOCALLY VERIFIED (inline `<script>` block parsed with `new Function()` — no
  syntax errors; every referenced element ID exists exactly once in the modal markup).
- BROWSER VERIFIED: NOT PERFORMED — this sandbox cannot open a real browser against
  `login.html`. The click handlers, modal show/hide, and service calls have not been
  exercised in an actual DOM/browser event loop, only reasoned about and syntax-checked.
- DEVICE VERIFIED / INTERNET VERIFIED / DEPLOYMENT VERIFIED: not applicable — no device or
  network-dependent code was touched this checkpoint.
- EMAIL/SMS DELIVERY: NOT VERIFIED — confirmed via fresh repo search that no provider exists
  (see Step A). Not fabricated.

## PROTECTED FILES
Verified unchanged (hashed before and after edits, both identical):
`core/modules/founder-story/*`, `core/shell/cozy-login-gate.js`. Neither was touched or
needed to be.

## KNOWN LIMITATIONS
1. No real email or SMS transport exists — end users genuinely cannot receive their reset
   token yet. The dev-only console listener is a stopgap for local testing only, must be
   removed once a real provider is composed, and is clearly labeled as such in the code.
2. Phone-channel password reset (§4/§6) is not started — there is no existing phone-number
   verification factor in this repo to compose (only TOTP, which is a different factor).
   Building phone reset now would require inventing a phone/SMS engine from nothing, which
   this prompt explicitly forbids without a real provider.
3. The post-registration login decision tree (§6–§17: passkey-first login, fingerprint/face/
   voice/trusted-device/Google/phone fallback ordering, Settings/Security enrollment display,
   account linking, admin/user separation wiring) has not been started this checkpoint.
4. Browser-level verification (an actual DOM/click-event run, not just syntax validation) has
   not been performed — flagged, not hidden.
5. Full repository regression suite not run — only the two directly relevant test files.

## SHA256
File hashes: see CHANGED-FILE-HASHES-PROMPT6-MID-2.txt
Package SHA-256: per this repo's own governance convention (noted in the MID-1 report), the
ZIP's own hash is stated only in the delivery message, not embedded inside the package
itself (embedding it would change the file and invalidate the hash). It was computed twice
(identical both times), `unzip -t` reported no errors, and fresh-extraction file hashes for
both changed files matched the pre-package hashes exactly with 13/13 tests re-passing from
that fresh extraction.

## NEXT BUILD MUST START WITH
1. Search again (do not trust this summary alone) for any real email/SMS provider before
   building one — none exists as of this checkpoint.
2. If a real provider is genuinely out of reach in this environment, build the smallest real
   provider *interface/boundary* (not a fake implementation) so `password-reset-service.js`
   can compose it later, and remove the dev-only console listener once that seam exists.
3. Decide honestly whether phone-channel reset is buildable at all right now given there is
   no existing phone-verification factor — if not, state that plainly rather than deferring
   indefinitely, and propose what a real phone factor would require.
4. Begin §6 of this prompt: the post-registration login decision tree, starting from
   `auth-coordinator.js`/`auth-factor-registry.js` (real, already discovered) to determine
   actual per-account available factors, before touching `login.html`'s "More sign-in
   options" panel (currently mostly `disabled`/"Soon" placeholders — those must only become
   enabled once genuinely wired, never flipped on cosmetically).
