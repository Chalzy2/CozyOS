/**
 * WholesaleOS — Order Decision + Owner/Assistant Escalation Engine
 * File Reference: core/modules/WholesaleOS/wholesale-order-decision.js
 * Layer: Business Domain — Composition Module (RP-035 WOS2 Part 6)
 * Version: 1.0.0-P6
 *
 * BASELINE
 *   COS-RP035-WOS2-P6-SPEC.zip, SHA-256
 *   08360ac134d6660b491ba31201c834efbed588bb8c694e0d2cd91457066075b0.
 *   Implements docs/history/RP-035-WOS2-P6-Specification.md in full,
 *   including its three disclosed unresolved questions (Part 16),
 *   resolved here per the specification's own fallback instruction
 *   ("narrowest disclosed implementation, no invented platform-wide
 *   architecture") since no real repository precedent exists for any
 *   of them:
 *
 *   1. branchId — caller-supplied only, exactly as the spec requires.
 *      No "default branch" concept is invented. Missing branchId is a
 *      hard input error (BRANCH_ID_REQUIRED), never defaulted.
 *   2. Staleness threshold — caller-supplied only, on every reconcile()
 *      call. No default value exists anywhere in this repository, so
 *      none is invented here; omitting it is a hard input error
 *      (STALENESS_THRESHOLD_REQUIRED).
 *   3. UNSUPPORTED_LANGUAGE marker — implemented as the literal string
 *      "UNSUPPORTED_LANGUAGE" set on `marker`, distinguished by a
 *      `markerReason` of `LANGUAGE_NOT_READY` (PHC6 does not report the
 *      language as registered/translation-available-now) or
 *      `TEXT_TRANSLATION_NOT_COMPOSED` (PHC6/CozyTranslate is a live
 *      audio-session translation boundary — getLanguageCapabilities(),
 *      selectViewerLanguage(), etc. — and exposes no generic
 *      text-message translate(text, lang) call this file could compose
 *      read-only. Rather than fabricate translated text, or silently
 *      hand back English, every non-canonical language is honestly
 *      reported UNSUPPORTED_LANGUAGE. Only the canonical base language
 *      ("en") is ever actually rendered.) This is a real, disclosed
 *      capability gap, not a bug — see header note on Part 9 below.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Rule 29,
 * summarised in the spec's own Part 1 and re-confirmed by reading the
 * real files at implementation time)
 *   - Stock/price source of truth: window.CozyOS.WholesaleCommerce
 *     (wholesale-commerce.js) — getStock(), getStockStatus(),
 *     getSellingPrice(), getPriceTiers(). This file never calls
 *     window.CozyOS.ShopProduct / ShopInventory directly, and never
 *     stores a competing stock or price number.
 *   - Input: window.CozyOS.WholesaleOrderUnderstanding (Part 5) records
 *     — this file only reads matchedProductId, variant, quantity,
 *     status, businessId, customerLanguage off a Part 5 record; it
 *     never re-interprets rawMessage and never calls any AI/NLU module.
 *   - Idempotency: same `${customerId}:${clientRequestId}` keyed dedup
 *     pattern as Part 5/WOS1. No new idempotency engine.
 *   - Language readiness: window.CozyOS.ChurchLiveTranslationInteraction
 *     (PHC6) — getLanguageCapabilities() only, read-only, composed for
 *     its real LANGUAGE_REGISTERED / translationAvailableNow facts. No
 *     new translation/language engine is created.
 *
 * NEVER
 *   Store product name/price/category, stock quantities, or duplicate
 *   any WholesaleCommerceBoundary/ShopProduct/ShopInventory/PHC6 data.
 *   Guess a price, guess availability, silently substitute English for
 *   an unready language, silently honor a stale LOCAL_QUEUED number
 *   against changed real stock/price, or let an AI/assistant actor
 *   reach CONFIRMED without an explicit, capability-checked action.
 *   Implement any of the five owner-only actions listed in the spec's
 *   Part 7 (discount/price override, credit, confirming past an
 *   unverified stock number, an "exceptional quantity" override, or
 *   cancelling a CONFIRMED order) as anything an assistant capability
 *   could ever reach — see OWNER_ONLY_ACTIONS below, which exists only
 *   as a documented, structurally-unreachable registry.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0-P6";
    const BASE_LANGUAGE = "en";

    // Deny-by-default capability set. Exactly these four, per spec
    // Part 6. Nothing else exists, nothing else is checked.
    const CAPABILITY_KEYS = Object.freeze([
        "canConfirmOrder",
        "canApplyPartialFulfillment",
        "canRejectOrder",
        "canRequestOwnerApproval",
    ]);

    // Documented-only. No method on this class implements any of
    // these, and no capability flag maps to any of them — see test 22.
    const OWNER_ONLY_ACTIONS = Object.freeze([
        "APPLY_DISCOUNT_OR_PRICE_OVERRIDE",
        "EXTEND_CREDIT",
        "CONFIRM_AGAINST_UNVERIFIED_STOCK",
        "EXCEPTIONAL_QUANTITY_OVERRIDE",
        "CANCEL_CONFIRMED_ORDER",
    ]);

    // Customer-safe projection key set — Part 10. Anything not in this
    // list is never exposed by getCustomerView().
    const CUSTOMER_VIEW_KEYS = Object.freeze([
        "requestId",
        "status",
        "fulfillableQuantity",
        "shortfall",
        "resolvedUnitPrice",
        "message",
    ]);

    function deepClone(v) {
        if (typeof structuredClone === "function") {
            try { return structuredClone(v); } catch (_e) { /* fall through */ }
        }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    class WholesaleOrderDecisionEngine {
        #records = new Map();       // requestId -> internal mutable record
        #idempotency = new Map();   // "customerId:clientRequestId" -> requestId
        #auditLog = [];
        #diagnostics = { created: 0, duplicates: 0, ownerEscalations: 0, reconciled: 0 };
        #nextSeq = 1;

        getVersion() { return MODULE_VERSION; }
        getOwnerOnlyActions() { return [...OWNER_ONLY_ACTIONS]; }
        getCapabilityKeys() { return [...CAPABILITY_KEYS]; }

        #freshId() { return `wod_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({
                id: `wodaud_${this.#auditLog.length + 1}_${Date.now()}`,
                timestamp: new Date().toISOString(),
                action,
                detail,
            }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map((e) => deepClone(e));
            return Object.freeze(typeof predicate === "function" ? list.filter(predicate) : list);
        }

        getDiagnosticsReport() { return deepClone({ pluginVersion: MODULE_VERSION, ...this.#diagnostics }); }

        #commerce() {
            return window.CozyOS && window.CozyOS.WholesaleCommerce ? window.CozyOS.WholesaleCommerce : null;
        }

        #phc6() {
            return window.CozyOS && window.CozyOS.ChurchLiveTranslationInteraction ? window.CozyOS.ChurchLiveTranslationInteraction : null;
        }

        #hasCapability(actor, key) {
            if (!actor || typeof actor !== "object") return false;
            if (actor.actorType === "owner") return true;
            if (actor.actorType !== "assistant") return false;
            return !!(actor.capabilities && actor.capabilities[key] === true);
        }

        #record(requestId) { return this.#records.get(requestId) || null; }

        #transition(record, nextStatus, extra = {}) {
            record.status = nextStatus;
            record.updatedAt = new Date().toISOString();
            Object.assign(record, extra);
            record.history.push({ status: nextStatus, at: record.updatedAt });
            return record;
        }

        // -----------------------------------------------------------
        // Part 4/2/3/5 — inventory-validated decision creation.
        // -----------------------------------------------------------
        createDecision({
            customerId, clientRequestId = null, branchId, part5Record,
            customerLanguage = null, ownerLanguage = null,
        } = {}) {
            if (!customerId) return { success: false, reason: "CUSTOMER_ID_REQUIRED" };
            if (!branchId) return { success: false, reason: "BRANCH_ID_REQUIRED" };
            if (!part5Record || part5Record.status !== "DRAFT_RESOLVED") {
                return { success: false, reason: "PART5_RECORD_NOT_DRAFT_RESOLVED" };
            }
            if (!part5Record.matchedProductId) return { success: false, reason: "PRODUCT_NOT_MATCHED" };
            const quantity = part5Record.quantity;
            if (!(typeof quantity === "number" && quantity > 0)) return { success: false, reason: "QUANTITY_INVALID" };

            if (clientRequestId) {
                const idKey = `${customerId}:${clientRequestId}`;
                const existingId = this.#idempotency.get(idKey);
                if (existingId) {
                    const existing = this.#record(existingId);
                    if (existing) {
                        this.#diagnostics.duplicates++;
                        this.#logAudit("DUPLICATE_SUBMISSION", { customerId, clientRequestId, requestId: existingId });
                        // Never re-runs the inventory/price check.
                        return { success: true, duplicate: true, record: deepClone(existing) };
                    }
                }
            }

            const commerce = this.#commerce();
            if (!commerce) return { success: false, reason: "CAPABILITY_UNAVAILABLE" };

            const requestId = this.#freshId();
            const now = new Date().toISOString();
            const record = {
                requestId,
                customerId,
                clientRequestId,
                businessId: part5Record.businessId ?? null,
                branchId,
                productId: part5Record.matchedProductId,
                variant: part5Record.variant ?? null,
                requestedQuantity: quantity,
                customerLanguage,
                ownerLanguage,
                createdAt: now,
                updatedAt: now,
                status: "INVENTORY_CHECK_REQUIRED", // internal/transient
                resolvedUnitPrice: null,
                fulfillableQuantity: null,
                shortfall: null,
                reason: null,
                staleAtSync: false,
                priceChangedAtSync: false,
                originalQuantity: null,
                originalUnitPrice: null,
                propagationState: null,
                history: [{ status: "INVENTORY_CHECK_REQUIRED", at: now }],
            };

            // ---- Part 3 — real price, hard-blocks if unavailable ----
            const priceResult = commerce.getSellingPrice(record.productId);
            const resolvedPrice = priceResult && priceResult.success
                ? (priceResult.promoPrice ?? priceResult.retailPrice ?? null)
                : null;

            if (!priceResult || !priceResult.success || resolvedPrice === null) {
                this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason: "PRICE_UNAVAILABLE" });
                this.#records.set(requestId, record);
                if (clientRequestId) this.#idempotency.set(`${customerId}:${clientRequestId}`, requestId);
                this.#diagnostics.created++;
                this.#diagnostics.ownerEscalations++;
                this.#logAudit("DECISION_CREATED", { requestId, status: record.status, reason: record.reason });
                return { success: true, duplicate: false, record: deepClone(record) };
            }
            record.resolvedUnitPrice = resolvedPrice;

            // ---- Part 4 — real stock, never fabricated ----
            const stockResult = commerce.getStock(record.productId, branchId);
            const stockStatusResult = commerce.getStockStatus(record.productId, branchId);
            if (!stockResult || !stockResult.success) {
                this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason: "CAPABILITY_UNAVAILABLE" });
            } else {
                const available = typeof stockResult.available === "number" ? stockResult.available : stockResult.stock;
                const outOfStock = stockStatusResult && stockStatusResult.success && stockStatusResult.status === "OUT_OF_STOCK";
                if (outOfStock || available <= 0) {
                    this.#transition(record, "INSUFFICIENT_STOCK", { fulfillableQuantity: 0, shortfall: quantity });
                } else if (available < quantity) {
                    this.#transition(record, "PARTIALLY_FULFILLABLE", {
                        fulfillableQuantity: available,
                        shortfall: quantity - available,
                    });
                } else {
                    this.#transition(record, "FULFILLABLE", { fulfillableQuantity: quantity, shortfall: 0 });
                }
            }

            this.#records.set(requestId, record);
            if (clientRequestId) this.#idempotency.set(`${customerId}:${clientRequestId}`, requestId);
            this.#diagnostics.created++;
            if (record.status === "OWNER_APPROVAL_REQUIRED") this.#diagnostics.ownerEscalations++;
            this.#logAudit("DECISION_CREATED", { requestId, status: record.status });

            return { success: true, duplicate: false, record: deepClone(record) };
        }

        getDecision(requestId) {
            const record = this.#record(requestId);
            return record ? deepClone(record) : null;
        }

        // -----------------------------------------------------------
        // Part 6 — capability-gated transitions.
        // Any assistant call missing the needed capability escalates
        // to OWNER_APPROVAL_REQUIRED — it never silently proceeds and
        // never silently fails invisibly.
        // -----------------------------------------------------------
        confirmOrder(requestId, actor) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!["FULFILLABLE", "LOCAL_QUEUED"].includes(record.status)) {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            if (!this.#hasCapability(actor, "canConfirmOrder")) {
                this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason: "MISSING_CAPABILITY:canConfirmOrder" });
                this.#diagnostics.ownerEscalations++;
                this.#logAudit("MISSING_CAPABILITY", { requestId, action: "confirmOrder" });
                return { success: true, escalated: true, record: deepClone(record) };
            }
            this.#transition(record, "CONFIRMED", { reason: null });
            this.#logAudit("CONFIRMED", { requestId, actorType: actor && actor.actorType });
            return { success: true, escalated: false, record: deepClone(record) };
        }

        applyPartialFulfillment(requestId, actor, { mode = "LOCAL_QUEUED" } = {}) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "PARTIALLY_FULFILLABLE") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            if (!this.#hasCapability(actor, "canApplyPartialFulfillment")) {
                this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason: "MISSING_CAPABILITY:canApplyPartialFulfillment" });
                this.#diagnostics.ownerEscalations++;
                this.#logAudit("MISSING_CAPABILITY", { requestId, action: "applyPartialFulfillment" });
                return { success: true, escalated: true, record: deepClone(record) };
            }
            const target = mode === "CONFIRM" ? "CONFIRMED" : "LOCAL_QUEUED";
            this.#transition(record, target, { reason: null });
            this.#logAudit("PARTIAL_FULFILLMENT_APPLIED", { requestId, mode: target });
            return { success: true, escalated: false, record: deepClone(record) };
        }

        rejectOrder(requestId, actor, { reason = null } = {}) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            const rejectable = ["INSUFFICIENT_STOCK", "PARTIALLY_FULFILLABLE", "FULFILLABLE", "OWNER_APPROVAL_REQUIRED", "LOCAL_QUEUED"];
            if (!rejectable.includes(record.status)) {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            if (!this.#hasCapability(actor, "canRejectOrder")) {
                this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason: "MISSING_CAPABILITY:canRejectOrder" });
                this.#diagnostics.ownerEscalations++;
                this.#logAudit("MISSING_CAPABILITY", { requestId, action: "rejectOrder" });
                return { success: true, escalated: true, record: deepClone(record) };
            }
            this.#transition(record, "REJECTED", { reason: reason || "REJECTED_BY_ACTOR" });
            this.#logAudit("REJECTED", { requestId, actorType: actor && actor.actorType, reason });
            return { success: true, escalated: false, record: deepClone(record) };
        }

        // Deliberate assistant escalation (distinct from the automatic
        // escalation above, which needs no permission).
        requestOwnerApproval(requestId, actor, { reason = "ASSISTANT_REQUESTED" } = {}) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!this.#hasCapability(actor, "canRequestOwnerApproval")) {
                return { success: false, reason: "MISSING_CAPABILITY" };
            }
            this.#transition(record, "OWNER_APPROVAL_REQUIRED", { reason });
            this.#diagnostics.ownerEscalations++;
            this.#logAudit("OWNER_APPROVAL_REQUESTED", { requestId, reason });
            return { success: true, record: deepClone(record) };
        }

        // Only an owner actor may resolve an OWNER_APPROVAL_REQUIRED
        // record — this is the sole path back out of it.
        ownerResolve(requestId, actor, { decision } = {}) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!actor || actor.actorType !== "owner") return { success: false, reason: "OWNER_ONLY" };
            if (record.status !== "OWNER_APPROVAL_REQUIRED") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const map = { CONFIRM: "CONFIRMED", REJECT: "REJECTED", LOCAL_QUEUED: "LOCAL_QUEUED" };
            const next = map[decision];
            if (!next) return { success: false, reason: "DECISION_INVALID" };
            this.#transition(record, next, { reason: null });
            this.#logAudit("OWNER_RESOLVED", { requestId, decision: next });
            return { success: true, record: deepClone(record) };
        }

        // -----------------------------------------------------------
        // Part 11 — offline recovery / staleness. Caller-invoked only.
        // -----------------------------------------------------------
        reconcile(requestId, { stalenessThresholdMs } = {}) {
            const record = this.#record(requestId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (typeof stalenessThresholdMs !== "number") {
                return { success: false, reason: "STALENESS_THRESHOLD_REQUIRED" };
            }
            if (record.status !== "LOCAL_QUEUED") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }

            const commerce = this.#commerce();
            if (!commerce) return { success: false, reason: "CAPABILITY_UNAVAILABLE" };

            const ageMs = Date.now() - new Date(record.createdAt).getTime();
            const thresholdBreached = ageMs > stalenessThresholdMs;

            const priceResult = commerce.getSellingPrice(record.productId);
            const currentPrice = priceResult && priceResult.success
                ? (priceResult.promoPrice ?? priceResult.retailPrice ?? null)
                : null;
            const priceChanged = currentPrice !== null && currentPrice !== record.resolvedUnitPrice;

            const stockResult = commerce.getStock(record.productId, record.branchId);
            const stockStatusResult = commerce.getStockStatus(record.productId, record.branchId);
            const available = stockResult && stockResult.success
                ? (typeof stockResult.available === "number" ? stockResult.available : stockResult.stock)
                : null;
            const outOfStock = stockStatusResult && stockStatusResult.success && stockStatusResult.status === "OUT_OF_STOCK";

            const queuedQuantity = record.fulfillableQuantity;
            const extra = {};
            if (priceChanged) {
                extra.priceChangedAtSync = true;
                extra.originalUnitPrice = record.resolvedUnitPrice;
                extra.resolvedUnitPrice = currentPrice;
            }

            let nextStatus = "LOCAL_QUEUED";
            if (available !== null && (outOfStock || available < queuedQuantity)) {
                extra.staleAtSync = true;
                extra.originalQuantity = queuedQuantity;
                if (outOfStock || available <= 0) {
                    nextStatus = "INSUFFICIENT_STOCK";
                    extra.fulfillableQuantity = 0;
                    extra.shortfall = queuedQuantity;
                } else {
                    nextStatus = "PARTIALLY_FULFILLABLE";
                    extra.fulfillableQuantity = available;
                    extra.shortfall = queuedQuantity - available;
                }
            } else if (thresholdBreached) {
                extra.staleAtSync = true;
            }

            this.#transition(record, nextStatus, extra);
            this.#diagnostics.reconciled++;
            this.#logAudit("RECONCILED", { requestId, nextStatus, staleAtSync: !!extra.staleAtSync, priceChangedAtSync: !!extra.priceChangedAtSync });
            return { success: true, record: deepClone(record) };
        }

        // -----------------------------------------------------------
        // Part 9 — independent customer/owner language rendering,
        // composing PHC6 read-only. See header note: only the
        // canonical base language is actually rendered; every other
        // language honestly returns UNSUPPORTED_LANGUAGE rather than
        // fabricating translated text this file cannot really produce.
        // -----------------------------------------------------------
        #renderLanguageMessage(baseText, languageId) {
            if (!languageId) return { language: null, text: null, marker: null };
            const normalized = String(languageId).toLowerCase();
            if (normalized === BASE_LANGUAGE) {
                return { language: languageId, text: baseText, marker: null };
            }
            const phc6 = this.#phc6();
            if (!phc6 || typeof phc6.getLanguageCapabilities !== "function") {
                return { language: languageId, text: null, marker: "UNSUPPORTED_LANGUAGE", markerReason: "LANGUAGE_NOT_READY" };
            }
            const caps = phc6.getLanguageCapabilities();
            const entry = caps && caps.available
                ? (caps.languages || []).find((l) => String(l.languageId).toLowerCase() === normalized)
                : null;
            if (!entry || !entry.registered || !entry.translationAvailableNow) {
                return { language: languageId, text: null, marker: "UNSUPPORTED_LANGUAGE", markerReason: "LANGUAGE_NOT_READY" };
            }
            // PHC6 confirms the language is registered and live
            // translation infrastructure is available right now, but
            // that infrastructure is a live audio/session boundary
            // with no generic text(message, lang) call this file can
            // compose read-only — see class header. Reported honestly
            // rather than fabricated.
            return { language: languageId, text: null, marker: "UNSUPPORTED_LANGUAGE", markerReason: "TEXT_TRANSLATION_NOT_COMPOSED" };
        }

        getCustomerMessage(requestId) {
            const record = this.#record(requestId);
            if (!record) return null;
            const base = `Order ${record.requestId}: ${record.status}` +
                (record.fulfillableQuantity !== null ? `, fulfillable ${record.fulfillableQuantity}` : "") +
                (record.shortfall ? `, shortfall ${record.shortfall}` : "");
            return this.#renderLanguageMessage(base, record.customerLanguage);
        }

        getOwnerMessage(requestId) {
            const record = this.#record(requestId);
            if (!record) return null;
            const base = `Order ${record.requestId}: ${record.status}` +
                (record.reason ? `, reason ${record.reason}` : "");
            return this.#renderLanguageMessage(base, record.ownerLanguage);
        }

        // -----------------------------------------------------------
        // Part 10 — customer-safe projection. Only CUSTOMER_VIEW_KEYS
        // are ever exposed; nothing owner/audit/diagnostic leaks.
        // -----------------------------------------------------------
        getCustomerView(requestId) {
            const record = this.#record(requestId);
            if (!record) return null;
            const message = this.getCustomerMessage(requestId);
            const view = {
                requestId: record.requestId,
                status: record.status,
                fulfillableQuantity: record.fulfillableQuantity,
                shortfall: record.shortfall,
                resolvedUnitPrice: record.resolvedUnitPrice,
                message,
            };
            // Defensive structural guarantee, not just convention.
            for (const key of Object.keys(view)) {
                if (!CUSTOMER_VIEW_KEYS.includes(key)) delete view[key];
            }
            return deepClone(view);
        }
    }

    const engineInstance = new WholesaleOrderDecisionEngine();

    if (window.CozyOS.WholesaleOrderDecision && typeof window.CozyOS.WholesaleOrderDecision.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleOrderDecision.getVersion();
        if (existingVersion === MODULE_VERSION) {
            return; // Already loaded at the same version — idempotent no-op.
        }
    }
    window.CozyOS.WholesaleOrderDecision = engineInstance;
    window.CozyOS.WholesaleOrderDecision.CAPABILITY_KEYS = CAPABILITY_KEYS;
    window.CozyOS.WholesaleOrderDecision.OWNER_ONLY_ACTIONS = OWNER_ONLY_ACTIONS;
    window.CozyOS.WholesaleOrderDecision.CUSTOMER_VIEW_KEYS = CUSTOMER_VIEW_KEYS;

    (function initRegistration() {
        const manifest = { id: "wholesale-order-decision", name: "WholesaleOS Order Decision + Owner/Assistant Escalation Engine", version: MODULE_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Order Decision + Owner/Assistant Escalation Engine")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-order-decision"] = { version: MODULE_VERSION };
    })();
})();
