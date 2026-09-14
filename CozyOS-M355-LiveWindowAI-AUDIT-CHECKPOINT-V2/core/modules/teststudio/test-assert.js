/**
 * CozyOS Enterprise Framework — Test Studio Subsystem
 * File Reference: core/modules/teststudio/test-assert.js
 * Layer: Core Infrastructure / Assertion Engine
 * Version: 1.0.0-PRODUCTION
 *
 * Responsibility (only): evaluate assertions and throw descriptive assertion
 * failures. Pure value comparison — no suite execution, no registration, no
 * reporting, no history, no DOM, no files, no knowledge of TestRegistry or
 * TestRunner. Stateless and side-effect free: every call is independent of
 * every other call.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.0-PRODUCTION";

    /** Thrown for every failed assertion. Still a genuine Error (instanceof Error
     *  is true), just named so failures are identifiable at a glance. Not part
     *  of the public API surface — only its instances are ever exposed, via throw. */
    class AssertionError extends Error {
        constructor(message) {
            super(message);
            this.name = "AssertionError";
        }
    }

    function fail(message) {
        throw new AssertionError(message || "Assertion failed");
    }

    /** Deterministic, dependency-free value formatter for error messages.
     *  Never throws (falls back to a safe placeholder on circular/exotic input),
     *  so a formatting problem can never mask the real assertion failure. */
    function format(value) {
        try {
            if (typeof value === "undefined") return "undefined";
            if (typeof value === "function") return `[Function: ${value.name || "anonymous"}]`;
            if (typeof value === "symbol") return value.toString();
            if (value instanceof Date) return `Date(${value.toISOString()})`;
            if (value instanceof RegExp) return value.toString();
            if (typeof value === "bigint") return `${value.toString()}n`;
            return JSON.stringify(value, (key, v) => (typeof v === "undefined" ? "__undefined__" : v));
        } catch (e) {
            return String(value);
        }
    }

    /** Same-value comparison for leaf primitives — Object.is() treats NaN as
     *  equal to NaN and distinguishes +0/-0, both more correct for assertion
     *  purposes than raw ===. */
    function sameValue(a, b) {
        return Object.is(a, b);
    }

    /** Structural deep-equality with cycle detection (a circular structure must
     *  never crash the comparison with a stack overflow). Order-independent for
     *  Map/Set/object keys; order-sensitive for arrays. */
    function isDeepEqual(a, b, seen) {
        if (sameValue(a, b)) return true;
        if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

        if (seen.has(a) && seen.get(a) === b) return true;
        seen.set(a, b);

        if (a instanceof Date || b instanceof Date) {
            return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
        }
        if (a instanceof RegExp || b instanceof RegExp) {
            return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
        }
        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (!isDeepEqual(a[i], b[i], seen)) return false;
            return true;
        }
        if (a instanceof Map || b instanceof Map) {
            if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
            for (const [ka, va] of a) {
                let matched = false;
                for (const [kb, vb] of b) {
                    if (isDeepEqual(ka, kb, seen) && isDeepEqual(va, vb, seen)) { matched = true; break; }
                }
                if (!matched) return false;
            }
            return true;
        }
        if (a instanceof Set || b instanceof Set) {
            if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
            for (const va of a) {
                let matched = false;
                for (const vb of b) { if (isDeepEqual(va, vb, seen)) { matched = true; break; } }
                if (!matched) return false;
            }
            return true;
        }

        const keysA = Object.keys(a), keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!isDeepEqual(a[key], b[key], seen)) return false;
        }
        return true;
    }

    window.CozyOS.TestAssert = Object.freeze({

        equal(actual, expected) {
            // eslint-disable-next-line eqeqeq
            if (!(actual == expected)) {
                fail(`Expected ${format(actual)} to loosely equal ${format(expected)}`);
            }
        },

        notEqual(actual, expected) {
            // eslint-disable-next-line eqeqeq
            if (actual == expected) {
                fail(`Expected ${format(actual)} to not loosely equal ${format(expected)}`);
            }
        },

        strictEqual(actual, expected) {
            if (!sameValue(actual, expected)) {
                fail(`Expected ${format(actual)} to strictly equal ${format(expected)}`);
            }
        },

        notStrictEqual(actual, expected) {
            if (sameValue(actual, expected)) {
                fail(`Expected ${format(actual)} to not strictly equal ${format(expected)}`);
            }
        },

        true(value) {
            if (value !== true) fail(`Expected ${format(value)} to be true`);
        },

        false(value) {
            if (value !== false) fail(`Expected ${format(value)} to be false`);
        },

        null(value) {
            if (value !== null) fail(`Expected ${format(value)} to be null`);
        },

        notNull(value) {
            if (value === null) fail(`Expected value to not be null`);
        },

        undefined(value) {
            if (value !== undefined) fail(`Expected ${format(value)} to be undefined`);
        },

        notUndefined(value) {
            if (value === undefined) fail(`Expected value to not be undefined`);
        },

        throws(fn) {
            if (typeof fn !== "function") {
                fail(`Expected a function to test for throwing, received ${format(fn)}`);
                return;
            }
            let didThrow = false;
            try { fn(); } catch (e) { didThrow = true; }
            if (!didThrow) fail(`Expected function to throw, but it did not`);
        },

        deepEqual(actual, expected) {
            if (!isDeepEqual(actual, expected, new Map())) {
                fail(`Expected ${format(actual)} to deeply equal ${format(expected)}`);
            }
        },

        fail(message) {
            fail(message);
        },

        getVersion() {
            return VERSION;
        }

    });

})();
