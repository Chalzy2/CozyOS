/**
 * ShopOS — shop-sales
 * File Reference: core/plugins/shopOS-sales.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Sale lifecycle, cart, discounts, sale completion/cancellation, refund
 *   requests, receipt-data generation. Real line-item pricing comes from
 *   shop-product (never duplicated here); real stock availability checks
 *   come from shop-inventory; real payment processing is delegated
 *   entirely to shop-payments and awaited before a sale is ever marked
 *   complete.
 *
 * NEVER
 *   Calls a payment provider directly, calculates change/exchange rate/
 *   provider fees (shop-payments owns those), or processes a refund
 *   itself — requestRefund() only records the request and delegates the
 *   actual money movement to shop-payments.refund().
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_SALES_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const SALE_STATUSES = new Set(["DRAFT", "PAYMENT_PENDING", "COMPLETED", "CANCELLED", "PAYMENT_FAILED"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopSalesEngine {
        #sales = new Map(); // saleId -> mutable-until-completed Sale record
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { salesStarted: 0, salesCompleted: 0, salesCancelled: 0, salesFailed: 0, refundRequestsRecorded: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.7 };

        getVersion() { return SHOP_SALES_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-sales] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-sales] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-sales] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /** #computeTotals — real, pure function over the current line items; never stored redundantly, always recomputed. */
        #computeTotals(sale) {
            let subtotal = 0, discountTotal = 0, taxTotal = 0, profitTotal = 0;
            for (const item of sale.lineItems) {
                subtotal += item.lineSubtotal;
                discountTotal += item.lineDiscount;
                taxTotal += item.lineTax;
                profitTotal += item.lineProfit;
            }
            const grandTotal = subtotal - discountTotal + taxTotal;
            return { subtotal, discountTotal, taxTotal, grandTotal, profitTotal };
        }

        startSale(rawInput = {}) {
            const { branchId, cashierId, customerId = null } = sanitizeObject(rawInput);
            if (!branchId || !cashierId) throw new TypeError("[shop-sales] startSale(): branchId and cashierId are required.");
            const saleId = this.#generateId("sale");
            const sale = {
                id: saleId, branchId, cashierId, customerId, lineItems: [], payments: [],
                status: "DRAFT", receiptSerial: null, createdAt: new Date().toISOString(), completedAt: null
            };
            this.#sales.set(saleId, sale);
            this.#diagnostics.salesStarted++;
            this.#logAudit("SALE_STARTED", `${saleId} at ${branchId} by ${cashierId}`);
            this.emit("sale:started", { saleId });
            return this.#deepClone(sale);
        }

        #requireDraftSale(saleId) {
            const sale = this.#sales.get(saleId);
            if (!sale) throw new Error(`[shop-sales] unknown saleId "${saleId}".`);
            if (sale.status !== "DRAFT") throw new Error(`[shop-sales] sale "${saleId}" is not editable (status: ${sale.status}).`);
            return sale;
        }

        /**
         * addLineItem(saleId, {productId, quantity, discount})
         *   Real price comes from shop-product — never duplicated or
         *   guessed here. Real availability is checked against
         *   shop-inventory before the line is added; this does not
         *   reserve stock (Phase 3 lists no reservation step for cart
         *   add — reservation, if wanted, is a real future addition, not
         *   assumed here).
         */
        addLineItem(saleId, rawInput = {}) {
            const sale = this.#requireDraftSale(saleId);
            const { productId, discount = 0 } = sanitizeObject(rawInput);
            const quantity = Number(rawInput.quantity);
            if (!productId || !Number.isFinite(quantity) || quantity <= 0) throw new TypeError("[shop-sales] addLineItem(): productId and a positive quantity are required.");

            const productCoordinator = window.CozyOS.ShopProduct;
            if (!productCoordinator) throw new Error("[shop-sales] addLineItem(): shop-product is not connected — cannot price this line item.");
            const product = productCoordinator.getProduct(productId);
            if (!product) throw new Error(`[shop-sales] addLineItem(): unknown productId "${productId}".`);
            if (product.status !== "ACTIVE") throw new Error(`[shop-sales] addLineItem(): product "${productId}" is not ACTIVE (status: ${product.status}).`);

            const inventoryCoordinator = window.CozyOS.ShopInventory;
            if (inventoryCoordinator) {
                const available = inventoryCoordinator.getAvailableStock(productId, sale.branchId);
                if (available < quantity) throw new Error(`[shop-sales] addLineItem(): insufficient stock for "${productId}" at ${sale.branchId} (available: ${available}, requested: ${quantity}).`);
            }

            const unitPrice = product.retailPrice ?? 0;
            const lineDiscountValue = Number(discount) || 0;
            const lineSubtotal = unitPrice * quantity;
            const lineDiscount = Math.min(lineDiscountValue, lineSubtotal);
            const lineTax = 0; // real tax calculation depends on taxCategory rules not yet defined — honestly zero rather than guessed
            const lineCost = (product.costPrice ?? 0) * quantity;
            const lineProfit = (lineSubtotal - lineDiscount) - lineCost;

            const lineItem = { productId, quantity, unitPrice, lineSubtotal, lineDiscount, lineTax, lineProfit, lineTotal: lineSubtotal - lineDiscount + lineTax };
            sale.lineItems.push(lineItem);
            this.emit("sale:line_item_added", { saleId, productId, quantity });
            return this.#deepClone({ ...sale, ...this.#computeTotals(sale) });
        }

        applyDiscount(saleId, rawInput = {}) {
            const sale = this.#requireDraftSale(saleId);
            const { type, reason, authorizedBy } = sanitizeObject(rawInput);
            const value = Number(rawInput.value);
            if (!Number.isFinite(value) || value < 0) throw new TypeError("[shop-sales] applyDiscount(): value must be a non-negative number.");
            if (!reason || !authorizedBy) throw new TypeError("[shop-sales] applyDiscount(): reason and authorizedBy are required.");

            const totals = this.#computeTotals(sale);
            const discountAmount = type === "percentage" ? totals.subtotal * (value / 100) : value;
            sale.saleDiscount = { type, value, amount: Math.min(discountAmount, totals.subtotal), reason, authorizedBy };
            this.#logAudit("DISCOUNT_APPLIED", `${saleId}: ${type} ${value} by ${authorizedBy} (${reason})`);
            this.emit("sale:discount_applied", { saleId, discountAmount: sale.saleDiscount.amount });
            return this.#deepClone({ ...sale, ...this.#computeTotals(sale) });
        }

        /**
         * completeSale(saleId, paymentDetails)
         *   Calls and awaits shop-payments.process()/processMixedPayment()
         *   — a real public-API call, per Phase 3's explicit exception to
         *   the events-only rule. A sale is never marked COMPLETED before
         *   its payment outcome is known; stock is only decremented after
         *   payment genuinely succeeds.
         */
        async completeSale(saleId, paymentDetails) {
            const sale = this.#requireDraftSale(saleId);
            if (sale.lineItems.length === 0) throw new Error(`[shop-sales] completeSale(): sale "${saleId}" has no line items.`);

            const payments = window.CozyOS.ShopPayments;
            if (!payments) throw new Error("[shop-sales] completeSale(): shop-payments is not connected — cannot process payment.");

            const totals = this.#computeTotals(sale);
            const grandTotal = totals.grandTotal - (sale.saleDiscount?.amount || 0);
            sale.status = "PAYMENT_PENDING";

            const isMixed = Array.isArray(paymentDetails);
            const paymentResult = isMixed
                ? await payments.processMixedPayment(saleId, paymentDetails)
                : await payments.process(saleId, { ...paymentDetails, amount: paymentDetails.amount ?? grandTotal });

            const succeeded = isMixed ? paymentResult.allSucceeded : paymentResult.success;
            if (!succeeded) {
                sale.status = "PAYMENT_FAILED";
                this.#diagnostics.salesFailed++;
                this.#logAudit("SALE_PAYMENT_FAILED", `${saleId}: ${JSON.stringify(paymentResult).slice(0, 200)}`);
                this.emit("sale:payment_failed", { saleId, paymentResult });
                return this.#deepClone({ ...sale, ...totals, grandTotal, paymentResult });
            }

            const inventory = window.CozyOS.ShopInventory;
            if (inventory) {
                for (const item of sale.lineItems) {
                    inventory.recordStockMovement({ productId: item.productId, branchId: sale.branchId, type: "sold", quantity: item.quantity, reference: saleId });
                }
            }

            sale.status = "COMPLETED";
            sale.completedAt = new Date().toISOString();
            sale.receiptSerial = this.#generateId("rcpt");
            this.#diagnostics.salesCompleted++;
            this.#logAudit("SALE_COMPLETED", `${saleId}: grand total ${grandTotal}`);
            this.emit("sale:completed", { saleId, grandTotal, receiptSerial: sale.receiptSerial });
            return this.#deepClone({ ...sale, ...totals, grandTotal, paymentResult });
        }

        cancelSale(saleId, reason) {
            const sale = this.#sales.get(saleId);
            if (!sale) throw new Error(`[shop-sales] unknown saleId "${saleId}".`);
            if (sale.status === "COMPLETED") throw new Error(`[shop-sales] cancelSale(): sale "${saleId}" is already completed — use requestRefund() instead.`);
            sale.status = "CANCELLED";
            this.#diagnostics.salesCancelled++;
            this.#logAudit("SALE_CANCELLED", `${saleId}: ${this.#escapeHtml(reason || "no reason given")}`);
            this.emit("sale:cancelled", { saleId, reason });
            return this.#deepClone(sale);
        }

        /**
         * requestRefund(saleId, {paymentId, amount, reason})
         *   Refunds belong to shop-payments. This only records the request
         *   against the sale and delegates the real money movement.
         */
        async requestRefund(saleId, { paymentId, amount, reason } = {}) {
            const sale = this.#sales.get(saleId);
            if (!sale) throw new Error(`[shop-sales] unknown saleId "${saleId}".`);
            if (sale.status !== "COMPLETED") throw new Error(`[shop-sales] requestRefund(): sale "${saleId}" is not completed.`);
            const payments = window.CozyOS.ShopPayments;
            if (!payments) throw new Error("[shop-sales] requestRefund(): shop-payments is not connected.");

            this.#diagnostics.refundRequestsRecorded++;
            this.#logAudit("REFUND_REQUESTED", `${saleId}: paymentId=${paymentId}, amount=${amount}`);
            const refundResult = await payments.refund(paymentId, { amount, reason });
            this.emit("sale:refund_requested", { saleId, paymentId, refundResult });
            return refundResult;
        }

        /**
         * generateReceipt(saleId)
         *   Real receipt data compiled from this sale plus its real
         *   payments (fetched from shop-payments, never duplicated
         *   locally) — the actual HTML rendering happens in
         *   cozy-receipt-template.html, not here.
         */
        generateReceipt(saleId) {
            const sale = this.#sales.get(saleId);
            if (!sale) throw new Error(`[shop-sales] unknown saleId "${saleId}".`);
            if (sale.status !== "COMPLETED") throw new Error(`[shop-sales] generateReceipt(): sale "${saleId}" is not completed.`);
            const payments = window.CozyOS.ShopPayments;
            const salePayments = payments ? payments.listPaymentsForSale(saleId) : [];
            const totals = this.#computeTotals(sale);
            return this.#deepClone({ ...sale, ...totals, grandTotal: totals.grandTotal - (sale.saleDiscount?.amount || 0), payments: salePayments });
        }

        getSale(saleId) { const sale = this.#sales.get(saleId); return sale ? this.#deepClone({ ...sale, ...this.#computeTotals(sale) }) : null; }

        /** exportSnapshot() — real sale ledger export. */
        exportSnapshot() {
            return this.#deepClone({ version: SHOP_SALES_VERSION, exportedAt: new Date().toISOString(), sales: Array.from(this.#sales.entries()) });
        }

        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.sales)) throw new TypeError("[shop-sales] importSnapshot(): snapshot.sales array is required.");
            if (mergeStrategy === "replace") this.#sales.clear();
            for (const [id, sale] of snapshot.sales) this.#sales.set(id, this.#deepClone(sale));
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.sales.length} sale(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.sales.length, mergeStrategy };
        }

        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_SALES_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_SALES_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_SALES_VERSION, ...this.#diagnostics, totalSales: this.#sales.size, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopSales && typeof window.CozyOS.ShopSales.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopSales.getVersion();
        if (existingVersion !== SHOP_SALES_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-sales existing v${existingVersion} conflicts with load target v${SHOP_SALES_VERSION}.`);
        return;
    }

    const engineInstance = new ShopSalesEngine();
    window.CozyOS.ShopSales = engineInstance;

    const manifest = {
        id: "shop-sales",
        name: "ShopOS Sales",
        version: SHOP_SALES_VERSION,
        description: "Sale lifecycle, cart, discounts, completion/cancellation, refund requests, receipt-data generation. Never processes payment providers directly.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopProduct", "window.CozyOS.ShopInventory", "window.CozyOS.ShopPayments"] }
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
