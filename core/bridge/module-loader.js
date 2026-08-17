/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Module Loader
 * File: core/bridge/module-loader.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Owns exactly one thing: turning a module path into a loaded ES module
 * namespace object, via real dynamic import(), with caching so repeated
 * resolve() calls don't re-import. Nothing else — no adapter wrapping, no
 * window exposure, no Kernel awareness. Those are Engine Adapter's and
 * Service Adapter's jobs (Rule 3, single responsibility).
 *
 * HONESTY (Rule 6)
 * ------------------
 * A failed dynamic import() is never swallowed into a fake "empty module".
 * loadModule() lets the real error propagate to the caller (Engine Bridge),
 * which is where fail-closed "Unavailable" handling belongs — this file
 * only reports what actually happened.
 *
 * BROWSER COMPATIBILITY
 * -----------------------
 * Dynamic import() is available in both `<script type="module">` and plain
 * classic `<script>` contexts in every browser CozyOS targets, and natively
 * in Node (used here for real, executed tests). No feature-detection hack
 * (e.g. eval-based sniffing) is used — if import() truly isn't supported,
 * the call throws for real and is reported for real, which is honest
 * fail-closed behavior rather than a fabricated capability check.
 * =============================================================================
 */

'use strict';

const cache = new Map(); // modulePath -> { module, loadedAt }
const listeners = new Map();

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

function emit(eventName, payload) {
  const handlers = listeners.get(eventName);
  if (!handlers) return;
  for (const handler of handlers) handler(payload);
}

/** Real dynamic import — resolves relative to THIS file's location, since specifiers are resolved relative to the referencing module. */
async function loadModule(modulePath) {
  if (typeof modulePath !== 'string' || !modulePath) {
    throw new TypeError('[ModuleLoader] loadModule() requires a non-empty module path string.');
  }
  if (cache.has(modulePath)) {
    return cache.get(modulePath).module;
  }
  const mod = await import(modulePath);
  cache.set(modulePath, { module: mod, loadedAt: Date.now() });
  emit('loaded', { modulePath });
  return mod;
}

function isCached(modulePath) {
  return cache.has(modulePath);
}

function unload(modulePath) {
  const existed = cache.delete(modulePath);
  if (existed) emit('unloaded', { modulePath });
  return existed;
}

function listLoaded() {
  return Object.freeze(Array.from(cache.keys()));
}

function __resetForTests() {
  cache.clear();
}

const ModuleLoader = Object.freeze({
  on, loadModule, isCached, unload, listLoaded, __resetForTests
});

export default ModuleLoader;
