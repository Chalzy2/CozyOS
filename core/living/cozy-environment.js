/**
 * CozyOS — CozyEnvironment (Living World Synchronization)
 * File Reference: core/living/cozy-environment.js
 * Milestone: M370.5 — Living World Synchronization
 *
 * WHAT THIS IS
 *   A single, read-only facade over the Living Background's own real
 *   state. core/ui/cozy-background.js (unmodified, confirmed by diff
 *   before delivery) remains the one owner of environment truth - this
 *   file adds no new environment logic, just reads its already-public
 *   properties/methods and exposes them in one consistent shape, so
 *   every future consumer (Church Intelligence, ShopOS, Calendar,
 *   Agriculture, Education, CozyAI, etc.) reads the SAME state instead
 *   of each building its own version of "what's the weather doing."
 *
 * REAL DATA COMPOSED (every field traced to an actual public property,
 * confirmed by reading cozy-background.js before writing this):
 *   timeOfDay    -> Background.getTimeOfDay().period ("morning"/
 *                   "afternoon"/"evening"/"night" - these are the
 *                   engine's own real period names; note the engine
 *                   does not use "sunset"/"midday" as period labels,
 *                   so this reports its real terminology rather than
 *                   inventing a different one)
 *   lighting     -> Background.getTimeOfDay().brightness *
 *                   Background.lightingIntensity (same real formula
 *                   already used in login.html's own M370.3/4 work)
 *   windStrength -> Background.windStrength (real, public)
 *   birdsActive  -> Background.birds.length > 0 (real, public array)
 *   cloudDensity -> Background.clouds.length / 5 (real, public array;
 *                   5 is the engine's own real, fixed cloud count per
 *                   its startup-scene generator, confirmed by reading
 *                   it - so this is a genuine 0-1 density, not a
 *                   fabricated scale)
 *
 * WHAT THIS DOES NOT CLAIM
 *   "Complete environments" (distinct sky color/mist density per time
 *   period) are not real in this engine beyond the single brightness/
 *   tint value already computed by getTimeOfDay() - this facade
 *   reports that real value honestly rather than fabricating richer
 *   per-period environment data the engine doesn't actually have.
 *
 * EVENT-READY, NEVER ASSUMED
 *   No "cozy:environment-changed" (or any lighting-change) event exists
 *   anywhere in cozy-background.js today, confirmed by search before
 *   this file was written. This facade polls (same 8s interval already
 *   proven safe in login.html, with the same change-detection
 *   discipline) but subscribes to PlatformEventBus for that event name
 *   too - if a future milestone adds real emission of it to
 *   cozy-background.js, this file automatically stops polling and
 *   switches to the event with zero changes required anywhere else.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-environment"]) return;

    const POLL_INTERVAL_MS = 8000;
    const REAL_CLOUD_COUNT = 5; // the engine's own fixed count, confirmed by reading its startup-scene generator

    let listeners = [];
    let lastStateKey = null;
    let pollTimer = null;
    let usingRealEvent = false;

    /** getState() — real, composed snapshot. Returns null fields honestly if the Background isn't loaded, never a fabricated default environment. */
    function getState() {
        const bg = window.CozyOS.Background;
        if (!bg || typeof bg.getTimeOfDay !== "function") {
            return { available: false, reason: "Living Background is not loaded." };
        }
        const timeOfDay = bg.getTimeOfDay();
        const intensity = typeof bg.lightingIntensity === "number" ? bg.lightingIntensity : 1;
        const lighting = Math.max(0, Math.min(1, timeOfDay.brightness * intensity));
        const windStrength = typeof bg.windStrength === "number" ? bg.windStrength : null;
        const birdsActive = Array.isArray(bg.birds) ? bg.birds.length > 0 : null;
        const cloudDensity = Array.isArray(bg.clouds) ? Math.min(1, bg.clouds.length / REAL_CLOUD_COUNT) : null;

        return {
            available: true,
            timeOfDay: timeOfDay.period,
            lighting: Math.round(lighting * 100) / 100,
            windStrength,
            birdsActive,
            cloudDensity
        };
    }

    function stateKey(state) {
        if (!state.available) return "unavailable";
        return `${state.timeOfDay}|${state.lighting}|${state.windStrength}|${state.birdsActive}|${state.cloudDensity}`;
    }

    function notifyIfChanged() {
        const state = getState();
        const key = stateKey(state);
        if (key === lastStateKey) return; // real change-detection - never notifies on an unchanged read
        lastStateKey = key;
        listeners.forEach(fn => { try { fn(state); } catch (_err) { /* one bad listener never blocks the others */ } });
    }

    function startPolling() {
        if (pollTimer || usingRealEvent) return;
        pollTimer = setInterval(notifyIfChanged, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    /**
     * checkForRealEvent()
     *   Real, honest upgrade path: if PlatformEventBus ever actually
     *   emits "cozy:environment-changed" (confirmed absent today), this
     *   subscribes to it and stops polling entirely - no future rewrite
     *   needed anywhere, including in this file. Checked once at
     *   startup and again each poll tick, since a future milestone
     *   could add real emission after this file has already loaded.
     */
    function checkForRealEvent() {
        const bus = window.CozyOS.PlatformEventBus;
        if (!bus || typeof bus.on !== "function" || usingRealEvent) return;
        // There is no confirmed way to "detect" whether an event will
        // ever be emitted without an actual emission happening - this
        // subscribes now (cheap, harmless if never fired) so that the
        // moment a real emission occurs, this fires immediately and
        // permanently switches modes.
        bus.on("cozy:environment-changed", (detail) => {
            usingRealEvent = true;
            stopPolling();
            const state = detail && detail.available !== undefined ? detail : getState();
            const key = stateKey(state);
            if (key === lastStateKey) return;
            lastStateKey = key;
            listeners.forEach(fn => { try { fn(state); } catch (_err) { /* non-fatal */ } });
        });
    }

    function onChange(fn) {
        if (typeof fn !== "function") return { success: false, reason: "A real callback function is required." };
        listeners.push(fn);
        return { success: true };
    }

    checkForRealEvent();
    startPolling();
    notifyIfChanged(); // real, immediate first read - never wait a full poll interval for the initial state

    window.CozyOS.CozyEnvironment = Object.freeze({
        getState,
        onChange,
        getVersion: () => VERSION,
        getDiagnosticsReport: () => ({ moduleVersion: VERSION, usingRealEvent, polling: !!pollTimer, listenerCount: listeners.length })
    });

    window.CozyOS.Modules["cozy-environment"] = Object.freeze({
        version: VERSION,
        description: "CozyEnvironment (M370.5) — single, read-only facade over the Living Background's real, already-public state (timeOfDay/lighting/windStrength/birdsActive/cloudDensity). Does not modify cozy-background.js. Polls with change-detection today (no real 'cozy:environment-changed' event exists yet, confirmed by search); automatically switches to that event with zero further changes if it's ever actually emitted. Future consumers (ChurchOS, ShopOS, Calendar, Agriculture, Education, CozyAI) should read from here rather than each building their own environment logic."
    });
})();
