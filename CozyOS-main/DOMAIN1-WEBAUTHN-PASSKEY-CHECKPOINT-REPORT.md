# Domain 1 — WebAuthn/Passkey Authority — Checkpoint Report

## Canonical authority (resolved)
- **Server-authoritative:** `server/webauthn-rp/rp.js` + `server.js`
  (routes: `POST /webauthn/passkeys/enroll/begin|complete`,
  `POST /webauthn/authenticate/begin|complete`, etc.)
- **Legacy, client-only, must never be authoritative:**
  `core/security/webauthn-provider.js` (self-relying-party, no server
  round trip — kept, not deleted, for its remaining honest fallback role).

## Files changed this domain
- `core/modules/security/authentication-factor-management-panel.js`
  — `passkeyEnroll()` / `buildPasskeyCard()` now prefer
  `AuthCoordinator.registerServerPasskey()`.
- `core/shell/cozy-login-gate.js`
  — new shared `enrollBiometricCredential()`, exposed as
  `window.CozyOS.LoginGate.enrollBiometricCredential`; used by the
  post-login biometric-enrollment nudge.
- `core/shell/cozy-admin-recovery-wizard.js`
  — new-device biometric re-enrollment step now calls the shared
  `enrollBiometricCredential()` via `LoginGate`.
- 3 new regression test files (12 new tests total; none of these three
  production files had any enrollment-authority test coverage before).

## Fallback rule applied uniformly
1. Try `AuthCoordinator.registerServerPasskey()` if loaded.
2. `available === true` → success, source: "server".
3. `available === false` with `requiresAuth === true` (no server session
   for this identity) → honest fallback to
   `WebAuthnProvider.registerCredential()`.
4. Any other failure (`webauthn_unavailable`, `user_cancelled`,
   `webauthn_ceremony_failed`, `server_unavailable`, an AuthError code,
   etc.) → relayed as a real failure, **no fallback** (prevents masking
   a real server-session failure with a fabricated client-only success).
5. Coordinator not loaded at all → honest degrade straight to legacy.
6. Neither available → honest failure, never a fabricated success.

## Test results
| Suite | Result |
|---|---|
| New: factor-management-panel passkey authority | 5/5 pass |
| New: login-gate enrollBiometricCredential | 7/7 pass |
| New: recovery-wizard enrollBiometricCredential | 4/4 pass |
| Existing: login-gate server-auth-fix / admin-session-fix | pass |
| Existing: authentication-enrollment-panel | 13/13 pass |
| Existing: auth-coordinator (server-passkey, mfa-passkey, base) | pass |
| Combined run (11 files) | 116/116 pass |
| core/security/test/* (full) | 129/129 pass |
| identity-routing-real-composition (WorkspaceShell handoff, untouched) | 5/5 pass |

**0 FAIL, 0 SKIPPED, 0 BLOCKED.**

## Untouched, per constraint
- `core/shell/cozy-workspace.js` (commit 223a9f4 handoff fix) — not modified.
- `server/webauthn-rp/rp.js`, `server.js` — not modified (no server defect found).
- Administrator password/database record — not modified.
- `core/security/webauthn-provider.js` — not deleted; still the legitimate
  fallback target for identities with no real server session.

## Disclosed, unresolved limitation (not fixed here, by design)
`cozy-admin-recovery-wizard.js` operates entirely against the local,
per-browser `IdentityEngine` and never establishes a real
`cozy_admin_session`. It therefore cannot recover the real production
administrator account (`chalzowuor516@gmail.com`), which exists only in
`server/webauthn-rp`'s database. This fix makes the wizard correctly
*prefer* the server path the moment that gap is closed, but closing the
gap itself is a separate, deliberate architecture decision — out of
scope for this WebAuthn call-site domain.

## Domain 1 status: COMPLETE
