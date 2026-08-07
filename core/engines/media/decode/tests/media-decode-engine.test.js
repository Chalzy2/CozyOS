/**
 * tests/media-decode-engine.test.js
 *
 * Real, executed tests for core/engines/media/decode/* — M388 Engine 1,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/decode/tests/media-decode-engine.test.js
 */

'use strict';

import assert from 'assert';
import MediaDecodeEngine from '../media-decode-engine.js';
import { createInMemoryDecodeProvider, detectContainer } from '../provider-inmemory.js';

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

// Real container header bytes (minimal, valid magic prefixes) — not
// full valid files, just enough to exercise real byte-level detection.
function bytesOf(arr) { return new Uint8Array(arr); }

const MP4_HEADER = bytesOf([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // ....ftypisom
const WEBM_HEADER = bytesOf([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03]);
const WAV_HEADER = bytesOf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]); // RIFF....WAVE
const OGG_HEADER = bytesOf([0x4f, 0x67, 0x67, 0x53, 0, 0]);
const FLAC_HEADER = bytesOf([0x66, 0x4c, 0x61, 0x43, 0, 0]);
const MP3_HEADER = bytesOf([0x49, 0x44, 0x33, 0x03, 0, 0]); // ID3
const UNKNOWN_BYTES = bytesOf([0x00, 0x01, 0x02, 0x03, 0x04]);

async function run() {
  MediaDecodeEngine.__resetForTests();
  MediaDecodeEngine.registerDefaultProvider();

  // ---------------------------------------------------------------------
  // Provider-level: real, executed magic-byte detection
  // ---------------------------------------------------------------------

  await test('detects mp4 container from real ftyp bytes', () => {
    assert.strictEqual(detectContainer(MP4_HEADER), 'mp4');
  });

  await test('detects webm container from real EBML bytes', () => {
    assert.strictEqual(detectContainer(WEBM_HEADER), 'webm');
  });

  await test('detects wav container from real RIFF/WAVE bytes', () => {
    assert.strictEqual(detectContainer(WAV_HEADER), 'wav');
  });

  await test('detects ogg container from real OggS bytes', () => {
    assert.strictEqual(detectContainer(OGG_HEADER), 'ogg');
  });

  await test('detects flac container from real fLaC bytes', () => {
    assert.strictEqual(detectContainer(FLAC_HEADER), 'flac');
  });

  await test('detects mp3 container from real ID3 bytes', () => {
    assert.strictEqual(detectContainer(MP3_HEADER), 'mp3');
  });

  await test('returns honest null for unrecognized bytes (no fabricated guess)', () => {
    assert.strictEqual(detectContainer(UNKNOWN_BYTES), null);
  });

  // ---------------------------------------------------------------------
  // Engine-level: decodeMedia()
  // ---------------------------------------------------------------------

  await test('decodeMedia() requires sourceHandle.bytes to be a Uint8Array (fails closed)', () => {
    assert.throws(() => MediaDecodeEngine.decodeMedia({ bytes: 'not-bytes' }));
    assert.throws(() => MediaDecodeEngine.decodeMedia(null));
  });

  await test('decodeMedia() returns real computed byteLength and detected container', () => {
    const result = MediaDecodeEngine.decodeMedia({ bytes: MP4_HEADER, mimeType: 'video/mp4', name: 'clip.mp4' });
    assert.strictEqual(result.metadata.byteLength, MP4_HEADER.length);
    assert.strictEqual(result.metadata.container, 'mp4');
    assert.strictEqual(result.metadata.mimeType, 'video/mp4');
    assert.strictEqual(result.metadata.name, 'clip.mp4');
  });

  await test('decodeMedia() is honest about non-derivable metadata (null, not fabricated)', () => {
    const result = MediaDecodeEngine.decodeMedia({ bytes: WAV_HEADER });
    assert.strictEqual(result.metadata.durationSeconds, null);
    assert.strictEqual(result.metadata.sampleRate, null);
    assert.strictEqual(result.metadata.trackCount, null);
  });

  await test('decodeMedia() returns honest isReal:false structural envelope for tracks, never fabricated data', () => {
    const result = MediaDecodeEngine.decodeMedia({ bytes: WEBM_HEADER });
    assert.strictEqual(result.audioTrack.isReal, false);
    assert.strictEqual(result.audioTrack.envelope, 'structural-reference-not-real-codec');
    assert.strictEqual(result.videoTrackRef.isReal, false);
    assert.strictEqual(result.videoTrackRef.envelope, 'structural-reference-not-real-codec');
  });

  await test('decodeMedia() returns null tracks (not fabricated placeholders) for an unrecognized container', () => {
    const result = MediaDecodeEngine.decodeMedia({ bytes: UNKNOWN_BYTES });
    assert.strictEqual(result.audioTrack, null);
    assert.strictEqual(result.videoTrackRef, null);
    assert.strictEqual(result.metadata.container, null);
  });

  await test('decodeMedia() emits DECODED with realDecode:false (honest, not fabricated)', () => {
    let captured = null;
    const off = MediaDecodeEngine.on(MediaDecodeEngine.EVENTS.DECODED, (payload) => { captured = payload; });
    MediaDecodeEngine.decodeMedia({ bytes: OGG_HEADER });
    off();
    assert.ok(captured);
    assert.strictEqual(captured.realDecode, false);
    assert.strictEqual(captured.container, 'ogg');
  });

  await test('decodeMedia() throws (fails closed) with no provider registered', () => {
    MediaDecodeEngine.__resetForTests();
    assert.throws(() => MediaDecodeEngine.decodeMedia({ bytes: MP4_HEADER }));
    MediaDecodeEngine.registerDefaultProvider();
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honesty check
  // ---------------------------------------------------------------------

  await test('getCapabilities() reports realDecode:false and an empty codecs list (no unearned claims)', () => {
    const caps = MediaDecodeEngine.getCapabilities();
    assert.strictEqual(caps.realDecode, false);
    assert.deepStrictEqual(caps.codecs, []);
    assert.ok(Array.isArray(caps.containers) && caps.containers.includes('mp4'));
    assert.strictEqual(typeof caps.webCodecsAvailableInEnvironment, 'boolean');
  });

  await test('getCapabilities() webCodecsAvailableInEnvironment reflects the real, live environment (Node: false)', () => {
    const caps = MediaDecodeEngine.getCapabilities();
    // This test suite runs under Node, which has no VideoDecoder/AudioDecoder —
    // asserting the real, live-checked value rather than a fabricated one.
    assert.strictEqual(caps.webCodecsAvailableInEnvironment, false);
  });

  // ---------------------------------------------------------------------
  // getServiceManifest() / registerWithKernel()
  // ---------------------------------------------------------------------

  await test('getServiceManifest() matches the sibling sub-engines\' exact shape', () => {
    const manifest = MediaDecodeEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'media-decode-engine');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.apiVersion, '1.0.0');
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => MediaDecodeEngine.registerWithKernel(null));
    await assert.rejects(() => MediaDecodeEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let receivedManifest = null;
    const fakeKernel = { registerEngine: (manifest) => { receivedManifest = manifest; return { success: true }; } };
    await MediaDecodeEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(receivedManifest.name, 'media-decode-engine');
  });

  // ---------------------------------------------------------------------
  // attachToCoordinator() — composition into cozy-media.js's real registries
  // ---------------------------------------------------------------------

  await test('attachToCoordinator() requires a real CozyMedia-shaped instance (fails closed)', () => {
    assert.throws(() => MediaDecodeEngine.attachToCoordinator(null));
    assert.throws(() => MediaDecodeEngine.attachToCoordinator({}));
  });

  await test('attachToCoordinator() registers a plain-data adapter + pipeline descriptor', () => {
    const registeredAdapters = [];
    const registeredPipelines = [];
    const fakeCozyMedia = {
      Adapters: { register: (descriptor) => { registeredAdapters.push(descriptor); return { success: true, data: { id: 'adapter-1' } }; } },
      Pipelines: { register: (descriptor) => { registeredPipelines.push(descriptor); return { success: true, data: { id: 'pipeline-1' } }; } }
    };
    const result = MediaDecodeEngine.attachToCoordinator(fakeCozyMedia);
    assert.strictEqual(result.adapterId, 'adapter-1');
    assert.strictEqual(result.pipelineId, 'pipeline-1');
    assert.strictEqual(registeredAdapters[0].name, 'media-decode-engine');
    // Plain-data descriptor only — no function references (cozy-media.js's
    // own security choke point rejects those by design).
    for (const value of Object.values(registeredAdapters[0])) {
      assert.notStrictEqual(typeof value, 'function');
    }
    assert.strictEqual(registeredPipelines[0].adapterId, 'adapter-1');
    assert.strictEqual(MediaDecodeEngine.getStatus().attachedToCoordinator, true);
  });

  // ---------------------------------------------------------------------
  // registerProvider() validation
  // ---------------------------------------------------------------------

  await test('registerProvider() rejects a malformed provider (fails closed)', () => {
    assert.throws(() => MediaDecodeEngine.registerProvider(null));
    assert.throws(() => MediaDecodeEngine.registerProvider({ type: 'x' })); // missing decode()
  });

  await test('a second, custom provider type can be registered independently', () => {
    const custom = createInMemoryDecodeProvider('custom');
    assert.strictEqual(MediaDecodeEngine.registerProvider(custom), true);
    const result = MediaDecodeEngine.decodeMedia({ bytes: MP4_HEADER }, { providerType: 'custom' });
    assert.strictEqual(result.metadata.container, 'mp4');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
