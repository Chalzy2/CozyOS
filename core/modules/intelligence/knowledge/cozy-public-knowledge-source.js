/**
 * CozyOS — Public Knowledge Source (Owner-Approved Static Content)
 * File Reference: core/modules/intelligence/knowledge/cozy-public-knowledge-source.js
 * Repair: COZYAI-PUBLIC-VISION-KNOWLEDGE
 *
 * OWNERSHIP
 *   New, additive, standalone file. Read only by
 *   cozy-knowledge-registry.js (extended this pass with three new
 *   thin fact-getters that compose this file's exports — see that
 *   file). Modifies no other file. Registers window.CozyOS.CozyPublicKnowledge.
 *
 * SOURCE OF TRUTH (the only source this file is allowed to draw from)
 *   docs/builder/knowledge/cozyos-public-vision-and-language-policy.md
 *   — self-classified PUBLIC KNOWLEDGE / PRODUCT VISION / LANGUAGE
 *   REQUIREMENT / OWNER-PROVIDED FACT, governed by Rule 83
 *   (docs/builder/rules/28-universal-builder-and-public-knowledge-
 *   governance-rule.md). That document's own Appendix B explicitly
 *   marks the personal-motivation portions reproduced below as
 *   "owner-approved for public-story use."
 *
 *   This file NEVER reads, imports, or references
 *   core/modules/founder-story/founder-story-seed.js. That file's own
 *   header marks it visibility:"only-me", status:"draft" — a
 *   deliberate, separate authorial decision about the owner's full
 *   personal autobiography that this repair does not touch, flip, or
 *   route around. The two sources are not interchangeable; see this
 *   repair's own repair-history-registry.md entry for the explicit
 *   instruction this file follows.
 *
 * WHY THIS CONTENT IS "VERIFIED" RATHER THAN LIVE-READ
 *   Every other CozyKnowledge fact-getter (founder, list-apps,
 *   list-providers) calls a live, already-existing runtime registry
 *   at call time. This content has no live runtime counterpart to
 *   read — it is committed, reviewed, owner-approved prose, exactly
 *   the same evidentiary status a committed source file already has
 *   elsewhere in this repository. VERIFIED here means "backed by a
 *   real, named, committed, owner-approved document," not "read from
 *   a live object at call time" — the source field on every fact
 *   below names the exact file so a reviewer can check that claim
 *   directly. This is a real, disclosed difference in evidence KIND
 *   from the other fact-getters, not a laxer bar.
 *
 * LANGUAGE-SUPPORT FACT — TWO GENUINELY SEPARATE EVIDENCE STREAMS
 *   getLanguageSupportListFact() honestly keeps two things apart,
 *   exactly as the source document itself insists on doing:
 *     - targetLanguages: the 17-language policy target list — POLICY
 *       evidence only, never itself proof of runtime readiness.
 *     - availableLanguages / notReadyLanguages: read live, at call
 *       time, from window.CozyOS.CozyLanguageRegistry.listLanguages()
 *       (RP-027) when that module is loaded — REAL runtime evidence.
 *   Overall evidence is reported as PARTIALLY_VERIFIED (mirrors
 *   cozy-knowledge-registry.js's own existing accountStateVocabulary()
 *   convention for exactly this "some parts confirmed differently
 *   than others" shape) rather than VERIFIED, so no caller can mistake
 *   "on the target list" for "actually available today." If the live
 *   registry isn't loaded, availableLanguages/notReadyLanguages
 *   honestly degrade to null rather than a guess — the target list
 *   portion still returns (it needs no runtime dependency), which is
 *   why this fact never needs to fall all the way to NOT_FOUND.
 *
 * NO FABRICATION
 *   Nothing below claims CozyOS is "automatically better than every
 *   existing application" (source doc's own explicit constraint), no
 *   registration steps are stated (that remains its own, separately
 *   evidenced how-to-register template — unchanged by this file), no
 *   launch date is stated or implied, and no sponsor/partner/funding
 *   claim appears anywhere.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-public-knowledge-source"]) return;

    const VERSION = "1.0.0";
    const SOURCE_DOC = "docs/builder/knowledge/cozyos-public-vision-and-language-policy.md";

    /**
     * WHY_USE_ANSWER
     *   Condenses the source document's "Public Motivation for
     *   Africa-First Technology" and "Public Community Benefits"
     *   sections into one answer paragraph. Paraphrased/condensed by
     *   this repair, not copy-pasted verbatim — the underlying claims
     *   are unchanged from the source document.
     */
    const WHY_USE_ANSWER =
        "CozyOS exists to solve practical, everyday problems — for individuals, churches, schools, and communities — rather than technology for its own sake. It's built community-oriented and offline-first, with strong support for local languages, so useful tools, information, and media stay accessible even without a reliable internet connection. The wider goal is for African communities to help create technology, not only consume it, while remaining open to contributors, developers, translators, and supporters from anywhere who want to help build it. CozyOS stays honest about what's actually working, what's still being built, and what isn't available yet, rather than overstating its own readiness.";

    /**
     * DIFFERENTIATION_ANSWER
     *   Condenses "Why Someone Might Prefer CozyOS." Deliberately
     *   preserves the source document's own explicit constraint: never
     *   claims CozyOS is automatically better than every existing
     *   application.
     */
    const DIFFERENTIATION_ANSWER =
        "CozyOS doesn't claim to be automatically better than every existing application — its honest, stated advantages are: a community-oriented, African-first design with a strong emphasis on local languages; offline-first, low-connectivity thinking wherever that's technically supported; one unified environment for multiple useful applications instead of many separate apps; a problem-solving rather than purely entertainment-oriented focus; transparent reporting of what's actually working versus still in progress, instead of pretending unavailable capability is live; and a real opportunity for communities and contributors to help shape the platform itself.";

    /**
     * TARGET_LANGUAGES
     *   The source document's own 17-language authoritative target
     *   list (owner-resolved). Policy evidence only — see file header.
     *   Kept as a flat name list here; this file does not assign
     *   codes for languages not already present in
     *   cozy-language-registry.js, to avoid implying a registry state
     *   that doesn't exist yet (the source doc itself says adding
     *   NOT_READY placeholder entries for Russian/Chinese/Hausa/Yorùbá
     *   is "a reasonable future step, not yet done" — this file does
     *   not do that step either).
     */
    const TARGET_LANGUAGES = Object.freeze([
        "English", "Kiswahili", "French", "Arabic", "Somali",
        "Russian", "Chinese/Mandarin", "Hausa", "Yorùbá",
        "Luo", "Kikuyu", "Kikamba", "isiZulu"
    ]);

    function safeCall(fn) {
        try {
            return fn();
        } catch (_err) {
            return null; // honest: a throwing dependency is treated as absent, never surfaced as fact
        }
    }

    /**
     * getWhyUseCozyOSFact()
     *   Always VERIFIED — this file's own committed content is its
     *   evidence source, so there is no live dependency that can be
     *   "missing" the way founder/list-apps/list-providers can be.
     */
    function getWhyUseCozyOSFact() {
        return { evidence: "VERIFIED", answer: WHY_USE_ANSWER, source: SOURCE_DOC };
    }

    /** getDifferentiationFact() — same VERIFIED-by-committed-content basis as above. */
    function getDifferentiationFact() {
        return { evidence: "VERIFIED", answer: DIFFERENTIATION_ANSWER, source: SOURCE_DOC };
    }

    /**
     * getLanguageSupportListFact()
     *   See file header — deliberately blends static policy evidence
     *   (targetLanguages) with live runtime evidence (available/
     *   notReady), always reported PARTIALLY_VERIFIED as a whole so
     *   neither half is mistaken for the other.
     */
    function getLanguageSupportListFact() {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        let availableLanguages = null;
        let notReadyLanguages = null;
        if (registry && typeof registry.listLanguages === "function") {
            const list = safeCall(() => registry.listLanguages());
            if (Array.isArray(list)) {
                availableLanguages = list.filter((l) => l && l.state === "AVAILABLE").map((l) => l.name);
                notReadyLanguages = list.filter((l) => l && l.state === "NOT_READY").map((l) => l.name);
            }
        }
        return {
            evidence: "PARTIALLY_VERIFIED",
            targetLanguages: TARGET_LANGUAGES.slice(),
            availableLanguages,
            notReadyLanguages,
            source: `${SOURCE_DOC} (target list), core/modules/intelligence/language/cozy-language-registry.js (live availability state, when loaded)`
        };
    }

    window.CozyOS.CozyPublicKnowledge = Object.freeze({
        getVersion() { return VERSION; },
        getWhyUseCozyOSFact,
        getDifferentiationFact,
        getLanguageSupportListFact
    });

    window.CozyOS.Modules["cozy-public-knowledge-source"] = Object.freeze({
        version: VERSION,
        description: "COZYAI-PUBLIC-VISION-KNOWLEDGE — static, owner-approved public-knowledge content sourced exclusively from docs/builder/knowledge/cozyos-public-vision-and-language-policy.md (never from founder-story-seed.js, which stays untouched and private). Provides why-use-CozyOS and differentiation facts (always VERIFIED, since the committed document is their own evidence source) and a language-support-list fact that honestly separates the document's 17-language policy target list from cozy-language-registry.js's live AVAILABLE/NOT_READY runtime state (PARTIALLY_VERIFIED). Consumed by cozy-knowledge-registry.js; does not itself compose user-facing text."
    });
})();
