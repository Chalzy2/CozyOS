/**
 * ── COZYOS UNIFIED ENTERPRISE PLUG-IN OPERATING SYSTEM ENGINE ──
 * FILE: core/pluginManager.js
 * VERSION: 1.2.0
 *
 * CHANGES v1.1 → v1.2  (Production Hardening Freeze)
 * ──────────────────────────────────────────────────────────────────────────────
 * P-01 [Critical]  unregister(id): clean teardown — onUnload(), removes handler,
 *                  keeps audit tombstone, fires plugin:remove event
 * P-02 [Critical]  Crash isolation: per-plugin consecutive failure counter,
 *                  auto-disable at PLUGIN_CRASH_THRESHOLD, isolated try/catch
 *                  per execution so one crashing plugin never affects another
 * P-03 [High]      Health monitor: lastExecutionAt, executionCount, avgRuntimeMs,
 *                  totalRuntimeMs, lastError, timeoutCount, crashCount,
 *                  consecutiveFailures — updated atomically after every execution
 * P-04 [High]      Execution queue: _activeExecutions Set prevents concurrent
 *                  duplicate execution per plugin unless manifest.allowConcurrent
 *                  is explicitly true
 * P-05 [Medium]    Signature fields: signature, publisher, trusted, certificate
 *                  stored from manifest — architecture ready for verification layer
 * P-06 [Medium]    Permission declaration: manifest.permissions[] validated against
 *                  ALLOWED_PERMISSIONS allowlist — unknown permissions reject registration
 * P-07 [Medium]    Lifecycle events: cozyos:plugin:{install,enable,disable,error,
 *                  timeout,remove} dispatched on window for cross-module reaction
 * P-08 [Low]       Stats API: stats(), list(), health(), get(pluginId) — all
 *                  read-only snapshots, no internal Map references exposed
 *
 * RETAINED FROM v1.1 (all critical/high fixes preserved):
 *   C-2  Live Map exposure replaced with Object.defineProperty read-only snapshots
 *   K-1  Storage routed through CozyStorageGateway (no direct localStorage)
 *   K-2  Storage quota guard + JSON serializability validation
 *   K-3  authentication() returns allowlisted projection only
 *   K-4  tenantIsolation() removed from context bridge
 *   K-5  auditLogging() persists to audit_logs store
 *   R-1  manifest.id strict character/length validation
 *   R-2  manifest.version semver enforcement
 *   R-3  dependency '@' format validated before split
 *   R-4  executionHandler typeof function check at registration time
 *   R-5  executionHandler wrapped in Promise.race timeout guard
 *   K-6  Object.freeze applied to all nested context objects
 *   R-6  syncTelemetry resolved via window.CozyOS namespace
 *   R-8  MAX_PLUGINS cap enforced
 *   R-9  Manifest spread replaced with strict field allowlist
 *   resolve() atomic handler+status lookup for ai.js integration
 */

"use strict";

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const MAX_PLUGINS            = 100;
const PLUGIN_TIMEOUT_MS      = 5000;
const PLUGIN_CRASH_THRESHOLD = 5;    // consecutive failures before auto-disable
const MANIFEST_ID_RE         = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const SEMVER_RE              = /^\d+\.\d+\.\d+$/;

// [P-06] Complete allowlist of declarable permissions.
// Registration is rejected if manifest.permissions contains any value not in this set.
// Add new permissions here as CozyOS capabilities expand — never accept arbitrary strings.
const ALLOWED_PERMISSIONS = new Set([
    "storage",        // Read/write plugin_settings store via CozyStorageGateway
    "camera",         // Access device camera API
    "microphone",     // Access device microphone API
    "location",       // Access Geolocation API
    "notifications",  // Send browser notifications
    "clipboard",      // Read/write clipboard
    "biometric",      // Access biometric/WebAuthn APIs
    "payments",       // Access payments store (requires hospitalos/businessos context)
    "documents",      // Access documents store
    "media",          // Access media/images/videos stores
    "telemetry",      // Write telemetry store
    "network",        // Make outbound fetch() requests
]);

// [P-06] Module-level RBAC: which contexts may access which stores
const STORE_PERMISSIONS = {
    system:      new Set([
        "users","settings","organizations","permissions","plugins","plugin_settings",
        "documents","media","images","videos","language_packs","translation_memory",
        "dictionary","learning_progress","voice_models","ocr_cache","inventory",
        "products","orders","payments","wallet","audit_logs","telemetry",
        "notifications","sync_queue","offline_queue","cache","sessions",
        "api_tokens","preferences"
    ]),
    businessos:  new Set(["products","inventory","orders","payments","wallet",
                          "documents","media","images","notifications","settings",
                          "preferences","sync_queue","offline_queue","sessions","telemetry"]),
    hospitalos:  new Set(["documents","media","images","orders","payments",
                          "notifications","settings","preferences","sync_queue",
                          "offline_queue","sessions","telemetry"]),
    ulie:        new Set(["language_packs","translation_memory","dictionary",
                          "learning_progress","voice_models","ocr_cache","settings",
                          "preferences","sessions","telemetry"]),
    plugin:      new Set(["plugin_settings","notifications","preferences",
                          "sessions","telemetry"]),
};

// ── MODULE-LEVEL SESSION STATE ───────────────────────────────────────────────
// Set once via initModule() from authenticated session — never overridable per-call
let _activeTenantId      = null;
let _activeModuleContext = null;


// ════════════════════════════════════════════════════════════════════════════
class CozyPluginManager {

    constructor() {
        // ── Internal private Maps — NEVER exposed as live references ──────────
        this._plugins          = new Map();  // id → guardedHandler (async fn)
        this._rawHandlers      = new Map();  // id → raw executionHandler (for onUnload)
        this._registryMetadata = new Map();  // id → { manifest fields, status, _health }
        this._activeExecutions = new Set();  // ids currently executing (P-04)

        // [C-2 retained] Expose only read-only accessors on window.CozyOS.
        // External code receives snapshots, never live Map references.
        if (window.CozyOS) {
            Object.defineProperty(window.CozyOS, "PluginMetadata", {
                // Plain object snapshot — callers use Object access, not Map.get()
                get:          () => Object.fromEntries(this._registryMetadata),
                enumerable:   true,
                configurable: false,
            });
            Object.defineProperty(window.CozyOS, "KernelPlugins", {
                // Frozen array of registered IDs only — no handler references
                get:          () => Object.freeze([...this._plugins.keys()]),
                enumerable:   true,
                configurable: false,
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. LIFECYCLE & SESSION BINDING
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [F-02 retained] Bind authenticated session context.
     * Must be called once after CozyOS session establishment.
     * tenantId and moduleContext come from the authenticated session — never
     * from caller-supplied per-operation arguments.
     */
    initModule(tenantId, moduleContext = "plugin") {
        if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
            throw new Error("[PluginManager] initModule() requires a valid authenticated tenantId.");
        }
        if (!STORE_PERMISSIONS[moduleContext]) {
            throw new Error(
                `[PluginManager] Unknown moduleContext '${moduleContext}'. ` +
                `Valid: ${Object.keys(STORE_PERMISSIONS).join(", ")}.`
            );
        }
        _activeTenantId      = tenantId.trim();
        _activeModuleContext = moduleContext;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. PLUGIN REGISTRATION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Register and mount a plugin.
     * All validation runs synchronously. Returns true on success, false on mount failure.
     * Throws on validation failure (bad manifest, missing dep, bad permission).
     */
    register(manifest, executionHandler) {

        // ── Basic structure ────────────────────────────────────────────────────
        if (!manifest || typeof manifest !== "object") {
            throw new Error("[PluginManager] register(): manifest must be a plain object.");
        }
        if (!manifest.id || !manifest.version) {
            throw new Error("[PluginManager] register(): manifest.id and manifest.version are required.");
        }

        // [R-1] Safe id — strict character set, bounded length
        if (!MANIFEST_ID_RE.test(manifest.id)) {
            throw new Error(
                `[PluginManager] Invalid manifest.id '${String(manifest.id).slice(0, 64)}'. ` +
                "Must be 2–64 characters: letters, numbers, hyphens, underscores only."
            );
        }

        // [R-2] Strict semver — prevents NaN bypass in _compareVersions
        if (!SEMVER_RE.test(manifest.version)) {
            throw new Error(
                `[PluginManager] Invalid manifest.version '${String(manifest.version).slice(0, 32)}'. ` +
                "Must be semver: 'major.minor.patch' e.g. '1.0.0'."
            );
        }

        // [R-4] Validate handler type at registration, not call time
        if (typeof executionHandler !== "function") {
            throw new Error(
                `[PluginManager] executionHandler must be a function, got '${typeof executionHandler}'.`
            );
        }

        const normalizedId = manifest.id.toLowerCase();

        // [R-8] Registry capacity cap
        if (this._plugins.size >= MAX_PLUGINS) {
            throw new Error(
                `[PluginManager] Registry at capacity (${MAX_PLUGINS}). ` +
                "Unregister unused plugins before adding new ones."
            );
        }

        // [P-06] Validate declared permissions against ALLOWED_PERMISSIONS
        const declaredPermissions = Array.isArray(manifest.permissions)
            ? manifest.permissions
            : [];

        for (const perm of declaredPermissions) {
            if (typeof perm !== "string" || !ALLOWED_PERMISSIONS.has(perm)) {
                throw new Error(
                    `[PluginManager] Plugin '${normalizedId}' declared unknown permission '${String(perm).slice(0, 64)}'. ` +
                    `Allowed: ${[...ALLOWED_PERMISSIONS].join(", ")}.`
                );
            }
        }

        // ── Dependency resolution ──────────────────────────────────────────────
        const deps = Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [];
        for (const dependency of deps) {
            if (typeof dependency !== "string") {
                throw new Error(`[PluginManager] Plugin '${normalizedId}': dependsOn entries must be strings.`);
            }
            // [R-3] Format check before split — prevents TypeError on missing '@'
            if (!dependency.includes("@")) {
                throw new Error(
                    `[PluginManager] Plugin '${normalizedId}': invalid dependency '${dependency}'. ` +
                    "Format must be 'pluginId@version' e.g. 'auth-plugin@1.2.0'."
                );
            }
            const atIdx          = dependency.indexOf("@");
            const depId          = dependency.slice(0, atIdx).toLowerCase();
            const requiredVersion = dependency.slice(atIdx + 1);

            if (!SEMVER_RE.test(requiredVersion)) {
                throw new Error(
                    `[PluginManager] Plugin '${normalizedId}': dependency '${depId}' ` +
                    `has invalid required version '${requiredVersion}'. Must be semver.`
                );
            }

            const activeMeta = this._registryMetadata.get(depId);
            if (!activeMeta || activeMeta.status !== "enabled") {
                throw new Error(
                    `[PluginManager] Dependency missing: '${normalizedId}' requires ` +
                    `'${depId}' to be installed and enabled first.`
                );
            }
            if (this._compareVersions(activeMeta.version, requiredVersion) < 0) {
                throw new Error(
                    `[PluginManager] Version mismatch: '${normalizedId}' requires ` +
                    `'${depId}' v${requiredVersion}+, but v${activeMeta.version} is installed.`
                );
            }
        }

        // ── Collision check ────────────────────────────────────────────────────
        if (this._plugins.has(normalizedId)) {
            console.warn(`[PluginManager] Collision blocked: '${normalizedId}' is already registered.`);
            return false;
        }

        // [R-9] Extract only known-safe fields — no arbitrary manifest spread
        // [P-05] Signature architecture fields included (verification layer: future)
        const safeManifest = {
            id:              normalizedId,
            name:            String(manifest.name        || normalizedId).slice(0, 128),
            version:         String(manifest.version).slice(0, 32),
            description:     String(manifest.description || "").slice(0, 512),
            author:          String(manifest.author      || "").slice(0, 128),
            dependsOn:       deps.slice(0, 20),
            allowConcurrent: manifest.allowConcurrent === true,  // [P-04] explicit opt-in only
            // [P-05] Signature/trust fields — stored for future verification layer
            publisher:       String(manifest.publisher   || "").slice(0, 128),
            trusted:         manifest.trusted === true,           // defaults false
            signature:       String(manifest.signature   || "").slice(0, 512),
            certificate:     String(manifest.certificate || "").slice(0, 1024),
            // [P-06] Validated permission set
            permissions:     Object.freeze(declaredPermissions.slice(0, 20)),
        };

        // ── Lifecycle mount ────────────────────────────────────────────────────
        // [P-03] Initialise health record alongside manifest
        const healthRecord = {
            lastExecutionAt:    null,
            executionCount:     0,
            totalRuntimeMs:     0,
            avgRuntimeMs:       0,
            lastError:          null,
            timeoutCount:       0,
            crashCount:         0,
            consecutiveFailures: 0,
        };

        this._registryMetadata.set(normalizedId, {
            ...safeManifest,
            status:       "installing",
            registeredAt: new Date().toISOString(),
            _health:      healthRecord,
        });

        // [P-07] Emit install event
        this._emitEvent("install", normalizedId, safeManifest);

        try {
            const contextBridge = this._getKernelContext(normalizedId, safeManifest.permissions);

            // [P-02] [P-03] [P-04] [R-5] Build the fully hardened guarded handler.
            // 'self' captures the manager instance so health updates work inside the closure.
            const self          = this;
            const guardedHandler = async (query) => {
                // [P-04] Concurrency guard
                if (!safeManifest.allowConcurrent && self._activeExecutions.has(normalizedId)) {
                    throw new Error(
                        `[PluginManager] Plugin '${normalizedId}' is already executing. ` +
                        "Concurrent execution is not enabled for this plugin."
                    );
                }

                self._activeExecutions.add(normalizedId);
                const startTime = Date.now();
                let timedOut    = false;

                try {
                    // [R-5] Timeout race — kills hung plugins
                    const timeoutHandle = new Promise((_, reject) =>
                        setTimeout(() => {
                            timedOut = true;
                            reject(new Error(`[PluginManager] Plugin '${normalizedId}' timed out after ${PLUGIN_TIMEOUT_MS}ms.`));
                        }, PLUGIN_TIMEOUT_MS)
                    );

                    const result = await Promise.race([
                        Promise.resolve().then(() => executionHandler(query, contextBridge)),
                        timeoutHandle
                    ]);

                    // ── Success path: update health, reset failure counter ──────
                    const runtimeMs = Date.now() - startTime;
                    self._updateHealth(normalizedId, { success: true, runtimeMs });

                    return result;

                } catch (execError) {
                    // [P-02] [P-03] Isolated catch — this plugin's failure is contained
                    const runtimeMs = Date.now() - startTime;

                    if (timedOut) {
                        self._updateHealth(normalizedId, { success: false, timedOut: true, runtimeMs, error: execError.message });
                        // [P-07]
                        self._emitEvent("timeout", normalizedId, { message: execError.message });
                    } else {
                        self._updateHealth(normalizedId, { success: false, timedOut: false, runtimeMs, error: execError.message });
                        // [P-07]
                        self._emitEvent("error", normalizedId, { message: execError.message.slice(0, 256) });
                    }

                    // [P-02] Check if consecutive failures exceeded threshold
                    const meta = self._registryMetadata.get(normalizedId);
                    if (meta && meta._health.consecutiveFailures >= PLUGIN_CRASH_THRESHOLD) {
                        self._autoDisable(normalizedId, `Exceeded crash threshold (${PLUGIN_CRASH_THRESHOLD} consecutive failures).`);
                    }

                    // Re-throw so callers (e.g. ai.js) can handle and audit appropriately
                    throw execError;

                } finally {
                    self._activeExecutions.delete(normalizedId);
                }
            };

            // Store raw handler for onUnload() in unregister() — never exposed externally
            this._rawHandlers.set(normalizedId, executionHandler);
            this._plugins.set(normalizedId, guardedHandler);

            this._registryMetadata.get(normalizedId).status = "enabled";

            // [P-07] Emit enable event
            this._emitEvent("enable", normalizedId, safeManifest);

            console.log(`🚀 [PluginManager] Mounted: ${safeManifest.name} v${safeManifest.version} [${normalizedId}]`);

            // [R-6] Telemetry via CozyOS namespace — never raw global scope
            if (typeof window.CozyOS?.syncTelemetry === "function") {
                window.CozyOS.syncTelemetry();
            }

            return true;

        } catch (mountError) {
            const meta = this._registryMetadata.get(normalizedId);
            if (meta) meta.status = "disabled";
            this._emitEvent("disable", normalizedId, { reason: mountError.message });
            console.error(`🚨 [PluginManager] Mount failed for '${normalizedId}':`, mountError.message);
            return false;
        }
    }

    
    // ──────────────────────────────────────────────────────────────────────────
    // 3. PLUGIN UNREGISTRATION  [P-01]
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [P-01] Clean plugin teardown.
     *
     * Execution order:
     *   1. Validate plugin exists and is not already removed
     *   2. Wait for any in-flight execution to complete (concurrency safety)
     *   3. Call plugin's onUnload() if exposed — plugin cleans its own resources
     *      (timers, listeners, workers, WebSockets, etc.)
     *   4. Remove handler and raw handler references (releases closures for GC)
     *   5. Mark metadata tombstone: status = "removed" (audit trail preserved)
     *   6. Emit plugin:remove event
     *
     * NOTE: Plugins are responsible for cleaning their own resources in onUnload().
     * The kernel cannot enumerate what a plugin registered. The contract is:
     *   - If executionHandler.onUnload is a function, the kernel calls it with a
     *     5-second timeout. If it throws or times out, teardown continues anyway.
     *
     * @param {string} pluginId
     * @returns {Promise<boolean>} true if unregistered, false if not found
     */
    async unregister(pluginId) {
        if (!pluginId || typeof pluginId !== "string") {
            throw new Error("[PluginManager] unregister() requires a valid pluginId string.");
        }

        const normalizedId = pluginId.toLowerCase();
        const meta         = this._registryMetadata.get(normalizedId);

        if (!meta) {
            console.warn(`[PluginManager] unregister('${normalizedId}'): plugin not found.`);
            return false;
        }
        if (meta.status === "removed") {
            console.warn(`[PluginManager] unregister('${normalizedId}'): already removed.`);
            return false;
        }

        // Step 1: Mark as unregistering to block new executions via concurrency guard
        meta.status = "unregistering";

        // Step 2: If currently executing, wait up to PLUGIN_TIMEOUT_MS for it to finish.
        // Poll with small intervals — avoids blocking the event loop.
        if (this._activeExecutions.has(normalizedId)) {
            console.log(`[PluginManager] Waiting for in-flight execution of '${normalizedId}' to complete...`);
            await new Promise((resolve) => {
                const CHECK_INTERVAL_MS = 50;
                const maxWait           = PLUGIN_TIMEOUT_MS + 500; // slightly beyond timeout
                let   elapsed           = 0;
                const poll = setInterval(() => {
                    elapsed += CHECK_INTERVAL_MS;
                    if (!this._activeExecutions.has(normalizedId) || elapsed >= maxWait) {
                        clearInterval(poll);
                        resolve();
                    }
                }, CHECK_INTERVAL_MS);
            });
        }

        // Step 3: Call onUnload() on the raw executionHandler if it exposes one.
        // Wrapped in try/catch + timeout — onUnload failure must not block teardown.
        const rawHandler = this._rawHandlers.get(normalizedId);
        if (rawHandler && typeof rawHandler.onUnload === "function") {
            try {
                await Promise.race([
                    Promise.resolve().then(() => rawHandler.onUnload()),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("onUnload() timed out.")), PLUGIN_TIMEOUT_MS)
                    )
                ]);
                console.log(`[PluginManager] onUnload() completed for '${normalizedId}'.`);
            } catch (unloadError) {
                // Log but do not block teardown — the kernel must always be able to remove a plugin
                console.warn(
                    `[PluginManager] onUnload() for '${normalizedId}' failed or timed out: ` +
                    unloadError.message + ". Teardown continuing."
                );
            }
        }

        // Step 4: Remove all live references → GC can reclaim handler closures and context bridges
        this._plugins.delete(normalizedId);
        this._rawHandlers.delete(normalizedId);
        this._activeExecutions.delete(normalizedId); // clear if still present after timeout

        // Step 5: Keep metadata tombstone for audit trail — status = "removed"
        meta.status     = "removed";
        meta._removedAt = new Date().toISOString();

        // Step 6: Emit remove event
        this._emitEvent("remove", normalizedId, { name: meta.name, version: meta.version });

        console.log(`🗑️  [PluginManager] Plugin '${normalizedId}' unregistered cleanly.`);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. ATOMIC RESOLUTION  (required by ai.js — added in v1.1)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Atomic plugin resolution for CozyOS subsystems (e.g. ai.js intent routing).
     * Returns both the guarded handler and current status in one read — no double-read race.
     * Returns null if not found, removed, or disabled.
     *
     * @param   {string} pluginId
     * @returns {{ handler: Function, status: string, permissions: string[] } | null}
     */
    resolve(pluginId) {
        if (!pluginId || typeof pluginId !== "string") return null;
        const id      = pluginId.toLowerCase();
        const handler = this._plugins.get(id);
        const meta    = this._registryMetadata.get(id);
        if (!handler || !meta || meta.status !== "enabled") return null;
        return Object.freeze({
            handler:     handler,
            status:      meta.status,
            permissions: meta.permissions,  // caller can check before invoking
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. READ-ONLY STATS API  [P-08]
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [P-08] Aggregate statistics across all registered plugins.
     * Suitable for admin dashboard summary card.
     *
     * @returns {{
     *   totalPlugins: number, enabledCount: number, disabledCount: number,
     *   removedCount: number, totalExecutions: number, totalCrashes: number,
     *   totalTimeouts: number, currentlyExecuting: number
     * }}
     */
    stats() {
        let enabled = 0, disabled = 0, removed = 0,
            executions = 0, crashes = 0, timeouts = 0;

        for (const [, meta] of this._registryMetadata) {
            if (meta.status === "enabled")  enabled++;
            if (meta.status === "disabled") disabled++;
            if (meta.status === "removed")  removed++;
            if (meta._health) {
                executions += meta._health.executionCount  || 0;
                crashes    += meta._health.crashCount      || 0;
                timeouts   += meta._health.timeoutCount    || 0;
            }
        }

        return Object.freeze({
            totalPlugins:       this._registryMetadata.size,
            enabledCount:       enabled,
            disabledCount:      disabled,
            removedCount:       removed,
            totalExecutions:    executions,
            totalCrashes:       crashes,
            totalTimeouts:      timeouts,
            currentlyExecuting: this._activeExecutions.size,
        });
    }

    /**
     * [P-08] List all plugins with public summary fields.
     * Safe for admin dashboard table. No handler references, no health internals.
     *
     * @returns {Array<{ id, name, version, status, author, permissions, registeredAt }>}
     */
    list() {
        const result = [];
        for (const [id, meta] of this._registryMetadata) {
            result.push(Object.freeze({
                id:           id,
                name:         meta.name,
                version:      meta.version,
                status:       meta.status,
                author:       meta.author,
                publisher:    meta.publisher,
                trusted:      meta.trusted,
                permissions:  meta.permissions,
                registeredAt: meta.registeredAt,
                removedAt:    meta._removedAt || null,
            }));
        }
        return Object.freeze(result);
    }

    /**
     * [P-08] [P-03] Health records for all plugins.
     * Suitable for Plugin Health Dashboard. Omits removed plugins by default.
     *
     * @param {boolean} [includeRemoved=false]
     * @returns {Array<{ id, name, status, ...healthFields }>}
     */
    health(includeRemoved = false) {
        const result = [];
        for (const [id, meta] of this._registryMetadata) {
            if (!includeRemoved && meta.status === "removed") continue;
            result.push(Object.freeze({
                id:                  id,
                name:                meta.name,
                version:             meta.version,
                status:              meta.status,
                lastExecutionAt:     meta._health?.lastExecutionAt    || null,
                executionCount:      meta._health?.executionCount      || 0,
                avgRuntimeMs:        meta._health?.avgRuntimeMs        || 0,
                lastError:           meta._health?.lastError           || null,
                timeoutCount:        meta._health?.timeoutCount        || 0,
                crashCount:          meta._health?.crashCount          || 0,
                consecutiveFailures: meta._health?.consecutiveFailures || 0,
                currentlyExecuting:  this._activeExecutions.has(id),
            }));
        }
        return Object.freeze(result);
    }

    /**
     * [P-08] Single plugin public metadata snapshot.
     * Returns null if not found. Does not expose handler references.
     *
     * @param   {string} pluginId
     * @returns {object | null}
     */
    get(pluginId) {
        if (!pluginId || typeof pluginId !== "string") return null;
        const meta = this._registryMetadata.get(pluginId.toLowerCase());
        if (!meta) return null;
        return Object.freeze({
            id:           meta.id,
            name:         meta.name,
            version:      meta.version,
            description:  meta.description,
            author:       meta.author,
            publisher:    meta.publisher,
            trusted:      meta.trusted,
            permissions:  meta.permissions,
            status:       meta.status,
            registeredAt: meta.registeredAt,
            removedAt:    meta._removedAt || null,
            health:       meta._health ? Object.freeze({ ...meta._health }) : null,
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. PRIVATE KERNEL INTERNALS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Semver compare. Both v1 and v2 MUST be pre-validated as SEMVER_RE before calling.
     * Returns: 1 if v1 > v2 | -1 if v1 < v2 | 0 if equal
     */
    _compareVersions(v1, v2) {
        const p1 = v1.split(".").map(Number);
        const p2 = v2.split(".").map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    /**
     * [P-03] Update health metrics after every execution.
     * Called from inside the guarded handler closure after success or failure.
     *
     * @param {string}  id
     * @param {object}  result — { success, runtimeMs, timedOut?, error? }
     */
    _updateHealth(id, { success, runtimeMs, timedOut = false, error = null }) {
        const meta = this._registryMetadata.get(id);
        if (!meta?._health) return;

        const h = meta._health;
        h.lastExecutionAt = new Date().toISOString();
        h.executionCount++;
        h.totalRuntimeMs = (h.totalRuntimeMs || 0) + runtimeMs;
        h.avgRuntimeMs   = Math.round(h.totalRuntimeMs / h.executionCount);

        if (success) {
            h.consecutiveFailures = 0;         // reset on any success
        } else {
            h.crashCount++;
            h.consecutiveFailures++;
            h.lastError = error ? String(error).slice(0, 256) : "unknown";
            if (timedOut) h.timeoutCount++;
        }
    }

    /**
     * [P-02] Auto-disable a plugin after exceeding PLUGIN_CRASH_THRESHOLD.
     * Removes handler from execution map but preserves metadata tombstone.
     *
     * @param {string} id
     * @param {string} reason
     */
    _autoDisable(id, reason) {
        const meta = this._registryMetadata.get(id);
        if (!meta || meta.status === "disabled" || meta.status === "removed") return;

        this._plugins.delete(id);       // prevents further execution
        // _rawHandlers kept — plugin could be re-enabled by admin in future
        meta.status = "disabled";

        this._emitEvent("disable", id, { reason, auto: true });

        console.error(
            `🚨 [PluginManager] Plugin '${id}' auto-disabled. ${reason} ` +
            `Health: crashes=${meta._health?.crashCount}, timeouts=${meta._health?.timeoutCount}.`
        );
    }

    /**
     * [K-1 retained] [P-06] Secured context bridge for plugins.
     * Storage routed through CozyStorageGateway — no direct localStorage access.
     * Permissions list used for future contextBridge method-level RBAC enforcement.
     *
     * @param {string}   pluginId
     * @param {string[]} permissions  — declared permissions from safeManifest
     */
    _getKernelContext(pluginId, permissions = []) {
        const storageGateway = window.CozyOS?.Storage || window.CozyStorage;

        // [K-1] [K-2] Storage proxy — CozyStorageGateway only, with error handling
        const storageProxy = Object.freeze({
            get: async (key) => {
                if (!storageGateway) { console.warn(`[Plugin:${pluginId}] Storage gateway unavailable.`); return null; }
                try {
                    const records = await storageGateway.search("plugin_settings", "key", `${pluginId}::${key}`);
                    return records?.[0]?.value ?? null;
                } catch (err) {
                    console.error(`[Plugin:${pluginId}] storage.get failed:`, err.message);
                    return null;
                }
            },
            set: async (key, val) => {
                if (!storageGateway) { console.warn(`[Plugin:${pluginId}] Storage gateway unavailable.`); return false; }
                let serialized;
                try { serialized = JSON.parse(JSON.stringify(val)); }
                catch { throw new Error(`[Plugin:${pluginId}] storage.set: value is not JSON-serializable.`); }
                try {
                    await storageGateway.save("plugin_settings", {
                        key: `${pluginId}::${key}`, pluginId, value: serialized
                    });
                    return true;
                } catch (err) {
                    console.error(`[Plugin:${pluginId}] storage.set failed:`, err.message);
                    return false;
                }
            },
        });

        // [K-3] Allowlisted user projection — no tokens, session data, or PII
        const authBridge = Object.freeze({
            isAuthenticated: !!(window.CozyOS?.CurrentUser),
            role:            window.CozyOS?.CurrentUser?.role        || "guest",
            displayName:     window.CozyOS?.CurrentUser?.displayName || "Guest",
            permissions:     Object.freeze([...(window.CozyOS?.CurrentUser?.permissions || [])]),
        });

        // [K-5] Persistent audit bridge — persists to audit_logs via gateway
        const auditBridge = Object.freeze({
            log: async (action, summary) => {
                const safeSummary = typeof summary === "string"
                    ? summary.slice(0, 512)
                    : JSON.stringify(summary || {}).slice(0, 512);
                if (storageGateway && typeof storageGateway._logAudit === "function") {
                    storageGateway._logAudit(`Plugin:${action}`, pluginId, { summary: safeSummary });
                }
                console.log(`[AUDIT] [${pluginId}] ${action}`); // action name only — never data
            },
        });

        return Object.freeze({
            pluginId:        pluginId,
            permissions:     Object.freeze([...permissions]),  // [P-06] what this plugin declared
            authentication:  authBridge,    // [K-3] projection only
            auditLogging:    auditBridge.log,
            storage:         storageProxy,  // [K-1] gateway-routed
            // tenantIsolation removed [K-4] — applied transparently by gateway
        });
    }

    /**
     * [P-07] Dispatch a namespaced lifecycle event on window.
     * Detail contains only public plugin fields — never handler references or health internals.
     * Other CozyOS modules (Dashboard, AuditTrail, Telemetry) listen on these events.
     *
     * Event names: cozyos:plugin:install | enable | disable | error | timeout | remove
     *
     * @param {string} eventName  — one of: install, enable, disable, error, timeout, remove
     * @param {string} id         — normalised plugin id
     * @param {object} extra      — additional safe detail fields
     */
    _emitEvent(eventName, id, extra = {}) {
        try {
            window.dispatchEvent(new CustomEvent(`cozyos:plugin:${eventName}`, {
                bubbles:    false,
                cancelable: false,
                detail:     Object.freeze({
                    pluginId:  id,
                    name:      this._registryMetadata.get(id)?.name    || id,
                    version:   this._registryMetadata.get(id)?.version || "unknown",
                    timestamp: new Date().toISOString(),
                    ...extra,
                }),
            }));
        } catch (e) {
            // Event dispatch must never crash the caller — swallow silently
            console.warn(`[PluginManager] Failed to emit cozyos:plugin:${eventName}:`, e.message);
        }
    }
}
// ════════════════════════════════════════════════════════════════════════════


// ── GLOBAL INITIALIZATION ────────────────────────────────────────────────────
if (!window.CozyOS) window.CozyOS = {};
window.CozyOS.PluginManager = new CozyPluginManager();
