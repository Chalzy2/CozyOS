/**
 * CozyOS Enterprise Framework — Service Registry
 * File Reference: core/registry/cozy-registry.js
 * Layer: Core / Platform Foundation — Application & Coordinator Catalog
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A single, metadata-only catalog of what applications and coordinators
 *   exist on this CozyOS install, and how to find/launch/display them. This
 *   is the piece that lets the Workspace Shell (or anything else) stop
 *   hardcoding "ChurchOS, QuarryOS, ShopOS, ...": instead of the shell
 *   knowing application names, applications announce themselves here once,
 *   and everything else discovers them by calling listApplications().
 *
 * WHAT THIS IS NOT
 *   - Not a certification authority. CozyCertification remains the sole
 *     source of truth for certification/readiness/regression/upgrade data.
 *     An application's manifest here can NAME a certificationProvider (e.g.
 *     "Certification"), but this registry never checks or interprets that
 *     provider's data itself — that's left entirely to whoever reads the
 *     manifest (e.g. the Workspace Shell).
 *   - Not a launcher. Registering `launcher: "church/index.html"` records a
 *     path/reference only. This registry never navigates to it, loads it,
 *     or executes anything — Zero Logic Rule, execution-free, same as
 *     every other CozyOS coordinator.
 *   - Not the identity of a live coordinator object. A coordinator still
 *     lives at window.CozyOS.<Name> exactly as before; registerCoordinator()
 *     only stores DESCRIPTIVE metadata about it (category, icon, a short
 *     description) for display purposes, alongside the real object.
 *
 * PUBLIC API SHAPE
 *   Per the requesting design, the primary entry points are attached
 *   directly on window.CozyOS (not nested under a sub-object), so callers
 *   write window.CozyOS.registerApplication(...) / listApplications() /
 *   registerCoordinator(...) / listCoordinators() directly. The underlying
 *   object (window.CozyOS.ServiceRegistry) still exists for the usual
 *   introspection surface (getVersion, getDiagnosticsReport, on/off/emit)
 *   and is what those top-level functions delegate to.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const REGISTRY_VERSION = "1.0.0-ENTERPRISE";

    const APPLICATION_DEFAULTS = Object.freeze({
        version: "0.0.0",
        launcher: null,
        coordinator: null,
        category: "Uncategorized",
        icon: null,
        licenseProvider: null,
        healthProvider: null,
        certificationProvider: null,
        permissionsProvider: null
    });

    const COORDINATOR_DEFAULTS = Object.freeze({
        version: null, // descriptive only — the live object's own getVersion() remains authoritative
        category: "Uncategorized",
        icon: null,
        description: null
    });

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSServiceRegistry {
        #applications = new Map(); // id -> frozen manifest
        #coordinators = new Map(); // name -> frozen manifest

        #auditLogs = [];
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            applicationsRegistered: 0,
            coordinatorsRegistered: 0,
            lookupsServed: 0,
            errorsHidden: 0
        };

        getVersion() { return REGISTRY_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }

        // Rejects __proto__/constructor/prototype keys before any manifest
        // is merged into a stored record — the single guard every
        // registration path routes through.
        #enforceNoForbiddenKeys(obj, path) {
            if (!obj || typeof obj !== "object") return;
            for (const key of Object.keys(obj)) {
                if (FORBIDDEN_KEYS.has(key)) {
                    throw new Error(`[ServiceRegistry] Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                }
                this.#enforceNoForbiddenKeys(obj[key], `${path}.${key}`);
            }
        }

        // Not used for rendering today — carried for consistency with every
        // other CozyOS coordinator, in case a future dashboard listing
        // registry entries ever needs it.
        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({
                id: "reg_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()),
                timestamp: new Date().toISOString(), action, msg
            }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        // ---- event bus (on/off/once/emit) — same shape as every other CozyOS coordinator ----

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[ServiceRegistry] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[ServiceRegistry] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[ServiceRegistry] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        getDiagnosticsReport() {
            return this.#deepFreeze(this.#deepClone({
                ...this.#diagnostics,
                applicationCount: this.#applications.size,
                coordinatorCount: this.#coordinators.size,
                auditLogCount: this.#auditLogs.length,
                listenerEventTypes: this.#listeners.size
            }));
        }

        // =====================================================================
        // ─── APPLICATIONS ─────────────────────────────────────────────────────
        // =====================================================================

        /**
         * registerApplication(manifest)
         *   Required: id, name (strings). Everything else defaults per
         *   APPLICATION_DEFAULTS. Re-registering an existing id UPDATES its
         *   manifest (idempotent, logged as an update) rather than throwing —
         *   an application re-announcing itself after a reload is normal.
         */
        registerApplication(manifest) {
            if (!manifest || typeof manifest.id !== "string" || !manifest.id.trim()) {
                throw new TypeError("[ServiceRegistry] registerApplication(): manifest.id is required and must be a non-empty string.");
            }
            if (typeof manifest.name !== "string" || !manifest.name.trim()) {
                throw new TypeError("[ServiceRegistry] registerApplication(): manifest.name is required and must be a non-empty string.");
            }
            this.#enforceNoForbiddenKeys(manifest, "registerApplication");
            const isUpdate = this.#applications.has(manifest.id);
            const record = this.#deepFreeze({
                ...APPLICATION_DEFAULTS,
                ...this.#deepClone(manifest),
                id: manifest.id,
                name: manifest.name,
                registeredAt: isUpdate ? this.#applications.get(manifest.id).registeredAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            this.#applications.set(manifest.id, record);
            this.#diagnostics.applicationsRegistered++;
            this.#logAudit(isUpdate ? "APPLICATION_UPDATED" : "APPLICATION_REGISTERED", `${manifest.id} (${manifest.name}) ${isUpdate ? "updated" : "registered"}.`);
            this.emit(isUpdate ? "application:updated" : "application:registered", { id: manifest.id, name: manifest.name });
            return record;
        }

        getApplication(id) {
            this.#diagnostics.lookupsServed++;
            return this.#applications.get(id) || null;
        }

        listApplications() {
            this.#diagnostics.lookupsServed++;
            return this.#deepClone(Array.from(this.#applications.values()));
        }

        hasApplication(id) { return this.#applications.has(id); }

        unregisterApplication(id) {
            const removed = this.#applications.delete(id);
            if (removed) {
                this.#logAudit("APPLICATION_UNREGISTERED", `${id} unregistered.`);
                this.emit("application:unregistered", { id });
            }
            return removed;
        }

        /** Applications whose manifest declares category === the given category. */
        listApplicationsByCategory(category) {
            return this.listApplications().filter(a => a.category === category);
        }

        // =====================================================================
        // ─── COORDINATORS ─────────────────────────────────────────────────────
        // Purely descriptive metadata (category/icon/description) about a
        // coordinator, for catalog/display purposes. It does NOT replace or
        // shadow the live coordinator object at window.CozyOS.<Name> — that
        // remains the actual functioning instance, discovered and read the
        // same way it always was.
        // =====================================================================

        registerCoordinator(manifest) {
            if (!manifest || typeof manifest.name !== "string" || !manifest.name.trim()) {
                throw new TypeError("[ServiceRegistry] registerCoordinator(): manifest.name is required and must be a non-empty string.");
            }
            this.#enforceNoForbiddenKeys(manifest, "registerCoordinator");
            const isUpdate = this.#coordinators.has(manifest.name);
            const record = this.#deepFreeze({
                ...COORDINATOR_DEFAULTS,
                ...this.#deepClone(manifest),
                name: manifest.name,
                registeredAt: isUpdate ? this.#coordinators.get(manifest.name).registeredAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            this.#coordinators.set(manifest.name, record);
            this.#diagnostics.coordinatorsRegistered++;
            this.#logAudit(isUpdate ? "COORDINATOR_UPDATED" : "COORDINATOR_REGISTERED", `${manifest.name} ${isUpdate ? "updated" : "registered"}.`);
            this.emit(isUpdate ? "coordinator:updated" : "coordinator:registered", { name: manifest.name });
            return record;
        }

        getCoordinator(name) {
            this.#diagnostics.lookupsServed++;
            return this.#coordinators.get(name) || null;
        }

        listCoordinators() {
            this.#diagnostics.lookupsServed++;
            return this.#deepClone(Array.from(this.#coordinators.values()));
        }

        hasCoordinator(name) { return this.#coordinators.has(name); }

        unregisterCoordinator(name) {
            const removed = this.#coordinators.delete(name);
            if (removed) {
                this.#logAudit("COORDINATOR_UNREGISTERED", `${name} unregistered.`);
                this.emit("coordinator:unregistered", { name });
            }
            return removed;
        }
    }

    // --- INSTANTIATION & VERSION CONFLICT / HOT RELOAD PROTECTION ---
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.ServiceRegistry.getVersion();
        if (existingVersion !== REGISTRY_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: ServiceRegistry existing v${existingVersion} conflicts with load target v${REGISTRY_VERSION}.`);
        }
        return;
    }

    const registry = new CozyOSServiceRegistry();
    window.CozyOS.ServiceRegistry = registry;

    // Top-level convenience passthroughs, per the requested public API shape
    // (window.CozyOS.registerApplication(...) directly, not nested). Each is
    // a bound delegate to the real object above — there is exactly one
    // underlying registry; these are just its front door.
    window.CozyOS.registerApplication = (manifest) => registry.registerApplication(manifest);
    window.CozyOS.getApplication = (id) => registry.getApplication(id);
    window.CozyOS.listApplications = () => registry.listApplications();
    window.CozyOS.hasApplication = (id) => registry.hasApplication(id);
    window.CozyOS.unregisterApplication = (id) => registry.unregisterApplication(id);
    window.CozyOS.listApplicationsByCategory = (category) => registry.listApplicationsByCategory(category);

    window.CozyOS.registerCoordinator = (manifest) => registry.registerCoordinator(manifest);
    window.CozyOS.getCoordinator = (name) => registry.getCoordinator(name);
    window.CozyOS.listCoordinators = () => registry.listCoordinators();
    window.CozyOS.hasCoordinator = (name) => registry.hasCoordinator(name);
    window.CozyOS.unregisterCoordinator = (name) => registry.unregisterCoordinator(name);

    // Drain any registrations queued by coordinators that loaded BEFORE
    // this file did — each coordinator's own retry loop would eventually
    // notice registerCoordinator() exists (polling every 250ms), but
    // draining here immediately removes that whole waiting window for the
    // common case (this file loading after some coordinators already have).
    if (Array.isArray(window.CozyOS.__pendingCoordinatorRegistrations)) {
        const queued = window.CozyOS.__pendingCoordinatorRegistrations.splice(0);
        for (const descriptor of queued) {
            try { registry.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
        }
    }
})();
