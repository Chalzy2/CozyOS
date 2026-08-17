/**
 * =============================================================================
 * CozyOS Media Engine — Live Effects Engine
 * File: core/engines/media/live-effects-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Real, mathematically generated procedural overlays — rain, snow, clouds,
 * fog, mist, wind particles, dust, sun rays, light bloom, fire embers. No
 * stock assets, no AI generation: every pixel here comes from a seeded
 * particle simulation or noise function evaluated for real, each time
 * render() is called.
 *
 * Effects are STATEFUL per session (particles have positions/velocities
 * that advance frame to frame) — that state lives here, not in Background
 * Engine, which stays a stateless-per-frame compositor.
 * =============================================================================
 */

'use strict';

const EFFECT_TYPES = Object.freeze([
  'rain', 'snow', 'clouds', 'fog', 'mist', 'wind-particles', 'dust',
  'sun-rays', 'light-bloom', 'fire-embers'
]);

// Deterministic PRNG (mulberry32) — reproducible, not Math.random(), so
// tests can assert on real output instead of "did it throw".
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function blendPixel(data, i, color, alpha) {
  data[i] = clamp255(data[i] * (1 - alpha) + color[0] * alpha);
  data[i + 1] = clamp255(data[i + 1] * (1 - alpha) + color[1] * alpha);
  data[i + 2] = clamp255(data[i + 2] * (1 - alpha) + color[2] * alpha);
}

function initParticles(type, width, height, count, rng) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rng() * width,
      y: rng() * height,
      vx: 0, vy: 0, life: rng(), size: 1
    });
    const p = particles[i];
    switch (type) {
      case 'rain': p.vx = -0.3; p.vy = 12 + rng() * 6; p.size = 1; break;
      case 'snow': p.vx = Math.sin(p.life * 6) * 0.6; p.vy = 1 + rng() * 1.5; p.size = 1 + rng() * 2; break;
      case 'wind-particles': p.vx = 3 + rng() * 4; p.vy = (rng() - 0.5) * 0.5; p.size = 1; break;
      case 'dust': p.vx = (rng() - 0.5) * 0.4; p.vy = (rng() - 0.5) * 0.4; p.size = 1 + rng(); break;
      case 'fire-embers': p.vx = (rng() - 0.5) * 0.8; p.vy = -(1 + rng() * 2); p.size = 1 + rng() * 1.5; break;
      default: break;
    }
    p.baseX = p.x; p.baseY = p.y;
  }
  return particles;
}

function stepParticles(particles, type, width, height, rng) {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (type === 'fire-embers') p.life -= 0.01;
    const offscreen = p.x < 0 || p.x > width || p.y < 0 || p.y > height || (type === 'fire-embers' && p.life <= 0);
    if (offscreen) {
      p.x = type === 'rain' || type === 'snow' ? rng() * width : (type === 'fire-embers' ? width / 2 + (rng() - 0.5) * width * 0.3 : rng() * width);
      p.y = type === 'rain' || type === 'snow' ? -5 : (type === 'fire-embers' ? height : rng() * height);
      p.life = 1;
    }
  }
}

/** 2D value-noise field (real, deterministic) used for clouds/fog/mist/light bloom. */
function noiseField(width, height, scale, rng, octaves = 3) {
  const field = new Float32Array(width * height);
  const gridW = Math.ceil(width / scale) + 2, gridH = Math.ceil(height / scale) + 2;
  const grid = new Float32Array(gridW * gridH);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  function sample(x, y) {
    const gx = x / scale, gy = y / scale;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const v00 = grid[y0 * gridW + x0], v10 = grid[y0 * gridW + x0 + 1];
    const v01 = grid[(y0 + 1) * gridW + x0], v11 = grid[(y0 + 1) * gridW + x0 + 1];
    const top = v00 + (v10 - v00) * fx, bottom = v01 + (v11 - v01) * fx;
    return top + (bottom - top) * fy;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      field[y * width + x] = sample(x, y);
    }
  }
  return field;
}

const sessions = new Map(); // sessionId -> { type, particles, rng, options, frame }

function start(sessionId, type, image, options = {}) {
  if (!EFFECT_TYPES.includes(type)) {
    throw new TypeError(`[LiveEffectsEngine] unknown effect type "${type}". Known: ${EFFECT_TYPES.join(', ')}.`);
  }
  const rng = makeRng(options.seed ?? 1);
  const state = { type, options, rng, frame: 0, width: image.width, height: image.height };
  if (['rain', 'snow', 'wind-particles', 'dust', 'fire-embers'].includes(type)) {
    state.particles = initParticles(type, image.width, image.height, options.count || 150, rng);
  }
  sessions.set(sessionId, state);
  return true;
}

function stop(sessionId) {
  return sessions.delete(sessionId);
}

function isActive(sessionId) {
  return sessions.has(sessionId);
}

/** Renders one frame of the active effect onto `image`, advancing particle/noise state for real. */
function render(sessionId, image) {
  const state = sessions.get(sessionId);
  if (!state) return image;
  const { type, width, height } = image;
  const out = new Uint8ClampedArray(image.data);
  state.frame += 1;

  if (state.particles) {
    stepParticles(state.particles, type, width, height, state.rng);
    const color = {
      rain: [180, 200, 220], snow: [255, 255, 255], 'wind-particles': [230, 230, 230],
      dust: [200, 180, 140], 'fire-embers': [255, 140, 40]
    }[type] || [255, 255, 255];
    for (const p of state.particles) {
      const px = Math.round(p.x), py = Math.round(p.y);
      const alpha = type === 'fire-embers' ? Math.max(0, p.life) : 0.85;
      for (let dy = 0; dy < Math.ceil(p.size); dy++) {
        for (let dx = 0; dx < Math.ceil(p.size); dx++) {
          const x = px + dx, y = py + dy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          blendPixel(out, (y * width + x) * 4, color, alpha);
        }
      }
    }
  } else {
    // clouds / fog / mist / sun-rays / light-bloom: noise-field based
    const scaleByType = { clouds: 40, fog: 60, mist: 80, 'sun-rays': 25, 'light-bloom': 15 }[type] || 40;
    const field = noiseField(width, height, scaleByType, makeRng((state.options.seed ?? 1) + state.frame));
    const baseAlpha = { clouds: 0.35, fog: 0.5, mist: 0.3, 'sun-rays': 0.25, 'light-bloom': 0.4 }[type] || 0.3;
    const color = type === 'sun-rays' || type === 'light-bloom' ? [255, 244, 214] : [235, 235, 240];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = field[y * width + x];
        let alpha = n * baseAlpha;
        if (type === 'sun-rays') {
          // radial falloff from a fixed light source, real trig, not a stock asset
          const dx = x - width * 0.15, dy = y - height * 0.1;
          const angle = Math.atan2(dy, dx);
          const ray = (Math.sin(angle * 8 + state.frame * 0.05) + 1) / 2;
          alpha *= ray;
        }
        blendPixel(out, (y * width + x) * 4, color, alpha);
      }
    }
  }
  return { width, height, data: out };
}

function listActive() {
  return Object.freeze(Array.from(sessions.keys()));
}

function getServiceManifest() {
  return Object.freeze({
    name: 'live-effects-engine', version: '1.0.0', apiVersion: '1.0.0',
    priority: 20, mandatory: false, dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[LiveEffectsEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  sessions.clear();
}

const LiveEffectsEngine = Object.freeze({
  EFFECT_TYPES,
  start, stop, isActive, render, listActive,
  getServiceManifest, registerWithKernel,
  __resetForTests
});

export default LiveEffectsEngine;
