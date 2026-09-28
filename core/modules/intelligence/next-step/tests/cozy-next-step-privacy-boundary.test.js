'use strict';

/**
 * core/modules/intelligence/next-step/tests/cozy-next-step-privacy-boundary.test.js
 *
 * Live Next-Step Intelligence — REQUIRED TEST 12: suggestions must
 * never expose or offer another application's actions/data across an
 * application boundary. Same spirit as this repository's existing
 * core/modules/intelligence/answer/tests/cozy-answer-security-boundary.test.js
 * (structural leakage checks against real, composed data), applied to
 * the next-step suggestion surface specifically.
 *
 * Run with: node --test core/modules/intelligence/next-step/tests/cozy-next-step-privacy-boundary.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function load() {
    ['../../language/cozy-language-templates.js', '../../language/cozy-language-realize.js', '../cozy-next-step-action-registry.js', '../cozy-next-step-engine.js', '../../answer/cozy-answer-engine.js']
        .forEach((rel) => { const p = require.resolve(rel); delete require.cache[p]; });
    global.window = { CozyOS: {} };
    require('../../language/cozy-language-templates.js');
    require('../../language/cozy-language-realize.js');
    require('../cozy-next-step-action-registry.js');
    require('../cozy-next-step-engine.js');
    require('../../answer/cozy-answer-engine.js');
    return window.CozyOS;
}

test('NextStepActionRegistry.listActions({appId}) never returns another application\'s actions', () => {
    const CozyOS = load();
    const church = CozyOS.NextStepActionRegistry.listActions({ appId: 'ChurchOS' });
    const quarry = CozyOS.NextStepActionRegistry.listActions({ appId: 'QuarryOS' });
    assert.ok(church.every((a) => a.appId === 'ChurchOS'));
    assert.ok(quarry.every((a) => a.appId === 'QuarryOS'));
    assert.ok(!church.some((a) => a.actionId.startsWith('quarry.')));
    assert.ok(!quarry.some((a) => a.actionId.startsWith('church.')));
});

test('REQUIRED TEST 12 — a ChurchOS-scoped suggestion request never offers a QuarryOS action, even when the raw text also contains QuarryOS-domain keywords', () => {
    const CozyOS = load();
    const churchOnlyActions = CozyOS.NextStepActionRegistry.listActions({ appId: 'ChurchOS' });
    const result = CozyOS.NextStepEngine.suggest({
        input: 'I want to register a new church member and also terminate an employee',
        application: { appId: 'ChurchOS' },
        availableActions: churchOnlyActions // the real, structural boundary: only ChurchOS's own real actions are ever passed in.
    });
    assert.ok(result.suggestions.every((s) => !s.action.actionId.startsWith('quarry.')), 'A ChurchOS context must never surface a QuarryOS action.');
});

test('REQUIRED TEST 12b — cozy-answer-engine.js\'s own attachNextStepSuggestions() resolves availableActions ONLY for the turn\'s own resolved application, never the full catalog', async () => {
    const CozyOS = load();
    const churchResult = await CozyOS.CozyAnswerEngine.answer('I want to terminate an employee', { entityHint: 'ChurchOS' });
    // entityHint says ChurchOS; QuarryOS's own terminate action must never
    // leak into a ChurchOS-scoped turn just because the raw words overlap.
    assert.ok((churchResult.suggestions || []).every((s) => !s.action.actionId.startsWith('quarry.')));

    const quarryResult = await CozyOS.CozyAnswerEngine.answer('I want to register a new church member', { entityHint: 'QuarryOS' });
    assert.ok((quarryResult.suggestions || []).every((s) => !s.action.actionId.startsWith('church.')));
});

test('REQUIRED TEST 12c — an unresolved application (no entityHint, no named-application evidence) receives ZERO suggestions, never the full cross-application catalog', async () => {
    const CozyOS = load();
    const result = await CozyOS.CozyAnswerEngine.answer('I want to register a new church member', {});
    // No entityHint and no contextUsed applicationName (CozyAI/CozyKnowledge
    // aren't loaded in this isolated test) — attachNextStepSuggestions()
    // deliberately narrows availableActions to [] rather than falling back
    // to registry.listActions({}) (every application's real actions at
    // once), specifically to prevent this cross-application leakage.
    assert.deepEqual(result.suggestions, []);
});

test('a suggestion\'s internal `reason` field never contains a raw actorId or other caller-supplied private value', () => {
    const CozyOS = load();
    const churchOnlyActions = CozyOS.NextStepActionRegistry.listActions({ appId: 'ChurchOS' });
    const result = CozyOS.NextStepEngine.suggest({
        input: 'register a new church member',
        application: { appId: 'ChurchOS' },
        availableActions: churchOnlyActions,
        permissions: { actorId: 'super-secret-actor-id-should-never-leak' }
    });
    result.suggestions.forEach((s) => {
        if (s.reason) assert.ok(!s.reason.includes('super-secret-actor-id-should-never-leak'));
    });
});
