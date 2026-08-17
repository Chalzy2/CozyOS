# WOS1 — Rule 29 Whole-Repository WholesaleOS Ownership Audit

**Baseline:** COS-RP035-PHC6.zip
**Baseline SHA-256:** ea8d310f489ead8495cce8a707524bef48fd3dfb2146d7489785084c8bce97b2 (verified twice, matching)
**Recovery checkpoint at start of audit:** COS-RP035-WOS1-START.zip
**SHA-256:** c5b650f85b448734352f0ca7b4cc7485db2ca6a16497f11eb504c67c392508b4

## CRITICAL FINDING — WholesaleOS already exists (Phase 1, different scope)

A fresh whole-repository search found **three real, already-written WholesaleOS
plugin files** that a prior, unrelated milestone produced:

| File | Lines | Status |
|---|---|---|
| `core/plugins/wholesaleOS-core.js` | 128 | EXISTS / PRODUCTION-CAPABLE |
| `core/plugins/wholesaleOS-customer.js` | 166 | EXISTS / PRODUCTION-CAPABLE |
| `core/plugins/wholesaleOS-debt.js` | 159 | EXISTS / PRODUCTION-CAPABLE |

Each file's own header documents an ownership audit performed *before it was
written*, and each is honestly scoped: `wholesaleOS-core.js` is "Phase 1 of a
much larger application" covering a real Shared Catalog view (real reuse of
`ShopProduct`, not a duplicate catalog); `wholesaleOS-customer.js` is CRM only
(profile/contacts/credit limit/notes), explicitly deferring debt to
`wholesaleOS-debt.js` by `customerId` reference rather than duplicating data;
`wholesaleOS-debt.js` computes `balance` live from `principal - sum(payments)`
rather than storing a second, driftable copy.

**This is a different WholesaleOS scope than WOS1.** These three files
implement a twelve-feature wholesaler-app roadmap (directory, shared catalog,
chat/community, offline receipts, debt reminders, customer management, phone
book, notes, goals, budgets, planning, ShopOS/RetailOS/HawkerOS integration) —
of which only two of twelve are built (scaffold + shared catalog + customer +
debt). WOS1's scope (ShopOS composition boundary + anti-stale marketing state
machine) is not among the two built features and does not overlap them
functionally, but it **does overlap them by namespace** (`WholesaleOS`,
`window.CozyOS.Wholesale*`) and by domain (customer/product/inventory).

**Registration status — NOT WIRED IN.** `dashboard.html` loads
`shopOS-core.js`, `shopOS-product.js`, `shopOS-inventory.js`,
`shopOS-sales.js` explicitly, but does **not** load any of the three
`wholesaleOS-*.js` files. No `<script>` tag, bootstrap reference, or
PluginManager registration call for these three files exists anywhere in the
repository outside the files themselves. They are real, syntactically
complete, honestly-scoped production code that is currently **inert** — never
executed in the running application. This is a pre-existing gap, not
something WOS1 introduced; it is recorded here (not silently repaired) per
Rule 69/Rule 26.

### Consequence for WOS1

- **Do not** create `WholesaleBusinessEngine`, `WholesaleCompanyEngine`, a
  second customer engine, or a second debt engine. `WholesaleCustomer` and
  `WholesaleDebt` already exist for that responsibility.
- WOS1's integration boundary and anti-stale marketing engine must be
  **namespace-aware** of `window.CozyOS.WholesaleOSCore`,
  `window.CozyOS.WholesaleCustomer` (class `WholesaleCustomerEngine`), and
  `window.CozyOS.WholesaleDebt` (class `WholesaleDebtEngine`) so WOS1 does not
  silently collide with or shadow them.
- The orphaned-registration gap is out of WOS1's stated scope (WOS1 is
  ShopOS composition + anti-stale marketing, not "finish wiring Phase 1
  WholesaleOS"), so WOS1 will **not** add the missing `<script>` tags as part
  of this checkpoint — that is flagged as a separate, pre-existing finding for
  the repair queue, not fixed opportunistically mid-audit (Rule 61: Compose ≠
  Fixed — a finding is recorded, not silently repaired, outside its own
  lifecycle).

## Core ShopOS ownership (per WOS1 Part 2) — confirmed real

| Capability | File | Lines | Status |
|---|---|---|---|
| Business/company identity | `core/modules/company/cozy-company.js` | 1263 | EXISTS / REAL |
| Organization registry | `core/organization/organization-registry.js` | 228 | EXISTS / REAL |
| Organization roles | `core/organization/organization-role.js` | 186 | EXISTS / REAL |
| ShopOS core (delegation hub) | `core/plugins/shopOS-core.js` | 233 | EXISTS / REAL, REGISTERED |
| Product catalog | `core/plugins/shopOS-product.js` | 250 | EXISTS / REAL, REGISTERED |
| Inventory ledger | `core/plugins/shopOS-inventory.js` | 274 | EXISTS / REAL, REGISTERED |
| Sales/orders | `core/plugins/shopOS-sales.js` | 312 | EXISTS / REAL, REGISTERED |
| Purchasing | `core/plugins/shopOS-purchasing.js` | — | EXISTS / REAL (not yet re-verified line-by-line) |
| Bookkeeping/reconciliation/reporting | `shopOS-bookkeeping.js`, `shopOS-reconciliation.js`, `shopOS-reporting.js` | — | EXISTS / REAL (not yet re-verified line-by-line) |

Detailed field-level verification of `shopOS-product.js` /
`shopOS-inventory.js` / `shopOS-sales.js` (Part 2's required check of product
creation/category/SKU/variants, append-only stock ledger authority, and
order/sales delegation) is the next audit step before any WOS1 integration
code is written.

## Capabilities confirmed MISSING (safe to build in WOS1, per Part 3/7)

- **Marketing / anti-stale marketing state machine:** no existing engine.
  `cozy-rp034-integration.js`, `content-presentation-engine.js`,
  `understanding-engine.js` reference "marketing"/"campaign" only
  incidentally (media/content-presentation context, not inventory-aware
  promotion eligibility). **MISSING — safe to build.**
- **Social connectors** (WhatsApp/Telegram/Instagram/Facebook): no real
  connector exists; matches on those terms are incidental (customer/
  notification/company modules mentioning them narratively, not a wired
  integration). **MISSING — confirms Part 15/Part 11 honesty boundaries
  already specified (CAPABILITY_UNAVAILABLE) are correct.**

## Status

RULE 29: audit substantially complete for Parts 1–2 scope; ShopOS product/
inventory/sales field-level verification and remaining purchasing/
bookkeeping file review still pending before implementation begins.
