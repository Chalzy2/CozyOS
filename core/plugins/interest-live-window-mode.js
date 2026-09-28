/**
 * CozyOS — InterestOS Live Window Mode
 * File Reference: core/plugins/interest-live-window-mode.js
 *
 * PURPOSE
 *   Registers "interest" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established. Turns InterestOS
 *   from an application with ZERO Live Window presence into a real,
 *   switchable context.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.InterestOS (core/plugins/interestOS-core.js) — real
 *     Teach-Cozy-style directives, persisted through the real
 *     window.CozyOS.CozyMemory (no second memory/persistence engine):
 *       - interpretDirective(text) — real heuristic draft, never
 *         persisted on its own.
 *       - createDirective({..., confirmed:true}) — the real
 *         confirmation-first persistence call; this file only calls it
 *         after a human has reviewed interpretDirective()'s own draft,
 *         exactly matching that method's own documented contract.
 *       - listDirectives(owner, actorId) — real, already-persisted
 *         directives for the current actor.
 *   - window.CozyOS.InterestOSBusinessWorkspace (core/plugins/
 *     interestOS-business-workspace.js) — real spreadsheet-like business
 *     tables, also persisted via CozyMemory:
 *       - listTables(owner, actorId) — real tables belonging to the
 *         current actor.
 *       - computeSummary(tableId, { period }, actorId) — real,
 *         storage-derived revenue/expense/savings summary for one table
 *         (itself honestly reports { available:false, reason } for a
 *         table with no DATE-role column, rather than guessing a
 *         period).
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   Both composed engines require a real, signed-in actorId (their own
 *   owner-scoped persistence model, confirmed by reading both files
 *   before writing this one — createDirective()/listTables() throw
 *   without one). Without a real actorId (window.CozyOS.Session), this
 *   mode shows an honest "sign in" disclosure instead of a directive/
 *   table list. window.CozyOS.InterestOSBusinessWorkspace is only
 *   loaded on some real pages today (confirmed: dashboard.html, not
 *   admin-workspace.html) — on a page without it, that section alone
 *   renders "not connected on this page"; the directives section is
 *   unaffected since it depends only on window.CozyOS.InterestOS.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["interest-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function currentActorId() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snap = session.current();
            if (snap && snap.uid) return snap.uid;
        }
        return null;
    }

    function renderDirectives(container, actorId) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-interest-directives";
        const interestOS = window.CozyOS.InterestOS;
        if (!interestOS || typeof interestOS.listDirectives !== "function") {
            wrap.innerHTML = `<h4>Directives / Reminders</h4><p class="cozy-disclosure-note">InterestOS is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        if (!actorId) {
            wrap.innerHTML = `<h4>Directives / Reminders</h4><p class="cozy-disclosure-note">Sign in to see your real directives.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `
            <h4>Directives / Reminders</h4>
            <div id="cozy-live-window-interest-directive-list" class="cozy-disclosure-note"></div>
            <form id="cozy-live-window-interest-directive-form" style="display:flex;gap:6px;margin-top:6px;">
                <input type="text" id="cozy-live-window-interest-directive-input" class="cozy-living-input" placeholder="e.g. remind me to pay rent" autocomplete="off">
                <button type="submit" class="cozy-btn">Draft</button>
            </form>
            <div id="cozy-live-window-interest-directive-draft" class="cozy-disclosure-note"></div>
        `;
        container.appendChild(wrap);
        const listEl = wrap.querySelector("#cozy-live-window-interest-directive-list");
        const draftEl = wrap.querySelector("#cozy-live-window-interest-directive-draft");
        const refreshList = () => {
            try {
                const directives = interestOS.listDirectives(actorId, actorId);
                listEl.innerHTML = (directives && directives.length)
                    ? directives.slice(0, 5).map((d) => `<div>${escapeHtml(d.text)} — ${escapeHtml(d.status)}</div>`).join("")
                    : "No real directives yet.";
            } catch (err) {
                listEl.textContent = "Real directives are not available right now.";
                console.warn("[InterestLiveWindowMode] listDirectives() failed:", err && err.message);
            }
        };
        refreshList();
        wrap.querySelector("#cozy-live-window-interest-directive-form").addEventListener("submit", (evt) => {
            evt.preventDefault();
            const input = wrap.querySelector("#cozy-live-window-interest-directive-input");
            const text = input.value.trim();
            if (!text) return;
            let draft;
            try { draft = interestOS.interpretDirective(text); }
            catch (err) { draftEl.textContent = "Could not interpret that right now."; console.warn("[InterestLiveWindowMode] interpretDirective() failed:", err && err.message); return; }
            if (!draft.available) { draftEl.textContent = draft.reason || "Could not interpret that."; return; }
            draftEl.innerHTML = `<em>${escapeHtml(draft.disclosure)}</em> — guessed action: ${escapeHtml(draft.actionGuess)}. <button type="button" class="cozy-btn" id="cozy-live-window-interest-directive-confirm">Confirm &amp; save</button>`;
            draftEl.querySelector("#cozy-live-window-interest-directive-confirm").addEventListener("click", () => {
                try {
                    interestOS.createDirective({ owner: actorId, actorId, text, source: "text", action: draft.actionGuess, reminderAt: draft.reminderAtGuess, confirmed: true });
                    draftEl.textContent = "Saved.";
                    input.value = "";
                    refreshList();
                } catch (err) {
                    draftEl.textContent = "Could not save that directive right now.";
                    console.warn("[InterestLiveWindowMode] createDirective() failed:", err && err.message);
                }
            });
        });
    }

    function renderBusinessWorkspace(container, actorId) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-interest-workspace";
        const workspace = window.CozyOS.InterestOSBusinessWorkspace;
        if (!workspace || typeof workspace.listTables !== "function") {
            wrap.innerHTML = `<h4>Business Workspace</h4><p class="cozy-disclosure-note">InterestOSBusinessWorkspace is not connected on this page.</p>`;
            container.appendChild(wrap);
            return;
        }
        if (!actorId) {
            wrap.innerHTML = `<h4>Business Workspace</h4><p class="cozy-disclosure-note">Sign in to see your real business tables.</p>`;
            container.appendChild(wrap);
            return;
        }
        wrap.innerHTML = `<h4>Business Workspace</h4><div id="cozy-live-window-interest-tables" class="cozy-disclosure-note">Loading real tables…</div>`;
        container.appendChild(wrap);
        const tablesEl = wrap.querySelector("#cozy-live-window-interest-tables");
        try {
            const tables = workspace.listTables(actorId, actorId);
            if (!tables || !tables.length) { tablesEl.textContent = "No real business tables yet."; return; }
            tablesEl.innerHTML = tables.slice(0, 5).map((t) => `<div>${escapeHtml(t.name)} (${t.rows.length} row(s))</div>`).join("");
            const summary = workspace.computeSummary(tables[0].id, { period: "monthly" }, actorId);
            const summaryEl = document.createElement("p");
            summaryEl.className = "cozy-disclosure-note";
            summaryEl.textContent = summary.available
                ? `"${tables[0].name}" this month — revenue: ${summary.revenue}, expenses: ${summary.expenses}.`
                : (summary.reason || "A monthly summary is not available for this table yet.");
            wrap.appendChild(summaryEl);
        } catch (err) {
            tablesEl.textContent = "Real business tables are not available right now.";
            console.warn("[InterestLiveWindowMode] listTables()/computeSummary() failed:", err && err.message);
        }
    }

    function activateInterest(container) {
        const actorId = currentActorId();
        const header = document.createElement("div");
        header.className = "cozy-live-window-interest-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: InterestOS</strong></p>`;
        container.appendChild(header);

        renderDirectives(container, actorId);
        renderBusinessWorkspace(container, actorId);

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateInterest(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("interest", { label: "InterestOS", activate: activateInterest, deactivate: deactivateInterest });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["interest-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers InterestOS's 'interest' mode with the universal window.CozyOS.LiveWindow — real directives/reminders (window.CozyOS.InterestOS, confirmation-first persistence) and real business workspace tables/summaries (window.CozyOS.InterestOSBusinessWorkspace), both honestly disclosed as 'sign in' or 'not connected on this page' when a real actorId or engine is missing. Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
