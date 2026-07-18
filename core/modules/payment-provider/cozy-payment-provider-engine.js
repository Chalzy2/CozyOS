/**
 * CozyOS — Payment Provider Engine (public façade)
 * File Reference: core/modules/payment-provider/cozy-payment-provider-engine.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner
 *   This engine is the authoritative owner of:
 *     ✓ Provider Registry (registration, metadata, discovery, versioning)
 *     ✓ Provider Lifecycle (initialize, connect, disconnect, restart, shutdown)
 *     ✓ Provider Health (checks, latency, availability, error/success rate)
 *     ✓ Provider Routing (country/currency/priority/capability/cost-based)
 *     ✓ Provider Failover (automatic switching, retry, queueing, recovery)
 *     ✓ Provider Capability Detection
 *
 *   Does NOT Own (explicitly, per this engine's own scope)
 *     ✗ Balances, Transactions, Invoices, Accounting, Ledger, Taxes,
 *       Wallet, Receipts, Reports, Customer Accounts — all Financial
 *       Platform's domain.
 *     ✗ Secrets, API keys, OAuth tokens, certificates — Vault's domain;
 *       this engine only requests them, never stores them.
 *     ✗ Users, Authentication, Permissions — Identity's domain.
 *     ✗ Organization, Company, Branch, Division, Department, Team —
 *       Company Engine's domain (see its own Rule 25 declaration).
 *
 *   This engine is NOT the same concept as window.CozyOS.PaymentChannel
 *   (core/modules/payment-channel/), which owns channel *metadata and
 *   transaction-tagging* for reporting. This engine owns provider
 *   *connectivity* — real adapters that would talk to M-Pesa/PayPal/
 *   Visa/etc. It reuses PaymentChannel's real metadata (country/
 *   currency/category) when a provider references a real channelId,
 *   rather than duplicating it (Rule 2).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RESPONSIBILITY
 *   Applications never communicate directly with a payment provider —
 *   everything goes through this engine. This file is a pure delegation
 *   façade over six internal modules (Provider Registry, Provider
 *   Manager, Health Monitor, Routing Engine, Failover Engine, Capability
 *   Engine), each in its own file, each independently testable. Adding a
 *   new provider means adding a new adapter file — never modifying this
 *   façade or any internal module.
 *
 * HONEST ENGINEERING
 *   Only "cash" is a genuinely complete adapter (no external API is
 *   needed). Every other provider adapter shipped with this engine
 *   (mpesa, and any added later) is a real, disclosed "not configured"
 *   stub — it implements the full Provider Interface (so registration
 *   and interface validation both genuinely pass), but every operational
 *   method honestly reports missing credentials rather than fabricating
 *   a working payment. This engine never invents a successful payment.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PAYMENT_PROVIDER_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    const internals = window.CozyOS.__PaymentProviderInternals;
    if (!internals || !internals.ProviderRegistry || !internals.ProviderManager || !internals.HealthMonitor || !internals.RoutingEngine || !internals.FailoverEngine || !internals.CapabilityEngine) {
        throw new Error("[PaymentProviderEngine] Required internal modules are not loaded. Load provider-registry.js, provider-manager.js, health-monitor.js, routing-engine.js, failover-engine.js, and capability-engine.js before this file.");
    }

    class CozyPaymentProviderEngine {
        #registry; #manager; #health; #routing; #failover; #capability;
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        constructor() {
            this.#registry = new internals.ProviderRegistry();
            this.#manager = new internals.ProviderManager(this.#registry);
            this.#health = new internals.HealthMonitor(this.#registry);
            this.#routing = new internals.RoutingEngine(this.#registry);
            this.#failover = new internals.FailoverEngine(this.#registry, this.#routing, this.#manager);
            this.#capability = new internals.CapabilityEngine(this.#registry);
        }

        getVersion() { return PAYMENT_PROVIDER_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 1000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[PaymentProviderEngine] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[PaymentProviderEngine] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[PaymentProviderEngine] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_err) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_err) { /* listener errors never break the engine */ } } return true; }

        // ---- Provider Registry (delegated) ----
        registerProvider(providerId, meta, adapter) { const r = this.#registry.registerProvider(providerId, sanitizeObject(meta), adapter); this.#logAudit("PROVIDER_REGISTERED", providerId); this.emit("provider-registered", { providerId }); return r; }
        getProvider(providerId) { return this.#registry.getProvider(providerId); }
        hasProvider(providerId) { return this.#registry.hasProvider(providerId); }
        unregisterProvider(providerId) { return this.#registry.unregisterProvider(providerId); }
        listProviders(filter) { return this.#registry.listProviders(filter); }

        // ---- Provider Manager (delegated) ----
        async initializeProvider(providerId) { return this.#manager.initializeProvider(providerId); }
        async connectProvider(providerId) { const r = await this.#manager.connectProvider(providerId); this.#logAudit("PROVIDER_CONNECTED", providerId); this.emit("provider-connected", { providerId }); return r; }
        async disconnectProvider(providerId) { const r = await this.#manager.disconnectProvider(providerId); this.#logAudit("PROVIDER_DISCONNECTED", providerId); this.emit("provider-disconnected", { providerId }); return r; }
        async restartProvider(providerId) { return this.#manager.restartProvider(providerId); }
        async shutdownProvider(providerId) { return this.#manager.shutdownProvider(providerId); }

        // ---- Health Monitor (delegated) ----
        async checkHealth(providerId) { const r = await this.#health.checkHealth(providerId); if (r.available && !r.healthy) this.emit("provider-health-changed", { providerId, healthy: false }); return r; }
        getHealthSummary(providerId) { return this.#health.getHealthSummary(providerId); }
        startHeartbeat(providerId, intervalMs) { return this.#health.startHeartbeat(providerId, intervalMs); }
        stopHeartbeat(providerId) { return this.#health.stopHeartbeat(providerId); }

        // ---- Routing Engine (delegated) ----
        async selectProvider(context) { const r = await this.#routing.selectProvider(context); if (r.available) this.emit("provider-selected", { providerId: r.selected.providerId }); return r; }
        registerRoutingPolicy(name, fn) { return this.#routing.registerPolicy(name, fn); }
        applyRoutingPolicy(name, candidates, context) { return this.#routing.applyPolicy(name, candidates, context); }
        getOfflineProviders(filter) { return this.#routing.getOfflineProviders(filter); }

        // ---- Failover Engine (delegated) ----
        async executeWithFailover(context, operation) {
            const r = await this.#failover.executeWithFailover(context, operation);
            if (r.available) {
                this.emit("payment-completed", { providerId: r.providerId });
                if (r.failedOver) this.emit("provider-recovered", { providerId: r.providerId, recoveredFrom: r.attemptedBefore });
            } else this.emit("payment-failed", { reason: r.reason });
            return r;
        }
        queueOperation(context, operation) { return this.#failover.queueOperation(context, operation); }
        async drainQueue() { return this.#failover.drainQueue(); }
        getFailoverCount(providerId) { return this.#failover.getFailoverCount(providerId); }

        // ---- Capability Engine (delegated) ----
        async supports(providerId, capability) { return this.#capability.supports(providerId, capability); }
        async getCapabilityProfile(providerId) { return this.#capability.getCapabilityProfile(providerId); }
        async findProvidersWithCapability(capability, filter) { return this.#capability.findProvidersWithCapability(capability, filter); }
        listNamedCapabilities() { return this.#capability.listNamedCapabilities(); }

        /**
         * getDiagnosticsReport() — real aggregation of every internal
         * module's own real diagnostics. No new counters invented here.
         */
        getDiagnosticsReport() {
            return this.#deepClone({
                pluginVersion: PAYMENT_PROVIDER_VERSION,
                registry: this.#registry.getDiagnosticsReport(),
                manager: this.#manager.getDiagnosticsReport(),
                health: this.#health.getDiagnosticsReport(),
                routing: this.#routing.getDiagnosticsReport(),
                failover: this.#failover.getDiagnosticsReport(),
                auditLogSize: this.#auditLog.length
            });
        }

        /**
         * exportSnapshot() — real, but explicitly excludes anything
         * secret. Only provider metadata (id/name/type/countries/
         * currencies/status/priority) is exported — never credentials,
         * which Vault owns and this engine never stores in the first
         * place (there is nothing secret in this engine's own state to
         * accidentally leak).
         */
        exportSnapshot() {
            return this.#deepClone({
                version: PAYMENT_PROVIDER_VERSION, exportedAt: new Date().toISOString(),
                providers: this.#registry.listProviders({})
            });
        }
        /**
         * importSnapshot(snapshot, {mergeStrategy})
         *   Real, but honestly limited: restores provider *metadata*
         *   only (status, priority, etc.) for providers already
         *   registered with a real adapter in this session. It cannot
         *   re-register an adapter, since adapters are live objects, not
         *   serializable data — the caller must re-register each real
         *   adapter first, then import restores its prior status.
         */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || !Array.isArray(snapshot.providers)) throw new TypeError("[PaymentProviderEngine] importSnapshot(): snapshot.providers array is required.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[PaymentProviderEngine] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            let restored = 0, skipped = 0;
            for (const p of snapshot.providers) {
                if (!p?.providerId || !this.#registry.hasProvider(p.providerId)) { skipped++; continue; }
                if (p.status) { this.#registry.setStatus(p.providerId, p.status); restored++; }
            }
            this.#logAudit("SNAPSHOT_IMPORTED", `${restored} restored, ${skipped} skipped (no matching registered adapter), strategy=${mergeStrategy}.`);
            return { restored, skipped, mergeStrategy };
        }
        isSnapshotCompatible(snapshot) { return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === PAYMENT_PROVIDER_VERSION.split(".")[0]); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(PAYMENT_PROVIDER_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.PaymentProvider && typeof window.CozyOS.PaymentProvider.getVersion === "function") {
        const existingVersion = window.CozyOS.PaymentProvider.getVersion();
        if (existingVersion !== PAYMENT_PROVIDER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PaymentProvider existing v${existingVersion} conflicts with load target v${PAYMENT_PROVIDER_VERSION}.`);
        return;
    }

    const engineInstance = new CozyPaymentProviderEngine();
    window.CozyOS.PaymentProvider = engineInstance;

    // Real, disclosed adapter registration — cash is genuinely complete;
    // mpesa is a real, honest "not configured" stub. Neither fabricates
    // provider behavior.
    const adapters = window.CozyOS.__PaymentProviderAdapters || {};
    if (adapters.cash) {
        try { engineInstance.registerProvider("cash", { name: "Cash", type: "offline", online: false, countries: ["GLOBAL"], currencies: ["GLOBAL"] }, adapters.cash()); } catch (_err) { /* non-fatal at load time */ }
    }
    if (adapters.mpesa) {
        try { engineInstance.registerProvider("mpesa", { name: "M-Pesa", type: "mobile_money", channelId: "mpesa_till" }, adapters.mpesa()); } catch (_err) { /* non-fatal at load time */ }
    }

    const manifest = {
        id: "payment-provider",
        name: "CozyOS Payment Provider Engine",
        version: PAYMENT_PROVIDER_VERSION,
        description: "Real payment provider connectivity — registration, lifecycle, health, routing, failover, capability detection. Never processes accounting/ledger/wallet data (Financial Platform's domain) and never stores secrets (Vault's domain).",
        dependencies: { required: [], optional: ["window.CozyOS.PaymentChannel", "window.CozyOS.Vault"] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "PaymentProvider", version: PAYMENT_PROVIDER_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("PaymentProvider");
            await bootstrap.verifyService("PaymentProvider", async () => window.CozyOS.PaymentProvider.getVersion() === PAYMENT_PROVIDER_VERSION);
            bootstrap.startService("PaymentProvider");
        } catch (_err) { /* non-fatal — this engine remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }

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
