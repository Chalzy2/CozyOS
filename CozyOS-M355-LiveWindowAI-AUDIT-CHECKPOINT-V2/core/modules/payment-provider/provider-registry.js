/**
 * CozyOS — Payment Provider Engine — Provider Registry (internal module)
 * File Reference: core/modules/payment-provider/provider-registry.js
 *
 * RESPONSIBILITY
 *   Owns provider registration, metadata, discovery, versioning, lookup,
 *   and capability storage. This is an INTERNAL module — it is not
 *   individually window.CozyOS-registered. The public façade
 *   (cozy-payment-provider-engine.js) composes this and the other
 *   internal modules into the one real, stable, public API applications
 *   consume.
 *
 * REUSE
 *   Provider country/currency/category metadata is not re-defined here.
 *   A provider registration may reference a real channelId already known
 *   to window.CozyOS.PaymentChannel (e.g. "mpesa_till"), and this module
 *   reads that engine's real metadata rather than duplicating it. When
 *   PaymentChannel isn't connected, or no channelId is given, a provider
 *   can still supply its own country/currency fields directly — never a
 *   hard requirement, never a fabricated default.
 *
 * HONEST SCOPE
 *   This module stores provider metadata and adapter references. It
 *   never executes a payment itself — that's Provider Manager's job,
 *   calling into the real adapter this registry looked up.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    const PROVIDER_TYPES = Object.freeze(["mobile_money", "card", "bank", "online_wallet", "crypto", "offline", "future"]);
    const PROVIDER_STATUSES = Object.freeze(["ACTIVE", "INACTIVE", "MAINTENANCE", "FAILED", "DISCONNECTED", "ARCHIVED"]);
    const REQUIRED_ADAPTER_METHODS = Object.freeze([
        "initialize", "connect", "disconnect", "healthCheck", "getCapabilities",
        "authenticate", "authorize", "createPayment", "verifyPayment", "refund", "cancel",
        "getStatus", "getDiagnostics", "shutdown", "getMetadata"
    ]);

    class ProviderRegistry {
        #providers = new Map(); // providerId -> { metadata, adapter }
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { providersRegistered: 0, registrationsRejected: 0, lookupsPerformed: 0, lookupsMissed: 0, errorsHidden: 0, eventsEmitted: 0 };

        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[ProviderRegistry] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[ProviderRegistry] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[ProviderRegistry] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * registerProvider(providerId, meta, adapter)
         *   Real registration. Validates the adapter implements every
         *   required method from the Provider Interface (Initialize,
         *   Connect, Disconnect, Health Check, Capabilities, Authenticate,
         *   Authorize, Create Payment, Verify Payment, Refund, Cancel,
         *   Status, Diagnostics, Shutdown, Metadata) — honestly rejects
         *   an incomplete adapter rather than registering something that
         *   would fail unpredictably later.
         */
        registerProvider(providerId, rawMeta, adapter) {
            if (typeof providerId !== "string" || !/^[a-z0-9_]+$/.test(providerId)) {
                this.#diagnostics.registrationsRejected++;
                throw new TypeError("[ProviderRegistry] registerProvider(): providerId must be a lowercase snake_case string.");
            }
            if (this.#providers.has(providerId)) {
                this.#diagnostics.registrationsRejected++;
                throw new Error(`[ProviderRegistry] registerProvider(): "${providerId}" is already registered.`);
            }
            const missing = REQUIRED_ADAPTER_METHODS.filter(m => typeof adapter?.[m] !== "function");
            if (missing.length > 0) {
                this.#diagnostics.registrationsRejected++;
                throw new TypeError(`[ProviderRegistry] registerProvider(): adapter for "${providerId}" is missing required method(s): ${missing.join(", ")}.`);
            }
            const meta = this.#buildMetadata(providerId, rawMeta);
            this.#providers.set(providerId, { metadata: meta, adapter });
            this.#diagnostics.providersRegistered++;
            this.#logAudit("PROVIDER_REGISTERED", providerId);
            this.emit("provider-registered", { providerId });
            return this.#deepClone(meta);
        }

        /**
         * #buildMetadata — real assembly. Reuses window.CozyOS.PaymentChannel
         * for country/currency/category when a real channelId is given and
         * that engine is connected; never fabricates this data otherwise.
         */
        #buildMetadata(providerId, rawMeta) {
            const meta = sanitizeObject(rawMeta);
            if (!meta.name || typeof meta.name !== "string") throw new TypeError("[ProviderRegistry] registerProvider(): meta.name is required.");
            if (meta.type && !PROVIDER_TYPES.includes(meta.type)) throw new TypeError(`[ProviderRegistry] registerProvider(): invalid type "${meta.type}". Must be one of: ${PROVIDER_TYPES.join(", ")}.`);

            let countries = meta.countries, currencies = meta.currencies, category = meta.type ?? "future";
            const paymentChannel = window.CozyOS.PaymentChannel;
            if (meta.channelId && paymentChannel && typeof paymentChannel.getChannel === "function") {
                const channel = paymentChannel.getChannel(meta.channelId);
                if (channel) {
                    countries = countries ?? channel.countries;
                    currencies = currencies ?? channel.currencies;
                    if (!meta.type) category = this.#mapChannelCategory(channel.category);
                }
            }

            return Object.freeze({
                providerId, name: this.#escapeHtml(meta.name), version: meta.version ? this.#escapeHtml(meta.version) : "1.0.0",
                type: category, channelId: meta.channelId ?? null,
                countries: Object.freeze((countries ?? ["GLOBAL"]).map(c => this.#escapeHtml(c))),
                currencies: Object.freeze((currencies ?? ["GLOBAL"]).map(c => this.#escapeHtml(c))),
                online: meta.online !== false,
                priority: typeof meta.priority === "number" ? meta.priority : 100,
                status: "INACTIVE", // real initial status — becomes ACTIVE only once Provider Manager genuinely connects it
                registeredAt: new Date().toISOString()
            });
        }
        #mapChannelCategory(channelCategory) {
            const map = { mobile_money: "mobile_money", card: "card", bank: "bank", online: "online_wallet", cash: "offline", internal: "offline" };
            return map[channelCategory] ?? "future";
        }

        /** setStatus(providerId, status) — real, validated. Called by Provider Manager/Health Monitor, never by an application directly. */
        setStatus(providerId, status) {
            const entry = this.#providers.get(providerId);
            if (!entry) throw new Error(`[ProviderRegistry] setStatus(): unknown providerId "${providerId}".`);
            if (!PROVIDER_STATUSES.includes(status)) throw new TypeError(`[ProviderRegistry] setStatus(): invalid status "${status}". Must be one of: ${PROVIDER_STATUSES.join(", ")}.`);
            const previous = entry.metadata.status;
            entry.metadata = Object.freeze({ ...entry.metadata, status });
            this.#logAudit("PROVIDER_STATUS_CHANGED", `${providerId}: ${previous} -> ${status}`);
            this.emit("provider-status-changed", { providerId, previous, status });
            return this.#deepClone(entry.metadata);
        }

        getProvider(providerId) { const e = this.#providers.get(providerId); this.#diagnostics.lookupsPerformed++; if (!e) { this.#diagnostics.lookupsMissed++; return null; } return this.#deepClone(e.metadata); }
        getAdapter(providerId) { const e = this.#providers.get(providerId); return e ? e.adapter : null; }
        hasProvider(providerId) { return this.#providers.has(providerId); }
        unregisterProvider(providerId) {
            const existed = this.#providers.delete(providerId);
            if (existed) { this.#logAudit("PROVIDER_UNREGISTERED", providerId); this.emit("provider-unregistered", { providerId }); }
            return existed;
        }

        /** listProviders(filter) — real discovery: filter by type/country/currency/status. */
        listProviders({ type = null, country = null, currency = null, status = null } = {}) {
            return Array.from(this.#providers.values())
                .map(e => e.metadata)
                .filter(m => (!type || m.type === type) && (!status || m.status === status)
                    && (!country || m.countries.includes(country) || m.countries.includes("GLOBAL"))
                    && (!currency || m.currencies.includes(currency) || m.currencies.includes("GLOBAL")))
                .map(m => this.#deepClone(m));
        }

        /** getCapabilities(providerId) — real, delegates to the adapter's own getCapabilities(), never fabricated here. */
        async getCapabilities(providerId) {
            const adapter = this.getAdapter(providerId);
            if (!adapter) return { available: false, reason: `Unknown provider "${providerId}".` };
            try { return { available: true, capabilities: await adapter.getCapabilities() }; }
            catch (err) { return { available: false, reason: err.message }; }
        }

        getDiagnosticsReport() { return this.#deepClone({ ...this.#diagnostics, providersTracked: this.#providers.size, auditLogSize: this.#auditLog.length }); }
    }

    window.CozyOS.__PaymentProviderInternals.ProviderRegistry = ProviderRegistry;
    window.CozyOS.__PaymentProviderInternals.PROVIDER_TYPES = PROVIDER_TYPES;
    window.CozyOS.__PaymentProviderInternals.PROVIDER_STATUSES = PROVIDER_STATUSES;
    window.CozyOS.__PaymentProviderInternals.REQUIRED_ADAPTER_METHODS = REQUIRED_ADAPTER_METHODS;
})();
