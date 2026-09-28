/**
 * CozyOS — WholesaleOS Live Window Mode
 * File Reference: core/plugins/wholesale-live-window-mode.js
 *
 * PURPOSE
 *   Registers "wholesale" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established. Turns
 *   WholesaleOS from an application with ZERO Live Window presence into
 *   a real, switchable context.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.WholesaleOS.getSharedCatalog()/getDiagnosticsReport()
 *     (core/plugins/wholesaleOS-core.js) — the real, single Phase 1
 *     WholesaleOS engine. getSharedCatalog() itself delegates entirely
 *     to window.CozyOS.ShopProduct.listProducts() (confirmed by reading
 *     that file's own header before writing this one: "not a second
 *     catalog — it is the same real catalog, viewed with wholesale
 *     pricing surfaced") and already honestly returns
 *     { available:false, reason } when ShopProduct isn't loaded — this
 *     file passes that disclosure straight through.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   A direct read of core/modules/WholesaleOS/ before writing this file
 *   found a second, richer set of real order-lifecycle engines
 *   (WholesaleCommerce, WholesaleFulfillment, WholesaleReturns,
 *   WholesaleOrderUnderstanding, WholesaleOrderDecision) — but none of
 *   them is loaded by any real HTML page in this repository today (a
 *   real, pre-existing gap, not introduced here). This mode composes
 *   only wholesaleOS-core.js, the one engine actually wired into
 *   dashboard.html/admin-workspace.html, and does not construct a path
 *   to the unwired engines — doing so would be new wiring/business
 *   decisions beyond this pass's scope, not a real, already-composed
 *   capability. See this file's own registration below for the honest
 *   "Phase 1 only" note carried over from wholesaleOS-core.js itself.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["wholesale-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderSharedCatalog(container, engine) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-wholesale-catalog";
        if (!engine || typeof engine.getSharedCatalog !== "function") {
            wrap.innerHTML = `<h4>Shared Catalog (Wholesale Pricing)</h4><p class="cozy-disclosure-note">WholesaleOS is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `<h4>Shared Catalog (Wholesale Pricing)</h4><div id="cozy-live-window-wholesale-catalog-list" class="cozy-disclosure-note">Loading real catalog…</div>`;
        container.appendChild(wrap);
        const listEl = wrap.querySelector("#cozy-live-window-wholesale-catalog-list");
        try {
            const result = engine.getSharedCatalog();
            if (!result.available) { listEl.textContent = result.reason || "The real shared catalog is not available right now."; return; }
            listEl.innerHTML = (result.products && result.products.length)
                ? result.products.slice(0, 5).map((p) => `<div>${escapeHtml(p.name)} — wholesale: ${p.wholesalePrice != null ? escapeHtml(String(p.wholesalePrice)) : "not set"}</div>`).join("")
                : "No real products in the shared catalog yet.";
        } catch (err) {
            listEl.textContent = "The real shared catalog is not available right now.";
            console.warn("[WholesaleLiveWindowMode] getSharedCatalog() failed:", err && err.message);
        }
    }

    function renderDiagnostics(container, engine) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-wholesale-diagnostics";
        if (!engine || typeof engine.getDiagnosticsReport !== "function") {
            wrap.innerHTML = `<p class="cozy-disclosure-note">Real WholesaleOS diagnostics are not available on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        try {
            const diag = engine.getDiagnosticsReport();
            wrap.innerHTML = `<p class="cozy-disclosure-note">WholesaleOS v${escapeHtml(diag.moduleVersion)} — Phase 1 (Shared Catalog only). Wholesaler directory, chat/community, offline receipts, debt reminders, customer management, and planning are named and not yet built.</p>`;
        } catch (err) {
            wrap.innerHTML = `<p class="cozy-disclosure-note">Real WholesaleOS diagnostics are not available right now.</p>`;
            console.warn("[WholesaleLiveWindowMode] getDiagnosticsReport() failed:", err && err.message);
        }
        container.appendChild(wrap);
    }

    function activateWholesale(container) {
        const engine = window.CozyOS.WholesaleOS;
        const header = document.createElement("div");
        header.className = "cozy-live-window-wholesale-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: WholesaleOS</strong></p>`;
        container.appendChild(header);

        renderSharedCatalog(container, engine);
        renderDiagnostics(container, engine);

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateWholesale(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("wholesale", { label: "WholesaleOS", activate: activateWholesale, deactivate: deactivateWholesale });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["wholesale-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers WholesaleOS's 'wholesale' mode with the universal window.CozyOS.LiveWindow — real Shared Catalog with wholesale pricing (window.CozyOS.WholesaleOS, itself delegating to ShopProduct), honestly disclosed as Phase 1 only. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
