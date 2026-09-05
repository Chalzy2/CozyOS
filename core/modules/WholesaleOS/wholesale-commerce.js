/**
 * WholesaleOS — Commerce Integration Boundary
 * File Reference: core/modules/WholesaleOS/wholesale-commerce.js
 * Layer: Business Domain — Composition Module (RP-035 WOS1)
 * Version: 1.0.0-ENTERPRISE
 *
 * BASELINE
 *   COS-RP035-PHC6.zip, SHA-256
 *   ea8d310f489ead8495cce8a707524bef48fd3dfb2146d7489785084c8bce97b2.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Rule 29)
 *   Recorded in full in docs/history/RP-035-WOS1-Rule29-Audit.md. Summary:
 *     - Business/company identity: window.CozyOS.Company
 *       (core/modules/company/cozy-company.js) — REAL, reused, not
 *       duplicated.
 *     - Organization/roles: window.CozyOS.OrganizationRegistry /
 *       window.CozyOS.OrganizationRole — REAL, reused where applicable.
 *     - Product catalog: window.CozyOS.ShopProduct
 *       (core/plugins/shopOS-product.js) — REAL, authoritative, reused.
 *       Confirmed: no category registry/lifecycle exists there — category
 *       is a free-text field only. WOS1's category domain model (this
 *       file) is therefore genuinely new, not a duplicate.
 *     - Inventory: window.CozyOS.ShopInventory
 *       (core/plugins/shopOS-inventory.js) — REAL, append-only movement
 *       ledger is authoritative. This file never maintains a competing
 *       stock number.
 *     - Sales/orders: window.CozyOS.ShopSales
 *       (core/plugins/shopOS-sales.js) — REAL. Only getSale(saleId) is a
 *       stable read; there is no listSales(). This boundary exposes only
 *       that, and does not invent order states ShopOS does not have.
 *     - Authorization: window.CozyOS.IdentityEngine.checkResourcePermission
 *       (core/modules/identity/identity-engine.js) — REAL, reused. This
 *       file does not implement its own permission-checking logic.
 *     - A separate, unrelated, pre-existing "WholesaleOS Phase 1" already
 *       exists (core/plugins/wholesaleOS-core.js / -customer.js /
 *       -debt.js — CRM + debt + shared-catalog scaffold, currently
 *       unregistered/not wired into dashboard.html). This file does not
 *       duplicate that scope (customer identity, debt) and does not
 *       collide with its window.CozyOS.WholesaleOSCore /
 *       WholesaleCustomer / WholesaleDebt globals.
 *
 * RESPONSIBILITY
 *   A thin composition layer exposing only the WholesaleOS-facing
 *   operations WOS1 and its immediate next checkpoint need: business/org
 *   reads, a genuinely new category lifecycle, product create/update/get/
 *   list (delegated), inventory reads (delegated), pricing reads
 *   (delegated), and a single existing sale read (delegated). It never
 *   becomes a second source of truth for any of these.
 *
 * NEVER
 *   Store product name/price/category, stock quantities, or order data.
 *   Every read delegates to the real owning engine on every call.
 *   Invent capabilities (multi-tier pricing arrays, order state machines,
 *   customer/debt records) the underlying engines do not actually have —
 *   those are reported CAPABILITY_UNAVAILABLE instead of fabricated.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WOS_COMMERCE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class WholesaleCommerceBoundary {
        // businessId -> Map(categoryName -> {name, status, createdAt, updatedAt})
        #categoriesByBusiness = new Map();
        #auditLog = [];
        #diagnostics = { categoryOps: 0, productOps: 0, inventoryOps: 0, pricingOps: 0, authDenied: 0 };

        getVersion() { return WOS_COMMERCE_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({ id: `aud_${this.#auditLog.length + 1}_${Date.now()}`, timestamp: new Date().toISOString(), action, detail }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(typeof predicate === "function" ? list.filter(predicate) : list);
        }

        /**
         * #authorize(userId, permission)
         *   Real, not reimplemented — delegates entirely to the existing
         *   IdentityEngine.checkResourcePermission(). Fails closed if
         *   IdentityEngine is not loaded (CAPABILITY_UNAVAILABLE, not a
         *   silent allow) or if the check itself returns falsy.
         */
        #authorize(userId, permission) {
            const ie = window.CozyOS.IdentityEngine;
            if (!ie || typeof ie.checkResourcePermission !== "function") {
                return { allowed: false, reason: "CAPABILITY_UNAVAILABLE", detail: "IdentityEngine.checkResourcePermission not loaded." };
            }
            if (!userId) return { allowed: false, reason: "USER_ID_REQUIRED" };
            const allowed = !!ie.checkResourcePermission(userId, permission);
            if (!allowed) this.#diagnostics.authDenied++;
            return { allowed, reason: allowed ? null : "PERMISSION_DENIED" };
        }

        // ---------------------------------------------------------------
        // BUSINESS / ORG — real reads, delegated to window.CozyOS.Company
        // ---------------------------------------------------------------

        getBusiness(businessId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.getCompany !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            const record = company.getCompany(businessId);
            if (!record) return { success: false, reason: "NOT_FOUND" };
            return { success: true, business: record };
        }

        getBranches(businessId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.listBranches !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            return { success: true, branches: company.listBranches(businessId) };
        }

        getDepartments(businessId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.listDepartments !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            return { success: true, departments: company.listDepartments(businessId) };
        }

        getTeams(businessId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.listTeams !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            return { success: true, teams: company.listTeams({ companyId: businessId }) };
        }

        // ---------------------------------------------------------------
        // CATEGORIES — genuinely new (ShopOS has no category registry;
        // it only carries a free-text `category` field per product).
        // Business-owned, arbitrary-domain data. Never hard-coded.
        // ---------------------------------------------------------------

        #businessCategories(businessId) {
            if (!this.#categoriesByBusiness.has(businessId)) this.#categoriesByBusiness.set(businessId, new Map());
            return this.#categoriesByBusiness.get(businessId);
        }

        addCategory(businessId, name, { userId } = {}) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:category-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            if (!businessId) return { success: false, reason: "BUSINESS_ID_REQUIRED" };
            const clean = String(name || "").trim();
            if (!clean) return { success: false, reason: "CATEGORY_NAME_REQUIRED" };
            const categories = this.#businessCategories(businessId);
            if (categories.has(clean)) return { success: false, reason: "CATEGORY_ALREADY_EXISTS" };
            const now = new Date().toISOString();
            categories.set(clean, Object.freeze({ name: clean, status: "ACTIVE", createdAt: now, updatedAt: now }));
            this.#diagnostics.categoryOps++;
            this.#logAudit("addCategory", { businessId, name: clean });
            return { success: true, category: categories.get(clean) };
        }

        removeCategory(businessId, name, { userId } = {}) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:category-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            const categories = this.#businessCategories(businessId);
            const clean = String(name || "").trim();
            if (!categories.has(clean)) return { success: false, reason: "NOT_FOUND" };
            categories.delete(clean);
            this.#diagnostics.categoryOps++;
            this.#logAudit("removeCategory", { businessId, name: clean });
            return { success: true };
        }

        renameCategory(businessId, oldName, newName, { userId } = {}) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:category-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            const categories = this.#businessCategories(businessId);
            const cleanOld = String(oldName || "").trim();
            const cleanNew = String(newName || "").trim();
            if (!categories.has(cleanOld)) return { success: false, reason: "NOT_FOUND" };
            if (!cleanNew) return { success: false, reason: "CATEGORY_NAME_REQUIRED" };
            if (categories.has(cleanNew)) return { success: false, reason: "CATEGORY_ALREADY_EXISTS" };
            const existing = categories.get(cleanOld);
            categories.delete(cleanOld);
            categories.set(cleanNew, Object.freeze({ ...existing, name: cleanNew, updatedAt: new Date().toISOString() }));
            this.#diagnostics.categoryOps++;
            this.#logAudit("renameCategory", { businessId, oldName: cleanOld, newName: cleanNew });
            return { success: true, category: categories.get(cleanNew) };
        }

        #setCategoryStatus(businessId, name, status, userId) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:category-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            const categories = this.#businessCategories(businessId);
            const clean = String(name || "").trim();
            if (!categories.has(clean)) return { success: false, reason: "NOT_FOUND" };
            const existing = categories.get(clean);
            categories.set(clean, Object.freeze({ ...existing, status, updatedAt: new Date().toISOString() }));
            this.#diagnostics.categoryOps++;
            this.#logAudit(status === "ACTIVE" ? "activateCategory" : "deactivateCategory", { businessId, name: clean });
            return { success: true, category: categories.get(clean) };
        }

        activateCategory(businessId, name, opts = {}) { return this.#setCategoryStatus(businessId, name, "ACTIVE", opts.userId); }
        deactivateCategory(businessId, name, opts = {}) { return this.#setCategoryStatus(businessId, name, "INACTIVE", opts.userId); }

        listCategories(businessId, { activeOnly = false } = {}) {
            const categories = Array.from(this.#businessCategories(businessId).values());
            const filtered = activeOnly ? categories.filter(c => c.status === "ACTIVE") : categories;
            return this.#deepClone(filtered);
        }

        // ---------------------------------------------------------------
        // PRODUCTS — delegated entirely to window.CozyOS.ShopProduct.
        // ---------------------------------------------------------------

        createProduct(businessId, input, { userId } = {}) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:product-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct || typeof shopProduct.createProduct !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            this.#diagnostics.productOps++;
            const result = shopProduct.createProduct({ ...sanitize(input), businessId });
            this.#logAudit("createProduct", { businessId });
            return result;
        }

        updateProduct(productId, changes, { userId } = {}) {
            if (userId) {
                const auth = this.#authorize(userId, "wholesale:product-write");
                if (!auth.allowed) return { success: false, reason: auth.reason };
            }
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct || typeof shopProduct.updateProduct !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            this.#diagnostics.productOps++;
            return shopProduct.updateProduct(productId, sanitize(changes));
        }

        getProduct(productId) {
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct || typeof shopProduct.getProduct !== "function") return null;
            return shopProduct.getProduct(productId);
        }

        listProducts({ category = null, status = null } = {}) {
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct || typeof shopProduct.listProducts !== "function") return [];
            return shopProduct.listProducts({ category, status });
        }

        // ---------------------------------------------------------------
        // INVENTORY — delegated entirely to window.CozyOS.ShopInventory.
        // ShopInventory's ledger is authoritative; if it reports 0, that
        // is treated as fact here, never overridden.
        // ---------------------------------------------------------------

        getStock(productId, branchId) {
            const inv = window.CozyOS.ShopInventory;
            if (!inv || typeof inv.getCurrentStock !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            this.#diagnostics.inventoryOps++;
            return { success: true, stock: inv.getCurrentStock(productId, branchId), available: typeof inv.getAvailableStock === "function" ? inv.getAvailableStock(productId, branchId) : null };
        }

        getStockStatus(productId, branchId) {
            const stockResult = this.getStock(productId, branchId);
            if (!stockResult.success) return stockResult;
            const inv = window.CozyOS.ShopInventory;
            const reorderLevel = typeof inv.getReorderLevel === "function" ? inv.getReorderLevel(productId, branchId) : null;
            let status;
            if (stockResult.stock <= 0) status = "OUT_OF_STOCK";
            else if (typeof reorderLevel === "number" && stockResult.stock <= reorderLevel) status = "LOW_STOCK";
            else status = "IN_STOCK";
            return { success: true, stock: stockResult.stock, reorderLevel, status };
        }

        getLowStockProducts(branchId) {
            const inv = window.CozyOS.ShopInventory;
            if (!inv || typeof inv.getLowStockItems !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            return { success: true, items: inv.getLowStockItems(branchId) };
        }

        getOutOfStockProducts(branchId) {
            const lowStockResult = this.getLowStockProducts(branchId);
            if (!lowStockResult.success) return lowStockResult;
            const inv = window.CozyOS.ShopInventory;
            const outOfStock = lowStockResult.items.filter(item => {
                const productId = item.productId || item.id;
                return typeof inv.getCurrentStock === "function" && inv.getCurrentStock(productId, branchId) <= 0;
            });
            return { success: true, items: outOfStock };
        }

        // ---------------------------------------------------------------
        // PRICING — delegated to window.CozyOS.ShopProduct's real product
        // fields. No multi-tier "price tiers" array exists in ShopOS, so
        // getPriceTiers() reports the real single-value fields it has and
        // marks anything unsupported CAPABILITY_UNAVAILABLE, per Part 6.
        // ---------------------------------------------------------------

        getSellingPrice(productId) {
            const product = this.getProduct(productId);
            if (!product) return { success: false, reason: "NOT_FOUND" };
            this.#diagnostics.pricingOps++;
            return { success: true, retailPrice: product.retailPrice ?? null, promoPrice: product.promoPrice ?? null };
        }

        getPriceTiers(productId) {
            const product = this.getProduct(productId);
            if (!product) return { success: false, reason: "NOT_FOUND" };
            this.#diagnostics.pricingOps++;
            return {
                success: true,
                tiers: {
                    cost: product.costPrice ?? null,
                    retail: product.retailPrice ?? null,
                    wholesale: product.wholesalePrice ?? null,
                    promo: product.promoPrice ?? null,
                },
                multiTierPricing: "CAPABILITY_UNAVAILABLE",
            };
        }

        // ---------------------------------------------------------------
        // ORDERS — only what ShopSales actually has: a single-sale read.
        // No listSales(), no invented order states.
        // ---------------------------------------------------------------

        getOrder(saleId) {
            const sales = window.CozyOS.ShopSales;
            if (!sales || typeof sales.getSale !== "function") return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            const sale = sales.getSale(saleId);
            if (!sale) return { success: false, reason: "NOT_FOUND" };
            return { success: true, order: sale };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ pluginVersion: WOS_COMMERCE_VERSION, ...this.#diagnostics, businessesWithCategories: this.#categoriesByBusiness.size, auditLogSize: this.#auditLog.length });
        }
    }

    const engineInstance = new WholesaleCommerceBoundary();

    if (window.CozyOS.WholesaleCommerce && typeof window.CozyOS.WholesaleCommerce.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleCommerce.getVersion();
        if (existingVersion === WOS_COMMERCE_VERSION) {
            return; // Already loaded at the same version — idempotent no-op.
        }
    }
    window.CozyOS.WholesaleCommerce = engineInstance;

    (function initRegistration() {
        const manifest = { id: "wholesale-commerce", name: "WholesaleOS Commerce Integration Boundary", version: WOS_COMMERCE_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Commerce Integration Boundary")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-commerce"] = { version: WOS_COMMERCE_VERSION };
    })();
})();
