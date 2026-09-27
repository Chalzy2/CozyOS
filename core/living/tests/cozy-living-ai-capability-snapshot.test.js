'use strict';

/**
 * core/living/tests/cozy-living-ai-capability-snapshot.test.js
 *
 * SA-8 Phase 4 (Provider-Agnostic Capability Audit & Availability
 * Contract) — unit tests for window.CozyOS.LivingAICapabilitySnapshot
 * (core/living/providers/living-ai-capability-snapshot.js), the real,
 * standalone module that reads window.CozyOS.LivingAI's existing,
 * UNMODIFIED public API from outside. cozy-living-ai.js itself is a
 * protected file (see this repository's own "E28" regression guard in
 * semantic-answer-interpretation-provider.test.js — an empty git diff on
 * it is a permanent, tested requirement) — this suite never loads or
 * edits it in a way that would touch it; it composes the real file
 * exactly as any other real caller would.
 *
 * Run with: node --test core/living/tests/cozy-living-ai-capability-snapshot.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadStack() {
    const livingAiPath = path.join(__dirname, '..', 'cozy-living-ai.js');
    const snapshotPath = path.join(__dirname, '..', 'providers', 'living-ai-capability-snapshot.js');
    delete require.cache[require.resolve(livingAiPath)];
    delete require.cache[require.resolve(snapshotPath)];
    global.window = { CozyOS: {} };
    global.document = { body: { classList: { add() {}, remove() {}, contains() { return false; } } } };
    require(livingAiPath);
    require(snapshotPath);
    return { LivingAI: global.window.CozyOS.LivingAI, Snapshot: global.window.CozyOS.LivingAICapabilitySnapshot };
}

test('registers window.CozyOS.LivingAICapabilitySnapshot without touching LivingAI\'s own real registry', () => {
    const { Snapshot, LivingAI } = loadStack();
    const beforeProviders = LivingAI.listProviders();
    assert.ok(Snapshot);
    assert.equal(typeof Snapshot.getSnapshot, 'function');
    Snapshot.getSnapshot();
    assert.deepEqual(LivingAI.listProviders(), beforeProviders, 'must never mutate the real, existing registry');
});

test('classifies the real reasoning-pipeline provider as AVAILABLE_OFFLINE when CognitiveCoordinator is genuinely loaded', () => {
    const { Snapshot } = loadStack();
    global.window.CozyOS.CognitiveCoordinator = { run: async () => ({}) };
    const snapshot = Snapshot.getSnapshot();
    const entry = snapshot.find((e) => e.name === 'reasoning-pipeline');
    assert.ok(entry);
    assert.equal(entry.availability, 'AVAILABLE_OFFLINE');
});

test('classifies reasoning-pipeline as REGISTERED_BUT_INACTIVE when CognitiveCoordinator is genuinely absent', () => {
    const { Snapshot } = loadStack();
    const snapshot = Snapshot.getSnapshot();
    const entry = snapshot.find((e) => e.name === 'reasoning-pipeline');
    assert.equal(entry.availability, 'REGISTERED_BUT_INACTIVE');
});

test('classifies every real, unconfigured stub slot (cloud-llm/on-device/enterprise-byo/research-multi) as REGISTERED_BUT_INACTIVE, never AVAILABLE', () => {
    const { Snapshot } = loadStack();
    const snapshot = Snapshot.getSnapshot();
    for (const name of ['cloud-llm', 'on-device', 'enterprise-byo', 'research-multi']) {
        const entry = snapshot.find((e) => e.name === name);
        assert.ok(entry, `expected a ${name} entry`);
        assert.equal(entry.availability, 'REGISTERED_BUT_INACTIVE', `${name} must never report itself available`);
    }
});

test('classifies any OTHER real, externally-registered provider (e.g. a real gemini-api registration) as UNKNOWN — never guessed available or inactive', () => {
    const { Snapshot, LivingAI } = loadStack();
    LivingAI.registerProvider('gemini-api', {
        async think() { return { success: false, reason: 'not reachable in this test' }; },
        describe() { return { kind: 'gemini-api (cloud)', isLLM: true, offline: false }; },
    });
    const snapshot = Snapshot.getSnapshot();
    const entry = snapshot.find((e) => e.name === 'gemini-api');
    assert.equal(entry.availability, 'UNKNOWN');
});

test('marks isActive:true only for the currently active provider, read via the real, unmodified getActiveProvider()', () => {
    const { Snapshot, LivingAI } = loadStack();
    const snapshot = Snapshot.getSnapshot();
    const active = snapshot.filter((e) => e.isActive);
    assert.equal(active.length, 1);
    assert.equal(active[0].name, LivingAI.getActiveProvider());
});

test('every entry carries the real describe() metadata verbatim alongside the availability classification', () => {
    const { Snapshot, LivingAI } = loadStack();
    const snapshot = Snapshot.getSnapshot();
    for (const entry of snapshot) {
        const realDescribe = LivingAI.describeProvider(entry.name);
        assert.equal(entry.kind, realDescribe.kind);
        assert.equal(entry.isLLM, realDescribe.isLLM);
        assert.equal(entry.offline, realDescribe.offline);
    }
});

test('degrades honestly to an empty array when LivingAI is not loaded at all', () => {
    global.window = { CozyOS: {} };
    const snapshotPath = path.join(__dirname, '..', 'providers', 'living-ai-capability-snapshot.js');
    delete require.cache[require.resolve(snapshotPath)];
    require(snapshotPath);
    assert.deepEqual(global.window.CozyOS.LivingAICapabilitySnapshot.getSnapshot(), []);
});

test('output entries and the outer array are frozen (real, immutable snapshot, never a live handle)', () => {
    const { Snapshot } = loadStack();
    const snapshot = Snapshot.getSnapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot[0]));
});

test('double-registration on the same window is a real no-op (Modules[] guard), matching this repository\'s own established convention', () => {
    const snapshotPath = path.join(__dirname, '..', 'providers', 'living-ai-capability-snapshot.js');
    delete require.cache[require.resolve(snapshotPath)];
    global.window = { CozyOS: {} };
    require(snapshotPath);
    const first = global.window.CozyOS.LivingAICapabilitySnapshot;
    assert.ok(first);
    delete require.cache[require.resolve(snapshotPath)];
    require(snapshotPath); // SAME global.window — not recreated
    assert.equal(global.window.CozyOS.LivingAICapabilitySnapshot, first, 'a second load onto the same window must not reassign the export');
});
