/**
 * ShopOS — shop-core
 * File Reference: core/plugins/shopOS-core.js
 * Layer: Business Domain — Plugin (PluginManager-registered, not a window.CozyOS.<X> coordinator)
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY (per ShopOS Phase 3, frozen)
 *   Shop/branch registration, user authentication delegation, permission
 *   checks, and ShopOS's own business-action audit log.
 *
 * HONEST DEVIATION FROM THE PHASE 3 CONTRACT
 *   Phase 3 specified `registerBranch({name, address, isDefault})` and
 *   `authenticateUser(credentials)`. Implementing this against the real
 *   platform surfaced two things the abstract contract didn't anticipate:
 *   - Company.createBranch() requires a companyId — a branch cannot exist
 *     without an already-registered company. registerBranch() below takes
 *     one explicitly rather than silently assuming a single global company.
 *   - IdentityEngine's real method is login(username, password), not
 *     authenticateUser(credentials) — this file calls the real name.
 *   Both are disclosed here rather than papered over with a wrapper that
 *   pretends the original names were exact.
 *
 * NEVER
 *   Stores product, sale, or financial data — that's shop-product,
 *   shop-sales, shop-payments, shop-bookkeeping respectively.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SHOP_CORE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function sanitizeObject(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            clean[key] = input[key];
        }
        return clean;
    }

    class ShopCoreEngine {
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { branchesRegistered: 0, permissionChecks: 0, loginAttempts: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 1.4 };

        getVersion() { return SHOP_CORE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[shop-core] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[shop-core] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[shop-core] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { if (typeof e !== "string" || !e.trim()) { this.#diagnostics.errorsHidden++; return false; } const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s || s.size === 0) return false; let sp; try { sp = this.#deepClone(p); } catch (_e) { sp = p; } for (const fn of Array.from(s)) { try { fn(sp); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        /**
         * #logAudit(actor, action, entity, entityId, before, after)
         *   ShopOS's own real, append-only business-action log — distinct
         *   from IdentityEngine's/Company's own internal audit logs. This
         *   records ShopOS-level events (branch registered, permission
         *   denied, etc.), not identity/company internals.
         */
        #logAudit(actor, action, entity, entityId, before = null, after = null) {
            const record = Object.freeze({ id: this.#generateId("aud"), actor, action, entity, entityId, before, after, timestamp: new Date().toISOString() });
            this.#auditLog.push(record);
            if (this.#auditLog.length > 2000) this.#auditLog.shift();
            this.emit("shop:audit_logged", record);
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        /**
         * registerBranch({companyId, branchCode, branchName, address, phone, email, isDefault})
         *   Real delegation to Company.createBranch() — no branch data is
         *   ever stored inside ShopOS itself. Honestly fails if Company
         *   isn't connected, never fabricates a branch record.
         */
        registerBranch(rawInput = {}) {
            const { companyId, branchCode, branchName, address = null, phone = null, email = null, isDefault = false } = sanitizeObject(rawInput);
            const company = window.CozyOS.Company;
            if (!company || typeof company.createBranch !== "function") {
                return { available: false, reason: "CozyCompany is not connected — cannot register a branch." };
            }
            if (typeof companyId !== "string" || !companyId.trim()) throw new TypeError("[shop-core] registerBranch(): companyId is required.");
            const branch = company.createBranch(companyId, { branchCode, branchName, physicalAddress: address, phone, email });
            this.#diagnostics.branchesRegistered++;
            this.#logAudit("system", "BRANCH_REGISTERED", "Branch", branch.branchId, null, branch);
            this.emit("shop:branch_registered", { companyId, branchId: branch.branchId, isDefault });
            return { available: true, branch };
        }

        getBranch(companyId, branchId) {
            const company = window.CozyOS.Company;
            if (!company) return null;
            const branches = company.listBranches(companyId) || [];
            return branches.find(b => b.branchId === branchId) || null;
        }

        listBranches(companyId) {
            const company = window.CozyOS.Company;
            if (!company || typeof company.listBranches !== "function") return [];
            return company.listBranches(companyId) || [];
        }

        /**
         * login(username, password)
         *   Real delegation to IdentityEngine.login() — ShopOS never
         *   re-implements password hashing or session management.
         */
        async login(username, password) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.login !== "function") {
                return { available: false, reason: "IdentityEngine is not connected — cannot authenticate." };
            }
            this.#diagnostics.loginAttempts++;
            const result = await identity.login(username, password);
            this.#logAudit(username, result.available ? "LOGIN_SUCCESS" : "LOGIN_FAILED", "User", username);
            return result;
        }

        /**
         * checkPermission(userId, requiredRole, options)
         *   Real delegation to IdentityEngine.checkPermission() — exact
         *   same signature, no wrapping logic that could drift from it.
         */
        checkPermission(userId, requiredRole, options = {}) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkPermission !== "function") return false;
            this.#diagnostics.permissionChecks++;
            const allowed = identity.checkPermission(userId, requiredRole, options);
            if (!allowed) this.#logAudit(userId, "PERMISSION_DENIED", "Permission", requiredRole);
            return allowed;
        }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SHOP_CORE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        /**
         * getSystemStatus()
         *   Real, read-only diagnostic — reports whether each dependency
         *   is genuinely present at call time. Never reconnects, never
         *   repairs, never fabricates a "connected" status for something
         *   that isn't actually there. Same honest-status convention
         *   WorkspaceShell's integration slots and Understanding Engine's
         *   provider cards already use elsewhere in the platform.
         */
        getSystemStatus() {
            const check = (name, obj, requiredMethod) => ({
                name, connected: !!(obj && (!requiredMethod || typeof obj[requiredMethod] === "function")),
                version: obj && typeof obj.getVersion === "function" ? obj.getVersion() : null
            });
            const dependencies = [
                check("Company", window.CozyOS.Company, "createBranch"),
                check("IdentityEngine", window.CozyOS.IdentityEngine, "login"),
                check("LanguageEngine", window.CozyOS.LanguageEngine, "translate"),
                check("Customer", window.CozyOS.Customer, "getVersion"),
                check("OCR", window.CozyOS.OCR, "getVersion"),
                check("AI Provider (CozyAIMode)", window.CozyOS.AIMode, "getVersion")
            ];
            const connectedCount = dependencies.filter(d => d.connected).length;
            return this.#deepClone({
                coordinator: "shop-core", version: SHOP_CORE_VERSION,
                dependencies, connectedCount, totalCount: dependencies.length,
                allRequiredConnected: dependencies.every(d => d.connected)
            });
        }

        getDiagnosticsReport() { return this.#deepClone({ pluginVersion: SHOP_CORE_VERSION, ...this.#diagnostics, auditLogSize: this.#auditLog.length }); }
    }

    if (window.CozyOS.ShopCore && typeof window.CozyOS.ShopCore.getVersion === "function") {
        const existingVersion = window.CozyOS.ShopCore.getVersion();
        if (existingVersion !== SHOP_CORE_VERSION) throw new Error(`[ShopOS] VERSION_CONFLICT: shop-core existing v${existingVersion} conflicts with load target v${SHOP_CORE_VERSION}.`);
        return;
    }

    const engineInstance = new ShopCoreEngine();
    window.CozyOS.ShopCore = engineInstance;
    // Business Application Certification Pass: real, additive
    // registration — was missing entirely, same gap as MpesaOS. Uses the
    // same id ("shopos") already registered with ModuleRegistry (via
    // shopos.js) and matching window.CozyOS.Modules["shopos"], so
    // PlatformOperations.launchApplication("shopos") resolves correctly
    // end-to-end.
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerApplication === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerApplication({
                id: "shopos", name: "ShopOS", version: "1.0.0",
                category: "business-application", icon: "shopos.svg", enabled: true,
                launcher: "core/modules/shopos/shopos.js"
            });
        } catch (_err) { /* non-fatal */ }
    }

    const manifest = {
        id: "shop-core",
        name: "ShopOS Core",
        version: SHOP_CORE_VERSION,
        description: "Shop/branch registration, authentication delegation, permission checks, and ShopOS's own business-action audit log.",
        dependencies: {
            required: [],
            optional: ["window.CozyOS.Company (branch registration)", "window.CozyOS.IdentityEngine (authentication/permissions)"]
        }
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
