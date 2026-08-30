/**
 * CozyOS Gemini Cloud Provider — core/living/providers/gemini-cloud-provider.js
 * Phase: 10C-3D
 *
 * OWNERSHIP
 *   Implements exactly one thing: a CozyLivingAI-compatible provider
 *   object ({ think(text, options), describe() }), matching the EXACT
 *   contract core/living/cozy-living-ai.js already defines and already
 *   uses for its "cloud-llm" slot. This file does not modify
 *   cozy-living-ai.js, cognitive-coordinator.js, or cozy-thinking.js —
 *   confirmed unnecessary by the Phase 10C-3C architecture audit.
 *
 * SECRET BOUNDARY
 *   This file NEVER holds, reads, or references a Gemini API key. It
 *   only calls a same-origin CozyOS backend endpoint (see
 *   server/ai/gemini-backend-endpoint.js) via fetch(). The key lives
 *   exclusively on the server side of that boundary.
 *
 * HONESTY DISCIPLINE (matching cozy-living-ai.js's existing providers)
 *   - Never fabricates isReal:true. isReal is only ever whatever the
 *     backend actually reported.
 *   - Never invents a response when the backend call fails — returns
 *     {success:false, reason} exactly as LivingAI's own provider
 *     contract requires, same as makeUnconfiguredProvider() does today.
 *   - Network/parse errors are caught and turned into an honest
 *     {success:false, reason} — never thrown out to the caller.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Node (tests)
    } else {
        // Real browser <script> load. Phase 10C-3E fix: this previously
        // assigned root.CozyOS.createGeminiCloudProvider = factory()
        // directly, which put the ENTIRE {createGeminiCloudProvider,
        // registerGeminiCloudProvider} object under the
        // createGeminiCloudProvider key instead of exposing both
        // functions as top-level CozyOS properties — so
        // window.CozyOS.registerGeminiCloudProvider never actually
        // existed in a real browser. Never caught by Phase 10C-3D's own
        // tests because they only ever load this file via require()
        // (the module.exports branch above), never as an actual
        // <script> tag. See core/living/tests/gemini-cloud-provider.test.js
        // test "13" (added Phase 10C-3E) for the regression test.
        root.CozyOS = root.CozyOS || {};
        Object.assign(root.CozyOS, factory());
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /**
     * createGeminiCloudProvider({ backendUrl, fetchImpl })
     *   backendUrl  Same-origin path to the CozyOS Gemini backend
     *               endpoint (server/ai/gemini-backend-endpoint.js).
     *               Defaults to "/ai/gemini".
     *   fetchImpl   Injectable fetch, defaults to global fetch. Lets
     *               tests exercise this without a real network/DOM.
     *   Returns a real provider object implementing the exact
     *   { think(text, options) -> {success, result|reason},
     *     describe() -> {...} } contract CozyLivingAI's
     *   AIProviderRegistry requires.
     */
    function createGeminiCloudProvider({ backendUrl = '/ai/gemini', fetchImpl } = {}) {
        const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);

        return {
            async think(text, options = {}) {
                if (typeof text !== 'string' || !text.trim()) {
                    return { success: false, reason: 'A real, non-empty text prompt is required.' };
                }
                if (!doFetch) {
                    return { success: false, reason: 'No fetch implementation available to reach the Gemini backend.' };
                }
                let response;
                try {
                    response = await doFetch(backendUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, options }),
                    });
                } catch (e) {
                    return { success: false, reason: `Could not reach the Gemini backend: ${e && e.message ? e.message : 'network error'}` };
                }
                let data;
                try {
                    data = await response.json();
                } catch (_e) {
                    return { success: false, reason: 'Gemini backend returned a non-JSON response.' };
                }
                if (!response.ok || !data || data.success !== true) {
                    // data.reason comes from the backend's own closed set of
                    // generic reason codes (see GENERIC_FAILURE_REASONS in
                    // gemini-backend-endpoint.js) — never a raw upstream
                    // error and never anything key-shaped.
                    return { success: false, reason: (data && data.reason) || `Gemini backend returned HTTP ${response.status}.` };
                }
                return {
                    success: true,
                    result: {
                        text: data.text,
                        isReal: data.isReal === true,
                        provider: 'gemini-api',
                        model: data.model,
                        latencyMs: data.latencyMs,
                        correlationId: data.correlationId,
                    },
                };
            },
            describe() {
                return {
                    kind: 'gemini-api (cloud)',
                    isLLM: true,
                    offline: false,
                    note: 'Real HTTP call to a same-origin CozyOS backend endpoint that holds the Gemini credential server-side. This file never sees the credential.',
                };
            },
        };
    }

    /**
     * registerGeminiCloudProvider(livingAI, opts)
     *   Additive helper — calls the EXISTING, unmodified
     *   CozyLivingAI.registerProvider() public method. Registers under
     *   "gemini-api" (a new, explicit id) rather than silently
     *   overwriting the pre-existing "cloud-llm" placeholder slot, so
     *   callers can still explicitly select either id and nothing about
     *   cozy-living-ai.js's default behavior changes by loading this
     *   file. A deployment that wants "cloud-llm" itself to mean Gemini
     *   can additionally call
     *   livingAI.registerProvider('cloud-llm', provider) itself — a
     *   one-line caller decision, not something this file assumes.
     */
    function registerGeminiCloudProvider(livingAI, opts = {}) {
        if (!livingAI || typeof livingAI.registerProvider !== 'function') {
            return { success: false, reason: 'A real CozyLivingAI instance with registerProvider() is required.' };
        }
        const provider = createGeminiCloudProvider(opts);
        return { ...livingAI.registerProvider('gemini-api', provider), provider };
    }

    return { createGeminiCloudProvider, registerGeminiCloudProvider };
});
