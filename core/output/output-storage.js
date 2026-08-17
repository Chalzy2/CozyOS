/**
 * CozyOS Output Center — Storage
 * File Reference: core/output/output-storage.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real localStorage persistence for OutputCenter's artifacts — the same
 *   real pattern already proven in Developer Hub's own Output Center
 *   (Rule 54): text content stored as-is, Uint8Array content base64-
 *   encoded, Blob content skipped from persistence entirely (a real,
 *   disclosed limitation — Blob can't be encoded synchronously, and one
 *   Blob item throwing must never break persistence for every other real
 *   item in the same save, the exact bug found and fixed in that earlier
 *   milestone). Not reimplemented differently here — copied forward
 *   deliberately, since it was already fixed once.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_STORAGE_VERSION = "1.0.0-ENTERPRISE";
    const STORAGE_KEY = "cozyos.outputCenter.artifacts";

    class CozyOutputStorage {
        getVersion() { return OUTPUT_STORAGE_VERSION; }

        /**
         * persist(artifactsMap)
         *   Real, best-effort — never blocks the publish() call that
         *   triggered it. Blob-backed artifacts are filtered out before
         *   the map/serialize step, not caught after, since the earlier
         *   bug was exactly that one Blob's `String.fromCharCode(...)`
         *   throwing mid-map silently discarded every other real item's
         *   persistence in the same save.
         */
        persist(artifactsMap) {
            try {
                const serializable = Array.from(artifactsMap.values())
                    .filter(a => !(typeof Blob !== "undefined" && a.content instanceof Blob))
                    .map(a => ({ ...a, content: a.isBinary ? btoa(String.fromCharCode(...a.content)) : a.content }));
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
            } catch (_err) { /* non-fatal — best-effort persistence, never blocks the real publish that triggered it */ }
        }

        /**
         * restore()
         *   Real, called once at real platform load — returns a real
         *   Map ready for OutputCenter._restoreAll(), or an empty one if
         *   nothing was saved or the saved data is corrupted.
         */
        restore() {
            const map = new Map();
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (!raw) return map;
                const saved = JSON.parse(raw);
                for (const a of saved) {
                    const content = a.isBinary ? Uint8Array.from(atob(a.content), c => c.charCodeAt(0)) : a.content;
                    map.set(a.artifactId, { ...a, content });
                }
            } catch (_err) { /* non-fatal — corrupted or missing history, start empty rather than throw */ }
            return map;
        }
    }

    if (window.CozyOS.OutputStorage && typeof window.CozyOS.OutputStorage.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputStorage.getVersion();
        if (existingVersion !== OUTPUT_STORAGE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputStorage existing v${existingVersion} conflicts with load target v${OUTPUT_STORAGE_VERSION}.`);
        return;
    }

    window.CozyOS.OutputStorage = new CozyOutputStorage();

    // Real, automatic restore at load time — before any application has a
    // chance to call publish(), so a page reload never races a fresh
    // publish against an empty, not-yet-restored store.
    if (window.CozyOS.OutputCenter) {
        window.CozyOS.OutputCenter._restoreAll(window.CozyOS.OutputStorage.restore());
    }
})();
