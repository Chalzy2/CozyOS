# Milestone 175B — Administration Workspace

**Project:** CozyOS Enterprise
**Milestone ID:** 175B
**Status:** Certified

> **Gate 0:** Baseline for this milestone — `CozyOS-main-v1_3_1-M175A.zip`,
> `CozyOS-main` repository, locked at the start of this conversation. All
> findings, ownership decisions, implementation, and certification below
> apply only to that baseline.

---

## Rule 00 — Repository Version

- Repository: CozyOS-main
- Version: v1.3.1-M175A (as named in the uploaded ZIP)
- Commit: Not available (ZIP upload, no VCS metadata in this baseline)
- Date: 2026-07-26
- Continuation Document ID: Milestone-175B-Continuation.md (this document)
- Repository Verification status: Verified — see Gate 1 below

---

## Origin

This milestone was originally proposed as "Admin Access & Enterprise
Authorization." Gate 1 re-verification against this baseline confirmed
the prior finding: that scope would duplicate existing canonical
ownership (identity, authentication, authorization, and audit are each
already owned). Scope was revised before implementation to an
orchestration/facade layer only — the Administration Workspace — which
delegates to the four already-canonical owners and introduces no new
security truth.

---

## Gate 1 — Repository Verification (re-run against this baseline)

All four previously-established conclusions were independently
re-checked against the uploaded `CozyOS-main-v1_3_1-M175A.zip` baseline
(not assumed carried over):

| Claim | Verification method | Result |
|---|---|---|
| `IdentityEngine` canonical at `core/modules/identity/identity-engine.js`, global `window.CozyOS.IdentityEngine` | `grep` for assignment site; confirmed loaded in `dashboard.html` | Confirmed |
| `CozyOS.Auth` canonical at `core/security/cozy-auth.js` | `grep` for assignment site; confirmed loaded in `dashboard.html` | Confirmed |
| `AuthorizationCoordinator` canonical at `core/security/auth-coordinator.js`, distinct from `core/modules/identity/auth-coordinator.js` (`window.CozyOS.AuthCoordinator`) | Read both files' headers and registration blocks; confirmed two distinct globals, no collision | Confirmed |
| `PlatformAudit` canonical at `core/platform/audit-engine.js` | `grep` for assignment site; confirmed loaded in `dashboard.html` | Confirmed |
| Developer Access not loaded by `dashboard.html` | `core/security/dev-access-service.js` exists; `grep` for its script tag in `dashboard.html` returned no match | Confirmed |
| `PolicyDecisionEngine` / `PolicyEngine` exist but not loaded | Files exist at `core/modules/policy/`; `grep` for their script tags in `dashboard.html` returned no match | Confirmed |
| Role enumeration does not exist | Repository-wide search for enumeration functions/constants found none | Confirmed |
| Permission enumeration does not exist | Same search as above | Confirmed |
| `core/modules/admin/` path is free | `ls` on the path — did not exist prior to this milestone's Gate 2 | Confirmed |

**Outcome:** A — Repository verified, no blockers. Gate 1 conclusions from
the prior conversation match this uploaded baseline exactly. Proceeded to
Gate 2 without repeating full historical investigation.

---

## Gate 2 — Implementation

**Files created:**
- `core/modules/admin/cozy-admin-workspace.js` — the Administration
  Workspace. Registers `window.CozyOS.AdminWorkspace`.
- `docs/milestones/Milestone-175B-Continuation.md` (this document)

**Files modified:**
- `dashboard.html` — one `<script src="core/modules/admin/cozy-admin-workspace.js">`
  tag added after `core/dashboard.js`, so all four dependencies
  (identity-engine.js, cozy-auth.js, core/security/auth-coordinator.js,
  platform/audit-engine.js — each loaded earlier in the file) are already
  registered before this facade loads. No existing tags reordered, edited,
  or removed.

**Files archived:** None.

**Ownership changes:** None to existing owners. One new global
introduced: `window.CozyOS.AdminWorkspace`, at the pre-verified-free path
`core/modules/admin/cozy-admin-workspace.js`.

**Public API — `window.CozyOS.AdminWorkspace`:**
- `getVersion()`
- `getWorkspaceHealth()` — presence + relayed diagnostics of the four
  dependencies
- `getPlatformSummary()` — merges `IdentityEngine.getDashboardSummary()`
  and `CozyOS.Auth.getCurrentAdministrator()` / `isSignedIn()` under
  separated keys; no new totals computed
- `getAdministrativeActivity({ limit })` — chronological merge of
  `IdentityEngine.getAuditLog()`, `CozyOS.Auth.getAuditLog()`, and
  `AuthorizationCoordinator.getAuditLog()`, each entry tagged with its
  original `source`; not persisted, not a new audit store
- `getPlatformAuditReport()` — passthrough to
  `PlatformAudit.getFullAuditReport()`
- `getDiagnosticsReport()` — this module's own diagnostics
  (dependency-presence booleans only)

Every data-bearing method delegates to one or more of the four verified
owners and reports `{ available: false, reason: "<Name> is not loaded." }`
for any owner that is absent, rather than fabricating data. No roles,
permissions, authentication, authorization, or audit logic is
implemented in this file.

---

## Gate 3 — Verification

| Level | Evidence |
|---|---|
| Repository Verified | Gate 1 re-verification table above; `python3` sweep of all 152 `<script src>` tags in `dashboard.html` confirmed 0 missing files after the edit |
| Static Verified | `node --check core/modules/admin/cozy-admin-workspace.js` passed |
| Runtime Verified | Node harness with mock `IdentityEngine` / `CozyOS.Auth` / `AuthorizationCoordinator` / `PlatformAudit` globals exercised all six public methods, including the version-conflict guard path and the all-dependencies-absent path (each dependency correctly reports `available: false` with a stated reason) |
| Browser Runtime Verified | NOT VERIFIED — no browser available in this environment |

---

## Gate 4 — Known Limitations

- Browser Runtime Verified is not available in this environment (no
  browser). Node-harness runtime verification does not imply browser
  script-load-order or DOM-lifecycle verification.
- `getAdministrativeActivity()` merges only the three dependencies that
  expose `getAuditLog()` (`IdentityEngine`, `CozyOS.Auth`,
  `AuthorizationCoordinator`). `PlatformAudit` exposes findings, not an
  audit-log stream, and is surfaced separately via
  `getPlatformAuditReport()`.
- No UI/HTML view was built for the workspace in this milestone — scope
  was the orchestration/facade module and its wiring into `dashboard.html`
  only, per the revised milestone scope stated at Gate 0.

---

## Gate 5 — Continuation State

**Canonical owners (unchanged by this milestone):**
- `IdentityEngine` — `core/modules/identity/identity-engine.js`
- `CozyOS.Auth` — `core/security/cozy-auth.js`
- `AuthorizationCoordinator` — `core/security/auth-coordinator.js`
- `PlatformAudit` — `core/platform/audit-engine.js`

**New canonical owner (this milestone):**
- `AdminWorkspace` — `core/modules/admin/cozy-admin-workspace.js` —
  orchestration/facade only, owns no security truth

**Active integrations:** `AdminWorkspace` reads from all four owners
above via their existing public methods; it registers with
`window.CozyOS.ServiceRegistry` if present (non-fatal if absent).

**Outstanding blockers:** None.

**Repository health:** 0 ownership conflicts, 0 broken script paths
(152/152 resolve) as of this baseline plus this milestone's changes.

---

## Certification

```
Repository Verified
Static Verified
Runtime Verified
Browser Runtime Verified   NOT VERIFIED
Certified
```
