/**
 * =============================================================================
 * CozyOS Media Engine — Filter Engine
 * File: core/engines/media/filter-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Owns named filter presets (vintage, black & white, HDR-look, cinematic,
 * portrait, night, sketch, cartoon, Cozy Brand) and the registry that lets
 * applications register their own custom filters. A filter is a named,
 * ordered list of provider operations + params — Filter Engine composes
 * and applies them via a supplied provider; it does not implement its own
 * pixel math (that stays owned by the provider, matching Image Engine).
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  FILTER_REGISTERED: 'filter:registered',
  FILTER_APPLIED: 'filter:applied',
  ERROR: 'filter:error'
});

const filters = new Map();
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

/**
 * @param {string} name
 * @param {Array<{op: string, params?: object}>} steps - provider op names + params, applied in order
 */
function registerFilter(name, steps) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('[FilterEngine] registerFilter() requires a non-empty name.');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new TypeError('[FilterEngine] registerFilter() requires a non-empty steps array.');
  }
  filters.set(name, steps);
  emit(EVENTS.FILTER_REGISTERED, { name, custom: true });
  return true;
}

function unregisterFilter(name) {
  return filters.delete(name);
}

function listFilters() {
  return Object.freeze(Array.from(filters.keys()));
}

function hasFilter(name) {
  return filters.has(name);
}

/** Applies a registered filter's step chain to `image` via `provider`. */
function applyFilter(name, image, provider) {
  const steps = filters.get(name);
  if (!steps) {
    const err = new Error(`[FilterEngine] no filter registered named "${name}". Fail closed — no fabricated output.`);
    emit(EVENTS.ERROR, { name, message: err.message });
    throw err;
  }
  if (!provider) throw new Error('[FilterEngine] applyFilter() requires a provider (see Image Engine / provider-inmemory.js).');

  let current = image;
  for (const step of steps) {
    if (typeof provider[step.op] !== 'function') {
      const err = new Error(`[FilterEngine] provider does not implement op "${step.op}" required by filter "${name}".`);
      emit(EVENTS.ERROR, { name, op: step.op, message: err.message });
      throw err;
    }
    current = step.params
      ? provider[step.op](current, step.params)
      : provider[step.op](current);
  }
  emit(EVENTS.FILTER_APPLIED, { name });
  return current;
}

function _registerBuiltins() {
  registerFilter('black-and-white', [{ op: 'grayscale' }]);
  registerFilter('vintage', [{ op: 'adjust', params: { brightness: -10, contrast: -15, saturation: -30 } }]);
  registerFilter('cinematic', [{ op: 'adjust', params: { brightness: -5, contrast: 25, saturation: -10 } }]);
  registerFilter('portrait', [{ op: 'blur', params: 1 }, { op: 'adjust', params: { brightness: 5, saturation: 10 } }]);
  registerFilter('night', [{ op: 'adjust', params: { brightness: -25, contrast: 10, saturation: -20 } }]);
  registerFilter('hdr', [{ op: 'adjust', params: { contrast: 40, saturation: 20 } }]);
  registerFilter('cozy-brand', [{ op: 'adjust', params: { brightness: 8, contrast: 5, saturation: 15 } }]);
}
_registerBuiltins();

// -----------------------------------------------------------------------------
// Phase 2 — Filter Pipelines (compose EXISTING filters only; Rule 2: no
// duplicate filter logic. A pipeline is an ordered list of filter names
// already registered above/by the app.)
// -----------------------------------------------------------------------------

const pipelines = new Map(); // name -> string[] filter names, in order

function registerPipeline(name, filterNames) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('[FilterEngine] registerPipeline() requires a non-empty name.');
  }
  if (!Array.isArray(filterNames) || filterNames.length === 0) {
    throw new TypeError('[FilterEngine] registerPipeline() requires a non-empty filterNames array.');
  }
  for (const fname of filterNames) {
    if (!filters.has(fname)) {
      throw new Error(`[FilterEngine] pipeline "${name}" references unregistered filter "${fname}" — register the filter first (no duplicate filter logic in a pipeline).`);
    }
  }
  pipelines.set(name, Object.freeze([...filterNames]));
  return true;
}

function unregisterPipeline(name) {
  return pipelines.delete(name);
}

function listPipelines() {
  return Object.freeze(Array.from(pipelines.keys()));
}

function getPipeline(name) {
  const steps = pipelines.get(name);
  return steps ? Object.freeze([...steps]) : null;
}

/** Runs every filter in a registered pipeline, in order, via applyFilter() — same fail-closed behavior per step. */
function applyPipeline(name, image, provider) {
  const steps = pipelines.get(name);
  if (!steps) {
    throw new Error(`[FilterEngine] no pipeline registered named "${name}". Fail closed — no fabricated output.`);
  }
  let current = image;
  for (const filterName of steps) {
    current = applyFilter(filterName, current, provider);
  }
  return current;
}

function _registerBuiltinPipelines() {
  registerPipeline('cozycabin-product', ['hdr', 'cozy-brand']);
  registerPipeline('meeting', ['portrait']);
  registerPipeline('portrait-pipeline', ['portrait', 'cozy-brand']);
  registerPipeline('document', ['black-and-white']);
  registerPipeline('ocr-pipeline', ['black-and-white']);
  registerPipeline('security', ['black-and-white']);
}
_registerBuiltinPipelines();

function getServiceManifest() {
  return Object.freeze({
    name: 'filter-engine', version: '1.0.0', apiVersion: '1.0.0',
    priority: 20, mandatory: false, dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[FilterEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  filters.clear();
  pipelines.clear();
  _registerBuiltins();
  _registerBuiltinPipelines();
}

const FilterEngine = Object.freeze({
  EVENTS, on,
  registerFilter, unregisterFilter, listFilters, hasFilter, applyFilter,
  registerPipeline, unregisterPipeline, listPipelines, getPipeline, applyPipeline,
  getServiceManifest, registerWithKernel,
  __resetForTests
});

export default FilterEngine;
