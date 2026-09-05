# Milestone 176 — Gate 1 — Repository Verification

**Outcome: B — Conflict found. Implementation halted. No code modified.**

Per `Engineering-Governance-v1.0.md`, this is a successful Gate 1 outcome
— stopping here is correct, not a failed milestone. Findings below,
scope decision requested at the end.

---

## 1. Ownership Review

Repository-wide search performed for every term listed in the milestone
brief (`session`, `session-manager`, `session-engine`, `session-service`,
`trusted-device`, `device`, `remember-device`, `device-trust`,
`device-manager`, `device-registry`, `security-session`, `login-session`,
`refresh-token`, `token`, plus `SessionCoordinator` explicitly).

**Files found and their real role (read, not assumed):**

| File | Registers | Role |
|---|---|---|
| `core/modules/session/cozy-session-service.js` | `window.CozyOS.Session` | Canonical owner of the *current live session snapshot* — who is signed in right now (uid, roles, company ref). States in its own header what it does not own (auth mechanics, external providers, company data). |
| `core/modules/session/firebase-session-bridge.js` | (none — calls into `Session`) | Optional bridge translating Firebase `onAuthStateChanged` into `Session`'s `establishFromExternalAuth()`/`end()`. Not a competing owner. |
| `core/security/session-manager.js` | `window.CozyOS.SessionManager` | States its own scope explicitly in-file: idle-timeout tracking, trusted-device session binding, and admin-facing bulk operations (`forceLogout()`, `logoutAllDevices()`). Explicitly documents that it does **not** own session creation/ending/renewal/listing/validation — that remains `IdentityEngine`'s. Not a duplicate of `IdentityEngine` or of `Session`. |
| `core/security/trusted-device-manager.js` | `window.CozyOS.TrustedDeviceManager` | Canonical, fully-built device registration/trust/lifecycle owner (30-day trust window, 10-minute inactivity lock, fingerprinting, history). Not a stub. |
| `core/modules/identity/admin-recovery-policy.js` | `window.CozyOS.AdminRecoveryPolicy` | Explicitly self-declared minimal stub (`AdminRecoveryPolicyStub`, `implemented = false`, `getVersion() → "0.0.1-STUB"`). Fails closed on every method. Governs *trusted-device + biometric admin recovery login*, not general session/device management. |
| `core/modules/identity/auth-coordinator.js` | `window.CozyOS.AuthCoordinator` | Login-orchestration coordinator (distinct global from `AuthorizationCoordinator`). Contains a "compatibility alias" block — see Section 4, this is the source of the conflict. |

No `SessionCoordinator`, `session-engine`, `remember-device`,
`device-trust`-named-file, `device-registry`, `security-session`,
`login-session`, `refresh-token`, or `token` (application-logic) file
exists anywhere in the repository. `device-trust` appears only as a
substring inside comments/identifiers in `auth-coordinator.js`,
`auth-factor-registry.js`, and `trusted-device-manager.js` — not as a
separate competing file.

**No duplicate, archived, or abandoned session/device implementations
were found.** Exactly one real file backs each of `Session`,
`SessionManager`, and `TrustedDeviceManager`.

---

## 2. Dependency Review

| Dependency | Present in repo | Loaded by `dashboard.html`? |
|---|---|---|
| `IdentityEngine` | Yes | Yes |
| `CozyOS.Auth` | Yes | Yes |
| `AuthorizationCoordinator` | Yes | Yes |
| `AdminWorkspace` | Yes (this conversation's 175B) | Yes |
| Authenticator (`core/modules/Cozy-Authenticator/authenticator.js`) | Yes | Yes (`defer`) |
| OTP (`core/security/otp-provider.js`) | Yes | Yes |
| `TrustedDeviceManager` | Yes | Yes, **but see Section 4 — registration is defeated at runtime** |
| `SessionManager` | Yes (`core/security/session-manager.js`) | **No — not referenced anywhere in `dashboard.html`** |
| `PlatformAudit` | Yes | Yes |
| Policy engines (`AuthPolicyEngine`, `PolicyEngine`, `PolicyDecisionEngine`) | Yes | `AuthPolicyEngine` yes; `PolicyEngine`/`PolicyDecisionEngine` no (confirmed out of scope in Milestone 175B, unchanged) |
| Developer Access | Yes | No (confirmed out of scope in Milestone 175B, unchanged) |

`core/security/auth-coordinator.js` (`AuthorizationCoordinator`) is a
real, live consumer of both `window.CozyOS.SessionManager` (line 152,
expects `.getSessionBinding()`, `.checkIdleTimeouts()`,
`.touchSession()`) and `window.CozyOS.TrustedDeviceManager` (line 243,
expects `.registerDevice()` / device lookups in `login()`). These are not
hypothetical — they are exercised on every real authorize/login call.

---

## 3. Runtime Review — Conflict Traced Through Actual Script Order

`dashboard.html` load order (relevant excerpt, line numbers from the
current baseline):

```
388  core/modules/identity/admin-recovery-policy.js   → window.CozyOS.AdminRecoveryPolicy (stub, getVersion() = "0.0.1-STUB")
398  core/modules/session/cozy-session-service.js      → window.CozyOS.Session
403  core/modules/identity/auth-coordinator.js         → window.CozyOS.AuthCoordinator
                                                          + runs an IIFE "compat alias" block immediately on load
443  core/security/trusted-device-manager.js           → attempts window.CozyOS.TrustedDeviceManager
451  core/security/auth-coordinator.js                 → window.CozyOS.AuthorizationCoordinator
```

`core/security/session-manager.js` does **not appear in `dashboard.html`
at all** — confirmed by direct `grep`, zero matches.

**The compat-alias block, read verbatim from
`core/modules/identity/auth-coordinator.js` (lines ~318–330):**

```js
(function bindCompatAliases() {
    function attempt() {
        let bound = false;
        if (!window.CozyOS.SessionManager && window.CozyOS.Session) { window.CozyOS.SessionManager = window.CozyOS.Session; bound = true; }
        if (!window.CozyOS.TrustedDeviceManager && window.CozyOS.AdminRecoveryPolicy) { window.CozyOS.TrustedDeviceManager = window.CozyOS.AdminRecoveryPolicy; bound = true; }
        return !!(window.CozyOS.SessionManager && window.CozyOS.TrustedDeviceManager);
    }
    if (attempt()) return;
    ...
})();
```

**Traced step by step against the real load order above:**

1. At line 388, `window.CozyOS.AdminRecoveryPolicy` (the stub) is set.
2. At line 398, `window.CozyOS.Session` is set.
3. At line 403, `auth-coordinator.js` loads and immediately runs
   `bindCompatAliases()`. At this point `window.CozyOS.SessionManager`
   is not yet set (the real file hasn't loaded — and never will, per
   Section 2) and `window.CozyOS.Session` exists, so
   `window.CozyOS.SessionManager` is aliased to `window.CozyOS.Session`.
   Likewise `window.CozyOS.TrustedDeviceManager` is not yet set (the
   real file loads later, at 443) and `window.CozyOS.AdminRecoveryPolicy`
   exists, so `window.CozyOS.TrustedDeviceManager` is aliased to the
   **stub**. Both conditions are now true, `attempt()` returns `true`,
   and the retry interval never starts.
4. At line 443, the real `trusted-device-manager.js` loads and runs its
   own registration guard:
   ```js
   if (window.CozyOS.TrustedDeviceManager && typeof window.CozyOS.TrustedDeviceManager.getVersion === "function") {
       const existingVersion = window.CozyOS.TrustedDeviceManager.getVersion();
       if (existingVersion !== TRUSTED_DEVICE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: TrustedDeviceManager existing v${existingVersion} conflicts with load target v${TRUSTED_DEVICE_VERSION}.`);
   }
   ```
   `window.CozyOS.TrustedDeviceManager` is currently the stub, whose
   `getVersion()` returns `"0.0.1-STUB"` — which does not equal
   `TRUSTED_DEVICE_VERSION` (`"1.0.0-ENTERPRISE"`). **This throws.** The
   real `CozyTrustedDeviceManager` is never constructed, and
   `window.CozyOS.TrustedDeviceManager` remains the stub for the rest of
   the page's life.

**Verified real-world consequences (both confirmed by reading the
consuming code, not assumed):**

- `AuthorizationCoordinator.login()` calls
  `window.CozyOS.TrustedDeviceManager.registerDevice()` /
  `.generateFingerprint()` when `rememberDevice` is requested. Against
  the stub, neither method exists (`typeof tdm.registerDevice ===
  "function"` is `false`), so the real device-registration branch is
  silently skipped — `rememberDevice` requests never actually register a
  device, with no error surfaced to the caller.
- `AuthorizationCoordinator.authorize()` calls
  `window.CozyOS.SessionManager.getSessionBinding()` /
  `.checkIdleTimeouts()` / `.touchSession()`. Against the alias (which is
  actually `window.CozyOS.Session`, the session-snapshot service — a
  different real file with a different real API), none of those methods
  exist, so the entire idle-lock / device-binding check inside
  `authorize()` is silently skipped on every call.
- The real `core/security/session-manager.js` — with the actual idle-timeout
  and bulk-logout logic the milestone brief asks to build on — never
  loads at all, so none of its real capabilities are reachable through
  `window.CozyOS.SessionManager` today regardless of the alias bug.

This is not a hypothetical or theoretical risk — it is a traceable,
already-present runtime defect in the locked baseline, independent of
anything Milestone 176 would add.

---

## 4. Conflict Report

**Confirmed ownership/functional conflict — Outcome B.**

- `window.CozyOS.SessionManager` does not resolve to its real,
  documented owner (`core/security/session-manager.js`) at runtime. It
  resolves to `window.CozyOS.Session`, a different real file with a
  different real API, via an unconditional compatibility alias in
  `core/modules/identity/auth-coordinator.js`. The real
  `session-manager.js` is not loaded by `dashboard.html` at all.
- `window.CozyOS.TrustedDeviceManager` does not resolve to its real,
  fully-built owner (`core/security/trusted-device-manager.js`) at
  runtime. The same compatibility alias binds it to
  `window.CozyOS.AdminRecoveryPolicy` (an explicitly-declared stub)
  before the real file loads; the real file's own version guard then
  throws on load, permanently preventing the real
  `CozyTrustedDeviceManager` from ever registering.
- `AuthorizationCoordinator`, an already-certified canonical owner, is a
  live consumer of both globals and is silently degraded by this — not a
  new problem Milestone 176 would create, but one it would inherit and
  build on top of if implementation proceeded now.

Per governance and per this milestone's explicit instruction — **"If
Gate 1 finds ownership or functional conflicts, STOP. Do not write code.
Wait for a scope decision before proceeding."** — implementation is
halted here. No files have been modified under Milestone 176.

---

## Scope Decision Requested

This conflict sits upstream of everything Milestone 176 was scoped to
build — a `SessionWorkspace` facade delegating to `SessionManager` and
`TrustedDeviceManager` would be delegating to a broken alias and a
never-loaded file. Three options, for you to choose from (not decided
here):

1. **Split the work, mirroring 175A/175B:** a narrow Milestone 176A —
   *Session & Trusted Device Ownership Reconciliation* — that (a) adds
   the missing `<script src="core/security/session-manager.js">` tag to
   `dashboard.html` in the correct dependency position, and (b) removes
   or corrects the compat-alias block in
   `core/modules/identity/auth-coordinator.js` so `SessionManager` and
   `TrustedDeviceManager` resolve to their real files — before any
   facade work begins.
2. **Fold the reconciliation into this same Milestone 176** as an
   explicit Gate 2 sub-step, documented as a conflict-resolution action
   rather than new capability, then continue into the `SessionWorkspace`
   facade in the same milestone.
3. **Stop at Gate 1 only for now** and take the finding under
   advisement without authorizing any repository change yet.

No code will be modified until you choose.
