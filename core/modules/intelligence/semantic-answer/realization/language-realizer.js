/**
 * CozyAI — Language Realizer (SA-4)
 * File Reference: core/modules/intelligence/semantic-answer/realization/language-realizer.js
 *
 * WHAT THIS IS
 *   The "Cozy Construction Sentence" realizer: turns a validated
 *   cozy.language-realization-request.v1 (SA-1's LanguageRealizationRequestContract
 *   — a real SemanticAnswerPlan + real VerifiedEvidence, both already
 *   built by SA-2/SA-3) into a real cozy.candidate-sentence.v1
 *   (CandidateSentenceContract). This is the file the whole SA-1..SA-3
 *   foundation was built for and that never existed until now (confirmed
 *   absent by direct repo search before writing this file).
 *
 * THE NON-NEGOTIABLE RULE THIS FILE EXISTS TO SATISFY
 *   useOnlyEvidence=true (LanguageRealizationRequestContract's own fixed
 *   constraint) means: construct the target-language sentence FROM the
 *   plan's claims + their real evidence — never select one pre-written
 *   `*Sw`/`*En` string as "the answer" for a (goal, language) pair, and
 *   never generate English first and translate second. Concretely:
 *
 *     - Each claim's TEXT comes from evidence.claim, ALREADY real,
 *       committed content in the target language (e.g. a real
 *       `humanBenefitsSw` array item — a human-authored Kiswahili
 *       sentence, never a translation of the English sibling produced
 *       at answer time).
 *     - This file's own contribution is COMPOSITION: selecting which
 *       claims to include (all of the plan's claims, in order),
 *       introducing them naturally when there is more than one (a
 *       fixed, disclosed, per-goal, per-language INTRO sentence — see
 *       "semantic-answer:intro:*" in cozy-language-templates.js,
 *       composed via the EXISTING Phase 4 universal realization seam,
 *       window.CozyOS.CozyLanguageRealize — never a second template
 *       store), and joining them into one coherent CandidateSentence.
 *       GENERATION_MODE is therefore "COMPOSED" (join/template already-
 *       VERIFIED evidence text) — the real, disclosed SA-4 starting
 *       point per the implementation map, never "MODEL_GENERATED"
 *       (that is explicitly SA-8 scope, not built here).
 *     - If a claim's own evidence is NOT actually in the requested
 *       language (should not happen given SA-3 already filters evidence
 *       by requested language before building a plan, but checked here
 *       too — defense in depth, never trusted blindly), that claim is
 *       honestly dropped rather than silently included in the wrong
 *       language. If EVERY claim's evidence turns out to be in the
 *       wrong language, this file returns a real, disclosed failure
 *       (NO_REALIZABLE_EVIDENCE_IN_LANGUAGE) — never a fabricated
 *       sentence, never an English fallback dressed as Kiswahili.
 *
 * WHAT THIS FILE DOES NOT DO
 *   No new AI, no new template store, no machine translation, no
 *   second Live Window. It composes exactly two existing things: SA-1's
 *   contracts (structure/validation) and Phase 4's CozyLanguageRealize
 *   seam (the intro-sentence lookup only — never the claim content
 *   itself, which always comes from real evidence). It does not decide
 *   goal/entity/claims (SA-3's job) and does not decide whether a
 *   candidate is good enough to show a user (SA-5's job).
 *
 * GENERATIVE_OFFLINE EXTENSION (real, opt-in only — default unchanged)
 *   realizeCandidateSentence() above is untouched: every existing caller
 *   still gets exactly GENERATION_MODE "COMPOSED", byte-for-byte. A NEW,
 *   separate, opt-in entry point — realizeCandidateSentenceGenerative()
 *   — exists alongside it for callers that explicitly pass
 *   {generative:{enabled:true, provider}}. When taken, it builds a
 *   grounded prompt from the SAME real evidence pieces (never free-form)
 *   and calls a real local model (generation/offline-generation-
 *   provider.js — @wllama/wllama, llama.cpp compiled to WASM, running
 *   INSIDE the browser page, zero network once loaded) to genuinely
 *   construct new wording — SA-1's own pre-existing "MODEL_GENERATED"
 *   enum value, never invented here. A NEW candidate.generation.realizationMode
 *   field (GENERATIVE_OFFLINE / COMPOSED_FALLBACK / UNAVAILABLE) records,
 *   honestly and internally-testably, which actually happened; on any
 *   failure the text falls back to the IDENTICAL COMPOSED output the
 *   default path would have produced — never worse, never silently
 *   mislabeled.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa4";
    if (window.CozyOS.Modules["language-realizer"]) return;

    let nextPlanIdSeq = 1;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * generatePlanId(plan) — CandidateSentence.sourcePlanId must
     * reference the plan it was realized from, but SA-1's
     * SemanticAnswerPlanContract deliberately carries no `id` field of
     * its own (a plan is a value, not a stored entity — see that
     * contract's own header). This synthesizes a real, disclosed,
     * human-readable reference tag from the plan's own real fields
     * (goal + entity + a monotonic sequence, never a random/opaque id)
     * — good enough to trace a candidate back to what produced it in
     * diagnostics/logs, never treated as a stored, durable identifier.
     */
    function generatePlanId(plan) {
        const entityPart = (plan.entity && isNonEmptyString(plan.entity.value)) ? plan.entity.value : "unknown-entity";
        return `plan:${plan.goal}:${entityPart}:${nextPlanIdSeq++}`;
    }

    function realizeSeam() {
        const c = window.CozyOS;
        return c && c.CozyLanguageRealize;
    }

    /**
     * collectRealizablePieces(plan, evidenceById, language)
     *   Extracted, UNCHANGED-BEHAVIOR helper (pure refactor — the exact
     *   loop that used to live inline in realizeCandidateSentence()
     *   below) so the new, opt-in generative path (
     *   realizeCandidateSentenceGenerative()) can gather the SAME real,
     *   claim-ordered, language-filtered evidence pieces the COMPOSED
     *   path already does, rather than re-deriving (and risking
     *   diverging from) that logic. Returns {pieces, usedEvidenceIds} —
     *   both empty when nothing is realizable, exactly as before.
     */
    function collectRealizablePieces(plan, evidenceById, language) {
        const pieces = [];
        const usedEvidenceIds = [];
        for (const claim of plan.claims) {
            const ev = (claim.evidenceIds || []).map((id) => evidenceById.get(id)).find(Boolean);
            if (!ev) continue; // honest skip — no matching evidence record was supplied for this claim
            if (isNonEmptyString(ev.language) && ev.language !== language) continue; // honest skip — defense in depth, see file header
            if (!isNonEmptyString(ev.claim)) continue;
            pieces.push(ev.claim);
            usedEvidenceIds.push(ev.id);
        }
        return { pieces, usedEvidenceIds };
    }

    // Real, disclosed, fixed per-goal question framings used ONLY to give
    // the generative model (SA-4 extension — see generation/offline-
    // generation-provider.js) a natural instruction to answer FROM the
    // real evidence pieces below — never shown to a user, never itself a
    // source of facts. A goal this map doesn't cover gets the honest
    // generic framing; this is prompt scaffolding, not a new knowledge
    // authority (compare introFor()'s own per-goal intro sentences, the
    // SAME discipline applied to instruction-framing instead of output
    // wording).
    const GENERATIVE_GOAL_QUESTION = Object.freeze({
        HUMAN_BENEFIT: (name) => `How does ${name} help people?`,
        BENEFITS: (name) => `What are the benefits of ${name}?`,
        CAPABILITY: (name) => `What can ${name} do?`,
        UNDERSTAND_CAPABILITIES: (name) => `What can ${name} do?`,
        IMPORTANCE: (name) => `Why is ${name} important?`,
        VALUE: (name) => `What value does ${name} provide?`,
        PRACTICAL_WORK_CONTRIBUTION: (name) => `How does ${name} contribute to real work?`,
        DIFFERENTIATION: (name) => `What makes ${name} different?`,
        DEFINITION: (name) => `What is ${name}?`,
        UNDERSTAND_ENTITY: (name) => `What is ${name}?`,
        UNDERSTAND_USEFULNESS: (name) => `How is ${name} useful?`,
        UNDERSTAND_USEFULNESS_BEFORE_PURCHASE: (name) => `How is ${name} useful?`,
        LIST: (name) => `List the relevant items about ${name}.`,
        HOW_TO: (name) => `How do you use ${name}?`,
    });

    function generativeQuestionHint(goal, entityName) {
        const name = isNonEmptyString(entityName) ? entityName : "this";
        const framer = GENERATIVE_GOAL_QUESTION[goal];
        return framer ? framer(name) : `Tell me about ${name}.`;
    }

    /**
     * buildGenerativePrompt(pieces, goal, language, entityName)
     *   Real, grounded prompt construction — the ONLY facts the model is
     *   ever given are `pieces` (the SAME real, already-VERIFIED evidence
     *   claim sentences collectRealizablePieces() gathered — never
     *   free-form, never re-derived). The system instruction explicitly
     *   forbids adding facts not listed and fixes the target language by
     *   its real languageId (e.g. "sw"/"en") — SA-4's own composition
     *   discipline (see this file's header) extended to a generative
     *   path instead of a template join.
     */
    function buildGenerativePrompt(pieces, goal, language, entityName) {
        const languageNote = language === "en"
            ? "Respond in English."
            : `Respond only in the language with ISO code "${language}" — do not switch to English.`;
        const factLines = pieces.map((p, i) => `${i + 1}. ${p.trim()}`).join("\n");
        const question = generativeQuestionHint(goal, entityName);
        return [
            {
                role: "system",
                content: "You are CozyOS's assistant. Answer using ONLY the numbered facts you are given. "
                    + "Do not invent, assume, or add any fact that is not listed. Write ONE short, natural, "
                    + "fluent answer that uses every fact. " + languageNote,
            },
            {
                role: "user",
                content: `Question: ${question}\nFacts:\n${factLines}\nAnswer:`,
            },
        ];
    }

    /**
     * introFor(goal, language, entityName)
     *   Real, disclosed, composed via the existing Phase 4 seam. null
     *   when no intro exists for this goal (e.g. DEFINITION with a
     *   single claim needs none) or the seam/key isn't available —
     *   callers must degrade honestly, never fabricate an intro.
     *   `entityName` (optional, the plan's own real plan.entity.value —
     *   see the one real call site below) is passed straight through as
     *   a realize() param: PRE-EXISTING-FAILURE-REGISTER.md §3.5's
     *   fix — the templates now name the real entity being discussed
     *   instead of a generic "this"/"hii" when one is genuinely known,
     *   and fall back to the exact original generic wording when it
     *   isn't (entityName omitted or empty).
     */
    function introFor(goal, language, entityName) {
        const seam = realizeSeam();
        if (!seam) return null;
        return seam.realize(`semantic-answer:intro:${goal}`, language, entityName) || null;
    }

    /**
     * composeClaims(pieces, goal, language, entityName, detailLevel)
     *   Real COMPOSED-mode construction: a single claim is returned
     *   verbatim (it is already a real, complete, human-authored
     *   sentence in the target language — adding an intro would only
     *   dilute it). Multiple claims get a real, disclosed per-goal intro
     *   (see introFor()) followed by each claim sentence.
     *
     *   PAA-4 addition — detailLevel (SA-1's own pre-existing, previously
     *   unused optional plan field; no contract change) only ever
     *   changes HOW multiple pieces are JOINED, never WHICH pieces or
     *   what they say (still zero new wording, still GENERATION_MODE
     *   "COMPOSED"): "DEEP_EXPLANATION" joins them as a real bullet list
     *   (one already-verified sentence per line) instead of a run-on,
     *   period-joined paragraph — because SA-3's own DEEP_EXPLANATION
     *   claims are already pre-composed "Topic — explanation. Benefit:
     *   ..." units (see cozy-knowledge-registry.js's `benefitAreas`
     *   field), which read naturally as list items, not as a paragraph.
     *   Every other detailLevel (including undefined, the default)
     *   reproduces the exact prior period-joined behavior, byte-for-byte.
     */
    function composeClaims(pieces, goal, language, entityName, detailLevel) {
        if (pieces.length === 1) return pieces[0];
        const intro = introFor(goal, language, entityName);
        if (detailLevel === "DEEP_EXPLANATION") {
            const bullets = pieces.map((p) => `\n• ${p.trim().replace(/\.+$/, "")}.`).join("");
            return intro ? `${intro}${bullets}` : bullets.trim();
        }
        const body = pieces.map((p) => p.trim().replace(/\.+$/, "")).join(". ") + ".";
        return intro ? `${intro} ${body}` : body;
    }

    /**
     * realizeCandidateSentence(request, {attempt})
     *   The real, public SA-4 entry point. `request` must already be a
     *   real cozy.language-realization-request.v1 object (built via
     *   LanguageRealizationRequestContract.create({language, semanticPlan,
     *   evidence}) by the caller — this file never builds its own
     *   request; SA-7 is responsible for that composition). Re-validates
     *   defensively (never trusts a caller-supplied shape blindly) before
     *   doing any real work. Never throws.
     */
    function realizeCandidateSentence(request, options = {}) {
        const reqContract = window.CozyOS.LanguageRealizationRequestContract;
        if (reqContract && typeof reqContract.validate === "function") {
            const v = reqContract.validate(request);
            if (!v.valid) return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: v.errors };
        } else if (!request || typeof request !== "object") {
            return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: ["request must be a real object."] };
        }

        const plan = request.semanticPlan;
        const language = request.language.languageId;
        const attempt = (Number.isInteger(options.attempt) && options.attempt > 0) ? options.attempt : 1;

        const evidenceById = new Map();
        for (const ev of request.evidence || []) { if (ev && ev.id) evidenceById.set(ev.id, ev); }

        // Zero-claim plans (CLARIFICATION/UNKNOWN — SA-1's own only
        // allowed zero-claim goals). No evidence to construct from by
        // definition; compose an honest, real, already-existing
        // disclosure via the seam rather than inventing new copy here.
        if (!Array.isArray(plan.claims) || plan.claims.length === 0) {
            const seam = realizeSeam();
            const clarificationQuestion = plan.conversationContext && isNonEmptyString(plan.conversationContext.clarificationQuestion)
                ? plan.conversationContext.clarificationQuestion : null;
            const text = clarificationQuestion
                || (seam && seam.realize(plan.goal === "CLARIFICATION" ? "unsupported-clarify" : "unsupported", language))
                || (seam && seam.realize("unsupported", language));
            if (!isNonEmptyString(text)) return { success: false, reason: "NO_REALIZABLE_CONTENT", errors: ["No clarification question and the realize seam is not loaded."] };
            const built = buildCandidate({ text, language, plan, evidenceIds: [], attempt });
            return built;
        }

        const { pieces, usedEvidenceIds } = collectRealizablePieces(plan, evidenceById, language);

        if (pieces.length === 0) {
            const seam = realizeSeam();
            const fallback = seam && seam.realize("semantic-answer:no-realizable-evidence", language);
            return {
                success: false, reason: "NO_REALIZABLE_EVIDENCE_IN_LANGUAGE",
                honestFallbackText: fallback || null,
            };
        }

        // PRE-EXISTING-FAILURE-REGISTER.md §3.5 fix — the SAME real
        // plan.entity.value already read by generatePlanId() below,
        // reused (not re-derived) so the intro can honestly name what
        // the plan is actually about when SA-3 resolved a real entity.
        const entityName = (plan.entity && isNonEmptyString(plan.entity.value)) ? plan.entity.value : null;
        const text = composeClaims(pieces, plan.goal, language, entityName, plan.detailLevel);
        return buildCandidate({ text, language, plan, evidenceIds: usedEvidenceIds, attempt });
    }

    /**
     * buildCandidate({text, language, plan, evidenceIds, attempt, mode,
     *                 provider, realizationMode})
     *   `mode`/`provider`/`realizationMode` are NEW, additive, optional
     *   overrides — every existing call site (this file's own sync
     *   realizeCandidateSentence(), every pre-existing caller/test) omits
     *   them and gets EXACTLY the prior generation shape
     *   ({mode:"COMPOSED", provider:"language-realizer"}, no
     *   realizationMode key at all) — byte-for-byte unchanged.
     *   `realizationMode` (GENERATIVE_OFFLINE / COMPOSED_FALLBACK /
     *   UNAVAILABLE) is the new, real, internally-testable state the
     *   generative path (realizeCandidateSentenceGenerative() below)
     *   sets; CandidateSentenceContract.validate() does not reject
     *   unknown extra fields, so this is safe to add without touching
     *   that contract's own fixed GENERATION_MODE enum.
     */
    function buildCandidate({ text, language, plan, evidenceIds, attempt, mode, provider, realizationMode }) {
        const contract = window.CozyOS.CandidateSentenceContract;
        const generation = { mode: mode || "COMPOSED", provider: provider || "language-realizer", attempt };
        if (isNonEmptyString(realizationMode)) generation.realizationMode = realizationMode;
        const fields = {
            text, language,
            sourcePlanId: generatePlanId(plan),
            evidenceIds,
            generation,
        };
        if (contract && typeof contract.create === "function") {
            const built = contract.create(fields);
            return built.success ? { success: true, candidate: built.candidate } : { success: false, reason: "CANDIDATE_CONTRACT_VALIDATION_FAILED", errors: built.errors };
        }
        return { success: true, candidate: Object.assign({ schemaVersion: "cozy.candidate-sentence.v1" }, fields) };
    }

    /**
     * realizeCandidateSentenceGenerative(request, {attempt, generative})
     *   SA-4 EXTENSION — real, opt-in ONLY. `generative` must be
     *   {enabled:true, provider} (an object exposing an async
     *   `generate({messages, maxTokens, temperature})`, e.g.
     *   window.CozyOS.OfflineGenerationProvider) or this function is a
     *   pure passthrough to the SAME synchronous realizeCandidateSentence()
     *   above — every caller that does not explicitly ask for generation
     *   gets the EXACT existing COMPOSED behavior, unchanged.
     *
     *   When generation IS requested and there is real evidence to
     *   construct from, this: (1) builds a grounded prompt from the SAME
     *   real evidence pieces the COMPOSED path would have joined
     *   (buildGenerativePrompt() — never free-form), (2) calls the
     *   supplied provider, bounded by a real timeout (never hangs), (3)
     *   on genuine success, returns a candidate with generation.mode
     *   "MODEL_GENERATED" (SA-1's own pre-existing enum value — this file
     *   is simply the first to use it) and realizationMode
     *   "GENERATIVE_OFFLINE", (4) on ANY failure (provider unavailable,
     *   timeout, inference error, empty output), falls back to the
     *   IDENTICAL COMPOSED text composeClaims() would have produced,
     *   tagged realizationMode "UNAVAILABLE" (provider/model never
     *   usable) or "COMPOSED_FALLBACK" (provider was invoked but this
     *   specific attempt failed) — the user-visible text is never worse
     *   than the existing default, only ever the same or a genuinely new
     *   sentence. Zero-claim plans and NO_REALIZABLE_EVIDENCE_IN_LANGUAGE
     *   are honest degrades identical to the sync function (nothing to
     *   generate FROM by definition) — delegated straight to it.
     */
    async function realizeCandidateSentenceGenerative(request, options = {}) {
        const genConfig = options.generative;
        if (!genConfig || genConfig.enabled !== true || !genConfig.provider || typeof genConfig.provider.generate !== "function") {
            return realizeCandidateSentence(request, options);
        }

        const reqContract = window.CozyOS.LanguageRealizationRequestContract;
        if (reqContract && typeof reqContract.validate === "function") {
            const v = reqContract.validate(request);
            if (!v.valid) return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: v.errors };
        } else if (!request || typeof request !== "object") {
            return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: ["request must be a real object."] };
        }

        const plan = request.semanticPlan;
        const language = request.language.languageId;
        const attempt = (Number.isInteger(options.attempt) && options.attempt > 0) ? options.attempt : 1;

        if (!Array.isArray(plan.claims) || plan.claims.length === 0) {
            return realizeCandidateSentence(request, options); // zero-claim: nothing to generate from — same honest disclosure as COMPOSED
        }

        const evidenceById = new Map();
        for (const ev of request.evidence || []) { if (ev && ev.id) evidenceById.set(ev.id, ev); }
        const { pieces, usedEvidenceIds } = collectRealizablePieces(plan, evidenceById, language);

        if (pieces.length === 0) {
            return realizeCandidateSentence(request, options); // NO_REALIZABLE_EVIDENCE_IN_LANGUAGE — identical to COMPOSED, nothing to generate from
        }

        const entityName = (plan.entity && isNonEmptyString(plan.entity.value)) ? plan.entity.value : null;
        const composedFallbackText = composeClaims(pieces, plan.goal, language, entityName, plan.detailLevel);

        const timeoutMs = Number.isInteger(genConfig.timeoutMs) && genConfig.timeoutMs > 0 ? genConfig.timeoutMs : 30000;
        const messages = buildGenerativePrompt(pieces, plan.goal, language, entityName);

        let genResult = null;
        try {
            genResult = await Promise.race([
                genConfig.provider.generate({ messages, maxTokens: genConfig.maxTokens, temperature: genConfig.temperature }),
                new Promise((resolve) => setTimeout(() => resolve({ available: true, success: false, reason: "GENERATION_TIMEOUT" }), timeoutMs)),
            ]);
        } catch (_err) {
            genResult = { available: true, success: false, reason: "GENERATION_THREW" };
        }

        if (!genResult || genResult.available === false) {
            return buildCandidate({ text: composedFallbackText, language, plan, evidenceIds: usedEvidenceIds, attempt, realizationMode: "UNAVAILABLE" });
        }
        if (!genResult.success || !isNonEmptyString(genResult.text)) {
            return buildCandidate({ text: composedFallbackText, language, plan, evidenceIds: usedEvidenceIds, attempt, realizationMode: "COMPOSED_FALLBACK" });
        }

        return buildCandidate({
            text: genResult.text, language, plan, evidenceIds: usedEvidenceIds, attempt,
            mode: "MODEL_GENERATED", provider: genConfig.providerName || "offline-generation-provider",
            realizationMode: "GENERATIVE_OFFLINE",
        });
    }

    const LanguageRealizer = Object.freeze({
        realizeCandidateSentence, realizeCandidateSentenceGenerative,
        introFor, composeClaims, generatePlanId, buildGenerativePrompt,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageRealizer = LanguageRealizer;
    window.CozyOS.Modules["language-realizer"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-4 — Language Realizer (\"Cozy Construction Sentence\" realization). Constructs a real cozy.candidate-sentence.v1 directly in the target language from a validated LanguageRealizationRequest's real claims + real, already-target-language VerifiedEvidence — never English-generated-then-translated, never a stored-answer lookup. realizeCandidateSentence() (default, every existing caller) composes SA-1's contracts and Phase 4's CozyLanguageRealize seam (intro sentences only, never claim content) — no new AI, no new template store, no machine translation — GENERATION_MODE is always COMPOSED, byte-for-byte unchanged. realizeCandidateSentenceGenerative() is a NEW, separate, opt-in-only entry point (generative.enabled:true + a provider, e.g. window.CozyOS.OfflineGenerationProvider) that builds a grounded prompt from the SAME real evidence pieces and runs a real local model (in-browser @wllama/wllama WASM) to genuinely construct new wording, tagged generation.mode MODEL_GENERATED + a new generation.realizationMode (GENERATIVE_OFFLINE/COMPOSED_FALLBACK/UNAVAILABLE); on any failure it falls back to the identical COMPOSED text. Not called by any existing caller unless it explicitly opts in."
    });
})();
