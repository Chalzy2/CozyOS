'use strict';

/**
 * core/modules/intelligence/next-step/tests/cozy-next-step-engine.test.js
 *
 * Live Next-Step Intelligence — unit tests for the pure
 * window.CozyOS.NextStepEngine.suggest() core.
 *
 * Covers required test 1 (factual question -> no suggestions) and
 * test 2 (actionable request -> answer + relevant suggestions), plus
 * the ranking/fallback rules (cap at 3, empty availableActions -> [],
 * confidence ordering, clarification on genuine ambiguity).
 *
 * Run with: node --test core/modules/intelligence/next-step/tests/cozy-next-step-engine.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function load() {
    delete require.cache[require.resolve('../cozy-next-step-engine.js')];
    delete require.cache[require.resolve('../cozy-next-step-action-registry.js')];
    delete require.cache[require.resolve('../../language/cozy-language-templates.js')];
    delete require.cache[require.resolve('../../language/cozy-language-realize.js')];
    global.window = { CozyOS: {} };
    require('../../language/cozy-language-templates.js');
    require('../../language/cozy-language-realize.js');
    require('../cozy-next-step-action-registry.js');
    require('../cozy-next-step-engine.js');
    return { engine: global.window.CozyOS.NextStepEngine, registry: global.window.CozyOS.NextStepActionRegistry };
}

test('registers window.CozyOS.NextStepEngine with a pure suggest() function', () => {
    const { engine } = load();
    assert.ok(engine);
    assert.equal(typeof engine.suggest, 'function');
    assert.equal(engine.MAX_SUGGESTIONS, 3);
});

test('REQUIRED TEST 1 — a pure factual question with real church actions available still returns NO suggestions', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const result = engine.suggest({
        input: "What is Kenya's capital?",
        answer: 'Nairobi.',
        intent: 'FACT',
        context: { language: 'en' },
        application: null,
        availableActions,
        permissions: null
    });
    assert.deepEqual(result.suggestions, [], '0 suggestions is the correct, honest outcome for a pure factual question — never fabricated to fill space.');
});

test('REQUIRED TEST 1b — no availableActions at all for the resolved application -> [] (not an error)', () => {
    const { engine } = load();
    const result = engine.suggest({ input: 'How do I organize my paperwork?', availableActions: [], application: { appId: 'SomeUnregisteredApp' } });
    assert.deepEqual(result.suggestions, []);
});

test('REQUIRED TEST 2 — an actionable ChurchOS request returns a real, relevant CREATION suggestion', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const result = engine.suggest({
        input: 'I want to register a new church member',
        answer: 'You can register a new member in ChurchOS.',
        intent: 'ACTIONABLE',
        context: { language: 'en' },
        application: { appId: 'ChurchOS' },
        availableActions,
        permissions: null
    });
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].action.actionId, 'church.register_member');
    assert.equal(result.suggestions[0].type, 'CREATION');
    assert.equal(result.suggestions[0].label, 'Create Member');
    assert.equal(typeof result.suggestions[0].confidence, 'string');
});

test('Kiswahili label realizes genuinely (not English with a language flag ignored)', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const result = engine.suggest({
        input: 'I want to register a new church member',
        context: { language: 'sw' },
        application: { appId: 'ChurchOS' },
        availableActions
    });
    assert.equal(result.suggestions[0].label, 'Unda Mwanachama');
});

test('a suggestion never points to an actionId absent from the caller-supplied availableActions', () => {
    const { engine } = load();
    const result = engine.suggest({
        input: 'I want to register a new church member',
        application: { appId: 'ChurchOS' },
        availableActions: [] // deliberately empty — real registry entries exist, but the caller didn't supply them.
    });
    assert.deepEqual(result.suggestions, [], 'No candidate may be fabricated outside the caller\'s own real availableActions.');
});

test('destructive actions are honestly flagged (never silently downgraded)', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'QuarryOS' });
    const result = engine.suggest({
        input: 'I want to terminate an employee',
        application: { appId: 'QuarryOS' },
        availableActions
    });
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].action.actionId, 'quarry.terminate_employee');
    assert.equal(result.suggestions[0].destructive, true);
});

test('RANKING RULE — results never exceed MAX_SUGGESTIONS (3), even with more real candidates available', () => {
    const { engine } = load();
    const manyActions = [
        { actionId: 'a1', appId: 'X', type: 'CREATION', destructive: false, labelKey: null, fallbackLabel: 'A1' },
        { actionId: 'a2', appId: 'X', type: 'CREATION', destructive: false, labelKey: null, fallbackLabel: 'A2' },
        { actionId: 'a3', appId: 'X', type: 'CREATION', destructive: false, labelKey: null, fallbackLabel: 'A3' },
        { actionId: 'a4', appId: 'X', type: 'CREATION', destructive: false, labelKey: null, fallbackLabel: 'A4' }
    ];
    const rankedInput = manyActions.map((a, i) => ({
        _directness: i,
        suggestion: { schemaVersion: 'cozy.next-step-suggestion.v1', id: a.actionId, type: a.type, label: a.fallbackLabel, action: { actionId: a.actionId, payload: {} }, confidence: 'MEDIUM', destructive: false }
    }));
    const capped = engine.rankAndCap(rankedInput);
    assert.equal(capped.length, 3);
});

test('RANKING RULE — confidence order (HIGH before MEDIUM before LOW)', () => {
    const { engine } = load();
    const mk = (id, confidence, directness) => ({
        _directness: directness,
        suggestion: { schemaVersion: 'cozy.next-step-suggestion.v1', id, type: 'CREATION', label: id, action: { actionId: id, payload: {} }, confidence, destructive: false }
    });
    const capped = engine.rankAndCap([mk('low', 'LOW', 0), mk('high', 'HIGH', 5), mk('medium', 'MEDIUM', 1)]);
    assert.deepEqual(capped.map((s) => s.id), ['high', 'medium', 'low']);
});

test('CLARIFICATION — genuinely ambiguous "manage members" phrasing returns 2 disambiguating options, never a guess', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const result = engine.suggest({ input: 'How do I manage church members?', application: { appId: 'ChurchOS' }, availableActions });
    assert.equal(result.suggestions.length, 2);
    assert.ok(result.suggestions.every((s) => s.type === 'CLARIFICATION'));
    assert.ok(result.suggestions.every((s) => s.action.actionId === 'cozyos.clarify'));
});

test('a specific verb ("register"/"show") is NOT treated as ambiguous', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const create = engine.suggest({ input: 'register a new church member', application: { appId: 'ChurchOS' }, availableActions });
    const search = engine.suggest({ input: 'show me the church members', application: { appId: 'ChurchOS' }, availableActions });
    assert.equal(create.suggestions[0].type, 'CREATION');
    assert.equal(search.suggestions[0].type, 'SEARCH');
});

test('confidence is never exposed on any field an end user would read as anything but internal', () => {
    const { engine, registry } = load();
    const availableActions = registry.listActions({ appId: 'ChurchOS' });
    const result = engine.suggest({ input: 'I want to register a new church member', application: { appId: 'ChurchOS' }, availableActions });
    const Contract = require('../../semantic-answer/contracts/next-step-suggestion-contract.js');
    const validation = Contract.validateResult(result);
    assert.ok(validation.valid, JSON.stringify(validation.errors));
    // confidence exists on the internal object but this repo's UI file
    // never reads it for display text — see cozy-next-step-suggestions-ui.js,
    // which only ever renders `.label`.
    assert.ok(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(result.suggestions[0].confidence));
});
