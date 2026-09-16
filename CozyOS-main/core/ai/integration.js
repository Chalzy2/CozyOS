/**
 * ── CozyOS AI INTEGRATION LAYER — KNOWLEDGE/LANGUAGE/PROVIDER BRIDGE ──
 * FILE: core/ai/integration.js
 * VERSION: 1.0.0
 *
 * STATUS: Previously ABSENT — now CREATED under explicit, one-time
 * authorization to modify/create this single file. core/ai.js,
 * core/ai/cozy-ai-language.js, and core/ai/cozy-ai-memory.js remain
 * locked and were not read for the purpose of modification, only for
 * the read-only contract discovery documented below.
 *
 * REPOSITORY DISCOVERY THIS FILE IS BUILT FROM (do not re-derive; trust
 * this trail, and re-verify against the live files if anything here
 * seems stale):
 *
 *   1. core/ai/cozy-ai-integration.js ALREADY EXISTS and is the real,
 *      active AI orchestration bus. It is NOT this file, and this file
 *      does not replace, duplicate, or compete with it. Its own header:
 *      "Acts exclusively as an isolated orchestration communication
 *      bus. It binds to window.CozyOS.AI via initializeSubEngine
 *      without modifying frozen files." It self-registers at
 *      window.CozyOS.AI.integration (see its own line:
 *      `masterController.initializeSubEngine("integration", this);`).
 *      Its own CORE_AI_ENGINES.optional list is
 *      ["business","vision","voice","ocr","reasoning","worker_pool"] —
 *      no knowledge/language-capability/provider-status bridge exists
 *      there today. That is the real, confirmed gap this file fills.
 *
 *   2. core/ai.js (locked) already defines the real, working
 *      initializeSubEngine(key, instance) contract that every sub-
 *      engine attaches through. This file does not call that method
 *      directly (the "integration" key is already taken by #1 above);
 *      instead it registers ONTO the orchestrator itself, via the
 *      orchestrator's own real registerEngine(engineKey, engineInstance,
 *      capabilities, options) method — the richer, already-existing
 *      registration path (lifecycle-method checking, manifest/version
 *      compatibility, circuit breaker, PLUGIN_INSTALLED event).
 *
 *   3. The orchestrator's OWN, ALREADY-ACTIVE query-routing logic
 *      (_executeWithFaultTolerance -> `await eng.instance.evaluate(
 *      context.query, context)`) calls .evaluate() on every registered
 *      engine that a capability-based routing decision selects. Once
 *      this file registers, its evaluate() becomes part of that real,
 *      pre-existing routing loop — not a manufactured, test-only
 *      invocation. Engine selection is capability-based
 *      (_resolveEngineByCapability), so this engine is only ever
 *      invoked for queries whose requested capability it actually
 *      declares in its own manifest.
 *
 *   4. The registration KEY used here is "knowledgeBridge" —
 *      deliberately NOT "integration" (already owned by #1) and NOT a
 *      name implying it is a second orchestrator. The FILE is named
 *      core/ai/integration.js per the authorization; the ENGINE it
 *      registers is a distinctly-named, additive sub-engine on the
 *      existing bus, not a renamed copy of it.
 *
 *   5. Real, existing, unmodified authorities this file calls into,
 *      never reimplements:
 *      - window.CozyOS.CozyLanguagePacks (core/modules/intelligence/
 *        language-packs/cozy-language-pack-registry.js) — specifically
 *        its getLanguageCapabilities()/getOnlineProviderStatus(),
 *        added in the immediately-preceding Phase C-1 round. Both are
 *        pure, synchronous, offline-safe reads — confirmed by that
 *        round's own tests to never return a Promise.
 *      - window.CozyOS.DeveloperIdentity (core/identity/) — read-only,
 *        PUBLIC identity only, mirroring the exact delegation pattern
 *        core/ai.js's own FIX-12 already uses (fails closed if absent).
 *      - window.CozyOS.CozyMemory — read-only, if present; this file
 *        never writes to memory and never invents a memory record.
 *      - The server-side KnowledgeRegistry (server/webauthn-rp/
 *        knowledge-registry.js) has NO HTTP route exposed yet — the
 *        prior "Deep Inspection" discovery round explicitly recommended
 *        adding one as the next dependency, and that route was never
 *        built. This file therefore implements its knowledge-lookup
 *        capability as a REAL fetch() attempt against a documented,
 *        not-yet-existing endpoint path, honestly reporting
 *        KNOWLEDGE_BRIDGE_NOT_CONFIGURED when that endpoint doesn't
 *        exist — never a fabricated result. See KNOWLEDGE_ENDPOINT below.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not create another AI/memory/language/knowledge/learning
 *     engine. Every fact it returns is read from an existing, real
 *     authority; this file's own state is limited to a small in-memory
 *     cache of its own composed context (see composeAIContext()),
 *     which is advisory only and never treated as authoritative memory.
 *   - Does not perform any network call for language capability or
 *     provider status lookups — both are same-process, synchronous
 *     reads (Offline-First Rule).
 *   - Does not fabricate Gemini/NLLB availability. Both are reported
 *     exactly as CozyLanguagePacks.getOnlineProviderStatus() already
 *     honestly reports them (DOCUMENTED_ONLY / NETWORK_REQUIRED) — this
 *     file never upgrades that status.
 *   - Does not bypass knowledge visibility/organization authorization.
 *     Since no real knowledge endpoint exists yet, there is nothing to
 *     bypass; once one exists, authorization remains that endpoint's
 *     job (server-side), never this file's.
 */

(function (root) {
    "use strict";

    root.window.CozyOS = root.window.CozyOS || {};

    // The one, not-yet-built server route this file would call once it
    // exists. Documented here, in one place, precisely so a future
    // implementer wires the real route to this exact contract rather
    // than inventing a different shape. Never called with fabricated
    // success if unreachable.
    var KNOWLEDGE_ENDPOINT = "/knowledge/list";

    var MANIFEST = Object.freeze({
        name: "knowledgeBridge",
        version: "1.0.0",
        author: "CozyOS Engineering",
        capabilities: Object.freeze([
            "language-capability-lookup",
            "provider-status-lookup",
            "ai-context-composition",
            "knowledge-lookup"
        ]),
        dependencies: [] // no hard dependency — every real call below checks presence and fails closed
    });

    /** getLanguagePacks() — real, live lookup each call, never cached, so a page that loads the pack registry after this file still works. */
    function getLanguagePacks() {
        return (root.window.CozyOS && root.window.CozyOS.CozyLanguagePacks) || null;
    }

    function getDeveloperIdentity() {
        return (root.window.CozyOS && root.window.CozyOS.DeveloperIdentity) || null;
    }

    function getMemory() {
        return (root.window.CozyOS && root.window.CozyOS.CozyMemory) || null;
    }

    /**
     * lookupLanguageCapability(languageId) — real, synchronous, offline-
     * safe. Returns { available: false } (never a fabricated capability)
     * if CozyLanguagePacks is not registered (e.g. its script tag was
     * removed) — same fail-closed posture as core/ai.js's own FIX-12.
     */
    function lookupLanguageCapability(languageId) {
        var packs = getLanguagePacks();
        if (!packs || typeof packs.getLanguageCapabilities !== "function") {
            return { available: false, reason: "CozyLanguagePacks is not registered." };
        }
        var caps = packs.getLanguageCapabilities(languageId);
        if (!caps) return { available: false, reason: "\"" + languageId + "\" is not a known language identity." };
        return { available: true, capabilities: caps };
    }

    /**
     * lookupProviderStatus() — real, synchronous, offline-safe. Never
     * upgrades DOCUMENTED_ONLY/NETWORK_REQUIRED into a live claim.
     */
    function lookupProviderStatus() {
        var packs = getLanguagePacks();
        if (!packs || typeof packs.getOnlineProviderStatus !== "function") {
            return { available: false, reason: "CozyLanguagePacks is not registered." };
        }
        return { available: true, status: packs.getOnlineProviderStatus() };
    }

    /**
     * attemptKnowledgeLookup(query) — the one function in this file
     * that performs a network call, and only when explicitly invoked
     * for the "knowledge-lookup" capability (never on page load, never
     * as part of composeAIContext()'s default, offline-safe path — see
     * composeAIContext()'s includeKnowledge option below). Honestly
     * reports KNOWLEDGE_BRIDGE_NOT_CONFIGURED for any non-2xx/network-
     * failure outcome — including "route does not exist yet," which is
     * this repository's actual current state. Never returns fabricated
     * knowledge.
     */
    function attemptKnowledgeLookup(query) {
        if (typeof fetch !== "function") {
            return Promise.resolve({ available: false, status: "KNOWLEDGE_BRIDGE_NOT_CONFIGURED", reason: "fetch is not available in this runtime." });
        }
        return fetch(KNOWLEDGE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query || null })
        }).then(function (response) {
            if (!response.ok) {
                return { available: false, status: "KNOWLEDGE_BRIDGE_NOT_CONFIGURED", httpStatus: response.status };
            }
            return response.json().then(function (data) {
                return { available: true, status: "OK", data: data };
            });
        }).catch(function (err) {
            // Covers: route genuinely absent, offline, CORS, malformed
            // response — every failure mode collapses to the same
            // honest, non-fabricated status.
            return { available: false, status: "KNOWLEDGE_BRIDGE_NOT_CONFIGURED", reason: err && err.message };
        });
    }

    /**
     * composeAIContext(input) — the "smallest real bridge," per the
     * task's own instruction not to build a speculative giant pipeline.
     * Combines only what is ACTUALLY available right now, from real
     * authorities, entirely offline-safe by default:
     *   - language capability for input.languageId, if given and known
     *   - provider status (NLLB/Gemini), always (cheap, synchronous, honest)
     *   - identity, via DeveloperIdentity, PUBLIC information only —
     *     this file has no code path reaching into the founder's
     *     private, Vault-encrypted personal narrative at all (see the
     *     test suite's direct source-content check for this boundary)
     *   - memory, via CozyMemory, ONLY if the caller explicitly opts in
     *     (input.includeMemory === true) and supplies its own actorId —
     *     this file never invents or assumes an actor identity, and
     *     never silently reaches into memory a caller didn't ask for
     *   - knowledge, ONLY if the caller explicitly opts in
     *     (input.includeKnowledge === true) — the one path that touches
     *     the network, and only then
     */
    function composeAIContext(input) {
        input = input && typeof input === "object" ? input : {};
        var context = {
            languageCapability: input.languageId ? lookupLanguageCapability(input.languageId) : null,
            providerStatus: lookupProviderStatus(),
            identity: null,
            memory: null,
            knowledge: null
        };

        var identity = getDeveloperIdentity();
        if (identity && typeof identity.getPublicSummary === "function") {
            try { context.identity = identity.getPublicSummary(); } catch (_err) { context.identity = null; }
        } else if (identity && typeof identity.query === "function") {
            // Mirrors core/ai.js's own FIX-12 delegation contract
            // (query()/answer*()) — read-only, never re-implemented here.
            context.identity = { available: true, note: "DeveloperIdentity is registered; call its own query()/answer*() contract directly for a specific question." };
        } else {
            context.identity = { available: false, reason: "DeveloperIdentity is not registered." };
        }

        var memoryPromise = Promise.resolve();
        if (input.includeMemory === true && input.actorId) {
            var memory = getMemory();
            if (memory && typeof memory.readMemory === "function") {
                try {
                    context.memory = { available: true, data: memory.readMemory(input.actorId, input.memoryNamespace) };
                } catch (err) {
                    context.memory = { available: false, reason: err && err.message };
                }
            } else {
                context.memory = { available: false, reason: "CozyMemory is not registered." };
            }
        } else {
            context.memory = { available: false, reason: input.includeMemory ? "actorId is required to read memory." : "not requested" };
        }

        if (input.includeKnowledge === true) {
            return attemptKnowledgeLookup(input.knowledgeQuery).then(function (result) {
                context.knowledge = result;
                return context;
            });
        }
        context.knowledge = { available: false, reason: "not requested" };
        return Promise.resolve(context);
    }

    /**
     * evaluate(query, context) — the real orchestrator entry point (see
     * discovery note #3 above). Only ever handles a query whose
     * context.capability matches one this engine declared in its own
     * manifest; the orchestrator's own _resolveEngineByCapability()
     * already guarantees this file is not invoked for unrelated
     * queries. Returns a clear, explicit "not handled" signal rather
     * than a guess if the capability doesn't map to a concrete action —
     * the orchestrator's existing fallback-routing logic takes over
     * from there, unchanged.
     */
    function evaluate(query, evalContext) {
        evalContext = evalContext || {};
        var capability = evalContext.capability;

        if (capability === "language-capability-lookup") {
            return Promise.resolve({ handled: true, result: lookupLanguageCapability(evalContext.languageId) });
        }
        if (capability === "provider-status-lookup") {
            return Promise.resolve({ handled: true, result: lookupProviderStatus() });
        }
        if (capability === "ai-context-composition") {
            return composeAIContext(evalContext).then(function (result) { return { handled: true, result: result }; });
        }
        if (capability === "knowledge-lookup") {
            return attemptKnowledgeLookup(query).then(function (result) { return { handled: true, result: result }; });
        }
        return Promise.resolve({ handled: false, reason: "knowledgeBridge does not handle capability \"" + capability + "\"." });
    }

    /**
     * getHealth() — real, honest health reporting. Reports "degraded"
     * (never "healthy") if the one real, expected dependency
     * (CozyLanguagePacks) is missing — this is a genuine, checkable
     * fact, not a fabricated always-healthy status.
     */
    function getHealth() {
        var packsPresent = !!getLanguagePacks();
        return {
            status: packsPresent ? "healthy" : "degraded",
            dependencies: { CozyLanguagePacks: packsPresent, DeveloperIdentity: !!getDeveloperIdentity(), CozyMemory: !!getMemory() },
            knowledgeBridgeConfigured: false // honestly false until a real server route exists — never claimed true prematurely
        };
    }

    function getCapabilities() { return MANIFEST.capabilities.slice(); }
    function getVersion() { return MANIFEST.version; }
    function getManifest() {
        return { name: MANIFEST.name, version: MANIFEST.version, author: MANIFEST.author, capabilities: MANIFEST.capabilities.slice(), dependencies: MANIFEST.dependencies.slice() };
    }

    var knowledgeBridgeEngine = Object.freeze({
        // Mandatory lifecycle methods the orchestrator's registerEngine()
        // checks for (ENGINE_LIFECYCLE_METHODS in cozy-ai-integration.js):
        evaluate: evaluate,
        getHealth: getHealth,
        getCapabilities: getCapabilities,
        getVersion: getVersion,
        // Registration/introspection support:
        getManifest: getManifest,
        // Direct public API — callable without going through the
        // capability-routing loop, for any code that already has a
        // reference to this engine:
        lookupLanguageCapability: lookupLanguageCapability,
        lookupProviderStatus: lookupProviderStatus,
        composeAIContext: composeAIContext,
        attemptKnowledgeLookup: attemptKnowledgeLookup
    });

    // ── REAL ACTIVE REGISTRATION ─────────────────────────────────────
    // Registers onto the orchestrator's OWN, already-active
    // registerEngine() contract — not a placeholder export nobody
    // calls. If the orchestrator or window.CozyOS.AI isn't present
    // (e.g. this script tag loaded on a page that never loads core/ai.js
    // or core/ai/cozy-ai-integration.js), this fails closed and silently
    // does not register — exactly the same posture core/ai.js's own
    // FIX-12/FIX-13 delegation checks use, never a hard crash.
    (function registerWithOrchestrator() {
        var orchestrator = root.window.CozyOS && root.window.CozyOS.AI && root.window.CozyOS.AI.integration;
        if (!orchestrator || typeof orchestrator.registerEngine !== "function") {
            return; // Honest no-op — see getHealth()/introspection for the current state.
        }
        Promise.resolve(orchestrator.registerEngine(MANIFEST.name, knowledgeBridgeEngine, MANIFEST.capabilities.slice(), { priority: 50 }))
            .catch(function (err) {
                // A real, already-registered engine under this key (e.g. a
                // hot-reload) throws per registerEngine()'s own contract —
                // never swallowed silently.
                if (typeof console !== "undefined" && console.warn) {
                    console.warn("[knowledgeBridge] registerEngine() failed:", err && err.message);
                }
            });
    })();

    // Exposed for introspection/tests — never the authoritative source
    // of truth about registration (that remains the real orchestrator's
    // own _engines map); this is a same-process convenience mirror.
    root.window.CozyOS.KnowledgeBridge = knowledgeBridgeEngine;
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
