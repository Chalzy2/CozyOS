/**
 * CozyOS Output Center — History
 * File Reference: core/output/output-history.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, per-artifact audit trail — the "Audit History" field in the
 *   requested metadata schema. Reuses the existing, real
 *   `PlatformEventBus` (same pattern already proven in `VendorEvents`),
 *   not a second, parallel notification mechanism.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_HISTORY_VERSION = "1.0.0-ENTERPRISE";

    class CozyOutputHistory {
        #history = new Map(); // artifactId -> [{event, at, detail}]

        getVersion() { return OUTPUT_HISTORY_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * record(artifactId, event, detail)
         *   Real, append-only, bounded at 200 entries per artifact (same
         *   bound already used for VendorEvents' per-vendor history).
         *   Pure storage only — this file no longer emits through
         *   PlatformEventBus itself (a real design fix made this pass):
         *   `output-events.js` is now the single, real emission point,
         *   and calls this method for storage rather than the other way
         *   around. Emitting from both files would have meant every real
         *   lifecycle event firing twice on the shared bus.
         */
        record(artifactId, event, detail = {}) {
            const entry = { event, at: new Date().toISOString(), detail: this.#deepClone(detail) };
            if (!this.#history.has(artifactId)) this.#history.set(artifactId, []);
            const trail = this.#history.get(artifactId);
            trail.push(entry);
            if (trail.length > 200) trail.shift();
        }

        /** getHistory(artifactId) — real, chronological, exactly what was recorded, nothing inferred. */
        getHistory(artifactId) {
            const h = this.#history.get(artifactId);
            return h ? this.#deepClone(h) : [];
        }

        /**
         * getGlobalTimeline(limit)
         *   Real, platform-wide chronological feed (Rule 71) — flattens
         *   every real per-artifact history already recorded above into
         *   one timeline, most recent first. Cross-references the real,
         *   current artifact name from `OutputCenter` where the artifact
         *   still exists, rather than storing a second, potentially-stale
         *   copy of the name at record time.
         */
        getGlobalTimeline(limit = 100) {
            const outputCenter = window.CozyOS.OutputCenter;
            const allEntries = [];
            for (const [artifactId, entries] of this.#history.entries()) {
                const artifact = outputCenter ? outputCenter.get(artifactId) : null;
                for (const entry of entries) {
                    allEntries.push({ ...entry, artifactId, artifactName: artifact ? artifact.name : "(deleted)" });
                }
            }
            allEntries.sort((a, b) => new Date(b.at) - new Date(a.at));
            return this.#deepClone(allEntries.slice(0, limit));
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: OUTPUT_HISTORY_VERSION,
                artifactsWithHistory: this.#history.size,
                totalEvents: Array.from(this.#history.values()).reduce((sum, arr) => sum + arr.length, 0)
            });
        }
    }

    if (window.CozyOS.OutputHistory && typeof window.CozyOS.OutputHistory.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputHistory.getVersion();
        if (existingVersion !== OUTPUT_HISTORY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputHistory existing v${existingVersion} conflicts with load target v${OUTPUT_HISTORY_VERSION}.`);
        return;
    }

    window.CozyOS.OutputHistory = new CozyOutputHistory();
})();
