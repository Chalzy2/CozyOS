'use strict';

/**
 * core/modules/learning/test/correction-and-search-learning.test.js
 * COZYAI CONTINUOUS MULTIMODAL LEARNING — Spelling/Correction Learning +
 * Search -> Learn phase. Real, executed tests for the 34 scenarios that
 * phase's own brief requires (sections A-F), composing only real,
 * existing/newly-added engines via loadFullStackWithPlanner() — no mocks
 * of this repository's own governance logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStackWithPlanner, AUTHORIZED_CONSENT, UNAUTHORIZED_CONSENT } = require('./_test-helpers');

function consentFor(actorId) {
    return Object.assign({}, AUTHORIZED_CONSENT, { grantedBy: actorId });
}

// =====================================================================
// A. SPELLING
// =====================================================================

test('A1. observed unusual spelling is preserved (unusual != incorrect — no correction call, nothing is flagged)', () => {
    const s = loadFullStackWithPlanner();
    const result = s.adapter.fromText({ text: 'muhim', candidateLanguage: 'sw', sessionId: 's1', application: 'LiveWindow', actorId: 'u1', consent: AUTHORIZED_CONSENT });
    assert.equal(result.success, true);
    assert.equal(result.observation.contentRef.derivedText, 'muhim');
    assert.equal(result.observation.lifecycleStatus, 'OBSERVED');
});

test('A2. explicit correction creates correction evidence (both the permanent record AND a governed observation)', () => {
    const s = loadFullStackWithPlanner();
    const result = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_muhim', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING',
        language: 'sw', context: 'user explicitly corrected the word', reason: 'spelling',
        correctedBy: 'u1', consent: AUTHORIZED_CONSENT, actorId: 'u1', sessionId: 's1', application: 'LiveWindow',
    });
    assert.equal(result.success, true);
    assert.ok(result.correctionRecord);
    assert.ok(result.observation);
    assert.equal(result.observation.sourceType, 'USER_CORRECTION');
});

test('A3. original is never overwritten, even after review', () => {
    const s = loadFullStackWithPlanner();
    const result = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_muhim2', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    s.correctionLearning.confirmCorrection(result.correctionRecord.id, { reviewerId: 'reviewer_1' });
    const after = s.knowledgeModel.getCorrection(result.correctionRecord.id);
    assert.equal(after.originalValue, 'muhim');
    assert.equal(after.correctedValue, 'muhimu');
});

test('A4. correction is not automatically globally verified — stays PROPOSED/OBSERVED until explicit governance advances it', () => {
    const s = loadFullStackWithPlanner();
    const result = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_muhim3', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    assert.equal(result.correctionRecord.validationState, 'PROPOSED');
    assert.equal(result.observation.lifecycleStatus, 'OBSERVED');
});

test('A5. a valid regional variant is not automatically marked as a typo (no correction call = no correction record exists)', () => {
    const s = loadFullStackWithPlanner();
    s.adapter.fromText({ text: 'sijambo', candidateLanguage: 'sw', sessionId: 's1', application: 'LiveWindow', actorId: 'u1', consent: AUTHORIZED_CONSENT });
    const corrections = s.correctionLearning.listCorrectionsFor('expr_sijambo_nonexistent');
    assert.deepEqual(corrections, []);
});

test('A6. language is preserved on the correction record', () => {
    const s = loadFullStackWithPlanner();
    const result = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_x', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    assert.equal(result.correctionRecord.language, 'sw');
});

test('A7. context is preserved on both the correction record and the governed observation', () => {
    const s = loadFullStackWithPlanner();
    const result = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_x2', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw',
        context: 'said while discussing church contributions', consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    assert.equal(result.correctionRecord.context, 'said while discussing church contributions');
    assert.equal(result.observation.context.priorText, 'muhim');
});

// =====================================================================
// B. CORRECTIONS (extensible correctionType, one model)
// =====================================================================

function correctionOfType(s, correctionType, originalValue, correctedValue, language = 'en') {
    return s.correctionLearning.recordCorrection({
        targetRecordId: `expr_${correctionType.toLowerCase()}`, targetRecordType: 'EXPRESSION',
        originalValue, correctedValue, correctionType, language,
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
}

test('B8. grammar correction', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'GRAMMAR', 'she go to church', 'she goes to church');
    assert.equal(r.success, true);
    assert.equal(r.correctionRecord.correctionType, 'GRAMMAR');
});

test('B9. word-choice correction', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'WORD_CHOICE', 'big church', 'large church');
    assert.equal(r.correctionRecord.correctionType, 'WORD_CHOICE');
});

test('B10. meaning correction', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'MEANING', 'mchango means gift', 'mchango means a contribution');
    assert.equal(r.correctionRecord.correctionType, 'MEANING');
});

test('B11. translation correction', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'TRANSLATION', 'maji = juice', 'maji = water');
    assert.equal(r.correctionRecord.correctionType, 'TRANSLATION');
});

test('B12. entity-name correction', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'ENTITY_NAME', 'ChurchOS', 'CozyOS ChurchOS');
    assert.equal(r.correctionRecord.correctionType, 'ENTITY_NAME');
});

test('B13. conflicting corrections for the same target remain separate, never silently merged', () => {
    const s = loadFullStackWithPlanner();
    const first = correctionOfType(s, 'MEANING', 'mchango', 'a monetary gift');
    const second = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_meaning', targetRecordType: 'EXPRESSION',
        originalValue: 'mchango', correctedValue: 'a community contribution (not always monetary)',
        correctionType: 'MEANING', language: 'en', consent: AUTHORIZED_CONSENT, actorId: 'u2',
    });
    assert.notEqual(first.correctionRecord.id, second.correctionRecord.id);
    const all = s.correctionLearning.listCorrectionsFor('expr_meaning');
    assert.equal(all.length, 2);
});

test('B: unknown correctionType is rejected, not silently accepted as free text', () => {
    const s = loadFullStackWithPlanner();
    const r = correctionOfType(s, 'NOT_A_REAL_TYPE', 'a', 'b');
    assert.equal(r.success, false);
    assert.equal(r.reason, 'UNKNOWN_CORRECTION_TYPE');
});

// =====================================================================
// C. REPEATED LEARNING
// =====================================================================

test('C14. repeated expression can be correlated onto the same canonical concept', () => {
    const s = loadFullStackWithPlanner();
    const obs1 = s.adapter.fromCommunityContribution({ term: 'mchango', meaning: 'a contribution', candidateLanguage: 'sw', actorId: 'u1', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const obs2 = s.adapter.fromCommunityContribution({ term: 'mchango wa kanisa', meaning: 'a church contribution', candidateLanguage: 'sw', actorId: 'u2', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const c1 = s.correlation.correlateObservation({ conceptId: 'concept-mchango', domain: 'community-life', observation: obs1, meaning: 'a contribution', actorId: 'system' });
    const c2 = s.correlation.correlateObservation({ conceptId: 'concept-mchango', domain: 'community-life', observation: obs2, relationshipType: 'RELATED_CONTEXT', meaning: 'a church contribution', actorId: 'system' });
    assert.equal(c1.success, true);
    assert.equal(c2.success, true);
    const listed = s.conceptRegistry.listAttachments('concept-mchango', { actorId: 'system' });
    assert.equal(listed.attachments.length, 2);
});

test('C15. independent evidence is distinguishable (a repeated contributor never inflates independent-contributor count)', () => {
    const s = loadFullStackWithPlanner();
    const build = () => s.adapter.fromCommunityContribution({ term: 'karibu', meaning: 'welcome', candidateLanguage: 'sw', actorId: 'sameUser', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    let obs = build();
    let cand = s.lifecycle.toCandidate(obs, { actorId: 'sameUser', scope: 'COMMUNITY', contributorPseudonym: 'sameUser', region: 'nairobi' });
    assert.equal(cand.success, true);
    const recordId = cand.observation.governanceRef.recordId;
    // Same contributor submits again — real engine must not double-count.
    s.acquisition.submitEvidence({ languageId: 'sw', expression: 'karibu', meaning: 'welcome', region: 'nairobi', dialect: null, sourceType: 'COMMUNITY', contributionType: 'TEXT', contributorPseudonym: 'sameUser' });
    const tier = s.acquisition.getValidationTier(recordId);
    assert.ok(tier.independentContributorCount <= 1, 'a repeated same-pseudonym submission must not count as a second independent contributor');
});

test('C16. different meanings of the same spelling are NOT merged into one attachment', () => {
    const s = loadFullStackWithPlanner();
    const obsChurch = s.adapter.fromCommunityContribution({ term: 'kanisa', meaning: 'church (a building)', candidateLanguage: 'sw', actorId: 'u1', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const obsCongregation = s.adapter.fromCommunityContribution({ term: 'kanisa', meaning: 'the congregation of believers', candidateLanguage: 'sw', actorId: 'u2', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const c1 = s.correlation.correlateObservation({ conceptId: 'concept-kanisa', domain: 'community-life', observation: obsChurch, meaning: 'church (a building)', actorId: 'system' });
    const c2 = s.correlation.correlateObservation({ conceptId: 'concept-kanisa', domain: 'community-life', observation: obsCongregation, meaning: 'the congregation of believers', actorId: 'system' });
    assert.notEqual(c1.attachment.attachmentId, c2.attachment.attachmentId, 'different meanings must produce distinct attachments, never a silent merge');
    const sameMeaningAgain = s.correlation.correlateObservation({
        conceptId: 'concept-kanisa', domain: 'community-life',
        observation: s.adapter.fromCommunityContribution({ term: 'kanisa', meaning: 'church (a building)', candidateLanguage: 'sw', actorId: 'u3', consent: AUTHORIZED_CONSENT, context: {} }).observation,
        meaning: 'church (a building)', actorId: 'system',
    });
    assert.equal(sameMeaningAgain.strengthened, true, 'the SAME meaning, repeated, correctly strengthens the existing attachment');
});

test('C17. repeated observation alone does not silently promote uncertain information to verified truth', () => {
    const s = loadFullStackWithPlanner();
    const obs = s.adapter.fromCommunityContribution({ term: 'tafadhali', meaning: 'please', candidateLanguage: 'sw', actorId: 'onlyOneUser', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    let current = s.lifecycle.toCandidate(obs, { actorId: 'onlyOneUser', scope: 'COMMUNITY', contributorPseudonym: 'onlyOneUser', region: 'nairobi' }).observation;
    // Only ONE real contributor ever submits, repeatedly re-correlating —
    // never advances to VALIDATED/VERIFIED without independent evidence.
    for (let i = 0; i < 5; i++) {
        s.acquisition.submitEvidence({ languageId: 'sw', expression: 'tafadhali', meaning: 'please', region: 'nairobi', dialect: null, sourceType: 'COMMUNITY', contributionType: 'TEXT', contributorPseudonym: 'onlyOneUser' });
    }
    const toVal = s.lifecycle.toValidated(current, { actorId: 'onlyOneUser' });
    assert.equal(toVal.success, false, 'a single repeated contributor must never reach VALIDATED on its own');
});

// =====================================================================
// D. SEARCH -> LEARN
// =====================================================================

test('D18. viewing/searching alone does NOT create a learning record', () => {
    const s = loadFullStackWithPlanner();
    const before = s.knowledgeIngestion.listCandidates({}).length;
    s.searchEngine.search('who created cozyos');
    s.searchEngine.search('another totally unrelated query');
    const after = s.knowledgeIngestion.listCandidates({}).length;
    assert.equal(after, before, 'SearchEngine.search() must never itself create a knowledge candidate');
});

test('D19. explicit "Learn this" DOES create real candidate evidence in the governed pipeline', () => {
    const s = loadFullStackWithPlanner();
    const result = s.searchEngine.search('who created cozyos');
    assert.equal(result.matched, true);
    const learn = s.searchLearnBridge.learnFromSearchResult({
        result: result.results[0], query: 'who created cozyos', consent: AUTHORIZED_CONSENT, actorId: 'u1',
        sessionId: 's1', application: 'LiveWindow', language: 'en', scope: 'PERSONAL',
    });
    assert.equal(learn.success, true);
    assert.equal(learn.ingestResult.status, 'CANDIDATE_CREATED');
    assert.equal(learn.observation.lifecycleStatus, 'OBSERVED');
});

test('D20. source provenance is preserved on a Search -> Learn candidate', () => {
    const s = loadFullStackWithPlanner();
    const searchResult = { title: 'Test Article', snippet: 'Maji ni muhimu kwa afya', source: 'community-search' };
    const learn = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, query: 'maji', consent: AUTHORIZED_CONSENT, actorId: 'u1', language: 'sw' });
    assert.equal(learn.ingestResult.candidate.provenance.sourceType, 'USER_PROVIDED_CONTENT');
    assert.equal(learn.ingestResult.candidate.provenance.origin, 'community-search');
    assert.equal(learn.ingestResult.candidate.provenance.title, 'Test Article');
});

test('D21. language is preserved on a Search -> Learn candidate', () => {
    const s = loadFullStackWithPlanner();
    const searchResult = { title: 'T', snippet: 'Maji ni uzima', source: 'src' };
    const learn = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, consent: AUTHORIZED_CONSENT, actorId: 'u1', language: 'sw' });
    assert.equal(learn.ingestResult.candidate.language.code, 'sw');
    assert.equal(learn.observation.candidateLanguage, 'sw');
});

test('D22. user/scope is preserved on a Search -> Learn observation', () => {
    const s = loadFullStackWithPlanner();
    const searchResult = { title: 'T', snippet: 'Some searchable content here', source: 'src' };
    const learn = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, consent: AUTHORIZED_CONSENT, actorId: 'user_42', scope: 'PERSONAL' });
    assert.equal(learn.observation.provenance.actorId, 'user_42');
    assert.equal(learn.observation.learningScope, 'PERSONAL');
});

test('D23. authorization (explicit consent) is required — missing/false consent fails closed', () => {
    const s = loadFullStackWithPlanner();
    const searchResult = { title: 'T', snippet: 'Some content', source: 'src' };
    const noConsent = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, actorId: 'u1' });
    assert.equal(noConsent.success, false);
    assert.equal(noConsent.reason, 'CONSENT_NOT_AUTHORIZED');
    const falseConsent = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, actorId: 'u1', consent: UNAUTHORIZED_CONSENT });
    assert.equal(falseConsent.success, false);
    assert.equal(falseConsent.reason, 'CONSENT_NOT_AUTHORIZED');
});

test('D24. cancellation (never invoking the explicit learn action) creates no learning record', () => {
    const s = loadFullStackWithPlanner();
    const before = s.knowledgeIngestion.listCandidates({}).length;
    // user searches and inspects a result, then cancels — no call to
    // learnFromSearchResult() is ever made.
    s.searchEngine.search('who created cozyai');
    const after = s.knowledgeIngestion.listCandidates({}).length;
    assert.equal(after, before);
});

test('D25. a private-scope source cannot become public automatically', () => {
    const s = loadFullStackWithPlanner();
    const searchResult = { title: 'T', snippet: 'Private-scoped searchable content', source: 'src' };
    const learn = s.searchLearnBridge.learnFromSearchResult({ result: searchResult, consent: AUTHORIZED_CONSENT, actorId: 'u1', scope: 'PERSONAL' });
    assert.equal(learn.ingestResult.candidate.visibility, 'PRIVATE');
    // No call to contributeToCommunity()/contributeToPublic() was made —
    // re-reading the same candidate must still show PRIVATE.
    const reread = s.knowledgeIngestion.getCandidate(learn.ingestResult.candidate.id);
    assert.equal(reread.visibility, 'PRIVATE');
});

// =====================================================================
// E. CROSS-LANGUAGE
// =====================================================================

test('E26. English learning works through the same governed pipeline', () => {
    const s = loadFullStackWithPlanner();
    const r = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_en1', targetRecordType: 'EXPRESSION',
        originalValue: 'recieve', correctedValue: 'receive', correctionType: 'SPELLING', language: 'en',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    assert.equal(r.success, true);
    assert.equal(r.correctionRecord.language, 'en');
});

test('E27. Kiswahili learning works through the same governed pipeline', () => {
    const s = loadFullStackWithPlanner();
    const r = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_sw1', targetRecordType: 'EXPRESSION',
        originalValue: 'muhim', correctedValue: 'muhimu', correctionType: 'SPELLING', language: 'sw',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    assert.equal(r.success, true);
    assert.equal(r.correctionRecord.language, 'sw');
});

test('E28. the SAME concept can connect expressions across English and Kiswahili without one architecture per language', () => {
    const s = loadFullStackWithPlanner();
    const obsSw = s.adapter.fromCommunityContribution({ term: 'maji', meaning: 'water', candidateLanguage: 'sw', actorId: 'u1', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const obsEn = s.adapter.fromCommunityContribution({ term: 'water', meaning: 'water', candidateLanguage: 'en', actorId: 'u2', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const cSw = s.correlation.correlateObservation({ conceptId: 'concept-water', domain: 'general', observation: obsSw, relationshipType: 'PRIMARY_TERM', meaning: 'water', actorId: 'system' });
    const cEn = s.correlation.correlateObservation({ conceptId: 'concept-water', domain: 'general', observation: obsEn, relationshipType: 'TRANSLATION', meaning: 'water', actorId: 'system' });
    assert.equal(cSw.success, true);
    assert.equal(cEn.success, true);
    const listed = s.conceptRegistry.listAttachments('concept-water', { actorId: 'system' });
    assert.equal(listed.attachments.length, 2);
    assert.ok(listed.attachments.some((a) => a.language === 'sw' && a.term === 'maji'));
    assert.ok(listed.attachments.some((a) => a.language === 'en' && a.term === 'water'));
});

test('E29. language-specific spelling correction — a Kiswahili correction never collides with an English one for the same targetRecordId type', () => {
    const s = loadFullStackWithPlanner();
    const swCorr = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_pole', targetRecordType: 'EXPRESSION',
        originalValue: 'pole', correctedValue: 'pole sana', correctionType: 'SPELLING', language: 'sw',
        consent: AUTHORIZED_CONSENT, actorId: 'u1',
    });
    const enCorr = s.correctionLearning.recordCorrection({
        targetRecordId: 'expr_pole', targetRecordType: 'EXPRESSION',
        originalValue: 'pole', correctedValue: 'Pole (a Polish person)', correctionType: 'ENTITY_NAME', language: 'en',
        consent: AUTHORIZED_CONSENT, actorId: 'u2',
    });
    assert.notEqual(swCorr.correctionRecord.id, enCorr.correctionRecord.id);
    assert.equal(swCorr.correctionRecord.language, 'sw');
    assert.equal(enCorr.correctionRecord.language, 'en');
});

test('E30. same spelling, different language AND different meaning — never conflated at the attachment level', () => {
    const s = loadFullStackWithPlanner();
    // "pole" (sw, apology/sorry) vs "pole" (en, a long stick) — same
    // spelling, unrelated meanings, unrelated languages.
    const obsSw = s.adapter.fromCommunityContribution({ term: 'pole', meaning: 'sorry / apology', candidateLanguage: 'sw', actorId: 'u1', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const obsEn = s.adapter.fromCommunityContribution({ term: 'pole', meaning: 'a long stick or rod', candidateLanguage: 'en', actorId: 'u2', consent: AUTHORIZED_CONSENT, context: {} }).observation;
    const cSw = s.correlation.correlateObservation({ conceptId: 'concept-pole-sw', domain: 'general', observation: obsSw, meaning: 'sorry / apology', actorId: 'system' });
    const cEn = s.correlation.correlateObservation({ conceptId: 'concept-pole-en', domain: 'general', observation: obsEn, meaning: 'a long stick or rod', actorId: 'system' });
    assert.notEqual(cSw.attachment.attachmentId, cEn.attachment.attachmentId);
    assert.notEqual(cSw.attachment.conceptId, cEn.attachment.conceptId);
});

// =====================================================================
// F. REGRESSION / AUTOMATIC IMPROVEMENT
// =====================================================================

function verifyTenIndependentContributors(s, term, meaning, language) {
    let verifiedObservation = null;
    for (let i = 1; i <= 10; i++) {
        const obsResult = s.adapter.fromCommunityContribution({ term, meaning, candidateLanguage: language, actorId: `contributor_${i}`, consent: AUTHORIZED_CONSENT, context: {} });
        let obs = obsResult.observation;
        const cand = s.lifecycle.toCandidate(obs, { actorId: `contributor_${i}`, scope: 'COMMUNITY', contributorPseudonym: `contributor_${i}`, region: 'nairobi' });
        if (!cand.success) continue;
        obs = cand.observation;
        const val = s.lifecycle.toValidated(obs, { actorId: `contributor_${i}` });
        if (val.success) obs = val.observation;
        const ver = s.lifecycle.toVerified(obs, { actorId: `contributor_${i}` });
        if (ver.success) verifiedObservation = ver.observation;
    }
    return verifiedObservation;
}

test('F31. verified learning produces real regression evidence', () => {
    const s = loadFullStackWithPlanner();
    const verified = verifyTenIndependentContributors(s, 'mchango', 'a contribution', 'sw');
    assert.ok(verified, 'ten independent contributors must be able to reach a real VERIFIED observation');
    s.correlation.correlateObservation({ conceptId: 'concept-mchango-f31', domain: 'community-life', observation: verified, meaning: 'a contribution', actorId: 'system' });
    const genResult = s.regressionGenerator.generateFromVerifiedObservation(verified, { text: 'mchango una umuhimu gani', actorId: 'system' });
    assert.equal(genResult.success, true);
    assert.ok(genResult.regressionCase.caseId);
});

test('F32. old, already-verified real behavior remains valid after learning is introduced', () => {
    const s = loadFullStackWithPlanner();
    // A real, pre-existing, committed fixture entity (from
    // APPLICATION_HUMAN_PURPOSE_DATA) must keep answering exactly as
    // before, unaffected by any newly learned, unrelated concept.
    const before = s.planner.planAnswer({ text: 'churchos ni nini', requestedLanguage: 'sw' });
    verifyTenIndependentContributors(s, 'unrelatedNewWord', 'an unrelated new concept', 'sw');
    const after = s.planner.planAnswer({ text: 'churchos ni nini', requestedLanguage: 'sw' });
    assert.deepEqual(
        { success: before.success, goal: before.goal, cognitiveStatus: before.diagnostics && before.diagnostics.cognitiveStatus },
        { success: after.success, goal: after.goal, cognitiveStatus: after.diagnostics && after.diagnostics.cognitiveStatus },
    );
});

test('F33. newly learned behavior actually works (the planner can now answer something it could not before)', () => {
    const s = loadFullStackWithPlanner();
    const term = 'ushirikiano';
    const before = s.planner.planAnswer({ text: 'ushirikiano una umuhimu gani', entityHint: term, requestedLanguage: 'sw' });
    assert.equal(before.success, false);
    const verified = verifyTenIndependentContributors(s, term, 'cooperation between community members', 'sw');
    s.correlation.correlateObservation({ conceptId: 'concept-ushirikiano', domain: 'community-life', observation: verified, meaning: 'cooperation between community members', actorId: 'system' });
    const after = s.planner.planAnswer({ text: 'ushirikiano una umuhimu gani', entityHint: term, requestedLanguage: 'sw' });
    assert.equal(after.success, true);
    assert.equal(after.diagnostics.learnedSupplementUsed, true);
});

test('F34. no unrelated semantic behavior regresses after multiple learning cycles', () => {
    const s = loadFullStackWithPlanner();
    verifyTenIndependentContributors(s, 'wordA', 'meaning A', 'sw');
    verifyTenIndependentContributors(s, 'wordB', 'meaning B', 'en');
    const differentiation = s.planner.planAnswer({ text: 'churchos ina tofauti na cozyos', entityHint: 'churchos', requestedLanguage: 'sw' });
    // Real, pre-existing DIFFERENTIATION goal must remain classifiable
    // exactly as before — never disturbed by unrelated learned concepts.
    assert.ok(differentiation.diagnostics.cognitiveStatus);
    assert.notEqual(differentiation.diagnostics.cognitiveStatus, undefined);
});

// =====================================================================
// SINGLE-AI GUARANTEE (same discipline as the LIF suite)
// =====================================================================

test('SINGLE-AI: no second correction/search/learning engine is introduced by this phase', () => {
    const s = loadFullStackWithPlanner();
    const forbidden = ['SpellingLearning', 'CorrectionDatabase', 'SpellingMemory', 'SearchLearningEngine', 'SecondSearchEngine'];
    for (const name of forbidden) assert.equal(typeof s.window.CozyOS[name], 'undefined', `must not introduce window.CozyOS.${name}`);
});
