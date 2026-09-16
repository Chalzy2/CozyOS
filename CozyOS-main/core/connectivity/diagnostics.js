/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── NETWORK INSPECTOR DAEMON
 * FILE: core/connectivity/diagnostics.js
 * VERSION: 1.1.0-CORE
 */

"use strict";

// Approximate downlink speed (Mbps) per Network Information API effectiveType
// tier. effectiveType is a speed/RTT classification, not a connection-type
// indicator — it must never be used to infer wifi/cellular/lan, only as a
// last-resort linkSpeedMbps estimate when downlink is unavailable.
const EFFECTIVE_TYPE_SPEED_MBPS = Object.freeze({
    "slow-2g": 0.05,
    "2g": 0.25,
    "3g": 0.7,
    "4g": 4
});

export class DiagnosticsEngine {
    constructor(kernel) {
        this.kernel = kernel;

        // Runtime statistics
        this.totalTopologyQueries = 0;
        this.lastQueryTime = null;
        this.lastTopology = null;
        this.lastError = null;

        // Boot diagnostics
        this.lastBootSuccess = null;
        this.lastBootFailure = null;
    }

    /**
     * Returns the current network topology snapshot.
     * Existing field set and connection-type logic are preserved exactly;
     * this version adds defensive fallbacks for environments where
     * `navigator` or `navigator.connection` are unavailable, plus an
     * effectiveType-based linkSpeedMbps estimate when downlink is missing.
     * Never throws.
     */
    getNetworkTopology() {
        this.totalTopologyQueries++;
        this.lastQueryTime = Date.now();

        try {
            const hasNavigator = typeof navigator !== "undefined" && navigator !== null;
            const hardwareOnlineState = hasNavigator && typeof navigator.onLine === "boolean"
                ? navigator.onLine
                : false;

            // Interrogate standard connection API metrics safely
            const browserConnectionMeta = (hasNavigator && navigator.connection && typeof navigator.connection === "object")
                ? navigator.connection
                : {};

            const topology = {
                wanAvailable: hardwareOnlineState,
                lanConnected: hardwareOnlineState && (browserConnectionMeta.type === "ethernet" || browserConnectionMeta.type === "wifi"),
                wifiConnected: hardwareOnlineState && browserConnectionMeta.type === "wifi",
                cellularConnected: hardwareOnlineState && browserConnectionMeta.type === "cellular",
                satelliteConnected: false, // Default satellite configuration matrix allocation hook
                linkSpeedMbps: this._resolveLinkSpeedMbps(browserConnectionMeta)
            };

            this.lastTopology = topology;
            this.lastError = null;

            return topology;
        } catch (err) {
            this.lastError = (err && err.message) ? err.message : "unknown_error";

            const safeTopology = {
                wanAvailable: false,
                lanConnected: false,
                wifiConnected: false,
                cellularConnected: false,
                satelliteConnected: false,
                linkSpeedMbps: 0
            };

            this.lastTopology = safeTopology;

            return safeTopology;
        }
    }

    /**
     * Records successful boot diagnostics metadata. Storage only —
     * does not affect kernel behavior.
     */
    recordBootSuccess(metadata) {
        this.lastBootSuccess = {
            metadata: (metadata !== undefined) ? metadata : null,
            recordedAt: Date.now()
        };
    }

    /**
     * Records failed boot diagnostics metadata. Storage only —
     * does not affect kernel behavior.
     */
    recordBootFailure(metadata) {
        this.lastBootFailure = {
            metadata: (metadata !== undefined) ? metadata : null,
            recordedAt: Date.now()
        };
    }

    /**
     * Returns a frozen snapshot of diagnostics runtime statistics.
     */
    getDiagnosticsStatus() {
        return Object.freeze({
            totalTopologyQueries: this.totalTopologyQueries,
            lastQueryTime: this.lastQueryTime,
            lastTopology: this.lastTopology,
            lastError: this.lastError,
            lastBootSuccess: this.lastBootSuccess,
            lastBootFailure: this.lastBootFailure
        });
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Resolves linkSpeedMbps with a layered fallback:
     * 1. browserConnectionMeta.downlink, if a valid number (original behavior).
     * 2. An effectiveType-tier speed estimate, if downlink is unavailable.
     * 3. 0, if neither is available.
     *
     * effectiveType is never used to infer connection type (wifi/cellular/lan) —
     * only as a speed estimate, since it reflects measured speed/RTT class,
     * not the physical/medium connection type.
     */
    _resolveLinkSpeedMbps(browserConnectionMeta) {
        if (typeof browserConnectionMeta.downlink === "number" && !Number.isNaN(browserConnectionMeta.downlink)) {
            return browserConnectionMeta.downlink;
        }

        if (typeof browserConnectionMeta.effectiveType === "string" && browserConnectionMeta.effectiveType in EFFECTIVE_TYPE_SPEED_MBPS) {
            return EFFECTIVE_TYPE_SPEED_MBPS[browserConnectionMeta.effectiveType];
        }

        return 0;
    }
            }
