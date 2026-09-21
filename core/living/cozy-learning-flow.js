/**
 * core/living/cozy-learning-flow.js
 * PHASE 4 — Universal Language Capability: Live Window learning
 * orchestrator ("I want to learn Kikuyu").
 *
 * Composes — never duplicates — CozyLearningIntent (marker detection),
 * CozyLanguageRealize (the universal realization seam), and
 * CozyReciprocalLearning (Profile + verified-gap composition). No new
 * AI, no new chat surface, no new governance engine. The user's own
 * answer to a reciprocal invitation is a normal teaching statement,
 * handled entirely by the EXISTING Phase 3 CozyTeachFlow — this file
 * adds no separate answer-capture state machine of its own.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function learningIntent() { const c = cozyOS(); return c && c.CozyLearningIntent; }
    function realize() { const c = cozyOS(); return c && c.CozyLanguageRealize; }
    function reciprocal() { const c = cozyOS(); return c && c.CozyReciprocalLearning; }
    function languageRegistry() { const c = cozyOS(); return c && c.CozyLanguageRegistry; }

    /**
     * resolveTargetLanguageId(text) — best-effort, honest name match
     * against the real, existing CozyLanguageRegistry list (never a
     * second language-name list). Returns null (not a guess) when no
     * real entry matches — the acknowledgment still uses the raw text
     * the user typed either way.
     */
    function resolveTargetLanguageId(text) {
        const registry = languageRegistry();
        if (!registry || typeof registry.listLanguages !== "function") return null;
        const needle = String(text || "").trim().toLowerCase();
        if (!needle) return null;
        const all = registry.listLanguages() || [];
        const found = all.find((l) => l.name && l.name.toLowerCase() === needle || (l.nativeName && l.nativeName.toLowerCase() === needle));
        return found ? found.code : null;
    }

    function processTurn(question, options) {
        const opts = options || {};
        const language = (typeof opts.language === "string" && opts.language.trim()) ? opts.language.trim().toLowerCase() : "en";
        const actorId = opts.actorId || null;

        const intent = learningIntent();
        if (!intent) return { matched: false };
        const detected = intent.detectLearningIntent(question, language);
        if (!detected.isLearning) return { matched: false };

        const targetText = detected.targetLanguageText;
        const targetId = resolveTargetLanguageId(targetText);
        const r = realize();
        const ack = (r && r.realize("learning:acknowledge-honest", detected.language, targetText))
            || `Sure - let's learn ${targetText} together. I can understand and respond for the areas currently supported by my verified language foundation.`;

        const pieces = [ack];

        const recip = reciprocal();
        if (recip && actorId) {
            let opportunity = null;
            try { opportunity = recip.findReciprocalOpportunity({ actorId, excludeLanguage: targetId || targetText.toLowerCase() }); } catch (_err) { opportunity = null; }
            if (opportunity) {
                const invitation = (r && r.realize("learning:reciprocal-invitation", detected.language, opportunity.language, opportunity.expression))
                    || `Also, I have some evidence for "${opportunity.expression}" in ${opportunity.language}, but not yet enough to call it fully verified. Can you help confirm it?`;
                pieces.push(invitation);
            }
        }

        return { matched: true, content: pieces.join(" "), evidence: "LEARNING_ACKNOWLEDGED", updatedConversationState: null };
    }

    const api = Object.freeze({ processTurn });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyLearningFlow = api;
        root.window.CozyOS.Modules["cozy-learning-flow"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — Universal Language Capability: Live Window learning orchestrator. Composes CozyLearningIntent + CozyLanguageRealize + CozyReciprocalLearning. No new AI, no new chat surface. A reciprocal invitation's ANSWER is handled entirely by the existing Phase 3 CozyTeachFlow — no separate answer-capture state here."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
