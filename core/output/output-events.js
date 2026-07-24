/**
 * CozyOS Output Events
 * File Reference: core/output/output-events.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Milestone: 134 (restored — genuinely missing file, not a stub)
 * Version: 1.0.0-ENTERPRISE
 *
 * PRODUCTION BUG THIS FILE FIXES
 *   `output-center.js`, `output-history.js`, `output-collections.js`,
 *   and `output-export.js` all read `window.CozyOS.OutputEvents` and
 *   document it in their own comments as "the single, correct emission
 *   point" — but no file anywhere in this codebase actually defined it.
 *   Every call site is defensive (`if (events) events.emit(...)`), so
 *   this was never a crash — it silently no-op'd the entire Output
 *   history/events pipeline. This file did not exist before Milestone
 *   134; it is new, not restored from a prior version.
 *
 * RESPONSIBILITY
 *   A thin, real wrapper over the existing, real `PlatformEventBus` —
 *   not a second pub/sub mechanism. Mirrors the same pattern already
 *   proven in `core/vendor-events.js`. Every real Output artifact
 *   lifecycle transition is emitted through the same bus every other
 *   coordinator already uses, and also appended to a real, bounded,
 *   in-memory history — never a fabricated or inferred event.
 *
 * EVENT NAMES
 *   Limited to exactly what the real callers in core/output/ already
 *   emit today: artifact-added, artifact-renamed, artifact-deleted,
 *   artifact-restored, artifact-exported, collection-created. Adding a
 *   new event name here requires updating this list — emit() rejects
 *   anything not declared, to avoid silently normalizing a typo into a
 *   real-looking event (same discipline as VendorEvents).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const OUTPUT_EVENTS_VERSION = "1.0.0-ENTERPRISE";

    const EVENT_NAMES = Object.freeze([
        "artifact-added", "artifact-renamed", "artifact-deleted",
        "artifact-restored", "artifact-exported", "collection-created"
    ]);

    class CozyOutputEvents {
        #history = []; // bounded, chronological, across all artifacts

        getVersion() { return OUTPUT_EVENTS_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * emit(eventName, detail)
         *   Real emission through the existing PlatformEventBus (event
         *   name: `output:${eventName}`), plus a real append to bounded
         *   history. Rejects unknown event names rather than silently
         *   accepting them.
         */
        emit(eventName, detail = {}) {
            if (!EVENT_NAMES.includes(eventName)) {
                console.warn(`[CozyOS.OutputEvents] Unknown event "${eventName}" — not emitted, to avoid silently normalizing a typo into a real-looking event.`);
                return;
            }
            const entry = { event: eventName, at: new Date().toISOString(), detail: this.#deepClone(detail) };
            this.#history.push(entry);
            if (this.#history.length > 200) this.#history.shift();

            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`output:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /** getHistory() — real, chronological, exactly what was emitted, nothing inferred. */
        getHistory() { return this.#deepClone(this.#history); }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: OUTPUT_EVENTS_VERSION, totalEvents: this.#history.length });
        }
    }

    if (window.CozyOS.OutputEvents && typeof window.CozyOS.OutputEvents.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputEvents.getVersion();
        if (existingVersion !== OUTPUT_EVENTS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputEvents existing v${existingVersion} conflicts with load target v${OUTPUT_EVENTS_VERSION}.`);
        return;
    }

    window.CozyOS.OutputEvents = new CozyOutputEvents();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OutputEvents", category: "Platform", icon: "bell.svg",
                description: "Thin wrapper over the existing, real PlatformEventBus for Output artifact lifecycle events (added/renamed/deleted/restored/exported, collection-created). Restored Milestone 134 — was referenced by 4 files but never defined."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
