/**
 * =============================================================================
 * CozyOS Media Engine — Language Detection Engine (M388 Engine 2)
 * File: core/engines/media/language/language-detection-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Resolves MD-012 (no automatic language-detection capability). Determines
 * the spoken/written language associated with a segment and, optionally,
 * attaches to `modules/live/cozy-live.js`'s already-reserved `CozyLanguage`
 * subsystem slot so `relaySpeechSegment()` can auto-populate
 * `detectedLanguage` in its relay result — currently always `null` when no
 * adapter is registered (confirmed live, Compose Phase 0 §3). Second of the
 * Approved 11-engine Implementation Order
 * (docs/history/M388.md, Phase 2 Review).
 *
 * HONESTY (Rule 6)
 * ------------------
 * No real acoustic language-identification model exists in this environment
 * (no trained classifier, no audio-feature pipeline) — same environment
 * constraint Engine 1 disclosed for real container decode. This engine does
 * NOT fabricate a language guess from an opaque, unanalyzable audio
 * reference. See ./provider-lexical.js for the reference provider's own
 * detailed honesty notes: real Unicode-script classification and a real
 * (but deliberately partial, disclosed) lexical-overlap heuristic are used
 * only when text is actually available for a segment; otherwise this engine
 * returns an honest `isReal:false` empty envelope, per the Implementation
 * Contract (Compose §"Implementation contract", item 4).
 *
 * SCOPE BOUNDARIES (Implementation Contract, Compose report)
 * ------------------------------------------------------------------------
 * - New file only. Does not modify `cozy-live.js`, `cozy-speech.js`,
 *   `cozy-translate.js`, or `core/modules/language/language-engine.js` —
 *   attaches to `cozy-live.js` only through its existing public
 *   `registerSubsystem()` API (contract item 3).
 * - Does not resolve MD-016 (audio-buffer -> SpeechRecognitionAdapter
 *   bridge) — explicitly out of scope, carried forward unchanged
 *   (contract item 5).
 * - Does not touch DI-004 (`core/language.js:32`'s dead
 *   `window.CozyLanguage` reference) — unrelated pre-existing issue,
 *   logged only (contract item 6).
 * - The subsystem key string `'CozyLanguage'` used inside cozy-live.js's
 *   own private `subsystems` Map is a different namespace from the global
 *   `window.CozyLanguage` referenced (but never assigned) by DI-004 — no
 *   shared state, no runtime collision (Compose §3 naming note).
 * =============================================================================
 */

'use strict';

import { createLexicalDetectProvider } from './provider-lexical.js';

const EVENTS = Object.freeze({
  DETECTED: 'language-detect:detected',
  ATTACHED: 'language-detect:attached-to-live',
  ERROR: 'language-detect:error'
});

const providers = new Map();
let activeProviderType = null;
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

function registerProvider(provider) {
  if (!provider || typeof provider.type !== 'string' || typeof provider.detectFromText !== 'function') {
    throw new TypeError('[LanguageDetectionEngine] registerProvider() requires a provider with a string `type` and a `detectFromText` method.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  return true;
}

/** Registers the default honest reference provider — matches the sibling engines' convention. */
function registerDefaultProvider(type = 'reference-lexical') {
  const provider = createLexicalDetectProvider(type);
  registerProvider(provider);
  return provider;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[LanguageDetectionEngine] no provider registered for type "${type || activeProviderType}".`);
  return p;
}

function unregisterProvider() {
  providers.clear();
  activeProviderType = null;
}

/**
 * Best-effort, documented, duck-typed extraction of any text already
 * associated with an opaque audio reference. This engine never requires
 * `audioRef` to carry text (it is opaque per cozy-live.js's own contract,
 * §"HONESTY" above) — it only uses it if present, and never invents it.
 * @param {*} audioRef
 * @param {{hintText?: string}} [options]
 * @returns {string|null}
 */
function _extractHintText(audioRef, options) {
  if (options && typeof options.hintText === 'string' && options.hintText.length > 0) {
    return options.hintText;
  }
  if (audioRef && typeof audioRef === 'object') {
    for (const key of ['hintText', 'text', 'transcript', 'captionText']) {
      if (typeof audioRef[key] === 'string' && audioRef[key].length > 0) return audioRef[key];
    }
  }
  return null;
}

/**
 * Core method (Compose "Composition plan", item 1). No existing name
 * collision confirmed against this repository during Compose.
 * @param {*} audioRef - opaque reference to raw audio; never inspected as
 *   raw bytes by this engine (no acoustic model exists this pass, see
 *   file header). May optionally carry a `hintText`/`text`/`transcript`/
 *   `captionText` string property, which — if present — is used for real,
 *   computed detection; never required.
 * @param {{hintText?: string, candidateLanguages?: string[], providerType?: string}} [options]
 * @returns {{languageCode: string|null, confidence: number, isReal: boolean, method: string}}
 */
function detectLanguage(audioRef, options = {}) {
  const provider = getProvider(options.providerType);
  try {
    const hintText = _extractHintText(audioRef, options);
    let result;
    if (hintText === null) {
      // Honest empty envelope — nothing to analyze without fabricating.
      result = { languageCode: null, confidence: 0, isReal: false, method: 'no-analyzable-signal', scored: {} };
    } else {
      result = provider.detectFromText(hintText, options.candidateLanguages);
    }
    const envelope = Object.freeze({ ...result });
    emit(EVENTS.DETECTED, {
      languageCode: envelope.languageCode,
      confidence: envelope.confidence,
      isReal: envelope.isReal,
      method: envelope.method
    });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/**
 * Optional, read-only cross-reference of a detected code against
 * cozy-speech.js's own language directory (Compose "Composition plan",
 * item 3) — never registers into it, never modifies cozy-speech.js.
 * @param {string} languageCode
 * @param {{listLanguages: () => Array<{languageCode:string,name?:string}>}} cozySpeech - a real, running CozySpeech instance
 * @returns {{languageCode: string, name: string|null}}
 */
function crossReferenceName(languageCode, cozySpeech) {
  if (!languageCode) return { languageCode: null, name: null };
  if (!cozySpeech || typeof cozySpeech.listLanguages !== 'function') {
    return { languageCode, name: null };
  }
  const match = cozySpeech.listLanguages().find((l) => l.languageCode === languageCode);
  return { languageCode, name: match && typeof match.name === 'string' ? match.name : null };
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  return Object.freeze({
    // Only languages this pass has a real, curated reference lexicon for
    // (provider-lexical.js) — deliberately partial, honestly disclosed.
    lexiconLanguages: typeof provider.lexiconLanguages === 'function' ? provider.lexiconLanguages() : [],
    // Real, deterministic — Unicode script classification never fabricated.
    scriptClassification: ['ethiopic', 'latin-or-other'],
    // No acoustic (audio-feature) language-ID model exists this pass —
    // honestly false, matching Engine 1's realDecode:false precedent.
    realAcousticDetection: false
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'language-detection-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 15,
    mandatory: false,
    // No blocking dependency within M388 (Compose §6/§7) — soft, shared
    // dependency with MD-016 only, not resolved by or blocking this engine.
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[LanguageDetectionEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

/**
 * Registers this engine as the `CozyLanguage` subsystem adapter into the
 * EXISTING cozy-live.js orchestrator's registry, via its own public
 * `registerSubsystem()` API — cozy-live.js itself is never modified (same
 * non-invasive composition pattern as Engine 1's `attachToCoordinator()`).
 * @param {{registerSubsystem: (name: string, adapter: object) => boolean}} cozyLive - the running window.CozyOS.CozyLive/OurCozyLive instance
 */
function attachToLive(cozyLive) {
  if (!cozyLive || typeof cozyLive.registerSubsystem !== 'function') {
    throw new Error('[LanguageDetectionEngine] attachToLive() requires a real cozy-live.js instance exposing registerSubsystem().');
  }
  const adapter = Object.freeze({
    // Matches the exact shape relaySpeechSegment() already expects and
    // ourcozy-live.test.js:773-784 already exercises with a mock:
    // detectLanguage(sourceAudioRef) -> { languageCode }.
    detectLanguage: (sourceAudioRef) => {
      const result = detectLanguage(sourceAudioRef);
      // cozy-live.js only reads `.languageCode` off this return value
      // (relaySpeechSegment, per Compose §3) — full envelope (confidence/
      // isReal/method) remains available via this engine's own
      // detectLanguage() for any caller that wants it directly.
      return { languageCode: result.languageCode };
    }
  });
  cozyLive.registerSubsystem('CozyLanguage', adapter);
  attachedSubsystemName = 'CozyLanguage';
  emit(EVENTS.ATTACHED, { name: 'CozyLanguage' });
  return Object.freeze({ name: 'CozyLanguage' });
}

function getStatus() {
  return Object.freeze({
    attachedToLive: Boolean(attachedSubsystemName),
    subsystemName: attachedSubsystemName
  });
}

function __resetForTests() {
  providers.clear();
  activeProviderType = null;
  attachedSubsystemName = null;
  listeners.clear();
}

const LanguageDetectionEngine = Object.freeze({
  EVENTS,
  on,
  registerProvider,
  registerDefaultProvider,
  unregisterProvider,
  getProvider,
  detectLanguage,
  crossReferenceName,
  getCapabilities,
  getStatus,
  attachToLive,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default LanguageDetectionEngine;
