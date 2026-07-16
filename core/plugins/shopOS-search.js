/**
 * ShopOS — shop-search
 * File Reference: core/plugins/shopOS-search.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Unified search across Products, Customers, Suppliers, Sales,
 *   Purchases, Payments, Inventory, Expenses. Never owns business data.
 *
 * DESIGN NOTE — LIVE QUERY, NOT A MAINTAINED INDEX
 *   Phase 3 described indexRecord() being "called by other coordinators'
 *   own write paths." Every other ShopOS coordinator is already frozen
 *   and certified without such a call — none of them know shop-search
 *   exists. Rather than ship an indexRecord() that nothing ever calls
 *   (a real, permanently-stale index masquerading as a working one),
 *   search() queries each real coordinator's real data live on every
 *   call, using the same exportSnapshot()-based access pattern already
 *   established in shop-reporting and shop-dashboard. This is slower
 *   than a real maintained index would be, and is disclosed as such —
 *   if search performance becomes a real, measured problem, that's the
 *   genuine trigger for building a real indexing layer, not assumed now.
 *
 * NEVER
 *   Stores a product, sale, or any other business record. Every search
 *   result is a live read from the coordinator that actually owns it.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_SEARCH_VERSION = "1.0.0-ENTERPRISE";
    const VALID_TYPES = new Set(["product", "customer", "supplier", "sale", "purchase", "payment", "expense"]);
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

    function textMatch(haystack, needle) {
        return typeof haystack === "string" && haystack.toLowerCase().includes(needle);
    }

    class ShopSearchEngine {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { searchesRun: 0, resultsReturned: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.3 };

        getVersion() { return SHOP_SEARCH_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-search] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-search] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-search] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #searchProducts(needle) {
            const product = window.CozyOS.ShopProduct;
            if (!product) return { available: false, reason: "shop-product is not connected." };
            const all = product.listProducts({});
            return { available: true, items: all.filter(p => textMatch(p.name, needle) || textMatch(p.sku, needle) || textMatch(p.barcode, needle)) };
        }

        #searchSuppliers(needle) {
            const purchasing = window.CozyOS.ShopPurchasing;
            if (!purchasing) return { available: false, reason: "shop-purchasing is not connected." };
            const snapshot = purchasing.exportSnapshot();
            const suppliers = snapshot.suppliers.map(([, s]) => s).filter(s => textMatch(s.name, needle));
            return { available: true, items: suppliers };
        }

        #searchSales(needle) {
            const sales = window.CozyOS.ShopSales;
            if (!sales) return { available: false, reason: "shop-sales is not connected." };
            const snapshot = sales.exportSnapshot();
            const matched = snapshot.sales.map(([, s]) => s).filter(s => textMatch(s.receiptSerial, needle) || textMatch(s.id, needle) || textMatch(s.customerId, needle));
            return { available: true, items: matched };
        }

        #searchPurchases(needle) {
            const purchasing = window.CozyOS.ShopPurchasing;
            if (!purchasing) return { available: false, reason: "shop-purchasing is not connected." };
            const snapshot = purchasing.exportSnapshot();
            const matched = snapshot.purchaseOrders.map(([, po]) => po).filter(po => textMatch(po.poId, needle) || textMatch(po.supplierId, needle));
            return { available: true, items: matched };
        }

        #searchPayments(needle) {
            const payments = window.CozyOS.ShopPayments;
            if (!payments) return { available: false, reason: "shop-payments is not connected." };
            const snapshot = payments.exportSnapshot();
            const matched = snapshot.payments.map(([, p]) => p).filter(p => textMatch(p.reference, needle) || textMatch(p.saleId, needle) || textMatch(p.id, needle));
            return { available: true, items: matched };
        }

        #searchExpenses(needle) {
            const book = window.CozyOS.ShopBookkeeping;
            if (!book) return { available: false, reason: "shop-bookkeeping is not connected." };
            const entries = book.getAllEntries().filter(e => e.bookType === "expense" && textMatch(e.sourceReference, needle));
            return { available: true, items: entries };
        }

        #searchCustomers(_needle) {
            const customer = window.CozyOS.Customer;
            if (!customer || typeof customer.listCustomers !== "function") {
                return { available: false, reason: "Customer coordinator does not expose a verified listCustomers() method." };
            }
            return { available: false, reason: "Customer search not yet implemented against the verified Customer API." };
        }

        /**
         * search(query, {types})
         *   Real, live query fan-out across every requested, connected
         *   coordinator. A type whose coordinator isn't connected is
         *   honestly reported unavailable in that type's own result
         *   entry — never silently skipped without explanation.
         */
        search(query, rawOptions = {}) {
            if (typeof query !== "string" || !query.trim()) throw new TypeError("[shop-search] search(): query is required.");
            const { types = Array.from(VALID_TYPES) } = sanitizeObject(rawOptions);
            const invalidTypes = types.filter(t => !VALID_TYPES.has(t));
            if (invalidTypes.length > 0) throw new TypeError(`[shop-search] search(): invalid type(s): ${invalidTypes.join(", ")}.`);

            const needle = query.toLowerCase();
            const searchers = {
                product: () => this.#searchProducts(needle), supplier: () => this.#searchSuppliers(needle),
                sale: () => this.#searchSales(needle), purchase: () => this.#searchPurchases(needle),
                payment: () => this.#searchPayments(needle), expense: () => this.#searchExpenses(needle),
                customer: () => this.#searchCustomers(needle)
            };

            const results = {};
            let totalResults = 0;
            for (const type of types) {
                results[type] = searchers[type]();
                if (results[type].available) totalResults += results[type].items.length;
            }

            this.#diagnostics.searchesRun++;
            this.#diagnostics.resultsReturned += totalResults;
            this.#logAudit("SEARCH_RUN", `"${query}" across [${types.join(", ")}] -> ${totalResults} result(s)`);
            return this.#deepClone({ query, types, results, totalResults });
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_SEARCH_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_SEARCH_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopSearch && typeof window.CozyOS.ShopSearch.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopSearch.getVersion();
        if (existingVersion !== SHOP_SEARCH_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-search existing v${existingVersion} conflicts with load target v${SHOP_SEARCH_VERSION}.`);
        return;
    }

    const engineInstance = new ShopSearchEngine();
    window.CozyOS.ShopSearch = engineInstance;

    const manifest = {
        id: "shop-search",
        name: "ShopOS Search",
        version: SHOP_SEARCH_VERSION,
        description: "Unified live search across Products/Suppliers/Sales/Purchases/Payments/Expenses. Never owns business data.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopProduct", "window.CozyOS.ShopPurchasing", "window.CozyOS.ShopSales", "window.CozyOS.ShopPayments", "window.CozyOS.ShopBookkeeping", "window.CozyOS.Customer"] }
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
