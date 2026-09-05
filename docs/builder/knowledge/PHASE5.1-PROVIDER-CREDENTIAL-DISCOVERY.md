# Phase 5.1 — Provider & Credential Discovery Report

Baseline confirmed: working tree matches
`CozyOS-Merged-0003-Phase4-PAYMENT-PROVIDER-FOUNDATION-VERIFIED-FULL-CHECKPOINT.zip`
(spot-checked `server/webauthn-rp/payments.js`, hash matches recorded
checkpoint value exactly). That checkpoint was not modified, rebuilt, or
reinterpreted. **No implementation was performed this round** — this is
discovery only, per the phase boundary.

---

## A. Existing payment architecture (OBSERVED)

The actual dependency chain, confirmed by re-reading `server.js`'s route
handlers directly:

```
CozyOS Authenticator (rp.js resolveSession())
       ↓
Trusted Session (session.userId, session.isPlatformAdmin)
       ↓
Organization (OrganizationRegistry.isAuthorized())
       ↓
PaymentRegistry (server/webauthn-rp/payments.js)
       ↓
Provider Adapter (cash — the only one registered)
       ↓
BillingRegistry.recordLedgerEntry() / _recordLedgerEntryWithinTransaction()
       ↓
PostgreSQL / SQLite (wallet_ledger, wallet_accounts, audit_events)
```

This matches the example diagram in the Phase 5 prompt exactly — no
correction needed. `PaymentRegistry` never writes to the ledger directly;
it always goes through `BillingRegistry`.

**Separate, parallel, NOT part of this chain:** `core/modules/payment-provider/`
(client-side `ProviderRegistry`/`ProviderManager`/`RoutingEngine`/
`CapabilityEngine`/`FailoverEngine`/`HealthMonitor`) and
`core/modules/payment-channel/` are real, browser-only infrastructure —
they never touch the server, the database, or organization isolation.
`core/plugins/mpesaOS-*.js` (Till/Paybill/Float coordinators) are a
**third, distinct** concern: a business-management application for
M-Pesa agents/merchants to track their own till/paybill/float records
manually — confirmed by direct inspection to contain zero `fetch()`,
`XMLHttpRequest`, or Daraja API references anywhere. It is not a payment
rail integration at all.

## B. Existing providers/adapters (OBSERVED)

| Adapter | Location | Real API calls? |
|---|---|---|
| Cash (server) | `server/webauthn-rp/providers/cash-provider.js` | N/A — cash needs none. Fully real, fully tested (Phase 4). |
| Cash (client) | `core/modules/payment-provider/cash-provider.js` | N/A — same reasoning, browser-only, in-memory. |
| M-Pesa (client) | `core/modules/payment-provider/mpesa-provider.js` | **No.** Every operational method (`createPayment`/`verifyPayment`/`refund`/`cancel`) explicitly throws `"real Daraja API integration is not yet implemented"` even once `configure()` is called with credentials. This is a disclosed interface shell, not a partial integration. |

No Stripe, PayPal, Payoneer, Flutterwave, Pesapal, Paylor, Airtel Money,
or any crypto/blockchain adapter exists anywhere in the repository —
confirmed by precise repository-wide search (excluding false-positive
matches on the generic `node:crypto` module, which appears throughout
the codebase for unrelated hashing/UUID purposes and is not a
cryptocurrency reference).

## C. Credentials (OBSERVED — no secret values printed)

| Provider | Config location exists? | Usable? | Sandbox reachable? | Runtime access? | Secrets exposed? |
|---|---|---|---|---|---|
| M-Pesa | No — `core/config.js` contains zero payment/provider fields (only an unrelated `defaultAIProvider: "gemini"`). No `.env` file exists anywhere in the repository (confirmed, consistent with every prior phase's hygiene scan). | NO | NO — this sandbox has no outbound network access (confirmed repeatedly across every phase of this engagement, including a direct `apt-get install postgresql` attempt in an earlier phase that failed with the same egress restriction) | NO | NO |
| Any other named provider | No | NO | NO | NO | NO |

**No credentials of any kind exist for any payment provider anywhere in
this repository or this environment.**

## D. Provider capability matrix

| Capability | Cash (real) | M-Pesa (Daraja, per current official research — not yet built) |
|---|---|---|
| Payment creation | YES (synchronous) | YES — STK Push (`/mpesa/stkpush/v1/processrequest`), asynchronous |
| Status retrieval | YES (trivial — no external system) | YES — dedicated query endpoint, useful when a callback is missed |
| Cancellation | YES | Not applicable in the same sense — an STK push either completes, times out, or is declined by the customer on their phone |
| Refunds | YES (full/partial) | Not a standard Daraja consumer-facing operation; reversals exist but are a distinct, restricted operation |
| Webhooks/callbacks | N/A (no async provider events) | YES — required (`CallBackURL`); asynchronous by design, the primary way a result is learned |
| Idempotency | Enforced by CozyOS's own DB unique index | Provider-side: Safaricom may retry callbacks — the integration must itself check "is this order already paid" before acting, confirmed by current documentation |
| Reconciliation | `payment_events` append-only log (Phase 4 foundation) | Would need the same foundation plus a status-query reconciliation job for missed/delayed callbacks |

## E. API research (OBSERVED — current, not assumed)

**M-Pesa Daraja API** — researched via current documentation this
round, not recalled from training data:
- **Current API/product:** Daraja API (Safaricom's RESTful HTTPS gateway
  to M-Pesa). Not deprecated — actively documented, current as of
  research conducted this session.
- **Authentication:** OAuth2 client-credentials — Base64(ConsumerKey:ConsumerSecret)
  sent as Basic Auth to `/oauth/v1/generate`, returns a Bearer token
  valid ~3599 seconds (~1 hour), must be refreshed.
- **Sandbox:** Yes — `sandbox.safaricom.co.ke`, with a documented fixed
  test phone number (`254708374149`); no real money moves in sandbox.
- **Primary payment flow:** STK Push (Lipa Na M-Pesa Online) —
  `POST /mpesa/stkpush/v1/processrequest`, requires shortcode, a
  Daraja-issued passkey, a timestamp-derived password, amount, payer
  phone, and a `CallBackURL`. **Response is asynchronous** — the
  immediate API response only acknowledges the request was accepted;
  the actual result arrives later via the callback.
- **Webhook/callback mechanism:** Required, not optional — this is how
  Daraja communicates the real outcome. Current documentation explicitly
  warns integrations must handle callback retries idempotently.
- **Currencies/region:** Kenyan Shilling (KES), Kenya-only for this
  specific Daraja instance (sister portals exist for Tanzania,
  Mozambique, DRC, Ghana, each with separate credentials/accounts —
  **not** the same credential working across countries).
- **Refunds:** Not a first-class consumer refund API in the same shape
  as a card processor; reversal is a distinct, more restricted
  operation.
- **Fees:** Tiered merchant rate (roughly 0.5–1% typically), arranged
  through a Safaricom relationship manager — not a self-serve sandbox
  concern, but relevant to eventual production account setup.

**Whether CozyOS's available credentials/account can use these
capabilities:** not applicable — no credentials exist, so this cannot be
evaluated (OBSERVED absence of the prerequisite, not a claim about
capability once credentials exist).

No other provider's current API was researched this round, since none
has any existing code, credentials, or repository evidence suggesting
it's a candidate — researching an arbitrary provider with zero
supporting evidence in this codebase would be speculative rather than
evidence-driven.

## F. Blocked providers

**M-Pesa (Daraja): BLOCKED** — reason: no credentials exist anywhere in
this repository or environment, and this sandbox has no network access
to reach `sandbox.safaricom.co.ke` even if credentials were supplied.
Not FAILED — genuinely untested, would very likely work given real
credentials and real network access, based on current, well-documented,
non-deprecated API behavior.

**Every other named provider (Stripe, PayPal, Payoneer, Flutterwave,
Pesapal, Paylor, Airtel Money, any crypto/blockchain rail): BLOCKED** —
reason: no existing code, no credentials, no evidence any of these were
ever planned for this specific integration point. Not FAILED — simply
not yet attempted, and no repository evidence exists to prioritize
researching one over another beyond M-Pesa's regional fit and existing
partial code.

## G. First candidate (INFERRED, evidence-based — not implemented this round)

**M-Pesa (Daraja API) is the strongest first candidate**, based on
actual evidence, not assumption:
- Existing partial code already anticipates the exact real credential
  shape (`consumerKey`/`consumerSecret`/`shortcode`) — confirmed against
  current official documentation, not a guess.
- Every other CozyOS module using KES as a currency, and the entire
  existing `mpesaOS-*` business-plugin family, indicates Kenya/M-Pesa is
  this platform's actual target market — a real architectural signal,
  not a preference.
- Current API is well-documented, has a genuine free sandbox, and its
  asynchronous/webhook/idempotency shape maps cleanly onto the
  provider-neutral foundation Phase 4 already built (canonical status
  `PENDING`/`PROCESSING` before a webhook resolves to `SUCCEEDED`/`FAILED`
  fits STK Push's async nature directly).
- **However, this candidacy is currently un-actionable**: no credentials
  exist, and this environment cannot reach the sandbox even with them.
  Phase 5.2 cannot begin until real Daraja sandbox credentials are
  supplied AND executed from an environment with real network access
  (the same structural pattern already established for every real-
  PostgreSQL test throughout this engagement — Termux, not this
  sandbox).

## H. Gaps Phase 5.2 must resolve before real integration

1. Real Daraja sandbox credentials (Consumer Key, Consumer Secret,
   shortcode, passkey) must be obtained and supplied from outside this
   sandbox.
2. A publicly reachable `CallBackURL` must exist for Daraja to deliver
   webhook results to — this sandbox's server is not internet-reachable;
   this needs to run somewhere Safaricom's servers can actually reach.
3. **MAPPING GAP, canonical status:** Daraja's STK Push has no single
   "declined" status distinct from "timed out" in the same way a card
   decline is instant — current documentation shows the customer has 60
   seconds to enter their PIN, and a non-response vs. an explicit
   cancellation may need to map to `FAILED` vs. `EXPIRED` differently;
   this needs real sandbox testing to observe actual result codes, not
   assumption.
4. **MAPPING GAP, refunds:** Daraja has no direct equivalent to
   `refundPayment()` in the same shape cash and `PaymentRegistry`
   currently model — a real "reversal" operation exists but is more
   restricted; the adapter's `refundPayment()` implementation will need
   to honestly reflect this rather than fake symmetry with cash.
5. Webhook signature/authenticity verification mechanism for Daraja
   specifically needs to be confirmed against current documentation
   before implementation — this round's research did not find a
   HMAC-signature scheme analogous to Stripe's; Daraja's authenticity
   model may rely on IP allowlisting/mutual TLS rather than a payload
   signature, which would mean `payments.js`'s existing
   `verifyWebhookSignature()` primitive (built provider-neutral in
   Phase 4) may not apply as-is to this specific provider — needs
   dedicated research before Phase 5.2 implementation, not assumed to
   just work.
6. Idempotency: Daraja's own documented callback-retry behavior means
   the webhook handler must check current payment_intent status before
   acting — `PaymentRegistry`'s existing idempotency (keyed on
   organization + client-supplied `idempotencyKey`) covers *creation*
   duplication, not *webhook* duplication; a webhook-level idempotency
   check (e.g. keyed on Daraja's own transaction reference) is
   additional work not yet built.

## I. Security findings

- No secrets of any kind exist in this repository — confirmed, not
  merely asserted (no `.env` files, no populated credential fields in
  `core/config.js`, no hardcoded API keys anywhere in the payment-related
  search).
- The existing client-side `Vault` engine (`core/modules/vault/cozy-vault-engine.js`)
  is real, well-designed secret-management infrastructure — but it is
  **browser-only** (`window.CozyOS`), cannot run in the Node.js server
  process, and its own documented storage providers besides "memory"
  (HSM/Cloud KMS/Azure/AWS/GCP/HashiCorp) are honestly disclosed as not
  built. **This is not directly reusable for server-side provider
  credentials.**
- The server already has a real, working convention for server-side
  configuration: `process.env.COZY_*` (confirmed in `static-boundary-server.js`/
  `bootstrap-admin.js` — `COZY_DATABASE_URL`, `COZY_RP_ID`,
  `COZY_FIREBASE_PROJECT_ID`, etc.). **This is the correct, already-
  reusable pattern for provider credentials once they exist** (e.g.
  `COZY_MPESA_CONSUMER_KEY`) — no second secret-management system should
  be introduced for this purpose.
- `verifyWebhookSignature()` (Phase 4) is real and correctly implemented
  HMAC verification, but per gap #5 above, it is not yet confirmed
  whether Daraja specifically uses an HMAC-signature scheme at all —
  this must not be assumed compatible without dedicated verification.

## J. Changes this round

- IMPLEMENTED: none.
- REUSED: none (discovery only; no code was integrated).
- REVIVED: none.
- EXTENDED: none.
- UNCHANGED: the entire Phase 4 checkpoint, all payment/billing/
  organization/identity code, `core/modules/payment-provider/`,
  `core/modules/payment-channel/`, `core/modules/vault/`,
  `core/plugins/mpesaOS-*.js` — all inspected, none modified.
- DEPRECATED/LEGACY: `core/modules/payment-provider/mpesa-provider.js`
  remains correctly self-disclosed as an interface shell with no real
  Daraja API calls — not modified, not upgraded, status unchanged.
- TESTED: nothing new (discovery only). Phase 4's existing tests were
  not re-run this round since no code changed — the Phase 4 checkpoint's
  own recorded regression evidence (215 tests, 188 pass, 27 honest skip)
  stands unchanged and unclaimed as re-verified this round.
- NOT RUN: any real Daraja API call — no credentials, no network access.
- BLOCKED: every external payment provider, for the reasons in section F.

---

## File Revival Records

**`core/modules/payment-provider/provider-registry.js`,
`provider-manager.js`, `routing-engine.js`, `capability-engine.js`,
`failover-engine.js`, `health-monitor.js`,
`cozy-payment-provider-engine.js`** (client-side engine family)
- Current purpose: client-side provider registration/routing/failover/
  health for merchant-facing payment UI.
- Useful functionality: real adapter-interface validation, real
  capability discovery, explicit Canonical Ownership Declaration stating
  it does not own ledger/wallet/secrets.
- Classification: **UNCHANGED** (already REVIVED conceptually in Phase 4
  — its adapter vocabulary informed `PaymentRegistry`'s interface,
  without duplicating its code).
- Participate in Phase 5? Only as a future client-side UI layer once a
  real server provider exists to display status for — not itself part
  of real provider connectivity.

**`core/modules/payment-provider/cash-provider.js`** (client)
- Classification: **UNCHANGED**, LEGACY/PRESERVED relative to the real
  server-side `server/webauthn-rp/providers/cash-provider.js` built in
  Phase 4, which is now the authoritative cash implementation.
- Participate in Phase 5? No — cash is already complete; Phase 5 is
  about external rails.

**`core/modules/payment-provider/mpesa-provider.js`** (client)
- Current purpose: disclosed interface shell for a future M-Pesa
  integration; correctly throws "not yet implemented" on every
  operational call.
- Historical purpose: same — this was never a working integration at
  any point, per its own header.
- Useful functionality discovered: the exact real credential shape
  (`consumerKey`/`consumerSecret`/`shortcode`) it expects matches current
  official Daraja documentation precisely — genuinely useful groundwork,
  not a discard candidate.
- Classification: **LEGACY/PRESERVED.** Not modified. A real server-side
  M-Pesa adapter, when eventually built, should reuse this same
  credential-shape convention for consistency, but will need to be a new
  file under `server/webauthn-rp/providers/` (Node.js, not browser) —
  not an edit to this client file, since the runtime environments are
  fundamentally different.
- Participate in Phase 5? As a reference for credential shape and
  disclosed scope only — not executed, not modified, not the actual
  integration point.

**`core/plugins/mpesaOS-till.js` / `mpesaOS-paybill.js` / `mpesaOS-float.js`
/ `mpesaOS.js`**
- Current purpose: business-management application for M-Pesa
  agents/merchants (manual till/paybill/float record-keeping).
- Classification: **UNCHANGED.** Confirmed distinct from real Daraja API
  connectivity — zero network calls anywhere in these files.
- Participate in Phase 5? No — different domain (business management
  tooling, not payment rail integration).

**`core/modules/vault/cozy-vault-engine.js`** (and its internal modules)
- Current purpose: real, well-designed client-side secret management
  (AES-GCM encryption, key/certificate/token lifecycle, rotation,
  health).
- Useful functionality discovered: genuinely real encryption for its
  "memory" provider; explicit, structurally-enforced rule that secrets
  are never logged or exported in plain text.
- Classification: **UNCHANGED.** Not reusable for server-side provider
  credentials (browser-only runtime) — this is a real architectural
  finding, not a decision to duplicate it. The server's existing
  `process.env.COZY_*` convention remains the correct pattern for
  provider secrets once real ones exist.
- Participate in Phase 5? No, for server-side credential storage
  specifically. Could remain relevant for any future client-side
  secret needs unrelated to this phase.

**`server/webauthn-rp/payments.js`, `billing.js`, `organizations.js`,
`rp.js`, `database-adapter.js`**
- Classification: **UNCHANGED**, all confirmed still the sole
  authoritative implementations of their respective concerns — no
  duplicate found, none created.

---

## Evidence classification summary (per section 5.1.11)

- **OBSERVED:** the entire existing codebase's payment/provider/vault/
  credential landscape — directly inspected, file by file, this round.
- **VERIFIED:** nothing new this round (no runtime testing was
  performed — correctly, since this is discovery only).
- **INFERRED:** M-Pesa as the strongest first candidate — an
  architectural inference from regional signals (KES usage, existing
  `mpesaOS-*` plugins, existing partial adapter code), not a claim that
  integration will succeed.
- **NOT RUN:** any real API call to any provider.
- **BLOCKED:** every named external provider — no credentials, no
  network access, both independently confirmed.

No conclusion in this report claims "credentials exist" implies
"provider works," or "API documentation exists" implies "integration is
verified," or "adapter exists" implies "real provider connectivity is
verified." Every claim above is labeled per the evidence actually
found.

---

## PHASE 5.1 — PROVIDER & CREDENTIAL DISCOVERY COMPLETE

No provider adapter was created. `PaymentRegistry` and the canonical
payment model were not altered. No credentials were added or invented.
No webhook responses were fabricated. No provider was marked FAILED.
The Phase 4 checkpoint was not modified, rebuilt, or reinterpreted.

Not proceeding to Phase 5.2 pending review of this discovery report.
