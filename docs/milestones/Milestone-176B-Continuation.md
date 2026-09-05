# Milestone 176B — Session Workspace

**Project:** CozyOS Enterprise
**Milestone ID:** 176B
**Status:** Certified

> **Gate 0:** Baseline for this milestone — the repository state at the
> end of Milestone 176A in this conversation (originating upload
> `CozyOS-main-v1_3_1-M176A.zip`). 176A's status was confirmed
> Certified before this milestone began; no discrepancies were found
> between the uploaded repository and the certified 176A record. See
> `Milestone-176-Gate0.md` and `Milestone-176-Rule00.md` for the
> original Gate 0 / Rule 00 record carried forward from Milestone 176.

---

## Origin

Per the split decided during Milestone 176 (see
`Milestone-176A-Continuation.md`, "Origin"), 176B is the read-only
Session Workspace facade, deferred until 176A's runtime fix was
certified. 176A certified `SessionManager` and `TrustedDeviceManager`
as correctly reachable at `window.CozyOS.SessionManager` and
`window.CozyOS.TrustedDeviceManager` — the exact precondition this
milestone needed. Milestone numbering: 176C (Administrator Recovery
Policy) is reserved next, deferred until after this milestone.

---

## Gate 1 — Repository Verification

**Ownership Review**
- `core/modules/session/` exists but contains only
  `cozy-session-service.js` (owns `window.CozyOS.Session` — the live
  sign-in snapshot: uid/roles/company/permissions) and
  `firebase-session-bridge.js` (Firebase auth-state sync). Neither
  aggregates cross-module session data or claims a workspace/
  orchestration role.
- `window.CozyOS.SessionWorkspace` — confirmed unclaimed; no references
  anywhere in the repository before this milestone.
- No existing "workspace" implementation aggregates session
  functionality. `core/shell/cozy-workspace.js` is an unrelated shell
  module. `core/modules/admin/cozy-admin-workspace.js` (175B) covers
  identity/auth/audit only, not session/device aggregation.

**Dependency Review** — exact live public methods read directly from
source (none inferred):

| Owner | File | Global |
|---|---|---|
| SessionManager | `core/security/session-manager.js` | `window.CozyOS.SessionManager` |
| TrustedDeviceManager | `core/security/trusted-device-manager.js` | `window.CozyOS.TrustedDeviceManager` |
| IdentityEngine | `core/modules/identity/identity-engine.js` | `window.CozyOS.IdentityEngine` |
| AuthorizationCoordinator | `core/security/auth-coordinator.js` | `window.CozyOS.AuthorizationCoordinator` |
| PlatformAudit | `core/platform/audit-engine.js` | `window.CozyOS.PlatformAudit` |

Methods used by this milestone, confirmed present on each owner before
being called: `SessionManager.getHistory()`,
`.listActiveSessionsEnriched()`, `.getDiagnosticsReport()`;
`TrustedDeviceManager.listDevicesForUser()`, `.checkTrustExpirations()`,
`.getDiagnosticsReport()`; `IdentityEngine.listActiveSessions()`,
`.getDiagnosticsReport()`; `AuthorizationCoordinator.getAuditLog()`,
`.getDiagnosticsReport()`; `PlatformAudit.getFullAuditReport()`,
`.getDiagnosticsReport()`.

**Runtime Review**
- All five dependencies confirmed loaded by `dashboard.html`, in this
  order: `identity-engine.js` (383) → `identity/auth-coordinator.js`
  (403) → `trusted-device-manager.js` (443) → `session-manager.js`
  (454, the 176A fix) → `security/auth-coordinator.js`
  /AuthorizationCoordinator (462) → `audit-engine.js` (501).
- No load-order issues found after 176A. `bindCompatAliases()` confirmed
  absent from `core/modules/identity/auth-coordinator.js`.
- No orphaned session subsystem would conflict with the Workspace —
  `window.CozyOS.Session` (the identity snapshot service) is a distinct,
  unrelated responsibility and is not referenced by the new facade.

**Conflict Report:** None found. Gate 1 outcome: **Pass — additive
facade over verified runtime.**

---

## Gate 2 — Implementation

Created `core/modules/session/cozy-session-workspace.js`, registering
`window.CozyOS.SessionWorkspace` (v1.0.0-ENTERPRISE) as a read-only
orchestration layer. Methods:

- `getWorkspaceHealth()` — presence + relayed diagnostics for all five
  dependencies.
- `getSessionSummary(userId)` — merges `IdentityEngine.listActiveSessions()`,
  `SessionManager.listActiveSessionsEnriched()`, and
  `TrustedDeviceManager.listDevicesForUser()` under separated keys.
- `getActivityOverview({ limit })` — chronological merge of
  `SessionManager.getHistory()` and `AuthorizationCoordinator.getAuditLog()`,
  each entry tagged with its `source`; read-only display merge, not a
  new audit store.
- `getDeviceExpirationReport()` — straight passthrough to
  `TrustedDeviceManager.checkTrustExpirations()`.
- `getPlatformAuditReport()` — straight passthrough to
  `PlatformAudit.getFullAuditReport()`.
- `getDiagnosticsReport()` — the workspace's own module diagnostics
  (dependency presence only).

Owns no session state, no trusted-device state, no authentication or
authorization logic — every data-bearing method calls straight through
to one or more of the five verified owners and reshapes/merges their
already-real return values. Absent dependencies produce
`{ available: false, reason: "<Name> is not loaded." }` rather than
fabricated data.

Added one `<script src="core/modules/session/cozy-session-workspace.js">`
tag to `dashboard.html`, placed immediately after `audit-engine.js` (the
last-loaded of the five dependencies). No other file was modified.

---

## Gate 3 — Verification

- **Static Verified:** `node --check core/modules/session/cozy-session-workspace.js` — passed.
- **Repository Verified:** all script paths in `dashboard.html` resolve
  to real files — 153/153 pre-existing tags plus the 1 new tag, 154/154
  total. (See Discrepancy Note in `Migration-Log.md`: this milestone's
  own recount found 152 pre-existing tags, not 153 as recorded at 176A
  certification — noted honestly, not reconciled or explained away.)
- **Runtime Verified:** Node harness loaded the real, unmocked files —
  `identity-engine.js`, `identity/auth-coordinator.js`,
  `trusted-device-manager.js`, `session-manager.js`,
  `security/auth-coordinator.js`, `audit-engine.js`,
  `cozy-session-workspace.js` — in `dashboard.html`'s exact order.
  Confirmed all five dependencies and `SessionWorkspace` resolve to real
  instances. Confirmed `getWorkspaceHealth()`, `getSessionSummary()`,
  `getActivityOverview()`, and `getDeviceExpirationReport()` return real,
  correctly-shaped data pulled live from the dependencies (not
  fabricated). Separately confirmed graceful degradation: with all five
  dependencies absent, every method returns honest
  `{ available: false, reason: ... }` results with no thrown errors.
- **Browser Runtime Verified:** **Not Performed** — no browser available
  in this environment. The Node harness used a hand-built minimal shim
  (`window`, `document`, `navigator`, `crypto` via Node's `webcrypto`,
  `localStorage`) and is not a substitute for real script-tag load
  order, DOM lifecycle, or Worker/Canvas/WASM behavior in an actual
  browser.

---

## Gate 4 — Known Limitations

- This milestone made no functional change to any of the five
  dependencies — only read-only aggregation above them. Any
  pre-existing limitation documented in their own headers (e.g. device
  fingerprint's honestly-disclosed non-tamper-proof nature) is
  unchanged.
- `getSessionSummary()` and `getActivityOverview()` were verified with
  synthetic/empty data in the Node harness (no real signed-in user or
  session history existed in that context) — shapes and delegation
  paths are confirmed real; volume/scale behavior under real production
  session history is unverified here.
- Browser Runtime Verified remains outstanding, consistent with every
  prior milestone in this repository.

---

## Gate 5 — Continuation State

**Canonical owners (new, by this milestone):**
- `SessionWorkspace` — `core/modules/session/cozy-session-workspace.js`
  — reachable at `window.CozyOS.SessionWorkspace`. Owns nothing;
  read-only facade only.

**Canonical owners (unchanged):** `SessionManager`,
`TrustedDeviceManager`, `IdentityEngine`, `AuthorizationCoordinator`,
`PlatformAudit`, `CozyOS.Session` (identity snapshot service, distinct
from this facade), `AdminWorkspace`, `AdminRecoveryPolicy` (still a
stub — untouched, out of scope for this milestone).

**Active integrations confirmed working:**
`SessionWorkspace.getSessionSummary()` → real
`IdentityEngine.listActiveSessions()` / `SessionManager.listActiveSessionsEnriched()`
/ `TrustedDeviceManager.listDevicesForUser()`;
`SessionWorkspace.getActivityOverview()` → real
`SessionManager.getHistory()` / `AuthorizationCoordinator.getAuditLog()`.

**Outstanding blockers for 176C (Administrator Recovery Policy):** None
from this milestone. 176C should still perform its own Gate 1 against
`AdminRecoveryPolicy` (the stub) before implementation, per the
trust-method ownership table produced during Milestone 176.

**Repository health:** 0 ownership conflicts, 0 broken script paths
(154/154 resolve).

---

## Certification

```
Repository Verified
Static Verified
Runtime Verified
Browser Runtime Verified   NOT VERIFIED
Certified
```
