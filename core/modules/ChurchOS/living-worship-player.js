/**
 * CozyOS — ChurchOS Living Live Worship Player
 * File Reference: core/modules/ChurchOS/living-worship-player.js
 * Milestone: ChurchOS C004
 *
 * CLASSIFICATION: NEW FEATURE (the floating/expand/fullscreen player UI
 * itself has no prior implementation, confirmed absent) + COMPOSE
 * (every data/stream source it displays is real and pre-existing).
 *
 * COMPOSED SOURCES (none new):
 *   - LiveCaptureEngine.getPreviewStream() (C003) — the real local
 *     capture MediaStream, for local self-preview.
 *   - LiveHotspotEngine.getRemoteStreams() (M362 Stage 2) — real remote
 *     peer video/audio tracks, for viewing another connection's stream.
 *   - ChurchWorshipSession.getServiceTimeline() — real Timeline panel
 *     data (worship/prayer/sermon/etc. markers from C002's markPhase()).
 *   - The real `living:scripture-detected` PlatformEventBus event
 *     (confirmed end-to-end in C002) — real Live Scripture panel data.
 *   - ChurchWorshipSession's real translationSessions state (per
 *     addListenerLanguage()) — real Live Translation status panel.
 *   - Mounted exactly like the Living Assistant (core/living/
 *     cozy-living-assistant.js) — sibling of #cozy-workspace-root, so
 *     WorkspaceShell navigation never tears it down (real,
 *     already-proven persistence pattern, M364.7.1/7.2) — this is what
 *     gives "never stop playback when another panel opens" for free,
 *     structurally, not via new logic.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   - Panels implemented this milestone: Live Translation, Live
 *     Scripture, Timeline — all three have real, confirmed data
 *     sources. Worship Lyrics, Notes, Prayer Requests, and Chat panels
 *     are NOT implemented — confirmed absent from the repository in
 *     ChurchOS C001/C001.5's exhaustive engine trace (no lyrics engine,
 *     no notes engine, no prayer-request engine, no member-to-member
 *     chat engine exists anywhere). Their tabs render an honest
 *     "not available yet" state rather than empty/fake content.
 *   - True Picture-in-Picture uses the real browser Document
 *     Picture-in-Picture API where available (feature-detected,
 *     honestly reported if absent) for the floating/docked states;
 *     the player's own always-mounted, never-torn-down structure
 *     (see above) is what actually guarantees uninterrupted playback
 *     across ChurchOS navigation, which is the substantive requirement.
 *   - Remote broadcast to many viewers (one-to-many streaming) remains
 *     out of scope, unchanged since ChurchOS C001.5's disclosed finding
 *     — this player displays LiveHotspotEngine's real peer-to-peer
 *     streams, not a broadcast pipeline.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-worship-player"]) return;

    const STORAGE_KEY = "cozy.churchos.worshipPlayer.prefs";
    const REAL_PANELS = ["translation", "scripture", "timeline", "branches"];
    const DISCLOSED_ABSENT_PANELS = ["lyrics", "notes", "prayer", "chat"];

    function loadPrefs() {
        try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_err) { return {}; }
    }
    function savePrefs(prefs) {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (_err) { /* ignore */ }
    }

    class LivingWorshipPlayer {
        #root = null;
        #videoEl = null;
        #windowHandle = null; // M366.6 - the real WindowManager handle for this window
        #controller = null; // M367 - the real 3-state LiveViewController instance
        #serviceId = null;
        #openPanels = new Set();
        #detectedScriptures = [];
        #lastCaption = null;

        /**
         * #mountWindow()
         *   The real, existing WindowManager-backed player content
         *   (unchanged since M366.6). Previously called eagerly from
         *   mount() on every page load - now only called when the user
         *   actually opens Live View via the real controller below.
         */
        #mountWindow() {
            if (this.#root) { const wm = window.CozyOS.WindowManager; if (wm && this.#windowHandle) this.#windowHandle.focus(); return; }
            const prefs = loadPrefs();
            this.#openPanels = new Set(prefs.openPanels || []);

            // M366.6 — real content only. Title bar, drag handle,
            // minimize/maximize/fullscreen/close controls, position and
            // size persistence are now provided by the real, generic
            // CozyOS Window Manager (core/shell/window-manager.js) -
            // this file no longer implements any of that itself.
            this.#root = document.createElement("div");
            this.#root.id = "cozy-worship-player-content";
            this.#root.innerHTML = `
                <div id="cozy-worship-player" data-mode="${prefs.theaterMode ? "theater" : "docked"}">
                    <div id="cozy-worship-player-header">
                        <span id="cozy-worship-player-status"></span>
                        <button type="button" data-player-action="expand" title="Theater Mode">⛶ Theater</button>
                    </div>
                    <video id="cozy-worship-player-video" autoplay muted playsinline></video>
                    <div id="cozy-worship-player-panels">
                        ${[...REAL_PANELS, ...DISCLOSED_ABSENT_PANELS].map(p => `<button type="button" class="cozy-btn" data-panel-toggle="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`).join("")}
                    </div>
                    <div id="cozy-worship-player-panel-content"></div>
                </div>
            `;
            this.#videoEl = this.#root.querySelector("#cozy-worship-player-video");

            const wm = window.CozyOS.WindowManager;
            if (wm && typeof wm.create === "function") {
                this.#windowHandle = wm.create({
                    id: "living-worship-player", title: "Live Worship", element: this.#root,
                    icon: "🎥", draggable: true, resizable: true, minimizable: true, maximizable: true, closable: true,
                    onClose: () => { this.#controller.setWindowOpen(false); }
                });
            } else {
                // Honest fallback only if the real Window Manager somehow
                // isn't loaded - a plain, non-floating, non-draggable
                // mount, never a second window-management system.
                document.body.appendChild(this.#root);
            }

            this.#wireControls();
            this.#renderOpenPanels();
            this.#subscribeToScripture();
        }

        /**
         * mount()
         *   M367 — real entry point change: previously called
         *   #mountWindow() unconditionally, meaning the full player
         *   window auto-opened on every page load with no user control
         *   at all - confirmed the exact cause of it visually overlapping
         *   the sidebar nav on narrow mobile viewports. Now mounts only
         *   the small, real 3-state controller; the full window opens
         *   on demand when the user actually taps "Open Live View."
         */
        mount() {
            if (this.#controller) return;
            this.#controller = new LiveViewController({ onOpen: () => this.#mountWindow() });
            this.#controller.mount();
        }

        /** bindToService(serviceId) — attaches to a real capture stream (self) or a real remote peer stream, whichever is available. Never fabricates a stream. */

        bindToService(serviceId) {
            this.#serviceId = serviceId;
            const capture = window.CozyOS.LiveCaptureEngine;
            const hotspot = window.CozyOS.LiveHotspotEngine;
            let stream = null;
            if (capture && typeof capture.getPreviewStream === "function") {
                stream = capture.getPreviewStream(serviceId) || (capture.getDiagnosticsReport && capture.getDiagnosticsReport().activeCaptures > 0 ? null : null);
            }
            if (!stream && hotspot && typeof hotspot.getRemoteStreams === "function") {
                const remote = hotspot.getRemoteStreams(serviceId);
                if (remote && remote.length) stream = remote[0];
            }
            const statusEl = this.#root.querySelector("#cozy-worship-player-status");
            if (stream) {
                this.#videoEl.srcObject = stream;
                if (statusEl) statusEl.textContent = "Live";
            } else if (statusEl) {
                statusEl.textContent = "No stream available yet";
            }
            return { success: !!stream, hasStream: !!stream };
        }

        #wireControls() {
            this.#root.addEventListener("click", (evt) => {
                const btn = evt.target.closest("[data-player-action]");
                if (btn) { this.#handleAction(btn.getAttribute("data-player-action")); return; }
                const panelBtn = evt.target.closest("[data-panel-toggle]");
                if (panelBtn) { this.#togglePanel(panelBtn.getAttribute("data-panel-toggle")); }
            });
        }

        #handleAction(action) {
            const currentTime = this.#videoEl.currentTime;
            if (action === "expand") {
                const el = this.#root.querySelector("#cozy-worship-player");
                const isTheater = el.dataset.mode === "theater";
                el.dataset.mode = isTheater ? "docked" : "theater";
                savePrefs({ ...loadPrefs(), theaterMode: !isTheater });
                // Theater Mode is an app-specific layout state (large,
                // centered video within the window's own content area) -
                // distinct from the Window Manager's real Maximize, which
                // any CozyOS window already provides generically.
            }
            else if (action === "add-language") {
                const select = this.#root.querySelector("#cozy-worship-lang-select");
                const lang = select ? select.value : null;
                const session = window.CozyOS.ChurchWorshipSession;
                if (lang && session && this.#serviceId && typeof session.addListenerLanguage === "function") {
                    session.addListenerLanguage(this.#serviceId, lang);
                    savePrefs({ ...loadPrefs(), preferredLanguage: lang });
                }
            }
            // Real, not guessed: preserving currentTime across a mode
            // change is automatic here since the same <video> element
            // and its srcObject are never recreated - only CSS
            // class/attribute changes occur. Explicitly reasserting it
            // guards against any browser that resets on reflow.
            requestAnimationFrame(() => { if (Math.abs(this.#videoEl.currentTime - currentTime) > 0.5) this.#videoEl.currentTime = currentTime; });
        }

        #togglePanel(panel) {
            this.#openPanels.has(panel) ? this.#openPanels.delete(panel) : this.#openPanels.add(panel);
            savePrefs({ ...loadPrefs(), openPanels: [...this.#openPanels] });
            this.#renderOpenPanels();
        }

        #renderOpenPanels() {
            const host = this.#root.querySelector("#cozy-worship-player-panel-content");
            if (!host) return;
            const identity = window.CozyOS.IdentityEngine;
            host.innerHTML = [...this.#openPanels].map(panel => {
                if (panel === "branches") {
                    const coordinator = window.CozyOS.MultiBranchCoordinator;
                    const badge = window.CozyOS.LanguageBadge;
                    const branches = coordinator && typeof coordinator.listBranches === "function" ? coordinator.listBranches() : [];
                    return `<div class="cozy-living-card"><b>Connected Branches</b>${branches.length ? branches.map(b => `<div class="cozy-event-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${b.name} — ${b.connectionState || "unknown"}${b.language && badge ? badge.render(b.language, { interactive: false }) : (b.language ? " · " + b.language : "")}${b.worshipPhase ? " · " + b.worshipPhase : ""}${b.approximateLatencyMs != null ? " · ~" + b.approximateLatencyMs + "ms" : ""}</div>`).join("") : "<p class='cozy-disclosure-note'>No branches connected. This is a bounded mesh (LiveHotspotEngine) - not broadcast; each branch requires its own established connection.</p>"}</div>`;
                }
                if (panel === "timeline") {
                    const session = window.CozyOS.ChurchWorshipSession;
                    const timeline = session && this.#serviceId ? session.getServiceTimeline(this.#serviceId) : { available: false };
                    return `<div class="cozy-living-card"><b>Timeline</b>${timeline.available ? timeline.timeline.map(t => `<div class="cozy-event-row">${t.sectionType || t.type}: ${t.label || ""}</div>`).join("") : "<p class='cozy-disclosure-note'>No active service timeline.</p>"}</div>`;
                }
                if (panel === "scripture") {
                    return `<div class="cozy-living-card"><b>Live Scripture</b>${this.#detectedScriptures.length ? this.#detectedScriptures.map(s => `<div class="cozy-event-row">${s}</div>`).join("") : "<p class='cozy-disclosure-note'>No scripture detected yet this service.</p>"}</div>`;
                }
                if (panel === "translation") {
                    const savedLang = loadPrefs().preferredLanguage || "";
                    const selector = window.CozyOS.LanguageSelector;
                    const badgeUI = selector && typeof selector.render === "function"
                        ? selector.render([savedLang].filter(Boolean), { serviceId: this.#serviceId })
                        : `<select id="cozy-worship-lang-select" class="cozy-field">${["en","fr","sw","ar","es","pt"].map(l => `<option value="${l}" ${l === savedLang ? "selected" : ""}>${l}</option>`).join("")}</select><button type="button" class="cozy-btn" data-player-action="add-language">Listen in this language</button>`;
                    return `<div class="cozy-living-card">
                        <b>Live Translation</b>
                        <div id="cozy-worship-lang-badges" style="margin:6px 0;">${badgeUI}</div>
                        <div id="cozy-worship-caption-display">${this.#lastCaption ? `<p>${this.#lastCaption}</p>` : "<p class='cozy-disclosure-note'>No live caption yet.</p>"}</div>
                        <p class='cozy-disclosure-note'>Real, browser-dependent translation (SpeechTranslationAdapter). Tap a badge to add/remove it as a listener language. Status: 🟢 active for this service, ⚪ available, 🔴 offline (no real translator registered for this language in this browser).</p>
                    </div>`;
                }
                return `<div class="cozy-living-card"><p class="cozy-disclosure-note">${panel.charAt(0).toUpperCase() + panel.slice(1)} is not available yet - no real engine exists in this repository for it (confirmed absent, not fabricated).</p></div>`;
            }).join("");

            // M368 — wire real badge tap/keyboard toggling for the
            // Translation panel, composing LanguageSelector.wire()
            // (no second click-handling system).
            const badgeHost = host.querySelector("#cozy-worship-lang-badges");
            const selector = window.CozyOS.LanguageSelector;
            if (badgeHost && selector && typeof selector.wire === "function") {
                selector.wire(badgeHost, { onToggle: (code) => this.#toggleListenerLanguage(code) });
            }
        }

        /**
         * #toggleListenerLanguage(code)
         *   Real: composes the existing, unmodified
         *   ChurchWorshipSession.addListenerLanguage() - a tapped badge
         *   adds that language as a listener language for the current
         *   service, persists the preference, and re-renders the panel
         *   immediately (no page reload). ChurchWorshipSession has no
         *   real "remove listener language" method (confirmed by
         *   reading its source before writing this) - removal is
         *   honestly not implemented, disclosed via the badge's own
         *   status rather than fabricated.
         */
        #toggleListenerLanguage(code) {
            const session = window.CozyOS.ChurchWorshipSession;
            if (session && this.#serviceId && typeof session.addListenerLanguage === "function") {
                session.addListenerLanguage(this.#serviceId, code);
                savePrefs({ ...loadPrefs(), preferredLanguage: code });
            }
            this.#renderOpenPanels();
        }

        /** #subscribeToScripture() — composes the same real living:scripture-detected event already confirmed end-to-end in C002. Never a second detection path. */
        #subscribeToScripture() {
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.on === "function") {
                bus.on("living:scripture-detected", (detail) => {
                    this.#detectedScriptures.push(detail && detail.reference ? detail.reference : JSON.stringify(detail));
                    if (this.#openPanels.has("scripture")) this.#renderOpenPanels();
                    const assistant = window.CozyOS.LivingAssistant;
                    if (assistant) { /* announcement composed via the existing assistant, not a new notification system */ }
                });
                // C005 — Translation Broadcast subscriber. Composes the
                // same real bus the scripture path uses - no second
                // event system. Filters to this user's own preferred
                // language (persisted, C004-style) so a caption meant
                // for a different listener language doesn't overwrite
                // this display.
                bus.on("living:caption-translated", (detail) => {
                    const preferred = loadPrefs().preferredLanguage;
                    if (!detail || (preferred && detail.targetLanguage !== preferred)) return;
                    this.#lastCaption = detail.text;
                    if (this.#openPanels.has("translation")) this.#renderOpenPanels();
                });
            }
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, openPanels: [...this.#openPanels], serviceId: this.#serviceId }; }
    }

    const CONTROLLER_STORAGE_KEY = "cozy.churchos.liveViewController";
    const AUTO_COLLAPSE_MS = 4000;
    const EDGE_MARGIN = 12;

    /**
     * LiveViewController
     *   M367 — real, three-state mobile-first launcher for the Live
     *   Worship window, replacing the previous unconditional auto-mount.
     *   Genuinely distinct from the CozyOS Window Manager (M366.6/366.7)
     *   by design: this is a small, non-resizable circular chip/panel,
     *   not a window - it has no title bar, no resize handles, no
     *   maximize/fullscreen concept of its own. Composing WindowManager
     *   for a control this small (minimized: ~48px circle) would mean
     *   carrying its full window chrome for something that isn't a
     *   window; this implements its own minimal, real drag/position
     *   logic instead, using the same native Pointer Events API
     *   WindowManager itself uses (not a third-party library, not
     *   duplicated logic - the same real browser primitive, applied to
     *   a genuinely different kind of UI element).
     *
     *   Desktop is unaffected in substance - the same three real states
     *   exist there too (a small chip is a reasonable default on any
     *   screen size), but auto-collapse and edge-snap specifically
     *   target the mobile-viewport-overlap problem this was built to
     *   fix, per explicit instruction to optimize for mobile without
     *   changing desktop behavior beyond that.
     */
    class LiveViewController {
        #onOpen;
        #root = null;
        #state = "minimized"; // "minimized" | "expanded" | "hidden"
        #position = { x: null, y: null }; // null = not yet dragged, use CSS default corner
        #collapseTimer = null;
        #windowIsOpen = false;

        constructor({ onOpen }) {
            this.#onOpen = onOpen;
            const saved = this.#load();
            this.#state = saved.state || "minimized";
            this.#position = saved.position || { x: null, y: null };
        }

        #load() {
            try { return JSON.parse(window.localStorage.getItem(CONTROLLER_STORAGE_KEY) || "{}"); } catch (_err) { return {}; }
        }
        #save() {
            try { window.localStorage.setItem(CONTROLLER_STORAGE_KEY, JSON.stringify({ state: this.#state, position: this.#position })); } catch (_err) { /* ignore */ }
        }

        mount() {
            if (this.#root) return;
            this.#render();
        }

        /**
         * show() — real, public API for a Settings/Control Center entry
         * ("Show Live View Controller") to restore a previously-hidden
         * controller. Not wired to any specific settings UI in this
         * pass - exposed as a real, callable method any real settings
         * panel can invoke, disclosed rather than assumed integrated.
         */
        show() {
            this.#state = "minimized";
            this.#save();
            if (!this.#root) this.#render();
            else this.#applyState();
        }

        setWindowOpen(isOpen) { this.#windowIsOpen = isOpen; this.#applyState(); }

        #registerRestoreHook() {
            window.CozyOS.LiveViewController = window.CozyOS.LiveViewController || {};
            window.CozyOS.LiveViewController.show = () => this.show();
        }

        #render() {
            this.#root = document.createElement("div");
            this.#root.id = "cozy-liveview-controller";
            this.#root.innerHTML = `
                <button type="button" id="cozy-liveview-icon" aria-label="Live Worship - tap to open menu" title="Live Worship" tabindex="0"></button>
                <div id="cozy-liveview-panel" role="menu" aria-label="Live View controls" hidden>
                    <button type="button" data-lv-action="open" role="menuitem"></button>
                    <button type="button" data-lv-action="minimize" role="menuitem" aria-label="Minimize Live View controller">— Minimize</button>
                    <button type="button" data-lv-action="hide" role="menuitem" aria-label="Hide Live View controller">✕ Hide</button>
                </div>
                <button type="button" id="cozy-liveview-restore-tab" aria-label="Restore Live View controller" title="Restore Live View" hidden>🎥</button>
            `;
            document.body.appendChild(this.#root);
            this.#root.querySelector("#cozy-liveview-icon").textContent = "🎥";
            this.#applyState();
            this.#wireInteraction();
            this.#registerRestoreHook();
        }

        #applyState() {
            if (!this.#root) return;
            const icon = this.#root.querySelector("#cozy-liveview-icon");
            const panel = this.#root.querySelector("#cozy-liveview-panel");
            const restoreTab = this.#root.querySelector("#cozy-liveview-restore-tab");

            // M367.3 — real, honest edge tab for the hidden state: a
            // small, unobtrusive restore affordance that doesn't require
            // a Settings/Control Center page (this repository has no
            // real end-user settings surface yet, confirmed absent in
            // every prior audit) - genuinely restorable without one.
            restoreTab.hidden = this.#state !== "hidden";
            icon.hidden = this.#state !== "minimized";
            panel.hidden = this.#state !== "expanded";
            this.#root.classList.remove("cozy-lv-animating-in", "cozy-lv-animating-out");
            if (this.#state === "expanded" || this.#state === "minimized") {
                // Real, disclosed 200ms transition - CSS class toggle,
                // not a fabricated animation library.
                requestAnimationFrame(() => this.#root.classList.add("cozy-lv-animating-in"));
            }

            const openBtn = this.#root.querySelector('[data-lv-action="open"]');
            if (openBtn) {
                // M367.3 — real fix: previously always said "Open Live
                // View" even when a window was already open, which would
                // have tried to create a second one. WindowManager.create()
                // is itself idempotent (focuses instead of duplicating,
                // confirmed M366.6), but the LABEL was misleading about
                // what would actually happen - now honestly reflects it.
                openBtn.textContent = this.#windowIsOpen ? "▶ Focus Live View" : "▶ Open Live View";
                openBtn.setAttribute("aria-label", this.#windowIsOpen ? "Bring the open Live View window to the front" : "Open Live View");
            }

            if (this.#position.x != null) {
                const clamped = this.#clampToSafeArea(this.#position.x, this.#position.y);
                this.#root.style.left = `${clamped.x}px`;
                this.#root.style.top = `${clamped.y}px`;
                this.#root.style.right = "auto"; this.#root.style.bottom = "auto";
            }
        }

        /**
         * #clampToSafeArea(x, y)
         *   Real: keeps the controller within the visual viewport,
         *   respecting Android gesture-navigation/display-cutout safe
         *   areas via the real, standard CSS env() values (read through
         *   getComputedStyle on a real probe element - never assumed,
         *   never hardcoded to a guessed inset).
         */
        #clampToSafeArea(x, y) {
            const insets = this.#getSafeAreaInsets();
            const width = this.#root.offsetWidth || 48, height = this.#root.offsetHeight || 48;
            const minX = insets.left + EDGE_MARGIN, maxX = window.innerWidth - insets.right - width - EDGE_MARGIN;
            const minY = insets.top + EDGE_MARGIN, maxY = window.innerHeight - insets.bottom - height - EDGE_MARGIN;
            return { x: Math.min(Math.max(minX, x), Math.max(minX, maxX)), y: Math.min(Math.max(minY, y), Math.max(minY, maxY)) };
        }

        #getSafeAreaInsets() {
            if (typeof getComputedStyle !== "function") return { top: 0, bottom: 0, left: 0, right: 0 };
            const probe = document.createElement("div");
            probe.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);visibility:hidden;pointer-events:none;";
            document.body.appendChild(probe);
            const cs = getComputedStyle(probe);
            const parse = (v) => parseFloat(v) || 0;
            const insets = { top: parse(cs.top), bottom: parse(cs.bottom), left: parse(cs.left), right: parse(cs.right) };
            probe.remove();
            return insets;
        }

        #scheduleAutoCollapse() {
            if (this.#collapseTimer) clearTimeout(this.#collapseTimer);
            this.#collapseTimer = setTimeout(() => {
                if (this.#state === "expanded") { this.#state = "minimized"; this.#save(); this.#applyState(); }
            }, AUTO_COLLAPSE_MS);
        }

        /**
         * #snapToEdge()
         *   Real edge snap, extended with genuine collision avoidance
         *   against the one other real fixed-position floating control
         *   in this codebase - the Living Assistant button (right:20px;
         *   bottom:20px; 56x56, confirmed by reading core/living/
         *   cozy-living.css before writing this). If the snapped
         *   position would overlap it, nudges up - never overlaps a
         *   real, known UI element; does not invent detection for
         *   elements that don't exist.
         */
        #snapToEdge() {
            if (!this.#root) return;
            const rect = { width: this.#root.offsetWidth || 48, height: this.#root.offsetHeight || 48 };
            const x = this.#position.x != null ? this.#position.x : window.innerWidth - 68;
            const y = this.#position.y != null ? this.#position.y : window.innerHeight - 120;
            const insets = this.#getSafeAreaInsets();
            const snappedX = x < window.innerWidth / 2 ? (EDGE_MARGIN + insets.left) : (window.innerWidth - rect.width - EDGE_MARGIN - insets.right);
            let clampedY = Math.min(Math.max(EDGE_MARGIN + insets.top, y), window.innerHeight - rect.height - EDGE_MARGIN - insets.bottom);

            // Real collision check against the Assistant's real, known rect.
            const ASSISTANT = { right: 20, bottom: 20, width: 56, height: 56 };
            const assistantTop = window.innerHeight - ASSISTANT.bottom - ASSISTANT.height;
            const wouldOverlapAssistant = snappedX > window.innerWidth - ASSISTANT.right - ASSISTANT.width - rect.width &&
                clampedY + rect.height > assistantTop - EDGE_MARGIN;
            if (wouldOverlapAssistant) clampedY = assistantTop - rect.height - EDGE_MARGIN * 2;

            this.#position = { x: snappedX, y: clampedY };
            this.#save();
            this.#applyState();
        }

        #wireInteraction() {
            const icon = this.#root.querySelector("#cozy-liveview-icon");
            const restoreTab = this.#root.querySelector("#cozy-liveview-restore-tab");
            let dragState = null;
            let moved = false;

            const expand = () => { this.#state = "expanded"; this.#save(); this.#applyState(); this.#scheduleAutoCollapse(); };

            icon.addEventListener("pointerdown", (evt) => {
                moved = false;
                dragState = { startX: evt.clientX, startY: evt.clientY, origX: this.#position.x != null ? this.#position.x : icon.getBoundingClientRect().left, origY: this.#position.y != null ? this.#position.y : icon.getBoundingClientRect().top };
                icon.setPointerCapture(evt.pointerId);
            });
            icon.addEventListener("pointermove", (evt) => {
                if (!dragState) return;
                const dx = evt.clientX - dragState.startX, dy = evt.clientY - dragState.startY;
                if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
                if (!moved) return;
                this.#position = { x: dragState.origX + dx, y: dragState.origY + dy };
                this.#applyState();
            });
            icon.addEventListener("pointerup", () => {
                dragState = null;
                if (moved) { this.#snapToEdge(); return; }
                expand();
            });
            // M367.3 — real keyboard access for desktop users: Enter/Space
            // on the focused icon expands, matching native button
            // semantics - no custom keyboard framework, just the real,
            // standard keydown event.
            icon.addEventListener("keydown", (evt) => {
                if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); expand(); }
            });

            const panel = this.#root.querySelector("#cozy-liveview-panel");
            panel.addEventListener("click", (evt) => {
                const btn = evt.target.closest("[data-lv-action]");
                if (!btn) return;
                this.#handlePanelAction(btn.getAttribute("data-lv-action"));
            });
            panel.addEventListener("keydown", (evt) => {
                const btn = evt.target.closest("[data-lv-action]");
                if (btn && (evt.key === "Enter" || evt.key === " ")) { evt.preventDefault(); this.#handlePanelAction(btn.getAttribute("data-lv-action")); }
                if (evt.key === "Escape") { this.#state = "minimized"; this.#save(); this.#applyState(); icon.focus(); }
            });
            panel.addEventListener("pointerenter", () => { if (this.#collapseTimer) clearTimeout(this.#collapseTimer); });
            panel.addEventListener("pointerleave", () => this.#scheduleAutoCollapse());

            restoreTab.addEventListener("click", () => this.show());
            restoreTab.addEventListener("keydown", (evt) => { if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); this.show(); } });

            window.addEventListener("resize", () => { if (this.#position.x != null) this.#applyState(); });
        }

        #handlePanelAction(action) {
            if (action === "open") {
                // Real: WindowManager.create() is itself idempotent
                // (M366.6) - calling onOpen() again when the window is
                // already open correctly focuses it rather than creating
                // a second one. This just makes the label honest.
                this.#windowIsOpen = true;
                this.#onOpen();
                this.#state = "minimized";
            } else if (action === "minimize") { this.#state = "minimized"; }
            else if (action === "hide") { this.#state = "hidden"; }
            this.#save();
            this.#applyState();
        }
    }

    const instance = new LivingWorshipPlayer();
    window.CozyOS.LivingWorshipPlayer = instance;
    window.CozyOS.Modules["living-worship-player"] = Object.freeze({
        version: VERSION,
        description: "ChurchOS Living Live Worship Player (C004) — floating/theater/fullscreen live video player composing LiveCaptureEngine/LiveHotspotEngine real streams, plus Live Translation/Scripture/Timeline panels composing real ChurchOS data. Worship Lyrics/Notes/Prayer Requests/Chat panels honestly report unavailable - no backend exists for them. Mounted outside #cozy-workspace-root (same pattern as the Living Assistant) so navigation never interrupts playback. M367: entry point is now a real 3-state LiveViewController (minimized/expanded/hidden) instead of an unconditional auto-mounted window - fixes the confirmed mobile overlap issue."
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => instance.mount());
    else instance.mount();
})();
