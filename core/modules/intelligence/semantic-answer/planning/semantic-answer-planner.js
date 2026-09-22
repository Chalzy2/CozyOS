/**
 * CozyAI — Semantic Answer Planner (SA-3)
 * File Reference: core/modules/intelligence/semantic-answer/planning/semantic-answer-planner.js
 *
 * WHAT THIS IS
 *   Converts a real, interpreted user question into a real
 *   cozy.semantic-answer-plan.v1 object (SA-1's SemanticAnswerPlanContract),
 *   backed only by real cozy.verified-evidence.v1 records (SA-2's
 *   VerifiedEvidenceAdapter). This is the file where
 *   window.CozyOS.SemanticIntentEngine.analyze() (Phase 6, core/living/
 *   cozy-ai-semantic-intent.js) FINALLY becomes operational as a real
 *   answer-planning input, rather than a computed-but-unused result —
 *   exactly the gap the SA-1/SA-2 implementation map's own audit named.
 *
 * SA-3 SCOPE — PLANNING ONLY, NOT GENERATION
 *   This file answers WHAT should be communicated (a goal, an entity,
 *   and a set of claims each grounded in a real evidence id) — never
 *   HOW it should be worded. It has NO knowledge of sentence
 *   construction, translation, TTS, Live Window, or CozyBuilder. A
 *   claim's `text` field is the real, underlying fact text an evidence
 *   record already carries (SA-2's own `evidence.claim`) — this is the
 *   MEANING being asserted, not a chosen final response. The language
 *   realizer (SA-4, not built here) is what will construct an actual
 *   natural sentence FROM a plan's claims + their evidence, per goal
 *   and target language — it does not yet exist, and this file never
 *   pretends otherwise: `planAnswer()` returns a PLAN, never an answer
 *   string, and there is no `answer`/`response`/`text` field anywhere
 *   on its return value's `plan`.
 *
 * PER EXPLICIT PROJECT GUARDRAIL (do not lose this — carried over from
 * SA-1/SA-2's own headers)
 *   A committed `humanBenefits`/`humanBenefitsSw` array item becomes ONE
 *   claim (referencing its own real evidence id) among potentially many
 *   on a plan — never THE single chosen final answer. Selecting exactly
 *   one such string per (goal, language) and returning it as "the
 *   answer" would recreate stored-answer retrieval with extra steps;
 *   this file structurally cannot do that, because it never emits
 *   anything but a real SemanticAnswerPlan (validated against SA-1's
 *   own contract before ever being returned).
 *
 * GOAL RESOLUTION — two real, disclosed layers, never a third intent
 * engine
 *   1. PRIMARY: window.CozyOS.SemanticIntentEngine.analyze() — the
 *      real, existing, versioned intent/goal/entity/ambiguity/
 *      confidence authority. Its own `goal` (from its real, internal
 *      GOAL_MAP) is refined, where a real, disclosed correspondence
 *      exists, into the Semantic Answer Construction spec's own
 *      required goal vocabulary (INTENT_TO_INFO_GOAL below) — e.g. its
 *      APP_BENEFITS intent (goal UNDERSTAND_USEFULNESS) refines to this
 *      spec's HUMAN_BENEFIT. When no such refinement exists, the
 *      engine's own raw goal is used as-is (SA-1's GOAL enum already
 *      contains every real SemanticIntentEngine GOAL_MAP value
 *      verbatim, by design).
 *   2. SUPPLEMENTARY (this file's own, small, disclosed addition): only
 *      ever consulted when SemanticIntentEngine itself found NOTHING
 *      (`goal === null`, which its own code always pairs with
 *      `ambiguity.clarificationRequired === true` — confirmed by
 *      reading analyze()'s real branches before writing this). This
 *      layer recognizes a small, disclosed, versioned set of additional
 *      trigger patterns for goals SemanticIntentEngine's own ontology
 *      has no distinct intent for yet (IMPORTANCE/VALUE/
 *      PRACTICAL_WORK_CONTRIBUTION/DIFFERENTIATION), directly closing
 *      the real, named gap in the project brief's own three-phrasing
 *      example ("ChurchOS inasaidiaje mtu?" / "ChurchOS ina umuhimu
 *      gani kwa watu?" / "Mtu anafaidikaje na ChurchOS?"). This is NOT a
 *      second intent-classification engine — it never touches entity
 *      resolution, language detection, or ambiguity logic (all still
 *      exclusively SemanticIntentEngine's job) and only ever fires as a
 *      narrow fallback when the real engine's own real ontology has
 *      nothing to say. When it also finds nothing, the plan honestly
 *      becomes CLARIFICATION (or UNKNOWN), never a guess.
 *
 * EVIDENCE — exclusively via SA-2's real VerifiedEvidenceAdapter. This
 * file never reads CozyKnowledge/CozyMemory directly and never
 * duplicates SA-2's own authorization/provenance logic.
 *
 * SA-3 EXTENSION — COGNITIVE SEMANTIC PLANNING INTEGRATION (added without
 * removing or restarting anything above)
 *   Cognitive-architecture audit performed before writing this extension
 *   (read the real source of every file named below, not just grepped
 *   for it — full findings kept in this session's audit transcript, not
 *   duplicated here). Summary of what that audit found and how this
 *   file responds to it:
 *
 *   - CognitiveCoordinator.run() / CozyInterpretation / CozyThinking /
 *     CozyReasoning / PolicyDecisionEngine: real, `<script>`-included,
 *     genuinely invoked on every live Live Window turn — but
 *     Interpretation/Thinking/Reasoning have ZERO registered providers
 *     anywhere in this repository (confirmed by the repo's own
 *     cozy-intelligence-provider.js disclosure and by grep), so they
 *     always execute as `isReal:false` in production today. This file
 *     deliberately does NOT register itself as a provider for any of
 *     them — doing so would be new, live, production wiring (every
 *     `CognitiveCoordinator.run()` call on every real Live Window turn
 *     would immediately start invoking this planner), which is exactly
 *     the kind of canonical-selector-adjacent change §25/§26 of the
 *     project brief says to STOP and report rather than perform inside
 *     SA-3. Reserved for SA-7 (Live Window Integration), with explicit
 *     approval, per the phase plan.
 *   - The real, live answer chain is `#send()` (core/living/
 *     cozy-living-assistant.js) -> `LivingAI.think()` (resolves to
 *     rule-based-conversational-provider.js, the currently-active
 *     provider) for intent/navigation/conversationState, and,
 *     separately, `CozyAnswerEngine.answer()` -> `CozyAdvisor.advise()`
 *     for the actual reply text. CozyAnswerEngine's real `responseMode`
 *     enum is FACT/EXPLANATION/WHY_REASONING/COMPARISON/
 *     INSUFFICIENT_EVIDENCE — genuinely has no "clarification" or
 *     "ambiguity" concept anywhere in that chain today. This file does
 *     not modify CozyAnswerEngine, CozyAdvisor, CozyIdentityFAQRouter,
 *     or `#send()` — see the "existing canonical selector compatibility"
 *     test in this module's test suite, which only proves the new
 *     vocabulary below does not collide with that real, live enum; it
 *     does not wire the two together (that is explicitly SA-7's job).
 *   - Conversation state: the real, live per-turn shape, produced by
 *     rule-based-conversational-provider.js and held in
 *     cozy-living-assistant.js's own private `#conversationState`
 *     field, is exactly `{lastIntent, lastApplication,
 *     lastDiscussedApplication, lastLanguage}`. `planAnswer()` below
 *     accepts an optional `conversationState` parameter in that EXACT
 *     shape (field names verbatim) rather than inventing a new context
 *     object — see resolveContextualEntity() below.
 *   - Memory: SA-2's CozyMemoryEvidenceAdapter (real, tested — 23 tests
 *     of its own, including org/support isolation) is available but
 *     intentionally NOT called by any goal in GOAL_FIELD_MAP today —
 *     no real v1 goal in this planner needs personal/organizational
 *     memory as evidence yet, and adding one with no real driving
 *     scenario would be inventing an untested capability. Memory
 *     relevance/isolation is already proven at the adapter layer;
 *     wiring a memory-backed goal into this planner is deferred to a
 *     later, explicitly-approved phase once a real goal needs it.
 *   - Authorization: no single canonical "authorization context"
 *     object exists in this repository (confirmed by the audit —
 *     `CozyAI.getContext()` is the closest real equivalent, but it is
 *     question-scoped, not a reusable object). This file invents
 *     nothing new here either: SA-2's adapters already take
 *     `{actorId, organizationId}` and perform every real authorization
 *     check themselves; this file never re-derives or second-guesses
 *     that.
 *
 * COGNITIVE DECISION VOCABULARY — see contracts/cognitive-decision-
 * contract.js (LIF-1). `planAnswer()`'s diagnostics now includes a real
 * `cognitiveStatus` (one of that contract's PLAN_STATUS values) alongside
 * every outcome — success or failure — so a caller (or a future
 * realizer/repair loop) can distinguish AMBIGUOUS from INSUFFICIENT_
 * EVIDENCE from EVIDENCE_CONFLICT from LANGUAGE_GAP from ACTION_REQUIRED
 * rather than treating every non-DIRECT outcome as one undifferentiated
 * failure. This is classification of the EXISTING outcome shapes below —
 * it adds no new evidence source, no translation, no learning.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.2.0-cml";
    if (window.CozyOS.Modules["semantic-answer-planner"]) return;

    /**
     * INTENT_TO_INFO_GOAL — real, disclosed refinement from
     * SemanticIntentEngine's own primaryIntent to this spec's required
     * information-goal vocabulary. Only intents with a clean, honest
     * correspondence are listed; every other real intent's own raw
     * GOAL_MAP value is used unmodified (see resolveGoal() below).
     */
    const INTENT_TO_INFO_GOAL = Object.freeze({
        APP_BENEFITS: "HUMAN_BENEFIT",
        APP_CAPABILITIES: "CAPABILITY",
        CAPABILITY_QUERY: "CAPABILITY",
        APP_IDENTITY: "DEFINITION",
        APP_COMPARISON: "COMPARISON",
    });

    /**
     * SUPPLEMENTARY_GOAL_PATTERNS — this file's own, narrow, disclosed
     * fallback (see this file's own header, "GOAL RESOLUTION" §2).
     * Kiswahili entries use bare substring matching (no leading `\b`)
     * for verb STEMS deliberately — Kiswahili subject/tense prefixes
     * fuse onto the stem with no space ("anafaidikaje" = ana+faidika+je,
     * "inachangiaje" = ina+changia+je), so a leading word-boundary would
     * never match a real, natural conjugated form. Noun-form entries
     * (umuhimu, thamani, tofauti) keep `\b` on both sides since they are
     * not conjugated.
     */
    const SUPPLEMENTARY_GOAL_PATTERNS = Object.freeze({
        HUMAN_BENEFIT: { sw: [/\bumuhimu\b/i, /faidika/i], en: [/\bimportant\b/i, /\bbenefit(?:s|ed|ing)?\b/i] },
        PRACTICAL_WORK_CONTRIBUTION: { sw: [/changia/i, /\bmchango\b/i], en: [/\bcontribut(?:e|es|ion|ing)\b.*\bwork\b/i, /\bhelps?\s+with\s+(?:our|my|the|daily)\s+work\b/i] },
        DIFFERENTIATION: { sw: [/\btofauti\s+na\b/i], en: [/\bdifferen(?:t|ce)s?\s+from\b/i, /\bdiffers?\s+from\b/i] },
        VALUE: { sw: [/\bthamani\b/i], en: [/\bworth\s+it\b/i, /\bvalue\b/i] },
    });

    /**
     * GOAL_FIELD_MAP — real, disclosed correspondence between a
     * required information goal and the real CozyKnowledge
     * APPLICATION_HUMAN_PURPOSE_DATA substance field(s) it draws
     * evidence from (see SA-2's cozy-knowledge-adapter.js for the real
     * field list: humanPurpose/realLifeProblems/whoBenefits/
     * humanBenefits/currentVerifiedCapabilities). Several required
     * goals share the same real underlying field — the source data has
     * no finer distinction than this today (e.g. IMPORTANCE/VALUE/
     * PRACTICAL_WORK_CONTRIBUTION all draw from humanBenefits+
     * realLifeProblems) — disclosed here rather than invented as a
     * false precision. Goals with an empty array have no real,
     * evidence-backed source in this repository yet (see planAnswer()'s
     * own GOAL_NOT_YET_PLANNABLE / NO_EVIDENCE_AVAILABLE handling) —
     * honestly absent, not silently guessed.
     */
    const GOAL_FIELD_MAP = Object.freeze({
        HUMAN_BENEFIT: Object.freeze(["humanBenefits"]),
        BENEFITS: Object.freeze(["humanBenefits"]),
        CAPABILITY: Object.freeze(["currentVerifiedCapabilities"]),
        IMPORTANCE: Object.freeze(["humanBenefits", "realLifeProblems"]),
        VALUE: Object.freeze(["humanBenefits", "realLifeProblems"]),
        PRACTICAL_WORK_CONTRIBUTION: Object.freeze(["humanBenefits", "realLifeProblems"]),
        DEFINITION: Object.freeze(["humanPurpose"]),
        LIST: Object.freeze(["currentVerifiedCapabilities"]),
        COMPARISON: Object.freeze(["humanPurpose", "currentVerifiedCapabilities"]),
        // DIFFERENTIATION is handled specially (platform-level SYSTEM_FACT,
        // not a per-application field) — see planAnswer() below.
        DIFFERENTIATION: Object.freeze([]),
        HOW_TO: Object.freeze([]), // no real procedural-steps evidence source exists yet
        CLARIFICATION: Object.freeze([]),
        UNKNOWN: Object.freeze([]),
    });

    const GOAL_TO_ANSWER_MODE = Object.freeze({
        HUMAN_BENEFIT: "DIRECT_ANSWER", BENEFITS: "DIRECT_ANSWER", CAPABILITY: "DIRECT_ANSWER",
        IMPORTANCE: "DIRECT_ANSWER", VALUE: "DIRECT_ANSWER", PRACTICAL_WORK_CONTRIBUTION: "DIRECT_ANSWER",
        DEFINITION: "DIRECT_ANSWER", LIST: "LIST", COMPARISON: "COMPARISON", DIFFERENTIATION: "COMPARISON",
        HOW_TO: "HOW_TO_STEPS", CLARIFICATION: "CLARIFICATION_REQUEST", UNKNOWN: "REFUSAL",
    });

    /**
     * ACTION_GOALS — real SemanticIntentEngine GOAL_MAP values (SA-1's own
     * EXISTING_SEMANTIC_GOALS list, verbatim) that represent an ACTION
     * request rather than an information request. SA-3 does not plan or
     * execute actions (that already lives in rule-based-conversational-
     * provider.js's own nav-intent/action-recognition system, per the
     * cognitive audit) — recognizing one honestly as ACTION_REQUIRED is
     * a real, disclosed classification, never a silent "not yet
     * plannable" conflation with a genuine evidence gap.
     */
    const ACTION_GOALS = Object.freeze(["CREATE_REMINDER", "CANCEL_EXISTING_ITEM", "MODIFY_EXISTING_ITEM", "RESOLVE_PROBLEM", "DECLINE_ACTION"]);
    const ACTION_GOALS_SET = new Set(ACTION_GOALS);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /** matchSupplementaryGoal(text) — real, disclosed. Returns the first matching required goal, or null. */
    function matchSupplementaryGoal(text) {
        for (const goal of Object.keys(SUPPLEMENTARY_GOAL_PATTERNS)) {
            const patterns = SUPPLEMENTARY_GOAL_PATTERNS[goal];
            for (const lang of ["sw", "en"]) {
                for (const re of patterns[lang] || []) {
                    if (re.test(text)) return goal;
                }
            }
        }
        return null;
    }

    /**
     * resolveGoal(intentResult, normalizedText)
     *   Real. Returns {goal, goalSource, clarificationQuestion}.
     *   goalSource is one of "semantic-intent-engine" |
     *   "supplementary-pattern" | "clarification" | "unknown" — a real,
     *   disclosed provenance trail, never surfaced as part of the plan
     *   itself (SA-1's own schema has no such field) but returned
     *   alongside it for test/diagnostic visibility.
     */
    function resolveGoal(intentResult, normalizedText) {
        if (intentResult.goal) {
            const refined = INTENT_TO_INFO_GOAL[intentResult.primaryIntent] || intentResult.goal;
            return { goal: refined, goalSource: "semantic-intent-engine", clarificationQuestion: null };
        }
        // SemanticIntentEngine found nothing real (goal===null always
        // pairs with ambiguity.clarificationRequired===true — see this
        // file's own header). Try the narrow supplementary layer before
        // conceding to clarification.
        const supplementary = matchSupplementaryGoal(normalizedText);
        if (supplementary) return { goal: supplementary, goalSource: "supplementary-pattern", clarificationQuestion: null };

        if (intentResult.ambiguity && intentResult.ambiguity.clarificationRequired) {
            return { goal: "CLARIFICATION", goalSource: "clarification", clarificationQuestion: (intentResult.clarification && intentResult.clarification.question) || null };
        }
        return { goal: "UNKNOWN", goalSource: "unknown", clarificationQuestion: null };
    }

    /** pathMatchesField(path, field) — real, matches SA-2's own real evidence.source.path convention ("...​.<field>" or "...​.<field>Sw"). */
    function pathMatchesField(path, field) {
        return typeof path === "string" && (path.endsWith("." + field) || path.endsWith("." + field + "Sw"));
    }

    /**
     * gatherEvidenceForGoal(goal, entityValue, language)
     *   Real. Composes ONLY window.CozyOS.VerifiedEvidenceAdapter — this
     *   file never reads CozyKnowledge/CozyMemory itself. Returns the
     *   real, filtered VerifiedEvidence[] relevant to this (goal,
     *   entity) pair, per GOAL_FIELD_MAP. DIFFERENTIATION is special-
     *   cased to the real platform-level getDifferentiationFact() system
     *   fact (no per-application differentiation field exists in
     *   APPLICATION_HUMAN_PURPOSE_DATA today — see GOAL_FIELD_MAP's own
     *   comment).
     */
    function gatherEvidenceForGoal(goal, entityValue, language) {
        const adapter = window.CozyOS.VerifiedEvidenceAdapter;
        if (!adapter) return { success: false, evidence: [], errors: ["VerifiedEvidenceAdapter is not loaded."] };

        if (goal === "DIFFERENTIATION") {
            return adapter.collectSystemFactEvidence("getDifferentiationFact");
        }

        const fields = GOAL_FIELD_MAP[goal] || [];
        if (fields.length === 0) return { success: false, evidence: [], errors: [`No real evidence field is mapped for goal "${goal}" yet.`] };

        const result = adapter.collectApplicationHumanPurposeEvidence(entityValue, { languages: [language] });
        if (!result.success) return result;
        const filtered = result.evidence.filter((ev) => fields.some((f) => pathMatchesField(ev.source.path, f)));
        return { success: filtered.length > 0, evidence: filtered, errors: filtered.length > 0 ? [] : [`No real evidence found for goal "${goal}" / entity "${entityValue}" / language "${language}".`] };
    }

    /**
     * resolveContextualEntity(entityHint, intentResult, conversationState)
     *   Real context resolution, SA-3 EXTENSION §6-7. `intentResult` here
     *   was produced by SemanticIntentEngine.analyze() already GIVEN
     *   conversationState.lastDiscussedApplication as its own
     *   `previousEntity` (see planAnswer() below) — so the engine's own,
     *   real demonstrative-pronoun/carryover logic gets first chance to
     *   resolve a follow-up like "hiyo"/"yake". This function only
     *   supplies a SECOND, disclosed fallback: when the engine still
     *   found nothing (entity.value === null) AND the engine itself did
     *   NOT flag ambiguity for this turn, inherit
     *   conversationState.lastDiscussedApplication directly. The
     *   ambiguity guard is deliberate and load-bearing — SA-3 EXTENSION
     *   §7 requires "do not blindly inherit context"; when the real
     *   engine already signals uncertainty about this turn on its own
     *   (ambiguity.detected === true), context is never used to paper
     *   over that uncertainty.
     */
    function resolveContextualEntity(entityHint, intentResult, conversationState) {
        if (isNonEmptyString(entityHint)) return { entityValue: entityHint, entitySource: "explicit-hint" };
        if (isNonEmptyString(intentResult.entity.value)) {
            return { entityValue: intentResult.entity.value, entitySource: intentResult.entity.resolvedVia === "explicit" ? "engine-explicit" : "engine-context-carryover" };
        }
        const safeToInherit = !(intentResult.ambiguity && intentResult.ambiguity.detected);
        if (safeToInherit && conversationState && isNonEmptyString(conversationState.lastDiscussedApplication)) {
            return { entityValue: conversationState.lastDiscussedApplication, entitySource: "context-inherited" };
        }
        return { entityValue: null, entitySource: null };
    }

    /**
     * partitionEvidenceByAuthority(evidenceArray)
     *   Real, SA-3 EXTENSION §10/§20. Separates gathered evidence into
     *   `authoritative` (VerifiedEvidenceContract.isAuthoritative() —
     *   VERIFIED/CURATED/APPROVED, safe to assert as a claim),
     *   `conflicted` (verification.status === "CONFLICTED" — never
     *   silently chosen, see planAnswer()'s own handling below),
     *   `restricted` (structurally authoritative but NOT sensitivity
     *   "PUBLIC" — see WAVE 6 below), and `other` (UNVERIFIED/DEPRECATED —
     *   never used as a claim either). Every real evidence record SA-2's
     *   adapters produce today for the fields SA-3 maps (humanPurpose/
     *   humanBenefits/currentVerifiedCapabilities/realLifeProblems, never
     *   visionCapabilities) is already VERIFIED, so this is a real,
     *   wired safety net rather than a behavior change for today's real
     *   data — it exists so a future evidence source (SA-2 memory
     *   evidence is CURATED; a future LIF adapter could be UNVERIFIED/
     *   CONFLICTED) can never silently become an asserted claim.
     *
     *   WAVE 6 (privacy/visibility enforcement layer) — the audit that
     *   preceded this addition (PRE-EXISTING-FAILURE-REGISTER.md §7.1)
     *   found that every real VerifiedEvidence record ALREADY carries a
     *   required, disclosed `sensitivity` field (SA-1's own
     *   VerifiedEvidenceContract.SENSITIVITY enum —
     *   PUBLIC/ORGANIZATION/PRIVATE/ADMIN/SYSTEM/SECRET, already
     *   populated correctly by every real SA-2 adapter today), but no
     *   code anywhere in SA-3/SA-4/SA-5 ever actually READ it — today's
     *   real non-leakage is a side effect of every evidence source SA-3
     *   currently draws from (CozyKnowledge's APPLICATION_HUMAN_PURPOSE_
     *   DATA) defaulting to PUBLIC, not an enforced control. This is the
     *   minimal, reusable fix: a non-PUBLIC evidence record — structurally
     *   authoritative or not — is now NEVER placed in `authoritative`, so
     *   it can never become a plan claim, regardless of which evidence
     *   source it came from. No new classification taxonomy (reuses
     *   SA-1's own SENSITIVITY enum, unchanged), no new evidence field
     *   (every real evidence record already carries `sensitivity`), no
     *   new authorization/access-check system, no second AI/response
     *   engine/database. A future goal that legitimately needs
     *   non-PUBLIC evidence (e.g. a memory-backed goal drawing PRIVATE
     *   CozyMemory evidence for its own actor) is a real, separate,
     *   explicitly-approved design decision for whenever such a goal is
     *   actually built — this layer's job is only to make sure that
     *   never happens BY ACCIDENT, via GOAL_FIELD_MAP silently mapping a
     *   new goal onto a non-PUBLIC-only field, or a future evidence
     *   source starting to return non-PUBLIC records for a field that is
     *   already wired. Fails closed: a record with a missing or
     *   unrecognized sensitivity value is treated as non-PUBLIC (never
     *   promoted), never assumed safe by default.
     */
    function partitionEvidenceByAuthority(evidenceArray) {
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        const authoritative = [];
        const conflicted = [];
        const restricted = [];
        const other = [];
        for (const ev of evidenceArray) {
            const status = ev && ev.verification && ev.verification.status;
            const isPublic = !!ev && ev.sensitivity === "PUBLIC";
            if (status === "CONFLICTED") conflicted.push(ev);
            else if (evidenceContract && typeof evidenceContract.isAuthoritative === "function" && evidenceContract.isAuthoritative(ev)) {
                if (isPublic) authoritative.push(ev);
                else restricted.push(ev);
            }
            else other.push(ev);
        }
        return { authoritative, conflicted, restricted, other };
    }

    /**
     * detectLanguageGap({goal, entityValue, requestedLanguage, fields})
     *   Real, SA-3 EXTENSION §4-6 (LIF-2, "Language Gap Detection" —
     *   see ../LANGUAGE-INTELLIGENCE-FOUNDATION-ROADMAP.md). Distinguishes
     *   "no evidence exists for this goal/entity at all" from "evidence
     *   exists, just not in the requested language" — the latter is a
     *   real, disclosed LanguageGap (contracts/cognitive-decision-
     *   contract.js), never silently treated the same as total evidence
     *   absence, and never silently answered in the wrong language.
     *   Real, wired call to VerifiedEvidenceAdapter across both of this
     *   repository's real target languages (en/sw); today's real,
     *   committed APPLICATION_HUMAN_PURPOSE_DATA happens to be
     *   symmetric per application (see resolvePurposeForLanguage's own
     *   fail-closed rule in cozy-knowledge-registry.js — a whole fact is
     *   either fully mirrored or NOT_FOUND, never partially), so this
     *   path is not exercised by any real fixture today; its own test
     *   exercises the pure detection logic directly with a synthetic
     *   evidence set, matching this file's own "SA-3 does not implement
     *   real ingestion" boundary.
     */
    function detectLanguageGap({ goal, entityValue, requestedLanguage, fields }) {
        const adapter = window.CozyOS.VerifiedEvidenceAdapter;
        const cognitive = window.CozyOS.CognitiveDecisionContract;
        if (!adapter || !cognitive || !fields || fields.length === 0) return null;
        const broad = adapter.collectApplicationHumanPurposeEvidence(entityValue, { languages: ["en", "sw"] });
        if (!broad.success) return null;
        const relevant = broad.evidence.filter((ev) => fields.some((f) => pathMatchesField(ev.source.path, f)));
        const languagesWithEvidence = new Set(relevant.filter((ev) => isNonEmptyString(ev.language)).map((ev) => ev.language));
        const otherLanguages = [...languagesWithEvidence].filter((l) => l !== requestedLanguage);
        if (languagesWithEvidence.has(requestedLanguage) || otherLanguages.length === 0) return null;

        const built = cognitive.createLanguageGap({
            gapType: "TRANSLATION_GAP",
            language: requestedLanguage,
            domain: entityValue,
            concept: goal,
            evidenceSourcesConsidered: ["APPLICATION"],
            status: "OPEN",
            notes: `Real evidence exists in ${otherLanguages.join(", ")} for this goal/entity but not in "${requestedLanguage}".`,
        });
        return built.success ? built.gap : null;
    }

    /**
     * classifyCognitiveStatus(outcome)
     *   Real, SA-3 EXTENSION §26. Maps this file's own existing, real
     *   outcome shapes onto contracts/cognitive-decision-contract.js's
     *   PLAN_STATUS enum. Pure classification of behavior this file
     *   already has — adds no new decision logic of its own.
     */
    function classifyCognitiveStatus(outcome) {
        switch (outcome.kind) {
            case "clarification": return "CLARIFICATION_REQUIRED";
            case "unknown": return "UNKNOWN";
            case "action": return "ACTION_REQUIRED";
            case "no-entity": return "AMBIGUOUS";
            case "goal-not-plannable": return "UNKNOWN";
            case "language-gap": return "LANGUAGE_GAP";
            case "no-evidence": return "INSUFFICIENT_EVIDENCE";
            // WAVE 6 — reuses the existing INSUFFICIENT_EVIDENCE status
            // (no new PLAN_STATUS value added to the certified contract):
            // from the requester's perspective, no evidence it is
            // authorized to be told exists, which is what that status
            // honestly means. `reason: "RESTRICTED_EVIDENCE_ONLY"` on the
            // outer planAnswer() result (not this enum) is what keeps
            // this distinguishable from a genuine data-absence gap.
            case "restricted-evidence": return "INSUFFICIENT_EVIDENCE";
            case "evidence-conflict": return "EVIDENCE_CONFLICT";
            case "understood-with-conflict": return "EVIDENCE_CONFLICT";
            case "understood": return "UNDERSTOOD";
            default: return "UNKNOWN";
        }
    }

    /**
     * planAnswer({text, actorId, entityHint, previousEntity, requestedLanguage})
     *   The real, public entry point. Never throws — every failure path
     *   returns {success:false, reason, ...} instead. Never returns an
     *   invalid SemanticAnswerPlan — every real plan is built via
     *   SemanticAnswerPlanContract.create(), which independently
     *   validates it before this function ever returns it.
     *
     *   entityHint (same established convention as cozy-answer-
     *   engine.js's own entityHint / cozy-living-assistant.js's
     *   contextualEntityName) — takes priority over SemanticIntentEngine's
     *   own entity spotting, since that engine's real KNOWN_ENTITIES list
     *   (cozyos/churchos/shopos/quarryos only) does not cover every real
     *   application in APPLICATION_HUMAN_PURPOSE_DATA (e.g. MpesaOS,
     *   PharmacyOS) — a real, disclosed, pre-existing gap this file does
     *   not attempt to fix inside SemanticIntentEngine itself.
     *
     *   conversationState (SA-3 EXTENSION, optional) — the EXACT real
     *   shape cozy-living-assistant.js's own private `#conversationState`
     *   field carries: {lastIntent, lastApplication,
     *   lastDiscussedApplication, lastLanguage}. Used two ways: (1) as
     *   `previousEntity` fed into SemanticIntentEngine.analyze() itself
     *   (unless an explicit entityHint/previousEntity is already given),
     *   letting the real engine's own pronoun-carryover logic run first;
     *   (2) as resolveContextualEntity()'s own, narrower, disclosed
     *   fallback when the engine still found nothing. Never required —
     *   omitting it reproduces this file's pre-extension behavior
     *   exactly.
     */
    function planAnswer({ text, actorId = null, entityHint = null, previousEntity = null, requestedLanguage = null, conversationState = null } = {}) {
        const intentEngine = window.CozyOS.SemanticIntentEngine;
        if (!intentEngine || typeof intentEngine.analyze !== "function") {
            return { success: false, reason: "SEMANTIC_INTENT_ENGINE_NOT_LOADED", diagnostics: { cognitiveStatus: classifyCognitiveStatus({ kind: "unknown" }) } };
        }
        if (!isNonEmptyString(text)) return { success: false, reason: "EMPTY_INPUT", diagnostics: { cognitiveStatus: classifyCognitiveStatus({ kind: "unknown" }) } };

        const inheritedPreviousEntity = conversationState && isNonEmptyString(conversationState.lastDiscussedApplication) ? conversationState.lastDiscussedApplication : null;
        const intentResult = intentEngine.analyze(text, { previousEntity: entityHint || previousEntity || inheritedPreviousEntity || null });

        const { entityValue, entitySource } = resolveContextualEntity(entityHint, intentResult, conversationState);
        const language = requestedLanguage || intentResult.language;

        const { goal, goalSource, clarificationQuestion } = resolveGoal(intentResult, intentResult.normalizedText);

        if (goal === "CLARIFICATION" || goal === "UNKNOWN") {
            const kind = goal === "CLARIFICATION" ? "clarification" : "unknown";
            const built = window.CozyOS.SemanticAnswerPlanContract.create({
                goal,
                answerMode: GOAL_TO_ANSWER_MODE[goal],
                entity: { type: entityValue ? "application" : "unknown", value: entityValue || "unresolved" },
                claims: [],
                language,
                conversationContext: clarificationQuestion ? { clarificationQuestion } : undefined,
            });
            return built.success
                ? { success: true, plan: built.plan, diagnostics: { intentResult, goalSource, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind }) } }
                : { success: false, reason: "PLAN_CONTRACT_VALIDATION_FAILED", errors: built.errors };
        }

        if (ACTION_GOALS_SET.has(goal)) {
            return { success: false, reason: "ACTION_NOT_PLANNABLE_BY_SA3", goal, goalSource, diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "action" }) } };
        }

        if (!isNonEmptyString(entityValue)) {
            return { success: false, reason: "NO_ENTITY_RESOLVED", goal, goalSource, diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "no-entity" }) } };
        }

        if (!(goal in GOAL_FIELD_MAP) || (GOAL_FIELD_MAP[goal].length === 0 && goal !== "DIFFERENTIATION")) {
            return { success: false, reason: "GOAL_NOT_YET_PLANNABLE", goal, goalSource, diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "goal-not-plannable" }) } };
        }

        const evidenceResult = gatherEvidenceForGoal(goal, entityValue, language);
        const fields = goal === "DIFFERENTIATION" ? [] : (GOAL_FIELD_MAP[goal] || []);

        let sourceEvidence = evidenceResult.evidence;
        let learnedSupplementUsed = false;
        if (!evidenceResult.success || evidenceResult.evidence.length === 0) {
            // CML — real, disclosed, narrow supplementary evidence source,
            // same pattern as this file's own SUPPLEMENTARY_GOAL_PATTERNS:
            // only ever consulted when the primary, real CozyKnowledge-
            // backed evidence genuinely found nothing. Never overrides
            // real primary evidence when it exists. window.CozyOS.
            // LearningEvidenceSupplement (core/modules/learning/adapters/
            // learning-evidence-supplement.js) is optional and additive —
            // composes only VERIFIED, governed multimodal-learning
            // observations (never CANDIDATE/OBSERVED); when not loaded or
            // when it also finds nothing, behavior is byte-identical to
            // before this supplement existed (falls through to the real
            // detectLanguageGap()/NO_EVIDENCE_AVAILABLE paths below,
            // unchanged).
            const supplement = window.CozyOS.LearningEvidenceSupplement;
            if (supplement && typeof supplement.collectLearnedEvidence === "function") {
                const learned = supplement.collectLearnedEvidence({ goal, entityValue, language });
                if (learned && learned.success && Array.isArray(learned.evidence) && learned.evidence.length > 0) {
                    sourceEvidence = learned.evidence;
                    learnedSupplementUsed = true;
                }
            }
        }

        if (!learnedSupplementUsed && (!evidenceResult.success || evidenceResult.evidence.length === 0)) {
            const gap = detectLanguageGap({ goal, entityValue, requestedLanguage: language, fields });
            if (gap) {
                return { success: false, reason: "LANGUAGE_GAP", goal, goalSource, entity: entityValue, language, languageGap: gap, diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "language-gap" }) } };
            }
            return { success: false, reason: "NO_EVIDENCE_AVAILABLE", goal, goalSource, entity: entityValue, language, errors: evidenceResult.errors, diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "no-evidence" }) } };
        }

        const { authoritative, conflicted, restricted } = partitionEvidenceByAuthority(sourceEvidence);
        if (authoritative.length === 0 && restricted.length > 0) {
            // WAVE 6 — real, honest, distinct outcome: usable evidence
            // exists but is not PUBLIC, so it is never asserted. Never
            // conflated with EVIDENCE_CONFLICT (which means the evidence
            // itself disagrees, not that it is access-restricted) or
            // silently treated as if nothing were found at all.
            return { success: false, reason: "RESTRICTED_EVIDENCE_ONLY", goal, goalSource, entity: entityValue, language, restrictedEvidenceIds: restricted.map((ev) => ev.id), diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "restricted-evidence" }) } };
        }
        if (authoritative.length === 0) {
            return { success: false, reason: "EVIDENCE_CONFLICT", goal, goalSource, entity: entityValue, language, conflictedEvidenceIds: conflicted.map((ev) => ev.id), diagnostics: { intentResult, entitySource, cognitiveStatus: classifyCognitiveStatus({ kind: "evidence-conflict" }) } };
        }

        const claims = authoritative.map((ev, index) => ({
            claimId: `claim-${index}`,
            text: ev.claim,
            evidenceIds: [ev.id],
        }));

        const built = window.CozyOS.SemanticAnswerPlanContract.create({
            goal,
            answerMode: GOAL_TO_ANSWER_MODE[goal] || "DIRECT_ANSWER",
            entity: { type: "application", value: entityValue, canonicalValue: intentResult.entity.canonicalValue || entityValue },
            claims,
            language,
        });

        if (!built.success) return { success: false, reason: "PLAN_CONTRACT_VALIDATION_FAILED", errors: built.errors, diagnostics: { intentResult, entitySource } };

        const cognitiveStatus = classifyCognitiveStatus({ kind: conflicted.length > 0 ? "understood-with-conflict" : "understood" });
        return {
            success: true, plan: built.plan, evidence: authoritative,
            diagnostics: { intentResult, goalSource, entitySource, cognitiveStatus, learnedSupplementUsed, conflictedEvidenceIds: conflicted.length > 0 ? conflicted.map((ev) => ev.id) : undefined },
        };
    }

    const SemanticAnswerPlanner = Object.freeze({
        INTENT_TO_INFO_GOAL, SUPPLEMENTARY_GOAL_PATTERNS, GOAL_FIELD_MAP, GOAL_TO_ANSWER_MODE, ACTION_GOALS,
        resolveGoal, resolveContextualEntity, partitionEvidenceByAuthority, detectLanguageGap, classifyCognitiveStatus,
        planAnswer, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.SemanticAnswerPlanner = SemanticAnswerPlanner;
    window.CozyOS.Modules["semantic-answer-planner"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-3 — Semantic Answer Planner (+ SA-3 EXTENSION: cognitive context resolution, evidence-conflict handling, language-gap detection, action-vs-information classification, cognitiveStatus reporting via contracts/cognitive-decision-contract.js) (+ CML: an optional, narrow, disclosed window.CozyOS.LearningEvidenceSupplement fallback — real, governed, VERIFIED multimodal-learning evidence only, consulted only when the primary CozyKnowledge-backed evidence found nothing; diagnostics.learnedSupplementUsed reports when it fired). Wires the real, existing SemanticIntentEngine into an actual SemanticAnswerPlan, backed by real, authorized VerifiedEvidence from SA-2 (primary) and CML (supplementary). No sentence construction, no translation, no CognitiveCoordinator/CozyThinking/CozyReasoning/CozyInterpretation registration, no Live Window/TTS/CozyBuilder wiring. Not <script>-included by any page."
    });
})();
