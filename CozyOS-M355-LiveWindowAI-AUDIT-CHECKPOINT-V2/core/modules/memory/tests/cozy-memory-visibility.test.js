/**
 * core/modules/memory/tests/cozy-memory-visibility.test.js
 * Micro-Milestone E — real, executed tests for the retrieval-boundary
 * gap fixed in cozy-memory-engine.js: listKeys()/searchMemory()/
 * searchAllNamespaces()/tagSearch() now enforce the same real
 * #checkReadVisibility() gate that readMemory()/recall() already
 * enforced, instead of silently bypassing it.
 * Run with: node core/modules/memory/tests/cozy-memory-visibility.test.js
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

const memoryPath = path.join(__dirname, '..', 'cozy-memory-engine.js');

function freshEngine() {
    delete require.cache[require.resolve(memoryPath)];
    const win = { CozyOS: {} };
    global.window = win;
    require(memoryPath);
    return win.CozyOS.CozyMemory;
}

console.log('Micro-Milestone E \u2014 Memory retrieval-boundary tests\n');

// -----------------------------------------------------------------
// EXISTING BEHAVIOR COMPATIBILITY (no actorId passed \u2192 unchanged)
// -----------------------------------------------------------------

test('listKeys(): omitting actorId still returns everything, exactly as before', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'a', { v: 1 }, { owner: 'alice' });
    mem.saveMemory('Project', 'b', { v: 2 }); // no owner \u2192 always open
    const list = mem.listKeys('Project');
    assert.strictEqual(list.length, 2);
});

test('searchMemory(): omitting actorId still searches everything, exactly as before', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'secret-note', { v: 'alpha-launch' }, { owner: 'alice' });
    const results = mem.searchMemory('Project', 'alpha');
    assert.strictEqual(results.length, 1);
});

// -----------------------------------------------------------------
// REAL ENFORCEMENT (actorId passed \u2192 private entries excluded)
// -----------------------------------------------------------------

test('listKeys(): a private entry is excluded for an actor who is not the owner', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'private-plan', { v: 1 }, { owner: 'alice', visibility: 'private' });
    mem.saveMemory('Project', 'open-note', { v: 2 }); // no owner \u2192 always visible
    const asBob = mem.listKeys('Project', null, 'bob');
    assert.strictEqual(asBob.length, 1);
    assert.strictEqual(asBob[0].key, 'open-note');
});

test('listKeys(): the owner still sees their own private entry', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'private-plan', { v: 1 }, { owner: 'alice', visibility: 'private' });
    const asAlice = mem.listKeys('Project', null, 'alice');
    assert.strictEqual(asAlice.length, 1);
});

test('searchMemory(): a private entry\u2019s content is not searchable by a non-owner actor', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'secret-note', { v: 'alpha-launch' }, { owner: 'alice', visibility: 'private' });
    const asBob = mem.searchMemory('Project', 'alpha', 'bob');
    assert.strictEqual(asBob.length, 0);
});

test('searchAllNamespaces(): a private entry does not leak across the fan-out search for a non-owner actor', () => {
    const mem = freshEngine();
    mem.saveMemory('Church', 'member-note', { v: 'confidential-alpha' }, { owner: 'alice', visibility: 'private' });
    const asBob = mem.searchAllNamespaces('confidential', 'bob');
    assert.strictEqual(asBob.length, 0);
    const asAlice = mem.searchAllNamespaces('confidential', 'alice');
    assert.strictEqual(asAlice.length, 1);
});

test('tagSearch(): a private entry is excluded for a non-owner actor', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'tagged', { v: 1 }, { owner: 'alice', visibility: 'private', tags: ['launch'] });
    const asBob = mem.tagSearch('Project', 'launch', 'bob');
    assert.strictEqual(asBob.length, 0);
    const asSystem = mem.tagSearch('Project', 'launch');
    assert.strictEqual(asSystem.length, 1);
});

// -----------------------------------------------------------------
// FAIL-CLOSED / SCOPE ISOLATION
// -----------------------------------------------------------------

test('fail-closed: a public entry remains readable via search regardless of actor', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'public-note', { v: 'town-hall' }, { owner: 'alice', visibility: 'public' });
    const asBob = mem.searchMemory('Project', 'town-hall', 'bob');
    assert.strictEqual(asBob.length, 1);
});

test('scope isolation: enforcement in one namespace does not affect another actor\u2019s own namespace results', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'p1', { v: 1 }, { owner: 'alice', visibility: 'private' });
    mem.saveMemory('Builder', 'b1', { v: 1 }, { owner: 'bob', visibility: 'private' });
    assert.strictEqual(mem.listKeys('Project', null, 'bob').length, 0);
    assert.strictEqual(mem.listKeys('Builder', null, 'bob').length, 1);
});

test('provenance: readMemory() and the new listKeys() enforcement agree on the same entry', () => {
    const mem = freshEngine();
    mem.saveMemory('Project', 'shared-check', { v: 1 }, { owner: 'alice', visibility: 'private' });
    const directRead = mem.readMemory('Project', 'shared-check', 'bob');
    const viaList = mem.listKeys('Project', e => e.key === 'shared-check', 'bob');
    assert.strictEqual(directRead, null);
    assert.strictEqual(viaList.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
