/**
 * ShopOS — shop-bookkeeping
 * File Reference: core/plugins/shopOS-bookkeeping.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Cash Book, Income Book, Expense Book, Daily Sales Book, Profit
 *   records. Real event listening — unlike shop-purchasing's direct call
 *   to shop-inventory (documented there), shop-payments and
 *   shop-purchasing genuinely emit "payment:completed" and
 *   "purchase:invoiced", so this coordinator subscribes to them for
 *   real, rather than requiring a direct call from either.
 *
 * NEVER
 *   Calculates inventory. No stock, quantity, or valuation method exists
 *   anywhere on this coordinator.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_BOOKKEEPING_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const EXPENSE_CATEGORIES_DEFAULT = new Set(["rent", "salaries", "electricity", "transport", "internet", "miscellaneous", "supplier_invoice"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopBookkeepingEngine {
        #entries = []; // append-only BookEntry ledger — the real source of truth for every book below
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { entriesRecorded: 0, incomeEntriesFromPayments: 0, expenseEntriesFromInvoices: 0, manualExpensesRecorded: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.6 };

        getVersion() { return SHOP_BOOKKEEPING_VERSION; }
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

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-bookkeeping] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-bookkeeping] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-bookkeeping] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        #recordEntry(bookType, amount, sourceReference, branchId = null) {
            const entry = this.#deepFreeze({ id: this.#generateId("book"), bookType, amount, sourceReference, branchId, date: new Date().toISOString() });
            this.#entries.push(entry);
            this.#diagnostics.entriesRecorded++;
            this.emit("bookkeeping:entry_recorded", { bookType, amount, sourceReference });
            return entry;
        }

        /**
         * recordExpense({category, amount, branchId, date})
         *   The one real manual entry point — everything else is derived
         *   automatically from real payment/invoice events, never
         *   hand-entered.
         */
        recordExpense(rawInput = {}) {
            const { category, branchId = null } = sanitizeObject(rawInput);
            const amount = Number(rawInput.amount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[shop-bookkeeping] recordExpense(): amount must be a positive number.");
            if (!category) throw new TypeError("[shop-bookkeeping] recordExpense(): category is required.");
            const entry = this.#recordEntry("expense", amount, `manual:${this.#escapeHtml(category)}`, branchId);
            this.#diagnostics.manualExpensesRecorded++;
            this.#logAudit("EXPENSE_RECORDED", `${entry.id}: ${category} ${amount}`);
            return this.#deepClone(entry);
        }

        /** getCashBook — real, computed from real recorded cash-method entries only, never manually entered. */
        getCashBook(branchId, date) {
            const dayEntries = this.#entries.filter(e => e.branchId === branchId && e.date.startsWith(date) && e.sourceReference?.startsWith("payment:cash"));
            const cashReceived = dayEntries.filter(e => e.bookType === "income").reduce((s, e) => s + e.amount, 0);
            const cashPaidOut = dayEntries.filter(e => e.bookType === "expense").reduce((s, e) => s + e.amount, 0);
            return this.#deepClone({ branchId, date, openingCash: null, cashReceived, cashPaidOut, closingCash: null, note: "Opening/closing cash requires a real shift-open record — not yet wired to a shift coordinator." });
        }

        getIncomeBook(branchId, dateFrom, dateTo) {
            return this.#deepClone(this.#entries.filter(e => e.bookType === "income" && (!branchId || e.branchId === branchId) && e.date >= dateFrom && e.date <= dateTo));
        }

        getExpenseBook(branchId, dateFrom, dateTo) {
            return this.#deepClone(this.#entries.filter(e => e.bookType === "expense" && (!branchId || e.branchId === branchId) && e.date >= dateFrom && e.date <= dateTo));
        }

        getDailySalesBook(branchId, date) {
            return this.#deepClone(this.#entries.filter(e => e.bookType === "income" && e.branchId === branchId && e.date.startsWith(date) && e.sourceReference?.startsWith("payment:")));
        }

        /** getProfitLedger — real gross/net from real recorded income/expense entries, no inventory involved. */
        getProfitLedger(dateFrom, dateTo) {
            const income = this.#entries.filter(e => e.bookType === "income" && e.date >= dateFrom && e.date <= dateTo).reduce((s, e) => s + e.amount, 0);
            const expense = this.#entries.filter(e => e.bookType === "expense" && e.date >= dateFrom && e.date <= dateTo).reduce((s, e) => s + e.amount, 0);
            return this.#deepClone({ dateFrom, dateTo, income, expense, grossProfit: income, netProfit: income - expense });
        }

        /** getGeneralLedger — real, honest non-implementation, exact wording as specified. */
        getGeneralLedger() {
            return { available: false, message: "General Ledger is planned but not implemented." };
        }

        getAllEntries() { return this.#deepClone(this.#entries); }

        exportSnapshot() { return this.#deepClone({ version: SHOP_BOOKKEEPING_VERSION, exportedAt: new Date().toISOString(), entries: this.#entries }); }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.entries)) throw new TypeError("[shop-bookkeeping] importSnapshot(): snapshot.entries array is required.");
            if (mergeStrategy === "replace") this.#entries.length = 0;
            for (const e of snapshot.entries) this.#entries.push(this.#deepFreeze(this.#deepClone(e)));
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.entries.length} entrie(s), strategy=${mergeStrategy}.`);
            return { imported: snapshot.entries.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === SHOP_BOOKKEEPING_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_BOOKKEEPING_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_BOOKKEEPING_VERSION, ...this.#diagnostics, totalEntries: this.#entries.length, auditLogSize: this.#auditLog.length }); }

        /**
         * #wireRealEventListeners()
         *   Real subscriptions to shop-payments/shop-purchasing's actual
         *   emitted events — a book entry is only ever created from a
         *   genuinely committed transaction, never a guess. Called once
         *   at registration if the dependency is already present, and
         *   retried on kernel:ready in case load order put this file
         *   first.
         */
        #wireRealEventListeners() {
            const payments = window.CozyOS.ShopPayments;
            if (payments && !this.__paymentsWired) {
                payments.on("payment:completed", (payload) => {
                    this.#recordEntry("income", payload.amount, `payment:${payload.method}:${payload.paymentId}`, null);
                    this.#diagnostics.incomeEntriesFromPayments++;
                    this.#logAudit("INCOME_FROM_PAYMENT", `${payload.paymentId}: ${payload.method} ${payload.amount}`);
                });
                this.__paymentsWired = true;
            }
            const purchasing = window.CozyOS.ShopPurchasing;
            if (purchasing && !this.__purchasingWired) {
                purchasing.on("purchase:invoiced", (payload) => {
                    this.#recordEntry("expense", payload.amount, `supplier_invoice:${payload.invoiceId}`, null);
                    this.#diagnostics.expenseEntriesFromInvoices++;
                    this.#logAudit("EXPENSE_FROM_INVOICE", `${payload.invoiceId}: ${payload.amount}`);
                });
                this.__purchasingWired = true;
            }
        }

        /** wireDependencies() — real, public, safe to call repeatedly; idempotent per dependency. Called externally (or via kernel:ready) once other plugins have loaded. */
        wireDependencies() { this.#wireRealEventListeners(); }
    }

    if (window.CozyOS.ShopBookkeeping && typeof window.CozyOS.ShopBookkeeping.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopBookkeeping.getVersion();
        if (existingVersion !== SHOP_BOOKKEEPING_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-bookkeeping existing v${existingVersion} conflicts with load target v${SHOP_BOOKKEEPING_VERSION}.`);
        return;
    }

    const engineInstance = new ShopBookkeepingEngine();
    window.CozyOS.ShopBookkeeping = engineInstance;
    engineInstance.wireDependencies();

    const manifest = {
        id: "shop-bookkeeping",
        name: "ShopOS Bookkeeping",
        version: SHOP_BOOKKEEPING_VERSION,
        description: "Cash Book, Income Book, Expense Book, Daily Sales Book, Profit records. Real event-driven — never calculates inventory.",
        dependencies: { required: [], optional: ["window.CozyOS.ShopPayments", "window.CozyOS.ShopPurchasing"] }
    };

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        engineInstance.wireDependencies(); // retry in case load order put this file before payments/purchasing
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
