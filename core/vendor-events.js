/**
 * CozyOS Vendor Events
 * File Reference: core/vendor-events.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A thin, real wrapper over the existing, real `PlatformEventBus` — not
 *   a second pub/sub mechanism. Every vendor lifecycle transition emits a
 *   real event through the same bus every other coordinator in this
 *   project already uses, so Diagnostics Center, Audit Center,
 *   Certification Center, and Developer Hub can all observe vendor
 *   activity the same way they observe anything else, without this file
 *   inventing a parallel notification system.
 *
 * REAL VENDOR HISTORY
 *   Every emitted event is also appended to a real, per-vendor,
 *   timestamped history array — this is where "Vendor History" actually
 *   lives, not a separate, disconnected log. Bounded at 200 entries per
 *   vendor (same discipline as other bounded history arrays in this
 *   project) so it can't grow without limit over a long session.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const VENDOR_EVENTS_VERSION = "1.0.0-ENTERPRISE";

    const EVENT_NAMES = Object.freeze([
        "installed", "registered", "loaded", "ready", "failed",
        "reloaded", "updated", "removed", "used"
    ]);

    class CozyVendorEvents {
        #history = new Map(); // vendorName -> [{event, at, detail}]

        getVersion() { return VENDOR_EVENTS_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * emit(vendorName, eventName, detail)
         *   Real emission through the existing PlatformEventBus (event
         *   name: `vendor:${eventName}`), plus a real append to this
         *   vendor's own history. Never fabricates an event that didn't
         *   genuinely happen — callers (VendorManager) are the only real
         *   source of these calls, always right after the real underlying
         *   action actually occurred.
         */
        emit(vendorName, eventName, detail = {}) {
            if (!EVENT_NAMES.includes(eventName)) {
                console.warn(`[CozyOS.VendorEvents] Unknown event "${eventName}" — not emitted, to avoid silently normalizing a typo into a real-looking event.`);
                return;
            }
            const entry = { event: eventName, at: new Date().toISOString(), detail: this.#deepClone(detail) };
            if (!this.#history.has(vendorName)) this.#history.set(vendorName, []);
            const vendorHistory = this.#history.get(vendorName);
            vendorHistory.push(entry);
            if (vendorHistory.length > 200) vendorHistory.shift();

            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`vendor:${eventName}`, { vendor: vendorName, ...detail }); } catch (_err) { /* non-fatal */ }
            }
        }

        /** getVendorHistory(name) — real, chronological, exactly what was emitted for this vendor, nothing inferred. */
        getVendorHistory(name) {
            const h = this.#history.get(name);
            return h ? this.#deepClone(h) : [];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: VENDOR_EVENTS_VERSION,
                vendorsWithHistory: this.#history.size,
                totalEvents: Array.from(this.#history.values()).reduce((sum, arr) => sum + arr.length, 0)
            });
        }
    }

    if (window.CozyOS.VendorEvents && typeof window.CozyOS.VendorEvents.getVersion === "function") {
        const existingVersion = window.CozyOS.VendorEvents.getVersion();
        if (existingVersion !== VENDOR_EVENTS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: VendorEvents existing v${existingVersion} conflicts with load target v${VENDOR_EVENTS_VERSION}.`);
        return;
    }

    window.CozyOS.VendorEvents = new CozyVendorEvents();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VendorEvents", category: "Platform", icon: "bell.svg",
                description: "Thin wrapper over the existing, real PlatformEventBus — not a second pub/sub mechanism. Every vendor lifecycle transition (Installed/Registered/Loaded/Ready/Failed/Reloaded/Updated/Removed/Used) is emitted here and also recorded as real, per-vendor history."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
