'use strict';

/**
 * core/ui/tests/cozy-background-video-rotation.test.js
 *
 * Rotating Live Login Backgrounds — targeted regression for the new
 * startVideoRotation()/stopVideoRotation()/isRotating() extension to
 * the REAL, unmodified CozyLivingBackground engine (core/ui/cozy-
 * background.js). Reuses core/ui/tests/visual-engines-provider-
 * manager-adoption.test.js's own fake-DOM stub approach (same file,
 * same reasoning: no jsdom in this environment, so a minimal, honest
 * DOM/canvas stub lets the engine's real constructor/init() logic run
 * exactly as written) rather than inventing a second stub style.
 *
 * Uses fake <video>/<canvas> elements with just enough real surface
 * (play()/pause(), a settable .src, .currentTime) for the real
 * rotation logic to exercise the real playVideoFromLibrary() ->
 * setVideoSource() path, so this proves the actual rotation mechanism
 * (timer + real category/video selection), not a re-implementation of
 * it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BACKGROUND_PATH = path.join(ROOT, 'core', 'ui', 'cozy-background.js');

function fakeVideoElement() {
  const el = {
    tagName: 'VIDEO',
    style: {},
    _src: '',
    currentTime: 0,
    paused: true,
    muted: false,
    loop: false,
    playsInline: false,
    get src() { return el._src; },
    set src(v) { el._src = v; el.currentTime = 0; },
    play() { el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; },
    removeAttribute(k) { if (k === 'src') el._src = ''; },
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

function fakeCanvasElement() {
  function infiniteNoOp() {
    const fn = function () { return infiniteNoOp(); };
    return new Proxy(fn, { get(_t, prop) { return (prop === 'width' || prop === 'height') ? 0 : infiniteNoOp(); }, set() { return true; } });
  }
  return {
    tagName: 'CANVAS', style: {}, width: 0, height: 0,
    getContext: () => infiniteNoOp(),
    addEventListener() {}, removeEventListener() {},
  };
}

function fakeGenericElement(tag) {
  const children = [];
  return {
    tagName: tag, style: {}, dataset: {},
    appendChild(c) { children.push(c); return c; },
    prepend(c) { children.unshift(c); return c; },
    insertBefore(c) { children.unshift(c); return c; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
  };
}

/** Loads a fresh, real CozyLivingBackground instance with a fake DOM. */
function loadBackground() {
  delete require.cache[require.resolve(BACKGROUND_PATH)];
  const fakeVideo = fakeVideoElement();
  const fakeCanvas = fakeCanvasElement();
  const win = {
    CozyOS: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    innerWidth: 1024, innerHeight: 768,
    addEventListener() {}, removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: (prop) => (typeof prop === 'string' && prop.startsWith('--cozy-') ? '#000000' : '') }),
  };
  const body = fakeGenericElement('body');
  const documentElement = fakeGenericElement('html');
  win.document = {
    documentElement, body,
    readyState: 'complete',
    createElement: (tag) => {
      if (tag === 'video') return fakeVideo;
      if (tag === 'canvas') return fakeCanvas;
      return fakeGenericElement(tag);
    },
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
    location: { pathname: '/' },
  };
  global.window = win;
  global.document = win.document;
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  global.getComputedStyle = win.getComputedStyle;
  global.matchMedia = win.matchMedia;
  global.MutationObserver = class { observe() {} disconnect() {} };
  require(BACKGROUND_PATH);
  return { win, fakeVideo };
}

test('SMALLEST EXTENSION: startVideoRotation/stopVideoRotation/isRotating exist on the real, single Background engine — no second engine', () => {
  const { win } = loadBackground();
  const bg = win.CozyOS.Background;
  assert.equal(typeof bg.startVideoRotation, 'function');
  assert.equal(typeof bg.stopVideoRotation, 'function');
  assert.equal(typeof bg.isRotating, 'function');
  assert.equal(typeof bg.playVideoFromLibrary, 'function', 'the pre-existing method must remain, reused rather than replaced');
});

test('REAL SCENES ONLY: rotation only includes categories with at least one real registered video, never fabricates one', () => {
  const { win } = loadBackground();
  const bg = win.CozyOS.Background;
  bg.registerVideo('Forest', { id: 'v1', url: 'assets/video/forest.mp4' });
  // "Savannah" is a real, valid VIDEO_CATEGORIES entry but has no video
  // registered — must be silently skipped, not fabricated.
  const result = bg.startVideoRotation(['Forest', 'Savannah'], { intervalMs: 50 });
  bg.stopVideoRotation();
  assert.deepEqual(result.rotation, ['Forest']);
});

test('IMMEDIATE FIRST SCENE: the first registered scene plays immediately, with no idle wait for the first interval tick', () => {
  const { win, fakeVideo } = loadBackground();
  const bg = win.CozyOS.Background;
  bg.registerVideo('Forest', { id: 'v1', url: 'assets/video/forest.mp4' });
  bg.startVideoRotation(['Forest'], { intervalMs: 100000 });
  bg.stopVideoRotation();
  assert.match(fakeVideo.src, /forest\.mp4$/);
});

test('ROTATION ADVANCES: with multiple real registered categories, the video source actually changes across ticks (real scene 1 -> 2 -> 3)', async () => {
  const { win, fakeVideo } = loadBackground();
  const bg = win.CozyOS.Background;
  bg.registerVideo('Forest', { id: 'v1', url: 'assets/video/forest.mp4' });
  bg.registerVideo('Waterfalls', { id: 'v2', url: 'assets/video/waterfall.mp4' });
  bg.registerVideo('Ocean', { id: 'v3', url: 'assets/video/underwater.mp4' });

  const seen = [];
  const started = bg.startVideoRotation(['Forest', 'Waterfalls', 'Ocean'], { intervalMs: 20 });
  assert.equal(started.success, true);
  assert.equal(started.willRotate, true);
  seen.push(fakeVideo.src);
  await new Promise((r) => setTimeout(r, 60));
  seen.push(fakeVideo.src);
  await new Promise((r) => setTimeout(r, 40));
  seen.push(fakeVideo.src);
  bg.stopVideoRotation();

  const distinctSeen = new Set(seen.map((s) => s.split('/').pop()));
  assert.ok(distinctSeen.size >= 2, `expected the video source to actually change across ticks, saw: ${[...seen]}`);
});

test('LOOP/MUTED/PLAYSINLINE PRESERVED: rotation never toggles these off on the shared videoEl', () => {
  const { win, fakeVideo } = loadBackground();
  fakeVideo.muted = true; fakeVideo.loop = true; fakeVideo.playsInline = true;
  const bg = win.CozyOS.Background;
  bg.registerVideo('Forest', { id: 'v1', url: 'assets/video/forest.mp4' });
  bg.registerVideo('Clouds', { id: 'v2', url: 'assets/video/clouds.mp4' });
  bg.startVideoRotation(['Forest', 'Clouds'], { intervalMs: 20 });
  bg.stopVideoRotation();
  assert.equal(fakeVideo.muted, true);
  assert.equal(fakeVideo.loop, true);
  assert.equal(fakeVideo.playsInline, true);
});

test('IDEMPOTENT: calling startVideoRotation() a second time never stacks a second interval', () => {
  const { win } = loadBackground();
  const bg = win.CozyOS.Background;
  bg.registerVideo('Forest', { id: 'v1', url: 'assets/video/forest.mp4' });
  bg.registerVideo('Clouds', { id: 'v2', url: 'assets/video/clouds.mp4' });
  bg.startVideoRotation(['Forest', 'Clouds'], { intervalMs: 20 });
  assert.equal(bg.isRotating(), true);
  bg.startVideoRotation(['Forest', 'Clouds'], { intervalMs: 20 });
  assert.equal(bg.isRotating(), true);
  bg.stopVideoRotation();
  assert.equal(bg.isRotating(), false);
  // Calling stop again must be a safe no-op, not an error.
  assert.doesNotThrow(() => bg.stopVideoRotation());
});

test('NO ROTATION WITHOUT REAL VIDEOS: an empty/all-missing category list is reported honestly, not silently treated as rotating', () => {
  const { win } = loadBackground();
  const bg = win.CozyOS.Background;
  const result = bg.startVideoRotation(['Savannah', 'Rain'], { intervalMs: 20 });
  assert.equal(result.success, false);
  assert.equal(bg.isRotating(), false);
});
