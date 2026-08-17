/**
 * CozyOS — User Dashboard
 * File Reference: core/shell/user-dashboard.js
 * Milestone: 365.0
 *
 * CLASSIFICATION: COMPOSED (per M364.9 Phase 1/Phase 2 approval). This
 * is not a second platform, not a duplicate application registry, not a
 * duplicate permission system. Every data source below is real and
 * pre-existing; this file is only the thin rendering/composition layer
 * connecting them for the first time to a non-admin, authenticated
 * audience.
 *
 * COMPOSED SOURCES (none new, all confirmed real before this file
 * was written):
 *   - window.CozyOS.IdentityEngine.getDashboardConfig(userId) — real,
 *     three-tier dashboardType resolution (admin/developer/user).
 *   - window.CozyOS.ApplicationVisibility.listVisibleApplications(userId)
 *     — real, previously unwired to any UI; the exact composition seam
 *     identified in M364.9 Phase 1.
 *   - window.CozyOS.ApplicationVisibility.getRealLaunchPath(appId) —
 *     real (consolidated this milestone from what was previously an
 *     inline duplicate inside cozy-workspace.js's M364.8 Open handler).
 *   - window.CozyOS.WorkspaceShell.search()/getNotificationFeed() — the
 *     same real singleton instance the Administrator Workspace uses;
 *     never a second search index or notification store.
 *   - window.CozyOS.LivingMessageEngine.getEligibleMessages() — real,
 *     platform-wide announcement messages (the same engine the Admin
 *     Message Publisher writes to).
 *   - window.CozyOS.LivingAssistant — mounted exactly as it already
 *     mounts on dashboard.html (core/living/cozy-living-assistant.js,
 *     unmodified) — never a second assistant.
 *   - Living Background/Theme/Audio/Voice — already active on this page
 *     via the existing launch sequence and engine scripts; this file
 *     does not touch, reinitialize, or duplicate any of them.
 *
 * HONEST SCOPE NOTE — "Tasks"
 *   No real task-management engine exists anywhere in this repository
 *   (confirmed via repository trace before writing this file). Rather
 *   than fabricate sample task data, this section renders an honest
 *   "not connected" state, matching the same disclosed pattern already
 *   used throughout cozy-workspace.js's own "awaiting coordinators"
 *   sections.
 *
 * MOUNTING
 *   Called once from index.html, replacing the prior honest placeholder
 *   for authenticated visitors. Renders into a container element passed
 *   by the caller — does not touch the Living Background canvas or any
 *   other sibling element.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["user-dashboard"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    class UserDashboard {
        #container = null;
        #userId = null;
        #pinnedApps = [];

        /**
         * render(container, userId)
         *   Real, composed render. Every data section below honestly
         *   reports its own real state (empty/unavailable/error) rather
         *   than ever fabricating placeholder content.
         */
        async render(container, userId) {
            this.#container = container;
            this.#userId = userId;
            try { this.#pinnedApps = JSON.parse(window.localStorage.getItem("cozy.userdashboard.pinnedApps") || "[]"); } catch (_err) { this.#pinnedApps = []; }

            const identity = window.CozyOS.IdentityEngine;
            const visibility = window.CozyOS.ApplicationVisibility;

            let dashboardConfig = { available: false, reason: "IdentityEngine is not loaded." };
            if (identity && typeof identity.getDashboardConfig === "function") {
                try { dashboardConfig = identity.getDashboardConfig(userId); } catch (err) { dashboardConfig = { available: false, reason: err.message }; }
            }

            let visibleApps = { available: false, applications: [] };
            if (visibility && typeof visibility.listVisibleApplications === "function") {
                visibleApps = visibility.listVisibleApplications(userId);
            }

            container.innerHTML = `
                <div id="cozy-user-dashboard" class="cozy-living-panel cozy-living-glass">
                    <div id="cozy-ud-topbar">
                        <div id="cozy-ud-profile">${escapeHtml(userId)}</div>
                        <input type="text" id="cozy-ud-search" class="cozy-living-input" placeholder="Search CozyOS...">
                        <button type="button" id="cozy-ud-notifications-btn" title="Notifications">🔔</button>
                        <button type="button" id="cozy-ud-signout" title="Sign out">Sign Out</button>
                    </div>
                    <div id="cozy-ud-body">
                        <section id="cozy-ud-apps">
                            <h3>Applications</h3>
                            <div id="cozy-ud-app-grid"></div>
                        </section>
                        <section id="cozy-ud-quick-actions">
                            <h3>Quick Actions</h3>
                            <div id="cozy-ud-quick-actions-grid"></div>
                        </section>
                        <section id="cozy-ud-recent">
                            <h3>Recent Activity</h3>
                            <div id="cozy-ud-recent-list"></div>
                        </section>
                        <section id="cozy-ud-tasks">
                            <h3>Tasks</h3>
                            <p class="cozy-disclosure-note">No task-management coordinator exists yet in CozyOS. Nothing to show until one is built with a documented API.</p>
                        </section>
                        <section id="cozy-ud-messages">
                            <h3>Messages</h3>
                            <div id="cozy-ud-messages-list"></div>
                        </section>
                    </div>
                    <div id="cozy-ud-search-results"></div>
                </div>
            `;

            this.#renderApps(visibleApps, dashboardConfig);
            this.#renderQuickActions(visibleApps);
            this.#renderRecentActivity();
            this.#renderMessages();
            this.#wireTopBar();
        }

        #renderApps(visibleApps, dashboardConfig) {
            const grid = this.#container.querySelector("#cozy-ud-app-grid");
            if (!grid) return;
            if (!visibleApps.available) {
                grid.innerHTML = `<p class="cozy-disclosure-note">${escapeHtml(visibleApps.reason || "No applications available.")}</p>`;
                return;
            }
            const businessApps = visibleApps.applications.filter(a => a.kind === "application");
            if (!businessApps.length) {
                grid.innerHTML = `<p class="cozy-disclosure-note">No applications have been assigned to this account yet.</p>`;
                return;
            }
            const visibility = window.CozyOS.ApplicationVisibility;
            grid.innerHTML = businessApps.map(app => {
                const path = visibility && typeof visibility.getRealLaunchPath === "function" ? visibility.getRealLaunchPath(app.appId) : null;
                return `
                    <div class="cozy-living-card cozy-ud-app-tile" data-app-tile="${escapeHtml(app.appId)}">
                        <span class="cozy-ud-app-name">${escapeHtml(app.name)}</span>
                        <button type="button" class="cozy-btn" data-ud-open="${escapeHtml(app.appId)}" ${path ? "" : `disabled title="Not launchable yet."`}>Open</button>
                        <button type="button" class="cozy-btn" data-ud-pin="${escapeHtml(app.appId)}">${this.#pinnedApps.includes(app.appId) ? "Unpin" : "Pin"}</button>
                    </div>`;
            }).join("");
            grid.querySelectorAll("[data-ud-open]").forEach(btn => btn.addEventListener("click", () => {
                const path = visibility.getRealLaunchPath(btn.getAttribute("data-ud-open"));
                if (path) window.location.href = path;
            }));
            grid.querySelectorAll("[data-ud-pin]").forEach(btn => btn.addEventListener("click", () => {
                const appId = btn.getAttribute("data-ud-pin");
                this.#pinnedApps = this.#pinnedApps.includes(appId) ? this.#pinnedApps.filter(a => a !== appId) : [...this.#pinnedApps, appId];
                try { window.localStorage.setItem("cozy.userdashboard.pinnedApps", JSON.stringify(this.#pinnedApps)); } catch (_err) { /* ignore */ }
                this.#renderApps(visibleApps, dashboardConfig);
                this.#renderQuickActions(visibleApps);
            }));
        }

        /** #renderQuickActions() — direct-launch tiles for pinned apps. Distinct purpose from the Living Assistant's own quick actions (conversational shortcuts); this is a plain app launcher, not a duplicate. */
        #renderQuickActions(visibleApps) {
            const host = this.#container.querySelector("#cozy-ud-quick-actions-grid");
            if (!host) return;
            const visibility = window.CozyOS.ApplicationVisibility;
            const pinned = (visibleApps.applications || []).filter(a => this.#pinnedApps.includes(a.appId));
            if (!pinned.length) { host.innerHTML = `<p class="cozy-disclosure-note">Pin an application above to add a quick action here.</p>`; return; }
            host.innerHTML = pinned.map(app => `<button type="button" class="cozy-living-btn cozy-btn-breathing" data-ud-quick-open="${escapeHtml(app.appId)}">${escapeHtml(app.name)}</button>`).join("");
            host.querySelectorAll("[data-ud-quick-open]").forEach(btn => btn.addEventListener("click", () => {
                const path = visibility.getRealLaunchPath(btn.getAttribute("data-ud-quick-open"));
                if (path) window.location.href = path;
            }));
        }

        /** #renderRecentActivity() — composes the same real WorkspaceShell.getNotificationFeed() the Admin Workspace and Living Assistant already use. Never a second feed. */
        #renderRecentActivity() {
            const list = this.#container.querySelector("#cozy-ud-recent-list");
            if (!list) return;
            const shell = window.CozyOS.WorkspaceShell;
            if (!shell || typeof shell.getNotificationFeed !== "function") { list.innerHTML = `<p class="cozy-disclosure-note">Recent activity is not available right now.</p>`; return; }
            const feed = shell.getNotificationFeed(8);
            list.innerHTML = feed.length
                ? feed.map(e => `<div class="cozy-living-card cozy-event-row">${escapeHtml(e.eventName)} — ${escapeHtml(e.source)}</div>`).join("")
                : `<p class="cozy-disclosure-note">No recent activity yet.</p>`;
        }

        /** #renderMessages() — composes the real, existing LivingMessageEngine (the same engine the Admin Message Publisher writes to). Never a second messaging system. */
        #renderMessages() {
            const list = this.#container.querySelector("#cozy-ud-messages-list");
            if (!list) return;
            const messages = window.CozyOS.LivingMessageEngine;
            if (!messages || typeof messages.getEligibleMessages !== "function") { list.innerHTML = `<p class="cozy-disclosure-note">Messages are not available right now.</p>`; return; }
            const eligible = messages.getEligibleMessages();
            list.innerHTML = eligible.length
                ? eligible.map(m => `<div class="cozy-living-card cozy-event-row">${escapeHtml(m.title || m.category)}: ${escapeHtml(m.text)}</div>`).join("")
                : `<p class="cozy-disclosure-note">No active messages right now.</p>`;
        }

        #wireTopBar() {
            const shell = window.CozyOS.WorkspaceShell;
            const searchInput = this.#container.querySelector("#cozy-ud-search");
            const resultsEl = this.#container.querySelector("#cozy-ud-search-results");
            if (searchInput) {
                searchInput.addEventListener("keydown", (evt) => {
                    if (evt.key !== "Enter") return;
                    const term = searchInput.value.trim();
                    if (!term || !shell || typeof shell.search !== "function") return;
                    const { results } = shell.search(term);
                    resultsEl.innerHTML = results.length
                        ? results.slice(0, 8).map(r => `<div class="cozy-living-card cozy-event-row">${escapeHtml(r.label)}</div>`).join("")
                        : `<p class="cozy-disclosure-note">No results for "${escapeHtml(term)}".</p>`;
                });
            }
            const notifBtn = this.#container.querySelector("#cozy-ud-notifications-btn");
            if (notifBtn) notifBtn.addEventListener("click", () => this.#renderRecentActivity());
            const signOutBtn = this.#container.querySelector("#cozy-ud-signout");
            if (signOutBtn) {
                signOutBtn.addEventListener("click", () => {
                    const auth = window.CozyOS.AuthCoordinator;
                    try { if (auth && typeof auth.logout === "function") auth.logout(); } finally { window.location.href = "login.html"; }
                });
            }
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, userId: this.#userId, pinnedApps: [...this.#pinnedApps] }; }
    }

    const instance = new UserDashboard();
    window.CozyOS.UserDashboard = instance;
    window.CozyOS.Modules["user-dashboard"] = Object.freeze({
        version: VERSION,
        description: "User Dashboard — a COMPOSED layer over IdentityEngine, ApplicationVisibility, WorkspaceShell, LivingMessageEngine, and the Living Assistant. No new engines, no duplicate application registry, no duplicate permission system."
    });
})();
