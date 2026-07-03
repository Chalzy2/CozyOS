/**
 * ── CozyOS UNIVERSAL TEST STUDIO ENGINE ── COMMAND LINE INTERFACE
 * FILE: core/modules/teststudio/test-cli.js
 * VERSION: 1.0.0-PRODUCTION
 *
 * Single Responsibility: Accept user commands, delegate to frozen Test
 * Studio modules, and return formatted terminal output. Nothing else.
 *
 * Zero Logic Rule — this module never:
 *   • executes test functions
 *   • performs assertions
 *   • compares values
 *   • formats reports manually
 *   • stores history directly
 *   • validates suites
 *   • modifies Registry, Runner, Reporter, or History
 *
 * Frozen dependencies (never reaches private state):
 *   window.CozyOS.TestRegistry
 *   window.CozyOS.TestRunner
 *   window.CozyOS.TestReporter
 *   window.CozyOS.TestHistory
 *
 * Public frozen API:
 *   window.CozyOS.TestCLI.execute(command)
 *   window.CozyOS.TestCLI.help()
 *   window.CozyOS.TestCLI.version()
 *   window.CozyOS.TestCLI.getVersion()
 *
 * Supported commands:
 *   help · version · list · count
 *   run <suiteId> · run-all
 *   history · last · clear-history
 */

"use strict";

// ── Module constants ──────────────────────────────────────────────────────────

const CLI_VERSION = "1.0.0-PRODUCTION";

const DIVIDER = "─".repeat(50);

// ── Dependency resolver ───────────────────────────────────────────────────────

/**
 * Retrieve a named dependency from the CozyOS global namespace.
 * Throws a descriptive Error if the dependency is absent or missing
 * an expected method — fail fast, never silently degrade.
 *
 * @param {string}   name          CozyOS namespace key (e.g. "TestRunner")
 * @param {string[]} [methods]     Optional method names to verify presence
 * @returns {object}
 */
function _dep(name, methods = []) {
    const mod = (typeof window !== "undefined") &&
                window.CozyOS &&
                window.CozyOS[name];

    if (!mod) {
        throw new Error(
            `[TestCLI] Dependency unavailable: window.CozyOS.${name}. ` +
            `Ensure ${name} is loaded and registered before using TestCLI.`
        );
    }

    for (const method of methods) {
        if (typeof mod[method] !== "function") {
            throw new Error(
                `[TestCLI] window.CozyOS.${name}.${method} is not a function. ` +
                `The installed version of ${name} may be incompatible.`
            );
        }
    }

    return mod;
}

// ── Private output formatters ─────────────────────────────────────────────────
// All formatting is delegation to TestReporter or simple string assembly.
// No report structure is built here — Zero Logic Rule.

/**
 * Format a history summary line from a single stored report.
 * Uses only fields the Reporter guarantees are present.
 *
 * @param {Readonly<object>} report
 * @param {number}           index
 * @returns {string}
 */
function _formatHistoryLine(report, index) {
    const suite    = String(report.suite    ?? "(unknown)");
    const status   = String(report.status   ?? "UNKNOWN");
    const at       = String(report.generatedAt ?? "");
    const duration = report.summary?.duration != null
        ? ` ${report.summary.duration}ms`
        : "";
    return `  ${String(index).padStart(3)}. [${status}] ${suite}${duration}  ${at}`;
}

// ── Command handlers ──────────────────────────────────────────────────────────

/**
 * @returns {string}
 */
function _cmdHelp() {
    return [
        DIVIDER,
        "CozyOS Test Studio CLI — Available Commands",
        DIVIDER,
        "  help             Show this help message",
        "  version          Show versions of all Test Studio modules",
        "  list             List all registered test suites",
        "  count            Show the number of registered test suites",
        "  run <suiteId>    Run a single suite by ID and return the text report",
        "  run-all          Run all registered suites and return all text reports",
        "  history          Show a summary of all stored history entries",
        "  last             Show the most recent history entry",
        "  clear-history    Clear all stored history entries",
        DIVIDER,
    ].join("\n");
}

/**
 * @returns {string}
 */
function _cmdVersion() {
    const registry = _dep("TestRegistry", ["getVersion"]);
    const runner   = _dep("TestRunner",   ["getVersion"]);
    const reporter = _dep("TestReporter", ["getVersion"]);
    const history  = _dep("TestHistory",  ["getVersion"]);

    // TestAssert version is retrieved defensively — it may not expose getVersion
    const assertMod = (typeof window !== "undefined") && window.CozyOS?.TestAssert;
    const assertVer = (assertMod && typeof assertMod.getVersion === "function")
        ? assertMod.getVersion()
        : "(not available)";

    return [
        DIVIDER,
        "CozyOS Test Studio — Module Versions",
        DIVIDER,
        `  TestCLI      : ${CLI_VERSION}`,
        `  TestRegistry : ${registry.getVersion()}`,
        `  TestRunner   : ${runner.getVersion()}`,
        `  TestAssert   : ${assertVer}`,
        `  TestReporter : ${reporter.getVersion()}`,
        `  TestHistory  : ${history.getVersion()}`,
        DIVIDER,
    ].join("\n");
}

/**
 * @returns {string}
 */
function _cmdList() {
    const registry = _dep("TestRegistry", ["getAll"]);
    const suites   = registry.getAll();

    if (!Array.isArray(suites) || suites.length === 0) {
        return "No test suites are currently registered.";
    }

    const lines = [
        DIVIDER,
        `Registered Test Suites (${suites.length})`,
        DIVIDER,
    ];

    suites.forEach((suite, i) => {
        const id   = String(suite.id   ?? suite.suiteId ?? "(no id)");
        const name = String(suite.name ?? "");
        const desc = name ? ` — ${name}` : "";
        lines.push(`  ${String(i + 1).padStart(3)}. ${id}${desc}`);
    });

    lines.push(DIVIDER);
    return lines.join("\n");
}

/**
 * @returns {string}
 */
function _cmdCount() {
    const registry = _dep("TestRegistry", ["count"]);
    const n        = registry.count();
    return `Registered test suites: ${n}`;
}

/**
 * @param {string} suiteId
 * @returns {Promise<string>}
 */
async function _cmdRun(suiteId) {
    if (!suiteId || typeof suiteId !== "string" || !suiteId.trim()) {
        throw new Error(
            "[TestCLI] run: suiteId is required. Usage: run <suiteId>"
        );
    }

    const runner   = _dep("TestRunner",   ["run"]);
    const reporter = _dep("TestReporter", ["generate", "toText"]);
    const history  = _dep("TestHistory",  ["add"]);

    const result = await runner.run(suiteId.trim());
    const report = reporter.generate(result);
    history.add(report);
    return reporter.toText(result);
}

/**
 * @returns {Promise<string>}
 */
async function _cmdRunAll() {
    const runner   = _dep("TestRunner",   ["runAll"]);
    const reporter = _dep("TestReporter", ["generate", "toText"]);
    const history  = _dep("TestHistory",  ["add"]);

    const results = await runner.runAll();

    if (!Array.isArray(results) || results.length === 0) {
        return "No test suites were executed. Register suites before running run-all.";
    }

    const lines = [];
    for (const result of results) {
        const report = reporter.generate(result);
        history.add(report);
        lines.push(reporter.toText(result));
        lines.push("");
    }

    return lines.join("\n").trimEnd();
}

/**
 * @returns {string}
 */
function _cmdHistory() {
    const hist    = _dep("TestHistory", ["getAll"]);
    const entries = hist.getAll();

    if (!Array.isArray(entries) || entries.length === 0) {
        return "Test history is empty.";
    }

    const lines = [
        DIVIDER,
        `Test History (${entries.length} entr${entries.length === 1 ? "y" : "ies"})`,
        DIVIDER,
    ];

    entries.forEach((report, i) => {
        lines.push(_formatHistoryLine(report, i + 1));
    });

    lines.push(DIVIDER);
    return lines.join("\n");
}

/**
 * @returns {string}
 */
function _cmdLast() {
    const hist = _dep("TestHistory", ["last"]);
    const reporter = _dep("TestReporter", ["toText"]);
    const report   = hist.last();

    if (!report) {
        return "Test history is empty. Run a suite first.";
    }

    return reporter.toText(report);
}

/**
 * @returns {string}
 */
function _cmdClearHistory() {
    const hist    = _dep("TestHistory", ["clear"]);
    const removed = hist.clear();
    const n       = typeof removed === "number" ? removed : "all";
    return `Test history cleared. ${n} report(s) removed.`;
}

// ── CLI implementation ────────────────────────────────────────────────────────

const _cli = {

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. execute(command) — primary dispatch entry point
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Parse and execute a CLI command string.
     * Delegates every operation to the appropriate frozen Test Studio module.
     * Returns a string (or a Promise<string> for async commands).
     *
     * Never prints to the console — all output is returned to the caller.
     *
     * @param {string} command  Raw command string from the user
     * @returns {string | Promise<string>}
     */
    execute(command) {
        if (typeof command !== "string") {
            throw new TypeError(
                `[TestCLI] execute(): command must be a string. Received: ${typeof command}`
            );
        }

        const trimmed = command.trim();
        if (!trimmed) {
            throw new Error(
                "[TestCLI] execute(): empty command. Type 'help' for available commands."
            );
        }

        // Split into verb and optional argument
        const spaceIdx = trimmed.indexOf(" ");
        const verb     = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
        const arg      = spaceIdx === -1 ? ""       : trimmed.slice(spaceIdx + 1).trim();

        switch (verb.toLowerCase()) {
            case "help":          return _cmdHelp();
            case "version":       return _cmdVersion();
            case "list":          return _cmdList();
            case "count":         return _cmdCount();
            case "run":           return _cmdRun(arg);
            case "run-all":       return _cmdRunAll();
            case "history":       return _cmdHistory();
            case "last":          return _cmdLast();
            case "clear-history": return _cmdClearHistory();

            default:
                throw new Error(
                    `[TestCLI] Unknown command: "${verb}". ` +
                    `Type 'help' for a list of available commands.`
                );
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. help() — convenience alias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the formatted help text directly.
     * Equivalent to execute("help").
     *
     * @returns {string}
     */
    help() {
        return _cmdHelp();
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. version() — convenience alias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the formatted version listing directly.
     * Equivalent to execute("version").
     *
     * @returns {string}
     */
    version() {
        return _cmdVersion();
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. getVersion() — module identity
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the CLI module version string.
     *
     * @returns {string}
     */
    getVersion() {
        return CLI_VERSION;
    },
};

// ── Global registration ───────────────────────────────────────────────────────
// Applies the same hot-reload-safe, version-conflict-aware pattern
// established by TestHistory certification finding M-03.

if (typeof window !== "undefined") {
    if (!window.CozyOS) window.CozyOS = {};

    if (window.CozyOS.TestCLI) {
        // A prior registration exists — check version compatibility
        let existingVersion = "(unknown)";
        try {
            if (typeof window.CozyOS.TestCLI.getVersion === "function") {
                existingVersion = window.CozyOS.TestCLI.getVersion();
            }
        } catch (_) { /* guard against broken getVersion */ }

        if (existingVersion !== CLI_VERSION) {
            throw new Error(
                `[TestCLI] Version conflict: registered version is ${existingVersion}, ` +
                `attempted load is ${CLI_VERSION}. ` +
                `Only one version of TestCLI may be active at a time.`
            );
        }
        // Same version — hot-reload no-op, existing registration preserved.
    } else {
        window.CozyOS.TestCLI = Object.freeze(_cli);
    }
}
