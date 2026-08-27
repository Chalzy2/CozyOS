/**
 * core/modules/intelligence/tests/cozy-ai-context.test.js
 * MICRO-MILESTONE F — Context Integration & Intelligent Retrieval
 *
 * Real, executed tests for CozyAI.getContext() (core/modules/
 * intelligence/cozy-ai.js). Loads the real CozyMemory engine, the real
 * Vault/FounderStory chain (same helper pattern as
 * core/modules/intelligence/providers/tests/rule-based-conversational-
 * provider-project-knowledge.test.js), the real CozyKnowledge registry,
 * and the real CozyAI facade together — no mocked memory/story engine,
 * so these tests exercise the genuine visibility/evidence logic, not a
 * stand-in.
 *
 * Run with: node core/modules/intelligence/tests/cozy-ai-context.test.js
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

function makeFakeDeveloperIdentity() {
    return { answerWhoCreatedYou() { return { known: true, answer: 'CozyOS was founded by Test Founder.' }; } };
}
function makeFakeServiceRegistry() {
    return { listApplications: () => [{ id: 'mpesaos', name: 'MpesaOS' }] };
}
function makeFakeProviderManager() {
    return { register() {}, healthReport: () => ({}) };
}
/** Real org-isolation source: CozyMemory's own #checkReadVisibility() reads window.CozyOS.IdentityEngine.getUser(actorId).orgId — same contract as the real IdentityEngine. */
function makeFakeIdentityEngine(users) {
    return { getUser: (actorId) => users[actorId] || null };
}

const roots = {
    secretRegistry: path.join(__dirname, '..', '..', 'vault', 'secret-registry.js'),
    encryptionManager: path.join(__dirname, '..', '..', 'vault', 'encryption-manager.js'),
    secretManager: path.join(__dirname, '..', '..', 'vault', 'secret-manager.js'),
    typedManagers: path.join(__dirname, '..', '..', 'vault', 'typed-managers.js'),
    rotationHealth: path.join(__dirname, '..', '..', 'vault', 'rotation-and-health.js'),
    vaultEngine: path.join(__dirname, '..', '..', 'vault', 'cozy-vault-engine.js'),
    founderStory: path.join(__dirname, '..', '..', 'founder-story', 'founder-story-engine.js'),
    knowledgeRegistry: path.join(__dirname, '..', 'knowledge', 'cozy-knowledge-registry.js'),
    memoryEngine: path.join(__dirname, '..', '..', 'memory', 'cozy-memory-engine.js'),
    cozyAi: path.join(__dirname, '..', 'cozy-ai.js')
};

/**
 * Loads the real CozyMemory + Vault/FounderStory + CozyKnowledge + CozyAI
 * stack fresh for each test (module cache cleared, new window each time —
 * same isolation discipline the rest of this repo's tests use).
 */
function loadFullStack(extraCozyOS) {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const fakeWindow = {
        CozyOS: Object.assign({
            DeveloperIdentity: makeFakeDeveloperIdentity(),
            ServiceRegistry: makeFakeServiceRegistry(),
            ProviderManager: makeFakeProviderManager()
        }, extraCozyOS),
        addEventListener: () => {}, dispatchEvent: () => {}
    };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }
    [roots.secretRegistry, roots.encryptionManager, roots.secretManager, roots.typedManagers, roots.rotationHealth,
     roots.vaultEngine, roots.founderStory, roots.knowledgeRegistry, roots.memoryEngine, roots.cozyAi
    ].forEach((p) => require(p));
    return {
        window: fakeWindow,
        ai: fakeWindow.CozyOS.CozyAI,
        memory: fakeWindow.CozyOS.CozyMemory,
        founderStory: fakeWindow.CozyOS.FounderStory,
        knowledge: fakeWindow.CozyOS.CozyKnowledge
    };
}

/** Publishes a real, genuine public+published FounderStory chapter (same helper shape as the provider's project-knowledge tests). */
async function publishRealStory(fs, ownerId, category, chapterBody) {
    const story = await fs.createStory(ownerId, { title: category, category });
    await fs.setVisibility(story.storyId, ownerId, 'public');
    await fs.addChapter(story.storyId, ownerId, { title: category, body: chapterBody, status: 'published' });
    await fs.setStatus(story.storyId, ownerId, 'published');
    return story;
}

console.log('CozyAI.getContext() — Micro-Milestone F tests\n');

(async () => {

/* ===================================================================
   1. PUBLIC STORY RETRIEVAL
=================================================================== */
await test('1. Public Story retrieval: a real published vision chapter comes back tagged authority "public-story"', async () => {
    const { ai, founderStory } = loadFullStack();
    await publishRealStory(founderStory, 'owner1', 'vision', 'CozyOS exists to bring offline-first AI to every community.');
    const ctx = await ai.getContext('What is the vision of CozyOS?', { actorId: 'anyone' });
    assert.strictEqual(ctx.found, true);
    const hit = ctx.results.find((r) => r.authority === 'public-story');
    assert.ok(hit, 'expected a public-story result');
    assert.strictEqual(hit.content, 'CozyOS exists to bring offline-first AI to every community.');
    assert.strictEqual(hit.provenance, 'window.CozyOS.FounderStory');
    assert.strictEqual(hit.evidence, 'VERIFIED');
});

/* ===================================================================
   2. KNOWLEDGE RETRIEVAL
=================================================================== */
await test('2. Knowledge retrieval: an architecture-style question resolves via CozyKnowledge, tagged "knowledge-registry"', async () => {
    const { ai } = loadFullStack();
    const ctx = await ai.getContext('What applications exist in this architecture?', { actorId: 'anyone' });
    const hit = ctx.results.find((r) => r.authority === 'knowledge-registry' && r.getter === 'listApplicationsFact');
    assert.ok(hit, 'expected a knowledge-registry result from listApplicationsFact');
    assert.ok(hit.provenance, 'expected the real underlying source (e.g. window.CozyOS.ServiceRegistry) to be preserved');
});

/* ===================================================================
   3. COZYMEMORY RETRIEVAL
=================================================================== */
await test('3. CozyMemory retrieval: a real saved decision is found and tagged "cozy-memory"', async () => {
    const { ai, memory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'decision-1', 'We chose SQLite for offline sync.',
        { actorId: 'alice', owner: 'alice', visibility: 'public' });
    const ctx = await ai.getContext('What was the decision about sync?', { actorId: 'alice' });
    const hit = ctx.results.find((r) => r.authority === 'cozy-memory' && r.key === 'decision-1');
    assert.ok(hit, 'expected the saved decision to be retrieved');
    assert.strictEqual(hit.content, 'We chose SQLite for offline sync.');
    assert.strictEqual(hit.namespace, 'cozy-ai-learning');
});

/* ===================================================================
   4. LIVING MEMORY RETRIEVAL
=================================================================== */
await test('4. Living Memory retrieval: an entry under a real "living-" namespace is found and tagged "living-memory"', async () => {
    const { ai, memory } = loadFullStack();
    memory.saveMemory('living-transactions', 'txn-1', { op: 'sync', status: 'ok' },
        { actorId: 'system', owner: null, visibility: 'public' });
    const ctx = await ai.getContext('any sync transactions?', { actorId: 'alice' });
    const hit = ctx.results.find((r) => r.authority === 'living-memory' && r.key === 'txn-1');
    assert.ok(hit, 'expected the living-transactions entry to be retrieved');
    assert.strictEqual(hit.namespace, 'living-transactions');
    assert.ok(/living-runtime\.js/.test(hit.provenance));
});

/* ===================================================================
   5. PRIVATE STORY DENIED
=================================================================== */
await test('5. Private Story denied: an only-me+published chapter never appears, even when its owner asks', async () => {
    const { ai, founderStory } = loadFullStack();
    const story = await founderStory.createStory('owner5', { title: 'origin', category: 'project-origin' });
    await founderStory.addChapter(story.storyId, 'owner5', { title: 'origin', body: 'PRIVATE — must never leak.', status: 'published' });
    await founderStory.setStatus(story.storyId, 'owner5', 'published');
    // visibility left at its default (only-me) — never made public
    const ctx = await ai.getContext('Why was CozyOS started?', { actorId: 'owner5' });
    const leaked = ctx.results.some((r) => typeof r.content === 'string' && r.content.includes('PRIVATE'));
    assert.strictEqual(leaked, false, 'private story content must never be exposed through getContext()');
});

await test('5b. Private Story denied: getContext() never calls FounderStory\'s private read path at all', async () => {
    const { window, memory } = loadFullStack();
    let privateReadCalled = false;
    const realFounderStory = window.CozyOS.FounderStory;
    window.CozyOS.FounderStory = new Proxy(realFounderStory, {
        get(target, prop) {
            if (prop === 'getChapter' || prop === 'canView' || prop === 'canViewChapter') privateReadCalled = true;
            return target[prop];
        }
    });
    delete require.cache[require.resolve(roots.knowledgeRegistry)];
    delete require.cache[require.resolve(roots.cozyAi)];
    require(roots.knowledgeRegistry);
    require(roots.cozyAi);
    await window.CozyOS.CozyAI.getContext('Why was CozyOS started?', { actorId: 'nobody' });
    assert.strictEqual(privateReadCalled, false, 'getContext() must never touch FounderStory.getChapter/canView/canViewChapter');
});

/* ===================================================================
   6. MISSING CONTEXT — HONEST EMPTY STATE
=================================================================== */
await test('6. Missing context returns an honest empty state, never a fabricated answer', async () => {
    const { ai } = loadFullStack();
    const ctx = await ai.getContext('completely unrelated gibberish xyz123');
    assert.strictEqual(ctx.found, false);
    assert.deepStrictEqual(ctx.results, []);
    assert.ok(/honest empty state/.test(ctx.note));
});

/* ===================================================================
   7. PROVENANCE PRESERVED
=================================================================== */
await test('7. Provenance preserved: every result names its authority, provenance, and (for memory) owner/visibility/savedBy', async () => {
    const { ai, memory, founderStory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'fact-1', 'a real fact', { actorId: 'alice', owner: 'alice', visibility: 'public' });
    await publishRealStory(founderStory, 'owner7', 'mission', 'Our real published mission.');
    const ctx = await ai.getContext('mission fact', { actorId: 'alice' });
    assert.ok(ctx.results.length > 0);
    for (const r of ctx.results) {
        assert.ok(r.authority, 'every result must carry an authority');
        assert.ok(r.provenance, 'every result must carry a provenance');
        if (r.authority === 'cozy-memory' || r.authority === 'living-memory') {
            assert.ok('owner' in r && 'visibility' in r && 'savedBy' in r, 'memory results must carry ownership/visibility metadata');
        }
    }
});

/* ===================================================================
   8. ORGANIZATION ISOLATION
=================================================================== */
await test('8. Organization isolation: an "organisation"-visibility entry is only returned within the same org', async () => {
    const identity = makeFakeIdentityEngine({
        ownerX: { orgId: 'org-A' },
        sameOrgUser: { orgId: 'org-A' },
        otherOrgUser: { orgId: 'org-B' }
    });
    const { ai, memory } = loadFullStack({ IdentityEngine: identity });
    memory.saveMemory('cozy-ai-learning', 'org-fact', 'internal roadmap note',
        { actorId: 'ownerX', owner: 'ownerX', visibility: 'organisation' });

    const sameOrgCtx = await ai.getContext('roadmap note', { actorId: 'sameOrgUser' });
    assert.ok(sameOrgCtx.results.some((r) => r.key === 'org-fact'), 'same-org actor should see the organisation-visibility entry');

    const otherOrgCtx = await ai.getContext('roadmap note', { actorId: 'otherOrgUser' });
    assert.ok(!otherOrgCtx.results.some((r) => r.key === 'org-fact'), 'different-org actor must NOT see the organisation-visibility entry');
});

/* ===================================================================
   9. UNAUTHORIZED RETRIEVAL DENIED
=================================================================== */
await test('9. Unauthorized retrieval denied: a private entry owned by someone else is never returned to another actor', async () => {
    const { ai, memory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'secret-1', 'private note', { actorId: 'bob', owner: 'bob', visibility: 'private' });
    const ctx = await ai.getContext('private note', { actorId: 'mallory' });
    assert.ok(!ctx.results.some((r) => r.key === 'secret-1'));
});

await test('9b. Unauthorized retrieval denied: getContext() never defaults an unidentified caller to "system"-level access', async () => {
    const { ai, memory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'secret-2', 'another private note', { actorId: 'bob', owner: 'bob', visibility: 'private' });
    const ctx = await ai.getContext('private note'); // no actorId supplied at all
    assert.strictEqual(ctx.actorId, 'anonymous', 'an absent actorId must resolve to a real, unprivileged identity, never "system"');
    assert.ok(!ctx.results.some((r) => r.key === 'secret-2'));
});

/* ===================================================================
   10. EXISTING COZYMEMORY COMPATIBILITY
=================================================================== */
await test('10. Existing CozyMemory compatibility: pre-existing CozyMemory read paths behave exactly as before', async () => {
    const { memory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'compat-1', 'unchanged behavior', { actorId: 'system', visibility: 'private' });
    // readMemory()/recall() defaulting actorId to "system" is CozyMemory's own
    // pre-existing, disclosed behavior — getContext() must not have touched it.
    const read = memory.readMemory('cozy-ai-learning', 'compat-1');
    assert.strictEqual(read.value, 'unchanged behavior');
    const recalled = memory.recall('cozy-ai-learning', 'unchanged');
    assert.strictEqual(recalled.length, 1);
});

await test('10b. Existing CozyMemory compatibility: pre-existing CozyAI methods (learn/remember/search/summarize) are unaffected', async () => {
    const { ai } = loadFullStack();
    const learned = ai.learn({ key: 'k1', value: 'v1', actorId: 'system', visibility: 'public' });
    assert.strictEqual(learned.success, true);
    const remembered = ai.remember('k2', 'v2', { actorId: 'system', visibility: 'public' });
    assert.strictEqual(remembered.success, true);
    const searched = ai.search('v1', { actorId: 'system' });
    assert.strictEqual(searched.success, true);
    const summary = ai.summarize('One sentence. Another sentence.', { maxSentences: 1 });
    assert.strictEqual(summary.success, true);
    assert.strictEqual(summary.summary, 'One sentence.');
});

/* ===================================================================
   SUMMARY
=================================================================== */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

})();
