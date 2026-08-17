# Milestone 177 — Gate 1 — Repository Verification

**Outcome: B — Conflict found. Implementation halted. No code modified.**

Per the governance document, this is a successful Gate 1 outcome —
stopping here is correct, not a failed milestone. Findings below, scope
decision requested at the end.

---

## 1. Ownership Review

Repository-wide search performed for every term named in the milestone
brief (`AuthFactorRegistry`, `OTP`, `TOTP`, `WebAuthn`, `Passkey`,
`Security Key`, `Trusted Device`, `Recovery Code`, `Recovery Phrase`,
`Recovery Key`, `Recovery Questions`, `Fingerprint`, `Face`, `Biometric`,
`PIN`, `MFA`, `Authentication Provider`, `Authentication Factor`) plus
`orchestrat*` generally.

**Files found and their real, self-declared role (read, not assumed):**

| File | Registers | Role |
|---|---|---|
| `core/security/auth-factor-registry.js` | `window.CozyOS.AuthFactorRegistry` | Canonical, single source of truth for which authentication factor NAMES exist and which providers can verify them (face, fingerprint, voice, trusted-device, recovery-questions, recovery-phrase, google-account, device-certificate, security-key, otp, recovery-key, emergency-recovery-code). Explicitly distinguishes `isReal` (registered) from functional. |
| `core/security/auth-policy-engine.js` | `window.CozyOS.AuthPolicyEngine` | Canonical owner of "which factors an operation requires" (AND/OR policy trees). Explicitly refactored to hold no factor knowledge itself — calls `AuthFactorRegistry.getProvider()`. |
| `core/security/auth-coordinator.js` | `window.CozyOS.AuthorizationCoordinator` | **Self-declared** in its own header and its own registered `ServiceRegistry` description as: "Real, single facade over `CozyOS.Auth`, `AuthPolicyEngine`, and `AuthFactorRegistry`. Callers ask `authenticate(operationName, context)` instead of talking to the three underlying coordinators directly. Performs no authentication or policy logic itself — orchestrates real results, publishes real events, records real audit history." Explicitly distinct from `window.CozyOS.AuthCoordinator` (login orchestration). |
| `core/modules/identity/auth-coordinator.js` | `window.CozyOS.AuthCoordinator` | Login-orchestration sequence owner only (which engine to call, in what order, on login). States explicitly it does not own credential validation, trusted-device/recovery flows, "who is current," or the live session snapshot. |
| `core/modules/identity/admin-recovery-policy.js` | `window.CozyOS.AdminRecoveryPolicy` | Certified (Milestone 176C) narrow owner of trusted-device admin login + admin session listing/forced sign-out. Includes an additive, read-only `getRecoveryMethodsHealth()` diagnostics relay over the recovery managers, `AuthFactorRegistry`, `TrustedDeviceManager`, and `IdentityEngine` — explicitly documented as non-owning. |
| `core/security/otp-provider.js`, `trusted-device-manager.js`, `recovery-phrase-manager.js`, `recovery-question-manager.js`, `recovery-key-manager.js`, `emergency-recovery-code-manager.js`, `webauthn-provider.js`, `face-provider.js`, `face-capture-module.js`, `factor-provider-base.js` | Various | Each a single, self-declared canonical owner of one factor's real logic. No duplicates found among them. |
| `core/shell/cozy-admin-recovery-wizard.js` | (none — consumer) | Confirmed by the 176C record to already orchestrate the recovery managers independently for its own wizard flow, by design outside `AuthorizationCoordinator`. |

**No `AuthFactorWorkspace`-named file, and no file at
`core/security/auth-factor-workspace.js`, exists anywhere in the
repository.** The canonical path proposed in this milestone's brief is
free.

---

## 2. The Conflict

This milestone's objective is to verify whether an "Authentication
Factor Orchestration layer" exists, and if not, build one whose stated
responsibilities are: **aggregate, orchestrate, report, diagnose,
delegate** — never owning OTP, Trusted Device, Recovery Codes/Phrase/
Key/Questions, WebAuthn, Identity, Authorization, or Authentication
themselves.

`core/security/auth-coordinator.js` (`window.CozyOS.AuthorizationCoordinator`)
already exists, is already loaded in `dashboard.html`, and already
self-declares — verbatim, in its own header and its own registered
`ServiceRegistry` description — exactly this responsibility set: a
facade that aggregates and orchestrates `CozyOS.Auth`, `AuthPolicyEngine`,
and `AuthFactorRegistry`, performs no authentication or policy logic of
its own, publishes events, and records audit history. That is the same
five responsibilities (aggregate, orchestrate, report, diagnose,
delegate) this milestone's brief asks for, under a different proposed
name and path.

Per Rule 1 (Single Canonical Owner) and Rule 2 (No Duplicate
Implementations), creating `AuthFactorWorkspace` as specified would
produce a second, competing orchestration layer sitting over the same
three coordinators `AuthorizationCoordinator` already orchestrates —
an ownership conflict, not a gap.

---

## 3. Dependency Review

| Dependency | Present in repo | Loaded by `dashboard.html`? |
|---|---|---|
| `AuthFactorRegistry` | Yes | Yes |
| `OtpProvider` | Yes | Yes |
| `TrustedDeviceManager` | Yes | Yes |
| `EmergencyRecoveryCodeManager` | Yes | Yes |
| `RecoveryPhraseManager` | Yes | Yes |
| `RecoveryKeyManager` | Yes | Yes |
| `RecoveryQuestionManager` (repo name: `recovery-question-manager.js`) | Yes | Yes |
| `WebAuthnProvider` | Yes | Yes |
| `IdentityEngine` | Yes (per prior milestones' record) | Yes |
| `AuthorizationCoordinator` | Yes — **this is the conflict itself** | Yes |
| `AdminRecoveryPolicy` | Yes (certified Milestone 176C) | Yes |
| Administration Workspace | Yes (per prior milestones' record) | Yes |
| Session Workspace | Yes (per prior milestones' record, Milestone 176B) | Yes |
| `PlatformAudit` | Yes (per prior milestones' record) | Yes |

Total `<script src="...">` tags counted in `dashboard.html` at this
baseline: **153**. (Recorded for continuity with the 176-series count;
no tag has been added or removed by this Gate 1 pass.)

---

## Scope decision requested

Per Rule 1/2/32 and this milestone's own instruction ("If ownership
conflicts exist: STOP"), implementation is halted pending a decision.
Options, not recommendations:

1. **Confirm `AuthorizationCoordinator` already satisfies Milestone 177**
   and close the milestone as "no new layer needed," documenting why the
   existing facade meets the brief.
2. **Extend `AuthorizationCoordinator` in place** with any specific
   capability the brief wants that it does not yet have (e.g. a
   diagnostics/report surface beyond its current audit log, if one is
   genuinely missing) — additive to the existing file, not a new one.
3. **Name a genuinely distinct responsibility** for `AuthFactorWorkspace`
   that does not overlap `AuthorizationCoordinator`'s already-declared
   scope, if one exists — and state what it is.

No code has been written or modified. Waiting for direction before Gate 2.
