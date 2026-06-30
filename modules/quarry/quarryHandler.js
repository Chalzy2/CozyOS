/**
 * ── CozyOS QUARRY MANAGER HANDLER & AI ENGINE ──
 * FILE: core/modules/quarry/quarryHandler.js
 * VERSION: 2.1.1 (Production Hardening Pass — Lifecycle/Health/Event tracking)
 * ARCHITECTURAL INVARIANT: Must expose async initialize/shutdown interfaces.
 *
 * NOTE: This is a stabilization pass on top of the frozen 2.1.0 architecture.
 * No business logic, AI routing, CUCK integration, manifest structure, public
 * methods, folder structure, or registration flow have been changed.
 */

"use strict";

const QUARRY_CAPABILITIES = Object.freeze([
    "predict_crusher_failure", "predict_fuel_consumption", "predict_maintenance",
    "estimate_stock_depletion", "recommend_selling_prices", "forecast_daily_production",
    "detect_theft", "detect_under_loading", "detect_overloading", "detect_idle_machines"
]);

const QUARRY_DEPENDENCIES = Object.freeze([
    "connectivity", "storage", "language", "security"
]);

// TODO: Replace these hard-coded event strings with shared constants once a
// CozyOS Connectivity Events module (e.g. ConnectivityEvents.NETWORK_ONLINE)
// is introduced platform-wide. No shared constants module currently exists,
// so the literal strings below are intentionally left unchanged to avoid
// creating a parallel/divergent event system.
const QUARRY_SYSTEM_EVENTS = Object.freeze([
    "NETWORK_ONLINE", "NETWORK_OFFLINE", "QUEUE_CHANGED", "SYNC_STARTED", "SYNC_FINISHED"
]);

class CozyQuarryHandler {
    constructor(masterController) {
        this.moduleId = "quarry_manager_core";
        this.version = "2.1.1";
        this.capabilities = new Set(QUARRY_CAPABILITIES);
        this._eventUnsubscribeTokens = [];

        // Runtime diagnostics state (additive only — does not alter existing
        // public API surface or stored data shape).
        this._runtimeState = {
            initialized: false,
            initError: null,
            connectivity: "unknown",   // "online" | "offline" | "unknown"
            syncStatus: "idle",        // "idle" | "syncing"
            queuedTransactionCount: null, // null = unknown (no QUEUE_CHANGED detail received yet)
            lastEventAt: null
        };

        // Dynamic registration via standard master core hooks
        if (masterController && typeof masterController.initializeSubEngine === "function") {
            masterController.initializeSubEngine("quarry", this);
        }
    }

    /**
     * 1. Lifecycle Initialization Boundary Entry Point
     */
    async initialize() {
        console.log("▶ [QUARRY MODULE] Executing asynchronous runtime boot routine...");
        try {
            this._establishCoreEventSubscriptions();
            this._runtimeState.initialized = true;
            this._runtimeState.initError = null;
        } catch (err) {
            // Initialization failures must be logged, never silently swallowed.
            this._runtimeState.initialized = false;
            this._runtimeState.initError = err && err.message ? err.message : String(err);
            console.error("❌ [QUARRY MODULE] Initialization failed:", err);
            throw err; // preserve original async/await failure semantics for callers
        }
    }

    /**
     * 2. Lifecycle Unloading Boundary Entry Point
     */
    async shutdown() {
        console.log("⚠️ [QUARRY MODULE] Tearing down components. Releasing active pipeline allocations...");
        // Detach all runtime communication bindings gracefully to prevent dangling memory loops
        this._eventUnsubscribeTokens.forEach(token => {
            if (typeof token.remove === "function") token.remove();
            else if (token.target) token.target.removeEventListener(token.type, token.handler);
        });
        this._eventUnsubscribeTokens = [];
        this._runtimeState.initialized = false;
    }

    /**
     * 3. Manifest Declaration Schema Mapping
     */
    getManifest() {
        return {
            name: "Quarry Manager Core",
            version: this.version,
            capabilities: QUARRY_CAPABILITIES,
            dependencies: QUARRY_DEPENDENCIES
        };
    }

    /**
     * 5. Unified Offline Core Event Subscription Interface
     * Decouples the business application from browser DOM mutations, switching instead to 
     * specific connectivity platform event markers.
     */
    _establishCoreEventSubscriptions() {
        const handlerProxy = (event) => this._handleKernelNetworkTransition(event.type, event.detail);

        // Map system hooks cleanly to the primary active platform document bus
        QUARRY_SYSTEM_EVENTS.forEach(type => {
            document.addEventListener(type, handlerProxy);
            this._eventUnsubscribeTokens.push({ target: document, type, handler: handlerProxy });
        });
    }

    _handleKernelNetworkTransition(eventType, details) {
        console.log(`📡 [QUARRY METRIC EVENT INTERCEPT] Token type processed: [${eventType}]`, details || "");

        // Track lightweight runtime diagnostics for getHealth(). Purely
        // observational — does not alter dispatch/business behavior.
        this._runtimeState.lastEventAt = Date.now();
        switch (eventType) {
            case "NETWORK_ONLINE":
                this._runtimeState.connectivity = "online";
                break;
            case "NETWORK_OFFLINE":
                this._runtimeState.connectivity = "offline";
                break;
            case "SYNC_STARTED":
                this._runtimeState.syncStatus = "syncing";
                break;
            case "SYNC_FINISHED":
                this._runtimeState.syncStatus = "idle";
                break;
            case "QUEUE_CHANGED":
                if (details && typeof details.count === "number") {
                    this._runtimeState.queuedTransactionCount = details.count;
                } else if (details && typeof details.queueLength === "number") {
                    this._runtimeState.queuedTransactionCount = details.queueLength;
                }
                break;
            default:
                break;
        }

        // Broadcast custom events directly to the UI panel context
        const uiPassthroughEvent = new CustomEvent(`COZY_QUARRY_UI_${eventType}`, { detail: details });
        document.dispatchEvent(uiPassthroughEvent);
    }

    /**
     * Storage Interface Wrapper
     */
    async save(collection, data, priority = "NORMAL") {
        const payload = {
            id: `qr-txn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            action: "WRITE",
            collection: `quarry_${collection}`,
            priority: priority,
            tenantId: window.CozyOS?.ActiveTenantId || "tenant_quarry_01",
            data: data,
            auth: { token: window.CozyOS?.Auth?.getCurrentToken?.() || "active_session_proxy" }
        };

        return await window.CozyOS.Connectivity.dispatch(payload);
    }

    /**
     * Unified AI Dispatch Resolution Engine Pipeline
     */
    async evaluate(query, context) {
        let intendedCapability = "reasoning";
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes("failure") || lowerQuery.includes("crusher")) intendedCapability = "predict_crusher_failure";
        else if (lowerQuery.includes("fuel")) intendedCapability = "predict_fuel_consumption";
        else if (lowerQuery.includes("maintenance") || lowerQuery.includes("service")) intendedCapability = "predict_maintenance";
        else if (lowerQuery.includes("depletion") || lowerQuery.includes("stock")) intendedCapability = "estimate_stock_depletion";
        else if (lowerQuery.includes("price")) intendedCapability = "recommend_selling_prices";
        else if (lowerQuery.includes("forecast") || lowerQuery.includes("production")) intendedCapability = "forecast_daily_production";
        else if (lowerQuery.includes("theft")) intendedCapability = "detect_theft";
        else if (lowerQuery.includes("loading") || lowerQuery.includes("weight")) intendedCapability = "detect_overloading";

        const aiPayload = {
            id: `ai-eval-${Date.now()}`,
            action: "READ",
            moduleContext: this.moduleId,
            requiredCapability: intendedCapability,
            query: query,
            auth: context.auth
        };

        return await window.CozyOS.Connectivity.dispatch(aiPayload);
    }

    getCapabilities() { return QUARRY_CAPABILITIES; }
    getDependencies() { return QUARRY_DEPENDENCIES; }
    getVersion() { return this.version; }

    /**
     * 3. Health Reporting — expanded with runtime diagnostics.
     * Backward compatible: `status` and `ready` remain present with the
     * same meaning/shape as v2.1.0. New fields are additive only.
     */
    getHealth() {
        const aiReady = !!(window.CozyOS && window.CozyOS.AI);
        return {
            status: this._runtimeState.initialized ? "healthy" : "degraded",
            ready: this._runtimeState.initialized,
            // --- additive diagnostics below ---
            connectivity: this._runtimeState.connectivity,
            syncStatus: this._runtimeState.syncStatus,
            queuedTransactionCount: this._runtimeState.queuedTransactionCount,
            aiReady: aiReady,
            lastEventAt: this._runtimeState.lastEventAt,
            initError: this._runtimeState.initError
        };
    }
}

/**
 * 4. Progressive Plugin/AI Registration Hook Wrapper
 */
(function autoRegisterEngine() {
    if (window.CozyOS?.AI) {
        const instance = new CozyQuarryHandler(window.CozyOS.AI);
        // Initialization is async; await it and log failures instead of
        // letting them fail silently (previous version fired-and-forgot).
        instance.initialize().catch(err => {
            console.error("❌ [QUARRY MODULE] Auto-registration initialize() failed:", err);
        });
    } else {
        window.addEventListener("CozyOS_AI_Ready", (e) => {
            const instance = new CozyQuarryHandler(e.detail);
            instance.initialize().catch(err => {
                console.error("❌ [QUARRY MODULE] Auto-registration initialize() failed:", err);
            });
        });
    }
})();
