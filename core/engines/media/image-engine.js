/**
 * =============================================================================
 * CozyOS Media Engine — Image Engine
 * File: core/engines/media/image-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Owns still-image transformation: resize, crop, rotate, flip, sharpen,
 * brightness/contrast/saturation, grayscale, white-balance-style color
 * adjustment. It does not own capture (Camera Engine), analysis (Vision
 * Engine), background compositing (Background Engine), or named filter
 * presets (Filter Engine) — those are separate engines by design.
 *
 * PROVIDER INTERFACE
 * -------------------
 * All actual pixel math is delegated to a registered provider (see
 * provider-inmemory.js for the reference implementation and its honesty
 * notes). Image Engine itself contains only orchestration, validation, and
 * capability negotiation — never a fabricated pixel result.
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  PROVIDER_REGISTERED: 'image:provider-registered',
  TRANSFORM_APPLIED: 'image:transform-applied',
  ERROR: 'image:error'
});

const providers = new Map();
let activeProviderType = null;
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

function registerProvider(provider) {
  if (!provider || typeof provider.type !== 'string') {
    throw new TypeError('[ImageEngine] registerProvider() requires a provider with a string `type`.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  emit(EVENTS.PROVIDER_REGISTERED, { type: provider.type });
  return true;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[ImageEngine] no provider registered for type "${type || activeProviderType}". Fail closed — no fabricated transform.`);
  return p;
}

function _apply(operation, image, fn) {
  try {
    const result = fn();
    emit(EVENTS.TRANSFORM_APPLIED, { operation, width: result.width, height: result.height });
    return result;
  } catch (err) {
    emit(EVENTS.ERROR, { operation, message: err.message });
    throw err;
  }
}

function resize(image, width, height, providerType) {
  const provider = getProvider(providerType);
  return _apply('resize', image, () => provider.resize(image, width, height));
}

function crop(image, x, y, width, height, providerType) {
  const provider = getProvider(providerType);
  return _apply('crop', image, () => provider.crop(image, x, y, width, height));
}

function rotate(image, degrees, providerType) {
  const provider = getProvider(providerType);
  return _apply('rotate', image, () => provider.rotate(image, degrees));
}

function flip(image, axis, providerType) {
  if (axis !== 'horizontal' && axis !== 'vertical') {
    throw new TypeError('[ImageEngine] flip() axis must be "horizontal" or "vertical".');
  }
  const provider = getProvider(providerType);
  return _apply('flip', image, () => provider.flip(image, axis));
}

/** brightness/contrast/saturation are unified — this is CozyOS Rule 3 territory: one adjustment surface, not four competing ones. */
function adjust(image, { brightness = 0, contrast = 0, saturation = 0 } = {}, providerType) {
  const provider = getProvider(providerType);
  return _apply('adjust', image, () => provider.adjust(image, { brightness, contrast, saturation }));
}

function sharpen(image, providerType) {
  const provider = getProvider(providerType);
  if (typeof provider.sharpen !== 'function') {
    throw new Error('[ImageEngine] active provider does not support sharpen() — honest failure, no fabricated result.');
  }
  return _apply('sharpen', image, () => provider.sharpen(image));
}

/** White balance / color correction — approximated via brightness+saturation until a color-science provider is registered. */
function colorCorrect(image, { warmth = 0, tint = 0 } = {}, providerType) {
  const provider = getProvider(providerType);
  return _apply('colorCorrect', image, () => provider.adjust(image, { brightness: tint, saturation: warmth }));
}

function grayscale(image, providerType) {
  const provider = getProvider(providerType);
  return _apply('grayscale', image, () => provider.grayscale(image));
}

function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  return Object.freeze({
    resize: true, crop: true, rotate: true, flip: true, adjust: true, grayscale: true,
    sharpen: typeof provider.sharpen === 'function',
    hdrEnhancement: false,
    shadowRemoval: false,
    reflectionRemoval: false
  });
}

// -----------------------------------------------------------------------------
// Phase 2 — Image Analysis (real, pixel-derived; no fabricated AI scoring)
// -----------------------------------------------------------------------------

function _toGrayscaleArray(image) {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/** Real Laplacian-variance blur/sharpness metric — higher variance = sharper. Standard, well-established measure. */
function _laplacianVariance(image) {
  const { width, height } = image;
  const gray = _toGrayscaleArray(image);
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function analyzeBlur(image) {
  const variance = _laplacianVariance(image);
  // Empirical, documented threshold band (not an ML score): <50 blurry, >150 sharp.
  return Object.freeze({ laplacianVariance: variance, isBlurry: variance < 50 });
}

function analyzeSharpness(image) {
  const variance = _laplacianVariance(image);
  return Object.freeze({ score: Math.min(100, Math.round((variance / 300) * 100)) });
}

function analyzeBrightness(image) {
  const gray = _toGrayscaleArray(image);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  return Object.freeze({ mean, normalized: Number((mean / 255).toFixed(4)) });
}

function analyzeContrast(image) {
  const gray = _toGrayscaleArray(image);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  let variance = 0;
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2;
  variance /= gray.length;
  return Object.freeze({ stdDev: Math.sqrt(variance) });
}

/** Real 256-bucket luminance histogram. */
function analyzeHistogram(image) {
  const gray = _toGrayscaleArray(image);
  const buckets = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) buckets[Math.min(255, Math.round(gray[i]))]++;
  return Object.freeze(buckets);
}

/** Real noise estimate: high-frequency energy after removing a 3x3 mean, normalized by pixel count. */
function analyzeNoise(image) {
  const { width, height } = image;
  const gray = _toGrayscaleArray(image);
  let energy = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      let meanNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) meanNeighbors += gray[i + dy * width + dx];
      meanNeighbors /= 9;
      energy += Math.abs(gray[i] - meanNeighbors);
      n++;
    }
  }
  return Object.freeze({ estimate: n === 0 ? 0 : energy / n });
}

function analyzeDynamicRange(image) {
  const gray = _toGrayscaleArray(image);
  let min = 255, max = 0;
  for (let i = 0; i < gray.length; i++) { if (gray[i] < min) min = gray[i]; if (gray[i] > max) max = gray[i]; }
  return Object.freeze({ min, max, range: max - min });
}

function analyzeSaturation(image) {
  const { data } = image;
  let sum = 0;
  const pixelCount = image.width * image.height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    sum += max === 0 ? 0 : (max - min) / max;
  }
  return Object.freeze({ mean: sum / pixelCount });
}

function analyzeExposure(image) {
  const { mean } = analyzeBrightness(image);
  const { data } = image;
  let clippedShadows = 0, clippedHighlights = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l < 5) clippedShadows++;
    if (l > 250) clippedHighlights++;
  }
  const pixelCount = image.width * image.height;
  return Object.freeze({
    meanLuma: mean,
    clippedShadowsRatio: clippedShadows / pixelCount,
    clippedHighlightsRatio: clippedHighlights / pixelCount,
    verdict: mean < 60 ? 'underexposed' : mean > 200 ? 'overexposed' : 'balanced'
  });
}

function analyzeResolution(image) {
  const megapixels = (image.width * image.height) / 1_000_000;
  return Object.freeze({ width: image.width, height: image.height, megapixels: Number(megapixels.toFixed(2)) });
}

/** Aggregate report — every field above, computed once. */
function analyze(image) {
  return Object.freeze({
    blur: analyzeBlur(image),
    sharpness: analyzeSharpness(image),
    brightness: analyzeBrightness(image),
    contrast: analyzeContrast(image),
    noise: analyzeNoise(image),
    dynamicRange: analyzeDynamicRange(image),
    saturation: analyzeSaturation(image),
    exposure: analyzeExposure(image),
    resolution: analyzeResolution(image)
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'image-engine', version: '1.0.0', apiVersion: '1.0.0',
    priority: 20, mandatory: false, dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[ImageEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  providers.clear();
  activeProviderType = null;
}

const ImageEngine = Object.freeze({
  EVENTS, on,
  registerProvider, getProvider,
  resize, crop, rotate, flip, adjust, sharpen, colorCorrect, grayscale,
  getCapabilities,
  analyzeBlur, analyzeSharpness, analyzeBrightness, analyzeContrast, analyzeHistogram,
  analyzeNoise, analyzeDynamicRange, analyzeSaturation, analyzeExposure, analyzeResolution, analyze,
  getServiceManifest, registerWithKernel,
  __resetForTests
});

export default ImageEngine;
