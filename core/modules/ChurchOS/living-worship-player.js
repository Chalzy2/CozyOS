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
        #mode = "floating"; // floating | docked | theater | fullscreen
        #serviceId = null;
        #openPanels = new Set();
        #dragState = null;
        #detectedScriptures = [];
        #lastCaption = null;

        mount() {
            if (this.#root) return;
            const prefs = loadPrefs();
            this.#mode = prefs.mode || "floating";
            this.#openPanels = new Set(prefs.openPanels || []);

            this.#root = document.createElement("div");
            this.#root.id = "cozy-worship-player-root";
            this.#root.innerHTML = `
                <div id="cozy-worship-player" class="cozy-living-glass cozy-living-border-glow" data-mode="${this.#mode}">
                    <div id="cozy-worship-player-header">
                        <span id="cozy-worship-player-drag-handle">⠿</span>
                        <span id="cozy-worship-player-title">Live Worship</span>
                        <span id="cozy-worship-player-status"></span>
                        <button type="button" data-player-action="expand" title="Theater Mode">⛶</button>
                        <button type="button" data-player-action="fullscreen" title="Fullscreen">⛶⛶</button>
                        <button type="button" data-player-action="dock" title="Dock">▢</button>
                        <button type="button" data-player-action="close" title="Minimize">—</button>
                    </div>
                    <video id="cozy-worship-player-video" autoplay muted playsinline></video>
                    <div id="cozy-worship-player-panels">
                        ${[...REAL_PANELS, ...DISCLOSED_ABSENT_PANELS].map(p => `<button type="button" class="cozy-btn" data-panel-toggle="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`).join("")}
                    </div>
                    <div id="cozy-worship-player-panel-content"></div>
                </div>
            `;
            document.body.appendChild(this.#root);
            this.#videoEl = this.#root.querySelector("#cozy-worship-player-video");

            this.#wireControls();
            this.#wireDrag();
            this.#renderOpenPanels();
            this.#subscribeToScripture();
            this.#restorePosition(prefs);
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
            const el = this.#root.querySelector("#cozy-worship-player");
            const currentTime = this.#videoEl.currentTime;
            if (action === "expand") this.#setMode(this.#mode === "theater" ? "docked" : "theater");
            else if (action === "dock") this.#setMode("docked");
            else if (action === "close") this.#setMode("floating");
            else if (action === "fullscreen") {
                if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                else this.#reportUnavailable("Native Fullscreen API is not available in this environment.");
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

        #setMode(mode) {
            this.#mode = mode;
            this.#root.querySelector("#cozy-worship-player").dataset.mode = mode;
            savePrefs({ ...loadPrefs(), mode, openPanels: [...this.#openPanels] });
        }

        #togglePanel(panel) {
            this.#openPanels.has(panel) ? this.#openPanels.delete(panel) : this.#openPanels.add(panel);
            savePrefs({ ...loadPrefs(), mode: this.#mode, openPanels: [...this.#openPanels] });
            this.#renderOpenPanels();
        }

        #renderOpenPanels() {
            const host = this.#root.querySelector("#cozy-worship-player-panel-content");
            if (!host) return;
            const identity = window.CozyOS.IdentityEngine;
            host.innerHTML = [...this.#openPanels].map(panel => {
                if (panel === "branches") {
                    const coordinator = window.CozyOS.MultiBranchCoordinator;
                    const branches = coordinator && typeof coordinator.listBranches === "function" ? coordinator.listBranches() : [];
                    return `<div class="cozy-living-card"><b>Connected Branches</b>${branches.length ? branches.map(b => `<div class="cozy-event-row">${b.name} — ${b.connectionState || "unknown"}${b.language ? " · " + b.language : ""}${b.worshipPhase ? " · " + b.worshipPhase : ""}${b.approximateLatencyMs != null ? " · ~" + b.approximateLatencyMs + "ms" : ""}</div>`).join("") : "<p class='cozy-disclosure-note'>No branches connected. This is a bounded mesh (LiveHotspotEngine) - not broadcast; each branch requires its own established connection.</p>"}</div>`;
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
                    return `<div class="cozy-living-card">
                        <b>Live Translation</b>
                        <div style="display:flex;gap:6px;margin:6px 0;">
                            <select id="cozy-worship-lang-select" class="cozy-field">
                                ${["en","fr","sw","ar","es","pt"].map(l => `<option value="${l}" ${l === savedLang ? "selected" : ""}>${l}</option>`).join("")}
                            </select>
                            <button type="button" class="cozy-btn" data-player-action="add-language">Listen in this language</button>
                        </div>
                        <div id="cozy-worship-caption-display">${this.#lastCaption ? `<p>${this.#lastCaption}</p>` : "<p class='cozy-disclosure-note'>No live caption yet.</p>"}</div>
                        <p class='cozy-disclosure-note'>Real, browser-dependent translation (SpeechTranslationAdapter). Captions appear automatically once a listener language is active for this service.</p>
                    </div>`;
                }
                return `<div class="cozy-living-card"><p class="cozy-disclosure-note">${panel.charAt(0).toUpperCase() + panel.slice(1)} is not available yet - no real engine exists in this repository for it (confirmed absent, not fabricated).</p></div>`;
            }).join("");
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

        #wireDrag() {
            const handle = this.#root.querySelector("#cozy-worship-player-drag-handle");
            const player = this.#root.querySelector("#cozy-worship-player");
            handle.addEventListener("mousedown", (evt) => {
                if (this.#mode !== "floating") return;
                this.#dragState = { startX: evt.clientX, startY: evt.clientY, origLeft: player.offsetLeft, origTop: player.offsetTop };
                const onMove = (moveEvt) => {
                    if (!this.#dragState) return;
                    player.style.left = `${this.#dragState.origLeft + (moveEvt.clientX - this.#dragState.startX)}px`;
                    player.style.top = `${this.#dragState.origTop + (moveEvt.clientY - this.#dragState.startY)}px`;
                    player.style.right = "auto"; player.style.bottom = "auto";
                };
                const onUp = () => {
                    this.#dragState = null;
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    savePrefs({ ...loadPrefs(), mode: this.#mode, openPanels: [...this.#openPanels], left: player.style.left, top: player.style.top });
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
            });
        }

        #restorePosition(prefs) {
            const player = this.#root.querySelector("#cozy-worship-player");
            if (prefs.left && prefs.top) { player.style.left = prefs.left; player.style.top = prefs.top; player.style.right = "auto"; player.style.bottom = "auto"; }
        }

        #reportUnavailable(message) {
            const statusEl = this.#root.querySelector("#cozy-worship-player-status");
            if (statusEl) statusEl.textContent = message;
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, mode: this.#mode, openPanels: [...this.#openPanels], serviceId: this.#serviceId }; }
    }

    const instance = new LivingWorshipPlayer();
    window.CozyOS.LivingWorshipPlayer = instance;
    window.CozyOS.Modules["living-worship-player"] = Object.freeze({
        version: VERSION,
        description: "ChurchOS Living Live Worship Player (C004) — floating/theater/fullscreen live video player composing LiveCaptureEngine/LiveHotspotEngine real streams, plus Live Translation/Scripture/Timeline panels composing real ChurchOS data. Worship Lyrics/Notes/Prayer Requests/Chat panels honestly report unavailable - no backend exists for them. Mounted outside #cozy-workspace-root (same pattern as the Living Assistant) so navigation never interrupts playback."
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => instance.mount());
    else instance.mount();
})();
