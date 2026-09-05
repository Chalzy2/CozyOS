# RP-035 WOS2 Part 7 — Post-Confirmation Fulfillment Lifecycle Engine
## Production Specification (Rule 31)

**Baseline:** `COS-RP035-WOS2-P6-CERTIFIED.zip`
SHA-256 `29c605e00ac8772643fd37a0e82f6c2de3215099b99018fad28d35e5f9850dbf`
**Rule 29 audit:** `docs/history/RP-035-WOS2-P7-Rule29-Audit.md` — PASS.

## Part 1 — Purpose

Track the real, human-recorded, post-`CONFIRMED` physical progress of
a wholesale order that Part 6 has already decided and confirmed. Part 6
remains the sole owner of order *decision* (pricing/stock validation/
`CONFIRMED`); Part 7 owns only what happens to a `CONFIRMED` order
next.

## Part 2 — Ownership

- New module: `window.CozyOS.WholesaleFulfillment`
  (`core/modules/WholesaleOS/wholesale-fulfillment.js`).
- Source of truth for order existence/status: `window.CozyOS.WholesaleOrderDecision`
  (Part 6), read-only via `getDecision(requestId)`. Part 7 never
  mutates a Part 6 record and never reimplements pricing/stock logic.
- No dependency on `WholesaleCommerce`, `ShopProduct`, or
  `ShopInventory` directly — those remain Part 6/WOS1's exclusive
  concern, per the established boundary rule.

## Part 3 — Eligibility

A fulfillment record may only be created for a `requestId` that:
1. Exists in `WholesaleOrderDecision` (`getDecision()` returns
   non-null), and
2. Has `status === "CONFIRMED"` **at the moment of creation**.

If either check fails: `{ success: false, reason: "ORDER_NOT_CONFIRMED" }`
or `{ success: false, reason: "ORDER_NOT_FOUND" }`. Once created, a
fulfillment record's own lifecycle is independent of any later change
to the Part 6 record (Part 6 records are themselves post-`CONFIRMED`
immutable in every existing test/spec) — no re-check occurs on every
subsequent fulfillment transition, only at creation.

## Part 4 — State Machine

```
PENDING_FULFILLMENT --(markPacked)--> PACKED
PACKED --(markDispatched)--> DISPATCHED
DISPATCHED --(markDelivered)--> DELIVERED   (terminal)
PENDING_FULFILLMENT | PACKED --(cancelFulfillment, owner-only)--> FULFILLMENT_CANCELLED (terminal)
```

- No transition may be skipped (e.g. `PENDING_FULFILLMENT` →
  `DISPATCHED` directly is `INVALID_TRANSITION`).
- `DISPATCHED` may **not** be cancelled — once handed to a
  carrier/courier the only forward states are `DELIVERED` or an
  unresolved manual exception (out of scope, Part 9).
- Every transition is capability-gated (Part 5) and produces an
  audit-log entry, same pattern as Part 6's `#logAudit`.

## Part 5 — Capability / Authorization Model

Reuses Part 6's `actorType: "owner" | "assistant"` shape structurally.
New capability keys, deny-by-default:

```
canMarkPacked
canMarkDispatched
canMarkDelivered
canCancelFulfillment   (owner-only — never granted to an assistant,
                         structurally, same as Part 6's
                         OWNER_ONLY_ACTIONS pattern)
```

An `owner` actor bypasses all four checks (matching Part 6). An
`assistant` actor missing the relevant capability never silently fails
and never silently proceeds: the call returns
`{ success: false, reason: "MISSING_CAPABILITY:<key>" }` and the record
is **not** transitioned (unlike Part 6's escalate-to-owner-approval
pattern — Part 7 has no owner-approval queue of its own; a missing
capability is simply refused, since there is no ambiguous "the assistant
tried and inventory says no" case here, only an authorization check).
`canCancelFulfillment` is never grantable to an `assistant` actor at
all — checked structurally, not just by capability-map absence (a
dedicated test asserts no capability-key combination reaches
`FULFILLMENT_CANCELLED` for a non-owner actor).

## Part 6 — Record Shape

```
{
  fulfillmentId,        // ffl_<ts>_<seq>
  requestId,             // Part 6 requestId this fulfillment tracks
  businessId,            // copied read-only from the Part 6 record at creation
  branchId,               // copied read-only from the Part 6 record at creation
  status,                 // PENDING_FULFILLMENT | PACKED | DISPATCHED | DELIVERED | FULFILLMENT_CANCELLED
  trackingNumber,          // null unless caller-supplied at markDispatched
  carrier,                 // null unless caller-supplied at markDispatched
  trackingProvenance,       // null, or "CALLER_PROVIDED_NOT_VERIFIED" when trackingNumber/carrier set
  cancelReason,             // null unless FULFILLMENT_CANCELLED
  createdAt, updatedAt,
  history: [{status, at}],
}
```

`trackingNumber`/`carrier` are free-text, optional, caller-supplied
strings accepted only at `markDispatched()`. They are never validated,
looked up, or confirmed against any real carrier system (none exists)
— `trackingProvenance` makes this explicit on every record that has
them, so no consumer of this data mistakes it for a verified fact.

## Part 7 — Public API

```
createFulfillment({ requestId, actor })
getFulfillment(fulfillmentId)
getFulfillmentByRequestId(requestId)
markPacked(fulfillmentId, actor)
markDispatched(fulfillmentId, actor, { trackingNumber = null, carrier = null } = {})
markDelivered(fulfillmentId, actor)
cancelFulfillment(fulfillmentId, actor, { reason } = {})
getCapabilityKeys()
getAuditLog(predicate)
getDiagnosticsReport()
getCapabilities()   // { realStockDecrement: false, realCourierIntegration: false,
                     //   realDeliveryConfirmation: false, trackingVerified: false }
getVersion()
```

Idempotency: `createFulfillment` is **not** idempotent on a second call
for the same `requestId` while an active (non-terminal) fulfillment
record already exists for it — returns
`{ success: false, reason: "FULFILLMENT_ALREADY_EXISTS", fulfillmentId }`
rather than silently creating a duplicate tracker for the same order.
A new fulfillment **may** be created for the same `requestId` only if
the existing one is terminal (`DELIVERED` or `FULFILLMENT_CANCELLED`)
— covers a real re-fulfillment-after-cancellation case.

## Part 8 — Never

- Never claims real inventory was decremented (`realStockDecrement`
  stays `false` permanently — no write path to `WholesaleCommerce`/
  `ShopInventory` exists or is added by this file).
- Never fabricates a tracking number, carrier, ETA, or delivery
  confirmation the caller did not explicitly supply.
- Never auto-advances a state on a timer, on app load, or on any
  event other than an explicit, capability-checked actor call.
- Never mutates a Part 6 `WholesaleOrderDecision` record.
- Never allows a non-owner actor to reach `FULFILLMENT_CANCELLED`.
- Never allows `DISPATCHED` to be cancelled.

## Part 9 — Explicitly Excluded From Part 7

- Real courier/carrier API integration of any kind.
- SMS/WhatsApp/email delivery-confirmation notifications.
- Real inventory decrement on pack/dispatch (no write path exists).
- A returns/refunds lifecycle.
- Multi-parcel/partial-shipment splitting of a single fulfillment
  record (`fulfillableQuantity` from Part 6 is tracked as one unit).
- Any change to `WholesaleOrderDecision`, `WholesaleCommerce`,
  `ShopProduct`, `ShopInventory`, PHC6, or any other certified module.

## Part 10 — Test Specification

New test file:
`core/modules/WholesaleOS/test/wholesale-fulfillment.test.js`. Cases,
driving the real, unmodified Part 6 engine (and its own real Part
5/WOS1/PHC6 chain) as fixtures, never mocked:

1. Create fulfillment for a real `CONFIRMED` Part 6 record → `PENDING_FULFILLMENT`.
2. Create fulfillment for a non-existent `requestId` → `ORDER_NOT_FOUND`.
3. Create fulfillment for a real, non-`CONFIRMED` Part 6 record (e.g. `FULFILLABLE`) → `ORDER_NOT_CONFIRMED`.
4. Second `createFulfillment` for the same `requestId` while active → `FULFILLMENT_ALREADY_EXISTS`.
5. Full happy path: `PENDING_FULFILLMENT → PACKED → DISPATCHED → DELIVERED`, each by an owner actor.
6. `markDispatched` with `trackingNumber`/`carrier` → both stored, `trackingProvenance: "CALLER_PROVIDED_NOT_VERIFIED"`.
7. `markDispatched` with neither → both stay `null`, `trackingProvenance` stays `null`.
8. Skipped transition (`PENDING_FULFILLMENT` → `markDispatched` directly) → `INVALID_TRANSITION`.
9. Assistant actor missing `canMarkPacked` → `MISSING_CAPABILITY:canMarkPacked`, record unchanged.
10. Assistant actor holding exactly `canMarkPacked` → `markPacked` succeeds; `markDispatched` on the same record still fails for that actor.
11. Owner actor bypasses all four capability checks.
12. `cancelFulfillment` from `PENDING_FULFILLMENT` by owner → `FULFILLMENT_CANCELLED`, `cancelReason` recorded.
13. `cancelFulfillment` from `PACKED` by owner → `FULFILLMENT_CANCELLED`.
14. `cancelFulfillment` attempted from `DISPATCHED` → `INVALID_TRANSITION` (never cancellable once dispatched), even by owner.
15. `cancelFulfillment` attempted by an assistant actor with every other capability granted except `canCancelFulfillment` → refused; a dedicated structural test confirms no capability-key combination reaches `FULFILLMENT_CANCELLED` for a non-owner actor.
16. Re-fulfillment after `FULFILLMENT_CANCELLED`: a second `createFulfillment` for the same `requestId` succeeds.
17. Re-fulfillment after `DELIVERED`: a second `createFulfillment` for the same `requestId` succeeds.
18. `getFulfillmentByRequestId` returns the active (non-terminal) record when one exists, else the most recent terminal one.
19. `getCapabilities()` reports `realStockDecrement: false`, `realCourierIntegration: false`, `realDeliveryConfirmation: false`, `trackingVerified: false` — fixed, never computed as true.
20. Audit log records every transition with actor type, never leaks a full actor object (only `actorType`).
21. `businessId`/`branchId` on the fulfillment record match the source Part 6 record exactly (read-only copy at creation, verified by direct field comparison).
22. Regression sanity: creating and progressing a fulfillment record makes zero calls into `WholesaleCommerce`/`ShopProduct`/`ShopInventory` (verified via call-count/spy on those real modules' methods) — confirms Part 8's "never claims a stock decrement" boundary is structural, not just documented.

## Part 11 — Regression Requirements

Before Part 7 is certified:
- `wholesale-order-decision.test.js` (Part 6): must remain 22/22.
- `wholesale-commerce.test.js` (WOS1): must remain 21/21.
- `wholesale-order-understanding.test.js` (Part 5): must remain 23/23.
- ChurchOS lineage (7 files): must remain 182/182.
- Full repository regression re-run, compared file-for-file against
  the pre-existing failure/timeout set already disclosed in this
  repository's own WOS2 P5/P6 governance chain — any new failure
  outside that set is a stop condition.

## Part 12 — Unresolved Questions For Implementation

None — every dependency needed (Part 6's `getDecision()`, the
capability-key authorization shape, the audit-log pattern) already
exists and was directly re-verified against source in the Rule 29
audit. No caller-supplied default is required beyond what Part 6
already established (this file introduces no new "which default do we
invent" question).
