# Phase 3 — Authenticator → Identity → Organization → Authorization →
# Billing → Entitlement Integration — Change Report

Baseline: `CozyOS-Merged-0003-Phase2-BILLING-FOUNDATION-VERIFIED-FULL-CHECKPOINT.zip`
(`a56fd3e91e35fa2fcc857d46c99e69f39f528e99fc19f5a7ee12a391e3eb94b0`),
Phase 2 VERIFIED. No locked AI Core file was read, modified, or
referenced. No payment-provider work, renewal/expiry automation, or
B4.4 was started.

---

## Repository-wide discovery (Phase 1 of this round, re-run not assumed)

Confirmed: no duplicate authentication, identity, organization, or
billing engine exists anywhere in the repository. The Phase 2 map still
holds exactly. One new finding: `core/security/auth-policy-engine.js`,
`login-decision-engine.js`, `living-risk-engine.js` reference step-up/
reauthentication concepts but belong to the client-side security-module
family, not the real server authenticator — and `rp.js` itself has no
step-up/reauthentication mechanism. Documented, not built (per this
round's own instruction to document rather than invent when not
required by current architecture).

## File Revival Records (Phase 3)

**`modules/billingEngine.js`** — LEGACY / CLIENT-SIDE / UNTRUSTED.
Unchanged this round. Still not a financial authority.

**`core/modules/entitlement/entitlement-engine.js`** — REVIVE (preserved,
not replaced, not modified). New finding: its interface is synchronous;
`BillingRegistry`'s new entitlement method is necessarily async. Bridging
them is real, separate design work (either make this file's checks
async, or build a client cache layer) — explicitly deferred, not
attempted. Disposition: **LEAVE UNCHANGED this round.**

**`core/storage.js`** — unchanged. Placeholder-sync finding stands,
re-confirmed, not re-litigated with a fake fix.

**`core/security/auth-policy-engine.js` / `login-decision-engine.js` /
`living-risk-engine.js`** — new File Revival Records this round:
client-side security-module family, same as `entitlement-engine.js`'s
neighbors. Not the real server authenticator. Disposition: **LEAVE
UNCHANGED** — out of scope; no step-up auth work was authorized or
attempted.

**`server/webauthn-rp/rp.js` / `organizations.js` / `database-adapter.js`**
— EXISTING, AUTHORITATIVE, REUSED. Not modified. `BillingRegistry`
continues to call `OrganizationRegistry.isAuthorized()` and the same
`DatabaseAdapter` exactly as in Phase 2 — no duplication introduced.

---

## IMPLEMENTED

- `server/webauthn-rp/migrations/007_billing_plan_features.sql` —
  `subscription_plan_features(plan_id, feature_key, enabled)`, the
  missing dependency for real entitlement resolution.
- `server/webauthn-rp/db.js` — `migrateAddBillingPlanFeatures()`,
  SQLite mirror, verified table-creation-correct by direct inspection.
- `server/webauthn-rp/billing.js` — `setPlanFeatures()`, `getPlanFeatures()`,
  `getEntitlementSnapshot()`.
- `server/webauthn-rp/server.js` — `POST /billing/plans/features`,
  `POST /billing/organizations/entitlement`.
- 9 new tests in `billing.test.js` (plan features ×2, entitlement
  snapshot ×3, explicit client-tampering ×4).
- 2 new tests in `postgres-billing-runtime.test.js` (schema-consistent
  entitlement resolution against real PostgreSQL — honest skip, no live
  DB in this sandbox).

## REUSED

- `OrganizationRegistry.isAuthorized()` — `getEntitlementSnapshot()` and
  `setPlanFeatures()`/`getPlanFeatures()` use the exact same
  authorization call as every Phase 2 method; no new authorization logic
  was written.
- `rp.js` session resolution (`session.userId`, `session.isPlatformAdmin`)
  — the two new routes authenticate exactly like every existing route.
- The shared `audit_events` table — `setPlanFeatures()` writes
  `billing_plan_features_changed` via the same `_auditWith()` pattern as
  every other write method.
- The existing `DatabaseAdapter` transaction API — `setPlanFeatures()`
  wraps its delete-then-insert in `this.db.transaction()`, identical
  pattern to `setPlanPrice()`.

## REVIVED

None new this round beyond Phase 2's revivals (`billingEngine.js`'s
lifecycle vocabulary, already carried into the schema).

## EXTENDED

- `BillingRegistry` — new methods added to the existing class, no
  existing method's behavior changed except the Phase-2-final-audit
  authorization fix (already shipped in the Phase 2 checkpoint, not
  re-touched this round).
- `server.js` — 2 new routes added; no existing route modified.

## UNCHANGED

- `core/modules/entitlement/entitlement-engine.js` — not modified (see
  File Revival Record above for why).
- `core/storage.js` — not modified.
- `modules/billingEngine.js` — not modified.
- The four locked AI Core files — not read, not referenced, not modified.
- Every Phase 2 file's existing behavior — confirmed by full regression
  re-run, zero regressions.

## DEPRECATED / LEGACY

- `modules/billingEngine.js` — status unchanged from Phase 2: LEGACY /
  UNTRUSTED CLIENT-SIDE BILLING LOGIC. Re-confirmed, not re-litigated.

## TESTED

Exact final regression, this session:

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| `billing.test.js` | 23 | 23 | 0 | 0 |
| `postgres-billing-runtime.test.js` | 7 | 0 | 0 | 7 |
| `http-integration.test.js` | 19 | 19 | 0 | 0 |
| `firebase-session-integration.test.js` | 10 | 10 | 0 | 0 |
| `mfa-pending-auth.test.js` | 13 | 13 | 0 | 0 |
| `organizations-context.test.js` | 11 | 11 | 0 | 0 |
| `organizations.test.js` | 11 | 11 | 0 | 0 |
| `password-auth-integration.test.js` | 19 | 19 | 0 | 0 |
| `session-organizations.test.js` | 8 | 8 | 0 | 0 |
| `totp.test.js` | 7 | 7 | 0 | 0 |
| `postgres-adapter-runtime.test.js` | 16 | 0 | 0 | 16 |
| `postgres-recovery-code-runtime.test.js` | 5 | 0 | 0 | 5 |
| `migrate-sqlite-to-postgres.test.js` | 5 | 5 | 0 | 0 |
| `static-boundary-entrypoint-database-selection.test.js` | 4 | 4 | 0 | 0 |
| `static-boundary-firebase.test.js` | 3 | 3 | 0 | 0 |
| `static-boundary-password-auth.test.js` | 4 | 4 | 0 | 0 |
| `chalzydashboard-gate-integration.test.js` | 6 | 6 | 0 | 0 |
| `auth-coordinator.test.js` | 26 | 26 | 0 | 0 |
| **TOTAL** | **196** | **169** | **0** | **27** |

All 27 skips are the three real-PostgreSQL suites, honestly reported —
none converted to a pass. The 2 new real-Postgres tests were additionally
verified sound via a temporary SQLite dry-run (6/7 pass; the 1 expected
non-pass is the same known Postgres-only `information_schema` query from
Phase 2, not a new defect), scratch copy deleted after use.

### Client tampering — proven, not just claimed

| Forged field | Result |
|---|---|
| `"isPlatformAdmin": true` from a non-admin session | `403 platform_admin_required` |
| Forged `price`/`amountMinorUnits` alongside a real subscription charge | Real server-resolved price (KES 100.00) charged regardless |
| Real other-organization `organizationId` from an outsider's real session | `403 not_authorized` |
| (Phase 2, re-confirmed) forged `orgId` for wallet/subscription reads | `403 not_authorized` |

### Session/authorization matrix — covered by existing + new tests

| Scenario | Covered by |
|---|---|
| Valid authenticated session | every passing test |
| Missing session | `not_authenticated` checks throughout `billing.test.js` (pre-existing) |
| Authenticated non-admin attempting admin action | `platform_admin_required` tests (plan create, price change, feature change) |
| Cross-organization user | tamper-orgid, sub-org-isolation, wallet-isolation, entitlement-isolation tests |
| Unavailable authorization → must deny | `BillingRegistry`'s constructor requires a real `OrganizationRegistry`; there is no code path where authorization is skipped rather than checked |

Expired/malformed session testing is inherited from `rp.js`'s own
pre-existing session-resolution tests (not re-tested here — would be
duplicating existing coverage, not extending it).

## NOT RUN

- The 2 new real-PostgreSQL entitlement tests — no live database in this
  sandbox, honestly skipped.

## BLOCKED

None block this round's VERIFIED status — explicit, authorized follow-up:

- Wiring `entitlement-engine.js`'s client-side plan layer to the new
  `POST /billing/organizations/entitlement` endpoint (requires either an
  async interface change to that file or a new client cache layer —
  genuine design work, not attempted).
- Step-up/reauthentication for sensitive admin billing actions — `rp.js`
  has no such mechanism today; documented, not invented.
- Everything already out of scope per this round's boundary: payment
  providers, renewal/expiry automation, trial automation, B4.4.

---

## Security audit — completed, source-inspected

- **Credential/secret leakage:** none — `billing.js` still never logs or
  touches connection strings/passwords anywhere (re-confirmed by direct
  grep of the full file, including the new methods).
- **Client-controlled financial/authorization values:** proven rejected
  by the four new tamper tests above, not just asserted.
- **Authorization bypass / organization isolation:** `getEntitlementSnapshot()`
  and `setPlanFeatures()`/`getPlanFeatures()` follow the exact
  self-enforcing pattern the Phase 2 final audit fixed into every other
  method — `getPlanFeatures()` is deliberately open-read (feature
  catalogs are not sensitive the same way price/wallet data is; this is
  a considered choice, not an oversight, and matches `subscription_plans`'
  own read-openness).
- **SQL injection / unsafe dynamic SQL:** every new query uses `?`
  parameterized placeholders; `featureKeys` values are only ever bound
  as parameters, never interpolated into SQL text.
- **Prototype pollution:** no new dynamic object-key access was
  introduced; `featureKeys` is only ever iterated as array values.
- **Hard-coded monetary values:** none introduced this round.
- **Fake synchronization:** none introduced — `core/storage.js`'s
  placeholder finding stands unchanged, un-fabricated.

## Locked AI Core files — verification, not assumption

| File | Status |
|---|---|
| `core/ai.js` | Confirmed byte-identical to the Phase 2 checkpoint (`8ef98f43...`) |
| `core/ai/integration.js` | **Does not exist anywhere in this repository** — confirmed by direct search, not a path error. This has been true throughout the entire engagement; recording it explicitly rather than silently treating a nonexistent file as "unchanged." |
| `core/ai/cozy-ai-language.js` | Confirmed byte-identical to the Phase 2 checkpoint (`2f5d282d...`) |
| `core/ai/cozy-ai-memory.js` | Confirmed byte-identical to the Phase 2 checkpoint (`7f2a95ba...`) |

None of the three that do exist were read, referenced, or modified this
round.

## PHASE 3 STATUS

**VERIFIED**

Checkpoint built, extracted into a clean directory, file list
reconciled exactly (zero difference), every manifest hash re-verified
(1,630/1,630 OK), `node_modules` and secrets confirmed excluded, all
critical billing files spot-checked post-extraction and syntax-valid,
locked AI Core files confirmed byte-identical (and `core/ai/integration.js`
confirmed still genuinely absent, not silently ignored), all three prior
checkpoints (B4.2, B4.3, Phase 2) confirmed byte-identical and untouched.

ZIP: `CozyOS-Merged-0003-Phase3-INTEGRATION-VERIFIED-FULL-CHECKPOINT.zip`
ZIP SHA-256: `b48d3aff44b6c37fe6101149ab7b715232f023c07c11e1cc9a04affc3f85fee0`
Manifest SHA-256: `e8ed7116c88cea109ca820045c110e1b492e55ef1367e1a24580b5d720ad186a`
Files: 1,631 (1,630 tracked + the manifest)

Not proceeding to payment-provider integration, renewal/expiry
automation, further Billing features, or B4.4.
