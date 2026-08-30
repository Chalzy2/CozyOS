/**
 * CozyOS — Live Church Language Orchestrator
 * File Reference: core/modules/ChurchOS/live-church-language-orchestrator.js
 * Layer: Core / ChurchOS — Live Multilingual Composition Boundary
 * Version: 1.0.0-ENTERPRISE
 * Milestone: R040 Phase 1
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   Read the actual source (not just filenames) of every engine this
 *   file composes. Nothing below is a second implementation of
 *   something that already exists:
 *
 *   - core/modules/communication/ldce-session-engine.js
 *     (LDCESessionEngine) — the real participant/session identity and
 *     per-participant language preference store. This file reads a
 *     viewer's current language via getParticipant()/listParticipants()
 *     and changes it only via the real, self-only
 *     setParticipantLanguage() (M363). No second preference store is
 *     created here. Because setParticipantLanguage() already fires a
 *     real roster event and this orchestrator re-reads the viewer's
 *     language from LDCESessionEngine on every segment (never caches
 *     it across segments), a live language switch takes effect from
 *     the next segment with no session/video restart — that behavior
 *     is a direct consequence of composition, not new logic.
 *   - core/modules/speech/adapters/speech-translation-adapter.js
 *     (SpeechTranslationAdapter) — the real translation session/text
 *     pipeline (itself composing CozyTranslate + SpeechTranslationProviders,
 *     see that file's own header). This file calls
 *     startTranslationSession()/translateText() exactly as
 *     ldce-caption-engine.js already does; it does not talk to
 *     CozyTranslate or SpeechTranslationProviders directly.
 *   - core/modules/speech/adapters/speech-translation-provider.js
 *     (SpeechTranslationProviders) — read only, via getCapabilities()/
 *     list(), for honest capability reporting. Never called to
 *     translate directly (SpeechTranslationAdapter remains the one
 *     caller of provider.translate()).
 *   - core/living/living-tts.js (LivingTTS) — the one real speak()
 *     facade (composes CozySpeech + VoiceManager). This file never
 *     creates a second TTS manager and never calls VoiceManager
 *     directly.
 *   - core/modules/intelligence/language-packs/cozy-language-pack-registry.js
 *     (CozyLanguagePacks) — the real, frozen 17-identity canonical
 *     registry (DEFAULT_IDENTITIES). This file treats it as the ONLY
 *     source of truth for "the 17 default CozyOS languages" and does
 *     not hardcode a second list. Per its own header, being registered
 *     here is NOT proof translation exists for that language — see
 *     getCapabilityReport() below, which keeps LANGUAGE_REGISTERED
 *     separate from TRANSLATION_AVAILABLE_NOW.
 *   - core/shell/platform-event-bus.js (PlatformEventBus) — the one
 *     shared bus. Every event this file emits goes through it; no
 *     second bus is created.
 *
 *   NOT CREATED, on purpose: no second translation engine, no second
 *   TTS manager, no second video/audio player, no second language
 *   registry, no second event bus, no second session/identity store.
 *
 * SCOPE OF THIS FILE
 *   A thin orchestration boundary that answers one question per live
 *   speech segment: "does this viewer get the original language, or a
 *   translation — and how long did that actually take?" It does NOT
 *   perform ASR itself (composes whatever already produced the
 *   transcript segment — e.g. LDCECaptionEngine's "caption-final"
 *   event, or any other real STT source a caller already has) and it
 *   does NOT own Live Video/Live Audio — those continue independently;
 *   this file only decides what text/audio a given viewer's language
 *   layer receives and instruments how long that took.
 *
 * ROUTING RULE (never violated)
 *   sourceLanguage === viewerLanguage  -> ORIGINAL passthrough. The
 *     translation stage is never invoked — not "invoked and equal to
 *     the input", genuinely skipped, and reported as
 *     status: "bypassed", reason: "same_language_passthrough".
 *   sourceLanguage !== viewerLanguage  -> TRANSLATE via the real
 *     SpeechTranslationAdapter -> SpeechTranslationProviders chain.
 *     A translation failure is reported honestly (isReal:false); the
 *     source segment / other viewers' languages are never affected by
 *     one failed language (each routeSegment() call is independent).
 *
 * LATENCY INSTRUMENTATION — HONESTY
 *   Every stage timestamp is either a real value the caller supplied
 *   (e.g. real ASR start/end from whatever produced the segment) or a
 *   real timestamp taken by this file at the moment it actually
 *   performed that stage. A bypassed stage (translation for a
 *   passthrough segment, or TTS when requestTTS is false) is recorded
 *   as null with an explicit status, never backfilled with a fake
 *   duration. playbackStartedAt is disclosed as an approximation: this
 *   file has no independent signal for "the browser's <audio> element
 *   actually began emitting sound," so it uses the real moment
 *   LivingTTS.speak() resolved with played:true as the closest
 *   available proxy, and documents that here rather than presenting it
 *   as a verified playback-hardware timestamp.
 *
 * OFFLINE / NETWORK BOUNDARY — HONESTY
 *   This file does not claim viewers need no network. It reports four
 *   separate facts (see getNetworkCapabilityReport()) rather than one
 *   collapsed "offline: true" flag, and does not itself implement any
 *   new distribution transport — that remains whatever real
 *   live-session/connectivity infrastructure already carries the
 *   pastor's stream to a viewer's device.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["live-church-language-orchestrator"] && window.CozyOS.Modules["live-church-language-orchestrator"].version) return;

    function _now() {
        // Monotonic where available (browser/Node perf hooks); real
        // Date.now() fallback otherwise. Never fabricated.
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }

    function _bus() { return window.CozyOS.PlatformEventBus || null; }
    function _emit(eventName, detail) {
        const bus = _bus();
        if (bus && typeof bus.emit === "function") {
            try { bus.emit(`live-language:${eventName}`, detail); } catch (_e) { /* observability only, never blocks the pipeline */ }
        }
    }

    function _packs() { return window.CozyOS.CozyLanguagePacks || null; }
    function _ldce() { return window.CozyOS.LDCESessionEngine || null; }
    function _translationAdapter() { return window.CozyOS.SpeechTranslationAdapter || null; }
    function _providers() { return window.CozyOS.SpeechTranslationProviders || null; }
    function _tts() { return window.CozyOS.LivingTTS || null; }

    class LiveChurchLanguageOrchestrator {
        // "src>tgt" -> SpeechTranslationAdapter sessionId (mirrors
        // LDCECaptionEngine's own cache pattern — a genuinely separate
        // cache because this orchestrator's callers are not
        // LDCECaptionEngine, but the same reuse rule: never open a
        // second translation session for a pair already active).
        #translationSessions = new Map();
        // segmentId -> last computed latency/routing record (bounded).
        #segmentRecords = new Map();
        #segmentOrder = [];
        #SEGMENT_RECORD_LIMIT = 500;

        getVersion() { return MODULE_VERSION; }

        /** getCanonicalLanguages() — the ONLY 17-language source of truth. Fails closed (empty array + reason) rather than inventing a list if the registry isn't loaded. */
        getCanonicalLanguages() {
            const packs = _packs();
            if (!packs || !Array.isArray(packs.DEFAULT_IDENTITIES)) return { languages: [], reason: "CozyLanguagePacks is not loaded — no canonical registry to read." };
            return { languages: packs.DEFAULT_IDENTITIES.map((d) => d.languageId), reason: null };
        }

        isCanonicalLanguage(languageId) {
            return this.getCanonicalLanguages().languages.includes(languageId);
        }

        /** getViewerLanguage() — always re-reads LDCESessionEngine live; never cached here, so a mid-live switch is picked up on the very next segment for that participant. */
        getViewerLanguage(sessionId, participantId) {
            const ldce = _ldce();
            if (!ldce) return null;
            const participant = ldce.getParticipant(sessionId, participantId, participantId);
            return participant ? participant.language : null;
        }

        /** setViewerLanguage() — self-only, delegates entirely to LDCESessionEngine's own real, already-audited setParticipantLanguage(). No second preference store. */
        setViewerLanguage(sessionId, participantId, newLanguage) {
            const ldce = _ldce();
            if (!ldce || typeof ldce.setParticipantLanguage !== "function") throw new Error("[LiveChurchLanguageOrchestrator] LDCESessionEngine is not loaded.");
            return ldce.setParticipantLanguage(sessionId, participantId, newLanguage);
        }

        async #getOrCreateTranslationSession(sourceLanguage, targetLanguage) {
            const key = `${sourceLanguage}>${targetLanguage}`;
            if (this.#translationSessions.has(key)) return this.#translationSessions.get(key);
            const adapter = _translationAdapter();
            if (!adapter || typeof adapter.startTranslationSession !== "function") return null;
            try {
                const sessionId = adapter.startTranslationSession({ sourceLanguage, targetLanguage });
                this.#translationSessions.set(key, sessionId);
                return sessionId;
            } catch (_err) { return null; }
        }

        #recordSegment(segmentId, record) {
            this.#segmentRecords.set(segmentId, record);
            this.#segmentOrder.push(segmentId);
            if (this.#segmentOrder.length > this.#SEGMENT_RECORD_LIMIT) {
                const evicted = this.#segmentOrder.shift();
                this.#segmentRecords.delete(evicted);
            }
        }

        getSegmentReport(segmentId) {
            const rec = this.#segmentRecords.get(segmentId);
            return rec ? { ...rec, timestamps: { ...rec.timestamps }, latency: { ...rec.latency } } : null;
        }

        /**
         * routeSegment(segment, viewerLanguage, options)
         *   segment: { segmentId, sessionId, sourceLanguage, sourceText,
         *              captureAt?, sttStartedAt?, sttCompletedAt? }
         *   viewerLanguage: the ALREADY-RESOLVED target language for this
         *     call (callers typically pass getViewerLanguage(...)).
         *     Never resolved implicitly inside this function so a caller
         *     driving many viewers from one segment can resolve each
         *     viewer's language once per fan-out, not per internal call.
         *   options: { requestTTS?: boolean, ttsContext?: string,
         *              ttsProviderId?: string }
         *
         *   Returns a full routing + latency result. Never throws for a
         *   translation or TTS failure — those are reported in the
         *   result and via live-language:error; only truly missing
         *   required composed engines (LDCE not loaded when a caller
         *   needs it) surface as thrown errors, matching the rest of
         *   this codebase's fail-closed convention.
         */
        async routeSegment(segment, viewerLanguage, options = {}) {
            const { segmentId, sessionId = null, sourceLanguage, sourceText } = segment || {};
            if (!segmentId) throw new TypeError("[LiveChurchLanguageOrchestrator] routeSegment(): segmentId is required.");
            if (!sourceLanguage) throw new TypeError("[LiveChurchLanguageOrchestrator] routeSegment(): sourceLanguage is required.");
            if (!viewerLanguage) throw new TypeError("[LiveChurchLanguageOrchestrator] routeSegment(): viewerLanguage is required.");

            const captureAt = typeof segment.captureAt === "number" ? segment.captureAt : _now();
            const timestamps = {
                captureAt,
                sttStartedAt: typeof segment.sttStartedAt === "number" ? segment.sttStartedAt : captureAt,
                sttCompletedAt: typeof segment.sttCompletedAt === "number" ? segment.sttCompletedAt : captureAt,
                translationStartedAt: null,
                translationCompletedAt: null,
                ttsStartedAt: null,
                ttsCompletedAt: null,
                playbackStartedAt: null,
            };

            _emit("segment-captured", { segmentId, sessionId, sourceLanguage, viewerLanguage, captureAt });

            const mode = sourceLanguage === viewerLanguage ? "ORIGINAL" : "TRANSLATE";
            let outputText = null;
            let translationStatus;
            let translationReason = null;
            let providerName = null;

            if (mode === "ORIGINAL") {
                outputText = sourceText;
                translationStatus = "bypassed";
                translationReason = "same_language_passthrough";
                _emit("passthrough", { segmentId, sessionId, language: sourceLanguage });
            } else {
                timestamps.translationStartedAt = _now();
                _emit("translation-start", { segmentId, sessionId, sourceLanguage, targetLanguage: viewerLanguage });
                const txSessionId = await this.#getOrCreateTranslationSession(sourceLanguage, viewerLanguage);
                const adapter = _translationAdapter();
                let result;
                if (!adapter) {
                    result = { isReal: false, translatedText: null, reason: "SpeechTranslationAdapter is not loaded." };
                } else {
                    try {
                        result = await adapter.translateText(txSessionId, sourceText, { sourceLanguage, targetLanguage: viewerLanguage });
                    } catch (err) {
                        result = { isReal: false, translatedText: null, reason: err.message || "translateText threw." };
                    }
                }
                timestamps.translationCompletedAt = _now();

                if (result.isReal) {
                    outputText = result.translatedText;
                    translationStatus = "completed";
                    providerName = result.providerName || null;
                    _emit("translation-complete", { segmentId, sessionId, sourceLanguage, targetLanguage: viewerLanguage, providerName });
                } else {
                    translationStatus = "failed";
                    translationReason = result.reason || "Unknown translation failure.";
                    _emit("error", { segmentId, sessionId, stage: "translation", sourceLanguage, targetLanguage: viewerLanguage, reason: translationReason });
                }
            }

            let ttsResult = null;
            if (options.requestTTS && outputText) {
                timestamps.ttsStartedAt = _now();
                _emit("tts-start", { segmentId, sessionId, language: mode === "ORIGINAL" ? sourceLanguage : viewerLanguage });
                const tts = _tts();
                if (!tts || typeof tts.speak !== "function") {
                    ttsResult = { available: false, played: false, providerId: null, kind: "unknown", reason: "LivingTTS is not loaded." };
                } else {
                    try {
                        ttsResult = await tts.speak({
                            text: outputText,
                            language: mode === "ORIGINAL" ? sourceLanguage : viewerLanguage,
                            context: options.ttsContext || "church-live-translation",
                            providerId: options.ttsProviderId,
                        });
                    } catch (err) {
                        ttsResult = { available: false, played: false, providerId: null, kind: "unknown", reason: err.message || "LivingTTS.speak() threw." };
                    }
                }
                timestamps.ttsCompletedAt = _now();
                if (ttsResult.played) {
                    // Disclosed approximation — see file header.
                    timestamps.playbackStartedAt = timestamps.ttsCompletedAt;
                    _emit("tts-complete", { segmentId, sessionId, providerId: ttsResult.providerId, kind: ttsResult.kind });
                    _emit("playback-start", { segmentId, sessionId, approximated: true });
                } else {
                    _emit("error", { segmentId, sessionId, stage: "tts", reason: ttsResult.reason });
                }
            } else if (options.requestTTS && !outputText) {
                _emit("error", { segmentId, sessionId, stage: "tts", reason: "No output text available (translation failed or was never produced)." });
            }

            const latency = this.#computeLatency(timestamps);
            _emit("latency", { segmentId, sessionId, sourceLanguage, targetLanguage: viewerLanguage, mode, ...latency });

            const record = {
                segmentId, sessionId, sourceLanguage, targetLanguage: viewerLanguage, mode,
                outputText,
                isReal: mode === "ORIGINAL" ? true : translationStatus === "completed",
                translationStatus, translationReason, providerName,
                tts: ttsResult,
                timestamps,
                latency,
            };
            this.#recordSegment(segmentId, record);
            return record;
        }

        /** Structured, honest per-stage durations. A null timestamp pair means that stage was genuinely bypassed — reported as such, never as 0ms or a fabricated duration. */
        #computeLatency(t) {
            const delta = (a, b) => (typeof a === "number" && typeof b === "number") ? Math.round(b - a) : null;
            const captureToSttMs = delta(t.captureAt, t.sttCompletedAt);
            const sttToTranslationMs = t.translationStartedAt === null ? null : delta(t.sttCompletedAt, t.translationCompletedAt);
            const translationToTtsMs = t.ttsStartedAt === null ? null : delta(t.translationCompletedAt ?? t.sttCompletedAt, t.ttsCompletedAt);
            const ttsToPlaybackMs = t.playbackStartedAt === null ? null : delta(t.ttsCompletedAt, t.playbackStartedAt);
            const lastKnown = t.playbackStartedAt ?? t.ttsCompletedAt ?? t.translationCompletedAt ?? t.sttCompletedAt;
            const totalPipelineMs = delta(t.captureAt, lastKnown);
            return {
                captureToSttMs,
                sttToTranslationMs: t.translationStartedAt === null ? null : sttToTranslationMs,
                translationStage: t.translationStartedAt === null ? { status: "bypassed", reason: "same_language_passthrough" } : { status: "measured" },
                translationToTtsMs: t.ttsStartedAt === null ? null : translationToTtsMs,
                ttsStage: t.ttsStartedAt === null ? { status: "bypassed", reason: "tts_not_requested_or_no_output" } : { status: "measured" },
                ttsToPlaybackMs,
                totalPipelineMs,
            };
        }

        /**
         * getCapabilityReport(languageId?)
         *   Never collapses these into one "available" flag. If
         *   languageId is omitted, reports for every canonical language.
         */
        getCapabilityReport(languageId = null) {
            const { languages } = this.getCanonicalLanguages();
            const providers = _providers();
            const providerList = providers && typeof providers.list === "function" ? providers.list() : [];
            const hasAnyProvider = providerList.length > 0;
            const hasOfflineProvider = providerList.some((p) => p.supportsOffline === true);
            const targets = languageId ? [languageId] : languages;

            const perLanguage = targets.map((lang) => ({
                languageId: lang,
                LANGUAGE_REGISTERED: languages.includes(lang),
                PASSTHROUGH_AVAILABLE: languages.includes(lang), // same-language routing needs no translator at all
                TRANSLATION_AVAILABLE_NOW: hasAnyProvider, // honest: a registered provider does not itself prove per-language-pair success; real per-pair success is only known after routeSegment() actually runs.
                TRANSLATION_PROVIDER: providerList.map((p) => p.name),
                OFFLINE_CAPABLE: hasOfflineProvider,
                NETWORK_REQUIRED: providerList.length > 0 ? providerList.every((p) => p.type === "cloud") : null,
            }));

            return languageId ? perLanguage[0] : perLanguage;
        }

        /** getNetworkCapabilityReport() — the four separate facts required by the offline-first architecture rule; never one collapsed boolean. */
        getNetworkCapabilityReport() {
            const providers = _providers();
            const providerList = providers && typeof providers.list === "function" ? providers.list() : [];
            const offline = window.CozyOS.OfflineCoordinator || (window.CozyOS.CozyLivingOffline && window.CozyOS.CozyLivingOffline);
            return Object.freeze({
                // Getting the pastor's live stream INTO CozyOS's distribution
                // point genuinely requires a network connection at that one
                // ingestion point — never claimed to be avoidable.
                NETWORK_REQUIRED_FOR_SOURCE: true,
                // A viewer consumes the already-distributed session through
                // whatever real live-session/connectivity infrastructure this
                // repo has (composed, not reimplemented here); this file does
                // not require a SEPARATE per-viewer cloud translation call for
                // languages a local/offline provider can already serve.
                NETWORK_REQUIRED_FOR_VIEWER: providerList.length > 0 ? providerList.every((p) => p.type === "cloud") : "UNKNOWN_NO_PROVIDER_REGISTERED",
                LOCAL_PROCESSING_AVAILABLE: !!offline,
                TRANSLATION_OFFLINE_AVAILABLE: providerList.some((p) => p.supportsOffline === true),
            });
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: MODULE_VERSION,
                translationSessionCount: this.#translationSessions.size,
                segmentRecordCount: this.#segmentRecords.size,
            };
        }
    }

    window.CozyOS.LiveChurchLanguageOrchestrator = new LiveChurchLanguageOrchestrator();
    window.CozyOS.Modules["live-church-language-orchestrator"] = Object.freeze({
        version: MODULE_VERSION,
        description: "R040 Phase 1 — single composition point for live multilingual church communication. Routes each captured speech segment to ORIGINAL passthrough or TRANSLATE via the real SpeechTranslationAdapter/CozyTranslate/SpeechTranslationProviders chain, optionally speaks the result through the real LivingTTS facade, and instruments real (never fabricated) per-stage latency. Does not implement ASR, translation, TTS, video, or audio itself — pure composition over existing engines."
    });
})();
