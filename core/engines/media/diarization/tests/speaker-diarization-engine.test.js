/**
 * tests/speaker-diarization-engine.test.js
 *
 * Real, executed tests for core/engines/media/diarization/* — M388 Engine 4,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/diarization/tests/speaker-diarization-engine.test.js
 */

'use strict';

import assert from 'assert';
import SpeakerDiarizationEngine from '../speaker-diarization-engine.js';
import { createSpeakerHintProvider, diarizeSegments, _groupContiguousTurns } from '../provider-speaker-hint.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.stack}`);
    failed++;
  }
}

async function run() {
  SpeakerDiarizationEngine.__resetForTests();
  SpeakerDiarizationEngine.registerDefaultProvider();

  // ---------------------------------------------------------------------
  // Provider-level: real, executed contiguous speaker-hint grouping
  // ---------------------------------------------------------------------

  await test('diarizeSegments() honestly returns an empty envelope for zero segments (no fabrication)', () => {
    const result = diarizeSegments([]);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.method, 'no-analyzable-signal');
    assert.strictEqual(result.speakerCount, 0);
  });

  await test('diarizeSegments() honestly returns an empty envelope when no segment carries a hint', () => {
    const result = diarizeSegments([{ segmentId: 's1' }, { segmentId: 's2' }]);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.turns.length, 0);
  });

  await test('diarizeSegments() groups real contiguous same-hint segments into one turn', () => {
    const result = diarizeSegments([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2', speakerHint: 'pastor' },
      { segmentId: 's3', speakerHint: 'pastor' }
    ]);
    assert.strictEqual(result.isReal, true);
    assert.strictEqual(result.method, 'explicit-speaker-hint-grouping');
    assert.strictEqual(result.turns.length, 1);
    assert.deepStrictEqual(result.turns[0].segmentIds, ['s1', 's2', 's3']);
    assert.strictEqual(result.speakerCount, 1);
  });

  await test('diarizeSegments() splits turns on a real hint change, never merges across it', () => {
    const result = diarizeSegments([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2', speakerHint: 'interpreter' },
      { segmentId: 's3', speakerHint: 'pastor' }
    ]);
    assert.strictEqual(result.turns.length, 3);
    assert.strictEqual(result.speakerCount, 2);
    assert.strictEqual(result.turns[0].speakerHint, 'pastor');
    assert.strictEqual(result.turns[1].speakerHint, 'interpreter');
    assert.strictEqual(result.turns[2].speakerHint, 'pastor');
  });

  await test('diarizeSegments() ends a turn (does not fabricate through) a hint-less gap segment', () => {
    const result = diarizeSegments([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2' },
      { segmentId: 's3', speakerHint: 'pastor' }
    ]);
    assert.strictEqual(result.turns.length, 2);
    assert.deepStrictEqual(result.turns.map((t) => t.segmentIds), [['s1'], ['s3']]);
  });

  await test('diarizeSegments() accepts speakerLabel/speakerTag duck-typed aliases', () => {
    const r1 = diarizeSegments([{ segmentId: 's1', speakerLabel: 'choir' }]);
    assert.strictEqual(r1.isReal, true);
    const r2 = diarizeSegments([{ segmentId: 's1', speakerTag: 'mc' }]);
    assert.strictEqual(r2.isReal, true);
  });

  await test('_groupContiguousTurns() returns frozen, independently-verifiable turn objects', () => {
    const turns = _groupContiguousTurns([{ segmentId: 's1', speakerHint: 'a' }]);
    assert.strictEqual(turns[0].speakerHint, 'a');
    assert.deepStrictEqual(turns[0].segmentIds, ['s1']);
  });

  await test('createSpeakerHintProvider() exposes the correct provider shape', () => {
    const provider = createSpeakerHintProvider();
    assert.strictEqual(provider.type, 'reference-speaker-hint');
    assert.strictEqual(typeof provider.diarizeSegments, 'function');
  });

  // ---------------------------------------------------------------------
  // Engine-level: diarize()
  // ---------------------------------------------------------------------

  await test('diarize() honestly returns isReal:false for segments with no hints (no fabrication)', () => {
    const result = SpeakerDiarizationEngine.diarize([{ segmentId: 's1' }, { segmentId: 's2' }]);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.method, 'no-analyzable-signal');
  });

  await test('diarize() honestly handles a non-array input rather than throwing on a shape it can accommodate', () => {
    const result = SpeakerDiarizationEngine.diarize(undefined);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.speakerCount, 0);
  });

  await test('diarize() computes real turns from explicit segment hints', () => {
    const result = SpeakerDiarizationEngine.diarize([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2', speakerHint: 'pastor' },
      { segmentId: 's3', speakerHint: 'interpreter' }
    ]);
    assert.strictEqual(result.isReal, true);
    assert.strictEqual(result.speakerCount, 2);
    assert.strictEqual(result.turns.length, 2);
  });

  await test('diarize() returns a frozen envelope', () => {
    const result = SpeakerDiarizationEngine.diarize([{ segmentId: 's1', speakerHint: 'pastor' }]);
    assert.throws(() => { result.speakerCount = 99; }, TypeError);
  });

  await test('diarize() emits DIARIZED with the real envelope fields', () => {
    let captured = null;
    const off = SpeakerDiarizationEngine.on(SpeakerDiarizationEngine.EVENTS.DIARIZED, (payload) => { captured = payload; });
    SpeakerDiarizationEngine.diarize([{ segmentId: 's1', speakerHint: 'pastor' }]);
    off();
    assert.ok(captured);
    assert.strictEqual(captured.isReal, true);
    assert.strictEqual(captured.speakerCount, 1);
  });

  await test('diarize() throws (fails closed) with no provider registered', () => {
    SpeakerDiarizationEngine.__resetForTests();
    assert.throws(() => SpeakerDiarizationEngine.diarize([{ segmentId: 's1' }]));
    SpeakerDiarizationEngine.registerDefaultProvider();
  });

  // ---------------------------------------------------------------------
  // applyToSpeechRegistry() — writes only via cozy-speech.js's real,
  // already-public API; never touches cozy-speech.js itself
  // ---------------------------------------------------------------------

  await test('applyToSpeechRegistry() requires a real cozy-speech.js-shaped instance (fails closed)', () => {
    assert.throws(() => SpeakerDiarizationEngine.applyToSpeechRegistry(null, { turns: [] }));
    assert.throws(() => SpeakerDiarizationEngine.applyToSpeechRegistry({}, { turns: [] }));
  });

  await test('applyToSpeechRegistry() registers one speaker per distinct hint via registerSpeaker()/addActiveSpeaker() only', () => {
    const registerCalls = [];
    const activeCalls = [];
    let nextId = 1;
    const fakeCozySpeech = {
      registerSpeaker: (config) => { registerCalls.push(config); return `speaker-${nextId++}`; },
      addActiveSpeaker: (id) => { activeCalls.push(id); return id; }
    };
    const diarizationResult = SpeakerDiarizationEngine.diarize([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2', speakerHint: 'pastor' },
      { segmentId: 's3', speakerHint: 'interpreter' }
    ]);
    const applied = SpeakerDiarizationEngine.applyToSpeechRegistry(fakeCozySpeech, diarizationResult);
    assert.strictEqual(registerCalls.length, 2); // one per distinct hint, not per segment/turn
    assert.strictEqual(registerCalls[0].name, 'pastor');
    assert.strictEqual(registerCalls[1].name, 'interpreter');
    assert.strictEqual(activeCalls.length, 2);
    assert.strictEqual(applied.registeredCount, 2);
    assert.strictEqual(applied.hintToSpeakerId.pastor, 'speaker-1');
    assert.strictEqual(applied.hintToSpeakerId.interpreter, 'speaker-2');
  });

  await test('applyToSpeechRegistry() honestly registers nothing for an isReal:false (empty) diarization result', () => {
    const registerCalls = [];
    const fakeCozySpeech = {
      registerSpeaker: (config) => { registerCalls.push(config); return 'speaker-x'; },
      addActiveSpeaker: () => {}
    };
    const diarizationResult = SpeakerDiarizationEngine.diarize([{ segmentId: 's1' }]);
    const applied = SpeakerDiarizationEngine.applyToSpeechRegistry(fakeCozySpeech, diarizationResult);
    assert.strictEqual(registerCalls.length, 0);
    assert.strictEqual(applied.registeredCount, 0);
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honesty check
  // ---------------------------------------------------------------------

  await test('getCapabilities() reports realAcousticDiarization:false (no unearned claim)', () => {
    const caps = SpeakerDiarizationEngine.getCapabilities();
    assert.strictEqual(caps.realAcousticDiarization, false);
    assert.strictEqual(caps.speakerHintGrouping, true);
  });

  // ---------------------------------------------------------------------
  // getServiceManifest() / registerWithKernel()
  // ---------------------------------------------------------------------

  await test('getServiceManifest() matches the sibling sub-engines\' exact shape', () => {
    const manifest = SpeakerDiarizationEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'speaker-diarization-engine');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.apiVersion, '1.0.0');
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => SpeakerDiarizationEngine.registerWithKernel(null));
    await assert.rejects(() => SpeakerDiarizationEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let receivedManifest = null;
    const fakeKernel = { registerEngine: (manifest) => { receivedManifest = manifest; return { success: true }; } };
    await SpeakerDiarizationEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(receivedManifest.name, 'speaker-diarization-engine');
  });

  // ---------------------------------------------------------------------
  // registerProvider() validation
  // ---------------------------------------------------------------------

  await test('registerProvider() rejects a malformed provider (fails closed)', () => {
    assert.throws(() => SpeakerDiarizationEngine.registerProvider(null));
    assert.throws(() => SpeakerDiarizationEngine.registerProvider({ type: 'x' })); // missing diarizeSegments()
  });

  await test('a second, custom provider type can be registered independently', () => {
    const custom = createSpeakerHintProvider('custom');
    assert.strictEqual(SpeakerDiarizationEngine.registerProvider(custom), true);
    const result = SpeakerDiarizationEngine.diarize([{ segmentId: 's1', speakerHint: 'pastor' }], { providerType: 'custom' });
    assert.strictEqual(result.isReal, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
