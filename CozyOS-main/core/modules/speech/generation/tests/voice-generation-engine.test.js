/**
 * tests/voice-generation-engine.test.js
 *
 * Real, executed tests for core/modules/speech/generation/* — M388 Engine 7.
 * Per Compose §12 item 4: mocks VoiceManager/CozyTTSBrowserAdapter (the
 * underlying Web Speech API call itself is already-shipped, browser-only
 * code, not re-verified here) and verifies only this engine's own
 * orchestration/fallback-selection logic.
 *
 * Run with: node core/modules/speech/generation/tests/voice-generation-engine.test.js
 */

'use strict';

import assert from 'assert';
import VoiceGenerationEngine from '../voice-generation-engine.js';

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
  await test('generateSpeechForSegment() prefers VoiceManager when available', async () => {
    let received = null;
    const fakeVoiceManager = {
      speak: async (request) => { received = request; return { available: true, played: true, providerId: 'charles', reason: null }; }
    };
    const result = await VoiceGenerationEngine.generateSpeechForSegment(
      { segmentId: 'seg-1', text: 'Hello world' },
      { voiceManager: fakeVoiceManager }
    );
    assert.strictEqual(result.played, true);
    assert.strictEqual(result.providerId, 'charles');
    assert.strictEqual(result.realAudioBuffer, false, 'must always be false this pass — honest, not a placeholder');
    assert.strictEqual(received.text, 'Hello world');
  });

  await test('generateSpeechForSegment() falls back to CozyTTSBrowserAdapter when VoiceManager is unavailable', async () => {
    const fakeBrowserAdapter = {
      speakPreview: async (config) => ({ played: true, reason: null })
    };
    const result = await VoiceGenerationEngine.generateSpeechForSegment(
      { segmentId: 'seg-2', text: 'Fallback path' },
      { voiceManager: undefined, browserAdapter: fakeBrowserAdapter }
    );
    assert.strictEqual(result.played, true);
    assert.strictEqual(result.providerId, 'browser');
  });

  await test('generateSpeechForSegment() fails closed (no fabricated speech) when neither backend is available', async () => {
    const result = await VoiceGenerationEngine.generateSpeechForSegment(
      { segmentId: 'seg-3', text: 'No backend' },
      { voiceManager: undefined, browserAdapter: undefined }
    );
    assert.strictEqual(result.played, false);
    assert.strictEqual(result.providerId, null);
    assert.ok(result.reason && result.reason.includes('Fail closed'));
  });

  await test('generateSpeechForSegment() honestly reports VoiceManager.speak() failure without falling back to the browser adapter directly (VoiceManager already owns that fallback internally)', async () => {
    const fakeVoiceManager = {
      speak: async () => ({ available: false, played: false, providerId: null, reason: 'No provider could speak this request.' })
    };
    const browserAdapterSpy = { speakPreview: async () => { throw new Error('should not be called — VoiceManager already tried its own fallback chain'); } };
    const result = await VoiceGenerationEngine.generateSpeechForSegment(
      { segmentId: 'seg-4', text: 'VM says no' },
      { voiceManager: fakeVoiceManager, browserAdapter: browserAdapterSpy }
    );
    assert.strictEqual(result.played, false);
    assert.strictEqual(result.reason, 'No provider could speak this request.');
  });

  await test('generateSpeechForSegment() catches a thrown backend error and reports it honestly rather than crashing', async () => {
    const throwingVoiceManager = { speak: async () => { throw new Error('synthetic backend failure'); } };
    const result = await VoiceGenerationEngine.generateSpeechForSegment(
      { segmentId: 'seg-5', text: 'Throws' },
      { voiceManager: throwingVoiceManager }
    );
    assert.strictEqual(result.played, false);
    assert.ok(result.reason.includes('synthetic backend failure'));
  });

  await test('generateSpeechForSegment() throws on a malformed segment (missing segmentId/text)', async () => {
    await assert.rejects(() => VoiceGenerationEngine.generateSpeechForSegment({ text: 'no id' }, {}));
    await assert.rejects(() => VoiceGenerationEngine.generateSpeechForSegment({ segmentId: 'x' }, {}));
  });

  await test('generateSpeechForSegments() processes a real list sequentially and reports one result per segment', async () => {
    let callCount = 0;
    const fakeVoiceManager = {
      speak: async (request) => { callCount++; return { available: true, played: true, providerId: 'charles', reason: null }; }
    };
    const segments = [
      { segmentId: 'a', text: 'One' },
      { segmentId: 'b', text: 'Two' },
      { segmentId: 'c', text: 'Three' }
    ];
    const results = await VoiceGenerationEngine.generateSpeechForSegments(segments, { voiceManager: fakeVoiceManager });
    assert.strictEqual(results.length, 3);
    assert.strictEqual(callCount, 3);
    assert.deepStrictEqual(results.map(r => r.segmentId), ['a', 'b', 'c']);
  });

  await test('generateSpeechForSegments() does not stop the batch when one segment fails', async () => {
    let call = 0;
    const flakyVoiceManager = {
      speak: async () => {
        call++;
        if (call === 2) return { available: false, played: false, providerId: null, reason: 'segment 2 failed' };
        return { available: true, played: true, providerId: 'charles', reason: null };
      }
    };
    const segments = [{ segmentId: 'a', text: '1' }, { segmentId: 'b', text: '2' }, { segmentId: 'c', text: '3' }];
    const results = await VoiceGenerationEngine.generateSpeechForSegments(segments, { voiceManager: flakyVoiceManager });
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[1].played, false);
    assert.strictEqual(results[0].played, true);
    assert.strictEqual(results[2].played, true);
  });

  await test('generateSpeechForSegments() throws on a non-array argument', async () => {
    await assert.rejects(() => VoiceGenerationEngine.generateSpeechForSegments('not-an-array', {}));
  });

  await test('getCapabilities() honestly reports realAudioBuffer:false and voiceCloning:false (MD-008/MD-020)', () => {
    const caps = VoiceGenerationEngine.getCapabilities();
    assert.strictEqual(caps.realAudioBuffer, false);
    assert.strictEqual(caps.realPlayback, true);
    assert.strictEqual(caps.voiceCloning, false);
  });

  await test('getServiceManifest() matches the established sub-engine manifest shape', () => {
    const manifest = VoiceGenerationEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'voice-generation-engine');
    assert.ok(manifest.version);
    assert.ok(manifest.apiVersion);
    assert.strictEqual(typeof manifest.priority, 'number');
    assert.strictEqual(typeof manifest.mandatory, 'boolean');
    assert.ok(Array.isArray(manifest.dependencies));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let received = null;
    const fakeKernel = { registerEngine: (manifest) => { received = manifest; return { success: true }; } };
    await VoiceGenerationEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(received.name, 'voice-generation-engine');
  });

  await test('event bus: on()/emit() fires real listeners for SEGMENT_SPOKEN and SEGMENT_FAILED', async () => {
    const spoken = [];
    const failed = [];
    const offSpoken = VoiceGenerationEngine.on(VoiceGenerationEngine.EVENTS.SEGMENT_SPOKEN, (p) => spoken.push(p));
    const offFailed = VoiceGenerationEngine.on(VoiceGenerationEngine.EVENTS.SEGMENT_FAILED, (p) => failed.push(p));
    await VoiceGenerationEngine.generateSpeechForSegment({ segmentId: 'ev-1', text: 'x' }, { voiceManager: { speak: async () => ({ available: true, played: true, providerId: 'charles' }) } });
    await VoiceGenerationEngine.generateSpeechForSegment({ segmentId: 'ev-2', text: 'x' }, {});
    assert.strictEqual(spoken.length, 1);
    assert.strictEqual(failed.length, 1);
    offSpoken();
    offFailed();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();
