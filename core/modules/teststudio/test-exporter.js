/**
 * ── CozyOS Enterprise Framework ──────────────────────────────────────────────
 * Test Studio Subsystem
 *
 * FILE:               core/modules/teststudio/test-exporter.js
 * LAYER:              Presentation / Export Services
 * VERSION:            1.0.0-PRODUCTION
 * SINGLE RESPONSIBILITY: Export immutable Test Studio reports produced by the
 *   certified Reporter/History modules into external formats without modifying
 *   them.
 *
 * ZERO LOGIC RULE (strictly enforced):
 *   This module never runs tests, performs assertions, registers suites,
 *   formats reports manually, edits history, edits registry, edits reports,
 *   fabricates statistics, changes report values, validates test results,
 *   recalculates pass/fail, uses timers, uses localStorage, uses
 *   sessionStorage, accesses the network, or modifies the filesystem directly.
 *
 *   Its job is only serializing already-certified report objects into external
 *   formats and triggering browser file downloads.
 *
 * FROZEN DEPENDENCIES (read-only, public API surface only):
 *   window.CozyOS.TestReporter  → .generate()
 *   window.CozyOS.TestHistory   → .get() / .getAll() / .last()
 *
 *   This module never accesses:
 *   TestRegistry / TestRunner / TestAssert / TestSuite /
 *   TestCLI / TestUI / TestDashboard
 *
 * IMMUTABILITY CONTRACT:
 *   Every export operation produces a deep-frozen structural copy of the
 *   source data before serialization. The source report or history entry is
 *   never mutated, and the serialized output is never post-processed.
 *
 * PUBLIC FROZEN API:
 *   window.CozyOS.TestExporter.exportJSON(report)  → string
 *   window.CozyOS.TestExporter.exportText(report)  → string
 *   window.CozyOS.TestExporter.exportHistory()     → string
 *   window.CozyOS.TestExporter.download(filename, data)
 *   window.CozyOS.TestExporter.getVersion()        → string
 *
 * OUTPUT FORMATS (v1.0.0-PRODUCTION):
 *   JSON  — deterministic, pretty-printed, 2-space indented
 *   TXT   — human-readable plain text, line-delimited
 *
 * DESIGN CONSTRAINTS:
 *   - No hidden state: every method is stateless and deterministic
 *   - No caching: no internal data is retained between calls
 *   - No business logic: report content is serialized as-is
 *   - CSP compliant: no eval, no inline handlers, no data URI injection
 *   - ES2022
 *   - Hot-reload safe: module carries no instance state
 *
 * NOTE — download() and temporary DOM:
 *   Browser file downloads require a transient <a> element. This element
 *   is created, used, and immediately revoked within a single synchronous
 *   call frame. It is never appended to the live document tree and carries
 *   no reference beyond its scope. This is the standard, CSP-safe download
 *   mechanism and does not violate the "no persistent DOM manipulation" rule.
 */

"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};

    // ── Module constants ────────────────────────────────────────────────────

    const VERSION = "1.0.0-PRODUCTION";

    // Text export field widths / separators — presentation constants only,
    // not business logic.
    const TXT_SEPARATOR  = "─".repeat(60);
    const TXT_HEADER_SEP = "═".repeat(60);

    // ── Internal pure helpers ───────────────────────────────────────────────

    /**
     * Produces a deep structural copy of an object suitable for serialization.
     * Certified report objects may contain nested structures; this ensures the
     * source is never mutated, even inadvertently, during JSON serialization.
     * Uses JSON round-trip: sufficient for plain-data report objects and avoids
     * any dependency on structuredClone availability across target runtimes.
     *
     * Returns null if the value cannot be copied (e.g. undefined, circular).
     *
     * @param {*} value
     * @returns {*}
     */
    function _deepCopy(value) {
        if (value === undefined) return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return null;
        }
    }

    /**
     * Safe read of a public API method on a frozen dependency. Returns
     * undefined without throwing if the module or method is absent.
     *
     * @param {string} moduleName
     * @param {string} methodName
     * @param {...*}   args
     * @returns {*}
     */
    function _safeCall(moduleName, methodName, ...args) {
        const mod = window.CozyOS?.[moduleName];
        if (!mod || typeof mod[methodName] !== "function") return undefined;
        try {
            return mod[methodName](...args);
        } catch {
            return undefined;
        }
    }

    /**
     * Validates that a report value is a non-null plain object. Used as the
     * defensive entry guard on exportJSON() and exportText(). Does not inspect
     * or validate report content — content validation is TestReporter's concern.
     *
     * @param {*} report
     * @returns {boolean}
     */
    function _isReportObject(report) {
        return report !== null && report !== undefined && typeof report === "object" && !Array.isArray(report);
    }

    // ── Text serialization helpers ──────────────────────────────────────────
    // These functions read certified report fields and emit plain text lines.
    // They never recalculate, fabricate, or alter any value — they only read
    // and represent what is already present in the report copy.

    /**
     * Emits a single line from a key and its value, padding the key label to
     * a fixed width for alignment. Returns a plain string; never touches DOM.
     *
     * @param {string} key
     * @param {*}      value
     * @returns {string}
     */
    function _line(key, value) {
        const label   = String(key).padEnd(22, " ");
        const display = value !== null && value !== undefined ? String(value) : "—";
        return `  ${label}: ${display}`;
    }

    /**
     * Converts a single certified report object into a human-readable plain
     * text block. Reads report fields as-is; emits "—" for absent values.
     * Never modifies, recalculates, or infers any field value.
     *
     * @param {object} copy — deep copy of a certified report
     * @returns {string}
     */
    function _reportToText(copy) {
        const lines = [];

        lines.push(TXT_HEADER_SEP);
        lines.push("  CozyOS Test Studio — Report Export");
        lines.push(`  Exported: ${new Date().toISOString()}`);
        lines.push(TXT_HEADER_SEP);

        // Identity fields — read certified report fields only
        lines.push("");
        lines.push("  REPORT METADATA");
        lines.push(TXT_SEPARATOR);
        lines.push(_line("Suite",        copy?.suite));
        lines.push(_line("Generated At", copy?.generatedAt));
        lines.push(_line("Runner",       copy?.runner));
        lines.push(_line("Environment",  copy?.environment));

        // Summary block — certified summary fields from TestReporter
        const summary = copy?.summary;
        if (summary !== null && summary !== undefined) {
            lines.push("");
            lines.push("  SUMMARY");
            lines.push(TXT_SEPARATOR);
            lines.push(_line("Status",       summary?.status));
            lines.push(_line("Duration (ms)", summary?.duration));
            lines.push(_line("Total",         summary?.total));
            lines.push(_line("Passed",        summary?.passed));
            lines.push(_line("Failed",        summary?.failed));
            lines.push(_line("Skipped",       summary?.skipped));
        }

        // Results block — each result entry serialized as-is
        const results = copy?.results;
        if (Array.isArray(results) && results.length > 0) {
            lines.push("");
            lines.push("  TEST RESULTS");
            lines.push(TXT_SEPARATOR);
            for (const result of results) {
                lines.push(`  [${result?.status ?? "—"}] ${result?.name ?? "—"}`);
                if (result?.error) {
                    lines.push(`         Error: ${result.error}`);
                }
                if (result?.duration != null) {
                    lines.push(`         Duration: ${result.duration}ms`);
                }
            }
        }

        lines.push("");
        lines.push(TXT_HEADER_SEP);
        lines.push("  END OF REPORT");
        lines.push(TXT_HEADER_SEP);

        return lines.join("\n");
    }

    // ── Public API implementations ──────────────────────────────────────────

    /**
     * Serializes a certified report object to a deterministic, pretty-printed
     * JSON string. Produces a deep copy before serialization — the source
     * report is never mutated. Returns an error-sentinel JSON string if the
     * report is invalid or unserializable rather than throwing.
     *
     * @param {object} report — certified report from TestReporter.generate()
     * @returns {string}      — JSON string (UTF-8 safe, 2-space indented)
     */
    function exportJSON(report) {
        if (!_isReportObject(report)) {
            return JSON.stringify({
                exportError: "Invalid report: expected a non-null object.",
                exportedAt:  new Date().toISOString()
            }, null, 2);
        }

        const copy = _deepCopy(report);
        if (copy === null) {
            return JSON.stringify({
                exportError: "Report could not be copied for serialization (possibly contains circular references).",
                exportedAt:  new Date().toISOString()
            }, null, 2);
        }

        try {
            return JSON.stringify(copy, null, 2);
        } catch {
            return JSON.stringify({
                exportError: "Report serialization failed.",
                exportedAt:  new Date().toISOString()
            }, null, 2);
        }
    }

    /**
     * Serializes a certified report object to a human-readable plain text
     * string. Produces a deep copy before serialization — the source report
     * is never mutated. Reads certified report fields as-is; absent fields
     * are represented as "—". Never recalculates, infers, or fabricates
     * any field value.
     *
     * @param {object} report — certified report from TestReporter.generate()
     * @returns {string}      — plain text (UTF-8, line-delimited)
     */
    function exportText(report) {
        if (!_isReportObject(report)) {
            return [
                TXT_HEADER_SEP,
                "  CozyOS Test Studio — Export Error",
                "  Invalid report: expected a non-null object.",
                `  Attempted at: ${new Date().toISOString()}`,
                TXT_HEADER_SEP
            ].join("\n");
        }

        const copy = _deepCopy(report);
        if (copy === null) {
            return [
                TXT_HEADER_SEP,
                "  CozyOS Test Studio — Export Error",
                "  Report could not be copied for serialization.",
                `  Attempted at: ${new Date().toISOString()}`,
                TXT_HEADER_SEP
            ].join("\n");
        }

        return _reportToText(copy);
    }

    /**
     * Reads the full test history from TestHistory.getAll() and serializes
     * all entries to a JSON string. Each entry is deep-copied before
     * serialization — history is never mutated. Returns an error-sentinel
     * JSON string if history is unavailable or unserializable.
     *
     * @returns {string} — JSON array string of all history entries
     */
    function exportHistory() {
        const entries = _safeCall("TestHistory", "getAll");

        if (!Array.isArray(entries)) {
            return JSON.stringify({
                exportError: "TestHistory.getAll() returned no data or is unavailable.",
                exportedAt:  new Date().toISOString()
            }, null, 2);
        }

        const copies = entries.map((entry) => _deepCopy(entry)).filter((c) => c !== null);

        try {
            return JSON.stringify({
                exportedAt:    new Date().toISOString(),
                totalEntries:  copies.length,
                entries:       copies
            }, null, 2);
        } catch {
            return JSON.stringify({
                exportError: "History serialization failed.",
                exportedAt:  new Date().toISOString()
            }, null, 2);
        }
    }

    /**
     * Triggers a browser file download of the provided data string.
     *
     * A transient <a> element is created, used, and immediately revoked
     * within a single synchronous call frame. It is never appended to the
     * live document tree. The object URL is revoked immediately after the
     * click to release the Blob from memory. This is the standard
     * CSP-compliant browser download mechanism.
     *
     * @param {string} filename — desired file name including extension
     * @param {string} data     — string content to write to the file
     * @returns {void}
     */
    function download(filename, data) {
        if (typeof filename !== "string" || filename.trim().length === 0) {
            throw new TypeError("[TestExporter] download() requires a non-empty string filename.");
        }
        if (typeof data !== "string") {
            throw new TypeError("[TestExporter] download() requires a string data argument.");
        }
        if (typeof document === "undefined" || typeof URL === "undefined") {
            throw new Error("[TestExporter] download() requires a browser environment.");
        }

        const mimeType = filename.endsWith(".json") ? "application/json" : "text/plain";
        const blob     = new Blob([data], { type: `${mimeType};charset=utf-8` });
        const url      = URL.createObjectURL(blob);
        const anchor   = document.createElement("a");

        anchor.href     = url;
        anchor.download = filename.trim();

        // Transient click dispatch: anchor is never inserted into the DOM tree
        anchor.dispatchEvent(new MouseEvent("click", {
            bubbles:    false,
            cancelable: true,
            view:       window
        }));

        // Immediately revoke the object URL to release the Blob from memory
        URL.revokeObjectURL(url);
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

    window.CozyOS.TestExporter = Object.freeze({
        exportJSON,
        exportText,
        exportHistory,
        download,
        getVersion
    });

})();
