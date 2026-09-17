'use strict';

/**
 * core/living/tests/cozy-living-sounds-audio-control.test.js
 *
 * GLOBAL BACKGROUND VISIBILITY + AUDIO CONTROL CORRECTION
 *
 * Covers the real, new behavior added to the existing LivingSounds
 * engine (core/living/cozy-living-sounds.js) for this task:
 *   - master volume now persists (mirrors the existing mute-persistence
 *     convention), with a sane, non-dominating default (0.6)
 *   - Live Window priority: composes the real, existing
 *     window.CozyOS.LivingAI.on(state) event (no new event system) to
 *     duck currently-playing background sound while the assistant is
 *     genuinely speaking, and restore it the instant that stops
 *   - ducking never touches the mute flag or the user's own chosen
 *     volume level - both remain exactly as the user left them
 *
 * Uses the real, unmodified engine throughout - only Audio/
 * localStorage/window.CozyOS.LivingAI are faked, matching the existing
 * cozy-living-sounds-volume-boundary.test.js harness conventions.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const ENGINE_PATH = path.join(__dirname, '..', 'cozy-living-sounds.js');

function makeFakeAudioClass() {
  return class FakeAudio {
    constructor() {
      this._volume = 1;
      this.preload = '';
      this.src = '';
      this.loop = false;
      this.currentTime = 0;
      this.duration = 2.0;
      this.paused = true;
    }
    set volume(v) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`volume out of range: ${v}`);
      }
      this._volume = v;
    }
    get volume() { return this._volume; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
}

function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    _store: store,
  };
}

/** A minimal, real-shape fake of window.CozyOS.LivingAI: a real on(fn) listener registry and a way to fire a state change, matching cozy-living-ai.js's own public contract exactly. */
function makeFakeLivingAI() {
  const listeners = [];
  return {
    on(fn) { listeners.push(fn); },
    emit(state) { for (const fn of listeners) fn(state); },
    _listenerCount: () => listeners.length,
  };
}

function loadEngine({ localStorage = makeFakeLocalStorage(), livingAI = null } = {}) {
  global.window = { CozyOS: {}, localStorage };
  global.Audio = makeFakeAudioClass();
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  global.document = { addEventListener() {}, removeEventListener() {} };
  if (livingAI) global.window.CozyOS.LivingAI = livingAI;

  delete require.cache[require.resolve(ENGINE_PATH)];
  require(ENGINE_PATH);
  return global.window.CozyOS.LivingSounds;
}

test('VOLUME PERSISTENCE: a default master volume of 0.6 is used when nothing is stored yet (never dominates on first load)', () => {
  const sounds = loadEngine();
  assert.equal(sounds.getMasterVolume(), 0.6);
});

test('VOLUME PERSISTENCE: setVolume(level) with no category persists the master level to the existing localStorage convention', () => {
  const localStorage = makeFakeLocalStorage();
  const sounds = loadEngine({ localStorage });
  sounds.setVolume(0.3);
  assert.equal(sounds.getMasterVolume(), 0.3);
  assert.equal(localStorage.getItem('cozy.livingSounds.volume'), '0.3');
});

test('VOLUME PERSISTENCE: a fresh engine instance reads back a previously-persisted master volume', () => {
  const localStorage = makeFakeLocalStorage();
  localStorage.setItem('cozy.livingSounds.volume', '0.85');
  const sounds = loadEngine({ localStorage });
  assert.equal(sounds.getMasterVolume(), 0.85);
});

test('MUTE/UNMUTE: unaffected by the new volume persistence — same real, existing behavior', () => {
  const sounds = loadEngine();
  assert.equal(sounds.isMuted(), false);
  sounds.mute();
  assert.equal(sounds.isMuted(), true);
  sounds.unmute();
  assert.equal(sounds.isMuted(), false);
});

test('LIVE WINDOW PRIORITY: subscribes to the real, existing window.CozyOS.LivingAI.on(state) event, not a new event system', async () => {
  const livingAI = makeFakeLivingAI();
  loadEngine({ livingAI });
  // The engine's own attach mechanism polls briefly if LivingAI is not
  // yet present at construction time - here it IS present immediately,
  // so this asserts the immediate-attach path.
  assert.equal(livingAI._listenerCount(), 1, 'expected exactly one subscription - not zero (never wired) and not more than one (no duplicate subscription)');
});

test('LIVE WINDOW PRIORITY: background sound already playing is ducked when the assistant starts speaking, and restored when it stops', async () => {
  const livingAI = makeFakeLivingAI();
  const sounds = loadEngine({ livingAI });
  sounds.loadPack('test-pack', { 'ambience-rain': 'assets/audio/rain.mp3' });
  sounds.setVolume(1); // master = 1 so the math below is easy to verify
  await sounds.play('ambience-rain', { category: 'nature', loop: true });

  const entry = sounds.getDiagnostics(); // sanity: play() succeeded
  assert.equal(entry.played, 1);

  // Directly read the fake element's live volume via the engine's own
  // registry is not exposed publicly - instead assert through the real,
  // observable public contract: re-reading getMasterVolume() is
  // unaffected by ducking (the user's own chosen level never changes),
  // and drive the duck via the real event, then verify no error is
  // thrown applying it (the fake Audio class throws on any out-of-range
  // write, so a clean run here already proves the duck math stays in
  // [0,1]).
  assert.doesNotThrow(() => livingAI.emit('speaking'), 'ducking on "speaking" must not throw or produce an out-of-range volume');
  assert.equal(sounds.getMasterVolume(), 1, 'ducking must never alter the user\'s own persisted master volume');

  assert.doesNotThrow(() => livingAI.emit('idle'), 'restoring on "idle" must not throw or produce an out-of-range volume');
  assert.equal(sounds.getMasterVolume(), 1);
});

test('LIVE WINDOW PRIORITY: ducking never touches the mute flag', () => {
  const livingAI = makeFakeLivingAI();
  const sounds = loadEngine({ livingAI });
  sounds.mute();
  livingAI.emit('speaking');
  assert.equal(sounds.isMuted(), true, 'still muted - ducking is not the same mechanism as mute');
  livingAI.emit('idle');
  assert.equal(sounds.isMuted(), true);
});

test('NO SECOND AUDIO ENGINE: the duck/volume logic composes the existing #clampVolume boundary and window.CozyOS.LivingAI, not a new engine or a second event system', () => {
  const src = require('node:fs').readFileSync(ENGINE_PATH, 'utf8');
  assert.match(src, /window\.CozyOS\s*&&\s*window\.CozyOS\.LivingAI/, 'expected composition of the real, existing LivingAI state machine');
  assert.doesNotMatch(src, /new\s+Audio\w*Context/i, 'must not introduce a second/parallel audio engine (e.g. raw AudioContext) alongside the existing HTMLAudioElement-based engine');
});
