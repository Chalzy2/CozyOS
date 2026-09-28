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

    const VERSION = "1.2.0"; // PUBLIC-STORY-DEPTH: adds getPublicOriginStoryFact() — see that function's own header.
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
     * WHY_USE_ANSWER_SW
     *   PRODUCTION ANSWER-PATH AUDIT (real Incognito production bug fix)
     *   — real, hand-authored Kiswahili articulation of the SAME
     *   underlying facts as WHY_USE_ANSWER above (practical everyday
     *   problems for individuals/churches/schools/communities,
     *   offline-first/local-language orientation, honesty about what's
     *   working vs. still being built) — not a machine translation of
     *   the English string, same authoring discipline already used for
     *   every other bilingual pair in this repository (e.g. this
     *   router's sibling cozyos-identity-faq-router.js's own
     *   ANSWER_BUILDERS). Composed, never duplicated: callers that want
     *   this content in Kiswahili now get this real sibling directly
     *   instead of the English string being wrapped in an apologetic
     *   "no verified translation yet" disclosure by
     *   cozy-language-templates.js's "why-use-cozyos:verified" sw frame
     *   — which was the real root cause traced for the "CozyOS
     *   inasaidiaje?" Live Window production symptom.
     */
    const WHY_USE_ANSWER_SW =
        "CozyOS inasaidia watu kutatua changamoto za kila siku kwa urahisi zaidi, badala ya kuwa teknolojia kwa ajili yake yenyewe. Kwa mtu binafsi, inasaidia kupata huduma, taarifa, na zana muhimu kwa njia rahisi na kwa lugha anayoifahamu. Kwa makanisa, shule, na jamii, inasaidia kupanga shughuli, kuhudumia watu, na kuhifadhi maarifa muhimu — ikiwa imejengwa kufanya kazi hata pale mtandao hautegemewi. Lengo kubwa zaidi ni jamii za Kiafrika kushiriki kujenga teknolojia, si kuitumia tu, huku ikiwa wazi kwa wachangiaji, watengenezaji, wafasiri, na wasaidizi kutoka mahali popote wanaotaka kusaidia kuijenga. CozyOS inabaki wazi kuhusu kile kinachofanya kazi kwa sasa, kile kinachoendelea kujengwa, na kile ambacho hakijakamilika bado, badala ya kujidai zaidi ya uwezo wake halisi.";

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
     *
     *   AUDIT FIX (Live Window language-routing repair): this list
     *   previously omitted Luganda and Igbo, even though the source
     *   document's own "Language Policy" section explicitly states
     *   both are registered NOT_READY entries "on this 17-language
     *   list" (see the doc's own NOT_READY(6) line, which names Luo,
     *   Kikuyu, Kikamba, isiZulu, Luganda, Igbo together as one set).
     *   Omitting them here produced a real, user-visible inconsistency:
     *   the language-support-list reply would name Luganda/Igbo as
     *   "registered but not yet verified" while the target list right
     *   next to it never mentioned them at all — an internal
     *   contradiction, not a disclosed limitation. Both are added below
     *   to match what the source document and the live registry
     *   (cozy-language-registry.js's own EXTENDED_LANGUAGES) already
     *   agree on. Disclosed, unresolved gap this fix does NOT invent an
     *   answer for: the source document's headline still calls this a
     *   "17 languages" list while only 15 are ever named anywhere in
     *   it (13 originally listed + these 2) — that arithmetic gap is a
     *   pre-existing authoring gap in the owner-approved document
     *   itself, not something this file fabricates a resolution for.
     */
    const TARGET_LANGUAGES = Object.freeze([
        "English", "Kiswahili", "French", "Arabic", "Somali",
        "Russian", "Chinese/Mandarin", "Hausa", "Yorùbá",
        "Luo", "Kikuyu", "Kikamba", "isiZulu", "Luganda", "Igbo"
    ]);

    /**
     * ORIGIN_STORY_FULL_PARAGRAPHS
     *   PUBLIC-STORY-DEPTH milestone. Verbatim, unshortened, unrewritten
     *   paragraphs copied — sequence, wording, and paragraph boundaries
     *   all preserved exactly — from this file's own SOURCE_DOC, section
     *   "## Public Vision & Motivation — owner-provided story". That
     *   section is the doc's own Appendix B: "this personal story is
     *   owner-approved for public-story use" — a real, explicit approval
     *   distinct from (and never drawn from) the private Founder Story
     *   Vault (founder-story-seed.js — visibility "only-me", status
     *   "draft" — never read by this file, per this file's own
     *   pre-existing SOURCE OF TRUTH header above).
     *
     *   This is the ONE authoritative public origin-story text this
     *   file now exposes. It is never independently paraphrased here —
     *   every derived depth below is either this exact array (
     *   FULL_ORIGINAL) or a real, verbatim PREFIX SUBSET of it
     *   (DETAILED) — never a rewritten/generated sentence. A caller
     *   wanting a still-shorter CONCISE form has an existing, separate,
     *   real, already-live, already-condensed public answer of its own
     *   — core/identity/project-history.js's `background` field
     *   (exposed via DeveloperIdentity.answerWhyCreated(), and via this
     *   repository's live chat path, cozyos-identity-faq-router.js's
     *   COZYOS_ORIGIN intent). That text already describes the SAME
     *   real facts this array's own first paragraphs describe (the
     *   owner's door-to-door sales experience and the language-barrier
     *   problem it revealed) at a shorter grain — it is kept as the
     *   default CONCISE answer, unchanged, rather than duplicated or
     *   replaced here, so there is exactly one condensed public form and
     *   exactly one full original form, never two competing full
     *   stories. See cozyos-identity-faq-router.js's own header for how
     *   the three depths (concise/detailed/full_original) are composed
     *   together from these two real sources.
     */
    const ORIGIN_STORY_FULL_PARAGRAPHS = Object.freeze([
        "CozyOS was inspired by the owner's experience as a salesperson, moving door-to-door and meeting ordinary people and customers with different challenges. Those experiences encouraged the owner to ask how technology could solve practical problems in people's work and everyday lives.",
        "The owner's community and church experiences also influenced the idea. People, including the owner, requested help in Church with media and technology-related work, including situations where assistance could sometimes have been offered freely, but existing systems did not always allow the owner to help in the way he wanted — which led the owner to think more about being part of the system in God's way.",
        "This contributed to the idea of creating CozyOS as a practical problem-solving technology platform that can make useful tools, information, media, and services more accessible to communities.",
        "The owner describes having three fathers in his personal spiritual understanding: God, unseen; his spiritual father, Pastor Ezekiel, whom he sees; and his physical father, whom he has not seen since he was six months old. The owner had to learn how to struggle for a living when his mother, Jane Achieng Owuor, passed away in 2004, while he was in pre-primary school (class 3).",
        "The teachings of Pastor Ezekiel and the owner's experiences encouraged him to think about solving problems tied to language barriers — the owner felt this was a reason he was created to solve: he was touched by how people get healed and helped, and the solution he arrived at was an idea to solve the language-barrier problem, where any community through CozyOS can select their own language and understand what his pastor is teaching — a way for the owner to be part of his spiritual father's mission, making useful teachings and information more accessible. One important inspiration was the possibility that teachings and media could be made available through websites or applications, delivered in people's own community languages.",
        "The owner believes technology can improve African lives and communities and should not be viewed only as a source of dependence or destruction. Technology created elsewhere can be used, adapted, and extended to solve local problems, while Africans also create their own solutions and contribute new technology to the world.",
        "The owner's stated motto is \"ABOVE ONLY.\" The wider vision is that Africa should participate in creating solutions that bring positive change to African communities and, ultimately, to the entire world."
    ]);

    // DETAILED — a real, verbatim PREFIX of ORIGIN_STORY_FULL_PARAGRAPHS
    // (paragraphs 1-5 of 7): fuller than the existing project-history.js
    // CONCISE answer, short of the complete, unabridged FULL_ORIGINAL —
    // never a rewrite, purely a shorter curated excerpt of the same text.
    const ORIGIN_STORY_DETAILED_PARAGRAPH_COUNT = 5;

    /**
     * getPublicOriginStoryFact()
     *   Always VERIFIED — same committed-content basis as
     *   getWhyUseCozyOSFact()/getDifferentiationFact() above (this
     *   file's own content is its evidence source; see this file's
     *   header, "WHY THIS CONTENT IS VERIFIED RATHER THAN LIVE-READ").
     *   Returns `detailed` (string) and `full` ({paragraphs, text})
     *   only — never a `concise` field (see ORIGIN_STORY_FULL_
     *   PARAGRAPHS' own header for why the existing project-history.js
     *   text remains the one real CONCISE source, composed directly by
     *   the caller, not duplicated here).
     */
    function getPublicOriginStoryFact() {
        const detailedParagraphs = ORIGIN_STORY_FULL_PARAGRAPHS.slice(0, ORIGIN_STORY_DETAILED_PARAGRAPH_COUNT);
        return {
            evidence: "VERIFIED",
            detailed: detailedParagraphs.join("\n\n"),
            full: {
                paragraphs: ORIGIN_STORY_FULL_PARAGRAPHS.slice(),
                text: ORIGIN_STORY_FULL_PARAGRAPHS.join("\n\n")
            },
            language: "en", // this is the ONLY language the source document itself is written in — see this file's own header and cozyos-identity-faq-router.js's own handling for any other requested language
            source: `${SOURCE_DOC} (section "Public Vision & Motivation — owner-provided story", Appendix B: owner-approved for public-story use)`
        };
    }

    function safeCall(fn) {
        try {
            return fn();
        } catch (_err) {
            return null; // honest: a throwing dependency is treated as absent, never surfaced as fact
        }
    }

    /**
     * getWhyUseCozyOSFact(language)
     *   Always VERIFIED — this file's own committed content is its
     *   evidence source, so there is no live dependency that can be
     *   "missing" the way founder/list-apps/list-providers can be.
     *
     *   language: optional. Omitted/anything other than "sw" returns
     *   the original English answer, byte-identical to before this
     *   parameter existed — every pre-existing caller (e.g. the rule-
     *   based conversational provider's own "why-use-cozyos" case,
     *   which still calls this with no arguments) is unaffected.
     *   "sw" returns the real, hand-authored WHY_USE_ANSWER_SW sibling
     *   directly, so a caller that already knows it wants a Kiswahili
     *   answer (e.g. cozyos-identity-faq-router.js's new
     *   COZYOS_HOW_HELPS intent) never has to route English text
     *   through a "translation not verified" disclosure wrapper.
     */
    function getWhyUseCozyOSFact(language) {
        const answer = language === "sw" ? WHY_USE_ANSWER_SW : WHY_USE_ANSWER;
        return { evidence: "VERIFIED", answer, language: language === "sw" ? "sw" : "en", source: SOURCE_DOC };
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
        getLanguageSupportListFact,
        getPublicOriginStoryFact
    });

    window.CozyOS.Modules["cozy-public-knowledge-source"] = Object.freeze({
        version: VERSION,
        description: "COZYAI-PUBLIC-VISION-KNOWLEDGE + PUBLIC-STORY-DEPTH — static, owner-approved public-knowledge content sourced exclusively from docs/builder/knowledge/cozyos-public-vision-and-language-policy.md (never from founder-story-seed.js, which stays untouched and private). Provides why-use-CozyOS and differentiation facts, a language-support-list fact (PARTIALLY_VERIFIED, live registry state), and getPublicOriginStoryFact() — the one authoritative public origin-story text (detailed = a verbatim 5-of-7-paragraph prefix, full = all 7 paragraphs verbatim, English-only; see that function's own header for why no `concise` field is duplicated here). Consumed by cozy-knowledge-registry.js and cozyos-identity-faq-router.js; does not itself compose user-facing text."
    });
})();
