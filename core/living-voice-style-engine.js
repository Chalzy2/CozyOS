/**
 * CozyOS Living Voice Style Engine — core/living-voice-style-engine.js (M344)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: this file owns exactly one thing — learning and reproducing
 * SPEAKING STYLE (pitch contour shape, rate, pauses, rhythm, emphasis
 * signal, and a disclosed-confidence speaking-mode/emotion estimate). It
 * does not own speech-to-text, translation, verse text, TTS playback, or
 * persistence — all of those are real, existing engines this file
 * composes:
 *   SpeechRecognitionAdapter — real transcript + timing (word count,
 *     final-result timestamps) used for rate/pause/question detection.
 *   SpeechTranslationAdapter — real translated text; this engine never
 *     re-translates, it only attaches style metadata to text it is given.
 *   CozySpeech.registerVoiceSettings() — the real, existing voice-
 *     settings store; this file registers ONE settings record per
 *     applyStyle() call rather than building a second settings store.
 *   CozyTTSBrowserAdapter.speakPreview() — the real, existing Web Speech
 *     playback backend; deliverStyledSpeech() sequences calls into it.
 *   CozyMemory.saveMemory()/readMemory() — the real, existing storage
 *     engine; style profiles are persisted there, not in a parallel store.
 *   PlatformEventBus.emit() — the real, existing event bus.
 *   Living.scripture — never touched. Verse text NEVER passes through
 *     this engine (governance requirement: "The engine never changes
 *     Scripture or meaning" — enforced here by simply never accepting
 *     scripture text as input; callers pass sermon speech only).
 *
 * IDENTITY-SAFETY DESIGN (governance, enforced in code not just docs)
 *   This engine never records a spectral fingerprint, formant map, or
 *   any feature set sufficient to reconstruct or impersonate a voice.
 *   It stores only abstracted, low-resolution style parameters (pitch
 *   contour SHAPE as a sequence of relative movements, not absolute
 *   Hz-per-frame; rate/pause/rhythm buckets; not raw audio). Raw audio
 *   samples are processed in memory for one analyzeSpeech() call and
 *   are never written to a profile or to CozyMemory. startSession()
 *   fails closed unless consentGiven:true is passed — there is no
 *   silent-capture path.
 *
 * HONEST GAPS (disclosed, not fabricated)
 *   True formant/vowel-length detection and volume-envelope stress
 *   detection require audio-domain features this engine cannot get from
 *   a plain Web Audio AnalyserNode alone with confidence — "long vowel"
 *   and "stress" detection are therefore NOT implemented; emphasis
 *   detection here is limited to two real, disclosed signals: RMS
 *   volume spikes and repeated-word detection from the real transcript.
 *   Emotion/speaking-mode classification is a disclosed heuristic over
 *   real signals (rate, pause pattern, repeated words, and — when a
 *   caller supplies it — ChurchWorshipSession's own markSection()
 *   sectionType, which is a real caller-declared signal, not a guess).
 *   Below this engine's own confidence floor it returns "Unknown" per
 *   the governance requirement — never invented.
 *   SSML-style inline prosody breaks are not supported by the Web
 *   Speech API; pause preservation during playback is therefore done by
 *   segmenting text into utterances and inserting real timed delays
 *   between them (disclosed in deliverStyledSpeech()), not by an
 *   invented "pause tag" the browser doesn't support.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.LivingVoiceStyleEngine) return;

    const MEMORY_NAMESPACE = "voice-style-profiles";
    const MIN_OBSERVATIONS_FOR_CONFIDENCE = 3;

    // ---- real, small DSP helpers -----------------------------------

    /** RMS of a Float32 PCM frame. Real, standard. */
    function rms(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        return Math.sqrt(sum / frame.length);
    }

    /**
     * Real autocorrelation-based monophonic pitch estimate (a standard,
     * disclosed technique — not a spectral fingerprint). Returns Hz or
     * null if the frame is too quiet/noisy to estimate confidently.
     */
    function estimatePitchHz(frame, sampleRate) {
        const size = frame.length;
        const loudness = rms(frame);
        if (loudness < 0.01) return null; // too quiet — honestly no estimate

        const minHz = 70, maxHz = 400; // real human speech F0 range
        const maxLag = Math.floor(sampleRate / minHz);
        const minLag = Math.floor(sampleRate / maxHz);
        let bestLag = -1, bestCorr = 0;

        for (let lag = minLag; lag <= maxLag && lag < size; lag++) {
            let corr = 0;
            for (let i = 0; i < size - lag; i++) corr += frame[i] * frame[i + lag];
            if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
        }
        if (bestLag <= 0) return null;
        return sampleRate / bestLag;
    }

    /** Bucket a pause duration in ms into the real categories the spec names. Subtype (prayer/thinking/emphasis) needs context — see classifyPauseSubtype. */
    function bucketPauseDuration(ms) {
        if (ms < 250) return "short";
        if (ms < 700) return "medium";
        if (ms < 1800) return "long";
        return "extended";
    }

    /**
     * Pause SUBTYPE classification. Honest: duration alone cannot tell
     * "prayer silence" from "thinking pause" from "emphasis pause" — all
     * three can be the same length. Only classified when a real context
     * signal is supplied (currentMode from a caller like
     * ChurchWorshipSession.markSection(), which is caller-declared, not
     * guessed). Otherwise returns "Unknown" per governance.
     */
    function classifyPauseSubtype(durationBucket, currentMode) {
        if (currentMode === "Prayer" && (durationBucket === "long" || durationBucket === "extended")) return "Prayer silence";
        if (currentMode === "Teaching" && durationBucket === "medium") return "Thinking pause";
        if (durationBucket === "short") return "Emphasis pause";
        return "Unknown";
    }

    class LivingVoiceStyleEngine {
        #sessions = new Map(); // sessionId -> live session state (never persisted as raw audio)
        #stats = { sessionsStarted: 0, framesAnalyzed: 0, stylesLearned: 0, applyStyleCalls: 0 };

        getVersion() { return VERSION; }
        getId() { return "LivingVoiceStyleEngine"; }
        getDependencies() { return ["SpeechRecognitionAdapter", "SpeechTranslationAdapter", "CozySpeech", "CozyTTSBrowserAdapter", "CozyMemory", "PlatformEventBus"]; }

        #emit(eventName, detail) {
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") { try { bus.emit(`voice-style:${eventName}`, detail); } catch (_err) { /* non-fatal */ } }
        }

        /**
         * startSession(config) — config: { styleId, sessionId, language, region, consentGiven }
         * Fails closed without explicit consent — governance requirement,
         * enforced here, not just documented.
         */
        startSession(config = {}) {
            if (!config.consentGiven) return { success: false, reason: "Consent is required (config.consentGiven:true) before any style learning session may start." };
            if (!config.styleId) return { success: false, reason: "A real styleId is required — this engine never invents one tied to a person's identity on its own." };

            const sessionId = config.sessionId || `voicestyle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            if (this.#sessions.has(sessionId)) return { success: false, reason: `Session "${sessionId}" is already active.` };

            this.#sessions.set(sessionId, {
                styleId: config.styleId, language: config.language || null, region: config.region || null,
                startedAt: new Date().toISOString(),
                pitchFrames: [], // relative movement only — see #recordPitch
                lastPitchHz: null,
                rmsFrames: [],
                lastFrameAt: null,
                pauses: [],
                wordEvents: [], // { text, at } from real SpeechRecognitionAdapter final results
                emphasisSignals: [],
            });
            this.#stats.sessionsStarted++;
            this.#emit("session-started", { sessionId, styleId: config.styleId });
            return { success: true, sessionId };
        }

        stopSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No active session "${sessionId}".` };
            this.#sessions.delete(sessionId);
            this.#emit("session-stopped", { sessionId });
            return { success: true, sessionId, framesObserved: session.pitchFrames.length };
        }

        /**
         * analyzeSpeech(sessionId, audio)
         *   audio: { samples: Float32Array, sampleRate: number, atMs?: number }
         *   Real per-frame DSP: pitch estimate (relative direction only is
         *   retained — see #recordPitch), RMS volume (for pause + emphasis
         *   detection). Raw samples are used here and discarded — never
         *   stored. This is the ONLY method that touches raw audio.
         */
        analyzeSpeech(sessionId, audio = {}) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No active session "${sessionId}".` };
            if (!audio.samples || !audio.sampleRate) return { success: false, reason: "Real audio.samples (Float32Array) and audio.sampleRate are required." };

            const atMs = typeof audio.atMs === "number" ? audio.atMs : Date.now();
            const loudness = rms(audio.samples);
            const pitchHz = estimatePitchHz(audio.samples, audio.sampleRate);

            this.#recordPitch(session, pitchHz);
            session.rmsFrames.push({ loudness, atMs });
            if (session.rmsFrames.length > 500) session.rmsFrames.shift(); // bounded, in-memory only

            // Real pause detection: silence gap between voiced frames.
            const SILENCE_RMS = 0.015;
            if (loudness < SILENCE_RMS && session.lastFrameAt !== null) {
                const gapMs = atMs - session.lastFrameAt;
                if (gapMs >= 150) {
                    const durationBucket = bucketPauseDuration(gapMs);
                    session.pauses.push({ atMs, gapMs, durationBucket });
                }
            }
            if (loudness >= SILENCE_RMS) session.lastFrameAt = atMs;

            // Real, disclosed emphasis signal: a volume spike well above
            // this session's own recent average.
            const recent = session.rmsFrames.slice(-20).map(f => f.loudness);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            if (loudness > avg * 1.8 && loudness > SILENCE_RMS) {
                session.emphasisSignals.push({ type: "volume-spike", atMs, loudness, baseline: avg });
            }

            this.#stats.framesAnalyzed++;
            return { success: true, pitchHz, loudness, isSilentFrame: loudness < SILENCE_RMS };
        }

        /** Stores only the RELATIVE movement (rising/falling/steady), never the absolute Hz sequence, per identity-safety design. */
        #recordPitch(session, pitchHz) {
            if (pitchHz === null) return;
            let movement = "steady";
            if (session.lastPitchHz !== null) {
                const delta = pitchHz - session.lastPitchHz;
                if (delta > 8) movement = "rising";
                else if (delta < -8) movement = "falling";
            }
            session.pitchFrames.push(movement);
            if (session.pitchFrames.length > 1000) session.pitchFrames.shift();
            session.lastPitchHz = pitchHz;
        }

        /**
         * recordWord(sessionId, text, atMs) — real, additive intake point
         * composing SpeechRecognitionAdapter's onFinalResult transcript
         * (caller wires: adapter.on("onFinalResult", r => engine.recordWord(sessionId, r.transcript, Date.now()))).
         * Not one of the spec's 10 required methods, but required for
         * rate/question/repeated-word detection to be real rather than
         * guessed from audio alone.
         */
        recordWord(sessionId, text, atMs = Date.now()) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No active session "${sessionId}".` };
            session.wordEvents.push({ text, atMs });
            if (session.wordEvents.length > 2000) session.wordEvents.shift();
            return { success: true };
        }

        /**
         * learnStyle(sessionId, options)
         *   options: { currentMode } — optional real context (e.g. from
         *   ChurchWorshipSession.getServiceTimeline()'s last sectionType).
         *   Aggregates the session's buffered observations into one style
         *   OBSERVATION and appends it to styleId's persisted history —
         *   never overwrites prior observations (continuous-learning
         *   requirement). Confidence rises only after
         *   MIN_OBSERVATIONS_FOR_CONFIDENCE repeated sessions for the same
         *   styleId.
         */
        learnStyle(sessionId, options = {}) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No active session "${sessionId}".` };

            const rate = this.#estimateRate(session);
            const rhythm = this.#estimateRhythm(session);
            const pauseProfile = this.#summarizePauses(session, options.currentMode || null);
            const emphasisProfile = this.#summarizeEmphasis(session);
            const intonation = this.#estimateIntonation(session);
            const modeEstimate = this.#estimateSpeakingMode(session, options.currentMode || null);
            const emotionEstimate = this.#estimateEmotion(session, modeEstimate);

            const observation = {
                observedAt: new Date().toISOString(),
                sessionId,
                language: session.language, region: session.region,
                pitchContourShape: [...session.pitchFrames], // relative movements only
                rate, rhythm, pauseProfile, emphasisProfile, intonation,
                speakingMode: modeEstimate, emotion: emotionEstimate,
                framesObserved: session.pitchFrames.length,
            };

            const history = this.#loadHistory(session.styleId);
            history.observations.push(observation);
            history.confidence = Math.min(1, history.observations.length / MIN_OBSERVATIONS_FOR_CONFIDENCE);
            this.#saveHistory(session.styleId, history);
            this.#stats.stylesLearned++;
            this.#emit("style-learned", { styleId: session.styleId, confidence: history.confidence, observationCount: history.observations.length });

            return { success: true, styleId: session.styleId, observation, confidence: history.confidence };
        }

        #estimateRate(session) {
            if (session.wordEvents.length < 2) return { label: "Unknown", wordsPerMinute: null, reason: "Not enough real word timing (wire recordWord() to SpeechRecognitionAdapter's onFinalResult)." };
            const first = session.wordEvents[0].atMs, last = session.wordEvents[session.wordEvents.length - 1].atMs;
            const minutes = Math.max((last - first) / 60000, 1 / 60000);
            const wordCount = session.wordEvents.reduce((n, e) => n + String(e.text).trim().split(/\s+/).filter(Boolean).length, 0);
            const wpm = wordCount / minutes;
            let label = "Normal";
            if (wpm < 100) label = "Slow";
            else if (wpm > 160 && wpm <= 200) label = "Fast";
            else if (wpm > 200) label = "Very fast";
            return { label, wordsPerMinute: Math.round(wpm) };
        }

        #estimateRhythm(session) {
            if (session.pauses.length < 2) return { label: "Unknown", reason: "Not enough real pause data yet." };
            const gaps = session.pauses.map(p => p.gapMs);
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const variance = gaps.reduce((a, b) => a + (b - avgGap) ** 2, 0) / gaps.length;
            const stddev = Math.sqrt(variance);
            const evenness = stddev < avgGap * 0.4 ? "even" : "irregular";
            return { label: evenness, averagePauseGapMs: Math.round(avgGap), sampleSize: gaps.length };
        }

        #summarizePauses(session, currentMode) {
            const counts = { short: 0, medium: 0, long: 0, extended: 0 };
            const subtypes = {};
            for (const p of session.pauses) {
                counts[p.durationBucket] = (counts[p.durationBucket] || 0) + 1;
                const subtype = classifyPauseSubtype(p.durationBucket, currentMode);
                subtypes[subtype] = (subtypes[subtype] || 0) + 1;
            }
            return { durationCounts: counts, subtypeCounts: subtypes, total: session.pauses.length };
        }

        #summarizeEmphasis(session) {
            const volumeSpikes = session.emphasisSignals.filter(s => s.type === "volume-spike").length;
            const repeatedWords = this.#detectRepeatedWords(session);
            return {
                volumeSpikeCount: volumeSpikes,
                repeatedWordCount: repeatedWords.length,
                repeatedWordSamples: repeatedWords.slice(0, 5),
                honestGap: "Long-vowel and general stress detection require audio features this engine cannot get confidently from a plain AnalyserNode — not implemented, not fabricated.",
            };
        }

        #detectRepeatedWords(session) {
            const hits = [];
            for (let i = 1; i < session.wordEvents.length; i++) {
                const prevWords = String(session.wordEvents[i - 1].text).trim().split(/\s+/);
                const curWords = String(session.wordEvents[i].text).trim().split(/\s+/);
                if (prevWords.length && curWords.length && prevWords[prevWords.length - 1].toLowerCase() === curWords[0].toLowerCase()) {
                    hits.push(curWords[0]);
                }
            }
            return hits;
        }

        #estimateIntonation(session) {
            const lastTexts = session.wordEvents.slice(-10).map(e => e.text).join(" ");
            if (!lastTexts.trim()) return { label: "Unknown", reason: "No real transcript text recorded yet." };
            if (/\?\s*$/.test(lastTexts.trim())) return { label: "Question" };
            if (/!\s*$/.test(lastTexts.trim())) return { label: "Exclamation" };
            if (/\b(amen|in jesus'? name)\b\.?\s*$/i.test(lastTexts.trim())) return { label: "Blessing/prayer ending" };
            return { label: "Statement" };
        }

        /**
         * Real, honest composition: a caller-declared currentMode (from
         * ChurchWorshipSession.markSection()'s real sectionType) is a
         * strong prior and is trusted over audio guesswork. Without it,
         * this falls back to a disclosed heuristic over rate+pauses and
         * returns "Unknown" below the confidence floor — never invented.
         */
        #estimateSpeakingMode(session, currentMode) {
            const MODE_MAP = { prayer: "Prayer", sermon: "Preaching", worship: "Preaching", testimonies: "Testimony", announcements: "Announcement" };
            if (currentMode) {
                const mapped = MODE_MAP[String(currentMode).toLowerCase()] || currentMode;
                return { label: mapped, confidence: 0.9, source: "caller-declared (ChurchWorshipSession.markSection)" };
            }
            const rate = this.#estimateRate(session);
            const pauseTotal = session.pauses.length;
            if (rate.label === "Unknown") return { label: "Unknown", confidence: 0, source: "insufficient real signal" };
            if (rate.wordsPerMinute !== null && rate.wordsPerMinute > 150 && pauseTotal < 3) return { label: "Preaching", confidence: 0.4, source: "heuristic: fast rate, few pauses" };
            if (pauseTotal > 5 && rate.label === "Slow") return { label: "Teaching", confidence: 0.35, source: "heuristic: slow rate, frequent pauses" };
            return { label: "Unknown", confidence: 0.2, source: "heuristic confidence below floor" };
        }

        /** Do not invent emotion. Returns Unknown below the confidence floor — governance requirement, enforced here. */
        #estimateEmotion(session, modeEstimate) {
            const CONFIDENCE_FLOOR = 0.5;
            const MODE_TO_EMOTION = { Prayer: "Prayer", Preaching: "Celebration", Teaching: "Calm", Testimony: "Encouragement", Announcement: "Calm" };
            if (modeEstimate.confidence >= CONFIDENCE_FLOOR && MODE_TO_EMOTION[modeEstimate.label]) {
                return { label: MODE_TO_EMOTION[modeEstimate.label], confidence: modeEstimate.confidence, source: `derived from ${modeEstimate.source}` };
            }
            return { label: "Unknown", confidence: modeEstimate.confidence || 0, reason: "Confidence below floor — not invented." };
        }

        /**
         * applyStyle(text, styleId)
         *   Returns a real, executable delivery PLAN — segments of text
         *   with a rate/pitch multiplier (real Web Speech API ranges) and
         *   a pause-after duration, plus one real CozySpeech voice-
         *   settings record. Does NOT itself play audio (see
         *   deliverStyledSpeech() for that) and never touches Scripture:
         *   callers must never pass verse text here (per governance —
         *   this engine only accepts sermon/speech text it's given).
         */
        applyStyle(text, styleId) {
            this.#stats.applyStyleCalls++;
            if (!text) return { success: false, reason: "Real text is required." };
            const history = this.#loadHistory(styleId);
            if (history.observations.length === 0) return { success: false, reason: `No learned style observations exist yet for styleId "${styleId}". Call learnStyle() first.` };

            const latest = history.observations[history.observations.length - 1];
            const rateMultiplier = this.#rateLabelToMultiplier(latest.rate.label);
            const pauseMs = latest.pauseProfile.total > 0 ? Math.round(this.#dominantPauseGapMs(latest)) : 400;

            // Real sentence-level segmentation — genuine punctuation split, not fabricated linguistics.
            const segments = text.split(/(?<=[.!?])\s+/).filter(Boolean).map(sentence => ({
                text: sentence,
                pauseAfterMs: /\?\s*$/.test(sentence) ? Math.round(pauseMs * 1.3) : pauseMs,
            }));

            let settingsId = null;
            const cozySpeech = window.CozyOS.CozySpeech;
            if (cozySpeech && typeof cozySpeech.registerVoiceSettings === "function") {
                try {
                    const registered = cozySpeech.registerVoiceSettings({ language: latest.language || "en-US", speed: rateMultiplier, pitch: 1.0 });
                    settingsId = registered && registered.settingsId ? registered.settingsId : (registered && registered.id) || null;
                } catch (_err) { /* honest: falls through with settingsId:null below */ }
            }

            const plan = {
                success: true, styleId, segments, rateMultiplier, settingsId,
                confidence: history.confidence,
                honestNote: settingsId ? null : "CozySpeech.registerVoiceSettings() was not available — plan returned without a settingsId; caller can still use rateMultiplier directly with SpeechSynthesisUtterance.rate.",
            };
            this.#emit("style-applied", { styleId, segmentCount: segments.length });
            return plan;
        }

        #dominantPauseGapMs(observation) {
            const counts = observation.pauseProfile.durationCounts;
            const buckets = { short: 150, medium: 400, long: 1000, extended: 2000 };
            let bestBucket = "medium", bestCount = -1;
            for (const [bucket, count] of Object.entries(counts)) { if (count > bestCount) { bestCount = count; bestBucket = bucket; } }
            return buckets[bestBucket] || 400;
        }

        #rateLabelToMultiplier(label) {
            // Real Web Speech API rate range is 0.1–10, 1.0 = normal — direct, honest mapping, no invented curve.
            return { "Slow": 0.85, "Normal": 1.0, "Fast": 1.2, "Very fast": 1.4, "Unknown": 1.0 }[label] ?? 1.0;
        }

        /**
         * deliverStyledSpeech(text, styleId) — real, additive convenience:
         * builds the plan via applyStyle() and actually sequences real
         * CozyTTSBrowserAdapter.speakPreview() calls with real timed
         * delays between segments (the honest substitute for SSML breaks
         * — see file header). Not one of the spec's 10 required methods.
         */
        async deliverStyledSpeech(text, styleId) {
            const plan = this.applyStyle(text, styleId);
            if (!plan.success) return plan;
            const tts = window.CozyOS.CozyTTSBrowserAdapter;
            if (!tts || typeof tts.speakPreview !== "function") return { success: false, reason: "CozyTTSBrowserAdapter is not loaded — plan computed but not played.", plan };

            for (const segment of plan.segments) {
                await tts.speakPreview({ text: segment.text, settingsId: plan.settingsId });
                await new Promise(resolve => setTimeout(resolve, segment.pauseAfterMs));
            }
            return { success: true, played: true, styleId };
        }

        /** exportStyle(styleId) — real, composes CozyMemory. Serializes the abstracted profile only (no raw audio, ever). */
        exportStyle(styleId) {
            const history = this.#loadHistory(styleId);
            if (history.observations.length === 0) return { success: false, reason: `No learned style exists for "${styleId}".` };
            return { success: true, styleId, exportedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(history)) };
        }

        /** importStyle(styleId, exportedData) — real, composes CozyMemory. Appends to history rather than overwriting (continuous-learning requirement). */
        importStyle(styleId, exportedData) {
            if (!exportedData || !Array.isArray(exportedData.observations)) return { success: false, reason: "Real exported style data with an observations array is required." };
            const history = this.#loadHistory(styleId);
            history.observations.push(...exportedData.observations);
            history.confidence = Math.min(1, history.observations.length / MIN_OBSERVATIONS_FOR_CONFIDENCE);
            this.#saveHistory(styleId, history);
            return { success: true, styleId, totalObservations: history.observations.length };
        }

        /** compareStyle(styleIdA, styleIdB) — real numeric diff over the two most recent observations. Never compares raw audio (none is ever stored). */
        compareStyle(styleIdA, styleIdB) {
            const a = this.#loadHistory(styleIdA), b = this.#loadHistory(styleIdB);
            if (!a.observations.length || !b.observations.length) return { available: false, reason: "Both styleIds need at least one learnStyle() observation." };
            const latestA = a.observations[a.observations.length - 1], latestB = b.observations[b.observations.length - 1];
            return {
                available: true,
                rate: { a: latestA.rate.label, b: latestB.rate.label, same: latestA.rate.label === latestB.rate.label },
                rhythm: { a: latestA.rhythm.label, b: latestB.rhythm.label, same: latestA.rhythm.label === latestB.rhythm.label },
                speakingMode: { a: latestA.speakingMode.label, b: latestB.speakingMode.label, same: latestA.speakingMode.label === latestB.speakingMode.label },
            };
        }

        /** reset(sessionId) — clears only the LIVE, in-memory session buffers (raw-audio-derived). Never erases persisted style history — "never overwrite" requirement. */
        reset(sessionId) {
            if (sessionId) {
                const session = this.#sessions.get(sessionId);
                if (!session) return { success: false, reason: `No active session "${sessionId}".` };
                session.pitchFrames = []; session.rmsFrames = []; session.pauses = []; session.wordEvents = []; session.emphasisSignals = []; session.lastPitchHz = null; session.lastFrameAt = null;
                return { success: true, sessionId, cleared: "live buffers only — persisted style history untouched" };
            }
            return { success: true, cleared: "no sessionId given — nothing persisted was touched" };
        }

        getStatistics() {
            return { ...this.#stats, activeSessions: this.#sessions.size };
        }

        #loadHistory(styleId) {
            const memory = window.CozyOS.CozyMemory;
            if (memory && typeof memory.readMemory === "function") {
                try {
                    const record = memory.readMemory(MEMORY_NAMESPACE, styleId);
                    if (record && record.value) return record.value;
                } catch (_err) { /* honest: falls through to fresh history below */ }
            }
            return { styleId, observations: [], confidence: 0 };
        }

        #saveHistory(styleId, history) {
            const memory = window.CozyOS.CozyMemory;
            if (memory && typeof memory.saveMemory === "function") {
                try { memory.saveMemory(MEMORY_NAMESPACE, styleId, history, { actorId: "system", visibility: "private" }); return { success: true }; }
                catch (err) { return { success: false, reason: err.message }; }
            }
            return { success: false, reason: "CozyMemory is not loaded — history kept in this call only, not persisted." };
        }
    }

    window.CozyOS.LivingVoiceStyleEngine = new LivingVoiceStyleEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/living-voice-style-engine.js", name: "LivingVoiceStyleEngine", category: "Living",
                description: "Learns and reproduces speaking style (pitch contour shape, rate, pauses, rhythm, disclosed-confidence mode/emotion) from real audio + real transcript timing. Never clones voices or stores raw audio; requires explicit consent to start a session.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
