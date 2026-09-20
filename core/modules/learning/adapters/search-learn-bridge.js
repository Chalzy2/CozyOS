/**
 * CozyAI — Search-to-Learn Bridge
 * File Reference: core/modules/learning/adapters/search-learn-bridge.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — explicit Search -> Learn.
 *
 * REPOSITORY REALITY CHECK (performed before writing this file)
 *   The real, only search owner in this repository is
 *   window.CozyOS.SearchEngine (core/engines/search/search-engine.js) —
 *   its own header explicitly discloses it "does NOT own general-purpose
 *   search over CozyOS content... no such surface exists anywhere in
 *   this repository". Its search() already returns a real
 *   {matched, answered, results:[{title, snippet, source}], source}
 *   shape (developer-identity/scripture topics only today) — this file
 *   never modifies SearchEngine and never invents a general search index.
 *   Because no real search-results UI with a clickable "Learn this"
 *   affordance exists anywhere in this repository either (confirmed by
 *   repository-wide search before writing this file), this file provides
 *   the real, callable, explicit-action pipeline a future UI affordance
 *   would call — the same discipline as MultimodalObservationAdapter's
 *   own functions, which are real and tested but likewise not yet
 *   `<script>`-included by any page. The real, existing owner for
 *   SOURCE -> EXTRACTION -> NORMALIZATION -> LANGUAGE ID -> PROVENANCE ->
 *   CANDIDATE (section 6 of the phase brief, verbatim) is
 *   window.CozyOS.CozyKnowledgeIngestion (core/modules/intelligence/
 *   knowledge/cozy-knowledge-ingestion.js, RP-029-A) — this file composes
 *   it directly rather than re-implementing extraction/language-ID/
 *   segmentation/provenance a second time.
 *
 * EXPLICIT ACTION ONLY — NEVER AUTOMATIC
 *   learnFromSearchResult() below is a distinct, separately-invoked
 *   function. Calling SearchEngine.search() alone can never reach this
 *   file — nothing in search-engine.js references this module, and this
 *   file never subscribes to any search event. A result may only ever
 *   become a learning candidate when a caller explicitly invokes
 *   learnFromSearchResult() with a real result AND real, explicit
 *   consent — the same fail-closed discipline
 *   MultimodalObservationAdapter's #buildEnvelope() already establishes
 *   for every other observation source. Cancelling (never calling this
 *   function, or calling it with consent.authorized !== true) creates no
 *   learning record whatsoever — there is no separate "draft" state that
 *   could leak into learning later.
 *
 * TWO REAL, COMPOSED SYSTEMS — NOT ONE NEW ONE
 *   1. CozyKnowledgeIngestion.ingestSource() — the real
 *      SOURCE -> ... -> CANDIDATE knowledge-ingestion pipeline. Its
 *      candidate starts visibility "PRIVATE" (PERSONAL, in this phase's
 *      own scope vocabulary) and is never auto-promoted (see that file's
 *      own header) — this bridge never calls contributeToCommunity()/
 *      contributeToPublic() itself.
 *   2. MultimodalObservationAdapter.fromText() -> ObservationLifecycle —
 *      the SAME governed multimodal pipeline every other observation
 *      source (OCR/audio/document/correction) already uses, so a
 *      Search -> Learn contribution can eventually become real
 *      VerifiedEvidence via ObservationEvidenceBridge and feed back into
 *      semantic understanding via learning-evidence-supplement.js —
 *      never a separate, parallel "search knowledge" system.
 *   Both must succeed for learnFromSearchResult() to report success,
 *   mirroring correction-learning.js's own two-system composition.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    if (window.CozyOS.Modules["search-learn-bridge"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    // Real, disclosed mapping from this phase's own conceptual scope
    // vocabulary (PERSONAL / COZYAI_LANGUAGE_CANDIDATE / COMMUNITY /
    // VERIFIED_GLOBAL — phase brief section 7) onto
    // MultimodalObservationContract's own real, existing LEARNING_SCOPE
    // enum (PERSONAL / COMMUNITY_CANDIDATE / VERIFIED_GLOBAL) — never a
    // second authorization/scope system. VERIFIED_GLOBAL is never
    // reachable from this mapping directly (it is only ever reached via
    // ObservationLifecycle's own real governance, same as every other
    // source).
    function toObservationScope(scope) {
        if (scope === "COZYAI_LANGUAGE_CANDIDATE" || scope === "COMMUNITY" || scope === "COMMUNITY_CANDIDATE") return "COMMUNITY_CANDIDATE";
        return "PERSONAL";
    }

    /**
     * learnFromSearchResult({ result, query, consent, actorId, sessionId,
     *   application, language, scope, licensing })
     *
     *   result: the real {title, snippet, source} shape SearchEngine.
     *   search()'s own results already carry (source = "DeveloperIdentity"
     *   | "Living.scripture" | any future search source using the same
     *   shape). Never accepts a bare string — requires the caller to have
     *   actually selected a real result object, never free-typed text
     *   (free-typed "teach CozyAI" content is correction-learning.js's/
     *   the RP-031 Teach CozyAI flow's own job, not this file's).
     *
     *   Step 1 (ingestion/provenance): CozyKnowledgeIngestion.ingestSource()
     *   with sourceType "USER_PROVIDED_CONTENT" (this content was not
     *   authored by CozyAI — it was selected, by the user, from search —
     *   see that file's own SOURCE_TYPES/header on never representing
     *   user-selected material as though CozyAI itself originally knew
     *   it). meta carries title/origin/sourceId/language exactly as the
     *   phase brief's own provenance list requires.
     *
     *   Step 2 (governed evidence pipeline): MultimodalObservationAdapter.
     *   fromText(), fail-closed on missing/false consent.authorized —
     *   identical discipline to every other observation source.
     */
    function learnFromSearchResult({
        result, query = null, consent, actorId = null, sessionId, application,
        language = null, scope = "PERSONAL", licensing = "LICENSE_UNKNOWN",
    } = {}) {
        if (!isPlainObject(consent) || consent.authorized !== true) {
            return { success: false, reason: "CONSENT_NOT_AUTHORIZED", errors: ["A real, explicit consent.authorized === true is required — no learning record was created."] };
        }
        if (!isPlainObject(result) || !isNonEmptyString(result.snippet)) {
            return { success: false, reason: "NO_SELECTED_RESULT", errors: ["A real, selected search result with a non-empty snippet is required — viewing/searching alone never reaches this function."] };
        }

        const ingestion = window.CozyOS.CozyKnowledgeIngestion;
        if (!ingestion || typeof ingestion.ingestSource !== "function") {
            return { success: false, reason: "CozyKnowledgeIngestion is not loaded." };
        }
        const ingestResult = ingestion.ingestSource({
            sourceType: "USER_PROVIDED_CONTENT",
            content: result.snippet,
            meta: {
                subject: result.title || null,
                origin: result.source || null,
                sourceId: result.source || null,
                title: result.title || null,
                language: language || null,
                context: query ? `search query: "${query}"` : null,
            },
        });
        if (ingestResult.status !== "CANDIDATE_CREATED" && ingestResult.status !== "DUPLICATE") {
            return { success: false, reason: ingestResult.status, errors: [ingestResult.reason], ingestResult };
        }

        const adapter = window.CozyOS.MultimodalObservationAdapter;
        if (!adapter || typeof adapter.fromText !== "function") {
            return { success: false, reason: "MultimodalObservationAdapter is not loaded.", ingestResult };
        }
        const observationResult = adapter.fromText({
            text: result.snippet,
            candidateLanguage: language,
            sessionId, application, actorId,
            context: {
                searchQuery: query || null,
                resultTitle: result.title || null,
                resultSource: result.source || null,
                licensing,
            },
            consent,
            learningScope: toObservationScope(scope),
        });
        if (!observationResult.success) {
            return { success: false, reason: observationResult.reason, errors: observationResult.errors, ingestResult };
        }

        return { success: true, ingestResult, observation: observationResult.observation };
    }

    const SearchLearnBridge = Object.freeze({
        learnFromSearchResult, toObservationScope, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.SearchLearnBridge = SearchLearnBridge;
    window.CozyOS.Modules["search-learn-bridge"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — explicit Search -> Learn. Never triggered by SearchEngine.search() itself (viewing/searching creates no learning). learnFromSearchResult() is a distinct, explicit action requiring a real selected result and real, explicit consent; composes the existing CozyKnowledgeIngestion.ingestSource() (provenance-tagged candidate, private by default, never auto-promoted) AND MultimodalObservationAdapter.fromText()/ObservationLifecycle (same governed pipeline as every other observation source). Not <script>-included by any page."
    });
})();
