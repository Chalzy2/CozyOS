/**
 * CozyOS — Media Research Intelligence
 * File Reference: core/modules/intelligence/media/cozy-research-intelligence.js
 * Repair: RP-035 Phase 2
 *
 * Baseline: RP-035 Phase 1 (17-default + optional-pack + country/flag
 * correction), on top of RP-034 Phase 1-8, RP-033, RP-030/031/029.
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   Phase 2 index (CozyRemoteMediaIndex)     — sole record/timestamp owner.
 *   Phase 3 search (CozyRemoteMediaSearch)   — sole search engine; this
 *     file only adds researchType/language/country filtering on top of
 *     its real search()/getResearchContext() results.
 *   Phase 4 analysis (CozyRemoteMediaAnalysis) — sole job execution owner.
 *   Phase 1 link (cozy-media-analysis-link.js) — sole index<->analysis
 *     reconciliation owner; this file reads getLinkStatus(), never
 *     re-links.
 *   Language registry/intel (RP-030/034)     — sole language authority;
 *     this file only reads record.language, already routed elsewhere.
 *   Country metadata (RP-035 Phase 1)        — sole country/flag lookup.
 *   Privacy (CozyIntelligencePrivacy)        — sole privacy authority;
 *     every research record is gated through getMediaPrivacyView() and
 *     record.ownerAuthorization.state before being returned by search.
 *   Offline sync (CozyIntelligenceOfflineSync) — sole sync authority;
 *     this file only calls createSyncOperation() with real
 *     OPERATION_TYPES, never invents a transport/sync state.
 *
 * NO FABRICATION
 *   No face recognition, ASR, OCR, or embeddings engine exists in this
 *   repository. personReference resolution is always
 *   CAPABILITY_UNAVAILABLE unless a human administrator supplies a
 *   CONFIRMED_PERSON reference explicitly (never inferred from a face).
 *
 * RULE 82
 *   Nothing here promotes a language pack. No promotePack()/
 *   forceAvailable()/approvePack()/setStatus("AVAILABLE").
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function mediaIndex() { const c = cozyOS(); return (c && c.CozyRemoteMediaIndex) || null; }
    function mediaAnalysis() { const c = cozyOS(); return (c && c.CozyRemoteMediaAnalysis) || null; }
    function mediaSearch() { const c = cozyOS(); return (c && c.CozyRemoteMediaSearch) || null; }
    function linkCoordinator() { const c = cozyOS(); return (c && c.Modules && c.Modules["cozy-media-analysis-link"] && c.Modules["cozy-media-analysis-link"].api) || null; }
    function countryMeta() { const c = cozyOS(); return (c && c.Modules && c.Modules["cozy-language-country-metadata"] && c.Modules["cozy-language-country-metadata"].api) || null; }
    function privacyEngine() { const c = cozyOS(); return (c && c.CozyIntelligencePrivacy) || null; }
    function offlineSync() { const c = cozyOS(); return (c && c.CozyIntelligenceOfflineSync) || null; }

    function nowISO() { return new Date().toISOString(); }

    const RESEARCH_TYPES = Object.freeze([
        "TESTIMONY", "HEALING", "PRAYER", "SERMON", "ANNOUNCEMENT",
        "GRADUATION", "WORSHIP", "TEACHING", "EVENT", "MEETING",
        "CONFERENCE", "OTHER"
    ]);

    const PERSON_REFERENCE_STATES = Object.freeze(["CONFIRMED_PERSON", "POSSIBLE_PERSON", "UNKNOWN"]);

    // -----------------------------------------------------------------
    // In-memory research-record store (compositional layer — never a
    // second media index; every field traces back to a real source).
    // -----------------------------------------------------------------
    const records = new Map();
    const dedupeIndex = new Map(); // matchKey -> researchId
    let nextSeq = 1;
    const auditTrail = [];

    function freshId() { return "rr_" + Date.now().toString(36) + "_" + (nextSeq++); }
    function audit(action, detail) { auditTrail.push({ action, detail, at: nowISO() }); }
    function getAuditTrail() { return auditTrail.slice(); }

    function matchKey(f) {
        return [f.sourceRecordId || "", f.videoId || "", f.analysisJobId || "", f.researchType || "", f.timestamp != null ? f.timestamp : "UNKNOWN"].join("::");
    }

    // -----------------------------------------------------------------
    // 1. RESEARCH RECORD CREATION — every field from real evidence
    // -----------------------------------------------------------------

    function createResearchRecord(fields) {
        const f = fields || {};
        if (RESEARCH_TYPES.indexOf(f.researchType) === -1) return { status: "REJECTED", reason: "Unrecognized researchType." };
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE", reason: "MEDIA_INDEX_ABSENT" };
        if (!f.sourceRecordId) return { status: "REJECTED", reason: "A real sourceRecordId (index record) is required." };

        const record = idx.getRecord(f.sourceRecordId);
        if (!record) return { status: "REJECTED", reason: "sourceRecordId does not resolve to a real index record." };

        // Privacy gate BEFORE anything is stored/returned.
        if (record.ownerAuthorization.state === "REVOKED") {
            return { status: "NOT_AUTHORIZED", reason: "ownerAuthorization.state is REVOKED." };
        }

        // Idempotency / duplicate detection on real identifiers.
        const key = matchKey({ sourceRecordId: f.sourceRecordId, videoId: record.sourceId, analysisJobId: f.analysisJobId || null, researchType: f.researchType, timestamp: f.timestamp });
        if (dedupeIndex.has(key)) {
            return { status: "ALREADY_EXISTS", researchId: dedupeIndex.get(key), note: "Idempotent — same evidence already linked to a research record." };
        }

        // Language / country — read-only, never re-derived.
        const language = record.language && record.language.detected ? record.language.detected : null;
        const region = record.language ? record.language.region : null;
        const dialect = record.language ? record.language.dialect : null;
        const cm = countryMeta();
        let country = "NOT_AVAILABLE";
        if (language && cm) {
            const listing = cm.listCountriesForLanguage(language);
            country = (listing.status === "OK" && listing.countries.length) ? listing.countries[0] : "NOT_AVAILABLE";
        }

        // Timestamp — never invented. UNKNOWN when precision absent.
        // record.timestamps entries have no durationSeconds field in the
        // real Phase 2 schema — duration is NOT_AVAILABLE unless the
        // caller supplies a real, separately-evidenced value.
        let timestamp = "UNKNOWN";
        let startTime = null, endTime = null, duration = "NOT_AVAILABLE";
        if (typeof f.timestamp === "number") {
            timestamp = f.timestamp;
            const match = (record.timestamps || []).find((t) => t.timestampSeconds === f.timestamp);
            if (match) { startTime = match.timestampSeconds; }
            if (typeof f.duration === "number") duration = f.duration;
        }

        // Analysis-job evidence, if a real job is referenced.
        let evidenceSource = "INDEX_RECORD";
        let analysisEvidence = null;
        if (f.analysisJobId) {
            const analysis = mediaAnalysis();
            const job = analysis ? analysis.getJob(f.analysisJobId) : null;
            if (!job) return { status: "REJECTED", reason: "analysisJobId does not resolve to a real analysis job." };
            evidenceSource = "ANALYSIS_JOB";
            analysisEvidence = job.state === "COMPLETED" ? job.result : null;
        }

        const researchId = freshId();
        const rec = {
            id: researchId,
            sourceRecordId: f.sourceRecordId,
            videoId: record.sourceId,
            analysisJobId: f.analysisJobId || null,
            researchType: f.researchType,
            title: record.title || "NOT_AVAILABLE",
            description: record.description || "NOT_AVAILABLE",
            timestamp,
            startTime, endTime, duration,
            language: language || "NOT_AVAILABLE",
            country,
            region: region || "NOT_AVAILABLE",
            community: f.community || "NOT_AVAILABLE",
            dialect: dialect || "NOT_AVAILABLE",
            peopleReferences: [],
            confidence: (record.language && typeof record.language.confidence === "number") ? record.language.confidence : null,
            evidence: {
                source: evidenceSource,
                sourceRecordId: f.sourceRecordId,
                videoId: record.sourceId,
                analysisJobId: f.analysisJobId || null,
                evidenceType: f.researchType,
                evidenceSource: record.sourceType,
                timestamp,
                confidence: (record.language && typeof record.language.confidence === "number") ? record.language.confidence : null,
                languageEvidence: language || "UNKNOWN",
                // Evidence carries the country CODE only — name/flag are
                // presentation metadata, never part of the evidence trail.
                countryEvidence: (country && typeof country === "object") ? country.code : country,
                analysisEvidence,
                createdAt: nowISO()
            },
            provenance: {
                source: record.provenance.source,
                method: record.provenance.method,
                contributor: record.provenance.contributor
            },
            privacy: { status: "PENDING" },
            confirmation: null,
            status: "POSSIBLE_" + f.researchType,
            createdAt: nowISO(),
            updatedAt: nowISO()
        };

        records.set(researchId, rec);
        dedupeIndex.set(key, researchId);
        audit("CREATED", { researchId, researchType: f.researchType });
        return { status: "CREATED", researchId, record: cloneRec(rec) };
    }

    function cloneRec(r) { return JSON.parse(JSON.stringify(r)); }

    function getResearchRecord(researchId) {
        const r = records.get(researchId);
        return r ? cloneRec(r) : null;
    }

    function listResearchRecords(filter) {
        const f = filter || {};
        return Array.from(records.values())
            .filter((r) => !f.researchType || r.researchType === f.researchType)
            .filter((r) => !f.language || r.language === f.language)
            .filter((r) => !f.country || (r.country && r.country.code === f.country))
            .filter((r) => !f.region || r.region === f.region)
            .map(cloneRec);
    }

    // -----------------------------------------------------------------
    // 2. PERSON REFERENCE — never inferred from a face; admin-confirmed
    //    only, or CAPABILITY_UNAVAILABLE.
    // -----------------------------------------------------------------

    function addPersonReference(researchId, fields) {
        const r = records.get(researchId);
        if (!r) return { status: "REJECTED", reason: "Unknown researchId." };
        const f = fields || {};
        const state = PERSON_REFERENCE_STATES.indexOf(f.state) !== -1 ? f.state : "UNKNOWN";
        if (state === "CONFIRMED_PERSON" && !f.confirmedBy) {
            return { status: "REJECTED", reason: "CONFIRMED_PERSON requires a real confirmedBy identity — never inferred." };
        }
        const ref = {
            state,
            videoId: r.videoId,
            timestamp: typeof f.timestamp === "number" ? f.timestamp : "UNKNOWN",
            confidence: typeof f.confidence === "number" ? f.confidence : null,
            evidenceType: f.evidenceType || "ADMIN_ASSERTION",
            analysisJobId: r.analysisJobId,
            confirmedBy: f.confirmedBy || null,
            provenance: r.provenance,
            createdAt: nowISO()
        };
        r.peopleReferences.push(ref);
        r.updatedAt = nowISO();
        audit("PERSON_REFERENCE_ADDED", { researchId, state });
        return { status: "ADDED", personReference: ref };
    }

    function getPersonAppearanceCapability() {
        return { status: "CAPABILITY_UNAVAILABLE", reason: "No face-recognition provider exists in this repository. Only admin-confirmed references are supported." };
    }

    // -----------------------------------------------------------------
    // 3. PRIVACY — every record gated through Phase 6 before exposure
    // -----------------------------------------------------------------

    function applyPrivacy(researchId) {
        const r = records.get(researchId);
        if (!r) return { status: "REJECTED", reason: "Unknown researchId." };
        const priv = privacyEngine();
        if (!priv) { r.privacy = { status: "CAPABILITY_UNAVAILABLE" }; return r.privacy; }
        const view = priv.getMediaPrivacyView(r.sourceRecordId);
        if (view.status !== "AVAILABLE") { r.privacy = { status: view.status }; return r.privacy; }
        if (view.ownerAuthorizationState === "REVOKED") {
            r.privacy = { status: "NOT_AUTHORIZED" };
        } else {
            r.privacy = { status: "VIEWABLE", ownerAuthorizationState: view.ownerAuthorizationState };
        }
        r.updatedAt = nowISO();
        return r.privacy;
    }

    // -----------------------------------------------------------------
    // 4. RESEARCH SEARCH — filters on top of Phase 3's real search
    // -----------------------------------------------------------------

    function searchResearch(query, filters) {
        const ms = mediaSearch();
        if (!ms) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const baseResults = ms.search(query, {});
        const f = filters || {};
        const matchedIndexIds = new Set((baseResults.results || baseResults.matches || []).map((m) => m.indexId || (m.record && m.record.indexId)).filter(Boolean));

        let candidates = Array.from(records.values());
        if (matchedIndexIds.size) candidates = candidates.filter((r) => matchedIndexIds.has(r.sourceRecordId));
        candidates = candidates
            .filter((r) => !f.researchType || r.researchType === f.researchType)
            .filter((r) => !f.language || r.language === f.language)
            .filter((r) => !f.country || (r.country && r.country.code === f.country))
            .filter((r) => !f.region || r.region === f.region)
            .filter((r) => r.privacy.status === "VIEWABLE"); // never expose PENDING/NOT_AUTHORIZED

        return {
            status: "OK",
            results: candidates.map((r) => ({
                title: r.title, videoId: r.videoId, timestamp: r.timestamp, researchType: r.researchType,
                language: r.language, country: r.country, confidence: r.confidence,
                provenance: r.provenance, privacyStatus: r.privacy.status
            }))
        };
    }

    function getResearchContext(query, options) {
        const ms = mediaSearch();
        if (!ms || typeof ms.getResearchContext !== "function") return { status: "CAPABILITY_UNAVAILABLE" };
        return ms.getResearchContext(query, options);
    }

    // -----------------------------------------------------------------
    // 5. HUMAN CONFIRMATION — never overwrites original evidence
    // -----------------------------------------------------------------

    function confirmResearch(researchId, confirmation) {
        const r = records.get(researchId);
        if (!r) return { status: "REJECTED", reason: "Unknown researchId." };
        const f = confirmation || {};
        if (!f.confirmedBy) return { status: "REJECTED", reason: "A real confirmedBy identity is required." };
        if (r.confirmation) return { status: "ALREADY_CONFIRMED", confirmation: r.confirmation };

        r.confirmation = {
            confirmedBy: f.confirmedBy,
            confirmedAt: nowISO(),
            note: f.note || null
        };
        r.status = "CONFIRMED_" + r.researchType;
        r.updatedAt = nowISO();
        audit("CONFIRMED", { researchId, confirmedBy: f.confirmedBy });
        return { status: "CONFIRMED", record: cloneRec(r) };
    }

    // -----------------------------------------------------------------
    // 6. OFFLINE SYNC — composes Phase 7, never invents a sync state
    // -----------------------------------------------------------------

    function buildResearchSyncOperation(researchId, operationType) {
        const r = records.get(researchId);
        if (!r) return { status: "REJECTED", reason: "Unknown researchId." };
        const sync = offlineSync();
        if (!sync) return { status: "CAPABILITY_UNAVAILABLE" };
        const opType = ["CREATE", "UPDATE", "DELETE_REQUEST"].indexOf(operationType) !== -1 ? operationType : "CREATE";
        // No dedicated ANNOTATION/CONFIRMATION operationType exists in
        // Phase 7's real OPERATION_TYPES — mapped honestly onto UPDATE.
        const mappedType = sync.OPERATION_TYPES.indexOf(opType) !== -1 ? opType : "UPDATE";
        return sync.createSyncOperation({
            recordId: r.id,
            sourceRecordId: r.sourceRecordId,
            operationType: mappedType,
            payload: { researchType: r.researchType, status: r.status, confirmation: r.confirmation },
            privacyTier: "COMMUNITY"
        });
    }

    // -----------------------------------------------------------------
    // 7. CAPABILITY REGISTRY — truthful only
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        return {
            remoteMetadata: mediaIndex() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            analysis: mediaAnalysis() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            researchClassification: "AVAILABLE_HUMAN_ASSERTED_ONLY",
            timestampIntelligence: "AVAILABLE_WHEN_REAL_TIMESTAMPS_EXIST",
            personAppearance: "CAPABILITY_UNAVAILABLE",
            faceRecognition: "CAPABILITY_UNAVAILABLE",
            asr: "CAPABILITY_UNAVAILABLE",
            ocr: "CAPABILITY_UNAVAILABLE",
            embeddings: "CAPABILITY_UNAVAILABLE",
            languageRouting: (cozyOS() && cozyOS().CozyAfricanLanguageIntelligence) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            countryMetadata: countryMeta() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            offlineSearch: "AVAILABLE_LOCAL_CACHE_ONLY",
            offlineSync: offlineSync() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            transport: (cozyOS() && cozyOS().CozyConnectivityTransport) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE"
        };
    }

    // -----------------------------------------------------------------
    // 8. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        RESEARCH_TYPES,
        PERSON_REFERENCE_STATES,
        createResearchRecord,
        getResearchRecord,
        listResearchRecords,
        addPersonReference,
        getPersonAppearanceCapability,
        applyPrivacy,
        searchResearch,
        getResearchContext,
        confirmResearch,
        buildResearchSyncOperation,
        getCapabilityStatus,
        getAuditTrail
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-research-intelligence"]) {
        root.window.CozyOS.CozyResearchIntelligence = api;
        root.window.CozyOS.Modules["cozy-research-intelligence"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Phase 2 — Living Media Research Intelligence. Composes Phase 1-7/RP-030/031/033 real APIs only; no duplicated storage, search, language, privacy, or transport logic."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-research-intelligence",
                version: VERSION,
                description: "RP-035 Phase 2 research-intelligence coordinator over indexed/analyzed media."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
