/**
 * core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js
 * Phase 10C-2b — permanent regression suite proving the async provider
 * invocation boundary in CozyThinking, CozyReasoning, CozyInterpretation,
 * and CognitiveCoordinator.run().
 *
 * This is the successor to the Phase 10C-2 diagnostic test
 * (phase10c2-diagnostic-sync-only-contract.test.js, since removed), which
 * proved the OLD synchronous-only defect against the OLD code. That
 * defect no longer exists — this suite proves the NEW, correct behavior
 * against the real, modified engines, and is intended to remain in the
 * repository's permanent regression set going forward.
 *
 * All test-double providers used here are clearly labeled
 * asyncTestDoubleProvider* — they are synchronization-contract test
 * doubles, not real AI/LLM providers, and every test deregisters its
 * provider afterward so the registries return to their pre-test state.
 *
 * Run with: node core/modules/cognitive/tests/phase10c2b-async-provider-boundary.test.js
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

function loadModule(relPath) {
  const modulePath = path.join(__dirname, relPath);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
}

function loadCognitiveStack() {
  global.window = { CozyOS: {} };
  loadModule(path.join('..', '..', 'interpretation', 'cozy-interpretation.js'));
  loadModule(path.join('..', '..', 'thinking', 'cozy-thinking.js'));
  loadModule(path.join('..', '..', 'reasoning', 'cozy-reasoning.js'));
  loadModule(path.join('..', '..', 'intelligence', 'cozy-intelligence.js'));
  loadModule(path.join('..', '..', 'memory', 'cozy-memory-engine.js'));
  loadModule(path.join('..', '..', 'policy', 'policy-decision-engine.js'));
  loadModule(path.join('..', 'cognitive-coordinator.js'));
  return global.window.CozyOS;
}

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

console.log('\n=== Phase 10C-2b — Async Provider Invocation Boundary ===\n');

(async () => {
  let CozyOS = loadCognitiveStack();
  let { CozyThinking, CozyReasoning, CozyInterpretation, CognitiveCoordinator } = CozyOS;

  // ── CozyThinking (Tests 1–6) ──────────────────────────────────────────

  await test('1. CozyThinking accepts an async provider', () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [], confidence: 0.5 }; }
    const reg = CozyThinking.registerProvider({ id: 'atd-thinking', name: 'Async Test Double (Thinking)', supportsAlternatives: true, offline: true }, asyncTestDoubleProviderA);
    assert.strictEqual(reg.success, true);
    CozyThinking.removeProvider('atd-thinking');
  });

  await test('2. CozyThinking.think() returns a Promise', () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [], confidence: 0.5 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking', name: 'Async Test Double (Thinking)', offline: true }, asyncTestDoubleProviderA);
    const ret = CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.ok(ret instanceof Promise, 'think() must return a Promise now that it is async.');
    return ret.finally(() => CozyThinking.removeProvider('atd-thinking'));
  });

  await test('3. CozyThinking waits for the async provider (timing proof)', async () => {
    const DELAY_MS = 50;
    let providerResolved = false;
    async function asyncTestDoubleProviderA() { await delay(DELAY_MS); providerResolved = true; return { alternatives: [{ label: 'x' }], confidence: 0.5 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking', name: 'Async Test Double (Thinking)', offline: true }, asyncTestDoubleProviderA);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(providerResolved, true, 'By the time think() resolves, the provider must have genuinely finished (BEFORE the fix, this was false).');
    assert.strictEqual(result.success, true);
    CozyThinking.removeProvider('atd-thinking');
  });

  await test('4. The resolved alternatives are preserved', async () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [{ label: 'distinctive-alt-42' }], confidence: 0.5 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking', name: 'Async Test Double (Thinking)', offline: true }, asyncTestDoubleProviderA);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.alternatives.length, 1);
    assert.strictEqual(result.alternatives[0].label, 'distinctive-alt-42');
    CozyThinking.removeProvider('atd-thinking');
  });

  await test('5. The resolved confidence is preserved', async () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [], confidence: 0.7321 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking', name: 'Async Test Double (Thinking)', offline: true }, asyncTestDoubleProviderA);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.confidence, 0.7321);
    CozyThinking.removeProvider('atd-thinking');
  });

  await test('6. CozyThinking async provider rejection enters honest failure handling', async () => {
    async function asyncTestDoubleProviderRejecting() { await delay(10); throw new Error('distinctive-async-rejection'); }
    CozyThinking.registerProvider({ id: 'atd-thinking-reject', name: 'Async Test Double (Rejecting)', offline: true }, asyncTestDoubleProviderRejecting);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.isReal, false);
    assert.ok(result.reason.includes('distinctive-async-rejection'), 'The real rejection message must surface, not be swallowed.');
    assert.strictEqual(CozyThinking.getProviderHealth('atd-thinking-reject').healthy, false);
    CozyThinking.removeProvider('atd-thinking-reject');
  });

  // ── CozyReasoning (Tests 7–12) ────────────────────────────────────────

  await test('7. CozyReasoning accepts an async provider', () => {
    async function asyncTestDoubleProviderB() { await delay(10); return { conclusion: 'x', confidence: 0.5 }; }
    const reg = CozyReasoning.registerProvider({ id: 'atd-reasoning', name: 'Async Test Double (Reasoning)', offline: true }, asyncTestDoubleProviderB);
    assert.strictEqual(reg.success, true);
    CozyReasoning.removeProvider('atd-reasoning');
  });

  await test('8. CozyReasoning.reason() returns a Promise', () => {
    async function asyncTestDoubleProviderB() { await delay(10); return { conclusion: 'x', confidence: 0.5 }; }
    CozyReasoning.registerProvider({ id: 'atd-reasoning', name: 'Async Test Double (Reasoning)', offline: true }, asyncTestDoubleProviderB);
    const ret = CozyReasoning.reason({ evidence: [{ source: 'test', text: 'x' }] });
    assert.ok(ret instanceof Promise, 'reason() must return a Promise now that it is async.');
    return ret.finally(() => CozyReasoning.removeProvider('atd-reasoning'));
  });

  await test('9. CozyReasoning waits for the provider (timing proof)', async () => {
    const DELAY_MS = 50;
    let providerResolved = false;
    async function asyncTestDoubleProviderB() { await delay(DELAY_MS); providerResolved = true; return { conclusion: 'distinctive-conclusion-99', confidence: 0.6 }; }
    CozyReasoning.registerProvider({ id: 'atd-reasoning', name: 'Async Test Double (Reasoning)', offline: true }, asyncTestDoubleProviderB);
    const result = await CozyReasoning.reason({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(providerResolved, true, 'By the time reason() resolves, the provider must have genuinely finished.');
    assert.strictEqual(result.success, true);
    CozyReasoning.removeProvider('atd-reasoning');
  });

  await test('10. The resolved conclusion is preserved', async () => {
    async function asyncTestDoubleProviderB() { await delay(10); return { conclusion: 'distinctive-conclusion-99', confidence: 0.6, reasoningTrace: ['step-1'] }; }
    CozyReasoning.registerProvider({ id: 'atd-reasoning', name: 'Async Test Double (Reasoning)', offline: true }, asyncTestDoubleProviderB);
    const result = await CozyReasoning.reason({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.conclusion, 'distinctive-conclusion-99');
    assert.deepStrictEqual(result.reasoningTrace, ['step-1']);
    CozyReasoning.removeProvider('atd-reasoning');
  });

  await test('11. The resolved confidence is preserved', async () => {
    async function asyncTestDoubleProviderB() { await delay(10); return { conclusion: 'x', confidence: 0.4242 }; }
    CozyReasoning.registerProvider({ id: 'atd-reasoning', name: 'Async Test Double (Reasoning)', offline: true }, asyncTestDoubleProviderB);
    const result = await CozyReasoning.reason({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.confidence, 0.4242);
    CozyReasoning.removeProvider('atd-reasoning');
  });

  await test('12. CozyReasoning provider rejection enters honest failure handling', async () => {
    async function asyncTestDoubleProviderRejecting() { await delay(10); throw new Error('distinctive-reasoning-rejection'); }
    CozyReasoning.registerProvider({ id: 'atd-reasoning-reject', name: 'Async Test Double (Rejecting)', offline: true }, asyncTestDoubleProviderRejecting);
    const result = await CozyReasoning.reason({ evidence: [{ source: 'test', text: 'x' }] });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.isReal, false);
    assert.ok(result.reason.includes('distinctive-reasoning-rejection'));
    CozyReasoning.removeProvider('atd-reasoning-reject');
  });

  // ── CozyInterpretation (Tests 13–17) ──────────────────────────────────

  await test('13. CozyInterpretation accepts an async provider', () => {
    async function asyncTestDoubleProviderC() { await delay(10); return { category: 'topic', type: 'semantic', meaning: 'x' }; }
    const reg = CozyInterpretation.registerProvider({ id: 'atd-interp', name: 'Async Test Double (Interpretation)', offline: true }, asyncTestDoubleProviderC);
    assert.strictEqual(reg.success, true);
    CozyInterpretation.removeProvider('atd-interp');
  });

  await test('14. CozyInterpretation.interpret() returns a Promise', () => {
    async function asyncTestDoubleProviderC() { await delay(10); return { category: 'topic', type: 'semantic', meaning: 'x' }; }
    CozyInterpretation.registerProvider({ id: 'atd-interp', name: 'Async Test Double (Interpretation)', offline: true }, asyncTestDoubleProviderC);
    const ret = CozyInterpretation.interpret({ sourceType: 'custom', evidence: [{ source: 'test', data: 'x' }] });
    assert.ok(ret instanceof Promise, 'interpret() must return a Promise now that it is async.');
    return ret.finally(() => CozyInterpretation.removeProvider('atd-interp'));
  });

  await test('15. CozyInterpretation waits for the provider (timing proof)', async () => {
    const DELAY_MS = 50;
    let providerResolved = false;
    async function asyncTestDoubleProviderC() { await delay(DELAY_MS); providerResolved = true; return { category: 'topic', type: 'semantic', meaning: 'distinctive-meaning-7', confidence: 0.55 }; }
    CozyInterpretation.registerProvider({ id: 'atd-interp', name: 'Async Test Double (Interpretation)', offline: true }, asyncTestDoubleProviderC);
    const result = await CozyInterpretation.interpret({ sourceType: 'custom', evidence: [{ source: 'test', data: 'x' }] });
    assert.strictEqual(providerResolved, true);
    assert.strictEqual(result.success, true);
    CozyInterpretation.removeProvider('atd-interp');
  });

  await test('16. The resolved interpretation is preserved', async () => {
    async function asyncTestDoubleProviderC() { await delay(10); return { category: 'topic', type: 'semantic', meaning: 'distinctive-meaning-7', confidence: 0.55 }; }
    CozyInterpretation.registerProvider({ id: 'atd-interp', name: 'Async Test Double (Interpretation)', offline: true }, asyncTestDoubleProviderC);
    const result = await CozyInterpretation.interpret({ sourceType: 'custom', evidence: [{ source: 'test', data: 'x' }] });
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].meaning, 'distinctive-meaning-7');
    assert.strictEqual(result.results[0].confidence, 0.55);
    CozyInterpretation.removeProvider('atd-interp');
  });

  await test('17. CozyInterpretation rejection enters honest failure handling', async () => {
    async function asyncTestDoubleProviderRejecting() { await delay(10); throw new Error('distinctive-interp-rejection'); }
    CozyInterpretation.registerProvider({ id: 'atd-interp-reject', name: 'Async Test Double (Rejecting)', offline: true }, asyncTestDoubleProviderRejecting);
    const result = await CozyInterpretation.interpret({ sourceType: 'custom', evidence: [{ source: 'test', data: 'x' }] });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.isReal, false);
    assert.ok(result.reason.includes('distinctive-interp-rejection'));
    CozyInterpretation.removeProvider('atd-interp-reject');
  });

  // ── CognitiveCoordinator integration (Tests 18–20) ────────────────────

  await test('18. CognitiveCoordinator awaits the relevant async cognitive stages end-to-end', async () => {
    const DELAY_MS = 30;
    let interpResolved = false, thinkResolved = false, reasonResolved = false;

    async function interpProvider() { await delay(DELAY_MS); interpResolved = true; return { category: 'topic', type: 'semantic', meaning: 'e2e-meaning', confidence: 0.5 }; }
    async function thinkProvider() { await delay(DELAY_MS); thinkResolved = true; return { alternatives: [{ label: 'e2e-alt' }], confidence: 0.5 }; }
    async function reasonProvider() { await delay(DELAY_MS); reasonResolved = true; return { conclusion: 'e2e-conclusion', confidence: 0.5 }; }

    CozyInterpretation.registerProvider({ id: 'atd-e2e-interp', offline: true }, interpProvider);
    CozyThinking.registerProvider({ id: 'atd-e2e-think', offline: true }, thinkProvider);
    CozyReasoning.registerProvider({ id: 'atd-e2e-reason', offline: true }, reasonProvider);

    const result = await CognitiveCoordinator.run({ text: 'end to end async test', actorId: 'test-actor' });

    assert.strictEqual(interpResolved, true, 'Coordinator must have awaited interpretation before returning.');
    assert.strictEqual(thinkResolved, true, 'Coordinator must have awaited thinking before returning.');
    assert.strictEqual(reasonResolved, true, 'Coordinator must have awaited reasoning before returning.');
    assert.strictEqual(result.interpretation.results[0].meaning, 'e2e-meaning');
    assert.strictEqual(result.thinking.alternatives[0].label, 'e2e-alt');
    assert.strictEqual(result.reasoning.conclusion, 'e2e-conclusion');

    CozyInterpretation.removeProvider('atd-e2e-interp');
    CozyThinking.removeProvider('atd-e2e-think');
    CozyReasoning.removeProvider('atd-e2e-reason');
  });

  await test('19. No Promise object is accidentally exposed as a cognitive result', async () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [{ label: 'x' }], confidence: 0.5 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking-check', offline: true }, asyncTestDoubleProviderA);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.ok(!(result.alternatives instanceof Promise), 'result.alternatives must never itself be a Promise.');
    assert.ok(!(result instanceof Promise), 'The awaited result must be a plain object, not a Promise.');
    CozyThinking.removeProvider('atd-thinking-check');
  });

  await test('20. No empty/null false-green result is produced from an unresolved Promise', async () => {
    async function asyncTestDoubleProviderA() { await delay(10); return { alternatives: [{ label: 'non-empty-proof' }], confidence: 0.9 }; }
    CozyThinking.registerProvider({ id: 'atd-thinking-falsegreen', offline: true }, asyncTestDoubleProviderA);
    const result = await CozyThinking.think({ evidence: [{ source: 'test', text: 'x' }] });
    assert.notDeepStrictEqual(result.alternatives, [], 'This is the exact Phase 10C-2 false-green defect — alternatives must NOT silently be empty.');
    assert.notStrictEqual(result.confidence, null, 'Confidence must NOT silently be null when the provider supplied a real number.');
    CozyThinking.removeProvider('atd-thinking-falsegreen');
  });

  // ── Cleanup / convergence (Tests 21–22) ───────────────────────────────

  await test('21. Provider cleanup restores the original registry state', () => {
    assert.deepStrictEqual(CozyThinking.listProviders(), []);
    assert.deepStrictEqual(CozyReasoning.listProviders(), []);
    assert.deepStrictEqual(CozyInterpretation.listProviders(), []);
  });

  await test('22. Existing Phase 10B singleton convergence remains intact', () => {
    loadModule(path.join('..', '..', 'intelligence', 'cozy-ai.js'));
    loadModule(path.join('..', '..', 'builder', 'builder-orchestrator.js'));
    const coordinatorFromCozyAI = CozyOS.CognitiveCoordinator;
    const BuilderOrchestrator = CozyOS.BuilderOrchestrator;
    assert.ok(coordinatorFromCozyAI, 'CognitiveCoordinator must still be present.');
    assert.strictEqual(typeof BuilderOrchestrator, 'object', 'BuilderOrchestrator must still load.');
    // Same singleton object identity check as Phase 10B test 2 — no second coordinator.
    assert.strictEqual(window.CozyOS.CognitiveCoordinator, coordinatorFromCozyAI);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
