/**
 * CozyOS — Identity FAQ Intent Router
 * File Reference: core/modules/knowledge/cozyos-identity-faq-router.js
 * Version: 1.0.0-ENTERPRISE
 *
 * WHAT THIS IS
 *   Many different phrasings ("who founded CozyOS", "who built it",
 *   "who is behind CozyOS"...) all mean the same thing. This file maps
 *   that whole space of phrasings — in English AND Kiswahili — onto a
 *   small set of canonical intents, then answers each intent from
 *   window.CozyOS.DeveloperIdentity, which is already the real, public,
 *   non-fabricated source (core/identity/developer-profile.js +
 *   project-history.js + african-knowledge-initiative.js). This file
 *   adds NO new founder/mission/vision facts of its own.
 *
 * OWNERSHIP
 *   Owns: phrase -> canonical intent matching, EN/SW answer rendering,
 *   optional machine-translation hand-off for other registered
 *   languages. Never owns: the underlying facts (DeveloperIdentity),
 *   the private Founder Story Vault (founder-story-*.js — NOT read by
 *   this file, on purpose), translation infrastructure (composes
 *   SpeechTranslationAdapter, doesn't reimplement it).
 *
 * PRIVACY BOUNDARY (explicit, per Charles)
 *   There are two separate founder-related subsystems in this repo:
 *     1. founder-story-seed.js / founder-story-engine.js — the
 *        Founder's real, personal autobiography. Encrypted, Vault-
 *        backed, default visibility "Only Me". PRIVATE.
 *     2. developer-profile.js / project-history.js /
 *        african-knowledge-initiative.js -> DeveloperIdentity —
 *        explicitly documented as the PUBLIC profile.
 *   This router reads ONLY #2. It never imports, requires, or reaches
 *   into the Founder Story Vault, and must not be extended to do so.
 *
 * HONESTY DISCIPLINE
 *   - If DeveloperIdentity isn't loaded, every call returns an honest
 *     {success:false, isReal:false} — never a fabricated answer.
 *   - COZYOS_NAME_MEANING has no real data source anywhere in this
 *     repo (grep confirmed). It is intentionally answered with a
 *     disclosed "not documented yet" response, not an invented one.
 *   - Kiswahili answers below are authored for this milestone and are
 *     NOT yet marked human-certified (see the repo's existing
 *     kiswahili_coverage_gaps.txt precedent for that distinction) —
 *     flagged via certified:false on every sw render so a caller can
 *     surface that honestly instead of presenting it as verified.
 *   - Languages other than en/sw fall back to a real, disclosed
 *     machine translation of the English canonical answer via
 *     SpeechTranslationAdapter, ONLY if that adapter reports real
 *     translation capability — never a silent guess.
 *   - This router deliberately does NOT call Gemini or any generative
 *     provider for these answers. Identity/mission/vision facts are
 *     deterministic and already real; routing them through a
 *     generative model would risk paraphrasing them into something
 *     the Founder never said. Gemini remains available further down
 *     the normal CognitiveCoordinator pipeline for genuinely open
 *     questions this router does not match.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.Modules["cozyos-identity-faq-router"]) return;

    // ── Canonical intents (per Charles's spec) ──────────────────────────
    const INTENTS = Object.freeze({
        COZYOS_FOUNDER: "COZYOS_FOUNDER",
        COZYOS_ORIGIN: "COZYOS_ORIGIN",
        COZYOS_MISSION: "COZYOS_MISSION",
        COZYOS_WHY_CREATED: "COZYOS_WHY_CREATED",
        COZYOS_VISION: "COZYOS_VISION",
        COZYOS_OWNER_VISION: "COZYOS_OWNER_VISION",
        COZYOS_DIFFERENTIATION: "COZYOS_DIFFERENTIATION",
        COZYOS_UNIQUENESS: "COZYOS_UNIQUENESS",
        COZYOS_VALUES: "COZYOS_VALUES",
        COZYOS_NAME_MEANING: "COZYOS_NAME_MEANING",
        COZYOS_FUTURE: "COZYOS_FUTURE",
        COZYOS_PURPOSE: "COZYOS_PURPOSE",
        COZYOS_COMMUNITY: "COZYOS_COMMUNITY"
    });

    // ── Trigger phrases per intent, EN + SW. Matching is substring/word- ─
    // overlap based (see _score below), so these don't need to be
    // exhaustive verbatim strings — near variants of each still match.
    const TRIGGERS = {
        [INTENTS.COZYOS_FOUNDER]: {
            en: ["who founded cozyos", "who created cozyos", "who built cozyos", "who is behind cozyos",
                "who owns cozyos", "founder of cozyos", "who started cozyos", "who invented cozyos",
                "who is the creator of cozyos", "who runs cozyos", "who leads cozyos", "who established cozyos",
                "who is the person behind cozyos", "what company is behind cozyos"],
            sw: ["nani alianzisha cozyos", "nani aliunda cozyos", "nani alijenga cozyos", "nani mwanzilishi wa cozyos",
                "nani mmiliki wa cozyos", "nani yuko nyuma ya cozyos", "nani anaendesha cozyos",
                "mwanzilishi wa cozyos ni nani", "muundaji wa cozyos ni nani"]
        },
        [INTENTS.COZYOS_ORIGIN]: {
            en: ["how did cozyos begin", "when did cozyos start", "when was cozyos created", "why was cozyos created",
                "how did the idea of cozyos come about", "what inspired cozyos", "what problem led to cozyos",
                "what is the story behind cozyos", "how did cozyos evolve", "what motivated its creation",
                "what problem was cozyos meant to solve"],
            sw: ["cozyos ilianzaje", "cozyos ilianzishwa lini", "kwa nini cozyos iliundwa", "wazo la cozyos lilitoka wapi",
                "ni nini kilichochochea cozyos", "hadithi ya cozyos ni nini", "tatizo gani lilisababisha cozyos",
                "cozyos ilianzishwa kutatua tatizo gani"]
        },
        [INTENTS.COZYOS_MISSION]: {
            en: ["what is cozyos's mission", "what is the mission of cozyos", "what does cozyos aim to achieve",
                "what is cozyos trying to accomplish", "what is cozyos's purpose", "why does cozyos exist",
                "what does cozyos stand for", "what is the main goal of cozyos", "what problem is cozyos solving"],
            sw: ["dhamira ya cozyos ni nini", "lengo la cozyos ni nini", "cozyos inalenga kufanikisha nini",
                "cozyos ipo kwa sababu gani", "cozyos inasimamia nini", "cozyos inatatua tatizo gani"]
        },
        [INTENTS.COZYOS_WHY_CREATED]: {
            en: ["why did they start cozyos", "what was cozyos originally designed to do", "what was the original idea behind cozyos"],
            sw: ["kwa nini walianzisha cozyos", "cozyos ilibuniwa kufanya nini awali", "wazo la awali la cozyos lilikuwa nini"]
        },
        [INTENTS.COZYOS_VISION]: {
            en: ["what is cozyos's vision", "what is the vision of cozyos", "what future does cozyos want to create",
                "where is cozyos going", "what does the future of cozyos look like", "what is cozyos's long-term goal",
                "what does cozyos hope to become", "what kind of world does cozyos envision",
                "where does cozyos see itself in the future"],
            sw: ["maono ya cozyos ni nini", "cozyos inataka kujenga mustakabali gani", "cozyos inaelekea wapi",
                "cozyos itakuwaje siku zijazo", "cozyos inataka kuwa nini"]
        },
        [INTENTS.COZYOS_OWNER_VISION]: {
            en: ["what is the founder's vision for cozyos", "what does the owner want cozyos to become",
                "what does the founder want to achieve with cozyos", "what inspired the founder to build cozyos",
                "what is the founder's dream for cozyos", "what does the creator envision for cozyos",
                "why does the founder believe cozyos is important"],
            sw: ["maono ya mwanzilishi kwa cozyos ni nini", "mmiliki anataka cozyos iwe nini",
                "ndoto ya mwanzilishi kwa cozyos ni nini", "ni nini kilichomvutia mwanzilishi kujenga cozyos"]
        },
        [INTENTS.COZYOS_DIFFERENTIATION]: {
            en: ["what makes cozyos different", "why is cozyos different from other operating systems",
                "why should i use cozyos", "why choose cozyos over other platforms", "what does cozyos do differently",
                "how is cozyos different from android", "how is cozyos different from windows",
                "how is cozyos different from linux", "how is cozyos different from other ai platforms",
                "what advantage does cozyos have", "what is cozyos's competitive advantage", "what sets cozyos apart"],
            sw: ["ni nini kinachofanya cozyos kuwa tofauti", "kwa nini cozyos ni tofauti na mifumo mingine",
                "kwa nini nitumie cozyos", "cozyos inafanya nini tofauti", "cozyos ina faida gani zaidi",
                "cozyos inatofautiana vipi na android", "cozyos inatofautiana vipi na windows"]
        },
        [INTENTS.COZYOS_UNIQUENESS]: {
            en: ["what makes cozyos unique", "why is cozyos special", "what makes cozyos special",
                "what makes cozyos better", "what is unique about cozyos", "what can cozyos do that others cannot",
                "what is the special idea behind cozyos"],
            sw: ["ni nini cha kipekee kuhusu cozyos", "kwa nini cozyos ni maalum", "cozyos ina upekee gani",
                "cozyos inaweza kufanya nini ambacho wengine hawawezi"]
        },
        [INTENTS.COZYOS_VALUES]: {
            en: ["what does cozyos believe in", "what principles guide cozyos", "what are cozyos's core values",
                "what philosophy does cozyos follow", "what is the philosophy behind cozyos",
                "what does cozyos prioritize", "what kind of technology does cozyos believe in"],
            sw: ["cozyos inaamini nini", "misingi gani inaongoza cozyos", "maadili makuu ya cozyos ni yapi",
                "falsafa ya cozyos ni nini", "cozyos inapa kipaumbele nini"]
        },
        [INTENTS.COZYOS_NAME_MEANING]: {
            en: ["what does cozy mean in cozyos", "why is it called cozyos", "what does the name cozyos represent",
                "what does the name cozyos mean"],
            sw: ["neno cozy linamaanisha nini katika cozyos", "kwa nini inaitwa cozyos", "jina cozyos linawakilisha nini",
                "jina cozyos linamaanisha nini"]
        },
        [INTENTS.COZYOS_FUTURE]: {
            en: ["what future is cozyos trying to build", "what does cozyos want technology to become",
                "what is the bigger idea behind cozyos", "what is cozyos's role in the future of ai",
                "how can cozyos change people's lives", "how can cozyos help communities"],
            sw: ["cozyos inataka kujenga mustakabali gani wa teknolojia", "wazo kubwa nyuma ya cozyos ni nini",
                "cozyos itabadilishaje maisha ya watu", "cozyos itasaidiaje jamii"]
        },
        [INTENTS.COZYOS_PURPOSE]: {
            en: ["is cozyos meant to replace existing operating systems", "what is cozyos trying to change in technology",
                "is cozyos an operating system or an ai platform", "what is the ultimate purpose of cozyos",
                "who is cozyos designed for", "who benefits from cozyos", "what makes cozyos important",
                "why does the world need cozyos", "what problem does cozyos solve for ordinary people"],
            sw: ["cozyos imekusudiwa kubadilisha mifumo iliyopo", "cozyos ni mfumo wa uendeshaji au jukwaa la ai",
                "kusudi kuu la cozyos ni nini", "cozyos imeundwa kwa ajili ya nani", "nani ananufaika na cozyos",
                "kwa nini dunia inahitaji cozyos"]
        },
        [INTENTS.COZYOS_COMMUNITY]: {
            en: ["how can people contribute to cozyos", "can i teach cozyos my language", "how do i join the african knowledge initiative"],
            sw: ["watu wanawezaje kuchangia cozyos", "naweza kufundisha cozyos lugha yangu", "nawezaje kujiunga na african knowledge initiative"]
        }
    };

    // ── Normalization + scoring ──────────────────────────────────────────
    function _normalize(text) {
        return String(text || "")
            .toLowerCase()
            .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip accents
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function _wordSet(s) { return new Set(_normalize(s).split(" ").filter(Boolean)); }

    /** Score a normalized query against one trigger phrase: substring match scores highest, else word-overlap ratio. */
    function _scorePhrase(normQuery, phrase) {
        const normPhrase = _normalize(phrase);
        if (!normPhrase) return 0;
        if (normQuery.includes(normPhrase)) return 1;
        const qWords = _wordSet(normQuery);
        const pWords = _wordSet(normPhrase);
        if (pWords.size === 0) return 0;
        let overlap = 0;
        pWords.forEach((w) => { if (qWords.has(w)) overlap++; });
        return overlap / pWords.size; // 0..1
    }

    const MATCH_THRESHOLD = 0.6;

    /**
     * detectIntent(text) -> { intentId, confidence, matchedLanguageHint } | null
     * matchedLanguageHint is "en"/"sw" based on WHICH trigger list matched
     * best — a real signal (not a language detector), used only to pick
     * which canonical answer language to prefer by default.
     */
    function detectIntent(text) {
        const normQuery = _normalize(text);
        if (!normQuery) return null;
        let best = null;
        for (const intentId of Object.keys(TRIGGERS)) {
            for (const langHint of ["en", "sw"]) {
                const phrases = TRIGGERS[intentId][langHint] || [];
                for (const phrase of phrases) {
                    const score = _scorePhrase(normQuery, phrase);
                    if (score >= MATCH_THRESHOLD && (!best || score > best.confidence)) {
                        best = { intentId, confidence: score, matchedLanguageHint: langHint };
                    }
                }
            }
        }
        return best;
    }

    // ── Canonical answer builders — read ONLY from the real, public ─────
    // window.CozyOS.DeveloperIdentity. Never fabricate when a field is
    // absent; return {known:false} for that case instead.
    function _identity() { return window.CozyOS.DeveloperIdentity || null; }

    function _joinList(list, conjunctionEn) {
        if (!Array.isArray(list) || list.length === 0) return "";
        if (list.length === 1) return list[0];
        return list.slice(0, -1).join(", ") + " " + conjunctionEn + " " + list[list.length - 1];
    }

    const ANSWER_BUILDERS = {
        [INTENTS.COZYOS_FOUNDER]: (id) => {
            const r = id.answerWhoCreatedYou();
            return {
                en: r.answer,
                sw: `CozyOS na CozyAI zilianzishwa na ${id.getOfficialName()} (anajulikana pia kama ${id.getKnownAs().join(" / ")}) kutoka ${id.getCountry()}, ambaye ni ${id.getRoles().join(", ")}.`
            };
        },
        [INTENTS.COZYOS_ORIGIN]: (id) => ({
            en: id.answerWhyCreated().answer,
            sw: "Kabla ya kuunda CozyOS, Charles Owuor alipata uzoefu wa kuuza bidhaa nyumba kwa nyumba. Akifanya kazi moja kwa moja na familia na wafanyabiashara, aligundua watu wengi walishindwa kufikia teknolojia muhimu kwa sababu ya vikwazo vya lugha, mtandao usiotegemewa, gharama, na programu zisizoendana na mahitaji ya jamii za mitaani. Uzoefu huo ulimtia moyo kujenga jukwaa la AI linaloweza kufanya kazi hata bila mtandao (offline-first), lenye lugha nyingi, lililoundwa kutatua matatizo halisi ya jamii."
        }),
        [INTENTS.COZYOS_WHY_CREATED]: (id) => ANSWER_BUILDERS[INTENTS.COZYOS_ORIGIN](id),
        [INTENTS.COZYOS_MISSION]: (id) => {
            const list = id.getMission();
            return {
                en: "CozyOS exists to be: " + _joinList(list, "and") + ".",
                sw: "CozyOS ipo kwa ajili ya: kufanya kazi hata bila mtandao pale inapowezekana, kuwa na lugha nyingi, kuongozwa na jamii, kusaidiwa na akili bandia (AI), kuwa salama, kuwa rahisi kutumia, na kujengwa kwa ajili ya jamii na biashara halisi za Kiafrika."
            };
        },
        [INTENTS.COZYOS_VISION]: (id) => ({
            en: id.getVision(),
            sw: "Kusaidia kuhifadhi, kusherehekea, na kupitisha lugha za Kiafrika, tamaduni, mila, hekima, na maadili mema kwa vizazi vijavyo kwa kutumia teknolojia na akili bandia."
        }),
        [INTENTS.COZYOS_OWNER_VISION]: (id) => ANSWER_BUILDERS[INTENTS.COZYOS_VISION](id),
        [INTENTS.COZYOS_DIFFERENTIATION]: (id) => {
            const pillars = id.getMission().slice(0, 3).map((s) => s.replace(/\.$/, "").toLowerCase());
            return {
                en: `CozyOS is built ${_joinList(pillars, "and")} — designed to strengthen communities and preserve culture, unlike platforms built around always-on internet and a single dominant language.`,
                sw: "CozyOS imejengwa kufanya kazi hata bila mtandao, ina lugha nyingi, na inaongozwa na jamii — teknolojia inayoimarisha jamii, kuhifadhi utamaduni, na kuheshimu kila lugha, tofauti na mifumo mingine iliyojengwa kwa kutegemea mtandao wa kudumu na lugha moja kuu."
            };
        },
        [INTENTS.COZYOS_UNIQUENESS]: (id) => ANSWER_BUILDERS[INTENTS.COZYOS_DIFFERENTIATION](id),
        [INTENTS.COZYOS_VALUES]: (id) => {
            const p = id.getCorePhilosophy();
            const principles = id.getDesignPrinciples();
            return {
                en: `${p.statement} In practice: ${_joinList(principles, "and")}.`,
                sw: `CozyOS inaamini AI haipaswi kufundisha watu tu — watu nao wanapaswa kufundisha AI. Kujifunza ni ushirikiano. Kwa vitendo: teknolojia inapaswa kuimarisha jamii, kuhifadhi utamaduni, kuheshimu kila lugha, kuhamasisha kujifunza, kubaki rahisi kufikiwa, na kutumikia watu.`
            };
        },
        [INTENTS.COZYOS_NAME_MEANING]: () => ({
            en: "That's not documented anywhere in CozyOS yet — this is an honest gap, not a made-up answer. Charles would need to supply the real meaning behind the name for this to be answered accurately.",
            sw: "Jambo hilo halijaandikwa popote katika CozyOS bado — huu ni ukweli wa pengo lililopo, si jibu la kubuni. Charles angehitaji kutoa maana halisi ya jina hilo ili lijibiwe kwa usahihi.",
            known: false
        }),
        [INTENTS.COZYOS_FUTURE]: (id) => ({
            en: id.getLongTermGoal(),
            sw: "Kuunda mojawapo ya makusanyo makubwa zaidi duniani, yanayoongozwa na jamii, ya lugha, tamaduni, na maarifa chanya ya Kiafrika. Maarifa yanapaswa kushirikiwa kwa heshima, huku wachangiaji wakichagua wenyewe watakachofundisha."
        }),
        [INTENTS.COZYOS_PURPOSE]: (id) => ANSWER_BUILDERS[INTENTS.COZYOS_MISSION](id),
        [INTENTS.COZYOS_COMMUNITY]: (id) => {
            const c = id.getCommunityInitiative();
            return {
                en: `${c.summary} You can teach CozyAI things like ${_joinList(c.teachCozyAIExamples.slice(0, 4), "or")}. ${c.note}`,
                sw: "Kila mtu anayependa anaweza kuwa mwanafunzi na mwalimu. Yeyote anayetaka kuhifadhi maarifa ya Kiafrika anakaribishwa kuchangia — kwa mfano maneno 10, misemo miwili muhimu, methali moja, hadithi moja, au mila moja ya kitamaduni. Michango midogo kutoka kwa watu wengi inakuwa hazina ya maarifa ya kudumu kwa vizazi vijavyo."
            };
        }
    };

    // ── Optional real machine-translation for languages beyond en/sw ────
    async function _translateIfPossible(text, targetLanguage) {
        const adapter = window.CozyOS.SpeechTranslationAdapter;
        if (!adapter || typeof adapter.getCapabilities !== "function") return null;
        const caps = adapter.getCapabilities();
        if (!caps.supportsTranslation) return null;
        try {
            const session = adapter.startTranslationSession({ sourceLanguage: "en", targetLanguage });
            const result = await adapter.translateText(session.id, text);
            if (result && result.success) return { text: result.translatedText || result.text, isReal: !!result.isReal };
        } catch (_err) { /* honest silent fallback — caller gets English + a disclosed note */ }
        return null;
    }

    /**
     * resolve(text, { language })
     *   language: "en" | "sw" | any code registered in CozyLanguageRegistry.
     *             Defaults to whichever trigger list matched best, or "en".
     *   Returns { matched:false } when nothing in the intent map fits —
     *   callers (e.g. CozyAI.ask) should fall through to their normal
     *   pipeline in that case, never treat this as a final answer.
     */
    async function resolve(text, { language } = {}) {
        const id = _identity();
        if (!id) return { matched: false, success: false, isReal: false, reason: "DeveloperIdentity is not loaded." };

        const hit = detectIntent(text);
        if (!hit) return { matched: false };

        const builder = ANSWER_BUILDERS[hit.intentId];
        if (!builder) return { matched: false };

        const rendered = builder(id);
        const targetLang = language || hit.matchedLanguageHint || "en";

        if (targetLang === "en" || targetLang === "sw") {
            return {
                matched: true, success: true, isReal: rendered.known === false ? false : true,
                intentId: hit.intentId, confidence: hit.confidence, language: targetLang,
                answer: rendered[targetLang], certified: targetLang === "sw" ? false : undefined,
                source: "DeveloperIdentity (public profile)"
            };
        }

        // Any other registered language: real, disclosed machine translation of the English canonical answer.
        const translated = await _translateIfPossible(rendered.en, targetLang);
        if (translated) {
            return {
                matched: true, success: true, isReal: translated.isReal,
                intentId: hit.intentId, confidence: hit.confidence, language: targetLang,
                answer: translated.text, machineTranslated: true,
                source: "DeveloperIdentity (public profile), machine-translated from English"
            };
        }
        return {
            matched: true, success: true, isReal: true,
            intentId: hit.intentId, confidence: hit.confidence, language: "en",
            answer: rendered.en, fallbackReason: `No real translator available for "${targetLang}" — returned English.`,
            source: "DeveloperIdentity (public profile)"
        };
    }

    const CozyIdentityFAQRouter = Object.freeze({
        getVersion: () => VERSION,
        getIntents: () => Object.values(INTENTS),
        detectIntent,
        resolve
    });

    window.CozyOS.CozyIdentityFAQRouter = CozyIdentityFAQRouter;
    window.CozyOS.Modules["cozyos-identity-faq-router"] = Object.freeze({
        version: VERSION,
        description: "Identity FAQ intent router — maps many EN/Kiswahili phrasings (founder/origin/mission/vision/differentiation/values/name-meaning/future/purpose/community) onto canonical intents, answered ONLY from the real public window.CozyOS.DeveloperIdentity. Never reads the private Founder Story Vault. No Gemini/generative use for these deterministic facts."
    });
})();
