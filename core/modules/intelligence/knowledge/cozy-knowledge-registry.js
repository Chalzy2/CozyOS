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
    function getFounderFact(lang) {
        const identity = window.CozyOS && window.CozyOS.DeveloperIdentity;
        if (identity && typeof identity.answerWhoCreatedYou === "function") {
            const result = safeCall(() => identity.answerWhoCreatedYou(lang));
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

    /**
     * getWhyUseCozyOSFact() / getDifferentiationFact() /
     * getLanguageSupportListFact()
     *   COZYAI-PUBLIC-VISION-KNOWLEDGE — thin, additive wrappers
     *   around window.CozyOS.CozyPublicKnowledge (new, standalone
     *   file: cozy-public-knowledge-source.js), which itself draws
     *   exclusively from the owner-approved
     *   docs/builder/knowledge/cozyos-public-vision-and-language-
     *   policy.md — never from the private founder-story-seed.js.
     *   Same fail-closed discipline as every other getter in this
     *   file: a missing/throwing dependency degrades to an honest
     *   NOT_FOUND, never a fabricated answer. This file adds no new
     *   evidence of its own here — CozyPublicKnowledge already
     *   carries and grades every fact; these wrappers exist only so
     *   composeReply() has one consistent CozyKnowledge surface to
     *   call, matching every other intent in this repository.
     */
    function getWhyUseCozyOSFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getWhyUseCozyOSFact !== "function") return { evidence: "NOT_FOUND", answer: null, source: null };
        const result = safeCall(() => pub.getWhyUseCozyOSFact());
        if (result && result.evidence === "VERIFIED" && typeof result.answer === "string" && result.answer.length > 0) return result;
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getDifferentiationFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getDifferentiationFact !== "function") return { evidence: "NOT_FOUND", answer: null, source: null };
        const result = safeCall(() => pub.getDifferentiationFact());
        if (result && result.evidence === "VERIFIED" && typeof result.answer === "string" && result.answer.length > 0) return result;
        return { evidence: "NOT_FOUND", answer: null, source: null };
    }

    function getLanguageSupportListFact() {
        const pub = window.CozyOS && window.CozyOS.CozyPublicKnowledge;
        if (!pub || typeof pub.getLanguageSupportListFact !== "function") return { evidence: "NOT_FOUND", targetLanguages: null, availableLanguages: null, notReadyLanguages: null, source: null };
        const result = safeCall(() => pub.getLanguageSupportListFact());
        if (result && Array.isArray(result.targetLanguages) && result.targetLanguages.length > 0) return result;
        return { evidence: "NOT_FOUND", targetLanguages: null, availableLanguages: null, notReadyLanguages: null, source: null };
    }

    /**
     * getRegistrationFlowFact() — REGISTRATION/AUTH milestone
     *   VERIFIED, sourced exclusively from real, committed, directly-
     *   audited implementation files — not a live runtime read (there
     *   is no "registration in progress" object to poll), and not an
     *   inferred guess from function/file naming. Same evidence KIND
     *   as cozy-public-knowledge-source.js's committed-document facts
     *   (see that file's own header): "VERIFIED" here means "backed by
     *   real, named, committed source code a reviewer can open and
     *   check line-for-line," named explicitly in `source` below.
     *
     *   Extracted by direct inspection of:
     *     - core/modules/identity/identity-engine.js — register()
     *       (field validation, password-policy check, duplicate
     *       checks, record creation; confirms NO email/SMS
     *       verification step is required to complete registration,
     *       and confirms registration + auto-login happen as one
     *       flow, not two separate stages).
     *     - core/shell/cozy-login-gate.js — the actual, only public
     *       registration form and its submit handler (confirms the
     *       exact field list a user fills in, and confirms the
     *       automatic-login-after-register behavior from the caller
     *       side).
     *
     *   Deliberately NOT included here (fail-closed, not fabricated):
     *     - Optional profile fields (photo/company/employee number/
     *       timezone/language) are explicitly deferred/not built per
     *       that code's own comments — omitted rather than guessed.
     *     - Administrator self-registration exists in the backend
     *       logic only, with no public UI entry point — omitted from
     *       this public-facing fact since it isn't a real user step.
     *     - No claim about rate-limiting/CAPTCHA is made — genuinely
     *       NOT_FOUND in the audit, so simply absent from this fact
     *       rather than asserted either way.
     */
    function getRegistrationFlowFact() {
        return {
            evidence: "VERIFIED",
            // English (second priority) and stepsSw (Kiswahili, FIRST
            // priority) are both fixed, committed, human-authored 1:1
            // translations of the same three audited steps — stepsSw
            // is NOT a runtime/auto translation of `steps`, so
            // cozy-language-templates.js never has to machine-translate
            // this evidence at call time.
            steps: [
                "Open the CozyOS login screen and choose \"Create an Account\"",
                "Fill in your First Name, Last Name, Username, Email, Phone, Password, and Confirm Password, and accept the Terms",
                "Submit the form — CozyOS validates the details, creates the account, and signs you in automatically"
            ],
            stepsSw: [
                "Fungua skrini ya kuingia ya CozyOS kisha uchague \"Create an Account\" (Tengeneza Akaunti)",
                "Jaza Jina la Kwanza, Jina la Mwisho, Jina la Mtumiaji, Barua Pepe, Simu, Nenosiri, na Uthibitishe Nenosiri, kisha ukubali Masharti",
                "Wasilisha fomu — CozyOS itathibitisha taarifa zako, kuunda akaunti, na kukuingiza moja kwa moja"
            ],
            passwordRequirement: "at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol",
            verificationRequired: false,
            autoLoginAfterRegister: true,
            source: "core/modules/identity/identity-engine.js (register()), core/shell/cozy-login-gate.js (registration form + submit handler)"
        };
    }

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
        getProjectHistoryFact,
        getWhyUseCozyOSFact,
        getDifferentiationFact,
        getLanguageSupportListFact,
        getRegistrationFlowFact
    });

    window.CozyOS.Modules["cozy-knowledge-registry"] = Object.freeze({
        version: VERSION,
        description: "RP-027 + COZYAI-PUBLIC-VISION-KNOWLEDGE + REGISTRATION/AUTH — Knowledge/fact evidence gatherer. Reads DeveloperIdentity, ServiceRegistry, ProviderManager, LivingAI, FounderStory.getPublicStory(), CozyPublicKnowledge's already-existing public APIs at call time only (never at load time, so load order is not load-bearing) and returns an explicit evidence state (VERIFIED / PARTIALLY_VERIFIED / NOT_FOUND / NOT_A_CAPABILITY) alongside every fact, per RP-027's Fact Safety Rule. A missing or throwing dependency always degrades to an honest NOT_FOUND — never a fabricated answer. The five project-knowledge fact-getters (origin/public-story/vision/mission/history) never read the private Founder Story Vault directly and never accept a viewerId. The three public-vision fact-getters (why-use/differentiation/language-support-list) compose only the owner-approved cozy-public-knowledge-source.js — never founder-story-seed.js. getRegistrationFlowFact() (REGISTRATION/AUTH milestone) is VERIFIED from real, committed, directly-audited registration source code (identity-engine.js register(), cozy-login-gate.js registration form) — never inferred from naming, never claims a verification/OTP step that the audited code does not actually require. Consumed by rule-based-conversational-provider.js; does not itself compose or translate any user-facing text (that is cozy-language-templates.js's job)."
    });
})();
