/**
 * CozyOS Manifest Registry
 * File Reference: core/platform/manifest-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Level 3 of the four-level Discovery model (see cozy-discovery.js header):
 *     Level 1 — Runtime   : what is loaded right now
 *     Level 2 — Registry  : what has been registered (ServiceRegistry/ModuleRegistry/PluginManager)
 *     Level 3 — Manifest  : what capabilities each component DECLARES about itself   <- this file
 *     Level 4 — Health    : what's broken/duplicated/missing/unused/uncertified (health-engine.js)
 *
 *   A CozyOS Manifest is a small, self-declared description of identity,
 *   category, version, dependencies, permissions, owner, and certification
 *   status. This registry stores what components declare — it never scans,
 *   infers, or fabricates a manifest on a component's behalf (Rule 6).
 *   A component with no manifest simply has no Level 3 data; Discovery
 *   still sees it via Level 1/2.
 *
 * WHY registerManifest(), NOT A RAW window.CozyManifest GLOBAL
 *   A single `window.CozyManifest = {...}` is one shared slot — the second
 *   script to load overwrites the first component's manifest before
 *   anything reads it. Every other CozyOS registry (ServiceRegistry,
 *   ModuleRegistry) already solves this the same way: a call, not a bare
 *   global assignment. This file follows that established pattern (Rule 2 —
 *   No Duplication of a solved problem) rather than reintroducing the
 *   collision.
 *
 * MANIFEST SHAPE
 *   {
 *     id: string,                    // required, unique
 *     type: "engine"|"application"|"coordinator"|"plugin"|"service",
 *     category: string,              // e.g. "identity", "ocr", "shell"
 *     version: string,
 *     owner: string,                 // human-readable owning team/engine name
 *     dependencies: string[],        // other manifest ids this depends on
 *     permissions: string[],
 *     certificationStatus: string,   // e.g. "ENTERPRISE_CERTIFIED" | "UNCERTIFIED" — self-declared,
 *                                    // NOT a substitute for CozyCertification's own authority (Rule 18/32)
 *     capabilities: string[]         // optional, free-form
 *   }
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const MANIFEST_REGISTRY_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_TYPES = new Set(["engine", "application", "coordinator", "plugin", "service"]);

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key];
        return clean;
    }

    class CozyManifestRegistry {
        #manifests = new Map(); // id -> frozen manifest
        #auditLog = [];
        #diagnostics = { registered: 0, rejected: 0, lookups: 0 };

        getVersion() { return MANIFEST_REGISTRY_VERSION; }

        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }

        #emitPlatform(eventName, payload) {
            const registry = window.CozyOS.ServiceRegistry;
            if (registry && typeof registry.emit === "function") registry.emit(eventName, payload);
        }

        /**
         * validate(manifest) — honest validation, mirrors ModuleRegistry.validate():
         * returns {valid, errors}, never throws itself.
         */
        validate(manifest) {
            const errors = [];
            if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["Manifest is empty or not an object."] };
            const m = sanitize(manifest);
            if (typeof m.id !== "string" || !m.id.trim()) errors.push("Missing or invalid id.");
            if (typeof m.type !== "string" || !VALID_TYPES.has(m.type)) errors.push(`Missing or invalid type — must be one of: ${Array.from(VALID_TYPES).join(", ")}.`);
            if (typeof m.category !== "string" || !m.category.trim()) errors.push("Missing or invalid category.");
            if (typeof m.version !== "string" || !m.version.trim()) errors.push("Missing or invalid version.");
            if (typeof m.owner !== "string" || !m.owner.trim()) errors.push("Missing or invalid owner.");
            if (m.dependencies !== undefined && (!Array.isArray(m.dependencies) || m.dependencies.some(d => typeof d !== "string"))) errors.push("dependencies must be an array of strings.");
            if (m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some(p => typeof p !== "string"))) errors.push("permissions must be an array of strings.");
            if (m.capabilities !== undefined && (!Array.isArray(m.capabilities) || m.capabilities.some(c => typeof c !== "string"))) errors.push("capabilities must be an array of strings.");
            if (m.id && this.#manifests.has(m.id)) errors.push(`Duplicate id — "${m.id}" is already registered.`);
            return { valid: errors.length === 0, errors };
        }

        /**
         * registerManifest(manifest)
         *   Real, honest registration — throws on invalid input. Re-registering
         *   an existing id UPDATES it (idempotent, same convention as
         *   ServiceRegistry.registerApplication) since a component reloading
         *   and re-declaring itself is normal.
         */
        registerManifest(rawManifest) {
            const manifest = sanitize(rawManifest);
            const isUpdate = this.#manifests.has(manifest.id);
            const { valid: baseValid, errors: baseErrors } = this.validate(manifest);
            // A duplicate-id error is expected and correct when re-registering
            // an existing id (that's an update, not a rejection) — every other
            // validation rule still applies.
            const errors = isUpdate ? baseErrors.filter(e => !e.startsWith("Duplicate id")) : baseErrors;
            const valid = isUpdate ? errors.length === 0 : baseValid;

            if (!valid) {
                this.#diagnostics.rejected++;
                this.#logAudit("MANIFEST_REJECTED", `${manifest.id || "(no id)"}: ${errors.join("; ")}`);
                throw new Error(`[ManifestRegistry] registerManifest(): invalid manifest — ${errors.join("; ")}`);
            }

            const record = Object.freeze({
                id: manifest.id,
                type: manifest.type,
                category: manifest.category,
                version: manifest.version,
                owner: manifest.owner,
                dependencies: Object.freeze((manifest.dependencies || []).slice()),
                permissions: Object.freeze((manifest.permissions || []).slice()),
                certificationStatus: manifest.certificationStatus || "UNCERTIFIED",
                capabilities: Object.freeze((manifest.capabilities || []).slice()),
                registeredAt: isUpdate ? this.#manifests.get(manifest.id).registeredAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            this.#manifests.set(manifest.id, record);
            this.#diagnostics.registered++;
            this.#logAudit(isUpdate ? "MANIFEST_UPDATED" : "MANIFEST_REGISTERED", manifest.id);
            this.#emitPlatform(isUpdate ? "discovery:manifest-updated" : "discovery:manifest-found", { id: manifest.id, type: manifest.type });
            return record;
        }

        getManifest(id) { this.#diagnostics.lookups++; return this.#manifests.get(id) || null; }
        hasManifest(id) { return this.#manifests.has(id); }
        listManifests() { this.#diagnostics.lookups++; return Array.from(this.#manifests.values()); }
        listByType(type) { return this.listManifests().filter(m => m.type === type); }
        listByCategory(category) { return this.listManifests().filter(m => m.category === category); }

        /** getDeclaredDependents(id) — manifests that list `id` in their own dependencies[]. Authoritative, not best-effort. */
        getDeclaredDependents(id) {
            return this.listManifests().filter(m => m.dependencies.includes(id)).map(m => m.id);
        }

        getDiagnosticsReport() { return { ...this.#diagnostics, totalManifests: this.#manifests.size }; }
    }

    if (window.CozyOS.ManifestRegistry && typeof window.CozyOS.ManifestRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.ManifestRegistry.getVersion();
        if (existingVersion !== MANIFEST_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ManifestRegistry existing v${existingVersion} conflicts with load target v${MANIFEST_REGISTRY_VERSION}.`);
        return;
    }

    const registryInstance = new CozyManifestRegistry();
    window.CozyOS.ManifestRegistry = registryInstance;
    window.CozyOS.registerManifest = (manifest) => registryInstance.registerManifest(manifest);
    window.CozyOS.getManifest = (id) => registryInstance.getManifest(id);
    window.CozyOS.listManifests = () => registryInstance.listManifests();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "ManifestRegistry", category: "Platform", icon: "file-badge",
                description: "Level 3 Discovery — stores self-declared CozyOS Manifests (identity, category, version, dependencies, permissions, owner, certification status) via registerManifest()."
            });
        } catch (_err) { /* non-fatal */ }
    }

    // Register its own manifest, same convention every future component follows.
    try {
        registryInstance.registerManifest({
            id: "manifest-registry", type: "service", category: "platform", version: MANIFEST_REGISTRY_VERSION,
            owner: "Platform Discovery", dependencies: [], permissions: [], certificationStatus: "UNCERTIFIED",
            capabilities: ["manifest-storage", "manifest-query"]
        });
    } catch (_err) { /* non-fatal */ }
})();
