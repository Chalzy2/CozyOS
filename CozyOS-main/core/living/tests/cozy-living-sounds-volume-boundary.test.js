'use strict';

/**
 * core/living/tests/cozy-living-sounds-volume-boundary.test.js
 *
 * Targeted regression for the reproducible real-browser pageerror:
 *   "Failed to set the 'volume' property on 'HTMLMediaElement':
 *    The volume provided (-0.000225) is outside the range [0, 1]."
 *
 * ROOT CAUSE (confirmed by audit, not guessed): both requestAnimationFrame
 * fade ramps in cozy-living-sounds.js (play()'s fade-in `step()`,
 * fadeOut()'s fade-out `step()`) computed a progress fraction `t` as
 * `(now - start) / durationMs`, clamped only at the upper bound via
 * `Math.min(1, ...)` — never at the lower bound. A real rAF callback
 * timestamp can land microseconds before the `start` time captured via a
 * separate performance.now() call (clock-domain drift between the two
 * timer sources), producing a `t` fractionally below 0 and, downstream,
 * a `.volume` fractionally below 0 (fade-in) or fractionally above 1
 * (fade-out, since `1 - t` then exceeds 1).
 *
 * This test simulates that exact drift deterministically — a fake
 * requestAnimationFrame whose first callback timestamp is a few
 * microseconds *earlier* than the `start` value performance.now()
 * returned moments before — so it reproduces the failure mode without
 * depending on any particular real machine's actual clock jitter.
 *
 * Uses the real, unmodified cozy-living-sounds.js engine throughout; no
 * second audio engine, no mock of the fix itself — only Audio/
 * performance/requestAnimationFrame are faked, exactly as any Node
 * environment without a real browser must.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const ENGINE_PATH = path.join(__dirname, '..', 'cozy-living-sounds.js');

/**
 * A minimal, real-behavior-matching fake HTMLAudioElement: its `.volume`
 * setter throws exactly like a real browser's HTMLMediaElement does for
 * an out-of-range value, so a bug in the surrounding code is caught the
 * same way a real browser would catch it — not silently absorbed by a
 * lenient mock.
 */
function makeFakeAudioClass(observedVolumes) {
  return class FakeAudio {
    constructor() {
      this._volume = 1;
      this.preload = '';
      this.src = '';
      this.loop = false;
      this.currentTime = 0;
      this.duration = 2.0;
    }
    set volume(v) {
      observedVolumes.push(v);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`Failed to set the 'volume' property on 'HTMLMediaElement': The volume provided (${v}) is outside the range [0, 1].`);
      }
      this._volume = v;
    }
    get volume() { return this._volume; }
    play() { return Promise.resolve(); }
    pause() {}
  };
}

/**
 * Loads a fresh instance of the real engine with controllable
 * performance.now()/requestAnimationFrame, and returns handles to drive
 * the fade deterministically frame-by-frame.
 */
function loadEngineWithControlledClock({ driftMs = 0 } = {}) {
  const observedVolumes = [];
  const rafQueue = [];
  let clockNow = 1_000_000; // arbitrary large base, matches real performance.now() magnitude

  global.window = { CozyOS: {} };
  global.Audio = makeFakeAudioClass(observedVolumes);
  global.performance = { now: () => clockNow };
  global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  global.document = { addEventListener() {}, removeEventListener() {} };

  delete require.cache[require.resolve(ENGINE_PATH)];
  require(ENGINE_PATH);
  const sounds = global.window.CozyOS.LivingSounds;

  // Register one real event with the fake Audio element, exactly the
  // way loadPack() already does for real production assets.
  sounds.loadPack('test-pack', { 'button-hover': 'assets/audio/test.mp3' });

  return {
    sounds,
    observedVolumes,
    /** Advances the fake clock and runs exactly one queued rAF frame. */
    tick(deltaMs) {
      clockNow += deltaMs;
      const cb = rafQueue.shift();
      if (cb) cb(clockNow);
    },
    /** Simulates the real drift: the *first* rAF callback fires with a
     *  timestamp `driftMs` earlier than clockNow, before any further
     *  ticks — reproducing the exact "now < start" condition. */
    runFirstFrameWithDrift() {
      const cb = rafQueue.shift();
      if (cb) cb(clockNow - driftMs);
    },
  };
}

test('ROOT CAUSE REPRODUCED (pre-fix behavior would fail this): fade-in first frame with negative clock drift never sets volume outside [0,1]', async () => {
  const { sounds, observedVolumes, runFirstFrameWithDrift } = loadEngineWithControlledClock({ driftMs: 0.225 });
  await sounds.play('button-hover', { fadeMs: 500 });
  // First queued frame simulates the real observed drift (rAF timestamp
  // earlier than `start`), which is exactly when the bug fired.
  assert.doesNotThrow(() => runFirstFrameWithDrift(), 'fade-in step() must not throw on a negative-drift first frame');
  for (const v of observedVolumes) {
    assert.ok(v >= 0 && v <= 1, `observed volume ${v} was outside [0,1]`);
  }
});

test('FADE-OUT: first frame with negative clock drift never sets volume outside [0,1]', () => {
  const { sounds, observedVolumes, runFirstFrameWithDrift } = loadEngineWithControlledClock({ driftMs: 0.4 });
  sounds.fadeOut('button-hover', 800);
  assert.doesNotThrow(() => runFirstFrameWithDrift(), 'fadeOut step() must not throw on a negative-drift first frame');
  for (const v of observedVolumes) {
    assert.ok(v >= 0 && v <= 1, `observed volume ${v} was outside [0,1]`);
  }
});

test('FULL RAMP: driving a fade-in to completion across many frames, including drifted ones, never sets volume outside [0,1]', async () => {
  const { sounds, observedVolumes, tick } = loadEngineWithControlledClock();
  await sounds.play('button-hover', { fadeMs: 300, volume: 1 });
  // Drive ~20 frames, including a couple of tiny/negative deltas
  // simulating jitter, through to well past completion.
  const deltas = [-0.3, 0.2, 16, 16, -0.1, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 50];
  for (const d of deltas) tick(d);
  assert.ok(observedVolumes.length > 0, 'expected at least one volume write during the ramp');
  for (const v of observedVolumes) {
    assert.ok(v >= 0 && v <= 1, `observed volume ${v} was outside [0,1]`);
  }
});

test('CALL-SITE INPUT: an out-of-range `volume` option passed to play() (negative or >1) never reaches the audio element unclamped', async () => {
  const { sounds, observedVolumes } = loadEngineWithControlledClock();
  await sounds.play('button-hover', { volume: -5 });
  await sounds.play('button-hover', { volume: 99 });
  await sounds.play('button-hover', { volume: NaN });
  for (const v of observedVolumes) {
    assert.ok(v >= 0 && v <= 1, `observed volume ${v} was outside [0,1]`);
  }
});

test('NO SECOND ENGINE / NO REDESIGN: the fix lives entirely inside the existing #clampVolume boundary + the two existing step() functions', () => {
  const src = require('node:fs').readFileSync(ENGINE_PATH, 'utf8');
  assert.match(src, /#clampVolume\(v\)/, 'expected a single shared clamp helper, not per-callsite ad hoc math');
  assert.match(src, /Math\.max\(0, Math\.min\(1, \(now - start\) \/ fadeMs\)\)/, 'fade-in t must be clamped at both bounds');
  assert.match(src, /Math\.max\(0, Math\.min\(1, \(now - start\) \/ Math\.max\(1, fadeMs\)\)\)/, 'fade-out t must be clamped at both bounds');
  const clampCallCount = (src.match(/this\.#clampVolume\(/g) || []).length;
  assert.ok(clampCallCount >= 3, `expected the shared clamp to be reused at every .volume write site (found ${clampCallCount})`);
});
