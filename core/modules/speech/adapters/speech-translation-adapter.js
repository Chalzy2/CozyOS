/**
 * CozyOS Speech Translation Adapter
 * File Reference: core/modules/speech/adapters/speech-translation-adapter.js
 * Layer: Core / Speech Adapter
 * Version: 1.1.0-ENTERPRISE
 * Milestone: 150 (revised — see 1.0.0→1.1.0 note below)
 *
 * 1.0.0 → 1.1.0 — OWNERSHIP CORRECTION (before this file was ever delivered)
 *   1.0.0 registered into CozySpeech.registerAdapter()/registerLanguage(),
 *   based on the milestone brief's assertion that CozySpeech is also the
 *   "Translation Coordinator." That assertion didn't match the live repo:
 *   core/modules/translate/cozy-translate.js already exists, is already
 *   loaded, and is explicitly the real Translation Coordinator — it has
 *   its own registerTranslator() extension point, its own source/target
 *   LanguageRegistry, and its own session/stream/segment lifecycle, and
 *   its header explicitly declares "0% text manipulation or string
 *   translation" (i.e. it's a directory/orchestrator, never a translator
 *   itself — confirmed by reading its source before writing this file).
 *   Per explicit approval, this file now integrates through
 *   CozyTranslate's real extension points instead. CozySpeech is
 *   untouched by this file.
 *
 * OWNERSHIP (verified against the live codebase)
 *   CozyTranslate (core/modules/translate/cozy-translate.js) remains the
 *   ONE Translation Coordinator: sessions, streams, segments, the
 *   translator directory, and the source/target language registry all
 *   live there. This file:
 *     - registers ONE translator record via CozyTranslate.registerTranslator()
 *       (idempotent — checks hasTranslator() first)
 *     - registers languages via CozyTranslate.registerSourceLanguage()/
 *       registerTargetLanguage() (never a second language registry)
 *     - drives sessions via CozyTranslate.createSession()/
 *       transitionSessionState() — session state lives in CozyTranslate,
 *       not here
 *     - records each translated chunk via CozyTranslate.orchestrateStream()
 *       + routeSegment() — reusing its real stream/segment storage
 *   CozySpeech (core/modules/speech/cozy-speech.js) is optionally,
 *   softly cross-linked ONLY if the caller supplies an existing
 *   sourceSpeechSessionId (real "Recognized Text → Translation" link via
 *   its own Event Graph, which already lists "translation" as a node
 *   type and "translates_into" as a relationship) — never required,
 *   never a second session store.
 *   voice-provider.js is never imported or referenced — translation
 *   never authenticates, never owns users or voice factors.
 *   Media (core/modules/media/cozy-media.js) is not touched — this
 *   milestone is text-only.
 *   Engine Bridge: per explicit approval, integrates directly through
 *   CozyTranslate's real extension points; none exists in this
 *   codebase to reuse, and none is created here.
 *
 * TRANSLATOR IMPLEMENTATION — WHY A SEPARATE PROVIDER REGISTRY STILL EXISTS
 *   CozyTranslate.registerTranslator() stores a translator's metadata
 *   (id/name/type/capabilities/api) as a directory entry ONLY — by its
 *   own strict "0% text manipulation" design it never calls the
 *   adapter's api itself (confirmed: no dispatchTranslator() exists,
 *   unlike dispatchClosedIntegration() which does call in). So the
 *   actual "translate(text) -> text" implementation still has to live
 *   somewhere real: window.CozyOS.SpeechTranslationProviders (this
 *   milestone's provider abstraction — browser/cloud/offline/AI, never
 *   hardcoded). This file registers exactly ONE CozyTranslate translator
 *   record whose `api.translate()` delegates to that provider registry.
 *   This does not compete with CozyTranslate's directory role — it's the
 *   real implementation behind the one entry CozyTranslate lists.
 *
 * HONEST DISCLOSURE — "RECENT TRANSLATIONS" CACHE
 *   Like CozySpeech's segments, CozyTranslate's segments
 *   (id/streamId/sequenceNumber/speakerIndex/metricsBookmark/timestamp)
 *   have no field for translated TEXT — bookkeeping only, by the
 *   coordinator's own design. `listRecentTranslations()` below is a
 *   small, disclosed, IN-MEMORY, non-persistent cache (last 50) of
 *   actual translated strings, for immediate UI preview/history only.
 *   Real session/segment counts and statistics come from CozyTranslate
 *   itself via listSessions()/listSegments()/getDiagnosticsReport().
 *
 * NOT BUILT (out of scope this milestone, per spec)
 *   AI chat/assistant, voice authentication/verification, speaker
 *   recognition, translation AI models, cloud translation engine,
 *   offline translation models beyond a genuinely-detected browser API,
 *   voice cloning, auto language detection, streaming translation,
 *   speak-translation/TTS (future), a new Engine Bridge.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const ADAPTER_VERSION = "1.1.0-ENTERPRISE";
    const TRANSLATOR_ID = "cozyos-speech-translation-adapter";

    if (window.CozyOS.SpeechTranslationAdapter?.getVersion) {
        if (window.CozyOS.SpeechTranslationAdapter.getVersion() !== ADAPTER_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: SpeechTranslationAdapter.");
        }
        return;
    }

    // R040 Phase 1 fix (15-vs-17 language gap) — this file previously
    // hardcoded its own static SEED_LANGUAGES list as a second,
    // competing source of truth for "which languages CozyOS supports",
    // independent of the real canonical registry
    // (core/modules/intelligence/language-packs/cozy-language-pack-registry.js,
    // CozyLanguagePacks.DEFAULT_IDENTITIES — the 17-language source of
    // truth). That static list had already drifted out of sync with
    // callers' documentation in at least one other file (a stale header
    // comment elsewhere in this repo still describes it as 15 codes
    // missing ar/ru/zh; the list itself already contained ar/ru/zh by
    // the time this fix was written — the actual remaining problem was
    // the existence of a second list at all, not those three codes).
    //
    // Fixed by deriving the seed set from CozyLanguagePacks at call
    // time (lazy — this module may load before or after the registry;
    // see script-order fix in dashboard.html) instead of hardcoding it.
    // A small EXTRA_DIALECT_LANGUAGES list remains for genuine
    // additional dialects this adapter already served that are NOT
    // among the 17 canonical defaults (regional Kenyan dialects this
    // milestone intentionally seeds beyond the 17) — kept additive and
    // clearly labeled, never presented as part of the 17.
    const EXTRA_DIALECT_LANGUAGES = ["kln", "luy", "mas", "lg"];
    // Static fallback ONLY for the case CozyLanguagePacks genuinely
    // isn't loaded at all (kept so this adapter still seeds something
    // real rather than nothing) — disclosed, not a silent duplicate
    // registry: getSeedLanguages() always prefers the canonical
    // registry when it is available.
    const FALLBACK_SEED_LANGUAGES = [
        "sw", "luo", "ki", "kam", "so", "am", "yo", "ha", "zu",
        "en", "fr", "ar", "ru", "zh", "ln", "ig", "hi"
    ];

    function _languagePacks() { return window.CozyOS.CozyLanguagePacks || null; }

    /** getSeedLanguages() — the canonical 17 (from CozyLanguagePacks) plus disclosed extra dialects, or an honest fallback list with a reason if the canonical registry isn't loaded yet. */
    function getSeedLanguages() {
        const packs = _languagePacks();
        if (packs && Array.isArray(packs.DEFAULT_IDENTITIES) && packs.DEFAULT_IDENTITIES.length > 0) {
            const canonical = packs.DEFAULT_IDENTITIES.map((d) => d.languageId);
            return { codes: Array.from(new Set([...canonical, ...EXTRA_DIALECT_LANGUAGES])), source: "CozyLanguagePacks.DEFAULT_IDENTITIES", usedFallback: false };
        }
        return { codes: Array.from(new Set([...FALLBACK_SEED_LANGUAGES, ...EXTRA_DIALECT_LANGUAGES])), source: "FALLBACK_SEED_LANGUAGES (CozyLanguagePacks was not loaded when languages were seeded)", usedFallback: true };
    }

    // sessionId -> { streamId, sourceLanguage, targetLanguage }
    const _streamBySession = new Map();
    // Bounded, disclosed, non-persistent recent-translations cache (see file header).
    const _recentTranslations = [];
    const RECENT_CACHE_LIMIT = 50;

    function _translate() { return window.CozyOS.CozyTranslate || null; }
    function _speech() { return window.CozyOS.CozySpeech || null; }
    function _bus() { return window.CozyOS.PlatformEventBus || null; }
    function _providers() { return window.CozyOS.SpeechTranslationProviders || null; }

    function _emit(eventName, detail) {
        const bus = _bus();
        if (bus && typeof bus.emit === "function") {
            try { bus.emit(`speech-translation:${eventName}`, detail); } catch (_e) { /* observability only */ }
        }
    }

    function _registerLanguagesOnce() {
        const translate = _translate();
        if (!translate) return;
        const sources = new Set(translate.getSupportedSourceLanguages());
        const targets = new Set(translate.getSupportedTargetLanguages());
        const { codes: SEED_LANGUAGES } = getSeedLanguages();
        for (const code of SEED_LANGUAGES) {
            if (!sources.has(code)) translate.registerSourceLanguage(code);
            if (!targets.has(code)) translate.registerTargetLanguage(code);
        }
    }

    function _registerTranslatorOnce() {
        const translate = _translate();
        if (!translate) return false;
        if (translate.hasTranslator(TRANSLATOR_ID)) return true;

        const providers = _providers();
        const caps = providers ? providers.getCapabilities() : { supportsTranslation: false };

        translate.registerTranslator({
            id: TRANSLATOR_ID,
            name: "CozyOS Speech Translation Adapter",
            type: "Interpreter",
            capabilities: { ...caps },
            offline: !!caps.supportsOfflineTranslation,
            version: ADAPTER_VERSION,
            api: {
                // CozyTranslate never calls this itself (see file header) —
                // this file and its own translate()/previewTranslation()
                // methods are the real callers.
                translate: async (text, opts) => {
                    const p = _providers();
                    if (!p) return { isReal: false, translatedText: null, reason: "Provider registry not loaded. Failing closed." };
                    return p.translate(text, opts);
                },
            },
        });
        return true;
    }

    const SpeechTranslationAdapter = {
        getVersion() { return ADAPTER_VERSION; },

        /** Call once at startup (idempotent). Registers with CozyTranslate and seeds languages; does not require a provider to exist yet. */
        async init() {
            const providers = _providers();
            if (providers) await providers.autoDetectBrowserProvider();
            _registerLanguagesOnce();
            _registerTranslatorOnce();
            return true;
        },

        /** getSeedLanguageReport() — honest disclosure of which language list this adapter actually seeded from, and whether it had to fall back (R040 Phase 1 — resolves the 15-vs-17 gap by removing the second hardcoded registry rather than just editing its contents). */
        getSeedLanguageReport() { return getSeedLanguages(); },

        getCapabilities() {
            const providers = _providers();
            const base = providers ? providers.getCapabilities() : {
                supportsTranslation: false, supportsRealtimeTranslation: false,
                supportsOfflineTranslation: false, supportsAutoDetectLanguage: false,
                supportsStreamingTranslation: false,
            };
            return Object.freeze({ ...base, supportsTranslationHistory: true });
        },

        /**
         * startTranslationSession({ sourceLanguage, targetLanguage, sourceSpeechSessionId? })
         * Session lifecycle lives entirely in CozyTranslate.
         * sourceSpeechSessionId is optional — if a real, existing
         * CozySpeech session id is passed, this softly cross-links it via
         * CozySpeech's own Event Graph (translation node + translates_into
         * edge). Never required, never a second session store.
         */
        startTranslationSession({ sourceLanguage, targetLanguage, sourceSpeechSessionId } = {}) {
            const translate = _translate();
            if (!translate) throw new Error("[SpeechTranslationAdapter] CozyTranslate is not loaded. Failing closed.");
            if (!sourceLanguage || !targetLanguage) throw new TypeError("[SpeechTranslationAdapter] startTranslationSession(): sourceLanguage and targetLanguage are required.");

            const session = translate.createSession({ sourceLang: sourceLanguage, targetLang: targetLanguage, translatorId: TRANSLATOR_ID });
            translate.transitionSessionState(session.id, "Active");

            const stream = translate.orchestrateStream(session.id, { type: "TranslationTextStream" });
            _streamBySession.set(session.id, { streamId: stream.id, sourceLanguage, targetLanguage });

            if (sourceSpeechSessionId) {
                const speech = _speech();
                if (speech) {
                    try {
                        speech.registerGraphNode({ entityType: "translation", entityId: session.id, sessionId: sourceSpeechSessionId, label: `${sourceLanguage}→${targetLanguage}` });
                        speech.registerGraphEdge({ fromNodeId: sourceSpeechSessionId, toNodeId: session.id, relationship: "translates_into", sessionId: sourceSpeechSessionId });
                    } catch (_e) { /* soft cross-link only — never blocks translation if the speech session id doesn't resolve */ }
                }
            }

            _emit("onStart", { sessionId: session.id, sourceLanguage, targetLanguage });
            return session.id;
        },

        async translateText(sessionId, text, opts = {}) {
            const meta = sessionId ? _streamBySession.get(sessionId) : null;
            const sourceLanguage = opts.sourceLanguage || meta?.sourceLanguage;
            const targetLanguage = opts.targetLanguage || meta?.targetLanguage;
            if (!sourceLanguage || !targetLanguage) throw new TypeError("[SpeechTranslationAdapter] translateText(): sourceLanguage and targetLanguage are required (directly, or via an active session).");

            const translate = _translate();
            const translatorRecord = translate ? translate.getTranslator(TRANSLATOR_ID) : null;
            if (!translatorRecord) { _emit("onError", { sessionId, reason: "Translator not registered with CozyTranslate." }); return { isReal: false, translatedText: null, reason: "Translator not registered. Failing closed." }; }

            const result = await translatorRecord.api.translate(text, { sourceLanguage, targetLanguage });
            if (!result.isReal) { _emit("onError", { sessionId, reason: result.reason }); return result; }

            _recentTranslations.unshift({
                sessionId: sessionId || null, sourceLanguage, targetLanguage,
                sourceText: text, translatedText: result.translatedText,
                providerName: result.providerName, timestamp: new Date().toISOString(),
            });
            if (_recentTranslations.length > RECENT_CACHE_LIMIT) _recentTranslations.length = RECENT_CACHE_LIMIT;

            if (meta && translate) {
                try {
                    translate.routeSegment(meta.streamId, { speakerIndex: 0, metricsBookmark: { wordCount: text.trim().split(/\s+/).length, complexityRank: "low" } });
                } catch (_e) { /* statistics only — never blocks the real translation result */ }
            }

            _emit("onTranslation", { sessionId, sourceLanguage, targetLanguage, translatedText: result.translatedText });
            _emit("onCompleted", { sessionId, translatedText: result.translatedText });
            return result;
        },

        /** Text-only, per spec — "Speak Translation" (TTS) is future scope. No session required. */
        async previewTranslation(text, { sourceLanguage, targetLanguage } = {}) {
            const translate = _translate();
            const translatorRecord = translate ? translate.getTranslator(TRANSLATOR_ID) : null;
            if (!translatorRecord) return { isReal: false, translatedText: null, reason: "Translator not registered. Failing closed." };
            return translatorRecord.api.translate(text, { sourceLanguage, targetLanguage });
        },

        stopTranslationSession(sessionId) {
            const translate = _translate();
            if (!translate || !translate.getSession(sessionId)) throw new Error(`[SpeechTranslationAdapter] Unknown session "${sessionId}".`);
            translate.transitionSessionState(sessionId, "Stopped");
            _emit("onStop", { sessionId });
            return sessionId;
        },

        /**
         * Cancel: CozyTranslate's own VALID_SESSION_STATES has no
         * dedicated "Cancelled" state — disclosed here rather than
         * fabricating one. This transitions to "Stopped" (the same real
         * underlying state Stop uses) but still emits the adapter's own
         * distinct onCancelled event so UI/event listeners can tell the
         * two apart.
         */
        cancelTranslationSession(sessionId) {
            const translate = _translate();
            if (!translate || !translate.getSession(sessionId)) throw new Error(`[SpeechTranslationAdapter] Unknown session "${sessionId}".`);
            translate.transitionSessionState(sessionId, "Stopped");
            _emit("onCancelled", { sessionId });
            return sessionId;
        },

        /** Archives the current session (CozyTranslate's real terminal state) and starts a fresh one with the same language pair. */
        resetTranslationSession(sessionId) {
            const translate = _translate();
            const session = translate ? translate.getSession(sessionId) : null;
            if (!session) throw new Error(`[SpeechTranslationAdapter] Unknown session "${sessionId}".`);
            if (session.lifecycleState === "Active" || session.lifecycleState === "Paused") {
                translate.transitionSessionState(sessionId, "Stopped");
            }
            translate.transitionSessionState(sessionId, "Archived");
            _streamBySession.delete(sessionId);
            return this.startTranslationSession({ sourceLanguage: session.sourceLang, targetLanguage: session.targetLang });
        },

        /** Real session info — sourced entirely from CozyTranslate.getSession(). */
        getSessionInfo(sessionId) {
            const translate = _translate();
            const session = translate ? translate.getSession(sessionId) : null;
            if (!session) return null;
            return Object.freeze({
                sessionId: session.id, sourceLanguage: session.sourceLang, targetLanguage: session.targetLang,
                status: session.lifecycleState, startTime: new Date(session.createdAt).toISOString(),
                endTime: ["Stopped", "Archived"].includes(session.lifecycleState) ? new Date(session.updatedAt).toISOString() : null,
                durationMs: session.updatedAt - session.createdAt,
            });
        },

        listRecentTranslations(sessionId = null) {
            const items = sessionId ? _recentTranslations.filter(t => t.sessionId === sessionId) : _recentTranslations;
            return Object.freeze(items.slice());
        },

        /** Real statistics, sourced from CozyTranslate's own diagnostics/session storage — not a second history engine. */
        getStatistics(sessionId = null) {
            const translate = _translate();
            if (!translate) return Object.freeze({ totalSegments: 0, totalSessions: 0, recentTranslationsCached: _recentTranslations.length });
            const diagnostics = translate.getDiagnosticsReport ? translate.getDiagnosticsReport() : {};
            return Object.freeze({
                totalSessions: translate.countSessions ? translate.countSessions() : translate.listSessions().length,
                totalSegments: translate.countSegments ? translate.countSegments() : translate.listSegments().length,
                recentTranslationsCached: _recentTranslations.length,
                ...( sessionId ? { session: this.getSessionInfo(sessionId) } : {} ),
                coordinatorDiagnostics: diagnostics,
            });
        },
    };

    window.CozyOS.SpeechTranslationAdapter = Object.freeze(SpeechTranslationAdapter);

    // Milestone M263 - real fix: init() was defined ("Call once at
    // startup") but nothing anywhere in this repository ever called
    // it, leaving SpeechTranslationProviders permanently empty and
    // every translate() call honestly failing closed forever. Verified
    // init() is idempotent and takes no parameters before adding this
    // self-invocation - matches the self-sufficient IIFE pattern most
    // other real engines in this repo already use. Never blocks this
    // script's own execution; a real failure here is caught and does
    // not throw into the page.
    SpeechTranslationAdapter.init().catch((err) => {
        console.error("[SpeechTranslationAdapter] Real init() failed:", err && err.message ? err.message : err);
    });
})();
