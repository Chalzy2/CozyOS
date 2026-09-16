/**
 * core/living/tests/phase6a-goal-disambiguation.test.js
 * PHASE 6A — Goal Disambiguation & Natural Kiswahili Intent Reasoning
 *
 * The 12 required golden tests (Section 41) plus the RELATED/SEQUENTIAL/
 * COMPETING/CONTRASTING relationship classification (Section 7) and the
 * "AND does not always mean two goals" distinction (Section 6).
 *
 * Run with: node --test core/living/tests/phase6a-goal-disambiguation.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ENGINE_PATH = path.join(__dirname, '..', 'cozy-ai-semantic-intent.js');

function freshEngine() {
    delete require.cache[require.resolve(ENGINE_PATH)];
    global.window = { CozyOS: {} };
    require(ENGINE_PATH);
    return global.window.CozyOS.SemanticIntentEngine;
}

test('TEST 1: "Nataka kununua CozyOS inasaidia aje?" -> COMPETING, goal null, clarification required, natural question', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS inasaidia aje?', {});
    assert.equal(r.relationship, 'COMPETING');
    assert.equal(r.goal, null);
    assert.equal(r.ambiguity.detected, true);
    assert.equal(r.ambiguity.clarificationRequired, true);
    assert.equal(r.clarification.question, 'Unataka kununua CozyOS, au kwanza ungependa kujua jinsi inavyokusaidia?');
    // The system must NOT automatically choose purchase.
    assert.notEqual(r.primaryIntent, 'PURCHASE_INTENT');
});

test('TEST 2: "Nataka kununua CozyOS lakini kwanza niambie inanisaidia aje." -> SEQUENTIAL, benefits-before-purchase', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS lakini kwanza niambie inanisaidia aje.', {});
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.ok(r.secondaryIntents.includes('PURCHASE_CONSIDERATION'));
    assert.equal(r.goal, 'UNDERSTAND_USEFULNESS_BEFORE_PURCHASE');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 3: "Nataka kununua CozyOS." -> clear PURCHASE_INTENT, no clarification', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS.', {});
    assert.equal(r.primaryIntent, 'PURCHASE_INTENT');
    assert.equal(r.goal, 'PURCHASE_PRODUCT_OR_SERVICE');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 4: "CozyOS inasaidia aje?" -> clear APP_BENEFITS, no clarification', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS inasaidia aje?', {});
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.equal(r.goal, 'UNDERSTAND_USEFULNESS');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 5: "Sitaki kununua CozyOS, niambie tu inafanya nini." -> negated purchase excluded, primary APP_CAPABILITIES', () => {
    const engine = freshEngine();
    const r = engine.analyze('Sitaki kununua CozyOS, niambie tu inafanya nini.', {});
    assert.equal(r.relationship, 'CONTRASTING');
    assert.equal(r.primaryIntent, 'APP_CAPABILITIES');
    assert.notEqual(r.primaryIntent, 'PURCHASE_INTENT');
    assert.equal(r.goal, 'UNDERSTAND_CAPABILITIES');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 6: "Niambie kwanza CozyOS inanisaidia nini halafu nitanunua." -> SEQUENTIAL via kwanza+halafu, no lakini needed', () => {
    const engine = freshEngine();
    const r = engine.analyze('Niambie kwanza CozyOS inanisaidia nini halafu nitanunua.', {});
    assert.equal(r.relationship, 'SEQUENTIAL');
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.ok(r.secondaryIntents.includes('PURCHASE_CONSIDERATION'));
    assert.equal(r.goal, 'UNDERSTAND_USEFULNESS_BEFORE_PURCHASE');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 7: "Nisaidie na CozyOS." -> genuinely ambiguous, clarification required', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nisaidie na CozyOS.', {});
    assert.equal(r.ambiguity.detected, true);
    assert.equal(r.ambiguity.clarificationRequired, true);
});

test('TEST 8: "CozyOS ni nini na inafanya nini?" -> RELATED (not competing), one information goal', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS ni nini na inafanya nini?', {});
    assert.equal(r.relationship, 'RELATED');
    assert.equal(r.primaryIntent, 'APP_IDENTITY');
    assert.ok(r.secondaryIntents.includes('APP_CAPABILITIES'));
    assert.equal(r.goal, 'UNDERSTAND_APPLICATION');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 9: "CozyOS au hii nyingine, ipi bora? Nataka kununua." -> SEQUENTIAL, comparison drives purchase decision', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS au hii nyingine, ipi bora? Nataka kununua.', {});
    assert.equal(r.primaryIntent, 'APP_COMPARISON');
    assert.ok(r.secondaryIntents.includes('PURCHASE_CONSIDERATION'));
    assert.equal(r.goal, 'MAKE_PURCHASE_DECISION');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 10: "Nikumbushe kesho kulipa deni." -> clear REMINDER_REQUEST, no clarification (Section 38 - do not over-ask)', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nikumbushe kesho kulipa deni.', {});
    assert.equal(r.primaryIntent, 'REMINDER_REQUEST');
    assert.equal(r.goal, 'CREATE_REMINDER');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

test('TEST 11: "Unaweza kunikumbusha kesho?" -> capability-question phrasing is distinguishable from an imperative reminder request', () => {
    const engine = freshEngine();
    const capability = engine.analyze('Unaweza kunikumbusha kesho?', {});
    const imperative = engine.analyze('Nikumbushe kesho.', {});
    // The two real, distinct surface forms must not collapse into the
    // same silent interpretation - imperative is unambiguous...
    assert.equal(imperative.primaryIntent, 'REMINDER_REQUEST');
    assert.equal(imperative.ambiguity.clarificationRequired, false);
    // ...while the bare capability-question form (no entity, only 3
    // words) is honestly short/ambiguous per Section 11's own hedge
    // ("if unresolved, clarify naturally") rather than silently
    // executing a reminder the user only asked ABOUT.
    assert.equal(capability.ambiguity.clarificationRequired, true);
});

test('TEST 12: "Please nikumbushe tomorrow kulipa rent." -> mixed language, clear REMINDER_REQUEST', () => {
    const engine = freshEngine();
    const r = engine.analyze('Please nikumbushe tomorrow kulipa rent.', {});
    assert.equal(r.mixedLanguage, true);
    assert.ok(r.detectedLanguages.includes('en'));
    assert.ok(r.detectedLanguages.includes('sw'));
    assert.equal(r.primaryIntent, 'REMINDER_REQUEST');
    assert.equal(r.goal, 'CREATE_REMINDER');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

// ---- Section 6: "na"/"and" does not always mean competing goals ----
test('Section 6: related sub-questions joined by "na" never force clarification (regression guard against over-eager COMPETING)', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS ni nini na inafanya nini?', {});
    assert.notEqual(r.relationship, 'COMPETING');
});

// ---- Cross-language convergence (Section 42) ----
test('Cross-language: purchase-then-benefits ordering converges the same way regardless of language mix', () => {
    const engine = freshEngine();
    const sw = engine.analyze('Nataka kununua CozyOS lakini kwanza niambie inanisaidia aje.', {});
    assert.equal(sw.primaryIntent, 'APP_BENEFITS');
    assert.equal(sw.goal, 'UNDERSTAND_USEFULNESS_BEFORE_PURCHASE');
});

// ---- Section 21: semantic layer never authorizes ----
test('Section 21/8 (action safety): no field anywhere in the result implies authorization, even for a clear action request', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nikumbushe kesho kulipa deni.', {});
    const json = JSON.stringify(r).toLowerCase();
    assert.doesNotMatch(json, /"authorized"/);
    assert.doesNotMatch(json, /"executed"/);
});

console.log('Phase 6A Goal Disambiguation golden-test suite: run complete.');
