/**
 * core/living/tests/phase6-semantic-intent-engine.test.js
 * PHASE 6 — Semantic Intent Understanding Engine
 *
 * Covers the required test matrix (Section 26) categories A-N plus
 * O (authorization separation, proven by absence) and backward-
 * compatibility/regression checks (S/T). Q/R (voice/OCR path
 * equivalence) are proven at the level this phase actually operates:
 * analyze() takes a plain string regardless of how it was produced, so
 * a caller feeding it STT or OCR output receives byte-identical
 * treatment to typed text — there is no separate voice/OCR code path
 * to diverge, by construction rather than by a separate test fixture.
 *
 * Run with: node --test core/living/tests/phase6-semantic-intent-engine.test.js
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

// ---- A. Kiswahili direct intent ----
test('A: "Nataka kununua CozyOS" -> PURCHASE_INTENT/sw/PURCHASE_PRODUCT_OR_SERVICE', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS', {});
    assert.equal(r.language, 'sw');
    assert.equal(r.primaryIntent, 'PURCHASE_INTENT');
    assert.deepEqual(r.secondaryIntents, []);
    assert.equal(r.goal, 'PURCHASE_PRODUCT_OR_SERVICE');
    assert.equal(r.entity.value, 'CozyOS');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

// ---- B. Kiswahili natural variation (Section 25 — must not overfit to one exact string) ----
test('B: natural purchase-intent variations all converge on PURCHASE_INTENT', () => {
    const engine = freshEngine();
    for (const text of ['Ningependa kununua CozyOS', 'Naweza kupata CozyOS?', 'Nataka kuwa mteja wa CozyOS', 'Nahitaji kununua CozyOS']) {
        const r = engine.analyze(text, {});
        assert.equal(r.primaryIntent, 'PURCHASE_INTENT', `"${text}" should converge on PURCHASE_INTENT`);
    }
});

// ---- C. Kiswahili incomplete phrasing ----
test('C: "Nisaidie na CozyOS" (incomplete/vague) is honestly ambiguous, never guessed', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nisaidie na CozyOS', {});
    assert.equal(r.ambiguity.clarificationRequired, true);
    assert.notEqual(r.primaryIntent, 'PURCHASE_INTENT');
});

// ---- D. Kiswahili conversational phrasing ----
test('D: "CozyOS inasaidiaje?" -> APP_BENEFITS/UNDERSTAND_USEFULNESS', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS inasaidiaje?', {});
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.equal(r.goal, 'UNDERSTAND_USEFULNESS');
});

// ---- E. Kiswahili implicit intent ----
test('E: implied troubleshooting without the word "tatizo"', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS haifanyi kazi', {});
    assert.equal(r.primaryIntent, 'TROUBLESHOOTING');
    assert.equal(r.goal, 'RESOLVE_PROBLEM');
});

// ---- F. Kiswahili mixed English ----
test('F: "Nataka kununua CozyOS but sijui inanisaidia nini" -> Phase 6A: COMPETING (no ordering marker), not silently PURCHASE_INTENT', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS but sijui inanisaidia nini', {});
    assert.equal(r.mixedLanguage, true);
    assert.ok(r.detectedLanguages.includes('sw'));
    assert.ok(r.detectedLanguages.includes('en'));
    // PHASE 6A CORRECTION: with no "kwanza"/priority marker, purchase +
    // benefits in one message is genuinely COMPETING (Section 1 of the
    // Phase 6A spec, identical shape to golden Test 1) - the original
    // Phase 6 test asserted the OLD, less accurate "always primary
    // purchase" behavior Phase 6A specifically exists to fix.
    assert.equal(r.relationship, 'COMPETING');
    assert.equal(r.primaryIntent, 'UNKNOWN_INTENT');
    assert.equal(r.ambiguity.clarificationRequired, true);
});

// ---- G. English equivalent ----
test('G: English "How does CozyOS help me?" converges on the SAME intent/goal as the Kiswahili equivalent', () => {
    const engine = freshEngine();
    const en = engine.analyze('How does CozyOS help me?', {});
    const sw = engine.analyze('CozyOS inasaidiaje?', {});
    assert.equal(en.primaryIntent, sw.primaryIntent);
    assert.equal(en.goal, sw.goal);
    assert.equal(en.language, 'en');
    assert.equal(sw.language, 'sw');
});

test('G2: English "I want to buy CozyOS." converges with Kiswahili "Nataka kununua CozyOS"', () => {
    const engine = freshEngine();
    const en = engine.analyze('I want to buy CozyOS.', {});
    const sw = engine.analyze('Nataka kununua CozyOS', {});
    assert.equal(en.primaryIntent, sw.primaryIntent);
    assert.equal(en.goal, sw.goal);
});

// ---- H. Primary vs secondary intent ----
test('H: "Nataka kununua CozyOS lakini kwanza nieleze inanisaidia nini" -> Phase 6A: "kwanza" in the second clause makes APP_BENEFITS primary', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS lakini kwanza nieleze inanisaidia nini', {});
    // PHASE 6A CORRECTION: "kwanza" is a real priority marker (Section 5
    // of the Phase 6A spec) - it establishes that the benefits question
    // is the IMMEDIATE goal regardless of which clause reads first,
    // exactly matching golden Test 2. The original Phase 6 test's
    // "primary is always whichever clause comes first" rule is the
    // specific gap Phase 6A closes.
    assert.equal(r.relationship, 'SEQUENTIAL');
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.ok(r.secondaryIntents.includes('PURCHASE_CONSIDERATION'));
    assert.equal(r.goal, 'UNDERSTAND_USEFULNESS_BEFORE_PURCHASE');
    assert.equal(r.ambiguity.clarificationRequired, false);
});

// ---- I. Goal extraction (goal != intent, controlled ontology) ----
test('I: goal is a distinct, controlled value, never a copy of the intent string', () => {
    const engine = freshEngine();
    const r = engine.analyze('CozyOS ni nini?', {});
    assert.equal(r.primaryIntent, 'APP_IDENTITY');
    assert.equal(r.goal, 'UNDERSTAND_ENTITY');
    assert.notEqual(r.goal, r.primaryIntent);
});

// ---- J. Entity extraction ----
test('J: entity is spotted independent of intent, and is null when genuinely absent', () => {
    const engine = freshEngine();
    const withEntity = engine.analyze('CozyOS inaweza kufanya nini?', {});
    assert.equal(withEntity.entity.value, 'CozyOS');
    const withoutEntity = engine.analyze('Nikumbushe kesho kulipa deni', {});
    assert.equal(withoutEntity.entity.value, null); // honest - no known entity named, never invented
});

// ---- K. Contextual follow-up ----
test('K: "Na inanisaidiaje?" resolves entity from context without the user repeating "CozyOS"', () => {
    const engine = freshEngine();
    const r = engine.analyze('Na inanisaidiaje?', { previousEntity: 'CozyOS' });
    assert.equal(r.primaryIntent, 'APP_BENEFITS');
    assert.equal(r.entity.value, 'CozyOS');
    assert.equal(r.entity.resolvedVia, 'contextual-carryover');
});

test('K2: without any previousEntity context, the same message honestly has no entity, never guessed', () => {
    const engine = freshEngine();
    const r = engine.analyze('Na inanisaidiaje?', {});
    assert.equal(r.entity.value, null);
});

// ---- L. Ambiguity ----
test('L: "Sitaki kununua CozyOS." is real negation -> REJECTION, never PURCHASE_INTENT', () => {
    const engine = freshEngine();
    const r = engine.analyze('Sitaki kununua CozyOS.', {});
    assert.equal(r.primaryIntent, 'REJECTION');
    assert.notEqual(r.primaryIntent, 'PURCHASE_INTENT');
    assert.equal(r.goal, 'DECLINE_ACTION');
});

// ---- M. Clarification ----
test('M: ambiguity.detected true implies clarificationRequired true (never one without the other)', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nisaidie na CozyOS', {});
    assert.equal(r.ambiguity.detected, r.ambiguity.clarificationRequired);
});

// ---- N. Confidence (HIGH/MEDIUM/LOW only, never fabricated numeric) ----
test('N: confidence is always one of HIGH/MEDIUM/LOW, never a bare numeric value', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nataka kununua CozyOS', {});
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(r.confidence.overall));
    assert.equal(typeof r.confidence.overall, 'string');
});

test('N2: getEngineHonesty() explicitly discloses this is not a statistical/trained model', () => {
    const engine = freshEngine();
    const honesty = engine.getEngineHonesty();
    assert.equal(honesty.isStatisticalModel, false);
    assert.equal(honesty.isTrainedOnData, false);
    assert.equal(honesty.numericConfidenceAvailable, false);
});

// ---- O. Authorization separation (proven by absence) ----
test('O: the result object has no field that could be mistaken for an authorization decision', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nifute account ya kampuni', {});
    const json = JSON.stringify(r).toLowerCase();
    assert.doesNotMatch(json, /"authorized"/);
    assert.doesNotMatch(json, /"permission"/);
    assert.doesNotMatch(json, /"role"/);
});

// ---- P. Correction learning hook ----
test('P: recordCorrection() creates an inert candidate, never mutates classification rules', () => {
    const engine = freshEngine();
    const before = engine.analyze('CozyOS inasaidiaje?', {});
    const { candidate, persisted } = engine.recordCorrection({
        requestId: 'req_1',
        originalInterpretation: 'APP_CAPABILITIES',
        correctedInterpretation: 'APP_BENEFITS',
        language: 'sw'
    });
    assert.equal(candidate.status, 'candidate');
    assert.equal(candidate.scope, 'intent');
    assert.equal(persisted, false); // no CozyMemory loaded in this test -> honestly unpersisted, not silently dropped
    const after = engine.analyze('CozyOS inasaidiaje?', {});
    assert.equal(before.primaryIntent, after.primaryIntent); // rules unchanged by the correction
});

// ---- Additional golden cases from the spec ----
test('Case 5: "Nawezaje kuanza kutumia CozyOS?" -> APP_SETUP/START_USING_APPLICATION', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nawezaje kuanza kutumia CozyOS?', {});
    assert.equal(r.primaryIntent, 'APP_SETUP');
    assert.equal(r.goal, 'START_USING_APPLICATION');
});

test('Case 6: "Nikumbushe kesho kulipa deni" -> REMINDER_REQUEST/CREATE_REMINDER', () => {
    const engine = freshEngine();
    const r = engine.analyze('Nikumbushe kesho kulipa deni', {});
    assert.equal(r.primaryIntent, 'REMINDER_REQUEST');
    assert.equal(r.goal, 'CREATE_REMINDER');
});

test('Case 15: "Please nikumbushe tomorrow kulipa rent." -> mixed language, REMINDER_REQUEST', () => {
    const engine = freshEngine();
    const r = engine.analyze('Please nikumbushe tomorrow kulipa rent.', {});
    assert.equal(r.mixedLanguage, true);
    assert.ok(r.detectedLanguages.includes('en'));
    assert.ok(r.detectedLanguages.includes('sw'));
    assert.equal(r.primaryIntent, 'REMINDER_REQUEST');
    assert.equal(r.goal, 'CREATE_REMINDER');
});

// ---- S/T. Regression / backward compatibility ----
test('S/T: engine loads standalone with zero dependency on rule-based-conversational-provider.js', () => {
    // Deliberately does NOT require the provider file at all in this
    // test - proves Section 35 provider-independence structurally,
    // not just by comment.
    const engine = freshEngine();
    assert.equal(typeof engine.analyze, 'function');
    const r = engine.analyze('Habari', {});
    assert.ok(r); // does not throw, does not require any other CozyOS module to be loaded
});

console.log('Phase 6 Semantic Intent Understanding Engine suite: run complete.');
