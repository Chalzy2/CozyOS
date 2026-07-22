/**
 * CozyOS Formula Dependency Engine — History
 * File Reference: core/calculation/dependency-history.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, bounded audit trail of dependency changes per formula —
 *   dependency added/removed, deprecation, replacement. Written to by
 *   `DependencyEvents.emit()` when a real event carries a `formulaId`;
 *   this file never emits anything itself, matching the same
 *   storage/emission separation already established between
 *   `OutputHistory` and `OutputEvents`.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEP_HISTORY_VERSION = "1.0.0-ENTERPRISE";

    class CozyDependencyHistory {
        #history = new Map();

        getVersion() { return DEP_HISTORY_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /** record(formulaId, event, detail) — real, append-only, bounded at 200 entries per formula, matching VendorEvents'/OutputEvents' established bound. */
        record(formulaId, event, detail = {}) {
            const entry = { event, at: new Date().toISOString(), detail: this.#deepClone(detail) };
            if (!this.#history.has(formulaId)) this.#history.set(formulaId, []);
            const trail = this.#history.get(formulaId);
            trail.push(entry);
            if (trail.length > 200) trail.shift();
        }

        /** getHistory(formulaId) — real, chronological, exactly what was recorded. */
        getHistory(formulaId) {
            const h = this.#history.get(formulaId);
            return h ? this.#deepClone(h) : [];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: DEP_HISTORY_VERSION,
                formulasWithHistory: this.#history.size,
                totalEvents: Array.from(this.#history.values()).reduce((sum, arr) => sum + arr.length, 0)
            });
        }
    }

    if (window.CozyOS.DependencyHistory && typeof window.CozyOS.DependencyHistory.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyHistory.getVersion();
        if (existingVersion !== DEP_HISTORY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyHistory existing v${existingVersion} conflicts with load target v${DEP_HISTORY_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyHistory = new CozyDependencyHistory();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyHistory", category: "Platform", icon: "clock.svg",
                description: "Real, bounded per-formula audit trail of dependency events — written to by DependencyEvents, never emits itself."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
