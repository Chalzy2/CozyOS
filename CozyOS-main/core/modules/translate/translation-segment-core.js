/**
 * CozyOS — Translation Segment Core
 * File Reference: core/modules/translate/translation-segment-core.js
 *
 * CLASSIFICATION: pure logic, no DOM, no network — follows the
 * established "-core.js" convention (admin-gate-core.js,
 * post-login-routing-core.js, multimodal-observation-core.js,
 * learning-interaction-core.js).
 *
 * OWNERSHIP
 *   Owns the structured TranslationSegment output contract (Section 20
 *   of the CP16A spec) and the pure rules for deriving pause/delivery
 *   metadata from ALREADY-REAL timing data. Owns no translation
 *   capability itself (that is window.CozyOS.SpeechTranslationProviders/
 *   the registered nllb-bridge provider — core/modules/speech/adapters/
 *   speech-translation-provider*.js, both audited and reused unchanged),
 *   no voice resolution (that is VoiceManager, reused unchanged via
 *   translation-service.js), and no speech recognition (that remains
 *   SpeechRecognitionAdapter/LivingHearingSession).
 *
 * NEVER FABRICATE
 *   buildSegment() only ever includes a field when the caller actually
 *   supplied real data for it. sourceTiming, pauseMetadata,
 *   deliveryMetadata, and confidence all resolve to null/`"unavailable"`
 *   rather than an invented value when the real upstream data doesn't
 *   exist. This mirrors multimodal-observation-core.js's own
 *   never-invent-a-missing-modality discipline exactly.
 *
 * LIPSYNC — HONEST BOUNDARY, NOT A FEATURE
 *   getLipsyncStatus() always returns the same real, honest answer:
 *   no phoneme/viseme timing provider exists anywhere in this
 *   repository (confirmed by inspection before writing this file — no
 *   engine anywhere computes or exposes phoneme/viseme data). This
 *   function exists so a caller has a real interface point to check
 *   rather than silently having no way to ask, but it does not, and
 *   must not, ever return fabricated timing data.
 *
 * PAUSE PRESERVATION — FROM REAL METADATA ONLY
 *   derivePauseMetadata() computes a pause duration ONLY from two real,
 *   caller-supplied millisecond timestamps (e.g.
 *   SpeechRecognitionAdapter.getLastTimings()'s real, measured fields —
 *   see that file's own header: "never a guessed/claimed latency
 *   figure"). If either timestamp is missing, this returns
 *   `{ available: false }` — it never estimates or defaults a pause
 *   duration from segment text length or any other proxy.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    function isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    /**
     * derivePauseMetadata({ previousSegmentEndedAt, currentSegmentStartedAt })
     *   Real, measured pause duration only — both timestamps must be
     *   real numbers (ms, Date.now()-style) the caller actually
     *   measured. Never fabricated from text length, punctuation, or
     *   any other proxy.
     */
    function derivePauseMetadata({ previousSegmentEndedAt, currentSegmentStartedAt } = {}) {
        if (!isFiniteNumber(previousSegmentEndedAt) || !isFiniteNumber(currentSegmentStartedAt)) {
            return { available: false };
        }
        const durationMs = currentSegmentStartedAt - previousSegmentEndedAt;
        if (durationMs < 0) return { available: false };
        return { available: true, durationMs };
    }

    /**
     * deriveSourceTiming(rawTimings)
     *   Passes through only the real fields a real timing source (e.g.
     *   SpeechRecognitionAdapter.getLastTimings()) actually supplied.
     *   Never invents a field the source didn't provide.
     */
    function deriveSourceTiming(rawTimings) {
        if (!rawTimings || typeof rawTimings !== 'object') return null;
        const known = ['startRequestedAt', 'recognitionStartedAt', 'firstInterimAt', 'firstFinalAt', 'micAcquiredAt'];
        const out = {};
        let any = false;
        for (const key of known) {
            if (isFiniteNumber(rawTimings[key])) { out[key] = rawTimings[key]; any = true; }
        }
        return any ? out : null;
    }

    /**
     * getLipsyncStatus()
     *   Always the same honest answer — see file header. Never varies
     *   based on input; there is nothing to check because no provider
     *   exists.
     */
    function getLipsyncStatus() {
        return { available: false, reason: 'Lipsync: pending real provider/runtime support. No phoneme/viseme timing engine exists in this repository.' };
    }

    /**
     * buildSegment({ segmentId, sourceLanguage, targetLanguage, sourceText,
     *   translatedText, context, confidence, voiceId, sourceTiming,
     *   pauseMetadata, now, idGenerator })
     *   Assembles the structured TranslationSegment (CP16A Section 20).
     *   `confidence` is passed through exactly as given — a real number
     *   if the provider supplied one, or the literal string
     *   "unavailable" otherwise (never a fabricated percentage; matches
     *   Section 15's explicit "never invent a translation accuracy
     *   percentage" rule). `deliveryMetadata` currently only carries
     *   pauseMetadata and the honest lipsync boundary — no
     *   prosody/emphasis data is fabricated where no real system
     *   produces it (Section 10/12).
     */
    function buildSegment(input) {
        const opts = input || {};
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const idGenerator = typeof opts.idGenerator === 'function'
            ? opts.idGenerator
            : () => `seg_${now()}_${Math.random().toString(36).slice(2, 10)}`;

        const confidence = (typeof opts.confidence === 'number') ? opts.confidence : 'unavailable';

        return {
            segmentId: opts.segmentId || idGenerator(),
            sourceLanguage: opts.sourceLanguage || null,
            targetLanguage: opts.targetLanguage || null,
            sourceText: opts.sourceText || null,
            translatedText: opts.translatedText || null,
            context: opts.context || null,
            confidence,
            timestamp: now(),
            sourceTiming: deriveSourceTiming(opts.sourceTiming),
            pauseMetadata: opts.pauseMetadata || { available: false },
            deliveryMetadata: {
                lipsync: getLipsyncStatus(),
                prosody: { available: false, reason: 'No prosody/emphasis provider exists in this repository. Not fabricated.' },
            },
            voiceId: opts.voiceId || null,
        };
    }

    window.CozyOS.TranslationSegmentCore = Object.freeze({
        buildSegment,
        derivePauseMetadata,
        deriveSourceTiming,
        getLipsyncStatus,
        version: VERSION,
    });
    window.CozyOS.Modules['translation-segment-core'] = Object.freeze({
        version: VERSION,
        description: 'Pure logic, no DOM/network. Structured TranslationSegment contract + pause/timing derivation from real metadata only + honest lipsync/prosody boundary. Owns no translation, voice, or speech-recognition capability itself.',
    });
})();
