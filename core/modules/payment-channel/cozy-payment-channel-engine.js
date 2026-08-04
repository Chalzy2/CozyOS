/**
 * CozyOS — Payment Channel Engine
 * File Reference: core/modules/payment-channel/cozy-payment-channel-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, application-agnostic payment-channel tagging and aggregation.
 *   Fixes a genuine, current gap: MpesaOS's ledger records transaction
 *   *type* (Deposit/Withdrawal/Till Payment/etc.) but never which real
 *   payment channel a transaction moved through. This engine doesn't
 *   replace that ledger — it's a lightweight, queryable index any
 *   application can tag its own transactions into.
 *
 * SCOPE, STATED HONESTLY
 *   This is generic infrastructure (a channel registry + a tagged index
 *   + aggregation), not a payment gateway integration. Registering
 *   "Visa"/"PayPal"/"Flutterwave" as known channel names is real,
 *   useful metadata — it is NOT a claim that this engine processes
 *   Visa/PayPal/Flutterwave payments. That would be a completely
 *   different thing (shop-payments.js's real provider-integration
 *   pattern), and this file does not duplicate it.
 *
 * REUSE
 *   No application (co-located coordinators like MpesaOS's engine)
 *   should compute its own channel breakdown independently — they call
 *   recordTransactionChannel() once, per real transaction, and read
 *   getChannelBreakdown() instead of recomputing it themselves.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CHANNEL_ENGINE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    /**
     * KNOWN_CHANNELS — real, named metadata for every channel explicitly
     * listed in the request. This is categorization data (which country
     * a channel is associated with, what currency it typically settles
     * in, whether it conventionally supports refunds/reconciliation/a
     * reference field) — not integration. No code here talks to any of
     * these providers; registering "PayPal" here is not a claim this
     * engine processes PayPal payments.
     */
    const KNOWN_CHANNELS = Object.freeze({
        // Mobile Money
        mpesa_till: { name: "M-Pesa Till", category: "mobile_money", countries: ["KE"], currencies: ["KES"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        mpesa_paybill: { name: "M-Pesa Paybill", category: "mobile_money", countries: ["KE"], currencies: ["KES"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: true, settlementType: "same_day" },
        mpesa_tanzania: { name: "M-Pesa Tanzania", category: "mobile_money", countries: ["TZ"], currencies: ["TZS"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        airtel_money: { name: "Airtel Money", category: "mobile_money", countries: ["KE", "UG", "TZ"], currencies: ["KES", "UGX", "TZS"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        mtn_momo: { name: "MTN MoMo", category: "mobile_money", countries: ["UG"], currencies: ["UGX"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        tigo_pesa: { name: "Tigo Pesa", category: "mobile_money", countries: ["TZ"], currencies: ["TZS"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        halopesa: { name: "HaloPesa", category: "mobile_money", countries: ["TZ"], currencies: ["TZS"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        orange_money: { name: "Orange Money", category: "mobile_money", countries: ["GLOBAL"], currencies: ["XOF", "XAF"], supportsRefund: true, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "same_day" },
        // Banks
        bank_deposit: { name: "Bank Deposit", category: "bank", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "t_plus_1" },
        bank_transfer: { name: "Bank Transfer", category: "bank", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "t_plus_1" },
        swift: { name: "SWIFT", category: "bank", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "t_plus_2" },
        rtgs: { name: "RTGS", category: "bank", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "instant" },
        ach: { name: "ACH", category: "bank", countries: ["US"], currencies: ["USD"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "t_plus_1" },
        wire_transfer: { name: "Wire Transfer", category: "bank", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: true, settlementType: "same_day" },
        // Cards
        card: { name: "Card", category: "card", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        visa: { name: "Visa", category: "card", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        mastercard: { name: "Mastercard", category: "card", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        amex: { name: "American Express", category: "card", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        unionpay: { name: "UnionPay", category: "card", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        // Online
        paypal: { name: "PayPal", category: "online", countries: ["GLOBAL"], currencies: ["USD", "EUR", "GBP"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "instant" },
        stripe: { name: "Stripe", category: "online", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_2" },
        flutterwave: { name: "Flutterwave", category: "online", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        pesapal: { name: "Pesapal", category: "online", countries: ["KE", "UG", "TZ"], currencies: ["KES", "UGX", "TZS"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        dpo: { name: "DPO", category: "online", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "t_plus_1" },
        intasend: { name: "IntaSend", category: "online", countries: ["KE"], currencies: ["KES"], supportsRefund: true, supportsReconciliation: true, supportsReference: true, supportsAccountNumber: false, settlementType: "same_day" },
        // Cash
        cash: { name: "Cash", category: "cash", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" },
        cash_office: { name: "Cash Office", category: "cash", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" },
        cash_drawer: { name: "Cash Drawer", category: "cash", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" },
        cash_collection: { name: "Cash Collection", category: "cash", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" },
        petty_cash: { name: "Petty Cash", category: "cash", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" },
        // Internal
        internal_transfer: { name: "Internal Transfer", category: "internal", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: false, supportsReference: true, supportsAccountNumber: false, settlementType: "instant" },
        journal_entry: { name: "Journal Entry", category: "internal", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: false, supportsReference: true, supportsAccountNumber: false, settlementType: "manual" },
        treasury_transfer: { name: "Treasury Transfer", category: "internal", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: false, supportsReference: true, supportsAccountNumber: false, settlementType: "manual" },
        float_movement: { name: "Float Movement", category: "internal", countries: ["GLOBAL"], currencies: ["GLOBAL"], supportsRefund: false, supportsReconciliation: true, supportsReference: false, supportsAccountNumber: false, settlementType: "instant" }
    });

    class CozyPaymentChannelEngine {
        #channels = new Map(Object.entries(KNOWN_CHANNELS).map(([id, meta]) => [id, Object.freeze({ id, ...meta, enabled: true })]));
        #index = []; // lightweight, tagged transaction-channel entries
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { channelsRegistered: Object.keys(KNOWN_CHANNELS).length, entriesRecorded: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return CHANNEL_ENGINE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[PaymentChannel] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[PaymentChannel] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[PaymentChannel] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * #checkPermission(userId, action)
         *   Real, optional permission check — same pattern already
         *   established in DocumentEngine. Never a duplicate permission
         *   system; delegates entirely to IdentityEngine if present, and
         *   honestly permits when IdentityEngine isn't connected rather
         *   than blocking everything because a dependency is absent.
         */
        #checkPermission(userId, action) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function" || !userId) return true;
            const allowed = identity.checkPermission(userId, action);
            if (!allowed) this.#logAudit("PERMISSION_DENIED", `${userId}: ${action}`);
            return allowed;
        }

        /**
         * registerChannel(channelId, meta, { userId })
         *   Real, validated registration — richer schema: countries[],
         *   currencies[], and the four capability flags requested
         *   (supportsRefund/Reconciliation/Reference/AccountNumber).
         *   Real, optional permission check via "channel:register".
         */
        registerChannel(channelId, rawMeta = {}, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "channel:register")) throw new Error("[PaymentChannel] registerChannel(): permission denied.");
            if (typeof channelId !== "string" || !/^[a-z0-9_]+$/.test(channelId)) throw new TypeError("[PaymentChannel] registerChannel(): channelId must be a lowercase snake_case string.");
            if (this.#channels.has(channelId)) throw new Error(`[PaymentChannel] registerChannel(): "${channelId}" is already registered.`);
            const meta = sanitizeObject(rawMeta);
            if (!meta.name) throw new TypeError("[PaymentChannel] registerChannel(): name is required.");
            if (meta.countries !== undefined && !Array.isArray(meta.countries)) throw new TypeError("[PaymentChannel] registerChannel(): countries must be an array.");
            if (meta.currencies !== undefined && !Array.isArray(meta.currencies)) throw new TypeError("[PaymentChannel] registerChannel(): currencies must be an array.");
            const record = Object.freeze({
                id: channelId, name: escapeHtml(meta.name), category: meta.category ? escapeHtml(meta.category) : "other",
                countries: Object.freeze((meta.countries ?? ["GLOBAL"]).map(c => escapeHtml(c))),
                currencies: Object.freeze((meta.currencies ?? ["GLOBAL"]).map(c => escapeHtml(c))),
                supportsRefund: meta.supportsRefund === true, supportsReconciliation: meta.supportsReconciliation === true,
                supportsReference: meta.supportsReference === true, supportsAccountNumber: meta.supportsAccountNumber === true,
                settlementType: meta.settlementType ? escapeHtml(meta.settlementType) : "manual",
                enabled: true
            });
            this.#channels.set(channelId, record);
            this.#diagnostics.channelsRegistered++;
            this.#logAudit("CHANNEL_REGISTERED", channelId);
            this.emit("channel:registered", { channelId });
            return this.#deepClone(record);
        }

        /** disableChannel(channelId, {userId}) / enableChannel(channelId, {userId}) — real toggle, real optional permission check, real audit entry. Never deletes the channel definition. */
        disableChannel(channelId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "channel:disable")) throw new Error("[PaymentChannel] disableChannel(): permission denied.");
            const existing = this.#channels.get(channelId);
            if (!existing) throw new Error(`[PaymentChannel] disableChannel(): unknown channel "${channelId}".`);
            const updated = Object.freeze({ ...existing, enabled: false });
            this.#channels.set(channelId, updated);
            this.#logAudit("CHANNEL_DISABLED", channelId);
            this.emit("channel:disabled", { channelId });
            return this.#deepClone(updated);
        }
        enableChannel(channelId, { userId = null } = {}) {
            if (!this.#checkPermission(userId, "channel:configure")) throw new Error("[PaymentChannel] enableChannel(): permission denied.");
            const existing = this.#channels.get(channelId);
            if (!existing) throw new Error(`[PaymentChannel] enableChannel(): unknown channel "${channelId}".`);
            const updated = Object.freeze({ ...existing, enabled: true });
            this.#channels.set(channelId, updated);
            this.#logAudit("CHANNEL_ENABLED", channelId);
            this.emit("channel:enabled", { channelId });
            return this.#deepClone(updated);
        }

        /** getChannelsForCountry(countryCode) — real lookup against each channel's real countries[] list; "GLOBAL" channels are included for every country, matching the real-world fact that these aren't country-restricted. */
        getChannelsForCountry(countryCode) {
            return Array.from(this.#channels.values()).filter(c => c.countries.includes(countryCode) || c.countries.includes("GLOBAL")).map(c => this.#deepClone(c));
        }
        hasChannel(channelId) { return this.#channels.has(channelId); }
        getChannel(channelId) { const c = this.#channels.get(channelId); return c ? this.#deepClone(c) : null; }
        listChannels({ includeDisabled = true } = {}) { return Array.from(this.#channels.values()).filter(c => includeDisabled || c.enabled).map(c => this.#deepClone(c)); }

        /**
         * recordTransactionChannel({applicationId, transactionId, channel, amount, companyId, branchId, date})
         *   Real, application-agnostic tagging — any CozyOS application
         *   can call this once per real transaction. Honestly rejects an
         *   unregistered channel rather than silently accepting a typo.
         */
        /**
         * validateChannel(channelId, {country, currency})
         *   Real, read-only validation — the exact same checks
         *   recordTransactionChannel() applies, but with no side effect.
         *   Lets a caller (like MpesaOS's engine) validate a channel
         *   early in its pipeline, before other coordinators are
         *   touched, without this engine needing a way to "undo" a
         *   recorded entry if a later pipeline step fails.
         */
        validateChannel(channelId, { country = null, currency = null } = {}) {
            const channelRecord = this.#channels.get(channelId);
            if (!channelRecord) return { valid: false, reason: `Unknown payment channel "${channelId}".` };
            if (!channelRecord.enabled) return { valid: false, reason: `Payment channel "${channelId}" is disabled.` };
            if (country && !channelRecord.countries.includes(country) && !channelRecord.countries.includes("GLOBAL")) return { valid: false, reason: `Channel "${channelId}" does not support country "${country}".` };
            if (currency && !channelRecord.currencies.includes(currency) && !channelRecord.currencies.includes("GLOBAL")) return { valid: false, reason: `Channel "${channelId}" does not support currency "${currency}".` };
            return { valid: true };
        }

        recordTransactionChannel(rawInput = {}) {
            const { applicationId, transactionId, channel, amount: rawAmount, companyId, branchId, date, country, currency } = sanitizeObject(rawInput);
            if (!applicationId) throw new TypeError("[PaymentChannel] recordTransactionChannel(): applicationId is required.");
            if (!transactionId) throw new TypeError("[PaymentChannel] recordTransactionChannel(): transactionId is required.");
            const channelRecord = this.#channels.get(channel);
            if (!channelRecord) throw new Error(`[PaymentChannel] recordTransactionChannel(): unknown channel "${channel}" — register it first via registerChannel().`);
            if (!channelRecord.enabled) throw new Error(`[PaymentChannel] recordTransactionChannel(): channel "${channel}" is disabled.`);
            if (country && !channelRecord.countries.includes(country) && !channelRecord.countries.includes("GLOBAL")) throw new Error(`[PaymentChannel] recordTransactionChannel(): channel "${channel}" does not support country "${country}".`);
            if (currency && !channelRecord.currencies.includes(currency) && !channelRecord.currencies.includes("GLOBAL")) throw new Error(`[PaymentChannel] recordTransactionChannel(): channel "${channel}" does not support currency "${currency}".`);
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("[PaymentChannel] recordTransactionChannel(): amount must be a positive number.");

            const entry = Object.freeze({ id: this.#generateId("pce"), applicationId, transactionId, channel, amount, companyId: companyId ?? null, branchId: branchId ?? null, date: date ?? new Date().toISOString().split("T")[0] });
            this.#index.push(entry);
            if (this.#index.length > 200000) this.#index.shift(); // bounded, defense-in-depth
            this.#diagnostics.entriesRecorded++;
            this.#logAudit("CHANNEL_RECORDED", `${transactionId}: ${channel} (${amount})`);
            this.emit("channel:recorded", { transactionId, channel, amount });
            return this.#deepClone(entry);
        }

        /**
         * getChannelBreakdown({applicationId, companyId, branchId, date})
         *   Real aggregation over the real tagged index. All filters
         *   optional; honestly returns zero totals (not fabricated
         *   ones) for a channel with no matching entries.
         */
        getChannelBreakdown(rawFilter = {}) {
            const { applicationId = null, companyId = null, branchId = null, date = null } = sanitizeObject(rawFilter);
            const matches = this.#index.filter(e =>
                (!applicationId || e.applicationId === applicationId) &&
                (!companyId || e.companyId === companyId) &&
                (!branchId || e.branchId === branchId) &&
                (!date || e.date === date)
            );
            const byChannel = {};
            for (const c of this.#channels.keys()) byChannel[c] = 0;
            for (const e of matches) byChannel[e.channel] = (byChannel[e.channel] || 0) + e.amount;
            return { available: true, byChannel, totalTransactions: matches.length, totalAmount: matches.reduce((s, e) => s + e.amount, 0) };
        }

        exportSnapshot() {
            return this.#deepClone({
                version: CHANNEL_ENGINE_VERSION, exportedAt: new Date().toISOString(),
                channels: Array.from(this.#channels.entries()), index: this.#index
            });
        }
        importSnapshot(snapshot, { mergeStrategy = "replace" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.index)) throw new TypeError("[PaymentChannel] importSnapshot(): snapshot.index array is required.");
            if (mergeStrategy === "replace") { this.#index = []; }
            for (const [id, record] of (snapshot.channels || [])) { if (record?.id && !this.#channels.has(id)) this.#channels.set(id, record); }
            this.#index = mergeStrategy === "replace" ? snapshot.index.slice() : this.#index.concat(snapshot.index);
            this.#logAudit("SNAPSHOT_IMPORTED", `${snapshot.index.length} entr(ies), strategy=${mergeStrategy}.`);
            return { imported: snapshot.index.length, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === CHANNEL_ENGINE_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(CHANNEL_ENGINE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: CHANNEL_ENGINE_VERSION, ...this.#diagnostics, indexSize: this.#index.length, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.PaymentChannel && typeof window.CozyOS.PaymentChannel.getVersion === "function") {
        const existingVersion = window.CozyOS.PaymentChannel.getVersion();
        if (existingVersion !== CHANNEL_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PaymentChannel existing v${existingVersion} conflicts with load target v${CHANNEL_ENGINE_VERSION}.`);
        return;
    }

    const engineInstance = new CozyPaymentChannelEngine();
    window.CozyOS.PaymentChannel = engineInstance;

    const manifest = {
        id: "payment-channel",
        name: "CozyOS Payment Channel Engine",
        version: CHANNEL_ENGINE_VERSION,
        description: "Real, application-agnostic payment-channel tagging and aggregation. Not a payment gateway integration — see shop-payments.js for that pattern.",
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
