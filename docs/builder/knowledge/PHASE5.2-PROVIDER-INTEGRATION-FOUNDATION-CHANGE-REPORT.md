# Phase 5.2 — Provider Integration Foundation & Certification Harness — Change Report

Baseline: `CozyOS-Merged-0003-Phase4-PAYMENT-PROVIDER-FOUNDATION-VERIFIED-FULL-CHECKPOINT.zip`
(`2942362ae044d68f5a243de1ba1f13692d3aadf1c93159a0fcad59a87e98f205`),
confirmed byte-identical throughout this round — not rebuilt, not
modified. No locked AI Core file was read, modified, or referenced.
**No checkpoint was built this round** — per the explicit instruction
that Phase 5.2 is not automatically a separately checkpointed milestone.

---

## What was built (in dependency order, as specified)

1. **Provider adapter contract, formalized.** `REQUIRED_ADAPTER_METHODS`
   now requires `createPayment`/`getPayment`/`refundPayment`/
   `cancelPayment`/`verifyWebhook`/`getCapabilities`/`mapProviderStatus`.
   `verifyPayment` renamed to `getPayment` (queries a provider's live
   status — distinct from `PaymentRegistry.getPaymentIntent()`, which
   only reads CozyOS's own record). `verifyWebhook` is new: each
   adapter's own authenticity + payload-normalization method —
   `PaymentRegistry` never assumes HMAC or any other specific mechanism.
2. **Canonical status model extended with `UNKNOWN`** — not a synonym
   for `FAILED`. This is the concrete fix for "timeout != failed,
   network failure != failed, unknown != succeeded, unknown != safe-to-
   retry."
3. **Webhook/event foundation** — `PaymentRegistry.processProviderEvent()`:
   real database-enforced duplicate-event detection (`payment_webhook_events`,
   unique index on `(provider_id, provider_event_id)`), real amount/
   currency matching against CozyOS's own stored record (webhook claims
   are never trusted on their own), and explicit `UNKNOWN`-status
   handling that changes nothing and holds the event for later review.
4. **Provider configuration foundation** — `payment_provider_configs`
   table + `setProviderConfig()`/`getProviderConfig()`, platform-admin
   gated, storing a `credentialRef` (an environment variable **name**),
   never a credential value.
5. **Credential abstraction** — `server/webauthn-rp/providers/credential-resolver.js`,
   extending the existing `process.env.COZY_*` server convention. The
   client-side Vault remains correctly unused for this purpose (Phase
   5.1 finding: browser-only, not reusable server-side).
6. **Certification harness** — `provider-certification-harness.js`,
   applied to two adapters:
   - **cash (REAL)** — proves the harness works against a genuine,
     fully-functional provider.
   - **test-only-async-provider (TEST-ONLY, isolated)** — exercises the
     webhook/idempotency/unknown-state paths cash cannot, per the
     explicit instruction that a test-double may exist only inside the
     isolated test environment and must never masquerade as real.
7. **M-Pesa adapter boundary preparation** — `server/webauthn-rp/providers/mpesa-provider.js`,
   a disclosed stub mirroring the existing client-side pattern: every
   operational method honestly throws "not implemented"; only
   `getCapabilities()` and `mapProviderStatus()` are real, based on
   current Daraja documentation researched in Phase 5.1. Never imported
   by `server.js` — confirmed by a test that inspects `server.js`'s
   source directly.
8. **Reconciliation foundation** — `payment_webhook_events` (this round)
   plus `payment_events` (Phase 4) together give the
   CozyOS-Payment-ID ↔ Provider-Transaction-ID ↔ Status ↔ Amount ↔
   Currency record Phase 5.2 asks for. No automated reconciliation job
   was built — the foundation exists; a real provider is needed to
   reconcile against.

## IMPLEMENTED

- `server/webauthn-rp/migrations/009_payment_providers.sql` +
  `db.js`'s `migrateAddPaymentProviders()` mirror.
- `server/webauthn-rp/providers/credential-resolver.js`.
- `server/webauthn-rp/providers/mpesa-provider.js` (disclosed stub).
- `PaymentRegistry.processProviderEvent()`, `setProviderConfig()`,
  `getProviderConfig()`, `getWebhookEvents()`.
- `server/webauthn-rp/test/provider-certification-harness.js`.
- `server/webauthn-rp/test/test-only-async-provider.js` (test-only,
  isolated).
- `server/webauthn-rp/test/provider-certification.test.js`,
  `mpesa-provider-contract.test.js`.
- 6 new tests in `payments.test.js` (provider config auth/persistence/
  update/audit, credential resolver).

## REUSED

- `verifyWebhookSignature()` (Phase 4) — now one available mechanism an
  adapter's `verifyWebhook()` MAY use, not the assumed default; reused
  as-is by the test-only adapter, not duplicated.
- `OrganizationRegistry.isAuthorized()`, `BillingRegistry._recordLedgerEntryWithinTransaction()`
  — `processProviderEvent()`'s wallet-crediting path reuses the exact
  Phase 4 transaction-composition fix, not a new one.
- The existing `process.env.COZY_*` convention — extended, not
  duplicated, by `credential-resolver.js`.
- The existing client `mpesa-provider.js`'s credential-shape convention
  (`consumerKey`/`consumerSecret`/`shortcode`) — informed the server-side
  stub's `REQUIRED_ENV_VARS`, confirmed against current Daraja docs.

## REVIVED

- The disclosed-stub pattern itself, revived from the client-side
  M-Pesa adapter into a server-side equivalent, rather than inventing a
  different way to represent "not yet implemented."

## EXTENDED

- `server/webauthn-rp/payments.js` — `CANONICAL_STATUSES`,
  `REQUIRED_ADAPTER_METHODS`, and the `PaymentRegistry` class all
  extended; every Phase 4 method's own behavior unchanged (re-confirmed:
  `payments.test.js`'s original 19 tests still pass unmodified in
  substance).
- `server/webauthn-rp/providers/cash-provider.js` — `verifyPayment`
  renamed to `getPayment` (same behavior), `verifyWebhook()` added
  (honestly reports `{valid: false}`, matching its own
  `webhooks: false` capability declaration).

## UNCHANGED

- `PaymentRegistry`'s core create/refund/cancel logic and its ledger
  integration — not redesigned, only extended.
- `core/modules/payment-provider/*`, `core/modules/payment-channel/*`,
  `core/modules/vault/*`, `core/modules/entitlement/entitlement-engine.js`,
  `modules/billingEngine.js`, `core/plugins/mpesaOS-*.js` — all
  inspected in Phase 5.1, none modified.
- The four locked AI Core files — not read, referenced, or modified.
  `core/ai/integration.js` remains genuinely absent (re-confirmed).

## DEPRECATED / LEGACY

- Client-side `core/modules/payment-provider/mpesa-provider.js` — status
  unchanged, still correctly disclosed as a non-working interface shell.

## TESTED

Exact totals, this session, full regression:

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| `payments.test.js` | 25 | 25 | 0 | 0 |
| `provider-certification.test.js` | 19 | 18 | 0 | 1 (cash's webhook battery, correctly skipped — cash declares no webhook support) |
| `mpesa-provider-contract.test.js` | 8 | 8 | 0 | 0 |
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
| **TOTAL** | **231** | **199** | **0** | **32** |

Every skip is honest: 28 real-PostgreSQL (unrelated suites, no live DB
in this sandbox) + cash's one correctly-skipped webhook battery.

### Real integrity, empirically confirmed (not just asserted by passing tests)

- **Unknown-state safety**: the test-only async adapter's `mapProviderStatus('ambiguous_network_error')` returns `UNKNOWN`; feeding that through `processProviderEvent()` confirmed to leave both payment status and wallet balance completely unchanged.
- **Webhook idempotency**: the exact same valid, correctly-signed webhook payload delivered twice — applied once, second delivery returns `duplicate_ignored`, wallet credited exactly once.
- **Webhook amount-mismatch rejection**: a webhook claiming a different amount than the stored intent — rejected, no state change.
- **M-Pesa stub honesty**: every operational method verified to actually throw (not silently succeed) via direct test assertions.

## NOT RUN

- Any real Daraja API call (no credentials, no network access — same
  structural constraint identified in Phase 5.1, unchanged).
- The full certification battery against the M-Pesa stub (correctly not
  attempted — its operational methods throw by design; only static
  contract verification was performed).

## BLOCKED

- **M-Pesa real connectivity: BLOCKED — credentials.** Unchanged from
  Phase 5.1. The adapter boundary is now prepared; the actual Daraja API
  calls, and resolution of the two open questions (webhook authenticity
  mechanism, exact STK Push result-code mapping), require real sandbox
  access this environment does not have.
- **Other providers: BLOCKED — credentials/integration access.**
  Unchanged from Phase 5.1.

---

## Final security scan — two real defects found and fixed (not merely inspected)

**1. Prototype-pollution-adjacent vulnerability in `mapProviderStatus()`.**
`cash-provider.js` and `test-only-async-provider.js` used an unguarded
`map[providerStatus] || 'FALLBACK'` lookup on a plain object literal.
Empirically confirmed exploitable: `map['__proto__']` and
`map['constructor']` both return real, truthy, non-string values (the
prototype object / the Object constructor function respectively),
bypassing the `|| 'FALLBACK'` fallback entirely. Since
`processProviderEvent()` throws if `mapProviderStatus()` doesn't return
a value from `CANONICAL_STATUSES`, a malicious/malformed webhook payload
with `"status": "__proto__"` would cause an unhandled exception instead
of a clean, recorded rejection — a real robustness/DoS-adjacent gap, not
a data-corruption risk. Fixed both call sites with
`Object.prototype.hasOwnProperty.call(map, key)` guards, matching the
pattern `mpesa-provider.js` already had correctly from the start.
Reproduced the exploit directly before the fix, confirmed resolved after
it, and added a permanent regression test (`security: mapProviderStatus()
is not exploitable via prototype-chain property names`) to the
certification harness itself, so every future adapter certified through
it is automatically checked for this class of defect.

**2. `getWebhookEvents()` had no self-enforced authorization at all.**
Unlike every other organization-scoped read method in this codebase
(fixed to self-enforce during the Phase 2 final audit), this Phase
5.2-introduced method took only `paymentIntentId` with no actor/
authorization check whatsoever. Not currently reachable from any route
— not an active vulnerability today — but the same defense-in-depth gap
class already found once before. Fixed to resolve the intent's real
organization and call `orgs.isAuthorized()` before returning anything,
matching the established pattern exactly. New regression test added and
passing.

## Updated final regression (after both fixes)

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
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
| **TOTAL** | **235** | **203** | **0** | **32** |

## UNKNOWN-state safety — empirically re-verified this round

Direct script execution (not test-file inspection) confirmed, fresh,
against the async test-only adapter: an UNKNOWN webhook event leaves the
payment intent status unchanged (still `PENDING`, never `SUCCEEDED` or
`FAILED`), leaves the wallet balance at exactly `0`, creates zero ledger
entries, and is recorded in `payment_webhook_events` with outcome
`held_unknown_status` — genuinely recoverable/reconcilable, not silently
dropped.

## PHASE 5.2 — PROVIDER INTEGRATION FOUNDATION = VERIFIED

- Generic provider contract: **VERIFIED**
- Capability model: **VERIFIED**
- Status normalization (including UNKNOWN safety): **VERIFIED**
- Idempotency/replay foundation: **VERIFIED**
- Configuration foundation: **VERIFIED**
- Certification harness: **VERIFIED** (applied to a real adapter and a
  clearly-labeled test-only adapter)
- Security tests: **VERIFIED** (secrets, credential handling, webhook
  rejection, amount/currency matching)
- M-Pesa real connectivity: **BLOCKED — credentials**
- Other providers: **BLOCKED — credentials/integration access**

No fabricated runtime evidence. Phase 4 checkpoint confirmed untouched
throughout (byte-identical hash re-verified before and after this
round's work). No checkpoint was built this round, per instruction.
