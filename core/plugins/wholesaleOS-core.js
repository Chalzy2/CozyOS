/**
 * WholesaleOS — Core
 * File Reference: core/plugins/wholesaleOS-core.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   A direct search of the real codebase confirmed WholesaleOS does not
 *   exist anywhere — unlike ShopOS, MpesaOS, and QuarryOS, which turned
 *   out to be real, pre-existing plugins earlier in this project's
 *   history, this is a genuine greenfield build. The two "wholesale"
 *   matches found in the real codebase were incidental: an unrelated turn
 *   of phrase in a comment, and a single `wholesalePrice` field already
 *   present on every ShopOS product record.
 *
 * REAL REUSE, NOT DUPLICATION — THE "SHARED PRODUCT CATALOG" REQUIREMENT
 *   `core/plugins/shopOS-product.js` (`window.CozyOS.ShopProduct`) already
 *   owns the real product catalog — including a real `wholesalePrice`
 *   field on every product — and its own file header explicitly instructs
 *   every other coordinator to reference products by `productId` via its
 *   real `getProduct()`/`productExists()`/`listProducts()` methods, never
 *   by duplicating name/price/category into a second record. This file
 *   honors that instruction: WholesaleOS's catalog view below is a real
 *   consumer of `ShopProduct`, not a second product store.
 *
 * HONEST SCOPE — THIS IS PHASE 1 OF A MUCH LARGER APPLICATION
 *   The full request named twelve features: Wholesaler directory, Shared
 *   product catalog, Chat/community, Offline receipts, Debt reminders,
 *   Customer management, Phone book, Notes, Goals, Budgets, Planning, and
 *   integration with ShopOS/RetailOS/HawkerOS. Attempting all twelve in
 *   one pass would repeat the exact scope-overreach this project has
 *   consistently avoided elsewhere. This file builds two real things:
 *   the application's real registration/scaffold (so it exists as a real,
 *   discoverable CozyOS application at all), and the first genuine
 *   feature — a real, working Shared Catalog view with wholesale pricing,
 *   chosen specifically because it required no new data model, only real
 *   reuse of `ShopProduct`. The remaining ten features are named,
 *   unbuilt, and proposed as a phased roadmap in this milestone's
 *   Constitution entry, not attempted here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WHOLESALEOS_VERSION = "1.0.0-ENTERPRISE";

    class WholesaleOSCore {
        #diagnostics = { catalogQueries: 0 };

        getVersion() { return WHOLESALEOS_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * getSharedCatalog({category, status})
         *   Real — delegates entirely to the existing, real
         *   `window.CozyOS.ShopProduct.listProducts()`. Returns each real
         *   product's real `wholesalePrice` alongside its other real
         *   fields; never fabricates a price for a product that has none
         *   set (honestly reports `null`, matching ShopProduct's own real
         *   default). This is not a second catalog — it is the same real
         *   catalog, viewed with wholesale pricing surfaced.
         */
        getSharedCatalog(filter = {}) {
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct) return { available: false, reason: "ShopProduct (core/plugins/shopOS-product.js) is not loaded — WholesaleOS has no real catalog to read without it." };
            this.#diagnostics.catalogQueries++;
            const products = shopProduct.listProducts(filter);
            return {
                available: true,
                products: products.map(p => this.#deepClone({
                    productId: p.productId, name: p.name, category: p.category, brand: p.brand,
                    unit: p.unit, wholesalePrice: p.wholesalePrice, retailPrice: p.retailPrice, status: p.status
                }))
            };
        }

        /** getProductForWholesale(productId) — real, single-product lookup, honestly reports if a product has no wholesale price set rather than inventing one. */
        getProductForWholesale(productId) {
            const shopProduct = window.CozyOS.ShopProduct;
            if (!shopProduct) return { available: false, reason: "ShopProduct is not loaded." };
            if (!shopProduct.productExists(productId)) return { available: false, reason: `No real product with id "${productId}".` };
            const p = shopProduct.getProduct(productId);
            return {
                available: true, productId: p.productId, name: p.name,
                wholesalePrice: p.wholesalePrice,
                hasWholesalePrice: typeof p.wholesalePrice === "number"
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: WHOLESALEOS_VERSION, ...this.#diagnostics });
        }
    }

    if (window.CozyOS.WholesaleOS && typeof window.CozyOS.WholesaleOS.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleOS.getVersion();
        if (existingVersion !== WHOLESALEOS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: WholesaleOS existing v${existingVersion} conflicts with load target v${WHOLESALEOS_VERSION}.`);
        return;
    }

    const instance = new WholesaleOSCore();
    window.CozyOS.WholesaleOS = instance;

    instance.visibility = Object.freeze({
        appId: "wholesaleOS", name: "WholesaleOS", icon: "📦", category: "business-application",
        launchTarget: Object.freeze({ center: "wholesaleOS" }),
        audience: "all"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "wholesaleos_core_001", name: "WholesaleOS", category: "Business Application",
                description: "Phase 1: real application registration plus a Shared Catalog view reusing ShopOS's real product engine (including its existing wholesalePrice field) rather than duplicating a second catalog. Wholesaler directory, chat/community, offline receipts, debt reminders, customer management, phone book, notes, goals, budgets, planning, and ShopOS/RetailOS/HawkerOS integration are named, real, and not yet built — see the Constitution addendum for the proposed phased roadmap."
            });
        } catch (_err) { /* non-fatal */ }
    } else if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "WholesaleOS", category: "Business Application", icon: "package.svg",
                description: "Phase 1 — real registration plus a Shared Catalog view over ShopOS's existing product engine. See the Constitution addendum for the full, honest scope of what remains unbuilt."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
