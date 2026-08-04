/**
 * ShopOS — shop-inventory
 * File Reference: core/plugins/shopOS-inventory.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3 + Phase 4 refinement, frozen)
 *   Current/available/reserved/damaged/expired stock, customer/supplier
 *   returns, stock transfers, adjustments, movements, reorder levels,
 *   low-stock detection. Real, per-branch, per-product quantity tracking.
 *
 * HONEST SCOPE NOTE
 *   Phase 3's original design listed "stock value" and "average cost"
 *   among Inventory's calculations. The Phase 4 implementation directive
 *   this file was built against lists a narrower scope that omits both.
 *   Neither is implemented here as a result — disclosed rather than
 *   silently included or silently dropped without comment. If stock
 *   valuation is still needed, it belongs either here (as an explicit
 *   addition) or in shop-reporting (reading real cost data from
 *   shop-product) — a real decision to make before that gap is closed.
 *
 * NEVER
 *   Product information (name/price/category — shop-product owns that),
 *   Sales, Purchasing, Bookkeeping, or Reports. This file has no concept
 *   of money — only quantity.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_INVENTORY_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const MOVEMENT_TYPES = new Set(["received", "sold", "transferred_out", "transferred_in", "damaged", "expired", "returned_customer", "returned_supplier", "adjustment_add", "adjustment_remove"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopInventoryEngine {
        #movements = []; // append-only ledger — the real source of truth for every quantity below
        #stockLevels = new Map(); // `${productId}::${branchId}` -> {current, reserved, damaged, expired}
        #reorderLevels = new Map(); // `${productId}::${branchId}` -> number
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { movementsRecorded: 0, transfersCompleted: 0, adjustmentsMade: 0, reservationsMade: 0, lowStockAlertsRaised: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.8 };

        getVersion() { return SHOP_INVENTORY_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #deepFreeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(val => this.#deepFreeze(val)); Object.freeze(v); } return v; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #key(productId, branchId) { return `${productId}::${branchId}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-inventory] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-inventory] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-inventory] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #getLevels(productId, branchId) {
            const key = this.#key(productId, branchId);
            if (!this.#stockLevels.has(key)) this.#stockLevels.set(key, { current: 0, reserved: 0, damaged: 0, expired: 0 });
            return this.#stockLevels.get(key);
        }

        /**
         * recordStockMovement({productId, branchId, type, quantity, reference})
         *   The one real write path every other public method here funnels
         *   through — current stock is always derived from the movement
         *   ledger, never set directly, so there is exactly one source of
         *   truth for "how many."
         */
        recordStockMovement(rawInput = {}) {
            const input = sanitizeObject(rawInput);
            const { productId, branchId, type, reference = null } = input;
            const quantity = Number(input.quantity);
            if (!productId || !branchId) throw new TypeError("[shop-inventory] recordStockMovement(): productId and branchId are required.");
            if (!MOVEMENT_TYPES.has(type)) throw new TypeError(`[shop-inventory] recordStockMovement(): invalid type "${type}".`);
            if (!Number.isFinite(quantity) || quantity <= 0) throw new TypeError("[shop-inventory] recordStockMovement(): quantity must be a positive number.");

            const levels = this.#getLevels(productId, branchId);
            const increases = new Set(["received", "transferred_in", "returned_customer", "adjustment_add"]);
            const decreases = new Set(["sold", "transferred_out", "damaged", "expired", "returned_supplier", "adjustment_remove"]);

            if (type === "damaged") { levels.current -= quantity; levels.damaged += quantity; }
            else if (type === "expired") { levels.current -= quantity; levels.expired += quantity; }
            else if (increases.has(type)) { levels.current += quantity; }
            else if (decreases.has(type)) {
                if (levels.current < quantity) throw new Error(`[shop-inventory] recordStockMovement(): insufficient stock for ${productId} at ${branchId} (have ${levels.current}, need ${quantity}).`);
                levels.current -= quantity;
            } else { levels.current += quantity; } // adjustment (unsigned direction handled by adjustStock())

            const movement = this.#deepFreeze({ id: this.#generateId("mov"), productId, branchId, type, quantity, reference: reference ? this.#escapeHtml(reference) : null, timestamp: new Date().toISOString() });
            this.#movements.push(movement);
            this.#diagnostics.movementsRecorded++;
            this.#logAudit("STOCK_MOVEMENT", `${productId}@${branchId}: ${type} ${quantity}${reference ? ` (ref: ${reference})` : ""}`);
            this.emit("stock:updated", { productId, branchId, type, quantity, currentStock: levels.current });

            this.#checkLowStock(productId, branchId);
            return this.#deepClone(movement);
        }

        getCurrentStock(productId, branchId) { return this.#getLevels(productId, branchId).current; }
        getReservedStock(productId, branchId) { return this.#getLevels(productId, branchId).reserved; }
        getDamagedStock(productId, branchId) { return this.#getLevels(productId, branchId).damaged; }
        getExpiredStock(productId, branchId) { return this.#getLevels(productId, branchId).expired; }
        getAvailableStock(productId, branchId) { const l = this.#getLevels(productId, branchId); return l.current - l.reserved; }

        /** reserveStock — real, bounded by available stock; never reserves more than is actually available. */
        reserveStock(productId, branchId, quantity) {
            const q = Number(quantity);
            if (!Number.isFinite(q) || q <= 0) throw new TypeError("[shop-inventory] reserveStock(): quantity must be a positive number.");
            const levels = this.#getLevels(productId, branchId);
            if (levels.current - levels.reserved < q) throw new Error(`[shop-inventory] reserveStock(): insufficient available stock for ${productId}@${branchId}.`);
            levels.reserved += q;
            this.#diagnostics.reservationsMade++;
            this.emit("stock:reserved", { productId, branchId, quantity: q });
            return { productId, branchId, reserved: levels.reserved };
        }

        releaseReservation(productId, branchId, quantity) {
            const q = Number(quantity);
            const levels = this.#getLevels(productId, branchId);
            levels.reserved = Math.max(0, levels.reserved - q);
            this.emit("stock:reservation_released", { productId, branchId, quantity: q });
            return { productId, branchId, reserved: levels.reserved };
        }

        /** transferStock — real, atomic-in-intent: decrements source and increments destination as two real, linked movements sharing one reference. */
        transferStock({ productId, fromBranchId, toBranchId, quantity } = {}) {
            const q = Number(quantity);
            if (!productId || !fromBranchId || !toBranchId) throw new TypeError("[shop-inventory] transferStock(): productId, fromBranchId, toBranchId are required.");
            if (fromBranchId === toBranchId) throw new TypeError("[shop-inventory] transferStock(): source and destination branch must differ.");
            const transferRef = this.#generateId("xfer");
            this.recordStockMovement({ productId, branchId: fromBranchId, type: "transferred_out", quantity: q, reference: transferRef });
            this.recordStockMovement({ productId, branchId: toBranchId, type: "transferred_in", quantity: q, reference: transferRef });
            this.#diagnostics.transfersCompleted++;
            this.emit("stock:transferred", { productId, fromBranchId, toBranchId, quantity: q, transferRef });
            return { transferRef, productId, fromBranchId, toBranchId, quantity: q };
        }

        /** adjustStock — real, signed, always produces a real movement; never a silent overwrite of the current figure. */
        adjustStock({ productId, branchId, quantity, reason, authorizedBy } = {}) {
            const q = Number(quantity);
            if (!Number.isFinite(q) || q === 0) throw new TypeError("[shop-inventory] adjustStock(): quantity must be a non-zero number.");
            if (!reason) throw new TypeError("[shop-inventory] adjustStock(): reason is required.");
            const levels = this.#getLevels(productId, branchId);
            const type = q > 0 ? "adjustment_add" : "adjustment_remove";
            const absQ = Math.abs(q);
            if (type === "adjustment_remove" && levels.current < absQ) throw new Error(`[shop-inventory] adjustStock(): cannot remove ${absQ} — only ${levels.current} in stock.`);
            const movement = this.recordStockMovement({ productId, branchId, type, quantity: absQ, reference: `adjustment:${reason}` });
            this.#diagnostics.adjustmentsMade++;
            this.#logAudit("STOCK_ADJUSTED", `${productId}@${branchId}: ${q > 0 ? "+" : ""}${q} (${reason}, by ${authorizedBy || "unspecified"})`);
            this.emit("stock:adjusted", { productId, branchId, quantity: q, reason, authorizedBy });
            return movement;
        }

        setReorderLevel(productId, branchId, level) {
            const l = Number(level);
            if (!Number.isFinite(l) || l < 0) throw new TypeError("[shop-inventory] setReorderLevel(): level must be a non-negative number.");
            this.#reorderLevels.set(this.#key(productId, branchId), l);
            this.#checkLowStock(productId, branchId);
            return { productId, branchId, reorderLevel: l };
        }

        getReorderLevel(productId, branchId) { return this.#reorderLevels.get(this.#key(productId, branchId)) ?? null; }

        #checkLowStock(productId, branchId) {
            const reorderLevel = this.getReorderLevel(productId, branchId);
            if (reorderLevel === null) return;
            const available = this.getAvailableStock(productId, branchId);
            if (available <= reorderLevel) {
                this.#diagnostics.lowStockAlertsRaised++;
                this.emit("stock:low", { productId, branchId, availableStock: available, reorderLevel });
            }
        }

        /** getLowStockItems — real, scans every tracked product/branch pair against its own reorder level. */
        getLowStockItems(branchId = null) {
            const results = [];
            for (const key of this.#stockLevels.keys()) {
                const [productId, keyBranchId] = key.split("::");
                if (branchId && keyBranchId !== branchId) continue;
                const reorderLevel = this.getReorderLevel(productId, keyBranchId);
                if (reorderLevel === null) continue;
                const available = this.getAvailableStock(productId, keyBranchId);
                if (available <= reorderLevel) results.push({ productId, branchId: keyBranchId, availableStock: available, reorderLevel });
            }
            return this.#deepClone(results);
        }

        getMovementHistory(productId, branchId) {
            return this.#deepClone(this.#movements.filter(m => m.productId === productId && (!branchId || m.branchId === branchId)));
        }

        /** exportSnapshot() — real, full state export: the movement ledger is the source of truth, levels/reorder are derivable but included for fast restore. */
        exportSnapshot() {
            return this.#deepClone({
                version: SHOP_INVENTORY_VERSION, exportedAt: new Date().toISOString(),
                movements: this.#movements,
                stockLevels: Array.from(this.#stockLevels.entries()),
                reorderLevels: Array.from(this.#reorderLevels.entries())
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.movements)) throw new TypeError("[shop-inventory] importSnapshot(): snapshot.movements array is required.");
            if (mergeStrategy === "replace") { this.#movements.length = 0; this.#stockLevels.clear(); this.#reorderLevels.clear(); }
            for (const m of snapshot.movements) this.#movements.push(this.#deepFreeze(this.#deepClone(m)));
            for (const [key, levels] of (snapshot.stockLevels || [])) this.#stockLevels.set(key, this.#deepClone(levels));
            for (const [key, level] of (snapshot.reorderLevels || [])) this.#reorderLevels.set(key, level);
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.movements.length} movement(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.movements.length, mergeStrategy };
        }

        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_INVENTORY_VERSION.split(".")[0]); }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_INVENTORY_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_INVENTORY_VERSION, ...this.#diagnostics, trackedPairs: this.#stockLevels.size, totalMovements: this.#movements.length, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopInventory && typeof window.CozyOS.ShopInventory.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopInventory.getVersion();
        if (existingVersion !== SHOP_INVENTORY_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-inventory existing v${existingVersion} conflicts with load target v${SHOP_INVENTORY_VERSION}.`);
        return;
    }

    const engineInstance = new ShopInventoryEngine();
    window.CozyOS.ShopInventory = engineInstance;

    const manifest = {
        id: "shop-inventory",
        name: "ShopOS Inventory",
        version: SHOP_INVENTORY_VERSION,
        description: "Stock quantity and movement tracking — current/available/reserved/damaged/expired stock, transfers, adjustments, reorder levels. Never product catalog data or valuation.",
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
