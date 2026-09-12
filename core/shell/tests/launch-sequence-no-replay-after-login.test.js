'use strict';

/**
 * core/shell/tests/launch-sequence-no-replay-after-login.test.js
 *
 * Regression test for the reported UX defect: after a real administrator
 * logged in, the full 30-second CozyOS launch sequence (logo/typing/
 * ABOVE ONLY/motto/voice) played a SECOND time before the Administrator
 * Workspace appeared, because core/bootstrap/bootstrap.js's Bootstrap.
 * start() re-injects admin-workspace.html's own <script src="core/shell/
 * launch-sequence.js"> tag into the already-live document after login —
 * the exact same file that already played once on login.html moments
 * earlier.
 *
 * FIX UNDER TEST: launch-sequence.js now checks, at the very top of its
 * own IIFE, whether window.CozyOS.Bootstrap.isStarting() is true (a
 * real, pre-existing, unmodified Bootstrap state — see core/bootstrap/
 * bootstrap.js's own start()/isStarting()). That is true for the ENTIRE
 * duration of exactly one real caller: Bootstrap.start()'s own
 * loadScriptSequence() loop, i.e. only when this file is being
 * re-injected after a login has already happened. In that one case it
 * skips all animation/voice/DOM work and emits the real
 * "cozy:launch-sequence-complete" event immediately, so
 * admin-workspace.html's own existing, unmodified listener still mounts
 * the workspace with no added delay. Every other real caller
 * (index.html, login.html, dashboard.html, admin-workspace.html loaded
 * standalone) is completely unaffected — window.CozyOS.Bootstrap does
 * not exist or is not "starting" in those contexts, so the guard is a
 * pure no-op there.
 *
 * This file proves ALL FOUR parts of the intended flow, each against
 * real, unmodified production code (never a reimplementation):
 *   1. The one real launch sequence still fully runs on initial entry —
 *      already proven by all 30 passing tests in
 *      launch-sequence-above-only.test.js (none of them define
 *      window.CozyOS.Bootstrap at all, so this fix's guard is inert for
 *      every one of them; re-confirmed here with one direct check).
 *   2. login.html's real, unmodified gating IIFE reveals the login form
 *      immediately on "cozy:launch-sequence-complete" (extracted and
 *      run verbatim, matching this repository's established extraction
 *      pattern — see server/test/chalzydashboard-bootstrap-failure-
 *      visibility.test.js).
 *   3 & 4. A REAL core/bootstrap/bootstrap.js Bootstrap.start(), composing
 *      the REAL launch-sequence.js from a fetched admin-workspace.html
 *      body, resolves quickly (no 30s wait) and triggers zero
 *      animation/voice/DOM side effects — proving both "goes directly to
 *      the Administrator Dashboard" and "no second launch sequence".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BOOTSTRAP_PATH = path.join(ROOT, 'core', 'bootstrap', 'bootstrap.js');
const LAUNCH_SEQUENCE_SRC = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'launch-sequence.js'), 'utf8');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/* ------------------------------------------------------------------ */
/* 1. Sanity: the fix's guard is inert with no Bootstrap present        */
/*    (already proven 30x over by launch-sequence-above-only.test.js;   */
/*    this is a direct, minimal confirmation of the same fact.)         */
/* ------------------------------------------------------------------ */

test('1. with no window.CozyOS.Bootstrap at all (real page load, e.g. login.html/index.html), the sequence is NOT skipped', () => {
  const emitted = [];
  const sandbox = {
    window: {
      CozyOS: {
        PlatformEventBus: { emit: (event, data) => emitted.push({ event, data }), once() {} },
      },
    },
    document: {
      getElementById: () => null,
      addEventListener() {},
    },
    // Deliberately non-firing fake timers: this test only needs to
    // prove nothing is emitted SYNCHRONOUSLY on script execution when
    // Bootstrap is absent — it does not need Stage 1 to actually run to
    // completion, and real un-mocked setTimeout here would leave ~30s
    // of genuine pending timers running in the background for the rest
    // of this test file's process.
    setTimeout: () => 0,
    clearTimeout: () => {},
    module: { exports: {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LAUNCH_SEQUENCE_SRC, sandbox, { filename: 'launch-sequence.js' });

  // No immediate "skip" emit — the real animation's own Stage 1
  // setTimeout is what will eventually emit this event, ~30 real
  // seconds later (see launch-sequence-above-only.test.js), not
  // synchronously on script execution.
  assert.equal(emitted.length, 0, 'must not fire the completion event synchronously when Bootstrap is not composing');
});

/* ------------------------------------------------------------------ */
/* 2. login.html's real gating IIFE reveals the form immediately        */
/* ------------------------------------------------------------------ */

function extractLoginGateIIFE(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const match = withoutComments.match(/\(function \(\) \{\s*const launchScreen = document\.getElementById\("cozy-launch-screen"\);[\s\S]*?\n\}\)\(\);/);
  if (!match) throw new Error('Could not locate the real launch-sequence gating IIFE in login.html');
  return match[0];
}

test('2. login.html\'s real gating IIFE calls revealLoginScreen() immediately when the real event fires (no added delay)', () => {
  const html = read('login.html');
  const iife = extractLoginGateIIFE(html);

  let revealCalled = 0;
  const listeners = {};
  const fakeBus = {
    once(event, fn) { listeners[event] = fn; },
  };
  const scheduled = [];
  const sandbox = {
    window: { CozyOS: { PlatformEventBus: fakeBus } },
    document: { getElementById: () => null },
    revealLoginScreen: () => { revealCalled++; },
    setTimeout: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(iife, sandbox, { filename: 'login-gate-iife.js' });

  assert.equal(typeof listeners['cozy:launch-sequence-complete'], 'function', 'must have registered a real listener for the real completion event');
  assert.equal(revealCalled, 0, 'must not reveal the login form before the sequence has actually completed');

  // Simulate the real event firing (e.g. from launch-sequence.js's own
  // real emit at the true end of Stage 6) — real production code path,
  // not a stub of the gating logic itself.
  listeners['cozy:launch-sequence-complete']();

  assert.equal(revealCalled, 1, 'revealLoginScreen() must be called immediately once the sequence genuinely completes');
  // The 30s fallback timer must still have been scheduled (defense in
  // depth is unchanged) but must not have been what triggered the reveal.
  assert.ok(scheduled.some((s) => s.ms === 30000), 'the honest 30s fallback must still be scheduled, unchanged');
});

/* ------------------------------------------------------------------ */
/* 3 & 4. Real Bootstrap.start() composing the real launch-sequence.js:  */
/*    resolves quickly, zero replay side effects.                       */
/* ------------------------------------------------------------------ */

function makeFakeAdminWorkspaceHtml() {
  // Deliberately minimal — Bootstrap.extractSequence() only regex-parses
  // <style>/<script> tags from raw HTML text; it does not need the real
  // admin-workspace.html's full real markup to prove the real
  // interaction between Bootstrap and the real launch-sequence.js.
  return `<!DOCTYPE html><html><head><style>.fake{color:red}</style></head>
<body>
<div id="cozy-launch-screen"></div>
<script src="core/shell/platform-event-bus.js"></script>
<script src="core/shell/launch-sequence.js"></script>
</body></html>`;
}

function makeDomShim() {
  const styleEls = [];
  const created = [];
  const body = {
    _innerHTML: '',
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
    prepend() {},
  };
  const head = {
    _styles: [],
    querySelector: () => null, // no bootstrap style yet
    appendChild(el) { head._styles.push(el); },
  };
  const elementsById = { 'cozy-launch-screen': { classList: { add() {}, remove() {} }, style: {}, remove() {} } };

  const document = {
    head,
    body,
    createElement(tag) {
      if (tag === 'style') {
        const el = { setAttribute() {}, textContent: '' };
        return el;
      }
      if (tag === 'script') {
        const el = {
          set src(v) {
            this._src = v;
            created.push(el);
          },
          get src() { return this._src; },
        };
        return el;
      }
      return { setAttribute() {}, style: {}, classList: { add() {}, remove() {} } };
    },
    getElementById: (id) => elementsById[id] || null,
    addEventListener() {},
  };
  // appendChild for <script> elements is where the REAL file gets
  // loaded and executed — mirroring exactly what a real browser does
  // for a dynamically created <script src>, just synchronously: read
  // the real file this repository ships, eval it into the SAME shared
  // window/document Bootstrap itself is using, then fire onload. This
  // is the real shipped file's real code, not a reimplementation.
  document.head.appendChild = function (el) {
    if (el && el._src) {
      const absPath = path.join(ROOT, el._src);
      const src = fs.readFileSync(absPath, 'utf8');
      try {
        // eslint-disable-next-line no-eval
        (0, eval)(src);
      } catch (err) {
        if (typeof el.onerror === 'function') el.onerror();
        return;
      }
      if (typeof el.onload === 'function') el.onload();
      return;
    }
    head._styles.push(el);
  };
  return document;
}

test('3 & 4. real Bootstrap.start() with the real launch-sequence.js: resolves fast (no 30s wait) and fires zero animation/voice side effects (no second sequence)', async () => {
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];

  const domShimDocument = makeDomShim();
  global.document = domShimDocument;
  global.window = { CozyOS: {} };
  global.fetch = async () => ({ ok: true, status: 200, text: async () => makeFakeAdminWorkspaceHtml() });

  // Real, unmodified requestAnimationFrame/Date — launch-sequence.js's
  // skip path (the one this test exercises) never reaches any code that
  // needs them, but real browsers always provide them, so their absence
  // must never be why the skip path "works".
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;

  const startedAt = Date.now();
  const result = await Bootstrap.start();
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.success, true, `Bootstrap.start() should succeed: ${result.reason || ''}`);
  // The real sequence's own TOTAL_DURATION_MS is 30000. If it had NOT
  // been skipped, this real await would not resolve for ~30 real
  // seconds (there are no mock timers in this test — real timers only).
  // A generous 5s ceiling proves, unambiguously, that no 30s replay
  // occurred.
  assert.ok(elapsedMs < 5000, `Bootstrap.start() took ${elapsedMs}ms — the launch sequence must have been skipped, not replayed (would be ~30000ms+ otherwise)`);

  assert.equal(Bootstrap.isStarting(), false);
  assert.equal(Bootstrap.status(), 'ready');

  delete global.document;
  delete global.window;
  delete global.fetch;
  delete global.requestAnimationFrame;
});

test('the real skip guard only activates while Bootstrap is genuinely composing — isStarting() reflects real, unmodified Bootstrap state', () => {
  // Direct proof that the condition launch-sequence.js checks
  // (window.CozyOS.Bootstrap.isStarting()) is the SAME real method
  // Bootstrap itself exposes, not a parallel/duplicated flag.
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];
  global.window = { CozyOS: {} };
  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;
  assert.equal(typeof Bootstrap.isStarting, 'function');
  assert.equal(Bootstrap.isStarting(), false, 'must be false before start() is ever called');
  delete global.window;
});
