'use strict';

/**
 * core/shell/tests/launch-sequence-slogan-split-color.test.js
 *
 * Regression test for the confirmed MOTTO TRACE defect: fallBounceText()
 * (core/ui/live-animation-engine.js) assigns the cozy-title-cozy/
 * cozy-title-os classes to #cozy-launch-slogan's per-letter spans (see
 * launch-sequence.js's fallBounceSplitColorText(slogan, ...) call), but
 * core/shell/launch-sequence.css only ever gave those two classes color
 * when scoped under #cozy-launch-title. Every slogan letter therefore
 * inherited the single flat green from "#cozy-launch-screen p", and the
 * motto never actually turned gold.
 *
 * FIX UNDER TEST: launch-sequence.css now also declares
 *   #cozy-launch-slogan .cozy-title-cozy { color: #2E7D32; }
 *   #cozy-launch-slogan .cozy-title-os { color: #F9A825; }
 * reusing the exact same two color tokens already used for the title —
 * no new color introduced, no JS/engine change, title styling untouched.
 *
 * This is a plain string/regex check against the real, unmodified CSS
 * file (matching this repo's existing precedent for CSS-only assertions
 * where a full browser isn't required to prove a selector/rule exists) -
 * kept intentionally small since the underlying defect was a one-line
 * scoping gap, not a rendering logic issue.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CSS_SRC = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'launch-sequence.css'), 'utf8');

const GREEN = '#2E7D32';
const GOLD = '#F9A825';

function ruleColor(selector, css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{[^}]*color:\\s*(#[0-9A-Fa-f]{3,6})');
  const match = css.match(re);
  return match ? match[1] : null;
}

test('1. #cozy-launch-title keeps its original green/gold rules (title styling preserved)', () => {
  assert.equal(ruleColor('#cozy-launch-title .cozy-title-cozy', CSS_SRC), GREEN);
  assert.equal(ruleColor('#cozy-launch-title .cozy-title-os', CSS_SRC), GOLD);
});

test('2. #cozy-launch-slogan now has its own matching green/gold rules (the fix)', () => {
  assert.equal(
    ruleColor('#cozy-launch-slogan .cozy-title-cozy', CSS_SRC),
    GREEN,
    '#cozy-launch-slogan .cozy-title-cozy must exist and use the existing Cozy green token'
  );
  assert.equal(
    ruleColor('#cozy-launch-slogan .cozy-title-os', CSS_SRC),
    GOLD,
    '#cozy-launch-slogan .cozy-title-os must exist and use the existing CozyOS gold token'
  );
});

test('3. the slogan fix reuses the exact same tokens as the title (no invented color)', () => {
  assert.equal(
    ruleColor('#cozy-launch-slogan .cozy-title-cozy', CSS_SRC),
    ruleColor('#cozy-launch-title .cozy-title-cozy', CSS_SRC)
  );
  assert.equal(
    ruleColor('#cozy-launch-slogan .cozy-title-os', CSS_SRC),
    ruleColor('#cozy-launch-title .cozy-title-os', CSS_SRC)
  );
});

test('4. the per-letter fall/bounce and settle mechanics are untouched by this CSS-only fix', () => {
  assert.match(CSS_SRC, /@keyframes cozyMottoSettle/);
  assert.match(CSS_SRC, /#cozy-launch-slogan\.cozy-motto-settle\s*\{\s*animation:\s*cozyMottoSettle/);
});

test('5. the fallback (engine-unavailable) split-color path in JS still uses the SAME class names, so this CSS fix covers it too', () => {
  const jsSrc = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'launch-sequence.js'), 'utf8');
  assert.match(jsSrc, /class="cozy-title-cozy"/);
  assert.match(jsSrc, /class="cozy-title-os"/);
});
