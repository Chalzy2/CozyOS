/**
 * CozyAI — Verified Evidence Adapter (SA-2)
 * File Reference: core/modules/intelligence/semantic-answer/evidence/verified-evidence-adapter.js
 *
 * WHAT THIS IS
 *   SA-2's thin orchestrator: converts EXISTING, authorized CozyOS
 *   knowledge sources into normalized cozy.verified-evidence.v1 records
 *   (SA-1's VerifiedEvidenceContract). This file owns no knowledge of
 *   its own — it composes the two real source adapters in ./source-
 *   adapters/ (cozy-knowledge-adapter.js, cozy-memory-adapter.js), each
 *   of which wraps one already-existing, real authority
 *   (window.CozyOS.CozyKnowledge, window.CozyOS.CozyMemory) without
 *   ever storing, mutating, or duplicating its data.
 *
 * WHAT THIS FILE DOES NOT DO (SA-2's own hard boundary — see the SA-2
 * brief's §1 "must not implement" list)
 *   No answer selection. No sentence construction. No translation. No
 *   language realization. No response composition. No TTS. No Live
 *   Window routing. No canonical answer selection. No semantic goal
 *   selection. No new AI provider, knowledge database, or language
 *   database. This file's public methods return VerifiedEvidence[]
 *   arrays only — never a final answer string, never a goal→answer
 *   lookup of any kind.
 *
 * PRODUCTION ISOLATION
 *   Not <script>-included by any HTML page. Not called by
 *   cozy-living-assistant.js, cozy-answer-engine.js, cozy-ai.js, or any
 *   other production runtime path. Directly testable only, exactly as
 *   the SA-2 brief requires ("The adapter should remain a directly
 *   testable infrastructure component until SA-3/SA-6 explicitly wires
 *   it into the semantic pipeline").
 *
 * SOURCE_TYPE — the real, closed, disclosed set this adapter family
 * actually produces (SA-1's VerifiedEvidenceContract deliberately left
 * `source.type` open — see that file's own header — for THIS file to
 * define the real set once SA-2 exists, rather than pre-guessing it).
 *   APPLICATION_HUMAN_PURPOSE — from CozyKnowledge.getApplicationHumanPurposeFact()
 *     (backs APPLICATION_HUMAN_PURPOSE_DATA — humanPurpose/realLifeProblems/
 *     whoBenefits/humanBenefits/currentVerifiedCapabilities/visionCapabilities).
 *   APPLICATION_KNOWLEDGE — from CozyKnowledge.getApplicationFact() (generic,
 *     non-human-purpose application registration facts).
 *   SYSTEM_FACT — from CozyKnowledge's platform-level getters (getFounderFact,
 *     getVisionFact, getMissionFact, getWhyUseCozyOSFact, getDifferentiationFact,
 *     listApplicationsFact, listProvidersFact, etc.) — CozyOS-platform-level,
 *     not per-application.
 *   USER_MEMORY — from CozyMemory entries whose real, existing visibility is
 *     "private" (or the honestly-unenforced "team"/"department"/"family" —
 *     see cozy-memory-adapter.js's own header for why those are treated
 *     identically to "private", matching CozyMemory's own disclosed rule).
 *   ORGANIZATION_KNOWLEDGE — from CozyMemory entries whose real, existing
 *     visibility is "organisation".
 *   PUBLIC_KNOWLEDGE — from CozyMemory entries whose real, existing
 *     visibility is "public". (Distinct from APPLICATION_HUMAN_PURPOSE/
 *     APPLICATION_KNOWLEDGE/SYSTEM_FACT, which are CozyKnowledge's own,
 *     always-public, static committed data — a more specific label than
 *     this generic one, used in preference to it.)
 *   LANGUAGE_FOUNDATION / LANGUAGE_PACK — named in the SA-2 brief's own
 *     example list but NOT implemented here: no real evidence source of
 *     either kind exists yet for human-purpose/general-knowledge
 *     questions (confirmed by the SA-1 implementation map's own audit —
 *     the language pack registry is a vocabulary/provenance container,
 *     not a fact source). Adding a real adapter for either without a
 *     real source to adapt would be fabrication; left honestly absent.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa2";
    if (window.CozyOS.Modules["verified-evidence-adapter"]) return;

    const SOURCE_TYPE = Object.freeze({
        APPLICATION_HUMAN_PURPOSE: "APPLICATION_HUMAN_PURPOSE",
        APPLICATION_KNOWLEDGE: "APPLICATION_KNOWLEDGE",
        SYSTEM_FACT: "SYSTEM_FACT",
        USER_MEMORY: "USER_MEMORY",
        ORGANIZATION_KNOWLEDGE: "ORGANIZATION_KNOWLEDGE",
        PUBLIC_KNOWLEDGE: "PUBLIC_KNOWLEDGE",
    });

    /**
     * collectApplicationHumanPurposeEvidence(applicationName, {languages, accessContext})
     *   Thin delegation to CozyKnowledgeEvidenceAdapter — no selection
     *   logic of its own. accessContext is accepted for API consistency
     *   with the other collect*() methods but is currently unused: real,
     *   committed APPLICATION_HUMAN_PURPOSE_DATA has no per-record
     *   sensitivity in CozyKnowledge today (confirmed by the SA-1
     *   implementation map's own audit — it is static, always-public
     *   data), so every record this produces is sensitivity PUBLIC
     *   regardless of who is asking.
     */
    function collectApplicationHumanPurposeEvidence(applicationName, { languages, accessContext } = {}) {
        const adapter = window.CozyOS.CozyKnowledgeEvidenceAdapter;
        if (!adapter || typeof adapter.adaptApplicationHumanPurpose !== "function") {
            return { success: false, evidence: [], errors: ["CozyKnowledgeEvidenceAdapter is not loaded."] };
        }
        return adapter.adaptApplicationHumanPurpose(applicationName, { languages, accessContext });
    }

    /** collectApplicationKnowledgeEvidence(applicationName) — thin delegation, see collectApplicationHumanPurposeEvidence()'s own comment on why no selection logic lives here. */
    function collectApplicationKnowledgeEvidence(applicationName) {
        const adapter = window.CozyOS.CozyKnowledgeEvidenceAdapter;
        if (!adapter || typeof adapter.adaptApplicationKnowledge !== "function") {
            return { success: false, evidence: [], errors: ["CozyKnowledgeEvidenceAdapter is not loaded."] };
        }
        return adapter.adaptApplicationKnowledge(applicationName);
    }

    /** collectSystemFactEvidence(getterName, args) — thin delegation for CozyKnowledge's platform-level (non-per-application) getters. */
    function collectSystemFactEvidence(getterName, args = []) {
        const adapter = window.CozyOS.CozyKnowledgeEvidenceAdapter;
        if (!adapter || typeof adapter.adaptSystemFact !== "function") {
            return { success: false, evidence: [], errors: ["CozyKnowledgeEvidenceAdapter is not loaded."] };
        }
        return adapter.adaptSystemFact(getterName, args);
    }

    /**
     * collectMemoryEvidence({namespace, query, key, accessContext})
     *   Thin delegation to CozyMemoryEvidenceAdapter. accessContext here
     *   is load-bearing (unlike the CozyKnowledge-backed methods above):
     *   {actorId, organizationId}. See cozy-memory-adapter.js's own
     *   header for the full authorization derivation — this file never
     *   re-derives or duplicates it.
     */
    function collectMemoryEvidence({ namespace, query, key, accessContext } = {}) {
        const adapter = window.CozyOS.CozyMemoryEvidenceAdapter;
        if (!adapter) return { success: false, evidence: [], errors: ["CozyMemoryEvidenceAdapter is not loaded."] };
        if (isNonEmptyString(key)) {
            if (typeof adapter.adaptFromRead !== "function") return { success: false, evidence: [], errors: ["CozyMemoryEvidenceAdapter.adaptFromRead is not available."] };
            return adapter.adaptFromRead({ namespace, key, accessContext });
        }
        if (typeof adapter.adaptFromSearch !== "function") return { success: false, evidence: [], errors: ["CozyMemoryEvidenceAdapter.adaptFromSearch is not available."] };
        return adapter.adaptFromSearch({ namespace, query, accessContext });
    }

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    const VerifiedEvidenceAdapter = Object.freeze({
        SOURCE_TYPE,
        collectApplicationHumanPurposeEvidence,
        collectApplicationKnowledgeEvidence,
        collectSystemFactEvidence,
        collectMemoryEvidence,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.VerifiedEvidenceAdapter = VerifiedEvidenceAdapter;
    window.CozyOS.Modules["verified-evidence-adapter"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-2 — Verified Evidence Adapter. Converts existing, authorized CozyKnowledge/APPLICATION_HUMAN_PURPOSE_DATA/CozyMemory records into normalized VerifiedEvidence[] records. No answer selection, no sentence construction, no translation, no Live Window wiring. Not <script>-included by any page."
    });
})();
