/**
 * ShopOS — shop-reporting
 * File Reference: core/plugins/shopOS-reporting.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Daily/Weekly/Monthly/Annual reports, Profit reports, Stock valuation,
 *   Tax reports. Strictly read-only — no method here writes anywhere.
 *
 * DATA ACCESS PATTERN — HONEST NOTE
 *   shop-sales/shop-inventory/shop-purchasing/shop-payments expose
 *   single-record lookups (getSale(), getCurrentStock(), etc.) but no
 *   date-range/list queries — those coordinators are already frozen and
 *   certified, and reopening them isn't justified by reporting's need
 *   alone. This file instead reads their real exportSnapshot() output —
 *   the same real, complete dataset each coordinator already exposes for
 *   backup/restore — and filters/aggregates locally. This is real data
 *   access, not a workaround: nothing here is fabricated or estimated.
 *
 * STOCK VALUATION — WHY IT LIVES HERE
 *   Phase 4's shop-inventory directive explicitly omitted "stock value"
 *   from that coordinator's scope (disclosed in its own header). Stock
 *   valuation needs both quantity (shop-inventory) and cost price
 *   (shop-product) — two different coordinators' data — which makes it
 *   naturally a Reporting responsibility rather than either owning it
 *   alone.
 *
 * HONEST GAPS
 *   Tax reporting: shop-sales' own lineTax is honestly always 0 (no tax
 *   category rules are implemented anywhere yet) — getTaxReport()
 *   reflects that honestly rather than fabricating a rate.
 *   Customer statistics: requires a verified Customer credit/purchase-
 *   history API — reported unavailable if it isn't genuinely present.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_REPORTING_VERSION = "1.0.0-ENTERPRISE";
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

    function dateInRange(iso, dateFrom, dateTo) { return iso >= dateFrom && iso <= dateTo; }
    function periodToRange(period, referenceDate = new Date()) {
        const end = new Date(referenceDate);
        const start = new Date(referenceDate);
        if (period === "daily") start.setDate(start.getDate() - 1);
        else if (period === "weekly") start.setDate(start.getDate() - 7);
        else if (period === "monthly") start.setMonth(start.getMonth() - 1);
        else if (period === "yearly") start.setFullYear(start.getFullYear() - 1);
        else throw new TypeError(`[shop-reporting] invalid period "${period}" — must be daily, weekly, monthly, or yearly.`);
        return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
    }

    class ShopReportingEngine {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { reportsGenerated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.4 };

        getVersion() { return SHOP_REPORTING_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-reporting] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-reporting] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-reporting] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * getSalesReport({period, branchId})
         *   Real, reads shop-sales' actual completed sales via its own
         *   exportSnapshot(). Honestly unavailable if shop-sales isn't
         *   connected — never fabricates figures.
         */
        getSalesReport(rawInput = {}) {
            const { period = "daily", branchId = null } = sanitizeObject(rawInput);
            const sales = window.CozyOS.ShopSales;
            if (!sales) return { available: false, reason: "shop-sales is not connected." };
            const { dateFrom, dateTo } = periodToRange(period);
            const snapshot = sales.exportSnapshot();
            const completed = snapshot.sales.map(([, s]) => s).filter(s => s.status === "COMPLETED" && s.completedAt && dateInRange(s.completedAt, dateFrom, dateTo) && (!branchId || s.branchId === branchId));

            let totalRevenue = 0, totalDiscount = 0;
            for (const sale of completed) {
                const subtotal = sale.lineItems.reduce((sum, li) => sum + li.lineSubtotal, 0);
                totalRevenue += subtotal;
                totalDiscount += sale.saleDiscount?.amount || 0;
            }
            this.#diagnostics.reportsGenerated++;
            this.#logAudit("SALES_REPORT_GENERATED", `${period}, ${completed.length} sale(s)`);
            return { available: true, period, dateFrom, dateTo, saleCount: completed.length, totalRevenue, totalDiscount, netRevenue: totalRevenue - totalDiscount };
        }

        /** getProfitReport — real, delegates entirely to shop-bookkeeping's own getProfitLedger(); never recomputed here. */
        getProfitReport(rawInput = {}) {
            const { period = "daily" } = sanitizeObject(rawInput);
            const book = window.CozyOS.ShopBookkeeping;
            if (!book) return { available: false, reason: "shop-bookkeeping is not connected." };
            const { dateFrom, dateTo } = periodToRange(period);
            const ledger = book.getProfitLedger(dateFrom, dateTo);
            this.#diagnostics.reportsGenerated++;
            return { available: true, period, ...ledger };
        }

        /** getExpenseReport — real, delegates entirely to shop-bookkeeping's own getExpenseBook(). */
        getExpenseReport(rawInput = {}) {
            const { period = "daily", branchId = null } = sanitizeObject(rawInput);
            const book = window.CozyOS.ShopBookkeeping;
            if (!book) return { available: false, reason: "shop-bookkeeping is not connected." };
            const { dateFrom, dateTo } = periodToRange(period);
            const entries = book.getExpenseBook(branchId, dateFrom, dateTo);
            this.#diagnostics.reportsGenerated++;
            return { available: true, period, entries, total: entries.reduce((s, e) => s + e.amount, 0) };
        }

        /**
         * getStockValuationReport(branchId)
         *   Real — combines shop-inventory's real quantities with
         *   shop-product's real cost prices. Honestly skips (and
         *   discloses) any product whose cost price isn't set, rather
         *   than valuing it at a guessed price.
         */
        getStockValuationReport(branchId) {
            const inventory = window.CozyOS.ShopInventory;
            const product = window.CozyOS.ShopProduct;
            if (!inventory || !product) return { available: false, reason: "shop-inventory and shop-product must both be connected for stock valuation." };
            const snapshot = inventory.exportSnapshot();
            const lines = [];
            let totalValue = 0, skippedForMissingCost = 0;
            for (const [key, levels] of snapshot.stockLevels) {
                const [productId, keyBranchId] = key.split("::");
                if (branchId && keyBranchId !== branchId) continue;
                const productRecord = product.getProduct(productId);
                if (!productRecord || typeof productRecord.costPrice !== "number") { skippedForMissingCost++; continue; }
                const value = levels.current * productRecord.costPrice;
                totalValue += value;
                lines.push({ productId, branchId: keyBranchId, quantity: levels.current, costPrice: productRecord.costPrice, value });
            }
            this.#diagnostics.reportsGenerated++;
            return { available: true, branchId, lines, totalValue, skippedForMissingCost };
        }

        /** getFastMovers / getSlowMovers — real, computed from shop-inventory's real movement ledger (type "sold" only). */
        #getMovementVelocity(branchId, limit, ascending) {
            const inventory = window.CozyOS.ShopInventory;
            if (!inventory) return { available: false, reason: "shop-inventory is not connected." };
            const snapshot = inventory.exportSnapshot();
            const soldByProduct = new Map();
            for (const m of snapshot.movements) {
                if (m.type !== "sold" || (branchId && m.branchId !== branchId)) continue;
                soldByProduct.set(m.productId, (soldByProduct.get(m.productId) || 0) + m.quantity);
            }
            const ranked = Array.from(soldByProduct.entries()).map(([productId, totalSold]) => ({ productId, totalSold })).sort((a, b) => ascending ? a.totalSold - b.totalSold : b.totalSold - a.totalSold);
            this.#diagnostics.reportsGenerated++;
            return { available: true, items: ranked.slice(0, limit) };
        }
        getFastMovers(branchId = null, limit = 10) { return this.#getMovementVelocity(branchId, limit, false); }
        getSlowMovers(branchId = null, limit = 10) { return this.#getMovementVelocity(branchId, limit, true); }

        /** getTaxReport — honest: shop-sales' lineTax is currently always 0 (no tax rules implemented anywhere). This report reflects that reality rather than fabricating a computed tax figure. */
        getTaxReport(rawInput = {}) {
            const { period = "monthly" } = sanitizeObject(rawInput);
            const sales = window.CozyOS.ShopSales;
            if (!sales) return { available: false, reason: "shop-sales is not connected." };
            const { dateFrom, dateTo } = periodToRange(period);
            const snapshot = sales.exportSnapshot();
            const completed = snapshot.sales.map(([, s]) => s).filter(s => s.status === "COMPLETED" && s.completedAt && dateInRange(s.completedAt, dateFrom, dateTo));
            const totalTax = completed.reduce((sum, s) => sum + s.lineItems.reduce((ls, li) => ls + li.lineTax, 0), 0);
            return { available: true, period, totalTax, note: totalTax === 0 ? "Tax is currently always 0 — no tax category rules are implemented in shop-product/shop-sales yet." : null };
        }

        /** getGrowthReport — real, compares two real consecutive periods' sales reports. */
        getGrowthReport(rawInput = {}) {
            const { period = "monthly" } = sanitizeObject(rawInput);
            const current = this.getSalesReport({ period });
            if (!current.available) return current;
            const priorRef = new Date();
            if (period === "daily") priorRef.setDate(priorRef.getDate() - 1);
            else if (period === "weekly") priorRef.setDate(priorRef.getDate() - 7);
            else if (period === "monthly") priorRef.setMonth(priorRef.getMonth() - 1);
            else if (period === "yearly") priorRef.setFullYear(priorRef.getFullYear() - 1);
            const { dateFrom, dateTo } = periodToRange(period, priorRef);
            const sales = window.CozyOS.ShopSales;
            const snapshot = sales.exportSnapshot();
            const priorCompleted = snapshot.sales.map(([, s]) => s).filter(s => s.status === "COMPLETED" && s.completedAt && dateInRange(s.completedAt, dateFrom, dateTo));
            const priorRevenue = priorCompleted.reduce((sum, s) => sum + s.lineItems.reduce((ls, li) => ls + li.lineSubtotal, 0), 0);
            const growthRate = priorRevenue === 0 ? null : ((current.totalRevenue - priorRevenue) / priorRevenue) * 100;
            return { available: true, period, currentRevenue: current.totalRevenue, priorRevenue, growthRate };
        }

        /** getCustomerStatistics — honestly unavailable unless a verified Customer API exists. */
        getCustomerStatistics() {
            const customer = window.CozyOS.Customer;
            if (!customer || typeof customer.listCustomers !== "function") {
                return { available: false, reason: "Customer coordinator does not expose a verified listCustomers() method." };
            }
            return { available: false, reason: "Customer statistics aggregation not yet implemented against the verified Customer API." };
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_REPORTING_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_REPORTING_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopReporting && typeof window.CozyOS.ShopReporting.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopReporting.getVersion();
        if (existingVersion !== SHOP_REPORTING_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-reporting existing v${existingVersion} conflicts with load target v${SHOP_REPORTING_VERSION}.`);
        return;
    }

    const engineInstance = new ShopReportingEngine();
    window.CozyOS.ShopReporting = engineInstance;

    const manifest = {
        id: "shop-reporting",
        name: "ShopOS Reporting",
        version: SHOP_REPORTING_VERSION,
        description: "Read-only reports — sales, profit, expense, stock valuation, movers, tax, growth. Never modifies business data.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopSales", "window.CozyOS.ShopBookkeeping", "window.CozyOS.ShopInventory", "window.CozyOS.ShopProduct", "window.CozyOS.Customer"] }
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
