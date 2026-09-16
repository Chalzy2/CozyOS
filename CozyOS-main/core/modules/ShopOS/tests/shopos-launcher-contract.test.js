'use strict';

/**
 * core/modules/ShopOS/tests/shopos-launcher-contract.test.js
 *
 * Level 1 dependency-first discovery — two real ShopOS defects found via
 * real-browser Playwright testing of the User Dashboard's application
 * launch path (User Dashboard -> ApplicationLauncher -> WindowManager ->
 * ShopOS), fixed here at their real source rather than by changing the
 * User Dashboard or ApplicationLauncher to compensate.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SHOPOS_PATH = path.join(__dirname, '..', 'shopos.js');
const SOURCE = fs.readFileSync(SHOPOS_PATH, 'utf8');

function loadShopOS(cozyOverrides = {}) {
  delete require.cache[require.resolve(SHOPOS_PATH)];
  global.window = { CozyOS: { ...cozyOverrides } };
  global.document = { querySelector: () => null, createElement: () => ({ setAttribute() {}, addEventListener() {} }), head: { appendChild() {} } };
  require(SHOPOS_PATH);
  return global.window;
}

test('CONTRACT FIX: getDashboard() returns a real HTML string, never an object (the real ApplicationLauncher Mode 3 contract)', () => {
  const win = loadShopOS();
  const html = win.CozyOS.Modules.shopos.getDashboard();
  assert.equal(typeof html, 'string');
  assert.notEqual(html, '[object Object]');
});

test('CONTRACT FIX: getDashboard() includes the real #sp-tabs/#sp-no-branch-section/#sp-tab-content ids that init()\'s real #render() queries by id', () => {
  const win = loadShopOS();
  const html = win.CozyOS.Modules.shopos.getDashboard();
  assert.match(html, /id="sp-tabs"/);
  assert.match(html, /id="sp-no-branch-section"/);
  assert.match(html, /id="sp-tab-content"/);
  assert.match(html, /id="sp-quick-setup-btn"/); // init() wires this real button
});

test('CONTRACT FIX: the real structured-data shape is preserved, just renamed — nothing deleted', () => {
  const win = loadShopOS();
  const data = win.CozyOS.Modules.shopos.getDashboardData('nonexistent-branch');
  assert.equal(data.available, false);
  assert.equal(typeof data.reason, 'string');
});

test('PATH FIX: the real coordinator loader points at core/plugins/, not the nonexistent plugins/ root (confirmed by real-browser 404s before this fix)', () => {
  assert.match(SOURCE, /script\.src = `\.\.\/\.\.\/core\/plugins\/\$\{file\}`/);
  assert.doesNotMatch(SOURCE, /script\.src = `\.\.\/\.\.\/plugins\/\$\{file\}`/);
});
