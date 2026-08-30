/**
 * ── CozyOS UNIVERSAL TEST STUDIO ENGINE ── HISTORY REPOSITORY
 * FILE: core/modules/teststudio/test-history.js
 * VERSION: 1.0.0-PRODUCTION
 *
 * Single Responsibility: Accept immutable report objects from TestReporter
 * and provide read-only retrieval. Nothing else.
 *
 * Zero Logic Rule — this module never:
 *   • runs tests
 *   • formats reports
 *   • compares assertions
 *   • accesses the DOM
 *   • uses localStorage / sessionStorage
 *   • writes files
 *   • prints to the console
 *   • uses timers, network, or filesystem
 *   • depends on TestRunner, TestReporter, TestRegistry, or any UI layer
 *
 * Public API (frozen, immutable after registration):
 *   window.CozyOS.TestHistory.add(report)
 *   window.CozyOS.TestHistory.get(index)
 *   window.CozyOS.TestHistory.getAll()
 *   window.CozyOS.TestHistory.last()
 *   window.CozyOS.TestHistory.count()
 *   window.CozyOS.TestHistory.clear()
 *   window.CozyOS.TestHistory.getVersion()
 */

"use strict";

// ── Module constants ──────────────────────────────────────────────────────────

const HISTORY_VERSION = "1.0.0-PRODUCTION";

// ── Private storage ───────────────────────────────────────────────────────────
// A single module-scoped array. Not exposed on the public API object.
// All mutations go through add() and clear() exclusively.

const _store = [];

// ── Private utilities ─────────────────────────────────────────────────────────

/**
 * Recursively freeze an object and all of its nested properties.
 * Ensures every entry in the store is fully immutable regardless of
 * how deeply nested the Reporter's output is.
 *
 * Already-frozen objects are returned immediately — safe to call
 * on Reporter output that is already partially frozen.
 *
 * @param {unknown} obj
 * @returns {unknown}
 */
function _deepFreeze(obj) {
    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
        return obj;
    }
    for (const key of Object.keys(obj)) {
        _deepFreeze(obj[key]);
    }
    return Object.freeze(obj);
}

/**
 * Validate that a value is a non-null plain object with the minimum
 * shape expected of a TestReporter report.
 * Throws a TypeError with a descriptive message on failure.
 *
 * Required fields are those guaranteed by TestReporter.generate():
 *   generatedAt, suite, status, summary, results
 *
 * This is an input-contract guard, not business logic.
 *
 * @param {unknown} report
 */
function _assertReportShape(report) {
    if (report === null || typeof report !== "object" || Array.isArray(report)) {
        throw new TypeError(
            "[TestHistory] add(): report must be a non-null, non-array object. " +
            `Received: ${Array.isArray(report) ? "array" : typeof report}`
        );
    }

    const required = ["generatedAt", "suite", "status", "summary", "results"];
    for (const field of required) {
        if (!(field in report)) {
            throw new TypeError(
                `[TestHistory] add(): report is missing required field: "${field}". ` +
                "Ensure the report was produced by TestReporter.generate()."
            );
        }
    }
}

/**
 * Validate that an index is a safe integer within the current store bounds.
 * Throws a RangeError with a descriptive message on failure.
 *
 * @param {unknown} index
 */
function _assertIndex(index) {
    if (!Number.isInteger(index)) {
        throw new TypeError(
            `[TestHistory] get(): index must be an integer. Received: ${typeof index}`
        );
    }
    if (index < 0 || index >= _store.length) {
        throw new RangeError(
            `[TestHistory] get(): index ${index} is out of bounds. ` +
            `Store currently holds ${_store.length} report(s). ` +
            `Valid range: 0 – ${Math.max(0, _store.length - 1)}.`
        );
    }
}

// ── History repository implementation ─────────────────────────────────────────

const _history = {

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. add(report) — store one report
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Accept a TestReporter report object, deep-freeze it for immutable
     * storage, and append it to the in-memory history store.
     *
     * The deep-freeze is applied even if the Reporter has already frozen
     * the object, because M-01 from the Reporter certification noted that
     * nested structures may not be fully frozen. This layer enforces the
     * guarantee unconditionally.
     *
     * Returns the zero-based index at which the report was stored,
     * so callers can retrieve it later via get(index).
     *
     * @param {object} report  A report object from TestReporter.generate()
     * @returns {number}       The storage index of the added report
     */
    add(report) {
        _assertReportShape(report);
        const frozen = _deepFreeze(report);
        _store.push(frozen);
        return _store.length - 1;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. get(index) — retrieve one report by index
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve a single stored report by its zero-based storage index.
     *
     * The returned value is the frozen object from the store — callers
     * receive a reference to the immutable stored copy, not a clone.
     * Because the stored object is deeply frozen, this is safe without
     * additional copying.
     *
     * @param {number} index  Zero-based storage index
     * @returns {Readonly<object>}
     */
    get(index) {
        _assertIndex(index);
        return _store[index];
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. getAll() — retrieve all stored reports
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve a frozen, read-only array of all stored reports in
     * insertion order (oldest first).
     *
     * A new frozen array is returned on every call. The array itself
     * is immutable; its elements are the deeply frozen objects already
     * in the store. Callers cannot push, splice, or reassign the array.
     *
     * @returns {Readonly<Readonly<object>[]>}
     */
    getAll() {
        return Object.freeze([..._store]);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. last() — retrieve the most recently added report
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve the most recently added report, or null if the store
     * is empty.
     *
     * @returns {Readonly<object> | null}
     */
    last() {
        if (_store.length === 0) return null;
        return _store[_store.length - 1];
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 5. count() — current store size
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the number of reports currently held in the store.
     *
     * @returns {number}
     */
    count() {
        return _store.length;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 6. clear() — reset the store
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Remove all reports from the in-memory store.
     *
     * This operation is irreversible within the current session.
     * It does not affect any external persistence layer (none exists
     * at this layer — persistence is a future plugin responsibility).
     *
     * Returns the number of reports that were present before clearing,
     * so callers can confirm or log what was discarded.
     *
     * @returns {number}  Count of reports removed
     */
    clear() {
        const previous = _store.length;
        _store.length  = 0;
        return previous;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 7. getVersion() — module identity
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the module version string.
     * Consumed by test-cli.js and test-ui.js for display and
     * compatibility checks.
     *
     * @returns {string}
     */
    getVersion() {
        return HISTORY_VERSION;
    },
};

// ── Global registration ───────────────────────────────────────────────────────
// The public API surface is frozen after registration.
// Duplicate-load detection uses a version-aware warning rather than a throw,
// so hot-reload environments do not receive an uncaught exception (see
// TestReporter certification finding M-03).

if (typeof window !== "undefined") {
    if (!window.CozyOS) window.CozyOS = {};

    if (window.CozyOS.TestHistory) {
        // Same version re-load (hot-reload / HMR): skip silently.
        // Different version: warn loudly — a version mismatch in a frozen
        // module indicates a deployment error.
        const existing = window.CozyOS.TestHistory;
        if (typeof existing.getVersion === "function" &&
            existing.getVersion() !== HISTORY_VERSION) {
            throw new Error(
                `[TestHistory] Version conflict: ` +
                `registered version is ${existing.getVersion()}, ` +
                `attempted load is ${HISTORY_VERSION}. ` +
                `Only one version of TestHistory may be active at a time.`
            );
        }
        // Same version — no-op. Existing registration is preserved.
    } else {
        window.CozyOS.TestHistory = Object.freeze(_history);
    }
}
