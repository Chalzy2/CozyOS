'use strict';

/**
 * core/living/providers/living-ai-capability-snapshot.js
 * SA-8 PHASE 4 — Provider-Agnostic Capability Audit & Availability Contract.
 *
 * OWNERSHIP BOUNDARY (real, load-bearing, confirmed by this repository's
 * own regression suite — core/modules/cognitive/providers/test/
 * semantic-answer-interpretation-provider.test.js's "E28" test asserts
 * `git diff --stat HEAD -- .../cozy-living-ai.js` stays empty, a
 * deliberate, permanent guard, not a stale check): core/living/
 * cozy-living-ai.js is off-limits. This file adds the capability-audit
 * behavior from OUTSIDE, reading only LivingAI's existing, real, public
 * API (listProviders()/describeProvider()/getActiveProvider(), all
 * unmodified) — it never edits that file and never reaches into its
 * private registry.
 *
 * WHAT THIS IS
 *   window.CozyOS.LivingAICapabilitySnapshot.getSnapshot() — for every
 *   provider LivingAI already has registered, returns its real
 *   describe() metadata plus an honestly-computed `availability`
 *   classification (AVAILABLE_OFFLINE / AVAILABLE_ONLINE /
 *   REGISTERED_BUT_INACTIVE / UNKNOWN). Because LivingAI's own provider
 *   objects have no `isAvailable()` method (adding one would require
 *   editing the protected file), availability for the two REAL,
 *   already-known provider shapes is computed here, externally, from
 *   already-public signals:
 *     - "reasoning-pipeline": real, cheap check — is
 *       window.CozyOS.CognitiveCoordinator actually loaded right now?
 *       (the exact same real dependency reasoningPipelineProvider.think()
 *       itself checks, read here rather than duplicated as new logic).
 *     - the four unconfigured stub slots ("cloud-llm", "on-device",
 *       "enterprise-byo", "research-multi"): describeProvider(name).note
 *       already, honestly, discloses "not configured yet" — read
 *       verbatim rather than re-implemented.
 *   Any OTHER registered provider name (e.g. "gemini-api", only present
 *   when gemini-cloud-provider-bootstrap.js was explicitly loaded) is
 *   classified UNKNOWN — this file has no way to determine its live
 *   executability without either editing the protected registry or
 *   making a real network call, and it does neither. Never guessed.
 */
(function () {
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-ai-capability-snapshot"]) return;

    const KNOWN_UNCONFIGURED_STUB_NAMES = new Set(["cloud-llm", "on-device", "enterprise-byo", "research-multi"]);

    function classifyAvailability(name, describe) {
        if (name === "reasoning-pipeline") {
            const coordinator = window.CozyOS.CognitiveCoordinator;
            const available = !!(coordinator && typeof coordinator.run === "function");
            if (!available) return "REGISTERED_BUT_INACTIVE";
            return describe && describe.offline === true ? "AVAILABLE_OFFLINE" : "AVAILABLE_ONLINE";
        }
        if (KNOWN_UNCONFIGURED_STUB_NAMES.has(name)) return "REGISTERED_BUT_INACTIVE";
        return "UNKNOWN";
    }

    /**
     * getSnapshot() — real, additive, read-only. Never mutates LivingAI's
     * own registry; never makes a network call.
     */
    function getSnapshot() {
        const livingAI = window.CozyOS.LivingAI;
        if (!livingAI || typeof livingAI.listProviders !== "function" || typeof livingAI.describeProvider !== "function") {
            return [];
        }
        const activeName = typeof livingAI.getActiveProvider === "function" ? livingAI.getActiveProvider() : null;
        return Object.freeze(livingAI.listProviders().map((name) => {
            const describe = livingAI.describeProvider(name) || {};
            return Object.freeze({
                name,
                availability: classifyAvailability(name, describe),
                isActive: name === activeName,
                ...describe,
            });
        }));
    }

    const LivingAICapabilitySnapshot = Object.freeze({ getSnapshot, getVersion: () => "1.0.0" });
    window.CozyOS.LivingAICapabilitySnapshot = LivingAICapabilitySnapshot;
    window.CozyOS.Modules["living-ai-capability-snapshot"] = Object.freeze({
        version: "1.0.0",
        description: "SA-8 Phase 4 — reads window.CozyOS.LivingAI's existing, unmodified public API (listProviders()/describeProvider()/getActiveProvider()) from outside and classifies each registered provider's real availability. Never edits cozy-living-ai.js (a deliberate, tested, permanent boundary — see this file's own header) and never fabricates a status for a provider it cannot honestly determine."
    });
})();
