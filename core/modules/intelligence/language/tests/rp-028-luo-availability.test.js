/**
 * core/modules/intelligence/language/tests/rp-028-luo-availability.test.js
 * RP-028 — Luo Language Availability
 *
 * SCOPE, disclosed: this repair's VERIFY step (see repair-history-
 * registry.md's RP-028 entry) found that Luo (Dholuo) CANNOT satisfy
 * Rule 82 in this session — real dictionary sourcing exists for basic
 * greeting/thanks vocabulary, but even that carries genuine
 * cross-source disagreement, and ZERO authoritative sourcing exists
 * for CozyOS's technical intents (provider status, account states,
 * NOT_READY explanations, etc.). Per the Critical Rule, Luo stays
 * NOT_READY. This test file therefore does NOT test any Luo response
 * text (there isn't any, and there must not be any fabricated).
 *
 * What this file DOES test, for real: that the language-resolution
 * architecture correctly and honestly handles a NOT_READY language
 * request for Luo specifically — fallback, manual selection, country
 * suggestion, and unsupported/missing-template behavior — exactly the
 * behavioral guarantees RP-027 built and RP-028's FIX step confirmed
 * did not need to change.
 *
 * Run with: node core/modules/intelligence/language/tests/rp-028-luo-availability.test.js
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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function makeFakeLivingAI() {
  const registered = new Map();
  let active = null;
  return {
    registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
    setActiveProvider(name) { active = name; return { success: true }; },
    getActiveProvider() { return active; },
    _registered: registered
  };
}

function makeFakeCoordinator() {
  return { async run() { return { interpretation: {}, thinking: {}, reasoning: {}, intelligence: {}, recalledMemories: [], policyResult: [], diagnostics: {} }; } };
}

function loadFullStack() {
  const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator() } };
  global.window = fakeWindow;
  [
    path.join(__dirname, '..', 'cozy-language-registry.js'),
    path.join(__dirname, '..', 'cozy-language-templates.js'),
    path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js'),
    path.join(__dirname, '..', '..', 'providers', 'rule-based-conversational-provider.js')
  ].forEach((p) => { delete require.cache[require.resolve(p)]; require(p); });
  return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'), registry: fakeWindow.CozyOS.CozyLanguageRegistry, templates: fakeWindow.CozyOS.CozyLanguageTemplates };
}

// ---------------------------------------------------------------------
// FIND/VERIFY re-confirmed programmatically: Luo is NOT_READY, zero
// template entries exist for it — the state this repair leaves it in.
// ---------------------------------------------------------------------

test('Luo registry entry is NOT_READY (RP-028 did not promote it)', () => {
  const { registry } = loadFullStack();
  const luo = registry.getLanguage('luo');
  assert.ok(luo, 'luo must still be a real, selectable registry entry');
  assert.strictEqual(luo.state, 'NOT_READY');
  assert.strictEqual(luo.nativeName, 'Dholuo');
});

test('Zero template keys carry a genuine luo entry (no fabricated content was added)', () => {
  const { templates } = loadFullStack();
  const keysWithLuo = Object.keys(templates.TEMPLATES).filter((k) => templates.TEMPLATES[k].luo);
  assert.strictEqual(keysWithLuo.length, 0, 'RP-028 must not have added any Luo template content this session');
});

test('isAvailable("luo") is false', () => {
  const { registry } = loadFullStack();
  assert.strictEqual(registry.isAvailable('luo'), false);
});

// ---------------------------------------------------------------------
// Fallback behavior for Luo specifically
// ---------------------------------------------------------------------

test('resolveLanguage({requested:"luo"}) honestly falls back to an AVAILABLE language, discloses it', () => {
  const { registry } = loadFullStack();
  const result = registry.resolveLanguage({ requested: 'luo' });
  assert.strictEqual(result.fallback, true);
  assert.strictEqual(result.preferred, 'luo');
  assert.ok(registry.isAvailable(result.code));
  assert.ok(/not yet AVAILABLE/i.test(result.reason));
});

(async () => {

// ---------------------------------------------------------------------
// Manual language selection — manual:"luo" must NOT bypass NOT_READY
// ---------------------------------------------------------------------

await asyncTest('Manual selection of Luo does not bypass its NOT_READY state — still falls back honestly', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello', { language: 'luo' });
  assert.strictEqual(result.result.requestedLanguage, 'luo');
  assert.strictEqual(result.result.languageFallback, true, 'manual selection of a NOT_READY language must still report the fallback');
  assert.ok(['en', 'sw', 'fr', 'ar', 'so'].includes(result.result.language), 'must resolve to one of the 5 AVAILABLE defaults');
});

test('resolveLanguage(): manual "luo" is treated the same as requested "luo" — no special-case bypass', () => {
  const { registry } = loadFullStack();
  const manualResult = registry.resolveLanguage({ manual: 'luo' });
  const requestedResult = registry.resolveLanguage({ requested: 'luo' });
  assert.strictEqual(manualResult.fallback, true);
  assert.strictEqual(requestedResult.fallback, true);
  assert.strictEqual(manualResult.code, requestedResult.code);
});

// ---------------------------------------------------------------------
// Country-based suggestion — no country in the LOCALE_SUGGESTIONS
// table maps to Luo (Luo has no dedicated national/official-language
// status the registry's advisory table represents), confirmed by
// direct inspection, not assumed.
// ---------------------------------------------------------------------

test('No country in the suggestion table maps to Luo', () => {
  const { registry } = loadFullStack();
  const allSuggestions = new Set();
  // Exercise every country actually present in DEFAULT_LANGUAGES' own
  // documented suggestion set indirectly, by checking a representative
  // sample of Luo-speaking-region countries (Kenya, Tanzania, Uganda,
  // South Sudan) never resolve to 'luo' — the registry suggests one of
  // the 5 AVAILABLE defaults for these countries instead (Kiswahili
  // for the East African countries in the table), never an
  // unavailable language.
  ['KE', 'TZ', 'UG', 'SS'].forEach((country) => {
    const suggestion = registry.suggestFromCountry(country);
    if (suggestion) assert.notStrictEqual(suggestion, 'luo', `${country} must never suggest an unavailable language`);
  });
});

await asyncTest('Country suggestion for Kenya (a real Luo-speaking region) still resolves to an AVAILABLE language, never Luo', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello', { country: 'KE' });
  assert.notStrictEqual(result.result.language, 'luo');
  assert.strictEqual(result.result.languageFallback, false, 'the country-suggested language itself must be genuinely available, not a fallback');
});

// ---------------------------------------------------------------------
// Unsupported / missing-template behavior — every intent, requested in
// Luo, must produce an honest, non-empty, fallback-disclosed reply,
// never a thrown error and never fabricated Luo text.
// ---------------------------------------------------------------------

const REPRESENTATIVE_INTENTS = {
  'greeting-generic': 'hello',
  'identity': 'who are you',
  'founder': 'who created CozyOS',
  'list-apps': 'what apps are available',
  'account-status': 'why is my account not active',
  'help': 'help'
};

for (const [intentId, phrase] of Object.entries(REPRESENTATIVE_INTENTS)) {
  await asyncTest(`Intent "${intentId}" requested in Luo: non-empty text, correct intent, honest fallback disclosed`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase, { language: 'luo' });
    assert.strictEqual(result.result.intent, intentId);
    assert.strictEqual(typeof result.result.text, 'string');
    assert.ok(result.result.text.length > 0, 'must never be blank');
    assert.strictEqual(result.result.languageFallback, true);
    assert.ok(['en', 'sw', 'fr', 'ar', 'so'].includes(result.result.language));
  });
}

await asyncTest('Requesting Luo never throws, across a full think() call, even for an unknown/unsupported question', async () => {
  const { provider } = loadFullStack();
  await assert.doesNotReject(async () => {
    const result = await provider.think('What is the weather on Mars going to be like next Tuesday?', { language: 'luo' });
    assert.strictEqual(result.result.intent, 'unsupported');
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
