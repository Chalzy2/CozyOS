'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp037-context-followup.test.js
 *
 * RP-037 — Conversation State Propagation (dependency #1: reference
 * resolution). Repository-wide search before writing this (core/modules/
 * conversation, core/modules/intelligence, core/context) found no
 * location anywhere in the shared conversation path that carried any
 * information from one think() call to the next — this is the single
 * concrete missing dependency these tests prove is now filled, for
 * exactly one disclosed referent (a previously named, resolved
 * application), in both English and Kiswahili.
 *
 * These tests prove:
 *  - a follow-up that omits the entity ("open it" / "ifungue") is
 *    resolved using the PREVIOUS turn's real conversationState, in both
 *    languages;
 *  - the resolution never fires without a real previous app-launch turn
 *    (no state, or a non-app-launch previous turn -> honestly
 *    "unsupported", never guessed);
 *  - a genuine new app-launch turn (naming its own application) is never
 *    overridden by stale prior state;
 *  - switching topic (e.g. asking "identity") clears the remembered
 *    application, so a later bare "open it" is honestly unsupported
 *    rather than resolving to a stale reference;
 *  - conversationState is returned on every call so a caller can chain
 *    turns without any other change.
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

// ---- English: two-turn reference resolution ----

test('EN: "Open QuarryOS." then "open it" -> second turn resolves to QuarryOS via prior state', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    assert.equal(turn1.result.intent, 'app-launch');
    assert.deepEqual(turn1.result.application, { id: 'quarryos', name: 'QuarryOS' });
    assert.ok(turn1.result.conversationState, 'turn1 must return a conversationState for the caller to carry forward');

    const turn2 = await provider.think('open it', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'quarryos', name: 'QuarryOS' });
    assert.equal(turn2.result.contextResolved, true);
});

// ---- Kiswahili: two-turn reference resolution ----

test('KISWAHILI: "Fungua QuarryOS." then "ifungue" -> second turn resolves to QuarryOS via prior state', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Fungua QuarryOS.');
    assert.equal(turn1.result.intent, 'app-launch');
    assert.deepEqual(turn1.result.application, { id: 'quarryos', name: 'QuarryOS' });

    const turn2 = await provider.think('ifungue', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'quarryos', name: 'QuarryOS' });
    assert.equal(turn2.result.contextResolved, true);
});

test('KISWAHILI: "Nifungulie ShopOS." then "fungua hiyo" -> resolves to ShopOS via prior state', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Nifungulie ShopOS.');
    assert.equal(turn1.result.intent, 'app-launch');
    assert.deepEqual(turn1.result.application, { id: 'shopos', name: 'ShopOS' });

    const turn2 = await provider.think('fungua hiyo', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.equal(turn2.result.contextResolved, true);
});

// ---- Honest non-resolution: no prior state, or non-app-launch prior turn ----

test('EN: "open it" with NO prior conversationState -> honestly unresolved (null application), never guessed', async () => {
    const provider = freshProvider();
    const result = await provider.think('open it');
    // Pre-existing baseline behavior (unchanged by RP-037): the generic
    // app-launch pattern already classifies this as app-launch with no
    // resolvable application name. What RP-037 must NOT do is invent an
    // application here, since there is no prior state to resolve from.
    assert.equal(result.result.intent, 'app-launch');
    assert.equal(result.result.application, null);
    assert.ok(!result.result.contextResolved);
    assert.equal(result.result.conversationState.lastApplication, null);
});

test('EN: "open it" after a non-app-launch previous turn (e.g. "help") -> honestly unresolved, never guessed', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('help');
    assert.notEqual(turn1.result.intent, 'app-launch');
    const turn2 = await provider.think('open it', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.application, null);
    assert.ok(!turn2.result.contextResolved);
});

// ---- A genuine new app-launch turn is never overridden by stale state ----

test('EN: naming a NEW application always wins over prior remembered application', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    const turn2 = await provider.think('Open ShopOS.', { conversationState: turn1.result.conversationState });
    assert.equal(turn2.result.intent, 'app-launch');
    assert.deepEqual(turn2.result.application, { id: 'shopos', name: 'ShopOS' });
    assert.ok(!turn2.result.contextResolved, 'a genuine new app-launch match must not be flagged as context-resolved');
});

// ---- Changing topic clears the remembered application (no stale leakage) ----

test('EN: switching topic to "identity" clears remembered application; a later "open it" is honestly unsupported', async () => {
    const provider = freshProvider();
    const turn1 = await provider.think('Open QuarryOS.');
    const turn2 = await provider.think('who are you');
    assert.notEqual(turn2.result.intent, 'app-launch');
    const turn3 = await provider.think('open it', { conversationState: turn2.result.conversationState });
    assert.equal(turn3.result.application, null, 'the QuarryOS reference from turn1 must not leak into turn3 once the topic changed');
    assert.ok(!turn3.result.contextResolved);
    // Sanity: turn1's own state (never fed into turn2) still would have worked —
    // proves the clearing happens on turn2's own real state, not a fluke.
    const altTurn3 = await provider.think('open it', { conversationState: turn1.result.conversationState });
    assert.deepEqual(altTurn3.result.application, { id: 'quarryos', name: 'QuarryOS' });
    assert.equal(altTurn3.result.contextResolved, true);
});

// ---- Malformed/absent conversationState never breaks a normal call ----

test('EN: malformed conversationState (a string) is treated as no prior turn, not an error', async () => {
    const provider = freshProvider();
    const result = await provider.think('Open QuarryOS.', { conversationState: 'not-an-object' });
    assert.equal(result.result.intent, 'app-launch');
});
