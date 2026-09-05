/**
 * CozyOS Remote Media Intelligence — core/modules/intelligence/media/
 * cozy-media-analysis-link.js
 * RP-035 Phase 1: Media Analysis Link / Reconciliation Coordinator
 *
 * Baseline: CozyOS-main-RP-034-Phase8.zip (RP-034 FINAL CERTIFIED,
 * verified SHA-256
 * d43b42d898721295cab7a08bc1518e2e8f6ce6a8bdf9e28f2c251a7cb5666e17,
 * `unzip -t` clean, full 60-file pre-existing test suite re-run before
 * any RP-035 code was written: 1484 passing, the same long-established
 * pre-existing-unrelated-failure pattern — engine-bridge 11/1,
 * audio-manager 15/15, 8 load-failure files — unchanged).
 *
 * PRIMARY TASK — closes RP-034-PHASE8-ANALYSIS-FIELD-GAP
 *   RP-034 Phase 8's own certification honestly surfaced (LATEST.md,
 *   this baseline): Phase 2's real `record.analysis` field is never
 *   updated by Phase 4's separate job store. Confirmed independently
 *   here by reading both files' real source: Phase 4's `runJob()`
 *   writes only to its own in-memory `jobs` Map; nothing in Phase 2 or
 *   Phase 4 ever calls `updateRecord(indexId, { analysis: ... })`.
 *   `cozy-intelligence-offline-sync.js`'s real
 *   `buildAnalysisResultSyncOperation(jobId)` reads `job.params.indexId`
 *   directly for the same reason — the gap this file closes.
 *
 * OWNERSHIP / COMPOSITION — no duplicated engine
 *   Phase 2 (`CozyRemoteMediaIndex`) remains the sole authoritative
 *   media/index record owner — this file calls only its real,
 *   existing `getRecord()`/`updateRecord()`/`routeLanguage()`, never
 *   reimplements record storage.
 *   Phase 4 (`CozyRemoteMediaAnalysis`) remains the sole authoritative
 *   analysis-job execution owner — this file calls only its real,
 *   existing `getJob()`/`listJobs()`, never reimplements job
 *   execution or invents a result.
 *   Phase 5 (`CozyAfricanLanguageIntelligence`) remains the sole
 *   language-routing authority — this file calls its real
 *   `routeMediaAnalysisJob()` and passes the result to Phase 2's own
 *   real `routeLanguage()`; no second language detector.
 *   Phase 6 (`CozyIntelligencePrivacy`) remains the sole privacy
 *   authority — this file reads Phase 2's real
 *   `record.ownerAuthorization.state` (the same field Phase 6's own
 *   `getMediaPrivacyView()` reads) before ever writing a link; a
 *   REVOKED source blocks linking and blocks the sync operation build
 *   below, it never merely gets skipped silently.
 *   Phase 7 (`CozyIntelligenceOfflineSync`) remains the sole sync
 *   authority — this file only calls its real
 *   `buildAnalysisResultSyncOperation()`/`buildMediaIndexSyncOperation()`
 *   after a link exists, never invents transport state.
 *   Phase 3 (`CozyRemoteMediaSearch`) is untouched — it already reads
 *   live from Phase 2's real index, so a written `record.analysis`
 *   link becomes searchable automatically, with no second search
 *   index and no change to Phase 3 itself.
 *
 * DATA MODEL — reference, not a copy
 *   record.analysis becomes:
 *     { status, capabilities, lastAnalyzedAt,   // Phase 2's original fields, preserved
 *       jobId, jobType, lastUpdated, resultReference }
 *   `status` mirrors Phase 4's own real job.state vocabulary exactly
 *   (QUEUED/RUNNING/COMPLETED/CAPABILITY_UNAVAILABLE/FAILED) plus
 *   Phase 2's own pre-existing NOT_ANALYZED default — no new,
 *   competing status vocabulary is invented. `resultReference` stores
 *   only `{ jobId, type }`, never a duplicated copy of the job result
 *   — the real result is fetched live from Phase 4's own `getJob()`
 *   whenever needed.
 *
 * HONEST SCOPE
 *   REAL: link creation/refresh, five-way reconciliation
 *   (CONSISTENT/MISSING_ANALYSIS/ORPHANED_ANALYSIS/STALE_REFERENCE/
 *   STATUS_MISMATCH), non-destructive repair-candidate generation,
 *   authorized-only repair application, idempotent re-linking (a
 *   second identical link call is a real NO_CHANGE, not a duplicate
 *   write), a privacy recheck gate before every link/repair write.
 *
 *   NOT REAL, honestly refused: no automatic/destructive repair (a
 *   repair candidate is only ever applied when the caller explicitly
 *   passes `{ authorized: true }`); no fabricated analysis result for
 *   a FAILED/CAPABILITY_UNAVAILABLE job; no bypass of Phase 6 privacy
 *   just because a record already exists locally; no second Rule 82
 *   mutator of any kind (verified both by this header and by a
 *   dedicated static-scan test in this phase's suite).
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

    const VERSION = "1.0.0-rp035-phase1";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }

    function mediaIndex() { const c = cozyOS(); return (c && c.CozyRemoteMediaIndex) || null; }
    function mediaAnalysis() { const c = cozyOS(); return (c && c.CozyRemoteMediaAnalysis) || null; }
    function languageIntel() { const c = cozyOS(); return (c && c.CozyAfricanLanguageIntelligence) || null; }
    function privacyEngine() { const c = cozyOS(); return (c && c.CozyIntelligencePrivacy) || null; }
    function offlineSync() { const c = cozyOS(); return (c && c.CozyIntelligenceOfflineSync) || null; }

    function nowISO() { return new Date().toISOString(); }
    function deepClone(v) {
        if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    /* ------------------------------------------------------------------ */
    /* VOCABULARY                                                          */
    /* ------------------------------------------------------------------ */

    // Mirrors Phase 4's own real job.state vocabulary + Phase 2's own
    // pre-existing NOT_ANALYZED default. No competing vocabulary.
    const LINK_STATUS_VALUES = Object.freeze(["NOT_ANALYZED", "QUEUED", "RUNNING", "COMPLETED", "CAPABILITY_UNAVAILABLE", "FAILED"]);

    const RECONCILIATION_RESULTS = Object.freeze(["CONSISTENT", "MISSING_ANALYSIS", "ORPHANED_ANALYSIS", "STALE_REFERENCE", "STATUS_MISMATCH", "NOT_FOUND"]);

    const REPAIR_SEVERITIES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

    /* ------------------------------------------------------------------ */
    /* AUDIT                                                               */
    /* ------------------------------------------------------------------ */

    const auditTrail = [];
    function logAudit(action, detail) { auditTrail.push({ action, detail: detail || {}, at: nowISO() }); }
    function getAuditTrail() { return deepClone(auditTrail); }

    /* ------------------------------------------------------------------ */
    /* PRIVACY RECHECK (composes Phase 2's own real ownerAuthorization —  */
    /* the same field Phase 6's getMediaPrivacyView() reads)              */
    /* ------------------------------------------------------------------ */

    /**
     * privacyGate(record)
     *   A REVOKED source blocks every write this file makes — linking,
     *   repair, and (via the caller) any subsequent sync-operation
     *   build. Never bypasses Phase 6 merely because data already
     *   exists locally (spec §14).
     */
    function privacyGate(record) {
        if (!record || !record.ownerAuthorization) return { allowed: true, reason: null };
        if (record.ownerAuthorization.state === "REVOKED") {
            return { allowed: false, reason: "OWNER_AUTHORIZATION_REVOKED" };
        }
        return { allowed: true, reason: null };
    }

    /* ------------------------------------------------------------------ */
    /* 1. LINK CREATION / REFRESH                                          */
    /* ------------------------------------------------------------------ */

    /**
     * linkAnalysisToRecord(jobId)
     *   The primary gap-closing operation. Reads Phase 4's real job,
     *   validates the referenced Phase 2 record still exists (never
     *   silently creates an orphan), rechecks privacy, then writes a
     *   REFERENCE (not a copy) into Phase 2's real record.analysis via
     *   Phase 2's own real updateRecord(). If the job carries language
     *   evidence, also composes Phase 5's real routeMediaAnalysisJob()
     *   + Phase 2's real routeLanguage() — no second language detector.
     */
    function linkAnalysisToRecord(jobId) {
        const analysis = mediaAnalysis();
        if (!analysis) return { status: "CAPABILITY_UNAVAILABLE", reason: "PHASE4_ANALYSIS_ABSENT" };
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE", reason: "PHASE2_INDEX_ABSENT" };

        const job = analysis.getJob(jobId);
        if (!job) return { status: "REJECTED", reason: "A real, existing jobId is required." };

        const record = idx.getRecord(job.params.indexId);
        if (!record) {
            logAudit("LINK_FAILED", { jobId, reason: "INDEX_RECORD_NOT_FOUND" });
            return { status: "LINK_FAILED", reason: "The index record this job referenced no longer exists. No orphan record was created." };
        }

        const gate = privacyGate(record);
        if (!gate.allowed) {
            logAudit("LINK_BLOCKED_PRIVACY", { jobId, indexId: record.indexId, reason: gate.reason });
            return { status: "BLOCKED_PRIVACY", reason: gate.reason };
        }

        const desiredStatus = job.state;
        const current = record.analysis || {};
        const unchanged = current.status === desiredStatus && current.jobId === job.jobId
            && current.resultReference && current.resultReference.type === job.type;
        if (unchanged) {
            return { status: "NO_CHANGE", indexId: record.indexId, jobId };
        }

        const updates = {
            analysis: {
                status: desiredStatus,
                jobId: job.jobId,
                jobType: job.type,
                lastUpdated: nowISO(),
                lastAnalyzedAt: job.state === "COMPLETED" ? nowISO() : (current.lastAnalyzedAt || null),
                resultReference: { jobId: job.jobId, type: job.type }
            }
        };
        const result = idx.updateRecord(record.indexId, updates, { provenanceSource: "ANALYSIS_RESULT" });
        if (result.status !== "UPDATED") {
            return { status: "LINK_FAILED", reason: `Phase 2 updateRecord() returned "${result.status}".` };
        }

        logAudit("LINKED", { jobId, indexId: record.indexId, status: desiredStatus });

        // Language routing composition (spec §17) — only when the real
        // job actually completed and actually carries language evidence.
        let languageRouting = { status: "NOT_APPLICABLE" };
        if (job.state === "COMPLETED") {
            const lang = languageIntel();
            if (lang && typeof lang.routeMediaAnalysisJob === "function") {
                // RP-035 Phase 4 fix: real region/dialect/community
                // evidence exists on job.params (the same values used
                // to register the regional context in the first
                // place), but this call previously passed no opts, so
                // routeMediaAnalysisJob() always evaluated region as
                // undefined and record.language.region silently stayed
                // null even when real regional evidence was supplied.
                // Forward the job's own real params — never invent a
                // region that wasn't actually part of the job.
                const jobEvidence = {
                    region: job.params && job.params.region ? job.params.region : undefined,
                    dialect: job.params && job.params.dialect ? job.params.dialect : undefined,
                    community: job.params && job.params.community ? job.params.community : undefined,
                    country: job.params && job.params.country ? job.params.country : undefined
                };
                const routed = lang.routeMediaAnalysisJob(jobId, jobEvidence);
                if (routed.status === "AVAILABLE" && routed.identity && routed.identity.status === "RESOLVED") {
                    idx.routeLanguage(record.indexId, {
                        // RP-035 Phase 2 fix: routeMediaAnalysisJob() returns
                        // the resolved code under `languageCode`, not
                        // `languageId` — Phase 2's language/country
                        // composition surfaced that the two never matched,
                        // so record.language.detected was silently staying
                        // null. Corrected to the real field name.
                        languageId: routed.identity.languageCode || routed.identity.languageId,
                        confidence: routed.identity.confidence,
                        region: routed.identity.region,
                        dialect: routed.identity.dialect
                    });
                    languageRouting = { status: "ROUTED", identity: routed.identity };
                } else {
                    languageRouting = { status: routed.status || "UNRESOLVED" };
                }
            } else {
                languageRouting = { status: "CAPABILITY_UNAVAILABLE" };
            }
        }

        return { status: "LINKED", indexId: record.indexId, jobId, analysisStatus: desiredStatus, languageRouting };
    }

    /* ------------------------------------------------------------------ */
    /* 2. LINK STATUS                                                      */
    /* ------------------------------------------------------------------ */

    function getLinkStatus(indexId) {
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE" };
        const record = idx.getRecord(indexId);
        if (!record) return { status: "NOT_FOUND" };
        return { status: "AVAILABLE", analysis: deepClone(record.analysis) };
    }

    /* ------------------------------------------------------------------ */
    /* 3. RECONCILIATION                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * reconcile(indexId)
     *   Compares the real Phase 2 record against the real Phase 4 job
     *   store it references (or should reference). Never fabricates a
     *   CONSISTENT result.
     */
    function reconcile(indexId) {
        const idx = mediaIndex();
        const analysis = mediaAnalysis();
        if (!idx || !analysis) return { result: "NOT_FOUND", reason: "CAPABILITY_UNAVAILABLE" };
        const record = idx.getRecord(indexId);
        if (!record) return { result: "NOT_FOUND", reason: "INDEX_RECORD_NOT_FOUND" };

        const linked = record.analysis && record.analysis.jobId;
        const relatedJobs = analysis.listJobs().filter((j) => j.params && j.params.indexId === indexId);

        if (!linked) {
            const completedUnlinked = relatedJobs.find((j) => j.state === "COMPLETED" || j.state === "FAILED" || j.state === "CAPABILITY_UNAVAILABLE");
            if (completedUnlinked) {
                return { result: "MISSING_ANALYSIS", indexId, jobId: completedUnlinked.jobId, reason: "A real analysis job exists for this record but was never linked." };
            }
            return { result: "CONSISTENT", indexId, reason: "No analysis job exists yet; NOT_ANALYZED is correct." };
        }

        const job = analysis.getJob(record.analysis.jobId);
        if (!job) {
            return { result: "ORPHANED_ANALYSIS", indexId, jobId: record.analysis.jobId, reason: "record.analysis references a jobId that no longer exists in Phase 4's job store." };
        }

        if (job.state !== record.analysis.status) {
            return { result: "STATUS_MISMATCH", indexId, jobId: job.jobId, recordedStatus: record.analysis.status, actualStatus: job.state };
        }

        if (record.analysis.lastUpdated && job.updatedAt && new Date(job.updatedAt).getTime() > new Date(record.analysis.lastUpdated).getTime()) {
            return { result: "STALE_REFERENCE", indexId, jobId: job.jobId, reason: "Phase 4's job has progressed since this link was last written." };
        }

        return { result: "CONSISTENT", indexId, jobId: job.jobId };
    }

    function reconcileAll() {
        const idx = mediaIndex();
        if (!idx) return { status: "CAPABILITY_UNAVAILABLE", results: [] };
        const records = idx.listRecords();
        return { status: "AVAILABLE", results: records.map((r) => reconcile(r.indexId)) };
    }

    /* ------------------------------------------------------------------ */
    /* 4. REPAIR CANDIDATES (non-destructive)                              */
    /* ------------------------------------------------------------------ */

    const repairCandidates = new Map();
    let nextCandidateSeq = 1;

    function severityFor(result) {
        if (result === "ORPHANED_ANALYSIS" || result === "STATUS_MISMATCH") return "HIGH";
        if (result === "MISSING_ANALYSIS" || result === "STALE_REFERENCE") return "MEDIUM";
        return "LOW";
    }

    function recommendedActionFor(result) {
        switch (result) {
            case "MISSING_ANALYSIS": return "Call linkAnalysisToRecord(jobId) to create the missing link.";
            case "ORPHANED_ANALYSIS": return "Investigate the missing Phase 4 job; consider clearing the stale reference once confirmed.";
            case "STALE_REFERENCE": return "Call linkAnalysisToRecord(jobId) to refresh the link with the job's current state.";
            case "STATUS_MISMATCH": return "Call linkAnalysisToRecord(jobId) to resynchronize the recorded status with Phase 4's real job.state.";
            default: return "No action required.";
        }
    }

    /**
     * createRepairCandidate(indexId)
     *   Reconciles first (never fabricates a problem, never skips a
     *   real one), then produces a candidate for genuinely
     *   inconsistent results only. CONSISTENT/NOT_FOUND produce no
     *   candidate.
     */
    function createRepairCandidate(indexId) {
        const recon = reconcile(indexId);
        if (recon.result === "CONSISTENT" || recon.result === "NOT_FOUND") {
            return { status: "NO_CANDIDATE", reconciliation: recon };
        }
        const candidateId = `RP035-MEDIA-LINK-${String(nextCandidateSeq++).padStart(3, "0")}`;
        const candidate = {
            id: candidateId,
            sourceRecordId: indexId,
            jobId: recon.jobId || null,
            problem: recon.result,
            severity: severityFor(recon.result),
            detectedAt: nowISO(),
            recommendedAction: recommendedActionFor(recon.result),
            status: "OPEN"
        };
        repairCandidates.set(candidateId, candidate);
        logAudit("REPAIR_CANDIDATE_CREATED", { candidateId, indexId, problem: recon.result });
        return { status: "CANDIDATE_CREATED", candidate: deepClone(candidate) };
    }

    function listRepairCandidates(filter) {
        const f = filter || {};
        return Array.from(repairCandidates.values())
            .filter((c) => (!f.status || c.status === f.status) && (!f.severity || c.severity === f.severity))
            .map((c) => deepClone(c));
    }

    /**
     * applyRepair(candidateId, opts)
     *   No automatic destructive repair (spec §12). Requires an
     *   explicit { authorized: true } and only ever re-runs the same
     *   real linkAnalysisToRecord() path — never a different, riskier
     *   code path than the one used for a fresh link.
     */
    function applyRepair(candidateId, opts) {
        const o = opts || {};
        const candidate = repairCandidates.get(candidateId);
        if (!candidate) return { status: "NOT_FOUND" };
        if (!o.authorized) return { status: "CONFIRMATION_REQUIRED", reason: "applyRepair() requires an explicit { authorized: true }." };
        if (candidate.status !== "OPEN") return { status: "REJECTED", reason: `Candidate is already "${candidate.status}".` };

        if (candidate.problem === "ORPHANED_ANALYSIS") {
            // Honest: no destructive auto-clear. The job is genuinely
            // gone; this file will not fabricate one back into existence.
            candidate.status = "DEFERRED";
            logAudit("REPAIR_DEFERRED", { candidateId, reason: "ORPHANED_ANALYSIS has no safe automatic repair." });
            return { status: "DEFERRED", reason: "No safe automatic repair exists for an orphaned analysis reference; investigate manually." };
        }

        if (!candidate.jobId) return { status: "REJECTED", reason: "No jobId available to re-link." };
        const linkResult = linkAnalysisToRecord(candidate.jobId);
        if (linkResult.status === "LINKED" || linkResult.status === "NO_CHANGE") {
            candidate.status = "RESOLVED";
            logAudit("REPAIR_APPLIED", { candidateId, linkResult: linkResult.status });
            return { status: "RESOLVED", linkResult };
        }
        return { status: "REPAIR_FAILED", linkResult };
    }

    /* ------------------------------------------------------------------ */
    /* 5. SYNC COMPOSITION (Phase 7 remains authority)                     */
    /* ------------------------------------------------------------------ */

    /**
     * buildLinkedSyncOperation(indexId)
     *   Only ever builds a sync operation for a currently-linked,
     *   privacy-allowed record — composes Phase 7's real
     *   buildAnalysisResultSyncOperation() unchanged, never invents a
     *   transport state itself.
     */
    function buildLinkedSyncOperation(indexId) {
        const idx = mediaIndex();
        const sync = offlineSync();
        if (!idx || !sync) return { status: "CAPABILITY_UNAVAILABLE" };
        const record = idx.getRecord(indexId);
        if (!record) return { status: "REJECTED", reason: "NOT_FOUND" };
        const gate = privacyGate(record);
        if (!gate.allowed) return { status: "BLOCKED_PRIVACY", reason: gate.reason };
        if (!record.analysis || !record.analysis.jobId) return { status: "REJECTED", reason: "No linked analysis job to synchronize." };
        return sync.buildAnalysisResultSyncOperation(record.analysis.jobId);
    }

    /* ------------------------------------------------------------------ */
    /* 6. CAPABILITIES                                                     */
    /* ------------------------------------------------------------------ */

    function capabilities() {
        return {
            mediaIndex: mediaIndex() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            mediaAnalysis: mediaAnalysis() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            languageIntelligence: languageIntel() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            privacyEngine: privacyEngine() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            offlineSync: offlineSync() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE"
        };
    }

    /* ------------------------------------------------------------------ */
    /* PUBLIC API                                                           */
    /* ------------------------------------------------------------------ */

    const api = Object.freeze({
        getVersion: () => VERSION,
        LINK_STATUS_VALUES, RECONCILIATION_RESULTS, REPAIR_SEVERITIES,
        linkAnalysisToRecord,
        getLinkStatus,
        reconcile, reconcileAll,
        createRepairCandidate, listRepairCandidates, applyRepair,
        buildLinkedSyncOperation,
        getAuditTrail,
        capabilities
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-media-analysis-link"]) {
            window.CozyOS.CozyMediaAnalysisLink = api;
            window.CozyOS.Modules["cozy-media-analysis-link"] = Object.freeze({
                version: VERSION,
                description: "RP-035 Phase 1 — closes RP-034-PHASE8-ANALYSIS-FIELD-GAP. Authoritative, provenance-preserving, privacy-aware, idempotent link/reconciliation coordinator between Phase 2's index record and Phase 4's analysis job — composes both plus Phase 5 language routing, Phase 6 privacy, and Phase 7 sync without duplicating any of them. Non-destructive repair candidates only; repair application requires explicit authorization."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/media/cozy-media-analysis-link.js",
                    name: "CozyMediaAnalysisLink", category: "Living Engine",
                    description: "RP-035 Phase 1 media-analysis link/reconciliation coordinator. Closes the RP-034-PHASE8-ANALYSIS-FIELD-GAP. Composes Phase 2/4/5/6/7 real APIs only; no duplicated storage, execution, language, privacy, or transport logic."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
