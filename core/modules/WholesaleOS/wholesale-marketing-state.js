/**
 * WholesaleOS — Anti-Stale Marketing State Machine
 * File Reference: core/modules/WholesaleOS/wholesale-marketing-state.js
 * Layer: Business Domain — New Capability Module (RP-035 WOS1)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT (Rule 29)
 *   No existing marketing-state, campaign, or anti-stale engine was found
 *   anywhere in the repository (docs/history/RP-035-WOS1-Rule29-Audit.md).
 *   `cozy-rp034-integration.js` and `content-presentation-engine.js`
 *   reference "marketing"/"campaign" only in unrelated media/content
 *   presentation contexts, not inventory-aware promotion eligibility.
 *   This is a genuine, new WOS1 capability — the first one.
 *
 * SOURCE OF TRUTH
 *   This engine never stores stock or product facts. Every eligibility
 *   decision reads live from window.CozyOS.WholesaleCommerce (which
 *   itself delegates to the real ShopOS product/inventory engines). If
 *   ShopOS reports stock = 0, this engine reports MARKETING_BLOCKED —
 *   it cannot be told otherwise.
 *
 * HISTORICAL MESSAGE HONESTY (Part 11)
 *   This engine can only ever mark future WholesaleOS-generated marketing
 *   as blocked (INTERNAL_MARKETING_BLOCKED). It has and claims zero
 *   ability to delete, recall, or alter a historical external message
 *   (e.g. a WhatsApp message already sent) — that remains
 *   EXTERNAL_MESSAGE_DELETED: CAPABILITY_UNAVAILABLE until a real,
 *   verified connector proves otherwise.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const WOS_MARKETING_VERSION = "1.0.0-ENTERPRISE";
    const DEFAULT_LOW_STOCK_THRESHOLD_FALLBACK = null; // never a fabricated universal number

    class WholesaleMarketingStateEngine {
        // productId -> {productId, businessId, marketingState, reason, lastEvaluatedAt, lastPromotedAt, promotionCount, lastKnownStock}
        #records = new Map();
        #diagnostics = { evaluations: 0, blocks: 0, restores: 0 };

        getVersion() { return WOS_MARKETING_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #commerce() { return window.CozyOS.WholesaleCommerce || null; }

        /**
         * evaluate(productId, branchId)
         *   Real-time eligibility decision. Reads live stock via the
         *   commerce boundary; never trusts a cached value for the
         *   decision itself (a cached record is kept only for rotation
         *   metadata — daysSinceLastPromotion, promotionCount).
         */
        evaluate(productId, branchId) {
            const commerce = this.#commerce();
            if (!commerce || typeof commerce.getStockStatus !== "function") {
                return { success: false, reason: "CAPABILITY_UNAVAILABLE" };
            }
            const stockResult = commerce.getStockStatus(productId, branchId);
            if (!stockResult.success) return stockResult;

            this.#diagnostics.evaluations++;
            const now = new Date().toISOString();
            const existing = this.#records.get(productId) || {
                productId, businessId: null, marketingState: "MARKETING_ELIGIBLE",
                reason: null, lastEvaluatedAt: null, lastPromotedAt: null, promotionCount: 0, lastKnownStock: null,
            };

            let marketingState;
            let reason = null;
            if (stockResult.status === "OUT_OF_STOCK") {
                marketingState = "MARKETING_BLOCKED";
                reason = "OUT_OF_STOCK";
                this.#diagnostics.blocks++;
            } else if (stockResult.status === "LOW_STOCK") {
                marketingState = "LOW_STOCK";
            } else {
                if (existing.marketingState === "MARKETING_BLOCKED") this.#diagnostics.restores++;
                marketingState = "MARKETING_ELIGIBLE";
            }

            const updated = Object.freeze({
                ...existing,
                marketingState,
                reason,
                lastEvaluatedAt: now,
                lastKnownStock: stockResult.stock,
            });
            this.#records.set(productId, updated);
            return { success: true, ...updated, stock: stockResult.stock, reorderLevel: stockResult.reorderLevel };
        }

        /**
         * canGenerateAvailabilityClaim(productId, branchId)
         *   The explicit AI-protection boundary named in Part 10/17: the
         *   future AI marketing layer must call this — never assume
         *   availability — before generating any "available now" style
         *   copy for a product.
         */
        canGenerateAvailabilityClaim(productId, branchId) {
            const result = this.evaluate(productId, branchId);
            if (!result.success) return { allowed: false, reason: result.reason };
            return { allowed: result.marketingState !== "MARKETING_BLOCKED", reason: result.marketingState === "MARKETING_BLOCKED" ? result.reason : null };
        }

        /**
         * recordPromotion(productId)
         *   Called only after a real promotion is actually sent by a
         *   future marketing layer; increments the deterministic rotation
         *   counters this engine exposes. Never called automatically —
         *   this engine does not send anything itself.
         */
        recordPromotion(productId) {
            const existing = this.#records.get(productId);
            if (!existing) return { success: false, reason: "NOT_EVALUATED" };
            if (existing.marketingState === "MARKETING_BLOCKED") {
                return { success: false, reason: "MARKETING_BLOCKED", detail: existing.reason };
            }
            const now = new Date().toISOString();
            const updated = Object.freeze({ ...existing, lastPromotedAt: now, promotionCount: existing.promotionCount + 1 });
            this.#records.set(productId, updated);
            return { success: true, record: updated };
        }

        /**
         * getRotationInfo(productId)
         *   Deterministic ranking facts for a future AI rotation
         *   algorithm to consume — this engine never mutates truth by
         *   itself beyond what evaluate()/recordPromotion() record.
         */
        getRotationInfo(productId) {
            const record = this.#records.get(productId);
            if (!record) return { success: false, reason: "NOT_EVALUATED" };
            const daysSinceLastPromotion = record.lastPromotedAt
                ? Math.floor((Date.now() - new Date(record.lastPromotedAt).getTime()) / 86400000)
                : null;
            return {
                success: true,
                eligible: record.marketingState === "MARKETING_ELIGIBLE",
                daysSinceLastPromotion,
                promotionCount: record.promotionCount,
                stock: record.lastKnownStock,
            };
        }

        /**
         * getExternalMessageDeletionCapability()
         *   Named explicitly (Part 11) so no caller can accidentally
         *   assume this exists — always CAPABILITY_UNAVAILABLE until a
         *   real, verified connector proves otherwise.
         */
        getExternalMessageDeletionCapability() {
            return { capability: "EXTERNAL_MESSAGE_DELETED", status: "CAPABILITY_UNAVAILABLE" };
        }

        getRecord(productId) {
            const record = this.#records.get(productId);
            return record ? this.#deepClone(record) : null;
        }

        getDiagnosticsReport() {
            return this.#deepClone({ pluginVersion: WOS_MARKETING_VERSION, ...this.#diagnostics, trackedProducts: this.#records.size });
        }
    }

    const engineInstance = new WholesaleMarketingStateEngine();

    if (window.CozyOS.WholesaleMarketingState && typeof window.CozyOS.WholesaleMarketingState.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleMarketingState.getVersion();
        if (existingVersion === WOS_MARKETING_VERSION) {
            return;
        }
    }
    window.CozyOS.WholesaleMarketingState = engineInstance;

    (function initRegistration() {
        const manifest = { id: "wholesale-marketing-state", name: "WholesaleOS Anti-Stale Marketing State", version: WOS_MARKETING_VERSION };
        if (window.CozyOS && window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.register === "function") {
            window.CozyOS.PluginManager.register(
                manifest.id, manifest.name, manifest.version,
                typeof window.CozyOS.PluginManager.createMinimalIntentHandler === "function"
                    ? window.CozyOS.PluginManager.createMinimalIntentHandler(engineInstance, "WholesaleOS Anti-Stale Marketing State")
                    : engineInstance
            );
        }
        if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
        window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        if (!window.CozyOS.Modules) window.CozyOS.Modules = {};
        window.CozyOS.Modules["wholesale-marketing-state"] = { version: WOS_MARKETING_VERSION };
    })();
})();
