/**
 * =============================================================================
 * CozyOS Media Engine — Environment Engine
 * File: core/engines/media/environment-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Background Engine (Milestone 140) owns applying a background treatment
 * to a frame (blur/replace/composite) given an image handle it's already
 * been given. Environment Engine owns something upstream of that: a real
 * category taxonomy (Nature, Weather, Professional, Africa, World,
 * Seasonal, Brand, Customer, ...) and a provider registry so real asset
 * sources can register named environments under those categories.
 *
 * HONESTY (Rule 6) — THE CENTRAL CONSTRAINT OF THIS FILE
 * ------------------------------------------------------------
 * This engine ships ZERO images. "Maasai Mara", "Victoria Falls", "Tokyo
 * skyline" etc. are not bundled — there is no network access and no
 * licensed asset library in this sandbox. What's real here is the
 * registry: categories exist, environments can be registered into them
 * with a resolver function a real provider supplies, and looking up an
 * environment that has no registered provider fails closed with an
 * honest "not yet provided" error — never a placeholder image, a solid
 * color pretending to be a photo, or a fabricated success.
 * =============================================================================
 */

'use strict';

const CATEGORIES = Object.freeze([
  'nature', 'weather', 'water', 'professional', 'africa', 'world',
  'seasonal', 'holiday', 'brand', 'customer', 'abstract', 'space'
]);

const EVENTS = Object.freeze({
  ENVIRONMENT_REGISTERED: 'environment:registered',
  ENVIRONMENT_UNREGISTERED: 'environment:unregistered',
  ERROR: 'environment:error'
});

// category -> Map(environmentId -> descriptor)
const registry = new Map(CATEGORIES.map((c) => [c, new Map()]));
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
 * Registers a real environment descriptor into a category. `resolve` is a
 * real function a provider supplies to actually produce the image — this
 * engine never supplies one itself.
 * @param {string} category - one of CATEGORIES
 * @param {string} id - unique id within the category, e.g. "maasai-mara"
 * @param {object} descriptor
 * @param {string} descriptor.label - display name
 * @param {Function} descriptor.resolve - async (options) => ImageHandle, provided by a real asset provider
 * @param {object} [descriptor.tags]
 */
function registerEnvironment(category, id, descriptor) {
  if (!CATEGORIES.includes(category)) {
    throw new TypeError(`[EnvironmentEngine] unknown category "${category}". Known: ${CATEGORIES.join(', ')}.`);
  }
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('[EnvironmentEngine] registerEnvironment() requires a non-empty id.');
  }
  if (!descriptor || typeof descriptor.resolve !== 'function') {
    throw new TypeError('[EnvironmentEngine] registerEnvironment() requires descriptor.resolve — a real function that produces the image. No placeholder resolvers.');
  }
  const bucket = registry.get(category);
  if (bucket.has(id)) {
    throw new Error(`[EnvironmentEngine] "${category}/${id}" is already registered — no duplicate registration.`);
  }
  bucket.set(id, Object.freeze({
    id, category,
    label: descriptor.label || id,
    tags: Object.freeze(descriptor.tags ? { ...descriptor.tags } : {}),
    resolve: descriptor.resolve
  }));
  emit(EVENTS.ENVIRONMENT_REGISTERED, { category, id });
  return true;
}

function unregisterEnvironment(category, id) {
  const bucket = registry.get(category);
  const existed = Boolean(bucket && bucket.delete(id));
  if (existed) emit(EVENTS.ENVIRONMENT_UNREGISTERED, { category, id });
  return existed;
}

function listCategories() {
  return CATEGORIES;
}

/** Lists registered environments — real metadata only (id/label/tags), never the image itself. */
function listEnvironments(category) {
  const bucket = registry.get(category);
  if (!bucket) throw new TypeError(`[EnvironmentEngine] unknown category "${category}".`);
  return Object.freeze(Array.from(bucket.values()).map((d) => Object.freeze({ id: d.id, label: d.label, tags: d.tags })));
}

function hasEnvironment(category, id) {
  const bucket = registry.get(category);
  return Boolean(bucket && bucket.has(id));
}

/** Actually resolves an environment to a real ImageHandle via its registered provider. Fails closed if none is registered. */
async function resolveEnvironment(category, id, options) {
  const bucket = registry.get(category);
  const descriptor = bucket && bucket.get(id);
  if (!descriptor) {
    const err = new Error(`[EnvironmentEngine] "${category}/${id}" has no registered provider — not yet provided. Fail closed, no fabricated image.`);
    emit(EVENTS.ERROR, { category, id, message: err.message });
    throw err;
  }
  return descriptor.resolve(options);
}

function getServiceManifest() {
  return Object.freeze({
    name: 'environment-engine', version: '1.0.0', apiVersion: '1.0.0',
    priority: 20, mandatory: false, dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[EnvironmentEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  for (const bucket of registry.values()) bucket.clear();
}

const EnvironmentEngine = Object.freeze({
  CATEGORIES, EVENTS, on,
  registerEnvironment, unregisterEnvironment,
  listCategories, listEnvironments, hasEnvironment, resolveEnvironment,
  getServiceManifest, registerWithKernel,
  __resetForTests
});

export default EnvironmentEngine;
