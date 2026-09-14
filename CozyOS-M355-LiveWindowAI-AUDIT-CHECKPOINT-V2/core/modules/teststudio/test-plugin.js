/**
 * ── CozyOS Enterprise Framework ──────────────────────────────────────────────
 * Test Studio Subsystem
 *
 * FILE:               core/modules/teststudio/test-plugin.js
 * LAYER:              Core Infrastructure / Plugin Integration Layer
 * VERSION:            1.0.0-PRODUCTION
 * SINGLE RESPONSIBILITY: Register and manage external Test Studio plugins
 *   through a certified public interface without modifying any frozen Test
 *   Studio module.
 *
 * ZERO LOGIC RULE (strictly enforced):
 *   This module never executes tests, performs assertions, edits registry,
 *   edits runner, edits history, edits reports, edits dashboard, edits UI,
 *   edits CLI, fabricates data, recalculates statistics, or modifies exported
 *   reports. It stores plugin descriptors only. Execution of hooks remains
 *   the sole responsibility of the consuming module.
 *
 * FROZEN DEPENDENCIES (public API only, no private access):
 *   window.CozyOS.TestRegistry
 *   window.CozyOS.TestRunner
 *   window.CozyOS.TestReporter
 *   window.CozyOS.TestHistory
 *   window.CozyOS.TestExporter
 *
 * PLUGIN DESCRIPTOR SHAPE:
 *   {
 *     id:      string   — unique plugin identifier (required)
 *     name:    string   — human-readable display name (required)
 *     version: string   — semver string
 *     hooks:   object   — named hook references (never invoked here)
 *     enabled: boolean  — descriptor-level enable flag
 *   }
 *
 * PUBLIC FROZEN API:
 *   window.CozyOS.TestPlugin.register(plugin)   → object  (frozen descriptor)
 *   window.CozyOS.TestPlugin.unregister(id)     → boolean
 *   window.CozyOS.TestPlugin.get(id)            → object | null
 *   window.CozyOS.TestPlugin.getAll()           → readonly object[]
 *   window.CozyOS.TestPlugin.has(id)            → boolean
 *   window.CozyOS.TestPlugin.count()            → number
 *   window.CozyOS.TestPlugin.clear()            → void
 *   window.CozyOS.TestPlugin.getVersion()       → string
 *
 * IMMUTABILITY CONTRACT:
 *   Every stored descriptor is a deep-frozen structural copy of the caller-
 *   supplied object. The original is never retained or mutated. Returned
 *   objects and arrays are also frozen — callers receive read-only views.
 *
 * DESIGN CONSTRAINTS:
 *   - O(1) lookup via Map keyed on plugin id
 *   - Duplicate protection: register() throws on collision
 *   - Deep-freeze on all stored and returned descriptors
 *   - No hidden state beyond the plugin registry Map
 *   - Hot-reload safe: clear() resets the registry without replacing the
 *     frozen public API object
 *   - CSP compliant: no eval, no dynamic code execution
 *   - ES2022
 */

"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};

    // ── Module constants ────────────────────────────────────────────────────

    const VERSION = "1.0.0-PRODUCTION";

    /**
     * Required fields every plugin descriptor must supply on registration.
     * Additional fields (version, hooks, enabled, …) are accepted and
     * preserved but not enforced — only id and name are mandatory.
     */
    const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(["id", "name"]);

    // ── Internal registry ───────────────────────────────────────────────────

    /**
     * Primary plugin store. Map<string, FrozenDescriptor>.
     * Keyed on plugin.id for O(1) get / has / unregister operations.
     * Never exposed directly — callers always receive frozen copies.
     */
    const _registry = new Map();

    // ── Internal pure helpers ───────────────────────────────────────────────

    /**
     * Produces a deep-frozen structural copy of a plain-data object.
     * Freezing is applied recursively so nested objects (e.g. hooks) are
     * also immutable. Arrays are frozen in place after each element is
     * deep-frozen. Non-object leaves (primitives, null) are returned as-is.
     *
     * Uses JSON round-trip for the initial copy to ensure:
     *   - no prototype chain from the caller bleeds in
     *   - functions (e.g. raw hook implementations) are stripped before
     *     storage, enforcing the "hooks stored as descriptors only" contract
     *
     * @param {*} value
     * @returns {*} deeply frozen copy, or null if unserializable
     */
    function _deepFreezeCopy(value) {
        if (value === undefined || value === null) return value;
        let copy;
        try {
            copy = JSON.parse(JSON.stringify(value));
        } catch {
            return null;
        }
        return _freezeRecursive(copy);
    }

    /**
     * Recursively freezes an already-copied plain-data structure in-place.
     * Called only on the result of _deepFreezeCopy(), never on caller data.
     *
     * @param {*} obj
     * @returns {*} the same reference, now frozen
     */
    function _freezeRecursive(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) {
            obj.forEach((item, i) => { obj[i] = _freezeRecursive(item); });
            return Object.freeze(obj);
        }
        for (const key of Object.keys(obj)) {
            obj[key] = _freezeRecursive(obj[key]);
        }
        return Object.freeze(obj);
    }

    /**
     * Validates that a plugin descriptor candidate supplies all required
     * fields with non-empty string values. Does not inspect hooks, version,
     * enabled, or any extension fields — those are the consuming module's
     * concern.
     *
     * @param {*} plugin
     * @returns {{ valid: boolean, error: string | null }}
     */
    function _validateDescriptor(plugin) {
        if (plugin === null || plugin === undefined || typeof plugin !== "object" || Array.isArray(plugin)) {
            return { valid: false, error: "Plugin descriptor must be a non-null, non-array object." };
        }
        for (const field of REQUIRED_DESCRIPTOR_FIELDS) {
            if (typeof plugin[field] !== "string" || plugin[field].trim().length === 0) {
                return { valid: false, error: `Plugin descriptor is missing required string field: "${field}".` };
            }
        }
        return { valid: true, error: null };
    }

    /**
     * Normalizes a plugin id for consistent Map keying: trims whitespace.
     * Does not lowercase — id casing is preserved exactly as supplied.
     *
     * @param {*} id
     * @returns {string | null} normalized id, or null if not a valid string
     */
    function _normalizeId(id) {
        if (typeof id !== "string" || id.trim().length === 0) return null;
        return id.trim();
    }

    // ── Public API implementations ──────────────────────────────────────────

    /**
     * Registers a plugin descriptor. The supplied object is deep-copied and
     * deep-frozen before storage — the caller's original is never retained
     * or mutated. Hook function references present on the source descriptor
     * are intentionally stripped by the JSON round-trip copy (functions are
     * not JSON-serializable), enforcing the "store descriptors, never execute
     * hooks" contract. Callers that need hook references must retain them
     * externally.
     *
     * Throws on:
     *   - invalid or missing required fields
     *   - duplicate id (call unregister() first to replace)
     *   - descriptor that cannot be copied (e.g. circular structure)
     *
     * @param {object} plugin — descriptor with at minimum { id, name }
     * @returns {object}      — the frozen stored descriptor
     */
    function register(plugin) {
        const validation = _validateDescriptor(plugin);
        if (!validation.valid) {
            throw new TypeError(`[TestPlugin] register() rejected: ${validation.error}`);
        }

        const id = _normalizeId(plugin.id);
        if (id === null) {
            throw new TypeError("[TestPlugin] register() rejected: plugin.id must be a non-empty string.");
        }

        if (_registry.has(id)) {
            throw new Error(`[TestPlugin] register() rejected: a plugin with id "${id}" is already registered. Call unregister("${id}") first.`);
        }

        const frozen = _deepFreezeCopy(plugin);
        if (frozen === null) {
            throw new Error(`[TestPlugin] register() rejected: plugin descriptor for "${id}" could not be copied (possibly circular or unserializable).`);
        }

        _registry.set(id, frozen);
        return frozen;
    }

    /**
     * Removes the plugin with the given id from the registry.
     *
     * @param {string} id
     * @returns {boolean} true if the plugin existed and was removed,
     *                    false if no such plugin was registered
     */
    function unregister(id) {
        const key = _normalizeId(id);
        if (key === null) return false;
        return _registry.delete(key);
    }

    /**
     * Returns the frozen descriptor for the given id, or null if not found.
     * The returned object is already frozen — callers receive a read-only
     * view of the stored descriptor.
     *
     * @param {string} id
     * @returns {object | null}
     */
    function get(id) {
        const key = _normalizeId(id);
        if (key === null) return null;
        return _registry.get(key) ?? null;
    }

    /**
     * Returns a frozen array of all registered descriptors. The array and
     * every element within it are frozen — callers receive a read-only
     * snapshot of the current registry state.
     *
     * @returns {readonly object[]}
     */
    function getAll() {
        return Object.freeze(Array.from(_registry.values()));
    }

    /**
     * Returns true if a plugin with the given id is currently registered.
     *
     * @param {string} id
     * @returns {boolean}
     */
    function has(id) {
        const key = _normalizeId(id);
        if (key === null) return false;
        return _registry.has(key);
    }

    /**
     * Returns the number of currently registered plugins.
     *
     * @returns {number}
     */
    function count() {
        return _registry.size;
    }

    /**
     * Removes all registered plugins from the registry. Hot-reload safe:
     * the frozen public API object is not replaced; only the internal Map
     * is cleared.
     *
     * @returns {void}
     */
    function clear() {
        _registry.clear();
    }

    /**
     * Returns this module's own version string.
     *
     * @returns {string}
     */
    function getVersion() {
        return VERSION;
    }

    // ── Registration ────────────────────────────────────────────────────────

    window.CozyOS.TestPlugin = Object.freeze({
        register,
        unregister,
        get,
        getAll,
        has,
        count,
        clear,
        getVersion
    });

})();
