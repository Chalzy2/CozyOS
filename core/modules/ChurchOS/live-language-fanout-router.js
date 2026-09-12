/**
 * CozyOS — Live Language Fan-Out Router
 * File Reference: core/modules/ChurchOS/live-language-fanout-router.js
 * Layer: Core / ChurchOS — Live Multilingual Composition Boundary
 * Version: 1.0.0
 * Milestone: R040 Phase 2
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   - core/modules/ChurchOS/live-church-language-orchestrator.js
 *     (LiveChurchLanguageOrchestrator, Phase 1) — the real per-(segment,
 *     viewer-language) routing/translation/TTS/latency engine. This file
 *     is UNMODIFIED by Phase 2 and is called exactly as Phase 1 designed
 *     it to be called: once per distinct target language actually
 *     needed for a segment, never once per viewer. This router does not
 *     reimplement translation, TTS, or latency instrumentation — it
 *     only decides HOW MANY TIMES to call routeSegment() and to WHOM the
 *     result goes.
 *   - core/modules/communication/ldce-session-engine.js (LDCESessionEngine)
 *     — the one real roster/language-preference store, read via
 *     getParticipant()/listParticipants() exactly as the orchestrator
 *     itself reads it. No second preference store.
 *   - core/modules/ChurchOS/live-translation-result-cache.js
 *     (LiveTranslationResultCache, this milestone) — the one real
 *     dedupe layer. Composed, not reimplemented here.
 *   - core/modules/ChurchOS/live-viewer-telemetry.js
 *     (LiveViewerTelemetry, this milestone) — per-viewer delivery/
 *     latency recording. Composed, not reimplemented here.
 *   - core/shell/live/cozy-live-distribution-transport.js
 *     (CozyLiveDistributionTransport, this milestone) — the one real
 *     publish/fan-out transport. This file calls publishSource() exactly
 *     once per segment (the "one physical publish" to the session) and
 *     separately emits one per-viewer delivery event per distinct
 *     language group — the transport is not asked to understand
 *     language at all, matching the mission's explicit instruction to
 *     keep language routing and distribution/transport as separate
 *     concerns.
 *   - core/shell/platform-event-bus.js (PlatformEventBus) — the one
 *     shared bus. No second bus created.
 *
 *   NOT CREATED, on purpose: no second translation session, no second
 *   TTS manager, no second roster, no second transport, no second cache.
 *
 * FAN-OUT ALGORITHM (Section 3/6 of the R040 Phase 2 brief)
 *   1. Resolve the set of viewers currently connected to this session
 *      (from the distribution transport's real joined-viewer list).
 *   2. For each viewer, resolve their CURRENT language from LDCE
 *      (never cached across segments here either — mirrors Phase 1's
 *      own re-read-every-segment behavior so a mid-live language switch
 *      is honored on the very next segment for that viewer only).
 *   3. Group viewers by resolved language. One group per distinct
 *      language, regardless of how many viewers share it.
 *   4. For each group: check LiveTranslationResultCache first
 *      (session+segment+sourceLanguage+targetLanguage). On a hit, reuse
 *      the cached text/audio and emit live-language:cache-hit. On a
 *      miss, call orchestrator.routeSegment() exactly once for that
 *      language, store the result in the cache, and emit
 *      live-language:cache-miss.
 *   5. Deliver the group's single result to every viewer in that group
 *      via a per-viewer live-language:delivery event and
 *      LiveViewerTelemetry.recordSegmentDelivered().
 *   One viewer's translation/TTS failure never affects another viewer
 *   or another language group — each group is handled independently and
 *   a thrown/failed group is caught and reported via live-language:error
 *   without aborting the remaining groups (Section: "one viewer failure
 *   does not terminate others").
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["live-language-fanout-router"] && window.CozyOS.Modules["live-language-fanout-router"].version) return;

    function _now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        return Date.now();
    }
    function _bus() { return window.CozyOS.PlatformEventBus || null; }
    function _emit(eventName, detail) {
        const bus = _bus();
        if (bus && typeof bus.emit === "function") {
            try { bus.emit(eventName, detail); } catch (_e) { /* observability only, never blocks the pipeline */ }
        }
    }

    function _orchestrator() { return window.CozyOS.LiveChurchLanguageOrchestrator || null; }
    function _ldce() { return window.CozyOS.LDCESessionEngine || null; }
    function _cache() { return window.CozyOS.LiveTranslationResultCache || null; }
    function _telemetry() { return window.CozyOS.LiveViewerTelemetry || null; }
    function _transport() { return window.CozyOS.CozyLiveDistributionTransport || null; }

    class LiveLanguageFanoutRouter {
        getVersion() { return MODULE_VERSION; }

        /**
         * publishSegment(sessionId, segment, options)
         *   segment: same shape LiveChurchLanguageOrchestrator.routeSegment()
         *     accepts: { segmentId, sourceLanguage, sourceText, captureAt?, ... }
         *   options: { requestTTS?, ttsContext?, ttsProviderId?, voiceProfile? }
         *
         *   Returns { segmentId, groups: [{ language, viewerIds, result, cacheHit }], errors: [...] }
         */
        async publishSegment(sessionId, segment, options = {}) {
            const { segmentId, sourceLanguage } = segment || {};
            if (!sessionId) throw new TypeError("[LiveLanguageFanoutRouter] publishSegment(): sessionId is required.");
            if (!segmentId) throw new TypeError("[LiveLanguageFanoutRouter] publishSegment(): segment.segmentId is required.");
            if (!sourceLanguage) throw new TypeError("[LiveLanguageFanoutRouter] publishSegment(): segment.sourceLanguage is required.");

            const orchestrator = _orchestrator();
            if (!orchestrator) throw new Error("[LiveLanguageFanoutRouter] LiveChurchLanguageOrchestrator is not loaded.");
            const ldce = _ldce();
            if (!ldce) throw new Error("[LiveLanguageFanoutRouter] LDCESessionEngine is not loaded.");

            const transport = _transport();
            const viewerIds = transport ? transport.listViewers(sessionId) : [];

            // Group connected viewers by their CURRENT (re-read every call) language.
            const groupsByLanguage = new Map(); // language -> [viewerId, ...]
            for (const viewerId of viewerIds) {
                const language = orchestrator.getViewerLanguage(sessionId, viewerId);
                if (!language) continue; // viewer not resolvable in LDCE right now — skip honestly, do not guess
                if (!groupsByLanguage.has(language)) groupsByLanguage.set(language, []);
                groupsByLanguage.get(language).push(viewerId);
            }

            // One physical publish to the session-level transport per segment,
            // independent of how many language groups exist.
            if (transport) transport.publishSource(sessionId, segment);

            const cache = _cache();
            const telemetry = _telemetry();
            const groups = [];
            const errors = [];

            for (const [language, viewersInGroup] of groupsByLanguage.entries()) {
                try {
                    let result;
                    let cacheHit = false;

                    if (cache) {
                        const cached = cache.getTranslation({ sessionId, segmentId, sourceLanguage, targetLanguage: language });
                        if (cached.hit) {
                            cacheHit = true;
                            result = {
                                segmentId, sessionId, sourceLanguage, targetLanguage: language,
                                mode: sourceLanguage === language ? "ORIGINAL" : "TRANSLATE",
                                outputText: cached.value.translatedText,
                                isReal: cached.value.isReal,
                                translationStatus: "cached",
                                providerName: cached.value.providerName,
                                fromCache: true,
                            };
                            _emit("live-language:cache-hit", { segmentId, sessionId, sourceLanguage, targetLanguage: language, viewerCount: viewersInGroup.length });
                        }
                    }

                    if (!cacheHit) {
                        result = await orchestrator.routeSegment(segment, language, options);
                        if (cache) {
                            cache.setTranslation({ sessionId, segmentId, sourceLanguage, targetLanguage: language }, {
                                translatedText: result.outputText,
                                providerName: result.providerName,
                                isReal: result.isReal,
                            });
                            if (result.tts && result.tts.played) {
                                cache.setAudio({ sessionId, segmentId, sourceLanguage, targetLanguage: language }, options.voiceProfile || null, result.tts);
                            }
                        }
                        _emit("live-language:cache-miss", { segmentId, sessionId, sourceLanguage, targetLanguage: language, viewerCount: viewersInGroup.length });
                    }

                    const deliveredAt = _now();
                    for (const viewerId of viewersInGroup) {
                        _emit("live-language:delivery", { sessionId, segmentId, viewerId, language, mode: result.mode, outputText: result.outputText, fromCache: cacheHit, deliveredAt });
                        if (telemetry) telemetry.recordSegmentDelivered(sessionId, viewerId, segmentId);
                        if (transport) transport.heartbeat(sessionId, viewerId);
                    }
                    // R040 Phase 3E: carry this language group's already-computed
                    // result over the wire to any transport provider that can
                    // actually reach a remote viewer with it (feature-detected —
                    // never fabricated for local-relay, which already delivers
                    // this same result to in-process listeners via the
                    // live-language:delivery emit above).
                    if (transport && typeof transport.deliverTranslatedSegment === "function") {
                        const dispatch = transport.deliverTranslatedSegment(sessionId, viewersInGroup, {
                            segmentId, sourceLanguage, language, mode: result.mode,
                            outputText: result.outputText, isReal: result.isReal, providerName: result.providerName,
                        });
                        if (dispatch && dispatch.success === false && dispatch.reason && !/does not support/.test(dispatch.reason)) {
                            _emit("live-language:error", { sessionId, segmentId, stage: "translated-delivery", targetLanguage: language, reason: dispatch.reason });
                        }
                    }
                    _emit("live-distribution:segment-delivered", { sessionId, segmentId, language, viewerCount: viewersInGroup.length, fromCache: cacheHit });

                    groups.push({ language, viewerIds: viewersInGroup.slice(), result, cacheHit });
                } catch (err) {
                    // One language group's failure must never abort the others.
                    const reason = (err && err.message) || "Unknown fan-out group failure.";
                    errors.push({ language, viewerIds: viewersInGroup.slice(), reason });
                    _emit("live-language:error", { sessionId, segmentId, stage: "fanout-group", targetLanguage: language, reason });
                }
            }

            return { segmentId, sessionId, groups, errors };
        }

        /** joinViewer() — thin composition: transport.joinViewer() + telemetry.ensureViewer(). Language itself is NOT set here — that remains LDCE's own joinSession()/setParticipantLanguage(), never duplicated. */
        joinViewer(sessionId, viewerId) {
            const transport = _transport();
            const telemetry = _telemetry();
            const result = transport ? transport.joinViewer(sessionId, viewerId) : { success: false, reason: "Transport not loaded." };
            if (result.success && telemetry) telemetry.ensureViewer(sessionId, viewerId);
            return result;
        }

        leaveViewer(sessionId, viewerId) {
            const transport = _transport();
            const telemetry = _telemetry();
            const result = transport ? transport.leaveViewer(sessionId, viewerId) : { success: false, reason: "Transport not loaded." };
            if (telemetry) telemetry.removeViewer(sessionId, viewerId);
            return result;
        }

        /** changeViewerLanguage() — self-only, delegates entirely to the orchestrator's own setViewerLanguage() (which itself delegates to LDCE). Records the change in telemetry only; never a second preference store. Does not restart the source or affect any other viewer — the very next publishSegment() call re-reads this viewer's language from LDCE. */
        changeViewerLanguage(sessionId, viewerId, newLanguage) {
            const orchestrator = _orchestrator();
            if (!orchestrator) throw new Error("[LiveLanguageFanoutRouter] LiveChurchLanguageOrchestrator is not loaded.");
            const result = orchestrator.setViewerLanguage(sessionId, viewerId, newLanguage);
            const telemetry = _telemetry();
            if (result && result.success && telemetry) telemetry.recordLanguageChange(sessionId, viewerId);
            return result;
        }

        getDiagnosticsReport() {
            return { moduleVersion: MODULE_VERSION };
        }
    }

    window.CozyOS.LiveLanguageFanoutRouter = new LiveLanguageFanoutRouter();
    window.CozyOS.Modules["live-language-fanout-router"] = Object.freeze({
        version: MODULE_VERSION,
        description: "R040 Phase 2 — one source segment fanned out to every distinct connected-viewer language exactly once (never once per viewer), reusing the Phase 1 orchestrator, this milestone's translation/TTS cache, viewer telemetry, and distribution transport. Composition only; no second translation/TTS/roster/transport engine.",
    });
})();
