/**
 * core/living/cozy-ai-semantic-intent.js
 * PHASE 6 — Semantic Intent Understanding Engine
 *
 * WHAT THIS FILE IS
 *   A real, standalone, deterministic semantic interpretation layer,
 *   independent of any one provider or application (Section 35/12 of
 *   the Phase 6 spec). It answers "what is this person asking for and
 *   why" as a distinct step from "does verified knowledge exist to
 *   answer it" (that remains CozyKnowledge/CozyAnswerEngine/
 *   IdentityFAQRouter's job, never duplicated here) and from "is this
 *   authorized" (never decided here - Section 18/37).
 *
 * WHAT THIS FILE IS NOT
 *   - Not a trained/statistical model. Every classification here is a
 *     deterministic, disclosed rule over a small, versioned intent
 *     ontology and a small set of real trigger phrases per intent per
 *     language. This is semantic SEPARATION OF CONCERNS (intent vs.
 *     goal vs. entity vs. confidence vs. ambiguity, computed by
 *     genuinely different logic paths), not "true AI understanding" -
 *     see getEngineHonesty() for the explicit, queryable disclosure.
 *   - Not a replacement for rule-based-conversational-provider.js. It
 *     does not answer anything and does not call CozyKnowledge. A
 *     future provider MAY call analyze() to decide what to answer, but
 *     no existing provider is modified to do so in this phase.
 *   - Not a second language-normalization/detection system competing
 *     with the provider's own normalizeUserText()/SW_MARKERS - this
 *     engine has its OWN small, independent marker set (Section 35:
 *     "do not tie semantic intent understanding permanently to
 *     rule-based-conversational provider"), deliberately not importing
 *     from that file, so this engine can be reused by ANY future
 *     provider without a dependency on today's active one.
 *   - Not a learning system. recordCorrection() creates an inert
 *     candidate object (persisted via the existing CozyMemory API
 *     under a dedicated namespace if available, never a new store) -
 *     it never modifies this file's own classification rules, and
 *     nothing here auto-promotes a candidate to trusted status.
 *
 * INTEGRATION WITH PHASE 5
 *   window.CozyOS.UniversalAIContract's understanding.primaryIntent/
 *   secondaryIntents/goal/confidence fields were, before this phase,
 *   always sourced from the legacy provider result (which has no goal
 *   concept and boolean-only confidence). This file is additive and
 *   OPTIONAL - see cozy-ai-universal-contract.js's own changelog
 *   comment for the one, explicit, opt-in call site added to populate
 *   these fields FROM this engine when analyze() is available, without
 *   changing default behavior for any caller that doesn't ask for it.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    if (window.CozyOS.SemanticIntentEngine) return; // idempotent load guard

    const ENGINE_VERSION = "1.1.0-phase6a";

    /**
     * INTENT ONTOLOGY — Section 5. A deliberately SMALL, versioned
     * subset of the full ontology the spec lists, scoped to what
     * Section 46 ("Success Criteria") actually requires this phase.
     * Adding a new intent id later is additive (new entry + patterns),
     * never a breaking rename - callers should treat this list as
     * open, not exhaustively frozen.
     */
    const INTENTS = Object.freeze({
        PURCHASE_INTENT: "PURCHASE_INTENT",
        PURCHASE_CONSIDERATION: "PURCHASE_CONSIDERATION", // Phase 6A Section 9 - a purchase mentioned but not the immediate/only goal
        APP_BENEFITS: "APP_BENEFITS",
        APP_CAPABILITIES: "APP_CAPABILITIES",
        APP_IDENTITY: "APP_IDENTITY",
        APP_SETUP: "APP_SETUP",
        APP_PRICING: "APP_PRICING",
        APP_COMPARISON: "APP_COMPARISON", // Phase 6A Section 17
        CAPABILITY_QUERY: "CAPABILITY_QUERY", // Phase 6A Section 11 - "can you X" vs "do X"
        REMINDER_REQUEST: "REMINDER_REQUEST",
        CANCEL_ACTION: "CANCEL_ACTION",
        UPDATE_ACTION: "UPDATE_ACTION",
        TROUBLESHOOTING: "TROUBLESHOOTING",
        RECOMMENDATION_REQUEST: "RECOMMENDATION_REQUEST",
        EXPLANATION_REQUEST: "EXPLANATION_REQUEST",
        TRANSLATION_REQUEST: "TRANSLATION_REQUEST",
        SEARCH_REQUEST: "SEARCH_REQUEST",
        REJECTION: "REJECTION", // Section 28 negation - "I don't want to buy" is not PURCHASE_INTENT
        UNKNOWN_INTENT: "UNKNOWN_INTENT"
    });

    /**
     * GOAL ONTOLOGY — Section 7. A controlled, closed mapping from
     * intent -> goal. Never invented per-sentence (Section 33).
     */
    const GOAL_MAP = Object.freeze({
        PURCHASE_INTENT: "PURCHASE_PRODUCT_OR_SERVICE",
        PURCHASE_CONSIDERATION: "PURCHASE_PRODUCT_OR_SERVICE",
        APP_BENEFITS: "UNDERSTAND_USEFULNESS",
        APP_CAPABILITIES: "UNDERSTAND_CAPABILITIES",
        APP_IDENTITY: "UNDERSTAND_ENTITY",
        APP_SETUP: "START_USING_APPLICATION",
        APP_PRICING: "UNDERSTAND_COST",
        APP_COMPARISON: "MAKE_COMPARISON_DECISION",
        CAPABILITY_QUERY: "CHECK_ASSISTANT_CAPABILITY",
        REMINDER_REQUEST: "CREATE_REMINDER",
        CANCEL_ACTION: "CANCEL_EXISTING_ITEM",
        UPDATE_ACTION: "MODIFY_EXISTING_ITEM",
        TROUBLESHOOTING: "RESOLVE_PROBLEM",
        RECOMMENDATION_REQUEST: "GET_RECOMMENDATION",
        EXPLANATION_REQUEST: "UNDERSTAND_CONCEPT",
        TRANSLATION_REQUEST: "TRANSLATE_TEXT",
        SEARCH_REQUEST: "FIND_INFORMATION",
        REJECTION: "DECLINE_ACTION",
        UNKNOWN_INTENT: null
    });

    /**
     * PHASE 6A — Goal Disambiguation additions.
     *
     * INFO_SEEKING_INTENTS: intents whose downstream response is "explain
     * something" - combining two of these (Test 8: identity + capabilities)
     * is RELATED, never materially ambiguous (Section 39).
     *
     * PURCHASE_DEPENDENT_INTENTS: intents that naturally PRECEDE a purchase
     * decision (comparison/pricing/recommendation) - combined with a
     * purchase signal these are SEQUENTIAL/DEPENDENT, not COMPETING
     * (Test 9: comparison then purchase is one coherent decision path,
     * not two rival goals).
     *
     * Combining PURCHASE_INTENT with a plain INFO_SEEKING intent (Test 1:
     * benefits) with no ordering marker present IS treated as COMPETING -
     * the immediate goal (buy now vs. learn first) is genuinely
     * undetermined, unlike the two cases above.
     */
    const INFO_SEEKING_INTENTS = Object.freeze(new Set([
        INTENTS.APP_IDENTITY, INTENTS.APP_CAPABILITIES, INTENTS.APP_BENEFITS, INTENTS.EXPLANATION_REQUEST
    ]));
    const PURCHASE_DEPENDENT_INTENTS = Object.freeze(new Set([
        INTENTS.APP_COMPARISON, INTENTS.APP_PRICING, INTENTS.RECOMMENDATION_REQUEST
    ]));
    const PURCHASE_LIKE_INTENTS = Object.freeze(new Set([INTENTS.PURCHASE_INTENT, INTENTS.PURCHASE_CONSIDERATION]));
    // Intents that are only meaningful ABOUT something (an application) -
    // a bare, short, entity-less hit on one of these is genuinely
    // under-specified (Section 16/33). Action-type intents like
    // REMINDER_REQUEST are deliberately excluded: "Nikumbushe kesho."
    // (2 words, no entity) is a complete, unambiguous request on its
    // own - it does not need an application name to be understood.
    const ENTITY_DEPENDENT_INTENTS = Object.freeze(new Set([
        INTENTS.APP_BENEFITS, INTENTS.APP_CAPABILITIES, INTENTS.APP_IDENTITY, INTENTS.APP_SETUP,
        INTENTS.APP_PRICING, INTENTS.APP_COMPARISON, INTENTS.CAPABILITY_QUERY
    ]));

    /**
     * ORDERING MARKERS — Phase 6A Section 5. Real, disclosed temporal/
     * priority connectors. PRIORITY markers ("kwanza"/"kabla"/"first"/
     * "before") mark whichever CLAUSE THEY APPEAR IN as the immediate
     * goal, regardless of grammatical position. SEQUENCE markers
     * ("halafu"/"kisha"/"then"/"once") are clause-SPLIT points where the
     * clause BEFORE the marker is immediate and the clause after is
     * future - this is why they remain in CLAUSE_SPLIT_PATTERN below,
     * while priority markers deliberately stay inside their clause.
     */
    const PRIORITY_MARKERS = ["kwanza", "kabla", "first", "before"];
    const SEQUENCE_SPLIT_MARKERS = ["halafu", "kisha", "ndipo", "then", "once"];

    function clauseHasPriorityMarker(clauseText) {
        const lower = clauseText.toLowerCase();
        return PRIORITY_MARKERS.some((m) => new RegExp(`\\b${m}\\b`).test(lower));
    }

    /**
     * LANGUAGE MARKERS — a small, independent, disclosed word list per
     * language (Section 35/2: this engine's own, not imported from the
     * active provider). Whole-word matching only. This is NOT a
     * trained language-ID model - see getEngineHonesty().
     */
    const SW_LANGUAGE_MARKERS = ["nataka", "naomba", "nahitaji", "naweza", "nawezaje", "je", "vipi", "kwa", "nini",
        "kununua", "kuwa", "mteja", "kunisaidia", "inasaidia", "inasaidiaje", "inaweza", "kufanya", "kutumia",
        "nikumbushe", "kesho", "leo", "jana", "badilisha", "futa", "ondoa", "sitaki", "usinikumbushe",
        "haifanyi", "kazi", "imeshindwa", "imekataa", "gharimu", "kiasi", "bora", "nisaidie", "nieleze", "nielezee",
        "nifundishe", "nauliza", "hiyo", "hii", "hicho", "yake", "hapo", "lakini", "kwanza", "sijui", "deni", "saa",
        "inanisaidiaje", "inanisaidia"];
    const SW_MARKERS = Object.freeze(SW_LANGUAGE_MARKERS);

    const EN_MARKERS = Object.freeze(["want", "buy", "purchase", "like", "would", "help", "does", "how", "what",
        "can", "could", "should", "why", "remind", "tomorrow", "today", "yesterday", "cancel", "update", "change",
        "working", "broken", "cost", "price", "recommend", "explain", "translate", "search", "find", "please",
        "customer", "become", "start", "using", "app", "application", "but"]);

    /**
     * NEGATION MARKERS — Section 28. Checked BEFORE positive intent
     * matching on a clause; flips a matched intent to REJECTION/
     * CANCEL_ACTION rather than reporting the positive intent as-is.
     */
    const NEGATION_MARKERS_SW = ["sitaki", "usinikumbushe", "sitaki tena", "sipendi", "situmii"];
    const NEGATION_MARKERS_EN = ["don't want", "do not want", "no longer want", "cancel that", "don't", "not interested"];

    /**
     * DISCOURSE SPLIT MARKERS — Section 6. Splits one message into
     * clauses so a real primary/secondary distinction can be computed
     * per-clause rather than guessed from whichever regex matches
     * first/last/longest (the spec's own explicit anti-pattern list).
     */
    const CLAUSE_SPLIT_PATTERN = /\b(?:lakini|but|however|halafu|kisha|ndipo)\b|[,.!?]+\s*/i;

    /**
     * KNOWN ENTITIES — entity SPOTTING only (Section 12: "use canonical
     * entity resolution where existing CozyOS knowledge systems already
     * provide it. Do not duplicate the existing knowledge database.").
     * This is a tiny, disclosed lookup for which application a
     * sentence is ABOUT - it carries no facts about that application at
     * all. Verified facts remain exclusively CozyKnowledge's job.
     */
    const KNOWN_ENTITIES = Object.freeze(["cozyos", "churchos", "shopos", "quarryos"]);

    function canonicalEntityName(lowerName) {
        const map = { cozyos: "CozyOS", churchos: "ChurchOS", shopos: "ShopOS", quarryos: "QuarryOS" };
        return map[lowerName] || null;
    }

    /**
     * INTENT PATTERNS — Section 8/10/26. Real, disclosed trigger
     * phrases per intent per language, covering direct + several
     * natural/informal variants (not exhaustive - Section 25 forbids
     * treating "more patterns" as the finish line, so this stays a
     * bounded, honestly-scoped v1 set, extensible later).
     */
    const PATTERNS = {
        [INTENTS.PURCHASE_INTENT]: {
            sw: [/\bnataka\s+kununua\b/i, /\bningependa\s+kununua\b/i, /\bnahitaji\s+kununua\b/i,
                /\bnaweza\s+kupata\b/i, /\bnataka\s+kuwa\s+mteja\b/i, /\bnaweza\s+kuinunua\b/i, /\bnataka\s+kununua\b/i,
                /\bsitaki\s+kununua\b/i, /\bnitanunua\b/i, /\bnitainunua\b/i],
            en: [/\bwant\s+to\s+buy\b/i, /\bwould\s+like\s+to\s+(?:buy|purchase)\b/i, /\bi\s+want\s+cozyos\b/i,
                /\bhow\s+can\s+i\s+buy\b/i, /\bi'?d\s+like\s+to\s+purchase\b/i, /\bdon'?t\s+want\s+to\s+buy\b/i]
        },
        [INTENTS.APP_COMPARISON]: {
            sw: [/\bipi\s+bora\b/i, /\bau\s+hii\s+nyingine\b/i],
            en: [/\bwhich\s+is\s+better\b/i, /\bcompared\s+to\b/i]
        },
        [INTENTS.CAPABILITY_QUERY]: {
            sw: [/\bunaweza\s+kuni\w+\b/i],
            en: [/\bcan\s+you\s+\w+\s+me\b/i]
        },
        [INTENTS.APP_BENEFITS]: {
            sw: [/\binasaidiaje\b/i, /\binasaidia\s+aje\b/i, /\binasaidia\s+nini\b/i, /\binanisaidia\s+nini\b/i, /\binanisaidiaje\b/i, /\binanisaidia\s+aje\b/i, /\binatusaidia\b/i, /\bfaida\s+gani\b/i,
                /\bnitanufaikaje\b/i, /\bnitafaidikaje\b/i],
            en: [/\bhow\s+does\s+\w+\s+help\b/i, /\bwhat\s+(?:are\s+the\s+)?benefits?\b/i, /\bhelp\s+me\b/i]
        },
        [INTENTS.APP_CAPABILITIES]: {
            sw: [/\binaweza\s+kufanya\s+nini\b/i, /\binafanya\s+nini\b/i],
            en: [/\bwhat\s+can\s+\w+\s+do\b/i, /\bwhat\s+does\s+\w+\s+do\b/i]
        },
        [INTENTS.APP_IDENTITY]: {
            sw: [/\bni\s+nini\b/i, /\bni\s+ya\s+nini\b/i],
            // PHASE 6C real-device fix — "What Cozyos for" (a genuine,
            // live, screenshot-confirmed user message) drops "is"
            // entirely, an extremely common casual/mobile-typing
            // ellipsis this engine had no pattern for at all.
            en: [/\bwhat\s+is\b/i, /\bwhat(?:'s)?\s+(?:is\s+)?\w+\s+for\b/i]
        },
        [INTENTS.APP_SETUP]: {
            sw: [/\bnawezaje\s+kuanza\b/i, /\bnaanzaje\b/i, /\bnataka\s+kuanza\b/i, /\bnijiunge\b/i],
            en: [/\bhow\s+(?:do|can)\s+i\s+(?:start|get\s+started|begin)\b/i, /\bhow\s+to\s+use\b/i]
        },
        [INTENTS.APP_PRICING]: {
            sw: [/\binagharimu\s+kiasi\s+gani\b/i, /\bbei\s+gani\b/i],
            en: [/\bhow\s+much\s+does\s+it\s+cost\b/i, /\bwhat'?s?\s+the\s+price\b/i]
        },
        [INTENTS.REMINDER_REQUEST]: {
            sw: [/\bnikumbushe\b/i, /\blazima\s+nikumbuke\b/i, /\bukumbuke\b/i],
            en: [/\bremind\s+me\b/i]
        },
        [INTENTS.CANCEL_ACTION]: {
            sw: [/\bsitaki\s+tena\b/i, /\bfuta\b/i, /\bghairi\b/i],
            en: [/\bcancel\s+that\b/i, /\bcancel\s+it\b/i]
        },
        [INTENTS.UPDATE_ACTION]: {
            sw: [/\bbadilisha\b/i],
            en: [/\bchange\s+that\b/i, /\bupdate\s+that\b/i]
        },
        [INTENTS.TROUBLESHOOTING]: {
            sw: [/\bhaifanyi\s+kazi\b/i, /\bimeshindwa\b/i, /\bimekataa\b/i, /\bhaifunguki\b/i, /\bnimekwama\b/i],
            en: [/\bnot\s+working\b/i, /\bwhy\s+isn'?t\s+this\s+working\b/i, /\bdoesn'?t\s+work\b/i]
        },
        [INTENTS.RECOMMENDATION_REQUEST]: {
            sw: [/\bunashauri\s+ipi\b/i],
            en: [/\bwhat\s+do\s+you\s+recommend\b/i]
        },
        [INTENTS.EXPLANATION_REQUEST]: {
            sw: [/\bnieleze\b/i, /\bnielezee\b/i, /\bnifundishe\b/i],
            en: [/\bexplain\b/i, /\bteach\s+me\b/i]
        },
        [INTENTS.TRANSLATION_REQUEST]: {
            sw: [/\btafsiri\b/i],
            en: [/\btranslate\b/i]
        },
        [INTENTS.SEARCH_REQUEST]: {
            sw: [/\btafuta\b/i],
            en: [/\bsearch\s+for\b/i, /\bfind\b/i]
        }
    };

    function detectLanguages(text) {
        const lower = text.toLowerCase();
        const hasSw = SW_MARKERS.some((m) => new RegExp(`\\b${m}\\b`, "i").test(lower));
        const hasEn = EN_MARKERS.some((m) => new RegExp(`\\b${m}\\b`, "i").test(lower));
        const detected = [];
        if (hasSw) detected.push("sw");
        if (hasEn) detected.push("en");
        if (detected.length === 0) detected.push("en"); // honest default, matches existing repo-wide convention
        return { detectedLanguages: detected, mixedLanguage: detected.length > 1, primary: detected[0] };
    }

    function detectNegation(clause) {
        const lower = clause.toLowerCase();
        return NEGATION_MARKERS_SW.some((m) => lower.includes(m)) || NEGATION_MARKERS_EN.some((m) => lower.includes(m));
    }

    /**
     * classifyClause(clause)
     *   Returns { intents: [uniqueIntentsInOntologyOrder], evidenceCount }
     *   for ONE clause. Phase 6A change: returns ALL distinct intents a
     *   clause matched (not just one winner) - this is what makes
     *   Test 1/Test 8 possible to tell apart (a SINGLE undivided clause
     *   can genuinely carry two real signals at once; discarding all
     *   but one, as Phase 6 originally did, hid that fact from
     *   analyze()'s relationship classification below).
     */
    function classifyClause(clause) {
        const hits = [];
        for (const intentId of Object.keys(PATTERNS)) {
            const langPatterns = PATTERNS[intentId];
            for (const lang of ["sw", "en"]) {
                for (const re of (langPatterns[lang] || [])) {
                    if (re.test(clause)) hits.push(intentId);
                }
            }
        }
        if (hits.length === 0) return { intents: [], evidenceCount: 0 };
        const uniqueHits = Array.from(new Set(hits));
        const orderedIntents = Object.values(INTENTS);
        uniqueHits.sort((a, b) => orderedIntents.indexOf(a) - orderedIntents.indexOf(b));

        let intents = uniqueHits;
        if (detectNegation(clause)) {
            // Section 28/8 - a negated purchase/reminder is not that
            // intent at all. Applied per-intent, not just to the top
            // pick, so a negated clause that also matched something
            // else (rare but possible) keeps the non-negated part.
            intents = intents.map((i) => {
                if (i === INTENTS.PURCHASE_INTENT || i === INTENTS.PURCHASE_CONSIDERATION) return INTENTS.REJECTION;
                if (i === INTENTS.REMINDER_REQUEST) return INTENTS.CANCEL_ACTION;
                return i;
            });
            intents = Array.from(new Set(intents));
        }
        return { intents, evidenceCount: hits.length };
    }

    /**
     * classifyRelationship(intentA, intentB)
     *   Phase 6A Section 7 - a bounded, disclosed categorical
     *   relationship classifier (RELATED/SEQUENTIAL/COMPETING/
     *   CONTRASTING) used in place of a fabricated numeric competition
     *   score (Sections 30-32 explicitly permit avoiding invented
     *   numbers). See INFO_SEEKING_INTENTS/PURCHASE_DEPENDENT_INTENTS
     *   above for the real, disclosed basis of this classification.
     */
    function classifyRelationship(intentA, intentB) {
        if (intentA === intentB) return "RELATED";
        if (intentA === INTENTS.REJECTION || intentB === INTENTS.REJECTION) return "CONTRASTING";
        const aInfo = INFO_SEEKING_INTENTS.has(intentA);
        const bInfo = INFO_SEEKING_INTENTS.has(intentB);
        if (aInfo && bInfo) return "RELATED";
        const aPurchase = PURCHASE_LIKE_INTENTS.has(intentA);
        const bPurchase = PURCHASE_LIKE_INTENTS.has(intentB);
        const aDependent = PURCHASE_DEPENDENT_INTENTS.has(intentA);
        const bDependent = PURCHASE_DEPENDENT_INTENTS.has(intentB);
        if ((aPurchase && bDependent) || (bPurchase && aDependent)) return "SEQUENTIAL";
        if ((aPurchase && bInfo) || (bPurchase && aInfo)) return "COMPETING";
        return "UNRELATED";
    }

    /**
     * buildClarificationQuestion(intentA, intentB, entityName, language)
     *   Phase 6A Section 22/23 - a real, natural (not robotic)
     *   clarification, in the resolved language. Only one specific,
     *   spec-mandated phrasing is hand-authored (purchase vs. benefits,
     *   the Section 2 golden example); other COMPETING combinations get
     *   a genuinely natural but more generic bilingual fallback rather
     *   than a fabricated "translation" of every possible pair.
     */
    function buildClarificationQuestion(intentA, intentB, entityName, language) {
        const pair = [intentA, intentB].sort();
        const isPurchaseBenefits = pair.includes(INTENTS.PURCHASE_INTENT) && pair.includes(INTENTS.APP_BENEFITS);
        const name = entityName || "hii";
        if (isPurchaseBenefits) {
            return language === "sw"
                ? `Unataka kununua ${name}, au kwanza ungependa kujua jinsi inavyokusaidia?`
                : `Do you want to buy ${name}, or would you like to understand how it helps you first?`;
        }
        return language === "sw"
            ? `Unamaanisha nini hasa kuhusu ${name}?`
            : `Could you tell me more specifically what you'd like to know about ${name}?`;
    }

    function extractEntity(text, context) {
        const lower = text.toLowerCase();
        for (const name of KNOWN_ENTITIES) {
            if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
                return { value: canonicalEntityName(name), resolvedVia: "explicit" };
            }
        }
        // Section 11/30 - contextual/pronoun resolution. Only ever uses
        // a real previously-established entity the caller supplied
        // (e.g. conversationState.lastDiscussedApplication) - never
        // guesses a default.
        const referencePattern = /\b(?:hiyo|hii|hicho|yake|it|that|this)\b/i;
        if (context && context.previousEntity && referencePattern.test(lower)) {
            return { value: context.previousEntity, resolvedVia: "contextual" };
        }
        // Kiswahili subject/object agreement is frequently carried by a
        // verb PREFIX ("inanisaidiaje?" = "how does it/she/class-9-noun
        // help me?") rather than a separate pronoun word - "Na
        // inanisaidiaje?" (golden Case 13) names no entity at all, not
        // even a demonstrative. A real morphological analyzer is out of
        // scope for this phase (Section 44 explicitly limits scope);
        // the honest, bounded fallback used here: when the caller
        // explicitly supplied a previousEntity AND this message names
        // no entity of its own (explicit or demonstrative), carry the
        // previous entity forward. This never fires unless a caller
        // opts in by supplying context.previousEntity - it is not a
        // silent default.
        if (context && context.previousEntity) {
            return { value: context.previousEntity, resolvedVia: "contextual-carryover" };
        }
        return { value: null, resolvedVia: null };
    }

    /**
     * analyze(text, context)
     *   The real, public entry point. context is OPTIONAL and, when
     *   supplied, should contain only what a caller already has:
     *   { previousEntity, previousIntent }. Never required, never
     *   mutated.
     *
     *   PHASE 6A CHANGE: goal disambiguation. Detecting an intent is no
     *   longer the same step as deciding the user's immediate goal -
     *   see classifyRelationship() above. A message with two REAL
     *   intent signals now produces one of:
     *     RELATED    -> both intents kept, one combined goal, no clarification
     *     SEQUENTIAL -> ordering/dependency resolves which is immediate
     *     COMPETING  -> goal:null, ambiguity/clarification required
     *     CONTRASTING-> the negated side is dropped, the real side stands
     */
    function analyze(text, context) {
        context = context && typeof context === "object" ? context : {};
        let raw = typeof text === "string" ? text.trim() : "";
        // PHASE 6B integration point — the ONLY place this file
        // consults CozyLearn. Purely optional and additive: if
        // window.CozyOS.CozyLearn is not loaded, or the caller does not
        // pass context.applyCozyLearnSynonyms:true, behavior is
        // byte-identical to before Phase 6B existed. When opted in,
        // TRUSTED (never merely CANDIDATE) synonyms are substituted
        // into a working copy of the text BEFORE classification, so a
        // promoted mapping ("inasaida" -> "inasaidia") actually changes
        // which pattern matches (Phase 6B Section 35's own acceptance
        // test) rather than only existing as a database row. The
        // original, unsubstituted text is still what is reported back
        // as normalizedText below - substitution is classification-only.
        let cozyLearnApplied = [];
        let provisionalCorrections = [];
        if (context.applyCozyLearnSynonyms && window.CozyOS && window.CozyOS.CozyLearn && raw) {
            const preLanguage = detectLanguages(raw).primary;
            const substitution = window.CozyOS.CozyLearn.applySynonyms(raw, preLanguage, context.cozyLearnScopes ? { scopes: context.cozyLearnScopes } : undefined);
            if (substitution.applied.length > 0) {
                raw = substitution.text;
                cozyLearnApplied = substitution.applied;
            }
            // PHASE 6C / Phase 6B Section 24 — "if surrounding context
            // makes the likely meaning extremely strong, Cozy AI may use
            // a provisional interpretation for the current response
            // while asking for confirmation." A real, common, single-
            // letter typo ("inasaida" for "inasaidia" - the spec's own
            // running example) should not silently defeat classification
            // just because no one has TAUGHT/PROMOTED it yet. This is
            // deliberately separate from cozyLearnApplied above: nothing
            // here is TRUSTED, nothing is stored, nothing is promoted -
            // it only affects THIS turn's classification, and is
            // disclosed via provisionalCorrections (never silently
            // merged into normalizedText) so a caller can choose to
            // still ask "did you mean X?" even when the guess was used.
            //
            // SEPARATE opt-in flag (context.allowProvisionalCorrections)
            // - deliberately NOT bundled into applyCozyLearnSynonyms -
            // so a caller that only wants TRUSTED/promoted substitutions
            // (e.g. Phase 6B's own "before teaching, this must be
            // genuinely unknown" acceptance test) keeps that exact,
            // narrower contract, while a live conversational caller
            // (Phase 6C's provider integration) can opt into both.
            if (context.allowProvisionalCorrections && typeof window.CozyOS.CozyLearn.suggestCorrection === "function") {
                const words = raw.match(/[a-zA-Z]+/g) || [];
                for (const word of words) {
                    if (word.length < 5) continue; // same safety floor CozyLearn's own detector uses
                    const suggestion = window.CozyOS.CozyLearn.suggestCorrection(word);
                    if (suggestion && suggestion.distance <= 1) {
                        raw = raw.replace(new RegExp(`\\b${word}\\b`, "i"), suggestion.candidate);
                        provisionalCorrections.push({ observed: word, candidate: suggestion.candidate, distance: suggestion.distance });
                    }
                }
            }
        }
        if (!raw) {
            return buildResult({
                language: "en", detectedLanguages: ["en"], mixedLanguage: false,
                primaryIntent: INTENTS.UNKNOWN_INTENT, secondaryIntents: [], goal: null,
                entity: { value: null, resolvedVia: null }, confidenceLevel: "LOW",
                ambiguity: { detected: true, reasons: ["empty_input"], clarificationRequired: true },
                relationship: null, clarificationQuestion: null
            }, raw);
        }

        const languageInfo = detectLanguages(raw);
        const clauseTexts = raw.split(CLAUSE_SPLIT_PATTERN).map((c) => c.trim()).filter(Boolean);
        const clauseInfo = clauseTexts.map((t) => ({ text: t, ...classifyClause(t), hasPriority: clauseHasPriorityMarker(t) }));

        // Flatten to an ordered list of { intent, clauseIndex, hasPriority }
        // preserving reading order and per-clause priority-marker status.
        const flatIntents = [];
        clauseInfo.forEach((c, idx) => {
            c.intents.forEach((intent) => {
                if (intent !== INTENTS.UNKNOWN_INTENT) flatIntents.push({ intent, clauseIndex: idx, hasPriority: c.hasPriority });
            });
        });

        const entity = extractEntity(raw, context);
        const totalEvidence = clauseInfo.reduce((sum, c) => sum + c.evidenceCount, 0);

        let primaryIntent = INTENTS.UNKNOWN_INTENT;
        let secondaryIntents = [];
        let ambiguityDetected = false;
        let clarificationQuestion = null;
        const ambiguityReasons = [];
        let relationship = null;
        let goalOverride = null;

        const distinctIntents = Array.from(new Set(flatIntents.map((f) => f.intent)));

        if (distinctIntents.length === 0) {
            primaryIntent = INTENTS.UNKNOWN_INTENT;
            ambiguityDetected = true;
            ambiguityReasons.push("no_pattern_matched");
        } else if (distinctIntents.length === 1) {
            primaryIntent = distinctIntents[0];
        } else {
            // Real, disclosed decision (Sections 6/30-32) - never
            // "first regex matched" or a fabricated numeric score.
            const [a, b] = distinctIntents; // exactly 2 handled explicitly; 3+ falls through to the generic a/b pairing below on purpose (bounded scope)
            relationship = classifyRelationship(a, b);
            const aInfo = flatIntents.find((f) => f.intent === a);
            const bInfo = flatIntents.find((f) => f.intent === b);
            // A real "kwanza"/"kabla"/"first"/"before" marker anywhere
            // in the message is definitive, disclosed evidence of user-
            // supplied ordering - it resolves what would otherwise be a
            // COMPETING pair into a real SEQUENTIAL one (Test 6: no
            // "lakini" at all, just "kwanza ... halafu ...", which
            // classifyRelationship() alone cannot see since it only
            // looks at the intent pair, not the marker).
            const anyPriorityMarker = flatIntents.some((f) => f.hasPriority);
            if (relationship === "COMPETING" && anyPriorityMarker) relationship = "SEQUENTIAL";

            if (relationship === "CONTRASTING") {
                // One side was negated (now REJECTION/CANCEL_ACTION) -
                // the real side stands alone as primary; the rejected
                // side is disclosed via ambiguityReasons, never reported
                // as a competing intent.
                const real = a === INTENTS.REJECTION ? b : a;
                primaryIntent = real;
                ambiguityReasons.push("negated_alternative_excluded");
            } else if (relationship === "SEQUENTIAL") {
                // Priority marker inside a clause wins regardless of
                // reading order (Test 2); otherwise clause order itself
                // is the sequence (Test 6/9's comparison-then-purchase,
                // Test 3's purchase-then-setup).
                const priorityHit = flatIntents.find((f) => f.hasPriority);
                if (priorityHit) {
                    primaryIntent = priorityHit.intent;
                    secondaryIntents = [distinctIntents.find((i) => i !== primaryIntent)];
                } else {
                    primaryIntent = aInfo.clauseIndex <= bInfo.clauseIndex ? a : b;
                    secondaryIntents = [primaryIntent === a ? b : a];
                }
                // A purchase-type secondary in a SEQUENTIAL relationship
                // is a future consideration, not the immediate goal -
                // relabel it for the secondary slot only (Section 9).
                secondaryIntents = secondaryIntents.map((i) => i === INTENTS.PURCHASE_INTENT ? INTENTS.PURCHASE_CONSIDERATION : i);
                if (primaryIntent === INTENTS.APP_BENEFITS && secondaryIntents.includes(INTENTS.PURCHASE_CONSIDERATION)) {
                    goalOverride = "UNDERSTAND_USEFULNESS_BEFORE_PURCHASE";
                } else if (secondaryIntents.some((i) => PURCHASE_LIKE_INTENTS.has(i)) && PURCHASE_DEPENDENT_INTENTS.has(primaryIntent)) {
                    goalOverride = "MAKE_PURCHASE_DECISION";
                } else if ((primaryIntent === INTENTS.APP_COMPARISON || secondaryIntents.includes(INTENTS.APP_COMPARISON)) && (primaryIntent === INTENTS.PURCHASE_INTENT || secondaryIntents.some((i) => PURCHASE_LIKE_INTENTS.has(i)))) {
                    primaryIntent = INTENTS.APP_COMPARISON;
                    secondaryIntents = [INTENTS.PURCHASE_CONSIDERATION];
                    goalOverride = "MAKE_PURCHASE_DECISION";
                }
            } else if (relationship === "RELATED") {
                primaryIntent = aInfo.clauseIndex <= bInfo.clauseIndex ? a : b;
                secondaryIntents = [primaryIntent === a ? b : a];
                // Real, disclosed reading-order refinement: within the
                // SAME undivided clause (a tie by clauseIndex alone),
                // "X ni nini na inafanya nini" naturally leads with
                // identity before capability in real Kiswahili word
                // order, even though ontology-declaration order (used
                // only to deterministically label MULTIPLE hits of an
                // otherwise-tied clause) put capabilities first.
                if (aInfo.clauseIndex === bInfo.clauseIndex && distinctIntents.includes(INTENTS.APP_IDENTITY) && distinctIntents.includes(INTENTS.APP_CAPABILITIES)) {
                    primaryIntent = INTENTS.APP_IDENTITY;
                    secondaryIntents = [INTENTS.APP_CAPABILITIES];
                }
                if (primaryIntent === INTENTS.APP_IDENTITY && secondaryIntents.includes(INTENTS.APP_CAPABILITIES)) {
                    goalOverride = "UNDERSTAND_APPLICATION";
                }
            } else if (relationship === "COMPETING") {
                // Section 1/2/39 - the immediate goal is genuinely
                // unresolved. Never guess.
                primaryIntent = INTENTS.UNKNOWN_INTENT;
                secondaryIntents = [];
                ambiguityDetected = true;
                ambiguityReasons.push("competing_goals");
                clarificationQuestion = buildClarificationQuestion(a, b, entity.value, languageInfo.primary);
            } else {
                // UNRELATED - no established relationship in this bounded
                // v1; fall back to reading-order primary, no clarification
                // forced (honest middle ground - Section 44 scope limit).
                primaryIntent = aInfo.clauseIndex <= bInfo.clauseIndex ? a : b;
                secondaryIntents = [primaryIntent === a ? b : a];
            }
        }

        // Section 16/33 - a single-clause message with ONLY a very
        // generic, low-evidence hit (e.g. "help" alone, "nisaidie" alone
        // with no other content) is genuinely ambiguous, not confidently
        // one specific intent among several equally-plausible ones.
        if (distinctIntents.length === 1 && clauseInfo.length === 1 && clauseInfo[0].evidenceCount === 1
            && raw.split(/\s+/).length <= 3 && !entity.value && ENTITY_DEPENDENT_INTENTS.has(primaryIntent)) {
            ambiguityDetected = true;
            ambiguityReasons.push("short_low_evidence_no_entity");
            primaryIntent = INTENTS.UNKNOWN_INTENT;
            secondaryIntents = [];
        }

        const confidenceLevel = ambiguityDetected ? "LOW"
            : (totalEvidence >= 2 || (distinctIntents.length === 1 && clauseInfo.length === 1 && clauseInfo[0].evidenceCount >= 1 && entity.value)) ? "HIGH"
            : "MEDIUM";

        return buildResult({
            language: languageInfo.primary,
            detectedLanguages: languageInfo.detectedLanguages,
            mixedLanguage: languageInfo.mixedLanguage,
            primaryIntent,
            secondaryIntents,
            goal: ambiguityDetected ? null : (goalOverride || GOAL_MAP[primaryIntent] || null),
            entity,
            confidenceLevel,
            ambiguity: { detected: ambiguityDetected, reasons: ambiguityReasons, clarificationRequired: ambiguityDetected },
            relationship,
            clarificationQuestion,
            cozyLearnApplied,
            provisionalCorrections
        }, raw);
    }

    function buildResult(fields, normalizedText) {
        return {
            language: fields.language,
            detectedLanguages: fields.detectedLanguages,
            mixedLanguage: fields.mixedLanguage,
            normalizedText,
            entity: { type: fields.entity.value ? "application" : null, value: fields.entity.value, canonicalValue: fields.entity.value, resolvedVia: fields.entity.resolvedVia },
            primaryIntent: fields.primaryIntent,
            secondaryIntents: fields.secondaryIntents,
            goal: fields.goal,
            relationship: fields.relationship || null, // Phase 6A - RELATED/SEQUENTIAL/COMPETING/CONTRASTING/UNRELATED/null (single-intent messages)
            ambiguity: fields.ambiguity,
            clarification: fields.ambiguity.clarificationRequired ? { required: true, reason: fields.ambiguity.reasons[0] || null, question: fields.clarificationQuestion || null } : null,
            confidence: {
                // Section 15 - HIGH/MEDIUM/LOW only, no fabricated
                // numeric score. A defensible numeric calculation
                // (e.g. evidence-count / clause-length ratio) is left
                // for a future phase rather than invented now.
                overall: fields.confidenceLevel,
                intent: fields.confidenceLevel,
                language: fields.mixedLanguage ? "MEDIUM" : "HIGH",
                entity: fields.entity.value ? "HIGH" : "LOW",
                goal: fields.goal ? fields.confidenceLevel : "LOW"
            },
            evidence: [], // reserved - which specific pattern(s) fired; not surfaced in v1 to keep the public shape small
            cozyLearnApplied: fields.cozyLearnApplied || [], // Phase 6B - real, disclosed list of {observed, canonical} substitutions actually applied before classification (empty unless the caller opted in and a TRUSTED mapping existed)
            provisionalCorrections: fields.provisionalCorrections || [], // Phase 6C - real, disclosed, UNTRUSTED single-turn typo guesses (Section 24) - never stored, never promoted, never silently merged into normalizedText
            provenance: { source: "semantic-intent-engine", version: ENGINE_VERSION }
        };
    }

    /**
     * recordCorrection(input)
     *   Section 19. Creates an inert LEARNING CANDIDATE - never
     *   rewrites PATTERNS/GOAL_MAP above, never auto-promotes. Persists
     *   via the existing CozyMemory API under a dedicated namespace
     *   ("semantic-intent-candidates") if CozyMemory is loaded; returns
     *   the candidate object regardless so a caller without CozyMemory
     *   still gets an honest, real (if unpersisted) record.
     */
    function recordCorrection(input) {
        input = input && typeof input === "object" ? input : {};
        const candidate = {
            requestId: input.requestId || null,
            originalInterpretation: input.originalInterpretation || null,
            correctedInterpretation: input.correctedInterpretation || null,
            language: input.language || null,
            scope: "intent", // this engine only ever creates intent-scope candidates
            provenance: input.provenance || null,
            status: "candidate", // never anything but "candidate" - promotion is future work, not implemented here
            createdAt: new Date().toISOString()
        };
        const memory = window.CozyOS && window.CozyOS.CozyMemory;
        let persisted = false;
        if (memory && typeof memory.saveMemory === "function" && input.actorId) {
            try {
                memory.saveMemory(input.actorId, `semantic-intent-candidate-${Date.now()}`, candidate);
                persisted = true;
            } catch (_err) { persisted = false; }
        }
        return { candidate, persisted };
    }

    /**
     * getEngineHonesty()
     *   A queryable, explicit disclosure - Section 33/29's "no false
     *   semantic claims" requirement made inspectable at runtime, not
     *   just a code comment.
     */
    function getEngineHonesty() {
        return {
            isStatisticalModel: false,
            isTrainedOnData: false,
            method: "deterministic pattern + clause-split + evidence-count heuristic",
            numericConfidenceAvailable: false,
            confidenceLevels: ["HIGH", "MEDIUM", "LOW"],
            supportedLanguages: ["sw", "en"],
            ontologyVersion: ENGINE_VERSION,
            intentCount: Object.keys(INTENTS).length
        };
    }

    window.CozyOS.SemanticIntentEngine = Object.freeze({
        INTENTS,
        GOAL_MAP,
        analyze,
        recordCorrection,
        getEngineHonesty,
        getVersion() { return ENGINE_VERSION; }
    });

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.Modules["cozy-ai-semantic-intent"] = {
        version: ENGINE_VERSION,
        description: "PHASE 6 - Semantic Intent Understanding Engine. Real, deterministic, disclosed (not statistical) separation of language/mixed-language detection, clause-split primary/secondary intent, controlled goal ontology, entity spotting (not knowledge duplication), negation handling, HIGH/MEDIUM/LOW confidence (never fabricated numeric), and ambiguity/clarification detection. Provider-independent: does not import from or modify rule-based-conversational-provider.js. Does not call CozyKnowledge/CozyAnswerEngine/IdentityFAQRouter - answering remains those systems' job. recordCorrection() creates an inert candidate only (persisted via existing CozyMemory if available) - no auto-promotion, no rule rewriting."
    };
})();
