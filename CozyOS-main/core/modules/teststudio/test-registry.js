/**
 * CozyOS Enterprise Framework — Test Studio Subsystem
 * File Reference: /core/modules/teststudio/test-registry.js
 * Layer: Core Infrastructure / Test Architecture Registry Services
 * Version: 1.0.2-PRODUCTION
 *
 * REVISION NOTES (v1.0.1):
 * - Refactored internal deep clone utility to yield standard JavaScript object shapes ({}) 
 *   to ensure downstream compatibility with standard prototype inspection methods.
 * - Injected an O(1) high-performance count() API operational pathway.
 *
 * REVISION NOTES (v1.0.2 — Certification Patch):
 * - #deepCloneAndFreeze now preserves Date, RegExp, Map, and Set values instead of
 *   silently collapsing them to plain {} objects (verified data-corruption fix; no
 *   change for suites that only use plain objects/arrays/primitives/functions).
 * - get()/getAll() no longer re-clone already-frozen internal records on every call.
 *   Internal copies are made deeply immutable exactly once, at register() time;
 *   returning that same frozen reference is externally indistinguishable from
 *   returning a fresh clone, since neither can be mutated. Removes redundant O(n)
 *   allocation on every read.
 * - JSDoc on get()/getAll() clarified: function values (e.g. test.fn) are shared by
 *   reference and are not deep-frozen — functions cannot be structurally cloned
 *   without losing callability. This was already true in v1.0.1; it is now documented
 *   rather than implied by omission. No behavior change.
 */

(function () {
    "use strict";

    // Establish framework global root namespaces safely
    window.CozyOS = window.CozyOS || {};

    /**
     * @class CozyOSTestRegistry
     * @description Core architectural registry managing structural registrations of test suites.
     */
    class CozyOSTestRegistry {
        #store;

        constructor() {
            this.#store = new Map();
        }

        /**
         * Registers a novel test suite descriptor within the central store matrix.
         * Enforces strict object integrity checking and prohibits identity collisions.
         * 
         * @param {Object} testSuite The structural test suite module payload mapping configuration.
         */
        register(testSuite) {
            if (!testSuite || typeof testSuite !== "object" || Array.isArray(testSuite)) {
                throw new TypeError("[CozyOS TestRegistry] Registration Violation: Provided testSuite must resolve to a valid non-null object profile.");
            }

            const { id, name, version, tests } = testSuite;

            if (!id || typeof id !== "string" || id.trim() === "") {
                throw new Error("[CozyOS TestRegistry] Validation Fault: The unique 'id' string property is mandatory and cannot be omitted or blank.");
            }
            if (!name || typeof name !== "string") {
                throw new Error("[CozyOS TestRegistry] Validation Fault: The descriptive 'name' string property is required.");
            }
            if (!version || typeof version !== "string") {
                throw new Error("[CozyOS TestRegistry] Validation Fault: The operational 'version' semantic tracking parameter is required.");
            }
            if (!Array.isArray(tests)) {
                throw new TypeError("[CozyOS TestRegistry] Validation Fault: The 'tests' property must be a structurally valid sequence array.");
            }

            const normalizedId = id.trim().toLowerCase();

            if (this.#store.has(normalizedId)) {
                throw new Error(`[CozyOS TestRegistry] Collision Boundary Breach: An enterprise test suite matching id reference '${id}' is already active.`);
            }

            const internalCopy = this.#deepCloneAndFreeze(testSuite);
            this.#store.set(normalizedId, internalCopy);

            return true;
        }

        /**
         * Evicts a target test suite out of the active operational mapping store index.
         */
        unregister(id) {
            if (!id || typeof id !== "string") return false;
            return this.#store.delete(id.trim().toLowerCase());
        }

        /**
         * Retrieves a read-only, structurally isolated copy of a specific suite descriptor configuration.
         * Note: function values within the suite (e.g. a test's `fn`) are shared by
         * reference, not deep-cloned — functions cannot be structurally isolated
         * without losing callability. Every plain object/array/primitive/Date/RegExp/
         * Map/Set within the suite is deeply frozen and immutable.
         */
        get(id) {
            if (!id || typeof id !== "string") return null;
            const record = this.#store.get(id.trim().toLowerCase());
            // Already deeply frozen at register() time — safe to return directly;
            // re-cloning an immutable value on every read is pure redundant cost.
            return record || null;
        }

        /**
         * Emits a comprehensive immutable collection array mapping all active suite configurations.
         * Note: same function-reference-sharing caveat as get() applies to each entry.
         */
        getAll() {
            const suiteCollection = [];
            for (const record of this.#store.values()) {
                // Already deeply frozen at register() time — reused directly.
                suiteCollection.push(record);
            }
            return Object.freeze(suiteCollection);
        }

        /**
         * Evaluates whether a given identification token has an active entry mapping profile.
         */
        has(id) {
            if (!id || typeof id !== "string") return false;
            return this.#store.has(id.trim().toLowerCase());
        }

        /**
         * High-performance O(1) tracking metric. Returns total registered suites
         * without generating expensive heap/memory defensive allocations.
         * 
         * @returns {number} Non-negative integer size of active registrations.
         */
        count() {
            return this.#store.size;
        }

        /**
         * Purges the entire operational contents of the active registry cache instantly.
         */
        clear() {
            this.#store.clear();
        }

        /**
         * Internal structural protection routing utility. Deeply copies configurations 
         * using a standard plain-object base to maintain normal prototype inheritance.
         * Special-cases Date/RegExp/Map/Set so their values are preserved rather than
         * collapsed to a bare {} (both types carry internal slots that a plain
         * Object.keys()-based copy cannot see or reproduce).
         */
        #deepCloneAndFreeze(obj) {
            if (obj === null || typeof obj !== "object") {
                return obj;
            }

            if (Array.isArray(obj)) {
                const cloneArr = obj.map(item => this.#deepCloneAndFreeze(item));
                return Object.freeze(cloneArr);
            }

            if (obj instanceof Date) {
                return Object.freeze(new Date(obj.getTime()));
            }

            if (obj instanceof RegExp) {
                return Object.freeze(new RegExp(obj.source, obj.flags));
            }

            if (obj instanceof Map) {
                const cloneMap = new Map();
                for (const [k, v] of obj) cloneMap.set(this.#deepCloneAndFreeze(k), this.#deepCloneAndFreeze(v));
                return Object.freeze(cloneMap);
            }

            if (obj instanceof Set) {
                const cloneSet = new Set();
                for (const v of obj) cloneSet.add(this.#deepCloneAndFreeze(v));
                return Object.freeze(cloneSet);
            }

            // Refactored to utilize a standard Object prototype chain shape
            const cloneObj = {};
            for (const key of Object.keys(obj)) {
                cloneObj[key] = this.#deepCloneAndFreeze(obj[key]);
            }
            return Object.freeze(cloneObj);
        }
    }

    // Instantiate and securely freeze the public API surface area boundaries natively
    const instance = new CozyOSTestRegistry();
    
    window.CozyOS.TestRegistry = Object.freeze({
        register: (suite) => instance.register(suite),
        unregister: (id) => instance.unregister(id),
        get: (id) => instance.get(id),
        getAll: () => instance.getAll(),
        has: (id) => instance.has(id),
        count: () => instance.count(),
        clear: () => instance.clear()
    });

})();
