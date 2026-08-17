# Investigation: `core/modules/identity/cozy-identity.js` vs. the Live Identity Stack

**Method:** read-only. No files modified. Full inventory extracted from the
file itself; every "already implemented elsewhere" claim below is backed by
a method-name/behavior comparison against the actual live files, not
assumed from naming alone.

## 0. Structural fact that changes the whole investigation

This file does **not** register onto `window.CozyOS` at all. Its own
tail (`if (typeof module !== 'undefined')... else globalThis.CozyIdentity =
CozyIdentityModule`) exports to `globalThis.CozyIdentity` — outside the
`window.CozyOS.*` convention every other live coordinator in this
repository uses. Even if some HTML file loaded it tomorrow, nothing else
in CozyOS would find it without new glue code, because nothing calls
`globalThis.CozyIdentity.createCozyIdentity()` anywhere in the repo. It
is a self-contained **factory** (`createCozyIdentity(options)` → a fresh,
isolated instance with its own closure-scoped Maps) — never invoked, so
none of its ~2,100 lines of logic ever runs in this app today.

## 1. Complete inventory

- **Classes:** `CozyIdentityError` (extends `Error`), `InternalEventBus` (private pub/sub, used only internally by this file's own `on/once/off/emit`).
- **Constants/enums (18):** `IDENTITY_TYPES`, `IDENTITY_STATUSES`, `ORGANIZATION_TYPES`, `MEMBERSHIP_STATUSES`, `AUTH_METHODS`, `IDENTITY_PROVIDERS`, `DEVICE_TYPES`, `DEVICE_TRUST_STATUSES`, `PERMISSIONS`, `ROLES`, `ACCESS_LEVELS`, `ACCESS_LEVEL_RANK`, `GROUP_TYPES`, `VISIBILITY_LEVELS`, `KNOWN_INTEGRATIONS`, `ERROR_CODES`, `METADATA`, `EVENT_TYPES` (36 named events).
- **State (all closure-private, in-memory only, never persisted):** identities, organizations, memberships (+ 2 lookup indexes), roles-by-identity, permissions-by-identity, access-level-by-identity, access-policies, devices (+ index), identity-sessions (+ index), groups (+ 2 indexes), privacy-prefs, consents, auth-adapters, plugins, integrations.
- **Public API surface (factory return, ~70 functions):** identity lifecycle, organizations, memberships, roles, permissions, access levels/policies, device trust, identity sessions, delegated authentication, groups, privacy/consent, plugin registry, integration registry, export/import/sync, event system, diagnostics.
- **Global export:** `globalThis.CozyIdentity` (Node `module.exports` fallback) — confirmed, not `window.CozyOS.*`.
- **Registrations:** none — it registers nothing with `ServiceRegistry`, `ModuleRegistry`, or any other live registry.

## 2. Classification against the live stack

| Capability group | Live equivalent | Classification | Evidence |
|---|---|---|---|
| Identity lifecycle (createIdentity/suspend/restore/archive/remove) | `IdentityEngine.createUser()` (real PBKDF2 hashing, Web Crypto) + disable/enable/lock/reactivate/suspend/delete/getUser/listUsers | **Superseded** | Live version does real password security; this file's `createIdentity()` explicitly rejects any secret-like field (`assertNoSecrets`) — a fundamentally different, unauthenticated-identity model that was never wired to actual login. |
| `mergeIdentities` | none found | **Unique, narrow** | No identity-merge capability exists live anywhere. Real code, but has never executed (module never instantiated). |
| Organizations / Memberships | `IdentityEngine`'s own Organization/Department API — but that API is *itself* marked **DEPRECATED** in its header, delegating to `core/modules/company/cozy-company.js` (Company Engine) as canonical owner | **Superseded (twice over)** | This file is a third, independent, never-wired implementation of a concept that already has one deprecated-but-delegating owner (IdentityEngine) and one canonical owner (Company Engine). |
| Roles / Permissions | `IdentityEngine`'s live resource-permission system (`checkResourcePermission`, `grantResourcePermission`, `delegateRole`, `grantTemporaryAccess`, 10 named role-check methods like `isPlatformAdmin`) | **Superseded** | Live version is richer (temporary access, delegation, resource-scoped grants) and actually gates real dashboard/feature behavior; this file's role/permission Maps are simple and unwired. |
| Access levels & policies (`setAccessLevel`, `createAccessPolicy`, `evaluateAccess`) | `core/security/auth-policy-engine.js` exists live, but governs a **different concern** — which auth *factors* (face/voice/trusted-device) are required per operation, not resource-visibility ranking | **Unique** | No live engine ranks resource visibility by `ACCESS_LEVEL_RANK`. Real, un-duplicated capability — but see §4 before treating "unique" as "should integrate." |
| Device trust | `core/security/trusted-device-manager.js` (live, wired): lock/expiry/biometric-flag/health/rename/replace | **Superseded** | Live version is materially more complete (handles lock state, trust expiration, per-device biometric enrollment) than this file's registerDevice/bind/unbind set. |
| Identity sessions | `IdentityEngine` + `cozy-session-service.js` — the actual login/session/"Remember Me" flow verified in M372 | **Superseded / duplicate** | This file's session Maps are a parallel concept that has never been wired to the real, verified-working session flow. |
| Auth adapters / `authenticate()` | `core/modules/identity/auth-coordinator.js` (`AuthCoordinator`, the real live login orchestrator) | **Dead/unreachable** | `authenticate()` here requires a registered `AUTH_METHODS`-keyed adapter — grep confirms zero calls to this file's `registerAuthAdapter()` anywhere in the repository. It cannot succeed even if invoked. |
| Groups (create/join/leave/list) | none found anywhere in the repo | **Unique** | Confirmed — no `window.CozyOS.Group(s)` engine exists. Real, un-duplicated. |
| Privacy / consent (`setPrivacyPreferences`, `recordConsent`, `getPublicProfile`) | none found — the only other "consent" hits in the repo (`cozy-vision.js`, `cozy-network-orchestrator.js`, `living-voice-style-engine.js`) are unrelated camera/mic/voice-session consent, not identity/GDPR-style consent | **Unique** | Confirmed by full-repo grep; genuinely un-duplicated. |
| Plugin registry (`registerPlugin` etc., bookkeeping-only) | `core/pluginManager.js` (real, live, crash-isolated business-plugin runtime) **and** `CozyStorage.registerPlugin/listPlugins/getPlugin` (a second, separate real plugin concept) | **Already implemented elsewhere** | This file's version is inert bookkeeping only — no execution, no isolation — and would be a *third* parallel plugin concept if ever wired in. |
| Integration registry | `CozyStorage.listIntegrations/isKnownIntegration` (real, live) | **Already implemented elsewhere** | Same shape of capability already exists and is connected to a real, running coordinator. |
| Export / import / sync | none identical, but `syncIdentity()` requires an `integrations`-registered adapter exposing `pushIdentity()` — zero such adapters registered anywhere | **Dead/unreachable** (code is real, not stubbed — just never callable) | Confirmed by grep: no registration call for any integration adapter targeting this file exists. |
| Event system (`on/once/off`, custom `EVENT_TYPES` taxonomy, `registerEventType` collision guard) | Every live coordinator implements its own local `on/emit`, same as this file; the *36-event frozen taxonomy + collision-guarded custom-event registration* pattern itself has no live sibling | **Superseded (bus) / noteworthy unique pattern (taxonomy)** | The bus itself duplicates the same `InternalEventBus` already flagged in the consolidation registry. The disciplined "one frozen enum + guarded extension" idea is not literally duplicated, but adopting it project-wide would be a much larger, separate change — not something to fold in as a side effect of this decision. |
| Diagnostics / health (`getDiagnostics`, `getHealth`) | identical pattern in every live coordinator | **Already implemented elsewhere** | Boilerplate parity, not a capability gap. |

## 3. Dependency trace

- **Does any live module reference it?** No. Full-repo grep for
  `cozy-identity` finds it named only inside two files' filename-pattern
  *blocklists* (`cozy-bugfixer.js`, `cozy-workspace.js`) and one honest
  disclosure comment in `core/ui/cozy-ui.js` ("no IdentityEngine/
  cozy-identity.js coordinator loaded"). One additional, telling data
  point: `core/identity/developer-profile.js` (a real, live, loaded file)
  states in its own header that user/trust identity "remains
  `core/modules/identity/` (CozyIdentity), an unrelated subsystem" —
  meaning some other part of this codebase's documentation still treats
  CozyIdentity as *the* intended identity subsystem, even though it was
  evidently superseded by IdentityEngine/AuthCoordinator/TrustedDeviceManager
  at some earlier, undocumented point. This is disclosed as a real
  inconsistency, not resolved here.
- **Does it reference live modules?** No. It has zero `window.CozyOS.*`
  reads or writes anywhere in its ~2,571 lines — fully self-contained.
- **Could removing it silently break future plans?** Unlikely for
  anything *currently* live (nothing calls it), but the `developer-profile.js`
  cross-reference above means removing it without updating that comment
  would leave a live file pointing at a subsystem that no longer exists —
  a small but real documentation-integrity risk, independent of the code
  itself.

## 4. Recommendation

**Archive — do not integrate wholesale, do not silently retire.**

- It fails the integration bar on every capability that overlaps the
  live stack (Identity/Org/Role/Device/Session/Auth) — all superseded by
  richer, already-wired implementations. Migrating any of those would
  introduce duplication, which the Anti-Duplication Directive forbids.
- The three genuinely unique groups — **Groups**, **Privacy/Consent**,
  and **Access-Level policy/ranking** — pass the "genuinely unique, not
  implemented elsewhere" test, but integration is not automatic from
  that alone. Per the stated rule, each would still need its own
  evaluation for whether it "improves the live architecture," preserves
  backward compatibility, and can be composed in without duplicating the
  Maps/patterns this file already has in isolation. That evaluation is
  a separate, scoped design decision — not a byproduct of this
  investigation.
- Recommended disposition: move to the same category as the orphaned
  Kernel layer — **inactive code awaiting an explicit decision**, not
  live, not deleted. If Groups/Privacy/Access-Level ranking are wanted
  later, they should be re-specified as new, intentionally-scoped
  engines that reuse this file's enums/shapes as a reference, rather
  than reactivating the whole factory as-is (which would silently bring
  back the superseded Organization/Role/Device/Session/Auth surfaces
  alongside the genuinely useful parts).
- Also flag for a human decision, independent of this file's fate: the
  stale cross-reference in `developer-profile.js` should eventually be
  corrected to name the real, current identity subsystem — not touched
  here, since it's a documentation edit outside this investigation's
  scope.

No code was changed to produce this report.
