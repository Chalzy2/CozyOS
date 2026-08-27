/**
 * CozyOS Gemini Cloud Provider — Bootstrap
 * core/living/providers/gemini-cloud-provider-bootstrap.js
 * Phase: 10C-3E — Real Gemini Runtime Integration
 *
 * OWNERSHIP
 *   This file does exactly one thing: on load, if the real, unmodified
 *   window.CozyOS.LivingAI (core/living/cozy-living-ai.js) and the real,
 *   unmodified window.CozyOS.createGeminiCloudProvider factory
 *   (core/living/providers/gemini-cloud-provider.js) are both present,
 *   it calls LivingAI's own EXISTING, PUBLIC registerProvider() method
 *   (via registerGeminiCloudProvider(), also unmodified from Phase
 *   10C-3D) to register "gemini-api" into the registry.
 *
 *   This mirrors the exact activation discipline already established by
 *   core/modules/intelligence/providers/on-device-conversational-provider.js
 *   (read before writing this file): registration only fills a registry
 *   slot. It is NOT the same thing as activation.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Never calls setActiveProvider(). The default active provider
 *     remains "reasoning-pipeline", exactly as cozy-living-ai.js's own
 *     constructor already sets it — untouched by this phase, per this
 *     phase's explicit instruction not to modify the default provider.
 *   - Never reads process.env or any credential. Never modifies
 *     gemini-cloud-provider.js, gemini-backend-endpoint.js, or
 *     cozy-living-ai.js — those three files are loaded and used exactly
 *     as they shipped in Phase 10C-3D.
 *   - Never fabricates registration success. If either real dependency
 *     is missing (e.g. this script loads before cozy-living-ai.js by
 *     mistake, or the provider factory failed to load), this file
 *     reports that honestly via onBootstrapEvent (default: console.warn)
 *     rather than silently doing nothing or pretending success.
 *
 * LOAD ORDER REQUIREMENT
 *   Must load after BOTH:
 *     <script src="core/living/cozy-living-ai.js"></script>
 *     <script src="core/living/providers/gemini-cloud-provider.js"></script>
 *   This file does not defer/retry — dashboard.html and index.html both
 *   load scripts synchronously in document order, so by the time this
 *   tag executes, both dependencies above (declared before it) have
 *   already run. This is a design choice, not an oversight: silently
 *   retrying on a timer could mask a real load-order regression instead
 *   of surfacing it.
 *
 * IDEMPOTENT
 *   Calling this twice (e.g. a duplicate script tag) is safe: the
 *   underlying AIProviderRegistry.register() is a Map.set() by name, so
 *   a second registration just replaces the same "gemini-api" entry
 *   with an equivalent provider object — it does not throw, does not
 *   duplicate list() entries, and does not change the active provider.
 */
(function (root) {
    'use strict';
    root.CozyOS = root.CozyOS || {};
    const Modules = (root.CozyOS.Modules = root.CozyOS.Modules || {});
    if (Modules['gemini-cloud-provider-bootstrap']) return;
    Modules['gemini-cloud-provider-bootstrap'] = { version: '1.0.0' };

    function emit(event, detail) {
        const hook = root.CozyOS && root.CozyOS.onBootstrapEvent;
        if (typeof hook === 'function') {
            try { hook(event, detail); return; } catch (_e) { /* fall through to console */ }
        }
        if (event === 'GEMINI_BOOTSTRAP_SKIPPED' && typeof console !== 'undefined' && console.warn) {
            console.warn('[gemini-cloud-provider-bootstrap]', detail);
        }
    }

    const livingAI = root.CozyOS.LivingAI;
    const factory = root.CozyOS.createGeminiCloudProvider ? root.CozyOS : null;

    if (!livingAI || typeof livingAI.registerProvider !== 'function') {
        emit('GEMINI_BOOTSTRAP_SKIPPED', 'window.CozyOS.LivingAI is not loaded yet — check that cozy-living-ai.js loads before this file.');
        return;
    }
    if (!factory || typeof factory.registerGeminiCloudProvider !== 'function') {
        emit('GEMINI_BOOTSTRAP_SKIPPED', 'window.CozyOS.registerGeminiCloudProvider is not loaded yet — check that gemini-cloud-provider.js loads before this file.');
        return;
    }

    const activeBefore = livingAI.getActiveProvider();
    const result = factory.registerGeminiCloudProvider(livingAI, { backendUrl: '/ai/gemini' });

    if (!result || !result.success) {
        emit('GEMINI_BOOTSTRAP_FAILED', (result && result.reason) || 'registerGeminiCloudProvider() returned an unexpected shape.');
        return;
    }
    // Defence-in-depth, not just documentation: verify registration truly
    // left the active provider untouched before declaring success. If a
    // future change to registerProvider()'s auto-activation-of-first-
    // provider rule ever made this file dangerous, this catches it here
    // rather than silently shipping a changed default.
    const activeAfter = livingAI.getActiveProvider();
    if (activeAfter !== activeBefore) {
        emit('GEMINI_BOOTSTRAP_FAILED', `Registering gemini-api unexpectedly changed the active provider from "${activeBefore}" to "${activeAfter}". This should never happen for a non-first registration.`);
        return;
    }
    emit('GEMINI_BOOTSTRAP_REGISTERED', { activeProvider: activeAfter });
})(typeof window !== 'undefined' ? window : globalThis);

// Node-safe export for structural/regression testing only (RP-10C-3E).
// A classic <script> tag in the browser never defines `module`, so this
// is a no-op there — browser behavior above is unaffected.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {}; // the IIFE above already ran against globalThis; nothing further to export
}
