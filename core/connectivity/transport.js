/**
 * ── CozyOS UNIVERSAL CONNECTIVITY KERNEL — TRANSPORTS DRIVER REGISTRY ──
 * FILE: core/connectivity/transport.js
 * VERSION: 1.2.0-CORE
 */

"use strict";

// ── Safe string sanitiser ─────────────────────────────────────────────────────
function sanitiseKey(value, maxLen = 64) {
    return String(value ?? "").replace(/[^a-zA-Z0-9_\-]/g, "").trim().slice(0, maxLen);
}

// ── Default network request timeout (ms) ──────────────────────────────────────
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export class TransportRegistry {
    constructor(kernel) {
        this.kernel = kernel;
        this._drivers = new Map();

        // Runtime statistics — all mutations go through _recordSuccess / _recordFailure
        this.totalDriversRegistered   = 0;
        this.totalDriverOverwrites    = 0;
        this.totalDriversUnregistered = 0;
        this.totalExecutionAttempts   = 0;
        this.totalSuccessfulExecutions = 0;
        this.totalFailedExecutions    = 0;
        this.lastExecutionTime        = null;
        this.lastDriverKey            = null;
        this.lastError                = null;

        this._initializeBuiltInDrivers();
    }

    // ── BUILT-IN DRIVERS ─────────────────────────────────────────────────────

    _initializeBuiltInDrivers() {
        // LOCAL_DB — writes directly to the CozyOS storage gateway
        this.registerDriver("LOCAL_DB", {
            execute: async (payload) => {
                const storage =
                    (typeof window !== "undefined" && window.CozyOS?.Storage) ||
                    (typeof window !== "undefined" && window.CozyStorage);
                if (!storage || typeof storage.save !== "function") {
                    throw new Error("LOCAL_DB driver fault: storage is unavailable.");
                }
                return await storage.save(
                    payload.collection,
                    payload.data,
                    payload.partition || "user"
                );
            },
        });

        // WIFI — standard network fetch, no compression
        this.registerDriver("WIFI", {
            execute: async (payload) => {
                return await this._fireNetworkFetchRequest(payload);
            },
        });

        // MOBILE_DATA — bandwidth-compressed network fetch
        this.registerDriver("MOBILE_DATA", {
            execute: async (payload) => {
                if (
                    !this.kernel?.sync?.compressor ||
                    typeof this.kernel.sync.compressor.applyBinaryCompression !== "function"
                ) {
                    throw new Error("MOBILE_DATA driver fault: compressor is unavailable.");
                }
                // Apply strict bandwidth shaper parameters before execution
                const compressedPayload =
                    await this.kernel.sync.compressor.applyBinaryCompression(payload);
                return await this._fireNetworkFetchRequest(compressedPayload);
            },
        });
    }

    // ── DRIVER REGISTRATION ───────────────────────────────────────────────────

    /**
     * Registers a transport driver. Public method — signature is additive
     * (third `options` argument is optional and backward-compatible).
     *
     * A driver must expose at least one of execute(payload) or send(payload).
     * Both call shapes are normalised onto every registered driver so callers
     * using either contract work uniformly.
     *
     * If a key is already registered the previous driver is replaced (preserving
     * original overwrite behaviour); a warning is logged and tracked in stats
     * rather than silently swallowed.
     *
     * @param {string} key               — Unique driver identifier
     * @param {object} implementation    — Object with execute() and/or send()
     * @param {object} [options]
     * @param {string} [options.version] — Driver version string for diagnostics
     * @param {string} [options.description]
     */
    registerDriver(key, implementation, options = {}) {
        if (!key || typeof key !== "string") {
            throw new Error(
                "[DRIVER FAULT] Registry driver contract verification failed: " +
                "driver key must be a non-empty string."
            );
        }

        const safeKey = sanitiseKey(key);
        if (!safeKey) {
            throw new Error(
                `[DRIVER FAULT] Driver key "${key}" contains no valid characters after sanitisation.`
            );
        }

        if (!implementation || typeof implementation !== "object") {
            throw new Error(
                `[DRIVER FAULT] Registry driver contract verification failed for: ${safeKey} ` +
                "— implementation must be an object."
            );
        }

        const hasExecute = typeof implementation.execute === "function";
        const hasSend    = typeof implementation.send    === "function";

        if (!hasExecute && !hasSend) {
            throw new Error(
                `[DRIVER FAULT] Driver "${safeKey}" must expose at least one of execute() or send().`
            );
        }

        // ── Contract normalisation ────────────────────────────────────────────
        // Ensure both call shapes are available on every driver.
        if (hasExecute && !hasSend) {
            implementation.send = implementation.execute;
        }
        if (hasSend && !hasExecute) {
            implementation.execute = implementation.send;
        }

        // ── Overwrite guard ───────────────────────────────────────────────────
        if (this._drivers.has(safeKey)) {
            console.warn(
                `[TransportRegistry] Driver "${safeKey}" is already registered. ` +
                "Replacing with new implementation."
            );
            this.totalDriverOverwrites++;
        } else {
            this.totalDriversRegistered++;
        }

        this._drivers.set(safeKey, {
            implementation,
            registeredAt: new Date().toISOString(),
            version:      options.version     || "unknown",
            description:  options.description || "",
            executionCount: 0,
            failureCount:   0,
            lastUsed:       null,
        });

        return true;
    }

    // ── DRIVER MANAGEMENT ─────────────────────────────────────────────────────

    /**
     * Remove a registered driver by key.
     * Built-in drivers can be unregistered if explicitly required at runtime.
     *
     * @param {string} key
     * @returns {boolean} true if the driver was found and removed
     */
    unregisterDriver(key) {
        const safeKey = sanitiseKey(key);
        if (!this._drivers.has(safeKey)) {
            console.warn(`[TransportRegistry] unregisterDriver: driver "${safeKey}" not found.`);
            return false;
        }
        this._drivers.delete(safeKey);
        this.totalDriversUnregistered++;
        return true;
    }

    /**
     * Returns true if a driver with the given key is currently registered.
     *
     * @param {string} key
     * @returns {boolean}
     */
    hasDriver(key) {
        return this._drivers.has(sanitiseKey(key));
    }

    /**
     * Returns an array of all registered driver keys.
     *
     * @returns {string[]}
     */
    listDrivers() {
        return Array.from(this._drivers.keys());
    }

    // ── EXECUTION ─────────────────────────────────────────────────────────────

    /**
     * Execute a registered driver by key.
     * Tracks attempt, success, and failure statistics.
     *
     * @param {string} key      — Registered driver key
     * @param {object} payload  — Payload forwarded to driver.execute()
     * @returns {Promise<unknown>}
     */
    async execute(key, payload) {
        const safeKey = sanitiseKey(key);
        this.totalExecutionAttempts++;
        this.lastDriverKey = safeKey;

        const entry = this._drivers.get(safeKey);
        if (!entry) {
            const err = new Error(
                `[TransportRegistry] execute: driver "${safeKey}" is not registered.`
            );
            this._recordFailure(err);
            throw err;
        }

        try {
            const result = await entry.implementation.execute(payload);
            this._recordSuccess(entry);
            return result;
        } catch (err) {
            this._recordFailure(err, entry);
            throw err;
        }
    }

    /**
     * Alias for execute() — supports callers that use the send() contract.
     */
    async send(key, payload) {
        return this.execute(key, payload);
    }

    // ── STATUS & DIAGNOSTICS ──────────────────────────────────────────────────

    /**
     * Returns a frozen snapshot of the transport registry's current status.
     * Safe to expose to dashboards and diagnostics panels.
     *
     * @returns {Readonly<object>}
     */
    getTransportStatus() {
        const driverSnapshots = {};
        for (const [key, entry] of this._drivers.entries()) {
            driverSnapshots[key] = Object.freeze({
                version:        entry.version,
                description:    entry.description,
                registeredAt:   entry.registeredAt,
                executionCount: entry.executionCount,
                failureCount:   entry.failureCount,
                lastUsed:       entry.lastUsed,
            });
        }

        return Object.freeze({
            totalDriversRegistered:    this.totalDriversRegistered,
            totalDriverOverwrites:     this.totalDriverOverwrites,
            totalDriversUnregistered:  this.totalDriversUnregistered,
            totalExecutionAttempts:    this.totalExecutionAttempts,
            totalSuccessfulExecutions: this.totalSuccessfulExecutions,
            totalFailedExecutions:     this.totalFailedExecutions,
            lastExecutionTime:         this.lastExecutionTime,
            lastDriverKey:             this.lastDriverKey,
            lastError:                 this.lastError,
            registeredDrivers:         this.listDrivers(),
            drivers:                   driverSnapshots,
        });
    }

    // ── DEFENSIVE NETWORKING ──────────────────────────────────────────────────

    /**
     * Internal fetch wrapper used by WIFI and MOBILE_DATA drivers.
     * Verifies fetch availability, enforces a timeout, and returns
     * structured error objects rather than propagating raw fetch exceptions.
     *
     * @param {object} payload
     * @param {string} payload.url
     * @param {string} [payload.method]
     * @param {object} [payload.headers]
     * @param {unknown} [payload.body]
     * @param {number}  [payload.timeoutMs]
     * @returns {Promise<object>} Structured response: { ok, status, data }
     */
    async _fireNetworkFetchRequest(payload) {
        // Verify fetch API availability — not guaranteed in all CozyOS host environments
        if (typeof fetch !== "function") {
            throw new Error(
                "[TransportRegistry] Network fetch is unavailable in this runtime environment."
            );
        }

        if (!payload?.url || typeof payload.url !== "string") {
            throw new Error("[TransportRegistry] _fireNetworkFetchRequest: payload.url is required.");
        }

        const timeoutMs = Number(payload.timeoutMs) || DEFAULT_FETCH_TIMEOUT_MS;
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(payload.url, {
                method:  payload.method  || "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, payload.headers || {}),
                body:    payload.body !== undefined
                    ? (typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body))
                    : undefined,
                signal:  controller.signal,
            });

            clearTimeout(timeoutHandle);

            let data = null;
            const contentType = response.headers.get("content-type") || "";
            try {
                data = contentType.includes("application/json")
                    ? await response.json()
                    : await response.text();
            } catch (_) {
                data = null;
            }

            if (!response.ok) {
                throw new Error(
                    `[TransportRegistry] HTTP ${response.status} from ${payload.url}: ` +
                    `${typeof data === "string" ? data.slice(0, 256) : JSON.stringify(data).slice(0, 256)}`
                );
            }

            return Object.freeze({ ok: true, status: response.status, data });

        } catch (err) {
            clearTimeout(timeoutHandle);

            if (err.name === "AbortError") {
                throw new Error(
                    `[TransportRegistry] Request to ${payload.url} timed out after ${timeoutMs}ms.`
                );
            }
            throw err;
        }
    }

    // ── INTERNAL STAT HELPERS ─────────────────────────────────────────────────

    _recordSuccess(entry) {
        this.totalSuccessfulExecutions++;
        this.lastExecutionTime = new Date().toISOString();
        if (entry) {
            entry.executionCount++;
            entry.lastUsed = this.lastExecutionTime;
        }
    }

    _recordFailure(err, entry) {
        this.totalFailedExecutions++;
        this.lastExecutionTime = new Date().toISOString();
        this.lastError         = err?.message || String(err);
        if (entry) {
            entry.failureCount++;
            entry.lastUsed = this.lastExecutionTime;
        }
    }
                }
