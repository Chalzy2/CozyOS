# PROMPT 4 — MIDDLE CHECKPOINT A
Organization-Role Extension (§5, §8, §11) — Implemented, Tested, Regression-Verified

This is a **middle checkpoint**, per PROMPT 4 §35. Security architecture
(§13–§34) is deliberately NOT attempted in this pass — see §7 below for why,
and §8 for exactly where the next session must start.

---

## 1. Source baseline

Built directly on the uploaded `COS-DASHBOARD-PROMPT3-MID-3.zip` (the
verified PROMPT 3 checkpoint — Checkpoint A / dashboard baseline). No other
baseline was assumed.

---

## 2. Phase 1 — Inspection performed before any code was written

Read directly (not assumed from filenames or memory):

- `core/organization/organization-registry.js` — real Organizations/
  Branches/Departments engine, zero hardcoding, fail-closed references,
  append-only history.
- `core/organization/organization-role.js` — real role engine: free-text
  names, `permissions[]` validated against the exact `resource:action`
  regex `IdentityEngine.grantResourcePermission()` already enforces,
  `reportsTo` hierarchy, single-occupant `assignedUserId`, vacant-position
  tracking, guarded archive.
- `core/organization/organization-hierarchy.js` — circular-reporting DFS
  (reused shape from `DependencyEngine`), vacant positions, tree builder.
- `core/organization/organization-branding.js` + its 27-test suite.
- `core/modules/identity/identity-engine.js` — confirmed
  `isPlatformAdmin()`/`grantResourcePermission()`/`checkResourcePermission()`
  are the real, separate platform-admin boundary this milestone must not
  blur.
- **Grepped the whole repo for every real consumer of `assignedUserId`**
  before touching the field. Found 5 real, already-shipped ChurchOS
  engines reading/writing it directly, each with its own passing test
  file: `church-live-moderation.js`, `church-live-moderation-controls.js`,
  `church-prayer-interaction.js`, `church-offering-interaction.js`,
  `church-attendance-geography.js`. Plus `organization-branding.js`
  (already covered by its own 27 tests).
- Confirmed no `restrictions`, `applicationId`, or capacity concept
  existed anywhere in the org engines (grep, not assumption).
- Confirmed no TOTP provider file, no QR-authentication flow, and no
  dedicated security-event/audit-log file exist anywhere in the repo
  (see §7).

---

## 3. Architecture decision, disclosed rather than silently picked

PROMPT 4 §11's own phrasing ("assign an 11th person") reads as a
multi-occupant role model. That would require turning the single
`assignedUserId` field into an array. **This was not done** — 5 real,
already-shipped, already-tested production engines read `assignedUserId`
as a single value, and the milestone's own "no dependency passing" /
"never silently replace existing behavior" rules forbid a redesign that
would break real, tested code for a documentation phrasing.

Capacity is instead enforced at the **position level**: `capacity` +
`capacityEnforced` limit how many concurrent, non-archived role *records*
may exist for the same `{orgId, applicationId, name}`. Since each record
still holds at most one person, this produces the exact requested
real-world outcome — never more than N simultaneous holders of a named
role — with zero risk to the 5 real consumers. Full reasoning is in the
`createRole()` doc comment in the changed file itself, not just this
report.

---

## 4. What was implemented (additive only)

`core/organization/organization-role.js`:

- `applicationId` (optional, free-text string) — a role can now be scoped
  to a specific application (`"ChurchOS"`, `"ShopOS"`, …) or left
  unscoped (`null`). Deliberately **not** validated against
  `ModuleRegistry`, because several real example applications this
  milestone names (ChurchOS, WholesaleOS, QuarryOS) are not yet
  registered there.
- `restrictions[]` — same validated `resource:action` string format as
  `permissions[]`.
- `capacity` (non-negative integer or `null`) / `capacityEnforced`
  (boolean, default `false`) — enforced at `createRole()` time, per §3.
- `evaluateCapability(roleId, capability)` — new method, the one real
  place deny/allow precedence is applied: explicit restriction > explicit
  permission > default deny. An archived role is always denied. Wildcard/
  prefix restriction matching is **not** implemented — disclosed
  limitation, not a silent gap.
- `listRoles()` gained an optional `applicationId` filter. Omitting it
  preserves the exact prior behavior (all applications) — confirmed by
  running every pre-existing consumer's test suite unchanged, see §5.

Nothing else in the file changed. `assignUser()`/`unassignUser()`/
`archiveRole()`/`listVacantRoles()` are byte-for-byte the same logic as
before.

`organization-registry.js`, `organization-hierarchy.js`,
`organization-branding.js`: **untouched** — SHA-256 confirmed identical
before/after (§6).

---

## 5. Tests

New file: `core/organization/tests/organization-role-extension.test.js`
— 20 real, executed tests:

- applicationId scope (4): declares it, defaults to null, same person
  holding two application-scoped roles in one org without authority
  bleeding between them, `listRoles({applicationId})` filtering/isolation.
- data-level admin-boundary check (1): a role object never carries an
  `isPlatformAdmin`/`isAdmin` field — that boundary stays IdentityEngine's
  alone.
- restrictions/precedence (7): valid restrictions accepted, malformed
  restriction rejected (same regex as permissions), allowed-by-permission,
  denied-by-default, **explicit conflict test** (same capability string
  in both `permissions` and `restrictions` — restriction wins), archived
  role denied regardless of permissions, unknown roleId denied not a
  crash.
- capacity (8): disabled capacity is unlimited even with a number set,
  capacity=0 enforced blocks the first position, capacity=1 blocks the
  second, capacity reached exactly (Nth succeeds/N+1th refused), a
  refused attempt doesn't silently increase the count, archive-then-create
  frees a slot, capacity is independently scoped per `applicationId`,
  negative/non-integer capacity rejected.

**Regression run, this session, real `node --test`/`node` execution — not
assumed:**

| Suite | Result |
|---|---|
| `organization-role-extension.test.js` (new) | 20/20 pass |
| `organization-branding.test.js` (pre-existing) | 27/27 pass |
| ChurchOS full suite (`core/modules/ChurchOS/test/*.test.js`, incl. all 5 real `assignedUserId` consumers) | 223/223 pass |
| Knowledge/language suites (Checkpoint A's own recorded baseline) | 9/9 pass |
| **Total** | **279/279 pass, 0 fail** |

---

## 6. Verification

- `node --check core/organization/organization-role.js` — syntax OK.
- SHA-256 before/after for `organization-registry.js`,
  `organization-hierarchy.js`, `organization-branding.js` — **identical**,
  confirming they were not touched.
- `core/modules/founder-story/*` and `core/shell/cozy-login-gate.js` —
  confirmed not modified (mtime check against pre-change baseline).
- Full-tree SHA-256 manifest of all 1203 files generated this session:
  `PROMPT4-MID-A-FULL-TREE-HASHES.txt` (included in this package). Diff
  against Checkpoint A's own manifest is a task for whoever merges this
  patch into the full CozyOS-main tree — this checkpoint is delivered as
  a **patch on top of the uploaded PROMPT-3-MID-3 zip**, not a re-baselined
  full CozyOS-main repo (no such full baseline was supplied this session).

---

## 7. Why Security (§13–§34) was NOT attempted this pass — honest scope call

Real inspection (not guesswork) found:

- **Real and reusable:** `core/security/auth-factor-registry.js`,
  `core/security/webauthn-provider.js` (passkey),
  `core/security/fingerprint-provider.js`,
  `core/security/google-account-provider.js`,
  `core/security/session-manager.js` (`CozySessionManager`),
  `core/modules/security/authentication-settings-module.js` (M357,
  already certified — the real 8-field status-card framework covering 15
  factors, honest stubs for fingerprint/face/voice, Microsoft Login
  correctly marked Not Implemented).
- **Genuinely missing, confirmed by grep across the whole repo:** no TOTP
  provider file at all; no QR-authentication challenge/approval flow
  (`qrScanner.js`/`qr-renderer.js` are unrelated — product scanning and a
  static renderer, not an auth protocol); no dedicated security-event/
  audit-log engine.

Building the full §13–§34 scope — real TOTP secret generation/
verification, a server-authoritative QR challenge protocol with replay/
expiry/cross-account protection, Google OAuth redirect+state/nonce
handling, voice-authentication enrollment respecting the existing
voice-safety architecture, session-revocation wiring, a security-event
log, re-authentication gating for sensitive actions, and a Settings >
Security UI screen — is multiple real, separately-certifiable milestones
by this project's own established pattern (M356 and M357 were each their
own certified milestone for a narrower slice of this same area). Attempting
all of it in one uninspected pass would violate this same prompt's own
§35 checkpoint discipline and §1 "no dependency passing" rule far more
than stopping here does.

---

## 8. NEXT BUILD MUST START WITH

1. Load this checkpoint's zip as the new baseline (patch already applied
   on top of PROMPT-3-MID-3).
2. Phase 1 inspection (read, don't assume) of:
   `core/security/auth-factor-registry.js`,
   `core/security/webauthn-provider.js`,
   `core/security/google-account-provider.js`,
   `core/security/session-manager.js`,
   `core/modules/security/authentication-settings-module.js`.
3. Build the smallest real missing dependency first: most likely the TOTP
   provider (no file exists yet), since Passkey/Google/Fingerprint already
   have real provider files to compose and TOTP is named first in §14's
   list.
4. Only after TOTP (or whichever is genuinely smallest) is implemented
   and tested: QR challenge/approval protocol, then the Settings >
   Security UI screen composing `authentication-settings-module.js`,
   then session-revocation + security-event log, then re-authentication
   gating, then the final regression/checkpoint sweep per §38–§39.
5. Do not redesign `organization-role.js`'s `assignedUserId` field. Do
   not create a second organization/role engine.

---

## IMPLEMENTATION: PASS (organization-role extension only) / security architecture INCOMPLETE (not started, scoped honestly in §7)

ORGANIZATION ROLES:
- application scope = IMPLEMENTED, tested (4 tests)
- permissions = pre-existing, unchanged
- restrictions = IMPLEMENTED, tested (7 tests incl. explicit conflict case)
- responsibilities = pre-existing, unchanged
- capacity = IMPLEMENTED at position level (disclosed architecture decision), tested (8 tests)
- role assignment = pre-existing, unchanged, regression-verified (223 ChurchOS tests)
- role revocation = pre-existing `unassignUser`/`archiveRole`, unchanged

SECURITY SETTINGS: not started this pass (see §7)

TESTS: new = 20, regression = 259 (27+223+9), total = 279, all pass

BROWSER: NOT VERIFIED
DEVICE: NOT VERIFIED
INTERNET: NOT VERIFIED

PROTECTED FILES: unchanged (confirmed)

MIDDLE CHECKPOINT: this document
FINAL CHECKPOINT: not reached — security architecture remains
