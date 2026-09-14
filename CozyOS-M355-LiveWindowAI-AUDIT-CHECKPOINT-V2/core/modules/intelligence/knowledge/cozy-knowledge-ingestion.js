/**
 * CozyOS — Community/Document Knowledge Ingestion Pipeline
 * File Reference: core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js
 * Repair: RP-029-A — Document & Website Knowledge Learning Pipeline
 *         (Phase 1 of the Community Language & Living Knowledge Engine.
 *         Text/document ingestion ONLY — see "OUT OF SCOPE" below.)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Repository-wide search before writing
 *   this file ("ingestion", "DocumentLearning", "WebsiteLearning") found
 *   no prior owner for a source -> knowledge-candidate pipeline — this is
 *   a real new capability, not a duplicate of cozy-knowledge-registry.js
 *   (RP-027's CozyKnowledge, which answers questions ABOUT CozyOS itself
 *   from live module state) or core/modules/research/cozy-research-engine.js
 *   (which tags engineering-principle keywords in code/text for the
 *   Builder tooling, a different domain entirely). Modifies no other file.
 *   Reads window.CozyOS.CozyLanguageRegistry when present, at call time
 *   only, and degrades honestly (LANGUAGE_UNCERTAIN) if absent.
 *
 * WHAT THIS FILE ACTUALLY DOES
 *   Turns a piece of source content (plain text, HTML, already-OCR'd text,
 *   or a community-submitted statement) into a provenance-tagged
 *   "knowledge candidate" — never directly into "verified truth". The
 *   pipeline is: SOURCE -> EXTRACTION -> NORMALIZATION -> LANGUAGE
 *   IDENTIFICATION -> SEGMENTATION -> PROVENANCE -> CANDIDATE -> (later,
 *   separately governed) VALIDATION -> LOCAL KNOWLEDGE MEMORY.
 *
 * OUT OF SCOPE (do not claim any of this is implemented here)
 *   Real speech recognition, lip reading, audio/video understanding,
 *   speaker identification, live meeting understanding, automatic
 *   scripture/sermon interpretation, or unrestricted internet crawling.
 *   Those are RP-029-B/C/D/E's own scope, not this file's.
 *
 * NETWORK / CRAWLING
 *   This module never performs a network fetch itself. ingestWebsite()
 *   requires the caller (the application layer, which owns permission/
 *   robots/auth/copyright decisions) to already have retrieved the HTML
 *   and pass it in. If no content is supplied, the result is honestly
 *   SOURCE_UNAVAILABLE — never fabricated.
 *
 * HASHING
 *   contentHash below is a fast, deterministic, NON-cryptographic
 *   checksum (djb2 variant) used only for change-detection/dedup within
 *   local knowledge memory. It is explicitly not offered as a security
 *   primitive.
 *
 * PRIVACY
 *   Every candidate is created with visibility "PRIVATE" by default.
 *   Only contributeToCommunity()/contributeToPublic() (explicit, caller-
 *   invoked) can raise that. Nothing in this file auto-promotes a
 *   candidate's visibility or verificationState.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-knowledge-ingestion"]) return;

    const VERSION = "1.0.0";

    const SOURCE_TYPES = Object.freeze([
        "TEXT", "PDF", "HTML", "DOCUMENT", "OCR_TEXT", "USER_PROVIDED_CONTENT",
        "PUBLIC_WEBSITE", "COMMUNITY_SUBMISSION", "EDUCATIONAL_MATERIAL",
        "CHURCH_MATERIAL", "BIBLE_OR_SCRIPTURAL_MATERIAL"
    ]);

    const VISIBILITY_STATES = Object.freeze(["PRIVATE", "COMMUNITY", "PUBLIC", "SYSTEM"]);
    const VERIFICATION_STATES = Object.freeze([
        "CANDIDATE", "PARTIALLY_VERIFIED", "VERIFIED", "DISPUTED", "REJECTED", "NOT_FOUND"
    ]);

    // In-memory local knowledge store (Local Knowledge Memory). A future,
    // separately governed repair may back this with real persistence /
    // sync — this pass is honestly memory-only, cleared on reload.
    let store = [];
    let nextId = 1;

    function resetStore() {
        store = [];
        nextId = 1;
    }

    /** djb2 — fast, deterministic, NON-cryptographic. See file header. */
    function contentHash(text) {
        const str = String(text == null ? "" : text);
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
        }
        return "djb2:" + hash.toString(16);
    }

    function nowISO() {
        return new Date().toISOString();
    }

    // -----------------------------------------------------------------
    // 1. EXTRACTION
    // -----------------------------------------------------------------

    /** Strip tags/scripts/styles from HTML down to plain text. Deliberately
     *  simple/regex-based — not a full DOM parser — so behavior is the
     *  same in Node (tests) and browser without adding a dependency. */
    function extractFromHtml(html) {
        if (typeof html !== "string" || html.length === 0) return null;
        const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                               .replace(/<style[\s\S]*?<\/style>/gi, " ");
        const text = noScripts.replace(/<[^>]+>/g, " ")
                               .replace(/&nbsp;/gi, " ")
                               .replace(/&amp;/gi, "&")
                               .replace(/&lt;/gi, "<")
                               .replace(/&gt;/gi, ">")
                               .replace(/&quot;/gi, '"')
                               .replace(/&#39;/gi, "'")
                               .replace(/\s+/g, " ")
                               .trim();
        return text.length > 0 ? text : null;
    }

    /** Delegates PDF text extraction to a real, already-registered PDF
     *  reader if one exists on window.CozyOS (e.g. an OCR/PDF module from
     *  the ocrstudio/ocr subsystem). Never implements its own PDF parser.
     *  Honestly returns null (-> SOURCE_UNAVAILABLE) when none is wired. */
    function extractFromPdf(content) {
        const reader =
            window.CozyOS && window.CozyOS.CozyOCR &&
            typeof window.CozyOS.CozyOCR.extractPdfText === "function" &&
            window.CozyOS.CozyOCR.extractPdfText;
        if (!reader) return null;
        try {
            const result = reader(content);
            return typeof result === "string" && result.length > 0 ? result : null;
        } catch (_err) {
            return null;
        }
    }

    function extractContent(sourceType, content) {
        switch (sourceType) {
            case "TEXT":
            case "OCR_TEXT":
            case "USER_PROVIDED_CONTENT":
            case "COMMUNITY_SUBMISSION":
            case "EDUCATIONAL_MATERIAL":
            case "CHURCH_MATERIAL":
            case "BIBLE_OR_SCRIPTURAL_MATERIAL":
            case "DOCUMENT":
                return (typeof content === "string" && content.trim().length > 0) ? content.trim() : null;
            case "HTML":
            case "PUBLIC_WEBSITE":
                return extractFromHtml(content);
            case "PDF":
                return extractFromPdf(content);
            default:
                return null;
        }
    }

    // -----------------------------------------------------------------
    // 2. LANGUAGE IDENTIFICATION
    // -----------------------------------------------------------------

    // Small, disclosed, honest heuristic: a handful of very common,
    // distinctive stopwords/markers per language. This is NOT statistical
    // language detection — it is a coarse, best-effort signal that must
    // degrade to LANGUAGE_UNCERTAIN rather than guess when it doesn't
    // clear a minimum-match bar. Real language ID belongs to a later,
    // separately verified repair (Rule 82 governs promotion, not this
    // file).
    const LANGUAGE_MARKERS = Object.freeze({
        sw: ["na", "ya", "wa", "kwa", "hii", "hiyo", "habari", "asante", "karibu"],
        fr: ["le", "la", "les", "des", "est", "une", "et", "bonjour", "merci"],
        ar: ["\u0627\u0644", "\u0641\u064a", "\u0645\u0646", "\u0647\u0630\u0627", "\u0648"],
        so: ["waa", "iyo", "ee", "ku", "mahadsanid", "salaan"],
        en: ["the", "and", "is", "are", "of", "to", "hello", "thank"]
    });

    function detectLanguage(text) {
        if (!text || typeof text !== "string") {
            return { code: null, confidence: 0, state: "LANGUAGE_UNCERTAIN" };
        }
        const lower = text.toLowerCase();
        const scores = {};
        for (const code of Object.keys(LANGUAGE_MARKERS)) {
            let hits = 0;
            for (const marker of LANGUAGE_MARKERS[code]) {
                if (lower.includes(marker)) hits++;
            }
            scores[code] = hits;
        }
        let best = null;
        let bestScore = 0;
        for (const code of Object.keys(scores)) {
            if (scores[code] > bestScore) {
                best = code;
                bestScore = scores[code];
            }
        }
        // Require at least 2 distinct marker hits before claiming any
        // signal at all — one incidental word match is not evidence.
        if (!best || bestScore < 2) {
            return { code: null, confidence: 0, state: "LANGUAGE_UNCERTAIN" };
        }
        const confidence = Math.min(1, bestScore / LANGUAGE_MARKERS[best].length);
        return { code: best, confidence, state: "DETECTED" };
    }

    /** Cross-checks a detected/declared language code against the real
     *  CozyLanguageRegistry (RP-027) when it is present. Never promotes
     *  a NOT_READY language to usable — surfaces its real state instead. */
    function checkLanguageRegistry(code) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        if (!registry || typeof registry.getLanguage !== "function") {
            return { registryChecked: false, registryState: null };
        }
        const lang = registry.getLanguage(code);
        return { registryChecked: true, registryState: lang ? lang.state : "UNREGISTERED" };
    }

    // -----------------------------------------------------------------
    // 3. SEGMENTATION (simple, honest — sentence/paragraph split only)
    // -----------------------------------------------------------------

    function segmentContent(text) {
        if (!text) return [];
        return text
            .split(/(?<=[.!?\u061F\u3002])\s+|\n{2,}/u)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }

    // -----------------------------------------------------------------
    // 4. PIPELINE ENTRY POINTS
    // -----------------------------------------------------------------

    function validateSourceType(sourceType) {
        return SOURCE_TYPES.indexOf(sourceType) !== -1;
    }

    /**
     * ingestSource({sourceType, content, meta})
     *   Runs the full SOURCE -> ... -> KNOWLEDGE CANDIDATE pipeline for a
     *   single piece of content already in hand (text/HTML/OCR output/
     *   community submission). Returns a structured result; never throws
     *   for a bad/missing source — always reports an honest status.
     */
    function ingestSource(input) {
        const opts = input || {};
        const sourceType = opts.sourceType;
        const meta = opts.meta || {};

        if (!validateSourceType(sourceType)) {
            return { status: "REJECTED", reason: `Unknown sourceType: ${String(sourceType)}`, candidate: null };
        }

        const extracted = extractContent(sourceType, opts.content);
        if (extracted === null) {
            return { status: "SOURCE_UNAVAILABLE", reason: "No content could be extracted from the supplied source.", candidate: null };
        }

        const declaredLanguage = meta.language ? String(meta.language).trim().toLowerCase() : null;
        const detection = detectLanguage(extracted);
        const languageCode = declaredLanguage || detection.code;
        const registryCheck = languageCode ? checkLanguageRegistry(languageCode) : { registryChecked: false, registryState: null };

        const languageState = declaredLanguage
            ? "DECLARED"
            : detection.state;

        const segments = segmentContent(extracted);
        const hash = contentHash(extracted);

        // Dedup within local knowledge memory by contentHash + sourceType.
        const existing = store.find((c) => c.provenance.contentHash === hash && c.provenance.sourceType === sourceType);
        if (existing) {
            return { status: "DUPLICATE", reason: "Identical content already present in local knowledge memory.", candidate: existing };
        }

        const candidate = {
            id: "kc_" + (nextId++),
            subject: meta.subject || null,
            claim: extracted.length > 500 ? extracted.slice(0, 500) + "\u2026" : extracted,
            meaning: meta.meaning || null,
            context: meta.context || null,
            segments,
            language: {
                code: languageCode,
                state: languageState,
                detectionConfidence: declaredLanguage ? null : detection.confidence,
                registryChecked: registryCheck.registryChecked,
                registryState: registryCheck.registryState
            },
            provenance: {
                sourceType,
                sourceId: meta.sourceId || null,
                origin: meta.origin || null,
                title: meta.title || null,
                capturedAt: nowISO(),
                contentHash: hash,
                trustState: "UNVERIFIED"
            },
            confidence: {
                meaningConfidence: 0,
                translationConfidence: 0,
                dialectConfidence: 0,
                sourceConfidence: declaredLanguage ? 0.5 : (detection.confidence || 0),
                communityConfidence: 0
            },
            region: meta.region || null,
            community: meta.community || null,
            dialect: meta.dialect || null,
            relatedKnowledge: [],
            visibility: "PRIVATE",
            verificationState: "CANDIDATE",
            independentConfirmations: 0,
            createdAt: nowISO(),
            updatedAt: nowISO()
        };

        store.push(candidate);
        return { status: "CANDIDATE_CREATED", reason: null, candidate };
    }

    /**
     * ingestWebsite({url, htmlContent, meta})
     *   See file header: this module never fetches the network itself.
     *   The caller must already have retrieved htmlContent under its own
     *   permission/robots/copyright decision. No content -> SOURCE_UNAVAILABLE.
     */
    function ingestWebsite(input) {
        const opts = input || {};
        if (!opts.url) {
            return { status: "REJECTED", reason: "A url is required.", candidate: null };
        }
        if (!opts.htmlContent) {
            return { status: "SOURCE_UNAVAILABLE", reason: "No htmlContent supplied for this URL.", candidate: null };
        }
        const meta = Object.assign({}, opts.meta, { origin: opts.url, sourceId: opts.url });
        return ingestSource({ sourceType: "PUBLIC_WEBSITE", content: opts.htmlContent, meta });
    }

    /**
     * ingestCommunitySubmission({statement, contributorId, meta})
     *   For "This is how we say X in my community" style input. Always
     *   lands as CANDIDATE with independentConfirmations = 0 — never
     *   pre-validated. confirmCandidate() below is the only way that
     *   count moves, and only from a DIFFERENT contributorId than any
     *   already recorded (never counts a repeated copy of the same
     *   source as independent confirmation, per the governing spec).
     */
    function ingestCommunitySubmission(input) {
        const opts = input || {};
        if (!opts.statement || typeof opts.statement !== "string") {
            return { status: "REJECTED", reason: "A statement is required.", candidate: null };
        }
        const meta = Object.assign({}, opts.meta, { sourceId: opts.contributorId || null });
        const result = ingestSource({ sourceType: "COMMUNITY_SUBMISSION", content: opts.statement, meta });
        if (result.status === "CANDIDATE_CREATED" && result.candidate) {
            result.candidate._contributors = opts.contributorId ? [opts.contributorId] : [];
        }
        return result;
    }

    // -----------------------------------------------------------------
    // 5. CONFIRMATION / CONFIDENCE (independent-confirmation counting)
    // -----------------------------------------------------------------

    function confirmCandidate(candidateId, contributorId) {
        const candidate = store.find((c) => c.id === candidateId);
        if (!candidate) return { status: "NOT_FOUND", candidate: null };
        candidate._contributors = candidate._contributors || [];
        if (!contributorId) {
            return { status: "REJECTED", reason: "A contributorId is required to confirm.", candidate };
        }
        if (candidate._contributors.indexOf(contributorId) !== -1) {
            return { status: "ALREADY_COUNTED", reason: "This contributor already confirmed this candidate.", candidate };
        }
        candidate._contributors.push(contributorId);
        candidate.independentConfirmations = candidate._contributors.length;

        // Thresholds are signals only — never automatic upgrade to fully
        // "VERIFIED"; VERIFIED requires an explicit, separately governed
        // validation step (out of scope for this pipeline pass).
        if (candidate.independentConfirmations >= 5) {
            candidate.verificationState = "PARTIALLY_VERIFIED";
        }
        candidate.confidence.communityConfidence = Math.min(1, candidate.independentConfirmations / 20);
        candidate.updatedAt = nowISO();
        return { status: "CONFIRMED", candidate };
    }

    // -----------------------------------------------------------------
    // 6. PRIVACY / VISIBILITY (explicit promotion only)
    // -----------------------------------------------------------------

    function contributeToCommunity(candidateId) {
        const candidate = store.find((c) => c.id === candidateId);
        if (!candidate) return { status: "NOT_FOUND", candidate: null };
        candidate.visibility = "COMMUNITY";
        candidate.updatedAt = nowISO();
        return { status: "UPDATED", candidate };
    }

    function contributeToPublic(candidateId) {
        const candidate = store.find((c) => c.id === candidateId);
        if (!candidate) return { status: "NOT_FOUND", candidate: null };
        if (candidate.visibility !== "COMMUNITY" && candidate.visibility !== "PUBLIC") {
            return { status: "REJECTED", reason: "A candidate must be contributed to COMMUNITY before PUBLIC.", candidate };
        }
        candidate.visibility = "PUBLIC";
        candidate.updatedAt = nowISO();
        return { status: "UPDATED", candidate };
    }

    // -----------------------------------------------------------------
    // 7. QUERY
    // -----------------------------------------------------------------

    function getCandidate(id) {
        return store.find((c) => c.id === id) || null;
    }

    function listCandidates(filters) {
        const f = filters || {};
        return store.filter((c) => {
            if (f.visibility && c.visibility !== f.visibility) return false;
            if (f.verificationState && c.verificationState !== f.verificationState) return false;
            if (f.language && c.language.code !== f.language) return false;
            if (f.sourceType && c.provenance.sourceType !== f.sourceType) return false;
            return true;
        }).map((c) => Object.assign({}, c));
    }

    function searchCandidates(query) {
        if (!query || typeof query !== "string") return [];
        const needle = query.toLowerCase();
        return store.filter((c) => c.claim && c.claim.toLowerCase().includes(needle))
            .map((c) => Object.assign({}, c));
    }

    const api = {
        getVersion() { return VERSION; },
        SOURCE_TYPES,
        VISIBILITY_STATES,
        VERIFICATION_STATES,
        ingestSource,
        ingestWebsite,
        ingestCommunitySubmission,
        confirmCandidate,
        contributeToCommunity,
        contributeToPublic,
        getCandidate,
        listCandidates,
        searchCandidates,
        // Exposed for tests only — real callers should never need to
        // reset shared local knowledge memory mid-session.
        _resetStoreForTests: resetStore,
        _detectLanguageForTests: detectLanguage,
        _contentHashForTests: contentHash
    };

    window.CozyOS.CozyKnowledgeIngestion = Object.freeze(api);
    window.CozyOS.Modules["cozy-knowledge-ingestion"] = Object.freeze({
        version: VERSION,
        description: "RP-029-A — Document/website/community-submission knowledge ingestion pipeline (SOURCE -> EXTRACTION -> LANGUAGE ID -> SEGMENTATION -> PROVENANCE -> CANDIDATE). Never fetches the network itself (caller supplies content); never auto-promotes a candidate past CANDIDATE/PARTIALLY_VERIFIED; visibility starts PRIVATE and only becomes COMMUNITY/PUBLIC via explicit contributeToCommunity()/contributeToPublic() calls. Language detection is a small disclosed keyword heuristic, honestly degrading to LANGUAGE_UNCERTAIN rather than guessing. No audio/video/speech capability — out of scope for this file (see header)."
    });

})();
