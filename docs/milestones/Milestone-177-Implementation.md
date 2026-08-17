# Milestone 177 — Gate 2 — Implementation

**Scope (per Gate 1A):** Extend the existing `AuthorizationCoordinator`
(`core/security/auth-coordinator.js`) in place. No new file. No new
global. `AuthFactorRegistry` remains the sole owner of factor data.

## Changes made

**File:** `core/security/auth-coordinator.js`

1. **Version bump:** `AUTH_COORDINATOR_VERSION` `"1.0.0-ENTERPRISE"` →
   `"1.1.0-ENTERPRISE"`, with an inline comment recording the milestone
   and the two added methods — the same convention already used
   elsewhere in this repository (e.g.
   `core/modules/identity/auth-coordinator.js`'s
   `// Milestone 125a: rememberMe, getLoginHistory, changePassword`).

2. **`getFactorInventory()`** — new method. Calls
   `window.CozyOS.AuthFactorRegistry.listFactors()` and returns its real
   result unchanged (`{ available: true, factors: [...] }`). Returns
   `{ available: false, reason, factors: [] }` if the registry is not
   loaded. No factor data is computed, cached, or duplicated in this
   file — the registry's array is returned as-is.

3. **`getFactorHealthReport()`** — new method. Calls
   `window.CozyOS.AuthFactorRegistry.getDiagnosticsReport()` and spreads
   its real result (`totalFactors`, `realProviders`, `factors`) into the
   response. Returns `{ available: false, reason, totalFactors: 0,
   realProviders: 0, factors: [] }` if the registry is not loaded.

4. **`ServiceRegistry` self-description updated** to disclose the two
   new passthrough methods, so the registered description continues to
   honestly match the file's real capabilities (unchanged discipline
   from every prior milestone in this repository).

## What was deliberately NOT changed

- `authenticate()`, `authorize()`, `login()`, `logout()`,
  `publishAuditReport()`, `getAuditLog()`, `getDiagnosticsReport()`,
  `getVersion()` — all untouched, same behavior, same signatures.
- `AuthFactorRegistry` itself — zero edits. It remains the single real
  source of truth for factor names, providers, and `isReal` status.
- No new global was created. No new file was created.
