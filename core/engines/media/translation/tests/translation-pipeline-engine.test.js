/**
 * tests/translation-pipeline-engine.test.js
 *
 * Real, executed tests for core/engines/media/translation/* — M388 Engine 3,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/translation/tests/translation-pipeline-engine.test.js
 */

'use strict';

import assert from 'assert';
import TranslationPipelineEngine from '../translation-pipeline-engine.js';

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

function makeFakeCozyLive() {
  const subsystems = new Map();
  return {
    registerSubsystem(name, adapter) { subsystems.set(name, adapter); return true; },
    getSubsystemOrThrow(name) {
      const s = subsystems.get(name);
      if (!s) throw new Error('SUBSYSTEM_NOT_REGISTERED');
      return s;
    }
  };
}

async function run() {
  TranslationPipelineEngine.__resetForTests();

  // ---------------------------------------------------------------------
  // translateSegment() — honest envelope behavior (NEVER FABRICATE)
  // ---------------------------------------------------------------------

  await test('translateSegment() fails closed honestly when no adapter is loaded (no throw)', async () => {
    const result = await TranslationPipelineEngine.translateSegment(null, 'hello', 'en', 'sw');
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.isReal, false);
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
  });

  await test('translateSegment() fails closed honestly on empty text (no throw)', async () => {
    const fakeAdapter = { previewTranslation: async () => ({ isReal: true, translatedText: 'should not be reached' }) };
    const result = await TranslationPipelineEngine.translateSegment(fakeAdapter, '', 'en', 'sw');
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.isReal, false);
  });

  await test('translateSegment() fails closed honestly when languages are missing (no throw)', async () => {
    const fakeAdapter = { previewTranslation: async () => ({ isReal: true, translatedText: 'should not be reached' }) };
    const result = await TranslationPipelineEngine.translateSegment(fakeAdapter, 'hello', null, 'sw');
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.isReal, false);
  });

  await test('translateSegment() delegates to a real adapter and reshapes { translatedText } -> { text }', async () => {
    const fakeAdapter = {
      previewTranslation: async (text, { sourceLanguage, targetLanguage }) => {
        assert.strictEqual(text, 'hello');
        assert.strictEqual(sourceLanguage, 'en');
        assert.strictEqual(targetLanguage, 'sw');
        return { isReal: true, translatedText: 'habari', providerName: 'fake-provider' };
      }
    };
    const result = await TranslationPipelineEngine.translateSegment(fakeAdapter, 'hello', 'en', 'sw');
    assert.strictEqual(result.text, 'habari');
    assert.strictEqual(result.isReal, true);
  });

  await test('translateSegment() surfaces an honest failure envelope when the underlying adapter fails closed (never fabricates)', async () => {
    const fakeAdapter = {
      previewTranslation: async () => ({ isReal: false, translatedText: null, reason: 'No translation provider registered. Failing closed.' })
    };
    const result = await TranslationPipelineEngine.translateSegment(fakeAdapter, 'hello', 'en', 'sw');
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.isReal, false);
  });

  await test('translateSegment() never throws, even if the underlying adapter itself throws', async () => {
    const fakeAdapter = { previewTranslation: async () => { throw new Error('boom'); } };
    const result = await TranslationPipelineEngine.translateSegment(fakeAdapter, 'hello', 'en', 'sw');
    assert.strictEqual(result.text, null);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.reason, 'boom');
  });

  // ---------------------------------------------------------------------
  // attachToLive() — matches relaySpeechSegment()'s exact expected shape
  // ---------------------------------------------------------------------

  await test('attachToLive() requires a real cozy-live.js instance exposing registerSubsystem()', () => {
    assert.throws(() => TranslationPipelineEngine.attachToLive(null), /requires a real cozy-live/);
    assert.throws(() => TranslationPipelineEngine.attachToLive({}), /requires a real cozy-live/);
  });

  await test('attachToLive() registers under the exact key "CozyTranslate" cozy-live.js\'s relaySpeechSegment() reads', () => {
    TranslationPipelineEngine.__resetForTests();
    const cozyLive = makeFakeCozyLive();
    const fakeAdapter = { previewTranslation: async () => ({ isReal: true, translatedText: 'habari' }) };
    TranslationPipelineEngine.attachToLive(cozyLive, fakeAdapter);
    const registered = cozyLive.getSubsystemOrThrow('CozyTranslate');
    assert.strictEqual(typeof registered.translate, 'function');
    assert.strictEqual(TranslationPipelineEngine.getStatus().attachedToLive, true);
    assert.strictEqual(TranslationPipelineEngine.getStatus().subsystemName, 'CozyTranslate');
  });

  await test('the registered adapter\'s translate(text, sourceLanguage, targetLanguage) returns exactly { text } — matches ourcozy-live.test.js\'s existing 8 mocks\' shape', async () => {
    TranslationPipelineEngine.__resetForTests();
    const cozyLive = makeFakeCozyLive();
    const fakeAdapter = {
      previewTranslation: async (text, { sourceLanguage, targetLanguage }) => ({ isReal: true, translatedText: `[${targetLanguage}] ${text}` })
    };
    TranslationPipelineEngine.attachToLive(cozyLive, fakeAdapter);
    const registered = cozyLive.getSubsystemOrThrow('CozyTranslate');
    const result = await registered.translate('hello', 'en', 'sw');
    assert.deepStrictEqual(Object.keys(result), ['text']);
    assert.strictEqual(result.text, '[sw] hello');
  });

  await test('the registered adapter honestly returns { text: null } (not a thrown exception) when no real provider exists', async () => {
    TranslationPipelineEngine.__resetForTests();
    const cozyLive = makeFakeCozyLive();
    const fakeAdapter = { previewTranslation: async () => ({ isReal: false, translatedText: null, reason: 'No translation provider registered. Failing closed.' }) };
    TranslationPipelineEngine.attachToLive(cozyLive, fakeAdapter);
    const registered = cozyLive.getSubsystemOrThrow('CozyTranslate');
    const result = await registered.translate('hello', 'en', 'sw');
    assert.deepStrictEqual(result, { text: null });
  });

  // ---------------------------------------------------------------------
  // Manifest / kernel registration — honest, non-mandatory
  // ---------------------------------------------------------------------

  await test('getServiceManifest() reports a real, non-fabricated, non-mandatory manifest', () => {
    const manifest = TranslationPipelineEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'translation-pipeline-engine');
    assert.strictEqual(manifest.mandatory, false);
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance', async () => {
    await assert.rejects(() => TranslationPipelineEngine.registerWithKernel(null), /requires a real Kernel/);
    let called = false;
    const fakeKernel = { registerEngine: (m) => { called = true; return m; } };
    await TranslationPipelineEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(called, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();
