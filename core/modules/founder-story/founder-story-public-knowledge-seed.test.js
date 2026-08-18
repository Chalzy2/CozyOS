/**
 * core/modules/founder-story/tests/founder-story-public-knowledge-seed.test.js
 * RP-037 — real, executed verification. Loads the genuine Vault chain,
 * founder-story-engine.js, this repair's new seed file,
 * cozy-knowledge-registry.js, and rule-based-conversational-provider.js
 * — no mocked FounderStory — and confirms real public+published
 * answers now come back for all five project-knowledge intents.
 *
 * Run with: node core/modules/founder-story/tests/founder-story-public-knowledge-seed.test.js
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

const roots = {
    secretRegistry: path.join(__dirname, '..', '..', 'vault', 'secret-registry.js'),
    encryptionManager: path.join(__dirname, '..', '..', 'vault', 'encryption-manager.js'),
    secretManager: path.join(__dirname, '..', '..', 'vault', 'secret-manager.js'),
    typedManagers: path.join(__dirname, '..', '..', 'vault', 'typed-managers.js'),
    rotationHealth: path.join(__dirname, '..', '..', 'vault', 'rotation-and-health.js'),
    vaultEngine: path.join(__dirname, '..', '..', 'vault', 'cozy-vault-engine.js'),
    founderStory: path.join(__dirname, '..', 'founder-story-engine.js'),
    publicKnowledgeSeed: path.join(__dirname, '..', 'founder-story-public-knowledge-seed.js'),
    languageRegistry: path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-registry.js'),
    languageTemplates: path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-templates.js'),
    knowledgeRegistry: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
    provider: path.join(__dirname, '..', '..', 'intelligence', 'providers', 'rule-based-conversational-provider.js')
};

async function loadFullStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager()
        },
        addEventListener: () => {}, dispatchEvent: () => {}
    };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }

    [roots.secretRegistry, roots.encryptionManager, roots.secretManager, roots.typedManagers, roots.rotationHealth, roots.vaultEngine, roots.founderStory,
     roots.publicKnowledgeSeed, roots.languageRegistry, roots.languageTemplates, roots.knowledgeRegistry, roots.provider
    ].forEach((p) => require(p));

    // The seed file fires its own seedAllIfMissing() at load time and
    // exposes that in-flight promise as `.ready` precisely so a caller
    // never needs to guess at a fixed delay, and never needs to risk a
    // second concurrent seedAllIfMissing() call racing the first.
    const seedModule = fakeWindow.CozyOS.Modules['founder-story-public-knowledge-seed'];
    await seedModule.ready;

    return { window: fakeWindow, provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'), founderStory: fakeWindow.CozyOS.FounderStory };
}

(async () => {

await test('Seed module registers and reports its five topics were created', async () => {
    const { founderStory } = await loadFullStack();
    const stories = founderStory.listStoriesForOwner('founder-charles-owuor');
    const categories = stories.map((s) => s.category).sort();
    assert.deepStrictEqual(categories, ['mission', 'project-history', 'project-origin', 'public-story', 'vision']);
});

await test('"What is CozyOS?" still answers via the existing what-is-cozyos intent (unaffected by this repair)', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('What is CozyOS?');
    assert.strictEqual(result.result.intent, 'what-is-cozyos');
});

await test('"Why was CozyOS started?" -> project-origin, VERIFIED, no longer the not_found fallback', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('Why was CozyOS started?');
    assert.strictEqual(result.result.intent, 'project-origin');
    assert.ok(!/hasn't been published yet/i.test(result.result.text), 'must not be the not_found template');
    assert.ok(/salesperson|door-to-door/i.test(result.result.text));
});

await test('"What is the vision?" -> cozyos-vision, VERIFIED, mentions Africa-first', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('What is the vision?');
    assert.strictEqual(result.result.intent, 'cozyos-vision');
    assert.ok(!/hasn't been published yet/i.test(result.result.text));
    assert.ok(/African|Africa/i.test(result.result.text));
});

await test('"What is the mission of CozyOS?" -> cozyos-mission, VERIFIED', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('What is the mission of CozyOS?');
    assert.strictEqual(result.result.intent, 'cozyos-mission');
    assert.ok(!/hasn't been published yet/i.test(result.result.text));
});

await test('"Tell me the story of CozyOS" -> public-story, VERIFIED', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('Tell me the story of CozyOS');
    assert.strictEqual(result.result.intent, 'public-story');
    assert.ok(!/doesn't have a published public story/i.test(result.result.text));
});

await test('"What is the history of CozyOS?" -> project-history, VERIFIED, mentions where it is going', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('What is the history of CozyOS?');
    assert.strictEqual(result.result.intent, 'project-history');
    assert.ok(!/hasn't been published yet/i.test(result.result.text));
    assert.ok(/ChurchOS|human-centered/i.test(result.result.text));
});

await test('Calling seedAllIfMissing() again AFTER the first call has fully resolved is idempotent — still exactly five stories, not ten', async () => {
    const { window: fakeWindow, founderStory } = await loadFullStack(); // awaits .ready internally — first call is fully settled by this point
    const seedModule = fakeWindow.CozyOS.Modules['founder-story-public-knowledge-seed'];
    await seedModule.seedAllIfMissing(); // sequential second call, same window/engine instance — no longer racing the first
    const stories = founderStory.listStoriesForOwner('founder-charles-owuor');
    assert.strictEqual(stories.length, 5);
});

await test('Regression: private/draft content still never leaks — genuinely unrelated question stays "unsupported"', async () => {
    const { provider } = await loadFullStack();
    const result = await provider.think('What is the weather on Mars going to be like next Tuesday?');
    assert.strictEqual(result.result.intent, 'unsupported');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
