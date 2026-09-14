# CozyOS Billing Architecture — Extension Boundary (Phase B3 foundation)

**Status: design boundary only. No payment provider is implemented.
No billing tables exist yet.** This document exists so the future
centralized CozyOS Billing system can be built on the same database
authority this Phase B1–B3 work established, instead of inventing a
second one.

## The rule this whole document exists to enforce

> No individual application maintains its own independent balance.
> Payment providers are adapters. They all feed one centralized
> CozyOS billing/ledger authority.

This mirrors the exact shape already proven twice in this codebase:
`RelyingParty` is the one authentication authority (WebAuthn, password,
and Firebase all converge on the same `sessions` table and the same
`resolveSession()`); `OrganizationRegistry` is the one organization
authority. Billing must be the same pattern a third time — one registry,
multiple input adapters, never a parallel source of truth.

## Where billing fits in the existing stack

```
Application (MpesaOS, ChurchOS, any CozyOS app)
    ↓
CozyOS Billing Registry          <- the one authority (future work)
    ↓
DatabaseAdapter (get/all/run/exec/transaction)   <- already built, Phase B1/B2
    ↓
SQLite OR PostgreSQL
```

A `BillingRegistry` class, when built, would follow the exact
conventions `rp.js` and `organizations.js` already establish:

- Wraps a `DatabaseAdapter` instance (`this.db`), never a raw `pg`/SQLite
  handle.
- Takes an injectable `now()` for testability, exactly like both
  existing registries.
- Writes to the *same* `audit_events` table `rp.js`/`organizations.js`
  already use — never a second audit log.
- Multi-step money-moving operations (e.g. "record a successful payment
  AND credit the wallet AND write the ledger entry") run inside
  `this.db.transaction()`, the same abstraction already proven in Phase
  B2 for password reset, TOTP enrollment, and organization creation.

## Phase 2 — Billing Foundation implemented (this update)

**Status: the server-authoritative foundation described below now exists
and is real, tested code — not a plan anymore.** This section records
what changed and, just as importantly, what the trust boundary now is.

### What is authoritative

`server/webauthn-rp/billing.js` (`BillingRegistry`) is the one real
authority for subscription plans, versioned pricing, subscriptions, and
wallet/ledger state — exactly the shape this document specified below,
built against the real `DatabaseAdapter`, the real `OrganizationRegistry`
(never reimplemented — `BillingRegistry` takes an `OrganizationRegistry`
instance and calls its real `isAuthorized()`), and the real shared
`audit_events` table `rp.js`/`organizations.js` already use.

Schema: `subscription_plans`, `subscription_plan_prices` (versioned —
see "historical pricing" below), `subscriptions`, `wallet_accounts`,
`wallet_ledger` — migration `006_billing.sql` (PostgreSQL) and a
faithful mirror in `db.js`'s `migrateAddBilling()` (SQLite). Deliberately
NOT created yet, per this document's own original scope boundary:
`invoices`, `payment_attempts`, `payment_transactions`, `provider_events`,
`refunds`, `credits`, `usage_records` — those remain future work once a
real payment provider is integrated.

Server API: `POST /billing/plans`, `POST /billing/plans/price`,
`POST /billing/organizations/subscriptions/{create,cancel,get,charge}`,
`POST /billing/organizations/wallet/get` — wired into
`server/webauthn-rp/server.js` following the exact route/error-mapping
conventions the existing `/organizations/*` routes already established.

### What is client cache (never authoritative)

`modules/billingEngine.js` (`window.CozyOS.Billing`) and
`core/modules/entitlement/entitlement-engine.js` are **preserved, not
deleted** — their domain concepts and design (respectively: plan/usage
lifecycle vocabulary, and fail-closed explainable entitlement merging)
remain genuinely good and are documented here rather than discarded.
**Neither is connected to the new server authority yet.** That wiring —
having the entitlement engine's plan layer read from a real server API
response instead of the client-only `BillingEngine` — is explicitly
**not done in this round** and is listed as remaining work below.

**Confirmed during this round's inspection:** `core/storage.js`'s "Cloud
Sync Engine" is a placeholder — it logs a sync message, sleeps 50ms, and
deletes the local queue item, with no `fetch`/`XMLHttpRequest`/network
call anywhere in the file. Nothing in the client billing/entitlement
world has ever been server-verified. This is the concrete reason neither
client engine could be trusted as an authority, and why this round built
the real one server-side instead of trying to make the client one real.

### Trust boundary, explicit

| Concern | Authoritative source |
|---|---|
| Plan catalog, pricing | `BillingRegistry` (server, real Postgres/SQLite) |
| Subscription state | `BillingRegistry` (server) |
| Wallet balance / ledger | `BillingRegistry` (server) — `wallet_accounts.balance_minor_units` is a transactionally-maintained cache of `wallet_ledger`, never an independent value |
| "Is platform admin" | `rp.js` `resolveSession()` — a route handler resolves this from the session cookie; it is never read from a request body |
| "Can this user act on this organization's billing" | `OrganizationRegistry.isAuthorized()` — real membership/role check, reused, not reimplemented |
| Client-displayed plan/entitlement info | `modules/billingEngine.js` / `entitlement-engine.js` — UI convenience only, per the trust boundary this document has always stated, now with a real authority to eventually defer to |

### Historical pricing, concretely

`subscription_plan_prices` is versioned: exactly one row per plan may
have `status='active' AND effective_until IS NULL` (enforced by a
partial unique index in both PostgreSQL and SQLite — verified: attempting
to insert a second "current" price directly, bypassing application code,
is rejected by the database itself, not just by `BillingRegistry`).
`subscriptions.current_price_id` locks a subscription to the exact price
version it was created against; changing a plan's price afterward never
moves that reference. `getPriceAt(planId, timestamp)` resolves what was
in effect at any past moment for exactly this "why was this org charged
X" auditability requirement.

### Offline limitations

No offline billing operations are supported, and none should be added
without a real synchronized, server-authoritative design — see the
"Cloud Sync Engine" finding above. Per the framework's offline-support
guidance: safe-to-cache (plan display, subscription status text) vs.
server-required (create/cancel subscription, any wallet mutation,
plan/price changes) should be classified before any offline UI work
begins; none of that classification work was needed for this round since
no offline UI was built.

### Remaining work (explicitly not done this round)

- Client/UI integration: `entitlement-engine.js`'s plan layer still reads
  the client-only `BillingEngine`, not the new server API. No UI was
  built against the new routes.
- Payment provider integration (M-Pesa, cards, etc.) and the
  `payment_attempts`/`payment_transactions`/`provider_events` tables this
  document already anticipated.
- Subscription renewal/expiry background processing (the schema supports
  `current_period_end`/`grace_period_ends_at`, but nothing yet acts on
  them automatically).
- Trial period logic (`trial_ends_at` exists in the schema; no code path
  currently sets a subscription to `trialing` — every subscription
  created this round starts `active` immediately).

## Phase 3 — Authenticator → Identity → Organization → Authorization → Billing → Entitlement integration

**Repository-wide discovery, re-run this round (not assumed from Phase
2):** confirmed no duplicate authentication, identity, organization, or
billing system exists anywhere in the repository. `core/security/auth-policy-engine.js`,
`login-decision-engine.js`, and `living-risk-engine.js` mention step-up/
reauthentication concepts, but belong to the same client-side security
module family as `entitlement-engine.js` — not the real server
authenticator. **Confirmed: `rp.js` (the real server authenticator) has
no step-up/reauthentication mechanism at all.** Per this round's own
instruction ("if not required by current architecture, document the
finding rather than inventing a new security mechanism"), this is
recorded rather than built.

### The trust chain — already real since Phase 2, now extended

```
CozyOS Authenticator (rp.js resolveSession())
       ↓
Trusted Session (session.userId, session.isPlatformAdmin — both
                 resolved server-side from the session cookie, never
                 a request body)
       ↓
Organization (OrganizationRegistry.isAuthorized() — real membership
              check, called by BillingRegistry itself, not
              re-implemented)
       ↓
Authorization (fail-closed: an unauthorized/unreachable check is
                always a denial)
       ↓
BillingRegistry (server/webauthn-rp/billing.js)
       ↓
PostgreSQL / SQLite (real DatabaseAdapter, real transactions)
       ↓
Entitlement (NEW this round: BillingRegistry.getEntitlementSnapshot())
       ↓
Applications (NOT wired up this round — see below)
```

Every billing route already authenticated via the real session and
authorized via the real `OrganizationRegistry` in Phase 2. Phase 3's
actual new work was the **Entitlement** layer, which genuinely did not
exist as real, resolvable server state before this round.

### The missing dependency this round found and built

`subscription_plans` had no notion of *which features/modules* a plan
licenses — Phase 2 built subscriptions and pricing, but nothing that
could answer "does this plan include feature X." Per the dependency-first
rule, this was built as a real, minimal, tested addition before any
entitlement resolution was attempted:

- `subscription_plan_features` (migration `007_billing_plan_features.sql`,
  mirrored in `db.js`) — `(plan_id, feature_key, enabled)`, admin-managed.
- `BillingRegistry.setPlanFeatures()` / `getPlanFeatures()` — platform-admin
  authority for writes (same posture as `setPlanPrice()`), open reads
  (feature catalogs aren't sensitive the way price/wallet data is).
- `BillingRegistry.getEntitlementSnapshot(actorUserId, organizationId)` —
  the real, authoritative, fail-closed answer: resolves the org's active
  subscription, its plan, and that plan's licensed features, returning
  `{ hasSubscription, planKey, status, licensedModules[], currentPeriodEnd }`.
  **No subscription → `licensedModules: []`, never "everything enabled."**
- `POST /billing/organizations/entitlement` — the real server API route.
  Organization-scoped, authenticated, authorized — every value in the
  response is server-resolved, never accepted from the request body.

### Why `entitlement-engine.js` was NOT modified this round

`core/modules/entitlement/entitlement-engine.js`'s interface
(`getSubscriptionSnapshot()`, `isFeatureLicensed()`) is **synchronous** —
it reads directly from the in-memory client `BillingEngine`.
`BillingRegistry.getEntitlementSnapshot()` is necessarily **async** (it
performs real database reads). Bridging these safely requires either
making `entitlement-engine.js`'s checks async (a real behavioral change
to a file this project has twice now said to preserve, not modify) or
building a client-side cache layer populated ahead of time from real
`POST /billing/organizations/entitlement` responses (a real caching/
invalidation design decision). Both are genuine, separate pieces of work
— not something to improvise under this round's scope. **This file
remains untouched.** The server half of the eventual bridge (this
round's new endpoint) is built and tested; the client half is recorded
as explicit follow-up, not fabricated as done.

### Client tampering — explicitly tested, not just claimed

Four dedicated tests prove specific forged-field attacks have no effect:
a body containing `"isPlatformAdmin": true` from a non-admin session
still returns `platform_admin_required`; a body containing forged
`price`/`amountMinorUnits` fields alongside a legitimate subscription
create/charge still results in the real server-resolved price being
charged; a body naming another organization's real `organizationId`
from an outsider's real session still returns `not_authorized`, never
that organization's data.

### Final-audit fix (recorded, not silently absorbed)

The Phase 2 final security audit found that three read methods
(`getActiveSubscription`, `getWalletAccount`, `getWalletLedger`) did not
self-enforce authorization the way every write method in
`BillingRegistry` already did — they relied on the calling route to
check first. Fixed to self-enforce regardless of caller; see
`docs/builder/knowledge/PHASE2-BILLING-FOUNDATION-CHANGE-REPORT.md` for
the full finding and regression test added.

---



Listed here so a future migration can be designed deliberately rather
than improvised, and so nothing in this phase accidentally forecloses
it. Table names are provisional.

| Table | Purpose |
|---|---|
| `subscription_plans` | Catalog of what can be subscribed to (price, interval, entitlement set) — platform-defined, not per-organization |
| `subscriptions` | Which `organizations.id` (or `users.id`, for individual billing) holds which plan, and its current state |
| `entitlements` | What a subscription/wallet balance actually unlocks — resolved at authorization time, same "deny-over-allow, re-verified every time" posture `organizations.js`'s `isAuthorized()` already uses |
| `wallet_accounts` | One row per billable entity (user or organization) — the single balance authority the "no independent balance" rule refers to |
| `wallet_ledger` | Append-only. Every balance change is a ledger row, never a bare balance mutation — mirrors `audit_events`'s append-only, never-updated posture |
| `invoices` | Human-facing billing documents, generated from ledger state, never the ledger itself |
| `payment_attempts` | One row per attempt to move money, before success/failure is known — exists so a crashed request never becomes an untraceable payment |
| `payment_transactions` | A settled, provider-confirmed payment attempt — immutable once written |
| `provider_events` | Raw webhook/callback payloads from M-Pesa, card processors, etc., stored before interpretation — the provider adapter's "what actually happened" record, kept separately from `payment_transactions`'s "what CozyOS decided it means" |
| `refunds` | Reversal of a `payment_transactions` row — never a deletion or edit of the original |
| `credits` | Non-payment balance additions (goodwill, promotions) — kept distinct from `payment_transactions` so the ledger can always show *why* a balance changed |
| `usage_records` | Metered/usage-based billing inputs, if CozyOS ever needs them — feeds `entitlements`, never writes `wallet_ledger` directly |

## Phase 4 — Universal Payment Provider Infrastructure

**Repository-wide discovery, this round:** `core/modules/payment-provider/`
(`ProviderRegistry`, `ProviderManager`, `RoutingEngine`, `CapabilityEngine`,
`FailoverEngine`, `HealthMonitor`, public façade
`cozy-payment-provider-engine.js`) and `core/modules/payment-channel/`
are real, well-designed CLIENT-SIDE infrastructure — already implementing
a genuine adapter-method contract (`createPayment`/`verifyPayment`/
`refund`/`cancel`/`getCapabilities`/etc.) and honestly disclosing its own
scope: its own Canonical Ownership Declaration states it does **not**
own "Balances, Transactions, Invoices, Accounting, Ledger, Taxes, Wallet"
(explicitly "Financial Platform's domain") and never stores secrets/API
keys ("Vault's domain; this engine only requests them, never stores
them"). Its own `mpesa-provider.js` honestly discloses "No real M-Pesa
API credentials exist anywhere in this platform," and its `cash-provider.js`
is honestly disclosed as real but purely in-memory (a `Map()` that
vanishes on page reload, never server-persisted).

**This confirms, rather than contradicts, this round's architecture:**
the existing engine explicitly says ledger/wallet/financial-authority is
someone else's job. `server/webauthn-rp/payments.js`
(`PaymentRegistry`) is that missing job — real persistence, real
organization isolation via the existing `OrganizationRegistry`, real
idempotency enforced by the database itself, real ledger integration via
the existing `BillingRegistry`, real `audit_events` — reusing the
existing engine's adapter-method vocabulary for interface consistency,
never duplicating its code.

### Trust chain (extends Phase 3's, unchanged upstream of Payments)

```
CozyOS Authenticator → Trusted Session → Organization → Authorization
       ↓
PaymentRegistry (server/webauthn-rp/payments.js)
       ↓
Adapter (cash — the one real one this round)
       ↓
BillingRegistry.recordLedgerEntry() (real, transactional, audited)
       ↓
PostgreSQL / SQLite
```

### What is real this round

- Schema: `payment_intents` (server-resolved amount/currency, canonical
  status, database-enforced idempotency via a partial unique index on
  `(organization_id, idempotency_key)`) and `payment_events`
  (append-only, mirrors `wallet_ledger`/`audit_events`'s own posture —
  the reconciliation foundation for when a real provider exists to
  reconcile against).
- `PaymentRegistry` — provider-neutral, `registerProvider()` validates
  adapter interface completeness (same posture as the existing client
  `ProviderRegistry.registerProvider()`), `createPaymentIntent()`/
  `cancelPaymentIntent()`/`refundPayment()`, all organization-scoped and
  authorized via the existing `OrganizationRegistry`.
- **A real bug found and fixed during implementation, not assumed
  correct:** the first working version tried to compose
  `BillingRegistry.recordLedgerEntry()` inside `PaymentRegistry`'s own
  transaction by swapping in a transaction-scoped `db` — this failed for
  real (`node:sqlite` correctly threw "cannot start a transaction within
  a transaction"), because `recordLedgerEntry()` always opens its own
  top-level transaction. Fixed by extracting a transaction-aware core
  (`BillingRegistry._recordLedgerEntryWithinTransaction()`) that
  `recordLedgerEntry()` itself now calls inside its own transaction, and
  that `PaymentRegistry` calls directly inside its own — the same
  `_audit`/`_auditWith` split every registry in this codebase already
  uses. Verified empirically end to end (cash payment → real wallet
  credit → real partial refund → real wallet debit) before writing any
  test for it.
- `server/webauthn-rp/providers/cash-provider.js` — the one real, fully
  working, fully tested adapter this round. Cash requires no external
  API, credentials, or network access, so unlike every other payment
  method, it can be genuinely complete rather than a disclosed stub.
- `verifyWebhookSignature()` — a real, provider-neutral HMAC verification
  primitive (`node:crypto`), tested with genuinely computed signatures:
  valid signature accepted, tampered payload rejected even with the
  original signature, wrong secret rejected, missing/malformed signature
  rejected without throwing. No real provider calls this yet (none is
  connected) — the primitive itself is real and independently correct.
- 7 new HTTP routes (`/payments/intents/{create,get,cancel,refund}`),
  authenticated/authorized exactly like every other billing route.

### What is explicitly BLOCKED this round — not fabricated

Per this round's own instruction never to fabricate provider runtime
evidence: **no real online, mobile-money, bank, or crypto adapter was
implemented.** This environment has no real M-Pesa/card-processor/crypto
provider credentials and no network access to reach any external payment
API (the same structural constraint that applied to every real-Postgres
test throughout this entire engagement). Building a "real" adapter for
any of these without real credentials would mean fabricating provider
runtime evidence — explicitly prohibited. The provider-neutral foundation
and the interface contract (`REQUIRED_ADAPTER_METHODS`) are ready for a
real adapter to be added the moment real credentials exist, without
touching `PaymentRegistry`, `BillingRegistry`, or the entitlement layer —
the extensibility goal Phase 4 asks for.

### Reconciliation foundation, not fake reconciliation

`payment_events`' append-only history is the foundation Phase 4 asks for
when full automated reconciliation is out of scope: CozyOS's own event
history exists and is queryable; comparing it against a real provider's
records requires a real provider connection, which doesn't exist yet.
No fake reconciliation process was built.

## Phase 5.2 — Provider Integration Foundation & Certification Harness

Status: real, tested foundation built; no real external provider
connected. See `docs/builder/knowledge/PHASE5.2-PROVIDER-INTEGRATION-FOUNDATION-CHANGE-REPORT.md`
for the full accounting. Highlights: canonical status model gained
`UNKNOWN` (never a synonym for `FAILED` — critical for async providers
like M-Pesa STK Push); `PaymentRegistry.processProviderEvent()` gives
real, database-enforced duplicate-webhook detection and amount/currency
matching; a reusable certification harness now exists and has been
applied to the real cash adapter and one clearly-labeled, isolated
test-only adapter (never registered with the real server); a disclosed
M-Pesa adapter stub (`server/webauthn-rp/providers/mpesa-provider.js`)
prepares the real boundary without fabricating connectivity — every
operational method honestly throws until real Daraja credentials exist.

## Phase 5.3 — Crypto Payment Foundation

Status: real, tested crypto payment foundation built underneath
`PaymentRegistry`, following the same architecture as `cash`. No real
blockchain runtime verification exists or is claimed. Full accounting in
`docs/builder/knowledge/PHASE5.3-CRYPTO-PAYMENT-FOUNDATION-CHANGE-REPORT.md`.

Source material was a supplied Binance-branded crypto payment HTML page,
inspected for its payment mechanism only (referral/marketing content
excluded entirely, untouched). Its own data contained a genuine defect —
"Bitcoin (BSC)" labeled with a 0x-format EVM address, which Bitcoin's
blockchain cannot interpret — reproduced directly and now structurally
prevented by `crypto_network_asset_rules` + real address-format
validation (`server/webauthn-rp/crypto-payments.js`). A transaction hash
is always a candidate, never proof; `verifyTransaction()` is the one
real authority, independently checking network/asset/destination/amount/
confirmations before any ledger effect, reusing `PaymentRegistry`'s
existing event machinery rather than duplicating it. No HTTP routes or
UI were built this round — this is registry-level foundation only, per
its own report's disclosed scope boundary.

## Phase 5.3 Step 2 — Live Quote, Rate & Conversion Foundation

Status: real, tested, exact-decimal quote engine built underneath the
Phase 5.3 Step 1 foundation. Full accounting in
`docs/builder/knowledge/PHASE5.3-STEP2-LIVE-QUOTE-CONVERSION-FOUNDATION-REPORT.md`.
Highlights: `server/webauthn-rp/decimal-math.js` (BigInt-exact
arithmetic, zero floating-point anywhere), `financial_assets`
(authoritative per-asset decimals — KES=2, USDT=6, BTC=8, etc.),
`crypto_fee_configs` (versioned exactly like subscription pricing),
`quotes` (immutable-once-created rate/fee/amount snapshots),
`server/webauthn-rp/quote-engine.js` (`QuoteEngine` — createQuote →
lockQuote → createPaymentIntentFromQuote). `crypto_exchange_rates`
(Phase 5.3 Step 1) extended with `rate_type` (required, never
defaulted, so a test/manual rate can never be mistaken for live data),
`bid`/`ask`/`observed_at`, and real freshness classification
(`CURRENT`/`STALE`/`EXPIRED`) — a stale rate can never silently produce
a quote. LIVE RATE RUNTIME remains BLOCKED — no real rate provider
credentials or network access exist.

**File Revival Record, updated:** the supplied Binance-branded crypto
payment HTML (Phase 5.3 Step 1) remains classified REVIVED — legacy
crypto payment UX/source. Its payment-relevant concepts (asset
selection, network selection, destination display, QR concept, copy-
address UX, selected-network warning) are what this and the prior
round's work is built from. Its referral/marketing content (Binance
CPA link, KYC reward promotion, affiliate functionality) remains
excluded entirely — never touched, never migrated, in either round.

## Payment providers are adapters, not authorities

**Status: implemented, Phase 4.** The pattern anticipated here is real
now: `server/webauthn-rp/payments.js`'s `PaymentRegistry` defines the
uniform adapter surface (`createPayment()`/`verifyPayment()`/
`refundPayment()`/`cancelPayment()`/`getCapabilities()`/`mapProviderStatus()`),
writing only into `payment_intents`/`payment_events` — never directly
into `wallet_ledger`. `BillingRegistry` remains the only thing ever
allowed to write a `wallet_ledger` row (now via its own
`_recordLedgerEntryWithinTransaction()` core, which `PaymentRegistry`
calls, not duplicates), exactly as `rp.js` is the only thing allowed to
flip `is_platform_admin`.

## What this phase (the original, pre-Phase-2 document) deliberately did NOT do — historical record, superseded below

*(Preserved as written at the time — do not edit history. Everything it
describes as "not yet done" has since been done; see the Phase 2/3/4
sections above for what actually exists now.)*

- No billing tables were added to the migrations directory.
- No `BillingRegistry` class was created.
- No payment provider code exists.

Per the Phase B3 instruction: *"Do NOT prematurely create payment
tables unless needed for this foundation. Instead, document the
extension boundary."* This document was that boundary, and has since
been updated in place, phase by phase, as each boundary was actually
crossed with real, tested code — never by silently rewriting this
historical section to pretend it said something else.
