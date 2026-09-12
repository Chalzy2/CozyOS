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
 *
 * ENTITLEMENT INTEGRATION (additive, this pass only)
 *   OWNERSHIP AUDIT: this file (window.CozyOS.MpesaReporting) is the
 *   confirmed, canonical, actually-loaded live owner of MpesaOS
 *   reports — referenced by <script src="core/plugins/mpesaOS-reporting.js">
 *   in core/shell/cozy-shell.html, core/cozy-shell.html, and
 *   admin-workspace.html, and registered in
 *   core/platform/discovery-manifest.json. No second reporting engine
 *   exists or is created here; every guard below wraps the existing
 *   report-generation methods in place.
 *
 *   No dedicated "exports" mechanism exists anywhere for MpesaOS
 *   reports today (confirmed by repository search — core/output/
 *   output-export.js is a generic ZIP utility used by Developer Hub /
 *   Certification and has no MpesaOS wiring). Every report method
 *   below is the only real source of exportable report data, so
 *   gating report generation at this single boundary transitively
 *   gates exports too — there is no path to export data that does not
 *   first call one of these methods. A separate "mpesa.exports"
 *   feature is deliberately NOT invented (Rule 8 / Zero Duplication —
 *   would fragment one real capability into two identifiers with no
 *   distinct behavior behind the second one).
 *
 *   Feature IDs reuse the exact convention already established in
 *   core/modules/entitlement/tests/entitlement-engine.test.js and
 *   core/plugins/mpesaOS.js's own receipts integration ("mpesa",
 *   "mpesa.reports") — reused verbatim, not invented fresh.
 *   APPLICATION-level ("mpesa") is checked before the FUNCTION-level
 *   ("mpesa.reports") state, the same cascade mpesaOS.js's receipt
 *   guard uses, so an ADMIN_DISABLED/PLAN_RESTRICTED application makes
 *   reports unavailable before "mpesa.reports"'s own state is even
 *   consulted.
 *
 *   Every report method here is read-only and has no bearing on
 *   sales, transactions, calculations, or bookkeeping — those remain
 *   entirely untouched by this pass. Fails closed (returns
 *   {available:false, reason, state}, never throws) when reports are
 *   not entitled for any reason — ADMIN_DISABLED, MUTED,
 *   PLAN_RESTRICTED, a missing organizationId, or Entitlement being
 *   completely unavailable/unwired — matching the same honest,
 *   fail-closed convention mpesaOS.js's receipt guard already uses.
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

    // ── Entitlement integration (additive, this pass only) ──────────────────
    const MPESA_FEATURE_APP = "mpesa";
    const MPESA_FEATURE_REPORTS = "mpesa.reports";

    function getEntitlementEngine() {
        return (window.CozyOS && window.CozyOS.Entitlement) || null;
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
         * #checkReportsEntitlement(organizationId)
         *   The real service-boundary gate for every report method below
         *   (and, transitively, for exports — see file header). Never
         *   throws; every report method reacts to the returned
         *   {allowed, state, reason} the same honest way the "not
         *   connected" branches already do. Fails closed — an absent
         *   EntitlementEngine or a missing organizationId is a denial,
         *   never a silent bypass.
         */
        #checkReportsEntitlement(organizationId) {
            const entitlement = getEntitlementEngine();
            if (!entitlement || typeof entitlement.guard !== "function") {
                return { allowed: false, state: "UNAVAILABLE", reason: "Entitlement engine is not available — reports fail closed." };
            }
            if (typeof organizationId !== "string" || !organizationId.trim()) {
                return { allowed: false, state: "UNAVAILABLE", reason: "organizationId is required to evaluate report entitlement." };
            }
            try {
                entitlement.guard(organizationId, MPESA_FEATURE_APP);
                entitlement.guard(organizationId, MPESA_FEATURE_REPORTS);
                return { allowed: true };
            } catch (err) {
                const state = (err && err.decision && err.decision.state) || "DENIED";
                return { allowed: false, state, reason: `Reports are not available for this organization (${state}).` };
            }
        }

        /**
         * getDailyTransactionTotals(companyId, branchId, date)
         *   Real, reused from the engine's listTransactionSummaries().
         *   Honestly reports {available:false} if the engine isn't
         *   connected — never fabricates zero totals as if they were
         *   real data.
         */
        getDailyTransactionTotals(companyId, branchId, date, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `daily totals blocked (${gate.state}): ${companyId}/${branchId}/${date}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
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
        getFloatMovementReport(companyId, branchId, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `float movement report blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
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
        getCommissionReport(companyId, branchId, rawOptions = {}, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `commission report blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
            const { date = null } = sanitizeObject(rawOptions);
            const engine = window.CozyEnterpriseBusinessEngine;
            if (!engine || typeof engine.listTransactionSummaries !== "function") return { available: false, reason: "MpesaOS engine is not connected." };
            const summaries = engine.listTransactionSummaries({ companyId, branchId, date });
            const totalCommission = summaries.reduce((sum, t) => sum + (t.commission || 0), 0);
            this.#diagnostics.reportsGenerated++;
            return { available: true, companyId, branchId, date, totalCommission, transactionCount: summaries.length };
        }

        /** getTillPerformanceReport(companyId, branchId) — real, reused from MpesaTill. Per-till payment count/total and current balance. */
        getTillPerformanceReport(companyId, branchId, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `till performance report blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
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
        getPaybillCollectionsReport(companyId, branchId, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `paybill collections report blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
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
        getAgentActivityReport(companyId, branchId, rawOptions = {}, organizationId) {
            const gate = this.#checkReportsEntitlement(organizationId);
            if (!gate.allowed) {
                this.#logAudit("REPORT_BLOCKED", `agent activity report blocked (${gate.state}): ${companyId}/${branchId}`);
                return { available: false, reason: gate.reason, state: gate.state };
            }
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
            window.CozyOS.PluginManager.register(
                manifest,
                // Real bug fix (M387.5 Finding 6): register() requires a callable
                // (query, kernelContext) intent handler, not the engine instance itself.
                window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "MpesaOS Reporting")
            );
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
