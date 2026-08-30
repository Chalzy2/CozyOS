/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-registration.test.js
 * REGISTRATION/AUTH milestone — real, executed tests for how-to-register
 * becoming evidence-backed via getRegistrationFlowFact() (real,
 * committed, directly-audited registration source code:
 * core/modules/identity/identity-engine.js register(), and the real
 * registration form + submit handler in core/shell/cozy-login-gate.js).
 *
 * Kept as its own file, separate from every other regression suite in
 * this directory, so none of those historical pass counts (RP-026:
 * 14/14, RP-027: 66/66, RP-036: 39/39, project-knowledge: 48/48,
 * public-vision: 14/14) are touched by this milestone — this file is
 * purely additive, and how-to-register's own new behavior lives here.
 *
 * Loads the real provider file, the real cozy-language-registry.js,
 * cozy-language-templates.js, and cozy-knowledge-registry.js together
 * against a fake window — the same real, unmodified-elsewhere files a
 * browser would load. getRegistrationFlowFact() lives directly inside
 * cozy-knowledge-registry.js (committed-code evidence, not a live
 * runtime dependency — see that function's own header) so, unlike
 * founder/list-apps/list-providers, there is no separate live source
 * module to omit; "knowledge source unavailable" here is modeled by
 * not loading cozy-knowledge-registry.js at all (G/H below).
 *
 * Run with: node core/modules/intelligence/providers/tests/rule-based-conversational-provider-registration.test.js
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

/**
 * loadFullStack(includeKnowledgeRegistry)
 *   When includeKnowledgeRegistry is false, cozy-knowledge-registry.js
 *   (which is where getRegistrationFlowFact() actually lives this
 *   milestone) is deliberately NOT loaded — used by the G/H "knowledge
 *   source unavailable" scenarios below, the same honest-degradation
 *   discipline the existing public-vision and project-knowledge suites
 *   already apply to their own dependencies.
 */
function loadFullStack(includeKnowledgeRegistry = true) {
  const fakeWindow = { CozyOS: {
    LivingAI: makeFakeLivingAI(),
    CognitiveCoordinator: makeFakeCoordinator(),
    ProviderManager: makeFakeProviderManager()
  } };
  global.window = fakeWindow;

  const languageRegistryPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js');
  const languageTemplatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
  const knowledgeRegistryPath = path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js');
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');

  const toLoad = [languageRegistryPath, languageTemplatesPath];
  if (includeKnowledgeRegistry) toLoad.push(knowledgeRegistryPath);
  toLoad.push(providerPath);

  toLoad.forEach((p) => {
    delete require.cache[require.resolve(p)];
    require(p);
  });

  return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational') };
}

const DEFAULT_LANGS = ['en', 'sw', 'fr', 'ar', 'so'];
const EXTENDED_LANGS = ['luo', 'ki', 'kam', 'zu', 'lg', 'ig'];

(async () => {

// ---------------------------------------------------------------------
// A. Kiswahili intent detection — Kiswahili is the FIRST priority
// ---------------------------------------------------------------------

const swPhrases = [
  'Ninawezaje kujisajili?',
  'Nawezaje kufungua akaunti ya CozyOS?',
  'Ninawezaje kutengeneza akaunti?',
  'Nataka kujisajili CozyOS nifanye nini?',
  'Ninaanzaje usajili wa CozyOS?',
  'Ninawezaje kuunda akaunti ya CozyOS?'
];

for (const phrase of swPhrases) {
  await test(`A. Kiswahili intent detection: "${phrase}" -> how-to-register`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, 'how-to-register', `"${phrase}" should classify as how-to-register, got ${result.result.intent}`);
  });
}

// ---------------------------------------------------------------------
// B. English intent detection
// ---------------------------------------------------------------------

const enPhrases = [
  'How do I register?',
  'How do I sign up?',
  'How do I create an account?',
  'How can I create a CozyOS account?',
  'What are the registration steps?'
];

for (const phrase of enPhrases) {
  await test(`B. English intent detection: "${phrase}" -> how-to-register`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think(phrase);
    assert.strictEqual(result.result.intent, 'how-to-register', `"${phrase}" should classify as how-to-register, got ${result.result.intent}`);
  });
}

// ---------------------------------------------------------------------
// C. Kiswahili-first routing — auto-detected Kiswahili actually
// resolves the reply in Kiswahili, with the genuine committed
// translation (stepsSw), not an English placeholder.
// ---------------------------------------------------------------------

await test('C. Kiswahili-first routing: "Ninawezaje kujisajili?" resolves language=sw and uses the real Kiswahili steps', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Ninawezaje kujisajili?');
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.strictEqual(result.result.language, 'sw');
  assert.ok(/Fungua skrini ya kuingia/i.test(result.result.text), 'must contain the real, committed Kiswahili step text, not an English fallback');
  assert.ok(!/Kwa Kiingereza/i.test(result.result.text), 'must NOT use the "no verified translation yet" English-fallback wrapper — a genuine Kiswahili translation exists this milestone');
});

// ---------------------------------------------------------------------
// D. English routing
// ---------------------------------------------------------------------

await test('D. English routing: "How do I register?" resolves language=en and uses the real English steps', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.strictEqual(result.result.language, 'en');
  assert.ok(/Open the CozyOS login screen/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// E. Real verified registration content — the actually-audited fields
// and password policy appear, sourced from identity-engine.js /
// cozy-login-gate.js, not invented.
// ---------------------------------------------------------------------

await test('E. Real verified content: password policy from the real register() validation appears', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(/8 characters/.test(result.result.text), 'must state the real minimum length from identity-engine.js');
  assert.ok(/uppercase/i.test(result.result.text) && /lowercase/i.test(result.result.text) && /number/i.test(result.result.text) && /symbol/i.test(result.result.text),
    'must state the real complexity requirements from identity-engine.js');
});

await test('E. Real verified content: the actual form fields (from cozy-login-gate.js) are named', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(/First Name/i.test(result.result.text) && /Username/i.test(result.result.text) && /Email/i.test(result.result.text) && /Phone/i.test(result.result.text),
    'must name the real registration form fields, not a guessed field list');
});

await test('E. Real verified content: auto-login-after-register behavior (real caller-side behavior) is disclosed', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(/signs you in automatically/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// F. No invented registration steps — the audit found NO email/SMS
// verification requirement for standard registration; this must never
// be asserted as required, and no OTP/verification-code step may be
// invented.
// ---------------------------------------------------------------------

await test('F. No invented steps: does not claim an email/SMS verification code is required (audit found none)', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(!/verification code is required/i.test(result.result.text) || /No email or SMS verification code is required/i.test(result.result.text),
    'the only permitted "verification code" sentence is the honest denial that one is required');
  assert.ok(!/enter the code sent to your (?:phone|email)/i.test(result.result.text), 'must never invent an OTP-entry step');
});

await test('F. No invented steps: admin self-registration (backend-only, no public UI) is never presented as a public step', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(!/administrator/i.test(result.result.text), 'admin self-registration has no public UI entry point and must not appear as a user-facing step');
});

// ---------------------------------------------------------------------
// G. NOT_FOUND behavior when the knowledge source is unavailable
// ---------------------------------------------------------------------

await test('G. Knowledge registry absent: how-to-register honestly reports a not_found-style reply, never throws, never invents steps', async () => {
  const { provider } = loadFullStack(false);
  const result = await provider.think('How do I register?');
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.ok(/won't guess at the steps|check CozyOS's own registration screen/i.test(result.result.text));
  assert.ok(!/Open the CozyOS login screen/i.test(result.result.text), 'must not fall back to fabricated/remembered steps');
});

// ---------------------------------------------------------------------
// H. No exception when the underlying implementation is unavailable
// ---------------------------------------------------------------------

await test('H. Knowledge registry absent: provider.think() resolves cleanly, no uncaught exception, non-empty text', async () => {
  const { provider } = loadFullStack(false);
  let threw = false;
  let result;
  try {
    result = await provider.think('How do I sign up?');
  } catch (_err) {
    threw = true;
  }
  assert.strictEqual(threw, false, 'must never throw even with zero registration evidence available');
  assert.ok(result.result.text.length > 0);
});

// ---------------------------------------------------------------------
// I. Existing registration intent remains compatible — classification
// itself is unchanged; only the evidence backing the reply changed.
// ---------------------------------------------------------------------

await test('I. Existing registration intent compatibility: "Register" alone still classifies as how-to-register', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Register');
  assert.strictEqual(result.result.intent, 'how-to-register');
});

await test('I. Existing registration intent compatibility: "Sign me up" still classifies as how-to-register', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Sign me up');
  assert.strictEqual(result.result.intent, 'how-to-register');
});

// ---------------------------------------------------------------------
// J. Existing account-status behavior is unchanged
// ---------------------------------------------------------------------

await test('J. account-status unchanged: "why is my account not active" still honest, no verified account info claimed', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('why is my account not active');
  assert.strictEqual(result.result.intent, 'account-status');
  assert.ok(/can't see enough verified account information/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// K. Existing founder/public-story behavior is unchanged
// ---------------------------------------------------------------------

await test('K. founder intent unchanged: "who created CozyOS" still classifies as founder, honest NOT_FOUND with no DeveloperIdentity loaded', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('who created CozyOS');
  assert.strictEqual(result.result.intent, 'founder');
  assert.ok(/don't currently have a verified record/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// L. Other existing intents do not regress
// ---------------------------------------------------------------------

await test('L. No regression: "Good morning" still greeting-morning', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Good morning');
  assert.strictEqual(result.result.intent, 'greeting-morning');
});

await test('L. No regression: "What is the weather on Mars going to be like next Tuesday?" still unsupported', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What is the weather on Mars going to be like next Tuesday?');
  assert.strictEqual(result.result.intent, 'unsupported');
});

// ---------------------------------------------------------------------
// M. NOT_READY languages honestly fall back for registration too
// ---------------------------------------------------------------------

for (const code of EXTENDED_LANGS) {
  await test(`M. Extended language "${code}" on a registration question: honestly falls back, discloses it, never fabricates a ${code} translation`, async () => {
    const { provider } = loadFullStack();
    const result = await provider.think('How do I register?', { language: code });
    assert.strictEqual(result.result.languageFallback, true, `${code} is NOT_READY and must report languageFallback:true`);
    assert.strictEqual(result.result.requestedLanguage, code);
    assert.ok(DEFAULT_LANGS.includes(result.result.language), 'the language actually used must be one of the 5 AVAILABLE defaults');
  });
}

// ---------------------------------------------------------------------
// N. No private founder content is exposed by the registration path
// ---------------------------------------------------------------------

await test('N. Registration reply never mentions founder-story-seed.js/founder-story-engine.js content or filenames', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.ok(!/founder-story/i.test(result.result.text));
  assert.ok(!/autobiography/i.test(result.result.text));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;

})();
