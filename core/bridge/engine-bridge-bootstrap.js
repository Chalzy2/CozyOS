/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Dashboard Bootstrap
 * File: core/bridge/engine-bridge-bootstrap.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The one place that knows the concrete list of certified ES-module
 * engines and their window.CozyOS.* names. Loaded by dashboard.html as
 * `<script type="module">` — the standard, real way to run ES modules
 * inside an otherwise-classic-script page; no other script tag needed
 * to change. Registers each engine, then attempts to load all of them,
 * logging real per-engine results rather than assuming success.
 *
 * NAMING NOTE (flagged, not silently decided)
 * ------------------------------------------------------------
 * window.CozyOS.Vision (cozy-vision.js) and window.CozyOS.CozyMedia
 * (cozy-media.js) already exist as browser-global coordinators — this
 * bootstrap does not touch or rename either. The four remaining ES-module
 * engines are exposed under distinct *Engine/*Manager names (CameraEngine,
 * AudioManager, SceneEngine, MediaEngine) specifically so they cannot
 * collide with those existing globals or with each other.
 *
 * AA-004 RESOLUTION (M387.5b, real repair — not a guess): this bootstrap
 * previously exposed audio-manager.js as `AudioEngine`, which collided with
 * `core/engines/audio/cozy-audio-engine.js`'s own, already-real
 * `window.CozyOS.AudioEngine` (loads earlier, wins the name, "refuses to
 * overwrite" per ServiceAdapter's conflict guard — confirmed in every
 * M387.5 browser-verification round). Investigated both real consumers'
 * actual method calls before choosing a fix: `cozy-hearing.js` calls
 * `registerInputAdapter()`/`startListening()`/`stopListening()` — methods
 * that exist only on `cozy-audio-engine.js`, never on `audio-manager.js`.
 * `live-capture-engine.js` (and this file's own `wireBrowserAudioProvider`
 * below) call `registerProvider()` — which exists only on `audio-manager.js`.
 * Both are real, both are needed, neither is a duplicate of the other —
 * they're two different engines that happened to want the same name.
 * Renamed audio-manager.js's target to `AudioManager` (its own file header
 * already self-identifies as "Audio Manager"); `cozy-audio-engine.js` is
 * untouched and keeps `window.CozyOS.AudioEngine` exactly as it already
 * functioned.
 * =============================================================================
 */

'use strict';

import EngineBridge from './engine-bridge.js';

const REGISTRATIONS = Object.freeze([
  { name: 'camera', modulePath: '../engines/camera/camera-manager.js', globalName: 'CameraEngine', expectedManifestName: 'camera-manager' },
  { name: 'audio', modulePath: '../engines/audio/audio-manager.js', globalName: 'AudioManager', expectedManifestName: 'audio-manager' },
  // 'playback' intentionally NOT registered here (M387.5 Finding 9, real bug
  // fix): core/engines/playback/playback-engine.js is a genuine Node.js-only
  // module (imports 'fs', reads recorded session frames off real disk via
  // fs.existsSync/readFileSync/readdirSync/statSync) — it was wired into
  // this browser-only dashboard bridge alongside 4 real browser engines,
  // and a dynamic import of it can never succeed in a browser. Porting it
  // to a browser storage API (IndexedDB/File System Access) would be a real
  // feature-level rewrite, out of scope for a verification pass — removing
  // the doomed registration is the smallest fix that stops the failed
  // import at its root instead of just letting EngineBridge's existing
  // fail-closed handling swallow the error one level up.
  { name: 'scene', modulePath: '../engines/scene/scene-manager.js', globalName: 'SceneEngine', expectedManifestName: 'scene-manager' },
  { name: 'media', modulePath: '../engines/media/media-pipeline-manager.js', globalName: 'MediaEngine', expectedManifestName: 'media-pipeline-manager' },
  // M388 Engine 1 (Media Decode Engine) — registered independently of
  // 'media' above; does not modify media-pipeline-manager.js or its own
  // dependency list (Implementation Contract, Compose §12 item 4). The
  // audio-buffer -> SpeechRecognitionAdapter bridge (MD-016) is not yet
  // built, so this engine is not wired as a 'media' dependency here — that
  // remains an open, milestone-level sequencing gap, not assumed solved.
  { name: 'media-decode', modulePath: '../engines/media/decode/media-decode-engine.js', globalName: 'MediaDecodeEngine', expectedManifestName: 'media-decode-engine' },
  // M388 Engine 2 (Language Detection Engine) — registered independently
  // of 'media-decode' above; does not modify cozy-live.js, cozy-speech.js,
  // cozy-translate.js, or core/modules/language/language-engine.js
  // (Implementation Contract, items 1-2). Attaches to cozy-live.js's
  // reserved 'CozyLanguage' subsystem slot only via its own
  // registerSubsystem() call at composition time (attachToLive()), not
  // through this bridge — this entry only makes the engine loadable and
  // exposes it as window.CozyOS.LanguageDetectionEngine.
  { name: 'language-detection', modulePath: '../engines/media/language/language-detection-engine.js', globalName: 'LanguageDetectionEngine', expectedManifestName: 'language-detection-engine' },
  // M388 Engine 3 (Translation Pipeline Engine) — registered independently
  // of 'language-detection' above; does not modify cozy-live.js,
  // cozy-translate.js, speech-translation-adapter.js, or
  // speech-translation-provider.js (Final Implementation Contract, items
  // 1-2). Attaches to cozy-live.js's reserved, MANDATORY 'CozyTranslate'
  // subsystem slot only via its own registerSubsystem() call at
  // composition time (attachToLive()), not through this bridge — this
  // entry only makes the engine loadable and exposes it as
  // window.CozyOS.TranslationPipelineEngine.
  { name: 'translation-pipeline', modulePath: '../engines/media/translation/translation-pipeline-engine.js', globalName: 'TranslationPipelineEngine', expectedManifestName: 'translation-pipeline-engine' },
  // M388 Engine 4 (Speaker Diarization Engine) — registered independently
  // of 'translation-pipeline' above; does not modify cozy-live.js,
  // cozy-speech.js, cozy-media.js, or media-pipeline-manager.js (Final
  // Implementation Contract, Phase 2 Review, item 2 — no exception
  // granted, fully external). Writes only into cozy-speech.js's existing
  // _speakers registry via its own public registerSpeaker()/
  // addActiveSpeaker() calls at composition time (applyToSpeechRegistry()),
  // not through this bridge — this entry only makes the engine loadable
  // and exposes it as window.CozyOS.SpeakerDiarizationEngine. MD-019 (no
  // CozyDiarization hook in cozy-live.js's relaySpeechSegment()) remains
  // open/unassigned, unchanged by this registration.
  { name: 'speaker-diarization', modulePath: '../engines/media/diarization/speaker-diarization-engine.js', globalName: 'SpeakerDiarizationEngine', expectedManifestName: 'speaker-diarization-engine' },
  // M388 Engine 5 (Background Audio Separation Engine) — registered
  // independently of 'speaker-diarization' above; does not modify
  // cozy-live.js, cozy-speech.js, cozy-media.js, media-pipeline-manager.js,
  // audio-manager.js, or cozy-hearing.js (Final Implementation Contract,
  // Phase 2 Review, item 2). Deliberately lives at
  // core/engines/media/audio-separation/, distinct from the unrelated,
  // still-unbuilt VISUAL core/engines/media/background-engine.js already
  // imported by media-pipeline-manager.js (AA-007 naming-collision
  // finding) — this entry only makes the engine loadable and exposes it
  // as window.CozyOS.BackgroundAudioSeparationEngine. Consumes Engine 4's
  // diarize() output only as a plain function argument, not through this
  // bridge or any registry.
  { name: 'background-audio-separation', modulePath: '../engines/media/audio-separation/background-audio-separation-engine.js', globalName: 'BackgroundAudioSeparationEngine', expectedManifestName: 'background-audio-separation-engine' },
  // M388 Engine 6 (Subtitle Timeline Engine) — registered independently
  // of 'background-audio-separation' above; does not modify
  // cozy-live.js, cozy-speech.js, cozy-media.js, media-pipeline-manager.js,
  // audio-manager.js, cozy-hearing.js, or ldce-caption-engine.js (Final
  // Implementation Contract, Phase 2 Review, item 2). No registry write
  // anywhere — cozy-live.js's createSubtitleChannel() is pure
  // channel-routing metadata with no field for cue content; this entry
  // only makes the engine loadable and exposes it as
  // window.CozyOS.SubtitleTimelineEngine. Builds a real cue timeline +
  // .srt export only from caller-supplied segments already carrying
  // real text and real timing — never transcribes, translates, or
  // infers timing itself.
  { name: 'subtitle-timeline', modulePath: '../engines/media/subtitles/subtitle-timeline-engine.js', globalName: 'SubtitleTimelineEngine', expectedManifestName: 'subtitle-timeline-engine' },
  // M388 Engine 7 (Voice Generation Engine) — additive registration only,
  // per its Implementation Contract (docs/history/M388-E7-VoiceGeneration-
  // Compose.md §12): does not touch cozy-speech.js, voice-manager.js, or
  // cozy-tts-browser-adapter.js.
  { name: 'voice-generation', modulePath: '../modules/speech/generation/voice-generation-engine.js', globalName: 'VoiceGenerationEngine', expectedManifestName: 'voice-generation-engine' },
  // M388 Engine 8 (Synchronization Engine) — additive registration only,
  // per its Final Implementation Contract (docs/history/M388-E8-
  // Synchronization-Compose.md). Does not touch subtitle-timeline-engine.js
  // or voice-generation-engine.js — reads only their existing, already-
  // public return shapes via crossCheckTiming(). Never fabricates a
  // drift/offset value (MD-021) — getCapabilities().realDriftMeasurement
  // is always false.
  { name: 'synchronization', modulePath: '../engines/media/synchronization/synchronization-engine.js', globalName: 'SynchronizationEngine', expectedManifestName: 'synchronization-engine' },
  { name: 'media-encode', modulePath: '../engines/media/encode/media-encode-engine.js', globalName: 'MediaEncodeEngine', expectedManifestName: 'media-encode-engine' },
  // M388 Engine 10 (Streaming/Playback Pipeline Engine) — additive
  // registration only, per its Final Implementation Contract
  // (docs/history/M388-E10-StreamingPipeline-Compose.md). Does not touch
  // modules/live/cozy-live.js or core/engines/playback/playback-engine.js —
  // reads only cozy-live.js's existing, already-public Stream API
  // (getStream/etc.) via beginStreamTracking()'s own caller-supplied
  // cozy-live.js instance, not through this bridge. Never fabricates a
  // latency/throughput figure it didn't observe — getCapabilities().
  // realLowLatencyTransport stays honestly false (MD-013 remains open).
  { name: 'streaming-pipeline', modulePath: '../engines/media/streaming/streaming-pipeline-engine.js', globalName: 'StreamingPipelineEngine', expectedManifestName: 'streaming-pipeline-engine' },
  // M388 Engine 11 (Video Interpreter Coordinator) — final engine in the
  // Approved Implementation Order, additive registration only, per its
  // Final Implementation Contract
  // (docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md).
  // Orchestrates Engines 1-10 via their own already-public exported
  // functions only; does not modify any of their implementation files.
  // getCapabilities().realEndToEndInterpretation stays honestly false
  // while any upstream stage's own real* flag is false.
  { name: 'video-interpreter-coordinator', modulePath: '../engines/media/coordinator/video-interpreter-coordinator.js', globalName: 'VideoInterpreterCoordinator', expectedManifestName: 'video-interpreter-coordinator' }
]);

async function boot(target) {
  const results = [];
  for (const reg of REGISTRATIONS) {
    try {
      EngineBridge.register(reg.name, reg);
    } catch (err) {
      // Already registered (e.g. a second boot() call) — not fatal.
      results.push({ name: reg.name, success: false, reason: err.message });
      continue;
    }
    const result = await EngineBridge.load(reg.name, { target });
    results.push({ name: reg.name, ...result });
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.warn(`[EngineBridge] "${reg.name}" unavailable: ${result.reason}`);
    } else if (reg.name === 'audio') {
      await wireBrowserAudioProvider(target);
      // Real, existing event bus only (Rule 2 — no new event system).
      // Emitted for any future classic-<script> consumer that needs to know
      // window.CozyOS.AudioManager (this bridge's engine — distinct from
      // window.CozyOS.AudioEngine, see AA-004 resolution above) has loaded,
      // since this bootstrap loads engines via async dynamic import.
      // Disclosed honestly (AA-004 investigation, M387.5b): no real
      // consumer currently subscribes to this event — CozyHearing and
      // VoiceCaptureAdapter each read a synchronous global directly instead
      // (CozyHearing depends on window.CozyOS.AudioEngine, not this bridge's
      // AudioManager at all) — so this remains a real, working signal with
      // zero current subscribers, not a fabricated one.
      if (target.CozyOS.PlatformEventBus && typeof target.CozyOS.PlatformEventBus.emit === 'function') {
        try { target.CozyOS.PlatformEventBus.emit('engine-bridge:audio-ready', {}); } catch (_err) { /* non-fatal */ }
      }
    }
  }
  return results;
}

/**
 * Milestone 158 — registers the platform's one real getUserMedia provider
 * with the newly-loaded Audio Manager (window.CozyOS.AudioManager — device
 * lifecycle and mixer state; distinct from window.CozyOS.AudioEngine, the
 * separate Listening Engine cozy-hearing.js depends on, see AA-004
 * resolution above). Fails closed and non-fatally: if the provider module
 * can't load, or is already registered (e.g. a second boot() call), the
 * dashboard continues without real microphone capture rather than crashing
 * (Rule 6 / existing fail-closed convention in this file).
 */
async function wireBrowserAudioProvider(target) {
  try {
    const mod = await import('../engines/audio/provider-browser.js');
    const createBrowserAudioProvider = mod.default;
    target.CozyOS.AudioManager.registerProvider(createBrowserAudioProvider());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[EngineBridge] Real browser audio provider unavailable: ${err.message}`);
  }
}

if (typeof window !== 'undefined') {
  boot(window).then((results) => {
    const failedNames = results.filter((r) => !r.success).map((r) => r.name);
    if (failedNames.length) {
      // eslint-disable-next-line no-console
      console.warn(`[EngineBridge] boot finished with ${failedNames.length} engine(s) unavailable: ${failedNames.join(', ')}. Dashboard continues — fail closed, never crash.`);
    }
  });
}

export { boot, REGISTRATIONS };
