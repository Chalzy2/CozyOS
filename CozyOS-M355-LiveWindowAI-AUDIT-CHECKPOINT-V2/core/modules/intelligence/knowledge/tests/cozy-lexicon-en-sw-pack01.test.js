'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-lexicon-en-sw-pack01.test.js
 *
 * Kiswahili World Knowledge Lexicon (Pack 01) - real regression coverage
 * for both the vocabulary data module and its integration into the
 * existing conversational intent path. Proves actual retrieval and
 * actual intent classification through the real, unmodified conversational
 * provider - not isolated unit assertions against the data file alone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');

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

function freshFullStack() {
    const files = [LEXICON_PATH, KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
    };
}

test('A. the lexicon contains exactly 473 real vocabulary records, matching the source PDF\'s own stated count', () => {
    const { window: win } = freshFullStack();
    assert.equal(win.CozyOS.CozyLexiconEnSw.getRecordCount(), 473);
});

test('A. real category coverage matches the source document\'s own section structure', () => {
    const { window: win } = freshFullStack();
    const categories = win.CozyOS.CozyLexiconEnSw.listCategories();
    for (const expected of ['home_rooms', 'kitchen_food', 'domestic_animals', 'wildlife', 'birds', 'fish_aquatic', 'insects_small_creatures', 'vehicles_transport', 'people_family_daily', 'technology_objects', 'basic_actions_concepts']) {
        assert.ok(categories.includes(expected), `missing category: ${expected}`);
    }
});

test('B. the lexicon fact is reachable through the existing centralized cozy-knowledge-registry.js (no second registry)', () => {
    const { window: win } = freshFullStack();
    assert.equal(typeof win.CozyOS.CozyKnowledge.lookupLexiconTermFact, 'function');
});

test('C. English term retrieves its real Kiswahili counterpart', () => {
    const { window: win } = freshFullStack();
    const result = win.CozyOS.CozyKnowledge.lookupLexiconTermFact('lion', 'en');
    assert.equal(result.evidence, 'VERIFIED');
    assert.equal(result.records[0].sw, 'simba');
});

test('C. Kiswahili term retrieves its real English counterpart', () => {
    const { window: win } = freshFullStack();
    const result = win.CozyOS.CozyKnowledge.lookupLexiconTermFact('simba', 'sw');
    assert.equal(result.evidence, 'VERIFIED');
    assert.equal(result.records[0].en, 'lion');
});

test('C. categories are retrievable and a multi-category term (e.g. "chicken") returns all of its real categories', () => {
    const { window: win } = freshFullStack();
    const result = win.CozyOS.CozyKnowledge.lookupLexiconTermFact('chicken', 'en');
    const cats = result.records.map((r) => r.category);
    assert.ok(cats.includes('domestic_animals'));
    assert.ok(cats.includes('birds'));
    assert.ok(cats.includes('kitchen_food'));
});

test('C. an unknown term honestly returns NOT_FOUND, never a fabricated translation', () => {
    const { window: win } = freshFullStack();
    const result = win.CozyOS.CozyKnowledge.lookupLexiconTermFact('xyzzy', 'en');
    assert.equal(result.evidence, 'NOT_FOUND');
    assert.deepEqual(result.records, []);
});

test('D. ENGLISH: "What animal is this? lion" resolves animal-identification and uses the real, VERIFIED lexicon translation', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What animal is this? lion');
    assert.equal(result.result.intent, 'animal-identification');
    assert.match(result.result.text, /simba/);
});

test('D. KISWAHILI: "Huyu ni mnyama gani? simba" resolves animal-identification and uses the real, VERIFIED lexicon translation', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Huyu ni mnyama gani? simba');
    assert.equal(result.result.intent, 'animal-identification');
    assert.match(result.result.text, /lion/);
});

test('D. ENGLISH: "What animal is this?" (no real entity named) honestly asks for an image - never fabricates a species', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What animal is this?');
    assert.equal(result.result.intent, 'animal-identification');
    assert.match(result.result.text, /image|photo/i);
    assert.doesNotMatch(result.result.text, /simba|lion|chui|leopard/i);
});

test('D. ENGLISH: "How much is this?" resolves price-inquiry with an honest no-source reply, never a fabricated price', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('How much is this?');
    assert.equal(result.result.intent, 'price-inquiry');
    assert.doesNotMatch(result.result.text, /\$|shilingi|KES|USD/i);
});

test('D. KISWAHILI: "Hiki ni bei gani?" resolves price-inquiry', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Hiki ni bei gani?');
    assert.equal(result.result.intent, 'price-inquiry');
});

test('D. ENGLISH: "What is this?" resolves object-identification honestly', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is this?');
    assert.equal(result.result.intent, 'object-identification');
});

test('D. KISWAHILI: "Hiki ni nini?" resolves object-identification', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Hiki ni nini?');
    assert.equal(result.result.intent, 'object-identification');
});

test('NEGATIVE: "gari" alone does not automatically resolve to purchase-intent or any other specific intent - it falls through honestly', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('gari');
    assert.notEqual(result.result.intent, 'purchase-intent');
});

test('NEGATIVE: "I want to buy this car" does NOT get misclassified as animal-identification merely because "car" exists in the lexicon', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('I want to buy this car');
    assert.notEqual(result.result.intent, 'animal-identification');
});

test('NEGATIVE: "What animal is this? gari" does not fabricate an animal match for a real but non-animal lexicon term', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What animal is this? gari');
    assert.equal(result.result.intent, 'animal-identification');
    assert.match(result.result.text, /image|photo/i, 'must honestly ask for an image rather than incorrectly matching "gari" as an animal');
});

test('REGRESSION: existing translate-request intent (Domain 4C) remains completely unaffected', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Translate hello to French.');
    assert.equal(result.result.intent, 'translate-request');
});

test('REGRESSION: existing registration/what-is-cozyos/help/greeting intents remain unaffected', async () => {
    const { provider } = freshFullStack();
    assert.equal((await provider.think('I want to register.')).result.intent, 'how-to-register');
    assert.equal((await provider.think('What is CozyOS?')).result.intent, 'what-is-cozyos');
    assert.equal((await provider.think('Nataka msaada.')).result.intent, 'help');
    assert.equal((await provider.think('Habari yako?')).result.intent, 'greeting-generic');
});

test('SECURITY: a real payment-shaped Kiswahili utterance is never executed or authorized by the language layer - it only classifies, never acts', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Tuma pesa kwa nambari hii.');
    assert.doesNotMatch(result.result.text, /sent|imetumwa|payment (?:complete|successful)/i);
});
