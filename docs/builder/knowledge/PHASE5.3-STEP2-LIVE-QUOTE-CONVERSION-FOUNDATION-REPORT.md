# Phase 5.3 Step 2 — Live Quote, Rate & Conversion Foundation — Report

Baseline: Phase 5.3 Step 1 tree. `server/webauthn-rp/crypto-payments.js`
confirmed unmodified in substance before this round's additive work
began (spot-checked hash before starting).

---

## Repository-wide discovery (this round)

Confirmed by direct search: no existing currency/FX/quote/pricing/fee
engine exists anywhere in the repository beyond what Phase 4/5.2/5.3
Step 1 already built. `crypto_exchange_rates`
(`CryptoPaymentRegistry.getExchangeRate`/`setExchangeRate`, Step 1) is
the one real, directly relevant existing dependency — **extended this
round, not duplicated**. `crypto_network_asset_rules` (asset/network
compatibility) and `getActiveDestination()` are reused unchanged.
`BillingRegistry`'s ledger, `OrganizationRegistry.isAuthorized()`, and
`audit_events` are all reused, exactly as in every prior Phase 4/5
round.

## Architecture

```
LOCAL CURRENCY (KES, financial_assets.type=FIAT)
       ↓
LIVE MARKET RATE (crypto_exchange_rates, rate_type explicit: REAL_RATE_PROVIDER / TEST_RATE_PROVIDER / MANUAL_RATE)
       ↓
CRYPTO ASSET (financial_assets.type=CRYPTO, exact decimals per asset)
       ↓
COZYOS FEE (crypto_fee_configs, versioned, admin-configurable, org-scoped-with-platform-fallback)
       ↓
EXACT CUSTOMER QUOTE (quotes table — rate/fee/amounts snapshotted, immutable once written)
       ↓
SHORT-LIVED QUOTE LOCK (ACTIVE -> LOCKED, 30s default TTL)
       ↓
PAYMENT INTENT (PaymentRegistry.createPaymentIntent(), reused unchanged)
```

`QuoteEngine` (`server/webauthn-rp/quote-engine.js`) is the new
orchestration layer. It owns nothing that already had a real owner:
rates and destinations remain `CryptoPaymentRegistry`'s; payment intents
and the ledger remain `PaymentRegistry`/`BillingRegistry`'s; audit
remains the shared `audit_events` table.

## Reuse

- `CryptoPaymentRegistry.getNetworkAssetRule()` / `getActiveDestination()`
  — reused unchanged for quote-time validation and destination
  resolution.
- `CryptoPaymentRegistry`'s `crypto_exchange_rates` table — **extended**
  (4 new columns: `rate_type`, `bid`, `ask`, `observed_at`) rather than
  a second rates table.
- `PaymentRegistry.createPaymentIntent()` / `getPaymentIntent()` —
  reused unchanged; `QuoteEngine` never writes `payment_intents`
  directly.
- `OrganizationRegistry.isAuthorized()` — reused for every quote
  operation's authorization.
- The shared `audit_events` table — reused for
  `QUOTE_CREATED`/`QUOTE_LOCKED`/`QUOTE_EXPIRED`/fee-change events.
- `assertNonEmptyString` (Phase 2/4 export) — reused, not redefined.

## New dependencies genuinely created (confirmed no equivalent existed)

- `server/webauthn-rp/decimal-math.js` — exact BigInt decimal
  arithmetic. No equivalent existed anywhere in the repository.
- `financial_assets` table — asset metadata (decimals/type). No
  equivalent existed; `crypto_network_asset_rules` is about
  asset+network+address-format, a genuinely different concern.
- `crypto_fee_configs` table — versioned fee configuration. No
  equivalent existed.
- `quotes` table + `QuoteEngine` class — the Quote Engine itself. No
  equivalent existed.
- `server/webauthn-rp/test/test-only-rate-provider.js` — isolated test
  fixture, new this round.

No duplicate engine was created for any of these — each was verified
absent by search before being written.

## Rate model

A rate row now carries: `baseCurrency`, `quoteAsset`, `rate` (exact
decimal string), `bid`/`ask` (optional), `source`, `rateType`
(**required, never defaulted** — `REAL_RATE_PROVIDER` /
`TEST_RATE_PROVIDER` / `MANUAL_RATE`), `fetchedAt`, `observedAt`,
`expiresAt`, and a computed `health` (`CURRENT` / `STALE` / `EXPIRED`).
`getFreshRate()` — the only method quote creation calls — returns a
rate only when `health === 'CURRENT'`; a stale or expired rate is never
silently used. Every numeric input (`rate`, `bid`, `ask`) is validated
by `validateRateNumber()`, which rejects `NaN`, `Infinity`, negative,
zero, and scientific notation by construction (regex-anchored to
`/^\d+(\.\d+)?$/` before any numeric interpretation).

**Rate source intelligence (this round's scope):** a single active
row per `(baseCurrency, quoteAsset)`, selected by most-recent
`fetchedAt`. Multi-provider aggregation/averaging was **not built** —
per this round's own instruction not to invent a complex algorithm
absent an actual business requirement. What IS real: explicit
`rateType` labeling (so a fallback or test rate can never be mistaken
for live data), freshness classification, and stale-rate rejection —
the concrete subset of "source selection / health / freshness /
fallback / stale-rate rejection" this round asked to be at least
capable of.

## Precision model

Every amount is an integer count of the asset's smallest unit,
represented as BigInt internally and an exact integer string in
storage (`gross_atomic_amount`/`net_atomic_amount` are `TEXT`, never a
numeric floating column). `financial_assets.decimals` is authoritative
and asset-level, never hard-coded in payment logic — confirmed by
`convertAmount()`'s signature taking `baseDecimals`/`resultDecimals` as
parameters, always looked up from `financial_assets`, never a literal
in `quote-engine.js`. Verified empirically against the classic
`0.1 + 0.2 !== 0.3` floating-point failure case, rounding boundaries
(`ROUND_DOWN`/`ROUND_UP`/`NEAREST` all independently tested), very
small crypto amounts, very large fiat amounts, and 18-decimal assets —
all exact, zero floating-point operations anywhere in the arithmetic
path (confirmed by direct source inspection: `Number()` appears only in
`validateRateNumber()`'s finiteness check, never in any division/
multiplication affecting a stored amount).

## Fee model

`crypto_fee_configs` mirrors `subscription_plan_prices`' exact
versioning posture: a partial unique index enforces exactly one active
row per `(organizationId, feeType)`; changing the fee supersedes the
old row (setting `effective_until`) and inserts a new one — the old row
is retained forever, never edited. A quote's own `fee_snapshot` is
copied at creation time and never recalculated. **Verified empirically,
not just asserted**: a quote created under a 2% fee retains its exact
original amounts after the platform fee changes to 10%; a new quote
created afterward uses the new fee. Organization-specific fee overrides
were also verified: an organization with its own configured fee uses
it; an organization without one falls back to the platform default,
confirmed for two separate organizations in the same test run.
Fee rounding defaults to `ROUND_UP` (CozyOS's fee is never
under-collected by rounding error) — the deliberate opposite of the
customer-facing conversion amount's `ROUND_DOWN` default.

Only the `percentage` fee model was implemented this round (per the
explicit instruction: "implement the minimum model required... make the
architecture extensible" — the schema's `fee_type` already supports
`'fixed'` as a second value with no schema change needed once required).

## Quote lifecycle

Implemented exactly as specified: `ACTIVE → LOCKED → EXPIRED` (via lazy
expiry, checked on every read/lock — no scheduler exists or was
needed), plus `CONSUMED` once a quote produces a payment intent, and
`REJECTED` reserved in the schema for a future explicit rejection path
(not exercised this round — no rejection flow was built, since none was
required by any test scenario). `lockQuote()` is idempotent (locking an
already-locked quote is a no-op, not an error) and refuses an expired
quote outright. A quote may produce **at most one** payment intent —
verified by a dedicated test, including the real bug this exposed (see
below).

## Security — client tampering

`createQuote()`'s parameter list has no field for `clientRate`,
`clientFee`, or `clientCryptoAmount` at all — they cannot be supplied
even by a caller that tries, since the function's destructuring simply
never reads them. Verified directly: a call with forged
`clientRate: '999999'` etc. alongside a real request still produces the
exact real, server-computed amount. A forged asset/network/currency
combination that doesn't correspond to a real destination is rejected
the same way `CryptoPaymentRegistry` already rejects it (reused
validation, not reimplemented). Organization isolation verified:
Organization B cannot read or lock Organization A's quote — both return
`quote_not_found`, not a permission-denied leak confirming the quote's
existence.

## Offline Core / Online Edge

**Nothing in this round makes the Main Core dependent on network
access for normal operation.** Every class built
(`decimal-math.js`, `quote-engine.js`, `crypto-payments.js`'s rate
storage) is pure local computation and local database access — there is
no code path anywhere in this round's work that performs an outbound
network call. `setExchangeRate()` is the one real "online edge"
boundary: it is how a future real rate-fetching service (running
separately, online, calling this same method) would feed data in — but
no such service exists or was built this round, and its absence does
not prevent any other CozyOS function from operating. The authority
chain remains unchanged: nothing about being "online" grants any
special privilege — `setExchangeRate()`/`setFeeConfig()`/
`setCryptoDestination()` all still require the same real
`isPlatformAdmin`/`isAuthorized()` checks as everything else in this
codebase.

## Real connectivity — explicit classification

- **LIVE RATE RUNTIME: BLOCKED — real provider/API access unavailable.**
  No real rate provider credentials or network access exist in this
  environment (unchanged from Phase 5.1/5.3 Step 1 discovery).
- **IMPLEMENTED & VERIFIED locally, deterministically, without any live
  connection:** exact arithmetic (5 dedicated tests including the float-
  trap and rounding-boundary cases), the full quote lifecycle, fee
  calculation and historical immutability, rate validation (NaN/
  Infinity/negative/zero rejection) and freshness classification,
  security/tampering resistance, organization isolation, and quote→
  payment-intent consistency.
- **TEST-ONLY:** `test-only-rate-provider.js` — isolated, every rate it
  publishes is explicitly labeled `TEST_RATE_PROVIDER`, never imported
  by `server.js`, never capable of being mistaken for live market data
  by anything reading `crypto_exchange_rates`.
- **NOT RUN:** any real market-rate fetch, any scenario requiring actual
  live price movement.

## A real bug found and fixed during implementation (not assumed correct)

`createPaymentIntentFromQuote()`'s original check order was
`if (status !== 'LOCKED') throw quote_not_locked` before
`if (paymentIntentId) throw quote_already_consumed`. Since a
successfully-consumed quote's own status becomes `CONSUMED` (not
`LOCKED`), the second, more specific check was **structurally
unreachable** — a repeated consumption attempt on an already-consumed
quote produced the generic `quote_not_locked` instead of the accurate
`quote_already_consumed`. Caught by the dedicated "a quote may only
ever produce one payment intent" test failing on its first real run —
fixed by reordering the checks (consumption check first), re-verified
passing immediately after.

A second issue was caught in the same test run: an 18-decimal
conversion test's own hand-calculated expected value was wrong (it
forgot to account for the base amount being 10,000 major units rather
than 1). Independently re-verified the correct value via Python before
fixing the test — `decimal-math.js` itself was correct throughout; only
the test's expectation was wrong.

---

## TESTED — exact totals, this session

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| `quote-engine.test.js` | 27 | 27 | 0 | 0 |
| `crypto-payments.test.js` | 27 | 27 | 0 | 0 |
| `payments.test.js` | 26 | 26 | 0 | 0 |
| `provider-certification.test.js` | 21 | 20 | 0 | 1 |
| `mpesa-provider-contract.test.js` | 9 | 9 | 0 | 0 |
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
| **TOTAL** | **316** | **284** | **0** | **32** |

Zero regressions against every prior phase. All 32 skips are the three
real-PostgreSQL suites, unrelated to this round.

## Success criteria — checked against the exact worked example

**KES 10,000 → fresh rate (0.0077, TEST_RATE_PROVIDER) → exact USDT
calculation (77 USDT gross) → CozyOS fee (2% = 1.54 USDT, `ROUND_UP`,
exact) → exact customer amount (75.46 USDT net) → quote ID → expiration
(30s default) → locked quote → payment intent** — demonstrated
end-to-end via direct script execution before any test was written,
then re-confirmed by the formal test suite.

- No floating-point financial errors — confirmed (BigInt-only path,
  float-trap test passes).
- No client authority — confirmed (tamper test, parameter-shape
  argument).
- No stale-rate acceptance — confirmed (`getFreshRate` health-gated
  test).
- No hidden fees — the fee is a real, queryable, versioned row; not
  hard-coded, not opaque.
- No historical fee mutation — confirmed empirically.
- No organization leakage — confirmed.
- No duplicate quote/payment misuse — confirmed (single-consumption
  test, after the real bug fix).
- No ledger effect from quote creation — confirmed (dedicated ledger-
  discipline test: 0 balance, 0 ledger rows after create+lock+consume).
- No fabricated live-provider evidence — `TEST_RATE_PROVIDER` labeling
  is structurally enforced (required field, never defaulted).

## Blocked / not done this round (disclosed, not hidden)

- LIVE RATE RUNTIME — BLOCKED, no real provider credentials/API access.
- No HTTP routes were added for quotes (registry-level foundation only,
  matching Phase 5.3 Step 1's own precedent and this round's own
  instruction not to build customer UI).
- Multi-provider rate aggregation — not built (no business requirement
  established yet; single-source-with-health-check is what exists).
- `fixed`-type fee calculation logic — schema supports it; only
  `percentage` was implemented and tested this round.
- Minimum/maximum payment limits — not built; no real provider-specific
  limits are known (per instruction: "if unknown, NOT YET AVAILABLE" —
  not fabricated).
- Network fee (`networkFee`/`networkFeeAsset`/etc.) — not built; no
  schema fields added this round since no real network-cost source
  exists to populate them meaningfully yet.
- CozyOS Coin — not started, not designed, per explicit instruction.
- No checkpoint was built, per explicit instruction.

---

## PHASE 5.3 — LIVE QUOTE & CONVERSION FOUNDATION COMPLETE

Stopping here for review, per instruction. Not connecting a real crypto
provider, not implementing Binance/M-Pesa/withdrawals/bank rails/CozyOS
Coin, not building customer UI, not creating a checkpoint.
