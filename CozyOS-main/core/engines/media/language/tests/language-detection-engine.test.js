/**
 * tests/language-detection-engine.test.js
 *
 * Real, executed tests for core/engines/media/language/* — M388 Engine 2,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/language/tests/language-detection-engine.test.js
 */

'use strict';

import assert from 'assert';
import LanguageDetectionEngine from '../language-detection-engine.js';
import { createLexicalDetectProvider, classifyScript, detectFromText } from '../provider-lexical.js';

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
  LanguageDetectionEngine.__resetForTests();
  LanguageDetectionEngine.registerDefaultProvider();

  // ---------------------------------------------------------------------
  // Provider-level: real, executed script classification and lexical scoring
  // ---------------------------------------------------------------------

  await test('classifies real Ethiopic (Amharic) text via actual Unicode code points', () => {
    const result = classifyScript('\u1230\u120b\u121d');
    assert.strictEqual(result.script, 'ethiopic');
  });

  await test('classifies real Latin-script text as latin-or-other, not Ethiopic', () => {
    const result = classifyScript('hello world');
    assert.strictEqual(result.script, 'latin-or-other');
  });

  await test('detectFromText() honestly returns null for empty text (no fabrication)', () => {
    const result = detectFromText('', []);
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.isReal, false);
  });

  await test('detectFromText() detects English via real lexical overlap against actual tokens', () => {
    const result = detectFromText('the quick fox and the dog', []);
    assert.strictEqual(result.languageCode, 'en');
    assert.strictEqual(result.isReal, true);
    assert.ok(result.confidence > 0 && result.confidence <= 0.65);
  });

  await test('detectFromText() detects French via real lexical overlap', () => {
    const result = detectFromText('le chat et la souris de la maison', []);
    assert.strictEqual(result.languageCode, 'fr');
  });

  await test('detectFromText() detects Swahili via real lexical overlap', () => {
    const result = detectFromText('hii ni kwa ajili ya wao katika nyumba', []);
    assert.strictEqual(result.languageCode, 'sw');
  });

  await test('detectFromText() honestly returns null when no reference word overlaps at all', () => {
    const result = detectFromText('xzq wvbk ptmn qzrk', []);
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.isReal, false);
  });

  await test('detectFromText() confidence is capped, never claims false certainty', () => {
    const result = detectFromText('the the the the the the the', []);
    assert.ok(result.confidence <= 0.65);
  });

  await test('detectFromText() honors an explicit candidateLanguages restriction', () => {
    // "na" is a real Swahili/Hausa overlap word; restrict pool to Hausa only.
    const result = detectFromText('na na na wannan', ['ha']);
    assert.strictEqual(result.languageCode, 'ha');
  });

  await test('createLexicalDetectProvider() exposes an honestly-partial lexiconLanguages() list', () => {
    const provider = createLexicalDetectProvider();
    const langs = provider.lexiconLanguages();
    assert.ok(langs.includes('en'));
    assert.ok(langs.includes('sw'));
    // Deliberately NOT claiming coverage for languages with no curated
    // lexicon this pass (file header, "COVERAGE IS DELIBERATELY PARTIAL").
    assert.ok(!langs.includes('kam'));
  });

  // ---------------------------------------------------------------------
  // Engine-level: detectLanguage()
  // ---------------------------------------------------------------------

  await test('detectLanguage() returns an honest empty envelope for a plain opaque audioRef (no fabrication)', () => {
    const result = LanguageDetectionEngine.detectLanguage({ bufferHandle: 'opaque-123' });
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.method, 'no-analyzable-signal');
  });

  await test('detectLanguage() never fabricates from a string-only opaque ref either', () => {
    const result = LanguageDetectionEngine.detectLanguage('audio-uri://segment-1');
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.isReal, false);
  });

  await test('detectLanguage() uses a duck-typed hintText property on audioRef when actually present', () => {
    const result = LanguageDetectionEngine.detectLanguage({ bufferHandle: 'x', hintText: 'the cat and the hat' });
    assert.strictEqual(result.languageCode, 'en');
    assert.strictEqual(result.isReal, true);
  });

  await test('detectLanguage() prefers explicit options.hintText over audioRef duck-typed properties', () => {
    const result = LanguageDetectionEngine.detectLanguage(
      { hintText: 'the cat and the hat' },
      { hintText: 'le chat et la souris' }
    );
    assert.strictEqual(result.languageCode, 'fr');
  });

  await test('detectLanguage() respects options.candidateLanguages', () => {
    const result = LanguageDetectionEngine.detectLanguage(
      { hintText: 'na na na wannan' },
      { candidateLanguages: ['ha'] }
    );
    assert.strictEqual(result.languageCode, 'ha');
  });

  await test('detectLanguage() returns a frozen envelope', () => {
    const result = LanguageDetectionEngine.detectLanguage({ hintText: 'the dog' });
    assert.throws(() => { result.languageCode = 'zz'; }, TypeError);
  });

  await test('detectLanguage() emits DETECTED with the real envelope fields', () => {
    let captured = null;
    const off = LanguageDetectionEngine.on(LanguageDetectionEngine.EVENTS.DETECTED, (payload) => { captured = payload; });
    LanguageDetectionEngine.detectLanguage({ hintText: 'the dog and the cat' });
    off();
    assert.ok(captured);
    assert.strictEqual(captured.languageCode, 'en');
    assert.strictEqual(captured.isReal, true);
  });

  await test('detectLanguage() throws (fails closed) with no provider registered', () => {
    LanguageDetectionEngine.__resetForTests();
    assert.throws(() => LanguageDetectionEngine.detectLanguage({ hintText: 'the dog' }));
    LanguageDetectionEngine.registerDefaultProvider();
  });

  // ---------------------------------------------------------------------
  // crossReferenceName() — read-only use of cozy-speech.js's own directory
  // ---------------------------------------------------------------------

  await test('crossReferenceName() returns null name without a real CozySpeech instance (fails closed, not fabricated)', () => {
    const result = LanguageDetectionEngine.crossReferenceName('sw', null);
    assert.strictEqual(result.languageCode, 'sw');
    assert.strictEqual(result.name, null);
  });

  await test('crossReferenceName() reads (read-only) from a real listLanguages()-shaped instance', () => {
    const fakeCozySpeech = { listLanguages: () => [{ languageCode: 'sw', name: 'Swahili' }] };
    const result = LanguageDetectionEngine.crossReferenceName('sw', fakeCozySpeech);
    assert.strictEqual(result.name, 'Swahili');
  });

  await test('crossReferenceName() honestly returns null name for an unmatched code (no fabrication)', () => {
    const fakeCozySpeech = { listLanguages: () => [{ languageCode: 'sw', name: 'Swahili' }] };
    const result = LanguageDetectionEngine.crossReferenceName('am', fakeCozySpeech);
    assert.strictEqual(result.name, null);
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honesty check
  // ---------------------------------------------------------------------

  await test('getCapabilities() reports realAcousticDetection:false (no unearned claim)', () => {
    const caps = LanguageDetectionEngine.getCapabilities();
    assert.strictEqual(caps.realAcousticDetection, false);
    assert.ok(Array.isArray(caps.lexiconLanguages) && caps.lexiconLanguages.includes('en'));
  });

  // ---------------------------------------------------------------------
  // getServiceManifest() / registerWithKernel()
  // ---------------------------------------------------------------------

  await test('getServiceManifest() matches the sibling sub-engines\' exact shape', () => {
    const manifest = LanguageDetectionEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'language-detection-engine');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.apiVersion, '1.0.0');
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => LanguageDetectionEngine.registerWithKernel(null));
    await assert.rejects(() => LanguageDetectionEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let receivedManifest = null;
    const fakeKernel = { registerEngine: (manifest) => { receivedManifest = manifest; return { success: true }; } };
    await LanguageDetectionEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(receivedManifest.name, 'language-detection-engine');
  });

  // ---------------------------------------------------------------------
  // attachToLive() — composition into cozy-live.js's real registerSubsystem()
  // ---------------------------------------------------------------------

  await test('attachToLive() requires a real cozy-live.js-shaped instance (fails closed)', () => {
    assert.throws(() => LanguageDetectionEngine.attachToLive(null));
    assert.throws(() => LanguageDetectionEngine.attachToLive({}));
  });

  await test('attachToLive() registers via registerSubsystem("CozyLanguage", adapter) — cozy-live.js never modified directly', () => {
    const registered = [];
    const fakeCozyLive = { registerSubsystem: (name, adapter) => { registered.push({ name, adapter }); return true; } };
    const result = LanguageDetectionEngine.attachToLive(fakeCozyLive);
    assert.strictEqual(result.name, 'CozyLanguage');
    assert.strictEqual(registered[0].name, 'CozyLanguage');
    assert.strictEqual(typeof registered[0].adapter.detectLanguage, 'function');
    assert.strictEqual(LanguageDetectionEngine.getStatus().attachedToLive, true);
  });

  await test('the registered adapter matches relaySpeechSegment()\'s exact expected contract: detectLanguage(sourceAudioRef) -> { languageCode }', () => {
    let capturedAdapter = null;
    const fakeCozyLive = { registerSubsystem: (name, adapter) => { capturedAdapter = adapter; } };
    LanguageDetectionEngine.attachToLive(fakeCozyLive);
    // Exact shape ourcozy-live.test.js:773-784 already exercises with a mock.
    const detection = capturedAdapter.detectLanguage({ hintText: 'the dog and the cat' });
    assert.strictEqual(typeof detection.languageCode, 'string');
    assert.strictEqual(Object.keys(detection).length, 1); // only { languageCode } — matches cozy-live.js's own read
  });

  await test('the registered adapter honestly returns { languageCode: null } for an unanalyzable opaque ref, not a guess', () => {
    let capturedAdapter = null;
    const fakeCozyLive = { registerSubsystem: (name, adapter) => { capturedAdapter = adapter; } };
    LanguageDetectionEngine.attachToLive(fakeCozyLive);
    const detection = capturedAdapter.detectLanguage('opaque-audio-uri://segment-9');
    assert.strictEqual(detection.languageCode, null);
  });

  // ---------------------------------------------------------------------
  // registerProvider() validation
  // ---------------------------------------------------------------------

  await test('registerProvider() rejects a malformed provider (fails closed)', () => {
    assert.throws(() => LanguageDetectionEngine.registerProvider(null));
    assert.throws(() => LanguageDetectionEngine.registerProvider({ type: 'x' })); // missing detectFromText()
  });

  await test('a second, custom provider type can be registered independently', () => {
    const custom = createLexicalDetectProvider('custom');
    assert.strictEqual(LanguageDetectionEngine.registerProvider(custom), true);
    const result = LanguageDetectionEngine.detectLanguage({ hintText: 'the dog' }, { providerType: 'custom' });
    assert.strictEqual(result.languageCode, 'en');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
