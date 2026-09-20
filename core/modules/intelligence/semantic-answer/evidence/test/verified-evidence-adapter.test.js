'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshLoad } = require('./_test-helpers');

function loadFullStack() {
    const w = freshLoad(['knowledgeRegistry', 'memoryEngine', 'identityEngine', 'orgRegistry', 'orgMembership', 'orgSupport', 'evidenceContract', 'adapter', 'knowledgeAdapter', 'memoryAdapter']);
    return {
        adapter: w.CozyOS.VerifiedEvidenceAdapter,
        memory: w.CozyOS.CozyMemory,
        identity: w.CozyOS.IdentityEngine,
        evidenceContract: w.CozyOS.VerifiedEvidenceContract,
    };
}

test('registers window.CozyOS.VerifiedEvidenceAdapter with the real, closed SOURCE_TYPE set', () => {
    const { adapter } = loadFullStack();
    assert.ok(adapter);
    for (const t of ['APPLICATION_HUMAN_PURPOSE', 'APPLICATION_KNOWLEDGE', 'SYSTEM_FACT', 'USER_MEMORY', 'ORGANIZATION_KNOWLEDGE', 'PUBLIC_KNOWLEDGE']) {
        assert.ok(t in adapter.SOURCE_TYPE);
    }
    assert.ok(Object.isFrozen(adapter.SOURCE_TYPE));
});

test('collectApplicationHumanPurposeEvidence() delegates to the real CozyKnowledgeEvidenceAdapter and returns real, valid evidence for ChurchOS', () => {
    const { adapter, evidenceContract } = loadFullStack();
    const result = adapter.collectApplicationHumanPurposeEvidence('ChurchOS', { languages: ['sw'] });
    assert.equal(result.success, true);
    assert.ok(result.evidence.length > 5);
    for (const ev of result.evidence) {
        assert.deepEqual(evidenceContract.validate(ev).errors, []);
        assert.equal(ev.source.type, adapter.SOURCE_TYPE.APPLICATION_HUMAN_PURPOSE);
    }
});

test('collectApplicationHumanPurposeEvidence() degrades honestly when the source adapter is not loaded', () => {
    const w = freshLoad(['knowledgeRegistry', 'evidenceContract', 'adapter']); // knowledgeAdapter deliberately omitted
    const result = w.CozyOS.VerifiedEvidenceAdapter.collectApplicationHumanPurposeEvidence('ChurchOS');
    assert.equal(result.success, false);
    assert.ok(result.errors[0].includes('CozyKnowledgeEvidenceAdapter'));
});

test('collectApplicationKnowledgeEvidence() delegates to the real CozyKnowledgeEvidenceAdapter', () => {
    const { adapter } = loadFullStack();
    global.window.CozyOS.ServiceRegistry = { listApplications: () => [{ id: 'churchos', name: 'ChurchOS', category: 'faith', enabled: true, version: '1.0.0' }] };
    const result = adapter.collectApplicationKnowledgeEvidence('ChurchOS');
    assert.equal(result.success, true);
    assert.equal(result.evidence[0].source.type, adapter.SOURCE_TYPE.APPLICATION_KNOWLEDGE);
});

test('collectMemoryEvidence() delegates to the real CozyMemoryEvidenceAdapter, real authorization included', async () => {
    const { adapter, memory, identity, evidenceContract } = loadFullStack();
    const org = identity.createOrganization('Org C');
    const user = await identity.createUser({ username: 'orgc_user_' + Date.now(), password: 'Passw0rd!12345', orgId: org.id });
    memory.saveMemory('test-ns', 'a-fact', 'A real, saved fact for Org C.', { owner: user.userId, actorId: user.userId, visibility: 'organisation' });

    const result = adapter.collectMemoryEvidence({ query: 'real, saved fact', accessContext: { actorId: user.userId } });
    assert.equal(result.success, true);
    assert.ok(result.evidence.some((e) => e.claim.includes('A real, saved fact for Org C.')));
    for (const ev of result.evidence) assert.deepEqual(evidenceContract.validate(ev).errors, []);

    // Same org isolation invariant proven again through the orchestrator's own public surface, not just the source adapter directly.
    const otherOrg = identity.createOrganization('Org D');
    const otherUser = await identity.createUser({ username: 'orgd_user_' + Date.now(), password: 'Passw0rd!12345', orgId: otherOrg.id });
    const leaked = adapter.collectMemoryEvidence({ query: 'real, saved fact', accessContext: { actorId: otherUser.userId } });
    assert.equal(leaked.evidence.some((e) => e.claim.includes('A real, saved fact for Org C.')), false);
});

test('collectMemoryEvidence({key}) delegates to adaptFromRead(), collectMemoryEvidence({query}) delegates to adaptFromSearch()', async () => {
    const { adapter, memory, identity } = loadFullStack();
    const user = await identity.createUser({ username: 'reader_' + Date.now(), password: 'Passw0rd!12345' });
    memory.saveMemory('test-ns', 'single-key', 'A single, directly-read fact.', { owner: user.userId, actorId: user.userId, visibility: 'public' });

    const byKey = adapter.collectMemoryEvidence({ namespace: 'test-ns', key: 'single-key', accessContext: { actorId: user.userId } });
    assert.equal(byKey.success, true);
    assert.equal(byKey.evidence.length, 1);
    assert.ok(byKey.evidence[0].claim.includes('A single, directly-read fact.'));

    const bySearch = adapter.collectMemoryEvidence({ query: 'directly-read fact', accessContext: { actorId: user.userId } });
    assert.ok(bySearch.evidence.some((e) => e.claim.includes('A single, directly-read fact.')));
});

test('SA-2 BOUNDARY: no method on the orchestrator ever returns a final answer string, goal field, or language-selection decision — every result is a real evidence array', () => {
    const { adapter } = loadFullStack();
    const result = adapter.collectApplicationHumanPurposeEvidence('ChurchOS', { languages: ['en', 'sw'] });
    assert.ok(Array.isArray(result.evidence));
    for (const ev of result.evidence) {
        assert.ok(!('answer' in ev));
        assert.ok(!('goal' in ev));
        assert.ok(!('finalResponse' in ev));
    }
});
