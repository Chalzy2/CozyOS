/**
 * core/living/cozy-ai-universal-contract.js
 * PHASE 5 — Universal Cozy AI Contract Adapter
 *
 * WHAT THIS FILE IS
 *   A thin, additive wrapper around the existing, unmodified
 *   window.CozyOS.LivingAI.think(text, options) — the real, working
 *   "System A" entry point (cozy-living-assistant.js's #send()/
 *   #wireVoiceInput()/#sendImage() all call the same LivingAI.think()
 *   this file wraps). It implements the cozy.ai.request.v1 /
 *   cozy.ai.response.v1 envelope defined in the Phase 4 architecture
 *   document, plus read-only provider-state introspection.
 *
 * LOCATION RATIONALE (explained before implementation, per spec)
 *   Placed in core/living/ — not core/ai/ — because core/ai/ is
 *   exclusively System B's protected territory (core/ai.js,
 *   core/ai/integration.js, core/ai/cozy-ai-language.js,
 *   core/ai/cozy-ai-memory.js — all PROTECTED, none touched by this
 *   file). This contract wraps System A (LivingAI), whose real home is
 *   core/living/ (cozy-living-ai.js, cozy-living-assistant.js). Filing
 *   a System-A adapter under core/ai/ would misrepresent which system
 *   owns it and risk future confusion with the locked files sitting in
 *   the same directory.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not modify LivingAI, any registered provider, or
 *     cozy-living-assistant.js. Zero existing files were changed to
 *     build this adapter (see the Phase 5 checkpoint's file manifest).
 *   - Does not implement a semantic intent classifier, numeric
 *     confidence, "goal" separation, intent/knowledge learning,
 *     multi-provider fan-out, or any modality beyond text/voice-STT/
 *     OCR. Every one of those fields exists in the schema below ONLY
 *     as an honestly-null/false placeholder — see UNDERSTANDING_
 *     PLACEHOLDER and LEARNING_PLACEHOLDER.
 *   - Does not call setActiveProvider() as a side effect of mere
 *     introspection (getProviderState()). The only function that
 *     temporarily changes the active provider is
 *     probeProviderReachability(), which is a deliberate, separately-
 *     named, explicitly-invoked action that ALWAYS restores the prior
 *     active provider afterward, even on error (try/finally).
 *
 * HARD INVARIANT ENFORCED HERE
 *   At most one provider is ever "active" per LivingAI.getActiveProvider()
 *   — this file never sets more than one, never queries more than one
 *   provider per request, and rejects any providerHint that does not
 *   name a currently registered provider (PROVIDER_UNAVAILABLE) rather
 *   than silently substituting the active one.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    if (window.CozyOS.UniversalAIContract) return; // idempotent load guard, same pattern used across this codebase

    const REQUEST_SCHEMA = "cozy.ai.request.v1";
    const RESPONSE_SCHEMA = "cozy.ai.response.v1";

    // Only these modalities have a real, working path today (all three
    // converge on the same ai.think() call — confirmed by reading
    // cozy-living-assistant.js's #send()/#wireVoiceInput()/#sendImage()).
    // Anything else (video, sensor, robot, document) is honestly
    // rejected as UNSUPPORTED_MODALITY, never silently downgraded to
    // text processing.
    const SUPPORTED_MODALITIES = Object.freeze(["text", "voice", "ocr", "admin-action", "app-event"]);

    function getLivingAI() {
        return (window.CozyOS && window.CozyOS.LivingAI) || null;
    }

    function nowIso() { return new Date().toISOString(); }

    function makeId(prefix) {
        try {
            if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
        } catch (_e) { /* fall through to timestamp-based id below */ }
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * createRequest(text, options, meta)
     *   Builds a real cozy.ai.request.v1 envelope. This is the
     *   mechanical lift the spec requires: an old call
     *   think(text, options) becomes
     *   { schema, input: { raw: text }, options } with everything else
     *   filled from real, available context or left null — never
     *   invented.
     */
    function createRequest(text, options, meta) {
        options = (options && typeof options === "object") ? options : {};
        meta = (meta && typeof meta === "object") ? meta : {};

        return {
            schema: REQUEST_SCHEMA,
            request: {
                id: makeId("req"),
                timestamp: nowIso()
            },
            source: {
                channel: meta.channel || "live-assistant",
                modality: meta.modality || "text",
                interface: meta.interface || null
            },
            input: {
                raw: text,
                language: {
                    declared: options.language || null,
                    // Real detection happens inside the active provider
                    // itself (rule-based-conversational-provider.js's
                    // own normalizeUserText()/detectLanguageHeuristic());
                    // this contract layer does not duplicate or
                    // pre-empt that — it is unknown from the outside
                    // until the provider actually runs.
                    detected: null
                }
            },
            // CRITICAL REQUIREMENT (Rule 2 / Section 8): options is a
            // VERBATIM passthrough. Not cloned-and-reinterpreted, not
            // renamed, not pruned. The exact object the caller supplied
            // reaches the provider unchanged.
            options: options,
            context: {
                previousRequestId: meta.previousRequestId || null,
                activeApplication: (options.conversationState && options.conversationState.lastDiscussedApplication) || null,
                // conversationState itself is intentionally NOT parsed
                // or restructured here (Section 9) — it is transported
                // opaquely inside `options` above, which is where the
                // existing provider already reads it from.
                references: null // FUTURE — no existing reference-list mechanism beyond the provider's own internal follow-up patterns
            },
            routing: {
                target: "cozy-ai-core",
                providerHint: meta.providerHint || null
            },
            permissions: {
                requestedAction: meta.requestedAction || null
            }
        };
    }

    /**
     * validateModality(request)
     *   Returns null if supported, or a rejection response if not.
     */
    function validateModality(request) {
        const modality = request && request.source && request.source.modality;
        if (SUPPORTED_MODALITIES.indexOf(modality) === -1) {
            return makeErrorResponse(request, "UNSUPPORTED_MODALITY", `Modality "${modality}" has no real implemented path yet. Supported today: ${SUPPORTED_MODALITIES.join(", ")}.`);
        }
        return null;
    }

    /**
     * resolveProviderHint(request, livingAI)
     *   A providerHint must name a REGISTERED provider or the request
     *   is rejected — never silently substituted (Section 13). Returns
     *   { ok: true, name } or { ok: false, response }.
     */
    function resolveProviderHint(request, livingAI) {
        const hint = request && request.routing && request.routing.providerHint;
        if (!hint) return { ok: true, name: null }; // no hint -> use whatever is currently active, unchanged behavior
        const registered = livingAI.listProviders();
        if (registered.indexOf(hint) === -1) {
            return { ok: false, response: makeErrorResponse(request, "PROVIDER_UNAVAILABLE", `providerHint "${hint}" does not name a currently registered provider. Registered: ${registered.join(", ")}.`) };
        }
        return { ok: true, name: hint };
    }

    function makeErrorResponse(request, statusCode, reason) {
        return {
            schema: RESPONSE_SCHEMA,
            response: {
                id: makeId("res"),
                requestId: (request && request.request && request.request.id) || null,
                timestamp: nowIso()
            },
            status: { code: statusCode },
            understanding: understandingPlaceholder(),
            answer: { type: "error", text: reason },
            actions: [],
            clarification: null,
            learning: learningPlaceholder(),
            provenance: { knowledgeStatus: "NOT_APPLICABLE" },
            metadata: {}
        };
    }

    /**
     * understandingPlaceholder() / learningPlaceholder()
     *   Named, reusable, honestly-empty defaults — see Section 10/15.
     *   Callers MUST NOT interpret goal/confidence/scope as ever having
     *   been computed unless this function's output is later replaced
     *   by a real implementation in a FUTURE phase.
     */
    function understandingPlaceholder() {
        return {
            language: null,
            entity: null,
            primaryIntent: null,
            secondaryIntents: [],
            goal: null, // NOT IMPLEMENTED - no component separates primary/secondary intent today
            confidence: null // NOT IMPLEMENTED - existing classifier is boolean pattern-match, not scored
        };
    }

    function learningPlaceholder() {
        return { candidateCreated: false, scope: null }; // intent/knowledge learning NOT IMPLEMENTED (Section 15)
    }

    /**
     * deriveUnderstanding(legacyResult)
     *   Fills in ONLY what the existing rule-based provider's real
     *   result object actually contains (result.language, result.intent,
     *   the entity implied by conversationState.lastDiscussedApplication).
     *   Never fabricates a field the provider didn't produce.
     */
    function deriveUnderstanding(legacyResult) {
        const u = understandingPlaceholder();
        if (!legacyResult) return u;
        u.language = legacyResult.language || null;
        u.primaryIntent = legacyResult.intent || null;
        u.entity = (legacyResult.conversationState && legacyResult.conversationState.lastDiscussedApplication)
            || (legacyResult.application && legacyResult.application.name)
            || null;
        return u;
    }

    /**
     * handleRequest(request)
     *   The real adapter core: validate -> unwrap -> existing
     *   LivingAI.think(text, options) -> wrap -> cozy.ai.response.v1.
     *   Never rewrites the provider; never invents fields the legacy
     *   result did not contain.
     */
    async function handleRequest(request) {
        if (!request || request.schema !== REQUEST_SCHEMA) {
            return makeErrorResponse(request, "INTERNAL_ERROR", `Request missing or invalid schema (expected "${REQUEST_SCHEMA}").`);
        }

        const modalityRejection = validateModality(request);
        if (modalityRejection) return modalityRejection;

        const livingAI = getLivingAI();
        if (!livingAI || typeof livingAI.think !== "function") {
            return makeErrorResponse(request, "PROVIDER_UNAVAILABLE", "window.CozyOS.LivingAI is not loaded.");
        }

        const hintResolution = resolveProviderHint(request, livingAI);
        if (!hintResolution.ok) return hintResolution.response;

        // NEVER a fan-out: at most one provider is consulted for this
        // request. If a specific, already-registered provider was
        // hinted, we honor it via the SAME single-select
        // setActiveProvider() choke point the rest of the system
        // already uses - restoring the prior active provider
        // afterward so this call never leaves a side effect behind
        // that a different, concurrent caller would observe.
        const priorActive = livingAI.getActiveProvider();
        let switched = false;
        try {
            if (hintResolution.name && hintResolution.name !== priorActive) {
                livingAI.setActiveProvider(hintResolution.name);
                switched = true;
            }

            // THE UNWRAP (Section 8) - exactly the mechanical lift the
            // spec requires, calling the real, existing, unmodified
            // think(text, options).
            const legacyResult = await livingAI.think(request.input.raw, request.options);

            if (!legacyResult || legacyResult.success !== true) {
                const reason = (legacyResult && legacyResult.reason) || "Provider returned an unsuccessful result.";
                return makeErrorResponse(request, "PROVIDER_ERROR", reason);
            }

            const result = legacyResult.result || {};
            const understanding = deriveUnderstanding(result);
            const needsClarification = result.needsClarification === true;

            return {
                schema: RESPONSE_SCHEMA,
                response: {
                    id: makeId("res"),
                    requestId: request.request.id,
                    timestamp: nowIso()
                },
                status: { code: needsClarification ? "OK_UNCERTAIN" : (result.intent === "unsupported" ? "UNSUPPORTED_INTENT" : "OK") },
                understanding: understanding,
                answer: { type: "text", text: result.text || "" },
                actions: result.application ? [{
                    actionRequested: true,
                    actionId: result.intent || null,
                    authorizationCheck: {
                        performed: !!result.requiresAuthorization || !!result.authorizationState,
                        method: null,
                        permission: null,
                        result: result.authorizationState || "not-applicable"
                    },
                    executed: !!result.application,
                    executionResult: result.application || null
                }] : [],
                clarification: needsClarification ? { needsClarification: true, clarificationText: result.text || null, ambiguousEntities: null } : null,
                learning: learningPlaceholder(),
                provenance: { knowledgeStatus: result.intent === "unsupported" ? "NOT_FOUND" : "SEE_ANSWER_TEXT" },
                metadata: {
                    providerUsed: hintResolution.name || priorActive || livingAI.getActiveProvider(),
                    conversationState: result.conversationState || null
                }
            };
        } catch (err) {
            return makeErrorResponse(request, "INTERNAL_ERROR", (err && err.message) || "Adapter threw an unexpected error.");
        } finally {
            // Restore, unconditionally - this call must never leave a
            // different provider active than it found.
            if (switched) {
                try { livingAI.setActiveProvider(priorActive); } catch (_e) { /* best-effort restore */ }
            }
        }
    }

    /**
     * think(text, options, meta)
     *   Convenience one-call wrapper: createRequest() + handleRequest().
     *   This is the function a future Live Assistant integration would
     *   call instead of window.CozyOS.LivingAI.think() directly, with
     *   IDENTICAL observable behavior (Gate D requirement) plus the
     *   envelope. cozy-living-assistant.js itself is NOT modified to
     *   call this in Phase 5 - see the Phase 5 report's "Modified
     *   files" section for why that integration step was intentionally
     *   left undone this phase.
     */
    async function think(text, options, meta) {
        const request = createRequest(text, options, meta);
        return handleRequest(request);
    }

    /**
     * getProviderState(name)
     *   Real, side-effect-free introspection. Never calls
     *   setActiveProvider() or think(). Distinguishes implemented vs.
     *   registered vs. active using only LivingAI's own existing,
     *   already-safe read methods (listProviders/describeProvider/
     *   getActiveProvider). configured/environmentSupported/reachable/
     *   ready are reported as null ("not measured") here - use
     *   probeProviderReachability() below for an explicit, deliberate,
     *   state-restoring measurement (this is what Gate B actually
     *   does).
     */
    function getProviderState(name) {
        const livingAI = getLivingAI();
        if (!livingAI) {
            return { name, implemented: null, registered: false, configured: null, environmentSupported: null, reachable: null, ready: null, active: false, lastMeasured: null };
        }
        const registered = livingAI.listProviders().indexOf(name) !== -1;
        const active = livingAI.getActiveProvider() === name;
        let implemented = null;
        if (registered) {
            const desc = livingAI.describeProvider(name);
            // The three built-in unconfigured stub slots (cloud-llm,
            // enterprise-byo, research-multi) share this exact, real,
            // existing note text (see cozy-living-ai.js's
            // makeUnconfiguredProvider()) until a real backend replaces
            // them via registerProvider() - this is the one honest,
            // existing signal available to distinguish "stub" from
            // "real provider" without invoking think().
            implemented = !(desc && typeof desc.note === "string" && desc.note.indexOf("Not yet configured") === 0);
        }
        return {
            name,
            implemented,
            registered,
            configured: null, // not measured by this cheap call - see probeProviderReachability()
            environmentSupported: null,
            reachable: null,
            ready: null,
            active,
            lastMeasured: null
        };
    }

    /**
     * probeProviderReachability(name, testPrompt, options)
     *   The ONLY function in this file that temporarily changes the
     *   active provider - and it ALWAYS restores the prior one
     *   afterward (try/finally), even on throw. This is the exact
     *   measurement Gate B performs, made reusable rather than
     *   duplicated in every test. Never invoked automatically by
     *   getProviderState() or by handleRequest()'s normal path.
     */
    async function probeProviderReachability(name, testPrompt, options) {
        const livingAI = getLivingAI();
        if (!livingAI || livingAI.listProviders().indexOf(name) === -1) {
            return { name, reachable: false, ready: false, reason: "Provider is not registered.", lastMeasured: nowIso() };
        }
        const priorActive = livingAI.getActiveProvider();
        try {
            livingAI.setActiveProvider(name);
            const result = await livingAI.think(testPrompt || "test", options || {});
            const reachable = !!result; // a real result object came back at all, success or honest failure
            const ready = !!(result && result.success === true);
            return { name, reachable, ready, reason: (result && result.reason) || null, lastMeasured: nowIso() };
        } catch (err) {
            return { name, reachable: false, ready: false, reason: (err && err.message) || "Probe threw.", lastMeasured: nowIso() };
        } finally {
            try { livingAI.setActiveProvider(priorActive); } catch (_e) { /* best-effort restore */ }
        }
    }

    window.CozyOS.UniversalAIContract = Object.freeze({
        REQUEST_SCHEMA,
        RESPONSE_SCHEMA,
        SUPPORTED_MODALITIES: SUPPORTED_MODALITIES.slice(),
        createRequest,
        handleRequest,
        think,
        getProviderState,
        probeProviderReachability
    });

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["cozy-ai-universal-contract"] = {
        version: "1.0.0-phase5",
        description: "PHASE 5 - Universal Cozy AI Contract Adapter (cozy.ai.request.v1/response.v1). Thin, additive wrapper around the existing, unmodified window.CozyOS.LivingAI.think(). No provider, no cozy-living-assistant.js, and no System-B file was modified to build this. Implements only: request/response envelopes, modality gating (text/voice/ocr/admin-action/app-event only, else UNSUPPORTED_MODALITY), single-select provider-hint resolution (PROVIDER_UNAVAILABLE on unknown hint, never silent substitution), and read-only provider-state introspection (getProviderState = safe/no side effects; probeProviderReachability = explicit, state-restoring measurement). goal/numeric-confidence/intent-learning/knowledge-learning fields are always null/false placeholders - never fabricated. Multi-provider fan-out is structurally impossible here: exactly one provider is ever consulted per request, and the active provider is always restored after a hinted call."
    };
})();
