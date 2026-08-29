/**
 * CozyOS — User Dashboard
 * File Reference: core/shell/user-dashboard.js
 * Milestone: 365.0 → Dashboard Prompt 1 (Real User Dashboard Foundation)
 *
 * CLASSIFICATION: COMPOSED (per M364.9 Phase 1/Phase 2 approval,
 * extended by Dashboard Prompt 1). This is not a second platform, not a
 * duplicate application registry, not a duplicate permission system.
 * Every data source below is real and pre-existing; this file is only
 * the thin rendering/composition layer connecting them.
 *
 * DASHBOARD PROMPT 1 — WHAT CHANGED
 *   The single-surface M365.0 layout is now the "Home" surface inside a
 *   real five-surface shell: Home / Community / AI / Apps / Settings
 *   (Community immediately after Home, per spec — Checkpoint A
 *   confirmed this navigation did not exist anywhere in the repository
 *   before this change; core/shell/cozy-navigation.js is a different,
 *   narrower admin-tile builder, not this navigation). Navigation state
 *   and the AI dashboard-context object are owned by the new, separate,
 *   pure-logic core/shell/dashboard-navigation-core.js — this file does
 *   not reimplement that state machine, it only renders it.
 *
 * COMPOSED SOURCES (none new except where noted, all confirmed real):
 *   - window.CozyOS.IdentityEngine.getDashboardConfig(userId) — real,
 *     three-tier dashboardType resolution (admin/developer/user).
 *   - window.CozyOS.IdentityEngine.getUser(userId) /
 *     get/setLanguagePreference(userId) — real (Settings surface).
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
 *   - window.CozyOS.LivingAssistant.open()/close()/toggle() — real,
 *     mounted exactly as it already mounts on dashboard.html
 *     (core/living/cozy-living-assistant.js, unmodified) — never a
 *     second assistant. This is the AI surface's real entry point.
 *   - window.CozyOS.CozyKnowledgeCommunity.listCommunityRecords() —
 *     real, existing candidate→review→verification pipeline (Dashboard
 *     Prompt 1 adds the load-bearing <script> tags for this and its
 *     ingestion dependency to index.html, additive only — see that
 *     file's own comment). This is the Community surface's real entry
 *     point; not rebuilt here.
 *   - window.CozyOS.DashboardNavigationCore — new (Dashboard Prompt 1),
 *     pure-logic navigation state + language resolver + AI-context
 *     builder. See core/shell/dashboard-navigation-core.js for its own
 *     header, including the disclosed real (English-first, not
 *     Kiswahili-first) language fallback order this file honestly
 *     surfaces rather than hides.
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
 * DASHBOARD PROMPT 2 — WHAT CHANGED
 *   Community surface now groups real records into the honest UI
 *   buckets Prompt 2 §6 asks for (Pending Review/Community
 *   Verified/Needs Correction/Rejected/Learned Knowledge) via the new,
 *   pure-logic core/shell/dashboard-community-summary-core.js, which
 *   itself only composes the real, existing CozyKnowledgeReview.
 *   computeDisplayState() — no new review engine. "My Contributions" is
 *   shown as an honest capability-unavailable note (real privacy limit,
 *   disclosed in that module's own header), never a fabricated filtered
 *   list. The Community "Contribute" action now routes to the real,
 *   fuller "Teach CozyAI" flow (core/modules/intelligence/knowledge/
 *   teach/ui/teach-cozyai-form.html, RP-031 Phase 2A) instead of the
 *   narrower contribution-form.html, matching Prompt 2 §7's vocabulary
 *   and its wider contribution-type set — still linked out to, never
 *   duplicated inline.
 *
 * HONEST SCOPE NOTE — Community/AI surfaces in Prompt 1
 *   Community surface: renders the real pipeline's current records
 *   (candidate/confirmed/community-verified/rejected, exactly as the
 *   engine reports them — never a fabricated "verified" label). It does
 *   NOT embed the full contribution submission form in Prompt 1 (that
 *   UI, core/modules/intelligence/knowledge/ui/cozy-knowledge-
 *   contribution-ui.js, already exists separately) — it links out to it
 *   honestly rather than duplicating it.
 *   AI surface: opens the real, existing Living Assistant and passes it
 *   the real structured AI context. It does not implement a second chat
 *   UI inside the dashboard shell.
 *
 * DASHBOARD PROMPT 2 §8 — AI SURFACE, WHAT CHANGED
 *   #renderAiSurface() now shows a real current-context indicator
 *   (active surface, available vs. launchable application counts — all
 *   from DashboardNavigationCore.buildAIContext()), a set of "Ask about
 *   a surface" buttons, and a response area. Clicking a button calls
 *   the new DashboardNavigationCore.explainSurface(surfaceName, userId)
 *   and displays its real, context-derived text — honest,
 *   template-generated text assembled client-side from real engine
 *   state, not a live model call, and the UI never implies otherwise.
 *   window.CozyOS.LivingAssistant still exposes only open()/close()/
 *   toggle() (confirmed by reading its source before this change) — no
 *   real message-send/conversational-execution method exists anywhere
 *   in this repository, so this file does not fake one. "Open Cozy AI"
 *   (the real, existing assistant panel) remains the one real live
 *   entry point and stays visually distinct from the honest
 *   explanation panel above it. The genuine missing dependency for a
 *   real free-text conversational backend is recorded, not hidden.
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

    /** Icons are decorative only — every tab also carries a real text label (Prompt 1 §31, icons are never the sole indicator). */
    const SURFACE_META = {
        home: { label: "Home", icon: "🏠" },
        community: { label: "Community", icon: "👥" },
        ai: { label: "AI", icon: "✨" },
        apps: { label: "Apps", icon: "▦" },
        settings: { label: "Settings", icon: "⚙" }
    };

    class UserDashboard {
        #container = null;
        #userId = null;
        #pinnedApps = [];
        #visibleApps = { available: false, applications: [] };
        #dashboardConfig = { available: false, reason: null };

        /**
         * render(container, userId)
         *   Real, composed render of the five-surface dashboard shell
         *   (Home/Community/AI/Apps/Settings). Every data section below
         *   honestly reports its own real state (empty/unavailable/
         *   error) rather than ever fabricating placeholder content.
         */
        async render(container, userId) {
            this.#container = container;
            this.#userId = userId;
            try { this.#pinnedApps = JSON.parse(window.localStorage.getItem("cozy.userdashboard.pinnedApps") || "[]"); } catch (_err) { this.#pinnedApps = []; }

            const identity = window.CozyOS.IdentityEngine;
            const visibility = window.CozyOS.ApplicationVisibility;
            const nav = window.CozyOS.DashboardNavigationCore;

            this.#dashboardConfig = { available: false, reason: "IdentityEngine is not loaded." };
            if (identity && typeof identity.getDashboardConfig === "function") {
                try { this.#dashboardConfig = identity.getDashboardConfig(userId); } catch (err) { this.#dashboardConfig = { available: false, reason: err.message }; }
            }

            this.#visibleApps = { available: false, applications: [] };
            if (visibility && typeof visibility.listVisibleApplications === "function") {
                this.#visibleApps = visibility.listVisibleApplications(userId);
            }

            const order = nav && typeof nav.getSurfaceOrder === "function" ? nav.getSurfaceOrder() : ["home", "community", "ai", "apps", "settings"];
            const activeSurface = nav && typeof nav.getActiveSurface === "function" ? nav.getActiveSurface() : "home";

            container.innerHTML = `
                <div id="cozy-user-dashboard" class="cozy-living-panel cozy-living-glass">
                    <div id="cozy-ud-topbar">
                        <div id="cozy-ud-profile">${escapeHtml(userId)}</div>
                        <input type="text" id="cozy-ud-search" class="cozy-living-input" placeholder="Search CozyOS...">
                        <button type="button" id="cozy-ud-notifications-btn" title="Notifications">🔔</button>
                        <button type="button" id="cozy-ud-signout" title="Sign out">Sign Out</button>
                    </div>
                    <div id="cozy-ud-surfaces">
                        <section id="cozy-ud-surface-home" class="cozy-ud-surface" data-surface="home"></section>
                        <section id="cozy-ud-surface-community" class="cozy-ud-surface" data-surface="community"></section>
                        <section id="cozy-ud-surface-ai" class="cozy-ud-surface" data-surface="ai"></section>
                        <section id="cozy-ud-surface-apps" class="cozy-ud-surface" data-surface="apps"></section>
                        <section id="cozy-ud-surface-settings" class="cozy-ud-surface" data-surface="settings"></section>
                    </div>
                    <nav id="cozy-ud-bottomnav" aria-label="CozyOS primary navigation">
                        ${order.map(name => `
                            <button type="button"
                                class="cozy-ud-navtab"
                                data-nav-surface="${escapeHtml(name)}"
                                aria-current="${name === activeSurface ? "page" : "false"}">
                                <span class="cozy-ud-navtab-icon" aria-hidden="true">${SURFACE_META[name] ? SURFACE_META[name].icon : "•"}</span>
                                <span class="cozy-ud-navtab-label">${SURFACE_META[name] ? escapeHtml(SURFACE_META[name].label) : escapeHtml(name)}</span>
                            </button>`).join("")}
                    </nav>
                    <div id="cozy-ud-search-results"></div>
                </div>
            `;

            this.#wireTopBar();
            this.#wireBottomNav();
            if (nav && typeof nav.onChange === "function") {
                nav.onChange(() => this.#applyActiveSurface());
            }
            this.#renderAllSurfaces();
            this.#applyActiveSurface();
        }

        /** #wireBottomNav() — every tab click goes through the one real navigation-state mutator; this file never tracks its own duplicate "current tab" variable. */
        #wireBottomNav() {
            const nav = window.CozyOS.DashboardNavigationCore;
            const buttons = this.#container.querySelectorAll("[data-nav-surface]");
            buttons.forEach(btn => btn.addEventListener("click", () => {
                const target = btn.getAttribute("data-nav-surface");
                if (nav && typeof nav.switchTo === "function") nav.switchTo(target);
            }));
        }

        /** #applyActiveSurface() — shows exactly one surface, updates aria-current on exactly one tab. Reads DashboardNavigationCore as the sole source of truth. */
        #applyActiveSurface() {
            const nav = window.CozyOS.DashboardNavigationCore;
            const active = nav && typeof nav.getActiveSurface === "function" ? nav.getActiveSurface() : "home";
            this.#container.querySelectorAll(".cozy-ud-surface").forEach(el => {
                el.classList.toggle("cozy-ud-surface-active", el.getAttribute("data-surface") === active);
                el.hidden = el.getAttribute("data-surface") !== active;
            });
            this.#container.querySelectorAll("[data-nav-surface]").forEach(btn => {
                btn.setAttribute("aria-current", btn.getAttribute("data-nav-surface") === active ? "page" : "false");
            });
            if (active === "ai") this.#renderAiSurface();
            if (active === "community") this.#renderCommunitySurface();
        }

        #renderAllSurfaces() {
            this.#renderHomeSurface();
            this.#renderCommunitySurface();
            this.#renderAiSurface();
            this.#renderAppsSurface();
            this.#renderSettingsSurface();
        }

        /** #renderHomeSurface() — the real M365.0 layout (apps, quick actions, recent activity, tasks, messages), now scoped to the Home tab instead of the whole page. */
        #renderHomeSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-home");
            if (!host) return;
            host.innerHTML = `
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
            `;
            this.#renderApps(this.#visibleApps, this.#dashboardConfig);
            this.#renderQuickActions(this.#visibleApps);
            this.#renderRecentActivity();
            this.#renderMessages();
        }

        /**
         * #renderCommunitySurface()
         *   Real entry point into the existing knowledge/community
         *   pipeline (Prompt 1 §8-10, Prompt 2 §5-8). Groups the
         *   pipeline's own real records into the honest UI buckets
         *   Prompt 2 §6 asks for (Pending Review/Community
         *   Verified/Needs Correction/Rejected/Learned Knowledge) via
         *   the real, new DashboardCommunitySummaryCore — never a
         *   fabricated "verified" count, and only buckets/labels that
         *   module actually returns. "My Contributions" is shown as an
         *   honest capability-unavailable note (see that module's
         *   header) rather than a fake filtered list. Links out to the
         *   existing, real, fuller "Teach CozyAI" flow
         *   (core/modules/intelligence/knowledge/teach/ui/
         *   teach-cozyai-form.html, RP-031 Phase 2A) rather than
         *   embedding a duplicate submission form in the shell.
         */
        #renderCommunitySurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-community");
            if (!host) return;
            const community = window.CozyOS.CozyKnowledgeCommunity;
            if (!community || typeof community.listCommunityRecords !== "function") {
                host.innerHTML = `
                    <h3>Community</h3>
                    <p class="cozy-disclosure-note">Community knowledge is not connected on this page yet.</p>
                    <button type="button" class="cozy-btn" data-ud-community-teach>Teach Cozy AI</button>`;
                this.#wireTeachButton(host);
                return;
            }
            let records = [];
            try { records = community.listCommunityRecords({}) || []; } catch (_err) { records = []; }

            const summaryCore = window.CozyOS.DashboardCommunitySummaryCore;
            if (!summaryCore || typeof summaryCore.summarizeCommunityRecords !== "function") {
                // Honest degrade: the pipeline is connected but the new
                // bucketing module isn't loaded — show the real records
                // with their real raw state rather than blocking the
                // surface entirely.
                const rows = records.slice(0, 10).map(r => `
                    <div class="cozy-living-card cozy-event-row">
                        <strong>${escapeHtml(r.contributionType || "Contribution")}</strong>
                        — ${escapeHtml(r.statement || r.expression || "")}
                        <span class="cozy-ud-state-badge">${escapeHtml((r.communityExtensions && r.communityExtensions.reviewState) || "CANDIDATE")}</span>
                    </div>`).join("");
                host.innerHTML = `
                    <h3>Community</h3>
                    <p class="cozy-disclosure-note">${rows ? "" : "Community knowledge will appear here as contributions become available. "}Bucketed state grouping is not connected on this page yet.</p>
                    <div id="cozy-ud-community-list">${rows}</div>
                    <button type="button" class="cozy-btn" data-ud-community-teach>Teach Cozy AI</button>`;
                this.#wireTeachButton(host);
                return;
            }

            const summary = summaryCore.summarizeCommunityRecords(records);
            const bucketOrder = ["pendingReview", "communityVerified", "needsCorrection", "rejected", "learnedKnowledge"];
            const bucketHtml = bucketOrder.map(key => {
                const items = summary.buckets[key] || [];
                const rows = items.slice(0, 6).map(r => `
                    <div class="cozy-living-card cozy-event-row">
                        <strong>${escapeHtml(r.contributionType || "Contribution")}</strong>
                        — ${escapeHtml(r.statement || r.expression || "")}
                    </div>`).join("");
                return `
                    <section class="cozy-ud-community-bucket" data-community-bucket="${key}">
                        <h4>${escapeHtml(summary.labels[key])} <span class="cozy-ud-state-badge">${summary.counts[key]}</span></h4>
                        ${rows || `<p class="cozy-disclosure-note">Nothing here yet.</p>`}
                    </section>`;
            }).join("");

            host.innerHTML = `
                <h3>Community</h3>
                <p class="cozy-disclosure-note">People teach CozyOS, learn from CozyOS, and share knowledge, language, and culture. Contributions move through real review before they're trusted.</p>
                <section class="cozy-ud-community-bucket" data-community-bucket="myContributions">
                    <h4>My Contributions</h4>
                    <p class="cozy-disclosure-note">Not available yet — CozyOS doesn't yet have a way to show only your own contributions here without exposing raw contributor identity. This is a real limitation, not a hidden setting.</p>
                </section>
                ${bucketHtml}
                <button type="button" class="cozy-btn" data-ud-community-teach>Teach Cozy AI</button>
            `;
            this.#wireTeachButton(host);
        }

        /** #wireTeachButton() — routes to the real, existing "Teach CozyAI" flow (RP-031 Phase 2A), which now opens with the Dashboard Prompt 2 §7 contribution-type picker ("What would you like to teach?") before the underlying form. Navigation-based, same seam every other dashboard app already uses (see #launchApp/#adminBtn/#logout above) — never a second contribution form or picker embedded directly in the shell. */
        #wireTeachButton(host) {
            const teachBtn = host.querySelector("[data-ud-community-teach]");
            if (teachBtn) {
                teachBtn.addEventListener("click", () => {
                    window.location.href = "core/modules/intelligence/knowledge/teach/ui/teach-cozyai-form.html";
                });
            }
        }

        /**
         * #renderAiSurface()
         *   Real AI entry point (Prompt 1 §11/§26; extended Prompt 2
         *   §8/§9/§14/§16). Opens the existing Living Assistant (never a
         *   second chat engine) and passes it the real, structured,
         *   authorized-only dashboard context from
         *   DashboardNavigationCore.buildAIContext().
         *
         *   HONEST SCOPE NOTE (Prompt 2 §16) — the real, existing
         *   window.CozyOS.LivingAssistant only exposes open()/close()/
         *   toggle(); this repository has no real message-send/
         *   conversational-execution method on that engine (confirmed
         *   by reading core/living/cozy-living-assistant.js before
         *   writing this — its own header already discloses this same
         *   limit). Rather than fake a working chat backend inside this
         *   dashboard tab, the "suggested questions" below are answered
         *   directly and honestly via DashboardNavigationCore.
         *   explainSurface() — real, context-derived template text
         *   composed client-side, not a live model call, and never
         *   presented as if it were one. The genuine missing dependency
         *   this records: a real conversational execution seam on
         *   LivingAssistant (or an equivalent intelligence engine) that
         *   this dashboard tab could route free-text questions through.
         *   "Open Cozy AI" (the real, existing assistant panel) remains
         *   the one real live entry point, kept clearly separate below.
         */
        #renderAiSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-ai");
            if (!host) return;
            const assistant = window.CozyOS.LivingAssistant;
            const nav = window.CozyOS.DashboardNavigationCore;
            const hasContext = nav && typeof nav.buildAIContext === "function";
            const context = hasContext ? nav.buildAIContext(this.#userId) : { available: false };
            const hasExplain = nav && typeof nav.explainSurface === "function";
            const surfaces = hasContext && typeof nav.getSurfaceOrder === "function" ? nav.getSurfaceOrder() : [];
            const SURFACE_LABELS = { home: "Home", community: "Community", ai: "AI", apps: "Apps", settings: "Settings" };

            host.innerHTML = `
                <h3>Cozy AI</h3>
                <p class="cozy-disclosure-note" id="cozy-ud-ai-context-indicator">${context.available
                    ? `Current context: viewing the ${escapeHtml(SURFACE_LABELS[context.currentSurface] || context.currentSurface)} surface, ${context.applications.available.length} application(s) available (${context.applications.launchable.length} launchable now).`
                    : "Dashboard context is not connected right now."}</p>
                <p class="cozy-disclosure-note cozy-ud-ai-lang">${context.available ? `Responding in: ${escapeHtml(context.userLanguage || "en")}${context.languageFallback ? " (fallback)" : ""}` : ""}</p>

                <section id="cozy-ud-ai-suggested-actions" aria-label="Suggested questions">
                    <h4>Ask about a surface</h4>
                    <div id="cozy-ud-ai-suggested-actions-grid">
                        ${surfaces.map(s => `<button type="button" class="cozy-btn cozy-ud-ai-suggested-btn" data-ud-ai-explain="${escapeHtml(s)}" ${hasExplain ? "" : "disabled"}>What can I do in ${escapeHtml(SURFACE_LABELS[s] || s)}?</button>`).join("")}
                    </div>
                </section>

                <section id="cozy-ud-ai-response-area" aria-live="polite">
                    <p class="cozy-disclosure-note" id="cozy-ud-ai-response-text">Tap a question above, or open the live assistant below.</p>
                </section>

                <p class="cozy-disclosure-note">${assistant && typeof assistant.open === "function" ? "Open the live assistant for a real conversation — it can see what's really available in your CozyOS." : "The live assistant is not connected on this page."}</p>
                <button type="button" class="cozy-btn" id="cozy-ud-ai-open" ${assistant && typeof assistant.open === "function" ? "" : "disabled"}>Open Cozy AI</button>

                <!-- Living Multimodal Learning (CP12) — smallest real
                     entry point, added to the existing AI surface
                     rather than a new top-level nav tab (dashboard-
                     navigation-core.js's 5-surface order is documented
                     as mandatory — not edited here). Reuses the same
                     cozy-btn/cozy-disclosure-note conventions this
                     surface already uses above. Camera/microphone are
                     never activated by rendering this button — only by
                     the user's own Scan/Listen taps inside the panel
                     LearningPanelUI.open() renders, per its own header. -->
                <p class="cozy-disclosure-note">${window.CozyOS.LearningPanelUI ? "Point your camera or microphone at something you're learning, and CozyOS can help." : "Living Learn is not connected on this page."}</p>
                <button type="button" class="cozy-btn" id="cozy-ud-learn-open" ${window.CozyOS.LearningPanelUI ? "" : "disabled"}>Living Learn</button>
                <div id="cozy-ud-learn-mount"></div>
            `;

            host.querySelectorAll("[data-ud-ai-explain]").forEach(btn => {
                btn.addEventListener("click", () => {
                    const responseEl = host.querySelector("#cozy-ud-ai-response-text");
                    if (!responseEl) return;
                    if (!hasExplain) { responseEl.textContent = "This explanation isn't connected right now."; return; }
                    const result = nav.explainSurface(btn.getAttribute("data-ud-ai-explain"), this.#userId);
                    responseEl.textContent = result.available ? result.text : (result.reason || "Not available right now.");
                });
            });

            const openBtn = host.querySelector("#cozy-ud-ai-open");
            if (openBtn) {
                openBtn.addEventListener("click", () => {
                    if (assistant && typeof assistant.open === "function") assistant.open(context);
                });
            }

            const learnBtn = host.querySelector("#cozy-ud-learn-open");
            const learnMount = host.querySelector("#cozy-ud-learn-mount");
            if (learnBtn && learnMount) {
                learnBtn.addEventListener("click", () => {
                    const panel = window.CozyOS.LearningPanelUI;
                    if (!panel || typeof panel.open !== "function") return;
                    panel.open({ userId: this.#userId, container: learnMount });
                });
            }
        }

        /**
         * #renderAppsSurface() — the dedicated Apps tab (Prompt 1 §16;
         * Prompt 2 "Apps surface truthfulness").
         *
         *   Renders two distinct, honestly-labeled sections, never
         *   merged into one undifferentiated grid:
         *     - "Installed Apps"        — real ApplicationVisibility
         *       entries with kind === "application" (registered,
         *       shell-integrated applications only — e.g. ShopOS,
         *       QuarryOS; whatever the real registry/ServiceRegistry
         *       currently assigns to this user).
         *     - "CozyOS Capabilities"   — real, self-declared built-in
         *       capabilities (visibility.audience === "all", e.g.
         *       ChurchOS) that are not registered applications. Shown
         *       separately so a user never mistakes a capability for an
         *       installable app, and this file never invents a fake
         *       application-registry entry to make one appear here.
         *   Both use ApplicationVisibility.getRealLaunchPath() for the
         *   only real launcher this platform currently has (business
         *   HTML entry points). A capability without a real path is
         *   shown honestly as "Not yet launchable" — never a fake
         *   onclick/overlay.
         */
        #renderAppsSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-apps");
            if (!host) return;
            if (!this.#visibleApps.available) {
                host.innerHTML = `<h3>Apps</h3><p class="cozy-disclosure-note">${escapeHtml(this.#visibleApps.reason || "No applications available.")}</p>`;
                return;
            }
            const installedApps = this.#visibleApps.applications.filter(a => a.kind === "application");
            const capabilities = this.#visibleApps.capabilities || [];
            const visibility = window.CozyOS.ApplicationVisibility;
            const getPath = (appId) => visibility && typeof visibility.getRealLaunchPath === "function" ? visibility.getRealLaunchPath(appId) : null;

            const tile = (app, path) => `
                <div class="cozy-living-card cozy-ud-app-tile">
                    <span class="cozy-ud-app-name">${escapeHtml(app.name)}</span>
                    <button type="button" class="cozy-btn" data-ud-apps-open="${escapeHtml(app.appId)}" ${path ? "" : `disabled title="Not yet launchable."`}>${path ? "Open" : "Not yet launchable"}</button>
                </div>`;

            host.innerHTML = `
                <h3>Apps</h3>
                <section id="cozy-ud-installed-apps">
                    <h4>Installed Apps</h4>
                    <div id="cozy-ud-apps-surface-grid">
                        ${installedApps.length ? installedApps.map(app => tile(app, getPath(app.appId))).join("") : `<p class="cozy-disclosure-note">No applications have been assigned to this account yet.</p>`}
                    </div>
                </section>
                <section id="cozy-ud-capabilities">
                    <h4>CozyOS Capabilities</h4>
                    <p class="cozy-disclosure-note">Built-in CozyOS capabilities — not installed applications.</p>
                    <div id="cozy-ud-capabilities-grid">
                        ${capabilities.length ? capabilities.map(cap => tile(cap, getPath(cap.appId))).join("") : `<p class="cozy-disclosure-note">No built-in capabilities are available to this account right now.</p>`}
                    </div>
                </section>
            `;
            host.querySelectorAll("[data-ud-apps-open]").forEach(btn => btn.addEventListener("click", () => {
                const path = getPath(btn.getAttribute("data-ud-apps-open"));
                if (path) window.location.href = path;
            }));
        }

        /**
         * #renderSettingsSurface()
         *   Real preference surface (Prompt 1 §18, Prompt 2 §15-16) —
         *   language via IdentityEngine's own real get/
         *   setLanguagePreference(), never a second language store. No
         *   fake toggle for a control that doesn't actually exist yet.
         *
         *   ADMIN BOUNDARY (Prompt 2 §15): the "Administrator Workspace"
         *   link below is gated on this.#dashboardConfig.isPlatformAdmin
         *   — a real, server/engine-resolved boolean already fetched in
         *   render() from IdentityEngine.getDashboardConfig(userId).
         *   This file never derives admin status from any client-side
         *   value of its own; it only reads what IdentityEngine already
         *   decided. The target, dashboard.html, is the real, existing,
         *   already-mounted Administration Workspace (Milestone 175B,
         *   core/modules/admin/cozy-admin-workspace.js) — not a new
         *   page and not a fabricated link. Normal (non-admin) users
         *   never see this section rendered at all (verified by test).
         */
        #renderSettingsSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-settings");
            if (!host) return;
            const identity = window.CozyOS.IdentityEngine;
            const languageRegistry = window.CozyOS.CozyLanguageRegistry;
            let user = null;
            if (identity && typeof identity.getUser === "function") { try { user = identity.getUser(this.#userId); } catch (_err) { user = null; } }
            const currentLang = identity && typeof identity.getLanguagePreference === "function" ? identity.getLanguagePreference(this.#userId) : null;
            const languages = languageRegistry && typeof languageRegistry.listLanguages === "function" ? languageRegistry.listLanguages() : [];
            const adminBoundary = window.CozyOS.DashboardSettingsAdminBoundaryCore;
            const isPlatformAdmin = adminBoundary && typeof adminBoundary.shouldRenderAdminSettingsSection === "function"
                ? adminBoundary.shouldRenderAdminSettingsSection(this.#dashboardConfig)
                : false;

            host.innerHTML = `
                <h3>Settings</h3>
                <section id="cozy-ud-settings-profile">
                    <h4>Profile</h4>
                    <p class="cozy-disclosure-note">${user ? `Signed in as ${escapeHtml(user.username)} (${escapeHtml(user.status)})` : "Profile data is not available right now."}</p>
                </section>
                <section id="cozy-ud-settings-language">
                    <h4>Language</h4>
                    <p class="cozy-disclosure-note cozy-ud-settings-boundary-tag">User-customizable</p>
                    ${languages.length ? `
                        <select id="cozy-ud-settings-language-select">
                            ${languages.map(l => `<option value="${escapeHtml(l.code)}" ${l.code === currentLang ? "selected" : ""}>${escapeHtml(l.name || l.code)} ${l.state !== "AVAILABLE" ? "(not yet fully supported)" : ""}</option>`).join("")}
                        </select>` : `<p class="cozy-disclosure-note">Language registry is not connected right now.</p>`}
                </section>
                <p class="cozy-disclosure-note">Appearance, accessibility, notifications, privacy, and account controls are not yet wired to real settings sources — nothing fake is shown in their place.</p>
                ${isPlatformAdmin ? `
                <section id="cozy-ud-settings-admin">
                    <h4>Administrator Tools</h4>
                    <p class="cozy-disclosure-note cozy-ud-settings-boundary-tag">Admin-controlled</p>
                    <p class="cozy-disclosure-note">Your account has platform-administrator access. Application registration, protected-application removal, and platform-wide navigation changes are handled in the real Administration Workspace — never from this ordinary-user dashboard, and never from a client-supplied role.</p>
                    <button type="button" class="cozy-btn" id="cozy-ud-open-admin-workspace">Open Administrator Workspace</button>
                </section>` : ``}
            `;
            const select = host.querySelector("#cozy-ud-settings-language-select");
            if (select) {
                select.addEventListener("change", () => {
                    if (identity && typeof identity.setLanguagePreference === "function") identity.setLanguagePreference(this.#userId, select.value);
                });
            }
            const adminBtn = host.querySelector("#cozy-ud-open-admin-workspace");
            if (adminBtn) {
                // ROUTING FIX (RP-ADMIN-ROUTING-SPLIT): dashboard.html is the
                // public User Dashboard now (this same page) - clicking this
                // used to send an admin back into the page they're already
                // on. The real, sole Administrator Workspace entry point is
                // chalzydashboard.html, which performs its own real
                // server-authoritative check before mounting anything.
                adminBtn.addEventListener("click", () => { window.location.href = "chalzydashboard.html"; });
            }
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
        description: "User Dashboard — a COMPOSED five-surface shell (Home/Community/AI/Apps/Settings) over IdentityEngine, ApplicationVisibility, WorkspaceShell, LivingMessageEngine, CozyKnowledgeCommunity, CozyKnowledgeReview, DashboardCommunitySummaryCore, the Living Assistant, and DashboardNavigationCore. No new engines, no duplicate application registry, no duplicate permission system, no duplicate navigation state."
    });
})();
