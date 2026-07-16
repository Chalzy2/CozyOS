/**
 * ShopOS — shop-reconciliation
 * File Reference: core/plugins/shopOS-reconciliation.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Cash, M-Pesa, Bank, Inventory, Supplier, Customer credit
 *   reconciliation. Workflow: Variance -> Investigation -> Resolution.
 *
 * READS, NEVER EDITS
 *   Reads real committed data from shop-bookkeeping, shop-payments,
 *   shop-inventory, shop-purchasing. Never modifies any of it — a
 *   discrepancy produces a new adjustment record referencing the
 *   original transaction, never a rewrite of history.
 *
 * HONEST SCOPE NOTE
 *   Customer credit reconciliation requires a real Customer coordinator
 *   with a credit-balance API. That integration is not verified here —
 *   reconcileCustomerCredit() honestly reports unavailable when
 *   window.CozyOS.Customer doesn't expose what's needed, rather than
 *   guessing at a shape that hasn't been confirmed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_RECONCILIATION_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopReconciliationEngine {
        #records = new Map(); // reconciliationId -> ReconciliationRecord (mutable only via recordInvestigation/recordResolution)
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { reconciliationsRun: 0, variancesFound: 0, investigationsRecorded: 0, resolutionsRecorded: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.6 };

        getVersion() { return SHOP_RECONCILIATION_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #deepFreeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(val => this.#deepFreeze(val)); Object.freeze(v); } return v; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-reconciliation] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-reconciliation] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-reconciliation] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #createRecord(type, expected, actual) {
            const variance = expected - actual;
            const record = {
                id: this.#generateId("recon"), type, expected, actual, variance,
                investigationNote: null, resolution: null, adjustmentReference: null,
                status: variance === 0 ? "MATCHED" : "VARIANCE_FOUND",
                timestamp: new Date().toISOString()
            };
            this.#records.set(record.id, record);
            this.#diagnostics.reconciliationsRun++;
            if (variance !== 0) {
                this.#diagnostics.variancesFound++;
                this.#logAudit("VARIANCE_FOUND", `${record.id} (${type}): expected ${expected}, actual ${actual}, variance ${variance}`);
                this.emit("reconciliation:variance_found", { id: record.id, type, variance });
            } else {
                this.#logAudit("RECONCILED_CLEAN", `${record.id} (${type}): matched at ${expected}`);
            }
            return this.#deepClone(record);
        }

        /** reconcileCash — real, reads shop-bookkeeping's actual cash book for the day; never invents an "expected" figure. */
        reconcileCash(branchId, { actualCash, date } = {}) {
            const book = window.CozyOS.ShopBookkeeping;
            if (!book) return { available: false, reason: "shop-bookkeeping is not connected — cannot determine expected cash." };
            const cashBook = book.getCashBook(branchId, date || new Date().toISOString().slice(0, 10));
            const expected = cashBook.cashReceived - cashBook.cashPaidOut;
            return { available: true, ...this.#createRecord("cash", expected, Number(actualCash)) };
        }

        /**
         * reconcilePayments(branchId, provider, {systemRecordsTotal, providerRecordsTotal})
         *   Honest design note: shop-payments does not currently expose a
         *   "total completed amount by method" query — only per-sale
         *   lookups (listPaymentsForSale()). Rather than reconstruct that
         *   total by parsing shop-payments' audit log text (fragile —
         *   would silently break if that log's message format ever
         *   changes, unacceptable for a financial reconciliation), this
         *   method requires the real system total as an explicit input.
         *   The caller computes it from shop-payments' real, structured
         *   data (e.g. iterating listPaymentsForSale() across the day's
         *   known sales) — never a duplicated aggregation living here.
         */
        reconcilePayments(branchId, provider, { systemRecordsTotal, providerRecordsTotal } = {}) {
            if (!window.CozyOS.ShopPayments) return { available: false, reason: "shop-payments is not connected." };
            if (typeof systemRecordsTotal !== "number") return { available: false, reason: "systemRecordsTotal must be supplied by the caller from shop-payments' real records — this coordinator does not aggregate payment totals itself." };
            return { available: true, ...this.#createRecord(`payment:${provider}`, systemRecordsTotal, Number(providerRecordsTotal)) };
        }

        /** reconcileStock — real, reads shop-inventory's actual current stock; compares against a real physical count. */
        reconcileStock(productId, branchId, { physicalCount } = {}) {
            const inventory = window.CozyOS.ShopInventory;
            if (!inventory) return { available: false, reason: "shop-inventory is not connected — cannot determine expected stock." };
            const expected = inventory.getCurrentStock(productId, branchId);
            return { available: true, ...this.#createRecord("inventory", expected, Number(physicalCount)) };
        }

        /** reconcileSupplier — real, reads shop-purchasing's actual outstanding balance. */
        reconcileSupplier(supplierId, { actualOutstanding } = {}) {
            const purchasing = window.CozyOS.ShopPurchasing;
            if (!purchasing) return { available: false, reason: "shop-purchasing is not connected — cannot determine expected supplier balance." };
            const expected = purchasing.getSupplierBalance(supplierId);
            return { available: true, ...this.#createRecord("supplier", expected, Number(actualOutstanding)) };
        }

        /** reconcileCustomerCredit — honestly unavailable unless a real, verified Customer credit API is present. Never guesses at a shape that hasn't been confirmed. */
        reconcileCustomerCredit(customerId, { actualCredit } = {}) {
            const customer = window.CozyOS.Customer;
            if (!customer || typeof customer.getCreditBalance !== "function") {
                return { available: false, reason: "Customer coordinator does not expose a verified getCreditBalance() method — cannot determine expected credit balance." };
            }
            const expected = customer.getCreditBalance(customerId);
            return { available: true, ...this.#createRecord("customer_credit", expected, Number(actualCredit)) };
        }

        /**
         * recordInvestigation(reconciliationId, notes)
         *   Real, append-safe update — only investigationNote and status
         *   change; expected/actual/variance are never touched once
         *   recorded.
         */
        recordInvestigation(reconciliationId, notes) {
            const record = this.#records.get(reconciliationId);
            if (!record) throw new Error(`[shop-reconciliation] recordInvestigation(): unknown reconciliationId "${reconciliationId}".`);
            record.investigationNote = this.#escapeHtml(notes);
            record.status = "UNDER_INVESTIGATION";
            this.#diagnostics.investigationsRecorded++;
            this.#logAudit("INVESTIGATION_RECORDED", `${reconciliationId}: ${notes}`);
            this.emit("reconciliation:investigation_recorded", { id: reconciliationId });
            return this.#deepClone(record);
        }

        /**
         * recordResolution(reconciliationId, {resolution, adjustmentTransactionId})
         *   Real closure — records what happened and which real
         *   adjustment transaction (in the owning coordinator — e.g.
         *   shop-inventory.adjustStock()) corrected the discrepancy. This
         *   coordinator does not create that adjustment itself; it only
         *   records the reference, keeping ownership of the correction
         *   with the coordinator that actually owns the data.
         */
        recordResolution(reconciliationId, { resolution, adjustmentTransactionId = null } = {}) {
            const record = this.#records.get(reconciliationId);
            if (!record) throw new Error(`[shop-reconciliation] recordResolution(): unknown reconciliationId "${reconciliationId}".`);
            record.resolution = this.#escapeHtml(resolution);
            record.adjustmentReference = adjustmentTransactionId;
            record.status = "RESOLVED";
            this.#diagnostics.resolutionsRecorded++;
            this.#logAudit("RESOLUTION_RECORDED", `${reconciliationId}: ${resolution}${adjustmentTransactionId ? ` (ref: ${adjustmentTransactionId})` : ""}`);
            this.emit("reconciliation:resolved", { id: reconciliationId, adjustmentTransactionId });
            return this.#deepClone(record);
        }

        getRecord(reconciliationId) { const r = this.#records.get(reconciliationId); return r ? this.#deepClone(r) : null; }
        listRecords(predicate) { const list = Array.from(this.#records.values()).map(r => this.#deepClone(r)); return predicate ? list.filter(predicate) : list; }
        listUnresolvedVariances() { return this.listRecords(r => r.status === "VARIANCE_FOUND" || r.status === "UNDER_INVESTIGATION"); }

        exportSnapshot() { return this.#deepClone({ version: SHOP_RECONCILIATION_VERSION, exportedAt: new Date().toISOString(), records: Array.from(this.#records.entries()) }); }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.records)) throw new TypeError("[shop-reconciliation] importSnapshot(): snapshot.records array is required.");
            if (mergeStrategy === "replace") this.#records.clear();
            for (const [id, record] of snapshot.records) this.#records.set(id, this.#deepClone(record));
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.records.length} record(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.records.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_RECONCILIATION_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_RECONCILIATION_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_RECONCILIATION_VERSION, ...this.#diagnostics, totalRecords: this.#records.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopReconciliation && typeof window.CozyOS.ShopReconciliation.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopReconciliation.getVersion();
        if (existingVersion !== SHOP_RECONCILIATION_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-reconciliation existing v${existingVersion} conflicts with load target v${SHOP_RECONCILIATION_VERSION}.`);
        return;
    }

    const engineInstance = new ShopReconciliationEngine();
    window.CozyOS.ShopReconciliation = engineInstance;

    const manifest = {
        id: "shop-reconciliation",
        name: "ShopOS Reconciliation",
        version: SHOP_RECONCILIATION_VERSION,
        description: "Cash/payment/stock/supplier/customer-credit variance detection. Reads real committed data, never edits it.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopBookkeeping", "window.CozyOS.ShopPayments", "window.CozyOS.ShopInventory", "window.CozyOS.ShopPurchasing", "window.CozyOS.Customer"] }
    };

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, engineInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        }
    }

    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }
})();
