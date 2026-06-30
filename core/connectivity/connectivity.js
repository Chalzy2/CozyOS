/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── CENTRAL SYSTEM ORCHESTRATOR
 * FILE: core/connectivity/connectivity.js
 * VERSION: 1.1.0-CORE (v2.4.1 Engine Contract Alignment — Stabilization Pass)
 *
 * NOTE: This is a hardening/alignment pass on top of the frozen 1.0.0-CORE
 * architecture. Class name, constructor, public method names, imports, and
 * exports are unchanged. No business logic, execution order, or offline-first
 * behavior has been altered.
 */

"use strict";

import { OfflineCoordinator } from "./offline.js";
import { SmartRouter } from "./routing.js";
import { UniversalQueue } from "./queue.js";
import { SmartCache } from "./cache.js";
import { NetworkPolicyEngine } from "./networkPolicy.js";
import { DiagnosticsEngine } from "./diagnostics.js";
import { PerformanceMetrics } from "./metrics.js";
import { RecoveryEngine } from "./recovery.js";
import { ChronosScheduler } from "./scheduler.js";

// Route-name prefixes treated as read/query operations for cache-lookup
// purposes, replacing the legacy `payload.action === "READ"` check. This is
// a naming convention, not a route registry — it does not invent or assume
// the existence of any specific route, it only classifies whichever route
// string is actually dispatched.
const READ_ROUTE_PREFIXES = Object.freeze(["get_", "read_", "fetch_", "query_"]);

export class CozyConnectivityKernel {
    constructor() {
        this.moduleId = "connectivity_kernel_core";
        this.version = "1.1.0-CORE";
        this.initialized = false;
        this.bootError = null;

        console.log("► [CONNECTIVITY KERNEL] Initializing Core Infrastructure...");

        // Component Registry Wiring
        this.metrics     = new PerformanceMetrics(this);
        this.diagnostics = new DiagnosticsEngine(this);
        this.policy      = new NetworkPolicyEngine(this);
        this.cache       = new SmartCache(this);
        this.queue       = new UniversalQueue(this);
        this.router      = new SmartRouter(this);
        this.offline     = new OfflineCoordinator(this);
        this.recovery    = new RecoveryEngine(this);
        this.scheduler   = new ChronosScheduler(this);

        this._bootstrapAsyncLayers();
    }

    async _bootstrapAsyncLayers() {
        const start = performance.now();
        try {
            console.log("► [CONNECTIVITY KERNEL] Rehydrating kernel state via Recovery Engine...");
            if (!this.recovery || typeof this.recovery.rehydrateKernelState !== "function") {
                throw new Error("Recovery Engine is unavailable or missing rehydrateKernelState().");
            }
            // Restore transaction queues and cached sessions atomically
            await this.recovery.rehydrateKernelState();

            console.log("► [CONNECTIVITY KERNEL] Starting Chronos Scheduler loops...");
            if (!this.scheduler || typeof this.scheduler.startLoops !== "function") {
                throw new Error("Chronos Scheduler is unavailable or missing startLoops().");
            }
            await this.scheduler.startLoops();

            this.initialized = true;
            this.bootError = null;

            const bootTime = performance.now() - start;
            console.log(`✓ [CONNECTIVITY KERNEL] Active. Kernel initialization completed in ${bootTime.toFixed(2)}ms.`);
            if (this.diagnostics?.recordBootSuccess) {
                this.diagnostics.recordBootSuccess({ bootTimeMs: bootTime });
            }
        } catch (fault) {
            // Recovery/Scheduler failures must fail initialization cleanly:
            // `initialized` stays false (dispatch() already rejects in that
            // state), the fault is preserved for diagnostics, and nothing
            // downstream silently proceeds as if boot succeeded.
            this.initialized = false;
            this.bootError = fault && fault.message ? fault.message : String(fault);
            console.error("🚨 [CONNECTIVITY KERNEL BOOT ERROR]", fault);
            if (this.diagnostics?.recordBootFailure) {
                this.diagnostics.recordBootFailure({ error: this.bootError });
            }
        }
    }

    /**
     * Unified Access Interface Pipeline for Application Dispatches.
     * Accepts the standard CozyOS v2.4.1 engine contract:
     *   { route, authContext, payload }
     * Public signature (`dispatch(payload)`) is unchanged — the single
     * argument is the full transaction envelope, exactly as before; only
     * its expected internal shape has been aligned to the v2.4.1 contract.
     */
    async dispatch(payload) {
        if (!this.initialized) {
            throw new Error("[CONNECTIVITY FAULT] Structural kernel subsystems are offline.");
        }

        const envelope = this._normalizeEnvelope(payload);

        if (this.metrics?.recordInboundRequest) {
            this.metrics.recordInboundRequest(envelope);
        }

        // Security Isolation Check validation via core/security.js integration
        this._verifySecurityContext(envelope.authContext);

        // Deduplicate route-based read operations via Smart Cache
        if (this._isReadRoute(envelope.route) && this.cache?.lookup) {
            const cachedResult = await this.cache.lookup(envelope);
            if (cachedResult) {
                if (this.metrics?.recordCacheHit) this.metrics.recordCacheHit();
                return cachedResult;
            }
        }

        // Intercept pipeline if system is operating in air-gapped offline state
        const isAirGapped = this.offline?.isAirGapped ? this.offline.isAirGapped() : false;
        const hasWanLink = this.offline?.hasWanLink ? this.offline.hasWanLink() : true;
        if (this.offline?.interceptAndQueue && (isAirGapped || !hasWanLink)) {
            return await this.offline.interceptAndQueue(envelope);
        }

        // Direct request execution handling using Smart Routing
        try {
            if (!this.router?.route) {
                throw new Error("Smart Router is unavailable.");
            }
            return await this.router.route(envelope);
        } catch (routeErr) {
            console.warn("[CONNECTIVITY ROUTE FAILURE] Falling back to transaction queue structures:", routeErr.message);
            if (!this.queue?.insert) {
                throw routeErr;
            }
            return await this.queue.insert(envelope);
        }
    }

    /**
     * Normalizes any incoming transaction request into the standard
     * { route, authContext, payload } envelope before it reaches cache,
     * offline, or routing logic. This is the single point where the
     * v2.4.1 engine contract is enforced — every downstream subsystem
     * (cache, offline, router, queue) consumes only this normalized shape,
     * eliminating remaining reliance on legacy `action` / `auth` / `id`
     * fields inside the dispatch pipeline itself.
     */
    _normalizeEnvelope(rawPayload) {
        if (!rawPayload || typeof rawPayload !== "object") {
            throw new TypeError("[CONNECTIVITY FAULT] Dispatch rejected: transaction envelope must be a valid object.");
        }

        const route = rawPayload.route;
        if (!route || typeof route !== "string") {
            throw new Error("[CONNECTIVITY FAULT] Dispatch rejected: missing required string field 'route'.");
        }

        const authContext = rawPayload.authContext !== undefined ? rawPayload.authContext : null;
        const innerPayload = (rawPayload.payload && typeof rawPayload.payload === "object") ? rawPayload.payload : {};

        return {
            route: route.trim(),
            authContext,
            payload: innerPayload
        };
    }

    /**
     * Route-based read classification used for cache lookups, replacing
     * the legacy `payload.action === "READ"` check. Pure naming-convention
     * check — does not invent, register, or assume any specific route.
     */
    _isReadRoute(route) {
        if (!route || typeof route !== "string") return false;
        const normalized = route.toLowerCase();
        return READ_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    }

    _verifySecurityContext(authContext) {
        if (window.CozyOS?.Security?.checkPermission) {
            const authorized = window.CozyOS.Security.checkPermission(authContext, "connectivity_access");
            if (!authorized) throw new Error("🔒 [SECURITY EXCEPTION] Unauthorized execution context context.");
        }
    }
}
