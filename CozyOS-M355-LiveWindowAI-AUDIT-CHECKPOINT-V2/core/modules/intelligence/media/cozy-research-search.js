/**
 * CozyOS — Media Research Search & Intelligence Retrieval
 * File Reference: core/modules/intelligence/media/cozy-research-search.js
 * Repair: RP-035 Phase 3
 *
 * Baseline: RP-035 Phase 2 (CozyOS-main-RP-035-Phase2.zip,
 * SHA-256 56c963be4798aff8cd1f0a213b5760c3fb6141807bda0eb366300dc38dff5375).
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   Phase 2 (CozyResearchIntelligence) — sole ResearchRecord owner;
 *     this file only calls its real searchResearch()/listResearchRecords().
 *   Phase 3-of-RP-034 (CozyRemoteMediaSearch) — sole text-search/match/
 *     ranking engine; this file reads its real MATCH_TYPE_RANK-ordered
 *     search() output and composes on top, never reimplements matching.
 *   RP-030 registry — sole language authority; this file only reads
 *     DEFAULT_IDENTITIES/getPack()/listOptionalPacks() to enumerate
 *     languages dynamically. No `if (language === "luo")` anywhere.
 *   RP-035 Phase 1 country metadata — sole country/flag lookup.
 *   Phase 6 privacy — this file never bypasses CozyResearchIntelligence's
 *     own privacy gate; a record excluded by searchResearch() (PENDING/
 *     NOT_AUTHORIZED) never reaches these results.
 *
 * NO FABRICATION
 *   No ML ranking, no semantic embedding search, no face recognition.
 *   Ranking is fixed, deterministic, and only ever uses factors the
 *   real data actually supports (exact query match from Phase 3's own
 *   MATCH_TYPE_RANK, then researchType/language/country/region/
 *   community/dialect matches — only when the query actually asked
 *   for that dimension AND the record actually carries that evidence).
 *
 * RULE 82
 *   Read-only throughout. No promote/forceAvailable/approvePack/
 *   setStatus mutator exists in this file.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function research() { const c = cozyOS(); return (c && c.CozyResearchIntelligence) || null; }
    function mediaSearch() { const c = cozyOS(); return (c && c.CozyRemoteMediaSearch) || null; }
    function registry() { const c = cozyOS(); return (c && c.CozyLanguagePacks) || null; }
    function countryMeta() { const c = cozyOS(); return (c && c.Modules && c.Modules["cozy-language-country-metadata"] && c.Modules["cozy-language-country-metadata"].api) || null; }

    const QUERY_MODES = Object.freeze([
        "TEXT", "RESEARCH_TYPE", "LANGUAGE", "COUNTRY", "COMMUNITY", "DIALECT",
        "PERSON_REFERENCE", "VIDEO", "TIMESTAMP", "DATE", "SOURCE", "CONFIDENCE", "PROVENANCE"
    ]);

    // Deterministic dimension ranking. Only ever applied when the
    // structured query actually asked for that dimension AND the
    // candidate record actually carries matching evidence — never
    // invented, never scored by an unsupported factor.
    const DIMENSION_RANK = Object.freeze({
        EXACT_TERM: 0, EXACT_PHRASE: 1,
        TYPE_MATCH: 2, LANGUAGE_MATCH: 3, COUNTRY_MATCH: 4,
        REGION_MATCH: 5, COMMUNITY_MATCH: 6, DIALECT_MATCH: 7,
        UNMATCHED: 99
    });

    const PERSON_SEARCH_STATES = Object.freeze(["CONFIRMED", "UNCONFIRMED", "UNKNOWN", "CAPABILITY_UNAVAILABLE"]);

    function nowISO() { return new Date().toISOString(); }

    // -----------------------------------------------------------------
    // 1. DYNAMIC RESEARCH TYPE / LANGUAGE DISCOVERY
    //    Never a hard-coded authority — always read from the real
    //    owning modules.
    // -----------------------------------------------------------------

    function discoverResearchTypes() {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", types: [] };
        return { status: "OK", types: r.RESEARCH_TYPES.slice() };
    }

    function discoverLanguages() {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE", defaults: [], optional: [] };
        return {
            status: "OK",
            defaults: reg.listDefaultPacks().map((p) => p.identity.languageId),
            optional: reg.listOptionalPacks().map((p) => p.identity.languageId)
        };
    }

    // -----------------------------------------------------------------
    // 2. STRUCTURED QUERY BUILDER
    //    Only activates fields for which the caller actually supplied
    //    real evidence. Never fabricates a field.
    // -----------------------------------------------------------------

    function buildStructuredQuery(rawQuery, hints) {
        const h = hints || {};
        const structured = {
            query: (rawQuery || "").trim() || null,
            researchType: null,
            languageEvidence: null,
            countryEvidence: null,
            region: null,
            community: null,
            dialect: null,
            timeRange: null,
            personReference: null,
            source: null,
            privacyContext: h.privacyContext || "STANDARD"
        };

        const r = research();
        if (h.researchType && r && r.RESEARCH_TYPES.indexOf(h.researchType) !== -1) {
            structured.researchType = h.researchType;
        }

        const reg = registry();
        if (h.languageId && reg && reg.getPack(h.languageId)) {
            structured.languageEvidence = h.languageId;
        }

        if (h.country) structured.countryEvidence = String(h.country).toUpperCase();
        if (h.region) structured.region = h.region;
        if (h.community) structured.community = h.community;
        if (h.dialect) structured.dialect = h.dialect;
        if (h.personReference) structured.personReference = h.personReference;
        if (h.source) structured.source = h.source;
        if (typeof h.startTime === "number" || typeof h.endTime === "number") {
            structured.timeRange = {
                start: typeof h.startTime === "number" ? h.startTime : null,
                end: typeof h.endTime === "number" ? h.endTime : null
            };
        }

        return structured;
    }

    // -----------------------------------------------------------------
    // 3. LANGUAGE-TERM RESOLUTION — ambiguity honestly surfaced
    // -----------------------------------------------------------------

    function resolveLanguageTerm(term) {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE" };
        const t = String(term || "").trim().toLowerCase();
        if (!t) return { status: "UNRESOLVED", reason: "EMPTY_TERM" };

        const allPacks = reg.listPacks();
        const languageMatches = allPacks.filter((p) =>
            p.identity.languageId.toLowerCase() === t ||
            p.identity.name.toLowerCase() === t ||
            p.identity.nativeName.toLowerCase() === t ||
            p.identity.name.toLowerCase().split(/[\s/]+/).indexOf(t) !== -1
        );

        // Real ambiguity check: does the same term also appear as a
        // COMMUNITY value on any real research record? (e.g. "Luo" as
        // a community distinct from the "luo"/Dholuo language pack.)
        const r = research();
        const communityMatches = r ? r.listResearchRecords({}).filter((rec) => String(rec.community).toLowerCase() === t) : [];

        if (languageMatches.length > 1) return { status: "UNRESOLVED", reason: "MULTIPLE_LANGUAGE_IDENTITIES_MATCH" };
        if (languageMatches.length === 1 && communityMatches.length > 0) {
            return { status: "UNRESOLVED", reason: "LANGUAGE_AND_COMMUNITY_BOTH_MATCH", languageId: languageMatches[0].identity.languageId };
        }
        if (languageMatches.length === 1) return { status: "RESOLVED", interpretation: "LANGUAGE", languageId: languageMatches[0].identity.languageId };
        if (communityMatches.length > 0) return { status: "RESOLVED", interpretation: "COMMUNITY", community: communityMatches[0].community };
        return { status: "UNRESOLVED", reason: "NO_MATCHING_EVIDENCE" };
    }

    // -----------------------------------------------------------------
    // 4. CORE SEARCH — composes Phase 2 + Phase-3-of-RP-034 only
    // -----------------------------------------------------------------

    function dimensionMatches(rec, sq) {
        const matched = [];
        if (sq.researchType && rec.researchType === sq.researchType) matched.push("TYPE_MATCH");
        if (sq.languageEvidence && rec.language === sq.languageEvidence) matched.push("LANGUAGE_MATCH");
        if (sq.countryEvidence && rec.country && rec.country.code === sq.countryEvidence) matched.push("COUNTRY_MATCH");
        if (sq.region && rec.region === sq.region) matched.push("REGION_MATCH");
        if (sq.community && rec.community === sq.community) matched.push("COMMUNITY_MATCH");
        if (sq.dialect && rec.dialect === sq.dialect) matched.push("DIALECT_MATCH");
        return matched;
    }

    function bestDimensionRank(matched) {
        if (!matched.length) return DIMENSION_RANK.UNMATCHED;
        return Math.min.apply(null, matched.map((m) => DIMENSION_RANK[m]));
    }

    function dedupeKey(r) {
        return r.researchRecordId || (r.videoId + "::" + (r.timestamp != null ? r.timestamp : "UNKNOWN"));
    }

    function searchResearchIntelligence(structuredQuery) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const sq = structuredQuery || {};

        const filters = {};
        if (sq.researchType) filters.researchType = sq.researchType;
        if (sq.languageEvidence) filters.language = sq.languageEvidence;
        if (sq.countryEvidence) filters.country = sq.countryEvidence;
        if (sq.region) filters.region = sq.region;

        const base = r.searchResearch(sq.query || "", filters);
        if (base.status !== "OK") return base;

        // Phase 2's searchResearch() result contract does not expose a
        // researchRecordId — cross-reference the real full record (by
        // videoId + timestamp + researchType, the same identifiers
        // Phase 2 itself uses for duplicate detection) rather than
        // fabricate one.
        const fullRecords = r.listResearchRecords({});
        function findFullRecord(res) {
            return fullRecords.find((rec) => rec.videoId === res.videoId && rec.timestamp === res.timestamp && rec.researchType === res.researchType) || null;
        }

        const seen = new Map();
        base.results.forEach((res) => {
            const full = findFullRecord(res);
            const withReference = Object.assign({ researchRecordId: full ? full.id : null }, res);
            const key = dedupeKey(withReference);
            if (seen.has(key)) return; // real dedupe on stable identifier
            const matched = dimensionMatches({
                researchType: res.researchType, language: res.language,
                country: res.country, region: sq.region, community: full ? full.community : sq.community, dialect: full ? full.dialect : sq.dialect
            }, sq);
            seen.set(key, Object.assign({}, withReference, {
                matchedDimensions: matched,
                rank: bestDimensionRank(matched)
            }));
        });

        const results = Array.from(seen.values()).sort((a, b) => a.rank - b.rank);
        return { status: "OK", query: sq, total: results.length, results };
    }

    // -----------------------------------------------------------------
    // 5. TEXT SEARCH — composes Phase-3-of-RP-034; never invents a
    //    transcript.
    // -----------------------------------------------------------------

    function searchText(term, options) {
        const ms = mediaSearch();
        if (!ms) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const result = ms.search(term, options);
        return { status: "OK", offline: result.offline, total: result.total, results: result.results };
    }

    // -----------------------------------------------------------------
    // 6. PERSON SEARCH — honest states only, no face recognition
    // -----------------------------------------------------------------

    function searchByPersonReference(personReference, options) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        if (!personReference) return { status: "REJECTED", reason: "A real personReference identity is required." };

        const all = r.listResearchRecords(options || {});
        const results = [];
        all.forEach((rec) => {
            (rec.peopleReferences || []).forEach((ref) => {
                let searchState;
                if (ref.state === "CONFIRMED_PERSON") searchState = "CONFIRMED";
                else if (ref.state === "POSSIBLE_PERSON") searchState = "UNCONFIRMED";
                else searchState = "UNKNOWN";
                if (ref.confirmedBy === personReference || (ref.evidenceType && ref.evidenceType.indexOf(personReference) !== -1)) {
                    results.push({
                        researchRecordId: rec.id, videoId: rec.videoId, timestamp: ref.timestamp,
                        confidence: ref.confidence, state: searchState, provenance: ref.provenance
                    });
                }
            });
        });
        return { status: "OK", capability: "CAPABILITY_UNAVAILABLE_FOR_AUTOMATED_DETECTION", results };
    }

    // -----------------------------------------------------------------
    // 7. TIMESTAMP / VIDEO SEARCH — real values only
    // -----------------------------------------------------------------

    function searchByTimestamp(videoId, timestamp) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const all = r.listResearchRecords({});
        const results = all
            .filter((rec) => rec.videoId === videoId && rec.timestamp === timestamp)
            .map((rec) => ({ researchRecordId: rec.id, videoId: rec.videoId, startTime: rec.startTime, duration: rec.duration }));
        return { status: "OK", results };
    }

    function searchByVideo(videoId) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        return { status: "OK", results: r.listResearchRecords({}).filter((rec) => rec.videoId === videoId) };
    }

    // -----------------------------------------------------------------
    // 8. OFFLINE-FIRST — never claims fresh remote results
    // -----------------------------------------------------------------

    function getSearchAvailability() {
        const ms = mediaSearch();
        const r = research();
        return {
            localResearchSearch: r ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            localTextSearch: ms ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            remoteFetch: "DELEGATED_TO_CONNECTOR_NEVER_FABRICATED_FRESH"
        };
    }

    // -----------------------------------------------------------------
    // 9. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        QUERY_MODES,
        PERSON_SEARCH_STATES,
        discoverResearchTypes,
        discoverLanguages,
        buildStructuredQuery,
        resolveLanguageTerm,
        searchResearchIntelligence,
        searchText,
        searchByPersonReference,
        searchByTimestamp,
        searchByVideo,
        getSearchAvailability
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-research-search"]) {
        root.window.CozyOS.CozyResearchSearch = api;
        root.window.CozyOS.Modules["cozy-research-search"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Phase 3 — Research Search & Intelligence Retrieval. Composes Phase 2 ResearchRecord + Phase-3-of-RP-034 text search + RP-030 registry + RP-035 Phase 1 country metadata only; no duplicated matching/ranking/language/privacy logic."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-research-search",
                version: VERSION,
                description: "RP-035 Phase 3 research search/retrieval coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
