/**
 * core/living/spiritual-capability.js
 * COZY SPIRITUALOS — PHASE 1: Spiritual Foundation
 * (see COZY_SPIRITUALOS_ARCHITECTURE.md — this file implements §1a/§1b/
 * §2/§3/§4a/§5 for the PERSONAL (no-church-context) path only.)
 *
 * WHAT THIS FILE IS
 *   The "General CozyAI Capability Layer" owner for standalone/personal
 *   spiritual requests (§1). It composes — never reimplements — the
 *   real, existing BibleEngine/Living.scripture gateway for Scripture
 *   retrieval, and never claims theological authority, supernatural
 *   authority, or a fabricated capability. It is deliberately the ONLY
 *   new business-logic file this milestone adds; spiritual-intent-
 *   router.js (its sibling) is a thin dispatch table with none of its
 *   own.
 *
 * WHAT THIS FILE IS NOT
 *   - Not a second Scripture engine, prayer engine, or language system.
 *   - Not a classifier: it never recognizes SPIRITUAL_* intents itself —
 *     cozy-ai-semantic-intent.js remains the only place that happens
 *     (§1). This file only decides OWNERSHIP (church vs. personal) and
 *     PERFORMS the personal-path operation once an intent is already
 *     known.
 *   - Not a music/audio engine (§4 is explicitly out of Phase 1 scope —
 *     nothing here touches worship composition or audio rendering).
 *   - Not a doctrinal authority (§3): Scripture retrieval stays distinct
 *     from interpretation; every Scripture-bearing response discloses
 *     its `source` classification; no "this verse means X" is ever
 *     stated as fact.
 *
 * §1a CONTEXT CONTRACT — classifyContext() below sets hasChurchContext
 * = true ONLY when a real, existing LDCE/church-session reference
 * resolves via the SAME primitives church-prayer-interaction.js and
 * cozy-pastor-question-flow.js already compose
 * (window.CozyOS.LDCESessionEngine.getSession(),
 * window.CozyOS.ChurchLiveSessionController.getLdceSessionIdFor()). It
 * NEVER inspects request.text for church-adjacent vocabulary — "church,"
 * "pastor," "prayer," "worship," "Bible," "congregation" are not
 * evidence of context on their own (§1a's own examples).
 *
 * §4a OFFLINE-FIRST — every handlePersonal*() below has a deterministic
 * local execution path with zero network calls. Scripture VERSE TEXT
 * specifically depends on a real, installed, licensed BibleEngine
 * translation (confirmed absent by reading bible-engine.js and grepping
 * the repository for installTranslationPackage() call sites before this
 * file was written — zero calls outside that file's own definition and
 * its own tests, so `lookup()` honestly reports `not_installed` today);
 * reference PARSING has no such dependency and is always available.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }

    const MODULE_VERSION = "1.0.0";

    /** §2 — the closed set of allowed capabilityState values. No ad hoc strings anywhere in this file. */
    const CAPABILITY_STATES = Object.freeze(["available", "not_installed", "no_context", "unsupported", "error"]);
    /** §3 — the closed set of allowed source classifications, plus `null` for a response that carries no Scripture-related content at all (see handlePersonalScripture()'s own comment for exactly when that applies). */
    const SOURCE_VALUES = Object.freeze(["scripture-text", "contextual-info", "denominational-view", "user-doctrine", "generated-reflection"]);

    function normalizeLanguage(language) {
        return (typeof language === "string" && language.trim().toLowerCase() === "sw") ? "sw" : "en";
    }

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * SCRIPTURE_REFERENCE_PATTERN / extractReferenceCandidate(text)
     *   REAL-BROWSER-FOUND FIX — the SAME bare-reference shape
     *   cozy-ai-semantic-intent.js's own SPIRITUAL_SCRIPTURE PATTERNS
     *   entry already uses to recognize the intent in the first place
     *   (kept in sync, never a competing shape). A live Cozy SpiritualOS
     *   run (dashboard.html, real Chromium) surfaced a genuine
     *   integration gap unit tests with a mocked parseReference() had
     *   not caught: BibleEngine.parseReference() requires its input to
     *   be an EXACT, whole reference string (its own regexes are
     *   ^-anchored) — the same contract bible-interface-module.js
     *   already relies on, since ITS input always comes from a
     *   dedicated search box, never a full sentence. A real
     *   conversational turn ("Show me John 3:16") is a full sentence,
     *   not a bare reference, so passing it to parseReference()
     *   unmodified always returned null. This extracts the real
     *   reference substring first — never invents one; if none is
     *   found, the original raw text is passed through unchanged
     *   (preserving the exact-reference-input behavior a bare "John
     *   3:16" message, or bible-interface-module.js's own search box,
     *   already relies on).
     */
    const SCRIPTURE_REFERENCE_PATTERN = /\b((?:[1-3]\s?)?[A-Za-z]+\s+\d{1,3}:\d{1,3})\b/;
    function extractReferenceCandidate(text) {
        const match = text.match(SCRIPTURE_REFERENCE_PATTERN);
        return match ? match[1] : text.trim();
    }

    /**
     * buildEnvelope(fields)
     *   §2 — the one, shared response shape every capability call in
     *   this file returns, so Live Window never has to guess what
     *   happened. `source` must be one of SOURCE_VALUES or null (never
     *   an ad hoc string) — enforced here, not just documented.
     */
    function buildEnvelope({ intent, owner, capabilityState, language, source = null, content, conversationStateUpdated = true }) {
        if (!CAPABILITY_STATES.includes(capabilityState)) {
            throw new Error(`Invalid capabilityState "${capabilityState}" — must be one of ${CAPABILITY_STATES.join(", ")}.`);
        }
        if (source !== null && !SOURCE_VALUES.includes(source)) {
            throw new Error(`Invalid source "${source}" — must be null or one of ${SOURCE_VALUES.join(", ")}.`);
        }
        return {
            capability: "spiritual",
            intent,
            owner,
            capabilityState,
            language,
            source,
            content,
            conversationStateUpdated: !!conversationStateUpdated
        };
    }

    /**
     * classifyContext(request)
     *   §1a — strict, session-reference-only. `request` may carry
     *   `ldceSessionId` (a real LDCE session id directly) and/or
     *   `liveSessionId` (a ChurchWorshipSession-style id, the same
     *   "current live session" concept cozy-ai.js's own getContext()
     *   and cozy-pastor-question-flow.js already use — resolved to an
     *   LDCE session id via ChurchLiveSessionController.getLdceSessionIdFor(),
     *   exactly like that flow does). `request.text` is NEVER read by
     *   this function — see the module header's §1a examples.
     */
    function classifyContext(request) {
        const req = (request && typeof request === "object") ? request : {};
        const ldceDirect = isNonEmptyString(req.ldceSessionId) ? req.ldceSessionId.trim() : null;
        const liveSessionId = isNonEmptyString(req.liveSessionId) ? req.liveSessionId.trim() : null;

        if (!ldceDirect && !liveSessionId) {
            return { hasChurchContext: false, reason: "no_session_reference", ldceSessionId: null };
        }

        const cozy = cozyOS();
        const ldce = cozy && cozy.LDCESessionEngine;
        if (!ldce || typeof ldce.getSession !== "function") {
            return { hasChurchContext: false, reason: "session_engine_unavailable", ldceSessionId: null };
        }

        let resolvedLdceSessionId = ldceDirect;
        if (!resolvedLdceSessionId && liveSessionId) {
            const controller = cozy.ChurchLiveSessionController;
            resolvedLdceSessionId = (controller && typeof controller.getLdceSessionIdFor === "function")
                ? controller.getLdceSessionIdFor(liveSessionId)
                : null;
        }
        if (!resolvedLdceSessionId) {
            return { hasChurchContext: false, reason: "session_not_resolved", ldceSessionId: null };
        }

        const session = ldce.getSession(resolvedLdceSessionId);
        if (!session) {
            return { hasChurchContext: false, reason: "session_not_found", ldceSessionId: null };
        }

        return { hasChurchContext: true, reason: "real_session_reference", ldceSessionId: resolvedLdceSessionId, session };
    }

    /**
     * §1b OWNER TABLE — the closed dispatch table this file's route()
     * decides against. `church` is either the real ChurchOS owner's
     * disclosed module name, or `null` when no distinct ChurchOS-owned
     * business-logic capability exists for that intent today (confirmed
     * by reading every ChurchOS file this milestone traces before
     * writing this — see the individual notes below). A `null` church
     * owner never means "fabricate one" — it means route() honestly
     * falls back to the personal handler even when church context is
     * real, because there is genuinely nothing more specific to route
     * to yet.
     *
     *   SPIRITUAL_PRAYER     — church-prayer-interaction.js is a real,
     *     directly composable business-logic owner (submitPrayerRequest()).
     *   SPIRITUAL_SCRIPTURE  — ChurchOS's bible-interface-module.js
     *     exists, but (confirmed by reading it) exposes no business-logic
     *     function at all beyond a UI dashboard (getDashboard()/init()/
     *     destroy()) — it composes the exact same window.CozyOS.Living.
     *     scripture gateway this file's own handlePersonalScripture()
     *     composes. There is no distinct ChurchOS-owned retrieval logic
     *     to route to, so this stays `null` (never fabricated).
     *   SPIRITUAL_DEVOTIONAL — no ChurchOS-owned devotional capability
     *     exists anywhere in this repository (confirmed by search before
     *     writing this file) — `null`.
     *   SPIRITUAL_WORSHIP    — worship-mode-coordinator.js is a real
     *     owner, but only exposes SESSION-ACTION methods (startWorshipMode/
     *     endWorshipMode/markPhase) that require orchestration decisions
     *     (which action? which phase?) a generic chat message cannot
     *     safely resolve without inventing business logic that belongs
     *     to that file, not this router (§1b: "pure routing, no business
     *     logic duplicated from ChurchOS files"). It is disclosed as the
     *     real owner name for diagnostics, but spiritual-intent-router.js
     *     never auto-invokes any of its action methods from an ordinary
     *     conversational turn — see that file's own dispatch() comment.
     */
    const OWNER_TABLE = Object.freeze({
        SPIRITUAL_PRAYER: { church: "church-prayer-interaction", personal: "handlePersonalPrayer" },
        SPIRITUAL_SCRIPTURE: { church: null, personal: "handlePersonalScripture" },
        SPIRITUAL_DEVOTIONAL: { church: null, personal: "handlePersonalDevotional" },
        SPIRITUAL_WORSHIP: { church: "worship-mode-coordinator", personal: "handlePersonalWorshipInfo" }
    });

    /**
     * route(intent, context)
     *   §1b — pure routing decision only. Never calls a ChurchOS file,
     *   never calls a handlePersonal*() function, never touches
     *   conversationState. `context` is the real object classifyContext()
     *   already returned (never re-derived here).
     */
    function route(intent, context) {
        const ctx = (context && typeof context === "object") ? context : { hasChurchContext: false };
        const entry = OWNER_TABLE[intent];
        if (!entry) return { intent, owner: null, reason: "unknown_intent" };

        if (ctx.hasChurchContext && entry.church) {
            return { intent, owner: "church", ownerModule: entry.church, ldceSessionId: ctx.ldceSessionId || null };
        }
        if (ctx.hasChurchContext && !entry.church) {
            return {
                intent, owner: "personal", ownerFunction: entry.personal,
                note: "Real church context was detected, but no distinct ChurchOS-owned business-logic capability exists for this intent — honestly falling back to the personal handler rather than fabricating one."
            };
        }
        return { intent, owner: "personal", ownerFunction: entry.personal };
    }

    // ------------------------------------------------------------------
    // PERSONAL-PATH HANDLERS
    // ------------------------------------------------------------------

    const PRAYER_STRUCTURE = Object.freeze({
        en: {
            intro: "Here is a simple, honest structure you can use to guide your own prayer — CozyOS does not pray on your behalf or claim any spiritual authority.",
            steps: [
                "Adoration — take a moment to acknowledge who you understand God to be.",
                "Confession — be honest about anything weighing on your conscience.",
                "Thanksgiving — name specific things you're grateful for right now.",
                "Supplication — bring your actual request(s) plainly: {{topic}}"
            ],
            defaultTopic: "whatever is on your heart"
        },
        sw: {
            intro: "Huu ni muundo rahisi, wa kweli, unaoweza kutumia kuongoza maombi yako mwenyewe — CozyOS haiombi kwa niaba yako wala haidai mamlaka yoyote ya kiroho.",
            steps: [
                "Kumsifu Mungu — tumia muda kumkumbuka Mungu unayemwelewa kuwa yeye.",
                "Kutubu — kuwa mkweli kuhusu jambo lolote linalolemea dhamiri yako.",
                "Kushukuru — taja mambo mahususi unayoshukuru kwa sasa.",
                "Kuomba — leta ombi lako halisi kwa uwazi: {{topic}}"
            ],
            defaultTopic: "chochote kilicho moyoni mwako"
        }
    });

    /**
     * handlePersonalPrayer(request)
     *   §5 — no prayer-generation engine exists anywhere in this
     *   repository (confirmed before writing this), and CozyAI never
     *   claims supernatural authority (§3: no "God told me," no
     *   fabricated prayer spoken as if divinely inspired). This is a
     *   real, deterministic, offline, disclosed STRUCTURAL aid only —
     *   the same "structure, never content-authoring" discipline §3
     *   requires of sermon assistance, applied to personal prayer.
     *   Always deterministic and available — zero dependency, zero
     *   network call.
     */
    function handlePersonalPrayer(request) {
        const req = (request && typeof request === "object") ? request : {};
        const language = normalizeLanguage(req.language);
        const structure = PRAYER_STRUCTURE[language];
        const topic = isNonEmptyString(req.topic) ? req.topic.trim() : structure.defaultTopic;
        const steps = structure.steps.map((s) => s.replace("{{topic}}", topic));
        const content = `${structure.intro}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
        return buildEnvelope({
            intent: "SPIRITUAL_PRAYER", owner: "personal", capabilityState: "available",
            language, source: "generated-reflection", content
        });
    }

    const SCRIPTURE_TEXT = Object.freeze({
        en: {
            noReference: "I can look up a Scripture reference (e.g. \"John 3:16\"), but I couldn't find one in your message. Could you name a specific reference?",
            notInstalled: (reference) => `I found the reference (${reference}), but no licensed Bible translation is installed on this device yet, so I can't show you the actual verse text. Installing a translation is a separate, explicit step (never automatic) — see §4a of the architecture — and I won't invent verse wording in its place.`
        },
        sw: {
            noReference: "Ninaweza kutafuta andiko la Biblia (mfano \"Yohana 3:16\"), lakini sikuweza kupata andiko mahususi kwenye ujumbe wako. Je, unaweza kutaja andiko mahususi?",
            notInstalled: (reference) => `Nimepata andiko (${reference}), lakini hakuna tafsiri ya Biblia iliyowekwa (yenye leseni) kwenye kifaa hiki bado, kwa hivyo siwezi kukuonyesha maandishi halisi ya mstari. Kuweka tafsiri ni hatua tofauti, ya wazi (haifanyiki kiotomatiki), na sitabuni maneno ya mstari badala yake.`
        }
    });

    /**
     * handlePersonalScripture(request)
     *   §5 — composes the EXISTING, REAL window.CozyOS.Living.scripture
     *   gateway (parseReference()/lookup()), the same gateway ChurchOS's
     *   own bible-interface-module.js already composes — never a second
     *   lookup path, never a second Bible dataset.
     *
     *   parseReference("John 3:16") has no license/data dependency and
     *   is always real when Living.scripture is loaded — a successful
     *   parse alone is reported as `available` (the reference itself was
     *   genuinely resolved), with `source: null` since no actual
     *   Scripture TEXT is present in that response yet — only the
     *   confirmation of what reference was understood.
     *
     *   lookup() depends on a real, installed, licensed translation.
     *   When none is installed (the real, verified state of this
     *   repository today — see this file's header), this honestly
     *   reports `capabilityState: "not_installed"` rather than
     *   fabricating verse wording. Only once real verse text is
     *   actually returned does this report `capabilityState: "available"`
     *   with `source: "scripture-text"` (§3 Level A).
     */
    function handlePersonalScripture(request) {
        const req = (request && typeof request === "object") ? request : {};
        const language = normalizeLanguage(req.language);
        const strings = SCRIPTURE_TEXT[language];
        const rawText = isNonEmptyString(req.text) ? req.text.trim() : "";
        const text = rawText ? extractReferenceCandidate(rawText) : "";

        const cozy = cozyOS();
        const living = cozy && cozy.Living;
        if (!living || !living.scripture || typeof living.scripture.parseReference !== "function") {
            return buildEnvelope({
                intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "not_installed",
                language, source: null,
                content: language === "sw"
                    ? "Injini ya Biblia (Living.scripture) haijawekwa kwenye mfumo huu."
                    : "The Bible engine (Living.scripture) is not loaded in this environment."
            });
        }

        const parsed = living.scripture.parseReference(text);
        if (!parsed) {
            return buildEnvelope({
                intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "unsupported",
                language, source: null, content: strings.noReference
            });
        }
        if (parsed.wholeChapter) {
            return buildEnvelope({
                intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "unsupported",
                language, source: null,
                content: language === "sw"
                    ? `Nimetambua ${parsed.book} sura ${parsed.chapter}, lakini kwa sasa ninaweza kutafuta mstari mmoja mahususi tu (mfano ${parsed.book} ${parsed.chapter}:1), si sura nzima.`
                    : `I recognized ${parsed.book} chapter ${parsed.chapter}, but right now I can only look up one specific verse (e.g. ${parsed.book} ${parsed.chapter}:1), not a whole chapter.`
            });
        }

        const reference = `${parsed.book} ${parsed.chapter}:${parsed.verse}`;
        if (typeof living.scripture.lookup !== "function") {
            return buildEnvelope({
                intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "not_installed",
                language, source: null, content: strings.notInstalled(reference)
            });
        }

        const result = living.scripture.lookup(parsed.book, parsed.chapter, parsed.verse);
        if (!result || !result.available) {
            return buildEnvelope({
                intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "not_installed",
                language, source: null, content: strings.notInstalled(reference)
            });
        }

        // Real verse text was actually returned — §3 Level A, source:
        // "scripture-text". Render every installed translation's real
        // text, verbatim, never re-worded.
        const lines = Object.entries(result.translations).map(([translation, record]) => `[${translation}] ${record.text}`);
        return buildEnvelope({
            intent: "SPIRITUAL_SCRIPTURE", owner: "personal", capabilityState: "available",
            language, source: "scripture-text",
            content: `${result.reference}\n${lines.join("\n")}`
        });
    }

    const DEVOTIONAL_TEXT = Object.freeze({
        en: {
            frame: "This is CozyOS's own generated devotional structure — not Scripture, not any denomination's official teaching, and not a claim about what a passage \"really means.\" Use it as a personal starting point, not a final authority.",
            steps: ["Read — sit with a passage that's on your mind (I can look one up if you name a reference).",
                "Reflect — what stands out to you, in your own words, right now?",
                "Pray — bring what you noticed into a short, honest prayer.",
                "Apply — is there one small, concrete thing this points you toward today?"]
        },
        sw: {
            frame: "Huu ni muundo wa ibada uliobuniwa na CozyOS — si Biblia, si mafundisho rasmi ya dhehebu lolote, wala si madai kuhusu maana \"halisi\" ya andiko. Utumie kama mwanzo wa kibinafsi, si mamlaka ya mwisho.",
            steps: ["Soma — tafakari andiko lililo akilini mwako (ninaweza kulitafuta kama utataja andiko mahususi).",
                "Tafakari — ni nini kinachokugusa, kwa maneno yako mwenyewe, sasa hivi?",
                "Omba — leta ulichokigundua kwenye maombi mafupi, ya kweli.",
                "Tumia — kuna jambo dogo, halisi unaloweza kulitekeleza leo kutokana na hili?"]
        }
    });

    /**
     * handlePersonalDevotional(request)
     *   §5 — no devotional-content dataset exists in this repository
     *   (confirmed by search before writing this). Real, deterministic,
     *   disclosed STRUCTURAL scaffold only (Read/Reflect/Pray/Apply),
     *   explicitly labeled as CozyOS's own generated reflection (§3
     *   Level C, source: "generated-reflection") — never presented as
     *   Scripture or as any church's official devotional content. If
     *   the caller supplied a Scripture reference, this composes the
     *   SAME real handlePersonalScripture() above for the "Read" step
     *   (never a second lookup path) and discloses that sub-result
     *   verbatim under `scriptureLookup` — a diagnostic field distinct
     *   from the envelope's own top-level `source`, so the overall
     *   devotional-structure capability is honestly reported as
     *   `available` (it genuinely executed) regardless of whether that
     *   embedded lookup separately found installed verse text.
     */
    function handlePersonalDevotional(request) {
        const req = (request && typeof request === "object") ? request : {};
        const language = normalizeLanguage(req.language);
        const strings = DEVOTIONAL_TEXT[language];

        let scriptureLookup = null;
        if (isNonEmptyString(req.reference)) {
            scriptureLookup = handlePersonalScripture({ text: req.reference, language: req.language });
        }

        const content = `${strings.frame}\n\n${strings.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
        const envelope = buildEnvelope({
            intent: "SPIRITUAL_DEVOTIONAL", owner: "personal", capabilityState: "available",
            language, source: "generated-reflection", content
        });
        if (scriptureLookup) envelope.scriptureLookup = scriptureLookup;
        return envelope;
    }

    const WORSHIP_INFO_TEXT = Object.freeze({
        en: {
            frame: "This is a general, disclosed overview — not any specific church's schedule, liturgy, or doctrine. For a real, live worship service's actual schedule, this needs to be asked from inside that live session.",
            body: "Worship commonly includes some combination of: song/praise, prayer, Scripture reading, teaching, testimony, and giving. The specific order and elements vary by congregation and tradition — CozyOS does not decide or declare a correct order."
        },
        sw: {
            frame: "Huu ni muhtasari wa jumla, wa wazi — si ratiba, taratibu, au mafundisho ya kanisa lolote mahususi. Kwa ratiba halisi ya ibada inayoendelea moja kwa moja, swali hili linahitaji kuulizwa kutoka ndani ya kikao hicho halisi.",
            body: "Ibada mara nyingi hujumuisha mchanganyiko wa: kuimba/kusifu, kuomba, kusoma Biblia, mafundisho, ushuhuda, na sadaka. Mpangilio na vipengele mahususi hutofautiana kwa kanisa na mila — CozyOS haiamui wala haitangazi mpangilio sahihi."
        }
    });

    /**
     * handlePersonalWorshipInfo(request)
     *   §5 Phase 1 scope is "Worship information" (never composition —
     *   that's explicitly Future Phase 3, §4/§0a). No worship-content
     *   dataset exists in this repository, so this is a real,
     *   deterministic, disclosed general overview only (§3 Level C,
     *   source: "generated-reflection") — never claimed as a specific
     *   congregation's real, live schedule (that stays exclusively
     *   worship-mode-coordinator.js's/ChurchWorshipSession's job, in
     *   real church context, per §1b's OWNER_TABLE above).
     */
    function handlePersonalWorshipInfo(request) {
        const req = (request && typeof request === "object") ? request : {};
        const language = normalizeLanguage(req.language);
        const strings = WORSHIP_INFO_TEXT[language];
        return buildEnvelope({
            intent: "SPIRITUAL_WORSHIP", owner: "personal", capabilityState: "available",
            language, source: "generated-reflection",
            content: `${strings.frame}\n\n${strings.body}`
        });
    }

    const api = Object.freeze({
        classifyContext,
        route,
        handlePersonalPrayer,
        handlePersonalScripture,
        handlePersonalDevotional,
        handlePersonalWorshipInfo,
        buildEnvelope,
        CAPABILITY_STATES,
        SOURCE_VALUES,
        OWNER_TABLE,
        getVersion() { return MODULE_VERSION; }
    });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.SpiritualCapability = api;
        root.window.CozyOS.Modules["spiritual-capability"] = Object.freeze({
            version: MODULE_VERSION,
            description: "COZY SPIRITUALOS — PHASE 1: Spiritual Foundation. Personal-path owner for SPIRITUAL_PRAYER/SPIRITUAL_SCRIPTURE/SPIRITUAL_DEVOTIONAL/SPIRITUAL_WORSHIP (§1's \"personal capability\" side). classifyContext() is strict session-reference-only (§1a, never vocabulary-based). Scripture retrieval composes the existing, real window.CozyOS.Living.scripture gateway (BibleEngine) — never a second Bible dataset. Prayer/devotional/worship-info are real, deterministic, offline, disclosed structural aids only — never fabricated Scripture, never claimed theological/supernatural authority. No duplicate engines, no hidden network dependency, no fabricated capability (§'s Locked invariants)."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
