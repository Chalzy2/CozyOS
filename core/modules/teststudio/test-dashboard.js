/**
 * ── CozyOS Enterprise Framework ──────────────────────────────────────────────
 * Test Studio Subsystem
 *
 * FILE:               core/modules/teststudio/test-dashboard.js
 * LAYER:              Presentation
 * VERSION:            1.0.1-PRODUCTION
 * SINGLE RESPONSIBILITY: Render Test Studio dashboard using frozen public APIs only.
 *
 * ZERO LOGIC RULE (strictly enforced):
 *   This module never executes tests, performs assertions, formats reports,
 *   stores or modifies history, registers or unregisters suites, edits
 *   registry contents, validates suites, generates reports, parses JSON,
 *   fabricates statistics, creates fake counters, or modifies any Core module.
 *
 * FROZEN DEPENDENCIES (read-only, public API surface only):
 *   window.CozyOS.TestRegistry
 *   window.CozyOS.TestRunner
 *   window.CozyOS.TestReporter
 *   window.CozyOS.TestHistory
 *   window.CozyOS.TestSuite
 *   window.CozyOS.TestCLI
 *   window.CozyOS.TestUI
 *
 * PUBLIC API:
 *   window.CozyOS.TestDashboard.init(container)
 *   window.CozyOS.TestDashboard.refresh()
 *   window.CozyOS.TestDashboard.destroy()
 *   window.CozyOS.TestDashboard.getVersion()
 *
 * DESIGN CONSTRAINTS:
 *   - Strict CSP compliance: no inline event handlers, no eval
 *   - textContent only for dynamic data (never innerHTML for data)
 *   - All listeners registered via addEventListener and released on destroy()
 *   - Keyboard accessible with ARIA labels throughout
 *   - Responsive layout via CSS classes (no inline style for layout)
 *   - Hot-reload safe: destroy() fully resets internal state for re-init
 *   - ES2022
 *
 * CERTIFIED HISTORY REPORT FIELDS USED:
 *   entry.suite          — suite identifier
 *   entry.generatedAt    — report generation timestamp
 *   entry.summary.duration — run duration in ms
 */

"use strict";

(function () {
    if (!window.CozyOS) window.CozyOS = {};

    // ── Module constants ────────────────────────────────────────────────────

    const VERSION           = "1.0.1-PRODUCTION";
    const MODULE_ID         = "cozy-test-dashboard";
    const STATUS_READY      = "Ready";
    const STATUS_REFRESHING = "Refreshing...";

    /**
     * Required module keys and their display labels, used by the Health
     * Panel. Reading only from window.CozyOS.* — no private state access.
     */
    const REQUIRED_MODULES = Object.freeze([
        { key: "TestRegistry", label: "Registry"     },
        { key: "TestRunner",   label: "Runner"       },
        { key: "TestReporter", label: "Reporter"     },
        { key: "TestHistory",  label: "History"      },
        { key: "TestSuite",    label: "Suite Loader" },
        { key: "TestCLI",      label: "CLI"          },
        { key: "TestUI",       label: "UI"           },
    ]);

    // ── Internal state (per-instance, fully reset on destroy) ───────────────

    let _container   = null;   // Host DOM element provided by init()
    let _rootEl      = null;   // Dashboard root element owned by this module
    let _statusBarEl = null;   // Status bar text node host
    let _initialized = false;

    // All registered event listeners are tracked here so destroy() can
    // remove every one without relying on replacing DOM nodes.
    const _listeners = [];

    // ── Private helpers ─────────────────────────────────────────────────────

    /**
     * Registers an event listener and records it for cleanup on destroy().
     */
    function _on(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        _listeners.push({ target, type, handler, options });
    }

    /**
     * Creates an element, assigns a CSS class, and optionally sets an ARIA
     * attribute — never sets innerHTML or event handlers inline.
     */
    function _el(tag, className, ariaRole, ariaLabel) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (ariaRole)  node.setAttribute("role", ariaRole);
        if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
        return node;
    }

    /**
     * Creates a button that is keyboard-accessible (type="button" prevents
     * accidental form submission; no inline handler).
     */
    function _btn(label, cssClass, ariaLabel) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cssClass;
        btn.setAttribute("aria-label", ariaLabel || label);
        btn.textContent = label;
        return btn;
    }

    /**
     * Safe read of a public API method. Returns undefined without throwing
     * if the module or method is absent — the dashboard degrades gracefully.
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
     * Sets the status bar text. Presentation state only.
     */
    function _setStatus(text) {
        if (_statusBarEl) _statusBarEl.textContent = text;
    }

    // ── DOM build helpers ───────────────────────────────────────────────────
    // Each _build* function creates a section's DOM skeleton. Dynamic data
    // is written by the corresponding _render* function via textContent.

    function _buildSummaryCards() {
        const section = _el("section", "tsd-summary", "region", "Summary");
        const cards = [
            { id: "tsd-card-suites",   label: "Registered Suites" },
            { id: "tsd-card-history",  label: "History Entries"   },
            { id: "tsd-card-status",   label: "Last Run Status"   },
            { id: "tsd-card-duration", label: "Last Run Duration"  },
        ];
        for (const card of cards) {
            const wrap  = _el("div", "tsd-card", null, card.label);
            const title = _el("span", "tsd-card__title");
            title.textContent = card.label;
            const value = _el("span", "tsd-card__value");
            value.id = card.id;
            value.textContent = "—";
            wrap.appendChild(title);
            wrap.appendChild(value);
            section.appendChild(wrap);
        }
        return section;
    }

    function _buildLeftPanel() {
        const panel = _el("section", "tsd-panel tsd-panel--left", "region", "Registered Suites");
        const heading = _el("h2", "tsd-panel__heading");
        heading.textContent = "Registered Suites";
        const table = document.createElement("table");
        table.className = "tsd-suites-table";
        table.setAttribute("aria-label", "Registered test suites");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        for (const col of ["ID", "Name", "Version", "Tests"]) {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = col;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        const tbody = document.createElement("tbody");
        tbody.id = "tsd-suites-tbody";
        table.appendChild(thead);
        table.appendChild(tbody);
        panel.appendChild(heading);
        panel.appendChild(table);
        return panel;
    }

    function _buildActivityPanel() {
        const panel = _el("section", "tsd-panel tsd-panel--activity", "region", "Recent Activity");
        const heading = _el("h2", "tsd-panel__heading");
        heading.textContent = "Recent Activity";
        const list = _el("ul", "tsd-activity-list");
        list.id = "tsd-activity-list";
        list.setAttribute("aria-label", "Recent test run history");
        panel.appendChild(heading);
        panel.appendChild(list);
        return panel;
    }

    function _buildVersionsPanel() {
        const panel = _el("section", "tsd-panel tsd-panel--versions", "region", "Module Versions");
        const heading = _el("h2", "tsd-panel__heading");
        heading.textContent = "Module Versions";
        const list = _el("ul", "tsd-versions-list");
        list.id = "tsd-versions-list";
        list.setAttribute("aria-label", "CozyOS Test Studio module versions");
        panel.appendChild(heading);
        panel.appendChild(list);
        return panel;
    }

    function _buildHealthPanel() {
        const panel = _el("section", "tsd-panel tsd-panel--health", "region", "Module Health");
        const heading = _el("h2", "tsd-panel__heading");
        heading.textContent = "Module Health";
        const list = _el("ul", "tsd-health-list");
        list.id = "tsd-health-list";
        list.setAttribute("aria-label", "Required module availability");
        panel.appendChild(heading);
        panel.appendChild(list);
        return panel;
    }

    function _buildToolbar() {
        const bar = _el("div", "tsd-toolbar", "toolbar", "Test Dashboard controls");
        const title = _el("span", "tsd-toolbar__title");
        title.textContent = "CozyOS Test Studio";
        const refreshBtn = _btn("↻ Refresh", "tsd-btn tsd-btn--refresh", "Refresh dashboard");
        refreshBtn.id = "tsd-btn-refresh";
        bar.appendChild(title);
        bar.appendChild(refreshBtn);
        return bar;
    }

    function _buildStatusBar() {
        const bar = _el("div", "tsd-statusbar", "status", "Dashboard status");
        bar.setAttribute("aria-live", "polite");
        bar.setAttribute("aria-atomic", "true");
        const label = _el("span", "tsd-statusbar__label");
        label.textContent = "Status: ";
        const value = _el("span", "tsd-statusbar__value");
        value.id = "tsd-statusbar-value";
        value.textContent = STATUS_READY;
        bar.appendChild(label);
        bar.appendChild(value);
        _statusBarEl = value;
        return bar;
    }

    // ── Render helpers (write textContent from public API data) ─────────────

    function _renderSummaryCards() {
        const suiteCount   = _safeCall("TestRegistry", "count") ?? "—";
        const historyCount = _safeCall("TestHistory",  "count") ?? "—";
        const last         = _safeCall("TestHistory",  "last");

        // Certified TestHistory report fields:
        //   last.summary.status   — overall run outcome
        //   last.summary.duration — run duration in ms
        const lastStatus   = last?.summary?.status   ?? "—";
        const lastDuration = last?.summary?.duration != null
            ? `${last.summary.duration}ms`
            : "—";

        const set = (id, val) => {
            const el = _rootEl.querySelector(`#${id}`);
            if (el) el.textContent = String(val);
        };
        set("tsd-card-suites",   suiteCount);
        set("tsd-card-history",  historyCount);
        set("tsd-card-status",   lastStatus);
        set("tsd-card-duration", lastDuration);
    }

    function _renderSuitesTable() {
        const tbody = _rootEl.querySelector("#tsd-suites-tbody");
        if (!tbody) return;

        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        const suites = _safeCall("TestRegistry", "getAll") ?? [];
        if (!Array.isArray(suites) || suites.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 4;
            td.className = "tsd-empty";
            td.textContent = "No suites registered.";
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        for (const suite of suites) {
            const tr = document.createElement("tr");
            // suite.tests.length is the certified test count field
            const testCount = Array.isArray(suite?.tests)
                ? suite.tests.length
                : "—";
            const values = [
                suite?.id      ?? "—",
                suite?.name    ?? "—",
                suite?.version ?? "—",
                testCount,
            ];
            for (const val of values) {
                const td = document.createElement("td");
                td.textContent = String(val);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
    }

    function _renderActivity() {
        const list = _rootEl.querySelector("#tsd-activity-list");
        if (!list) return;

        while (list.firstChild) list.removeChild(list.firstChild);

        const entries = _safeCall("TestHistory", "getAll") ?? [];
        if (!Array.isArray(entries) || entries.length === 0) {
            const li = document.createElement("li");
            li.className = "tsd-empty";
            li.textContent = "No history entries.";
            list.appendChild(li);
            return;
        }

        // Display newest first — presentation order only, no sorting logic
        const ordered = [...entries].reverse();
        for (const entry of ordered) {
            const li = document.createElement("li");
            li.className = "tsd-activity-item";

            const label = _el("span", "tsd-activity-item__label");
            // Certified field: entry.suite — suite identifier
            label.textContent = entry?.suite ?? "—";

            const meta = _el("span", "tsd-activity-item__meta");
            // Certified fields:
            //   entry.summary.duration — run duration in ms
            //   entry.generatedAt      — report generation timestamp
            const duration = entry?.summary?.duration != null
                ? ` · ${entry.summary.duration}ms`
                : "";
            const ts = entry?.generatedAt
                ? ` · ${new Date(entry.generatedAt).toLocaleTimeString()}`
                : "";
            meta.textContent = `${duration}${ts}`.trimStart().replace(/^·\s*/, "") || "—";

            li.appendChild(label);
            li.appendChild(meta);
            list.appendChild(li);
        }
    }

    function _renderVersions() {
        const list = _rootEl.querySelector("#tsd-versions-list");
        if (!list) return;

        while (list.firstChild) list.removeChild(list.firstChild);

        for (const mod of REQUIRED_MODULES) {
            const ver = _safeCall(mod.key, "getVersion") ?? "—";
            const li  = document.createElement("li");
            li.className = "tsd-versions-item";
            const name = _el("span", "tsd-versions-item__name");
            name.textContent = mod.label;
            const value = _el("span", "tsd-versions-item__value");
            value.textContent = String(ver);
            li.appendChild(name);
            li.appendChild(value);
            list.appendChild(li);
        }

        // Dashboard own version
        const li = document.createElement("li");
        li.className = "tsd-versions-item";
        const name = _el("span", "tsd-versions-item__name");
        name.textContent = "Dashboard";
        const value = _el("span", "tsd-versions-item__value");
        value.textContent = VERSION;
        li.appendChild(name);
        li.appendChild(value);
        list.appendChild(li);
    }

    function _renderHealth() {
        const list = _rootEl.querySelector("#tsd-health-list");
        if (!list) return;

        while (list.firstChild) list.removeChild(list.firstChild);

        for (const mod of REQUIRED_MODULES) {
            const present = !!window.CozyOS?.[mod.key];
            const li = document.createElement("li");
            li.className = `tsd-health-item${present ? " tsd-health-item--ok" : " tsd-health-item--missing"}`;
            li.setAttribute("aria-label", `${mod.label}: ${present ? "available" : "unavailable"}`);
            const indicator = _el("span", "tsd-health-item__indicator");
            indicator.setAttribute("aria-hidden", "true");
            indicator.textContent = present ? "✓" : "✗";
            const labelEl = _el("span", "tsd-health-item__label");
            labelEl.textContent = mod.label;
            li.appendChild(indicator);
            li.appendChild(labelEl);
            list.appendChild(li);
        }
    }

    // ── Root DOM assembly ───────────────────────────────────────────────────

    function _buildRoot() {
        const root = _el("div", "tsd-root", "main", "CozyOS Test Studio Dashboard");
        root.id = MODULE_ID;

        const toolbar  = _buildToolbar();
        const summary  = _buildSummaryCards();

        const bodyWrap = _el("div", "tsd-body");
        const leftPanel = _buildLeftPanel();
        const rightWrap = _el("div", "tsd-right");
        const activity  = _buildActivityPanel();
        const versions  = _buildVersionsPanel();
        const health    = _buildHealthPanel();

        rightWrap.appendChild(activity);
        rightWrap.appendChild(versions);
        rightWrap.appendChild(health);

        bodyWrap.appendChild(leftPanel);
        bodyWrap.appendChild(rightWrap);

        const statusBar = _buildStatusBar();

        root.appendChild(toolbar);
        root.appendChild(summary);
        root.appendChild(bodyWrap);
        root.appendChild(statusBar);

        return root;
    }

    // ── Internal render orchestration ───────────────────────────────────────

    function _renderAll() {
        _renderSummaryCards();
        _renderSuitesTable();
        _renderActivity();
        _renderVersions();
        _renderHealth();
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Initialises the dashboard inside the provided container element.
     * Idempotent while initialized. After destroy() the dashboard can be
     * re-initialized by calling init() again (hot-reload safe).
     *
     * @param {HTMLElement} container - Host element to render into.
     */
    function init(container) {
        if (_initialized) return;
        if (!(container instanceof HTMLElement)) return;

        _container = container;
        _rootEl    = _buildRoot();
        _container.appendChild(_rootEl);

        // Wire the Refresh button via addEventListener — no inline handlers
        const refreshBtn = _rootEl.querySelector("#tsd-btn-refresh");
        if (refreshBtn) {
            _on(refreshBtn, "click", () => TestDashboard.refresh());
            _on(refreshBtn, "keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    TestDashboard.refresh();
                }
            });
        }

        _initialized = true;
        _setStatus(STATUS_READY);
        _renderAll();
    }

    /**
     * Reads current state from all frozen public APIs and updates every
     * panel. Safe to call at any time after init(). No-op if not initialized.
     */
    function refresh() {
        if (!_initialized) return;
        _setStatus(STATUS_REFRESHING);
        _renderAll();
        _setStatus(STATUS_READY);
    }

    /**
     * Fully tears down the dashboard: removes every event listener and
     * removes the root DOM node from the container. Resets all internal
     * state so init() can be called again (true hot-reload support).
     * Safe to call multiple times.
     */
    function destroy() {
        // Release every registered listener in reverse registration order
        for (let i = _listeners.length - 1; i >= 0; i--) {
            const { target, type, handler, options } = _listeners[i];
            target.removeEventListener(type, handler, options);
        }
        _listeners.length = 0;

        if (_rootEl && _rootEl.parentNode) {
            _rootEl.parentNode.removeChild(_rootEl);
        }

        // Full state reset — init() is callable again after this point
        _rootEl      = null;
        _statusBarEl = null;
        _container   = null;
        _initialized = false;
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

    const TestDashboard = Object.freeze({ init, refresh, destroy, getVersion });
    window.CozyOS.TestDashboard = TestDashboard;

})();
