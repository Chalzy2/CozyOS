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

const RENDER_YAML_PATH = path.resolve(__dirname, '../../render.yaml');
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

test('COZY_RP_ID and COZY_RP_ORIGIN are set to the confirmed production hostname, not a placeholder or a different guessed domain', () => {
  // The production hostname was confirmed as cozyos.org (see
  // docs/render-deployment.md). Unlike the earlier placeholder state,
  // these are now allowed to be hardcoded — but ONLY to this exact,
  // confirmed value. If someone changes the hostname here without also
  // updating it everywhere it matters (Render custom domain, Cloudflare
  // DNS/routing, this test), every previously-registered passkey breaks
  // silently. This test exists to make that kind of drift fail loudly.
  const rpIdBlock = raw.match(/- key: COZY_RP_ID\n(\s*(?:value|sync):[^\n]*\n?)+/);
  const rpOriginBlock = raw.match(/- key: COZY_RP_ORIGIN\n(\s*(?:value|sync):[^\n]*\n?)+/);
  assert.ok(rpIdBlock, 'COZY_RP_ID block not found');
  assert.ok(rpOriginBlock, 'COZY_RP_ORIGIN block not found');
  assert.match(rpIdBlock[0], /value:\s*cozyos\.org\s*$/m, 'COZY_RP_ID must be exactly cozyos.org');
  assert.match(rpOriginBlock[0], /value:\s*https:\/\/cozyos\.org\s*$/m, 'COZY_RP_ORIGIN must be exactly https://cozyos.org');
});

test('pins a specific Node version rather than floating on Render defaults', () => {
  assert.match(raw, /NODE_VERSION\s*\n\s*value:\s*22\.\d+\.\d+/);
});
