# Milestone 176A — Session Runtime Reconciliation

**Project:** CozyOS Enterprise
**Milestone ID:** 176A
**Status:** Certified

> **Gate 0:** Baseline for this milestone — the repository state at the
> end of Milestone 175B in this conversation (originating upload
> `CozyOS-main-v1_3_1-M175A.zip`, plus this conversation's own 175B
> changes). Locked at the start of Milestone 176 in this conversation.
> All findings, ownership decisions, implementation, and certification
> below apply only to that baseline. See `Milestone-176-Gate0.md` and
> `Milestone-176-Rule00.md` for the original Gate 0 / Rule 00 record.

---

## Origin

Milestone 176 was originally proposed as a single "Enterprise Session &
Trusted Device Management" milestone. Gate 1 (`Milestone-176-Gate1.md`)
returned Outcome B — a confirmed ownership/functional conflict — and
halted per governance, which is a successful Gate 1 outcome, not a
failed one. The milestone was then split, by explicit decision, into:

- **176A — Session Runtime Reconciliation** (this document): fix the
  conflict, no new security features.
- **176B — Session Workspace**: read-only facade, deferred until 176A is
  certified.
- **A future Security Milestone**: lost/stolen-device recovery, emergency
  administrator verification, and related step-up capabilities — deferred
  until after 176A/176B, and only after its own Gate 1 (see the trust-method
  ownership table below, produced ahead of that future milestone at your
  request).

This document covers 176A only.

---

## Gate 1 — Repository Verification (carried forward, re-confirmed)

Full findings are in `docs/milestones/Milestone-176-Gate1.md`, produced
against this same locked baseline before any code was touched. Summary
of the confirmed conflict:

- `core/security/session-manager.js` (real canonical owner of idle-timeout
  tracking, trusted-device session binding, and admin bulk logout) existed
  in the repository but had **no `<script>` tag anywhere in `dashboard.html`.**
- `core/modules/identity/auth-coordinator.js` contained a `bindCompatAliases()`
  block that ran on load and, because of the above gap plus load order,
  aliased `window.CozyOS.SessionManager` to `window.CozyOS.Session` (a
  different real file, the session-snapshot service) and
  `window.CozyOS.TrustedDeviceManager` to `window.CozyOS.AdminRecoveryPolicy`
  (an explicitly self-declared stub, `getVersion() → "0.0.1-STUB"`).
- When the real `core/security/trusted-device-manager.js` then loaded, its
  own version guard read the stub's version through the alias, saw a
  mismatch against `TRUSTED_DEVICE_VERSION` ("1.0.0-ENTERPRISE"), and
  threw `VERSION_CONFLICT` — so the real `CozyTrustedDeviceManager` was
  never constructed.
- `AuthorizationCoordinator`, an already-certified live consumer of both
  globals, was silently degraded as a result: `login({ rememberDevice: true })`
  never actually registered a device, and `authorize()`'s idle-lock/device-
  binding check never ran.

No trust-method ownership conflicts were found beyond this. The
repository-wide trust-method ownership review you requested (produced
before this Gate 2, per the agreed process) found:

| Trust Method | Status | Action |
|---|---|---|
| OTP | Real (`core/security/otp-provider.js`, real RFC 6238 TOTP, replaces the AuthFactorRegistry stub) | Reused, unchanged |
| Remember Device | Real (`TrustedDeviceManager.registerDevice()`) | Reused — unblocked by this milestone |
| Trusted Device | Real (`core/security/trusted-device-manager.js`) | Reused — unblocked by this milestone |
| Fingerprint / Biometric | Registered factor name only; `isReal: false`, honestly disclosed — no hardware access exists | Not duplicated; left as-is |
| Face Unlock | Same as Fingerprint | Not duplicated; left as-is |
| PIN | Does not exist anywhere in the repository | Genuinely absent — out of scope for 176A |
| Idle Session Expiry | Real (`SessionManager.touchSession()` / `checkIdleTimeouts()`, 10-minute window) | Reused — unblocked by this milestone |
| Remote Sign-out | Real (`SessionManager.forceLogout()` / `logoutAllDevices()`) | Reused — unblocked by this milestone |

No new security capability was implemented or is implied by this table —
it is a verification record only, informing the future Security Milestone.

---

## Gate 2 — Implementation

**Scope discipline:** no new security features. Every change below is a
reconciliation of existing, already-real code to its intended wiring —
nothing new was designed or invented.

**Files modified:**

1. **`core/modules/identity/auth-coordinator.js`**
   Removed the `bindCompatAliases()` IIFE block in its entirety (the
   block that aliased `SessionManager`/`TrustedDeviceManager` to the
   wrong objects). Replaced with a comment explaining why: both
   dependencies now have real, canonical, loaded implementations on this
   page, so a same-page guessing fallback is obsolete. Removing the
   alias — rather than only reordering scripts around it — closes the
   conflict permanently regardless of any future script-order change.
   No other code in this file was touched. `COORDINATOR_VERSION` and the
   file's own version-conflict guard are unchanged.

2. **`dashboard.html`**
   Added one `<script src="core/security/session-manager.js">` tag,
   placed immediately after the existing
   `core/security/trusted-device-manager.js` tag (logical grouping with
   its sibling security primitives; its only hard dependency,
   `IdentityEngine`, is loaded much earlier at line 383). No existing
   tag was removed, reordered, or edited.

**Files created:** None yet (this document and the Migration Log entry
are created after Gate 3 verification, below).

**Files archived:** None.

**Ownership changes:** None. `window.CozyOS.SessionManager` now
correctly resolves to its always-intended owner,
`core/security/session-manager.js`. `window.CozyOS.TrustedDeviceManager`
now correctly resolves to its always-intended owner,
`core/security/trusted-device-manager.js`. No new globals introduced.

**Public API changes:** None. No new methods were added anywhere. This
milestone restores existing, already-documented APIs to reachability —
it does not extend them.

---

## Gate 3 — Verification

| Level | Evidence |
|---|---|
| Repository Verified | Gate 1 conflict trace (above) confirmed directly against source; post-fix `python3` sweep of all 153 `<script src>` tags in `dashboard.html` confirmed 0 missing files |
| Static Verified | `node --check core/modules/identity/auth-coordinator.js` passed |
| Runtime Verified | See below — real, unmocked files exercised in a Node harness, not stand-ins |
| Browser Runtime Verified | NOT VERIFIED — no browser available in this environment |

**Runtime Verified — detail (real files, not mocks):**

A Node harness loaded the actual repository files — `identity-engine.js`,
`admin-recovery-policy.js`, `cozy-auth.js`, `cozy-session-service.js`,
the patched `identity/auth-coordinator.js`, `factor-provider-base.js`,
`auth-factor-registry.js`, `otp-provider.js`, `auth-policy-engine.js`,
`recovery-phrase-manager.js`, `recovery-question-manager.js`,
`trusted-device-manager.js`, the newly-wired `session-manager.js`,
`recovery-key-manager.js`, `emergency-recovery-code-manager.js`,
`webauthn-provider.js`, and `security/auth-coordinator.js` — in the
exact order now present in `dashboard.html`, against a minimal
`window`/`document`/`navigator`/`crypto`/`localStorage` shim.

Confirmed:
- `CozyOS.SessionManager.getVersion()` → `"1.0.0-ENTERPRISE"` (the real
  module's version, not the session-snapshot service's).
- `CozyOS.TrustedDeviceManager.getVersion()` → `"1.0.0-ENTERPRISE"` (the
  real module's version, not the stub's `"0.0.1-STUB"`).
- `CozyOS.SessionManager !== CozyOS.Session` and
  `CozyOS.TrustedDeviceManager !== CozyOS.AdminRecoveryPolicy` — the
  incorrect aliasing is gone.
- An end-to-end real login (`IdentityEngine.createUser()` →
  `AuthorizationCoordinator.login({ rememberDevice: true })`) produced a
  genuine registered device (`deviceRegistered: true`, a real device
  object from `TrustedDeviceManager.registerDevice()`), and
  `SessionManager.getSessionBinding(sessionId)` returned genuine tracked
  session data.
- `AuthorizationCoordinator.authorize({ policy, context })` completed
  successfully (`authorized: true`) reaching the real objects throughout.
- A second harness run **omitting** `session-manager.js` and
  `trusted-device-manager.js` entirely confirmed graceful degradation:
  `login()`/`authorize()` still complete without crashing
  (`deviceRegistered: false`, idle/binding checks simply skipped) — the
  removal of the alias did not introduce a hard dependency; it removed a
  false one.

---

## Gate 4 — Known Limitations

- Browser Runtime Verified is not available in this environment (no
  browser). The Node harness exercised the real files against a
  hand-built minimal browser shim (`window`, `document`, `navigator`,
  `crypto` via Node's `webcrypto`, `localStorage`) — this is not a
  substitute for real script-tag load order, DOM lifecycle, or Worker/
  Canvas/WASM behavior in an actual browser.
- This milestone deliberately made no functional change to
  `SessionManager`'s or `TrustedDeviceManager`'s own internal logic —
  only to what they are correctly bound to. Any pre-existing limitation
  documented in either file's own header (e.g. the device fingerprint's
  honestly-disclosed non-tamper-proof nature) is unchanged and still
  applies.
- PIN, as a trust method, remains genuinely unimplemented anywhere in
  the repository — confirmed in the ownership table above, not addressed
  by this milestone.
- Fingerprint/Face Unlock remain registered factor *names* with `isReal:
  false` stub providers — unchanged by this milestone.

---

## Gate 5 — Continuation State

**Canonical owners (corrected by this milestone):**
- `SessionManager` — `core/security/session-manager.js` — now actually
  reachable at `window.CozyOS.SessionManager`
- `TrustedDeviceManager` — `core/security/trusted-device-manager.js` —
  now actually reachable at `window.CozyOS.TrustedDeviceManager`

**Canonical owners (unchanged):** `IdentityEngine`, `CozyOS.Auth`,
`CozyOS.Session`, `AuthCoordinator`, `AuthorizationCoordinator`,
`PlatformAudit`, `AdminWorkspace`, `AdminRecoveryPolicy` (still a stub —
unchanged, out of scope for 176A).

**Active integrations confirmed working:** `AuthorizationCoordinator.login()`
→ real `TrustedDeviceManager.registerDevice()`; `AuthorizationCoordinator.authorize()`
→ real `SessionManager.getSessionBinding()` / `checkIdleTimeouts()` /
`touchSession()`.

**Outstanding blockers for 176B (Session Workspace):** None — 176A's
fix is exactly the precondition 176B needs (a facade may now safely
delegate to the real `SessionManager` and `TrustedDeviceManager`).

**Outstanding blockers for the future Security Milestone:** None from
this milestone. That milestone should still perform its own Gate 1
against `AdminRecoveryPolicy` (the stub) before implementation, per the
trust-method table above.

**Repository health:** 0 ownership conflicts (the one found in Gate 1 is
resolved), 0 broken script paths (153/153 resolve).

---

## Certification

```
Repository Verified
Static Verified
Runtime Verified
Browser Runtime Verified   NOT VERIFIED
Certified
```
