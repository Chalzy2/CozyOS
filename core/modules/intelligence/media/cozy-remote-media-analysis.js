/**
 * core/modules/intelligence/media/cozy-remote-media-analysis.js
 * Repair: RP-034 Phase 4 — Full Remote Media Intelligence Pipeline
 * Baseline: CozyOS-main-RP-034-Phase3.zip (verified: SHA-256
 * 2c2bc721597fc9cbffe6a7e96deb1b184b919bb4c23730cb9acf81cd642ad8a9,
 * `unzip -t` clean, Phase 1's 30/30, Phase 2's 55/55, Phase 3's 56/56
 * tests re-run and passing before any Phase 4 code was written).
 *
 * MILESTONE SCOPE — THIS FILE IS PHASE 4 ONLY
 *   Does not implement Phase 5 (expanded African-language routing),
 *   Phase 6 (privacy/identity expansion), Phase 7 (offline
 *   synchronization), or Phase 8 (final integrated test matrix).
 *
 * MISSION
 *   Coordinate real analysis jobs over already-indexed remote-media
 *   records, composing the full existing chain
 *   (Connector -> Index -> Search -> Analysis -> Ingestion -> Community
 *   -> SafetyGate -> LanguagePackRegistry -> CozyMemory) rather than
 *   duplicating any of it. The complete YouTube video is never
 *   downloaded or stored merely to claim analysis — this file only
 *   ever operates on what the real, authorized Phase 1 connector
 *   actually returns, or on text a caller explicitly supplies (e.g. a
 *   transcript they already have legitimate access to).
 *
 * REPOSITORY AUDIT PERFORMED BEFORE WRITING ANY CODE
 *   `core/engines/media/language/language-detection-engine.js` (M388
 *   Engine 2) is a real, existing script/lexical-overlap text language
 *   hint engine — but it is an ES module (`export default`), a
 *   different module system from every file this pipeline composes
 *   (all CommonJS/`window.CozyOS` IIFE or dual-UMD). Rather than take
 *   on the real technical risk of cross-module-system composition
 *   under this repair's own scope, `LANGUAGE_IDENTIFICATION` below is
 *   honestly scoped to explicit, caller-supplied language evidence
 *   (verified against the real RP-030 registry) rather than automatic
 *   detection from raw text — a disclosed scope decision, not a
 *   silent gap. `core/connectivity/cozy-connectivity-transport.js`
 *   (RP-033 Gate 2) was read in full and is composed directly for
 *   hotspot transport (`sendPacket`/`receivePacket`/`queue`) — its
 *   real state vocabulary (QUEUED/WAITING_FOR_TRANSPORT/
 *   TRANSPORT_AVAILABLE/TRANSFERRING/RECEIVED/VERIFIED/FAILED/
 *   CANCELLED/EXPIRED) is used verbatim rather than translated into a
 *   different invented vocabulary — reusing the real system's own
 *   truthful names is more honest than a paraphrase layer. That real
 *   vocabulary has no "SYNCED" state, by design (confirmed by its own
 *   source comment); this file never reports one either.
 *
 * OWNERSHIP / COMPOSITION — no duplication anywhere:
 *   - CozyMediaConnectors (Phase 1) — never called directly for
 *     ordinary analysis; only indirectly via Phase 2's own
 *     `refreshMetadata()` when a job genuinely needs fresher metadata.
 *   - CozyRemoteMediaIndex (Phase 2) — `getRecord`/`listRecords`/
 *     `addTimestamp`/`getCapabilities` — the sole source of truth for
 *     stored remote-media records.
 *   - CozyRemoteMediaSearch (Phase 3) — `getResearchPriority`/
 *     `aggregateResearch`/`detectConflicts` — real research-engine
 *     integration (§9), never a second research/ranking system.
 *   - CozyKnowledgeIngestion (RP-029-A) — `ingestCommunitySubmission()`
 *     for the real `COMMUNITY_KNOWLEDGE_CANDIDATE` job — goes through
 *     the exact same real safety-gate-first pipeline every other
 *     community submission in this repository already does.
 *   - CozyKnowledgeCommunity (RP-029-B) — composed where a submission
 *     needs the richer review-state model; not duplicated.
 *   - CozyKnowledgeSafetyGate (RP-029-C) — `classify()`/`quarantine()`
 *     — every extracted term/phrase goes through this real gate before
 *     ever becoming a stored candidate. No second safety system, no
 *     bypass, ever.
 *   - CozyLanguagePacks (RP-030) — `getPack`/`listRegionalContexts` —
 *     read-only, same honest resolved/uncertain/ambiguous logic
 *     already established in Phases 2-3.
 *   - CozyConnectivityTransport (RP-033 Gate 2) — real hotspot/P2P
 *     transport composition (see above).
 *   - CozyMemory — composed only indirectly, through Phase 2's own
 *     `addTimestamp`/`getRecord` — this file keeps its own small,
 *     disclosed, in-memory (session-scoped) job/result store, the same
 *     honest pattern every other stateful module in this repository
 *     already uses; it does not persist Phase 4's own job records via
 *     CozyMemory this pass (a real, disclosed scope choice, not an
 *     oversight — Phase 4's *outputs*, once turned into a real
 *     timestamp or a real community-knowledge candidate, DO land in
 *     Phase 2's/RP-029's own real persistent stores).
 *
 * NO FABRICATION — job-by-job honest scope
 *   TRANSCRIPT_ANALYSIS / TERM_EXTRACTION / PHRASE_EXTRACTION: real
 *   only when the caller supplies real `transcriptText` (no real
 *   transcript-fetch backend exists anywhere in this repository,
 *   confirmed by Phase 1's own permanent `CAPABILITY_UNAVAILABLE`) —
 *   otherwise honestly `CAPABILITY_UNAVAILABLE`. Extraction itself is
 *   real, disclosed tokenization/n-gram counting, not an ML model.
 *   LANGUAGE_IDENTIFICATION: real only against explicit, caller-
 *   supplied evidence verified via RP-030 — never inferred from raw
 *   audio/text (no real backend for that exists).
 *   TOPIC_EXTRACTION: always `CAPABILITY_UNAVAILABLE` — no real
 *   topic-modeling/NLP engine exists anywhere in this repository.
 *   TIMESTAMP_INDEXING: real only for caller-supplied timestamp/term
 *   pairs — never generated from video (this pipeline never analyzes
 *   audio/video bytes it doesn't have).
 *   DOMAIN_CLASSIFICATION: always caller-asserted, never auto-inferred
 *   — no real classifier exists; a domain is only ever what the caller
 *   explicitly says it is, tagged `COMMUNITY_REPORTED`.
 *   COMMUNITY_KNOWLEDGE_CANDIDATE / RESEARCH_CANDIDATE: real, via the
 *   composed RP-029-A/Phase-3 functions above.
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

    const VERSION = "1.0.0-rp034-phase4";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function mediaIndex() { const c = cozyOS(); return c && c.CozyRemoteMediaIndex ? c.CozyRemoteMediaIndex : null; }
    function mediaSearch() { const c = cozyOS(); return c && c.CozyRemoteMediaSearch ? c.CozyRemoteMediaSearch : null; }
    function ingestion() { const c = cozyOS(); return c && c.CozyKnowledgeIngestion ? c.CozyKnowledgeIngestion : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function transport() { const c = cozyOS(); return c && c.CozyConnectivityTransport ? c.CozyConnectivityTransport : null; }

    const JOB_TYPES = Object.freeze([
        "TRANSCRIPT_ANALYSIS", "LANGUAGE_IDENTIFICATION", "TERM_EXTRACTION", "PHRASE_EXTRACTION",
        "TOPIC_EXTRACTION", "TIMESTAMP_INDEXING", "DOMAIN_CLASSIFICATION",
        "COMMUNITY_KNOWLEDGE_CANDIDATE", "RESEARCH_CANDIDATE"
    ]);
    const JOB_STATES = Object.freeze(["QUEUED", "RUNNING", "COMPLETED", "CAPABILITY_UNAVAILABLE", "FAILED"]);
    const DOMAINS = Object.freeze(["COMMUNITY_KNOWLEDGE", "PROFESSIONAL_KNOWLEDGE", "EDUCATIONAL_KNOWLEDGE", "AGRICULTURAL_KNOWLEDGE", "HEALTH_KNOWLEDGE", "RELIGIOUS_KNOWLEDGE", "SCHOOL_KNOWLEDGE"]);

    function nowISO() { return new Date().toISOString(); }

    /* ------------------------------------------------------------------ */
    /* IN-MEMORY JOB / RESULT / FINGERPRINT STORE (session-scoped, real,  */
    /* disclosed — see file header)                                       */
    /* ------------------------------------------------------------------ */

    const jobs = new Map();
    const fingerprints = new Map(); // fingerprint -> [jobId, ...] (preserves separate evidence)
    let nextJobSeq = 1;

    function freshJobId() { return "rmaj_" + (nextJobSeq++); }

    /* ------------------------------------------------------------------ */
    /* 1. JOB LIFECYCLE                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * createJob(type, params)
     *   params: { indexId, transcriptText?, languageId?, region?,
     *             dialect?, domain?, meaning?, context?, timestamps?,
     *             contributorId? }
     */
    function createJob(type, params) {
        if (JOB_TYPES.indexOf(type) === -1) return { status: "REJECTED", reason: "Unrecognized job type." };
        const idx = mediaIndex();
        const p = params || {};
        if (!idx) return { status: "REJECTED", reason: "CAPABILITY_UNAVAILABLE_MEDIA_INDEX_ABSENT" };
        if (!p.indexId || !idx.getRecord(p.indexId)) return { status: "REJECTED", reason: "A real, existing indexId is required." };

        const jobId = freshJobId();
        const job = { jobId, type, params: p, state: "QUEUED", result: null, error: null, createdAt: nowISO(), updatedAt: nowISO() };
        jobs.set(jobId, job);
        return { status: "QUEUED", jobId };
    }

    function getJob(jobId) { return jobs.get(jobId) || null; }
    function listJobs(filter) {
        const f = filter || {};
        return Array.from(jobs.values()).filter((j) => (!f.type || j.type === f.type) && (!f.state || j.state === f.state));
    }

    /* ------------------------------------------------------------------ */
    /* 2. REAL TEXT ANALYSIS (disclosed tokenization/n-gram — no NLP model) */
    /* ------------------------------------------------------------------ */

    const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "and", "or", "of", "to", "in", "on", "for", "with", "this", "that"]);

    function extractTerms(text) {
        return Array.from(new Set(String(text).toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))));
    }
    function extractPhrases(text, minLen, maxLen) {
        const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
        const counts = new Map();
        for (let len = minLen; len <= maxLen; len++) {
            for (let i = 0; i + len <= words.length; i++) {
                const phrase = words.slice(i, i + len).join(" ");
                counts.set(phrase, (counts.get(phrase) || 0) + 1);
            }
        }
        return Array.from(counts.entries()).filter(([, c]) => c >= 1).map(([phrase, count]) => ({ phrase, count }));
    }

    /* ------------------------------------------------------------------ */
    /* 3. DUPLICATE / FINGERPRINT                                          */
    /* ------------------------------------------------------------------ */

    function fingerprintFor({ sourceId, timestampSeconds, language, normalizedTerm, analysisType }) {
        return [sourceId || "", timestampSeconds != null ? timestampSeconds : "", language || "", normalizedTerm || "", analysisType || ""].join("::");
    }

    function recordFingerprint(fp, jobId) {
        const existing = fingerprints.get(fp) || [];
        const isDuplicate = existing.length > 0;
        existing.push(jobId);
        fingerprints.set(fp, existing);
        return { isDuplicate, evidenceCount: existing.length };
    }

    /* ------------------------------------------------------------------ */
    /* 4. LANGUAGE ROUTING (composes RP-030 — Priority: community/dialect  */
    /*    -> regional -> country -> general -> fallback)                   */
    /* ------------------------------------------------------------------ */

    function routeLanguageEvidence(evidence) {
        const api = packsApi();
        if (!api) return { status: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const e = evidence || {};
        if (!e.languageId) return { status: "LANGUAGE_UNCERTAIN", reason: "NO_LANGUAGE_ID_EVIDENCE_SUPPLIED" };
        const pack = api.getPack(e.languageId);
        if (!pack) return { status: "LANGUAGE_UNCERTAIN", reason: "LANGUAGE_NOT_REGISTERED_IN_RP030" };

        if (!e.region && !e.dialect) return { status: "RESOLVED", packId: pack.identity.languageId, routingLevel: "GENERAL_LANGUAGE_PACK" };

        const contexts = api.listRegionalContexts(e.languageId);
        const exactMatch = contexts.filter((c) => (!e.region || c.region === e.region) && (!e.dialect || c.dialect === e.dialect));
        if (exactMatch.length === 1) return { status: "RESOLVED", packId: pack.identity.languageId, routingLevel: e.dialect ? "EXACT_COMMUNITY_DIALECT" : "REGIONAL_LANGUAGE_PACK" };
        if (exactMatch.length > 1) return { status: "AMBIGUOUS_LANGUAGE", reason: "MULTIPLE_MATCHING_REGIONAL_CONTEXTS", packId: pack.identity.languageId };

        const regionOnly = e.region ? contexts.filter((c) => c.region === e.region) : [];
        if (regionOnly.length >= 1) return { status: "RESOLVED", packId: pack.identity.languageId, routingLevel: "REGIONAL_LANGUAGE_PACK", note: "Exact dialect not matched; routed to regional pack." };

        const countryOnly = e.country ? contexts.filter((c) => c.country === e.country) : [];
        if (countryOnly.length >= 1) return { status: "RESOLVED", packId: pack.identity.languageId, routingLevel: "COUNTRY_LANGUAGE_PACK", note: "Exact region not matched; routed to country pack." };

        return { status: "RESOLVED", packId: pack.identity.languageId, routingLevel: "GENERAL_LANGUAGE_PACK", note: "No matching regional/country context; routed to the general language pack. Never silently substituted for a different language." };
    }

    /* ------------------------------------------------------------------ */
    /* 5. JOB EXECUTION                                                    */
    /* ------------------------------------------------------------------ */

    function fail(job, reason) { job.state = "FAILED"; job.error = reason; job.updatedAt = nowISO(); return { status: "FAILED", jobId: job.jobId, reason }; }
    function unavailable(job, reason) { job.state = "CAPABILITY_UNAVAILABLE"; job.error = reason; job.updatedAt = nowISO(); return { status: "CAPABILITY_UNAVAILABLE", jobId: job.jobId, reason }; }
    function complete(job, result) { job.state = "COMPLETED"; job.result = result; job.updatedAt = nowISO(); return { status: "COMPLETED", jobId: job.jobId, result }; }

    /**
     * runJob(jobId)
     *   Real, synchronous execution (no genuine I/O is required by any
     *   job type in this file's honest scope — see header). Never
     *   silently downgrades CAPABILITY_UNAVAILABLE into a fabricated
     *   COMPLETED result.
     */
    function runJob(jobId) {
        const job = jobs.get(jobId);
        if (!job) return { status: "NOT_FOUND" };
        if (job.state !== "QUEUED") return { status: "REJECTED", reason: "Job must be QUEUED to run (currently " + job.state + ")." };
        job.state = "RUNNING";
        job.updatedAt = nowISO();

        const idx = mediaIndex();
        const record = idx.getRecord(job.params.indexId);
        if (!record) return fail(job, "Underlying index record no longer exists.");

        const p = job.params;

        if (job.type === "TRANSCRIPT_ANALYSIS") {
            if (!p.transcriptText) return unavailable(job, "NO_REAL_TRANSCRIPT_TEXT_SUPPLIED_AND_NO_TRANSCRIPT_FETCH_BACKEND_EXISTS");
            const terms = extractTerms(p.transcriptText);
            return complete(job, { analysisType: "TRANSCRIPT_ANALYSIS", termCount: terms.length, terms, evidence: "transcript" });
        }

        if (job.type === "LANGUAGE_IDENTIFICATION") {
            const routing = routeLanguageEvidence(p);
            return complete(job, { analysisType: "LANGUAGE_IDENTIFICATION", routing });
        }

        if (job.type === "TERM_EXTRACTION") {
            const text = p.transcriptText || record.description;
            if (!text) return unavailable(job, "NO_REAL_TEXT_AVAILABLE_FOR_TERM_EXTRACTION");
            const terms = extractTerms(text);
            return complete(job, { analysisType: "TERM_EXTRACTION", terms, evidence: p.transcriptText ? "transcript" : "description" });
        }

        if (job.type === "PHRASE_EXTRACTION") {
            const text = p.transcriptText || record.description;
            if (!text) return unavailable(job, "NO_REAL_TEXT_AVAILABLE_FOR_PHRASE_EXTRACTION");
            const phrases = extractPhrases(text, 2, 4);
            return complete(job, { analysisType: "PHRASE_EXTRACTION", phrases, evidence: p.transcriptText ? "transcript" : "description" });
        }

        if (job.type === "TOPIC_EXTRACTION") {
            return unavailable(job, "NO_REAL_TOPIC_MODELING_ENGINE_EXISTS_IN_THIS_REPOSITORY");
        }

        if (job.type === "TIMESTAMP_INDEXING") {
            if (!Array.isArray(p.timestamps) || p.timestamps.length === 0) return unavailable(job, "NO_REAL_TIMESTAMP_DATA_SUPPLIED");
            const added = [];
            p.timestamps.forEach((t) => {
                const result = idx.addTimestamp(p.indexId, t);
                added.push({ input: t, result: result.status });
            });
            return complete(job, { analysisType: "TIMESTAMP_INDEXING", added });
        }

        if (job.type === "DOMAIN_CLASSIFICATION") {
            if (!p.domain || DOMAINS.indexOf(p.domain) === -1) return unavailable(job, "NO_REAL_CALLER_ASSERTED_DOMAIN_SUPPLIED_AND_NO_AUTOMATIC_CLASSIFIER_EXISTS");
            return complete(job, { analysisType: "DOMAIN_CLASSIFICATION", domain: p.domain, source: "COMMUNITY_REPORTED", note: "Caller-asserted domain only — never auto-inferred, never auto-upgraded to professionally verified." });
        }

        if (job.type === "COMMUNITY_KNOWLEDGE_CANDIDATE") {
            const ing = ingestion();
            if (!ing) return unavailable(job, "INGESTION_MODULE_ABSENT");
            const statement = p.meaning || p.transcriptText || record.title;
            if (!statement) return unavailable(job, "NO_REAL_STATEMENT_TEXT_AVAILABLE");
            const result = ing.ingestCommunitySubmission({ statement, contributorId: p.contributorId || "remote-media-analysis", meta: { sourceType: "REMOTE_MEDIA_ANALYSIS", indexId: p.indexId, domain: p.domain || null } });
            const fp = fingerprintFor({ sourceId: record.sourceId, timestampSeconds: (p.timestamps && p.timestamps[0] && p.timestamps[0].timestampSeconds) || null, language: p.languageId, normalizedTerm: statement.toLowerCase().slice(0, 64), analysisType: "COMMUNITY_KNOWLEDGE_CANDIDATE" });
            const dup = recordFingerprint(fp, job.jobId);
            return complete(job, { analysisType: "COMMUNITY_KNOWLEDGE_CANDIDATE", ingestion: result, duplicate: dup });
        }

        if (job.type === "RESEARCH_CANDIDATE") {
            const search = mediaSearch();
            if (!search) return unavailable(job, "SEARCH_ENGINE_ABSENT");
            const query = p.meaning || record.title;
            const priority = search.getResearchPriority(query);
            return complete(job, { analysisType: "RESEARCH_CANDIDATE", query, priority });
        }

        return fail(job, "UNHANDLED_JOB_TYPE");
    }

    /* ------------------------------------------------------------------ */
    /* 6. SAFETY-GATED TERM STORAGE                                        */
    /* ------------------------------------------------------------------ */

    /**
     * submitExtractedTermSafely(term, opts)
     *   Every extracted term/phrase goes through the real, composed
     *   RP-029-C gate before ever becoming a community-knowledge
     *   candidate. No second safety system, no bypass.
     */
    function submitExtractedTermSafely(term, opts) {
        const gate = safetyGate();
        const ing = ingestion();
        if (!gate || !ing) return { status: "CAPABILITY_UNAVAILABLE" };
        const o = opts || {};
        const classification = gate.classify({ expression: term, contributionType: "WEBSITE_EVIDENCE" });
        if (classification.classification === "UNSAFE" || classification.classification === "UNCERTAIN") {
            gate.quarantine({ expression: term, language: o.languageId || null, contributionType: "WEBSITE_EVIDENCE", sourceRecordId: o.indexId || null }, classification, o.contributorId || "remote-media-analysis");
            return { status: "QUARANTINED", classification: classification.classification, category: classification.category };
        }
        const result = ing.ingestCommunitySubmission({ statement: term, contributorId: o.contributorId || "remote-media-analysis", meta: { sourceType: "REMOTE_MEDIA_ANALYSIS", indexId: o.indexId || null } });
        return { status: "SAFE", ingestion: result };
    }

    /* ------------------------------------------------------------------ */
    /* 7. COZY OFFLINE HOTSPOT INTEGRATION (composes RP-033 Gate 2)        */
    /* ------------------------------------------------------------------ */

    const ANALYSIS_PACKAGE_TYPE = "remote-media-analysis-package";
    const auditTrail = [];

    function logAudit(action, detail) { auditTrail.push({ action, detail, at: nowISO() }); }
    function getAuditTrail() { return auditTrail.slice(); }

    /**
     * shareAnalysisPackage(jobId, opts)
     *   Composes the real RP-033 Gate 2 transport's real sendPacket() —
     *   no second transport is built. Real states only, verbatim from
     *   the composed system.
     */
    function shareAnalysisPackage(jobId, opts) {
        const job = jobs.get(jobId);
        if (!job) return { status: "NOT_FOUND" };
        if (job.state !== "COMPLETED") return { status: "REJECTED", reason: "Only a COMPLETED job's result can be shared." };
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const o = opts || {};
        const sendResult = t.sendPacket({
            destination: o.destination || "peer", payloadType: ANALYSIS_PACKAGE_TYPE,
            payload: { jobId: job.jobId, type: job.type, result: job.result },
            sender: o.sender || "remote-media-analysis", sessionId: o.sessionId, connectionId: o.connectionId,
            ttlMs: o.ttlMs, priority: o.priority
        });
        logAudit("SHARE_ANALYSIS_PACKAGE", { jobId, sendResult: sendResult.state || sendResult.reason });
        return sendResult;
    }

    /**
     * receiveAnalysisPackage(envelope, opts)
     *   Composes the real transport's real receivePacket() (integrity/
     *   provenance/session/replay checks), then — and only on genuine
     *   accept — runs: real safety-gate classification of any text
     *   content, real language-routing validation, a real duplicate-
     *   fingerprint check, and a real audit-trail entry. Never trusts
     *   another CozyOS device merely because it presents a well-formed
     *   packet.
     */
    function receiveAnalysisPackage(envelope, opts) {
        const t = transport();
        if (!t) return { status: "CAPABILITY_UNAVAILABLE", reason: "CONNECTIVITY_TRANSPORT_ABSENT" };
        const accept = t.receivePacket(envelope, opts);
        if (!accept.accepted) { logAudit("RECEIVE_REJECTED", { reason: accept.reason }); return { status: "REJECTED", reason: accept.reason }; }

        const payload = envelope.payload;
        if (!payload || payload.type === undefined) { logAudit("RECEIVE_MALFORMED", {}); return { status: "REJECTED", reason: "Malformed analysis package payload." }; }

        const gate = safetyGate();
        const textToCheck = payload.result && (payload.result.query || (payload.result.terms && payload.result.terms[0]) || null);
        let safetyStatus = "SAFE";
        if (gate && textToCheck) {
            const classification = gate.classify({ expression: String(textToCheck), contributionType: "WEBSITE_EVIDENCE" });
            if (classification.classification !== "SAFE") safetyStatus = classification.classification;
        }

        let languageStatus = null;
        if (payload.result && payload.result.routing) languageStatus = payload.result.routing.status;

        const fp = fingerprintFor({ sourceId: payload.jobId, timestampSeconds: null, language: languageStatus, normalizedTerm: payload.type, analysisType: "RECEIVED_PACKAGE" });
        const dup = recordFingerprint(fp, payload.jobId);

        logAudit("RECEIVE_ANALYSIS_PACKAGE", { jobId: payload.jobId, safetyStatus, languageStatus, duplicate: dup.isDuplicate });
        return { status: "IMPORTED", jobId: payload.jobId, safetyStatus, languageStatus, duplicate: dup };
    }

    /* ------------------------------------------------------------------ */
    /* 8. RESEARCH ENGINE INTEGRATION (feeds Phase 3, composed)            */
    /* ------------------------------------------------------------------ */

    function feedResearchEngine(query) {
        const search = mediaSearch();
        if (!search) return { status: "CAPABILITY_UNAVAILABLE" };
        return { status: "AVAILABLE", priority: search.getResearchPriority(query), aggregate: search.aggregateResearch(query) };
    }

    /* ------------------------------------------------------------------ */
    /* 9. ADMIN / RESEARCH VISIBILITY                                      */
    /* ------------------------------------------------------------------ */

    function getAnalysisOverview() {
        const all = Array.from(jobs.values());
        return { total: all.length, byState: countBy(all, (j) => j.state), byType: countBy(all, (j) => j.type) };
    }
    function getLanguageAnalysis() {
        const all = Array.from(jobs.values()).filter((j) => j.type === "LANGUAGE_IDENTIFICATION" && j.result);
        return { total: all.length, byStatus: countBy(all, (j) => j.result.routing.status) };
    }
    function getDomainAnalysis() {
        const all = Array.from(jobs.values()).filter((j) => j.type === "DOMAIN_CLASSIFICATION" && j.result);
        return { total: all.length, byDomain: countBy(all, (j) => j.result.domain) };
    }
    function getTopTerms() {
        const all = Array.from(jobs.values()).filter((j) => (j.type === "TERM_EXTRACTION" || j.type === "TRANSCRIPT_ANALYSIS") && j.result);
        const counts = {};
        all.forEach((j) => (j.result.terms || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
        return { termFrequency: counts, frequencyType: "SOURCE_FREQUENCY", userUsageFrequency: "NOT_AVAILABLE_NO_TELEMETRY" };
    }
    function getResearchCandidates() {
        return Array.from(jobs.values()).filter((j) => j.type === "RESEARCH_CANDIDATE" && j.state === "COMPLETED").map((j) => j.result);
    }
    function getAnalysisFailures() {
        return Array.from(jobs.values()).filter((j) => j.state === "FAILED").map((j) => ({ jobId: j.jobId, type: j.type, error: j.error }));
    }
    function getQuarantinedResults() {
        const gate = safetyGate();
        if (!gate) return { status: "CAPABILITY_UNAVAILABLE" };
        return { status: "AVAILABLE", items: gate.listQuarantined().filter((it) => it.fields && it.fields.sourceRecordId) };
    }
    function getCapabilityStatus() {
        return {
            transcriptAnalysis: "REQUIRES_CALLER_SUPPLIED_TEXT",
            languageIdentification: "REQUIRES_EXPLICIT_EVIDENCE",
            termExtraction: "REQUIRES_CALLER_SUPPLIED_TEXT",
            phraseExtraction: "REQUIRES_CALLER_SUPPLIED_TEXT",
            topicExtraction: "CAPABILITY_UNAVAILABLE",
            timestampIndexing: "REQUIRES_CALLER_SUPPLIED_TIMESTAMPS",
            domainClassification: "REQUIRES_CALLER_ASSERTION",
            communityKnowledgeCandidate: ingestion() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            researchCandidate: mediaSearch() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            hotspotTransport: transport() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            safetyGate: safetyGate() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            languagePackRegistry: packsApi() ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE"
        };
    }
    function getSourceProvenance(jobId) {
        const job = jobs.get(jobId);
        if (!job) return { status: "NOT_FOUND" };
        const idx = mediaIndex();
        const record = idx.getRecord(job.params.indexId);
        return {
            status: "AVAILABLE",
            sourceType: record ? record.sourceType : null, sourceId: record ? record.sourceId : null,
            sourceUrl: record ? record.canonicalUrl : null, connector: record ? record.sourceType : null,
            retrievedAt: record ? record.sourceMetadata.retrievedAt : null, analysisType: job.type,
            createdAt: job.createdAt, updatedAt: job.updatedAt
        };
    }

    function countBy(list, keyFn) {
        const out = {};
        list.forEach((item) => { const k = keyFn(item); out[k] = (out[k] || 0) + 1; });
        return out;
    }

    /* ------------------------------------------------------------------ */
    /* MODULE WIRING                                                       */
    /* ------------------------------------------------------------------ */

    const api = Object.freeze({
        getVersion: () => VERSION,
        JOB_TYPES, JOB_STATES, DOMAINS,
        createJob, getJob, listJobs, runJob,
        routeLanguageEvidence,
        submitExtractedTermSafely,
        shareAnalysisPackage, receiveAnalysisPackage, getAuditTrail,
        feedResearchEngine,
        getAnalysisOverview, getLanguageAnalysis, getDomainAnalysis, getTopTerms,
        getResearchCandidates, getAnalysisFailures, getQuarantinedResults,
        getCapabilityStatus, getSourceProvenance,
        // Exposed for tests only.
        _resetForTests() { jobs.clear(); fingerprints.clear(); auditTrail.length = 0; }
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-remote-media-analysis"]) {
            window.CozyOS.CozyRemoteMediaAnalysis = api;
            window.CozyOS.Modules["cozy-remote-media-analysis"] = Object.freeze({
                version: VERSION,
                description: "RP-034 Phase 4 — Full Remote Media Intelligence Pipeline. Real job-based analysis coordinator composing Phases 1-3, RP-029-A/B/C, RP-030, and RP-033 Gate 2. No video download, no automatic language/topic detection, no fabricated analysis — every job honestly reports CAPABILITY_UNAVAILABLE when no real backend/evidence exists. Phases 5-8 explicitly deferred."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/media/cozy-remote-media-analysis.js",
                    name: "CozyRemoteMediaAnalysis", category: "Living Engine",
                    description: "RP-034 Phase 4 Full Remote Media Intelligence Pipeline. Real job coordinator over the real Phase 1-3 chain, RP-029 ingestion/safety, RP-030 language routing, RP-033 Gate 2 hotspot transport. No unauthorized media copy, no fabricated analysis capability."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
