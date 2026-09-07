# Domain 3 — Trusted Device / Local-Admin Authority Fix — Checkpoint Report

## Security invariant established
In the server-backed deployment (the only declared deployment CozyOS
has), local-only evidence — a client-side `IdentityEngine.isPlatformAdmin()`
check, `TrustedDeviceManager`'s admittedly-spoofable browser fingerprint,
and/or the legacy client-only WebAuthnProvider — **must never** produce a
`platform-admin`-shaped session via `Session.establishFromExternalAuth()`.
The only real path to platform-admin authority remains
`GET /webauthn/session`, reached via the real server login paths
(password, passkey, TOTP).

## Exact behavior before
`AuthCoordinator.loginWithTrustedDevice()` and `loginWithBiometrics()`,
on a real local grant from `AdminRecoveryPolicy`, called:
```js
session.establishFromExternalAuth({ uid: userId, roles: ["platform-admin"], profile: {...} });
```
A second, previously-undiscovered instance of the same pattern existed in
`restoreSession()`'s admin-recovery-pointer branch (reload restoration),
re-granting `roles: ["platform-admin"]` from the same local evidence on
every page reload.

`admin-workspace.html` (which loads the vulnerable `cozy-login-gate.js`)
is not in `static-boundary-server.js`'s `ADMIN_CANONICAL_ROUTES` or
`FORBIDDEN_ADMIN_ALIASES` — it is reachable, unauthenticated, as a plain
static file in the real production deployment.

## Exact behavior after
Both login methods and the restore-path branch now call:
```js
session.establishFromExternalAuth({ uid: userId, roles: [], profile: { ..., serverVerified: false } });
```
The real local checks (role lookup, device-trust verification, biometric
verification, failure handling) are byte-for-byte unchanged and still
run and still gate the result. A real local grant still establishes a
signed-in, non-elevated external session (identity continuity
preserved) and returns `platformAdmin: false` explicitly. `cozy-workspace.js`'s
own, **unmodified** `#resolveCurrentUserRole()` already treats an
external session with an empty `roles` array as unresolvable (`return null`)
— confirmed by its own existing, untouched regression suite
(`workspace-shell-platform-admin-handoff.test.js`, 7/7 pass, including
the pre-existing case "external session without an admin/developer role
resolves to no role").

## Files changed
- `core/modules/identity/auth-coordinator.js` (`loginWithTrustedDevice()`,
  `loginWithBiometrics()`, and `restoreSession()`'s admin-recovery branch)
- 2 new test files (12 new tests total)

**Not modified, as required:** `core/shell/cozy-workspace.js`,
`server/webauthn-rp/rp.js`, `server.js`, `bootstrap-admin.js`,
`admin-recovery-policy.js`, `trusted-device-manager.js`,
`webauthn-provider.js`. No admin password/database record touched. No
recovery/biometric UI removed.

## Tests
| Suite | Result |
|---|---|
| New: trusted-device/biometric authority fix (login + restore) | 9/9 pass |
| New: real-Session-service integration | 3/3 pass |
| Existing: AuthCoordinator base/passkey/mfa-passkey/server-TOTP suites | 82/82 pass |
| Existing: login-gate server-auth-fix / admin-session-fix / enroll-biometric | 22/22 pass |
| Existing: admin-recovery-wizard enroll-biometric | 4/4 pass |
| Existing: `workspace-shell-platform-admin-handoff` (untouched file) | 7/7 pass |
| Existing: `identity-routing-real-composition` (WorkspaceShell handoff, untouched) | 5/5 pass |
| `core/security/test/*` (full) | 129/129 pass |
| Domain 1/2 security-panel suites (enrollment/factor-management, passkey/OTP) | 35/35 pass |

**0 FAIL, 0 SKIPPED, 0 BLOCKED.**

No `AdminRecoveryPolicy` test suite exists in the repository (confirmed
by search) — a pre-existing gap, not introduced or required to be closed
by this fix, since `admin-recovery-policy.js` itself was not modified.

## Final authority sweep
| Reference | Classification |
|---|---|
| `establishFromExternalAuth({..., roles: ["platform-admin"]})` in `loginWithTrustedDevice`/`loginWithBiometrics`/`restoreSession` | **Removed** — now `roles: []` in all three |
| Server password/passkey/TOTP → `/webauthn/session` → `AdminGateCore` → real `platform-admin` | A. Canonical, unaffected |
| `identity.createUser({..., roles: ["platform-admin"]})` (developer-hub.js, cozy-login-gate.js, cozy-workspace.js) | Separate, already-gated local-bootstrap mechanism (first-user-only or existing-local-admin-only) — creates a **local IdentityEngine record**, never calls `establishFromExternalAuth()`; out of scope for this specific finding |
| Remaining `roles:["platform-admin"]` text matches | Comments only (documenting the fix) |

**No remaining path where local-only trusted-device/biometric evidence manufactures platform-admin authority.**

## Remaining Trusted Device UI work (queued, not part of this fix)
The Security & Sign-in trusted-device display/revocation UI itself
(already partially built in `authentication-factor-management-panel.js`
from prior milestones — list/rename/remove) was not touched this
session; it remains queued as previously noted, and is unaffected by
this authority fix since it operates on `TrustedDeviceManager`'s own
device records, not on login/session authority.

## Domain 3 — AUTHORITY FIX: **COMPLETE**
