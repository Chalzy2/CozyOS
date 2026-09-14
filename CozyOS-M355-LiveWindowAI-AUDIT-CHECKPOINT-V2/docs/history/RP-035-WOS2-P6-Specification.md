# RP-035 WOS2 Part 6 — Inventory-Validated Order Decision +
# Owner/Assistant Escalation Engine — Production Specification (Rule 31)

Status: SPECIFICATION ONLY. No implementation code exists yet. This
file is the Rule 31 artifact that must be produced, and reviewed,
before Part 6 implementation begins.

## Part 0 — Baseline

`COS-RP035-WOS2-P5-CERTIFIED.zip`, SHA-256 (see checkpoint record):
`ed0f2493697ef82e523cc904c36e8a5d43b92f68fba4547e1dfae5c0e3479782`.
This is the authoritative baseline for the pre-implementation
byte-identity comparison required at Part 6 Rule 85 Step 9.

## Part 1 — Rule 29 Ownership Summary (full audit already recorded)

- Product/stock/price source of truth: `WholesaleCommerceBoundary`
  (`core/modules/WholesaleOS/wholesale-commerce.js`) — `getProduct()`,
  `getStock()`, `getStockStatus()`, `getSellingPrice()`,
  `getPriceTiers()`, `getOrder()`. Part 6 never calls
  `ShopProductEngine`/`ShopInventoryEngine` directly.
- Input: `wholesale-order-understanding.js` (Part 5) records —
  `matchedProductId`, `variant.resolved`, `quantity`,
  `requestedPrice: null`, `status` (`DRAFT_RESOLVED` /
  `ORDER_REQUIRES_CLARIFICATION` / `ORDER_NOT_UNDERSTOOD`).
- Idempotency mechanism: `clientRequestId` keyed dedup, same shape as
  Part 5/WOS1. No new idempotency engine.
- `LOCAL_QUEUED`: precedent in `church-offering-interaction.js`.
  Reused as a name/semantics precedent only — Part 6 owns its own
  state field.
- `OWNER_APPROVAL_REQUIRED`: no repository precedent. Genuinely new
  state, defined fully in Part 7 below.
- Assistant permission/capability registry: does not exist anywhere
  in the repository. Part 6 defines only the narrow capability set it
  needs (Part 6 below) — not a platform-wide `AssistantRole` system.
  This is a disclosed scope boundary, not an oversight.
- PHC6 (`church-live-translation-interaction.js`, 28/28 PASS at last
  certified count) is the multilingual boundary to compose. No new
  translation/language engine is created.

## Part 2 — Order State Machine

States, and the only transitions between them:

| State | Meaning | Entered from |
|---|---|---|
| `DRAFT_RESOLVED` | Inherited from Part 5. Not a Part 6 state — the required input condition to even begin Part 6 processing. | (Part 5 output) |
| `INVENTORY_CHECK_REQUIRED` | Part 6 has accepted a `DRAFT_RESOLVED` record and is about to call `WholesaleCommerceBoundary`. Transient/logged, not user-facing as a rest state. | `DRAFT_RESOLVED` |
| `FULFILLABLE` | Real stock ≥ requested quantity, real price retrieved. | `INVENTORY_CHECK_REQUIRED` |
| `PARTIALLY_FULFILLABLE` | Real stock > 0 but < requested quantity. | `INVENTORY_CHECK_REQUIRED` |
| `INSUFFICIENT_STOCK` | Real stock = 0, or stock status is `OUT_OF_STOCK`. | `INVENTORY_CHECK_REQUIRED` |
| `OWNER_APPROVAL_REQUIRED` | An action in Part 7's list was attempted by an assistant/AI actor without the matching capability, or a decision genuinely requires a human owner regardless of actor. | `FULFILLABLE`, `PARTIALLY_FULFILLABLE`, `INSUFFICIENT_STOCK` |
| `LOCAL_QUEUED` | Decision recorded locally; no real outbound confirmation transport exists in this repository (matches PHC1–PHC6 disclosed limitation). Terminal for this checkpoint's honesty guarantee — never silently advances to a "sent" state. | `FULFILLABLE`, `PARTIALLY_FULFILLABLE`, `OWNER_APPROVAL_REQUIRED` (after real owner action) |
| `CONFIRMED` | A capability-holding actor (assistant with `canConfirmOrder`, or owner) has explicitly confirmed. Never entered from AI interpretation alone (your explicit rule). | `LOCAL_QUEUED`, `OWNER_APPROVAL_REQUIRED` |
| `REJECTED` | Explicit rejection by an authorized actor, or `INSUFFICIENT_STOCK` with no partial-fulfillment path accepted. | `INSUFFICIENT_STOCK`, `PARTIALLY_FULFILLABLE`, `OWNER_APPROVAL_REQUIRED` |

No additional states are justified by current repository requirements.
`CANCELLED` was considered and rejected for this checkpoint — cancelling
a `CONFIRMED` order is explicitly listed in Part 7 as an
owner-approval-only action and is out of scope until a real
post-confirmation lifecycle (fulfillment/shipping) exists to cancel
against.

## Part 3 — Price

`requestedPrice` from Part 5 stays `null` forever on that record — it
is never retroactively filled in. Part 6 reads the real selling price
via `WholesaleCommerceBoundary.getSellingPrice(productId)` (and
`getPriceTiers()` where a quantity-tier price applies) into its own
new field, `resolvedUnitPrice`, on the Part 6 decision record. If
`getSellingPrice()` returns no price, the decision cannot reach
`FULFILLABLE`/`PARTIALLY_FULFILLABLE` — it is treated as a hard block
(`OWNER_APPROVAL_REQUIRED`, reason `PRICE_UNAVAILABLE`), never a
guessed or zero price.

## Part 4 — Inventory Validation

Given `matchedProductId`, `variant.resolved`, and `quantity` from the
Part 5 record:

- Read real `getAvailableStock`-equivalent via
  `WholesaleCommerceBoundary.getStock(productId, branchId)` (branch
  resolution: caller-supplied `branchId` on the Part 6 call, never
  inferred, never defaulted to a "first" branch).
- `available >= requested` → `FULFILLABLE`, `fulfillableQuantity = requested`.
- `0 < available < requested` → `PARTIALLY_FULFILLABLE`,
  `fulfillableQuantity = available`, `shortfall = requested - available`.
- `available === 0` or stock status `OUT_OF_STOCK` → `INSUFFICIENT_STOCK`,
  `fulfillableQuantity = 0`.
- No fabricated availability at any point before this real call
  completes — the record sits in `INVENTORY_CHECK_REQUIRED` (internal,
  not exposed as a settled answer) until it does.

## Part 5 — Idempotency / Duplicate Protection

Part 6 reuses the exact `clientRequestId` pattern from Part 5/WOS1:
key on `${customerId}:${clientRequestId}`. A repeated submission with
the same key returns the existing Part 6 decision record
(`duplicate: true`), never creates a second one, and never re-runs the
inventory/price check (stock may have moved between the original call
and the duplicate — re-running would silently change a decision the
duplicate-submitter didn't ask to re-evaluate). No new idempotency
engine is created.

## Part 6 — Assistant Authorization

No platform-wide `AssistantRole` exists or is created here. Part 6
defines exactly four boolean capabilities, checked per-call against a
caller-supplied capability object (shape: `{ actorType: "assistant" |
"owner", capabilities: { canConfirmOrder, canApplyPartialFulfillment,
canRejectOrder, canRequestOwnerApproval } }`). Deny-by-default: an
`actorType: "assistant"` call with a capability flag missing or not
`=== true` is treated as not having it — no implicit grant.

- `canConfirmOrder` — required to move `FULFILLABLE` → `CONFIRMED`.
- `canApplyPartialFulfillment` — required to move
  `PARTIALLY_FULFILLABLE` → `CONFIRMED` (accepting the partial amount)
  or → `LOCAL_QUEUED`. Without it, `PARTIALLY_FULFILLABLE` always goes
  to `OWNER_APPROVAL_REQUIRED`.
- `canRejectOrder` — required to move any state → `REJECTED`.
- `canRequestOwnerApproval` — required for an assistant to explicitly
  raise `OWNER_APPROVAL_REQUIRED` as a deliberate action (distinct from
  the engine raising it automatically when a capability is missing —
  that path needs no permission, since it's a refusal, not an action).

`actorType: "owner"` bypasses all four capability checks — the owner
is the human this whole gate exists to protect the judgment of.

## Part 7 — Owner Approval

`OWNER_APPROVAL_REQUIRED` is entered whenever any of the following is
attempted and the actor is `assistant` without the matching capability,
or the action is inherently owner-only regardless of actor:

- Applying a discount or price different from
  `resolvedUnitPrice` — **owner-only, no assistant capability exists
  for this in Part 6 at all** (not merely gated — there is no
  `canOverridePrice` capability defined, by design).
- Extending credit / marking an order payable-later — **owner-only**,
  no assistant capability defined.
- Confirming an order against a stock number the engine did not itself
  just verify (i.e., any attempt to bypass Part 4) — **owner-only**,
  structurally impossible for an assistant since Part 6 always
  re-verifies stock itself before any confirm path.
- Approving an "exceptional" quantity — defined here as
  `fulfillableQuantity` accepted at a value the engine did not compute
  (i.e. anything other than exactly `requested` or exactly
  `available`) — **owner-only**, no assistant capability defined.
- Cancelling a `CONFIRMED` order — **owner-only**, out of scope for
  this checkpoint's assistant capability set entirely (no
  `canCancelConfirmed` capability exists).
- `PARTIALLY_FULFILLABLE` when the actor is `assistant` and lacks
  `canApplyPartialFulfillment`.
- `PRICE_UNAVAILABLE` (Part 3) regardless of actor capabilities — a
  missing price is never something an assistant capability can paper
  over.

An AI/assistant actor can never silently perform any of the five
"owner-only, no capability exists" actions above — this is enforced by
the capability object's fixed shape (four fields only) rather than by
a runtime check, so there is no flag to mistakenly set `true` for
them.

## Part 8 — Offline-First / `LOCAL_QUEUED` Honesty

`LOCAL_QUEUED` means: a decision was recorded in this engine's local
store. It never means delivered, sent, or acknowledged by any
customer-facing or owner-facing transport — matching the disclosed,
repository-wide `CAPABILITY_UNAVAILABLE` transport limitation carried
since Section 16/PHC1. No code path in Part 6 sets a `propagationState`
of `SENT` or `DELIVERED`. If a `propagationState` field is present at
all on the decision record, its only real values are `QUEUED` (created
here) — consistent with the ChurchOS moderation precedent's own
disclosed honesty rule.

## Part 9 — Customer / Owner Language

Part 6 composes PHC6 (`church-live-translation-interaction.js`)
read-only, for two independent lookups: rendering a customer-facing
message in `customerLanguage` (from the Part 5 record, caller-supplied
only, never auto-detected — consistent with Part 5's own disclosed
rule) and an owner-facing message in a separately caller-supplied
`ownerLanguage`. If PHC6 reports a language as `NOT_READY` or
unsupported, Part 6 falls back to an explicit `UNSUPPORTED_LANGUAGE`
marker on that side of the message only — never silently substitutes
English without saying so, never blocks the underlying order decision
itself. No `WholesaleTranslationEngine`, `WholesaleLanguageEngine`, or
any new registry is created.

## Part 10 — Privacy / Identity Boundaries

The customer-facing shape of a Part 6 decision record exposes only:
`requestId`, `status`, `fulfillableQuantity`, `shortfall`,
`resolvedUnitPrice`, `customerLanguage`-rendered message. It never
includes: other branches' stock, other customers' orders, owner
capability flags, audit log entries, or any `WholesaleCommerceBoundary`
diagnostics. This mirrors the existing `getViewerAttendance()` /
`listComments()` viewer-safe-projection pattern already certified in
ChurchOS Phase B/C — Part 6 will project a similarly narrow
customer-safe view rather than returning its full internal record.

## Part 11 — Offline Recovery / Staleness

An order decision created while offline is `LOCAL_QUEUED` with a
`createdAt` timestamp. On sync (a caller-invoked `reconcile()` — no
background sync engine exists in this repository and none is created
here), Part 6 re-runs the real Part 4 inventory check against current
stock:

- If the same-or-greater quantity is still available at the
  original `resolvedUnitPrice`: record stays `LOCAL_QUEUED` (or
  advances only via an explicit confirm call — sync itself never
  auto-confirms).
- If stock has dropped below what was queued: the record transitions
  to `PARTIALLY_FULFILLABLE` or `INSUFFICIENT_STOCK` per Part 4's real
  numbers, and a `staleAtSync: true` flag plus `originalQuantity` are
  recorded — the original queued numbers are never silently honored
  against changed reality.
- If price has changed: `priceChangedAtSync: true` is recorded with
  both `originalUnitPrice` and `resolvedUnitPrice`; a price increase
  or decrease at sync is never auto-applied to a `LOCAL_QUEUED` record
  without this being visible on the record.
- A record older than a caller-supplied staleness threshold (no
  default invented here — the caller must state it) is flagged
  `staleAtSync: true` regardless of stock/price outcome, so any
  consumer can choose to require re-confirmation.

## Part 12 — AI Boundary

The Part 5 engine (already certified) is the only AI/interpretation
component in this flow. Part 6 accepts its structured output
(`matchedProductId`, `variant.resolved`, `quantity`) as input but is
itself entirely deterministic: product identity, quantity, price,
stock, availability, order state, and approval requirement are all
computed by real engine calls and explicit rules in this spec — never
inferred by re-interpreting `rawMessage`. Part 6 never calls any
AI/NLU component itself.

## Part 13 — Test Specification

New test file: `core/modules/WholesaleOS/test/wholesale-order-decision.test.js`.
Planned cases (real, driving the real `WholesaleCommerceBoundary` and a
real Part 5 record as fixtures, not mocks of either):

1. Sufficient stock → `FULFILLABLE`, correct `resolvedUnitPrice`.
2. Zero stock → `INSUFFICIENT_STOCK`.
3. Partial stock → `PARTIALLY_FULFILLABLE`, correct `shortfall`.
4. Price retrieval matches `WholesaleCommerceBoundary.getSellingPrice()` exactly.
5. Price changed between two calls on the same product → second call
   reflects the new real price, first decision record is not mutated.
6. Stock changed between two calls → second call reflects new real
   stock; first decision record is not mutated.
7. Duplicate `clientRequestId` → same record returned, no second
   inventory/price check performed (verified via call-count on the
   boundary, not just output equality).
8. Unauthorized assistant (missing capability) attempting confirm/partial/reject → `OWNER_APPROVAL_REQUIRED`, never proceeds.
9. Authorized assistant with each of the four capabilities individually → each succeeds only for its own action.
10. Owner actor bypasses all four capability checks.
11. Owner approval flow: `OWNER_APPROVAL_REQUIRED` → real owner action → `CONFIRMED`/`REJECTED`/`LOCAL_QUEUED`.
12. Explicit rejection by capability-holding actor.
13. `LOCAL_QUEUED` never carries `propagationState: SENT`.
14. Offline → `reconcile()` with unchanged real stock/price.
15. Offline → `reconcile()` with stock dropped below queued quantity → `staleAtSync`, correct downgraded state.
16. Offline → `reconcile()` past staleness threshold → `staleAtSync: true` regardless of stock/price outcome.
17. Customer-facing message rendered in `customerLanguage` via PHC6.
18. Owner-facing message rendered in `ownerLanguage` via PHC6, independently.
19. Unsupported/`NOT_READY` language on either side → `UNSUPPORTED_LANGUAGE` marker, order decision unaffected.
20. Customer-facing projection excludes owner/audit/diagnostics fields (explicit key-set assertion).
21. `PRICE_UNAVAILABLE` path (product exists, no sellable price) → `OWNER_APPROVAL_REQUIRED`, never a guessed price.
22. The five owner-only actions (discount, credit, stock-bypass, exceptional quantity, cancel-confirmed) are structurally unreachable by any assistant capability combination.

## Part 14 — Regression Requirements

Before Part 6 implementation is certified:
- `wholesale-commerce.test.js` (WOS1): must remain 21/21.
- `wholesale-order-understanding.test.js` (Part 5): must remain 23/23
  — figure taken from the certified count recorded in
  `docs/history/RP-035-WOS2-P5.md` Part 0/6 (not stated in your
  instruction, added here for completeness since Part 5 is a direct
  regression surface for Part 6).
- ChurchOS lineage (7 files): must remain 182/182.
- Full repository regression re-run and compared file-for-file against
  the pre-existing 11-file/55-assertion failure set and the
  environmental (headless-browser) timeout set already disclosed in
  `docs/history/RP-035-WOS2-P5.md` Part 3 — any new failure outside
  that set is a stop condition, not something to reconcile away.

## Part 15 — Explicitly Excluded From Part 6

- Any messaging/WhatsApp/SMS connector or delivery confirmation.
- Voice AI.
- Marketing automation.
- A platform-wide assistant/role system.
- A new translation or language registry.
- Post-confirmation fulfillment/shipping lifecycle (and therefore
  cancellation of a `CONFIRMED` order beyond flagging it owner-only).
- Background/automatic sync — `reconcile()` is caller-invoked only.
- Any change to `WholesaleCommerceBoundary`, `ShopProductEngine`,
  `ShopInventoryEngine`, PHC6, or any other existing certified module.

## Part 16 — Unresolved Questions For Implementation

1. `branchId` resolution: this spec requires it caller-supplied. Confirm
   that's acceptable, or state where a "default branch per business"
   concept should come from (none exists in the audited engines).
2. Staleness threshold: confirmed caller-supplied with no invented
   default — confirm, or provide the platform-wide default if one
   exists outside the modules audited here.
3. Exact wording/shape of the `UNSUPPORTED_LANGUAGE` marker: minimal
   proposal above; confirm or adjust before implementation.
