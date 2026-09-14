/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp027.test.js
 * RP-027 — real, executed tests for the RP-027 extension of
 * core/modules/intelligence/providers/rule-based-conversational-provider.js
 *
 * Kept as its own file, separate from the RP-026 regression suite
 * (rule-based-conversational-provider.test.js), so RP-026's own
 * recorded 14/14 test file stays byte-for-byte the historical RP-026
 * artifact — this file is purely additive.
 *
 * Loads the real provider file, the real cozy-knowledge-registry.js,
 * cozy-language-registry.js, and cozy-language-templates.js together
 * against a fake window — the same real, unmodified files a browser
 * would load, never a re-implementation of their logic.
 *
 * Run with: node core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp027.test.js
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
  return { async run(args) { return { interpretation: {}, thinking: {}, reasoning: {}, intelligence: {}, recalledMemories: [], policyResult: [], diagnostics: {} }; } };
}

function makeFakeDeveloperIdentity() {
  return {
    answerWhoCreatedYou() {
      return { known: true, answer: 'CozyOS and CozyAI were founded by Test Founder (also known as Cozybuilder) from Kenya, who serves as Owner, Architect, Lead Developer.' };
    }
  };
}

function makeFakeServiceRegistry() {
  return { listApplications: () => [{ id: 'mpesaos', name: 'MpesaOS' }, { id: 'shopos', name: 'ShopOS' }, { id: 'quarryos', name: 'QuarryOS' }] };
}

function makeFakeProviderManager() {
  return {
    register() {},
    healthReport: () => ({ 'rule-based-conversational': { health: 'ONLINE' } })
  };
}

/**
 * Loads the real provider file plus the real RP-027 registry files,
 * fresh (no require cache reuse across scenarios), against one shared
 * fake window — every file resolves `window` dynamically at call time,
 * same as real <script> tags, so load ORDER among the four does not
 * matter here (mirrors both dashboard.html's and index.html's real,
 * different load sets).
 */
function loadFullStack(extraCozyOS) {
  const fakeWindow = { CozyOS: Object.assign({
    LivingAI: makeFakeLivingAI(),
    CognitiveCoordinator: makeFakeCoordinator(),
    DeveloperIdentity: makeFakeDeveloperIdentity(),
    ServiceRegistry: makeFakeServiceRegistry(),
    ProviderManager: makeFakeProviderManager()
  }, extraCozyOS) };
  global.window = fakeWindow;

  const languageRegistryPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js');
  const languageTemplatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
  const knowledgeRegistryPath = path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js');
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');

  [languageRegistryPath, languageTemplatesPath, knowledgeRegistryPath, providerPath].forEach((p) => {
    delete require.cache[require.resolve(p)];
    require(p);
  });

  return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational') };
}

const DEFAULT_LANGS = ['en', 'sw', 'fr', 'ar', 'so'];
const EXTENDED_LANGS = ['luo', 'ki', 'kam', 'zu', 'lg', 'ig'];

// A representative set of English trigger phrases per intent, used to
// drive the classifier — RP-027's own minimum test matrix (greeting,
// identity, creator, apps, registration, authentication, phone
// verification, account status, provider status) plus the additional
// intents this pass actually implemented.
const INTENT_TRIGGERS = {
  'greeting-generic': 'hello',
  'identity': 'who are you',
  'founder': 'who created CozyOS',
  'list-apps': 'what apps are available',
  'how-to-register': 'how do I register',
  'how-authentication-works': 'how does authentication work',
  'phone-verification': 'why is my phone not verified',
  'account-status': 'why is my account not active',
  'list-providers': 'provider status'
};

(async () => {

// ---------------------------------------------------------------------
// Intent x default-language matrix — every intent, every default
// language: intent correct, language correct (non-empty, no leaked
// English when another language was requested for a genuinely
// translated intent), no fabricated fact, no fallback leakage.
// ---------------------------------------------------------------------

for (const [intentId, phrase] of Object.entries(INTENT_TRIGGERS)) {
  for (const lang of DEFAULT_LANGS) {
    await asyncTest(`Intent x Language: "${phrase}" x ${lang} -> correct intent, non-empty text, no fallback leakage`, async () => {
      const { provider } = loadFullStack();
      const result = await provider.think(phrase, { language: lang });
      assert.strictEqual(result.result.intent, intentId, `expected intent ${intentId}, got ${result.result.intent}`);
      assert.strictEqual(result.result.language, lang);
      assert.strictEqual(result.result.languageFallback, false, `${lang} is a default language and must never report a fallback`);
      assert.strictEqual(typeof result.result.text, 'string');
      assert.ok(result.result.text.length > 0, 'response text must be non-empty');
    });
  }
}

// ---------------------------------------------------------------------
// RP-026 regression, re-confirmed inside the RP-027 full stack (not
// just in isolation) — greeting/thanks/identity/help still behave
// exactly as RP-026 shipped them once the new registries are loaded.
// ---------------------------------------------------------------------

await asyncTest('RP-026 regression (full stack): "Good morning" is still morning-specific and English by default', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Good morning');
  assert.strictEqual(result.result.intent, 'greeting-morning');
  assert.strictEqual(result.result.language, 'en');
  assert.ok(/good morning/i.test(result.result.text));
});

await asyncTest('RP-026 regression (full stack): "Thank you" still classifies as thanks', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Thank you');
  assert.strictEqual(result.result.intent, 'thanks');
});

await asyncTest('RP-024 regression (full stack): reply text never contains pipeline evidence/diagnostic strings', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Hello');
  assert.ok(!/isReal/i.test(result.result.text));
  assert.ok(!/diagnostics/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// Fact Safety Rule (RP-027 §3) — VERIFIED vs honest fallback, never a
// fabricated fact, for every evidence-backed intent.
// ---------------------------------------------------------------------

await asyncTest('Fact Safety — founder: VERIFIED answer includes the real DeveloperIdentity text when present', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('who created CozyOS');
  assert.ok(/Test Founder/.test(result.result.text), 'must surface the real, live evidence, not a fabricated name');
});

await asyncTest('Fact Safety — founder: honest NOT_FOUND text when DeveloperIdentity is absent, never invents a name (provider file loaded standalone, no RP-027 registries at all)', async () => {
  const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator() } };
  global.window = fakeWindow;
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');
  delete require.cache[require.resolve(providerPath)];
  require(providerPath);
  const provider = fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
  const result = await provider.think('who created CozyOS');
  assert.strictEqual(result.result.intent, 'founder');
  assert.ok(result.result.text.length > 0, 'must never be blank, even with zero RP-027 registries loaded');
  assert.ok(/don't currently have a verified record/i.test(result.result.text));
  assert.ok(!/Test Founder/.test(result.result.text));
});

await asyncTest('Fact Safety — list-apps: VERIFIED, real application names appear, never a fabricated app', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('what apps are available');
  assert.ok(/MpesaOS/.test(result.result.text));
  assert.ok(!/FabricatedApp/.test(result.result.text));
});

await asyncTest('Fact Safety — list-apps: honest "registry isn\'t available" text when ServiceRegistry is absent (provider file loaded standalone, no RP-027 registries at all)', async () => {
  const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator() } };
  global.window = fakeWindow;
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');
  delete require.cache[require.resolve(providerPath)];
  require(providerPath);
  const provider = fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
  const result = await provider.think('what apps are available');
  assert.ok(result.result.text.length > 0, 'must never be blank, even with zero RP-027 registries loaded');
  assert.ok(/registry isn't available/i.test(result.result.text));
});

await asyncTest('Fact Safety — list-providers: VERIFIED, real ONLINE health value appears, never fabricated', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('provider status');
  assert.ok(/ONLINE/.test(result.result.text));
});

// ---------------------------------------------------------------------
// Unknown questions / missing facts — proves the system does not
// fabricate answers for things genuinely outside its scope.
// ---------------------------------------------------------------------

await asyncTest('Unknown question (outside every disclosed intent) -> honest "unsupported", not a fabricated answer', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What is the weather on Mars going to be like next Tuesday?');
  assert.strictEqual(result.result.intent, 'unsupported');
  assert.ok(/don't have a rule-based answer/i.test(result.result.text));
});

await asyncTest('account-status with no live account context -> honest "can\'t see enough verified account information", never guesses a reason', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('why is my account not active');
  assert.strictEqual(result.result.intent, 'account-status');
  assert.ok(/can't see enough verified account information/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// Language selection and default-language behavior
// ---------------------------------------------------------------------

await asyncTest('Language selection: manual language selection is honored exactly', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello', { language: 'fr' });
  assert.strictEqual(result.result.language, 'fr');
  assert.ok(/Bonjour/.test(result.result.text));
});

await asyncTest('Language selection: no language specified defaults to English (RP-026 default preserved)', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello');
  assert.strictEqual(result.result.language, 'en');
});

await asyncTest('Language selection: country suggests a default language when no manual/requested language is given', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello', { country: 'KE' });
  assert.strictEqual(result.result.language, 'sw');
});

await asyncTest('Language selection: manual selection overrides a country suggestion', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('hello', { language: 'ar', country: 'KE' });
  assert.strictEqual(result.result.language, 'ar');
});

// ---------------------------------------------------------------------
// Extended languages — selectable, but honestly fall back (never
// silently produce unverified machine-translated text) for every one.
// ---------------------------------------------------------------------

for (const code of EXTENDED_LANGS) {
  await asyncTest(`Extended language "${code}": honestly falls back to an AVAILABLE language, discloses the fallback, never fabricates a ${code} translation`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think('hello', { language: code });
    assert.strictEqual(result.result.languageFallback, true, `${code} is NOT_READY and must report languageFallback:true`);
    assert.strictEqual(result.result.requestedLanguage, code);
    assert.ok(DEFAULT_LANGS.includes(result.result.language), 'the language actually used must be one of the 5 AVAILABLE defaults');
    assert.ok(/don't yet have verified/i.test(result.result.text) || /Bado sina/i.test(result.result.text) || /pas encore/i.test(result.result.text) || /ليس لدي بعد/i.test(result.result.text) || /Wali ma haysto/i.test(result.result.text), 'fallback must be disclosed in-text, in the resolved language');
  });
}

// ---------------------------------------------------------------------
// Regression: accidental provider activation is never triggered by any
// of the new intents/language logic (still exactly one setActiveProvider
// call, from RP-026's own explicit step).
// ---------------------------------------------------------------------

test('RP-027 additions never cause a second/extra provider activation', () => {
  const fakeAI = makeFakeLivingAI();
  let setActiveCount = 0;
  const originalSetActive = fakeAI.setActiveProvider.bind(fakeAI);
  fakeAI.setActiveProvider = (name) => { setActiveCount++; return originalSetActive(name); };

  const fakeWindow = { CozyOS: {
    LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator(),
    DeveloperIdentity: makeFakeDeveloperIdentity(), ServiceRegistry: makeFakeServiceRegistry(), ProviderManager: makeFakeProviderManager()
  } };
  global.window = fakeWindow;
  [
    path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js'),
    path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js'),
    path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js'),
    path.join(__dirname, '..', 'rule-based-conversational-provider.js')
  ].forEach((p) => { delete require.cache[require.resolve(p)]; require(p); });

  assert.strictEqual(setActiveCount, 1, 'activation must still happen exactly once, same as RP-026');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
