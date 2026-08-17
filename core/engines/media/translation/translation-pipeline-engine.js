/**
 * =============================================================================
 * CozyOS Media Engine — Translation Pipeline Engine (M388 Engine 3)
 * File: core/engines/media/translation/translation-pipeline-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Resolves the 'CozyTranslate' half of MD-017 (no production registrant for
 * cozy-live.js's mandatory 'CozyTranslate' subsystem slot). Composes the
 * already-real core/modules/translate/cozy-translate.js +
 * core/modules/speech/adapters/speech-translation-adapter.js +
 * speech-translation-provider.js chain into modules/live/cozy-live.js's
 * reserved 'CozyTranslate' subsystem so relaySpeechSegment() can complete a
 * real call in production. Per AA-005's closure (docs/history/M388.md,
 * Phase 2 Review) this engine also absorbs the scope that would have been a
 * separate "Living Meaning Engine" — no distinct semantic-understanding
 * stage is built; translation is literal MT via whatever real provider is
 * registered with SpeechTranslationProviders, honestly disclosed as such.
 * Third of the Approved 11-engine Implementation Order
 * (docs/history/M388.md, Phase 2 Review).
 *
 * HONESTY (Rule 6)
 * ------------------
 * No bundled machine-translation model or vendor exists in this environment
 * (MD-007, structurally Out of Scope this milestone — the original task's
 * own Out of Scope list names "Licensing of translation/voice models"). This
 * engine never fabricates a translation. It delegates to
 * speech-translation-adapter.js's real previewTranslation(), which itself
 * delegates to speech-translation-provider.js's real, already-existing
 * "NEVER FABRICATE" convention: if no real provider (e.g. Chrome's
 * experimental on-device self.Translator) is registered, the result is an
 * honest { text: null, isReal: false } envelope — never invented text, and
 * never an unhandled thrown exception mid-translation.
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, M388-E3-Translation-Compose.md, Phase 2)
 * ------------------------------------------------------------------------
 * 1. New file only, under core/engines/media/translation/ — no existing
 *    file modified by this file itself.
 * 2. cozy-live.js, cozy-translate.js, speech-translation-adapter.js, and
 *    speech-translation-provider.js all remain untouched. MD-018
 *    (detectedLanguage computed but never forwarded inside
 *    relaySpeechSegment) is explicitly NOT resolved here — Phase 2 Review
 *    decided no exception is granted; MD-018 remains open, unassigned,
 *    carried forward, same treatment as MD-016.
 * 3. Attaches to cozy-live.js only through its own existing public
 *    registerSubsystem('CozyTranslate', adapter) API — never reaches into
 *    its internals.
 * 4. The adapter's translate(text, sourceLanguage, targetLanguage) method
 *    returns { text: string|null }, matching relaySpeechSegment()'s exact
 *    existing read and ourcozy-live.test.js's existing 8 mocks.
 * 5. Preserves the existing chain's "NEVER FABRICATE" convention — an
 *    honest failure (not a thrown, unhandled exception, and not invented
 *    text) when no real provider is registered.
 * 6. Does not resolve MD-007 (bundled MT) — structurally Out of Scope this
 *    milestone.
 * 7. Does not resolve MD-016 (STT bridge) or the 'CozySpeech' half of
 *    MD-017 — explicitly out of scope, carried forward, unassigned.
 * 8. Does not resolve MD-018 — decided at Phase 2 Review, not left open as
 *    a question; remains an unassigned finding for a future, narrowly
 *    scoped, single-line fix session of its own.
 *
 * NAMING NOTE
 * -----------
 * The string key 'CozyTranslate' used inside cozy-live.js's own private
 * subsystems Map is a different namespace from the real, already-existing
 * window.CozyOS.CozyTranslate global (core/modules/translate/cozy-translate.js)
 * — no runtime collision, same disambiguation Engine 2 already documented
 * for 'CozyLanguage' vs. window.CozyLanguage.
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  TRANSLATED: 'translation-pipeline:translated',
  ATTACHED: 'translation-pipeline:attached-to-live',
  ERROR: 'translation-pipeline:error'
});

const listeners = new Map();
let attachedSubsystemName = null;

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

function emit(eventName, payload) {
  const handlers = listeners.get(eventName);
  if (!handlers) return;
  for (const handler of handlers) handler(payload);
}

/**
 * Core method (Final Implementation Contract item 4). Delegates to the
 * real, already-existing speech-translation-adapter.js — composing, not
 * reimplementing, translation logic (contract item 4). Uses
 * previewTranslation() specifically because it is the adapter's real,
 * stateless, no-session-required entry point (§"Text-only, per spec" in
 * speech-translation-adapter.js) — matching relaySpeechSegment()'s own
 * per-segment (not per-session) call shape, and avoiding an unnecessary
 * CozyTranslate session per spoken segment.
 * @param {{previewTranslation: (text: string, opts: {sourceLanguage:string, targetLanguage:string}) => Promise<{isReal:boolean, translatedText:string|null, reason?:string}>}} speechTranslationAdapter
 *   - the real, running window.CozyOS.SpeechTranslationAdapter instance.
 * @param {string} text - already-transcribed text (never audio/bytes).
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @returns {Promise<{text: string|null, isReal: boolean, reason?: string}>}
 */
async function translateSegment(speechTranslationAdapter, text, sourceLanguage, targetLanguage) {
  try {
    if (!speechTranslationAdapter || typeof speechTranslationAdapter.previewTranslation !== 'function') {
      // Honest failure, not a thrown exception (contract item 5) — the
      // real adapter simply is not loaded in this environment/page.
      const envelope = { text: null, isReal: false, reason: 'SpeechTranslationAdapter is not loaded. Failing closed.' };
      emit(EVENTS.ERROR, envelope);
      return envelope;
    }
    if (typeof text !== 'string' || !text.trim()) {
      const envelope = { text: null, isReal: false, reason: 'No text to translate. Failing closed.' };
      return envelope;
    }
    if (!sourceLanguage || !targetLanguage) {
      const envelope = { text: null, isReal: false, reason: 'sourceLanguage and targetLanguage are required. Failing closed.' };
      return envelope;
    }
    const result = await speechTranslationAdapter.previewTranslation(text, { sourceLanguage, targetLanguage });
    // speech-translation-provider.js's own honest envelope shape:
    // { isReal, translatedText, reason? } — reshaped here to cozy-live.js's
    // exact expected { text } shape (contract item 4), never adding an
    // unearned isReal:true claim of our own.
    const envelope = { text: result.isReal ? result.translatedText : null, isReal: Boolean(result.isReal), reason: result.reason };
    if (envelope.isReal) {
      emit(EVENTS.TRANSLATED, { sourceLanguage, targetLanguage, text: envelope.text });
    } else {
      emit(EVENTS.ERROR, envelope);
    }
    return envelope;
  } catch (err) {
    // Any unexpected internal error is still surfaced as an honest
    // failure envelope, never left as an unhandled exception mid-
    // translation (contract item 5).
    const envelope = { text: null, isReal: false, reason: err.message };
    emit(EVENTS.ERROR, envelope);
    return envelope;
  }
}

/** Honest capability report — mirrors what SpeechTranslationProviders itself can currently do; never fabricates support. */
function getCapabilities() {
  const providers = typeof window !== 'undefined' ? window.CozyOS?.SpeechTranslationProviders : null;
  if (!providers || typeof providers.getCapabilities !== 'function') {
    return Object.freeze({ supportsTranslation: false, supportsRealtimeTranslation: false, supportsOfflineTranslation: false, supportsAutoDetectLanguage: false, supportsStreamingTranslation: false });
  }
  return providers.getCapabilities();
}

function getServiceManifest() {
  return Object.freeze({
    name: 'translation-pipeline-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 16,
    mandatory: false,
    // No blocking dependency within M388 (Compose §5/Phase 0 §7) — no
    // hard dependency on Engine 1's decode output; soft, non-blocking,
    // NOT wired dependency on Engine 2's detectedLanguage (MD-018, not
    // resolved by this engine).
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[TranslationPipelineEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

/**
 * Registers this engine as the 'CozyTranslate' subsystem adapter into the
 * EXISTING cozy-live.js orchestrator's registry, via its own public
 * registerSubsystem() API — cozy-live.js itself is never modified (same
 * non-invasive composition pattern as Engine 2's attachToLive()).
 * @param {{registerSubsystem: (name: string, adapter: object) => boolean}} cozyLive
 *   - the running window.CozyOS.CozyLive/OurCozyLive instance.
 * @param {object} [speechTranslationAdapter] - defaults to
 *   window.CozyOS.SpeechTranslationAdapter when omitted (browser runtime).
 */
function attachToLive(cozyLive, speechTranslationAdapter) {
  if (!cozyLive || typeof cozyLive.registerSubsystem !== 'function') {
    throw new Error('[TranslationPipelineEngine] attachToLive() requires a real cozy-live.js instance exposing registerSubsystem().');
  }
  const adapterRef = speechTranslationAdapter
    || (typeof window !== 'undefined' ? window.CozyOS?.SpeechTranslationAdapter : null);

  const adapter = Object.freeze({
    // Matches the exact shape relaySpeechSegment() already reads and
    // ourcozy-live.test.js's 8 existing mocks already exercise:
    // translate(text, sourceLanguage, targetLanguage) -> { text }.
    translate: async (text, sourceLanguage, targetLanguage) => {
      const result = await translateSegment(adapterRef, text, sourceLanguage, targetLanguage);
      // cozy-live.js's relaySpeechSegment() only reads `.text` off this
      // return value (Final Implementation Contract item 4) — the full
      // envelope (isReal/reason) remains available via this engine's own
      // translateSegment() for any caller that wants it directly.
      return { text: result.text };
    }
  });
  cozyLive.registerSubsystem('CozyTranslate', adapter);
  attachedSubsystemName = 'CozyTranslate';
  emit(EVENTS.ATTACHED, { name: 'CozyTranslate' });
  return Object.freeze({ name: 'CozyTranslate' });
}

function getStatus() {
  return Object.freeze({
    attachedToLive: Boolean(attachedSubsystemName),
    subsystemName: attachedSubsystemName
  });
}

function __resetForTests() {
  attachedSubsystemName = null;
  listeners.clear();
}

const TranslationPipelineEngine = Object.freeze({
  EVENTS,
  on,
  translateSegment,
  getCapabilities,
  getStatus,
  attachToLive,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default TranslationPipelineEngine;
