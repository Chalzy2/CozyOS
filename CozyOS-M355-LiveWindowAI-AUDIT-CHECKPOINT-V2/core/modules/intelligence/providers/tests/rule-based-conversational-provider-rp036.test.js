/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp036.test.js
 * RP-036 — Assistant Intent/Routing Repair (English + Kiswahili)
 *
 * Real, executed regression tests for the bug reported directly
 * against this repository: a bare "Register" (and most ordinary
 * phrasings of the same request, and all Kiswahili input) fell through
 * to the honest-but-blocking "unsupported" fallback instead of being
 * recognized. Kept as its own file, separate from the RP-026 and
 * RP-027 suites, so those stay byte-for-byte their own historical
 * artifacts (RP-026: 14/14, RP-027: 66/66) — this file is purely
 * additive and does not modify either.
 *
 * Loads the real provider file plus the real cozy-language-registry.js
 * and cozy-language-templates.js against a fake window — same real,
 * unmodified-elsewhere files a browser would load.
 *
 * Run with: node core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp036.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

async function test(name, fn) {
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

function makeFakeProviderManager() {
  return { register() {}, healthReport: () => ({ 'rule-based-conversational': { health: 'ONLINE' } }) };
}

function loadFullStack() {
  const fakeWindow = { CozyOS: {
    LivingAI: makeFakeLivingAI(),
    CognitiveCoordinator: makeFakeCoordinator(),
    ProviderManager: makeFakeProviderManager()
  } };
  global.window = fakeWindow;

  const languageRegistryPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js');
  const languageTemplatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');

  [languageRegistryPath, languageTemplatesPath, providerPath].forEach((p) => {
    delete require.cache[require.resolve(p)];
    require(p);
  });

  return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational') };
}

(async () => {

// ---------------------------------------------------------------------
// The exact reported bug: "Register" (bare word) must now be
// recognized, in English, with no explicit language option.
// ---------------------------------------------------------------------

await test('BUG REPRO: "Register" is recognized as how-to-register, not "unsupported"', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Register');
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.ok(!/don't have a rule-based answer/i.test(result.result.text), 'must not be the unsupported fallback');
});

// ---------------------------------------------------------------------
// English synonym coverage (RP-036 §6 test matrix)
// ---------------------------------------------------------------------

const ENGLISH_REGISTER_PHRASES = [
  'Register', 'register', 'I want to register', 'How do I register?',
  'How can I register?', 'I want to create an account', 'Create an account',
  'Sign me up', 'I need to sign up', 'Can I register?', 'Where do I register?',
  'Take me to registration', 'Open registration'
];

for (const phrase of ENGLISH_REGISTER_PHRASES) {
  await test(`English register synonym: "${phrase}" -> how-to-register`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, 'how-to-register', `"${phrase}" should classify as how-to-register, got ${result.result.intent}`);
  });
}

// ---------------------------------------------------------------------
// Kiswahili register coverage — classifyIntent() previously had ZERO
// non-English patterns at all; these prove that gap is closed.
// ---------------------------------------------------------------------

const SWAHILI_REGISTER_PHRASES = [
  'Nataka kujisajili', 'Nataka kusajili akaunti', 'Ninawezaje kujisajili?',
  'Nisaidie kujisajili', 'Nataka kufungua akaunti'
];

for (const phrase of SWAHILI_REGISTER_PHRASES) {
  await test(`Kiswahili register phrase: "${phrase}" -> how-to-register, answered in Kiswahili with no explicit language option`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, 'how-to-register', `"${phrase}" should classify as how-to-register, got ${result.result.intent}`);
    assert.strictEqual(result.result.language, 'sw', `"${phrase}" should auto-detect Kiswahili and answer in sw, got ${result.result.language}`);
  });
}

// ---------------------------------------------------------------------
// Kiswahili greeting/help/identity coverage
// ---------------------------------------------------------------------

const SWAHILI_TRIGGERS = {
  'Habari': 'greeting-generic',
  'Hujambo': 'greeting-generic',
  'Mambo': 'greeting-generic',
  'Nisaidie': 'help',
  'CozyOS ni nini?': 'what-is-cozyos',
  'Unaweza kufanya nini?': 'help'
};

for (const [phrase, expectedIntent] of Object.entries(SWAHILI_TRIGGERS)) {
  await test(`Kiswahili: "${phrase}" -> ${expectedIntent}, auto-detected and answered in sw`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, expectedIntent, `"${phrase}" should classify as ${expectedIntent}, got ${result.result.intent}`);
    assert.strictEqual(result.result.language, 'sw');
  });
}

// ---------------------------------------------------------------------
// Navigation intents (English + Kiswahili) — recognized AND carry a
// real, non-empty confirmation text. Actual DOM navigation execution
// lives in cozy-living-assistant.js (DOM-owning file) and is out of
// scope for this Node-level provider test, same boundary RP-024/RP-027
// already established for this file.
// ---------------------------------------------------------------------

const NAV_TRIGGERS = {
  'Open dashboard': 'nav-dashboard',
  'Go to dashboard': 'nav-dashboard',
  'Fungua dashibodi': 'nav-dashboard',
  'Show notifications': 'nav-notifications',
  'Nionyeshe arifa': 'nav-notifications',
  'Show recent activity': 'nav-recent',
  'Nataka kuona shughuli za hivi karibuni': 'nav-recent',
  'Take me to AI Providers': 'nav-aiproviders',
  'Can you help me find AI providers?': 'nav-aiproviders',
  'Open Diagnostics Center': 'nav-diagnostics'
};

for (const [phrase, expectedIntent] of Object.entries(NAV_TRIGGERS)) {
  await test(`Navigation: "${phrase}" -> ${expectedIntent}, non-empty text`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, expectedIntent, `"${phrase}" should classify as ${expectedIntent}, got ${result.result.intent}`);
    assert.ok(result.result.text.length > 0);
  });
}

// ---------------------------------------------------------------------
// Explicit manual language selection still wins over auto-detection
// (precedence: manual > requested > detected > country > en).
// ---------------------------------------------------------------------

await test('Precedence: explicit manual language overrides Kiswahili auto-detection', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Nataka kujisajili', { language: 'fr' });
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.strictEqual(result.result.language, 'fr');
});

// ---------------------------------------------------------------------
// Regression: genuinely unsupported input must still reach the honest
// fallback — broadening intent matching must not make everything
// "supported".
// ---------------------------------------------------------------------

await test('Regression: genuinely unrelated question still returns "unsupported"', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What is the weather on Mars going to be like next Tuesday?');
  assert.strictEqual(result.result.intent, 'unsupported');
});

await test('Regression: "Good morning" is still greeting-morning, not swallowed by the broadened register pattern', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Good morning');
  assert.strictEqual(result.result.intent, 'greeting-morning');
});

await test('Regression: RP-026 "Hello" behavior unchanged (English, no auto-detect false positive)', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Hello');
  assert.strictEqual(result.result.intent, 'greeting-generic');
  assert.strictEqual(result.result.language, 'en');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
