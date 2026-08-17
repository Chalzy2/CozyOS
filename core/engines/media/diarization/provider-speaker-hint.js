/**
 * =============================================================================
 * CozyOS Speaker Diarization Engine — Reference Speaker-Hint Provider
 * File: core/engines/media/diarization/provider-speaker-hint.js
 * =============================================================================
 *
 * NOT A REAL ACOUSTIC DIARIZATION MODEL (Rule 6 — Honest Engineering).
 *
 * This runtime has no speaker-embedding model, no pitch/MFCC feature
 * pipeline, and no clustering backend that operates on real audio samples —
 * and per M388 Engine 1's own disclosed `isReal:false` audio-track envelope
 * (`media-decode-engine.js`/`provider-inmemory.js`), there is no real
 * decoded audio in this environment to feed one even if it existed. This
 * provider does two things honestly instead of fabricating speaker
 * boundaries from an opaque signal:
 *
 *   1. Turn-grouping from EXPLICIT, caller-supplied speaker hints is REAL,
 *      executed, deterministic bookkeeping — not a guess. If a segment
 *      carries a `speakerHint` (duck-typed, exactly the same opt-in pattern
 *      Engine 2's `provider-lexical.js` uses for `hintText`), contiguous
 *      same-hint segments are grouped into a turn and a stable speaker
 *      label is derived from the hint. This is real grouping logic, not
 *      audio analysis — the hint itself must already be known to the
 *      caller (e.g. a human-tagged transcript, an already-labeled test
 *      fixture, or a future real backend's own output fed back in).
 *   2. With no hint on any segment, `diarizeSegments()` returns an honest,
 *      documented empty envelope (`isReal:false`, `method:'no-analyzable-
 *      signal'`) instead of inventing a speaker count or turn boundaries
 *      it cannot actually derive.
 *
 * A production deployment swaps this provider for a real acoustic
 * diarization backend (embedding extraction + clustering, e.g. against
 * real decoded PCM once Engine 1 has one) without changing
 * SpeakerDiarizationEngine's own interface — the same provider-swap
 * pattern used by every other Media Engine sub-engine (Engine 1's
 * provider-inmemory.js, Engine 2's provider-lexical.js).
 * =============================================================================
 */

'use strict';

/**
 * Best-effort, documented, duck-typed extraction of a caller-supplied
 * speaker hint from a segment. Never required — a segment with no hint is
 * honestly treated as unanalyzable, never guessed at.
 * @param {*} segment
 * @returns {string|null}
 */
function _extractSpeakerHint(segment) {
  if (!segment || typeof segment !== 'object') return null;
  for (const key of ['speakerHint', 'speakerLabel', 'speakerTag']) {
    if (typeof segment[key] === 'string' && segment[key].length > 0) return segment[key];
  }
  return null;
}

/**
 * Real, deterministic grouping of contiguous same-hint segments into turns.
 * A "turn" ends the instant the hint changes (or is absent) — no smoothing,
 * no fabricated merging across a gap.
 * @param {Array<{segmentId: string}>} segments
 * @returns {Array<{speakerHint: string, segmentIds: string[]}>}
 */
function _groupContiguousTurns(segments) {
  const turns = [];
  let current = null;
  for (const segment of segments) {
    const hint = _extractSpeakerHint(segment);
    if (hint === null) {
      current = null;
      continue;
    }
    if (current && current.speakerHint === hint) {
      current.segmentIds.push(segment.segmentId);
    } else {
      current = { speakerHint: hint, segmentIds: [segment.segmentId] };
      turns.push(current);
    }
  }
  return turns;
}

/**
 * Core method (Final Implementation Contract item 5's honesty boundary).
 * @param {Array<{segmentId: string, speakerHint?: string, speakerLabel?: string, speakerTag?: string}>} segments
 * @returns {{turns: Array<{speakerHint: string, segmentIds: string[]}>, speakerCount: number, isReal: boolean, method: string}}
 */
function diarizeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return Object.freeze({ turns: [], speakerCount: 0, isReal: false, method: 'no-analyzable-signal' });
  }
  const turns = _groupContiguousTurns(segments);
  if (turns.length === 0) {
    // Every segment lacked a hint — honest empty envelope, not a guess.
    return Object.freeze({ turns: [], speakerCount: 0, isReal: false, method: 'no-analyzable-signal' });
  }
  const distinctHints = new Set(turns.map((t) => t.speakerHint));
  return Object.freeze({
    turns: Object.freeze(turns.map((t) => Object.freeze({ ...t, segmentIds: Object.freeze(t.segmentIds) }))),
    speakerCount: distinctHints.size,
    isReal: true,
    method: 'explicit-speaker-hint-grouping'
  });
}

function createSpeakerHintProvider(type = 'reference-speaker-hint') {
  return Object.freeze({
    type,
    diarizeSegments
  });
}

export { createSpeakerHintProvider, diarizeSegments, _extractSpeakerHint, _groupContiguousTurns };
