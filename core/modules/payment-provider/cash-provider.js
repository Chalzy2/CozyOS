/**
 * CozyOS — Payment Provider Engine — Cash Provider Adapter
 * File Reference: core/modules/payment-provider/providers/cash-provider.js
 *
 * RESPONSIBILITY
 *   A real, fully-working adapter — cash requires no external API,
 *   credentials, or network connection, so unlike every other provider
 *   in this directory, this one is genuinely complete, not a disclosed
 *   stub. "Create Payment" here means recording that cash was received;
 *   "Verify Payment" confirms a real recorded entry exists.
 *
 * HONEST SCOPE
 *   This adapter never touches accounting, ledgers, or receipts — that
 *   remains the Financial Platform's domain. It only tracks the real
 *   fact that a cash payment was recorded through this channel, for the
 *   Payment Provider Engine's own diagnostics/history.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderAdapters = window.CozyOS.__PaymentProviderAdapters || {};

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    function createCashProviderAdapter() {
        const payments = new Map(); // paymentId -> record
        let connected = false;

        function generateId() { return `cash_pay_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        return {
            async initialize() { return true; }, // no external setup needed
            async connect() { connected = true; return true; },
            async disconnect() { connected = false; return true; },
            async healthCheck() { return { healthy: true, detail: "Cash requires no network connection." }; },
            async getCapabilities() {
                return { payments: true, refunds: true, partialRefunds: true, authorization: false, capture: false, recurringPayments: false, subscriptions: false, mobileMoney: false, cardPayments: false, bankTransfers: false, qrPayments: false, nfcPayments: false, cryptoPayments: false };
            },
            async authenticate() { return true; }, // no auth concept for cash
            async authorize() { return true; },
            async createPayment(rawPayment = {}) {
                if (!connected) throw new Error("[CashProvider] createPayment(): not connected.");
                const payment = sanitizeObject(rawPayment);
                const amount = Number(payment.amount);
                if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[CashProvider] createPayment(): a real positive amount is required.");
                const id = generateId();
                const record = { id, amount, currency: payment.currency ?? null, status: "completed", createdAt: new Date().toISOString() };
                payments.set(id, record);
                return { ...record };
            },
            async verifyPayment(paymentId) {
                const record = payments.get(paymentId);
                return record ? { verified: true, record: { ...record } } : { verified: false, reason: "No recorded cash payment with this id." };
            },
            async refund(paymentId, amount) {
                const record = payments.get(paymentId);
                if (!record) throw new Error(`[CashProvider] refund(): unknown paymentId "${paymentId}".`);
                const refundAmount = Number(amount ?? record.amount);
                if (refundAmount > record.amount) throw new Error("[CashProvider] refund(): refund amount exceeds original payment.");
                record.status = refundAmount === record.amount ? "refunded" : "partially_refunded";
                return { refunded: true, amount: refundAmount };
            },
            async cancel(paymentId) {
                const record = payments.get(paymentId);
                if (!record) return false;
                record.status = "cancelled";
                return true;
            },
            getStatus() { return connected ? "ACTIVE" : "DISCONNECTED"; },
            getDiagnostics() { return { paymentsRecorded: payments.size, connected }; },
            async shutdown() { connected = false; return true; },
            getMetadata() { return { providerId: "cash", name: "Cash", type: "offline" }; }
        };
    }

    window.CozyOS.__PaymentProviderAdapters.cash = createCashProviderAdapter;
})();
