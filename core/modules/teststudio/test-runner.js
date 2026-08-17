/**
 * CozyOS Enterprise Framework — Test Studio Subsystem
 * File Reference: /core/modules/teststudio/test-runner.js
 * Layer: Core Infrastructure / Test Execution Services
 * Version: 1.0.0-PRODUCTION
 *
 * Responsibility (only): read suites from window.CozyOS.TestRegistry, execute
 * each test's fn(), isolate exceptions per test, measure timing, and return
 * immutable structured results. No UI, no history, no reporting, no exports,
 * no Registry mutation — those belong to other Test Studio modules.
 *
 * Test descriptor convention read from each suite's `tests[]` entries
 * (TestRegistry itself does not define or validate this shape — it is a
 * Runner-side convention only):
 *   { id?: string, name?: string, fn: Function, skip?: boolean }
 * `fn` may be synchronous or return a Promise; both are awaited uniformly.
 * If `id`/`name` are omitted, the test's array index is used as a fallback
 * label so every result is still identifiable.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.0-PRODUCTION";

    function now() {
        return (typeof performance !== "undefined" && typeof performance.now === "function")
            ? performance.now()
            : Date.now();
    }

    /** Shallow-safe deep freeze for the plain result objects this module builds itself. */
    function deepFreeze(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) {
            obj.forEach(deepFreeze);
            return Object.freeze(obj);
        }
        Object.values(obj).forEach(deepFreeze);
        return Object.freeze(obj);
    }

    function getRegistry() {
        const registry = window.CozyOS && window.CozyOS.TestRegistry;
        if (!registry) {
            throw new Error("[CozyOS TestRunner] window.CozyOS.TestRegistry is not available — the Runner has nothing to read from.");
        }
        return registry;
    }

    /**
     * Executes a single test descriptor. Never throws — exceptions from
     * test.fn() (sync or async) are caught and converted into a FAIL result,
     * so one failing test can never stop suite execution.
     */
    async function runSingleTest(test, index) {
        const id = test && test.id ? String(test.id) : (test && test.name ? String(test.name) : `test_${index}`);
        const name = test && test.name ? String(test.name) : id;

        if (test && test.skip) {
            return { id, name, status: "SKIPPED", duration: 0, error: null };
        }

        if (!test || typeof test.fn !== "function") {
            return { id, name, status: "FAIL", duration: 0, error: "Test descriptor has no callable 'fn'." };
        }

        const start = now();
        try {
            await Promise.resolve(test.fn());
            return { id, name, status: "PASS", duration: Math.round(now() - start), error: null };
        } catch (err) {
            return {
                id, name, status: "FAIL",
                duration: Math.round(now() - start),
                error: err && err.message ? err.message : String(err)
            };
        }
    }

    /**
     * Executes every test in a single suite sequentially (deterministic order
     * = the order tests appear in the suite) and aggregates the outcome.
     */
    async function runSuite(suiteId, suite) {
        const start = now();
        const tests = Array.isArray(suite.tests) ? suite.tests : [];

        const results = [];
        for (let i = 0; i < tests.length; i++) {
            results.push(await runSingleTest(tests[i], i));
        }

        const summary = {
            suiteId,
            passed: results.filter(r => r.status === "PASS").length,
            failed: results.filter(r => r.status === "FAIL").length,
            skipped: results.filter(r => r.status === "SKIPPED").length,
            duration: Math.round(now() - start),
            results
        };

        return deepFreeze(summary);
    }

    /**
     * Runs the registered suite matching `id`.
     * @param {string} id
     * @returns {Promise<Object>} frozen suite result, matching the documented shape.
     */
    async function run(id) {
        if (!id || typeof id !== "string") {
            throw new TypeError("[CozyOS TestRunner] run(id) requires a non-empty string id.");
        }
        const registry = getRegistry();
        const suite = registry.get(id);
        if (!suite) {
            throw new Error(`[CozyOS TestRunner] No suite registered under id '${id}'.`);
        }
        return runSuite(suite.id, suite);
    }

    /**
     * Runs every suite currently registered, in TestRegistry's own iteration
     * order (deterministic — Map insertion order).
     * @returns {Promise<Object[]>} frozen array of frozen suite results.
     */
    async function runAll() {
        const registry = getRegistry();
        const suites = registry.getAll();
        const allResults = [];
        for (const suite of suites) {
            allResults.push(await runSuite(suite.id, suite));
        }
        return deepFreeze(allResults);
    }

    function getVersion() {
        return VERSION;
    }

    window.CozyOS.TestRunner = Object.freeze({
        run,
        runAll,
        getVersion
    });

})();
