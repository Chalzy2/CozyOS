'use strict';
import assert from 'assert';
import EngineBridge from '../engine-bridge.js';
import MediaIntegration from '../media-integration.js';
import { createInMemoryMediaProvider } from '../../engines/media/provider-inmemory.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}\n      ${err.stack}`); failed++; }
}

async function run() {
  EngineBridge.__resetForTests();
  EngineBridge.register('media', { modulePath: '../engines/media/media-pipeline-manager.js', globalName: 'MediaEngine', expectedManifestName: 'media-pipeline-manager' });
  const target = {};
  const loadResult = await EngineBridge.load('media', { target });
  if (!loadResult.success) throw new Error('load failed: ' + loadResult.reason);
  target.CozyOS.MediaEngine.registerDefaultProvider();
  const provider = createInMemoryMediaProvider();

  await test('processFrame() routes a real image through Media Pipeline', async () => {
    const img = provider.createImage(4, 4, [10, 20, 30, 255]);
    const result = await MediaIntegration.processFrame(img, [{ engine: 'image', op: 'resize', args: [2, 2] }], target);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.image.width, 2);
  });

  await test('processFrame() fails closed when Media Engine unavailable', async () => {
    const result = await MediaIntegration.processFrame({}, [], {}, 'not-registered');
    assert.strictEqual(result.success, false);
  });

  await test('requestVisionAnalysis() registers a real request, returns real id', () => {
    const mockVision = { registerOcrRequest: (c) => 'vocr_' + c.requestId };
    const id = MediaIntegration.requestVisionAnalysis('ocr', mockVision, { requestId: 'r1', sessionId: 's1' });
    assert.strictEqual(id, 'vocr_r1');
  });

  await test('requestVisionAnalysis() fails closed when Vision unavailable', () => {
    assert.throws(() => MediaIntegration.requestVisionAnalysis('qr', null, { requestId: 'r2', sessionId: 's1' }));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
run();
