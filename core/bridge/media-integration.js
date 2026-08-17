/**
 * =============================================================================
 * CozyOS — Media Integration (Milestone 143, narrowed scope)
 * File: core/bridge/media-integration.js
 * =============================================================================
 * Real seams only. No fabricated capture or detection.
 *
 * processFrame() — routes a real ImageHandle (from any source an app
 * already has: upload, canvas, test data) through Media Pipeline.
 * requestVisionAnalysis() — registers a real OCR/QR/barcode REQUEST with
 * Vision's existing registries. Does NOT run OCR/QR/detection — nothing
 * in this codebase does yet. Returns the real request id only.
 *
 * NOT INCLUDED (deferred, per approved scope):
 *   - Camera frame capture (Camera Engine has no frame-output API)
 *   - Real OCR/QR/barcode/object/face detection (Vision has no adapter)
 * =============================================================================
 */

'use strict';

import EngineBridge from './engine-bridge.js';

async function getMediaEngine(target, engineName = 'media') {
  return EngineBridge.resolve(engineName, { target });
}

/** Real pipeline routing — Image/Filter/Environment/Enhancement, via the already-certified Media Pipeline Manager. No new processing logic here (Rule 2). */
async function processFrame(image, steps, target, engineName = 'media') {
  const media = await getMediaEngine(target, engineName);
  if (!media) return { success: false, reason: 'Media Engine unavailable via Engine Bridge.' };
  try {
    const result = media.process(image, steps || []);
    return { success: true, image: result };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Registers a real OCR/QR/barcode request with Vision's existing
 * registries. This does NOT perform detection — it records that
 * detection was requested, exactly like Vision's own contract.
 * @param {'ocr'|'barcode'|'qr'} kind
 * @param {object} vision - real window.CozyOS.Vision instance
 * @param {object} config - { requestId, sessionId, imageId?, ... }
 */
function requestVisionAnalysis(kind, vision, config) {
  const methodMap = { ocr: 'registerOcrRequest', barcode: 'registerBarcodeRequest', qr: 'registerQrRequest' };
  const method = methodMap[kind];
  if (!method) throw new TypeError(`[MediaIntegration] unknown analysis kind "${kind}". Known: ${Object.keys(methodMap).join(', ')}.`);
  if (!vision || typeof vision[method] !== 'function') {
    throw new Error(`[MediaIntegration] Vision engine unavailable or missing ${method}() — request not registered, no fabricated result.`);
  }
  return vision[method](config);
}

const MediaIntegration = Object.freeze({ getMediaEngine, processFrame, requestVisionAnalysis });

export default MediaIntegration;
