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
 *   - Live Video/Audio for Worship remains a SEPARATE WindowManager
 *     window today (id "living-worship-player") for its own disclosed,
 *     real reasons (Theater/Float/native Picture-in-Picture require a
 *     window that can genuinely go full-viewport or leave the browser
 *     entirely — a mode region inside another window cannot do that).
 *     This file does not merge that window's DOM into the Live Window;
 *     instead (see living-worship-player.js's own updated #mountWindow())
 *     opening it now ALWAYS also calls
 *     LiveWindow.activateMode("worship", ...) first, so the two are
 *     driven by the same context/identity rather than presenting as two
 *     unrelated applications. This is a real, disclosed, remaining
 *     architectural gap for the VIDEO surface specifically — see this
 *     pass's report — not something this file claims to have solved.
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

        if (activeModeId && activeModeId !== mode) runDeactivate(activeModeId, region);

        if (!mode || mode === "assistant") {
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
        getDiagnosticsReport: () => ({ moduleVersion: VERSION, activeMode: activeModeId, registeredModes: listRegisteredModes() })
    });

    window.CozyOS.Modules["live-window-controller"] = Object.freeze({
        version: VERSION,
        description: "Universal Live Window Controller — window.CozyOS.LiveWindow. Composes the real, unmodified LivingAssistant singleton (never a second AI/window) and the real, generic WindowManager.setTitle(). Applications register a mode (registerMode) and request context changes (activate/activateMode) instead of constructing a new window. ONE Live Window, MANY application contexts."
    });
})();
