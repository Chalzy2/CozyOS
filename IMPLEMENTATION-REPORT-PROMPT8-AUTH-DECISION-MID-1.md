# Prompt 8 — Google Factor Snapshot + Post-Registration Login Decision Tree
## Implementation Report (MID-1)

## Ownership review performed first (Rule 48)
Repository search before writing anything:
- `login-decision-engine.js` **already exists and is complete** (built during Prompt 7). It is the real, pure, tested decision-tree core §16/§17 asks for — priority order, fail-closed rules, registration-method-is-reporting-only, admin-recovery-only trusted-device exclusion. Not touched; not duplicated.
- `google-account-linkage.js`, `google-account-provider.js`, `firebase-identity-issuer.js`, `google-login-endpoint.js` **already exist** — Google server verification + account linkage (§8/§9) already real. Not touched.
- `IdentityEngine.loginWithVerifiedGoogle()` / `.loginWithVerifiedPasskey()` **already exist** — session creation for verified factors. Not touched.
- No `FactorSnapshot`/`buildFactorSnapshot` anywhere. This was the genuine gap: nothing assembled `login-decision-engine.js`'s required `factors` snapshot from the real state already held by `WebAuthnProvider`, `PhoneAccountLinkage`, `GoogleAccountLinkage`, `TrustedDeviceManager`, `AuthFactorRegistry`.
- No `registrationMethod` (or any of the listed synonyms) stored anywhere on a real account record.

## What was built this slice
1. **`core/security/auth-factor-snapshot.js` (new)** — `buildFactorSnapshot()`. Composes the real engines listed above into the exact `{ account, factors }` shape `getLoginDecision()` already documents. Fails closed on any missing/malformed dependency; never accepts a caller-supplied factor boolean. No new registry, no parallel state.
2. **`core/modules/identity/identity-engine.js` (additive)** — `register()` now sets `registrationMethod: "email"` on every created user record (the only real value, since this path always collects email+phone+password today), with a comment explaining a future Google-only/phone-only registration path would set this at its own point of creation. Reporting-only, per §5/§34 — verified `login-decision-engine.js` never lets it affect factor priority.
3. **`core/security/test/auth-factor-snapshot.test.js` (new)** — 14 tests: fail-closed on missing userId/engines, caller-supplied booleans ignored, passkey/phone/google/voice/trustedDevice/password/recovery composition, admin-recovery-only trusted-device gating, and end-to-end composition with `getLoginDecision()`.

## Honest status per component (§33)

| Component | Status |
|---|---|
| Google server verification (`firebase-identity-issuer.js`) | LOCALLY VERIFIED (pre-existing, unchanged) |
| Google account linkage (`google-account-linkage.js`) | LOCALLY VERIFIED (pre-existing, unchanged) |
| **Google factor snapshot** | **LOCALLY VERIFIED (new this slice)** — composed via `AuthFactorSnapshot`, `providerReal` correctly read from `AuthFactorRegistry` (currently `false`, honestly, since no browser backend is registered yet) |
| Browser Google credential acquisition | **NOT VERIFIED — NOT IMPLEMENTED.** Searched for Google Identity Services / Firebase `signInWithPopup` / `GoogleAuthProvider` — none exist anywhere in the repo. `login.html` already has a Google button (`id`-less, `disabled`, "Soon" badge) — an existing control, not a new one, but it is not wired because there is no real client-side credential-acquisition mechanism to wire it to yet. Not fabricated. |
| **Login decision tree** | LOCALLY VERIFIED (pre-existing `login-decision-engine.js` from Prompt 7, re-verified against the new snapshot builder this slice) |
| Passkey | LOCALLY VERIFIED (pre-existing `WebAuthnProvider`, composed unchanged) |
| Phone | LOCALLY VERIFIED (pre-existing `PhoneAccountLinkage`, composed unchanged) |
| Face | NOT VERIFIED — no real backend exists (pre-existing honest stub, unchanged) |
| Voice | NOT VERIFIED — no real backend exists (pre-existing honest stub, unchanged); `voice.verified` is hard-coded `false` in the snapshot builder regardless of `providerReal` |
| Trusted Device | LOCALLY VERIFIED, admin-recovery-only (pre-existing `TrustedDeviceManager` + policy boundary, unchanged; snapshot builder only ever populates it for `context: "admin-recovery"`) |
| Password fallback | LOCALLY VERIFIED (derived from whether a real password hash exists on the account) |
| Password reset | LOCALLY VERIFIED (pre-existing `PasswordResetService`, untouched) |

Nothing in this slice was BROWSER/DEVICE/INTERNET/PRODUCTION verified — all verification this slice is Node-level (`node --test`), matching the rest of this security suite's current verification level.

## Not done this slice (explicitly out of scope, not fabricated)
- Browser-side Google credential acquisition (§25) — no real mechanism exists to compose.
- Wiring the existing (disabled) Google button in `login.html` to a live flow — blocked on the above; wiring a disabled placeholder to nothing would be fabrication.
- A genuine Google-only or phone-only self-registration path — `IdentityEngine.register()` still always requires email+phone+password; `registrationMethod` is additive metadata on top of that existing path, not a new registration flow.
- Face/Voice real backends — unchanged, still honest stubs.

## Protected files
`core/modules/founder-story/*` and `core/shell/cozy-login-gate.js` — not touched. `login.html` — not touched (read-only inspection to confirm the existing Google button's state).

## Regression
Full `core/security/test/*.js` suite (104 tests, includes the 14 new + all pre-existing security tests: `login-decision-engine`, `google-account-linkage`, `identity-engine`, `phone-account-linkage`, `webauthn-provider`, etc.): **104/104 passing, 0 failures.**
