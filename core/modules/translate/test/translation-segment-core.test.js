/**
 * core/modules/translate/test/translation-segment-core.test.js
 * Run with: node --test core/modules/translate/test/translation-segment-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'translation-segment-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.TranslationSegmentCore;
}

const { buildSegment, derivePauseMetadata, deriveSourceTiming, getLipsyncStatus } = load();

// --- derivePauseMetadata ---

test('derivePauseMetadata computes a real duration from two real timestamps', () => {
    const result = derivePauseMetadata({ previousSegmentEndedAt: 1000, currentSegmentStartedAt: 1450 });
    assert.equal(result.available, true);
    assert.equal(result.durationMs, 450);
});

test('derivePauseMetadata is unavailable when either timestamp is missing — never estimates a pause', () => {
    assert.equal(derivePauseMetadata({ previousSegmentEndedAt: 1000 }).available, false);
    assert.equal(derivePauseMetadata({ currentSegmentStartedAt: 1000 }).available, false);
    assert.equal(derivePauseMetadata({}).available, false);
    assert.equal(derivePauseMetadata().available, false);
});

test('derivePauseMetadata rejects a negative/impossible duration rather than reporting a fabricated pause', () => {
    const result = derivePauseMetadata({ previousSegmentEndedAt: 2000, currentSegmentStartedAt: 1000 });
    assert.equal(result.available, false);
});

test('derivePauseMetadata never accepts non-numeric timestamps', () => {
    assert.equal(derivePauseMetadata({ previousSegmentEndedAt: 'now', currentSegmentStartedAt: 1000 }).available, false);
    assert.equal(derivePauseMetadata({ previousSegmentEndedAt: NaN, currentSegmentStartedAt: 1000 }).available, false);
});

// --- deriveSourceTiming ---

test('deriveSourceTiming passes through only the real numeric fields actually supplied', () => {
    const result = deriveSourceTiming({ startRequestedAt: 100, recognitionStartedAt: 150, firstInterimAt: null, firstFinalAt: 900 });
    assert.deepEqual(result, { startRequestedAt: 100, recognitionStartedAt: 150, firstFinalAt: 900 });
});

test('deriveSourceTiming returns null when no real timing data exists at all — never fabricates a timing object', () => {
    assert.equal(deriveSourceTiming(null), null);
    assert.equal(deriveSourceTiming({}), null);
    assert.equal(deriveSourceTiming({ startRequestedAt: null, firstFinalAt: null }), null);
});

test('deriveSourceTiming ignores unknown/unexpected fields rather than passing them through blindly', () => {
    const result = deriveSourceTiming({ startRequestedAt: 100, somethingUnexpected: 999 });
    assert.deepEqual(result, { startRequestedAt: 100 });
});

// --- getLipsyncStatus ---

test('getLipsyncStatus always honestly reports unavailable — no phoneme/viseme provider exists', () => {
    const status = getLipsyncStatus();
    assert.equal(status.available, false);
    assert.match(status.reason, /pending real provider/);
});

test('getLipsyncStatus never varies its answer regardless of how many times it is called', () => {
    assert.deepEqual(getLipsyncStatus(), getLipsyncStatus());
});

// --- buildSegment ---

test('buildSegment assembles the full structured contract with real, caller-supplied values', () => {
    const segment = buildSegment({
        segmentId: 'seg-1',
        sourceLanguage: 'sw',
        targetLanguage: 'en',
        sourceText: 'Habari za asubuhi',
        translatedText: 'Good morning',
        context: { type: 'sermon' },
        confidence: 0.87,
        voiceId: 'charles',
        sourceTiming: { startRequestedAt: 100, firstFinalAt: 900 },
        pauseMetadata: { available: true, durationMs: 400 },
        now: () => 12345,
    });
    assert.equal(segment.segmentId, 'seg-1');
    assert.equal(segment.sourceLanguage, 'sw');
    assert.equal(segment.targetLanguage, 'en');
    assert.equal(segment.sourceText, 'Habari za asubuhi');
    assert.equal(segment.translatedText, 'Good morning');
    assert.deepEqual(segment.context, { type: 'sermon' });
    assert.equal(segment.confidence, 0.87);
    assert.equal(segment.timestamp, 12345);
    assert.deepEqual(segment.sourceTiming, { startRequestedAt: 100, firstFinalAt: 900 });
    assert.deepEqual(segment.pauseMetadata, { available: true, durationMs: 400 });
    assert.equal(segment.voiceId, 'charles');
    assert.equal(segment.deliveryMetadata.lipsync.available, false);
    assert.equal(segment.deliveryMetadata.prosody.available, false);
});

test('buildSegment reports confidence as the literal string "unavailable" when no real numeric confidence was supplied — never a fabricated percentage', () => {
    const segment = buildSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'x', translatedText: 'y' });
    assert.equal(segment.confidence, 'unavailable');
});

test('buildSegment never fabricates a percentage-looking confidence even when a non-numeric value is passed', () => {
    const segment = buildSegment({ confidence: '95%' });
    assert.equal(segment.confidence, 'unavailable');
});

test('buildSegment generates a real, unique segmentId when none is supplied', () => {
    const a = buildSegment({ sourceText: 'x' });
    const b = buildSegment({ sourceText: 'x' });
    assert.notEqual(a.segmentId, b.segmentId);
});

test('buildSegment defaults pauseMetadata to unavailable when the caller supplies none — never invents a pause', () => {
    const segment = buildSegment({ sourceText: 'x' });
    assert.deepEqual(segment.pauseMetadata, { available: false });
});

test('buildSegment never mutates context — passes it through by reference/value exactly as given', () => {
    const context = { type: 'prayer' };
    const segment = buildSegment({ context });
    assert.deepEqual(segment.context, context);
});

test('module is frozen / no accidental mutation surface', () => {
    const mod = load();
    assert.ok(Object.isFrozen(mod));
});
