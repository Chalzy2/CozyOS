/**
 * =============================================================================
 * CozyOS Media Engine — Video Interpreter Coordinator (M388 Engine 11)
 * File: core/engines/media/coordinator/video-interpreter-coordinator.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Eleventh and final engine of the Approved 11-engine Implementation Order
 * (docs/history/M388.md, Phase 2 Review). Orchestrates Engines 1-10 in their
 * real dependency order (1 -> 2/4 -> 5 -> 3 -> 6 -> 7 -> 8 -> 9 -> 10),
 * passing each stage's real output as the next stage's real input. Never
 * fabricates an intermediate value a stage didn't itself return.
 *
 * HONESTY (Rule 6)
 * ------------------
 * This coordinator does not resolve any open finding from Engines 1-10
 * (MD-007, MD-008, MD-009, MD-013, MD-016, MD-018, MD-019, MD-020, MD-021,
 * MD-022/DI-010 all remain open/unchanged). It is structurally impossible
 * for an orchestrator of ten honestly-limited stages to be more "real" than
 * its least-real stage. getCapabilities() aggregates each stage's own
 * already-honest capability report and never rounds up.
 *
 * OPTIONAL STAGES
 * ----------------
 * Engine 3 (Translation) requires a live SpeechTranslationAdapter instance.
 * Engine 7 (Voice Generation) and Engine 10 (Streaming) require a live
 * cozy-live.js/VoiceManager instance. When the caller supplies none of
 * these, this coordinator honestly skips that stage rather than fabricating
 * a result, and records the skip in the returned envelope's `skipped` list.
 *
 * SCOPE BOUNDARIES (Implementation Contract, Compose §"Draft Implementation
 * Contract")
 * ------------------------------------------------------------------------
 * - New file only. Does not modify cozy-live.js, cozy-speech.js,
 *   cozy-media.js, media-pipeline-manager.js, cozy-translate.js,
 *   speech-translation-adapter.js, speech-translation-provider.js,
 *   audio-manager.js, cozy-hearing.js, subtitle-timeline-engine.js,
 *   voice-generation-engine.js, synchronization-engine.js, or any of
 *   Engines 1-10's own already-Closed implementation files — calls only
 *   their existing, already-public exported functions.
 * - One additive REGISTRATIONS entry in
 *   core/bridge/engine-bridge-bootstrap.js (`video-interpreter-coordinator`
 *   / `VideoInterpreterCoordinator`), matching Engines 1-10's own
 *   precedent — no other line of that file changed.
 * - Registered through EngineBridge only (Phase 2 Review decision — the
 *   Approved Implementation Order's "only new Living Engine proper" framing
 *   distinguishes Engine 11 conceptually from Engines 1-10, it does not
 *   mandate a second PluginManager registration).
 * =============================================================================
 */

'use strict';

import MediaDecodeEngine from '../decode/media-decode-engine.js';
import LanguageDetectionEngine from '../language/language-detection-engine.js';
import SpeakerDiarizationEngine from '../diarization/speaker-diarization-engine.js';
import BackgroundAudioSeparationEngine from '../audio-separation/background-audio-separation-engine.js';
import TranslationPipelineEngine from '../translation/translation-pipeline-engine.js';
import SubtitleTimelineEngine from '../subtitles/subtitle-timeline-engine.js';
import SynchronizationEngine from '../synchronization/synchronization-engine.js';
import MediaEncodeEngine from '../encode/media-encode-engine.js';

const EVENTS = Object.freeze({
  INTERPRETED: 'coordinator:video-interpreted',
  STAGE_SKIPPED: 'coordinator:stage-skipped',
  ERROR: 'coordinator:error'
});

const listeners = new Map();

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName).delete(handler);
}

function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (_err) {
      // A listener's own error never breaks the pipeline.
    }
  }
}

/**
 * Orchestrates Engines 1-10 against a single source handle, in the real
 * dependency order the Approved Implementation Order establishes.
 *
 * @param {*} sourceHandle - passed through to Engine 1's decodeMedia().
 * @param {object} [options]
 * @param {object} [options.decodeOptions] - passed to Engine 1.
 * @param {object} [options.languageOptions] - passed to Engine 2.
 * @param {object} [options.diarizationOptions] - passed to Engine 4.
 * @param {object} [options.separationOptions] - passed to Engine 5.
 * @param {string} [options.sourceLanguage] - passed to Engine 3, per segment.
 * @param {string} [options.targetLanguage] - passed to Engine 3, per segment.
 * @param {object} [options.timelineOptions] - passed to Engine 6.
 * @param {object} [options.speechTranslationAdapter] - a real, running
 *   window.CozyOS.SpeechTranslationAdapter instance. When omitted, Engine 3
 *   (Translation) is honestly skipped.
 * @param {object} [options.playbackResults] - required for Engine 8's
 *   crossCheckTiming(). When omitted, Engine 8 (Synchronization) is
 *   honestly skipped.
 * @returns {Promise<object>} a real, deterministic envelope of each
 *   consulted stage's real output, plus a `skipped` list naming any stage
 *   this call could not honestly run.
 */
async function interpretVideo(sourceHandle, options = {}) {
  const skipped = [];
  const stages = {};

  try {
    // Engine 1: Media Decode — no upstream dependency.
    const decodeResult = MediaDecodeEngine.decodeMedia(sourceHandle, options.decodeOptions || {});
    stages.decode = decodeResult;

    const segments = Array.isArray(options.segments) ? options.segments : [];

    // Engine 2: Language Detection — consumes Engine 1's audio reference.
    stages.language = LanguageDetectionEngine.detectLanguage(decodeResult, options.languageOptions || {});

    // Engine 4: Speaker Diarization — consumes caller-supplied segments.
    stages.diarization = SpeakerDiarizationEngine.diarize(segments, options.diarizationOptions || {});

    // Engine 5: Background Audio Separation — consumes segments + Engine 4's result.
    stages.separation = BackgroundAudioSeparationEngine.partition(
      segments,
      stages.diarization,
      options.separationOptions || {}
    );

    // Engine 3: Translation — requires a live SpeechTranslationAdapter.
    // Honestly skipped when the caller supplies none.
    if (options.speechTranslationAdapter) {
      stages.translation = [];
      for (const segment of segments) {
        const text = segment && typeof segment.text === 'string' ? segment.text : '';
        const translated = await TranslationPipelineEngine.translateSegment(
          options.speechTranslationAdapter,
          text,
          options.sourceLanguage,
          options.targetLanguage
        );
        stages.translation.push(translated);
      }
    } else {
      skipped.push('translation');
      emit(EVENTS.STAGE_SKIPPED, { stage: 'translation', reason: 'No speechTranslationAdapter supplied.' });
    }

    // Engine 6: Subtitle Timeline — consumes caller-supplied segments.
    stages.timeline = SubtitleTimelineEngine.buildTimeline(segments, options.timelineOptions || {});

    // Engine 7: Voice Generation — requires a live cozy-live.js/VoiceManager
    // instance via its own real orchestration entry point (attachToLive).
    // This coordinator does not fabricate a live instance; honestly skipped
    // unless the caller has already attached one and supplies its result.
    if (options.voiceGenerationResult) {
      stages.voiceGeneration = options.voiceGenerationResult;
    } else {
      skipped.push('voiceGeneration');
      emit(EVENTS.STAGE_SKIPPED, { stage: 'voiceGeneration', reason: 'No live VoiceManager instance/result supplied.' });
    }

    // Engine 8: Synchronization — requires real playbackResults.
    if (options.playbackResults) {
      stages.synchronization = SynchronizationEngine.crossCheckTiming(
        stages.timeline,
        options.playbackResults,
        options.syncOptions || {}
      );
    } else {
      skipped.push('synchronization');
      emit(EVENTS.STAGE_SKIPPED, { stage: 'synchronization', reason: 'No playbackResults supplied.' });
    }

    // Engine 9: Media Encode — hard-requires a real Engine 8 syncResult
    // ({results: [...]}) and a real (possibly empty) Engine 7 speechResults
    // array; it cannot honestly run on a fabricated/null stand-in for
    // either. When Engine 8 was skipped, Engine 9 is honestly skipped too
    // (the real dependency chain cascades: 7 -> 8 -> 9).
    if (stages.synchronization) {
      stages.encode = MediaEncodeEngine.buildEncodePlan(
        decodeResult,
        stages.voiceGeneration || [],
        stages.synchronization
      );
    } else {
      skipped.push('encode');
      emit(EVENTS.STAGE_SKIPPED, { stage: 'encode', reason: 'Engine 8 (synchronization) was skipped — Engine 9 cannot honestly run without a real syncResult.' });
    }

    // Engine 10: Streaming — requires a live cozy-live.js Stream session;
    // this coordinator does not fabricate one. Honestly skipped unless the
    // caller supplies an already-tracked stream result.
    if (options.streamingResult) {
      stages.streaming = options.streamingResult;
    } else {
      skipped.push('streaming');
      emit(EVENTS.STAGE_SKIPPED, { stage: 'streaming', reason: 'No live Stream session/result supplied.' });
    }

    const envelope = Object.freeze({
      stages: Object.freeze(stages),
      skipped: Object.freeze(skipped),
      isReal: false // See getCapabilities() — never rounds up past the least-real stage.
    });

    emit(EVENTS.INTERPRETED, { skipped, stageNames: Object.keys(stages) });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/**
 * Honest capability aggregation. Reports this coordinator's own real
 * orchestration capability, plus a nested breakdown of each stage's own
 * already-honest getCapabilities()/real* value — never rounds up. If every
 * consulted stage reports false for its own "real" claim, this aggregate
 * report's realEndToEndInterpretation field is also false.
 */
function getCapabilities() {
  const decode = MediaDecodeEngine.getCapabilities();
  const language = LanguageDetectionEngine.getCapabilities();
  const diarization = SpeakerDiarizationEngine.getCapabilities();
  const separation = BackgroundAudioSeparationEngine.getCapabilities();
  const translation = TranslationPipelineEngine.getCapabilities();
  const timeline = SubtitleTimelineEngine.getCapabilities();
  const synchronization = SynchronizationEngine.getCapabilities();
  const encode = MediaEncodeEngine.getCapabilities();

  const stageRealFlags = [
    decode.realDecode,
    language.realAcousticDetection,
    diarization.realAcousticDiarization,
    separation.realAcousticSeparation,
    timeline.realTranscriptionOrTiming,
    synchronization.realDriftMeasurement,
    encode.realEncode
  ];

  // Structurally impossible to be more "real" than the least-real stage.
  const realEndToEndInterpretation = stageRealFlags.every(Boolean);

  return Object.freeze({
    realEndToEndInterpretation,
    stages: Object.freeze({
      decode,
      language,
      diarization,
      separation,
      translation,
      timeline,
      synchronization,
      encode
    }),
    honestLimitation:
      'This coordinator orchestrates ten honestly-limited stages (MD-007, MD-008, MD-009, MD-013, ' +
      'MD-016, MD-018, MD-019, MD-020, MD-021, MD-022/DI-010 all remain open) — it does not ' +
      'retroactively make any of them more real, and reports each stage\'s own real* value unchanged.'
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'video-interpreter-coordinator',
    apiVersion: '1.0.0',
    priority: 15,
    mandatory: false,
    // Eleventh and final engine in the Approved Implementation Order —
    // depends on all ten prior M388 engines being registered first.
    dependsOn: [
      'media-decode',
      'language-detection',
      'speaker-diarization',
      'background-audio-separation',
      'translation-pipeline',
      'subtitle-timeline',
      'synchronization',
      'media-encode'
    ]
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerService !== 'function') {
    throw new Error('[VideoInterpreterCoordinator] registerWithKernel() requires a real kernel exposing registerService().');
  }
  return kernel.registerService(getServiceManifest().name, VideoInterpreterCoordinator);
}

function getStatus() {
  return Object.freeze({
    engine: 'video-interpreter-coordinator',
    stagesAvailable: 8
  });
}

function __resetForTests() {
  listeners.clear();
}

const VideoInterpreterCoordinator = Object.freeze({
  EVENTS,
  on,
  interpretVideo,
  getCapabilities,
  getServiceManifest,
  registerWithKernel,
  getStatus,
  __resetForTests
});

export default VideoInterpreterCoordinator;
