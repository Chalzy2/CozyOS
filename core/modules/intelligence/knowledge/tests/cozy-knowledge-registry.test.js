/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-registry.test.js
 * RP-027 — real, executed tests for
 * core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 *
 * Run with: node core/modules/intelligence/knowledge/tests/cozy-knowledge-registry.test.js
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

function loadModule(fakeWindow) {
  const modulePath = path.join(__dirname, '..', 'cozy-knowledge-registry.js');
  delete require.cache[require.resolve(modulePath)];
  global.window = fakeWindow;
  require(modulePath);
  return global.window.CozyOS.CozyKnowledge;
}

// ---------------------------------------------------------------------
// Founder fact
// ---------------------------------------------------------------------

test('getFounderFact(): NOT_FOUND (never fabricated) when DeveloperIdentity is absent', () => {
  const knowledge = loadModule({ CozyOS: {} });
  const fact = knowledge.getFounderFact();
  assert.strictEqual(fact.evidence, 'NOT_FOUND');
  assert.strictEqual(fact.answer, null);
});

test('getFounderFact(): VERIFIED when DeveloperIdentity genuinely answers', () => {
  const knowledge = loadModule({
    CozyOS: { DeveloperIdentity: { answerWhoCreatedYou: () => ({ known: true, answer: 'CozyOS was founded by Test Founder.' }) } }
  });
  const fact = knowledge.getFounderFact();
  assert.strictEqual(fact.evidence, 'VERIFIED');
  assert.strictEqual(fact.answer, 'CozyOS was founded by Test Founder.');
});

test('getFounderFact(): NOT_FOUND when DeveloperIdentity itself reports known:false (fail-closed, not guessed)', () => {
  const knowledge = loadModule({
    CozyOS: { DeveloperIdentity: { answerWhoCreatedYou: () => ({ known: false, answer: null }) } }
  });
  const fact = knowledge.getFounderFact();
  assert.strictEqual(fact.evidence, 'NOT_FOUND');
});

test('getFounderFact(): a throwing DeveloperIdentity degrades to NOT_FOUND, never throws upward', () => {
  const knowledge = loadModule({
    CozyOS: { DeveloperIdentity: { answerWhoCreatedYou: () => { throw new Error('simulated failure'); } } }
  });
  assert.doesNotThrow(() => {
    const fact = knowledge.getFounderFact();
    assert.strictEqual(fact.evidence, 'NOT_FOUND');
  });
});

// ---------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------

test('listApplicationsFact(): NOT_FOUND when no application registry is present', () => {
  const knowledge = loadModule({ CozyOS: {} });
  const fact = knowledge.listApplicationsFact();
  assert.strictEqual(fact.evidence, 'NOT_FOUND');
  assert.strictEqual(fact.applications, null);
});

test('listApplicationsFact(): VERIFIED, real names, when window.CozyOS.listApplications() is present', () => {
  const knowledge = loadModule({
    CozyOS: { listApplications: () => [{ id: 'mpesaos', name: 'MpesaOS' }, { id: 'shopos', name: 'ShopOS' }] }
  });
  const fact = knowledge.listApplicationsFact();
  assert.strictEqual(fact.evidence, 'VERIFIED');
  assert.deepStrictEqual(fact.applications, ['MpesaOS', 'ShopOS']);
});

test('listApplicationsFact(): falls back to ServiceRegistry.listApplications() when the shortcut is absent', () => {
  const knowledge = loadModule({
    CozyOS: { ServiceRegistry: { listApplications: () => [{ id: 'quarryos', name: 'QuarryOS' }] } }
  });
  const fact = knowledge.listApplicationsFact();
  assert.strictEqual(fact.evidence, 'VERIFIED');
  assert.deepStrictEqual(fact.applications, ['QuarryOS']);
});

test('listApplicationsFact(): NOT_FOUND (never a stale hardcoded list) when the real registry returns an empty array', () => {
  const knowledge = loadModule({ CozyOS: { listApplications: () => [] } });
  const fact = knowledge.listApplicationsFact();
  assert.strictEqual(fact.evidence, 'NOT_FOUND');
});

// ---------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------

test('listProvidersFact(): NOT_FOUND when ProviderManager is absent', () => {
  const knowledge = loadModule({ CozyOS: {} });
  const fact = knowledge.listProvidersFact();
  assert.strictEqual(fact.evidence, 'NOT_FOUND');
});

test('listProvidersFact(): VERIFIED, formats real healthReport() entries, never fabricates a health value', () => {
  const knowledge = loadModule({
    CozyOS: { ProviderManager: { healthReport: () => ({ 'rule-based-conversational': { health: 'ONLINE' }, 'on-device': { health: 'DISABLED' } }) } }
  });
  const fact = knowledge.listProvidersFact();
  assert.strictEqual(fact.evidence, 'VERIFIED');
  assert.deepStrictEqual(fact.entries.sort(), ['on-device: DISABLED', 'rule-based-conversational: ONLINE'].sort());
});

// ---------------------------------------------------------------------
// Account state vocabulary — PARTIALLY_VERIFIED, never a live per-user read
// ---------------------------------------------------------------------

test('accountStateVocabulary(): PARTIALLY_VERIFIED, confirms ACTIVE/PENDING only, never claims a specific user\'s state', () => {
  const knowledge = loadModule({ CozyOS: {} });
  const fact = knowledge.accountStateVocabulary();
  assert.strictEqual(fact.evidence, 'PARTIALLY_VERIFIED');
  assert.ok(fact.confirmedStates.includes('ACTIVE'));
  assert.ok(fact.confirmedStates.includes('PENDING'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
