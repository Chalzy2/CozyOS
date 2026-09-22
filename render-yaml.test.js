'use strict';
/**
 * test/deployment/render-yaml.test.js
 *
 * Regression tests for render.yaml (the Render Blueprint for
 * server/static-boundary-server.js). Deliberately does NOT depend on a
 * YAML parser library (none is installed in this repo, and adding one
 * just for this check isn't worth the new dependency) — instead asserts
 * on the file's raw text. That's a real limitation: this cannot catch
 * every possible YAML syntax error, only the specific structural/content
 * requirements below and a basic tab-indentation sanity check. Treat a
 * pass here as "the file still says what we intended," not "Render has
 * validated it" — only an actual deploy proves that.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// UPDATE: this file's own header still says "test/deployment/
// render-yaml.test.js" (its path when '../../render.yaml' was written,
// two levels below the repo root); it now lives at the repo root
// itself, where '../../render.yaml' resolves outside the repo entirely
// (confirmed: ENOENT on /home/render.yaml). __dirname IS the repo root now.
const RENDER_YAML_PATH = path.resolve(__dirname, 'render.yaml');
const raw = fs.readFileSync(RENDER_YAML_PATH, 'utf8');

test('render.yaml exists and is non-empty', () => {
  assert.ok(raw.trim().length > 0);
});

test('render.yaml has no tab characters (YAML forbids tabs for indentation)', () => {
  assert.ok(!raw.includes('\t'), 'render.yaml contains a tab character');
});

test('starts the real static-boundary-server.js, not a duplicate entrypoint', () => {
  assert.match(raw, /startCommand:\s*node server\/static-boundary-server\.js/);
});

test('declares a persistent disk mounted before COZY_WEBAUTHN_DB is used', () => {
  assert.match(raw, /disk:/);
  assert.match(raw, /mountPath:\s*\/var\/data/);
  const dbLine = raw.match(/COZY_WEBAUTHN_DB\s*\n\s*value:\s*(\S+)/);
  assert.ok(dbLine, 'COZY_WEBAUTHN_DB env var not found');
  assert.ok(
    dbLine[1].startsWith('/var/data/'),
    `COZY_WEBAUTHN_DB (${dbLine[1]}) must live under the mounted disk path /var/data, or data is lost on every deploy`
  );
});

test('health check hits a route that is 200 while logged out, not /webauthn/session', () => {
  const healthCheck = raw.match(/healthCheckPath:\s*(\S+)/);
  assert.ok(healthCheck, 'healthCheckPath not set');
  assert.notStrictEqual(
    healthCheck[1],
    '/webauthn/session',
    '/webauthn/session correctly returns 401 when logged out — using it as the health check would make Render treat a healthy, logged-out server as down'
  );
});

test('enables Secure cookies in production', () => {
  assert.match(raw, /COZY_WEBAUTHN_COOKIE_SECURE\s*\n\s*value:\s*"1"/);
});

test('COZY_RP_ID and COZY_RP_ORIGIN are pinned to the confirmed production domain, never a different/guessed one', () => {
  // UPDATE: this test ORIGINALLY required sync:false (no baked-in
  // value), deferring to "the still-open same-origin routing decision"
  // — that decision is no longer open. docs/render-deployment.md now
  // documents, as a completed, verified step: "Sets COZY_RP_ID=cozyos.org
  // and COZY_RP_ORIGIN=https://cozyos.org — the production hostname was
  // confirmed reachable and serving the real CozyOS site... See
  // render-yaml.test.js for the guard that fails loudly if this drifts
  // from that exact value" — i.e. that doc already expects THIS test to
  // guard the real, chosen value, not require its absence. Updated
  // accordingly: still fails loudly (real security guard, RP ID is
  // WebAuthn-origin-binding-critical) on any OTHER value or a reversion
  // to no value at all — it only stops treating the one confirmed,
  // documented domain as if it were an accidental guess.
  const expected = { COZY_RP_ID: 'cozyos.org', COZY_RP_ORIGIN: 'https://cozyos.org' };
  for (const [key, value] of Object.entries(expected)) {
    const block = raw.match(new RegExp(`- key: ${key}\\n(\\s*(?:value|sync):[^\\n]*\\n?)+`));
    assert.ok(block, `${key} block not found`);
    assert.match(block[0], new RegExp(`value:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `${key} must be pinned to the confirmed, documented production value "${value}" (see docs/render-deployment.md), not drifted to something else`);
  }
});

test('pins a specific Node version rather than floating on Render defaults', () => {
  assert.match(raw, /NODE_VERSION\s*\n\s*value:\s*22\.\d+\.\d+/);
});
