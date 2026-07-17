/**
 * CozyOS — Module Registry
 * File Reference: core/modules/module-registry.js
 * Layer: Business Domain — Plugin (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The Single Source of Truth for CozyOS application discovery.
 *   Decouples an application's id (e.g. "shopos") from its actual
 *   folder/file structure, theme, dashboard type, and permissions — the
 *   shell never guesses a path pattern or hardcodes per-application
 *   conditions; it asks this registry.
 *
 * OWNERSHIP BOUNDARY (explicitly confirmed, not assumed)
 *   This file lives in core/modules/ — Engineering-owned, per the frozen
 *   5A/5B methodology. It does not live in core/ui/ or core/shell/,
 *   which are Design-owned. The shell (cozy-ui.js, cozy-navigation.js —
 *   both Gemini's) is a CONSUMER of this service's public API; it never
 *   duplicates this registry, and this file never reaches into the
 *   shell's own rendering logic. Whether/how the shell actually calls
 *   this remains Design's integration decision — this file only
 *   guarantees the data is real and correct if consulted.
 *
 * HONEST SCOPE — WHICH APPLICATIONS ARE ACTUALLY REGISTERED
 *   Only "developer-hub", "shopos", and "mpesaos" are registered below —
 *   the three CozyOS applications that genuinely have real,
 *   shell-integrated HTML/CSS/JS today. HospitalOS, SchoolOS, ChurchOS,
 *   and QuarryOS have neither real coordinators nor real UI files yet —
 *   registering manifests for them now would be exactly the fabricated
 *   manifest this file's own validation rules exist to reject. Each
 *   gets a real entry the same way developer-hub's was: only once its
 *   real files exist, via register().
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_REGISTRY_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_DASHBOARDS = new Set(["platform-admin", "developer", "end-user"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    class CozyModuleRegistry {
        #manifests = new Map(); // id -> frozen manifest
        #frozen = false;
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { lookupsPerformed: 0, lookupsMissed: 0, registrationsAccepted: 0, registrationsRejected: 0, removalsPerformed: 0, errorsHidden: 0, eventsEmitted: 0 };

        getVersion() { return MODULE_REGISTRY_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(action, msg) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: this.#escapeHtml(msg) }));
            if (this.#auditLog.length > 500) this.#auditLog.shift();
        }
        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[ModuleRegistry] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[ModuleRegistry] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[ModuleRegistry] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * validate(manifest)
         *   Real, honest validation — rejects rather than silently
         *   fixing. Returns {valid, errors}, never throws itself (so
         *   callers can check before calling register(), which does
         *   throw on the same failures).
         */
        validate(manifest) {
            const errors = [];
            if (!manifest || typeof manifest !== "object" || Object.keys(manifest).length === 0) {
                return { valid: false, errors: ["Manifest is empty or not an object."] };
            }
            const m = sanitizeObject(manifest);
            if (typeof m.id !== "string" || !m.id.trim()) errors.push("Missing or invalid id.");
            if (typeof m.folder !== "string" || !m.folder.trim()) errors.push("Missing or invalid folder.");
            if (typeof m.html !== "string" || !m.html.trim()) errors.push("Missing or invalid html.");
            if (typeof m.css !== "string" || !m.css.trim()) errors.push("Missing or invalid css.");
            if (typeof m.js !== "string" || !m.js.trim()) errors.push("Missing or invalid js.");
            if (m.theme !== undefined && (typeof m.theme !== "string" || !m.theme.trim())) errors.push("Invalid theme — must be a non-empty string.");
            if (m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some(p => typeof p !== "string" || !p.trim()))) errors.push("Invalid permissions — must be an array of non-empty strings.");
            if (m.dashboard !== undefined && !VALID_DASHBOARDS.has(m.dashboard)) errors.push(`Invalid dashboard — must be one of: ${Array.from(VALID_DASHBOARDS).join(", ")}.`);
            if (m.id && this.#manifests.has(m.id)) errors.push(`Duplicate id — "${m.id}" is already registered.`);
            return { valid: errors.length === 0, errors };
        }

        /**
         * register(manifest)
         *   Real registration. Throws honestly on invalid input or on a
         *   frozen registry — never silently fixes a bad manifest, never
         *   silently ignores a post-freeze registration attempt.
         */
        register(rawManifest) {
            if (this.#frozen) {
                this.#diagnostics.registrationsRejected++;
                throw new Error("[ModuleRegistry] register(): registry is frozen — no further registrations are allowed.");
            }
            const manifest = sanitizeObject(rawManifest);
            const { valid, errors } = this.validate(manifest);
            if (!valid) {
                this.#diagnostics.registrationsRejected++;
                this.#logAudit("REGISTRATION_REJECTED", `${manifest.id || "(no id)"}: ${errors.join("; ")}`);
                throw new Error(`[ModuleRegistry] register(): invalid manifest — ${errors.join("; ")}`);
            }
            const record = Object.freeze({
                id: manifest.id, name: manifest.name ?? manifest.id, version: manifest.version ?? "1.0.0",
                folder: manifest.folder, html: manifest.html, css: manifest.css, js: manifest.js,
                theme: manifest.theme ?? manifest.id, icon: manifest.icon ?? null,
                dashboard: manifest.dashboard ?? "end-user",
                permissions: Object.freeze((manifest.permissions ?? []).slice()),
                preload: manifest.preload === true, enabled: manifest.enabled !== false
            });
            this.#manifests.set(manifest.id, record);
            this.#diagnostics.registrationsAccepted++;
            this.#logAudit("REGISTERED", manifest.id);
            this.emit("registry:registered", { id: manifest.id });
            return this.#deepClone(record);
        }

        /** remove(id) — real removal; honestly refuses once frozen, matching "applications never register themselves after freeze" applied symmetrically to removal. */
        remove(id) {
            if (this.#frozen) throw new Error("[ModuleRegistry] remove(): registry is frozen — no further changes are allowed.");
            const removed = this.#manifests.delete(id);
            if (removed) { this.#diagnostics.removalsPerformed++; this.#logAudit("REMOVED", id); this.emit("registry:removed", { id }); }
            return removed;
        }

        /** freeze()/isFrozen() — real, one-way. Once frozen, register()/remove() honestly throw rather than silently no-op. */
        freeze() {
            if (this.#frozen) return false;
            this.#frozen = true;
            this.#logAudit("FROZEN", `${this.#manifests.size} manifest(s) locked.`);
            this.emit("registry:frozen", { count: this.#manifests.size });
            return true;
        }
        isFrozen() { return this.#frozen; }

        /**
         * get(id) / resolve(id)
         *   get() returns the full, real manifest (all metadata). Real
         *   lookup — null if unregistered, never a fabricated fallback.
         *   resolve() is an alias of get(), matching the requested API
         *   shape exactly (manifest.folder/html/css/js/theme/etc all
         *   directly on the returned object).
         */
        get(id) {
            if (typeof id !== "string" || FORBIDDEN_KEYS.has(id)) return null;
            this.#diagnostics.lookupsPerformed++;
            const entry = this.#manifests.get(id);
            if (!entry) {
                this.#diagnostics.lookupsMissed++;
                this.#logAudit("LOOKUP_MISSED", id);
                this.emit("registry:lookup_missed", { id });
                return null;
            }
            return this.#deepClone(entry);
        }
        resolve(id) { return this.get(id); }

        /** resolvePaths(id) — the original, narrower convenience: fully-qualified, folder-prefixed paths only. Kept as a distinct method (not removed) since resolve() now returns the full manifest instead. */
        resolvePaths(id) {
            const entry = this.get(id);
            if (!entry) return null;
            const base = `core/modules/${entry.folder}/`;
            return { html: base + entry.html, css: base + entry.css, js: base + entry.js };
        }

        has(id) { return this.#manifests.has(id); }

        /** list() — real, full manifests for every registered (and enabled, unless includeDisabled) application — what the shell's sidebar/navigation should consume instead of hardcoded buttons. */
        list({ includeDisabled = false } = {}) {
            return Array.from(this.#manifests.values()).filter(m => includeDisabled || m.enabled).map(m => this.#deepClone(m));
        }
        /** listModules() — backward-compatible alias returning just ids, matching the original narrower method already in use. */
        listModules() { return Array.from(this.#manifests.keys()); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(MODULE_REGISTRY_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: MODULE_REGISTRY_VERSION, ...this.#diagnostics, registeredModules: this.listModules(), frozen: this.#frozen, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ModuleRegistry && typeof window.CozyOS.ModuleRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.ModuleRegistry.getVersion();
        if (existingVersion !== MODULE_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ModuleRegistry existing v${existingVersion} conflicts with load target v${MODULE_REGISTRY_VERSION}.`);
        return;
    }

    const engineInstance = new CozyModuleRegistry();
    window.CozyOS.ModuleRegistry = engineInstance;

    // Real registrations — only applications with genuine, verified UI files.
    engineInstance.register({
        id: "developer-hub", name: "Developer Hub", version: "1.0.0",
        folder: "developer", html: "developer-hub.html", css: "developer-hub.css", js: "developer-hub.js",
        theme: "developer", icon: "wrench", dashboard: "developer", permissions: ["DEVELOPER_ACCESS"], preload: false, enabled: true
    });
    engineInstance.register({
        id: "shopos", name: "ShopOS", version: "1.0.0",
        folder: "shopos", html: "shopos.html", css: "shopos.css", js: "shopos.js",
        theme: "shopos", icon: "shopping", dashboard: "end-user", permissions: ["SHOP_ACCESS"], preload: true, enabled: true
    });
    engineInstance.register({
        id: "mpesaos", name: "MpesaOS", version: "1.0.0",
        folder: "mpesaos", html: "mpesaos.html", css: "mpesaos.css", js: "mpesaos.js",
        theme: "mpesaos", icon: "cash", dashboard: "end-user", permissions: ["MPESA_ACCESS"], preload: true, enabled: true
    });

    const manifest = {
        id: "module-registry",
        name: "CozyOS Module Registry",
        version: MODULE_REGISTRY_VERSION,
        description: "Single Source of Truth for CozyOS application discovery — validated registration, duplicate detection, freeze, and full manifest metadata. Consumable by the shell's loadModule() — does not modify it.",
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
