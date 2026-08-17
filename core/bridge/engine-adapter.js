/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Engine Adapter
 * File: core/bridge/engine-adapter.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Owns turning a raw ES module namespace (from Module Loader) into a
 * normalized adapter: the real default-exported engine, its real service
 * manifest (if it exposes getServiceManifest()), and its real capabilities
 * (if it exposes getCapabilities()). It also owns talking to the existing
 * Kernel for compatibility checks and registration — reusing Kernel's real
 * checkCompatibility()/registerEngine(), never inventing a second
 * compatibility or registration system (Rule 2, Step 2 of this milestone).
 *
 * It does NOT expose anything on window.CozyOS — that is Service
 * Adapter's job — and it does NOT decide load order, caching, or lazy
 * loading — that is Module Loader's and Engine Bridge's job.
 *
 * HONESTY (Rule 6)
 * ------------------
 * If an engine has no getServiceManifest(), wrap() proceeds with
 * manifest: null rather than fabricating one. checkCompatibility()
 * without a real Kernel returns compatible:true with an explicit
 * reason of "unverified" — never silently claims a real check happened.
 * =============================================================================
 */

'use strict';

function wrap(moduleNamespace, { name: expectedName } = {}) {
  const engine = moduleNamespace && moduleNamespace.default;
  if (!engine) {
    throw new Error('[EngineAdapter] module has no default export — cannot adapt (see engine files\' `export default`).');
  }
  const manifest = typeof engine.getServiceManifest === 'function' ? engine.getServiceManifest() : null;
  if (expectedName && manifest && manifest.name !== expectedName) {
    throw new Error(`[EngineAdapter] manifest name mismatch: expected "${expectedName}", got "${manifest.name}".`);
  }
  let capabilities = null;
  let capabilitiesError = null;
  if (typeof engine.getCapabilities === 'function') {
    try {
      capabilities = engine.getCapabilities();
    } catch (err) {
      // Honest partial success: the engine itself loaded fine; only its
      // capability report failed (e.g. it needs runtime state, like a
      // provider, that isn't set up yet). That is not the same failure
      // as "module didn't load" and must not be conflated with it.
      capabilitiesError = err.message;
    }
  }
  return Object.freeze({ engine, manifest, capabilities, capabilitiesError });
}

/** Reuses the real Kernel.checkCompatibility() — never a second, invented compatibility system. */
async function checkCompatibility(manifest, kernel) {
  if (!manifest) {
    return Object.freeze({ compatible: true, reason: 'engine has no manifest to check — assumed compatible, not verified.' });
  }
  if (!kernel || typeof kernel.checkCompatibility !== 'function') {
    return Object.freeze({ compatible: true, reason: 'no real Kernel instance supplied — unverified, not fabricated as checked.' });
  }
  return kernel.checkCompatibility(manifest);
}

/** Reuses the real Kernel.registerEngine() via the engine's own registerWithKernel(), if it has one. Best-effort: a registration failure is reported, not thrown past the bridge's fail-closed boundary. */
async function registerWithKernel(engine, kernel) {
  if (!kernel) {
    return Object.freeze({ success: false, reason: 'no Kernel instance supplied.' });
  }
  if (typeof engine.registerWithKernel !== 'function') {
    return Object.freeze({ success: false, reason: 'engine has no registerWithKernel() — Kernel registration skipped, engine still usable directly.' });
  }
  try {
    const result = await engine.registerWithKernel(kernel);
    return Object.freeze({ success: true, result });
  } catch (err) {
    return Object.freeze({ success: false, reason: err.message });
  }
}

const EngineAdapter = Object.freeze({ wrap, checkCompatibility, registerWithKernel });

export default EngineAdapter;
