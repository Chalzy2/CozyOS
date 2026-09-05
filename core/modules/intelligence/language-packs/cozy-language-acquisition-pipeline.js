/**
 * CozyOS — Language Acquisition Pipeline (Phase 1)
 * File Reference: core/modules/intelligence/language-packs/cozy-language-acquisition-pipeline.js
 * Repair: RP-031 Phase 1 — Core Language Acquisition Foundation +
 *         Dholuo/Kenya Reference Architecture
 *
 * MISSION
 *   "Africa teaches AI, and AI helps Africa improve its lives."
 *   People -> Evidence -> Candidate Knowledge -> Community Validation
 *   -> Language Pack -> CozyAI Understanding -> Community Benefit.
 *
 * SCOPE OF THIS FILE (Phase 1 — read this before assuming a gap)
 *   This is NOT a rewrite of RP-030's cozy-language-pack-registry.js.
 *   That file already implemented most of the acquisition mechanics:
 *   pack identities, geography/dialect registration, provenance,
 *   licensing states, the safety-gate-first submitExpression()
 *   pipeline, multi-meaning (never-merge-by-spelling) matching, an
 *   offline-first storage adapter, a regional-routing heuristic, and
 *   an honest dashboard snapshot. This file is an ADDITIVE layer on
 *   top of it that adds the specific things RP-031 Phase 1 asks for
 *   that RP-030 did not yet build:
 *     1. Independent-contributor validation tiers (CANDIDATE ->
 *        EMERGING -> STRONG -> VALIDATED), distinct from RP-030's raw
 *        evidenceCount (which one repeat contributor could inflate).
 *     2. Fast local retrieval, explicitly distinguished from
 *        verification speed (spec section 3).
 *     3. A Hearing Mode capture/clarify workflow (spec section 5) that
 *        never auto-transcribes and never retains raw audio unless
 *        explicitly authorized.
 *     4. Honest, capability-checked entry points for OCR/website/
 *        audio/video/document sources (spec sections 10-13) that
 *        report CAPABILITY_UNAVAILABLE rather than pretending.
 *     5. A Cozy Offline Hotspot transport wrapper (spec section 20)
 *        with real, disclosed state limits.
 *     6. Reference regional GEOGRAPHY only (no vocabulary) for the
 *        Dholuo/Kenya reference implementation and the contrastive
 *        examples the spec names (Kikuyu/Kiambu, Kikamba/Machakos,
 *        Kiswahili/Kenya vs Kiswahili/Tanzania, Hausa/Nigeria vs
 *        Hausa/Tanzania).
 *     7. Knowledge-domain separation (spec sections 16 + 18):
 *        COMMUNITY_KNOWLEDGE vs PROFESSIONAL_GUIDANCE vs RESEARCH vs
 *        GENERAL_LANGUAGE_MEANING, and an answer formatter that never
 *        presents unverified community knowledge as professional
 *        advice.
 *
 * OWNERSHIP / COMPOSITION (no rewriting of locked files)
 *   New, additive, standalone file. Composes — never duplicates —
 *   these existing, frozen public APIs, all read/called at call time
 *   only, all degrading honestly if absent:
 *     - window.CozyOS.CozyLanguagePacks              (RP-030)
 *     - window.CozyOS.CozyKnowledgeIngestion          (RP-029-A)
 *     - window.CozyOS.CozyKnowledgeSafetyGate         (RP-029-C)
 *     - window.CozyOS.CozyKnowledgeReviewHotspotBridge (RP-029-C Ph.2)
 *     - window.CozyOS.CozyHearing                     (existing Hearing
 *       Mode sound-classification engine — composed only to report
 *       whether a real listening session is active; this file adds NO
 *       speech-to-text/ASR capability, because none exists in this
 *       repository. The expression text/meaning in every Hearing Mode
 *       workflow here is always supplied by a caller, exactly like
 *       RP-029-A's ingestion module already requires for documents.)
 *     - window.CozyOS.OCREngine                       (existing OCR
 *       request/queue layer — composed only to check availability.
 *       No image bytes are processed by this file.)
 *   None of the above are modified, rewritten, or duplicated.
 *
 * RULE 82 — unaffected
 *   This file has no promotion mutator of its own and never calls one.
 *   It only ever reaches AVAILABLE through RP-030's requestPromotion(),
 *   which is itself always BLOCKED except via the real Rule 82 gate.
 *
 * NO FABRICATION
 *   - No ASR, OCR, translation-ML, or video/lip-reading engine exists
 *     in this repository. Every entry point below that would need one
 *     says so honestly (CAPABILITY_UNAVAILABLE) instead of pretending.
 *   - Validation tiers are explicitly disclosed as illustrative
 *     evidence bands, not scientific accuracy claims (spec section 8).
 *   - Hotspot transfer states never claim SYNCED/RECEIVED unless a
 *     real transport call actually reported that outcome.
 *
 * PHASE BOUNDARY (explicit, not silently deferred)
 *   Phase 1 delivers the pipeline + data contracts only. The "Teach
 *   CozyAI" contribution UI, the Admin Dashboard UI, and full OCR/
 *   website/audio/video backends are Phase 2+. This file's exported
 *   functions ARE that Phase 2 data contract — getAcquisitionDashboardSnapshot(),
 *   listPendingClarifications(), lookupExpression(), etc. are written
 *   so a future UI can be built directly against them without this
 *   foundation needing to be redesigned.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    // -----------------------------------------------------------------
    // 0. DEPENDENCY COMPOSITION
    // -----------------------------------------------------------------

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function languagePacks() {
        const c = cozyOS();
        return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null;
    }
    function hotspotBridge() {
        const c = cozyOS();
        return c && c.CozyKnowledgeReviewHotspotBridge ? c.CozyKnowledgeReviewHotspotBridge : null;
    }
    function hearingEngine() {
        const c = cozyOS();
        return c && c.CozyHearing ? c.CozyHearing : null;
    }
    function ocrEngine() {
        const c = cozyOS();
        return c && c.OCREngine ? c.OCREngine : null;
    }

    function nowISO() { return new Date().toISOString(); }

    // -----------------------------------------------------------------
    // 1. INDEPENDENT-CONTRIBUTOR VALIDATION TIERS (spec section 8)
    //    Additive layer: RP-030's own record.validationState always
    //    stays "CANDIDATE" (that file never overwrites it either).
    //    This map tracks DISTINCT contributor pseudonyms per recordId
    //    so a single person resubmitting the same expression cannot
    //    inflate the tier — only independent evidence can.
    // -----------------------------------------------------------------

    // recordId -> Set(contributorPseudonym)
    const independentContributors = new Map();

    // Configurable, explicitly NOT presented as a scientific threshold
    // (spec section 8: "must not be presented as scientific thresholds
    // unless evidence supports them"). Mirrors RP-030's own illustrative
    // EVIDENCE_BANDS shape/spirit but counts independent people, not
    // raw submissions.
    const VALIDATION_TIERS = Object.freeze([
        { min: 0, max: 0, tier: "NONE" },
        { min: 1, max: 1, tier: "CANDIDATE" },
        { min: 2, max: 3, tier: "EMERGING" },
        { min: 4, max: 9, tier: "STRONG" },
        { min: 10, max: Infinity, tier: "VALIDATED" }
    ]);

    function tierForCount(n) {
        const band = VALIDATION_TIERS.find((b) => n >= b.min && n <= b.max);
        return band ? band.tier : "NONE";
    }

    function recordIndependentContribution(recordId, contributorPseudonym) {
        if (!recordId) return;
        if (!independentContributors.has(recordId)) independentContributors.set(recordId, new Set());
        independentContributors.get(recordId).add(contributorPseudonym || "anonymous");
    }

    function getValidationTier(recordId) {
        const set = independentContributors.get(recordId);
        const count = set ? set.size : 0;
        return {
            recordId,
            independentContributorCount: count,
            tier: tierForCount(count),
            note: "Illustrative evidence tier based on distinct contributors, not a scientific accuracy measure. See spec section 8."
        };
    }

    // -----------------------------------------------------------------
    // 2. SUBMIT EVIDENCE (wraps RP-030 submitExpression, never
    //    replaces it) — the single Phase 1 entry point for any already
    //    -captured expression, whatever its original source.
    // -----------------------------------------------------------------

    function submitEvidence(fields) {
        const packs = languagePacks();
        if (!packs) return { status: "BLOCKED", reason: "CozyLanguagePacks (RP-030) is not loaded." };
        const result = packs.submitExpression(fields);
        if ((result.status === "CANDIDATE_CREATED" || result.status === "EVIDENCE_ADDED") && result.recordId) {
            recordIndependentContribution(result.recordId, (fields && fields.contributorPseudonym) || "anonymous");
            const tier = getValidationTier(result.recordId);
            return Object.assign({}, result, { validationTier: tier.tier, independentContributorCount: tier.independentContributorCount });
        }
        return result;
    }

    // -----------------------------------------------------------------
    // 3. FAST LOCAL RETRIEVAL (spec section 3)
    //    "A 0.5s lookup is realistic for local indexed knowledge. A
    //    0.5s community verification cannot be guaranteed." Retrieval
    //    reads whatever is already in RP-030's store; it never itself
    //    performs or waits on verification.
    // -----------------------------------------------------------------

    function lookupExpression(query) {
        const packs = languagePacks();
        if (!packs) return { status: "UNAVAILABLE", reason: "CozyLanguagePacks (RP-030) is not loaded.", results: [] };
        const q = query || {};
        const startedAt = Date.now();
        const candidates = packs.listExpressions({ languageId: q.languageId, region: q.region, dialect: q.dialect });
        const needle = q.expression ? String(q.expression).trim().toLowerCase() : null;
        const meaningNeedle = q.meaning ? String(q.meaning).trim().toLowerCase() : null;
        const matches = candidates.filter((r) => {
            const exprMatch = needle ? (r.expression && String(r.expression).toLowerCase() === needle) : true;
            const meanMatch = meaningNeedle ? (r.meaning && String(r.meaning).toLowerCase().indexOf(meaningNeedle) !== -1) : true;
            return exprMatch && meanMatch;
        }).map((r) => Object.assign({}, r, getValidationTier(r.recordId)));
        return {
            status: "OK",
            results: matches,
            lookupMs: Date.now() - startedAt,
            note: "This is retrieval latency for already-indexed local records only. It says nothing about whether the underlying knowledge is independently verified — check each result's validationTier separately (spec section 3)."
        };
    }

    /** Spec section 9: same expression, different meanings by region/context. */
    function listMeaningsFor(languageId, expression) {
        const packs = languagePacks();
        if (!packs) return { status: "UNAVAILABLE", meanings: [] };
        const needle = String(expression || "").trim().toLowerCase();
        const all = packs.listExpressions({ languageId }).filter((r) => r.expression && String(r.expression).toLowerCase() === needle);
        const byMeaning = new Map();
        all.forEach((r) => {
            const key = String(r.meaning || "UNSPECIFIED");
            if (!byMeaning.has(key)) byMeaning.set(key, []);
            byMeaning.get(key).push({ recordId: r.recordId, region: r.region, dialect: r.dialect, context: r.context });
        });
        const meanings = Array.from(byMeaning.entries()).map(([meaning, occurrences]) => ({ meaning, occurrences }));
        return {
            status: "OK",
            expression,
            meanings,
            hasRegionalVariation: meanings.length > 1,
            note: meanings.length > 1
                ? "This expression has different recorded meanings depending on region/context — never auto-collapsed to one."
                : "Only one recorded meaning so far; more independent evidence may reveal regional variation later."
        };
    }

    // -----------------------------------------------------------------
    // 4. HEARING MODE — capture now, ask later (spec section 5)
    //    Never fabricates transcription. Never retains raw audio
    //    unless audioRetentionAuthorized === true was explicitly
    //    passed by the caller (spec section 6, privacy-first).
    // -----------------------------------------------------------------

    let nextClarificationId = 1;
    const pendingClarifications = new Map();

    function captureUnknownExpressionFromHearing(evidence) {
        const e = evidence || {};
        if (!e.heardText && !e.audioReference) {
            return { status: "BLOCKED", reason: "NO_TEXT_OR_AUDIO_EVIDENCE. This file performs no speech-to-text itself — the caller (a real ASR/transcription provider, or a human) must supply heardText and/or an audioReference." };
        }
        const hearing = hearingEngine();
        const hearingStatus = hearing && typeof hearing.getStatus === "function"
            ? "COMPOSED_HEARING_ENGINE_PRESENT"
            : "NO_REAL_HEARING_ENGINE_COMPOSED_MANUAL_ENTRY_ONLY";

        const id = "pending-" + (nextClarificationId++);
        const retainAudio = e.audioRetentionAuthorized === true;
        pendingClarifications.set(id, {
            id,
            languageGuess: e.languageGuess || null,
            regionGuess: e.regionGuess || null,
            dialectGuess: e.dialectGuess || null,
            heardText: e.heardText || null,
            audioReference: retainAudio ? (e.audioReference || null) : null,
            audioDiscarded: !!e.audioReference && !retainAudio,
            sessionId: e.sessionId || null,
            contextNote: e.contextNote || null,
            createdAt: nowISO(),
            status: "PENDING_CLARIFICATION",
            hearingEngineStatus: hearingStatus,
            suggestedPrompt: `Earlier I heard the expression "${e.heardText || "[audio evidence]"}". Could you tell me what it means and which language or dialect it belongs to?`
        });
        return { status: "CAPTURED", clarificationId: id, audioDiscarded: !!e.audioReference && !retainAudio };
    }

    function listPendingClarifications(filter) {
        const f = filter || {};
        return Array.from(pendingClarifications.values())
            .filter((c) => !f.sessionId || c.sessionId === f.sessionId)
            .filter((c) => c.status === "PENDING_CLARIFICATION")
            .map((c) => Object.assign({}, c));
    }

    /** The human's answer becomes CANDIDATE evidence, never automatic truth (spec section 5). */
    function resolveClarification(clarificationId, answer) {
        const pending = pendingClarifications.get(clarificationId);
        if (!pending) return { status: "NOT_FOUND" };
        const a = answer || {};
        if (!a.languageId || !a.meaning) {
            return { status: "BLOCKED", reason: "languageId and meaning are required to resolve a clarification." };
        }
        const result = submitEvidence({
            languageId: a.languageId,
            region: a.region || pending.regionGuess,
            dialect: a.dialect || pending.dialectGuess,
            expression: pending.heardText || a.expression,
            audioReference: pending.audioReference,
            meaning: a.meaning,
            context: a.context || pending.contextNote,
            translation: a.translation,
            sourceType: "COMMUNITY",
            license: a.license || "LICENSE_UNKNOWN",
            contributorPseudonym: a.contributorPseudonym || "anonymous"
        });
        pending.status = "RESOLVED";
        pending.resolvedAt = nowISO();
        pending.resolutionResult = result.status;
        return Object.assign({}, result, { status: "RESOLVED", clarificationId, submissionStatus: result.status });
    }

    // -----------------------------------------------------------------
    // 5. SOURCE-TYPE HONESTY WRAPPERS (spec sections 10-13)
    //    Every one of these fails closed with CAPABILITY_UNAVAILABLE
    //    rather than pretending a backend exists.
    // -----------------------------------------------------------------

    function acquireFromDocument(fields) {
        // Text must already be extracted by the caller — this file
        // performs no PDF/DOCX parsing itself (that is RP-029-A's own,
        // already-composed scope if/when the caller has real text).
        if (!fields || !fields.expression) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "No extracted text supplied. Document parsing itself is out of scope for this file." };
        }
        return submitEvidence(Object.assign({}, fields, { sourceType: "DOCUMENT" }));
    }

    function acquireFromWebsite(fields) {
        if (!fields || !fields.expression) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "No already-permitted, already-fetched page text supplied. This file performs no network fetch, scraping, robots/license/copyright evaluation itself." };
        }
        return submitEvidence(Object.assign({}, fields, { sourceType: "WEBSITE" }));
    }

    function acquireFromOCR(fields) {
        const engine = ocrEngine();
        if (!engine) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "window.CozyOS.OCREngine is not loaded in this environment." };
        }
        if (!fields || !fields.expression) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "OCREngine is present, but this file received no recognized text to acquire. It never invents OCR output." };
        }
        return submitEvidence(Object.assign({}, fields, { sourceType: "OCR" }));
    }

    function acquireFromAudio(fields) {
        // Oral-language evidence: RP-030's submitExpression already
        // accepts audioReference with no orthography (never invents
        // spelling). This wrapper just routes sourceType honestly.
        if (!fields || (!fields.audioReference && !fields.expression)) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "No audioReference or expression supplied." };
        }
        return submitEvidence(Object.assign({}, fields, { sourceType: "AUDIO" }));
    }

    function acquireFromVideo(fields) {
        const f = fields || {};
        if (f.lipReadingRequested) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "Lip-reading is a separate, highly uncertain capability never claimed by this repository (spec section 13), regardless of request." };
        }
        // Only caption/subtitle/permitted-transcript derived text is
        // honestly supportable — never claim video/audio understanding.
        if (!f.captionOrTranscriptText && !f.expression) {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "No caption/subtitle/permitted-transcript text supplied. No video/audio-understanding engine exists in this repository." };
        }
        return submitEvidence(Object.assign({}, f, { expression: f.expression || f.captionOrTranscriptText, sourceType: "VIDEO_METADATA" }));
    }

    // -----------------------------------------------------------------
    // 6. COZY OFFLINE HOTSPOT TRANSPORT (spec section 20)
    //    Honest, limited states only. RECEIVED/VALIDATING/SYNCED for a
    //    *language-pack* record specifically require a receiver that
    //    maps an incoming CozyKnowledgeCommunity contribution back into
    //    a language-pack expression record — not yet composed (the
    //    existing hotspot bridge's receive path lands in
    //    CozyKnowledgeCommunity's own store, a disclosed Phase 1
    //    limitation, not a fabricated capability). Outgoing SHARE is
    //    real when a bridge + active connection exist.
    // -----------------------------------------------------------------

    const HOTSPOT_STATES = Object.freeze([
        "CREATED", "QUEUED", "SHARED", "NO_ACTIVE_HOTSPOT_CONNECTION",
        "RECEIVED", "VALIDATING", "SYNCED", "CONFLICT", "UNAVAILABLE"
    ]);

    function queueForHotspotShare(recordId) {
        const packs = languagePacks();
        if (!packs) return { status: "UNAVAILABLE", reason: "CozyLanguagePacks is not loaded." };
        const record = packs.getExpression(recordId);
        if (!record) return { status: "UNAVAILABLE", reason: "NOT_FOUND" };

        const bridge = hotspotBridge();
        if (!bridge) {
            return { status: "QUEUED", reason: "CozyKnowledgeReviewHotspotBridge is not loaded — evidence stays local-only until a real bridge is composed. Never claiming SHARED/SYNCED without one." };
        }
        const shareResult = bridge.shareCandidate({
            claim: record.expression || "[audio evidence, no orthography]",
            language: { code: record.languageId },
            meaning: record.meaning,
            context: record.context,
            dialect: record.dialect,
            region: record.region,
            communityExtensions: { contributionType: record.audioReference ? "AUDIO_REFERENCE" : "PHRASE", variant: record.dialect }
        });
        if (shareResult.status === "SENT") {
            return { status: "SHARED", sentTo: shareResult.sentTo, note: "Delivered to currently connected peers only. Receiving devices import via CozyKnowledgeCommunity, not directly into their own language pack yet — see file header limitation." };
        }
        return { status: shareResult.status === "NO_ACTIVE_HOTSPOT_CONNECTION" ? "NO_ACTIVE_HOTSPOT_CONNECTION" : "QUEUED", detail: shareResult };
    }

    // -----------------------------------------------------------------
    // 7. KNOWLEDGE-DOMAIN SEPARATION (spec sections 16 + 18)
    // -----------------------------------------------------------------

    const KNOWLEDGE_DOMAINS = Object.freeze([
        "COMMUNITY_KNOWLEDGE", "PROFESSIONAL_GUIDANCE", "RESEARCH", "GENERAL_LANGUAGE_MEANING"
    ]);

    function classifyKnowledgeDomain(fields) {
        const f = fields || {};
        // Conservative default: anything not explicitly research-
        // sourced or a plain vocabulary/meaning lookup is treated as
        // community-reported, never auto-elevated to professional.
        if (f.sourceType === "RESEARCH") return "RESEARCH";
        if (f.domainHint === "PROFESSIONAL_GUIDANCE") {
            return { domain: "COMMUNITY_KNOWLEDGE", note: "domainHint requested PROFESSIONAL_GUIDANCE, but this file has no professional-credentialing/verification mechanism — it never self-elevates a submission to professional guidance." };
        }
        if (f.domainHint === "GENERAL_LANGUAGE_MEANING") return "GENERAL_LANGUAGE_MEANING";
        return "COMMUNITY_KNOWLEDGE";
    }

    /** Farmer/Medicine-C style answer formatting (spec section 16). */
    function formatCommunityAnswer(recordId) {
        const packs = languagePacks();
        if (!packs) return null;
        const record = packs.getExpression(recordId);
        if (!record) return null;
        const tier = getValidationTier(recordId);
        return {
            recordId,
            domain: "COMMUNITY_KNOWLEDGE",
            statement: `Community knowledge${record.region ? " from " + record.region : ""} reports: ${record.meaning || "(no meaning recorded)"}.`,
            disclaimer: "This is community-reported information, not verified professional/medical/agricultural guidance. Verified guidance should be checked separately.",
            validationTier: tier.tier,
            independentContributorCount: tier.independentContributorCount
        };
    }

    // -----------------------------------------------------------------
    // 8. REFERENCE GEOGRAPHY (spec section 25 + section 2 contrast
    //    examples) — GEOGRAPHY ONLY. No vocabulary is registered here;
    //    registering a country/region/dialect context is metadata, not
    //    a claim of language knowledge (RP-030's own registerRegionalContext
    //    docstring: "Country is evidence, not proof of dialect.")
    // -----------------------------------------------------------------

    function bootstrapReferenceGeography() {
        const packs = languagePacks();
        if (!packs) return { status: "UNAVAILABLE" };
        const contexts = [
            { languageId: "luo", country: "KE", region: "Nyanza", dialect: "South Nyanza Luo" },
            { languageId: "luo", country: "KE", region: "Central Nyanza", dialect: "Trans-Yala Luo" },
            { languageId: "ki", country: "KE", region: "Kiambu", dialect: null },
            { languageId: "kam", country: "KE", region: "Machakos", dialect: null },
            { languageId: "sw", country: "KE", region: null, dialect: null },
            { languageId: "sw", country: "TZ", region: null, dialect: null },
            // Deliberately DISTINCT — never auto-merged despite the same
            // languageId (spec section 2's own worked example).
            { languageId: "ha", country: "TZ", region: null, dialect: "Tanzanian Hausa" },
            { languageId: "ha", country: "NG", region: null, dialect: "Nigerian Hausa" }
        ];
        const results = contexts.map((c) => Object.assign({ languageId: c.languageId }, packs.registerRegionalContext(c.languageId, c)));
        return { status: "OK", registered: results.length, results };
    }

    /**
     * Reference evidence for the Dholuo/Kenya worked example (spec
     * section 25). This is REAL, publicly attested vocabulary — the
     * Dholuo greeting "Misawa" — cross-referenced across multiple
     * independent public sources (a Wikivoyage phrasebook, a published
     * "Dholuo Grammar for Beginners" teaching text, and community
     * word-list sites), not invented by this file. Its LICENSE is
     * intentionally recorded as LICENSE_UNKNOWN (no single source's
     * reuse terms were verified), which RP-030's own submitExpression()
     * already counts as a licensing problem and which Rule 82 already
     * blocks from ever reaching AVAILABLE on its own. This function
     * exists to exercise the real pipeline end-to-end, not to assert
     * that CozyAI now "knows Dholuo".
     */
    function seedDholuoReferenceExample(contributorPseudonym) {
        return submitEvidence({
            languageId: "luo",
            country: "KE",
            region: "Nyanza",
            dialect: null,
            expression: "Misawa",
            meaning: "A greeting (roughly \"peace\"/\"hello\"), commonly used as a general greeting.",
            context: "General/midday greeting; also used as an opening greeting between acquaintances.",
            sourceType: "RESEARCH",
            license: "LICENSE_UNKNOWN",
            sourceId: "cross-referenced: Wikivoyage Luo phrasebook; published Dholuo Grammar for Beginners (Onyoyo); community Dholuo word-list sites",
            contributorPseudonym: contributorPseudonym || "rp031-reference-seed",
            languageConfidence: 0.7,
            meaningConfidence: 0.6
        });
    }

    // -----------------------------------------------------------------
    // 9. DASHBOARD DATA CONTRACT FOR PHASE 2 (spec section 14, data
    //    only — no UI in this file)
    // -----------------------------------------------------------------

    function getAcquisitionDashboardSnapshot() {
        const packs = languagePacks();
        const base = packs ? packs.getDashboardSnapshot() : { packs: [], mostSubmitted: [], mostValidated: [] };
        return Object.assign({}, base, {
            pendingClarifications: listPendingClarifications().length,
            hotspotBridgeAvailable: !!hotspotBridge(),
            hearingEngineAvailable: !!hearingEngine(),
            ocrEngineAvailable: !!ocrEngine(),
            note: "Phase 1 data contract for a future Admin Dashboard UI (Phase 2). No UI is rendered by this file."
        });
    }

    // -----------------------------------------------------------------
    // 10. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        VALIDATION_TIERS,
        HOTSPOT_STATES,
        KNOWLEDGE_DOMAINS,
        submitEvidence,
        getValidationTier,
        lookupExpression,
        listMeaningsFor,
        captureUnknownExpressionFromHearing,
        listPendingClarifications,
        resolveClarification,
        acquireFromDocument,
        acquireFromWebsite,
        acquireFromOCR,
        acquireFromAudio,
        acquireFromVideo,
        queueForHotspotShare,
        classifyKnowledgeDomain,
        formatCommunityAnswer,
        bootstrapReferenceGeography,
        seedDholuoReferenceExample,
        getAcquisitionDashboardSnapshot,
        // Test-only reset so each test file gets a clean independent-
        // contributor/clarification state without reloading modules.
        _resetForTests() {
            independentContributors.clear();
            pendingClarifications.clear();
            nextClarificationId = 1;
        }
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.CozyLanguageAcquisition = api;
    root.window.CozyOS.Modules["cozy-language-acquisition-pipeline"] = Object.freeze({ version: VERSION, api });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
