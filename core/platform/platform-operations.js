/**
 * CozyOS Platform Operations Engine
 * File Reference: core/platform/platform-operations.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.2.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The execution layer: Discovery finds, Audit explains, Operations
 *   fixes. This engine is an ORCHESTRATOR, not an emulator — it may only
 *   expose operations that delegate to a verified, real platform owner.
 *   Nothing here invents a lifecycle capability a coordinator doesn't
 *   actually have.
 *
 * OPERATIONS REGISTRY (real, queryable — not scattered per-method logic)
 *   Every operation is a real entry in #OPERATIONS_REGISTRY:
 *   { owner, permission, rollback, supported, category, reason,
 *     requiredFutureOwner }. `listOperations()` / `getOperationDescriptor()`
 *   expose this table directly — the Administrator Workspace should read
 *   from here to decide what to show, not from a hardcoded UI list.
 *
 * PERMISSION STRING FORMAT — CORRECTED TO MATCH REAL VALIDATION
 *   The originally-proposed format ("platform.discovery.refresh", three
 *   dot-separated segments) does not match IdentityEngine's actual,
 *   already-shipped validation regex for resource permissions
 *   (`/^[a-z0-9_-]+:[a-z0-9_-]+$/i` — one colon, two segments; confirmed by
 *   reading identity-engine.js's real grantResourcePermission()/
 *   checkResourcePermission() directly, not assumed). Every permission
 *   string below uses that real, working format (e.g. "discovery:refresh")
 *   instead — using the proposed dotted format would mean every
 *   permission check in this file throws a TypeError the moment
 *   IdentityEngine actually validates it.
 *
 * LEVEL 3 — NOT SUPPORTED, NEVER FABRICATED
 *   restartCoordinator, restartEngine, reconnectCoordinator,
 *   reloadCoordinator, enablePlugin, disablePlugin, restartPlugin,
 *   reloadPlugin. Every one of these always returns the same standardized
 *   shape — {supported:false, reason, requiredFutureOwner} — verified by
 *   reading every real coordinator's actual public API first: no
 *   coordinator in CozyOS exposes a restart/reconnect/reload lifecycle
 *   method (every one self-instantiates once via an IIFE whose own
 *   VERSION_CONFLICT guard actively prevents re-instantiation by design),
 *   and PluginManager's real, complete API
 *   (get/health/initModule/list/register/resolve/stats) has no
 *   enable/disable/reload/restart methods. "restartCoordinator" and
 *   "restartEngine" are the SAME real gap (an Engine is a Coordinator in
 *   this codebase's own naming) — both entries exist in the registry so
 *   neither name silently falls through unhandled, but they report the
 *   identical real reason.
 *
 * CAPABILITY SCANNER — REAL INFRASTRUCTURE, CAPABILITY-DRIVEN REGISTRY
 *   scanCapabilities() checks every window.CozyOS key for a real,
 *   self-advertised `capabilities` array property, per the Future
 *   Capability Standard (see below). A count of 0 discovered is a
 *   successful scan, not a failure — "Capabilities discovered: 0 / Reason:
 *   No platform component currently exposes capability metadata" is the
 *   correct, honest report for a coordinator that hasn't been migrated
 *   yet. `getOperationDescriptor()`'s `supported` field is now COMPUTED
 *   from this same real check for every Level 1/2 operation — not
 *   hardcoded from this file's own reading of a coordinator's source, even
 *   where that source is known to work. Only `PlatformDiscovery` currently
 *   advertises (migrated as part of this same milestone, first in the
 *   specified migration order) — every other Level 1/2 operation honestly
 *   reports "Capability not advertised" until its own owner is migrated in
 *   a later, separate milestone, each regression-tested and certified
 *   individually, per the specified migration strategy.
 *
 * FUTURE CAPABILITY STANDARD (permanent engineering rule)
 *   Every new platform service, coordinator, application, engine, and
 *   plugin that exposes executable actions shall publish a real
 *   `capabilities` array: `[{id, permission, rollback, category}, ...]`.
 *   Not mandatory for existing components as of this milestone — existing
 *   components remain fully compatible without one (they simply show as
 *   unsupported here until migrated). Future development adopts the
 *   standard from the start. Migrating an existing coordinator to add one
 *   does NOT mean rewriting it — it's a small, additive property, added
 *   one coordinator at a time, regression-tested and certified
 *   individually (never dozens at once, per the same discipline already
 *   used for the PlatformEventBus migration).
 *
 * IDENTITY ENFORCEMENT — FAILS CLOSED, NEVER A FABRICATED ADMIN
 *   No hardcoded "admin"/"root"/"system" userId anywhere in this file.
 *   Every mutating operation requires a real userId, a real, connected
 *   IdentityEngine, and a real granted resource:action permission
 *   (`checkResourcePermission`) — missing any of the three means refuse,
 *   always. No login screen exists anywhere in CozyOS yet (a real,
 *   disclosed platform gap noted in this project's own Identity Phase 1
 *   review) — in practice, every operation below will honestly refuse
 *   until one exists and supplies a real, authorized userId.
 *
 * EVENTS — via the existing, shared PlatformEventBus, never a new bus
 *   operations:start, operations:success, operations:failed,
 *   operations:rollback, operations:completed, operations:unsupported
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OPERATIONS_VERSION = "1.2.0-ENTERPRISE";

    // ---- Operations Registry — the real, queryable single source of truth ----
    // "supported" for Level 1/2 entries is now COMPUTED, not hardcoded — see
    // #isCapabilityAdvertised() below. capabilityId is the id this engine
    // looks for in the owner's own, real, self-declared `capabilities` array
    // (per the Future Capability Standard). Zero coordinators advertise one
    // yet except PlatformDiscovery, migrated as part of this same milestone
    // (first in the specified migration order) — every other Level 1/2
    // operation below will honestly report "Capability not advertised" until
    // its own owner is migrated in a later, separate milestone. This is the
    // intended, disclosed state, not a regression.
    const OPERATIONS_REGISTRY = Object.freeze({
        // ---- Level 1 — real owners; supported computed from real advertisement ----
        "discovery:runRuntime": { owner: "PlatformDiscovery", capabilityId: "scan", permission: "discovery:scan", rollback: false, category: "Discovery" },
        "discovery:runManifest": { owner: "PlatformDiscovery", capabilityId: "scan", permission: "discovery:scan", rollback: false, category: "Discovery" },
        "discovery:runFull": { owner: "PlatformDiscovery", capabilityId: "scan", permission: "discovery:scan", rollback: false, category: "Discovery" },
        "registry:refreshService": { owner: "ServiceRegistry", capabilityId: "refresh", permission: "registry:refresh", rollback: false, category: "Registry" },
        "registry:refreshModule": { owner: "ModuleRegistry", capabilityId: "refresh", permission: "registry:refresh", rollback: false, category: "Registry" },
        "registry:validate": { owner: "PlatformDiscovery", capabilityId: "validate", permission: "registry:validate", rollback: false, category: "Registry" },
        "module:validateManifest": { owner: "ModuleRegistry", capabilityId: "validate", permission: "module:validate", rollback: false, category: "Module" },
        "module:refreshMetadata": { owner: "ModuleRegistry", capabilityId: "refresh", permission: "module:validate", rollback: false, category: "Module" },
        "dependency:recalculate": { owner: "DependencyEngine", capabilityId: "recalculate", permission: "dependency:refresh", rollback: false, category: "Dependency" },
        "dependency:locateCircular": { owner: "DependencyEngine", capabilityId: "detectCircular", permission: "dependency:refresh", rollback: false, category: "Dependency" },
        "dependency:locateMissing": { owner: "DependencyEngine", capabilityId: "detectMissing", permission: "dependency:refresh", rollback: false, category: "Dependency" },
        "usage:refresh": { owner: "UsageEngine", capabilityId: "refresh", permission: "usage:refresh", rollback: false, category: "Usage" },
        "usage:refreshDead": { owner: "UsageEngine", capabilityId: "refreshDead", permission: "usage:refresh", rollback: false, category: "Usage" },
        "usage:refreshDuplicate": { owner: "UsageEngine", capabilityId: "refreshDuplicate", permission: "usage:refresh", rollback: false, category: "Usage" },
        "health:run": { owner: "HealthEngine", capabilityId: "run", permission: "health:refresh", rollback: false, category: "Health" },
        "health:validateServices": { owner: "HealthEngine", capabilityId: "validate", permission: "health:refresh", rollback: false, category: "Health" },
        "health:validateCoordinators": { owner: "HealthEngine", capabilityId: "validate", permission: "health:refresh", rollback: false, category: "Health" },
        "health:validateApplications": { owner: "HealthEngine", capabilityId: "validate", permission: "health:refresh", rollback: false, category: "Health" },
        "audit:runFull": { owner: "PlatformAudit", capabilityId: "run", permission: "audit:run", rollback: false, category: "Audit" },
        "audit:runApplication": { owner: "PlatformAudit", capabilityId: "run", permission: "audit:run", rollback: false, category: "Audit" },
        "audit:export": { owner: "PlatformAudit", capabilityId: "export", permission: "audit:export", rollback: false, category: "Audit" },
        "certification:run": { owner: "CozyCertification", capabilityId: "run", permission: "certification:run", rollback: false, category: "Certification" },
        "certification:runRegression": { owner: "CozyCertification", capabilityId: "run", permission: "certification:run", rollback: false, category: "Certification" },
        "certification:generateReport": { owner: "CozyCertification", capabilityId: "run", permission: "certification:run", rollback: false, category: "Certification" },
        "plugin:install": { owner: "PluginManager", capabilityId: "register", permission: "plugin:register", rollback: false, category: "Plugin" },
        "plugin:validate": { owner: "PluginManager", capabilityId: "validate", permission: "plugin:register", rollback: false, category: "Plugin" },
        "search:query": { owner: "FileRegistry", capabilityId: "search", permission: "search:query", rollback: false, category: "Search" },
        "diagnostics:refresh": { owner: "PlatformDiscovery", capabilityId: "refresh", permission: "discovery:refresh", rollback: false, category: "Diagnostics" },

        // ---- Level 2 — real owners, real preconditions; supported still computed from real advertisement ----
        "application:launch": { owner: "UI", capabilityId: "launch", permission: "application:launch", rollback: false, category: "Application", preconditions: ["ModuleRegistry has a resolvable manifest for the target"] },
        "application:stop": { owner: "UI", capabilityId: "stop", permission: "application:stop", rollback: false, category: "Application", preconditions: ["Module descriptor exists and implements destroy()"] },
        "application:restart": { owner: "UI", capabilityId: "launch", permission: "application:restart", rollback: false, category: "Application", preconditions: ["stop() must succeed before launch() is attempted"] },
        "application:validate": { owner: "ModuleRegistry", capabilityId: "validate", permission: "application:validate", rollback: false, category: "Application" },
        "application:unregister": { owner: "ServiceRegistry", capabilityId: "unregister", permission: "application:unregister", rollback: false, category: "Application", preconditions: ["Identity authorization", "Application must currently be registered"] },
        "module:unload": { owner: "ModuleRegistry", capabilityId: "remove", permission: "module:remove", rollback: true, category: "Module", preconditions: ["Module must currently be registered", "Identity authorization", "Rollback snapshot (the manifest itself) captured before removal"] },
        "module:reload": { owner: "ModuleRegistry", capabilityId: "register", permission: "module:validate", rollback: false, category: "Module", preconditions: ["A real replacement manifest with a matching id is required"] },
        "module:reRegister": { owner: "ModuleRegistry", capabilityId: "register", permission: "module:validate", rollback: false, category: "Module" },
        "coordinator:reRegister": { owner: "ServiceRegistry", capabilityId: "register", permission: "coordinator:register", rollback: false, category: "Coordinator" },
        "coordinator:validateRegistration": { owner: "ServiceRegistry", capabilityId: "validate", permission: "coordinator:validate", rollback: false, category: "Coordinator" },
        "coordinator:refreshState": { owner: "ServiceRegistry", capabilityId: "refresh", permission: "coordinator:refresh", rollback: false, category: "Coordinator" },
        "coordinator:unregister": { owner: "ServiceRegistry", capabilityId: "unregister", permission: "coordinator:unregister", rollback: false, category: "Coordinator", preconditions: ["Identity authorization", "Discovery must have already flagged this coordinator as declaredButMissing — this engine does not decide on its own that a registration is broken"] },
        "registry:repair": { owner: "ServiceRegistry", capabilityId: "unregister", permission: "registry:repair", rollback: false, category: "Registry", preconditions: ["Discovery scan must have already run this session", "Only acts on entries Discovery already reported as declaredButMissing"] },

        // ---- Level 3 — not supported, never fabricated, never "advertisement pending" — no primitive exists at all ----
        "coordinator:restart": { owner: null, supported: false, category: "Coordinator", reason: "No coordinator in CozyOS exposes a restart method. Every coordinator self-instantiates once via an IIFE whose own VERSION_CONFLICT guard actively prevents re-instantiation by design.", requiredFutureOwner: "Coordinator Lifecycle API" },
        "engine:restart": { owner: null, supported: false, category: "Coordinator", reason: "An Engine is a Coordinator in CozyOS's own naming — this is the identical real gap as coordinator:restart, not a separate one.", requiredFutureOwner: "Coordinator Lifecycle API" },
        "coordinator:reconnect": { owner: null, supported: false, category: "Coordinator", reason: "Coordinators are in-memory JS objects, not network connections — there is no real \"disconnected\" state to reconnect from.", requiredFutureOwner: "Coordinator Lifecycle API" },
        "coordinator:reload": { owner: null, supported: false, category: "Coordinator", reason: "Same constraint as coordinator:restart — no coordinator exposes a reload/re-instantiation method, by design.", requiredFutureOwner: "Coordinator Lifecycle API" },
        "plugin:enable": { owner: null, supported: false, category: "Plugin", reason: "PluginManager's real, complete public API is get/health/initModule/list/register/resolve/stats — no enable() method exists.", requiredFutureOwner: "Plugin Lifecycle API" },
        "plugin:disable": { owner: null, supported: false, category: "Plugin", reason: "PluginManager has no disable() method — its auto-disable behavior is a private, internal mechanism, not a public API this engine can invoke.", requiredFutureOwner: "Plugin Lifecycle API" },
        "plugin:restart": { owner: null, supported: false, category: "Plugin", reason: "PluginManager has no restart() method.", requiredFutureOwner: "Plugin Lifecycle API" },
        "plugin:reload": { owner: null, supported: false, category: "Plugin", reason: "PluginManager has no reload() method.", requiredFutureOwner: "Plugin Lifecycle API" }
    });

    class CozyPlatformOperations {
        #history = [];
        #diagnostics = { operationsRun: 0, operationsSucceeded: 0, operationsFailed: 0, operationsRefused: 0, operationsUnsupported: 0, rollbacksPerformed: 0 };

        getVersion() { return OPERATIONS_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #emit(eventName, payload) {
            if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit(eventName, payload); } catch (_err) { /* non-fatal */ }
            }
        }

        #recordHistory(entry) {
            this.#history.push(Object.freeze({ ...entry, timestamp: new Date().toISOString() }));
            if (this.#history.length > 500) this.#history.shift();
        }

        getHistory(limit = 100) { return this.#deepClone(this.#history.slice(-limit).reverse()); }

        /**
         * #isCapabilityAdvertised(ownerName, capabilityId, permission)
         *   Real, current check — per the Future Capability Standard, a
         *   coordinator advertises support by exposing a real
         *   `capabilities` array of {id, permission, rollback, category}
         *   objects. Returns the matching real entry, or null. Never
         *   invents a default; a coordinator with no `capabilities`
         *   property (true for every coordinator except PlatformDiscovery,
         *   as of this version) always returns null here.
         */
        #isCapabilityAdvertised(ownerName, capabilityId, permission) {
            const owner = window.CozyOS[ownerName];
            if (!owner || !Array.isArray(owner.capabilities)) return null;
            return owner.capabilities.find(c => c.id === capabilityId && c.permission === permission) || null;
        }

        /**
         * getOperationDescriptor(name)
         *   Real, computed on every call — Level 3 entries stay hardcoded
         *   `supported:false` (no primitive exists at all, a categorically
         *   different and worse case than "not yet advertised"). Level 1/2
         *   entries compute `supported` from real, current capability
         *   advertisement — most currently report false with reason
         *   "Capability not advertised," which is the intended, disclosed
         *   state until each coordinator is migrated individually.
         */
        getOperationDescriptor(name) {
            const entry = OPERATIONS_REGISTRY[name];
            if (!entry) return null;
            if (entry.supported === false) return this.#deepClone({ name, ...entry }); // Level 3, hardcoded, never re-checked
            const advertised = this.#isCapabilityAdvertised(entry.owner, entry.capabilityId, entry.permission);
            return this.#deepClone({
                name, ...entry,
                supported: !!advertised,
                reason: advertised ? null : "Capability not advertised",
                advertisedRollback: advertised ? advertised.rollback : null
            });
        }
        listOperations() { return Object.keys(OPERATIONS_REGISTRY).map(name => this.getOperationDescriptor(name)); }
        listSupportedOperations() { return this.listOperations().filter(o => o.supported); }
        listUnsupportedOperations() { return this.listOperations().filter(o => !o.supported); }

        /**
         * scanCapabilities()
         *   Real infrastructure. Checks every window.CozyOS key for a real,
         *   self-advertised `capabilities` array (per the Future Capability
         *   Standard) — does not invent one for any coordinator that lacks
         *   it. A count of 0 is a successful scan, not a failure.
         */
        scanCapabilities() {
            const advertising = [];
            const notAdvertising = [];
            const seen = new Set(); // dedupe by object identity — aliased
            // globals (e.g. window.CozyOS.Discovery === window.CozyOS.
            // PlatformDiscovery, an intentional backward-compat alias) must
            // only be counted once, not once per name pointing at it.
            for (const name of Object.keys(window.CozyOS)) {
                const obj = window.CozyOS[name];
                if (!obj || typeof obj !== "object") continue;
                if (seen.has(obj)) continue;
                seen.add(obj);
                if (Array.isArray(obj.capabilities)) advertising.push({ name, capabilities: obj.capabilities });
                else if (typeof obj.getVersion === "function") notAdvertising.push(name);
            }
            const totalCapabilities = advertising.reduce((sum, a) => sum + a.capabilities.length, 0);
            return {
                capabilitiesDiscovered: totalCapabilities,
                advertisingCoordinators: advertising,
                coordinatorsCheckedWithNoAdvertisement: notAdvertising,
                reason: totalCapabilities === 0 ? "No platform component currently exposes capability metadata." : null
            };
        }


        /**
         * #authorize(userId, permissionString)
         *   FAILS CLOSED. Uses IdentityEngine's real checkResourcePermission()
         *   — a real resource:action string, never a role-based blanket
         *   check, so each operation is gated by its own real, specific
         *   permission per the Operations Registry entry above.
         */
        #authorize(userId, permissionString) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity) return { authorized: false, reason: "IdentityEngine is not loaded — no operation can be authorized without it." };
            if (!userId) return { authorized: false, reason: "No userId supplied — every Platform Operation requires a real, authenticated user. (No login screen exists yet anywhere in CozyOS — a real, disclosed platform gap, not something this engine works around or fakes past.)" };
            let allowed;
            try { allowed = identity.checkResourcePermission(userId, permissionString); }
            catch (err) { return { authorized: false, reason: `IdentityEngine.checkResourcePermission() threw: ${err && err.message}` }; }
            if (!allowed) return { authorized: false, reason: `User "${userId}" does not hold the "${permissionString}" permission.` };
            return { authorized: true };
        }

        /**
         * #run(operationName, target, opts, validateFn, executeFn, rollbackFn)
         *   The single real orchestration path. Looks up the operation in
         *   the real Operations Registry FIRST — unsupported operations
         *   never reach authorization or execution at all.
         */
        async #run(operationName, target, { userId, dryRun = false } = {}, validateFn, executeFn, rollbackFn = null) {
            const descriptor = this.getOperationDescriptor(operationName);
            const startedAt = (typeof performance !== "undefined" ? performance.now() : Date.now());

            if (!descriptor) {
                return { success: false, unsupported: true, operation: operationName, target, reason: `"${operationName}" is not in the Operations Registry at all.`, requiredFutureOwner: null };
            }
            if (!descriptor.supported) {
                this.#diagnostics.operationsUnsupported++;
                const result = { success: false, unsupported: true, operation: operationName, target, reason: descriptor.reason, requiredFutureOwner: descriptor.requiredFutureOwner };
                this.#recordHistory({ operation: operationName, target, success: false, reason: descriptor.reason, durationMs: 0, rollback: false });
                this.#emit("operations:unsupported", result);
                return result;
            }

            this.#diagnostics.operationsRun++;
            this.#emit("operations:start", { operation: operationName, target, dryRun });

            const auth = this.#authorize(userId, descriptor.permission);
            if (!auth.authorized) {
                this.#diagnostics.operationsRefused++;
                const result = { success: false, refused: true, operation: operationName, target, reason: auth.reason };
                this.#recordHistory({ operation: operationName, target, success: false, reason: auth.reason, durationMs: 0, rollback: false });
                this.#emit("operations:failed", result);
                return result;
            }

            let validation;
            try { validation = await validateFn(); }
            catch (err) { validation = { valid: false, reason: err && err.message }; }

            if (!validation.valid) {
                const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
                this.#diagnostics.operationsFailed++;
                const result = { success: false, operation: operationName, target, reason: validation.reason, durationMs };
                this.#recordHistory({ operation: operationName, target, success: false, reason: validation.reason, durationMs, rollback: false });
                this.#emit("operations:failed", result);
                return result;
            }

            if (dryRun) {
                const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
                const result = { success: true, dryRun: true, operation: operationName, target, validation };
                this.#recordHistory({ operation: operationName, target, success: true, reason: "dry-run only, nothing executed", durationMs, rollback: false });
                this.#emit("operations:completed", result);
                return result;
            }

            let executionResult, rolledBack = false;
            try {
                executionResult = await executeFn();
            } catch (err) {
                if (rollbackFn) {
                    try { await rollbackFn(); rolledBack = true; this.#diagnostics.rollbacksPerformed++; }
                    catch (_rollbackErr) { /* rollback itself failed — still report the original error honestly below */ }
                }
                const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
                this.#diagnostics.operationsFailed++;
                const result = { success: false, operation: operationName, target, reason: err && err.message, rollback: rolledBack, durationMs };
                this.#recordHistory({ operation: operationName, target, success: false, reason: err && err.message, durationMs, rollback: rolledBack });
                this.#emit(rolledBack ? "operations:rollback" : "operations:failed", result);
                return result;
            }

            const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
            this.#diagnostics.operationsSucceeded++;
            const result = { success: true, operation: operationName, target, result: executionResult, durationMs };
            this.#recordHistory({ operation: operationName, target, success: true, reason: null, durationMs, rollback: false });
            this.#emit("operations:success", result);
            this.#emit("operations:completed", result);
            return result;
        }

        // =====================================================================
        // ─── APPLICATION OPERATIONS ─────────────────────────────────────────
        // =====================================================================
        launchApplication(appId, opts = {}) {
            return this.#run("application:launch", appId, opts,
                () => {
                    const ui = window.CozyOS.UI;
                    if (!ui || typeof ui.loadModule !== "function") return { valid: false, reason: "cozy-ui.js's loadModule() is not loaded." };
                    const moduleRegistry = window.CozyOS.ModuleRegistry;
                    if (moduleRegistry && typeof moduleRegistry.resolve === "function" && !moduleRegistry.resolve(appId)) {
                        return { valid: false, reason: `"${appId}" is not registered in ModuleRegistry.` };
                    }
                    return { valid: true };
                },
                async () => { await window.CozyOS.UI.loadModule(appId, opts.userId); return { launched: appId }; }
            );
        }
        stopApplication(appId, opts = {}) {
            return this.#run("application:stop", appId, opts,
                () => {
                    const app = window.CozyOS.Modules && window.CozyOS.Modules[appId];
                    if (!app) return { valid: false, reason: `"${appId}" is not a registered module.` };
                    if (typeof app.destroy !== "function") return { valid: false, reason: `"${appId}" does not implement destroy() — cannot be stopped safely.` };
                    return { valid: true };
                },
                async () => { window.CozyOS.Modules[appId].destroy(); return { stopped: appId }; }
            );
        }
        async restartApplication(appId, opts = {}) {
            const stopResult = await this.stopApplication(appId, opts);
            if (!stopResult.success) return stopResult;
            const launchResult = await this.launchApplication(appId, opts);
            if (!launchResult.success) {
                return { ...launchResult, note: "Application was stopped successfully but failed to relaunch. It is now STOPPED, not restored — there is no real prior in-memory state to roll back to." };
            }
            return launchResult;
        }
        validateApplication(appId, opts = {}) {
            return this.#run("application:validate", appId, { ...opts, dryRun: true },
                () => {
                    const moduleRegistry = window.CozyOS.ModuleRegistry;
                    const identity = window.CozyOS.IdentityEngine;
                    const manifest = moduleRegistry && typeof moduleRegistry.resolve === "function" ? moduleRegistry.resolve(appId) : null;
                    const registered = !!(window.CozyOS.Modules && window.CozyOS.Modules[appId]);
                    const accessCheck = (identity && opts.userId) ? identity.canAccessApplication(opts.userId, appId) : null;
                    return { valid: true, details: { manifestFound: !!manifest, registered, accessCheck } };
                },
                async () => ({})
            );
        }
        unregisterApplication(appId, opts = {}) {
            return this.#run("application:unregister", appId, opts,
                () => {
                    const reg = window.CozyOS.ServiceRegistry;
                    if (!reg) return { valid: false, reason: "ServiceRegistry is not loaded." };
                    if (!reg.hasApplication(appId)) return { valid: false, reason: `"${appId}" is not registered in ServiceRegistry.` };
                    return { valid: true };
                },
                async () => { window.CozyOS.ServiceRegistry.unregisterApplication(appId); return { unregistered: appId }; }
            );
        }

        // =====================================================================
        // ─── MODULE OPERATIONS ──────────────────────────────────────────────
        // =====================================================================
        unloadModule(moduleId, opts = {}) {
            return this.#run("module:unload", moduleId, opts,
                () => {
                    const reg = window.CozyOS.ModuleRegistry;
                    if (!reg) return { valid: false, reason: "ModuleRegistry is not loaded." };
                    if (!reg.has(moduleId)) return { valid: false, reason: `"${moduleId}" is not registered in ModuleRegistry.` };
                    return { valid: true };
                },
                async () => {
                    const reg = window.CozyOS.ModuleRegistry;
                    const snapshot = reg.get(moduleId); // real rollback snapshot, captured before removal
                    reg.remove(moduleId);
                    return { removed: moduleId, previousManifest: snapshot };
                }
            );
        }
        reRegisterModule(manifest, opts = {}) {
            return this.#run("module:reRegister", manifest && manifest.id, opts,
                () => (!manifest || !manifest.id) ? { valid: false, reason: "A real manifest object with an id is required — this operation cannot invent one." } : { valid: true },
                async () => window.CozyOS.ModuleRegistry.register(manifest)
            );
        }
        reloadModule(moduleId, newManifest, opts = {}) {
            return this.#run("module:reload", moduleId, opts,
                () => {
                    const reg = window.CozyOS.ModuleRegistry;
                    if (!reg) return { valid: false, reason: "ModuleRegistry is not loaded." };
                    if (!newManifest || newManifest.id !== moduleId) return { valid: false, reason: "A real replacement manifest with a matching id is required." };
                    return { valid: true };
                },
                async () => { window.CozyOS.ModuleRegistry.register(newManifest); return { reloaded: moduleId }; }
            );
        }
        validateModuleManifest(manifest, opts = {}) {
            return this.#run("module:validateManifest", manifest && manifest.id, { ...opts, dryRun: true },
                () => {
                    const reg = window.CozyOS.ModuleRegistry;
                    if (!reg || typeof reg.validate !== "function") return { valid: false, reason: "ModuleRegistry.validate() is not loaded." };
                    return { valid: true, details: reg.validate(manifest) };
                },
                async () => ({})
            );
        }
        refreshModuleMetadata(moduleId, opts = {}) {
            return this.#run("module:refreshMetadata", moduleId, { ...opts, dryRun: true },
                () => {
                    const reg = window.CozyOS.ModuleRegistry;
                    if (!reg) return { valid: false, reason: "ModuleRegistry is not loaded." };
                    return { valid: true, details: { record: reg.get(moduleId) } };
                },
                async () => ({})
            );
        }

        // =====================================================================
        // ─── COORDINATOR OPERATIONS ─────────────────────────────────────────
        // =====================================================================
        restartCoordinator(name, opts = {}) { return this.#run("coordinator:restart", name, opts, () => ({ valid: false }), async () => ({})); }
        restartEngine(name, opts = {}) { return this.#run("engine:restart", name, opts, () => ({ valid: false }), async () => ({})); }
        reconnectCoordinator(name, opts = {}) { return this.#run("coordinator:reconnect", name, opts, () => ({ valid: false }), async () => ({})); }
        reloadCoordinator(name, opts = {}) { return this.#run("coordinator:reload", name, opts, () => ({ valid: false }), async () => ({})); }

        reRegisterCoordinator(descriptor, opts = {}) {
            return this.#run("coordinator:reRegister", descriptor && descriptor.name, opts,
                () => (!descriptor || !descriptor.name) ? { valid: false, reason: "A real coordinator descriptor with a name is required." } : { valid: true },
                async () => window.CozyOS.ServiceRegistry.registerCoordinator(descriptor)
            );
        }
        validateCoordinatorRegistration(name, opts = {}) {
            return this.#run("coordinator:validateRegistration", name, { ...opts, dryRun: true },
                () => {
                    const reg = window.CozyOS.ServiceRegistry;
                    if (!reg) return { valid: false, reason: "ServiceRegistry is not loaded." };
                    const registered = reg.hasCoordinator(name);
                    const live = !!window.CozyOS[name];
                    return { valid: true, details: { registered, live, consistent: registered === live } };
                },
                async () => ({})
            );
        }
        refreshCoordinatorState(name, opts = {}) {
            return this.#run("coordinator:refreshState", name, { ...opts, dryRun: true },
                () => {
                    const obj = window.CozyOS[name];
                    if (!obj) return { valid: false, reason: `"${name}" is not live on window.CozyOS.` };
                    return { valid: true, details: { diagnostics: typeof obj.getDiagnosticsReport === "function" ? obj.getDiagnosticsReport() : null } };
                },
                async () => ({})
            );
        }
        unregisterCoordinator(name, opts = {}) {
            return this.#run("coordinator:unregister", name, opts,
                () => {
                    const disc = window.CozyOS.PlatformDiscovery;
                    if (!disc) return { valid: false, reason: "PlatformDiscovery is not loaded — cannot verify this coordinator is genuinely broken before removing its registration." };
                    const report = disc.getReport();
                    if (!report.available) return { valid: false, reason: "No Discovery scan has been run yet — run one first so there's a real signal to act on." };
                    if (!report.runtime.coordinators.declaredButMissing.includes(name)) {
                        return { valid: false, reason: `Discovery does not currently report "${name}" as declaredButMissing — refusing to unregister a coordinator that isn't confirmed broken.` };
                    }
                    return { valid: true };
                },
                async () => { window.CozyOS.ServiceRegistry.unregisterCoordinator(name); return { unregistered: name }; }
            );
        }

        // =====================================================================
        // ─── DISCOVERY / DEPENDENCY / USAGE / HEALTH / AUDIT / CERTIFICATION ───
        // Pure delegation — every one of these already had a real, complete
        // method on its real owner; this engine adds authorization + dry-run
        // + diagnostics around the call, nothing else.
        // =====================================================================
        runRuntimeDiscovery(opts = {}) { return this.#run("discovery:runRuntime", "platform", opts, () => window.CozyOS.PlatformDiscovery ? { valid: true } : { valid: false, reason: "PlatformDiscovery is not loaded." }, async () => window.CozyOS.PlatformDiscovery.scanRuntime()); }
        runManifestDiscovery(opts = {}) { return this.#run("discovery:runManifest", "platform", opts, () => window.CozyOS.PlatformDiscovery ? { valid: true } : { valid: false, reason: "PlatformDiscovery is not loaded." }, async () => window.CozyOS.PlatformDiscovery.scanManifest()); }
        runFullDiscovery(opts = {}) { return this.#run("discovery:runFull", "platform", opts, () => window.CozyOS.PlatformDiscovery ? { valid: true } : { valid: false, reason: "PlatformDiscovery is not loaded." }, async () => window.CozyOS.PlatformDiscovery.scan()); }

        refreshServiceRegistry(opts = {}) { return this.#run("registry:refreshService", "platform", { ...opts, dryRun: true }, () => window.CozyOS.ServiceRegistry ? { valid: true, details: { applications: window.CozyOS.ServiceRegistry.listApplications(), coordinators: window.CozyOS.ServiceRegistry.listCoordinators() } } : { valid: false, reason: "ServiceRegistry is not loaded." }, async () => ({})); }
        refreshModuleRegistry(opts = {}) { return this.#run("registry:refreshModule", "platform", { ...opts, dryRun: true }, () => window.CozyOS.ModuleRegistry ? { valid: true, details: { modules: window.CozyOS.ModuleRegistry.list({ includeDisabled: true }) } } : { valid: false, reason: "ModuleRegistry is not loaded." }, async () => ({})); }
        validateRegistrations(opts = {}) {
            return this.#run("registry:validate", "platform", { ...opts, dryRun: true },
                () => {
                    const disc = window.CozyOS.PlatformDiscovery;
                    if (!disc) return { valid: false, reason: "PlatformDiscovery is not loaded." };
                    const report = disc.getReport();
                    if (!report.available) return { valid: false, reason: "No scan has been run yet." };
                    return { valid: true, details: { declaredButMissing: report.runtime.coordinators.declaredButMissing, loadedButUndeclared: report.runtime.coordinators.loadedButUndeclared } };
                },
                async () => ({})
            );
        }
        repairRegistrations(opts = {}) {
            return this.#run("registry:repair", "platform", opts,
                () => {
                    const disc = window.CozyOS.PlatformDiscovery;
                    const registry = window.CozyOS.ServiceRegistry;
                    if (!disc || !registry) return { valid: false, reason: "PlatformDiscovery and ServiceRegistry are both required." };
                    const report = disc.getReport();
                    if (!report.available) return { valid: false, reason: "No scan has been run yet — run Discovery first so there's a real signal to act on." };
                    return { valid: true, details: { toRepair: report.runtime.coordinators.declaredButMissing } };
                },
                async () => {
                    const report = window.CozyOS.PlatformDiscovery.getReport();
                    const repaired = [];
                    for (const name of report.runtime.coordinators.declaredButMissing) {
                        try { window.CozyOS.ServiceRegistry.unregisterCoordinator(name); repaired.push(name); }
                        catch (_err) { /* leave that one alone, don't fail the whole batch */ }
                    }
                    return { repaired };
                }
            );
        }

        recalculateDependencies(opts = {}) { return this.#run("dependency:recalculate", "platform", opts, () => window.CozyOS.DependencyEngine ? { valid: true } : { valid: false, reason: "DependencyEngine is not loaded." }, async () => ({ missing: window.CozyOS.DependencyEngine.detectMissingDependencies(), circular: window.CozyOS.DependencyEngine.detectCircular() })); }
        locateCircularDependencies(opts = {}) { return this.#run("dependency:locateCircular", "platform", { ...opts, dryRun: true }, () => window.CozyOS.DependencyEngine ? { valid: true, details: window.CozyOS.DependencyEngine.detectCircular() } : { valid: false, reason: "DependencyEngine is not loaded." }, async () => ({})); }
        locateMissingDependencies(opts = {}) { return this.#run("dependency:locateMissing", "platform", { ...opts, dryRun: true }, () => window.CozyOS.DependencyEngine ? { valid: true, details: window.CozyOS.DependencyEngine.detectMissingDependencies() } : { valid: false, reason: "DependencyEngine is not loaded." }, async () => ({})); }

        refreshUsage(opts = {}) { return this.#run("usage:refresh", "platform", opts, () => window.CozyOS.UsageEngine ? { valid: true } : { valid: false, reason: "UsageEngine is not loaded." }, async () => window.CozyOS.UsageEngine.report()); }
        refreshDeadFileDetection(opts = {}) { return this.#run("usage:refreshDead", "platform", { ...opts, dryRun: true }, () => window.CozyOS.UsageEngine ? { valid: true, details: window.CozyOS.UsageEngine.listDeadFiles() } : { valid: false, reason: "UsageEngine is not loaded." }, async () => ({})); }
        refreshDuplicateDetection(opts = {}) { return this.#run("usage:refreshDuplicate", "platform", { ...opts, dryRun: true }, () => window.CozyOS.UsageEngine ? { valid: true, details: window.CozyOS.UsageEngine.listDuplicateCandidates() } : { valid: false, reason: "UsageEngine is not loaded." }, async () => ({})); }

        runHealthCheck(opts = {}) { return this.#run("health:run", "platform", opts, () => window.CozyOS.HealthEngine ? { valid: true } : { valid: false, reason: "HealthEngine is not loaded." }, async () => window.CozyOS.HealthEngine.report()); }
        validateServices(opts = {}) { return this.#filteredHealth("service", "health:validateServices", opts); }
        validateCoordinators(opts = {}) { return this.#filteredHealth("coordinator", "health:validateCoordinators", opts); }
        validateApplications(opts = {}) { return this.#filteredHealth("application", "health:validateApplications", opts); }
        #filteredHealth(ownerType, operationName, opts) {
            return this.#run(operationName, "platform", { ...opts, dryRun: true },
                () => {
                    const fileReg = window.CozyOS.FileRegistry;
                    const health = window.CozyOS.HealthEngine;
                    if (!fileReg || !health) return { valid: false, reason: "FileRegistry and HealthEngine are both required." };
                    const relevant = fileReg.list().filter(r => r.owner === ownerType);
                    return { valid: true, details: { count: relevant.length, badges: relevant.map(r => health.badgeFor(r.path)).filter(Boolean) } };
                },
                async () => ({})
            );
        }

        runFullAudit(opts = {}) { return this.#run("audit:runFull", "platform", opts, () => window.CozyOS.PlatformAudit ? { valid: true } : { valid: false, reason: "PlatformAudit is not loaded." }, async () => window.CozyOS.PlatformAudit.getFullAuditReport()); }
        runApplicationAudit(appId, opts = {}) { return this.#run("audit:runApplication", appId, opts, () => window.CozyOS.PlatformAudit ? { valid: true } : { valid: false, reason: "PlatformAudit is not loaded." }, async () => window.CozyOS.PlatformAudit.whyNotConnected(appId)); }
        exportAudit(opts = {}) {
            return this.#run("audit:export", "platform", { ...opts, dryRun: true }, () => window.CozyOS.PlatformAudit ? { valid: true } : { valid: false, reason: "PlatformAudit is not loaded." }, async () => ({}))
                .then(result => {
                    if (!result.success || typeof document === "undefined") return result;
                    try {
                        const report = window.CozyOS.PlatformAudit.getFullAuditReport();
                        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = `cozyos-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        return { ...result, exported: true };
                    } catch (_err) { return { ...result, exported: false }; }
                });
        }

        installPlugin(manifest, executionHandler, opts = {}) {
            return this.#run("plugin:install", manifest && manifest.id, opts,
                () => {
                    if (!window.CozyOS.PluginManager) return { valid: false, reason: "PluginManager is not loaded." };
                    if (!manifest || !manifest.id || !manifest.version) return { valid: false, reason: "A real plugin manifest with id and version is required — this operation cannot invent one." };
                    if (typeof executionHandler !== "function") return { valid: false, reason: "A real execution handler function is required." };
                    return { valid: true };
                },
                async () => window.CozyOS.PluginManager.register(manifest, executionHandler)
            );
        }
        enablePlugin(id, opts = {}) { return this.#run("plugin:enable", id, opts, () => ({ valid: false }), async () => ({})); }
        disablePlugin(id, opts = {}) { return this.#run("plugin:disable", id, opts, () => ({ valid: false }), async () => ({})); }
        restartPlugin(id, opts = {}) { return this.#run("plugin:restart", id, opts, () => ({ valid: false }), async () => ({})); }
        reloadPlugin(id, opts = {}) { return this.#run("plugin:reload", id, opts, () => ({ valid: false }), async () => ({})); }
        validatePlugin(id, opts = {}) {
            return this.#run("plugin:validate", id, { ...opts, dryRun: true },
                () => {
                    const pm = window.CozyOS.PluginManager;
                    if (!pm) return { valid: false, reason: "PluginManager is not loaded." };
                    const record = pm.get(id);
                    if (!record) return { valid: false, reason: `"${id}" is not a registered plugin.` };
                    return { valid: true, details: { health: typeof pm.health === "function" ? pm.health(id) : null } };
                },
                async () => ({})
            );
        }

        runCertification(sourceText, metadata, opts = {}) { return this.#run("certification:run", metadata && metadata.moduleId, opts, () => window.CozyOS.Certification ? { valid: true } : { valid: false, reason: "CozyCertification is not loaded." }, async () => window.CozyOS.Certification.certifyModule(sourceText, metadata)); }
        runRegression(opts = {}) { return this.#run("certification:runRegression", "platform", opts, () => window.CozyOS.Certification ? { valid: true } : { valid: false, reason: "CozyCertification is not loaded." }, async () => window.CozyOS.Certification.fullCertification()); }
        generateCertificationReport(report, format, opts = {}) { return this.#run("certification:generateReport", null, opts, () => window.CozyOS.Certification ? { valid: true } : { valid: false, reason: "CozyCertification is not loaded." }, async () => window.CozyOS.Certification.exportReport(report, format || "json")); }

        /** search:query — real, delegates to FileRegistry.search(), the same real search Enterprise Search already uses. */
        search(term, opts = {}) {
            return this.#run("search:query", term, { ...opts, dryRun: true },
                () => window.CozyOS.FileRegistry ? { valid: true, details: { results: window.CozyOS.FileRegistry.search(term) } } : { valid: false, reason: "FileRegistry is not loaded." },
                async () => ({})
            );
        }
        refreshDiagnostics(opts = {}) { return this.#run("diagnostics:refresh", "platform", opts, () => window.CozyOS.PlatformDiscovery ? { valid: true } : { valid: false, reason: "PlatformDiscovery is not loaded." }, async () => window.CozyOS.PlatformDiscovery.scan()); }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: OPERATIONS_VERSION, ...this.#diagnostics, historyCount: this.#history.length });
        }
    }

    if (window.CozyOS.PlatformOperations && typeof window.CozyOS.PlatformOperations.getVersion === "function") {
        const existingVersion = window.CozyOS.PlatformOperations.getVersion();
        if (existingVersion !== OPERATIONS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PlatformOperations existing v${existingVersion} conflicts with load target v${OPERATIONS_VERSION}.`);
        return;
    }

    window.CozyOS.PlatformOperations = new CozyPlatformOperations();
    // Application Visibility Registry — real, additive self-declaration.
    window.CozyOS.PlatformOperations.visibility = Object.freeze({
        appId: "platformOperations", name: "Operations Center", icon: "🛠", category: "platform-tool",
        launchTarget: Object.freeze({ center: "platformOperations" }),
        audience: "admin"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "PlatformOperations", category: "Platform", icon: "sliders",
                description: "The execution layer — a real Operations Registry (owner/permission/rollback/supported/category per operation), capability scanning (real, honestly empty until coordinators self-advertise), and fail-closed Identity authorization via checkResourcePermission(). Never fabricates a lifecycle capability a coordinator doesn't have."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
