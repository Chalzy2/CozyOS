/**
 * CozyOS — MpesaOS Reporting Coordinator
 * File Reference: core/plugins/mpesaOS-reporting.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real business reports for MpesaOS: daily transaction totals, float
 *   movement, commission earned, till performance, paybill collections,
 *   agent activity. Every figure here is computed on demand from real
 *   data already owned by other coordinators — this file stores nothing
 *   of its own and duplicates no data.
 *
 * REUSE, NOT DUPLICATION
 *   - window.CozyEnterpriseBusinessEngine.listTransactionSummaries()
 *     (mpesaOS.js) — the real transaction index added specifically to
 *     make this reporting possible.
 *   - window.CozyOS.MpesaFloat.getFloatHistory()
 *   - window.CozyOS.MpesaTill.listTills()/getTillHistory()
 *   - window.CozyOS.MpesaPaybill.listPaybills()/getPaybillHistory()
 *   No report method here recomputes or re-stores what those
 *   coordinators already track.
 *
 * NOTE ON RULE 15 (PLATFORM EVOLUTION RULE)
 *   ShopOS already has its own real reporting coordinator
 *   (shopOS-reporting.js) with different metrics (sales/profit/
 *   inventory). This is now the second application with a genuine,
 *   independent reporting need — the exact trigger Rule 15 describes
 *   for considering whether reporting deserves a shared platform
 *   framework. That's flagged here, not decided here; building a shared
 *   abstraction without an explicit decision would be exactly the
 *   speculative over-engineering Rule 15 exists to prevent.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const REPORTING_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class MpesaReportingCoordinator {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { reportsGenerated: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return REPORTING_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[MpesaReporting] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[MpesaReporting] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[MpesaReporting] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * getDailyTransactionTotals(companyId, branchId, date)
         *   Real, reused from the engine's listTransactionSummaries().
         *   Honestly reports {available:false} if the engine isn't
         *   connected — never fabricates zero totals as if they were
         *   real data.
         */
        getDailyTransactionTotals(companyId, branchId, date) {
            const engine = window.CozyEnterpriseBusinessEngine;
            if (!engine || typeof engine.listTransactionSummaries !== "function") return { available: false, reason: "MpesaOS engine is not connected." };
            const summaries = engine.listTransactionSummaries({ companyId, branchId, date });
            const totals = { deposits: { count: 0, amount: 0 }, withdrawals: { count: 0, amount: 0 } };
            for (const t of summaries) {
                const bucket = t.type === "Deposit" ? totals.deposits : totals.withdrawals;
                bucket.count++; bucket.amount += t.amount;
            }
            this.#diagnostics.reportsGenerated++;
            this.#logAudit("REPORT_GENERATED", `daily totals: ${companyId}/${branchId}/${date}`);
            return { available: true, date, companyId, branchId, ...totals, transactionCount: summaries.length };
        }

        /** getFloatMovementReport(companyId, branchId) — real, reused from MpesaFloat.getFloatHistory(). */
        getFloatMovementReport(companyId, branchId) {
            const float = window.CozyOS.MpesaFloat;
            if (!float || typeof float.getFloatHistory !== "function") return { available: false, reason: "MpesaFloat coordinator is not connected." };
            const history = float.getFloatHistory(companyId, branchId);
            const byType = {};
            for (const m of history) { byType[m.type] = (byType[m.type] || 0) + m.amount; }
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, currentBalance: float.getCurrentFloat(companyId, branchId), movementCount: history.length, byType, movements: history };
        }

        /**
         * getCommissionReport(companyId, branchId, { date })
         *   Real, reused from the engine's transaction index — commission
         *   is a field already recorded on each real transaction, not
         *   recomputed here.
         */
        getCommissionReport(companyId, branchId, rawOptions = {}) {
            const { date = null } = sanitizeObject(rawOptions);
            const engine = window.CozyEnterpriseBusinessEngine;
            if (!engine || typeof engine.listTransactionSummaries !== "function") return { available: false, reason: "MpesaOS engine is not connected." };
            const summaries = engine.listTransactionSummaries({ companyId, branchId, date });
            const totalCommission = summaries.reduce((sum, t) => sum + (t.commission || 0), 0);
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, date, totalCommission, transactionCount: summaries.length };
        }

        /** getTillPerformanceReport(companyId, branchId) — real, reused from MpesaTill. Per-till payment count/total and current balance. */
        getTillPerformanceReport(companyId, branchId) {
            const till = window.CozyOS.MpesaTill;
            if (!till || typeof till.listTills !== "function") return { available: false, reason: "MpesaTill coordinator is not connected." };
            const tills = till.listTills(companyId, branchId);
            const report = tills.map(t => {
                const history = till.getTillHistory(t.tillNumber);
                const payments = history.filter(h => h.type === "payment");
                return {
                    tillNumber: t.tillNumber, merchantName: t.merchantName, status: t.status,
                    currentBalance: till.getTillBalance(t.tillNumber),
                    paymentCount: payments.length, totalCollected: payments.reduce((sum, p) => sum + p.amount, 0)
                };
            });
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, tills: report };
        }

        /** getPaybillCollectionsReport(companyId, branchId) — real, reused from MpesaPaybill. Per-paybill collection count/total and current balance. */
        getPaybillCollectionsReport(companyId, branchId) {
            const paybill = window.CozyOS.MpesaPaybill;
            if (!paybill || typeof paybill.listPaybills !== "function") return { available: false, reason: "MpesaPaybill coordinator is not connected." };
            const paybills = paybill.listPaybills(companyId, branchId);
            const report = paybills.map(p => {
                const history = paybill.getPaybillHistory(p.paybillNumber);
                const collections = history.filter(h => h.type === "collection");
                return {
                    paybillNumber: p.paybillNumber, businessName: p.businessName, status: p.status,
                    currentBalance: paybill.getPaybillBalance(p.paybillNumber),
                    collectionCount: collections.length, totalCollected: collections.reduce((sum, c) => sum + c.amount, 0)
                };
            });
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, paybills: report };
        }

        /**
         * getAgentActivityReport(companyId, branchId, { date })
         *   Real, reused from the engine's transaction index, grouped by
         *   the real agent field recorded on each transaction.
         */
        getAgentActivityReport(companyId, branchId, rawOptions = {}) {
            const { date = null } = sanitizeObject(rawOptions);
            const engine = window.CozyEnterpriseBusinessEngine;
            if (!engine || typeof engine.listTransactionSummaries !== "function") return { available: false, reason: "MpesaOS engine is not connected." };
            const summaries = engine.listTransactionSummaries({ companyId, branchId, date });
            const byAgent = new Map();
            for (const t of summaries) {
                const agent = t.agent || "Unknown";
                if (!byAgent.has(agent)) byAgent.set(agent, { agent, transactionCount: 0, totalAmount: 0, totalCommission: 0 });
                const entry = byAgent.get(agent);
                entry.transactionCount++; entry.totalAmount += t.amount; entry.totalCommission += (t.commission || 0);
            }
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, date, agents: Array.from(byAgent.values()) };
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(REPORTING_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: REPORTING_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.MpesaReporting && typeof window.CozyOS.MpesaReporting.getVersion === "function") {
        const existingVersion = window.CozyOS.MpesaReporting.getVersion();
        if (existingVersion !== REPORTING_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: MpesaReporting existing v${existingVersion} conflicts with load target v${REPORTING_VERSION}.`);
        return;
    }

    const engineInstance = new MpesaReportingCoordinator();
    window.CozyOS.MpesaReporting = engineInstance;

    const manifest = {
        id: "mpesa-reporting",
        name: "MpesaOS Reporting",
        version: REPORTING_VERSION,
        description: "Real business reports computed on demand from the engine, Float, Till, and Paybill coordinators. Stores nothing of its own.",
        dependencies: { required: [], optional: ["window.CozyEnterpriseBusinessEngine", "window.CozyOS.MpesaFloat", "window.CozyOS.MpesaTill", "window.CozyOS.MpesaPaybill"] }
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
