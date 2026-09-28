/**
 * CozyOS — QuarryOS Live Window Mode
 * File Reference: core/modules/QuarryOS/quarry-live-window-mode.js
 *
 * PURPOSE
 *   Registers "quarry" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js already established. Turns
 *   QuarryOS from an application with ZERO Live Window presence into a
 *   real, switchable context: `LiveWindow.activateMode("quarry")` renders
 *   real QuarryOS content inside the SAME Live Window that also holds
 *   the existing chat/voice/OCR surface — never a second window, never a
 *   second AI.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.Modules.QuarryManager (core/modules/QuarryOS/
 *     quarry-index.js) — the real, single Quarry Enterprise Engine
 *     instance. This file calls only its already-existing, already-
 *     documented public surface:
 *       - getHealth() — real, synchronous storage/finance connectivity
 *         probe.
 *       - getStatistics() — real, storage-backed revenue/expense/profit
 *         figures (async; every execute* route elsewhere in that engine
 *         is the actual system of record, never recomputed here).
 *       - handle({ route: "ask_ai_advisor", payload }) — the real Quarry
 *         AI Advisor route, which itself composes real, storage-backed
 *         helper methods (_aiLeastEfficientMachine, _aiTopDebtorCustomer,
 *         etc. — confirmed by reading quarry-index.js before writing
 *         this file) for a fixed set of recognized questions, and an
 *         honest generic response otherwise. "ask_ai_advisor" is granted
 *         to every real role in that engine's own roleMatrix, including
 *         the default "Machine Operator" role used when no identity is
 *         present, so this works for an unauthenticated Live Window
 *         session exactly as it would for QuarryOS's own page.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   - This mode never calls handle() with a route gated to a role this
 *     session's real identity does not have (e.g. "get_stock_levels",
 *     which the real roleMatrix restricts to "Operations Manager"/
 *     "Administrator"). Rather than silently no-op or fabricate stock
 *     data, this file only surfaces getHealth()/getStatistics() (not
 *     route-gated at all — they are plain methods on the instance, not
 *     handle() routes) and the universally-permitted AI Advisor route.
 *   - If window.CozyOS.Modules.QuarryManager is not loaded on the
 *     current page, every section below renders an honest "QuarryOS
 *     engine is not connected on this page" disclosure instead of
 *     fabricating figures.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["quarry-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function resolveEngine() {
        return (window.CozyOS && window.CozyOS.Modules && window.CozyOS.Modules.QuarryManager) || null;
    }

    function renderHealthAndStatistics(container, engine) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-quarry-health";
        if (!engine) {
            wrap.innerHTML = `<h4>Quarry Enterprise Engine</h4><p class="cozy-disclosure-note">QuarryOS engine is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `<h4>Quarry Enterprise Engine</h4><p class="cozy-disclosure-note" id="cozy-live-window-quarry-health-status">Loading real engine status…</p>`;
        container.appendChild(wrap);
        const statusEl = wrap.querySelector("#cozy-live-window-quarry-health-status");
        try {
            const health = engine.getHealth();
            statusEl.textContent = `Status: ${health.status}${health.offline ? " (offline)" : ""}. Storage connected: ${health.storageConnected ? "yes" : "no"}. Finance connected: ${health.financeConnected ? "yes" : "no"}.`;
        } catch (err) {
            statusEl.textContent = "Real engine status is not available right now.";
            console.warn("[QuarryLiveWindowMode] getHealth() failed:", err && err.message);
        }
        if (typeof engine.getStatistics !== "function") return;
        const statsEl = document.createElement("p");
        statsEl.className = "cozy-disclosure-note";
        statsEl.textContent = "Loading real revenue/expense figures…";
        wrap.appendChild(statsEl);
        Promise.resolve(engine.getStatistics()).then((stats) => {
            statsEl.textContent = `Revenue: ${stats.totalRevenue}. Expenses: ${stats.totalExpenses}. Net profit: ${stats.netProfit}.`;
        }).catch((err) => {
            statsEl.textContent = "Real revenue/expense figures are not available right now.";
            console.warn("[QuarryLiveWindowMode] getStatistics() failed:", err && err.message);
        });
    }

    function renderAiAdvisor(container, engine) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-quarry-advisor";
        if (!engine) {
            wrap.innerHTML = `<h4>Quarry AI Advisor</h4><p class="cozy-disclosure-note">QuarryOS engine is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `
            <h4>Quarry AI Advisor</h4>
            <form id="cozy-live-window-quarry-advisor-form" style="display:flex;gap:6px;">
                <input type="text" id="cozy-live-window-quarry-advisor-input" class="cozy-living-input" placeholder="Ask about production, drivers, stock…" autocomplete="off">
                <button type="submit" class="cozy-btn">Ask</button>
            </form>
            <p class="cozy-disclosure-note" id="cozy-live-window-quarry-advisor-result"></p>
        `;
        container.appendChild(wrap);
        const form = wrap.querySelector("#cozy-live-window-quarry-advisor-form");
        const resultEl = wrap.querySelector("#cozy-live-window-quarry-advisor-result");
        form.addEventListener("submit", (evt) => {
            evt.preventDefault();
            const input = wrap.querySelector("#cozy-live-window-quarry-advisor-input");
            const text = input.value.trim();
            if (!text) return;
            resultEl.textContent = "Asking the real Quarry AI Advisor…";
            Promise.resolve(engine.handle({ route: "ask_ai_advisor", payload: { text } }))
                .then((result) => { resultEl.textContent = (result && result.responseText) || "No response."; })
                .catch((err) => {
                    resultEl.textContent = "Could not reach the Quarry AI Advisor right now.";
                    console.warn("[QuarryLiveWindowMode] ask_ai_advisor failed:", err && err.message);
                });
        });
    }

    function activateQuarry(container) {
        const engine = resolveEngine();
        const header = document.createElement("div");
        header.className = "cozy-live-window-quarry-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: QuarryOS</strong></p>`;
        container.appendChild(header);

        renderHealthAndStatistics(container, engine);
        renderAiAdvisor(container, engine);

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateQuarry(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("quarry", { label: "QuarryOS", activate: activateQuarry, deactivate: deactivateQuarry });
        return true;
    }

    // Bounded retry, matching the same convention already used by
    // worship-live-window-mode.js — live-window-controller.js is
    // expected to load before this file per dashboard.html/
    // admin-workspace.html's real script order, but this file never
    // assumes load order it cannot verify.
    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["quarry-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers QuarryOS's 'quarry' mode with the universal window.CozyOS.LiveWindow — real engine health/statistics and the real Quarry AI Advisor (window.CozyOS.Modules.QuarryManager), an honest 'not connected' disclosure when that engine is not loaded on the page. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
