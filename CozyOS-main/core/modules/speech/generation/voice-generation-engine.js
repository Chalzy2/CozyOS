/**
 * =============================================================================
 * CozyOS Voice Generation Engine — Engine 7 of the M388 Approved
 * Implementation Order ("Living Media Interpreter")
 * File: core/modules/speech/generation/voice-generation-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Given a translated text segment (Engine 3) and its speaker (Engine 4),
 * requests synthesized speech for that segment and returns a real,
 * honestly-labeled result set for Engine 8 (Synchronization) to consume.
 *
 * OWNERSHIP (per docs/history/M388-E7-VoiceGeneration-Compose.md §3,
 * confirmed by that report's Phase 2 Review)
 * ------------------------------------------------------------------------
 * This file owns segment-to-speech ORCHESTRATION ONLY. It composes,
 * never reimplements or modifies:
 *   - window.CozyOS.VoiceManager.speak() — real provider routing +
 *     fallback chain (preferred).
 *   - window.CozyOS.CozyTTSBrowserAdapter.speakPreview() — real, generic
 *     Web Speech API playback (used only if VoiceManager is unavailable,
 *     the same two-tier pattern VoiceManager itself already uses
 *     internally for its own last-resort fallback).
 * Neither of those two files is modified by this engine.
 *
 * HONEST, DISCLOSED LIMITATION (Compose §2/§9, MD-020 — confirmed at
 * Phase 2 Review, not resolved by this Implementation)
 * ------------------------------------------------------------------------
 * The Web Speech API is playback-only — there is no standard, verified
 * way in this environment to capture synthesized speech as an audio
 * buffer/track. Every result this engine returns carries
 * `realAudioBuffer: false` for that reason. This is not a placeholder for
 * later — it is the honest, disclosed shape of what this engine can
 * produce today. Engine 9 (Media Encode) cannot yet receive audio bytes
 * from this engine; that gap is tracked as MD-020, not silently hidden
 * here.
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  SEGMENT_SPOKEN: 'voice-generation:segment-spoken',
  SEGMENT_FAILED: 'voice-generation:segment-failed',
  ERROR: 'voice-generation:error'
});

const listeners = new Map();

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
 * Resolves the real speech backend to use, per the Compose Report's
 * composition order: VoiceManager preferred, CozyTTSBrowserAdapter as a
 * direct fallback only if VoiceManager itself isn't present. Injectable
 * for real, non-mocked-DOM testing (Compose §12 item 4) — defaults to the
 * real global objects when not supplied.
 */
function _resolveBackend(injected) {
  const voiceManager = injected?.voiceManager
    ?? (typeof window !== 'undefined' ? window.CozyOS?.VoiceManager : undefined);
  const browserAdapter = injected?.browserAdapter
    ?? (typeof window !== 'undefined' ? window.CozyOS?.CozyTTSBrowserAdapter : undefined);
  return { voiceManager, browserAdapter };
}

/**
 * Generates speech for one segment.
 * @param {{segmentId: string, text: string, speakerId?: string, context?: string, settingsId?: string}} segment
 * @param {{voiceManager?: object, browserAdapter?: object}} [deps] - injectable for tests; real globals otherwise
 * @returns {Promise<{segmentId, played, providerId, reason, realAudioBuffer}>}
 */
async function generateSpeechForSegment(segment, deps = {}) {
  if (!segment || typeof segment.segmentId !== 'string' || typeof segment.text !== 'string') {
    throw new TypeError('[VoiceGenerationEngine] generateSpeechForSegment() requires a segment with a string `segmentId` and `text`.');
  }
  const { voiceManager, browserAdapter } = _resolveBackend(deps);

  const buildResult = (played, providerId, reason) => Object.freeze({
    segmentId: segment.segmentId,
    played,
    providerId: providerId ?? null,
    reason: reason ?? null,
    realAudioBuffer: false // Honest — see file header. Never true in this pass.
  });

  try {
    if (voiceManager && typeof voiceManager.speak === 'function') {
      const result = await voiceManager.speak({
        text: segment.text,
        context: segment.context,
        settingsId: segment.settingsId
      });
      const outcome = buildResult(Boolean(result?.played), result?.providerId, result?.reason);
      emit(outcome.played ? EVENTS.SEGMENT_SPOKEN : EVENTS.SEGMENT_FAILED, outcome);
      return outcome;
    }

    if (browserAdapter && typeof browserAdapter.speakPreview === 'function') {
      const result = await browserAdapter.speakPreview({ text: segment.text, settingsId: segment.settingsId });
      const outcome = buildResult(Boolean(result?.played), result?.played ? 'browser' : null, result?.reason);
      emit(outcome.played ? EVENTS.SEGMENT_SPOKEN : EVENTS.SEGMENT_FAILED, outcome);
      return outcome;
    }

    const outcome = buildResult(false, null, 'Neither VoiceManager nor CozyTTSBrowserAdapter is available. Fail closed — no fabricated speech.');
    emit(EVENTS.SEGMENT_FAILED, outcome);
    return outcome;
  } catch (err) {
    emit(EVENTS.ERROR, { segmentId: segment.segmentId, message: err.message });
    return buildResult(false, null, `Real backend threw: ${err.message}`);
  }
}

/**
 * Generates speech for a list of segments, sequentially (the Web Speech
 * API has no batch mode — see Compose §8). Never throws for an
 * individual segment's failure; each result is honestly reported.
 * @param {Array} segments
 * @param {object} [deps]
 * @returns {Promise<Array>}
 */
async function generateSpeechForSegments(segments, deps = {}) {
  if (!Array.isArray(segments)) {
    throw new TypeError('[VoiceGenerationEngine] generateSpeechForSegments() requires an array of segments.');
  }
  const results = [];
  for (const segment of segments) {
    results.push(await generateSpeechForSegment(segment, deps));
  }
  return results;
}

function getCapabilities() {
  return Object.freeze({
    realAudioBuffer: false,
    realPlayback: true,
    batchMode: false,
    voiceCloning: false // MD-008, Out of Scope this milestone — never claimed
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'voice-generation-engine', version: '1.0.0', apiVersion: '1.0.0',
    priority: 34, mandatory: false, dependencies: ['CozySpeech']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[VoiceGenerationEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

const VoiceGenerationEngine = Object.freeze({
  EVENTS, on,
  generateSpeechForSegment, generateSpeechForSegments,
  getCapabilities,
  getServiceManifest, registerWithKernel
});

export default VoiceGenerationEngine;
