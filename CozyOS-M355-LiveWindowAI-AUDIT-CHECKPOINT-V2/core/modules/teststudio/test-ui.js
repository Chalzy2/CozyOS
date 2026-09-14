/**
 * ── CozyOS UNIVERSAL TEST STUDIO ENGINE ── USER INTERFACE
 * FILE: core/modules/teststudio/test-ui.js
 * VERSION: 1.0.0-PRODUCTION
 *
 * Single Responsibility: Render the Test Studio workspace UI and delegate
 * all operations to frozen Test Studio modules via TestCLI. Nothing else.
 *
 * Zero Logic Rule — this module never:
 *   • executes test functions
 *   • performs assertions
 *   • formats reports manually
 *   • stores history
 *   • validates suites
 *   • generates fake test results
 *   • performs business logic
 *   • reads/writes localStorage or sessionStorage
 *   • accesses the filesystem or network
 *   • modifies TestRegistry, TestRunner, TestReporter, or TestHistory
 *
 * Frozen dependencies (public APIs only, no private state access):
 *   window.CozyOS.TestRegistry
 *   window.CozyOS.TestRunner
 *   window.CozyOS.TestReporter
 *   window.CozyOS.TestHistory
 *   window.CozyOS.TestCLI
 *   window.CozyOS.TestAssert  (read-only version display only)
 *
 * Public frozen API:
 *   window.CozyOS.TestUI.init(container)
 *   window.CozyOS.TestUI.refresh()
 *   window.CozyOS.TestUI.runSelected()
 *   window.CozyOS.TestUI.runAll()
 *   window.CozyOS.TestUI.showHistory()
 *   window.CozyOS.TestUI.clearHistory()
 *   window.CozyOS.TestUI.destroy()
 *   window.CozyOS.TestUI.getVersion()
 */

"use strict";

// ── Module constants ──────────────────────────────────────────────────────────

const UI_VERSION = "1.0.0-PRODUCTION";

// ── Internal UI state ─────────────────────────────────────────────────────────
// Presentation-only. No test data, no report data, no assertions.

const _state = {
    selectedSuiteId:      null,
    mountedContainer:     null,
    currentOutput:        "",
    selectedHistoryIndex: null,
};

// ── DOM node registry ─────────────────────────────────────────────────────────
// Populated by _buildWorkspace(), cleared by destroy().

const _nodes = {
    workspace:      null,
    suiteList:      null,
    consoleOutput:  null,
    historyPanel:   null,
    versionPanel:   null,
    statusBar:      null,
    btnRunSelected: null,
    btnRunAll:      null,
    btnRefresh:     null,
    btnHistory:     null,
    btnClearHistory:null,
};

// ── Bound event handler references (for clean removal in destroy()) ───────────

const _handlers = {
    keydown:        null,
    btnRunSelected: null,
    btnRunAll:      null,
    btnRefresh:     null,
    btnHistory:     null,
    btnClearHistory:null,
};

// ── Dependency resolver ───────────────────────────────────────────────────────

/**
 * Retrieve a named dependency from CozyOS. Renders a UI error panel
 * rather than throwing uncaught — the workspace must never crash.
 *
 * @param {string}   name
 * @param {string[]} [methods]
 * @returns {object|null}
 */
function _dep(name, methods = []) {
    const mod = (typeof window !== "undefined") &&
                window.CozyOS &&
                window.CozyOS[name];
    if (!mod) return null;
    for (const m of methods) {
        if (typeof mod[m] !== "function") return null;
    }
    return mod;
}

// ── Safe DOM helpers ──────────────────────────────────────────────────────────

/**
 * Create a DOM element with optional attributes and text content.
 * Never uses innerHTML for user-supplied data.
 *
 * @param {string} tag
 * @param {object} [attrs]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function _el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, v);
    }
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * Set textContent safely. Never evaluates strings, never uses innerHTML
 * for dynamic data.
 *
 * @param {HTMLElement} node
 * @param {string}      text
 */
function _setText(node, text) {
    if (node) node.textContent = String(text ?? "");
}

/**
 * Set the console output panel content safely.
 * Uses textContent — never innerHTML.
 *
 * @param {string} text
 */
function _setOutput(text) {
    _state.currentOutput = String(text ?? "");
    if (_nodes.consoleOutput) {
        _setText(_nodes.consoleOutput, _state.currentOutput);
        // aria-live region — screen readers announce changes automatically
    }
}

/**
 * Show a UI error panel message without crashing the workspace.
 *
 * @param {string} message
 */
function _showError(message) {
    _setOutput(`⚠ ${message}`);
    _setStatus("Error");
}

/**
 * Update the status bar text.
 *
 * @param {string} text
 */
function _setStatus(text) {
    _setText(_nodes.statusBar, text);
}

// ── Workspace builder ─────────────────────────────────────────────────────────

/**
 * Build and mount the full workspace DOM inside the provided container.
 * All element creation uses _el() — no innerHTML, no inline handlers,
 * strict CSP compatible.
 *
 * @param {HTMLElement} container
 */
function _buildWorkspace(container) {
    // ── Outer workspace ──────────────────────────────────────────────────────
    const workspace = _el("div", {
        "class":     "cozy-test-studio",
        "role":      "main",
        "aria-label":"CozyOS Test Studio",
    });

    // ── Header ───────────────────────────────────────────────────────────────
    const header = _el("div", { "class": "cts-header" });
    const title  = _el("h1",  { "class": "cts-title" }, "CozyOS Test Studio");
    header.appendChild(title);

    // ── Toolbar ──────────────────────────────────────────────────────────────
    const toolbar = _el("div", { "class": "cts-toolbar", "role": "toolbar", "aria-label": "Test Studio controls" });

    const btnRunSelected  = _el("button", { "class": "cts-btn", "type": "button", "aria-label": "Run selected suite" }, "Run Selected");
    const btnRunAll       = _el("button", { "class": "cts-btn", "type": "button", "aria-label": "Run all suites"     }, "Run All");
    const btnRefresh      = _el("button", { "class": "cts-btn", "type": "button", "aria-label": "Refresh view"       }, "Refresh");
    const btnHistory      = _el("button", { "class": "cts-btn", "type": "button", "aria-label": "Show history"       }, "History");
    const btnClearHistory = _el("button", { "class": "cts-btn", "type": "button", "aria-label": "Clear history"      }, "Clear History");

    toolbar.appendChild(btnRunSelected);
    toolbar.appendChild(btnRunAll);
    toolbar.appendChild(btnRefresh);
    toolbar.appendChild(btnHistory);
    toolbar.appendChild(btnClearHistory);

    // ── Body layout ──────────────────────────────────────────────────────────
    const body = _el("div", { "class": "cts-body" });

    // Registered Suites panel
    const suitesSection  = _el("section", { "class": "cts-panel", "aria-label": "Registered Suites" });
    const suitesHeading  = _el("h2", { "class": "cts-panel-heading" }, "Registered Suites");
    const suiteList      = _el("ul", { "class": "cts-suite-list", "role": "list", "aria-label": "Suite list" });
    suitesSection.appendChild(suitesHeading);
    suitesSection.appendChild(suiteList);

    // Console Output panel
    const consoleSection  = _el("section", { "class": "cts-panel", "aria-label": "Console Output" });
    const consoleHeading  = _el("h2", { "class": "cts-panel-heading" }, "Console Output");
    const consoleOutput   = _el("pre", {
        "class":    "cts-console",
        "role":     "log",
        "aria-live":"polite",
        "aria-label":"Test output",
    });
    consoleSection.appendChild(consoleHeading);
    consoleSection.appendChild(consoleOutput);

    // History panel
    const historySection = _el("section", { "class": "cts-panel", "aria-label": "Test History", "role": "tabpanel" });
    const historyHeading = _el("h2", { "class": "cts-panel-heading" }, "Test History");
    const historyPanel   = _el("pre", { "class": "cts-history" });
    historySection.appendChild(historyHeading);
    historySection.appendChild(historyPanel);

    // Versions panel
    const versionsSection = _el("section", { "class": "cts-panel", "aria-label": "Module Versions" });
    const versionsHeading = _el("h2", { "class": "cts-panel-heading" }, "Versions");
    const versionPanel    = _el("pre", { "class": "cts-versions" });
    versionsSection.appendChild(versionsHeading);
    versionsSection.appendChild(versionPanel);

    body.appendChild(suitesSection);
    body.appendChild(consoleSection);
    body.appendChild(historySection);
    body.appendChild(versionsSection);

    // ── Status bar ────────────────────────────────────────────────────────────
    const statusBar = _el("div", { "class": "cts-status", "role": "status", "aria-live": "polite" }, "Ready");

    // ── Assemble workspace ───────────────────────────────────────────────────
    workspace.appendChild(header);
    workspace.appendChild(toolbar);
    workspace.appendChild(body);
    workspace.appendChild(statusBar);

    container.appendChild(workspace);

    // ── Populate node registry ───────────────────────────────────────────────
    _nodes.workspace       = workspace;
    _nodes.suiteList       = suiteList;
    _nodes.consoleOutput   = consoleOutput;
    _nodes.historyPanel    = historyPanel;
    _nodes.versionPanel    = versionPanel;
    _nodes.statusBar       = statusBar;
    _nodes.btnRunSelected  = btnRunSelected;
    _nodes.btnRunAll       = btnRunAll;
    _nodes.btnRefresh      = btnRefresh;
    _nodes.btnHistory      = btnHistory;
    _nodes.btnClearHistory = btnClearHistory;
}

// ── Suite list renderer ───────────────────────────────────────────────────────

/**
 * Render the registered suites panel from TestRegistry.getAll().
 * Displays: Suite Name, Version, Description, Test Count.
 * Uses only the public API — never reads private Registry state.
 * Reuses existing list items where possible (no full rebuild).
 */
function _renderSuiteList() {
    const registry = _dep("TestRegistry", ["getAll"]);
    if (!_nodes.suiteList) return;

    // Clear existing items — reuse the container node
    while (_nodes.suiteList.firstChild) {
        _nodes.suiteList.removeChild(_nodes.suiteList.firstChild);
    }

    if (!registry) {
        const item = _el("li", { "class": "cts-suite-item cts-suite-unavailable" },
            "TestRegistry unavailable.");
        _nodes.suiteList.appendChild(item);
        return;
    }

    const suites = registry.getAll();
    if (!Array.isArray(suites) || suites.length === 0) {
        const item = _el("li", { "class": "cts-suite-item cts-suite-empty" },
            "No suites registered.");
        _nodes.suiteList.appendChild(item);
        return;
    }

    for (const suite of suites) {
        const id      = String(suite.id ?? suite.suiteId ?? "");
        const name    = String(suite.name        ?? id);
        const version = String(suite.version     ?? "");
        const desc    = String(suite.description ?? "");
        const count   = suite.tests != null ? String(suite.tests.length ?? suite.testCount ?? "") : "";

        const item = _el("li", {
            "class":         `cts-suite-item${_state.selectedSuiteId === id ? " cts-suite-selected" : ""}`,
            "role":          "button",
            "tabindex":      "0",
            "aria-selected": _state.selectedSuiteId === id ? "true" : "false",
            "aria-label":    `Suite: ${name}`,
            "data-suite-id": id,
        });

        const itemName = _el("span", { "class": "cts-suite-name" }, name);
        item.appendChild(itemName);

        if (version) {
            const itemVer = _el("span", { "class": "cts-suite-version" }, ` v${version}`);
            item.appendChild(itemVer);
        }
        if (count) {
            const itemCount = _el("span", { "class": "cts-suite-count" }, ` [${count} tests]`);
            item.appendChild(itemCount);
        }
        if (desc) {
            const itemDesc = _el("div", { "class": "cts-suite-desc" }, desc);
            item.appendChild(itemDesc);
        }

        // Selection handler — registered via addEventListener, no inline handler
        item.addEventListener("click", () => _selectSuite(id, item));
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                _selectSuite(id, item);
            }
        });

        _nodes.suiteList.appendChild(item);
    }
}

/**
 * Mark a suite as selected in UI state and update ARIA attributes.
 * Does not run anything — selection only.
 *
 * @param {string}      id
 * @param {HTMLElement} selectedItem
 */
function _selectSuite(id, selectedItem) {
    _state.selectedSuiteId = id;
    // Update aria-selected on all items without rebuilding the list
    const items = _nodes.suiteList.querySelectorAll(".cts-suite-item");
    items.forEach(item => {
        const isSelected = item.dataset.suiteId === id;
        item.setAttribute("aria-selected", isSelected ? "true" : "false");
        item.classList.toggle("cts-suite-selected", isSelected);
    });
    _setStatus(`Selected: ${id}`);
}

// ── Version panel renderer ────────────────────────────────────────────────────

/**
 * Render all module versions via each module's getVersion() method.
 * If a module is absent, shows "(not available)" — never crashes.
 */
function _renderVersionPanel() {
    if (!_nodes.versionPanel) return;

    const get = (name) => {
        try {
            const m = _dep(name, ["getVersion"]);
            return m ? m.getVersion() : "(not available)";
        } catch (_) { return "(error)"; }
    };

    const lines = [
        `Registry : ${get("TestRegistry")}`,
        `Runner   : ${get("TestRunner")}`,
        `Reporter : ${get("TestReporter")}`,
        `History  : ${get("TestHistory")}`,
        `Assert   : ${get("TestAssert")}`,
        `CLI      : ${get("TestCLI")}`,
        `UI       : ${UI_VERSION}`,
    ];

    _setText(_nodes.versionPanel, lines.join("\n"));
}

// ── History panel renderer ────────────────────────────────────────────────────

/**
 * Render the history panel from TestHistory.getAll().
 * Displays: Suite, Status, Time, Duration — no calculations.
 */
function _renderHistoryPanel() {
    if (!_nodes.historyPanel) return;

    const hist = _dep("TestHistory", ["getAll"]);
    if (!hist) {
        _setText(_nodes.historyPanel, "TestHistory unavailable.");
        return;
    }

    const entries = hist.getAll();
    if (!Array.isArray(entries) || entries.length === 0) {
        _setText(_nodes.historyPanel, "No history entries.");
        return;
    }

    const lines = entries.map((r, i) => {
        const suite    = String(r.suite       ?? "(unknown)");
        const status   = String(r.status      ?? "UNKNOWN");
        const at       = String(r.generatedAt ?? "");
        const duration = r.summary?.duration != null ? `${r.summary.duration}ms` : "";
        return `${String(i + 1).padStart(3)}. [${status}] ${suite}  ${duration}  ${at}`;
    });

    _setText(_nodes.historyPanel, lines.join("\n"));
}

// ── Event binding ─────────────────────────────────────────────────────────────

/**
 * Bind all toolbar button handlers and keyboard shortcuts.
 * All handlers use addEventListener — no inline handlers, strict CSP compatible.
 * References stored in _handlers for clean removal in destroy().
 */
function _bindEvents() {
    // Toolbar buttons
    _handlers.btnRunSelected  = () => _ui.runSelected();
    _handlers.btnRunAll       = () => _ui.runAll();
    _handlers.btnRefresh      = () => _ui.refresh();
    _handlers.btnHistory      = () => _ui.showHistory();
    _handlers.btnClearHistory = () => _ui.clearHistory();

    _nodes.btnRunSelected .addEventListener("click", _handlers.btnRunSelected);
    _nodes.btnRunAll      .addEventListener("click", _handlers.btnRunAll);
    _nodes.btnRefresh     .addEventListener("click", _handlers.btnRefresh);
    _nodes.btnHistory     .addEventListener("click", _handlers.btnHistory);
    _nodes.btnClearHistory.addEventListener("click", _handlers.btnClearHistory);

    // Keyboard shortcuts — with focus guard (no misfires inside inputs)
    // ↑↓ : navigate suite list   Ctrl+R : run selected   Ctrl+L : clear history
    _handlers.keydown = (e) => {
        const active = document.activeElement;
        const inInput = active &&
            (active.tagName === "INPUT" ||
             active.tagName === "TEXTAREA" ||
             active.isContentEditable);

        // Escape always works — no focus guard needed
        if (e.key === "Escape") {
            _state.selectedSuiteId = null;
            _renderSuiteList();
            _setStatus("Selection cleared");
            return;
        }

        // All other shortcuts respect input focus
        if (inInput) return;

        if (e.ctrlKey && e.key === "r") { e.preventDefault(); _ui.runSelected();  return; }
        if (e.ctrlKey && e.key === "l") { e.preventDefault(); _ui.clearHistory(); return; }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            _navigateSuiteList(e.key === "ArrowDown" ? 1 : -1);
        }
    };

    document.addEventListener("keydown", _handlers.keydown);
}

/**
 * Move suite list selection up or down by delta.
 * Pure presentation state change — no test logic.
 *
 * @param {number} delta  +1 or -1
 */
function _navigateSuiteList(delta) {
    const items = Array.from(_nodes.suiteList.querySelectorAll(".cts-suite-item[data-suite-id]"));
    if (items.length === 0) return;

    const currentIdx = items.findIndex(i => i.dataset.suiteId === _state.selectedSuiteId);
    const nextIdx    = Math.max(0, Math.min(items.length - 1, currentIdx + delta));
    const nextItem   = items[nextIdx];
    if (nextItem) {
        _selectSuite(nextItem.dataset.suiteId, nextItem);
        nextItem.focus();
    }
}

// ── Public API implementation ─────────────────────────────────────────────────

const _ui = {

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. init(container)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Mount the Test Studio workspace inside the provided container element.
     * Must be called before any other method.
     *
     * @param {HTMLElement} container
     */
    init(container) {
        if (!container || !(container instanceof HTMLElement)) {
            throw new TypeError(
                "[TestUI] init(): container must be an HTMLElement."
            );
        }
        if (_state.mountedContainer) {
            throw new Error(
                "[TestUI] init(): already initialised. Call destroy() before re-initialising."
            );
        }

        _state.mountedContainer = container;
        _buildWorkspace(container);
        _bindEvents();
        _renderSuiteList();
        _renderVersionPanel();
        _setStatus("Ready");
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. refresh()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Reload the Registry viewer, History panel, and Version panel.
     * Only refreshes affected panels — does not rebuild the whole workspace.
     * Focus is restored to the previously selected suite item if present.
     */
    refresh() {
        if (!_state.mountedContainer) return;

        const previousId = _state.selectedSuiteId;
        _renderSuiteList();
        _renderHistoryPanel();
        _renderVersionPanel();
        _setStatus("Refreshed");

        // Restore focus after refresh
        if (previousId && _nodes.suiteList) {
            const target = _nodes.suiteList.querySelector(
                `[data-suite-id="${CSS.escape(previousId)}"]`
            );
            if (target) target.focus();
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. runSelected()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Run the currently selected suite via TestCLI.execute("run <suiteId>").
     * Displays the returned string in the console output panel.
     */
    async runSelected() {
        const cli = _dep("TestCLI", ["execute"]);
        if (!cli) { _showError("TestCLI is unavailable."); return; }

        if (!_state.selectedSuiteId) {
            _setOutput("No suite selected. Select a suite from the list first.");
            _setStatus("No selection");
            return;
        }

        _setStatus(`Running: ${_state.selectedSuiteId}…`);
        try {
            const output = await cli.execute(`run ${_state.selectedSuiteId}`);
            _setOutput(output);
            _renderHistoryPanel();
            _setStatus("Done");
        } catch (err) {
            _showError(String(err.message ?? err));
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. runAll()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Run all registered suites via TestCLI.execute("run-all").
     * Displays the returned string in the console output panel.
     */
    async runAll() {
        const cli = _dep("TestCLI", ["execute"]);
        if (!cli) { _showError("TestCLI is unavailable."); return; }

        _setStatus("Running all suites…");
        try {
            const output = await cli.execute("run-all");
            _setOutput(output);
            _renderHistoryPanel();
            _setStatus("Done");
        } catch (err) {
            _showError(String(err.message ?? err));
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 5. showHistory()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Display the full history summary in the console output panel.
     * Calls TestCLI.execute("history") — no direct History access.
     */
    showHistory() {
        const cli = _dep("TestCLI", ["execute"]);
        if (!cli) { _showError("TestCLI is unavailable."); return; }

        try {
            const output = cli.execute("history");
            // history command is synchronous — no await needed
            if (output && typeof output.then === "function") {
                output.then(o => { _setOutput(o); _setStatus("History loaded"); })
                      .catch(e => _showError(String(e.message ?? e)));
            } else {
                _setOutput(output);
                _setStatus("History loaded");
            }
            _renderHistoryPanel();
        } catch (err) {
            _showError(String(err.message ?? err));
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 6. clearHistory()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Clear all history via TestCLI.execute("clear-history").
     * Refreshes the history panel after clearing.
     */
    clearHistory() {
        const cli = _dep("TestCLI", ["execute"]);
        if (!cli) { _showError("TestCLI is unavailable."); return; }

        try {
            const output = cli.execute("clear-history");
            if (output && typeof output.then === "function") {
                output.then(o => { _setOutput(o); _renderHistoryPanel(); _setStatus("History cleared"); })
                      .catch(e => _showError(String(e.message ?? e)));
            } else {
                _setOutput(output);
                _renderHistoryPanel();
                _setStatus("History cleared");
            }
        } catch (err) {
            _showError(String(err.message ?? err));
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 7. destroy()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Remove all DOM listeners, UI nodes, and internal references.
     * Leaves Core modules completely untouched.
     */
    destroy() {
        // Remove keyboard listener
        if (_handlers.keydown) {
            document.removeEventListener("keydown", _handlers.keydown);
            _handlers.keydown = null;
        }

        // Remove toolbar button listeners
        const btnMap = [
            ["btnRunSelected",  "btnRunSelected"],
            ["btnRunAll",       "btnRunAll"],
            ["btnRefresh",      "btnRefresh"],
            ["btnHistory",      "btnHistory"],
            ["btnClearHistory", "btnClearHistory"],
        ];
        for (const [nodeKey, handlerKey] of btnMap) {
            if (_nodes[nodeKey] && _handlers[handlerKey]) {
                _nodes[nodeKey].removeEventListener("click", _handlers[handlerKey]);
                _handlers[handlerKey] = null;
            }
        }

        // Remove workspace DOM node
        if (_nodes.workspace && _nodes.workspace.parentNode) {
            _nodes.workspace.parentNode.removeChild(_nodes.workspace);
        }

        // Clear all node references
        for (const key of Object.keys(_nodes)) {
            _nodes[key] = null;
        }

        // Reset presentation state
        _state.selectedSuiteId      = null;
        _state.mountedContainer     = null;
        _state.currentOutput        = "";
        _state.selectedHistoryIndex = null;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // § 8. getVersion()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the UI module version string.
     *
     * @returns {string}
     */
    getVersion() {
        return UI_VERSION;
    },
};

// ── Global registration ───────────────────────────────────────────────────────
// Hot-reload safe, version-conflict aware — same pattern as TestHistory / TestCLI.

if (typeof window !== "undefined") {
    if (!window.CozyOS) window.CozyOS = {};

    if (window.CozyOS.TestUI) {
        let existingVersion = "(unknown)";
        try {
            if (typeof window.CozyOS.TestUI.getVersion === "function") {
                existingVersion = window.CozyOS.TestUI.getVersion();
            }
        } catch (_) { /* guard broken getVersion */ }

        if (existingVersion !== UI_VERSION) {
            throw new Error(
                `[TestUI] Version conflict: registered version is ${existingVersion}, ` +
                `attempted load is ${UI_VERSION}. ` +
                `Only one version of TestUI may be active at a time.`
            );
        }
        // Same version — hot-reload no-op, existing registration preserved.
    } else {
        window.CozyOS.TestUI = Object.freeze(_ui);
    }
}
