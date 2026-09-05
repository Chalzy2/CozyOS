# RP-035 WOS2 Part 8 — Implementation Report

**Lifecycle stage reached: P8-IMPLEMENTED** (not TESTED, not CERTIFIED)

**Baseline:** COS-RP035-WOS2-P7-CERTIFIED.zip
SHA-256 `17f45987eedd0da710410fddb5239c172de63738770cbb154ebc5336e2e86b4e` (verified on receipt, matches the P8-SPEC's own declared baseline hash exactly).

**Spec implemented against:** COS-RP035-WOS2-P8-SPEC.zip
SHA-256 `3fe26cb5cec8051b4773e58a0e7644e75c9e8b5a7dd82ede3ced3b6719208325` (verified on receipt).

## What was built

One new file: `core/modules/WholesaleOS/wholesale-returns.js`, registered as
`window.CozyOS.WholesaleReturns`, version `1.0.0-P8`. No existing file was
modified.

Composes, read-only unless explicitly noted, the following real, already-
certified engines — each verified by reading its actual source before this
file was written, not by trusting the Rule 29 audit's prose paraphrase:

| Real engine | Real method(s) actually used |
|---|---|
| `WholesaleOrderDecision` (P6) | `getDecision(requestId)` |
| `WholesaleFulfillment` (P7) | `getFulfillmentByRequestId(requestId)` |
| `ShopInventory` | `recordStockMovement({productId, branchId, type, quantity, reference})` — the real method name; the Rule 29 audit's prose paraphrase ("recordMovement()") did not match the source and was not used |
| `PaymentProvider` | `getCapabilityProfile(providerId)` — real, genuinely `async` |
| `ShopPayments` | `getPayment(paymentId)` (sync), `refund(paymentId, {amount, reason})` (real, genuinely `async`) |
| `Customer` | `getCustomer(customerId)` (read-only sanity only) |
| `IdentityEngine` | `checkResourcePermission(userId, "return:request")` — the single assistant-grantable capability |

## Key implementation findings, disclosed rather than silently resolved

1. **`recordStockMovement`, not `recordMovement`.** The Rule 29 audit's own
   prose used the latter name; the real file uses the former. This file
   calls the real name.
2. **`PaymentProvider.getCapabilityProfile()` and `ShopPayments.refund()`
   are genuinely `async`.** An early draft treated them synchronously,
   which would have silently resolved a `Promise` object as truthy. Caught
   by smoke-testing against the real files before the test suite was
   written; the refund-track public methods (`requestRefund`,
   `reconcileRefund`, `executeRefund`) are `async` and genuinely `await`
   these calls.
3. **No live seam exists between WholesaleOS and ShopPayments.** Confirmed
   by reading `shopOS-payments.js`: payments are keyed by `saleId`, and no
   wholesale order has ever produced one. This file does not build that
   seam (explicitly out of scope). The only honest path to real
   payment-capture evidence is a real, existing `ShopPayments` `paymentId`
   the caller supplies, verified via a real `getPayment()` lookup — never
   derived, never assumed. This is why `REFUND_EXECUTED` is reachable in
   shape only today, for every provider including cash, exactly as the
   specification's Part 7 decision anticipated.
4. **Authorization design resolved and documented in the file's own header
   comment** ("AUTHORIZATION DESIGN"): all eight Part 4 gate keys
   (`canApproveReturn`, `canRejectReturn`, `canInspectReturn`,
   `canRestoreReturnedStock`, `canApproveRefund`, `canExecuteRefund`,
   `canConfirmMpesaRefund`, `canOverrideEligibility`) are structurally
   owner-only, unconditionally, the same way P7 hard-denies
   `canCancelFulfillment` to assistants. Only `canRequestReturn` is
   assistant-grantable, verified for real through
   `IdentityEngine.checkResourcePermission()`, never through a
   self-declared `actor.capabilities` map.

## What was intentionally not built

Matches the specification's "Do NOT build" list exactly: no new payment
provider, no payment-capture engine, no quarantine inventory system, no
courier/returns transport, no messaging connectors, no platform-wide
permission system, no credit-note accounting, no automatic P&L accounting,
no replacement for any existing engine.

## Test results — P8, new suite

`core/modules/WholesaleOS/test/wholesale-returns.test.js`

```
39 tests, 39 pass, 0 fail
```

Covers: real P6/P7 eligibility composition, quantity/reason ambiguity
handling, owner-only capability gating (including a negative test that a
self-declared `actor.capabilities` object is never trusted), three
independent idempotency keys, disposition branching (DAMAGED never touches
ShopInventory; SELLABLE only moves stock via an explicit, separately
idempotent `restoreStock()` call), refund honesty (no evidence → real
`REFUND_UNAVAILABLE`; M-Pesa → real `REFUND_UNAVAILABLE` via genuine
capability check; a real `ShopPayments` cash payment → real
`REFUND_PENDING` → real `REFUND_EXECUTED`), live re-verification at
execution time (evidence removed between approval and execution correctly
degrades to `REFUND_UNAVAILABLE` rather than trusting the earlier check),
offline queue + reconcile behavior, and customer-safe view key redaction.

## Regression results

Run against this file's addition only — no existing file was modified.

| Suite | Tests | Result |
|---|---|---|
| WOS1 — `wholesale-commerce.test.js` | 21 | 21 pass |
| P5 — `wholesale-order-understanding.test.js` | 23 | 23 pass |
| P6 — `wholesale-order-decision.test.js` | 22 | 22 pass |
| P7 — `wholesale-fulfillment.test.js` | 22 | 22 pass |
| ChurchOS — `church-attendance-geography.test.js` | 14 | 14 pass |
| ChurchOS — `church-live-attendance.test.js` | 12 | 12 pass |
| ChurchOS — `church-live-moderation-controls.test.js` | 31 | 31 pass |
| ChurchOS — `church-live-moderation.test.js` | 20 | 20 pass |
| ChurchOS — `church-live-translation-interaction.test.js` | 28 | 28 pass |
| ChurchOS — `church-offering-interaction.test.js` | 39 | 39 pass |
| ChurchOS — `church-prayer-interaction.test.js` | 38 | 38 pass |

**Zero regressions.**

## Remaining before TESTED / CERTIFIED

This ZIP is P8-IMPLEMENTED only. Per the Builder lifecycle, TESTED and
CERTIFIED gates (broader integration testing, any additional edge-case
coverage the next session identifies, and formal certification sign-off)
remain outstanding and are intentionally not claimed here.
