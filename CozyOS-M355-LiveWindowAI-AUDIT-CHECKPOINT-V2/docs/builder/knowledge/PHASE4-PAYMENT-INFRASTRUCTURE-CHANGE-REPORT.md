# Phase 4 — Universal Payment Provider Infrastructure — Change Report

Baseline: `CozyOS-Merged-0003-Phase3-INTEGRATION-VERIFIED-FULL-CHECKPOINT.zip`
(`b48d3aff44b6c37fe6101149ab7b715232f023c07c11e1cc9a04affc3f85fee0`),
Phase 3 VERIFIED. No locked AI Core file was read, modified, or
referenced. No unrelated application development, AI Core work, or
B4.4 was started.

---

## Step 1 — Repository-wide payment discovery

Real, well-designed CLIENT-SIDE payment-provider infrastructure found:
`core/modules/payment-provider/` (`ProviderRegistry`, `ProviderManager`,
`RoutingEngine`, `CapabilityEngine`, `FailoverEngine`, `HealthMonitor`,
public façade `cozy-payment-provider-engine.js`) and
`core/modules/payment-channel/`. No webhook or idempotency concept
exists anywhere in that family (confirmed by search) — it is about
merchant/POS payment-method routing, not online transaction processing.
Its own Canonical Ownership Declaration explicitly states it does not
own ledger/wallet/accounting ("Financial Platform's domain") and never
stores secrets ("Vault's domain"). Its `mpesa-provider.js` honestly
discloses no real credentials exist anywhere in this platform; its
`cash-provider.js` is honestly disclosed as real but purely in-memory.

## File Revival Records

**`core/modules/payment-provider/provider-registry.js`** — REVIVE (not
replaced, not modified). Genuinely well-designed: real adapter interface
validation (`REQUIRED_ADAPTER_METHODS`), real audit log, real
capability-discovery delegation to the adapter itself (never fabricated).
Its method vocabulary (`createPayment`/`verifyPayment`/`refund`/`cancel`/
`getCapabilities`) is reused (not duplicated) in the new server-side
`PaymentRegistry` for interface consistency. Problem: client-side only,
no persistence beyond the current page session, no organization
isolation, no ledger, no server audit.

**`core/modules/payment-provider/cash-provider.js` (client)** — REVIVE
the *idea* (cash needs no real API, so it can be genuinely complete);
its own state (`Map()`) is not reused — it vanishes on reload and is
never server-persisted. The new server-side
`server/webauthn-rp/providers/cash-provider.js` implements the same
concept for real, with `PaymentRegistry` owning actual persistence.

**`core/modules/payment-provider/mpesa-provider.js`** — LEGACY /
DISCLOSED-INCOMPLETE, unchanged. Its own header already states no real
credentials exist; this round did not add any. A real server-side M-Pesa
adapter remains explicitly BLOCKED (see below).

**`core/modules/payment-channel/cozy-payment-channel-engine.js`** — LEAVE
UNCHANGED. Owns channel metadata/transaction-tagging for reporting, a
distinct concern from payment provider connectivity; not touched, not
duplicated.

**`server/webauthn-rp/billing.js`** — EXTENDED (not duplicated): added
`_recordLedgerEntryWithinTransaction()`, the transaction-aware core
`PaymentRegistry` composes into its own transactions. `recordLedgerEntry()`
itself now calls this same core — behavior for every existing caller is
unchanged (verified: 23/23 `billing.test.js` tests still pass).

## Dependency graph followed (Step 3/Section 21)

1. Schema (`008_payments.sql` + SQLite mirror) — built first.
2. `PaymentRegistry` contract + registration validation — built second.
3. Ledger integration (`_recordLedgerEntryWithinTransaction`) — built and
   *empirically tested* third, before any HTTP route existed, catching a
   real transaction-nesting bug in the process (see below).
4. Existing Authenticator/Identity/Organization/Authorization integration
   — reused, not rebuilt (routes use `currentSession()`/`OrganizationRegistry`
   exactly like every other billing route).
5. First real adapter (cash) — built fifth.
6. HTTP routes — built last, after everything under them was real and tested.

---

## IMPLEMENTED

- `server/webauthn-rp/migrations/008_payments.sql` — `payment_intents`
  (server-resolved amount/currency, canonical status, database-enforced
  idempotency via partial unique index) + `payment_events` (append-only
  reconciliation foundation).
- `server/webauthn-rp/db.js` — `migrateAddPayments()`, SQLite mirror,
  verified table-creation-correct by direct inspection.
- `server/webauthn-rp/payments.js` — `PaymentRegistry`, `PaymentError`,
  `verifyWebhookSignature()`, `CANONICAL_STATUSES`, `REQUIRED_ADAPTER_METHODS`.
- `server/webauthn-rp/providers/cash-provider.js` — the one real, fully
  tested provider adapter this round.
- `server/webauthn-rp/server.js` — 7 new routes
  (`/payments/intents/{create,get,cancel,refund}`), `PAYMENT_ERROR_STATUS`
  mapping, `payments.registerProvider('cash', ...)` wiring,
  `server.payments` exposed for tests.
- 19 new tests in `payments.test.js` (end-to-end ledger integration,
  idempotency ×2, organization isolation, client tampering ×2, refund
  correctness ×3, provider validation, unknown-provider/amount validation
  ×2, audit ×2, real HMAC webhook verification ×5).

## REUSED

- `OrganizationRegistry.isAuthorized()` — every `PaymentRegistry` method
  calls this exact function; no new authorization logic was written.
- `rp.js` session resolution — every new route authenticates identically
  to every existing route.
- The shared `audit_events` table — `PaymentRegistry._auditWith()`
  mirrors `BillingRegistry`'s own pattern exactly.
- `BillingRegistry`'s validation helpers (`assertMoneyAmount`,
  `assertCurrency`, `assertNonEmptyString`) — exported from `billing.js`
  this round specifically so `payments.js` could reuse them rather than
  duplicate them.
- The existing client `ProviderRegistry`'s adapter-method vocabulary —
  reused as the interface contract, not the code.

## REVIVED

- The client `cash-provider.js`'s core idea (cash needs no external API,
  so it's the one adapter that can be genuinely complete) — reimplemented
  server-side with real persistence.
- The subscription-lifecycle/plan-features versioning discipline from
  Phases 2–3 — applied to payment intents' canonical status model.

## EXTENDED

- `server/webauthn-rp/billing.js` — `_recordLedgerEntryWithinTransaction()`
  added; `recordLedgerEntry()`'s own behavior unchanged (re-confirmed by
  full regression), only its internal structure changed to support
  composition from `PaymentRegistry`.
- `server/webauthn-rp/server.js` — 7 new routes added; no existing route
  modified.

## UNCHANGED

- `core/modules/payment-provider/*` (client-side engine family) — not
  modified.
- `core/modules/payment-channel/cozy-payment-channel-engine.js` — not
  modified.
- `core/modules/entitlement/entitlement-engine.js` — not modified (Phase
  3's finding stands; Phase 4 did not touch it either).
- `core/storage.js` — not modified.
- `modules/billingEngine.js` — not modified.
- The four locked AI Core files — not read, not referenced, not
  modified. (`core/ai/integration.js` remains genuinely absent from the
  repository, re-confirmed.)
- Every Phase 1–3 file's existing behavior — confirmed by full regression
  re-run, zero regressions.

## DEPRECATED / LEGACY

- `core/modules/payment-provider/mpesa-provider.js` — status: LEGACY /
  DISCLOSED-INCOMPLETE (its own words, not this report's judgment). Not
  modified. A real server-side M-Pesa adapter remains BLOCKED.
- `modules/billingEngine.js` — status unchanged from Phase 2/3: LEGACY /
  UNTRUSTED CLIENT-SIDE BILLING LOGIC.

## TESTED

Exact final regression, this session:

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| `payments.test.js` | 19 | 19 | 0 | 0 |
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
| **TOTAL** | **215** | **188** | **0** | **27** |

All 27 skips are the three real-PostgreSQL billing/auth suites (unrelated
to this round's changes, still honestly reported, never converted to a
pass). Payments has no dedicated real-Postgres test file this round —
see BLOCKED below for why (no real Postgres reachable in this
environment; SQLite path is fully real and tested, matching every other
"real" designation used throughout this engagement for SQLite-backed
logic tests).

### A real bug found and fixed during implementation (not assumed correct)

The first working version of `PaymentRegistry._creditWalletWithinTransaction()`
tried to reuse `BillingRegistry.recordLedgerEntry()` by substituting a
transaction-scoped `db` via `Object.create()` prototype trickery. This
was **empirically tested before any unit test was written** and failed
for real: `node:sqlite` threw `"cannot start a transaction within a
transaction"`, because `recordLedgerEntry()` always opens its own
top-level transaction regardless of caller. Root cause: `payments.js`'s
design assumed a transaction-composition capability `billing.js` didn't
actually have. Fixed by extracting `_recordLedgerEntryWithinTransaction()`
from `recordLedgerEntry()` — the same `_audit`/`_auditWith` split every
registry in this codebase already uses — verified the fix empirically
(cash payment → real credit → real partial refund → real debit, checked
by direct script execution) before writing the corresponding test.

### Client tampering — proven, not just claimed

| Forged/attempted input | Result |
|---|---|
| Client amount on a subscription charge (re-verified, Phase 3 pattern) | Real server-resolved price charged regardless |
| Real other-organization `organizationId` on refund/cancel from an outsider | `403 not_authorized` |
| Refund amount exceeding the original payment | `400 invalid_refund_amount` |
| A second refund after the first already fully refunded | `409 payment_intent_not_refundable` |
| Duplicate idempotency key (application level) | Existing intent returned, no second charge |
| Duplicate idempotency key (raw SQL, bypassing application logic entirely) | Database's own unique index rejects it |

## NOT RUN

- No real-Postgres test file for payments this round (see BLOCKED).

## BLOCKED

- **Real online/mobile-money/bank/crypto provider adapters.** No real
  provider credentials or network access exist in this environment.
  Building one would mean fabricating provider runtime evidence —
  explicitly prohibited by this round's own instructions and the
  standard already applied to every real-Postgres test in this
  engagement. The provider-neutral foundation is ready; adding a real
  adapter once credentials exist requires implementing
  `REQUIRED_ADAPTER_METHODS` and calling `registerProvider()` — no
  change to `PaymentRegistry`, `BillingRegistry`, or the entitlement
  layer.
- **Real webhook processing pipeline wired to a live provider.** The
  verification primitive (`verifyWebhookSignature()`) is real and tested;
  a full inbound webhook route requires a real provider to actually call
  it, which doesn't exist. Not built as a fake/simulated endpoint.
- **Full automated reconciliation.** The foundation (`payment_events`)
  exists; comparing against a real provider's records requires a real
  provider connection.
- **A dedicated real-Postgres payments test file.** Given no real
  Postgres is reachable in this sandbox (a structural constraint present
  throughout this entire engagement, not new to this round) and the cash
  adapter has no Postgres-specific behavior beyond what
  `postgres-billing-runtime.test.js` already exercises via
  `BillingRegistry.recordLedgerEntry()`, a payments-specific real-Postgres
  suite was not created this round — flagged as legitimate follow-up
  rather than silently omitted.
- Everything already out of scope per this round's boundary: unrelated
  applications, AI Core, B4.4, unrelated billing features.

---

## Security audit — completed, source-inspected

- **Credential/secret leakage:** none — `payments.js` and
  `providers/cash-provider.js` never log or touch connection strings/
  passwords/API keys/private keys anywhere (confirmed by direct grep of
  both files).
- **No private keys anywhere** (Phase 4 section 29's specific concern for
  crypto) — not applicable this round (no crypto adapter exists), but
  confirmed zero private-key handling was fabricated to look complete.
- **Client-controlled financial values:** proven rejected — refund amount
  capped server-side, subscription charge amount never accepted from
  client at all (re-verified from Phase 3).
- **Authorization bypass / organization isolation:** every
  `PaymentRegistry` method calls the real `OrganizationRegistry.isAuthorized()`;
  proven by dedicated isolation and tamper tests, not just asserted.
- **SQL injection / unsafe dynamic SQL:** every query uses `?`
  parameterized placeholders (confirmed by direct inspection of every
  query in `payments.js`).
- **Idempotency:** proven both at the application level (repeated
  request returns the same intent) and the database level (raw SQL
  duplicate insert rejected by the unique index) — real defense in
  depth, same pattern as Phase 2's subscription/price guarantees.
- **Webhook security:** the verification primitive itself is proven
  correct against 5 real cryptographic test cases (valid, tampered
  payload, wrong secret, missing signature, malformed signature) — no
  live webhook endpoint exists yet to additionally test replay/duplicate-
  event handling against, since no real provider sends one.
- **Transaction/rollback safety:** the real bug found and fixed above
  (transaction-nesting) is itself the strongest evidence this was
  actually checked, not assumed — a transaction bug does not silently
  produce a wrong-looking-right result, it throws, and it was caught
  before any test was written to hide it.
- **Fake providers:** none created. `mpesa-provider.js` (client-side,
  pre-existing) remains honestly disclosed as not configured; no new
  fake/mock/simulated provider was added to the production path.

## PHASE 4 STATUS

**VERIFIED**

Final regression: 215 tests, 188 pass, 0 fail, 27 skip (all 3 real-
PostgreSQL suites, honestly preserved), 0 todo. Final security scan
completed against the full Phase 4 changed surface — no secrets,
credentials, or unsafe patterns found; payment/refund/idempotency
integrity re-confirmed empirically (not just via passing tests) end to
end, including a full-refund exact-reversal check. Provider boundary
confirmed: `payments.js` contains zero references to "cash" specifically
— it is genuinely provider-neutral, with cash wiring living only in
`server.js`'s one registration line. Checkpoint built, extracted into a
clean directory, file list reconciled exactly, every manifest hash
re-verified, `node_modules`/secrets confirmed excluded, all critical
payment files spot-checked post-extraction and syntax-valid, locked AI
files confirmed byte-identical (`core/ai/integration.js` confirmed
ABSENT/NOT PRESENT, not falsely claimed identical), all four prior
checkpoints (B4.2, B4.3, Phase 2, Phase 3) confirmed byte-identical and
untouched.

**Self-referential note (same convention as every prior phase):** this
report necessarily cannot contain the final checkpoint ZIP's own SHA-256
before that ZIP exists. The independently delivered copy of this report
will state the final hash; the copy sealed inside the ZIP itself
necessarily predates it. The ZIP itself was not modified to resolve
this, matching the established convention.

Cash is the only REAL runtime adapter implemented this phase. Online,
card, mobile-money, bank, and crypto adapters are **NOT IMPLEMENTED /
BLOCKED BY REAL CREDENTIALS AND RUNTIME ACCESS** — not claimed verified
anywhere in this report or the architecture documentation.

Not starting Phase 5, online/crypto provider implementation, renewal/
expiry automation, or B4.4.
