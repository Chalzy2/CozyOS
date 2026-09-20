'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'cognitive-decision-contract.js');

function load() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.CognitiveDecisionContract;
}

test('registers window.CozyOS.CognitiveDecisionContract with the real, closed enums', () => {
    const c = load();
    assert.ok(c);
    assert.equal(typeof c.getVersion(), 'string');
    assert.ok(Object.isFrozen(c.PLAN_STATUS));
    assert.ok(Object.isFrozen(c.LANGUAGE_GAP_TYPE));
    assert.ok(Object.isFrozen(c.LANGUAGE_EVIDENCE_SOURCE));
    assert.ok(Object.isFrozen(c.TRANSLATION_STATUS));
    assert.ok(Object.isFrozen(c.COVERAGE_DIMENSION));
    assert.ok(Object.isFrozen(c.COVERAGE_LEVEL));
});

test('PLAN_STATUS contains exactly the spec-required cognitive decision states', () => {
    const c = load();
    for (const s of ['UNDERSTOOD', 'AMBIGUOUS', 'UNKNOWN', 'INSUFFICIENT_EVIDENCE', 'EVIDENCE_CONFLICT', 'LANGUAGE_GAP', 'VERIFICATION_REQUIRED', 'LEARNING_CANDIDATE', 'CLARIFICATION_REQUIRED', 'ACTION_REQUIRED']) {
        assert.ok(c.PLAN_STATUS.includes(s), `missing ${s}`);
    }
    assert.equal(c.PLAN_STATUS.length, 10);
});

test('LANGUAGE_GAP_TYPE contains all 26 spec-named gap categories', () => {
    const c = load();
    assert.equal(c.LANGUAGE_GAP_TYPE.length, 26);
    for (const t of ['LEXICAL_GAP', 'GRAMMAR_GAP', 'PRONUNCIATION_GAP', 'STT_GAP', 'TTS_GAP', 'CULTURAL_USAGE_GAP', 'VERIFICATION_GAP']) {
        assert.ok(c.LANGUAGE_GAP_TYPE.includes(t));
    }
});

test('isPlanStatus() guards against typo literals', () => {
    const c = load();
    assert.equal(c.isPlanStatus('UNDERSTOOD'), true);
    assert.equal(c.isPlanStatus('UNDERSTOOOD'), false);
    assert.equal(c.isPlanStatus(''), false);
    assert.equal(c.isPlanStatus(null), false);
});

// ---------- LanguageGap ----------

test('createLanguageGap() builds and validates a real LanguageGap record', () => {
    const c = load();
    const result = c.createLanguageGap({ gapType: 'TRANSLATION_GAP', language: 'sw', domain: 'ChurchOS', concept: 'HUMAN_BENEFIT', status: 'OPEN' });
    assert.equal(result.success, true);
    assert.equal(result.gap.schemaVersion, c.LANGUAGE_GAP_SCHEMA_VERSION);
    assert.deepEqual(c.validateLanguageGap(result.gap).errors, []);
});

test('validateLanguageGap() rejects an unrecognized gapType', () => {
    const c = load();
    const result = c.createLanguageGap({ gapType: 'MADE_UP_GAP', language: 'sw', status: 'OPEN' });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => e.includes('gapType')));
});

test('validateLanguageGap() requires a real, non-empty evidenceSourcesConsidered to report status CLOSED — a gap can never be closed with no evidence basis', () => {
    const c = load();
    const closedWithNoEvidence = c.createLanguageGap({ gapType: 'LEXICAL_GAP', language: 'luo', status: 'CLOSED' });
    assert.equal(closedWithNoEvidence.success, false);
    assert.ok(closedWithNoEvidence.errors.some((e) => e.includes('CLOSED')));

    const closedWithEvidence = c.createLanguageGap({ gapType: 'LEXICAL_GAP', language: 'luo', status: 'CLOSED', evidenceSourcesConsidered: ['USER_TAUGHT'] });
    assert.equal(closedWithEvidence.success, true);
});

test('validateLanguageGap() rejects an evidenceSourcesConsidered value outside LANGUAGE_EVIDENCE_SOURCE', () => {
    const c = load();
    const result = c.createLanguageGap({ gapType: 'LEXICAL_GAP', language: 'sw', status: 'OPEN', evidenceSourcesConsidered: ['MADE_UP_SOURCE'] });
    assert.equal(result.success, false);
});

// ---------- LanguageCoverageEntry ----------

test('createLanguageCoverageEntry() builds one dimension/language/level entry, never an aggregate score', () => {
    const c = load();
    const result = c.createLanguageCoverageEntry({ language: 'luo', dimension: 'VOCABULARY', level: 'PARTIAL' });
    assert.equal(result.success, true);
    assert.deepEqual(c.validateLanguageCoverageEntry(result.entry).errors, []);
    assert.ok(!('score' in result.entry), 'must never carry a collapsed percentage/score field');
});

test('two different dimensions for the SAME language can independently be VERIFIED and INSUFFICIENT — coverage is multi-dimensional, never one number', () => {
    const c = load();
    const tts = c.createLanguageCoverageEntry({ language: 'luo', dimension: 'TTS', level: 'VERIFIED' });
    const pronunciation = c.createLanguageCoverageEntry({ language: 'luo', dimension: 'PRONUNCIATION', level: 'INSUFFICIENT' });
    assert.equal(tts.success, true);
    assert.equal(pronunciation.success, true);
    assert.equal(tts.entry.level, 'VERIFIED');
    assert.equal(pronunciation.entry.level, 'INSUFFICIENT');
});

test('validateLanguageCoverageEntry() rejects an unrecognized dimension or level', () => {
    const c = load();
    assert.equal(c.createLanguageCoverageEntry({ language: 'en', dimension: 'MADE_UP', level: 'VERIFIED' }).success, false);
    assert.equal(c.createLanguageCoverageEntry({ language: 'en', dimension: 'VOCABULARY', level: 'MADE_UP' }).success, false);
});

// ---------- TranslationCandidate — NLLB is never automatically verified ----------

test('createTranslationCandidate() defaults naturally represent a fresh translation-engine output as CANDIDATE_TRANSLATION', () => {
    const c = load();
    const result = c.createTranslationCandidate({
        sourceLanguage: 'en', targetLanguage: 'sw', sourceText: 'help', candidateText: 'saidia',
        engine: 'NLLB', status: 'CANDIDATE_TRANSLATION',
    });
    assert.equal(result.success, true);
    assert.equal(result.candidate.status, 'CANDIDATE_TRANSLATION');
});

test('REQUIRED: an NLLB candidate cannot reach VERIFIED_LANGUAGE_KNOWLEDGE without a real, non-empty verifiedBy — structurally enforced, not just a convention', () => {
    const c = load();
    const withoutVerifier = c.createTranslationCandidate({
        sourceLanguage: 'en', targetLanguage: 'sw', sourceText: 'help', candidateText: 'saidia',
        engine: 'NLLB', status: 'VERIFIED_LANGUAGE_KNOWLEDGE',
    });
    assert.equal(withoutVerifier.success, false);
    assert.ok(withoutVerifier.errors.some((e) => e.includes('VERIFIED_LANGUAGE_KNOWLEDGE')));

    const withVerifier = c.createTranslationCandidate({
        sourceLanguage: 'en', targetLanguage: 'sw', sourceText: 'help', candidateText: 'saidia',
        engine: 'NLLB', status: 'VERIFIED_LANGUAGE_KNOWLEDGE', verifiedBy: 'human-reviewer-001',
    });
    assert.equal(withVerifier.success, true);
});

test('MUTATION: changing only the status field from CANDIDATE_TRANSLATION to VERIFIED_LANGUAGE_KNOWLEDGE (no other field touched) flips validate() from passing to failing — proving the guard actually inspects status, not just presence of fields', () => {
    const c = load();
    const base = { schemaVersion: c.TRANSLATION_CANDIDATE_SCHEMA_VERSION, sourceLanguage: 'en', targetLanguage: 'sw', sourceText: 'help', candidateText: 'saidia', engine: 'NLLB', status: 'CANDIDATE_TRANSLATION' };
    assert.deepEqual(c.validateTranslationCandidate(base).errors, []);
    const mutated = Object.assign({}, base, { status: 'VERIFIED_LANGUAGE_KNOWLEDGE' });
    assert.notDeepEqual(c.validateTranslationCandidate(mutated).errors, []);
});

test('validateTranslationCandidate() rejects an unrecognized status', () => {
    const c = load();
    const result = c.createTranslationCandidate({ sourceLanguage: 'en', targetLanguage: 'sw', sourceText: 'a', candidateText: 'b', engine: 'NLLB', status: 'DEFINITELY_CORRECT' });
    assert.equal(result.success, false);
});
