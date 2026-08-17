/**
 * CozyOS — Knowledge Registry (Fact Evidence Gatherer)
 * File Reference: core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 * Repair: RP-027 — CozyOS Conversational Knowledge + Multilingual
 *         Response Expansion
 *
 * OWNERSHIP
 *   New, additive, standalone file. Reads ONLY already-existing public
 *   APIs of other real modules, at call time — never at load time, so
 *   load order relative to this file is not load-bearing (confirmed
 *   safe on both dashboard.html, which loads DeveloperIdentity/
 *   ProviderManager/ServiceRegistry, and index.html, which loads
 *   neither — both paths are exercised honestly below, never assumed
 *   present). Modifies no other file.
 *
 * REAL EVIDENCE SOURCES THIS FILE READS (confirmed present in this
 * repository before writing this file):
 *   - window.CozyOS.DeveloperIdentity (core/identity/cozyai-identity.js,
 *     Milestone 180) — .query('founder') / .answerWhoCreatedYou()
 *   - window.CozyOS.listApplications() / window.CozyOS.ServiceRegistry
 *     .listApplications() (core/registry/cozy-registry.js)
 *   - window.CozyOS.ProviderManager.healthReport() / .health(id)
 *     (core/shell/provider-manager.js, M367/M367.2)
 *   - window.CozyOS.LivingAI.getActiveProvider() (core/living/
 *     cozy-living-ai.js)
 *
 * FACT SAFETY RULE (RP-027 §3) — every method below returns an object
 * carrying an explicit `evidence` field, one of:
 *   "VERIFIED"           — directly backed by a live/real repository source
 *   "PARTIALLY_VERIFIED"  — part of the answer is backed, part is not
 *   "NOT_FOUND"           — no authoritative source available right now
 *   "NOT_A_CAPABILITY"    — CozyOS does not implement the requested thing
 * Nothing in this file ever upgrades an absence of evidence into a
 * positive claim — every live call is wrapped so a missing/throwing
 * dependency degrades to NOT_FOUND, never to a fabricated VERIFIED
 * answer.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-knowledge-registry"]) return;

    const VERSION = "1.0.0";

    function safeCall(fn) {
        try {
            return fn();
        } catch (_err) {
            return null; // honest: a throwing dependency is treated as absent, never surfaced as fact
        }
    }

    /**
     * getFounderFact()
     *   VERIFIED via window.CozyOS.DeveloperIdentity.answerWhoCreatedYou()
     *   when that module loaded successfully (it fail-closes itself if
     *   its own three required parts didn't load — see cozyai-
     *   identity.js's own header). NOT_FOUND otherwise — never guesses.
     */
    function getFounderFact() {
        const identity = window.CozyOS && window.CozyOS.DeveloperIdentity;
        if (identity && typeof identity.answerWhoCreatedYou === "function") {
            const result = safeCall(() => identity.answerWhoCreatedYou());
            if (result && result.known && typeof result.answer === "string" && result.answer.length > 0) {
                return { evidence: "VERIFIED", answer: result.answer, source: "window.CozyOS.DeveloperIdentity" };
            }
        }
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    /**
     * listApplicationsFact()
     *   VERIFIED via the real, already-existing ServiceRegistry. Reads
     *   name (falling back to id) for every registered application.
     *   NOT_FOUND (registry unavailable) rather than ever falling back
     *   to a hardcoded/remembered application list — a remembered list
     *   would go stale exactly when the real registry is what changed.
     */
    function listApplicationsFact() {
        const lister =
            (window.CozyOS && typeof window.CozyOS.listApplications === "function" && window.CozyOS.listApplications) ||
            (window.CozyOS && window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.listApplications === "function" && (() => window.CozyOS.ServiceRegistry.listApplications()));
        if (!lister) return { evidence: "NOT_FOUND", applications: null, source: null };
        const list = safeCall(() => lister());
        if (!Array.isArray(list)) return { evidence: "NOT_FOUND", applications: null, source: null };
        const names = list
            .map((app) => (app && (app.name || app.id)) || null)
            .filter((name) => typeof name === "string" && name.length > 0);
        if (names.length === 0) return { evidence: "NOT_FOUND", applications: null, source: null };
        return { evidence: "VERIFIED", applications: names, source: "window.CozyOS.ServiceRegistry" };
    }

    /**
     * listProvidersFact()
     *   VERIFIED via ProviderManager.healthReport() — a real, already-
     *   existing aggregation of every registered provider's own
     *   getHealth(). Never fabricates a health value; this file only
     *   formats whatever healthReport() honestly returns.
     */
    function listProvidersFact() {
        const pm = window.CozyOS && window.CozyOS.ProviderManager;
        if (!pm || typeof pm.healthReport !== "function") return { evidence: "NOT_FOUND", entries: null, source: null };
        const report = safeCall(() => pm.healthReport());
        if (!report || typeof report !== "object") return { evidence: "NOT_FOUND", entries: null, source: null };
        const ids = Object.keys(report);
        if (ids.length === 0) return { evidence: "NOT_FOUND", entries: null, source: null };
        const entries = ids.map((id) => {
            const entry = report[id] || {};
            return `${id}: ${entry.health || "UNKNOWN"}`;
        });
        return { evidence: "VERIFIED", entries, source: "window.CozyOS.ProviderManager" };
    }

    /**
     * activeProviderFact()
     *   VERIFIED via LivingAI.getActiveProvider() — which conversational
     *   provider is currently answering, right now. Used by the
     *   'provider-status'/'identity' composition path, not a separate
     *   user-facing intent of its own this pass.
     */
    function activeProviderFact() {
        const ai = window.CozyOS && window.CozyOS.LivingAI;
        if (!ai || typeof ai.getActiveProvider !== "function") return { evidence: "NOT_FOUND", providerId: null };
        const active = safeCall(() => ai.getActiveProvider());
        if (!active) return { evidence: "NOT_FOUND", providerId: null };
        const id = typeof active === "string" ? active : active.id || active.name || null;
        if (!id) return { evidence: "NOT_FOUND", providerId: null };
        return { evidence: "VERIFIED", providerId: id };
    }

    /**
     * accountStateVocabulary()
     *   PARTIALLY_VERIFIED, always — "ACTIVE" and "PENDING" are
     *   directly grep-confirmed literal state strings in this
     *   repository's own security/identity modules (session-manager.js,
     *   auth-coordinator.js) before this file was written; the
     *   additional intermediate state NAMES this provider surfaces
     *   (registration-pending, authentication-incomplete, phone-
     *   verification-incomplete, trusted-device-required) describe real
     *   documented steps in the registration/authentication flow but
     *   are not each independently confirmed as a single literal
     *   enum-value string repository-wide — hence PARTIALLY_VERIFIED,
     *   not VERIFIED, and never claimed as a live read of any specific
     *   person's account.
     */
    function accountStateVocabulary() {
        return {
            evidence: "PARTIALLY_VERIFIED",
            confirmedStates: ["ACTIVE", "PENDING"],
            describedSteps: ["registration-pending", "authentication-incomplete", "phone-verification-incomplete", "trusted-device-required"],
            source: "core/security/session-manager.js, core/security/auth-coordinator.js"
        };
    }

    /**
     * safeCallAsync(fn)
     *   Same fail-closed discipline as safeCall(), for the async
     *   FounderStory.getPublicStory() read path below. A throwing or
     *   rejecting dependency is treated as absent, never surfaced as
     *   fact.
     */
    async function safeCallAsync(fn) {
        try {
            return await fn();
        } catch (_err) {
            return null;
        }
    }

    /**
     * getProjectKnowledgeFact(topicTag)
     *   CozyAI Project Knowledge & Public Story Integration milestone.
     *   The single, shared implementation behind all five new project-
     *   knowledge fact-getters below — composes
     *   window.CozyOS.FounderStory.getPublicStory(topicTag) only (the
     *   one narrow, viewerId-free, public+published-only read path
     *   added to that engine this milestone). Never reads the private
     *   Founder Story Vault directly, never accepts or forwards a
     *   viewerId, never upgrades an absent/private/draft result into a
     *   positive claim.
     *
     *   Evidence mapping:
     *     - FounderStory not loaded, or getPublicStory() throws/returns
     *       something that isn't a real {title, body} object → NOT_FOUND
     *       (same "missing dependency degrades to NOT_FOUND" convention
     *       getFounderFact() above already established — this is not a
     *       "CozyOS doesn't implement this" case, the capability exists,
     *       there is simply no published content yet).
     *     - A real public+published chapter body → VERIFIED.
     */
    async function getProjectKnowledgeFact(topicTag) {
        const founderStory = window.CozyOS && window.CozyOS.FounderStory;
        if (!founderStory || typeof founderStory.getPublicStory !== "function") {
            return { evidence: "NOT_FOUND", answer: null, source: null };
        }
        const result = await safeCallAsync(() => founderStory.getPublicStory(topicTag));
        if (result && typeof result.body === "string" && result.body.length > 0) {
            return { evidence: "VERIFIED", answer: result.body, source: "window.CozyOS.FounderStory" };
        }
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getProjectOriginFact() { return getProjectKnowledgeFact("project-origin"); }
    function getPublicStoryFact() { return getProjectKnowledgeFact("public-story"); }
    function getVisionFact() { return getProjectKnowledgeFact("vision"); }
    function getMissionFact() { return getProjectKnowledgeFact("mission"); }
    function getProjectHistoryFact() { return getProjectKnowledgeFact("project-history"); }

    window.CozyOS.CozyKnowledge = Object.freeze({
        getVersion() { return VERSION; },
        getFounderFact,
        listApplicationsFact,
        listProvidersFact,
        activeProviderFact,
        accountStateVocabulary,
        getProjectOriginFact,
        getPublicStoryFact,
        getVisionFact,
        getMissionFact,
        getProjectHistoryFact
    });

    window.CozyOS.Modules["cozy-knowledge-registry"] = Object.freeze({
        version: VERSION,
        description: "RP-027 — Knowledge/fact evidence gatherer. Reads DeveloperIdentity, ServiceRegistry, ProviderManager, LivingAI, and (CozyAI Project Knowledge & Public Story Integration milestone) FounderStory.getPublicStory()'s already-existing public APIs at call time only (never at load time, so load order is not load-bearing) and returns an explicit evidence state (VERIFIED / PARTIALLY_VERIFIED / NOT_FOUND / NOT_A_CAPABILITY) alongside every fact, per RP-027's Fact Safety Rule. A missing or throwing dependency always degrades to an honest NOT_FOUND — never a fabricated answer. The five project-knowledge fact-getters (origin/public-story/vision/mission/history) never read the private Founder Story Vault directly and never accept a viewerId — they compose FounderStory's own narrow public+published-only read path exclusively. Consumed by rule-based-conversational-provider.js; does not itself compose or translate any user-facing text (that is cozy-language-templates.js's job)."
    });
})();
