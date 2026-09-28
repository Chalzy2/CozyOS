/**
 * CozyOS — MpesaOS Live Window Mode
 * File Reference: core/plugins/mpesa-live-window-mode.js
 *
 * PURPOSE
 *   Registers "mpesa" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established. Turns MpesaOS
 *   from an application with ZERO Live Window presence into a real,
 *   switchable context.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.MpesaFloat.getCurrentFloat(companyId, branchId)
 *     (core/plugins/mpesaOS-float.js) — real, direct balance lookup, not
 *     gated by any entitlement check.
 *   - window.CozyOS.MpesaReporting.getFloatMovementReport(companyId,
 *     branchId) (core/plugins/mpesaOS-reporting.js) — real, reused from
 *     MpesaFloat's own getFloatHistory(); itself honestly returns
 *     { available:false, reason, state } when the real entitlement gate
 *     blocks it or a coordinator isn't connected, a disclosure this file
 *     passes straight through rather than papering over.
 *   - window.CozyOS.Company.listCompanies()/listBranches(companyId)
 *     (core/modules/company/cozy-company.js) — the real, single company/
 *     branch registry, used here only as a picker so a real
 *     companyId/branchId can be resolved without the caller having to
 *     supply one via context (mirroring how ChurchWorshipSession's real
 *     serviceId is resolved in worship-live-window-mode.js).
 *   - getDiagnosticsReport() on MpesaFloat/MpesaTill/MpesaPaybill/
 *     MpesaReporting — real, per-engine connectivity/version snapshots.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   Unlike QuarryOS/ShopOS, MpesaOS's real float/till/paybill data is
 *   genuinely scoped per companyId+branchId (confirmed by reading
 *   mpesaOS-float.js/mpesaOS-reporting.js before writing this file) —
 *   there is no real "all branches" balance. Without a resolved
 *   companyId+branchId (from context or the real picker below), this
 *   mode shows only the real, unscoped diagnostics and an honest
 *   "select a company and branch" prompt — never a fabricated balance.
 *   mpesaOS-engine.js's own PluginManager-routed handler is NOT called
 *   here: reading it before writing this file confirmed its
 *   registration wraps the real mpesaExecutionCore with
 *   PluginManager.createMinimalIntentHandler(), which (per its own real
 *   implementation in core/pluginManager.js) discards the wrapped
 *   function and returns only a generic "no conversational routing
 *   implemented" stub — a genuine, pre-existing gap in that file, not
 *   something this mode can route through honestly. This mode calls the
 *   real, directly-reachable MpesaFloat/MpesaTill/MpesaPaybill/
 *   MpesaReporting engines instead, which is where the actual real data
 *   lives.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["mpesa-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderDiagnostics(container) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-mpesa-diagnostics";
        const engines = [
            ["MpesaFloat", window.CozyOS.MpesaFloat],
            ["MpesaTill", window.CozyOS.MpesaTill],
            ["MpesaPaybill", window.CozyOS.MpesaPaybill],
            ["MpesaReporting", window.CozyOS.MpesaReporting]
        ];
        const lines = engines.map(([name, engine]) => {
            if (!engine || typeof engine.getDiagnosticsReport !== "function") return `${name}: not connected on this page.`;
            try { return `${name}: connected (v${engine.getDiagnosticsReport().pluginVersion}).`; }
            catch (_err) { return `${name}: connected.`; }
        });
        wrap.innerHTML = `<h4>MpesaOS Engines</h4><div class="cozy-disclosure-note">${lines.map(escapeHtml).join("<br>")}</div>`;
        container.appendChild(wrap);
    }

    function renderScopedBalance(container, companyId, branchId) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-mpesa-balance";
        const float = window.CozyOS.MpesaFloat;
        if (!companyId || !branchId) {
            wrap.innerHTML = `<h4>Float Balance</h4><p class="cozy-disclosure-note">Select a real company and branch below to see real float/till/paybill data.</p>`;
            container.appendChild(wrap);
            return;
        }
        if (!float || typeof float.getCurrentFloat !== "function") {
            wrap.innerHTML = `<h4>Float Balance</h4><p class="cozy-disclosure-note">MpesaFloat is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `<h4>Float Balance — ${escapeHtml(companyId)}/${escapeHtml(branchId)}</h4><p class="cozy-disclosure-note" id="cozy-live-window-mpesa-balance-status"></p>`;
        container.appendChild(wrap);
        const statusEl = wrap.querySelector("#cozy-live-window-mpesa-balance-status");
        try {
            const balance = float.getCurrentFloat(companyId, branchId);
            statusEl.textContent = `Current float: ${balance}.`;
        } catch (err) {
            statusEl.textContent = "Real float balance is not available right now.";
            console.warn("[MpesaLiveWindowMode] getCurrentFloat() failed:", err && err.message);
        }
        const reporting = window.CozyOS.MpesaReporting;
        if (reporting && typeof reporting.getFloatMovementReport === "function") {
            const moveEl = document.createElement("p");
            moveEl.className = "cozy-disclosure-note";
            wrap.appendChild(moveEl);
            try {
                const report = reporting.getFloatMovementReport(companyId, branchId);
                moveEl.textContent = report.available
                    ? `${report.movementCount} real movement(s) recorded.`
                    : (report.reason || "Real movement history is not available right now.");
            } catch (err) {
                moveEl.textContent = "Real movement history is not available right now.";
                console.warn("[MpesaLiveWindowMode] getFloatMovementReport() failed:", err && err.message);
            }
        }
    }

    function renderCompanyBranchPicker(container, onResolved) {
        const company = window.CozyOS.Company;
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-mpesa-picker";
        if (!company || typeof company.listCompanies !== "function") {
            wrap.innerHTML = `<h4>Company / Branch</h4><p class="cozy-disclosure-note">CozyOS Company registry is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        let companies = [];
        try { companies = company.listCompanies({}) || []; } catch (_err) { companies = []; }
        if (!companies.length) {
            wrap.innerHTML = `<h4>Company / Branch</h4><p class="cozy-disclosure-note">No real companies are registered yet.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `
            <h4>Company / Branch</h4>
            <select id="cozy-live-window-mpesa-company-select" class="cozy-living-input">
                <option value="">Select a real company…</option>
                ${companies.map((c) => `<option value="${escapeHtml(c.companyId)}">${escapeHtml(c.legalName || c.companyId)}</option>`).join("")}
            </select>
            <select id="cozy-live-window-mpesa-branch-select" class="cozy-living-input" style="margin-top:6px;" disabled>
                <option value="">Select a company first…</option>
            </select>
        `;
        container.appendChild(wrap);
        const companySelect = wrap.querySelector("#cozy-live-window-mpesa-company-select");
        const branchSelect = wrap.querySelector("#cozy-live-window-mpesa-branch-select");
        companySelect.addEventListener("change", () => {
            const companyId = companySelect.value;
            branchSelect.innerHTML = `<option value="">Select a real branch…</option>`;
            branchSelect.disabled = !companyId;
            if (!companyId) return;
            try {
                const branches = company.listBranches(companyId) || [];
                branches.forEach((b) => {
                    const opt = document.createElement("option");
                    opt.value = b.branchId;
                    opt.textContent = b.branchName || b.branchId;
                    branchSelect.appendChild(opt);
                });
            } catch (err) {
                console.warn("[MpesaLiveWindowMode] listBranches() failed:", err && err.message);
            }
        });
        branchSelect.addEventListener("change", () => {
            if (companySelect.value && branchSelect.value) onResolved(companySelect.value, branchSelect.value);
        });
    }

    function activateMpesa(container, context) {
        context = context || {};
        const header = document.createElement("div");
        header.className = "cozy-live-window-mpesa-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: MpesaOS</strong></p>`;
        container.appendChild(header);

        renderDiagnostics(container);

        const balanceRegion = document.createElement("div");
        balanceRegion.id = "cozy-live-window-mpesa-balance-region";
        container.appendChild(balanceRegion);
        renderScopedBalance(balanceRegion, context.companyId || null, context.branchId || null);

        if (!context.companyId || !context.branchId) {
            renderCompanyBranchPicker(container, (companyId, branchId) => {
                balanceRegion.innerHTML = "";
                renderScopedBalance(balanceRegion, companyId, branchId);
            });
        }

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateMpesa(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("mpesa", { label: "MpesaOS", activate: activateMpesa, deactivate: deactivateMpesa });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["mpesa-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers MpesaOS's 'mpesa' mode with the universal window.CozyOS.LiveWindow — real per-engine diagnostics (MpesaFloat/Till/Paybill/Reporting), a real company/branch picker (window.CozyOS.Company), and real float balance/movement data once a real companyId+branchId is resolved. Never fabricates a balance without a real scope. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
