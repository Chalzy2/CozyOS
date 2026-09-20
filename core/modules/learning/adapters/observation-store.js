/**
 * CozyAI — Observation Store
 * File Reference: core/modules/learning/adapters/observation-store.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-2/CML-3.
 *
 * WHY THIS FILE EXISTS
 *   Every earlier LIF file (observation-adapter.js, observation-
 *   lifecycle.js) operates on an observation object passed by the
 *   caller — none of them persist it. That is correct for pure,
 *   independently-testable logic, but it means nothing survives across
 *   turns/calls, which the runtime continuous-learning loop (adapters/
 *   continuous-learning-session.js) genuinely needs: a gap observed in
 *   turn 1 must still be findable when turn 2 (maybe minutes or days
 *   later, maybe a different contributor) provides corroborating
 *   evidence for the SAME concept. This file is that real, disclosed
 *   persistence layer — composing window.CozyOS.CozyMemory under its
 *   own dedicated namespace ("multimodal-observations", distinct from
 *   universal-learning-pipeline.js's own separate "multimodal-learning"
 *   namespace/schema, so this file never collides with or reinterprets
 *   that engine's own real records). No new memory system.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    const NAMESPACE = "multimodal-observations";
    if (window.CozyOS.Modules["observation-store"]) return;

    function memoryOrFail() {
        const memory = window.CozyOS.CozyMemory;
        if (!memory || typeof memory.saveMemory !== "function") return null;
        return memory;
    }

    // Real, disclosed mapping from this contract's LEARNING_SCOPE onto
    // CozyMemory's own real visibility values — same discipline as
    // observation-evidence-bridge.js's own sensitivityForScope().
    function visibilityForScope(learningScope) {
        return learningScope === "PERSONAL" ? "private" : "public";
    }

    /** saveObservation(observation, {actorId}) — persists (or re-persists, on a lifecycle transition) the FULL, current observation record. */
    function saveObservation(observation, { actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!observation || !observation.observationId) return { success: false, reason: "A real observation with a real observationId is required." };
        memory.saveMemory(NAMESPACE, observation.observationId, observation, {
            owner: observation.provenance.actorId || actorId, actorId,
            visibility: visibilityForScope(observation.learningScope),
            tags: observation.canonicalConceptId ? [`concept:${observation.canonicalConceptId}`] : [],
        });
        return { success: true, observationId: observation.observationId };
    }

    /** getObservation(observationId, {actorId}) — real read; unwraps CozyMemory's own real {value,...} envelope. */
    function getObservation(observationId, { actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return null;
        const entry = memory.readMemory(NAMESPACE, observationId, actorId);
        return entry && entry.value ? entry.value : null;
    }

    /** listObservationsByConcept(conceptId, {actorId}) — real tag-filtered search, same real CozyMemory shape as canonical-concept-registry.js's own listAttachments(). */
    function listObservationsByConcept(conceptId, { actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded.", observations: [] };
        let entries;
        if (typeof memory.tagSearch === "function") {
            entries = memory.tagSearch(NAMESPACE, `concept:${conceptId}`, actorId) || [];
        } else if (typeof memory.listKeys === "function") {
            entries = memory.listKeys(NAMESPACE, (e) => e.canonicalConceptId === conceptId, actorId) || [];
        } else {
            return { success: false, reason: "CozyMemory has neither tagSearch nor listKeys.", observations: [] };
        }
        return { success: true, observations: entries.map((e) => e.value).filter(Boolean) };
    }

    const ObservationStore = Object.freeze({
        NAMESPACE, saveObservation, getObservation, listObservationsByConcept, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ObservationStore = ObservationStore;
    window.CozyOS.Modules["observation-store"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — real observation persistence, composing CozyMemory under its own dedicated namespace (distinct from universal-learning-pipeline.js's own separate namespace). No new memory system. Not <script>-included by any page."
    });
})();
