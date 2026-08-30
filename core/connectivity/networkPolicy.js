/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── ENGINE CONSTRAINT PROFILES RULES ENGINE
 * FILE: core/connectivity/networkPolicy.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

// Centralized policy thresholds
const MIN_LINK_SPEED_MBPS = 1.0;

// Safe default policy returned when diagnostics are unavailable or invalid
const SAFE_DEFAULT_POLICY = Object.freeze({
    allowCacheLookup: false,
    restrictWifi: false,
    allowCellularTraffic: true,
    applyThrottling: false
});

export class NetworkPolicyEngine {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime statistics
        this.evaluations = 0;
        this.lastEvaluationTime = null;
        this.lastPolicy = null;
        this.lastError = null;
    }

    evaluateDynamicConstraints() {
        this.evaluations += 1;
        this.lastEvaluationTime = Date.now();

        try {
            if (!this.kernel || !this.kernel.diagnostics || typeof this.kernel.diagnostics.getNetworkTopology !== "function") {
                this.lastError = "diagnostics_unavailable";
                this.lastPolicy = SAFE_DEFAULT_POLICY;
                return SAFE_DEFAULT_POLICY;
            }

            const diagnostics = this.kernel.diagnostics.getNetworkTopology();

            if (!diagnostics || typeof diagnostics.linkSpeedMbps !== "number" || Number.isNaN(diagnostics.linkSpeedMbps)) {
                this.lastError = "invalid_diagnostics";
                this.lastPolicy = SAFE_DEFAULT_POLICY;
                return SAFE_DEFAULT_POLICY;
            }

            this.lastError = null;

            let policy;
            // Optimize constraints dynamically based on link quality profile mutations
            if (diagnostics.linkSpeedMbps < MIN_LINK_SPEED_MBPS) {
                policy = { allowCacheLookup: true, restrictWifi: false, allowCellularTraffic: false, applyThrottling: true };
            } else {
                policy = { allowCacheLookup: false, restrictWifi: false, allowCellularTraffic: true, applyThrottling: false };
            }

            this.lastPolicy = policy;
            return policy;
        } catch (err) {
            this.lastError = (err && err.message) ? err.message : "unknown_error";
            this.lastPolicy = SAFE_DEFAULT_POLICY;
            return SAFE_DEFAULT_POLICY;
        }
    }

    getPolicyStatus() {
        return {
            evaluations: this.evaluations,
            lastEvaluationTime: this.lastEvaluationTime,
            lastPolicy: this.lastPolicy,
            lastError: this.lastError
        };
    }
}
