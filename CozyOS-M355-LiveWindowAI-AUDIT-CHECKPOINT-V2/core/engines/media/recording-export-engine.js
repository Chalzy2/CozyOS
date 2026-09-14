/**
 * =============================================================================
 * CozyOS Media Engine — Recording Export Engine (LEGACY — superseded)
 * File: core/engines/media/recording-export-engine.js
 * =============================================================================
 *
 * LEGACY (Milestone 141b / Phase 2): superseded by
 * record-export-session-manager.js, which is the same ownership promoted
 * with a real export queue, pause/resume/cancel, chapters/bookmarks,
 * batch export, and integrity verification. This file is kept only so
 * anything still importing the old path/name keeps working — it re-
 * exports the new manager's exportSession() under the old name and
 * signature rather than duplicating logic (Rule 2).
 *
 * Do not add new functionality here. New work goes in
 * record-export-session-manager.js.
 * =============================================================================
 */

'use strict';

import RecordExportSessionManager from './record-export-session-manager.js';

/** Old signature: exportSession(session, imageFormat, providerType) -> bundle (awaited synchronously to preserve the old synchronous-looking contract). */
async function exportSession(session, imageFormat = 'jpeg', providerType) {
  const { promise } = RecordExportSessionManager.exportSession(session, { imageFormat, providerType });
  const bundle = await promise;
  if (!bundle) {
    throw new Error('[RecordingExportEngine:LEGACY] export did not complete — see record-export-session-manager.js for real status/error detail.');
  }
  return bundle;
}

function getServiceManifest() {
  return Object.freeze({
    name: 'recording-export-engine', version: '1.0.0-legacy', apiVersion: '1.0.0',
    priority: 30, mandatory: false, dependencies: ['record-export-session-manager']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[RecordingExportEngine:LEGACY] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

const RecordingExportEngine = Object.freeze({
  exportSession,
  getServiceManifest, registerWithKernel
});

export default RecordingExportEngine;
