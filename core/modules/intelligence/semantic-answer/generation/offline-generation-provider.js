/**
 * CozyAI — Offline Generation Provider (SA-4 extension: GENERATIVE_OFFLINE)
 * File Reference: core/modules/intelligence/semantic-answer/generation/offline-generation-provider.js
 *
 * WHAT THIS IS
 *   The one real, in-browser text-generation runtime SA-4's optional
 *   generative path (language-realizer.js's realizeCandidateSentenceGenerative())
 *   calls into. Wraps @wllama/wllama (llama.cpp compiled to WebAssembly,
 *   MIT license) running INSIDE the browser page itself — chosen
 *   specifically because that architecture is the only one that can pass
 *   a real "network disabled, zero requests during generation" offline
 *   test: once the model bytes are already in the WASM heap, inference
 *   makes no network call of any kind, ever.
 *
 *   This file is a thin, generic "run a chat completion against a local
 *   model" utility. It owns NO knowledge of plans/claims/evidence/goals —
 *   that grounding logic (which real facts go into the prompt) is SA-4's
 *   own job, per language-realizer.js's own header ("This file's own
 *   contribution is COMPOSITION"). Keeping prompt construction there,
 *   not here, means this provider stays a reusable, swappable runtime
 *   seam — a different model/runtime could replace it without SA-4's
 *   grounding discipline moving anywhere.
 *
 * NEVER LOADED EAGERLY
 *   Nothing in this file runs at <script> parse time beyond registering
 *   this object. The ~8.8MB vendored wllama runtime (JS + .wasm) and the
 *   322MB model file are only ever fetched the FIRST time generate() is
 *   actually called — never at page load, never speculatively.
 *
 * WHY VENDORED, NOT CDN
 *   cdn.jsdelivr.net / cdnjs.cloudflare.com / unpkg.com are network-
 *   policy-blocked in this project's sandbox (confirmed by direct testing
 *   — see the offline-generation task's own environment notes). The
 *   wllama runtime (JS bundle + .wasm) is therefore vendored into this
 *   repo at ./vendor/wllama/ (MIT-licensed, ~8.8MB, checked into git —
 *   distinct from the 322MB model weights, which are gitignored and
 *   fetched separately by scripts/offline-model/fetch-offline-model.js).
 *
 * HONEST FAILURE MODES — never a fabricated success
 *   generate() never throws. Every failure (no browser/WASM support, the
 *   model file was never fetched by fetch-offline-model.js, a real
 *   inference error, empty model output) comes back as a real, disclosed
 *   {available, success, reason} shape. The CALLER (language-realizer.js)
 *   is the only place that decides what each failure means for
 *   candidate.generation.realizationMode (UNAVAILABLE vs
 *   COMPOSED_FALLBACK) — this file only reports what actually happened.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa4-gen";
    if (window.CozyOS.Modules["offline-generation-provider"]) return;

    // Path constants — served by the SAME static origin dashboard.html
    // itself loads from (see core/tests/browser/cozy-browser.js's static
    // server, rooted at the real repo tree; in production this is
    // whatever host serves the CozyOS repo's own files). Root-relative so
    // this works regardless of which page includes this module.
    //
    // MODEL_URL's filename must match scripts/offline-model/fetch-offline-model.js's
    // MODEL.fileName exactly. Kept as two independent string constants
    // (one Node-side, one browser-side) rather than a shared module,
    // since the fetch script runs under Node and this file only ever
    // runs inside a browser page — never assume they drift in sync
    // silently; MODEL_URL is exported below precisely so a test can
    // assert the two agree.
    const MODEL_URL = "/.cozy-offline-model/tinyllama-1.1b-chat-v1.0.IQ2_XXS.gguf";
    const WLLAMA_MODULE_URL = "/core/modules/intelligence/semantic-answer/generation/vendor/wllama/wllama.esm.js";
    const WLLAMA_WASM_URL = "/core/modules/intelligence/semantic-answer/generation/vendor/wllama/wllama.wasm";

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    // Lazily created on the first real generate() call; never at module
    // load. Rejected load attempts are NOT cached (a transient failure —
    // e.g. the model genuinely hasn't been fetched YET — must not
    // permanently poison every later call in the same page session).
    let loadingPromise = null;

    /**
     * isEnvironmentCapable()
     *   Real, synchronous, zero-cost capability probe — never fetches,
     *   never loads anything. Callers (language-realizer.js) use this to
     *   decide whether even attempting generate() is worthwhile, without
     *   paying for a failed async round-trip first.
     */
    function isEnvironmentCapable() {
        return typeof window !== "undefined"
            && typeof window.fetch === "function"
            && typeof WebAssembly !== "undefined";
    }

    async function loadWllamaInstance() {
        if (!loadingPromise) {
            loadingPromise = (async () => {
                const mod = await import(/* webpackIgnore: true */ WLLAMA_MODULE_URL);
                const Wllama = mod.Wllama;
                if (typeof Wllama !== "function") throw new Error("vendored wllama.esm.js did not export a Wllama constructor.");
                const wllama = new Wllama({ default: WLLAMA_WASM_URL });
                // n_threads:1 — this sandbox's confirmed 4-core/no-GPU
                // machine and the single (no multi-thread variant)
                // vendored .wasm build both make single-thread the real,
                // honest choice; it also avoids requiring cross-origin-
                // isolation (COOP/COEP) headers this repo's plain static
                // servers don't set.
                await wllama.loadModelFromUrl(MODEL_URL, { n_threads: 1, n_ctx: 2048 });
                return wllama;
            })().catch((err) => {
                loadingPromise = null; // do not poison future attempts on a transient failure
                throw err;
            });
        }
        return loadingPromise;
    }

    /**
     * generate({messages, maxTokens, temperature})
     *   messages — real OAI-style chat messages ([{role, content}, ...])
     *   ALREADY built by the caller from real evidence (see
     *   language-realizer.js's buildGenerativePrompt()) — this file
     *   never inspects or shapes their content.
     */
    async function generate({ messages, maxTokens = 128, temperature = 0.7 } = {}) {
        if (!isEnvironmentCapable()) return { available: false, success: false, reason: "NO_BROWSER_WASM_ENVIRONMENT" };
        if (!Array.isArray(messages) || messages.length === 0) return { available: true, success: false, reason: "NO_PROMPT_MESSAGES" };

        let wllama;
        try {
            wllama = await loadWllamaInstance();
        } catch (err) {
            return { available: false, success: false, reason: "MODEL_LOAD_FAILED", error: String((err && err.message) || err) };
        }

        try {
            const response = await wllama.createChatCompletion({
                messages, max_tokens: maxTokens, temperature, top_k: 40, top_p: 0.9,
            });
            const choice = response && Array.isArray(response.choices) ? response.choices[0] : null;
            const text = choice && choice.message && choice.message.content;
            if (!isNonEmptyString(text)) return { available: true, success: false, reason: "EMPTY_MODEL_OUTPUT" };
            return { available: true, success: true, text: text.trim() };
        } catch (err) {
            return { available: true, success: false, reason: "INFERENCE_ERROR", error: String((err && err.message) || err) };
        }
    }

    /** Real teardown — frees the WASM heap. Never required by callers; exposed for tests that load/unload repeatedly in one page. */
    async function unload() {
        const pending = loadingPromise;
        loadingPromise = null;
        if (!pending) return;
        try {
            const wllama = await pending;
            if (wllama && typeof wllama.exit === "function") await wllama.exit();
        } catch (_err) { /* best-effort teardown only */ }
    }

    const OfflineGenerationProvider = Object.freeze({
        generate, isEnvironmentCapable, unload,
        getVersion: () => MODULE_VERSION,
        MODEL_URL, WLLAMA_MODULE_URL, WLLAMA_WASM_URL,
    });
    window.CozyOS.OfflineGenerationProvider = OfflineGenerationProvider;
    window.CozyOS.Modules["offline-generation-provider"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-4 extension — Offline Generation Provider. Generic, plan/evidence-agnostic wrapper around @wllama/wllama (llama.cpp -> WASM, MIT), vendored locally (no CDN) so inference runs entirely inside the browser page with zero network requests once the model is loaded. Lazily loads the ~8.8MB vendored runtime + the (separately-fetched, gitignored) local model file only on the first real generate() call — never at page load. Never throws; every failure is a real, disclosed {available,success,reason}. Owns no prompt/grounding logic — language-realizer.js (SA-4) builds prompts from real evidence and is the only place that maps this file's outcomes onto candidate.generation.realizationMode."
    });
})();
