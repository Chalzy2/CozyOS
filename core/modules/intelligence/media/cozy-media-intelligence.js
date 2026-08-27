/**
 * CozyOS — Living Media Intelligence Discovery
 * File Reference: core/modules/intelligence/media/cozy-media-intelligence.js
 * Repair: RP-035 Phase 5
 *
 * Baseline: CozyOS-main-RP-035-Phase4.zip
 * SHA-256 2435eda95d11499697f568b2a58025a9081875691d4736fbd3f6df1b1657732e
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   Phase 3 (CozyResearchSearch) — sole search/retrieval authority;
 *     this file only calls its real searchResearchIntelligence()/
 *     searchByPersonReference()/discoverResearchTypes()/
 *     discoverLanguages()/resolveLanguageTerm().
 *   Phase 2 (CozyResearchIntelligence) / Phase 4 (CozyMediaEvidence) —
 *     read-only, never re-implemented.
 *   RP-030 registry / RP-035 Phase 1 country metadata — sole
 *     language/country authority.
 *   ServiceRegistry.registerApplication() / IdentityEngine
 *     .registerCoreApplication() — sole dashboard-visibility
 *     mechanisms; this file registers ONCE through each, never builds
 *     a parallel app registry.
 *   window.CozyOS.ProviderManager — sole provider-discovery mechanism
 *     for CozyAI integration; this file registers a lightweight
 *     health/metadata entry the same way cozy-ai.js itself does. It
 *     does NOT rewire CognitiveCoordinator or claim semantic/LLM
 *     understanding — answerMediaQuestion() below is real, disclosed
 *     deterministic keyword matching against Phase 2/3's own real
 *     vocabularies (RESEARCH_TYPES, RP-030 language names), the exact
 *     same honesty discipline the rule-based conversational provider
 *     already uses elsewhere in this repository.
 *
 * NO FABRICATION
 *   No face recognition, ASR, OCR, embeddings, or semantic NLU is
 *   implemented or claimed anywhere in this file.
 *
 * RULE 82
 *   Read-only throughout. No promote/forceAvailable/approvePack/
 *   setStatus mutator exists in this file.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function rsearch() { const c = cozyOS(); return (c && c.CozyResearchSearch) || null; }
    function research() { const c = cozyOS(); return (c && c.CozyResearchIntelligence) || null; }
    function evidence() { const c = cozyOS(); return (c && c.CozyMediaEvidence) || null; }
    function registry() { const c = cozyOS(); return (c && c.CozyLanguagePacks) || null; }
    function serviceRegistry() { const c = cozyOS(); return (c && c.ServiceRegistry) || null; }
    function identity() { const c = cozyOS(); return (c && c.IdentityEngine) || null; }
    function providerManager() { const c = cozyOS(); return (c && c.ProviderManager) || null; }

    const APP_ID = "media_intelligence_001";
    const APP_NAME = "media-intelligence"; // lowercase/hyphen id used by IdentityEngine's core-app tier

    // -----------------------------------------------------------------
    // 1. TESTIMONY / RESEARCH-TYPE DISCOVERY — dynamic, never hard-coded
    // -----------------------------------------------------------------

    function discoverTestimonies(filters) {
        const rs = rsearch();
        if (!rs) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const types = rs.discoverResearchTypes();
        if (types.status !== "OK") return { status: "CAPABILITY_UNAVAILABLE", results: [] };

        const f = filters || {};
        if (f.researchType && types.types.indexOf(f.researchType) === -1) {
            return { status: "REJECTED", reason: "Unrecognized researchType." };
        }

        const sq = rs.buildStructuredQuery(f.query || "", {
            researchType: f.researchType,
            languageId: f.languageId,
            country: f.country,
            region: f.region,
            community: f.community,
            dialect: f.dialect
        });
        return rs.searchResearchIntelligence(sq);
    }

    // -----------------------------------------------------------------
    // 2. PERSON APPEARANCE / REPEATED-PERSON RESEARCH
    //    Provider-neutral, admin-confirmed only. Never automated.
    // -----------------------------------------------------------------

    function findPersonAppearances(personReference, options) {
        const rs = rsearch();
        if (!rs) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const result = rs.searchByPersonReference(personReference, options);
        // Only ever surface CONFIRMED / real provider-backed appearances
        // for "find every video where this person appears" — an
        // UNCONFIRMED/POSSIBLE reference is real data but is kept
        // separate, never silently promoted to a confirmed appearance.
        if (result.status !== "OK") return result;
        return {
            status: "OK",
            capability: result.capability,
            confirmedAppearances: result.results.filter((r) => r.state === "CONFIRMED"),
            possibleAppearances: result.results.filter((r) => r.state !== "CONFIRMED")
        };
    }

    // -----------------------------------------------------------------
    // 3. TIMESTAMP NAVIGATION — real values only
    // -----------------------------------------------------------------

    function navigateToTimestamp(videoId, timestamp) {
        const rs = rsearch();
        if (!rs) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        return rs.searchByTimestamp(videoId, timestamp);
    }

    // -----------------------------------------------------------------
    // 4. EVIDENCE-AWARE SEARCH SUMMARY — language/country/region/
    //    community/dialect/topic dimensions, composed from Phase 3/4
    // -----------------------------------------------------------------

    function evidenceAwareSearch(query, filters) {
        const base = discoverTestimonies(Object.assign({ query }, filters || {}));
        if (base.status !== "OK") return base;
        const ev = evidence();
        const enriched = base.results.map((r) => {
            let dimensions = null;
            if (ev && r.researchRecordId) {
                dimensions = ev.listEvidence({ researchRecordId: r.researchRecordId }).map((e) => ({ evidenceType: e.evidenceType, value: e.value, confidence: e.confidence }));
            }
            return Object.assign({}, r, { evidenceDimensions: dimensions });
        });
        return Object.assign({}, base, { results: enriched });
    }

    // -----------------------------------------------------------------
    // 5. OFFLINE-FIRST RESEARCH
    // -----------------------------------------------------------------

    function getResearchAvailability() {
        const rs = rsearch();
        if (!rs) return { status: "CAPABILITY_UNAVAILABLE" };
        return rs.getSearchAvailability();
    }

    // -----------------------------------------------------------------
    // 6. COZYAI QUESTION ANSWERING — real, disclosed deterministic
    //    keyword matching only. No semantic/LLM understanding claimed.
    // -----------------------------------------------------------------

    function answerMediaQuestion(question) {
        const rs = rsearch();
        const r = research();
        if (!rs || !r) return { status: "CAPABILITY_UNAVAILABLE", answer: "UNKNOWN" };

        const q = String(question || "").toLowerCase();
        if (!q.trim()) return { status: "REJECTED", answer: "UNKNOWN", reason: "Empty question." };

        const types = rs.discoverResearchTypes();
        const matchedType = types.status === "OK"
            ? types.types.find((t) => q.indexOf(t.toLowerCase()) !== -1)
            : null;

        // Deterministic language-term detection: check every word in
        // the question against RP-030's own real registry, exactly
        // the same resolveLanguageTerm() ambiguity rules Phase 3
        // established — never a fabricated language guess.
        let matchedLanguage = null;
        const reg = registry();
        if (reg) {
            const words = q.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
            for (const w of words) {
                const resolved = rs.resolveLanguageTerm(w);
                if (resolved.status === "RESOLVED" && resolved.interpretation === "LANGUAGE") { matchedLanguage = resolved.languageId; break; }
            }
        }

        if (!matchedType && !matchedLanguage) {
            return { status: "OK", answer: "UNKNOWN", reason: "No recognizable researchType or language term found in the question — never guessed." };
        }

        const sq = rs.buildStructuredQuery(question, { researchType: matchedType || undefined, languageId: matchedLanguage || undefined });
        const results = rs.searchResearchIntelligence(sq);
        if (results.status !== "OK" || !results.results.length) {
            return { status: "OK", answer: "NOT_AVAILABLE", matchedType, matchedLanguage, reason: "No indexed evidence matches this question." };
        }
        return { status: "OK", answer: "FOUND", matchedType, matchedLanguage, resultCount: results.results.length, results: results.results };
    }

    // -----------------------------------------------------------------
    // 7. DASHBOARD REGISTRATION — BUILT_IN core app, real registries only
    // -----------------------------------------------------------------

    function registerAsCoreApplication() {
        const sr = serviceRegistry();
        const idn = identity();
        const outcome = { serviceRegistry: "NOT_ATTEMPTED", coreVisibility: "NOT_ATTEMPTED" };

        if (sr && typeof sr.registerApplication === "function") {
            try {
                sr.registerApplication({
                    id: APP_ID, name: "Media Intelligence", version: VERSION, category: "Core Application",
                    description: "RP-035 Phases 1-5 — testimony/evidence discovery over indexed, authorized media. Composes the real Phase 2/3/4 engines only; no duplicate search/language/privacy logic."
                });
                outcome.serviceRegistry = "REGISTERED";
            } catch (e) { outcome.serviceRegistry = "FAILED"; }
        } else {
            outcome.serviceRegistry = "CAPABILITY_UNAVAILABLE";
        }

        if (idn && typeof idn.registerCoreApplication === "function") {
            try {
                idn.registerCoreApplication(APP_NAME);
                outcome.coreVisibility = "REGISTERED";
            } catch (e) { outcome.coreVisibility = "FAILED"; }
        } else {
            outcome.coreVisibility = "CAPABILITY_UNAVAILABLE";
        }

        return outcome;
    }

    function registerWithProviderManager() {
        const pm = providerManager();
        if (!pm || typeof pm.register !== "function") return { status: "CAPABILITY_UNAVAILABLE" };
        try {
            pm.register({
                id: "cozy-media-intelligence", name: "Media Intelligence Discovery", category: "platform", version: VERSION,
                getHealth: () => ({
                    health: rsearch() ? "ONLINE" : "INITIALIZING",
                    composedEngines: { CozyResearchSearch: !!rsearch(), CozyResearchIntelligence: !!research(), CozyMediaEvidence: !!evidence() }
                })
            });
            return { status: "REGISTERED" };
        } catch (e) { return { status: "FAILED" }; }
    }

    // -----------------------------------------------------------------
    // 8. CAPABILITY REGISTRY
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        const base = evidence() ? evidence().getCapabilityStatus() : {};
        return Object.assign({}, base, {
            testimonyDiscovery: rsearch() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            personAppearanceSearch: rsearch() ? "AVAILABLE_ADMIN_CONFIRMED_ONLY" : "CAPABILITY_UNAVAILABLE",
            cozyAIIntegration: providerManager() ? "REGISTERED_METADATA_ONLY_NO_SEMANTIC_NLU" : "CAPABILITY_UNAVAILABLE",
            dashboardVisibility: (identity() && identity().isCoreApplication(APP_NAME)) ? "BUILT_IN" : "NOT_REGISTERED"
        });
    }

    // -----------------------------------------------------------------
    // 9. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        APP_ID, APP_NAME,
        discoverTestimonies,
        findPersonAppearances,
        navigateToTimestamp,
        evidenceAwareSearch,
        getResearchAvailability,
        answerMediaQuestion,
        registerAsCoreApplication,
        registerWithProviderManager,
        getCapabilityStatus
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-media-intelligence"]) {
        root.window.CozyOS.CozyMediaIntelligence = api;
        root.window.CozyOS.Modules["cozy-media-intelligence"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Phase 5 — Living Media Intelligence Discovery. Composes Phase 2/3/4, RP-030, RP-035 Phase 1, ServiceRegistry, IdentityEngine, ProviderManager real APIs only; no duplicated search/language/privacy/registry/AI logic."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-media-intelligence",
                version: VERSION,
                description: "RP-035 Phase 5 media intelligence discovery coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
