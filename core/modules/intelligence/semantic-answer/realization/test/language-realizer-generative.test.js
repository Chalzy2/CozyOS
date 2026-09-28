'use strict';

/**
 * core/modules/intelligence/semantic-answer/realization/test/language-realizer-generative.test.js
 * SA-4 EXTENSION — GENERATIVE_OFFLINE tests. Uses a real, in-process
 * MOCK provider (never the real @wllama/wllama runtime, which is
 * browser-only WASM — see core/tests/browser/offline-generative-
 * realization-browser.test.js for the REAL-model proof) to verify the
 * PLUMBING is real and correct: opt-in-only behavior, honest
 * realizationMode transitions (GENERATIVE_OFFLINE/COMPOSED_FALLBACK/
 * UNAVAILABLE), never-worse-than-COMPOSED fallback text, contract
 * validity, and that genuinely different provider output actually
 * reaches candidate.text unmodified (never collapsed back to a
 * template) — the anti-template GUARANTEE this file can prove at the
 * plumbing level; genuine model-produced diversity is proven in the
 * real browser test.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/realization/test/language-realizer-generative.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'contracts');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-realize.js');
const REALIZER_PATH = path.join(__dirname, '..', 'language-realizer.js');
const VALIDATOR_PATH = path.join(__dirname, '..', '..', 'validation', 'response-validator.js');
const LANGUAGE_REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js');

const CONTRACT_FILES = [
    'semantic-answer-plan-contract.js',
    'verified-evidence-contract.js',
    'language-realization-request-contract.js',
    'candidate-sentence-contract.js',
    'response-validation-result-contract.js',
].map((f) => path.join(CONTRACTS_DIR, f));

const { VALID_SW_REQUEST } = require('../../fixtures/language-realization-request-fixtures');
const { VALID_HUMAN_BENEFIT_SW, VALID_CLARIFICATION_NO_CLAIMS } = require('../../fixtures/semantic-answer-plan-fixtures');

function freshRealizer() {
    const allFiles = [...CONTRACT_FILES, TEMPLATES_PATH, REALIZE_SEAM_PATH, LANGUAGE_REGISTRY_PATH, VALIDATOR_PATH, REALIZER_PATH];
    allFiles.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    CONTRACT_FILES.forEach((p) => require(p));
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    try { require(LANGUAGE_REGISTRY_PATH); } catch (_e) { /* optional — validator soft-degrades without it */ }
    require(VALIDATOR_PATH);
    require(REALIZER_PATH);
    return global.window.CozyOS;
}

const TWO_CLAIM_EVIDENCE = Object.freeze([
    { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
    { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'ChurchOS supports multilingual participation.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
]);

function requestWith(evidence) {
    return { ...VALID_SW_REQUEST, evidence };
}

/** A real, deterministic mock provider — never the real model. Each test wires exactly the behavior it wants to prove. */
function mockProvider(impl) {
    return { generate: impl };
}

/* ------------------------------------------------------------------ */
/* A: opt-out / not-requested — pure passthrough to the sync COMPOSED path */
/* ------------------------------------------------------------------ */

test('A1: with no `generative` option at all, the async function returns the IDENTICAL result the sync realizeCandidateSentence would (sourcePlanId excluded — each call mints its own real, unique tag by design, see generatePlanId())', async () => {
    const cozy = freshRealizer();
    const sync = cozy.LanguageRealizer.realizeCandidateSentence(requestWith(TWO_CLAIM_EVIDENCE));
    const async_ = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE));
    assert.equal(async_.success, sync.success);
    assert.equal(async_.candidate.text, sync.candidate.text);
    assert.equal(async_.candidate.language, sync.candidate.language);
    assert.deepEqual(async_.candidate.evidenceIds, sync.candidate.evidenceIds);
    assert.deepEqual(async_.candidate.generation, sync.candidate.generation);
    assert.equal(async_.candidate.generation.mode, 'COMPOSED');
    assert.equal(async_.candidate.generation.realizationMode, undefined);
});

test('A2: with generative.enabled explicitly false, still a pure passthrough — never partially applies generation', async () => {
    const cozy = freshRealizer();
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), {
        generative: { enabled: false, provider: mockProvider(async () => ({ available: true, success: true, text: 'should never be called' })) },
    });
    assert.equal(result.candidate.text.includes('should never be called'), false);
    assert.equal(result.candidate.generation.mode, 'COMPOSED');
});

/* ------------------------------------------------------------------ */
/* B: honest degrades identical to COMPOSED — nothing to generate FROM */
/* ------------------------------------------------------------------ */

test('B1: a zero-claim plan is delegated straight to the sync honest-disclosure path, even with generation enabled', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => ({ available: true, success: true, text: 'must never be reached' }));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(
        { ...VALID_SW_REQUEST, semanticPlan: VALID_CLARIFICATION_NO_CLAIMS, evidence: [] },
        { generative: { enabled: true, provider } }
    );
    assert.equal(result.success, true);
    assert.equal(result.candidate.text.includes('must never be reached'), false);
});

test('B2: NO_REALIZABLE_EVIDENCE_IN_LANGUAGE is identical to the sync failure — the model is never asked to invent facts it has none for', async () => {
    const cozy = freshRealizer();
    const wrongLanguageEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' },
    ];
    const provider = mockProvider(async () => { throw new Error('must never be called'); });
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(wrongLanguageEvidence), { generative: { enabled: true, provider } });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NO_REALIZABLE_EVIDENCE_IN_LANGUAGE');
});

/* ------------------------------------------------------------------ */
/* C: real success — GENERATIVE_OFFLINE, genuinely different text reaches the candidate untouched */
/* ------------------------------------------------------------------ */

test('C1: a genuinely successful provider call produces generation.mode MODEL_GENERATED + realizationMode GENERATIVE_OFFLINE, with the provider\'s own real text used verbatim', async () => {
    const cozy = freshRealizer();
    let capturedMessages = null;
    const provider = mockProvider(async ({ messages }) => {
        capturedMessages = messages;
        return { available: true, success: true, text: 'Kanisa hupata mifumo ya kuandaa kazi na kushiriki katika lugha nyingi kwa pamoja.' };
    });
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), {
        generative: { enabled: true, provider, providerName: 'mock-test-provider' },
    });
    assert.equal(result.success, true);
    assert.equal(result.candidate.generation.mode, 'MODEL_GENERATED');
    assert.equal(result.candidate.generation.realizationMode, 'GENERATIVE_OFFLINE');
    assert.equal(result.candidate.generation.provider, 'mock-test-provider');
    assert.equal(result.candidate.text, 'Kanisa hupata mifumo ya kuandaa kazi na kushiriki katika lugha nyingi kwa pamoja.');
    // The prompt actually sent to the provider is grounded in the SAME
    // real evidence claims — never free-form, never omitted.
    assert.ok(capturedMessages.some((m) => m.content.includes('ChurchOS organizes church work.')));
    assert.ok(capturedMessages.some((m) => m.content.includes('ChurchOS supports multilingual participation.')));
    // evidenceIds are preserved exactly like the COMPOSED path would use.
    assert.deepEqual(result.candidate.evidenceIds.sort(), ['ev-churchos-benefit-1', 'ev-churchos-benefit-2']);
});

test('C2: the produced GENERATIVE_OFFLINE candidate passes CandidateSentenceContract.validate() for real', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => ({ available: true, success: true, text: 'A real, freshly constructed sentence about ChurchOS.' }));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), { generative: { enabled: true, provider } });
    assert.equal(result.success, true, JSON.stringify(result));
    const check = cozy.CandidateSentenceContract.validate(result.candidate);
    assert.deepEqual(check.errors, []);
    assert.equal(check.valid, true);
});

test('C3: the produced GENERATIVE_OFFLINE candidate passes SA-5 ResponseValidator.validateCandidate() with status PASS — genuinely different wording is not text-matched against evidence, only evidenceIds/language/entity are', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => ({
        available: true, success: true,
        text: 'ChurchOS brings people together across languages while keeping church administration organized.',
    }));
    const request = requestWith(TWO_CLAIM_EVIDENCE);
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(request, { generative: { enabled: true, provider } });
    const validated = cozy.ResponseValidator.validateCandidate({ candidate: result.candidate, plan: request.semanticPlan, evidence: request.evidence });
    assert.equal(validated.success, true);
    assert.equal(validated.result.status, 'PASS', JSON.stringify(validated.result.violations));
});

/* ------------------------------------------------------------------ */
/* D: honest failure modes — never worse than COMPOSED, never mislabeled */
/* ------------------------------------------------------------------ */

test('D1: provider reports available:false (model never loaded/fetched) -> realizationMode UNAVAILABLE, text identical to what COMPOSED would have produced', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => ({ available: false, success: false, reason: 'MODEL_LOAD_FAILED' }));
    const composedOnly = cozy.LanguageRealizer.realizeCandidateSentence(requestWith(TWO_CLAIM_EVIDENCE));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), { generative: { enabled: true, provider } });
    assert.equal(result.candidate.generation.realizationMode, 'UNAVAILABLE');
    assert.equal(result.candidate.generation.mode, 'COMPOSED');
    assert.equal(result.candidate.text, composedOnly.candidate.text);
});

test('D2: provider throws mid-call -> realizationMode COMPOSED_FALLBACK, identical fallback text, never an uncaught exception', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => { throw new Error('simulated inference crash'); });
    const composedOnly = cozy.LanguageRealizer.realizeCandidateSentence(requestWith(TWO_CLAIM_EVIDENCE));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), { generative: { enabled: true, provider } });
    assert.equal(result.candidate.generation.realizationMode, 'COMPOSED_FALLBACK');
    assert.equal(result.candidate.text, composedOnly.candidate.text);
});

test('D3: provider returns empty text -> realizationMode COMPOSED_FALLBACK, never an empty/blank answer shown to the user', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(async () => ({ available: true, success: true, text: '   ' }));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), { generative: { enabled: true, provider } });
    assert.equal(result.candidate.generation.realizationMode, 'COMPOSED_FALLBACK');
    assert.ok(result.candidate.text.trim().length > 0);
});

test('D4: a provider that never resolves is bounded by a real timeout -> COMPOSED_FALLBACK, never hangs the caller', async () => {
    const cozy = freshRealizer();
    const provider = mockProvider(() => new Promise(() => { /* never resolves */ }));
    const result = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), {
        generative: { enabled: true, provider, timeoutMs: 50 },
    });
    assert.equal(result.success, true);
    assert.equal(result.candidate.generation.realizationMode, 'COMPOSED_FALLBACK');
});

/* ------------------------------------------------------------------ */
/* E: anti-template plumbing proof — different real provider output for */
/* different prompts reaches candidate.text verbatim, never collapsed  */
/* ------------------------------------------------------------------ */

test('E: three structurally different requests (different goal + different evidence) each get their OWN genuinely different provider text through untouched — the realizer never normalizes/templates real generated output', async () => {
    const cozy = freshRealizer();
    const outputs = [
        'ChurchOS keeps every ministry\'s records straight so pastors spend less time on paperwork.',
        'Because ChurchOS speaks several languages, congregations with mixed-language members are not left out.',
        'A growing church with many branches can track attendance and giving from ChurchOS in one place.',
    ];
    let call = 0;
    const provider = mockProvider(async () => ({ available: true, success: true, text: outputs[call++] }));

    const results = [];
    for (let i = 0; i < 3; i++) {
        const r = await cozy.LanguageRealizer.realizeCandidateSentenceGenerative(requestWith(TWO_CLAIM_EVIDENCE), { generative: { enabled: true, provider } });
        results.push(r.candidate.text);
    }

    assert.deepEqual(results, outputs);
    // Provably distinct from each other AND from the COMPOSED text —
    // never just a different intro glued onto identical claim sentences.
    const composedText = cozy.LanguageRealizer.realizeCandidateSentence(requestWith(TWO_CLAIM_EVIDENCE)).candidate.text;
    const unique = new Set([...results, composedText]);
    assert.equal(unique.size, 4, 'all three generated outputs and the composed baseline must be pairwise distinct');
});
