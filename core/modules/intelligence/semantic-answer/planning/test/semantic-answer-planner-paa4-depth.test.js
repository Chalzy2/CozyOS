'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-paa4-depth.test.js
 *
 * PAA-4 (Depth-Adaptive Cognitive Composition) — focused unit tests for
 * classifyAnswerDepth() and planAnswer()'s depth-adaptive claim
 * selection for HUMAN_BENEFIT/BENEFITS.
 *
 * REGRESSION-SAFETY IS THE CENTRAL CLAIM OF THIS FILE: the DEFAULT
 * (no depth marker) behavior for HUMAN_BENEFIT must remain byte-
 * identical to the existing, pre-PAA-4 behavior — see
 * semantic-answer-planner.test.js's own "CONVERGENCE 1/3" and "SA-2
 * boundary preserved" tests (claims.length > 3 / > 1 for exactly the
 * bare "ChurchOS inasaidiaje mtu?" phrasing) — this file proves those
 * same fixtures are UNCHANGED after this addition, then adds NEW,
 * genuinely novel test cases (explicit brief/detail markers) that
 * exercise ONLY the new, opt-in code paths.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-paa4-depth.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStack } = require('./_test-helpers');

// ---- classifyAnswerDepth() unit behavior ----

test('classifyAnswerDepth: DEFINITION/UNDERSTAND_CONCEPT always SHORT_EXPLANATION regardless of text', () => {
    const { planner } = loadFullStack();
    assert.equal(planner.classifyAnswerDepth('DEFINITION', 'kwa undani ni nini ChurchOS'), 'SHORT_EXPLANATION');
    assert.equal(planner.classifyAnswerDepth('UNDERSTAND_CONCEPT', 'maana ya neno'), 'SHORT_EXPLANATION');
});

test('classifyAnswerDepth: a goal outside the depth-adaptive set always STRUCTURED_EXPLANATION (informational only, no behavior hooks on it)', () => {
    const { planner } = loadFullStack();
    assert.equal(planner.classifyAnswerDepth('DIFFERENTIATION', 'kwa undani'), 'STRUCTURED_EXPLANATION');
});

test('classifyAnswerDepth: HUMAN_BENEFIT with NO marker defaults to STRUCTURED_EXPLANATION (today\'s existing behavior, unchanged)', () => {
    const { planner } = loadFullStack();
    assert.equal(planner.classifyAnswerDepth('HUMAN_BENEFIT', 'ChurchOS inasaidiaje mtu'), 'STRUCTURED_EXPLANATION');
    assert.equal(planner.classifyAnswerDepth('HUMAN_BENEFIT', 'how does churchos help people'), 'STRUCTURED_EXPLANATION');
});

test('classifyAnswerDepth: an explicit brief marker (EN+SW) on HUMAN_BENEFIT/BENEFITS -> DIRECT', () => {
    const { planner } = loadFullStack();
    assert.equal(planner.classifyAnswerDepth('HUMAN_BENEFIT', 'churchos inasaidia nini kwa ufupi'), 'DIRECT');
    assert.equal(planner.classifyAnswerDepth('BENEFITS', 'briefly what does churchos help with'), 'DIRECT');
});

test('classifyAnswerDepth: an explicit detail marker (EN+SW) on HUMAN_BENEFIT/BENEFITS -> DEEP_EXPLANATION', () => {
    const { planner } = loadFullStack();
    assert.equal(planner.classifyAnswerDepth('HUMAN_BENEFIT', 'eleza kwa undani churchos inasaidiaje kanisa'), 'DEEP_EXPLANATION');
    assert.equal(planner.classifyAnswerDepth('BENEFITS', 'explain in detail how churchos helps a church'), 'DEEP_EXPLANATION');
});

// ---- planAnswer() — regression fixtures (must remain unchanged) ----

test('REGRESSION: "ChurchOS inasaidiaje mtu?" (no marker) still produces > 3 claims and detailLevel STRUCTURED_EXPLANATION', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inasaidiaje mtu?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.ok(result.plan.claims.length > 3, 'default behavior must remain unchanged — this is the exact pre-existing regression fixture');
    assert.equal(result.plan.detailLevel, 'STRUCTURED_EXPLANATION');
});

test('REGRESSION: "How does ChurchOS help people?" (no marker) still includes the real "multilingual participation" claim among many', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does ChurchOS help people?' });
    assert.equal(result.success, true);
    assert.ok(result.plan.claims.some((c) => c.text === 'multilingual participation'));
    assert.ok(result.plan.claims.length > 3);
});

// ---- planAnswer() — NEW, opt-in DIRECT (brief) path ----

test('NEW: "ChurchOS inasaidia nini kwa ufupi?" (explicit brief marker) selects exactly ONE real, grounded claim', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'ChurchOS inasaidia nini kwa ufupi?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.goal, 'HUMAN_BENEFIT');
    assert.equal(result.plan.detailLevel, 'DIRECT');
    assert.equal(result.plan.claims.length, 1, 'DIRECT depth must select exactly one claim, never zero, never many');
    assert.ok(result.plan.claims[0].evidenceIds.length === 1, 'the single claim must still be grounded in a real evidence id, never a fabricated string');
});

test('NEW: "What does ChurchOS help with, briefly?" (EN brief marker) also selects exactly one claim', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'What does ChurchOS help with, briefly?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'DIRECT');
    assert.equal(result.plan.claims.length, 1);
});

// ---- planAnswer() — NEW, opt-in DEEP_EXPLANATION path (real benefitAreas for ChurchOS) ----

test('NEW: "Eleza kwa undani ChurchOS inasaidiaje kanisa?" (explicit detail marker) selects real, topic-grouped benefitAreas claims for ChurchOS', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Eleza kwa undani ChurchOS inasaidiaje kanisa?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.ok(result.plan.claims.length >= 3 && result.plan.claims.length <= 6);
    const texts = result.plan.claims.map((c) => c.text);
    assert.ok(texts.some((t) => /Wanachama|Members/.test(t)), 'expected real, topic-grouped benefitAreas evidence, not the flat humanBenefits list');
    assert.ok(texts.every((t) => /Faida:|Benefit:/.test(t)), 'every DEEP_EXPLANATION claim for ChurchOS must be a real point+benefit unit, never a bare fact fragment');
});

test('NEW: "How does ChurchOS help a church in detail?" (EN) also resolves to real benefitAreas claims', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'How does ChurchOS help a church in detail?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.ok(result.plan.claims.every((c) => /Benefit:/.test(c.text)));
});

test('GRACEFUL FALLBACK: an application with no authored benefitAreas yet still answers honestly at DEEP_EXPLANATION depth (falls back to real humanBenefits claims, never a fabricated structure, never an empty/broken answer)', () => {
    const { planner } = loadFullStack();
    const result = planner.planAnswer({ text: 'Eleza kwa undani ShopOS inasaidiaje?' });
    assert.equal(result.success, true);
    assert.equal(result.plan.detailLevel, 'DEEP_EXPLANATION');
    assert.ok(result.plan.claims.length > 0, 'must still produce a real, honest answer even without benefitAreas authored for this entity');
});
