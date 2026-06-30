/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── CENTRAL SYSTEM ORCHESTRATOR
 * FILE: core/connectivity/connectivity.js
 * VERSION: 1.0.0-CORE
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

export class CozyConnectivityKernel {
    constructor() {
        this.moduleId = "connectivity_kernel_core";
        this.version = "1.0.0-CORE";
        this.initialized = false;

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
            // Restore transaction queues and cached sessions atomically
            await this.recovery.rehydrateKernelState();
            await this.scheduler.startLoops();
            this.initialized = true;
            
            const bootTime = performance.now() - start;
            console.log(`✓ [CONNECTIVITY KERNEL] Active. Kernel initialization completed in ${bootTime.toFixed(2)}ms.`);
        } catch (fault) {
            console.error("🚨 [CONNECTIVITY KERNEL BOOT ERROR]", fault);
        }
    }

    /**
     * Unified Access Interface Pipeline for Application Dispatches
     */
    async dispatch(payload) {
        if (!this.initialized) {
            throw new Error("[CONNECTIVITY FAULT] Structural kernel subsystems are offline.");
        }

        this.metrics.recordInboundRequest(payload);

        // Security Isolation Check validation via core/security.js integration
        this._verifySecurityContext(payload.auth);

        // Deduplicate mutations via Smart Cache
        if (payload.action === "READ") {
            const cachedResult = await this.cache.lookup(payload);
            if (cachedResult) {
                this.metrics.recordCacheHit();
                return cachedResult;
            }
        }

        // Intercept pipeline if system is operating in air-gapped offline state
        if (this.offline.isAirGapped() || !this.offline.hasWanLink()) {
            return await this.offline.interceptAndQueue(payload);
        }

        // Direct request execution handling using Smart Routing
        try {
            return await this.router.route(payload);
        } catch (routeErr) {
            console.warn("[CONNECTIVITY ROUTE FAILURE] Falling back to transaction queue structures:", routeErr.message);
            return await this.queue.insert(payload);
        }
    }

    _verifySecurityContext(auth) {
        if (window.CozyOS?.Security?.checkPermission) {
            const authorized = window.CozyOS.Security.checkPermission(auth, "connectivity_access");
            if (!authorized) throw new Error("🔒 [SECURITY EXCEPTION] Unauthorized execution context context.");
        }
    }
}
