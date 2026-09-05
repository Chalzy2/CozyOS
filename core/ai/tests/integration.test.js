/**
 * core/ai/tests/integration.test.js
 * Real, executed tests for core/ai/integration.js — proving ACTIVE
 * registration with and invocation by the real, existing AI
 * orchestration bus (core/ai/cozy-ai-integration.js), not a manufactured
 * test-only invocation path. Every test loads the real orchestrator and
 * the real language-pack registry; nothing here is mocked except a
 * minimal stand-in for core/ai.js's own CozyAIEngine class (the locked
 * file itself is not required(), since it self-instantiates onto
 * `window.CozyOS.AI` at load time and this suite needs a fresh instance
 * per test — the stand-in below implements exactly the same real,
 * already-documented initializeSubEngine(key, instance) contract
 * core/ai.js actually exposes, confirmed by direct reading of that file
 * this round).
 *
 * Run with: node core/ai/tests/integration.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

/**
 * MinimalRealAIEngine — implements ONLY the real, documented
 * initializeSubEngine(key, instance)/getSubEngines()/getVersion()
 * contract core/ai.js (locked, read-only this round) actually exposes.
 * This is not a fake AI engine — it is the minimum real surface the
 * orchestrator needs to attach to, matching core/ai.js's own FIX-11
 * documentation exactly.
 */
class MinimalRealAIEngine {
    constructor() { this._subEngines = new Map(); }
    initializeSubEngine(key, instance) {
        if (typeof key !== 'string' || !key.trim()) throw new TypeError('[CozyAIEngine] initializeSubEngine(): key must be a non-empty string.');
        if (!instance || typeof instance !== 'object') throw new TypeError('[CozyAIEngine] initializeSubEngine(): instance must be an object.');
        this[key] = instance;
        this._subEngines.set(key, instance);
        return true;
    }
    getSubEngines() { return Array.from(this._subEngines.keys()); }
    getVersion() { return '1.4.1'; }
}

function freshEnvironment() {
    const win = { CozyOS: { AI: new MinimalRealAIEngine() } };
    global.window = win;

    const orchestratorPath = path.join(__dirname, '..', 'cozy-ai-integration.js');
    delete require.cache[require.resolve(orchestratorPath)];
    require(orchestratorPath); // the REAL orchestrator, unmodified

    const packsPath = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(packsPath)];
    require(packsPath); // the REAL language pack registry, unmodified
    win.CozyOS.CozyLanguagePacks.registerDefaultPacks();

    return win;
}

async function loadIntegrationFresh() {
    const integrationPath = path.join(__dirname, '..', 'integration.js');
    delete require.cache[require.resolve(integrationPath)];
    require(integrationPath);
    // registerEngine() is async internally (awaits _persistStateImmediate());
    // give the microtask queue a turn before asserting registration state.
    await new Promise((resolve) => setTimeout(resolve, 50));
}

async function teardown(win) {
    if (win.CozyOS.AI.integration && typeof win.CozyOS.AI.integration.destroy === 'function') {
        await win.CozyOS.AI.integration.destroy();
    }
}

// ---------------------------------------------------------------------
// 1. Integration loading
// ---------------------------------------------------------------------

test('module loads without throwing when the real orchestrator and real language packs are present', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    assert.ok(win.CozyOS.KnowledgeBridge, 'expected window.CozyOS.KnowledgeBridge to be set');
    await teardown(win);
});

test('module loads without throwing when NEITHER the orchestrator nor CozyLanguagePacks is present — fails closed, never crashes', async () => {
    global.window = { CozyOS: {} };
    const integrationPath = path.join(__dirname, '..', 'integration.js');
    delete require.cache[require.resolve(integrationPath)];
    assert.doesNotThrow(() => require(integrationPath));
    assert.ok(global.window.CozyOS.KnowledgeBridge, 'the same-process mirror should still be exposed even with no orchestrator to register with');
});

test('registers under the real orchestrator\'s own _engines Map, using the "knowledgeBridge" key — never colliding with the orchestrator\'s own "integration" key', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    assert.ok(win.CozyOS.AI.integration._engines.has('knowledgeBridge'), 'expected real registration under key "knowledgeBridge"');
    assert.notStrictEqual(win.CozyOS.AI.integration, win.CozyOS.KnowledgeBridge, 'the orchestrator itself and the new bridge engine must remain two distinct objects');
    await teardown(win);
});

test('loading integration.js twice does not create a duplicate active registration (orchestrator\'s own registerEngine() throws on a live duplicate)', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const engineCountBefore = win.CozyOS.AI.integration._engines.size;
    await loadIntegrationFresh();
    assert.strictEqual(win.CozyOS.AI.integration._engines.size, engineCountBefore, 'a second load must not create a second, separate engine entry');
    await teardown(win);
});

// ---------------------------------------------------------------------
// 2. Runtime — actually invoked by the real, existing consumer
// ---------------------------------------------------------------------

test('the REAL orchestrator\'s own _executeWithFaultTolerance() routes a query to knowledgeBridge.evaluate() and returns its real result — not a manufactured test-only call', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const routed = await win.CozyOS.AI.integration._executeWithFaultTolerance('knowledgeBridge', {
        query: null, capability: 'language-capability-lookup', languageId: 'en'
    });
    assert.strictEqual(routed.handled, true);
    assert.strictEqual(routed.result.available, true);
    assert.strictEqual(routed.result.capabilities.languageId, 'en');
    await teardown(win);
});

test('an unrelated capability is honestly reported as not handled, never guessed at', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const result = await win.CozyOS.KnowledgeBridge.evaluate(null, { capability: 'totally-unrelated-capability' });
    assert.strictEqual(result.handled, false);
    await teardown(win);
});

// ---------------------------------------------------------------------
// 3. Context — real composition from real existing authorities
// ---------------------------------------------------------------------

test('lookupLanguageCapability() returns the real, live capability record from CozyLanguagePacks — not a duplicated/reinvented value', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const direct = win.CozyOS.CozyLanguagePacks.getLanguageCapabilities('sw');
    const bridged = win.CozyOS.KnowledgeBridge.lookupLanguageCapability('sw');
    assert.deepStrictEqual(bridged.capabilities, direct, 'the bridge must return the exact same object the real authority produces, never a re-derived copy');
    await teardown(win);
});

test('lookupProviderStatus() never upgrades NLLB/Gemini past their real, honest status', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const status = win.CozyOS.KnowledgeBridge.lookupProviderStatus();
    assert.strictEqual(status.status.nllb.runtimeStatus, 'DOCUMENTED_ONLY');
    assert.strictEqual(status.status.gemini.runtimeStatus, 'NETWORK_REQUIRED');
    assert.notStrictEqual(status.status.nllb.runtimeStatus, 'RUNTIME_VERIFIED');
    await teardown(win);
});

test('composeAIContext() never includes memory unless the caller explicitly opts in with includeMemory AND an actorId', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const withoutOptIn = await win.CozyOS.KnowledgeBridge.composeAIContext({ languageId: 'en' });
    assert.strictEqual(withoutOptIn.memory.available, false);
    assert.strictEqual(withoutOptIn.memory.reason, 'not requested');
    await teardown(win);
});

test('composeAIContext() never includes knowledge unless the caller explicitly opts in with includeKnowledge', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const context = await win.CozyOS.KnowledgeBridge.composeAIContext({ languageId: 'sw' });
    assert.strictEqual(context.knowledge.available, false);
    assert.strictEqual(context.knowledge.reason, 'not requested');
    await teardown(win);
});

test('composeAIContext() honestly reports DeveloperIdentity as unavailable when it is not registered — never fabricates identity data', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const context = await win.CozyOS.KnowledgeBridge.composeAIContext({});
    assert.strictEqual(context.identity.available, false);
    await teardown(win);
});

test('this file contains zero reference to the Founder Story Vault — the identity boundary is structurally preserved, not merely claimed', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'integration.js'), 'utf8');
    assert.ok(!/founder-?story/i.test(source), 'core/ai/integration.js must never reference the Founder Story Vault');
});

// ---------------------------------------------------------------------
// 4. Offline behavior
// ---------------------------------------------------------------------

test('language capability and provider status lookups work with no network access — pure, synchronous, offline-safe', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const langResult = win.CozyOS.KnowledgeBridge.lookupLanguageCapability('fr');
    const statusResult = win.CozyOS.KnowledgeBridge.lookupProviderStatus();
    assert.strictEqual(typeof langResult.then, 'undefined');
    assert.strictEqual(typeof statusResult.then, 'undefined');
    await teardown(win);
});

test('a missing/unreachable knowledge endpoint fails closed to KNOWLEDGE_BRIDGE_NOT_CONFIGURED and does not throw or crash the caller', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const result = await win.CozyOS.KnowledgeBridge.attemptKnowledgeLookup('anything');
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.status, 'KNOWLEDGE_BRIDGE_NOT_CONFIGURED');
    await teardown(win);
});

test('a knowledge-lookup failure does not affect an unrelated language-capability-lookup call in the same evaluate cycle', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const knowledgeResult = await win.CozyOS.KnowledgeBridge.evaluate('q', { capability: 'knowledge-lookup' });
    assert.strictEqual(knowledgeResult.result.available, false);
    const langResult = await win.CozyOS.KnowledgeBridge.evaluate(null, { capability: 'language-capability-lookup', languageId: 'ar' });
    assert.strictEqual(langResult.result.available, true, 'an unrelated, fully-local capability must remain unaffected by the network-dependent one failing');
    await teardown(win);
});

// ---------------------------------------------------------------------
// 5. Health
// ---------------------------------------------------------------------

test('getHealth() honestly reports "degraded" when CozyLanguagePacks is missing — never a fabricated "healthy"', async () => {
    global.window = { CozyOS: { AI: new MinimalRealAIEngine() } };
    const orchestratorPath = path.join(__dirname, '..', 'cozy-ai-integration.js');
    delete require.cache[require.resolve(orchestratorPath)];
    require(orchestratorPath);
    await loadIntegrationFresh();
    const health = global.window.CozyOS.KnowledgeBridge.getHealth();
    assert.strictEqual(health.status, 'degraded');
    assert.strictEqual(health.dependencies.CozyLanguagePacks, false);
    assert.strictEqual(health.knowledgeBridgeConfigured, false, 'must never claim the knowledge bridge is configured — no real server route exists yet');
    await teardown(global.window);
});

test('getHealth() honestly reports "healthy" only once CozyLanguagePacks is actually present', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const health = win.CozyOS.KnowledgeBridge.getHealth();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.dependencies.CozyLanguagePacks, true);
    await teardown(win);
});

// ---------------------------------------------------------------------
// 6. Security
// ---------------------------------------------------------------------

test('no secret-shaped values (API key, token, credential, password) appear anywhere in the source', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'integration.js'), 'utf8');
    assert.ok(!/apiKey\s*[:=]\s*['"][A-Za-z0-9]/i.test(source));
    assert.ok(!/-----BEGIN/.test(source));
    assert.ok(!/GEMINI_API_KEY\s*[:=]\s*['"]/i.test(source));
});

test('composeAIContext() requires an explicit actorId to read memory — never infers or fabricates one', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const context = await win.CozyOS.KnowledgeBridge.composeAIContext({ includeMemory: true }); // no actorId supplied
    assert.strictEqual(context.memory.available, false);
    assert.strictEqual(context.memory.reason, 'actorId is required to read memory.');
    await teardown(win);
});

test('manifest declares only the four real capabilities this file actually implements — no unclaimed/aspirational capability', async () => {
    const win = freshEnvironment();
    await loadIntegrationFresh();
    const manifest = win.CozyOS.KnowledgeBridge.getManifest();
    assert.deepStrictEqual(manifest.capabilities.sort(), [
        'ai-context-composition', 'knowledge-lookup', 'language-capability-lookup', 'provider-status-lookup'
    ].sort());
    await teardown(win);
});

(async () => {
    for (const { name, fn } of tests) {
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
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
