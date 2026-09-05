# CozyOS — Prompt 7 MID-1 — Implementation Report
Post-Registration Authentication Decision Tree + Phone Verified State

## PROMPT 7 STATUS
**INCOMPLETE — first coherent slice only, by design (Prompt 7 §28 asks for a middle
checkpoint after "phone verified-state linkage + login decision-tree core + focused tests,"
not the full 34-section scope in one pass).**

## CHECKPOINT
- §1 checkpoint repair performed: `CHANGED-FILE-HASHES-PROMPT6-MID-3.txt` existed but
  `IMPLEMENTATION-REPORT-PROMPT6-MID-3.md` did not. Reconstructed from actual repo state and
  re-run tests — see that file. All 15 recorded MID-3 hashes (2 modified, 4 new, 9 protected)
  re-verified byte-identical against the working tree.
- Original `COS-DASHBOARD-PROMPT6-MID-3.zip` was not present in this workspace, so its own
  `unzip -t`/double-SHA-256/fresh-extraction could not be independently re-run — reported as
  NOT PERFORMED, not assumed passing (see the reconstructed report for detail).

## SEARCH PERFORMED BEFORE WRITING ANY CODE (§6)
Read in full: `core/security/auth-coordinator.js`, `core/modules/identity/auth-coordinator.js`,
`core/security/auth-policy-engine.js`, `core/security/auth-factor-registry.js`,
`core/security/phone-provider.js`, `core/security/delivery-backend-registry.js`,
`core/security/voice-provider.js`, `core/security/google-account-provider.js`. Grepped the
whole tree for phone/google/registrationMethod/decision-tree/identity-engine terms.

Findings that shaped this slice:
- No login-priority/decision-tree logic exists anywhere. `auth-policy-engine.js`'s only
  login-shaped policy (`normal-login`) is the Platform-Administrator step-up policy
  (trusted-device AND face/fingerprint/voice) — not an ordinary-user login order.
- `phone-provider.js`'s own header explicitly disclaims owning "verified phone" account state
  ("deliberately left for a following step") — confirming this was genuinely missing, not
  overlooked.
- `IdentityEngine` (`core/modules/identity/identity-engine.js`) stores a raw `phone` field at
  registration only; no `phoneVerified`/`phoneLoginEnabled`/`phoneRecoveryEnabled` state exists
  anywhere in the repository.
- `auth-factor-registry.js` already honestly distinguishes registered-name (`face`,
  `fingerprint`, `voice`, `google-account`, `trusted-device`, etc.) from functional
  (`isReal`) — every one of those is currently `isReal:false` except the real, separate
  WebAuthn passkey path (`core/modules/identity/auth-coordinator.js#loginWithPasskey`,
  composing the real `WebAuthnProvider`).
- Trusted-device/biometric login (`loginWithTrustedDevice`/`loginWithBiometrics`) is
  Platform-Administrator-only, via `AdminRecoveryPolicy` — confirmed by that file's own Rule 25
  ownership header. Not touched, not weakened, not exposed as an ordinary factor (§20).

**No duplicate engines were created.** Both new files compose existing real engines
(`CozyPhoneChallengeService`, `DeliveryBackendRegistry`, `AuthFactorRegistry`'s `isReal`
convention) rather than reimplementing any of them.

## FILES CREATED
1. `core/security/phone-account-linkage.js` — durable, server/authority-controlled verified-
   phone account state (`phoneNumber`, `phoneVerified`, `phoneVerifiedAt`,
   `phoneLoginEnabled`, `phoneRecoveryEnabled`). Composes the real `CozyPhoneChallengeService`
   (possession proof) and `DeliveryBackendRegistry` (honest SMS-channel gate) — never
   re-implements either. `phoneVerified` can only become `true` through one real, solved
   challenge. `isPhoneLoginUsable()`/`isPhoneRecoveryUsable()` additionally require a real,
   configured SMS backend — a verified phone with no SMS transport is honestly reported as
   NOT login/recovery-usable (matches this repo's actual state today: no SMS backend exists).
   Guards against account-takeover via reused/replayed phone numbers (cross-account confirm
   rejected), and is enumeration-safe (identical generic response regardless of validity).
   Ships with an in-memory reference account-store adapter for Node testing and for any
   caller without a real store wired yet; the interface is deliberately decoupled from
   `IdentityEngine`'s internals (a `getRecord/setRecord/findUserIdByVerifiedPhone` adapter),
   so a real account engine can compose it without this file reaching into private state.
2. `core/security/login-decision-engine.js` — pure, deterministic
   `getLoginDecision({account, factors, context, policy})`. Verifies nothing itself; takes an
   already-authoritative per-factor availability snapshot and returns the strongest genuinely
   usable factor, the full ordered usable list, and fallback/recovery flags. Registration
   method (`account.registrationMethod`) is reported back but never influences ordering —
   directly tested. Trusted-device is hard-excluded from ordinary `context:"login"` regardless
   of any factor input, and only appears for an explicit `context:"admin-recovery"` AND
   `adminAuthorized:true` — preserving the existing Platform-Administrator boundary (§20)
   rather than a policy toggle that could be flipped by mistake. Fingerprint/face are not
   modeled as separate factors — per §11, a platform-authenticator-exposed biometric is
   represented as `passkey`, matching the real `WebAuthnProvider` architecture already in
   this repo.
3. `core/security/test/phone-account-linkage.test.js` — 11 tests.
4. `core/security/test/login-decision-engine.test.js` — 19 tests.
5. `IMPLEMENTATION-REPORT-PROMPT6-MID-3.md` — reconstructed missing checkpoint report (§1).

## FILES MODIFIED
None. This slice deliberately touched no existing production file, including `login.html`
(§15/§21/§32 forbid UI redesign; wiring the decision tree's result into `login.html` is
explicitly deferred to the next slice, not attempted half-wired this pass).

## FILES DELETED
None.

## LOGIN DECISION TREE
Priority for ordinary login: `passkey → phone → google-account → voice → password`.
`trusted-device` only for `context:"admin-recovery"`. Every factor requires more than one
real, positive signal to be considered usable (never a single flag) — see
`login-decision-engine.js`'s own `isFactorUsable()`. In this repository's actual current
state: passkey is the only factor that can be genuinely usable (composes the real
`WebAuthnProvider`); phone requires both a solved challenge AND a real SMS backend (neither
exists yet for SMS, so phone login is currently correctly reported as unusable even once a
phone is verified); google-account and voice are stub providers (`isReal:false`) and are
therefore never offered. Password remains the honest fallback throughout.

## REGISTRATION VS LOGIN
Explicitly and directly tested (`login-decision-engine.test.js`): email/Google/phone
registration never forces that method to remain the everyday login path — an enrolled
passkey always outranks the registration method, and an unusable registration-method factor
(e.g. phone verified but no SMS backend) correctly falls through to password rather than
being force-offered.

## PHONE VERIFIED STATE
Implemented per §14/§15. State can only be set through a real solved
`CozyPhoneChallengeService` challenge (never client-asserted). Cross-account reuse of an
already-verified phone number is rejected. Login/recovery usability additionally requires a
real, configured `DeliveryBackendRegistry` "sms" channel — currently absent in this
repository, so `isPhoneLoginUsable()`/`isPhoneRecoveryUsable()` correctly return `false` for
every account today, honestly, even once a phone is verified.

**Not yet done this slice:** wiring a real `IdentityEngine`-backed store adapter (the
in-memory adapter is a reference/test implementation only) and instantiating
`window.CozyOS.PhoneAccountLinkage` with it on the actual page. `phone-account-linkage.js`
is browser-ready (UMD, same pattern as `phone-provider.js`) but the concrete
`IdentityEngine` adapter and the `window.CozyOS.PhoneAccountLinkage` composition on
`dashboard.html`/`login.html` are next-slice work, listed below.

## PASSKEY
Unchanged — real, already-existing `WebAuthnProvider` +
`AuthCoordinator.loginWithPasskey()`. The decision tree correctly requires BOTH
`enrolled:true` AND `deviceSupported:true` before offering it (§17 device-vs-enrollment
distinction) — tested directly.

## GOOGLE
Unchanged — `google-account-provider.js` remains a real, registered, honestly `isReal:false`
stub (no OAuth backend/server exists). The decision tree never offers it while that remains
true — tested directly with a claimed `linked:true` but `providerReal:false` input.

## FINGERPRINT/FACE
Not modeled as independent factors in the decision tree, per §11 — represented via `passkey`
(platform authenticator / WebAuthn), matching this repo's real architecture. No new
biometric engine created.

## VOICE
Unchanged — real, registered, honestly `isReal:false` stub. Never offered by the decision
tree while that remains true — tested directly, including the specific case of a caller
claiming `verified:true` without a real provider (must still be excluded).

## TRUSTED DEVICE
Unchanged, not weakened. Hard-excluded from ordinary login in code (not merely by convention)
— tested directly, including the case where the input claims `enrolled:true,
adminAuthorized:true` in an ordinary `context:"login"` call.

## PASSWORD FALLBACK
Real, tested: password is only ever `primaryFactor` when it is the sole usable option;
otherwise it still appears in `usableFactors` (bottom of the list) and `fallbackAvailable`
reports `true`, honestly representing the existing "use password instead" affordance without
displacing a stronger factor.

## PASSWORD RESET
Not touched this slice. `password-reset-service.js` and `delivery-backend-registry.js` remain
exactly as they were at PROMPT6-MID-3 (hash-verified above).

## TESTS
- new = 30/30 (`phone-account-linkage.test.js` 11/11, `login-decision-engine.test.js` 19/19)
- direct regression (`core/security/test/*.test.js`, all 5 files together) = 64/64
- fresh extraction = see "CHECKPOINT DISCIPLINE" below

## SECURITY
- Phone: cross-account reuse of a verified number rejected; enumeration-safe responses;
  fail-closed on missing userId/malformed phone; login/recovery usability fails closed
  without a real SMS backend.
- Decision tree: fails closed on inactive/missing account, malformed factors object, and any
  factor state missing required fields; trusted-device hard-excluded outside admin-recovery
  context; a claimed-but-not-real provider (`providerReal:false`/`isReal:false` equivalent)
  is never treated as usable regardless of any other claimed flag.
- Neither new file performs its own cryptography — both delegate entirely to already-real,
  already-tested engines (`CozyPhoneChallengeService`, `WebAuthnProvider` via the decision
  tree's caller obligation documented in `login-decision-engine.js`'s own header).

## PROTECTED FILES
Verified unchanged (re-hashed, see `CHANGED-FILE-HASHES-PROMPT7-MID-1.txt`):
`core/modules/founder-story/*`, `core/shell/cozy-login-gate.js`. Neither was opened.

## BROWSER
NOT VERIFIED — no browser is available in this sandbox. Both new files are UMD-wrapped
(`module.exports` for Node, `window.CozyOS.*` for browser) following the exact pattern
`phone-provider.js`/`delivery-backend-registry.js` already use, but the `window.CozyOS.*`
registration paths have not been exercised in an actual DOM.

## DEVICE
NOT VERIFIED — no real WebAuthn/platform-authenticator device interaction was exercised
(none was needed for this slice; the decision tree treats `deviceSupported`/`enrolled` as
caller-supplied facts it composes, not something it checks itself).

## INTERNET
NOT VERIFIED — not applicable this slice (no network code was added).

## PRODUCTION
NOT VERIFIED.

## KNOWN LIMITATIONS
1. `phone-account-linkage.js` has no real `IdentityEngine`-backed store adapter yet — only
   the in-memory reference/test adapter exists. The account-linking flow is therefore not
   yet reachable from any real page.
2. `login-decision-engine.js` is not yet called from anywhere in `login.html` or
   `dashboard.html` — it is a real, tested, standalone module, not yet wired to a live
   caller. No UI change was made this slice (§15/§21/§32).
3. No real SMS backend exists, so phone login/recovery remain correctly non-functional even
   after this slice's work — this is honestly reported, not a regression.
4. Full-repository regression (all 151 `.test.js` files) was not run — only
   `core/security/test/*` (the only directory touched). No file outside `core/security/` was
   modified, so this is a scoped, disclosed limitation rather than an unverified risk.
5. The original `COS-DASHBOARD-PROMPT6-MID-3.zip` artifact's own `unzip -t`/double-SHA-256/
   fresh-extraction were not independently re-run this session (ZIP not present in this
   workspace) — see `IMPLEMENTATION-REPORT-PROMPT6-MID-3.md`.
6. Sections not started this slice: real Google OAuth backend, real voice verifier, real SMS/
   email transport, `login.html`/Settings-Security UI wiring, account linking beyond phone,
   password-reset integration with the new phone-verified state, and the full test matrix in
   Prompt 7 §25/§26 (only the decision-tree and phone-linkage portions were built and tested
   this slice — Google/voice/trusted-device/password-reset test scenarios that don't require
   new code were covered as part of the decision-tree's own test suite; the ones requiring
   real backends genuinely cannot be tested until those backends exist).

## NEXT BUILD MUST START WITH
1. Re-verify this checkpoint's hashes and re-run `core/security/test/*` before touching
   anything (same discipline this slice applied to PROMPT6-MID-3).
2. Build the real `IdentityEngine` store adapter for `phone-account-linkage.js` (getRecord/
   setRecord/findUserIdByVerifiedPhone backed by IdentityEngine's real user records) and
   instantiate `window.CozyOS.PhoneAccountLinkage` from it — composing, not duplicating,
   IdentityEngine's existing `#users` ownership.
3. Wire `core/modules/identity/auth-coordinator.js` to build a real factor-availability
   snapshot (calling `WebAuthnProvider.isSupported()/hasCredential()`,
   `PhoneAccountLinkage.isPhoneLoginUsable()`, `AuthFactorRegistry.getProvider(name).isReal`)
   and pass it into `LoginDecisionEngine.getLoginDecision()` — this is the real seam that
   turns the pure decision tree into an actual login-time decision.
4. Only then touch `login.html`'s existing "More sign-in options" panel — enabling real,
   now-wired controls per the decision result, per §15/§21 (no redesign, no new elements
   beyond the smallest necessary semantic/status wiring).
5. Add `loginWithPhone()`/`loginWithGoogle()` to `core/modules/identity/auth-coordinator.js`
   only once their underlying providers are genuinely real (§13/§28 — do not enable a public
   control that cannot actually authenticate).
