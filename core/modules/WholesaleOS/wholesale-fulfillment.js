/**
 * WholesaleOS — Post-Confirmation Fulfillment Lifecycle Engine
 * File Reference: core/modules/WholesaleOS/wholesale-fulfillment.js
 * Layer: Business Domain — Composition Module (RP-035 WOS2 Part 7)
 * Version: 1.0.0-P7
 *
 * BASELINE
 *   COS-RP035-WOS2-P7-SPEC.zip. Implements
 *   docs/history/RP-035-WOS2-P7-Specification.md in full. No unresolved
 *   questions were carried into implementation (Specification Part 12).
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Rule 29,
 * full detail: docs/history/RP-035-WOS2-P7-Rule29-Audit.md)
 *   - Order existence/status source of truth:
 *     window.CozyOS.WholesaleOrderDecision (Part 6) — getDecision()
 *     only, read-only. This file never mutates a Part 6 record and
 *     never reimplements pricing/stock/order-decision logic.
 *   - No dependency on WholesaleCommerce/ShopProduct/ShopInventory —
 *     confirmed WholesaleCommerce exposes no stock-decrement/adjustment
 *     method at all (getStock/getStockStatus/getLowStockProducts/
 *     getOutOfStockProducts are the complete real read-only set), so
 *     this file has no real write path to inventory and does not
 *     invent one.
 *   - Authorization pattern: reuses Part 6's actorType
 *     ("owner" | "assistant") + explicit capability-key shape
 *     structurally — a new, separate capability-key set scoped to
 *     fulfillment actions, not a second authorization system.
 *   - No pre-existing fulfillment/shipping/dispatch lifecycle engine
 *     exists anywhere in this repository (full search documented in
 *     the Rule 29 audit) — this file's core state machine is genuinely
 *     new, not a duplicate of anything.
 *
 * NEVER
 *   Claim a real inventory decrement occurred (realStockDecrement stays
 *   false, permanently — no write path exists). Fabricate a tracking
 *   number, carrier, ETA, or delivery confirmation the caller did not
 *   explicitly supply. Auto-advance a state on a timer, app load, or
 *   any event other than an explicit, capability-checked actor call.
 *   Mutate a Part 6 WholesaleOrderDecision record. Allow a non-owner
 *   actor to reach FULFILLMENT_CANCELLED. Allow DISPATCHED to be
 *   cancelled.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0-P7";

    // Deny-by-default capability set. Exactly these four, per spec
    // Part 5. canCancelFulfillment is never grantable to an assistant
    // actor — checked structurally in #hasCapability below, not merely
    // by capability-map absence.
    const CAPABILITY_KEYS = Object.freeze([
        "canMarkPacked",
        "canMarkDispatched",
        "canMarkDelivered",
        "canCancelFulfillment",
    ]);

    const TERMINAL_STATUSES = Object.freeze(["DELIVERED", "FULFILLMENT_CANCELLED"]);

    function deepClone(v) {
        if (typeof structuredClone === "function") {
            try { return structuredClone(v); } catch (_e) { /* fall through */ }
        }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    class WholesaleFulfillmentEngine {
        #records = new Map();     // fulfillmentId -> internal mutable record
        #byRequestId = new Map(); // requestId -> [fulfillmentId, ...] (creation order)
        #auditLog = [];
        #diagnostics = { created: 0, delivered: 0, cancelled: 0, missingCapabilityRefusals: 0 };
        #nextSeq = 1;

        getVersion() { return MODULE_VERSION; }
        getCapabilityKeys() { return [...CAPABILITY_KEYS]; }

        getCapabilities() {
            return Object.freeze({
                realStockDecrement: false,
                realCourierIntegration: false,
                realDeliveryConfirmation: false,
                trackingVerified: false,
            });
        }

        #freshId() { return `ffl_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({
                id: `fflaud_${this.#auditLog.length + 1}_${Date.now()}`,
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

        #orderDecision() {
            return window.CozyOS && window.CozyOS.WholesaleOrderDecision ? window.CozyOS.WholesaleOrderDecision : null;
        }

        // canCancelFulfillment is structurally owner-only: even if a
        // caller mistakenly sets capabilities.canCancelFulfillment=true
        // on an assistant actor object, this check never honors it.
        #hasCapability(actor, key) {
            if (!actor || typeof actor !== "object") return false;
            if (actor.actorType === "owner") return true;
            if (actor.actorType !== "assistant") return false;
            if (key === "canCancelFulfillment") return false;
            return !!(actor.capabilities && actor.capabilities[key] === true);
        }

        #record(fulfillmentId) { return this.#records.get(fulfillmentId) || null; }

        #transition(record, nextStatus, extra = {}) {
            record.status = nextStatus;
            record.updatedAt = new Date().toISOString();
            Object.assign(record, extra);
            record.history.push({ status: nextStatus, at: record.updatedAt });
            return record;
        }

        #activeFulfillmentIdFor(requestId) {
            const ids = this.#byRequestId.get(requestId) || [];
            for (let i = ids.length - 1; i >= 0; i--) {
                const rec = this.#record(ids[i]);
                if (rec && !TERMINAL_STATUSES.includes(rec.status)) return ids[i];
            }
            return null;
        }

        // -----------------------------------------------------------
        // Part 3 — eligibility-gated creation.
        // -----------------------------------------------------------
        createFulfillment({ requestId, actor } = {}) {
            if (!requestId) return { success: false, reason: "REQUEST_ID_REQUIRED" };

            const existingActiveId = this.#activeFulfillmentIdFor(requestId);
            if (existingActiveId) {
                return { success: false, reason: "FULFILLMENT_ALREADY_EXISTS", fulfillmentId: existingActiveId };
            }

            const orderDecision = this.#orderDecision();
            if (!orderDecision) return { success: false, reason: "CAPABILITY_UNAVAILABLE" };

            const order = orderDecision.getDecision(requestId);
            if (!order) return { success: false, reason: "ORDER_NOT_FOUND" };
            if (order.status !== "CONFIRMED") return { success: false, reason: "ORDER_NOT_CONFIRMED", orderStatus: order.status };

            const fulfillmentId = this.#freshId();
            const now = new Date().toISOString();
            const record = {
                fulfillmentId,
                requestId,
                businessId: order.businessId ?? null,
                branchId: order.branchId ?? null,
                status: "PENDING_FULFILLMENT",
                trackingNumber: null,
                carrier: null,
                trackingProvenance: null,
                cancelReason: null,
                createdAt: now,
                updatedAt: now,
                history: [{ status: "PENDING_FULFILLMENT", at: now }],
            };

            this.#records.set(fulfillmentId, record);
            const list = this.#byRequestId.get(requestId) || [];
            list.push(fulfillmentId);
            this.#byRequestId.set(requestId, list);
            this.#diagnostics.created++;
            this.#logAudit("FULFILLMENT_CREATED", { fulfillmentId, requestId });

            return { success: true, record: deepClone(record) };
        }

        getFulfillment(fulfillmentId) {
            const record = this.#record(fulfillmentId);
            return record ? deepClone(record) : null;
        }

        getFulfillmentByRequestId(requestId) {
            const ids = this.#byRequestId.get(requestId) || [];
            if (ids.length === 0) return null;
            const activeId = this.#activeFulfillmentIdFor(requestId);
            const targetId = activeId || ids[ids.length - 1];
            const record = this.#record(targetId);
            return record ? deepClone(record) : null;
        }

        #requireCapability(record, actor, key, actionLabel) {
            if (!this.#hasCapability(actor, key)) {
                this.#diagnostics.missingCapabilityRefusals++;
                this.#logAudit("MISSING_CAPABILITY", { fulfillmentId: record.fulfillmentId, action: actionLabel, actorType: actor && actor.actorType });
                return { success: false, reason: `MISSING_CAPABILITY:${key}` };
            }
            return null;
        }

        // -----------------------------------------------------------
        // Part 4 — capability-gated forward transitions. No skipped
        // step is ever permitted.
        // -----------------------------------------------------------
        markPacked(fulfillmentId, actor) {
            const record = this.#record(fulfillmentId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "PENDING_FULFILLMENT") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(record, actor, "canMarkPacked", "markPacked");
            if (denied) return denied;
            this.#transition(record, "PACKED");
            this.#logAudit("PACKED", { fulfillmentId, actorType: actor && actor.actorType });
            return { success: true, record: deepClone(record) };
        }

        markDispatched(fulfillmentId, actor, { trackingNumber = null, carrier = null } = {}) {
            const record = this.#record(fulfillmentId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "PACKED") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(record, actor, "canMarkDispatched", "markDispatched");
            if (denied) return denied;
            const extra = { trackingNumber, carrier };
            extra.trackingProvenance = (trackingNumber || carrier) ? "CALLER_PROVIDED_NOT_VERIFIED" : null;
            this.#transition(record, "DISPATCHED", extra);
            this.#logAudit("DISPATCHED", { fulfillmentId, actorType: actor && actor.actorType });
            return { success: true, record: deepClone(record) };
        }

        markDelivered(fulfillmentId, actor) {
            const record = this.#record(fulfillmentId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "DISPATCHED") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(record, actor, "canMarkDelivered", "markDelivered");
            if (denied) return denied;
            this.#transition(record, "DELIVERED");
            this.#diagnostics.delivered++;
            this.#logAudit("DELIVERED", { fulfillmentId, actorType: actor && actor.actorType });
            return { success: true, record: deepClone(record) };
        }

        // -----------------------------------------------------------
        // Part 4/5 — owner-only cancellation. Structurally unreachable
        // by any assistant capability combination (#hasCapability
        // above hard-refuses canCancelFulfillment for actorType
        // "assistant" regardless of the supplied capabilities map).
        // Never reachable from DISPATCHED.
        // -----------------------------------------------------------
        cancelFulfillment(fulfillmentId, actor, { reason = null } = {}) {
            const record = this.#record(fulfillmentId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!["PENDING_FULFILLMENT", "PACKED"].includes(record.status)) {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(record, actor, "canCancelFulfillment", "cancelFulfillment");
            if (denied) return denied;
            this.#transition(record, "FULFILLMENT_CANCELLED", { cancelReason: reason });
            this.#diagnostics.cancelled++;
            this.#logAudit("FULFILLMENT_CANCELLED", { fulfillmentId, actorType: actor && actor.actorType, reason });
            return { success: true, record: deepClone(record) };
        }
    }

    const engineInstance = new WholesaleFulfillmentEngine();

    if (window.CozyOS.WholesaleFulfillment && typeof window.CozyOS.WholesaleFulfillment.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleFulfillment.getVersion();
        if (existingVersion === MODULE_VERSION) {
            return; // Already loaded at the same version — idempotent no-op.
        }
    }
    window.CozyOS.WholesaleFulfillment = engineInstance;
    window.CozyOS.WholesaleFulfillment.CAPABILITY_KEYS = CAPABILITY_KEYS;

    (function initRegistration() {
        const manifest = { id: "wholesale-fulfillment", name: "WholesaleOS Post-Confirmation Fulfillment Lifecycle Engine", version: MODULE_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Post-Confirmation Fulfillment Lifecycle Engine")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-fulfillment"] = { version: MODULE_VERSION };
    })();
})();
