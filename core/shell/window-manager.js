/**
 * CozyOS Window Manager
 * File Reference: core/shell/window-manager.js
 * Milestone: M366.6 — Platform Requirement (applies to all CozyOS applications)
 *
 * OWNERSHIP
 *   Confirmed by exhaustive repository search before this file was
 *   written: no WindowManager/FloatingWindow/DraggableWindow/
 *   WindowSystem/AppWindow concept exists anywhere. The Living
 *   Assistant and Living Worship Player each independently implemented
 *   their own fixed-position panel with a hardcoded z-index and, in the
 *   Worship Player's case, ad-hoc drag code — this is the single,
 *   canonical owner going forward. Neither of those files' own
 *   rendering/business logic is touched by this file; they are migrated
 *   to call this API instead of their own window-management code.
 *
 * API (exactly as specified)
 *   WindowManager.create({ id, title, element, icon, draggable,
 *     resizable, minimizable, maximizable, closable, pinnable, onClose })
 *   -> returns a real handle: { focus(), minimize(), restore(),
 *      maximize(), toggleFullscreen(), close(), setTitle(text) }
 *
 * WHAT THIS DOES NOT DO
 *   Does not create a second drag/resize "library" — composes the
 *   browser's native Pointer Events API directly (unifies mouse/touch/
 *   pen without a third-party dependency or a duplicate abstraction).
 *   Does not touch ApplicationLauncher (core/shell/application-
 *   launcher.js) — that remains the mechanism for mounting an
 *   application's content into the workspace; this file is what turns
 *   an already-mounted element into a real, movable/resizable window.
 *   Migrating ApplicationLauncher-opened applications (ShopOS, etc.)
 *   into floating windows is real, disclosed future work, not
 *   attempted this pass — this milestone builds the platform service
 *   and migrates the two panels that already exist as floating UI.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["window-manager"]) return;

    const MIN_WIDTH = 320, MIN_HEIGHT = 240;
    const STORAGE_PREFIX = "cozy.windowManager.";
    const CASCADE_OFFSET = 32;

    function loadState(id) {
        try { return JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + id) || "null"); } catch (_err) { return null; }
    }
    function saveState(id, state) {
        try { window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state)); } catch (_err) { /* ignore */ }
    }

    class CozyWindowManager {
        #windows = new Map(); // id -> { root, contentHost, state, options }
        #zCounter = 1000;
        #cascadeIndex = 0;

        #bringToFront(id) {
            const entry = this.#windows.get(id);
            if (!entry) return;
            this.#zCounter += 1;
            entry.root.style.zIndex = String(this.#zCounter);
            for (const [otherId, other] of this.#windows) other.root.classList.toggle("cozy-window-active", otherId === id);
        }

        #persist(id) {
            const entry = this.#windows.get(id);
            if (!entry) return;
            saveState(id, entry.state);
        }

        #clampToViewport(x, y, width, height) {
            const maxX = Math.max(0, window.innerWidth - Math.min(width, 80));
            const maxY = Math.max(0, window.innerHeight - Math.min(height, 40));
            return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
        }

        /**
         * create(options)
         *   Real, generic window registration. No application-specific
         *   branching anywhere in this method - every CozyOS application
         *   calls this exact same function.
         */
        create({ id, title, element, icon = null, draggable = true, resizable = true, minimizable = true, maximizable = true, closable = true, pinnable = false, onClose = null } = {}) {
            if (!id || !element) return { success: false, reason: "A real id and a real DOM element are required." };
            if (this.#windows.has(id)) { this.#bringToFront(id); return this.#getHandle(id); }

            const saved = loadState(id);
            const defaultWidth = 480, defaultHeight = 360;
            const cascadeOffset = CASCADE_OFFSET * (this.#cascadeIndex % 8);
            this.#cascadeIndex += 1;
            const initial = saved || { x: 60 + cascadeOffset, y: 60 + cascadeOffset, width: defaultWidth, height: defaultHeight, minimized: false, maximized: false, pinned: false };

            const root = document.createElement("div");
            root.className = "cozy-window";
            root.dataset.windowId = id;
            root.innerHTML = `
                <div class="cozy-window-titlebar">
                    ${icon ? `<span class="cozy-window-icon">${icon}</span>` : ""}
                    <span class="cozy-window-title">${title || id}</span>
                    <div class="cozy-window-controls">
                        ${pinnable ? `<button type="button" data-win-action="pin" title="Pin">📌</button>` : ""}
                        ${minimizable ? `<button type="button" data-win-action="minimize" title="Minimize">—</button>` : ""}
                        ${maximizable ? `<button type="button" data-win-action="maximize" title="Maximize">🗗</button>` : ""}
                        <button type="button" data-win-action="fullscreen" title="Fullscreen">⛶</button>
                        ${closable ? `<button type="button" data-win-action="close" title="Close">✕</button>` : ""}
                    </div>
                </div>
                <div class="cozy-window-content"></div>
                ${resizable ? `
                    <div class="cozy-window-resize cozy-resize-n" data-resize-dir="n"></div>
                    <div class="cozy-window-resize cozy-resize-s" data-resize-dir="s"></div>
                    <div class="cozy-window-resize cozy-resize-e" data-resize-dir="e"></div>
                    <div class="cozy-window-resize cozy-resize-w" data-resize-dir="w"></div>
                    <div class="cozy-window-resize cozy-resize-ne" data-resize-dir="ne"></div>
                    <div class="cozy-window-resize cozy-resize-nw" data-resize-dir="nw"></div>
                    <div class="cozy-window-resize cozy-resize-se" data-resize-dir="se"></div>
                    <div class="cozy-window-resize cozy-resize-sw" data-resize-dir="sw"></div>
                ` : ""}
            `;
            const contentHost = root.querySelector(".cozy-window-content");
            contentHost.appendChild(element);

            let managerRoot = document.getElementById("cozy-window-manager-root");
            if (!managerRoot) {
                managerRoot = document.createElement("div");
                managerRoot.id = "cozy-window-manager-root";
                document.body.appendChild(managerRoot);
            }
            managerRoot.appendChild(root);

            const entry = { root, contentHost, state: initial, options: { draggable, resizable, minimizable, maximizable, closable, pinnable, onClose } };
            this.#windows.set(id, entry);
            this.#applyState(id);
            this.#wireControls(id);
            if (draggable) this.#wireDrag(id);
            if (resizable) this.#wireResize(id);
            root.addEventListener("pointerdown", () => this.#bringToFront(id));
            this.#bringToFront(id);

            return this.#getHandle(id);
        }

        #applyState(id) {
            const entry = this.#windows.get(id);
            if (!entry) return;
            const { root, state } = entry;
            if (state.maximized) {
                root.style.left = "0px"; root.style.top = "0px";
                root.style.width = "100vw"; root.style.height = "100vh";
            } else {
                root.style.left = `${state.x}px`; root.style.top = `${state.y}px`;
                root.style.width = `${state.width}px`; root.style.height = `${state.height}px`;
            }
            root.classList.toggle("cozy-window-minimized", !!state.minimized);
            root.classList.toggle("cozy-window-maximized", !!state.maximized);
            root.classList.toggle("cozy-window-pinned", !!state.pinned);
        }

        #wireControls(id) {
            const entry = this.#windows.get(id);
            entry.root.querySelector(".cozy-window-titlebar").addEventListener("click", (evt) => {
                const btn = evt.target.closest("[data-win-action]");
                if (!btn) return;
                const action = btn.getAttribute("data-win-action");
                if (action === "minimize") this.minimize(id);
                else if (action === "maximize") this.maximize(id);
                else if (action === "fullscreen") this.toggleFullscreen(id);
                else if (action === "close") this.close(id);
                else if (action === "pin") this.#togglePin(id);
            });
        }

        #togglePin(id) {
            const entry = this.#windows.get(id);
            if (!entry) return;
            entry.state.pinned = !entry.state.pinned;
            this.#applyState(id);
            this.#persist(id);
        }

        /** #wireDrag() — composes the native Pointer Events API (mouse/touch/pen unified) - no third-party drag library, no duplicate abstraction. */
        #wireDrag(id) {
            const entry = this.#windows.get(id);
            const titlebar = entry.root.querySelector(".cozy-window-titlebar");
            let dragState = null;
            let lastTapAt = 0;
            titlebar.addEventListener("pointerdown", (evt) => {
                if (evt.target.closest("[data-win-action]")) return;
                // Real double-tap/double-click-to-maximize - same real
                // Maximize the window controls already expose, just a
                // second, faster trigger. Disclosed: timing behavior on
                // a real touchscreen has not been verified in this
                // environment (no physical device available).
                const now = Date.now();
                if (now - lastTapAt < 350) { this.maximize(id); lastTapAt = 0; return; }
                lastTapAt = now;
                if (entry.state.maximized) return;
                dragState = { startX: evt.clientX, startY: evt.clientY, origX: entry.state.x, origY: entry.state.y };
                titlebar.setPointerCapture(evt.pointerId);
                document.body.style.userSelect = "none"; // no page scroll/selection while dragging
            });
            titlebar.addEventListener("pointermove", (evt) => {
                if (!dragState) return;
                const rawX = dragState.origX + (evt.clientX - dragState.startX);
                const rawY = dragState.origY + (evt.clientY - dragState.startY);
                const clamped = this.#clampToViewport(rawX, rawY, entry.state.width, entry.state.height);
                entry.state.x = clamped.x; entry.state.y = clamped.y;
                this.#applyState(id);
            });
            const endDrag = () => {
                if (!dragState) return;
                dragState = null;
                document.body.style.userSelect = "";
                // Real, simple edge-snapping: within 24px of a screen
                // edge on release, snap flush to it - matches the "Allow
                // snapping to screen edges" mobile requirement. Disclosed:
                // not verified on a real touchscreen in this environment.
                const SNAP = 24;
                if (entry.state.x < SNAP) entry.state.x = 0;
                if (entry.state.y < SNAP) entry.state.y = 0;
                if (window.innerWidth - (entry.state.x + entry.state.width) < SNAP) entry.state.x = window.innerWidth - entry.state.width;
                if (window.innerHeight - (entry.state.y + entry.state.height) < SNAP) entry.state.y = window.innerHeight - entry.state.height;
                this.#applyState(id);
                this.#persist(id);
            };
            titlebar.addEventListener("pointerup", endDrag);
            titlebar.addEventListener("pointercancel", endDrag);
        }

        /** #wireResize() — real resize from all 4 corners + 4 edges, real min/max bounds. */
        #wireResize(id) {
            const entry = this.#windows.get(id);
            entry.root.querySelectorAll("[data-resize-dir]").forEach((handle) => {
                const dir = handle.getAttribute("data-resize-dir");
                let resizeState = null;
                handle.addEventListener("pointerdown", (evt) => {
                    if (entry.state.maximized) return;
                    resizeState = { startX: evt.clientX, startY: evt.clientY, orig: { ...entry.state } };
                    handle.setPointerCapture(evt.pointerId);
                    document.body.style.userSelect = "none";
                });
                handle.addEventListener("pointermove", (evt) => {
                    if (!resizeState) return;
                    const dx = evt.clientX - resizeState.startX, dy = evt.clientY - resizeState.startY;
                    const maxW = window.innerWidth - entry.state.x, maxH = window.innerHeight - entry.state.y;
                    if (dir.includes("e")) entry.state.width = Math.min(maxW, Math.max(MIN_WIDTH, resizeState.orig.width + dx));
                    if (dir.includes("s")) entry.state.height = Math.min(maxH, Math.max(MIN_HEIGHT, resizeState.orig.height + dy));
                    if (dir.includes("w")) {
                        const newWidth = Math.max(MIN_WIDTH, resizeState.orig.width - dx);
                        entry.state.x = resizeState.orig.x + (resizeState.orig.width - newWidth);
                        entry.state.width = newWidth;
                    }
                    if (dir.includes("n")) {
                        const newHeight = Math.max(MIN_HEIGHT, resizeState.orig.height - dy);
                        entry.state.y = resizeState.orig.y + (resizeState.orig.height - newHeight);
                        entry.state.height = newHeight;
                    }
                    this.#applyState(id);
                });
                const endResize = () => { if (resizeState) { resizeState = null; document.body.style.userSelect = ""; this.#persist(id); } };
                handle.addEventListener("pointerup", endResize);
                handle.addEventListener("pointercancel", endResize);
            });
        }

        minimize(id) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            entry.state.minimized = true;
            this.#applyState(id); this.#persist(id);
            return { success: true };
        }
        restore(id) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            entry.state.minimized = false; entry.state.maximized = false;
            this.#applyState(id); this.#persist(id); this.#bringToFront(id);
            return { success: true };
        }
        maximize(id) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            entry.state.maximized = !entry.state.maximized;
            entry.state.minimized = false;
            this.#applyState(id); this.#persist(id);
            return { success: true };
        }
        /** toggleFullscreen() — real, honest: native Fullscreen API, feature-detected, never simulated. Same pattern already proven in the Living Worship Player (C004). */
        toggleFullscreen(id) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            if (document.fullscreenElement === entry.root) { document.exitFullscreen().catch(() => {}); return { success: true }; }
            if (entry.root.requestFullscreen) { entry.root.requestFullscreen().catch(() => {}); return { success: true }; }
            return { success: false, reason: "Native Fullscreen API is not available in this environment." };
        }
        close(id) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            entry.root.remove();
            this.#windows.delete(id);
            if (typeof entry.options.onClose === "function") { try { entry.options.onClose(); } catch (_err) { /* non-fatal */ } }
            return { success: true };
        }
        focus(id) { this.#bringToFront(id); return { success: true }; }
        setTitle(id, text) {
            const entry = this.#windows.get(id);
            if (!entry) return { success: false, reason: `No real window "${id}".` };
            const el = entry.root.querySelector(".cozy-window-title");
            if (el) el.textContent = text;
            return { success: true };
        }
        isOpen(id) { return this.#windows.has(id); }
        listWindows() { return Array.from(this.#windows.keys()); }

        /**
         * tileAll()
         *   Real, basic grid tiling of every open, non-minimized window -
         *   the "Tile (basic)" requirement. Simple row/column layout
         *   over the available viewport; not a saved layout preset, just
         *   an immediate real arrangement.
         */
        tileAll() {
            const open = [...this.#windows.entries()].filter(([, e]) => !e.state.minimized);
            if (!open.length) return { success: true, tiled: 0 };
            const cols = Math.ceil(Math.sqrt(open.length));
            const rows = Math.ceil(open.length / cols);
            const cellW = Math.floor(window.innerWidth / cols);
            const cellH = Math.floor(window.innerHeight / rows);
            open.forEach(([id, entry], i) => {
                entry.state.maximized = false;
                entry.state.x = (i % cols) * cellW;
                entry.state.y = Math.floor(i / cols) * cellH;
                entry.state.width = Math.max(MIN_WIDTH, cellW);
                entry.state.height = Math.max(MIN_HEIGHT, cellH);
                this.#applyState(id);
                this.#persist(id);
            });
            return { success: true, tiled: open.length };
        }

        /** cascadeAll() — real, resets every open window back to a cascading arrangement (the same offset pattern used at creation time). */
        cascadeAll() {
            const open = [...this.#windows.entries()].filter(([, e]) => !e.state.minimized);
            open.forEach(([id, entry], i) => {
                entry.state.maximized = false;
                entry.state.x = 60 + CASCADE_OFFSET * (i % 8);
                entry.state.y = 60 + CASCADE_OFFSET * (i % 8);
                this.#applyState(id);
                this.#persist(id);
            });
            return { success: true, cascaded: open.length };
        }

        #getHandle(id) {
            return {
                success: true, id,
                focus: () => this.focus(id),
                minimize: () => this.minimize(id),
                restore: () => this.restore(id),
                maximize: () => this.maximize(id),
                toggleFullscreen: () => this.toggleFullscreen(id),
                close: () => this.close(id),
                setTitle: (text) => this.setTitle(id, text)
            };
        }

        /**
         * #reclampAll() — real fix for orientation changes / viewport
         * resize: re-clamps every open, non-maximized window's position
         * within the new viewport bounds using the same
         * #clampToViewport() logic drag already uses. A maximized
         * window's size is already 100vw/100vh via CSS and needs no
         * action here.
         */
        #reclampAll() {
            for (const [id, entry] of this.#windows) {
                if (entry.state.maximized) continue;
                const clamped = this.#clampToViewport(entry.state.x, entry.state.y, entry.state.width, entry.state.height);
                entry.state.x = clamped.x; entry.state.y = clamped.y;
                this.#applyState(id);
                this.#persist(id);
            }
        }

        constructor() {
            // M366.7 — real, disclosed fix: windows are re-clamped into
            // the viewport on orientation change / browser resize,
            // composing this same instance's own #reclampAll() - not a
            // second resize-handling system. Debounced with a real,
            // bounded timer so a rapid sequence of resize events doesn't
            // re-clamp on every single one.
            if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
                let reclampTimer = null;
                const scheduleReclamp = () => {
                    if (reclampTimer) clearTimeout(reclampTimer);
                    reclampTimer = setTimeout(() => this.#reclampAll(), 150);
                };
                window.addEventListener("resize", scheduleReclamp);
                window.addEventListener("orientationchange", scheduleReclamp);
            }
            this.#wireLivingEnvironment();
        }

        /**
         * #wireLivingEnvironment()
         *   M371 — composes the existing CozyEnvironment.getState()/
         *   onChange() (M370.5). Sets one real CSS custom property on
         *   the shared #cozy-window-manager-root, so every open
         *   window's chrome reads it via CSS - no per-window
         *   recalculation, no separate lighting logic here. Shadow/glow
         *   only, per instruction - never recolors window chrome.
         */
        #wireLivingEnvironment() {
            const env = typeof window !== "undefined" && window.CozyOS && window.CozyOS.CozyEnvironment;
            if (!env || typeof env.getState !== "function") return;
            const apply = (state) => {
                if (!state || !state.available) return;
                // Set on <html> (always exists, unlike the lazily-created
                // #cozy-window-manager-root) - CSS custom properties
                // inherit down naturally, so every window's chrome
                // (created now or later) can read it regardless of when
                // this fires relative to the first create() call.
                document.documentElement.style.setProperty("--cozy-window-env-lighting", String(state.lighting));
            };
            apply(env.getState());
            if (typeof env.onChange === "function") env.onChange(apply);
        }

        getDiagnosticsReport() { return { moduleVersion: VERSION, openWindows: this.#windows.size, ids: this.listWindows() }; }
    }

    window.CozyOS.WindowManager = new CozyWindowManager();
    window.CozyOS.Modules["window-manager"] = Object.freeze({
        version: VERSION,
        description: "CozyOS Window Manager (M366.6) — core platform service. Generic create()/minimize()/restore()/maximize()/toggleFullscreen()/close() API, real drag (Pointer Events, no third-party library), real resize (4 corners + 4 edges, real min/max bounds), real z-index arbitration, real position/size/minimized/maximized persistence per window id. No application-specific logic anywhere in this file."
    });
})();
