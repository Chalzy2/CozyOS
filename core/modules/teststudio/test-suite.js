/**
 * CozyOS Enterprise Framework — Test Studio Subsystem
 * File Reference: /core/modules/teststudio/test-suite.js
 * Layer: Core Infrastructure / Suite Loader
 * Version: 1.0.0-PRODUCTION
 *
 * Responsibility (single sentence): Loads and registers test suite
 * descriptors into the frozen TestRegistry.
 *
 * Zero Logic Rule compliance — this module never:
 *   - executes a test
 *   - evaluates assertions
 *   - formats reports
 *   - stores history
 *   - modifies runner behavior
 *   - modifies registry internals
 *   - validates test outcomes
 *   - creates fake/default/example suites
 *   - accesses the DOM, filesystem, network, localStorage, or sessionStorage
 *
 * Frozen dependency: window.CozyOS.TestRegistry — public API only
 * (register, has, get, getAll, count). Nothing else is called on it.
 * In particular, unregister() is intentionally never used — see
 * clearLoaded() below for why "atomic registration" is scoped per-suite
 * rather than as batch-level rollback.
 *
 * Module boundary: the registry is accepted as a constructor parameter
 * (defaulting to the real global TestRegistry when omitted), so this
 * module makes no hardcoded assumption about TestRegistry's internals
 * and can be certified in isolation against any object satisfying the
 * same public shape.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const MODULE_VERSION = "1.0.0-PRODUCTION";

    /**
     * @class CozyOSTestSuiteLoader
     * @description Loads suite descriptors into an injected registry and
     *              tracks which ids this specific instance has loaded.
     */
    class CozyOSTestSuiteLoader {
        #registry;
        #loadedIds;

        /**
         * @param {Object} registry An object implementing register(suite).
         *        Only register() is invoked by this class; has()/get()/
         *        getAll()/count() are part of the allowed dependency
         *        surface but are not currently called by any method below.
         */
        constructor(registry) {
            if (!registry || typeof registry.register !== "function") {
                throw new TypeError(
                    "[CozyOS TestSuiteLoader] Construction Fault: a registry implementing register() must be provided."
                );
            }
            this.#registry = registry;
            this.#loadedIds = [];
        }

        /**
         * Loads (registers) a single suite descriptor into the registry.
         * Performs no shape/content validation of its own, and does not
         * pre-check for duplicate ids — duplicate handling belongs entirely
         * to the Registry's register() contract, which throws on collision.
         * This method does not catch that throw.
         *
         * @param {Object} suite A suite descriptor: { id, name, version, tests }
         * @returns {boolean} true if registration succeeded. register()
         *          never returns false — only true or throw — so this
         *          method's return value is true whenever it returns at all.
         */
        loadSuite(suite) {
            const result = this.#registry.register(suite);
            if (result && suite && typeof suite.id === "string") {
                this.#loadedIds.push(suite.id.trim().toLowerCase());
            }
            return result;
        }

        /**
         * Loads multiple suite descriptors in the given order.
         *
         * Atomicity note: each individual loadSuite() call is atomic
         * because Registry.register() is atomic (it either fully commits
         * or throws before touching the store — never a partial write).
         * loadAll() halts and rethrows on the first failure, but does NOT
         * roll back suites it already registered earlier in the same
         * batch: doing so would require calling unregister(), which is
         * outside this module's frozen dependency surface. If true
         * batch-level atomicity (all-or-nothing across the whole array)
         * is required, that needs unregister() added to the allowed
         * dependencies and should be an explicit decision, not one this
         * module makes unilaterally.
         *
         * @param {Object[]} suites
         * @returns {number} Count of suites successfully loaded before
         *          this call returns (equal to suites.length on full success).
         */
        loadAll(suites) {
            if (!Array.isArray(suites)) {
                throw new TypeError("[CozyOS TestSuiteLoader] loadAll Fault: suites must be an array.");
            }
            let loadedCount = 0;
            for (const suite of suites) {
                this.loadSuite(suite);
                loadedCount++;
            }
            return loadedCount;
        }

        /**
         * Returns the ordered, immutable list of suite ids this specific
         * loader instance has successfully registered. Does not reflect
         * suites registered elsewhere through the same registry directly,
         * and does not query the registry itself.
         * @returns {ReadonlyArray<string>}
         */
        getLoadedIds() {
            return Object.freeze(this.#loadedIds.slice());
        }

        /**
         * Clears this loader instance's own tracked-id bookkeeping only.
         * Does NOT touch the registry in any way — the suites this loader
         * previously registered remain registered. This exists for
         * hot-reload / re-attach scenarios where a fresh loader wants a
         * clean local tracking slate without discarding real registry
         * state, not as a way to bulk-unregister suites.
         */
        clearLoaded() {
            this.#loadedIds = [];
        }

        /**
         * @returns {string} This module's own version string.
         */
        getVersion() {
            return MODULE_VERSION;
        }
    }

    const defaultRegistry = window.CozyOS.TestRegistry;
    if (!defaultRegistry) {
        throw new Error(
            "[CozyOS TestSuiteLoader] Bootstrap Fault: window.CozyOS.TestRegistry must be loaded before test-suite.js."
        );
    }
    const instance = new CozyOSTestSuiteLoader(defaultRegistry);

    window.CozyOS.TestSuite = Object.freeze({
        loadSuite: (suite) => instance.loadSuite(suite),
        loadAll: (suites) => instance.loadAll(suites),
        getLoadedIds: () => instance.getLoadedIds(),
        clearLoaded: () => instance.clearLoaded(),
        // registry is optional; omitting it binds the new loader to the
        // same real, global TestRegistry — useful for hot-reload (a fresh
        // instance with empty local tracking, same underlying registry).
        // Passing a registry explicitly is what makes this module
        // independently certifiable against a mock, without touching
        // the real global registry.
        createLoader: (registry) => new CozyOSTestSuiteLoader(registry || defaultRegistry),
        getVersion: () => MODULE_VERSION
    });
})();
