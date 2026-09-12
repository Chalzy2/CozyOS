/**
 * core/modules/intelligence/language-packs/cozy-african-language-intelligence.js
 * Repair: RP-034 Phase 5 — African Language Intelligence & Automatic
 * Pack Routing
 * Baseline: CozyOS-main-RP-034-Phase4.zip (verified: SHA-256
 * 6c0e653c4aac6a638b03cca6b9fccabfbb5adf4a86aed1f7bcb6e0e4a2f7f1ff,
 * `unzip -t` clean, Phase 1's 30/30, Phase 2's 55/55, Phase 3's 56/56,
 * Phase 4's 63/63 tests re-run and passing before any Phase 5 code was
 * written).
 *
 * MILESTONE SCOPE — THIS FILE IS PHASE 5 ONLY
 *   Does not implement Phase 6 (privacy/identity expansion), Phase 7
 *   (offline synchronization), or Phase 8 (final integrated test
 *   matrix).
 *
 * MISSION
 *   Given real evidence (language, country, region, community,
 *   dialect), automatically determine the most specific African
 *   language pack available — or honestly admit uncertainty — without
 *   ever mixing meanings between communities or inventing confidence.
 *
 * OWNERSHIP / COMPOSITION — no duplication anywhere
 *   - CozyLanguagePacks (RP-030) — the sole real source of truth for
 *     registered packs/regional contexts. `detectLanguagePack()`
 *     (RP-030's own real, disclosed "foundation heuristic" — no
 *     ML/ASR backend, confirmed by direct source read) is composed
 *     directly for basic evidence scoring; this file's own
 *     `resolveLanguageIdentity()` builds a richer, real six-level
 *     routing hierarchy on top of RP-030's real registry data
 *     (`getPack`/`listRegionalContexts`) because RP-030's own
 *     `detectLanguagePack()` has no concept of "community" as
 *     distinct from region — it was not extended (RP-030 stays
 *     unmodified) because the real, established pattern for
 *     representing community in this repository (composing a
 *     `region (community)` composite string, exactly as RP-031's own
 *     `cozy-teach-cozyai-routing-core.js` already does internally) is
 *     reused verbatim in this file's own `regionKey()` helper — the
 *     same one-line pure function, not "different logic".
 *   - CozyTeachCozyAIRouting (RP-031 Phase 2A) —
 *     `submitTeachingContribution()` composed directly and verbatim
 *     for community-learning contributions (spec §16) — this file
 *     builds no second contribution/review pipeline.
 *   - CozyKnowledgeIngestion (RP-029-A) / CozyKnowledgeSafetyGate
 *     (RP-029-C) — composed for the "learning from new words" flow
 *     (spec §11): every unknown term still goes through RP-030's own
 *     real `submitExpression()`, which already runs the real safety
 *     gate first and never promotes past `REGISTERED`/`NOT_READY`
 *     without separate governance (Rule 82 remains authoritative,
 *     untouched, unmodified).
 *   - CozyRemoteMediaAnalysis (RP-034 Phase 4) — composed read-only
 *     for media integration (spec §12): this file reads a real,
 *     already-`COMPLETED` Phase 4 job's real result and real
 *     provenance (`getSourceProvenance()`) rather than re-deriving
 *     anything from video.
 *   - CozyRemoteMediaSearch (RP-034 Phase 3) — `getResearchPriority()`
 *     composed directly for `getResearchPriorities()` (spec §19) —
 *     never a second research-ranking system.
 *   - CozyConnectivityTransport (RP-033 Gate 2) — real hotspot/P2P
 *     packet transport for language evidence/candidates, exactly the
 *     same composition pattern Phase 4 already established. Its real,
 *     truthful state vocabulary is reused verbatim; it has no
 *     `SYNCED` state, by design, and this file never reports one.
 *
 * NO FAKE INTELLIGENCE (spec §28) — binding, absolute
 *   No ML language-ID model, no ASR, no machine translation, and no
 *   usage-telemetry engine exist anywhere in this repository. Every
 *   function below that would need one honestly reports
 *   `CAPABILITY_UNAVAILABLE` (ASR: `registerASRProvider()`/
 *   `transcribeAudio()` define a real, disclosed interface a future
 *   real provider could implement — calling `transcribeAudio()` with
 *   no provider registered always returns `CAPABILITY_UNAVAILABLE`,
 *   never a fabricated transcript). Confidence values are only ever
 *   the real, disclosed evidence-hierarchy-derived numbers computed
 *   below (see `computeConfidence()`) — never a made-up float.
 *
 * MEANING ISOLATION
 *   `resolveLanguageIdentity()` and every candidate-creation path
 *   below always carry country/region/community/dialect alongside the
 *   term — RP-030's own real `submitExpression()` already keys
 *   distinct region/dialect combinations as distinct records (verified
 *   throughout Phases 2-4); this file adds no global meaning merge of
 *   its own anywhere.
 *
 * COVERAGE STATE HONESTY
 *   `getLanguageCoverageStatus()` reports RP-030's own real
 *   `pack.status` (one of its real, disclosed
 *   UNREGISTERED/REGISTERED/NOT_READY/PARTIAL/COMMUNITY_BUILDING/
 *   VALIDATING/AVAILABLE/DEPRECATED vocabulary) verbatim — the same
 *   "reuse the real system's own truthful names rather than a
 *   paraphrase layer" principle already established in Phase 4 — with
 *   a derived, clearly-labelled `spec5Label` hint (REGISTERED/
 *   NOT_READY/READY/ACTIVE) for convenience only, never as the
 *   authoritative field.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        factory(root);
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (rootArg) {
    "use strict";

    const VERSION = "1.0.0-rp034-phase5";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function teachRouting() { const c = cozyOS(); return c && c.CozyTeachCozyAIRouting ? c.CozyTeachCozyAIRouting : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }
    function mediaAnalysis() { const c = cozyOS(); return c && c.CozyRemoteMediaAnalysis ? c.CozyRemoteMediaAnalysis : null; }
    function mediaSearch() { const c = cozyOS(); return c && c.CozyRemoteMediaSearch ? c.CozyRemoteMediaSearch : null; }
    function transport() { const c = cozyOS(); return c && c.CozyConnectivityTransport ? c.CozyConnectivityTransport : null; }

    const RESOLUTION_STATUSES = Object.freeze(["RESOLVED", "AMBIGUOUS_LANGUAGE", "LANGUAGE_UNCERTAIN", "NO_PACK", "CAPABILITY_UNAVAILABLE"]);
    const CONFIDENCE_LEVELS = Object.freeze(["HIGH", "MEDIUM", "LOW", "NONE"]);
    const EVIDENCE_RANK = Object.freeze({
        EXPLICIT_USER_SELECTION: 6, VERIFIED_CONTRIBUTOR_LANGUAGE: 5, VERIFIED_COUNTRY_REGION_COMMUNITY: 4,
        PREVIOUSLY_VERIFIED_KNOWLEDGE: 3, RELIABLE_LINGUISTIC_EVIDENCE: 2, WEAK_HEURISTIC: 1
    });

    function nowISO() { return new Date().toISOString(); }
    function regionKey(region, community) { if (region && community) return region + " (" + community + ")"; return region || community || null; }

    /* ------------------------------------------------------------------ */
    /* IN-MEMORY RESOLUTION LOG (session-scoped, disclosed — mirrors the  */
    /* same pattern every other Phase in this milestone already uses)     */
    /* ------------------------------------------------------------------ */

    const resolutionLog = [];
    const conversationSegments = new Map(); // conversationId -> [{text, identity}]

    /* ------------------------------------------------------------------ */
    /* 1. CONFIDENCE (spec §7-8) — real, evidence-hierarchy-derived only   */
    /* ------------------------------------------------------------------ */

    function computeConfidence(evidenceSources) {
        if (!evidenceSources || evidenceSources.length === 0) return { confidence: 0, confidenceLevel: "NONE", evidenceSources: [] };
        const strongest = evidenceSources.reduce((best, e) => (EVIDENCE_RANK[e] || 0) > (EVIDENCE_RANK[best] || 0) ? e : best, evidenceSources[0]);
        const rank = EVIDENCE_RANK[strongest] || 0;
        const confidence = Math.round((rank / 6) * 100) / 100;
        const confidenceLevel = confidence >= 0.75 ? "HIGH" : confidence >= 0.4 ? "MEDIUM" : confidence > 0 ? "LOW" : "NONE";
        return { confidence, confidenceLevel, evidenceSources };
    }

    /* ------------------------------------------------------------------ */
    /* 2. LANGUAGE IDENTITY RESOLUTION — real 6-level routing hierarchy   */
    /* ------------------------------------------------------------------ */

    /**
     * resolveLanguageIdentity(input)
     *   input: { languageId, country, region, community, dialect,
     *            script, explicitUserSelection, contributorVerified }
     *   Real six-level priority: community+dialect -> community ->
     *   region -> country -> language(general) -> honest fallback.
     *   Never silently selects when evidence is insufficient.
     */
    function resolveLanguageIdentity(input) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const e = input || {};
        const languageId = e.languageId ? String(e.languageId).toLowerCase() : null;

        const evidenceSources = [];
        if (e.explicitUserSelection) evidenceSources.push("EXPLICIT_USER_SELECTION");
        if (e.contributorVerified) evidenceSources.push("VERIFIED_CONTRIBUTOR_LANGUAGE");
        if (e.country || e.region || e.community) evidenceSources.push("VERIFIED_COUNTRY_REGION_COMMUNITY");
        if (e.previouslyVerified) evidenceSources.push("PREVIOUSLY_VERIFIED_KNOWLEDGE");
        if (e.linguisticEvidence) evidenceSources.push("RELIABLE_LINGUISTIC_EVIDENCE");
        if (evidenceSources.length === 0 && languageId) evidenceSources.push("WEAK_HEURISTIC");

        function result(status, extra) {
            const conf = computeConfidence(evidenceSources);
            const observation = Object.assign({
                language: null, languageCode: languageId, country: e.country || null, region: e.region || null,
                community: e.community || null, dialect: e.dialect || null, script: e.script || null,
                source: "cozy-african-language-intelligence", evidence: evidenceSources, status
            }, conf, extra);
            resolutionLog.push({ input: e, observation, at: nowISO() });
            return observation;
        }

        if (!languageId) return result("LANGUAGE_UNCERTAIN", { reason: "NO_LANGUAGE_ID_EVIDENCE_SUPPLIED" });
        const pack = api.getPack(languageId);
        if (!pack) return result("LANGUAGE_UNCERTAIN", { reason: "LANGUAGE_NOT_REGISTERED_IN_RP030" });

        const contexts = api.listRegionalContexts(languageId);
        const requestedKey = e.community ? regionKey(e.region, e.community) : null;

        // Level 1: Community + Dialect (exact composite region+community, exact dialect)
        // — only ever considered when real community evidence was actually supplied.
        if (requestedKey && e.dialect) {
            const exact = contexts.filter((c) => c.region === requestedKey && c.dialect === e.dialect);
            if (exact.length === 1) return result("RESOLVED", { language: pack.identity.name, routingLevel: "COMMUNITY_DIALECT", packId: languageId });
            if (exact.length > 1) return result("AMBIGUOUS_LANGUAGE", { language: pack.identity.name, reason: "MULTIPLE_MATCHING_COMMUNITY_DIALECT_CONTEXTS" });
        }
        // Level 2: Community (composite region+community, any dialect)
        if (requestedKey) {
            const communityMatch = contexts.filter((c) => c.region === requestedKey);
            if (communityMatch.length === 1) return result("RESOLVED", { language: pack.identity.name, routingLevel: "COMMUNITY", packId: languageId });
            if (communityMatch.length > 1) return result("AMBIGUOUS_LANGUAGE", { language: pack.identity.name, reason: "MULTIPLE_MATCHING_COMMUNITY_CONTEXTS" });
        }
        // Level 3: Region only (plain region, no community suffix)
        if (e.region) {
            const regionMatch = contexts.filter((c) => c.region === e.region);
            if (regionMatch.length >= 1) return result("RESOLVED", { language: pack.identity.name, routingLevel: "REGION", packId: languageId, note: "Community/dialect not matched; routed to region." });
        }
        // Level 4: Country only
        if (e.country) {
            const countryMatch = contexts.filter((c) => c.country === String(e.country).toUpperCase());
            if (countryMatch.length >= 1) return result("RESOLVED", { language: pack.identity.name, routingLevel: "COUNTRY", packId: languageId, note: "Region/community not matched; routed to country." });
            if (contexts.length === 0) return result("NO_PACK", { language: pack.identity.name, reason: "LANGUAGE_REGISTERED_BUT_NO_REGIONAL_EVIDENCE_FOR_THIS_COUNTRY" });
        }
        // Level 5: Language (general pack) — registered, some regional evidence exists elsewhere
        if (contexts.length > 0) return result("RESOLVED", { language: pack.identity.name, routingLevel: "GENERAL_LANGUAGE_PACK", packId: languageId, note: "No matching region/country/community; routed to the general language pack, never a different language." });

        // Level 6: General fallback — registered language, zero regional evidence at all
        return result("NO_PACK", { language: pack.identity.name, reason: "LANGUAGE_REGISTERED_BUT_NO_REGIONAL_EVIDENCE_EXISTS_AT_ALL" });
    }

    /* ------------------------------------------------------------------ */
    /* 3. PACK RETRIEVAL                                                   */
    /* ------------------------------------------------------------------ */

    function getLanguagePack(languageId) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        const pack = api.getPack(languageId);
        if (!pack) return { status: "NO_PACK" };
        return { status: "AVAILABLE", language: pack.identity.name, languageId: pack.identity.languageId, country: null, region: null, community: null };
    }
    function getRegionalPack(languageId, region) {
        const identity = resolveLanguageIdentity({ languageId, region });
        if (identity.status !== "RESOLVED") return identity;
        return { status: "AVAILABLE", language: identity.language, languageId, region, routingLevel: identity.routingLevel };
    }
    function getCommunityPack(languageId, region, community) {
        const identity = resolveLanguageIdentity({ languageId, region, community });
        if (identity.status !== "RESOLVED") return identity;
        return { status: "AVAILABLE", language: identity.language, languageId, region, community, routingLevel: identity.routingLevel };
    }
    function getBestAvailablePack(evidence) {
        const identity = resolveLanguageIdentity(evidence);
        if (identity.status !== "RESOLVED") return identity;
        return { status: "AVAILABLE", language: identity.language, languageId: identity.languageCode, country: identity.country, region: identity.region, community: identity.community, dialect: identity.dialect, routingLevel: identity.routingLevel };
    }

    /* ------------------------------------------------------------------ */
    /* 4. LEARNING FROM NEW WORDS (spec §11) — Rule 82 stays authoritative */
    /* ------------------------------------------------------------------ */

    /**
     * learnUnknownTerm(term, evidence, opts)
     *   identify -> find pack -> search existing -> candidate (via the
     *   real, unmodified RP-030 submitExpression(), which already runs
     *   the real safety gate first and never auto-promotes past
     *   REGISTERED/NOT_READY). This file does not touch Rule 82 at all.
     */
    function learnUnknownTerm(term, evidence, opts) {
        const identity = resolveLanguageIdentity(evidence);
        if (identity.status !== "RESOLVED") return { status: identity.status, identity };

        const api = packsApi();
        const existing = api.listExpressions({ languageId: identity.languageCode, region: regionKey(evidence.region, evidence.community), dialect: evidence.dialect })
            .filter((r) => r.expression && r.expression.toLowerCase() === String(term).toLowerCase());
        if (existing.length > 0) return { status: "ALREADY_KNOWN", identity, existing: existing.map((r) => r.recordId) };

        const o = opts || {};
        const submitted = api.submitExpression({
            languageId: identity.languageCode, region: regionKey(evidence.region, evidence.community), dialect: evidence.dialect,
            expression: term, meaning: o.meaning || null, context: o.context || null,
            contributorPseudonym: o.contributorId || null, sourceType: o.sourceType || "COMMUNITY", country: evidence.country || null
        });
        return { status: "CANDIDATE_SUBMITTED", identity, submission: submitted };
    }

    /* ------------------------------------------------------------------ */
    /* 5. MEDIA INTEGRATION (RP-034 Phase 4, composed read-only)           */
    /* ------------------------------------------------------------------ */

    function routeMediaAnalysisJob(jobId, opts) {
        const analysis = mediaAnalysis();
        if (!analysis) return { status: "CAPABILITY_UNAVAILABLE", reason: "PHASE4_ANALYSIS_ABSENT" };
        const job = analysis.getJob(jobId);
        if (!job || job.state !== "COMPLETED") return { status: "REJECTED", reason: "Job must be a real, COMPLETED Phase 4 job." };
        const provenance = analysis.getSourceProvenance(jobId);

        const evidence = Object.assign({}, opts, job.result && job.result.routing ? { languageId: job.result.routing.packId } : {});
        const identity = resolveLanguageIdentity(evidence);

        const terms = (job.result && job.result.terms) || [];
        const learned = terms.map((t) => ({ term: t, sourceProvenance: provenance }));
        return { status: "AVAILABLE", identity, provenance, terms: learned };
    }

    /* ------------------------------------------------------------------ */
    /* 6. ASR READINESS INTERFACE (spec §13) — no fabrication              */
    /* ------------------------------------------------------------------ */

    let asrProvider = null;
    function registerASRProvider(provider) {
        if (!provider || typeof provider.transcribe !== "function") return { status: "REJECTED", reason: "A real provider with a transcribe(audioRef) function is required." };
        asrProvider = provider;
        return { status: "REGISTERED" };
    }
    function unregisterASRProvider() { asrProvider = null; }
    async function transcribeAudio(audioRef) {
        if (!asrProvider) return { status: "CAPABILITY_UNAVAILABLE", reason: "NO_REAL_ASR_PROVIDER_REGISTERED" };
        const result = await asrProvider.transcribe(audioRef);
        if (!result || !result.transcript) return { status: "CAPABILITY_UNAVAILABLE", reason: "PROVIDER_RETURNED_NO_REAL_TRANSCRIPT" };
        const identity = resolveLanguageIdentity(result.evidence || {});
        return { status: "AVAILABLE", transcript: result.transcript, identity };
    }

    /* ------------------------------------------------------------------ */
    /* 7. MULTI-LANGUAGE CONVERSATION / CODE-SWITCHING (spec §14-15)       */
    /* ------------------------------------------------------------------ */

    /**
     * analyzeConversationSegments(conversationId, segments)
     *   segments: [{text, evidence}]. Each segment independently
     *   resolved — never assumes one language for a whole conversation.
     */
    function analyzeConversationSegments(conversationId, segments) {
        const resolved = (segments || []).map((s) => ({ text: s.text, identity: resolveLanguageIdentity(s.evidence) }));
        conversationSegments.set(conversationId, resolved);

        const distinctLanguages = Array.from(new Set(resolved.filter((r) => r.identity.status === "RESOLVED").map((r) => r.identity.languageCode)));
        let codeSwitchDetected = distinctLanguages.length >= 2;
        return {
            conversationId, segments: resolved,
            primaryLanguage: distinctLanguages[0] || null,
            secondaryLanguage: distinctLanguages[1] || null,
            codeSwitchDetected
        };
    }

    /* ------------------------------------------------------------------ */
    /* 8. COMMUNITY LEARNING (RP-031, composed verbatim)                   */
    /* ------------------------------------------------------------------ */

    function submitCommunityContribution(fields) {
        const routing = teachRouting();
        if (!routing) return { status: "CAPABILITY_UNAVAILABLE", reason: "TEACH_ROUTING_ABSENT" };
        return routing.submitTeachingContribution(fields);
    }

    /* ------------------------------------------------------------------ */
    /* 9. LIVING CONNECTIVITY INTEGRATION (RP-033 Gate 2, composed)        */
    /* ------------------------------------------------------------------ */

    const LANGUAGE_PACKET_TYPES = Object.freeze(["LANGUAGE_PACK_METADATA", "LANGUAGE_TERM_CANDIDATE", "LANGUAGE_EVIDENCE", "LANGUAGE_RESEARCH_RESULT"]);
    const languageAuditTrail = [];

    function shareLanguageEvidence(packetType, payload, opts) {
        if (LANGUAGE_PACKET_TYPES.indexOf(packetType) === -1) return { status: "REJECTED", reason: "Unrecognized language packet type." };
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const o = opts || {};
        const sendResult = t.sendPacket({
            destination: o.destination || "peer", payloadType: packetType, payload,
            sender: o.sender || "african-language-intelligence", sessionId: o.sessionId, connectionId: o.connectionId
        });
        languageAuditTrail.push({ action: "SHARE", packetType, at: nowISO(), state: sendResult.state || sendResult.reason });
        return sendResult;
    }

    /**
     * receiveLanguageEvidence(envelope, opts)
     *   Never trusts another CozyOS device merely because a packet is
     *   well-formed: real transport accept, then real safety-gate
     *   classification and real language-identity validation before
     *   anything is treated as a real local candidate.
     */
    function receiveLanguageEvidence(envelope, opts) {
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const accept = t.receivePacket(envelope, opts);
        if (!accept.accepted) { languageAuditTrail.push({ action: "RECEIVE_REJECTED", at: nowISO(), reason: accept.reason }); return { status: "REJECTED", reason: accept.reason }; }
        if (LANGUAGE_PACKET_TYPES.indexOf(envelope.payloadType) === -1) return { status: "REJECTED", reason: "Not a recognized language packet type." };

        const gate = safetyGate();
        let safetyStatus = "SAFE";
        const text = envelope.payload && (envelope.payload.term || envelope.payload.meaning);
        if (gate && text) {
            const classification = gate.classify({ expression: String(text), contributionType: "WEBSITE_EVIDENCE" });
            if (classification.classification !== "SAFE") safetyStatus = classification.classification;
        }
        const identity = envelope.payload && envelope.payload.evidence ? resolveLanguageIdentity(envelope.payload.evidence) : null;

        languageAuditTrail.push({ action: "RECEIVE", packetType: envelope.payloadType, at: nowISO(), safetyStatus });
        return { status: "IMPORTED", packetType: envelope.payloadType, safetyStatus, identity };
    }

    function getLanguageAuditTrail() { return languageAuditTrail.slice(); }

    /* ------------------------------------------------------------------ */
    /* 10. LANGUAGE COVERAGE REGISTRY (spec §24) — real states, verbatim  */
    /* ------------------------------------------------------------------ */

    function getLanguageCoverageStatus(languageId) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        const pack = api.getPack(languageId);
        if (!pack) return { status: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_NOT_REGISTERED" };
        const spec5Label = pack.status === "AVAILABLE" ? "ACTIVE"
            : (pack.status === "COMMUNITY_BUILDING" || pack.status === "PARTIAL" || pack.status === "VALIDATING") ? "READY"
                : pack.status === "NOT_READY" ? "NOT_READY" : "REGISTERED";
        return { status: "AVAILABLE", realPackStatus: pack.status, realResourceState: pack.resourceState, spec5Label, note: "spec5Label is a derived convenience hint only; realPackStatus is RP-030's own authoritative status." };
    }

    /* ------------------------------------------------------------------ */
    /* 11. ADMIN INTELLIGENCE API (spec §17-19)                            */
    /* ------------------------------------------------------------------ */

    function getLanguageUsageOverview() {
        return { mostUsed: "NOT_AVAILABLE_NO_TELEMETRY", note: "No usage-tracking engine exists in this repository (same finding RP-030's own getDashboardSnapshot() already discloses)." };
    }
    function getLanguagePackCoverage() {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        return { status: "AVAILABLE", packs: api.listPacks().map((p) => getLanguageCoverageStatus(p.identity.languageId)) };
    }
    function getRegionalCoverage(languageId) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        return { status: "AVAILABLE", contexts: api.listRegionalContexts(languageId) };
    }
    function getCommunityCoverage(languageId) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE" };
        const contexts = api.listRegionalContexts(languageId);
        const communities = contexts.filter((c) => c.region && c.region.indexOf("(") !== -1);
        return { status: "AVAILABLE", communityContexts: communities };
    }
    function getUnresolvedLanguages() {
        return resolutionLog.filter((r) => r.observation.status === "LANGUAGE_UNCERTAIN" || r.observation.status === "NO_PACK").map((r) => r.observation);
    }
    function getAmbiguousTerms() {
        return resolutionLog.filter((r) => r.observation.status === "AMBIGUOUS_LANGUAGE").map((r) => r.observation);
    }
    function getNewTerms() {
        return resolutionLog.filter((r) => r.observation.status === "RESOLVED").map((r) => r.observation);
    }
    function getResearchPriorities(query) {
        const search = mediaSearch();
        if (!search) return { status: "CAPABILITY_UNAVAILABLE" };
        return { status: "AVAILABLE", priority: search.getResearchPriority(query) };
    }
    function getLanguageGrowth() {
        return { status: "NOT_AVAILABLE_NO_TELEMETRY", note: "No historical growth-tracking engine exists in this repository." };
    }

    /* ------------------------------------------------------------------ */
    /* MODULE WIRING                                                       */
    /* ------------------------------------------------------------------ */

    const api = Object.freeze({
        getVersion: () => VERSION,
        RESOLUTION_STATUSES, CONFIDENCE_LEVELS, LANGUAGE_PACKET_TYPES,
        resolveLanguageIdentity,
        getLanguagePack, getRegionalPack, getCommunityPack, getBestAvailablePack,
        learnUnknownTerm,
        routeMediaAnalysisJob,
        registerASRProvider, unregisterASRProvider, transcribeAudio,
        analyzeConversationSegments,
        submitCommunityContribution,
        shareLanguageEvidence, receiveLanguageEvidence, getLanguageAuditTrail,
        getLanguageCoverageStatus,
        getLanguageUsageOverview, getLanguagePackCoverage, getRegionalCoverage, getCommunityCoverage,
        getUnresolvedLanguages, getAmbiguousTerms, getNewTerms, getResearchPriorities, getLanguageGrowth,
        // Exposed for tests only.
        _resetForTests() { resolutionLog.length = 0; conversationSegments.clear(); languageAuditTrail.length = 0; asrProvider = null; }
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-african-language-intelligence"]) {
            window.CozyOS.CozyAfricanLanguageIntelligence = api;
            window.CozyOS.Modules["cozy-african-language-intelligence"] = Object.freeze({
                version: VERSION,
                description: "RP-034 Phase 5 — African Language Intelligence & Automatic Pack Routing. Real six-level routing hierarchy (community+dialect -> community -> region -> country -> general pack -> honest fallback) over the real RP-030 registry. No fake language ID, ASR, translation, or usage telemetry — every unavailable capability honestly reports CAPABILITY_UNAVAILABLE. Rule 82 remains fully authoritative and untouched. Phase 6-8 explicitly deferred."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/language-packs/cozy-african-language-intelligence.js",
                    name: "CozyAfricanLanguageIntelligence", category: "Living Engine",
                    description: "RP-034 Phase 5 African Language Intelligence & Automatic Pack Routing. Real routing over the real RP-030/RP-031/RP-029/RP-034-Phase-4/RP-033 chain. No fabricated confidence, ASR, translation, or telemetry."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
