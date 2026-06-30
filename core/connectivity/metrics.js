/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── LOW-OVERHEAD METRICS DAEMON
 * FILE: core/connectivity/metrics.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

export class PerformanceMetrics {
    constructor(kernel) {
        this.kernel = kernel;
        this.totalRequestsDispatched = 0;
        this.totalCacheHits = 0;
        this.averageInsertionLatencyMs = 0;
    }

    recordInboundRequest(p) { this.totalRequestsDispatched++; }
    recordCacheHit() { this.totalCacheHits++; }
    trackQueueInsertionTime(latency) {
        this.averageInsertionLatencyMs = (this.averageInsertionLatencyMs + latency) / 2;
    }

    exportTelemetryBlock() {
        return {
            requests: this.totalRequestsDispatched,
            cacheHits: this.totalCacheHits,
            insertionLatency: this.averageInsertionLatencyMs
        };
    }
}
