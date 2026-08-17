/**
 * =============================================================================
 * CozyOS Subtitle Timeline Engine — Reference SRT Formatter Provider
 * File: core/engines/media/subtitles/provider-srt-formatter.js
 * =============================================================================
 *
 * NOT A TRANSCRIPTION, TRANSLATION, OR TIMING-INFERENCE MODEL (Rule 6 —
 * Honest Engineering).
 *
 * This provider does not listen to audio, does not translate, and does not
 * guess when a line of dialogue starts or ends. It performs real,
 * deterministic work on data the caller already has:
 *
 *   1. Building a real, ordered cue list from segments that already carry
 *      real text and real millisecond timing (`startMs`/`endMs`) — e.g.
 *      the output of a real ASR transcript, Engine 3's own translate()
 *      composed with the original media's real cue points, or a
 *      human-authored transcript. This is real bookkeeping (sorting,
 *      sequential cue numbering, SRT timestamp formatting), not
 *      fabrication.
 *   2. Detecting real, computable overlaps (segment i's `endMs` greater
 *      than segment i+1's `startMs` after sorting) and reporting them —
 *      never silently rendering a broken/overlapping timeline as if it
 *      were clean.
 *   3. Honestly skipping (and reporting, not silently dropping) any
 *      segment missing real text or valid timing — never inventing
 *      placeholder cue text or a guessed timestamp.
 *
 * A production deployment swaps this provider for one that also handles,
 * e.g., automatic line-wrapping or reading-speed constraints, without
 * changing SubtitleTimelineEngine's own interface — same provider-swap
 * pattern as every other Media Engine sub-engine.
 * =============================================================================
 */

'use strict';

/**
 * Formats a millisecond timestamp as an SRT timestamp: HH:MM:SS,mmm.
 * Real, deterministic math — no guessing.
 * @param {number} ms
 * @returns {string}
 */
function _formatSrtTimestamp(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}

function _hasValidSegment(segment) {
  return (
    segment &&
    typeof segment.segmentId === 'string' &&
    typeof segment.text === 'string' &&
    segment.text.trim().length > 0 &&
    Number.isFinite(segment.startMs) &&
    Number.isFinite(segment.endMs) &&
    segment.endMs > segment.startMs
  );
}

/**
 * Real, deterministic cue-list construction + overlap detection.
 * @param {Array<{segmentId: string, text?: string, startMs?: number, endMs?: number}>} segments
 * @returns {{cues: Array<{cueNumber: number, segmentId: string, text: string, startMs: number, endMs: number}>, skippedSegmentIds: string[], overlaps: Array<{segmentId: string, overlapsWithSegmentId: string}>, isReal: boolean, method: string}}
 */
function buildTimeline(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return Object.freeze({ cues: [], skippedSegmentIds: [], overlaps: [], isReal: false, method: 'no-analyzable-signal' });
  }

  const skippedSegmentIds = [];
  const valid = [];
  for (const segment of segments) {
    if (_hasValidSegment(segment)) {
      valid.push(segment);
    } else if (segment && typeof segment.segmentId === 'string') {
      skippedSegmentIds.push(segment.segmentId);
    }
  }

  if (valid.length === 0) {
    return Object.freeze({ cues: [], skippedSegmentIds: Object.freeze(skippedSegmentIds), overlaps: [], isReal: false, method: 'no-analyzable-signal' });
  }

  const sorted = [...valid].sort((a, b) => a.startMs - b.startMs);

  const overlaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endMs > sorted[i + 1].startMs) {
      overlaps.push({ segmentId: sorted[i].segmentId, overlapsWithSegmentId: sorted[i + 1].segmentId });
    }
  }

  const cues = sorted.map((segment, index) => Object.freeze({
    cueNumber: index + 1,
    segmentId: segment.segmentId,
    text: segment.text,
    startMs: segment.startMs,
    endMs: segment.endMs
  }));

  return Object.freeze({
    cues: Object.freeze(cues),
    skippedSegmentIds: Object.freeze(skippedSegmentIds),
    overlaps: Object.freeze(overlaps),
    isReal: true,
    method: 'real-cue-timeline'
  });
}

/**
 * Real, deterministic SRT text export from an already-built timeline
 * (i.e. the output of buildTimeline()). Never called on raw segments —
 * callers must build the timeline first so overlaps/skips are visible
 * before export.
 * @param {{cues: Array<{cueNumber: number, text: string, startMs: number, endMs: number}>}} timeline
 * @returns {string}
 */
function toSrt(timeline) {
  if (!timeline || !Array.isArray(timeline.cues) || timeline.cues.length === 0) return '';
  return timeline.cues
    .map((cue) => `${cue.cueNumber}\n${_formatSrtTimestamp(cue.startMs)} --> ${_formatSrtTimestamp(cue.endMs)}\n${cue.text}\n`)
    .join('\n')
    .trimEnd() + '\n';
}

function createSrtFormatterProvider(type = 'reference-srt-formatter') {
  return Object.freeze({
    type,
    buildTimeline,
    toSrt
  });
}

export { createSrtFormatterProvider, buildTimeline, toSrt, _formatSrtTimestamp };
