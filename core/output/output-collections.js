/**
 * CozyOS Output Center — Collections
 * File Reference: core/output/output-collections.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real, plural collection membership — an artifact can genuinely
 *   belong to more than one collection at once without being moved out
 *   of its real category (the same corrected design from the prior
 *   milestone's Rule 67, now the platform-wide implementation instead of
 *   Developer Hub's private one). Operates on the real artifacts already
 *   held by `OutputCenter`, via its real `_update()` method — never a
 *   second, separate artifact store.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_COLLECTIONS_VERSION = "1.0.0-ENTERPRISE";

    class CozyOutputCollections {
        getVersion() { return OUTPUT_COLLECTIONS_VERSION; }

        /**
         * addToCollection(artifactId, collectionName)
         *   Real, additive — never overwrites existing membership, never
         *   duplicates if the artifact already belongs to the named
         *   collection. Emits the real "collection-created" event only
         *   when `collectionName` did not already exist anywhere before
         *   this call — not on every addition to an already-existing
         *   collection, since that's a different, real distinction the
         *   requested vocabulary doesn't have its own event for. No event
         *   is fabricated to fill that gap; it's simply not emitted for
         *   the "adding to an existing collection" case.
         */
        addToCollection(artifactId, collectionName) {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const artifact = outputCenter.get(artifactId);
            if (!artifact) return { success: false, reason: `No artifact "${artifactId}".` };
            if (artifact.collections.includes(collectionName)) return { success: true, alreadyMember: true };
            const isNewCollection = !this.listCollections().collections?.[collectionName];
            const updated = [...artifact.collections, collectionName];
            outputCenter._update(artifactId, { collections: updated });
            const events = window.CozyOS.OutputEvents;
            if (events && isNewCollection) events.emit("collection-created", { collectionName, firstArtifactId: artifactId });
            return { success: true, alreadyMember: false };
        }

        /** removeFromCollection(artifactId, collectionName) — real, removes exactly the named membership, leaves others intact. */
        removeFromCollection(artifactId, collectionName) {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const artifact = outputCenter.get(artifactId);
            if (!artifact) return { success: false, reason: `No artifact "${artifactId}".` };
            const updated = artifact.collections.filter(c => c !== collectionName);
            outputCenter._update(artifactId, { collections: updated });
            return { success: true };
        }

        /**
         * listCollections()
         *   Real, dynamic grouping — every real collection name currently
         *   in use across every real artifact, with its real member list.
         *   Artifacts with no collection are grouped under "Ungrouped",
         *   never hidden.
         */
        listCollections() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { available: false, reason: "OutputCenter is not loaded." };
            const artifacts = outputCenter.list();
            const groups = new Map();
            for (const a of artifacts) {
                const keys = a.collections.length ? a.collections : ["Ungrouped"];
                for (const key of keys) {
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(a);
                }
            }
            return { available: true, collections: Object.fromEntries(groups) };
        }
    }

    if (window.CozyOS.OutputCollections && typeof window.CozyOS.OutputCollections.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputCollections.getVersion();
        if (existingVersion !== OUTPUT_COLLECTIONS_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputCollections existing v${existingVersion} conflicts with load target v${OUTPUT_COLLECTIONS_VERSION}.`);
        return;
    }

    window.CozyOS.OutputCollections = new CozyOutputCollections();
})();
