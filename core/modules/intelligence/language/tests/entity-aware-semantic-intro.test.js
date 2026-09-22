'use strict';

/**
 * core/modules/intelligence/language/tests/entity-aware-semantic-intro.test.js
 *
 * Focused tests for PRE-EXISTING-FAILURE-REGISTER.md §3.5's repair:
 * the "semantic-answer:intro:*" templates in cozy-language-templates.js
 * were fixed, entity-agnostic strings ("this"/"hii"), so an otherwise
 * correct, evidence-backed multi-claim answer could never actually name
 * the application it was describing. They are now entity-aware
 * functions, composed via the EXISTING cozy-language-realize.js seam's
 * own already-supported realize(key, language, ...params) mechanism —
 * no new template store, no new realization system, no new AI.
 *
 * Proves:
 *   A. realize() passes an entity name through to a function-shaped
 *      template and gets the entity-named string back.
 *   B. realize() with no entity name reproduces the EXACT original
 *      generic wording, byte-for-byte, for every affected goal/language.
 *   C. LanguageRealizer.introFor() threads the entity name through the
 *      same seam.
 *   D. End-to-end: a real multi-claim SemanticAnswerPlan with a real
 *      entity produces a candidate sentence that names it.
 *   E. End-to-end: a single-claim plan (no intro used at all — the
 *      claim's own real evidence text is returned verbatim) is
 *      completely unaffected by this change.
 *   F. The intro never carries anything beyond the entity's own name —
 *      no raw claim/evidence text leaks through the intro mechanism
 *      itself (ties to the Cluster 6 privacy audit).
 *
 * Run with: node --test core/modules/intelligence/language/tests/entity-aware-semantic-intro.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', 'cozy-language-realize.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'cozy-language-registry.js');
const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'semantic-answer', 'contracts');
const REALIZER_PATH = path.join(__dirname, '..', '..', 'semantic-answer', 'realization', 'language-realizer.js');

const CONTRACT_FILES = [
    'semantic-answer-plan-contract.js',
    'verified-evidence-contract.js',
    'language-realization-request-contract.js',
    'candidate-sentence-contract.js',
].map((f) => path.join(CONTRACTS_DIR, f));

// SA-1's own shared fixtures (reused by every later phase's own tests —
// see that file's own header) rather than hand-built payloads, so D/E
// below validate against the exact same real, contract-valid shape
// language-realizer.test.js already does.
const { VALID_HUMAN_BENEFIT_SW } = require('../../semantic-answer/fixtures/semantic-answer-plan-fixtures');
const { VALID_SW_REQUEST } = require('../../semantic-answer/fixtures/language-realization-request-fixtures');

function freshStack() {
    [REGISTRY_PATH, TEMPLATES_PATH, REALIZE_SEAM_PATH, REALIZER_PATH, ...CONTRACT_FILES]
        .forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    require(REGISTRY_PATH);
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    CONTRACT_FILES.forEach((p) => require(p));
    require(REALIZER_PATH);
    return {
        realize: global.window.CozyOS.CozyLanguageRealize,
        realizer: global.window.CozyOS.LanguageRealizer,
    };
}

/* ------------------------------------------------------------------ */
/* A/B: the existing realize() seam, exercised directly                */
/* ------------------------------------------------------------------ */

const GOALS_EN = {
    HUMAN_BENEFIT: { generic: "Here's how this helps:", named: "Here's how ShopOS helps:" },
    BENEFITS: { generic: "Here's how this helps:", named: "Here's how ShopOS helps:" },
    CAPABILITY: { generic: "Here's what this can currently do:", named: "Here's what ShopOS can currently do:" },
    LIST: { generic: "Here's what this can currently do:", named: "Here's what ShopOS can currently do:" },
    IMPORTANCE: { generic: "Here's why this matters:", named: "Here's why ShopOS matters:" },
    VALUE: { generic: "Here's why this matters:", named: "Here's why ShopOS matters:" },
    PRACTICAL_WORK_CONTRIBUTION: { generic: "Here's how this contributes to real work:", named: "Here's how ShopOS contributes to real work:" },
    DEFINITION: { generic: "Here's what this is:", named: "Here's what ShopOS is:" },
};

for (const [goal, { generic, named }] of Object.entries(GOALS_EN)) {
    test(`A: realize("semantic-answer:intro:${goal}", "en", "ShopOS") returns the entity-named string`, () => {
        const { realize } = freshStack();
        assert.equal(realize.realize(`semantic-answer:intro:${goal}`, 'en', 'ShopOS'), named);
    });

    test(`B: realize("semantic-answer:intro:${goal}", "en") with NO entity name reproduces the exact original generic wording`, () => {
        const { realize } = freshStack();
        assert.equal(realize.realize(`semantic-answer:intro:${goal}`, 'en'), generic);
    });
}

test('A/SW: the Kiswahili HUMAN_BENEFIT intro correctly names a real entity', () => {
    const { realize } = freshStack();
    assert.equal(realize.realize('semantic-answer:intro:HUMAN_BENEFIT', 'sw', 'ChurchOS'), 'Hivi ndivyo ChurchOS inavyosaidia:');
});

test('B/SW: the Kiswahili HUMAN_BENEFIT intro with no entity reproduces the exact original generic wording', () => {
    const { realize } = freshStack();
    assert.equal(realize.realize('semantic-answer:intro:HUMAN_BENEFIT', 'sw'), 'Hivi ndivyo hii inavyosaidia:');
});

test('B: an empty-string entity name is treated the same as no entity — never renders a blank/malformed intro', () => {
    const { realize } = freshStack();
    assert.equal(realize.realize('semantic-answer:intro:HUMAN_BENEFIT', 'en', ''), "Here's how this helps:");
});

/* ------------------------------------------------------------------ */
/* C: LanguageRealizer.introFor() threads entityName through the seam  */
/* ------------------------------------------------------------------ */

test('C: LanguageRealizer.introFor() passes a supplied entity name through to the real seam', () => {
    const { realizer } = freshStack();
    assert.equal(realizer.introFor('CAPABILITY', 'en', 'MpesaOS'), "Here's what MpesaOS can currently do:");
});

test('C: LanguageRealizer.introFor() with no entity name is byte-identical to the pre-fix behavior', () => {
    const { realizer } = freshStack();
    assert.equal(realizer.introFor('CAPABILITY', 'en'), "Here's what this can currently do:");
});

/* ------------------------------------------------------------------ */
/* D: end-to-end — a real multi-claim plan with a real entity           */
/* ------------------------------------------------------------------ */

test('D: a real multi-claim SemanticAnswerPlan with a real entity produces a candidate sentence that names it', () => {
    const { realizer } = freshStack();
    // Same real, shared SA-1 plan shape as language-realizer.test.js's
    // own Test B, with the entity swapped to QuarryOS to prove this
    // isn't hardcoded to any one application name.
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'QuarryOS' } };
    const evidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'Tracks real quarry site records.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'Reduces manual paperwork for site managers.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
    ];
    const request = { ...VALID_SW_REQUEST, semanticPlan: plan, evidence };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.match(result.candidate.text, /^Hivi ndivyo QuarryOS inavyosaidia:/);
    assert.match(result.candidate.text, /Tracks real quarry site records/);
    assert.match(result.candidate.text, /Reduces manual paperwork for site managers/);
});

/* ------------------------------------------------------------------ */
/* E: single-claim plans are completely unaffected                     */
/* ------------------------------------------------------------------ */

test('E: a single-claim plan still returns the real evidence claim verbatim, with no intro at all — unaffected by this change', () => {
    const { realizer } = freshStack();
    // VALID_SW_REQUEST pairs a real 2-claim plan with only 1 matching
    // real evidence record (same honest partial-evidence shape as
    // language-realizer.test.js's own Test A) — claim-2 is skipped,
    // claim-1's real evidence is used verbatim, with no intro composed
    // at all (composeClaims() only introduces when there is >1 piece).
    const result = realizer.realizeCandidateSentence(VALID_SW_REQUEST);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.candidate.text, 'ChurchOS organizes church work.');
});

/* ------------------------------------------------------------------ */
/* F: the intro mechanism itself never leaks anything beyond the name  */
/* ------------------------------------------------------------------ */

test('F: the entity-aware intro carries ONLY the entity name — never any other field, never raw internal data, even when a caller passes something unexpected', () => {
    const { realize } = freshStack();
    const weird = { toString: () => 'ShopOS', secret: 'internal-path/should-not-leak.js' };
    const text = realize.realize('semantic-answer:intro:HUMAN_BENEFIT', 'en', weird);
    assert.doesNotMatch(text, /should-not-leak|internal-path/, 'expected only the coerced entity label, never any other property of a non-string param');
});
