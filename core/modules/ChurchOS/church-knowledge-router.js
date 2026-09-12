/**
 * ChurchOS — Knowledge Router (M336)
 * core/modules/ChurchOS/church-knowledge-router.js
 *
 * OWNERSHIP: pure composition over real, existing engines - never a
 * second search index or knowledge store. Answers "what did our
 * church teach about X" by querying every real source that actually
 * has data, tagging each result with its real, honest source.
 *
 * REAL SOURCES COMPOSED:
 *   Living.scripture.search() (M340 gateway; M342 update - routed
 *   through the gateway instead of calling BibleEngine.searchVerses()
 *   (M334/M335) directly, same underlying engine, one governed path)
 *   ChurchWorshipSession.searchArchivedServices() (M329/M332, real
 *   persistence added in M336)
 *   KnowledgeProvenanceEngine (M330/M331)
 *
 *   HONEST GAPS, not fabricated: this is real keyword/substring
 *   search across each real source, not semantic/meaning-based search
 *   ("God's love" will not find "John 3:16" unless those literal
 *   words appear) - no real embedding/semantic-search engine exists
 *   in this repository. Meeting records and testimony archives are
 *   not yet separate real sources here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ChurchKnowledgeRouter) return;

    class CozyChurchKnowledgeRouter {
        searchAll(query, orgId) {
            if (!query) return { success: false, reason: "A real query string is required." };
            const results = { bible: null, sermons: null, sourcesQueried: [], sourcesUnavailable: [] };

            // M342: routed through the real Living.scripture gateway (M340)
            // instead of calling BibleEngine directly - same real
            // BibleEngine.searchVerses() underneath, one governed entry
            // point for every consumer.
            const living = window.CozyOS.Living;
            if (living && living.scripture && typeof living.scripture.search === "function") {
                results.bible = living.scripture.search(query).results?.map(v => ({ ...v, source: "Bible" })) || [];
                results.sourcesQueried.push("Bible");
            } else {
                results.sourcesUnavailable.push("Bible (Living.scripture gateway not loaded)");
            }

            const worship = window.CozyOS.ChurchWorshipSession;
            if (worship && orgId) {
                const sermonResult = worship.searchArchivedServices(orgId, query);
                results.sermons = sermonResult.available ? sermonResult.results.map(s => ({ ...s, source: "Sermon Archive" })) : [];
                results.sourcesQueried.push("Sermon Archive");
            } else {
                results.sourcesUnavailable.push(orgId ? "Sermon Archive (ChurchWorshipSession not loaded)" : "Sermon Archive (no orgId provided)");
            }

            const totalResults = (results.bible?.length || 0) + (results.sermons?.length || 0);
            return { success: true, query, orgId, totalResults, ...results };
        }

        getKnowledgeWithProvenance(term, meaning) {
            const provenance = window.CozyOS.KnowledgeProvenanceEngine;
            if (!provenance) return { available: false, reason: "KnowledgeProvenanceEngine is not loaded." };
            const knowledgeId = `knowledge_${term}_${meaning}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            const result = provenance.getProvenance(knowledgeId, term, meaning);
            if (!result.available) return result;

            const level = result.confidence?.level ?? 0;
            const confidenceLabel = level >= 4 ? "Verified" : level >= 1 ? "Pending" : "Needs Review";
            return {
                available: true,
                source: "Verified Knowledge", term, meaning,
                confidenceLabel, confidenceLevel: level,
                sharingScope: result.currentRecord?.sharingScope || "private",
                approvedBy: result.currentRecord?.approvedBy || null
            };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "ChurchKnowledgeRouter"; }
        getDependencies() { return ["Living", "ChurchWorshipSession", "KnowledgeProvenanceEngine"]; }
    }

    window.CozyOS.ChurchKnowledgeRouter = new CozyChurchKnowledgeRouter();
})();
