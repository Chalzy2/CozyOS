# IMPLEMENTATION REPORT — PROMPT10B-MID-2 (STEP B)

Continued from independently verified COS-DASHBOARD-PROMPT10B-MID-1
(ZIP SHA-256 `36b199193768ec2ee9df670ba1e843f9797f3c3b988bfc2e934574ef8d49e492`).
Confirmed by direct `diff -rq` against a fresh extraction of that
checkpoint before any edits — no drift, nothing assumed.

## PROMPT10 CONTINUATION STATUS: INCOMPLETE (by design — see below)
This slice performed the mandatory tree-wide search (§3) and the
concretely buildable, testable portion of STEP B. It deliberately did
**not** enable the Google Enroll button, and did **not** modify
`Firebase/firebase-auth.js`, for reasons that are the actual, real
finding of this slice — stated plainly below, not glossed over.

## §3 TREE-WIDE SEARCH — REAL FINDINGS
Performed before writing anything, across `core/`, `server/`,
`Firebase/`, `dashboard.html`, `login.html`, and every file named in
§3's checklist.

**Firebase Auth — a real, previously under-examined finding:**
`Firebase/firebase-auth.js` (Milestone 146/220) is a real, working
thin wrapper around the actual Firebase Auth SDK (dynamically imported
from `https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js`,
per `Firebase/firebase-config.js`'s real, non-placeholder project
config — `projectId: "cozycabin-affiliate"`, the same project every
Google/Firebase test in this repo already uses). It exposes real
`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`,
`signOut`, and a raw `onAuthStateChanged` subscription. **It does
NOT expose any Google sign-in method** — no `GoogleAuthProvider`, no
`signInWithPopup`, no `signInWithRedirect` — anywhere in this file or
any other file in the repository (confirmed by repo-wide search for
those exact identifiers). This is the precise, previously-unstated
reason no real per-user Google ID token can be obtained client-side
today: not a missing OAuth client configuration alone (as prior
reports characterized it), but the additional fact that the one real
Firebase Auth wrapper this app has never calls Google's sign-in method
at all.

**Enrollment click-surface architecture — confirmed real and correct:**
`core/modules/security/authentication-enrollment-panel.js` (Milestone
359) is the actual real, interactive click surface (`<button
data-action="enroll">`, real click handling, real
`AuthEnrollmentStore` composition) — distinct from
`authentication-settings-module.js` (a read-only status/diagnostics
report generator, which STEP A correctly left alone). This panel
already deliberately sets `realEnroll: null` for
fingerprint/face/voice/google-account, and its own header already
states why: no per-user enrollment method exists for any of them.
Direct inspection confirms this is accurate, not stale — re-verified
this slice, not assumed from the file's own comment.

**Fingerprint/Face — confirmed already covered by the platform
authenticator, per §10/§11:** `core/security/webauthn-provider.js`
already requests `authenticatorSelection: { authenticatorAttachment:
"platform", userVerification: "required" }` on every credential
creation — this is the standard, real mechanism by which a WebAuthn
platform authenticator triggers the OS's own biometric prompt (Touch
ID / Face ID / Windows Hello / Android fingerprint) automatically.
Confirmed real, not fabricated. No separate fingerprint/face engine is
needed or was built — composing WebAuthnProvider already is the
correct architecture, exactly as prior milestones' comments already
stated. This slice re-confirmed it by direct code read rather than
repeating the claim unverified.

**Voice — confirmed still genuinely unavailable:** `voice-provider.js`
is the same `factor-provider-base.js`-based honest stub as
fingerprint/face; no real speaker-verification engine exists anywhere
in the repository (repo-wide search for "speaker verification",
"voiceprint", "voice enrollment model" — no hits outside the stub
provider itself). Left honestly unavailable, not fabricated.

**Trusted Device — confirmed unchanged, correctly admin-only:** no
separate ordinary-user trusted-device login factor exists anywhere;
`trusted-device-manager.js` remains platform-admin-recovery-scoped
only, exactly as every prior checkpoint already established. Not
touched, not converted.

## WHAT WAS BUILT THIS SLICE
**`core/modules/security/test/authentication-enrollment-panel.test.js`**
(new — the first test file this real, previously-untested module has
ever had, confirmed absent by repo-wide search before writing it,
despite the module's own header stating its functions are "Exposed
for the Node regression harness to test the framework without a
DOM"). 13 real tests covering: unsigned-in fail-closed behavior, real
enrolled/not-enrolled card state, the honest `canEnroll:false` guarantee
for fingerprint/face/voice/google-account (directly testing the exact
finding above), a real WebAuthn enroll success path (only records a
store enrollment after a real provider success), a real WebAuthn
enroll failure path (confirms no enrollment is ever fabricated on
failure), the full enable/disable/remove lifecycle, missing-dependency
fail-closed behavior, and confirmation that the rendered HTML never
emits an Enroll button for Google. No production behavior file was
touched to add this — it is pure regression coverage for existing,
unmodified code.

## WHAT WAS DELIBERATELY NOT BUILT, AND WHY
**The Google Enroll button was not wired.** Doing so honestly requires
a real Google ID token obtainable in-browser. The only technically
correct way to add one — extending `Firebase/firebase-auth.js` with a
`signInWithGooglePopup()` using the real, already-dynamically-imported
Firebase SDK's `GoogleAuthProvider`/`signInWithPopup` — was evaluated
and rejected for this slice on a specific, disclosed ground: this
sandbox has no network access (confirmed: `bash_tool`'s network is
disabled) and no browser, so any such addition would be **completely
untestable here** — no way to fetch the real SDK, no way to trigger or
verify a real popup flow. Adding untested, unverifiable browser code
and calling STEP B "done" would be exactly the kind of fabrication
every prior checkpoint's discipline explicitly forbids (§25: build
what's genuinely testable; disclose the rest precisely). This is
therefore reported as a real, precise limitation — not a vague
"missing dependency" — with the exact file and exact API calls a
future slice (one run somewhere with real network/browser access to
actually test it) would need to add. **The Google `google-account`
`realEnroll` in the enrollment panel remains `null`**, which is the
architecturally correct, honest state given the above — not a gap
this slice failed to close, but the correct answer given what
genuinely exists.

## AUTHENTICATION
registration methods = unchanged (Google/email/phone, per IdentityEngine)
post-registration login factors = unchanged (`login-decision-engine.js`
  untouched this slice; already confirmed in Prompt 9A/9B that
  registration method never dictates factor selection)
registration method dictates future login = **NO** (unchanged, already
  true, re-confirmed by this slice's reading of `auth-coordinator.js`
  — not re-tested here, no code path touched)

## PASSKEY
Unchanged. Re-confirmed (not re-tested) as the real, correct home for
fingerprint/face via the platform authenticator (see §3 findings).

## FINGERPRINT
Confirmed already covered via WebAuthn platform authenticator (see
§3). No separate engine built — would be a duplicate.

## FACE
Same as Fingerprint — confirmed covered via the same real mechanism.

## VOICE
Confirmed genuinely unavailable — no real backend exists anywhere.
Left honestly unavailable.

## TRUSTED DEVICE
Unchanged. Confirmed still platform-admin-recovery-only; no separate
ordinary-user trusted-device factor exists to compose.

## PHONE
Not touched this slice. STEP B's search confirmed
`phone-account-linkage.js` is loaded on `dashboard.html` (per Prompt
9B) but, like Google, has no browser-side HTTP client wired to any
click surface yet — a real, separate next step (see NEXT BUILD MUST
START WITH).

## GOOGLE
See §3 and "WHAT WAS DELIBERATELY NOT BUILT" above. Real client exists
(`google-account-link-client.js`, Prompt 10B-MID-1); real server
exists; real Firebase Auth SDK access exists; the one genuinely
missing piece is a Google-specific sign-in call in
`Firebase/firebase-auth.js`, precisely identified, not built this
slice (untestable in this sandbox).

## PASSWORD
Unchanged, not touched.

## PASSWORD RESET
Unchanged, not touched. `password-reset-service.js`,
`delivery-backend-registry.js` untouched; existing PBKDF2/SHA-256
double-hash convention, expiry, single-use, replay/tamper/enumeration
protections all unmodified (confirmed via `diff -rq`, not merely
un-mentioned).

## ACCOUNT LINKING
Unchanged from STEP A. Not extended this slice.

## SESSION AUTHORITY
Unchanged. TOFU model from MID-2/STEP A untouched — not addressed
this slice, per the same reasoning that blocked the Google popup work
(would require deciding on and building real cryptographic proof
infrastructure, a larger, separate, genuine architecture decision per
§18's own instruction not to bypass this requirement casually).

## CSRF/ORIGIN
Unchanged. Not addressed this slice — no new mutation endpoint was
added that would need it (this slice added zero server-side code).

## UI
**Unchanged — literally zero UI files touched this slice.** No CSS, no
layout, no new controls, no `login.html`/`dashboard.html` edits. The
only file added is a test file.

## FILES CREATED
- core/modules/security/test/authentication-enrollment-panel.test.js

## FILES MODIFIED
None.

## FILES DELETED
None.

## TESTS
new (`authentication-enrollment-panel.test.js`) = **13/13**
`core/security/test/*.js` full suite (unchanged from STEP A) = 125/125
identity/organization/platform = 17/17
server/auth + firebase-identity-issuer (Google/session direct
  regression, unchanged from STEP A) = 59/59
FULL REPO REGRESSION: **NOT COMPLETED** — same documented reason as
  every checkpoint since Prompt 9B.

## PROTECTED FILES
`core/modules/founder-story/*` and `core/shell/cozy-login-gate.js` —
verified byte-identical to the original pristine repository, both
before and after this slice (direct SHA-256 comparison). Unchanged.

## BROWSER
NOT VERIFIED. No browser was launched. Nothing browser-facing was
added this slice.

## DEVICE
NOT VERIFIED.

## INTERNET
NOT VERIFIED. This sandbox has no network egress (confirmed: bash
tool network access is disabled) — this is itself the reason the
Google popup work was not attempted, not merely a caveat.

## PRODUCTION
NOT VERIFIED.

## KNOWN LIMITATIONS
1. Google login/linking still has no real in-browser token-acquisition
   path. Precise, actionable gap (not vague): `Firebase/firebase-auth.js`
   needs a `signInWithGooglePopup()` using the SDK's own
   `GoogleAuthProvider`/`signInWithPopup`, callable from
   `authentication-enrollment-panel.js`'s `google-account.realEnroll`,
   which would then call the already-real
   `GoogleAccountLinkClient.linkGoogleAccountForCurrentUser()`. Not
   built here because it is genuinely untestable in this sandbox
   (no network, no browser) — building it blind would violate this
   project's own "no fake green, no unverifiable claims" discipline.
2. Phone has the equivalent gap Google has: a real server-side linkage
   engine exists, but no browser-side click surface or HTTP client
   wires it to `authentication-enrollment-panel.js`.
3. Session authority remains TOFU; CSRF/origin defense remains
   content-type-only. Neither addressed this slice.
4. `authentication-enrollment-panel.js`'s `doAction()` for
   enable/disable/remove has real regression coverage now, but its
   real DOM `init()`/`handleGridClick()` wiring itself is still
   untested (would require a real DOM — jsdom or a browser — neither
   available in this sandbox).
5. Full repo regression still not completed at any point across
   Prompts 9B, 10-MID-1, 10-MID-2, STEP A, or this slice.

## NEXT BUILD MUST START WITH
Two independent, genuinely buildable next slices — pick by product
priority, not inferred here:
1. **Google popup wiring**, run in an environment with real network
   access to fetch the actual Firebase SDK and (ideally) a real
   browser to exercise a real popup — implement exactly the seam
   described in Known Limitation #1, then wire
   `authentication-enrollment-panel.js`'s `google-account.realEnroll`
   to it, then flip its `canEnroll` guarantee on for real.
2. **Phone's equivalent browser-side client**
   (`core/security/phone-account-link-client.js`, mirroring
   `google-account-link-client.js`'s real pattern) plus wiring
   `authentication-enrollment-panel.js`'s `phone.realEnroll` — phone
   verification (OTP-based) does not require an external SDK the way
   Google does, so this may be fully buildable and testable in this
   same sandbox without the network/browser blocker above.

## ZIP
COS-DASHBOARD-PROMPT10B-MID-2.zip

## SHA256
(computed after packaging — see terminal verification output)
