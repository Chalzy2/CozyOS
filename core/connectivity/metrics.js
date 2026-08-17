/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── LOW-OVERHEAD METRICS DAEMON
 * FILE: core/connectivity/metrics.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

export class PerformanceMetrics {
    constructor(kernel) {
        this.kernel = kernel;
        this.totalRequestsDispatched = 0;
        this.totalCacheHits = 0;
        this.averageInsertionLatencyMs = 0;

        // Additional runtime statistics
        this.kernelBootTime = Date.now();
        this.lastRequestTime = null;
        this.lastCacheHitTime = null;
        this.lastInsertionTime = null;
        this.lastError = null;

        // Queue insertion / latency tracking
        this.totalQueueInsertions = 0;
        this.peakLatencyMs = null;
        this.minimumLatencyMs = null;
    }

    recordInboundRequest(_request) {
        this.totalRequestsDispatched++;
        this.lastRequestTime = Date.now();
    }

    recordCacheHit() {
        this.totalCacheHits++;
        this.lastCacheHitTime = Date.now();
    }

    trackQueueInsertionTime(latency) {
        // Defensive validation so invalid latency values cannot corrupt the average
        if (typeof latency !== "number" || Number.isNaN(latency) || !Number.isFinite(latency) || latency < 0) {
            this.lastError = "invalid_latency_value";
            return;
        }

        // True running average
        this.totalQueueInsertions++;
        this.averageInsertionLatencyMs =
            ((this.averageInsertionLatencyMs * (this.totalQueueInsertions - 1)) + latency)
            / this.totalQueueInsertions;

        this.lastInsertionTime = Date.now();
        this.lastError = null;

        this.peakLatencyMs = (this.peakLatencyMs === null) ? latency : Math.max(this.peakLatencyMs, latency);
        this.minimumLatencyMs = (this.minimumLatencyMs === null) ? latency : Math.min(this.minimumLatencyMs, latency);
    }

    exportTelemetryBlock() {
        return Object.freeze({
            requests: this.totalRequestsDispatched,
            cacheHits: this.totalCacheHits,
            insertionLatency: this.averageInsertionLatencyMs
        });
    }

    /**
     * Returns a frozen snapshot of extended runtime diagnostics.
     * Additive only — does not affect exportTelemetryBlock()'s existing shape.
     */
    getMetricsStatus() {
        const cacheHitRatio = this.totalRequestsDispatched > 0
            ? this.totalCacheHits / this.totalRequestsDispatched
            : 0;

        const cacheHitPercentage = this.totalRequestsDispatched > 0
            ? (this.totalCacheHits / this.totalRequestsDispatched) * 100
            : 0;

        return Object.freeze({
            kernelBootTime: this.kernelBootTime,
            lastRequestTime: this.lastRequestTime,
            lastCacheHitTime: this.lastCacheHitTime,
            lastInsertionTime: this.lastInsertionTime,
            lastError: this.lastError,
            totalQueueInsertions: this.totalQueueInsertions,
            cacheHitRatio,
            cacheHitPercentage,
            averageLatencyMs: this.averageInsertionLatencyMs,
            peakLatencyMs: this.peakLatencyMs,
            minimumLatencyMs: this.minimumLatencyMs
        });
    }
}            
