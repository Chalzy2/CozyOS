# RP-035 WOS2 — Rule 29 Ownership Audit

Baseline: COS-RP035-WOS2-START.zip (WOS1 CERTIFIED state), SHA-256
`7ee77265735585d4bb4e4e00be68f2e48b9379271e4a8ef7287dc6450b66e33a`.

Performed before any WOS2 production code was written, per Rule 29.
Repository-wide search across `core/`, `modules/`, `applications/`.

## Findings by capability

| Capability | Status | Real owner / evidence | WOS2 disposition |
|---|---|---|---|
| Order engine (customer order requests) | MISSING | `ShopSalesEngine` (`core/plugins/shopOS-sales.js`) is real but models an in-person POS sale (branchId+cashierId, DRAFT→PAYMENT_PENDING→COMPLETED). It has no concept of a customer-initiated order *request*, no clarification state, no approval-before-fulfillment step. `Customer.relationships.orders` is an empty array slot with no writer anywhere. | Build a genuinely new `OrderRequest` concept in WholesaleOS. Do NOT touch `ShopSalesEngine` — an approved order request may later become a real `Sale` via `ShopSales.startSale()`/`addLineItem()`, composed not duplicated, but that composition is a future checkpoint (order fulfillment), not WOS2. |
| Sales engine | EXISTS AND REAL | `window.CozyOS.ShopSales` (`core/plugins/shopOS-sales.js`) — real cart/discount/payment/receipt lifecycle. | Not touched this checkpoint. Reserved for a future fulfillment composition. |
| Customer engine | EXISTS AND REAL | `window.CozyOS.Customer` (`core/modules/customer/cozy-customer.js`) — real CRUD, contacts, credit, `getCustomer()`/`listCustomers()`. No language-preference field in `#defaultCustomerShape()`. | Compose read-only via `getCustomer(customerId)` for identity/lookup. Do not add fields to Customer's frozen shape; carry `customerLanguage` as a fact on the order-request record itself (caller-supplied per message, never inferred from Customer). |
| Conversational AI / intent extraction | EXISTS BUT NARROW | `rule-based-conversational-provider.js` classifies CozyOS-identity/help chat intents (RP-026/027) — a fixed intent set unrelated to commerce. `cozy-knowledge-registry.js`/`cozy-language-*` are knowledge/i18n, not order parsing. No product-order NLU exists anywhere. | Genuinely new, narrow rule-based extractor (keyword/pattern matching only — no ML/LLM claim), honestly scoped to structured-field extraction, not open conversation. |
| Identity | EXISTS AND REAL | `IdentityEngine.checkResourcePermission()`, `.isPlatformAdmin()` — already composed by WOS1's `wholesale-commerce.js`. | Reuse verbatim, same pattern as WOS1. No second auth system. |
| Organization / roles / permissions | EXISTS AND REAL | `OrganizationRole` (real `permissions` array + `assignedUserId`), same mechanism ChurchOS PHB2/PHC1-6 all reuse. | Reuse verbatim for "assistant" vs "owner" resource-permission distinction (e.g. `order:approve`, `order:reply-customer`). |
| Notifications / alerts | EXISTS BUT PLACEHOLDER (execution-free by design) | `window.CozyOS.CozyNotification` — its own header states it is "100% execution-free": no APNs/FCM/SMTP/SMS integration exists. It is a real data/session/registry model, not a delivery mechanism. | Compose its session/record registries for owner-escalation *records* only. Never claim a push/SMS/email was actually delivered — `deliveryState` stays honestly `QUEUED`/`CAPABILITY_UNAVAILABLE`, matching WOS1's own marketing-state disclosure pattern. |
| Escalation | MISSING (as a workflow) | No escalation state machine exists for commerce. Nearest precedent is ChurchOS's `QUARANTINED→UNDER_REVIEW→RELEASED/REJECTED/ESCALATED` admin pattern (`cozy-knowledge-quarantine-admin-core.js`) — a *pattern* to imitate, not a shared engine (different domain/records). | Build a new, narrow escalation state on the order-request record itself, following the same disclosed-precedent shape (explicit states, audited transitions, no auto-resolution). |
| Presence / busy / offline (staff) | MISSING | `core/business/offline.js` / `core/connectivity/offline.js` are network-connectivity concepts, not staff/assistant presence. No `isBusy`/presence engine exists for a human assistant or owner. | Do not fabricate a presence engine. Escalation routing is permission-based (who *may* act), never presence-based (who is *online*) — presence is honestly out of scope for WOS2. |
| Language preference / translation | EXISTS AND REAL (bounded) | `CozyLanguagePacks` (13 registered identities), `CozyTranslate`/`SpeechTranslationAdapter` (real only when a browser Translator API or explicit provider is registered — no bundled cloud provider), per PHC6's own disclosed `registered`/`selectable`/`translationSupported`/`translationAvailableNow` distinction. | Reuse the same four-fact honesty model for owner/customer language mismatch. Never claim translation happened when no real provider is registered. |
| Customer messaging (inbound channel) | MISSING | No WhatsApp/SMS/Twilio/messaging-gateway integration exists anywhere in the repository (confirmed by repository-wide search — the only WhatsApp reference anywhere is WOS1's own honest `CAPABILITY_UNAVAILABLE` disclosure for message deletion). | `rawMessage` must be caller-supplied text (already-received, already-decoded) — this checkpoint never claims to receive or send a real WhatsApp/SMS message. Any "customer reply" this checkpoint produces is a structured, authorized reply *object*; actual outbound delivery is `CAPABILITY_UNAVAILABLE`, exactly like WOS1's marketing engine already discloses for its own domain. |
| Approval workflows | EXISTS AS PATTERN, NOT SHARED ENGINE | ChurchOS quarantine-admin state machine (see Escalation row) and Rule 82's `ELIGIBLE`/gated-promotion pattern are the two closest precedents. Neither is directly composable (different record/domain). | New, narrow approval gate on the order-request record: `PENDING_APPROVAL → APPROVED / REJECTED / ESCALATED`, modeled on the same disclosed conventions, not a shared module. |
| Privacy controls | EXISTS AND REAL (compose) | `IdentityEngine`/`OrganizationRole` fail-closed patterns; Customer's own contact-field privacy conventions. | Reuse fail-closed defaults: an unauthorized requester never sees another customer's order/contact data. |
| Idempotency | EXISTS AS PATTERN | `church-offering-interaction.js`'s `${sessionId}:${giverUserId}:${clientRequestId}` dedup map is the established convention for this repository. | Reuse the identical pattern shape for order requests: `${customerId}:${clientRequestId}` dedup, duplicate resubmission returns the original record. |
| Offline queues / synchronization | EXISTS AS PATTERN (bounded) | `cozy-living-sync.js` and the RP-034 Phase 7 offline-sync model exist but are scoped to media/knowledge records, not commerce. WOS1 itself never introduced a sync layer. | Out of scope for WOS2. Order-request records are local/session-scoped, same honesty boundary WOS1 already established for inventory/marketing state — no fabricated `SYNCED`. |

## Conclusion

No duplicate engine will be created. WOS2 composes, read-only or via
already-public methods: `ShopProduct` (product lookup), `ShopInventory`
(stock validation), `Customer.getCustomer()`, `IdentityEngine`,
`OrganizationRole`. It introduces one genuinely new capability with no
existing owner: a structured order-request lifecycle (extraction →
clarification → validation → approval/escalation → authorized reply),
scoped narrowly and honestly per the MISSING/PLACEHOLDER findings above.
`ShopSalesEngine` (real POS sale lifecycle) is explicitly NOT modified
or duplicated this checkpoint — composing an approved order request into
a real `Sale` is reserved for a future, separately-audited checkpoint.
