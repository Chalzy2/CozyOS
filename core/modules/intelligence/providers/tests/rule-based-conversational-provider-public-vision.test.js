/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-public-vision.test.js
 * COZYAI-PUBLIC-VISION-KNOWLEDGE — real, executed tests for the three
 * new intents this repair adds: why-use-cozyos, differentiation,
 * language-support-list.
 *
 * Kept as its own file, separate from every other regression suite in
 * this directory, so none of those historical pass counts (RP-026:
 * 14/14, RP-027: 66/66, RP-036: 39/39, project-knowledge: 48/48) are
 * touched by this repair — this file is purely additive.
 *
 * Loads the real provider file, the real cozy-language-registry.js,
 * cozy-language-templates.js, cozy-knowledge-registry.js, and the new
 * cozy-public-knowledge-source.js together against a fake window —
 * the same real, unmodified-elsewhere files a browser would load.
 *
 * Run with: node core/modules/intelligence/providers/tests/rule-based-conversational-provider-public-vision.test.js
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
 * loadFullStack(includePublicKnowledge)
 *   When includePublicKnowledge is false, cozy-public-knowledge-
 *   source.js is deliberately NOT loaded — used by the "partial load
 *   degrades honestly to NOT_FOUND" scenarios below, the same
 *   discipline the existing project-knowledge suite already applies
 *   to FounderStory.
 */
function loadFullStack(includePublicKnowledge = true) {
  const fakeWindow = { CozyOS: {
    LivingAI: makeFakeLivingAI(),
    CognitiveCoordinator: makeFakeCoordinator(),
    ProviderManager: makeFakeProviderManager()
  } };
  global.window = fakeWindow;

  const languageRegistryPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js');
  const languageTemplatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
  const publicKnowledgePath = path.join(__dirname, '..', '..', 'knowledge', 'cozy-public-knowledge-source.js');
  const knowledgeRegistryPath = path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js');
  const providerPath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');

  const toLoad = [languageRegistryPath, languageTemplatesPath];
  if (includePublicKnowledge) toLoad.push(publicKnowledgePath);
  toLoad.push(knowledgeRegistryPath, providerPath);

  toLoad.forEach((p) => {
    delete require.cache[require.resolve(p)];
    require(p);
  });
  // cozy-public-knowledge-source.js registers a load-guard
  // (window.CozyOS.Modules["cozy-public-knowledge-source"]) — when we
  // deliberately don't require() it, window.CozyOS.CozyPublicKnowledge
  // simply never exists, which is exactly the "not loaded" state the
  // NOT_FOUND-degradation scenarios below need.

  return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational') };
}

(async () => {

// ---------------------------------------------------------------------
// why-use-cozyos — English + Kiswahili trigger phrasings
// ---------------------------------------------------------------------

await test('EN: "Why should I use CozyOS?" -> why-use-cozyos, VERIFIED content, non-empty', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Why should I use CozyOS?');
  assert.strictEqual(result.result.intent, 'why-use-cozyos');
  assert.strictEqual(result.result.language, 'en');
  assert.ok(result.result.text.length > 0);
  assert.ok(/community/i.test(result.result.text), 'expected the real community-oriented content, not a placeholder');
});

await test('EN: "What are the benefits of CozyOS?" -> why-use-cozyos', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What are the benefits of CozyOS?');
  assert.strictEqual(result.result.intent, 'why-use-cozyos');
});

await test('SW: "Kwa nini nitumie CozyOS?" -> why-use-cozyos, auto-detected Kiswahili', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Kwa nini nitumie CozyOS?');
  assert.strictEqual(result.result.intent, 'why-use-cozyos');
  assert.strictEqual(result.result.language, 'sw');
  assert.ok(result.result.text.length > 0);
});

// ---------------------------------------------------------------------
// differentiation — English + Kiswahili trigger phrasings
// ---------------------------------------------------------------------

await test('EN: "How is CozyOS different?" -> differentiation, never claims "automatically better"', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How is CozyOS different?');
  assert.strictEqual(result.result.intent, 'differentiation');
  assert.ok(!/automatically better/i.test(result.result.text) || /doesn't claim to be automatically better/i.test(result.result.text),
    'must never assert unqualified superiority');
});

await test('EN: "What makes CozyOS different from other apps?" -> differentiation', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What makes CozyOS different from other apps?');
  assert.strictEqual(result.result.intent, 'differentiation');
});

await test('SW: "CozyOS inatofautianaje?" -> differentiation, auto-detected Kiswahili', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('CozyOS inatofautianaje?');
  assert.strictEqual(result.result.intent, 'differentiation');
  assert.strictEqual(result.result.language, 'sw');
});

// ---------------------------------------------------------------------
// language-support-list — English + Kiswahili, and the honest
// target-list-vs-live-registry separation
// ---------------------------------------------------------------------

await test('EN: "Which languages does CozyOS support?" -> language-support-list, both target list and live state present', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Which languages does CozyOS support?');
  assert.strictEqual(result.result.intent, 'language-support-list');
  assert.ok(/Kiswahili/.test(result.result.text), 'target list should include Kiswahili');
  assert.ok(/Luo/.test(result.result.text), 'target list should include an extended, NOT_READY language too');
  assert.ok(/NOT_READY/.test(result.result.text), 'must honestly disclose the NOT_READY portion, not just the target list');
});

await test('EN: "What languages does CozyOS support?" (alternate phrasing) -> language-support-list', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('What languages does CozyOS support?');
  assert.strictEqual(result.result.intent, 'language-support-list');
});

await test('SW: "Lugha zipi zinazoungwa mkono?" -> language-support-list, auto-detected Kiswahili', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Lugha zipi zinazoungwa mkono?');
  assert.strictEqual(result.result.intent, 'language-support-list');
  assert.strictEqual(result.result.language, 'sw');
});

await test('language-support-list never states target-list membership as proof of live availability', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('Which languages does CozyOS support?');
  assert.ok(/policy goal, not proof/i.test(result.result.text), 'must explicitly disclaim target-list-as-proof-of-readiness');
});

// ---------------------------------------------------------------------
// Honest degradation: cozy-public-knowledge-source.js not loaded
// ---------------------------------------------------------------------

await test('CozyPublicKnowledge absent: why-use-cozyos honestly reports not_found, never throws, never fabricates', async () => {
  const { provider } = loadFullStack(false);
  const result = await provider.think('Why should I use CozyOS?');
  assert.strictEqual(result.result.intent, 'why-use-cozyos');
  assert.ok(/don't have a verified answer/i.test(result.result.text));
});

await test('CozyPublicKnowledge absent: differentiation honestly reports not_found, never throws', async () => {
  const { provider } = loadFullStack(false);
  const result = await provider.think('How is CozyOS different?');
  assert.strictEqual(result.result.intent, 'differentiation');
  assert.ok(/don't have a verified answer/i.test(result.result.text));
});

await test('CozyPublicKnowledge absent: language-support-list honestly reports not_found, never throws', async () => {
  const { provider } = loadFullStack(false);
  const result = await provider.think('Which languages does CozyOS support?');
  assert.strictEqual(result.result.intent, 'language-support-list');
  assert.ok(/don't have a verified answer/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// Registration stays honestly out of scope for this repair — no
// step-by-step content was added anywhere by this milestone.
// ---------------------------------------------------------------------

await test('Registration guardrail: "How do I register?" is completely unaffected by this repair (still the pre-existing how-to-register template, no new invented steps)', async () => {
  const { provider } = loadFullStack();
  const result = await provider.think('How do I register?');
  assert.strictEqual(result.result.intent, 'how-to-register');
  assert.ok(!/step\s*1|step\s*2|first,\s*(?:go|navigate)/i.test(result.result.text),
    'this repair must not have added invented step-by-step registration instructions');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;

})();
