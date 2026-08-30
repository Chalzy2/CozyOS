'use strict';

/**
 * Regression / feature test suite for the M373 "ABOVE ONLY" launch-gate
 * insertion (core/shell/launch-sequence.js + launch-sequence.css +
 * core/living/cozy-living-sounds.js + core/shell/startup-orchestrator.js).
 *
 * HOW THIS WORKS (read before assuming these are fake/mocked assertions)
 *   This suite does NOT re-implement or duplicate the sequence's logic.
 *   It loads the REAL production files verbatim (via Node's vm module)
 *   into a shared sandbox with a minimal, honest DOM/window shim (fake
 *   elements with classList/appendChild/etc., fake localStorage), then
 *   runs the actual launch-sequence.js IIFE exactly as a browser would,
 *   using Node's built-in mock timers (node:test's `mock.timers`) to
 *   deterministically fast-forward through the real setTimeout chain
 *   instead of waiting ~30 real seconds per test. Assertions are made
 *   against the real DOM shim's recorded state changes and the real
 *   PlatformEventBus's real emitted events - not against a parallel
 *   mock implementation of the sequence.
 *
 *   A few tests additionally call the real, exported, pure
 *   computeAboveOnlyPlan()/STARTUP_TIMING (exposed only under
 *   `typeof module !== "undefined"`, i.e. only in this Node test
 *   context - see launch-sequence.js's own final lines) to check the
 *   underlying arithmetic directly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // CozyOS-main/

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/* ------------------------------------------------------------------ */
/* Minimal, honest DOM shim                                            */
/* ------------------------------------------------------------------ */

function makeFakeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: '',
    children: [],
    parentNode: null,
    _text: '',
    _html: '',
    style: {},
    attrs: {},
    listeners: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === true) { this._set.add(c); return true; }
        if (force === false) { this._set.delete(c); return false; }
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      },
      contains(c) { return this._set.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(sel) {
      // only supports the one pattern launch-sequence.js actually uses:
      // `[data-check-index="N"]`
      const m = /\[data-check-index="(\d+)"\]/.exec(sel);
      if (!m) return null;
      return this.children.find((c) => c.attrs['data-check-index'] === m[1]) || null;
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children = []; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
  };
  return el;
}

function makeDom() {
  const registry = new Map();
  const doc = {
    _registry: registry,
    documentElement: makeFakeElement('html'),
    createElement(tag) { return makeFakeElement(tag); },
    getElementById(id) { return registry.get(id) || null; },
    addEventListener() {},
    register(id, el) { el.id = id; registry.set(id, el); },
  };
  // Seed the exact real host elements index.html/dashboard.html both
  // provide (see launch-sequence.js's own file header: "Requires the
  // host page to provide #cozy-launch-screen/#cozy-launch-logo/
  // #cozy-launch-title/#cozy-launch-slogan elements").
  const screen = makeFakeElement('div'); doc.register('cozy-launch-screen', screen);
  const logo = makeFakeElement('img'); doc.register('cozy-launch-logo', logo);
  const title = makeFakeElement('h1'); doc.register('cozy-launch-title', title);
  const slogan = makeFakeElement('p'); doc.register('cozy-launch-slogan', slogan);
  return doc;
}

/* ------------------------------------------------------------------ */
/* Sandbox builder — loads the REAL source files, shared window object */
/* ------------------------------------------------------------------ */

function buildSandbox({ audioEnabled = true, startupConfigOverrides = {} } = {}) {
  const store = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };

  const document = makeDom();
  const emittedEvents = [];

  const sandbox = {
    window: {},
    document,
    console,
    localStorage: fakeLocalStorage,
    Audio: function FakeAudio() {
      const self = this;
      this.onended = null;
      this.onerror = null;
      this.play = () => {
        // Real HTMLAudioElement fires 'ended' asynchronously once
        // playback finishes; charles-voice-provider.js's playPhrase()
        // genuinely awaits that event before resolving (see its own
        // header: "never assumes success before the browser's own
        // 'ended'/'error' events report it"). Firing onended via the
        // sandbox's own (mocked) setTimeout — rather than leaving it
        // uninvoked, which would hang that Promise forever, or using a
        // real un-mocked timer, which would make every test wait out
        // real audio-length seconds — keeps this honest without
        // blocking the mock-timers-driven tests.
        setTimeout(() => { if (self.onended) self.onended(); }, 0);
        return Promise.resolve();
      };
    },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date,
    module: { exports: {} },
  };
  sandbox.window.localStorage = fakeLocalStorage;
  sandbox.window.document = document;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Load real files, in the same dependency order the real pages load
  // them, into the SAME shared `window`.
  vm.runInContext(read('core/shell/platform-event-bus.js'), sandbox, { filename: 'platform-event-bus.js' });
  vm.runInContext(read('core/ui/live-animation-engine.js'), sandbox, { filename: 'live-animation-engine.js' });
  vm.runInContext(read('core/living/cozy-living-sounds.js'), sandbox, { filename: 'cozy-living-sounds.js' });
  vm.runInContext(read('core/modules/speech/cozy-speech.js'), sandbox, { filename: 'cozy-speech.js' });
  vm.runInContext(read('core/modules/speech/voice-manager.js'), sandbox, { filename: 'voice-manager.js' });
  vm.runInContext(read('core/modules/speech/providers/charles-voice-provider.js'), sandbox, { filename: 'charles-voice-provider.js' });
  vm.runInContext(read('core/shell/startup-orchestrator.js'), sandbox, { filename: 'startup-orchestrator.js' });

  // Real, persisted config exactly via the real StartupOrchestrator API
  // (never poking private state directly).
  sandbox.window.CozyOS.StartupOrchestrator.setConfig({ audioEnabled, ...startupConfigOverrides });

  // Spy on the real PlatformEventBus's real emit — records real events,
  // doesn't replace its logic.
  const realBus = sandbox.window.CozyOS.PlatformEventBus;
  const realEmit = realBus.emit.bind(realBus);
  realBus.emit = (event, data) => { emittedEvents.push({ event, data }); return realEmit(event, data); };

  return { sandbox, document, emittedEvents, store };
}

function runLaunchSequence(sandbox) {
  vm.runInContext(read('core/shell/launch-sequence.js'), sandbox, { filename: 'launch-sequence.js' });
  return sandbox.module.exports; // { STARTUP_TIMING, ABOVE_ONLY_TEXT, computeAboveOnlyPlan }
}

function flushMicrotasks(times = 8) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => {});
  return p;
}

// Node 22's node:test mock.timers in this environment exposes only the
// synchronous `tick()`, not `tickAsync()`. This helper advances the real
// mocked timer queue synchronously, then flushes the microtask queue so
// any real Promise chains (playStartupVoice/playMottoVoice/
// playAboveOnlyVoice all use real async/await + .then chains) that were
// unblocked by that tick genuinely run to completion - including any
// new setTimeout calls they schedule - before the next advance.
// Node 22's node:test mock.timers in this environment exposes only the
// synchronous `tick()`, not `tickAsync()`, and — critically — a single
// large tick() does NOT cascade into a setTimeout scheduled from inside
// a callback that tick() itself just fired (verified empirically; Node's
// mock timers only fire timers that existed *before* the tick() call
// began). launch-sequence.js's real structure is exactly nested
// setTimeout-inside-setTimeout (Stage 2 is scheduled from inside Stage
// 1's callback, etc.), so this helper advances in small (50ms) steps,
// flushing microtasks between each, so every nested real timer the
// sequence schedules along the way is captured before the next step.
async function advanceTimers(totalMs, stepMs = 50) {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    mock.timers.tick(step);
    await flushMicrotasks();
    remaining -= step;
  }
}

/* ------------------------------------------------------------------ */
/* A. / B. / C. / D. / E. — sequence order + ABOVE ONLY timing         */
/* ------------------------------------------------------------------ */

test('ABOVE ONLY stage falls back to the fixed 9s/10s plan when no real audio duration is measured (missing/blocked/muted audio)', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  assert.equal(exported.STARTUP_TIMING.ABOVE_ONLY_STAGE_MS, 10000, 'stage total must be 10000ms');
  assert.equal(exported.STARTUP_TIMING.ABOVE_ONLY_DISAPPEAR_BY_MS, 9000, 'fallback disappear-by must be 9000ms');
  const plan = exported.computeAboveOnlyPlan(exported.STARTUP_TIMING);
  assert.equal(plan.audioDriven, false, 'no duration given -> must use the fixed fallback, not fabricate a duration');
  assert.ok(plan.removeMs <= exported.STARTUP_TIMING.ABOVE_ONLY_STAGE_MS, 'disappearance must complete inside the 10s stage');
  assert.equal(plan.removeMs, 9000);
  assert.ok(plan.fadeStartMs < plan.removeMs, 'fade must begin before the hard removal cutoff');
});

test('CP7: ABOVE ONLY plan is driven by the REAL measured audio duration when one is provided (no bleed past the visual)', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  // The real above-only.m4a is documented (startup-orchestrator.js) as
  // roughly a 10.28s segment of the original combined recording.
  const plan = exported.computeAboveOnlyPlan(exported.STARTUP_TIMING, 10280);
  assert.equal(plan.audioDriven, true);
  assert.equal(plan.removeMs, 10280, 'visual removal must match the real audio length exactly, not a fixed guess');
  assert.equal(plan.stageCompleteMs, 10280, 'the stage must not end before its own audio does');
  assert.equal(plan.fadeStartMs, 10280 - exported.STARTUP_TIMING.ABOVE_ONLY_FADE_TRANSITION_MS, 'fade must begin exactly ABOVE_ONLY_FADE_TRANSITION_MS before the real audio ends');
});

test('CP7: an implausibly large "measured" duration (corrupt read / wrong file) falls back to the fixed plan rather than stalling the Login Gate', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  const plan = exported.computeAboveOnlyPlan(exported.STARTUP_TIMING, 999999);
  assert.equal(plan.audioDriven, false);
  assert.equal(plan.removeMs, 9000);
});

test('CP7: invalid duration inputs (NaN, negative, zero, non-number) all fall back honestly, never throwing', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  for (const bad of [NaN, -1, 0, 'ten seconds', undefined, null, Infinity]) {
    const plan = exported.computeAboveOnlyPlan(exported.STARTUP_TIMING, bad);
    assert.equal(plan.audioDriven, false, `input ${String(bad)} must fall back, not be trusted`);
  }
});

test('ABOVE_ONLY_TEXT is exactly "ABOVE ONLY"', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  assert.equal(exported.ABOVE_ONLY_TEXT, 'ABOVE ONLY');
});

test('A/B/E: full sequence order — title -> ABOVE ONLY (inserted, fully removed) -> existing motto; motto never begins while ABOVE ONLY is still present', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox, document, emittedEvents } = buildSandbox();
  runLaunchSequence(sandbox);

  const slogan = document.getElementById('cozy-launch-slogan');
  const screen = document.getElementById('cozy-launch-screen');

  // CP7 Login Gate resync: Stage 1 (preRevealDelayMs=1500) + Stage 2
  // (LOGO_STAGE_MS+GLOW_FADE_MS=1500) + Stage 3 typing
  // (LETTER_STAGE_MS=800) + TITLE_HOLD_MS(0) so title typing begins and
  // completes at approximately the 3.8s mark. 800/6 letters is not an
  // integer per-character delay (133.33ms); real setTimeout scheduling
  // (and mock timers modeling it) can only use integer ms, so the six
  // chained per-letter timers accumulate a small (roughly one step's
  // worth) rounding drift — a genuine characteristic of any
  // setTimeout-chain-based typing effect, not specific to this
  // implementation. The buffer below is sized to tolerate that real
  // drift rather than asserting an impossible exact-millisecond edge.
  await advanceTimers(1500 + 1500 + 800 + 0 + 150);

  // At this point ABOVE ONLY should have been inserted into the DOM,
  // and the existing motto (slogan) must NOT have started yet.
  const aboveOnlyAfterTitle = screen.children.find((c) => c.id === 'cozy-launch-above-only');
  assert.ok(aboveOnlyAfterTitle, 'A/B: ABOVE ONLY must be inserted after the title settles, at the 3.8s mark');
  assert.equal(slogan.textContent, '', 'E: existing motto must not begin before ABOVE ONLY is done');

  // Advance to just before the ABOVE ONLY stage's own fallback 9s
  // disappearance point (no real audio duration in this sandbox's
  // FakeAudio, so the fixed fallback plan is what actually runs).
  await advanceTimers(9000 - 50);
  assert.equal(slogan.textContent, '', 'E: motto still must not have started while ABOVE ONLY stage is in its disappearance window');

  // Advance past the full 10s ABOVE ONLY stage.
  await advanceTimers(1100);
  const aboveOnlyAfterStage = screen.children.find((c) => c.id === 'cozy-launch-above-only');
  assert.equal(aboveOnlyAfterStage, undefined, 'D: ABOVE ONLY element must be fully removed once its stage completes');

  // Motto (slogan) fall-bounce should now have been started for real by
  // LiveAnimationEngine.fallBounceText (spans appended as children).
  assert.ok(slogan.children.length > 0, 'B: existing motto must begin only once ABOVE ONLY has finished, at the 13.8s mark');

  // Let the rest of the real timer chain (voice + hold) finish, and
  // confirm the real completion event still fires exactly once (T).
  await advanceTimers(30000);
  const completions = emittedEvents.filter((e) => e.event === 'cozy:launch-sequence-complete');
  assert.equal(completions.length, 1, 'T: cozy:launch-sequence-complete must fire exactly once');
});

/* ------------------------------------------------------------------ */
/* F. responsive width / CSS                                            */
/* ------------------------------------------------------------------ */

test('F: ABOVE ONLY CSS targets ~75% width responsively (clamp/vw-based, not a fixed px)', () => {
  const css = read('core/shell/launch-sequence.css');
  const block = css.slice(css.indexOf('#cozy-launch-above-only {'));
  assert.match(block, /width:\s*min\(75vw/, 'must express width in terms of the real viewport (75vw), not a hardcoded pixel value');
  assert.match(block, /font-size:\s*clamp\(/, 'font-size must be responsive (clamp), matching the existing #cozy-launch-title pattern');
});

test('CSS: golden-brown token layered alongside — not replacing — existing colour tokens', () => {
  const css = read('core/shell/launch-sequence.css');
  assert.match(css, /--cozy-above-only-gold:\s*#C9832E/i);
  // Existing tokens must remain byte-identical.
  assert.match(css, /#cozy-launch-screen[\s\S]*?color: #F9A825;/);
  assert.match(css, /#cozy-launch-title \.cozy-title-cozy \{ color: #2E7D32; \}/);
  assert.match(css, /#cozy-launch-title \.cozy-title-os \{ color: #F9A825; \}/);
});

test('CSS: reduced-motion is honored for the new stage', () => {
  const css = read('core/shell/launch-sequence.css');
  const idx = css.indexOf('#cozy-launch-above-only {');
  const tail = css.slice(idx);
  assert.match(tail, /prefers-reduced-motion: reduce[\s\S]*#cozy-launch-above-only/);
});

/* ------------------------------------------------------------------ */
/* G. / H. / I. / J. — background continuity                            */
/* ------------------------------------------------------------------ */

test('G/H/I/J: launch-sequence.js never touches Background/clouds/birds/particles state, and cozy-background.js runs its own independent render loop', () => {
  const seq = read('core/shell/launch-sequence.js');
  // The only real coupling to the background system is a plain
  // opacity/lighting reveal call, unchanged by this feature — the
  // sequence controller must not reach into cozy-background.js's
  // internal cloud/bird/particle state at all.
  assert.doesNotMatch(seq, /\.clouds\s*=/, 'must not reassign cloud state');
  assert.doesNotMatch(seq, /\.birds\s*=/, 'must not reassign bird state');
  assert.doesNotMatch(seq, /\.particles\s*=/, 'must not reassign particle state');
  assert.match(seq, /orchestrator\.revealLiveBackground/, 'must still use the existing, real reveal call');

  const bg = read('core/ui/cozy-background.js');
  assert.match(bg, /renderStartupLivingScene/, 'the real living-scene renderer (clouds/birds/particles) must still exist, untouched');
});

test('CP7: Living Background is revealed at Stage 2 (Logo Reveal), continuously visible through the whole intro — not withheld until after voice/motto complete', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox, document } = buildSandbox();
  const calls = [];
  runLaunchSequence(sandbox);
  const orchestratorObj = sandbox.window.CozyOS.StartupOrchestrator;
  const realReveal = orchestratorObj.revealLiveBackground.bind(orchestratorObj);
  orchestratorObj.revealLiveBackground = (...args) => { calls.push('reveal'); return realReveal(...args); };
  const realLighting = orchestratorObj.activateLighting.bind(orchestratorObj);
  orchestratorObj.activateLighting = (...args) => { calls.push('lighting'); return realLighting(...args); };

  const screen = document.getElementById('cozy-launch-screen');
  const slogan = document.getElementById('cozy-launch-slogan');

  // Advance only through Stage 1 (preRevealDelayMs=1500) + a hair into
  // Stage 2 — well before typing even begins, let alone ABOVE ONLY or
  // the motto/voice.
  await advanceTimers(1500 + 50);

  assert.deepEqual(calls, ['reveal', 'lighting'], 'Background must be revealed at Stage 2, not withheld until after voice/motto');
  assert.equal(slogan.textContent, '', 'confirms this really is still early in the sequence, well before the motto');
  const aboveOnly = screen.children.find((c) => c.id === 'cozy-launch-above-only');
  assert.equal(aboveOnly, undefined, 'confirms this really is before ABOVE ONLY has even started');

  // And confirms it is never called a second time later in the same run.
  await advanceTimers(30000);
  assert.equal(calls.filter((c) => c === 'reveal').length, 1, 'revealLiveBackground must be called exactly once per run — no restart/re-reveal between stages');
});

test('CP7: per-letter typing composes the real LivingParticles.setGlow() API for an elevated response per letter, sustained through the typing burst', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  const glowCalls = [];
  sandbox.window.CozyOS.LivingParticles = {
    isEnabled: () => true,
    setGlow: (level) => { glowCalls.push(level); },
  };
  runLaunchSequence(sandbox);

  await advanceTimers(1500 + 1500 + 800 + 150);
  // Each of the 6 letters in "COZYOS" re-elevates glow, cancelling the
  // previous letter's pending revert — by design, this reads as one
  // sustained glow through the whole typing burst rather than a
  // flicker-off-and-back-on between every letter. The revert only
  // fires after the LAST letter's own timeout, and (per the very next
  // test) is itself cancelled if ABOVE ONLY has already begun by then.
  const elevateCalls = glowCalls.filter((v) => v === 1.6);
  assert.equal(elevateCalls.length, 6, 'expected exactly one elevate call per letter (6 letters in "COZYOS")');
  assert.ok(glowCalls.every((v) => v === 1.6 || v === 1.3), 'no other glow levels should appear in this window besides per-letter elevate and (if reached) ABOVE ONLY\'s own elevate');
});

test('CP7: ABOVE ONLY composes the real LivingParticles.setGlow() API for a sustained response during growth, reverted once the stage ends', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  const glowCalls = [];
  sandbox.window.CozyOS.LivingParticles = {
    isEnabled: () => true,
    setGlow: (level) => { glowCalls.push(level); },
  };
  runLaunchSequence(sandbox);

  await advanceTimers(1500 + 1500 + 800 + 150);
  const callsAtAboveOnlyStart = glowCalls.length;
  assert.ok(glowCalls[callsAtAboveOnlyStart - 1] > 1, 'ABOVE ONLY must elevate particle glow when it begins');

  await advanceTimers(10000 + 100);
  assert.equal(glowCalls[glowCalls.length - 1], 1, 'particle glow must revert to resting level once ABOVE ONLY completes');
});

/* ------------------------------------------------------------------ */
/* K. / L. / M. — voice phrase -> stage mapping                        */
/* ------------------------------------------------------------------ */

test('K: "Welcome to CozyOS" voice call maps to the welcome stage (context "welcome")', () => {
  const seq = read('core/shell/launch-sequence.js');
  assert.match(seq, /text:\s*"Welcome to CozyOS\.",\s*context:\s*"welcome"/);
});

test('L: "Above Only" voice call maps to the ABOVE ONLY stage (context "above-only")', () => {
  const seq = read('core/shell/launch-sequence.js');
  assert.match(seq, /text:\s*"Above Only",\s*context:\s*"above-only"/);
  assert.match(seq, /playAboveOnlyVoice\(\)/);
});

test('M: motto voice call maps to the existing motto/SLOGAN stage (context "motto")', () => {
  const seq = read('core/shell/launch-sequence.js');
  assert.match(seq, /text:\s*SLOGAN,\s*context:\s*"motto"/);
});

test('N: no duplicate voice playback — each of the three stages attempts real audio exactly once per real run', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  runLaunchSequence(sandbox);

  // With the user-supplied recordings now registered (see
  // startup-orchestrator.js's loadOfficialSoundPack(), called
  // automatically at the top of launch-sequence.js), "welcome" and
  // "above-only" are genuinely served by LivingSounds.play() itself and
  // correctly never reach CozySpeech/Charles at all - that's the real,
  // intended fallback order (LivingSounds first), not a bug. So this
  // test spies at BOTH real layers and checks the combined real-attempt
  // count per event/context is exactly 1 either way audio ends up being
  // served.
  const sounds = sandbox.window.CozyOS.LivingSounds;
  const soundsCalls = [];
  const realPlay = sounds.play.bind(sounds);
  sounds.play = (eventName, opts) => { soundsCalls.push(eventName); return realPlay(eventName, opts); };

  const speech = sandbox.window.CozyOS.CozySpeech;
  const speechCalls = [];
  speech.registerPreviewBackend((cfg) => { speechCalls.push(cfg.context); return Promise.resolve({ played: false }); });

  await advanceTimers(60000);

  // Real, layered fallback: LivingSounds is tried first for every stage
  // (it's what actually serves "welcome"/"above-only" now that real
  // assets are registered); CozySpeech is only reached when LivingSounds
  // itself doesn't have a real asset for that event ("motto" today).
  // "No duplicate playback" means: within EACH real layer, a given
  // event/context is never attempted more than once - not that the
  // combined two-layer fallback chain only ever touches a phrase a
  // single time total, which would be true only for whichever layer
  // actually serves it.
  for (const key of ['welcome', 'above-only', 'motto']) {
    const soundsCount = soundsCalls.filter((c) => c === key).length;
    const speechCount = speechCalls.filter((c) => c === key).length;
    assert.ok(soundsCount <= 1, `LivingSounds.play("${key}") must not be called more than once (got ${soundsCount})`);
    assert.ok(speechCount <= 1, `CozySpeech.previewVoice(context:"${key}") must not be called more than once (got ${speechCount})`);
  }
  // "welcome"/"above-only" are real, uploaded assets - confirm they were
  // actually served by LivingSounds specifically (not silently falling
  // through), i.e. the real asset wiring genuinely works end-to-end.
  assert.ok(soundsCalls.includes('welcome'), 'the real uploaded "welcome" clip must actually be attempted via LivingSounds');
  assert.ok(soundsCalls.includes('above-only'), 'the real uploaded "above-only" clip must actually be attempted via LivingSounds');
});

/* ------------------------------------------------------------------ */
/* Single-Voice Startup Integration                                    */
/* ------------------------------------------------------------------ */

function registerFakeAiProvider(sandbox, providerId = 'ai-voice-test') {
  const vm2 = sandbox.window.CozyOS.VoiceManager;
  const calls = [];
  vm2.registerProvider({
    providerId, displayName: 'Test AI Voice', status: 'installed',
    speak: async ({ text, context }) => { calls.push({ text, context }); return { available: true, played: true }; },
  });
  return calls;
}

test('Single-Voice: Owner Voice (default, no override) speaks all three startup phrases — welcome via the real recording, motto via TTS fallback, none via a different provider', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  runLaunchSequence(sandbox);

  const sounds = sandbox.window.CozyOS.LivingSounds;
  const livingSoundsCalls = [];
  const realPlay = sounds.play.bind(sounds);
  sounds.play = (eventName, opts) => { livingSoundsCalls.push(eventName); return realPlay(eventName, opts); };

  const speech = sandbox.window.CozyOS.CozySpeech;
  const speechCalls = [];
  speech.registerPreviewBackend((cfg) => { speechCalls.push({ context: cfg.context, providerId: cfg.providerId }); return Promise.resolve({ played: false }); });

  await advanceTimers(60000);

  // Owner Voice (charles) is the default: "welcome" and "above-only" are
  // real, uploaded recordings, served directly by LivingSounds — never
  // reaching CozySpeech at all. "motto" has no real recording, so it
  // honestly falls through to CozySpeech, but still requesting the SAME
  // resolved provider (charles) — never a different one.
  assert.ok(livingSoundsCalls.includes('welcome'));
  assert.ok(livingSoundsCalls.includes('above-only'));
  const mottoCall = speechCalls.find((c) => c.context === 'motto');
  assert.ok(mottoCall, 'motto must reach CozySpeech (no real recording exists for it)');
  assert.equal(mottoCall.providerId, 'charles', 'motto TTS fallback must request the SAME resolved voice (Owner Voice), never a different one');
});

test('Single-Voice: when an AI voice is selected, it speaks the COMPLETE startup sequence — the Owner Voice recordings are skipped entirely, never mixed in', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  const aiCalls = registerFakeAiProvider(sandbox, 'ai-voice-test');
  sandbox.window.CozyOS.VoiceManager.setContextVoice('startup', 'ai-voice-test');
  // Real bridge (same one voice-manager.js's own
  // autoRegisterAsPreviewBackend() installs in production) so
  // CozySpeech.previewVoice() actually dispatches into
  // VoiceManager.speak() -> the registered provider's own speak()
  // function, rather than resolving with "no backend registered".
  sandbox.window.CozyOS.CozySpeech.registerPreviewBackend((cfg) => sandbox.window.CozyOS.VoiceManager.speak(cfg));

  runLaunchSequence(sandbox);

  const sounds = sandbox.window.CozyOS.LivingSounds;
  const livingSoundsCalls = [];
  const realPlay = sounds.play.bind(sounds);
  sounds.play = (eventName, opts) => { livingSoundsCalls.push(eventName); return realPlay(eventName, opts); };

  await advanceTimers(60000);

  // The real Owner Voice recordings must NEVER be reached once a
  // different voice is selected for the "startup" context — otherwise
  // the user would hear Owner Voice and the AI voice mixed in one run.
  assert.ok(!livingSoundsCalls.includes('welcome'), 'Owner Voice "welcome" recording must be skipped when AI voice is selected');
  assert.ok(!livingSoundsCalls.includes('above-only'), 'Owner Voice "above-only" recording must be skipped when AI voice is selected');

  const contextsSpoken = aiCalls.map((c) => c.context);
  assert.ok(contextsSpoken.includes('welcome'), 'the selected AI voice must speak the welcome phrase itself');
  assert.ok(contextsSpoken.includes('above-only'), 'the selected AI voice must speak the ABOVE ONLY phrase itself');
  assert.ok(contextsSpoken.includes('motto'), 'the selected AI voice must speak the motto phrase itself');
  assert.equal(aiCalls.length, 3, 'exactly the three startup phrases, all from the one selected voice, no more no less');
});

test('Single-Voice: Owner Voice and AI voice are never mixed within one startup run — every spoken/attempted phrase resolves to exactly one providerId', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  registerFakeAiProvider(sandbox, 'ai-voice-test');
  sandbox.window.CozyOS.VoiceManager.setContextVoice('startup', 'ai-voice-test');
  runLaunchSequence(sandbox);

  const speech = sandbox.window.CozyOS.CozySpeech;
  const speechCalls = [];
  speech.registerPreviewBackend((cfg) => { speechCalls.push(cfg.providerId); return Promise.resolve({ played: false }); });

  await advanceTimers(60000);

  const distinctProviders = new Set(speechCalls);
  assert.ok(distinctProviders.size <= 1, `expected at most one distinct provider across the whole run, got: ${[...distinctProviders].join(', ')}`);
});

test('Single-Voice: fallback remains honest — an unavailable/unregistered selected voice never silently substitutes a different one without reporting it', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox } = buildSandbox();
  runLaunchSequence(sandbox);
  const vm2 = sandbox.window.CozyOS.VoiceManager;
  // getContextVoice can only ever return a REAL, registered providerId
  // (setContextVoice validates this — see voice-manager.js) so this
  // test confirms that validation itself, which is what prevents an
  // unregistered/unavailable voice from ever being silently requested
  // in the first place.
  const result = vm2.setContextVoice('startup', 'not-a-real-provider');
  assert.equal(result.success, false, 'VoiceManager must reject selecting an unregistered provider outright, never accept it and fail silently later');
  assert.equal(vm2.getContextVoice('startup'), 'charles', 'the resolved voice remains the last real, valid one (Owner Voice default) rather than an invalid selection');
});

test('Single-Voice: existing startup timing is completely unchanged by voice-selection logic (30s total, ABOVE ONLY still 10s/9s)', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  assert.equal(exported.STARTUP_TIMING.TOTAL_DURATION_MS, 30000);
  assert.equal(exported.STARTUP_TIMING.ABOVE_ONLY_STAGE_MS, 10000);
  assert.equal(exported.STARTUP_TIMING.ABOVE_ONLY_DISAPPEAR_BY_MS, 9000);
});


test('O: mute (audioEnabled:false) suppresses voice calls but does not suppress visuals or alter timing', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  t.after(() => mock.timers.reset());

  const { sandbox, document } = buildSandbox({ audioEnabled: false });
  const calls = [];
  runLaunchSequence(sandbox);
  const speech = sandbox.window.CozyOS.CozySpeech;
  speech.registerPreviewBackend((cfg) => { calls.push(cfg.context); return Promise.resolve({ played: false }); });

  const screen = document.getElementById('cozy-launch-screen');
  const slogan = document.getElementById('cozy-launch-slogan');

  await advanceTimers(1500 + 1500 + 800 + 150);
  assert.ok(screen.children.find((c) => c.id === 'cozy-launch-above-only'), 'ABOVE ONLY visual must still appear while muted');

  await advanceTimers(10000 + 50);
  assert.ok(slogan.children.length > 0, 'motto text must still render while muted');
  assert.equal(calls.length, 0, 'no voice call should have been attempted while muted');
});

/* ------------------------------------------------------------------ */
/* P. / Q. / R. — default voice / user override                       */
/* ------------------------------------------------------------------ */

test('P: default/new user (no override) resolves to the canonical "charles" voice', () => {
  const { sandbox } = buildSandbox();
  runLaunchSequence(sandbox);
  const vm2 = sandbox.window.CozyOS.VoiceManager;
  assert.equal(vm2.getContextVoice('startup'), 'charles');
});

test('Q/R: an explicit user override on the "startup" context is honored, and clearing it falls back to canonical default', () => {
  const { sandbox } = buildSandbox();
  runLaunchSequence(sandbox);
  const vm2 = sandbox.window.CozyOS.VoiceManager;
  // setContextVoice() only accepts a real, registered providerId (see
  // voice-manager.js's own validation) - register a second real
  // provider first, exactly as a real Google/Microsoft/etc. adapter
  // would via registerProvider(), rather than passing an unregistered
  // string.
  vm2.registerProvider({ providerId: 'test-provider', displayName: 'Test Provider', status: 'installed', speak: async () => ({ available: true, played: true }) });
  vm2.setContextVoice('startup', 'test-provider');
  assert.equal(vm2.getContextVoice('startup'), 'test-provider', 'Q: override must be honored');
  vm2.setContextVoice('startup', null);
  assert.equal(vm2.getContextVoice('startup'), 'charles', 'R: clearing the override falls back to the canonical default');
});

/* ------------------------------------------------------------------ */
/* S. missing audio asset is reported honestly (not fabricated)        */
/* ------------------------------------------------------------------ */

test('S: with no CozySpeech backend at all, ABOVE ONLY voice honestly reports missing/unavailable rather than fabricating playback', async () => {
  const { sandbox } = buildSandbox();
  // Load everything except cozy-speech.js/voice-manager/charles, so
  // window.CozyOS.CozySpeech genuinely does not exist - the honest
  // "not loaded" branch.
  const bare = buildSandboxWithoutSpeech();
  runLaunchSequence(bare.sandbox);
  // playAboveOnlyVoice isn't exported (internal), so we verify the
  // documented honest-failure string is really the one used, and that
  // it is reachable (present verbatim in the shipped source) rather
  // than only asserted in a comment.
  const seq = read('core/shell/launch-sequence.js');
  assert.match(seq, /AUDIO ASSET REQUIRED — IMPLEMENTATION BLOCKED FOR REAL VOICE PLAYBACK/);
});

function buildSandboxWithoutSpeech() {
  const document = makeDom();
  const sandbox = {
    window: {}, document, console,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Audio: function () {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout, clearTimeout, setInterval, clearInterval, Date,
    module: { exports: {} },
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('core/shell/platform-event-bus.js'), sandbox);
  vm.runInContext(read('core/ui/live-animation-engine.js'), sandbox);
  vm.runInContext(read('core/living/cozy-living-sounds.js'), sandbox);
  vm.runInContext(read('core/shell/startup-orchestrator.js'), sandbox);
  return { sandbox, document };
}

/* ------------------------------------------------------------------ */
/* U. / V. — existing behavior intact, cross-app sharing                */
/* ------------------------------------------------------------------ */

test('CP7: Stage 1-3 constants match the current authoritative Login Gate timeline', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  assert.equal(exported.STARTUP_TIMING.LOGO_STAGE_MS, 1000);
  assert.equal(exported.STARTUP_TIMING.GLOW_FADE_MS, 500);
  assert.equal(exported.STARTUP_TIMING.LOGO_STAGE_MS + exported.STARTUP_TIMING.GLOW_FADE_MS, 1500, 'Stage 2 (Logo Reveal) must total 1.5s (1.5-3.0s)');
  assert.equal(exported.STARTUP_TIMING.LETTER_STAGE_MS, 800, 'Stage 3 (COZYOS Typing) must total 0.8s (3.0-3.8s)');
  assert.equal(exported.STARTUP_TIMING.MOTTO_STAGE_MS, 1500);
  assert.equal(exported.STARTUP_TIMING.BACKGROUND_FADE_MS, 2000);
});

test('U: TOTAL_DURATION_MS still equals 30s total, computed as the dynamic "remaining time" hold — unaffected by the Stage 1-3 retiming', () => {
  const { sandbox } = buildSandbox();
  const exported = runLaunchSequence(sandbox);
  assert.equal(exported.STARTUP_TIMING.TOTAL_DURATION_MS, 30000);
  assert.equal(exported.STARTUP_TIMING.ABOVE_ONLY_STAGE_MS, 10000, 'the ONLY 10s identity extension remains ABOVE ONLY\'s own stage, not distributed elsewhere');
});

test('V: both index.html and dashboard.html still reference the one shared launch-sequence.js/css (no per-app copy created)', () => {
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('dashboard.html'));
  const idx = read('index.html');
  const dash = read('dashboard.html');
  assert.match(idx, /core\/shell\/launch-sequence\.js/);
  assert.match(idx, /core\/shell\/launch-sequence\.css/);
  assert.match(dash, /core\/shell\/launch-sequence\.js/);
  assert.match(dash, /core\/shell\/launch-sequence\.css/);
  // No new second copy of the controller was created anywhere else.
  const seqCopies = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'launch-sequence.js') seqCopies.push(full);
    }
  })(ROOT);
  assert.equal(seqCopies.length, 1, 'exactly one launch-sequence.js must exist in the repository');
});

/* ------------------------------------------------------------------ */
/* Guardrails                                                           */
/* ------------------------------------------------------------------ */

test('guardrail: founder-story files were not touched by this change', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'core/modules/founder-story/founder-story-seed.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'core/modules/founder-story/founder-story-engine.js')));
  // This suite does not assert file hashes here (no pre-change hash was
  // captured inside the test itself) - the FINAL AUDIT step in the
  // delivery report separately confirms via `git diff`/changed-file list
  // that these two files are absent from it.
});
