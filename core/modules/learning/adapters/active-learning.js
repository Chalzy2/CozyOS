/**
 * CozyAI — Active Learning
 * File Reference: core/modules/learning/adapters/active-learning.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6.
 *
 * WHAT THIS IS
 *   "When CozyAI encounters an ambiguity that cannot safely be resolved,
 *   it may create a question for the user... Only ask when ambiguity is
 *   meaningful... governed by a confidence/utility threshold." This file
 *   is that governed gate plus the question/answer lifecycle. It never
 *   decides on its own that ambiguity exists — evaluateAmbiguity()
 *   requires a real conflict-detection.js CONFLICT record; it only adds
 *   the utility threshold on top (never ask over a single, isolated
 *   observation).
 *
 * THE ANSWER BECOMES EVIDENCE, NOT A SHORTCUT
 *   submitAnswer() below builds a real, governed MultimodalObservation
 *   via the existing MultimodalObservationAdapter.fromApplicationEvent()
 *   — the SAME entry point every other observation source uses — so a
 *   user's clarification answer must still pass through
 *   ObservationLifecycle like any other evidence; it is never silently
 *   promoted to VALIDATED/VERIFIED by this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const NAMESPACE = "learning-active-questions";
    // Every question record is a SHARED record: it may be created while
    // processing one contributor's observation and answered later by a
    // different real user (the person actually asked the question, e.g.
    // in the Live Window). CozyMemory's own real authorization model only
    // lets a record's original owner modify it again, so — exactly like
    // evidence-profile.js/conflict-detection.js's own fix for the same
    // issue — this shared record is always owned by a fixed system
    // identity; the real answering user's identity is preserved inside
    // the value itself (`answer.answeredBy`), never as the CozyMemory
    // record owner.
    const SYSTEM_ACTOR = "system";
    if (window.CozyOS.Modules["active-learning"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function memoryOrNull() {
        const memory = window.CozyOS.CozyMemory;
        return memory && typeof memory.saveMemory === "function" ? memory : null;
    }

    /**
     * evaluateAmbiguity({ conflict, profile, utilityThreshold })
     *   Real, disclosed gate. Requires an actual OPEN conflict-
     *   detection.js record (never invents ambiguity from nothing).
     *   "Meaningful" additionally requires the evidence-profile.js
     *   profile show either 2+ independent contributors OR at least
     *   `utilityThreshold` total occurrences — a single person's one-off
     *   phrasing is never enough to interrupt the user.
     */
    function evaluateAmbiguity({ conflict, profile, utilityThreshold = 3 } = {}) {
        if (!conflict || conflict.status !== "OPEN") return { shouldAsk: false, reason: "No real, open conflict exists." };
        const independentEnough = !!profile && Array.isArray(profile.independentContributors) && profile.independentContributors.length >= 2;
        const frequentEnough = !!profile && Array.isArray(profile.occurrences) && profile.occurrences.length >= utilityThreshold;
        if (!independentEnough && !frequentEnough) return { shouldAsk: false, reason: "Ambiguity is not yet meaningful (insufficient independent/repeated evidence)." };
        return { shouldAsk: true, reason: independentEnough ? "independent-contributor-threshold" : "occurrence-threshold" };
    }

    /**
     * createClarificationQuestion({ conflict, profile, options, utilityThreshold, actorId })
     *   Fails closed (AMBIGUITY_NOT_MEANINGFUL) unless evaluateAmbiguity()
     *   says shouldAsk. `options` are the real, disclosed candidate
     *   meanings — this file never invents an option; callers pass the
     *   real distinct meanings from the conflict record.
     */
    function createClarificationQuestion({ conflict, profile, options, utilityThreshold = 3, actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        const gate = evaluateAmbiguity({ conflict, profile, utilityThreshold });
        if (!gate.shouldAsk) return { success: false, reason: "AMBIGUITY_NOT_MEANINGFUL", detail: gate.reason };
        if (!Array.isArray(options) || options.length < 2) return { success: false, reason: "At least two real, distinct options are required." };

        const questionId = `question_${conflict.conflictId}_${Date.now()}`;
        const record = {
            questionId, term: conflict.term, language: conflict.language, conflictId: conflict.conflictId,
            options: options.slice(), status: "PENDING", createdAt: Date.now(),
        };
        memory.saveMemory(NAMESPACE, questionId, record, { owner: SYSTEM_ACTOR, actorId: SYSTEM_ACTOR, visibility: "public" });
        return { success: true, question: record };
    }

    /**
     * submitAnswer({ questionId, selectedOption, consent, actorId, sessionId, application })
     *   Real, governed. Marks the question ANSWERED (never re-answerable,
     *   preventing duplicate evidence from the same clarification) and
     *   builds a real OBSERVED observation carrying the user's answer as
     *   fresh evidence — fail-closed on missing/false consent, identical
     *   discipline to every other observation source in this pipeline.
     */
    function submitAnswer({ questionId, selectedOption, consent, actorId = null, sessionId, application } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        const entry = memory.readMemory(NAMESPACE, questionId, SYSTEM_ACTOR);
        const question = entry && entry.value;
        if (!question) return { success: false, reason: "NOT_FOUND" };
        if (question.status !== "PENDING") return { success: false, reason: `Question is already "${question.status}" — cannot be answered twice.` };
        if (!isNonEmptyString(selectedOption) || !question.options.includes(selectedOption)) {
            return { success: false, reason: "selectedOption must be one of the question's real, offered options." };
        }

        const adapter = window.CozyOS.MultimodalObservationAdapter;
        if (!adapter || typeof adapter.fromApplicationEvent !== "function") return { success: false, reason: "MultimodalObservationAdapter is not loaded." };
        const observationResult = adapter.fromApplicationEvent({
            eventText: `${question.term} => ${selectedOption}`,
            eventType: "ACTIVE_LEARNING_ANSWER",
            candidateLanguage: question.language,
            context: { conflictId: question.conflictId, questionId, term: question.term, meaning: selectedOption },
            sessionId, application, actorId, consent,
        });
        if (!observationResult.success) return { success: false, reason: observationResult.reason, errors: observationResult.errors };

        question.status = "ANSWERED";
        question.answer = { selectedOption, answeredBy: actorId || null, answeredAt: Date.now(), observationId: observationResult.observation.observationId };
        memory.saveMemory(NAMESPACE, questionId, question, { owner: SYSTEM_ACTOR, actorId: SYSTEM_ACTOR, visibility: "public" });

        return { success: true, question, observation: observationResult.observation };
    }

    /**
     * listPendingQuestions({ language, actorId })
     *   PHASE 5 EXTENSION — Universal Language Fluency. Real, additive
     *   read helper (no new storage, no new state) composing this
     *   file's own existing NAMESPACE the exact same way language-gap-
     *   registry.js's own listOpenGaps() already reads its namespace.
     *   Lets a language-capability diagnostic honestly report "what is
     *   Cozy currently waiting on a contributor to answer" for a given
     *   language, without inventing a second question store.
     */
    function listPendingQuestions({ language = null, actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory || typeof memory.listKeys !== "function") return [];
        const norm = isNonEmptyString(language) ? language.trim().toLowerCase() : null;
        const entries = memory.listKeys(NAMESPACE, (e) => {
            const q = e.value;
            if (!q || q.status !== "PENDING") return false;
            if (norm && q.language !== norm) return false;
            return true;
        }, actorId) || [];
        return entries.map((e) => e.value).filter(Boolean);
    }

    const ActiveLearning = Object.freeze({
        NAMESPACE, evaluateAmbiguity, createClarificationQuestion, submitAnswer, listPendingQuestions, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ActiveLearning = ActiveLearning;
    window.CozyOS.Modules["active-learning"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — governed active-learning clarification questions, gated on a real, open conflict-detection.js record plus an independent-contributor/occurrence utility threshold. A user's answer becomes a real OBSERVED observation via MultimodalObservationAdapter.fromApplicationEvent(), never a silent promotion. Composes CozyMemory under its own dedicated namespace. Not <script>-included by any page."
    });
})();
