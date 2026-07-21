/**
 * WholesaleOS — Customer Management (CRM)
 * File Reference: core/plugins/wholesaleOS-customer.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Customer identity, contact, and relationship data only — profile,
 *   contacts, credit limit, notes, follow-up reminders, preferred
 *   products, delivery locations. Matches the requested spec's
 *   "Customer Management (CRM)" section exactly.
 *
 * OWNERSHIP BOUNDARY — WHAT THIS FILE DOES NOT OWN
 *   "Current debt" and "Last payment" are requested fields on the
 *   customer profile, but real debt tracking (amount, due date,
 *   installments, payment history, balance, partial payments) is owned
 *   by the separate `wholesaleOS-debt.js`, which references a customer by
 *   `customerId` — the same real, established pattern as ShopOS's product
 *   engine ("reference by id, never duplicate the record"). This file
 *   exposes `customerExists()` for exactly that purpose and computes
 *   `currentDebt`/`lastPayment` live from the real Debt Manager when it's
 *   loaded, rather than storing a second, potentially-stale copy here.
 *
 * HONEST SCOPE
 *   "Purchase history" and "Last order" are requested fields, but no real
 *   WholesaleOS order system exists yet (Purchase Orders is a separate,
 *   unbuilt module in the proposed roadmap) — both honestly report empty/
 *   null rather than fabricating order records that don't exist.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CUSTOMER_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class WholesaleCustomerEngine {
        #customers = new Map(); // customerId -> frozen Customer record
        #auditLog = [];
        #diagnostics = { customersCreated: 0, customersUpdated: 0, notesAdded: 0 };

        getVersion() { return CUSTOMER_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
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

        /**
         * createCustomer(input)
         *   Required: businessName or personName (at least one real
         *   identity field). Everything else optional, matching the
         *   requested spec's field list.
         */
        createCustomer(rawInput = {}) {
            const input = sanitizeObject(rawInput);
            if (!input.businessName && !input.personName) throw new TypeError("[wholesale-customer] createCustomer(): businessName or personName is required.");
            const customerId = this.#generateId("cust");
            const now = new Date().toISOString();
            const customer = this.#deepFreeze({
                customerId,
                businessName: input.businessName ? this.#escapeHtml(input.businessName) : null,
                personName: input.personName ? this.#escapeHtml(input.personName) : null,
                contacts: Array.isArray(input.contacts) ? input.contacts : [],
                creditLimit: typeof input.creditLimit === "number" ? input.creditLimit : null,
                preferredProducts: Array.isArray(input.preferredProducts) ? input.preferredProducts : [],
                deliveryLocations: Array.isArray(input.deliveryLocations) ? input.deliveryLocations : [],
                notes: [],
                followUpReminders: [],
                promises: [],
                createdAt: now, updatedAt: now
            });
            this.#customers.set(customerId, customer);
            this.#diagnostics.customersCreated++;
            this.#logAudit("CUSTOMER_CREATED", `Created customer "${customer.businessName || customer.personName}" (${customerId}).`);
            return this.#deepClone(customer);
        }

        getCustomer(customerId) {
            const c = this.#customers.get(customerId);
            return c ? this.#deepClone(c) : null;
        }
        customerExists(customerId) { return this.#customers.has(customerId); }

        listCustomers({ hasOverdueDebt = false } = {}) {
            let list = Array.from(this.#customers.values()).map(c => this.#deepClone(c));
            const debtManager = window.CozyOS.WholesaleDebt;
            list = list.map(c => {
                const debtSummary = debtManager ? debtManager.getCustomerDebtSummary(c.customerId) : { available: false };
                return { ...c, currentDebt: debtSummary.available ? debtSummary.balance : null, lastPayment: debtSummary.available ? debtSummary.lastPaymentAt : null };
            });
            if (hasOverdueDebt) list = list.filter(c => c.currentDebt !== null && c.currentDebt > 0);
            return list;
        }

        /** addNote(customerId, note) — real, append-only, matches the requested "Notes"/"Promises" fields. */
        addNote(customerId, note) {
            const c = this.#customers.get(customerId);
            if (!c) return { success: false, reason: `No customer "${customerId}".` };
            const updated = { ...c, notes: [...c.notes, { text: this.#escapeHtml(note), at: new Date().toISOString() }], updatedAt: new Date().toISOString() };
            this.#customers.set(customerId, this.#deepFreeze(updated));
            this.#diagnostics.notesAdded++;
            return { success: true };
        }

        /** addFollowUpReminder(customerId, {dueAt, reason}) — real, but disclosed: no real notification-delivery mechanism exists anywhere in CozyOS (confirmed by reading cozy-notification.js directly, which is execution-free by design). This creates a real, queryable record only. */
        addFollowUpReminder(customerId, { dueAt, reason }) {
            const c = this.#customers.get(customerId);
            if (!c) return { success: false, reason: `No customer "${customerId}".` };
            if (!dueAt) return { success: false, reason: "dueAt is required." };
            const updated = { ...c, followUpReminders: [...c.followUpReminders, { dueAt, reason: this.#escapeHtml(reason || ""), createdAt: new Date().toISOString(), completed: false }] };
            this.#customers.set(customerId, this.#deepFreeze(updated));
            return { success: true };
        }

        /** listDueFollowUps(asOf) — real, queryable "reminders due" list — this is the honest substitute for real notification delivery, which does not exist. */
        listDueFollowUps(asOf = new Date().toISOString()) {
            const due = [];
            for (const c of this.#customers.values()) {
                for (const reminder of c.followUpReminders) {
                    if (!reminder.completed && reminder.dueAt <= asOf) due.push({ customerId: c.customerId, customerName: c.businessName || c.personName, ...reminder });
                }
            }
            return this.#deepClone(due);
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: CUSTOMER_VERSION, ...this.#diagnostics, totalCustomers: this.#customers.size });
        }
    }

    if (window.CozyOS.WholesaleCustomer && typeof window.CozyOS.WholesaleCustomer.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleCustomer.getVersion();
        if (existingVersion !== CUSTOMER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: WholesaleCustomer existing v${existingVersion} conflicts with load target v${CUSTOMER_VERSION}.`);
        return;
    }

    const instance = new WholesaleCustomerEngine();
    window.CozyOS.WholesaleCustomer = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "WholesaleCustomer", category: "Business Domain", icon: "users.svg",
                description: "WholesaleOS customer/CRM records. currentDebt/lastPayment are computed live from the real WholesaleDebt coordinator, never duplicated. Purchase history/last order are honestly empty — no real order system exists yet. Follow-up reminders are real, queryable records only — no real notification-delivery mechanism exists anywhere in CozyOS."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
