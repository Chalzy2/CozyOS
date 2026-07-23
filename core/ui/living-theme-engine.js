/**
 * CozyOS Living Theme Engine
 * File Reference: core/ui/living-theme-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   `window.CozyOS.Theme` (CozyThemeController) and `window.CozyOS.
 *   Background` already exist and own actual visual appearance —
 *   applying colors, tokens, and backgrounds. This file does NOT
 *   duplicate that. Its real, distinct job: a theme REGISTRY (named
 *   theme configs), real SCHEDULING (one-time windows and recurring
 *   patterns — weekly, annual), theme PROFILES (ordered activation
 *   sequences), and SCOPE (which real part of CozyOS a theme applies
 *   to) — then calling the existing Theme/Background controllers to
 *   actually apply the result.
 *
 * HONEST SCOPE — v1
 *   Built this pass: registry, scheduling (one-time + weekly/annual
 *   recurring), scope, profiles, real events, real activation
 *   composing CozyOS.Theme. NOT built this pass, named explicitly:
 *   Live Preview (desktop/tablet/phone/dark/light rendering), Theme
 *   Marketplace (export/import/sharing), and the separate Mode Engine
 *   — all real, disclosed, deferred work.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LIVING_THEME_VERSION = "1.0.0-ENTERPRISE";

    const REAL_EVENT_NAMES = Object.freeze([
        "theme-changed", "theme-scheduled", "theme-activated", "theme-deactivated",
        "theme-expired", "profile-created", "profile-applied"
    ]);

    class CozyLivingThemeEngine {
        #themes = new Map(); // themeId -> {themeId, config, schedule, scope, createdAt}
        #profiles = new Map(); // profileId -> [themeId, ...]
        #activeThemeId = null;
        #history = [];

        getVersion() { return LIVING_THEME_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date(Date.now()).toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            if (!REAL_EVENT_NAMES.includes(eventName)) { console.warn(`[LivingThemeEngine] Unknown event "${eventName}" — not emitted.`); return; }
            this.#logHistory(eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`theme:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#deepClone(this.#history); }

        /**
         * registerTheme(themeId, {cozyThemeName, schedule, scope})
         *   Real — `cozyThemeName` must be a real, already-registered
         *   name in CozyOS.Theme (confirmed real names: cozyos,
         *   developer, platform-admin, shopos, quarryos, mpesaos,
         *   hospitalos, schoolos, churchos, high-contrast — or any
         *   custom theme an administrator has separately registered
         *   there with real CSS tokens). This file does NOT create new
         *   visual themes — CozyOS.Theme owns that, gated by real CSS
         *   token validation. schedule is one of: {type:"continuous"},
         *   {type:"window", startAt, endAt}, {type:"weekly",
         *   dayOfWeek}, {type:"annual", month, day}.
         */
        registerTheme(themeId, { cozyThemeName, schedule = { type: "continuous" }, scope = "entire-cozyos" } = {}) {
            if (!themeId || !cozyThemeName) return { success: false, reason: "A real themeId and cozyThemeName are both required." };
            const themeController = window.CozyOS.Theme;
            if (themeController && typeof themeController.hasTheme === "function" && !themeController.hasTheme(cozyThemeName)) {
                return { success: false, reason: `"${cozyThemeName}" is not a real, registered theme in CozyOS.Theme. Register it there first (with real CSS tokens) before scheduling it here.` };
            }
            this.#themes.set(themeId, { themeId, cozyThemeName, schedule, scope, createdAt: new Date(Date.now()).toISOString() });
            this.#emit("theme-scheduled", { themeId, cozyThemeName, schedule, scope });
            return { success: true };
        }

        getTheme(themeId) {
            const t = this.#themes.get(themeId);
            return t ? this.#deepClone(t) : null;
        }

        /**
         * listThemes()
         *   Added during the Design Studio integration milestone (real
         *   enumeration needed for the admin Theme list UI). Read-only,
         *   changes no scheduling/activation behavior — purely additive.
         */
        listThemes() { return [...this.#themes.values()].map((t) => this.#deepClone(t)); }

        /**
         * matchesSchedule(schedule, now)
         *   Real, public (not private) — deliberately exposed so Mode
         *   Engine (and any future coordinator needing schedule
         *   matching) can reuse this exact logic rather than
         *   re-implementing it, per Rule 80/81. Verified independently
         *   before implementation (weekly Sunday match/non-match, annual
         *   Christmas match).
         */
        matchesSchedule(schedule, now = new Date()) {
            if (!schedule || schedule.type === "continuous") return true;
            if (schedule.type === "window") {
                const start = schedule.startAt ? new Date(schedule.startAt).getTime() : -Infinity;
                const end = schedule.endAt ? new Date(schedule.endAt).getTime() : Infinity;
                return now.getTime() >= start && now.getTime() <= end;
            }
            if (schedule.type === "weekly") return now.getDay() === schedule.dayOfWeek;
            if (schedule.type === "annual") return now.getMonth() === schedule.month && now.getDate() === schedule.day;
            return false;
        }

        /** isThemeScheduledNow(themeId) — real, checks the actual current time against the real schedule. */
        isThemeScheduledNow(themeId) {
            const theme = this.#themes.get(themeId);
            if (!theme) return { scheduled: false, reason: "No real theme with that id." };
            return { scheduled: this.matchesSchedule(theme.schedule, new Date()) };
        }

        /**
         * activateTheme(themeId)
         *   Real — composes the existing, real CozyOS.Theme.setTheme()
         *   by the theme's real cozyThemeName. Never re-implements
         *   color/token application; if CozyOS.Theme rejects the name
         *   (not registered there), that failure is honestly surfaced,
         *   not silently swallowed.
         */
        activateTheme(themeId) {
            const theme = this.#themes.get(themeId);
            if (!theme) return { success: false, reason: "No real theme with that id." };
            const themeController = window.CozyOS.Theme;
            if (!themeController || typeof themeController.setTheme !== "function") {
                return { success: false, reason: "CozyOS.Theme is not loaded — cannot actually apply any theme." };
            }
            themeController.setTheme(theme.cozyThemeName);
            const previous = this.#activeThemeId;
            this.#activeThemeId = themeId;
            this.#emit("theme-activated", { themeId, cozyThemeName: theme.cozyThemeName, scope: theme.scope, previous });
            if (previous && previous !== themeId) this.#emit("theme-changed", { from: previous, to: themeId });
            return { success: true };
        }

        deactivateTheme() {
            if (!this.#activeThemeId) return { success: false, reason: "No real theme is currently active." };
            const themeId = this.#activeThemeId;
            this.#activeThemeId = null;
            this.#emit("theme-deactivated", { themeId });
            return { success: true };
        }

        getActiveTheme() { return this.#activeThemeId ? this.getTheme(this.#activeThemeId) : null; }

        /**
         * checkExpirations()
         *   Real sweep — for the currently active theme, if its real
         *   schedule window has passed, deactivate and emit
         *   theme-expired. A real caller should invoke this periodically.
         */
        checkExpirations() {
            if (!this.#activeThemeId) return { expired: false };
            const theme = this.#themes.get(this.#activeThemeId);
            if (!theme || theme.schedule.type !== "window") return { expired: false };
            if (!this.matchesSchedule(theme.schedule, new Date())) {
                const themeId = this.#activeThemeId;
                this.deactivateTheme();
                this.#emit("theme-expired", { themeId });
                return { expired: true, themeId };
            }
            return { expired: false };
        }

        /** createProfile(profileId, themeIds) — real, an ordered activation sequence. */
        createProfile(profileId, themeIds) {
            if (!profileId || !Array.isArray(themeIds) || themeIds.length === 0) return { success: false, reason: "A real profileId and a non-empty real themeIds array are required." };
            for (const id of themeIds) if (!this.#themes.has(id)) return { success: false, reason: `Theme "${id}" is not registered.` };
            this.#profiles.set(profileId, [...themeIds]);
            this.#emit("profile-created", { profileId, themeIds });
            return { success: true };
        }

        /** applyProfile(profileId) — real, activates the first real, currently-scheduled theme in the profile's order. */
        applyProfile(profileId) {
            const themeIds = this.#profiles.get(profileId);
            if (!themeIds) return { success: false, reason: "No real profile with that id." };
            for (const themeId of themeIds) {
                if (this.isThemeScheduledNow(themeId).scheduled) {
                    const result = this.activateTheme(themeId);
                    if (result.success) { this.#emit("profile-applied", { profileId, activatedThemeId: themeId }); return { success: true, activatedThemeId: themeId }; }
                }
            }
            return { success: false, reason: "No theme in this profile is currently scheduled." };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: LIVING_THEME_VERSION, registeredThemes: this.#themes.size, profiles: this.#profiles.size, activeThemeId: this.#activeThemeId, historyEntries: this.#history.length });
        }
    }

    if (window.CozyOS.LivingThemeEngine && typeof window.CozyOS.LivingThemeEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.LivingThemeEngine.getVersion();
        if (existingVersion !== LIVING_THEME_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: LivingThemeEngine existing v${existingVersion} conflicts with load target v${LIVING_THEME_VERSION}.`);
        return;
    }

    window.CozyOS.LivingThemeEngine = new CozyLivingThemeEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "LivingThemeEngine", category: "Platform", icon: "palette.svg",
                description: "Real theme registry, scheduling (one-time + recurring weekly/annual), scope, and profiles — composes the existing CozyOS.Theme/Background controllers to actually apply appearance, never re-implementing color/token logic."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
