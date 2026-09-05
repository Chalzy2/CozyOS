/**
 * CozyOS — On-Device Cognitive Adapter
 * File Reference: core/modules/intelligence/providers/on-device-cognitive-adapter.js
 * Phase: 10C-3A — Real Provider Adapter & Registration
 *
 * OWNERSHIP
 *   Registers ONE real, additional provider into CozyThinking's
 *   ALREADY-EXISTING registerProvider() extension point
 *   (core/modules/thinking/cozy-thinking.js — NOT modified by this
 *   file). Does not create a second thinking engine, a second provider
 *   registry, or a second on-device implementation. Composes the exact
 *   same real provider object on-device-conversational-provider.js
 *   already builds and now exports as
 *   window.CozyOS.OnDeviceConversationalProvider — this file never
 *   re-implements browser feature detection, session handling, or
 *   model invocation; it only translates that provider's real
 *   text-in/text-out contract into CozyThinking's evidence-in/
 *   structured-out provider contract.
 *
 * WHY THIS FILE EXISTS (Phase 10C-3A audit finding)
 *   Before this file: on-device-conversational-provider.js registers
 *   itself only with window.CozyOS.LivingAI (a SEPARATE, parallel
 *   provider registry whose think(text) is invoked directly by
 *   CozyLivingAI.think() and never touches CognitiveCoordinator /
 *   CozyThinking / CozyReasoning / CozyInterpretation at all). Meanwhile
 *   CozyThinking's own provider registry (composed by
 *   CognitiveCoordinator.run()'s Thinking stage) had, until Phase 10C2B,
 *   no way to safely hold an ASYNC provider function — Phase 10C2B
 *   fixed that (CozyThinking.think() now `await`s provider.fn()). With
 *   that fix in place, the smallest real change to let a genuine
 *   asynchronous provider's real result reach the cognitive pipeline is
 *   this adapter: register the SAME real on-device provider object,
 *   under CozyThinking's registry, as an explicitly-selectable
 *   (never-default) provider.
 *
 * HONEST SCOPE — WHAT THIS ADAPTER DOES AND DOES NOT DO
 *   - Registers as id "on-device-conversational". Never calls
 *     setDefaultProvider() — CozyThinking's existing default (e.g.
 *     ai-bootstrap.js's "living-planner-baseline", when loaded) is left
 *     completely untouched. A caller must explicitly request this
 *     provider (CozyThinking.think({ ..., providerId:
 *     "on-device-conversational" }), or CognitiveCoordinator.run({ ...,
 *     thinkingProviderId: "on-device-conversational" }) — Phase 10C-3A's
 *     matching, additive, default-preserving parameter on
 *     CognitiveCoordinator.run()).
 *   - The real on-device model returns ONLY free-form text
 *     (result.result.text). CozyThinking's provider contract expects
 *     alternatives/reasoningSteps/confidence/risks/opportunities. This
 *     adapter maps the genuine text into `explanation` and
 *     `reasoningSteps` (both real, both exactly what the model
 *     returned) and leaves confidence/alternatives/risks/opportunities
 *     honestly empty/null — NEVER a fabricated numeric confidence or an
 *     invented alternatives list the model did not actually produce.
 *   - On any real failure (no browser API, model not installed, empty
 *     response, thrown error) this adapter throws, so CozyThinking's
 *     own existing try/catch honestly marks the stage isReal:false with
 *     the real reason — this file adds no separate success/failure
 *     reporting path of its own.
 *   - Registers only with CozyThinking. CozyReasoning and
 *     CozyInterpretation's provider contracts (contradiction detection,
 *     evidence classification) do not have an honest mapping from a
 *     single free-form conversational reply without inventing structure
 *     the model did not produce — out of scope for this phase, not
 *     silently skipped: recorded here and in the Phase 10C-3A
 *     implementation report as a disclosed, deliberate boundary.
 *
 * NOT MODIFIED BY THIS FILE: Rule 82, RP-030-CONTENT, any vocabulary
 * state, promotion logic, or governance files. This file touches only
 * CozyThinking's provider registry (via its own existing public API).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["on-device-cognitive-adapter"]) return;

    const PROVIDER_ID = "on-device-conversational";

    /**
     * fn({ evidence, interpretationsUsed })
     *   Real — composes window.CozyOS.OnDeviceConversationalProvider
     *   (the exact object on-device-conversational-provider.js already
     *   builds and now exports). Builds a real prompt only from the
     *   real evidence array CozyThinking.think() was actually called
     *   with — never fabricates input text.
     */
    async function fn({ evidence = [], interpretationsUsed = [] } = {}) {
        const onDevice = window.CozyOS.OnDeviceConversationalProvider;
        if (!onDevice || typeof onDevice.think !== "function") {
            throw new Error("window.CozyOS.OnDeviceConversationalProvider is not loaded (on-device-conversational-provider.js must load before this adapter can invoke it).");
        }

        const text = evidence
            .map((e) => (e && typeof e.data === "string" ? e.data : JSON.stringify((e && e.data) || "")))
            .join(" ")
            .trim();
        if (!text) {
            throw new Error("No real evidence text was available to send to the on-device model.");
        }

        const result = await onDevice.think(text, {});
        if (!result || !result.success) {
            throw new Error((result && result.reason) || "On-device provider call failed for an unspecified reason.");
        }
        if (!result.result || typeof result.result.text !== "string" || !result.result.text.trim()) {
            throw new Error("On-device provider reported success but returned no real text.");
        }

        const realText = result.result.text;
        // HONEST MAPPING ONLY — every field below is either the model's
        // genuine output or an honest absence. Nothing here is invented.
        return {
            explanation: realText,
            reasoningSteps: [realText],
            confidence: null,
            alternatives: [],
            risks: [],
            opportunities: []
        };
    }

    function registerWithThinking() {
        const thinking = window.CozyOS.CozyThinking;
        if (!thinking || typeof thinking.registerProvider !== "function") return { success: false, reason: "CozyThinking is not loaded." };
        if (thinking.findProvider(PROVIDER_ID)) return { success: true, alreadyRegistered: true };
        // Deliberately never calls setDefaultProvider() — this provider
        // is real but explicit-selection-only, so it cannot change any
        // existing default-provider behavior/regression coverage.
        return thinking.registerProvider({
            id: PROVIDER_ID,
            name: "On-Device Conversational (Real Browser LLM)",
            supportedStrategies: [],
            supportsAlternatives: false,
            supportsDecisionMatrix: false,
            supportsRiskAnalysis: false,
            supportsExplain: true,
            offline: true
        }, fn);
    }

    const registration = registerWithThinking();

    window.CozyOS.Modules["on-device-cognitive-adapter"] = Object.freeze({
        version: VERSION,
        registration,
        description: "Phase 10C-3A — real, minimal adapter registering the existing real on-device conversational provider (on-device-conversational-provider.js, composed via window.CozyOS.OnDeviceConversationalProvider, never re-implemented) into CozyThinking's existing async-capable provider registry (Phase 10C2B) under id 'on-device-conversational'. Never set as default provider — explicit-selection-only via providerId / CognitiveCoordinator.run({ thinkingProviderId }). Maps the model's genuine free-form text into explanation/reasoningSteps only; confidence/alternatives/risks/opportunities are left honestly null/empty rather than fabricated. Registers only with CozyThinking — CozyReasoning/CozyInterpretation are out of scope this phase (disclosed, not silently skipped)."
    });
})();
