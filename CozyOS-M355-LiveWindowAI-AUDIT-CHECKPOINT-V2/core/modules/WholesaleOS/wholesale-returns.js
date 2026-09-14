/**
 * WholesaleOS — Returns / Refund Record Lifecycle Engine
 * File Reference: core/modules/WholesaleOS/wholesale-returns.js
 * Layer: Business Domain — Composition Module (RP-035 WOS2 Part 8)
 * Version: 1.0.0-P8
 * Lifecycle stage: P8-IMPLEMENTED (not yet TESTED or CERTIFIED)
 *
 * BASELINE
 *   COS-RP035-WOS2-P7-CERTIFIED.zip,
 *   SHA-256 17f45987eedd0da710410fddb5239c172de63738770cbb154ebc5336e2e86b4e.
 *   Implements docs/history/RP-035-WOS2-P8-Specification.md (v2,
 *   finalized) and its Part 7 binding decisions in full. Rule 29 audit:
 *   docs/history/RP-035-WOS2-P8-Rule29-Audit.md.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Rule 29,
 * re-confirmed by reading the real files at implementation time, not
 * merely trusting the audit's prose paraphrase of their method names)
 *   - Order source of truth: window.CozyOS.WholesaleOrderDecision (P6)
 *     — getDecision(requestId) only, read-only. Never mutated.
 *   - Delivery source of truth: window.CozyOS.WholesaleFulfillment (P7)
 *     — getFulfillmentByRequestId(requestId) only, read-only. DELIVERED
 *     is the sole eligible status; P7 has no PARTIAL_DELIVERY concept.
 *   - Inventory: window.CozyOS.ShopInventory — the real write method is
 *     recordStockMovement({productId, branchId, type, quantity,
 *     reference}), NOT "recordMovement()" as the audit's prose
 *     paraphrased it; this file calls the real method name. It throws
 *     on invalid input rather than returning {success:false}, so every
 *     call site here wraps it in try/catch and never presents a thrown
 *     error as a fabricated success.
 *   - Payment provider capability: window.CozyOS.PaymentProvider
 *     (façade over ProviderRegistry/CapabilityEngine) —
 *     getCapabilityProfile(providerId) is the real, current capability
 *     surface for a provider's getCapabilities().refunds fact. Real
 *     "cash" and "mpesa" adapters are auto-registered by that façade at
 *     load time from window.CozyOS.__PaymentProviderAdapters.
 *   - Payment-capture evidence + refund execution:
 *     window.CozyOS.ShopPayments — getPayment(paymentId) and
 *     refund(paymentId, {amount, reason}). Confirmed (Rule 29 audit,
 *     finding 2 and finding 8 of this file's own re-verification):
 *     WholesaleOS has never been wired to ShopPayments — no wholesale
 *     order has a ShopPayments saleId/paymentId of its own. This file
 *     does NOT build that seam. The only honest path to real
 *     payment-capture evidence is a real, existing ShopPayments
 *     paymentId the caller explicitly supplies (e.g. an owner who
 *     manually recorded a wholesale cash collection through ShopOS's
 *     till) — verified via a real getPayment() lookup, never derived,
 *     never assumed to exist because an order exists. In today's
 *     repository this evidence will essentially never be present for a
 *     wholesale order, which is exactly why the specification declares
 *     REFUND_EXECUTED conditionally-reachable-in-shape-only for every
 *     provider, cash included.
 *   - Customer identity: window.CozyOS.Customer — getCustomer(customerId)
 *     only, read-only.
 *   - Permissions: window.CozyOS.IdentityEngine —
 *     checkResourcePermission(userId, "resource:action") only. Per
 *     specification Part 2 this file deliberately does NOT reuse P6/P7's
 *     self-declared `actor.capabilities` map for its owner-controlled
 *     gate keys (that map is a caller-supplied, unverified claim — a
 *     parallel permission system the specification explicitly forbids
 *     for P8). See "AUTHORIZATION DESIGN" below for the resulting,
 *     narrower shape.
 *   - Notification: out of scope per the Rule 29 audit's own ownership
 *     table ("Out of P8 scope"). This file keeps an internal
 *     `ownerNotified` boolean only; it never calls cozy-notification.js
 *     and never claims a real send.
 *
 * AUTHORIZATION DESIGN — resolves a real tension the specification
 * creates and does not fully spell out, documented here rather than
 * silently decided.
 *   Specification Part 2 says "Permissions use the real
 *   IdentityEngine.checkResourcePermission(). No parallel permission
 *   system." Part 4 lists eight gate keys (canApproveReturn,
 *   canRejectReturn, canInspectReturn, canRestoreReturnedStock,
 *   canApproveRefund, canExecuteRefund, canConfirmMpesaRefund,
 *   canOverrideEligibility) and says each is "checked structurally the
 *   same way P7 checks canCancelFulfillment — never inferred from role
 *   name, never granted by default." In wholesale-fulfillment.js,
 *   canCancelFulfillment is hard-denied to every assistant actor
 *   regardless of any capability grant (#hasCapability returns false
 *   unconditionally for that key when actorType is "assistant"). Read
 *   literally, "the same way" means: all eight Part 4 gate keys are
 *   structurally owner-only in this file too — never satisfiable by an
 *   assistant, even with a real IdentityEngine grant. Part 4 separately
 *   gives canRequestReturn as an example of a capability an assistant
 *   *can* be granted ("only if the owner has explicitly granted that
 *   specific capability") — and canRequestReturn is notably absent from
 *   the eight-key structural list. So: canRequestReturn is the one
 *   capability an assistant may hold, verified for real via
 *   IdentityEngine.checkResourcePermission(userId, "return:request");
 *   every other gate key requires actor.actorType === "owner", full
 *   stop, exactly like canCancelFulfillment. canConfirmMpesaRefund is
 *   additionally never checked by any code path at all, since
 *   REFUND_EXECUTED is never reachable for M-Pesa regardless of who is
 *   asking (see refund track below).
 *
 * NEVER
 *   Store an `amountPaid` field, or present the resolved order price as
 *   a payment fact — it is always returned labeled
 *   ORDER_RESOLVED_PRICE_NOT_CONFIRMED_PAYMENT. Call
 *   ShopInventory.recordStockMovement() for a DAMAGED_DISPOSITION return
 *   — that disposition is terminal, undocumented as a ledger entry, on
 *   purpose. Report REFUND_EXECUTED without a real, current
 *   getCapabilityProfile(providerId).profile.refunds === true AND a
 *   real, verified ShopPayments COMPLETED payment record AND a real
 *   successful ShopPayments.refund() call. Invent a quarantine
 *   inventory bucket, a credit note, a partial-delivery quantity, or a
 *   real notification send. Let an assistant actor reach any of the
 *   eight Part 4 owner-only gate keys under any circumstance. Silently
 *   advance a LOCAL_QUEUED record — reconcile() always re-reads real
 *   state first.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0-P8";

    // Structurally owner-only — see AUTHORIZATION DESIGN above. None of
    // these is ever satisfiable by an assistant actor, regardless of any
    // IdentityEngine grant. canConfirmMpesaRefund is declared for shape
    // only; no method below ever calls #hasCapability with this key,
    // because REFUND_EXECUTED is never reachable for M-Pesa in the
    // first place (real getCapabilities().refunds === false).
    const OWNER_ONLY_GATE_KEYS = Object.freeze([
        "canApproveReturn",
        "canRejectReturn",
        "canInspectReturn",
        "canRestoreReturnedStock",
        "canApproveRefund",
        "canExecuteRefund",
        "canConfirmMpesaRefund",
        "canOverrideEligibility",
    ]);

    // The one capability an assistant actor may genuinely hold, verified
    // for real through IdentityEngine.checkResourcePermission() — never
    // a self-declared capabilities map.
    const ASSISTANT_GRANTABLE_KEY = "canRequestReturn";
    const ASSISTANT_GRANTABLE_PERMISSION = "return:request";

    const CAPABILITY_KEYS = Object.freeze([ASSISTANT_GRANTABLE_KEY, ...OWNER_ONLY_GATE_KEYS]);

    // A narrow, disclosed categorization scheme for return reasons — an
    // implementation detail of this state machine, not a repository
    // fact. Anything outside this set (including no reason at all) is
    // honestly ambiguous and lands the request on RETURN_REQUIRES_REVIEW
    // rather than guessing intent.
    const KNOWN_REASON_CODES = Object.freeze(["DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND"]);

    const RETURN_CUSTOMER_VIEW_KEYS = Object.freeze([
        "returnId", "requestId", "status", "disposition",
        "requestedReturnQuantity", "reason", "estimatedRefund",
    ]);
    const REFUND_CUSTOMER_VIEW_KEYS = Object.freeze([
        "refundId", "returnId", "status", "providerId", "estimatedRefund",
    ]);

    function deepClone(v) {
        if (typeof structuredClone === "function") {
            try { return structuredClone(v); } catch (_e) { /* fall through */ }
        }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    class WholesaleReturnsEngine {
        #returns = new Map();          // returnId -> internal mutable record
        #refunds = new Map();          // refundId -> internal mutable record
        #refundsByReturnId = new Map(); // returnId -> [refundId, ...] (creation order)
        #returnIdempotency = new Map();   // "customerId:clientRequestId" -> returnId
        #refundIdempotency = new Map();   // "customerId:clientRequestId" -> refundId
        #restoreIdempotency = new Map();  // "customerId:clientRequestId" -> returnId (movement already attempted)
        #auditLog = [];
        #diagnostics = {
            returnsCreated: 0, returnsRequiringReview: 0, returnsApproved: 0, returnsRejected: 0,
            stockRestored: 0, damagedDispositions: 0,
            refundsRequested: 0, refundsUnavailable: 0, refundsExecuted: 0, refundsFailed: 0,
            duplicateSubmissions: 0, missingCapabilityRefusals: 0,
        };
        #nextSeq = 1;

        getVersion() { return MODULE_VERSION; }
        getCapabilityKeys() { return [...CAPABILITY_KEYS]; }
        getKnownReasonCodes() { return [...KNOWN_REASON_CODES]; }

        #freshReturnId() { return `ret_${Date.now().toString(36)}_${this.#nextSeq++}`; }
        #freshRefundId() { return `rfd_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({
                id: `retaud_${this.#auditLog.length + 1}_${Date.now()}`,
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

        // -----------------------------------------------------------
        // Real, read-only composition points. Every one of these
        // returns null (never a fabricated stand-in) when the real
        // engine isn't loaded.
        // -----------------------------------------------------------
        #orderDecision() { return window.CozyOS && window.CozyOS.WholesaleOrderDecision ? window.CozyOS.WholesaleOrderDecision : null; }
        #fulfillment() { return window.CozyOS && window.CozyOS.WholesaleFulfillment ? window.CozyOS.WholesaleFulfillment : null; }
        #inventory() { return window.CozyOS && window.CozyOS.ShopInventory ? window.CozyOS.ShopInventory : null; }
        #paymentProvider() { return window.CozyOS && window.CozyOS.PaymentProvider ? window.CozyOS.PaymentProvider : null; }
        #shopPayments() { return window.CozyOS && window.CozyOS.ShopPayments ? window.CozyOS.ShopPayments : null; }
        #identity() { return window.CozyOS && window.CozyOS.IdentityEngine ? window.CozyOS.IdentityEngine : null; }
        #customer() { return window.CozyOS && window.CozyOS.Customer ? window.CozyOS.Customer : null; }

        // -----------------------------------------------------------
        // AUTHORIZATION — see class-header "AUTHORIZATION DESIGN".
        // -----------------------------------------------------------
        #hasCapability(actor, key) {
            if (!actor || typeof actor !== "object") return false;
            if (actor.actorType === "owner") return true;
            if (actor.actorType !== "assistant") return false;
            if (key !== ASSISTANT_GRANTABLE_KEY) return false; // all eight Part 4 gate keys: hard-denied to assistants, unconditionally
            const identity = this.#identity();
            if (!identity || typeof identity.checkResourcePermission !== "function") return false;
            if (!actor.userId) return false;
            return identity.checkResourcePermission(actor.userId, ASSISTANT_GRANTABLE_PERMISSION) === true;
        }

        #requireCapability(actor, key, actionLabel, extraDetail = {}) {
            if (!this.#hasCapability(actor, key)) {
                this.#diagnostics.missingCapabilityRefusals++;
                this.#logAudit("MISSING_CAPABILITY", { action: actionLabel, actorType: actor && actor.actorType, key, ...extraDetail });
                return { success: false, reason: `MISSING_CAPABILITY:${key}` };
            }
            return null;
        }

        #returnRecord(returnId) { return this.#returns.get(returnId) || null; }
        #refundRecord(refundId) { return this.#refunds.get(refundId) || null; }

        #transitionReturn(record, nextStatus, extra = {}) {
            record.status = nextStatus;
            record.updatedAt = new Date().toISOString();
            Object.assign(record, extra);
            record.history.push({ status: nextStatus, at: record.updatedAt });
            return record;
        }
        #transitionRefund(record, nextStatus, extra = {}) {
            record.status = nextStatus;
            record.updatedAt = new Date().toISOString();
            Object.assign(record, extra);
            record.history.push({ status: nextStatus, at: record.updatedAt });
            return record;
        }

        // =============================================================
        // RETURN REQUEST TRACK
        // =============================================================

        /**
         * #evaluateEligibility — real, read-only compose against P6/P7.
         * Never invents a fact either engine doesn't actually provide.
         * Returns either {ok:true, order, fulfillment} or
         * {ok:false, reason, ...}.
         */
        #evaluateEligibility(requestId, requestedReturnQuantity, { overrideEligibility = false } = {}) {
            const orderDecision = this.#orderDecision();
            if (!orderDecision) return { ok: false, reason: "CAPABILITY_UNAVAILABLE", detail: "WholesaleOrderDecision (P6) not loaded." };
            const order = orderDecision.getDecision(requestId);
            if (!order) return { ok: false, reason: "ORDER_NOT_FOUND" };

            const fulfillmentEngine = this.#fulfillment();
            if (!fulfillmentEngine) return { ok: false, reason: "CAPABILITY_UNAVAILABLE", detail: "WholesaleFulfillment (P7) not loaded." };
            const fulfillmentRecord = fulfillmentEngine.getFulfillmentByRequestId(requestId);
            if (!fulfillmentRecord || fulfillmentRecord.status !== "DELIVERED") {
                return { ok: false, reason: "FULFILLMENT_NOT_DELIVERED", fulfillmentStatus: fulfillmentRecord ? fulfillmentRecord.status : null };
            }

            const quantity = Number(requestedReturnQuantity);
            if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: "QUANTITY_INVALID" };
            if (quantity > order.requestedQuantity && !overrideEligibility) {
                return { ok: false, reason: "QUANTITY_EXCEEDS_ORDER", orderedQuantity: order.requestedQuantity };
            }

            return { ok: true, order, fulfillment: fulfillmentRecord };
        }

        /**
         * createReturnRequest — real eligibility-gated creation.
         *   queueOffline:true skips the real-time P6/P7 check and lands
         *   the record on LOCAL_QUEUED instead — reconcileReturn() later
         *   re-reads real state before advancing anything.
         */
        createReturnRequest({
            customerId, clientRequestId = null, requestId, actor,
            reason = null, requestedReturnQuantity, overrideEligibility = false, queueOffline = false,
        } = {}) {
            if (!customerId) return { success: false, reason: "CUSTOMER_ID_REQUIRED" };
            if (!requestId) return { success: false, reason: "REQUEST_ID_REQUIRED" };

            if (clientRequestId) {
                const idKey = `${customerId}:${clientRequestId}`;
                const existingId = this.#returnIdempotency.get(idKey);
                if (existingId) {
                    const existing = this.#returnRecord(existingId);
                    if (existing) {
                        this.#diagnostics.duplicateSubmissions++;
                        this.#logAudit("DUPLICATE_RETURN_SUBMISSION", { customerId, clientRequestId, returnId: existingId });
                        return { success: true, duplicate: true, record: deepClone(existing) };
                    }
                }
            }

            if (overrideEligibility && !this.#hasCapability(actor, "canOverrideEligibility")) {
                return { success: false, reason: "MISSING_CAPABILITY:canOverrideEligibility" };
            }

            const returnId = this.#freshReturnId();
            const now = new Date().toISOString();
            const baseRecord = {
                returnId, customerId, clientRequestId, requestId,
                branchId: null, productId: null,
                requestedReturnQuantity: Number(requestedReturnQuantity) || null,
                reason: reason || null,
                overrideEligibility: !!overrideEligibility,
                status: "RETURN_REQUESTED",
                disposition: null,
                stockMovement: null,
                rejectReason: null,
                inspectionNotes: null,
                ownerNotified: false,
                createdAt: now, updatedAt: now,
                history: [],
            };

            if (queueOffline) {
                this.#transitionReturn(baseRecord, "LOCAL_QUEUED", {});
                this.#returns.set(returnId, baseRecord);
                if (clientRequestId) this.#returnIdempotency.set(`${customerId}:${clientRequestId}`, returnId);
                this.#diagnostics.returnsCreated++;
                this.#logAudit("RETURN_QUEUED_OFFLINE", { returnId, requestId });
                return { success: true, duplicate: false, record: deepClone(baseRecord) };
            }

            const eligibility = this.#evaluateEligibility(requestId, requestedReturnQuantity, { overrideEligibility });
            if (!eligibility.ok) {
                this.#logAudit("RETURN_REQUEST_REFUSED", { requestId, reason: eligibility.reason });
                return { success: false, reason: eligibility.reason, ...(eligibility.orderedQuantity !== undefined ? { orderedQuantity: eligibility.orderedQuantity } : {}), ...(eligibility.fulfillmentStatus !== undefined ? { fulfillmentStatus: eligibility.fulfillmentStatus } : {}) };
            }

            baseRecord.branchId = eligibility.order.branchId;
            baseRecord.productId = eligibility.order.productId;
            baseRecord.requestedReturnQuantity = Number(requestedReturnQuantity);

            const reasonKnown = reason !== null && KNOWN_REASON_CODES.includes(reason);
            const capabilityOk = this.#hasCapability(actor, ASSISTANT_GRANTABLE_KEY);

            if (!capabilityOk) {
                this.#transitionReturn(baseRecord, "RETURN_REQUIRES_REVIEW", { reason: reason || null, rejectReason: null });
                Object.assign(baseRecord, { reviewReason: "MISSING_CAPABILITY:canRequestReturn" });
                this.#diagnostics.returnsRequiringReview++;
                this.#logAudit("MISSING_CAPABILITY", { action: "createReturnRequest", actorType: actor && actor.actorType, key: ASSISTANT_GRANTABLE_KEY });
            } else if (!reasonKnown) {
                this.#transitionReturn(baseRecord, "RETURN_REQUIRES_REVIEW", {});
                Object.assign(baseRecord, { reviewReason: "AMBIGUOUS_REASON" });
                this.#diagnostics.returnsRequiringReview++;
            } else {
                this.#transitionReturn(baseRecord, "RETURN_REQUESTED", {});
            }

            this.#returns.set(returnId, baseRecord);
            if (clientRequestId) this.#returnIdempotency.set(`${customerId}:${clientRequestId}`, returnId);
            this.#diagnostics.returnsCreated++;
            this.#logAudit("RETURN_CREATED", { returnId, requestId, status: baseRecord.status });

            return { success: true, duplicate: false, record: deepClone(baseRecord) };
        }

        getReturn(returnId) {
            const record = this.#returnRecord(returnId);
            return record ? deepClone(record) : null;
        }

        getReturnsByRequestId(requestId) {
            return Array.from(this.#returns.values())
                .filter((r) => r.requestId === requestId)
                .map((r) => deepClone(r));
        }

        /**
         * reconcileReturn — real re-check of a LOCAL_QUEUED return
         * against current P6/P7 state. Never invents the outcome —
         * advances only if the real eligibility check now genuinely
         * passes, otherwise reports the honest current blocking reason
         * and stays LOCAL_QUEUED.
         */
        reconcileReturn(returnId) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "LOCAL_QUEUED") return { success: false, reason: "INVALID_TRANSITION", from: record.status };

            const eligibility = this.#evaluateEligibility(record.requestId, record.requestedReturnQuantity, { overrideEligibility: record.overrideEligibility });
            if (!eligibility.ok) {
                this.#logAudit("RECONCILE_RETURN_STILL_BLOCKED", { returnId, reason: eligibility.reason });
                return { success: true, advanced: false, blockedReason: eligibility.reason, record: deepClone(record) };
            }

            record.branchId = eligibility.order.branchId;
            record.productId = eligibility.order.productId;

            const reasonKnown = record.reason !== null && KNOWN_REASON_CODES.includes(record.reason);
            if (!reasonKnown) {
                this.#transitionReturn(record, "RETURN_REQUIRES_REVIEW", { reviewReason: "AMBIGUOUS_REASON" });
                this.#diagnostics.returnsRequiringReview++;
            } else {
                this.#transitionReturn(record, "RETURN_REQUESTED", {});
            }
            this.#logAudit("RECONCILE_RETURN_ADVANCED", { returnId, nextStatus: record.status });
            return { success: true, advanced: true, record: deepClone(record) };
        }

        approveReturn(returnId, actor) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!["RETURN_REQUESTED", "RETURN_REQUIRES_REVIEW"].includes(record.status)) {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(actor, "canApproveReturn", "approveReturn");
            if (denied) return denied;
            this.#transitionReturn(record, "RETURN_APPROVED", {});
            this.#diagnostics.returnsApproved++;
            this.#logAudit("RETURN_APPROVED", { returnId });
            return { success: true, record: deepClone(record) };
        }

        rejectReturn(returnId, actor, { reason = null } = {}) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            const rejectable = ["RETURN_REQUESTED", "RETURN_REQUIRES_REVIEW", "RETURN_APPROVED", "RETURN_RECEIVED"];
            if (!rejectable.includes(record.status)) {
                return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            }
            const denied = this.#requireCapability(actor, "canRejectReturn", "rejectReturn");
            if (denied) return denied;
            this.#transitionReturn(record, "RETURN_REJECTED", { rejectReason: reason || "REJECTED_BY_OWNER" });
            this.#diagnostics.returnsRejected++;
            this.#logAudit("RETURN_REJECTED", { returnId, reason });
            return { success: true, record: deepClone(record) };
        }

        /**
         * receiveReturn — owner-only, explicit. No courier/tracking
         * engine exists in this repository, so this is never inferred
         * from any other state; only a real owner action reaches it.
         */
        receiveReturn(returnId, actor) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "RETURN_APPROVED") return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            if (!actor || actor.actorType !== "owner") {
                this.#diagnostics.missingCapabilityRefusals++;
                this.#logAudit("MISSING_CAPABILITY", { action: "receiveReturn", actorType: actor && actor.actorType });
                return { success: false, reason: "OWNER_ONLY" };
            }
            this.#transitionReturn(record, "RETURN_RECEIVED", {});
            this.#logAudit("RETURN_RECEIVED", { returnId });
            return { success: true, record: deepClone(record) };
        }

        /**
         * inspectReturn — owner-only disposition decision. SELLABLE
         * queues a real, deferred restoreStock() call.
         * DAMAGED_DISPOSITION is terminal for inventory purposes: no
         * ShopInventory call is ever made for it (see class header).
         */
        inspectReturn(returnId, actor, { disposition, notes = null } = {}) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "RETURN_RECEIVED") return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            if (!["SELLABLE", "DAMAGED"].includes(disposition)) return { success: false, reason: "DISPOSITION_INVALID" };
            const denied = this.#requireCapability(actor, "canInspectReturn", "inspectReturn");
            if (denied) return denied;

            const dispositionState = disposition === "SELLABLE" ? "SELLABLE_RESTORATION_PENDING" : "DAMAGED_DISPOSITION";
            this.#transitionReturn(record, "RETURN_INSPECTED", { disposition: dispositionState, inspectionNotes: notes || null });
            if (dispositionState === "DAMAGED_DISPOSITION") this.#diagnostics.damagedDispositions++;
            this.#logAudit("RETURN_INSPECTED", { returnId, disposition: dispositionState });
            return { success: true, record: deepClone(record) };
        }

        /**
         * restoreStock — the real, deferred recordStockMovement() call.
         * Only reachable when disposition is SELLABLE_RESTORATION_PENDING
         * (i.e. only after RETURN_INSPECTED with a SELLABLE decision,
         * which itself is only reachable after RETURN_APPROVED /
         * RETURN_RECEIVED — "real inventory restoration only for
         * approved SELLABLE returns").
         *   queueOffline:true lands the movement attempt as LOCAL_QUEUED
         *   on the return record; reconcileReturn() does not re-attempt
         *   it — use reconcileStockRestoration() explicitly instead, so
         *   an owner never has a real stock write silently retried by a
         *   generic reconcile pass.
         */
        restoreStock(returnId, actor, { clientRequestId = null, queueOffline = false } = {}) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };

            if (clientRequestId) {
                const idKey = `${record.customerId}:${clientRequestId}`;
                const existingReturnId = this.#restoreIdempotency.get(idKey);
                if (existingReturnId) {
                    const existing = this.#returnRecord(existingReturnId);
                    if (existing) {
                        this.#diagnostics.duplicateSubmissions++;
                        this.#logAudit("DUPLICATE_RESTORE_SUBMISSION", { customerId: record.customerId, clientRequestId, returnId: existingReturnId });
                        return { success: true, duplicate: true, record: deepClone(existing) };
                    }
                }
            }

            if (record.disposition !== "SELLABLE_RESTORATION_PENDING") {
                return { success: false, reason: "INVALID_TRANSITION", from: record.disposition };
            }
            const denied = this.#requireCapability(actor, "canRestoreReturnedStock", "restoreStock");
            if (denied) return denied;

            if (queueOffline) {
                this.#transitionReturn(record, record.status, { disposition: "SELLABLE_RESTORATION_PENDING", pendingOfflineRestoration: true });
                if (clientRequestId) this.#restoreIdempotency.set(`${record.customerId}:${clientRequestId}`, returnId);
                this.#logAudit("RESTORE_STOCK_QUEUED_OFFLINE", { returnId });
                return { success: true, duplicate: false, queued: true, record: deepClone(record) };
            }

            const inventory = this.#inventory();
            if (!inventory) return { success: false, reason: "CAPABILITY_UNAVAILABLE" };

            let movement;
            try {
                movement = inventory.recordStockMovement({
                    productId: record.productId,
                    branchId: record.branchId,
                    type: "returned_customer",
                    quantity: record.requestedReturnQuantity,
                    reference: returnId,
                });
            } catch (err) {
                this.#logAudit("STOCK_MOVEMENT_FAILED", { returnId, error: err && err.message });
                return { success: false, reason: "STOCK_MOVEMENT_FAILED", detail: err && err.message };
            }

            this.#transitionReturn(record, record.status, { disposition: "STOCK_RESTORED", stockMovement: movement, pendingOfflineRestoration: false });
            if (clientRequestId) this.#restoreIdempotency.set(`${record.customerId}:${clientRequestId}`, returnId);
            this.#diagnostics.stockRestored++;
            this.#logAudit("STOCK_RESTORED", { returnId, movementId: movement.id });
            return { success: true, duplicate: false, record: deepClone(record) };
        }

        /** reconcileStockRestoration — explicit real re-attempt of a queued restoration. Never auto-run by reconcileReturn(). */
        reconcileStockRestoration(returnId, actor) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!record.pendingOfflineRestoration) return { success: false, reason: "NOTHING_QUEUED" };
            return this.restoreStock(returnId, actor, {});
        }

        // =============================================================
        // REFUND TRACK — independent of the disposition branch.
        // =============================================================

        /**
         * #evaluateRefund — real, two-condition check, re-run at both
         * request time and execution time. Never cached across a status
         * transition as if it were still true.
         *
         * ASYNC NOTE: window.CozyOS.PaymentProvider.getCapabilityProfile()
         * and window.CozyOS.ShopPayments.refund() are genuinely async in
         * the real repository (confirmed by reading
         * cozy-payment-provider-engine.js / capability-engine.js /
         * provider-registry.js / shopOS-payments.js at implementation
         * time). This method — and every public method that calls it or
         * calls ShopPayments.refund() — is therefore async and really
         * awaits those calls, rather than fabricating synchronous
         * behavior P6/P7's own composed engines happen to have.
         * ShopPayments.getPayment() is the one real exception: it is
         * genuinely synchronous, confirmed the same way.
         */
        async #evaluateRefund(providerId, paymentReference) {
            const paymentProvider = this.#paymentProvider();
            if (!paymentProvider) return { ok: false, reason: "CAPABILITY_UNAVAILABLE", detail: "PaymentProvider not loaded." };
            const profile = await paymentProvider.getCapabilityProfile(providerId);
            if (!profile || profile.available !== true) return { ok: false, reason: "PROVIDER_UNKNOWN" };
            if (profile.profile.refunds !== true) return { ok: false, reason: "PROVIDER_CAPABILITY_FALSE" };

            if (!paymentReference) return { ok: false, reason: "NO_PAYMENT_CAPTURE_EVIDENCE" };
            const shopPayments = this.#shopPayments();
            if (!shopPayments) return { ok: false, reason: "CAPABILITY_UNAVAILABLE", detail: "ShopPayments not loaded." };
            const payment = shopPayments.getPayment(paymentReference);
            if (!payment || payment.status !== "COMPLETED" || payment.method !== providerId) {
                return { ok: false, reason: "NO_PAYMENT_CAPTURE_EVIDENCE" };
            }
            return { ok: true, payment };
        }

        /**
         * requestRefund — creates a refund record once the return has
         * passed approval. Independent of disposition (spec: "refund
         * eligibility depends on payment capability, not stock
         * disposition"). Records the resolved order price only as a
         * labeled, never-verified estimate — never amountPaid.
         */
        async requestRefund(returnId, actor, { clientRequestId = null, providerId, paymentReference = null, queueOffline = false } = {}) {
            const record = this.#returnRecord(returnId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (!["RETURN_APPROVED", "RETURN_RECEIVED", "RETURN_INSPECTED"].includes(record.status)) {
                return { success: false, reason: "RETURN_NOT_YET_APPROVED", from: record.status };
            }
            if (!providerId) return { success: false, reason: "PROVIDER_ID_REQUIRED" };

            if (clientRequestId) {
                const idKey = `${record.customerId}:${clientRequestId}`;
                const existingId = this.#refundIdempotency.get(idKey);
                if (existingId) {
                    const existing = this.#refundRecord(existingId);
                    if (existing) {
                        this.#diagnostics.duplicateSubmissions++;
                        this.#logAudit("DUPLICATE_REFUND_SUBMISSION", { customerId: record.customerId, clientRequestId, refundId: existingId });
                        return { success: true, duplicate: true, record: deepClone(existing) };
                    }
                }
            }

            const orderDecision = this.#orderDecision();
            const order = orderDecision ? orderDecision.getDecision(record.requestId) : null;
            const estimatedRefund = order && typeof order.resolvedUnitPrice === "number"
                ? { value: order.resolvedUnitPrice * record.requestedReturnQuantity, label: "ORDER_RESOLVED_PRICE_NOT_CONFIRMED_PAYMENT" }
                : { value: null, label: "ORDER_RESOLVED_PRICE_NOT_CONFIRMED_PAYMENT" };

            const refundId = this.#freshRefundId();
            const now = new Date().toISOString();
            const refundRecord = {
                refundId, returnId, requestId: record.requestId, customerId: record.customerId, clientRequestId,
                providerId, paymentReference: paymentReference || null,
                estimatedRefund, approved: false,
                status: "REFUND_PENDING",
                unavailableReason: null, failureReason: null, executedAmount: null, executedReference: null,
                createdAt: now, updatedAt: now, history: [],
            };

            if (queueOffline) {
                this.#transitionRefund(refundRecord, "LOCAL_QUEUED", {});
                this.#refunds.set(refundId, refundRecord);
                const list = this.#refundsByReturnId.get(returnId) || [];
                list.push(refundId);
                this.#refundsByReturnId.set(returnId, list);
                if (clientRequestId) this.#refundIdempotency.set(`${record.customerId}:${clientRequestId}`, refundId);
                this.#diagnostics.refundsRequested++;
                this.#logAudit("REFUND_QUEUED_OFFLINE", { refundId, returnId });
                return { success: true, duplicate: false, record: deepClone(refundRecord) };
            }

            const evaluation = await this.#evaluateRefund(providerId, paymentReference);
            if (!evaluation.ok) {
                this.#transitionRefund(refundRecord, "REFUND_UNAVAILABLE", { unavailableReason: evaluation.reason });
                this.#diagnostics.refundsUnavailable++;
            } else {
                this.#transitionRefund(refundRecord, "REFUND_PENDING", {});
            }

            this.#refunds.set(refundId, refundRecord);
            const list = this.#refundsByReturnId.get(returnId) || [];
            list.push(refundId);
            this.#refundsByReturnId.set(returnId, list);
            if (clientRequestId) this.#refundIdempotency.set(`${record.customerId}:${clientRequestId}`, refundId);
            this.#diagnostics.refundsRequested++;
            this.#logAudit("REFUND_REQUESTED", { refundId, returnId, status: refundRecord.status });

            return { success: true, duplicate: false, record: deepClone(refundRecord) };
        }

        getRefund(refundId) {
            const record = this.#refundRecord(refundId);
            return record ? deepClone(record) : null;
        }
        getRefundsByReturnId(returnId) {
            const ids = this.#refundsByReturnId.get(returnId) || [];
            return ids.map((id) => deepClone(this.#refundRecord(id))).filter(Boolean);
        }

        async reconcileRefund(refundId) {
            const record = this.#refundRecord(refundId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "LOCAL_QUEUED") return { success: false, reason: "INVALID_TRANSITION", from: record.status };

            const evaluation = await this.#evaluateRefund(record.providerId, record.paymentReference);
            if (!evaluation.ok) {
                this.#transitionRefund(record, "REFUND_UNAVAILABLE", { unavailableReason: evaluation.reason });
                this.#diagnostics.refundsUnavailable++;
                this.#logAudit("RECONCILE_REFUND_UNAVAILABLE", { refundId, reason: evaluation.reason });
                return { success: true, advanced: true, record: deepClone(record) };
            }
            this.#transitionRefund(record, "REFUND_PENDING", {});
            this.#logAudit("RECONCILE_REFUND_ADVANCED", { refundId });
            return { success: true, advanced: true, record: deepClone(record) };
        }

        /** approveRefund — owner-only. Marks the record ready for executeRefund(); does not itself attempt payment. */
        approveRefund(refundId, actor) {
            const record = this.#refundRecord(refundId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "REFUND_PENDING") return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            const denied = this.#requireCapability(actor, "canApproveRefund", "approveRefund");
            if (denied) return denied;
            record.approved = true;
            record.updatedAt = new Date().toISOString();
            this.#logAudit("REFUND_APPROVED", { refundId });
            return { success: true, record: deepClone(record) };
        }

        /**
         * executeRefund — the real, two-condition-gated attempt. Both
         * conditions are re-verified here, live, never trusted from an
         * earlier check. REFUND_EXECUTED requires a genuine successful
         * ShopPayments.refund() result; REFUND_FAILED means a real
         * attempt was made and the real call failed — distinct from
         * REFUND_UNAVAILABLE, where no attempt is ever made.
         */
        async executeRefund(refundId, actor) {
            const record = this.#refundRecord(refundId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            if (record.status !== "REFUND_PENDING") return { success: false, reason: "INVALID_TRANSITION", from: record.status };
            if (!record.approved) return { success: false, reason: "REFUND_NOT_APPROVED" };
            const denied = this.#requireCapability(actor, "canExecuteRefund", "executeRefund");
            if (denied) return denied;

            const evaluation = await this.#evaluateRefund(record.providerId, record.paymentReference);
            if (!evaluation.ok) {
                this.#transitionRefund(record, "REFUND_UNAVAILABLE", { unavailableReason: evaluation.reason });
                this.#diagnostics.refundsUnavailable++;
                this.#logAudit("REFUND_UNAVAILABLE_AT_EXECUTION", { refundId, reason: evaluation.reason });
                return { success: true, record: deepClone(record) };
            }

            const shopPayments = this.#shopPayments();
            if (!shopPayments) {
                this.#transitionRefund(record, "REFUND_UNAVAILABLE", { unavailableReason: "CAPABILITY_UNAVAILABLE" });
                this.#diagnostics.refundsUnavailable++;
                return { success: true, record: deepClone(record) };
            }

            let result;
            try {
                result = await shopPayments.refund(record.paymentReference, { amount: evaluation.payment.amount, reason: `Wholesale return ${record.returnId}` });
            } catch (err) {
                this.#transitionRefund(record, "REFUND_FAILED", { failureReason: err && err.message });
                this.#diagnostics.refundsFailed++;
                this.#logAudit("REFUND_FAILED", { refundId, error: err && err.message });
                return { success: true, record: deepClone(record) };
            }

            if (result && result.status === "COMPLETED") {
                this.#transitionRefund(record, "REFUND_EXECUTED", { executedAmount: result.amount, executedReference: result.reference || result.id || null });
                this.#diagnostics.refundsExecuted++;
                this.#logAudit("REFUND_EXECUTED", { refundId, executedAmount: result.amount });
            } else {
                this.#transitionRefund(record, "REFUND_FAILED", { failureReason: (result && result.failureReason) || "Refund did not complete." });
                this.#diagnostics.refundsFailed++;
                this.#logAudit("REFUND_FAILED", { refundId, reason: result && result.failureReason });
            }
            return { success: true, record: deepClone(record) };
        }

        // =============================================================
        // Customer-safe projections — only the declared key sets are
        // ever exposed; no audit/diagnostic/actor data leaks.
        // =============================================================
        getCustomerReturnView(returnId) {
            const record = this.#returnRecord(returnId);
            if (!record) return null;
            const refunds = this.getRefundsByReturnId(returnId);
            const latestRefund = refunds.length ? refunds[refunds.length - 1] : null;
            const view = {
                returnId: record.returnId,
                requestId: record.requestId,
                status: record.status,
                disposition: record.disposition,
                requestedReturnQuantity: record.requestedReturnQuantity,
                reason: record.reason,
                estimatedRefund: latestRefund ? latestRefund.estimatedRefund : null,
            };
            for (const key of Object.keys(view)) {
                if (!RETURN_CUSTOMER_VIEW_KEYS.includes(key)) delete view[key];
            }
            return deepClone(view);
        }

        getCustomerRefundView(refundId) {
            const record = this.#refundRecord(refundId);
            if (!record) return null;
            const view = {
                refundId: record.refundId,
                returnId: record.returnId,
                status: record.status,
                providerId: record.providerId,
                estimatedRefund: record.estimatedRefund,
            };
            for (const key of Object.keys(view)) {
                if (!REFUND_CUSTOMER_VIEW_KEYS.includes(key)) delete view[key];
            }
            return deepClone(view);
        }
    }

    const engineInstance = new WholesaleReturnsEngine();

    if (window.CozyOS.WholesaleReturns && typeof window.CozyOS.WholesaleReturns.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleReturns.getVersion();
        if (existingVersion === MODULE_VERSION) {
            return; // Already loaded at the same version — idempotent no-op.
        }
    }
    window.CozyOS.WholesaleReturns = engineInstance;
    window.CozyOS.WholesaleReturns.CAPABILITY_KEYS = CAPABILITY_KEYS;
    window.CozyOS.WholesaleReturns.KNOWN_REASON_CODES = KNOWN_REASON_CODES;

    (function initRegistration() {
        const manifest = { id: "wholesale-returns", name: "WholesaleOS Returns / Refund Record Lifecycle Engine", version: MODULE_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Returns / Refund Record Lifecycle Engine")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-returns"] = { version: MODULE_VERSION };
    })();
})();
