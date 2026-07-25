/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Dashboard Bootstrap
 * File: core/bridge/engine-bridge-bootstrap.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The one place that knows the concrete list of certified ES-module
 * engines and their window.CozyOS.* names. Loaded by dashboard.html as
 * `<script type="module">` — the standard, real way to run ES modules
 * inside an otherwise-classic-script page; no other script tag needed
 * to change. Registers each engine, then attempts to load all of them,
 * logging real per-engine results rather than assuming success.
 *
 * NAMING NOTE (flagged, not silently decided)
 * ------------------------------------------------------------
 * window.CozyOS.Vision (cozy-vision.js) and window.CozyOS.CozyMedia
 * (cozy-media.js) already exist as browser-global coordinators — this
 * bootstrap does not touch or rename either. The five ES-module engines
 * are exposed under distinct *Engine names (CameraEngine, AudioEngine,
 * PlaybackEngine, SceneEngine, MediaEngine) specifically so they cannot
 * collide with those existing globals or with each other.
 * =============================================================================
 */

'use strict';

import EngineBridge from './engine-bridge.js';

const REGISTRATIONS = Object.freeze([
  { name: 'camera', modulePath: '../engines/camera/camera-manager.js', globalName: 'CameraEngine', expectedManifestName: 'camera-manager' },
  { name: 'audio', modulePath: '../engines/audio/audio-manager.js', globalName: 'AudioEngine', expectedManifestName: 'audio-manager' },
  { name: 'playback', modulePath: '../engines/playback/playback-engine.js', globalName: 'PlaybackEngine', expectedManifestName: 'playback-engine' },
  { name: 'scene', modulePath: '../engines/scene/scene-manager.js', globalName: 'SceneEngine', expectedManifestName: 'scene-manager' },
  { name: 'media', modulePath: '../engines/media/media-pipeline-manager.js', globalName: 'MediaEngine', expectedManifestName: 'media-pipeline-manager' }
]);

async function boot(target) {
  const results = [];
  for (const reg of REGISTRATIONS) {
    try {
      EngineBridge.register(reg.name, reg);
    } catch (err) {
      // Already registered (e.g. a second boot() call) — not fatal.
      results.push({ name: reg.name, success: false, reason: err.message });
      continue;
    }
    const result = await EngineBridge.load(reg.name, { target });
    results.push({ name: reg.name, ...result });
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.warn(`[EngineBridge] "${reg.name}" unavailable: ${result.reason}`);
    } else if (reg.name === 'audio') {
      await wireBrowserAudioProvider(target);
      // Real, existing event bus only (Rule 2 — no new event system).
      // Classic <script> consumers (VoiceCaptureAdapter, CozyHearing) load
      // synchronously and cannot assume window.CozyOS.AudioEngine already
      // exists by the time their own top-level code runs, since this
      // bootstrap loads engines via async dynamic import. This event is
      // the real, honest signal they wait for instead of guessing.
      if (target.CozyOS.PlatformEventBus && typeof target.CozyOS.PlatformEventBus.emit === 'function') {
        try { target.CozyOS.PlatformEventBus.emit('engine-bridge:audio-ready', {}); } catch (_err) { /* non-fatal */ }
      }
    }
  }
  return results;
}

/**
 * Milestone 158 — registers the platform's one real getUserMedia provider
 * with the newly-loaded canonical Listening Engine (AudioEngine). Fails
 * closed and non-fatally: if the provider module can't load, or is already
 * registered (e.g. a second boot() call), the dashboard continues without
 * real microphone capture rather than crashing (Rule 6 / existing
 * fail-closed convention in this file).
 */
async function wireBrowserAudioProvider(target) {
  try {
    const mod = await import('../engines/audio/provider-browser.js');
    const createBrowserAudioProvider = mod.default;
    target.CozyOS.AudioEngine.registerProvider(createBrowserAudioProvider());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[EngineBridge] Real browser audio provider unavailable: ${err.message}`);
  }
}

if (typeof window !== 'undefined') {
  boot(window).then((results) => {
    const failedNames = results.filter((r) => !r.success).map((r) => r.name);
    if (failedNames.length) {
      // eslint-disable-next-line no-console
      console.warn(`[EngineBridge] boot finished with ${failedNames.length} engine(s) unavailable: ${failedNames.join(', ')}. Dashboard continues — fail closed, never crash.`);
    }
  });
}

export { boot, REGISTRATIONS };
