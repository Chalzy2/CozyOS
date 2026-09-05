# Phase 5.3 — Crypto Payment Foundation — Change Report

Baseline: Phase 5.2 tree (not yet checkpointed, per Phase 5.2's own
closing instruction — that checkpoint decision remains deferred, not
made this round either, per this round's own instruction #29).
`server/webauthn-rp/payments.js` confirmed unmodified in substance
before this round's additive work began.

---

## Source material: File Revival Record

**File**: supplied Binance-branded crypto payment HTML page
(`binance-cryptopayment (3).html`, 150 lines)

**Classification: REVIVED — legacy crypto payment UI/source (payment
mechanism only)**

**PAYMENT DATA extracted and revived:**
- 5 assets offered: USDT, BTC, SOL, BNB, MATIC
- Asset→network relationships (USDT: TRC20/Tron, BEP20/BSC, ERC20/
  Ethereum; BTC: mainnet, Native Segwit, and an invalid "BSC" entry —
  see below; SOL: Solana; BNB: BSC; MATIC: Polygon)
- Wallet-address structure (a plain string per asset+network pair)
- QR-payment behavior (external QR image service, encoding the raw
  address)
- Address-copy-to-clipboard UX
- Customer instruction: "Send payment ONLY using selected network"
- Payment confirmation workflow: manual screenshot/receipt via WhatsApp

**NON-PAYMENT/MARKETING DATA — identified, excluded entirely, never
discussed further:**
- "New User Reward" referral box
- Binance CPA referral link (`ref=CPA_00TZ2L450F`)
- KYC-completion reward promotion ("$100–$600 in trading fee rebates")

**Must be replaced (and were):**
- Client-side wallet authority (`const wallets = {...}` trusted blindly
  by the browser) → replaced by `crypto_destinations`, a server-side,
  admin-controlled, validated table.
- Raw hard-coded payment configuration → replaced by
  `crypto_network_asset_rules` + `crypto_destinations`, both real
  database tables with real constraints.
- Screenshot-as-confirmation workflow → replaced by
  `submitTransactionHash()` (candidate only) +
  `verifyTransaction()` (the one real authority), matching this round's
  explicit instruction that a screenshot must never itself create a
  ledger credit. The WhatsApp link itself was not preserved in any
  code — Phase 5.3 built no UI at all this round (see BLOCKED/NOT DONE
  below) — but the underlying principle (manual support may remain a
  *fallback*, never *authority*) is reflected in the architecture: no
  code path anywhere lets a support/manual action alone credit a
  payment.
- External QR dependency → not replaced this round (no UI was built at
  all); documented as legacy UI behavior, never payment authority, per
  instruction.
- Invalid/ambiguous asset/network combinations → this is the single
  most important concrete finding and fix of this round (see below).

**The critical discovery:** the source's own data contained
`"Bitcoin (BSC)": "0x2545509dbe9fa7e19af80352238281ba3391f781"` — a
0x-format EVM address labeled as a Bitcoin destination. Bitcoin's
blockchain cannot interpret that address at all; a real customer
following that instruction would lose funds. This is not a hypothetical
risk this report is speculating about — it was reproduced directly:
`setCryptoDestination()` rejects this exact combination with
`invalid_asset_network_combination`, verified by a dedicated regression
test (`the exact historical defect (Bitcoin labeled BSC, 0x-format
address) is rejected`).

---

## Repository-wide search (Step 3), this round

Confirmed, by direct search, that no existing crypto payment, wallet
registry, network registry, transaction-verification, or exchange-rate
infrastructure exists anywhere in the repository beyond what Phase 4/5.1/
5.2 already built (`PaymentRegistry`, `BillingRegistry`,
`OrganizationRegistry`, `audit_events`). This round's work is genuinely
new, built underneath the existing `PaymentRegistry` via a real provider
adapter — not a duplicate engine.

## What was built

**Schema** (`migrations/010_crypto_payments.sql` + `db.js` mirror):
`crypto_network_asset_rules` (the actual structural fix — an
(asset, network) pair and its required address format; "Bitcoin (BSC)"
is deliberately absent), `crypto_destinations` (admin-controlled,
organization-scoped, versioned like subscription pricing),
`crypto_exchange_rates` (real, empty until a real source exists — rate
stored as an exact decimal string, never a float), `crypto_transactions`
(candidate transactions, database-enforced double-spend/double-
consumption prevention via a unique index on `(network, transaction_hash)`),
`crypto_confirmation_policy` (per-network, admin-configurable, Core-
guarded via a `CHECK` constraint).

**`server/webauthn-rp/crypto-payments.js`** — `CryptoPaymentRegistry`:
address-format validation (real regex-based checks for EVM/Bitcoin-
base58/Bitcoin-bech32/Tron-base58/Solana-base58 — independently unit-
tested), destination management, confirmation policy, exchange-rate
CRUD (real, admin-gated; never fabricates a rate), payment intent
creation (server-resolves destination and re-validates the combination
even against a previously-valid stored row — defense in depth), and
`verifyTransaction()` — the one real authority, comparing an
independently-fetched chain record against the payment intent's own
stored metadata for network/asset/destination/amount, applying the
confirmation policy, and routing a genuine success through
`PaymentRegistry`'s existing event-processing machinery (reused, not
duplicated) to reach the existing ledger.

**`server/webauthn-rp/providers/crypto-provider.js`** — the real
`PaymentRegistry`-contract adapter for `providerId: 'crypto'`. Its
`verifyWebhook()` is repurposed as a real, HMAC-signed **internal**
event channel (crypto verification here is pull-based — CozyOS checks
the chain itself — so there is no genuine external crypto webhook in
this design). Reuses `verifyWebhookSignature()` (Phase 4) rather than
inventing a second authenticity mechanism.

**`server/webauthn-rp/test/test-only-blockchain-verifier.js`** —
TEST-ONLY, isolated, in-memory fixture. Never imported by `server.js`.

**`server/webauthn-rp/test/crypto-payments.test.js`** — 27 tests
covering every category in this round's own required test list.

## A real bug found and fixed during implementation (not assumed correct)

The first working version allowed `baseCurrency === asset` as a
"no conversion needed" shortcut for a crypto-denominated invoice. This
was **empirically tested and failed for real**:
`BillingRegistry.assertCurrency()` correctly rejects "USDT" (4 letters)
against its 3-letter ISO-4217 validation — because
`payment_intents.currency` is a shared, cross-provider business-currency
field, not a crypto-ticker field. Root cause: conflating two genuinely
different concepts. Fixed by removing the shortcut entirely — a crypto
payment intent now always requires a real, separately-configured
exchange rate, which is also more consistent with this round's own
"never fabricate a rate" instruction than a special-cased escape hatch
would have been. Verified via direct script execution before writing
the corresponding test.

## IMPLEMENTED / REUSED / REVIVED / EXTENDED / UNCHANGED

- IMPLEMENTED: schema (5 new tables), `crypto-payments.js`,
  `providers/crypto-provider.js`, `test-only-blockchain-verifier.js`,
  `crypto-payments.test.js` (27 tests).
- REUSED: `PaymentRegistry.createPaymentIntent()`/`getPaymentIntent()`/
  `processProviderEvent()` (crypto never writes `payment_intents` or the
  ledger directly), `BillingRegistry`'s ledger (no second crypto balance
  system), `OrganizationRegistry.isAuthorized()`, `verifyWebhookSignature()`
  (Phase 4), the existing `audit_events` table, `assertNonEmptyString`
  (Phase 2/4 export).
- REVIVED: the source HTML's payment concepts, per the File Revival
  Record above — never its code, never its client-side authority model.
- EXTENDED: none of Phase 4/5.2's files were modified — this round is
  purely additive (new files registering with the existing
  `PaymentRegistry` exactly like `cash` does).
- UNCHANGED: `payments.js`, `billing.js`, `server.js`, every prior
  phase's file. Confirmed by full regression re-run, zero regressions.
  The four locked AI Core files — not read, referenced, or modified.

## TESTED

Exact totals, this session:

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
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
| **TOTAL** | **262** | **230** | **0** | **32** |

Every skip is honest — the 3 real-PostgreSQL suites, unrelated to this
round's changes.

### Test coverage against this round's required list (section 27)

| Category | Covered |
|---|---|
| Asset/network valid/invalid | ✅ (including the exact historical defect) |
| Address valid/malformed/wrong-type | ✅ |
| Server-authoritative amount/currency/asset/network/destination | ✅ |
| Correct/wrong-asset/wrong-network/wrong-destination/insufficient/duplicate transaction | ✅ |
| Status: pending/unknown/succeeded/failed-path/expired-field-present | ✅ (pending, unknown, succeeded, mismatch-as-failure-path; expiry field is real and set, no expiry-sweep job built — see BLOCKED) |
| Security: client tampering, forged internal event, cross-org access | ✅ |
| Ledger: UNKNOWN/mismatch/PENDING → no effect; SUCCEEDED → exactly one; duplicate verification → no second effect | ✅ |

## BLOCKED — unchanged from Phase 5.1/5.2, explicitly not claimed otherwise

- Real blockchain runtime verification — **BLOCKED — REAL PROVIDER/
  RUNTIME ACCESS REQUIRED**.
- Real transaction detection / confirmation verification — **BLOCKED**.
- Real crypto webhook verification — not applicable to this design at
  all (pull-based, not push — see architecture notes above); the
  internal-event mechanism that exists is real but is not "external
  webhook certification."
- Real exchange-rate verification / a live rate feed — **BLOCKED — no
  reliable exchange-rate source configured**. `setExchangeRate()` is
  real and tested for manual/administrative entry; nothing fabricates a
  live market rate.
- Real crypto settlement / real provider certification — **BLOCKED**.

## NOT DONE this round (disclosed scope boundary, not an oversight)

- **No HTTP routes were added to `server.js`.** This round built and
  fully tested the registry-level foundation (`CryptoPaymentRegistry`,
  the adapter, the schema); exposing it via customer-facing routes
  (checkout flow, transaction-hash submission endpoint, admin
  destination-configuration endpoints) is additional integration work,
  not attempted this round, consistent with the requested outcome being
  "foundation ready for real provider integration," not a finished
  customer flow.
- **No QR/UI was built.** The source's QR concept (encode the payment
  request, not a raw address) was analyzed and the target data shape is
  documented in `createCryptoPaymentIntent()`'s returned metadata
  (asset, network, destination, amount, reference), but no actual QR
  generation or checkout UI exists yet.
- **Real exact-decimal conversion arithmetic between a configured rate
  and a specific crypto amount is not implemented** — `cryptoAmount` in
  a created intent's metadata is honestly `null` even when a real rate
  is configured, since per-asset decimal-places conventions (USDT=6,
  BTC=8, SOL=9, etc.) are not yet modeled and guessing would risk a real
  financial error. Flagged as a concrete, scoped follow-up.
- **No expiry-sweep job.** `expiresAt` is real and stored on every
  intent's metadata; nothing yet automatically transitions an expired,
  still-pending intent to `EXPIRED`. A verification attempt after expiry
  would currently still be evaluated on its own merits (match/mismatch/
  unknown) — worth flagging as a gap for real integration to close.

## Dependencies now ready for a real crypto provider

- A real adapter need only implement `createPayment`/`getPayment`/
  `refundPayment`/`cancelPayment`/`verifyWebhook`/`getCapabilities`/
  `mapProviderStatus` and register via `payments.registerProvider()` —
  no change to `PaymentRegistry`, `BillingRegistry`, or
  `CryptoPaymentRegistry` required.
- A real blockchain verifier need only implement `getTransaction(network,
  hash)` and `getConfirmations(network, hash)` to be usable by
  `verifyTransaction()` directly.
- A real rate source need only call `setExchangeRate()` (or a future
  scheduled job could call it) — the storage/expiry/audit machinery
  already exists and is tested.
- Real destinations for a real provider are added via
  `setCryptoDestination()`, which will refuse anything not matching a
  real, reviewed `crypto_network_asset_rules` entry — new asset/network
  combinations require a deliberate, reviewed addition to that table,
  not just a config edit.

---

## CRYPTO PAYMENT FOUNDATION READY FOR REAL PROVIDER INTEGRATION

Not "crypto payments certified." No fabricated runtime evidence. No
checkpoint built this round, per instruction #29 — stopping here for
review.
