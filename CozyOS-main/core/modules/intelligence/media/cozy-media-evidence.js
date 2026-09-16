/**
 * CozyOS — Media Evidence & Intelligence Enrichment
 * File Reference: core/modules/intelligence/media/cozy-media-evidence.js
 * Repair: RP-035 Phase 4
 *
 * Baseline: CozyOS-main-RP-035-Phase3.zip
 * SHA-256 983adb2eeed734727d0d66d95e4367fa3d7ec1670cd63423a52014d2ed787030
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   Phase 2 (CozyResearchIntelligence) — sole ResearchRecord owner;
 *     this file reads getResearchRecord()/listResearchRecords() and
 *     never writes to research-record storage directly.
 *   Phase 3 (CozyResearchSearch) — sole search/retrieval authority;
 *     this file only enriches the data Phase 3 already searches
 *     (evidenceIds attached to a research record), never adds a
 *     second search engine.
 *   RP-030 registry / RP-035 Phase 1 country metadata — sole
 *     language/country authority; every LANGUAGE/COUNTRY evidence
 *     item is read from real routed data, never re-derived.
 *   Phase 6 privacy — every evidence exposure is re-checked through
 *     Phase 2's own applyPrivacy(), never a second privacy engine.
 *   Phase 7 offline sync — evidence sync composes real
 *     createSyncOperation()/OPERATION_TYPES, never a new state.
 *   RP-033 transport — read-only capability probe only.
 *
 * CONFIDENCE VOCABULARY
 *   Reuses CozyAfricanLanguageIntelligence's real
 *   CONFIDENCE_LEVELS = [HIGH, MEDIUM, LOW, NONE]. This file adds
 *   UNRESOLVED as a distinct *conflict* state (never a confidence
 *   level) for evidence that cannot be determined at all — the two
 *   are never conflated.
 *
 * NO FABRICATION
 *   No transcript/ASR/OCR/face-recognition/embedding evidence is ever
 *   created. Timestamp evidence is only ever a real, already-recorded
 *   value; never invented "reasonable-looking" timing.
 *
 * RULE 82
 *   Read-only. No promote/forceAvailable/approvePack/setStatus
 *   mutator exists in this file.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function research() { const c = cozyOS(); return (c && c.CozyResearchIntelligence) || null; }
    function registry() { const c = cozyOS(); return (c && c.CozyLanguagePacks) || null; }
    function countryMeta() { const c = cozyOS(); return (c && c.Modules && c.Modules["cozy-language-country-metadata"] && c.Modules["cozy-language-country-metadata"].api) || null; }
    function langIntel() { const c = cozyOS(); return (c && c.CozyAfricanLanguageIntelligence) || null; }
    function offlineSync() { const c = cozyOS(); return (c && c.CozyIntelligenceOfflineSync) || null; }
    function transport() { const c = cozyOS(); return (c && c.CozyConnectivityTransport) || null; }

    function nowISO() { return new Date().toISOString(); }

    const EVIDENCE_TYPES = Object.freeze([
        "LANGUAGE", "COUNTRY", "REGION", "COMMUNITY", "DIALECT",
        "PERSON_REFERENCE", "EVENT", "TOPIC", "TIMESTAMP", "SOURCE",
        "MEDIA_METADATA", "ANALYSIS_REFERENCE", "PROVENANCE"
    ]);

    // Real vocabulary composed from CozyAfricanLanguageIntelligence
    // (RP-034 Phase 5). Never invented here.
    const CONFIDENCE_LEVELS = Object.freeze(["HIGH", "MEDIUM", "LOW", "NONE"]);

    const TIMESTAMP_EVIDENCE_TYPES = Object.freeze([
        "VIDEO_METADATA_TIMESTAMP", "ANALYSIS_TIMESTAMP", "EVENT_TIMESTAMP",
        "MEASURED_MEDIA_TIMESTAMP", "UNKNOWN"
    ]);

    // Mirrors cozy-media-analysis-link.js's real reconciliation
    // vocabulary shape — same pattern, evidence-specific values.
    const RECONCILIATION_RESULTS = Object.freeze([
        "CONSISTENT", "MISSING_SOURCE", "MISSING_RESEARCH", "MISSING_ANALYSIS",
        "STALE_EVIDENCE", "CONFLICT", "PRIVACY_BLOCKED", "NOT_FOUND"
    ]);
    const REPAIR_SEVERITIES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

    // -----------------------------------------------------------------
    // Storage (compositional layer — never a second research/index
    // store; every field traces to a real source read at creation time)
    // -----------------------------------------------------------------
    const evidenceStore = new Map();      // evidenceId -> evidence
    const dedupeIndex = new Map();        // matchKey -> evidenceId
    const repairCandidates = new Map();   // candidateId -> candidate
    let nextEvidenceSeq = 1;
    let nextCandidateSeq = 1;
    const auditTrail = [];

    function freshEvidenceId() { return "ev_" + Date.now().toString(36) + "_" + (nextEvidenceSeq++); }
    function audit(action, detail) { auditTrail.push({ action, detail, at: nowISO() }); }
    function getAuditTrail() { return auditTrail.slice(); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function matchKey(researchRecordId, evidenceType, value) {
        return [researchRecordId || "", evidenceType || "", value != null ? String(value) : ""].join("::");
    }

    // -----------------------------------------------------------------
    // 1. EVIDENCE CREATION — every field from real, already-existing
    //    data. Idempotent on (researchRecordId, evidenceType, value).
    // -----------------------------------------------------------------

    function createEvidence(fields) {
        const f = fields || {};
        if (EVIDENCE_TYPES.indexOf(f.evidenceType) === -1) return { status: "REJECTED", reason: "Unrecognized evidenceType." };
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", reason: "RESEARCH_INTELLIGENCE_ABSENT" };
        if (!f.researchRecordId) return { status: "REJECTED", reason: "A real researchRecordId is required." };

        const rec = r.getResearchRecord(f.researchRecordId);
        if (!rec) return { status: "REJECTED", reason: "researchRecordId does not resolve to a real research record." };

        // Privacy re-checked at creation time — never trusted stale.
        if (rec.privacy && rec.privacy.status === "NOT_AUTHORIZED") {
            return { status: "PRIVACY_BLOCKED", reason: "Source research record is NOT_AUTHORIZED." };
        }

        if (f.value === undefined) return { status: "REJECTED", reason: "A real value (or explicit null) is required — never fabricated." };

        const key = matchKey(f.researchRecordId, f.evidenceType, f.value);
        if (dedupeIndex.has(key)) {
            return { status: "ALREADY_EXISTS", evidenceId: dedupeIndex.get(key), note: "Idempotent — identical evidence already recorded." };
        }

        // Confidence — only ever the real vocabulary; never a
        // fabricated number unless the caller supplies one that a real
        // upstream engine actually produced (numeric passthrough).
        let confidence = "NONE";
        if (f.confidenceLevel && CONFIDENCE_LEVELS.indexOf(f.confidenceLevel) !== -1) confidence = f.confidenceLevel;
        else if (typeof rec.confidence === "number") {
            confidence = rec.confidence >= 0.75 ? "HIGH" : rec.confidence >= 0.4 ? "MEDIUM" : rec.confidence > 0 ? "LOW" : "NONE";
        }

        const evidenceId = freshEvidenceId();
        const evidence = {
            evidenceId,
            researchRecordId: f.researchRecordId,
            sourceRecordId: rec.sourceRecordId,
            analysisJobId: rec.analysisJobId || null,
            evidenceType: f.evidenceType,
            value: f.value,
            confidence,
            timestampEvidenceType: f.evidenceType === "TIMESTAMP"
                ? (TIMESTAMP_EVIDENCE_TYPES.indexOf(f.timestampEvidenceType) !== -1 ? f.timestampEvidenceType : "UNKNOWN")
                : null,
            source: rec.evidence ? rec.evidence.source : "UNKNOWN",
            sourceId: rec.videoId,
            timestamp: nowISO(),
            provenance: {
                source: rec.provenance ? rec.provenance.source : null,
                contributor: rec.provenance ? rec.provenance.contributor : null,
                researchRecordId: f.researchRecordId,
                sourceRecordId: rec.sourceRecordId,
                analysisJobId: rec.analysisJobId || null
            },
            privacyStatus: rec.privacy ? rec.privacy.status : "PENDING",
            createdAt: nowISO(),
            updatedAt: nowISO()
        };

        evidenceStore.set(evidenceId, evidence);
        dedupeIndex.set(key, evidenceId);
        audit("EVIDENCE_CREATED", { evidenceId, evidenceType: f.evidenceType, researchRecordId: f.researchRecordId });
        return { status: "CREATED", evidenceId, evidence: clone(evidence) };
    }

    function getEvidence(evidenceId) {
        const e = evidenceStore.get(evidenceId);
        return e ? clone(e) : null;
    }

    function listEvidence(filter) {
        const f = filter || {};
        return Array.from(evidenceStore.values())
            .filter((e) => !f.researchRecordId || e.researchRecordId === f.researchRecordId)
            .filter((e) => !f.evidenceType || e.evidenceType === f.evidenceType)
            .filter((e) => !f.sourceRecordId || e.sourceRecordId === f.sourceRecordId)
            .map(clone);
    }

    // -----------------------------------------------------------------
    // 2. LANGUAGE / COUNTRY EVIDENCE — composed from real routed data,
    //    never re-derived independently.
    // -----------------------------------------------------------------

    function createLanguageEvidenceFromResearchRecord(researchRecordId) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE" };
        const rec = r.getResearchRecord(researchRecordId);
        if (!rec) return { status: "REJECTED", reason: "Unknown researchRecordId." };
        if (!rec.language || rec.language === "NOT_AVAILABLE") return { status: "UNKNOWN", reason: "No routed language evidence on this research record." };

        const created = createEvidence({ researchRecordId, evidenceType: "LANGUAGE", value: rec.language });
        if (created.status !== "CREATED" && created.status !== "ALREADY_EXISTS") return created;

        const results = { language: created };
        if (rec.country && typeof rec.country === "object" && rec.country.code) {
            results.country = createEvidence({ researchRecordId, evidenceType: "COUNTRY", value: rec.country.code });
        }
        if (rec.region && rec.region !== "NOT_AVAILABLE") {
            results.region = createEvidence({ researchRecordId, evidenceType: "REGION", value: rec.region });
        }
        if (rec.community && rec.community !== "NOT_AVAILABLE") {
            results.community = createEvidence({ researchRecordId, evidenceType: "COMMUNITY", value: rec.community });
        }
        if (rec.dialect && rec.dialect !== "NOT_AVAILABLE") {
            results.dialect = createEvidence({ researchRecordId, evidenceType: "DIALECT", value: rec.dialect });
        }
        return { status: "OK", results };
    }

    // Detects genuinely conflicting evidence for the SAME dimension on
    // the SAME research record (e.g. two different LANGUAGE values).
    // Never silently picks a winner.
    function checkEvidenceConflict(researchRecordId, evidenceType) {
        const items = listEvidence({ researchRecordId, evidenceType });
        const distinctValues = Array.from(new Set(items.map((e) => String(e.value))));
        if (distinctValues.length <= 1) return { status: distinctValues.length === 1 ? "CONSISTENT" : "NO_EVIDENCE" };
        return { status: "UNRESOLVED", reason: "CONFLICTING_EVIDENCE_VALUES", values: distinctValues };
    }

    // -----------------------------------------------------------------
    // 3. TIMESTAMP EVIDENCE — real values only
    // -----------------------------------------------------------------

    function createTimestampEvidence(researchRecordId, fields) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE" };
        const rec = r.getResearchRecord(researchRecordId);
        if (!rec) return { status: "REJECTED", reason: "Unknown researchRecordId." };
        const f = fields || {};

        // Never manufacture a timestamp — only pass through a real,
        // already-recorded value from the research record itself.
        if (rec.timestamp === "UNKNOWN") {
            return createEvidence({ researchRecordId, evidenceType: "TIMESTAMP", value: "UNKNOWN", timestampEvidenceType: "UNKNOWN" });
        }
        const timestampEvidenceType = TIMESTAMP_EVIDENCE_TYPES.indexOf(f.timestampEvidenceType) !== -1 ? f.timestampEvidenceType : "MEASURED_MEDIA_TIMESTAMP";
        return createEvidence({ researchRecordId, evidenceType: "TIMESTAMP", value: rec.timestamp, timestampEvidenceType });
    }

    // -----------------------------------------------------------------
    // 4. RESEARCH ENRICHMENT — references only, never a full copy
    // -----------------------------------------------------------------

    function enrichResearchRecord(researchRecordId) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE" };
        const rec = r.getResearchRecord(researchRecordId);
        if (!rec) return { status: "REJECTED", reason: "Unknown researchRecordId." };

        const langResult = createLanguageEvidenceFromResearchRecord(researchRecordId);
        const tsResult = createTimestampEvidence(researchRecordId, {});

        const evidenceIds = listEvidence({ researchRecordId }).map((e) => e.evidenceId);
        audit("RESEARCH_ENRICHED", { researchRecordId, evidenceCount: evidenceIds.length });
        return { status: "ENRICHED", researchRecordId, evidenceIds, languageEvidence: langResult, timestampEvidence: tsResult };
    }

    // -----------------------------------------------------------------
    // 5. PRIVACY — re-checked at exposure time, never trusted stale
    // -----------------------------------------------------------------

    function getVisibleEvidence(researchRecordId) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const rec = r.getResearchRecord(researchRecordId);
        if (!rec) return { status: "REJECTED", results: [] };
        // Re-check privacy NOW, not at evidence-creation time — a
        // record revoked after enrichment must hide its evidence too.
        const currentPrivacy = r.applyPrivacy(researchRecordId);
        if (currentPrivacy.status !== "VIEWABLE") {
            return { status: currentPrivacy.status, results: [] };
        }
        return { status: "OK", results: listEvidence({ researchRecordId }) };
    }

    // -----------------------------------------------------------------
    // 6. RECONCILIATION / REPAIR CANDIDATES
    // -----------------------------------------------------------------

    function reconcile(researchRecordId) {
        const r = research();
        if (!r) return { status: "CAPABILITY_UNAVAILABLE" };
        const rec = r.getResearchRecord(researchRecordId);
        if (!rec) return { result: "NOT_FOUND", researchRecordId };

        if (rec.privacy && rec.privacy.status === "NOT_AUTHORIZED") {
            return { result: "PRIVACY_BLOCKED", researchRecordId };
        }

        const items = listEvidence({ researchRecordId });
        if (!items.length) return { result: "MISSING_RESEARCH", researchRecordId, reason: "No evidence has been enriched for this research record yet." };

        // Conflict check across every dimension present.
        const byType = {};
        items.forEach((e) => { (byType[e.evidenceType] = byType[e.evidenceType] || []).push(e); });
        for (const type of Object.keys(byType)) {
            const distinctValues = Array.from(new Set(byType[type].map((e) => String(e.value))));
            if (distinctValues.length > 1) return { result: "CONFLICT", researchRecordId, evidenceType: type, values: distinctValues };
        }

        // Staleness: evidence createdAt predates the research record's
        // own updatedAt (e.g. record was confirmed/changed afterward).
        const stale = items.some((e) => new Date(e.createdAt).getTime() < new Date(rec.createdAt).getTime());
        if (stale) return { result: "STALE_EVIDENCE", researchRecordId };

        return { result: "CONSISTENT", researchRecordId };
    }

    function severityFor(result) {
        if (result === "CONFLICT" || result === "PRIVACY_BLOCKED") return "HIGH";
        if (result === "STALE_EVIDENCE" || result === "MISSING_ANALYSIS") return "MEDIUM";
        return "LOW";
    }

    function createRepairCandidate(researchRecordId) {
        const recon = reconcile(researchRecordId);
        if (recon.result === "CONSISTENT" || recon.result === "NOT_FOUND") {
            return { status: "NO_CANDIDATE", reconciliation: recon };
        }
        const candidateId = `RP035-P4-EVIDENCE-${String(nextCandidateSeq++).padStart(3, "0")}`;
        const candidate = {
            id: candidateId,
            researchRecordId,
            sourceRecordId: null,
            problem: recon.result,
            severity: severityFor(recon.result),
            detectedAt: nowISO(),
            recommendedAction: recon.result === "CONFLICT" ? "MANUAL_REVIEW_REQUIRED" : recon.result === "PRIVACY_BLOCKED" ? "AWAIT_REAUTHORIZATION" : "RE_ENRICH",
            status: "OPEN"
        };
        const r = research();
        const rec = r ? r.getResearchRecord(researchRecordId) : null;
        candidate.sourceRecordId = rec ? rec.sourceRecordId : null;
        repairCandidates.set(candidateId, candidate);
        audit("REPAIR_CANDIDATE_CREATED", { candidateId, researchRecordId, problem: recon.result });
        return { status: "CANDIDATE_CREATED", candidate: clone(candidate) };
    }

    function listRepairCandidates(filter) {
        const f = filter || {};
        return Array.from(repairCandidates.values())
            .filter((c) => (!f.status || c.status === f.status) && (!f.severity || c.severity === f.severity))
            .map(clone);
    }

    // No destructive automatic repair — only ever DEFERRED with a
    // human-actionable reason, exactly like Phase 1's own pattern.
    function applyRepair(candidateId, opts) {
        const o = opts || {};
        const candidate = repairCandidates.get(candidateId);
        if (!candidate) return { status: "NOT_FOUND" };
        if (!o.authorized) return { status: "CONFIRMATION_REQUIRED" };
        if (candidate.status !== "OPEN") return { status: "REJECTED", reason: `Candidate is already "${candidate.status}".` };
        candidate.status = "DEFERRED";
        audit("REPAIR_DEFERRED", { candidateId, reason: "No automatic repair for evidence conflicts/privacy blocks — requires human review." });
        return { status: "DEFERRED" };
    }

    // -----------------------------------------------------------------
    // 7. OFFLINE SYNC — composes Phase 7 only
    // -----------------------------------------------------------------

    function buildEvidenceSyncOperation(evidenceId) {
        const e = evidenceStore.get(evidenceId);
        if (!e) return { status: "REJECTED", reason: "Unknown evidenceId." };
        const sync = offlineSync();
        if (!sync) return { status: "CAPABILITY_UNAVAILABLE" };
        return sync.createSyncOperation({
            recordId: e.evidenceId,
            sourceRecordId: e.sourceRecordId,
            operationType: "PROVENANCE_UPDATE",
            payload: { evidenceType: e.evidenceType, value: e.value, confidence: e.confidence },
            privacyTier: "COMMUNITY"
        });
    }

    // -----------------------------------------------------------------
    // 8. CAPABILITY REGISTRY — truthful only
    // -----------------------------------------------------------------

    function getCapabilityStatus() {
        return {
            youtubeMetadata: (cozyOS() && cozyOS().CozyMediaConnectors) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            videoDownload: "CAPABILITY_UNAVAILABLE",
            frameAccess: "CAPABILITY_UNAVAILABLE",
            transcript: "CAPABILITY_UNAVAILABLE",
            asr: "CAPABILITY_UNAVAILABLE",
            ocr: "CAPABILITY_UNAVAILABLE",
            faceRecognition: "CAPABILITY_UNAVAILABLE",
            embeddings: "CAPABILITY_UNAVAILABLE",
            research: research() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            search: (cozyOS() && cozyOS().CozyResearchSearch) ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            languageRouting: langIntel() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            evidenceEnrichment: research() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            offlineSync: offlineSync() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            webRTC: "CAPABILITY_UNAVAILABLE",
            bluetooth: "CAPABILITY_UNAVAILABLE",
            wifiDirect: "CAPABILITY_UNAVAILABLE",
            nativeHotspot: "CAPABILITY_UNAVAILABLE",
            transport: transport() ? "PROBED_NO_CLAIMED_AVAILABILITY" : "CAPABILITY_UNAVAILABLE"
        };
    }

    // -----------------------------------------------------------------
    // 9. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        getVersion: () => VERSION,
        EVIDENCE_TYPES,
        CONFIDENCE_LEVELS,
        TIMESTAMP_EVIDENCE_TYPES,
        RECONCILIATION_RESULTS,
        REPAIR_SEVERITIES,
        createEvidence,
        getEvidence,
        listEvidence,
        createLanguageEvidenceFromResearchRecord,
        checkEvidenceConflict,
        createTimestampEvidence,
        enrichResearchRecord,
        getVisibleEvidence,
        reconcile,
        createRepairCandidate,
        listRepairCandidates,
        applyRepair,
        buildEvidenceSyncOperation,
        getCapabilityStatus,
        getAuditTrail
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    if (!root.window.CozyOS.Modules["cozy-media-evidence"]) {
        root.window.CozyOS.CozyMediaEvidence = api;
        root.window.CozyOS.Modules["cozy-media-evidence"] = Object.freeze({
            version: VERSION,
            api,
            description: "RP-035 Phase 4 — Media Evidence & Intelligence Enrichment. Composes Phase 2/3, RP-030, RP-035 Phase 1, Phase 6, Phase 7 real APIs only; no duplicated storage, search, language, privacy, or sync logic."
        });
    }
    if (root.window.CozyOS.ServiceRegistry && typeof root.window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            root.window.CozyOS.ServiceRegistry.registerCoordinator({
                id: "cozy-media-evidence",
                version: VERSION,
                description: "RP-035 Phase 4 evidence enrichment coordinator."
            });
        } catch (e) { /* registry optional */ }
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
