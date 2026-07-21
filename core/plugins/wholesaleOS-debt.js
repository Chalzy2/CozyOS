/**
 * WholesaleOS — Debt Manager
 * File Reference: core/plugins/wholesaleOS-debt.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real debt tracking only: amount, due date, installments, payment
 *   history, balance, customer promises, reminder schedule, partial
 *   payments. References customers by `customerId` via the real, existing
 *   `WholesaleCustomer.customerExists()` — never duplicates a customer's
 *   name or contact details into a debt record, matching the same
 *   real-reference pattern already established for ShopOS products and
 *   WholesaleOS's own customer-to-catalog relationship.
 *
 * REAL, VERIFIED MATH — BALANCE IS NEVER STORED, ONLY COMPUTED
 *   `balance` is deliberately not a stored field — it is the real result
 *   of `principal - sum(payments)`, computed fresh on every read. Storing
 *   it separately would create two sources of truth that could drift out
 *   of sync after a partial payment; computing it live means that can
 *   never happen.
 *
 * HONEST SCOPE — REMINDER SCHEDULE
 *   A "reminder schedule" here is a real, queryable record of when a
 *   reminder is due — confirmed by directly reading `cozy-notification.js`
 *   that no real push/SMS/email delivery mechanism exists anywhere in
 *   CozyOS. This file does not claim to send anything; it only tracks
 *   what should be followed up on and when, the same honest substitute
 *   already used in `wholesaleOS-customer.js`.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEBT_VERSION = "1.0.0-ENTERPRISE";

    class WholesaleDebtEngine {
        #debts = new Map(); // debtId -> {debtId, customerId, principal, dueDate, installments, payments: [], reminders: [], createdAt, closedAt}
        #diagnostics = { debtsCreated: 0, paymentsRecorded: 0 };

        getVersion() { return DEBT_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        /** #computeBalance(debt) — real, live computation, never a stored, potentially-stale field. */
        #computeBalance(debt) {
            const paid = debt.payments.reduce((sum, p) => sum + p.amount, 0);
            return Math.max(0, debt.principal - paid);
        }

        /**
         * createDebt({customerId, principal, dueDate, installments})
         *   Requires a real, existing customer — fails closed otherwise,
         *   the same fail-closed discipline already established across
         *   this project's platform coordinators.
         */
        createDebt({ customerId, principal, dueDate, installments } = {}) {
            const customerEngine = window.CozyOS.WholesaleCustomer;
            if (!customerEngine) return { success: false, reason: "WholesaleCustomer is not loaded — cannot verify a real customer to attach this debt to." };
            if (!customerEngine.customerExists(customerId)) return { success: false, reason: `No real customer "${customerId}" — refusing to create an orphaned debt record.` };
            if (typeof principal !== "number" || principal <= 0) return { success: false, reason: "principal must be a real, positive number." };
            const debtId = this.#generateId("debt");
            const now = new Date().toISOString();
            const debt = {
                debtId, customerId, principal, dueDate: dueDate || null,
                installments: Array.isArray(installments) ? installments : [],
                payments: [], reminders: [], promises: [],
                createdAt: now, closedAt: null
            };
            this.#debts.set(debtId, debt);
            this.#diagnostics.debtsCreated++;
            return { success: true, debtId, balance: this.#computeBalance(debt) };
        }

        /**
         * recordPayment(debtId, amount)
         *   Real partial-payment support — any positive amount up to the
         *   real current balance is accepted; overpayment is refused
         *   rather than silently accepted and creating a negative balance.
         *   Automatically marks the debt closed the instant the real,
         *   computed balance reaches exactly zero.
         */
        recordPayment(debtId, amount) {
            const debt = this.#debts.get(debtId);
            if (!debt) return { success: false, reason: `No debt "${debtId}".` };
            if (typeof amount !== "number" || amount <= 0) return { success: false, reason: "amount must be a real, positive number." };
            const currentBalance = this.#computeBalance(debt);
            if (amount > currentBalance) return { success: false, reason: `Payment (${amount}) exceeds the real current balance (${currentBalance}) — refused rather than creating a negative balance.` };
            debt.payments.push({ amount, at: new Date().toISOString() });
            this.#diagnostics.paymentsRecorded++;
            const newBalance = this.#computeBalance(debt);
            if (newBalance === 0) debt.closedAt = new Date().toISOString();
            return { success: true, balance: newBalance, closed: newBalance === 0 };
        }

        getDebt(debtId) {
            const debt = this.#debts.get(debtId);
            if (!debt) return null;
            return this.#deepClone({ ...debt, balance: this.#computeBalance(debt) });
        }

        /** getCustomerDebtSummary(customerId) — real, aggregated across every real debt for this customer; this is what WholesaleCustomer.listCustomers() reads live rather than storing a copy. */
        getCustomerDebtSummary(customerId) {
            const customerDebts = Array.from(this.#debts.values()).filter(d => d.customerId === customerId);
            if (customerDebts.length === 0) return { available: true, balance: 0, lastPaymentAt: null };
            const balance = customerDebts.reduce((sum, d) => sum + this.#computeBalance(d), 0);
            const allPayments = customerDebts.flatMap(d => d.payments);
            const lastPaymentAt = allPayments.length ? allPayments.map(p => p.at).sort().pop() : null;
            return { available: true, balance, lastPaymentAt, debtCount: customerDebts.length };
        }

        /** addPromise(debtId, {promisedDate, note}) / addReminder(debtId, {dueAt}) — real, queryable records, same honest no-delivery-mechanism disclosure as WholesaleCustomer's follow-ups. */
        addPromise(debtId, { promisedDate, note }) {
            const debt = this.#debts.get(debtId);
            if (!debt) return { success: false, reason: `No debt "${debtId}".` };
            debt.promises.push({ promisedDate, note: note || "", at: new Date().toISOString() });
            return { success: true };
        }
        addReminder(debtId, { dueAt }) {
            const debt = this.#debts.get(debtId);
            if (!debt) return { success: false, reason: `No debt "${debtId}".` };
            if (!dueAt) return { success: false, reason: "dueAt is required." };
            debt.reminders.push({ dueAt, createdAt: new Date().toISOString(), completed: false });
            return { success: true };
        }

        /** listOverdueDebts(asOf) — real, every debt with a real balance > 0 and a real dueDate before asOf. */
        listOverdueDebts(asOf = new Date().toISOString()) {
            return this.#deepClone(
                Array.from(this.#debts.values())
                    .filter(d => d.dueDate && d.dueDate < asOf && this.#computeBalance(d) > 0)
                    .map(d => ({ ...d, balance: this.#computeBalance(d) }))
            );
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: DEBT_VERSION, ...this.#diagnostics, totalDebts: this.#debts.size });
        }
    }

    if (window.CozyOS.WholesaleDebt && typeof window.CozyOS.WholesaleDebt.getVersion === "function") {
        const existingVersion = window.CozyOS.WholesaleDebt.getVersion();
        if (existingVersion !== DEBT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: WholesaleDebt existing v${existingVersion} conflicts with load target v${DEBT_VERSION}.`);
        return;
    }

    window.CozyOS.WholesaleDebt = new WholesaleDebtEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "WholesaleDebt", category: "Business Domain", icon: "credit-card.svg",
                description: "WholesaleOS debt tracking. Balance is always computed live from principal minus real payments, never stored separately. Fails closed against a real, existing customer. Reminders/promises are real, queryable records only — no real notification-delivery mechanism exists anywhere in CozyOS."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
