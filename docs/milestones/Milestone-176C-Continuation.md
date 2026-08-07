# Milestone 176C — Administrator Recovery Policy

**Project:** CozyOS Enterprise
**Milestone ID:** 176C
**Status:** Certified

> **Gate 0:** Baseline for this milestone — the repository state at the
> end of Milestone 176B in this conversation. 176B's status was
> confirmed Certified before this milestone began.

---

## Origin

Per the split decided during Milestone 176 (see
`Milestone-176A-Continuation.md`, "Origin") and renumbered per your
explicit instruction, 176C replaces the `AdminRecoveryPolicy` stub with
a real coordinator, now that 176A (runtime reconciliation) and 176B
(read-only Session Workspace) are both certified. Standing rule carried
forward, as instructed: **replace the stub, do not replace the owners.**

---

## Gate 1 — Repository Verification

**Stub interface (before this milestone):** `0.0.1-STUB`.
`attemptNormalLogin({userId, deviceId})` → always denies.
`listAdminSessions(userId)` → always `[]`. `forceSignOutAllSessions(userId)`
→ always `{success:false}`. Header declared scope: trusted-device +
biometric admin login, admin session listing, forced sign-out.

**Live consumer contract**, read directly from
`core/modules/identity/auth-coordinator.js` before any code was written:
`attemptNormalLogin()` must resolve `{granted, reason}` or `{granted:true,
mode, session:{id}}`; `listAdminSessions()` results must expose `.id`,
`.revoked`, `.authMode`; `forceSignOutAllSessions(userId)` is called with
one argument today, though the file's own header documents the fuller
`(userId, exceptSessionId)` signature as a disclosed, pre-existing gap
(no single-session revoke) — not something to silently fix this
milestone.

**Canonical recovery components verified** (exact live methods read
from source, none inferred): `EmergencyRecoveryCodeManager`
(`core/security/emergency-recovery-code-manager.js`, self-declared
"Single source of truth... No other coordinator issues, stores, or
consumes these codes"); `RecoveryPhraseManager`
(`core/security/recovery-phrase-manager.js`, same ownership pattern);
`OtpProvider` (`core/security/otp-provider.js`); `AuthFactorRegistry`
(`core/security/auth-factor-registry.js` —
`registerFactor`/`getProvider`/`hasProvider`/`listFactors`/
`getDiagnosticsReport`); `TrustedDeviceManager`
(`core/security/trusted-device-manager.js`, real ownership + 30-day
trust + 10-minute idle-lock, already registers a real `"trusted-device"`
factor); `IdentityEngine` (confirmed `isPlatformAdmin(userId)` real);
`AdminRecoveryWizard` (`core/shell/cozy-admin-recovery-wizard.js` —
password-reset UI, calls `AuthFactorRegistry` providers directly, by
design does not route through `AdminRecoveryPolicy`).

**Found beyond the requested scope, reported rather than omitted:**
`recovery-key-manager.js` (factor `recovery-key`) and
`recovery-question-manager.js` (factor `recovery-questions`) — same
independent-ownership pattern; `webauthn-provider.js` (factor
`security-key`). None referenced or touched by this milestone.

**Critical finding governing the design:** `EmergencyRecoveryCodeManager`
and `RecoveryPhraseManager` are each self-declared sole owners of their
respective methods, and `AdminRecoveryWizard` already independently
orchestrates all of them for password reset without routing through
`AdminRecoveryPolicy`. Wiring codes/OTP/phrase into this file's login
methods would therefore be new integration, not stub replacement — kept
out of scope.

**Second finding:** `SessionManager` populates its tracked-session map
only from `IdentityEngine`'s private `identity:session-created` event,
emitted exclusively by `IdentityEngine.login()` (password path).
Trusted-device logins never call that method, so `SessionManager`
structurally cannot track them. `AdminRecoveryPolicy`'s own header
already declares "admin session listing" as its canonical ownership —
this is the genuine, previously-unfilled gap that ownership exists to
cover, not a duplicate of `SessionManager`'s idle-timeout/device-binding
responsibilities (untouched by this milestone).

**Dashboard load order:** `admin-recovery-policy.js` loads at line 388,
immediately after `identity-engine.js` (383) — correct, since only
`IdentityEngine.isPlatformAdmin()` is needed at that point in the load
chain. `AuthFactorRegistry`/`TrustedDeviceManager`/etc. (lines 437–457)
are accessed only live, at call-time, inside async methods — the same
deferred-accessor pattern already established in every other coordinator
in this repository (e.g. `SessionWorkspace`, `AdminWorkspace`).

**Duplicate check:** No other `RecoveryPolicy`-named implementation
exists anywhere. All other matches are references *to* this file, not
competing implementations.

**Conflict Report:** None found. Two scope decisions recorded above.
Gate 1 outcome: **Pass.**

---

## Gate 2 — Implementation

Replaced `core/modules/identity/admin-recovery-policy.js` in place
(same path, same global — `window.CozyOS.AdminRecoveryPolicy`, now
`v1.0.0-ENTERPRISE`). Methods:

- `attemptNormalLogin({ userId, deviceId })` — real. Fails closed if
  `IdentityEngine`/`AuthFactorRegistry` are absent, if the user isn't a
  real platform administrator, or if the `"trusted-device"` factor
  denies. On success, calls `TrustedDeviceManager.touchDevice()`
  (best-effort, non-fatal) and records a real local admin-recovery
  session.
- `listAdminSessions(userId)` — real listing of this file's own tracked
  sessions.
- `forceSignOutAllSessions(userId, exceptSessionId = null)` — real
  revoke of tracked sessions; `exceptSessionId` implemented per the
  documented signature but, matching the live caller's current
  behavior, is simply never passed today.
- `getRecoveryMethodsHealth()` — new, additive, read-only diagnostics
  relay over the six related components; no recovery logic implemented.
- `getDiagnosticsReport()`, `getHistory()`, `getVersion()`.

Updated the `dashboard.html` comment above the script tag (previously
inaccurate — described "new-device verification, and emergency
recovery," neither of which this file does) to state the real, narrower
scope. No script tag was added or moved — the file was replaced at its
existing path and existing load position.

---

## Gate 3 — Verification

- **Static Verified:** `node --check core/modules/identity/admin-recovery-policy.js` — passed.
- **Repository Verified:** 153/153 script paths in `dashboard.html`
  resolve to real files — unchanged from 176B, since no tag was added.
- **Runtime Verified:** Node harness loaded the real, unmocked files —
  `identity-engine.js`, `admin-recovery-policy.js`, `cozy-auth.js`,
  `cozy-session-service.js`, `identity/auth-coordinator.js`,
  `factor-provider-base.js`, `auth-factor-registry.js`, `otp-provider.js`,
  `auth-policy-engine.js`, `recovery-phrase-manager.js`,
  `recovery-question-manager.js`, `trusted-device-manager.js`,
  `session-manager.js`, `recovery-key-manager.js`,
  `emergency-recovery-code-manager.js`, `webauthn-provider.js`,
  `security/auth-coordinator.js`, `audit-engine.js`,
  `cozy-session-workspace.js` — in `dashboard.html`'s exact order.
  Confirmed:
  - An unregistered device and a non-platform-admin user both correctly
    fail closed with real, stated reasons.
  - A genuine platform-admin (`IdentityEngine.createUser` with
    `roles:["platform-admin"]`) with a genuinely registered, trusted
    device (`TrustedDeviceManager.registerDevice()`) is correctly
    granted, with a real session id returned.
  - The full real chain — `AuthCoordinator.loginWithTrustedDevice()` →
    `AdminRecoveryPolicy.attemptNormalLogin()` → the real
    `"trusted-device"` factor → real `TrustedDeviceManager` checks →
    `CozyOS.Session.establishFromExternalAuth()` — succeeds end-to-end.
  - `restoreSession()` correctly re-validates the persisted
    admin-recovery pointer against `listAdminSessions()`.
  - `logout()` correctly calls `forceSignOutAllSessions()`, and the
    session's `revoked` flag is genuinely set to `true` afterward —
    confirmed by re-reading `listAdminSessions()` post-logout.
  - `getRecoveryMethodsHealth()` returns real, live diagnostics from
    `TrustedDeviceManager` and `AuthFactorRegistry` (12 total factors,
    7 real providers, confirmed in the actual registry).
  - Graceful degradation: with all dependencies absent,
    `attemptNormalLogin()` returns `{granted:false, reason:...}`,
    `listAdminSessions()` returns `[]`, `forceSignOutAllSessions()`
    returns `{success:true, revokedCount:0}` (a real, honest zero — not
    a fabricated failure), and `getRecoveryMethodsHealth()` reports
    `available:false` for every section. No thrown errors.
- **Browser Runtime Verified:** **Not Performed** — no browser available
  in this environment, consistent with every prior milestone.

---

## Gate 4 — Known Limitations

- Biometric (`fingerprint`/`face`) factors remain `isReal:false` stubs,
  unchanged by this milestone and out of scope — `attemptNormalLogin()`
  only exercises the real `"trusted-device"` factor, matching its one
  live caller's exact parameters (`{userId, deviceId}`, no factor
  selection).
- `forceSignOutAllSessions()`'s single-session-revoke gap (documented in
  `auth-coordinator.js`'s own header) persists by design — the second
  parameter is implemented but not yet exercised by any real caller.
- Emergency Recovery Codes, Recovery Phrases, OTP, Recovery Questions,
  Recovery Keys, and Security Keys remain entirely outside this file's
  responsibility — verified as already independently owned and already
  orchestrated by `AdminRecoveryWizard`.
- Admin-recovery sessions tracked by this file exist only in memory for
  the page's lifetime — same non-persistence characteristic already
  disclosed for `OtpProvider` and every other in-memory coordinator in
  this repository; not a new limitation introduced here.

---

## Gate 5 — Continuation State

**Canonical owners (replaced, by this milestone):**
- `AdminRecoveryPolicy` — `core/modules/identity/admin-recovery-policy.js`
  — now real. Owns: trusted-device admin login orchestration, and
  admin-recovery session listing/revoke. Delegates everything else.

**Canonical owners (unchanged):** `TrustedDeviceManager`,
`AuthFactorRegistry`, `IdentityEngine`, `AuthCoordinator` (identity),
`AuthorizationCoordinator`, `SessionManager`, `SessionWorkspace`,
`EmergencyRecoveryCodeManager`, `RecoveryPhraseManager`, `OtpProvider`,
`RecoveryKeyManager`, `RecoveryQuestionManager`, `WebAuthnProvider`,
`AdminRecoveryWizard`, `PlatformAudit`, `AdminWorkspace`.

**Active integrations confirmed working:**
`AuthCoordinator.loginWithTrustedDevice()` → real
`AdminRecoveryPolicy.attemptNormalLogin()` → real `"trusted-device"`
factor → real `TrustedDeviceManager`; `AuthCoordinator.restoreSession()`
/`logout()` → real `AdminRecoveryPolicy.listAdminSessions()`/
`forceSignOutAllSessions()`.

**Outstanding blockers for future milestones:** None from this
milestone. The trust-method ownership table produced during Milestone
176 is now fully resolved for every method it marked "Reused — unblocked
by this milestone" across 176A/176B/176C. PIN remains genuinely absent
(unchanged, no milestone has claimed it). Fingerprint/Face remain
honestly-disclosed non-real stubs.

**Repository health:** 0 ownership conflicts, 0 broken script paths
(153/153 resolve), 0 stubs remaining among the three components 176
originally set out to address (`SessionManager`/`TrustedDeviceManager`
reachability — 176A; `SessionWorkspace` — 176B; `AdminRecoveryPolicy` —
176C).

---

## Certification

```
Repository Verified
Static Verified
Runtime Verified
Browser Runtime Verified   NOT VERIFIED
Certified
```
