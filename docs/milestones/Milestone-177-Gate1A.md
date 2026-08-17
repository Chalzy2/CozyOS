# Milestone 177 — Gate 1A — Capability Gap Verification

Scope re-set per your direction: not "does an orchestration layer
exist" (answered — yes, `AuthorizationCoordinator`), but "which
capabilities named in the milestone brief does it not yet provide."
Verified by reading `core/security/auth-coordinator.js` (309 lines, in
full) and `core/security/auth-factor-registry.js` in full — no
capability below is assumed from the file's comments alone; each is
checked against the actual method list.

---

## Capability table

| Requested capability | Already present? | Owner (real, existing) | Action |
|---|---|---|---|
| Factor orchestration (compose session + policy + factor results into one authorize/authenticate call) | **Yes** — `authorize({policy, context})` and `authenticate(operationName, context)` | `AuthorizationCoordinator` | Reuse |
| Factor audit trail (per-factor verified/failed history) | **Yes** — `getAuditLog()` returns the real log; `authenticate()` already emits `factor-verified`/`factor-failed` per factor name via `#emitReal` | `AuthorizationCoordinator` | Reuse |
| Coordinator-level diagnostics (module version, dependency presence) | **Yes** — `getDiagnosticsReport()` returns `moduleVersion`, `auditEntries`, and boolean presence of `CozyOS.Auth`/`AuthPolicyEngine`/`AuthFactorRegistry`/`IdentityEngine` | `AuthorizationCoordinator` | Reuse |
| Factor inventory (the full list of registered factor names, e.g. face/otp/webauthn/recovery-*, and which are real vs. stub) | **No** — this data exists only inside `AuthFactorRegistry.listFactors()`. `AuthorizationCoordinator` never calls `listFactors()` or exposes it. A caller wanting this list today must go around the facade and call `AuthFactorRegistry` directly — the exact anti-pattern the facade's own header says it exists to prevent. | `AuthFactorRegistry` (owns the real data; stays the owner) | **Extend** `AuthorizationCoordinator` with a thin passthrough only |
| Factor health / status summary (count of real vs. stub providers, per-factor notes) | **No** — this exists only inside `AuthFactorRegistry.getDiagnosticsReport()` (`totalFactors`, `realProviders`, `factors[]`). Not reachable through `AuthorizationCoordinator`. | `AuthFactorRegistry` | **Extend** `AuthorizationCoordinator` with a thin passthrough only |

## Conclusion

Two of the five requested capabilities (**factor inventory**, **factor
health/status summary**) are genuinely missing from the facade —
verified by reading the method list, not inferred. Both gaps are the
same shape: `AuthorizationCoordinator` doesn't expose data that
`AuthFactorRegistry` already owns and already computes correctly. The
fix is additive passthrough methods on `AuthorizationCoordinator` that
call `AuthFactorRegistry`'s existing real methods and return their real
result — no new factor logic, no new inventory, no new health
computation is written anywhere. `AuthFactorRegistry` remains the sole
owner of that data; `AuthorizationCoordinator` remains the sole
orchestration facade.

Nothing about "factor orchestration," "factor diagnostics" (at the
coordinator level), or "factor audit summary" needs any change — all
three are already real and already reachable through the existing
facade.

**Proceeding to Gate 2 with this narrowed scope only:**
- `getFactorInventory()` → delegates to `AuthFactorRegistry.listFactors()`
- `getFactorHealthReport()` → delegates to `AuthFactorRegistry.getDiagnosticsReport()`

Both fail closed with an honest `available: false` reason if
`AuthFactorRegistry` is not loaded. Neither method touches, wraps, or
re-derives factor verification logic.
