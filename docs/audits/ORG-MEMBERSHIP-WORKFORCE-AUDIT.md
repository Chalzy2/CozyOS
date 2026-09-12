# CozyOS Core — Organization Membership & Workforce Audit
Read-only audit. Zero production files modified. Baseline checkpoint:
`CozyOS-main-MPESAOS-CAPABILITY-AUDIT-NO-CHANGE-STATICALLY-VERIFIED-CHECKPOINT.zip`
SHA-256: `89932ec42770a7be24c1c8a298fb71b3ced8db0a842113bada528f764d2d6141`

## 1. Existing authorities inventory

| Authority | File | Real scope today |
|---|---|---|
| IdentityEngine | `core/modules/identity/identity-engine.js` (1519 lines, v1.5.0) | Authentication, sessions, `checkPermission()`/`checkResourcePermission()` enforcement, `assignApplication(userId, appName)` (global, not org-scoped), `#coreApplications`. Each user record carries exactly **one** `orgId` field. Declares (Rule 25 header) that Organization/Department CRUD is **deprecated here** and canonically owned by CompanyEngine, with automatic delegation — a real, disclosed precedent for the exact pattern this milestone needs. |
| CompanyEngine | `core/modules/company/cozy-company.js` (1263 lines) | Canonical Organization/Branch/Department CRUD per IdentityEngine's own delegation contract. |
| OrganizationRegistry | `core/organization/organization-registry.js` (228 lines) | A **second, independent** Organization/Branch/Department CRUD store, with its own history log — does not delegate to or from CompanyEngine. Owns zero membership concept; only `createOrganization/createBranch/createDepartment` + rename/archive. |
| OrganizationRole | `core/organization/organization-role.js` (287 lines) | Declares roles (name, orgId, departmentId/branchId, applicationId, permissions[], restrictions[], capacity) and evaluates capability with deny-over-allow precedence. Permission strings validated against IdentityEngine's exact `resource:action` regex — no translation layer. **Single-occupant by design**: `assignedUserId` is one field, one user, per role position (explicitly documented architecture decision citing 5 real production consumers that would break if changed). |
| core/tenant.js | `core/tenant.js` (55 lines) | A **third**, independent `registerOrganization()` + `enforceTenantBoundary()`. Written in ES-module `import`/`export default` syntax with a trailing `module.exports.default` — this cannot execute as a plain browser `<script>` and is not loaded by any HTML file (`type="module"` or otherwise) anywhere in the tree. **Dead code**, referenced only in a code comment inside `entitlement-engine.js`. |
| EntitlementEngine | `core/modules/entitlement/entitlement-engine.js` (365 lines) | Merges BillingEngine plan truth + admin override into one explainable feature decision, keyed by an opaque `organizationId`. Explicitly documents it never creates/validates organizations and never grants roles — reads `checkPermission()`/`isPlatformAdmin()` from IdentityEngine only. This is the correct shape for the target's "entitlement" term in the authorization-context formula. |
| ModuleRegistry (Application Registry) | `core/modules/module-registry.js` | Canonical application catalog (id → path/theme/dashboard-type/permissions). Only `developer-hub`, `shopos`, `mpesaos` are genuinely registered today. `IdentityEngine.assignApplication()` takes a raw string `appName` and does **not** validate it against this registry — a real, disclosed integration gap. |
| PolicyEngine | `core/modules/policy/policy-engine.js` (221 lines) | Present; not yet audited for org-membership relevance beyond confirming it exists and is distinct from auth-policy-engine.js (a security-factor policy engine, different concern). |
| BillingEngine | `modules/billingEngine.js` | Per-tenant plan/subscription truth (`licensedModules[]`, `isFeatureLicensed()`), consumed read-only by EntitlementEngine. |
| Legacy dead cluster | `core/permissions.js`, `core/audit.js`, `core/storage.js`, `core/sync.js` | ESM-syntax files, never loaded by any HTML (`grep` across all `.html` files returns zero matches). Hardcode a single-role-per-session model (`Principal/Accountant/Teacher/Parent/Student`) from an early SchoolOS concept. Confirmed non-executing, non-authoritative — safe to disregard as a competing authority, but documented in the companion Dead Code audit. |

## 2. Answers to the 14 audit questions

1. **One identity, multiple organizations** — **MISSING.** `IdentityEngine`'s user record has one `orgId` field (`identity-engine.js:365,456,1034`). No membership table exists anywhere in the repo mapping `userId → [{orgId, role...}]`.
2. **Different roles per org for the same user** — **MISSING**, follows directly from #1. `OrganizationRole.assignUser(roleId, userId)` assigns one role *position* to one user, but nothing prevents or reconciles the same `userId` holding role positions in two different orgs today except that nothing links those facts together into one queryable membership.
3. **Organization membership** — **MISSING** as a first-class concept. `OrganizationRegistry`/`CompanyEngine` model Organizations/Branches/Departments; `OrganizationRole` models Positions; neither models "this user belongs to this org."
4. **Application membership inside an org** — **PARTIAL.** `IdentityEngine.assignApplication(userId, appName)` exists but is **global per user**, not `(userId, orgId, appName)` scoped. `organization-role.js`'s `applicationId` field on a role is the closer building block (a role is already scoped to one org + one application).
5. **Employee/worker invitations** — **MISSING.** Repo-wide search for invitation/invite logic finds only unrelated concepts (live video-call invites, certification, founder-story, login-gate copy). No invite-token, pending-membership, or accept/decline flow exists for organization membership.
6. **Custom organization roles** — **EXISTS**, real and solid. `OrganizationRole.createRole()` is genuinely free-text (no reserved names), with permissions/restrictions validated against IdentityEngine's live regex.
7. **Role responsibilities/functions** — **EXISTS.** `responsibilities` array field on every role record.
8. **Adding/removing employees** — **PARTIAL.** `assignUser`/`unassignUser` change who occupies a *position*, but there is no org-level "add this person to the org" step independent of a position, and no removal path that also revokes application access or session validity.
9. **Changing an employee's role** — **PARTIAL.** Achievable today via `unassignUser` on the old role + `assignUser` on the new one, as two separate calls with no atomic "change role" operation and no history entry that ties the two together as one transition.
10. **Organization-specific permissions** — **EXISTS** at the role layer (`organization-role.js` permissions/restrictions, application-scoped). **Not** propagated into `IdentityEngine.checkPermission()`, which only compares a single `user.orgId` to a passed-in `orgId` — it has no notion of per-org role-derived permissions at all.
11. **Organization isolation** — **PARTIAL / fragmented.** Three separate mechanisms touch isolation: `core/tenant.js`'s `enforceTenantBoundary()` (dead code, never loaded), `IdentityEngine.checkPermission({orgId})`'s single-field compare, and EntitlementEngine's opaque per-organizationId keying (real, but only for feature entitlement, not general data isolation).
12. **Admin visibility of workers scoped to their org** — **MISSING.** `IdentityEngine.listUsers()` (line 1247) is unconditionally global with no `orgId` filter parameter; there is no "organization admin" role distinct from platform admin, so nothing today can honestly present "workers in my org" without hand-filtering — and hand-filtering a single-`orgId` user record does not solve the multi-org case.
13. **EntitlementEngine integration** — **Ready to consume, not yet wired to membership.** EntitlementEngine's `organizationId`-opaque-key design was explicitly built to be membership-agnostic; once a canonical membership authority exists, EntitlementEngine needs zero internal change to start honoring org-scoped feature state per membership — it already asks IdentityEngine for the permission check, so IdentityEngine is the sole choke point that needs the new membership-aware `checkPermission` semantics.
14. **Audit/provenance** — **EXISTS and reusable.** `OrganizationRegistry`'s append-only `#history` + `recordExternalHistory()` public door (already consumed by `organization-role.js` for role events) is a proven, real, shared audit pattern. `IdentityEngine.#logAudit`/`getAuditLog()` is a second, separate audit log for identity/session events. Both are real; neither currently records organization-membership events, because that concept doesn't exist yet.

## 3. A–J determinations

**A. What already exists and is reusable** — `OrganizationRegistry`/`CompanyEngine` (org/branch/department structure), `OrganizationRole` (custom roles, permissions, responsibilities, capacity, deny-over-allow evaluation), `EntitlementEngine` (plan+override merge, already organizationId-scoped and membership-agnostic by design), `ModuleRegistry` (application catalog), and two independent, real audit/history mechanisms.

**B. What partially exists** — application assignment (`assignApplication`, global instead of org-scoped), add/remove/change-role workflows (achievable via two uncoordinated calls, no atomic membership transition or linked history entry), organization isolation (three fragmented, non-unified mechanisms, one of them dead code).

**C. What is genuinely missing** — a membership record type (`userId + orgId + role/position + status`), any invitation/accept flow, an org-scoped admin visibility API, and the single missing link that would let `checkPermission`/`checkResourcePermission` resolve per-organization rather than per-user-global.

**D. Which engine should own organization membership** — **Neither `OrganizationRegistry` nor `IdentityEngine` alone.** `OrganizationRegistry` owns *structure* (org/branch/department exist); `IdentityEngine` owns *identity* (who a user is, how they authenticate). Membership — the fact that identity X belongs to organization Y — is a distinct relationship that references both by id without duplicating either. The precedent for this shape already exists in this exact repo: `organization-role.js` references `OrganizationRegistry` ids "never duplicated," and records through `OrganizationRegistry.recordExternalHistory()` rather than keeping its own log. A new, thin `OrganizationMembership` authority following that identical precedent — referencing `OrganizationRegistry` org ids and `IdentityEngine` user ids by id only — is the honest fit, not an extension of either existing engine.

**E. Which engine should own application membership** — The same new membership authority, as a second table (`userId + orgId + applicationId + role`) or as a field on the same membership record, since `organization-role.js already` demonstrated `applicationId` belongs at the role/position level, not as a separate system. `ModuleRegistry` remains the read-only catalog of what applications exist; it should never own *who* has access.

**F. How custom organization roles compose with IdentityEngine without a second permission authority** — Unchanged from `organization-role.js`'s own documented design: roles declare permission strings in IdentityEngine's exact `resource:action` format, and `IdentityEngine.checkPermission`/`checkResourcePermission` remain the *only* real enforcement point. The missing piece is that `checkPermission` needs to become membership-aware — instead of comparing a single `user.orgId` to the caller's `orgId`, it needs to look up the user's *membership record* for that `orgId` and evaluate the role attached to that membership. This is additive to `checkPermission`'s existing signature (it already accepts `{orgId}`), not a redesign.

**G. Where invitations belong** — On the new `OrganizationMembership` authority, as a `status: "invited" | "active" | "removed"` field on the membership record itself (mirroring `OrganizationRole`'s own `status: "active"` field and vacancy pattern), not as a separate invitation engine. This avoids a second authority for what is really just a membership record that hasn't been accepted yet.

**H. How EntitlementEngine intersects with role permission** — No change needed to EntitlementEngine itself. It already treats `organizationId` as an opaque key and calls `IdentityEngine.checkPermission()`/`isPlatformAdmin()` rather than evaluating roles itself. Once `checkPermission` becomes membership-aware (F above), EntitlementEngine's existing calls automatically become correctly org-scoped with zero internal changes — this was evidently anticipated by whoever wrote EntitlementEngine's ownership-audit header.

**I. Org-scoped admin visibility without leakage** — A new, real `listMembersByOrganization(orgId)` on the membership authority (returning membership + role + responsibilities, never other-org data), and an equivalent `IdentityEngine.listUsers({orgId})` overload that filters through membership rather than the current unconditional global list — this closes the exact "James being Admin in Org C must not surface Org B" requirement, because visibility becomes a membership lookup keyed by the *requesting* org, never a whole-user dump.

**J. Exact minimal files that would need changing/adding** (for the next, not-yet-authorized implementation milestone):
- **New:** `core/organization/organization-membership.js` — the canonical membership authority (userId + orgId + role/position + applicationId + status), referencing `OrganizationRegistry` and `IdentityEngine` ids only, recording through `OrganizationRegistry.recordExternalHistory()`.
- **New:** `core/organization/tests/organization-membership.test.js`.
- **Additive change:** `core/modules/identity/identity-engine.js` — `checkPermission`/`checkResourcePermission` gain membership-aware resolution when an `orgId` is supplied and a membership record exists; `listUsers({orgId})` gains an optional org filter that delegates to the new membership authority. No removal of existing behavior — pure addition, matching the file's own Rule-25 delegation precedent.
- **No change needed:** `EntitlementEngine`, `OrganizationRole`, `OrganizationRegistry`/`CompanyEngine`, `ModuleRegistry` — all already shaped correctly to consume membership once it exists.

## 4. Duplicate/legacy authorities flagged (not to be extended)
- `core/organization/organization-registry.js` vs `core/modules/company/cozy-company.js` — both independently implement Organization/Branch/Department CRUD with no delegation between them. IdentityEngine's own Rule 25 already resolved this exact kind of conflict once (delegating to CompanyEngine); this second duplication was not resolved the same way. **Flagging, not fixing** — out of scope for this audit per instructions.
- `core/tenant.js` — a third, non-executing (dead) organization-registration authority. Do not extend; see companion Dead Code audit.
- `core/permissions.js` / `core/audit.js` / `core/storage.js` / `core/sync.js` — dead ESM cluster with a hardcoded single-role-per-session model. Confirmed unloaded by any HTML entry point. Not a live competing authority.

## 5. Tests run (baseline, read-only)
| Suite | Result |
|---|---|
| `core/organization/tests/organization-role-extension.test.js` | 20 passed, 0 failed |
| `core/organization/tests/organization-branding.test.js` | 27 passed, 0 failed |
| `core/modules/entitlement/tests/entitlement-engine.test.js` | 15 passed, 0 failed |
| `core/security/test/identity-engine.test.js` | 14 passed, 0 failed |
| **Total** | **76 passed, 0 failed** |

## 6. Tree integrity proof
Full-tree SHA-256 manifest taken immediately after extraction (1,442 files) and again after the complete audit pass: **byte-for-byte identical, zero diff.** No production file was created, modified, or deleted during this audit.

## 7. Proposed next implementation milestone (not started)
**CozyOS Core — Organization Membership Authority (Phase 1):** implement `core/organization/organization-membership.js` per §3.J above, with tests, then the additive `checkPermission`/`listUsers` extension to IdentityEngine in a follow-on phase — kept separate so IdentityEngine's 1519-line file and its 14 passing identity tests are touched only once real membership data exists to test against.

## 8. Certification level
**AUDIT-ONLY — STATICALLY VERIFIED, ZERO IMPLEMENTATION.** No code authorized or written. Findings are based on direct file reads and regex/grep verification of every claim above, not assumption.
