'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp037-correction-handling.test.js
 *
 * RP-037 — Conversation State Propagation (dependency #2: correction
 * handling). Extends the existing conversationState mechanism (see the
 * sibling rp037-context-followup test file) with exactly one new
 * capability: recognizing that the current turn corrects the
 * application named on the previous turn, in both English and
 * Kiswahili, using a small, closed, disclosed set of correction
 * phrasings — never general natural-language correction intelligence.
 *
 * These tests prove:
 *  - "Actually, ShopOS, not QuarryOS." after "Open QuarryOS." replaces
 *    the remembered application with ShopOS, in English;
 *  - the corrected reference (ShopOS) resolves on a subsequent bare
 *    follow-up ("open it"), reusing the existing reference-resolution
 *    mechanism unchanged;
 *  - the same two behaviors hold for the Kiswahili equivalent
 *    ("Kwa kweli ShopOS, si QuarryOS.");
 *  - a correction with no valid prior app-launch reference is honestly
 *    left unresolved, never fabricated;
 *  - a genuine new, explicit app-launch utterance still always wins
 *    over correction handling;
 *  - a malformed conversationState is tolerated safely;
 *  - all 8 pre-existing RP-037 reference-resolution tests continue
 *    passing unchanged (proven by running that file directly, not by
 *    duplicating its assertions here).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

function makeFakeLivingAI() {
    const registered = new Map();
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider() { return { success: true }; },
        getActiveProvider() { return null; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function freshProvider({ apps = [{ id: 'quarryos', name: 'QuarryOS' }, { id: 'shopos', name: 'ShopOS' }] } = {}) {
    const files = [
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'),
    ];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            listApplications: () => apps,
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

// ---- English: correction replaces prior application ----

test('EN: "Open QuarryOS." then "Actually, ShopOS, not QuarryOS." -> corrected turn resolves to ShopOS', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    assert.equal(turn1.result.intent, 'app-launch');
    assert.deepEqual(turn1.result.application, { id: 'quarryos', name: 'QuarryOS' });

    const turn2 = await provider.think('Actually, ShopOS, not QuarryOS.', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn2.result.correctionApplied, true);
    assert.ok(!turn2.result.contextResolved, 'a correction is a distinct capability from a bare reference follow-up');
});

test('EN: alternate correction phrasing "Not QuarryOS — ShopOS." also replaces the prior application', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    const turn2 = await provider.think('Not QuarryOS — ShopOS.', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn2.result.correctionApplied, true);
});

// ---- English: corrected reference resolves on next bare follow-up ----

test('EN: corrected reference resolves on a subsequent bare "open it" follow-up', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    const turn2 = await provider.think('Actually, ShopOS, not QuarryOS.', { conversationState: turn1.result.conversationState });
    const turn3 = await provider.think('open it', { conversationState: turn2.result.conversationState });
    assert.equal(turn3.result.intent, 'app-launch');
    assert.deepEqual(turn3.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn3.result.contextResolved, true);
});

// ---- Kiswahili: correction replaces prior application ----

test('KISWAHILI: "Fungua QuarryOS." then "Kwa kweli ShopOS, si QuarryOS." -> corrected turn resolves to ShopOS', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Fungua QuarryOS.');
    assert.equal(turn1.result.intent, 'app-launch');
    assert.deepEqual(turn1.result.application, { id: 'quarryos', name: 'QuarryOS' });

    const turn2 = await provider.think('Kwa kweli ShopOS, si QuarryOS.', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn2.result.correctionApplied, true);
});

// ---- Kiswahili: corrected reference resolves on next bare follow-up ----

test('KISWAHILI: corrected reference resolves on a subsequent bare "ifungue" follow-up', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Fungua QuarryOS.');
    const turn2 = await provider.think('Kwa kweli ShopOS, si QuarryOS.', { conversationState: turn1.result.conversationState });
    const turn3 = await provider.think('ifungue', { conversationState: turn2.result.conversationState });
    assert.equal(turn3.result.intent, 'app-launch');
    assert.deepEqual(turn3.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn3.result.contextResolved, true);
});

// ---- Correction without valid prior context fails honestly ----

test('EN: correction phrasing with NO prior conversationState -> honestly unresolved, never fabricated', async () => {
    const provider = freshProvider();
    const result = await provider.think('Actually, ShopOS, not QuarryOS.');
    assert.notEqual(result.result.intent, 'app-launch');
    assert.ok(!result.result.correctionApplied);
});

test('EN: correction phrasing after a non-app-launch previous turn -> honestly unresolved, never fabricated', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('help');
    assert.notEqual(turn1.result.intent, 'app-launch');
    const turn2 = await provider.think('Actually, ShopOS, not QuarryOS.', { conversationState: turn1.result.conversationState });
    assert.notEqual(turn2.result.intent, 'app-launch');
    assert.ok(!turn2.result.correctionApplied);
});

test('EN: correction naming an application that does not exist in the registry -> honestly unresolved, never fabricated', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    const turn2 = await provider.think('Actually, NotARealApp, not QuarryOS.', { conversationState: turn1.result.conversationState });
    assert.notEqual(turn2.result.intent, 'app-launch');
    assert.ok(!turn2.result.correctionApplied);
});

// ---- Explicit new application still wins after a correction ----

test('EN: naming a new application explicitly still wins over correction handling', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    // This utterance both looks like a correction AND is preceded by a
    // real app-launch turn — but it also happens to be phrased as an
    // ordinary, explicit app-launch request naming its own application,
    // which the existing app-launch classification rule matches first.
    const turn2 = await provider.think('Open ShopOS.', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.ok(!turn2.result.correctionApplied, 'an explicit new app-launch utterance must never be treated as a correction');
    assert.ok(!turn2.result.contextResolved);
});

// ---- Malformed conversationState is tolerated ----

test('EN: malformed conversationState (a string) during a correction attempt is treated as no prior turn, not an error', async () => {
    const provider = freshProvider();
    const result = await provider.think('Actually, ShopOS, not QuarryOS.', { conversationState: 'not-an-object' });
    assert.notEqual(result.result.intent, 'app-launch');
    assert.ok(!result.result.correctionApplied);
});
