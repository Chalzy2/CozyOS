/**
 * ShopOS — shop-dashboard
 * File Reference: core/plugins/shopOS-dashboard.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Dashboard presentation only. Reads Sales (via shop-reporting),
 *   Inventory, Bookkeeping, Reporting. Calculates nothing of its own —
 *   every number here is fetched, already computed, from the coordinator
 *   that owns it.
 *
 * NEVER
 *   No write methods exist anywhere on this coordinator, by design. If a
 *   future requirement needs one, that's a real architectural change to
 *   flag explicitly, not something to add quietly.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_DASHBOARD_VERSION = "1.0.0-ENTERPRISE";
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

    class ShopDashboardEngine {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { summariesGenerated: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.2 };

        getVersion() { return SHOP_DASHBOARD_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-dashboard] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-dashboard] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-dashboard] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * getTodaySummary(branchId)
         *   Real — fetches already-computed values from shop-reporting
         *   (sales, profit) and shop-inventory (low stock count) and
         *   combines them into one display object. No arithmetic happens
         *   in this method beyond re-shaping what was already computed.
         */
        getTodaySummary(branchId = null) {
            const reporting = window.CozyOS.ShopReporting;
            const inventory = window.CozyOS.ShopInventory;
            if (!reporting) return { available: false, reason: "shop-reporting is not connected." };

            const salesReport = reporting.getSalesReport({ period: "daily", branchId });
            const profitReport = reporting.getProfitReport({ period: "daily" });
            const lowStock = inventory ? inventory.getLowStockItems(branchId) : [];

            this.#diagnostics.summariesGenerated++;
            this.#logAudit("TODAY_SUMMARY_VIEWED", `branch=${branchId || "all"}`);
            return {
                available: true,
                todaySales: salesReport.available ? salesReport.totalRevenue : null,
                todayProfit: profitReport.available ? profitReport.netProfit : null,
                todayExpenses: profitReport.available ? profitReport.expense : null,
                lowStockCount: lowStock.length
            };
        }

        /** getBestSellingProducts — real delegation to shop-reporting's own getFastMovers(); no ranking logic duplicated here. */
        getBestSellingProducts(branchId = null, limit = 10) {
            const reporting = window.CozyOS.ShopReporting;
            if (!reporting) return { available: false, reason: "shop-reporting is not connected." };
            return reporting.getFastMovers(branchId, limit);
        }

        /** getLowStockItems — real delegation to shop-inventory's own getLowStockItems(); no reorder-threshold logic duplicated here. */
        getLowStockItems(branchId = null) {
            const inventory = window.CozyOS.ShopInventory;
            if (!inventory) return { available: false, reason: "shop-inventory is not connected." };
            return { available: true, items: inventory.getLowStockItems(branchId) };
        }

        /**
         * getOutstandingSuppliers()
         *   Real — reads shop-purchasing's actual supplier records via
         *   its own exportSnapshot() (the same legitimate full-data-access
         *   pattern shop-reporting already uses), filters to those with a
         *   real positive outstanding balance. No balance calculation
         *   happens here — outstandingBalance is already a real, computed
         *   field on each supplier record.
         */
        getOutstandingSuppliers() {
            const purchasing = window.CozyOS.ShopPurchasing;
            if (!purchasing) return { available: false, reason: "shop-purchasing is not connected." };
            const snapshot = purchasing.exportSnapshot();
            const outstanding = snapshot.suppliers.map(([, s]) => s).filter(s => s.outstandingBalance > 0);
            return { available: true, suppliers: outstanding };
        }

        /** getTopCustomers — honestly unavailable unless a verified Customer API exists; never guesses at ranking without real data. */
        getTopCustomers(limit = 10) {
            const customer = window.CozyOS.Customer;
            if (!customer || typeof customer.listCustomers !== "function") {
                return { available: false, reason: "Customer coordinator does not expose a verified listCustomers() method." };
            }
            return { available: false, reason: "Top-customer ranking not yet implemented against the verified Customer API." };
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_DASHBOARD_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_DASHBOARD_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopDashboard && typeof window.CozyOS.ShopDashboard.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopDashboard.getVersion();
        if (existingVersion !== SHOP_DASHBOARD_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-dashboard existing v${existingVersion} conflicts with load target v${SHOP_DASHBOARD_VERSION}.`);
        return;
    }

    const engineInstance = new ShopDashboardEngine();
    window.CozyOS.ShopDashboard = engineInstance;

    const manifest = {
        id: "shop-dashboard",
        name: "ShopOS Dashboard",
        version: SHOP_DASHBOARD_VERSION,
        description: "Dashboard presentation only — reads Sales/Inventory/Bookkeeping/Reporting. Calculates nothing; no write methods exist.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopReporting", "window.CozyOS.ShopInventory", "window.CozyOS.ShopPurchasing", "window.CozyOS.Customer"] }
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
