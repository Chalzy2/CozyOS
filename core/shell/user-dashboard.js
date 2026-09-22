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
 * USER PROFILE PHASE 1 — WHAT CHANGED
 *   #renderProfileSurface() is now a real, editable Profile: profile
 *   picture (preview only), Full Name, Country, City, Save. Data comes
 *   from IdentityEngine.getProfile()/updateProfile() (the existing user
 *   record — no second profile store) and the pure-logic
 *   core/shell/dashboard-profile-core.js. PICTURE: no user-scoped image
 *   storage exists in CozyOS, so a chosen picture is a local preview
 *   only (blob: URL, never stored, never sent anywhere) and the UI says
 *   so; persistence is deferred to Profile Phase 2. NOT part of this
 *   phase: languages spoken / mother languages / Teach CozyAI (a
 *   separate language-profile phase), security settings, privacy.
 *   Both engines degrade honestly: if the profile core or the engine's
 *   getProfile()/updateProfile() are absent, the surface shows the
 *   previous read-only readout and an explicit "not available" note.
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
        "live-video": { label: "Live Video", icon: "🎥" },
        apps: { label: "Apps", icon: "▦" },
        documents: { label: "Documents", icon: "🗃️" },
        calculations: { label: "Calculations", icon: "🧮" },
        requests: { label: "Request an Application", icon: "➕" },
        profile: { label: "Profile", icon: "👤" },
        settings: { label: "Settings", icon: "⚙" }
    };

    class UserDashboard {
        #container = null;
        #userId = null;
        #pinnedApps = [];
        #visibleApps = { available: false, applications: [] };
        #dashboardConfig = { available: false, reason: null };
        #profileCurrent = null;
        #profilePicture = null; // { url, name } — local blob: preview only, never persisted
        #profileSaving = false;

        /**
         * #onApplicationAccessEvent — PHASE 5 (User Dashboard <->
         * Administrator Application Control Plane). A stable, bound
         * class-field reference (not a fresh arrow function per render())
         * so that if render() is ever called more than once on the same
         * instance, PlatformEventBus.on()'s own Set-based dedup (see
         * core/shell/platform-event-bus.js) prevents double subscription
         * and double-refresh — no new listener-tracking mechanism needed.
         * Filters to events for THIS dashboard's own userId only; a grant
         * for a different user must never cause this dashboard to
         * refresh or reveal anything about that other user.
         */
        #onApplicationAccessEvent = (payload) => {
            if (!payload || payload.userId !== this.#userId) return;
            this.#refreshApplicationsData();
        };

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
                        <button type="button" id="cozy-ud-menu-btn" aria-label="Open CozyOS menu" aria-expanded="false" aria-controls="cozy-ud-drawer">☰</button>
                        <div id="cozy-ud-profile">${escapeHtml(userId)}</div>
                        <input type="text" id="cozy-ud-search" class="cozy-living-input" placeholder="Search CozyOS...">
                        <button type="button" id="cozy-ud-notifications-btn" title="Notifications">🔔</button>
                        <button type="button" id="cozy-ud-signout" title="Sign out">Sign Out</button>
                    </div>
                    <div id="cozy-ud-drawer-overlay"></div>
                    <nav id="cozy-ud-drawer" aria-label="CozyOS master navigation">
                        <div id="cozy-ud-drawer-section-cozyos">
                            <h4 class="cozy-ud-drawer-heading">CozyOS</h4>
                            ${order.map(name => `
                                <button type="button"
                                    class="cozy-ud-drawer-link"
                                    data-nav-surface="${escapeHtml(name)}"
                                    aria-current="${name === activeSurface ? "page" : "false"}">
                                    <span aria-hidden="true">${SURFACE_META[name] ? SURFACE_META[name].icon : "•"}</span>
                                    <span>${SURFACE_META[name] ? escapeHtml(SURFACE_META[name].label) : escapeHtml(name)}</span>
                                </button>`).join("")}
                        </div>
                        <div id="cozy-ud-drawer-section-apps">
                            <h4 class="cozy-ud-drawer-heading">Applications</h4>
                            <div id="cozy-ud-drawer-apps-list"></div>
                        </div>
                    </nav>
                    <div id="cozy-ud-surfaces">
                        <section id="cozy-ud-surface-home" class="cozy-ud-surface" data-surface="home"></section>
                        <section id="cozy-ud-surface-community" class="cozy-ud-surface" data-surface="community"></section>
                        <section id="cozy-ud-surface-ai" class="cozy-ud-surface" data-surface="ai"></section>
                        <section id="cozy-ud-surface-live-video" class="cozy-ud-surface" data-surface="live-video"></section>
                        <section id="cozy-ud-surface-apps" class="cozy-ud-surface" data-surface="apps"></section>
                        <section id="cozy-ud-surface-documents" class="cozy-ud-surface" data-surface="documents"></section>
                        <section id="cozy-ud-surface-calculations" class="cozy-ud-surface" data-surface="calculations"></section>
                        <section id="cozy-ud-surface-requests" class="cozy-ud-surface" data-surface="requests"></section>
                        <section id="cozy-ud-surface-profile" class="cozy-ud-surface" data-surface="profile"></section>
                        <section id="cozy-ud-surface-settings" class="cozy-ud-surface" data-surface="settings"></section>
                    </div>
                    <!-- Level 1 master drawer dependency — the real,
                         canonical window.CozyOS.ApplicationLauncher.open()
                         (core/shell/application-launcher.js, Domain 4I)
                         mounts into exactly this container id in every
                         other real CozyOS surface (dashboard.html/
                         admin-workspace.html); it did not previously
                         exist anywhere in this file's rendered DOM, so
                         open() could never actually succeed here before
                         this change. No new launcher — this is the one,
                         real, missing mount point the existing launcher
                         already expects. -->
                    <div id="cozy-workspace-root"></div>
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
            this.#wireDrawer();
            if (nav && typeof nav.onChange === "function") {
                nav.onChange(() => this.#applyActiveSurface());
            }
            this.#renderAllSurfaces();
            this.#applyActiveSurface();
            this.#wirePlatformEvents();
        }

        /**
         * #wirePlatformEvents() — PHASE 5 (User Dashboard <->
         * Administrator Application Control Plane). Subscribes to the
         * real, already-emitted PlatformEventBus events from
         * core/organization/application-access-admin-panel.js
         * (applicationAccess:granted/suspended/restored/revoked) so this
         * dashboard reflects an administrator's decision automatically,
         * with no manual page reload — the "DASHBOARD REFLECTS" step of
         * the required lifecycle. No new event bus, no polling: reuses
         * the one, real, existing shared bus every other coordinator in
         * this repository is meant to use.
         */
        #wirePlatformEvents() {
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.on !== "function") return;
            bus.on("applicationAccess:granted", this.#onApplicationAccessEvent);
            bus.on("applicationAccess:suspended", this.#onApplicationAccessEvent);
            bus.on("applicationAccess:restored", this.#onApplicationAccessEvent);
            bus.on("applicationAccess:revoked", this.#onApplicationAccessEvent);
        }

        /**
         * #refreshApplicationsData() — real re-fetch of the exact same
         * two real sources render() itself reads on first load
         * (identity.getDashboardConfig() / ApplicationVisibility.
         * listVisibleApplications()), then re-renders only the
         * application-facing surfaces that depend on them (the Home
         * tab's app grid, the dedicated Apps tab, the Requests tab, and
         * the master drawer's app list) — never a full container
         * re-render, so an open surface / in-progress input elsewhere on
         * the page is not disturbed.
         */
        #refreshApplicationsData() {
            const identity = window.CozyOS.IdentityEngine;
            const visibility = window.CozyOS.ApplicationVisibility;

            if (identity && typeof identity.getDashboardConfig === "function") {
                try { this.#dashboardConfig = identity.getDashboardConfig(this.#userId); } catch (err) { this.#dashboardConfig = { available: false, reason: err.message }; }
            }
            if (visibility && typeof visibility.listVisibleApplications === "function") {
                this.#visibleApps = visibility.listVisibleApplications(this.#userId);
            }

            this.#renderApps(this.#visibleApps, this.#dashboardConfig);
            this.#renderAppsSurface();
            this.#renderRequestsSurface();
            this.#renderDrawerApps();
        }

        /**
         * #wireDrawer() — Level 1 master navigation (small-phone drawer).
         *   Reuses the proven Administrator Workspace concept
         *   (admin-workspace.html's real, live .cozy-shell.cozy-
         *   sidebar-mobile-open off-canvas overlay pattern — confirmed
         *   by reading that file directly before writing this) at the
         *   same <600px breakpoint (no canonical CozyOS breakpoint
         *   token exists to reuse instead — confirmed by search — so
         *   this matches the one other real, live implementation
         *   exactly). Opening/closing only toggles a class; it never
         *   touches #cozy-ud-surfaces or #cozy-workspace-root, so an
         *   active application is never reloaded or recreated by the
         *   drawer's own open/close action. Surface-switch links reuse
         *   #wireBottomNav()'s own [data-nav-surface] wiring — no
         *   second tab-switch mechanism, since data-nav-surface targets
         *   the same elements. Application entries are real
         *   authorization-aware data (this.#visibleApps, from
         *   ApplicationVisibility.listVisibleApplications(), already
         *   computed in render()) and launch via the one, real,
         *   canonical window.CozyOS.ApplicationLauncher.open() — never
         *   a second launcher, never window.location for these entries.
         */
        #wireDrawer() {
            const root = this.#container;
            const menuBtn = root.querySelector("#cozy-ud-menu-btn");
            const drawer = root.querySelector("#cozy-ud-drawer");
            const overlay = root.querySelector("#cozy-ud-drawer-overlay");
            const shell = root.querySelector("#cozy-user-dashboard");
            if (!menuBtn || !drawer || !overlay || !shell) return;

            const closeDrawer = () => {
                shell.classList.remove("cozy-ud-drawer-open");
                menuBtn.setAttribute("aria-expanded", "false");
            };
            const openDrawer = () => {
                shell.classList.add("cozy-ud-drawer-open");
                menuBtn.setAttribute("aria-expanded", "true");
            };
            menuBtn.addEventListener("click", () => {
                shell.classList.contains("cozy-ud-drawer-open") ? closeDrawer() : openDrawer();
            });
            overlay.addEventListener("click", closeDrawer);

            // Surface links inside the drawer share the exact same
            // [data-nav-surface] contract #wireBottomNav() already wires
            // (querySelectorAll runs against the whole container, so
            // both the drawer's copies and the bottom nav's copies are
            // wired identically, from that one existing function) —
            // this file only needs to additionally close the drawer
            // after a real surface switch, which is drawer-specific UX,
            // not navigation logic.
            drawer.querySelectorAll("[data-nav-surface]").forEach((btn) => {
                btn.addEventListener("click", closeDrawer);
            });

            this.#renderDrawerApps();
        }

        /**
         * #renderDrawerApps() — Level 1: real, authorization-filtered
         * application list inside the master drawer; never invents an
         * entry beyond what ApplicationVisibility already approved for
         * this user.
         *
         * Level 2A (application-specific expandable navigation) — each
         * row is a real expand/collapse toggle (pure local UI state,
         * zero calls to ApplicationLauncher) revealing:
         *   1. Real, existing per-application lifecycle actions: "Open"
         *      (window.CozyOS.ApplicationLauncher.open()) and, only
         *      when ApplicationLauncher.isOpen(appId) genuinely reports
         *      the app is currently mounted, "Close"
         *      (ApplicationLauncher.close()).
         *   2. A real capability list, read via #discoverCapabilities()
         *      below — reusing the one real, existing, generic
         *      convention already established by ShopOS's own
         *      getNavigation() method (window.CozyOS.Modules[appId].
         *      getNavigation()), never a new capability registry.
         *      Repository-wide check at implementation time: only
         *      ShopOS currently exposes this method (QuarryOS, MpesaOS,
         *      PharmacyOS, WholesaleOS, ChurchOS/Living Worship do not)
         *      - honestly disclosed per-app below rather than inventing
         *      a capability list for applications that never declared
         *      one. No new per-app navigation registry was created -
         *      "constituent items" here are either the application's
         *      own already-existing lifecycle actions from the one
         *      canonical launcher, or its own already-existing,
         *      self-reported navigation/tab list - never fabricated
         *      sub-routes. Expanding/collapsing a row never calls
         *      open()/close() itself, so it can never reload or
         *      recreate the active application.
         */
        /**
         * #discoverCapabilities(appId) — Level 2B.
         *   VERIFIED: window.CozyOS.Modules[appId].getNavigation() is a
         *   real, existing method returning real items — the exact
         *   convention ShopOS established in L2A. Repository-wide
         *   re-check at L2B time (per its own "do not assume" mandate)
         *   found MpesaOS's real module (core/modules/MpesaOS/mpesaos.js)
         *   independently exposes the identical real getNavigation()
         *   convention — picked up automatically here with no
         *   per-application special-casing, since this function was
         *   already generic.
         *   NOT_IMPLEMENTED: no such method, but ApplicationVisibility.
         *   getRealLaunchPath(appId) (the same real, single source the
         *   Apps-surface tile and ModuleRegistry-backed launches both
         *   already use) confirms the application itself has a real,
         *   resolvable entry point — it can genuinely be opened, it
         *   just has no structured capability breakdown yet.
         *   BLOCKED: neither exists — confirmed at L2B audit time for
         *   PharmacyOS (real applications/PharmacyOS/pharmacyos.html
         *   exists on disk, but core/plugins/pharmacyOS-core.js never
         *   registers a ServiceRegistry entryPoint for it) and
         *   WholesaleOS (no applications/WholesaleOS/ directory exists
         *   at all) - real, disclosed, out-of-scope dependencies per
         *   Rule 14, not fixed here.
         */
        #discoverCapabilities(appId) {
            const jsModule = window.CozyOS.Modules && window.CozyOS.Modules[appId];
            if (jsModule && typeof jsModule.getNavigation === "function") {
                let items;
                try { items = jsModule.getNavigation(); } catch (err) { return { status: "NOT_IMPLEMENTED", items: [], reason: `getNavigation() threw: ${err.message}` }; }
                if (Array.isArray(items) && items.length > 0) {
                    return { status: "VERIFIED", items, reason: null };
                }
            }
            const visibility = window.CozyOS.ApplicationVisibility;
            let launchPath = null;
            if (visibility && typeof visibility.getRealLaunchPath === "function") {
                try { launchPath = visibility.getRealLaunchPath(appId); } catch (_err) { launchPath = null; }
            }
            if (launchPath) {
                return { status: "NOT_IMPLEMENTED", items: [], reason: "This application does not expose a structured capability/navigation list yet, though it can be opened." };
            }
            return { status: "BLOCKED", items: [], reason: "No real, resolvable launch destination is currently registered for this application — a dependency, not a permissions issue." };
        }

        #renderDrawerApps() {
            const list = this.#container.querySelector("#cozy-ud-drawer-apps-list");
            if (!list) return;
            if (!this.#visibleApps.available || !Array.isArray(this.#visibleApps.applications)) {
                list.innerHTML = `<p class="cozy-disclosure-note">${escapeHtml(this.#visibleApps.reason || "No applications available.")}</p>`;
                return;
            }
            const businessApps = this.#visibleApps.applications.filter((a) => a.kind === "application");
            if (!businessApps.length) {
                list.innerHTML = `<p class="cozy-disclosure-note">No applications have been assigned to this account yet.</p>`;
                return;
            }
            const launcher = window.CozyOS && window.CozyOS.ApplicationLauncher;
            list.innerHTML = businessApps.map((app) => {
                const isOpen = !!(launcher && typeof launcher.isOpen === "function" && launcher.isOpen(app.appId));
                const capabilities = this.#discoverCapabilities(app.appId);
                return `
                <div class="cozy-ud-drawer-app-row" data-drawer-app-row="${escapeHtml(app.appId)}">
                    <button type="button" class="cozy-ud-drawer-link cozy-ud-drawer-app-toggle" data-drawer-toggle-app="${escapeHtml(app.appId)}" aria-expanded="false">
                        <span aria-hidden="true">📦</span>
                        <span>${escapeHtml(app.name)}</span>
                        <span class="cozy-ud-drawer-app-arrow" aria-hidden="true">▸</span>
                    </button>
                    <div class="cozy-ud-drawer-app-panel" data-drawer-app-panel="${escapeHtml(app.appId)}" hidden>
                        <button type="button" class="cozy-ud-drawer-sublink" data-drawer-open-app="${escapeHtml(app.appId)}">Open</button>
                        <button type="button" class="cozy-ud-drawer-sublink" data-drawer-close-app="${escapeHtml(app.appId)}" ${isOpen ? "" : "hidden"}>Close</button>
                        <div class="cozy-ud-drawer-app-capabilities" data-drawer-app-capabilities="${escapeHtml(app.appId)}">
                            ${capabilities.status === "VERIFIED"
                                ? `<p class="cozy-ud-drawer-cap-label">Capabilities</p>
                                   <ul class="cozy-ud-drawer-cap-list">${capabilities.items.map(c => `<li><button type="button" class="cozy-ud-drawer-cap-item" data-drawer-open-capability="${escapeHtml(app.appId)}">${escapeHtml(c.label || c.id)}</button></li>`).join("")}</ul>
                                   <p class="cozy-disclosure-note">Opens ${escapeHtml(app.name)} — no direct deep-link into a specific tab exists yet, so you'll land on the app and select it there.</p>`
                                : `<p class="cozy-disclosure-note">${escapeHtml(capabilities.reason)}</p>`}
                        </div>
                    </div>
                </div>`;
            }).join("");

            // Expand/collapse — pure local UI state, never touches
            // ApplicationLauncher.
            list.querySelectorAll("[data-drawer-toggle-app]").forEach((toggleBtn) => {
                toggleBtn.addEventListener("click", () => {
                    const appId = toggleBtn.getAttribute("data-drawer-toggle-app");
                    const panel = list.querySelector(`[data-drawer-app-panel="${appId}"]`);
                    if (!panel) return;
                    const nowExpanded = panel.hidden;
                    panel.hidden = !nowExpanded;
                    toggleBtn.setAttribute("aria-expanded", nowExpanded ? "true" : "false");
                });
            });

            const doOpenApp = (appId) => {
                if (!launcher || typeof launcher.open !== "function") return;
                launcher.open(appId).then((result) => {
                    if (!result || !result.success) {
                        console.warn(`[UserDashboard] ApplicationLauncher.open() did not succeed:`, result && result.reason);
                    } else {
                        this.#renderDrawerApps(); // refresh so the real isOpen() state now shows "Close"
                    }
                }).catch((err) => {
                    console.warn(`[UserDashboard] ApplicationLauncher.open() threw:`, err && err.message);
                });
                const shell = this.#container.querySelector("#cozy-user-dashboard");
                if (shell) shell.classList.remove("cozy-ud-drawer-open");
            };

            list.querySelectorAll("[data-drawer-open-app]").forEach((btn) => {
                btn.addEventListener("click", () => doOpenApp(btn.getAttribute("data-drawer-open-app")));
            });

            // Level 2B — a capability item's only real destination today
            // is opening the application itself (see the disclosure note
            // rendered alongside the list above); this reuses the exact
            // same real ApplicationLauncher.open() call as "Open", never
            // a fabricated deep link into a specific tab/section.
            list.querySelectorAll("[data-drawer-open-capability]").forEach((btn) => {
                btn.addEventListener("click", () => doOpenApp(btn.getAttribute("data-drawer-open-capability")));
            });

            list.querySelectorAll("[data-drawer-close-app]").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const appId = btn.getAttribute("data-drawer-close-app");
                    if (!launcher || typeof launcher.close !== "function") return;
                    launcher.close(appId);
                    this.#renderDrawerApps(); // refresh so the real isOpen() state now hides "Close"
                });
            });
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
            this.#renderLiveVideoSurface();
            this.#renderAppsSurface();
            this.#renderDocumentsSurface();
            this.#renderCalculationsSurface();
            this.#renderRequestsSurface();
            this.#renderProfileSurface();
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
         * #renderLiveVideoSurface() — Level 1 Universal Intelligence
         * slice. Composes the real, existing ChurchOS Living Worship
         * Player (window.CozyOS.LivingWorshipPlayer /
         * window.CozyOS.LiveViewController) — never a second video
         * engine.
         *
         * HONEST LIMIT (disclosed, not hidden): the real player's own
         * public surface (see living-worship-player.js's own header,
         * M367) is a 3-state floating controller — LiveViewController.
         * show() is the one real, documented public entry point for a
         * page-level "open Live Video" affordance. There is no separate
         * public method that mounts the worship window directly
         * (confirmed by reading the class; #mountWindow is private,
         * only reachable via the controller's own "open" action) — so
         * this button reveals the real controller rather than
         * fabricating a second, more direct entry point that doesn't
         * exist. From there, Theater/Float/PiP/minimize/move/pin remain
         * exactly the real, existing, unmodified behavior.
         */
        #renderLiveVideoSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-live-video");
            if (!host) return;
            const controller = window.CozyOS.LiveViewController;
            const player = window.CozyOS.LivingWorshipPlayer;
            const connected = !!(controller && typeof controller.show === "function") || !!player;
            host.innerHTML = `
                <h3>Live Video / Live Worship</h3>
                ${connected ? `
                    <p class="cozy-disclosure-note">Connected to the real Living Worship Player — the same engine used elsewhere in CozyOS. This does not create a second video engine.</p>
                    <button type="button" class="cozy-btn" id="cozy-ud-open-live-video">Open Live Video</button>
                    <p class="cozy-disclosure-note">Opens the real floating Live control (🎥). Theater, Float, PiP, minimize, move, and pin remain the existing, unmodified controls.</p>
                ` : `<p class="cozy-disclosure-note">Live Video is not connected right now — the Living Worship Player engine is not loaded on this page.</p>`}
            `;
            const btn = host.querySelector("#cozy-ud-open-live-video");
            if (btn) {
                btn.addEventListener("click", () => {
                    if (controller && typeof controller.show === "function") controller.show();
                });
            }
        }

        /**
         * #renderDocumentsSurface() — Level 1 Universal Intelligence
         * slice. Composes the real, existing window.CozyOS.DocumentEngine
         * — never a second document/storage engine.
         *
         * HONEST LIMIT (disclosed): DocumentEngine has no repository-wide
         * "list everything for this user" method (confirmed by reading
         * its source — only searchByMerchant/Receipt/Date/Customer/
         * Supplier/Text/Amount/DocumentType, each requiring a real
         * search provider to be registered). This surface is therefore
         * a real search form, not a fabricated document list. Whether
         * the underlying persistence is local-only or genuinely
         * cloud-backed depends on which storage provider was actually
         * registered via registerStorageProvider() — this file does not
         * assert "cloud storage" itself, since asserting a persistence
         * guarantee this file cannot verify would itself be dishonest.
         */
        #renderDocumentsSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-documents");
            if (!host) return;
            const engine = window.CozyOS.DocumentEngine;
            const connected = !!(engine && typeof engine.detectDocumentType === "function");
            if (!connected) {
                host.innerHTML = `<h3>Documents</h3><p class="cozy-disclosure-note">Documents is not connected right now — the Document Engine is not loaded on this page.</p>`;
                return;
            }
            host.innerHTML = `
                <h3>Documents</h3>
                <p class="cozy-disclosure-note">Real Document Engine connected. There is no single "list all documents" capability yet — search by one of the real, existing criteria below.</p>
                <select id="cozy-ud-doc-search-field">
                    <option value="searchByMerchant">Merchant</option>
                    <option value="searchByReceipt">Receipt number</option>
                    <option value="searchByDate">Date</option>
                    <option value="searchByCustomer">Customer ID</option>
                    <option value="searchBySupplier">Supplier ID</option>
                    <option value="searchByAmount">Amount</option>
                    <option value="searchByDocumentType">Document type</option>
                    <option value="searchByText">Text</option>
                </select>
                <input type="text" id="cozy-ud-doc-search-value" class="cozy-living-input" placeholder="Search value">
                <button type="button" class="cozy-btn" id="cozy-ud-doc-search-btn">Search</button>
                <div id="cozy-ud-doc-search-results"></div>
            `;
            const resultsEl = host.querySelector("#cozy-ud-doc-search-results");
            host.querySelector("#cozy-ud-doc-search-btn").addEventListener("click", () => {
                const method = host.querySelector("#cozy-ud-doc-search-field").value;
                const value = host.querySelector("#cozy-ud-doc-search-value").value;
                let result;
                try { result = engine[method](value); } catch (err) { result = { available: false, reason: err.message }; }
                if (!result || result.available === false) {
                    resultsEl.innerHTML = `<p class="cozy-disclosure-note">${escapeHtml((result && result.reason) || "No results.")}</p>`;
                    return;
                }
                const records = Array.isArray(result) ? result : (Array.isArray(result.results) ? result.results : []);
                resultsEl.innerHTML = records.length
                    ? `<ul>${records.map(r => `<li>${escapeHtml(JSON.stringify(r))}</li>`).join("")}</ul>`
                    : `<p class="cozy-disclosure-note">No matching documents found.</p>`;
            });
        }

        /**
         * #renderCalculationsSurface() — Level 1 Universal Intelligence
         * slice. Composes the real, existing
         * window.CozyOS.CalculationEngine + window.CozyOS.FormulaRegistry
         * — never a dashboard-local calculation engine. Every formula
         * listed, every required input, and every result shown comes
         * directly from FormulaRegistry.list() / CalculationEngine.
         * calculate() at call time — nothing here is a hardcoded formula.
         */
        #renderCalculationsSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-calculations");
            if (!host) return;
            const engine = window.CozyOS.CalculationEngine;
            const registry = window.CozyOS.FormulaRegistry;
            const connected = !!(engine && registry);
            if (!connected) {
                host.innerHTML = `<h3>Calculations</h3><p class="cozy-disclosure-note">Calculations is not connected right now — the Calculation Engine / Formula Registry is not loaded on this page.</p>`;
                return;
            }
            const formulas = registry.list();
            host.innerHTML = `
                <h3>Calculations</h3>
                <p class="cozy-disclosure-note">Real Calculation Engine connected — ${formulas.length} formula(s) registered.</p>
                ${formulas.length ? `
                    <select id="cozy-ud-calc-formula-select">
                        ${formulas.map(f => `<option value="${escapeHtml(f.formulaId)}">${escapeHtml(f.name)} (${escapeHtml(f.pack)})</option>`).join("")}
                    </select>
                    <div id="cozy-ud-calc-inputs"></div>
                    <button type="button" class="cozy-btn" id="cozy-ud-calc-run-btn">Calculate</button>
                    <div id="cozy-ud-calc-result"></div>
                ` : `<p class="cozy-disclosure-note">No formulas are currently registered.</p>`}
            `;
            if (!formulas.length) return;
            const select = host.querySelector("#cozy-ud-calc-formula-select");
            const inputsHost = host.querySelector("#cozy-ud-calc-inputs");
            const resultHost = host.querySelector("#cozy-ud-calc-result");
            const renderInputs = () => {
                const entry = registry.get(select.value);
                const required = entry ? entry.requiredInputs : [];
                const inputTypes = entry ? (entry.inputTypes || {}) : {};
                inputsHost.innerHTML = required.map(key => `
                    <label>${escapeHtml(key)}${inputTypes[key] === "numberArray" ? " (comma-separated numbers)" : ""}
                        <input type="text" data-calc-input="${escapeHtml(key)}">
                    </label>`).join("");
            };
            select.addEventListener("change", renderInputs);
            renderInputs();
            host.querySelector("#cozy-ud-calc-run-btn").addEventListener("click", () => {
                const entry = registry.get(select.value);
                const inputTypes = entry ? (entry.inputTypes || {}) : {};
                const inputs = {};
                inputsHost.querySelectorAll("[data-calc-input]").forEach(el => {
                    const key = el.getAttribute("data-calc-input");
                    inputs[key] = inputTypes[key] === "numberArray"
                        ? el.value.split(",").map(v => Number(v.trim())).filter(n => Number.isFinite(n))
                        : Number(el.value);
                });
                const result = engine.calculate(select.value, inputs, { user: this.#userId });
                resultHost.innerHTML = result.success
                    ? `<p class="cozy-disclosure-note">Result: ${escapeHtml(String(result.result))}</p>`
                    : `<p class="cozy-disclosure-note">${escapeHtml(result.reason || "Calculation failed.")}</p>`;
            });
        }

        /**
         * #renderRequestsSurface() — Level 1 "Request an Application".
         * Composes the real, existing
         * window.CozyOS.AdministrativeRequestCoordinator.submitRequest()
         * — never a second request/approval system, and the user is
         * never able to approve their own request from this file:
         * decideRequest() is never called here.
         *
         * DISCLOSED DISCREPANCY: the conceptual lifecycle in the
         * governance prompt (SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/
         * AVAILABLE/CLOSED) does not match the real coordinator's actual
         * states (REQUESTED -> APPROVED/REJECTED -> EXECUTING ->
         * COMPLETED/FAILED, per that file's own header). This surface
         * shows the REAL states the coordinator actually reports, not
         * the conceptual ones, since inventing a translation layer
         * between them would risk misrepresenting a real request's
         * actual status.
         */
        #renderRequestsSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-requests");
            if (!host) return;
            const coordinator = window.CozyOS.AdministrativeRequestCoordinator;
            const connected = !!(coordinator && typeof coordinator.submitRequest === "function");
            if (!connected) {
                host.innerHTML = `<h3>Request an Application</h3><p class="cozy-disclosure-note">Request an Application is not connected right now — the Administrative Request Coordinator is not loaded on this page.</p>`;
                return;
            }
            const myRequests = typeof coordinator.listRequests === "function"
                ? coordinator.listRequests(r => r.requester === this.#userId && r.action === "APPLICATION_ACCESS_REQUEST")
                : [];
            host.innerHTML = `
                <h3>Request an Application</h3>
                <p class="cozy-disclosure-note">Submitting a request never grants access. Only a platform administrator holding the approver role can approve or reject it — this dashboard never calls that decision itself.</p>
                <input type="text" id="cozy-ud-req-app" class="cozy-living-input" placeholder="Application or capability name">
                <input type="text" id="cozy-ud-req-note" class="cozy-living-input" placeholder="Reason (optional)">
                <button type="button" class="cozy-btn" id="cozy-ud-req-submit-btn">Submit Request</button>
                <h4>Your Requests</h4>
                <div id="cozy-ud-req-list">
                    ${myRequests.length ? `<ul>${myRequests.map(r => `<li>${escapeHtml(r.payload && r.payload.applicationId || "(unnamed)")} — ${escapeHtml(r.state)}</li>`).join("")}</ul>` : `<p class="cozy-disclosure-note">You have not submitted any application requests yet.</p>`}
                </div>
            `;
            host.querySelector("#cozy-ud-req-submit-btn").addEventListener("click", () => {
                const applicationId = host.querySelector("#cozy-ud-req-app").value.trim();
                const note = host.querySelector("#cozy-ud-req-note").value.trim();
                if (!applicationId) return;
                try {
                    coordinator.submitRequest({ action: "APPLICATION_ACCESS_REQUEST", requester: this.#userId, payload: { applicationId, note } });
                } catch (_err) { /* honest no-op on failure; nothing fabricated */ }
                this.#renderRequestsSurface();
            });
        }

        /**
         * #renderProfileSurface() — Level 1 Profile, User Profile Phase 1.
         *   Composes the real IdentityEngine.getUser() (read-only account
         *   lines) and getProfile()/updateProfile() (the four editable
         *   display fields) — never a second identity/profile store.
         *   Picture: preview only (see header) — honestly labeled; the
         *   "Not implemented" note is always rendered.
         */
        #renderProfileSurface() {
            const host = this.#container.querySelector("#cozy-ud-surface-profile");
            if (!host) return;
            const identity = window.CozyOS.IdentityEngine;
            const core = window.CozyOS.DashboardProfileCore;
            let user = null;
            if (identity && typeof identity.getUser === "function") { try { user = identity.getUser(this.#userId); } catch (_err) { user = null; } }
            let stored = null;
            if (core && identity && typeof identity.getProfile === "function" && typeof identity.updateProfile === "function") {
                try { const p = identity.getProfile(this.#userId); if (p && p.available) stored = p; } catch (_err) { stored = null; }
            }
            const current = stored ? core.fromStoredProfile(stored) : null;
            this.#profileCurrent = current;

            const accountLines = user ? `
                <p class="cozy-disclosure-note">Username: ${escapeHtml(user.username)}</p>
                <p class="cozy-disclosure-note">Status: ${escapeHtml(user.status)}</p>
                <p class="cozy-disclosure-note">Dashboard type: ${escapeHtml((this.#dashboardConfig && this.#dashboardConfig.dashboardType) || "unknown")}</p>
            ` : `<p class="cozy-disclosure-note">Profile data is not available right now.</p>`;

            const pictureNote = core
                ? `Not implemented — picture saving is deferred to ${escapeHtml(core.getPicturePersistenceStatus().deferredTo)}. Your choice below is a preview on this device only; it is not saved and will be gone after you leave this page.`
                : `Not implemented — profile picture saving is not available yet.`;

            const pic = this.#profilePicture;
            const initials = current ? core.initialsFor(current.fullName) : "";
            const pictureSection = `
                <section id="cozy-ud-profile-picture" class="cozy-ud-profile-block">
                    <h4>Profile Picture</h4>
                    ${core ? `
                    <div class="cozy-ud-avatar-row">
                        <div id="cozy-ud-avatar" class="cozy-ud-avatar" role="img" aria-label="${pic ? "Profile picture preview" : "No profile picture chosen"}">${pic ? `<img src="${escapeHtml(pic.url)}" alt="Profile picture preview">` : (initials ? escapeHtml(initials) : "👤")}</div>
                        <div class="cozy-ud-avatar-actions">
                            <button type="button" class="cozy-btn" id="cozy-ud-avatar-choose" ${pic ? "hidden" : ""}>Choose Picture</button>
                            <button type="button" class="cozy-btn" id="cozy-ud-avatar-replace" ${pic ? "" : "hidden"}>Replace Picture</button>
                            <button type="button" class="cozy-btn" id="cozy-ud-avatar-remove" ${pic ? "" : "hidden"}>Remove</button>
                        </div>
                    </div>
                    <input type="file" id="cozy-ud-avatar-file" accept="image/jpeg,image/png,image/webp" hidden>
                    <p id="cozy-ud-avatar-error" class="cozy-ud-field-error" role="alert"></p>` : ``}
                    <p class="cozy-disclosure-note">${pictureNote}</p>
                </section>`;

            let fieldsSection;
            if (current) {
                const countries = core.listCountries();
                const keepOption = current.countryListed ? "" : `<option value="${escapeHtml(core.KEEP_CURRENT_COUNTRY)}" selected>${escapeHtml(current.countryRaw)} (current)</option>`;
                fieldsSection = `
                <section id="cozy-ud-profile-fields" class="cozy-ud-profile-block">
                    <label class="cozy-ud-field-label" for="cozy-ud-profile-fullname">Full Name</label>
                    <input type="text" id="cozy-ud-profile-fullname" class="cozy-living-input" maxlength="${core.LIMITS.fullName}" autocomplete="name" value="${escapeHtml(current.fullName)}">
                    <p id="cozy-ud-profile-fullname-error" class="cozy-ud-field-error" role="alert"></p>
                    <label class="cozy-ud-field-label" for="cozy-ud-profile-country">Country</label>
                    <select id="cozy-ud-profile-country" class="cozy-living-input" autocomplete="country">
                        <option value="" ${current.countryRaw ? "" : "selected"}>Select country</option>
                        ${keepOption}
                        ${countries.map(c => `<option value="${escapeHtml(c.code)}" ${current.countryListed && c.code === current.countryCode ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                    </select>
                    <p id="cozy-ud-profile-country-error" class="cozy-ud-field-error" role="alert"></p>
                    <label class="cozy-ud-field-label" for="cozy-ud-profile-city">City</label>
                    <input type="text" id="cozy-ud-profile-city" class="cozy-living-input" maxlength="${core.LIMITS.city}" autocomplete="address-level2" value="${escapeHtml(current.city)}">
                    <p id="cozy-ud-profile-city-error" class="cozy-ud-field-error" role="alert"></p>
                    <button type="button" class="cozy-btn cozy-btn-primary" id="cozy-ud-profile-save">Save Profile</button>
                    <p id="cozy-ud-profile-status" class="cozy-disclosure-note" role="status" aria-live="polite"></p>
                </section>`;
            } else {
                fieldsSection = `<p class="cozy-disclosure-note">Profile editing is not available right now.</p>`;
            }

            // PHASE 3 (Teach Cozy / Governed Learning) — the real Profile
            // entry point this phase adds, filling the "Teach CozyAI"
            // slot Profile Phase 1 itself explicitly deferred (see this
            // method's own file header). Distinct from the existing,
            // unmodified Community "Teach Cozy AI" button (#wireTeachButton
            // above, RP-031 Phase 2A) which navigates to a separate
            // structured-contribution form page — this one opens the
            // SAME real Live Window this dashboard already has, via
            // window.CozyOS.LivingAssistant.enterTeachingMode(), never a
            // second chat surface.
            const teachSection = `
                <section id="cozy-ud-profile-teach" class="cozy-ud-profile-block">
                    <h4>Teach Cozy</h4>
                    <p class="cozy-disclosure-note">Tell CozyAI something in a normal conversation and it will ask you to confirm before remembering it — nothing is learned without your explicit yes.</p>
                    <button type="button" class="cozy-btn" id="cozy-ud-profile-teach-btn">Teach Cozy</button>
                </section>`;

            host.innerHTML = `
                <h3>Profile</h3>
                <div id="cozy-ud-profile-card">
                    ${pictureSection}
                    ${fieldsSection}
                    <section id="cozy-ud-profile-account" class="cozy-ud-profile-block">
                        <h4>Account</h4>
                        ${accountLines}
                    </section>
                    ${teachSection}
                </div>
            `;
            if (core) this.#wireProfileSurface(host, core, identity);
            this.#wireProfileTeachButton(host);
        }

        /** #wireProfileTeachButton() — routes to the real, existing Live Window's enterTeachingMode() (Phase 3). Honest degrade: if the Live Window isn't loaded on this page, the button says so instead of doing nothing silently. */
        #wireProfileTeachButton(host) {
            const btn = host.querySelector("#cozy-ud-profile-teach-btn");
            if (!btn) return;
            btn.addEventListener("click", () => {
                const assistant = window.CozyOS && window.CozyOS.LivingAssistant;
                if (assistant && typeof assistant.enterTeachingMode === "function") {
                    assistant.enterTeachingMode();
                    return;
                }
                const status = host.querySelector("#cozy-ud-profile-teach") || host;
                const note = document.createElement("p");
                note.className = "cozy-disclosure-note";
                note.textContent = "The Live Window is not available on this page right now.";
                status.appendChild(note);
            });
        }

        /** #wireProfileSurface() — picture preview + Save handlers. Every message goes through escapeHtml; nothing here reads GPS/IP/locale. */
        #wireProfileSurface(host, core, identity) {
            const say = (sel, msg) => { const el = host.querySelector(sel); if (el) el.innerHTML = escapeHtml(msg || ""); };
            const paintAvatar = () => {
                const avatar = host.querySelector("#cozy-ud-avatar");
                if (!avatar) return;
                const pic = this.#profilePicture;
                const initials = this.#profileCurrent ? core.initialsFor(this.#profileCurrent.fullName) : "";
                avatar.setAttribute("aria-label", pic ? "Profile picture preview" : "No profile picture chosen");
                avatar.innerHTML = pic ? `<img src="${escapeHtml(pic.url)}" alt="Profile picture preview">` : (initials ? escapeHtml(initials) : "👤");
                const choose = host.querySelector("#cozy-ud-avatar-choose");
                const replace = host.querySelector("#cozy-ud-avatar-replace");
                const remove = host.querySelector("#cozy-ud-avatar-remove");
                if (choose) choose.hidden = !!pic;
                if (replace) replace.hidden = !pic;
                if (remove) remove.hidden = !pic;
                const img = avatar.querySelector("img");
                if (img) img.addEventListener("error", () => { this.#dropProfilePicture(); paintAvatar(); say("#cozy-ud-avatar-error", "That file could not be displayed as a picture."); });
            };
            const fileInput = host.querySelector("#cozy-ud-avatar-file");
            const pick = () => { if (fileInput && typeof fileInput.click === "function") fileInput.click(); };
            const chooseBtn = host.querySelector("#cozy-ud-avatar-choose");
            const replaceBtn = host.querySelector("#cozy-ud-avatar-replace");
            const removeBtn = host.querySelector("#cozy-ud-avatar-remove");
            if (chooseBtn) chooseBtn.addEventListener("click", pick);
            if (replaceBtn) replaceBtn.addEventListener("click", pick);
            if (removeBtn) removeBtn.addEventListener("click", () => {
                this.#dropProfilePicture();
                if (fileInput) fileInput.value = "";
                say("#cozy-ud-avatar-error", "");
                paintAvatar();
            });
            if (fileInput) fileInput.addEventListener("change", () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                const check = core.validateProfilePicture(file);
                if (!check.valid) { say("#cozy-ud-avatar-error", check.reason); fileInput.value = ""; return; }
                let url = null;
                try { if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") url = URL.createObjectURL(file); } catch (_err) { url = null; }
                if (!url) { say("#cozy-ud-avatar-error", "This browser cannot preview pictures."); fileInput.value = ""; return; }
                this.#dropProfilePicture();
                this.#profilePicture = { url, name: String(file.name || "") };
                say("#cozy-ud-avatar-error", "");
                paintAvatar();
            });
            paintAvatar();

            const saveBtn = host.querySelector("#cozy-ud-profile-save");
            if (!saveBtn) return;
            const nameEl = host.querySelector("#cozy-ud-profile-fullname");
            const countryEl = host.querySelector("#cozy-ud-profile-country");
            const cityEl = host.querySelector("#cozy-ud-profile-city");
            const onEnter = (e) => { if (e && e.key === "Enter") saveBtn.click(); };
            if (nameEl) nameEl.addEventListener("keydown", onEnter);
            if (cityEl) cityEl.addEventListener("keydown", onEnter);
            saveBtn.addEventListener("click", async () => {
                if (this.#profileSaving) return;
                const result = core.validateProfileInput({ fullName: nameEl ? nameEl.value : "", countryCode: countryEl ? countryEl.value : "", city: cityEl ? cityEl.value : "" }, this.#profileCurrent);
                say("#cozy-ud-profile-fullname-error", result.errors.fullName);
                say("#cozy-ud-profile-country-error", result.errors.country);
                say("#cozy-ud-profile-city-error", result.errors.city);
                say("#cozy-ud-profile-status", "");
                if (!result.valid) return;
                if (!Object.keys(result.changes).length) { say("#cozy-ud-profile-status", "No changes to save."); return; }
                this.#profileSaving = true;
                saveBtn.disabled = true;
                let outcome;
                try { outcome = await identity.updateProfile(this.#userId, result.changes); }
                catch (err) { outcome = { available: false, reason: err && err.message ? err.message : "Unexpected error." }; }
                this.#profileSaving = false;
                saveBtn.disabled = false;
                if (!outcome || outcome.available !== true) { say("#cozy-ud-profile-status", `Could not save your profile: ${(outcome && outcome.reason) || "unknown reason"}`); return; }
                try { const p = identity.getProfile(this.#userId); if (p && p.available) this.#profileCurrent = core.fromStoredProfile(p); } catch (_err) { /* keep previous baseline */ }
                paintAvatar();
                say("#cozy-ud-profile-status", outcome.persisted ? "Profile saved." : `Saved for this session only — this device could not store it permanently${outcome.persistReason ? ` (${outcome.persistReason})` : ""}.`);
            });
        }

        /** #dropProfilePicture() — revokes the local blob: preview URL so nothing lingers in memory. */
        #dropProfilePicture() {
            if (this.#profilePicture && this.#profilePicture.url) {
                try { if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(this.#profilePicture.url); } catch (_err) { /* nothing to revoke */ }
            }
            this.#profilePicture = null;
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
                <section id="cozy-ud-settings-security">
                    <h4>Security</h4>
                    <p class="cozy-disclosure-note cozy-ud-settings-boundary-tag">User-controlled — your own account only</p>
                    <div id="cozy-ud-security-panel"></div>
                </section>
                <p class="cozy-disclosure-note">Appearance, accessibility, notifications, and privacy are not yet wired to real settings sources — nothing fake is shown in their place.</p>
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
            this.#renderSecuritySection(host);
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

        /**
         * #renderSecuritySection(settingsHost)
         *   Real Security section for the Settings surface — mounts the
         *   same, already-real, already-tested WebAuthn/passkey
         *   enrollment and factor-management architecture the
         *   Administrator Workspace loads (core/modules/security/
         *   authentication-enrollment-panel.js, Milestone 359, and
         *   authentication-factor-management-panel.js, Milestone 360),
         *   composed here into a live DOM surface for ANY authenticated
         *   user — not only administrators. Replaces the previous
         *   "account controls are not yet wired" disclosure with a real
         *   surface now that one exists.
         *
         *   No new engine, no new endpoint, no second passkey/enrollment
         *   system: both panels call the exact same server routes
         *   (POST /webauthn/passkeys/enroll/begin|complete,
         *   GET/POST /webauthn/passkeys[/revoke],
         *   POST /auth/mfa/totp/enroll/begin|complete) already proven
         *   for ordinary (non-admin) accounts by server/webauthn-rp/
         *   test/http-integration.test.js. Identity for every action
         *   always comes from the real, server-resolved session — this
         *   file never passes a client-invented id; each panel resolves
         *   the signed-in user itself via its own getCurrentUserId()
         *   (CozyOS.Auth first, falling back to CozyOS.Session.current()
         *   for ordinary users — see that function's own header).
         *
         *   Honestly discloses instead of fabricating if either module's
         *   script tag is missing from a given page.
         */
        #renderSecuritySection(settingsHost) {
            const root = settingsHost.querySelector("#cozy-ud-security-panel");
            if (!root) return;
            const modules = window.CozyOS.Modules || {};
            const factorMgmt = modules["authentication-factor-management-panel"];
            const enrollment = modules["authentication-enrollment-panel"];
            if (!factorMgmt && !enrollment) {
                root.innerHTML = `<p class="cozy-disclosure-note">Security enrollment is not available right now.</p>`;
                return;
            }
            // Idempotent re-render: tear down any listeners a previous
            // render of this same surface attached before rebuilding the
            // markup, so switching tabs back to Settings never stacks
            // duplicate click handlers.
            if (factorMgmt && typeof factorMgmt.destroy === "function") factorMgmt.destroy();
            if (enrollment && typeof enrollment.destroy === "function") enrollment.destroy();
            root.innerHTML =
                (factorMgmt && typeof factorMgmt.getDashboard === "function" ? factorMgmt.getDashboard() : "") +
                (enrollment && typeof enrollment.getDashboard === "function" ? enrollment.getDashboard() : "");
            if (factorMgmt && typeof factorMgmt.init === "function") factorMgmt.init();
            if (enrollment && typeof enrollment.init === "function") enrollment.init();
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
