/**
 * CozyOS — Live Next-Step Intelligence: NextStepEngine
 * File Reference: core/modules/intelligence/next-step/cozy-next-step-engine.js
 *
 * WHAT THIS IS
 *   The pure, unit-testable core of Live Next-Step Intelligence:
 *
 *     nextStepEngine.suggest({ input, answer, intent, goal, context,
 *                              application, availableActions, permissions })
 *       -> { suggestions: [Suggestion, ...] }   // 0-3, see the contract
 *
 *   Deterministic composition only — the SAME "fixed, small vocabulary,
 *   not arbitrary phrasing" discipline this repository's own
 *   cozy-ai.js#getContext() keyword routes and CozyMemory's
 *   #parseTimeReference() already use. This file never guesses an
 *   actionId that isn't already present in the caller's own real
 *   `availableActions` list (normally
 *   window.CozyOS.NextStepActionRegistry.listActions({appId}) — the
 *   real, registered action set), so a suggestion can never point
 *   anywhere but a real, existing capability. No AI call, no LLM, no
 *   second cognitive/semantic system — this composes only the
 *   caller-supplied `intent`/`goal`/`application`/`availableActions`,
 *   themselves already derived by the real, existing answer chain
 *   before this function is ever called (see cozy-answer-engine.js's
 *   own additive integration point).
 *
 * RANKING / FALLBACK RULES (see next-step-suggestion-contract.js's own
 * header for the authoritative statement — this is the one real
 * implementation of it):
 *   1. Every candidate gets a confidence (HIGH/MEDIUM/LOW) and a
 *      directness integer (lower = more on-goal) from the deterministic
 *      rules below.
 *   2. Sort by confidence desc, then directness asc.
 *   3. Cap at MAX_SUGGESTIONS (3).
 *   4. No real candidate matched -> { suggestions: [] }. This is
 *      COMMON and correct (e.g. "What is Kenya's capital?" — a pure
 *      factual question with no actionable next step) — 0 is never
 *      treated as a failure.
 *   5. `availableActions` empty or absent for the resolved application
 *      -> { suggestions: [] }, not an error.
 *
 * CLARIFICATION (genuinely ambiguous goal only)
 *   When the question's own goal signal is ambiguous between two real,
 *   both-available action candidates from the SAME domain (see
 *   #detectAmbiguity()) and NEITHER dominates by keyword specificity,
 *   this returns 2 CLARIFICATION suggestions instead of guessing which
 *   one the person meant. Each one's action is the generic, always-
 *   available "cozyos.clarify" action (re-asks with the disambiguated
 *   text as the next turn) — never a guess presented as a real answer.
 *
 * GOAL DETECTION (deterministic, disclosed — not NLU)
 *   `goal` is normally supplied by the caller (see cozy-answer-engine.js
 *   integration), computed there via the SAME kind of fixed keyword
 *   check this file's own #inferGoal() exposes as a fallback for a
 *   caller that didn't compute one: "how do i/can i/help me/i want
 *   to/please <verb>" => "perform_action"; everything else => "know_fact".
 *   A pure factual "know_fact" goal with no action-oriented language at
 *   all is exactly the case that legitimately produces zero suggestions.
 */
(function (root) {
    "use strict";
    function cozyOS() { return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null); }

    const VERSION = "1.0.0";
    const MAX_SUGGESTIONS = 3;

    const ACTION_ORIENTED_PATTERN = /\b(how do i|how can i|how to|help me|i want to|i'd like to|i need to|please|can you|register|create|add|remove|delete|terminate|suspend|update|assign|record|log|schedule|organi[sz]e|manage|open|show me|find|search)\b/i;

    function inferGoal(input) {
        if (typeof input !== "string" || !input.trim()) return "know_fact";
        return ACTION_ORIENTED_PATTERN.test(input) ? "perform_action" : "know_fact";
    }

    // Domain keyword groups -> the real actionIds they legitimately
    // point to. Purely for RANKING/SELECTION among the caller's own
    // real availableActions — an actionId absent from availableActions
    // is never suggested regardless of a keyword match (see #select()).
    const DOMAIN_RULES = Object.freeze([
        { keywords: ["member", "congregant", "congregation", "wanachama", "mwanachama"], createAction: "church.register_member", searchAction: "church.list_members", navAction: "church.open_app" },
        { keywords: ["employee", "worker", "staff", "workforce", "mfanyakazi"], createAction: "quarry.register_employee", terminateAction: "quarry.terminate_employee", continueAction: "quarry.register_another_employee", navAction: "quarry.open_app" }
    ]);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    function matchDomain(text) {
        const q = (text || "").toLowerCase();
        return DOMAIN_RULES.find((d) => d.keywords.some((k) => q.includes(k))) || null;
    }

    function availableMap(availableActions) {
        const map = new Map();
        (Array.isArray(availableActions) ? availableActions : []).forEach((a) => { if (a && isNonEmptyString(a.actionId)) map.set(a.actionId, a); });
        return map;
    }

    function realizeLabel(labelKey, fallback, language) {
        const c = cozyOS();
        const realize = c && c.CozyLanguageRealize && typeof c.CozyLanguageRealize.realize === "function" ? c.CozyLanguageRealize.realize : null;
        if (labelKey && realize) {
            const realized = realize(labelKey, language);
            if (isNonEmptyString(realized)) return realized;
        }
        return fallback;
    }

    function buildSuggestion({ id, type, actionDef, payload, confidence, directness, reason, language, labelKeyOverride, fallbackOverride }) {
        const labelKey = labelKeyOverride || actionDef.labelKey;
        const fallback = fallbackOverride || actionDef.fallbackLabel || actionDef.actionId;
        return {
            _directness: directness,
            suggestion: {
                schemaVersion: "cozy.next-step-suggestion.v1",
                id, type, labelKey,
                label: realizeLabel(labelKey, fallback, language),
                action: { actionId: actionDef.actionId, payload: payload || {} },
                confidence, destructive: !!actionDef.destructive, reason
            }
        };
    }

    /**
     * #select(...) — the one real place candidate suggestions are
     * proposed. Every branch reads ONLY from `available` (the caller's
     * real availableActions, keyed by actionId) — an actionId that
     * isn't in there is never proposed, no matter how well its keyword
     * matches (rule 5 in the header: no registered actions == []).
     */
    function selectCandidates({ input, intent, goal, application, available, language, permissions }) {
        const candidates = [];
        const domain = matchDomain(input) || matchDomain(intent);

        // --- CONTINUATION: right after a successful creation in this
        // same domain (caller signals this via context.lastActionId). ---
        if (application && application.lastActionId === "quarry.register_employee" && available.has("quarry.register_another_employee")) {
            const c = buildSuggestion({
                id: "quarry.register_another_employee", type: "CONTINUATION",
                actionDef: available.get("quarry.register_another_employee"),
                confidence: "HIGH", directness: 0, reason: "continuation: previous turn's action succeeded", language
            });
            candidates.push(c);
        }

        const hasCreateKeyword = /\b(register|create|add|new|hire|sign up|enroll)\b/i.test(input || "");
        const hasOtherSpecificVerb = /(terminat\w*|suspend\w*|end employment|fire|remove|\bview\b|\blist\b|\bshow\b|\bsee\b|\bbrowse\b|\bfind\b|\bsearch\b)/i.test(input || "");

        if (domain && goal === "perform_action") {
            // The create action is only proposed when a real create-like
            // verb is present, OR when the input matched no more
            // specific verb at all (a bare, generic "I need an
            // employee"-style request defaults to the most direct real
            // action for that domain — still never fabricated, always
            // drawn from the caller's own real availableActions).
            if (domain.createAction && available.has(domain.createAction) && (hasCreateKeyword || !hasOtherSpecificVerb)) {
                candidates.push(buildSuggestion({
                    id: domain.createAction, type: "CREATION", actionDef: available.get(domain.createAction),
                    confidence: hasCreateKeyword ? "HIGH" : "MEDIUM", directness: hasCreateKeyword ? 0 : 1,
                    reason: `goal=perform_action; domain keyword matched "${domain.keywords[0]}"${hasCreateKeyword ? "; explicit create verb" : "; no more specific verb present"}`, language
                }));
            }
            if (domain.terminateAction && available.has(domain.terminateAction) && /terminat|suspend|end employment|fire|remove/i.test(input || "")) {
                candidates.push(buildSuggestion({
                    id: domain.terminateAction, type: "CREATION", actionDef: available.get(domain.terminateAction),
                    confidence: "MEDIUM", directness: 1, reason: "goal=perform_action; destructive intent keyword matched", language
                }));
            }
            if (domain.searchAction && available.has(domain.searchAction) && /view|list|show|see|browse|find|search/i.test(input || "")) {
                candidates.push(buildSuggestion({
                    id: domain.searchAction, type: "SEARCH", actionDef: available.get(domain.searchAction),
                    confidence: "MEDIUM", directness: 1, reason: "goal=perform_action; browse/list keyword matched", language
                }));
            }
        }

        // A domain matched but the goal is a plain factual question
        // (e.g. "How many members does ChurchOS support?") — offer the
        // lower-confidence NAVIGATION/SEARCH options only, never invent
        // a CREATION suggestion nobody asked to perform.
        if (domain && goal === "know_fact" && application && application.appId) {
            if (domain.navAction && available.has(domain.navAction) && domain.keywords.some(k => (input || "").toLowerCase().includes(k))) {
                candidates.push(buildSuggestion({
                    id: domain.navAction, type: "NAVIGATION", actionDef: available.get(domain.navAction),
                    confidence: "LOW", directness: 2, reason: "know_fact goal; offering navigation to the relevant application only", language
                }));
            }
        }

        return candidates;
    }

    /**
     * #detectAmbiguity(...) — real, narrow trigger: the question's own
     * text matches a domain's create AND search/terminate keyword
     * groups with roughly equal, low specificity (neither contains a
     * more specific verb the other lacks), AND both real actions are
     * available. Returns null (no ambiguity) far more often than not —
     * only genuinely tied cases produce a CLARIFICATION result.
     */
    function detectAmbiguity(input, domain, available) {
        if (!domain || typeof input !== "string") return null;
        const q = input.toLowerCase();
        const genericManage = /\bmanage\b|\borgani[sz]e\b|\bhandle\b|\bdeal with\b/.test(q);
        if (!genericManage) return null;
        const hasCreateVerb = /\b(create|add|register|new)\b/.test(q);
        const hasSearchVerb = /\b(view|list|show|see|browse|find)\b/.test(q);
        if (hasCreateVerb || hasSearchVerb) return null; // specific enough — not ambiguous
        const createAvailable = domain.createAction && available.has(domain.createAction);
        const searchAvailable = domain.searchAction && available.has(domain.searchAction);
        if (createAvailable && searchAvailable) return { createActionId: domain.createAction, searchActionId: domain.searchAction };
        return null;
    }

    function rankAndCap(candidates) {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };
        const sorted = candidates.slice().sort((a, b) => {
            const ca = order[a.suggestion.confidence] !== undefined ? order[a.suggestion.confidence] : 3;
            const cb = order[b.suggestion.confidence] !== undefined ? order[b.suggestion.confidence] : 3;
            if (ca !== cb) return ca - cb;
            return (a._directness || 0) - (b._directness || 0);
        });
        const seen = new Set();
        const out = [];
        for (const c of sorted) {
            if (seen.has(c.suggestion.id)) continue;
            seen.add(c.suggestion.id);
            out.push(c.suggestion);
            if (out.length >= MAX_SUGGESTIONS) break;
        }
        return out;
    }

    /**
     * suggest(request) — the one real, public, pure entry point.
     * Never throws: a malformed request or missing dependency honestly
     * degrades to { suggestions: [] } rather than fabricating anything.
     */
    function suggest(request) {
        const req = request || {};
        const input = typeof req.input === "string" ? req.input : "";
        const goal = isNonEmptyString(req.goal) ? req.goal : inferGoal(input);
        const application = req.application || null;
        const language = req.context && req.context.language ? req.context.language : (req.language || "en");
        const available = availableMap(req.availableActions);

        if (available.size === 0) return { suggestions: [] };

        const domain = matchDomain(input) || matchDomain(req.intent);
        const ambiguity = detectAmbiguity(input, domain, available);
        if (ambiguity) {
            const opt1 = buildSuggestion({
                id: "clarify:create", type: "CLARIFICATION",
                actionDef: { actionId: "cozyos.clarify", labelKey: null, fallbackLabel: null, destructive: false },
                payload: { text: `Create a new ${domain.keywords[0]}` },
                confidence: "MEDIUM", directness: 0,
                reason: "ambiguous goal: generic \"manage\" phrasing matched both create and browse candidates",
                language,
                labelKeyOverride: available.get(ambiguity.createActionId).labelKey,
                fallbackOverride: available.get(ambiguity.createActionId).fallbackLabel
            });
            const opt2 = buildSuggestion({
                id: "clarify:search", type: "CLARIFICATION",
                actionDef: { actionId: "cozyos.clarify", labelKey: null, fallbackLabel: null, destructive: false },
                payload: { text: `Show existing ${domain.keywords[0]}s` },
                confidence: "MEDIUM", directness: 0,
                reason: "ambiguous goal: generic \"manage\" phrasing matched both create and browse candidates",
                language,
                labelKeyOverride: available.get(ambiguity.searchActionId).labelKey,
                fallbackOverride: available.get(ambiguity.searchActionId).fallbackLabel
            });
            return { suggestions: [opt1.suggestion, opt2.suggestion] };
        }

        const candidates = selectCandidates({ input, intent: req.intent, goal, application, available, language, permissions: req.permissions });
        return { suggestions: rankAndCap(candidates) };
    }

    const NextStepEngine = Object.freeze({ suggest, rankAndCap, inferGoal, getVersion: () => VERSION, MAX_SUGGESTIONS });

    if (typeof module !== "undefined" && module.exports) module.exports = NextStepEngine;
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.NextStepEngine = NextStepEngine;
        root.window.CozyOS.Modules["next-step-engine"] = Object.freeze({
            version: VERSION,
            description: "Live Next-Step Intelligence — window.CozyOS.NextStepEngine.suggest({input,answer,intent,goal,context,application,availableActions,permissions}) -> {suggestions:[0-3]}. Pure, deterministic, unit-testable. Never proposes an actionId absent from the caller's own real availableActions (normally NextStepActionRegistry.listActions()). Ranks by confidence then directness, caps at 3, returns [] honestly when nothing real matches or no actions are registered for the application. Detects genuine goal ambiguity (generic \"manage X\" phrasing) and returns 2 CLARIFICATION options instead of guessing."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
