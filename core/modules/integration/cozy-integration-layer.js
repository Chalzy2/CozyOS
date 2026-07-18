/**
 * CozyOS — Platform Integration Layer
 * File Reference: core/modules/integration/cozy-integration-layer.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner
 *   This engine is the authoritative owner of:
 *     ✓ Engine discovery, lookup, and capability mapping
 *     ✓ Cross-engine dependency validation (e.g. does a user's stored
 *       companyId/branchId genuinely exist in Company Engine)
 *     ✓ Integration health (connected/disconnected/version mismatch)
 *     ✓ Cross-engine orchestration (thin coordination calls only —
 *       e.g. "fetch this secret for Payment Provider", which is just a
 *       pass-through to Vault's own real retrieveSecret())
 *
 *   Does NOT Own — and structurally cannot, since this file stores no
 *   business data of its own:
 *     ✗ Users, Authentication, Permissions — Identity's domain.
 *     ✗ Organization, Company, Branch, Division, Department, Team —
 *       Company Engine's domain.
 *     ✗ Secrets, Keys, Certificates, Tokens — Vault's domain.
 *     ✗ Payment provider connectivity — Payment Provider Engine's domain.
 *     ✗ Documents, Storage — Document Engine / Storage Provider's domain.
 *
 *   This is deliberately the thinnest engine in the platform: every
 *   method here either reads another engine's real, public state, or
 *   calls straight through to one of its real methods. There is no
 *   independent business logic, and there is no independent storage of
 *   business data.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RESPONSIBILITY
 *   Coordinates the certified engines (Identity, Company, Vault,
 *   Payment Provider, and — where present — Document Engine / Storage
 *   Provider) without moving ownership or duplicating any logic. Every
 *   validation and orchestration call here reuses the target engine's
 *   own real public API.
 *
 * HONEST ENGINEERING
 *   If an engine is not connected, every method here reports that
 *   honestly ({available: false, reason}) rather than fabricating
 *   success. This layer never assumes an engine exists — it checks
 *   window.CozyOS.<Engine> at call time, every time.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const INTEGRATION_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) { if (!input || typeof input !== "object") return {}; const clean = {}; for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; } return clean; }

    // Real dependency graph, matching the requested registry order.
    // Used only for capability discovery and health reporting — never
    // enforced as a hard load-order requirement, since every engine here
    // already degrades gracefully standalone.
    const DEPENDENCY_GRAPH = Object.freeze({
        IdentityEngine: [],
        Company: [],
        Vault: [],
        PaymentProvider: ["Vault", "Company"],
        DocumentEngine: ["Vault"],
        DocumentStorageProvider: ["Vault"]
    });

    class CozyIntegrationLayer {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { discoveries: 0, validations: 0, validationFailures: 0, orchestrationCalls: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return INTEGRATION_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) })); if (this.#auditLog.length > 2000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[IntegrationLayer] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[IntegrationLayer] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[IntegrationLayer] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { this.#diagnostics.errorsHidden++; } } return true; }

        /** #getEngine(name) — the one place engine references are looked up, always fresh, never cached (an engine could connect/disconnect between calls). */
        #getEngine(name) { return window.CozyOS?.[name] ?? null; }

        /**
         * discoverEngines()
         *   Real, live discovery — checks window.CozyOS.<Engine> presence
         *   for every engine in the dependency graph, right now. Never
         *   cached, never assumed from a prior check.
         */
        discoverEngines() {
            this.#diagnostics.discoveries++;
            const result = Object.create(null);
            for (const name of Object.keys(DEPENDENCY_GRAPH)) {
                if (name === "__proto__" || name === "constructor" || name === "prototype") continue;
                const engine = this.#getEngine(name);
                result[name] = { available: !!engine, version: engine && typeof engine.getVersion === "function" ? engine.getVersion() : null };
            }
            return { ...result };
        }
        isEngineAvailable(name) { return !!this.#getEngine(name); }
        getEngineVersion(name) { const e = this.#getEngine(name); return e && typeof e.getVersion === "function" ? e.getVersion() : null; }

        /**
         * getCapabilityMap()
         *   Real — for each connected engine, reads its real
         *   getCanonicalOwnership() if it exposes one (Identity, Company
         *   currently do), otherwise reports {available: true, owns: null}
         *   honestly rather than guessing what an engine owns.
         */
        getCapabilityMap() {
            const map = Object.create(null);
            for (const name of Object.keys(DEPENDENCY_GRAPH)) {
                if (name === "__proto__" || name === "constructor" || name === "prototype") continue;
                const engine = this.#getEngine(name);
                if (!engine) { map[name] = { available: false }; continue; }
                const ownership = typeof engine.getCanonicalOwnership === "function" ? engine.getCanonicalOwnership() : null;
                map[name] = { available: true, version: typeof engine.getVersion === "function" ? engine.getVersion() : null, ownership };
            }
            return { ...map };
        }

        /**
         * validateDependencies(engineName)
         *   Real — checks that every engine listed as a dependency in
         *   DEPENDENCY_GRAPH for the given engine is actually connected.
         *   Honestly lists which ones are missing, never assumes.
         */
        validateDependencies(engineName) {
            this.#diagnostics.validations++;
            const deps = DEPENDENCY_GRAPH[engineName];
            if (deps === undefined) return { available: false, reason: `Unknown engine "${engineName}".` };
            const missing = deps.filter(dep => !this.isEngineAvailable(dep));
            if (missing.length > 0) this.#diagnostics.validationFailures++;
            return { available: true, satisfied: missing.length === 0, missingDependencies: missing };
        }

        /**
         * validateCompanyReference(userId)
         *   Real "Identity → Company" contract validation. Reads the
         *   user's real stored reference from Identity
         *   (getCompanyReference()), then validates companyId/branchId
         *   genuinely exist via Company's own real getCompany()/
         *   listBranches() — never re-implementing Company's own
         *   existence checks.
         */
        validateCompanyReference(userId) {
            const identity = this.#getEngine("IdentityEngine");
            const company = this.#getEngine("Company");
            if (!identity) return { available: false, reason: "Identity engine is not connected." };
            if (!company) return { available: false, reason: "Company engine is not connected." };
            if (typeof identity.getCompanyReference !== "function") return { available: false, reason: "Identity engine does not expose getCompanyReference()." };

            const ref = identity.getCompanyReference(userId);
            if (!ref) return { available: false, reason: `Unknown userId "${userId}".` };
            this.#diagnostics.validations++;

            const issues = [];
            const companyExists = ref.companyId ? !!company.getCompany(ref.companyId) : true;
            if (ref.companyId && !companyExists) issues.push(`companyId "${ref.companyId}" does not exist in Company Engine.`);
            if (ref.branchId && ref.companyId && companyExists) {
                const branches = typeof company.listBranches === "function" ? company.listBranches(ref.companyId) : [];
                if (!branches.some(b => b.branchId === ref.branchId)) issues.push(`branchId "${ref.branchId}" does not exist under company "${ref.companyId}".`);
            }
            if (issues.length > 0) this.#diagnostics.validationFailures++;
            return { available: true, valid: issues.length === 0, reference: ref, issues };
        }

        /**
         * requestSecret(secretId, { requestingEngine })
         *   Real "Payment/Identity/Document/Storage → Vault" contract —
         *   a thin, audited pass-through to Vault's own real
         *   retrieveSecret(). Never stores the secret, never caches it,
         *   never duplicates Vault's own logic — this exists purely so
         *   the request is visible in this layer's own audit trail as a
         *   real cross-engine orchestration event.
         */
        async requestSecret(secretId, rawOptions = {}) {
            const { requestingEngine = "unknown" } = sanitizeObject(rawOptions);
            const vault = this.#getEngine("Vault");
            if (!vault) return { available: false, reason: "Vault engine is not connected." };
            this.#diagnostics.orchestrationCalls++;
            const result = await vault.retrieveSecret(secretId);
            this.#logAudit("SECRET_REQUESTED", `${requestingEngine} requested "${secretId}" (available=${result.available})`); // never the value
            this.emit(result.available ? "capability-added" : "dependency-failed", { requestingEngine, secretId, available: result.available });
            return result;
        }

        /**
         * getIntegrationHealth()
         *   Real, aggregated: connected/disconnected engines, and for
         *   Payment Provider/Document/Storage specifically, whether
         *   their real declared dependencies are actually satisfied
         *   right now.
         */
        getIntegrationHealth() {
            const discovery = this.discoverEngines();
            const connected = Object.entries(discovery).filter(([, v]) => v.available).map(([k]) => k);
            const disconnected = Object.entries(discovery).filter(([, v]) => !v.available).map(([k]) => k);
            const dependencyIssues = Object.create(null);
            for (const name of Object.keys(DEPENDENCY_GRAPH)) {
                if (name === "__proto__" || name === "constructor" || name === "prototype") continue;
                if (!discovery[name].available) continue;
                const v = this.validateDependencies(name);
                if (v.available && !v.satisfied) dependencyIssues[name] = v.missingDependencies;
            }
            return {
                available: true, connected, disconnected,
                dependencyIssues: { ...dependencyIssues },
                healthy: disconnected.length === 0 && Object.keys(dependencyIssues).length === 0
            };
        }

        getDiagnosticsReport() { return { pluginVersion: INTEGRATION_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }; }

        /**
         * exportSnapshot() — real, but structurally cannot contain
         * business data: only the dependency graph, live discovery
         * result, and capability map (which itself only exposes each
         * engine's own already-public getCanonicalOwnership()).
         */
        exportSnapshot() {
            return {
                version: INTEGRATION_VERSION, exportedAt: new Date().toISOString(),
                dependencyGraph: DEPENDENCY_GRAPH,
                discovery: this.discoverEngines(),
                capabilities: this.getCapabilityMap(),
                health: this.getIntegrationHealth()
            };
        }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(INTEGRATION_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Integration && typeof window.CozyOS.Integration.getVersion === "function") {
        const existingVersion = window.CozyOS.Integration.getVersion();
        if (existingVersion !== INTEGRATION_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Integration existing v${existingVersion} conflicts with load target v${INTEGRATION_VERSION}.`);
        return;
    }

    const engineInstance = new CozyIntegrationLayer();
    window.CozyOS.Integration = engineInstance;

    const manifest = {
        id: "integration",
        name: "CozyOS Platform Integration Layer",
        version: INTEGRATION_VERSION,
        description: "Pure orchestration — engine discovery, dependency validation, capability mapping, integration health. Owns no business data; every method reads or calls another engine's own real, public API.",
        dependencies: { required: [], optional: ["window.CozyOS.IdentityEngine", "window.CozyOS.Company", "window.CozyOS.Vault", "window.CozyOS.PaymentProvider"] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "Integration", version: INTEGRATION_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("Integration");
            await bootstrap.verifyService("Integration", async () => window.CozyOS.Integration.getVersion() === INTEGRATION_VERSION);
            bootstrap.startService("Integration");
        } catch (_err) { /* non-fatal — Integration remains fully functional standalone even if Kernel registration fails */ }
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
