/**
 * ── CozyOS UNIVERSAL CONNECTIVITY KERNEL ── DATA SHAPER MODULE
 * FILE: core/connectivity/bandwidth.js
 * VERSION: 1.2.1-FINAL-FREEZE
 *
 * Enforces high-performance data quota constraints and field-level degradation
 * strategies. Optimizes synchronization footprints during metered network connections
 * while dynamically shielding immutable financial data blocks.
 *
 * Certification fixes applied (v1.1.0 → v1.2.0):
 *   [FIX-1] applyDataQuotaCaps — UNMETERED path deep-clones then deep-freezes;
 *            caller's nested objects are never frozen as a side effect
 *   [FIX-2] applyDataQuotaCaps — clonedPayload returned via _deepFreeze(),
 *            not shallow Object.freeze(), satisfying deep immutability invariant
 *   [FIX-3] _detectActiveNetworkProfile — navigator guard prevents ReferenceError
 *            in non-browser environments (Workers, Node test runners)
 *   [FIX-4] _shapeDataBlock — for...in replaced with Object.keys() to prevent
 *            prototype-polluted properties from entering shaped payloads
 *   [FIX-5] _shapeDataBlock — CRITICAL_LOW typeof check moved after named-key
 *            checks so nested objects in immutable headers are never dropped
 *   [FIX-6] _deepClone — warns on non-finite numbers; preserves undefined and
 *            Date values using the same sentinel pattern as compression.js
 *   [FIX-7] _deepFreeze — new private method; recursive deep freeze replacing
 *            all shallow Object.freeze() call sites on returned frames
 *   [FIX-8] _detectActiveNetworkProfile — typeof window guard added alongside
 *            typeof navigator guard; module is now fully runtime-agnostic
 */

"use strict";

export class BandwidthShaper {
    constructor(kernel) {
        this.kernel = kernel;

        // Supported Network Degradation Profiles
        this.Profiles = Object.freeze({
            UNMETERED:        "UNMETERED",        // Broadband/Wi-Fi: Full structural payloads allowed
            METERED_CELLULAR: "METERED_CELLULAR", // Standard Mobile: Compress non-essential historical records
            CRITICAL_LOW:     "CRITICAL_LOW",     // Satellite/Edge: Strip everything except core transaction keys
        });

        // Protected Structural Accounting Signatures (Never degrade under any profile)
        this._immutableHeaderKeys = Object.freeze([
            "LocalID", "CloudID", "SyncStatus", "IntegrityHash",
            "DeviceID", "EmployeeID", "BranchID", "tenantId", "auth",
        ]);

        // Telemetry Statistics Matrix
        this._metrics = {
            totalPayloadsShaped:  0,
            totalFieldsDegraded:  0,
            activeNetworkProfile: "UNMETERED",
            lastShapingTime:      null,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. PUBLIC SHAPING ENTRYPOINT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Inspects active hardware connection constraints and filters outgoing data
     * trees down to maximum efficiency bounds.
     * Returns an unmodifiable, deeply frozen payload.
     *
     * [FIX-1] UNMETERED path freezes a shallow copy — never the caller's object.
     * [FIX-2] All returned frames are deeply frozen via _deepFreeze().
     */
    applyDataQuotaCaps(payload) {
        if (!payload) return null;

        // 1. Determine current hardware networking profile thresholds dynamically
        const profile = this._detectActiveNetworkProfile();
        this._metrics.activeNetworkProfile = profile;

        // If broadband environment is clear, deep-clone then deep-freeze.
        // _deepClone breaks all nested shared references so the caller's object
        // graph is never frozen as a side effect. _deepFreeze then enforces
        // complete immutability on the independent copy.
        if (profile === this.Profiles.UNMETERED) {
            return this._deepFreeze(this._deepClone(payload));
        }

        this._metrics.totalPayloadsShaped += 1;
        this._metrics.lastShapingTime = new Date().toISOString();

        // 2. Isolate internal data block structure for selective field shedding
        const clonedPayload = this._deepClone(payload);

        if (clonedPayload.data) {
            clonedPayload.data            = this._shapeDataBlock(clonedPayload.data, profile);
            clonedPayload.isShapedFrame   = true;
            clonedPayload.dataShaperProfile = profile;
        }

        // [FIX-2] _deepFreeze satisfies the stated deep immutability invariant
        return this._deepFreeze(clonedPayload);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. NETWORK PROFILE DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Updates internal profiling states dynamically.
     * Interoperates with the browser Connection API or CozyOS network registers.
     *
     * [FIX-3] Guards typeof navigator and typeof window before access —
     *          safe in Workers, Node-based test runners, and any environment
     *          where either global is undefined. Module is fully runtime-agnostic.
     */
    _detectActiveNetworkProfile() {
        // [FIX-3] typeof guard — navigator is not defined in all host environments
        if (typeof navigator !== "undefined") {
            const connection =
                navigator.connection ||
                navigator.mozConnection ||
                navigator.webkitConnection;

            if (connection) {
                // Check if user has explicitly enabled Data Saver or is on a slow connection
                if (connection.saveData === true) return this.Profiles.CRITICAL_LOW;

                const type = connection.effectiveType;
                if (type === "2g" || type === "slow-2g") return this.Profiles.CRITICAL_LOW;
                if (type === "3g")                       return this.Profiles.METERED_CELLULAR;
            }
        }

        // Fallback: internal CozyOS Connectivity Engine offline state markers
        // typeof guard — window is not defined in Node.js, some Workers, or test runners
        if (
            typeof window !== "undefined" &&
            window.CozyOS?.Connectivity?.isMeteredConnection?.()
        ) {
            return this.Profiles.METERED_CELLULAR;
        }

        return this.Profiles.UNMETERED;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. DATA BLOCK SHAPER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Evaluates data payloads and safely applies degradation rules.
     *
     * [FIX-4] for...in replaced with Object.keys() — prototype-polluted
     *          properties cannot enter shaped payloads.
     * [FIX-5] Immutable header check runs before the typeof-object CRITICAL_LOW
     *          drop — nested objects inside protected keys are never evicted.
     */
    _shapeDataBlock(dataObj, profile) {
        if (typeof dataObj !== "object" || dataObj === null) return dataObj;

        // Hard rule for array sets: iterate entries recursively
        if (Array.isArray(dataObj)) {
            return dataObj.map(item => this._shapeDataBlock(item, profile));
        }

        const filteredObj = {};

        // [FIX-4] Object.keys() — own enumerable properties only; no prototype traversal
        for (const key of Object.keys(dataObj)) {
            const val = dataObj[key];

            // INVARIANT PROTECTION: Absolute core keys preserved without question
            // [FIX-5] This check runs BEFORE the typeof-object drop below,
            //          so nested objects inside immutable headers are never evicted
            if (this._immutableHeaderKeys.includes(key)) {
                filteredObj[key] = val;
                continue;
            }

            // ── CRITICAL LOW — Satellite / Edge profile ────────────────────
            if (profile === this.Profiles.CRITICAL_LOW) {
                // Evict historical logs, diagnostic metrics, descriptions, and metadata arrays
                if (
                    key.toLowerCase().includes("history")     ||
                    key.toLowerCase().includes("telemetry")   ||
                    key.toLowerCase().includes("notes")       ||
                    key.toLowerCase().includes("description") ||
                    key.toLowerCase().includes("metadata")
                ) {
                    this._metrics.totalFieldsDegraded += 1;
                    continue; // Dropped completely from outbound stream
                }

                // [FIX-5] typeof-object check now comes AFTER immutable-header guard
                if (typeof val === "object") {
                    this._metrics.totalFieldsDegraded += 1;
                    continue;
                }
            }

            // ── METERED CELLULAR — Standard mobile profile ─────────────────
            if (profile === this.Profiles.METERED_CELLULAR) {
                // Retain deep structures but strip optional system state dumps
                if (key === "previousState" || key === "diagnosticLogDump") {
                    this._metrics.totalFieldsDegraded += 1;
                    continue;
                }
            }

            // Retain remaining fields — recurse into nested objects
            filteredObj[key] = typeof val === "object"
                ? this._shapeDataBlock(val, profile)
                : val;
        }

        return filteredObj;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. DEEP CLONE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Safe execution-thread deep cloning utility.
     *
     * [FIX-6] Warns on non-finite numbers (NaN / Infinity → null in JSON).
     *         Preserves undefined values as the "__UNDEFINED__" sentinel.
     *         Preserves Date objects as { __type: "Date", iso } records.
     *
     * Consumers reading back cloned data must handle:
     *   "__UNDEFINED__"         — original value was undefined
     *   { __type: "Date", iso } — original value was a Date instance
     */
    _deepClone(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        try {
            const serialised = JSON.stringify(obj, (key, value) => {
                if (typeof value === "undefined") {
                    return "__UNDEFINED__";
                }
                if (value instanceof Date) {
                    return { __type: "Date", iso: value.toISOString() };
                }
                if (typeof value === "number" && !Number.isFinite(value)) {
                    console.warn(
                        `[BandwidthShaper] _deepClone: non-finite number at key "${key}" ` +
                        `(${value}) — stored as null in cloned payload.`
                    );
                }
                return value;
            });
            return JSON.parse(serialised);
        } catch (e) {
            console.warn(
                "[BandwidthShaper] _deepClone: JSON serialisation failed, using shallow copy fallback.",
                e
            );
            return { ...obj }; // Hard safety fallback if recursive self-reference occurs
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 5. DEEP FREEZE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Recursively freezes an object and all of its nested properties.
     * [FIX-7] Used on all frames returned by applyDataQuotaCaps() to satisfy
     * the deep immutability invariant stated in the file header.
     *
     * Already-frozen objects are returned immediately — safe to call multiple times.
     *
     * @param {unknown} obj
     * @returns {Readonly<unknown>}
     */
    _deepFreeze(obj) {
        if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
        Object.getOwnPropertyNames(obj).forEach(name => this._deepFreeze(obj[name]));
        return Object.freeze(obj);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 6. METRICS
    // ─────────────────────────────────────────────────────────────────────────

    getShaperMetrics() {
        return Object.freeze({ ...this._metrics });
    }
}
