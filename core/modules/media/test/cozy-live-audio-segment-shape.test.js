'use strict';

/**
 * core/modules/media/test/cozy-live-audio-segment-shape.test.js
 * R040 Phase 4D, Dependency A — pure unit tests, no browser API required.
 * Run: node --test core/modules/media/test/cozy-live-audio-segment-shape.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAudioSegment, isAudioChunkSegment, SegmentOrderer, MAX_CHUNK_BASE64_BYTES } = require('../cozy-live-audio-segment-shape');

test('buildAudioSegment: builds a valid segment with defaults', () => {
    const result = buildAudioSegment({
        segmentId: 'seg-1', seq: 0, publisherId: 'user-american-1',
        sourceLanguage: 'en', mimeType: 'audio/webm;codecs=opus', audioBase64: 'QUJD',
    });
    assert.equal(result.ok, true);
    assert.equal(result.segment.kind, 'audio-chunk');
    assert.equal(result.segment.isFinal, false);
    assert.equal(result.segment.sourceLanguage, 'en');
    assert.equal(typeof result.segment.producedAt, 'number');
});

test('buildAudioSegment: rejects missing segmentId', () => {
    const result = buildAudioSegment({ seq: 0, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: 'QQ==' });
    assert.equal(result.ok, false);
    assert.match(result.reason, /segmentId/);
});

test('buildAudioSegment: rejects negative/non-integer seq', () => {
    const bad1 = buildAudioSegment({ segmentId: 's', seq: -1, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: 'QQ==' });
    const bad2 = buildAudioSegment({ segmentId: 's', seq: 1.5, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: 'QQ==' });
    assert.equal(bad1.ok, false);
    assert.equal(bad2.ok, false);
});

test('buildAudioSegment: rejects missing sourceLanguage (dynamic-language rule)', () => {
    const result = buildAudioSegment({ segmentId: 's', seq: 0, publisherId: 'u', mimeType: 'audio/webm', audioBase64: 'QQ==' });
    assert.equal(result.ok, false);
    assert.match(result.reason, /sourceLanguage/);
});

test('buildAudioSegment: rejects oversized chunk rather than truncating', () => {
    const huge = 'A'.repeat(MAX_CHUNK_BASE64_BYTES + 1);
    const result = buildAudioSegment({ segmentId: 's', seq: 0, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: huge });
    assert.equal(result.ok, false);
    assert.match(result.reason, /ceiling/);
});

test('isAudioChunkSegment: distinguishes audio-chunk from other segment kinds', () => {
    const audio = buildAudioSegment({ segmentId: 's', seq: 0, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: 'QQ==' }).segment;
    assert.equal(isAudioChunkSegment(audio), true);
    assert.equal(isAudioChunkSegment({ kind: 'caption', text: 'hi' }), false);
    assert.equal(isAudioChunkSegment(null), false);
});

test('SegmentOrderer: accepts strictly in-order chunks, rejects duplicates and gaps', () => {
    const orderer = new SegmentOrderer();
    const mk = (seq, isFinal) => buildAudioSegment({ segmentId: 'seg-x', seq, isFinal, publisherId: 'u', sourceLanguage: 'sw', mimeType: 'audio/webm', audioBase64: 'QQ==' }).segment;

    assert.equal(orderer.accept(mk(0)).accepted, true);
    assert.equal(orderer.accept(mk(0)).accepted, false); // duplicate
    assert.equal(orderer.accept(mk(2)).accepted, false); // gap (expected 1)
    const gapResult = orderer.accept(mk(2));
    assert.equal(gapResult.expected, 1);
    assert.equal(orderer.accept(mk(1)).accepted, true);
    assert.equal(orderer.accept(mk(2)).accepted, true);
    assert.equal(orderer.accept(mk(3, true)).accepted, true); // final chunk
});

test('SegmentOrderer: frees state after final chunk, allowing a NEW segmentId to start at 0 independently', () => {
    const orderer = new SegmentOrderer();
    const mk = (segId, seq, isFinal) => buildAudioSegment({ segmentId: segId, seq, isFinal, publisherId: 'u', sourceLanguage: 'en', mimeType: 'audio/webm', audioBase64: 'QQ==' }).segment;
    assert.equal(orderer.accept(mk('seg-a', 0, true)).accepted, true);
    // A second, independent segment (e.g. next speaker's testimony) starts fresh at seq 0
    assert.equal(orderer.accept(mk('seg-b', 0)).accepted, true);
});

test('SegmentOrderer: two DIFFERENT segmentIds interleave independently (no cross-segment gap false-positive)', () => {
    const orderer = new SegmentOrderer();
    const mk = (segId, seq) => buildAudioSegment({ segmentId: segId, seq, publisherId: 'u', sourceLanguage: 'yo', mimeType: 'audio/webm', audioBase64: 'QQ==' }).segment;
    assert.equal(orderer.accept(mk('seg-a', 0)).accepted, true);
    assert.equal(orderer.accept(mk('seg-b', 0)).accepted, true);
    assert.equal(orderer.accept(mk('seg-a', 1)).accepted, true);
    assert.equal(orderer.accept(mk('seg-b', 1)).accepted, true);
});
