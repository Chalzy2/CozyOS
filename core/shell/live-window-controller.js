/**
 * CozyOS — Universal Live Window Controller
 * File Reference: core/shell/live-window-controller.js
 *
 * PURPOSE (Live Window Architecture Audit — corrective pass)
 *   An audit of this repository's real live-interaction surfaces found
 *   two independently WindowManager-registered top-level windows:
 *     - "cozy-assistant" (core/living/cozy-living-assistant.js, the real
 *       LivingAssistant singleton — chat, voice, OCR, the verified
 *       Question -> Context -> Answer -> Advisor chain).
 *     - "living-worship-player" (core/modules/ChurchOS/
 *       living-worship-player.js — real live video/audio + Translation/
 *       Scripture/Timeline panels).
 *   Both are real, both are singletons in their own right (each guards
 *   itself with the standard `if (window.CozyOS.Modules[...]) return;`
 *   pattern and neither duplicates an AI/semantic/speech engine — see
 *   this pass's audit report), but presenting them as two independently
 *   titled, independently branded surfaces is exactly the architectural
 *   problem this file exists to correct: CozyOS must have ONE universal
 *   Live Window that changes CONTEXT, not a second window per
 *   application/mode.
 *
 * WHAT THIS FILE IS
 *   A thin, additive facade — window.CozyOS.LiveWindow — over the ONE
 *   real, existing, unmodified LivingAssistant singleton. It never
 *   constructs a second AI, a second window manager, or a second
 *   conversation/semantic pipeline. It composes exactly two real,
 *   pre-existing surfaces:
 *     - window.CozyOS.LivingAssistant.open()/close() — the real Live
 *       Window instance itself (unchanged, not edited by this file —
 *       core/living/cozy-living-assistant.js is a diff-guarded file per
 *       this project's own discipline; see this pass's report for why
 *       the fix is implemented entirely outside it).
 *     - window.CozyOS.WindowManager.setTitle(id, text) — the real,
 *       generic, already-existing method every CozyOS window already
 *       supports, used here only to relabel the SAME window
 *       ("cozy-assistant") to reflect its active context
 *       ("🟢 Live Window · Worship") instead of creating a second one.
 *
 * THE CONTRACT APPLICATIONS USE
 *   Applications never construct a window. They request a context
 *   change on the one Live Window:
 *     window.CozyOS.LiveWindow.activate({ mode: "worship", context: {...} });
 *     window.CozyOS.LiveWindow.activateMode("worship", {...});
 *   A mode module (e.g. ChurchOS's worship-live-window-mode.js) supplies
 *   its own renderer once, via:
 *     window.CozyOS.LiveWindow.registerMode("worship", {
 *       label: "Worship",
 *       activate(container, context) { ... real, composed UI ... },
 *       deactivate(container) { ... }
 *     });
 *   activate()/activateMode() ALWAYS reuse the same LivingAssistant
 *   instance (open() is itself idempotent — see its own WindowManager
 *   create()-by-id call, which focuses the existing window rather than
 *   creating a second one) and render the mode's content into a single,
 *   real DOM region inside the SAME mounted panel
 *   (#cozy-living-assistant-panel, already present in the live DOM once
 *   open() has run) — never a second floating window, never a second
 *   WindowManager registration for this purpose.
 *
 * HONEST SCOPE / DISCLOSED LIMITS
 *   - The panel's own internal fields (#panel, #button, ...) are true
 *     JS private class fields on LivingAssistant — genuinely
 *     unreachable from any other file, by design. This file reaches the
 *     already-mounted panel via its own public DOM id
 *     (#cozy-living-assistant-panel) exactly the way several other
 *     already-existing CozyOS files reach other modules' rendered DOM
 *     (e.g. `document.querySelector('[data-center="..."]')` elsewhere in
 *     this codebase) — real DOM composition, not a private-field bypass
 *     and not an edit to the guarded file.
 *   - CORRECTIVE PASS (Live Window repair): the paragraph this replaced
 *     disclosed that Live Video/Audio for Worship remained a SEPARATE,
 *     real WindowManager registration ("living-worship-player") even
 *     after this file's own activateMode() call. That second
 *     registration has been removed — living-worship-player.js no
 *     longer calls WindowManager.create() when this Live Window is
 *     available (see its own #mountWindow()/attachTo()). Its real
 *     player DOM (video + Theater/Float/PiP/Fullscreen controls) is now
 *     composed directly inside this file's own mode region by
 *     worship-live-window-mode.js's registered "worship" mode, and
 *     Theater/Float/Fullscreen ask THIS shared window to resize/
 *     fullscreen itself via the window-op pass-throughs below
 *     (focus/getBounds/setBounds/toggleFullscreen/isOpen) rather than
 *     owning a second WindowManager id. Real browser Picture-in-Picture
 *     needs no window at all (it operates on the <video> element
 *     directly) and is unaffected. A real, honest, remaining fallback:
 *     if this Live Window is genuinely unavailable on some page (this
 *     file not loaded), living-worship-player.js still mounts itself
 *     standalone — never the normal path, and never a duplicate,
 *     whenever this Live Window IS present.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["live-window-controller"]) return;

    const ASSISTANT_WINDOW_ID = "cozy-assistant"; // must match cozy-living-assistant.js's own wm.create({id: ...}) — read, never redefined here.
    const PANEL_ID = "cozy-living-assistant-panel"; // must match cozy-living-assistant.js's own #panel.id — read, never redefined here.
    const REGION_ID = "cozy-live-window-mode-region";
    const BASE_TITLE = "🟢 Live Window";

    /** modeId -> { label, activate(container, context), deactivate(container) } — application-supplied, never a built-in list of apps here. */
    const modes = new Map();
    let activeModeId = null;
    let activeContext = null;

    function resolveAssistant() {
        const a = window.CozyOS && window.CozyOS.LivingAssistant;
        return (a && typeof a.open === "function") ? a : null;
    }

    /** ensureRegion() — the ONE mode-content container inside the ONE real, existing panel. Created once, reused; never a second region, never a second panel. */
    function ensureRegion() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return null;
        let region = panel.querySelector("#" + REGION_ID);
        if (!region) {
            region = document.createElement("section");
            region.id = REGION_ID;
            region.setAttribute("aria-label", "Live Window context panel");
            region.hidden = true;
            // Inserted first, so an active application context (Worship,
            // QuarryOS, ShopOS, ...) appears above the general chat log —
            // the existing quick-actions/messages/form below remain
            // exactly as they are: the Live Text/Speak/Type/Reply
            // controls every mode shares, never duplicated per mode.
            panel.insertBefore(region, panel.firstChild);
        }
        return region;
    }

    function setWindowTitle(text) {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        if (wm && typeof wm.isOpen === "function" && typeof wm.setTitle === "function" && wm.isOpen(ASSISTANT_WINDOW_ID)) {
            wm.setTitle(ASSISTANT_WINDOW_ID, text);
        }
    }

    function runDeactivate(modeId, region) {
        const def = modes.get(modeId);
        if (def && typeof def.deactivate === "function") {
            try { def.deactivate(region); } catch (err) { console.warn(`[LiveWindow] mode "${modeId}" deactivate() threw:`, err && err.message); }
        }
    }

    /**
     * registerMode(modeId, definition)
     *   The universal contract a mode module (ChurchOS worship, a future
     *   QuarryOS/ShopOS mode, etc.) uses to plug real content into the
     *   ONE Live Window. Re-registering the same modeId replaces the
     *   definition (last real registration wins) rather than stacking
     *   duplicate renderers.
     */
    function registerMode(modeId, definition) {
        if (!modeId || typeof modeId !== "string") return { success: false, reason: "A real modeId string is required." };
        if (!definition || typeof definition.activate !== "function") return { success: false, reason: "definition.activate(container, context) is required." };
        modes.set(modeId, { label: (definition.label && String(definition.label)) || modeId, activate: definition.activate, deactivate: definition.deactivate || null });
        return { success: true };
    }

    /**
     * activate({ mode, context })
     *   The ONE real entry point every application uses to request a
     *   context change. mode === null/"assistant" returns the Live
     *   Window to its plain assistant view (mode region hidden, title
     *   reset) without closing it. A mode with no registration fails
     *   closed with an honest reason — it never fabricates content.
     */
    function activate(opts) {
        opts = opts || {};
        const mode = opts.mode || null;
        const context = opts.context !== undefined ? opts.context : null;

        const assistant = resolveAssistant();
        if (!assistant) return { success: false, reason: "window.CozyOS.LivingAssistant is not loaded — there is no real Live Window to activate on this page." };

        assistant.open(); // idempotent — reuses the SAME instance/window, never creates a second one.
        const region = ensureRegion();
        if (!region) return { success: false, reason: "The Live Window panel is not present in the DOM yet." };

        if (!mode || mode === "assistant") {
            if (activeModeId) runDeactivate(activeModeId, region);
            region.hidden = true;
            region.innerHTML = "";
            setWindowTitle(BASE_TITLE);
            activeModeId = null;
            activeContext = null;
            return { success: true, mode: null, context: null };
        }

        const def = modes.get(mode);
        if (!def) {
            return { success: false, reason: `No Live Window mode is registered for "${mode}". Applications must call LiveWindow.registerMode() before activating it.` };
        }

        // LIVE WINDOW ADDITIVE FIX — re-activating the SAME already-
        // active mode (e.g. a real service rebind such as
        // living-worship-player.js's bindToService() re-syncing context
        // after the mode was already opened) must never tear down and
        // rebuild the mode's real, live DOM (a playing <video> with a
        // real MediaStream, form input state, etc.) just to refresh its
        // context — that would visibly reset/flicker a real stream for
        // no reason, and a mode composing this path (e.g. calling
        // activateMode() again from inside its own re-render) would
        // recurse into its own activate() forever. Context/title still
        // update for real; a mode may optionally supply
        // updateContext(container, context) for a light, non-destructive
        // refresh — otherwise this is an honest no-op on the DOM.
        if (activeModeId === mode) {
            activeContext = context;
            if (typeof def.updateContext === "function") {
                try { def.updateContext(region, context); } catch (err) { console.warn(`[LiveWindow] mode "${mode}" updateContext() threw:`, err && err.message); }
            }
            setWindowTitle(`${BASE_TITLE} · ${def.label}`);
            return { success: true, mode, context };
        }

        if (activeModeId) runDeactivate(activeModeId, region);
        region.hidden = false;
        region.innerHTML = "";
        try {
            def.activate(region, context);
        } catch (err) {
            console.warn(`[LiveWindow] mode "${mode}" activate() threw:`, err && err.message);
        }
        setWindowTitle(`${BASE_TITLE} · ${def.label}`);
        activeModeId = mode;
        activeContext = context;
        return { success: true, mode, context };
    }

    function activateMode(mode, context) { return activate({ mode, context }); }
    function deactivateMode() { return activate({ mode: null }); }

    function close() {
        deactivateMode();
        const assistant = resolveAssistant();
        if (assistant && typeof assistant.close === "function") assistant.close();
        return { success: true };
    }

    function getInstance() { return resolveAssistant(); }
    function getActiveMode() { return { mode: activeModeId, context: activeContext }; }
    function isModeRegistered(modeId) { return modes.has(modeId); }
    function listRegisteredModes() { return Array.from(modes.keys()); }

    /**
     * Window-op pass-throughs (additive) — the small, generic extension
     * the Live Window Architecture Audit called for: a way for a mode
     * (e.g. ChurchOS Worship's Theater/Float/Fullscreen controls) to
     * request real WindowManager operations on the ONE shared Live
     * Window ("cozy-assistant", the real, existing id — see
     * ASSISTANT_WINDOW_ID above) instead of registering a second window
     * of its own. Every one of these composes the same, already-generic
     * WindowManager methods (focus/getBounds/setBounds/toggleFullscreen/
     * isOpen) that every other CozyOS window already uses — no new
     * window-management logic lives here.
     */
    function focusWindow() {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        if (wm && typeof wm.isOpen === "function" && wm.isOpen(ASSISTANT_WINDOW_ID) && typeof wm.focus === "function") return wm.focus(ASSISTANT_WINDOW_ID);
        return { success: false, reason: "The Live Window is not open." };
    }
    function windowGetBounds() {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        if (wm && typeof wm.getBounds === "function") return wm.getBounds(ASSISTANT_WINDOW_ID);
        return { success: false, reason: "WindowManager is not available." };
    }
    function windowSetBounds(bounds) {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        if (wm && typeof wm.setBounds === "function") return wm.setBounds(ASSISTANT_WINDOW_ID, bounds);
        return { success: false, reason: "WindowManager is not available." };
    }
    function windowToggleFullscreen() {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        if (wm && typeof wm.toggleFullscreen === "function") return wm.toggleFullscreen(ASSISTANT_WINDOW_ID);
        return { success: false, reason: "WindowManager is not available." };
    }
    function isOpen() {
        const wm = window.CozyOS && window.CozyOS.WindowManager;
        return !!(wm && typeof wm.isOpen === "function" && wm.isOpen(ASSISTANT_WINDOW_ID));
    }

    window.CozyOS.LiveWindow = Object.freeze({
        getVersion: () => VERSION,
        getInstance,
        registerMode,
        activate,
        activateMode,
        deactivateMode,
        close,
        getActiveMode,
        isModeRegistered,
        listRegisteredModes,
        focus: focusWindow,
        getBounds: windowGetBounds,
        setBounds: windowSetBounds,
        toggleFullscreen: windowToggleFullscreen,
        isOpen,
        getDiagnosticsReport: () => ({ moduleVersion: VERSION, activeMode: activeModeId, registeredModes: listRegisteredModes() })
    });

    window.CozyOS.Modules["live-window-controller"] = Object.freeze({
        version: VERSION,
        description: "Universal Live Window Controller — window.CozyOS.LiveWindow. Composes the real, unmodified LivingAssistant singleton (never a second AI/window) and the real, generic WindowManager (setTitle, plus additive focus/getBounds/setBounds/toggleFullscreen/isOpen pass-throughs a mode can use instead of registering its own window). Applications register a mode (registerMode, with an optional light updateContext for a real service rebind) and request context changes (activate/activateMode) instead of constructing a new window. ONE Live Window, MANY application contexts — including ChurchOS Worship's real video/audio, which now composes this window directly rather than opening a second one."
    });
})();
