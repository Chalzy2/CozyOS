/**
 * CozyOS — Teach CozyAI: Full Knowledge Vocabulary + Language-Pack Routing
 * File Reference: core/modules/intelligence/knowledge/teach/cozy-teach-cozyai-routing-core.js
 * Repair: RP-031 Phase 2A ("African/community knowledge -> Teach CozyAI ->
 *         candidate knowledge -> independent community confirmation ->
 *         review -> validated language-pack knowledge -> fast local
 *         retrieval -> CozyAI helps another person")
 *
 * MOTTO: "African teaches AI, and AI helps Africa improve their lives."
 *
 * OWNERSHIP / COMPOSITION (no rewriting of RP-029/RP-030/RP-027 files)
 *   New, additive, standalone file. Composes — never duplicates — the
 *   following existing, frozen public APIs:
 *     - window.CozyOS.CozyKnowledgeContributionCore (RP-029-C Phase 3)
 *       createDraft()/updateDraft()/submitDraft() — this remains the
 *       ONE real path into the RP-029-A/B review pipeline (safety gate,
 *       CANDIDATE -> CONFIRMED -> validated states). Never reimplemented.
 *     - window.CozyOS.CozyLanguagePacks (RP-030) — registerRegionalContext(),
 *       submitExpression(), detectLanguagePack(), evidenceBand(). This
 *       remains the ONE real path into pack-scoped, region/dialect-aware
 *       storage. Never reimplemented.
 *     - window.CozyOS.CozyLanguageRegistry (RP-027) — read-only language
 *       list, via CozyKnowledgeContributionCore.listLanguageOptions().
 *   None of the above files are modified. If a dependency is absent,
 *   every function below fails closed / degrades honestly
 *   (CAPABILITY_UNAVAILABLE) rather than fabricating a result.
 *
 * WHY A NEW FILE INSTEAD OF EDITING THE EXISTING CONTRIBUTION FORM
 *   contribution-form.html / cozy-knowledge-contribution-core.js (RP-029-C
 *   Phase 3) already provide a real, tested "Teach CozyAI" flow into the
 *   RP-029-B review pipeline — but its contributionType vocabulary is
 *   narrower than RP-031 Phase 2's spec (word/phrase/sentence/definition/
 *   literal meaning/contextual meaning/example usage/cultural notes/
 *   domain knowledge), and it never calls RP-030's language-pack registry
 *   at all, so nothing it submits is routed into a Country+Region+
 *   Community+Dialect-scoped pack record. This file is the additive
 *   Phase 2A layer that (a) exposes the fuller vocabulary on top of the
 *   real, unmodified RP-029-C validation/submission path, and (b) also
 *   routes the same safe submission into RP-030 so it becomes fast,
 *   locally-retrievable language-pack knowledge. Section K's requirement
 *   depends on this second step actually happening — without it,
 *   contributions would only ever live in the review pipeline, never in
 *   a language pack.
 *
 * DOMAIN KNOWLEDGE (spec section F) — HONEST EVIDENCE STATUS
 *   AGRICULTURE/EDUCATION/BUSINESS/COMMUNITY_LIFE/OTHER_DOMAIN
 *   contributions are always tagged evidenceStatus:
 *   "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED". No professional
 *   verification engine (agronomist review, medical review, etc.) exists
 *   anywhere in this repository, so this file never claims one does and
 *   never lets a community statement silently read as professional
 *   advice. This status is permanent for a record unless a real
 *   professional-review capability is added in a future repair (it does
 *   not exist today — disclosed, not fabricated).
 *
 * COMMUNITY FIELD — HONEST LIMIT
 *   RP-030's own dedup/geography model is Country + Region + Dialect
 *   (registerRegionalContext/matchKeyFor). It has no separate "Community"
 *   slot. Rather than silently dropping a contributor's community value
 *   or quietly rewriting RP-030's schema, this file (a) keeps its own
 *   honest side-table (communityIndex) mapping a language-pack recordId
 *   to the community string actually supplied, and (b) folds the
 *   community into the *region* value passed to RP-030 as
 *   "Region (Community)" so RP-030's real evidence-matching/merge logic
 *   (matchKeyFor) still treats a different community as a distinct
 *   record, per spec section B ("A word must be able to exist as
 *   Language+Country+Region+Community+Dialect+Meaning+Context"). This
 *   compromise is disclosed here and in getRoutingRecord(), never hidden.
 *
 * NO FABRICATION
 *   No ASR, OCR, automatic language identification, or translation-ML
 *   engine exists in this file or anywhere composed by it.
 *   detectRoutingSuggestion() is a disclosed heuristic pass-through to
 *   RP-030's own detectLanguagePack() — not a real classifier.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function contributionCore() {
        const c = cozyOS();
        return c && c.CozyKnowledgeContributionCore ? c.CozyKnowledgeContributionCore : null;
    }
    function languagePacks() {
        const c = cozyOS();
        return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null;
    }

    // -----------------------------------------------------------------
    // 1. KNOWLEDGE VOCABULARY (spec section A) — superset of RP-029-C's
    //    CONTRIBUTION_TYPES, mapped onto them (never a rival enum stored
    //    anywhere real; a pure, stateless translation at submit time).
    // -----------------------------------------------------------------

    const TEACH_KNOWLEDGE_TYPES = Object.freeze([
        "WORD", "PHRASE", "SENTENCE", "DEFINITION", "LITERAL_MEANING",
        "CONTEXTUAL_MEANING", "PRONUNCIATION", "DIALECT_VARIANT",
        "EXAMPLE_USAGE", "TRANSLATION", "CULTURAL_NOTE",
        "AGRICULTURE", "EDUCATION", "BUSINESS", "COMMUNITY_LIFE", "OTHER_DOMAIN"
    ]);

    const DOMAIN_TYPES = Object.freeze(["AGRICULTURE", "EDUCATION", "BUSINESS", "COMMUNITY_LIFE", "OTHER_DOMAIN"]);
    const ORAL_KNOWLEDGE_TYPES = Object.freeze(["PRONUNCIATION", "DIALECT_VARIANT"]);

    // knowledgeType -> RP-029-C CONTRIBUTION_TYPES value
    const KNOWLEDGE_TYPE_TO_CORE = Object.freeze({
        WORD: "TEXT",
        PHRASE: "TEXT",
        SENTENCE: "TEXT",
        DEFINITION: "TEXT",
        LITERAL_MEANING: "TEXT",
        CONTEXTUAL_MEANING: "TEXT",
        PRONUNCIATION: "PRONUNCIATION",
        DIALECT_VARIANT: "DIALECT_VARIANT",
        EXAMPLE_USAGE: "TEXT",
        TRANSLATION: "TRANSLATION",
        CULTURAL_NOTE: "COMMUNITY_EXPLANATION",
        AGRICULTURE: "COMMUNITY_EXPLANATION",
        EDUCATION: "COMMUNITY_EXPLANATION",
        BUSINESS: "COMMUNITY_EXPLANATION",
        COMMUNITY_LIFE: "COMMUNITY_EXPLANATION",
        OTHER_DOMAIN: "COMMUNITY_EXPLANATION"
    });

    const DOMAIN_EVIDENCE_STATUS = "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED";

    // -----------------------------------------------------------------
    // 2. HUMAN-FACING FIELD REQUIREMENTS (spec: "This is what we call
    //    it." / "This is what it means." / "This is how we pronounce
    //    it." / "This is where it is used." / "This is how it differs
    //    in our area.") — oral-first, never forces invented spelling.
    // -----------------------------------------------------------------

    function describeContributionForm(knowledgeType) {
        if (TEACH_KNOWLEDGE_TYPES.indexOf(knowledgeType) === -1) {
            return { valid: false, reason: "UNKNOWN_KNOWLEDGE_TYPE" };
        }
        const isOral = ORAL_KNOWLEDGE_TYPES.indexOf(knowledgeType) !== -1;
        const isDomain = DOMAIN_TYPES.indexOf(knowledgeType) !== -1;

        const base = {
            valid: true,
            knowledgeType,
            required: ["language", "meaning", "context"],
            oneOf: isOral ? ["expression", "audioReference", "phonetic"] : [],
            prompts: {
                expression: "This is what we call it.",
                meaning: "This is what it means.",
                pronunciation: "This is how we pronounce it.",
                region: "This is where it is used.",
                dialect: "This is how it differs in our area."
            }
        };
        if (knowledgeType === "LITERAL_MEANING") {
            base.required = base.required.concat(["literalMeaning"]);
        }
        if (knowledgeType === "CONTEXTUAL_MEANING") {
            base.required = base.required.concat(["contextualMeaning"]);
        }
        if (knowledgeType === "EXAMPLE_USAGE") {
            base.required = base.required.concat(["exampleUsage"]);
        }
        if (knowledgeType === "TRANSLATION") {
            base.required = base.required.concat(["translation"]);
        }
        // Domain-knowledge contributions (spec section F) may stand
        // alone as community knowledge ("farmers apply ash around the
        // base of the plant") without being tied to one specific word —
        // this form never forces an invented 'expression' for them
        // (submitTeachingContribution() honestly uses the domainKnowledge
        // text itself downstream — see that function's comments — since
        // the real, unmodified RP-029-C pipeline still needs a non-empty
        // expression field). Everything else still requires one.
        if (!isOral && !isDomain) {
            base.required = base.required.concat(["expression"]);
        }
        if (isDomain) {
            base.required = base.required.concat(["domainKnowledge"]);
            base.evidenceStatus = DOMAIN_EVIDENCE_STATUS;
        }
        return base;
    }

    function validateFields(knowledgeType, fields) {
        const form = describeContributionForm(knowledgeType);
        if (!form.valid) return { valid: false, errors: [form.reason] };
        const f = fields || {};
        const errors = [];
        form.required.forEach((name) => {
            if (f[name] === undefined || f[name] === null || String(f[name]).trim() === "") {
                errors.push(name + " is required for " + knowledgeType);
            }
        });
        if (form.oneOf.length > 0) {
            const satisfied = form.oneOf.some((name) => f[name] !== undefined && f[name] !== null && String(f[name]).trim() !== "");
            if (!satisfied) errors.push("one of [" + form.oneOf.join(", ") + "] is required for " + knowledgeType);
        }
        return { valid: errors.length === 0, errors };
    }

    // -----------------------------------------------------------------
    // 3. ROUTING HELPERS — composes RP-030 only, never a second geo model
    // -----------------------------------------------------------------

    // recordId -> honest side-table entry (see file header, "COMMUNITY
    // FIELD — HONEST LIMIT"). Never presented as if it were part of
    // RP-030's own frozen schema.
    const communityIndex = new Map();
    const domainIndex = new Map(); // recordId -> { domain, domainKnowledge, evidenceStatus }

    function regionWithCommunity(region, community) {
        if (region && community) return region + " (" + community + ")";
        return region || community || null;
    }

    function detectRoutingSuggestion(evidence) {
        const packs = languagePacks();
        if (!packs) return { matched: false, reason: "CAPABILITY_UNAVAILABLE" };
        return packs.detectLanguagePack(evidence);
    }

    // -----------------------------------------------------------------
    // 4. SUBMISSION — orchestrates RP-029-C (review pipeline) THEN
    //    RP-030 (language-pack routing) for the same safe contribution.
    //    Never routes to the pack registry if the review pipeline's own
    //    safety gate rejected or quarantined the content first.
    // -----------------------------------------------------------------

    function submitTeachingContribution(fields) {
        const f = fields || {};
        const knowledgeType = f.knowledgeType;
        const core = contributionCore();
        if (!core) return { status: "CAPABILITY_UNAVAILABLE", reason: "CozyKnowledgeContributionCore is not loaded." };

        const check = validateFields(knowledgeType, f);
        if (!check.valid) return { status: "REJECTED", errors: check.errors };

        const coreType = KNOWLEDGE_TYPE_TO_CORE[knowledgeType];
        const isDomain = DOMAIN_TYPES.indexOf(knowledgeType) !== -1;

        // Fold this vocabulary's extra fields (literalMeaning/
        // contextualMeaning/exampleUsage/domainKnowledge) into the
        // narrower RP-029-C 'meaning'/'context' fields it actually has —
        // never silently discarded, always concatenated with a labelled
        // prefix so a human reviewer can still see what was meant.
        const meaningParts = [];
        if (f.meaning) meaningParts.push(f.meaning);
        if (f.literalMeaning) meaningParts.push("Literal: " + f.literalMeaning);
        if (f.contextualMeaning) meaningParts.push("Contextual: " + f.contextualMeaning);
        const combinedMeaning = meaningParts.join(" | ") || f.meaning || null;

        const contextParts = [];
        if (f.context) contextParts.push(f.context);
        if (f.exampleUsage) contextParts.push("Example usage: " + f.exampleUsage);
        if (f.culturalNotes) contextParts.push("Cultural/context notes: " + f.culturalNotes);
        if (isDomain && f.domainKnowledge) contextParts.push("[" + knowledgeType + "] " + f.domainKnowledge);
        const combinedContext = contextParts.join(" | ") || f.context || null;

        // RP-029-C's own validateDraft() requires a non-empty
        // 'expression' for every contributionType except its three oral
        // types (AUDIO_REFERENCE/PRONUNCIATION/DIALECT_VARIANT) — it is
        // not modified here. A domain-knowledge contribution submitted
        // with no specific word therefore uses its own domainKnowledge
        // statement as the expression text passed downstream (never an
        // invented word) so the real, unmodified review pipeline can
        // accept it; this is disclosed, not fabricated.
        const effectiveExpression = f.expression || (isDomain && f.domainKnowledge ? String(f.domainKnowledge).slice(0, 120) : null);

        const draft = core.createDraft({ contributorId: f.contributorId || null });
        core.updateDraft(draft.id, {
            contributionType: coreType,
            language: f.language,
            dialect: f.dialect,
            region: regionWithCommunity(f.region, f.community),
            expression: effectiveExpression,
            meaning: combinedMeaning,
            translation: f.translation || null,
            context: combinedContext,
            pronunciation: f.pronunciation || null,
            phonetic: f.phonetic || null,
            audioReference: f.audioReference || null,
            source: f.source || null,
            consent: f.consent,
            privacyLevel: f.privacyLevel
        });

        const reviewResult = core.submitDraft(draft.id);

        const result = {
            status: reviewResult.status,
            knowledgeType,
            reviewPipeline: reviewResult,
            languagePackRouting: { status: "NOT_ATTEMPTED", reason: "Review pipeline did not accept the contribution." }
        };
        if (isDomain) result.evidenceStatus = DOMAIN_EVIDENCE_STATUS;

        if (reviewResult.status !== "SUBMITTED") {
            return result; // REJECTED_UNSAFE / QUARANTINED / CAPABILITY_UNAVAILABLE etc. — stop here
        }

        const packs = languagePacks();
        if (!packs) {
            result.languagePackRouting = { status: "CAPABILITY_UNAVAILABLE", reason: "CozyLanguagePacks (RP-030) is not loaded." };
            return result;
        }

        const languageId = String(f.language || "").toLowerCase();
        if (f.country) {
            packs.registerRegionalContext(languageId, { country: f.country, region: f.region, dialect: f.dialect });
        }

        const routed = packs.submitExpression({
            languageId,
            region: regionWithCommunity(f.region, f.community),
            dialect: f.dialect,
            expression: effectiveExpression,
            literalMeaning: f.literalMeaning || null,
            meaning: combinedMeaning,
            translation: f.translation || null,
            context: combinedContext,
            audioReference: f.audioReference || null,
            contributionType: coreType,
            contributorPseudonym: f.contributorId || null,
            sourceType: f.sourceType || "COMMUNITY",
            license: f.license || "LICENSE_UNKNOWN",
            country: f.country || null
        });

        result.languagePackRouting = routed;

        if (routed && routed.recordId) {
            if (f.community) communityIndex.set(routed.recordId, f.community);
            if (isDomain) domainIndex.set(routed.recordId, {
                domain: knowledgeType,
                domainKnowledge: f.domainKnowledge || null,
                evidenceStatus: DOMAIN_EVIDENCE_STATUS
            });
        }

        return result;
    }

    function getRoutingRecord(recordId) {
        const packs = languagePacks();
        const base = packs ? packs.getExpression(recordId) : null;
        if (!base) return null;
        return Object.assign({}, base, {
            community: communityIndex.get(recordId) || null,
            domainNote: domainIndex.get(recordId) || null,
            communityFieldNote: "community is tracked by this Phase 2A file, not by RP-030's own schema — see file header."
        });
    }

    // -----------------------------------------------------------------
    // 5. PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        TEACH_KNOWLEDGE_TYPES,
        DOMAIN_TYPES,
        ORAL_KNOWLEDGE_TYPES,
        KNOWLEDGE_TYPE_TO_CORE,
        DOMAIN_EVIDENCE_STATUS,
        describeContributionForm,
        validateFields,
        detectRoutingSuggestion,
        submitTeachingContribution,
        getRoutingRecord
    });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyTeachCozyAIRouting = api;
        root.window.CozyOS.Modules["cozy-teach-cozyai-routing-core"] = Object.freeze({
            version: "1.0.0",
            description: "RP-031 Phase 2A — Teach CozyAI full knowledge vocabulary (word/phrase/sentence/definition/literal+contextual meaning/pronunciation/dialect/region/example usage/translation/cultural notes/domain knowledge) composed on top of RP-029-C's real review-pipeline submission AND RP-030's real language-pack routing, for the same safe contribution. Never fabricates ASR/OCR/automatic language ID/translation-ML. Domain knowledge (agriculture/education/business/community/other) is always tagged COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED — never silently promoted to professional advice."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
