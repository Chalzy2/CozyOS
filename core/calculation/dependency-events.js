/**
 * CozyOS Formula Dependency Engine — Events
 * File Reference: core/calculation/dependency-events.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * "Uses PlatformEventBus. Never create another Event Bus." — this file is
 *   a thin wrapper, matching the exact same proven pattern already used
 *   by `VendorEvents` and `OutputEvents`: real emission through the
 *   existing bus, an unrecognized event name rejected outright rather
 *   than silently normalized.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEP_EVENTS_VERSION = "1.0.0-ENTERPRISE";

    const EVENT_NAMES = Object.freeze([
        "dependencyAdded", "dependencyRemoved", "dependencyUpdated",
        "formulaDeprecated", "formulaReplaced", "certificationFailed", "graphUpdated"
    ]);

    class CozyDependencyEvents {
        getVersion() { return DEP_EVENTS_VERSION; }

        emit(eventName, detail = {}) {
            if (!EVENT_NAMES.includes(eventName)) {
                console.warn(`[CozyOS.DependencyEvents] Unknown event "${eventName}" — not emitted, to avoid silently normalizing a typo into a real-looking event.`);
                return;
            }
            const history = window.CozyOS.DependencyHistory;
            if (history && detail.formulaId) history.record(detail.formulaId, eventName, detail);
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`dependency:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        getDiagnosticsReport() {
            return { moduleVersion: DEP_EVENTS_VERSION, recognizedEvents: [...EVENT_NAMES] };
        }
    }

    if (window.CozyOS.DependencyEvents && typeof window.CozyOS.DependencyEvents.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyEvents.getVersion();
        if (existingVersion !== DEP_EVENTS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyEvents existing v${existingVersion} conflicts with load target v${DEP_EVENTS_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyEvents = new CozyDependencyEvents();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyEvents", category: "Platform", icon: "bell.svg",
                description: "Thin wrapper over the existing, real PlatformEventBus for dependency lifecycle events — never a second event bus."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
