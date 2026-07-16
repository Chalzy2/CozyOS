/**
 * ShopOS — shop-purchasing
 * File Reference: core/plugins/shopOS-purchasing.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Suppliers, Purchase Orders, Goods Received Notes, Supplier Invoices.
 *   Never writes to Inventory's stock table directly.
 *
 * HONEST DESIGN NOTE — DIRECT CALL, NOT EVENT LISTENING
 *   Phase 3's cross-coordinator table describes shop-inventory as
 *   reacting to a "purchase:received" event. The already-shipped, frozen
 *   shop-inventory.js only emits events — it has no listener wired in
 *   for this. Rather than reopening a frozen, certified coordinator to
 *   add one, receiveGoods() below calls shop-inventory.recordStockMovement()
 *   directly and awaits it — the same real, established pattern already
 *   used for shop-sales calling shop-payments.process(). Stock only
 *   increases after a real GRN is recorded, never from a PO alone.
 *
 * NEVER
 *   Owns quantity data. getSupplierBalance() and all totals here are
 *   money, not stock.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_PURCHASING_VERSION = "1.0.0-ENTERPRISE";
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

    class ShopPurchasingEngine {
        #suppliers = new Map();
        #purchaseOrders = new Map();
        #goodsReceivedNotes = new Map();
        #supplierInvoices = new Map();
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { suppliersRegistered: 0, purchaseOrdersCreated: 0, goodsReceived: 0, invoicesRecorded: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.7 };

        getVersion() { return SHOP_PURCHASING_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #deepFreeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(val => this.#deepFreeze(val)); Object.freeze(v); } return v; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-purchasing] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-purchasing] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-purchasing] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        registerSupplier(rawInput = {}) {
            const { name, contacts = {} } = sanitizeObject(rawInput);
            if (!name) throw new TypeError("[shop-purchasing] registerSupplier(): name is required.");
            const supplierId = this.#generateId("sup");
            const supplier = this.#deepFreeze({ supplierId, name: this.#escapeHtml(name), contacts, outstandingBalance: 0, createdAt: new Date().toISOString() });
            this.#suppliers.set(supplierId, supplier);
            this.#diagnostics.suppliersRegistered++;
            this.#logAudit("SUPPLIER_REGISTERED", `${supplierId}: "${name}"`);
            this.emit("supplier:registered", { supplierId });
            return this.#deepClone(supplier);
        }

        getSupplier(supplierId) { const s = this.#suppliers.get(supplierId); return s ? this.#deepClone(s) : null; }
        getSupplierBalance(supplierId) { const s = this.#suppliers.get(supplierId); if (!s) throw new Error(`[shop-purchasing] unknown supplierId "${supplierId}".`); return s.outstandingBalance; }

        /** createPurchaseOrder — real computed subtotal/tax/total from real line items; never a manually-entered total. */
        createPurchaseOrder(rawInput = {}) {
            const { supplierId, lineItems } = sanitizeObject(rawInput);
            if (!this.#suppliers.has(supplierId)) throw new Error(`[shop-purchasing] createPurchaseOrder(): unknown supplierId "${supplierId}".`);
            if (!Array.isArray(lineItems) || lineItems.length === 0) throw new TypeError("[shop-purchasing] createPurchaseOrder(): lineItems array is required.");

            let subtotal = 0, tax = 0;
            const cleanItems = lineItems.map(item => {
                const quantity = Number(item.quantity), unitCost = Number(item.unitCost), lineTax = Number(item.tax || 0);
                if (!item.productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new TypeError("[shop-purchasing] createPurchaseOrder(): each line item needs productId, positive quantity, and non-negative unitCost.");
                subtotal += quantity * unitCost;
                tax += lineTax;
                return { productId: item.productId, quantity, unitCost, tax: lineTax, quantityReceived: 0 };
            });

            const poId = this.#generateId("po");
            const po = this.#deepFreeze({ poId, supplierId, lineItems: cleanItems, subtotal, tax, total: subtotal + tax, status: "OPEN", createdAt: new Date().toISOString() });
            this.#purchaseOrders.set(poId, po);
            this.#diagnostics.purchaseOrdersCreated++;
            this.#logAudit("PO_CREATED", `${poId} for supplier ${supplierId}: total ${po.total}`);
            this.emit("purchase:po_created", { poId, supplierId, total: po.total });
            return this.#deepClone(po);
        }

        getPurchaseOrder(poId) { const po = this.#purchaseOrders.get(poId); return po ? this.#deepClone(po) : null; }

        /**
         * receiveGoods(poId, {receivedLineItems})
         *   Creates a real GRN and, for each line, calls
         *   shop-inventory.recordStockMovement() directly and awaits it
         *   — real stock only increases here, never from creating a PO
         *   alone. See the file header for why this is a direct call
         *   rather than an event shop-inventory listens for.
         */
        async receiveGoods(poId, { receivedLineItems } = {}) {
            const po = this.#purchaseOrders.get(poId);
            if (!po) throw new Error(`[shop-purchasing] receiveGoods(): unknown poId "${poId}".`);
            if (!Array.isArray(receivedLineItems) || receivedLineItems.length === 0) throw new TypeError("[shop-purchasing] receiveGoods(): receivedLineItems array is required.");

            const inventory = window.CozyOS.ShopInventory;
            const grnId = this.#generateId("grn");
            const processedLines = [];
            // Real, immutable update — the PO's frozen line items are never
            // mutated in place; a new array with updated quantityReceived
            // values replaces them, and a new frozen PO is stored.
            const updatedLineItems = po.lineItems.map(l => ({ ...l }));

            for (const received of receivedLineItems) {
                const poLine = updatedLineItems.find(l => l.productId === received.productId);
                if (!poLine) throw new Error(`[shop-purchasing] receiveGoods(): productId "${received.productId}" is not on PO "${poId}".`);
                const quantity = Number(received.quantity);
                if (!Number.isFinite(quantity) || quantity <= 0) throw new TypeError("[shop-purchasing] receiveGoods(): each received line needs a positive quantity.");
                if (poLine.quantityReceived + quantity > poLine.quantity) throw new Error(`[shop-purchasing] receiveGoods(): received quantity exceeds ordered quantity for "${received.productId}".`);

                if (inventory) {
                    await inventory.recordStockMovement({ productId: received.productId, branchId: received.branchId, type: "received", quantity, reference: grnId });
                }
                poLine.quantityReceived += quantity;
                processedLines.push({ productId: received.productId, quantityReceived: quantity, branchId: received.branchId });
            }

            const allReceived = updatedLineItems.every(l => l.quantityReceived >= l.quantity);
            this.#purchaseOrders.set(poId, this.#deepFreeze({ ...po, lineItems: updatedLineItems, status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" }));

            const grn = this.#deepFreeze({ grnId, poId, lines: processedLines, timestamp: new Date().toISOString() });
            this.#goodsReceivedNotes.set(grnId, grn);
            this.#diagnostics.goodsReceived++;
            this.#logAudit("GOODS_RECEIVED", `${grnId} for PO ${poId}: ${processedLines.length} line(s)`);
            this.emit("purchase:received", { grnId, poId, lines: processedLines });
            return this.#deepClone(grn);
        }

        getGoodsReceivedNote(grnId) { const g = this.#goodsReceivedNotes.get(grnId); return g ? this.#deepClone(g) : null; }

        /** recordSupplierInvoice — real, updates the real supplier balance; never a silent overwrite. */
        recordSupplierInvoice(poId, rawInvoiceData = {}) {
            const po = this.#purchaseOrders.get(poId);
            if (!po) throw new Error(`[shop-purchasing] recordSupplierInvoice(): unknown poId "${poId}".`);
            const { invoiceNumber } = sanitizeObject(rawInvoiceData);
            const amount = Number(rawInvoiceData.amount ?? po.total);
            const invoiceId = this.#generateId("inv");
            const invoice = this.#deepFreeze({ invoiceId, poId, supplierId: po.supplierId, invoiceNumber: invoiceNumber ? this.#escapeHtml(invoiceNumber) : null, amount, paid: false, timestamp: new Date().toISOString() });
            this.#supplierInvoices.set(invoiceId, invoice);

            const supplier = this.#suppliers.get(po.supplierId);
            this.#suppliers.set(po.supplierId, this.#deepFreeze({ ...supplier, outstandingBalance: supplier.outstandingBalance + amount }));

            this.#diagnostics.invoicesRecorded++;
            this.#logAudit("INVOICE_RECORDED", `${invoiceId} for PO ${poId}: ${amount}`);
            this.emit("purchase:invoiced", { invoiceId, poId, supplierId: po.supplierId, amount });
            return this.#deepClone(invoice);
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_PURCHASING_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }

        /** exportSnapshot() — real, full export of suppliers/POs/GRNs/invoices. */
        exportSnapshot() {
            return this.#deepClone({
                version: SHOP_PURCHASING_VERSION, exportedAt: new Date().toISOString(),
                suppliers: Array.from(this.#suppliers.entries()),
                purchaseOrders: Array.from(this.#purchaseOrders.entries()),
                goodsReceivedNotes: Array.from(this.#goodsReceivedNotes.entries()),
                supplierInvoices: Array.from(this.#supplierInvoices.entries())
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.suppliers)) throw new TypeError("[shop-purchasing] importSnapshot(): snapshot.suppliers array is required.");
            if (mergeStrategy === "replace") { this.#suppliers.clear(); this.#purchaseOrders.clear(); this.#goodsReceivedNotes.clear(); this.#supplierInvoices.clear(); }
            for (const [id, v] of snapshot.suppliers) this.#suppliers.set(id, this.#deepFreeze(this.#deepClone(v)));
            for (const [id, v] of (snapshot.purchaseOrders || [])) this.#purchaseOrders.set(id, this.#deepFreeze(this.#deepClone(v)));
            for (const [id, v] of (snapshot.goodsReceivedNotes || [])) this.#goodsReceivedNotes.set(id, this.#deepFreeze(this.#deepClone(v)));
            for (const [id, v] of (snapshot.supplierInvoices || [])) this.#supplierInvoices.set(id, this.#deepFreeze(this.#deepClone(v)));
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.suppliers.length} supplier(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.suppliers.length, mergeStrategy };
        }

        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_PURCHASING_VERSION.split(".")[0]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_PURCHASING_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopPurchasing && typeof window.CozyOS.ShopPurchasing.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopPurchasing.getVersion();
        if (existingVersion !== SHOP_PURCHASING_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-purchasing existing v${existingVersion} conflicts with load target v${SHOP_PURCHASING_VERSION}.`);
        return;
    }

    const engineInstance = new ShopPurchasingEngine();
    window.CozyOS.ShopPurchasing = engineInstance;

    const manifest = {
        id: "shop-purchasing",
        name: "ShopOS Purchasing",
        version: SHOP_PURCHASING_VERSION,
        description: "Suppliers, Purchase Orders, Goods Received Notes, Supplier Invoices. Never writes to Inventory's stock table directly.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopInventory"] }
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
