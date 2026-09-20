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
    return {
        answerWhoCreatedYou() { return { known: true, answer: 'CozyOS was founded by Test Founder.' }; },
        answerWhyCreated() { return { known: true, answer: 'CozyOS was created to solve real community problems.' }; }
    };
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
    publicKnowledgeSource: path.join(__dirname, '..', 'knowledge', 'cozy-public-knowledge-source.js'),
    memoryEngine: path.join(__dirname, '..', '..', 'memory', 'cozy-memory-engine.js'),
    businessWorkspace: path.join(__dirname, '..', '..', '..', 'plugins', 'interestOS-business-workspace.js'),
    cozyAi: path.join(__dirname, '..', 'cozy-ai.js'),
    identityFaqRouter: path.join(__dirname, '..', '..', 'knowledge', 'cozyos-identity-faq-router.js'),
    answerEngine: path.join(__dirname, '..', 'answer', 'cozy-answer-engine.js'),
    cozyLearn: path.join(__dirname, '..', '..', '..', 'living', 'cozy-learn.js')
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
     roots.vaultEngine, roots.founderStory, roots.knowledgeRegistry, roots.publicKnowledgeSource, roots.memoryEngine,
     roots.businessWorkspace, roots.cozyAi, roots.identityFaqRouter, roots.answerEngine, roots.cozyLearn
    ].forEach((p) => require(p));
    return {
        window: fakeWindow,
        ai: fakeWindow.CozyOS.CozyAI,
        memory: fakeWindow.CozyOS.CozyMemory,
        founderStory: fakeWindow.CozyOS.FounderStory,
        knowledge: fakeWindow.CozyOS.CozyKnowledge,
        workspace: fakeWindow.CozyOS.InterestOSBusinessWorkspace,
        answerEngine: fakeWindow.CozyOS.CozyAnswerEngine,
        learn: fakeWindow.CozyOS.CozyLearn
    };
}

/** A richer, real-shaped application registry (ChurchOS/InterestOS/QuarryOS + the default MpesaOS) for the named-application routing tests below. */
function makeMultiAppServiceRegistry() {
    return {
        listApplications: () => [
            { id: 'mpesaos', name: 'MpesaOS' },
            { id: 'churchos', name: 'ChurchOS' },
            { id: 'interestos', name: 'InterestOS' },
            { id: 'quarryos', name: 'QuarryOS' }
        ]
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
   11. LIVE WORSHIP SESSION COMPOSITION (LIVE INTEGRATION AUDIT addition)
=================================================================== */
function makeFakeWorshipSession(services) {
    return {
        getActiveService: (id) => services[id] ? { serviceId: id, orgId: services[id].orgId, sourceLanguage: services[id].sourceLanguage, activeLanguages: [], transcriptEntries: services[id].transcript.length } : null,
        getRecentTranscript: (id, { limit = 5 } = {}) => services[id] ? { available: true, entries: services[id].transcript.slice(-limit) } : { available: false },
        getServiceTimeline: (id) => services[id] ? { available: true, timeline: services[id].timeline || [], bibleReferences: services[id].bibleReferences || [] } : { available: false }
    };
}

await test('11. liveSessionId composes a real, VERIFIED "live-worship-session" result from ChurchWorshipSession', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({
            svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'Karibuni', at: 't1', language: 'sw' }], timeline: [{ sectionType: 'sermon', label: 'Faith', at: 't2' }], bibleReferences: [{ rawMatch: 'John 3:16' }] }
        })
    });
    const ctx = await ai.getContext('What did the pastor just say?', { actorId: 'viewer1', liveSessionId: 'svc1' });
    assert.strictEqual(ctx.found, true);
    const hit = ctx.results.find((r) => r.authority === 'live-worship-session');
    assert.ok(hit, 'expected a live-worship-session result');
    assert.strictEqual(hit.evidence, 'VERIFIED');
    assert.strictEqual(hit.liveSessionId, 'svc1');
    assert.match(hit.content, /Karibuni/);
    assert.match(hit.content, /sermon/);
    assert.match(hit.content, /John 3:16/);
});

await test('11b. an unknown/ended liveSessionId is silently skipped, never fabricated as live context', async () => {
    const { ai } = loadFullStack({ ChurchWorshipSession: makeFakeWorshipSession({}) });
    const ctx = await ai.getContext('What did the pastor just say?', { actorId: 'viewer1', liveSessionId: 'svc-does-not-exist' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-worship-session'), false);
});

await test('11c. no liveSessionId supplied: behavior is completely unaffected (backward compatible)', async () => {
    const { ai } = loadFullStack({ ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }) });
    const ctx = await ai.getContext('What did the pastor just say?', { actorId: 'viewer1' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-worship-session'), false);
});

await test('11d. ChurchWorshipSession not loaded: getContext() degrades honestly, never throws', async () => {
    const { ai } = loadFullStack();
    const ctx = await ai.getContext('What did the pastor just say?', { actorId: 'viewer1', liveSessionId: 'svc1' });
    assert.strictEqual(ctx.success, true);
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-worship-session'), false);
});

await test('11e. questions-enabled state is composed in via the real LDCE<->worship-service pairing (SUPPORT INTEGRATION fix)', async () => {
    // Regression test for a real, previously-silent bug: getContext()
    // used to call ChurchLiveModerationControls.getQuestionsEnabled()
    // with the raw worshipServiceId, but that file's own state is keyed
    // by the real LDCE sessionId (it calls ldce.getSession(sessionId)
    // internally) — always a miss, so the "Live questions..." line was
    // always reporting the default DISABLED state regardless of the
    // real host toggle. Fixed by resolving the real pairing via
    // ChurchLiveSessionController.getLdceSessionIdFor() first, the same
    // real pairing organization-workspace.js's own Toggle Questions
    // control already uses.
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveSessionController: { getLdceSessionIdFor: (worshipServiceId) => worshipServiceId === 'svc1' ? 'ldce_abc' : null },
        ChurchLiveModerationControls: { getQuestionsEnabled: (id) => id === 'ldce_abc' ? { status: 'OK', enabled: true } : { status: 'OK', enabled: false } }
    });
    const ctx = await ai.getContext('Can I ask the pastor a question?', { actorId: 'viewer1', liveSessionId: 'svc1' });
    const hit = ctx.results.find((r) => r.authority === 'live-worship-session');
    assert.match(hit.content, /ENABLED/);
});

await test('11f. no ChurchLiveSessionController loaded: questions-enabled line is honestly omitted, never a fabricated/default state', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveModerationControls: { getQuestionsEnabled: () => { throw new Error('must never be called without a real ldceSessionId'); } }
    });
    const ctx = await ai.getContext('Can I ask the pastor a question?', { actorId: 'viewer1', liveSessionId: 'svc1' });
    const hit = ctx.results.find((r) => r.authority === 'live-worship-session');
    assert.ok(hit, 'expected the live-worship-session result to still compose from transcript alone');
    assert.doesNotMatch(hit.content, /ENABLED|DISABLED/);
});

/* ===================================================================
   12. LIVE SUPPORT DIAGNOSTICS (SUPPORT INTEGRATION addition) — a
   THIRD, distinct authorization context (platform-admin + an active,
   scoped OrganizationSupport grant), consumed through the SAME
   getContext() call, never a second AI/context system. Every test
   below independently proves the participant and support contexts
   never mix.
=================================================================== */
function makeFakeSessionController(bundles) {
    return {
        getSessionBundle: (id) => bundles[id] || null,
        getLdceSessionIdFor: (id) => bundles[id] ? bundles[id].ldceSessionId : null,
    };
}
function makeFakeIdentityWithPlatformAdmin(adminIds) {
    return { isPlatformAdmin: (id) => adminIds.includes(id) };
}

await test('12a. a real platform admin with an active, correctly-scoped support grant sees the real live-support-diagnostics result', async () => {
    let recordedAction = null;
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveSessionController: makeFakeSessionController({ svc1: { orgId: 'org1', hostUserId: 'pastor1', ldceSessionId: 'ldce_abc' } }),
        IdentityEngine: makeFakeIdentityWithPlatformAdmin(['cozyos-admin-1']),
        OrganizationSupport: {
            isSupportActive: (orgId, operatorId, { requiredScope }) =>
                (orgId === 'org1' && operatorId === 'cozyos-admin-1' && requiredScope === 'inspect-live-session')
                    ? { active: true, grantId: 'grant-1' } : { active: false },
            recordSupportAction: (grantId, action, detail) => { recordedAction = { grantId, action, detail }; return { success: true }; }
        },
        LDCESessionEngine: { getSession: (id) => id === 'ldce_abc' ? { state: 'active' } : null, listParticipants: (id, requesterId) => (id === 'ldce_abc' && requesterId === 'pastor1') ? [{ userId: 'p1' }, { userId: 'p2' }] : [] },
        ChurchLiveModerationControls: { getSlowMode: () => ({ intervalMs: 0 }), getQuestionsEnabled: () => ({ status: 'OK', enabled: false }) }
    });
    const ctx = await ai.getContext('inspect this session', { actorId: 'cozyos-admin-1', liveSessionId: 'svc1', supportScope: 'inspect-live-session' });
    const hit = ctx.results.find((r) => r.authority === 'live-support-diagnostics');
    assert.ok(hit, 'expected a real live-support-diagnostics result for an authorized platform admin with an active grant');
    assert.strictEqual(hit.orgId, 'org1');
    assert.strictEqual(hit.grantId, 'grant-1');
    assert.match(hit.content, /2 participant/);
    assert.ok(recordedAction, 'expected the inspection to be recorded as a real, auditable support action');
    assert.strictEqual(recordedAction.grantId, 'grant-1');
    assert.strictEqual(recordedAction.action, 'live-context-inspected');
});

await test('12b. a platform admin with NO active support grant never sees live-support-diagnostics (fail-closed)', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveSessionController: makeFakeSessionController({ svc1: { orgId: 'org1', hostUserId: 'pastor1', ldceSessionId: 'ldce_abc' } }),
        IdentityEngine: makeFakeIdentityWithPlatformAdmin(['cozyos-admin-1']),
        OrganizationSupport: { isSupportActive: () => ({ active: false }) }
    });
    const ctx = await ai.getContext('inspect this session', { actorId: 'cozyos-admin-1', liveSessionId: 'svc1', supportScope: 'inspect-live-session' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-support-diagnostics'), false);
});

await test('12c. an ordinary (non-platform-admin) actor requesting supportScope never sees live-support-diagnostics, even with a real-looking scope string', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveSessionController: makeFakeSessionController({ svc1: { orgId: 'org1', hostUserId: 'pastor1', ldceSessionId: 'ldce_abc' } }),
        IdentityEngine: makeFakeIdentityWithPlatformAdmin(['cozyos-admin-1']),
        OrganizationSupport: { isSupportActive: () => ({ active: true, grantId: 'grant-1' }) } // even if this fired, the actor is not a platform admin
    });
    const ctx = await ai.getContext('inspect this session', { actorId: 'ordinary-viewer', liveSessionId: 'svc1', supportScope: 'inspect-live-session' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-support-diagnostics'), false);
});

await test('12d. a normal participant call (no supportScope) never includes live-support-diagnostics, even for a real platform admin actor', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({ svc1: { orgId: 'org1', sourceLanguage: 'sw', transcript: [{ text: 'x', at: 't', language: 'sw' }] } }),
        ChurchLiveSessionController: makeFakeSessionController({ svc1: { orgId: 'org1', hostUserId: 'pastor1', ldceSessionId: 'ldce_abc' } }),
        IdentityEngine: makeFakeIdentityWithPlatformAdmin(['cozyos-admin-1']),
        OrganizationSupport: { isSupportActive: () => ({ active: true, grantId: 'grant-1' }) }
    });
    const ctx = await ai.getContext('What did the pastor just say?', { actorId: 'cozyos-admin-1', liveSessionId: 'svc1' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-support-diagnostics'), false);
    const participantHit = ctx.results.find((r) => r.authority === 'live-worship-session');
    assert.ok(participantHit, 'the participant-safe result must still compose normally');
});

await test('12e. an unknown liveSessionId with supportScope never fabricates diagnostics, never throws', async () => {
    const { ai } = loadFullStack({
        ChurchWorshipSession: makeFakeWorshipSession({}),
        IdentityEngine: makeFakeIdentityWithPlatformAdmin(['cozyos-admin-1']),
        OrganizationSupport: { isSupportActive: () => ({ active: true, grantId: 'grant-1' }) }
    });
    const ctx = await ai.getContext('inspect this session', { actorId: 'cozyos-admin-1', liveSessionId: 'svc-does-not-exist', supportScope: 'inspect-live-session' });
    assert.strictEqual(ctx.success, true);
    assert.strictEqual(ctx.results.some((r) => r.authority === 'live-support-diagnostics'), false);
});

/* ===================================================================
   13. INTERESTOS BUSINESS CONTEXT COMPOSITION (BUSINESS INTEGRATION
   addition) — composes the real, unmodified InterestOSBusinessWorkspace.
   computeSummary() (already owner/visibility fail-closed) into one
   VERIFIED "interestos-business" result; adds no second calculation
   engine or authorization path of its own.
=================================================================== */
await test('13a. businessContext composes a real, VERIFIED "interestos-business" result from computeSummary()', async () => {
    const { ai, workspace } = loadFullStack();
    const table = workspace.createTable({ owner: 'shopOwner', name: 'Shop Sales' });
    const dateCol = workspace.addColumn(table.id, { label: 'Date', type: 'DATE', role: 'DATE' }, 'shopOwner');
    const sellCol = workspace.addColumn(table.id, { label: 'Sell', type: 'NUMBER', role: 'SELLING_PRICE' }, 'shopOwner');
    const buyCol = workspace.addColumn(table.id, { label: 'Buy', type: 'NUMBER', role: 'BUYING_PRICE' }, 'shopOwner');
    const today = new Date().toISOString().slice(0, 10);
    workspace.addRow(table.id, { [dateCol.columns.find(c => c.role === 'DATE').id]: today, [sellCol.columns.find(c => c.role === 'SELLING_PRICE').id]: 100, [buyCol.columns.find(c => c.role === 'BUYING_PRICE').id]: 60 }, 'shopOwner');

    const ctx = await ai.getContext('What is my profit this month?', { actorId: 'shopOwner', businessContext: { tableId: table.id, period: 'monthly' } });
    const hit = ctx.results.find((r) => r.authority === 'interestos-business');
    assert.ok(hit, 'expected a real interestos-business result');
    assert.strictEqual(hit.evidence, 'VERIFIED');
    assert.strictEqual(hit.tableId, table.id);
    assert.match(hit.content, /profit 40/);
});

await test('13b. no businessContext supplied: behavior is completely unaffected (true no-op, backward compatible)', async () => {
    const { ai } = loadFullStack();
    const ctx = await ai.getContext('What is my profit this month?', { actorId: 'shopOwner' });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'interestos-business'), false);
});

await test('13c. a wrong actorId (not the table owner) never sees the business summary — fail-closed via computeSummary()/getTable()', async () => {
    const { ai, workspace } = loadFullStack();
    const table = workspace.createTable({ owner: 'shopOwner', name: 'Shop Sales' });
    const ctx = await ai.getContext('What is my profit?', { actorId: 'stranger', businessContext: { tableId: table.id, period: 'monthly' } });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'interestos-business'), false);
});

await test('13d. an unknown tableId never fabricates a summary, never throws', async () => {
    const { ai } = loadFullStack();
    const ctx = await ai.getContext('What is my profit?', { actorId: 'shopOwner', businessContext: { tableId: 'bizt_does_not_exist', period: 'monthly' } });
    assert.strictEqual(ctx.success, true);
    assert.strictEqual(ctx.results.some((r) => r.authority === 'interestos-business'), false);
});

await test('13e. InterestOSBusinessWorkspace not loaded: getContext() degrades honestly, never throws', async () => {
    const { window, memory } = loadFullStack();
    delete window.CozyOS.InterestOSBusinessWorkspace;
    const ctx = await window.CozyOS.CozyAI.getContext('What is my profit?', { actorId: 'shopOwner', businessContext: { tableId: 'bizt_1', period: 'monthly' } });
    assert.strictEqual(ctx.success, true);
    assert.strictEqual(ctx.results.some((r) => r.authority === 'interestos-business'), false);
});

/* ===================================================================
   14. LIVE WINDOW INCOGNITO REPAIR — anonymous/public-knowledge
   regression suite. Proves the real, full production chain
   (CozyIdentityFAQRouter -> CozyAI.getContext() -> CozyAnswerEngine.
   answer(), the SAME unmodified function InterestOS's "Ask CozyAI" and
   the Live Window both call) reaches real, VERIFIED CozyOS application/
   public knowledge for an anonymous actor (actorId: null), for the
   exact bug-reported phrasing and its documented equivalents, while
   personal-memory restriction and the honest-empty-state fallback for
   genuinely unsupported questions remain fully intact. No second
   CozyAI, no incognito-specific knowledge store — every assertion below
   calls the one real, shared answerEngine.answer().
=================================================================== */
const PUBLIC_KNOWLEDGE_QUESTIONS = [
    'What is CozyOS?',
    'Tell me about CozyOS.',
    'CozyOS inafanya nini?',
    'Why was CozyOS created?',
    'What can CozyOS do?',
    'I want to know more about CozyOS'
];

for (const q of PUBLIC_KNOWLEDGE_QUESTIONS) {
    await test(`14. Anonymous actor: "${q}" resolves to a real, VERIFIED CozyOS answer (not the honest-but-wrong fallback)`, async () => {
        const { answerEngine } = loadFullStack();
        const result = await answerEngine.answer(q, { actorId: null });
        assert.strictEqual(result.evidenceState, 'VERIFIED', `expected VERIFIED evidence for "${q}", got: ${result.answer}`);
        assert.doesNotMatch(result.answer, /Some related context exists/i);
        assert.doesNotMatch(result.answer, /I don't have verified information/i);
        assert.match(result.answer, /cozyos/i);
    });
}

await test('14c. Anonymous actor: "CozyOS ni nini?" resolves to a real, VERIFIED, Kiswahili-language answer', async () => {
    const { answerEngine } = loadFullStack();
    const result = await answerEngine.answer('CozyOS ni nini?', { actorId: null });
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.doesNotMatch(result.answer, /Some related context exists/i);
    // Real Kiswahili prose (DeveloperIdentity's public COZYOS_ORIGIN
    // answer), not an English fallback string.
    assert.match(result.answer, /CozyOS|Charles/i);
    assert.match(result.answer, /kuunda|jamii|mtandao/i, 'expected genuine Kiswahili content, not an English-only answer');
});

await test('14f. Anonymous actor asking for private information is correctly restricted — never leaks another owner\'s private memory', async () => {
    const { answerEngine, memory } = loadFullStack();
    memory.saveMemory('cozy-ai-learning', 'someones-private-plan', 'The private roadmap note only bob can see.',
        { actorId: 'bob', owner: 'bob', visibility: 'private' });
    const result = await answerEngine.answer('What is the private roadmap note?', { actorId: null });
    assert.doesNotMatch(result.answer, /private roadmap note only bob/i);
    assert.ok(!(result.sources || []).some((s) => s.key === 'someones-private-plan'));
});

await test('14g. Anonymous actor asking a genuinely unsupported factual question still gets the honest empty-state fallback', async () => {
    const { answerEngine } = loadFullStack();
    const result = await answerEngine.answer('What is the airspeed velocity of an unladen swallow?', { actorId: null });
    assert.notStrictEqual(result.evidenceState, 'VERIFIED');
    assert.match(result.answer, /I don't have verified information/i);
    assert.doesNotMatch(result.answer, /Some related context exists/i, 'a genuinely-empty context must never be reported as the confusing "some related context exists" message');
});

await test('14h. Authenticated actor asking the same CozyOS question gets the same real public knowledge, with no personal memory required', async () => {
    const { answerEngine } = loadFullStack();
    const anonResult = await answerEngine.answer('What is CozyOS?', { actorId: null });
    const authResult = await answerEngine.answer('What is CozyOS?', { actorId: 'real-signed-in-user-1' });
    assert.strictEqual(authResult.evidenceState, 'VERIFIED');
    assert.strictEqual(authResult.answer, anonResult.answer, 'the same public application knowledge must not depend on being signed in');
});

await test('14i. No duplicate CozyOS knowledge store: the same single getWhyUseCozyOSFact() source answers every equivalent phrasing identically', async () => {
    const { answerEngine } = loadFullStack();
    const r1 = await answerEngine.answer('What is CozyOS?', { actorId: null });
    const r2 = await answerEngine.answer('What can CozyOS do?', { actorId: null });
    const r3 = await answerEngine.answer('I want to know more about CozyOS', { actorId: null });
    assert.strictEqual(r1.answer, r2.answer);
    assert.strictEqual(r2.answer, r3.answer);
});

await test('14j. Regression guard: CognitiveCoordinator\'s own internal "cognitive-default" bookkeeping namespace never pollutes getContext() results', async () => {
    const { ai, memory } = loadFullStack();
    // Real shape CognitiveCoordinator.run() actually saves (see that
    // file's own saveMemory() call) — an internal diagnostic record
    // whose `content` is an object, never real, directly renderable text.
    memory.saveMemory('cognitive-default', 'outcome_test1', { input: 'unrelated gibberish question xyz123', outcome: { some: 'internal trace' } },
        { owner: null, actorId: null, visibility: 'private' });
    const ctx = await ai.getContext('unrelated gibberish question xyz123', { actorId: null });
    assert.strictEqual(ctx.results.some((r) => r.namespace === 'cognitive-default'), false, 'cognitive-default must never surface as context');
    assert.strictEqual(ctx.found, false, 'a genuinely empty context (aside from internal bookkeeping noise) must stay honestly empty');
});

/* ===================================================================
   15. LIVE WINDOW APPLICATION SEMANTIC UNDERSTANDING REPAIR — a named,
   real application's own human-purpose knowledge (already loaded,
   already real, getApplicationDetailedInfoFact()) must be reachable
   through getContext(), take priority over the generic platform-wide
   application list / CozyOS purpose text, tolerate a genuine spelling
   typo via the existing CozyLearn.levenshtein() primitive (no new
   typo dictionary), and answer in the caller's real, resolved
   language — all through the ONE real answerEngine.answer() chain,
   no second AI/knowledge store/language engine of any kind.
=================================================================== */
await test('15a. A named, real application ("ChurchOS") resolves to its OWN human-purpose knowledge, tagged "application-knowledge"', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('How does ChurchOS help a church?', { actorId: null });
    const hit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hit, 'expected a real application-knowledge result for ChurchOS');
    assert.strictEqual(hit.evidence, 'VERIFIED');
    assert.strictEqual(hit.applicationName, 'ChurchOS');
    assert.match(hit.content, /church/i);
});

await test('15b. A named application question never falls back to the generic application list, even when the word "applications" appears in the question', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('InterestOS is among CozyOS applications, what does it help in real life solutions', { actorId: null });
    const appHit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(appHit, 'expected InterestOS\'s own knowledge to be reached');
    assert.strictEqual(appHit.applicationName, 'InterestOS');
    assert.strictEqual(ctx.results.some((r) => r.getter === 'listApplicationsFact'), false, 'the generic application list must not be the answer to a named-application question');
});

await test('15c. Generic "how many applications are available" (no application named) still resolves via the real, unmodified listApplicationsFact route', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('How many applications are available?', { actorId: null });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'application-knowledge'), false);
    const listHit = ctx.results.find((r) => r.getter === 'listApplicationsFact');
    assert.ok(listHit, 'the real application-list route must still work when no specific application is named');
});

await test('15d. Fuzzy spelling variation ("InteresOs") still resolves to the real, canonical InterestOS via the existing CozyLearn.levenshtein() primitive — no hand-built typo dictionary', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('InteresOs is among cozyos applications what does it help in real life solutions', { actorId: null });
    const hit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hit, 'expected the fuzzy-matched InterestOS application-knowledge result');
    assert.strictEqual(hit.applicationName, 'InterestOS');
});

await test('15e. Imperfect natural phrasing ("Hot. Does one benefit in churchOs") still resolves to ChurchOS\'s own benefit knowledge, not the honest-but-wrong fallback', async () => {
    const { ai, answerEngine } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('Hot. Does one benefit in churchOs', { actorId: null });
    const hit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hit, 'expected ChurchOS\'s own knowledge, not an empty context');
    assert.strictEqual(hit.applicationName, 'ChurchOS');
    const answerResult = await answerEngine.answer('Hot. Does one benefit in churchOs', { actorId: null });
    assert.strictEqual(answerResult.evidenceState, 'VERIFIED');
    assert.doesNotMatch(answerResult.answer, /Some related context exists|I don't have verified information/i);
});

await test('15f. language: "sw" reaches getApplicationDetailedInfoFact() with lang="sw" and returns real Kiswahili content, never a silent English substitution', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctxSw = await ai.getContext('ChurchOS inasaidiaje kanisa?', { actorId: null, language: 'sw' });
    const hitSw = ctxSw.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hitSw, 'expected a Kiswahili application-knowledge result for ChurchOS');
    assert.match(hitSw.content, /kanisa/i, 'expected genuine Kiswahili substance');

    const ctxEn = await ai.getContext('How does ChurchOS help a church?', { actorId: null, language: 'en' });
    const hitEn = ctxEn.results.find((r) => r.authority === 'application-knowledge');
    assert.notStrictEqual(hitSw.content, hitEn.content, 'Kiswahili and English answers must be genuinely different real text, not the same string with a language flag');
});

await test('15g. no language supplied: behavior defaults to English, exactly as before this repair (true no-op)', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctxNoLang = await ai.getContext('How does ChurchOS help a church?', { actorId: null });
    const ctxEnLang = await ai.getContext('How does ChurchOS help a church?', { actorId: null, language: 'en' });
    const a = ctxNoLang.results.find((r) => r.authority === 'application-knowledge');
    const b = ctxEnLang.results.find((r) => r.authority === 'application-knowledge');
    assert.strictEqual(a.content, b.content);
});

await test('15h. entityHint (a carried-forward conversational entity) resolves the same application-knowledge, even when the CURRENT question names no application of its own', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('What problem does it solve?', { actorId: null, entityHint: 'ChurchOS' });
    const hit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hit, 'expected the carried-forward ChurchOS entity to resolve real application knowledge');
    assert.strictEqual(hit.applicationName, 'ChurchOS');
});

await test('15i. An unregistered/nonexistent application name never fabricates application-knowledge, never throws', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('What does NonexistentAppXYZ help with?', { actorId: null });
    assert.strictEqual(ctx.success, true);
    assert.strictEqual(ctx.results.some((r) => r.authority === 'application-knowledge'), false);
});

await test('15j. No second AI/knowledge store: application-knowledge is composed from the SAME window.CozyOS.CozyKnowledge singleton every other authority in this file already uses', async () => {
    const { window: win, ai, knowledge } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    let called = false;
    // window.CozyOS.CozyKnowledge is Object.freeze()'d (like every other
    // real CozyOS facade), so the object's OWN properties can't be
    // reassigned — replace which object the window.CozyOS.CozyKnowledge
    // property points to instead (window.CozyOS itself is a plain,
    // non-frozen object), the same valid interception technique used to
    // instrument the real, frozen production objects during this
    // repair's own browser audit.
    win.CozyOS.CozyKnowledge = {
        ...knowledge,
        getApplicationDetailedInfoFact: function (...args) { called = true; return knowledge.getApplicationDetailedInfoFact.apply(knowledge, args); }
    };
    await ai.getContext('What does InterestOS help with?', { actorId: null });
    assert.strictEqual(called, true, 'expected the composition to call the one real, existing CozyKnowledge getter, not a second store');
});

await test('15l. Fuzzy matching never false-positives on a real, correctly-spelled, unrelated word ("churches") that merely resembles an app name\'s prefix — regression guard for a real bug this repair found', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('How can cozyos helps churches', { actorId: null });
    assert.strictEqual(ctx.results.some((r) => r.authority === 'application-knowledge'), false, '"churches" must never be treated as a typo of "ChurchOS"');
    const platformHit = ctx.results.find((r) => r.getter === 'getWhyUseCozyOSFact');
    assert.ok(platformHit, 'the real platform-level "help" route must still fire normally');
});

await test('15k. QuarryOS (a third, distinct application) resolves through the exact same universal mechanism as ChurchOS/InterestOS — no per-application code path', async () => {
    const { ai } = loadFullStack({ ServiceRegistry: makeMultiAppServiceRegistry() });
    const ctx = await ai.getContext('What does QuarryOS help with?', { actorId: null });
    const hit = ctx.results.find((r) => r.authority === 'application-knowledge');
    assert.ok(hit, 'expected QuarryOS\'s own real knowledge, the same universal mechanism as every other application');
    assert.strictEqual(hit.applicationName, 'QuarryOS');
});

/* ===================================================================
   SUMMARY
=================================================================== */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

})();
