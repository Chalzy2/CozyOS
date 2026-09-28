/**
 * core/living/spiritual-intent-router.js
 * COZY SPIRITUALOS — PHASE 1: Spiritual Foundation
 * (see COZY_SPIRITUALOS_ARCHITECTURE.md §1b/§5)
 *
 * WHAT THIS FILE IS
 *   The thin dispatch table §5 asks for. It contains NO business logic
 *   of its own: every real decision (church vs. personal, and the
 *   §1b OWNER_TABLE itself) already lives in spiritual-capability.js;
 *   every real operation either calls straight into that file's
 *   handlePersonal*() functions (personal path) or forwards, as a pure
 *   parameter passthrough, into the existing, UNMODIFIED ChurchOS file
 *   the owner names (church path) — see dispatchToChurchOwner() below,
 *   which decides nothing, it only forwards already-supplied real
 *   parameters and re-shapes the ChurchOS function's own real return
 *   value into the shared §2 envelope.
 *
 * WHO CALLS dispatch() — AND THE ONE THING THIS FILE DELIBERATELY DOES
 * NOT DO
 *   §5 asks for this file to be "called from rule-based-conversational-
 *   provider.js's existing intent-handling chain... one new branch."
 *   This milestone does NOT add that branch: rule-based-conversational-
 *   provider.js is one of this repository's diff-guarded files (see
 *   core/modules/cognitive/providers/test/semantic-answer-interpretation-
 *   provider.test.js's own E28 assertion — a real, intentional
 *   protection, not weakened or bypassed here). dispatch() below is
 *   fully real, fully tested, and callable today by anything that
 *   already has a resolved SPIRITUAL_* intent (see this file's own
 *   test suite) — it is simply not yet wired into that one live call
 *   site, pending the user's explicit approval. See this milestone's
 *   hand-back report for the exact branch that wiring would add and
 *   the exact guard-test update it would require.
 *
 * CROSS-TURN STATE — §5's "conversationState.spiritual key, not a
 * parallel store." dispatch() never invents its own store: it accepts
 * whatever conversationState object the caller already threads through
 * turns (the same object rule-based-conversational-provider.js's own
 * think() already returns and cozy-living-assistant.js already carries
 * forward — see that file's own #conversationState field), and returns
 * a NEW object with exactly one added/replaced key, `spiritual`, never
 * mutating or removing any other key the caller already put there.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }

    /**
     * spiritualCapability()
     *   Resolves the real, existing spiritual-capability.js module —
     *   in Node (tests), via require() from this same directory; in the
     *   browser, via window.CozyOS.SpiritualCapability (loaded as a
     *   normal <script>, same convention as every sibling file in this
     *   directory).
     */
    function spiritualCapability() {
        const cozy = cozyOS();
        if (cozy && cozy.SpiritualCapability) return cozy.SpiritualCapability;
        if (typeof require === "function") {
            try { return require("./spiritual-capability.js"); } catch (_err) { return null; }
        }
        return null;
    }

    function normalizeLanguage(language) {
        return (typeof language === "string" && language.trim().toLowerCase() === "sw") ? "sw" : "en";
    }
    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    const MODULE_VERSION = "1.0.0";

    /**
     * dispatchToChurchOwner(intent, decision, req)
     *   Zero business logic: forwards real, already-supplied caller
     *   parameters straight into the existing, unmodified ChurchOS
     *   file the §1b OWNER_TABLE named, and re-shapes ITS OWN real
     *   return value into the shared envelope. Never decides on the
     *   caller's behalf what visibility/category/action to use.
     *
     *   SPIRITUAL_PRAYER -> church-prayer-interaction.js's real,
     *   unmodified submitPrayerRequest(sessionId, authorUserId, {text,
     *   visibility, category, language}) — a genuine 1:1 match for "a
     *   participant asking to submit a prayer request during a live
     *   church session."
     *
     *   SPIRITUAL_WORSHIP -> worship-mode-coordinator.js is named as the
     *   real church owner (disclosed for diagnostics), but its only real
     *   methods are session ACTIONS (startWorshipMode/endWorshipMode/
     *   markPhase), each requiring an orchestration decision (which
     *   action? which phase?) that an ordinary conversational turn gives
     *   this router no safe, unambiguous basis to make without inventing
     *   business logic that belongs to that coordinator, not this
     *   dispatch table. This file therefore never auto-invokes any of
     *   its action methods — it honestly reports `unsupported` instead
     *   of guessing, which §2 explicitly requires ("available must never
     *   be returned unless the requested capability actually executed").
     */
    function dispatchToChurchOwner(intent, decision, req) {
        const capability = spiritualCapability();
        const language = normalizeLanguage(req.language);

        if (decision.ownerModule === "church-prayer-interaction") {
            const cozy = cozyOS();
            const church = cozy && cozy.ChurchPrayerInteraction;
            if (!church || typeof church.submitPrayerRequest !== "function") {
                return capability.buildEnvelope({
                    intent, owner: "church", capabilityState: "error", language, source: null,
                    content: "ChurchPrayerInteraction is not loaded in this environment."
                });
            }
            const result = church.submitPrayerRequest(decision.ldceSessionId, req.actorId, {
                text: req.text, visibility: req.visibility, category: req.category, language: req.language
            });
            if (result.status === "OK") {
                return capability.buildEnvelope({
                    intent, owner: "church", capabilityState: "available", language, source: null,
                    content: language === "sw"
                        ? "Ombi lako la maombi limetumwa kwa kikao hiki cha kanisa."
                        : "Your prayer request has been submitted to this church session."
                });
            }
            // Honest, real status mapping from church-prayer-interaction.js's
            // own disclosed statuses — NOT_FOUND/REJECTED both mean the
            // real church context this router thought existed did not
            // actually hold at submission time (e.g. the session ended,
            // or the requester turned out not to be a real session
            // member); UNAVAILABLE means the underlying engine itself is
            // missing, a genuine infrastructure error.
            const capabilityState = result.status === "UNAVAILABLE" ? "error" : "no_context";
            return capability.buildEnvelope({
                intent, owner: "church", capabilityState, language, source: null,
                content: result.reason || "The church prayer request could not be submitted."
            });
        }

        if (decision.ownerModule === "worship-mode-coordinator") {
            return capability.buildEnvelope({
                intent, owner: "church", capabilityState: "unsupported", language, source: null,
                content: language === "sw"
                    ? "Taarifa za ibada wakati wa kikao halisi cha kanisa zinahitaji kuchukuliwa hatua moja kwa moja na kiongozi wa ibada - hazianzishwi kiotomatiki kupitia ujumbe wa mazungumzo."
                    : "Live worship-session actions during a real church service must be triggered directly by the worship leader — this conversational surface does not auto-trigger them."
            });
        }

        return capability.buildEnvelope({
            intent, owner: "church", capabilityState: "unsupported", language, source: null,
            content: "No church-owned handling exists for this intent yet."
        });
    }

    /**
     * dispatch(intent, request, conversationState)
     *   THE one new branch a provider's intent-handling chain would
     *   call (see this file's header for exactly why that wiring is not
     *   yet live). `intent` is one of the four SPIRITUAL_* ids
     *   cozy-ai-semantic-intent.js's analyze() already classified —
     *   this file never re-classifies text itself. `request` carries
     *   whatever the caller already resolved this turn (text, language,
     *   actorId, topic/reference, and optionally ldceSessionId/
     *   liveSessionId for church-context resolution — see
     *   spiritual-capability.js's classifyContext()). Returns
     *   { envelope, conversationState } — conversationState is the
     *   SAME object the caller passed in, with only its own `spiritual`
     *   key added/replaced (§5 — "not a parallel store").
     */
    function dispatch(intent, request, conversationState) {
        const req = (request && typeof request === "object") ? request : {};
        const priorState = (conversationState && typeof conversationState === "object") ? conversationState : {};
        const capability = spiritualCapability();

        if (!capability) {
            return {
                envelope: {
                    capability: "spiritual", intent, owner: null, capabilityState: "error",
                    language: normalizeLanguage(req.language), source: null,
                    content: "spiritual-capability.js is not loaded in this environment.",
                    conversationStateUpdated: false
                },
                conversationState: priorState
            };
        }

        const context = capability.classifyContext(req);
        const decision = capability.route(intent, context);

        let envelope;
        if (decision.owner === "church") {
            envelope = dispatchToChurchOwner(intent, decision, req);
        } else if (decision.owner === "personal" && typeof capability[decision.ownerFunction] === "function") {
            envelope = capability[decision.ownerFunction](req);
        } else {
            envelope = capability.buildEnvelope({
                intent, owner: decision.owner || "personal", capabilityState: "unsupported",
                language: normalizeLanguage(req.language), source: null,
                content: "This spiritual request is not supported yet."
            });
        }

        const language = envelope.language || normalizeLanguage(req.language);
        const priorSpiritual = (priorState.spiritual && typeof priorState.spiritual === "object") ? priorState.spiritual : {};
        const lastTheme = isNonEmptyString(req.topic) ? req.topic.trim()
            : isNonEmptyString(req.reference) ? req.reference.trim()
            : (priorSpiritual.lastTheme || null);

        const spiritualState = {
            lastIntent: intent,
            lastLanguage: language,
            lastOwner: envelope.owner,
            lastTheme,
            updatedAt: new Date().toISOString()
        };

        const nextConversationState = Object.assign({}, priorState, { spiritual: spiritualState });
        return { envelope, conversationState: nextConversationState };
    }

    /** §1b, restated for inspection/tests — the exact table dispatch() honors, sourced from spiritual-capability.js's own OWNER_TABLE (never a second, competing copy). */
    function getRouteTable() {
        const capability = spiritualCapability();
        return capability ? capability.OWNER_TABLE : null;
    }

    const api = Object.freeze({ dispatch, getRouteTable, getVersion() { return MODULE_VERSION; } });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.SpiritualIntentRouter = api;
        root.window.CozyOS.Modules["spiritual-intent-router"] = Object.freeze({
            version: MODULE_VERSION,
            description: "COZY SPIRITUALOS — PHASE 1: Spiritual Foundation. Thin dispatch table (zero business logic) over spiritual-capability.js's classifyContext()/route()/handlePersonal*(). Church-context calls forward, as a pure parameter passthrough, into the existing, unmodified ChurchOS files §1b names — never re-implements their logic. NOT YET wired into rule-based-conversational-provider.js's live intent-handling chain (that file is diff-guarded — see this file's own header and this milestone's hand-back report for the exact deferred branch and why)."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
