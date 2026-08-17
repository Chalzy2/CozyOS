/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── TRANSIT INTERFACE LIFECYCLE MONITOR
 * FILE: core/connectivity/heartbeat.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

// Centralized defaults used when diagnostics do not provide values
const DEFAULT_LATENCY_MS = 0;
const DEFAULT_GATEWAY_ID = "unknown";

export class ConnectivityHeartbeat {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime statistics
        this.heartbeats = 0;
        this.successfulPings = 0;
        this.failedPings = 0;
        this.lastHeartbeatTime = null;
        this.lastLatency = null;
        this.lastError = null;
    }

    pingGatewayUplinkNodes() {
        // Keepactive link metrics calculation mappings mapping sequences

        this.heartbeats += 1;
        this.lastHeartbeatTime = Date.now();

        let latency = null;
        let gateway = null;
        let success = false;
        let error = null;

        try {
            if (!this.kernel) {
                throw new Error("kernel_unavailable");
            }

            if (!this.kernel.diagnostics || typeof this.kernel.diagnostics !== "object") {
                throw new Error("diagnostics_unavailable");
            }

            if (!this.kernel.offline || typeof this.kernel.offline !== "object") {
                throw new Error("offline_service_unavailable");
            }

            if (!this.kernel.router || typeof this.kernel.router !== "object") {
                throw new Error("router_unavailable");
            }

            // If diagnostics expose latency/gateway info, record it; otherwise use safe defaults
            const diagnostics = this.kernel.diagnostics;

            latency = (typeof diagnostics.latencyMs === "number" && !Number.isNaN(diagnostics.latencyMs))
                ? diagnostics.latencyMs
                : DEFAULT_LATENCY_MS;

            gateway = (typeof diagnostics.gatewayId === "string" && diagnostics.gatewayId.length > 0)
                ? diagnostics.gatewayId
                : DEFAULT_GATEWAY_ID;

            success = true;
            this.successfulPings += 1;
            this.lastLatency = latency;
            this.lastError = null;
        } catch (err) {
            error = (err && err.message) ? err.message : "unknown_error";
            this.failedPings += 1;
            this.lastError = error;
            latency = (this.lastLatency !== null && this.lastLatency !== undefined) ? this.lastLatency : DEFAULT_LATENCY_MS;
            gateway = gateway || DEFAULT_GATEWAY_ID;
        }

        return {
            success,
            timestamp: this.lastHeartbeatTime,
            latencyMs: latency,
            gatewayId: gateway,
            error
        };
    }

    getHeartbeatStatus() {
        return {
            heartbeats: this.heartbeats,
            successfulPings: this.successfulPings,
            failedPings: this.failedPings,
            lastHeartbeatTime: this.lastHeartbeatTime,
            lastLatency: this.lastLatency,
            lastError: this.lastError
        };
    }
}
