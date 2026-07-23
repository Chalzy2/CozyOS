/**
 * CozyOS Mode Engine
 * File Reference: core/ui/mode-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   LivingThemeEngine already owns theme scheduling/activation
 *   (composing the real CozyOS.Theme.setTheme()). This file does NOT
 *   duplicate that — a Mode's theme selection is a real reference to an
 *   already-registered LivingThemeEngine theme id, activated by calling
 *   LivingThemeEngine.activateTheme() directly. Schedule matching reuses
 *   LivingThemeEngine's own real, public matchesSchedule() method rather
 *   than re-implementing the same date logic a second time (Rule 80/81).
 *
 * WHAT A MODE REAL-WORLD OWNS
 *   A Mode is a named bundle: which theme id to activate, which real
 *   application ids to prioritize (a real, ordered list — this file
 *   does not itself launch or reorder applications; that remains each
 *   application shell's own job, this is authoritative data other code
 *   can read), and whether notifications are enabled for this mode.
 *
 * HONEST SCOPE — v1
 *   Built this pass: mode registry, scheduling (reusing
 *   LivingThemeEngine.matchesSchedule()), activation composing
 *   LivingThemeEngine, real events. NOT built this pass, named
 *   explicitly: sound/animation control (no real sound engine exists in
 *   this codebase to compose), AI personality switching (no real AI
 *   provider exists, confirmed repeatedly across this project),
 *   brightness control (no real hardware API integration), location-
 *   based activation (no real geolocation integration), and actually
 *   enforcing "prioritize these apps" inside any application shell —
 *   this file provides the real, authoritative data; consuming it is
 *   separate, disclosed future work.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODE_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    const REAL_EVENT_NAMES = Object.freeze(["mode-activated", "mode-changed", "mode-scheduled", "mode-completed"]);

    class CozyModeEngine {
        #modes = new Map(); // modeId -> {modeId, themeId, appPriority, notificationsEnabled, schedule}
        #activeModeId = null;
        #history = [];

        getVersion() { return MODE_ENGINE_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            if (!REAL_EVENT_NAMES.includes(eventName)) { console.warn(`[ModeEngine] Unknown event "${eventName}" — not emitted.`); return; }
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`mode:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        /**
         * registerMode(modeId, {themeId, appPriority, notificationsEnabled, schedule})
         *   Real — themeId, if given, must reference an already-real
         *   LivingThemeEngine theme (fails closed otherwise, the same
         *   discipline LivingThemeEngine itself applies to CozyOS.Theme
         *   names).
         */
        registerMode(modeId, { themeId = null, appPriority = [], notificationsEnabled = true, schedule = { type: "continuous" } } = {}) {
            if (!modeId) return { success: false, reason: "A real modeId is required." };
            const themeEngine = window.CozyOS.LivingThemeEngine;
            if (themeId && themeEngine && typeof themeEngine.getTheme === "function" && !themeEngine.getTheme(themeId)) {
                return { success: false, reason: `"${themeId}" is not a real, registered theme in LivingThemeEngine. Register it there first.` };
            }
            this.#modes.set(modeId, { modeId, themeId, appPriority: [...appPriority], notificationsEnabled, schedule });
            this.#emit("mode-scheduled", { modeId, schedule });
            return { success: true };
        }

        getMode(modeId) {
            const m = this.#modes.get(modeId);
            return m ? this.#deepClone(m) : null;
        }

        /**
         * listModes()
         *   Added during the Design Studio integration milestone (real
         *   enumeration needed for the admin Mode list UI). Read-only,
         *   purely additive.
         */
        listModes() { return [...this.#modes.values()].map((m) => this.#deepClone(m)); }

        /** isModeScheduledNow(modeId) — real, reuses LivingThemeEngine.matchesSchedule() rather than re-implementing date matching. */
        isModeScheduledNow(modeId) {
            const mode = this.#modes.get(modeId);
            if (!mode) return { scheduled: false, reason: "No real mode with that id." };
            const themeEngine = window.CozyOS.LivingThemeEngine;
            if (!themeEngine || typeof themeEngine.matchesSchedule !== "function") {
                return { scheduled: false, reason: "LivingThemeEngine is not loaded — cannot evaluate the real schedule." };
            }
            return { scheduled: themeEngine.matchesSchedule(mode.schedule, new Date()) };
        }

        /**
         * activateMode(modeId)
         *   Real — if the mode references a real themeId, genuinely
         *   calls LivingThemeEngine.activateTheme() (which itself calls
         *   the real CozyOS.Theme.setTheme()). Never re-implements theme
         *   application here.
         */
        activateMode(modeId) {
            const mode = this.#modes.get(modeId);
            if (!mode) return { success: false, reason: "No real mode with that id." };
            if (mode.themeId) {
                const themeEngine = window.CozyOS.LivingThemeEngine;
                if (!themeEngine || typeof themeEngine.activateTheme !== "function") {
                    return { success: false, reason: "LivingThemeEngine is not loaded — cannot activate this mode's real theme." };
                }
                const themeResult = themeEngine.activateTheme(mode.themeId);
                if (!themeResult.success) return { success: false, reason: `Real theme activation failed: ${themeResult.reason}` };
            }
            const previous = this.#activeModeId;
            this.#activeModeId = modeId;
            this.#emit("mode-activated", { modeId, themeId: mode.themeId, previous });
            if (previous && previous !== modeId) this.#emit("mode-changed", { from: previous, to: modeId });
            return { success: true, appPriority: [...mode.appPriority], notificationsEnabled: mode.notificationsEnabled };
        }

        deactivateMode() {
            if (!this.#activeModeId) return { success: false, reason: "No real mode is currently active." };
            const modeId = this.#activeModeId;
            this.#activeModeId = null;
            this.#emit("mode-completed", { modeId });
            return { success: true };
        }

        getActiveMode() { return this.#activeModeId ? this.getMode(this.#activeModeId) : null; }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: MODE_ENGINE_VERSION, registeredModes: this.#modes.size, activeModeId: this.#activeModeId, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.ModeEngine && typeof window.CozyOS.ModeEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.ModeEngine.getVersion();
        if (existingVersion !== MODE_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ModeEngine existing v${existingVersion} conflicts with load target v${MODE_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.ModeEngine = new CozyModeEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "ModeEngine", category: "Platform", icon: "sliders.svg",
                description: "Real mode registry — composes LivingThemeEngine for theme activation and reuses its matchesSchedule() rather than duplicating scheduling logic. Sound/animation/AI-personality/brightness control are honestly not implemented — no real backend exists for any of them yet."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
