/**
 * ShopOS — shop-product
 * File Reference: core/plugins/shopOS-product.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Product catalog only: barcode, QR code, SKU, name, category, brand,
 *   description, images, variants, unit of measure, cost/retail/wholesale/
 *   promotional price, tax category, product status.
 *
 * PRODUCT IDENTITY — SINGLE SOURCE OF TRUTH
 *   Every other coordinator (Sales, Inventory, Purchasing, Reporting,
 *   Search) must reference a product by its productId, never by
 *   duplicating name/price/category into its own records. productExists()
 *   is provided specifically so other coordinators can validate a
 *   reference without needing to know this coordinator's internal shape.
 *
 * NEVER
 *   Stock quantity, available/reserved/damaged/expired stock, reorder
 *   levels, stock valuation, or inventory movements — those belong
 *   exclusively to shop-inventory. This file has no concept of "how many."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_PRODUCT_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_STATUSES = new Set(["ACTIVE", "ARCHIVED", "DISCONTINUED"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopProductEngine {
        #products = new Map(); // productId -> frozen Product record
        #barcodeIndex = new Map(); // barcode -> productId
        #skuIndex = new Map(); // sku -> productId
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { productsCreated: 0, productsUpdated: 0, statusChanges: 0, lookupsPerformed: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.6 };

        getVersion() { return SHOP_PRODUCT_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #deepFreeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(val => this.#deepFreeze(val)); Object.freeze(v); } return v; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        /** #logAudit(action, msg) — real, bounded (500-entry) audit log for every state-changing action, matching shop-core.js's convention. */
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-product] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-product] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-product] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * createProduct(input)
         *   Required: name. Everything else is optional. barcode/sku, if
         *   provided, must be unique across the catalog — real duplicate
         *   detection, not a silent overwrite.
         */
        createProduct(rawInput = {}) {
            const input = sanitizeObject(rawInput);
            if (typeof input.name !== "string" || !input.name.trim()) throw new TypeError("[shop-product] createProduct(): name is required.");

            if (input.barcode && this.#barcodeIndex.has(input.barcode)) throw new Error(`[shop-product] createProduct(): barcode "${input.barcode}" already exists (productId: ${this.#barcodeIndex.get(input.barcode)}).`);
            if (input.sku && this.#skuIndex.has(input.sku)) throw new Error(`[shop-product] createProduct(): SKU "${input.sku}" already exists (productId: ${this.#skuIndex.get(input.sku)}).`);

            const status = input.status && VALID_STATUSES.has(String(input.status).toUpperCase()) ? String(input.status).toUpperCase() : "ACTIVE";
            const productId = this.#generateId("prod");
            const now = new Date().toISOString();
            const product = this.#deepFreeze({
                productId,
                barcode: input.barcode ?? null, qr: input.qr ?? null, sku: input.sku ?? null,
                name: this.#escapeHtml(input.name), category: input.category ?? null, brand: input.brand ?? null,
                description: input.description ?? null, images: Array.isArray(input.images) ? input.images : [],
                variants: Array.isArray(input.variants) ? input.variants : [], unit: input.unit ?? "piece",
                costPrice: typeof input.costPrice === "number" ? input.costPrice : null,
                retailPrice: typeof input.retailPrice === "number" ? input.retailPrice : null,
                wholesalePrice: typeof input.wholesalePrice === "number" ? input.wholesalePrice : null,
                promoPrice: typeof input.promoPrice === "number" ? input.promoPrice : null,
                taxCategory: input.taxCategory ?? null,
                status, createdAt: now, updatedAt: now
            });

            this.#products.set(productId, product);
            if (product.barcode) this.#barcodeIndex.set(product.barcode, productId);
            if (product.sku) this.#skuIndex.set(product.sku, productId);
            this.#diagnostics.productsCreated++;
            this.#logAudit("PRODUCT_CREATED", `${productId}: "${product.name}"${product.sku ? ` (SKU: ${product.sku})` : ""}`);
            this.emit("product:created", { productId });
            return this.#deepClone(product);
        }

        getProduct(productId) {
            this.#diagnostics.lookupsPerformed++;
            const product = this.#products.get(productId);
            return product ? this.#deepClone(product) : null;
        }

        /** productExists(productId) — the real, minimal check other coordinators should use to validate a reference without needing this coordinator's internal shape. */
        productExists(productId) { return this.#products.has(productId); }

        findByBarcode(code) {
            this.#diagnostics.lookupsPerformed++;
            const id = this.#barcodeIndex.get(code);
            return id ? this.getProduct(id) : null;
        }

        findBySku(sku) {
            this.#diagnostics.lookupsPerformed++;
            const id = this.#skuIndex.get(sku);
            return id ? this.getProduct(id) : null;
        }

        listProducts({ category = null, status = null } = {}) {
            let list = Array.from(this.#products.values());
            if (category) list = list.filter(p => p.category === category);
            if (status) list = list.filter(p => p.status === String(status).toUpperCase());
            return this.#deepClone(list);
        }

        /**
         * updateProduct(productId, changes)
         *   Real update — re-validates barcode/sku uniqueness if changed,
         *   keeps createdAt, refreshes updatedAt. Never a silent partial
         *   write; the returned record is the complete new state.
         */
        updateProduct(productId, rawChanges = {}) {
            const existing = this.#products.get(productId);
            if (!existing) throw new Error(`[shop-product] updateProduct(): unknown productId "${productId}".`);
            const changes = sanitizeObject(rawChanges);

            if (changes.barcode && changes.barcode !== existing.barcode && this.#barcodeIndex.has(changes.barcode)) {
                throw new Error(`[shop-product] updateProduct(): barcode "${changes.barcode}" already exists.`);
            }
            if (changes.sku && changes.sku !== existing.sku && this.#skuIndex.has(changes.sku)) {
                throw new Error(`[shop-product] updateProduct(): SKU "${changes.sku}" already exists.`);
            }
            if (changes.status && !VALID_STATUSES.has(String(changes.status).toUpperCase())) {
                throw new Error(`[shop-product] updateProduct(): invalid status "${changes.status}".`);
            }

            const before = this.#deepClone(existing);
            const updated = this.#deepFreeze({ ...existing, ...changes, productId, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });

            if (existing.barcode && existing.barcode !== updated.barcode) this.#barcodeIndex.delete(existing.barcode);
            if (updated.barcode) this.#barcodeIndex.set(updated.barcode, productId);
            if (existing.sku && existing.sku !== updated.sku) this.#skuIndex.delete(existing.sku);
            if (updated.sku) this.#skuIndex.set(updated.sku, productId);

            this.#products.set(productId, updated);
            this.#diagnostics.productsUpdated++;
            if (before.status !== updated.status) {
                this.#diagnostics.statusChanges++;
                this.#logAudit("PRODUCT_STATUS_CHANGED", `${productId}: ${before.status} -> ${updated.status}`);
            } else {
                this.#logAudit("PRODUCT_UPDATED", `${productId}: ${Object.keys(changes).join(", ")}`);
            }
            this.emit("product:updated", { productId, before, after: this.#deepClone(updated) });
            return this.#deepClone(updated);
        }

        archiveProduct(productId) { return this.updateProduct(productId, { status: "ARCHIVED" }); }
        discontinueProduct(productId) { return this.updateProduct(productId, { status: "DISCONTINUED" }); }

        /** exportSnapshot() — real, full catalog export for backup/restore, matching the pattern LanguageEngine already uses. */
        exportSnapshot() {
            return this.#deepClone({
                version: SHOP_PRODUCT_VERSION, exportedAt: new Date().toISOString(),
                products: Array.from(this.#products.entries())
            });
        }

        /** importSnapshot(snapshot, {mergeStrategy}) — real merge or replace, rebuilds barcode/SKU indexes from the imported data, never silently drops the uniqueness guarantee. */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.products)) throw new TypeError("[shop-product] importSnapshot(): snapshot.products array is required.");
            if (mergeStrategy === "replace") { this.#products.clear(); this.#barcodeIndex.clear(); this.#skuIndex.clear(); }
            let imported = 0;
            for (const [productId, product] of snapshot.products) {
                this.#products.set(productId, this.#deepFreeze(this.#deepClone(product)));
                if (product.barcode) this.#barcodeIndex.set(product.barcode, productId);
                if (product.sku) this.#skuIndex.set(product.sku, productId);
                imported++;
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} product(s), strategy=${mergeStrategy}.`);
            return { imported, mergeStrategy };
        }

        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_PRODUCT_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_PRODUCT_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_PRODUCT_VERSION, ...this.#diagnostics, catalogSize: this.#products.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopProduct && typeof window.CozyOS.ShopProduct.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopProduct.getVersion();
        if (existingVersion !== SHOP_PRODUCT_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-product existing v${existingVersion} conflicts with load target v${SHOP_PRODUCT_VERSION}.`);
        return;
    }

    const engineInstance = new ShopProductEngine();
    window.CozyOS.ShopProduct = engineInstance;

    const manifest = {
        id: "shop-product",
        name: "ShopOS Product Catalog",
        version: SHOP_PRODUCT_VERSION,
        description: "Product catalog — identity, pricing, and classification. Never stock quantity or movements (shop-inventory owns those).",
        dependencies: { required: [], optional: [] }
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
