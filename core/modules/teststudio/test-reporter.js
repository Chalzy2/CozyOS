/**
 * ── CozyOS UNIVERSAL TEST STUDIO ENGINE ── REPORT FORMATTER
 * FILE: core/modules/teststudio/test-reporter.js
 * VERSION: 1.0.0-PRODUCTION
 *
 * Single Responsibility: Accepts immutable Runner result objects and produces
 * formatted report objects or strings. Does nothing else.
 *
 * Zero Logic Rule — this module never:
 *   • determines pass/fail rules
 *   • executes test functions
 *   • compares values
 *   • modifies Runner results
 *   • modifies Registry contents
 *   • accesses the DOM
 *   • writes to localStorage / sessionStorage
 *   • uses timers, network, or filesystem
 *   • logs to the console
 *   • depends on TestRegistry or TestRunner
 *
 * Public API (frozen, immutable):
 *   window.CozyOS.TestReporter.generate(result)
 *   window.CozyOS.TestReporter.generateAll(results)
 *   window.CozyOS.TestReporter.toJSON(result)
 *   window.CozyOS.TestReporter.toText(result)
 *   window.CozyOS.TestReporter.getVersion()
 */

"use strict";

// ── Module constants ──────────────────────────────────────────────────────────

const REPORTER_VERSION = "1.0.0-PRODUCTION";

// Column widths for aligned text report fields
const LABEL_WIDTH = 8;

// ── Private formatting utilities ──────────────────────────────────────────────

/**
 * Left-pad a label string to a fixed width for column alignment.
 * Pure string formatting — no logic.
 *
 * @param {string} label
 * @param {number} width
 * @returns {string}
 */
function _padLabel(label, width) {
    return String(label ?? "").padEnd(width, " ");
}

/**
 * Derive the overall suite status string from passed/failed/skipped counts.
 * This is purely a display-label derivation from data already computed by
 * the Runner — the Reporter does not re-evaluate pass/fail rules.
 *
 * @param {number} failed
 * @param {number} skipped
 * @param {number} passed
 * @returns {"PASSED"|"FAILED"|"SKIPPED"|"EMPTY"}
 */
function _resolveStatusLabel(failed, skipped, passed) {
    if (failed > 0)                             return "FAILED";
    if (passed > 0 && failed === 0)             return "PASSED";
    if (skipped > 0 && failed === 0)            return "SKIPPED";
    return "EMPTY";
}

/**
 * Sanitise a value for safe inclusion in a text report.
 * Converts null/undefined to an empty string; coerces everything else to string.
 *
 * @param {unknown} value
 * @returns {string}
 */
function _safeStr(value) {
    if (value === null || value === undefined) return "";
    return String(value);
}

/**
 * Format a single test-case result line for the text report.
 *
 * @param {{name: string, status: string, duration?: number, error?: string}} testCase
 * @param {number} index  1-based display index
 * @returns {string}
 */
function _formatTestCaseLine(testCase, index) {
    if (!testCase || typeof testCase !== "object") return "";

    const icon     = _statusIcon(testCase.status);
    const name     = _safeStr(testCase.name) || "(unnamed test)";
    const duration = typeof testCase.duration === "number"
        ? ` (${testCase.duration}ms)`
        : "";
    const error    = testCase.error
        ? `\n       ↳ ${_safeStr(testCase.error)}`
        : "";

    return `  ${String(index).padStart(3)}. ${icon} ${name}${duration}${error}`;
}

/**
 * Map a test status string to a display icon.
 * Pure lookup — not a logic decision.
 *
 * @param {string} status
 * @returns {string}
 */
function _statusIcon(status) {
    switch (String(status ?? "").toUpperCase()) {
        case "PASSED":  return "✓";
        case "FAILED":  return "✗";
        case "SKIPPED": return "○";
        default:        return "?";
    }
}

/**
 * Validate that a result object has the minimum shape required to format it.
 * Throws a TypeError with a descriptive message if validation fails.
 * This is input-contract enforcement, not business logic.
 *
 * @param {unknown} result
 */
function _assertResultShape(result) {
    if (result === null || typeof result !== "object") {
        throw new TypeError(
            "[TestReporter] result must be a non-null object. " +
            `Received: ${typeof result}`
        );
    }
    const required = ["suiteId", "passed", "failed", "skipped", "duration"];
    for (const field of required) {
        if (!(field in result)) {
            throw new TypeError(
                `[TestReporter] result is missing required field: "${field}".`
            );
        }
    }
}

// ── Reporter implementation ───────────────────────────────────────────────────

const _reporter = {

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. generate(result) — canonical report object
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Produce the canonical report object for a single Runner result.
     * This is the primary output format consumed by downstream modules
     * (test-history.js, test-ui.js, test-cli.js).
     *
     * Output is a frozen plain object — callers may not mutate it.
     *
     * @param {object} result  Runner output object
     * @returns {Readonly<object>}
     */
    generate(result) {
        _assertResultShape(result);

        const failed  = Number(result.failed)  || 0;
        const passed  = Number(result.passed)  || 0;
        const skipped = Number(result.skipped) || 0;
        const total   = passed + failed + skipped;

        const report = {
            generatedAt: new Date().toISOString(),
            reporterVersion: REPORTER_VERSION,
            suite: _safeStr(result.suiteId) || "(unnamed suite)",
            status: _resolveStatusLabel(failed, skipped, passed),
            summary: Object.freeze({
                total,
                passed,
                failed,
                skipped,
                duration: typeof result.duration === "number" ? result.duration : 0,
            }),
            results: Array.isArray(result.results)
                ? Object.freeze(result.results.map(r => Object.freeze({ ...r })))
                : Object.freeze([]),
            // Passthrough of any additional fields the Runner may include
            // (tags, environment, pluginId, etc.) without interpreting them.
            meta: Object.freeze(
                Object.fromEntries(
                    Object.entries(result).filter(([k]) =>
                        !["suiteId", "passed", "failed", "skipped", "duration", "results"].includes(k)
                    )
                )
            ),
        };

        return Object.freeze(report);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. generateAll(results) — batch report for multiple suites
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Produce a batch report object for an array of Runner results.
     * Aggregates summary counts across all suites for a roll-up view.
     * Aggregation here is purely additive formatting — the Reporter does not
     * re-evaluate which individual tests passed or failed.
     *
     * @param {object[]} results  Array of Runner output objects
     * @returns {Readonly<object>}
     */
    generateAll(results) {
        if (!Array.isArray(results)) {
            throw new TypeError(
                "[TestReporter] generateAll: results must be an array. " +
                `Received: ${typeof results}`
            );
        }

        const reports = results.map(r => this.generate(r));

        const totals = reports.reduce(
            (acc, rep) => ({
                total:    acc.total    + rep.summary.total,
                passed:   acc.passed   + rep.summary.passed,
                failed:   acc.failed   + rep.summary.failed,
                skipped:  acc.skipped  + rep.summary.skipped,
                duration: acc.duration + rep.summary.duration,
            }),
            { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 }
        );

        return Object.freeze({
            generatedAt:     new Date().toISOString(),
            reporterVersion: REPORTER_VERSION,
            suiteCount:      reports.length,
            status:          _resolveStatusLabel(totals.failed, totals.skipped, totals.passed),
            summary:         Object.freeze(totals),
            reports:         Object.freeze(reports),
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. toJSON(result) — JSON string output
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Produce a formatted JSON string from a single Runner result.
     * Suitable for log pipelines, file export, and API payloads.
     *
     * @param {object} result
     * @returns {string}
     */
    toJSON(result) {
        const report = this.generate(result);
        return JSON.stringify(report, null, 2);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. toText(result) — human-readable text output
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Produce a human-readable plain-text report string from a single Runner result.
     * Suitable for terminal output, test-cli.js, and copy-paste sharing.
     *
     * Format:
     *
     *   ─────────────────────────────────────
     *   Suite: <suiteId>
     *   ─────────────────────────────────────
     *   Passed : 25
     *   Failed : 1
     *   Skipped: 0
     *   Total  : 26
     *   Duration: 132 ms
     *
     *   Status: FAILED
     *   ─────────────────────────────────────
     *     1. ✓ should parse invoice header (12ms)
     *     2. ✗ should reject empty payload (8ms)
     *        ↳ Expected truthy, got undefined
     *   ─────────────────────────────────────
     *
     * @param {object} result
     * @returns {string}
     */
    toText(result) {
        const report   = this.generate(result);
        const divider  = "─".repeat(45);
        const { summary } = report;

        const lines = [
            divider,
            `Suite: ${report.suite}`,
            divider,
            `${_padLabel("Passed",  LABEL_WIDTH)}: ${summary.passed}`,
            `${_padLabel("Failed",  LABEL_WIDTH)}: ${summary.failed}`,
            `${_padLabel("Skipped", LABEL_WIDTH)}: ${summary.skipped}`,
            `${_padLabel("Total",   LABEL_WIDTH)}: ${summary.total}`,
            `Duration: ${summary.duration} ms`,
            "",
            `Status: ${report.status}`,
            divider,
        ];

        if (report.results.length > 0) {
            report.results.forEach((tc, idx) => {
                lines.push(_formatTestCaseLine(tc, idx + 1));
            });
            lines.push(divider);
        }

        return lines.join("\n");
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 5. getVersion() — module identity
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the Reporter module version string.
     * Consumed by test-cli.js and test-ui.js for display and compatibility checks.
     *
     * @returns {string}
     */
    getVersion() {
        return REPORTER_VERSION;
    },
};

// ── Global registration ───────────────────────────────────────────────────────
// The public API surface is frozen — no property may be added, removed,
// or reassigned after registration.

if (typeof window !== "undefined") {
    if (!window.CozyOS) window.CozyOS = {};
    if (window.CozyOS.TestReporter) {
        throw new Error(
            "[TestReporter] window.CozyOS.TestReporter is already registered. " +
            "Duplicate module load detected."
        );
    }
    window.CozyOS.TestReporter = Object.freeze(_reporter);
}
