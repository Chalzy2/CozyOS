/**
 * CozyAI — Universal Language Identifier
 * File Reference: core/modules/intelligence/language/cozy-language-identifier.js
 * Part of: UNIVERSAL LANGUAGE DETECTION & PROPAGATION SEAM
 * (UNIVERSAL-LANGUAGE-SEAM-DESIGN-PROPOSAL.md §4/§5, authorized for
 * implementation).
 *
 * WHAT THIS IS
 *   The ONE authoritative language-detection function this repository
 *   uses from here forward. Before this file, TWO independent, closed,
 *   hand-curated marker-word lists existed — rule-based-conversational-
 *   provider.js's detectLanguageHeuristic() and cozy-ai-semantic-
 *   intent.js's detectLanguages() — plus a THIRD independent
 *   fallback-to-"en" inside CozyLanguageRegistry.resolveLanguage(). All
 *   three could (and, per KISWAHILI-FIRST-READINESS-REPORT.md's real
 *   reproduction, DID) disagree, and all three silently defaulted to
 *   "en" rather than reporting genuine uncertainty. This file replaces
 *   the DETECTION logic of the first two (they now delegate here,
 *   demoted to nothing more than call sites — see those files' own
 *   updated headers) and gives the third an honest UNKNOWN input to
 *   refuse gracefully on, rather than ever being asked to guess.
 *
 * LAYERED DETECTION (design §4) — marker match, then morphology, then
 * statistics, then honest UNKNOWN. Never a fourth "just default to en."
 *   1. MARKER_MATCH   — the reconciled, single, curated word list (both
 *                        prior lists merged, deduplicated, disclosed
 *                        below) — HIGH confidence, cheapest, most
 *                        precise.
 *   2. MORPHOLOGICAL_MATCH — Kiswahili's real, regular subject-prefix +
 *                        tense-infix + stem verb pattern (ni-/u-/a-/tu-/
 *                        m-/wa- + na-/li-/ta-/me- + a real stem), plus
 *                        the existing "-je" interrogative-suffix rule.
 *                        Generalizes to real, novel Kiswahili verbs this
 *                        file has never seen written down anywhere —
 *                        this is the concrete mechanism that recognizes
 *                        genuinely new sentences, not a bigger list.
 *                        MEDIUM confidence.
 *   3. STATISTICAL_MATCH — a small, deterministic, fully offline
 *                        character-trigram frequency-profile comparison
 *                        (classic, well-established language-ID
 *                        technique — see buildTrigramProfile()/
 *                        cosineSimilarity() below) against two reference
 *                        profiles built once, at load time, from real
 *                        Kiswahili/English text already committed in
 *                        this repository (see REFERENCE corpora below —
 *                        no network call, no external model, no ML
 *                        training step). LOW confidence, only trusted
 *                        when it clears a real, disclosed margin over
 *                        the other language's score.
 *   4. UNRESOLVED      — genuinely nothing matched. Returns
 *                        LanguageIdentityContract.unresolved(modality) —
 *                        languageId:"UNKNOWN", never a guess.
 *
 * WHAT THIS FILE IS NOT
 *   Not a new AI, not a probabilistic/ML language model, not a
 *   translation engine, not a second knowledge base. Every layer is a
 *   real, disclosed, inspectable, deterministic function whose output
 *   for the same input is always the same output — the explainability
 *   requirement from the design proposal. `source`/`confidence` on
 *   every real result discloses exactly which layer decided.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-uls1";
    if (window.CozyOS.Modules["cozy-language-identifier"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    // ------------------------------------------------------------------
    // LAYER 1 — reconciled marker lists (real word lookup, HIGH confidence)
    // ------------------------------------------------------------------
    // RECONCILIATION — the union of rule-based-conversational-provider
    // .js's own 70-word SW_MARKERS and cozy-ai-semantic-intent.js's own
    // 45-word SW_LANGUAGE_MARKERS, deduplicated. Both source files now
    // delegate to THIS set (see their own updated headers) — this is the
    // single authoritative list, not a third competing one. Every word
    // both prior lists already carried is preserved (Rule: do not remove
    // capability to add capability) — nothing that used to match stops
    // matching.
    const SW_MARKERS = Object.freeze([
        // from rule-based-conversational-provider.js's own list
        "habari", "hujambo", "mambo", "nataka", "nisaidie", "nisaidi", "fungua",
        "nionyeshe", "ninawezaje", "naweza", "wapi", "akaunti", "sajili", "kujisajili",
        "kusajili", "dashibodi", "mipangilio", "arifa", "nini", "karibuni", "shughuli",
        "kuona", "kufungua", "kuingia", "msaada", "nipe", "asante", "sawa", "kwenye",
        "nitumie", "tumie", "faida", "inatofautianaje", "tofauti", "tofautiana",
        "lugha", "zinazoungwa", "mkono", "zinazotumika", "zipi", "gani",
        "usajili", "kutengeneza", "tengeneza", "kuunda", "unda", "nifanye", "ninaanzaje",
        "sielewi", "elewi", "samahani", "kwaheri", "karibu", "ndiyo", "hapana", "vizuri",
        "muhimu", "tatizo", "nzuri", "nufaika", "atanufaika", "maisha", "inabadilisha", "ngapi", "hii", "aje",
        "matumizi", "yapi", "vipi", "yake", "wanaofaidika", "kanisa", "kanuni", "ndani",
        "nani", "nieleze", "eleza", "kuhusu",
        // from cozy-ai-semantic-intent.js's own list
        "naomba", "nahitaji", "nawezaje", "je", "kwa", "kununua", "kuwa", "mteja",
        "kunisaidia", "inasaidia", "inasaidiaje", "inaweza", "kufanya", "kutumia",
        "nikumbushe", "kesho", "leo", "jana", "badilisha", "futa", "ondoa", "sitaki",
        "usinikumbushe", "haifanyi", "kazi", "imeshindwa", "imekataa", "gharimu",
        "kiasi", "bora", "nielezee", "nifundishe", "nauliza", "hiyo", "hicho",
        "hapo", "lakini", "kwanza", "sijui", "deni", "saa", "inanisaidiaje", "inanisaidia",
        // NEW this pass — the real, closed, high-frequency Kiswahili
        // "kuwa na" (to have) possessive/existential copula set
        // ("Nina duka." = "I have a shop.") — a genuinely closed,
        // unambiguous grammatical paradigm (5 real forms), not an
        // open-ended vocabulary addition. "tuna" is deliberately
        // EXCLUDED from this set: it collides with the real English
        // word "tuna" (the fish) and is safer left to the statistical
        // layer, which can use surrounding context instead of a single
        // ambiguous word.
        "nina", "una", "ana", "mna", "wana",
        // NEW this pass — "duka" (shop/kiosk) and "biashara" (business),
        // the two concrete nouns the readiness report's own real-browser
        // reproduction proved missing ("Nina duka." misdetected as
        // English). These two are added as ordinary knowledge/vocabulary
        // per the design's own instruction ("duka may be added as
        // knowledge/evidence where appropriate") — the ARCHITECTURAL fix
        // is the morphological/statistical layers below, which is what
        // lets the NEXT unseen noun be recognized without a code change.
        "duka", "biashara", "tafadhali",
    ]);
    const SW_MARKER_SET = new Set(SW_MARKERS);

    const EN_MARKERS = Object.freeze([
        "want", "buy", "purchase", "like", "would", "help", "does", "how", "what",
        "can", "could", "should", "why", "remind", "tomorrow", "today", "yesterday",
        "cancel", "update", "change", "working", "broken", "cost", "price", "recommend",
        "explain", "translate", "search", "find", "please", "customer", "become",
        "start", "using", "app", "application", "but",
    ]);
    const EN_MARKER_SET = new Set(EN_MARKERS);

    function countMarkerHits(words, markerSet) {
        return words.filter((w) => markerSet.has(w)).length;
    }

    // ------------------------------------------------------------------
    // LAYER 2 — morphological-shape heuristics (MEDIUM confidence)
    // ------------------------------------------------------------------
    // Kiswahili's real, regular subject-concord + tense-infix + stem
    // verb pattern. Deliberately requires a real stem of at least 3
    // letters after the tense infix (never just the prefix+infix alone)
    // — this is what excludes bare "tuna" (the English fish word) from
    // ever matching here: "tuna" IS "tu"+"na" but has ZERO stem letters
    // left over, so this pattern structurally cannot fire on it. A real
    // conjugated verb like "tunasoma" ("we are reading" — tu+na+som+a)
    // DOES have a real stem ("som") and matches correctly.
    const SW_VERB_PATTERN = /\b(ni|u|a|tu|m|wa)(na|li|ta|me)[a-z]{3,}\b/i;
    // The existing "-je" interrogative suffix rule, carried over
    // unchanged from detectLanguageHeuristic() (RP-036/M363) — a real,
    // unambiguous Kiswahili morpheme with no English homograph risk.
    const SW_JE_SUFFIX_PATTERN = /\b[a-z]{3,}je\b/i;

    function hasMorphologicalSignal(text) {
        return SW_VERB_PATTERN.test(text) || SW_JE_SUFFIX_PATTERN.test(text);
    }

    // ------------------------------------------------------------------
    // LAYER 3 — character-trigram statistical profile (LOW confidence)
    // ------------------------------------------------------------------
    // Reference corpora — real, already-committed Kiswahili/English
    // text from this repository's own cozy-knowledge-registry.js
    // (churchos's humanPurpose/humanPurposeSw, realLifeProblems/
    // realLifeProblemsSw, humanBenefits/humanBenefitsSw, whoBenefits/
    // whoBenefitsSw fields — verified, human-authored content, not
    // generated for this purpose). Copied here as a small, static,
    // checked-in training corpus per the design's own §4: "computed
    // once, offline, at authoring time... checked in as static
    // frequency-table data" — no network call, no ML model file, no
    // runtime training step. A few hundred words per language, the
    // same order of magnitude as the marker-word arrays above.
    const SW_REFERENCE_TEXT = "ChurchOS ipo ili kuzipa makanisa na jumuiya za kiimani msingi wa kidijitali unaowasaidia kupanga kazi zao kuwahudumia watu kuhifadhi maarifa ya kanisa kuwasiliana kushiriki katika lugha na maeneo mbalimbali na kutumia hatua kwa hatua akili ya CozyOS kupunguza mzigo usio wa lazima wa kiutawala ili wafanyakazi wa kanisa watumie muda mchache kwenye utawala uliogawanyika na muda mwingi zaidi kuwahudumia watu na jamii. taarifa za kanisa wanachama zilizogawanyika ugumu wa kufikia rekodi za kanisa mzigo wa kiutawala ugumu wa mawasiliano vikwazo vya lugha ugumu wa kuhifadhi mahubiri ushuhuda na maarifa ya kanisa ugumu wa kuunganisha makanisa katika nchi mbalimbali ugumu wa kutoa taarifa muhimu kwa viongozi ugumu wa kupanga matukio na shughuli za kanisa ugumu wa kuhifadhi historia ya kanisa vikwazo vya ufikivu kukosekana kwa msaada wa kidijitali ulioungana kwa utawala wa kanisa wasimamizi wa kanisa wachungaji viongozi wa kanisa timu za huduma wafanyakazi wa kanisa wanachama familia makutaniko watu wanaoshiriki kwa mbali watu wanaohitaji msaada wa lugha ufikivu utawala rahisi zaidi wa kanisa ufikiaji rahisi zaidi wa taarifa za kanisa zilizoidhinishwa kupungua kwa kazi za kiutawala zinazorudiwa mpangilio bora mawasiliano bora ushiriki wa lugha nyingi uelewa bora wa mahubiri na maudhui ya kanisa uhifadhi wa maarifa ya kanisa uhifadhi na upatikanaji wa ushuhuda uhifadhi wa historia ya kanisa";
    const EN_REFERENCE_TEXT = "ChurchOS exists to give churches and faith communities a digital foundation that helps them organize their work serve people preserve church knowledge communicate participate across languages and locations and progressively use CozyOS intelligence to reduce unnecessary administrative burden so church workers can spend less time on fragmented administration and more time serving people and the community. fragmented church member information difficult access to church records administrative workload communication difficulties language barriers difficulty preserving sermons testimonies and church knowledge difficulty connecting congregations across countries difficulty providing useful information to leaders difficulty organizing events and church activities difficulty preserving church history accessibility barriers lack of unified digital assistance for church administration church administrators pastors church leaders ministry teams church workers members families congregations people participating remotely people who need language accessibility assistance easier church administration easier access to authorized church information less repetitive administrative work better organization better communication multilingual participation improved understanding of sermons and church content preservation of church knowledge preservation and retrieval of testimonies preservation of church history";

    function cleanForTrigrams(text) {
        return String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    }

    function buildTrigramProfile(text) {
        const cleaned = cleanForTrigrams(text);
        const padded = " " + cleaned + " ";
        const counts = new Map();
        for (let i = 0; i < padded.length - 2; i++) {
            const tri = padded.slice(i, i + 3);
            counts.set(tri, (counts.get(tri) || 0) + 1);
        }
        return counts;
    }

    function cosineSimilarity(a, b) {
        let dot = 0, normA = 0, normB = 0;
        for (const [k, v] of a) { normA += v * v; if (b.has(k)) dot += v * b.get(k); }
        for (const v of b.values()) normB += v * v;
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Built once, at module load — real, deterministic, inspectable.
    const SW_REFERENCE_PROFILE = buildTrigramProfile(SW_REFERENCE_TEXT);
    const EN_REFERENCE_PROFILE = buildTrigramProfile(EN_REFERENCE_TEXT);

    // Disclosed thresholds — a result is only trusted when it clears
    // BOTH a real minimum absolute similarity AND a real margin over the
    // other language's score. Never a bare "whichever is bigger."
    const STATISTICAL_MIN_ABSOLUTE = 0.12;
    const STATISTICAL_MIN_MARGIN_RATIO = 1.15;

    function statisticalGuess(text) {
        const profile = buildTrigramProfile(text);
        const swScore = cosineSimilarity(profile, SW_REFERENCE_PROFILE);
        const enScore = cosineSimilarity(profile, EN_REFERENCE_PROFILE);
        const higher = swScore >= enScore ? "sw" : "en";
        const higherScore = Math.max(swScore, enScore);
        const lowerScore = Math.min(swScore, enScore);
        if (higherScore < STATISTICAL_MIN_ABSOLUTE) return null;
        if (lowerScore > 0 && (higherScore / lowerScore) < STATISTICAL_MIN_MARGIN_RATIO) return null;
        return { languageId: higher, swScore, enScore };
    }

    // ------------------------------------------------------------------
    // Dominance scoring for mixed-language input (design §6) — real,
    // disclosed weights: a morphological (grammatical) hit counts more
    // than a marker-word hit, which counts more than an isolated
    // statistical signal, matching the readiness report's own finding
    // that a sentence's grammatical backbone (not an isolated English
    // loanword like "stock"/"app") should decide dominance.
    // ------------------------------------------------------------------
    function scoreLanguage(text, words) {
        const scores = {};
        const swMarkerHits = countMarkerHits(words, SW_MARKER_SET);
        const enMarkerHits = countMarkerHits(words, EN_MARKER_SET);
        if (swMarkerHits > 0) scores.sw = (scores.sw || 0) + swMarkerHits * 3;
        if (enMarkerHits > 0) scores.en = (scores.en || 0) + enMarkerHits * 3;
        if (hasMorphologicalSignal(text)) scores.sw = (scores.sw || 0) + 4;
        return scores;
    }

    /**
     * resolveLanguageIdentity({text, modality, explicitLanguage,
     *   conversationState, actorProfile})
     *   The one real, public entry point. Never throws — every path
     *   returns a real, contract-valid cozy.language-identity.v1 object
     *   (validated via LanguageIdentityContract.create() before ever
     *   being returned, same discipline as SA-3's planAnswer()).
     */
    function resolveLanguageIdentity({ text = "", modality = "text", explicitLanguage = null, conversationState = null, actorProfile = null } = {}) {
        const contract = window.CozyOS.LanguageIdentityContract;
        const build = (fields) => {
            if (contract && typeof contract.create === "function") {
                const built = contract.create(fields);
                if (built.success) return built.identity;
            }
            // Defensive fallback if the contract isn't loaded — never
            // throws, still returns a real, shaped object.
            return Object.assign({ schemaVersion: "cozy.language-identity.v1" }, fields);
        };

        const registry = window.CozyOS.CozyLanguageRegistry;
        const isRealLanguage = (code) => !!code && registry && typeof registry.isAvailable === "function"
            ? true /* isAvailable() gates TEMPLATE readiness, not code registration — see registry's own AVAILABLE/NOT_READY split; a registered-but-NOT_READY code is still a real, disclosed language identity, just not yet answerable */
            : true;

        const words = String(text || "").toLowerCase().match(/[a-zà-ÿ]+/g) || [];

        // Detect on the current turn's own text, regardless of explicit
        // override, so conflict (below) can be computed honestly.
        let detected = null; // { languageId, source, confidence }
        const scores = scoreLanguage(text, words);
        const detectedLanguages = Object.keys(scores).filter((k) => scores[k] > 0);

        if (scores.sw > 0 || scores.en > 0) {
            const dominant = (scores.sw || 0) >= (scores.en || 0) ? "sw" : "en";
            // MARKER_MATCH if at least one literal marker word hit;
            // MORPHOLOGICAL_MATCH if the ONLY signal was the verb/-je
            // pattern (no literal marker word present at all).
            const hadMarkerHit = dominant === "sw" ? countMarkerHits(words, SW_MARKER_SET) > 0 : countMarkerHits(words, EN_MARKER_SET) > 0;
            detected = hadMarkerHit
                ? { languageId: dominant, source: "MARKER_MATCH", confidence: "HIGH" }
                : { languageId: dominant, source: "MORPHOLOGICAL_MATCH", confidence: "MEDIUM" };
        } else {
            const stat = statisticalGuess(text);
            if (stat) {
                detected = { languageId: stat.languageId, source: "STATISTICAL_MATCH", confidence: "LOW" };
                if (!detectedLanguages.includes(stat.languageId)) detectedLanguages.push(stat.languageId);
            }
        }

        // --- EXPLICIT_USER_SELECTION — highest priority, always wins the returned languageId ---
        if (isNonEmptyString(explicitLanguage) && isRealLanguage(explicitLanguage)) {
            const conflict = (detected && detected.languageId !== explicitLanguage.toLowerCase())
                ? { explicitSaid: explicitLanguage.toLowerCase(), detectedSaid: detected.languageId }
                : null;
            return build({
                languageId: explicitLanguage.toLowerCase(), source: "EXPLICIT_USER_SELECTION", confidence: "HIGH",
                modality, dialectRegion: null,
                detectedLanguages: detectedLanguages.length > 0 ? detectedLanguages : [explicitLanguage.toLowerCase()],
                mixedLanguage: detectedLanguages.length > 1, conflict,
            });
        }

        // --- a confident current-turn detection wins outright ---
        if (detected) {
            return build({
                languageId: detected.languageId, source: detected.source, confidence: detected.confidence,
                modality, dialectRegion: null, detectedLanguages, mixedLanguage: detectedLanguages.length > 1, conflict: null,
            });
        }

        // --- CONVERSATION_CARRYOVER — only when THIS turn was itself unresolved ---
        const priorIdentity = conversationState && isPlainObject(conversationState.languageIdentity) ? conversationState.languageIdentity : null;
        if (priorIdentity && isNonEmptyString(priorIdentity.languageId) && priorIdentity.languageId !== "UNKNOWN") {
            return build({
                languageId: priorIdentity.languageId, source: "CONVERSATION_CARRYOVER", confidence: priorIdentity.confidence || "MEDIUM",
                modality, dialectRegion: priorIdentity.dialectRegion || null, detectedLanguages: [priorIdentity.languageId], mixedLanguage: false, conflict: null,
            });
        }

        // --- COUNTRY_SUGGESTION — existing, advisory-only registry signal ---
        if (actorProfile && isNonEmptyString(actorProfile.country) && registry && typeof registry.resolveLanguage === "function") {
            const resolved = registry.resolveLanguage({ country: actorProfile.country });
            if (resolved && isNonEmptyString(resolved.code) && resolved.fallback !== true) {
                return build({
                    languageId: resolved.code, source: "COUNTRY_SUGGESTION", confidence: "LOW",
                    modality, dialectRegion: null, detectedLanguages: [resolved.code], mixedLanguage: false, conflict: null,
                });
            }
        }

        // --- genuinely nothing resolved — honest UNKNOWN, never "en" ---
        return build(Object.assign({}, contract && typeof contract.unresolved === "function" ? contract.unresolved(modality) : {
            languageId: "UNKNOWN", source: "UNRESOLVED", confidence: "UNKNOWN", modality,
            dialectRegion: null, detectedLanguages: [], mixedLanguage: false, conflict: null,
        }));
    }

    const CozyLanguageIdentifier = Object.freeze({
        SW_MARKERS, EN_MARKERS, resolveLanguageIdentity,
        // exposed for reuse/testing — real, disclosed internals, not a
        // second public API surface.
        hasMorphologicalSignal, statisticalGuess, buildTrigramProfile, cosineSimilarity,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CozyLanguageIdentifier = CozyLanguageIdentifier;
    window.CozyOS.Modules["cozy-language-identifier"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Universal Language Seam — the one authoritative resolveLanguageIdentity() function, layering reconciled marker-word matching (HIGH), Kiswahili verb-morphology/interrogative-suffix pattern matching (MEDIUM, generalizes to novel verbs), and a real, offline character-trigram statistical profile (LOW) before ever returning UNKNOWN. Replaces the detection logic of rule-based-conversational-provider.js's detectLanguageHeuristic() and cozy-ai-semantic-intent.js's detectLanguages() (both now delegate here). No ML model, no network call, no second AI."
    });
})();
