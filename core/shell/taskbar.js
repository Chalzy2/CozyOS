/**
 * CozyOS Taskbar
 * File Reference: core/shell/taskbar.js
 * Capability: Taskbar (desktop-shell gap closed) — composes the
 * existing, unmodified-in-behavior core/shell/window-manager.js.
 *
 * OWNERSHIP
 *   Confirmed by reading window-manager.js and application-launcher.js
 *   in full before this file was written: WindowManager already owns
 *   every real window mechanic (create/focus/minimize/restore/maximize/
 *   close/z-order/persistence) but exposed no way for anything else to
 *   observe that state, and no file anywhere in the repository renders
 *   a list of open windows. This file is the single, additive consumer
 *   of WindowManager's new onChange()/getSnapshot() read model — it
 *   owns zero window state itself and duplicates no part of
 *   WindowManager's own engine (no second z-order, no second
 *   minimized/maximized flag, no second persistence).
 *
 * WHAT THIS DOES NOT DO
 *   Does not call WindowManager.create()/close()/etc with any logic
 *   WindowManager doesn't already implement — every taskbar action
 *   (focus/restore/close) is a direct passthrough to the real,
 *   unmodified method of the same name. Does not touch
 *   ApplicationLauncher — an application already reaches the taskbar
 *   automatically the moment it's opened via `mode: "window"` or
 *   `mode: "fullscreen"`, since ApplicationLauncher already registers
 *   with the same WindowManager this file observes.
 *
 * MOUNT POINT — DISCLOSED FINDING
 *   The approved scope named core/shell/cozy-shell.html as the mount
 *   point. Reading that file found it does not load window-manager.js
 *   or application-launcher.js at all — admin-workspace.html is the
 *   real, only page that loads both today (window-manager.js is itself
 *   loaded there, self-mounting its own `#cozy-window-manager-root`
 *   into document.body rather than any static element in that page).
 *   This file follows that same proven self-mounting pattern — it
 *   creates its own `#cozy-taskbar-root` and appends it to
 *   document.body, so it works correctly on whichever real page loads
 *   it (admin-workspace.html today) without requiring a specific
 *   static element to exist in advance, and without editing
 *   admin-workspace.html's own dynamically-rendered footer (owned by
 *   the locked core/shell/cozy-workspace.js). A `<script>` tag for this
 *   file was added to admin-workspace.html, immediately after
 *   window-manager.js, since that is the real page where windows exist
 *   today.
 *
 * BEHAVIOR
 *   - Renders one entry per WindowManager.getSnapshot() row: icon
 *     (if any) + title, minimized/active state as CSS classes, and a
 *     close control.
 *   - Click a minimized entry -> WindowManager.restore(id).
 *   - Click a non-minimized entry -> WindowManager.focus(id).
 *   - Click an entry's close control -> WindowManager.close(id)
 *     (stops the click from also bubbling into focus/restore).
 *   - Fully re-subscribes on every WindowManager change (create/focus/
 *     minimize/restore/maximize/close/setTitle) via the real
 *     onChange() hook added to window-manager.js for this purpose —
 *     never polls, never keeps its own timer.
 *   - destroy() unsubscribes from WindowManager and removes its own
 *     DOM root — used by tests to verify no orphaned listener survives,
 *     and safe to call from a host page during teardown.
 *   - Guarded the same way every other CozyOS module in this repo is
 *     (`if (window.CozyOS.Modules["taskbar"]) return;`), so a second
 *     accidental <script> include is a real no-op, not a second
 *     listener/subscription.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["taskbar"]) return;

    const ROOT_ID = "cozy-taskbar-root";
    const STYLE_ID = "cozy-taskbar-style";

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
                display: flex; align-items: center; gap: 6px;
                padding: 4px 8px; overflow-x: auto;
                background: rgba(1, 28, 21, 0.92);
                border-top: 1px solid rgba(255, 255, 255, 0.12);
            }
            #${ROOT_ID} .cozy-taskbar-item {
                display: flex; align-items: center; gap: 6px;
                padding: 4px 10px; border-radius: 6px; border: 1px solid transparent;
                background: rgba(255, 255, 255, 0.06); color: #eafff5;
                font: inherit; font-size: 0.8rem; cursor: pointer; white-space: nowrap;
            }
            #${ROOT_ID} .cozy-taskbar-item.cozy-taskbar-active { border-color: rgba(255, 255, 255, 0.4); }
            #${ROOT_ID} .cozy-taskbar-item.cozy-taskbar-minimized { opacity: 0.65; }
            #${ROOT_ID} .cozy-taskbar-close {
                margin-left: 4px; opacity: 0.7; padding: 0 2px; border-radius: 3px;
            }
            #${ROOT_ID} .cozy-taskbar-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.15); }
        `;
        document.head.appendChild(style);
    }

    function ensureRoot() {
        ensureStyle();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement("div");
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        return root;
    }

    /**
     * render(snapshot)
     *   Real, full re-render from WindowManager's own getSnapshot() —
     *   no diffing, no second copy of window state kept between calls.
     *   Snapshot list sizes in this platform are small (a handful of
     *   open windows), so a full rebuild is the honest, simplest
     *   correct approach — the same choice WindowManager.tileAll()
     *   itself already makes for its own bulk updates.
     */
    function render(snapshot) {
        const root = ensureRoot();
        root.innerHTML = "";
        for (const win of snapshot) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "cozy-taskbar-item"
                + (win.minimized ? " cozy-taskbar-minimized" : "")
                + (win.active ? " cozy-taskbar-active" : "");
            item.dataset.taskbarId = win.id;

            if (win.icon) {
                const iconEl = document.createElement("span");
                iconEl.className = "cozy-taskbar-icon";
                iconEl.textContent = win.icon;
                item.appendChild(iconEl);
            }

            const titleEl = document.createElement("span");
            titleEl.className = "cozy-taskbar-title";
            titleEl.textContent = win.title || win.id;
            item.appendChild(titleEl);

            const closeEl = document.createElement("span");
            closeEl.className = "cozy-taskbar-close";
            closeEl.dataset.taskbarClose = win.id;
            closeEl.title = "Close";
            closeEl.textContent = "\u2715";
            closeEl.addEventListener("click", (evt) => {
                evt.stopPropagation();
                const wm = window.CozyOS.WindowManager;
                if (wm) wm.close(win.id);
            });
            item.appendChild(closeEl);

            item.addEventListener("click", () => {
                const wm = window.CozyOS.WindowManager;
                if (!wm) return;
                if (win.minimized) wm.restore(win.id);
                else wm.focus(win.id);
            });

            root.appendChild(item);
        }
    }

    let unsubscribe = null;

    function init() {
        const wm = window.CozyOS.WindowManager;
        if (!wm || typeof wm.onChange !== "function" || typeof wm.getSnapshot !== "function") {
            // Honest degrade, matching this repo's convention: report
            // why, never silently pretend the taskbar is live.
            if (typeof console !== "undefined" && console.warn) {
                console.warn("CozyOS Taskbar: WindowManager.onChange()/getSnapshot() not available — taskbar not started. Load core/shell/window-manager.js before core/shell/taskbar.js.");
            }
            return;
        }
        render(wm.getSnapshot());
        unsubscribe = wm.onChange(render);
    }

    init();

    window.CozyOS.Taskbar = {
        getRootElement: () => document.getElementById(ROOT_ID),
        /** destroy() — real teardown: unsubscribes from WindowManager and removes this module's own DOM root. Safe to call even if init() never subscribed (e.g. WindowManager loaded after this file). */
        destroy() {
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            const root = document.getElementById(ROOT_ID);
            if (root) root.remove();
        },
        getVersion: () => VERSION,
        getId: () => "Taskbar",
        getDiagnosticsReport: () => ({
            moduleVersion: VERSION,
            subscribed: !!unsubscribe,
            entries: document.querySelectorAll(`#${ROOT_ID} .cozy-taskbar-item`).length
        })
    };

    window.CozyOS.Modules["taskbar"] = Object.freeze({
        version: VERSION,
        description: "CozyOS Taskbar — real, additive desktop-shell component. Lists every WindowManager-tracked open window (icon+title, minimized/active state), click to focus/restore, dedicated close control per entry. Introduces no window state of its own — reads exclusively via WindowManager.getSnapshot()/onChange()."
    });
})();
