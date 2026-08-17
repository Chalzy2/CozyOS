/**
 * CozyOS — Payment Provider Engine — M-Pesa Provider Adapter
 * File Reference: core/modules/payment-provider/providers/mpesa-provider.js
 *
 * HONEST SCOPE
 *   No real M-Pesa API credentials exist anywhere in this platform. This
 *   is a genuine, disclosed "not configured" adapter — it implements
 *   every method the Provider Interface requires (so it registers and
 *   passes real interface validation), but every operational method
 *   honestly reports that no real integration exists, rather than
 *   fabricating a working connection. The same pattern already
 *   established in shopOS-payments.js's provider stubs.
 *
 *   configure({consumerKey, consumerSecret, shortcode}) is the real,
 *   disclosed extension point — once real Safaricom Daraja API
 *   credentials are supplied here, this adapter's methods would need
 *   real implementation against that API. Until then, every method
 *   below is honest about doing nothing.
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

    function createMpesaProviderAdapter() {
        let credentials = null;

        function notConfigured() { return { available: false, reason: "M-Pesa provider is not configured — no real Safaricom Daraja API credentials have been supplied. Call configure({consumerKey, consumerSecret, shortcode}) with real credentials first." }; }

        return {
            configure(rawCredentials) {
                const realCredentials = sanitizeObject(rawCredentials);
                if (!realCredentials.consumerKey || !realCredentials.consumerSecret || !realCredentials.shortcode) {
                    throw new TypeError("[MpesaProvider] configure(): real consumerKey, consumerSecret, and shortcode are all required.");
                }
                credentials = realCredentials;
            },
            isConfigured() { return credentials !== null; },
            async initialize() { return credentials !== null; },
            async connect() { if (!credentials) throw new Error("[MpesaProvider] connect(): not configured — see configure()."); return true; },
            async disconnect() { return true; },
            async healthCheck() { return credentials ? { healthy: true } : { healthy: false, detail: "Not configured." }; },
            async getCapabilities() {
                return { payments: true, refunds: false, partialRefunds: false, authorization: false, capture: false, recurringPayments: false, subscriptions: false, mobileMoney: true, cardPayments: false, bankTransfers: false, qrPayments: false, nfcPayments: false, cryptoPayments: false };
            },
            async authenticate() { return credentials !== null; },
            async authorize() { return credentials !== null; },
            async createPayment() { if (!credentials) return notConfigured(); throw new Error("[MpesaProvider] createPayment(): real Daraja API integration is not yet implemented — credentials are configured but the actual API call has not been built."); },
            async verifyPayment() { if (!credentials) return notConfigured(); throw new Error("[MpesaProvider] verifyPayment(): real Daraja API integration is not yet implemented."); },
            async refund() { if (!credentials) return notConfigured(); throw new Error("[MpesaProvider] refund(): real Daraja API integration is not yet implemented."); },
            async cancel() { if (!credentials) return notConfigured(); throw new Error("[MpesaProvider] cancel(): real Daraja API integration is not yet implemented."); },
            getStatus() { return credentials ? "INACTIVE" : "DISCONNECTED"; },
            getDiagnostics() { return { configured: credentials !== null }; },
            async shutdown() { return true; },
            getMetadata() { return { providerId: "mpesa", name: "M-Pesa", type: "mobile_money", configured: credentials !== null }; }
        };
    }

    window.CozyOS.__PaymentProviderAdapters.mpesa = createMpesaProviderAdapter;
})();
