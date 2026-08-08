/**
 * core/modules/intelligence/language/tests/cozy-language-registry.test.js
 * RP-027 — real, executed tests for
 * core/modules/intelligence/language/cozy-language-registry.js
 *
 * Run with: node core/modules/intelligence/language/tests/cozy-language-registry.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function loadModule() {
  const modulePath = path.join(__dirname, '..', 'cozy-language-registry.js');
  delete require.cache[require.resolve(modulePath)];
  global.window = { CozyOS: {} };
  require(modulePath);
  return global.window.CozyOS.CozyLanguageRegistry;
}

const registry = loadModule();

test('exactly the 5 default languages are registered, all AVAILABLE', () => {
  const codes = registry.DEFAULT_LANGUAGES.map((l) => l.code).sort();
  assert.deepStrictEqual(codes, ['ar', 'en', 'fr', 'so', 'sw']);
  registry.DEFAULT_LANGUAGES.forEach((l) => assert.strictEqual(l.state, 'AVAILABLE', `${l.code} must be AVAILABLE`));
});

test('exactly the 6 extended languages are registered, all NOT_READY', () => {
  const codes = registry.EXTENDED_LANGUAGES.map((l) => l.code).sort();
  assert.deepStrictEqual(codes, ['ig', 'kam', 'ki', 'lg', 'luo', 'zu']);
  registry.EXTENDED_LANGUAGES.forEach((l) => assert.strictEqual(l.state, 'NOT_READY', `${l.code} must be NOT_READY (no verified templates yet)`));
});

test('isAvailable() is true for every default language, false for every extended language', () => {
  registry.DEFAULT_LANGUAGES.forEach((l) => assert.strictEqual(registry.isAvailable(l.code), true));
  registry.EXTENDED_LANGUAGES.forEach((l) => assert.strictEqual(registry.isAvailable(l.code), false));
});

test('extended languages are still selectable via getLanguage() (never removed from the registry)', () => {
  const luo = registry.getLanguage('luo');
  assert.ok(luo, 'luo must be a real, selectable registry entry');
  assert.strictEqual(luo.state, 'NOT_READY');
});

test('resolveLanguage(): manual selection takes precedence over requested and country', () => {
  const result = registry.resolveLanguage({ manual: 'fr', requested: 'sw', country: 'KE' });
  assert.strictEqual(result.code, 'fr');
  assert.strictEqual(result.fallback, false);
});

test('resolveLanguage(): requested takes precedence over country when no manual selection', () => {
  const result = registry.resolveLanguage({ requested: 'ar', country: 'KE' });
  assert.strictEqual(result.code, 'ar');
  assert.strictEqual(result.fallback, false);
});

test('resolveLanguage(): country suggestion used only when neither manual nor requested is given', () => {
  const result = registry.resolveLanguage({ country: 'KE' });
  assert.strictEqual(result.code, 'sw');
  assert.strictEqual(result.fallback, false);
});

test('resolveLanguage(): country never permanently locks language — a later manual call overrides it', () => {
  const first = registry.resolveLanguage({ country: 'FR' });
  assert.strictEqual(first.code, 'fr');
  const second = registry.resolveLanguage({ manual: 'ar', country: 'FR' });
  assert.strictEqual(second.code, 'ar', 'manual selection must override the country suggestion on the very next call');
});

test('resolveLanguage(): defaults to English when nothing is supplied', () => {
  const result = registry.resolveLanguage({});
  assert.strictEqual(result.code, 'en');
  assert.strictEqual(result.fallback, false);
});

test('resolveLanguage(): requesting a NOT_READY extended language honestly falls back, never silently', () => {
  const result = registry.resolveLanguage({ requested: 'kam' });
  assert.strictEqual(result.fallback, true, 'must report the fallback, not hide it');
  assert.strictEqual(result.preferred, 'kam', 'must remember what was actually asked for');
  assert.ok(registry.isAvailable(result.code), 'the language actually used must genuinely be AVAILABLE');
  assert.ok(/not yet AVAILABLE/i.test(result.reason));
});

test('resolveLanguage(): requesting an unrecognized code honestly falls back with a distinct reason', () => {
  const result = registry.resolveLanguage({ requested: 'xx' });
  assert.strictEqual(result.fallback, true);
  assert.ok(/not a recognized/i.test(result.reason));
});

test('suggestFromCountry(): returns null (never a guess) for a country not in the table', () => {
  assert.strictEqual(registry.suggestFromCountry('ZZ'), null);
});

test('suggestFromCountry(): is case-insensitive and matches real entries', () => {
  assert.strictEqual(registry.suggestFromCountry('ke'), 'sw');
  assert.strictEqual(registry.suggestFromCountry('SO'), 'so');
});

test('listLanguages(): includeExtended:false returns only the 5 default languages', () => {
  const list = registry.listLanguages({ includeExtended: false });
  assert.strictEqual(list.length, 5);
});

test('listLanguages(): default call includes all 11 languages', () => {
  const list = registry.listLanguages();
  assert.strictEqual(list.length, 11);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
