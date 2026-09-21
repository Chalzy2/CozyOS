/**
 * core/living/cozy-pastor-question-flow.js
 * PHASE 4 — ENHANCED COZY BOUNDARY (Live Session Privacy): Live Window
 * orchestrator for "send this to the pastor/moderator".
 *
 * Composes — never duplicates — CozyPastorQuestionIntent (marker
 * detection), ChurchLiveSessionController.getLdceSessionIdFor() (the
 * SAME real ChurchWorshipSession-id -> LDCE-session-id pairing
 * cozy-ai.js's own live-worship-session context already uses),
 * ChurchLiveModerationControls.submitQuestion() (the real, session-
 * membership-checked, questions-enabled-checked, PRIVATE storage this
 * checkpoint added), and CozyLanguageRealize (the universal realization
 * seam). No new AI, no new chat surface, no new question store, no
 * second Live Window. This is the "Participant -> Private Cozy" step of
 * the spec's required workflow — the ordinary Live Window conversation a
 * participant is already having, given one more explicit thing it can
 * do on request. The pastor/moderator's own reply surfaces back through
 * the SAME Live Window the next time this participant opens it (see
 * cozy-living-assistant.js's wiring of this file).
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function pastorIntent() { const c = cozyOS(); return c && c.CozyPastorQuestionIntent; }
    function realize() { const c = cozyOS(); return c && c.CozyLanguageRealize; }
    function sessionController() { const c = cozyOS(); return c && c.ChurchLiveSessionController; }
    function moderationControls() { const c = cozyOS(); return c && c.ChurchLiveModerationControls; }

    /**
     * processTurn(question, {actorId, language, liveSessionId})
     *   liveSessionId here is the SAME ChurchWorshipSession id
     *   cozy-ai.js's getContext() already receives (the Live Window's own
     *   "current live session" — see cozy-living-assistant.js's
     *   #effectiveLiveSessionId) — never a second session identifier
     *   concept. Returns {matched:false} (a true no-op) whenever there is
     *   no explicit marker, or no active live session at all — an
     *   ordinary question never accidentally becomes a pastor
     *   submission.
     */
    function processTurn(question, options) {
        const opts = options || {};
        const language = (typeof opts.language === "string" && opts.language.trim()) ? opts.language.trim().toLowerCase() : "en";
        const actorId = opts.actorId || null;
        const liveSessionId = opts.liveSessionId || null;

        const intent = pastorIntent();
        if (!intent) return { matched: false };
        const detected = intent.detectPastorQuestionIntent(question, language);
        if (!detected.isPastorQuestion) return { matched: false };

        // An explicit marker with no active live session is still this
        // turn's whole intent (never silently falls through to an
        // unrelated public-knowledge answer) — honestly refused instead.
        const r = realize();
        if (!liveSessionId || !actorId) {
            const content = (r && r.realize("pastor-question:unavailable", detected.language, "there is no active live session to send it in."))
                || "I couldn't send that to the pastor/moderator right now: there is no active live session to send it in.";
            return { matched: true, content, evidence: "REFUSED" };
        }

        const ctl = sessionController();
        const ldceSessionId = (ctl && typeof ctl.getLdceSessionIdFor === "function") ? ctl.getLdceSessionIdFor(liveSessionId) : null;
        const mod = moderationControls();
        if (!ldceSessionId || !mod || typeof mod.submitQuestion !== "function") {
            const content = (r && r.realize("pastor-question:unavailable", detected.language, "this session is not set up to receive pastor/moderator questions."))
                || "I couldn't send that to the pastor/moderator right now: this session is not set up to receive pastor/moderator questions.";
            return { matched: true, content, evidence: "REFUSED" };
        }

        const result = mod.submitQuestion(ldceSessionId, actorId, detected.questionText);
        if (result.status !== "OK") {
            const content = (r && r.realize("pastor-question:unavailable", detected.language, result.reason || result.status))
                || `I couldn't send that to the pastor/moderator right now: ${result.reason || result.status}`;
            return { matched: true, content, evidence: "REFUSED" };
        }

        const content = (r && r.realize("pastor-question:submitted", detected.language))
            || "Your question has been sent privately to the pastor/moderator. You'll see their reply here once they respond.";
        return { matched: true, content, evidence: "VERIFIED", questionId: result.question.questionId };
    }

    const api = Object.freeze({ processTurn });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyPastorQuestionFlow = api;
        root.window.CozyOS.Modules["cozy-pastor-question-flow"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — ENHANCED COZY BOUNDARY: Live Window orchestrator for the explicit \"send this to the pastor/moderator\" workflow. Composes CozyPastorQuestionIntent + ChurchLiveSessionController + ChurchLiveModerationControls.submitQuestion() + CozyLanguageRealize. No new AI, no new chat surface, no new question store."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
