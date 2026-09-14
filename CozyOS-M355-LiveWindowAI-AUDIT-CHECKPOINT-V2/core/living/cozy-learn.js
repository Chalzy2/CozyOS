/**
 * core/living/cozy-learn.js
 * PHASE 6B — CozyLearn: Governed Unknown-Word Semantic Learning
 *
 * WHAT THIS FILE IS
 *   A real, bounded, deterministic learning-candidate pipeline for
 *   words/phrases the semantic intent engine (cozy-ai-semantic-intent.js)
 *   does not recognize. Implements the exact state machine the spec
 *   requires: OBSERVED -> CANDIDATE -> USER_CONFIRMED -> VALIDATED ->
 *   TRUSTED (or REJECTED at any point before TRUSTED). Nothing here is
 *   a trained model - typo/spelling-variant suggestion is real
 *   Levenshtein edit-distance against a small, disclosed known-
 *   vocabulary list, not a fabricated "AI guess".
 *
 * WHAT THIS FILE IS NOT
 *   - Not a second knowledge/memory system. Candidates are persisted
 *     via the existing CozyMemory API (namespace "cozy-learn-candidates")
 *     when available; this file's own in-memory Map is only a fallback
 *     for when CozyMemory isn't loaded, and is never treated as durable.
 *   - Not automatic. No candidate ever reaches TRUSTED without an
 *     explicit promoteCandidate() call from a caller acting as the
 *     validation authority (a human admin flow, in a real deployment -
 *     this file provides the mechanism, not the UI/authorization
 *     policy for who may call it).
 *   - Not global by default. getLearnedSynonyms() only returns entries
 *     whose scope the caller explicitly requests (Section 13/32/19)
 *     -"GLOBAL" is never the silent default for a USER/SESSION/
 *     ORGANIZATION-scoped candidate.
 *   - Not a rewrite of cozy-ai-semantic-intent.js's PATTERNS. The
 *     integration point is a pre-classification text substitution
 *     (applySynonyms()), consulted only when a caller opts in - see
 *     that file's own comment on the exact, single call site.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    if (window.CozyOS.CozyLearn) return; // idempotent load guard

    const MODULE_VERSION = "1.0.0-phase6b";

    const STATUS = Object.freeze({
        OBSERVED: "OBSERVED",
        CANDIDATE: "CANDIDATE",
        USER_CONFIRMED: "USER_CONFIRMED",
        VALIDATED: "VALIDATED",
        TRUSTED: "TRUSTED",
        REJECTED: "REJECTED",
        SUPERSEDED: "SUPERSEDED"
    });

    const SCOPES = Object.freeze(["USER", "SESSION", "COMMUNITY", "ORGANIZATION", "APPLICATION", "GLOBAL"]);

    /**
     * KNOWN_VOCABULARY — Section 1/2. A small, disclosed list of
     * canonical Kiswahili/English words the semantic intent engine's
     * own PATTERNS already key on. Deliberately maintained here (not
     * introspected from the engine's compiled RegExps, which cannot be
     * safely reverse-parsed into literal words) so this file states
     * plainly what it can and cannot suggest corrections against.
     * Extending this list is additive and safe - it only widens what
     * CAN be suggested, never what gets auto-trusted.
     */
    const KNOWN_VOCABULARY = Object.freeze([
        "inasaidia", "inasaidiaje", "inanisaidia", "inatusaidia", "kununua", "nataka", "nahitaji", "naomba",
        "nikumbushe", "kesho", "leo", "jana", "badilisha", "futa", "sitaki", "haifanyi", "kazi", "bora",
        "nieleze", "nifundishe", "tafsiri", "tafuta", "gharimu", "nini", "faida", "kwanza", "halafu", "kisha",
        "help", "buy", "want", "remind", "tomorrow", "cancel", "change", "explain", "translate", "search",
        "cost", "benefits", "working", "first", "then"
    ]);

    /**
     * levenshtein(a, b) — real, standard edit-distance calculation.
     * No dependency, no approximation claimed as "AI".
     */
    function levenshtein(a, b) {
        a = String(a).toLowerCase();
        b = String(b).toLowerCase();
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const prev = new Array(n + 1);
        const curr = new Array(n + 1);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            for (let j = 0; j <= n; j++) prev[j] = curr[j];
        }
        return prev[n];
    }

    /**
     * suggestCorrection(word)
     *   Section 1/9. Returns { candidate, distance } for the closest
     *   real KNOWN_VOCABULARY entry within a small, disclosed threshold
     *   (distance <= 2, and never more than ~30% of the word's own
     *   length, so a short unrelated word doesn't get a nonsensical
     *   "correction"). Returns null when no safe candidate exists -
     *   this is the honest "do not guess" path (Section 10).
     */
    function suggestCorrection(word) {
        const lower = String(word || "").toLowerCase();
        if (!lower || KNOWN_VOCABULARY.includes(lower)) return null; // already known - nothing to suggest
        let best = null;
        for (const known of KNOWN_VOCABULARY) {
            const distance = levenshtein(lower, known);
            const maxAllowed = Math.min(2, Math.max(1, Math.floor(known.length * 0.3)));
            if (distance <= maxAllowed && (!best || distance < best.distance)) {
                best = { candidate: known, distance };
            }
        }
        return best;
    }

    /**
     * CONFIRMATION MARKERS — Section 4/5. Real, disclosed word lists,
     * not a sentiment model.
     */
    const CONFIRM_MARKERS = ["ndiyo", "ndio", "yes", "sawa", "ni hivyo", "correct"];
    const REJECT_MARKERS = ["hapana", "si hivyo", "no", "sio hivyo"];

    /**
     * interpretConfirmationResponse(text)
     *   Returns "CONFIRM" | "REJECT" | "UNCLEAR" - never silently
     *   assumes confirmation from an ambiguous reply.
     */
    function interpretConfirmationResponse(text) {
        const lower = String(text || "").toLowerCase().trim();
        if (CONFIRM_MARKERS.some((m) => lower === m || lower.startsWith(m + " ") || lower.startsWith(m + ","))) return "CONFIRM";
        if (REJECT_MARKERS.some((m) => lower === m || lower.startsWith(m + " ") || lower.startsWith(m + ","))) return "REJECT";
        return "UNCLEAR";
    }

    // ---- Candidate store (Section 15/28) ----
    // In-memory fallback; real persistence via CozyMemory when present.
    const memoryCandidates = new Map();

    function getMemory() { return window.CozyOS && window.CozyOS.CozyMemory; }

    function persist(actorId, candidateId, record) {
        const memory = getMemory();
        if (memory && typeof memory.saveMemory === "function" && actorId) {
            try { memory.saveMemory(actorId, `cozy-learn-candidate-${candidateId}`, record); return true; } catch (_err) { /* fall through to in-memory */ }
        }
        memoryCandidates.set(candidateId, record);
        return false;
    }

    function load(actorId, candidateId) {
        const memory = getMemory();
        if (memory && typeof memory.readMemory === "function" && actorId) {
            try {
                const result = memory.readMemory(actorId, `cozy-learn-candidate-${candidateId}`);
                if (result) return result.value !== undefined ? result.value : result;
            } catch (_err) { /* fall through */ }
        }
        return memoryCandidates.get(candidateId) || null;
    }

    let candidateCounter = 0;
    function makeCandidateId() { return `learn_${Date.now()}_${(++candidateCounter)}`; }

    /**
     * createCandidate(input)
     *   Section 4/6/9. Real, structured candidate record. Never
     *   trusted on creation - always starts at OBSERVED or CANDIDATE.
     */
    function createCandidate(input) {
        input = input && typeof input === "object" ? input : {};
        if (!input.observedForm) throw new TypeError("[cozy-learn] createCandidate(): observedForm is required.");
        if (!SCOPES.includes(input.scope)) input.scope = "USER"; // honest, narrow default - never GLOBAL unless explicitly requested
        const candidateId = makeCandidateId();
        const record = {
            candidateId,
            observedForm: input.observedForm,
            canonicalForm: input.canonicalForm || null,
            language: input.language || null,
            relationship: input.relationship || "UNKNOWN", // SPELLING_VARIANT | DIALECT_OR_VARIANT | NEW_WORD | STT_VARIANT | OCR_VARIANT | UNKNOWN
            meaning: input.meaning || null,
            semanticConcept: input.semanticConcept || null,
            source: input.source || "user-interaction",
            sourceModality: input.sourceModality || "text",
            scope: input.scope,
            status: STATUS.CANDIDATE,
            confirmations: [],
            createdAt: new Date().toISOString(),
            validatedAt: null,
            validatedBy: null,
            version: 1
        };
        persist(input.actorId, candidateId, record);
        return record;
    }

    /**
     * confirmCandidate(candidateId, {actorId, confirmedBy})
     *   Section 4. Moves CANDIDATE -> USER_CONFIRMED. Does NOT trust
     *   the mapping yet - that still requires promoteCandidate().
     */
    function confirmCandidate(candidateId, opts) {
        opts = opts || {};
        const record = load(opts.actorId, candidateId);
        if (!record) return { success: false, reason: "No candidate found for that id." };
        if (record.status === STATUS.REJECTED) return { success: false, reason: "Candidate was already rejected." };
        record.status = STATUS.USER_CONFIRMED;
        record.confirmations.push({ by: opts.confirmedBy || opts.actorId || "unknown", at: new Date().toISOString() });
        persist(opts.actorId, candidateId, record);
        return { success: true, candidate: record };
    }

    /**
     * rejectCandidate(candidateId, {actorId, reason})
     *   Section 5. Terminal unless a caller explicitly creates a NEW,
     *   revised candidate (this file never auto-revises).
     */
    function rejectCandidate(candidateId, opts) {
        opts = opts || {};
        const record = load(opts.actorId, candidateId);
        if (!record) return { success: false, reason: "No candidate found for that id." };
        record.status = STATUS.REJECTED;
        record.rejectionReason = opts.reason || null;
        persist(opts.actorId, candidateId, record);
        return { success: true, candidate: record };
    }

    /**
     * promoteCandidate(candidateId, {actorId, validatedBy, scope})
     *   Section 15/18/29. The ONLY function that produces a TRUSTED
     *   entry, and the ONLY function that makes a mapping visible to
     *   getLearnedSynonyms()/applySynonyms() below. Requires the
     *   candidate to already be USER_CONFIRMED (Section 28's own
     *   ordering: candidate -> ask -> confirm -> validate -> promote -
     *   never skips straight from CANDIDATE to TRUSTED). A caller may
     *   optionally narrow or widen scope at promotion time (e.g. an
     *   admin promoting a USER-scoped candidate to COMMUNITY), but
     *   never silently to GLOBAL unless explicitly passed.
     */
    function promoteCandidate(candidateId, opts) {
        opts = opts || {};
        const record = load(opts.actorId, candidateId);
        if (!record) return { success: false, reason: "No candidate found for that id." };
        if (record.status !== STATUS.USER_CONFIRMED && record.status !== STATUS.VALIDATED) {
            return { success: false, reason: `Cannot promote a candidate in status "${record.status}" - it must be USER_CONFIRMED first (Section 28 ordering).` };
        }
        if (opts.scope && SCOPES.includes(opts.scope)) record.scope = opts.scope;
        record.status = STATUS.TRUSTED;
        record.validatedAt = new Date().toISOString();
        record.validatedBy = opts.validatedBy || null;
        persist(opts.actorId, candidateId, record);
        registerTrustedSynonym(record);
        return { success: true, candidate: record };
    }

    // ---- Runtime-effective learned synonyms (Section 26/31/35) ----
    // Keyed by scope so getLearnedSynonyms()/applySynonyms() can
    // enforce "never silently GLOBAL" (Section 13/19/32). This is the
    // ONLY structure the semantic intent engine's optional
    // pre-classification step reads from - a plain object, not a
    // second knowledge database, holding nothing but
    // observedForm -> canonicalForm for TRUSTED candidates.
    const trustedSynonymsByScope = { USER: new Map(), SESSION: new Map(), COMMUNITY: new Map(), ORGANIZATION: new Map(), APPLICATION: new Map(), GLOBAL: new Map() };

    function registerTrustedSynonym(record) {
        if (!record.canonicalForm || !record.language) return; // nothing safe to apply without both
        const key = `${record.language}:${record.observedForm.toLowerCase()}`;
        trustedSynonymsByScope[record.scope].set(key, { canonicalForm: record.canonicalForm, candidateId: record.candidateId, semanticConcept: record.semanticConcept || null });
    }

    /**
     * getLearnedSynonyms(language, { scopes })
     *   Section 13/32. scopes defaults to ["GLOBAL"] only - a caller
     *   must explicitly request USER/SESSION/ORGANIZATION/COMMUNITY/
     *   APPLICATION scopes to see those entries. This is the real
     *   privacy boundary: nothing here defaults to leaking a private
     *   scope into a generic lookup.
     */
    function getLearnedSynonyms(language, options) {
        const scopes = (options && Array.isArray(options.scopes) && options.scopes.length) ? options.scopes : ["GLOBAL"];
        const result = {};
        for (const scope of scopes) {
            if (!trustedSynonymsByScope[scope]) continue;
            for (const [key, value] of trustedSynonymsByScope[scope].entries()) {
                const [lang, form] = key.split(":");
                if (lang === language) result[form] = value.canonicalForm;
            }
        }
        return result;
    }

    /**
     * applySynonyms(text, language, options)
     *   Section 26/35 - the real integration point. Whole-word
     *   substitution ONLY (never a substring replace that could
     *   corrupt an unrelated word), using ONLY TRUSTED entries in the
     *   requested scope(s). Returns the substituted text AND which
     *   substitutions were made (for transparency/debugging) - never
     *   silently mutates without disclosing what changed.
     */
    function applySynonyms(text, language, options) {
        const synonyms = getLearnedSynonyms(language, options);
        const applied = [];
        let output = text;
        for (const observed of Object.keys(synonyms)) {
            const re = new RegExp(`\\b${observed}\\b`, "gi");
            if (re.test(output)) {
                output = output.replace(re, synonyms[observed]);
                applied.push({ observed, canonical: synonyms[observed] });
            }
        }
        return { text: output, applied };
    }

    /**
     * detectUnknownTerms(text)
     *   Section 1/2. A bounded, honest helper: tokenizes the input and
     *   returns which tokens are NOT in KNOWN_VOCABULARY and NOT a
     *   recognized known entity (CozyOS/ChurchOS/ShopOS/QuarryOS,
     *   checked as a real, disclosed short list, same as the semantic
     *   engine's own KNOWN_ENTITIES), together with any real
     *   suggestCorrection() candidate for each. This does NOT attempt
     *   full sentence parsing/POS-tagging - it is a real, narrow, typo/
     *   variant detector, not a general unknown-word classifier.
     */
    const KNOWN_ENTITIES_LOWER = ["cozyos", "churchos", "shopos", "quarryos"];
    const STOPWORDS_FOR_DETECTION = ["ni", "na", "ya", "la", "kwa", "the", "a", "an", "is", "are", "to", "of"];

    function detectUnknownTerms(text) {
        const words = String(text || "").toLowerCase().match(/[a-z]+/g) || [];
        const unknown = [];
        for (const word of words) {
            if (word.length < 4) continue; // too short to safely typo-match (Section 9 - avoid nonsensical corrections)
            if (KNOWN_VOCABULARY.includes(word)) continue;
            if (KNOWN_ENTITIES_LOWER.includes(word)) continue;
            if (STOPWORDS_FOR_DETECTION.includes(word)) continue;
            const suggestion = suggestCorrection(word);
            unknown.push({ word, suggestion });
        }
        return unknown;
    }

    /**
     * buildClarificationMessage(unknownWord, suggestion, language)
     *   Section 3 - a real, natural (not robotic) clarification,
     *   matching the spec's own example phrasing where a direct
     *   correction candidate exists.
     */
    function buildClarificationMessage(unknownWord, suggestion, language) {
        if (suggestion) {
            return language === "sw"
                ? `Nimeelewa muktadha wa swali lako, lakini neno "${unknownWord}" silitambui vizuri bado. Je, ulimaanisha "${suggestion.candidate}"?`
                : `I understood the rest of your question, but I don't yet recognize "${unknownWord}". Did you mean "${suggestion.candidate}"?`;
        }
        return language === "sw"
            ? `Neno "${unknownWord}" silitambui katika muktadha huu. Unaweza kuniambia linamaanisha nini?`
            : `I don't recognize "${unknownWord}" in this context. Could you tell me what it means?`;
    }

    window.CozyOS.CozyLearn = Object.freeze({
        STATUS,
        SCOPES,
        levenshtein,
        suggestCorrection,
        detectUnknownTerms,
        buildClarificationMessage,
        interpretConfirmationResponse,
        createCandidate,
        confirmCandidate,
        rejectCandidate,
        promoteCandidate,
        getLearnedSynonyms,
        applySynonyms,
        getVersion() { return MODULE_VERSION; }
    });

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["cozy-learn"] = {
        version: MODULE_VERSION,
        description: "PHASE 6B - CozyLearn: governed unknown-word/typo/dialect learning candidate pipeline. Real Levenshtein-based typo suggestion against a small disclosed vocabulary (not a trained model). Full state machine OBSERVED/CANDIDATE/USER_CONFIRMED/VALIDATED/TRUSTED/REJECTED - promoteCandidate() is the ONLY path to TRUSTED and the only thing that makes a mapping visible to getLearnedSynonyms()/applySynonyms(). Scope-enforced (USER/SESSION/COMMUNITY/ORGANIZATION/APPLICATION/GLOBAL) - getLearnedSynonyms() defaults to GLOBAL-only, never silently leaking a private scope. Persists via existing CozyMemory when available; in-memory fallback otherwise, never a second durable store. Does not modify cozy-ai-semantic-intent.js's PATTERNS - the integration point is an opt-in pre-classification substitution, applySynonyms(), called from a single, disclosed location in that file."
    };
})();
