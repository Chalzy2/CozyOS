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
            // PHASE 4 — ENHANCED COZY BOUNDARY (Live Session Privacy) FIX:
            // a real, confirmed, pre-existing gap found while proving
            // cross-participant isolation. This call never set `owner`,
            // and CozyMemory's own #checkReadVisibility() treats an
            // owner-less entry as open to ANY actorId ("an entry with no
            // owner set is open to any actorId" — see that file's own
            // #checkPermission() comment). getTrustedTeachings()'s own
            // actorId-equality filter (this file, below) only protects
            // ITS OWN read path — cozy-ai.js's separate, generic
            // CozyMemory.recall() keyword fan-out (the "cozy-memory"
            // authority in getContext()) goes straight through CozyMemory
            // itself and was never scoped by that filter, so a taught
            // candidate/record was readable by any other actorId whose
            // question happened to keyword-match it. Passing the real
            // owner here is the minimal fix: visibility stays "private"
            // (saveMemory()'s own honest default, unchanged), and
            // #checkReadVisibility() now actually enforces owner-only
            // access for a USER-scope teaching, exactly as Phase 3's own
            // documentation already claimed it did.
            try { memory.saveMemory(actorId, `cozy-learn-candidate-${candidateId}`, record, { owner: actorId }); return true; } catch (_err) { /* fall through to in-memory */ }
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
            version: 1,
            // PHASE 3 (Teach Cozy / Governed Learning) — additive, optional
            // fields. A candidate created by every caller before this
            // phase never set these, and every existing function above
            // (confirm/reject/promote/getLearnedSynonyms/applySynonyms)
            // works byte-identically whether they are null or set. Never
            // a second record shape - the SAME candidate record, SAME
            // state machine, SAME persist()/load() plumbing.
            subject: input.subject || null, // what/who the claim is about (e.g. an application name) - null for a plain word/synonym candidate
            claim: input.claim || null, // the free-text statement being taught, distinct from the narrower observedForm/canonicalForm synonym pair
            category: input.category || null, // e.g. "TAUGHT_FACT" - honest label, not a new taxonomy engine
            provenance: input.provenance ? { actorId: input.actorId || null, capturedVia: input.provenance.capturedVia || "unknown", capturedAt: new Date().toISOString() } : null,
            conflictsWith: input.conflictsWith || null // set by a caller that already ran checkConflict() before creating this candidate - never computed here
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
        registerTrustedTeaching(record);
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

    // ---- Trusted TAUGHT FACTS (Phase 3 — Teach Cozy / Governed Learning) ----
    // Same scope-keyed shape as trustedSynonymsByScope above, and the
    // SAME safety rule: getTrustedTeachings() defaults to GLOBAL-only,
    // never silently leaking a private scope. This is separate from
    // trustedSynonymsByScope because a taught fact/claim has no
    // canonicalForm (it is not a word-substitution mapping) - it is
    // never stored in, or read from, that structure.
    const trustedTeachingsByScope = { USER: new Map(), SESSION: new Map(), COMMUNITY: new Map(), ORGANIZATION: new Map(), APPLICATION: new Map(), GLOBAL: new Map() };

    // PERSISTENCE ACROSS A NEW CONVERSATION/SESSION — real gap found via
    // a real two-browser-session test: CozyMemory (the existing,
    // repository-wide memory abstraction persist()/load() above already
    // composes) has NO durable backend anywhere in this repository today
    // (confirmed by reading cozy-memory-engine.js in full — an in-memory
    // Map only, page-lifetime, a PRE-EXISTING characteristic of every
    // CozyMemory namespace, not something Phase 3 introduces). Without
    // more, a promoted TRUSTED taught fact would vanish the moment the
    // page reloads — failing the Phase 3 requirement that approved
    // learning survive into a genuinely new conversation. Rather than
    // build durable storage into CozyMemory itself (a repository-wide
    // change touching every feature that uses it, far outside this
    // phase's scope) or invent a second learning database, this adds
    // ONE small, disclosed, additive localStorage write-through
    // SPECIFICALLY for the TRUSTED-teaching cache this phase itself
    // introduces — nothing else in CozyLearn is touched by this. Fails
    // closed/honestly: if localStorage is unavailable (Node tests, a
    // privacy-restricted browser context), teachings simply behave as
    // they did before this addition (page-lifetime only) — never throws.
    const TRUSTED_TEACHINGS_STORAGE_KEY = "cozy-learn-trusted-teachings-v1";

    function getLocalStorage() {
        try {
            if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        } catch (_err) { /* some contexts throw merely accessing localStorage */ }
        return null;
    }

    function persistTrustedTeachingsToStorage() {
        const storage = getLocalStorage();
        if (!storage) return;
        try {
            const serializable = {};
            for (const scope of Object.keys(trustedTeachingsByScope)) {
                serializable[scope] = Array.from(trustedTeachingsByScope[scope].entries());
            }
            storage.setItem(TRUSTED_TEACHINGS_STORAGE_KEY, JSON.stringify(serializable));
        } catch (_err) { /* honest no-op — a write failure never breaks the in-memory path */ }
    }

    function loadTrustedTeachingsFromStorage() {
        const storage = getLocalStorage();
        if (!storage) return;
        try {
            const raw = storage.getItem(TRUSTED_TEACHINGS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            for (const scope of Object.keys(trustedTeachingsByScope)) {
                const entries = Array.isArray(parsed[scope]) ? parsed[scope] : [];
                for (const [key, value] of entries) trustedTeachingsByScope[scope].set(key, value);
            }
        } catch (_err) { /* honest no-op — a corrupt/foreign value never throws, just starts empty */ }
    }

    loadTrustedTeachingsFromStorage(); // rehydrate once, at module load — before any candidate in THIS session is promoted

    function registerTrustedTeaching(record) {
        if (!record.claim) return; // nothing safe to expose without an actual claim
        const subjectKey = (record.subject || record.observedForm || "").toLowerCase();
        if (!subjectKey) return;
        const actorId = record.provenance && record.provenance.actorId ? record.provenance.actorId : null;
        // USER scope is this actor's own private data — the key
        // includes actorId so a second user teaching the same subject
        // at USER scope never collides with, or overwrites, the first
        // user's own entry (unlike trustedSynonymsByScope above, which
        // pre-dates Phase 3 and has no such per-actor claim data to
        // partition by). Non-USER scopes are not actor-partitioned —
        // same convention as the rest of this file.
        const key = record.scope === "USER"
            ? `${record.language || "*"}:${subjectKey}:${actorId || "unknown"}`
            : `${record.language || "*"}:${subjectKey}`;
        trustedTeachingsByScope[record.scope].set(key, {
            candidateId: record.candidateId,
            subject: record.subject || record.observedForm,
            claim: record.claim,
            language: record.language || null,
            category: record.category || null,
            provenance: record.provenance || null,
            validatedAt: record.validatedAt,
            actorId
        });
        persistTrustedTeachingsToStorage();
    }

    /**
     * getTrustedTeachings(subject, { language, scopes, actorId })
     *   Phase 3. scopes defaults to ["GLOBAL"] only - same privacy
     *   boundary as getLearnedSynonyms() above. Returns the TRUSTED
     *   taught-fact records (never CANDIDATE/USER_CONFIRMED ones) whose
     *   subject matches (case-insensitive), across the requested scopes.
     *   FAIL-CLOSED PRIVACY RULE: when "USER" is requested, an entry is
     *   only returned when its own recorded actorId matches the
     *   caller-supplied actorId exactly — a missing/mismatched actorId
     *   never sees another user's USER-scoped taught fact, and a caller
     *   that passes no actorId sees no USER-scoped entries at all.
     */
    function getTrustedTeachings(subject, options) {
        const opts = options || {};
        const scopes = (Array.isArray(opts.scopes) && opts.scopes.length) ? opts.scopes : ["GLOBAL"];
        const subjectKey = String(subject || "").toLowerCase();
        if (!subjectKey) return [];
        const matches = [];
        for (const scope of scopes) {
            if (!trustedTeachingsByScope[scope]) continue;
            for (const [key, value] of trustedTeachingsByScope[scope].entries()) {
                if (scope === "USER" && (!opts.actorId || value.actorId !== opts.actorId)) continue;
                const parts = key.split(":");
                const lang = parts[0];
                const keySubject = parts[1];
                if (keySubject !== subjectKey) continue;
                if (opts.language && lang !== "*" && lang !== opts.language) continue;
                matches.push(Object.assign({ scope }, value));
            }
        }
        return matches;
    }

    /**
     * checkConflict({ subject, claim, language })
     *   Phase 3. A real, disclosed, narrow heuristic - NOT a general
     *   contradiction detector (no such thing exists honestly in this
     *   repository). It composes window.CozyOS.CozyKnowledge's
     *   existing getApplicationDetailedInfoFact(name, lang) - the SAME
     *   verified application-fact source the rest of CozyAI already
     *   uses - and only flags a conflict when (a) a VERIFIED fact for
     *   that exact subject already exists, AND (b) that fact's own text
     *   contains a real, disclosed "capability unavailable" marker, AND
     *   (c) the proposed claim affirmatively asserts a matching
     *   capability keyword without itself containing a negation word.
     *   Returns { conflict: false, reason: "NO_EXISTING_FACT" | "NO_MARKER_MATCH" }
     *   or { conflict: true, existingFact, matchedKeyword }. Never
     *   throws, never silently promotes past a real conflict - callers
     *   (e.g. cozy-teach-flow.js) decide what to do with the result.
     */
    // Deliberately narrow: only the specific, reserved
    // "CAPABILITY_UNAVAILABLE" disclosure token this repository already
    // uses for exactly this purpose (see cozy-knowledge-registry.js's
    // own ChurchOS broadcast-limit fact). A real false positive was
    // found via the real-browser test suite when this list also
    // included the generic phrase "not implemented": a multi-paragraph
    // application fact's own unrelated "Vision/planned (not implemented
    // yet)" section made an unrelated, true claim about a DIFFERENT,
    // already-implemented capability look like a conflict purely
    // because the word "not implemented" appeared anywhere at all in
    // the fact text. The generic phrase is too broad to safely imply
    // "this specific claim is about the same unavailable capability" -
    // removed rather than patched further, matching this file's own
    // "never guess, honestly under-detect rather than false-positive"
    // discipline.
    const UNAVAILABLE_MARKERS = ["CAPABILITY_UNAVAILABLE"];
    const NEGATION_WORDS_EN = ["not", "cannot", "can't", "doesn't", "does not", "no ", "never"];
    const NEGATION_WORDS_SW = ["hai", "hawezi", "haiwezi", "hazi", "hapana", "sio", "si "];

    function checkConflict(fields) {
        const f = fields || {};
        const registry = window.CozyOS && window.CozyOS.CozyKnowledge;
        if (!registry || typeof registry.getApplicationDetailedInfoFact !== "function" || !f.subject) {
            return { conflict: false, reason: "NO_EXISTING_FACT" };
        }
        let result = null;
        try { result = registry.getApplicationDetailedInfoFact(f.subject, f.language || "en"); } catch (_err) { return { conflict: false, reason: "NO_EXISTING_FACT" }; }
        if (!result || result.evidence !== "VERIFIED" || !result.answer) return { conflict: false, reason: "NO_EXISTING_FACT" };

        const factText = String(result.answer);
        const matchedMarker = UNAVAILABLE_MARKERS.find((m) => factText.toLowerCase().includes(m.toLowerCase()));
        if (!matchedMarker) return { conflict: false, reason: "NO_MARKER_MATCH" };

        const claimLower = String(f.claim || "").toLowerCase();
        const negations = (f.language === "sw") ? NEGATION_WORDS_SW : NEGATION_WORDS_EN;
        const claimIsNegated = negations.some((n) => claimLower.includes(n));
        if (claimIsNegated) return { conflict: false, reason: "NO_MARKER_MATCH" }; // claim itself already agrees the capability is unavailable

        // The claim must share at least one real, disclosed content word
        // (length >= 5, not a stopword, and NOT the subject's own name -
        // which would trivially appear in almost any fact about that
        // subject and cause a false conflict for an unrelated claim like
        // "ChurchOS has a nice logo") with the unavailable fact's own
        // text to count as "about the same capability" - never a bare
        // "any application fact exists" false positive.
        const subjectWords = String(f.subject || "").toLowerCase().match(/[a-z]+/g) || [];
        const claimWords = (claimLower.match(/[a-z]+/g) || []).filter((w) => !subjectWords.includes(w));
        const factLower = factText.toLowerCase();
        const sharedWord = claimWords.find((w) => w.length >= 5 && factLower.includes(w));
        if (!sharedWord) return { conflict: false, reason: "NO_MARKER_MATCH" };

        return { conflict: true, existingFact: result.answer, matchedKeyword: sharedWord };
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
        // PHASE 4 — migrated to the universal realization seam
        // (window.CozyOS.CozyLanguageRealize, "learn:clarify-*" keys in
        // cozy-language-templates.js). The literal en/sw ternary below
        // remains only as the honest fallback for when that module
        // isn't loaded (e.g. this file's own Node unit tests that don't
        // load it) — byte-identical text either way for en/sw.
        const realizer = window.CozyOS && window.CozyOS.CozyLanguageRealize;
        if (suggestion) {
            const realized = realizer && realizer.realize("learn:clarify-with-suggestion", language, unknownWord, suggestion.candidate);
            if (realized) return realized;
            return language === "sw"
                ? `Nimeelewa muktadha wa swali lako, lakini neno "${unknownWord}" silitambui vizuri bado. Je, ulimaanisha "${suggestion.candidate}"?`
                : `I understood the rest of your question, but I don't yet recognize "${unknownWord}". Did you mean "${suggestion.candidate}"?`;
        }
        const realizedNoSuggestion = realizer && realizer.realize("learn:clarify-no-suggestion", language, unknownWord);
        if (realizedNoSuggestion) return realizedNoSuggestion;
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
        getTrustedTeachings,
        checkConflict,
        getVersion() { return MODULE_VERSION; }
    });

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["cozy-learn"] = {
        version: MODULE_VERSION,
        description: "PHASE 6B - CozyLearn: governed unknown-word/typo/dialect learning candidate pipeline. Real Levenshtein-based typo suggestion against a small disclosed vocabulary (not a trained model). Full state machine OBSERVED/CANDIDATE/USER_CONFIRMED/VALIDATED/TRUSTED/REJECTED - promoteCandidate() is the ONLY path to TRUSTED and the only thing that makes a mapping visible to getLearnedSynonyms()/applySynonyms(). Scope-enforced (USER/SESSION/COMMUNITY/ORGANIZATION/APPLICATION/GLOBAL) - getLearnedSynonyms() defaults to GLOBAL-only, never silently leaking a private scope. Persists via existing CozyMemory when available; in-memory fallback otherwise, never a second durable store. Does not modify cozy-ai-semantic-intent.js's PATTERNS - the integration point is an opt-in pre-classification substitution, applySynonyms(), called from a single, disclosed location in that file."
    };
})();
