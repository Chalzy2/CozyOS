'use strict';

/**
 * core/shell/tests/admin-workspace-launch-sequence-script-order.test.js
 *
 * SEQUENCE PATH INTEGRITY PASS — confirmed script-load-order defect.
 *
 * ROOT CAUSE CONFIRMED: admin-workspace.html used to load
 * <script src="core/shell/launch-sequence.js"> BEFORE
 * core/ui/live-animation-engine.js, core/shell/startup-orchestrator.js,
 * and core/living/cozy-living-sounds.js — the only one of the four real
 * entry points (index.html/login.html/dashboard.html/admin-workspace.html)
 * ordered this way. launch-sequence.js's own top-level IIFE captures
 *   const orchestrator = window.CozyOS && window.CozyOS.StartupOrchestrator;
 * synchronously, once, at script-execution time (not inside a later
 * callback) — so on this page that const was permanently undefined,
 * silently skipping applyStartupScene()/revealLiveBackground()/
 * activateLighting()/playStartupAmbience()/playStartupSound() and
 * falling back to launch-sequence.js's own hardcoded default cfg instead
 * of any real StartupOrchestrator.getConfig() override, for this page
 * only. Confirmed via real Chromium setTimeout/script-order tracing
 * during the Sequence Path Integrity Pass.
 *
 * FIX UNDER TEST: launch-sequence.js's <script> tag was moved below its
 * three real dependencies in admin-workspace.html, matching the other
 * three entry points exactly. This test reads the real, unmodified HTML
 * source and asserts the tag order directly, so a future edit can't
 * silently reintroduce the wrong order.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const DEPENDENCIES = [
  'core/ui/live-animation-engine.js',
  'core/shell/startup-orchestrator.js',
  'core/living/cozy-living-sounds.js',
];
const LAUNCH_SEQUENCE_SRC_ATTR = 'core/shell/launch-sequence.js';

function scriptTagIndex(html, src) {
  const re = new RegExp('<script[^>]*\\bsrc="' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\?[^"]*)?"');
  const match = html.match(re);
  return match ? html.indexOf(match[0]) : -1;
}

function checkEntryPoint(fileName) {
  const html = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
  const launchIdx = scriptTagIndex(html, LAUNCH_SEQUENCE_SRC_ATTR);
  assert.ok(launchIdx >= 0, `${fileName} must load launch-sequence.js`);
  for (const dep of DEPENDENCIES) {
    const depIdx = scriptTagIndex(html, dep);
    assert.ok(depIdx >= 0, `${fileName} must load ${dep}`);
    assert.ok(
      depIdx < launchIdx,
      `${fileName}: ${dep} (index ${depIdx}) must load BEFORE launch-sequence.js (index ${launchIdx}) — ` +
      `launch-sequence.js reads window.CozyOS.StartupOrchestrator synchronously at its own top level.`
    );
  }
}

test('1. admin-workspace.html loads live-animation-engine.js/startup-orchestrator.js/cozy-living-sounds.js before launch-sequence.js (the fix)', () => {
  checkEntryPoint('admin-workspace.html');
});

test('2. index.html keeps the correct order (regression guard, was already correct)', () => {
  checkEntryPoint('index.html');
});

test('3. login.html keeps the correct order (regression guard, was already correct)', () => {
  checkEntryPoint('login.html');
});

test('4. dashboard.html keeps the correct order (regression guard, was already correct)', () => {
  checkEntryPoint('dashboard.html');
});

test('5. launch-sequence.js itself still reads the orchestrator synchronously at top level (confirms the fix is a load-order fix, not masking a since-changed root cause)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'launch-sequence.js'), 'utf8');
  assert.match(src, /const orchestrator = window\.CozyOS && window\.CozyOS\.StartupOrchestrator;/);
});
