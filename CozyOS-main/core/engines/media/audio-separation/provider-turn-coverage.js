/**
 * =============================================================================
 * CozyOS Background Audio Separation Engine — Reference Turn-Coverage Provider
 * File: core/engines/media/audio-separation/provider-turn-coverage.js
 * =============================================================================
 *
 * NOT A REAL ACOUSTIC SOURCE-SEPARATION MODEL (Rule 6 — Honest Engineering).
 *
 * This runtime has no spectral/embedding-based speech-vs-background
 * separation backend, and — per M388 Engine 1's own disclosed
 * `isReal:false` audio-track envelope — no real decoded audio samples
 * exist anywhere in this environment for such a model to operate on even
 * if one existed. This provider does two things honestly instead of
 * fabricating a separation:
 *
 *   1. Partitioning segments by real, computed Engine 4 (Speaker
 *      Diarization) turn coverage IS real, executed bookkeeping — not a
 *      guess. A segment whose `segmentId` appears in one of Engine 4's
 *      own real diarization turns is genuinely attributed speech (Engine
 *      4 only produces a turn from an explicit, caller-supplied speaker
 *      hint — never a fabricated one, per its own honesty convention).
 *   2. A segment NOT covered by any turn is labeled `unclassified`, never
 *      `background` — this provider has no positive signal that an
 *      uncovered segment actually contains background/ambient audio
 *      rather than, say, an unlabeled speaker or silence. Claiming
 *      "background" from mere absence of a turn would be exactly the
 *      kind of unearned inference Engine 2/4 already refuse to make.
 *      With no diarization data at all, `partitionSegments()` returns an
 *      honest, documented empty envelope (`isReal:false`, `method:'no-
 *      analyzable-signal'`).
 *
 * A production deployment swaps this provider for a real acoustic
 * separation backend (e.g. spectral masking or a learned separation
 * model, run against real decoded PCM once Engine 1 has one) without
 * changing BackgroundAudioSeparationEngine's own interface — the same
 * provider-swap pattern used by every other Media Engine sub-engine
 * (Engine 1's provider-inmemory.js, Engine 2's provider-lexical.js,
 * Engine 4's provider-speaker-hint.js).
 * =============================================================================
 */

'use strict';

/**
 * Real, deterministic partition of segments by diarization-turn coverage.
 * @param {Array<{segmentId: string}>} segments - the full segment list to partition
 * @param {{turns?: Array<{segmentIds: string[]}>}} diarizationResult - the output of Engine 4's diarize()
 * @returns {{speechSegmentIds: string[], unclassifiedSegmentIds: string[], isReal: boolean, method: string}}
 */
function partitionSegments(segments, diarizationResult) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return Object.freeze({ speechSegmentIds: [], unclassifiedSegmentIds: [], isReal: false, method: 'no-analyzable-signal' });
  }
  const turns = diarizationResult && Array.isArray(diarizationResult.turns) ? diarizationResult.turns : [];
  if (turns.length === 0) {
    // No real diarization signal to partition against — honest empty
    // envelope, not a guess at which segments are background.
    return Object.freeze({ speechSegmentIds: [], unclassifiedSegmentIds: [], isReal: false, method: 'no-analyzable-signal' });
  }
  const coveredIds = new Set();
  for (const turn of turns) {
    if (!Array.isArray(turn.segmentIds)) continue;
    for (const id of turn.segmentIds) coveredIds.add(id);
  }
  const speechSegmentIds = [];
  const unclassifiedSegmentIds = [];
  for (const segment of segments) {
    if (!segment || typeof segment.segmentId !== 'string') continue;
    if (coveredIds.has(segment.segmentId)) {
      speechSegmentIds.push(segment.segmentId);
    } else {
      unclassifiedSegmentIds.push(segment.segmentId);
    }
  }
  return Object.freeze({
    speechSegmentIds: Object.freeze(speechSegmentIds),
    unclassifiedSegmentIds: Object.freeze(unclassifiedSegmentIds),
    isReal: true,
    method: 'diarization-turn-coverage'
  });
}

function createTurnCoverageProvider(type = 'reference-turn-coverage') {
  return Object.freeze({
    type,
    partitionSegments
  });
}

export { createTurnCoverageProvider, partitionSegments };
