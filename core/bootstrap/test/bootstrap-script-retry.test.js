
'use strict';
/**
 * core/bootstrap/test/bootstrap-script-retry.test.js
 *
 * Real tests for the retry fix in core/bootstrap/bootstrap.js:
 * loadExternalScript()/loadScriptSequence(). Added for the reported
 * live failure ("Administrator workspace failed load: Real script load
 * failed: core/security/cozy-auth.js"), confirmed by direct testing to
 * be a transient failure (the file, its path/case, and the real server
 * serving it are all correct) — most consistent with a Render
 * cold-start hiccup or a real mobile-network blip on that one request,
 * out of the 270+ scripts admin-workspace.html loads strictly
 * sequentially with no retry. This test drives the REAL, unmodified
 * Bootstrap class (loaded fresh via require.cache eviction, matching
 * this repository's established client-module test pattern), with a
 * real DOM shim whose <script> elements can be told to fail their
 * first N load attempts before succeeding — proving the actual,
 * shipped retry logic, not a reimplementation of it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BOOTSTRAP_PATH = path.join(__dirname, '..', 'bootstrap.js');

function makeScriptElementFactory(failFirstNTimesBySrc) {
  const attemptCounts = {};
  return function createElement(tag) {
    if (tag !== 'script') return { tagName: tag, setAttribute() {}, style: {} };
    const el = {
      tagName: 'script',
      set src(value) {
        this._src = value;
        attemptCounts[value] = (attemptCounts[value] || 0) + 1;
      },
      get src() { return this._src; },
    };
    // appendChild triggers the (a)synchronous load outcome.
    el._triggerLoad = () => {
      const failuresRemaining = (failFirstNTimesBySrc[el._src] || 0) - (attemptCounts[el._src] - 1);
      if (failuresRemaining > 0) {
        if (typeof el.onerror === 'function') el.onerror();
      } else {
        if (typeof el.onload === 'function') el.onload();
      }
    };
    return el;
  };
}

test.afterEach(() => {
  delete global.document;
  delete global.window;
  delete global.setTimeout.__realOne;
});

test('loadExternalScript: a script that fails once then succeeds on retry does NOT throw — the whole sequence is not fatal to one transient failure', async () => {
  const failFirstNTimesBySrc = { 'core/security/cozy-auth.js': 1 };
  const createElement = makeScriptElementFactory(failFirstNTimesBySrc);
  const appended = [];
  global.document = {
    createElement,
    head: { appendChild: (el) => { appended.push(el); setImmediate(() => el._triggerLoad()); } },
  };
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];
  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;

  await Bootstrap.loadExternalScript({ type: 'external', src: 'core/security/cozy-auth.js' });

  assert.equal(appended.length, 2, 'exactly 2 real load attempts must have been made: the first (failed) and the retry (succeeded)');
});

test('loadExternalScript: a script that fails every attempt still eventually throws the real, honest error after exhausting retries — failures are surfaced, never silently swallowed', async () => {
  const failFirstNTimesBySrc = { 'core/security/permanently-broken.js': 99 };
  const createElement = makeScriptElementFactory(failFirstNTimesBySrc);
  const appended = [];
  global.document = {
    createElement,
    head: { appendChild: (el) => { appended.push(el); setImmediate(() => el._triggerLoad()); } },
  };
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];
  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;

  await assert.rejects(
    () => Bootstrap.loadExternalScript({ type: 'external', src: 'core/security/permanently-broken.js' }),
    /Real script load failed: core\/security\/permanently-broken\.js/,
    'a genuinely, persistently broken script must still fail loudly after retries are exhausted, with the real, honest error message'
  );
  assert.equal(appended.length, 3, 'exactly 3 real attempts must have been made before giving up — retries are bounded, not infinite');
});

test('loadExternalScript: a script that succeeds on the first real attempt makes exactly one attempt — no unnecessary retry overhead for the ordinary, successful case', async () => {
  const createElement = makeScriptElementFactory({});
  const appended = [];
  global.document = {
    createElement,
    head: { appendChild: (el) => { appended.push(el); setImmediate(() => el._triggerLoad()); } },
  };
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];
  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;

  await Bootstrap.loadExternalScript({ type: 'external', src: 'core/security/cozy-auth.js' });

  assert.equal(appended.length, 1, 'the ordinary, successful case must make exactly one real attempt');
});

test('loadScriptSequence: a transient failure on one script in a real multi-script sequence does not abort the entire sequence', async () => {
  const failFirstNTimesBySrc = { 'core/security/cozy-auth.js': 1 };
  const createElement = makeScriptElementFactory(failFirstNTimesBySrc);
  const appended = [];
  global.document = {
    createElement,
    head: { appendChild: (el) => { appended.push(el); setImmediate(() => el._triggerLoad()); } },
  };
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(BOOTSTRAP_PATH)];
  require(BOOTSTRAP_PATH);
  const Bootstrap = global.window.CozyOS.Bootstrap;

  const sequence = [
    { type: 'external', src: 'core/security/webauthn-provider.js' },
    { type: 'external', src: 'core/security/cozy-auth.js' },
    { type: 'external', src: 'core/shell/taskbar.js' },
  ];

  await Bootstrap.loadScriptSequence(sequence);

  const srcs = appended.map((el) => el._src);
  assert.deepEqual(srcs, [
    'core/security/webauthn-provider.js',
    'core/security/cozy-auth.js',
    'core/security/cozy-auth.js',
    'core/shell/taskbar.js',
  ], 'the sequence must continue past the retried script to the next one, in the real, correct order');
});
    
