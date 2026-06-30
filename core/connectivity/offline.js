/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── OFFLINE BROKER & AIR-GAP BROKER
 * FILE: core/connectivity/offline.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

export class OfflineCoordinator {
    constructor(kernel) {
        this.kernel = kernel;
        this.airGappedState = !navigator.onLine;
        this._setupHardwareListeners();
    }

    _setupHardwareListeners() {
        window.addEventListener("online", () => this._handleLinkTransition(true));
        window.addEventListener("offline", () => this._handleLinkTransition(false));
    }

    _handleLinkTransition(isOnline) {
        this.airGappedState = !isOnline;
        console.log(`📡 [NETWORK TRANSITION] Device transitioned to: ${isOnline ? "ONLINE" : "OFFLINE"}`);
        
        if (isOnline) {
            this.kernel.router.triggerImmediateFailback();
        }
    }

    isAirGapped() {
        return this.airGappedState;
    }

    hasWanLink() {
        const diagnostics = this.kernel.diagnostics.getNetworkTopology();
        return diagnostics.wanAvailable;
    }

    async interceptAndQueue(payload) {
        console.log(`📦 [OFFLINE ENGINE] Intercepting execution frame. Writing payload [${payload.id}] to transactional queue.`);
        
        // Optimistic evaluation framework integration for application engines
        if (payload.action === "READ") {
            const executionFallback = await this.kernel.cache.lookup(payload);
            if (executionFallback) return executionFallback;
            
            // Query Local Backup Storage as secondary read source
            return await this._queryLocalDatabaseStorage(payload);
        }

        // Synchronous write persistence mapping fallback
        const taskId = await this.kernel.queue.insert(payload);
        return { success: true, status: "QUEUED_OFFLINE", taskId, message: "Transaction queued for background reconciliation." };
    }

    async _queryLocalDatabaseStorage(payload) {
        const storageEngine = window.CozyOS?.Storage || window.CozyStorage;
        if (storageEngine && typeof storageEngine.find === "function") {
            return await storageEngine.find(payload.collection, payload.query || {});
        }
        return null;
    }
          }
