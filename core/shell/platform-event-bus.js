/**
 * CozyOS Platform Event Bus
 * File Reference: core/shell/platform-event-bus.js
 * Layer: Core / Shared Shell Service — Cross-Platform Communication
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP (Rule 32)
 *   The ONE shared event bus every CozyOS coordinator, engine, and
 *   application should communicate through. Per the CozyOS Shared Platform
 *   Strengthening directive: "Ensure all communication happens through
 *   shared platform services. No duplicated implementations."
 *
 * HONEST STATUS (not glossed over)
 *   Several already-built, already-certified coordinators in this project
 *   (CozyContextEngine, CozyPluginManager, and likely others) each carry
 *   their OWN private on/off/once/emit implementation, independent of this
 *   shared bus — real, pre-existing duplication this file is meant to
 *   replace going forward. None of those coordinators have been rewired to
 *   use this bus yet: doing so would mean touching multiple already-
 *   certified files at once, which is exactly the "redesign completed
 *   architecture" this directive says not to do without it being a
 *   deliberate, explicitly-approved step. See the migration log for the
 *   exact dated status of this gap and the decision this needs.
 *
 * PRESERVED BEHAVIOR
 *   The public API and behavior below is exactly what was provided,
 *   wrapped into CozyOS's standard file/registration conventions. Two
 *   specific hardenings were made, both explicitly within the requested
 *   "listener management / memory cleanup" strengthening scope, not a
 *   redesign — see the inline comments at each change.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const EVENTBUS_VERSION = "1.0.0-ENTERPRISE";

    const PlatformEventBus = {
        events: new Map(),
        // Hardening #1 (listener management): tracks original handler ->
        // wrapper, so off(event, originalHandler) correctly cancels a
        // pending once() registration even before it has fired. The
        // as-provided version had no such mapping, so off() with the
        // original handler silently did nothing in that case.
        _onceWrappers: new WeakMap(),

        getVersion() { return EVENTBUS_VERSION; },

        on(event, callback) {
            if (typeof event !== "string" || !event.trim()) throw new TypeError("Invalid event name.");
            if (typeof callback !== "function") throw new TypeError("Callback must be a function.");

            if (!this.events.has(event)) this.events.set(event, new Set());
            this.events.get(event).add(callback);
            return () => this.off(event, callback);
        },

        once(event, callback) {
            const wrapper = (data) => {
                this.off(event, wrapper);
                this._onceWrappers.delete(callback);
                callback(data);
            };
            this._onceWrappers.set(callback, wrapper);
            return this.on(event, wrapper);
        },

        off(event, callback) {
            const set = this.events.get(event);
            if (set) {
                // Hardening #1 continued: if `callback` is an original
                // handler registered via once(), remove its wrapper too.
                const wrapper = this._onceWrappers.get(callback);
                if (wrapper) { set.delete(wrapper); this._onceWrappers.delete(callback); }
                set.delete(callback);
                if (set.size === 0) this.events.delete(event); // Prevent memory leak
            }
        },

        emit(event, data) {
            if (typeof event !== "string" || !event.trim()) throw new TypeError("Invalid event name.");
            const set = this.events.get(event);
            if (set) {
                // Hardening #2 (memory cleanup / correctness): iterate a
                // snapshot, not the live Set. The as-provided version ran
                // set.forEach(...) directly on the live Set — if a
                // listener subscribes or unsubscribes another listener for
                // the SAME event during emit, behavior depended on Set
                // mutation-during-iteration semantics rather than being
                // deterministic. A snapshot makes "this emit calls exactly
                // the listeners registered at the moment emit() was
                // called" an explicit guarantee.
                Array.from(set).forEach(cb => {
                    try { cb(data); } catch (e) { console.error(`PlatformEventBus error [${event}]:`, e); }
                });
            }
        },

        getDiagnostics() {
            const stats = { moduleVersion: EVENTBUS_VERSION, totalListeners: 0, events: {} };
            this.events.forEach((set, event) => {
                stats.totalListeners += set.size;
                stats.events[event] = { listenerCount: set.size };
            });
            return stats;
        }
    };

    if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.getVersion === "function") {
        const existingVersion = window.CozyOS.PlatformEventBus.getVersion();
        if (existingVersion !== EVENTBUS_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: PlatformEventBus existing v${existingVersion} conflicts with load target v${EVENTBUS_VERSION}.`);
        }
        return;
    }

    window.CozyOS.PlatformEventBus = PlatformEventBus;

    // Auto-register with the Service Registry — same bounded-retry pattern
    // used by every other CozyOS coordinator.
    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) clearInterval(intervalId);
        }, 250);
    })({
        name: "PlatformEventBus", category: "Foundation", icon: "event-bus.svg",
        description: "CozyOS Platform Event Bus — the single shared pub/sub every coordinator and application should communicate through. Not yet adopted by all existing coordinators; see migration log."
    });
})();
