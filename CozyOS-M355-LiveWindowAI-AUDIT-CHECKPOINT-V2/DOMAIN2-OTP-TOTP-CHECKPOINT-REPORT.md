# Domain 2 — OTP/TOTP Authority — Checkpoint Report

## Authority conclusion (unchanged from prior analysis, now implemented)
- **Canonical CozyOS-account MFA authority:** `server/webauthn-rp/totp.js`
  + `server.js` routes (`/auth/mfa/totp/enroll/begin|complete`,
  `/auth/mfa/totp/disable`, `/auth/mfa/verify`). Real, tested, and
  already the sole authority for login-time MFA before this domain
  started (`AuthCoordinator.completeServerLoginWithOtp()`).
- **`core/security/otp-provider.js` retained, dual role, not retired:**
  - Legitimate, unmodified: the engine behind the separate
    `core/modules/Cozy-Authenticator/authenticator.js` application,
    which manages TOTP codes for the user's *other* (third-party)
    accounts. Not touched this domain.
  - No longer used as the CozyOS-account MFA authority in either
    security panel — see below.
- **A third, pre-existing, legitimate local track** (not a bug, not
  touched): `core/modules/identity/identity-engine.js`'s
  `completeLoginWithOtp()` still verifies via `OtpProvider` for accounts
  authenticated through the purely local `IdentityEngine` track
  (`loginWithCredentials()`), the same parallel-track precedent Domain 1
  already established and left alone for WebAuthn. Distinct identity
  space from the server-tracked account; not a duplicate authority for
  the same account.

## What was built
1. **`AuthCoordinator`** (`core/modules/identity/auth-coordinator.js`):
   `beginServerTotpEnrollment()`, `completeServerTotpEnrollment(code)`,
   `disableServerTotp()` — real fetch calls to the three server routes,
   mirroring `registerServerPasskey()`'s contract and `requiresAuth`
   fallback signal exactly.
2. **Real two-step enrollment** in both live security panels
   (`authentication-enrollment-panel.js` and
   `authentication-factor-management-panel.js`):
   - `enroll` → `beginServerTotpEnrollment()` → secret/URI shown, factor
     held in an **in-memory-only** `pendingOtpEnrollments` map —
     **never** written to `AuthEnrollmentStore` at this point.
   - `confirm` (with the code) → `completeServerTotpEnrollment(code)` →
     **only** a real server success calls `AuthEnrollmentStore.enroll()`.
     A real rejection is relayed honestly; pending state is deliberately
     kept so the person can retry without a new secret.
   - `cancel-pending` → discards the pending secret, touches nothing else.
   - `remove` → for a server-sourced record, calls `disableServerTotp()`
     first; only a real server success removes the local record. A
     legacy-sourced record (enrolled via the `requiresAuth` fallback)
     removes via the legacy `OtpProvider.removeAccount()` path instead —
     never calls the server for an account it was never registered with.
3. **`requiresAuth` fallback** preserved exactly as Domain 1's rule: used
   only when the server reports no session exists for this identity;
   any other server failure is relayed, never masked by a fabricated
   legacy success.

## Files changed
- `core/modules/identity/auth-coordinator.js`
- `core/modules/security/authentication-enrollment-panel.js`
- `core/modules/security/authentication-factor-management-panel.js`
- 3 new test files (27 new tests total)

## Tests
| Suite | Result |
|---|---|
| New: AuthCoordinator server TOTP enrollment | 10/10 pass |
| New: enrollment-panel OTP server authority | 8/8 pass |
| New: factor-management-panel OTP server authority | 9/9 pass |
| Existing: enrollment-panel (base) | 13/13 pass |
| Existing: factor-management-panel passkey authority (Domain 1) | 5/5 pass |
| Combined re-run (5 files) | 45/45 pass |
| AuthCoordinator base/passkey/mfa-passkey suites | 93/93 pass |
| Server TOTP + MFA suites (`totp.test.js`, `mfa-pending-auth.test.js`, `mfa-webauthn-passkey.test.js`) | 30/30 pass |
| `core/security/test/*` (full) | 129/129 pass |
| `identity-routing-real-composition` (WorkspaceShell handoff, untouched) | 5/5 pass |

**0 FAIL, 0 SKIPPED, 0 BLOCKED.**

## Administrator / ordinary-user coverage
Both panels are admin-workspace surfaces today (per Domain 1's
established reachability finding — no ordinary-user Security UI exists
yet, unchanged this domain). The server routes and `AuthCoordinator`
methods are session-scoped, not admin-scoped, so the same tested code
path applies to any authenticated identity the moment an ordinary-user
Security & Sign-in surface is built — no server-side or coordinator-side
change will be needed then.

## Final authority sweep
| Reference | Classification |
|---|---|
| `server/webauthn-rp/totp.js` + server MFA routes | A. CozyOS account canonical path |
| `AuthCoordinator.{begin,complete}ServerTotpEnrollment/disableServerTotp` | A. CozyOS account canonical path |
| `authentication-enrollment-panel.js` / `authentication-factor-management-panel.js` OTP enroll/confirm/remove | A. CozyOS account canonical path (server-preferred) |
| Legacy `OtpProvider.enrollAccount/removeAccount` calls inside the above (fallback branches) | C. Explicit `requiresAuth` fallback |
| `core/modules/Cozy-Authenticator/authenticator.js` | B. Third-party-account path (untouched, legitimate) |
| `identity-engine.js` `completeLoginWithOtp()` | B-equivalent: legitimate local-account-track login check (pre-existing, same precedent as Domain 1's local track) |
| `living-risk-engine.js`, `living-security-coordinator.js`, `living-trust-engine.js`, `authentication-settings-module.js`, `admin-recovery-policy.js` | E. Documentation/status-dashboard read-only references, no verification authority |
| New test files | D. Test |

**No unexplained duplicate CozyOS-account MFA authority remains.**

## Domain 2 status: COMPLETE
