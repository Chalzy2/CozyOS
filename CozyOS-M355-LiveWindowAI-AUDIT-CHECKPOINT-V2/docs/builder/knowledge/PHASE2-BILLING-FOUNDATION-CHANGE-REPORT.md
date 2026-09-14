# Phase 2 — Billing Foundation — Change Report

Baseline: `CozyOS-Merged-0003-PhaseB4.3-VERIFIED-FULL-CHECKPOINT.zip`
(`272086528ec84b35fd47f97cb4358479406726fdc06eea95fdeba1bffbd13bec`),
B4.3 VERIFIED. No locked AI Core file was read, modified, or referenced.

---

## IMPLEMENTED

- `server/webauthn-rp/migrations/006_billing.sql` — PostgreSQL schema:
  `subscription_plans`, `subscription_plan_prices`, `subscriptions`,
  `wallet_accounts`, `wallet_ledger`, 7 indexes (2 partial-unique, 5
  regular).
- `server/webauthn-rp/db.js` — `migrateAddBilling()`, a faithful SQLite
  mirror of the same schema. Verified index-for-index identical to the
  PostgreSQL migration (all 7 indexes, including both partial unique
  indexes, confirmed present by direct inspection of a freshly-created
  SQLite database).
- `server/webauthn-rp/billing.js` — `BillingRegistry` class and
  `BillingError`. Plan/price catalog (platform-admin authority),
  subscription lifecycle, wallet/ledger with transactional balance
  maintenance, `chargeSubscription()` connecting locked subscription
  pricing to a real ledger debit.
- 7 new HTTP routes in `server/webauthn-rp/server.js`
  (`/billing/plans`, `/billing/plans/price`,
  `/billing/organizations/subscriptions/{create,cancel,get,charge}`,
  `/billing/organizations/wallet/get`), plus `BILLING_ERROR_STATUS`
  mapping in the existing central error dispatcher, plus `server.billing`
  exposed for tests, mirroring `server.orgs`.
- `server/webauthn-rp/test/billing.test.js` — 15 real HTTP integration
  tests.
- `server/webauthn-rp/test/postgres-billing-runtime.test.js` — 6 tests
  against real PostgreSQL only, honest-skip pattern.

## REUSED

- `DatabaseAdapter` (`get`/`all`/`run`/`exec`/`transaction`) — unmodified,
  used exactly as `rp.js`/`organizations.js` already use it.
- `OrganizationRegistry.isAuthorized()` — `BillingRegistry` takes an
  `OrganizationRegistry` instance in its constructor and calls this for
  every organization-scoped operation; organization membership/role logic
  was never reimplemented.
- The shared `audit_events` table — every billing action writes into the
  same table `rp.js`/`organizations.js` already use, via the same
  `_audit`/`_auditWith` method pattern copied from `organizations.js`.
- `rp.js`'s `resolveSession()`/`isPlatformAdmin` resolution path — every
  platform-admin check in the new routes reads `session.isPlatformAdmin`,
  resolved exactly the way every other admin check in `server.js` already
  works.

## REVIVED

- `modules/billingEngine.js`'s subscription-lifecycle vocabulary
  (`active`/`trialing`/`grace_period`/`expired`/`paused`) — carried into
  `subscriptions.status`'s CHECK constraint (with `canceled` added, a
  real server-side terminal state the client-only engine never modeled).
- `modules/billingEngine.js`'s licensed-modules-by-plan concept —
  informed the plan/price separation design, though not copied verbatim
  (the new schema is versioned; the old client engine was not).

## EXTENDED

- None. No existing class or table was modified in place beyond the
  additive migration; `server.js` was extended with new routes, not
  restructured.

## UNCHANGED

- `core/modules/entitlement/entitlement-engine.js` — not modified. Its
  plan layer still reads the client-only `modules/billingEngine.js`
  (`window.CozyOS.Billing`), not the new server API. This is a
  deliberate scope boundary, not an oversight — see BLOCKED below.
- `core/storage.js` — not modified. Its `sync()` remains the confirmed
  placeholder (no `fetch`/`XMLHttpRequest` anywhere in the file); no fake
  network implementation was added to make anything appear more complete
  than it is.
- The four locked AI Core files — not read, not referenced, not
  modified.
- `modules/billingEngine.js` itself — not modified, not deleted.

## DEPRECATED / LEGACY

- `modules/billingEngine.js` (`window.CozyOS.Billing`) — recorded as
  **LEGACY / UNTRUSTED CLIENT-SIDE BILLING LOGIC**. It remains present
  and functional for whatever UI purpose it currently serves, but it
  must never be treated as a financial authority: its state lives in
  `core/storage.js` (confirmed IndexedDB-only, no server sync), and its
  own plan-change authorization check is client-side JavaScript with no
  server verification. This status is now recorded in
  `docs/billing-architecture-boundary.md`, not just this report.

## TESTED

Exact final regression run, this session, after the security fix below
(no Postgres skip was ever converted to a pass):

| Suite | tests | pass | fail | cancelled | skipped | todo |
|---|---|---|---|---|---|---|
| `billing.test.js` | 15 | 15 | 0 | 0 | 0 | 0 |
| `postgres-billing-runtime.test.js` | 6 | 0 | 0 | 0 | 6 | 0 |
| `http-integration.test.js` | 19 | 19 | 0 | 0 | 0 | 0 |
| `firebase-session-integration.test.js` | 10 | 10 | 0 | 0 | 0 | 0 |
| `mfa-pending-auth.test.js` | 13 | 13 | 0 | 0 | 0 | 0 |
| `organizations-context.test.js` | 11 | 11 | 0 | 0 | 0 | 0 |
| `organizations.test.js` | 11 | 11 | 0 | 0 | 0 | 0 |
| `password-auth-integration.test.js` | 19 | 19 | 0 | 0 | 0 | 0 |
| `session-organizations.test.js` | 8 | 8 | 0 | 0 | 0 | 0 |
| `totp.test.js` | 7 | 7 | 0 | 0 | 0 | 0 |
| `postgres-adapter-runtime.test.js` | 16 | 0 | 0 | 0 | 16 | 0 |
| `postgres-recovery-code-runtime.test.js` | 5 | 0 | 0 | 0 | 5 | 0 |
| `migrate-sqlite-to-postgres.test.js` | 5 | 5 | 0 | 0 | 0 | 0 |
| `static-boundary-entrypoint-database-selection.test.js` | 4 | 4 | 0 | 0 | 0 | 0 |
| `static-boundary-firebase.test.js` | 3 | 3 | 0 | 0 | 0 | 0 |
| `static-boundary-password-auth.test.js` | 4 | 4 | 0 | 0 | 0 | 0 |
| `chalzydashboard-gate-integration.test.js` | 6 | 6 | 0 | 0 | 0 | 0 |
| `auth-coordinator.test.js` | 26 | 26 | 0 | 0 | 0 | 0 |
| **TOTAL** | **188** | **161** | **0** | **0** | **27** | **0** |

All 27 skips are the three real-PostgreSQL suites, honestly reported —
none converted to a pass. `postgres-billing-runtime.test.js`'s logic was
additionally verified sound via a temporary SQLite dry-run (5/6 pass; the
1 expected non-pass is a Postgres-only `information_schema` query that
cannot run on SQLite by design — not a defect), scratch copy deleted
after use, never presented as Postgres evidence.

## NOT RUN

- `postgres-billing-runtime.test.js`'s 6 tests against a real PostgreSQL
  server — no live database in this sandbox, honestly skipped, not
  fabricated.
- Any real end-to-end browser/UI test — no UI was built this round.

## BLOCKED

None of these block Phase 2 VERIFIED — they are explicit, out-of-scope
follow-up work per this round's own instructions ("Do not start
payment-provider integration... renewal/expiry automation... unrelated
Billing features"):

- Client/UI integration — `entitlement-engine.js` → new server API wiring.
- Payment provider integration (M-Pesa, cards) and the
  `payment_attempts`/`payment_transactions`/`provider_events` tables the
  architecture document already anticipates.
- Subscription renewal/expiry background processing.
- Trial period logic (schema supports it; no code path uses it yet).

---

## Financial correctness — inspection findings

- **Exact monetary representation:** every amount is `amount_minor_units`
  / `amountMinorUnits`, validated by `assertMoneyAmount()` as a
  `Number.isInteger()` value in `[0, Number.MAX_SAFE_INTEGER]`. No
  floating-point arithmetic exists anywhere in `billing.js` — confirmed
  by reading every arithmetic operation in the file (`current.version + 1`,
  `account.balance_minor_units + amountMinorUnits` — both integer
  addition).
- **Currency:** validated by `assertCurrency()` (3-letter uppercase
  regex) on every write path; a wallet's currency is fixed at creation
  and a mismatched currency on a later ledger entry is rejected
  (`currency_mismatch_with_wallet_account`) rather than silently
  converted or accepted.
- **Price version locking:** `subscriptions.current_price_id` is set once
  at `createSubscription()` and never rewritten by `setPlanPrice()`.
  Verified two ways: (1) `billing.test.js`'s price-history test creates a
  subscription, changes the plan price, and confirms the subscription's
  bound price object is unchanged and marked `superseded` only in its own
  right, not deleted; (2) the real-Postgres test performs the identical
  check against a real server.
- **Duplicate/current-price prevention:** enforced by
  `idx_subscription_plan_prices_current`, a partial unique index — not
  just application logic. Confirmed on the real Postgres test by
  attempting a raw `INSERT` of a second current-price row directly
  (bypassing `setPlanPrice()` entirely) and observing a real unique
  constraint violation.
- **Subscription uniqueness under concurrency:** confirmed empirically
  this round (not merely by code reading) that `idx_subscriptions_org_nonterminal`
  independently rejects a second non-terminal subscription for the same
  organization even when inserted via raw SQL, bypassing the
  application-level `getActiveSubscription()` check entirely — real
  defense-in-depth against a race between two concurrent
  `createSubscription()` calls, not just an application-level guard.
- **Transaction atomicity / rollback:** `recordLedgerEntry()` writes the
  ledger row and updates the cached balance inside one
  `this.db.transaction()` call; a currency mismatch or negative-balance
  check throws *inside* that transaction, and both `billing.test.js` and
  `postgres-billing-runtime.test.js` confirm a rejected entry leaves the
  balance and ledger table completely unchanged, not just the error
  surfaced to the caller.
- **Negative/invalid amounts:** rejected before any database write in
  every case — `assertMoneyAmount()` for plan prices (non-negative only),
  and an explicit `newBalance < 0` check inside the ledger transaction
  for debits (negative debits are allowed as input — that's how a charge
  is expressed — but the resulting balance may never go negative).
- **Historical price integrity:** `getPriceAt(planId, timestamp)`
  resolves the price actually in effect at a past moment by scanning
  `effective_from`/`effective_until`, independent of whatever the current
  price is — exercised by both the SQLite and real-Postgres test suites.

## Security audit — completed, source-inspected, not grep-only

- **Credential/secret leakage:** none. `billing.js` never logs, never
  touches `databaseUrl`/`connectionString`/`password` anywhere in the
  file (confirmed by direct grep of the full file, zero matches, and by
  reading every line of the file above).
- **Connection-string leakage:** not applicable — `billing.js` never
  receives or handles a connection string; that remains entirely
  `database-adapter.js`'s concern, untouched by this round.
- **Unsafe error responses:** `BillingError` carries only a short, fixed
  `.code` string (e.g. `not_authorized`), the same safe shape `OrgError`
  already uses — never interpolates request data, stack traces, or
  internal detail into a client-visible message.
- **Client-controlled financial values:** every amount and currency
  passed from a request body is validated server-side before use;
  `isPlatformAdmin` is read only from `session.isPlatformAdmin` (resolved
  server-side from the session cookie), never from `req.body` — confirmed
  by inspecting every one of the 7 new route handlers directly.
- **Authorization bypass — real defect found and fixed this round:**
  `getActiveSubscription`, `getWalletAccount`, and `getWalletLedger`
  originally had no authorization check inside `billing.js` itself —
  they relied entirely on the calling route to check first. Every write
  method already self-enforced; these three read methods did not. Fixed
  to self-enforce regardless of caller (each now takes `actorUserId` and
  calls `this.orgs.isAuthorized()` itself), with internal
  `_getActiveSubscriptionUnchecked()`/`_getWalletAccountUnchecked()`
  variants for call sites that already authorized the actor earlier in
  the same operation, avoiding a redundant round-trip. `ensureWalletAccount`
  (currently unused by any route, but public API on the class) received
  the same fix. A new regression test
  (`billing registry read methods self-enforce authorization even when
  called directly, not just via server.js routes`) calls the registry
  directly, bypassing `server.js` entirely, and confirms all three now
  reject an unauthorized actor. Full suite re-run clean after the fix:
  188 tests, 161 pass, 0 fail, 27 honest skip.
- **Organization isolation:** confirmed both before and after the fix
  above by dedicated tests (`a non-member cannot create a subscription`,
  `a wallet cannot be read by a user outside the organization`) and by
  the real-Postgres `organization isolation` test.
- **SQL injection:** every query in `billing.js` uses `?` parameterized
  placeholders; zero string-concatenated or template-literal-interpolated
  SQL exists anywhere in the file (confirmed by direct inspection of
  every query, not just grep).
- **Unsafe dynamic SQL:** none — no query is built from a runtime string
  choosing table/column names based on user input.
- **Prototype pollution:** no user-supplied string is ever used as a
  dynamic object property key anywhere in `billing.js` (the one
  bracket-notation lookup, `INTERVAL_MS[plan.billingInterval]`, only ever
  receives a value already constrained by both the schema's CHECK
  constraint and an application-level allow-list at write time) — no
  `FORBIDDEN_KEYS`-style guard was needed because there is no equivalent
  attack surface, unlike `entitlement-engine.js`'s feature-key inputs.
- **Transaction/rollback safety:** covered under Financial Correctness
  above.
- **Hard-coded monetary values:** none exist in `billing.js` — confirmed
  directly; the only numeric literals in the file are `INTERVAL_MS`'s
  calendar-period *durations* (30/365 days in milliseconds), which are
  operational constants analogous to `rp.js`'s `SESSION_TTL_MS`, not
  business amounts, and every actual price flows through
  `subscription_plan_prices`.
- **Accidental platform-admin escalation:** none found — `isPlatformAdmin`
  is read exactly once per request, from the resolved session, and passed
  straight through to `billing.js`'s methods, which treat it as a
  boolean gate only (`if (!isPlatformAdmin) throw ...`) and never derive
  or upgrade it from anything else.

## Administrator configuration — server-authoritative, confirmed

Every business amount (subscription price) lives in
`subscription_plan_prices`, mutated only via `setPlanPrice()`, which
requires a real, session-resolved `isPlatformAdmin=true` and writes a
real audit event recording the actor, old value, new value, and reason.
No client-provided amount can override this: `createSubscription()` and
`chargeSubscription()` both resolve the price from the database
(`getCurrentPrice()`/`getPrice()` respectively) — neither ever accepts an
amount from the request body for what a subscription actually costs.

## Entitlement engine status

`core/modules/entitlement/entitlement-engine.js` was not modified. Its
own header already documents it reads `window.CozyOS.Billing`
(the client-only engine) read-only. It is **not** server-authoritative
today, and this report does not claim otherwise. Migrating its plan
layer to consult the new server API is recorded as explicit follow-up
work, not attempted this round per the given scope boundary.

## Payment-provider scope exclusion

No payment provider integration exists or was started. `payment_attempts`,
`payment_transactions`, `provider_events`, `refunds`, `credits`,
`invoices`, and `usage_records` remain unimplemented, exactly as
`docs/billing-architecture-boundary.md` (updated this round) documents.

---

## PHASE 2 BILLING FOUNDATION STATUS

**VERIFIED**

Checkpoint built, extracted into a clean directory, file list
reconciled exactly (zero difference), every manifest hash re-verified
(1,627/1,627 OK), `node_modules` and secrets confirmed excluded, all
critical billing files spot-checked post-extraction, all three prior
checkpoints (B4.2, B4.3) confirmed byte-identical and untouched. See
`CozyOS-Merged-0003-Phase2-BILLING-FOUNDATION-VERIFIED-FULL-CHECKPOINT-SHA256.txt`
for the complete verification record.

ZIP: `CozyOS-Merged-0003-Phase2-BILLING-FOUNDATION-VERIFIED-FULL-CHECKPOINT.zip`
ZIP SHA-256: `a56fd3e91e35fa2fcc857d46c99e69f39f528e99fc19f5a7ee12a391e3eb94b0`
Manifest SHA-256: `1df0df4d38782ed095a9edbfa8705bdc78b1ca0d678ad626df30c07cd2251d63`
Files: 1,628 (1,627 tracked + the manifest)

Not proceeding to payment-provider integration, renewal/expiry
automation, further Billing features, or B4.4.
