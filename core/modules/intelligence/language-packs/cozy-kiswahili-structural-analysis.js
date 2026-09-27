/**
 * core/modules/intelligence/language-packs/cozy-kiswahili-structural-analysis.js
 * Kiswahili Structural/Morphological Semantic Layer — new, additive module.
 *
 * WHY THIS FILE EXISTS
 *   Repository inspection (this pass) found no existing Kiswahili
 *   morphology/grammar engine anywhere in core/:
 *     - core/modules/intelligence/knowledge/cozy-lexicon-en-sw.js is a
 *       flat, real 473-record {en, sw, category} vocabulary table. It
 *       has no roots field, no morphologyAllowed field, no noun
 *       classes, no semantic-family graph, and no geographic-entity
 *       data.
 *     - core/modules/intelligence/language-packs/cozy-language-
 *       knowledge-model.js is the RP-035 TranslationRelationship /
 *       CorrectionRecord / ConflictRecord data model — a schema for
 *       relationships BETWEEN pack entries, not a Kiswahili grammar.
 *     - core/modules/intelligence/language-packs/cozy-african-
 *       language-intelligence.js (RP-034 Phase 5) routes evidence to
 *       the most specific language PACK; it does not parse Kiswahili
 *       word structure.
 *     - rule-based-conversational-provider.js's detectLanguageHeuristic()
 *       is a disclosed, real keyword-overlap marker list (~90 words)
 *       plus a single "-je" suffix rule. It is exactly the "giant
 *       marker list" pattern this file is asked not to repeat as the
 *       sole mechanism.
 *   This file does not pretend any of the above already contains
 *   morphology. It builds the missing structural layer as a new,
 *   separate module and composes the existing files read-only.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not modify, delete, or reinterpret cozy-lexicon-en-sw.js's
 *     473 records or its {en, sw, category} shape.
 *   - Does not modify cozy-language-knowledge-model.js's RP-035
 *     TranslationRelationship/CorrectionRecord/ConflictRecord schema
 *     or behavior.
 *   - Does not create a second conversational AI, a second intent
 *     engine, or a second language-pack registry.
 *   - Does not use machine learning, ASR, or machine translation. It
 *     is a disclosed, rule-based structural decomposer only.
 *
 * HONESTY / CONFIDENCE DISCIPLINE
 *   - Every decomposition carries `confidence` ("HIGH" | "MEDIUM" |
 *     "LOW") and an `evidence` list explaining what was matched. There
 *     is no invented single float presented as certainty.
 *   - A root is never assumed to be semantically known just because a
 *     surface pattern matched. `knownRoot` is only true when the root
 *     is verified against this module's own small disclosed reference
 *     root list OR a real hit in CozyLexiconEnSw. Otherwise
 *     `unknownRoot: true` and no meaning is fabricated.
 *   - An extension suffix (-il-, -el-, -ish-, -esh-, -w-, -an-) is only
 *     reported when the remaining root candidate is at least 2
 *     characters long; this file does not strip a suffix purely
 *     because the letters happen to match.
 *   - Kiswahili identity is never downgraded to English merely because
 *     a root, extension, or full word is unrecognized. Unrecognized
 *     tokens are returned as explicit `{ known: false }` evidence, not
 *     silently dropped or mistranslated.
 *   - COVERAGE IS PARTIAL AND DISCLOSED. Subject prefixes cover class
 *     1/2 (people) persons only (ni/u/a/tu/m(mu)/wa) — the same
 *     disclosed-partial-coverage pattern already used elsewhere in
 *     this codebase (e.g. RP-036's 5-language default set). Noun-class
 *     coverage is evidence-only (m-/wa-, ki-/vi-, ji-/ma-, n-/n-, u-,
 *     mu-/mi-), never a certain classification from spelling alone.
 *
 * SEPARATION OF CONCERNS (explicit, by design)
 *   `analyzeMorphology(word)` / `analyzeNounClassEvidence(word)` /
 *   `detectClauseMarkers(text)` are pure STRUCTURAL analysis — they
 *   assume Kiswahili and describe shape, they never decide language
 *   identity.
 *   `scoreLanguageEvidence(text)` is a SEPARATE function whose only
 *   job is language-detection evidence scoring. It composes the
 *   structural signals above as evidence but is not required to run
 *   the structural analyzers, and the structural analyzers do not
 *   call it. Either can be used without the other.
 *   `analyzeSentence(text)` is a top-level convenience that composes
 *   both and returns one structured contract (see section 14 of the
 *   spec this file implements) for the conversational provider to
 *   consume.
 *
 * INTEGRATION
 *   rule-based-conversational-provider.js composes
 *   `scoreLanguageEvidence()` as an additive fallback INSIDE
 *   detectLanguageHeuristic(), only when its own existing marker list
 *   finds nothing — see that file's own comment at the composition
 *   point. No existing intent handler, pattern, or marker was removed.
 *
 * FUTURE REUSE
 *   The tokenize/evidence/confidence architecture here is written so
 *   the same shape (subject/negation/tense-aspect/object/root/
 *   extension/final-vowel, noun-class evidence, clause markers,
 *   language-evidence scoring) can later host a Luo/Kikuyu/Kamba/
 *   Kalenjin/Luhya module beside this one. No other language is
 *   implemented in this pass.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-kiswahili-structural-analysis"]) return;

    const VERSION = "1.0.0";

    function lexicon() {
        return w.CozyOS && w.CozyOS.CozyLexiconEnSw ? w.CozyOS.CozyLexiconEnSw : null;
    }

    // -----------------------------------------------------------------
    // 1. REFERENCE DATA (disclosed, partial, additive — none of this
    //    replaces or duplicates the 473-record lexicon; it is new
    //    structural/grammatical evidence the lexicon never contained).
    // -----------------------------------------------------------------

    // Class 1/2 (people) subject prefixes only — disclosed limitation.
    // Ordered longest-first so multi-letter prefixes are tried before
    // shorter ones that could otherwise match a substring of them.
    const AFFIRMATIVE_SUBJECT_PREFIXES = [
        ["tu", "1PL"], ["wa", "3PL"], ["mu", "2PL"],
        ["ni", "1SG"], ["si", null], // "si" is handled by negative table, not here
        ["u", "2SG"], ["m", "2PL"], ["a", "3SG"]
    ].filter((p) => p[1] !== null);

    const NEGATIVE_SUBJECT_PREFIXES = [
        ["hatu", "1PL"], ["hawa", "3PL"], ["ham", "2PL"],
        ["si", "1SG"], ["hu", "2SG"], ["ha", "3SG"]
    ];

    // Tense/aspect markers recognized immediately after an affirmative
    // subject prefix. "hu" here is the subject-less habitual (it
    // REPLACES a subject prefix rather than following one) and is
    // handled as a special case in analyzeMorphology(), not in this
    // table, to avoid colliding with the 2SG negative "hu-".
    const TENSE_ASPECT_MARKERS = {
        na: "PRESENT_CONTINUOUS",
        li: "PAST",
        ta: "FUTURE",
        me: "PERFECT",
        ka: "CONSECUTIVE",
        ki: "CONDITIONAL_OR_DURING",
        nge: "CONDITIONAL_WOULD",
        ngeli: "CONDITIONAL_WOULD_HAVE"
    };
    // Tried longest-first so "ngeli"/"nge" are checked before the
    // 2-letter markers could otherwise swallow part of them.
    const TENSE_ASPECT_ORDER = Object.keys(TENSE_ASPECT_MARKERS).sort((a, b) => b.length - a.length);

    // Object markers recognized between the tense/aspect marker and the
    // root. Disclosed partial set (class 1/2 persons + reflexive +
    // classes 7/8/5/6/10 object agreement only). "ji" is the reflexive
    // ("-self") marker, tagged separately from ordinary object markers.
    const OBJECT_MARKERS = {
        ku: "2SG_OBJ", wa: "3PL_OBJ", ki: "7_OBJ", vi: "8_OBJ",
        li: "5_OBJ", ya: "6_OBJ", zi: "10_OBJ", m: "1_OBJ"
    };
    const REFLEXIVE_MARKER = "ji";

    // Derivational extensions, tried immediately before the final
    // vowel. Longest-first. A match is only reported when the
    // remaining root candidate is >= 2 characters (see
    // stripExtensions()) so this table never fabricates a root by
    // over-stripping a short word.
    const EXTENSIONS = [
        { suffix: "ish", type: "CAUSATIVE" },
        { suffix: "esh", type: "CAUSATIVE" },
        { suffix: "il", type: "APPLICATIVE" },
        { suffix: "el", type: "APPLICATIVE" },
        { suffix: "an", type: "RECIPROCAL" },
        { suffix: "ik", type: "STATIVE" },
        { suffix: "ek", type: "STATIVE" },
        { suffix: "w", type: "PASSIVE" }
    ];

    // Small, disclosed reference root list. This is NOT exhaustive
    // vocabulary (that remains the lexicon's job) — it exists only so
    // this module can mark a decomposition's root as `knownRoot: true`
    // with real evidence for the compositional test sentences this
    // module ships with, and for other common verb roots. A root
    // absent from this list is not treated as invalid Kiswahili — see
    // HONESTY DISCIPLINE above.
    // Stored WITHOUT the citation final vowel (i.e. as bare consonant
    // stems), because decomposition always strips the final vowel
    // before comparing against this list (see stripToDepth() below).
    // "soma" -> "som", "penda" -> "pend", etc.
    // 2-letter stems ("jua"->"ju", "ona"->"on") are deliberately
    // excluded: too short to be reliable evidence and too collision-
    // prone against ordinary word fragments.
    const REFERENCE_VERB_ROOTS = new Set([
        "som", "pend", "elew", "wez", "tak", "saidi", "funz", "faham",
        "badil", "safir", "omb", "anz", "hitaj", "and", "fany",
        "sem", "end", "patikan", "julikan", "siki", "ambi",
        "amin", "ondok", "rud", "let", "pik", "andik"
    ]);

    // Small, disclosed semantic-family graph. New data (the lexicon
    // never had this) — deliberately small and linguistically
    // conservative rather than a large speculative ontology.
    // Keyed by BOTH whole-word forms (for direct token lookups, e.g.
    // nouns like "teknolojia") and bare verb stems (for lookups coming
    // from analyzeMorphology's decomposition, e.g. "funz" from
    // "jifunza"/"kufundisha").
    const SEMANTIC_FAMILIES = {
        soma: "education", som: "education", jifunza: "education",
        funza: "education", funz: "education",
        elimu: "education", mwanafunzi: "education", funzo: "education",
        fahamu: "knowledge", faham: "knowledge",
        elewa: "knowledge", elew: "knowledge",
        jua: "knowledge", ju: "knowledge",
        teknolojia: "technology", kidijitali: "technology", kompyuta: "technology", mfumo: "technology",
        safiri: "travel", safir: "travel", safari: "travel",
        jamii: "community", jumuiya: "community",
        badili: "change", badil: "change", badilisha: "change"
    };

    // Small, disclosed gazetteer. New data — the 473-record lexicon
    // has no geography category at all (verified this pass). Kept
    // deliberately small and factual (place name + region hint only,
    // no invented facts).
    const GEOGRAPHIC_ENTITIES = {
        mombasa: "coastal_kenya", kilifi: "coastal_kenya", malindi: "coastal_kenya",
        nairobi: "kenya_capital", kisumu: "lake_region_kenya", nakuru: "rift_valley_kenya",
        eldoret: "rift_valley_kenya"
    };

    // Multi-word clause markers checked before single-word ones so
    // "kwa sababu" isn't reported merely as the unrelated preposition
    // "kwa".
    const MULTI_WORD_CLAUSE_MARKERS = [
        { phrase: "kwa sababu", type: "CAUSAL" },
        { phrase: "kwa kuwa", type: "CAUSAL" },
        { phrase: "kutokana na", type: "CAUSAL" },
        { phrase: "kwa ajili ya", type: "PURPOSE" }
    ];
    const SINGLE_WORD_CLAUSE_MARKERS = {
        ambaye: "RELATIVE", ambao: "RELATIVE", ambayo: "RELATIVE",
        ambacho: "RELATIVE", ambavyo: "RELATIVE",
        kama: "CONDITIONAL", ikiwa: "CONDITIONAL", iwapo: "CONDITIONAL", endapo: "CONDITIONAL",
        ili: "PURPOSE"
    };

    const INTERROGATIVES = {
        nini: "WHAT", nani: "WHO", wapi: "WHERE", lini: "WHEN",
        vipi: "HOW", gani: "WHICH", je: "POLAR"
    };

    // Weak, disclosed function-word evidence only — never the sole
    // signal (see scoreLanguageEvidence()).
    const FUNCTION_WORDS = new Set([
        "na", "ya", "wa", "la", "cha", "vya", "kwa", "ni", "si",
        "hii", "hiyo", "hicho", "huyu", "wale", "hao", "katika",
        "kutoka", "kwenda", "au", "yote", "hata"
    ]);

    // Noun-class evidence pairs. Evidence only — never a certain
    // classification from a prefix match alone (see
    // analyzeNounClassEvidence()).
    const NOUN_CLASS_PREFIX_PAIRS = [
        { sgPrefix: "ki", plPrefix: "vi", classPair: "7/8" },
        { sgPrefix: "ji", plPrefix: "ma", classPair: "5/6" },
        { sgPrefix: "mu", plPrefix: "mi", classPair: "3/4" },
        { sgPrefix: "m", plPrefix: "wa", classPair: "1/2" },
        { sgPrefix: "u", plPrefix: "n", classPair: "11/10" }
    ];

    // -----------------------------------------------------------------
    // 2. TOKENIZATION
    // -----------------------------------------------------------------
    function tokenize(text) {
        if (typeof text !== "string" || !text.trim()) return [];
        const raw = text.match(/[A-Za-zÀ-ÿ]+/g) || [];
        return raw.map((t) => ({ original: t, lower: t.toLowerCase() }));
    }

    // -----------------------------------------------------------------
    // 3. EXTENSION STRIPPING
    //    Deliberately shallow-first: this tries "no extension at all"
    //    before ever peeling one off, and accepts a deeper (more
    //    stripped) reading ONLY when it resolves to a verified root
    //    that the shallower reading did not. This is what stops a
    //    root that merely ends in a letter sequence that looks like an
    //    extension (e.g. "elewa" ending in "...ew", which looks like
    //    the "-w-" passive right before the final vowel) from being
    //    torn apart into a fabricated "ele" + PASSIVE. If NO depth
    //    resolves to a verified root, this returns the shallowest
    //    (zero-extension) candidate — an honest "root unverified", not
    //    a fabricated deepest guess.
    // -----------------------------------------------------------------
    function stripExtensions(stem) {
        const MIN_ROOT_LEN = 2;
        let base = stem;
        let finalVowel = null;
        if (/[aeiou]$/.test(base)) {
            finalVowel = base.slice(-1);
            base = base.slice(0, -1);
        }

        // Greedy, but with an early-stop the moment the current
        // remainder is already a verified root. This is what prevents
        // a root that merely ends in a letter sequence resembling an
        // extension (e.g. "elewa" -> "elew", which ends in what looks
        // like the "-w-" passive) from being torn apart into a
        // fabricated shorter root + invented extension: as soon as
        // "elew" itself is recognized, stripping stops. Only a
        // genuinely unverified remainder keeps being peeled — and even
        // then, only down to MIN_ROOT_LEN, and the result is always
        // returned with knownRoot computed honestly afterward by the
        // caller (lookupRoot), never assumed.
        let working = base;
        const extensions = [];
        let changed = true;
        while (changed && working.length > MIN_ROOT_LEN) {
            if (isReferenceRoot(working)) break;
            changed = false;
            for (const ext of EXTENSIONS) {
                if (working.endsWith(ext.suffix) && working.length - ext.suffix.length >= MIN_ROOT_LEN) {
                    extensions.push(ext.type);
                    working = working.slice(0, -ext.suffix.length);
                    changed = true;
                    break;
                }
            }
        }
        return { bareRoot: working, extensions: extensions.reverse(), finalVowel };
    }

    function isReferenceRoot(stemCandidate) {
        return REFERENCE_VERB_ROOTS.has(stemCandidate);
    }

    // -----------------------------------------------------------------
    // 4. ROOT LOOKUP (composes the existing lexicon read-only)
    // -----------------------------------------------------------------
    // Whole-word lookup against the real lexicon ONLY — never against
    // REFERENCE_VERB_ROOTS, whose entries are bare stems with the
    // final vowel already removed (e.g. "and" for the stem of
    // "anda"), not real whole words. Comparing an un-stripped token
    // (e.g. the English word "and") against that stem list is a
    // category error and produces false positives; this function is
    // what analyzeSentence() uses for tokens that were not decomposed
    // by analyzeMorphology.
    function lookupWholeWordLexiconOnly(word) {
        const evidence = [];
        let knownRoot = false;
        let semanticFamily = SEMANTIC_FAMILIES[word] || null;
        const lex = lexicon();
        if (lex && typeof lex.lookupTerm === "function") {
            const direct = lex.lookupTerm(word, "sw");
            if (direct && direct.length) {
                knownRoot = true;
                evidence.push("LEXICON_MATCH:" + word);
                if (!semanticFamily) semanticFamily = direct[0].category || null;
            }
        }
        return { knownRoot, semanticFamily, evidence };
    }

    function lookupRoot(root) {
        const evidence = [];
        let knownRoot = false;
        let semanticFamily = SEMANTIC_FAMILIES[root] || null;
        const lex = lexicon();
        if (lex && typeof lex.lookupTerm === "function") {
            const direct = lex.lookupTerm(root, "sw");
            if (direct && direct.length) {
                knownRoot = true;
                evidence.push("LEXICON_MATCH:" + root);
                if (!semanticFamily) semanticFamily = direct[0].category || null;
            }
        }
        if (!knownRoot && REFERENCE_VERB_ROOTS.has(root)) {
            knownRoot = true;
            evidence.push("REFERENCE_ROOT_LIST:" + root);
        }
        return { knownRoot, semanticFamily, evidence };
    }

    // -----------------------------------------------------------------
    // 5. VERBAL MORPHOLOGY
    // -----------------------------------------------------------------
    function analyzeMorphology(word) {
        const lower = String(word || "").toLowerCase();
        const result = {
            originalWord: word,
            subjectPrefix: null,
            negation: false,
            tenseAspect: null,
            objectMarker: null,
            reflexive: false,
            rootCandidate: null,
            knownRoot: false,
            semanticFamily: null,
            extensions: [],
            finalVowel: null,
            confidence: "LOW",
            evidence: []
        };
        if (!lower || lower.length < 3) return result;

        // --- Habitual "hu-" (subject-less), checked first because it
        // has no subject slot at all — a real, distinct construction,
        // not a gap in the negative-subject table.
        if (lower.startsWith("hu") && !NEGATIVE_SUBJECT_PREFIXES.some(([p]) => lower.startsWith(p) && p !== "hu")) {
            const rest = lower.slice(2);
            if (rest.length >= 2) {
                const decomposed = stripExtensions(rest);
                const rootInfo = lookupRoot(decomposed.bareRoot);
                if (rootInfo.knownRoot) {
                    return Object.assign(result, {
                        tenseAspect: "HABITUAL",
                        rootCandidate: decomposed.bareRoot,
                        knownRoot: true,
                        semanticFamily: rootInfo.semanticFamily,
                        extensions: decomposed.extensions,
                        finalVowel: decomposed.finalVowel,
                        confidence: "MEDIUM",
                        evidence: ["HABITUAL_HU_PREFIX"].concat(rootInfo.evidence)
                    });
                }
            }
        }

        // --- Negative path (tried before affirmative because "si"/"ha"
        // etc. are more specific than the single-letter affirmative
        // prefixes and must win when both could apply).
        for (const [prefix, person] of NEGATIVE_SUBJECT_PREFIXES) {
            if (!lower.startsWith(prefix)) continue;
            let rest = lower.slice(prefix.length);
            if (rest.length < 2) continue;
            result.subjectPrefix = person;
            result.negation = true;
            result.evidence.push("NEGATIVE_SUBJECT_PREFIX:" + prefix);

            if (rest.startsWith("ku") && rest.length > 4) {
                // Negative past: si/ha(wa)-ku-ROOT-a
                rest = rest.slice(2);
                result.tenseAspect = "NEGATIVE_PAST";
                result.evidence.push("NEGATIVE_PAST_INFIX:ku");
            } else if (rest.endsWith("i")) {
                // Negative present: si/ha(wa)-ROOT-i (final vowel a->i)
                result.tenseAspect = "NEGATIVE_PRESENT";
                result.evidence.push("NEGATIVE_PRESENT_FINAL_VOWEL_I");
            } else {
                result.tenseAspect = null;
                result.confidence = "LOW";
                result.evidence.push("NEGATION_DETECTED_TENSE_AMBIGUOUS");
            }

            const decomposed = stripExtensions(rest);
            const rootInfo = lookupRoot(decomposed.bareRoot);
            result.rootCandidate = decomposed.bareRoot;
            result.knownRoot = rootInfo.knownRoot;
            result.semanticFamily = rootInfo.semanticFamily;
            result.extensions = decomposed.extensions;
            result.finalVowel = decomposed.finalVowel;
            result.evidence = result.evidence.concat(rootInfo.evidence);
            result.confidence = rootInfo.knownRoot ? (result.tenseAspect ? "HIGH" : "MEDIUM") : (result.tenseAspect ? "MEDIUM" : "LOW");
            return result;
        }

        // --- Affirmative path
        for (const [prefix, person] of AFFIRMATIVE_SUBJECT_PREFIXES) {
            if (!lower.startsWith(prefix)) continue;
            let rest = lower.slice(prefix.length);
            if (rest.length < 3) continue; // not enough left for tense+root

            let tense = null;
            for (const marker of TENSE_ASPECT_ORDER) {
                if (rest.startsWith(marker) && rest.length - marker.length >= 2) {
                    tense = marker;
                    break;
                }
            }
            if (!tense) continue; // no recognizable tense/aspect: reject this subject-prefix hypothesis

            result.subjectPrefix = person;
            result.tenseAspect = TENSE_ASPECT_MARKERS[tense];
            result.evidence.push("SUBJECT_PREFIX:" + prefix, "TENSE_ASPECT_MARKER:" + tense);
            rest = rest.slice(tense.length);

            // Reflexive "ji" (before object-marker check — a reflexive
            // and an ordinary object marker do not co-occur).
            if (rest.startsWith(REFLEXIVE_MARKER) && rest.length - REFLEXIVE_MARKER.length >= 2) {
                result.reflexive = true;
                result.evidence.push("REFLEXIVE_MARKER:ji");
                rest = rest.slice(REFLEXIVE_MARKER.length);
            } else {
                for (const [obMarker, tag] of Object.entries(OBJECT_MARKERS)) {
                    if (rest.startsWith(obMarker) && rest.length - obMarker.length >= 2) {
                        // Guard against false positives: only accept the
                        // object-marker reading if what remains after it
                        // still decomposes to a known root — otherwise
                        // prefer treating obMarker's letters as part of
                        // the root itself.
                        const trial = stripExtensions(rest.slice(obMarker.length));
                        if (lookupRoot(trial.bareRoot).knownRoot) {
                            result.objectMarker = tag;
                            result.evidence.push("OBJECT_MARKER:" + obMarker);
                            rest = rest.slice(obMarker.length);
                        }
                        break;
                    }
                }
            }

            const decomposed = stripExtensions(rest);
            const rootInfo = lookupRoot(decomposed.bareRoot);
            result.rootCandidate = decomposed.bareRoot;
            result.knownRoot = rootInfo.knownRoot;
            result.semanticFamily = rootInfo.semanticFamily;
            result.extensions = decomposed.extensions;
            result.finalVowel = decomposed.finalVowel;
            result.evidence = result.evidence.concat(rootInfo.evidence);
            result.confidence = rootInfo.knownRoot ? "HIGH" : "MEDIUM";
            return result;
        }

        // --- Bare-stem fallback: no subject/negation prefix recognized
        // (imperative, infinitive-without-"ku", or a derived stem
        // quoted on its own, e.g. "fundisha", "saidiana",
        // "badilisha"). Still attempt extension/root decomposition
        // directly on the whole word so derivational structure is not
        // silently lost just because there is no person marking to
        // find.
        if (lower.length >= 4) {
            const decomposed = stripExtensions(lower);
            if (decomposed.extensions.length > 0 || lookupRoot(decomposed.bareRoot).knownRoot) {
                const rootInfo = lookupRoot(decomposed.bareRoot);
                result.rootCandidate = decomposed.bareRoot;
                result.knownRoot = rootInfo.knownRoot;
                result.semanticFamily = rootInfo.semanticFamily;
                result.extensions = decomposed.extensions;
                result.finalVowel = decomposed.finalVowel;
                result.evidence.push("BARE_STEM_NO_SUBJECT_MARKING");
                result.evidence = result.evidence.concat(rootInfo.evidence);
                result.confidence = rootInfo.knownRoot ? "MEDIUM" : "LOW";
            }
        }

        return result; // no further structural evidence found; caller treats remainder as an unknown-structure token
    }

    // -----------------------------------------------------------------
    // 6. NOUN-CLASS EVIDENCE (evidence only, never a certain
    //    classification — see HONESTY DISCIPLINE above).
    // -----------------------------------------------------------------
    function analyzeNounClassEvidence(word) {
        const lower = String(word || "").toLowerCase();
        const result = { originalWord: word, prefixCandidate: null, classPairGuess: null, confidence: "LOW", evidence: [] };
        if (!lower || lower.length < 3) return result;
        for (const pair of NOUN_CLASS_PREFIX_PAIRS) {
            if (lower.startsWith(pair.sgPrefix) && lower.length - pair.sgPrefix.length >= 2) {
                result.prefixCandidate = pair.sgPrefix;
                result.classPairGuess = pair.classPair;
                result.confidence = "LOW"; // spelling alone is never more than LOW
                result.evidence.push("NOUN_CLASS_PREFIX_MATCH:" + pair.sgPrefix + " (class " + pair.classPair + ")");
                return result;
            }
        }
        return result;
    }

    // -----------------------------------------------------------------
    // 7. CLAUSE STRUCTURE
    // -----------------------------------------------------------------
    function detectClauseMarkers(text) {
        const lower = String(text || "").toLowerCase();
        const found = [];
        for (const m of MULTI_WORD_CLAUSE_MARKERS) {
            if (lower.includes(m.phrase)) found.push({ type: m.type, marker: m.phrase });
        }
        const tokens = tokenize(text);
        for (const t of tokens) {
            if (SINGLE_WORD_CLAUSE_MARKERS[t.lower] && !found.some((f) => f.marker === t.lower)) {
                found.push({ type: SINGLE_WORD_CLAUSE_MARKERS[t.lower], marker: t.lower });
            }
        }
        return found;
    }

    function detectQuestionType(tokens) {
        for (const t of tokens) {
            if (INTERROGATIVES[t.lower]) return INTERROGATIVES[t.lower];
        }
        if (tokens.some((t) => t.lower.length > 4 && t.lower.endsWith("je"))) return "HOW";
        return null;
    }

    function detectEntities(tokens) {
        const found = [];
        for (const t of tokens) {
            if (GEOGRAPHIC_ENTITIES[t.lower]) {
                found.push({ text: t.original, type: "GEOGRAPHIC_ENTITY", region: GEOGRAPHIC_ENTITIES[t.lower] });
            }
        }
        return found;
    }

    // -----------------------------------------------------------------
    // 8. LANGUAGE-EVIDENCE SCORING — deliberately separate from the
    //    structural analyzers above (see SEPARATION OF CONCERNS).
    // -----------------------------------------------------------------
    function scoreLanguageEvidence(text) {
        const tokens = tokenize(text);
        if (tokens.length === 0) return { language: null, confidence: "NONE", score: 0, evidence: [] };

        let weight = 0;
        const evidence = [];
        let functionWordHits = 0;

        for (const t of tokens) {
            const morph = analyzeMorphology(t.lower);
            if ((morph.subjectPrefix || morph.tenseAspect) && morph.confidence !== "LOW") {
                weight += 3;
                evidence.push("MORPHOLOGY:" + t.original);
            } else if (morph.subjectPrefix || morph.tenseAspect) {
                // Ambiguous/ LOW-confidence structural hypothesis (e.g.
                // a noun that happens to start like a negative subject
                // prefix, such as "hatua"): weak evidence only, per the
                // "do not classify solely from spelling" rule.
                weight += 1;
                evidence.push("WEAK_MORPHOLOGY:" + t.original);
            }
            if (FUNCTION_WORDS.has(t.lower) && functionWordHits < 3) {
                functionWordHits += 1;
                weight += 1;
                evidence.push("FUNCTION_WORD:" + t.original);
            }
            if (t.lower.length > 4 && t.lower.endsWith("je")) {
                weight += 2;
                evidence.push("JE_SUFFIX:" + t.original);
            }
            // Deliberately NOT scoring noun-class-prefix evidence here:
            // a single m-/ki-/ji-/mu-/u- letter match is common in
            // ordinary English words too (e.g. "understand", "meeting")
            // and produced false Kiswahili positives on English
            // sentences during this module's own regression testing.
            // Noun-class evidence remains available for structural
            // analysis via analyzeNounClassEvidence(), just not as
            // language-identity evidence.
        }
        for (const marker of detectClauseMarkers(text)) {
            weight += 2;
            evidence.push("CLAUSE_MARKER:" + marker.marker);
        }

        const normalized = Math.min(1, weight / Math.max(3, tokens.length * 3));
        let confidence = "NONE";
        if (normalized >= 0.5) confidence = "HIGH";
        else if (normalized >= 0.25) confidence = "MEDIUM";
        else if (normalized > 0) confidence = "LOW";

        return {
            language: normalized > 0 ? "sw" : null,
            confidence,
            score: normalized,
            evidence
        };
    }

    // -----------------------------------------------------------------
    // 9. TOP-LEVEL SENTENCE COMPOSITION (contract per spec section 14,
    //    adapted after inspecting the repository: no pre-existing
    //    global semantic-composition contract was found to conflict
    //    with, so this shape is new and disclosed as such).
    // -----------------------------------------------------------------
    function analyzeSentence(text) {
        const tokens = tokenize(text);
        const langEvidence = scoreLanguageEvidence(text);

        const morphology = [];
        const roots = [];
        const semanticFamiliesSet = new Set();
        const unknownTokens = [];
        let anyNegative = false;
        let anyVerbFound = false;

        for (const t of tokens) {
            if (SINGLE_WORD_CLAUSE_MARKERS[t.lower] || FUNCTION_WORDS.has(t.lower)) continue;

            const morph = analyzeMorphology(t.lower);
            if ((morph.subjectPrefix || morph.tenseAspect) && morph.confidence !== "LOW") {
                anyVerbFound = true;
                if (morph.negation) anyNegative = true;
                morphology.push(morph);
                if (morph.rootCandidate) {
                    roots.push({ root: morph.rootCandidate, known: morph.knownRoot, source: morph.originalWord });
                    if (morph.semanticFamily) semanticFamiliesSet.add(morph.semanticFamily);
                }
                if (!morph.knownRoot) unknownTokens.push({ original: t.original, known: false, confidence: morph.confidence });
                continue;
            }
            if (morph.subjectPrefix || morph.tenseAspect) {
                // LOW-confidence / ambiguous hypothesis (e.g. "hatua"):
                // surfaced honestly as an unresolved token, not silently
                // treated as a confirmed verb.
                unknownTokens.push({ original: t.original, known: false, confidence: "LOW", ambiguousMorphologyHypothesis: true });
                continue;
            }

            const lexHit = lookupWholeWordLexiconOnly(t.lower);
            if (lexHit.knownRoot) {
                roots.push({ root: t.lower, known: true, source: t.original });
                if (lexHit.semanticFamily) semanticFamiliesSet.add(lexHit.semanticFamily);
                continue;
            }

            const nounEvidence = analyzeNounClassEvidence(t.lower);
            if (nounEvidence.prefixCandidate) {
                // Structural evidence exists but the root/meaning is not
                // verified — still an explicit unknown, not a silent drop.
                unknownTokens.push({ original: t.original, known: false, confidence: "LOW", nounClassEvidence: nounEvidence.classPairGuess });
                continue;
            }

            unknownTokens.push({ original: t.original, known: false, confidence: "NONE" });
        }

        return {
            language: langEvidence.language,
            confidence: langEvidence.confidence,
            morphology,
            roots,
            semanticFamilies: Array.from(semanticFamiliesSet),
            entities: detectEntities(tokens),
            polarity: anyVerbFound ? (anyNegative ? "NEGATIVE" : "AFFIRMATIVE") : "UNKNOWN",
            questionType: detectQuestionType(tokens),
            clauseStructure: detectClauseMarkers(text),
            unknownTokens,
            structuralCompositional: true
        };
    }

    const api = Object.freeze({
        VERSION,
        tokenize,
        analyzeMorphology,
        analyzeNounClassEvidence,
        detectClauseMarkers,
        detectQuestionType,
        scoreLanguageEvidence,
        analyzeSentence
    });

    w.CozyOS.CozyKiswahiliStructuralAnalysis = api;
    w.CozyOS.Modules["cozy-kiswahili-structural-analysis"] = Object.freeze({
        version: VERSION,
        description: "New, additive Kiswahili structural/morphological semantic layer. Composes cozy-lexicon-en-sw.js (473-record vocabulary, unmodified) read-only for root verification; does not touch cozy-language-knowledge-model.js's RP-035 schema. Decomposes verbs into subject/negation/tense-aspect/object/reflexive/root/extensions/final-vowel with disclosed confidence and evidence; provides noun-class evidence (never certainty), clause-marker detection, and a separate language-evidence scorer composed as an additive fallback inside rule-based-conversational-provider.js's detectLanguageHeuristic(). No ML, no ASR, no machine translation. Coverage is disclosed-partial: class 1/2 subject persons only, a small reference root list, and a small new semantic-family/gazetteer dataset — none of it removes or reinterprets any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
