/**
 * CozyOS Hearing — Provider Adapter Base
 * File Reference: core/modules/hearing/providers/provider-adapter-base.js
 * Layer: Core / Platform Foundation — Provider Template
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 158 — Sound Classification Provider Platform
 *
 * OWNERSHIP
 *   A real, honest TEMPLATE for building a CozyHearing classifier
 *   provider — not a provider itself, not registered anywhere. Exists
 *   so every real provider (Browser, TensorFlow, ONNX, MediaPipe,
 *   Cloud, Local Model, Enterprise, Custom) implements the same real
 *   Classification API shape instead of each inventing its own.
 *   CozyHearing (core/modules/hearing/cozy-hearing.js) remains the only
 *   registry — this file registers nothing.
 *
 * HONEST DEFAULT BEHAVIOR
 *   createProviderAdapter({ backendCheck, classifyImpl, ... }) returns
 *   an object implementing classify/supportsCategory/listCategories/
 *   getCapabilities/getHealth/load/unload/reset. Until backendCheck()
 *   reports a real backend present, getHealth() honestly returns
 *   "Unavailable" and classify() honestly returns isReal:false with a
 *   stated reason — never a fabricated result. This is the same
 *   fail-closed pattern already proven in this codebase (e.g.
 *   AuthFactorRegistry's stub factors, factor-provider-base.js).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ADAPTER_BASE_VERSION = "1.0.0-ENTERPRISE";

    /**
     * createProviderAdapter(config)
     *   config.backendCheck() — real, synchronous or async function
     *     returning true only if a genuine backend is actually present
     *     (e.g. `typeof window.tf !== "undefined"` for a real
     *     TensorFlow.js provider). No default — a provider MUST state
     *     its own real check; there is no generic "assume available."
     *   config.classifyImpl(audioData, options) — called ONLY after
     *     backendCheck() passes; must return a real
     *     {category, confidence, metadata} or throw.
     *   config.categories — real array of categories this backend can
     *     genuinely classify (validated against CozyOS.CozyHearing's
     *     canonical list at registration time by the caller, not here).
     *   config.capabilities — real declared capability flags.
     */
    function createProviderAdapter(config) {
        if (!config || typeof config.backendCheck !== "function") throw new Error("createProviderAdapter requires a real backendCheck() function — no default 'always available' is provided.");
        if (typeof config.classifyImpl !== "function") throw new Error("createProviderAdapter requires a real classifyImpl(audioData, options) function.");
        let loaded = false;

        return {
            async classify(audioData, options = {}) {
                const available = await config.backendCheck();
                if (!available) return { category: "Unknown", confidence: null, isReal: false, metadata: { reason: "Real backend not detected." } };
                if (!loaded && typeof config.load === "function") return { category: "Unknown", confidence: null, isReal: false, metadata: { reason: "Provider backend detected but not yet load()ed." } };
                try {
                    const result = await config.classifyImpl(audioData, options);
                    return { category: result.category, confidence: typeof result.confidence === "number" ? result.confidence : null, isReal: true, metadata: result.metadata || {} };
                } catch (err) {
                    return { category: "Unknown", confidence: null, isReal: false, metadata: { reason: `classifyImpl threw: ${err.message}` } };
                }
            },
            supportsCategory(category) { return Array.isArray(config.categories) && config.categories.includes(category); },
            listCategories() { return Array.isArray(config.categories) ? [...config.categories] : []; },
            getCapabilities() { return config.capabilities && typeof config.capabilities === "object" ? { ...config.capabilities } : {}; },
            async getHealth() {
                const available = await config.backendCheck();
                if (!available) return { state: "Unavailable", reason: "Real backend not detected." };
                return { state: loaded || typeof config.load !== "function" ? "Ready" : "Loading" };
            },
            async load() {
                const available = await config.backendCheck();
                if (!available) return { success: false, reason: "Real backend not detected — nothing to load." };
                if (typeof config.load === "function") { const r = await config.load(); loaded = r !== false; return { success: loaded }; }
                loaded = true;
                return { success: true };
            },
            async unload() {
                if (typeof config.unload === "function") await config.unload();
                loaded = false;
                return { success: true };
            },
            async reset() {
                if (typeof config.reset === "function") await config.reset();
                return { success: true };
            }
        };
    }

    if (window.CozyOS.HearingProviderAdapterBase && window.CozyOS.HearingProviderAdapterBase.getVersion && window.CozyOS.HearingProviderAdapterBase.getVersion() !== ADAPTER_BASE_VERSION) {
        throw new Error("[CozyOS] VERSION_CONFLICT: HearingProviderAdapterBase.");
    }
    window.CozyOS.HearingProviderAdapterBase = { getVersion: () => ADAPTER_BASE_VERSION, createProviderAdapter };
})();
